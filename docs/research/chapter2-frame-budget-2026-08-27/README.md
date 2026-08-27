# The hardware floor can now refuse — and it still cannot cost a shader. 2026-08-27

Increment `the-hardware-floor-can-fail-on-frame-time` on `adopt-the-land-into-the-shipped-map-arc`.

**Two outcomes, and they are not the same shape.** The rung is BUILT: `hardware-floor.mjs` can now
fail a run on frame time, where before it hard-failed only on renderer identity and reported every
timing as descriptive JSON. The COSTING did not land: the grain's fragment cost came back
**UNRESOLVED**, and the reason is now measured rather than guessed — *this harness is draw-call
bound, so a shader A/B cannot resolve anything in it.* That is a characterisation of the
instrument's reach, and it is the useful half of a negative result.

---

## 1. Why the rung was owed

ADR-0415 D1 retired "it's only twelve pixels" as an argument and left exactly two constraints that
bind how much detail the land may carry: **accessibility** and **performance**. Accessibility has a
real instrument. Performance did not.

`harness/hardware-floor.mjs` swept draw-call and object count and hard-failed only on renderer
identity — no WebGL, a software rasteriser, a throttled tab. Its timings were descriptive JSON. **A
change that halved the frame rate would have been recorded and reported green.** Every detail
decision on this arc was being argued against a constraint that could not refuse anything.

## 2. What the rung is, and what it refuses

`harness/frame-budget.ts`, pure and node-proven (19 tests). Three outcomes, not two:

| | meaning |
|---|---|
| **PASS** | every configuration fits in one 60 Hz frame |
| **FAIL** | a configuration does not — named, with its number |
| **UNVERIFIED** | nothing was concluded, and this is **not** a flavour of PASS |

**The threshold is the frame itself, never a chosen tolerance.** `hardware-floor.mjs` already
carried that lesson in its own comments — an earlier version scored rungs against `16.7 * 1.35`, and
"1.35 was a number picked to make the answer come out". So the budget is 60 Hz (the cadence ADR-0380
D2 names) and every *cost* is stated against a **control**: the same scene with the feature off.

**UNVERIFIED outranks FAIL.** A software rasteriser's frame time is not a hardware verdict — that is
why this is a headed tool. Reporting FAIL from a number already declared meaningless would train a
reader to ignore the rung.

**Deltas are withheld unless they resolve.** Each row's repeats give a spread; a delta smaller than
the wider of the two rows' spreads is reported as `BELOW_NOISE` with **no number at all**. A figure
printed beside a wider noise floor gets quoted, and the reader who quotes it is not being careless —
it was right there.

**A negative delta beyond the noise floor is `IMPOSSIBLE` and voids the run.** Adding fragment work
cannot subtract cost, so that is the instrument failing, not a saving.

## 3. The finding that forced the design — a single sample published an impossibility

The first version took one sample per configuration. On real hardware (Adreno X1-85 via D3D11,
headed, 171 plants, 2880×1920) it reported:

```
  no grain     gpu 1.23 ms/frame
  normal half  gpu 1.15 ms/frame
  colour half  gpu 1.26 ms/frame
  both halves  gpu 0.97 ms/frame     <- 21% FASTER while doing strictly more work
```

and printed `PASS`. Two readings of the **identical** 171-plant configuration in the same run
differed by **43%** (0.86 vs 1.23 ms), so run-to-run variance simply swamped the effect. That is why
rows now carry their repeats, are **interleaved** round-robin (this box thermally throttles, and
grouping repeats would alias the drift onto the variable), and why `IMPOSSIBLE` exists as a verdict.

## 4. The measured reason the cost will not resolve

Three runs, each varying one thing:

| configuration | draw calls | median, no grain | grain resolved? |
|---|---|---|---|
| 171 plants, 2880×1920 | 172 | 0.76 ms | no — spread 0.52 ms |
| 171 plants, **5760×3840** (4× the fragments) | 172 | 0.62 ms | no — spread 0.14 ms |
| **0 plants**, 2880×1920 | **1** | **0.02 ms** | no — but see below |

**Read rows 1 and 2 together: quadrupling the fragment count did not raise the cost at all.** A
grain is fragment work; if the measurement were fragment-bound, 4× the pixels would have moved it.
It did not.

**Then read row 3: removing the 171 plants dropped the cost by 97%** (0.62 → 0.02 ms) while the
ground — the only grained surface, and the one that fills the frame — was untouched.

Together those say the same thing twice: **`gpuMsPerFrame` in this harness is dominated by
draw-call submission, not by shading.** The scene issues one draw call per plant, so at the island's
171 it submits 172 calls per render and 10,320 per `gl.finish()`-closed batch. A shader change is
invisible underneath that.

⚠ **AND ROW 3 GOES FURTHER THAN "TOO SMALL TO SEE".** One full-frame quad at 2880×1920 measuring
0.02 ms implies ~275 G fragment/s on an integrated Adreno, which is not a plausible fill rate. So
the batch timing is very likely not capturing GPU completion at all — `gl.finish()` on ANGLE/D3D11
does not necessarily block until the GPU has retired the work, whatever the code's comment intends.
**This is stated as the leading hypothesis, not as a result**, and it is exactly what the follow-up
below is for.

## 5. What is NOT claimed

- ⚠ **No upper bound on the grain's cost.** "Below the noise floor" bounds what the INSTRUMENT can
  see, not what the grain costs. If §4's hypothesis is right, this harness cannot see fragment work
  at any size, and quoting "< 0.5 ms" from it would be quoting the instrument's blindness as a
  measurement. The grain's cost is **unknown**, and end-state item 2 is **not** discharged.
- **Nothing about the shipped renderer.** All of this is `harness/`.
- **Nothing about accessibility**, which ADR-0380 names as the hardest part of D6.

## 6. The follow-up this points at

Make `gpuMsPerFrame` genuinely GPU-bound before trusting any shader cost from it:
`EXT_disjoint_timer_query_webgl2` measures GPU time on the GPU's own clock and reports a `disjoint`
flag when the result is unreliable — which is the honest instrument for this question, and would
also put the existing committed headroom figures ("28× headroom at the island", "one frame at ~6,044
plants") on firmer ground, since those rest on the same batch timing. A fragment-bound A/B scene
(one draw call, ground filling the frame, plant count held at zero) is the other half.

## 7. Reproducing it

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5201
ST_HARNESS_BASE=http://localhost:5201 pnpm --filter @storytree/forest-world-r3f hardware-floor
```

Launched **headed** on purpose — headless on this box rasterises through ANGLE-on-SwiftShader and a
software frame time is not a hardware verdict; the tool refuses rather than producing a number.
Knobs for pushing the signal above the floor: `ST_GRAIN_REPEATS` (default 5), `ST_GRAIN_WIDTH` /
`ST_GRAIN_HEIGHT` (default the D2 buffer), `ST_GRAIN_PLANTS` (default 171).

⚠ **The tool writes its report into `docs/research/chapter2-live-render-2026-08-19/`, which is a
COMMITTED evidence directory AND a test fixture.** `cadence-verdict.test.ts` reads that report and
asserts properties of that specific 2026-08-19 run — that its 0-plant and 171-plant rungs share a
`rafP95`, which is the correction that module exists to record. A fresh run changes those numbers and
reds two tests. **Revert it after running** (`git checkout -- docs/research/chapter2-live-render-2026-08-19/`).
Filed and reinforced as friction `capture-run-rewrites-committed-evidence-of-an-unrelated-pass`.
