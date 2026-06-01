# infra/

## Scope

Vercel deployment configuration and notes. For v1, infrastructure is entirely Vercel-managed — there is no EC2, no Terraform, and no separate backend service.

- Vercel project root: `frontend/`
- Deploy trigger: Vercel Git integration (push to `main` → production; PRs → preview deploys)
- A `.github/workflows/deploy.yml` (Vercel CLI-based, with a `drizzle-kit migrate` step) is planned for task T9.

## Not in scope
- GitHub Actions CI workflows → `.github/workflows/` (at repo root)
- Application code → `frontend/`
- Database schema → `frontend/src/db/` (owned by T2)

## Stack
Vercel (serverless, Git integration). Vercel Postgres (Neon) for the database.

## Secrets management
All secrets are set as Vercel environment variables (Production + Preview environments). Never commit secrets to the repo. Required variables are documented in `.env.example` (task T1) and validated at startup in `frontend/src/lib/env.ts`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Vercel Postgres / Neon connection string |
| `ANTHROPIC_API_KEY` | Recipe import (server-side only) |
| `AUTH_SECRET` | Auth.js signing secret (`openssl rand -base64 32`) |
| `AUTH_URL` / `NEXTAUTH_URL` | Deployment URL |
| `ALLOWED_EMAILS` | Comma-separated email allowlist |
| OAuth provider creds | e.g. `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` |

## Domain / DNS

1. In the **Vercel dashboard** → Project → Settings → Domains, add your custom domain (e.g. `app.all-around-food.com`).
2. At your DNS registrar, add the CNAME or A records Vercel instructs you to create (typically a `CNAME` → `cname.vercel-dns.com` for subdomains, or two A records pointing to Vercel's IPs for apex domains).
3. After Vercel confirms the domain is verified, update the `AUTH_URL` environment variable in Vercel to match the canonical production URL (e.g. `https://app.all-around-food.com`).
4. Vercel provisions and auto-renews TLS certificates via Let's Encrypt — no manual cert management needed.
5. Redirection from `www` ↔ apex: configure in the Vercel Domains panel; Vercel handles the redirect at the edge.

## Security headers (T10)

Security headers are configured in `frontend/next.config.ts` via `async headers()` and apply to all routes (`/(.*)`). Headers set:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (2 years) |
| `Content-Security-Policy` | See below |

### CSP string (current)

```
default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

**Upgrade path:** `unsafe-inline` and `unsafe-eval` in `script-src` are currently required by the Next.js runtime. To remove them, implement a nonce-based CSP via Next.js middleware (see Next.js docs on "CSP with nonces"). Track this as a follow-up hardening task.

## Rate limiting (T10)

The `POST /api/recipes/import` endpoint is rate-limited at **10 requests per minute per client IP** (derived from `x-forwarded-for`, set by Vercel's edge). Excess requests receive HTTP `429` with a `Retry-After` header.

**In-memory limiter caveat:** The limiter (`frontend/src/lib/rate-limit.ts`) uses a module-level `Map`. On Vercel, each serverless function instance has its own memory — limits are enforced per-instance, not globally across all instances. For strict per-user enforcement in production, replace with a durable store such as **Vercel KV** (backed by Upstash Redis) and add the `@vercel/kv` package. The API of `checkRateLimit` is designed to make this swap straightforward.

## SSRF considerations (T10)

`POST /api/recipes/import` accepts a `url` parameter that the server fetches (in `lib/anthropic.ts → fetchPageText`). The following mitigations are applied at the schema/input layer (`app/api/recipes/import/route.ts`):

- **Protocol allow-list:** Only `http:` and `https:` URLs are accepted; `file:`, `ftp:`, `data:`, etc. are rejected by Zod validation.
- **Private-host block:** A regex (`PRIVATE_HOST_RE`) rejects URLs whose hostnames match `localhost`, `127.*`, `10.*`, `172.16–31.*`, `192.168.*`, `::1`, and `0.0.0.0`.

**Residual risk:** The hostname check is string-based and cannot prevent DNS rebinding attacks or IPv6 scope bypasses. A robust fix requires resolving the hostname at the OS level and checking the resulting IP before fetching — this would need a native addon or a dedicated microservice. For v1, the current input-layer check is documented here so future work can address it. Track as a follow-up hardening task.

## Local skills / conventions
- None yet — add as needed

## Notes for agents
- No Terraform state to manage for v1.
- If a future task requires EC2 or a separate service, open a new ADR before adding infra-as-code here.
