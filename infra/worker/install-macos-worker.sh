#!/usr/bin/env bash
# Generate and validate a user LaunchAgent plist. This script never calls launchctl.

set -euo pipefail

LABEL="com.allaroundfood.worker"
usage() {
    cat <<'USAGE'
Usage:
  install-macos-worker.sh --repo /absolute/checkout --output /absolute/plist [--check-only]

Checks the native worker prerequisites and writes a resolved LaunchAgent plist.
The output filename must be com.allaroundfood.worker.plist.
It does not bootstrap, kickstart, stop, or otherwise load launchd.
USAGE
}

fail() {
    printf 'error: %s\n' "$1" >&2
    exit 1
}

repo=""
output=""
check_only=false
while (($#)); do
    case "$1" in
        --repo)
            (($# >= 2)) || fail '--repo needs a path'
            repo="$2"
            shift 2
            ;;
        --output)
            (($# >= 2)) || fail '--output needs a path'
            output="$2"
            shift 2
            ;;
        --check-only)
            check_only=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            fail "unknown option: $1"
            ;;
    esac
done

[[ -n "$repo" ]] || fail '--repo is required'
if [[ "$check_only" == false ]]; then
    [[ -n "$output" ]] || fail '--output is required unless --check-only is used'
fi

repo=$(cd "$repo" && pwd -P) || fail "checkout does not exist: $repo"
backend="$repo/backend"
[[ -d "$backend" ]] || fail "backend directory is missing from checkout: $repo"
backend=$(cd "$backend" && pwd -P)
python_bin="$backend/.venv/bin/python"
[[ -x "$python_bin" ]] || fail "native virtualenv Python is missing: $python_bin"
python_bin=$(cd "$(dirname "$python_bin")" && pwd -P)/python

python_version=$("$python_bin" -c 'import sys; print("%d.%d" % sys.version_info[:2])')
[[ "$python_version" == "3.12" ]] || fail "worker virtualenv must use Python 3.12 (found $python_version)"

env_file="$backend/.env"
[[ -r "$env_file" ]] || fail "worker configuration is not owner-readable: $env_file"
env_file=$(cd "$(dirname "$env_file")" && pwd -P)/.env

file_mode() {
    if stat -f '%Lp' "$1" >/dev/null 2>&1; then
        stat -f '%Lp' "$1"
    else
        stat -c '%a' "$1"
    fi
}

case "$(file_mode "$env_file")" in
    400|600) ;;
    *) fail "worker configuration must be private (chmod 600 $env_file)" ;;
esac

config_value() {
    local value
    value=$(awk -F= -v key="$1" '$0 ~ "^" key "=" { sub("^[^=]*=", ""); value=$0 } END { print value }' "$env_file")
    case "$value" in
        \"*\") value="${value#\"}"; value="${value%\"}" ;;
        \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac
    printf '%s\n' "$value"
}

require_config() {
    local value
    value=$(config_value "$1")
    [[ -n "$value" ]] || fail "required configuration is missing or empty: $1"
}

for name in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ANTHROPIC_API_KEY_PARSING IMPORT_OWNER_USER_ID; do
    require_config "$name"
done
[[ "$(config_value RUN_EVALS)" == "false" ]] || fail 'RUN_EVALS must be false on the personal worker'
[[ "$(config_value WHISPER_MODEL)" == "base.en" ]] || fail 'WHISPER_MODEL must be base.en'
models_dir=$(config_value WHISPER_MODELS_DIR)
[[ -n "$models_dir" ]] || fail 'required configuration is missing or empty: WHISPER_MODELS_DIR'
[[ -f "$models_dir/ggml-base.en.bin" ]] || fail 'missing downloaded whisper base.en model: ggml-base.en.bin'

worker_path="$backend/.venv/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ffmpeg_bin=$(PATH="$worker_path" command -v ffmpeg || true)
ytdlp_bin=$(PATH="$worker_path" command -v yt-dlp || true)
[[ -n "$ffmpeg_bin" ]] || fail 'ffmpeg is unavailable on the worker PATH'
[[ -n "$ytdlp_bin" ]] || fail 'yt-dlp is unavailable on the worker PATH'
plutil_bin=$(command -v plutil || true)
[[ -n "$plutil_bin" ]] || fail 'plutil is unavailable; run this on macOS'

if [[ "$check_only" == true ]]; then
    printf 'preflight passed for %s; no plist was written or loaded.\n' "$backend"
    exit 0
fi

[[ "$output" = /* ]] || fail '--output must be an absolute path'
[[ "$(basename "$output")" == "$LABEL.plist" ]] || fail "--output filename must be $LABEL.plist"
if [[ -L "$output" ]]; then
    fail "--output must not be a symlink: $output"
fi
if [[ -e "$output" && ! -f "$output" ]]; then
    fail "--output must be a regular file or a new path: $output"
fi

output_parent=$(dirname "$output")
mkdir -p "$output_parent"
output_parent=$(cd "$output_parent" && pwd -P)
output="$output_parent/$LABEL.plist"
if [[ -L "$output" ]]; then
    fail "--output must not be a symlink: $output"
fi
if [[ -e "$output" && ! -f "$output" ]]; then
    fail "--output must be a regular file or a new path: $output"
fi
if [[ -f "$output" ]]; then
    if ! "$python_bin" - "$output" <<'PY'
import plistlib
import sys
from pathlib import Path

try:
    with Path(sys.argv[1]).open("rb") as file:
        payload = plistlib.load(file)
except Exception:
    raise SystemExit(1)

if not isinstance(payload, dict) or payload.get("Label") != "com.allaroundfood.worker":
    raise SystemExit(1)
PY
    then
        fail "existing --output must be a plist for $LABEL: $output"
    fi
fi

log_dir="$HOME/Library/Logs/allaroundfood"
install -d -m 700 "$log_dir"
log_dir=$(cd "$log_dir" && pwd -P)

umask 077
temporary_output=$(mktemp "$output_parent/.$LABEL.plist.XXXXXX")
cleanup() {
    if [[ -n "${temporary_output:-}" && -e "$temporary_output" ]]; then
        rm -f "$temporary_output"
    fi
}
trap cleanup EXIT

"$python_bin" - "$temporary_output" "$backend" "$python_bin" "$log_dir" "$worker_path" "$ffmpeg_bin" "$ytdlp_bin" <<'PY'
from __future__ import annotations

import os
import plistlib
import sys
from pathlib import Path

output, backend, python_bin, log_dir, worker_path, ffmpeg_bin, ytdlp_bin = (
    Path(sys.argv[1]).resolve(),
    Path(sys.argv[2]).resolve(),
    Path(sys.argv[3]).resolve(),
    Path(sys.argv[4]).resolve(),
    sys.argv[5],
    Path(sys.argv[6]).resolve(),
    Path(sys.argv[7]).resolve(),
)
payload = {
    "Label": "com.allaroundfood.worker",
    "ProgramArguments": [
        str(python_bin), "-m", "allaroundfood.worker", "--watch", "--interval", "30", "--limit", "1",
    ],
    "WorkingDirectory": str(backend),
    "EnvironmentVariables": {
        "PATH": worker_path,
        "FFMPEG_BIN": str(ffmpeg_bin),
        "YTDLP_BIN": str(ytdlp_bin),
        "PYTHONUNBUFFERED": "1",
    },
    "RunAtLoad": True,
    "KeepAlive": True,
    "ThrottleInterval": 30,
    "StandardOutPath": str(log_dir / "worker.out.log"),
    "StandardErrorPath": str(log_dir / "worker.err.log"),
}
with output.open("wb") as file:
    plistlib.dump(payload, file, sort_keys=False)
os.chmod(output, 0o600)
PY

"$plutil_bin" -lint "$temporary_output" >/dev/null
mv -f "$temporary_output" "$output"
printf 'generated and validated %s; it has not been loaded.\n' "$output"
