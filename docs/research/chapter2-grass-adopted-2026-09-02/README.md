# Layer 1 adopted — the grass base on the green islands (2026-09-02)

The approved ground's BASE layer, **switched on** and gated to the `healthy` token under
ADR-0492 D1. Increment `layer-1-adopted-on-green-under-the-per-token-gate` on
`land-ground-stack-arc`.

The layer itself was transcribed, measured and left **switched off** on PR #1783 (evidence:
`../chapter2-shipped-grass-2026-09-01/`). Nothing here re-transcribes it. What this run adds is
the per-token arm the instrument lacked, the shader gate, the delivered strength, the canvas
wiring, and the pictures.

> ⚠ **Every figure below was taken on THIS run.** Nothing is inherited from an increment row, an
> arc intent or an earlier evidence sheet — this arc has already been sized 5× wrong by a
> component priced against a repository a previous component had moved.

---

## 1. The premise that changed, re-measured rather than quoted

ADR-0492's per-token table was computed **ad hoc while the decision was being written**. Every
function in `harness/grass-status-reading.ts` iterated all six ground tokens and took the
**minimum**, so asking the committed instrument about `healthy` returned `0.0095` — the
whole-map answer, wearing a clean run. The table was therefore backed by nothing committed.

`grassCeilingByStatus()` is the arm that makes the question askable. Re-derived here on a stated
**0.0005 grid**:

| ground token | ceiling | ADR-0492 quoted |
| --- | --- | --- |
| `healthy` | **0.4065** | 0.406 |
| `unknown` | 0.3515 | 0.350 |
| `unhealthy` | 0.3150 | 0.314 |
| `mapped` | 0.2530 | 0.252 |
| `building` / `proposed` (one token) | **0.0095** | 0.008 |
| all six together | 0.0095 | 0.008 |

**The ad-hoc table was right.** Every figure agrees within one grid step, and it is now produced
by committed code rather than by a session's scratch work.

⚠ **The one correction: `0.008` was a grid artefact, not a different answer.**
`admissibleGrassMixCeiling` walks a fixed step and returns the last rung that held, so a coarser
step reports a *smaller* ceiling — 0.002 → `0.008`, 0.001 → `0.009`, 0.0005 → `0.0095`. A ceiling
quoted without its step is how two honest runs come to disagree. Every figure here states one.

**Controls reproduced before any of it was trusted** (the increment's instruction): 6 broken
patches at fac 0.13, and an ungrassed worst margin of **0.93 at `building@0.77`** — both exact.

---

## 2. The delivered strength: 0.32

An **agent art call inside a measured fence** (ADR-0492 D2 as corrected; ADR-0392: agents make the
art calls until the island is whole, and the owner attests the whole island once rather than each
layer's constant). The fence is `0.4065` and there is no override.

Measured over every colour the layer can deliver, on every shipped rung, for `healthy`:

| fac | max channel shift | share of set moving >20/255 | worst reading margin | as % of ungrassed |
| --- | --- | --- | --- | --- |
| 0.13 *(the recipe's own)* | **11** | 0.0% | 9.54 | 77% |
| 0.20 | 18 | 0.0% | 8.38 | 68% |
| 0.25 | 22 | 0.5% | 7.63 | 62% |
| 0.30 | 26 | 5.5% | 6.77 | 55% |
| **0.32 — SHIPPED** | **28** | **8.0%** | **6.44** | **52%** |
| 0.34 | 30 | 10.9% | 4.64 | 38% |
| 0.38 | 33 | 17.0% | 2.46 | 20% |
| 0.4065 *(the fence)* | 36 | 20.2% | 0.68 | **6%** |

`healthy`'s **ungrassed** worst reading margin is **12.35**. Three reasons for 0.32, in order of
weight:

1. **The margin is a budget four more layers draw on.** Layers 2, 3, 4 and 6 composite through
   this same seam onto these same tokens. At 0.32 layer 1 spends about half the green's reading
   headroom and banks the other half; at the fence it would leave the rest of the stack **6%** of
   the budget. This arc is a serial chain of five layers, so spending the whole margin on the
   first one is a structural error, not a matter of taste.
2. **There is a knee here.** 0.32 → 0.34 costs **28% of the remaining margin** (6.44 → 4.64) to
   buy 2.9 points of visible share. Past it the layer pays reading headroom faster than it buys
   colour.
3. **The ceiling moves.** It is a function of `SHIPPED_GROUND_COLOUR` and the shadow ladder, so
   any token edit or added rung re-opens it. 0.32 sits at 79% of the fence; a constant parked
   *on* the fence would be retuned by any of them.

⚠ **Not 0.13.** At the recipe's own factor the *maximum possible* channel shift on green is
**11/255**, so by ADR-0490 D6's own >20/255 rule no pixel anywhere can move. Adopting it would
have been a clean landing that changed nothing visible — and the frames below confirm it:
**0 pixels moved** on the `authored` arm.

---

## 3. The arms

Four arms differing in **exactly one thing** — the mix factor. Every arm, control included, is
built by `shippedGroundBuild()`, the function `CellGround` itself calls, so no arm can drift into
being a different scene. Every grassed arm wears the **shipped gate**.

| arm | fac | what it is |
| --- | --- | --- |
| `flat` | — | the map before layer 1 (**CONTROL**) |
| `authored` | 0.13 | the recipe's own factor — carried to show it is invisible |
| `adopted` | 0.32 | **what ships** |
| `ceiling` | 0.4065 | the fence — what the headroom above the shipped arm buys |

### One island @ 8 px/unit

| arm | families | largest | top 3 | moved >20/255 | triangles |
| --- | --- | --- | --- | --- | --- |
| `flat` | 11 | 27.7% | 62.4% | 0 | 5562 |
| `authored` | 17 | 29.6% | 57.7% | **0** | 5562 |
| `adopted` | **20** | **21.0%** | **42.4%** | **42,760** | 5562 |
| `ceiling` | 22 | 16.3% | 38.5% | 120,890 | 5562 |
| *approved render* | *36* | *5.2%* | — | — | — |

The triangle count is **identical across every arm**. Layer 1 is a fragment-stage layer and its
correct geometry delta is zero; the driver refuses a run where it is not.

**The gap closes about halfway**: 11 families → 20, against the approved render's 36. The
concentration ADR-0490 identified is materially broken up — the top three shades fall from 62.4%
to 42.4%.

⚠ **The `ceiling` arm is why 0.32 is not timidity.** It moves 2.8× as many pixels for two more
families (20 → 22). Past the shipped arm the layer buys very little colour and spends most of the
remaining reading margin.

---

## 4. The per-token gate, proved in pixels

The claim the arithmetic alone cannot settle. `one` is mono-`healthy`; `forest` wears the real
21-green / 14-yellow mix.

```
@2 px/unit: all-green island 93.9% of land dressed · real-mix forest 38.6%
@8 px/unit: NOT ASKED
```

⚠ **The 8 px/unit row is deliberately not asked, and that is a framing fact rather than a gap.**
Every scene is re-centred on the island nearest the forest's middle, and that island is green; at
8 px/unit the buffer holds ~320×200 ground units. Measured, the "forest" frame there holds
**582,580** land px against the single island's **575,962** — it is the *same green island*, so
both are dressed over 93.9% of their land whether the gate works or not. Asserting a difference
there would assert something the framing forbids. The qualifying zooms are **derived from the
land each frame actually shows**, and the driver refuses outright if no zoom qualifies, so the
check cannot silently vanish.

*(This is the one check that failed on its first run — at 8 px/unit, for exactly this reason. The
gate was working; the check was over-broad.)*

---

## 5. Frame cost

⚠ **Measured on the Qualcomm Adreno X1-85 Windows box, NOT the RTX 2060.** The arc's end-state
says "the RTX 2060 box"; `harness/land-floor-measure.mjs`, landed by `land-cost-instrument-arc`
on 2026-09-01, is written for *this* box and names the Adreno path in its own refusal text. The
figures below are internally consistent and reproduced; they are **not** comparable to any
committed RTX 2060 number.

Two runs, 6 configurations × 7 interleaved repeats, 30 renders per timed batch:

| scene | control | with layer 1 | delta |
| --- | --- | --- | --- |
| one island @ 8 | 1.0487 ms | 2.1051 ms | **+1.056 ms** |
| forest @ 8 | 2.8974 ms | 4.0299 ms | **+1.133 ms** |

**Every row reproduced across both runs, within the noise the runs themselves measured. Nothing
was dropped.** The budget rung **PASSES**: seven layers at this layer's measured cost come to
8.443 ms (one island) and 10.825 ms (forest), i.e. 50.7% and 64.9% of a 16.67 ms frame.

⚠ That is a **necessary and not a sufficient** condition — the frame still has to draw the
plants, props, water and UI. The `grass-amplified` sensitivity arm (8× the fragment work) costs
+7.66 ms, so the instrument can genuinely see fragment cost rather than reporting blindness.

⚠ **The gate does not reduce this cost, which reads as though it should.** The shader multiplies
the mix by zero on ungated rows; it does not branch around the octaves and cannot, because GLSL
evaluates `st_grassColour` before the multiply. A yellow island costs what a green one costs. The
gate buys **reading margin**, not frame time.

---

## 6. ADR-0489's outcome test — applied, not asserted

> *Look at the final render and ask: can I tell what state this island is in?*

**Yes, at both zooms.** On one island the drift reads as slow cool/warm variation *within* green;
the island is unmistakably the healthy token. At forest fit zoom every status remains plainly
separable — green, yellow, red-brown `mapped`, dark `unhealthy`, grey `unknown` — with the grass
reading as mottling inside the green rather than as a walk toward any other family.

No island's reported state changes on this landing. The 14 yellow islands render **exactly** as
they did before, which is ADR-0492 D4: leaving them flat is truth-preserving, not a debt.

⚠ **What is NOT settled here**, per ADR-0492's own consequences: whether green-textured beside
yellow-flat reads as *intentional* or as *unfinished* is an owner LOOK, not an agent call. It is
staged in `adopted-forest-fit.png` rather than decided. This layer does not halt the chain for it
(ADR-0392: the owner attests the island once it is whole).

---

## 7. A fence added for the layers above this one

`grassSeaSeparation()` — the darkest ground pixel this layer can deliver, against the sea.

The scene background is `#101418` (luma 19.4). Layer 1 darkens the darkest green from luma 129.7
to **116.5**, clearing the background by **97.1**. It could not plausibly fail.

It is fenced anyway, because **the family and contrast metrics cannot ask this question and
reward getting it wrong**: `imageStats` anchors on the 2nd percentile of luma over the island's
*own* pixels with the background excluded by colour, so it scores an island in isolation and
never asks whether those pixels separate from the water. **The darker a surface is painted, the
better that anchor scores, right up to invisibility.** Not hypothetical — the cliff's second rock
token (PR #1792) delivered luma 25.7–31.7 against a 19.4 background, merged two thirds of the
cliff into the sea, and was reported as *halving* the error against the approved render.

Layers 2 (shore sand), 3 (the worn path) and 4 (rock on slope) composite through this same seam
and are the darkening ones. A fence that only appears once the layer needing it arrives is a
fence nobody wrote.

⚠ Related, and worth carrying before anything else is transcribed off the approved render:
`land-combined-1948px.png` is RGBA and **53.8% transparent**. Its dark values sit against whatever
composites it, never against our sea — a colour lifted from its mask is only valid against its own
background.

---

## Reproducing

⚠ **Not on port 5316** (this driver's old default) **or 5184** (every worktree's vite default) —
both were in use by sibling worktrees when this run was taken, and a harness on a shared port
serves *its* tree while reporting the numbers as yours.

```bash
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5417 --strictPort
```

```bash
ST_GRASS_URL=http://localhost:5417/shipped-grass.html pnpm --filter @storytree/forest-world-r3f measure-shipped-grass
```

```bash
ST_LAND_FLOOR_ANGLE=default ST_LAND_FLOOR_URL=http://localhost:5417/land-floor.html pnpm --filter @storytree/forest-world-r3f measure-land-floor
```

`ST_LAND_FLOOR_ANGLE=default` is required on this box: without it the context comes up on
SwiftShader and the instrument refuses, since a software run is not a slower verdict but no
verdict.

## Files

- `report.txt` — the family/visibility census, verbatim
- `land-floor-report.txt` — the frame-cost run with its reproducibility table
- `measurements.json`, `land-floor-measurements.json` — every row behind both
- 16 frames: `{flat,authored,adopted,ceiling}-{one,forest}-{8,fit}.png`
