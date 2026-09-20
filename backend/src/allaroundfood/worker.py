"""Personal import worker that returns recoverable recipe drafts.

The active queue path claims owner jobs, renews leases during parsing, and
publishes JSON only through token-fenced Task 6 RPCs. A job error is isolated
from its siblings, and acknowledged or expired uploads are cleaned after a
drain cycle. The parser and video extractor load lazily.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import tempfile
import time
from pathlib import Path
from threading import Event, Thread
from typing import TYPE_CHECKING, Any

from allaroundfood.config import settings
from allaroundfood.supabase_client import (
    cleanup_import_jobs,
    download_import,
    fail_import_job,
    finish_import_job,
    get_service_client,
    insert_evaluation,
    insert_receipt,
    insert_shopping_items,
    mark_done,
    renew_import_job,
)

if TYPE_CHECKING:
    from supabase import Client

    from allaroundfood.models import ShoppingListItem
    from allaroundfood.ocr.models import Receipt
    from allaroundfood.parsing.recipe_parser import RecipeParseResult

logger = logging.getLogger("allaroundfood.worker")

# Recipe-producing kinds — these link a ``result_recipe_id`` and run evals.
_RECIPE_KINDS = frozenset({"url", "video", "screenshot", "text"})

# Storage-object extension → Anthropic image media type (default image/jpeg).
_MEDIA_TYPE_BY_EXT: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
_DEFAULT_MEDIA_TYPE = "image/jpeg"


# ── Small helpers ────────────────────────────────────────────────────────────


def _media_type_for(job: dict[str, Any]) -> str:
    """Infer the image media type for a screenshot job.

    Prefers an explicitly stored content type (``content_type`` /
    ``media_type`` columns, if present), else the ``storage_path`` extension,
    else ``image/jpeg``.
    """
    stored = job.get("content_type") or job.get("media_type")
    if isinstance(stored, str) and stored.strip():
        return stored.strip()
    storage_path = job.get("storage_path")
    if isinstance(storage_path, str):
        ext = Path(storage_path).suffix.lower()
        if ext in _MEDIA_TYPE_BY_EXT:
            return _MEDIA_TYPE_BY_EXT[ext]
    return _DEFAULT_MEDIA_TYPE


def _job_user_id(job: dict[str, Any]) -> str:
    """Return the owning user id for a job, or raise if it is missing.

    Every write stamps ``user_id`` from the job's owner (service-role has no
    ``auth.uid()``), so a job without one cannot be written.
    """
    user_id = job.get("user_id")
    if not isinstance(user_id, str) or not user_id:
        raise RuntimeError("job is missing user_id; cannot stamp result rows")
    return user_id


# ── Shopping-list parsing (deterministic split) ──────────────────────────────


def _parse_shopping_list_text(text: str) -> list[ShoppingListItem]:
    """Parse raw shopping-list text into ``ShoppingListItem`` rows.

    Deterministic line split (no LLM): one item per non-empty line. A trailing
    parenthesized or comma-separated segment is treated as ``quantity_text``,
    and the aisle is assigned via the keyword ``categorize`` classifier
    (falling back to ``"Other"``). Common bullet/checkbox prefixes are stripped.
    """
    import re
    import uuid

    from allaroundfood.aisles import categorize
    from allaroundfood.models import ShoppingListItem

    items: list[ShoppingListItem] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        # Strip leading bullets / checkboxes ("- ", "* ", "• ", "[ ] ", "1. ").
        line = re.sub(r"^\s*(?:[-*•]|\[\s?[xX ]?\]|\d+[.)])\s*", "", line).strip()
        if not line:
            continue

        name = line
        quantity_text: str | None = None

        # "flour (2 cups)" → name="flour", quantity_text="2 cups"
        paren = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", line)
        if paren and paren.group(1).strip():
            name = paren.group(1).strip()
            quantity_text = paren.group(2).strip() or None
        elif "," in line:
            # "flour, 2 cups" → split on the first comma.
            head, _, tail = line.partition(",")
            if head.strip():
                name = head.strip()
                quantity_text = tail.strip() or None

        items.append(
            ShoppingListItem(
                id=str(uuid.uuid4()),
                name=name,
                quantity_text=quantity_text,
                aisle=categorize(name),
                source="manual",
            )
        )
    return items


# ── Evals (fire-and-forget) ──────────────────────────────────────────────────


def _run_eval(
    client: Client,
    job: dict[str, Any],
    parse: RecipeParseResult,
) -> None:
    """Grade a successful recipe parse and persist the evaluation.

    Fire-and-forget: any failure (judge error, insert error) is logged and
    swallowed. Never called unless ``settings.run_evals`` is true.
    """
    import json

    from allaroundfood.parsing.judge import (
        RecipeUrlTextSource,
        grade_recipe_parse,
    )

    kind = str(job.get("kind", ""))
    # The judge understands "image" or "url" source kinds.
    source_kind = "image" if kind == "screenshot" else "url"
    source_ref = str(job.get("source_url") or job.get("storage_path") or job.get("id", ""))

    source_content: RecipeUrlTextSource | None = None
    if parse.stripped_text is not None:
        source_content = RecipeUrlTextSource(text=parse.stripped_text)

    grade = grade_recipe_parse(
        source_kind=source_kind,
        source_ref=source_ref,
        worker_prompt=parse.worker_prompt,
        worker_output=parse.recipe,
        source_content=source_content,
    )

    evaluation: dict[str, Any] = {
        "source_kind": source_kind,
        "source_ref": source_ref,
        "worker_model": "claude-haiku-4-5",
        "worker_prompt": parse.worker_prompt,
        "worker_output": json.dumps(parse.recipe.model_dump(mode="json")),
        "worker_parse_confidence": parse.recipe.parse_confidence,
        "judge_model": "claude-sonnet-4-6",
        "judge_prompt": grade.judge_prompt,
        "raw_judge_output": grade.raw_judge_output,
        **grade.verdict,
    }
    insert_evaluation(client, evaluation, _job_user_id(job))


def _maybe_run_eval(
    client: Client,
    job: dict[str, Any],
    parse: RecipeParseResult,
) -> None:
    """Invoke ``_run_eval`` when enabled, swallowing every error.

    A judge/eval failure must never fail or error the job, so this wrapper is
    the boundary that isolates it.
    """
    if not settings.run_evals:
        return
    try:
        _run_eval(client, job, parse)
    except Exception as exc:  # noqa: BLE001 — evals are strictly best-effort.
        logger.warning("eval skipped for job %s: %s", job.get("id"), exc)


# ── Per-kind dispatch ────────────────────────────────────────────────────────


def _handle_recipe_kind(client: Client, job: dict[str, Any]) -> None:
    """Handle a recipe-producing job (``url`` / ``video`` / ``screenshot``)."""
    from allaroundfood.parsing.recipe_parser import (
        parse_recipe_from_image,
        parse_recipe_from_text,
        parse_recipe_from_url,
        parse_recipe_from_video_text,
    )

    kind = str(job["kind"])
    _job_user_id(job)
    warnings: list[str] = []

    if kind == "url":
        source_url = job.get("source_url")
        if not isinstance(source_url, str) or not source_url:
            raise RuntimeError("url job is missing source_url")
        parse = parse_recipe_from_url(source_url)
    elif kind == "video":
        from allaroundfood.video_import import fetch_video_text, validate_video_url

        source_url = job.get("source_url")
        if not isinstance(source_url, str) or not source_url:
            raise RuntimeError("video job is missing source_url")
        validate_video_url(source_url)
        video = asyncio.run(fetch_video_text(source_url))
        if not video.transcript:
            warnings.append(
                "Only the video caption was available; on-screen text was not extracted."
            )
        parse = parse_recipe_from_video_text(
            caption=video.caption,
            transcript=video.transcript,
            source_url=video.source_url,
        )
    elif kind == "screenshot":
        storage_path = job.get("storage_path")
        if not isinstance(storage_path, str) or not storage_path:
            raise RuntimeError("screenshot job is missing storage_path")
        data = download_import(client, storage_path, _job_user_id(job))
        parse = parse_recipe_from_image(data, _media_type_for(job))
    elif kind == "text":
        payload = job.get("payload_text")
        if not isinstance(payload, str) or not payload.strip():
            raise RuntimeError("text job is missing recipe text")
        parse = parse_recipe_from_text(payload)
    else:  # pragma: no cover — guarded by caller.
        raise RuntimeError(f"unsupported recipe kind: {kind}")

    if (
        not parse.recipe.title.strip()
        or not parse.recipe.ingredients
        or not parse.recipe.steps
        or any(not ingredient.name.strip() for ingredient in parse.recipe.ingredients)
        or any(not step.instruction.strip() for step in parse.recipe.steps)
    ):
        raise RuntimeError("Insufficient ingredient or step evidence; edit or retry the source")
    token = str(job["claim_token"])
    lost = job.get("_claim_lost")
    if lost is not None and lost.is_set():
        raise RuntimeError("import claim lost during parsing")
    renew_import_job(client, str(job["id"]), token)
    finish_import_job(client, str(job["id"]), token, parse.recipe, warnings)


def _write_receipt_observations(receipt: Receipt) -> int:
    """Best-effort mapping of a receipt to price observations.

    Returns the count of observations written. Skipped (returning 0) when the
    pricing matcher or observation store cannot be constructed — receipt import
    must succeed even when the pricing domain is unavailable.
    """
    try:
        from allaroundfood.ocr.api.deps import (
            get_canonical_matcher,
            get_observation_store,
        )
        from allaroundfood.ocr.to_observations import map_receipt_to_observations
    except ImportError as exc:
        logger.warning("pricing/matcher unavailable — skipping observations: %s", exc)
        return 0

    try:
        matcher = get_canonical_matcher()
        observations = map_receipt_to_observations(receipt, matcher)
        if not observations:
            return 0
        store = get_observation_store()
        for obs in observations:
            store = store.add(obs)
        store.save()
        return len(observations)
    except Exception as exc:  # noqa: BLE001 — observations are strictly best-effort.
        logger.warning("failed to write price observations: %s", exc)
        return 0


def _handle_receipt(client: Client, job: dict[str, Any]) -> None:
    """Handle a ``receipt`` job: OCR the image, persist the receipt + prices."""
    from allaroundfood.ocr.api.deps import get_receipt_parser
    from allaroundfood.ocr.preprocess import preprocess_receipt

    user_id = _job_user_id(job)
    storage_path = job.get("storage_path")
    if not isinstance(storage_path, str) or not storage_path:
        raise RuntimeError("receipt job is missing storage_path")

    data = download_import(client, storage_path)
    ext = Path(storage_path).suffix.lower() or ".jpg"

    with tempfile.TemporaryDirectory(prefix="allaroundfood-receipt-") as tmp:
        tmp_path = Path(tmp)
        image_path = tmp_path / f"receipt{ext}"
        image_path.write_bytes(data)
        preprocessed = preprocess_receipt(image_path, output_dir=tmp_path)
        # The Qwen model loads lazily; a load/parse failure surfaces here and is
        # caught by the per-job handler → mark_error (never crashes the run).
        receipt = get_receipt_parser().parse(preprocessed)

    insert_receipt(client, receipt, user_id)
    written = _write_receipt_observations(receipt)
    logger.info("receipt job %s wrote %d observation(s)", job.get("id"), written)
    mark_done(client, str(job["id"]))


def _handle_shopping_list(client: Client, job: dict[str, Any]) -> None:
    """Handle a ``shopping_list`` job from pasted text or an uploaded file."""
    user_id = _job_user_id(job)

    payload_text = job.get("payload_text")
    if isinstance(payload_text, str) and payload_text.strip():
        text = payload_text
    else:
        storage_path = job.get("storage_path")
        if not isinstance(storage_path, str) or not storage_path:
            raise RuntimeError("shopping_list job has neither payload_text nor storage_path")
        text = download_import(client, storage_path).decode("utf-8", errors="replace")

    items = _parse_shopping_list_text(text)
    insert_shopping_items(client, items, user_id)
    logger.info("shopping_list job %s parsed %d item(s)", job.get("id"), len(items))
    mark_done(client, str(job["id"]))


def dispatch_job(client: Client, job: dict[str, Any]) -> None:
    """Dispatch a single claimed job by ``kind``.

    Raises on any failure; the caller (``process_job``) converts a raised
    exception into ``mark_error`` so one bad job never aborts the run.
    """
    kind = str(job.get("kind", ""))
    if kind in _RECIPE_KINDS:
        _handle_recipe_kind(client, job)
    else:
        raise RuntimeError(f"unsupported local draft kind: {kind!r}")


def _lease_heartbeat(client: Client, job_id: str, token: str, stop: Event, lost: Event) -> None:
    """Renew a claim during blocking media and model calls."""
    while not stop.wait(60):
        try:
            renew_import_job(client, job_id, token)
        except Exception:
            logger.exception("job %s lost its import claim", job_id)
            lost.set()
            return


def process_job(client: Client, job: dict[str, Any]) -> bool:
    """Process one claimed job end-to-end, isolating its failures.

    Returns ``True`` on success (or an idempotent skip), ``False`` when the job
    was marked ``error``. Never raises for job-level problems.
    """
    job_id = str(job.get("id", ""))
    kind = str(job.get("kind", ""))

    # Migration rows may already point at an old cloud recipe. Never rewrite them.
    existing_recipe_id = job.get("result_recipe_id")
    if job.get("result_recipe_json") is not None or (
        isinstance(existing_recipe_id, str) and existing_recipe_id
    ):
        logger.info(
            "job %s (kind=%s) already has result_recipe_id=%s — skipping",
            job_id,
            kind,
            existing_recipe_id,
        )
        return True

    token = job.get("claim_token")
    if not isinstance(token, str) or not token:
        logger.error("job %s has no claim token; refusing source fetch", job_id)
        return False
    if not settings.import_owner_user_id or job.get("user_id") != settings.import_owner_user_id:
        logger.error("job %s owner does not match configured import owner", job_id)
        try:
            fail_import_job(client, job_id, token, "Import owner mismatch")
        except Exception:
            logger.exception("could not fence owner mismatch for job %s", job_id)
        return False

    stop, lost = Event(), Event()
    heartbeat = Thread(
        target=_lease_heartbeat, args=(client, job_id, token, stop, lost), daemon=True
    )
    heartbeat.start()
    try:
        renew_import_job(client, job_id, token)
        dispatch_job(client, {**job, "_claim_lost": lost})
    except Exception as exc:  # noqa: BLE001 — one bad job must not abort the run.
        logger.exception("job %s (kind=%s) failed", job_id, kind)
        try:
            fail_import_job(client, job_id, token, str(exc))
        except Exception:  # noqa: BLE001 — even the error-write is best-effort.
            logger.exception("failed to record fenced error for job %s", job_id)
        return False
    finally:
        stop.set()
        heartbeat.join(timeout=2)

    logger.info("job %s (kind=%s) done", job_id, kind)
    return True


def drain_once(client: Client, limit: int) -> int:
    """Claim and process up to ``limit`` pending jobs one at a time.

    Returns the number of jobs claimed (regardless of individual outcome).
    """
    from allaroundfood.supabase_client import claim_pending_jobs

    claimed = 0
    for _ in range(max(limit, 0)):
        jobs = claim_pending_jobs(client, 1, settings.worker_max_attempts)
        if not jobs:
            break
        claimed += 1
        process_job(client, jobs[0])
    logger.info("claimed %d job(s)", claimed)
    try:
        cleanup_import_jobs(client)
    except Exception:
        logger.exception("import cleanup failed; will retry next cycle")
    return claimed


# ── CLI ──────────────────────────────────────────────────────────────────────


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m allaroundfood.worker",
        description="Drain the parse_jobs import queue.",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--once",
        action="store_true",
        help="Claim pending jobs, drain them, and exit (default behavior).",
    )
    mode.add_argument(
        "--watch",
        action="store_true",
        help="Poll the queue forever, draining each batch on an interval.",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=30.0,
        help="Seconds between polls in --watch mode (default: 30).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="Max jobs to claim per drain (default: 10).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """CLI entry point. Returns a process exit code (0 unless startup fails)."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    args = _build_parser().parse_args(argv)

    # A fatal misconfig (missing DB creds) raises here → non-zero exit.
    try:
        if not settings.import_owner_user_id:
            raise RuntimeError("IMPORT_OWNER_USER_ID must be set for the personal worker")
        client = get_service_client()
    except RuntimeError:
        logger.exception("fatal: could not build the Supabase service client")
        return 2

    if args.watch:
        logger.info("watch mode: polling every %.1fs (limit=%d)", args.interval, args.limit)
        try:
            failure_count = 0
            while True:
                try:
                    drain_once(client, args.limit)
                    failure_count = 0
                    time.sleep(args.interval)
                except Exception:
                    logger.exception("watch cycle failed; retrying")
                    time.sleep((5, 10, 20, 40, 60)[min(failure_count, 4)])
                    failure_count += 1
        except KeyboardInterrupt:  # pragma: no cover — interactive stop.
            logger.info("watch interrupted; exiting")
        return 0

    # Default: --once (claim → drain → exit).
    drain_once(client, args.limit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
