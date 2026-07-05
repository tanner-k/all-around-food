"""Import-queue worker loop (Phase 4 of the Supabase pivot).

Runnable as ``python -m allaroundfood.worker``. This module is the integration
point that ties the parsers (``parsing/``), the video importer
(``video_import``), the receipt OCR pipeline (``ocr/``), and the shopping-list
logic together behind the ``parse_jobs`` queue, writing every result back
through the service-role Supabase client (``supabase_client``).

Flow (see ``docs/plans/import-queue-worker.md`` §4.5–4.6):

    build service client → claim pending jobs → for each job, dispatch by
    ``kind`` → write the result → mark ``done`` / ``error``.

Design invariants:

- **One bad job never aborts the run.** Every dispatch is wrapped in
  try/except; a raised exception is recorded on the job via ``mark_error`` and
  the loop continues.
- **Idempotency.** A claimed job that already carries a ``result_recipe_id`` is
  skipped (marked ``done``) instead of re-parsed, so a reprocess after a partial
  write never creates a duplicate recipe.
- **Evals are fire-and-forget.** After a successful *recipe* parse, grading runs
  inside its own try/except that only logs on failure — a judge error must never
  fail or error the job.
- **Exit codes.** ``0`` even when individual jobs error (job-level errors live
  in the row); non-zero only on a fatal startup misconfig (e.g. missing DB
  creds surfaced by ``get_service_client``).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import tempfile
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any

from allaroundfood.config import settings
from allaroundfood.supabase_client import (
    download_import,
    get_service_client,
    insert_evaluation,
    insert_receipt,
    insert_recipe,
    insert_shopping_items,
    mark_done,
    mark_error,
)

if TYPE_CHECKING:
    from supabase import Client

    from allaroundfood.models import ShoppingListItem
    from allaroundfood.ocr.models import Receipt
    from allaroundfood.parsing.recipe_parser import RecipeParseResult

logger = logging.getLogger("allaroundfood.worker")

# Recipe-producing kinds — these link a ``result_recipe_id`` and run evals.
_RECIPE_KINDS = frozenset({"url", "video", "screenshot"})

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
        parse_recipe_from_url,
        parse_recipe_from_video_text,
    )

    kind = str(job["kind"])
    user_id = _job_user_id(job)

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
        parse = parse_recipe_from_video_text(
            caption=video.caption,
            transcript=video.transcript,
            source_url=video.source_url,
        )
    elif kind == "screenshot":
        storage_path = job.get("storage_path")
        if not isinstance(storage_path, str) or not storage_path:
            raise RuntimeError("screenshot job is missing storage_path")
        data = download_import(client, storage_path)
        parse = parse_recipe_from_image(data, _media_type_for(job))
    else:  # pragma: no cover — guarded by caller.
        raise RuntimeError(f"unsupported recipe kind: {kind}")

    recipe_id = insert_recipe(client, parse.recipe, user_id)
    mark_done(client, str(job["id"]), result_recipe_id=recipe_id)
    _maybe_run_eval(client, job, parse)


def _write_receipt_observations(receipt: Receipt) -> int:
    """Best-effort mapping of a receipt to price observations.

    Returns the count of observations written. Skipped (returning 0) when the
    pricing matcher or observation store cannot be constructed — receipt import
    must succeed even when the pricing domain is unavailable.
    """
    try:
        from allaroundfood.ocr.deps import (
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
    from allaroundfood.ocr.deps import get_receipt_parser
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
    elif kind == "receipt":
        _handle_receipt(client, job)
    elif kind == "shopping_list":
        _handle_shopping_list(client, job)
    else:
        raise RuntimeError(f"unknown job kind: {kind!r}")


def process_job(client: Client, job: dict[str, Any]) -> bool:
    """Process one claimed job end-to-end, isolating its failures.

    Returns ``True`` on success (or an idempotent skip), ``False`` when the job
    was marked ``error``. Never raises for job-level problems.
    """
    job_id = str(job.get("id", ""))
    kind = str(job.get("kind", ""))

    # Idempotency guard: a job that already produced a recipe is not re-parsed.
    existing_recipe_id = job.get("result_recipe_id")
    if isinstance(existing_recipe_id, str) and existing_recipe_id:
        logger.info(
            "job %s (kind=%s) already has result_recipe_id=%s — skipping",
            job_id,
            kind,
            existing_recipe_id,
        )
        mark_done(client, job_id, result_recipe_id=existing_recipe_id)
        return True

    try:
        dispatch_job(client, job)
    except Exception as exc:  # noqa: BLE001 — one bad job must not abort the run.
        logger.exception("job %s (kind=%s) failed", job_id, kind)
        try:
            mark_error(client, job_id, str(exc))
        except Exception:  # noqa: BLE001 — even the error-write is best-effort.
            logger.exception("failed to mark job %s as error", job_id)
        return False

    logger.info("job %s (kind=%s) done", job_id, kind)
    return True


def drain_once(client: Client, limit: int) -> int:
    """Claim up to ``limit`` pending jobs and process them all.

    Returns the number of jobs claimed (regardless of individual outcome).
    """
    from allaroundfood.supabase_client import claim_pending_jobs, recover_stale_jobs

    recovered = recover_stale_jobs(
        client,
        settings.worker_stale_after_minutes,
        settings.worker_max_attempts,
    )
    if recovered:
        logger.info("recovered %d stale job(s)", len(recovered))

    jobs = claim_pending_jobs(client, limit, settings.worker_max_attempts)
    if not jobs:
        logger.info("no pending jobs")
        return 0

    logger.info("claimed %d job(s)", len(jobs))
    for job in jobs:
        process_job(client, job)
    return len(jobs)


def process_single_job(client: Client, job_id: str) -> int:
    """Reprocess exactly one job by id (debugging path for ``--job-id``).

    Returns the number of jobs processed (0 if the id was not found).
    """
    response = client.table("parse_jobs").select("*").eq("id", job_id).execute()
    rows: list[dict[str, Any]] = response.data or []  # type: ignore[assignment]
    if not rows:
        logger.warning("job %s not found", job_id)
        return 0
    process_job(client, rows[0])
    return 1


# ── Operational checks ───────────────────────────────────────────────────────


def _secret_present(value: Any) -> bool:
    return value is not None and bool(value.get_secret_value())


def _video_settings() -> Any:
    from allaroundfood.video_import import VideoImportSettings

    return VideoImportSettings(
        ytdlp_bin=settings.ytdlp_bin,
        ffmpeg_bin=settings.ffmpeg_bin,
        whisper_model=settings.whisper_model,
        whisper_models_dir=(
            str(settings.whisper_models_dir) if settings.whisper_models_dir else None
        ),
    )


def _doctor_checks() -> list[tuple[str, bool, str]]:
    """Return worker preflight checks as ``(name, ok, detail)`` tuples."""
    from allaroundfood.video_import import check_video_import_binaries

    binary_status = check_video_import_binaries(_video_settings())
    qwen_path = settings.qwen_gguf_path
    whisper_dir = settings.whisper_models_dir

    checks: list[tuple[str, bool, str]] = [
        (
            "SUPABASE_URL",
            bool(settings.supabase_url),
            "set" if settings.supabase_url else "missing",
        ),
        (
            "SUPABASE_SERVICE_ROLE_KEY",
            _secret_present(settings.supabase_service_role_key),
            "set" if settings.supabase_service_role_key else "missing",
        ),
        (
            "ANTHROPIC_API_KEY_PARSING",
            _secret_present(settings.anthropic_api_key_parsing),
            "set" if settings.anthropic_api_key_parsing else "missing",
        ),
        (
            "yt-dlp",
            binary_status.ytdlp is not None,
            binary_status.ytdlp or f"missing; set YTDLP_BIN or install {settings.ytdlp_bin}",
        ),
        (
            "ffmpeg",
            binary_status.ffmpeg is not None,
            binary_status.ffmpeg or f"missing; set FFMPEG_BIN or install {settings.ffmpeg_bin}",
        ),
        ("WHISPER_MODEL", bool(settings.whisper_model), settings.whisper_model),
        (
            "WHISPER_MODELS_DIR",
            whisper_dir is None or whisper_dir.exists(),
            str(whisper_dir) if whisper_dir else "using pywhispercpp default cache",
        ),
        (
            "QWEN_GGUF_PATH",
            qwen_path is not None and qwen_path.is_file(),
            str(qwen_path) if qwen_path else "missing",
        ),
    ]
    return checks


def run_doctor() -> int:
    """Print worker readiness checks and return a shell-style exit code."""
    checks = _doctor_checks()
    for name, ok, detail in checks:
        marker = "ok" if ok else "FAIL"
        print(f"{marker:4} {name}: {detail}")
    return 0 if all(ok for _, ok, _ in checks) else 1


def prefetch_models() -> int:
    """Warm local model files used by video transcription and receipt OCR."""
    from allaroundfood.transcription import TranscriptionError, WhisperCppTranscriber

    if settings.whisper_models_dir is not None:
        settings.whisper_models_dir.mkdir(parents=True, exist_ok=True)

    try:
        WhisperCppTranscriber(
            model=settings.whisper_model,
            models_dir=settings.whisper_models_dir,
        )._load()
    except TranscriptionError as exc:
        print(f"FAIL whisper {settings.whisper_model}: {exc}")
        return 1

    print(f"ok   whisper {settings.whisper_model}")

    qwen_path = settings.qwen_gguf_path
    if qwen_path is None or not qwen_path.is_file():
        print("FAIL QWEN_GGUF_PATH: missing model file")
        return 1

    print(f"ok   QWEN_GGUF_PATH: {qwen_path}")
    return 0


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
    mode.add_argument(
        "--doctor",
        action="store_true",
        help="Check worker env, binaries, and local model paths without draining.",
    )
    mode.add_argument(
        "--prefetch-models",
        action="store_true",
        help="Download/cache Whisper and verify the configured Qwen GGUF.",
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
    parser.add_argument(
        "--job-id",
        type=str,
        default=None,
        help="Reprocess a single job by id (debugging); ignores --watch/--once.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """CLI entry point. Returns a process exit code (0 unless startup fails)."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    args = _build_parser().parse_args(argv)

    if args.doctor:
        return run_doctor()

    if args.prefetch_models:
        return prefetch_models()

    # A fatal misconfig (missing DB creds) raises here → non-zero exit.
    try:
        client = get_service_client()
    except RuntimeError:
        logger.exception("fatal: could not build the Supabase service client")
        return 2

    if args.job_id is not None:
        process_single_job(client, args.job_id)
        return 0

    if args.watch:
        logger.info("watch mode: polling every %.1fs (limit=%d)", args.interval, args.limit)
        try:
            while True:
                drain_once(client, args.limit)
                time.sleep(args.interval)
        except KeyboardInterrupt:  # pragma: no cover — interactive stop.
            logger.info("watch interrupted; exiting")
        return 0

    # Default: --once (claim → drain → exit).
    drain_once(client, args.limit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
