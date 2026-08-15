"""Proves voice_engine.connectors.zevox_crypto.decrypt is byte-for-byte
compatible with ZeVox's Node encrypt.ts
(/Users/sagarpinninti/Desktop/SN/sn-voice-saas/src/lib/encrypt.ts) — this is
M4 of the merge plan, required before anything (ConnectorCredential
decryption) is built on top of it.

The fixture below was captured from a real run of the actual Node
encrypt.ts, using a fixed test-only secret (not a production value):

    ENCRYPTION_KEY="test-secret-for-crypto-compat-fixture" \\
      npx tsx <scratch-script-that-calls-encrypt.ts> "sn_svc_account_password_42!"

Hardcoded here (rather than shelling out to Node at test time) so this test
runs in CI without a Node/tsx dependency, while still proving compatibility
against real Node output rather than a from-scratch Python reimplementation
of the algorithm checked against itself.
"""

from __future__ import annotations

import pytest

from voice_engine.connectors.zevox_crypto import DecryptionError, decrypt

TEST_SECRET = "test-secret-for-crypto-compat-fixture"
KNOWN_PLAINTEXT = "sn_svc_account_password_42!"
KNOWN_CIPHERTEXT = (
    "a4ebae6a74ed75e544188f80:"
    "008fa048acbda565f65b06547777997e:"
    "af2cb7f11c1bb6749f91a9bd42350ba6429eebc915a43c0d043840"
)


def test_decrypts_real_node_ciphertext():
    assert decrypt(KNOWN_CIPHERTEXT, TEST_SECRET) == KNOWN_PLAINTEXT


def test_wrong_secret_raises_decryption_error():
    with pytest.raises(DecryptionError):
        decrypt(KNOWN_CIPHERTEXT, "not-the-right-secret")


def test_malformed_ciphertext_raises_decryption_error():
    with pytest.raises(DecryptionError):
        decrypt("not-even-three-colon-parts", TEST_SECRET)


def test_tampered_ciphertext_fails_gcm_auth():
    iv, tag, data = KNOWN_CIPHERTEXT.split(":")
    tampered_data = ("0" if data[0] != "0" else "1") + data[1:]
    with pytest.raises(DecryptionError):
        decrypt(f"{iv}:{tag}:{tampered_data}", TEST_SECRET)
