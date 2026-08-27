# The colour-spread band — ADR-0418 D4's replacement for the fence it lifted

**Increment:** `replace-the-palette-closure-check` on `adopt-the-land-into-the-shipped-map-arc`.
**Date:** 2026-08-27. **Renderer:** `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)),
SwiftShader driver)` — software, read off `UNMASKED_RENDERER_WEBGL` and recorded in
`capture-report.json`, per `grain-picture-is-renderer-specific`.

---

## 0. What this is, and the one sentence that matters

ADR-0418 D3 lifted ADR-0380 D6 fence 3 on `packages/forest-world-r3f/harness/`: a live render
there need no longer stay banded to an authored palette. D4 committed to **replacing** the check
that lift removes rather than deleting it, and named the instrument gap it was opening in the
meantime. This increment closes that gap for parts 1 and 2 of D4 — part 3 landed separately as
`the-hardware-floor-can-fail-on-frame-time` (PR #1667).

The sentence:

> **`capture.mjs` can now audit a continuously-shaded page, and it refuses one whose continuous
> term stopped reaching delivered pixels — a picture every rung that existed before this passes.**

That last clause is the whole finding, and §3's M1 is the measurement of it: with the grain's
colour term dead, `OFF-PALETTE: 0 px`. The collapsed picture is *maximally* on-palette. The
palette check could never have caught this, because a picture that has fallen back onto the
authored ladder is the most on-palette picture there is.

⚠ **IT IS WEAKER THAN WHAT IT REPLACES AND MUST NOT BE WRITTEN UP AS AN EQUIVALENT.** ADR-0418 D4
says so in terms — the band says "roughly in range" where the old check said "exactly right or
not". §4 states exactly what it does not catch.

---

## 1. What was built

- **`harness/colour-spread.ts`** — pure, 14 tests in `colour-spread.test.ts`. The regime
  declaration (`banded` / `continuous`), the per-canvas manifest, and the verdict with five
  faults: `collapsed`, `mask-mismatch`, `vacuous`, `control-missing`, `control-not-banded`, plus
  `undeclared` for a tagged canvas the manifest does not know.
- **`harness/capture.mjs`** — resolves the manifest before the palette tally, exempts canvases
  declared `continuous` from the off-palette refusal, holds them to the band instead, prints the
  per-canvas verdict, records it under `colourSpread` in `capture-report.json`, and refuses
  alongside the existing refusals.
- **`harness/pixel-metrics.ts`** — `binsToCover` exported so there is ONE definition of the
  90%-mass arithmetic. `capture.mjs`'s readback returns a colour histogram per canvas rather than
  the raw RGBA buffer (a 1918×930 canvas is 7 MB to serialise out of the page, and there are
  eight), so bins90 is exact there and MICRO/STRUCT are not — they are spatial. See §5.

**`capture.mjs` can now drive `grain.html`, which it could not before.** The crossing increment
recorded that as the consequence of the lift: *"`capture.mjs` still refuses an off-palette pixel,
so it cannot appear on any page that audit runs over — hence its own page."* It can now.

The good run, this directory's `capture-report.json`:

```
canvases   : 8
OFF-PALETTE: 0 px
spread     : 4 continuous of 8 declared canvases, 2621312 px exempt from the palette closure
   ok grain-colour-2px     bins90    96 vs bar     4 (grain-none-2px)
   ok grain-both-2px       bins90   105 vs bar     4 (grain-none-2px)
   ok grain-colour-8px     bins90    96 vs bar     4 (grain-none-8px)
   ok grain-both-8px       bins90   105 vs bar     4 (grain-none-8px)
PALETTE CLOSED ON THE GPU (over the banded canvases; 2621312 px exempt by declaration)
EVERY CONTINUOUS CANVAS CLEARS ITS CONTROL (4 of 8 declared)
```

And on `island.html`, the page it was already auditing, nothing moved: `PALETTE CLOSED ON THE
GPU` with no exemption, `7 declared banded`, and the band saying out loud that it checked nothing
rather than reading as a pass —

```
spread     : 0 continuous of 7 declared canvases
NO CONTINUOUS CANVASES ON THIS PAGE — the band checked nothing (7 declared banded)
```

---

## 2. ⚠ THE DESIGN DECISION: the bar is measured in the same run, not committed

ADR-0418 D4 states the band with three absolute anchors — *"below the band is our current 9–17,
above it is the ~4,000 of an unmodified photoreal render, and the reference the owner named sits
at 474"*. `chapter2-land-idiom-2026-08-27/README.md` §6 measured all three against seven land
treatments and found every one unusable. The increment carries that finding forward as the thing
to read before starting, and this is what was done about it.

**The three problems §6 found**, restated so a later reader does not re-derive them:

1. The **approved render sits AT the stated ceiling**, not inside it: 3,978 against ~4,000.
2. **Every land treatment worth having is further above it** — `combined` is 18,077 at 487 px,
   4.5× the approved render and 38× the named 474. The reason is structural: 474 was measured on
   a **flat-shaded** game render and the owner has approved a **continuously shaded** ground,
   which cannot approach 474 without being re-quantised — the very thing the fence was lifted to
   permit.
3. **bins90 is resolution-dependent on a path-traced frame and the band names no size**, and not
   even monotonically: the control's bare land goes 327 → 236, *down*, with sixteen times the
   pixels.

**A fourth is not in that list and it decides the shape.** `grain-picture-is-renderer-specific`,
measured 2026-08-27 across SwiftShader and an RTX 2060: the palette fence holds identically on
both (0 off-palette px, twelve panels), but **24.5% of grained pixels land on a different ladder
rung**, because `fract(sin(...))`'s argument reduction differs by vendor. An absolute pixel figure
committed as a threshold is therefore one machine's threshold, and reds on any other.

**So nothing here is an absolute number.** A canvas declared `continuous` must deliver a 90%-mass
colour count **strictly greater than the total colour count its declared banded control delivered
in the same run**. Read as a sentence: *this picture needs more colours to cover nine tenths of
itself than the entire authored ladder beside it has.* That is exactly the claim "it is not
expressible by the ladder", which is the claim the lifted fence gave up the ability to make.

Every one of the four problems dissolves rather than being argued around: there is no absolute
anchor to be wrong (1, 2), the control is at the same delivered size by construction (3), and both
arms are drawn by one renderer in one run (4). It is also the house pattern rather than a new
invention — `frame-budget.ts` states every cost against a control with the feature off,
`capture.mjs`'s interior-holes instrument reads against the flat control on the same page, and
`cover-measure.mjs` refuses arms that are secretly the same scene.

**The margin, so the bar's placement is checkable rather than asserted.** The bar is **4**; the
continuous panels deliver **96–105**. A **24× margin**. A number picked to make the answer come
out would sit just under 96; this one is not chosen at all, it is read off the control.
`hardware-floor.mjs`'s own history is why that distinction earns this much prose — an earlier
version of it scored rungs against `16.7 * 1.35`, "a number picked to make the answer come out",
and that is recorded there as a defect.

**One number in the module IS a placement and is labelled as one:** `SPREAD_OPAQUE_FLOOR = 1000`,
the fewest opaque pixels a 90%-mass count may be computed over. The smallest real continuous panel
is 77,008 px, so it sits 77× below every picture it will ever see — deliberately, following the
lesson `capture.mjs`'s own blank floor records, where a draft set at 20 condemned four legitimate
panels and "the floor was wrong, not the panels".

✅ **A finding §6's problem 3 could not have predicted: bins90 is resolution-INVARIANT on this
renderer.** 3 at both zooms banded; 96 / 105 at both zooms continuous, across sixteen times the
pixels. A quantised ladder gains no entries from more pixels and, here, neither does the noise
field's delivered set. The path-traced dependence §6 measured is a property of 128 samples and a
denoiser, not of a single-sample rasteriser. The bar does not *rely* on this — the control is at
the same delivered size regardless — but it is why the control pairing is a safety rail rather
than the whole mechanism.

---

## 3. The mutation evidence — every refusal, fired against the live page

⚠ **THE AUTOMATIC RUNG DID NOT RUN, AND HERE IS WHY.** `pnpm gate`'s `check:mutation-diff` skips
`harness/**`: the harness sits outside any workspace project's `src/`, so the rung reports
`NOTHING TO MUTATE` rather than exercising these assertions. Every mutation below was applied by
hand to the real source, run against the real page, and reverted — `git status` clean after each.
This section is the mutation record for this module; the gate did not produce it and cannot.

Six mutations. Each ran `capture.mjs` against `grain.html` on a free port with a scratch output
directory. All six exited **1**.

| # | mutation (the real subject, not the test) | fault fired | exit |
|---|---|---|---|
| **M1** | `GRAIN_COLOUR_MIX` 0.13 → **0.0** — the grain's colour term stops reaching pixels | `collapsed` ×4 | 1 |
| **M2** | every canvas tag renamed `grain-*` → `grainX-*` | `undeclared` ×8 **+ palette breach returns** | 1 |
| **M3** | the `colour` variant renders at a different `pxPerUnit` | `mask-mismatch` ×2 | 1 |
| **M4** | `grain-colour-8px` redeclared **`banded`** in the manifest | **`PALETTE BREACHED`** (1,233,595 px) | 1 |
| **M5** | `grain-none-8px` redeclared `continuous` | `control-not-banded` ×2, `collapsed` ×1 | 1 |
| **M6** | the `none` control panel removed from the page | `control-missing` ×4 | 1 |

**M1 is the flagship, and its second number is the point.**

```
OFF-PALETTE: 0 px
   XX grain-colour-8px     bins90     3 vs bar     4 (grain-none-8px)
REFUSED: COLOUR SPREAD — grain-colour-2px [collapsed] bins90 3 does not exceed its control's 4
    delivered colours. This picture is expressible by the authored ladder beside it, so the
    continuous term did not reach delivered pixels.
```

bins90 fell **96 → 3** and **not one other rung noticed**. The palette check reported a clean
closure; the blank floors, the prop floor and the watertightness instrument were all unmoved. Look
at `island-grain-colour-8px.png` beside `island-grain-colour-8px-COLLAPSED.png`: the second is the
flat control wearing the mottled one's name, and it is 10,406 bytes against the control's 10,221 —
the same picture, compressed the same way.

**M4 is the fence, and it is the reason the palette refusal is provably unweakened.** The moment
`grain-colour-8px` is *declared* banded, the palette refusal fires on its 1,233,595 off-palette
pixels. So the exemption is granted **by declaration and by nothing else** — a page cannot acquire
one by drawing off-palette pixels, only by someone writing it down in a hand-authored manifest
that is upstream of the page, for the reason `prop-presence.ts` records at length.

**M2 shows the pair fails CLOSED together.** When the manifest stops resolving, the exemption is
withdrawn with it: `OFF-PALETTE` went from 0 to 2,621,312 px and `PALETTE BREACHED` fired
*alongside* eight `undeclared` refusals. A page cannot lose its declarations and quietly keep its
exemption.

The one fault with no live mutation is **`vacuous`** (a canvas below the 1,000-px floor). It is
unit-tested, and no plausible edit to this page produces it — a canvas that small is a different
regression, which `capture.mjs`'s existing blank floor already refuses.

---

## 4. ⚠ What this does NOT do

Stated here rather than left to be discovered, because ADR-0418 D4 named the weakening and the
temptation on landing a replacement is to write it up as an equivalent.

- **It catches COLLAPSE, not DEGRADATION.** The margin is 24×, so a grain at half strength — or
  at a tenth — sails through. The band answers "is this picture expressible by the authored ladder
  beside it", which is a *qualitative* question. It is not a quality bar and cannot be turned into
  one by tightening the number: a bar placed near the measured value would be exactly the "number
  picked to make the answer come out" the design exists to avoid.
- **It says nothing about whether the art is GOOD.** ADR-0418 D4's band was never going to; the
  owner's look is the instrument for that, and ADR-0392 D1 rations it deliberately.
- **It does not carry MICRO/STRUCT.** The increment's suggested shape asks for the band to be
  paired with them, and they are the better discriminator *among* continuous renders. They are
  spatial, and `capture.mjs`'s readback is a histogram — see §5. `harness/pixel-metrics.ts` already
  computes them and `grain-measure.mjs` / `cover-measure.mjs` already drive it over `getImageData`
  buffers, so the pairing exists on the bespoke scripts; what does not exist is MICRO/STRUCT
  *inside `capture.mjs`'s refusal set*. That is a second readback, and it is left undone
  deliberately rather than overlooked.
- **It does not gate adoption on its own.** ADR-0418 D4 is three parts. This is parts 1 and 2;
  part 3 is `hardware-floor.mjs`'s frame-time rung, landed in PR #1667 — and ⚠ that instrument is
  **draw-call bound** and cannot cost a shader change, which is measured, undischarged, and named
  in `hardware-floor-is-draw-call-bound-not-fragment-bound`.

---

## 5. Traps met here

- ⚠ **A FIXTURE THAT ADVERTISES A NUMBER IT DOES NOT DELIVER.** The test helper's first draft gave
  `bins90` colours the bulk of the mass and one pixel to each of the rest, and asserted the
  90%-mass count would be `bins90`. It is not — the heavy colours then carry ~99.99% of the frame,
  so 90% is reached at about 0.9 × `bins90` of them: **85, not 94**. The suite caught it on its
  first run. The helper now asserts its own construction, including that the frame is large enough
  (`opaque >= bins90² / 0.9`) for the count to be constructible at all.
- ⚠ **`capture.mjs`'s bins90 is 96/105 where `grain-measure.json` says 94/104, and neither is
  wrong.** The two readbacks use different alpha thresholds: `capture.mjs` counts only
  `alpha === 255` ("an edge pixel blended against a transparent clear is a compositing artefact"),
  `pixel-metrics.ts` counts `alpha >= 128` (transcribed from `measure_land.py`'s `alpha >= 0.5`).
  Different masks, slightly different histograms — visible as the opaque counts too (1,233,595
  against 1,234,059). It changes no verdict at a 24× margin, but a figure quoted across the two
  scripts needs to say which one produced it.
- ⚠ **THE CANVAS PNGs IN THIS DIRECTORY HAVE THE PAGE BACKGROUND BAKED IN.** They are Playwright
  *element* screenshots, so the harness page's flat stage is composited in opaque and the alpha
  mask is gone. **Do not measure off them** — every figure here comes from the in-page readback,
  which preserves alpha. Same trap as `harness-island-pngs-bake-in-the-page-background`.
- ⚠ **`vite.config.ts` pins `strictPort: 5184` for every worktree.** This run used **5217** and
  proved the tree by fetching `colour-spread.ts` from the dev server — a module that exists only
  on this branch — before trusting a single number. `capture.mjs` has no port refusal of its own
  (`grain-measure.mjs` and `cover-measure.mjs` do); that is a real gap and it is named here rather
  than fixed, because it is a change to a shared driver's defaults and not this increment's scope.
- ✅ **No committed evidence was rewritten.** `capture.mjs`'s default `ST_OUT_DIR` is
  `docs/research/chapter2-live-render-2026-08-19/`, which `cadence-verdict.test.ts` reads as a
  **fixture** — a default run reds two unrelated tests. Every run in this pass set `ST_OUT_DIR`
  explicitly. `git status` was checked after each. Friction
  `capture-run-rewrites-committed-evidence-of-an-unrelated-pass`.

---

## 6. What is NOT in scope, and stays that way

**Adoption itself** (ADR-0380 D6 / ADR-0406 D2). This increment gates it; it does not perform it,
and nothing here touches `src/`. The shipped canvas is untouched.

**The semantic question** — ADR-0418 D5, how a story's health is carried once colour is no longer
carrying it — is untouched and is still the arc's critical path. It is authored as
`oq-how-does-the-map-report-a-capability-s-state-once-the-gro`.

---

## 7. Reproducing

```bash
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5217 --strictPort false
# prove the tree before trusting a number:
curl -s http://localhost:5217/colour-spread.ts | head -c 60
ST_HARNESS_URL=http://localhost:5217/grain.html \
  ST_OUT_DIR=docs/research/chapter2-colour-spread-2026-08-27 \
  ST_FULL_PAGE_NAME=grain-page.png \
  pnpm --filter @storytree/forest-world-r3f capture
```

⚠ Always pass `ST_OUT_DIR`. The default rewrites a committed test fixture.

## Files

| file | what it is |
|---|---|
| `capture-report.json` | the run, including `colourSpread` per canvas — regime, bins90, control, bar, fault |
| `grain-page.png` | the whole page as audited |
| `island-grain-{none,normal,colour,both}-{2,8}px.png` | the eight canvases, one file each |
| `island-grain-colour-8px-COLLAPSED.png` | **M1** — the same canvas with the colour term dead. `OFF-PALETTE: 0 px`; only the new band refuses it |
| `panel-grain-{2,8}px.png` | the two authored sections |
