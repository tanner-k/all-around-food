# Personal Mac Mini import worker

The personal Mac Mini runs the recipe-import watcher with its native Python
3.12 virtualenv, `ffmpeg`, and the `yt-dlp` installed in that virtualenv. It
does not need Docker Desktop. `backend/Dockerfile.worker` remains available for
future hosted deployment.

This setup only makes outbound requests: to Supabase, Anthropic, permitted
recipe/video sites, and model download hosting. Do not open ports or configure
tunnels for the worker.

## Prepare the actual Mac Mini

First discover the real checkout and log-in user on the Mac Mini. Do not run
the install command from another machine or infer success from this repository.

```sh
cd /actual/path/to/all-around-food/backend
uv venv --python 3.12
uv sync
brew install ffmpeg
mkdir -p "$HOME/Library/Application Support/allaroundfood/whisper"
chmod 700 "$HOME/Library/Application Support/allaroundfood" \
  "$HOME/Library/Application Support/allaroundfood/whisper"
```

Create `backend/.env` on that Mac with mode `600`. It must contain nonempty
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY_PARSING`, and
`IMPORT_OWNER_USER_ID`; set `RUN_EVALS=false`, `WHISPER_MODEL=base.en`, and
`WHISPER_MODELS_DIR` to the directory below. Keep the service-role and Anthropic
keys on the Mac Mini; never copy them to Vercel or the frontend.

```sh
chmod 600 /actual/path/to/all-around-food/backend/.env
export WHISPER_MODELS_DIR="$HOME/Library/Application Support/allaroundfood/whisper"
/actual/path/to/all-around-food/backend/.venv/bin/python -c \
  'import os; from pywhispercpp.model import Model; Model("base.en", models_dir=os.environ["WHISPER_MODELS_DIR"])'
test -f "$WHISPER_MODELS_DIR/ggml-base.en.bin"
```

The model command downloads and opens the base.en file once. It does not print
configuration values. The installer checks only whether required names are set,
never their values.

## Generate and validate the service definition

Run this on the Mac Mini as the user who will stay logged in. It creates a
mode-600 plist and mode-700 log directory, then validates the plist with
`plutil -lint`. It never invokes `launchctl`, changes power settings, installs
Docker, or starts the worker.

```sh
CHECKOUT="/actual/path/to/all-around-food"
PLIST="$HOME/Library/LaunchAgents/com.allaroundfood.worker.plist"
bash "$CHECKOUT/infra/worker/install-macos-worker.sh" --repo "$CHECKOUT" --output "$PLIST"
```

Use `--check-only` to run prerequisite checks without writing a plist. The
generated plist has a resolved virtualenv Python, working directory of
`$CHECKOUT/backend` so `.env` resolves, `--watch --interval 30 --limit 1`,
`RunAtLoad`, `KeepAlive`, and `ThrottleInterval=30`. Its logs are private at
`$HOME/Library/Logs/allaroundfood/`.

`com.allaroundfood.worker.plist` in this folder is a reference shape, not an
installable file; it intentionally contains placeholders.

## Explicit launchd operation

Only after inspecting the generated plist and confirming the Mac Mini checkout
and user, resolve the path and choose to load it. These are the exact commands
for that machine after the `PLIST` assignment above; `PLIST` expands to the
real absolute plist path.

```sh
PLIST="$(cd "$(dirname "$PLIST")" && pwd -P)/$(basename "$PLIST")"
DOMAIN="gui/$(id -u)"
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl kickstart -k "$DOMAIN/com.allaroundfood.worker"
launchctl print "$DOMAIN/com.allaroundfood.worker"
# Later, to stop and remove the loaded job:
launchctl bootout "$DOMAIN" "$PLIST"
```

A LaunchAgent cannot run before FileVault is unlocked and this user logs in.
While the Mac is asleep, worker polling pauses; while it is off, nothing runs.
Pending remote jobs wait and the watcher resumes when the Mac returns and the
user logs in. Configure any sleep or wake behavior yourself in macOS System
Settings after deciding the power trade-off; this setup does not change it.

## Real-device verification checklist

Do these only after the service is installed on the actual Mac Mini, and retain
the command output as evidence before reporting it as running:

1. Queue a job owned by `IMPORT_OWNER_USER_ID`; inspect `launchctl print` and
   the private logs until the job completes.
2. Find the worker PID from `launchctl print`, terminate it, then confirm
   `KeepAlive` starts a replacement and polling resumes.
3. Turn the Mac off with a queued job. After boot and user login, confirm the
   watcher starts and drains the still-pending job.
4. During a claimed job, terminate the worker and confirm the queue's lease
   expiry/reclaim path recovers it. This depends on the Task 7 lease protocol;
   do not claim it passed until that code and a disposable queue are available.

No Mac Mini checkout, access, installation, or running status has been
established by committing these templates.
