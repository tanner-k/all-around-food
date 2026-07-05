"""Entry point: `python -m allaroundfood` runs the import-queue worker."""

from __future__ import annotations

import sys

from allaroundfood.worker import main as worker_main


def main() -> None:
    """Run the worker CLI."""
    sys.exit(worker_main())


if __name__ == "__main__":
    main()
