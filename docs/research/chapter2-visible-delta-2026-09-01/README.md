# ADR-0490 D6 as an instrument — the visible-delta metric, and the distribution behind it

**Date:** 2026-09-01 · **Increment:** `land-cost-instrument-arc-inc-02` (arc end-state item 2)
**Instrument:** `packages/forest-world-r3f/harness/visible-delta.ts` (pure, 38 tests)
**Callers:** `shipped-grass-scene.ts` · `shipped-skirt-scene.ts` · both of their `*-measure.mjs` drivers
**Wiring smoke:** `harness/visible-delta-smoke.mjs`

---

## The headline

**The rule is now a tool, and the tool reports a magnitude distribution rather than a count. On the
first real page it was pointed at, the retired metric would have read 6.5x higher — 84.7% of the
movement it counted sits below the bar the decision draws.**

ADR-0490 D6 retired the touched-pixel count in favour of pixels moving more than 20/255, after the
count was found to overstate two increments roughly fourfold — caught by the owner, by eye. That
rule was prose. It is now one module, and every page and driver that judged an arm by it calls that
module instead of its own copy.

---

## What was broken — and it was worse than the increment recorded

The increment was parked against a reading naming **two** duplicate declarations. Reading at HEAD
found **four**, and the two extra are the ones no assertion could ever have reached:

| where | what | reachable by a test? |
|---|---|---|
| `harness/shipped-grass-scene.ts:242` | `export const VISIBLE_DELTA = 20` + its own `differing()` walk | yes |
| `harness/shipped-skirt-scene.ts:494` | `export const VISIBLE_DELTA = 20` + its own `differing()` walk | yes |
| `harness/shipped-grass-measure.mjs:64` | `const VISIBLE_DELTA = 20` — **used only inside report prose** | no |
| `harness/shipped-skirt-measure.mjs:66` | `const VISIBLE_DELTA = 20` — **used only inside report prose** | no |

The two driver copies are the worse pair rather than merely more of the same. They appear only
inside report *sentences*, so a driver whose prose says "20" over a page that had moved to 30 would
print a false claim about a true number — and nothing in this repository asserts on prose.

**All four now resolve to one declaration**, and a source-text test admits exactly one file in
`harness/` to declare it. That test is deliberately source-text: the fault is invisible to any
assertion about *values*, because four copies reading 20 agree perfectly right up until one of them
does not.

---

## Why a distribution, and not a better scalar

This arc has now been bitten from **both** sides by scalars, and the second is the trap a reasonable
person walks into while fixing the first:

| | direction | evidence |
|---|---|---|
| touched-pixel **count** | **overstates** | scores a 1/255 shift identically to a 164/255 one; recomputing the two misjudged increments by magnitude showed no pixel had moved more than 37/255, typical move 8 |
| RGB standard **deviation** | **understates** | **33.8 for both** the shipped and the approved picture, identical to one decimal — a spread metric calls them the same image |

A bare count over a threshold discards exactly the information whose absence made the touched count
misleading, so replacing one scalar with another reproduces the fault at a different offset. The
module therefore reports the whole shape: how many pixels moved, how far each moved, and what share
of the movement sits either side of the cited bar.

⚠ **A distribution here is a distribution of MOVEMENT, never a spread of COLOUR.** Nothing in the
module measures a property of one frame; every figure is a property of the pair.
`harness/pixel-metrics.ts` owns the single-frame statistics, and importing MICRO/STRUCT/colour
counts and calling the result a visibility verdict is the substitution the module's header refuses
in as many words. A test pins it: two frames with **identical histograms, means and standard
deviations** — a checkerboard and its inverse — must still register every pixel as moved 160/255.

### The ladder is derived, not chosen

- The first band is `[1, T]` — moved, but not visible. Not a rounding convenience: it is exactly the
  population whose inclusion made the touched count overstate, so a report that shows it *shows*
  the error rather than describing it.
- Above the bar the ladder **doubles** — `(T, 2T]`, `(2T, 4T]`, … — and terminates at 255 because a
  channel cannot move further than its own range.
- So base and ceiling are both given. The only judgement left is the doubling, which is the one step
  carrying no scale of its own. At `T = 20` that is `20 / 40 / 80 / 160 / 255`, and the top band is
  labelled `over 8x` rather than `8-16x` because a channel cannot reach 16x the bar.

Beside the bands: percentiles over the **moved** pixels (`p50/p90/p99/max`) — the diagnostic that
caught the original error was precisely *"no pixel moved more than 37/255, typical move 8"* — and
the `touched / visible` **overstatement ratio**, made first-class so the next session reads the
fourfold instead of rediscovering it.

**This neighbourhood has already paid for an authored constant** (an earlier `hardware-floor.mjs`
scored rungs against `16.7 * 1.35`, its own comment recording 1.35 as *"a number picked to make the
answer come out"*), so a test asserts no multiplicative fudge exists anywhere in the judging code.

---

## The rungs — and rung 2 is what makes the other worth having

Ordered as `land-floor.ts` orders its four, because the same fault class reaches a pixel comparison.

1. **VOIDNESS** — frames of different sizes, a ragged buffer, an empty capture, or **the same buffer
   object handed in twice**. That last is the memoised-`pixels()` aliasing case: one key collision
   hands the same array back for two arms, every delta is zero *by construction rather than by
   measurement*, and the page reports "these arms look identical" having compared nothing.
2. **SENSITIVITY** — the instrument must prove, on **this run's own pixels**, that it resolves the
   cited boundary. Two limbs, because the rule has two sides:
   - a probe moving every channel by **+21** must be visible on **every** pixel;
   - a probe moving every channel by **exactly +20** must be **touched on every pixel and visible on
     none**.
3. **THE READING** — only now.

Without rung 2, *"these arms look alike"* and *"this comparison never saw two different frames"*
produce the same report — `visible: 0` — and the second reads as reassurance. Both drivers now run
it before quoting any reading.

**The probe amplitude is derived and deliberately the least generous available.** One above the bar
is the hardest case the rule admits; a probe of +100 would be passed by a comparator that had lost
its threshold entirely. And it moves each channel *away from its nearer end* rather than adding,
because `250 + 21` clamps to 255 and moves only 5 — a probe built by adding would fail its own rung
on a bright frame, and the failure would read as a broken instrument rather than a broken probe.

### ⚠ What rung 2 cannot do, stated so it is not read as coverage

Both probes are **derived from the threshold**, so the rung proves the instrument *resolves the bar
it is applying* — never that the bar is the number ADR-0490 D6 states. Move the threshold to 40 and
the rung passes happily at 40. That second claim is held elsewhere: the constant is pinned to the
decision's own 20, and the harness admits one declaration of it. **Neither half is sufficient
alone**, and a test records that the division is deliberate rather than an omission.

Byte-identical frames are reported as a **suspicion**, not a result — the shape a stale control has
(`comparison-baseline-moves-under-the-page`), and the same way `run-agreement.ts` reports it for two
whole sweeps, so the two instruments hold one idea of what a suspiciously perfect zero means.

---

## It discriminates — proved on real frames, not only synthetic ones

`harness/visible-delta-smoke.mjs` boots the two comparison pages in a browser and asks the runner
directly. It is a **wiring check and explicitly not a measurement**, which is why it accepts a
software rasteriser where `shipped-grass-measure.mjs` refuses one: a GPU is needed to make the
numbers mean something about the map, not to prove the call path exists.

**Renderer:** `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)` —
`software=true`. **⚠ No figure below is quotable as a statement about the land.**

### The grass page, `visible` arm against `flat`, one island at 8 px/unit

```
GRASS PAGE — sensitivity rung: PASSED

  control   touched        0 · visible        0 · p50   0 · max   0 · overstatement n/a
  treated   touched   575959 · visible    88370 · p50  14 · max  30 · overstatement 6.52x
      sub-threshold    1..20    487589 px  84.66% of moved
      1-2x            21..40     88370 px  15.34% of moved

  DISCRIMINATES: control vs itself = 0 px touched; treated vs control = 88370 px visible
```

Two frames known **not** to differ read as zero movement (and raise the byte-identical suspicion);
two frames known to differ read as 88,370 visible pixels. The instrument separates them.

**And the shape is the pathology the decision names, now measured rather than eyeballed.** Under the
retired metric this arm scores **575,959** — 6.52x the honest number — because 84.66% of what it
counts moved by 20/255 or less. The largest single-pixel move in the whole frame is **30/255** and
the typical move is **14/255**, which is the same shape as the incident that produced ADR-0490 D6
(*max 37, typical 8*). A reader told "575,959 pixels changed" and a reader shown this distribution
are not being told the same thing.

Both runs of the smoke returned these figures **identically** — expected for a deterministic
software rasteriser, and not the between-run agreement `run-agreement.ts` measures on a GPU clock.

### The skirt page, `rock` arm against `flat` — and this is where the distribution earns its keep

```
SKIRT PAGE — sensitivity rung: PASSED

  flat      touched        0 · visible        0 · p50   0 · max   0 · overstatement n/a
  rock      touched    35420 · visible    35420 · p50  76 · max 127 · overstatement 1.00x
      2-4x            41..80     30661 px  86.56% of moved
      4-8x            81..160     4759 px  13.44% of moved
```

**The same instrument, two real pages, two opposite answers — and the retired metric could not have
told them apart.**

| | touched | visible | overstatement | p50 | max | sub-threshold share |
|---|---|---|---|---|---|---|
| grass `visible` arm | 575,959 | 88,370 | **6.52x** | 14 | 30 | **84.66%** |
| skirt `rock` arm | 35,420 | 35,420 | **1.00x** | 76 | 127 | **0%** |

The grass arm touches **16x more pixels** than the skirt arm and is the *weaker* change of the two:
most of what it moves, it moves by less than the bar, and its single largest move in the whole
frame (30/255) is below the skirt arm's *typical* one (76/255). Under the touched count the grass
arm outscores the skirt arm 16:1; under ADR-0490 D6 the skirt arm's every moved pixel is visible
and the grass arm's five-sixths are not.

That is the decision's claim, reproduced by a tool on live frames instead of by eye — and it is
the reading a bare count over a threshold could not have given either, since `visible` alone says
88,370 against 35,420 and still ranks them the wrong way round for the question *"which of these
is a change to the picture?"*.

⚠ SwiftShader figures on a wiring run. **Not quotable as statements about the land** — the sibling
lanes must re-measure on the RTX 2060 through the pages' own drivers.

---

## Test strength — hand-seeded, because the rung skips this directory

⚠ `check:mutation-diff` mutates only a project's `src/`, so it **SKIPS** `harness/` and says so.
Both prior increments on this arc answered that by seeding mutants by hand; this one does the same
mechanically, so the table is generated rather than asserted.

**16 mutants seeded, 16 killed.** Every one is a fault the instrument could plausibly acquire.

| mutant | verdict |
|---|---|
| the cited boundary: `>` becomes `>=` | KILLED |
| the pinned constant drifts to 21 | KILLED |
| the pixel walk drops the blue channel | KILLED |
| the overstatement ratio is inverted | KILLED |
| the sub-threshold band ends one short, opening a gap at the bar | KILLED |
| the ladder stops doubling and becomes linear | KILLED |
| the probe adds instead of moving away from the nearer end (the clamping trap) | KILLED |
| the aliasing refusal is removed | KILLED |
| the size-mismatch refusal is removed | KILLED |
| sensitivity limb 1 weakened to "saw anything at all" | KILLED |
| sensitivity limb 2 (the at-the-bar limb) dropped | KILLED |
| the probe amplitude drifts two above the bar | KILLED |
| the percentile is off by one | KILLED |
| band shares are taken over the FRAME, not the moved pixels | KILLED |
| the byte-identical suspicion is silenced | KILLED |
| a page re-declares its own copy of the threshold | KILLED |

### ⚠ Two of those survived the first pass, and both were real gaps

Recorded because the *reason* they survived generalises past this file:

1. **"sensitivity limb 1 weakened to `saw anything at all`"** survived because the test drove the
   rung with a **totally** blind stub, which fires under both the strong and the weakened
   predicate. A **partially** blind stub — one reporting half the pixels, the shape a stride bug or
   an early exit has — was needed. *A stub must be as weak as the mutant, not weaker.*
2. **"band shares over the FRAME, not the moved pixels"** survived because every share assertion
   used a frame where **every** pixel moved, so the two denominators coincided. A case with half the
   frame still was needed. *A ratio test whose numerator and denominator populations are equal
   cannot constrain which denominator was used.*

The rung's own failure branch is exercised through a reader seam rather than only its happy path —
a rung whose refusal branch never runs is a rung nobody has evidence works.

---

## What this does deliberately NOT own

**A land mask.** Both pages already carry their own denominator — `familyCensus().land` masks on the
painted background, `cliffPixels()` differences against the control arm — and they are defined
differently *on purpose*, because a cliff and an island are not the same population. A third,
differently-defined land mask inside the metric is precisely how two instruments quietly disagree,
which is the fault `pixel-metrics.ts`'s own header records paying for. So the counts are absolute
counts over the compared frame, and `frame` is reported beside them so each caller takes the share
right for its page.

---

## One thing found in passing, reported not fixed

`shipped-skirt-scene.ts`'s `pixels()` **memoises nothing** — it re-renders and re-reads the
framebuffer on every call. Its mount asks `cliffPixels()` and `visiblePixels()` per figure, which is
two questions about one comparison, so it was paying **four** renders and four `readPixels` round
trips to answer them. The distribution is now memoised per comparison, so the pair costs two. That
is a speed-up over what was there before rather than a new cost, and it is why the skirt page's
mount is slow enough to need a generous timeout under a software rasteriser.

This is a note about the page's own cost, not a land finding. **This arc measures; it does not
re-tune the art.**
