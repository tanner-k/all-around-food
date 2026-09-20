# infra/

## Scope

Personal Mac Mini worker supervision templates and installation checks live in `worker/`. Vercel is the frontend deployment target; no GitHub deployment workflow exists. The exact Vercel project, stable production origin, and Mac installation have not been verified in this worktree.

The worker runs as a macOS LaunchAgent from a native Python 3.12 virtualenv. `worker/install-macos-worker.sh` checks a specific checkout and writes a resolved plist with private logs; it does not load the agent. The Mac-only environment holds `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY_PARSING`, and `IMPORT_OWNER_USER_ID`. Vercel receives only the public Supabase URL and anon key. The worker makes outbound connections only. It cannot run before FileVault unlock and user login, and its installer does not change sleep or power settings.

## Conventions

Do not commit secrets or deployment credentials. Test the generated plist and worker startup locally before installing. Verify the actual Mac's wake, offline, crash, and cleanup recovery before release. Keep the worker's queue protocol aligned with the deployed Supabase migration and frontend; stop any old worker before cutover. Do not run the legacy daily/Docker worker beside the leased Mac worker.
