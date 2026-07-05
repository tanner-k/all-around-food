"""Service-role Supabase access layer for the import-queue worker.

The worker runs outside any user session, so it authenticates with the
``SUPABASE_SERVICE_ROLE_KEY`` — which **bypasses RLS**. Because service-role
calls have no ``auth.uid()``, the column default ``user_id default auth.uid()``
evaluates to NULL and would violate every table's ``user_id not null``
constraint. Every write helper here therefore stamps ``user_id`` explicitly from
the *job's* owner, exactly like ``scripts/migrate_parquet_to_supabase.py`` stamps
``OWNER_USER_ID``.

This module only builds the client and provides thin CRUD/RPC helpers the worker
loop calls; it does not run the parsers (see ``parsing/``) or the loop itself
(see ``worker.py``).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from allaroundfood.config import settings

if TYPE_CHECKING:
    from supabase import Client

    from allaroundfood.models import Recipe, ShoppingListItem
    from allaroundfood.ocr.models import Receipt

# Lazily constructed service-role singleton (see ``get_service_client``).
_client: Client | None = None

# The private Storage bucket import media is uploaded to (see 0002_storage.sql).
_IMPORTS_BUCKET = "imports"


def _now_iso() -> str:
    """Return the current UTC time as an ISO-8601 string for timestamptz columns."""
    return datetime.now(UTC).isoformat()


def get_service_client() -> Client:
    """Return a lazily-built service-role Supabase client (a process singleton).

    The client is built from ``settings.supabase_url`` and
    ``settings.supabase_service_role_key``. The service-role key bypasses RLS, so
    it must never leave the worker environment.

    Raises:
        RuntimeError: If ``SUPABASE_URL`` or ``SUPABASE_SERVICE_ROLE_KEY`` is unset.
    """
    global _client
    if _client is not None:
        return _client

    url = settings.supabase_url
    key = settings.supabase_service_role_key
    if not url or key is None:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the worker "
            "(service-role key required to bypass RLS and stamp user_id)."
        )

    from supabase import create_client

    _client = create_client(url, key.get_secret_value())
    return _client


# --- Queue lifecycle --------------------------------------------------------


def claim_pending_jobs(client: Client, limit: int, max_attempts: int) -> list[dict[str, Any]]:
    """Atomically claim up to ``limit`` pending jobs and return the claimed rows.

    Delegates to the ``claim_parse_jobs`` RPC (see
    ``supabase/migrations/0003_claim_and_payload.sql``), which flips each row to
    ``processing``, bumps ``attempts``, and uses ``for update skip locked`` so
    overlapping worker runs never claim the same row. Jobs whose ``attempts``
    have reached ``max_attempts`` (poison jobs) are not returned.

    Args:
        client: A service-role Supabase client.
        limit: Maximum number of jobs to claim in this call.
        max_attempts: Retry cap; a job is eligible only while attempts < this.

    Returns:
        The claimed ``parse_jobs`` rows as dicts (empty when none are pending).
    """
    response = client.rpc(
        "claim_parse_jobs",
        {"p_limit": limit, "p_max_attempts": max_attempts},
    ).execute()
    # postgrest types ``response.data`` as ``list[JSON]`` (a broad recursive union);
    # the claim RPC always returns ``parse_jobs`` rows, i.e. JSON objects.
    data: list[dict[str, Any]] = response.data or []  # type: ignore[assignment]
    return data


def recover_stale_jobs(
    client: Client, stale_after_minutes: int, max_attempts: int
) -> list[dict[str, Any]]:
    """Recover abandoned ``processing`` jobs before claiming new work.

    Delegates to ``recover_stale_parse_jobs``. Stale jobs under the retry cap
    are moved back to ``pending``; stale jobs at/over the cap become ``error`` so
    the UI does not show them as still running forever.
    """
    response = client.rpc(
        "recover_stale_parse_jobs",
        {
            "p_stale_after_minutes": stale_after_minutes,
            "p_max_attempts": max_attempts,
        },
    ).execute()
    data: list[dict[str, Any]] = response.data or []  # type: ignore[assignment]
    return data


def mark_done(client: Client, job_id: str, result_recipe_id: str | None = None) -> None:
    """Mark a job ``done``, optionally linking the recipe it produced.

    Args:
        client: A service-role Supabase client.
        job_id: The ``parse_jobs.id`` to update.
        result_recipe_id: The produced recipe's id, for recipe kinds; None for
            receipt/shopping-list kinds that write no recipe.
    """
    update: dict[str, Any] = {"status": "done", "error": None, "updated_at": _now_iso()}
    if result_recipe_id is not None:
        update["result_recipe_id"] = result_recipe_id
    client.table("parse_jobs").update(update).eq("id", job_id).execute()


def mark_error(client: Client, job_id: str, message: str) -> None:
    """Mark a job ``error`` and store the failure message.

    Args:
        client: A service-role Supabase client.
        job_id: The ``parse_jobs.id`` to update.
        message: Human-readable failure detail stored in ``parse_jobs.error``.
    """
    client.table("parse_jobs").update(
        {"status": "error", "error": message, "updated_at": _now_iso()}
    ).eq("id", job_id).execute()


# --- Result writes (each stamps user_id from the job's owner) ----------------


def insert_recipe(client: Client, recipe: Recipe, user_id: str) -> str:
    """Upsert a recipe row and return its id.

    Assigns a UUID ``id`` when the recipe has none, stamps ``user_id``, and
    serializes the nested pydantic fields (ingredients/steps/equipment/
    dietary_tags/nutrition) to JSON-compatible values via
    ``model_dump(mode="json")`` so they land in their jsonb columns. Upserts on
    ``id`` so re-inserting the same recipe (e.g. a reprocess) is idempotent.

    Args:
        client: A service-role Supabase client.
        recipe: The parsed recipe to persist.
        user_id: The owning auth user's uuid (from the job), stamped on the row.

    Returns:
        The recipe id written to the ``recipes`` table.
    """
    row = recipe.model_dump(mode="json")
    recipe_id = row.get("id") or str(uuid.uuid4())
    row["id"] = recipe_id
    row["user_id"] = user_id
    client.table("recipes").upsert(row, on_conflict="id").execute()
    return recipe_id


def insert_receipt(client: Client, receipt: Receipt, user_id: str) -> str:
    """Upsert a receipt row and return its id.

    The ``Receipt`` model already exposes ``line_items`` (a list of pydantic
    line items), which ``model_dump(mode="json")`` renders to the ``line_items``
    jsonb column (the schema's rename of the old ``line_items_json``). Assigns a
    UUID id when absent and stamps ``user_id``.

    Args:
        client: A service-role Supabase client.
        receipt: The parsed receipt to persist.
        user_id: The owning auth user's uuid (from the job), stamped on the row.

    Returns:
        The receipt id written to the ``receipts`` table.
    """
    row = receipt.model_dump(mode="json")
    receipt_id = row.get("id") or str(uuid.uuid4())
    row["id"] = receipt_id
    row["user_id"] = user_id
    client.table("receipts").upsert(row, on_conflict="id").execute()
    return receipt_id


def insert_shopping_items(
    client: Client, items: list[ShoppingListItem], user_id: str
) -> list[str]:
    """Upsert a batch of shopping-list items and return their ids.

    Assigns a UUID id to any item lacking one and stamps ``user_id`` on each.

    Args:
        client: A service-role Supabase client.
        items: The parsed shopping-list items to persist.
        user_id: The owning auth user's uuid (from the job), stamped on each row.

    Returns:
        The ids of the written ``shopping_list_items`` rows (empty when no items).
    """
    if not items:
        return []
    rows: list[dict[str, Any]] = []
    ids: list[str] = []
    for item in items:
        row = item.model_dump(mode="json")
        item_id = row.get("id") or str(uuid.uuid4())
        row["id"] = item_id
        row["user_id"] = user_id
        rows.append(row)
        ids.append(item_id)
    client.table("shopping_list_items").upsert(rows, on_conflict="id").execute()
    return ids


def insert_evaluation(client: Client, evaluation: dict[str, Any], user_id: str) -> str:
    """Upsert an evaluation row and return its id.

    The judge produces a plain dict (already JSON-compatible); this assigns a
    UUID id when absent and stamps ``user_id``.

    Args:
        client: A service-role Supabase client.
        evaluation: The judge's evaluation, as a JSON-compatible dict.
        user_id: The owning auth user's uuid (from the job), stamped on the row.

    Returns:
        The evaluation id written to the ``evaluations`` table.
    """
    row = dict(evaluation)
    eval_id = row.get("id") or str(uuid.uuid4())
    row["id"] = eval_id
    row["user_id"] = user_id
    client.table("evaluations").upsert(row, on_conflict="id").execute()
    return eval_id


# --- Storage ----------------------------------------------------------------


def download_import(client: Client, storage_path: str) -> bytes:
    """Download an import media object from the private ``imports`` bucket.

    Args:
        client: A service-role Supabase client.
        storage_path: The object path within the ``imports`` bucket
            (e.g. ``"<user_id>/<uuid>.jpg"``), as stored on ``parse_jobs.storage_path``.

    Returns:
        The raw object bytes.
    """
    data: bytes = client.storage.from_(_IMPORTS_BUCKET).download(storage_path)
    return data
