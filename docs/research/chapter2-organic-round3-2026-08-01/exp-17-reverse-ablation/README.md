# exp-17 — Reverse ablation: author the sequence backwards by removing the periphery

Chapter 2 organic-growth arc, round 3, 2026-08-01. Hero tree only — the island is Experiment 6's
connected SVG accretion (unchanged, not re-litigated) and plants stay on the ADR-0277 D2 cutout
track. Everything below is about the one open question: **does the trunk and the canopy read as ONE
CONNECTED ORGANISM while the tree grows?**

---

## 1. The question this experiment attacks

Every recorded failure on this arc is the same failure. A crown authored separately from a trunk
reads as a seam, a gap, a floating blob or a pasted-on cap, and mechanical registration has already
been proven insufficient (ADR-0277 rejected the occlusion-registered canopy after a focused fix).

All ten prior experiments share one hidden assumption: **they author growth FORWARD.** Forward
authoring forces the model to invent structure that does not exist yet at every step, and inventing
structure is precisely where topology mutation, silhouette snap and detached crowns come from.

This experiment inverts it. Generate the MATURE tree once, well, and derive every earlier stage by
**taking away**.

## 2. The technique in two sentences

Generate one mature hero tree, then compute a *growth-age field* over its own pixels — the chamfer
geodesic distance from the root collar, measured **through the tree's own body**, so a pixel's age is
how far the plant had to grow along itself to reach it — and define stage *k* as the sub-silhouette
within a growth radius, with the foliage front measured separately as depth outward from whatever
branches that stage still has.

Every rung is therefore a strict pixel-subset of the mature pose in the SAME canvas coordinates:
the trunk, the fork positions, the root flare, the palette and the shading are byte-identical down
the whole ladder by construction, and the ladder is authored mature → seedling and **reversed for
playback**.

## 3. What "periphery" means here (the one refinement that made it work)

The brief's instruction was "mask the outermost periphery". Two naive readings both fail, and I
measured both before settling:

| definition of "outermost" | what it does | verdict |
|---|---|---|
| euclidean distance from the centroid | ignores the body — cuts across branches mid-air | never tried, obviously wrong |
| geodesic distance from the whole bottom edge | roots exist at age 0, so stage 0 is a detached spider of buttress roots | measured, `figures/03` earlier draft |
| **geodesic distance from the root COLLAR (delivered)** | roots grow outward from the collar too | correct |

And within the crown, a single geodesic threshold cuts the canopy with a **horizontal guillotine**
(the crown's top is uniformly far from the root, so its iso-surface is flat — see
`figures/03-guillotine-pure-geodesic.png`, rungs 4–7: a razor-flat table top). The fix, at zero
generation cost, is to measure foliage on a second axis:

```
keep_wood(k) = wood  ∩  { age ≤ r_k }                       # branches extend from the collar
keep_leaf(k) = leaf  ∩  { crownDepth_k ≤ ρ_k }              # foliage thickens outward from
                                                            #   whatever branches rung k has
```

`crownDepth_k` is a geodesic distance measured *through the crown from the retained branches*, so the
leaf front is always a rounded lobed envelope hugging the armature. It cannot detach (distance is
only defined where the crown is connected to retained wood) and it cannot be cut by a horizontal
line (it is not a level set of height). `figures/04-crown-sheath-fix.png` is the same eight radii
after the fix — the guillotine is gone.

Implementation: `work/field.py` (age field), `work/sheath.py` (the two-axis operator),
`work/build_stages.py` (the nine rungs), `work/final.py` / `work/compose2.py` (composition),
`work/verify2.py` (the measurements below). Pure numpy + PIL, deterministic, no vendor call.

## 4. The measured result

Canvas **192×192 RGBA8**, fixed. **9 frames**, `frames/frame-00.png … frame-08.png`, delivered
seedling → mature. Root anchor rule: alpha-weighted x across the bottom three occupied rows,
bottom-most occupied y (the round-1 rule).

```
 f  opaque  ablated   gen  differ   lost  lost%   bounds x,y,w,h      anchor   bytes
 0    1432      989   443       0      0    0.0   70,129,52,50        98,178    2789
 1    2921     1956   965       0     89    6.2   59,88,77,91         98,178    4516
 2    4354     2563  1791       0    186    6.4   55,70,81,109        98,178    6642
 3    5480     5480     0       0    512   11.8   34,64,122,115       98,178    8037
 4    6842     6842     0       0      0    0.0   28,59,139,120       98,178    9004
 5    8634     8634     0       0      0    0.0   20,49,152,130       98,178    9711
 6    9959     9959     0       0      0    0.0   20,35,152,144       98,178   10457
 7   11420    11420     0       0      0    0.0   20,22,152,157       98,178   11109
 8   11891    11891     0       0      0    0.0   20,13,152,166       98,178   11325
```

* `ablated` — pixels taken from the mature pose. `gen` — pixels a model drew.
* `differ` — ablated pixels whose RGB differs from the mature pose at the same coordinate.
* `lost` — pixels present in the previous frame and absent here (a monotonicity break).

**Headline numbers**

| measurement | value |
|---|---|
| root-anchor drift, x and y, across all 9 frames | **0 px / 0 px** (single anchor `(98,178)`) |
| ablated pixels differing from the mature pose | **0 of 59 734** |
| track composition | **94.9 % ablated mature pixels, 5.1 % model-drawn** |
| colours in the track absent from the mature palette | **0** (all 25) |
| pixels lost between consecutive frames | **787 total**, all in the three model rungs |
| canvas / frame count | 192×192 fixed, 9 |
| encoded PNG bytes (9 frames) | **73 590** |
| decoded RGBA bytes | 1 327 104 |
| `contact-sheet.png` / `preview.gif` | 52 402 B / 121 743 B |

For reference the round-1 leader track is 144 006 encoded bytes for the same 9 frames at the same
canvas; this track is **49 % smaller** because every frame is a crop of one palette.

## 5. Honest self-assessment against §1's failure list

| failure mode | verdict | evidence |
|---|---|---|
| **seam** between trunk and canopy | **absent, structurally** | the canopy is the mature tree's own canopy pixels sitting on the mature tree's own branch pixels; there is no boundary to seam |
| **gap** canopy↔trunk (exp-2's "buggy" read) | **absent, structurally** | `crownDepth` is only defined on crown pixels connected to retained wood, so foliage cannot exist detached from a branch |
| **floating crown** (the ADR-0277 rejection) | **absent** — measured: every rung is one 8-connected component | `work/build_stages.py` takes the collar-connected component; rungs 3–8 need it zero times |
| **blob** canopy | **partly present at rungs 3–4** — the crown there is a wide flat parasol rather than a lobed dome; individual clusters only separate from rung 5 | `figures/10`, middle row |
| **pasted-on** | absent | nothing is pasted; the young crowns are drawn *into* the empty space between existing branches |
| **silhouette snap** | **mild at rung 2→3**: the crown goes from a compact lump to a wide crust in one step (width 81→122 px) | `contact-sheet.png` |
| **style pop** | **absent in the ablated 94.9 %**; **mild in the 5.1 %** — see below | measured luma table below |
| **topology mutation** | **absent in rungs 3–8** (strict subset, 0 px lost); **present at 3 steps in rungs 0–2** | table above |
| **root wander** | **absent — 0 px, measured, not claimed** | anchor column above |

### The two faults I would not let past a reviewer

**(a) 512 pixels — 11.8 % of rung 2 — vanish at the 2→3 handover.**
`figures/08-pixels-lost-rung2-to-3.png` marks them in red: they are the *underside* of the
model-drawn young crown, the foliage that hangs down between the branches. The mature tree has no
foliage below its branch line, so ablation can never supply those pixels and they must die. In real
botany lower branches do get shaded out, but on screen it is content disappearing, and content
disappearing is exactly the "buggy" read this arc keeps getting rejected for. The equivalent breaks
at 0→1 and 1→2 are 89 px (6.2 %) and 186 px (6.4 %). **Rungs 3–8 are exactly 0.**

**(b) The young crowns at rungs 0–2 are smoother than the ablated ones.**
The model draws a two-or-three-lobe dome; the mature crown is nine overlapping modelled clusters.
Foliage mean luma per rung after the tone-match (below) is close, and 0 out-of-palette colours were
introduced, but the *shading structure* is simpler and you can see it at 4×.

```
frame  0     1     2     3     4     5     6     7     8
luma  74.2  74.5  77.8  69.0  75.9  81.2  82.5  85.6  85.9     (mean, foliage pixels only)
```

### Do the trunk and canopy read as one organism?

**Yes, for rungs 3–8 — and that is the part of the ladder that is 100 % ablation.** In those six
frames the branches visibly enter the canopy, the canopy grows outward along them, and nothing about
the image can come apart because it is one crop of one drawing. That is a real answer to the arc's
open question, and it is the first technique on this arc where the connection is *structural* rather
than *registered*.

**Rungs 0–2 are the honest weak half.** Reverse ablation cannot manufacture juvenile foliage,
because juvenile foliage does not exist anywhere in the mature pose — the mature tree's lowest leaf
is 86 px of growth-age away from the collar, so any rung below that is bare wood. I bought those
three rungs with the model, and every defect in the track lives in them.

## 6. Rungs 0–2: what I tried, and the variant that is structurally perfect but looks worse

Three ways to fill the young rungs were built and looked at:

1. **Pure ablation (nothing generated).** `figures/09-pure-ablation-track.png` and the bottom row of
   `figures/07`. 100 % mature pixels, 0 lost pixels anywhere, 0 anchor drift — *structurally
   flawless*. It is also **bare wood for the first two frames**, which reads as a dead stick being
   planted. Rejected on look, not on numbers.
2. **Model pixels, composited.** What is delivered. `work/compose2.py` enforces a hard freeze (the
   model's output is accepted only inside the mask AND only where the rung was empty, so the
   vendor's "outside the mask is preserved" promise is *enforced, not trusted* — measured: 0 frozen
   pixels changed on every call) and a **tone-matched palette snap** (the generated region's luma
   *ranking* is mapped onto the mature crown's own luma *distribution*, so shading structure survives
   and tonal statistics become the mature tree's; measured: 0 out-of-palette colours).
3. **Model as a silhouette oracle only** — keep the model's shape decision, intersect it with the
   mature silhouette, and paint every pixel from the mature pose. This is the most beautiful version
   on paper: 100 % inherited pixels, 0 lost, 0 drift (`work/final.py`, verified). It **fails
   visually**, because the young crown lives *below* the mature crown, so intersecting with the
   mature silhouette deletes it — rungs 0 and 1 come back bare. Kept in `work/track-pure/`.

That trade — visually alive vs structurally pure — is the real finding of this experiment, and it is
not a tuning problem. It is the boundary of what removal can do.

## 7. Provenance — every call, prompt, seed, job id and cost

PixelLab, author-time only (ADR-0274 D2 / ADR-0219). No vendor call, credential, hostname or model
call touches the repo, a build artifact or the browser. The token lives only in the scratchpad env
file and appears nowhere here. Seed block **31700+**, as assigned.

### 7.1 Mature pose — `create_image_pixflux`, 192×192, `no_background: true`, `view: "low top-down"`, `outline: "selective outline"`, `shading: "medium shading"`, `detail: "highly detailed"`

| # | seed | job id | cost | outcome |
|---|---|---|---|---|
| a | 31700 | `c9940aca-c010-491a-bcd1-1a599d37b206` | 1 gen | **REJECT** — a green grass ellipse is drawn under the roots (a ground tile; ADR-0274 D1/D6 forbid it) |
| b | 31701 | `d6aec8de-0941-4ec5-9789-af54e22aa0db` | 1 gen | **SELECTED** — `color_image_base64` = the round-1 mature tree pose (`chapter2-organic-pose-to-pose/tree/frame-08.png`), forcing the already-accepted palette |
| c | 31702 | `f5f55abf-d068-4f2f-a5e5-96166abce083` | 1 gen | **REJECT** — beautiful branch armature but far too sparse for a mature hero pose, and its heavy single-colour outline reads side-on, not low top-down |

Candidate sheet: `figures/01-mature-candidates.png`. Raw returns in `raw/mature-*.png`.

Prompt a and b (identical text; b adds the forced palette), verbatim:

> A single broad hero shade tree seen from a low top-down camera. One sturdy fluted brown trunk with
> flaring surface roots at the bottom centre, dividing into clearly visible bare branches that reach
> outward and upward; each branch tip carries its own SEPARATE rounded cluster of moss-green and
> olive leaves, with open gaps of empty space between the clusters so the whole branch armature stays
> readable. Whole tree only: roots at the bottom edge, crown filling the top. Transparent background,
> no ground, no soil, no grass, no island, no shadow platform, no frame, no border, no second tree,
> no text.

Prompt c, verbatim:

> One mature woodland tree, low top-down 2.5D game camera. Slender-to-medium trunk of several merged
> stems braided together, flaring into a few short surface roots exactly at the bottom centre. Above
> the fork the trunk breaks into a sparse open armature of bare brown limbs and thin twigs; leaves
> grow only as small distinct tufts at the far ends of the twigs, deep moss green and olive with a
> pale lime rim light. Airy silhouette with plenty of transparent holes through the crown. Single
> subject, transparent background, no ground plane, no soil, no grass blades, no rocks, no island, no
> drop shadow, no border, no vignette, no duplicate tree.

### 7.2 Young-rung foliage — `inpaint_image`, ~20 generations each, `crop_to_mask: true`

| seed | job id | mask | outcome |
|---|---|---|---|
| 31703 | `1edc9efa-751d-42eb-a20c-945d7b117dc4` | rectangle 92×40 at (52,84) | **REJECT** — a rectangular slab of canopy, sliced flat on all four sides at the mask boundary (`figures/05-reject-rectangular-mask.png`). This is what taught me the mask shape *is* the canopy shape. |
| 31704 | `69dd92bc-2bbc-47d2-8d69-6c4a3fa1f0a8` | dome, *including* the retained body | **REJECT** — a good crown, but it painted over the existing branches, so the retained wood was no longer frozen and the branches reappeared at the next rung. Superseded by punching the retained body out of every mask. |
| 31705 | `be76d7ee-7036-4a28-8e96-180f42a30beb` | `dome-00` | **REJECT** — the model extended the WOOD upward instead of adding leaves (443 px, 63 of them bark-coloured); a taller bare stump. |
| 31709 | `c7fb6887-99ba-44f9-bc4e-62fefa3dac96` | `dome-00b` (dome + a narrow shoot corridor) | **REJECT** — a single thin green spike, reading as a blade of grass in a stump. The corridor invited a stem, not a crown. |
| 31710 | `a32d216b-29e4-42b1-8aa4-44f7d989cc5b` | `dome-00c` (tight dome sitting on the stem top, no corridor) | **USED — rung 0.** 443 px accepted, 439 foliage, 4 wood. |
| 31706 | `eb6f19f2-e431-4cb4-b469-8c99158ea76b` | `dome-01` | **USED — rung 1.** 965 px accepted, 878 foliage. |
| 31707 | `187166b5-7742-4883-b0c6-86dddc4db5be` | `dome-02` | **USED — rung 2.** 1791 px accepted, 1785 foliage. |
| 31708 | `cc089370-639c-4867-902e-9fab17e0ac1b` | `dome-03` | **REJECT** — the generated dome is markedly smoother than the ablated crown's cluster modelling, and it left two rust-coloured flecks at the crown shoulders that read as damage (`figures/11-reject-generated-dome-flecks.png`). Rung 3 ships as pure ablation instead. |

Masks: `work/dome-0*.png`, built by `work/mkdomes.py` / `work/domemask.py`; visualised in
`figures/06-dome-masks.png`. Every mask is `crownDome ∧ ¬retainedBody`, so the model only ever sees
empty canvas to fill.

Prompts, verbatim (used rungs first):

*rung 0 — seed 31710:*
> A tiny round bush of LEAVES capping this little stump - one small rounded tuft of moss green, olive
> and pale lime foliage with a dark green rim, sitting straight on the wood with no gap. Foliage only:
> draw absolutely no bark, no trunk, no branch, no stem, no wood of any kind, no blade of grass. Soft
> lobed leaf outline, empty transparent space beyond it. No rectangle, no straight edges, no soil, no
> ground, no shadow, no second tree, no text.

*rung 1 — seed 31706:*
> A small young crown for this sapling: two or three small rounded tufts of leaves resting on the top
> of the stem, in the same moss green, olive and pale lime as the storybook pixel-art shade tree in
> this picture, every tuft rimmed in dark green, growing straight onto the bare wood that is already
> there so there is no gap between leaf and branch. Soft lobed outline, empty transparent space beyond
> it. No rectangle, no straight edges, no flat sawn ends, no soil, no ground, no grass, no shadow, no
> extra trunk, no second tree, no text.

*rung 2 — seed 31707:* identical to rung 1 except the opening clause:
> A young crown for this small tree: four or five overlapping rounded tufts of leaves spread across
> the tips of the bare branches, …

*rejected, rung 0 — seed 31705:* "A first small sprout of leaves on top of this seedling: one little
rounded tuft of five or six leaves capping the young stem, …" (same tail).
*rejected, rung 0 — seed 31709:* "One slender young shoot rising from the top of this stump and
opening into a single small rounded tuft of LEAVES. The tuft must be GREEN foliage only — moss green,
olive and pale lime with a dark green rim, exactly the greens of a storybook pixel-art shade tree.
Draw no extra bark, no extra trunk, no thick branch, no wood beyond the one thin shoot. …"
*rejected, rung 3 — seed 31708:* "Extend this young canopy upward and outward into a rounded dome of
six or seven overlapping rounded leaf clusters that continue the leaf clusters already drawn below
them, …" (same tail).
*rejected, rectangular mask — seed 31703:* "The leafy top of a young sapling: three or four small
rounded tufts of moss-green and olive leaves budding directly onto the bare branch tips that are
already there, each tuft with a dark green rim, sitting exactly on the wood. Empty transparent space
everywhere else. No flat sawn-off ends, no soil, no ground, no grass, no extra trunk, no second tree."
*rejected, dome-over-body — seed 31704:* "A small rounded young crown growing straight out of the bare
branch tips that are already in the picture: … The crown must be a soft lobed dome, wider than tall,
fading to empty transparent space at its edge. …"

### 7.3 Generation accounting

| item | generations |
|---|---|
| 3 × `create_image_pixflux` @ 1 | 3 |
| 8 × `inpaint_image` @ ~20 (ids above) | ~160 |
| up to 3 duplicate `inpaint_image` submissions whose job ids were **lost** — a shell pipeline swallowed the tool's stdout, and I re-fired the same args files (same seeds 31705 / 31706 / 31708) rather than leave the rungs unbuilt | ~60 |
| **total, this experiment** | **~223** |

The lost submissions are byte-identical duplicates of `be76d7ee` / `eb6f19f2` / `cc089370` (same args
file, same seed), so nothing unrecorded reached the deliverable — but ~60 generations were wasted and
I am recording that rather than hiding it. Account state at the end of the run: 128 of 2000
generations remaining (shared with the other round-3 experiments).

### 7.4 Ladder parameters (the whole deterministic half)

`work/build_stages.py`, `PLAN = [(r_k, ρ_k)]` in growth pixels:

```
rung   0      1      2      3      4       5       6       7       8
r      30     62     80     98     106     113     121     130     ∞
ρ      0      3      6      14     18      23      27      32      ∞
```

Growth-age field: chamfer 3-4 geodesic, collar seed = the mature pose's bottom 3 occupied rows within
±4 px of the alpha-weighted base centre (x = 98). Field range 0 → 164.7 px; the mature crown's
lowest foliage sits at age 86.0 px. Silhouette threshold α ≥ 8 (the mature return is fully binary —
11 891 pixels at α = 255, 0 partial). Connectivity is bridged by a 1-px dilation before the distance
pass, then read back on the true mask, so 1-px anti-alias gaps do not orphan a cluster: 11 891 of
11 891 pixels reachable, 0 orphans. Each rung is closed with a radius-1 morphological closing
intersected with the mature mask (pure removal — the filled pixels are the mature sprite's own) to
kill hairline slivers where the front cut along a cluster rim.

## 8. Constraint conformance (ADR-0274 / 0277 / 0219 / 0237)

* Fixed transparent canvas 192×192 RGBA8, fixed frame count 9, fixed order. ✔
* One stable root/ground socket, author-time normalised: **anchor (98,178) on every frame, 0 px
  drift**, and no per-frame offset was applied — the frames were never translated, so there is
  nothing to normalise. ✔
* Author-time crop + anchor normalisation, declared depth slot: the track occupies the same depth
  slot as the round-1 hero tree; it is a drop-in replacement at the same canvas and anchor rule. ✔
* Recorded prompt / model / seed / job id provenance. ✔ §7
* Byte and decode budget: 73 590 encoded / 1 327 104 decoded, against the round-1 track's 144 006 /
  1 327 104 and the manifest's 200 000 / 1 600 000 ceilings. ✔
* No vendor call, credential, hostname or asset-owned clock anywhere near the repo or the browser;
  the deliverable is nine PNGs. ✔
* Camera: matched to the reference plate's low top-down 2.5D by the `view: "low top-down"` parameter
  and by eye against `svg-island-reference-plate.png`. The tree is drawn slightly more elevation-on
  than the island plate's very flat top-down — same fault the round-1 leader has, not corrected here.
* No island, land, coast or composite was generated. ✔
* Nothing outside this directory was written.

## 9. What I would do next

1. **Fix fault (a) properly by choosing a different mature pose.** The 2→3 break exists because the
   selected mature tree's crown floats above its branch line with nothing beneath. A mature pose whose
   foliage descends *between* the branches — candidate `c`'s armature with candidate `b`'s density —
   would let the sheath supply under-branch leaves at every rung, and rungs 0–2 could then be pure
   ablation with real foliage. That single change plausibly takes the track to **100 % ablated,
   0 pixels lost, 0 drift** with no bare frames. It is one `create_image_pro` call away (4 candidates,
   20–40 gens) and it is the first thing I would spend on.
2. **Reverse-ablate the round-1 leader instead of a new tree.** The owner already called that pose
   "probably the most" liked. The whole pipeline here is pose-agnostic — point `work/field.py` at
   `chapter2-organic-pose-to-pose/tree/frame-08.png` and it produces a 9-rung ladder off the
   already-approved art, at zero generation cost. That is the cheapest way to put this technique in
   front of the owner without also asking them to re-judge a new tree.
3. **Reuse the ladder for the plant track.** ADR-0277 D2 retains the cutout technique for small
   plants, but reverse ablation would give the plants the same zero-drift guarantee for free.
4. **Let the app hold the ladder as a single sprite sheet plus nine masks.** Since every rung is a
   subset of one image, the runtime cost could be one decode and nine 1-bit masks instead of nine
   RGBA decodes — 1.3 MB of decoded RGBA down to ~150 kB. Worth an ADR if the technique is adopted.
5. **Ask the owner whether bare early frames are acceptable.** If they are, `work/track-pure/` ships
   today with a perfect scorecard and no model in the loop below the mature pose at all.

## 10. Files

```
raw/            11 unmodified model returns, named <role>-<jobid>-00.png
frames/         frame-00 … frame-08.png — the delivered track, seedling → mature
contact-sheet.png   all 9 frames on a checkerboard, 2×
preview.gif         3× nearest-neighbour dark-field animation, 340 ms/frame
registration.json   the full per-frame measurement table (written by work/verify2.py)
figures/        11 numbered evidence figures referenced above
work/           the deterministic pipeline + every probe sheet I looked at
path-growth.md  the path-growth treatment
```
