# The cast shadow: shape, edge, depth — 2026-09-06

Increment `the-trees-cast-the-shadows-the-reference-casts` on `land-ground-stack-arc`. Taken on the
Mint box's RTX 2060 (`report.txt` line 1 names the renderer; `software=false`), on the map as it
ships after PR #1829: one tree per capability (ADR-0518), the island at 318 units² per capability
(ADR-0520), the cover at half the recipe's count.

**The owner, 2026-09-06, after the resized islands:** *"i imagine shadows are the only thing that
needs work now."*

## What was wrong, in one crop

`crop-8px.png` — the same stand at 8 px/unit, 560×300 at 2×, today (left) against what ships
(right); `crop-reference.png` is the same-sized crop of the render he stamped.

Every object stamped one soft grey capsule: the swept disc of a cylinder its size, at one shallow
rung (0.78 against flat ground's 0.90), with the contact pool around every foot at the same rung —
so a pine sat in a pale oval as wide as its crown, and the ground cover cast nothing at all. The
approved render casts the pine's own cone under a 3° sun, deep, and every bush casts a small tight
shadow beside it.

## The three levers, each a ladder — every ladder rides the shipped picks of the other two

| lever | ladder (crop) | pick | why |
| --- | --- | --- | --- |
| **SHAPE** | `crop-shape.png`: today · cylinders · silhouettes · silhouettes + cover casts | **silhouettes, cover casts** | the cone is the reference's tapering shadow; the cover's domes are the reference's bush shadows |
| **EDGE** | `crop-edge.png`: penumbra 0.15 (hard) · 0.6 · 1.2 (the old width) · 2.4 | **0.6** | 0.15 and 0.6 both read as the 3° sun's crisp edge; 1.2 wears a halo, 2.4 is mush. 0.6 over 0.15 because a 0.3-unit band is one texel and hides the field's staircase on a diagonal edge |
| **DEPTH** | `crop-depth.png`: the derived 0.78 · 0.65 · 0.55 · 0.45 on the green islands | **0.55** | 0.78 is today's paleness; 0.65 is halfway; 0.55 is the darkness of the reference's shadows; 0.45 is darker than the reference |

The first run laddered the edge at the derived rung, where the soft band differs from lit ground by
12/255 — under ADR-0490 D6's 20/255 bar — and moved 69–183 px between rungs. That is why every
ladder now rides the shipped picks of the other two: a rung is a picture only against the depth
that ships.

## Two things the first run found that the increment did not name

1. **The contact pools had to move to the soft rung.** With the depth ladder the full rung is
   deep, and the first run merged the pools (ambient occlusion around every foot) at full: 51.75% of
   the island's field sat past the full threshold, every tree and bush wore a ring of full darkness
   (`contactReach` is 1.7 units past a crown's radius, 0.75 past a bush's), and the island read as
   blotches. The approved render's contact darkening is the sky's share — soft — while the sun
   shadow is the deep one. `contact-shade.ts`'s `SHADOW_CONTACT_BAND` packs the pool into the
   material's soft band (`0.25 < occ ≤ 0.5`; the byte is clamped to 127, because
   `round(0.5 × 255) = 128` is 0.502 and would land on the full rung). Only the cast term reaches
   the full rung now.
2. **The cover casts and does not pool.** Even at the soft rung a bush sat in a dim halo three
   quarters of a unit wide; the reference's bushes cast a tight shadow and nothing else.
   `ground-casters.ts`'s `COVER_POOLS = false`: a cover placement's caster carries `pool: false`.

## The numbers (`report.txt`, one island at 8 px/unit unless said)

| arm | casters | field past full | pixels moved >20/255 vs today | vs its neighbour |
| --- | --- | --- | --- | --- |
| today (control) | 21 | 40.83% (pools included) | — | — |
| shape-cylinder | 21 | 23.33% | 41,140 | — |
| shape-cone | 21 | 16.53% | 29,358 | 15,309 |
| shape-cover (ships) | 129 | 28.72% | 49,624 | 20,096 |
| edge-0.15 / 0.6 / 1.2 / 2.4 | 129 | 28.72% | see report | 1–8k each |
| depth-78 / 65 / 55 / 45 | 129 | 28.72% | 5,272 / 16,774 / 49,624 / 50,322 | 2,259 / 0 / 0 |
| forest, fitted: today → shipped | 584 → 2,852 | 31.6% → 19.9% | 7,673 | — |

The shipped arm coincides with `shape-cover`, `edge-0.6` and `depth-55` (the driver refuses a run
where it coincides with no rung — a pick has to be a rung the owner saw).

**The reader model, printed** (`margins.json`, `report.txt`): the margin of a shadowed `#8cb85e`
(healthy) pixel is **+13.3 at the derived 0.78 and −37.9 at 0.55** — the per-pixel model reads a
shadowed green pixel as nearer `unhealthy`'s swatch. Reported, not a fence (ADR-0489 D3/D4,
ADR-0503 D1, ADR-0506): a shadow is a shape attached to the tree that casts it, and the island,
looked at, is a green island with shadows. Every other token keeps the derived rung, so the yellow
islands (ADR-0492 D3's deploy gate) never wear a negative margin; their picture changes only in the
field — cone shapes, cover shadows, pools at the soft rung.

**The green-luma histogram** (`report.txt`) is an instrument with a stated blindness: crowns and
cover are green too, so its low tail is foliage as much as shadowed grass. Read the shape of the
row: the reference's mass sits in one bright bin with a tail; ours at 0.55 spreads the shadowed
grass into the bins below it, which is where the reference's own shadows sit.

## Cost — measured and REPORTED (ADR-0517 D4)

- **The mount-time stamp.** One island: 24 ms → 73 ms. The forest: 506 ms → 1,673 ms
  (584 → 2,852 casters). ⚠ The first cut cost the forest **21,081 ms** — `silhouetteOcclusion`
  probing the profile at every sample of every caster's box. `silhouetteEnvelope` tabulates each
  caster's outline once (`land-shadow.ts`), and the stamp is a table read again. The per-sample
  function survives as the definition the table is tested against.
- **The GPU frame** is unchanged by construction (the texels are read the same way) and the
  instrument agrees within its own noise: 0.307 / 0.327 ms, 1.53 / 1.38 ms, 2.23 / 0.34 ms across
  three runs for today / shipped — the first-row effect `the-forest-ground-is-one-draw-call`
  records is larger than any difference. One draw for the ground, four in all.

## What did NOT change

The light direction; the ground's lights and shade ladder; the analytic field — no shadow map, no
second pass, one draw call, one mount-time stamp; the yellow islands' rung.

## Files

`<arm>-one.png` (13 arms) and `today-forest.png` / `shipped-forest.png` (2560×1600) · `sheet-8px.png`
· `sheet-forest-fit.png` · `crop-shape.png` · `crop-edge.png` · `crop-depth.png` · `crop-8px.png` ·
`crop-reference.png` (from `chapter2-tree-detail-2026-09-04`) · `measurements.json` ·
`reference.json` · `margins.json` · `frame-cost.json` · `report.txt`.

Page: `harness/shipped-cast-shadow.html` (`shipped-cast-shadow-scene.ts`); driver
`shipped-cast-shadow-measure.mjs` (`pnpm --filter @storytree/forest-world-r3f
measure-shipped-cast-shadow`, `DISPLAY=:0` on the Mint box). Crop:
`node harness/crop-sheet.mjs --x 1040 --y 640 --w 560 --h 300 --scale 2`.
