"""Verifies the short-lived session ticket the control-plane mints (see
control-plane/app/api/public/session-token/route.ts) before a WebRTC offer is
accepted. Single-use is enforced via an in-memory `jti` set — correct for
Phase 1 (one voice-engine process), documented extension point (shared cache)
for later horizontal scaling, matching the same pattern as the redaction
RehydrationStore.
"""

from __future__ import annotations

import os

import jwt

SESSION_SIGNING_KEY = os.environ.get("VOICE_SESSION_SIGNING_KEY", "local-dev-signing-key-not-for-prod")
ALGORITHM = "HS256"

_used_jti: set[str] = set()


class InvalidSessionTicketError(Exception):
    pass


def verify_session_ticket(token: str) -> dict:
    try:
        payload = jwt.decode(token, SESSION_SIGNING_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError as e:
        raise InvalidSessionTicketError(f"Invalid session ticket: {e}") from e

    jti = payload.get("jti")
    agent_id = payload.get("agent_id")
    if not jti or not agent_id:
        raise InvalidSessionTicketError("Session ticket missing required claims")
    if jti in _used_jti:
        raise InvalidSessionTicketError("Session ticket already used")

    _used_jti.add(jti)
    return payload
