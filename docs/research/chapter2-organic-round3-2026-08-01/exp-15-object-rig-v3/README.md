# exp-15 — object rig + v3 interpolation (PixelLab's highest-fidelity motion path)

**Round 3, chapter 2 organic growth. Author-time only — no vendor call, credential, hostname or
model call enters the repo, a build artifact or the browser (ADR-0274 D2 / ADR-0219).**

## The question

Every recorded hero-tree failure on this arc is the same failure: a crown authored separately from a
trunk reads as a seam, gap, blob, floating canopy or pasted-on crown, and *mechanical registration
has been proven insufficient* (ADR-0277). So: **can continuity come from how the art is GENERATED?**

## The technique, in two sentences

The tree is created as a real PixelLab **object** (`create_1_direction_object`, view `top-down`,
`style_images` = the app's own island plate), reviewed as a 4-candidate pack and promoted with
`select_object_frames`; the sapling and the ground-free mature pose are then both produced as
`create_object_state` **variants of that one object**, so trunk and crown are never authored
separately at any point in the pipeline. The growth track is `animate_object` in `mode: 'v3'`
**interpolation** (`custom_start_frame_base64` = the sapling pose, `end_frame_base64` = the mature
pose, `frame_count: 16`), run three times — once end to end, then twice more across the two
*measured* snaps in the first pass — and spliced into one 16-frame track.

## Result at a glance

| | |
|---|---|
| usable track | **yes** |
| frames / canvas | **16 @ 192×192 RGBA**, root anchor (96, 188) |
| measured root-contact drift | **0 px** in x and y across all 16 delivered frames |
| raw (pre-normalization) root drift | 2 px in x (86→88), 3 px in y (169→172) |
| **trunk-shaft walk** (the weak number) | **12.6 px** left across the track — see "Honest assessment" |
| total encoded bytes | **143,706** (16 frames) — vs **144,006** for round-1's 9-frame accepted track |
| worst frame-to-frame step | **42.9** mean-L1/px — vs **107.3** for round-1's accepted track |
| generations spent | 53 confirmed by the API + 2 object states + 3 v3 animations (cost not printed) |

Artifacts: `frames/frame-00.png … frame-15.png` · `contact-sheet.png` · `preview.gif` ·
`registration.json` · `raw/` (every unmodified model return) · `review-candidates.png` ·
`rig-states.png` · `drift-onion-skin.png` · `path-growth.md`.

---

## 1. What was generated, verbatim

Model/seed note: **`create_1_direction_object` and `animate_object` accept no `seed` parameter** —
seeds are recorded only where the API takes one. My seed block is 31500+.

### 1a. Two object rigs (`create_1_direction_object`, view `top-down`, 170×170, 25 generations each)

Identical description for both; they differ only in `style_images`.

> a single mature broadleaf shade tree grown as one continuous plant: one thick tapering trunk that
> flares into visible surface roots at its base and rises unbroken up into a wide rounded leafy
> crown, thick branches clearly emerging from the trunk and disappearing into the foliage so the
> trunk and the crown are obviously the same organism, chunky faceted pixel shading with a soft pale
> outline, warm brown bark and layered green leaves, no ground, no soil mound, no grass patch, no
> plant pot, no cast shadow, no border, no frame, one tree only, transparent background

| rig | `style_images` | object id | outcome |
|---|---|---|---|
| A | island plate only | `1cfb5803-7f0c-4c29-984a-b0b86cfbbf58` | 4 candidates, review status |
| B | island plate **+ round-1's accepted mature tree pose** | `53188d6e-8219-479e-ac53-6d254167bfa0` | 4 candidates, review status |

Both style plates were cut locally with PIL from repo assets (`work/prep_style.py`): the island body
lifted out of `svg-island-reference-plate.png` (hex grid and trail stub removed, blue-channel cut,
scaled into a 170×170 transparent square) and `tree/frame-08.png` scaled to 170×170. `size` cannot be
set alongside `style_images` — the largest style image sets the output size, which is why both plates
are exactly 170: that lands under PixelLab's ≤170 threshold and returns a **4-candidate review pack**
instead of a single take.

**Finding worth recording: `style_images` did NOT transfer the island's palette.** All eight
candidates came back in saturated game-green/brown, not the island's muted tan (`review-candidates.png`).
What the island plate *did* transfer was outline and shading language — and on one candidate a heavy
cream halo, which is the island's pale rim leaking in as a sticker outline. Palette matching a tree to
this island is still an open problem; `create_map_object` (inpainting into the real plate) is the
untried lever, not `style_images`.

### 1b. Review loop — `get_object` → look → `select_object_frames`

I read all 8 candidates as images before selecting (`review-candidates.png`). Rejected without
promotion: **A[1] and B[1]** (weeping willows — wrong species), **A[3] and B[2]** (autumn
orange/gold — wrong palette). Promoted:

- `select_object_frames(1cfb…, indices=[0,2])` → `53d4c4c9-…`, `b080f17c-…` (A[2] carries the cream
  halo; kept for the record, unused)
- `select_object_frames(53188d6e…, indices=[0,3])` → **`a9c5d071-979c-4935-8623-a2b44afec79b` (HERO)**,
  `f4fea77e-…` (a gnarled dark oak — clean base, no ground, strong branch structure; the runner-up)

The hero B[0] has a braided multi-strand trunk whose branches visibly enter the foliage — the single
property every prior experiment failed on. **It also came back with a grass/soil patch and two
mushrooms at its base**, which ADR-0274 D1/D6 forbids. That is a reject, and it was corrected inside
the rig rather than by cropping.

### 1c. Two states of that one object (`create_object_state`)

| state | seed | new object id | edit description (verbatim) |
|---|---|---|---|
| `clean-base` | 31500 | `7d3ad687-337e-449e-aff6-a300af26e8dd` | delete the grass patch, the soil mound and the two mushrooms at the base; the bare roots now end on an empty transparent background with nothing under them; keep the trunk, branches, canopy and colours exactly as they are |
| `sapling` | 31501 | `1f1466f1-027b-462d-9964-cdd244938711` | turn it into a very young sapling of the same tree: one slender single stem about a fifth as thick, only three or four small leaf clusters near the top, tiny root flare, no grass, no soil, no mushrooms, nothing under the roots, transparent background, same bark and leaf colours |

Both landed first time (`rig-states.png`): the ground patch is gone and the sapling is the same bark
and leaf palette on a single whip. **This is the load-bearing step of the whole experiment** — the
start pose and the end pose are two states of one object, so there is no "trunk asset" and "crown
asset" to mis-register.

### 1d. Three v3 interpolations (`animate_object`, `mode: 'v3'`, `frame_count: 16`, on `7d3ad687…`)

The first call at 192×192 was **refused**: `422: frame_count 16 too high for 192x192 image. Maximum
frame_count: 14` (the `w*h*frames ≤ 524288` rule). Rather than drop to 14 frames I moved the working
canvas to **176×176** (176²×16 = 495,616) and padded losslessly to 192 afterwards — 176 with anchor
(88, 172) pads by exactly 8 px left/right and 16 px top to land on 192 with anchor (96, 188), so no
resampling ever touches the art.

| # | display_name | animation id | start → end | animation_description (verbatim) |
|---|---|---|---|---|
| 1 | `exp15-growth-a` | `d391c8e3-0df1-4a6d-a424-b893cefbb847` | sapling pose (scaled 0.55, root-anchored) → clean-base pose | a sapling grows into a mature tree: the single slender stem thickens into a braided trunk that rises and flares into roots, side branches push outward and upward, and the small leaf clusters swell and multiply into a full rounded canopy; the base stays planted on exactly the same spot the whole time and the tree never slides, tips or leaves the ground line |
| 2 | `exp15-bridge-11-12` | `615850e1-060d-48b0-83a8-d9d8f350faa3` | `animA-11` → `animA-12` | the young tree fills out into its mature form: the trunk thickens and gains its braided bark, the three leaf clusters swell and multiply until they merge into one full rounded canopy carried on the branches; the base never moves |
| 3 | `exp15-bridge-12-16` | `a0d79949-5261-4781-a168-bc9aef787131` | `animA-12` → `animA-16` | the last of the canopy fills in and settles: the remaining gaps between the leaf clusters close into one continuous rounded crown carried on the branches, the bark darkens slightly, and the tree comes to rest; the base never moves |

The start pose is the `sapling` state cropped, scaled to 0.55 with NEAREST and re-anchored so its
root sits on the same pixel as the mature pose's. Four scales were rendered and inspected before
choosing (`work/start-scale-trial.png`); 0.55 keeps the 3 px stem intact while still giving a 2×
height growth.

**Bridges 2 and 3 were not guesses — they were aimed at measured faults.** The 17 frames of pass 1
step by a median ~33 mean-L1/px, but two pairs are outliers:

```
animA 11 -> 12   L1 69.59   (+2712 alpha px)   the crown snap
animA 12 -> 16   L1 66.53   (direct)           the crown reshuffle at the settle
```

Both were re-interpolated at 16 frames. `bridge[00]` is byte-identical to `animA-11`, `bridge[16]` to
`animA-12` (L1 0.09), and `bridge2[16]` to `animA-16` (L1 0.019) — so the three passes splice with no
seam by construction. **`animA-16` is itself pixel-identical to the authored end pose (measured L1 =
0.000)**: v3 lands exactly on the frame you hand it, so the retained final scene is the canonical hero
art, not a model approximation of it.

### 1e. Path-growth decal probe (`create_image_pixflux`, 40×32, 1 generation each)

| seed | job id | asked for | got | verdict |
|---|---|---|---|---|
| 31502 | `0904cc4b-fea4-4fc8-974f-269d5df81af0` | trampled dirt scuff with boot prints | a hard-outlined brown disc — reads as a cookie | **reject** |
| 31503 | `90601c9a-9445-46fc-898f-422692d44d2d` | sparse scatter of specks and pebbles | usable but carries two pebble blobs (460 B, 126 opaque px) | least-bad |
| 31504 | `8d2190aa-4a8a-4908-ae67-8ada45f2d054` | two faint boot prints pressed into dirt | two actual brown **shoes** seen from above | **reject** |

See `path-scuff-candidates.png` and `path-growth.md` for the conclusion (short version: the decal does
not earn its bytes, and the path beat needs no new asset at all).

---

## 2. Measured per-frame table

Canvas 192×192 RGBA, alpha threshold 8, anchor rule (round-1's, reused verbatim): *alpha-weighted x
across the bottom three occupied rows; bottom-most occupied y*. "raw" = the model's 176×176 return
before normalization. Step = mean per-pixel RGBA L1 against the previous delivered frame.

| frame | source | raw bbox (x,y,w,h) | raw anchor | normalized bbox | normalized anchor | step L1/px | bytes |
|---|---|---|---|---|---|---|---|
| 00 | animA-00 | 72,91,34,82 | 88,172 | 80,107,34,82 | **96,188** | – | 1,885 |
| 01 | animA-02 | 65,73,47,100 | 87,172 | 74,89,47,100 | **96,188** | 18.0 | 4,104 |
| 02 | animA-03 | 62,63,53,110 | 87,172 | 71,79,53,110 | **96,188** | 18.6 | 4,980 |
| 03 | animA-04 | 56,52,61,121 | 86,172 | 66,68,61,121 | **96,188** | 22.4 | 5,777 |
| 04 | animA-05 | 52,42,68,129 | 86,170 | 62,60,68,129 | **96,188** | 22.9 | 7,090 |
| 05 | animA-06 | 49,30,74,140 | 86,169 | 59,49,74,140 | **96,188** | 30.9 | 7,420 |
| 06 | animA-07 | 48,23,80,148 | 86,170 | 58,41,80,148 | **96,188** | 30.3 | 8,518 |
| 07 | animA-08 | 46,16,86,155 | 86,170 | 56,34,86,155 | **96,188** | 29.3 | 8,825 |
| 08 | animA-09 | 42,10,92,161 | 86,170 | 52,28,92,161 | **96,188** | 30.9 | 10,089 |
| 09 | animA-10 | 34,6,104,165 | 87,170 | 43,24,104,165 | **96,188** | 36.6 | 10,266 |
| 10 | bridge-01 | 29,3,113,169 | 87,171 | 38,20,113,169 | **96,188** | 31.3 | 12,080 |
| 11 | bridge-03 | 28,7,118,165 | 87,171 | 37,24,118,165 | **96,188** | 33.3 | 12,382 |
| 12 | bridge-08 | 25,7,124,165 | 87,171 | 34,24,124,165 | **96,188** | 32.0 | 12,968 |
| 13 | bridge-14 | 24,5,126,167 | 87,171 | 33,22,126,167 | **96,188** | 36.8 | 13,924 |
| 14 | bridge2-04 | 19,6,132,166 | 87,171 | 28,23,132,166 | **96,188** | 32.9 | 13,613 |
| 15 | bridge2-16 | 12,8,139,165 | 88,172 | 20,24,139,165 | **96,188** | 42.9 | 9,785 |

**Root-anchor drift: 0 px** on both axes across all 16 frames (normalized column is constant). The raw
model returns drifted 2 px in x and 3 px in y; normalization removes it. Height is monotone
82 → 165 px, width monotone 34 → 139 px, alpha area monotone 704 → 10,979 px.

### Frame selection is measured, not eyeballed

The three passes give 44 spliced source frames; 16 are chosen by **minimising the largest
frame-to-frame perceptual step** (binary search on a threshold + shortest-hop DP over the full
44×44 pairwise distance matrix, `work/build_track.py`). The distance is mean RGBA L1 normalised by
the geometric mean of the canvas area and the two frames' alpha-union — pure canvas normalisation
spends every frame on the mature end (a big crown moves more absolute pixels), pure occupancy
normalisation spends every frame on the seedling; the geometric mean samples both. Result:

```
                                     worst step   mean step   frames   bytes
round-1 tree track (ACCEPTED leader)      107.3        61.3        9   144,006
exp-15                                     42.9        29.9       16   143,706
```

**Same byte budget, 2.5× smaller worst-case jump, 1.8× the frames.**

### Silhouette containment — the "grows from within" number

Share of each frame's silhouette that is still covered by the next frame, and by the final frame:

```
vs next   0.54 0.73 0.76 0.85 0.76 0.83 0.87 0.89 0.90 0.95 0.89 0.95 1.00 0.97 0.95
vs final  0.64 0.76 0.80 0.86 0.88 0.90 0.90 0.90 0.91 0.93 0.92 0.95 0.95 0.93 0.95 1.00
```

64 % of the seedling's pixels already lie inside the mature tree; 90 %+ from frame 05 on. The tree
grows *outward from within itself* rather than dissolving into a different silhouette — that is the
measurable difference between growth and the crossfade that got experiment 4 rejected.
`drift-onion-skin.png` is the visual version (frames 0/5/10/15 tinted and stacked on the ground line).

---

## 3. Honest assessment against §1's failure list

I looked at every stage at 3× before writing this (`work/junction-zoom.png`, `work/*-sheet.png`).

| failure mode | verdict |
|---|---|
| **seam** | Not present. There is no seam to have — trunk and crown are one generated image at every frame. |
| **gap (canopy↔trunk)** | Not present at any of the 16 frames. Branch stubs are visibly *inside* the leaf masses at 3×. |
| **floating crown** | Not present. Every leaf cluster terminates a drawn branch; the crown never sits on air. |
| **blob** | Partly avoided. Frames 12–15 are a dense crown, but the trunk and two major branches stay legible through it, unlike a lollipop silhouette. |
| **pasted-on** | Not present. Candidate A[2] *did* come back with a cream sticker halo — that candidate was not promoted. |
| **silhouette snap** | Two snaps existed and were measured (L1 69.6 and 66.5) and both were re-interpolated. Residual worst step 42.9 vs the accepted track's 107.3. |
| **style pop** | Not present within the track — every frame descends from one object and one palette. **But there is a style question across the app**: this tree is round-1's saturated green, not the island's muted tan. `style_images` did not close that gap. |
| **topology mutation** | Present but small and late. Between frames 12→15 the crown's leaf clusters re-arrange as they merge; the trunk and branch skeleton do not change. Bridge 3 exists specifically to spread that over more frames and it dropped that transition from one 66.5-step to a chain of ≤28-steps. |

### The number I would lead with if I were arguing against this experiment

**The trunk shaft walks 12.6 px to the left across the track** (alpha-weighted centre of the band
y = 164…174, 96.7 → 85.0). This is *not* a normalization bug and it is *not* fixable by a better
anchor rule — I tested five anchor bands on the raw returns and the bottom-three-rows root band is
already the most stable available (span 2.3 px; every trunk-shaft band spans 6.4–11.8 px). The cause
is in the art: the mature tree's root system flares further left than right, so the root-spread
centroid the socket is pinned to sits ~11 px right of the trunk axis, while the sapling's does not.

Two readings, and I am not going to pretend I know which the owner will take:
- *Benign:* the onion skin shows every stage nested around one base with the roots spreading
  asymmetrically outward — which is what a real tree does, and the ground contact never moves.
- *Damaging:* on a socketed island the trunk is what the eye tracks, and a 12.6 px lateral creep
  over 16 frames (6.6 % of the canvas) may read as the tree sliding off its mark.

If it reads as sliding, the fix is another generation, not another normalization: a `create_object_state`
that symmetrises the root flare, then re-run the three interpolations from the corrected end pose.

### Other honest weaknesses

- **Frame 0 pops in.** It is a 34×82 px seedling appearing from nothing on one frame. That is smaller
  and more seedling-like than round-1's accepted frame 0 (113×158), but it is still a pop, and it is
  the single largest *scale-relative* step in the track (403 occupancy-L1 vs a 221 mean). The app owns
  the entry (constraint 3), so this may be a non-issue — or it may want one more interpolation below
  frame 0.
- **`frames/frame-15.png` encodes to 9,785 bytes while frame 14 is 13,613** — a PNG-encoding
  artefact of the source, not a content difference; frame 15 has the *most* alpha pixels of any frame.
- **The 4-candidate review pack is a real constraint on quality**, not a formality: 4 of 8 candidates
  were unusable species/palette and 1 of the remaining 4 carried forbidden ground. Any future run of
  this technique should budget for the review, not the first draw.
- **This experiment did not test the tree against the island plate at real scale.** ADR-0274 D1/D6
  forbid generating a composite, so I could not; the camera match is asserted from the plate's low
  top-down framing and PixelLab's `top-down` view, not measured.

## 4. What I would do next

1. **Settle the 12.6 px trunk walk with the owner before anything else** — it is the only number in
   this experiment that could sink it, and the remedy (a root-symmetry state + three re-runs) is
   ~5 calls.
2. **Pull the untried palette lever: `create_map_object`.** It inpaints a new object into a supplied
   `background_image` so it matches an existing map's art style. That is the tool that could produce a
   tree already sitting in the *real* island plate, at the real camera, in the real palette — which is
   exactly the gap `style_images` failed to close here. Inpainting caps at 192×192, which is this
   track's canvas.
3. **Re-run the same rig for the small plants** — the technique is species-agnostic and ADR-0277 D2
   retained the cutout/pose plant track, so this would be a straight A/B against a selected control.
4. **Do not re-derive the pacing.** `work/build_track.py` is deterministic and reusable: give it any
   set of spliced v3 passes and a frame budget and it returns the min-max-step selection plus the
   registration table.

## 5. Rejects, with reasons

| what | id / reason |
|---|---|
| rig A candidate 1, rig B candidate 1 | weeping willow silhouette — wrong species for the app's tree |
| rig A candidate 3, rig B candidate 2 | autumn orange/gold canopy — wrong palette |
| rig A candidate 2 (`b080f17c-…`) | promoted but unused: heavy cream sticker halo (the island plate's pale rim leaking in) |
| rig B candidate 3 (`f4fea77e-…`) | promoted but unused: excellent clean gnarled oak, but a darker, moodier look than round-1's accepted leader |
| rig B candidate 0 as drawn | forbidden grass/soil/mushroom base patch (ADR-0274 D1/D6) — corrected in-rig by the `clean-base` state, not cropped |
| `animate_object` at 192×192, 16 frames | API refusal `422: frame_count 16 too high for 192x192 image. Maximum frame_count: 14` — moved the working canvas to 176 and padded losslessly |
| scuff decal seed 31502 | hard-outlined brown disc, reads as a cookie |
| scuff decal seed 31504 | two brown shoes seen from above, not prints pressed into dirt |
| pure-canvas and pure-occupancy pacing metrics | measured and discarded: the first spent 12 of 16 frames on the mature crown, the second spent 12 of 16 on the seedling |

## 6. Reproducing

`work/` holds every local script: `prep_style.py` (style plates), `mkargs.py` (base64 arg composer),
`imglib.py` (alpha bounds / anchor / placement), `build_track.py` (splice + pacing + normalization +
`registration.json`), `make_previews.py` (contact sheet + gif), `pxcall.sh` (retry past the shared
8-concurrent-job rate limit). Python 3.14 + PIL 12.2 + numpy 2.4 only — no sharp, no ImageMagick,
no ffmpeg.
