"""Run the isolated Jev experiment and write a self-contained review page.

Input is a JSON object mapping source names (caption, transcript) to text.
No queue, cookbook, or Anthropic operations are performed.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from dotenv import dotenv_values

from allaroundfood.parsing.jev_prototype import analyze_sources


def render_report(result: dict) -> str:
    """Render model decisions using textContent; source text is never executable."""
    payload = json.dumps(result, ensure_ascii=False).replace("<", "\\u003c")
    return PAGE.replace("__RESULT_JSON__", payload)


PAGE = Path(__file__).with_name("jev_review.html").read_text()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--env-file", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    key = dotenv_values(args.env_file).get("TYPESAFE_API_KEY")
    if not key:
        parser.error("TYPESAFE_API_KEY is missing from the specified environment file")
    sources = json.loads(args.input.read_text())
    result = analyze_sources(sources, key)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    (args.output / "review.html").write_text(render_report(result))
    print(
        json.dumps(
            {
                "blocks": len(result["blocks"]),
                "api_requests": len(result["calls"]),
                "labels": dict(Counter(b["classification"]["choice"] for b in result["blocks"])),
                "report": str(args.output / "review.html"),
            }
        )
    )


if __name__ == "__main__":
    main()
