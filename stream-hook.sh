#!/bin/sh
# Notifies the movienight app of stream-state transitions. Called by
# mediamtx runOnReady / runOnNotReady hooks. $1 = "true" | "false".
exec /usr/local/bin/curl -sS -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"live\":$1}" \
  http://127.0.0.1:8089/api/internal/stream
