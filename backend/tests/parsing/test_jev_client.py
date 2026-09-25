"""Contract and budget checks for the production Jev transport."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from allaroundfood.parsing.jev_client import JevClient


def questions(count: int = 1) -> dict[str, Any]:
    return {
        f"q{i}": {
            "type": "choice",
            "instructions": "Classify the source.",
            "criteria": {"yes": "ingredient", "no": "other"},
        }
        for i in range(count)
    }


def reply(request: httpx.Request) -> httpx.Response:
    body = json.loads(request.content)
    return httpx.Response(
        200,
        json={
            "model": "jev-1.13.0",
            "usage": {"input_tokens": 10, "output_tokens": 2},
            "answers": {
                key: {
                    "type": "choice",
                    "choice": "yes",
                    "confidence": 0.8,
                    "probabilities": {"yes": 0.8, "no": 0.2},
                }
                for key in body["questions"]
            },
        },
    )


def test_batches_questions_and_records_only_metadata() -> None:
    requests = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return reply(request)

    with (
        httpx.Client(transport=httpx.MockTransport(handle)) as http,
        JevClient(api_key="private", http=http) as client,
    ):
        answers = client.ask("roles", {"text": "rice"}, questions(33))
        assert len(answers) == 33
        assert [len(r["questions"]) for r in requests] == [32, 1]
        assert len(client.calls) == 2
        assert "private" not in repr(client.calls)


@pytest.mark.parametrize("mutation", ["model", "missing", "nan", "choice", "sum"])
def test_rejects_invalid_answers(mutation: str) -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        payload = reply(request).json()
        if mutation == "model":
            payload["model"] = "jev-latest"
        elif mutation == "missing":
            payload["answers"] = {}
        elif mutation == "nan":
            payload["answers"]["q0"]["confidence"] = "NaN"
        elif mutation == "choice":
            payload["answers"]["q0"]["choice"] = "invented"
        else:
            payload["answers"]["q0"]["probabilities"] = {"yes": 0.8, "no": 0.8}
        return httpx.Response(200, json=payload)

    with (
        httpx.Client(transport=httpx.MockTransport(handle)) as http,
        JevClient(api_key="private", http=http) as client,
        pytest.raises(ValueError, match="Jev"),
    ):
        client.ask("roles", {}, questions())


def test_budget_rejects_whole_batch_before_network() -> None:
    with (
        httpx.Client(transport=httpx.MockTransport(lambda r: pytest.fail("network"))) as http,
        JevClient(api_key="private", http=http, max_calls=1) as client,
        pytest.raises(ValueError, match="budget"),
    ):
        client.ask("roles", {}, questions(33))


def test_error_does_not_expose_response_or_key() -> None:
    with (
        httpx.Client(
            transport=httpx.MockTransport(
                lambda r: httpx.Response(401, text="private response body")
            )
        ) as http,
        JevClient(api_key="secret-key", http=http) as client,
    ):
        with pytest.raises(RuntimeError) as exc:
            client.ask("roles", {}, questions())
        assert str(exc.value) == "Jev request returned HTTP 401"


def test_noul_response_and_missing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from allaroundfood.parsing.jev_client import settings

    monkeypatch.setattr(settings, "typesafe_api_key", None)
    with pytest.raises(RuntimeError, match="TYPESAFE_API_KEY"):
        JevClient()

    def handle(request: httpx.Request) -> httpx.Response:
        payload = reply(request).json()
        payload["answers"] = {"q0": {"type": "noul", "noul": 0.9}}
        return httpx.Response(200, json=payload)

    with (
        httpx.Client(transport=httpx.MockTransport(handle)) as http,
        JevClient(api_key="key", http=http) as client,
    ):
        assert (
            client.ask(
                "labels",
                {},
                {
                    "q0": {
                        "type": "noul",
                        "instructions": "Is this an ingredient?",
                        "criteria": "Ingredient",
                    }
                },
            )["q0"]["noul"]
            == 0.9
        )


def test_full_payload_size_and_expired_deadline_prevent_network() -> None:
    with (
        httpx.Client(transport=httpx.MockTransport(lambda r: pytest.fail("network"))) as http,
        JevClient(api_key="key", http=http) as client,
        pytest.raises(ValueError, match="budget"),
    ):
        q = questions()
        q["q0"]["instructions"] = "x" * 500_001
        client.ask("roles", {}, q)
    with (
        httpx.Client(transport=httpx.MockTransport(lambda r: pytest.fail("network"))) as http,
        JevClient(api_key="key", http=http, deadline_s=0) as client,
        pytest.raises(RuntimeError, match="timed out"),
    ):
        client.ask("roles", {}, questions())
