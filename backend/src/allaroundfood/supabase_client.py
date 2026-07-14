"""Service-role Supabase access layer for the parse-queue worker (ADR 0008).

The worker runs outside any user session, so it authenticates with the
``SUPABASE_SERVICE_ROLE_KEY`` — which **bypasses RLS**. It only touches the
queue (``parse_jobs``), the URL cache (``parse_results``), and the private
``imports`` Storage bucket; ``parse_results`` carries no ``user_id``.

This module only builds the client and provides thin CRUD/RPC helpers the worker
loop calls; it does not run the parsers (see ``parsing/``) or the loop itself
(see ``worker.py``).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from allaroundfood.config import settings

if TYPE_CHECKING:
    from supabase import Client

    from allaroundfood.models import Recipe

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


# --- Queue v2 (ADR 0008): parse_results cache + done/failed transitions ------


def lookup_parse_result(client: Client, normalized_url: str) -> dict[str, Any] | None:
    """Return the cached ``parse_results`` row for a normalized URL, or None."""
    response = (
        client.table("parse_results")
        .select("*")
        .eq("normalized_url", normalized_url)
        .execute()
    )
    rows: list[dict[str, Any]] = response.data or []  # type: ignore[assignment]
    return rows[0] if rows else None


def upsert_parse_result(
    client: Client, normalized_url: str, recipe: Recipe, transcript: str | None
) -> None:
    """Write a finished parse into the URL cache (idempotent on the key)."""
    row: dict[str, Any] = {
        "normalized_url": normalized_url,
        "recipe": recipe.model_dump(mode="json"),
        "transcript": transcript,
    }
    client.table("parse_results").upsert(row, on_conflict="normalized_url").execute()


def mark_job_done(client: Client, job_id: str, result_url: str) -> None:
    """Mark a job ``done``, pointing at its ``parse_results`` row."""
    client.table("parse_jobs").update(
        {"status": "done", "error": None, "result_url": result_url, "updated_at": _now_iso()}
    ).eq("id", job_id).execute()


def mark_job_failed(client: Client, job_id: str, message: str) -> None:
    """Mark a job ``failed`` and store the failure message."""
    client.table("parse_jobs").update(
        {"status": "failed", "error": message, "updated_at": _now_iso()}
    ).eq("id", job_id).execute()


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
