# The island is dense at its edges for one reason, and it looks clumpy for a completely different one

**Date:** 2026-08-17 · **Camera:** every number here is measured in GROUND units, before any
projection — the research track's 50° and the app's `LAND_CAMERA_ELEVATION_DEG = 20` both scale `y`
by a constant, which cannot create or remove a radial gradient · **Blender renders:** 0 ·
**Vendor calls:** 0 · **Cost:** $0 · **Islands:** the real-corpus `context-traversal-capture` (162
mesh cells, 11 capabilities, all healthy) and the `fork-spike-island` fixture (214 cells, six
statuses)

The owner asked *"can you explain why its so dense at the edges of the island, i want to make sure
the plants we end up with are dispersed properly"*. There are two answers, they have nothing to do
with each other, and separating them is most of the work:

| | what it is | who owns it |
|---|---|---|
| **the EDGE density** | a parcel's plant count reads its capability's TEST COUNT and never its AREA. Small parcels are dense; small parcels sit near the coast. | the count rules (ADR-0226 D2) — **the owner's, not this pass's** |
| **the CLUMPY look** | the sampler drew a plant's `x` and `y` from two CRC32s over addresses differing in one character, and CRC32 is linear, so the two draws returned nearly the same number. **Every plant on the island stood on its cell's bounding-box diagonal.** | a bug — **fixed here** |

![where the plants stand](plants-dispersed.png)

## The two mechanisms the increment proposed are both FALSIFIED

Neither was close, and both were falsified on evidence rather than argument.

**Mechanism A — uniform-over-cells against coast-clipped smaller cells.** The arithmetic is right;
the premise is false. Mean cell area is FLAT across coast-distance quintiles on both islands:

| coast-distance quintile | q1 (rim) | q2 | q3 | q4 | q5 (core) |
|---|---:|---:|---:|---:|---:|
| real-corpus island, mean cell area | 157.2 | 148.9 | 149.8 | 148.7 | 155.4 |
| fixture island, mean cell area | 150.0 | 149.8 | 155.7 | 148.9 | 147.9 |

The mesh is not coast-clipped in area terms, so "one vote per cell" and "one vote per unit area"
are the same rule here. And the decisive test is the counterfactual that IS mechanism A's own fix:
hold every capability's realised count and redistribute it over that capability's cells strictly
proportional to area. **The rim/core ratio moves from 2.276× to 2.208× — A's fix removes 2.6% of
the thing it was proposed to explain.**

**Mechanism B — sliver cells collapsing onto their centroid.** Real machinery, never fires. Over
**120 seeds × 2 islands = 30,351 meadow placements: `centroidFallbacks` = 0, coincident points = 0.**
A draw lands inside its cell 57.0% of the time (measured, both islands), so twelve of them all
missing is rare, and summing each cell's own miss probability gives an expectation of **2.2
fallbacks on the real-corpus island and 1.7 on the fixture — 3.9 in total, against 0 observed.**
Zero is close to what the geometry predicts, so this is a mechanism correctly ruled out, not one
caught misbehaving; it should not be quoted as strong evidence of anything beyond "B is not it".

> An earlier draft of this file computed the expectation from the WORST cell in each quintile and
> reported "~12 expected against 0 observed", which is a worst case wearing an expectation's name
> and claims far more than the measurement holds. Corrected here and in `measure.py`.

## What the edge density actually is — and the signed test that proves it

The gradient is real on the real-corpus island: **9.06 → 5.28 → 6.68 → 5.12 → 3.98** placements per
1000 ground units, rim quintile to core quintile, over 120 seeds — a **2.28× rim/core ratio**. It is
not monotonic (q3 rises above q2), which is what you should expect from a mechanism that is not
about distance at all: the gradient is a by-product of WHICH capabilities happen to own small
parcels, so it tracks the coast only as strongly as parcel size does.

The discriminating prediction is a CONDITIONING test, because the two candidate homes for a
gradient make opposite predictions about it. Mechanism A acts *within* a capability's own cell set,
so its gradient survives conditioning on capability. An area-blind BUDGET acts only *between*
capabilities, so its gradient vanishes. Split each capability's own cells at that capability's own
median coast distance and compare the two halves:

| | real-corpus island | fixture island |
|---|---:|---:|
| rim/core density ratio, unconditioned | **2.28×** | 1.22× |
| the same ratio, **conditioned on capability** | **0.93×** | 0.90× |
| corr(log capability owned-area, its density) | **−0.93** | −0.47 |
| corr(capability owned-area, its mean coast distance) | +0.62 | +0.43 |
| density spread across capabilities | **29.5×** | 4.4× |

**The gradient is entirely between parcels.** `grass = round(2 + tests × 1.9)` has no area term, so
a capability's density is `count / area` with the numerator blind to the denominator: capability 5
owns one 198-unit cell and is budgeted 18 plants (density 91.1), capability 0 owns 39 cells and
5535 units and is budgeted 17 (density 3.07). Small parcels are near the coast, so an area-blind
budget PROJECTS onto a coast gradient without anything in the code ever mentioning the coast.

**This pass does not fix that and must not.** Whether a plant budget should read land as well as
tests is ADR-0226 D2's territory and is entangled with the owner's open question about whether
shrubs inherit grass's semantic role. What this pass does is make the density *nameable*:
`dispersion.capacity()` reports how many plants a parcel holds at a shrub's own footprint, and
**capability 5 is over capacity at 1.26×** — asked for more plants than its ground has room for.
That is a sentence the owner can answer; "it looks dense" is not.

## The third mechanism, which is the one that made it look bad

`scatter._sample_in_cell` (`chapter2-grass-reads-as-signal-2026-08-16/scatter.py:69-73`):

```python
x = min(xs) + det(addr, "x", t) * (max(xs) - min(xs))
y = min(ys) + det(addr, "y", t) * (max(ys) - min(ys))
```

`det` is CRC32 over the joined address. **CRC32 is affine over GF(2): for two equal-length messages,
`crc32(A) ^ crc32(B)` depends only on `A ^ B` and not on the message content.** Here the two
messages differ in one character — `"x"` versus `"y"`, which differ in a single bit — and the
resulting delta is the constant **`0x01c26a37`**, verified identical across every address tested.
Its top seven bits are zero, so the two 32-bit draws are numerically almost equal.

Measured consequence, on both delivered islands:

| | before | after | null |
|---|---:|---:|---:|
| corr(u, v) within the cell's bounding box | **+0.9997** | −0.014 / −0.055 | 0.0000 |
| placements within 2% of the bbox diagonal | **100.0%** | 4.0% / 4.4% | 3.96% |
| `\|u − v\| < 0.01` | 83% of draws | 1.9% | 1.0% |
| Clark–Evans nearest-neighbour index (per capability) | 0.97 / 1.17 | **1.93 / 1.91** | 1.00 |
| closest pair on the island | **0.04 / 0.32** units | 1.46 / 3.61 units | — |
| plants with a neighbour under 4 units | 50.6% / 24.9% | 18.2% / 2.2% | — |

A correlation of +0.9997 against a null of exactly zero is the signed asymmetry this diagnosis
rests on. It needs no threshold argued from taste, no baseline run and no edge correction — two
independent draws are uncorrelated whatever the cells look like. The most legible single fact:
**capability 5 owns one cell, and all eighteen of its plants stood on one straight line.**

### The fix, and the two traps in it

> **UPDATE 2026-08-18 — THE FIX NOW LIVES IN `scatter.py` ITSELF, and this pass's `disperse.py` is a
> named alias of it.** When this pass landed, the fix was deliberately built in a lane copy so the
> before/after comparison had a stable "before"; that left every composite on the arc still carrying
> the collapse. The increment `crc32-dispersion-fix-propagated-and-evidence-rerendered` closed that:
> `scatter_island`'s DEFAULT positioner is now the one described below, both committed `scatter.py`
> copies carry it identically, `disperse.scatter_dispersed` **is** `scatter.scatter_island` (asserted,
> not merely intended), and every affected picture was re-composed in the same commit. The pre-fix
> placement survives bit-for-bit as `scatter.LEGACY_AFFINE`, reachable only from a named allowlist of
> callers, so the refusal harness still feeds the floor the real defect rather than an invented one.
> **Everywhere below that says "`disperse.py` does X", read "`scatter.py` does X".**

`scatter.py` changes three things and no counts:

1. **both coordinates come out of ONE hash, avalanche-finalised** (`_uv`). Murmur3's `fmix32` is
   non-linear, so no fixed input edit maps to a fixed output difference. Sixteen bits per
   coordinate resolves a 25-unit cell to 0.0004 units. Measured: `corr = +0.008`, marginals
   0.4998/0.4956 against 0.5, 16×16 uniformity χ² = 240.7 on 255 dof.
2. **cell choice weighted by AREA** rather than one vote per cell. Worth 2.6% on these meshes;
   corrected because the rule is wrong, not because the number is large.
3. **best-candidate (Mitchell) blue noise**, ten candidates per placement, spacing memory scoped to
   the capability.

> **TRAP 1 — moving the axis token to the front of the address does NOT work.** It is the obvious
> fix and it scores `corr = −0.72` (an anti-diagonal). CRC32's affine property does not care WHERE
> the characters differ, only that the difference is fixed. `verify_refusal.py` P4 runs it and
> requires it to trip the floor.

> **TRAP 2 — a keep-out is a hole a spreader races towards.** The tree well is an 11-unit disc no
> plant may occupy, so it is permanently the emptiest ground in any parcel containing it — and
> "furthest from everything already standing" is precisely a rule for finding empty ground. Scored
> naively the well ATTRACTED candidates, which were then culled: the delivered meadow fell 156 → 150
> while the rules authored 157. A candidate inside the well is now not scored at all, and the
> delivered count is 157 — one MORE than the original, because the original silently dropped a plant
> that happened to land in the well. `verify_refusal.py` P5 reinstates the leak and requires rung 5
> to catch it.

**The fix does not move the edge gradient, which is the point:** 3.03× → 3.17× on the real-corpus
island over 40 seeds. On the fixture it moves 1.03× → 1.33×, and that residual is UNATTRIBUTED —
best-candidate biases placements toward parcel edges and some of those edges are coastal. It is
small in absolute terms on an island whose gradient is 1.03× to begin with, but it is not zero and
it is not explained.

## The dispersion floor — `verify.py`

Twenty-three checks — eight per island across two islands and twenty seeds each, plus structural
rungs about the CODE rather than about a draw. Four are FIXES that failed before this pass; three
are FENCES that already held; the rest were added when the fix moved into `scatter.py`.

```
1. axis independence      |corr(u,v)| pooled <= 0.15        was 0.9997
2. no diagonal band       on-diagonal share <= 0.07          was 1.0000  (chance 0.0396)
3. dispersion index       Clark-Evans per capability >= 1.35 was 0.97 / 1.17
4. no touching plants     closest pair >= 1.0 ground units   was 0.04 / 0.32
5. counts unchanged       delivered == what the rules authored
6. no coincident points   the centroid fallback stays a floor, not a path
7. no rim gradient WITHIN a parcel   conditioned ratio in 0.70..1.40
8. the legacy path is really the defect   LEGACY_AFFINE still lands 1.0000 on the diagonal
9. exactly one implementation            disperse.scatter_dispersed IS scatter.scatter_island,
                                         and the two committed copies are byte-identical
10. no undeclared caller takes the legacy path   nine allowlisted callers, each with a reason
11. the cross-parcel rise is a redistribution    the TOTAL near-pair count must fall
12. the area cache survives island reloads       id() is unique only among LIVE objects
13. nobody calls the removed private sampler     the public entry point is scatter.sample_in_cell
14. the UAT flowers are not on a spiral          delivered polar angle vs radius, was +0.507
```

### THE DIAGONAL WAS A SYMPTOM, NOT THE DEFINITION — and that cost two more findings

The affine-CRC32 property binds ANY pair of equal-length address tokens. This pass found it in the
one place where the mask happened to have seven leading zeros, which makes the two draws numerically
near-equal and puts the point on a diagonal — spectacular, and easy to search for. Two other
instances were carrying the same root cause with different masks and therefore different shapes, and
neither would have been found by looking for a diagonal:

* **`compose_grass.carpet_items`** filled its fixed per-cell quota through the same `_sample_in_cell`,
  so the CARPET variant stood on the diagonal too. It was invisible because it is not the meadow and
  nobody had listed it as a caller; renaming the function surfaced it as an AttributeError.
* **the UAT flowers** drew `"ang"` and `"rad"` — equal-length tokens, mask `0x7d65435d`, top bit at
  position 30 rather than 25. Not near-equality but a strong linear dependency: **raw draws +0.4999,
  and the correlation passes straight through the rejection sampler into delivered positions at
  +0.5073 / +0.5086 over 720 flowers with zero exhaustion fallbacks.** A UAT criterion's distance
  from the island centre was half-determined by its bearing. **The 15-unit spacing sampler cannot
  catch this by construction** — it rejects on distance BETWEEN chosen points and is blind to a
  relationship inside one point. That is why PR #1388's reasoning for scoping the flowers out was
  true in both halves and still did not follow.

Both are fixed, and rungs 13 and 14 hold them.

**Rung 8 exists because the fix moved.** Until it did, the refusal harness's load-bearing
perturbation read the shipped module with no argument, so it could not drift from reality. Now it
names a branch — and a branch that quietly stopped reproducing the defect would turn the probe into
a probe of nothing while it kept printing CAUGHT. Rung 8 measures the branch instead of trusting its
label.

**`verify_refusal.py` proves it is not vacuous:** five perturbations × two islands, all ten caught.
P1 is the pre-fix positioner reproduced bit-for-bit by `scatter.LEGACY_AFFINE` — it trips rungs 1,
2, 3, 4 and 5. P2 and P3 ablate the two halves of the fix separately, proving rung 1 measures the
hash and rung 3 measures the spacing. P4 and P5 are the two traps above.

> **A monkey-patch must land where the CALLEE resolves the name.** `_with_candidate` used to swap
> `disperse._candidate`; now that `disperse` is an alias and `scatter_island` resolves its helpers in
> `scatter`'s globals, that swap would have left every ablation silently measuring the unmodified
> fix while still printing as an ablation. The same defect bit the high-frequency pass's area-aware
> count fork in the same edit, and both are now patched on `S`. It is the alias module's whole
> hazard, and its docstring says so.

Two rungs POOL across seeds rather than taking the worst one, and not to make them easier: the
first draft asserted worst-of-twenty on rungs 1 and 7 and both went red on values indistinguishable
from their own null, because one seed places ~100 plants and the sampling width of a correlation is
then 0.10. Pooling gives one estimate from ~2,900 placements at a null width of 0.019 — a strictly
TIGHTER test at the same tolerance.

**Deliberately NOT floored:** the island-wide near-pair fraction, and the unconditioned rim
gradient. The first cannot reach zero while capability 5 is over capacity; the second is a
consequence of the count rules, and a floor that laundered it would be this pass quietly deciding
the owner's question. Rung 4 skips over-capacity parcels for the same reason and names them.

## Which committed pictures moved when the fix landed (2026-08-18)

Every composite on the arc was re-composed in ONE run against ONE `scatter.py`, so no picture here
was drawn either side of an edit. **Nothing was re-RENDERED**: not one file under any `pieces-*`
directory is in the diff, because the fix moves WHERE a piece is stamped and never what a piece looks
like. Deltas are counted on the DECODED raster, never on bytes — a container hash reports drift that
is not there, which this arc has confirmed live.

| pass | pictures moved | largest delta |
|---|---|---|
| `chapter2-grass-reads-as-signal-2026-08-16` | 5 / 6 | `signal-legibility.png` 99,362 px (3.87%) |
| `chapter2-island-place-dressing-2026-08-16` | 6 / 8 | `dressing-density.png` 35,600 px (1.33%) |
| `chapter2-high-frequency-options-2026-08-17` | 5 / 5 | `high-frequency-detail-6x.png` 24,799 px (2.18%) |
| `chapter2-hex-lines-and-flat-green-2026-08-16` | 3 / 4 | `line-detail-6x.png` 19,404 px (2.47%) |
| `chapter2-grass-defects-2026-08-16` | 2 / 2 | `what-the-grass-delivers.png` 57,960 px (4.39%) |
| `chapter2-grass-delivery-loss-2026-08-17` | 1 / 1 | `where-the-46-percent-went.png` 46,143 px (3.41%) |
| `chapter2-healthy-island-2026-08-16` | 1 / 5 | `island-detail-6x.png` 15,156 px (1.93%) |
| `chapter2-one-surface-and-shadow-2026-08-17` | **0 / 5** | pixel-identical |
| `chapter2-plant-dispersion-2026-08-17` | **0 / 1** | pixel-identical |
| `chapter2-greenery-techniques-2026-08-17` | **0 / 1** | pixel-identical |

**23 of 33 moved. The three passes at zero are the interesting rows, and each is a different reason:**

* **the shadow pass** draws no plants at all, and its sidecars PROVE it rather than asserting it:
  all five pictures are byte-identical while every sidecar changed by exactly one line, the recorded
  `scatter.py` hash. A code state moved, the pixels did not, and the provenance says both.
* **the healthy island's 1-of-5** is the same fact one level down. `healthy-island.png` is the
  DELIVERED surface, which carries no vegetation; only `island-detail-6x.png`'s third panel does —
  the reference panel showing the grass the owner declined on 2026-08-16.
* **`plants-dispersed.png` is unchanged BY CONSTRUCTION and that is the check on the whole landing.**
  Its two panels are the legacy positioner and the fixed one. `LEGACY_AFFINE` reproduces the pre-fix
  placement bit-for-bit and `SPREAD` reproduces this pass's lane copy bit-for-bit, so if either had
  drifted while moving into `scatter.py`, this picture would have moved. It did not.

**High-frequency options moved 5 of 5 even though it already used the fixed positioner** — because
the UAT FLOWERS moved (see the spiral finding above). That pass imported the meadow fix on the day it
was built; the flowers were the half nobody had measured.

**One thing the re-render does NOT repair, stated so nobody reads it as a full repair:** the dressing
pass still composes through `compose_dressed.py:253`'s OLD depth key, so its pictures still carry the
~46% painter-order occlusion PR #1387 fixed at the other three sites. That fourth site belongs to
`delivery-residual-attributed-and-the-fourth-compositor-site-fixed` and was deliberately left alone
here.

## Does the shipped app share this? No — it has a different gap

`app_drift.py` transcribes `scene.ts:1715 driftSpot` and measures it on the same island. Per the
fences this pass edits no app source; findings are written down with a file and a line.

* **The app CANNOT have the coordinate-pair collapse.** It draws from `streamRand`
  (`scene.ts:1656`), a mulberry32 stream whose successive draws are independent by construction,
  not from two CRC32s over near-identical addresses.
* **`driftSpot` applies no containment test of any kind** — `anchor + (cos a, sin a·0.6)·√u·spread`,
  with nothing checking the result is on the parcel, the cell, or the island. **10.9% of placements
  land outside the parcel whose status tinted them** (median 21 ground units from the coast); 0.03%
  land off the island entirely. `scene.ts:1715`.
* **Its concentration is 9.08×** — the whole budget goes into one or two drift beds averaging 247
  ground² inside parcels averaging 2238. That is DELIBERATE and owner-directed (2026-07-18, and the
  docstring says so). But **88.0% of its plants have a neighbour within 4 units and the median
  nearest-neighbour distance is 2.06**, against a shrub 9–14 units across. That decision was taken
  for long grass, where a massed bed reads as a meadow. For shrubs the same bed reads as a blob, and
  it is worth re-asking now that grass is being withdrawn — as an owner question, not a change.

## Files

| file | what it is |
|---|---|
| `dispersion.py` | the instrument: Clark–Evans, near-pair fraction, parcel capacity, coast-binned density, and the two within-cell statistics. No opinion about positioners. |
| `disperse.py` | **a named alias of `scatter.py`, not a second copy** (since 2026-08-18). Every symbol is bound to `scatter`'s own object and `scatter_dispersed is scatter.scatter_island`, so a divergence is unrepresentable rather than merely discouraged. Kept because this pass's committed evidence and prose name the positioner by this name. |
| `measure.py` | runs all four questions, writes `dispersion-report.json` (~4 min). |
| `verify.py` | the dispersion floor (~90 s). |
| `verify_refusal.py` | makes every rung fire (~2 min). |
| `app_drift.py` | the shipped app's positioner, transcribed and measured; writes `app-drift-report.json`. |
| `picture.py` | `plants-dispersed.png`. A placement DIAGRAM — no rendered pieces, no band keys, no palette snap. **Three copies of a ~700-line compositor already exist on this track; this is deliberately not a fourth and must not grow into one.** |

## Gaps, stated

* **Spacing is enforced within a capability, never across parcel boundaries — and this is now a
  DECIDED trade rather than an open one (2026-08-18).** This pass left it as a bare NOTE, reading it
  as an owner fork because the obvious remedy trades away determinism. Measuring the quantity the
  fork actually turns on settles it without one: **the cross-parcel count rises inside a total that
  drops by 63%.** On the real-corpus island near-pair plants fall **78.7 → 25.8**, of which the
  cross-parcel slice rises **2.5 → 15.0** while the same-parcel slice falls **76.2 → 10.8** — so
  every cross-parcel pair gained is bought against **5.2** same-parcel pairs removed. On the fixture
  the same-parcel slice reaches **exactly zero** (26.5 → 3.0 total, all of it cross-parcel).
  An island-wide remedy is therefore bidding for the last ~11 percentage points having already been
  handed 33, at the price of making capability *i*'s positions depend on capabilities *0..i−1* —
  which is the property that makes every before/after picture on this arc comparable at all.
  **So the scoped rule is KEPT, and rung 11 floors the quantity the decision turns on: the TOTAL
  must fall, not merely the same-parcel half.** A later change that flattered the cross-parcel
  number by giving the total back now goes red, which the NOTE could not catch. Still unexplored,
  and still the cheaper option if the trade is ever re-opened: seeding a capability's spacing memory
  with the plants of parcels it BORDERS, computed from the mesh rather than from placement order —
  that keeps determinism and is not a fork.
* ~~**`scatter.py` itself is not edited.**~~ **CLOSED 2026-08-18** by
  `crc32-dispersion-fix-propagated-and-evidence-rerendered`. Both committed copies now carry the fix
  identically, `disperse` is an alias of the one implementation, and every affected composite was
  re-rendered in the same commit. The gap's own warning held exactly: editing the module invalidated
  committed pixels across the whole track, which is why the propagation and the re-render had to be
  one landing rather than two.
* **Nothing here is rendered.** The floor measures ground positions. Whether better dispersion
  survives the compositor — occlusion, the 3 px median delivered size, the palette snap — is
  unmeasured, and the delivery track's 17.2% loss rate on the real corpus applies to these
  placements exactly as it did to the old ones.
* **The fixture island's 1.03× → 1.33× rim shift under the fix is unattributed** (see above).
* **The tree is not drawn in the picture** and no capability's occlusion by it is modelled.
