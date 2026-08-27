# A wheat field and a yellow grass, at the grain crossing's quality bar — 2026-08-27

Increment `wheat-and-yellow-grass-to-the-same-quality` on `adopt-the-land-into-the-shipped-map-arc`.

**The direction**, verbatim, on being shown the grain crossing (PR #1665 / #1667):

> "land increments to model the comparisons to me, i'm sure its not that hard to do wheat field or
> yellow grass to the same quality as we have done here, might have to get some more art packs but
> thats small money."

**The pictures are the deliverable.** `cover-combined-8px.png` and `cover-combined-2px.png` are
three whole islands at delivered size, ungrained above and grained below. Everything below is the
numbers under them.

**The short answers.**

1. **It is not hard, and the wheat field was already there.** `#d6b271` is an authored token
   transcribed from the shipped app's own CSS, carried by every status, already threaded through
   this renderer. Driving it across a whole island took a prop, not a mechanism.
2. **The grain crossing was a property of the TREATMENT, not of the green it was measured on.**
   The lift is **+182.7% / +183.4% / +182.7%** on green / wheat / yellow grass at the zoom —
   within 0.7 percentage points across three very different colours — and the luma percentiles are
   unchanged to a tenth for all three, exactly as they were for green alone.
3. **What the token changes is the LEVEL, not the lift.** Wheat delivers **8% more** absolute
   contrast than green, before and after the grain alike, because it is a brighter token and the
   shade ladder is multiplicative.
4. ⚠ **A yellow ground is not a free colour choice, and the finding is a trade curve rather than a
   verdict.** `proposed` and `building` are themselves yellows. Nothing that reads as a *bright*
   yellow grass gets further from a proof state than the shipped wheat override already is. The
   authored `#b0b040` buys 1.8x that distance by being a mustard rather than a straw. §4 prices it.

---

## 1. What was built

- **`harness/ground-cover.ts`** — pure, node-provable (13 tests). The cover vocabulary (`wheat`,
  `yellowGrass`), and the **separation instrument**: matched-condition colour distance in the
  quantiser's own luma-weighted space, the per-status profile, the ladder's rung gaps, the worst
  status-vs-status pair, and a bar a candidate cover can fail.
- **A `cover` option on `IslandView`.** Absent, a panel draws the pixels it always drew.
- **`harness/cover.html` / `cover.tsx`** — twelve panels: three covers x {no grain, grain} x
  {2 px, 8 px per ground unit}.
- **`harness/cover-measure.mjs`** (`pnpm --filter @storytree/forest-world-r3f measure-cover`) —
  reads delivered pixels through `getImageData`, and carries **four refusals** (§6).
- **`combine.py`** — composites the measured PNGs into the two comparison sheets. It does not
  screenshot the page; see its header.

⚠ **The cover tokens are deliberately NOT added to `landTokens()`.** `capture.mjs` refuses any
delivered pixel outside `landPalette()`, so widening that set would relax the fence on
`island.html` and `directions.html` — two pages that draw no cover at all. The cover page carries
its own page-local widening (`coverPalette()`), and a test asserts that widening is **exactly the
yellow grass's four ladder rungs and nothing else**.

## 2. The control column is byte-identical to the committed grain crossing

Before any figure below means anything, the page has to be drawing the same island the previous
pass drew. It is — not approximately:

| panel | md5 | the grain crossing's |
|---|---|---|
| `cover-status-flat-2px.png` | `4f3dc40d…` | `grain-none-2px.png` `4f3dc40d…` |
| `cover-status-grain-2px.png` | `f92706f6…` | `grain-normal-2px.png` `f92706f6…` |
| `cover-status-flat-8px.png` | `33a0f4e0…` | `grain-none-8px.png` `33a0f4e0…` |
| `cover-status-grain-8px.png` | `d1ed4d5c…` | `grain-normal-8px.png` `d1ed4d5c…` |

All four match. The opaque masks match too — **77,008 px** at 2 px/unit and **1,234,059 px** at
8 px/unit, the same two figures PR #1665 recorded, and identical across all six panels at each zoom
(the run refuses if they are not). So every difference in the wheat and yellow columns is
attributable to the cover token and to nothing else.

## 3. Does the treatment survive a change of colour?

Bare land, same fixture, same relief, same light, same camera, grain's **normal half** only.

| zoom | cover | MICRO flat | MICRO grained | lift | STRUCT flat → grained | spread | distinct | bins90 |
|---|---|---|---|---|---|---|---|---|
| 8 px | status green | 0.374 | 1.058 | **+182.7%** | 8.65 → 9.06 | 36.7 | 4 | 3 |
| 8 px | wheat | 0.403 | **1.142** | **+183.4%** | 9.33 → 9.77 | 39.7 | 4 | 3 |
| 8 px | yellow grass | 0.373 | 1.056 | **+182.7%** | 8.60 → 9.02 | 37.2 | 4 | 3 |
| 2 px | status green | 1.408 | 3.873 | +175.2% | 6.56 → 6.24 | 36.7 | 4 | 3 |
| 2 px | wheat | 1.516 | 4.181 | +175.7% | 7.09 → 6.74 | 39.7 | 4 | 3 |
| 2 px | yellow grass | 1.404 | 3.862 | +175.0% | 6.52 → 6.21 | 37.2 | 4 | 3 |

**The lift is token-independent.** Three colours, 0.7 percentage points between the extremes at
either zoom. The grain octave perturbs the *normal* before the lighting is quantised, so what it
manipulates is which rung a fragment lands on — an operation that knows nothing about which colours
the rungs hold. The measurement now says that rather than the argument alone.

**The level is not.** Wheat sits 7.8% above green ungrained and 7.9% above it grained; its
luminance spread is 8.2% wider. The ladder is multiplicative (`token x level`), so a brighter token
has wider gaps between its rungs in absolute terms and every contrast figure scales with it.
⚠ **The relationship is close at that size and does not resolve at the small one**: yellow grass
carries 1.4% more spread than green and delivers 0.2% *less* MICRO. Do not read the two as
proportional — read wheat's 8% as "a brighter token buys a little contrast for free".

**The palette cost is still zero, for every cover.** `distinct` stays at 4 and `bins90` at 3 in all
twelve panels, and the luma percentiles are unchanged by the grain to a tenth (green
131.4 / 151.6 / 168.1 before and after; wheat 141.3 / 162.8 / 181.0; yellow grass
130.7 / 150.8 / 167.9). The treatment is pure spatial redistribution of colours the token already
had — the PR #1665 finding, now shown to hold on tokens it was never measured on.

⚠ **STRUCT moves in OPPOSITE directions at the two zooms, on every cover, and the mechanism is NOT
established here.** It falls ~5% at the overview (6.56 → 6.24 on green, and the same ~5% on both
other covers) and rises ~5% at the zoom (8.65 → 9.06). The observation is solid — three independent
covers, same sign, same magnitude — and it is recorded rather than explained. The plausible reading
is that the grain breaks solid rung regions into mixtures, which a 9x9 blur averages toward the
middle when the feature is near the window's size (~6.7 ground units is 13 px at 2 px/unit against a
9 px window) and resolves when it is far above it (54 px at 8 px/unit); **that is a hypothesis, not
a measurement.** Anyone sizing a treatment against STRUCT at the overview should establish it first.
What can be said without it: the grain's benefit at the overview is a MICRO benefit, and it costs a
little STRUCT to buy.

## 4. ⚠ Can a cover be read as a proof state?

The land's colour is a capability's status (ADR-0392 D5 / ADR-0398 D7). A scenery colour that
lands on a status family makes the map report a state no capability holds. This is the one way this
increment could do real harm, so the token was authored against the measurement rather than by eye.

**The metric is the arc's own** — the luma-weighted space `compose.py`'s quantiser snaps in
(`W_LUMA` = 0.30 / 0.59 / 0.11), read through
`chapter2-palette-foreign-status-2026-08-18/palette_read.py`'s `dist`. It is transcribed into
TypeScript and **anchored by a test against that pass's published 4.32** for `#9ac570` vs
`#9fc174`. A CIELAB dE here would produce numbers that look comparable to the arc's existing ones
and are not.

**At matched condition** — same face, same ladder rung, the only comparison a viewer makes on one
island. Distances are minimised over the whole ladder, not taken at full light, which would
over-report every figure below by ~28%.

| token | | nearest status | distance | per status |
|---|---|---|---|---|
| `#d6b271` wheat (shipped) | the bar | `proposed` | **7.68** | prop 7.7 · buil 9.3 · heal 28.2 · mapp 14.5 · unhe 70.6 · unkn 23.5 |
| `#6f6852` wheat, unhealthy | the bar | `unhealthy` | **7.68** | prop 59.5 · buil 51.0 · heal 40.4 · mapp 29.0 · unhe 7.7 · unkn 58.1 |
| `#b0b040` yellow grass | **+5.94** | `proposed` | **13.62** | prop 13.6 · buil 18.9 · heal 18.0 · mapp 17.7 · unhe 58.7 · unkn 18.5 |

**For scale, two numbers that are not opinions.** The closest two *different* statuses are
`healthy` and `unknown` at **3.33** (`#9ac570` vs `#9fc174` at level 0.78) — the map already draws
a **meaningful** difference 4.1x quieter than this scenery colour's distance from any status. And
the ladder's own rung gaps on `#b0b040` are **3.79 / 16.20 / 17.10**: "further apart than one shade
rung" is true or false depending entirely on which rung is meant, which is why all three are
printed and no average is.

**The bar is relative and says so.** It is the shipped wheat override's own separation, so clearing
it means *does no more harm than what already ships* — never *is safe*. Whether 7.68 was ever an
acceptable distance for a scenery colour is the owner's open question
(`oq-how-does-the-map-report-a-capability-s-state-once-the-gro`), and nothing here settles it.

### 4.1 The trade curve — this is the finding

Yellow-dominant grass colours (red ≥ green, so the hue is at or under 60°), swept against the
instrument:

| token | separation | reads as |
|---|---|---|
| `#a8a837` | **18.54** | mustard, dark enough to read as shadow |
| **`#b0b040`** | **13.62** | **the authored token — a dry mustard meadow** |
| `#b5b04f` | 10.16 | dry grass |
| `#b8b449` | 9.16 | pale dry grass |
| `#c6c06a` | 7.68 | light straw — **exactly on the bar** |
| `#bdb856` | 7.62 | light straw — **below it** |
| `#cdc36d` | 4.75 | pale straw — 1.4x the worst *meaningful* status pair |
| `#d9d18a` | 4.92 | bleached straw |

**There is no yellow grass that is both bright and well separated, because `proposed` already owns
bright yellow.** Every colour pale enough to read as sunlit straw falls back onto the shipped
wheat's own distance or under it. Buying separation means going darker, and going far enough to
double it costs the "sunlit" reading entirely. That is the shape of the choice, and pricing it is
the owner's.

### 4.2 ⚠ The optimiser walks out of yellow, and the number does not notice

The first token authored here scored **11.96** and rendered **olive-green** (`#b0b855`). The luma
weights put 59% of every distance on the green channel, so "get further from the status families"
is cheapest to satisfy by leaving yellow for green — and cheaper still by leaving grass altogether:
unconstrained, the best colour in the whole yellow-to-yellow-green region swept (hue 40-80 degrees,
saturation 0.30-0.78, value 0.50-0.94) is `#c1f035` at **30.59**, a chartreuse highlighter.

**A separation figure cannot tell you the colour still answers the request.** The hue is therefore
pinned first — `r === g` is 60° exactly — and the search runs inside that constraint. A test
asserts the pin, because the failure mode here is a colour that scores well and is the wrong
colour, which no measurement in this file can catch.

## 5. What this says about the open question, and what it does not

⚠ **`wheat` is a worked precedent for the ground carrying a colour that means nothing, and it
already ships.** `palette-band.ts` declares it in `SHARED_TOKENS` — "authored tokens shared by
EVERY status, so they discriminate none" — and deliberately excludes it from `statusFamilyOf`,
because "a token every family carries can answer 'which family is this' for none of them." **A
wheat cell reports no capability state at all, and the project accepted that before this increment
existed.**

That cuts both ways and this pass does not choose:

- it may be exactly right — a field is scenery, and scenery should assert nothing; or
- it may be a hole — a capability whose parcel is drawn as wheat reports no state to a reader,
  which is the ADR-0392 D5 failure wearing a different coat.

**Not settled here.** It is the owner's question, it is already in front of him, and this island
represents nothing (ADR-0406 D1), so the fence does not bite on it. What this pass adds to the
question is a second worked example and a price list: §4.1 says what separation costs in
appearance, which the question could not be answered against before.

## 6. What the instrument refuses

A measurement that cannot fail is a picture with numbers on it. `cover-measure.mjs` exits non-zero
on all of these, in this order:

1. **A panel not wearing the cover it advertises** — each panel must deliver >50% of its own
   cover's colours and **zero** pixels of any other cover's. ⚠ This is the one that matters most:
   an A/B whose arms are secretly the same scene reports "no measurable difference" with the calm
   authority of a real measurement, and a three-column cover comparison has exactly that failure
   mode one dropped prop away. Measured share: **100.0%** on every covered panel.
2. **An off-palette pixel**, against `landPalette()` ∪ `coverPalette()`. All twelve panels came
   back CLOSED with 0 off-palette pixels — which is the claim that lets a NEW authored token into
   the vocabulary at no cost to the fence.
3. **Masks that differ within a zoom** — same island, different materials; if the opaque counts
   move, the panels are not a comparison and no lift is attributable to anything.
4. **The wrong tree, the wrong port, a blank canvas, or a console error.** The run proves the
   served page is this branch's by its `<title>`, and refuses port 5184 outright, which every
   worktree shares.

Plus, in `ground-cover.test.ts`: the metric anchored against the 2026-08-18 pass's published
figure; the bar pinned as a literal so a moved token reds rather than re-baselines; three naive
straw yellows asserted to **fail** the bar; and the palette widening asserted to be exactly the
yellow grass in both directions.

## 7. Traps met here

- ⚠ **A bar rounded UP reports its own source as failing.** Wheat measures 7.675285…; a bar
  transcribed as 7.68 prints an `XX` beside the one row that cannot be wrong, and invites the next
  reader to "fix" a colour the app already ships. `SEPARATION_FLOOR` is truncated, not rounded —
  and the reference is marked `ref` rather than scored at all, since scoring the bar against itself
  is a category error that prints as a verdict.
- ⚠ **The darkest rung is not always the worst one.** Scaling is linear, so 0.78 should always win
  — but `deliveredForLevel` rounds to integer channels and the two bottom rungs are 2.5% apart, so
  half a unit of rounding flips it. `#d6b271` is minimal at 0.78, `#b0b040` at 0.80. An assertion
  naming one rung was written, and was a coincidence wearing a claim's clothes.
- ⚠ **`data-st-panel` must be a literal string.** `capture-panels.test.ts` scrapes it out of the
  page SOURCE, so a computed value matches nothing and the section is dropped from an evidence
  capture in silence. The four sections here are written out rather than mapped.
- ⚠ **`vite.config.ts` pins `strictPort: 5184` for every worktree.** This run used 5211 and proved
  the tree by fetching a module that exists only on this branch.

## 8. What is NOT in scope, and stays that way

- **Adoption into the shipped map.** ADR-0380 D6 / ADR-0406 D2 keep experiment and adoption
  separate events. This is the harness island, which represents nothing.
- **The semantic question.** §5.
- **A worn path.** Fenced behind its own unanswered owner question.
- **Art packs.** "small money" is a budget posture, not an authority to buy. Nothing here needs a
  purchase: the finding on record is that the Stylized Pine Forest kit ships **no ground material**
  at all (42 objects that stand ON land), and the 2026-08-27 pass measured an image texture failing
  on the ground for a structural reason — a 2048 map at 2.5 ground units repeats ~40x across the
  island and reads as a quilted grid at both zooms. **The land is the part a bought pack cannot
  answer**, which is why the treatment is procedural. A pack would help the props standing in the
  wheat; expect it to do nothing for the wheat.

## 9. Reproducing

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5199
ST_COVER_URL=http://localhost:5199/cover.html pnpm --filter @storytree/forest-world-r3f measure-cover
python docs/research/chapter2-ground-cover-2026-08-27/combine.py
```

⚠ Do **not** run `capture.mjs` or `hardware-floor.mjs` as a check while doing this: both rewrite
committed evidence in `docs/research/chapter2-live-render-2026-08-19/`, which
`cadence-verdict.test.ts` reads as a fixture, and a fresh run reds two tests that have nothing to
do with this work. Filed as friction `capture-run-rewrites-committed-evidence-of-an-unrelated-pass`.
