"""LiveKit webhook receiver + bot dispatcher for phone calls (VoiceConnect
merge — LiveKit phone path). Runs as its own process (see docker-compose's
`voice-engine-livekit` service), separate from server.py's WebRTC widget
path — different transport, different FastAPI app, sharing the same pipeline
code (pipeline.py's run_bot).

Flow: a caller dials a ZeVox phone number -> Twilio (as a plain SIP trunk,
not Media Streams) forwards the call over SIP to self-hosted livekit-sip ->
a LiveKit SIP dispatch rule (registered by ZeVox — see
src/lib/livekit-sip.ts) creates a room named `phone-{agentId}-{callId}` and
puts the caller in it -> LiveKit server POSTs a `participant_joined` webhook
here -> we read the SIP caller/callee numbers off the participant's
attributes, run the same plan-gate/allowlist-gate/audit-log check
/api/phone/incoming used to do (see config/call_gate_zevox.py — LiveKit SIP
calls never touch the Next.js app at call-setup time, so it has to happen
here instead) -> on approval, resolve the Agent from the room name and join
as a Pipecat bot via LiveKitTransport, running the exact same pipeline the
widget uses (self-hosted STT/TTS, PII redaction, generic connectors). On
rejection, the room is torn down (which hangs up the caller) without ever
dispatching a bot.

No Twilio SDK, no Twilio Media Streams, and no Deepgram anywhere in this
path — those only remain on the legacy widget WS path (pipeline.ts/server.ts
on the ZeVox side), which is untouched and still serves not-yet-migrated
tenants.

Known gap: the old Twilio path threaded matched-caller identity (name/email/
snUserSysId) into the pipeline for personalization and ServiceNow-user
impersonation. That context is resolved here (see CallAuthorization.caller)
and logged, but not yet threaded into build_pipeline's system prompt/tool
context — same category of gap as the widget's missing navigate/
attachment_requested data-channel, not silently dropped, just not wired yet.
"""

from __future__ import annotations

import asyncio
import os
import uuid

from fastapi import FastAPI, Request, Response
from fastapi.responses import PlainTextResponse
from livekit import api as lk_api
from livekit.protocol.models import ParticipantInfo
from loguru import logger

from pipecat.runner.livekit import generate_token_with_agent
from pipecat.runner.types import LiveKitRunnerArguments
from pipecat.transports.livekit.transport import LiveKitParams, LiveKitTransport

from voice_engine.config.agent_config_zevox import AgentNotFoundError, fetch_agent_config
from voice_engine.config.call_gate_zevox import authorize_call
from voice_engine.pipeline import run_bot

LIVEKIT_URL = os.environ["LIVEKIT_URL"]
LIVEKIT_API_KEY = os.environ["LIVEKIT_API_KEY"]
LIVEKIT_API_SECRET = os.environ["LIVEKIT_API_SECRET"]

ROOM_PREFIX = "phone"

app = FastAPI()
_webhook_receiver = lk_api.WebhookReceiver(lk_api.TokenVerifier(LIVEKIT_API_KEY, LIVEKIT_API_SECRET))

# LiveKitAPI opens an aiohttp session that needs a running event loop, so it
# can't be constructed at import time — built lazily on first use instead.
_lk_api_client: lk_api.LiveKitAPI | None = None


def _get_lk_api() -> lk_api.LiveKitAPI:
    global _lk_api_client
    if _lk_api_client is None:
        _lk_api_client = lk_api.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    return _lk_api_client

# Guards against duplicate bot dispatch if LiveKit retries a webhook
# delivery (it retries on any non-2xx response), and against re-authorizing
# on every subsequent participant_joined in the same room (the bot itself
# joining, an agent transfer, etc). Not persisted — correct for one process
# per room-lifetime, matches call_sessions' own single-voice-engine-process
# assumption (see config/call_sessions.py).
_dispatched_rooms: set[str] = set()


def room_name_for(agent_id: str) -> str:
    """`agentId` must not itself contain '-' at a position that breaks
    parse_agent_id_from_room's split — cuids don't, so this is safe.
    """
    return f"{ROOM_PREFIX}-{agent_id}-{uuid.uuid4()}"


def parse_agent_id_from_room(room_name: str) -> str | None:
    parts = room_name.split("-", 2)
    if len(parts) < 3 or parts[0] != ROOM_PREFIX:
        return None
    return parts[1]


@app.post("/livekit/webhook")
async def livekit_webhook(request: Request) -> Response:
    body = await request.body()
    auth_header = request.headers.get("Authorization", "")
    try:
        event = _webhook_receiver.receive(body.decode("utf-8"), auth_header)
    except Exception as e:
        logger.warning(f"Rejected LiveKit webhook (bad signature): {e}")
        return PlainTextResponse("invalid signature", status_code=401)

    if event.event == "participant_joined" and event.room is not None and event.participant is not None:
        room_name = event.room.name
        participant = event.participant

        if room_name in _dispatched_rooms:
            return PlainTextResponse("ok")

        if participant.kind != ParticipantInfo.Kind.SIP:
            # Not the inbound caller (e.g. our own bot joining moments
            # later) — ignore. The caller is always the first participant
            # in a fresh SIP-dispatched room.
            return PlainTextResponse("ok")

        agent_id = parse_agent_id_from_room(room_name)
        if not agent_id:
            logger.debug(f"Ignoring room with unrecognized name: {room_name!r}")
            return PlainTextResponse("ok")

        _dispatched_rooms.add(room_name)
        to_e164 = participant.attributes.get("sip.trunkPhoneNumber", "")
        from_e164 = participant.attributes.get("sip.phoneNumber", "")
        call_id = participant.attributes.get("sip.callID") or event.id
        asyncio.create_task(_authorize_and_run(room_name, agent_id, to_e164, from_e164, call_id))

    return PlainTextResponse("ok")


async def _authorize_and_run(room_name: str, agent_id: str, to_e164: str, from_e164: str, call_id: str) -> None:
    authz = await authorize_call(to_e164, from_e164, call_id)
    if not authz.allowed:
        logger.warning(
            f"Phone call rejected room={room_name!r} to={to_e164!r} from={from_e164!r} reason={authz.reason!r} — hanging up"
        )
        try:
            await _get_lk_api().room.delete_room(lk_api.DeleteRoomRequest(room=room_name))
        except Exception as e:
            logger.error(f"Failed to tear down rejected call room={room_name!r}: {e}")
        _dispatched_rooms.discard(room_name)
        return

    if authz.caller:
        logger.info(f"Call room={room_name!r} matched allowlisted caller={authz.caller.name!r}")

    await _join_and_run(room_name, agent_id)


async def _join_and_run(room_name: str, agent_id: str) -> None:
    try:
        agent_config = await fetch_agent_config(agent_id)
    except AgentNotFoundError:
        logger.warning(f"Phone call for unknown/inactive agent={agent_id!r}, room={room_name!r} — not joining")
        _dispatched_rooms.discard(room_name)
        return

    call_session_id = str(uuid.uuid4())
    token = generate_token_with_agent(room_name, "ZeVox Agent", LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    runner_args = LiveKitRunnerArguments(room_name=room_name, url=LIVEKIT_URL, token=token)

    transport = LiveKitTransport(
        url=LIVEKIT_URL,
        token=token,
        room_name=room_name,
        params=LiveKitParams(audio_in_enabled=True, audio_out_enabled=True),
    )

    logger.info(f"Joining room={room_name!r} for agent={agent_config.name!r}, session={call_session_id}")
    try:
        await run_bot(transport, runner_args, agent_config, call_session_id=call_session_id)
    finally:
        _dispatched_rooms.discard(room_name)


@app.get("/healthz")
async def healthz() -> Response:
    return PlainTextResponse("ok")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=7861)
