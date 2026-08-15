"""Turns a connector's `credential_ref` into the actual secret value. Kept as
a swappable interface so the executor's logic can be fully tested against a
mock resolver, independent of the real resolver used at runtime.

ZeVox fork: VoiceConnect's own PostgresCredentialResolver (Supabase Vault,
`vault:<uuid>` refs) was dropped here — it calls a get_decrypted_credential()
RPC that doesn't exist in ZeVox's Postgres. ZeVox uses
connectors/zevox_credentials.py's ZeVoxEncryptedCredentialResolver instead
(`local:<ConnectorCredential.id>` refs, AES-256-GCM via zevox_crypto).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class CredentialResolver(ABC):
    @abstractmethod
    async def resolve(self, credential_ref: str) -> Any:
        """Returns a plain string for api_key auth, or a
        {"client_id": ..., "client_secret": ...} dict for oauth2_client_credentials.
        """
        ...


class StaticCredentialResolver(CredentialResolver):
    """Dict-backed resolver for tests and local dev without a live database."""

    def __init__(self, values: dict[str, Any]) -> None:
        self._values = values

    async def resolve(self, credential_ref: str) -> Any:
        if credential_ref not in self._values:
            raise KeyError(f"No credential registered for ref: {credential_ref!r}")
        return self._values[credential_ref]
