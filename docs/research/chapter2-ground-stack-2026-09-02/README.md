# The approved ground's layers 3, 4 and 6 on the shipped map — one ladder per layer (2026-09-02)

Increments `layer-3-the-worn-path`, `layer-4-rock-on-slope` and `layer-6-cliff-normal-as-detail`
on `land-ground-stack-arc`, under the owner's standing directive (ADR-0503): the layers are applied
BOLDLY, each chosen from a rendered ladder shown to him inline, "scale it back" his lever. The
worn path's mechanism is ADR-0504 (the trail docks joined across each island on the canvas side).

> ⚠ Every figure here was taken on this run, on this box: Qualcomm Adreno X1-85 (ANGLE D3D11),
> `--use-gl=angle`, `software=false`. It is NOT the RTX 2060 the arc's end-state names; internally
> consistent, not comparable to a committed RTX figure. The frame-cost figures at the bottom are
> the same box's.

## What ships

| layer | constant | value | ladder it was chosen from |
| --- | --- | --- | --- |
| 2 shore sand | `SHIPPED_SAND_MIX` | **0.65** (owner: *"actually lets go with sand 0.65"*) | 0.16 / 0.40 / 0.65 / 0.90 |
| 3 worn path | `SHIPPED_WEAR_MIX` | **0.85** on the recipe's 3.0-unit falloff | 0.50 / 0.80 / 1.00 |
| 4 rock on slope | `SHIPPED_ROCK` | **0.85 on [0.88, 0.95]** | recipe [0.72, 0.90] / [0.88, 0.95] / [0.92, 0.98] |
| 6 cliff normal | `SHIPPED_DETAIL_STRENGTH` | **0.60** (128-texel tile at 2.4 units) | 0.30 / 0.60 / 1.00 |

Every ladder varies ONE number and holds the layers below it at what ships, so a pixel between two
rungs is attributable to that rung (`GRASS_ARM_LAYERS` in `harness/shipped-grass-scene.ts`).

## Measured, one island @ 8 px/unit (control = the map before layer 2: grass 0.32, nothing else)

| arm | families (approved 36) | largest | top 3 | MICRO | STRUCT | moved >20/255 | touched |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `flat` (CONTROL) | 20 | 20.9% | 42.4% | 0.84 | 23.01 | 0 | 0 |
| `sand-65` | 33 | 15.2% | 29.7% | 0.81 | 25.20 | 122,088 | 162,964 |
| `path-50` | 33 | 14.8% | 29.2% | 0.82 | 25.19 | 122,608 | 172,520 |
| `path-80` | 33 | 14.8% | 29.2% | 0.82 | 25.23 | 125,233 | 172,617 |
| `path-100` | 32 | 14.8% | 29.2% | 0.82 | 25.28 | 126,476 | 172,649 |
| `rock-recipe` [0.72, 0.90] | 32 | 14.6% | 28.8% | 0.86 | 25.16 | 128,033 | 188,496 |
| `rock-88-95` | **39** | 12.3% | 24.6% | 1.23 | 25.07 | 159,649 | 264,811 |
| `rock-92-98` | 51 | 8.1% | 18.3% | 1.60 | 24.88 | 226,001 | 391,221 |
| `detail-30` | 39 | 12.3% | 24.7% | 1.22 | 25.03 | 157,472 | 274,371 |
| `detail-60` | 39 | 12.3% | 24.7% | 1.25 | 25.03 | 157,650 | 283,859 |
| `detail-100` | 39 | 12.2% | 24.6% | 1.32 | 25.03 | 157,909 | 296,644 |
| **`authored` = SHIPS** | **39** | **12.3%** | **24.7%** | **1.25** | **25.03** | **157,650** | **283,859** |

**The colour-family gap this arc exists to close is CLOSED: 20 → 39 against the approved render's
36.** The largest family fell 20.9% → 12.3% (approved 5.2%), the top three 42.4% → 24.7%. MICRO
contrast rose 0.84 → 1.25 (approved 2.54) — the rock outcrops are what lifted it; STRUCT 23.0 →
25.0 (approved 30.05). Triangle delta is ZERO on every arm (5562): all three layers are
fragment-stage.

What each layer delivered, read off its ladder:
- **The path** is a dirt track between the two trail docks, visible from 0.50 and unmistakable at
  0.85; it adds ~9.6k touched pixels (a 3-unit falloff track is a small area) and no family — its
  colour sits inside the sand's. `path-100` is the recipe's pure dirt on the track.
- **The rock** on the recipe's own ends is a faint lip along the beach's ring chain and nothing
  inland (the interior's up-component never drops below 0.91 — `interiorMinimumUp()` in
  `src/land-rock.ts`); [0.88, 0.95] puts rock veins along the interior's steepest swells (+7
  families); [0.92, 0.98] greys most of the island (51 families, and the green stops being the
  ground). The shipped rung is the middle one. It rides the grain-perturbed normal, a NAMED
  departure from the recipe's unbumped `Geometry.Normal` — recorded on both sides of the seam.
- **The detail** normal is fine break-up at this zoom: +10–20k touched pixels between rungs, no
  family change; 0.60 doubles the recipe's 0.30 because the 128-texel derivative carries ~77% of
  the 2048 map's tilt and the recipe's whorl limit (0.55) was about the full-resolution map.

## The forest, 35 islands (the per-token gate in pixels, ADR-0492 D1)

At 2 px/unit the shipped arm dresses **47.7%** of the all-green island's land and **21.2%** of the
real-mix forest's — the difference is the 14 yellow islands drawing exactly what they drew before.
At 8 px/unit the forest frame is the same re-centred green island (582k vs 576k land px), so the
gate is asked only at the zoom whose frame holds more than one island. Every forest arm draws
194,630 triangles — the same on every arm.

## Frame cost (Adreno X1-85, `harness/land-floor-measure.mjs`, `ST_LAND_FLOOR_ANGLE=default`)

`floor/land-floor-report.txt` — the floor's `grass` arm is `authored`, i.e. the WHOLE shipped
stack (grass + sand + path + rock + detail), priced against BARE ground; two runs, every row
reproduced (gaps 0.0–0.9%), the amplified arm proving the instrument sees fragment cost.

| view | bare ground | the whole stack | stack's cost | share of a 16.67 ms frame |
| --- | --- | --- | --- | --- |
| 35-island forest @ 8 px/unit | 1.880 ms | 3.568 ms | **+1.688 ms** | stack 21.4%; its cost 10.1% |
| one island @ 8 px/unit | 0.673 ms | 2.329 ms | UNRESOLVED (spread 1.68 ms on this row) | — |

Layer 1 alone measured +1.133 ms on the forest view on this same box (its own landing), so
layers 2, 3, 4 and 6 together add about **+0.55 ms** on top of it — the sand's and path's
octaves, one texture fetch each, the rock's ramp and the detail's fetch. ⚠ Read the report's own
"7 layers at this layer's cost = 13.7 ms" line as VOID here: that extrapolation multiplies the arm
by seven on the assumption the arm is ONE layer, and this arm is the finished stack. The honest
figure is the delta itself. ⚠ Adreno X1-85 figures, not the RTX 2060 the arc's end-state names.

## Named gaps (ADR-0490 D1's rule: where the live renderer cannot do what Cycles does, say so)

- The recipe's path is also a GEOMETRY dip (`z -= 0.30 * wear`, `build_land.py:496`) and a
  prop-exclusion mask (`:1046`); the colour layer delivers neither (ADR-0504 D4).
- The recipe's rock mask reads the unbumped normal; ours reads the grain-perturbed one, and the
  slope ends are re-derived for this mesh's slope range — both stated departures.
- The detail map is a 128-texel derivative of the 2048 source (26 KB embedded, 27.8 KB brotli as
  a `.ts`), which is all the delivered zoom can resolve (a tile is ~20 px at 8 px/unit).
- The 2D maps (studio SVG, website) still route trails AROUND islands; only the 3D ground shows
  the crossing (ADR-0504 Consequences).
- The reader-model margin is reported by the instrument, not used as a fence (ADR-0503 D1).

## Files

`report.txt` · `measurements.json` · four composed sheets (`ladder-path-8px.png`,
`ladder-rock-8px.png`, `ladder-detail-8px.png`, `stack-overview.png`) · 60 frames:
`{flat,authored,sand-16,sand-40,sand-65,sand-90,path-50,path-80,path-100,rock-recipe,rock-88-95,rock-92-98,detail-30,detail-60,detail-100}-{one,forest}-{8,fit}.png`.
