"""Maps a connector_tools row (see packages/connector-schema) into an
OpenAI-style function-calling tool definition, the format LiteLLM's
`completion(tools=...)` expects regardless of which provider is behind it.

header-location params are never exposed to the LLM (there's no legitimate
case for the model to supply an auth header — that's handled by `auth`), so
they're filtered out here the same way packages/connector-schema's
`llmVisibleParams()` does on the TS side.
"""

from __future__ import annotations

from typing import Any

_PARAM_TYPE_TO_JSON_SCHEMA_TYPE = {
    "string": "string",
    "number": "number",
    "boolean": "boolean",
    "enum": "string",
}


def tool_json_schema_properties(tool: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Shared by this module (raw OpenAI-dict preview/validation) and
    pipecat_tools.py (live FunctionSchema registration) — one place defining
    how a connector_tools row's params map to JSON Schema properties.
    """
    properties: dict[str, Any] = {}
    required: list[str] = []

    for param in tool.get("params", []):
        if param["location"] == "header":
            continue

        schema: dict[str, Any] = {"type": _PARAM_TYPE_TO_JSON_SCHEMA_TYPE[param["type"]]}
        if param.get("description"):
            schema["description"] = param["description"]
        if param["type"] == "enum":
            schema["enum"] = param["enum_values"]

        properties[param["name"]] = schema
        if param.get("required"):
            required.append(param["name"])

    return properties, required


def connector_tool_to_llm_function(tool: dict[str, Any]) -> dict[str, Any]:
    properties, required = tool_json_schema_properties(tool)

    return {
        "type": "function",
        "function": {
            "name": tool["name"],
            "description": tool["description"],
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        },
    }


def connector_tools_to_llm_functions(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [connector_tool_to_llm_function(t) for t in tools if t.get("enabled", True)]
