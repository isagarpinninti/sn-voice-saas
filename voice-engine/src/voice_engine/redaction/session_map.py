"""Reverse mapping from a redaction placeholder (e.g. "[EMAIL_1]") back to the
real value it stood in for, scoped per call session. Real values are only ever
substituted back in one place — connectors/executor.py (M7), immediately
before an outgoing HTTP request — and never re-enter LLM context.

InMemoryRehydrationStore is the Phase 1 implementation (each voice-engine
process handles a call start-to-finish, so per-process memory is sufficient).
A Redis-backed implementation is the documented extension point for later
horizontal scaling of voice-engine across multiple replicas — not needed
until that becomes a real bottleneck (see docs/decisions/0001-webrtc-transport.md
for the same reasoning applied to transport choice).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import defaultdict


class RehydrationStore(ABC):
    @abstractmethod
    def put(self, session_id: str, placeholder: str, value: str) -> None: ...

    @abstractmethod
    def get(self, session_id: str, placeholder: str) -> str | None: ...

    @abstractmethod
    def rehydrate(self, session_id: str, text: str) -> str:
        """Replace every known placeholder in `text` with its real value."""
        ...

    @abstractmethod
    def clear(self, session_id: str) -> None:
        """Drop all mappings for a session (call it when the call ends)."""
        ...


class InMemoryRehydrationStore(RehydrationStore):
    def __init__(self) -> None:
        self._data: dict[str, dict[str, str]] = defaultdict(dict)

    def put(self, session_id: str, placeholder: str, value: str) -> None:
        self._data[session_id][placeholder] = value

    def get(self, session_id: str, placeholder: str) -> str | None:
        return self._data.get(session_id, {}).get(placeholder)

    def rehydrate(self, session_id: str, text: str) -> str:
        mapping = self._data.get(session_id, {})
        if not mapping:
            return text
        # Replace longer placeholders first so "[PHONE_10]" never gets partially
        # clobbered by a "[PHONE_1]" match.
        for placeholder in sorted(mapping, key=len, reverse=True):
            text = text.replace(placeholder, mapping[placeholder])
        return text

    def clear(self, session_id: str) -> None:
        self._data.pop(session_id, None)
