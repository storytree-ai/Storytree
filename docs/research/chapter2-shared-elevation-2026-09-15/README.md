# One elevation for both map layers — 20° against 50°, on the real forest

**What this is.** The staged owner look for the arc increment `the-two-layers-share-one-elevation`.
The studio's SVG map draws the forest at **20°** above the ground plane; the 3D land canvas views
true ground at **50°**. `registrationCamera` (`apps/studio/src/lib/canvasRegistration.ts`) can only
put the two layers on the same screen pixel when `sin` of the two agrees, so the land cannot be
mounted under the working map until they share one elevation. **Which one they share is an owner
look (ADR-0070 stage 2), and nothing here picks it.** This directory renders both arms so it can be
picked by looking.

**The sheet is [`sheet-shared-elevation.png`](sheet-shared-elevation.png)** — four rows, two
columns, 20° on the left and 50° on the right. The two columns differ in the camera elevation and in
nothing else: same corpus, same layout, same paint.

## Where it was taken

| | |
|---|---|
| machine | Mint desktop, NVIDIA GeForce RTX 2060 (ANGLE / OpenGL 4.5.0, `software=false`, GPU timer available) |
| commit | `1ad64b6e` on `claude/elevation-staging` |
| corpus | the LIVE store, read through this worktree's own studio — 36 islands, 95 trail edges routed, 0 dropped |
| exported | 2026-09-15T07:23:05Z |
| rendered | 2026-09-15T07:25:18Z (20°) and 07:25:47Z (50°) |
| buffer | 2560 × 1600, device pixel ratio 1, for every picture in the sheet |

**It is the REAL forest, not a fixture.** The real map is a tall narrow corridor (826 × 1310 world
units at 20°) and a synthetic crowd is a roughly square scatter, so a stand-in would understate
exactly the thing the elevation moves.

## What the pictures are

| file | what |
|---|---|
| `2d-resting-at-20.png` / `2d-resting-at-50.png` | the studio map at the framing it actually opens on (ADR-0471) |
| `2d-fit-at-20.png` / `2d-fit-at-50.png` | the studio map with the whole forest fitted into one screen |
| `3d-at-20/` and `3d-at-50/` | the same forest through the shipped 3D pipeline: `3d-fit` (whole forest), `3d-matched` (at the fitted map's own delivered px per world *x* unit), `3d-one` (one island at 8 px/unit), each also with the rock layer off (`-norock`) |
| `3d-at-*/report.txt`, `measurements.json` | every number the render read back, including the settle, the renderer identity and the frame cost |
| `scenes/` | the exported scene graph both 3D arms were rendered from |

## The numbers the look rests on

| | 20° | 50° |
|---|---|---|
| map, **resting** framing — median island width | 206 px | **201 px** (−2.6%) |
| map, **fitted** framing — median island width | 86 px | **42 px** (−52%) |
| map world box | 826 × 1310 | 826 × **2819** (×2.15 deeper, same width) |
| land, fitted — forest on screen | 400 × 700 px | 400 × **1554 px** (×2.22 the depth, same width) |
| land, read zoom — land in frame | 1854 × 1544 px | 956 × 520 px |

`sin(50°)/sin(20°)` = **2.24**: that one ratio is the whole trade. Neither projection touches *x*,
so everything above moves in depth only.

## Two things to read carefully

1. **The fitted map and the resting map disagree about the cost, and the resting one is the surface
   people use.** At `fit` the forest is more than twice as deep at 50°, so the fitted camera backs
   off and every island is half the width it is today. At `resting` — a designed crop rather than a
   fit — the zoom is not forced to back off, and the same change costs 2.6%.
2. **The land at 20° is not the land ADR-0517 signed off.** The read-zoom row is the clearest: at
   50° an island reads as an island with ground under it and trees standing on it; at 20° the same
   island is a flat lozenge and the corridor behind it stacks up into the frame.

## Reproducing it

```sh
# a studio on a port of your own, on the LIVE store
STORYTREE_DB_USER=<iam-email> STORYTREE_STUDIO_STORE=pg \
  pnpm --filter studio dev --port 5433 --strictPort --host 127.0.0.1

# the 2D arms — the 20° arm asks the map for nothing, which is what makes it the shipped drawing
cd apps/studio
ST_STUDIO_URL=http://127.0.0.1:5433 ST_REAL_EVIDENCE_OUT=<dir> node … scripts/export-real-forest.mjs
ST_STUDIO_URL=http://127.0.0.1:5433 ST_REAL_ELEVATION=50 ST_REAL_EVIDENCE_OUT=<dir> node … scripts/export-real-forest.mjs

# the 3D arms — the CAMERA moves; both read the SAME default-drawn scene export
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5434 --strictPort --host 127.0.0.1
DISPLAY=:0 ST_REAL_URL=http://127.0.0.1:5434/real-forest.html \
  ST_REAL_SCENES_DIR=chapter2-shared-elevation-2026-09-15 ST_REAL_ELEVATION=20 ST_REAL_OUT=<dir> \
  pnpm --filter @storytree/forest-world-r3f measure-real-forest     # and again with 50

python3 build-sheet.py
```

⚠ **The 3D arm moves the CAMERA and never re-exports the drawing.** The committed scene graph is a
2D drawing that the 3D pages un-project back to true ground at the studio's *default* elevation
(`landStreamFromDrawing`), so a 50°-drawn export read by those pages would silently build a forest
with the wrong depth. `export-real-forest.mjs` refuses to write an elevation arm over the canonical
scenes, stamps `drawnElevationDeg` on one it does write, and `validateRealManifest` refuses that
stamp. Both 3D columns here were rendered from `scenes/`, which asked the map for nothing.

⚠ `DISPLAY=:0` must be in the environment even headless, or Chromium falls back to a software
rasteriser and every frame-cost figure is a software figure. The driver refuses that rather than
reporting it.
