#!/usr/bin/env bash
# Retry a pixellab `call` past the shared 8-concurrent-job rate limit.
# usage: pxcall.sh <tool> <args.json> [extra CLI flags...]
CLI="C:/Users/mickh/AppData/Local/Temp/claude/C--code-storytree/495dc188-faf3-4e1e-9dd0-6764531fd3a2/scratchpad/pixellab.mjs"
TOOL="$1"; shift
ARGS="$1"; shift
for i in $(seq 1 40); do
  OUT=$(node "$CLI" call "$TOOL" "$ARGS" "$@" 2>&1)
  if echo "$OUT" | grep -qi "rate limit exceeded"; then
    echo "[retry $i] rate limited, sleeping 25s" >&2
    sleep 25
    continue
  fi
  echo "$OUT"
  exit 0
done
echo "GAVE_UP_RATE_LIMIT" >&2
exit 4
