"""Shared asyncpg pool for everything voice-engine reads from Postgres via
the narrow `voice_engine_role` (see M2 migration) — agent config, connector
tools, and credential decryption all share one pool rather than each opening
their own.
"""

from __future__ import annotations

import os

import asyncpg

VOICE_ENGINE_DB_URL = os.environ.get(
    "VOICE_ENGINE_DB_URL",
    "postgresql://voice_engine_role:localdev_only_password@127.0.0.1:54322/postgres",
)

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(dsn=VOICE_ENGINE_DB_URL, min_size=1, max_size=5)
    return _pool
