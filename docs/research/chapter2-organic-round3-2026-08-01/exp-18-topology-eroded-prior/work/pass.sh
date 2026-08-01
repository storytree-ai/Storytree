#!/usr/bin/env bash
# pass.sh <prompt-file> <strength> <seed> <label> [stages...]
# Submits one pixflux img2img redraw per prior, in batches of 5, then polls all of them.
set -u
CLI="C:/Users/mickh/AppData/Local/Temp/claude/C--code-storytree/495dc188-faf3-4e1e-9dd0-6764531fd3a2/scratchpad/pixellab.mjs"
BASE="C:/code/storytree/docs/research/chapter2-organic-round3-2026-08-01/exp-18-topology-eroded-prior"
PROMPT="$1"; STRENGTHS="$2"; SEED="$3"; LABEL="$4"; shift 4
STAGES="$*"
[ -z "$STAGES" ] && STAGES="0 1 2 3 4 5 6 7 8"
cd "$BASE"
IDS="work/ids-$LABEL.txt"; : > "$IDS"
n=0
for k in $STAGES; do
  kk=$(printf %02d "$k")
  STRENGTH=$(echo "$STRENGTHS" | cut -d, -f$((k+1)))
  case "$STRENGTH" in "") STRENGTH="$STRENGTHS";; esac
  python work/mkargs.py "work/args-$LABEL-$kk.json" "$PROMPT" "silhouettes/prior-$kk.png" "$STRENGTH" "$SEED" raw/mature-b-efcd8090-00.png 9 >/dev/null
  for attempt in 1 2 3 4 5 6; do
    OUT=$(node "$CLI" call create_image_pixflux "work/args-$LABEL-$kk.json" 2>&1)
    ID=$(echo "$OUT" | grep -E '^id:' | cut -d' ' -f2)
    if [ -n "$ID" ]; then break; fi
    echo "  stage $kk retry $attempt: $(echo "$OUT" | grep -i error | head -1)"
    sleep 12
  done
  if [ -z "$ID" ]; then echo "STAGE $kk FAILED TO SUBMIT"; continue; fi
  echo "$kk $ID" >> "$IDS"
  echo "submitted stage $kk strength=$STRENGTH -> $ID"
  n=$((n+1))
  if [ $((n % 5)) -eq 0 ]; then sleep 25; fi
done
echo "--- polling"
while read -r kk id; do
  echo "{\"job_id\":\"$id\"}" > work/g-$LABEL.json
  node "$CLI" poll get_image "work/g-$LABEL.json" --out raw --label "$LABEL-$kk-$(echo $id | cut -c1-8)" --timeout 400 --interval 6 2>&1 | grep -E 'SAVED|failed|error'
done < "$IDS"
