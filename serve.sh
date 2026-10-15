#!/bin/sh
set -eu

usage() {
  printf 'Usage: %s [port]\nDefault: http://localhost:8000\n' "$0"
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac

port="${1:-8000}"
if [ "$#" -gt 1 ]; then
  usage >&2
  exit 1
fi
case "$port" in
  *[!0-9]*) printf 'Port must be a number from 1 to 65535.\n' >&2; exit 1 ;;
esac
if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
  printf 'Port must be a number from 1 to 65535.\n' >&2
  exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
printf 'Lamp Maker: http://localhost:%s\nPress Ctrl+C to stop.\n' "$port"
exec python3 -m http.server "$port" --bind 127.0.0.1 --directory "$script_dir"
