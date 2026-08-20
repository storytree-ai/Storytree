# The land carries its own definition again — 2026-08-20

Increment: `land-carries-its-own-definition-again` on `chapter2-code-generated-organic-art-arc`.
Governed by **ADR-0392**: the owner's look/feel verdict is taken ONCE, at the end, on a whole
island. Every intermediate appearance call here is the session's, and **D2 requires it to be
recorded with its reason** — that is section 3.

## 1. The finding this answers

The 2026-08-19 pass drew the first BARE island anyone had rendered, and it showed the land as a
**single flat green field**: no seams, no variation, no texture at all. That is not a bug and not a
renderer limitation. It is what three separately-correct owner directives compose to — flat green
ground, mesh seams removed, one surface rather than three hash-picked variants. On an all-healthy
island every cell then carries the same token at the same shading rung, so the ground is one
unbroken colour.

The consequence is the point: **all of the island's visual interest rested on the vegetation**,
which is marks a handful of pixels across. That is an enormous load for the smallest element on the
island, and it is very likely why four vegetation passes in a row failed to satisfy — the
vegetation was being asked to do the land's job as well as its own.

`panel-bare-before.png` is that state, kept on the page as the control. Everything else is measured
against it.

## 2. What was built

Two mechanisms, both **lighting operations on geometry the land already has**. Neither paints a
mark and neither introduces a frequency of its own, which is the test the 2026-08-16 redirect
actually sets — *"in 3d its very noisy and doesnt make space for shadows which is one of the bigger
wins of going 3d"*. A shadow landing on this land darkens the same rungs by the same ladder, so it
composes with what is here rather than fighting a second pattern for the same pixels.

**RELIEF** (`landHeight` / `landNormal`) gives the surface normal somewhere to go. Vertices ride a
continuous three-wave height field and wear its **analytic** normal, so a big parcel's interior
stops being one rung. The normal is per-VERTEX, not per-face: face normals would quantise each
triangle whole and deliver the land as a mosaic of hard facets, which is the rejected per-cell
noise arriving by another route.

**THE PARCEL BEVEL** (`planLandDefinition`) gives the island structure to read. Every edge is
classified `interior` / `parcel` / `rim`, and the ground turns down over 1.6 units at a **capability
boundary** and at no other seam. Two parcels each bevel their own side, so a boundary comes out as a
V-groove with a lit face and a shaded face.

**The palette is untouched by construction.** Both mechanisms move positions and normals; neither
names a colour. The material still emits `token * bandShade(lambert)`, so every pixel this makes
possible was already an authored `(token × level)` entry.

## 3. THE APPEARANCE CALLS, AND WHY — the ADR-0392 D2 record

**(a) Relief amplitude 2.2 ground units.** The number that matters is not the height but the
**slope**, because the shader quantises `dot(n, L)` onto a four-rung ladder and only slope moves a
pixel between rungs. Flat ground sits on rung `0.9`; reaching `1.0` needs the normal about 9° toward
the light and reaching `0.8` about 11° away. The wave sum's gradient peaks at `0.26 × amplitude`, so
2.2 puts peak slope near 24° — across both thresholds, with the whole ladder reached. It was picked
against the rendered ladder in `panel-amplitude.png`, and against two alternatives that were
rejected by looking:

- **1.2 is measurably not enough** — 4.6% of the ground leaves the base rung, and at delivered size
  the island is still a flat field with a few slivers in it. Building an invisible treatment costs
  exactly as much as building a visible one.
- **3.2 was rejected for two reasons, one of them not aesthetic.** It churns the island's outer
  SILHOUETTE, which belongs to the coast increment and should not be pre-empted by relief. And the
  vegetation stands upright at the terrain's height without aligning to its normal — at 2.2's 24°
  peak slope that reads fine; at 3.2's ~34° a shrub visibly leans into the hill.

**(b) Wavelengths 62 / 41 / 27 ground units.** Chosen against the fixture's **measured** 16.5-unit
mean cell, not by taste. The shortest component is still wider than a cell. Anything at or below the
cell pitch would land back on exactly what was rejected — a per-cell pattern wearing relief's
clothes.

**(c) Bevel width 1.6 units, drop 1.15 (a 36° face).** The width is picked against the DELIVERED
size, which is the only size that counts: the island delivers at 2 px per ground unit, so 1.6 units
is ~3 px east-west and ~2.5 px north-south after the 50° camera. Below about 1 unit it stops
resolving and becomes an aliasing shimmer; much above 2 it stops reading as an edge and starts
reading as a slope, putting a second pattern at the relief's own scale and setting the two
competing. The drop is what makes the face leave the ground's rung in both directions.

**(d) The bevel wears the GROUND token, not the darker `side` token.** A boundary drawn in a
different colour is a drawn SEAM, which is the treatment the owner removed. Wearing the ground's own
token and differing only by rung makes it a **fold in the land** instead of a line on top of it.

**(e) The rim is bevelled too — construction, not scope creep.** A parcel's boundary is a closed
loop, and where a parcel reaches the shore that loop runs along the rim. Insetting only the `parcel`
stretch leaves a wedge-shaped hole exactly where a capability meets the coast. What falls out is
that the island's outer edge gains a chamfer above the existing wall skirt, so the land rounds over
into its own cliff rather than ending in a knife edge. **That is not a coast shell** — nothing here
draws one, prices one, or forecloses one; `blender-island-shell-render` still owns it, and the wall
skirt's token and depth are left exactly as they were.

**(f) TERRACING AT PARCEL HEIGHTS WAS CONSIDERED AND DECLINED.** The increment lists it as a
candidate. Two reasons against. Contour terracing — quantising the height field into steps with
risers — puts a riser on every contour crossing, everywhere, which is definition sprayed rather than
placed. And giving each parcel its own plateau height would read as an assertion: a viewer seeing
one capability's ground standing higher than another's will take that to mean something, and it
means nothing. Under ADR-0367 D5 the art may not assert a state the work does not hold, so the safe
form of terracing is the one that carries no per-capability signal — which is what the V-groove
already is.

**(g) NOT DONE, and deliberately left to their own increments:** the shadow ladder
(`shadow-ladder-is-admissible-and-affordable`), the coast/rim shell (`blender-island-shell-render`),
and the palette-per-amplitude curve for the AUTHOR-TIME compositor
(`ground-displacement-amplitude-swept-for-land-texture`). On that last one — **relief is free in
palette terms on the LIVE path and this says nothing about the compositor's**. Two different
renderers with two different closure arguments: the live shader can only ever emit `token × level`,
where PR #1389's compositor bought micro-relief for +619 entries. Nothing here prices that trade,
and nothing here should be read as having priced it.

## 4. Numbers

Measured on delivered pixels by `capture.mjs`, not asserted from the TypeScript that fed them.

- **14,843,206** opaque delivered pixels across 26 canvases, **0 off-palette**, **0** foreign-status
  reads. **16** distinct delivered colours against 104 authored entries — up from 11 on 2026-08-19,
  and every one of the five new ones is an authored `(token × level)` entry the flat land simply
  never reached.
- **The flat land occupies exactly ONE rung of the four-rung ladder.** That is the finding, stated
  as a measurement. At amplitude 2.2 the land reaches **all four**, with 32.5% of the ground off the
  base rung (1.2 reaches 4.6%).
- **WATERTIGHTNESS — reported, not thresholded, and it caught a real bug.** `capture.mjs` now
  flood-fills the true exterior of every canvas and counts transparent pixels it cannot reach. Every
  BARE-LAND panel on the page now reads **0**, at every amplitude, with or without the bevel, mixed
  status included — the same as the flat control:

  | panel (bare land) | interior holes | before the rim-wall fix |
  | --- | --- | --- |
  | flat (the control), 8 px/unit | **0** | 0 |
  | parcel bevel only, 8 px/unit | **0** | 0 |
  | relief only, 8 px/unit | **0** | 7 |
  | full, 8 px/unit | **0** | 10 |
  | mixed status, 8 px/unit | **0** | 25 |
  | all four amplitude rungs, 2 px/unit | **0** | 0 |

  The right-hand column is why the instrument earns its place. Those 7–25 pixels were first written
  off as silhouette pinches at the raster resolution — a plausible reading, and wrong. They were the
  **inverted rim wall** (§7 trap 4 below) showing through, and fixing it took every land panel to
  zero. The residue on the page is entirely in the *dressed* panels (the `foliage` silhouette at 8
  px/unit contributes 292), which is vegetation geometry and predates this work — panel 18, flat land
  with plants, reads 9. There is deliberately no pass/fail threshold: a tolerance chosen today would
  be a number picked to make today's picture pass.
- **103 checks** in the package, up from 81.

## 5. What the pictures show

- **`panel-definition.png` — read first.** Flat vs full, then the two mechanisms apart, at 8 px/unit
  with no vegetation. This is the answer to "the land is one flat colour".
- **`panel-definition-delivered.png` — the pair that decides it.** Bare before/after and dressed
  before/after at 2 px/unit. If the definition did not survive this row it would not exist. It does.
- **`panel-amplitude.png`** — the ladder the amplitude was chosen from: 0, 1.2, 2.2, 3.2.
- **`panel-bare-before.png`** — the 2026-08-19 state, pinned as the control.
- **`panel-mixed.png`** — a mixed island keeps its palette closure, and the unhealthy parcel now
  carries definition in its **own** family.
- **`panel-delivered.png`** — an unplanned result worth naming: **the land's definition survives the
  SPRITE convention too.** At 1 px/unit upscaled 2×, the relief zones and the parcel folds read
  almost as well as they do live. Unlike the vegetation detail — which the 2026-08-19 pass measured
  as spent below the delivery threshold — land definition is a large-scale feature, so it is not
  evidence for the live path over the sprite path. It is evidence that this particular fix is
  cheap on both.

## 6. An honest limit found on the way

**On an `unhealthy` parcel the relief is much fainter than on a healthy one**, and it is not fixable
here. The unhealthy token is `#57544a`, so the gap between its rungs is a few units per channel in
absolute terms, where healthy's `#8cb85e` spans far more. The definition is *present* — the same
geometry, the same rungs — but a dark token cannot carry as much of it. That is a property of the
authored palette rather than of this treatment, and it belongs with
`app-healthy-green-and-null-status-base-family-are-separated`, which is already looking at the
land palette's separations.

⚠ Frame timings in `capture-report.json` remain **RELATIVE ONLY** — headless Chromium here is
SwiftShader (software). The ADR-0380 D2 hardware-floor question is still unanswered and still needs
the owner's own machine.

## 7. Traps carried forward

All measured, all produce a plausible-looking wrong picture rather than an obvious failure.

1. **The inset must be keyed by (PARCEL, VERTEX), never by (CELL, VERTEX).** A boundary vertex is
   usually shared by several cells of the same parcel, only one of which owns the boundary edge
   through it. Per-cell insets disagree and tear a crack along the inside of every boundary — a
   crack that reads as a rendering artefact and gets chased as one. `land-definition.test.ts` proves
   the agreement directly.
2. **The degeneracy guard has to back off a whole PARCEL, not a cell.** A fixed inset is a small
   fraction of a big cell and a huge fraction of a sliver, and a sliver whose vertices cross over
   turns inside out and vanishes under front-face culling. Backing off one cell would move a vertex
   its neighbours did not — the per-cell fix IS the bug it was meant to prevent.
3. **The bisector is scaled to the bevel width, not to the exact mitre** `width / sin(half-angle)`.
   The exact form blows up at a sharp corner and shoots the vertex across the parcel. Under-cutting
   costs a little parallelism and cannot self-intersect, and the two faces still meet exactly
   because both end on the same inset vertex whatever its distance.
4. **THE RIM WALL MUST HANG FROM THE RIM, NOT REACH A FIXED FLOOR — and this one actually bit.** The
   wall ran from `y = 0` down to a constant `y = -CELL_DEPTH`, which is the same thing on a plane and
   is not the same thing once the coast rises and falls: the relief reaches further down than the
   wall is deep, so **30 of the island's 104 rim endpoints sat below the fixed floor and rendered
   their wall upside down** — a band of wall standing UP out of the land. It looked like an art
   problem. `wallFootY` exists so the invariant is provable in a node test, since the renderer that
   builds the wall imports three and cannot be. Separately, wall skirts are now emitted at the RIM
   only: they used to be emitted on every edge, harmless while the ground was a plane because a
   shared edge's skirt is hidden by its neighbour, but once the ground undulates a hidden skirt stops
   being reliably hidden.
5. **The plants had to be lifted onto the terrain.** A plant is fitted to stand on `y = 0`, so the
   moment the land stops being a plane every plant floats or sinks. It is quiet at delivered size —
   a shrub half a unit into the ground still looks like a shrub — which is exactly why it needs
   threading through rather than noticing.
6. **The capability id must come only from a group that says it is a parcel.** Every other `<g>` on
   the island carries an `id` for its own reasons (a territory, a trail edge, a hit target).
   Inheriting one of those partitions the land along lines that mean nothing, and the picture looks
   deliberate either way. There is a test for the territory case specifically.
7. And the four inherited ones still bite: the scene's 2D coordinates are **already projected** at
   20° and must be unprojected exactly once; a GROUND distance foreshortens by `sin(elev)` while an
   UPRIGHT height foreshortens by `cos(elev)`; SVG `(x, y)` → 3D `(x, z)` **flips handedness**, so
   every winding here is derived from a signed area or a cross product rather than assumed; and a
   browser caps simultaneous WebGL contexts near 16 and silently loses the oldest, so the page draws
   through one shared context and the capture keeps a per-canvas floor.

## Reproducing

```bash
pnpm --filter @storytree/forest-world-r3f dev
```

Then `http://localhost:5184/island.html`. The capture is:

```bash
ST_HARNESS_URL=http://localhost:5184/island.html ST_OUT_DIR=docs/research/chapter2-land-definition-2026-08-20 ST_FULL_PAGE_NAME=live-island.png ST_PANEL_NAMES=delivered,zoom,swirls-fork,bare-before,definition,definition-delivered,amplitude,mixed pnpm --filter @storytree/forest-world-r3f run capture
```

⚠ If port 5184 is already held by another worktree's harness, Vite refuses to start — but the
existing server still answers `/island.html` with **HTTP 200** via SPA fallback, serving a DIFFERENT
page. Check the served `<title>` before trusting a capture, or run on a free port with
`--port <n> --strictPort` (this pass ran on 5187 for exactly that reason).
