# exp-12 — Chained img2img ladder: every frame is a direct descendant of the last

Round 3, `chapter2-pixellab-organic-growth-arc`. Author-time only (ADR-0274 D2 / ADR-0219): no
vendor call, credential or hostname reaches the repo, a build artifact or the browser. Everything
below is a versioned local PNG with full provenance.

---

## 1. The question

Every recorded hero-tree failure is the same failure: a separately authored crown attached to a
separately authored trunk reads as a seam, a gap, a floating blob or a pasted-on crown. Mechanical
registration has been proven insufficient (ADR-0277). **Can continuity come from DESCENT — from the
fact that frame N+1 is literally repainted out of frame N's own pixels?**

## 2. The technique, in two sentences

Stage 0 is a 64x64 sprouted seedling pasted 1:1 into the fixed 192x192 canvas at the ground socket;
every later stage is `create_image_pixflux` img2img whose `init_image` is its immediate parent, so a
frame can only ever be a repaint of the frame before it. Because a preserving img2img **repaints but
does not grow** (measured, §4), each rung first applies a deterministic *growth vector* to the parent
— a nearest-neighbour scale, or a trunk-row insertion plus a crown ellipse filled with 1:1 crops of
the parent's **own foliage pixels** — and the model's only job is to make that injection look like
pixel art.

Nothing is ever composited from a second source image. There is no separate crown asset in this
experiment: every leaf in frame 11 traces back, crop by crop, to the five leaves on the seedling.

## 3. Result

- **Usable track: yes.** 12 frames, 192x192 fixed transparent canvas, socket (96, 188).
- `frames/frame-00.png … frame-11.png`, `contact-sheet.png`, `preview.gif`, `registration.json`.
- **Root drift: 0 px in x on every rung, −1..+3 px in y** — that is the *raw model output* measured
  against the socket **before** any normalisation. After the translate-only normalisation every
  frame's socket is exactly (96, 188).
- **11 of 12 frames are a single connected component; frame 11 is also 1** (the two frames that were
  not were rejected and regenerated — see §6).
- Total encoded 155 112 B for 12 frames (avg 12.9 kB, max 28.6 kB). `preview.gif` 127 266 B.

---

## 4. The measurement that shaped the experiment

**A preserving img2img is a re-renderer, not a grower.** Probing one rung off the same parent
(`probes/probe-strength.png`, `probes/probe-growth.png`):

| init_image_strength | child silhouette | opaque-px ratio vs parent | IoU vs parent | verdict |
|---|---|---|---|---|
| 320 | 30 x 58 → 30 x 58 | 1.03 | 0.91 | no growth |
| 260 | 30 x 58 → 28 x 59 | 1.00 | 0.81 | no growth |
| 200 | 30 x 58 → 31 x 59 | 1.04 | 0.84 | no growth |
| 120 | 30 x 58 → **25 x 52** | 0.84 | — | **shrank + topology mutation** |
| 60  | 30 x 58 → **38 x 44** | 1.44 | — | **re-invented; root lifted 20 px off the socket** |

There is no strength at which the model both preserves the plant and enlarges it. Between 200 and
320 it repaints in place; below ~150 it stops descending and starts inventing (at 60 it returned a
different tree, in a different palette, with a black outline and the root floating 20 px above the
socket — exactly the round-1 failure). **So the ladder's growth must be injected geometrically, and
the model used only as a renderer.** That is this experiment's main finding, and it is the reason the
raw technique as briefed ("just chain img2img at 250–300") produces twelve identical frames.

Second measurement, at the crown transition (`probes/probe5-out.png`, `probes/probe5-EF.png`): a
uniform scale alone will **never** produce a canopy. Four stage-5 candidates off the same parent —
uniform-scaled prior at str 260, a per-row crown-spread prior at str 260, a leaf-seeded prior at
str 260, uniform at str 200 — only the **leaf-seeded** prior produced canopy mass. The two
uniform-prior candidates returned a larger sapling with the same six leaves, prompt notwithstanding.

---

## 5. Per-frame measurements

Alpha threshold 8. `model socket drift` = the socket of the **raw** model return relative to
(96, 188), i.e. what the technique itself did before normalisation. Normalisation is **translate
only** — never scaled, never cropped, never recoloured.

| frame | alpha bounds x,y,w,h | socket (norm) | bottom-3 anchor | model socket drift | comps | stray px | bytes |
|---|---|---|---|---|---|---|---|
| 00 | 81, 131, 30, 58 | 96, 188 | 93, 188 | — (64px source, pasted) | 1 | 0 | 2 689 |
| 01 | 77, 116, 38, 73 | 96, 188 | 96, 188 | 0, −1 | 1 | 0 | 3 350 |
| 02 | 73, 98, 47, 91 | 96, 188 | 97, 188 | 0, 0 | 1 | 0 | 4 959 |
| 03 | 69, 86, 53, 103 | 96, 188 | 94, 188 | 0, 0 | 1 | 0 | 5 827 |
| 04 | 65, 74, 59, 115 | 96, 188 | 94, 188 | 0, −1 | 1 | 0 | 7 323 |
| 05 | 61, 56, 69, 133 | 96, 188 | 111, 188 | 0, +3 | 1 | 0 | 9 400 |
| 06 | 59, 43, 75, 146 | 96, 188 | 102, 188 | 0, −1 | 1 | 0 | 12 266 |
| 07 | 45, 31, 100, 158 | 96, 188 | 96, 188 | 0, −1 | 1 | 0 | 15 809 |
| 08 | 39, 23, 113, 166 | 96, 188 | 95, 188 | 0, −1 | 1 | 0 | 19 705 |
| 09 | 33, 15, 122, 174 | 96, 188 | 94, 188 | 0, −1 | 1 | 0 | 22 084 |
| 10 | 31, 10, 139, 179 | 96, 188 | 97, 188 | 0, 0 | 1 | 0 | 23 054 |
| 11 | 18, 4, 153, 185 | 96, 188 | 94, 188 | 0, +1 | 1 | 0 | 28 646 |

**Root-anchor drift, stated plainly: the model moved the root 0 px horizontally on all 11 img2img
rungs, and at most 3 px vertically (once; −1 px on seven rungs).** The bottom-3-rows anchor rule
inherited from round 1 is noisy here (frame 05 reads 111 because one root tip on the right reaches
one row lower than the rest) — it measures the root *spread* centroid, not the trunk. The socket rule
used for normalisation is the **trunk waist**: the alpha-weighted centroid of the narrowest
silhouette row between 5 % and 45 % of sprite height above the base.

### Trunk wander (the "does it stay put" test)

Alpha-weighted trunk centroid x, at fixed heights above the socket, across all 12 frames:

| band | min | max | spread |
|---|---|---|---|
| 20 px above socket (trunk) | 94.0 | 96.5 | **2.5 px** |
| 10 px above socket (inside the root flare) | 88.1 | 96.0 | 7.9 px |

The 2.5 px trunk figure is the honest one. The 7.9 px band sits inside the root flare, which
legitimately widens and splays asymmetrically as the tree matures; it is not trunk wander.

### Growth monotonicity

Height 58 → 185, width 30 → 153, opaque pixels 651 → 11 808 — **strictly increasing on every rung**
(per-rung opaque-pixel gain +9.3 % … +59.0 %). No frame is smaller than its parent in any axis.

### Palette drift (measured, and a real defect)

Mean foliage colour, HSV:

| frame | 00 | 02 | 04 | 06 | 08 | 10 | 11 |
|---|---|---|---|---|---|---|---|
| hue° | 82 | 71 | 68 | 67 | 72 | 74 | 72 |
| value | 0.49 | 0.54 | 0.45 | 0.39 | 0.29 | 0.29 | 0.30 |

Hue is stable (67–82°). **Value falls from 0.49 to 0.29 — the foliage darkens by ~40 % across the
ladder.** Some of that is defensible (mature foliage *is* darker) but it is drift, not intent: it
accumulated one rung at a time. Frames 10 and 11 were generated with `color_image` locked to
frame 08, which stopped further drift but did not undo the first eight rungs.

---

## 6. Every prompt, seed, model and job id

Model: `create_image_pixflux` for all frames. Shared image params on every rung:
`no_background: true`, `view: "low top-down"`, `outline: "selective outline"`,
`shading: "basic shading"`, `detail: "medium detail"`, `text_guidance_scale: 8` (7 on the stage-11
retries). Cost 1 generation per call.

### Stage 0 (the root of the chain)

`create_image_pixflux`, 64x64, seed **31201**, job `c6c60148-02e5-4c88-9ec8-0444e1903a7c`,
no init image:

> tiny tree seedling sprout: one thin reddish-brown trunk, a small flare of bare exposed roots at its
> base, five small bright green leaves near the top. clean cutout sprite, no soil, no dirt, no mound,
> no grass, no ground, no shadow, no border, transparent background

Then pasted 1:1 (no scaling) into the 192x192 canvas with its trunk waist on (96, 188).

### Rungs 1–11

Every rung's description is `HEAD + STEP(k) + INVARIANT`.

`HEAD` = `the SAME plant one growth step older, redrawn crisply as clean pixel art: `

`INVARIANT` =

> ` the new leaves grow out of the existing branch tips and stay attached to them, no floating leaves
> and no gap between trunk and leaves. identical root position at the bottom centre, identical
> palette, identical camera. one single tree only, no soil, no dirt, no grass, no ground, no shadow,
> no border, transparent background`

| k | seed | strength | job id | STEP(k) |
|---|---|---|---|---|
| 1 | 31220 | 260 | `9f240a41-f432-42e2-8870-14c36f60175e` | the stem is slightly thicker and taller and one more pair of green leaves has opened near the top. |
| 2 | 31221 | 260 | `fdb01961-e867-47f5-8fd4-d553b73005ea` | a second shoot has forked from the stem near the top and both shoots carry small leaves. |
| 3 | 31222 | 260 | `37117b23-903f-46f1-8693-64e1dded6442` | the two shoots have lengthened and each has forked once more, so leaves are denser at every tip. |
| 4 | 31223 | 260 | `f96de88e-21e2-4aa8-ae24-ecea146ab3fe` | it is now a young sapling: the trunk is woody with a visible root flare and four leafy branch tips fan out from the top. |
| 5 | 31229 | 260 | `e44d0777-6a10-42e3-a680-9f6b837225cc` | the leaf clusters at the branch tips have thickened until neighbouring clusters touch and merge into small rounded leaf masses. |
| 6 | 31231 | 260 | `f633e2d0-b364-429d-a7a1-a25c11289501` | the merged leaf masses have closed into one small loose crown sitting directly on top of the branch tips, the branches still visible beneath it. |
| 7 | 31232 | 260 | `3c0fc888-36d7-4649-8d5b-9501b4b10ce7` | the crown has broadened and new leaf masses have filled the gaps between the branches, so no background shows through the middle of the crown. |
| 8 | 31233 | 260 | `ac801b07-4bc6-4073-8b85-6d5eefb0ddce` | a continuous rounded canopy of lobed leaf clumps; the trunk has thickened into bark and the root flare has widened. |
| 9 | 31234 | 260 | `b10fe3d4-a325-4e5b-9d8f-b16a9d1716ce` | a mature tree: the canopy is wider than it is tall and made of many rounded leaf clumps, with the upper trunk and inner branches still visible where they enter the canopy. |
| 10 | 31238 | 300 | `70b27e79-1a31-4a3d-bd8d-792b6ba992ca` | fully mature: a broad heavy canopy of overlapping lobed leaf clumps, a thick buttressed bark trunk and wide gripping surface roots. **+ density clause, `color_image` = frame-08** |
| 11 | 31247 | 400 | `df6edbb8-6415-47cf-9eed-831d84d2a3d5` | (rewritten — see below) **+ `color_image` = frame-08** |

Density clause added on rungs 10 and 11:

> ` the canopy is one dense connected mass: every leaf touches its neighbours and no leaf floats
> separately in the air. no flowers, no fruit, no berries, no red or orange specks.`

Rung 11's full description (the fourth rewrite, §7):

> the SAME fully mature tree one season fuller, redrawn crisply as clean pixel art with the SAME
> large smooth rounded leaves at the SAME leaf size - only tidy the edges of the canopy and the bark.
> the new leaves grow out of the existing branch tips and stay attached. the canopy is one dense
> connected mass with a clean smooth outline, no leaf floating separately in the air, no dithered
> fringe. identical root position at the bottom centre, identical palette, identical camera. one
> single tree only, no flowers, no fruit, no berries, no speckles, no soil, no dirt, no grass, no
> ground, no shadow, no border, transparent background

### The growth vectors (author-time, deterministic, in `priors/`)

| stages | vector |
|---|---|
| 1–5 | nearest-neighbour uniform scale about the socket, sized to a target silhouette height: 74, 90, 103, 116, 127 px (ease-out from 58 to 165) |
| 5 | + `crown_mass`: 26 scaled copies of the parent's own foliage layer, stamped inside an ellipse (0.42 h wide x 0.30 h tall) seated on the parent's leaf tips, composited **under** the parent so the trunk stays crisp |
| 6–11 | `raise_trunk(n)` (insert n rows of the parent's own trunk waist row — no scaling, so leaf size is untouched) + `widen_lower(f)` (per-row horizontal scale about the trunk axis, below the crown only) + `crown_grow` (1:1 sub-crops of the parent's foliage stamped inside a growing ellipse seated on the parent's leaves) |

Stage schedule for 6–11 — `(trunk rows, lower widen, crown w/h as fraction of sprite height)`:
6 `(10, 1.06, 0.52/0.34)` · 7 `(8, 1.06, 0.62/0.38)` · 8 `(6, 1.06, 0.70/0.42)` ·
9 `(5, 1.05, 0.76/0.44)` · 10 `(4, 1.04, 0.81/0.46)` · 11 `(2, 1.02, 0.86/0.48, densified + pruned)`.

The crown ellipse is **always** seated so its lower half overlaps branches that already carry leaves.
That is the structural reason a crown cannot detach in this technique: the new foliage is stamped on
top of the old foliage, not next to it.

---

## 7. Rejects (all looked at, all measured)

| what | job id | why rejected |
|---|---|---|
| stage-0 at 192px with `color_image` = round-1 frame-08 | `633efc8b-e5c7-4ca0-8ebb-37a042c43b17` | grew a dark soil mound at the base; palette came back muddy |
| stage-0 64px palette-forced variant | `b906c8b3-cb16-43eb-8e7a-499956777a39` | muddier roots than the un-forced seed 31201; not used |
| rung probe str 320 / 260 / 200 | `5f6acb3f…` / `3b00be9a…` / `19c80814…` | no growth (area ratio 1.00–1.04); kept as evidence, not as frames |
| rung probe str 120 | `116ca431-7a0c-4bb0-826a-c6b44ea4f1bd` | **shrank** to 0.84x and mutated into a different plant |
| rung probe str 60 | `9b8ba904-c20a-427a-85e8-f8a2e72d692c` | re-invented the tree; root lifted 20 px off the socket |
| stage-5 A (uniform prior, str 260) | `52a7dbc9-99b9-4571-8ceb-6a4a30c5bea9` | no canopy — a bigger sapling |
| stage-5 B (crown-spread prior) | `9ff6ba1b-c984-47fd-bcf7-8f3a85809455` | no canopy; the ramped spread barely changed the bbox |
| stage-5 C (blob leaf-seed prior) | `8ec78ffb-3861-4c0a-b1e9-1ebd2e554007` | canopy formed but columnar/bushy; reads as a conifer |
| stage-5 D (uniform prior, str 200) | `9f60effd-b2cd-4b6a-abc0-cf3f3c54bd1f` | no canopy |
| stage-5 F (crown-mass prior, str 220) | `0a60759c-7d06-4188-b43c-b0690c7ff440` | good, but its small clump texture popped against the parent's big leaves |
| **stage-10 first take** | `d9550778-17fa-4033-9f3e-82eaeb71d9fb` | **7 components, 167 stray px — six detached leaf clusters floating beside the crown**, and sparser than its own parent (non-monotonic) |
| stage-10 retry b (str 260 + palette lock) | `4215ad3f-bb11-45de-8fcb-67cf61c2055e` | connected, but the canopy had sky-holes through the middle |
| **stage-11 first take** | `d4929b19-7016-4cc9-b734-6f4939145cea` | palette pop + orange/red specks (read as berries) + a dense red-brown branch web |
| stage-11 b / c | `3a0e0fc8…` / `77baa3b2…` | leaf texture dissolved from big smooth leaves into fine speckle — a style pop |
| stage-11 d / e | `d1de5510…` / `e4367885…` | grey-pink speckle (read as blossom / dead leaves); d had 7 components |
| stage-11 f / g (str 400 / 460, unpruned prior) | `40f3c741…` / `57bd569a…` | leaf scale preserved, but the model faithfully preserved my prior's ragged ellipse edge → 10 and 19 components |
| stage-11 h / i (str 400 / 340, pruned prior) | `7459e894…` / `7adf6055…` | close; h had 5 components / 8 stray px. Superseded by the densified prior |
| stage-11 k (densified prior, str 360) | `eae36033-26f0-49a9-bcb9-15f1e5916c67` | washed out next to str 400 |
| path tile set v2 (seamless retry) | `317ad7bf-40a4-4fe8-a962-dadf594028b3` | **FAILED: "You have run out of generations and credits"** — the shared round-3 pool hit 33 remaining while this 40-generation call was in flight |

Stage 11 took **eight** attempts. The chain of causes was worth recording: the model at str ≤ 300
re-textured the leaves (style pop); at str ≥ 400 it preserved leaf scale but also preserved the
ragged perimeter of my own ellipse-clipped stamping; the fix was to clean the *prior* (dilate the
stamped crown by one pixel with real leaf colours before masking, then drop every component not
connected to the trunk) and then generate at str 400. The accepted prior is `priors/prior-11j.png`
(stamp rng seed 11123, 26 stamps, densified then pruned); the accepted return is
`raw/stage11j-df6edbb8-00.png`.

**Generations spent by this experiment: 38 `create_image_pixflux` calls (1 generation each) + one
`create_path_tiles` (billed 20–40 by canvas size; the API does not itemise which) ≈ 58–78 total.**
A second `create_path_tiles` was refused for budget and cost nothing. All 38 pixflux returns are in
`raw/` — 12 became frames, 26 were rejects.

---

## 8. Honest self-assessment against the round-1/2 failure list

Look at `contact-sheet.png` and `preview.gif` before reading this.

| failure mode | verdict |
|---|---|
| **seam** between trunk and crown | **Absent.** There is no seam to have, because there is no second asset — the crown is repainted out of the parent's own foliage every rung. Every frame is one connected component. |
| **gap** (the #2 "buggy" failure) | **Absent, structurally.** The crown ellipse is always seated over branches that already carry leaves, so a gap cannot open. Measured: 0 stray pixels on all 12 published frames. |
| **floating crown** | **Absent in the final track**, but the technique produced it twice under pressure (stage 10 first take: 6 detached leaf clusters; stage 11 f/g: a dithered fringe of 10–19 components). Both were caught by a component count, not by eye. Descent does not *guarantee* attachment when the model is given a ragged prior. |
| **blob** | **Partly present at frames 05–06.** Frame 05 is a leafy ball on a stick — a lollipop. It is attached and it is made of the parent's leaves, but it is the least tree-like frame in the track. |
| **pasted-on crown** | **Absent.** No frame reads as a decal. The trunk visibly enters the canopy from frame 07 onward and inner branches are visible inside it. |
| **silhouette snap** | **Absent.** Height, width and opaque area all increase monotonically, with no rung larger than +59 % area and most between +9 % and +30 %. There is no round-1-style frame 6→7 jump. |
| **style pop** | **Present, twice.** (a) frame 04 → 05: the leaf rendering changes from six discrete large leaves to a leaf-ball; it is the biggest single jump in the track. (b) frame 10 → 11: the canopy edge picks up a slightly softer, cloudier outline. Both are visible at a glance. |
| **topology mutation** | **Absent** in the accepted track — but only because the growth vector holds it. At str 120 and 60 (§4) the model mutated topology immediately. The technique's continuity is bought by *not letting the model change anything*, which is also its main limitation. |
| **palette drift** | **Present and measured.** Foliage value 0.49 → 0.29 over 11 rungs. Locked at rung 10 with `color_image`; the first eight rungs still darken. |
| **camera** | Holds. Low top-down throughout, matching the reference plate; no rung re-projected the tree. |

### Does the trunk and canopy read as ONE CONNECTED ORGANISM?

**Yes, from frame 07 onward — and that is the strongest thing here.** In frames 07–11 the trunk runs
unbroken into the canopy, the inner branches are visible where they enter it, and the lower leaf pair
sits on the bole below. There is nothing to "attach", because nothing was ever separate.

**Frames 05 and 06 are weaker.** Frame 05 is a leaf-ball on a stick; frame 06 is the same with a
slight notch where the trunk terminates inside the crown. They are connected and continuous with
their neighbours, but they are the frames I would show the owner last.

The honest caveat: this is not really "chained img2img" any more. It is a **procedural growth rig
whose brush is a diffusion model**. The descent claim survives — every pixel of frame 11 is a
repaint of a repaint of the seedling — but the *growth* is mine, not the model's, and the brief's
literal recipe (chain at strength 250–300 and let the model grow it) is measurably a no-op.

## 9. What I would do next

1. **Rebuild frames 04–06 with a smaller crown step.** The 04 → 05 style pop is the one visible
   defect an owner would name. Three rungs between them (crown w_frac 0.20 / 0.30 / 0.42 instead of a
   single 0.42) should dissolve it, at a cost of 3 generations and 2 extra frames.
2. **Lock `color_image` from rung 1, not rung 10.** The 0.49 → 0.29 value drift is entirely avoidable
   and costs nothing.
3. **Run the whole ladder at str 400 with a densified, pruned prior.** Rung 11 proved that high
   preservation + a clean prior gives leaf-scale stability *and* a single component. The early rungs
   used 260 only because that is where the probe started.
4. **Feed the round-1 winner as the terminal frame.** The owner already likes round-1's mature tree.
   Running this ladder *backwards* from it (each rung shrinking the crown ellipse and removing trunk
   rows, generating at str 400) would produce a track whose last frame is the frame he already chose
   — while keeping this experiment's zero-gap guarantee.
5. **Regenerate the path tile set** with `tile_depth_ratio: 0` — see `path-growth.md` §4.

---

## 10. Files

```
frames/frame-00..11.png   the track — 192x192 RGBA, socket (96,188), translate-only normalised
raw/                      every unmodified model return, named by job (39 files)
raw/pathtiles/            the 18 returned path tiles + the source zip
priors/                   every author-time growth vector handed to the model
probes/                   the strength / crown probe evidence sheets referenced above
contact-sheet.png         all 12 frames on a checkerboard, socket + trunk-axis rules drawn
preview.gif               2x nearest-neighbour dark-field animation, 320 ms/frame
registration.json         the machine-readable measurement table
path-tiles.png            the 18-config set with declared vs measured edge masks
path-tiles-demo.png       an autotiled route — shows the seam defect
path-stroke-demo.png      the tile's transverse profile ridden along an arbitrary curve at 3 reveals
trail-profile.png         the 32x3 transverse profile extracted from tile_2
path-growth.md            the path-growth proposal
```
