# High frequency without looking off — the two options, rendered

> **⚠ RE-COMPOSED 2026-08-18 — all 5 pictures moved.** The plant positioner's CRC32 affine collapse was
> propagated into `scatter.py` itself by the increment
> `crc32-dispersion-fix-propagated-and-evidence-rerendered`, so every placement on this pass's
> pictures moved. This pass already imported the fixed MEADOW positioner, so what moved here is the **UAT FLOWERS**: they drew angle and radius from two equal-length address tokens and carried the same affine property at a delivered correlation of +0.507, which the 15-unit spacing sampler cannot catch by construction.  **Nothing was re-RENDERED** — no piece PNG is touched; the fix changes
> where a piece is stamped, never what it looks like. The full delta table, and what did NOT move,
> is in `../chapter2-plant-dispersion-2026-08-17/README.md`. Numbers in the prose below were
> measured on the PRE-FIX placements unless they say otherwise.


**Date:** 2026-08-17 · **Camera:** 50° (the research track's named parameter; the app's
`LAND_CAMERA_ELEVATION_DEG` is **20** and is neither read nor written) · **Island:** the real-corpus
`context-traversal-capture` — 11 capabilities, every one `healthy` off its own signed pass, 162 mesh
cells, seams off, flat green · **Blender renders:** 4 (the four species, ~9 s total) · **Cycles
samples: 48** · **Vendor calls:** 0 · **Cost:** $0

The owner, 2026-08-17:

> *"This many shubs looks rather ugly, feels like there must be a way to do something nicer in
> blender that has high frequency without looking off. can you recommend some options"*

and, on the shortlist: *"sure, show me what this looks like"*.

## → OPEN `high-frequency-options.png`

Four panels, one island, one code state, one camera, **one palette on all four**, so the only
variable is the option: **1.** today · **2.** + ground micro-relief · **3.** + silhouette variety ·
**4.** both. Then `high-frequency-detail-6x.png` to judge the art, where every block is one
delivered pixel.

**Where that 6× crop goes is part of the deliverable and took three attempts.** Centring it on the
island's centroid — the obvious choice — lands it on the hero tree's trunk, so the appearance call
gets made on a close-up of bark. Sliding it to the most vegetation lands it *under the canopy*,
because plants are densest at the island centre. It is now the window containing **no tree pixel at
all** that holds the most delivered vegetation (677 px), with the tree mask derived from the
difference between the with-tree board and the identical tree-less one rather than guessed.

**Nothing here is owner-attested and this page has no standing to make an appearance verdict**
(ADR-0070 stage 2). ADR-0280 D4 makes an honest *"this did not help"* an accepted outcome — and one
of the two options below is close to it.

---

## The headline: the two options are not priced alike

| | silhouette variety | ground micro-relief |
|---|---|---|
| **palette entries it costs** | **0** | **+619** (506 → 1125) |
| **plant count it changes** | 0 | 0 |
| what it buys | median delivered mark **2 px → 14 px**; outline spread **2.0× → 5.34×**; vegetation **984 → 2120 delivered px** | land luma p2–p98 **62.6 → 66.1**; distinct delivered luminance levels **44 → 44** |
| Blender cost | 4 piece renders, ~9 s | none — it is a shading field |
| honest verdict | large, and nearly free | small, and expensive |

**Silhouette variety is the cheap one and it is not close.** The four species sit in the existing
`tuft-*` slots with the existing token family at the existing shade levels, so the closed palette
does not move by a single entry, and neither does any count.

**Micro-relief costs +619 palette entries to buy 3.5 points of luminance range and no additional
distinct levels.** Under ADR-0145 the closed palette is what stops a frame shipping as a generic 3D
render, so that is a real price and the decision to pay it is the owner's, not this pass's.

---

## The trap that would have invalidated the whole pass

**Every composite this arc has delivered placed its plants on their cell's bounding-box diagonal.**
`scatter._sample_in_cell` drew `x` and `y` from two CRC32s over messages differing in one character;
CRC32 is affine over GF(2), so the two draws agreed to within 1% — corr(u, v) **+0.9997** against a
null of exactly 0.

**This pass IMPORTS the fixed positioner** (`chapter2-plant-dispersion-2026-08-17/disperse.py`) —
imported, not vendored — and asserts the statistic on its own delivered placements **before any
picture is written**. `scatter.py` itself is untouched; propagating the fix is the parked
`crc32-dispersion-fix-propagated-and-evidence-rerendered`.

| | current budget | area-aware budget | unfixed sampler | null |
|---|---:|---:|---:|---:|
| **corr(u, v)** | **+0.0366** | **+0.0226** | +0.9997 | 0.0000 |
| on-diagonal share | 0.0468 | 0.0482 | 1.0000 | 0.0396 |
| closest pair (ground units) | 1.77 | 1.77 | 0.04 | — |
| median nearest neighbour | 8.85 | 9.03 | — | — |
| share with a neighbour under 4 units | 19.9% | 17.5% | 50.6% | — |
| meadow placements | 171 | 166 | — | — |

`verify.py` re-derives all of this and `verify_refusal.py` drives the real composer with the unfixed
sampler to prove the gate fires and writes no picture.

---

## 1. Silhouette variety — and the 3-pixel figure is the WITHDRAWN grass

**The arc's "median 3 delivered px" is the long grass the owner withdrew, not the budget a plant
has.** The set `compose_healthy.py:95` still mounts is `pieces-m00-blade`, and measured through the
compositor's own 3×3 majority its tufts deliver **2 px** in a **2×1** box. A shrub in the same set
delivers **11–12 px** in a 6×3 box — four times the area. This was measured first, and it is what
makes the option worth authoring at all.

Four species, designed to the delivered box rather than to the modelling viewport
(`blender_species.py`), each in an existing `tuft-*` slot:

| slot | species | delivered px | bbox | aspect | the cue |
|---|---|---:|---|---:|---|
| `tuft-3a` | **dome** | 18 | 6×4 | 1.50 | area — one solid mass |
| `tuft-2` | **spire** | 7 | 2×4 | 0.50 | taller than wide; nothing else in the set is |
| `tuft-3b` | **spreader** | 20 | 8×3 | 2.67 | the opposite aspect ratio |
| `tuft-4` | **pair** | 10 | 6×3 | 2.00 | **disconnection** |

```
   dome        spire     spreader        pair
  ..##..        ##       .######.      .#....
  ######        ##       ########      ##..##
  ######        ##       .######.      ###.##
  .####.        .#
```

**Disconnection is the strongest cue at this scale and that is why one species is built around it.**
Aspect ratio has about two usable steps in a 6×3 box; a gap is topological and survives any
downsample that keeps the mark at all. The gap is 3.2 ground units between centres, measured to
leave a whole delivered pixel of ground between the two masses — a first attempt at half these
heights delivered `###.##`, a 6×1 dashed line where the gap survived but the plant did not.

| | withdrawn blade set | species set |
|---|---:|---:|
| outline spread (delivered aspect max/min) | **2.0×** | **5.34×** |
| delivered px per tuft | 2–3 | 7–20 |
| median delivered mark | **2 px** | **14 px** |
| vegetation px on the island | **984** | **2 120** |
| delivered px per mark, island average | 5.44 | 11.71 |
| palette entries | 132 | **132** |

**A species carries NO meaning, and that is a fence rather than an omission.** ADR-0226 D2 gives the
signal to the vegetation COUNT; the vocabulary has no member for species, so four outlines assert
exactly what two did. Making species mean something would be inventing a channel under cover of an
art change.

**Seven of the eleven pieces are INHERITED byte-for-byte** from `pieces-m00-clump`, with each
source file's sha256 recorded in the new set's `render-meta.json`. `blender_grass.py` is **not
edited** — its sha256 is stamped into fourteen committed piece sets' code state.

---

## 2. Ground micro-relief — frequency in the light, and it is small

High frequency assembled from more discrete marks reads as noise at this scale, so the frequency has
to come from something that is not object count. `relief.py` perturbs the GROUND HEIGHT by a
band-limited field and shades it with the same key sun the land pieces and the hero tree already
share. Nothing picks a colour: the delivered value is the flat green token times a light multiplier,
exactly as the shadow's is, multiplied into the canvas BEFORE `back_half`.

| band | wavelengths | min multiplier | mean | land darkened >1% | land luma p2–p98 |
|---|---|---:|---:|---:|---:|
| none | — | 1.000 | 1.000 | 0% | 62.6 |
| coarse | 14 / 7 units | 0.9771 | 0.9878 | 76.2% | 65.1 |
| **fine (delivered)** | **7 / 3.5 units** | **0.9580** | **0.9795** | **97.2%** | **66.1** |

A ground unit is ~1.05 delivered px here, so a wavelength in units is a wavelength in pixels. Below
the fine band a half-cycle is under one delivered pixel and the field becomes per-pixel noise —
the thing being avoided, so it is the technique's floor rather than a setting to keep turning.
`relief-frequency-fork.png` shows all three at 6×.

### What it does to the range the owner cleared

The arc's series, and this pass's two rows appended to it — same instrument, same mask, same
`C.W_LUMA` weights, all on bare land:

| | land luma p2–p98 |
|---|---:|
| as shipped (3 hash-picked variants + wheat) | 78.9 |
| one surface, no shadow | 58.2 |
| one surface + shadow | 61.6 |
| **+ shadow, this pass's baseline** *(joint palette)* | **62.6** |
| **+ micro-relief (fine)** | **66.1** |

Relief re-spends **3.5 points** of the range flattening freed. It does not approach the 78.9 the
hash-picked variants had, and nothing here claims it should.

**But the distinct delivered luminance level count does not move at all: 44 → 44.** Both panels are
snapped through the same joint palette, so the baseline already has access to every rung relief
introduced; what relief changes is where the ground's luminance SITS, not how many values the
surface can express. That is reported rather than dressed as a gain.

### Relief is GEOMETRY, not pigment — asserted, not claimed

`verify.py` checks that **every distinct delivered cell-body colour is the ONE flat token scaled by a
scalar**, to within the quantiser's own 1-unit rounding floor. A shading change scales all three
channels by one number; a pigment change moves off that ray. **The surface the owner rejected fails
the same test**, which is what keeps the check from being vacuous.

### There is no terrace-lip term, and that is a decision

The increment asked for terrace lips. A lip drawn at every cell-to-cell join **is the interior mesh
seam the owner removed on 2026-08-16 at a cost of 1 892 delivered px**, wearing a shading model
instead of a stroke. The only lips that are not that seam are the ones at a genuine height STEP —
and `shadow.JOIN_AO` already draws exactly those, driven by height excess and identically zero
across a flat join. Adding a second term over the same geometry would double-count it.

---

## 3. A shadow only exists if the palette holds it — and so does relief

`relief-survives-the-snap.png` · report → `paletteCost`, `survivesTheSnap`

| palette | entries | relief/shadow levels reaching the raster | px |
|---|---:|---:|---:|
| shipped (land only) | 86 | — | — |
| **shipped (dressed — the arc's "132")** | **132** | **0 — every level quantised away** | **0** |
| closed over the shadow ladder | **506** | 3 (the shadow's own rungs only) | 3 280 |
| **closed over BOTH** | **1 125** | **8** | **7 622** |

**The answer to the increment's question is that it is NOT one spend for two payoffs.** Relief needs
**619 entries beyond** what the shadow already bought — the palette more than doubles, 506 → 1125,
which is 8.5× the shipped 132. Relief alone, with no shadow at all, would cost +263 (132 → 395).

The two ladders are different shapes and that is the finding rather than a preference: the shadow's
is `0.9333 / 0.8667 / 0.80`, relief's is `0.955 / 0.91` — **shallower and finer**, because a shadow
is one low-frequency gradient and can afford a deep rung, while relief is high-frequency and a rung
that deep delivers as dark speckle, which is the noise the owner rejected wearing luminance instead
of hue. The two **multiply** where they overlap, so the honest closure is over the **8 products**,
not the union of 3 + 2.

---

## 4. The count, as a FORK — shown, not decided

`count-fork.png` · report → `countFork`

`grass = round(2 + tests × 1.9)` has no area term. The area-aware variant is the minimal change
derived from the measured overload: the same rule, then capped at the parcel's own capacity at a
shrub's footprint.

| | current | area-aware |
|---|---:|---:|
| total marks | **171** | **166** |
| capability 5 (7 tests, ONE cell, 197.6 ground², capacity 14.3) | **18** (1.262× over) | **13** |
| capabilities over capacity | 1 | 0 |
| **monotonicity breaks in test count** | **0** | **4** |

**What B costs, which the increment asked for by name.** The current rule is monotone in test count
BY CONSTRUCTION — more tests always means more plants, which is what makes vegetation READABLE as a
test count (ADR-0226 D2). Capping at capacity breaks that in **4 ordered pairs** on this island:
capability 5 has 7 tests and would show 13 plants, while capability 10 has 6 tests and shows 15, and
three 5-test capabilities show 14. **A reader counting vegetation would read the test counts in the
wrong order.**

**THIS IS A FORK AND NOT A RECOMMENDATION.** Changing the count rule is an ADR-0226 D2 semantic
change and is the owner's. Both are drawn; neither is preferred here.

---

## 5. Does relief make a cell LIE about its capability? No — and the guard fires

Land cells ARE the capability and each cell's FILL carries its status tint, so a darkening pass is
precisely the operation that can make a `healthy` cell read as something else (ADR-0367 D5). The
guard is a **REFUSAL**: no picture is written if it trips.

| | delivered |
|---|---|
| relief alone, on bare land | **0 of 14 314** top-face px changed what they say |
| as delivered (species + shadow → + relief) | **0 of 11 873** |
| the re-measured ceiling for the `healthy` fill | **0.74**, re-derived every run |
| deepest reachable joint level | **0.80** (clears it by the declared 0.05 margin) |

**And the guard fires, on a real drive of the real composer.** `verify_refusal.py` pushes the
combined field past the ceiling and the composer refuses a REAL picture naming **1 382 of 14 314**
top-face pixels — the same order as the shadow pass's own 1 332, and far too many for a
threshold-only guard to have squeaked past. It writes **no** picture when it fires, which is checked
separately: a guard that reports a problem and then draws the picture anyway is not a guard.

The diagonal gate fires the same way: driven with the affine-CRC32 sampler the composer refuses at
**corr(u, v) = 0.9997** against a floor of 0.15 and a null of 0, before a single pixel is composed,
and again writes nothing.

### The clamp in `combine` is a PRECAUTION, not a save — and an earlier draft of this file said otherwise

The arithmetic bound is real and holds on any island: the shadow's deepest rung is 0.80 and relief's
is 0.91, and **0.80 × 0.91 = 0.728, below the 0.74 ceiling**. So `combine` clamps the product at the
shadow's own floor, which is also the physically honest model — ground in full shadow receives no
direct sun, and relief is a direct-light effect.

**But the measured breach on this island is ZERO.** The relief field's own minimum is **0.958**, so
no delivered pixel comes near the deepest product. `verify_refusal.py` runs the unclamped
configuration and asserts that it does *not* fire, so this page can never drift back into crediting
the clamp with a rescue.

### The guard fired four times before it was right, and every one was the INSTRUMENT

108 px, then 51, then 384, then 99 — all false, and worth writing down because the shadow pass
recorded the first mechanism and this pass still had to rediscover the other two:

1. **A geometric top-face mask counts blocks straddling a cell and the wall stamped in front of
   it**, where `mode_down`'s majority vote tips when the light moves. The tell was transitions
   running in BOTH directions to a colour at **0.62 of the token** — far below any level the field
   can reach. (The shadow pass's trap 3.)
2. **Comparing the blade baseline against the species composite varies the plant set as well as the
   light**, so a bigger plant covering ground it did not cover before is counted as a corrupted
   fill. 384 px, none of them a lie.
3. **A strict fill mask cut from a PLANT-LESS canvas still contains every pixel a plant later stands
   on**, and the field multiplies plant pixels too — a plant is a different token family and reads
   as a different status by design. 99 px. **The mask has to be cut per plant set** (`pure_fill`),
   which the shadow pass never needed because it composed a bare island.

**A related measurement bug was caught the same way and is worth the same warning: the body
statistics must be PLANT-LESS.** A plant stands on a cell top face, so its pixels fall inside the
body mask; measured with plants in, the luma range mixes the ground's light field with the
vegetation's token family and is not comparable to the arc's 78.9 / 58.2 / 61.6 series. A first
draft here also used Rec.709 luma weights instead of the quantiser's own `C.W_LUMA`, which produces
numbers that cannot be compared to that series at all while looking exactly as if they can.

---

## Proof — `verify.py` **68/68**

```text
python compose_options.py      # 5 pictures + options-report.json + 5 sidecars   (~30 min)
python verify.py               # the floor, 68 checks; the determinism re-compose is folded in (~30 min)
python verify_refusal.py       # drives the real composer through 4 configurations (~25 min)
```

Needs system Python with numpy + Pillow. Blender 5.2.0 LTS is needed only to re-render the four
species (`blender_species.py`, ~9 s).

`verify.py` covers: the fence (`docs/research/**` only, `LAND_CAMERA_ELEVATION_DEG` still 20,
`scatter.py` and `blender_grass.py` untouched, the positioner imported rather than vendored, every
refusal hatch off at rest) · the diagonal statistic re-derived, plus the unfixed sampler tripping the
same gate · four distinct species outlines, none empty, no two identical, the pair's gap surviving
the downsample, the seven inherited pieces hash-matched · relief being geometry and not pigment,
with the rejected surface failing the same test · the palette being a strict superset AND an identity
on every shipped entry · the status delta being zero and the ceiling clearing its margin · no fourth
compositor · sidecars, one code state, the declared sample count, and every sheet opaque rather than
transparent · determinism on the DECODED raster, never a file hash.

**Determinism is asserted on the decoded raster**, and this run happened to agree by bytes as well —
5 of 5 identical both ways. That agreement is a coincidence of this pass's encoder path, not a
licence to compare hashes: the rule exists because a sibling pass on this track measured **0 of 22**
files byte-identical across two runs that were pixel-identical. `verify.py` reports both numbers side
by side so the reason for the rule stays visible even on a run where they match.

**Relief is geometry, not pigment — 0 of 44** distinct delivered cell-body colours lie off the flat
token's ray, while the surface the owner rejected fails the same instrument at **3 of 7**.

**No fourth compositor.** The track has three copies of a ~700-line compositor and nothing detects
the fork. This pass adds none: it imports `compose_healthy.py` whole with its writes sent to scratch
(so its refusals bind here), the land from `compose_core.compose_land`, the snap from
`compose.back_half`, the shadow field from the one-surface pass, and the placements from `disperse`.
What is new is `relief.py`, `blender_species.py`, and a `panel()` that exists for the one seam
nothing else offers.

---

## Gaps, stated

1. **There is no owner LOOK.** Whether any of this reads right is exactly the judgment this page must
   not make. `high-frequency-detail-6x.png` is where to make it.
2. **The relief amplitude is authored conservatively and that bounds the result.** 0.55 ground units
   over 7/3.5-unit wavelengths produces a 4.2% peak darkening; the relief ladder's deeper rung (0.91)
   is essentially unreachable by relief alone and is only ever hit in combination with the shadow. A
   larger amplitude would be more visible and would assert terrain the mesh does not have. **The
   option was not swept** — one amplitude, two bands.
3. **The +619 palette figure is for this ladder.** A shallower relief ladder would cost less and
   deliver less; the trade was not swept either.
4. **One island, one seed, one camera, one zoom, one sample count (48).** The pixel shares are this
   island's; the direction of each finding is structural. Never compare a land pixel count across
   sample counts — the arc measured that alone moving it by ~2.
5. **Every capability here is `healthy`, so the 0.74 ceiling is `healthy`'s.** On a mixed island the
   admissible depth is the minimum over the tokens present, and the shadow pass measured `unknown` at
   0.91 — so this combined ladder would **not** be admissible there. Unchanged by this pass, and
   still not decided.
6. **The species are four outlines, not a vocabulary.** Which species should exist and what (if
   anything) they mean is the parked `shrubs-replace-long-grass-and-inherit-the-test-count`. This
   pass shows what the option LOOKS like so that decision has a picture behind it.
7. **`respeciate` spreads the tufts over the four slots by hash** because `scatter.tuft_piece`
   reserves `tuft-2` for `unknown` and `tuft-4` for lush capabilities, so on an all-`healthy` island
   only two or three slots are reachable. It moves no plant and changes no count, but it does mean
   the delivered species mix is this pass's and not the scatterer's.
8. **Cross-parcel spacing is still the fixed positioner's known gap** — 12 of 157 plants have a
   too-close neighbour across a parcel boundary, up from 3, a direct consequence of best-candidate
   pushing plants toward their own parcel's edge. Inherited, not introduced, and not fixed here.
9. **`compose_dressed.py:253` still carries the OLD depth key.** Known-broken, in a superseded
   vendored copy, and deliberately not this pass's.
10. **Nothing here proposes an app change**, including the finding that the shipped compositor still
    mounts the withdrawn `pieces-m00-blade` set (`compose_healthy.py:95`). The fence says findings
    are written down with a file and a line.
