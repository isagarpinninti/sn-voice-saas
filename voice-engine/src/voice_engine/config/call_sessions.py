"""Persists call_sessions rows via the narrow `voice_engine_role` (see M2
migration, which already grants it select/insert/update + a permissive
policy on this table). A session-write failure must never crash or block
the call itself, so every function here swallows its own errors and logs.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from loguru import logger

from voice_engine.config.db import get_pool


async def insert_call_session(session_id: str, agent_id: str) -> None:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "insert into call_sessions (id, agent_id) values ($1, $2)",
                session_id,
                agent_id,
            )
    except Exception:
        logger.exception(f"Failed to insert call_sessions row for session={session_id}")


async def update_call_session(
    session_id: str,
    *,
    transcript: list[dict[str, Any]],
    tool_calls: list[dict[str, Any]],
    status: str,
    ended_at: datetime | None = None,
) -> None:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                update call_sessions
                set transcript_redacted = $2, tool_calls = $3, status = $4, ended_at = $5
                where id = $1
                """,
                session_id,
                json.dumps(transcript, default=str),
                json.dumps(tool_calls, default=str),
                status,
                ended_at,
            )
    except Exception:
        logger.exception(f"Failed to update call_sessions row for session={session_id}")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
