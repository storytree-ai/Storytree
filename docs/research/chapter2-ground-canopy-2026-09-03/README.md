# The canopy on the shipped map — kit-tree shadows and the healthy island's grove (2026-09-03)

The increment: grove density and kit-tree shadows on the shipped forest map, toward the render the
owner stamped (`docs/research/chapter2-land-idiom-2026-08-27/land-combined-1948px.png`, the
look-fence of ADR-0489 D3). That render is FORESTED — thirteen stands of four to eight pines with
bare ground between them, `build_land.py`'s `scatter()` (`:1027-1091`) — where the map that drew one
pine per capability (ADR-0475) read sparse beside it, and every one of those pines cast no shadow.
Decision: **ADR-0507**.

> ⚠ Every figure here was taken on this run, on the arc's named box: **NVIDIA GeForce RTX 2060**
> (ANGLE / OpenGL 4.5), `--use-gl=angle`, `software=false`, exact-colour mode, lights calibrated by
> the map's own probe (a lit white face delivered 0.3176 at the authored intensities; scale 3.148).
> Nothing is inherited from an increment row, an arc intent or an earlier sheet.
>
> ⚠ THE 2026-09-03 02:05 RUN THAT THIS ONE REPLACED WAS TAKEN ON AN ADRENO X1-85, and its figures
> are NOT comparable to these: the same `bare` control reads 47 families / MICRO 1.09 there and
> 44 / 0.85 here. That is a different GPU and driver reading the same scene, not a change to the
> scene. Compare only WITHIN a run.

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
   island fails closed — the recipe's stands: `round(13 × density × area / 8,424.6)` stands, 4–8
   members each, gaussian-spread with σx 3.6 and σz 3.0 scaled by the island's depth/width aspect
   against the recipe's (135.1 / 233.8 — 1.03 on the shipped fixture, whose ground plane is the
   drawing's projected, z-squashed shape), stand centres and members clear of the 9-unit beach band
   (the CLIPPED coast, through the same shore distance walk the sand layer samples) and of the worn
   path (`wearOf(d) < 0.30`, the recipe's own rule at `:1046`, through the wear layer's own
   smoothstep — about 1.91 units from the trail docks' path). Seeded per island through
   `islandSeed`, so the forest's islands are not clones and two builds of one island are identical.
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
5. **`GROVE_DENSITY` — the one tuned number, and the owner's scale-back lever.** See below.

`dressMapFromKit` (the vocabulary alone) is unchanged and is what the bloom census and the
`capability` arm read; `dressMapWithGroves` is what the canvas stands.

## ⚠ THE DENSITY LADDER — why a tuned constant exists at all, and how to move it

The recipe imposes **no clearance between two grove members** (`:1063-1065` tests only `inside` and
`wear`), so its stands are 4–8 trees with crowns freely overlapping. This map DOES keep one —
`GROVE_CLEARANCE`, declared and detected, because a placement nothing measures is how the owner's
*"the rocks are appearing where the trees are"* defect happened — and this map's islands are about
three times shallower in z than the recipe's, so a stand here is an ellipse roughly 7 × 2 units that
physically cannot hold six pines of radius 5. **At the recipe's own 13 stands the fixture island
grows 42 pines: 3.2 per stand against the recipe's 4–8.**

Relaxing the clearance would buy the count back by letting crowns interpenetrate, and the detector
would then be measuring against a number chosen to make the placement pass. So the lever is **more
stands** — more clumps rather than tighter ones — and every stand still keeps every rule.

Three rungs were rendered, on this box, in one run (`sheet-8px.png`):

| rung | stands | grove pines (one island) | objects | triangles | families | largest | MICRO | STRUCT | forest pines |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| x1 (the recipe's own) | 13 | 42 | 63 | 67,696 | 50 | 5.5% | 1.52 | 22.94 | 936 |
| **x2 — SHIPPED** | **26** | **81** | **102** | **107,502** | **43** | **7.1%** | **1.81** | **23.06** | **1,695** |
| x3 | 39 | 113 | 134 | 140,366 | 39 | 8.7% | 1.99 | 22.86 | 2,318 |

The approved render: 36 families, largest 5.2%, MICRO 2.54, STRUCT 30.05.

**Why x2.** It is where the picture reads like the reference's *composition*: clumps with bare
ground between them, the worn path still legible, clearings still open. x1 leaves the island's
middle visibly empty; x3 begins to close the canopy over the path and the clearings, which is
exactly what the recipe's "groves with bare ground between them" is not. On the numbers x2 also
lands the island in the recipe's OWN tree band for 13 stands (52–104 pines) while x1 falls short of
it. **A scale-back is two constants and no re-measurement:** `GROVE_DENSITY` in
`src/grove-dressing.ts` and `SHIPPED_GROVE_ARM` in `harness/shipped-canopy-scene.ts`; a test
(`canopy-arms-agree`) holds them to each other and to the rung names.

⚠ **The family census disagrees with the eye about direction, and that is worth reading, not
averaging.** As density rises the family COUNT moves toward the reference (50 → 43 → 39 against 36)
while the largest family moves away (5.5% → 7.1% → 8.7% against 5.2%). Both are true: more canopy
means fewer distinct ground colours AND more of the picture in one green. Neither picks the rung —
ADR-0503 D1 puts that with the owner and the picture.

## Measured, one island @ 8 px/unit (control = the shipped ground bare)

| arm | draw calls | triangles (ground) | objects (caps / blooms / groves) | casters | families (approved 36) | largest | MICRO | STRUCT | moved >20/255 | touched |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bare` (CONTROL) | 1 | 5,562 (5,562) | 0 | 1 | 44 | 6.6% | 0.85 | 21.18 | 0 | 0 |
| `capability` | 4 | 22,092 (5,562) | 21 (11 / 10 / 0) | 22 | 50 | 5.9% | 1.09 | 21.96 | 62,109 | 134,448 |
| `groves-x1` | 4 | 67,696 (5,562) | 63 (11 / 10 / 42) | 64 | 50 | 5.5% | 1.52 | 22.94 | 146,290 | 281,663 |
| **`groves-x2`** | 4 | 107,502 (5,562) | 102 (11 / 10 / 81) | 103 | 43 | 7.1% | 1.81 | 23.06 | 194,440 | 361,427 |
| `groves-x3` | 4 | 140,366 (5,562) | 134 (11 / 10 / 113) | 135 | 39 | 8.7% | 1.99 | 22.86 | 229,463 | 400,381 |

MICRO rose 0.85 → 1.81 at the shipped rung (the crowns' own texture and the pools under them);
STRUCT 21.18 → 23.06. The ground's triangle count is the same on every arm — a caster changes the
field, never the mesh — and the draw calls are the ground's one plus one per merged kit material
(trunks, branches, flowers).

## The forest, 35 islands

| view | arm | draw calls | triangles | objects | casters | families | largest | MICRO | STRUCT | moved >20/255 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| @ 8 px/unit | `bare` | 1 | 194,630 | 0 | 35 | 44 | 6.9% | 0.86 | 21.27 | 0 |
| | `capability` | 7 | 690,310 | 584 | 619 | 50 | 5.7% | 1.09 | 22.10 | 60,251 |
| | `groves-x1` | 7 | 1,670,354 | 1,520 (936 grove) | 1,555 | 48 | 5.0% | 1.51 | 22.97 | 138,868 |
| | **`groves-x2`** | 7 | 2,440,708 | 2,279 (1,695 grove) | 2,314 | 45 | 7.1% | 1.80 | 22.72 | 198,149 |
| | `groves-x3` | 7 | 3,081,764 | 2,902 (2,318 grove) | 2,937 | 40 | 8.3% | 1.93 | 22.91 | 220,189 |
| fitted (0.573 px/unit) | `bare` | 1 | 194,630 | 0 | 35 | 50 | 9.3% | 6.80 | 25.37 | 0 |
| | `capability` | 7 | 690,310 | 584 | 619 | 53 | 7.5% | 8.22 | 25.06 | 11,670 |
| | `groves-x1` | 7 | 1,670,354 | 1,520 | 1,555 | 51 | 7.5% | 9.38 | 26.54 | 19,459 |
| | **`groves-x2`** | 7 | 2,440,708 | 2,279 | 2,314 | 49 | 7.5% | 10.08 | 27.55 | 24,153 |
| | `groves-x3` | 7 | 3,081,764 | 2,902 | 2,937 | 52 | 7.5% | 10.47 | 28.19 | 27,243 |

Every grove pine stands on one of the 21 healthy islands (the scene test attributes each to its
nearest island centre); the 8 proposed, 2 building, 2 mapped, 1 unknown and 1 unhealthy islands draw
exactly what they drew. Seven draw calls on the forest whatever the rung: the ground, the trunks,
the branches in four tints (green, proposed, mapped — building folds to proposed), the flowers.

**ADR-0507 D5's fence — the opening view — passes at every rung.** At the fitted zoom the largest
colour family is 7.5% on all three grove rungs and on the capability arm, against the bare ground's
9.3%: the canopy does not turn a green island into a smudge, it makes it *less* dominated by one
colour than the bare ground was. `sheet-forest.png` is the picture.

## Frame cost — the RTX 2060, the arc's named box (ADR-0507 D7, ADR-0505 D3)

`frame-cost.txt` / `frame-cost.json`, from `harness/shipped-canopy-cost.mjs`: five arms × five
interleaved repeats × 20 frames per GPU query, **two independent runs, diffed row by row** by
`run-agreement.ts` with the tolerance derived from the runs' own within-run spread. The whole
35-island map, fitted — the view the site opens on.

| arm | draw calls | triangles | ms/frame | within-run spread | vs `bare` | % of a 60 Hz frame |
| --- | --- | --- | --- | --- | --- | --- |
| `bare` | 1 | 194,630 | 0.4140 | 0.0071 | — | 2.5% |
| `capability` | 7 | 690,310 | 0.5703 | 0.0124 | +0.1563 | 3.4% |
| `groves-x1` | 7 | 1,670,354 | 0.8922 | 0.0158 | +0.4782 | 5.4% |
| **`groves-x2`** | 7 | 2,440,708 | **1.1470** | 0.0213 | +0.7329 | **6.9%** |
| `groves-x3` | 7 | 3,081,764 | 1.3579 | 0.0375 | +0.9439 | 8.1% |

Every row reproduced across both runs. **The shipped picture draws the whole dressed map in 1.15 ms
— 6.9% of a 60 Hz frame — and the dressing itself is +0.73 ms.** Even the boldest rung rendered
costs 8.1%, so density is not what would break this budget.

⚠ This is the GPU's draw cost for THIS scene and nothing else. It is not the site's frame time: the
shipped canvas also runs React, controls and the compositor, none of which are on this page.

⚠ One untimed pass over every arm is taken and discarded before the measured sweep. Without it the
first timed batch of each arm carries part of the merge-and-upload of up to 3.1 M triangles:
measured, `bare` came back with a within-run spread of 1.63 ms against a 0.42 ms median — a noise
floor four times the figure — and `run-agreement` then derives its tolerance from that noise and
agrees with almost anything.

## The OTHER cost — what the canvas pays ONCE, at mount

⚠ **The frame-cost instrument above cannot see this, and it is the larger number.** The placement and
the occlusion field are built SYNCHRONOUSLY when the canvas mounts, before a frame is drawn, and the
groves roughly DOUBLE that work. Measured on this box through the package's own pure modules
(`dressMapWithGroves` + `shippedGroundBuild`, Node, single-threaded, the 35-island forest):

| arm | placement | ground build | total at mount |
| --- | --- | --- | --- |
| `bare` | — | 661 ms | **661 ms** |
| `capability` (what ships today) | 27 ms | 753 ms | **780 ms** |
| `groves-x1` | 475 ms | 928 ms | **1,403 ms** |
| **`groves-x2`** | 683 ms | 997 ms | **1,680 ms** |
| `groves-x3` | 997 ms | 1,107 ms | **2,104 ms** |

Most of it is the groves EXISTING rather than the rung: x1 already costs 1,403 ms and the shipped
rung adds 277 ms on top. It is not on the site's first-paint path — the WebGL land is `import()`-ed
lazily at the storm's calm-card click — but it IS a second of main thread on a phone, and it is the
baseline the ground-cover increment must not quietly double again. Reproduce with a throwaway probe
in the package (`node --import ../../scripts/tsx-cache-off.mjs --import tsx <probe>.ts`):

```ts
const FOREST = crowdSize('forest');
const p = dressMapWithGroves(armDescriptors(FOREST), {
  relief: LAND_RELIEF_AMPLITUDE, footprint: KIT_FOOTPRINTS_2026_08_29, density });
shippedGroundBuild(crowdCells(FOREST),
  [...crowdCasters(FOREST), ...placementCasters(p, CANOPY_FOOTPRINT, CANOPY_HEIGHTS)], crowdStrips(FOREST));
```

## Named gaps

- **The colour gap to the reference is now the GROUND COVER, not the trees.** MICRO 1.81 against
  2.54 and STRUCT 23.06 against 30.05 at the read zoom, with the trees at the reference's own
  density. The approved island also carries 70 bushes and ferns, 120 grass clumps and 26 flowers;
  that is the next increment (`ground-cover-from-the-kit-bushes-tufts-and-flowers`, ADR-0507 D4/D6)
  and it is where the remaining difference lives.
- **Blooms cast too** (every placement does, ADR-0507 D3): a flower's pool is a 2-radius,
  2.4-tall cylinder's — geometrically what a 4-unit-wide object occludes, but the flower's own
  visible geometry is a thin stem, so at 8 px/unit the pool reads wider than the thing casting it.
  Judged and KEPT: it is the recorded decision, it is invisible at the fitted view the site opens
  on, and the honest narrowing (size a caster from a prop's occluding extent rather than its
  bounding box) is a change to the frozen tables and to every prop, not a predicate on blooms.
- The grove is an ELLIPSE in the placement basis by construction (σz scaled by the aspect), read
  through the canvas's double projection; the stands cluster along x on screen.
- The recipe's path is also a geometry dip and its stands take 9% dead trees; neither is
  transcribed (ADR-0504 D4; the dead trunk is a signal here).
- The pine's own trunk reads as a small brown mass at each tree's base at 8 px/unit. That is the
  bought kit's geometry, unchanged since ADR-0475 stood the capability pines, and it is not this
  increment's to move.
- **The mount-time cost above has no committed instrument** — it was taken with a throwaway probe,
  and the reproduction is the snippet rather than a script. Building one is worth doing if the
  ground-cover increment moves it much; today the number is recorded and the shape is understood
  (the placement search is `bestCandidate` over 96 candidates per stand against a growing occupancy,
  and the ground build is the occlusion field over 2,314 casters).

## Files

`report.txt` · `measurements.json` · `frame-cost.txt` · `frame-cost.json` ·
`sheet-8px.png` (approved / bare / capability / the three grove rungs, one island @ 8 px) ·
`sheet-forest.png` (the forest fitted at every arm, with its frame cost) · 20 frames:
`{bare,capability,groves-x1,groves-x2,groves-x3}-{one,forest}-{8,fit}.png`.

Page: `harness/shipped-canopy.html`. Reproduce:

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5361 --strictPort --host 127.0.0.1
DISPLAY=:0 ST_CANOPY_URL=http://127.0.0.1:5361/shipped-canopy.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-canopy   # the pictures + the census
DISPLAY=:0 ST_CANOPY_URL=http://127.0.0.1:5361/shipped-canopy.html \
  pnpm --filter @storytree/forest-world-r3f measure-canopy-cost      # the frame cost
```
