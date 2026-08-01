#!/usr/bin/env bash
# fire.sh <tool> <argsjson> [maxtries] — retries past the shared 8-job rate limit.
CLI="C:/Users/mickh/AppData/Local/Temp/claude/C--code-storytree/495dc188-faf3-4e1e-9dd0-6764531fd3a2/scratchpad/pixellab.mjs"
tool="$1"; args="$2"; max="${3:-40}"
for i in $(seq 1 "$max"); do
  out=$(node "$CLI" call "$tool" "$args" 2>&1)
  if echo "$out" | grep -q "rate limit exceeded"; then
    sleep 20
    continue
  fi
  echo "$out"
  exit 0
done
echo "FIRE_GAVE_UP after $max tries"
exit 4
