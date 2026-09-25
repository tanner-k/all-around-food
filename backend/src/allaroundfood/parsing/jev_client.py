"""Bounded, pinned Jev transport for source-grounded recipe classification."""

from __future__ import annotations

import json
import math
import time
from typing import Any, Self, cast

import httpx

from allaroundfood.config import settings

MODEL = "jev-1.13.0"
ENDPOINT = "https://api.typesafe.ai/v1/systemone"
MAX_BATCH = 32
MAX_RESPONSE_BYTES = 1_000_000


def _probability(value: Any) -> bool:
    return type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1


def _validate(payload: Any, questions: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("model") != MODEL:
        raise ValueError("Invalid Jev model or response")
    answers, usage = payload.get("answers"), payload.get("usage")
    if not isinstance(answers, dict) or set(answers) != set(questions):
        raise ValueError("Invalid Jev answer set")
    if not isinstance(usage, dict) or any(
        type(usage.get(k)) is not int or usage[k] < 0 for k in ("input_tokens", "output_tokens")
    ):
        raise ValueError("Invalid Jev usage")
    for key, question in questions.items():
        answer = answers[key]
        if not isinstance(answer, dict) or answer.get("type") != question["type"]:
            raise ValueError("Invalid Jev answer type")
        if question["type"] == "noul":
            if not _probability(answer.get("noul")):
                raise ValueError("Invalid Jev probability")
        else:
            probabilities, choice = answer.get("probabilities"), answer.get("choice")
            if (
                not isinstance(probabilities, dict)
                or set(probabilities) != set(question["criteria"])
                or not all(_probability(p) for p in probabilities.values())
                or not math.isclose(sum(probabilities.values()), 1, abs_tol=0.02)
                or not isinstance(choice, str)
                or choice not in probabilities
                or probabilities[choice] < max(probabilities.values())
                or not _probability(answer.get("confidence"))
            ):
                raise ValueError("Invalid Jev choice")
    return cast("dict[str, Any]", answers)


class JevClient:
    """One import's API session; budget failures never return a partial batch.

    Request bodies and API responses contain source text, so only call metadata
    is retained here. The parser keeps source evidence in its own result.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        http: httpx.Client | None = None,
        max_calls: int = 80,
        max_questions: int = 2400,
        deadline_s: float = 300,
    ) -> None:
        secret = settings.typesafe_api_key
        self._key = api_key or (secret.get_secret_value() if secret else "")
        if not self._key.strip():
            raise RuntimeError("TYPESAFE_API_KEY is not set on the import worker")
        self._http = http or httpx.Client(timeout=25, trust_env=False, follow_redirects=False)
        self._owns_http = http is None
        self._max_calls = max_calls
        self._max_questions = max_questions
        self._calls_used = 0
        self._questions_used = 0
        self._deadline = time.monotonic() + deadline_s
        self.calls: list[dict[str, Any]] = []

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *args: Any) -> None:
        if self._owns_http:
            self._http.close()

    def ask(
        self,
        stage: str,
        state: dict[str, Any],
        questions: dict[str, Any],
    ) -> dict[str, Any]:
        if not questions:
            return {}
        for question in questions.values():
            if not isinstance(question, dict) or question.get("type") not in {"choice", "noul"}:
                raise ValueError("Unsupported Jev question")
            if question["type"] == "choice" and (
                not isinstance(question.get("criteria"), dict)
                or not 1 <= len(question["criteria"]) <= 255
            ):
                raise ValueError("Invalid Jev choices")
        if (
            self._calls_used + math.ceil(len(questions) / MAX_BATCH) > self._max_calls
            or self._questions_used + len(questions) > self._max_questions
        ):
            raise ValueError("Jev parsing budget exceeded; paste a shorter recipe excerpt")
        if len(json.dumps(state, ensure_ascii=False)) > 500_000:
            raise ValueError("Jev input budget exceeded; paste a shorter recipe excerpt")
        result: dict[str, Any] = {}
        items = list(questions.items())
        batches = [
            dict(items[offset : offset + MAX_BATCH]) for offset in range(0, len(items), MAX_BATCH)
        ]
        if any(
            len(
                json.dumps(
                    {"model": MODEL, "state": state, "questions": batch}, ensure_ascii=False
                ).encode("utf-8")
            )
            > 500_000
            for batch in batches
        ):
            raise ValueError("Jev request budget exceeded; paste a shorter recipe excerpt")
        for offset in range(0, len(items), MAX_BATCH):
            batch = dict(items[offset : offset + MAX_BATCH])
            remaining = self._deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError("Jev parsing timed out; retry with a shorter recipe excerpt")
            self._calls_used += 1
            self._questions_used += len(batch)
            started = time.monotonic()
            try:
                with self._http.stream(
                    "POST",
                    ENDPOINT,
                    headers={"Authorization": f"Bearer {self._key}"},
                    json={"model": MODEL, "state": state, "questions": batch},
                    timeout=min(25, remaining),
                ) as response:
                    if response.status_code != 200:
                        raise RuntimeError(f"Jev request returned HTTP {response.status_code}")
                    data = bytearray()
                    for chunk in response.iter_bytes():
                        data.extend(chunk)
                        if len(data) > MAX_RESPONSE_BYTES:
                            raise ValueError("Jev response exceeds size limit")
                        if time.monotonic() > self._deadline:
                            raise RuntimeError("Jev parsing timed out")
                payload = json.loads(data)
            except httpx.HTTPError:
                raise RuntimeError("Jev request failed; please retry the import") from None
            except (json.JSONDecodeError, UnicodeDecodeError):
                raise ValueError("Invalid Jev response JSON") from None
            answers = _validate(payload, batch)
            self.calls.append(
                {
                    "stage": stage,
                    "model": MODEL,
                    "question_count": len(batch),
                    "seconds": round(time.monotonic() - started, 3),
                    "usage": payload["usage"],
                }
            )
            result.update(answers)
        return result
