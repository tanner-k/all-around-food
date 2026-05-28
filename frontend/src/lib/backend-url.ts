/**
 * Single source of truth for the FastAPI backend base URL.
 *
 * Defaults to `http://127.0.0.1:8000` (NOT `localhost`) because Node's
 * undici fetch resolves `localhost` to `::1` (IPv6) first. uvicorn binds
 * IPv4 only by default (`host="0.0.0.0"`), so fetch attempts the IPv6
 * address and fails with ECONNREFUSED before falling back to IPv4 —
 * surfacing as `TypeError: fetch failed` in API routes. Hard-coding IPv4
 * avoids the race entirely.
 *
 * Override with `BACKEND_URL` in `frontend/.env.local`. Remember to
 * restart `pnpm dev` after editing — Next.js only reads `.env` at
 * startup.
 */
export const BACKEND_URL: string =
  process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
