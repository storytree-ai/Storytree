# The ground cover — the recipe's bushes, tufts and flowers, and the scale the port lost (2026-09-04)

The increment: `ground-cover-from-the-kit-bushes-tufts-and-flowers` on `land-ground-stack-arc`.
The owner: *"BE NICE IF WE CAN ADD FLOWERS"* — and the render he stamped is not only trees.
`build_land.py`'s `scatter()` (`:1087-1090`) sprinkles **70 undergrowth objects, 120 grass clumps
and 26 flowers** over the land for every thirteen stands of pines, from the same bought kit, and
the land-idiom README's own finding is that the approved island's colour content is almost entirely
its **props**. Rocks and logs are not in this row (the owner: *"minus the rocks and the logs"*;
ADR-0475 D4 pockets both).

> ⚠ Every figure here was taken on this run, on the arc's named box (ADR-0505 D3): **NVIDIA
> GeForce RTX 2060** (ANGLE / OpenGL 4.5), `--use-gl=angle`, `software=false`, exact-colour mode,
> lights calibrated by the map's own probe (a lit white face delivered 0.3176 at the authored
> intensities; scale 3.1481; ladder floor 0.80). Nothing is inherited from an increment row, an arc
> intent or an earlier sheet — including the previous night's, which this run's first arm
> re-measures on purpose.

## The finding first — the cover was invisible because of its SIZE, and the ladder had to move

A run on 2026-09-03 laddered the **count** with `build_land.py`'s own sizes and measured the
result: 318 / 534 / 750 objects standing on one island moved **356 / 743 / 1,130** pixels past
ADR-0490 D6's 20/255 bar against the canopy — on an island where the canopy itself moved 194,440.
Four hundred and thirty-two ground-cover props were in the scene, in the triangle counts and in the
draw calls, and were not in the **picture**. That run died before it could re-render, and its own
diagnosis is what this row starts from.

**The cause is a scale mismatch the port inherited.** The recipe's island is **93.8 ground units**
across and its pine **4.0 units** tall — its own comment says so, *"circumradius, pack units (a pine
is ~4 tall)"*. This map's island is **234 units** (2.49×) and its `tree` role is **18 units**
(4.50×). So every **signal** on this map was already scaled up when it crossed, and the ground cover
was the one thing transcribed at its literal size. That is
`a-faithful-port-under-a-rule-the-source-lacks-under-delivers` exactly: faithful to the source, and
wrong against a map that is not the source's size. Standing *more* eight-pixel flecks was never
going to answer it.

So the ladder is on **size**, and the count stays the recipe's own. Same 216 props on one island,
three rungs (one island @ 8 px/unit, against the canopy that ships today):

| arm | rung | objects (cover) | widest cover prop | px moved >20/255 vs today | vs the rung below | prop px | families | MICRO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bare` (the mask, nothing standing) | — | 0 (0) | — | — | — | 0 | 41 | 0.66 |
| **`canopy` — TODAY** (control) | — | 102 (0) | — | 0 | — | 165,364 | 47 | 2.61 |
| `cover-1` — `build_land.py` transcribed | 1 | 318 (216) | 1.38 u | **558** | — | 166,361 | 47 | 2.65 |
| `cover-2.5` — the island's own scale | 2.5 | 318 (216) | 3.45 u | 6,780 | 6,632 | 175,233 | 47 | 2.95 |
| **`cover-4.5` — the trees' own scale — SHIPPED** | **4.5** | **318 (216)** | **6.20 u** | **25,620** | **23,324** | **200,132** | **50** | **3.78** |
| the approved render (Cycles) | | | | | | | 36 | 2.54 |

- **Rung 1 is the literal port and it is confirmed invisible — 558 px.** The same props at the
  trees' own scale move **25,620**, a factor of 46, which is the same order as the crown-lighting
  landing of the day before (28,781). The 2026-09-03 number was not measuring a placement bug; it
  was measuring a prop about eight delivered pixels across, dark green on dark-green ground.
- **The prop mask is the plainest reading of it.** Ground cover adds 216 objects to an island that
  already stands 102, and at rung 1 that buys **997 more prop pixels** (166,361 against the canopy's
  165,364) — under 1%. At rung 4.5 it buys **34,768**, a fifth again of everything standing.
- MICRO passes the reference on the way (2.61 → 3.78 against the approved render's 2.54), and the
  colour-family count moves *away* from it (47 → 50 against 36). Neither is the verdict — read
  `a-metric-scored-in-isolation-rewards-invisibility` before either is quoted as one. The pictures
  are `sheet-8px.png` and `crop-8px.png`.

## The pick — `cover-4.5`, the boldest rung, per ADR-0503 D1/D3

`crop-8px.png` is the four arms cropped at a stand, 560×300 at 2×, with `crop-reference.png` the
same-sized crop of the approved render. At rung 1 the cover is a scatter of specks; at 2.5 it reads
as undergrowth; at 4.5 the tufts and bushes are distinct objects on the ground, which is what the
reference's are.

**One thing the owner should have in front of him when he picks.** In the approved render a
ground-cover plant is roughly 35–55% of a pine crown's width. On this map a pine's footprint is
10.13 units, so `cover-2.5`'s widest bush (3.45 u) sits at **34%** — the reference's own proportion
— and `cover-4.5`'s (6.20 u) at **61%**, bolder than the reference. The bold rung is shipped because
ADR-0503 D1 says to apply the layer boldly and let the scale-back be a rung already on the sheet;
`cover-2.5` is the rung that matches the reference's proportion, and it is one constant away.

**ADR-0507 D5's opening-view fence passes on every rung** (`sheet-forest-fit.png`). At the fitted
forest — the view the map opens on — `cover-1` is byte-identical to today, `cover-2.5` moves 8
pixels, and `cover-4.5` moves 766; the largest colour family is **7.7% on every arm**, and the
islands stay clean green blocks.

## The criterion marker stays distinct — and the bound is flower against FLOWER

A `bloom` is a claim: one flower per UAT criterion the owner signed (ADR-0226 D4), the kit's
`Red_Flower_01` at 4 units wide. Ground cover is dressing and may not be confusable with it.

- **Colour:** ground-cover flowers are `White_Flower_01` and nothing else. The asset carries no
  second red flower, which `kit-vocabulary.test.ts` asserts over the tables rather than over a
  picture.
- **Size:** the widest ground-cover flower delivered on **any** arm at **any** view this run is
  **1.995 units**, against the marker's 4 and the bound of 2. `KIT_ROLE_SIZE.flowerPatch`'s width is
  derived *backwards* from that bound at the ladder's **boldest** rung, and both
  `kit-vocabulary.test.ts` and the driver check it at every rung — a scale-back must not be what
  makes the map honest.

⚠ **The bound is on the FLOWER and not on the cover generally**, and getting that wrong is not a
detail. The driver's first run refused a perfectly good arm over a **3.45-unit bush**, because the
check was written over every dressing role. A bush is not confusable with a tall red flower at any
width — the boldest rung's bush is wider than the marker and nothing like it — and refusing on it
would have scaled the whole layer back to protect a claim nobody made. The rule the row states is
exact: the marker stays *the only red flower and the only one at its size*.

## The payload — and the cover subset is nearly free, because it adds no texture

| kit | wire (`.glb`) | brotli q11 | base64 in `kit-asset.ts` | base64 + brotli | GPU bytes (mips) | textures | triangles | fetch + parse |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| native, six objects (until this landing) | 1,715,496 B | 1,647,262 B | 2,287,328 B | 1,661,335 B | 201,326,589 B | 9 × 2048² | 4,052 | 387 ms |
| **native, twelve objects (ships)** | **1,782,636 B** | 1,687,045 B | 2,376,848 B | **1,707,976 B** | **201,326,589 B** | 9 × 2048² | 6,000 | **413 ms** |
| change | **+3.9%** | +2.4% | +3.9% | **+2.8%** | **unchanged** | unchanged | +48% | +26 ms |

The six added objects — `Leafy_Plant_01/02`, `Grass_Clump_01/02/03`, `White_Flower_01` — sit on the
three materials the kit **already carries** (`Pine_Branches`, `Pine_Forest_Foliage`, `Pine_Trunks`),
so they add 1,948 triangles and **not one texel**. Against ADR-0508's 201 MB of texture memory that
is the whole difference between this landing and the one the increment's payload rule was written
to fear. The row's own bar was "no more than about a third again over the wire"; this is 3.9%.

**What the full recipe subset would have cost, measured by the same export.** All eight
`UNDERGROWTH`, all five `GRASS` and all five white and yellow `FLOWERS` — 24 objects — export at
**2,676,172 B, +56.0% over the wire**, 12,601 triangles, and they pull in a **fourth material**,
`Pine_Foliage_02`. On the GPU that is three more 2048² maps with their mip chains at this kit's own
per-texture figure (22,369,621 B): **+67.1 MB, taking the map from 201 MB to 268 MB** — computed
from the export's material list and this run's measured per-texture bytes, not loaded. That is why
the shipped subset is what it is, and the rest is a named gap rather than an absence to infer
(`COVER_GAP_2026_09_03` in `src/kit-vocabulary.ts` carries the per-object reasons).

## Frame cost — the RTX 2060 (`frame-cost.txt`, `shipped-cover-cost.mjs`)

Four dressed arms × five interleaved repeats × 20 frames per GPU query, two independent runs diffed
row by row by `run-agreement.ts`. The whole 35-island forest, fitted.

| arm | draw calls | triangles | ms/frame | spread | vs today | % of a 60 Hz frame |
| --- | --- | --- | --- | --- | --- | --- |
| `canopy` (today) | 7 | 2,440,708 | 1.1623 | 0.1686 | — | 7.0% |
| `cover-1` | 7 | 3,805,446 | 1.6199 | 0.0313 | +0.4576 | 9.7% |
| `cover-2.5` | 7 | 3,805,446 | 1.6319 | 0.0793 | +0.4696 | 9.8% |
| **`cover-4.5`** | **7** | **3,805,446** | **1.6342** | 0.0118 | **+0.4720** | **9.8%** |

Every row reproduced across both runs. Two things worth reading off it:

- **The layer costs +0.47 ms, 7.0% → 9.8% of a 60 Hz frame** — 4,536 more objects and 1,364,738 more
  triangles on the fitted forest, and **no extra draw call**, because every prop merges into the
  same per-material mesh.
- **The three size rungs are within their own spread of each other** (1.6199 / 1.6319 / 1.6342
  against spreads of 0.01–0.17). The rungs draw identical geometry and differ only in each prop's
  scale, so the whole cost is vertex-side: **the owner's pick along this ladder is free**, and a
  scale-back buys back nothing but the look.

## Named gaps

- **Ground cover casts no shadow, and that is a decision** (`placementCasters` drops the dressing
  roles; `cover-dressing.ts`'s header argues it). Two halves: a healthy island carries 216 cover
  props against 81 grove pines, so casting from them would multiply the map's kit casters by about
  four; and the ground material has exactly ONE occlusion rung and *thresholds* the field, so a
  sub-unit contact pool does not arrive as the soft ambient darkening Cycles shows — it arrives as a
  hard dot at full rung strength. A carpet of those is not a shadow. It is one authored rung away
  from being reconsidered.
- **The three `Leafy_Bush_*`, the ferns, both single grass blades, the second white flower and the
  three yellow flowers are not shipped** — the fourth material above. The recipe's yellow flowers
  are cheap in triangles and expensive in exactly that way.
- The reference's ground is a lighter green than this map's, so its cover reads as darker speckle on
  light where ours reads as dark on dark. That is the ground colour, settled on its own increment,
  and it is not this row's to move.
- The per-arm "prop" statistics are over every pixel that differs from `bare` — trees, trunks,
  blooms and cover together — because the mask cannot tell them apart.

## Files

`report.txt` · `measurements.json` · `payload.json` · `frame-cost.txt` · `frame-cost.json` ·
20 frames `<arm>-<one|forest>-<8|fit>.png` (2560×1600) · `sheet-8px.png` · `crop-8px.png` ·
`crop-reference.png` · `sheet-forest-fit.png`.

Reproduce (the RTX box): `pnpm --filter @storytree/forest-world-r3f exec vite harness --port <p>
--strictPort --host 127.0.0.1`, then
`DISPLAY=:0 ST_COVER_URL=http://127.0.0.1:<p>/shipped-cover.html pnpm --filter
@storytree/forest-world-r3f measure-shipped-cover` and `… measure-cover-cost`.
Sheets: `harness/contact-sheet.mjs` / `harness/crop-sheet.mjs`.
Re-export the kit: `~/.local/bin/blender -b "$HOME/assets/superhive/Stylized Pine Forest Nature
Kit/Pine_Forest_Kit.blend" -P docs/research/chapter2-vocabulary-2026-08-29/export-dressing.py --
<outdir> <keep,csv>`, copy to `harness/assets/dressing-kit.glb`, then `node --import
../../scripts/tsx-cache-off.mjs --import tsx harness/build-kit-asset.mjs`.
