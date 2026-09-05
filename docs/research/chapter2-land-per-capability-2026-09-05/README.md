# The island's size from a land-per-capability ratio (2026-09-05)

The increment: `island-size-from-a-land-per-capability-ratio` on `land-ground-stack-arc`, decided
as **ADR-0520**. One tree per capability ships (ADR-0518) and the owner looked at it and said the
land was the wrong size for it: *"we need to scale the land size, can we build a ratio based on this
as land should also scale per land size."* The mapper now sizes every island to
`capabilities × LAND_AREA_PER_CAPABILITY`, about its own centre, and the constant was laddered here
for his pick — derived from the two densities he has already approved. The trees keep their size;
the land shrinks under them.

> ⚠ Every figure here was taken on this run, on the arc's named box (ADR-0505 D3): **NVIDIA GeForce
> RTX 2060** (ANGLE / OpenGL 4.5), `software=false`, exact-colour mode, lights calibrated by the
> map's own probe. Nothing is inherited from an increment row, an arc intent or an earlier sheet.
> The `today` control is REBUILT here at the size the drawing gives the island, with the recipe
> basis and cover rung PR #1825 shipped — it cannot be read off `src/` any more, which is why the
> page carries it as typed history.

## The finding this starts from, re-measured

The 2D layout draws a story as `capabilities + 2` hex tiles of `HEX_R = 27`, so island area already
scaled with capability count — through a constant nobody chose. On the fixture island (thirteen
tiles, eleven capabilities, the true basis) that is **2,239 units² of land per capability**
(`TUNED_LAND_AREA_PER_CAPABILITY`, computed from the hex geometry; the drawn rings measure 24,632
units² over 11). Against it:

| density | units² per tree | where it comes from |
| --- | --- | --- |
| today's island | **2,239** | the hex layout's `+ 2` quota at `HEX_R = 27` |
| the arm the owner called nicer (2026-09-05 sheet, `today`: 72 trees) | **≈ 318** | 22,883 units² of delivered land / 72 |
| the approved Cycles render, **true basis** | **≈ 316** | `RECIPE_ISLAND_AREA` 24,631.8 / 78 pines (13 stands × 6) |
| the approved render read through the **squashed** basis | ≈ 108 | 8,424.6 / 78 — the same density through the drawing's 0.342 foreshortening |

⚠ **The two approved densities AGREE once they are read in one basis** (318 ≈ 316). The increment's
"108" was the recipe seen through the squashed drawing, 2.9× too dense; it was rendered because the
increment asked for it and it is the boldest rung, not because it is a second approved density.
`land-per-capability.test.ts` holds the arithmetic.

## One island at 8 px/unit (`sheet-8px.png`)

| arm | units² / capability | island (units) | on screen (px) | trees | cover | MICRO | families | px moved >20/255 vs today |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **`today` — as it shipped after #1825** | 2,239 | 234 × 135 | 1,913 × 855 | 11 | 648 (x3) | 4.78 | 42 | — |
| **`land-318` — SHIPPED** | **318** | **88 × 51** | **748 × 352** | **11** | **108 (x0.5)** | 4.05 | 55 | 1,069,885 |
| `land-200` | 200 | 70 × 40 | 602 × 289 | 11 | 68 | 4.48 | 53 | 1,196,281 |
| `land-108` — the boldest rung | 108 | 51 × 30 | 454 × 225 | 11 | 36 | 4.47 | 46 | 1,233,884 |
| `cover-x1` — the shipped land, the recipe's own count | 318 | 88 × 51 | 748 × 352 | 11 | 216 | 6.07 | 58 | 1,092,105 |
| `cover-x2` | 318 | 88 × 51 | 748 × 352 | 11 | 432 | 8.70 | 62 | 1,136,150 |
| `cover-x3` — PR #1825's rung on the new island | 318 | 88 × 51 | 748 × 352 | 11 | 648 | 9.64 | 56 | 1,159,621 |

- **The tree count is the capability count on every arm** — eleven capabilities, eleven trees, at
  every rung of both ladders; the driver refuses a run where it is not, and nothing tree-shaped that
  a capability did not put there stands (ADR-0518 D1/D4).
- **Every land arm holds its rung exactly**: 11 × 318 = 3,498 units², 11 × 200 = 2,200, 11 × 108 =
  1,188 — the driver refuses a centre island off its ratio by more than a millionth.
- **318 ships, picked on the look.** At 318 the island is a dense clump of eleven trees spaced about
  one tree-height apart — the density of the picture he liked. At 200 the crowns begin to merge;
  at 108 the island is wall-to-wall canopy with no ground left to read a state off, which fails
  ADR-0489 D3's outcome test on its own.
- **The cover went DOWN, to half the recipe's count (increment (e)).** PR #1825's x3 filled an
  island seven times too large; on the shipped island the recipe's own 216 props (at a prop size
  4.5× the recipe's relative to the island) carpet the ground and the story's state stops reading,
  and x3 buries it. x0.5 dresses the island evenly while the ground colour still reads; x1 is the
  next rung up if the owner wants it bolder. `COVER_DENSITY_RUNGS` is now `[0.5, 1, 2, 3]`.

## The forest fitted — the view the map opens on (`sheet-forest-fit.png`)

> ⚠ **STALE AS A LAYOUT REFERENCE since 2026-09-06 (ADR-0521 landed).** The forest pictures in this
> section stand on the SYNTHETIC crowd (`crowdLayout`, a grid of copies of the fixture island
> calibrated to a land share read off the public map's PNG) with the 2D layout's spacing as it stood
> before ADR-0521 — the three absolute gaps this landing retired. The real map's layout is now
> derived from island size and every island has moved; the real forest, at every rung, is
> `docs/research/chapter2-forest-spacing-2026-09-06/`. Everything on this page about the ISLAND —
> its size, its ground, its trees, its cover — is untouched and stays valid: the ground material and
> the land-per-capability ratio did not move.

⚠⚠ **This is increment (c), measured rather than assumed, and it is the OWNER'S question.** The
mapper sizes each island in place, so the 2D layout's spacing does not move — **the layout HOLDS
STILL** in this codebase — and shrinking every island 2.6× edge to edge inside a fixed layout makes
the fitted forest **dots in a field**. The other answer (the layout compacted with the islands) is
rendered beside it by re-sizing the synthetic forest's frame from the shipped island; it stands on
no shipped surface.

| arm | layout | land, % of the fitted frame | island width in the fitted picture | pine height at the opening view |
| --- | --- | --- | --- | --- |
| `today` | held still | **4.92%** | 1,218 px | 6.2 px |
| **`land-318` — SHIPPED** | **held still** | **0.83%** | 1,165 px | 6.3 px |
| `land-318` | compacted (NOT shipped) | 1.88% | 1,194 px | 9.4 px |
| `land-200` | held still | 0.56% | 1,158 px | 6.3 px |
| `land-108` | held still | 0.34% | 1,151 px | 6.3 px |
| `land-108` | compacted (NOT shipped) | 2.11% | 1,162 px | 15.5 px |

Every green island stays a clean block of its own colour at every rung; what moves is how much of
the frame is land. The real map's layout lives in the studio's 2D tree view (hex-driven row packing
with three fixed gaps), a different capability from the mapper's, so compacting it is not this
row's to decide. The fork is authored as `oq-forest-layout-compact-with-the-islands-or-hold-still`
on `land-ground-stack-arc`, with four costed options and both pictures.

## Frame cost — TAKEN, RECORDED, AND NOT A GATE (ADR-0517 D4)

`frame-cost.txt`, GPU clock, 7 arms × 2 pictures × 5 interleaved repeats × 20 frames per query,
**two independent runs, every row reproduced within the runs' own noise, nothing dropped**:

| picture | `today` | **`land-318` (shipped)** | `land-200` | `land-108` | `cover-x1` | `cover-x3` |
| --- | --- | --- | --- | --- | --- | --- |
| the whole fitted forest | 2.078 ms (12.5% of 16.67) | **0.590 ms (3.5%), −1.488 ms, 0.28×** | 0.478 ms | 0.396 ms | 0.826 ms | 1.770 ms |
| one island at 8 px/unit | 1.586 ms (9.5%) | **0.311 ms (1.9%), −1.275 ms** | 0.224 ms | 0.149 ms | 0.323 ms | 0.394 ms |

Read it as a report: less land is cheaper on every row, and it is a side effect of the ratio and not
the reason for it.

## What moved in `src/`

- **`land-per-capability.ts` (new)** — `LAND_AREA_PER_CAPABILITY = 318` with its provenance, the
  ladder `[318, 200, 108]`, `TUNED_LAND_AREA_PER_CAPABILITY` (the fixture's 13 tiles / 11
  capabilities from `HEX_R`), `LAND_SCALE = √(318 / 2,238.4) ≈ 0.377`, and the arithmetic
  (`islandLand`, `landRatioFactor`, `sizeIslandsByCapability`). `worldTo3D` applies it by default;
  `landAreaPerCapability: <rung>` is the ladder's option and `null` the instrument's "as drawn".
- **`true-footprint.ts`** — `stretchAboutIslands` is now one case of `scaleAboutIslands`, a
  per-island `(x, z)` scale about the island's own centre with the same ribbon and bearing rules.
- **Every island-relative ground constant follows `LAND_SCALE`**: the coast outset (`GROUND_COAST_OUTSET`),
  the beach band, the shore width and dip, the ring insets, the sand line's displacement
  (`SAND_EDGE_AMPLITUDE`), the worn path's falloff, the path jitter, the skirt insets, the cell
  depth, the relief's amplitude AND wavelengths, the grass / sand / wear / grain / detail lattices,
  and the grain's normal strength (a gradient per ground unit). Prop sizes, the shadow field's
  resolution, penumbra and pad, and the contact spread do NOT — the trees keep their size.
  `RECIPE_ISLAND_AREA` is re-based to the recipe island through the shipped mapper (11 × 318).
- **Two constants caught going the wrong way**: `SHORE_RING_PROBE_MARGIN` is a dimensionless
  multiple and was un-scaled; `PEAK_SLOPE_PER_UNIT_AMPLITUDE` is derived from the wavelengths and
  was re-derived (0.2067 → 0.5481; the shipped peak slope is unchanged at 0.455).
- **`shore-grid.ts`** coarsens its cell to fit the bucket cap rather than refusing: the sand's cell
  fell from 7 to 2.6 units under a forest whose extent did not move.
- **`cover-dressing.ts`** — `COVER_DENSITY = 0.5`, `COVER_DENSITY_RUNGS = [0.5, 1, 2, 3]`,
  `COVER_RECIPE_DENSITY = 1`; `recipeIslandArea` is back as an instrument's option on both
  dressing layers (the control arm's previous basis).
- **Retired with their question:** `harness/shipped-per-capability.*` and `grove-history.ts`; the
  previous evidence dir is annotated as overtaken and its frames stay.

## How the page keeps itself honest

Every arm is the shipped composition root — `worldTo3D` with the arm's rung, `dressMapWithCover`
with the canvas's own options, `shippedGroundBuild`, `buildGroundMaterial` with the shipped
constants. Arms at one ratio share ONE island stream, one ground build and one caster set (cover
casts nothing); the control's ground is its own. The driver refuses a software rasteriser, an
insensitive delta instrument, a control that differs from itself, a camera off the signed 50°, a
tree count that is not the capability count on any arm, a land arm off its ratio, a land ladder that
does not descend, a cover ladder that does not rise, a rung byte-identical to its neighbour, and an
arm that drew no kit. The crowd's jitter is bounded by the drawing (`drawnTrueParcels`), so every
rung scatters the same forest and a "moved" is never the scatter's.

⚠ **The bands are the shipped rung's on every arm**: `LAND_SCALE` derives from the shipped ratio,
so a non-shipped rung wears a beach and path sized for the 318 island (a slightly larger fraction
of a 200 or 108 one). The ladder judges the SIZE; the bands are re-derived for what ships.

## Files

35 frames `<arm>-<picture>-<zoom>.png` (2560×1600; `forest-compact` at fit only) · `sheet-8px.png`
(one island, seven arms, cropped) · `sheet-forest-fit.png` (the forest both ways, six pictures) ·
`sheet-reference.png` (the approved render, this morning's map, the shipped map) ·
`measurements.json` (35 rows) · `reference.json` · `report.txt` · `frame-cost.txt` / `frame-cost.json`.

Page: `packages/forest-world-r3f/harness/shipped-land-ratio.html` / `shipped-land-ratio-scene.ts`;
drivers: `shipped-land-ratio-measure.mjs` (`pnpm --filter @storytree/forest-world-r3f
measure-shipped-land-ratio`) and `shipped-land-ratio-cost.mjs` (`measure-land-ratio-cost`), both
with `DISPLAY=:0` on this box and the harness served on a port of your own
(`vite harness --port 5377 --strictPort --host 127.0.0.1`).
