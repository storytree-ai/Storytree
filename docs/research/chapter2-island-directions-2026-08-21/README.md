# Six directions for the island, made to look good first — 2026-08-21

Increment: `chapter2-island-that-looks-good-first-arc-inc-01`.
Governed by **ADR-0392** as amended by **ADR-0398**: the owner's look/feel verdict is taken ONCE,
on a WHOLE island at DELIVERED size; every intermediate appearance call is this session's and
**must be recorded with its reason** — that is section 4.

This arc inverts its predecessor's order. `chapter2-code-generated-organic-art-arc` proved one
component at a time and reached 58 landed increments without anyone being able to say whether the
island was any good. This starts at the other end: make islands that look good, then work backwards
to what is actually needed. **Nothing on this page is a fragment, a contact sheet, a swatch or a
technique row.** Every picture is a complete island at 2 px per ground unit — the size it is
actually delivered — on the real `context-traversal-capture` research surface: 13 hexes, 11
capabilities, its real test spread, its own ten UAT criteria.

**Read the seven island files, not this document** — six directions and the control. `island-today.png`, `island-a-afternoon.png`,
`island-b-slab.png`, `island-c-garden.png`, `island-d-landmass.png`, `island-e-composed.png`,
`island-f-after.png`. The tree pairs are `island-tree-*`.

---

## 1. What this found, in one page

**THE HEADLINE, AND IT WAS NOT THE QUESTION WE SET OUT ON.** The island's problem is not that it
lacks shadow, contact darkening or a coloured rim. It is that **it spends its whole picture inside a
narrow slice of a palette that is nearly twice as wide as the slice it uses.** The `healthy` family
holds four authored ground-capable tokens; the island's GROUND renders exactly one of them, `top[0]`.
(The fourth, `side`, is on the island already — it is what the vegetation wears — just never on the
ground.) Across the ladder those four span delivered luminance **88.8 → 174.7, a 1.97× range**. The single most expensive lever this
arc has built — the cast shadow, measured admissible at one rung and shipped behind a flag — moves a
ground pixel **6.6%**. Simply letting the ground reach for another token of its own family moves it
**29.2%**. That is **4.4× more contrast, for zero palette cost and almost no code.**

**AND THE REASON WE CANNOT JUST TAKE IT is already a question waiting on the owner.** The land's
colour is what says whether a capability is proven (ADR-0226). Under the live renderer's own reader —
one reference colour per status — that fourth token on lit ground reads as `mapped`. Under a reader
holding all three of the family's ground colours it reads as `healthy`. Both readers are defensible
and they disagree, which is precisely
`oq-the-land-s-status-colours-differ-mainly-in-brightness-and`. **So the biggest available
improvement to the art is gated on an unanswered semantic question, and that is the single most
useful thing this pass learned.** Direction F exists to price it against a picture rather than to
decide it (ADR-0392 D5 — an art call may never settle what the art asserts).

**Three more results, all measured on delivered pixels:**

1. **The island's edge was never in the picture.** At the 50° camera the shipped 2.2-unit wall
   skirt delivers **2.8 pixels** of island thickness — under 1% of the island's on-screen height. No
   colour choice can rescue an edge that thin, which is why "give the rim its own material" did
   almost nothing on its own. At 9 units it delivers 11.6 px and the island reads as a solid.
2. **Contact darkening was never built, and it makes the cast shadow nearly redundant.** Measured
   on ONE island, identical in every respect but the mechanism, 85,145 delivered pixels each:
   contact darkening alone occludes **16.4%** (13,967 px); the full cast shadow alone occludes
   **7.6%** (6,465 px); both together **18.6%** (15,797 px). So contact darkening is **2.2×** the
   cast shadow on its own — and, far more consequentially, **72% of the cast shadow's pixels are
   already darkened by contact darkening**, leaving it a marginal contribution of **1,830 px, 2.1%
   of the island**. The cast shadow is the most expensive lever this arc ever built; on an island
   that has contact darkening it is close to free of effect. The reference board ranked contact
   darkening first among the unattempted levers and it was right.
3. **The hero tree is over half of all the occlusion on the island.** Composed with the tree:
   **17.8%** of delivered pixels occluded. The identical island without it: **8.4%**. The tree
   accounts for **53%** of every occluded pixel — which corroborates the inherited finding that it
   shadows more ground than all 144 plants combined, and extends it to contact darkening.

**What this pass did NOT find: an island that looks good.** Six directions, and the honest verdict
from the session that made them is that E and F are clearly the best and none of them is finished.
The gap to the owner's references is no longer a mystery, and it is not made of levers we forgot —
it is made of **colour range** (F's question), **the coast silhouette** (still a hex cluster; the
parked `blender-island-shell-render`), and the two things the reference board already ruled are the
owner's rather than an agent's: plant colour variety and non-vegetation props.

---

## 2. The six directions, and the control

| | direction | what carries the picture | what it is |
| --- | --- | --- | --- |
| | **TODAY** | — | the control: flat pale ground, flush 2.2-unit rim, no occlusion, the tree |
| A | **AFTERNOON** | the LIGHT | contact darkening + the full cast shadow, everything else held |
| B | **THE SLAB** | the EDGE | the rim wears the family's `side` token, and the flank is 9 units deep |
| C | **THE GARDEN** | the GROUND | regional ground variation, `foliage` silhouette, **no tree** |
| D | **ONE LANDMASS** | the SILHOUETTE | no parcel bevel — one continuous land, deep flank, no tree |
| E | **COMPOSED** | all of them | contact + shadow + deep material flank + regional ground, tree kept |
| F | **DEEPER GROUND** ⚠ | the ground's own colour | E, plus the fourth ground token — **gated on the open question** |

They differ in **where the interest lives**, not in a setting. Four settings of one idea is a ladder,
not a choice, and this arc's predecessor produced several of those.

### The numbers each one delivers

Measured off the raster by `capture.mjs`, not off the TypeScript that fed it. 21 canvases,
1,788,560 opaque pixels, 39 distinct delivered colours against 195 authored entries, **0
off-palette**.

| island | opaque px | colours | occluded | luma p2 | p50 | p98 | spread |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `today` | 85,145 | 27 | 0% | 65.5 | 145.1 | 160.9 | 95.4 |
| `a-afternoon` | 85,145 | 28 | 18.6% | 65.5 | 135.5 | 160.9 | 95.4 |
| `b-slab` | 89,005 | 28 | 15.7% | 65.5 | 135.5 | 160.9 | 95.4 |
| `c-garden` | 78,191 | 33 | 8.5% | 88.8 | 135.5 | 174.7 | 85.9 |
| `d-landmass` | 82,087 | 32 | 8.2% | 88.8 | 135.5 | 174.7 | 85.9 |
| `e-composed` | 89,005 | 38 | 17.8% | 65.5 | 132.7 | 174.7 | **109.2** |
| `f-after` ⚠ | 89,005 | 39 | 17.8% | 65.5 | **117.9** | 174.7 | **109.2** |

The two occlusion controls, not directions — the same island as `a-afternoon`, one mechanism each:

| control | opaque px | occluded | occluded px |
| --- | --- | --- | --- |
| `a-contact-only` (no cast shadow) | 85,145 | **16.4%** | 13,967 |
| `a-cast-only` (no contact darkening) | 85,145 | **7.6%** | 6,465 |
| `a-afternoon` (both) | 85,145 | 18.6% | 15,797 |

**How to read it.** `spread` is the delivered p2–p98 luminance range — how much of the palette the
picture actually occupies. `occluded` is the share of delivered pixels on the occlusion rung.

- **A adds one colour to TODAY and moves the spread by nothing.** 27 → 28 colours, spread 95.4 →
  95.4. Every pixel the light direction changes moves 6.6%, so the range it works in is narrower
  than the range it works on. That is not an argument against shadow; it is the reason shadow alone
  cannot be the direction.
- **B is A's twin on every colour statistic and looks different anyway**, because its 3,860 extra
  pixels are all in one place: the flank. Geometry moved the picture where colour could not.
- **C and D lose the tree, and their p2 rises from 65.5 to 88.8** — the tree crown was the darkest
  thing on the island by a wide margin, so removing it costs 23 points of range at the bottom.
- **E is the widest picture any permitted direction reaches**: spread 109.2, 38 colours.
- **F is E plus one token.** Identical spread, identical occlusion, one more colour — and the
  MEDIAN falls 132.7 → 117.9. It redistributes the picture rather than extending it, which is
  exactly what a mid-tone token does and exactly what these islands were short of.

⚠ **A caution about this table.** `spread` and `p50` are summary statistics and they are blind to
WHERE a colour lands. B proves it: identical statistics to A, visibly different island. Read the
pictures; these numbers exist to stop a claim being made that the pictures do not support.

---

## 3. The tree, on trial

**The test is the picture, not the number** — whether an aesthetic element earns its place is what a
look decides. `island-tree-today-with.png` / `island-tree-today-without.png`, and
`island-tree-composed-with.png` / `island-tree-composed-without.png`: the same island twice,
identical in every other respect, at delivered size.

**What follows from removing it — consequences, not arguments against it:**

- **The island loses its only focal point.** Without it the picture is an even field of ground and
  speckle, and the SILHOUETTE becomes the whole composition — which is a problem, because the
  silhouette is a cluster of hexagons and reads as a board. Direction D is the attempt to answer
  that by making the land one continuous mass; it helps and it does not solve it.
- **It takes 53% of the island's occlusion with it.** Composed with the tree, 17.8% of delivered
  pixels are occluded; without it, 8.4%. This is the inherited "the tree shadows more ground than
  all 144 plants combined" (16.58% against 14.63%) arriving again through contact darkening. So
  removing the tree roughly halves the value of every occlusion lever on the island at once.
- **It takes the palette's dark end with it.** Delivered p2 rises 65.5 → 88.8 on both pairs. The
  crown was the darkest thing on the island, and nothing else reaches where it reached.
- **The island gets simpler and calmer.** Whether that is better is the owner's call. It is worth
  saying plainly that "it adds nothing" is a first-class outcome here and closes the question.

**This session's own reading, offered and non-binding:** the owner's hypothesis is half right. The
land's colour IS the bigger signal — direction F is the evidence, and it beats everything the tree
does. But the tree is not merely aesthetic in the picture: it is the island's only dark mass and its
only vertical, and the versions without it look emptier rather than cleaner. If it goes, something
has to take those two jobs, and nothing on this page does.

---

## 4. THE APPEARANCE CALLS, AND WHY — the ADR-0392 D2 record

Every appearance decision this pass made, with the reason. An unrecorded art call is a violation of
D2, not an exercise of it.

**(a) CONTACT DARKENING WAS BUILT, AND ITS FALLOFF IS DERIVED RATHER THAN DIALLED.**
`contact-shade.ts`. The pool around a prop is the fraction of sky a vertical cylinder of that prop's
radius and height hides from a ground point — an azimuth term (`asin(r/d)/π`) times a
cosine-weighted elevation term (`sin²(atan(h/s))`). A tuned radial blob is indistinguishable from
this in a still picture and impossible to argue with later; the derived form prices itself against
each prop's own size, which is the property the references have and a constant blob does not. A test
asserts the consequence: the hero tree's pool is more than 3× a shrub's.

**(b) THE CONTACT POOL SHARES THE CAST SHADOW'S SINGLE RUNG, AND THAT IS FORCED.** A softer, shallower
contact shade would need a second occlusion rung; every rung costs 26 palette entries AND has to
clear the confusability ceiling. There is exactly one admissible rung (0.84, derived by the previous
increment) and it is spent. So a contact pool and a cast shadow are the same colour, which is not
what a real scene does. Recorded as a known compromise rather than a choice.

**(c) CONTACT AND SHADOW MERGE INTO ONE FIELD BY MAX, NOT SUM.** The material thresholds one texture,
so a sum and a max deliver identical pixels wherever either already passes the threshold and differ
only in how confidently they overshoot. Max stays correct if a second rung is ever authored; a sum of
two approximations does not.

**(d) `CONTACT_SPREAD` IS 1 — THE DERIVATION IS NOT OVERRIDDEN.** The constant exists so that a later
widening is visible as a widening rather than hidden inside the falloff. This pass did not use it.

**(e) THE ISLAND'S FLANK IS 9 GROUND UNITS DEEP, AND THE NUMBER IS DERIVED FROM DELIVERY.** At the 50°
camera an upright height foreshortens by `cos(50°) = 0.643`, so at 2 px/unit island thickness on
screen is `depth × 1.286` px. The shipped 2.2 delivers **2.8 px** — under 1% of the island's
on-screen height, which is why colouring the rim alone changed almost nothing. The floor that makes
an edge part of a silhouette is that it be at least as tall as the things standing on the land: the
median plant is 6.2 units, delivering 8.0 px. Nine units delivers 11.6 px — about 1.5× the
vegetation, in the picture without turning the island into a floating column. **It costs the palette
nothing**: it is geometry, and every pixel it adds wears a token the rim already wore.

**(f) THE RIM WEARS THE FAMILY'S `side` TOKEN — AND ONLY THE RIM.** `side` is the token the shipped map
already puts on a territory's side faces; it is in the closed palette and in the same status family.
A capability BOUNDARY in a different colour would be a drawn SEAM, which is the treatment the owner
removed on 2026-08-16 — so the bevel is untouched and keeps wearing the ground's own token, differing
only by rung. The outer rim is not a boundary between two parcels; it is where the land stops.

**(g) GROUND VARIATION IS REGIONAL, AND THE DISTINCTION FROM THE REJECTED PER-CELL HASH IS MEASURED
RATHER THAN ASSERTED.** The variant comes from a low-frequency field over ground space — wavelengths
96 and 61 units against a 16.5-unit cell pitch, running along incommensurate directions so the
pattern does not repeat over the island's 234-unit span. **The measurement that matters: the variant
changes across 35.8% of the island's 302 shared cell boundaries (108 of them). The per-cell hash form
the owner removed changes across 2/3 of them by construction.** So regional roughly HALVES the seam
rate. It is a real distinction and it is not an absolute one — a third of boundaries still show a
step, and if a later change pushed this back toward 2/3 the lever should be reported as failing
rather than renamed. Band edges leave the base token the plurality at 40.9%, against 29.3% and 29.9%
— this is drift ACROSS a colour, not a recolouring.

**(h) THE DEEP FOURTH BAND EXISTS TO PRICE A QUESTION, NOT TO BE SHIPPED.** See section 1 and the
warning in `ground-variation.ts`. Three-band islands are structurally incapable of reaching it — a
test asserts that a `bands: 3` call can never return the deep index, over a 25,921-point sweep — so
no permitted direction can deliver it by accident.

**(i) THE DEEP BAND'S EDGE WAS MOVED ONCE, BY LOOKING.** It began at −0.62, putting the deep token on
12.8% of cells; at delivered size that scattered into patches too small to read as anything, so the
direction failed to show the thing it exists to show. At −0.45 it covers **19.5%** — still a clear
minority behind the base token's plurality, and now legible as hollows. This is the one number on
this page chosen by eye rather than derived, and it is chosen to make an effect VISIBLE, not to make
it flattering.

**(j) DIRECTION D DROPS THE PARCEL BEVEL, AND THE TRADE-OFF IS NAMED RATHER THAN BURIED.** The bevel is
the single thing making the island read as tiles. Without it the ground is one continuous surface.
**The parcel read goes with it** — you can no longer see where one capability ends and the next
begins. Nothing false is asserted (a boundary that is not drawn claims nothing, so ADR-0367 D5 is
not engaged), but a signal is lost, and whether the island needs that signal is one of the things
this arc is here to decide by looking.

**(k) DIRECTION C USES THE `foliage` PLANT SILHOUETTE, EVERY OTHER DIRECTION USES `mound`.** With no
focal point the vegetation carries more of the picture and the two silhouettes distribute their mass
differently. Holding `mound` everywhere else keeps A, B, E and F differing only in the ways their
sections name.

**(l) WHAT WAS DELIBERATELY NOT TOUCHED.** The relief amplitude stays at 2.2 — 3.2 was already
rejected by looking, for churning the silhouette and leaning the plants into the hills, and a later
pass re-taking a decision made by eye is how an arc goes in circles. `SHADE_LEVELS` is unchanged.
The light direction is unchanged. The camera is unchanged (ADR-0380 D6 fence 4). Plant counts and
flower counts are unchanged — they are ADR-0226 semantics, not appearance.

---

## 5. What this costs and what it does not

**The palette is untouched, and that is asserted rather than claimed.** 0 off-palette pixels across
1,788,560 delivered. `landPalette()` is unchanged. Every colour on every island is an authored
`(token × level)` entry — the regional ground and the material rim SELECT among entries the fence
already held; they do not widen it. The occlusion rung is the one the previous increment already
priced (+39 entries, off by default).

**The four ADR-0380 D6 fences are intact.** Accessibility stays in the DOM/SVG layer (this is a
dev-only harness page and reaches no product surface); determinism stays on the scene graph — every
island here is a pure function of the fixture and its props, and the two new modules are pure and
node-provable; the palette holds; the projection does not move.

**Nothing here is adopted.** All of it lives in `packages/forest-world-r3f/harness/`, which
`sync:web-engine` does not copy (`scope-fence.test.ts`), and ADR-0380 D6 already makes adopting the
live-render experiment a separate event from running it.

**New tests, 21 of them**, in `contact-shade.test.ts` and `ground-variation.test.ts`. The ones worth
knowing about: occlusion is monotone in distance (the property the reach bisection needs); the
contact pool lands on the LIT side too, which is what distinguishes it from a short shadow; the
contact grid matches `buildShadowField`'s exactly, so a merge can never slide a pool off its prop;
the merge REFUSES a grid mismatch rather than resampling; a three-band ground can never reach the
gated token.

---

## 6. Traps carried forward

1. **`bandedColour` RE-QUANTISES its level** onto `SHADE_LEVELS`, so any level that is not a ladder
   member must go through `deliveredColour` instead. Inherited, and it silently faked a result once.
2. **`capture.mjs`'s "0 foreign-status reads" is VACUOUS for any darkening.** It is a closure
   instrument and it cannot fail for one. This page reports it and does not read it as "the art is
   honest" — section 1's colour finding comes from the confusability reader, which is a different
   instrument answering a different question.
3. **`capture.mjs` names SECTION panels by section ORDER**, so inserting a section silently
   re-points every later filename while the run still exits 0. **This pass added tag-named canvas
   shots** (`island-<tag>.png`, found by `data-st-tag`) precisely so the per-island evidence cannot
   drift that way — and it refuses on a duplicated tag rather than letting one file overwrite
   another. The section panels still bind positionally; prefer the tagged files.
4. **Summary statistics are blind to composition.** Direction B has identical colour statistics to A
   and a visibly different island. Any claim about how an island LOOKS has to be made against the
   picture; the table exists to prevent claims the pictures do not support, not to replace them.
5. **A quantile can cross a rung boundary on a modest change.** A's median moved 145.1 → 135.5,
   which reads like most of the island going dark; the occlusion share is 18.6%. Measuring the share
   directly is what corrected it — the median moved because the ground's colours cluster tightly,
   not because the island dimmed.
6. **Port 5184 may be held by another worktree's harness.** Vite is `strictPort`, so it refuses
   rather than silently rebinding — but the existing server still answers `/directions.html` with
   HTTP 200 via SPA fallback, serving a DIFFERENT page. Confirm Vite actually bound the port.
7. **`land-definition.ts` contains a deliberate NUL byte** (`const NO_PARCEL = '\0none'`), so `grep`
   reports it as a binary file. Use `grep -a`. It is authored, not corruption.

---

## Reproducing

```bash
pnpm --filter @storytree/forest-world-r3f dev
```

Then `http://localhost:5184/directions.html`. The capture is:

```bash
ST_HARNESS_URL=http://localhost:5184/directions.html ST_OUT_DIR=docs/research/chapter2-island-directions-2026-08-21 ST_FULL_PAGE_NAME=all-six-directions.png ST_PANEL_NAMES=choice,today,afternoon,slab,garden,landmass,composed,deeper,tree-test pnpm --filter @storytree/forest-world-r3f run capture
```

⚠ Frame timings in `capture-report.json` remain **RELATIVE ONLY** — headless Chromium here is
SwiftShader. The ADR-0380 D2 hardware-floor question is not answered by this run.
