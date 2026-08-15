"""Fetches the connectors/tools an agent has enabled, shaped exactly as
connectors/executor.py and connectors/litellm_tools.py expect. Called once
per call, alongside fetch_agent_config().

agent_connectors.enabled_tools semantics: empty array = every enabled tool on
that connector is available (the common case — the control-plane UI today
only has a whole-connector toggle); a non-empty array restricts to just those
tool names, for when per-tool selection lands in the UI later.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from voice_engine.config.db import get_pool


@dataclass
class ConnectorToolBundle:
    connector: dict[str, Any]
    tool: dict[str, Any]


async def fetch_enabled_connector_tools(agent_id: str) -> list[ConnectorToolBundle]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            select c.id as connector_id, c.base_url, c.auth_config,
                   ac.enabled_tools,
                   ct.id as tool_id, ct.name, ct.description, ct.method, ct.path_template,
                   ct.params, ct.body_template, ct.auth_override, ct.response_mapping, ct.timeout_ms
            from agent_connectors ac
            join connectors c on c.id = ac.connector_id
            join connector_tools ct on ct.connector_id = c.id
            where ac.agent_id = $1 and ct.enabled = true
            order by c.id, ct.name
            """,
            agent_id,
        )

    bundles: list[ConnectorToolBundle] = []
    for row in rows:
        enabled_tools = row["enabled_tools"] or []
        if enabled_tools and row["name"] not in enabled_tools:
            continue

        connector = {
            "id": str(row["connector_id"]),
            "base_url": row["base_url"],
            "auth": _as_dict(row["auth_config"]),
        }
        auth_override = _as_dict(row["auth_override"]) if row["auth_override"] else None
        tool = {
            "id": str(row["tool_id"]),
            "name": row["name"],
            "description": row["description"],
            "method": row["method"],
            "path_template": row["path_template"],
            "params": _as_list(row["params"]),
            "body_template": _as_dict(row["body_template"]) if row["body_template"] else None,
            "auth_override": auth_override,
            "response_mapping": _as_dict(row["response_mapping"]),
            "timeout_ms": row["timeout_ms"],
            "enabled": True,
        }
        bundles.append(ConnectorToolBundle(connector=connector, tool=tool))

    return bundles


def _as_dict(value: Any) -> dict[str, Any]:
    return json.loads(value) if isinstance(value, str) else value


def _as_list(value: Any) -> list[Any]:
    return json.loads(value) if isinstance(value, str) else value
