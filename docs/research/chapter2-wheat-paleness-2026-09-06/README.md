# How pale the wheat is — a stop-luma lift on the rebased ramps — 2026-09-06

Increment `wheat-paleness-ladder` on `paint-every-land-type-arc`. Taken on the Mint box's RTX 2060
(`report.txt` line 1 names the renderer; `software=false`), on the map as it ships after PR #1845
(the wheat field on the in-progress islands, the mustard anchor picked from the yellowness ladder).

## What this row does

The yellowness ladder (`chapter2-wheat-field-2026-09-06/`) rebased the grass's six ramp stops onto
an authored anchor with no free constant, and its sheet surfaced what that costs: **every rung is
darker and duller than the flat yellow token**, because the recipe's ramps sit BELOW the token they
mix into (the green's dark stop is 0.20–0.26 of its token, the mid stop ~0.5, and the base scalar
concentrates near the mid stop). The green islands wore that darkening as their approved look; on
the yellow it costs the flat token's brightness. The anchor cannot fix it — the pale anchors went
peach. So this row adds the ONE lever that can: a lift on all six rebased stops in linear space,
ratio-preserving (`src/land-wheat.ts`, `liftStop` / `WheatPalette.lift`), laddered with the
mustard anchor held fixed. The cool/warm drift and the dark-to-light ladder keep their proportions;
only the field's brightness moves.

The lift is written into the shader source with the stops it scales (`wheatGlsl`), like the
anchor; the material refuses a lift below 1 or not a finite number. Nothing about the seam changes:
the wheat still enters as a mix INTO the island's yellow (ADR-0490 D5), never a cover.

## The ladder — how pale it is (the owner's pick)

Four lifts from 1.0 upward, chosen against the flat token's own brightness rather than by eye
(`wheatFieldLuma`: the mean Rec.709 luma of every reachable wheat colour mixed at 0.85 into the lit
flat token, against the lit flat token's own):

| rung | lift | field luma | flat luma | ratio | warm light stop | hue | clamped channels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `1.00` | ×1 (as derived) | 134.0 | 171.8 | 0.780 | `#cba049` | 40.2° | 0 |
| `1.50` | ×1.5 | 156.1 | 171.8 | 0.908 | `#f3c059` | 40.1° | 0 |
| **`2.00`** | **×2** | **173.4** | 171.8 | **1.009** | `#ffda66` | 45.5° | 1 |
| `3.00` | ×3 (overshoot) | 196.9 | 171.8 | 1.146 | `#ffff7b` | 60.0° | 5 |

`sheet-8px.png` — the in-progress island flat (the reference every rung is measured against), the
four rungs, the green island (unchanged). `crop-8px.png` — the same six at 2x. `sheet-forest-fit.png`
— the REAL forest fitted (the studio's own layout for the live corpus, `chapter2-forest-spacing-
2026-09-06/scenes/spacing-0.json`, **25 healthy / 10 in-progress** islands as at 2026-09-05):
control, shipped, overshoot.

**The pick: `2.00` ships (`SHIPPED_WHEAT_LIFT`).** It is the rung at which the field's mean
brightness REACHES the flat token's — exactly what the finding asked for — and on the crop the
island stops reading as a darker island beside the green and reads as a pale gold field, its olive
cool half and gold warm half both intact (55 colour families on the island, the same as the
derivation's). It is the boldest rung the look defends: `3.00` is brighter still but overshoots the
flat token by 15%, clamps five of the eighteen stop channels, and both light stops collapse into
one flat lemon (`#ffff79`) — the island loses a fifth of its colour families (55 → 44) and the top
of the mottle flattens. It is on the sheet so that "too far" is a picture rather than an argument;
scaling UP to it, or back to `1.50`, is one edit along rungs already rendered (ADR-0503 D3).

**A quarter lift was rendered first and dropped.** The ladder was authored as 1.00 / 1.25 / 1.50 /
2.00; on the RTX 2060 the `1.25` rung moved **0** pixels of the in-progress island past ADR-0490
D6's 20/255 bar against `1.00` (and `1.50` moved 3,331 of 215,230 — 1.5%). A lever laddered at a
shallow rung is invisible, and a ladder with an invisible rung offers the owner a scale-back that
changes nothing, so the top rung went up to `3.00` instead. The driver reports a rung below the bar
rather than refusing it; byte-identical to its neighbour is the refusal.

## The two findings, carried as numbers on every rung

1. **The darkening, and how much each rung recovers** — the `field luma` column above. The
   instrument is layer 1 alone; the PICTURE also carries the layers above (sand, path, rock, detail)
   and the deep shadow rung the painted stack wears, which the flat island does not, so the whole
   island's mean (`report.txt`: flat 141.0 → 91.3 / 96.4 / 100.5 / 107.0) recovers less than the
   field's does. The lift moves layer 1; the rest of the gap is the stack, and it is the same stack
   the green wears.
2. **The hue does not go peach.** A ratio-preserving lift moves NO hue until a channel clamps — the
   warm light stop reads 40° as delivered at `1.00` and `1.50` alike — and when one does (the red at
   `2.00`) it turns toward YELLOW (45°), away from the peach the pale anchors showed (the straw's
   warm light stop sits at 22°, the wheat token's at 17°). At `3.00` both light stops are a pure
   lemon at 60°. The second finding of the yellowness sheet is therefore not re-exposed by a lift on
   the mustard. (The hue is HSV on the DELIVERED sRGB bytes — the linear-space figure is 32°; the
   delivered one is what the eye reads.)

## The numbers (`report.txt`)

One in-progress island at 8 px/unit, against the control (`1.00`, the wheat as it shipped this
morning): `1.50` moves **3,331** px past 20/255, `2.00` **38,153** (17.7% of the land),
`3.00` **67,245** (31.2%); every rung touches ~172k px. Colour families: flat 20 → 55 / 55 / **55**
/ 44. The green island: **0 px touched** between control and shipped.

The real forest fitted: `2.00` moves **2,080** of 36,615 land px past the bar (the ten in-progress
islands at 1.2 px/unit); families 42 → 45.

**The reader model, printed** (`margins.json`; ceiling walked on a **0.0005 grid** — quote the step):

| rung | ceiling @ 0.0005 | worst margin at 0.85 | worst pixel reads as | shares over the ladder |
| --- | --- | --- | --- | --- |
| `1.00` | 0.0085 | −54.37 at `building@0.77` | `unhealthy` | building 30% · healthy 32% · mapped 34% · unhealthy 5% |
| `1.50` | 0.0135 | −30.95 | `mapped` | building 59% · healthy 32% · mapped 9% |
| **`2.00`** | **0.0250** | **−24.57** | `healthy` | building 77% · healthy 23% |
| `3.00` | 0.0555 | −19.20 | `healthy` | building 97% · healthy 3% |

The lift IMPROVES every reader figure — a paler field sits nearer its own flat token — and at
`2.00` the share of reachable colours reading as the wheat's own family goes from 30% to 77%. The
shipped GREEN on the same instrument at its 0.85: **−33.48**. The shadow on the yellow: 3.0 at the
derived rung 0.78 → −39.9 at the deep rung 0.55. Reported, not a fence (ADR-0503 D1, ADR-0506,
ADR-0489 D3/D4): the table holds the FLAT six tokens, so "reads as healthy" means nearer the flat
green than the flat yellow, which a viewer comparing two PAINTED islands never does.

## Cost — measured and REPORTED (ADR-0517 D4)

- **GPU frame**, 60 frames on the GPU's own clock: the real forest fitted **0.407 ms control →
  0.408 ms shipped**. (One island: 2.329 → 0.383 ms — the first-batch inflation
  `the-forest-ground-is-one-draw-call` records, not a saving.) The lift is six constants in a ramp
  the fragment already evaluates; it cannot move the cost.
- **The mount-time stamp** is the same field on every arm: 27–30 ms one island.
- Triangle delta zero on every arm.

## What did NOT change

The green islands' delivered look (0 px, asserted by the driver); the anchor (the mustard the owner
picked); the factor, the rows, the layers above, the shadow; the recipe's structure; one draw call
for the ground.

## Files

`<arm>-{green,yellow,forest}.png` (14 frames, 2560×1600) · `sheet-8px.png` · `crop-8px.png` ·
`sheet-forest-fit.png` · `measurements.json` · `reference.json` · `margins.json` ·
`frame-cost.json` · `report.txt`.

Page: `harness/shipped-wheat-lift.html` (`shipped-wheat-lift-scene.ts`, a table over the
yellowness page's runner — `shipped-wheat-scene.ts`'s `WheatArmTable`); driver
`shipped-wheat-lift-measure.mjs` (`pnpm --filter @storytree/forest-world-r3f
measure-shipped-wheat-lift`, `DISPLAY=:0` on the Mint box, the harness served from THIS worktree on
its own port). Instrument: `harness/wheat-status-reading.ts` (`wheatLiftReports`, `wheatStopReport`,
`wheatFieldLuma`). Sheets: `contact-sheet.mjs` and `crop-sheet.mjs --x 880 --y 540 --w 800 --h 480
--scale 2` (⚠ captions may not contain `=` or an em dash).
