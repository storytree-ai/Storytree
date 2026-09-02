# The canopy on the shipped map — kit-tree shadows and the healthy island's grove (2026-09-03)

The increment: grove density and kit-tree shadows on the shipped forest map, toward the render the
owner stamped (`docs/research/chapter2-land-idiom-2026-08-27/land-combined-1948px.png`, the
look-fence of ADR-0489 D3). That render is FORESTED — thirteen stands of four to eight pines with
bare ground between them, `build_land.py`'s `scatter()` (`:1027-1091`) — where the map that drew one
pine per capability (ADR-0475) read sparse beside it, and every one of those pines cast no shadow.

> ⚠ Every figure here was taken on this run, on this box: Qualcomm Adreno X1-85 (ANGLE D3D11),
> `--use-gl=angle`, `software=false`, exact-colour mode, lights calibrated by the map's own probe
> (a lit white face delivered 0.3176 at the authored intensities; scale 3.148). It is NOT the RTX
> 2060 the arc's end-state names; internally consistent, not comparable to a committed RTX figure.
> **Frame cost is deliberately not measured here** — the driving session takes that on the RTX
> box; what this run reports is the payload half (draw calls, triangles, instance counts).

## What ships (`src/`)

1. **Every kit placement casts a shadow.** `groundCasters` knew only the story tree and the cave
   portals, so the occlusion field the ground already carried was drawn under the placeholder tree
   alone while eleven pines and ten flowers floated. The placement is now PURE and SYNCHRONOUS from
   the frozen `KIT_FOOTPRINTS_2026_08_29` (and a second frozen table, `KIT_HEIGHTS_2026_08_29`),
   made ONCE in `ForestWorldCanvas` before the ground is built, and the SAME list reaches both
   consumers — the ground's casters (`placementCasters`: radius = role footprint / 2 × scale,
   height = role height × scale) and `KitProps`, which now draws what it is handed and computes
   nothing of its own. The loaded kit is still held to both frozen tables where it is loaded
   (`footprintDriftOf` / `heightDriftOf`, loud in the console, props still drawn).
2. **Groves on the green islands** (`src/grove-dressing.ts`, called by `dressMapWithGroves`).
   On an island whose EVERY cell is `healthy` — and on no other; `unknown` grows nothing, a mixed
   island fails closed — the recipe's stands: `round(13 × area / 8,424.6)` stands (the fixture
   island's own area, so it carries the recipe's thirteen), 4–8 members each, gaussian-spread with
   σx 3.6 and σz 3.0 scaled by the island's depth/width aspect against the recipe's (135.1 / 233.8
   — 1.03 on the shipped fixture, whose ground plane is the drawing's projected, z-squashed shape),
   stand centres and members clear of the 9-unit beach band (the CLIPPED coast, through the same
   shore distance walk the sand layer samples) and of the worn path (`wearOf(d) < 0.30`, the
   recipe's own rule at `:1046`, through the wear layer's own smoothstep — about 1.91 units from the
   trail docks' path). Seeded per island through `islandSeed`, so the forest's islands are not
   clones and two builds of one island are identical.
3. **A grove pine is smaller, untinted, and never the tallest on its parcel.** The `tree` role
   with `capId: 'grove'`, `tint: null` (the kit's own needles), and a per-placement `scale` drawn
   uniform(0.55, 0.80) — applied in `placementScale` / `placementExtent` and in the caster. The
   capability's own pine keeps scale 1. NEVER a dead trunk: the recipe's 9% dead trees are not
   transcribed, because on this map a bare trunk is `unhealthy`'s signal.
4. **Occupancy.** Grove members share the island's occupancy set. `pairClearance` DECLARES the one
   relaxation — two grove members may stand at `GROVE_CLEARANCE` = 0.45 of their summed radii;
   every other pair keeps the full sum, and the scale never enters the clearance — and
   `dressingOverlaps` measures against the same function, so a grove pine inside a capability's
   pine is a defect it still names. Zero overlaps on the island and across the forest.

`dressMapFromKit` (the vocabulary alone) is unchanged and is what the bloom census and the
`capability` arm read; `dressMapWithGroves` is what the canvas stands.

## Measured, one island @ 8 px/unit (control = the shipped ground bare)

| arm | draw calls | triangles (ground) | objects (caps / blooms / groves) | casters | families (approved 36) | largest | MICRO | STRUCT | moved >20/255 | touched |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bare` (CONTROL) | 1 | 5,562 (5,562) | 0 | 1 | 47 | 6.7% | 1.09 | 21.79 | 0 | 0 |
| `capability` | 4 | 22,092 (5,562) | 21 (11 / 10 / 0) | 22 | 52 | 5.6% | 1.26 | 22.75 | 63,124 | 134,440 |
| `groves` | 4 | 67,696 (5,562) | 63 (11 / 10 / 42) | 64 | 50 | 4.6% | 1.65 | 23.41 | 147,181 | 281,672 |

The approved render through the same census: 36 families, largest 5.2%, MICRO 2.54, STRUCT 30.05.
MICRO rose 1.09 → 1.65 (the crowns' own texture and the pools under them); STRUCT 21.8 → 23.4; the
largest family fell 6.7% → 4.6%. The ground's triangle count is the same on every arm — a caster
changes the field, never the mesh — and the draw calls are the ground's one plus one per merged
kit material (trunks, branches, flowers).

## The forest, 35 islands

| view | arm | draw calls | triangles | objects | casters | families | MICRO | STRUCT | moved >20/255 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| @ 8 px/unit | `bare` | 1 | 194,630 | 0 | 35 | 46 | 1.09 | 21.56 | 0 |
| | `capability` | 7 | 690,310 | 584 | 619 | 50 | 1.26 | 22.57 | 60,712 |
| | `groves` | 7 | 1,670,354 | 1,520 (936 grove pines) | 1,555 | 50 | 1.67 | 23.14 | 146,732 |
| fitted (0.573 px/unit) | `bare` | 1 | 194,630 | 0 | 35 | 48 | 7.10 | 25.53 | 0 |
| | `capability` | 7 | 690,310 | 584 | 619 | 52 | 8.42 | 25.14 | 11,560 |
| | `groves` | 7 | 1,670,354 | 1,520 | 1,555 | 52 | 9.45 | 26.61 | 19,090 |

Every one of the 936 grove pines stands on one of the 21 healthy islands (the scene test attributes
each to its nearest island centre); the 8 proposed, 2 building, 2 mapped, 1 unknown and 1 unhealthy
islands draw exactly what they drew. Seven draw calls on the forest: the ground, the trunks, the
branches in four tints (green, proposed, mapped — building folds to proposed), the flowers. The
fitted view — the one the map opens on — is `sheet-forest.png`: the healthy islands stay clean
green blocks with a speckle of canopy; whether that speckle reads as a forest or as noise at 0.57
px/unit is the owner's call, and it is the picture this run exists to put in front of him.

## Named gaps

- **The stands are thinner than the recipe's.** 42 grove pines on the fixture island from 13 stands
  — 3.2 per stand against the recipe's mean of 6 — because the full clearance from the eleven
  capability pines and ten blooms, the 4.56-unit relaxed clearance between members, and the
  z-squash (σz 1.03) reject many of the thirty gaussian draws a member gets. Inside the brief's
  40–100 band and pictured, not tuned: the levers if the owner wants it denser are the member
  tries, the relaxed clearance, or σz, and each is one constant.
- **Blooms cast too** (every placement does): a flower's pool is a 2-radius, 2.4-tall cylinder's,
  small and visible at 8 px/unit as a dark patch under each flower. Not judged here.
- The grove is an ELLIPSE in the placement basis by construction (σz scaled by the aspect), read
  through the canvas's double projection; the stands cluster along x on screen.
- The recipe's path is also a geometry dip and its stands take 9% dead trees; neither is
  transcribed (ADR-0504 D4; the dead trunk is a signal here).
- Frame cost: unmeasured here by design. The forest's `groves` arm submits 1.67 M triangles in
  7 draw calls against the bare ground's 195 k in 1 — the RTX box's number is the driving session's.

## Files

`report.txt` · `measurements.json` · `sheet-8px.png` (approved / bare / capability / groves, one
island @ 8 px) · `sheet-forest.png` (bare / capability / groves, the forest fitted) · 12 frames:
`{bare,capability,groves}-{one,forest}-{8,fit}.png`. Page: `harness/shipped-canopy.html`; driver:
`pnpm --filter @storytree/forest-world-r3f measure-shipped-canopy` against
`vite harness --port 5352`.
