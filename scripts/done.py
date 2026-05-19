#!/usr/bin/env python3
"""Promote a TODO line to CHANGELOG.md under today's date.

Usage:
    python3 scripts/done.py "task description"

Behaviour:
    1. Removes the matching `- [ ] task description` or `- [x] task description`
       line from TODO.md.
    2. Appends `- task description` to CHANGELOG.md under today's
       (`YYYY-MM-DD`) heading. Creates the heading if it doesn't exist yet.
    3. Refreshes the README's "Recent updates" block with the top 5 entries
       (between `<!-- BEGIN:RECENT-UPDATES -->` and `<!-- END:RECENT-UPDATES -->`).

No external dependencies — stdlib only.
"""
from __future__ import annotations

import datetime as dt
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TODO = ROOT / "TODO.md"
LOG = ROOT / "CHANGELOG.md"
README = ROOT / "README.md"


def remove_from_todo(desc: str) -> bool:
    if not TODO.exists():
        return False
    lines = TODO.read_text().splitlines()
    targets = {f"- [ ] {desc}", f"- [x] {desc}", f"- [X] {desc}"}
    kept = [ln for ln in lines if ln.strip() not in targets]
    removed = len(kept) != len(lines)
    if removed:
        TODO.write_text("\n".join(kept) + "\n")
    return removed


def add_to_changelog(desc: str, today: str) -> None:
    if not LOG.exists():
        LOG.write_text(f"# Changelog\n\n## {today}\n- {desc}\n")
        return

    lines = LOG.read_text().splitlines()
    today_heading = f"## {today}"

    # If today's heading exists, insert under it.
    if any(ln.strip() == today_heading for ln in lines):
        out: list[str] = []
        inserted = False
        for ln in lines:
            out.append(ln)
            if not inserted and ln.strip() == today_heading:
                out.append(f"- {desc}")
                inserted = True
        LOG.write_text("\n".join(out) + "\n")
        return

    # Otherwise insert a fresh dated section just after the H1 title.
    out = []
    inserted = False
    for ln in lines:
        out.append(ln)
        if not inserted and ln.startswith("# "):
            out.extend(["", today_heading, f"- {desc}"])
            inserted = True
    if not inserted:
        out = lines + ["", today_heading, f"- {desc}"]
    LOG.write_text("\n".join(out) + "\n")


def latest_entries(n: int = 5) -> list[str]:
    """Return the top `n` `- foo` lines from CHANGELOG.md, ignoring headings."""
    if not LOG.exists():
        return []
    entries: list[str] = []
    for ln in LOG.read_text().splitlines():
        if ln.startswith("- "):
            entries.append(ln)
            if len(entries) >= n:
                break
    return entries


def refresh_readme_recent() -> None:
    if not README.exists():
        return
    entries = latest_entries(5)
    if not entries:
        return
    block = "<!-- BEGIN:RECENT-UPDATES -->\n" + "\n".join(entries) + "\n<!-- END:RECENT-UPDATES -->"
    pattern = re.compile(
        r"<!-- BEGIN:RECENT-UPDATES -->.*?<!-- END:RECENT-UPDATES -->",
        re.DOTALL,
    )
    current = README.read_text()
    if pattern.search(current):
        README.write_text(pattern.sub(block, current))


def main() -> int:
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print('Usage: python3 scripts/done.py "task description"', file=sys.stderr)
        return 1
    desc = sys.argv[1].strip()
    today = dt.date.today().isoformat()

    removed = remove_from_todo(desc)
    add_to_changelog(desc, today)
    refresh_readme_recent()

    if removed:
        print(f'✓ Promoted "{desc}" → CHANGELOG.md ({today})')
    else:
        print(f'⚠  "{desc}" was not found in TODO.md — added to CHANGELOG.md anyway ({today})')
    return 0


if __name__ == "__main__":
    sys.exit(main())
