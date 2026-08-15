"""Resolves a tool's `auth` config into the HTTP headers a request needs.
OAuth2 client-credentials tokens are cached in-memory per credential_ref and
refreshed proactively before expiry (and reactively on a 401 — see
executor.py's retry-once-after-invalidate logic).
"""

from __future__ import annotations

import base64
import time

import httpx

from voice_engine.connectors.credentials import CredentialResolver

_TOKEN_EXPIRY_SAFETY_MARGIN_SECS = 30


class AuthError(RuntimeError):
    pass


class AuthHeaderProvider:
    def __init__(
        self,
        credential_resolver: CredentialResolver,
        http_client: httpx.AsyncClient,
    ) -> None:
        self._resolver = credential_resolver
        self._http = http_client
        self._token_cache: dict[str, tuple[str, float]] = {}

    async def get_headers(self, auth_config: dict) -> dict[str, str]:
        auth_type = auth_config.get("type", "none")

        if auth_type == "none":
            return {}

        if auth_type == "api_key":
            value = await self._resolver.resolve(auth_config["credential_ref"])
            return {auth_config["header_name"]: value}

        if auth_type == "oauth2_client_credentials":
            token = await self._get_token(auth_config)
            return {"Authorization": f"Bearer {token}"}

        if auth_type == "basic_auth":
            creds = await self._resolver.resolve(auth_config["credential_ref"])
            raw = f"{creds['username']}:{creds['password']}".encode()
            return {"Authorization": f"Basic {base64.b64encode(raw).decode()}"}

        raise AuthError(f"Unsupported auth type: {auth_type!r}")

    def invalidate(self, credential_ref: str) -> None:
        """Force a fresh token fetch on the next call — used after a 401."""
        self._token_cache.pop(credential_ref, None)

    async def _get_token(self, auth_config: dict) -> str:
        ref = auth_config["credential_ref"]
        cached = self._token_cache.get(ref)
        now = time.time()
        if cached and cached[1] > now + _TOKEN_EXPIRY_SAFETY_MARGIN_SECS:
            return cached[0]

        creds = await self._resolver.resolve(ref)
        data = {
            "grant_type": "client_credentials",
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
        }
        if auth_config.get("scope"):
            data["scope"] = auth_config["scope"]

        response = await self._http.post(auth_config["token_url"], data=data)
        response.raise_for_status()
        payload = response.json()

        token = payload["access_token"]
        expires_in = payload.get("expires_in", 3600)
        self._token_cache[ref] = (token, now + expires_in)
        return token
