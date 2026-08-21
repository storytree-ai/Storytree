# Grounding in ISLANDERS, then rebuilding the island with many small trees (2026-08-22)

Increment: `ground-in-islanders-then-rebuild-with-many-small-trees`, on
`chapter2-island-that-looks-good-first-arc`.
Governed by **ADR-0392** as amended by **ADR-0398**, and by **ADR-0406**.

---

## 0. What this found, in one page

**THE OWNER NAMED A REFERENCE AND, MORE USEFULLY, NAMED A RATIO** — *"it achieves quite a lot
without much complexity"*. That is a claim about a proportion rather than about a look, and
characterising it was the first act. The honest headline is that the ratio is not where anyone on
this arc has been looking.

**The reference is measured, not quoted.** ISLANDERS' makers published almost nothing about how its
art is built: no talk, no art devlog, no teardown. Every number below was read off the delivered
pixels of seven of its own screenshots by an instrument written for this pass and pointed at OUR
islands in the same run. Where a dev DID say something it is quoted and attributed; §6 lists what
was searched and found empty, so the next session does not spend the same day.

**Four findings, in the order they change what we do.**

1. **A SHADED FACE THERE IS NOT ITS LIT FACE DARKENED — IT HAS ROTATED.** Measured on its trees'
   own lit and shaded deciles: a green spire runs H74→H135 into shade (+61 degrees) at 0.59x the
   value; a cypress +22 at 0.61x; the winter conifer +35 at 0.72x. **Our banded ladder cannot do
   this at all, by construction**: `bandedColour` is `token x level`, a single scalar on R, G and B,
   which leaves hue and saturation exactly where they were. Every shaded face this project has ever
   delivered was its lit face at lower value. That is arithmetic, not opinion, and it is why "add
   another shadow rung" was never going to close the gap. **Built this pass** (`SHADE_KEYS`), on
   the three new canopy tokens only — see §4 and the fence argument in §5.
2. **THE REFERENCE'S TREE-TO-ISLAND RATIO CANNOT BE TRANSFERRED, AND THE REASON IS DELIVERY SCALE.**
   Its trees are ~0.8% of their island's width. Ours is delivered at 468 px where its island fills
   ~1680, so the same ratio is **3.9 delivered pixels** — under the ~10 px floor at which an
   isolated mark stops being an object, a floor this arc measured in PR #1498. We are held at
   **2.9–3.6% of island width**, roughly 4x the reference's ratio, and no amount of care changes
   that. What it costs is fewer trees, and §3 says how many.
3. **THE GAP IS NOT HUE AND IT IS NOT SATURATION.** Measured on the same instrument: hue families
   carrying ≥1% of the saturated pixels — theirs 6–11, **ours 4–8**. Chromatic fraction — theirs
   88–100%, **ours 61–93%**, with the hamlet at 92.8%. Those were the two levers a reader would
   guess at from the pictures, and both are close. What is 4.6x apart is **the number of distinct
   colours carrying area** (theirs 168–276, ours 30–52) and what is 21x apart is **how many colour
   bins it takes to cover 90% of the frame** (theirs 327–782, ours 13–28). The second of those is
   the banded palette refusing continuous shading, and the fence forbids closing it.
4. **THE HERO TREE WAS 24% OF THE FRAME, AND THE WHOLE CANOPY COSTS 4%.** The island's delivered
   canvas is 487 x 358 px with the hero tree and 487 x 271 without it — **88 px of frame height
   existed to hold one tree**. Thirty-three small trees add **16 px**. The island is now 21%
   shorter in frame and carries thirty-three trees instead of one.

**What is NOT in here.** No look verdict — that is the owner's, once, and it is not being asked for
mid-flight (ADR-0392 D1). No adoption: everything lives in `packages/forest-world-r3f/harness/`,
which `sync:web-engine` does not copy.

---

**Read the island files, not this document** — `island-walled.png`, `island-hamlet.png`,
`island-terrace.png`, `island-shrine.png`, `island-wild.png`, and `island-today.png` as the
control. Every one is a **complete island at 2 px per ground unit** — the size it is actually
delivered — on the real `context-traversal-capture` surface. Nothing here is a fragment, a contact
sheet, a swatch or a technique row (ADR-0392 D1 / ADR-0398 D2).

**No reference image is committed.** They are Grizzly Games' screenshots; the URLs are in §6 and
the measurements are here. That follows `chapter2-reference-board-2026-08-20`, which committed a
README and no pictures either.

---

## 1. THE RESEARCH PASS — what ISLANDERS is doing, in numbers

### 1.1 How this was measured, and the two traps in it

Seven in-game screenshots from the artist's own portfolio (Friedemann Allmenröder,
https://allmenroeder.com/islanders — "unedited except ingame UI was removed"), plus the key art.
Each is 1920 x 1080; the analysis takes the **top 72% of the frame**, which removes the score ring,
the build bar and the minimap on all seven.

The same instrument then ran over our own island PNGs in the same pass, so every comparison below
is one code path over two subjects rather than two numbers from two tools.

⚠ **TRAP 1 — A RAW DISTINCT-RGB COUNT IS MEANINGLESS ACROSS THESE TWO SUBJECTS.** Theirs are JPEGs
of a continuously-shaded 3D render with antialiasing and atmospheric fog: 94,090 to 220,025 distinct
RGB values per frame, almost all of them compression and blend artefacts. Ours are PNGs from a
closed palette: 27 to 76. Comparing those two numbers says nothing at all. Everything below is
therefore reported on **5-bit-per-channel bins at a coverage threshold** — how many colours actually
carry area — which is robust to both.

⚠ **TRAP 2, AND IT SILENTLY POLLUTED THE FIRST RUN OF THIS PASS.** The harness page draws its
islands on a **CSS transparency checkerboard**, and a Playwright *element* screenshot composites it
in, so the saved PNG's background arrives OPAQUE. Masking the checkerboard's two colours by value is
not enough: the pattern is four 45-degree `linear-gradient`s, a 45-degree hard stop antialiases, and
the diagonals deliver a few hundred blend greys that are neither value. The first table this pass
produced had our islands at 35–50% chromatic against the reference's 88–100% — a headline finding
that was **an artefact of counting the background**. Masking by **palette membership** instead is
exact, because every island pixel is an authored closure entry by construction and nothing else is.
The corrected figure is 61–93%, and the finding it supported evaporated. The calibration that proves
the fix: `island-today.png` now measures **85,145 opaque px / 27 distinct colours**, which is
`capture-report.json`'s own number for that canvas to the pixel.

### 1.2 The reference, measured

| screenshot | colours ≥0.1% | ≥0.05% | bins to cover 90% | luma p2 | p50 | p98 | spread | luma plateaus | chromatic | hue families |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s01 teal island | 212 | 315 | 414 | 55.0 | 127.3 | 222.0 | 167.0 | 34 | 99.0% | 11 |
| s02 green island | 276 | 432 | 782 | 78.0 | 129.0 | 189.0 | 111.0 | 27 | 94.1% | 11 |
| s03 desert (key-art angle) | 232 | 389 | 622 | 58.8 | 107.8 | 190.0 | 131.3 | 34 | 88.3% | 8 |
| s04 dusk island | 185 | 293 | 336 | 39.8 | 90.8 | 140.8 | 101.0 | 26 | 95.9% | 6 |
| s05 rain island | 263 | 415 | 474 | 36.8 | 88.8 | 172.8 | 136.0 | 35 | 99.9% | 7 |
| s06 winter island | 173 | 299 | 327 | 77.0 | 152.3 | 223.8 | 146.8 | 36 | 99.6% | 7 |
| s07 autumn archipelago | 168 | 239 | 510 | 55.0 | 129.8 | 222.8 | 167.8 | 42 | 97.2% | 9 |
| **median** | **212** | **315** | **474** | 55.0 | 127.3 | 190.0 | **136.0** | **34** | **97.2%** | **9** |

*colours ≥0.1%* = distinct 5-bit bins each covering at least 0.1% of the frame. *luma plateaus* =
4-unit luminance bins each holding ≥1% of pixels — how many brightness levels the picture actually
rests on. *chromatic* = fraction of pixels with HSV saturation ≥0.25. *hue families* = 10-degree hue
bins holding ≥1% of the chromatic pixels. Luma is `0.3R + 0.59G + 0.11B`, this project's own
`W_LUMA`, so every luminance figure lines up with the arc's existing tables.

### 1.3 THE TREES — the direct hit on the owner's decision

Read at 3x to 8x magnification off four islands, and segmented programmatically where the trees
separated from their ground.

**What a tree IS there.**

- **A tapered spindle — a lathe, not a ball on a stick.** Widest around a third of the way up,
  narrowing to a point at the top and to a small foot at the ground.
- **NO TRUNK, at any magnification.** The canopy meets the ground directly. At their delivered size
  a trunk would be a one-pixel line under a crown.
- **Two silhouettes in circulation and no more**: a narrow spire and a rounder dome.
- **Delivered aspect ~2.3 : 1** (height : width).
- **Smooth-shaded, two perceptible tones**, and a soft **cast shadow** under every one.
- **ONE canopy colour per island.** Neighbouring trees differ in SIZE, never in tint. The whole
  island's trees recolour together between islands — green on s02, pale blue on s06, rust on s07 —
  which is the procedural colour scheme, not a species.

**How big, and how many.** On s02, the cleanest single-island case: the island spans ~1680 px of a
1920-px frame; one tree is ~14 px wide and ~38 px tall. So **a tree is 0.83% of its island's
width**. Density varies enormously and deliberately: s02's fields carry a sparse scatter at roughly
2% canopy coverage, while s07's small plateau packs about twenty trees at nearer 35%. **The bare
ground between stands is doing as much compositional work as the stands.**

**Lit versus shaded, per tree** — the lit and shaded deciles of each tree's own pixels, so no
hand-picked pixel decided the answer:

| tree | lit (H/S/V) | shaded (H/S/V) | ΔH | ΔS | V ratio |
| --- | --- | --- | --- | --- | --- |
| green spire (s02) | 74 / 64 / 80 | 135 / 37 / 47 | **+61°** | −27 | 0.59 |
| teal cypress (s01) | 95 / 58 / 51 | 117 / 46 / 31 | **+22°** | −12 | 0.61 |
| winter conifer (s06) | 183 / 43 / 99 | 218 / 68 / 71 | **+35°** | +25 | 0.72 |
| rust spindle (s07) | 41 / 41 / 73 | 30 / 32 / 56 | **−11°** | −9 | 0.77 |

**That table is finding 1, and the last row is the half of it that is easiest to get backwards.**
The shaded side rotates toward the cool side of **its own island's scheme** — the greens go teal,
the blue conifer goes further blue, and the one WARM tree on a warm island barely moves and stays
warm. The key is per-scheme, not a universal teal. This pass got that wrong first (§4d).

### 1.4 The ground, the shading and the water line

Sampled as 9 x 9 patches at named coordinates, with an overlay rendered to verify each probe landed
where it was supposed to — five of twenty-eight landed on a building or the wrong surface and were
discarded rather than reported.

| island | lit ground | shaded face / rock | ΔH |
| --- | --- | --- | --- |
| s06 winter | `#8cf3fc` H185 S44 V99 | `#416cb0` H217 S63 V69 | **+32°** |
| s07 autumn | `#b2a66b` H50 S40 V70 | `#447882` H190 S48 V51 | **+140°** |
| s01 teal | `#779a26` H78 S75 V60 | `#234845` H175 S51 V28 | **+97°** |
| s02 green | `#a9c242` H72 S66 V76 | `#507b77` H174 S35 V48 | **+102°** |
| s04 dusk | `#0c3b46` H191 S83 V27 | `#20576b` H196 S70 V42 | +5° |

The winter row is the clean one — the same material, unambiguously visible lit and shaded. The
middle rows compare a lit ground against a rock face, which is partly a different MATERIAL rather
than a shade of one, so they support "the shaded half of the picture lives in a cool teal" and not
a per-material shading law. s04's near-zero delta is the case where the whole island's terrain
already sits in a 19-degree hue window and every scrap of colour variety comes from the buildings.

**Terrain reads as exactly two tones — a light top and a dark face** — which is what our own four-
rung ladder already delivers (`rungOfNormal`: every vertical face lands on the darkest rung, a
horizontal top on rung 2). That half of the stack is not short.

**The water line is two flat bands**: a bright pale shelf ringing the island, then a deeper body.
Simple, and it does most of the work of making an island read as an island rather than as a board.

### 1.5 Density versus per-object detail — the ratio question, answered

**Almost all of it is composition.** An individual ISLANDERS tree is a smooth solid of revolution
with no trunk, no branches, no leaf detail and one colour: less per-object detail than our shrubs
already carry. The richness comes from **how many objects there are, how they clump, and how much
bare ground is left between the clumps** — the s07 plateau at ~35% coverage next to an empty
plateau is the whole method in one frame.

**And the buildings say the same thing more strongly.** They are, by the artist's own account, "over
30 buildings", each meant to "combine a unique and recognizable shape with interesting gameplay
functionality" and to "make for a beautiful, harmonic image when organically put together to a city
ingame" — a composition-first constraint stated at the level of an individual asset. Asked what
governed their decisions, he answered: *"Every time we made a decision, we asked ourselves: Can we
make it simpler?"* (https://gameworldobserver.com/2019/06/14/islanders). And the blockiness itself
was not chosen as a style — *"The blockiness of our games. That definitely comes from prototyping."*

**This is the same diagnosis PR #1498 reached by counting object kinds, arrived at independently.**
That pass found four kinds of object against the references' eight to fifteen and fixed it with
props. The reference confirms the shape of the answer and adds the part PR #1498 could not see: the
objects must also CLUMP, and the ground between them must be left alone.

### 1.6 What it does NOT do — the properties we are declining

A reference is only a standard once you can say which of its properties you are refusing.

| it does | we do not, and why |
| --- | --- |
| **continuous per-pixel shading**, smooth ramps across every curved surface | ADR-0380 D6 fence 3: the palette stays closed and banded, or the render is a generic 3D render. **This is the 21x number in §2 and it is not available to us at any price.** |
| **atmospheric fog / depth haze**, tinting the whole frame into the scheme | a gradient is a colour on no authored entry. Refused by the same fence. It is a large part of why its frames are 88–100% chromatic. |
| **a free orbiting camera** | ADR-0380 D6 fence 4: 2.5D isometric at the declared 50-degree camera, which does not move. |
| **a full-screen frame** — one island fills 1680 of 1920 px | we deliver at 2 px per ground unit, 468 px of island. This is finding 2 and it is the constraint that drives everything in §3. |
| **a per-island procedural colour scheme** recolouring ground, water, sky and vegetation together | available in principle (ADR-0406 D1 unfences colour on this surface) and **deliberately not taken** — see §4e and the cost in §5. |
| **sky and water in frame**, carrying a third of the picture's colour | our islands are delivered on transparency, with no sea and no sky. Not a fence — nobody has asked for one. |

---

## 2. THE COMPARISON, on one instrument

Our islands, before this increment (PR #1498, hero tree) and after (this pass, canopy), against the
reference's median.

**Two instruments, and which column comes from which is stated rather than blurred.** Pixel count,
distinct colours and the luma quartet come from `capture-report.json`, which reads the WebGL canvas
directly with alpha — authoritative, and free of the background trap in §1.1. The remaining columns
have no counterpart in that report and come from the browser instrument, palette-masked, which is
the one that also ran over the reference. Where both can answer, they agree to the pixel on five of
six islands and to 0.6% on the sixth.

| | delivered px | colours | ≥0.1% | bins to 90% | luma p2 | p50 | p98 | spread | plateaus | chromatic | hue families |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **ISLANDERS, median of 7** | 1,491,840 | — | **212** | **474** | 55.0 | 127.3 | 190.0 | **136.0** | **34** | **97.2%** | **9** |
| `today` (control, unchanged) | 85,145 | 27 | 16 | 8 | 65.5 | 145.1 | 160.9 | 95.4 | 10 | 98.8% | 2 |
| `walled` — hero tree | 90,094 | 74 | 46 | 24 | 65.5 | 135.5 | 175.4 | 109.9 | 19 | 67.2% | 6 |
| `walled` — canopy | 84,627 | 74 | 46 | 24 | 78.4 | 139.7 | 175.4 | 97.0 | 17 | 61.3% | 7 |
| `hamlet` — hero tree | 88,706 | 76 | 42 | 22 | 65.5 | 132.7 | 174.7 | 109.2 | 17 | 93.3% | 5 |
| `hamlet` — canopy | 81,896 | 75 | 43 | 22 | 78.4 | 132.7 | 174.7 | 96.3 | 15 | 92.8% | 7 |
| `terrace` — hero tree | 80,433 | 68 | 50 | 26 | 88.8 | 145.1 | 175.4 | 86.6 | 16 | 79.8% | 6 |
| `terrace` — canopy | 80,726 | 71 | 52 | 28 | 78.4 | 138.4 | 175.4 | 97.0 | 18 | 80.2% | 8 |
| `shrine` — hero tree | 79,557 | 35 | 27 | 12 | 81.0 | 145.1 | 173.0 | 92.0 | 13 | 74.2% | 3 |
| `shrine` — canopy | 79,598 | 38 | 30 | 13 | **62.1** | 145.1 | 173.0 | **110.9** | 15 | 74.7% | 4 |
| `wild` — hero tree | 89,677 | 68 | 47 | 23 | 65.5 | 135.5 | 189.8 | 124.3 | 16 | 77.0% | 6 |
| `wild` — canopy | 83,202 | 67 | 46 | 22 | 76.4 | 135.5 | 189.8 | 113.4 | 14 | 74.0% | 5 |

Whole run: **12 canvases, 990,388 opaque pixels, 99 distinct delivered colours against 300 authored
entries, 0 off-palette, 0 foreign-status reads.**

**Read four things off it.**

**(a) THE COLOUR COUNT DID NOT MOVE, AND THAT IS THE RIGHT RESULT.** Replacing one tree with
thirty-three changed total distinct colours by −1 to +3, and `colours ≥0.1%` by the same. Three
canopy tokens is at most fifteen new closure entries and only a handful land on enough area to
count. **The canopy is a COMPOSITION change, not a palette change** — which is exactly what §1.5
says the reference's own richness is made of, and it means the 46-versus-212 gap is untouched by it.
Closing that is §5's worklist, not this increment's claim.

**(b) THE PICTURE'S DARK END MOVED, IN BOTH DIRECTIONS, AND THE TOKEN DECIDES WHICH.** Removing the
hero tree lifted luma p2 from 65.5 to 78.4 on three islands: the crown was the darkest thing in the
frame and the ordinary `canopy` token does not replace it. The shrine, which plants the deeper
`canopyDark`, went the other way — p2 **down** to 62.1, the darkest reading on the page, and its
delivered spread **up 21%** to 110.9, the only island whose range improved. That is a directly
actionable finding: a canopy restores the dark end only if its token is dark enough to, and only the
shrine's is.

**(c) HUE FAMILIES WENT UP ON FOUR OF FIVE** (walled 6→7, hamlet 5→7, terrace 6→8, shrine 3→4)
without a single ground colour changing, because the shade key rotates a canopy's shadowed rungs
into hues the island did not previously carry. Against the reference's median of 9 we are at 7.

**(d) THE 21x IS THE FENCE.** They need 327–782 colour bins to cover 90% of a frame; we need 13–28.
That is not a content gap and no amount of authoring closes it — a banded palette delivers a small
number of exact colours by definition. It is the price of ADR-0380 D6 fence 3, it is now a number,
and it is the honest answer to "why doesn't this look like the reference" for that one property.

---

## 3. MANY SMALL TREES — the substitution, and what it cost

The owner's direction, verbatim (2026-08-21):

> "these look okay, i think i'm confident now we ditch the middle tree, and instead opt for many
> small trees so it actually looks like a forrest/garden."

### 3.1 The arithmetic that decided the size

The hero tree is 75 x 88 ground units on a 233.8 x 135.1 island: **150 x 120 delivered pixels on a
468-px island, 32% of its width.** The reference's tree is 0.83%. Reproducing that ratio gives 1.9
ground units — **3.9 delivered pixels** — and PR #1498 measured that an isolated mark under ~10
delivered pixels stops being an object. **The reference's proportion is 2.5x below our own object
floor.** So the ratio does not transfer, and the question becomes what to give up: the count, or the
object. The object.

The floors this leaves, both enforced in `canopy-geometry.ts` and asserted in its test:

- **width ≥ 5 ground units** = 10 delivered px, the object floor exactly;
- **world aspect ≥ 2.0**, which at cos(50°) delivers 1.29 : 1. A plant delivers 15 x 12 — *wider*
  than tall — and reads as texture ON the ground; anything on the tall side of square reads as an
  object standing on it. **That single property is the answer to "is this the plant speckle under a
  new name", and it is why the floor is on the aspect rather than on the size.**

⚠ **HEIGHT FORESHORTENS AND WIDTH DOES NOT**, so a world aspect and a delivered one are different
numbers: delivered = world x cos(50°) = 0.643 x world. The reference's delivered 2.3 : 1 needs a
**world** aspect of 3.6, which is what a spire is authored at. Confusing the two authors a shrub,
and it is the same 2.75x class of error this arc has paid for twice.

### 3.2 What was actually planted

| dressing | trees | median w (units) | median h (units) | delivered | aspect | canopy area | % of land | % of island width |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| walled — the orchard | 33 | 7.3 | 19.0 | 14.5 x 24.5 px | 1.69 | 6,886 px² | 9.1% | 3.1% |
| hamlet — shelter | 32 | 8.4 | 20.6 | 16.8 x 26.5 px | 1.58 | 8,075 px² | 10.7% | 3.6% |
| terrace — margins | 33 | 6.9 | 27.5 | 13.7 x 35.3 px | 2.57 | 8,842 px² | 11.7% | 2.9% |
| shrine — avenue + grove | 19 | 8.4 | 35.3 | 16.8 x 45.3 px | 2.70 | 7,831 px² | 10.4% | 3.6% |
| wild — thickets | 58 | 7.5 | 22.3 | 14.9 x 28.7 px | 1.92 | 14,164 px² | 18.8% | 3.2% |

Canopy coverage of 9.1–18.8% sits inside the reference's own range (its sparse fields ~2%, its
packed plateau ~35%). Tree width at 2.9–3.6% of island width is **~4x the reference's ratio**, which
is finding 2 priced.

### 3.3 What the substitution bought, in frame

The single cleanest number this pass produced. The delivered canvas is sized to the scene's own
screen extent, so an object that stands up makes the whole frame taller:

Canvas dimensions from `capture-report.json`, which reads the canvas rather than the screenshot.

| | with the hero tree | with a canopy | |
| --- | --- | --- | --- |
| `walled` | 487 x **358** | 487 x **284** | −74 px |
| `hamlet` | 480 x **359** | 480 x **294** | −65 px |
| `wild` | 487 x **363** | 487 x **296** | −67 px |
| `terrace` (never had one) | 486 x **262** | 486 x **279** | **+17 px** |
| `shrine` (never had one) | 480 x **276** | 480 x **292** | **+16 px** |

PR #1498's own with/without pair isolates it exactly: **487 x 358 with the tree and 487 x 270
without — 88 px of frame height, 24.6% of the picture, existed to hold one tree.** A whole canopy
of thirty-odd costs **16 to 17 px**. The island is now about a fifth shorter in frame and carries
thirty-three trees instead of one.

And the same pair prices what removing it costs, which is not nothing: the hero tree accounted for
**66% of all the occlusion on the island** (15.7% of pixels occluded with it, 5.4% without) and took
the palette's dark end with it — luma p2 65.5 → 82.5. That is finding (b) in §2, and it is why
`canopyDark` matters.

### 3.4 How a tree differs from the speckle it must not become

Five properties, each measured rather than asserted:

1. **It is taller than it is wide** (delivered 1.58–2.70 : 1) where a plant is 0.8 : 1. §3.1.
2. **It clears the object floor** at 13.7–16.8 delivered px against a plant's ~15 — comparable in
   area, and that is the point: *size is not what separates them.*
3. **It casts.** Every tree contributes a contact pool at its CANOPY's radius. A shadow anchors an
   object to the ground and roughly doubles its footprint on screen; the plants do not cast.
4. **It CLUMPS.** Trees are placed by `grove`, not `scatter` — stands with bare ground between,
   which is §1.5's central transferable finding. The difference is asserted as two numbers in
   `prop-layout.test.ts`: a grove's mean nearest-neighbour distance is under 0.8x a uniform
   scatter's at the same count, and the 90th-percentile distance from open ground to the nearest
   tree is over 1.25x — closer together AND emptier between, which is what a stand is.
5. **A stand carries a RANGE of heights** (asserted > 1.6x tallest-to-shortest). A stand of equal
   trees delivers a hedge, because the silhouette's top edge is a line.

---

## 4. THE APPEARANCE CALLS, AND WHY — the ADR-0392 D2 / ADR-0398 D3 record

Every appearance decision this pass made, with its reason. An unrecorded art call is a violation of
D2, not an exercise of it. Long-form reasons live beside the code; this is the account.

### The five reasoned before anything was drawn

**(a) THE TREE IS A LATHE WITH NO TRUNK.** Straight from §1.3. A solid of revolution with a tapered
profile — widest at 0.30 of its height for a spire, 0.46 for a dome — coming to a point at the tip
and to a narrow but non-zero foot at the ground. Not zero at the foot: a tree tapering to nothing
where it meets the land reads as a spinning top balanced on its tip, and the reference's trees have
a visible footprint. At 0.18 of the smallest authored width that foot is one ground unit, which is
the aliasing floor and no less.

**(b) TWO SILHOUETTES, NOT FIVE.** The reference carries a spire and a dome and nothing else. A
grove of identical cones reads as a manufactured row, so one silhouette is too few; every silhouette
past two is one more thing to defend without a measurement behind it. They are authored to separate
**at delivered size** rather than only in the source — a spire delivers 2.19 : 1 and a dome 1.44 : 1
at the same requested aspect, asserted in the test, because two shapes that differ only under
magnification are one shape as far as the island is concerned. That is this arc's own inherited
lesson about the sprite path.

**(c) VARIATION IS SIZE, NEVER COLOUR.** §1.3. One canopy token per island, heights ranging better
than 1.6 : 1 within a stand. A grove of individually-tinted trees is confetti, and this is the half
of the finding easiest to get backwards.

**(d) THE SHADE KEY — the one new rendering lever, and it was CORRECTED by measuring.** §1.3's table
says a shaded face rotates. `bandedColour` is `token x level` and cannot rotate at all, so a token
may now declare a **shade key**: its delivered colour at level L is a linear mix from the key at
level 0.6 to the token itself at 1.0. One authored colour per token buys the hue rotation.

The correction is worth recording in full because the wrong version was defensible. The first pass
pointed the WARM canopy at the same cool teal as the greens, reasoning from the observation that the
autumn island's cliffs are teal. That is true of its cliffs and **false of its trees** — measured,
the rust spindle rotates −11 degrees and stays warm. Mixing a saturated orange toward a desaturated
teal passes straight through grey: the cool key delivered rung 0 at S29 against the token's S72, a
muddy brown that read as a dead tree. A dark warm brown key holds the hue (ΔH −0.5) and the chroma
(S65) while still dropping the value to 0.65x. **The key is per-scheme, not a universal teal.**

Delivered, against the reference's trees:

| token | lit | rung 0 | ΔH | V ratio | reference's own range |
| --- | --- | --- | --- | --- | --- |
| `canopy` | H103 S51 V57 | H141 S45 V37 | +38° | 0.65 | +22° to +61°, 0.59–0.61 |
| `canopyDark` | H123 S43 V42 | H158 S51 V29 | +35° | 0.69 | as above |
| `canopyRust` | H25 S72 V66 | H25 S65 V43 | −0.5° | 0.65 | −11°, 0.77 |

**(e) THE GROUND'S COLOUR IS STILL NOT TOUCHED — the restraint from PR #1498, re-taken knowingly and
now with a cost attached.** ADR-0406 D1 permits recolouring the ground on this surface, and §1.5
says the reference's coherence comes precisely from recolouring a whole island's scheme together.
It is still declined, for the reason PR #1498 gave: the ground's colour is the one thing on this
island that still resembles a signal on the product map, and a session that learned "the ground can
be any colour" from an experiment would be learning the one lesson that does not transfer.

**What that costs is now visible rather than argued.** The wild shore carries rust trees on spring-
green grass — autumn foliage on summer ground. It is the most distinctive island on the page and it
is scheme-incoherent, and both are consequences of the same restraint. §5 prices lifting it.

### The four made by LOOKING, after the first whole-island render

Separate from the five above because they were made differently: those were reasoned out before
anything was drawn; these were made by rendering whole islands at delivered size and seeing that
something did not work. ADR-0392 D2 does not distinguish, but the distinction is worth keeping
visible — in PR #1498 the after-looking half was the more valuable one, and it is again.

**(f) THE WALLED GARDEN'S TREES CAME OUT AS THE SPECKLE THIS INCREMENT EXISTS TO AVOID.** The first
version asked for aspect 3.0 with three-quarters domes. A dome is authored at 0.66 of the spire's
aspect: 3.0 x 0.66 = 1.98, which is **under the floor**, so the clamp fired and every dome came out
at exactly 2.0 world — 1.29 : 1 delivered, barely on the tall side of square, in a stand of mostly
domes. Rendered, the walled garden's trees read as bushes. At 3.4 with half domes, a dome delivers
1.44 : 1 and a spire 2.19 : 1 and the stand has a top edge rather than a line. **The arithmetic was
right and the picture was still wrong**, which is the whole argument for looking.

**(g) THE HEDGE RUN WAS REMOVED, AND ITS OWN STATED REASON IS WHY.** It was authored in PR #1498 as
*"a green mass with a silhouette, standing in for the plants the thinning removed"* — a stand-in for
vegetation the island did not have. It has vegetation now. At delivered size a 4-unit hedge and a
5-unit dome are the same object: rows of small dark-green blobs beside stands of small dark-green
blobs, and the walled garden came out the busiest and least legible island on the page. Removing the
stand-in is what lets the thing it stood in for be read.

**(h) THE TERRACES NEEDED MORE AND BIGGER TREES BECAUSE THE UAT DAISIES HAD TAKEN THE PICTURE.**
Removing the hero tree removed the darkest object on every island, and on the terraces — five thin
spires against six near-white UAT flowers — the brightest objects in the frame became the flowers,
which read as stars stuck onto the island. **The fix is the canopy, not the data.** Six stands of
larger spires took the delivered spread from 86.6 to 97.0 — the only island on the page whose range
IMPROVED under the substitution apart from the shrine — without touching a single flower.
Recorded rather than quietly fixed, because the flowers are the one thing on this island that is
still real data, and an art call that dimmed them would have been an art call deciding a semantic
question.

**(i) SEVEN STANDS TO PLANT FIVE.** The walled garden's path ring, court and rim inset reject most
of the plot, so five stands delivered eighteen trees at 5.0% canopy — the thinnest island on the
page, in the direction whose subject is cultivated ground. Raising the stand count changed nothing
until the stand SEPARATION came down with it (the default is three spreads, which fits five centres
on this island and no more); at seven stands 30 units apart it plants thirty-three at 9.1%. Asking
for more stands rather than for a smaller avoid-gap is deliberate: a tree nine units off a path is
what makes the path read as walked, and buying trees by crowding it would spend the thing this
direction is about.

### And where each dressing plants, which is a call in itself

A single scatter applied to all five would hand the five directions back the uniformity the owner
rejected two rounds ago. Where a place puts its trees is one of the loudest things it says about
what kind of place it is:

- **walled** — an ORCHARD: even stands in the quarters between the path ring and the wall, half
  domes, the smallest range on the page. A garden's trees are planted.
- **hamlet** — SHELTER: stands between the cottages and out toward the shore, off the worn routes,
  the widest size range on the page because a lived-in place accumulates trees of every age.
- **terrace** — MARGINS: nothing grows on a terrace being cropped, so the stands sit outside the
  retaining fronts. All spires and no domes — a narrow cypress against a worked hillside is what the
  reference's own ochre island does, and it is the one silhouette that reads against a horizontally
  banded slope.
- **shrine** — an AVENUE and a DARK GROVE, in `canopyDark`: the only planting on the page that is a
  composition rather than a habitat. Fewest trees, biggest each. This direction's thesis is
  subtraction and thirty scattered trees would refute it.
- **wild** — THICKETS: the most trees, the loosest and most overlapping stands, the only dressing
  where crowns are meant to merge into one mass, and the page's one warm canopy.

---

## 5. WHAT THIS DIRECTION COSTS — the arc's end-state item 4

The closed increment `the-owner-looks-at-the-five-dressed-islands-and-picks` deliberately left this
here, because the cost could not be priced before the style was named. It can now.

### 5.1 What the direction makes IRRELEVANT

- **Any further shadow-depth or occlusion-rung work.** The reference has one soft cast shadow per
  object and nothing else, and §1.4 shows its terrain reads as the same two tones our four-rung
  ladder already delivers. PR #1498 already found our island carried more rendering technique than
  the owner's simplest reference. **Not attempted is now: measured out.**
- **The sprite path, again.** Already priced out by the predecessor arc on delivery ceiling; nothing
  in the reference argues for revisiting it.
- **Per-object detail work of any kind on vegetation.** An ISLANDERS tree has less detail than our
  shrubs already have. Detail is not where its richness comes from, so refining a crown silhouette
  further spends effort on the one axis the reference proves does not pay.
- **The hero tree's crown-tuning backlog**, which is spent by the substitution rather than by a
  measurement.

### 5.2 What is NEWLY REQUIRED that nobody has built

1. **A PER-ISLAND COLOUR SCHEME.** The largest single unbuilt lever, and the one the reference is
   actually built on. Its islands recolour ground, water, vegetation and buildings TOGETHER, and its
   own artist's Superflight algorithm — the nearest documented mechanism, by the same author a year
   earlier — is exactly that: **four key colours generated per level and passed to the shaders**,
   with fragments "linearly interpolating between key colors", after James Gurney's *"pick a few key
   colors, and mix the rest of your palette by combining these"*
   (https://shahriyarshahrabi.medium.com/procedural-color-algorithm-a37739f6dc1). ⚠ **That article
   is about SUPERFLIGHT and never mentions ISLANDERS**; treating it as ISLANDERS' mechanism is an
   inference and is flagged as one. `SHADE_KEYS` is the first small piece of this shape.
   **Cost:** it wants the ground's colour, which on the product map is status. §5.3.
2. **A SHADE KEY ON THE STATUS FAMILIES.** Built for prop tokens; deliberately NOT extended to the
   land. See §5.3 — it is a semantic question, not an art call.
3. **A SECOND DARK MASS PER ISLAND.** Finding (b) in §2: the hero tree WAS the picture's dark end,
   and only `canopyDark` replaces it. Either every island plants a dark-enough canopy, or something
   else supplies the low end. Small, and now measurable.
4. **SKY AND WATER.** A third of every reference frame is sea and sky, carrying much of its colour
   and all of its depth cue. Our islands are delivered on transparency. Nobody has asked for a sea;
   if the direction is "it should look like ISLANDERS", the sea is on the list and it is not small.
5. **A COMPOSITIONAL DENSITY RULE FOR THE PRODUCT MAP.** `grove` clumps within one island. A map of
   many islands needs the same discipline at the next scale up, and nothing there does it today.

### 5.3 The cost that is a DECISION and not a task

**The direction's best remaining lever wants the ground's colour, and the ground's colour is status.**

`shadow-ladder-is-admissible-and-affordable` (PR #1461) measured that the four status colours are
separated mainly by BRIGHTNESS, that all six pairs overlap, and that 24,780 delivered pixels of
`unknown` ground already read as `healthy`. A shade key on the status families would rotate every
shadowed ground pixel's HUE — which could as easily FIX that confusion as deepen it, and either way
changes what the land's colour asserts.

**That is a semantic question and ADR-0392 D5 / ADR-0398 D7 put it beyond an art call.** It is
written down here, priced, and not decided. The same applies to the per-island scheme in 5.2.1: on
the experiment island ADR-0406 D1 permits it outright; on the product map it is the shipped half of
`oq-may-the-island-carry-things-that-mean-nothing-and-may-veg`, which stays open.

### 5.4 And the fence that will not move

The 21x in §2(d). A banded palette delivers a small number of exact colours; the reference's frames
are continuous. **No amount of authoring closes it, and that is the point of the fence** — ADR-0380
D6 fence 3 exists so nothing ships as a generic 3D render. It is now a number rather than a feeling,
which is what ADR-0392 D3's bar asks for: the lever is not unattempted, it is **priced out, by
decision, with the reason.**

---

## 6. THE SOURCE BASE — and how thin it is

**ISLANDERS' makers published almost no art-mechanism material, and a later session should not spend
a day rediscovering that.** Searched and found empty: Steam news hub (app 1046030), itch.io,
gamedesign.htw-berlin.de, gamedeveloper.com/Gamasutra, 80.lv, the Unity blog, Polycount, ArtStation,
PCGamingWiki, IGDB. No GDC or devcom talk. No art devlog. No frame teardown by anyone.

**Dev statements that DO exist and are used above:**

- https://allmenroeder.com/islanders — Friedemann Allmenröder's own page: the seven screenshots
  ("unedited except ingame UI was removed"), "Designing & coding the game's procedural
  color-scheme generator", "over 30 buildings", the harmonic-image constraint, "Unity, C#, Blender,
  Photoshop", the botanical-garden research trip.
- https://gameworldobserver.com/2019/06/14/islanders — *"Every time we made a decision, we asked
  ourselves: Can we make it simpler?"* and *"The blockiness of our games. That definitely comes from
  prototyping."*
- https://jonastyroller.myportfolio.com/islanders — the island generator: "First the basic shape is
  created. Then more and more detail is added."; a lumberjack scoring "10 points when it's placed,
  because there are 10 trees within its radius", which confirms trees are individually counted
  objects rather than clumps.
- https://shahriyarshahrabi.medium.com/procedural-color-algorithm-a37739f6dc1 — the SUPERFLIGHT
  colour algorithm, by the same studio, written by the same artist a year earlier. ⚠ **Never
  mentions ISLANDERS.** Used in §5.2.1 as an inference, labelled as one.

**NOT FOUND, from dev sources:** tree modelling or placement, lighting and shading technique, shadow
or AO method, post-processing, camera projection or FOV, polygon budgets, texture-versus-vertex-
colour. Anyone claiming otherwise is inferring from screenshots — which is exactly what §1 does, and
says so.

⚠ **Two conflations to refuse.** Search engines paraphrase Allmenröder's "100s of harmonious
colorschemes" — which is on his **SUPERFLIGHT** page — as ISLANDERS', sometimes inflated to
"1000s". And Steam's "6 biomes x 4 colour variations" belongs to **ISLANDERS: New Shores** (2025,
Coatsink/Stage Clear), a different team. Neither is a fact about the game the owner named.

**Video leads not extracted.** YouTube served zero caption bytes for every relevant video on this
host — `timedtext` returns 404 server-side and 200-with-no-body in-browser, and the in-page
transcript panel opens with 0 segments. Three are worth a human watch if this comes up again:
`O9J_Cfl6HzE` (Tyroller, "How to Randomly Generate Levels (and Islands)" — the highest-value
untapped target), `Om3MWE7-QIU` (Allmenröder, "Minimalism In Game Development"), and `xUc1La6auNs`
("How We Made ISLANDERS"). Extracting them needs `yt-dlp`, which was not installed for this pass.

---

## 7. What this does NOT cost — the fences, one by one

**ADR-0380 D6's four fences.** Accessibility stays in the DOM/SVG layer (this is a dev-only harness
page reaching no product surface). Determinism stays on the scene graph: every canopy is a pure
function of the ground cells, the relief and a seed, with no clock and no random source, asserted
byte-identical across builds. The projection does not move. **The palette holds, and the shade key
is inside it rather than around it** — see below.

**THE SHADE KEY DOES NOT MOVE FENCE 3, AND THIS IS THE ARGUMENT.** The property the fence carries is
that every delivered pixel is an enumerable AUTHORED closure entry, which is what lets `capture.mjs`
REFUSE rather than merely report. A keyed token still delivers exactly one colour per ladder rung;
`tokenRamp` and `shadowRamp` still enumerate them; `landPalette` still closes over them. What
changed is how an entry is COMPUTED, not whether the set is closed — the closure went 228 → 240 lit
and 285 → 300 shadowed, and the shadow still costs exactly one entry per land token, which is the
identity `shadow-ladder.test.ts` asserts rather than the literals. `prop-tokens.test.ts` pins the
mix to exactly two authored colours at an authored level, pins the ramp monotone in luminance, and
pins every unkeyed token to the pixel it delivered before. **Measured: 0 off-palette pixels across
12 canvases.**

**AND NO STATUS TOKEN MAY EVER BE KEYED** — asserted, not promised. §5.3.

**AN ART MODULE NEVER READS WHAT A PARCEL MEANS.** The canopy is placed by geometry — which parcel
is biggest, which point is furthest from a path — never by status, and `island-dressing.test.ts`
proves it by building the same dressing on two scenes differing only in one capability's status.

**THE CONTROL ISLAND IS UNCHANGED, AND IT IS ASSERTED RATHER THAN CLAIMED — TWO WAYS, BECAUSE THE
FIRST INSTRUMENT USED FOR THIS TURNED OUT TO BE UNSOUND.**

1. **The canvas record is identical, field for field.** `capture-report.json`'s entry for `today`
   and for `row-today` reads `480 x 359, 85,145 opaque, 27 distinct colours, 0 occluded, luma p2
   65.5 / p50 145.1 / p98 160.9, spread 95.4` in **both** rounds. That instrument reads the WebGL
   canvas directly, with alpha, so no page background can reach it.
2. **The delivered pixels are identical, checked one by one.** Masking both PNGs by palette
   membership and comparing gives **85,145 island pixels in each and ZERO differing**.

So an undressed island renders exactly the pixels it rendered before the shade key existed. Every
difference on this page is content, and none of it is a rendering change wearing content's clothes.

⚠ **THE BYTE-IDENTITY INSTRUMENT PR #1498 USED FOR THIS CLAIM DOES NOT WORK, AND IT SAID SO LOUDLY
HERE — see traps 2 and 3.** `island-row-today.png` is NOT byte-identical across the two rounds. It
is confounded twice over by page layout: the checkerboard's phase moves under the canvas, and a
359-px-tall canvas inside a 360-px screenshot lands one row higher or lower. Compared at a
one-row offset, the two files agree on every single island pixel. Read that as the instrument
failing, not the render — the two measurements above are what settle it.

**Nothing here is adopted.** All of it lives in `packages/forest-world-r3f/harness/`, which
`sync:web-engine` does not copy (`scope-fence.test.ts`), and ADR-0380 D6 already makes adopting the
live-render experiment a separate event from running it.

---

## 8. Traps carried forward

Traps 1–11 of `chapter2-island-props-2026-08-21` still hold and are not repeated. New this pass:

1. **`capture.mjs` NOW EXITS NON-ZERO ON AN OFF-PALETTE PIXEL — the trap from PR #1498 is FIXED,
   not documented.** It used to print `PALETTE BREACHED` and exit 0, so the one property the script
   exists to prove was the only failure its exit code did not cover, and three READMEs in a row
   carried a paragraph telling readers not to trust it. The refusal comes LAST, after the pictures
   and the report are written, so a breach still leaves the evidence on disk to diagnose from.
2. ⚠ **A PLAYWRIGHT ELEMENT SCREENSHOT COMPOSITES THE PAGE BACKGROUND IN, AND THE HARNESS'S
   BACKGROUND IS A CHECKERBOARD.** Every `island-*.png` here has an OPAQUE background. Any
   measurement over these files must mask it, and masking the two CSS colours by value is not
   enough — the pattern is four 45-degree gradients and a 45-degree hard stop antialiases, so its
   diagonals deliver blend greys that are neither value. Mask by **palette membership**. This
   silently produced a wrong headline finding in this pass's first run (§1.1).
3. ⚠ **NEVER BYTE-COMPARE `island-*.png` ACROSS ROUNDS. PR #1498 DID, AND IT WORKED BY LUCK.** Two
   independent page-layout effects move every byte in the file without moving one island pixel.
   **(a)** the checkerboard's phase is page-relative, so editing prose anywhere above a canvas
   re-phases the background under it — one section removed changed 30,125 pixels of
   `island-today.png`; **(b)** the canvas is **359 px tall inside a 360 px screenshot**, so its
   sub-pixel placement puts it one row higher or lower depending on what precedes it — which alone
   makes 15,113 masked pixels "differ" while the island is bit-for-bit the same. Compared at a
   one-row offset the two rounds agree on **all 85,145** island pixels, exactly. The sound
   instruments are `capture-report.json`'s per-canvas record and a palette-masked pixel comparison
   with alignment search; a byte diff is neither.
4. **A LATHE IS NARROWER THAN THE CIRCLE IT IS INSCRIBED IN.** At nine segments the x-extent is
   1.9397 r, so an authored width of 5 delivered 4.85 and a tree sitting exactly on the 10-pixel
   object floor came out at 9.7. Three per cent, invisible, and on the wrong side of the floor.
   `canopy-geometry.ts` compensates, deriving the factor from the same angles `addLathe` sweeps.
5. **EVENLY-SPACED PROFILE RINGS MISS A PEAK THAT DOES NOT LAND ON ONE.** The dome's widest point is
   at 0.46 and the nearest ring was at 0.4, so a tree asked for 8 units came out 7.40 — the profile
   was right and the SAMPLING lost 7% of it. The peak is now in the ring set explicitly.
6. **A SPIRE CANNOT REACH THE LADDER'S TOP RUNG, AND THAT IS ARITHMETIC.** `rungOfNormal`
   half-lambertises before snapping, so rung 3 needs a normal within ~26 degrees of the light. A
   spire's surface is steep almost everywhere and its steepest-lit normal reaches dot 0.77 — rung 2.
   **The ladder is effectively three rungs deep for a spire and four for a dome.** Asserted in
   `canopy-geometry.test.ts` so a later widening of the profile cannot slip past unnoticed.
7. **`grove`'s STAND SEPARATION silently caps the stand count.** It defaults to three spreads;
   raising `clusters` above what that allows changes nothing at all, with no warning. It cost a
   round of "why is the orchard still eighteen trees" (§4i).
8. **`parcelSummaries` returns `parcel`, not `capId`,** and `parcelLoop` THROWS for a parcel that is
   not one simple loop — two of the eleven are not. Reuse the fronts a dressing already built rather
   than recomputing them.
