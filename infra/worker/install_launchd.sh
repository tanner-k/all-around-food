#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$script_dir/../.." && pwd)"
models_dir=""
docker_bin="$(command -v docker || true)"

usage() {
  cat <<'EOF'
Usage: infra/worker/install_launchd.sh --models PATH [--repo PATH] [--docker PATH]

Renders com.allaroundfood.worker.plist into ~/Library/LaunchAgents.

Options:
  --models PATH   Host model dir mounted at /models (required).
  --repo PATH     Repo checkout path (default: current repo).
  --docker PATH   Docker CLI path (default: command -v docker).
  -h, --help      Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --models)
      models_dir="${2:?missing value for --models}"
      shift 2
      ;;
    --repo)
      repo_dir="${2:?missing value for --repo}"
      shift 2
      ;;
    --docker)
      docker_bin="${2:?missing value for --docker}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$models_dir" ]; then
  echo "Missing required --models PATH" >&2
  usage >&2
  exit 2
fi

if [ -z "$docker_bin" ]; then
  echo "Could not find docker on PATH; pass --docker /path/to/docker" >&2
  exit 2
fi

repo_dir="$(cd "$repo_dir" && pwd)"
models_dir="$(cd "$models_dir" && pwd)"
docker_bin="$(cd "$(dirname "$docker_bin")" && pwd)/$(basename "$docker_bin")"

template="$script_dir/com.allaroundfood.worker.plist"
dest_dir="$HOME/Library/LaunchAgents"
dest="$dest_dir/com.allaroundfood.worker.plist"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

REPO="$repo_dir" MODELS="$models_dir" DOCKER="$docker_bin" perl -0pe '
  s/__REPO__/$ENV{REPO}/g;
  s/__MODELS__/$ENV{MODELS}/g;
  s/__DOCKER__/$ENV{DOCKER}/g;
' "$template" > "$tmp"

plutil -lint "$tmp" >/dev/null
mkdir -p "$dest_dir"
install -m 0644 "$tmp" "$dest"

cat <<EOF
Installed: $dest

Build image:
  docker build -f backend/Dockerfile.worker -t allaroundfood-worker backend

Load or reload:
  launchctl unload "$dest" 2>/dev/null || true
  launchctl load "$dest"

Run once now:
  launchctl start com.allaroundfood.worker

Inspect status:
  launchctl print "gui/\$(id -u)/com.allaroundfood.worker"

Logs:
  tail -f /tmp/allaroundfood-worker.out /tmp/allaroundfood-worker.err

Uninstall:
  launchctl unload "$dest"
  rm "$dest"
EOF
