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

_(filled in from the run — see below)_

## Part three — the gap re-laddered over correctly-sized tiles (ADR-0528 D5)

_(filled in from the run — see below)_

## Frame cost — TAKEN, RECORDED, AND NOT A GATE (ADR-0517 D4)

_(filled in from the run)_

## Files

_(filled in from the run)_
