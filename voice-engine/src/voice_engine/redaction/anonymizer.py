"""Turns Presidio detections into stable, session-scoped placeholders: the
same real value seen twice in one call always maps to the same placeholder
(e.g. "[EMAIL_1]" both times), while a different value of the same entity
type gets the next index ("[EMAIL_2]"). Every substitution is also recorded
in the RehydrationStore so a tool call (M7) can restore the real value right
before it leaves voice-engine — the placeholder itself never carries the real
value, so nothing downstream of this class can leak it by accident.

Presidio ships its own AnonymizerEngine, but its built-in operators don't
support this "stable per-session placeholder" requirement out of the box —
hence the custom (and much simpler) splicing logic here instead of a custom
Presidio Operator.
"""

from __future__ import annotations

from collections import defaultdict

from voice_engine.redaction.detector import PIIDetector
from voice_engine.redaction.session_map import RehydrationStore


class PIIAnonymizer:
    def __init__(self, detector: PIIDetector, store: RehydrationStore) -> None:
        self._detector = detector
        self._store = store
        self._placeholder_for_value: dict[str, dict[tuple[str, str], str]] = defaultdict(dict)
        self._next_index: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    def redact(self, session_id: str, text: str) -> str:
        results = self._detector.detect(text)
        if not results:
            return text

        # Replace from the end of the string so earlier match offsets stay valid.
        for result in sorted(results, key=lambda r: r.start, reverse=True):
            value = text[result.start : result.end]
            placeholder = self._placeholder_for(session_id, result.entity_type, value)
            self._store.put(session_id, placeholder, value)
            text = text[: result.start] + placeholder + text[result.end :]
        return text

    def rehydrate(self, session_id: str, text: str) -> str:
        return self._store.rehydrate(session_id, text)

    def forget_session(self, session_id: str) -> None:
        self._placeholder_for_value.pop(session_id, None)
        self._next_index.pop(session_id, None)
        self._store.clear(session_id)

    def _placeholder_for(self, session_id: str, entity_type: str, value: str) -> str:
        key = (entity_type, value.strip().lower())
        session_map = self._placeholder_for_value[session_id]
        if key not in session_map:
            self._next_index[session_id][entity_type] += 1
            session_map[key] = f"[{entity_type}_{self._next_index[session_id][entity_type]}]"
        return session_map[key]
