# exp-14-pro-reference — Pro model with labelled references and a style lock to the island plate

Round 3, arc `chapter2-pixellab-organic-growth-arc`. Author-time only (ADR-0274 D2 / ADR-0219): no
vendor call, credential, hostname or model call reaches the repo, a build artifact or the browser.

## The question

Round 1/2 proved that *mechanical registration is not enough* — a separately authored crown attached
to a separately authored trunk keeps reading as a seam, gap, blob or floating canopy (ADR-0277
rejected the occlusion-registered canopy after a focused fix). The open question is whether
continuity can come from **how the art is generated**.

`create_image_pro` is the only PixelLab tool that had never been used on this arc, and the only one
that accepts up to **four labelled reference images** (each with a `usage` note saying what to take
from it) plus a **separate `style_image` with a narrowed `style_copy`**. At ≤170 px it returns **four
candidates for one call's cost**, so continuity can be enforced by *choosing* rather than by hoping.

## The technique in two sentences

Every frame is a single `create_image_pro` call at 168×168 on **one fixed seed (31400)**, with a
**fixed labelled reference pair** (a species card + the real island plate, each carrying its own
`usage` note) and the island plate locked in as `style_image` with `style_copy:
["color_palette","shading"]`; the prompt is one **byte-identical body paragraph** with a single
swapped `GROWTH STAGE:` clause. Each call returns four candidates, and the nine-frame ladder is then
**selected** out of that 72-candidate pool by measurement — foliage mass, silhouette height and
width, root-fan spread, trunk wood-column centre — and normalized author-time onto a fixed 192×192
canvas at one root anchor.

## What actually happened — the three attempts, in order

### Attempt 1 (rejected): chain each stage off the previous one

The brief's design: reference 1 = the previous stage ("the exact tree to continue growing"),
reference 2 = the island plate, style = the island plate. Fired stage 0 (`f4b9ab28`, seed 31400) and
then stage 1 (`773dad17`, seed 31401) with the chosen stage-0 candidate as reference 1.

**Measured result: the chain does not hold.** All four stage-1 candidates came back as stout,
orange-lit young trees with a 12 px trunk, referencing a stage-0 whose trunk was 3 px. Bark shading,
leaf count and trunk mass all changed. `reference_images` on this model is a **subject/style hint,
not geometry to preserve** — that is the single most important finding in this experiment, and it is
what kills the prescribed chained ladder.

### Attempt 2 (rejected): keep the seed but lock the style to the raw island plate

Same seed for every stage, references held fixed, `style_copy:
["color_palette","outline","shading"]` against the full island plate. Two problems, both visible at a
glance and both traced:

- **`outline` copies the island's cream coastline rim as a sticker halo** — 2 of the 4 stage-0
  candidates in `f4b9ab28` wear a thick cream outline; a third carries a soil/debris strip at the base.
- **The cream coastline plus my own prompt wording ("cream-lit top edge") produced a bright white
  birch stripe down every trunk** in `43fbbffb`. See `raw/v2s04-43fbbffb-*.png`.

Fix, both sides at once: cut a **core plate** with the cream rim stripped
(`work/plate-island-core.png`, 95×136, hue-separated at `r − b ≥ 45` then `r>205 & g>190` removed),
narrow `style_copy` to `["color_palette","shading"]`, and reword the prompt to "a soft sand-lit top
edge … no white or cream stripe on the trunk". The A/B is `raw/v2s04-43fbbffb-*` (before) against
`raw/v3s04-3485f134-*` (after): the stripe is gone and the greens come back.

### Attempt 3 (shipped): seed-locked prompt-morph family, then select

Eighteen Pro calls in this configuration produced 72 candidates. The **style lock held perfectly**
across all of them — mean foliage colour across 9 independent calls sits in
`(80±8, 100±10, 52±5)` and mean bark in `(100±15, 63±8, 42±5)` (`work/hue.py`). **Identity did not
hold**: every call draws a *different tree of the same species*, so the ladder had to be selected.

Selection went through `work/pick.py` (a DP over the pool minimising adjacent change in height,
width, root-fan spread, trunk wood-column width and centre, with a term pricing departure from an
even geometric growth pace) and was then hand-corrected on three frames after looking at the strip.

## The frames

Fixed canvas **192×192 RGBA8**, **9 frames**, registered root anchor **(96, 188)** — deliberately the
same canvas, frame count and anchor as the round-1 leader so the owner can A/B directly
(`comparison-vs-round1.png`).

| frame | source candidate | job | prompt | source anchor | offset | normalized anchor | drift | footprint x,y,w,h | bytes |
|---|---|---|---|---|---|---|---|---|---|
| `frame-00.png` | `v3s00-f05197dc-00` | `f05197dc` | stage-00 | (82,152) | (+14,+36) | (96,188) | **0,0** | 55,71,91,118 | 4517 |
| `frame-01.png` | `v3s00-f05197dc-01` | `f05197dc` | stage-00 | (62,153) | (+34,+35) | (96,188) | **0,0** | 76,65,84,124 | 4348 |
| `frame-02.png` | `v3st-a4e90a6b-02` | `a4e90a6b` | stage-t | (80,155) | (+16,+33) | (96,188) | **0,0** | 51,55,89,134 | 7725 |
| `frame-03.png` | `v3s04-3485f134-00` | `3485f134` | stage-04 | (84,153) | (+12,+35) | (96,188) | **0,0** | 59,61,75,128 | 7491 |
| `frame-04.png` | `v3st-a4e90a6b-00` | `a4e90a6b` | stage-t | (76,158) | (+20,+30) | (96,188) | **0,0** | 55,39,89,150 | 9688 |
| `frame-05.png` | `v3s05-9339b845-00` | `9339b845` | stage-05 | (82,151) | (+14,+37) | (96,188) | **0,0** | 49,51,94,138 | 6045 |
| `frame-06.png` | `v3s04b-6d0f1152-00` | `6d0f1152` | stage-04b | (79,146) | (+17,+42) | (96,188) | **0,0** | 52,63,99,126 | 4772 |
| `frame-07.png` | `v3s08-641923d4-03` | `641923d4` | stage-08 | (89,144) | (+7,+44) | (96,188) | **0,0** | 26,67,126,122 | 11245 |
| `frame-08.png` | `v3s07-75ea7c28-00` | `75ea7c28` | stage-07 | (78,152) | (+18,+36) | (96,188) | **0,0** | 37,52,127,137 | 5376 |

Budget: **encoded 61 207 B** (round-1's tree track was 144 006 B), **decoded RGBA 1 327 104 B**,
9 frames. No frame was scaled, recoloured or redrawn — the only author-time operations are a
speckle floor (24 px connected components; **nothing was removed from any shipped frame**) and the
integer translation in the table above.

## Measured continuity (`continuity.json`, `work/continuity.py`)

Per-frame, against the registered ground line y=188 and anchor x=96:

| frame | w | h | anchor Δx | anchor Δy | trunk wood centre @45px | trunk wood width @45px | foliage px |
|---|---|---|---|---|---|---|---|
| 00 | 91 | 118 | 0 | 0 | 101.5 | 8 | 639 |
| 01 | 84 | 124 | 0 | 0 | 105.5 | 8 | 940 |
| 02 | 89 | 134 | 0 | 0 | 95.5 | 8 | 1430 |
| 03 | 75 | 128 | 0 | 0 | 102.0 | 3 | 1935 |
| 04 | 89 | 150 | 0 | 0 | 100.5 | 16 | 2768 |
| 05 | 94 | 138 | 0 | 0 | 95.5 | 18 | 3164 |
| 06 | 99 | 126 | 0 | 0 | 104.0 | 17 | 4101 |
| 07 | 126 | 122 | 0 | 0 | 90.5 | 28 | 5056 |
| 08 | 127 | 137 | 0 | 0 | 98.5 | 24 | 5343 |

Per adjacent pair:

| pair | silhouette IoU | lower-trunk-band IoU | trunk centre Δ | Δh | Δw | foliage × |
|---|---|---|---|---|---|---|
| 00→01 | 0.258 | 0.468 | +4.0 | +6 | −7 | 1.47 |
| 01→02 | 0.185 | 0.367 | −10.0 | +10 | +5 | 1.52 |
| 02→03 | 0.345 | 0.662 | +6.5 | −6 | −14 | 1.35 |
| 03→04 | 0.359 | 0.588 | −1.5 | +22 | +14 | 1.43 |
| 04→05 | 0.390 | 0.507 | −5.0 | −12 | +5 | 1.14 |
| 05→06 | 0.523 | 0.476 | +8.5 | −12 | +5 | 1.30 |
| 06→07 | 0.543 | 0.522 | −13.5 | −4 | +27 | 1.23 |
| 07→08 | 0.532 | 0.525 | +8.0 | +15 | +1 | 1.06 |

**Headline numbers, measured not claimed:**

- **Root-anchor drift: 0 px on every frame, x and y.** That is by construction — the author-time
  normalization translates each frame so the alpha-weighted bottom-row anchor lands exactly on
  (96, 188). It is a true statement about the shipped asset and a weak one about the art.
- The number that says whether *the same tree* is standing there is the **trunk wood-column centre
  45 px above the ground line: it wanders between 90.5 and 105.5 px against a 96 px anchor, and the
  worst frame-to-frame shift is 13.5 px (06→07).** So the root *contact* is pinned but the trunk
  *leans* by up to ±9.5 px around it.
- **Minimum adjacent silhouette IoU 0.185** (01→02) and **minimum lower-trunk-band IoU 0.367**. The
  canopy half is far steadier (0.52–0.54 silhouette, ~0.52 trunk band) than the sapling half.
- Foliage grows monotonically at 1.06–1.52× per step — no stall, no reversal, no jump.

## Honest self-assessment against the recorded failure list

| failure | verdict |
|---|---|
| **seam** between trunk and canopy | **absent.** Every frame is one drawn object; there is no authored join to seam. |
| **gap** (the #2 "buggy" band) | **absent, 0 px.** No frame has a transparent band between wood and leaves. |
| **floating crown** | **absent.** In frames 04–08 the branches are visibly drawn *into* the underside of every lobe; you can trace bark from the root fan to inside the canopy in all four. This is the single strongest thing here. |
| **blob canopy** | **absent.** The canopy is built from discrete lobes carried on branches, with sky between them, right through to frame 08. Round-1's frame 06–08 canopy is a lit blob by comparison. |
| **pasted-on crown** | **absent.** |
| **silhouette snap** | **reduced but not gone.** The old 5→6 snap is gone; the residual one is 03→04, where separate leaves become lobes. I generated a dedicated bridge frame for exactly this (`a4e90a6b`, "caught HALFWAY between separate leaves and a canopy") and it is frame 04 — two lobes closed at the lowest branch tips with separate leaves still above. It softens the change; it does not erase it. |
| **style pop** | **absent, and measured.** Foliage mean `(80±8,100±10,52±5)` and bark mean `(100±15,63±8,42±5)` across nine independent calls. The style lock is the part of this technique that unambiguously works. |
| **topology mutation** | **PRESENT, and it is this track's real weakness.** Every frame is a different tree. The trunk changes shape frame to frame (three-stem at 00, single leaning whip at 01, straight at 02, fluted at 07). Watch `preview.gif` and you see growth, but you also see the trunk re-draw itself each beat. Round-1 beats this track on exactly this axis and loses on every other. |

**Would I put this in front of the owner as the polish candidate?** Yes for the art, with the
topology caveat stated. Per frame it is clearly the best-looking and best-connected tree the arc has
produced. As a *sequence* it trades round-1's rock-steady trunk (frames 0–5 are literally the same
trunk) for a real end-to-end growth curve with no blob snap.

## What I would do next

1. **Stop asking Pro for identity — ask it for the anchors.** Use Pro exactly as here to author three
   anchor poses (00 / 04 / 08) that agree on trunk shape, then generate the six in-betweens with
   `animate_object` mode `v3` (`custom_start_frame_base64` + `end_frame_base64`, 4–16 frames), which
   *is* geometric. That keeps Pro's art and buys round-1's trunk steadiness. It was not tried here
   because the shared round-3 generation pool ran down to 73 while this experiment was finishing.
2. **`edit_image` for the last mile.** It applies one consistent edit across 4 frames at ≤128 px in a
   single call — the right tool to force the nine frames onto one bark ramp after selection.
3. **Fix frames 00–02 first.** They carry the two worst IoUs (0.258, 0.185). A dedicated seedling call
   at a *smaller* canvas (85 px ⇒ 16 candidates for one call) would give four times the choice
   exactly where the pool is thinnest.
4. Never copy `outline` from the island plate — that lever only produces the cream sticker halo.

## Every call, in order (18 calls × 25 generations = 450 generations)

All `create_image_pro`, 168×168, `no_background: true`, 4 candidates per call.

| # | job id | seed | prompt | style plate / `style_copy` | outcome |
|---|---|---|---|---|---|
| 1 | `f4b9ab28-0e21-4d14-bb77-5d9b6c1606b7` | 31400 | v1 stage-00 | island-only (cream rim) / palette+**outline**+shading | mixed — cand 00 carries a **soil/debris strip**, 00 and 01 carry a **cream sticker halo**; cand 03 kept as the species card, cands 00/01 **rejected** |
| 2 | `773dad17-8175-407e-8354-79140e1015f2` | 31401 | v1 stage-01 (chained, 3 refs) | island-only / palette+shading | **REJECTED — the chain failed.** All 4 candidates are stout orange-lit trees unrelated to the stage-0 they referenced |
| 3 | `43fbbffb-8451-4386-b867-927d2745bda0` | 31400 | v2 stage-04 | island-only (cream rim) / palette+shading | **REJECTED — white birch stripe** down every trunk, traced to the plate's cream coastline + "cream-lit" wording |
| 4 | `3485f134-9654-4d4f-a3c1-f12e2ba7beee` | 31400 | stage-04 | **core plate** / palette+shading | accepted — cand 00 → `frame-03` |
| 5 | `f05197dc-064f-4042-aee8-3485a5a658ad` | 31400 | stage-00 | core / palette+shading | accepted — cands 00, 01 → `frame-00`, `frame-01` |
| 6 | `a3af5768-d5f9-4d1a-8005-caec14639e1f` | 31400 | stage-01 | core / palette+shading | pool only |
| 7 | `e9247652-1162-46e1-8dc7-8ad3b32753f9` | 31400 | stage-02 | core / palette+shading | pool only |
| 8 | `d8199048-f8a1-4eb9-8923-e4999ca251e5` | 31400 | stage-03 | core / palette+shading | pool only — this call went *backwards* (less foliage than stage-02) |
| 9 | `9339b845-978e-4ea4-8a3e-f946007f8e42` | 31400 | stage-05 | core / palette+shading | accepted — cand 00 → `frame-05` |
| 10 | `f7355ced-698b-4768-aaa0-b5bea1f77568` | 31400 | stage-06 | core / palette+shading | **3 of 4 rejected** — the prompt's "windows of transparent sky" were painted as literal **white/pale-blue patches** inside the canopy (528 / 211 / 22 pale px) |
| 11 | `75ea7c28-f366-4650-b827-1e6e4410a4cd` | 31400 | stage-07 | core / palette+shading | accepted — cand 00 → `frame-08` (cand 01 rejected, 32 pale px) |
| 12 | `641923d4-dc73-4d48-b788-80d6dd3087da` | 31400 | stage-08 | core / palette+shading | accepted — cand 03 → `frame-07` (cands 00/01/02 rejected, 52/128/58 pale px) |
| 13 | `491cadb2-b53a-4593-ac29-2244b56fe847` | 31400 | stage-02b | core / palette+shading | pool only — asked for lobes, got leaf sprays |
| 14 | `cef10f22-a60d-486f-85c7-bcd72e79b8cf` | 31400 | stage-03b | core / palette+shading | pool only — same |
| 15 | `6d0f1152-8349-4043-850e-1bf5a9b62bb9` | 31400 | stage-04b | core / palette+shading | accepted — cand 00 → `frame-06`; the first call where "eight rounded lobes" actually produced lobes |
| 16 | `5b6402df-3e99-4e9d-82fe-8125fa378e28` | 31400 | stage-03c | core / palette+shading | **REJECTED** — "fist-sized lobes" produced three *giant single leaves*, and bark drifted light (mean `(137,90,61)` vs the family's `(95,58,38)`) |
| 17 | `f3d1910d-a3cb-43b0-a4df-ceb93a2f400a` | 31400 | stage-04c | core / palette+shading | **REJECTED** — same failure, same bark drift |
| 18 | `a4e90a6b-bda3-4c2d-8456-8d61fa3608be` | 31400 | stage-t (bridge) | core / palette+shading | accepted — cands 02, 00 → `frame-02`, `frame-04`. The one prompt that produced the half-state |

Reference images were passed as `base64` (not `url`) on every call. The fixed pair from call 4
onward was:

- `work/species-card.png` (= `raw/s00-f4b9ab28-03.png`), usage: *"the exact tree this is - keep this
  bark colour, leaf shape, root flare and drawing style identical"*
- `work/plate-island-core.png`, usage: *"the scene this tree stands in - match its camera angle and
  palette"*

`style_image_base64` = `work/plate-island-core.png`, `style_copy = ["color_palette","shading"]`.

### Prompts, verbatim

Every prompt is the same body with one swapped `GROWTH STAGE:` clause. The body (from call 4 onward):

> A single hero tree, pixel art, seen from a low top-down two-and-a-half-D isometric camera exactly
> like the reference island plate. Warm mid-brown bark with a soft sand-lit top edge and an umber
> shadow side, no white or cream stripe on the trunk; small pointed leaves in olive, moss and sap
> green; a crisp dark outline around the silhouette. The tree stands alone and centred with its root
> flare meeting the bottom-centre of the frame, and it is ONE continuous woody organism - the bark
> runs unbroken from the roots up into every branch, every leaf clump is carried on a branch that is
> drawn entering it from below, there is never a gap, seam or empty band between the trunk and the
> leaves, and never a ball of foliage floating above the tree. GROWTH STAGE: **{clause}**. Fully
> transparent background. NO ground, NO soil, NO grass, NO island, NO rock, NO shadow platform, NO
> border, NO frame, NO second tree, NO text.

The seven clauses used by shipped frames:

- **stage-00** (frames 00, 01) — *a bare-stemmed seedling - one finger-thin whip forking once, three
  small surface roots, about eight leaves only on the top twigs, the tree mostly bare wood*
- **stage-t** (frames 02, 04) — *a young tree caught HALFWAY between separate leaves and a canopy - a
  thumb-thick trunk with a surface-root fan, where the two LOWEST branch tips have just closed into
  small rounded lobes of foliage while every upper branch still carries separate pointed leaves in
  pairs; two small lobes and about twenty separate leaves on the same tree, with transparent sky
  between all of them*
- **stage-04** (frame 03) — *a half-grown tree - an arm-thick trunk, the leaf clusters grown into
  small rounded lobes that are only just beginning to touch, wide sky gaps still showing the branches
  through*
- **stage-05** (frame 05) — *a three-quarter-grown tree - a thick trunk with two buttress roots, the
  foliage lobes broadened into a lumpy open crown that follows the branches beneath rather than a
  smooth ball, branches drawn crossing the gaps into each lobe*
- **stage-04b** (frame 06) — *a half-grown tree - an arm-thick trunk with a root buttress carrying
  eight rounded lobes of foliage that are only just beginning to touch each other, sky gaps still
  showing the branches running out into every lobe*
- **stage-08** (frame 07) — *a fully adult hero tree - a stout fluted trunk with four buttress roots
  splitting into three heavy limbs that are drawn entering the underside of a broad heavy
  softly-lobed canopy, with one small sky window beside the trunk showing the branch structure inside*
- **stage-07** (frame 08) — *an almost adult tree - a thick fluted trunk with three buttress roots, a
  wide nearly-closed canopy still built from overlapping rounded lobes with one or two sky windows
  beside the trunk where the heavy limbs enter the leaves*

The unshipped clauses (stages 01, 02, 03, 06, 02b, 03b, 03c, 04c) are on disk in `work/prompts2/`.
The rejected attempt-1 prompts are in `work/prompts/`.

Note the two clause↔frame inversions: `stage-08`'s output is the *smaller* tree and `stage-07`'s is
the larger, and `stage-04b`'s output out-masses `stage-05`'s. The prompt's stage label is not the
ladder index — the ladder index came from the measurement.

## Files

- `raw/` — all 72 unmodified candidates, named `<stage>-<job prefix>-<index>.png`.
- `frames/frame-00…08.png` — the shipped 192×192 track.
- `tree-registration.json` — per-frame source, anchor, offset, footprint, bytes.
- `continuity.json` — per-frame and per-pair continuity measurements.
- `contact-sheet.png` — the nine frames on a checkerboard, with the registered ground line (y=188)
  and root anchor (x=96) drawn in orange so the 0 px drift claim can be eyeballed.
- `preview.gif` — 3× nearest-neighbour, dark field, 420 ms per beat and a 1.5 s hold on the adult.
- `comparison-vs-round1.png` — round-1's accepted track above, this one below, same canvas and anchor.
- `path-growth.md` — the path-growth treatment.
- `work/` — the authoring scripts (`mkargs.py`, `fire.sh`, `anchor.py`, `measure.py`, `hue.py`,
  `pick.py`, `build_track.py`, `continuity.py`, `deliver.py`), the prompts, the derived style plates,
  and the rejected ladders. Kept so every number above is reproducible.

## Constraints honoured

- PixelLab is author-time only; the shipped artifact is nine transparent PNGs plus JSON. No vendor
  call, credential, hostname or asset-owned clock is anywhere in this directory. The token was never
  printed or written.
- Fixed transparent canvas (192×192), fixed frame count (9) and order, one stable root socket
  (96, 188), author-time crop + anchor normalization, recorded prompt/model/seed/job-id provenance,
  byte budget stated.
- The app keeps semantic state, normalized progress, frame selection, timing, easing, holds,
  Next/Back/Replay, reduced-motion settlement, sockets, depth slot and painter order. These frames
  are appearance only.
- The island is **not** touched: experiment 6's connected SVG accretion stays the control, and no
  land, coast or composite was generated (ADR-0274 D1/D6). The plant track is **reused unchanged**
  from round 1 per ADR-0277 D2 — the registered cutout/pose technique is selected and this experiment
  does not replace it, so no generation budget was spent on plants.
- Nothing outside this directory was written or modified.
