# A shippable shadow: what it costs, and whether one ladder fits every status — 2026-08-20

Increment: `shadow-ladder-is-admissible-and-affordable` on `chapter2-code-generated-organic-art-arc`.
Governed by **ADR-0392**: the owner's look/feel verdict is taken ONCE, at the end, on a whole
island. Every intermediate appearance call here is the session's, and **D2 requires it to be
recorded with its reason** — that is section 5.

## 1. The two questions, answered

**AFFORDABLE — yes, and the live path is an order of magnitude cheaper than the author-time
one.** A shadow on the live renderer costs **one authored palette entry per land token** — today
**+39** (156 → 195) — because the shader emits `token × level` and one new level multiplies
through the vocabulary. The author-time compositor bought the same thing for **+374** (132 → 506,
PR #1385). Every pre-shadow entry survives unchanged, asserted rather than assumed.

⚠ The baseline moved MID-PASS: the story tree and the UAT flowers landed on `main` (PR #1451)
while this was being measured, taking the closure from 104 to 156. The cost is therefore stated
as the identity it always was — one entry per token — with the literals asserted alongside, so
the next prop to land prices itself instead of quietly going stale.

**ADMISSIBLE — yes, at exactly one rung, and it is `0.84`.** Derived, not chosen: it is the
deepest ladder level every rendered status can wear without reading as another one. One
hundredth deeper, `unknown` reads `healthy`.

**And the finding nobody was looking for: the SHIPPED ladder is already inadmissible, and this
island already delivers the failure.** 24,780 delivered pixels of `unknown` ground read as
`healthy` — doubt painted as proof — and **no shadow is involved**. They are relief pushing
`unknown` onto the shipped rungs 0.78 and 0.80. Section 4 has the numbers.

**And one more, which arrived with the tree: the shadow's payoff is a SINGLE PROP.** All 144
plants together shadow 14.63% of the island's ground; the one hero story tree shadows **16.58%**
— more than the entire canopy. Section 6.

## 2. What was built

Three modules, all pure and node-provable except the shader carrier.

**`shadow-ladder.ts` — the admissibility instrument.** A port of the author-time pass's
pre-registered reader (`shadow.py`'s `reader_status_table` / `nearest_status` / `safe_depth`)
with its `W_LUMA` weighting. **It is held to the three configurations of the ceiling that were
independently recorded before this pass existed**, and reproduces all three exactly:

| configuration | healthy | mapped | proposed | unknown | recorded by |
| --- | --- | --- | --- | --- | --- |
| all six statuses, top faces, full light | 0.74 | 0.76 | 0.88 | **0.91** | PR #1385 |
| folded to what `worldStatus` renders | 0.67 | ≤0.30 | 0.88 | **0.91** | PR #1407 |
| collapsed to one token per status | 0.72 | ≤0.30 | 0.90 | **0.94** | PR #1407 |

That reproduction is the whole licence to use it. Inventing a metric here and tuning it until it
agreed with a preferred conclusion is the move this arc declined once already and kept the
refusal on the record for (`chapter2-live-island-2026-08-19/README.md`).

**`land-shadow.ts` — the shadow field**, in ground space: per sample, how much authored light is
blocked. It names no colour and picks no rung.

**The material** gains one ramp entry and samples the field in the fragment stage. `colour =
token × level` is untouched; the closure argument is untouched. `SHADE_LEVELS` is untouched, so
**every panel that predates this delivers bit-identical pixels** — asserted on the capture, not
claimed (`zoom-lit` reads 0 px on the shadow rung and the same 8 colours as before).

## 3. THE INSTRUMENT THAT SHIPS TODAY CANNOT ANSWER THIS, AND THAT IS WORTH SAYING OUT LOUD

`capture.mjs` has reported **0 foreign-status reads** on every run of this arc, and it will keep
reporting 0 no matter how deep a shadow goes. `statusFamilyOf` asks *is this colour a member of
the instance's own token image?* — and on the live path the answer is yes **by construction**,
since the shader can only ever emit `uRamp[i]`. Measured over all 64 (rendered status × token ×
rung) entries: zero mismatches. It is a CLOSURE instrument doing its job. It is blind to
confusability, and reading its green as "the shadow is honest" would be reading a vacuous pass as
a result. Both instruments now run, and the report carries both.

## 4. Numbers

Measured on delivered pixels by `capture.mjs` — 44 canvases, 29,228,338 opaque px, **0
off-palette**, **0 foreign-status reads** by the membership instrument.

**The palette.**

| | entries | delivered on the shadow rung |
| --- | --- | --- |
| live, no shadow | 156 | — |
| live, with shadow | **195 (+39)** | 403,347 px across 2 of 39 authored shadow entries |
| author-time compositor, no shadow (PR #1385) | 132 | 0 px — every rung quantised away |
| author-time compositor, shadow (PR #1385) | 506 (+374) | 822 / 158 / 747 px on three rungs |

Only **2 of the 39** authored shadow entries are spent on this island, because the ground it
renders wears two tokens. The other 37 are the closure's cost of being closed, not pixels anyone
has drawn.

**Where the shadow actually lands, and where it goes.** Two numbers that only mean anything read
together, and they are like-for-like — both over GROUND, so neither is diluted by however much of
the island the vegetation happens to cover:

- the shadow FIELD covers **29.66%** of the island's ground;
- **11.96%** of delivered GROUND pixels are on the shadow rung (103,482 of 865,229).

**So roughly 60% of the shadow is hidden under the things that threw it.** The light is at 55.2°
and the camera at 50°, so the cast falls up-screen, away from the viewer, and the prop that threw
it is drawn over where it lands. That is geometry, not a bug. Over ALL delivered pixels — props
included — the figure is **7.59%**.

**The p2–p98 delivered luminance range does not move: 95.4 → 95.4.** The compositor's shadow
spent 58.2 → 61.6. This one spends nothing, because a 6.7% darkening over an eighth of the
ground cannot shift a 2nd/98th percentile. Stated plainly rather than replaced with a friendlier
statistic.

**THE LAND CANNOT SHADOW ITSELF — not faintly, at all.** A height field self-shadows only where
it is steeper than the light. The authored light is 55.2°; the relief's steepest slope at the
shipped amplitude 2.2 is **24.4°**. The terrain term is built, runs on every panel, and delivers
**zero** pixels — proved on the raster (`terrainCastIsIdenticallyZero: true`, the terrain panel is
colour-for-colour the unshadowed one). Peak slope is linear in amplitude, so reaching the light
needs about **7.0** — over three times what ships and over twice the 3.2 the previous increment
already rejected for churning the silhouette. The parcel bevel does not rescue it either: its
face is 36°, also under the light. **On this land, at any amplitude this arc will accept, the
shadow is the canopy.**

**The confusability verdicts, split by whether they survive a second reader.**

| verdict | survives a 3-variant reader? | delivered here |
| --- | --- | --- |
| `unknown` @ 0.80 → `healthy` | **yes** | 12,672 px |
| `unknown` @ 0.78 → `healthy` | **yes** | 12,108 px |
| `proposed` @ 0.78 → `mapped` | **yes** | 0 px (not on this island) |
| `proposed` @ 0.80 → `mapped` | no | — |
| `healthy` @ 1.00 → `unknown` | no | — |

**Every one of them is on the SHIPPED ladder. The shadow rung adds none.**

⚠ **The last row is an overclaim this pass caught on itself, and it was nearly the headline.**
Against the live renderer's own reader — one reference colour per status, because `IslandView`
emits `fam.top[0]` — `healthy` at full light reads `unknown`, and the island delivers **two
million pixels** of exactly that colour. It disappears the moment the reader's table carries the
three authored ground variants, so it is a property of how the reference set was built rather
than of the colours the island draws. The report counts only the robust verdicts. The
reader-sensitive ones stay visible, in amber, rather than being quietly dropped.

**The parameter-free core, which no reader model can argue with.** The delivered luminance ranges
of the four rendered statuses, and every pair that overlaps:

```
119.0 mapped@0.78   121.9 mapped@0.8    125.7 healthy@0.78  128.6 healthy@0.8
137.2 mapped@0.9    142.5 unknown@0.78  145.1 healthy@0.9   146.1 unknown@0.8
147.9 proposed@0.78 152.0 proposed@0.8  152.7 mapped@1.0    160.9 healthy@1.0
164.3 unknown@0.9   170.7 proposed@0.9  182.7 unknown@1.0   189.6 proposed@1.0
```

**All six status pairs overlap** — healthy×mapped by 27.0 luma, proposed×unknown by 34.7.
`mapped` at its lit rung is darker than `healthy` at its darkest; `unknown`'s two dark rungs
bracket `healthy`'s lit one. **Luminance cannot separate any two statuses on this ladder.** What
separates them is HUE — which is why no re-anchoring *within* the luminance ordering can fix the
collisions, and why the remedy is hue/chroma separation between the status tokens. The arc's
Dependency section already named that as **an owner art call to price, not to spend**, and this
pass prices it below rather than taking it.

## 5. THE APPEARANCE CALLS, AND WHY — the ADR-0392 D2 record

**(a) The shadow rung is `0.84`, and it is DERIVED.** Not an aesthetic pick: `deepestAdmissibleRung()`
sweeps the 0.01 grid and returns the deepest level every rendered status survives. A test asserts
that one step deeper FAILS, so "we picked something safe" cannot masquerade as "this is the
deepest a shadow may go". If the sweep ever returns nothing, the module throws at import rather
than falling back — a shadow that cannot ship honestly has to fail loudly, because the failure is
the finding.

**(b) The shadow is BINARY — one rung, no penumbra.** Forced rather than chosen, and worth saying
so. A soft edge needs intermediate rungs; each costs 26 palette entries AND has to stay above
0.846. `SHADOW_PENUMBRA` survives only as *where* the edge falls, to sub-texel precision, because
the fragment thresholds the field. The soft-edge intent from `blender_tree.py`'s 26° shadow sun is
honoured as far as one rung can honour it.

**(c) The shadow rung is NOT reachable by lighting.** It sits in the ramp but not in `bandShade`'s
quantiser, so no surface normal can land a pixel on it — only the shadow term can. Inserting it
into the quantiser would have re-banded every relief pixel on every existing panel, which is a
different change wearing this increment's clothes.

**(d) A shadow only DARKENS, and only rungs lighter than itself.** A pixel already at 0.78 or
0.80 (a steep face turned away from the light) keeps its level. The alternative — always taking
the shadow rung — would have BRIGHTENED shaded slopes, which is a shadow lighting something up.

**(e) EVERY upright prop CASTS — plants, flowers and the hero tree — and none of them RECEIVE.**
Casting: excluding one would have been the arbitrary act. The flowers contribute 0.64% of the
ground and are nearly invisible, but they are upright objects in the same light, and an island
where two of the three kinds of thing cast reads as a rendering bug rather than as a choice.
Receiving: at the delivered 2 px/unit a whole shrub is about five pixels, so a shadow on one has
nowhere to land — it would spend the one available rung on the element that cannot show it. What
is DRAWN and what CASTS are kept in step by threading each panel's own toggles through, because a
caster whose mesh is not drawn lays a shadow under nothing, which is the most confusing possible
artefact: every part of it looks deliberate.

**(f) The terrain term was BUILT even though it delivers nothing, and it is KEPT.** Deleting it
would leave "the land cannot shadow itself" as prose. Keeping it makes it a measurement: the
march runs on every panel, the terrain-only panel is on the page as colour-for-colour identical
to the control, and a node test proves the term fires on land steep enough to cast. An absence
that has been instrumented is a result; an absence that was never built is an assumption.

**(g) FIELD RESOLUTION 3 samples/unit, LINEAR filtering.** The page renders panels at 8 px/unit
as well as the delivered 2, and a field coarser than the raster it feeds staircases the shadow's
edge along its own grid — which reads as a defect in the shadow rather than in the sampling.
Linear filtering costs nothing, because the fragment thresholds the value before any colour is
chosen; it only moves the edge to sub-texel precision.

**(h) A GROUND-SPACE FIELD, not a per-vertex attribute, and not a shadow map.** The ground mesh is
a triangle fan per cell on a 16.5-unit mean pitch, so a per-vertex shadow could carry nothing finer
than a whole capability — the shadow would have been smeared across parcels and would have looked
like a lighting bug. A depth-buffer shadow map needs a second pass per panel, resolves in camera
pixels rather than ground units, and brings the acne/peter-panning artefacts this arc keeps
mistaking for art problems. The land is a height field under one authored direction that cannot
move, so the analytic form is cheaper AND provable in a node test.

**(i) `SHADE_LEVELS` WAS NOT CHANGED, even though two of its rungs are inadmissible.** This is the
call most worth arguing with, so here is the reasoning. Fixing the ladder means making it
shallower, which un-does part of the land definition that landed yesterday, changes every panel on
the page, and still would not fix the underlying problem — section 4 shows the four statuses
overlap in luminance in *every* pair, so no shallower ladder separates them. The structural remedy
is hue/chroma separation, which the arc has already ruled an owner art call to price. Changing the
shipped ladder under cover of an art change would also be exactly the ADR-0392 D5 failure mode:
deciding a SEMANTIC question (what the land asserts about status) while nominally doing art.

**(j) NO AMBIENT-OCCLUSION TERM.** The author-time pass carried one, made step-driven so it would
not redraw the mesh seams the owner had removed. On this land the parcel bevel IS the step, and it
already shades itself by normal. AO there would double-darken the one feature that already reads,
and it would land on the same single rung, so it could add nothing the bevel does not already have.

**(k) The shadow is OFF BY DEFAULT, AND THE PALETTE IS PRICED RATHER THAN SPENT.** This distinction
is the one that matters most, because the increment says in as many words that a shadow which
cannot be held inside the closed palette is *a finding to price and escalate, not a licence to
widen the palette under cover of an art change*. So, precisely:

- `SHADE_LEVELS` is unchanged, and `landPalette()` still returns the same **104** entries. Asserted
  by test, not claimed.
- The 26 extra entries exist only on a material that is handed a shadow field, and `shadow`
  defaults to `'off'` — so every panel that predates this delivers bit-identical pixels.
- All of it lives in `harness/`, which the website sync does not copy (`scope-fence.test.ts`), and
  ADR-0380 D6 already makes ADOPTING the live-render experiment a separate event from running it.

The shadow was BUILT in order to count the price on real delivered pixels rather than assert it
from the TypeScript — which is this arc's whole discipline, and the only way to know that 26
entries buy 370,067 delivered pixels rather than PR #1385's zero. **Nothing shipped wears the
wider palette, and whether anything should is the owner's, not this pass's.**

## 6. What this means for the arc — the priced options, not a recommendation

**The tall caster arrived while this pass was measuring, and it changed the answer.** Before PR
#1451 the shadow reached 3% of delivered pixels and the honest conclusion was *affordable,
admissible, and not yet worth much on this island*. With the hero story tree standing on the land
it reaches 7.6% of the picture and 12% of the ground, and it reads as a shape rather than a
mottle. Measured on the field, per caster class:

| caster | count | share of the island's ground it shadows |
| --- | --- | --- |
| plants | 144 | 14.63% |
| UAT flowers | 10 | 0.64% |
| **hero story tree** | **1** | **16.58%** |
| all three | 155 | 29.66% |

**One prop out-shadows the other 154 together**, because at 94 ground units it throws 65 of them
across a 234-unit island. That is worth stating as a general finding rather than a fact about this
tree: on a banded island lit from 55°, shadow is a function of the TALLEST thing present, and
measuring it on a component — a plant row, a contact sheet — cannot see that at all.

**The ladder repair is a real cost that this pass did not spend, priced here:**

| option | what it buys | what it costs |
| --- | --- | --- |
| leave it | nothing changes | 24,780 px of `unknown` ground keep reading `healthy` on any island carrying an `unknown` or `proposed` parcel |
| shallower ladder | removes the two offending rungs | un-does part of the land definition that landed the day before, changes every panel, and does NOT separate the statuses — all six pairs still overlap in luminance |
| hue/chroma separation between status tokens | actually fixes it | re-authoring the app's `.hex-territory` tokens; both the compositor and the live path inherit them, so it moves the shipped map's colours |

The third is the only one that works, and it is the one the arc already named as the owner's.

## 7. Traps carried forward

1. **`bandedColour` RE-QUANTISES its argument, and that silently faked a result.** It runs the
   level through `bandShade` first, so `bandedColour(token, 0.86)` returns `token × 0.90`. A sweep
   for the deepest admissible rung therefore tested the same four authored levels over and over
   and reported the first one it tried as admissible — which looks exactly like a shallow,
   cautious, correct answer. `deliveredColour` exists to be the un-quantised form. Any level that
   is not a member of `SHADE_LEVELS` must never go through `bandedColour`.
2. **The compositor's reader table is not this renderer's, and using it unchanged is a category
   error.** `safe_depth` compares a delivered colour against a table of full-light tokens, which
   was right for the compositor because its lit top faces WERE delivered at full light. The live
   ground is delivered at 0.90 and never at 1.00. Re-base the table, or the instrument compares a
   delivered colour against a reference the renderer cannot draw.
3. **A one-reference-per-status reader manufactures collisions.** See section 4's amber row: it
   cost a two-million-pixel overclaim that survived until it was checked against a second reader.
   Report the verdicts that survive both, and keep the others visible rather than dropping them.
4. **`statusFamilyOf` searches `SHADE_LEVELS` only**, so it reports a shadowed pixel as belonging
   to no family at all. Wiring the shadow into `capture.mjs` without `familyOnShadowLadder` would
   have flagged all 26 shadow entries as foreign-status reads — a capture crying wolf over its own
   authored palette, which is worse than no capture.
5. **A per-vertex shadow attribute cannot work on this mesh** (fan per cell, 16.5-unit pitch), and
   the failure looks like a lighting bug rather than a resolution one.
6. **The props hide their own shadows, and the denominator decides the answer.** Light at 55.2°,
   camera at 50°, so the cast falls up-screen behind the caster. Any measurement of "how much
   shadow is there" has to say what it is over: the same shadow reads **29.66%** as a fraction of
   ground AREA, **11.96%** as a fraction of delivered GROUND pixels, and **7.59%** as a fraction
   of all delivered pixels. Only the first two are like-for-like; the third is diluted by however
   much of the island the vegetation happens to cover, which is a fact about plant density.
7. **Shadow is a function of the TALLEST thing present, so a component measurement cannot see
   it.** One hero tree out-shadows 144 plants. This pass began three hours before that tree
   landed on the island and would have concluded "not yet worth much" on evidence that was
   accurate and about the wrong object — which is the ADR-0392 sequencing complaint arriving from
   a direction it did not anticipate.
8. **`capture.mjs` still names panels by SECTION ORDER** (friction
   `capture-panel-names-bind-to-section-order`). The three sections here were appended LAST for
   that reason. The canvases the measurements compare are found by `data-st-tag` instead, because
   a mis-zipped measurement produces a NUMBER rather than a visibly wrong filename.
9. And the inherited ones still bite: the scene's 2D coordinates are already projected at 20° and
   must be unprojected exactly once; a GROUND distance foreshortens by `sin(elev)` while an UPRIGHT
   height foreshortens by `cos(elev)` (the caster's height uses the upright one — using the ground
   one would make every shadow 2.75× wrong); SVG `(x, y)` → 3D `(x, z)` flips handedness; and a
   browser caps WebGL contexts near 16, so the page draws through one shared context.

⚠ Frame timings in `capture-report.json` remain **RELATIVE ONLY** — headless Chromium here is
SwiftShader. The ADR-0380 D2 hardware-floor question is still unanswered.

## 8. The pictures

- **`panel-shadow-casters.png` — read first.** No shadow / terrain-only / canopy at 8 px/unit,
  then the same shadow with the plants removed, so the tree's long cast is unobstructed. The
  terrain panel being identical to the control is the measurement, not a mistake.
- **`panel-shadow-delivered.png`** — the pair that decides it, at the delivered 2 px/unit.
- **`panel-shadow-ladder.png`** — the admissibility table, computed live by the same instrument the
  shader is built from, plus a mixed island carrying the binding status.

## Reproducing

```bash
pnpm --filter @storytree/forest-world-r3f dev
```

Then `http://localhost:5184/island.html`. The capture is:

```bash
ST_HARNESS_URL=http://localhost:5184/island.html ST_OUT_DIR=docs/research/chapter2-shadow-ladder-2026-08-20 ST_FULL_PAGE_NAME=live-island.png ST_PANEL_NAMES=delivered,zoom,swirls-fork,bare-before,definition,definition-delivered,amplitude,mixed,what-they-add,verdict-forms,shadow-casters,shadow-delivered,shadow-ladder pnpm --filter @storytree/forest-world-r3f run capture
```

⚠ If port 5184 is held by another worktree's harness, Vite refuses to start but the existing
server still answers `/island.html` with **HTTP 200** via SPA fallback, serving a DIFFERENT page.
Check the served `<title>` first, or use `--port <n> --strictPort` (this pass ran on 5191).
