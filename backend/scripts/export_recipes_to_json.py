"""One-off export: data/recipes.parquet → JSON array for iOS first-run import.

Usage (from backend/):
    uv run python scripts/export_recipes_to_json.py \
        --parquet ../data/recipes.parquet --out ../data/recipes_export.json

The output is a JSON array of Recipe objects (``model_dump(mode="json")``) —
the iOS app imports this file via the Files picker on first run (ADR 0008).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from allaroundfood.config import REPO_ROOT
from allaroundfood.storage import RecipeStore


def export_recipes(parquet_path: Path, out_path: Path) -> int:
    """Write all recipes in the store to ``out_path`` as a JSON array.

    Args:
        parquet_path: The recipes parquet file (missing → empty export).
        out_path: Destination JSON file (overwritten).

    Returns:
        The number of recipes exported.
    """
    store = RecipeStore.load(parquet_path)
    recipes = [recipe.model_dump(mode="json") for recipe in store.all()]
    out_path.write_text(json.dumps(recipes, indent=2))
    return len(recipes)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parquet", type=Path, default=REPO_ROOT / "data" / "recipes.parquet")
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "data" / "recipes_export.json")
    args = parser.parse_args(argv)
    count = export_recipes(args.parquet, args.out)
    print(f"exported {count} recipe(s) → {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
