#!/usr/bin/env bash
# grab.sh <jobid> <label> <nframes> — poll then fetch every frame index by URL.
CLI="C:/Users/mickh/AppData/Local/Temp/claude/C--code-storytree/495dc188-faf3-4e1e-9dd0-6764531fd3a2/scratchpad/pixellab.mjs"
job="$1"; label="$2"; n="$3"
cd "C:/code/storytree/docs/research/chapter2-organic-round3-2026-08-01/exp-16-leader-repair" || exit 1
echo "{\"job_id\":\"$job\"}" > "work/get-$label.json"
node "$CLI" poll get_image "work/get-$label.json" --timeout 600 --interval 10 > "work/poll-$label.txt" 2>&1
tail -2 "work/poll-$label.txt"
for i in $(seq 0 $((n-1))); do
  node "$CLI" fetch "https://api.pixellab.ai/mcp/images/$job/download?index=$i" "raw/$label-$(printf %02d $i).png" >/dev/null 2>&1 || echo "MISS idx $i"
done
ls raw/$label-*.png | wc -l
