#!/usr/bin/env bash
# fire.sh <argsjson> <label>  — submit a create_image_pro job, retrying past the shared
# 8-job rate limit, then poll it and save candidates into raw/.
CLI="C:/Users/mickh/AppData/Local/Temp/claude/C--code-storytree/495dc188-faf3-4e1e-9dd0-6764531fd3a2/scratchpad/pixellab.mjs"
ARGS="$1"; LABEL="$2"; DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1
JOB=""
for i in $(seq 1 40); do
  OUT=$(node "$CLI" call create_image_pro "$ARGS" 2>&1)
  JOB=$(printf '%s' "$OUT" | sed -n 's/^id: //p' | head -1)
  if [ -n "$JOB" ]; then break; fi
  printf '[fire %s] %s\n' "$i" "$(printf '%s' "$OUT" | head -1)" >&2
  sleep 20
done
if [ -z "$JOB" ]; then echo "FIRE_FAILED $LABEL"; exit 1; fi
echo "JOB $LABEL $JOB"
printf '{"job_id":"%s"}' "$JOB" > "work/get-$LABEL.json"
node "$CLI" poll get_image "work/get-$LABEL.json" --out raw --label "$LABEL-$(printf '%s' "$JOB" | cut -c1-8)" --timeout 700 --interval 12 2>/dev/null | tail -6
