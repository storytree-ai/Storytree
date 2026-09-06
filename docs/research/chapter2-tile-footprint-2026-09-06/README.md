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

_(filled in from the art-ladder run — `art/`)_

## Part three — the gap re-laddered over correctly-sized tiles (ADR-0528 D5)

_(filled in from the run — see below)_

## Frame cost — TAKEN, RECORDED, AND NOT A GATE (ADR-0517 D4)

_(filled in from the run)_

## Files

_(the inventory is filled in from the run)_

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
