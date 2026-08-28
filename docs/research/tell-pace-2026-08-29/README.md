# The prose nobody could read, and the growth that was never wired

**Increment:** `website-refresh-arc-readable-pace` on `website-refresh-arc`.
**Date:** 2026-08-29. **Measured on:** Chrome 1600x900, deviceScaleFactor 1, over the built site.

Reproduce (from `web/`, after `git submodule update --init web`):

```
npm install && npm run build
node scripts/probe/chapter2-walk.mjs                      # both measurements
OUT_DIR=/tmp/beats node scripts/probe/tell-beats.mjs      # one screenshot per beat
npx tsx scripts/probe/tell-pace-falsify.ts                # the ceiling against the pre-fix state
```

---

## THE REPORT

The owner walked <https://crisp-globe-bf6v.here.now/> and said:

> *"yeah it works, the overlay text looks too fast though, couldnt read it. also didnt see any
> growth animation, so i'm assuming this needs more passes. otherwise its a first step toward where
> we want to be."*

Two findings. Neither was a taste question and both were gaps against work this arc had claimed.

---

## 1. THE PROSE — THE DEFECT WAS NOT THE RATE

TELL already derived each line's dwell from its own length. `MS_PER_WORD = 252` is 238 wpm, which
is the published **mean silent reading rate for continuous non-fiction prose**, and `MS_LINE_FLOOR`
gave short lines 1150 ms. Both are defensible numbers. The schedule they produced was not, for
three reasons — and only the first is large.

**1. The CSS fade was charged to the reading budget.** A beat's block phased in over 0.7 s and a
within-beat line over 0.55 s. A reader cannot read text that is not yet opaque, and none of that
time was on top of the dwell — it was inside it. So `MS_LINE_FLOOR`, which existed to stop exactly
this, spent 720 of its 1150 ms fading. Measured off the shipped constants, the first line of every
short beat was **legible for 430–540 ms**:

| line | legible | delivered |
|---|---|---|
| "You just watched the problem." | 540 ms | 53.7 cps · 556 wpm |
| "{proven} of them are green." | 540 ms | 38.9 cps · 556 wpm |
| "That one is this website." | 540 ms | 46.3 cps · 556 wpm |
| "It is yours now." | **430 ms** | 37.2 cps · 558 wpm |

Netflix's Timed Text Style Guide caps adult subtitles at **17 characters per second**. These were
delivered at 37–54. That is the "couldnt read it", and it is not marginal — it is two to three
times a professional ceiling, on the four lines a visitor meets first.

**2. Words are the wrong unit.** `capabilities` and `it` cost one word each. Across lines the old
budget believed were equally paced, the delivered rate ranged **16.5 → 27.1 cps**.

**3. A mean is not a floor, and it was measured on a different task.** 238 wpm is the average for a
reader already in reading posture, working through continuous prose where context accumulates. Half
of readers are slower than it by construction. This copy is unfamiliar propositional claims,
arriving one at a time, deliberately over a map the same visitor has just been invited to look at.

### The basis it is set against now

This is the **subtitle** problem — text over a picture the viewer also has to watch — and that
problem has a published standard measured over decades, quoted in characters per second. Netflix
caps adult programming at 17 cps; the BBC's Subtitle Guidelines take 160–180 wpm as a default and
advise going slower where the picture competes.

`CPS = 13`, deliberately under the professional dialogue ceiling, on three named grounds: this copy
is silent (no audio track carries it in parallel), it is propositional rather than narrative the
viewer is already following, and the visitor has just been handed a map and told to look at it.

Acquisition is now charged explicitly instead of hidden in a floor, the fades are shortened
(0.7 s → 0.34 s, 0.55 s → 0.30 s) so acquisition costs less, and the last line of a beat is
credited the tail and gap it already keeps rather than being charged them twice.

### Measured in the engine, not computed

`chapter2-walk.mjs` polls computed opacity at 50 ms and reports each line's legible window
independently of the module that scheduled it. Every line, after:

| | before | after |
|---|---|---|
| fastest delivered line | **53.7 cps / 556 wpm** | **12.9 cps / 157 wpm** |
| slowest legible window | 430 ms | 1900 ms |
| sequence length | 54 s | 72 s |

`beat-binary-two-lines.png` is the densest beat (164 characters over two lines) at delivered size.

### ⚠ The sequence got 33% longer and the copy did not grow by a word

The old 54 s was never a length — it was 779 characters delivered too fast to read. Roughly 135
words of unfamiliar propositional copy takes about a minute at any honest rate; that is arithmetic.
**The only way to make this materially shorter is to say less**, and cutting was considered: there
is no ~15 s saving available that does not remove something the owner ordered (the founding false
binary is two of the ten beats and 164 of the 779 characters). Tightening the wording everywhere it
could be tightened recovered about 36 characters — under three seconds.

So if the sequence should be shorter, **cut copy**; do not buy it back by raising `CPS`. The
duration ceiling in `act2-tell.test.ts` moved from 65 s to 85 s and says so in its own comment.

---

## 2. THE GROWTH — IT EXISTED AND HAD NO CALLER

`@keyframes act2-grow` (scale 0.55 → 1, staggered by a `--ei` custom property) was already in
`index.astro`, applied by `act2-walkthrough.ts` — whose `mountWalkthrough` has **zero callers**
repo-wide. It drove the retired scripted walk over a fictional three-story corpus and cannot draw
arbitrary data; it hard-codes its own script. So the CSS was live and the DOM it matched was never
created. Meanwhile the live path said out loud that it does not animate.

Two things had to change beyond wiring.

**The stagger law does not survive the real corpus.** The retired walk staggered `0.22 s` per
island over THREE stories — 0.44 s end to end. The same law over 35 islands runs **7.5 s** before
the last one appears, which stops being an arrival and becomes a wait. The islands are dealt into
seven **waves** instead, so a forest of 200 stories arrives in the same 2.7 s as today's 35.

**The order is free and it is true.** `placeStories` emits islands row by row from dependency rank 0
up, so the DOM order already *is* foundation-first. Verified against the built page: the first five
islands have zero declared dependencies, the last eight have between two and eight. Nothing is
shipped to the client to know this and no geometry is read at runtime.

### The honesty fence

The map is a snapshot stamped "as of 28 August 2026" and the page's whole pitch is that its signals
are real. Growth as a **reveal of a stated-moment picture** is honest; growth as a **live feed** is
not — the same reason wisps were excluded from the snapshot. Three properties keep it on the honest
side, and `forest-growth.test.ts` holds all three: it is bounded (≤ 4 s, asserted across corpus
sizes from 3 to 2000), it runs once, and it adds and removes nothing — every island is already in
the DOM and is only displayed differently.

### The no-script guarantee

The previous increment bought the property that a visitor whose script never runs still gets the
whole forest as a static, dated picture. So the parked state is **never** in the base stylesheet:
the module adds `is-growing` at runtime and every growth rule is scoped under it. `forest-growth.test.ts`
reads the stylesheet and reds if a rule escapes that scope, because the failure is invisible — the
page looks perfect in every browser that runs JavaScript.

### Measured

Land layer first readable (opacity > 0.6) at **1007 ms with 0 of 35 islands arrived**; islands land
between 1214 ms and 2418 ms. So the board comes up empty and **all 35 islands arrive in full view**
rather than being masked by chapter 1's cross-fade. `growth-midway-slowmo.png` is the arrival at
12x slow motion, every island mid-scale.

---

## ⚠ THE INSTRUMENT THAT AGREED WITH THE BUG

**The first version of the growth animated `.tw-isle`, and `.tw-isle` is an island's COASTLINE
ALONE.** The engine paints an island across three sibling top-level layers so the whole forest
stacks correctly — `tw-isle` (shore) under `tw-ground` (the disc) under `tw-terr` (trees, plate).
Hiding the first hides a coastline and leaves the visible island exactly where it was.

Nothing threw. Every unit test passed. **And the browser probe agreed, because it counted
`.tw-isle` too** — it reported a clean staggered arrival, 5 → 10 → 15 → … → 35, while a screenshot
taken in the same run showed the entire forest standing still. An instrument that shares its
subject's assumption cannot contradict it, which is this factory's recurring fault class.

What caught it was a **screenshot next to a number**: the probe said every island was at opacity 0
and the picture showed a forest. The repair is not "be more careful": `forest-growth.test.ts` now
derives the layer list from `worldSvg.ts` — the engine function that writes those groups — by
asking which classes it stamps a `data-id` onto. A fourth layer reds the gate instead of
half-animating. It found one on its first run (`tw-flora`, a per-capability group nested inside
`tw-terr`), which is recorded as an explicit exclusion with its reason rather than silently passing.

**A second measured consequence.** `tw-terr` cannot be scaled about a fixed origin: it wraps the
trees *and* the name plate below them, so the disc's centre sits between **28.7% and 50.4%** of its
bounding box depending on island height. Any fixed percentage slides the trees off their own
ground, worst on the tall islands the eye goes to. So the land scales and the flora rises and
fades — bounding-box independent, therefore exact for every island.

---

## FALSIFIABILITY — both new rungs shown to red

Neither ceiling is a number typed next to code that already satisfies it.

**The pace ceiling.** `tell-pace-falsify.ts` applies the new test's own predicate to the constants
that shipped on 2026-08-29 (`MS_PER_WORD = 252`, `MS_LINE_FLOOR = 1150`, a 0.7 s fade inside the
budget). It reds on **15 of 17 lines**, four of them at 37–54 cps.

**The layer-coverage rung.** Reverting `ISLAND_LAYERS` to `['tw-isle']` — the exact bug this
increment shipped in its own first draft — reds with
`worldSvg.ts emits per-island layer(s) the growth never touches: tw-ground, tw-terr`.

**The no-script rung.** Hoisting the growth rule out of `.is-growing` — the obvious "simplify the
selector" edit — reds with `a growth rule is not scoped to .is-growing — a no-script visitor loses
the map`.

## What is NOT answered here

Whether the new pace reads right is **the owner's verdict, not this session's** (ADR-0070 stage 2).
13 cps is defended above, not proved; it is one constant, and moving it is one line. The same is
true of 72 s: it is the honest cost of this copy at a readable rate, and if it is too long the
answer is fewer sentences.
