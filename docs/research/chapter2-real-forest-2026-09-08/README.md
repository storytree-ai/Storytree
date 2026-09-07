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

**No — and the cause is one layer, named.** PR #1804 demonstrated the six terrains on the harness
island, never on a forest. Repeated here on the real map, four arms, each moving exactly one thing:

| arm | islands reading as their own status, whole forest fitted | read island at 8 px/unit |
|---|---|---|
| `map` — the frame the map draws | **1 / 35** | 0 / 1 (own-share 6.5%) |
| `bare` — the same ground, nothing standing on it | 1 / 35 | 0 / 1 (10.0%) |
| `unshadowed` — atlas built from no casters | 1 / 35 | 0 / 1 (25.9%) |
| **`norock`** — the slope-gated rock layer removed | **31 / 35** | **1 / 1 (77.1%)** |

The read island `context-traversal-capture` is `healthy`. The map delivers its ground at
**rgb(87, 97, 74)** — a desaturated olive-grey that the reader calls `unhealthy`. With layer 4
removed it delivers **rgb(93, 122, 71)**, which reads `healthy`, and which is within a few units of
what the synthetic-crowd control delivers on its own page (**rgb(87, 120, 70)**, measured with the
same sampler). The reader models `healthy` from rgb(108,142,72) to rgb(140,184,94), so **both**
surfaces sit below its darkest modelled rung; what separates them is not brightness but **hue**.

**Why the real forest and not the crowd.** The rock layer is gated on **slope**, and
`LAND_RELIEF_AMPLITUDE` is in absolute world units. Since ADR-0520 an island's ground area follows
its capability count, so the real map's islands are far smaller than the fixture the demonstration
ran on — the same relief over a smaller island is a **steeper** island, and a slope-gated grey mixes
in across the whole surface instead of banding its edges. Sampling the island's core (25% rect)
rather than the reader's 60% rect changes nothing, so this is not the shore band or the rim: it is
uniform over the island.

The cast shadow is a real but secondary contributor: it costs a further 6.5 → 10.0 → 25.9 points of
own-share at the read zoom.

⚠ **This is a finding, not a repair, and it is not this increment's to fix.** No shipped surface
draws this ground. The one thing it does settle is that "the terrains are separable" cannot be
carried over from the fixture island to the real map — the property was demonstrated at an island
size the map no longer draws.

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
