"""ZeVox variant of config/agent_config.py — fetches an agent's voice-engine
config from ZeVox's Prisma-managed Postgres instead of VoiceConnect's own
Supabase schema.

Keyed by ZeVox's internal Agent.id (a cuid), not a public_agent_id — ZeVox
has no such widget-exposed identifier concept yet. The caller (ZeVox's
session-token route, see M6) already resolves agent_id server-side from the
incoming ApiToken before minting a call ticket, the same way its existing
/gateway/init route does today.

"Agent" is unmapped (@@map wasn't applied — it's a live table under active
migrations, see M1), so its columns are Postgres-default-cased and must be
double-quoted here.
"""

from __future__ import annotations

from dataclasses import dataclass

from voice_engine.config.db import get_pool

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful voice assistant. Your responses will be spoken aloud, "
    "so avoid emojis, bullet points, or any formatting that can't be spoken. "
    "Keep responses brief and conversational."
)
DEFAULT_LLM_MODEL = "zevox-mock"
DEFAULT_VOICE_ID = "af_heart"  # Kokoro voice name, no "kokoro:" prefix stored on ZeVox's Agent


class AgentNotFoundError(Exception):
    pass


@dataclass
class ZeVoxAgentConfig:
    id: str
    tenant_id: str
    name: str
    voice_id: str
    system_prompt: str
    llm_model: str


async def fetch_agent_config(agent_id: str) -> ZeVoxAgentConfig:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            select id, "tenantId", name, "systemPrompt", "llmModel", "voiceId", active
            from "Agent"
            where id = $1
            """,
            agent_id,
        )

    if row is None or not row["active"]:
        raise AgentNotFoundError(agent_id)

    return ZeVoxAgentConfig(
        id=row["id"],
        tenant_id=row["tenantId"],
        name=row["name"],
        voice_id=row["voiceId"] or DEFAULT_VOICE_ID,
        system_prompt=row["systemPrompt"] or DEFAULT_SYSTEM_PROMPT,
        llm_model=row["llmModel"] or DEFAULT_LLM_MODEL,
    )
