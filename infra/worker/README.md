# Import-queue worker — build & schedule

The worker is a single-shot container that drains the Supabase `parse_jobs`
queue: claim pending jobs → parse each by kind → write results to Supabase →
mark `done`/`error` → exit. Entry point `python -m allaroundfood.worker`,
default command `--once`. See [`docs/plans/import-queue-worker.md`](../../docs/plans/import-queue-worker.md)
§4.7–4.9.

## 1. Build the image

Build context is the `backend/` directory. From the repo root:

```sh
docker build -f backend/Dockerfile.worker -t allaroundfood-worker backend
```

Rebuild after any backend code or dependency change. The build compiles native
wheels (`llama-cpp-python`, `pywhispercpp`) in a builder stage, so the first
build is slow; the runtime image stays lean (slim base + ffmpeg only).

## 2. One-off drain (manual)

Model weights are **not** baked into the image — mount them at `/models`.
`$MODELS` is a host directory containing a `whisper/`
subdirectory.

```sh
MODELS=/path/to/models
docker run --rm --env-file backend/.env -v "$MODELS":/models allaroundfood-worker --once
```

Run this any time to drain the queue on demand. Other commands work by
overriding the CMD, e.g. `... allaroundfood-worker --watch` or
`... allaroundfood-worker --job-id <id>`.

Requirements: a filled-in `backend/.env` (Supabase service-role key, Anthropic
parsing key — see `backend/.env.example`) and a running Docker daemon.

## 3. Schedule it

### macOS — launchd (recommended for laptops)

`com.allaroundfood.worker.plist` fires daily at 08:00 via
`StartCalendarInterval`, which runs the job on the **next wake** if the Mac was
asleep at 08:00 (cron would skip it). Fill in the `__REPO__` and `__MODELS__`
placeholders, then:

```sh
cp infra/worker/com.allaroundfood.worker.plist ~/Library/LaunchAgents/
# edit ~/Library/LaunchAgents/com.allaroundfood.worker.plist — set __REPO__ / __MODELS__
launchctl load ~/Library/LaunchAgents/com.allaroundfood.worker.plist
launchctl start com.allaroundfood.worker   # optional: run once now to test
```

Logs: `/tmp/allaroundfood-worker.out` and `.err`. Full install/uninstall notes
are in the plist header.

### Linux — cron

`crontab.example` has the equivalent line (08:00 daily). Edit the two absolute
paths, then add it via `crontab -e`. Note cron does **not** catch up a run
missed while the host was off — fine for an always-on server/VM.

## 4. Cloud portability (no code change)

The exact same image runs unchanged as a scheduled cloud container: an **ECS
Scheduled Task** (EventBridge cron rule → RunTask `--once`), a **Fly.io**
scheduled machine, or **cron on a VM**. Only two things differ between local and
cloud — the environment source (a local `.env` file vs. a secrets manager /
task-definition env) and the model source (a local volume mounted at `/models`
vs. weights baked into the image or pulled from object storage on start). The
worker code, entry point, and `--once` contract stay identical (plan §4.9).
