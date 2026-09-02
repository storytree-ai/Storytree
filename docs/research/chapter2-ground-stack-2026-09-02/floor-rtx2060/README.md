# The whole ground stack's frame cost, on the RTX 2060 — the box the arc's end state names

Taken 2026-09-02 on the Mint box (`mickh-A520I-AC`), discharging
`measure-the-stack-on-the-rtx-2060` on `land-ground-stack-arc`. The sibling directory `floor/`
holds the same measurement on the primary box's Qualcomm Adreno X1-85; this one is the figure the
arc's end-state item 3 actually asked for, and the two are meant to be read side by side.

**This run was unblocked by ADR-0505.** The increment's own dependency sentence named an unanswered
billing question as the only thing standing in its way. The owner settled it on 2026-09-02
(`oq-may-a-session-run-unattended-on-the-mint-box`): same subscription, unattended runs authorised,
and graphics work goes to that box by default. No code change was needed on either box — the
instrument ran as written, which is what the increment predicted.

## The instrument proved it was on the real GPU before it quoted a number

```
renderer: ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)
vendor:   Google Inc. (NVIDIA Corporation)
EXT_disjoint_timer_query_webgl2: available
```

This matters more than it looks. `land-floor-measure.mjs` falls back to SwiftShader silently
without `DISPLAY=:0` in the environment even when headless, and its entire output is frame times —
a software-rasteriser run would have produced plausible numbers that meant nothing. The driver
refuses on a software rasteriser and the renderer string above is the receipt. Served from a vite
on port **5217**: 5184 is refused by the driver by construction, and 5214 was a sibling session's
server, left alone.

`runs=2  repeats=7  batch=30  layer arm="grass"` — **every row reproduced within the noise the runs
themselves measured, and nothing was dropped.**

## What it costs

The delta is the WHOLE shipped ground stack — layer 1's grass, the shore sand, the worn path, rock
on slope and the cliff-normal detail — over genuinely bare ground.

| view | bare (control) | whole stack | **stack costs** | amplified control |
|---|---|---|---|---|
| one island @ 8 px/unit | 0.1731 ms | 0.8783 ms | **+0.7052 ms** | 4.5506 ms (+4.3775) |
| forest @ 8 px/unit | 0.2587 ms | 0.9546 ms | **+0.6959 ms** | 4.6496 ms (+4.3909) |

Spreads: 0.0080 / 0.0357 / 0.1148 (one island) and 0.0045 / 0.0068 / 0.0506 (forest). The amplified
arm evaluates the layer eight times over with the geometry untouched; it is the sensitivity control
proving the instrument can see fragment cost at all, and it is not a look arm.

## Beside the Adreno figure

| | one island @8 | forest @8 |
|---|---|---|
| Adreno X1-85 (primary box) | **UNRESOLVED** — under that run's 1.6807 ms noise floor | +1.6884 ms |
| RTX 2060 (this run) | **+0.7052 ms** | **+0.6959 ms** |

Two things follow, and only the first was expected:

1. **The stack is about 2.4x cheaper on the RTX at forest scale** (+0.696 ms against +1.688 ms).
2. **The one-island row RESOLVES here and could not there.** On the Adreno that row sat under a
   1.68 ms noise floor, so its cost was unknown-below-the-floor rather than small — the report said
   so explicitly and refused to extrapolate. On the RTX the same row comes back at +0.7052 ms with a
   0.0357 ms spread. That is the reading the substitute box could not give at any number of repeats,
   and it is the concrete reason the arc named this box rather than merely preferring it.

Both boxes agree on the shape: the two zooms cost nearly the same, which is what a FRAGMENT cost
over near-identical ground coverage (14.1% vs 14.2%) should do, and neither is close to a frame
budget.

## ⚠ THE REPORT'S "7 LAYERS AT THIS LAYER'S COST" LINES ARE VOID — DO NOT QUOTE THEM

`land-floor-report.txt` in this directory carries, on both views, a line reading *"7 layers at this
layer's measured cost come to 5.110 / 5.130 ms/frame, 30.7% / 30.8% of a 16.67 ms frame"*. **That
extrapolation is meaningless for this arm and must not be cited**, exactly as the arc's intent
warns. It is boilerplate written for a single-layer arm: it multiplies the measured delta by seven
as though the delta were one layer's cost. The delta here is already the FINISHED stack, so
multiplying it by seven prices the ground five to seven times over. The honest numbers are the
deltas themselves, +0.7052 ms and +0.6959 ms, and the BUDGET rung's PASS still stands on its own
(it compares the measured frame against 16.67 ms, and does not depend on the extrapolation).

The same caveat applies to the Adreno report in `floor/`.

## ⚠ A stale comment in the instrument nearly made this run report the wrong thing

`harness/land-floor-scene.ts` described its `grass` arm as *"+ layer 1 of the approved ground ...
The layer under test"*, and `LAYER_ARM_MIX` as *"`authored`, the strength the map now DRAWS for
layer 1"*. Both sentences were true when written and stopped being true when layers 2, 3, 4 and 6
landed under ADR-0503: `authored` was widened in `shipped-grass-scene.ts` to mean `SHIPPED_STACK`
— the whole five-layer stack — so the arm those comments describe as one layer has been the entire
stack ever since.

Nothing was measured wrongly. The code is correct and the control is built `bare = true`, which is
why the delta is honestly the whole stack. But the prose sent this session looking for a defect
that was not there, and the `octaves` column cannot settle the question either way (it counts
layer 1's 23 lattice-noise octaves, which the whole stack still evaluates). The comments are
corrected in place in the same commit as this evidence.

This is the second instance of the hazard `shipped-grass-scene.ts` already documents on its `bare`
parameter — *"a frame-cost baseline and a look-comparison baseline are different objects that
happened to share a name"*. The first cost a control that priced layer 1 against itself. This one
cost only reading time, because the `bare` override that fixed the first was already in place.

## Reproducing it

```bash
ssh mint 'cd ~/code/Storytree && git fetch origin main -q &&
          git worktree add .claude/worktrees/rtx-floor -b claude/<branch> origin/main'
ssh mint 'cd ~/code/Storytree/.claude/worktrees/rtx-floor && pnpm install &&
          setsid nohup pnpm --filter @storytree/forest-world-r3f exec vite harness \
            --port 5217 --strictPort > /tmp/rtx-vite.log 2>&1 < /dev/null &'
ssh mint 'cd ~/code/Storytree/.claude/worktrees/rtx-floor &&
          DISPLAY=:0 ST_LAND_FLOOR_URL=http://localhost:5217/land-floor.html \
          pnpm --filter @storytree/forest-world-r3f measure-land-floor'
```

`DISPLAY=:0` is load-bearing even though nothing is displayed. Check `ss -ltn` before choosing a
port and never kill a server you did not start.
