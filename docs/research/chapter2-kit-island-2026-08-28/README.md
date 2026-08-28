# A whole island, dressed out of the bought kit — and what every prop means

**Increment:** `dress-a-whole-island-from-the-bought-kit` on `adopt-the-land-into-the-shipped-map-arc`.
**Date:** 2026-08-28. **Measured on:** `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2,
OpenGL 4.5.0)`, read out of the live context, GPU clock via `EXT_disjoint_timer_query_webgl2`.

Reproduce:

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5212
DISPLAY=:0 ST_KIT_URL=http://localhost:5212/kit-island.html \
  pnpm --filter @storytree/forest-world-r3f measure-kit-island
```

Raw report: [`kit-island.json`](kit-island.json). The colour guard's run over both committed assets:
[`colour-convention.json`](colour-convention.json). The kit export: [`export-dressing.py`](export-dressing.py).

---

## 1. THE PICTURE — one island, three arms, two zooms

| picture | what it is |
|---|---|
| `island-bare-{2,8}px.png` | the island with nothing standing on it — the control |
| `island-today-{2,8}px.png` | the island as it is dressed **today**: the `wild` composition, its canopy lathes, its plants and flower markers |
| `island-kit-{2,8}px.png` | the same island, the same ground, dressed from `dressing-kit.glb` |

Same fixture, same camera, same light, same run, one variable: **the prop vocabulary**. The 13-hex
research surface (`context-traversal-capture`), its eleven capabilities, its own ten UAT criteria.
Nothing here is a fragment or a swatch.

The bought island reads as a **pine forest** at both zooms. At the overview — 2 device pixels per
ground unit, the size the map is actually delivered at — a tree is 23 delivered pixels tall and is
recognisably a conifer. Today's arm delivers rust-brown cones, which is what the procedural canopy
lathe can express.

---

## 2. THE PROP VOCABULARY — what every prop asserts

ADR-0463 D4 records a standing owner delegation on this specifically: *"you can decide what signal
they represent, theres plenty of code so at this stage I dont mind you proposing and me adjusting
the shape after."* D5 keeps the floor: **delegation picks WHICH signal a prop carries, never
WHETHER it carries one.** ADR-0414 D1 is what makes that non-negotiable — a prop that asserts
nothing is exactly what it forbids. So the opening proposal already on the record (rocks mark
drift) is kept rather than re-opened, and five more are built on it.

| prop | what it asserts | read from |
|---|---|---|
| **pine** (trunk + crown) | one standing tree per **contract proven** under this capability | SCENE — the parcel's own `testCount` |
| **standing dead trunk** | this capability is **unhealthy**: its contracts stand, and they are standing dead wood | SCENE — parcel status |
| **undergrowth** (fern, grass, bush) | this capability is **proposed or building** — growth that has not become a tree yet | SCENE — parcel status |
| **rock** | **drift**: evidence gone stale beneath this capability | INPUT (ADR-0463 D4) |
| **fallen log** | a **retired contract**, cut and left where it fell | INPUT |
| **bloom** | a **UAT criterion the owner has signed** | SCENE — the story's own criteria (ADR-0226 D4) |

**An `unknown` capability grows NOTHING**, and that is the load-bearing one. An island that drew
confident trees for a capability whose state is unknown would be the art asserting a proof state
the work does not hold — the one way this arc can do real harm (ADR-0392 D5 / ADR-0398 D7).

⚠ **TWO OF THE SIX ARE DEMONSTRATED, NOT REPORTED, and the table says which.** `check:verification-decay`
computes drift for real and ADR-0438's anchors know what has been retired; neither reaches this
harness fixture, which renders with no database. They are supplied to the dressing explicitly, in
one named place (`DEMONSTRATED_SIGNALS`), rather than defaulted to plausible-looking numbers inside
it — because a prop drawn from a number nobody supplied is decoration wearing a signal's name.

**What this island shows** (11 capabilities, 3 of them deliberately deviating so more than one arm
of the vocabulary is visible rather than merely tested): 49 pines · 5 standing dead · 3 undergrowth ·
6 rocks · 4 logs · 10 blooms = **77 props**.

---

## 3. THE PAYLOAD, at island scale

**The whole dressing vocabulary — 15 kit objects, 6 materials, 18 maps, 9,400 triangles — is one
file of 351,416 bytes.** sha256 `462e5cffdbe777c348635931e55d20400c5742aa3adea3199415937f1e92ad90`.

| | |
|---|---:|
| wire (the committed `.glb`) | **351,416 B** |
| decoded, on the GPU, mipmaps included | **1,572,858 B** |
| distinct assemblies placed | 13 |
| props standing on the island | 77 |

⚠ **THE PAYLOAD DOES NOT SCALE WITH THE 77.** It scales with how many DISTINCT objects the kit
carries. Seventy-seven props cost the same bytes as thirteen. That is the finding the previous
increment established at one asset and this one confirms at island scale.

### 3a. WHICH TEXTURE RUNG — decided by measurement, and the answer inverts the expectation

The previous increment left this named as an open question: *"one asset cannot sit at two texture
rungs — 512² is one rung high zoomed and two rungs high at the overview."* At ISLAND scale that is
answered, and the answer is that **one size is right for both zooms, and it is the smallest one
measured.**

The same island rendered at three rungs, compared pixel-for-pixel at both zooms:

| rung drop | zoom | pixels that differ | mean delta over those | max delta | **share of frame moving more than the land's own step** | wire saved | GPU saved |
|---|---:|---:|---:|---:|---:|---:|---:|
| 512 → 256 | 2 px | 6.69% | 0.81 | 30 | **0.06%** | 270,272 | 18,874,368 |
| 512 → 256 | 8 px | 7.95% | 0.83 | 133 | **0.02%** | 270,272 | 18,874,368 |
| 256 → 128 | 2 px | 6.98% | 0.77 | 56 | **0.01%** | 106,492 | 4,718,592 |
| 256 → 128 | 8 px | 8.49% | 1.09 | 128 | **0.04%** | 106,492 | 4,718,592 |

⚠ **THE LAST COLUMN IS THE ONE THAT DECIDES, AND ITS BAR IS THIS REPO'S OWN NUMBER.** "Percent of
pixels that differ at all" says 7% and means nothing — a one-byte change counts. The banded material
quantises onto `SHADE_LEVELS`, so the tightest pair of rungs (0.78 and 0.80) is **5.1 bytes**: the
finest step any ground pixel beside these props is allowed to take. A texture rung whose pixels move
by less than that is moving by less than the land's own resolution. At most **0.06% of the frame**
clears it, at either drop, at either zoom.

**So 128² is committed** — 52% smaller than 512² on the wire and **16x smaller in video memory**
(1.5 MB against 25.2 MB). The trigger to revisit is a zoom beyond 8 device pixels per ground unit;
these two are the delivered sizes this arc's pictures are taken at.

---

## 4. THE FRAME COST, on the GPU's own clock

1400×1000 viewport, the island framed by its own bounding box, 7 interleaved repeats, 300 renders
per timed batch, disjoint samples discarded rather than averaged in.

| arm | zoom | median ms | spread | % of a 60 Hz frame | draw calls | triangles |
|---|---:|---:|---:|---:|---:|---:|
| bare | 2 px | 0.062 | 0.022 | 0.37% | 19 | 1,224 |
| **kit** | 2 px | **0.088** | 0.045 | **0.53%** | **25** | 71,350 |
| today | 2 px | 0.096 | 0.038 | 0.58% | 38 | 89,067 |
| bare | 8 px | 0.229 | 0.030 | 1.37% | 19 | 1,224 |
| **kit** | 8 px | **0.359** | 0.048 | **2.15%** | **25** | 71,350 |
| today | 8 px | 0.362 | 0.044 | 2.17% | 38 | 89,067 |

**Verdict: PASS at both zooms.** A whole island dressed out of bought, textured assets costs **about
two per cent of a 60 Hz frame** — and it is *cheaper than the dressing the island already has*, on
every axis: 25 draw calls against 38, 71,350 triangles against 89,067, and the same frame time
within the noise.

**The draw-call figure is the one that matters**, because `hardware-floor.mjs` measured this renderer
DRAW-CALL bound. The kit dressing merges per MATERIAL — every placement's transform baked into its
vertices — so 77 props cost 6 draw calls, exactly the shape the island's own `mergeParts` already
takes for its procedural props. An arm that instanced per prop would have been measured as far
dearer for a reason that has nothing to do with being bought.

⚠ **AT THE OVERVIEW ZOOM BOTH DRESSINGS' COSTS ARE UNRESOLVED, and the report says so** rather than
publishing a difference smaller than its own noise floor.

---

## 5. WHAT THE INSTRUMENTS REFUSED — five mutations, and three real defects they found first

| # | mutation | result |
|---|---|---|
| K1 | the kit arm places no props at all | **REFUSED** — *"kit 42 distinct colours against a bar of 452"* |
| K2 | the asset loses an object the vocabulary declares | **REFUSED** at load, and 2 unit tests red |
| K3 | the asset ships an object nothing places | **REFUSED** — a paid-for byte that draws nothing |
| K4 | the kit's own loader loses the colour convention | **REFUSED** — every kit material COLOUR-MANAGED, the pine's still RAW |
| K5 | a wide flat prop scaled by its height | caught before it shipped — see below |

### ⚠ 5a. THE PRESENCE FLOOR WAS VACUOUS TWICE BEFORE IT WORKED

**First version: a pixel difference against the bare arm.** It reported that **100% of the pixels
differed — for both dressings, whatever they drew.** The arms are framed by their own bounding
boxes, so a dressed island's buffer is genuinely bigger than a bare one's, the comparison was
between two differently sized images, and the check answered "everything differs" every time. It
could not have failed.

**Second version: distinct delivered colours, with the bar read off the other dressing.** Sound in
principle — a banded material quantises onto four authored rungs, so a banded island delivers a
handful of colours however much stands on it. It reported **bare 1,557 · today 1,687 · kit 2,973**,
and refused a correct run. The premise was false *for this configuration*: the **grain octave** mixes
toward a second colour per fragment, so a grained banded island is not banded in delivered colours
at all. The floor now measures with the grain off — the pictures keep it — and the same run reads
**bare 42 · today 113 · kit 7,703**.

⚠ And what it still cannot say, because PR #1686 learned it the expensive way: a `MeshStandardMaterial`
shading curved geometry delivers a smooth gradient whether or not its maps bound, so a high count
proves something NON-BANDED drew and **not** that it drew textured. What closes that is the colour
guard in §6, which judges this same asset's delivered pixels against its own maps.

### ⚠ 5b. THE FRAME INSTRUMENT REFUSED A PHYSICAL IMPOSSIBILITY, AND IT WAS RIGHT

At a batch of 20, the overview zoom reported the DRESSED island — 89,067 triangles, 38 draw calls,
a *bigger* buffer — as measurably **faster** than the bare one: 0.06 ms against 0.11, repeatably.
`frame-budget.ts` did not publish it. It answered **UNVERIFIED**, said *"adding work cannot subtract
cost, so this is the instrument failing, not a saving"*, and told the caller to raise the batch until
the effect cleared the noise. At 300 the ordering is monotone at both zooms. **That is why the batch
is 300**, and it is worth stating plainly: the number was forced by a refusal, not chosen to make an
answer come out.

### ⚠ 5c. TWO DEFECTS THE PICTURE WOULD NEVER HAVE SHOWN

**The kit's trunk and crown are separate objects, and pairing them wrongly is invisible.** The first
version paired `Pine_Trunk_02` with `Pine_Leaves_04` — objects five units apart in the blend file,
belonging to different trees. It rendered a perfectly plausible tree. Reading the kit's *world-space*
bounds is what found it: real pairs sit 0.07 units apart. And an assembly must be recentred
**jointly** — putting each object on the ground independently drops a pine's crown 0.70 units into
its trunk, 18% of the tree's height, because the kit's needles start just above the ground.

**A wide flat prop scaled by its HEIGHT blows up its footprint.** `Red_Flower_01` is 0.98 units wide
and 0.60 tall; asking for a 5-unit-tall bloom multiplied it by 8.3 and delivered a flower **8.2 ground
units across — as wide as a whole pine's canopy.** A criterion marker the size of a tree is the art
asserting an importance the signal does not have. Tall props are now sized by height, flat ones by
width, and which is which is declared rather than inferred.

### 5d. What the object floor says, and what is deliberately under it

| role | delivered along its sizing axis @ 2 px | @ 8 px | clears the ~10 px object floor? |
|---|---:|---:|---|
| tree | 23 | 93 | yes |
| deadTree | 19 | 77 | yes |
| undergrowth | 12 | 48 | yes |
| rock | 14 | 56 | yes |
| log | 18 | 72 | yes |
| **bloom** | **8** | 32 | **no — recorded, not fixed** |

A bloom is below the floor at the overview. That is left standing: the existing procedural flower
markers do not clear it either, and making a criterion marker tree-sized so that it would is the
same error as the flower above.

---

## 6. THE COLOUR GUARD CAUGHT THIS ASSET'S OWN TRAP — and one of its own

The guard landed in PR #1691 for exactly this case, and both committed assets now run under it:
**8 materials, all RAW** ([`colour-convention.json`](colour-convention.json)).

Two things it found here:

**A hole in the guard's own coverage.** Both assets were being judged through `loadPine`, so deleting
the convention from `kit-scene.ts` — the path the island page actually uses — left every material
still reporting RAW. The static scan caught it (which is why that leg exists), but a runtime probe
that judges an asset through a loader nothing calls is answering about a code path no picture is
drawn by. Each asset is now judged **through its own loader**, and mutation K4 above is the proof.

**A defect in the probe, correctly reported as a non-verdict.** The kit's `Logs` material carries
`vertexColors: true` — its meshes ship a COLOR_0 attribute that three multiplies into the base
colour. The probe's swatch is a `PlaneGeometry`, which has no such attribute, so the shader
multiplied by nothing and the swatch came out **black**: delivered (1,1,1) against a map whose own
mean is (93,72,59). The guard answered **INDISCRIMINATE** — *"the two hypotheses are 1.00x apart, so
this run refuses rather than reporting its own blindness"* — instead of passing. It was the
instrument that was wrong, not the asset, and the fail-closed floor is what made that discoverable
rather than a quiet green.

⚠ **A NAMED LIMITATION, left standing:** the probe judges base-colour MAPS. **Vertex colours are a
second place colour enters this non-colour-managed pipeline, and nothing checks them.** The kit uses
them on `Logs`.

---

## 7. What this does NOT do

- **It adopts nothing into `src/`.** ADR-0406 D2 and ADR-0380 D6 stand in full. This is `harness/`
  only, on its own page, for the same reason `pine.html` and `grain.html` are: `capture.mjs` refuses
  an off-palette pixel and a textured asset is off-palette by construction.
- **It does not put a bought prop on the shipped map.** ADR-0414 D1 bans decorative objects there;
  this vocabulary is authored so that nothing here would be decorative, but authorising it is a
  separate, deliberate event and is the owner's.
- **It does not settle the two supplied signals.** Wiring `check:verification-decay`'s real drift and
  the retired-contract count into a live scene is a later increment.
- **It does not touch the land.** The ground, the relief, the grain and the coast are the arc's
  endorsed treatment, unchanged, in all three arms.
- ⚠ **The kit itself is NOT committed and must never be** — `Pine_Forest_Kit.blend` is 382 MB and its
  textures 546 MiB, on the owner's box at `~/assets/superhive/`. `export-dressing.py` regenerates the
  committed subset at any rung.
- ⚠ **A committed picture of textured land is one renderer's picture.** Do not build a pixel-baseline
  regression check over these PNGs (`grain-picture-is-renderer-specific`).
