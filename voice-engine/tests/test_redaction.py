from __future__ import annotations

import pytest

from voice_engine.redaction.anonymizer import PIIAnonymizer
from voice_engine.redaction.detector import PIIDetector
from voice_engine.redaction.session_map import InMemoryRehydrationStore


@pytest.fixture
def anonymizer() -> PIIAnonymizer:
    return PIIAnonymizer(detector=PIIDetector(), store=InMemoryRehydrationStore())


PII_SAMPLES = [
    ("my email is john.smith@example.com", "john.smith@example.com"),
    ("call me at 555-867-5309", "555-867-5309"),
    ("my name is Alexandra Whitfield", "Alexandra Whitfield"),
]


@pytest.mark.parametrize("text,pii_value", PII_SAMPLES, ids=[t[1] for t in PII_SAMPLES])
def test_detects_and_redacts_pii(anonymizer: PIIAnonymizer, text: str, pii_value: str) -> None:
    redacted = anonymizer.redact("session-1", text)
    assert pii_value not in redacted, "raw PII value must not survive redaction"
    assert redacted != text


def test_no_pii_passes_through_unchanged(anonymizer: PIIAnonymizer) -> None:
    text = "can you check the status of my ticket please"
    assert anonymizer.redact("session-1", text) == text


def test_stable_placeholder_for_repeated_value_within_session(anonymizer: PIIAnonymizer) -> None:
    first = anonymizer.redact("session-1", "my email is john@example.com")
    second = anonymizer.redact("session-1", "yes, john@example.com is correct")

    assert "[EMAIL_ADDRESS_1]" in first
    assert "[EMAIL_ADDRESS_1]" in second, "same real value must reuse the same placeholder"


def test_distinct_values_of_same_entity_type_get_distinct_placeholders(anonymizer: PIIAnonymizer) -> None:
    first = anonymizer.redact("session-1", "my email is alice@example.com")
    second = anonymizer.redact("session-1", "also cc bob@example.com")

    assert "[EMAIL_ADDRESS_1]" in first
    assert "[EMAIL_ADDRESS_2]" in second


def test_sessions_do_not_share_placeholder_state(anonymizer: PIIAnonymizer) -> None:
    a = anonymizer.redact("session-A", "my email is alice@example.com")
    b = anonymizer.redact("session-B", "my email is alice@example.com")

    assert "[EMAIL_ADDRESS_1]" in a
    assert "[EMAIL_ADDRESS_1]" in b, "each session starts its own placeholder numbering"


def test_rehydration_restores_the_exact_original_value(anonymizer: PIIAnonymizer) -> None:
    original = "my email is john@example.com and my number is 555-867-5309"
    redacted = anonymizer.redact("session-1", original)

    assert redacted != original
    assert anonymizer.rehydrate("session-1", redacted) == original


def test_rehydration_is_scoped_to_its_own_session(anonymizer: PIIAnonymizer) -> None:
    redacted = anonymizer.redact("session-1", "my email is john@example.com")
    # A different session's rehydrate call has never seen this placeholder,
    # so it must be a no-op, not an accidental cross-session leak.
    assert anonymizer.rehydrate("session-2", redacted) == redacted


def test_allowlisted_values_are_never_redacted() -> None:
    anonymizer_with_allowlist = PIIAnonymizer(
        detector=PIIDetector(allowlist=["Alexandra Whitfield"]),
        store=InMemoryRehydrationStore(),
    )
    text = "this ticket was opened by Alexandra Whitfield"
    assert anonymizer_with_allowlist.redact("session-1", text) == text


def test_forget_session_clears_placeholder_and_store_state(anonymizer: PIIAnonymizer) -> None:
    anonymizer.redact("session-1", "my email is john@example.com")
    anonymizer.forget_session("session-1")

    # After forgetting, the same value starts renumbering from 1 again —
    # proves both the local placeholder map and the store were actually cleared.
    redacted_again = anonymizer.redact("session-1", "my email is john@example.com")
    assert "[EMAIL_ADDRESS_1]" in redacted_again


class TestNoLeakAcrossLLMBoundary:
    """The core privacy guarantee: no matter what mix of PII a single utterance
    contains, none of the raw values survive into the text that would be handed
    to an LLM (i.e. the return value of `redact`).
    """

    @pytest.mark.parametrize(
        "text",
        [
            "Hi, I'm Alexandra Whitfield, my email is alex.w@example.com, "
            "call me back at 555-867-5309 regarding card 4111111111111111",
            "SSN 078-05-1120, name Bob Johnson, email bob.johnson@example.com",
        ],
    )
    def test_multi_entity_utterance_leaks_nothing(self, anonymizer: PIIAnonymizer, text: str) -> None:
        redacted = anonymizer.redact("session-1", text)
        for leaked_candidate in [
            "Alexandra Whitfield",
            "alex.w@example.com",
            "555-867-5309",
            "4111111111111111",
            "078-05-1120",
            "Bob Johnson",
            "bob.johnson@example.com",
        ]:
            assert leaked_candidate not in redacted
