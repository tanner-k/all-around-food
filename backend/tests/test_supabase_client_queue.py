"""Tests for the queue-v2 Supabase helpers (ADR 0008)."""

from __future__ import annotations

from typing import Any, cast

from allaroundfood import supabase_client as sc
from allaroundfood.models import Ingredient, Quantity, Recipe, Step


class FakeResponse:
    def __init__(self, data: Any) -> None:
        self.data = data


class FakeQuery:
    """Records the postgrest call chain and returns canned data on execute."""

    def __init__(self, log: list[tuple[str, Any]], data: Any) -> None:
        self._log = log
        self._data = data

    def select(self, cols: str) -> FakeQuery:
        self._log.append(("select", cols))
        return self

    def upsert(self, row: Any, on_conflict: str = "") -> FakeQuery:
        self._log.append(("upsert", (row, on_conflict)))
        return self

    def update(self, values: dict[str, Any]) -> FakeQuery:
        self._log.append(("update", values))
        return self

    def eq(self, col: str, value: Any) -> FakeQuery:
        self._log.append(("eq", (col, value)))
        return self

    def execute(self) -> FakeResponse:
        return FakeResponse(self._data)


class FakeClient:
    def __init__(self, data: Any = None) -> None:
        self.log: list[tuple[str, Any]] = []
        self.tables: list[str] = []
        self._data = data

    def table(self, name: str) -> FakeQuery:
        self.tables.append(name)
        return FakeQuery(self.log, self._data)


def _recipe() -> Recipe:
    return Recipe(
        id="r1",
        title="Toast",
        ingredients=[Ingredient(name="bread", quantity=Quantity(as_written="1 slice"))],
        steps=[Step(order=1, instruction="Toast it.")],
    )


def test_lookup_parse_result_hit() -> None:
    client = FakeClient(data=[{"normalized_url": "https://x.com/a", "recipe": {"title": "Toast"}}])
    row = sc.lookup_parse_result(cast(Any, client), "https://x.com/a")
    assert row is not None and row["recipe"] == {"title": "Toast"}
    assert client.tables == ["parse_results"]
    assert ("eq", ("normalized_url", "https://x.com/a")) in client.log


def test_lookup_parse_result_miss() -> None:
    client = FakeClient(data=[])
    assert sc.lookup_parse_result(cast(Any, client), "https://x.com/a") is None


def test_upsert_parse_result_serializes_recipe() -> None:
    client = FakeClient()
    sc.upsert_parse_result(cast(Any, client), "https://x.com/a", _recipe(), "hello")
    assert client.tables == ["parse_results"]
    op, (row, on_conflict) = client.log[0]
    assert op == "upsert" and on_conflict == "normalized_url"
    assert row["normalized_url"] == "https://x.com/a"
    assert row["recipe"]["title"] == "Toast"
    assert row["transcript"] == "hello"


def test_mark_job_done_sets_status_and_result_url() -> None:
    client = FakeClient()
    sc.mark_job_done(cast(Any, client), "job-1", "https://x.com/a")
    op, values = client.log[0]
    assert op == "update"
    assert values["status"] == "done"
    assert values["result_url"] == "https://x.com/a"
    assert values["error"] is None
    assert ("eq", ("id", "job-1")) in client.log


def test_mark_job_failed_sets_status_and_error() -> None:
    client = FakeClient()
    sc.mark_job_failed(cast(Any, client), "job-1", "boom")
    op, values = client.log[0]
    assert op == "update" and values["status"] == "failed" and values["error"] == "boom"
