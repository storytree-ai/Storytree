# The island re-dressed under the owner's settled vocabulary — and the crowd of thirty-five

**Increment:** `re-dress-the-island-under-the-owners-vocabulary` on
`adopt-the-land-into-the-shipped-map-arc`. **Decision:** ADR-0475. **Date:** 2026-08-29.
**Measured on:** `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)`,
read out of the live context; GPU clock via `EXT_disjoint_timer_query_webgl2`.

Reproduce (the frame figures need a discrete GPU — headless Chromium on the Windows box comes up
on SwiftShader and both drivers refuse it by name):

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5231 --strictPort
DISPLAY=:0 ST_KIT_URL=http://localhost:5231/kit-island.html \
  pnpm --filter @storytree/forest-world-r3f measure-kit-island
DISPLAY=:0 ST_CROWD_URL=http://localhost:5231/crowd.html \
  pnpm --filter @storytree/forest-world-r3f measure-crowd
DISPLAY=:0 ST_CONVENTION_URL=http://localhost:5231/colour-convention.html \
  pnpm --filter @storytree/forest-world-r3f measure-convention
```

Raw: [`kit-island.json`](kit-island.json) · [`crowd.json`](crowd.json) ·
[`colour-convention.json`](colour-convention.json). The kit re-export:
[`export-dressing.py`](export-dressing.py).

---

## 1. WHAT CHANGED, in one table

The owner settled the prop vocabulary on 2026-08-29, on the pictures PR #1693 put in front of him.
This is that vocabulary built.

| | before (PR #1693) | after (this) |
|---|---|---|
| how many objects a capability grows | one pine per **contract proven** | **ONE**, whatever its contract count |
| what carries its state | the prop's KIND (pine / dead trunk / undergrowth) | its **species and leaf tint** |
| a rock | drift (⚠ which ADR-0463 records as REFUSED) | **not drawn — withdrawn, pocketed** |
| a fallen log | a retired contract | **not drawn — withdrawn, pocketed** |
| what the LAND's colour says | each capability's own state, per parcel | **the STORY's own state, uniform across the island** |
| signals the fixture had to be handed | 2 of 6 (drift, retired) | **none — every prop is read off the scene** |

---

## 2. THE PICTURES

**One island, four arms, two zooms.** Each arm differs from its neighbour in exactly one thing,
because the answer moved two things at once and a single before/after would settle neither.

| picture | what it is |
|---|---|
| `island-bare-{2,8}px.png` | per-capability land, nothing standing on it — the control the map has always had |
| `island-today-{2,8}px.png` | per-capability land + the island's own procedural props — **what the map does today** |
| `island-land-{2,8}px.png` | **island-uniform land**, nothing standing on it — the ground change, alone |
| `island-kit-{2,8}px.png` | island-uniform land + one tinted bought object per capability — **the proposal** |

**Thirty-five islands, four arms, three zooms** — `crowd-{arm}-{forest,neighbourhood,island}.png`.
`forest` is the whole map fitted to a 1280x800 laptop screen at dpr 2, which is **0.32 device
pixels per ground unit**: 6.3x coarser than the "overview" every one-island picture on this arc is
taken at, and the view the map actually opens at.

⚠ **THE CROWD IS THE PICTURE THAT MAKES THE CASE, and it is worth looking at those two side by
side before anything else.** In `crowd-today-forest.png` every island is a mottled brown-green
smudge — the procedural props at 3.7 delivered pixels are speckle, and they muddy the island's own
colour until a gold island and a green one are the same brownish blur. In `crowd-kit-forest.png`
each island is a clean block of its own state colour: green proven, gold proposed-or-building, rust
mapped, near-black unhealthy, slate unknown. **That is the whole argument for putting the state on
the ground rather than on the props**, and it is why the props-only option was declined.

---

## 3. THE PLACEMENT DEFECT — measured before, measured after

The owner's report was *"the rocks are appearing where the trees are"*.

**Before, on this same island, at these same footprints: 26 of the 2,926 prop pairs overlapped.**

| pair | count |
|---|---:|
| rock inside tree | 7 |
| **tree inside tree** | **6** |
| log inside tree | 6 |
| bloom inside tree | 3 |
| bloom inside log | 2 |
| dead tree inside tree | 2 |

Worst case: a rock **8.57 ground units** inside a pine whose canopy is 10.13 across.

✅ **AND WITHDRAWING THE ROCKS WOULD NOT HAVE FIXED IT.** Six of the twenty-six were tree on tree
and two were a dead tree inside a live one. Removing the rocks removes the symptom the owner
happened to see, which is why this is a separate fix rather than a side effect of the vocabulary
change.

**The cause.** `dressIslandFromKit` scattered ONE ROLE AT A TIME and kept its minimum-gap
rejection inside that one call, so no prop was ever tested against a prop of another role.

**The fix.** One occupancy set for the whole island, every role in it, and a best-candidate search
that maximises the worst clearance against everything already standing. Rejection sampling was not
used because rejection has to decide what to do when it runs out of attempts, and both answers are
wrong here: drop the prop (the island under-reports the work) or place it anyway (the defect,
silently).

**After: zero overlapping pairs**, on the mixed island, on every single-state island, and — the
question only the crowd can ask — **zero across the whole 35-island forest**, where each island is
dressed in its own coordinates and then offset, so only the layout can put one island's tree inside
another's.

⚠ The detector is separate from the placement and is proved able to fire: two trees at one point
must be found, two a hair further apart than their footprints must not, and the reported gap must
be the actual overlap. A placement that graded its own output would be the shape
`an-expectation-derived-from-its-subject-cannot-fail` warns about.

---

## 4. THE LEAF TINT — and the trap it sits next to

**The kit is entirely pine.** All 42 objects are conifers and every crown is green, so *species*
can only separate LEAFED from BARE. The three leafed states have to be separated by tint, applied
to a bought, textured, green crown.

⚠⚠ **AND MULTIPLYING A MAP BY A COLOUR IS THE SAME ARITHMETIC AS THE BUG.**
`MeshStandardMaterial` delivers `color x map`, and the failure PR #1691's guard exists to catch is
a base-colour map coming out about 3.5x dark and **looking like a deliberate art direction**. A
tint is a second multiplier on exactly those pixels, so "the crown is dark because it was tinted"
and "the crown is dark because the convention broke" are the same picture unless the tint is
constrained.

**THE RULE: A LEAF TINT ROTATES A MAP'S HUE AND MAY NOT CHANGE ITS VALUE.** The gain is
`token * luma(mapMean) / (luma(token) * mapMean)` — closed form, nothing fitted. The delivered
crown then has the token's chromaticity and the map's own luminance, so a tinted crown can never
BE the dark picture, and the two cases stay distinguishable by construction.

Measured, over `Pine_Branches`'s own base-colour mean of (68, 89, 68):

| state | token | source | gain | delivered | value |
|---|---|---|---|---:|---:|
| proposed | `#d8c069` | ADR-0462's own ground token | (1.391, 0.937, 0.669) | (94, 84, 46) | **x1.000** |
| building | `#d8c069` | the same object under two keys | (1.391, 0.937, 0.669) | (94, 84, 46) | **x1.000** |
| mapped | `#7d5f3b` | the app's own `--crown-mapped-lo` | (1.555, 0.896, 0.726) | (105, 80, 50) | **x1.000** |

**Every token is one the app already draws.** Nothing here authors a colour: `#d8c069` is
ADR-0462's `proposed`/`building` ground token and `#7d5f3b` is the crown the shipped map already
paints a `mapped` story's tree. `healthy` and `unhealthy` declare NO tint, and that is the
vocabulary rather than an omission — a green pine is the kit's own needles (the arm the owner
approved) and a bare dead trunk has no leaves.

### 4a. The guard learned the tint, and it learned both halves

`colour-convention.json` — **11 materials, every one RAW.** The three tinted crowns are now judged
alongside the materials as loaded, because the island DRAWS a yellow crown and a probe that judged
only the loaded material would be answering about a code path no picture is drawn by (the exact
hole PR #1693 found and closed for the loader).

```
material                          verdict   delivered      raw ctl        managed ctl    sep     value
Pine_Branches                     RAW       (69,90,69)     (69,90,69)     (16,27,16)     3.86x   -
Pine_Branches (proposed crown)    RAW       (95,84,46)     (95,84,46)     (21,25,11)     3.95x   x0.996
Pine_Branches (building crown)    RAW       (95,84,46)     (95,84,46)     (21,25,11)     3.95x   x0.996
Pine_Branches (mapped crown)      RAW       (106,81,50)    (107,80,50)    (24,24,11)     4.02x   x0.997
```

Two things make that work. **The tint carries into the controls too** — all three arms are cloned
from the tinted material — so it cancels between the two hypotheses and a yellow crown is judged on
its CONVENTION rather than failed for being yellow. And the **`value` column** is the new half: a
tinted row's delivered luminance over its untinted sibling's, in the same run. That is the number
that says a yellow crown is intentional and a black-green one is not, and it is fail-closed — the
tolerance is a floating-point allowance rather than a margin, so anything a reader could see clears
it by orders of magnitude.

---

## 5. THE COST — it is cheaper than what the map already draws

**One island**, 7 interleaved repeats, 300 renders per timed batch, disjoint samples discarded:

| arm | zoom | median ms | % of a 60 Hz frame | draw calls | triangles |
|---|---:|---:|---:|---:|---:|
| bare | 2 px | 0.040 | 0.24% | 19 | 1,224 |
| **land** | 2 px | **0.022** | 0.13% | **6** | 1,224 |
| **kit** | 2 px | **0.031** | 0.19% | **10** | 17,150 |
| today | 2 px | 0.066 | 0.40% | 38 | 89,067 |
| bare | 8 px | 0.239 | 1.43% | 19 | 1,224 |
| land | 8 px | 0.253 | 1.52% | 6 | 1,224 |
| **kit** | 8 px | **0.273** | 1.64% | **10** | 17,150 |
| today | 8 px | 0.342 | 2.05% | 38 | 89,067 |

**Thirty-five islands**, the view the map opens at:

| arm | median ms | draw calls | triangles |
|---|---:|---:|---:|
| bare | 0.463 | 210 | 42,840 |
| **kit** | **0.602** | **299** | 538,520 |
| kit-merged | 0.490 | 216 | 538,520 |
| today | 1.355 | 756 | 3,090,449 |

**The whole dressed forest costs less than half what the map's current props cost**, at 40% of the
draw calls — and the draw-call figure is the one that matters, because `hardware-floor.mjs`
measured this renderer draw-call bound. Performance is not a reason to say no and it is not close.

✅ **AN UNEXPECTED SAVING WORTH NAMING: the uniform land is CHEAPER THAN THE BARE ISLAND.** Six
draw calls against nineteen. The ground merges per (status, wheat, variant), so an island in ONE
state collapses to a third of the buckets. Nobody designed that; it falls out of the decision.

⚠ At the overview zoom several arms move the frame by less than the run-to-run noise, and
`frame-budget.ts` reports those as UNRESOLVED rather than as zero — the run fits the budget and
does not say what they cost.

---

## 6. THE PAYLOAD — halved, because the withdrawn props left the asset

| | PR #1693 | this |
|---|---:|---:|
| wire (the committed `.glb`) | 351,416 B | **162,748 B** |
| decoded, on the GPU, mipmaps included | 1,572,858 B | **786,429 B** |
| distinct kit objects | 15 | **6** |
| materials | 6 | **3** |
| triangles in the asset | 9,400 | **4,052** |

sha256 `6aaab1fad00cc7f49e65da7b59541911c449e814ada600ce936b86a6956c4af7`.

⚠ **THE RE-EXPORT WAS FORCED, not chosen.** `kit-vocabulary.test.ts` refuses an asset carrying an
object nothing places — the payload scales with DISTINCT objects, so a paid-for byte that draws
nothing is pure wire cost. Withdrawing the rocks and logs from the vocabulary without dropping them
from the `.glb` would have shipped 189 KB of geometry the island never stands up. **The texture
rung is unchanged at 128²** — which rung is right was settled by measurement in PR #1693 §3a, and
that finding is about texel size rather than object count, so it carries.

> ⚠ **OVERTAKEN 2026-09-04 — the kit now ships its NATIVE 2048-texel maps (ADR-0508 D1,
> owner-directed 2026-09-03).** The §3a finding this paragraph leans on measured pixels moved at
> the OLD overview zoom; the owner put texture resolution outside that rule — *"i dont think we
> should downsample as long as the browser can handle it … we have zoom enabled on our map so we
> can't expect the user to always be taking a far away birds eye view"* — and the map is judged at
> 8 px/unit and closer, where a 128-texel needle map is under one texel per delivered pixel. The
> table above stays as the record of the 128-texel kit; what the native rung costs and what it
> changed in the picture is `docs/research/chapter2-tree-detail-2026-09-04/`. `export-dressing.py`
> emits native by default and takes a rung only for a comparison arm.

---

## 7. WHAT THE INSTRUMENTS REFUSED, AND ONE DEFECT THEY FOUND

| what | result |
|---|---|
| props standing closer than their footprints allow | REFUSES the run, on the island and across the forest |
| the loaded kit's footprints disagreeing with the frozen literal the pure tests place against | REFUSES, naming the role and both numbers |
| a declared tint that changes a crown's value | REFUSES twice — in the arithmetic before the picture, and on delivered pixels in the guard |
| a kit arm that put nothing on the island | REFUSES — 723 distinct colours at 2 px against a bar of 452 read off the banded arms in the same run |
| a state whose form names a tint nothing declares | REFUSES at load |
| the asset losing an object, or shipping one nothing places | REFUSES, both directions, without a GPU |

### ⚠ 7a. A STORY THAT IS NOT PROVEN WAS BLOOMING, and the crowd is what showed it

The first crowd run stood **724** props. All 35 islands drew ten blooms each — **including the
`unknown` one and the `unhealthy` one.** A bloom asserts *a UAT criterion the owner signed by eye*,
so the picture was asserting he had signed ten criteria on a story nobody has checked. That is the
one way this arc can do real harm (ADR-0392 D5 / ADR-0398 D7), and it arrived through the FIXTURE
rather than through the vocabulary: `islandCriteria` defaulted every criterion to `proven` whatever
the island was — coherent for the all-healthy research surface it is shaped after, incoherent for
any other.

A story's status IS its own signed UAT verdict (ADR-0033 d.4; `worldStatus.ts`: a signed pass
renders the unit healthy), so the two cannot disagree. The default now follows the island's own
state. The crowd stands **584** props, the `unknown` island grows **nothing at all**, and
`criteriaStates` still overrides positionally so the labelled mixed panel is unchanged.

⚠ It is only visible because the crowd draws states this arc's single island never has. A
one-island page would not have found it.

---

## 8. WHAT THIS DOES NOT DO

- **It adopts nothing into `src/`.** ADR-0406 D2 and ADR-0380 D6 stand in full; question (b) of the
  owner's own answer is **NOT YET** on purpose, and this is the round he asked to see before it.
- **It does not restore the rocks or the logs.** They are pocketed rather than deleted, and come back
  only carrying a signal, never as scenery (ADR-0414 D1).
  ⚠ **AND THE ROCK'S MEANING IS NOT WHAT THE VOCABULARY IT REPLACES SAID IT WAS.** PR #1693 drew it
  as DRIFT, citing ADR-0463 D4's delegation — but ADR-0463 records that exact proposal being put to
  the owner on 2026-08-27 and **refused**, because it duplicated the tall-flower markers' axis and
  because a rock is a durable thing rather than an action item. ADR-0463 **D6** decided what a rock
  carries: the declared shared seams a capability's code rests against. Anyone bringing rocks back
  reads D6, not the built vocabulary.
- **It does not touch the land treatment.** Relief, coast, grain and skirt are the arc's endorsed
  treatment, unchanged in all four arms. What moved is only WHOSE state the ground's colour reports.
- ⚠ **The kit itself is not committed and must never be** — `Pine_Forest_Kit.blend` is 382 MB and
  its textures 546 MiB, on the owner's boxes at `~/assets/superhive/` and
  `C:\code\assets\superhive\`. `export-dressing.py` regenerates the committed subset.
- ⚠ **A committed picture of textured, grained land is one renderer's picture.** Do not build a
  pixel-baseline regression check over these PNGs (`grain-picture-is-renderer-specific`).

---

## 9. THE ONE THING WORTH THE OWNER'S EYE THAT NO MEASUREMENT SETTLES

**The island is now sparse.** Twenty props where PR #1693's had seventy-seven: ten trees and ten
blooms on a thirteen-hex island. At the zoomed view it reads as parkland with scattered trees
rather than as a forest.

That is the density decision working exactly as directed — one object per capability, however many
contracts sit under it — and it is not a defect. But it is the visible consequence, it is a taste
call, and it is the kind of thing that is cheap to change now and expensive once the shipped map is
drawing from it. If the island should read as a forest, density has to come back as SOMETHING, and
it cannot be the contract count that was just retired.

The other honest gap, recorded rather than fixed: **a bloom is 8 delivered pixels at the overview
and 1.3 in the crowd**, under the ~10 px object floor either way. That is left standing — the
procedural flower markers do not clear it either, and making a criterion marker tree-sized so that
it would is the art asserting an importance the signal does not have.
