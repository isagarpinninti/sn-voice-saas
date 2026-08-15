"""AES-256-GCM decryption compatible with ZeVox's Node `encrypt.ts`
(/Users/sagarpinninti/Desktop/SN/sn-voice-saas/src/lib/encrypt.ts).

ZeVox-specific: not used by VoiceConnect's own credential resolution (that
goes through Supabase Vault, see connectors/credentials.py). This exists
purely so the forked voice-engine can decrypt ConnectorCredential.ciphertext
rows written by ZeVox's existing `encrypt()` helper — same key derivation,
same AES-256-GCM mode, same "iv_hex:tag_hex:ciphertext_hex" wire format.

Compatibility was proven by a literal round trip (encrypt via the real
Node encrypt.ts, decrypt here, assert equality) before this was wired into
anything — see M4 of the merge plan. Do not change any parameter here
without re-running that proof; a mismatched scrypt N/r/p or salt silently
produces "wrong tag" GCM auth failures, not a clear error about what's wrong.
"""

from __future__ import annotations

import hashlib

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_SCRYPT_SALT = b"zevox-twilio-salt"
_SCRYPT_N = 16384  # Node's scryptSync default `cost`
_SCRYPT_R = 8  # Node's scryptSync default `blockSize`
_SCRYPT_P = 1  # Node's scryptSync default `parallelization`
_SCRYPT_MAXMEM = 32 * 1024 * 1024  # Node's scryptSync default `maxmem`
_KEY_LEN = 32  # AES-256


class DecryptionError(Exception):
    pass


def _derive_key(raw_secret: str) -> bytes:
    return hashlib.scrypt(
        raw_secret.encode("utf-8"),
        salt=_SCRYPT_SALT,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        maxmem=_SCRYPT_MAXMEM,
        dklen=_KEY_LEN,
    )


def decrypt(ciphertext: str, raw_secret: str) -> str:
    """`raw_secret` is whatever ZeVox's getKey() would use — ENCRYPTION_KEY,
    falling back to NEXTAUTH_SECRET, falling back to the hardcoded dev
    string. Caller resolves which one, mirroring encrypt.ts's own fallback
    chain exactly.
    """
    parts = ciphertext.split(":")
    if len(parts) != 3:
        raise DecryptionError(f"Invalid ciphertext format: expected 3 ':'-separated parts, got {len(parts)}")
    iv_hex, tag_hex, data_hex = parts

    key = _derive_key(raw_secret)
    iv = bytes.fromhex(iv_hex)
    tag = bytes.fromhex(tag_hex)
    data = bytes.fromhex(data_hex)

    aesgcm = AESGCM(key)
    try:
        plaintext = aesgcm.decrypt(iv, data + tag, None)
    except Exception as exc:  # cryptography raises InvalidTag on auth failure
        raise DecryptionError(f"AES-GCM decryption failed: {exc}") from exc

    return plaintext.decode("utf-8")
