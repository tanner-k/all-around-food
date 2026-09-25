# infra/

## Scope

Personal Mac Mini worker supervision templates and installation checks live in `worker/`. Vercel serves the production frontend at https://all-around-food.vercel.app/app from `main`; no GitHub deployment workflow exists. The hosted import schema is in Supabase project `pkvdoucwssyjltvqsxcq`.

The worker runs on the Mac Mini from this checkout's `.worktrees/mac-import-worker` Python 3.12 virtualenv. Its mode-600 `backend/.env` holds the Jev and Supabase service-role credentials and the configured existing owner; `RUN_EVALS=false`. Jev, CPU-only `small.en` transcription, and Tesseract are installed. LaunchAgent `com.allaroundfood.worker` is running with the corrected virtualenv path and polls every 30 seconds after user login. `worker/install-macos-worker.sh` writes a resolved plist with private logs but does not load it. Vercel receives only the public Supabase URL and anon key. The worker makes outbound connections only and cannot run before FileVault unlock and user login.

## Conventions

Do not commit secrets or deployment credentials. The production Chrome test confirmed offline queue persistence, owner-scoped submission, a real Mac Jev result, local draft receipt, and acknowledgement. Mac sleep/crash recovery and physical iPhone/iPad behavior remain unverified; see `docs/testing/local-first-pwa-release.md`. Keep the worker's queue protocol aligned with the deployed Supabase migration and frontend. Do not run the legacy daily/Docker worker beside the leased Mac worker.
