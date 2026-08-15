"""voice-engine entrypoint, run via Pipecat's own CLI runner:

    uv run python -m voice_engine.server

ZeVox fork (see M7/M9 of the merge plan at
/Users/sagarpinninti/.claude/plans/jolly-yawning-twilight.md): forked
verbatim from VoiceConnect's own voice-engine, with exactly one change from
the original — agent config comes from config.agent_config_zevox (ZeVox's
Prisma "Agent" table) instead of config.agent_config (VoiceConnect's own
Supabase agents table). Everything else, including the session-ticket
verification below, is unchanged and proven compatible (see M6's cross-language
JWT round-trip test).

Two ways a connection reaches `bot()`:
1. The real widget flow: the client POSTs `request_data: {session_ticket}`
   alongside its WebRTC offer (ZeVox mints that ticket — see
   src/app/api/public/session-token/route.ts). We verify it, resolve the
   agent, and load its live config from Postgres.
2. Raw dev testing via the Pipecat prebuilt UI at /client, with no ticket —
   falls back to env-var defaults, so that loop still works without ZeVox's
   Next.js app running at all.
"""

from __future__ import annotations

from dotenv import load_dotenv
from loguru import logger

from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport

from voice_engine.auth.session_ticket import InvalidSessionTicketError, verify_session_ticket
from voice_engine.config.agent_config_zevox import AgentNotFoundError, fetch_agent_config
from voice_engine.pipeline import run_bot, transport_params

load_dotenv(override=True)


async def bot(runner_args: RunnerArguments) -> None:
    agent_config = None
    call_session_id = None

    body = runner_args.body if isinstance(runner_args.body, dict) else {}
    session_ticket = body.get("session_ticket")

    if session_ticket:
        try:
            claims = verify_session_ticket(session_ticket)
            agent_config = await fetch_agent_config(claims["agent_id"])
            call_session_id = claims.get("call_session_id")
        except InvalidSessionTicketError as e:
            logger.warning(f"Rejected connection: {e}")
            return
        except AgentNotFoundError as e:
            logger.warning(f"Rejected connection: agent not found or inactive ({e})")
            return

    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args, agent_config, call_session_id=call_session_id)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
