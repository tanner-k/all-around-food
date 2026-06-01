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

## Local skills / conventions
- None yet — add as needed

## Notes for agents
- No Terraform state to manage for v1.
- Domain / DNS configuration: attach a custom domain in the Vercel dashboard and update `AUTH_URL` accordingly.
- If a future task requires EC2 or a separate service, open a new ADR before adding infra-as-code here.
