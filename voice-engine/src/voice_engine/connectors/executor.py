"""Executes a connector tool call: validates args, rehydrates any PII
placeholders the LLM echoed back, renders the HTTP request, resolves auth,
calls the backend, and extracts a tool-role message from the response.

This is the ONLY place a rehydrated (real) PII value is allowed to exist —
it's substituted back in right before the outgoing HTTP call and never
re-enters LLM context (see PIIRedactionProcessor, which re-redacts whatever
this returns before it's appended back to conversation history).

Deliberately backend-agnostic: nothing here branches on `platform` — a Halo
tool and a ServiceNow tool run through the exact same code path, which is the
whole point of the shared connector-tool schema (M3).
"""

from __future__ import annotations

from typing import Any

import httpx
import jmespath
from loguru import logger

from voice_engine.connectors.auth import AuthHeaderProvider
from voice_engine.redaction.anonymizer import PIIAnonymizer


class ToolExecutionError(RuntimeError):
    """Raised only for malformed tool configs (bugs), never for ordinary
    HTTP/network failures — those become the rendered error_template instead,
    so the LLM can react gracefully rather than the pipeline crashing.
    """


class ToolExecutor:
    def __init__(
        self,
        auth_provider: AuthHeaderProvider,
        anonymizer: PIIAnonymizer,
        http_client: httpx.AsyncClient,
    ) -> None:
        self._auth = auth_provider
        self._anonymizer = anonymizer
        self._http = http_client

    async def execute(
        self,
        connector: dict[str, Any],
        tool: dict[str, Any],
        arguments: dict[str, Any],
        session_id: str,
    ) -> str:
        auth_config = tool.get("auth_override") or connector["auth"]

        try:
            rehydrated_args = self._rehydrate_args(session_id, arguments)
            path_params, query_params, body_params = self._split_params(tool, rehydrated_args)
            url = self._render_url(connector["base_url"], tool["path_template"], path_params)
            body_payload = {**(tool.get("body_template") or {}), **body_params}

            response = await self._send(tool, url, query_params, body_payload, auth_config)

            if response.status_code == 401 and auth_config.get("type") == "oauth2_client_credentials":
                logger.info(f"Tool {tool['name']!r} got 401, refreshing token and retrying once")
                self._auth.invalidate(auth_config["credential_ref"])
                response = await self._send(tool, url, query_params, body_payload, auth_config)

            response.raise_for_status()
            result_data = response.json()
            extracted = jmespath.search(tool["response_mapping"]["success_path"], result_data)
            message = self._render_template(tool["response_mapping"]["template"], extracted)
            # Re-redact: a backend could echo PII back (e.g. a caller's email
            # on the created ticket) — never let that flow into LLM context raw.
            return self._anonymizer.redact(session_id, message)

        except httpx.TimeoutException:
            logger.warning(f"Tool {tool['name']!r} timed out")
            return self._render_error(tool, status="timeout")
        except httpx.HTTPStatusError as e:
            logger.warning(f"Tool {tool['name']!r} failed with status {e.response.status_code}")
            return self._render_error(tool, status=str(e.response.status_code))
        except httpx.HTTPError as e:
            logger.warning(f"Tool {tool['name']!r} network error: {e}")
            return self._render_error(tool, status="network_error")

    async def _send(
        self,
        tool: dict[str, Any],
        url: str,
        query_params: dict[str, Any],
        body_payload: dict[str, Any],
        auth_config: dict[str, Any],
    ) -> httpx.Response:
        headers = await self._auth.get_headers(auth_config)
        method = tool["method"]
        return await self._http.request(
            method=method,
            url=url,
            params=query_params or None,
            json=body_payload if method in ("POST", "PUT", "PATCH") and body_payload else None,
            headers=headers,
            timeout=tool.get("timeout_ms", 8000) / 1000,
        )

    def _rehydrate_args(self, session_id: str, arguments: dict[str, Any]) -> dict[str, Any]:
        return {
            key: self._anonymizer.rehydrate(session_id, value) if isinstance(value, str) else value
            for key, value in arguments.items()
        }

    def _split_params(
        self, tool: dict[str, Any], args: dict[str, Any]
    ) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
        path_params: dict[str, Any] = {}
        query_params: dict[str, Any] = {}
        body_params: dict[str, Any] = {}
        buckets = {"path": path_params, "query": query_params, "body": body_params}

        for param in tool.get("params", []):
            name = param["name"]
            if name not in args:
                if param.get("required"):
                    raise ToolExecutionError(f"Missing required param {name!r} for tool {tool['name']!r}")
                continue
            # header-location params have no value source today (auth headers
            # are handled separately via `auth`/`auth_override`) — accepted
            # here without error, but intentionally not forwarded anywhere.
            bucket = buckets.get(param["location"])
            if bucket is not None:
                bucket[name] = args[name]

        return path_params, query_params, body_params

    def _render_url(self, base_url: str, path_template: str, path_params: dict[str, Any]) -> str:
        path = path_template
        for key, value in path_params.items():
            path = path.replace(f"{{{key}}}", str(value))
        return base_url.rstrip("/") + path

    def _render_template(self, template: str, extracted: Any) -> str:
        context: dict[str, Any] = {"result": extracted}
        if isinstance(extracted, dict):
            context.update(extracted)
        try:
            return template.format(**context)
        except (KeyError, IndexError):
            # Template referenced a field extracted wasn't a dict for (or
            # didn't have) — fall back to the raw extracted value.
            return template.format(result=extracted)

    def _render_error(self, tool: dict[str, Any], status: str) -> str:
        error_template = tool["response_mapping"]["error_template"]
        try:
            return error_template.format(status=status)
        except (KeyError, IndexError):
            return error_template
