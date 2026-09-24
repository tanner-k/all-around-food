"""Experimental, bounded Jev grouping of caption and transcript text.

This only proposes blocks for review. It does not create recipe data or run in
the import worker.
"""

from __future__ import annotations

import math
import re
import time
from typing import Any, cast

import httpx

ENDPOINT = "https://api.typesafe.ai/v1/systemone"
LABELS = ("ingredient", "cooking_step", "note", "heading", "irrelevant", "mixed")
MERGE_THRESHOLD = 0.7  # Provisional: evaluate against labeled examples before production use.
MAX_SOURCE_CHARS = 20_000
MAX_SEGMENT_CHARS = 600
MAX_BLOCK_SEGMENTS = 4
MAX_QUESTIONS = 32
MAX_CALLS = 12
_ABBREVIATIONS = {"tsp.", "tbsp.", "oz.", "min.", "approx.", "dr.", "mr.", "mrs."}


def _segment_sources(sources: dict[str, str]) -> list[dict[str, Any]]:
    """Return exact, contiguous spans, including punctuation and separators."""
    segments: list[dict[str, Any]] = []
    for name, source in sources.items():
        if not source:
            continue
        cuts = [0]
        if name == "transcript":
            for match in re.finditer(r"[.!?](?=\s|$)|\n+", source):
                if (
                    match.group().startswith("\n")
                    or match.group() != "."
                    or not any(
                        source[: match.end()].lower().endswith(word) for word in _ABBREVIATIONS
                    )
                ):
                    cuts.append(match.end())
        else:
            cuts.extend(match.end() for match in re.finditer(r"\n+", source))
        cuts.append(len(source))
        start = 0
        for end in sorted(set(cuts)):
            if end <= start:
                continue
            while end - start > MAX_SEGMENT_CHARS:
                split = start + MAX_SEGMENT_CHARS
                segments.append(_segment(name, source, start, split, len(segments)))
                start = split
            if end > start:
                segments.append(_segment(name, source, start, end, len(segments)))
                start = end
    return segments


def _segment(source_name: str, source: str, start: int, end: int, index: int) -> dict[str, Any]:
    return {
        "id": f"s{index}",
        "source": source_name,
        "start": start,
        "end": end,
        "text": source[start:end],
    }


def _probability(value: Any) -> bool:
    return type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1


def _request(
    client: httpx.Client,
    api_key: str,
    model: str,
    stage: str,
    state: dict[str, Any],
    questions: dict[str, Any],
    calls: list[dict[str, Any]],
) -> dict[str, Any]:
    if len(calls) >= MAX_CALLS:
        raise ValueError("Jev prototype exceeds 12-call budget")
    started = time.monotonic()
    try:
        response = client.post(
            ENDPOINT,
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model, "state": state, "questions": questions},
        )
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Jev {stage} request failed ({type(exc).__name__})") from None
    if response.status_code != 200:
        raise RuntimeError(f"Jev {stage} request returned HTTP {response.status_code}")
    try:
        payload = response.json()
    except ValueError:
        raise ValueError("invalid Jev response JSON") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("answers"), dict):
        raise ValueError("invalid Jev response")
    if set(payload["answers"]) != set(questions):
        raise ValueError("invalid Jev answer set")
    returned_model = payload.get("model")
    usage = payload.get("usage")
    if not isinstance(returned_model, str) or not returned_model or not isinstance(usage, dict):
        raise ValueError("invalid Jev response metadata")
    if any(
        type(usage.get(key)) is not int or usage[key] < 0
        for key in ("input_tokens", "output_tokens")
    ):
        raise ValueError("invalid Jev usage")
    for key, question in questions.items():
        answer = payload["answers"][key]
        if not isinstance(answer, dict) or answer.get("type") != question["type"]:
            raise ValueError(f"invalid Jev answer {key}")
        if question["type"] == "noul":
            if not _probability(answer.get("noul")):
                raise ValueError(f"invalid Jev answer {key}")
        else:
            probabilities = answer.get("probabilities")
            choice = answer.get("choice")
            if (
                not isinstance(probabilities, dict)
                or set(probabilities) != set(question["criteria"])
                or not all(_probability(value) for value in probabilities.values())
                or not math.isclose(sum(probabilities.values()), 1.0, abs_tol=0.02)
                or choice not in probabilities
                or probabilities[choice] < max(probabilities.values())
                or not _probability(answer.get("confidence"))
            ):
                raise ValueError(f"invalid Jev answer {key}")
    calls.append(
        {
            "stage": stage,
            "question_count": len(questions),
            "seconds": round(time.monotonic() - started, 3),
            "model": returned_model,
            "usage": {key: usage[key] for key in ("input_tokens", "output_tokens")},
        }
    )
    return cast("dict[str, Any]", payload["answers"])


def analyze_sources(
    sources: dict[str, str], api_key: str, model: str = "jev-latest"
) -> dict[str, Any]:
    """Propose conservative same-source blocks and label every block for review."""
    if (
        not isinstance(sources, dict)
        or not sources
        or any(not isinstance(k, str) or not isinstance(v, str) for k, v in sources.items())
    ):
        raise ValueError("sources must be a nonempty map of names to text")
    if not api_key or not model:
        raise ValueError("Jev API key and model are required")
    if sum(map(len, sources.values())) > MAX_SOURCE_CHARS:
        raise ValueError("Jev prototype input exceeds 20,000 characters")
    segments = _segment_sources(sources)
    if not segments or not any(segment["text"].strip() for segment in segments):
        raise ValueError("Jev prototype input has no text")
    pairs = [
        (i, i + 1)
        for i in range(len(segments) - 1)
        if segments[i]["source"] == segments[i + 1]["source"]
        and not segments[i]["text"].endswith("\n\n")
        and not re.match(r"\s*(?:[-*•]\s|\d+[.)]\s)", segments[i + 1]["text"])
    ]
    # Worst case: no merges, so every segment needs classification.
    if math.ceil(len(pairs) / MAX_QUESTIONS) + math.ceil(len(segments) / MAX_QUESTIONS) > MAX_CALLS:
        raise ValueError("Jev prototype exceeds 12-call budget")
    calls: list[dict[str, Any]] = []
    boundaries: list[dict[str, Any]] = []
    with httpx.Client(timeout=30, trust_env=False) as client:
        for offset in range(0, len(pairs), MAX_QUESTIONS):
            batch = pairs[offset : offset + MAX_QUESTIONS]
            ids = {j for pair in batch for j in pair}
            context = [
                segments[j] for j in range(max(0, min(ids) - 1), min(len(segments), max(ids) + 2))
            ]
            questions = {
                f"b{offset + index}": {
                    "type": "noul",
                    "instructions": (
                        f"Do segments {segments[left]['id']} and {segments[right]['id']} "
                        "continue the same cooking item or action? Keep separate ingredients, "
                        "list lines, and distinct steps separate."
                    ),
                    "criteria": {
                        "true": "one continuous item or action",
                        "false": "different item, step, or topic",
                    },
                }
                for index, (left, right) in enumerate(batch)
            }
            answers = _request(
                client, api_key, model, "grouping", {"segments": context}, questions, calls
            )
            for index, (left, right) in enumerate(batch):
                probability = answers[f"b{offset + index}"]["noul"]
                boundaries.append(
                    {
                        "left": segments[left]["id"],
                        "right": segments[right]["id"],
                        "source": segments[left]["source"],
                        "probability": probability,
                        "uncertain": 0.3 < probability < 0.7,
                        "merged": False,
                    }
                )
        boundary_by_pair = {(b["left"], b["right"]): b for b in boundaries}
        blocks: list[dict[str, Any]] = []
        current = [segments[0]]
        for segment in segments[1:]:
            prior = current[-1]
            boundary = boundary_by_pair.get((prior["id"], segment["id"]))
            merge = bool(
                boundary
                and boundary["probability"] >= MERGE_THRESHOLD
                and len(current) < MAX_BLOCK_SEGMENTS
                and segment["end"] - current[0]["start"] <= MAX_SEGMENT_CHARS
            )
            if merge:
                assert boundary is not None
                boundary["merged"] = True
                current.append(segment)
            else:
                blocks.append(_block(current))
                current = [segment]
        blocks.append(_block(current))
        for offset in range(0, len(blocks), MAX_QUESTIONS):
            block_batch = blocks[offset : offset + MAX_QUESTIONS]
            questions = {
                f"c{offset + index}": {
                    "type": "choice",
                    "instructions": (
                        f"Classify block {block['id']} by its text. Use mixed if it spans types."
                    ),
                    "criteria": {
                        "ingredient": "ingredient list entry, including amount or preparation",
                        "cooking_step": "instruction to cook, even if it mentions ingredients",
                        "note": "recipe advice or context",
                        "heading": "title or section heading",
                        "irrelevant": "subscribe, promotion, or chatter unrelated to cooking",
                        "mixed": "separate list and instruction content, or distinct categories",
                    },
                }
                for index, block in enumerate(block_batch)
            }
            answers = _request(
                client,
                api_key,
                model,
                "classification",
                {
                    "blocks": [
                        {"id": block["id"], "source": block["source"], "text": block["text"]}
                        for block in block_batch
                    ]
                },
                questions,
                calls,
            )
            for index, block in enumerate(block_batch):
                block["classification"] = answers[f"c{offset + index}"]
    return {
        "sources": sources,
        "segments": segments,
        "boundaries": boundaries,
        "blocks": blocks,
        "calls": calls,
        "proposed_grouping_threshold": MERGE_THRESHOLD,
    }


def _block(segments: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": f"block_{segments[0]['id']}",
        "source": segments[0]["source"],
        "start": segments[0]["start"],
        "end": segments[-1]["end"],
        "text": "".join(segment["text"] for segment in segments),
        "segments": segments.copy(),
    }
