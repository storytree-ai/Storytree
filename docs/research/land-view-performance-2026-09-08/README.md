# Where the land view's time actually goes — 2026-09-08

`the-land-view-loads-and-runs-fast-enough` on `mount-the-land-on-a-real-surface-arc`.

The owner signed the look and reported two things in one sentence, plus a cause he marked as a
guess:

> *"looks great, a little laggy and takes a while to load (prob because we rendering the whole 3d
> map at once rather then incrementally growing it with animations.) More work to do but this is on
> the right rack"*

The increment says to **measure before curing**. This measures. It proposes no cure and changes no
shipped code.

## The answer, in three lines

1. **"Takes a while to load" is real, it is the land view, and it is ~25 seconds.** In a production
   build the map alone is usable in **7.2 s**; with `?landView=1` it is **32.5 s**.
2. **"A little laggy once up" did NOT reproduce.** Once the page has genuinely settled, the land
   view holds a clean **16.7 ms median — 60 Hz — idle and under a drag**, matching the harness's own
   floor on a blank page. What reads as lag is the tail of that 25-second load, which continues long
   after the canvas appears.
3. **His hypothesis is right in SHAPE and the cure he named would not reach it.** It is indeed one
   big up-front build rather than an incremental one — the dev CPU profile puts **56% of sampled
   time in the land stream** (`worldTo3D` → `shippedGroundBuild` → `cellGroundGeometry`), the largest
   busy stage by an order of magnitude. But that is **compute**, not presentation: growing the
   islands with animations would change what a viewer looks at *while* the same 25 seconds of work
   happens. Making it incremental means making the BUILD incremental.

## The numbers

Both arms on the RTX 2060 desktop, real GPU (`ANGLE / NVIDIA GeForce RTX 2060, OpenGL 4.5`), the
live corpus, 1600×1000. Raw output in `dev/` and `prod/` (`report.txt`, `measurements.json`).

### Load — to a canvas, and to a page that has stopped moving

| | first canvas | + until quiet | total |
| --- | --- | --- | --- |
| **prod, map alone** | 5.2 s | +2.0 s | **7.2 s** |
| **prod, with the land view** | 6.6 s | +25.9 s | **32.5 s** |
| dev, map alone | 8.1 s | +19.3 s | 27.4 s |
| dev, with the land view | 12.5 s | +22.0 s | 34.5 s |

**Read the production row.** The dev row is what the owner ran, and vite's module waterfall (11.7 MB
over hundreds of unbundled requests) inflates the map's own figure to 27 s, which hides the land
view's share. A member gets the production numbers, and there the land view's own cost is
unmistakable: **7 s becomes 32 s**.

⚠ **"First canvas" is not "loaded", and the gap is most of the wait.** The panel gets a sized canvas
6.6 s in and keeps working for another 26. Any figure taken at first paint understates this by 4x.

### Frame cost once settled — the "laggy" half

| | median | p95 | worst | late |
| --- | --- | --- | --- | --- |
| harness floor (`about:blank`) | 16.7 ms | — | — | — |
| prod, land view idle | 16.7 ms | 16.8 ms | 16.8 ms | 0 / 360 |
| prod, land view under a drag | 16.7 ms | 16.7 ms | 16.8 ms | 0 / 360 |
| prod, map alone idle | 16.7 ms | 33.4 ms | 50.1 ms | 44 / 313 |

The map-alone row's 44 late frames are the one number here that is not clean, and it is **not** the
land view (the flag is off in that arm). It is left as an observation rather than chased.

The land view is at the frame budget. The blank-page floor is what makes that credible rather than
an artefact — this browser can do 60 Hz here, and the land view does.

### Where the CPU went — dev arm, 12.9 s sampled, 9.3 s of it busy

    land-stream        7,209 ms   56.1%   worldTo3D, shippedGroundBuild, cellGroundGeometry
    idle               3,543 ms   27.5%   waiting on the network
    unattributed       1,463 ms   11.4%   V8 frames with no module url
    react-and-studio     377 ms    2.9%
    gc                   189 ms    1.5%
    scene-build           66 ms    0.5%   the shared 2D layout
    three-and-r3f         14 ms    0.1%
    kit-decode             0 ms    0.0%   the land view draws NO kit props

Shares are against the whole, waiting included. **The land stream is the cost, and it is not close.**

### The network, and a finding that is not the land view's fault

    /api/assets   38,082 kB   ← 37.2 MiB, confirmed with curl at the server
    /api/tree        250 kB   ← the map's actual data
    /api/docs         70 kB

**The studio downloads 37 MiB of Library corpus on the map route**, 150x the map's own data, and the
map pays it with or without the land view. It is inside the 7.2 s production figure above, so it is
not what makes the land view slow — but it is the largest single payload in the app and it belongs
to somebody. **It is reported here and deliberately not chased**: this increment's subject is the
land view.

## What is NOT established

- **This box, not the owner's.** The increment says so and it is worth repeating: an RTX 2060
  desktop and his machine are different answers, and the CPU-bound finding above will be *worse* on
  a slower machine, not better.
- **The CPU split is the DEV arm's.** A production build's chunks are minified, so module paths
  carry no package name and the attribution places nothing; the driver withholds that table rather
  than printing zeroes. The load and frame figures above are the production arm's.
- **No cure is proposed, sized, or implied.** Whether the land stream can be made incremental, and
  what that costs, is the next question — and if it trades appearance for speed it is a new owner
  question with a picture, not a call to make in passing.

## The instrument, and the five things it got wrong first

Kept because every one of them produced a *plausible* number, which is the failure mode this arc has
already paid for (ADR-0553).

1. **Watching frames the moment the canvas appeared** charged the tail of the load to the steady
   state: a 417 ms "idle" median with a 3.8 s frame inside it. → settle first.
2. **A fixed 5-second settle** did the same thing more quietly. → the settle is *measured*, in
   one-second windows, and how long it took is reported as a figure.
3. **One quiet window was not a settle.** The map-alone arm slipped under a two-budget bar at 33.3 ms
   exactly, was called settled, then ran at 83 ms for six seconds — which would have been published
   as "the SVG map is janky and the land view is smooth". → 1.25 budgets, two consecutive windows.
4. **A strict `> 16.667 ms` late count called 216 of 360 on-time frames late**, because rAF reports a
   healthy 60 Hz frame as 16.7 ms. A count that fires on a healthy run cannot report an unhealthy
   one. → late is over 25 ms.
5. **The drag arm dragged nothing.** Synthetic `PointerEvent`s are untrusted and never engaged the
   controls, giving a flawless median with `worst` equal to it — which reads as good news. → real
   `page.mouse`, plus a refusal if the canvas pixels did not move. ⚠ And the first version of *that
   check* was broken too: `toDataURL` on a WebGL canvas without `preserveDrawingBuffer` returns a
   blank image, so it reported "nothing moved" on every run. Element screenshots composite correctly.

Two controls make the rest of the numbers mean anything and both run every time: a **blank page in
the same browser** (60 Hz, so the studio's figures are the studio's) and the **same route with the
flag off** (so the land view is charged only for what it adds).

Re-run it:

    pnpm --filter studio measure:land-view --url http://127.0.0.1:<port> --output <dir>

with `DISPLAY=:0` in the environment — it refuses a software rasteriser rather than reporting a GPU
cost that belongs to a CPU.
