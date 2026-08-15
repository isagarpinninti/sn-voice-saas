"""Validates the exact same fixtures the TS package tests
(packages/connector-schema/src/schema.test.ts) against the synced JSON Schema,
so the two languages can never silently drift on what a valid connector tool is.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from voice_engine.connectors.schema import validate_connector_tool, ConnectorToolValidationError

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "packages" / "connector-schema" / "fixtures"


def _fixture_files(prefix: str) -> list[Path]:
    files = sorted(FIXTURES_DIR.glob(f"{prefix}*.json"))
    assert files, f"expected at least one fixture matching {prefix}*.json in {FIXTURES_DIR}"
    return files


@pytest.mark.parametrize("fixture_path", _fixture_files("valid-"), ids=lambda p: p.name)
def test_valid_fixtures_pass(fixture_path: Path) -> None:
    data = json.loads(fixture_path.read_text())
    validate_connector_tool(data)  # should not raise


@pytest.mark.parametrize("fixture_path", _fixture_files("invalid-"), ids=lambda p: p.name)
def test_invalid_fixtures_fail(fixture_path: Path) -> None:
    data = json.loads(fixture_path.read_text())
    with pytest.raises(ConnectorToolValidationError):
        validate_connector_tool(data)
