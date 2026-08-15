"""Pipecat FrameProcessor that redacts PII from speech transcripts before
anything downstream (LLM, echo, logs) ever sees it. Placed between the STT
service and everything after it in the pipeline.

Only FINAL transcription frames are redacted and forwarded — interim/partial
frames are passed through untouched so live captions in the widget stay
responsive, since they're never sent to an LLM and re-redacting a growing
partial on every keystroke-equivalent would be wasted work.
"""

from __future__ import annotations

from dataclasses import replace

from loguru import logger

from pipecat.frames.frames import Frame, InterimTranscriptionFrame, TranscriptionFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from voice_engine.redaction.anonymizer import PIIAnonymizer


class PIIRedactionProcessor(FrameProcessor):
    def __init__(self, anonymizer: PIIAnonymizer, session_id: str, **kwargs) -> None:
        super().__init__(**kwargs)
        self._anonymizer = anonymizer
        self._session_id = session_id

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        if isinstance(frame, InterimTranscriptionFrame):
            # Never redacted, never forwarded past this point into LLM-bound
            # processing — safe because it only reaches the widget's caption UI.
            await self.push_frame(frame, direction)
            return

        if isinstance(frame, TranscriptionFrame):
            redacted_text = self._anonymizer.redact(self._session_id, frame.text)
            if redacted_text != frame.text:
                logger.debug(f"[redaction] {frame.text!r} -> {redacted_text!r}")
            await self.push_frame(replace(frame, text=redacted_text), direction)
            return

        await self.push_frame(frame, direction)
