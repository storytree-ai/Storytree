# Layer 2 at a bold strength — the shore sand at 0.65 (2026-09-02)

Increment `land-layer-2-on-the-widened-beach` on `land-ground-stack-arc`, re-scoped by the owner:
*"the sessions are being too conservative … apply the layers how you see fit allowing yourself to
be adventurous, show me an image each time inline and if i dont tell you to scale it back keep
going."* Decision: **ADR-0503**.

> ⚠ Every figure here was taken on this run, on this box: Qualcomm Adreno X1-85 (ANGLE D3D11),
> `--use-gl=angle`, `software=false`. It is NOT the RTX 2060 the arc's end-state names, so the
> numbers are internally consistent and not comparable to a committed RTX figure. There is no
> frame-cost figure here because the strength is a UNIFORM: the octave count (23 + 6) and the
> triangle count (5562) are identical on every arm.

## What changed

`SHIPPED_SAND_MIX` 0.16 → **0.65** — the owner's number. Shown the ladder he said *"sand .9 looks the best fyi"*, then *"actually lets go with sand 0.65"*; the scale-back was one constant because the ladder was already rendered (ADR-0503 D3). Nothing else: same 9-unit beach, same grass at 0.32, same
gate to `healthy`. The comparison page grew a strength LADDER (`sand-16` / `sand-40` / `sand-65` /
`sand-90`) beside the control and the shipped arm, and `harness/contact-sheet.mjs` composes the
frames into the one image the owner was shown (`ladder-8px.png`).

## Measured, one island @ 8 px/unit (control = the map as it shipped before layer 2)

| arm | families (approved 36) | largest | top 3 | MICRO | STRUCT | moved >20/255 | touched | tris |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `flat` (CONTROL) | 20 | 20.9% | 42.4% | 0.84 | 23.01 | 0 | 0 | 5562 |
| `sand-16` (was shipped) | 26 | 16.0% | 31.7% | 0.83 | 23.35 | **0** | 161,029 | 5562 |
| `sand-40` | 34 | 15.4% | 30.1% | 0.82 | 24.11 | 96,016 | 162,568 | 5562 |
| `sand-65` = `authored` (SHIPS) | **33** | 15.2% | 29.7% | 0.81 | 25.20 | **122,088** | 162,964 | 5562 |
| `sand-90` | 35 | 15.2% | 29.5% | 0.80 | 26.55 | 133,750 | 163,146 | 5562 |

At 2 px/unit (the overview) the same ordering holds: 20 → 26 → 35 → 33 → 35 families, and the
beach is visible at the overview from 0.40 up (6,005 / 7,616 / 8,378 px moved), where 0.16 moved
none.

**The colour-family gap: 20 → 33 against 36** (0.90 reached 35; the owner traded two families for more green in the beach). What remains is layers 3, 4 and 6.

## Why never 1.0

`mix(c, sand, uSandMix * (1 - band))` at 1.0 delivers the recipe's pure sand at the waterline. The
status colour left in the beach is what keeps the beach the island's own colour family rather than a
decal laid on it — ADR-0490 D5's seam (a layer modulates the status colour, never replaces it) kept
literally. It is also the one thing that lets the shipped arm and the recipe's own beach be told
apart by construction.

## The reader model, as an instrument rather than a fence

`harness/grass-status-reading.ts` still reports that at any strength above ~0.15 a sunlit sand
pixel on a green island's rim sits nearer the `proposed`/`building` swatch than its own green. That
figure is carried as context. ADR-0489 D3/D4 make the OUTCOME the fence — *can I tell what state
this island is in?* — and the answer, by the owner's own look and by these frames, is yes: a green
island with a sand shore — and the owner, shown 0.90, chose 0.65 for exactly that reason. ADR-0503 records the scoping; ADR-0489 D5, ADR-0490 D2 and ADR-0492 D2/D5
carry the in-place annotations.

## Files

`report.txt` · `measurements.json` · `ladder-8px.png` (the composed picture) · 12 frames:
`{flat,authored,sand-16,sand-40,sand-65,sand-90}-one-{8,fit}.png`.
