# The land frame floor — what a ground layer costs, on a clock that can see it

**Date:** 2026-09-01 · **Increment:** `land-cost-instrument-arc-inc-01`
**Instrument:** `packages/forest-world-r3f/harness/land-floor.html` + `land-floor-measure.mjs`
**Arithmetic:** `packages/forest-world-r3f/harness/land-floor.ts` (pure, 30 tests)
**Box:** `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)`

---

## The headline

**Layer 1 costs +0.42 ms per frame, and seven such layers come to 3.12 ms — 18.7% of a 60 Hz
frame. The approved ground stack is affordable on the RTX 2060, by this measure.**

That is a *necessary* condition and not a sufficient one, and the instrument says so in its own
verdict line: the budget compared against is the **whole** frame, which still has to draw the
plants, the props, the water and the UI.

**And the same instrument reds.** Pointed at a deliberately expensive material it FAILS both views
and exits 3 — see [the refusal](#the-threshold-goes-red-proved-not-asserted) below. This is not a
threshold that merely exists.

---

## What the increment asked for, and what its own source said

The increment was parked against this reading of `harness/hardware-floor.*`:

> Timings are emitted as descriptive JSON and **no threshold reds a run**. It swaps in no alternate
> material, so fragment cost is never separated from geometry cost.

**Both halves are false as written**, and reading them at HEAD is how the real gap was found:

- `hardware-floor.mjs:299–318` computes a `frameBudgetVerdict` and `fail()`s on FAIL. Its own
  comment says *"Before this existed, `hardware-floor.mjs` hard-failed only on renderer IDENTITY"*.
- `FloorRunSpec.grain` **is** an alternate-material swap, ground-only, documented as existing "so
  its FRAGMENT cost can be isolated", driving a four-arm interleaved grain A/B.

The gap underneath them is sharper than the sentence, and is what this increment actually built
against:

1. **The threshold is vacuous for fragment cost.** It scores `FloorReading.gpuMsPerFrame`, whose
   own type records it as *not GPU time* — 29x to 255x adrift of `EXT_disjoint_timer_query_webgl2`
   over 12/12 configurations, and **blind to an 8.7x change in real GPU work**. A ground shader made
   ten times dearer moves it by ~0 and the rung reports green.
2. **It could not fire on the absolute number either.** FAIL needs a row over 16.67 ms; that scene
   costs under 1 ms. Unreachable from both directions at once.
3. **The material swap cannot reach this layer.** `buildLand` dresses its ground with
   `harness/banded-material.ts`, which has **no grass option at all**. The 23-octave layer lives on
   `src/banded-ground-material.ts`, reachable only through `buildGroundMaterial`.
4. **And its control can go stale.** `buildLand` hand-assembles a ground plane and shrubs rather
   than calling `shippedGroundBuild` — `comparison-baseline-moves-under-the-page` exactly.

---

## The numbers

Two runs, taken minutes apart, **diffed row by row**. Seven interleaved repeats per arm, 30 renders
per timed batch, GPU clock only.

### one island, 8 delivered px per ground unit (ground = 14.1% of the frame)

| arm | octaves/fragment | triangles | draw calls | run 1 ms | run 2 ms | delta vs control | run-to-run |
|---|---|---|---|---|---|---|---|
| `flat` (CONTROL — the map today) | 0 | 5,562 | 1 | 0.1644 | 0.1645 | — | 0.06% |
| `grass` (mix 0.20) | 23 | 5,562 | 1 | 0.5862 | 0.5861 | **+0.4218 / +0.4216** | 0.02% |
| `grass-amplified` (8x) | 184 | 5,562 | 1 | 4.2216 | 4.2196 | +4.0572 / +4.0552 | 0.05% |

### the 35-island forest, 8 px per ground unit (ground = 14.2% of the frame)

| arm | octaves/fragment | triangles | draw calls | run 1 ms | run 2 ms | delta vs control | run-to-run |
|---|---|---|---|---|---|---|---|
| `flat` (CONTROL) | 0 | 194,630 | 1 | 0.2505 | 0.2499 | — | 0.24% |
| `grass` (mix 0.20) | 23 | 194,630 | 1 | 0.6710 | 0.6711 | **+0.4205 / +0.4212** | 0.01% |
| `grass-amplified` (8x) | 184 | 194,630 | 1 | 4.3149 | 4.3128 | +4.0643 / +4.0629 | 0.05% |

> ⚠ **CORRECTED IN PLACE 2026-09-01, by `land-cost-instrument-arc-inc-03`.** The two runs below
> reproduced each other to 0.25%, and that is true — but they were taken minutes apart inside one
> invocation. A THIRD invocation on the same box an hour later measured `flat@one@8` at 0.1460 and
> `grass@one@8` at 0.5178, both ~12% below these. **The four-significant-figure precision here does
> not survive across invocations, and the absolute ms figures should be read as ±~12%.** The cause
> is the device's clock state rather than the shader: the control moved by the same fraction as the
> treatment, so the RATIO held (grass/flat 3.57 then 3.55; the layer's delta 2.57x then 2.55x the
> control). `forest@8`'s delta was stable across all three invocations (0.4205 · 0.4212 · 0.4212)
> and is the figure to quote. **The headline is unaffected** — the stack comes to 16.5–19.2% of a
> frame depending on the invocation, and the conclusion that cost rules nothing out holds at either
> end. Detail: `harness/run-agreement.ts`'s header, and `../chapter2-land-agreement-2026-09-01/`.

**Every row reproduced within 0.25%. Nothing was dropped.** The arc's rule is that rows disagreeing
beyond tolerance are dropped and said to be dropped; on the last land increment the forest rows came
back 170–530% apart. None of that arose here.

⚠ Close is not *identical*, and that matters: on this arc byte-identical numbers are a warning sign
(a stale control arm produces exactly that symptom). These agree to four significant figures while
differing in the last, which is what a real clock over a deterministic scene looks like.

### The stack

| view | control | layer delta | 7 layers | share of a 16.67 ms frame | verdict |
|---|---|---|---|---|---|
| one@8 | 0.1644 | +0.4218 | 3.117 ms | 18.7% | PASS |
| forest@8 | 0.2505 | +0.4205 | 3.194 ms | 19.2% | PASS |

---

## The isolation, confirmed rather than asserted

**The two map sizes differ by 35x in geometry — 5,562 triangles against 194,630 — and the layer's
cost is the same to three decimal places: +0.4218 ms against +0.4205 ms.**

That is the whole claim of this instrument arriving as a measurement. A fragment-stage layer should
cost what the *pixels* cost and be indifferent to the triangles behind them, and it is. The controls
themselves differ (0.1644 vs 0.2505 — the forest's extra geometry is real and costs 0.086 ms), so
the geometry term is present in the run and simply does not enter the delta.

The rung backing this refuses a run outright when arms differ in triangles, draw calls, or the
fraction of the frame their ground covers.

---

## The threshold goes red — proved, not asserted

A rung that cannot fail is a vacuous green. So the instrument was pointed at a **deliberately
expensive material**: the same layer evaluated eight times over, geometry untouched
(`ST_LAND_FLOOR_LAYER_ARM=grass-amplified`). Same box, same page, same instrument, nothing mocked.

```
rung: BUDGET   status: FAIL
FAIL — 7 layers at this layer's measured cost come to 28.563 ms/frame, which is 171.4% of a
16.67 ms frame. The stack does not fit the frame even before anything that is not the ground
is drawn.
```

Both views FAIL; the driver exits **3**. Full output in [`red/report.txt`](red/report.txt).

---

## How a run can refuse, and in what order

Four rungs, each outranking the next, because a verdict from a lower one would rest on a
measurement a higher one has already called meaningless.

| # | rung | refuses when | outcome |
|---|---|---|---|
| 1 | **voidness** | software rasteriser · hidden tab · no GPU clock · under 3 accepted samples · ground under 5% of the frame | UNVERIFIED |
| 2 | **isolation** | arms differ in triangles, draw calls, or ground coverage | UNVERIFIED |
| 3 | **sensitivity** | the 8x arm did not move beyond the noise floor | UNVERIFIED |
| 4 | **budget** | an arm exceeds a frame, or 7 layers of it do | PASS / FAIL |

**Rung 3 is the one the replaced instrument never had, and it is what makes the other three worth
having.** Without it, *"this layer is cheap"*, *"the material swap never reached the shader"* and
*"this route cannot see shaders"* produce the same report — a null — and a null reads as
reassurance. `hardware-floor.mjs`'s grain A/B published exactly that null, and `frame-cost.ts`
records that it was "indistinguishable from the `grain` option never reaching the material at all".

Every rung fired for real during this increment, which is the only reason they can be believed:

- **voidness** refused the first dev-box run — `--use-angle=gl` lands on SwiftShader on Windows.
- **voidness (coverage)** refused `forest@2`, and correctly (below).
- **voidness (sample count)** was *added* because a one-repeat probe produced confident resolved
  deltas at every view: `spread()` is 0 below two samples, so the noise floor was ZERO and the
  instrument grew more confident as the measurement got worse. `MIN_ACCEPTED_SAMPLES` is now
  imported from `frame-cost.ts` rather than restated, so the two instruments cannot drift apart.
- **budget** reds on the amplified arm, above.

---

## The tests were proved by hand, because the rung declined to

`check:mutation-diff` SKIPPED this branch and said why, naming the gap rather than passing over it:

> `packages/forest-world-r3f/harness/land-floor.ts` was NOT mutated — this rung only mutates a
> project's `src/`, but `@storytree/forest-world-r3f`'s own test script runs that directory, so its
> tests do execute there. **Nothing on this branch proves those lines.**

That is true of every instrument in this `harness/`, and it is exactly the shape a strong-looking
suite hides in. So six mutants were seeded into the rungs by hand and the suite re-run against each:

| mutant | outcome |
|---|---|
| stack multiplier dropped (`base + layers * delta` → `base + delta`) | KILLED |
| sensitivity rung inverted (`delta <= floor` → `>`) | KILLED |
| coverage floor direction flipped (`<` → `>`) | KILLED |
| isolation triangle check disabled | KILLED |
| sample-count rung weakened to 1 | KILLED |
| absolute budget rung disabled | KILLED |

**No survivors.** The file was restored byte-identical afterwards.

---

## Two findings that were not the question

**1. The overview zoom cannot be costed, and that is a finding rather than a gap.** Ground coverage
was measured across both map sizes on the Adreno dev box:

| view | ground coverage | | view | ground coverage |
|---|---|---|---|---|
| `one@4` | 3.5% | | `forest@2` | **4.4%** |
| `one@8` | 14.1% | | `forest@4` | 5.7% |
| `one@16` | 41.6% | | `forest@8` | 14.2% |
| | | | `forest@16` | 42.1% |

At `forest@2` — `CROWD_ZOOMS`'s overview — the ground is 4.4% of the frame, below the coverage
floor, so the timing would be mostly of clearing the buffer. The run VOIDS there rather than
reporting a small number. **At the overview the ground is too small a share of the frame for any
instrument to resolve one layer's shader against it**, and a number quoted from that view would be
noise wearing a finding's clothes. The default views are therefore the arc's *other* established
zoom at both map sizes.

**2. The cost scales with coverage, as a fragment cost must.** On the Adreno box, the layer's delta
tracked the ground's share of the frame almost linearly — +0.67 ms at 5.7% coverage, +1.10 at 14.1%,
+5.40 at 41.6%. So the 18.7% figure above is **the cost at the zoom the ground's own texture is read
at**, not a worst case. A view filling the frame with land would pay roughly three times it.

---

## What is NOT measured here

**The other six layers.** The stack figure multiplies *this* layer by seven. The other six are not
built, and layer 1 is the heaviest described so far (23 octaves against the grain's two), so the
extrapolation most likely **overstates** the stack. That is the direction a budget rung should err
in, and the failure message says so in its own text rather than leaving it to this page.

**Whether layer 1 should cross at all.** It is with the owner as
`oq-the-approved-ground-s-grass-layer-cannot-be-seen-without`, and this arc measures rather than
re-tunes the art. What this changes is only which options are live: **cost is not what rules any of
them out.** At 18.7% of a frame for the whole stack, the fork is about *reporting fidelity*, not
about affordability.

**A second machine.** Every committed figure here is the RTX 2060's. Development figures from the
Adreno X1-85 appear only where they are labelled as such (the coverage sweep, the scaling note), and
no frame figure is quoted across boxes.

**The reproducibility rule as a TOOL.** Two runs were taken and diffed *by hand*, which is the arc's
end-state item 3 and explicitly not this increment. Until it lands, a single-run invocation of this
driver is not labelled as such by the driver itself.
