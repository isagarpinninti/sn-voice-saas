"""Turns an agent's enabled connector tools into Pipecat FunctionSchema
objects with real handlers wired to M7's ToolExecutor — this is what makes
tool-calling live in the voice pipeline. Reuses the same param->JSON-Schema
mapping as litellm_tools.py (the preview/validation path used by the
control-plane UI) so the two can never quietly disagree on a tool's shape.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from loguru import logger
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.services.llm_service import FunctionCallParams

from voice_engine.config.connectors_config import ConnectorToolBundle
from voice_engine.connectors.executor import ToolExecutor
from voice_engine.connectors.litellm_tools import tool_json_schema_properties


def build_function_schemas(
    bundles: list[ConnectorToolBundle],
    executor: ToolExecutor,
    session_id: str,
    tool_call_log: list[dict[str, Any]] | None = None,
) -> list[FunctionSchema]:
    schemas: list[FunctionSchema] = []

    for bundle in bundles:
        properties, required = tool_json_schema_properties(bundle.tool)
        schemas.append(
            FunctionSchema(
                name=bundle.tool["name"],
                description=bundle.tool["description"],
                properties=properties,
                required=required,
                handler=_make_handler(executor, bundle.connector, bundle.tool, session_id, tool_call_log),
            )
        )

    return schemas


def _make_handler(
    executor: ToolExecutor,
    connector: dict[str, Any],
    tool: dict[str, Any],
    session_id: str,
    tool_call_log: list[dict[str, Any]] | None,
):
    async def handler(params: FunctionCallParams) -> None:
        arguments = dict(params.arguments)
        logger.info(f"[tool_call] {tool['name']!r} args={arguments!r}")
        result = await executor.execute(connector, tool, arguments, session_id)
        if tool_call_log is not None:
            tool_call_log.append(
                {
                    "tool_name": tool["name"],
                    "arguments": arguments,
                    "result": result,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
        await params.result_callback(result)

    return handler
