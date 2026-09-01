# The cliff carries a range — a lit rock and a shaded one

`adopt-the-land-into-the-shipped-map-arc` · increment `two-token-cliff-for-the-skirts-tonal-range` ·
2026-09-01 · `packages/forest-world-r3f`

The stepped skirt landed on 2026-09-01 (PR #1782) and named its own gap: **one token cannot span the
cliff's tonal range, and the arithmetic forbids it**. This is the second token.

Reproduce:

```bash
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5341 --strictPort
```

```bash
ST_SKIRT_URL=http://localhost:5341/shipped-skirt.html pnpm --filter @storytree/forest-world-r3f measure-shipped-skirt
```

Renderer for every number here: **ANGLE / Qualcomm Adreno X1-85, D3D11** — a real GPU, not
SwiftShader. `skirt-measurements.txt` is the run verbatim; `skirt-measurements.json` is the same data.

---

## 1. The premise, re-derived rather than inherited

The approved skirt spans luma **20.7 (p2) to 117.6 (p90)** — a **5.7×** range, because a path tracer
lights it. This map paints from an authored ladder spanning **0.80 to 1.00**, a **1.25×** range. One
token stepped down that ladder cannot reach 5.7×, so no re-pick of a single rock closes the gap.
`stepped-skirt.test.ts` asserts both halves of that sentence, so the premise fails loudly if the
ladder is ever refined rather than quietly becoming false in a comment.

**And the ladder is worse than its own 1.25×, which is the measurement that mattered.** Swept over
36 rim azimuths: the three **undercut** ledges fall below the ladder's darkest rung at **every
azimuth — 36 of 36**, and the three **proud** ledges at 19, 17 and 15 of 36. The floor is where the
cliff piles up. The shipped single-token cliff delivers luma 62.1 to 77.1 and most of it is 62.1.

## 2. ⚠⚠ The obvious rule is wrong, and this page is where that was found

The natural remedy is to give the shaded rock **the faces the ladder has saturated** — they are
delivered at one lightness however much darker they truly are, so a token is the only lever left on
them. That reasoning is sound and it omits the camera.

| | `two-token-lit` (shade by LIGHTING) | `two-token-deep` (shade by DEPTH) |
|---|---|---|
| anchor vs `rock` (69.1) | **103.3 — 34.1 luma LIGHTER** | **29.7 — 39.5 luma darker** |
| STRUCT vs `rock` (20.38) | **14.15 (−30.6%)** | **25.38 (+24.5%)** |

The lighting rule moves the island's dark anchor **the wrong way**. The mechanism is measurable and
is not about the rule's logic:

- The saturated faces are **74.7% of the cliff's triangles**, **54.5% of its front-facing
  triangles**, and **19.0% of its projected AREA**.
- On this map the light sits **52° from the camera**, so a face turned away from the light is turned
  away from the viewer too, and is seen nearly edge-on.
- Those faces paint **1.05% of the island**. The anchor is its **2nd percentile**. A band covering one
  percent of the picture is one the anchor cannot see *by construction* — and the lit rock the rule
  puts on everything else is lighter than the median rock it replaced, so the island got lighter.

**The lesson generalises past this cliff: selecting by LIGHTING selects by FORESHORTENING too,
whenever the light and the camera sit near one another.** The rule is kept in the code as
`shadeBelowLadderFloor` and on this page as an arm, so the next reader inherits the measurement
instead of re-deriving it.

**The visible cliff is three courses, not six.** Projected front-facing area per course, on the
shipped fixture:

| course | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| projected area | 15.4 | **200.7** | 0.0 | **267.0** | 0.0 | **333.3** |

The undercut courses contribute **exactly nothing**. Only the proud courses are seen at all.

## 3. What ships — the cliff's own lower half

`shadeBelowHalfDepth`. It keys on **the one variable the ladder is blind to**: every rung on this map
is a function of a surface NORMAL and of nothing else, so no ladder however refined can express *how
deep this face sits*. The ground already has an answer for "less sky reaches here" — the occlusion
atlas — and it is packed over the islands' GROUND, so it stops at the rim and never reaches the
cliff. A rock that darkens with depth is that missing term, at the one surface the atlas leaves out.

**It is the split the picture already made, not a tuned threshold.** The two tokens are the approved
skirt mask's own two halves, split at its median; this splits the cliff at its own half-depth. One
move, applied once to the colours and once to the geometry. It puts the shaded rock on courses 4 and
6 — **600.3 of the cliff's 816.4 visible units, 73.5%** — so the anchor can see it.

## 4. The tokens — the same measurement, extended

`land-combined-1948px.png` and `land-strata-1948px.png` are the same render differing in nothing but
the skirt material, so the set of pixels where they differ **IS the skirt, exactly**. Over those
76,297 pixels:

| | token | what it is | delivered luma |
|---|---|---|---|
| `SKIRT_ROCK` | `#4d4d4f` | the mask's MEDIAN — shipped 2026-09-01, now the comparison page's `rock` arm | 62.1 – 77.1 |
| `SKIRT_ROCK_LIT` | `#737274` | the mask's UPPER quartile — the median of its lit half | 91.4 – 114.4 |
| `SKIRT_ROCK_SHADED` | `#1d2025` | the mask's LOWER quartile — the median of its shaded half | 25.7 – 31.7 |

Nothing was eyedroppered and nothing was tuned to a target.
`skirt-rock-separation.test.ts` pins all three to their measured channels.

**⚠ They are NOT lifted to compensate for the ladder floor**, which was considered and dropped on the
instrument's own arithmetic. A shaded ledge always lands on rung 0.80, so authoring `quartile / 0.80`
would make the DELIVERED pixel equal the measurement instead of the token — `rgb(23,26,30)` against
`rgb(29,32,37)`, a largest-channel move of **7** against ADR-0490 D6's bar of **20**. It is an arm no
reader could tell from this one, so it was not built.

## 5. What it delivers

At one island, 8 delivered px per ground unit (the zoom the cliff is read at). Every arm shares the
coast clip, shore fall, relief, nine-rung ladder, grain, occlusion atlas, light and camera.

| arm | vs | triangles | VISIBLE px | anchor | MICRO | STRUCT |
|---|---|---|---|---|---|---|
| `flat` | flat | 2,962 | 0 | 134.36 | 0.900 | 8.685 |
| `stepped` | flat | 5,562 | 21,821 | 134.36 | 0.970 | 7.996 |
| `rock` | flat | 5,562 | 35,434 | 69.14 | 1.021 | 20.381 |
| `soil-over-rock` | flat | 5,562 | 34,486 | 69.14 | 1.012 | 20.163 |
| `two-token-lit` | **rock** | 5,562 | 35,399 | 103.28 | 1.065 | 14.150 |
| **`two-token-deep`** | **rock** | 5,562 | **35,399** | **29.65** | 1.054 | **25.376** |

**⚠ TWO QUESTIONS, TWO DENOMINATORS.** The first four arms answer *should the island's edge be a rock
cliff at all*, and their denominator is `flat`. The last two answer a question that only exists once
the third shipped — *can ONE token span the cliff's tonal range* — so their denominator is `rock`.
Reading them against `flat` would credit the second token with everything the first already
delivered. `ARM_CONTROL` owns that mapping and the driver asks the page for it rather than restating
it, so the report can never name a denominator the measurement did not use.

**The change is fully visible, not a last-bit shuffle.** Against `rock`: 35,399 px touched and
**35,399 visible** — overstatement **1.00×**, median move **43**, max **48**, every moved pixel in the
1–2× and 2–4× bands and none below the bar.

**And it costs no geometry at all.** `rock` and `two-token-deep` are both **5,562 triangles**; the
whole tonal range is bought in the material, as one more ramp row.

## 6. The gap to the approved picture

|  | `rock` (shipped before) | `two-token-deep` | approved render |
|---|---|---|---|
| anchor | 69.1 — **26.5 too light** | 29.7 — **13.0 too dark** | 42.65 |
| STRUCT | 20.38 — **68%** | 25.38 — **84%** | 30.045 |
| MICRO | 1.02 — **40%** | 1.05 — **41%** | 2.543 |

The anchor's absolute error **halves**, and it changes sign: the cliff now reaches slightly deeper
than the render rather than falling well short. Structural contrast closes half the remaining gap.

**MICRO barely moves, and that is expected rather than disappointing.** MICRO is contrast between
neighbouring pixels — grain and speckle — and a second token is a change of *region*, not of
pixel-scale texture. The pixel-scale gap is the grain octave's, already recorded, and is where the
browser's constraints still cost most.

**At the forest overview the pair actually exceeds the render on STRUCT** (30.98 against 30.045 at
2 px/unit), because at that zoom the cliff is a per-island dark edge and the render's own advantage
is its pixel-scale detail.

## 7. ⚠ The owner's test — applied, not deferred

> **LOOK AT THE FINAL RENDER AND ASK: CAN I TELL WHAT STATE THIS ISLAND IS IN?**

**YES, and it is not a close call.**

- At the **forest overview** (`two-token-deep-forest-fit.png` beside `rock-forest-fit.png`) the cliff
  is sub-pixel and the two arms are indistinguishable. Every island reads purely by its top-face
  colour — green, yellow, red-brown — all unmistakable. The change is invisible at the zoom the map
  is mostly read at.
- At the **read zoom** the top face is ~93% of the island's own pixels and is **untouched by one
  bit**. The cliff is now a two-tone band at the edge — a pale course over a dark base — which reads
  as a different *kind* of surface even more plainly than the single flat grey did.
- **The pair BUYS separation rather than spending it**, which is the opposite of what a second
  family-less colour reads like at first glance. The median rock sits INSIDE `unhealthy`'s own luma
  band (62.1–77.1 against 67.1–83.9) and clears its nearest status pixel by an RGB distance of just
  **9.0** — the residual the skirt's own evidence page flagged as *"the one place this is tight"*.
  The pair clears by **20.9** (lit) and **58.2** (shaded). `skirt-rock-separation.test.ts` re-derives
  all three on every run and fails if a later edit narrows the pair back toward the single rock.
- **Mechanically**, no rock ledge of any of the three can deliver a pixel a status family delivers —
  the same test enumerates both closures and fails on any collision. That is the half of his test a
  machine can hold; the rest is the pictures above.

**⚠ THE HONEST RESIDUAL.** The cliff is now **13.0 luma darker** than the picture the owner stamped
rather than 26.5 lighter. That is a smaller error and it is in the direction that supplies depth, but
it is an overshoot and it is stated as one. Closing it further would mean moving a token away from
the measurement it was transcribed from, which is a worse trade than the 13 luma buys.

## 8. Files

| | |
|---|---|
| `src/stepped-skirt.ts` | the two tokens, the ledge's own step/fall, and the three shade rules |
| `src/cell-ground-geometry.ts` | the wall loop picks a rock per ledge quad, through the injected rule |
| `src/ForestWorldCanvas.tsx` | the adoption — two ramp rows appended, `shadeBelowHalfDepth` named |
| `harness/shipped-skirt-scene.ts` | the six arms, their per-arm denominators and their rock pairs |
| `harness/shipped-skirt-measure.mjs` | the driver, its refusals and the report |
| `src/stepped-skirt.test.ts` | the premise, the profile, both rules, and the builder/predicate seam |
| `harness/skirt-rock-separation.test.ts` | all three rocks against every status closure |
| `*-one-8.png` / `*-forest-fit.png` | the frames, one per arm per size |
