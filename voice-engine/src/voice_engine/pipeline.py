"""voice-engine pipeline: STT -> redact -> LLM (via LiteLLM proxy, with real
connector tool-calling) -> TTS, fully self-hosted except the LLM call
itself, which always goes through the LiteLLM proxy — never a provider SDK
directly — so BYOK is a config change, not a code change.

ZeVox fork: forked verbatim from VoiceConnect's own voice-engine, with two
changes from the original — AgentConfig comes from config.agent_config_zevox
(ZeVox's Prisma "Agent" table) instead of config.agent_config, and the
connector-credential resolver is ZeVoxEncryptedCredentialResolver (decrypts
ConnectorCredential.ciphertext, written by ZeVox's own Node encrypt.ts)
instead of PostgresCredentialResolver (Supabase Vault). Everything else —
redaction, tool execution, LiteLLM routing — is unchanged.

When called with an AgentConfig (a real widget connection, see server.py),
the system prompt/voice/model/connector-tools all come from Postgres.
Without one (raw /client dev testing, no ZeVox app involved), env-var
defaults apply and no tools are attached.
"""

from __future__ import annotations

import asyncio
import os
import uuid

import httpx
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.audio.vad_processor import VADProcessor
from pipecat.runner.types import RunnerArguments
from pipecat.services.kokoro.tts import KokoroTTSService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.whisper.stt import WhisperSTTService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.workers.runner import WorkerRunner

from voice_engine.config.agent_config_zevox import DEFAULT_LLM_MODEL, DEFAULT_SYSTEM_PROMPT, ZeVoxAgentConfig as AgentConfig
from voice_engine.config.call_sessions import insert_call_session, update_call_session, utcnow
from voice_engine.config.connectors_config import fetch_enabled_connector_tools
from voice_engine.connectors.auth import AuthHeaderProvider
from voice_engine.connectors.zevox_credentials import ZeVoxEncryptedCredentialResolver
from voice_engine.connectors.executor import ToolExecutor
from voice_engine.connectors.pipecat_tools import build_function_schemas
from voice_engine.redaction.anonymizer import PIIAnonymizer
from voice_engine.redaction.detector import PIIDetector
from voice_engine.redaction.processor import PIIRedactionProcessor
from voice_engine.redaction.session_map import InMemoryRehydrationStore

# Process-wide: PIIDetector's underlying analyzer is itself cached (see
# detector.py), and PIIAnonymizer's placeholder state is already keyed per
# session_id, so one shared instance across calls is correct, not a leak risk.
_pii_anonymizer = PIIAnonymizer(detector=PIIDetector(), store=InMemoryRehydrationStore())

LITELLM_BASE_URL = os.environ.get("LITELLM_BASE_URL", "http://127.0.0.1:4000")
LITELLM_API_KEY = os.environ.get("LITELLM_MASTER_KEY", "sk-zevox-local-dev")

# Must match ZeVox's Node encrypt.ts getKey() fallback chain exactly (see
# src/lib/encrypt.ts and voice_engine/connectors/zevox_crypto.py) — this is
# what decrypts ConnectorCredential.ciphertext rows.
ZEVOX_CREDENTIAL_SECRET = (
    os.environ.get("ENCRYPTION_KEY") or os.environ.get("NEXTAUTH_SECRET") or "fallback-dev-key-do-not-use-in-prod"
)

# "webrtc" is the only transport Phase 1 needs (see docs/decisions/0001-webrtc-transport.md
# for why SmallWebRTCTransport over LiveKit for now) — kept as a dict, matching Pipecat's
# own convention, so adding "twilio"/"daily" later (Phase 2 phone support) is additive.
transport_params = {
    "webrtc": lambda: TransportParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
    ),
}


async def build_pipeline(
    transport: BaseTransport,
    session_id: str,
    agent_config: AgentConfig | None,
    http_client: httpx.AsyncClient,
) -> tuple[Pipeline, LLMContext, list[dict]]:
    system_prompt = agent_config.system_prompt if agent_config else DEFAULT_SYSTEM_PROMPT
    llm_model = agent_config.llm_model if agent_config else os.environ.get("LITELLM_MODEL", DEFAULT_LLM_MODEL)
    voice_id = agent_config.voice_id if agent_config else "af_heart"
    tool_call_log: list[dict] = []

    # WhisperSTTService is a SegmentedSTTService: it only runs transcription on
    # VADUserStartedSpeakingFrame/VADUserStoppedSpeakingFrame boundaries, which
    # nothing emits unless a VAD stage sits upstream of it in the pipeline —
    # TransportParams no longer has a vad_analyzer field in this Pipecat version.
    vad = VADProcessor(vad_analyzer=SileroVADAnalyzer())
    stt = WhisperSTTService(
        model="small.en",
        device="cpu",
        compute_type="int8",
    )
    redact = PIIRedactionProcessor(anonymizer=_pii_anonymizer, session_id=session_id)

    llm = OpenAILLMService(
        api_key=LITELLM_API_KEY,
        base_url=f"{LITELLM_BASE_URL}/v1",
        settings=OpenAILLMService.Settings(model=llm_model),
    )
    tts = KokoroTTSService(voice_id=voice_id)

    context_kwargs: dict = {"messages": [{"role": "system", "content": system_prompt}]}
    if agent_config:
        bundles = await fetch_enabled_connector_tools(agent_config.id)
        if bundles:
            logger.info(f"Loaded {len(bundles)} connector tool(s) for agent={agent_config.name!r}")
            auth_provider = AuthHeaderProvider(
                credential_resolver=ZeVoxEncryptedCredentialResolver(raw_secret=ZEVOX_CREDENTIAL_SECRET),
                http_client=http_client,
            )
            executor = ToolExecutor(auth_provider=auth_provider, anonymizer=_pii_anonymizer, http_client=http_client)
            context_kwargs["tools"] = build_function_schemas(bundles, executor, session_id, tool_call_log)

    context = LLMContext(**context_kwargs)
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            vad,
            stt,
            redact,  # final transcripts are redacted before they ever enter LLM context
            user_aggregator,
            llm,
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )
    return pipeline, context, tool_call_log


# How often the in-progress transcript/tool-call trace is synced to Postgres
# while a call is live — this is what powers the testing playground's
# near-real-time view (see config/call_sessions.py); not meant for sub-second
# streaming, see docs/decisions on the widget having no data channel yet.
CALL_SESSION_SYNC_INTERVAL_SECS = 3


async def run_bot(
    transport: BaseTransport,
    runner_args: RunnerArguments,
    agent_config: AgentConfig | None = None,
    call_session_id: str | None = None,
) -> None:
    session_id = call_session_id or str(uuid.uuid4())
    label = agent_config.name if agent_config else "(dev default)"
    logger.info(f"Starting voice-engine bot for agent={label!r}, session={session_id}")

    # Persistence only makes sense for a real ticketed connection: agent_config
    # carries the agents.id needed to satisfy call_sessions.agent_id's FK, and
    # the ticket-less /client dev path has neither an agent row nor a
    # call_session_id, so it's skipped entirely rather than worked around.
    persist_session = agent_config is not None and call_session_id is not None

    http_client = httpx.AsyncClient()
    pipeline, context, tool_call_log = await build_pipeline(transport, session_id, agent_config, http_client)
    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(enable_metrics=True),
        idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
    )

    sync_task: asyncio.Task | None = None

    async def _sync_loop() -> None:
        while True:
            await asyncio.sleep(CALL_SESSION_SYNC_INTERVAL_SECS)
            await update_call_session(
                session_id, transcript=context.messages, tool_calls=tool_call_log, status="active"
            )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client) -> None:
        nonlocal sync_task
        logger.info("Client connected")
        if persist_session:
            await insert_call_session(session_id, agent_config.id)
            sync_task = asyncio.create_task(_sync_loop())
        context.add_message({"role": "user", "content": "Please briefly introduce yourself."})
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client) -> None:
        logger.info("Client disconnected")
        if sync_task is not None:
            sync_task.cancel()
        if persist_session:
            await update_call_session(
                session_id,
                transcript=context.messages,
                tool_calls=tool_call_log,
                status="completed",
                ended_at=utcnow(),
            )
        _pii_anonymizer.forget_session(session_id)
        await http_client.aclose()
        await worker.cancel()

    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)
    await runner.add_workers(worker)
    await runner.run()
