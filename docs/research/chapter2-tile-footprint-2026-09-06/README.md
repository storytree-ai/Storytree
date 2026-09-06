# The 2D tile footprint follows the land ratio (2026-09-06)

The increment: `tile-footprint-follows-the-land-ratio` on `land-ground-stack-arc`, building
**ADR-0528** (owner-directed: *"option 1, we have time dont take shortcuts"*). Each island was DRAWN
on `max(3, capabilities + 2)` hex tiles of radius 27 while ADR-0520 sized the 3D island to
`capabilities × 318 units²` — about 0.38 of that footprint edge to edge — so every island stood in a
slot sized for a seven-times-larger island and ADR-0521's gap ratio, shipped at 0, could recover only
a third of the sparseness. The tile is now DERIVED: one hex per capability, the hex sized so that a
drawn island IS its land. `HEX_R = 27` and the `+ 2` quota margin are gone from the layout path.

> ⚠ Every figure here was taken on this run, on the arc's named box (ADR-0505 D3): the **RTX 2060**.
> Nothing is inherited from an increment row, an arc intent or an earlier sheet. The control was
> exported FIRST, from the untouched code at main's head, before any file of this branch was edited.

## Part one — the geometry: which lever, modelled before choosing (ADR-0528 D1)

ADR-0528 names two levers and asks that both be modelled. Run on the real corpus (35 islands,
capability histogram `0:4 1:1 2:4 3:6 4:4 5:3 6:1 7:5 9:2 12:2 16:1 20:1 26:1`):

| lever | what moves | result on the corpus | verdict |
| --- | --- | --- | --- |
| **today** | `max(3, caps + 2)` hexes of radius 27 | drawn footprint / 3D land: median **8.3×** (6.4–17.9×); the mapper shrinks each island by 0.24–0.40 edge to edge | the problem |
| **A — radius only** | one radius for the lattice, quota unchanged; R fitted so the median (5-cap) island is exact → R = 9.35 | the `+ 2` survives as an authored number: a 1-cap island is drawn at **2.1×** its land, a 26-cap island at 0.77×; the mapper still applies 0.68–1.14 per island | **rejected** (D1 says the `+ 2` stops being authored) |
| **B — quota only** | radius stays 27, quota = `caps × 318 / 1894` = 0.168 × caps | a 1-cap island gets 0.17 of a hex; **18 of 31** islands cannot be drawn on a whole hex | **infeasible** |
| **C — both** | quota = `k × max(1, caps)`, hex area = 318 / k | every island's drawn footprint is EXACTLY `caps × 318`, for every k | **taken**, with k chosen below |

Within C, `k` (hexes per capability) is the shape-granularity lever:

| k | hex radius | `TILE_SCALE` (R / 27) | hexes on the map (today 277) | quota range | median island: quota / `estRadius` / lattice floor between two |
| --- | --- | --- | --- | --- | --- |
| **1** | **11.06** | **0.4098** | **207** | 1–26 | 4 / 34.8 / 57.5 units |
| 2 | 7.82 | 0.2897 | 414 | 2–52 | 8 / 31.6 / 67.7 units |
| 3 | 6.39 | 0.2366 | 621 | 3–78 | 12 / 30.1 / 55.3 units |
| 4 | 5.53 | 0.2049 | 828 | 4–104 | 16 / 29.3 / 47.9 units |

(today: median quota 6, `estRadius` 98.0, lattice floor 140.3 units.)

**k = 1 is the pick.** It keeps the map's hex count near what it was and makes the parcel partition
literal — each capability's parcel is its own hex, which is what the `+ 2` quota approximated. Higher
k multiplies the relaxed mesh's cells and shrinks the hex below the props drawn on it, for no reading
the map needs. So `HEX_R = √(318 / (3√3/2)) ≈ 11.06` and `tileQuota(caps) = max(1, caps)`; the floor
of one tile is structural (a lattice island cannot be drawn on none) and the 3D mapper leaves a
no-capability island as drawn (ADR-0520 D1). Both live in `packages/forest-world/src/hex.ts` and
`sizing.ts` with their provenance; `PRE_ADR0528_TILE` (radius 27, `max(3, caps + 2)`) is typed as
HISTORY for the comparison page's control and for `tileUnits()`.

**What did NOT move, by construction.** The 3D island: `forest-world-r3f`'s tuned basis
(`HEX_TILE_AREA`, `LAND_SCALE ≈ 0.377`) is frozen on the pre-ADR-0528 tile rather than read off the
engine's live radius — otherwise `LAND_SCALE` would have jumped to 0.925 and every band, lattice and
relief on the shipped island would have grown 2.4×. `LAND_AREA_PER_CAPABILITY` (318) moved DOWN to the
engine, which the lattice derives from, and is re-exported unchanged.

## Part two — the 2D art pass (ADR-0528 D2)

**The pass has two halves: every prop is RE-BASED with the tile, then the props' rungs are LADDERED
at the working zoom.** The first half is what "a constant swap that leaves the props where they
fell" would have skipped; the second is the judgment.

### 2a — the re-basing: every 2D length, classified (the three classes the 3D side already keeps)

The 2D drawing had no `LAND_SCALE`; every prop, keep-out, offset and stroke was a literal in ground
units judged against the radius-27 tile. The tile is now an INPUT of the drawing (`SceneInput.tile`,
resolved once per `buildScene` into a `TileArt` bundle and threaded to every builder), and every
literal was classified exactly as `land-scale-has-three-classes-of-constant` does on the 3D side:

| class | rule | what is in it |
| --- | --- | --- |
| **a tile-relative length** | `× TILE_SCALE` (`tileUnits(<old value>)` / `art.units(<old value>)` — the old value stays visible at the site) | the coast outset (7); the UAT-flower keep-outs (spacing 15, tree well 36, plate band 14); the wisp orbits' offsets (10 / 22 / 12 / 18 / 14 / 16 / 24) and the hover orbit (9); the drift-bed spread (7 + tests × 0.55); the conifer y-offset (4); the coast-hex inset (0.6); the trail casing/shadow widen (2.5 / 5); the hit rect's corner (14); the packer's seed jitter (44 / 30), plant-ring offsets (18 / ±10), stamp offsets (17 + 26·tier / 7 + 6·tier), plate baseline (+8), bounds (+34), margin (60), river lanes (13 / 14); the tile extrusion (8); the garden's plate band (18) |
| **a prop drawn in its own frame** | its group gets `scale(<family rung>)`, the geometry inside is untouched | the story tree (`TREE_ART_RUNG`), the capability plants, the conifers, the UAT flowers (× their 0.6 / 1.0 wrappers), every wisp body, the nameplate (`PLATE_ART_RUNG` — box AND text scale together), the parcel flora — scaled ABOUT ITS OWN SPOT, because the designer surfaces draw their marks in absolute coordinates (`translate(p) scale(s) translate(−p)`), and the harness plant reader now honours that transform rather than folding only its first translate |
| **a 3D contract or a screen quantity — NOT re-based** | left as it stands, named where it stands | `trailFillWidth` (the ONE width rule the 3D mapper reads directly; the 2D stroke is the rule × `TRAIL_ART_RUNG`); the cave portal (the mapper recovers its mouth width from the drawn arch); `COAST_OUTSET` itself (the 3D beach is `COAST_OUTSET × LAND_SCALE` and must not move — the 2D packer re-bases it at the draw site as `COAST_OUTSET_ON_TILE`); the resting view's island count (ADR-0471, in islands, not pixels); the fit paddings, drag slop, pan-fold threshold, panel widths (CSS px chrome); every dimensionless ratio (`0.72·radius`, `0.62·√quota`, the ring fractions) |

**Why the working zoom is unchanged by construction, and why that was the point.** The resting view
is pinned to island COUNT — the frame's short side spans nine median islands (ADR-0471) — so a
uniformly re-based drawing opens at the same on-screen composition it did: the same island pixels,
the same nameplate pixels, the same trail pixels. The 2D captures below show it. What the pass then
has to JUDGE is the one thing uniform re-basing cannot hide: a story's island is drawn on
`capabilities` hexes now, not `capabilities + 2`, so a one-capability story stands on ONE hex under a
full-size tree where it stood on three, and the whole map's small islands shrink relative to its big
ones. That is the truth of the ratio (land ∝ capabilities, which the 3D map already told), and it is
what the ladder in 2b is for.

### 2b — the ladder (the rungs are live dials: `?treeRung=` `?plateRung=` `?floraRung=` `?trailRung=`)

Every arm varies ONE rung at the shipped spacing and is captured at the resting view (the working
zoom — the hard requirement) and the fitted view (`art/2d-<arm>-<view>.png`, `art/art-report.txt`).
Moved = pixels differing by more than 20/255 against the shipped arm at the same view.

| arm | rung moved | resting: median island / read island / nameplate text (px) | moved>20 at resting | moved>20 at fit |
| --- | --- | --- | --- | --- |
| **shipped** | tree 1 · plate 1 · flora 1 · trail 1 | **113 / 161 / 10.0** | — | — |
| tree-0.8 | tree 0.8 | 116 / 161 / 10.0 | 7,763 | 2,242 |
| tree-0.65 | tree 0.65 | 116 / 161 / 10.0 | 12,079 | 4,826 |
| tree-1.25 | tree 1.25 | 113 / 125 / 10.0 | 2,784 | 2,468 |
| plate-1.25 | plate 1.25 | 145 / 201 / 12.0 | 27,897 | 12,493 |
| plate-1.5 | plate 1.5 | 166 / 241 / 15.0 | 48,016 | 18,493 |
| trail-3d | trail 2.44 (= 1 / `TILE_SCALE`: the 3D ribbon's own width) | 113 / 161 / 10.0 | 34,449 | 14,122 |
| flora-1.5 | flora 1.5 | 113 / 161 / 10.0 | 6,330 | 2,808 |

(The "read island" column is the read story's whole `data-story-id` group, so a bigger nameplate or
tree widens it; the island's LAND is the same on every arm.)

**The pick is rung 1 on every family — today's sizes at the working zoom — and it is a judgment,
not a default.** Against the control the resting view now delivers the median island at 113 px
(today 114) and the nameplate's text at 10 px where today's resting scale put it at about 8, so the
map an operator works in is unchanged in composition and slightly more legible in its labels. The
ladder shows what each rung would buy and cost:

- **Tree.** The one thing the tile change makes visible is a zero- or one-capability story standing
  on ONE hex under a full-size tree (it stood on three). `tree-0.8` lets those islands show land
  under the crown at the cost of every tree reading a touch smaller; `tree-0.65` is a clearly
  smaller forest; `tree-1.25` grows the crown over the small islands entirely. If the owner wants
  the small stories to read as land rather than as a tree, 0.8 is the rung — it is the one
  scale-back this pass recommends looking at.
- **Nameplate.** `plate-1.25` and `plate-1.5` are the legibility bumps (12 and 15 px text at the
  working zoom); they also widen every island's footprint on screen and move the most pixels, and
  at 1.5 the plates begin to crowd on the dense ranks. Today's 10 px already exceeds the pre-change
  8 px, so the pass does not take one.
- **Trail.** `trail-3d` strokes the 2D trail at the width the 3D ribbon has relative to its island;
  on the working map it reads as a heavier road network over the same islands. It is the honest
  "the two maps agree" rung; the working tool keeps today's lighter line.
- **Flora.** `flora-1.5` coarsens the grass and shrub marks; at the working zoom it is barely a
  change and at the fit it is none. Nothing to take.

Both zooms of every arm are committed under `art/`; the dials stay live in the studio URL so a rung
can be looked at in place before it is picked.

## Part three — the gap re-laddered over correctly-sized tiles (ADR-0528 D5)

The same five rungs as ADR-0521's ladder, exported from the studio on the derived tile and rendered
through the shipped 3D pipeline by the spacing page's own instrument (`shipped-tile.html`, through
`shipped-spacing-scene.ts`'s loader seam — two ladders, one ruler). The control is the map as it
SHIPPED (old tile, gap ratio 0), exported from the untouched code at main's head `5dfc5871`.

**The whole real forest, fitted** (`sheet-forest-fit.png`; `report.txt`):

| arm | tile | gap | land, % of the fitted frame | % of the forest's own box | layout area vs today | tightest pair: centres / water (units), by the islands' rings | island px | pine px |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `today` — as it shipped | radius 27, `max(3, caps + 2)` | 0 | 0.89% | 2.3% | 100% | 144 / 79 | 33 | 7.6 |
| `tile-spacing-0.5` | **derived** | 0.5 | 2.90% | 8.1% | 21% | 82 / 19 | 90 | 15.5 |
| `tile-spacing-0.35` | derived | 0.35 | 3.20% | 9.1% | 19% | 63 / 10 | 107 | 16.2 |
| `tile-spacing-0.2` | derived | 0.2 | 3.62% | 9.4% | 19% | 47 / 12 | 86 | 17.3 |
| **`tile-spacing-0.1` — SHIPPED** | **derived** | **0.1** | **3.90%** | **10.4%** | **16%** | **53 / 10** | **89** | **18.0** |
| `tile-spacing-0` | derived | 0 | 4.30% | 9.8% | 17% | 66 / **1** | 94 | 18.9 |

- **The slot is closed.** Land rose from 0.89% to 3.9% of the fitted frame at the pick — 4.4× — and
  the layout's centre-to-centre area is 16% of what it was. ADR-0521 recovered a third of the
  sparseness; the tile was the other two thirds, and this is it. Every arm routes all 90 trails with
  none dropped, stands the same 203 capability trees and 1,091 cover props, and holds every island
  at exactly 318 units² per capability (the driver refuses otherwise).
- **The pick is 0.1, not 0 — and that is the finding D5 asked for.** Before the packer's moat, gap
  ratio 0 AND 0.2 stood two 3D islands overlapping (measured by the islands' rings, not their boxes:
  the 3D island outgrows its tile by its coast outset and the mapper's lobing factor, so tiles that
  touch overlap in 3D, and which rung overlapped was a lottery of the seed jitter). The moat — one
  hex of water between any two islands' tiles, kept by the growth itself — removes the overlap at
  every rung; but at 0 the tightest pair still keeps only ONE unit of water and the two islands read
  as touching. 0.1 is the boldest rung with water between every pair (10 units at its tightest),
  and it gives up 0.4 points of land share for that. Below 0.35 the moat floor binds and the extent
  moves only with the seed jitter, which is why the ladder does not tighten monotonically there
  (0.2 spans 0.5% more than 0.35; 0 spans 4.8% more than 0.1) — printed by the driver as a finding,
  where the spacing page refused.
- **The instrument moved with the question.** The spacing page's nearest-pair water was the gap
  between two axis-aligned boxes; on islands standing side by side that overstates the water and
  cannot tell touching from overlapping. `tightestPair` reads the rings (the smallest vertex gap;
  a vertex inside the other's cell is an overlap), and the tile driver refuses only a SHIPPED pick
  that overlaps, recording every other rung's.

**One island at 8 px/unit — unaffected** (`sheet-one-island.png`): `context-traversal-capture` on
every arm holds **7 capabilities on 2,226 units² (318.0 per capability), 7 trees, cover at the
shipped rung**. Its outline is composed from seven hexes instead of nine (57×56 units at the pick
against 51×63 on the control), and the ground noise is world-anchored, so pixels move; its land,
its trees, its cover, its ground material and its shadows cannot — ADR-0520 set the island's size
and this landing does not touch it.

**The 2D studio map** (`sheet-2d-studio.png`, `sheet-2d-fit.png`; `2d-report.txt`): the resting view
delivers the median island at 113 px (today 114), the read island at 161 px and the nameplate text
at 10 px; the fitted view's scale rises from 0.279 to 0.705 as the world shrinks. Against the
control at the same view about 192,000 pixels move (>20/255) at rest — every island's outline is
re-composed and every island moves — and the map still reads: nameplates clear, trails routed,
islands separated by their coast rings at every rung. The gaps ADR-0521 derived are unchanged in
rule; only the tile they sit between changed.

## Frame cost — TAKEN, RECORDED, AND NOT A GATE (ADR-0517 D4)

`frame-cost.txt` / `frame-cost.json`: GPU clock, 6 arms × 2 pictures × 5 interleaved repeats × 20
frames per query, two independent runs, every row reproduced within the runs' own noise, nothing
dropped.

| picture | `today` | `tile-spacing-0.5` | `0.35` | `0.2` | **`0.1` (shipped)** | `0` |
| --- | --- | --- | --- | --- | --- | --- |
| the whole real forest, fitted | 0.3999 ms (2.4% of 16.67) | 0.5717 | 0.6072 | 0.6414 | **0.6653 ms (4.0%), +0.2654, 1.66×** | 0.7046 |
| one island at 8 px/unit | 0.4403 ms (2.6%) | 0.8301 | 0.8506 | 0.8443 | **0.7574 ms (4.5%), +0.3170** | 0.7554 |

Read it as a report: a forest 4.4× denser at the fit is 4.4× more land pixels through the ground
shader, and the one-island read now has neighbours in frame where it had water. Triangles FALL
(720k → 687k: one hex per capability decomposes into fewer cells) and the call count is 5 on every
arm. Nothing here picks the rung.

## Files

`scenes/manifest.json` + six `scenes/<arm>.json` (the real layout per rung, pruned to the mapper's
kinds; the control carried in from `old-tile/` with its source head) · 12 frames
`<arm>-<picture>-<zoom>.png` (2560×1600) · 15 studio captures `2d-<arm>-<view>.png` (1600×1000; the
`island` view is the read story's deep link) · `2d-metrics.json` / `2d-report.txt` ·
`measurements.json` / `report.txt` · `frame-cost.txt` / `frame-cost.json` · `sheet-forest-fit.png`
· `sheet-one-island.png` · `sheet-2d-studio.png` · `sheet-2d-fit.png` · `art/` (16 captures,
`art-metrics.json`, `art-report.txt`, `sheet-art-ladder.png`) · `old-tile/` (the control export: the
six spacing arms on the old tile, from the untouched tree) · `prep/` (the model script; the patch
scripts were applied and are kept only for the web recipe).

Reproduce, on the RTX 2060 box: run the studio on a port of your own (`pnpm --filter studio dev
--port <n> --strictPort --host 127.0.0.1`, live store) and the r3f harness on another
(`pnpm --filter @storytree/forest-world-r3f exec vite harness --port <m> --strictPort --host 127.0.0.1`).
The CONTROL comes first, from the untouched tree: `ST_STUDIO_URL=… ST_SPACING_EVIDENCE_OUT=<this
dir>/old-tile ST_SPACING_SCENES_OUT=<this dir>/old-tile/scenes node scripts/export-spacing-scenes.mjs`
from `apps/studio` at the merge-base. Then, on this branch and from `apps/studio`, under the tsx
loader (`node --import ../../scripts/tsx-cache-off.mjs --import tsx …`): `scripts/export-tile-scenes.mjs`
(the ladder; it carries the control in), `scripts/measure-2d-tile.mjs` (the 2D numbers),
`scripts/export-tile-art-ladder.mjs` (the art rungs). From `packages/forest-world-r3f`, with
`DISPLAY=:0` and `ST_TILE_URL=http://127.0.0.1:<m>/shipped-tile.html`: `pnpm measure-shipped-tile`
and `pnpm measure-tile-cost`. ⚠ Do not commit between starting the studio and finishing a capture —
the studio banners a checkout that moved under it, and the banner lands in every capture.
