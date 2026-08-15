from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from voice_engine.connectors.litellm_tools import (
    connector_tool_to_llm_function,
    connector_tools_to_llm_functions,
)

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "packages" / "connector-schema" / "fixtures"


def load_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES_DIR / name).read_text())


def test_halo_tool_converts_to_valid_openai_function_shape() -> None:
    tool = load_fixture("valid-halo-create-ticket.json")
    fn = connector_tool_to_llm_function(tool)

    assert fn["type"] == "function"
    assert fn["function"]["name"] == "halo_create_ticket"
    props = fn["function"]["parameters"]["properties"]
    assert set(props.keys()) == {"summary", "details", "urgency"}
    assert props["urgency"]["enum"] == ["low", "medium", "high"]
    assert fn["function"]["parameters"]["required"] == ["summary", "details"]


def test_header_location_params_are_excluded_from_llm_schema() -> None:
    tool = {
        "name": "example_tool",
        "description": "d",
        "params": [
            {"name": "q", "location": "query", "type": "string", "required": True},
            {"name": "x-api-key", "location": "header", "type": "string", "required": True},
        ],
    }
    fn = connector_tool_to_llm_function(tool)
    assert set(fn["function"]["parameters"]["properties"].keys()) == {"q"}
    assert "x-api-key" not in fn["function"]["parameters"]["required"]


def test_disabled_tools_are_excluded_from_the_batch_conversion() -> None:
    enabled_tool = load_fixture("valid-halo-create-ticket.json")
    disabled_tool = {**load_fixture("valid-servicenow-create-incident.json"), "enabled": False}

    functions = connector_tools_to_llm_functions([enabled_tool, disabled_tool])

    assert len(functions) == 1
    assert functions[0]["function"]["name"] == "halo_create_ticket"


def test_enum_param_type_maps_to_json_schema_string_with_enum_values() -> None:
    tool = load_fixture("valid-servicenow-create-incident.json")
    fn = connector_tool_to_llm_function(tool)
    urgency = fn["function"]["parameters"]["properties"]["urgency"]
    assert urgency["type"] == "string"
    assert urgency["enum"] == ["1", "2", "3"]
