# exp-11 — In-context inpaint: generate the tree INSIDE the real island plate

**Round 3, `chapter2-pixellab-organic-growth-arc`, 2026-08-01.**
Everything here is author-time only (ADR-0274 D2 / ADR-0219). No token, hostname, vendor call or
asset-owned clock is recorded in this directory.

---

## Read this first — the one-paragraph honest verdict

Generating the tree **inside** the plate works, and it works better than anything registered
post-hoc: every tree frame in `frames/` is **one single 8-connected component** — trunk and canopy
are literally the same blob of pixels, so a seam, a gap or a floating crown is not merely unlikely,
it is *arithmetically impossible*. Root contact drifts **1 px in x and 2 px in y across the whole
track, with zero normalization applied**, because every frame was drawn in the plate's own
coordinate frame. That is the strongest part of the result. **But the central bet failed in the
other direction**: the model does *not* respect the map it is drawing into. Past roughly a 25 %
mask fraction it bleaches the island away and invents its own ground — by the last rung it had
replaced the hex island under the tree with a grey-and-white tiled floor (see
`all-returns-sheet.png`, top row). And it does not grow smoothly: the tree's size tracks the
**mask**, not the prompt, so a ladder of prompts stalls for three rungs and then snaps 4× in one
step. The delivered 5-frame track is a **curated subset** of 11 rungs, not the ladder as generated.

---

## The question

Every recorded failure in this arc is the same failure: a separately authored crown attached to a
separately authored trunk reads as a seam, gap, blob or pasted-on crown. Mechanical registration
has been proven insufficient (ADR-0277). **Can continuity come from how the art is GENERATED —
by drawing the tree into the real island plate, at the real camera, in the real palette, and
growing it by re-inpainting over what the model already drew?**

## The technique in two sentences

The hero tree is inpainted directly into the real 155×191 SVG island reference plate at a fixed
socket, with an elliptical mask whose **bottom edge never moves** and whose top and width grow rung
by rung; each rung is fed the previous rung's composite, and the bottom 11–12 px of the
already-drawn tree is subtracted from the mask so the root contact is pixel-frozen and cannot
detach or drift. The transparent track is then derived by differencing each composite against the
untouched plate and keeping only pixels that (a) changed, (b) are **not** within 34 of any colour
present in the plate (this drops re-shaded ground), and (c) are 8-connected to the root socket.

## What actually happened, in order

### 1. `create_map_object` with a custom mask cannot draw an object — it extends terrain (5 rejects)

The assigned lever was `create_map_object` with `background_image` + a custom inpainting mask. It
does not do what the tool card says when the mask sits in a dense terrain map. Five calls, five
descriptions, three style-knob combinations, two mask positions (on-island and off-island): **every
single one returned more island**, never a tree. See `raw/smoke-*`, `raw/p1-*` … `raw/p4-*`,
`raw/q2-*`.

The counter-example is the finding: with **no custom mask** — the built-in centred
`{"type":"oval","fraction":0.5}` — the *same* description (`"oak tree"`) returned a clean,
transparent, correctly-styled tree cutout first time (`raw/q1-mo-oval-1a3a0b85-00.png`). So the
tool works; **passing `inpainting: {"type":"mask", …}` is what collapses it into a terrain
continuation.** That is a reusable finding for anyone else on this arc: *use the oval fraction and
a background CROPPED around your socket; do not hand it a mask.*

Two more mechanical notes, both cost a call to learn:
- `create_map_object` **exposes no `seed`** — style-match generations here are not reproducible.
- It upscales 4× internally and 500s with ``height` and `width` have to be divisible by 8`` for any
  odd-dimension background. The 155×191 plate must be padded to **156×192** (job `87e10186`, hard
  fail, no image).

### 2. `inpaint_image` is the tool that actually does in-context generation

`inpaint_image` on the same plate, same socket, same elliptical mask returned a proper tree in the
island's palette and camera on the first attempt (`raw/q3-ip-socket-eb59b65a-00.png`, seed 31100).
Measured: the diff against the untouched plate is bounded **exactly** by the mask rectangle
(65,74)–(131,158) — outside the mask the return is pixel-identical, so the freeze guarantee is
real. It accepts a `seed`. It returns a composite, which is exactly what the difference-extraction
step wants. **The rest of the experiment uses `inpaint_image`; this is a deviation from the
assigned tool and the reason is measured above.**

`crop_to_mask: false` (job `6dcacfbc`) let the tree spill 35 px above the mask and added a cast
shadow ellipse — rejected, but worth recording as a deliberate lever.

### 3. The growth ladder: 96×128 window, socket (47,100), 8 rungs, feedback + frozen root

To halve the per-call cost the ladder ran on a **96×128 crop** of the padded plate
(`reference/base-crop.png`, crop box `(52,50)–(148,178)`), which still contains the island stem, the
lower lobe, the sand coast and the background hexes. Socket = (47,100) in crop coords = **(99,150)
in the plate**. Mask bottom fixed at y=108.

| rung | mask (rx, top) | job | outcome |
|---|---|---|---|
| s00 | 8, 88 | `27e35d0c-f578-4d8f-8327-bf6f22aa54c9` | tiny sprout, 10×9 px — good |
| s01 | 11, 80 | `9a7f5db0-a630-4aaa-8139-26f3e4b2f614` | **STALL — zero new tree pixels.** The 29 extracted pixels are bit-identical to s00; the model only re-shaded ground |
| s02 | 15, 70 | `5e29f060-45ae-4148-be42-160e5d4bf54d` | small bush-tree, 12×19 — good |
| s03 | 20, 60 | `f4691417-f38d-463f-aecf-b7dd02afb77b` | **STALL** — 12×17, *smaller* than s02 |
| s04 | 25, 50 | `55be35fa-d772-4ce1-83ab-954887ef6c00` | **REJECT — floating crown + island destroyed.** Two disjoint trees (5 components, 259 + 36 + 3 + 1 px), and the model painted the island tile solid white |
| s04r | 25, 50 | `b24e181c-ca17-4b8a-948b-4ef5baf21a32` | re-roll with an anti-detachment prompt: connected again, but **no growth** (12×17, identical to s03) |
| s04b | 25, 50 | `7bee61a7-41d2-4e55-9b69-0503183e6eb6` | **the fix** — size-neutral prompt ("a tree … *filling this whole area*"): 50×49, filled the mask. **KEPT** as frame-02 |
| s05 | 30, 40 | `cc1a1535-7b39-4901-8b84-c863fb89c81e` | 53×59, good tree, but a **smooth** canopy and a light tan trunk — a style outlier vs s04b/s06/s07. Dropped from the track |
| s06 | 35, 30 | `0615107e-9c67-4b24-ba55-e90de6c39de8` | 63×69, stippled canopy, visible root flare — **KEPT** |
| s07 | 40, 20 | `2620b971-6174-4738-934c-ddc838614c12` | 70×77, splayed buttress roots — **KEPT** |

**The measured law of this technique: tree size tracks the MASK, not the prompt.** Rungs s01/s03/s04r
all asked for "a young tree / a small sapling" and all under-filled their mask by 3–4×; s04b asked
for the same object with the size word removed and *"filling this whole area"* added, at the
identical mask, and filled it. Growth control belongs in the mask geometry, and the prompt should
carry only identity ("the same tree").

### 4. The in-context premise degrades as the mask grows — this is the real failure

`all-returns-sheet.png` (top row = unmodified model returns) is the honest picture. At small mask
fractions the model repaints the ground *plausibly* — it re-shades the hex facet under the sprout
and you would not notice. From s04 onward it stops matching the map and starts **replacing** it:

- s04 — the whole masked lobe painted **solid white**.
- s04b — the masked lobe bleached to background pink; the island's coast reads as cut away.
- s07 — the ground under the tree replaced with a **grey-and-white tiled floor** that exists nowhere
  in the plate.

So "a model that can SEE the island's palette, camera and hex tiling will draw a tree that sits in
the scene" is **half true**: the *tree* it draws does sit in the scene (palette, camera, outline
weight and lighting all match — see the bottom row of `contact-sheet.png`), but it does not preserve
the scene it was given. Chaining composites propagates the damage forward.

The delivered composites are therefore **untouched plate + extracted cutout**, not the raw model
returns. The extraction's palette gate removes 100 % of the invented floor: measured, `frames/`
carries **0 greyish/pale pixels** (`|r−g|<18 ∧ |g−b|<18 ∧ r>140`) in any frame.

---

## Delivered track — measured, not claimed

`frames/` — **5 frames, 96×128 transparent PNG RGBA8**, declared root socket **(47,100)**, frame
origin inside the padded plate **(52,50)**. `registration.json` carries the full table.

| frame | rung | alpha bounds (x0,y0)–(x1,y1) | w×h | root anchor | Δ from socket | opaque px | bytes |
|---|---|---|---|---|---|---|---|
| frame-00 | s00 | (43,88)–(52,96) | 10×9 | (48,96) | +1, −4 | 29 | 305 |
| frame-01 | s02 | (42,80)–(53,98) | 12×19 | (47,98) | 0, −2 | 123 | 703 |
| frame-02 | s04b | (22,50)–(71,98) | 50×49 | (47,98) | 0, −2 | 1545 | 4746 |
| frame-03 | s06 | (16,30)–(78,98) | 63×69 | (47,98) | 0, −2 | 2419 | 5669 |
| frame-04 | s07 | (15,22)–(84,98) | 70×77 | (47,98) | 0, −2 | 3009 | 7191 |

- **Root-anchor drift across the track: x = 1 px, y = 2 px.** Anchor rule is round-1's exactly
  (alpha-weighted x over the bottom three occupied rows; bottom-most occupied y).
- **Normalization applied: NONE.** Not "small after correction" — no correction was performed. The
  frames share the plate's coordinate system by construction; the 1 px / 2 px is what the model
  drew. `frames/frame-NN.png` pasted at (52,50) on `reference/plate-pad.png` *is* the composite.
- Encoded 18 614 B total; decoded RGBA 245 760 B. Both well inside the round-1 budget
  (200 000 / 1 600 000 for the whole scene).
- Distinct colours: 1021 (frame-02) / 1034 (frame-04). The plate crop itself carries 2445 distinct
  colours, so the track is **not** noisier than the art it sits in — both are anti-aliased SVG-scale
  renders, not a quantized palette.

### Connectivity — the measurement this experiment exists to make

Component census on the **pre-filter** candidate set (i.e. before the connected-component step could
hide anything):

| rung | pre-CC px | components | component sizes | kept px | discarded by CC |
|---|---|---|---|---|---|
| s00 | 29 | 1 | [29] | 29 | 0 |
| s02 | 123 | 2 | [120, 3] | 123 | 0 |
| **s04 (reject)** | 300 | **5** | [259, 36, 3, 1, 1] | 298 | 2 |
| s04b | 1545 | **1** | [1545] | 1545 | 0 |
| s05 | 1657 | **1** | [1657] | 1657 | 0 |
| s06 | 2419 | **1** | [2419] | 2419 | 0 |
| s07 | 3009 | **1** | [3009] | 3009 | 0 |

Every tree-scale frame is **a single connected component before any filtering**. The CC filter
discarded 0 pixels from every kept frame — it is not papering over a detached crown. frame-01 (s02)
carries one 3-px speck beside the stem; that is the only disconnected material in the delivered
track.

---

## Honest self-assessment against §1's failure list

| failure mode | verdict |
|---|---|
| **seam** between trunk and canopy | **Absent.** One connected component; the canopy pixels touch the trunk pixels directly. |
| **gap** (exp-2's "buggy" canopy↔trunk gap) | **Absent.** Measured, not eyeballed — see the census above. |
| **floating crown** | **Absent in the delivered frames**; it *did* occur once (s04, 5 components) and is preserved as a reject with its job id. |
| **blob** | Frame-02 is close to one — its trunk is almost entirely hidden under a dense dome; it reads as a shrub, not a tree with a trunk. |
| **pasted-on** | **Best result on this axis in the arc so far.** Palette, outline weight, camera and light direction come from the plate itself because the model was looking at it. The trees read as furniture of the island rather than stickers on it. |
| **silhouette snap** | **Present and severe in the ladder as generated** — 12×17 → 50×49 in one rung (4.2× width). Curation hides some of it; frame-01 → frame-02 is still 12×19 → 50×49. This is the track's worst defect. |
| **style pop** | **Present between rungs.** s05's canopy is smooth and its trunk light tan; s04b/s06/s07 are stippled with dark chocolate trunks. I dropped s05 rather than ship the flicker. Frame-02's canopy is also a slightly different green from frame-03/04. |
| **topology mutation** | **Present.** Frame-02 has a stumpy multi-stem base, frame-03 a single fluted trunk, frame-04 splayed buttress roots. A real tree does not re-plumb its base between years. |
| **island damage (new failure mode, not on the list)** | **Severe.** The technique destroys the map it draws into once the mask exceeds ~25 %. The delivered track is clean only because the extraction discards everything plate-coloured. |

**Would I ship this?** Not as a growth track. I would ship **frame-04 (s07) as a hero-tree still**
today — it is the best single tree asset this arc has produced, and it is the first one that looks
like it was drawn by whoever drew the island. The *growth* between frames is not yet honest motion:
it is three good trees of different ages, not one tree ageing.

---

## What I would do next

1. **Drive size with the mask, identity with the prompt.** Now proven (s04b). Re-run the whole
   ladder with one invariant description — *"the same tree: thick brown trunk, splayed roots,
   broad stippled dark-green canopy; fill this area"* — and 8 masks on a smooth height curve
   (18, 26, 34, 44, 55, 65, 72, 78). That single change should remove both the stalls and the snap.
2. **Never chain raw composites — chain `plate + extracted cutout`.** The island damage is
   cumulative and there is no reason to carry it forward. `work/clean-03.png` shows the pattern;
   s04b used it and its context stayed clean until the model bleached it itself.
3. **Keep the mask under ~25 % of the frame.** Below that the model matches the map; above it, it
   replaces it. For a big hero tree, grow the *crop window* instead of the mask fraction — inpaint a
   tall tree into a taller crop so the mask stays a small share of what the model sees.
4. **Pin the palette with `edit_image`.** One `edit_image` call applies one consistent edit to 4
   frames at ≤128 px — exactly the tool for "make all four canopies the same green" and it would
   have killed the s05 style pop for a single call's cost.
5. **Freeze more than the root.** The frozen band was 11–12 px. Freezing the whole trunk below the
   previous crown line would make topology mutation impossible rather than merely unlikely, at the
   cost of a trunk that never thickens — worth one experiment.

---

## Provenance — every call, in order

Model surface: PixelLab MCP (`api.pixellab.ai/mcp`), tools `create_map_object` (style-match /
inpaint) and `inpaint_image` (Gemini-tier masked regeneration). Author-time only.

| # | tool | seed | job id | result |
|---|---|---|---|---|
| 1 | create_map_object | n/a | `87e10186-a802-4184-affe-60b31ac9aebb` | **hard fail** — 155×191 not divisible by 8 after the 4× upscale. No image. |
| 2 | create_map_object | n/a | `5b23a405-709f-4778-aca9-0b870c8b3661` | reject — custom mask, returned island terrain |
| 3 | create_map_object | n/a | `dd2fc39c-ddca-4d51-aed1-0750b5a22a7c` | reject — `"oak tree"`, returned terrain |
| 4 | create_map_object | n/a | `37799f4d-601b-475b-a8b5-663852c3b52b` | reject — verbose anti-terrain prompt, returned terrain |
| 5 | create_map_object | n/a | `81192114-c341-4d62-90c4-8c888541a777` | reject — `"broadleaf tree with green canopy"`, returned terrain |
| 6 | create_map_object | n/a | `6f74a4cb-795c-4c70-b59b-581b43bf779c` | reject — `high top-down`, returned terrain |
| 7 | create_map_object | n/a | `1a3a0b85-bf2b-4a44-9941-fc44b4fc08f5` | **finding** — default oval 0.5, `"oak tree"` → a real transparent tree cutout |
| 8 | create_map_object | n/a | `399f4d9b-4a4f-438b-bce5-5d9edb7536be` | reject — custom mask over background, returned a sand sliver |
| 9 | inpaint_image | 31100 | `eb59b65a-a46d-4770-a3bb-22c012a688b3` | **finding** — proper in-context tree; diff bounded exactly by the mask |
| 10 | inpaint_image | 31101 | `6dcacfbc-fff8-45b7-ace0-9cc9012b17cf` | reject — `crop_to_mask:false` spilled 35 px past the mask, added a cast shadow |
| 11 | inpaint_image | 31110 | `27e35d0c-f578-4d8f-8327-bf6f22aa54c9` | s00 → frame-00 |
| 12 | inpaint_image | 31111 | `9a7f5db0-a630-4aaa-8139-26f3e4b2f614` | s01 — stall, dropped |
| 13 | inpaint_image | 31112 | `5e29f060-45ae-4148-be42-160e5d4bf54d` | s02 → frame-01 |
| 14 | inpaint_image | 31113 | `f4691417-f38d-463f-aecf-b7dd02afb77b` | s03 — stall, dropped |
| 15 | inpaint_image | 31114 | `55be35fa-d772-4ce1-83ab-954887ef6c00` | s04 — **reject**, detached crown + white ground |
| 16 | inpaint_image | 31115 | `cc1a1535-7b39-4901-8b84-c863fb89c81e` | s05 — style outlier, dropped |
| 17 | inpaint_image | 31116 | `0615107e-9c67-4b24-ba55-e90de6c39de8` | s06 → frame-03 |
| 18 | inpaint_image | 31117 | `2620b971-6174-4738-934c-ddc838614c12` | s07 → frame-04 |
| 19 | inpaint_image | 31120 | `b24e181c-ca17-4b8a-948b-4ef5baf21a32` | s04r — connected but no growth, dropped |
| 20 | inpaint_image | 31121 | `7bee61a7-41d2-4e55-9b69-0503183e6eb6` | s04b → frame-02 |
| 21 | inpaint_image | 31130 | `1e376ebb-2d7c-4aa4-a01f-8e95af2210a1` | path ribbon → `path/` |

**21 submissions, 20 returned images, 1 hard failure.** Cost: the shared subscription counter read
1770 generations remaining when this experiment started and 76 when it finished, but **other round-3
experiments were drawing from the same pool concurrently, so that 1694 cannot be attributed to this
experiment**. Per-call cost was not itemised by the API. Observable upper bound for my own spend:
21 calls; the tool card quotes 20–40 generations for `inpaint_image` and `create_map_object` at
these canvas sizes, giving a plausible ~420–840.

### Prompts, verbatim

`create_map_object` probes (all with `background_image` = the 156×192 padded plate):

```
one single tree with a thick brown trunk and a broad rounded olive-green leafy canopy, standing on the tan hex ground
oak tree
a large leafy tree: dark brown vertical trunk rising from the ground, thick round canopy of dark green foliage on top. Not terrain, not a rock, not a hill.
broadleaf tree with green canopy
```

`inpaint_image` socket probes (full 156×192 plate, elliptical mask rx 34, top 74, bottom 158):

```
a tall tree growing on the ground: dark brown trunk rising from the tan hex ground, thick rounded canopy of dark green leaves above it
```

Ladder rungs (96×128 crop, elliptical mask, bottom y=108, previous composite fed back):

```
s00  a tiny tree seedling just sprouted out of the ground: one short thin brown stem with two small dark green leaves. Nothing else - no soil patch, no shadow, no second plant, do not change the ground.
s01  a small tree seedling: one thin brown stem with a few small dark green leaves at its top. Nothing else - no soil patch, no shadow, no second plant, do not change the ground.
s02  a young tree sapling: one slender brown trunk with a small tuft of dark green leaves at its top. Nothing else - no soil patch, no shadow, no second plant, do not change the ground.
s03  a young tree: one slender brown trunk with a small rounded dark green leafy canopy sitting on top of the trunk. Nothing else - no soil patch, no shadow, no second plant, do not change the ground.
s04  a young tree growing taller: one brown trunk with a rounded dark green leafy canopy sitting on top of the trunk. Nothing else - no soil patch, no shadow, no second plant, do not change the ground.
s05  a maturing tree: one thicker brown trunk with a broad rounded dark green leafy canopy sitting on top of the trunk. Nothing else - no soil patch, no shadow, no second plant, do not change the ground.
s06  a nearly mature tree: one thick brown trunk with splayed roots at its base and a wide rounded dark green leafy canopy sitting on top of the trunk. Nothing else - no soil patch, no shadow, no second plant, do not change the ground.
s07  a large mature hero tree: one thick brown trunk with splayed roots at its base and a very wide rounded dark green leafy canopy sitting on top of the trunk. Nothing else - no soil patch, no shadow, no second plant, do not change the ground.
```

Targeted re-rolls:

```
s04r  one single small tree standing on the tan hexagonal ground: a brown trunk that starts at the ground and runs unbroken upward into a small rounded dark green leafy canopy. Keep the tan hexagonal ground and the sand coast exactly as they are - do not paint the ground white or grey, do not add a second tree, no shadow, no soil patch.
s04b  a tree with a thick brown trunk and a broad rounded dark green leafy canopy, filling this whole area, standing on the tan hexagonal ground. Keep the tan ground and the sand coast exactly as they are; exactly one tree; no shadow, no soil patch.
path1 a worn dirt footpath trodden into the ground: a narrow strip of bare packed brown earth with a few small pebbles and slightly darker crumbly edges, running diagonally from the lower left to the upper right. Nothing else - no grass tufts, no fence, no plants, no shadow.
```

---

## Files

**If you look at three things, look at `preview-in-plate.gif` (the track animating inside the real
island), `contact-sheet.png` (what shipped) and `all-returns-sheet.png` (what the model actually
returned, island damage included).**

| path | what |
|---|---|
| `frames/frame-00.png` … `frame-04.png` | the delivered track — 96×128 transparent RGBA8, socket (47,100) |
| `registration.json` | per-frame alpha bounds, anchor, Δ-from-socket, opaque px, bytes |
| `contact-sheet.png` | every delivered frame: cutout on checker (top) + the same frame composited into the real plate (bottom) |
| `all-returns-sheet.png` | **every rung including the stalls and the reject** — top row is the unmodified model return, so the island damage is visible |
| `preview.gif` | 5 frames, 3× nearest-neighbour, dark field, 260 ms/frame + a 1.2 s hold on the last (one global palette — a per-frame adaptive palette shreds a GIF's colours) |
| `preview-in-plate.gif` | the same 5 frames animating inside the real island plate, 2× |
| `raw/` | every unmodified model return, named `<label>-<job-prefix>-00.png` |
| `path/` | the dirt-path ribbon, the directionless 16×16 swatch and its seamless 32×32 mirror, plus provenance (see `path-growth.md`) |
| `masks/` | the inpainting masks for the kept rungs and the path |
| `reference/plate-pad.png` | the 156×192 padded island plate (the 155×191 reference plate + 1 replicated column/row so the 4× upscale divides by 8) |
| `reference/base-crop.png` | the 96×128 window the ladder ran in, crop box (52,50)–(148,178) |
| `work/` | the Python that produced all of it — `lib.py` (b64/anchor/diff), `mask.py`, `ladder.py`, `extract.py` (the palette-gate + CC extractor), `finalize.py`, plus every intermediate composite and cutout |

Round-1 assets were **read only** and never modified. Nothing outside this directory was touched.
