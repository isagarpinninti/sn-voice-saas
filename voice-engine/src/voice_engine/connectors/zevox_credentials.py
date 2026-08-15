"""ZeVox-specific CredentialResolver: resolves `credential_ref` values of the
form "local:<ConnectorCredential.id>" against ZeVox's own Postgres (no
Supabase Vault equivalent — see M1's schema comment on ConnectorCredential).

Mirrors connectors/credentials.py's PostgresCredentialResolver:
oauth2_client_credentials / basic_auth secrets are stored as a JSON string
({"client_id"/"client_secret"} or {"username"/"password"}); api_key secrets
are a plain string. Both are written by ZeVox's own encrypt() helper
(src/lib/encrypt.ts) — decrypted here via zevox_crypto, proven compatible
in M4.
"""

from __future__ import annotations

import json
from typing import Any

from voice_engine.config.db import get_pool
from voice_engine.connectors.credentials import CredentialResolver
from voice_engine.connectors.zevox_crypto import DecryptionError, decrypt


class ZeVoxEncryptedCredentialResolver(CredentialResolver):
    def __init__(self, raw_secret: str) -> None:
        """`raw_secret` is whatever ZeVox's encrypt.ts getKey() would use —
        resolved once by the caller (ENCRYPTION_KEY, falling back to
        NEXTAUTH_SECRET), not re-derived per call.
        """
        self._raw_secret = raw_secret

    async def resolve(self, credential_ref: str) -> Any:
        if not credential_ref.startswith("local:"):
            raise ValueError(f"Unsupported credential_ref format: {credential_ref!r}")
        credential_id = credential_ref.removeprefix("local:")

        pool = await get_pool()
        async with pool.acquire() as conn:
            ciphertext = await conn.fetchval(
                'select ciphertext from "ConnectorCredential" where id = $1',
                credential_id,
            )

        if ciphertext is None:
            raise KeyError(f"No credential found for ref: {credential_ref!r}")

        try:
            decrypted = decrypt(ciphertext, self._raw_secret)
        except DecryptionError as exc:
            raise KeyError(f"Failed to decrypt credential {credential_ref!r}: {exc}") from exc

        try:
            parsed = json.loads(decrypted)
            return parsed if isinstance(parsed, dict) else decrypted
        except (json.JSONDecodeError, TypeError):
            return decrypted
