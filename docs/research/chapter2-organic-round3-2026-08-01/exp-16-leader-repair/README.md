# exp-16-leader-repair — finish the leader

**Question.** The round-1 pose-to-pose tree is the provisional leader ("probably the most" liked of
everything the owner has seen), and it was never adopted because of the composition around it — not
because of the tree. But the track itself carries two visible faults: its palette and outline weight
do not belong to the SVG island, and its topology jumps from sparse sapling to full mature crown in
one step. **Is the leader losing to nothing but its own finish and its one bad cut?**

**Technique, in two sentences.** Batch the nine round-1 frames through `edit_image` in **reference
mode** against a plate built from the real island — one edit applied consistently across a group, so
the whole track moves together — then collapse the three batches onto ONE shared 32-colour palette
and tune that palette (not the pixels) so geometry cannot move. Then manufacture true in-betweens
with `animate_image` pinned first-and-last across each weak adjacent pair, accept only the frames
that are actually monotone, and splice.

**Verdict up front.** Yes, mostly. The repaired track is 19 frames on a 128x128 canvas, root-anchor
drift **≤0.49 px in x and 0 px in y**, the worst frame-to-frame mass step is **+26.7%** (the source's worst was +77.5%),
and **all 19 frames are a single 8-connected body — zero detached canopy pixels anywhere in the
track.** The two things it does not fix are stated in *Honest self-assessment* below.

---

## 1. What was actually wrong — measured, before touching anything

Round-1 source (`packages/app-surface/src/assets/chapter2-organic-pose-to-pose/tree/`, copied
unmodified to `src-frames/`; the originals were never written to):

| frame | 00 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 |
|---|---|---|---|---|---|---|---|---|---|
| alpha px | 3209 | 3227 | 4151 | 4345 | 4776 | 6280 | **11146** | 12301 | 12564 |
| step | — | +0.6% | +28.7% | +4.7% | +9.9% | +31.5% | **+77.5%** | +10.4% | +2.1% |

So the brief's "frames 6→7" is the 0-indexed **05→06** step, and it is a **+77.5%** mass jump in one
frame. It is worse than that number suggests: at 05 the tree is a single-stem sapling with individual
painterly leaves plus one blob cluster; at 06 it is a multi-stem buttressed trunk with a full blob
canopy. Two topology mutations fire simultaneously.

Two further faults nobody had listed:

- **Frames 06/07/08 carry a ground fragment** — a green grass tuft, a brown soil mound, pebbles and
  pink flowers — that frames 00–05 do not have. It pops in at the same step as the crown. It is also
  a *land* fragment inside a *tree* asset, which ADR-0274 D1/D6 puts on the wrong side of the line.
- **Style.** Composited onto the real island plate (`evidence/before-round1-source-on-island.png`)
  the mismatch is specific, not vague. Measured over the whole source track vs. the island body:
  foliage mean saturation **0.637** and bark **0.687**, against an island whose entire body is three
  desaturated tan facets (`(166,133,86)`, `(177,148,105)`, `(188,161,118)`) with a **cream** rim and
  no dark linework at all. The tree also carries near-black outlines. It reads as a painted sticker
  laid on a flat vector world.

---

## 2. The pipeline, stage by stage

### Stage A — de-ground frames 06/07/08 (`edit_image`, text mode, 3 frames @128)

The first attempt (`seed 31600`) was **rejected by the vendor**, not by me:
`Generation failed (Generation failed because it is against policy...)`. Rewriting the same
instruction positively — "become empty transparent space" rather than "erase/delete" — passed. Worth
knowing: imperative deletion verbs trip the filter.

### Stage B — style unification (`edit_image`, reference mode, 3 batches of 3 @128)

The reference is **not** the island plate as-is. Feeding a tan plate as a style reference asks the
model to make a tan tree. So `work/mkstyleref.py` builds a two-panel plate deterministically from the
real render (`evidence/style-reference-plate-3x.png`): **left** = the island body untouched (teaches
outline weight, flat facet shading, value range, low contrast); **right** = the *same facets*
hue-rotated to foliage green above and bark brown below (teaches what green and brown look like when
drawn in that language). No generated art in the reference.

`edit_image`'s reference mode caps at **3 frames per call at ≤128 px** ("one fewer in reference
mode"), so nine frames is three calls, and three independent calls drift. Measured drift between
batches, foliage: hue 0.2177 / 0.2249 / 0.2045, saturation 0.277 / 0.257 / 0.314, value 0.633 / 0.612
/ 0.544. Real but small. Closed in two deterministic passes (`work/unify.py`): per-batch S/V
correction to the pooled mean, then a single MEDIANCUT quantisation of the whole track to **one
32-colour palette**. Neither pass moves a pixel.

### Stage C — palette tune on the palette, not the pixels (`work/tune.py`)

The restyle overshot into washed-out: on the island the sapling ghosted into the land
(`evidence/palette-tune-candidates-on-island.png`, top row). The tune re-saturates and re-separates by
transforming the **32 palette entries**, so every frame receives the identical mapping and geometry is
untouched by construction. Preset `p4` was chosen by looking at four candidates composited on the real
island.

One bug found by measurement, not by eye: hue alone mis-sorts this palette. The **canopy highlight**
sits at hue **52.5°** and the **trunk** at **33°**, so a naive `0.15 ≤ h ≤ 0.47` foliage test sent the
pale crown tops into the *bark* branch and browned them — grey-taupe blobs appeared in the middle of
the canopy. Fixed by resolving the ambiguous 36–62° olive band with each colour's **mean y across the
track** (canopy colours live high, trunk colours live low). The blobs disappeared.

### Stage D — temporal densification (`animate_image`, first+last pinned)

`animate_image` treats a pinned pair as an *action over a duration*, not a monotone morph: at
`frame_count 4` it sprints past the pinned end and comes back, which for a growth track means the tree
visibly balloons and deflates. At `frame_count 8` the early frames are well-behaved and only the tail
overshoots. So every pair was run at 8 (or 6) and only frames whose alpha mass lies **strictly between
the two endpoints** were accepted.

### Stage E — a beat the track never had

The source starts at an already-leafed sapling, so it never "grows from nothing" — the exact complaint
that sank experiment 4. One `edit_image` call authored a seedling from frame-00, and a 6-frame
`animate_image` grew it back up to frame-00. That run came back **fully monotone** (858 → 1087 → 1292
→ 1447 → 1473 → 1611 → 1623) with every frame usable.

### Stage F — normalise, prune, measure

- **Anchor.** `(trunkX, groundY)`, where `groundY` is the bottom-most opaque row and `trunkX` is the
  alpha-weighted x over the 10-row band **32–22 px above** it — the trunk axis *above* the root flare,
  so a wider or narrower root spread cannot drag the anchor sideways. The band was chosen by
  measurement, not taste: across eight candidate bands it had both the smallest spread (**1.49 px**)
  and the smallest mean frame-to-frame jitter (**0.44 px**). The pre-normalisation spread of 1.49 px
  is itself the honest headline — the vendor's edits and interpolations barely moved the root at all.
- **Stray prune.** Any 8-connected opaque component that is not the one containing the bottom-most
  pixel is deleted. This makes "the tree is one body" a **property of the pipeline** rather than of
  luck. It fired exactly once: **73 px** on frame-03 — a floating leaf beside the stem
  (`rejects/pruned-stray-leaf-frame03-highlighted-red.png`).

---

## 3. Every prompt, verbatim

**A1 — de-ground, REJECTED by policy** (`edit_image`, seed 31600, job `70ff8824-be97-4cc2-a3e2-efc00ba4dcc6`):

> Erase the ground under the tree. Delete the green grass tuft, the brown soil mound, the scattered pebbles and the small pink flowers at the base, so that the bare roots end on a fully transparent background with nothing beneath them. Do not change the tree itself: the trunk, every branch, every leaf, the canopy silhouette and the root flare must stay pixel-identical in the same position. No new ground, no shadow, no grass, no dirt.

**A2 — de-ground, accepted** (`edit_image`, seed 31601, job `1dc106d7-9f2d-439c-9693-12abf740f3b1`):

> Show this same tree with clean bare roots standing on nothing: the patch of grass, the mound of soil and the small flowers around its base become empty transparent space. The tree keeps exactly the same trunk, the same branches, the same leaves, the same canopy outline and the same root flare, in exactly the same place.

**B — style unification** (`edit_image` reference mode; `reference_image_url` = the two-panel style
plate; seeds 31602 / 31603 / 31604 for frames 00–02 / 03–05 / 06–08, and seed 31605 for the rejected
64 px variant):

> Restyle the colours only. Keep the exact same silhouette, the same pose, the same branch layout and every leaf and root exactly where it is. Take the palette, the soft cream-and-brown outline, the flat facet shading and the gentle low contrast from the reference plate: turn the near-black outline into a warm mid brown, mute the greens toward a soft sage olive, warm and desaturate the bark, and flatten the glossy highlights into flat blocks of colour. It must still read as a green leafy tree on a fully transparent background.

**D1 — densification, first attempt, REJECTED** (`animate_image`, seed 31606, job `3e6f0a25-…`):

> the tree grows: the trunk and its branches thicken and spread outward while a full round leafy canopy fills in over the crown, leaf mass expanding continuously from the existing branch tips

**D2 — densification, corrected action** (used for every accepted interpolation; seeds 31610–31617):

> the tree grows in place: the trunk and branches thicken and spread outward while the leafy canopy fills in continuously from the existing branch tips, every leaf cluster staying attached to a branch. The tree stands on nothing - empty transparent space below the roots, no soil, no dirt mound, no grass, no pebbles, no falling leaves, and no floating detached foliage.

**E1 — seedling, REJECTED** (`edit_image`, seed 31618, job `949c8b37-…`):

> Make this a much younger seedling at the very start of its life: a single short slender stem barely taller than the root flare, carrying only two or three small leaves near the tip, with the root flare small and low. Keep the identical art style, the same warm brown bark, the same sage-green leaf colour, the same soft brown outline, the same low camera angle, and the same transparent background with no soil, no grass and no ground.

**E2 — seedling, accepted** (`edit_image`, seed 31619, job `1796a097-…`):

> Replace this young tree with a tiny newly sprouted seedling that is about one third as tall and one third as wide: a single slender stem carrying two small rounded leaves, and at its base only a narrow little root collar with two or three short thin rootlets - NOT the wide spreading root flare of a grown tree. Keep the identical art style, the same warm brown bark, the same sage-green leaf colour, the same soft brown outline and the same low camera angle, on a transparent background with no soil, no grass, no ground and no shadow.

**E3 — seedling growth** (`animate_image`, seed 31620, job `ae91862b-…`):

> the seedling grows in place: its stem lengthens and thickens, its roots spread wider and grip down, and new leaves unfold along the stem, every leaf staying attached to the stem. It stands on nothing - empty transparent space below the roots, no soil, no dirt, no grass, no shadow.

---

## 4. Generation ledger — every call, including the rejects

Model surface: PixelLab MCP (`edit_image`, `animate_image`). Seed block 31600–31620, none reused.
**~176 generations spent.** Balance after this experiment: 31 remaining of 2000 (the pool is shared
across the round's parallel experiments).

| # | tool | job id | seed | args | cost | outcome |
|---|------|--------|------|------|------|---------|
| 1 | `edit_image` | `70ff8824-be97-4cc2-a3e2-efc00ba4dcc6` | 31600 | de-ground f06–08, 3f @128, text | ~20 | **REJECT — vendor policy refusal.** Imperative "erase/delete" wording. |
| 2 | `edit_image` | `1dc106d7-9f2d-439c-9693-12abf740f3b1` | 31601 | de-ground f06–08, 3f @128, text | ~20 | ACCEPT — ground gone, roots clean. Trunk mass mutated slightly (see §5). |
| 3 | `edit_image` | `47d60f11-cf4d-4a70-adbb-dca1d77103a7` | 31605 | restyle all 9 @64, reference | ~20 | **REJECT — path not taken.** Consistent (one call) but soft and dusty; the 128 px batches were crisper. `rejects/reject-clut-…png` |
| 4 | `edit_image` | `d5f65b0d-820f-4de5-a369-4ac28b17cef4` | 31602 | restyle f00–02 @128, reference | ~20 | ACCEPT |
| 5 | `edit_image` | `f50eb313-e932-42fa-b839-4f1f184a56fb` | 31603 | restyle f03–05 @128, reference | ~20 | ACCEPT |
| 6 | `edit_image` | `fc584f37-8caa-4d29-9c5f-8e66a6230bfb` | 31604 | restyle f06–08 @128, reference | ~20 | ACCEPT |
| 7 | `animate_image` | `3e6f0a25-0eae-41bf-9789-706f81cb9057` | 31606 | f05→f06, 8f | 2 | **REJECT — grew a tan soil mound at frames 02/03 and a detached canopy blob at 03.** `rejects/reject-d56-…png` |
| 8 | `animate_image` | `0df0a3af-28d6-4ff0-8424-c8847f3f3998` | 31611 | f04→f05, 4f | 1 | **REJECT — overshoot 2271→4454→2822 plus detached blobs.** `rejects/reject-d45-…png` |
| 9 | `animate_image` | `573f6e07-89ad-44df-b646-dc0696b2eff3` | 31612 | f01→f02, 4f | 1 | **REJECT — overshoot 1639→2728→2190.** `rejects/reject-d12-…png` |
| 10 | `animate_image` | `b793d604-1e59-4212-93bd-7df58d4f19c2` | 31613 | f02→f04, 4f | 1 | **REJECT — overshoot; the pair also turned out not to need densifying (+3.7%).** |
| 11 | `animate_image` | `0f5f762b-43b4-4201-8df0-8985023ab32a` | 31614 | f06→f08, 4f | 1 | ACCEPT (1 frame used: `d68-01`) |
| 12 | `animate_image` | `23057fac-14fa-4474-8036-04b57449a153` | 31610 | f05→f06, 8f, corrected action | 2 | **ACCEPT — the repaired cut.** 3 frames used. |
| 13 | `animate_image` | `0ff660b2-d1ac-4666-ba4e-3efee86dc49d` | 31615 | f01→f02, 8f | 2 | ACCEPT (1 frame used: `d12b-02`) |
| 14 | `animate_image` | `a862ff27-e580-4ab6-8273-324cdf6221f4` | 31616 | f04→f05, 8f | 2 | **REJECT — zero frames landed between the endpoints** (2267, 2124, then 3263+). f04→f05 is a lateral morph, not growth. `rejects/reject-d45b-…png` |
| 15 | `animate_image` | `4a64a8fa-3318-4195-8961-6a2035bd5f31` | 31617 | f03→f05, 8f | 2 | ACCEPT (2 frames used) — the leaf→blob conversion beat. |
| 16 | `edit_image` | `949c8b37-a7b1-4029-ba85-23357c8b5f2c` | 31618 | seedling from f00 @128 | ~20 | **REJECT — kept the adult root flare under a stub stem; reads as a cut stump, not a seedling.** `rejects/reject-sprout-…png` |
| 17 | `edit_image` | `1796a097-0949-4fdc-81c0-75cdcef853df` | 31619 | seedling, explicit 1/3 scale | ~20 | ACCEPT |
| 18 | `animate_image` | `ae91862b-c154-40e1-80cc-daf21e55da22` | 31620 | seedling→f00, 6f | 2 | ACCEPT — fully monotone, 4 frames used. |

Eight of eighteen calls were rejects. Every reject image is in `rejects/`.

---

## 5. The delivered track — measured

Canvas **128x128** RGBA8, 19 frames, target anchor **(64, 122)**, alpha threshold 8, one shared
**32-colour** palette, **70,635** encoded bytes total (3,718 B/frame mean), 1,245,184 decoded bytes.

Why 128 and not the round-1 192: `edit_image` reference mode is capped at ≤128 px for multi-frame
batches, and batching is the entire mechanism by which the nine frames get the *same* edit. Running at
192 would mean nine independent single-frame calls (~180–360 generations) with no consistency
guarantee. The trade is recorded, not hidden — the silhouette and read are unchanged, and the coarser
pixel density is arguably closer to the island's own.

| # | file | provenance | bbox x,y,w,h | anchor | drift x,y | alpha px | step | bodies | bytes |
|---|------|-----------|--------------|--------|-----------|----------|------|--------|-------|
| 0 | `frame-00.png` | sprout e2 (edit_image seedling, anchored)  <- grows from nothing | 39,50,46,73 | 63.83, 122 | -0.17, 0 | 858 | — | 1 | 1565 |
| 1 | `frame-01.png` | tween d0s-01  (sprout->f00 interp) | 41,45,45,78 | 64.40, 122 | +0.40, 0 | 1087 | +26.7% | 1 | 2195 |
| 2 | `frame-02.png` | tween d0s-02  (sprout->f00 interp) | 38,31,49,92 | 64.16, 122 | +0.16, 0 | 1292 | +18.9% | 1 | 2220 |
| 3 | `frame-03.png` | tween d0s-03  (sprout->f00 interp) | 38,13,53,110 | 64.16, 122 | +0.16, 0 | 1374 | +6.3% | 1 | 2539 |
| 4 | `frame-04.png` | pose f00  (round-1 pose 0, restyled) | 29,18,75,105 | 63.89, 122 | -0.11, 0 | 1623 | +18.1% | 1 | 2759 |
| 5 | `frame-05.png` | pose f01  (round-1 pose 1, restyled) | 29,15,76,108 | 64.27, 122 | +0.27, 0 | 1639 | +1.0% | 1 | 2637 |
| 6 | `frame-06.png` | tween d12b-02 (f01->f02 interp) | 30,12,76,111 | 64.25, 122 | +0.25, 0 | 2028 | +23.7% | 1 | 3442 |
| 7 | `frame-07.png` | pose f02  (round-1 pose 2, restyled) | 30,14,76,109 | 64.26, 122 | +0.26, 0 | 2190 | +8.0% | 1 | 3548 |
| 8 | `frame-08.png` | pose f03  (round-1 pose 3, restyled) | 29,21,79,102 | 63.76, 122 | -0.24, 0 | 2091 | -4.5% | 1 | 3331 |
| 9 | `frame-09.png` | tween d35-01  (f03->f05 interp) | 28,21,82,102 | 64.20, 122 | +0.20, 0 | 2257 | +7.9% | 1 | 4285 |
| 10 | `frame-10.png` | tween d35-02  (f03->f05 interp) | 26,21,85,102 | 63.75, 122 | -0.25, 0 | 2822 | +25.0% | 1 | 4589 |
| 11 | `frame-11.png` | pose f05  (round-1 pose 5, restyled) | 27,26,79,97 | 63.51, 122 | -0.49, 0 | 2828 | +0.2% | 1 | 3794 |
| 12 | `frame-12.png` | tween d56b-01 (f05->f06 interp)  <- the repaired cut | 28,27,80,96 | 63.87, 122 | -0.13, 0 | 2983 | +5.5% | 1 | 4726 |
| 13 | `frame-13.png` | tween d56b-02 (f05->f06 interp)  <- the repaired cut | 26,23,84,100 | 64.06, 122 | +0.06, 0 | 3638 | +22.0% | 1 | 4968 |
| 14 | `frame-14.png` | tween d56b-03 (f05->f06 interp)  <- the repaired cut | 20,15,92,108 | 63.91, 122 | -0.09, 0 | 4084 | +12.3% | 1 | 5373 |
| 15 | `frame-15.png` | pose f06  (round-1 pose 6, restyled + de-grounded) | 17,18,95,105 | 63.95, 122 | -0.05, 0 | 4723 | +15.6% | 1 | 4282 |
| 16 | `frame-16.png` | tween d68-01  (f06->f08 interp) | 16,14,95,109 | 64.01, 122 | +0.01, 0 | 4957 | +5.0% | 1 | 5536 |
| 17 | `frame-17.png` | pose f07  (round-1 pose 7, restyled + de-grounded) | 17,12,95,111 | 64.21, 122 | +0.21, 0 | 4967 | +0.2% | 1 | 4350 |
| 18 | `frame-18.png` | pose f08  (round-1 pose 8, restyled + de-grounded) | 16,11,95,112 | 63.79, 122 | -0.21, 0 | 5046 | +1.6% | 1 | 4496 |

**Root-anchor drift after normalisation: max |dx| = 0.49 px, max |dy| = 0 px.** Pre-normalisation
spread across the whole spliced track was 1.49 px.

**Connectivity (`evidence/connectivity.json`):** every frame is **1** 8-connected component;
stray pixels **0**; detached canopy pixels **0**.

**Step profile:** worst step +26.7% (frame 00→01, the seedling's first growth), against the source's
+77.5%. One negative step remains, **−4.5%** at frame 07→08 — that is the authored round-1 pose f02→f03
transition, kept because the silhouette *height* declines smoothly through it (109 → 102 → 95 px) even
though mass dips.

**Files:** `frames/frame-00.png … frame-18.png` + `frames/registration.json` (canvas, anchor rule,
per-frame anchors/offsets/drift/bbox/alpha/bytes and full per-frame provenance back to the job id).

---

## 6. Honest self-assessment against the round's failure list

| failure mode | verdict |
|---|---|
| **seam / gap between trunk and canopy** | **Absent, and this is measured, not asserted.** All 19 frames are one 8-connected body; 0 detached canopy px. |
| **floating crown** | **Absent.** Every canopy blob traces back to a branch that traces back to the trunk. |
| **blob** | Partly present *by design* — this tree's mature canopy IS drawn as overlapping blobs. What is fixed is that the blobs now arrive one at a time from branch tips (frames 09→14) instead of appearing as a single mass. |
| **pasted-on crown** | Absent. |
| **silhouette snap** | **Reduced, not eliminated.** Worst step is now +26.7% vs +77.5%. Frames 14→15 still carry a visible change of *character*: the generated crown hands off to the authored f06 crown and the trunk gains its buttressed multi-stem form in that one step. It reads as a pop, though a much smaller one than the original cut. |
| **style pop** | **Small and quantified.** Foliage mean value across the 19 frames ranges 0.500–0.536 — a 3.6-point spread, i.e. the "pale crown" I expected to find is not actually a value problem. What remains is a *highlight-distribution* difference between the mature poses (batch 3) and the rest, visible on close inspection of frames 15–18. |
| **topology mutation** | **Present but now narrated.** The source mutated a whip-leaf sapling into a blob-canopy tree in one frame; frames 09–14 now show the leaves converting into blob clusters progressively. The one mutation still unexplained is the trunk becoming multi-stem at frame 15. |
| **ground / land fragment in a tree asset** | **Removed.** No grass, soil, pebbles or flowers in any delivered frame. |
| **grows from nothing** | **Now yes** — frame 00 is a two-leaf seedling, 858 alpha px, 17% of the mature tree's mass. |

**What I would tell the owner it still is not.** It is a repair, not a re-authoring. The mature poses
are still the round-1 mature poses; frames 15–18 are three near-static variants of the same mature tree
(+5.0%, +0.2%, +1.6%) that wobble in crown shape rather than settling, because that wobble is in the
source. And the frame 14→15 trunk change is the one remaining cut that a fresh eye will find.

---

## 7. What I would do next

1. **Close the 14→15 handoff.** One more `animate_image` pinned f06→f07 at `frame_count 8`, or better:
   re-run the whole 05→08 span as a *single* 14-frame interpolation (192·192·14 = 516,096 ≤ 524,288, so
   it fits at full 192 px) so the mature trunk emerges inside one model pass instead of across a splice.
   Budget stopped me at 31 remaining generations.
2. **Settle the tail.** Replace frames 16–18 with one authored mature pose plus an app-side hold. The
   app already owns holds (ADR-0274 §3); three wobbling mature frames are the asset doing the app's job.
3. **Re-run the accepted pipeline at 192 px** now that the palette is *known*: the 32-colour palette in
   `frames/registration.json` can be applied to the original 192 px frames as a pure LUT with zero
   geometry change. Only the in-betweens would need regenerating.
4. **Add the contact shadow** — an app-side elliptical soft shadow whose radius follows normalised
   progress. It is the cheapest remaining "planted, not floating" cue and it costs no generations. It
   deliberately is **not** baked into the asset: land is the app's, per ADR-0274 D1/D6.

---

## 8. Directory map

```
frames/                      the delivered track, frame-00..18 + registration.json
raw/                         every unmodified model return, named by job label
src-frames/                  the round-1 source, copied unmodified (originals never written)
rejects/                     the eight rejected returns, each named with its fault
evidence/                    before-composite, style plate, tune candidates, connectivity.json
work/                        every script (measure, sheet, mkstyleref, unify, tune, anchor,
                             assemble, finalize, connectivity, deliver) + intermediates
contact-sheet.png            all 19 frames, 3x nearest, on a checkerboard
preview.gif                  19 frames, 3x nearest, dark field, 160 ms with a 1.4 s settle
preview-on-island.gif        the same track composited on the real SVG island plate
on-island-strip.png          eight key frames on the island, 3x
path-growth.md               the path-growth treatment
```

Nothing outside this directory was created or modified.
