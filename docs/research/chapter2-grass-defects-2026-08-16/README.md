# The three named grass defects, isolated — "black", "bleeding through", "buggy"

> **⚠ RE-MEASURED 2026-08-17 ON THE FIXED COMPOSITOR.** This pass's 46%-deliver-nothing finding was
> diagnosed by PR #1383 as painter-order occlusion and fixed in `compose_core.py` on 2026-08-17, so
> `diagnose-report.json`, `what-the-grass-delivers.png` and `where-the-black-is.png` were
> re-rendered here and every headline number below moved. The verdicts did **not** change; two of
> them got weaker, and that is worth reading rather than skipping:
>
> | | before the fix | now | note |
> |---|---:|---:|---|
> | delivered vegetation px (fixture / all-healthy) | 292 / 384 | **510 / 676** | |
> | placements delivering nothing | 51 of 112 | **8 of 112** | the fix |
> | vegetation px below the grass luma floor | 0 | **3** | still 0 in the black band |
> | vegetation px carrying an unauthorised colour | 0 | **6** | both from `wilt` pieces |
> | median hue distance from the ground beneath | 41.8° | **34.6°** | 51.3% → **44.1%** over 40° |
> | vegetation standing on ANOTHER capability's cell | 20 px (6.8%) | **23 px (4.5%)** | |
> | the charcoal LAND region | 4 253 px (12.2%) | **4 246 px (12.1%)** | unchanged in substance |
>
> **The two zeros were zeros over a raster missing 46% of its placements.** They are still small and
> neither verdict flips, but a negative finding measured on an incomplete raster is a weaker object
> than it read as. Body text below that still quotes the pre-fix figures is superseded by
> `diagnose-report.json`; the fix and its full write-up are in
> `../chapter2-compositor-order-and-caps-2026-08-17/`.

**Date:** 2026-08-16 · **Camera:** 50° (the research track's named parameter) · **Piece set:** the
declined grass exactly — `pieces-m00-blade`, blade geometry, normals 0.00 · **Cost:** $0 ·
**Vendor calls:** 0 · **Blender renders:** 0 (this pass renders nothing; it re-composes the sibling
pass's committed pieces and measures the result)

The owner declined the grass a second time and, this time, named defects rather than giving a
general verdict: *"your grown triangle grass doesnt look good enough yet, **it looks buggy**, and
**theres bvlack grass** and **ther colors bleeding through**"*.

Two of those three are claims about CORRECTNESS. This pass treats them that way until a measurement
says otherwise, because the alternative — answering a possible rendering fault with a taste
argument — is how a bug survives three rejections.

## The answers, in one table

| the owner said | the verdict | the number that carries it |
|---|---|---|
| **"theres bvlack grass"** | **Not grass, not a bug — and 100% a FIXTURE ARTEFACT** | **3** delivered vegetation px below the grass luma floor (0 on an all-healthy island), and **0** in the black band at all — the darkest is luma **68.4** against land's darkest at 40.9. The black is **4 246 px of charcoal LAND** (12.1% of the island) from the ONE fabricated `unhealthy` capability, and **0 px** on an all-healthy island. |
| **"ther colors bleeding through"** | **Not a palette bug. A real hue-contrast effect, nearly all of it authorised** | **6** of 510 vegetation px carry a colour their own capability's status family did not authorise — all six from two `wilt` pieces (the check fires at 376 px when made to). The median vegetation pixel sits **34.6° of hue** from the ground beneath it, and **44.1%** are more than 40° away. |
| **"it looks buggy"** | **THE FINDING OF THIS PASS, and it is not taste** | Of **112 placements, 51 — 46% — delivered ZERO pixels**, which PR #1383 diagnosed as painter-order occlusion and 2026-08-17 fixed: **8 (7.1%)** now. The survivors still deliver a **median of 3**, and 32 of them deliver **one or two** — the SIZE question the fix does not touch. |

**Nothing here is owner-attested and no treatment is chosen.** Whether the grass is good enough is
the owner's look (ADR-0070 stage 2) and this page has no standing to make it.

## The pictures

| file | what it is |
|---|---|
| **`where-the-black-is.png`** | The fixture island, then every pixel in the black band painted, then every pixel the vegetation owns. The two highlights do not overlap by a single pixel. |
| **`what-the-grass-delivers.png`** | The same crop at 6×, fixture and all-healthy, each with its vegetation painted. This is what 46%-deliver-nothing looks like. |

Both highlights are the MEASURED attribution array painted straight onto the delivered raster — not
a hand-marked overlay. The hero tree is omitted from every panel (it is composited after the back
half at 1:1 with its own palette, so it is not part of what is attributed); the committed
`grass-on-island.png` in the sibling pass is the version with the tree, which is what the owner saw.

## The instrument this needed, and why nobody had it

Every number on this track so far has been a COUNT of delivered pixels — 7 px a tuft, ~300 px of
decor, 34 968 px of land. **A count cannot answer either named defect, because both are questions
about a pixel's IDENTITY.** *Is that black pixel grass, or is it the ground showing between the
grass?* is not answerable from a total.

So `attribute.py` adds one thing: a parallel canvas recording, for every supersampled pixel, WHICH
DRAWABLE PAINTED IT — carried through the majority downsample by asking which drawable emitted the
colour the 3×3 block actually voted for. It is exact rather than inferred, because every paint op in
the compositor is a hard write that never blends, so replaying it onto an owner canvas with an
integer id encoded as a colour marks precisely the pixels the real op wrote, in the same painter
order.

**The method trap it exists to avoid is recorded, because a prior session fell into it:** a
bare-vs-dressed DIFF does not identify a land colour. It isolates only the DECOR — the cell fill
underneath is identical in both and cancels out — and the dark judging board then makes *"there is
no black grass, it is just the backdrop"* look like a finding. Attribution is the fix: the land is
not subtracted, it is **labelled**.

## 1. "Black grass" — the black is real, it is 12.2% of the island, and it is LAND

`where-the-black-is.png` · `check_black`, `check_charcoal`

| | fixture island | all capabilities `healthy` |
|---|---:|---:|
| delivered vegetation px | 292 | 384 |
| **vegetation px below the grass luma floor (90)** | **0** | **0** |
| darkest vegetation pixel, by luma | 108.5 | 108.5 |
| land px in the black band (luma < 60) | 937 | 58 |
| …of which are the island's silhouette rim | 66 | **58 — all of it** |
| **the whole charcoal region** (every px an `unhealthy` drawable owns) | **4 253 px = 12.2%** | **0 px** |

**No delivered pixel of grass is black, or even dark.** The floor is not arbitrary: `healthy`'s
`bladeBack` is #436b32 → luma 92.7 and the darkest blade token of ANY status is #87693b → luma
108.9, so a floor of 90 asserts *no grass pixel is darker than the darkest thing grass is made of*.
The measured minimum is 108.5, comfortably above it, on both islands. The assertion is made to FAIL
by painting one tuft #050505 (see the refusals) — it is not a check that cannot fire.

**What the owner saw is the `unhealthy` LAND.** Its top faces deliver #57544a at luma 84.4 and its
vertical faces #37352c at luma 41–53, so the region reads as one dark mass whose edges are nearly
black. It is 4 253 delivered pixels — **fifteen times the entire vegetation layer** — and it is the
loudest thing in the picture. Panel 2 of `where-the-black-is.png` paints the sub-60 pixels: they
trace the terrace faces of that one region, and not one of them is in panel 3's vegetation.

**And it is a fixture artefact, in full.** The island's `unhealthy` capability is one of the ten
INVENTED statuses in the synthetic `fork-spike-island`; `island.json` carries geometry and status,
not proof state. Drive every capability to `healthy` and the charcoal region is **0 px**. On a
genuinely healthy island the only sub-60 pixels left are **58 on the outer silhouette**, 0.17% of
the land, and they are the island's outline rather than anything growing on it.

> **This does NOT settle the disagreement the owner surfaced on 08-16**, and the diagnosis makes it
> sharper rather than softer. The land renders `unhealthy` as CHARCOAL (scorched) while the decor
> renders it, correctly per ADR-0226 D3, as STRAW dead grass (#ab8c54 / #87693b). Two layers
> describing one status in two incompatible metaphors, with the louder one owning 12.2% of the
> picture. That is a vocabulary question for the ADR-0226 re-examination, not an art one, and this
> pass does not decide it.

## 2. "Colours bleeding through" — three readings, measured separately

The phrase is ambiguous and the ambiguity matters, so each reading got its own check rather than
one check standing in for all three.

### (a) The palette-reassignment fault class — ZERO, and the check is proved live

`check_bleed`

This arc has already caught one instance of the real thing: a `(token × shade)` pair missing from
the closed palette meant the snap could only clamp toward what it HELD, so an `unknown` rim came out
`healthy` green over **2 564 px**, at exit 0. The reusable shape is to assert a rendered thing
carries only colours ITS OWN semantic state authorises.

Applied per placement — a tuft on capability 7's cell may deliver only the blade tokens capability
7's STATUS selects, at the shade levels its own piece declares:

| | fixture | healthy |
|---|---:|---:|
| **vegetation px carrying an unauthorised colour** | **0** | **0** |
| land px wearing a vegetation token's colour (the reverse direction) | 0 | 0 |
| ambiguous attributions (land and decor both emitted the winning colour) | 0 | 0 |

**Zero, both directions, both islands.** The palette closure `build_palette_dressed` performs is
holding: every decor colour is an exact palette entry, so the snap is an identity for it and there
is no room to clamp into a neighbouring family.

The number that makes that a finding rather than an unfalsifiable claim: rebuild the palette WITHOUT
the decor families — the interior fork's own bug, injected at the level it actually occurred — and
the same check reports **376 bleeding px**, landing on `land:healthy:top@0.78`,
`land:healthy:top@0.9`, `land:healthy:side@0.9`, `coast:sand` and `land:building:top@1.0` — i.e. the
vegetation repainted as ground and as beach. The instrument works; the pipeline is clean.

### (b) The silhouette rim — it CAN cross families, and it never touches the grass

`check_rim`

`compose.py`'s `back_half` darkens every silhouette pixel by 0.60/0.76 and **re-snaps it against the
whole palette**, and its own docstring says the consequence outright: *"a green cell's rim can
legally land on another family's entry"*. At seven delivered pixels a tuft has almost no interior,
so this looked like the strongest single hypothesis going in.

**It is not, for a reason that only attribution shows: 0 of 292 vegetation pixels are on the island
silhouette.** A tuft stands in the island's interior, surrounded by solid land on all four sides, so
it is never on the outline the rim pass acts on. The rim recolours **0** grass pixels and moves
**0** of them out of their own family.

The rim's cross-family reassignment is nonetheless real, on the LAND: an all-`healthy` island
delivers **58 px of the `unhealthy` side token** purely from rim darkening plus re-snap. That is
0.17% of the land, it is the island's outer edge, and it is the whole of the residual "black" once
the fabricated status is removed.

### (c) Hue contrast — the reading the picture actually supports, and nothing here is a bug

`check_contrast`

ADR-0226 puts a capability's TESTS in the grass and its PROOF STATE in the grass's health. The
land's own status tint is a **separate token family with no relationship to it**. The consequence
shows up on the island rather than in either table:

| | fixture | healthy |
|---|---:|---:|
| **median hue distance from the ground beneath** | **41.8°** | **8.1°** |
| vegetation px more than 40° from their ground | 136 (51.3%) | 104 (29.8%) |

The cross-tab names it: **32 px of green `healthy` blades on ORANGE `building` ground** (a building
capability's vegetation is alive, so its blades take the same #71a154 the healthy ones do, while its
ground is #dcab52); **24 px of grey-green `mapped` blades on WHEAT `proposed` ground**; **33 px of
cream `proven` petals on CHARCOAL `unhealthy` ground**, which is the maximum-contrast pairing on the
island and is exactly where the eye goes.

A viewer with no access to the token tables sees a colour from one family sitting on top of another,
in specks, and *"colours bleeding through"* is a fair description of it. **Every one of those pixels
is authorised** — this is the vocabulary working as decided, not a fault.

Two supporting numbers:

- **14.7% of the fixture's vegetation pixels are grey or straw** (`blade:mapped`, `blade:unhealthy`),
  because four of the ten invented capabilities carry statuses whose blade tokens are not green.
  On a healthy island that is **0%**.
- **20 px (6.8%) of vegetation stands on a DIFFERENT capability's cell** from the one that placed
  it — a placement is scattered inside one cell but projects upward at 50°, so its top pixels can
  land next door. Small, real, and the one item in this section that is arguably an assertion
  error rather than a look. `0` px land on water or coast sand.

**So the honest version of the trade-off is this: on a healthy island the grass sits 8° from its
ground and disappears into it; the contrast that makes it visible on the fixture is the same
contrast that reads as bleeding.**

## 3. "It looks buggy" — the finding, and it is about the SIGNAL, not the look

`check_components` · `what-the-grass-delivers.png`

| | fixture | healthy |
|---|---:|---:|
| placements the vocabulary made | 112 | 145 |
| placements delivering at least one pixel | 61 | 78 |
| **placements delivering NOTHING** | **51 (45.5%)** | **67 (46.2%)** |
| median px per surviving placement | **3** | **3** |
| surviving placements delivering one or two px | 25 (41%) | 31 (40%) |

**Nearly half the vegetation the vocabulary places is not in the picture at all, and 41% of what
survives arrives as one or two pixels.** A plant that delivers two pixels is not a small plant; it
is speckle, and speckle scattered over flat ground is what a rendering fault looks like. That is a
complete and unflattering account of *"it looks buggy"*, and it needed no taste judgment to reach.

**This also corrects the arc's own headline number in the direction that matters.** *"A tuft is seven
delivered pixels"* was measured on an ISOLATED tuft piece, rendered alone. In situ, competing with
the ground for a 3×3 majority vote, the median placement delivers **three** pixels and the MODAL
outcome is **zero**. Seven was the best case, not the typical one.

> **The consequence is a signal question, not an art one.** ADR-0226 D2 makes the grass COUNT carry
> a capability's test count (`grassCount = 2 + tests·1.9`). If 46% of placements deliver nothing,
> the count the viewer can see is not the count the rule authored — and the loss is not uniform,
> since it depends on what colour the ground under each placement happens to be. The sibling pass's
> test-density ladder is not falsified by this (it is monotonic in TOTAL delivered pixels, which is
> a different measurement), but the per-placement read is much weaker than a placement count
> suggests. **Routed, not decided:** this belongs to the ADR-0226 re-examination.

## 4. A defect in the RESEARCH harness, found on the way — ✅ FIXED 2026-08-17

**`compose_land(caps=...)` did not recolour an island — it recoloured the CELLS.** `C.boundary_walls`
read the module global `C.CAPS` for its wall side token, not the `caps` argument, so a
"drive the island to one status" run composed through the argument alone delivered recoloured cell
tops standing on the ORIGINAL statuses' walls.

Measured at the time: an all-`healthy` island composed that way still carried **936 charcoal
`unhealthy` side pixels** — the exact shape of the defect this pass was trying to attribute, produced
by the instrument rather than by the pipeline. `diagnose.py` rebinds both together, which is why this
pass's own numbers were never affected by it.

**`caps` is authoritative on every path since 2026-08-17.** Re-measured on the island BODY: **904
wall px → 0**, and the guard fires the other way too (one genuinely `unhealthy` capability delivers
904 wall px). The 936 and the 904 are the same defect measured with and without the silhouette rim,
which `C.back_half` explicitly authorises to reach the whole palette.

The sibling pass's health read (*"driving the whole island to each status changes 21 066 delivered
px = 60.2%"*) WAS the under-count this predicted. Restated with the corrected composer:
**27 475 px = 78.6%** — an under-count of 6 409 delivered px, 18.4 percentage points. Full write-up:
`../chapter2-compositor-order-and-caps-2026-08-17/`.

## Proof — the guards, and every one of them made to FIRE

The look is an owner attestation. These are the claims a session may assert for itself, and **both
headline findings are NEGATIVE results** — which is precisely the shape whose instrument has to be
proved, because a check that cannot fail reports zero for free.

```text
== the instrument ==   compose_attributed's canvas + alpha are BYTE-IDENTICAL to compose_core's
                       the owner canvas covers exactly the region the real canvas does
                       every owned pixel's colour is one its OWNING record could have painted
                       back_half_attributed's output equals the shipped C.back_half's
== the refusals ==     FIRED  a tuft repainted with a FOREIGN status family is caught (2 px)
                       FIRED  a tuft painted #050505 is caught (min decor luma 40.9)
                       FIRED  a PARTIAL palette reassigns semantic state (376 px, repainted as
                              land top / land side / coast sand)
                       clean  and the unperturbed healthy island still passes (0 px)
```

**The third guard is the one that earns its place**, because the first version of this pass's
instrument was WRONG and produced a completely plausible false finding. Walls were marked by calling
the shipped `paste_piece` with the id encoded as its colour argument — but `paste_piece` SHADES that
argument per band key (`KEY_SHADE`: 1.00 / 0.90 / 0.80 / 0.78), so a wall stamped as id 42 decoded
as id 37, and every chamfered and wall-lit pixel on the island was attributed to some other record,
most of them decor. The instrument then reported that **71% of grass pixels were delivering
`land:*:side@0.9`** — a textbook-shaped semantic bleed that did not exist. The tell was that every
"bleed" colour was a SIDE token at exactly a `KEY_SHADE` level. `assert_attribution_consistent` is
the check that now makes that impossible to ship: it holds every owned pixel's colour against the
colours its owner could have painted, derived from what each drawable was HANDED rather than from
what turned up on the canvas.

## Reproduce

```text
python diagnose.py            # both islands + diagnose-report.json   (~1 min)
python diagnose.py --fire     # and every guard made to fail          (~4 min)
python picture.py             # the two pictures + provenance sidecars
```

System Python with numpy + Pillow. **No Blender run and no re-render**: this pass composes the
sibling pass's committed `pieces-m00-blade` and `pieces-land`, so it introduces no new code state on
either generator and cannot invalidate the interior fork's committed provenance.

## THE FENCE — what this pass did not touch

Owner directive, 2026-08-16, verbatim: *"this should just be a research pass on a single island, we
still dont have flowers etc, isolate this away from the main app until we ready"*.

- **The whole diff is `docs/research/chapter2-grass-defects-2026-08-16/**`.** No `packages/**`, no
  `apps/**`, no web submodule bump.
- **`LAND_CAMERA_ELEVATION_DEG` in `packages/forest-world/src/camera.ts` is still 20 and was not
  read for arithmetic, only quoted.** The research track authors at 50° as a named parameter
  (`grass.PASS_ELEVATION_DEG`), which this pass imports rather than restates.
- **No file in any sibling research pass was edited**, including `compose_core.py` and
  `blender_land.py` — so no committed provenance sidecar anywhere on this track is invalidated.
- **No new fixture was built.** A sibling lane is concurrently replacing the synthetic
  `fork-spike-island`; every finding below is stated against the COMMITTED evidence and each one
  says explicitly whether it survives that replacement.

## What survives the fixture change, and what does not

The single most useful thing this pass can hand the next one, since the healthy real-corpus island
is being built in parallel:

| finding | survives a real healthy island? |
|---|---|
| no black grass (0 px below the luma floor) | **YES** — measured on both islands, identical minimum |
| no palette-reassignment bleed (0 px) | **YES** — measured on both islands |
| the rim never touches the grass (0 px) | **YES** — structural: a tuft is never on the silhouette |
| 46% of placements deliver nothing; median 3 px | **YES** — 45.5% fixture, 46.2% healthy |
| the charcoal mass (4 253 px, 12.2%) | **NO** — 0 px on a healthy island. Pure fixture artefact. |
| grey and straw grass (14.7% of vegetation) | **NO** — 0% on a healthy island |
| median 41.8° hue distance from the ground | **NO** — falls to 8.1°, which is its own problem |
| 20 px standing on another capability's cell | **YES** — 20 px on both |
| the land/decor `unhealthy` metaphor clash | **UNTESTABLE until a real unhealthy capability exists** |

## Honest gaps

1. **There is no owner LOOK here and nothing is attested.** Three defects are diagnosed; none is
   fixed, and no treatment is proposed. The re-author-or-withdraw fork the increment carries is
   deliberately left open — see below.
2. **The `unhealthy` metaphor clash is surfaced, not settled.** Charcoal land against straw grass is
   a vocabulary question for the ADR-0226 re-examination.
3. **The 46%-deliver-nothing finding is routed, not resolved.** It bears on ADR-0226 D2's count
   rule and is a story-author / ADR question, not an art one.
4. **`decorPxStandingOnANOTHERCapabilitysCell` is reported, not judged.** 20 px is small; whether a
   tuft overhanging its neighbour is an assertion error or an acceptable projection artefact is not
   this page's call.
5. **One island, one seed, one camera, one zoom.** Inherited from the sibling pass and unclosed. The
   app may render the map at more than one scale; a placement that delivers 3 px at this scale
   delivers a different number at another, and the 46% is a function of that scale.
6. **The all-healthy island is the same GEOMETRY with its statuses driven**, not a real corpus
   island. Its cell shapes, capability count and test counts are still the fixture's, so its
   vegetation DENSITY is not what a real story would produce — only its colour vocabulary is
   honest. The sibling lane's island is what closes this.
7. **The test counts and UAT criteria are still INVENTED** (inherited from the sibling pass).
8. **The hue-distance metric is a proxy for a perceptual judgment.** 40° is a stated threshold, not
   a measured perceptual one, and hue alone ignores the saturation and luma components of contrast.
   The cross-tab underneath it is the load-bearing half.
9. **No cast shadows, and no reconciliation against the app's wrapper transforms** — both inherited
   and unclosed from the sibling pass.

## The fork this pass hands back, deliberately unresolved

The increment offers *"re-author the component at a size and form that reads in 3D, or WITHDRAW
grass from the 3D land"*. **Neither is chosen here, and the diagnosis changes what the choice is
about:**

- **Correctness is not the reason to re-author.** Both named colour defects are clean. There is no
  rendering fault to fix.
- **The one measured defect is not a look defect either.** 46% of placements delivering nothing is a
  question about whether ADR-0226 D2's count survives delivery — a signal question, and withdrawing
  the grass would remove a signal, which ADR-0226 makes a vocabulary decision rather than an art
  one.
- **What is left for the art is the honest trade the numbers state:** at delivered scale the
  vegetation either matches its ground (8.1° on a healthy island, and it vanishes) or contrasts with
  it (41.8°, and it reads as speckle). Both ends of that are measured. Which end is acceptable is
  the owner's look.
