"""Validates connector-tool config rows against the JSON Schema generated from
the TypeScript source of truth (packages/connector-schema/src/index.ts).

This module must never redefine the shape by hand — voice_engine/resources/
tool-connector.schema.json is a synced copy, kept identical to the TS package
via `pnpm schema:sync` (checked in CI, see packages/connector-schema/scripts/sync-schema.mjs).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import jsonschema

_SCHEMA_PATH = Path(__file__).resolve().parents[3] / "resources" / "tool-connector.schema.json"


class ConnectorToolValidationError(ValueError):
    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("; ".join(errors))


@lru_cache(maxsize=1)
def _load_schema() -> dict[str, Any]:
    if not _SCHEMA_PATH.exists():
        raise FileNotFoundError(
            f"{_SCHEMA_PATH} is missing — run `pnpm schema:sync` from the repo root "
            "to generate it from packages/connector-schema before starting voice-engine."
        )
    return json.loads(_SCHEMA_PATH.read_text())


def validate_connector_tool(data: dict[str, Any]) -> None:
    """Raises ConnectorToolValidationError if `data` doesn't match the shared schema."""
    validator = jsonschema.Draft7Validator(_load_schema())
    errors = sorted(validator.iter_errors(data), key=lambda e: e.path)
    if errors:
        raise ConnectorToolValidationError(
            [f"{'.'.join(str(p) for p in e.path) or '<root>'}: {e.message}" for e in errors]
        )


def is_valid_connector_tool(data: dict[str, Any]) -> bool:
    try:
        validate_connector_tool(data)
        return True
    except ConnectorToolValidationError:
        return False
