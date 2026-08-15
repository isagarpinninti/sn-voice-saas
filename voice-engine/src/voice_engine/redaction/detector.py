"""PII detection via Presidio's AnalyzerEngine, explicitly configured to use
the small spaCy model (en_core_web_sm) rather than Presidio's much larger
default (en_core_web_lg) — the small model is enough for the entity types we
care about (PERSON, EMAIL, PHONE, credit card, SSN, location) at a fraction of
the load time, which matters on the STT->LLM latency budget.
"""

from __future__ import annotations

from functools import lru_cache

from presidio_analyzer import AnalyzerEngine, RecognizerResult
from presidio_analyzer.nlp_engine import NlpEngineProvider

_DEFAULT_ENTITIES = [
    "PERSON",
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "CREDIT_CARD",
    "US_SSN",
    "LOCATION",
    "IBAN_CODE",
]


@lru_cache(maxsize=1)
def _build_analyzer() -> AnalyzerEngine:
    provider = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
        }
    )
    return AnalyzerEngine(nlp_engine=provider.create_engine())


class PIIDetector:
    """Wraps Presidio's analyzer with a per-tenant allowlist so values like
    ticket IDs ("INC0012345") aren't false-positive redacted. `allowlist`
    entries are matched case-insensitively against the exact detected span.
    """

    def __init__(
        self,
        language: str = "en",
        entities: list[str] | None = None,
        allowlist: list[str] | None = None,
    ) -> None:
        self._analyzer = _build_analyzer()
        self._language = language
        self._entities = entities or _DEFAULT_ENTITIES
        self._allowlist = {a.strip().lower() for a in (allowlist or [])}

    def detect(self, text: str) -> list[RecognizerResult]:
        if not text.strip():
            return []
        results = self._analyzer.analyze(text=text, language=self._language, entities=self._entities)
        if not self._allowlist:
            return results
        return [r for r in results if text[r.start : r.end].strip().lower() not in self._allowlist]
