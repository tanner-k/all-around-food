"""Entry point: `python -m allaroundfood` starts the API server."""

from __future__ import annotations

import uvicorn


def main() -> None:
    """Start the API server."""
    uvicorn.run(
        "allaroundfood.api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )


if __name__ == "__main__":
    main()
