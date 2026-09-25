"""Entry point: `python -m allaroundfood` starts the API server.

Honors the `PORT` and `HOST` env vars for local and deployed environments.
"""

from __future__ import annotations

import os

import uvicorn


def main() -> None:
    """Start the API server."""
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run(
        "allaroundfood.api:app",
        host=host,
        port=port,
        reload=True,
    )


if __name__ == "__main__":
    main()
