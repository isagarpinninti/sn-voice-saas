from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from voice_engine.connectors.auth import AuthHeaderProvider
from voice_engine.connectors.credentials import StaticCredentialResolver
from voice_engine.connectors.executor import ToolExecutionError, ToolExecutor
from voice_engine.redaction.anonymizer import PIIAnonymizer
from voice_engine.redaction.detector import PIIDetector
from voice_engine.redaction.session_map import InMemoryRehydrationStore

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "packages" / "connector-schema" / "fixtures"


def load_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES_DIR / name).read_text())


HALO_CONNECTOR = {
    "base_url": "https://tenant.haloitsm.com",
    "auth": {
        "type": "oauth2_client_credentials",
        "token_url": "https://tenant.haloitsm.com/auth/token",
        "credential_ref": "vault:halo-connector:default",
    },
}

SERVICENOW_CONNECTOR = {
    "base_url": "https://tenant.service-now.com",
    "auth": {
        "type": "oauth2_client_credentials",
        "token_url": "https://tenant.service-now.com/oauth_token.do",
        "credential_ref": "vault:sn-connector:default",
    },
}


@pytest.fixture
def anonymizer() -> PIIAnonymizer:
    return PIIAnonymizer(detector=PIIDetector(), store=InMemoryRehydrationStore())


@pytest.fixture
async def http_client():
    async with httpx.AsyncClient() as client:
        yield client


@pytest.fixture
def executor(anonymizer: PIIAnonymizer, http_client: httpx.AsyncClient) -> ToolExecutor:
    resolver = StaticCredentialResolver(
        {
            "vault:halo-connector:default": {"client_id": "halo-id", "client_secret": "halo-secret"},
            "vault:sn-connector:default": {"client_id": "sn-id", "client_secret": "sn-secret"},
            "vault:api-key-connector:default": "static-api-key-value",
            # Matches valid-servicenow-create-incident.json's auth_override.credential_ref —
            # that fixture deliberately uses per-tool auth distinct from the connector's,
            # to exercise the auth_override path specifically (see M3's schema comment).
            "vault:9f2c1a10-0000-4000-8000-000000000002:default": {
                "client_id": "sn-tool-override-id",
                "client_secret": "sn-tool-override-secret",
            },
        }
    )
    auth_provider = AuthHeaderProvider(credential_resolver=resolver, http_client=http_client)
    return ToolExecutor(auth_provider=auth_provider, anonymizer=anonymizer, http_client=http_client)


@respx.mock
async def test_halo_create_ticket_end_to_end(executor: ToolExecutor) -> None:
    tool = load_fixture("valid-halo-create-ticket.json")

    respx.post("https://tenant.haloitsm.com/auth/token").mock(
        return_value=httpx.Response(200, json={"access_token": "tok-123", "expires_in": 3600})
    )
    ticket_route = respx.post("https://tenant.haloitsm.com/api/Tickets").mock(
        return_value=httpx.Response(200, json=[{"id": 42, "status": "open"}])
    )

    result = await executor.execute(
        HALO_CONNECTOR,
        tool,
        {"summary": "Printer is on fire", "details": "Literally on fire", "urgency": "high"},
        session_id="session-1",
    )

    assert result == "Ticket #42 created."
    sent_body = json.loads(ticket_route.calls.last.request.content)
    assert sent_body["summary"] == "Printer is on fire"
    assert sent_body["tickettype_id"] == 1  # from body_template
    assert ticket_route.calls.last.request.headers["Authorization"] == "Bearer tok-123"


@respx.mock
async def test_servicenow_create_incident_end_to_end(executor: ToolExecutor) -> None:
    tool = load_fixture("valid-servicenow-create-incident.json")

    # This fixture sets its own auth_override (see M3's schema comment on
    # ConnectorToolSchema.auth_override) pointing at a different token
    # endpoint than the connector's own auth — mocking that override's real
    # URL, not the connector's, is the point of this test.
    respx.post("https://example.service-now.com/oauth_token.do").mock(
        return_value=httpx.Response(200, json={"access_token": "sn-tok", "expires_in": 3600})
    )
    respx.post("https://tenant.service-now.com/api/x_vcon/voiceagent/incidents").mock(
        return_value=httpx.Response(200, json={"result": {"number": "INC0012345"}})
    )

    result = await executor.execute(
        SERVICENOW_CONNECTOR,
        tool,
        {"short_description": "VPN is down", "urgency": "2"},
        session_id="session-1",
    )

    assert result == "Incident INC0012345 created."


@respx.mock
async def test_oauth_token_is_cached_across_calls(executor: ToolExecutor) -> None:
    tool = load_fixture("valid-halo-create-ticket.json")

    token_route = respx.post("https://tenant.haloitsm.com/auth/token").mock(
        return_value=httpx.Response(200, json={"access_token": "tok-abc", "expires_in": 3600})
    )
    respx.post("https://tenant.haloitsm.com/api/Tickets").mock(
        return_value=httpx.Response(200, json=[{"id": 1}])
    )

    await executor.execute(HALO_CONNECTOR, tool, {"summary": "a", "details": "b"}, "session-1")
    await executor.execute(HALO_CONNECTOR, tool, {"summary": "c", "details": "d"}, "session-1")

    assert token_route.call_count == 1, "second call should reuse the cached token"


@respx.mock
async def test_401_triggers_single_token_refresh_and_retry(executor: ToolExecutor) -> None:
    tool = load_fixture("valid-halo-create-ticket.json")

    respx.post("https://tenant.haloitsm.com/auth/token").mock(
        side_effect=[
            httpx.Response(200, json={"access_token": "stale-tok", "expires_in": 3600}),
            httpx.Response(200, json={"access_token": "fresh-tok", "expires_in": 3600}),
        ]
    )
    respx.post("https://tenant.haloitsm.com/api/Tickets").mock(
        side_effect=[
            httpx.Response(401, json={"error": "expired"}),
            httpx.Response(200, json=[{"id": 7}]),
        ]
    )

    result = await executor.execute(HALO_CONNECTOR, tool, {"summary": "a", "details": "b"}, "session-1")
    assert result == "Ticket #7 created."


@respx.mock
async def test_api_key_auth_injects_configured_header(
    anonymizer: PIIAnonymizer, http_client: httpx.AsyncClient
) -> None:
    resolver = StaticCredentialResolver({"vault:api-key-connector:default": "static-api-key-value"})
    auth_provider = AuthHeaderProvider(credential_resolver=resolver, http_client=http_client)
    executor = ToolExecutor(auth_provider=auth_provider, anonymizer=anonymizer, http_client=http_client)

    connector = {
        "base_url": "https://api.example.com",
        "auth": {
            "type": "api_key",
            "header_name": "X-Api-Key",
            "credential_ref": "vault:api-key-connector:default",
        },
    }
    tool = {
        "name": "search_kb",
        "method": "GET",
        "path_template": "/kb",
        "params": [{"name": "query", "location": "query", "type": "string", "required": True}],
        "response_mapping": {"success_path": "count", "template": "Found {result} results.", "error_template": "Search failed ({status})."},
    }

    route = respx.get("https://api.example.com/kb").mock(return_value=httpx.Response(200, json={"count": 3}))

    result = await executor.execute(connector, tool, {"query": "vpn"}, "session-1")

    assert result == "Found 3 results."
    assert route.calls.last.request.headers["X-Api-Key"] == "static-api-key-value"
    assert route.calls.last.request.url.params["query"] == "vpn"


@respx.mock
async def test_path_param_is_substituted_into_url(executor: ToolExecutor) -> None:
    tool = {
        "name": "get_ticket_status",
        "method": "GET",
        "path_template": "/api/Tickets/{ticket_id}",
        "params": [{"name": "ticket_id", "location": "path", "type": "string", "required": True}],
        "response_mapping": {"success_path": "status", "template": "Status: {result}", "error_template": "err ({status})"},
    }
    respx.post("https://tenant.haloitsm.com/auth/token").mock(
        return_value=httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
    )
    respx.get("https://tenant.haloitsm.com/api/Tickets/42").mock(
        return_value=httpx.Response(200, json={"status": "open"})
    )

    result = await executor.execute(HALO_CONNECTOR, tool, {"ticket_id": "42"}, "session-1")
    assert result == "Status: open"


@respx.mock
async def test_pii_placeholder_is_rehydrated_before_the_outgoing_request(
    executor: ToolExecutor, anonymizer: PIIAnonymizer
) -> None:
    tool = {
        "name": "add_note",
        "method": "POST",
        "path_template": "/api/Actions",
        "params": [{"name": "note", "location": "body", "type": "string", "required": True}],
        "response_mapping": {"success_path": "id", "template": "Noted.", "error_template": "err ({status})"},
    }
    # Simulate what already happened upstream: the caller said their email,
    # PIIRedactionProcessor redacted it in the transcript, and the LLM's tool
    # call argument therefore contains the placeholder, not the real value.
    placeholder = anonymizer.redact("session-1", "contact me at real.user@example.com")
    assert "[EMAIL_ADDRESS_1]" in placeholder

    respx.post("https://tenant.haloitsm.com/auth/token").mock(
        return_value=httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
    )
    note_route = respx.post("https://tenant.haloitsm.com/api/Actions").mock(
        return_value=httpx.Response(200, json={"id": 1})
    )

    await executor.execute(HALO_CONNECTOR, tool, {"note": placeholder}, "session-1")

    sent_body = json.loads(note_route.calls.last.request.content)
    assert "real.user@example.com" in sent_body["note"], "real value must reach the backend"
    assert "[EMAIL_ADDRESS_1]" not in sent_body["note"]


@respx.mock
async def test_response_containing_pii_is_redacted_before_returning_to_the_llm(executor: ToolExecutor) -> None:
    tool = {
        "name": "get_ticket_status",
        "method": "GET",
        "path_template": "/api/Tickets/{ticket_id}",
        "params": [{"name": "ticket_id", "location": "path", "type": "string", "required": True}],
        "response_mapping": {
            "success_path": "reporter_email",
            "template": "Reported by {result}.",
            "error_template": "err ({status})",
        },
    }
    respx.post("https://tenant.haloitsm.com/auth/token").mock(
        return_value=httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
    )
    respx.get("https://tenant.haloitsm.com/api/Tickets/9").mock(
        return_value=httpx.Response(200, json={"reporter_email": "leaked.person@example.com"})
    )

    result = await executor.execute(HALO_CONNECTOR, tool, {"ticket_id": "9"}, "session-1")

    assert "leaked.person@example.com" not in result
    assert "[EMAIL_ADDRESS_1]" in result


@respx.mock
async def test_timeout_renders_error_template(executor: ToolExecutor) -> None:
    tool = load_fixture("valid-halo-create-ticket.json")
    respx.post("https://tenant.haloitsm.com/auth/token").mock(
        return_value=httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
    )
    respx.post("https://tenant.haloitsm.com/api/Tickets").mock(side_effect=httpx.TimeoutException("timed out"))

    result = await executor.execute(HALO_CONNECTOR, tool, {"summary": "a", "details": "b"}, "session-1")
    assert result == "Sorry, I couldn't create that ticket (timeout)."


@respx.mock
async def test_server_error_renders_error_template_with_status(executor: ToolExecutor) -> None:
    tool = load_fixture("valid-halo-create-ticket.json")
    respx.post("https://tenant.haloitsm.com/auth/token").mock(
        return_value=httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
    )
    respx.post("https://tenant.haloitsm.com/api/Tickets").mock(return_value=httpx.Response(500, json={}))

    result = await executor.execute(HALO_CONNECTOR, tool, {"summary": "a", "details": "b"}, "session-1")
    assert result == "Sorry, I couldn't create that ticket (500)."


@respx.mock
async def test_basic_auth_injects_authorization_header(
    anonymizer: PIIAnonymizer, http_client: httpx.AsyncClient
) -> None:
    """basic_auth is the M3 addition (ZeVox's ServiceNow Table API needs it,
    connector-schema previously only had none/api_key/oauth2_client_credentials).
    """
    resolver = StaticCredentialResolver(
        {"local:9f2c1a10-0000-4000-8000-000000000003": {"username": "sn_svc_account", "password": "sn_password123"}}
    )
    auth_provider = AuthHeaderProvider(credential_resolver=resolver, http_client=http_client)
    executor = ToolExecutor(auth_provider=auth_provider, anonymizer=anonymizer, http_client=http_client)

    tool = load_fixture("valid-servicenow-table-api-basic-auth.json")
    connector = {
        "base_url": "https://tenant.service-now.com",
        "auth": {"type": "none"},  # tool's auth_override takes precedence
    }

    route = respx.post("https://tenant.service-now.com/api/now/table/incident").mock(
        return_value=httpx.Response(200, json={"result": {"number": "INC0099999"}})
    )

    result = await executor.execute(connector, tool, {"short_description": "VPN is down"}, session_id="session-1")

    assert result == "Incident INC0099999 created."
    expected = base64.b64encode(b"sn_svc_account:sn_password123").decode()
    assert route.calls.last.request.headers["Authorization"] == f"Basic {expected}"


async def test_missing_required_param_raises(executor: ToolExecutor) -> None:
    tool = load_fixture("valid-halo-create-ticket.json")
    with pytest.raises(ToolExecutionError):
        await executor.execute(HALO_CONNECTOR, tool, {"summary": "only summary, no details"}, "session-1")
