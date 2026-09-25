"""Immutable Polars-backed evaluation storage."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any

import polars as pl

from allaroundfood.models import Evaluation, JudgeFieldCheck

if TYPE_CHECKING:
    pass


class EvalStore:
    """Immutable Polars-backed evaluation store. Persists to a parquet file."""

    def __init__(self, path: Path, df: pl.DataFrame | None = None) -> None:
        """Initialize store with optional dataframe.

        Args:
            path: Path to parquet file.
            df: Polars DataFrame to use. If None, defaults to empty schema.
        """
        self._path = path
        if df is None:
            self._df = pl.DataFrame(
                {
                    "id": pl.Series([], dtype=pl.String),
                    "created_at": pl.Series([], dtype=pl.Datetime("us", "UTC")),
                    "source_kind": pl.Series([], dtype=pl.String),
                    "source_ref": pl.Series([], dtype=pl.String),
                    "worker_model": pl.Series([], dtype=pl.String),
                    "worker_prompt": pl.Series([], dtype=pl.String),
                    "worker_output": pl.Series([], dtype=pl.String),
                    "worker_parse_confidence": pl.Series([], dtype=pl.Float64),
                    "judge_model": pl.Series([], dtype=pl.String),
                    "judge_prompt": pl.Series([], dtype=pl.String),
                    "overall_grade": pl.Series([], dtype=pl.Int64),
                    "accuracy_grade": pl.Series([], dtype=pl.Int64),
                    "completeness_grade": pl.Series([], dtype=pl.Int64),
                    "reasoning": pl.Series([], dtype=pl.String),
                    "suggested_prompt_improvements": pl.Series([], dtype=pl.String),
                    "raw_judge_output": pl.Series([], dtype=pl.String),
                    "strengths": pl.Series([], dtype=pl.String),
                    "weaknesses": pl.Series([], dtype=pl.String),
                    "field_checks": pl.Series([], dtype=pl.String),
                }
            )
        else:
            self._df = df

    @classmethod
    def load(cls, path: Path) -> EvalStore:
        """Load from parquet; create empty if file doesn't exist.

        Args:
            path: Path to parquet file.

        Returns:
            EvalStore instance with loaded data or empty store.
        """
        if path.exists():
            df = pl.read_parquet(path)
            return cls(path, df)
        return cls(path)

    def save(self) -> None:
        """Write current dataframe to parquet."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._df.write_parquet(self._path)

    def add(self, evaluation: Evaluation) -> EvalStore:
        """Return a NEW EvalStore with the evaluation appended.

        Does not mutate self.

        Args:
            evaluation: Evaluation to add.

        Returns:
            New EvalStore instance with evaluation appended.
        """
        # Serialize nested objects to JSON
        strengths_json = json.dumps(evaluation.strengths)
        weaknesses_json = json.dumps(evaluation.weaknesses)
        field_checks_json = json.dumps(
            [fc.model_dump() for fc in evaluation.field_checks]
        )

        # Create new row
        new_row = pl.DataFrame(
            {
                "id": [evaluation.id],
                "created_at": [evaluation.created_at],
                "source_kind": [evaluation.source_kind],
                "source_ref": [evaluation.source_ref],
                "worker_model": [evaluation.worker_model],
                "worker_prompt": [evaluation.worker_prompt],
                "worker_output": [evaluation.worker_output],
                "worker_parse_confidence": [evaluation.worker_parse_confidence],
                "judge_model": [evaluation.judge_model],
                "judge_prompt": [evaluation.judge_prompt],
                "overall_grade": [evaluation.overall_grade],
                "accuracy_grade": [evaluation.accuracy_grade],
                "completeness_grade": [evaluation.completeness_grade],
                "reasoning": [evaluation.reasoning],
                "suggested_prompt_improvements": [evaluation.suggested_prompt_improvements],
                "raw_judge_output": [evaluation.raw_judge_output],
                "strengths": [strengths_json],
                "weaknesses": [weaknesses_json],
                "field_checks": [field_checks_json],
            }
        )

        # Append to existing dataframe (immutably)
        new_df = pl.concat([self._df, new_row])

        # Return new instance with updated dataframe
        return EvalStore(self._path, new_df)

    def all(self) -> list[Evaluation]:
        """Return all evaluations as a list of Evaluation instances.

        Returns:
            List of Evaluation objects from stored data, sorted by created_at desc.
        """
        # Sort by created_at descending
        df_sorted = self._df.sort("created_at", descending=True)
        evaluations: list[Evaluation] = []

        for row in df_sorted.iter_rows(named=True):
            # Deserialize JSON fields
            strengths_data = json.loads(row["strengths"])
            weaknesses_data = json.loads(row["weaknesses"])
            field_checks_data = json.loads(row["field_checks"])

            field_checks = [
                JudgeFieldCheck(**fc) for fc in field_checks_data
            ]

            evaluation = Evaluation(
                id=row["id"],
                created_at=row["created_at"],
                source_kind=row["source_kind"],
                source_ref=row["source_ref"],
                worker_model=row["worker_model"],
                worker_prompt=row["worker_prompt"],
                worker_output=row["worker_output"],
                worker_parse_confidence=row["worker_parse_confidence"],
                judge_model=row["judge_model"],
                judge_prompt=row["judge_prompt"],
                overall_grade=row["overall_grade"],
                accuracy_grade=row["accuracy_grade"],
                completeness_grade=row["completeness_grade"],
                strengths=strengths_data,
                weaknesses=weaknesses_data,
                field_checks=field_checks,
                reasoning=row["reasoning"],
                suggested_prompt_improvements=row["suggested_prompt_improvements"],
                raw_judge_output=row["raw_judge_output"],
            )
            evaluations.append(evaluation)

        return evaluations

    def stats(self) -> dict[str, Any]:
        """Return aggregate statistics about evaluations.

        Returns:
            Dictionary with keys:
                count: Total number of evaluations
                mean_overall: Mean overall grade (None if count==0)
                mean_accuracy: Mean accuracy grade (None if count==0)
                mean_completeness: Mean completeness grade (None if count==0)
                min_overall: Minimum overall grade (None if count==0)
                max_overall: Maximum overall grade (None if count==0)
                last_30d_count: Count of evaluations from last 30 days
        """
        count = len(self._df)

        if count == 0:
            return {
                "count": 0,
                "mean_overall": None,
                "mean_accuracy": None,
                "mean_completeness": None,
                "min_overall": None,
                "max_overall": None,
                "last_30d_count": 0,
            }

        # Calculate means
        mean_overall = self._df.select(pl.col("overall_grade").mean()).item()
        mean_accuracy = self._df.select(pl.col("accuracy_grade").mean()).item()
        mean_completeness = self._df.select(pl.col("completeness_grade").mean()).item()

        # Calculate min/max
        min_overall = self._df.select(pl.col("overall_grade").min()).item()
        max_overall = self._df.select(pl.col("overall_grade").max()).item()

        # Calculate 30-day count
        thirty_days_ago = datetime.now(UTC) - timedelta(days=30)
        last_30d_count = len(
            self._df.filter(pl.col("created_at") >= thirty_days_ago)
        )

        return {
            "count": count,
            "mean_overall": mean_overall,
            "mean_accuracy": mean_accuracy,
            "mean_completeness": mean_completeness,
            "min_overall": min_overall,
            "max_overall": max_overall,
            "last_30d_count": last_30d_count,
        }
