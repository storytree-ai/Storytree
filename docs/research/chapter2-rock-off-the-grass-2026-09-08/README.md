# The rock leaves the interior grass — 2026-09-08

`rock-leaves-the-grass` on `mount-the-land-on-a-real-surface-arc`, under **ADR-0553**.

**This is a picture, not a number.** ADR-0553 D2 withdrew the status-reading acceptance test and
forbade replacing it with another reading figure — removing rock cannot deliver a correct status
read, so any such bar would be unmeetable by construction. D3 makes the owner's look the verdict.
The figures below REPORT. They gate nothing.

## What changed, in one sentence

The rock layer's slope mask was reading the **bumped** surface normal — the one the cliff detail map
and the ground grain have already tilted — so it painted grey wherever a texture bump tilted a
fragment, which on this land is the interior grass. It now reads the **ground's own** normal, taken
before either bump. Nothing else moved: not the ramp ends, not the strength, not another layer.

## The pictures

| sheet | what it shows |
| --- | --- |
| `sheet-one-island-before-after.png` | one island at the read zoom (8 px/unit) — the zoom a member works at |
| `sheet-whole-forest-before-after.png` | all 35 islands fitted (0.575 px/unit) |
| `sheet-matched-before-after.png` | the forest at the 2D map's own delivered scale (1.425 px/unit) |
| `sheet-coast-close.png` | the coast at 6x — **unchanged**, which is the other half of the claim |
| `change-map-one.png` / `change-map-fit.png` | every pixel that moved, lit red over the after frame |

`before/` and `after/` hold the raw frames the sheets are cropped from, plus each run's own
`report.txt` and `measurements.json`.

## How the two arms were taken

Both by `harness/real-forest-measure.mjs` against `harness/real-forest.html`, on the same box within
minutes of each other, off the same committed scene export
(`../chapter2-real-forest-2026-09-08/scenes`), at the same three framings. **The only difference
between them is the one line this branch changes** — the `before` arm was taken with that line
textually restored to what `main` emits, and the working tree was otherwise identical and still.

    renderer   ANGLE / NVIDIA GeForce RTX 2060, OpenGL 4.5 — not a software rasteriser
    settled    3 readbacks over 500 ms before the first measurement (both arms)

⚠ The settle matters and is not optional. The instrument that produced ADR-0549's withdrawn figures
read each scene back before its textures had reached the GPU. Rendering twice does **not** fix that;
the variable is time. `settleFrames` reads until two consecutive readbacks are byte-identical and
refuses if the frame never settles.

## What moved, measured

Per-pixel over the two arms' own frames (max channel delta; "the land" is every non-background
pixel of the before frame):

| picture | land pixels | changed | share of the land | max channel delta |
| --- | --- | --- | --- | --- |
| `fit` (0.575 px/unit) | 21,739 | 1,346 | 6.19% | 30 |
| `matched` (1.425 px/unit) | 46,588 | 2,593 | 5.57% | 39 |
| `one` (8 px/unit) | 143,116 | 9,498 | 6.64% | 31 |

The change map shows where: veins across the interior grass and a wash through the beach band, and
**nothing at the coast wall** — which is what the arithmetic predicts, because the coast is steep on
either reading and its mask clamps to a full 1 both ways.

## The second, independent reason

ADR-0553's own Consequences: *a decision resting on one measurement is one instrument bug away from
being wrong.* So the mechanism is evidenced twice, by two instruments looking at two objects, and
neither is the render above.

**1. The relief field, sampled analytically** (`src/land-rock.test.ts`). Over an interior grid at
the shipped constants:

    geometric normal          min up-component 0.9104   rock mask 0 at every sample
    + the grain's bump alone  min up-component 0.7583   mask non-zero on 6.2% of samples

0.9104 clears the ramp's 0.90 ceiling, so on the geometry the interior mask is identically zero
rather than merely small. `interiorMinimumUp()` derives 0.9104 from the relief's own peak slope
without sampling anything, and the sampler agrees with it. The grain is only half the bump — the
detail normal map runs first at strength 0.6 — so 6.2% is a floor on what the old wiring delivered.

**2. The mesh the map actually draws** (`harness/rock-on-the-shipped-mesh.test.ts`). The vertices
`cellGroundGeometry` emits for the shipped island, restricted to the rows `grassGate` admits (an
ungated row wears the skirt's own authored rock and not this layer at all):

    up-component            share of painted ground vertices   rock mask
    < 0.10  near-vertical              57.03%                  1.000  (the coast wall)
    0.10 – 0.72                         0.39%                  1.000
    0.72 – 0.90  the shore fall         4.71%                  partial — the ramp doing ramp work
    >= 0.90  flat ground               37.87%                  0.000
                                                               ^ the whole interior, bare

Two different objects, two different questions, same answer: on the geometry there is no interior
fragment the ramp admits, and the coast is where the layer lives.

## What this does NOT say

- **It does not claim a status-reading improvement, and there isn't one to claim.** ADR-0553's
  corrected measurement attributes 12 of the 13 misreads to the trees and their cast shadows. The
  driver prints its own four-arm status figures in each `report.txt`; they are the withdrawn
  instrument's ladder, kept because the driver produces them, and they are not this unit's evidence.
- **It does not open the trees-and-shadows thread.** The owner was offered that alongside this and
  did not take it (ADR-0553 D4).
- **It does not touch the boulder props, the grass, the sand, the path, the detail layer or the
  shadow atlas** (D5), and it does not retune anything toward subtlety.
