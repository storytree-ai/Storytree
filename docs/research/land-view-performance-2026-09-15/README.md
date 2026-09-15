# The land view rebuilds its whole ground on every studio re-render — 2026-09-15

`the-land-view-loads-and-runs-fast-enough` on `mount-the-land-on-a-real-surface-arc`. It re-measures
the land view on current `main` with a corrected instrument, and supersedes the diagnosis in
`../land-view-performance-2026-09-08/` (kept, with a correction note at its head).

The owner signed the look and reported two things, plus a cause he marked as a guess:

> *"looks great, a little laggy and takes a while to load (prob because we rendering the whole 3d
> map at once rather then incrementally growing it with animations.)"*

This measures. It proposes no cure and changes no shipped code.

## The answer

1. **"Takes a while to load" is real, and most of it is the ground being built again and again.** In a
   production build on the RTX 2060 desktop, a first visit to the map is quiet in **10.1 s**. With
   `?landView=1` the canvas is up at **8.9 s**, only 0.9 s behind the map. The page then keeps working
   for another **27.6 s**: eight separate runs of land-stream work, **22.9 s of CPU**, and frames of
   1.7–2.0 s every few seconds, before it goes quiet at **36.5 s**.
2. **"A little laggy" is real, and it is periodic.** At rest, the land view rebuilds its whole ground
   about every thirty seconds: two rebuilds in a 65-second idle window, 31 s apart (matching the
   studio's 30-second activity poll), each about 2 s of main-thread work and each a **frozen frame of
   1.9 s**. Between rebuilds it holds a clean 60 Hz, idle and under a drag. The 2026-09-08 instrument
   watched for six seconds, which falls between rebuilds; that is why it reported no lag.
3. **His hypothesis is right that a whole-map build is the cost, and wrong about the mechanism.** The
   ground is not built once, up front. It is built on every studio re-render. One build is about 2 s
   in production (about 3.5 s in dev). Growing the islands in with animations would not stop the
   repeats; it would change what a viewer watches while they run.

## The mechanism — read off the code, confirmed run by run in the profiles

- The studio rebuilds its `scene` whenever its clock tick or its live-activity polls change
  (`apps/studio/src/components/TreeView.tsx`: `sceneInput` is memoised on `sceneNow`, `buildsByStory`,
  `claimsByStory`, `departuresByStory` and more).
- `LandView` converts the scene into the 3D stream in its render body with no memo
  (`apps/studio/src/components/LandView.tsx`: `landViewStream(scene)`), so every scene change hands the
  canvas a new descriptor array.
- Every memo in `ForestWorldCanvas` — cells, strips, placements, casters, and `CellGround`'s ground
  build — is keyed on that array's identity (`packages/forest-world-r3f/src/ForestWorldCanvas.tsx`).
  So every scene change rebuilds the shore grid, the occlusion field, the relief and the geometry.

Grouping each land-stream run of the dev arm's saved profiles by file shows the chain exactly, every
time: the studio's `scene.ts` (about 50 ms), then the stream conversion (about 250 ms: `coast-clip.ts`,
the shared `coast.ts`, `dressing-ground.ts`), then the ground build (about 3.5 s in dev: `shore-grid.ts`
about 2.3 s, `land-shadow.ts` about 0.3 s, then `coast-clip.ts`, `land-relief.ts`, `shore-atlas.ts`).

## Where a cure belongs — for the successor, `the-measured-land-view-bottleneck-is-cured`

| what the time is | files | capability |
| --- | --- | --- |
| **the repeat** — a rebuild on every scene change | `LandView.tsx`, `ForestWorldCanvas.tsx` (what the ground memo is keyed on) | `forest-canvas-delivery` |
| one build's own cost | `shore-grid.ts` (14.2 s of phase B's 22.9 s in production), `land-shadow.ts`, `shore-atlas.ts`, `contact-shade.ts` | `forest-land-surface` |
| one build's own cost | `coast-clip.ts`, `land-relief.ts`, `world-to-3d.ts`, `cell-ground-geometry.ts` | `forest-scene-model` |
| the shared 2D layout, paid by the map too | `packages/forest-world/src/routing.ts` (1.5 s in production) | `render-core` |

⚠ **Memoising `landViewStream` on `[scene]` alone would not stop the repeat**: the scene object itself
is rebuilt on every poll and every clock tick. The ground has to be keyed on what it actually depends
on (the islands, their cells, their docks, what stands on them), not on an identity the polls replace.

## The numbers

Both arms on the RTX 2060 desktop through ANGLE on OpenGL (a real GPU, not a software rasteriser), the
live corpus, 1600×1000. Raw output in `rtx2060-prod/` and `rtx2060-dev/`.

### Load — to a sized canvas, and to a page that has stopped moving

| | canvas / map drawn | + until quiet | total |
| --- | --- | --- | --- |
| **production, map alone** | 8.0 s | +2.1 s | **10.1 s** |
| **production, with the land view** | 8.9 s | +27.6 s | **36.5 s** |
| dev (warmed server), map alone | 11.4 s | +5.9 s | 17.3 s |
| dev (warmed server), with the land view | 21.6 s | +21.3 s | 42.9 s |

### When the land stream ran — production

| phase | runs | land-stream CPU |
| --- | --- | --- |
| A. navigation to a sized canvas | 2 | 2.1 s (`routing.ts` 1.5 s is the shared 2D layout) |
| B. a sized canvas to quiet | 8: a 9.4 s run, then 1.7–3.6 s each | 22.9 s |
| C. 65 s at rest | 2, at +10.7 s and +41.6 s | 3.9 s (the map alone: 0.1 s) |

### Frame cost — production

| | median | worst | late (over 25 ms) |
| --- | --- | --- | --- |
| blank-page floor | 16.7 ms | — | — |
| land view, 6 s idle | 16.7 ms | 33.2 ms | 1 / 360 |
| land view, 6 s under a drag | 16.7 ms | 16.8 ms | 0 / 360 |
| **land view, 65 s at rest** | 16.7 ms | **1966.7 ms** | 9 / 3629 — two stalls, 1967 ms at +10.6 s and 1883 ms at +41.3 s |
| map alone, 65 s at rest | 16.7 ms | 166.7 ms | 187 / 3492 — the SVG map's own re-renders |

### The network — paid with or without the land view

`/api/assets` returned **38.2 MiB** (39,168 kB in 8.4 s) on the map route, against 257 kB for
`/api/tree`. It belongs to the map, not the land view, and is reported rather than chased here.

## What is NOT established

- **The owner's own machine.** Not measured: this laptop was saturated by other sessions' gates for
  the whole session, which would have made any load figure taken on it about them. The rebuild COUNT
  does not depend on the machine — it follows the studio's re-renders — while each build's duration
  scales with the CPU.
- **The ADR-0380 D2 acceptance floor** (the Adreno X1-85). Not measured.
- **Which state change triggers each rebuild.** In production the two at-rest rebuilds were 31 s apart,
  matching the 30-second activity poll; the instrument does not attribute re-renders to state changes.
  The cure's own measurement will show whether any trigger survives it.
- **A stage table for the at-rest phase.** Withheld in both arms: the browser's native `(program)` time
  dominates an idle window whether or not the flag is on. The run timeline, the per-file table and the
  land-minus-map delta carry the at-rest answer instead.
- **The land view's payload in this run's production report.** Its "canvas + the kit" line reads zero
  because the built chunks are named for their entry modules (`ForestWorldCanvas-*.js`, 3.48 MB, and
  `kit-*.js`, 1.11 MB) and landed in "everything else". The rule was corrected after this run.

## What the first instrument got wrong, and what changed

1. **It profiled only up to the first sized canvas** — the 27.6 s after it went unattributed. Now three
   phases on both arms: to a sized canvas, to quiet, and 65 s at rest.
2. **Its "land stream" included the shared 2D trail routing** (`packages/forest-world/src/routing.ts`),
   which the map pays without the flag. A per-file table and a land-minus-map delta now separate them.
3. **Its six-second steady window fell between rebuilds.** The at-rest window is now derived from the
   studio's own poll and clock-tick cadences, two polls and a tick long.
4. **It could only attribute the dev build, whose CPU figures are inflated**: StrictMode runs `LandView`'s
   body twice per render, and vite serves hundreds of unbundled modules. A production build is now
   attributed through its own source maps.
5. **Its production report was labelled "vite dev"**, a constant. The arm label is now required.
6. **It took the blank-page floor while the land view was loading.** The floor is now taken first.

## Re-run it

Production arm (what a member gets), on the RTX box:

    cd apps/studio && node node_modules/vite/bin/vite.js build --sourcemap
    PORT=<free port> STORYTREE_STUDIO_DEV_IDENTITY=<a member> STORYTREE_DB_USER=<iam user> \
      node --import ../../scripts/tsx-cache-off.mjs --import tsx server/serve.ts &
    # warm the store connection until /api/me answers "member": true — serve.ts bounds each
    # membership lookup at 5 s, and a cold Cloud SQL connect from that box took about 8 s
    DISPLAY=:0 pnpm --filter studio measure:land-view --url http://127.0.0.1:<port> --output <dir> \
      --arm "<which build, which machine>" --sourcemaps 1

Dev arm: start vite dev on a free port, and pass `--warm 1` instead of `--sourcemaps 1`. On Windows,
pass `--angle default` to reach the GPU. `--keep-profiles 1` also writes the six phase profiles
(about 4 MB for one arm), which open in Chrome DevTools.
