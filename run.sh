#!/bin/sh
# Launcher for MovieNight. Reads env from /usr/local/etc/movienight.env, then
# starts either the production node build or the vite dev server based on
# MOVIENIGHT_MODE (default: prod).

set -eu

if [ -r /usr/local/etc/movienight.env ]; then
  set -a
  . /usr/local/etc/movienight.env
  set +a
fi

cd /opt/movienight-svelte

PORT="${PORT:-8089}"
HOST="${HOST:-127.0.0.1}"
MODE="${MOVIENIGHT_MODE:-prod}"

case "$MODE" in
  dev)
    exec /usr/local/bin/node node_modules/vite/bin/vite.js dev \
      --host "$HOST" --port "$PORT" --strictPort
    ;;
  prod|*)
    exec /usr/local/bin/node build/index.js
    ;;
esac
