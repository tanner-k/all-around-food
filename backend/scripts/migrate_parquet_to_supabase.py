"""One-time migration: Parquet ``*Store`` files → Supabase Postgres tables.

Reads each ``data/*.parquet`` (recipes, meal_plans, shopping_list, pantry,
evaluations) plus ``data/pricing/*.parquet`` and ``data/receipts.parquet`` with
Polars, transforms each row to match the Supabase schema (see
``supabase/migrations/0001_init.sql``), and upserts into the matching table via
the ``supabase`` Python client (service-role key, which bypasses RLS).

Transforms applied:
  * JSON-string columns (recipes.ingredients/steps/…, evaluations.field_checks,
    receipts.line_items_json, the pricing ``metadata``/``attributes``/… columns)
    are parsed from stored JSON strings into Python objects so they land as jsonb.
  * datetimes are converted to ISO-8601 strings.
  * ``canonical_products.embedding`` (list[float]) is rendered as the pgvector
    literal ``"[0.1,0.2,...]"``.
  * ``meal_plans.meals`` (a JSON list of ``{day_index, recipe_id}``) is exploded
    into child ``planned_meals`` rows; the ``meal_plans`` header row keeps only
    ``id`` (= week_of), ``week_of`` and ``updated_at``.

Idempotent: every upsert is keyed on ``id`` (``on_conflict="id"``), so re-runs
are safe. Tables whose parquet file is absent are skipped with a notice (pricing
and receipt data may not exist yet).

Usage::

    # preview (no credentials needed):
    python backend/scripts/migrate_parquet_to_supabase.py --dry-run
    # real run (service-role key bypasses RLS; OWNER_USER_ID stamps row ownership):
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OWNER_USER_ID=<auth-user-uuid> \\
        python backend/scripts/migrate_parquet_to_supabase.py --only recipes --only pantry

Requires the ``migrate`` dependency group (``supabase>=2.0``); see
``supabase/README.md``.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Callable, Iterable, Iterator
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import polars as pl

if TYPE_CHECKING:
    from supabase import Client

# Default data dir: repo-root/data. This file lives at backend/scripts/, so the
# repo root is two parents up.
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = REPO_ROOT / "data"

BATCH_SIZE = 500

# JSON-string columns to decode into Python objects per table, keyed by the
# parquet column name. Decoded values land in the same-named jsonb column unless
# renamed by a per-table transform.
_JSON_COLUMNS: dict[str, tuple[str, ...]] = {
    "recipes": ("ingredients", "steps", "equipment", "dietary_tags", "nutrition"),
    "evaluations": ("strengths", "weaknesses", "field_checks"),
    "store_locations": ("metadata",),
    "canonical_products": ("attributes",),
    "retailer_skus": ("retailer_meta",),
}

# jsonb columns declared NOT NULL in the schema: a null decoded value must become
# the column's default ([] for arrays, {} for objects) to avoid a NOT NULL
# violation on insert. (Nullable jsonb like recipes.nutrition is omitted.)
_JSON_NOTNULL_DEFAULTS: dict[tuple[str, str], Any] = {
    ("recipes", "ingredients"): [],
    ("recipes", "steps"): [],
    ("recipes", "equipment"): [],
    ("recipes", "dietary_tags"): [],
    ("evaluations", "strengths"): [],
    ("evaluations", "weaknesses"): [],
    ("evaluations", "field_checks"): [],
    ("store_locations", "metadata"): {},
    ("canonical_products", "attributes"): {},
    ("retailer_skus", "retailer_meta"): {},
}


class TableSpec:
    """Describes how one parquet file maps to one Supabase table.

    Attributes:
        table: Destination Supabase table name.
        parquet: Parquet filename relative to its base directory.
        subdir: Optional subdirectory under the data dir (e.g. ``pricing``).
        transform: Per-row transform applied after generic JSON/datetime fixes.
        extra: Optional callable yielding additional ``(table, rows)`` pairs
            derived from the same dataframe (used to explode meal_plans).
    """

    def __init__(
        self,
        table: str,
        parquet: str,
        *,
        subdir: str | None = None,
        transform: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
        extra: Callable[[pl.DataFrame], Iterator[tuple[str, list[dict[str, Any]]]]]
        | None = None,
    ) -> None:
        self.table = table
        self.parquet = parquet
        self.subdir = subdir
        self.transform = transform
        self.extra = extra

    def path(self, data_dir: Path) -> Path:
        """Return the absolute parquet path under ``data_dir``."""
        base = data_dir / self.subdir if self.subdir else data_dir
        return base / self.parquet


def _to_iso(value: Any) -> Any:
    """Convert datetimes to ISO-8601 strings; pass other values through."""
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _decode_json(value: Any) -> Any:
    """Decode a JSON string into a Python object; pass non-strings through."""
    if value is None:
        return None
    if isinstance(value, str):
        return json.loads(value)
    return value


def _embedding_to_pgvector(value: Any) -> str | None:
    """Render an embedding list as the pgvector literal ``"[a,b,c]"``.

    Accepts a list/tuple/Polars Series of floats, or None. Returns None when the
    embedding is absent so the column stays null.
    """
    if value is None:
        return None
    floats: Iterable[Any] = value
    return "[" + ",".join(str(float(v)) for v in floats) + "]"


def _generic_row_fixes(table: str, row: dict[str, Any]) -> dict[str, Any]:
    """Apply table-agnostic fixes: decode JSON columns, ISO-format datetimes."""
    out: dict[str, Any] = {}
    json_cols = _JSON_COLUMNS.get(table, ())
    for key, value in row.items():
        if key in json_cols:
            decoded = _decode_json(value)
            if decoded is None and (table, key) in _JSON_NOTNULL_DEFAULTS:
                decoded = _JSON_NOTNULL_DEFAULTS[(table, key)]
            out[key] = decoded
        else:
            out[key] = _to_iso(value)
    return out


# --- Per-table transforms ---------------------------------------------------


def _transform_canonical_product(row: dict[str, Any]) -> dict[str, Any]:
    """Render the embedding as a pgvector literal."""
    row["embedding"] = _embedding_to_pgvector(row.get("embedding"))
    return row


def _transform_receipt(row: dict[str, Any]) -> dict[str, Any]:
    """Rename ``line_items_json`` → ``line_items`` (jsonb).

    Any ``user_id`` carried in the parquet is overwritten by the owner stamp in
    :func:`migrate`, so it is not handled here.
    """
    raw = row.pop("line_items_json", None)
    row["line_items"] = _decode_json(raw) if raw not in (None, "") else []
    return row


def _stamp_owner(rows: list[dict[str, Any]], owner: str) -> None:
    """Set ``user_id`` to the owner UUID on every row (in place).

    Required because the migration runs with the service-role key, where the
    column default ``auth.uid()`` evaluates to NULL and would violate the
    ``user_id NOT NULL`` constraint on every table.
    """
    for row in rows:
        row["user_id"] = owner


def _meal_plan_header(row: dict[str, Any]) -> dict[str, Any]:
    """Reduce a MealPlanStore row to the meal_plans header (id = week_of)."""
    week_of = row["week_of"]
    return {
        "id": week_of,
        "week_of": week_of,
        "updated_at": _to_iso(row.get("updated_at")),
    }


def _explode_planned_meals(
    df: pl.DataFrame,
) -> Iterator[tuple[str, list[dict[str, Any]]]]:
    """Explode meal_plans.meals JSON into child planned_meals rows.

    Each ``PlannedMeal({day_index, recipe_id})`` becomes one planned_meals row.
    The synthetic id is ``"{week_of}:{ordinal}"`` so re-runs upsert in place.
    """
    rows: list[dict[str, Any]] = []
    for record in df.iter_rows(named=True):
        week_of = record["week_of"]
        meals = _decode_json(record.get("meals")) or []
        for ordinal, meal in enumerate(meals):
            rows.append(
                {
                    "id": f"{week_of}:{ordinal}",
                    "meal_plan_id": week_of,
                    "day_index": meal["day_index"],
                    "recipe_id": meal.get("recipe_id"),
                }
            )
    if rows:
        yield ("planned_meals", rows)


# --- Table registry ---------------------------------------------------------

TABLE_SPECS: tuple[TableSpec, ...] = (
    TableSpec("recipes", "recipes.parquet"),
    TableSpec(
        "meal_plans",
        "meal_plans.parquet",
        transform=_meal_plan_header,
        extra=_explode_planned_meals,
    ),
    TableSpec("shopping_list_items", "shopping_list.parquet"),
    TableSpec("pantry_items", "pantry.parquet"),
    TableSpec("evaluations", "evaluations.parquet"),
    TableSpec("store_locations", "store_locations.parquet", subdir="pricing"),
    TableSpec(
        "canonical_products",
        "canonical_products.parquet",
        subdir="pricing",
        transform=_transform_canonical_product,
    ),
    TableSpec("retailer_skus", "retailer_skus.parquet", subdir="pricing"),
    TableSpec("price_observations", "price_observations.parquet", subdir="pricing"),
    TableSpec("receipts", "receipts.parquet", transform=_transform_receipt),
)


def _rows_for_spec(spec: TableSpec, df: pl.DataFrame) -> list[dict[str, Any]]:
    """Transform a dataframe into a list of upsert-ready dict rows."""
    rows: list[dict[str, Any]] = []
    for record in df.iter_rows(named=True):
        row = _generic_row_fixes(spec.table, dict(record))
        if spec.transform is not None:
            row = spec.transform(row)
        rows.append(row)
    return rows


def _batched(rows: list[dict[str, Any]], size: int) -> Iterator[list[dict[str, Any]]]:
    """Yield successive ``size``-length slices of ``rows``."""
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


def _upsert(client: Client, table: str, rows: list[dict[str, Any]]) -> None:
    """Upsert rows into ``table`` in batches, keyed on ``id``."""
    for batch in _batched(rows, BATCH_SIZE):
        client.table(table).upsert(batch, on_conflict="id").execute()


def _make_client() -> Client:
    """Construct a service-role Supabase client from environment variables.

    Raises:
        SystemExit: If required environment variables are missing.
    """
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit(
            "error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set "
            "(service-role key required to bypass RLS for the migration)."
        )
    from supabase import create_client

    return create_client(url, key)


def _selected_specs(only: list[str]) -> list[TableSpec]:
    """Return the specs to process, honoring ``--only`` filters.

    ``--only`` matches against destination table names. ``planned_meals`` is
    produced from the meal_plans spec, so selecting it also runs meal_plans.

    Raises:
        SystemExit: If an ``--only`` value matches no known table.
    """
    if not only:
        return list(TABLE_SPECS)

    known = {spec.table for spec in TABLE_SPECS} | {"planned_meals"}
    unknown = [name for name in only if name not in known]
    if unknown:
        sys.exit(f"error: unknown --only table(s): {', '.join(unknown)}")

    wanted = set(only)
    if "planned_meals" in wanted:
        wanted.add("meal_plans")
    return [spec for spec in TABLE_SPECS if spec.table in wanted]


def migrate(
    *,
    data_dir: Path,
    only: list[str],
    dry_run: bool,
    client: Client | None,
    owner: str | None,
) -> int:
    """Run the migration and return the total number of rows processed.

    Args:
        data_dir: Base directory holding the parquet files.
        only: Restrict to these destination tables (empty = all).
        dry_run: When True, read + transform + report counts but write nothing.
        client: A Supabase client, or None in dry-run mode.
        owner: Owner ``user_id`` (uuid) stamped on every row; None only in
            dry-run mode (no rows are written).

    Returns:
        Total rows transformed across all processed tables.
    """
    total = 0
    for spec in _selected_specs(only):
        path = spec.path(data_dir)
        if not path.exists():
            print(f"skip   {spec.table:<20} (no file at {path})")
            continue

        df = pl.read_parquet(path)
        rows = _rows_for_spec(spec, df)
        if owner is not None:
            _stamp_owner(rows, owner)

        if dry_run:
            print(f"would  {spec.table:<20} {len(rows):>6} rows  ({path.name})")
        else:
            assert client is not None  # guaranteed by main() when not dry-run
            _upsert(client, spec.table, rows)
            print(f"upsert {spec.table:<20} {len(rows):>6} rows  ({path.name})")
        total += len(rows)

        # Derived child tables (e.g. planned_meals from meal_plans).
        if spec.extra is not None:
            for child_table, child_rows in spec.extra(df):
                if only and child_table not in only and spec.table not in only:
                    continue
                if owner is not None:
                    _stamp_owner(child_rows, owner)
                if dry_run:
                    print(f"would  {child_table:<20} {len(child_rows):>6} rows  (derived)")
                else:
                    assert client is not None
                    _upsert(client, child_table, child_rows)
                    print(f"upsert {child_table:<20} {len(child_rows):>6} rows  (derived)")
                total += len(child_rows)

    return total


def main(argv: list[str] | None = None) -> int:
    """CLI entry point. Returns a process exit code."""
    parser = argparse.ArgumentParser(
        description="Migrate Parquet *Store files into Supabase Postgres tables."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read + transform + print row counts without writing to Supabase.",
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        metavar="TABLE",
        help="Restrict to this destination table (repeatable).",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help=f"Base data directory (default: {DEFAULT_DATA_DIR}).",
    )
    parser.add_argument(
        "--owner",
        default=None,
        metavar="UUID",
        help="Owner user_id (uuid) stamped on every migrated row. Defaults to "
        "$OWNER_USER_ID. Required unless --dry-run.",
    )
    args = parser.parse_args(argv)

    owner: str | None = args.owner or os.environ.get("OWNER_USER_ID")
    if not args.dry_run and not owner:
        sys.exit(
            "error: --owner <uuid> or OWNER_USER_ID must be set — the Supabase "
            "auth user that will own the migrated rows (rows are invisible under "
            "RLS without it)."
        )

    client: Client | None = None if args.dry_run else _make_client()

    total = migrate(
        data_dir=args.data_dir,
        only=args.only,
        dry_run=args.dry_run,
        client=client,
        owner=owner,
    )

    mode = "DRY RUN" if args.dry_run else "MIGRATED"
    print(f"\n{mode}: {total} total rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
