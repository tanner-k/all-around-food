"""Small, offline checks for the experimental Jev text grouping pass."""

from __future__ import annotations

from typing import Any

import pytest

from allaroundfood.parsing import jev_prototype as jev


def test_segments_cover_sources_without_cross_source_boundaries() -> None:
    sources = {"caption": "1.5 cups milk\n2 eggs\nMix.", "transcript": "Use 1.5 cups. Then stir."}
    segments = jev._segment_sources(sources)
    for name, source in sources.items():
        parts = [s for s in segments if s["source"] == name]
        assert "".join(source[s["start"] : s["end"]] for s in parts) == source
        assert all(s["text"] == source[s["start"] : s["end"]] for s in parts)
    assert len([s for s in segments if s["source"] == "caption"]) == 3
    assert len([s for s in segments if s["source"] == "transcript"]) == 2
    assert "1.5 cups." in segments[-2]["text"]


def test_input_cap_rejects_without_api_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jev.httpx, "Client", lambda **kwargs: pytest.fail("API called"))
    with pytest.raises(ValueError, match="20,000"):
        jev.analyze_sources({"caption": "x" * 20_001}, "secret")


def test_blank_paragraphs_and_list_lines_are_hard_boundaries() -> None:
    source = "Intro\n\n- 1 cup flour\n- 2 eggs\nMethod:\n1. Mix."
    segments = jev._segment_sources({"caption": source})
    assert [part["text"] for part in segments] == [
        "Intro\n\n",
        "- 1 cup flour\n",
        "- 2 eggs\n",
        "Method:\n",
        "1. Mix.",
    ]


def test_many_segments_reject_call_budget_without_api_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(jev.httpx, "Client", lambda **kwargs: pytest.fail("API called"))
    with pytest.raises(ValueError, match="12-call budget"):
        jev.analyze_sources({"caption": "word\n" * 300}, "secret")


def test_two_stage_grouping_classification_and_provenance(monkeypatch: pytest.MonkeyPatch) -> None:
    requests: list[dict[str, Any]] = []

    class Response:
        status_code = 200

        def __init__(self, body: dict[str, Any]) -> None:
            self.body = body

        def json(self) -> dict[str, Any]:
            return self.body

    class Client:
        def __init__(self, **kwargs: Any) -> None:
            pass

        def __enter__(self) -> Client:
            return self

        def __exit__(self, *args: Any) -> None:
            return None

        def post(self, url: str, **kwargs: Any) -> Response:
            assert url == "https://api.typesafe.ai/v1/systemone"
            assert kwargs["headers"]["Authorization"] == "Bearer secret"
            body = kwargs["json"]
            requests.append(body)
            if len(requests) == 1:
                assert all(q["type"] == "noul" for q in body["questions"].values())
                answers = {
                    key: {"type": "noul", "noul": 0.9 if key == "b0" else 0.1}
                    for key in body["questions"]
                }
            else:
                assert all(q["type"] == "choice" for q in body["questions"].values())
                options = list(jev.LABELS)
                answers = {
                    key: {
                        "type": "choice",
                        "choice": "ingredient",
                        "confidence": 0.8,
                        "probabilities": {
                            label: (1.0 if label == "ingredient" else 0.0) for label in options
                        },
                    }
                    for key in body["questions"]
                }
            return Response(
                {
                    "model": "jev-1.13.0",
                    "answers": answers,
                    "usage": {"input_tokens": 10, "output_tokens": 2},
                }
            )

    monkeypatch.setattr(jev.httpx, "Client", Client)
    result = jev.analyze_sources(
        {"caption": "1 cup flour\n2 eggs\nMix.", "transcript": "Mix well."}, "secret"
    )
    assert len(requests) == 2
    assert len(result["blocks"]) == 3
    assert result["blocks"][0]["text"] == "1 cup flour\n2 eggs\n"
    assert result["blocks"][0]["classification"]["choice"] == "ingredient"
    assert result["boundaries"][0]["merged"] is True
    assert result["boundaries"][1]["merged"] is False
    assert all(b["source"] == b["segments"][0]["source"] for b in result["blocks"])
    assert [c["stage"] for c in result["calls"]] == ["grouping", "classification"]
    assert result["calls"][0]["usage"] == {"input_tokens": 10, "output_tokens": 2}


@pytest.mark.parametrize("answers", [{}, {"b0": {"type": "noul", "noul": float("nan")}}])
def test_missing_or_nonfinite_answer_is_rejected(
    monkeypatch: pytest.MonkeyPatch, answers: dict[str, Any]
) -> None:
    class Response:
        status_code = 200

        def json(self) -> dict[str, Any]:
            return {
                "model": "jev-1",
                "answers": answers,
                "usage": {"input_tokens": 1, "output_tokens": 1},
            }

    class Client:
        def __init__(self, **kwargs: Any) -> None:
            pass

        def __enter__(self) -> Client:
            return self

        def __exit__(self, *args: Any) -> None:
            return None

        def post(self, *args: Any, **kwargs: Any) -> Response:
            return Response()

    monkeypatch.setattr(jev.httpx, "Client", Client)
    with pytest.raises(ValueError, match="invalid Jev answer"):
        jev.analyze_sources({"caption": "One\nTwo"}, "secret")


def test_incomplete_choice_distribution_is_rejected() -> None:
    class Client:
        def post(self, *args: Any, **kwargs: Any) -> Any:
            class Response:
                status_code = 200

                def json(self) -> dict[str, Any]:
                    return {
                        "model": "jev-1",
                        "answers": {
                            "c0": {
                                "type": "choice",
                                "choice": "ingredient",
                                "confidence": 0.8,
                                "probabilities": {"ingredient": 1.0},
                            }
                        },
                        "usage": {"input_tokens": 1, "output_tokens": 1},
                    }

            return Response()

    questions = {"c0": {"type": "choice", "criteria": dict.fromkeys(jev.LABELS)}}
    with pytest.raises(ValueError, match="invalid Jev answer"):
        jev._request(Client(), "secret", "jev-latest", "classification", {}, questions, [])
