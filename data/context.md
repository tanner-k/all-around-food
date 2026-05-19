# data/

## Scope
- Database schema definitions
- Migrations (forward + rollback)
- Seed data for local + test environments
- Shared query helpers used by both `backend/` and scripts

## Not in scope
- API endpoints → `backend/`
- UI-side data shaping → `frontend/`
- Infrastructure provisioning the database → `infra/`

## Stack
Parquet/CSV in data/ via Polars; migrate to Postgres later

## Local skills / conventions
- None yet — add as needed

## Migration workflow
1. Add a new file in `data/migrations/` named `YYYYMMDDHHMM_description.sql` (or your migration tool's format)
2. Write both **up** and **down** halves
3. Run `_n/a — Polars file-backed for now_` against the local DB
4. Verify with seeded data
5. Commit the migration alongside the code that uses it

## Notes for agents
- Never edit a migration that has shipped to `main` — write a new one
- Schema changes that break the API must come with a coordinated `backend/` change in the same PR
- Test data lives in `data/seeds/` — keep it small and meaningful, not exhaustive
