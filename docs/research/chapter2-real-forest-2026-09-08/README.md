# Storytree's real forest, through the 3D renderer — the first time anyone has seen it

**2026-09-08 · `mount-the-land-on-a-real-surface-arc-inc-01` · a picture and four numbers.**
It decides nothing and changes no shipped surface.

## What this is, and what every earlier "forest" picture was instead

Every forest picture the land programme has produced was one of two things, and neither was the map:

- a **synthetic crowd** (`packages/forest-world-r3f/harness/crowd-layout.ts`) — copies of one
  fixture island on a scatter grid whose frame is calibrated to a land share read off a committed
  PNG. Its own header says it models density and knows nothing of the map's topology;
- a **ladder arm** — the real layout, but drawn with a candidate spacing or a candidate tile the
  map does not ship (`shipped-spacing-scene.ts`, `shipped-tile-scene.ts`).

This directory holds exactly one thing: **the layout the studio built for the live corpus on
2026-09-08, asked for nothing** (`apps/studio/scripts/export-real-forest.mjs` passes no rung
override), pushed through the shipped 3D pipeline — `worldTo3D` → `dressMapWithCover` →
`shippedGroundBuild` → `buildGroundMaterial` — and photographed, beside the studio's own SVG map of
the same forest in the same 2560×1600 buffer.

**35 islands · 90 trail edges routed, 0 dropped · the derived tile (one hex per capability, hex
circumradius 11.063, ADR-0528) · 318 units² of land per capability on every island (ADR-0520).**
Renderer: **NVIDIA GeForce RTX 2060** through ANGLE/OpenGL 4.5.0, GPU timer query available; not a
software rasteriser.

⚠ **It is not a precondition for mounting the land** (ADR-0546 D3). The owner accepted the forest's
post-un-projection shape sight-unseen — "show me the picture first" was put to him as its own costed
option and declined. Nothing here is a reason to re-squash the forest, reinstate the deleted
footprint repair, or tune the layout. Where the picture reads badly, that is a **finding**, and the
route is a fresh question about the forest's *spacing*.

## The pictures

| file | what |
|---|---|
| `sheet-3d-beside-2d-fitted.png` | **the headline.** The same forest, same buffer, each renderer fitting it its own way. |
| `sheet-3d-at-the-2d-maps-own-scale.png` | the 3D at the 2D map's own delivered pixels-per-world-x-unit — the comparable *measurement*. |
| `sheet-rock-layer-hides-the-status.png` | one island as the map draws it, beside the same island with the rock layer off. |
| `3d-fit.png` / `3d-matched.png` / `3d-one.png` | the three 3D framings, as the map draws them. |
| `3d-*-norock.png` | the same three with layer 4 (rock) removed — the control behind finding 4. |
| `2d-fit.png` / `2d-resting.png` | the studio's own SVG map: the whole forest fitted, and the designed resting view it opens on (ADR-0471). |

### "The same framing" is defined here, not assumed

The increment's brief said the two surfaces already share `restingFrame` (ADR-0471). **Checked at
the source, they do not.** `packages/forest-world-r3f/src/camera-framing.ts` says in terms that its
own rule "is NOT the shipped framing", that the two surfaces a visitor can reach — the studio's SVG
map and the public `/forest/` page — are the two that converge on `restingFrame`, and that this
canvas would have to *adopt* it (which needs island identity on `InstanceDescriptor`) if it were
ever mounted.

Nor do they share a projection. The studio's SVG map draws a world **already projected at 20°**;
the 3D canvas stands the same world on true ground and looks at it from **50°**. Depth therefore
delivers **2.24× more screen height** in 3D than in 2D for the same forest, and no choice of scale
removes that. What the two *do* share is the **x axis**, which neither projection touches. So there
are two honest framings and both are given: `fit` (each fits the whole forest into the buffer at its
own scale — comparable as pictures) and `matched` (the 3D at the 2D map's own **1.4246 px per world
x unit** — comparable as a measurement).

## The four numbers

### 1. The real layout against the synthetic crowd

Both extents read by the *same* function (`groundDepth` over `cell-ground` descriptors) — a ratio
between two rulers would say nothing.

| | width × depth (ground units) | depth ÷ width |
|---|---|---|
| **real map** | **661 × 3524** | **5.33** |
| synthetic crowd | 2139 × 3458 | 1.62 |
| ratio | ×0.31 width, ×1.02 depth, ×0.31 area | |

**The crowd is the right height and three times too wide.** The real DAG is a narrow column; the
crowd is a roughly square scatter. So every existing "forest-scale" figure taken on the crowd is a
figure about a **different shape**: it over-states how much of a frame the forest fills sideways
(land is 0.53% of the fitted frame here) and correctly states how far it runs down.

⚠ Do not compare these to the `1,548 × 8,831` figure recorded when ADR-0546 landed. That was
measured on the **committed 2026-09-06 export**, which stands on the pre-ADR-0528 tile
(`max(3, caps+2)` hexes of radius 27). Today's derived tile is much smaller, so the whole world is.
Same shape, different size — which is the reason this increment re-measures rather than inheriting.

### 2. Frame cost at the real extent — REPORTING, not gating (ADR-0517 D4)

On the **RTX 2060**, GPU timer query, 60-frame batches, 687,408 triangles and 5 draw calls in every
framing:

| framing | ms/frame |
|---|---|
| `fit` (whole forest, 0.575 px/unit) | **3.33** |
| `matched` (1.425 px/unit) | 1.44 |
| `one` (read island, 8 px/unit) | 0.39 |

⚠⚠ **The ADR-0380 D2 acceptance floor (Adreno X1-85) was NOT measured, and none of the above may be
quoted as a floor figure.** This box has an RTX 2060 and no Adreno. The increment asked for the
floor; the hardware to answer it is not here. What can be said is the *shape*: the whole-forest fit
is ~8× the read zoom's cost on this GPU, and the ground is one draw call at every zoom.

### 3. The shadow field at the real extent

**Occlusion coverage 8.37%** of the shipped atlas — one packed field over the whole forest
(`atlasCoverage`, threshold 0.5).

⚠ The increment quoted 3.11% on one island and 0.16% on the synthetic forest as at the day it was
parked. **Those two were NOT re-measured here** — they were taken on a different instrument arm, on
a different island size, before the un-projection landed — so no ratio between them and the 8.37%
above is offered, and none should be computed. What 8.37% establishes on its own is that the atlas
does what it was built for at the real extent: it allocates over the **union** of the islands rather
than the rectangle containing them, so the sea between a tall sparse column costs it nothing, and a
forest 3,524 units deep still packs into one field with occupancy in the same order as a single
island's rather than diluted toward zero.

### 4. Are the six status terrains still separable at the real map's zoom?

> ⚠⚠ **THIS SECTION WAS CORRECTED IN PLACE ON 2026-09-08, hours after it landed, and its original
> answer was WRONG IN BOTH DIRECTIONS.** It said "no — and the cause is one layer, the slope-gated
> rock". Measured warm, the answer is "mostly yes", and the rock changes **no island's verdict at
> all**. What was wrong was not the reader, the palette, the rects or the pictures — it was the
> **frame the numbers were taken on**. This page read back its first render of each scene, before
> the kit's asynchronously-decoded textures had reached the GPU, so every figure below was measured
> on a frame darker than the PNG this same page saved. The saved PNGs were always correct and are
> **byte-identical** before and after the fix; only the numbers moved. `settleFrames` in
> `harness/real-forest-scene.ts` now waits for two consecutive byte-identical readbacks before any
> measurement, and the report prints how long it waited.
>
> ⚠ **Rendering twice in a row does NOT fix it** — that was tried first and the figures did not move
> by a single island: two synchronous passes sit in the same tick, before any decode can run. What
> fixed it was TIME. Full reproduction: `../chapter2-unhealthy-ground-2026-09-08/README.md` §6.

**Mostly yes at the fitted forest — and what costs islands is the DRESSING and its CAST SHADOW, not
the rock.** PR #1804 demonstrated the six terrains on the harness island, never on a forest.
Repeated here on the real map, four arms, each moving exactly one thing:

| arm | islands reading as their own status, fitted | as first reported (cold) |
|---|---|---|
| `map` — the frame the map draws | **22 / 35** | 1 / 35 |
| `bare` — the same ground, nothing standing on it | **29 / 35** | 1 / 35 |
| `unshadowed` — atlas built from no casters | **34 / 35** | 1 / 35 |
| `norock` — the slope-gated rock layer removed | **34 / 35** | 31 / 35 |

Read down the corrected column and the attribution is plain, because each step moves one thing:
the **props** cost 7 islands (22 → 29), the **cast shadow** they throw costs a further 5 (29 → 34),
and the **rock costs none at all** (34 → 34).

**The rock changes pixels and changes no verdict.** Comparing `unshadowed` with `norock` island by
island: 24 of 35 islands shift a handful of votes — single digits out of roughly 200 — and **zero
islands change pass or fail**, at every zoom. On the read island at 8 px/unit the rock moves 209 of
55,523 ground pixels. The read island `context-traversal-capture` is `healthy` and delivers
**rgb(99, 131, 76)** with the rock and **rgb(99, 131, 76)** without it: identical to the byte.

⚠⚠ **HOW THE ORIGINAL RUN MANUFACTURED THE ROCK CONCLUSION, because the shape is worth carrying.**
The four arms are measured **in order** — `map`, `bare`, `unshadowed`, `norock` — so each arm was
measured on a warmer page than the one before it. Cold, the pass counts were 1, 1, 1, 31: a monotone
rise that tracks **measurement order**, not the arms. The last arm looked like a cure because it was
measured last. An arm ladder is exactly the right instrument for attribution and it is **defenceless
against a drift that follows the order the arms are taken in**; the counter is to settle first, and
to notice when a result lines up suspiciously well with the sequence.

**What still holds.** `map` at 22/35 is not a clean bill: 13 islands still misread at the fitted
forest, and the two arms that fix them are the ones that remove things the map actually draws. The
ORIGINAL comparison was also conflated independently of the settling — it read the delivered colour
of `map` (props + shadow + rock) against `norock` (no props, no shadow, no rock) and credited the
whole difference to the rock. The `unshadowed` → `norock` step is the rock's own, and it is nil.

⚠ **This remains a finding, not a repair.** No shipped surface draws this ground.

The palette's one zero-separation pair is `building`/`proposed`, which is ADR-0462 D1/D2's own
decision (one authored token under two keys) and a measured identity rather than a defect.

## Reproducing it

```
# 1. the studio, on a port of your own, on the live store
STORYTREE_DB_USER=<iam-email> pnpm --filter studio exec \
  node --import ../../scripts/tsx-cache-off.mjs --import tsx node_modules/vite/bin/vite.js \
  --port 5417 --strictPort --host 127.0.0.1

# 2. export the map's own layout + its 2D pictures  (refuses a studio that is not this worktree,
#    or is not on the live store, or whose map never finished loading)
cd apps/studio && ST_STUDIO_URL=http://127.0.0.1:5417 \
  node --import ../../scripts/tsx-cache-off.mjs --import tsx scripts/export-real-forest.mjs

# 3. the harness, on a port of your own
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5418 --strictPort --host 127.0.0.1

# 4. measure  (DISPLAY=:0 even headless, or ANGLE falls back to SwiftShader and the driver refuses)
DISPLAY=:0 ST_REAL_URL=http://127.0.0.1:5418/real-forest.html \
  pnpm --filter @storytree/forest-world-r3f measure-real-forest
```

`measurements.json` carries every figure above plus the per-island verdicts;
`report.txt` is the driver's own output, unedited.
