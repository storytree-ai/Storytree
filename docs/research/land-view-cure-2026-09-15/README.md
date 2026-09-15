# The land view stopped rebuilding its ground on every re-render — 2026-09-15

`the-measured-land-view-bottleneck-is-cured` on `mount-the-land-on-a-real-surface-arc`, lane 1
(`forest-canvas-delivery`). The diagnosis this follows is `../land-view-performance-2026-09-15/`;
this measures the same page before and after the cure, with the same instrument.

- **machine** — the RTX 2060 Linux desktop (ANGLE on OpenGL, `NVIDIA GeForce RTX 2060/PCIe/SSE2`;
  a real GPU, refused if it had been a software rasteriser), 1600×1000, against the live corpus.
- **before** — `b66c2050`, the merge base. **after** — `b04acb50`, the one commit of the cure.
- **both arms are production builds** (`vite build --sourcemap`, attributed through their own source
  maps), because dev inflates the CPU twice over: StrictMode runs `LandView`'s body twice per
  render, and vite serves hundreds of unbundled modules.
- **each arm was run twice**, and every run's one-minute load average is in the table below. The box
  is shared with another session, so a timing run beside a gate measures the gate; every run here
  held `/tmp/storytree-heavy.lock`.

## The answer

**The ground is now built once per load and not at all at rest.** It used to be built eight to
eleven times during a load and again on every activity poll.

| | before | before (repeat) | after | after (repeat) |
| --- | --- | --- | --- | --- |
| **`shore-grid.ts`, load (phase B)** | 13,602 ms | 13,936 ms | **1,196 ms** | **1,107 ms** |
| **`shore-grid.ts`, 65 s at rest (phase C)** | 1,198 ms | 1,210 ms | **none** | **none** |
| land-stream CPU, load (phase B) | 21,898 ms | 22,686 ms | **2,538 ms** | **2,513 ms** |
| land-stream runs, load | 5 | 6 | **3** | **2** |
| **worst frame in 65 s at rest** | 1,900 ms | 1,917 ms | **200 ms** | **183 ms** |
| **a viewer waits, land view** | 35.4 s | 36.1 s | **13.3 s** | **13.5 s** |
| a viewer waits, map alone (control) | 10.6 s | 10.5 s | 9.7 s | 9.7 s |
| load average, 1 min | 0.17 | 0.42 | 0.98 | 0.99 |

**Read the second row first.** `shore-grid.ts` is the ground build, and in both after-runs it does
not appear in the at-rest phase's module table **at all** — the periodic rebuild is gone, not
smaller. What is left at rest is one run of ~60 ms, about thirty seconds in, which is the content
key and the stream conversion; it shows as a 183–200 ms frame instead of a 1.9 s frozen one.

**And the wait a viewer actually experiences fell by 22 seconds**, from 35.4 s to 13.3 s, against
9.7 s for the map alone. The land view's own share of that wait — the part the flag adds — went from
**+25 s to +3.6 s**.

The increment asked for "phase B should show one ground run, and phase C none". Both hold. The three
load runs in the after arm are one ground build (1,816 ms / 2,072 ms) followed by two or one much
smaller runs (324–440 ms) that convert the stream without rebuilding the ground.

## What the cure was

`packages/forest-world-r3f/src/ground-dependency.ts`. The ground's four input lists — the parcels,
the trail strips that dock on them, the kit's placement and everything that casts on them — are
derived together and re-derived only when the descriptor stream's **content** moves, not when the
array it arrived in is replaced. `GroundInput.revision` is the rebuild count.

Two descriptor families are left out of the content key, and both are justified by driving the real
readers rather than by assertion (`ground-dependency.test.ts`):

1. **the wisps**, which are a claim about a SESSION and never about the ground; and
2. **the `skipped` audit markers** — which look inert and are not. A single wisp is four scene nodes
   and three of them skip, so a key that kept the skips would move on the live signal through the
   back door. **That one was found by the test**, not by reading the code: the first version of the
   key kept the skips, and the wisp test went red immediately.

## The one reading that looks like a regression, and is not

The instrument's two SHORT windows — six seconds of idle and six seconds under a drag — moved:

| 6-second window | before | before (repeat) | after | after (repeat) |
| --- | --- | --- | --- | --- |
| idle, land view | 0/360 late | 0/360 | 90–97 / ~250 | 90/251 |
| under a drag | 0/360 late, median 16.7 ms | 0/360 | 88/126, median 50 ms | 96/134 |

**This is the windows moving, not the frames getting worse, and it was measured rather than argued.**
The instrument takes those two windows the moment the page goes quiet — and the cure moves that
moment **22 seconds earlier in the page's life**, from ~36 s to ~13.5 s. At 13.5 s the studio is
still parsing the 39 MB `/api/assets` payload and standing up its SVG map; at 36 s it is not. The
`idle, map alone` control, whose window did NOT move, is unchanged across all four runs (48–60 late).

The decisive control is `apps/studio/scripts/probe-aged-drag.mjs`, which holds the page's AGE fixed
at 60 s and then watches — the comparison the two arms cannot make:

| aged 60 s, then watched | before (`b66c2050`) | after (`b04acb50`) |
| --- | --- | --- |
| idle, 6 s | median 16.7 ms, worst 16.8 ms, **0/361 late** | median 16.7 ms, worst 16.8 ms, **0/361 late** |
| under a drag, 6 s | median 16.7 ms, worst 16.8 ms, **0/361 late** | median 16.7 ms, worst 33.3 ms, **1/360 late** |

At a fixed page age the two trees are the same: one 33 ms frame is not a 1.9 s stall. The drag was
confirmed to have moved pixels in both runs — a drag arm that drags nothing returns a flawless
median and means nothing.

The comparable at-rest reading is the **65-second** window, which is sized off the studio's own poll
and clock-tick cadences rather than chosen, and there the cure is unambiguous: worst frame 1,900 ms →
200 ms, and 1,917 ms → 183 ms.

## What this cost, and what it leaves for lane 2

The content key is not free. `ground-dependency.ts` is now its own line in the module table: **288 ms
and 323 ms across a load**, and **413 ms and 456 ms across 65 seconds at rest**. That is the price of
asking "did the ground change?" on a stream of about 1,089 descriptors, and it buys the ~1,200 ms
build it replaces. It is also now the largest land-stream cost at rest, so it is lane 2's business
alongside the single build's own cost.

**One build still costs about 1.1–1.2 s of `shore-grid.ts` on this machine**, and that is what lane 2
was parked for. It is not touched here: the increment says its figure only means something once the
repeat is gone, which is what this run establishes.

## What is NOT established

- **The owner's own machine, and the ADR-0380 D2 acceptance floor (the Adreno X1-85).** Not measured.
  The rebuild COUNT does not depend on the machine — it follows the studio's re-renders — while each
  build's duration scales with the CPU.
- **A drag at a late page age was measured at 6 seconds, twice**, and a poll fires about every 30 s,
  so neither aged window is likely to contain one. What a poll costs at rest is the 65-second
  window's answer (183–200 ms), not the aged drag's.
- **Which state change triggers the one remaining at-rest run.** It arrives at +32.7 s and +32.8 s,
  matching the 30-second activity poll, but the instrument does not attribute re-renders to state
  changes.
- **The 39 MB `/api/assets` payload** is unchanged and belongs to the map, not the land view. It is
  the largest single thing on the load path in both arms and is reported rather than chased here.

## Re-run it

Both arms, on the RTX box, one at a time under `flock /tmp/storytree-heavy.lock`:

    cd apps/studio && node node_modules/vite/bin/vite.js build --sourcemap
    PORT=<free port> STORYTREE_STUDIO_DEV_IDENTITY=<a member> STORYTREE_DB_USER=<iam user> \
      node --import ../../scripts/tsx-cache-off.mjs --import tsx server/serve.ts &
    # warm the store connection until /api/me answers "member": true — serve.ts bounds each
    # membership lookup at 5 s, and a cold Cloud SQL connect from that box takes about 8 s
    DISPLAY=:0 pnpm --filter studio measure:land-view --url http://127.0.0.1:<port> --output <dir> \
      --arm "<which build, which machine>" --sourcemaps 1

The aged-drag control, against the same server (no source maps needed — it reports frames, not CPU):

    DISPLAY=:0 node --import ../../scripts/tsx-cache-off.mjs --import tsx \
      scripts/probe-aged-drag.mjs http://127.0.0.1:<port> 60000

Raw output: `before-rtx2060-prod/`, `before-rtx2060-prod-repeat/`, `after-rtx2060-prod/`,
`after-rtx2060-prod-repeat/`.
