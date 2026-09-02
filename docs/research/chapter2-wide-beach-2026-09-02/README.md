# Layer 2 adopted — the shore sand, on a widened beach (2026-09-02)

The shore sand is **on the map**. Owner-directed: *"the sand looks quite nice, could probably use
more of it to make it more noticable"*, and — once the two levers were priced apart — he chose
**width** over **strength**.

> ⚠ Every figure here was taken on this run.

## What changed, and why width was the right lever to offer

| lever | what it buys | what it costs the reading guarantee |
| --- | --- | --- |
| **width** (3.1 → 9 units) | more pixels wear the sand | **nothing** — the band never changes WHICH colours the layer can deliver |
| strength | more colour shift per pixel | the whole margin — it is the only axis the reachable colour set depends on |

So the beach is wider and the sand sits **on** its measured ceiling.

## The two factors are separate, and that is what let layer 2 ship at all

Under ONE shared factor layers 1+2 have one joint ceiling of **0.235** — *below* the 0.32 layer 1
already ships at. Composited that way, adopting the sand would have quietly **dimmed the live
map's grass**. Given its own factor:

- layer 1 stays at **0.32**, its delivered pixel byte-identical to what shipped
- the sand is fenced on its own measurement: **0.16**, where 0.17 breaks

Same argument as ADR-0492's, one level down: don't force one component's ceiling onto another's.

## Measured, one island @ 8 px/unit

| arm | families | largest | top 3 | touched | moved >20/255 | triangles |
| --- | --- | --- | --- | --- | --- | --- |
| `flat` (layer 1 only — CONTROL) | 20 | 20.9% | 42.4% | 0 | 0 | 5562 |
| `authored` (layers 1+2) | **26** | **16.0%** | **31.7%** | 161,029 | 0 | 5562 |
| *approved render* | *36* | *5.2%* | — | — | — | — |

**The colour gap closes further: 20 → 26 of the approved render's 36.** The beach covers ~30% of
the island (161,029 of 540,225 px) against 62,402 at the recipe's narrow band — 2.6× the area.

⚠ **`moved >20/255` is 0, and that is the honest number rather than a failure.** ADR-0490 D6's
per-pixel bar was written for a layer that changes each pixel it touches by a lot; this one changes
a lot of pixels by a little — at 0.16 the largest possible shift is 15/255, so the bar reads zero
however wide the beach is. The driver's refusal was re-framed onto **area** for that reason, and
the per-pixel figure is reported beside it rather than used as a verdict (ADR-0489 D3 makes the
outcome the fence).

⚠ **So the delivered beach is broader but GENTLER than the frame the owner approved**, which was
the recipe's narrow band at layer 1's 0.32 — a strength that misreports at the ladder's two
brightest rungs. Honesty cost visibility here; the punchier version is one constant
(`SHIPPED_SAND_MIX`) and reintroduces that misread.

## The carrier got 18.7× faster, and it had to

Adopting layer 2 makes the shore field's build cost live on mount.

| | before | after |
| --- | --- | --- |
| one island (153 k texels) | 730 ms | **117 ms** |
| 35-island forest (5.38 M texels) | **49.7 s** | **2.66 s** |

Three changes, all **exact** — `src/shore-grid.test.ts` proves the field agrees with a brute-force
walk at every probe on both a square and a 240-edge wobbling ring:

1. **One reader per island, not per map.** A tile IS one island, and `shoreField`'s own header
   gives the geometric reason the nearest loop is always the containing island's. 49.7 s → 26.1 s.
2. **A uniform grid over the coast's edges** (`src/shore-grid.ts`), cell = query width. An empty
   3×3 neighbourhood *proves* every edge is at least `width` away, so the capped far field — most
   of the atlas — is answered without touching an edge. 26.1 s → 3.5 s.
3. **One neighbourhood scan per sample**, not two. 3.5 s → 2.66 s.

## Two things found only by running it

- **A GLSL declaration-order bug no text assertion could see.** The emitted sand source is spliced
  *above* the shader's uniform block, so a `uSandWidth` referenced inside it is used before
  declaration and the material fails to compile — while the source still contains every token a
  containment test looks for. The width is now a function **parameter**; `land-sand.test.ts` fences
  the emitter against declaring any uniform of its own.
- **A `src/` test reaching into `harness/`.** `shore-grid.test.ts` first imported `shippedParcels`;
  `src/` is mirrored into the public site and copies nothing from `harness/`, so it would dangle in
  the published tree. The fixture is now built in-file.

## Files

`report.txt`, `measurements.json`, and 4 frames: `{flat,authored}-one-{8,fit}.png`.
