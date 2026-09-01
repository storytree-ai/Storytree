# The stepped skirt crosses onto the shipped map — the sixth and last component

`adopt-the-land-into-the-shipped-map-arc` · 2026-09-01 · `packages/forest-world-r3f`

The approved land treatment is six components. This is the last of them: **the asset kit's cliff on
a six-row stepped skirt**. It is also the only one that could not be built at all until the owner
decided, because it is the first ground surface on this map that reports nothing.

Reproduce:

```bash
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5312 --strictPort
```

```bash
ST_SKIRT_URL=http://localhost:5312/shipped-skirt.html pnpm --filter @storytree/forest-world-r3f measure-shipped-skirt
```

Renderer for every number here: **ANGLE / Qualcomm Adreno X1-85, D3D11** — a real GPU, not
SwiftShader. `skirt-measurements.txt` is the run verbatim; `skirt-measurements.json` is the same
data.

---

## 1. What the owner settled, and how much of it he gave away

He stamped it on 2026-09-01. Verbatim:

> "regarding rock color, yeah stamp it the test should be overall themse color, so we should have
> flexibility for session to add additional colors as needed, the session should just look at the
> final and ask itself can I tell what state this island is in."

**He granted more than the question asked, and that is the part that matters.** The question was
whether ONE surface may stop reporting a capability's health. The answer gives sessions standing
flexibility to add colours as needed. So ADR-0414 D1's "every ground colour is a report" is no
longer absolute — the fence moved from **composition** (every colour must encode something) to
**outcome** (the island's state must still be readable):

> **LOOK AT THE FINAL RENDER AND ASK: CAN I TELL WHAT STATE THIS ISLAND IS IN?**

It does not cap the number of colours, does not require each to encode something, and does not send
the judgement back to him. **This build applied it.** The verdict is §4.

## 2. The arms

| arm | what it is | whose option |
|---|---|---|
| `flat` | ONE wall per rim edge, wearing the parcel's status colour — the map before this landing | the CONTROL and the denominator |
| `stepped` | six ledges, still the parcel's status colour — the shape without the rock | his option C |
| `rock` | six ledges, all rock | his option A — **this is what ships** |
| `soil-over-rock` | six ledges, the top one keeping the status tint | his option B |

Every arm shares the coast clip, the shore fall, the relief, the nine-rung ladder, the grain, the
occlusion atlas, the light and the camera. **The only thing that moves is the island's edge**, so a
pixel difference between two arms is attributable to the cliff and to nothing else.

## 3. The reference arm — the picture the owner approved, through this page's own instrument

This arc's standing rule is that a crossing is judged against the approved render and never against
its own best arm — *"the image that I stamped as looking awesome was done in isolation and now we
trying to do the same with the app constraints in place"*. So the Cycles render goes through the
**same** three measurements as the live frames.

| reference render | anchor | MICRO | STRUCT | mean |
|---|---|---|---|---|
| `land-combined` — the kit's cliff (APPROVED) | 42.65 | 2.543 | 30.045 | 131.82 |
| `land-strata` — the same render, procedural rock | 53.65 | 2.497 | 27.295 | 134.37 |
| `land-combined-bare` — the land with no props | 46.37 | 1.368 | 23.621 | 139.82 |

- **ANCHOR** — 2nd percentile of luma over the island's own pixels: its darkest value.
- **MICRO** — mean |Δluma| between neighbouring pixels: contrast at the pixel scale.
- **STRUCT** — std-dev of luma after a 4-px box blur: contrast at the scale an overview still has.

**⚠ THE INSTRUMENT IS VALIDATED BY RE-DERIVING THE FINDING IT WILL BE USED TO JUDGE.**
`combined` and `strata` differ in *nothing but the skirt material*, so the gap between them is what
the kit's cliff is worth. Measured here: **STRUCT −9.2%**, **anchor +11.0 luma**. The original
research reported **−9.8%** and **+7.0**. Two independent implementations of `measure_land.py`'s
definitions, over the same pair, agreeing to within a point on the number this component's whole
justification rests on. That is why the live numbers below can be trusted against it.

## 4. What the arms settle — and the owner's test, applied

At one island, 8 delivered px per ground unit (the zoom the cliff is read at):

| arm | triangles | cliff px | anchor | MICRO | STRUCT | GPU µs |
|---|---|---|---|---|---|---|
| `flat` | 2,264 | 0 | 134.36 | 0.923 | 8.037 | 1401.4 |
| `stepped` | 4,864 | 33,329 | 134.36 | 0.994 | **7.265** | 1439.5 |
| `rock` | 4,864 | 35,434 | **69.14** | 1.044 | **20.143** | 1439.3 |
| `soil-over-rock` | 4,864 | 34,486 | 69.14 | 1.036 | 19.921 | 1439.3 |

**⚠⚠ OPTION C IS DISPOSED OF ON EVIDENCE, AND IT IS THE PAGE'S SHARPEST RESULT.** The stepped shape
*in the parcel's own colour* moves STRUCT **8.04 → 7.26, which is −9.6%**. It does not merely buy
less than the rock; on the axis the component exists to move it is **slightly worse than doing
nothing**, because six ledges of the same green are six more surfaces at nearly the same lightness.
Option C was the free answer that needed no decision from the owner, and it turns out to buy
nothing. **The material is the component, not the shape** — which is exactly what the original
research said and what nobody had checked in the live renderer.

**The rock moves the anchor 134.4 → 69.1 and STRUCT 8.04 → 20.14 (+150.6%).** The island stops
looking like a cut-out sticker and starts standing on something.

**A over B, decided here rather than by the recommendation.** `soil-over-rock` lands within 1.1% of
`rock` on STRUCT and identically on the anchor, buying **948 px** of status band. Three reasons A
ships:

1. **The state is still readable without the band** — see the verdict below.
2. **B's band is on the least readable ledge.** The top ledge is cut ~0.40 units *inboard* of the
   rim, so from this map's 2.5D isometric camera it is the ledge most occluded by the parcel above
   it. B was recommended on the grounds that the top ledge is where a report can still be seen; on
   this geometry that is the opposite of true.
3. **B spends the thing the component is for.** A lit status band across the top course is exactly
   what lifts the dark anchor the cliff exists to supply.

It is a number (`SHIPPED_SOIL_LEDGES`), not a boolean, so B remains one edit away.

### ⚠ THE VERDICT ON HIS TEST — applied, not deferred

**Can I tell what state this island is in? YES, and it is not a close call.**

- At the **forest overview** (`*-forest-fit.png`), the cliff is sub-pixel and invisible. Every
  island reads purely by its top-face colour, and the five status colours are unmistakable —
  green, yellow, red-brown, near-black, pale grey. The rock changes nothing at the zoom the map is
  mostly read at.
- At the **read zoom** (`rock-one-8.png`), the top face is ~93% of the island's own pixels and is
  untouched; the rock is a band at the edge, below the surface, obviously a different *kind* of
  surface rather than a different state.
- **Mechanically**, no rock ledge can ever deliver a pixel a status family delivers —
  `harness/skirt-rock-separation.test.ts` enumerates both closures and fails on any collision. That
  is the half of his test a machine can hold; the rest is the pictures above.

**⚠ THE HONEST RESIDUAL, stated because it is the one place this is tight.** The rock's nearest
status neighbour is `unhealthy`, at an RGB distance of **9.0** — the rock's darkest rung `#404041`
against `unhealthy`'s darkest `#46433b`. They do not collide and the test asserts a floor, but they
are close, and a future edit to either should re-read that number. It is tight because the rock is
the *approved render's own measured colour* rather than a hue chosen for distance; moving it to buy
clearance would be trading the picture the owner stamped for a model nobody has validated.

## 5. Where the rock came from — measured, not picked

The owner's settlement offered "name the rock colour yourself, or have one proposed against your
approved picture". This is the second.

`land-combined-1948px.png` and `land-strata-1948px.png` are the same render differing in nothing but
the skirt material. **So the set of pixels where the two images differ IS the skirt, exactly** — no
hand-drawn mask, no eyedropper, no "the dark ring is probably the cliff". Over that mask:

- **76,297 skirt pixels**, 6.67% of the island's own pixels.
- **Median skirt colour `rgb(77, 77, 79)` = `#4d4d4f`.** That is the token, unrounded.
- Its lit quartile is `rgb(115, 114, 116)`; its dark quartile `rgb(29, 32, 37)`.

It is **neutral**, and that is the point rather than a failure to find a hue: every status family
sits on the green/ochre/brown axis, and the harness's prop palette already establishes the rule that
an ornament's colour is chosen well off that axis (ADR-0406 D4).

## 6. ⚠⚠ THE COST IS 5× WHAT THE ARC SIZED IT AT, AND THE REASON IS ANOTHER COMPONENT

The arc priced this component at "**six rows ≈ 624 extra triangles on the reference island**",
derived from **52 rim edges**. Measured now: the island has **260 rim edges** and the skirt costs
**+2,600 triangles** (2,264 → 4,864). The forest costs **+90,820** (79,240 → 170,060).

**Nothing drifted — component 1 landed.** The coast clip ships in `subdivide` mode, which inserts
the smoothed curve's own points along each rim edge; a 52-vertex rim became a ~260-edge one, and
every one of those edges is now a cliff edge. The arc's own start-order note predicted exactly this
class of error and says so in terms: *"a start-order note prices work against the repository as it
stood on the day it was written, and this arc's own increments keep changing that. Re-grep before
sizing anything here."* This is that, arriving on the next component.

**It does not matter, and the numbers say why.** The ground is still **ONE draw call** on every arm
at every size — the driver refuses the run otherwise. The cost is **+2.7% of GPU frame time**
(1401.4 → 1439.3 µs at one island; 1459.5 → 1499.5 µs across the whole forest), and the whole-forest
ground at 170,060 triangles is nowhere near ADR-0380 D2's floor, which is draw-call bound rather
than triangle bound.

## 7. The gap to the approved picture — what "the app's constraints" still cost

| | shipped (`rock`) | approved render | ours as % |
|---|---|---|---|
| anchor | 69.1 | 42.7 | **26.5 luma lighter** |
| STRUCT | 20.14 | 30.05 | **67%** |
| MICRO | 1.04 | 2.54 | **41%** |

The cliff arrives, closes two thirds of the structural-contrast gap, and does **not** reach the
render's depth. The mechanism is known and is arithmetic rather than opinion: the approved skirt
spans luma **20.7 (p2) to 117.6 (p90)** — a 5.7× range, because a path tracer lights it. This map's
ladder spans **0.80 to 1.00**, a 1.25× range, so **one token cannot reproduce that spread**. The
house remedy already exists — the prop palette gives a material with a lit face and a shaded flank
*two* tokens rather than relying on the ladder — and applying it to the cliff is the obvious next
move if the owner wants the gap closed further. It is not taken here: this landing crosses the
component and measures what it delivered, and a second token is a second change.

**MICRO at 41% is the sharper of the two gaps**, and it is the same finding the grain octave
already recorded — the pixel-scale read is where the browser's constraints cost most.

## 8. Files

| | |
|---|---|
| `src/stepped-skirt.ts` | the component: the profile transcribed from `build_land.py`, the rim census, the rock |
| `src/cell-ground-geometry.ts` | the wall loop is now a ladder of ledges; one ledge at inset 0 is the old quad, arithmetic included |
| `src/ForestWorldCanvas.tsx` | the adoption — unconditional, no flag, the rock appended as the last ramp row |
| `harness/shipped-skirt-scene.ts` | the four arms and the three measurements |
| `harness/shipped-skirt.html` | the page |
| `harness/shipped-skirt-measure.mjs` | the driver and its refusals |
| `harness/skirt-rock-separation.test.ts` | no rock ledge may deliver a status colour |
| `*-one-8.png` / `*-forest-fit.png` | the frames, one per arm per size |
