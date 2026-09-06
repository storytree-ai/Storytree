# The shadow scaled back: the pool, the cone, the depth — on three grounds (2026-09-06)

Owner feedback on `land-ground-stack-arc`, verbatim: **"Shadows still look overdone, you have a
full circle under the tree that is quite large and a triangle for what the tree casts, both look
too large depending on the land color."** Earlier: *"the footprint looks too wide and too
prominent."* Two marks, two levers, and the depth laddered lighter — every rung rendered on a GREEN
island, an IN-PROGRESS island wearing the mustard wheat (PR #1845), and the green island's SAND band.

> ⚠ Every figure here was taken on this run, on the arc's named box (ADR-0505 D3): **NVIDIA GeForce
> RTX 2060** (ANGLE / OpenGL 4.5), `software=false`, exact-colour mode, lights calibrated by the
> map's own probe. The `today` control is the map as it shipped after PR #1841 / #1845 — the pool at
> its derived reach, the cone as wide as the crown, 0.55 deep — typed as history; every arm's ground
> is `shippedGroundBuild` and every arm's material `buildGroundMaterial`. Nothing is inherited.

## The two marks, and what each is

1. **The full circle under the tree** is the CONTACT pool (`contact-shade.ts`): the sky a caster
   hides, modelled as a CYLINDER of the crown's radius from foot to tip. For a pine that is the sky a
   solid 10-unit column would hide — the pool's edge 2.0 units past the crown, a 14-unit disc under an
   18-unit tree on an 88-unit island, packed into the soft rung. The pine is a cone on a trunk 8% of
   that width. The lever is `CONTACT_SPREAD` — the pool's edge as a fraction of the derived reach.
2. **The triangle** is the cast silhouette (`ground-casters.ts`'s `ROLE_SILHOUETTE.tree`), a cone as
   wide as the crown's FULL footprint — the outermost leaf cards — at a quarter of its height. The
   lever is `TREE_SHADOW_WIDTH` — the silhouette as a fraction of the crown's footprint. The pool's
   radius is untouched by it: two marks, two levers.

**"Depending on the land color" is a measurement, not a hedge.** A shadow rung is a FRACTION of the
lit colour, so the pale grounds lose more absolute light to the same rung: at 0.55 the green loses
~57/255 of luma, the wheat's yellow ~70 and the sand band more still. The depth
(`shadow-rung.ts`'s `SHADOW_DEPTH`) is therefore laddered UPWARD from 0.55 — higher is lighter — and
judged on the wheat and the sand as well as the green.

## The three ladders — each rides the shipped picks of the other two

| lever | ladder (crops) | pick | why |
| --- | --- | --- | --- |
| **THE POOL** | `crop-pool-green.png` · `crop-pool-yellow.png`: 1 (today) · 0.7 · 0.5 · 0.25 · 0 (none) | **0.5** | at 1 the pool is a pale disc a crown's width past every tree, plainest on the mustard; at 0.7 a ring still shows past the crown; at 0.5 the disc is INSIDE the crown's own footprint and what remains is a dark foot on the lit side — the reference's foot — while 0.25 and 0 are indistinguishable from it (244–285 px between them). The circle goes, the foot stays. |
| **THE CONE** | `crop-width-green.png` · `crop-width-yellow.png`: 1 (today) · 0.8 · 0.65 · 0.5 | **0.65** | at 1 the triangle is a broad wedge as wide as the crown; 0.8 is slimmer; 0.65 is a slender cone that still reads as a pine's shadow on all three grounds; 0.5 thins to a line. |
| **THE DEPTH** | `crop-depth-green.png` · `crop-depth-yellow.png`: 0.78 (derived) · 0.70 · 0.62 · 0.55 (today) | **0.62** | at 0.78 the shadow barely reads on the green; 0.70 reads on both; 0.62 reads clearly on the green and stays clean on the mustard now that the pool and the wedge are gone; 0.55 is heavy on the wheat and the sand. **0.70 is the next scale-back rung** if the wheat still reads heavy. |

`crop-sand-green.png` — the green island's coast: today the pools spill their pale discs onto the
sand band at every tree near the shore; shipped, the sand carries only the slim cone. The land's
median luma on the green rises 83.5 → 88.2 and on the wheat 99.7 → 105.2.

`sheet-three-grounds.png` — the whole green and wheat islands, today beside shipped.
`sheet-forest-fit.png` — the real forest, fitted: the field past the full threshold 10.70% → 8.31%,
the pool band 7.99% → 2.70%.

## The numbers (`report.txt`, one island at 8 px/unit)

| arm | field full | pool band (soft − full) | land p50 green / wheat | moved >20/255 vs today, green / wheat |
| --- | --- | --- | --- | --- |
| today (control) | 28.73% / 15.27% | 16.48% / 17.50% | 83.5 / 99.7 | — |
| pool 1 · 0.7 · **0.5** · 0.25 · 0 | 23.89% (the pool never reaches the full band) | 20.07 · 10.06 · **6.21** · 3.89 · 3.14% | 86.7 · 87.7 · **88.2** · 88.5 · 88.5 | 7,013 · 11,553 · **13,623** · 15,363 · 15,777 / 9,692 · 15,925 · **18,629** · 21,019 · 21,468 |
| cone 1 · 0.8 · **0.65** · 0.5 | 28.73 · 25.90 · **23.89** · 22.06% | ≈ 6% | 86.4 · 87.4 · **88.2** · 88.8 | 6,306 · 10,731 · **13,623** · 16,303 / 8,624 · 14,756 · **18,629** · 22,407 |
| depth 0.78 · 0.70 · **0.62** · 0.55 | 23.89% (the same field) | 6.21% | 93.9 · 90.7 · **88.2** · 87.3 | 49,578 · 21,454 · **13,623** · 12,680 / 35,323 · 26,932 · **18,629** · 18,300 |

The shipped arm coincides with `pool-0.5`, `width-0.65` and `depth-62` (the driver refuses a pick
that is not a rung the owner saw), and differs from the control by 76,262 px on the green and
61,901 on the wheat. ⚠ Neighbouring depth rungs are ~13/255 apart on the green and so sit under
ADR-0490 D6's bar between themselves (`vs neighbour` reads 0), exactly as on PR #1841's sheet; the
depth ladder is judged vs today. Every pool and cone rung moves 244–4,285 px past the bar against
its neighbour.

**The reader model, printed** (`margins.json`): the green's margin at 0.62 is **−26.4** (−37.9 at
0.55, −9.1 at 0.70, +13.3 at the derived rung); the wheat's yellow **−29.6** (−49.5 at 0.55).
Reported, not a fence (ADR-0489 D3/D4, ADR-0503 D1, ADR-0506): a shadow is a shape attached to the
tree that casts it. Every unpainted token keeps the derived rung. No shadow sends any parcel to
another status's swatch as a FLAT colour (ADR-0392 D5 / ADR-0398 D7): the deep rung reaches only the
painted tokens and only inside a caster's silhouette.

## Cost — measured and REPORTED (ADR-0517 D4)

- The mount-time stamp: one green island 36 → 22 ms; the real forest 484 → 468 ms (1,361 casters,
  the same count on every arm — the arms differ in HOW the casters cast, never in what casts).
- The GPU frame, the green island at 8 px/unit: 2.085 ms today, 1.399 ms shipped, 4 draws and
  54,514 triangles on both — within the instrument's known first-row noise
  (`the-forest-ground-is-one-draw-call`); the texels are read the same way whatever is stamped in
  them. One draw for the ground, four in all.

## What did NOT change

The light direction; the ground's lights and shade ladder; the penumbra (0.6) and the soft edge;
the analytic field — no shadow map, no second pass, one draw call, one mount-time stamp; the cover
casting and not pooling; the bloom's silhouette; what casts.

## Files

`<arm>-green.png` / `<arm>-yellow.png` (15 arms each) · `today-forest.png` / `shipped-forest.png`
(2560×1600) · `crop-pool-*.png` · `crop-width-*.png` · `crop-depth-*.png` · `crop-sand-green.png` ·
`sheet-three-grounds.png` · `sheet-forest-fit.png` · `measurements.json` · `margins.json` ·
`frame-cost.json` · `report.txt`.

Page: `harness/shipped-shadow-scale.html` (`shipped-shadow-scale-scene.ts`); driver
`shipped-shadow-scale-measure.mjs` (`pnpm --filter @storytree/forest-world-r3f
measure-shipped-shadow-scale`, `DISPLAY=:0` on the Mint box). Crops:
`node harness/crop-sheet.mjs --x 1040 --y 640 --w 560 --h 300 --scale 2` (the stand) and
`--x 980 --y 790 --w 720 --h 270` (the coast).
