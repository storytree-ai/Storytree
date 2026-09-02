# The ground's colour at the look — lit layers, the grass base unfenced, rock on the recipe's ends (2026-09-03)

Increment `ground-colour-at-the-look-lit-layers-and-the-grass-unfenced` on `land-ground-stack-arc`,
under **ADR-0506** (accepted, owner-directed). The owner looked at the finished five-layer stack
(`../chapter2-ground-stack-2026-09-02/stack-overview.png`) beside the render he stamped and said,
verbatim: *"the ground looks nice but doesnt seem like we have achived the equivlent of what i
stamped as the goal … I'm hoping to get as close to this look as possible minus the rocks and the
logs."* This directory is the ladder he scales back along, and the before/after.

> ⚠ Every figure here was taken on this run, on this box: Qualcomm Adreno X1-85 (ANGLE D3D11),
> `--use-gl=angle`, `software=false`. Internally consistent; not comparable to a committed RTX 2060
> figure. No frame-cost figure is taken here — the factor is a uniform and the level stage is
> arithmetic on a value the fragment already holds, so the stack's cost does not move with the pick.

## What changed, and why the stack had not matched

1. **The grass base was fenced at 0.32 while every layer above it was bold.** Layer 1 shipped at the
   per-pixel reader model's ceiling-with-headroom (ADR-0492 D2); ADR-0503 demoted that instrument
   for layers 2–6 and said so *"scoped to LAYER 1"*. At 0.32 a healthy fragment is 68% flat status
   token. ADR-0506 extends ADR-0503 D1 to layer 1: chosen from this ladder by the look, the reader
   model prints its (now negative) margin and no longer picks the number.
2. **Every colour layer entered the mix UNLIT.** Each seam was `mix(c, layerColour, factor)` with `c`
   the LIT ramp entry and `layerColour` the recipe's unlit albedo, so a bold factor flattened the
   relief's banding and the contact shadows in proportion. `levelSelectGlsl` in
   `banded-ground-material.ts` recovers the fragment's rung (shadow rung included) and every seam
   multiplies its colour by it first — Cycles' shade-the-composited-albedo order on this ladder. An
   unlayered shader is byte-identical to before.
3. **The rock veins are not in the picture.** Layer 4 rode a `[0.88, 0.95]` departure that veins the
   interior; the approved render wears rock only at the steep coast, which is what the recipe's own
   `[0.72, 0.90]` delivers on this mesh. `SHIPPED_ROCK` reads `ROCK_SLOPE_RAMP`; the veins stay on
   the page as the `rock-veins` arm.

## What ships

| layer | constant | value | ladder it was chosen from |
| --- | --- | --- | --- |
| 1 grass base | `SHIPPED_GRASS_MIX` | **0.85** (was 0.32) | 0.32 / 0.55 / 0.70 / 0.85 / 0.95 — `ladder-grass-8px.png` |
| 4 rock on slope | `SHIPPED_ROCK` | **0.85 on the recipe's [0.72, 0.90]** (was [0.88, 0.95]) | `before-after-8px.png` carries the veins beside it |
| every colour seam | `levelSelectGlsl` | lit by the fragment's rung | — (a mechanism, not a strength) |

Sand 0.65 (the owner's number, ADR-0503 D2), path 0.85 and detail 0.60 are unchanged.

## Measured, one island @ 8 px/unit

Control = the map as PR #1798 shipped it (grass 0.32, nothing above — `CONTROL_GRASS_MIX`, pinned so
every row stays comparable to the 2026-09-02 tables). Every grass rung wears the whole shipped stack
above it with lit seams and varies layer 1 alone.

| arm | families (approved 36) | largest | top 3 | MICRO | STRUCT | moved >20/255 | touched |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `flat` (CONTROL) | 20 | 16.8% | 38.1% | 1.00 | 19.81 | 0 | 0 |
| `grass-32` (the old base, veins off, lit) | 34 | 11.6% | 26.4% | 1.17 | 21.27 | 119,638 | 210,899 |
| `grass-55` | 43 | 8.0% | 21.7% | 1.13 | 20.92 | 122,095 | 542,592 |
| `grass-70` | 43 | 7.0% | 18.3% | 1.11 | 21.17 | 283,268 | 542,592 |
| **`grass-85` = `authored` = SHIPS** | **47** | **6.7%** | **16.0%** | **1.09** | **21.79** | **441,857** | **542,592** |
| `grass-95` | 50 | 5.7% | 14.9% | 1.07 | 22.41 | 488,436 | 542,592 |
| `rock-veins` (the 2026-09-02 ends, on the new grass) | 54 | 5.3% | 13.5% | 1.23 | 21.40 | 458,291 | 542,592 |

Triangle delta is ZERO on every arm (5,562): everything here is fragment-stage. The approved render
through the same census: 36 families, largest 5.2%, MICRO 2.54, STRUCT 30.05.

**Read against the approved render:** the family count and the largest family's share are now past
the reference (47 vs 36; 6.7% vs 5.2%) — the colour GAP this arc was chartered on is closed and
then some. What remains short is CONTRAST: MICRO 1.09 against 2.54 and STRUCT 21.8 against 30.1.
The reference's contrast is mostly its props and their shadows (the research README's own finding:
the approved island's colour content is almost entirely its PROPS), which this increment does not
touch and the next two on the arc do.

**Why 0.85 and not 0.95.** On the sheet, 0.85 is the rung where the ground reads as the approved
render's grass — darker and more saturated than the token, the cool/warm drift visible — with enough
of the status token left to keep the green the island's own family; 0.95 is darker than the
reference and spends the last of the token for three more families. Never 1.0 (ADR-0490 D5).

## The forest, 35 islands (the per-token gate in pixels, ADR-0492 D1)

At 2 px/unit the shipped arm dresses **94.1%** of the all-green island's land and **40.4%** of the
real-mix forest's — the difference is the 14 yellow islands drawing exactly what they drew before.
`forest-fit.png` shows the opening view: the green islands are darker and textured, and every
status stays plainly separable from every other.

## Named gaps (ADR-0490 D1's rule)

- **The path reads narrower than the reference's.** The recipe's 3.0-unit falloff is transcribed
  faithfully, but the approved render's path is also worn DOWN in geometry and cleared of props
  (ADR-0504 D4), which is what widens its visual corridor there. A width ladder is one uniform
  (`WEAR_FIELD_WIDTH`) if the owner wants it.
- **The reader model prints on the pre-lit arithmetic.** `harness/grass-status-reading.ts` still
  mixes the unlit albedo into the lit base; its margins are a report bounded by the level
  (0.77–1.0) and fence nothing (ADR-0506 D5). Re-deriving it on lit layers is instrument work.
- **No trees, no shadows under the kit's trees, no ground cover, and the cliff's height** — the two
  increments that follow on the arc (`grove-density-and-kit-shadows-on-the-green-islands`,
  `ground-cover-from-the-kit-bushes-tufts-and-flowers`) carry the first three; the cliff is the
  closed parent arc's edge work.

## Files

`report.txt` · `measurements.json` · three composed sheets (`ladder-grass-8px.png`,
`before-after-8px.png`, `forest-fit.png`) · the 8 px/unit frame of every arm on one island
(`<arm>-one-8.png`, 21 arms) · the control's and the shipped arm's fitted and 8 px frames on the
forest (`{flat,authored}-{one,forest}-{8,fit}.png`). The other 55 frames the driver wrote (the
fitted and forest frames of the ladder rungs) were not committed; `measurements.json` carries their
numbers. Reproduce: `pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5340
--strictPort --host 127.0.0.1`, then `ST_GRASS_URL=http://127.0.0.1:5340/shipped-grass.html pnpm
--filter @storytree/forest-world-r3f measure-shipped-grass`.
