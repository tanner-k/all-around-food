# backend/

## Scope
- HTTP/API endpoints
- Business logic & domain models
- Authentication / authorization
- Background jobs, schedulers, queue workers

## Not in scope
- UI rendering → `frontend/`
- Database schema → `data/`
- Cloud infrastructure → `infra/`

## Stack
Python 3.12 + Polars (file-backed; FastAPI planned)

## Runtime requirements
- `yt-dlp` for fetching supported Instagram/TikTok recipe video media and metadata
- `ffmpeg` for audio extraction/transcoding before transcription
- external `whispr` FastAPI service running at `WHISPR_URL` (default `http://localhost:8000`) for speech-to-text; prefer the external service over vendoring Whisper models into this repo

## Local skills / conventions
- test-driven-development
- python-reviewer

## Run
```bash
cd backend
uv run python -m allaroundfood
```

## Notes for agents
- One route file per resource (e.g. `routes/users.ts`)
- Validation at the edge (request → typed input) — never trust the client
- Errors surface as typed problem objects; do not throw raw strings
- All env access through a single `config.ts` — fail loudly if a required env var is missing
