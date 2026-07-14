"""Parse-queue worker (ADR 0008: queue everything, URL cache in parse_results).

Runnable as ``python -m allaroundfood.worker``. Flow per drain:

    build service client → claim pending jobs (status→running) → per job:
    normalize URL → cache lookup → hit: mark done · miss: parse (video / web /
    screenshot) → upsert parse_results → mark done pointing at the result.

Design invariants (carried over from the ADR-0007 worker):

- **One bad job never aborts the run** — failures land on the row (``failed``).
- **Idempotency** — results are keyed by normalized URL and upserted, so a
  retry after a partial write converges to the same row.
- **Evals are fire-and-forget** — graded into the local parquet ``EvalStore``;
  a judge error must never fail the job.
- **Exit codes** — 0 even when individual jobs fail; non-zero only on fatal
  startup misconfig (missing Supabase creds).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from allaroundfood.config import settings
from allaroundfood.parsing.recipe_parser import (
    parse_recipe_from_image,
    parse_recipe_from_url,
    parse_recipe_from_video_text,
)
from allaroundfood.supabase_client import (
    claim_pending_jobs,
    download_import,
    get_service_client,
    lookup_parse_result,
    mark_job_done,
    mark_job_failed,
    upsert_parse_result,
)
from allaroundfood.url_normalize import normalize_url
from allaroundfood.video_import import (
    VideoImportError,
    fetch_video_text,
    validate_video_url,
)

if TYPE_CHECKING:
    from supabase import Client

    from allaroundfood.parsing.recipe_parser import RecipeParseResult

logger = logging.getLogger("allaroundfood.worker")

# Local eval store (laptop-side per ADR 0008; no Supabase evaluations table).
EVALS_PATH = settings.pricing_data_dir / "evaluations.parquet"

# Storage-object extension → Anthropic image media type (default image/jpeg).
_MEDIA_TYPE_BY_EXT: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
_DEFAULT_MEDIA_TYPE = "image/jpeg"


def _media_type_for(screenshot_path: str) -> str:
    return _MEDIA_TYPE_BY_EXT.get(Path(screenshot_path).suffix.lower(), _DEFAULT_MEDIA_TYPE)


# ── Evals (fire-and-forget, local parquet) ───────────────────────────────────


def _run_eval(job: dict[str, Any], parse: RecipeParseResult) -> None:
    """Grade a successful parse and append it to the local EvalStore."""
    import json
    import uuid

    from allaroundfood.eval_storage import EvalStore
    from allaroundfood.models import Evaluation
    from allaroundfood.parsing.judge import RecipeUrlTextSource, grade_recipe_parse

    source_kind: Literal["url", "image"] = "url" if job.get("source_url") else "image"
    source_ref = str(job.get("source_url") or job.get("screenshot_path") or job.get("id", ""))
    source_content = (
        RecipeUrlTextSource(text=parse.stripped_text) if parse.stripped_text is not None else None
    )
    grade = grade_recipe_parse(
        source_kind=source_kind,
        source_ref=source_ref,
        worker_prompt=parse.worker_prompt,
        worker_output=parse.recipe,
        source_content=source_content,
    )
    evaluation = Evaluation(
        id=str(uuid.uuid4()),
        source_kind=source_kind,
        source_ref=source_ref,
        worker_model="claude-haiku-4-5",
        worker_prompt=parse.worker_prompt,
        worker_output=json.dumps(parse.recipe.model_dump(mode="json")),
        worker_parse_confidence=parse.recipe.parse_confidence,
        judge_model="claude-sonnet-4-6",
        judge_prompt=grade.judge_prompt,
        raw_judge_output=grade.raw_judge_output,
        **grade.verdict,
    )
    EvalStore.load(EVALS_PATH).add(evaluation).save()


def _maybe_run_eval(job: dict[str, Any], parse: RecipeParseResult) -> None:
    if not settings.run_evals:
        return
    try:
        _run_eval(job, parse)
    except Exception as exc:  # noqa: BLE001 — evals are strictly best-effort.
        logger.warning("eval skipped for job %s: %s", job.get("id"), exc)


# ── Dispatch ─────────────────────────────────────────────────────────────────


def _parse_url_job(source_url: str) -> tuple[RecipeParseResult, str | None]:
    """Parse a URL job (video platforms → video path, else web page).

    Returns the parse result and the transcript (video only, else None).
    """
    try:
        validate_video_url(source_url)
    except VideoImportError:
        return parse_recipe_from_url(source_url), None
    video = asyncio.run(fetch_video_text(source_url))
    parse = parse_recipe_from_video_text(
        caption=video.caption,
        transcript=video.transcript,
        source_url=video.source_url,
    )
    return parse, video.transcript


def dispatch_job(client: Client, job: dict[str, Any]) -> None:
    """Handle one claimed job; raises on failure (caller marks ``failed``)."""
    job_id = str(job["id"])
    source_url = job.get("source_url")

    if isinstance(source_url, str) and source_url:
        key = normalize_url(source_url)
        if lookup_parse_result(client, key) is not None:
            logger.info("job %s: cache hit for %s", job_id, key)
            mark_job_done(client, job_id, key)
            return
        parse, transcript = _parse_url_job(key)
    else:
        screenshot_path = job.get("screenshot_path")
        if not isinstance(screenshot_path, str) or not screenshot_path:
            raise RuntimeError("job has neither source_url nor screenshot_path")
        key = f"screenshot:{screenshot_path}"
        if lookup_parse_result(client, key) is not None:
            logger.info("job %s: result already written for %s", job_id, key)
            mark_job_done(client, job_id, key)
            return
        data = download_import(client, screenshot_path)
        parse = parse_recipe_from_image(data, _media_type_for(screenshot_path))
        transcript = None

    upsert_parse_result(client, key, parse.recipe, transcript)
    mark_job_done(client, job_id, key)
    _maybe_run_eval(job, parse)


def process_job(client: Client, job: dict[str, Any]) -> bool:
    """Process one claimed job end-to-end; never raises for job-level problems."""
    job_id = str(job.get("id", ""))
    try:
        dispatch_job(client, job)
    except Exception as exc:  # noqa: BLE001 — one bad job must not abort the run.
        logger.exception("job %s failed", job_id)
        try:
            mark_job_failed(client, job_id, str(exc))
        except Exception:  # noqa: BLE001 — even the failure-write is best-effort.
            logger.exception("failed to mark job %s as failed", job_id)
        return False
    logger.info("job %s done", job_id)
    return True


def drain_once(client: Client, limit: int) -> int:
    """Claim up to ``limit`` pending jobs and process them all."""
    jobs = claim_pending_jobs(client, limit, settings.worker_max_attempts)
    if not jobs:
        logger.info("no pending jobs")
        return 0
    logger.info("claimed %d job(s)", len(jobs))
    for job in jobs:
        process_job(client, job)
    return len(jobs)


def process_single_job(client: Client, job_id: str) -> int:
    """Reprocess exactly one job by id (debugging path for ``--job-id``)."""
    response = client.table("parse_jobs").select("*").eq("id", job_id).execute()
    rows: list[dict[str, Any]] = response.data or []  # type: ignore[assignment]
    if not rows:
        logger.warning("job %s not found", job_id)
        return 0
    process_job(client, rows[0])
    return 1


# ── CLI ──────────────────────────────────────────────────────────────────────


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m allaroundfood.worker",
        description="Drain the parse_jobs queue (ADR 0008).",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="Drain pending jobs and exit (default).")
    mode.add_argument("--watch", action="store_true", help="Poll the queue forever.")
    parser.add_argument("--interval", type=float, default=30.0, help="Watch poll seconds.")
    parser.add_argument("--limit", type=int, default=10, help="Max jobs per drain.")
    parser.add_argument("--job-id", type=str, default=None, help="Reprocess one job by id.")
    return parser


def main(argv: list[str] | None = None) -> int:
    """CLI entry point. Returns a process exit code (0 unless startup fails)."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    args = _build_parser().parse_args(argv)

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

    drain_once(client, args.limit)
    return 0


if __name__ == "__main__":
    sys.exit(main())
