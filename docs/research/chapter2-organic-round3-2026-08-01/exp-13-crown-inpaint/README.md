# exp-13-crown-inpaint — grow the crown INTO the trunk's own pixels

**Round 3, chapter2 organic growth arc. 2026-08-01.**
Seed block 31300–31399. All generation is author-time (ADR-0274 D2 / ADR-0219); no vendor call,
credential or hostname is in this directory.

---

## 1. The question

Every rejected hero-tree attempt so far authored a trunk and a crown **separately** and registered
them together afterwards, and the owner saw the join every single time — a seam, a gap, a floating
canopy, a pasted-on blob (ADR-0277 killed the last mechanical fix). So:

> If the crown is never a separate sprite — if it is painted **into the trunk's own canvas, by a
> model that can see the exact branch tips it has to attach to** — does the join stop reading as a
> join?

## 2. The technique, in two sentences

One 192×192 canvas holds a bare forked trunk; every growth stage is a `inpaint_image` call on **that
same canvas** with a mask covering only the crown region, growing outward stage by stage, so
everything outside the mask stays the same pixels and the crown is drawn *around* real branches
rather than aligned to them. The four young stages use the same machinery pointed lower down the
trunk: the canvas is alpha-cleared above the mask so the mature branch structure is simply not in the
picture yet, and the model draws the young top growing out of the frozen root plate.

**A seam is not hidden here — there is only ever one image.**

## 3. What shipped

`frames/frame-00.png … frame-06.png` — **7 frames**, 192×192 RGBA, root anchor **(96, 188)**,
same canvas / anchor / anchor-rule as the round-1 winning track so the two are directly comparable.

- `contact-sheet.png` — the 7 frames on a checkerboard, 2× nearest-neighbour.
- `preview.gif` — 3× dark-field loop, 560 ms/frame.
- `track-manifest.json` — the measured table below, machine-readable.
- `raw/` — **every** model return, named by job, including all 11 rejects.
- `work/` — the base canvas, every stage input, every mask image, the measuring scripts.
- `path-growth.md` — the path-growth treatment.

Why 7 and not 9: two perfectly good returns (`inp-f4-e1`, `inp-f5-e1`) were **cut from the track**
because their measured foliage mass (947 px and 1513 px) sits *below* frame 03's 2926 px — keeping
them would have shown the canopy visibly shrinking mid-growth. They are in `raw/` and in
`work/track-B.png`, which shows exactly that regression.

## 4. Measured results

### 4.1 Per-frame table (measured with PIL + numpy, alpha threshold 8)

`anchorRule` = alpha-weighted x across the bottom three occupied rows; bottom-most occupied y —
identical to `tree-registration.json` from round 1.

| frame | source job label | alpha bounds (x,y,w,h) | anchor x | anchor y | foliage px | encoded bytes |
|---|---|---|---|---|---|---|
| frame-00 | inp-f0-y1 | 49, 138, 97×51 | 96.4375 | 188 | 0 | 4 416 |
| frame-01 | inp-f1-y1 | 49, 107, 97×82 | 96.4375 | 188 | 1 477 | 6 676 |
| frame-02 | inp-f2-y1 | 37, 76, 122×113 | 96.4375 | 188 | 1 211 | 9 932 |
| frame-03 | inp-f3-y1 | 25, 44, 137×145 | 96.4375 | 188 | 2 926 | 11 997 |
| frame-04 | inp-f6-e1 | 24, 25, 139×164 | 96.4375 | 188 | 4 285 | 16 774 |
| frame-05 | inp-f7-e1 | 24, 20, 139×169 | 96.4375 | 188 | 6 764 | 21 370 |
| frame-06 | inp-f8-e1 | 18, 12, 157×177 | 96.4375 | 188 | 11 310 | 26 142 |

Track budget: **97 307 encoded bytes**, 1 032 192 bytes decoded RGBA (7 × 192 × 192 × 4).
Round 1's 9-frame tree track was 144 006 encoded bytes for comparison.

### 4.2 Root-contact drift — the number, not the claim

**Measured drift: 0.0000 px in x, 0 px in y, across all 7 frames.**
Every frame's anchor is exactly `(96.4375, 188.0)`. Height is monotone (51 → 82 → 113 → 145 → 164 →
169 → 177 px) and foliage mass is monotone apart from a 266 px dip at frame 02 (see §5).

This is not registration luck — it is structural. The root plate is *never inside any mask*:

| frame | differing px vs frame-06, rows 168–192 (root plate) | rows 140–168 (lower trunk) |
|---|---|---|
| 00 | 0 | 780 |
| 01 | 1 | 145 |
| 02 | 1 | 0 |
| 03 | 1 | 0 |
| 04 | 0 | 0 |
| 05 | 1 | 0 |
| 06 | 0 | 0 |

The lower trunk is **byte-identical (0 px)** across frames 02–06 — not "aligned to within a pixel",
*the same pixels*. Frames 00/01 differ there on purpose: that is where the model drew a younger,
thinner trunk.

The stubborn "1 px": one root pixel at **(64, 174)** is dropped by the inpaint model in four of the
seven returns. It is at y=174, outside the bottom three rows, so it does not move the anchor at all.
Reported, not swept.

### 4.3 Does `inpaint_image` really freeze the area outside the mask?

**Not byte-exactly — but the deviation is a constant, and that turns out to be enough.** Measured on
the first three calls: the model re-emits the *whole* canvas with a uniform colour shift of **|Δ| = 6
summed across RGBA (≈2 per channel), max 6, on every pixel**, and **0 alpha pixels changed**. So the
silhouette is preserved exactly and the recolour is:

- **identical between calls** — `f4-e1` vs `f8-e1` over rows 140–192: **0 differing pixels**;
- therefore invisible in the track, because every frame carries the same shift.

The vendor doc's "everything outside the mask is preserved exactly" is *structurally* true and
*byte-wise* false. If a future track mixes inpainted and non-inpainted frames, this ±2/channel shift
would show as a style pop and the un-inpainted frame would need the same pass.

### 4.4 `crop_to_mask` — the A/B, and the single most useful finding of this experiment

Same input, same prompt, same stage (`f7`), three combinations:

| variant | mask | `crop_to_mask` | result | leak outside the mask |
|---|---|---|---|---|
| `inp-f7-r1` (seed 31317) | rectangle 140×102 | `true` | **the canopy is a filled RECTANGLE** — hard box edges. Total fail. | 0 px |
| `inp-f7-e1` (seed 31330) | 5-ellipse lumpy dome | `true` | **best frame in the experiment** — broad natural dome, branches poking out at the sides, crown sits down onto the limbs | 0 px |
| `inp-f7-e2` (seed 31331) | rectangle 140×102 | `false` | natural silhouette, but **1 672 alpha pixels changed outside the mask** and three pure-white holes punched inside the canopy | **1 672 px** |

See `work/probe-f7ab.png` — all three side by side.

**Answer: `crop_to_mask` HELPED the join, but only once the mask stopped being a rectangle.** With
`crop_to_mask: true` the model treats the mask boundary as the object boundary, so a rectangular mask
gets stamped as a rectangle. Turning it off frees the silhouette but breaks the frozen guarantee —
the model paints outside the mask, which is exactly the property the whole technique rests on. The
working combination is **an organic mask + `crop_to_mask: true`**: the frozen region stays frozen
(0 px leak, measured) and the canopy is shaped by the mask's own lumpy dome rather than a box.

Every shipped frame uses that combination. Mask builders: `work/mkmask.py`, `work/young.py`.

### 4.5 Author-time normalisation applied (declared, not hidden)

Three steps, all deterministic, all in `work/assemble.py`:

1. **Integer translate** of the single base canvas by (0, +13) so its bottom-most occupied row lands
   on y=188. Applied once, to the base, before any inpaint — so every frame inherits it.
2. **Foliage palette snap.** The raw returns wobble in hue frame to frame — measured mean foliage RGB
   was `(55,105,50)`, `(97,148,62)`, `(70,133,59)` on three consecutive stages, i.e. a visible
   dark→yellow→dark flicker. Every foliage pixel (α>200, G>R+12, G>B+12) is snapped by *luminance* to
   the nearest entry of the mature frame's own 28-colour green ramp. Shading structure survives; the
   hue stops flickering. Before/after: `work/contact-sheet-unnormalised.png` vs `contact-sheet.png`.
3. **1 px despeckle.** 9 near-white specks total across the track: 3 stray `(222,212,207)` pixels the
   base pixflux return itself carried, and 6 pure-white holes the inpaint model punched inside
   canopies. Each replaced with the modal opaque 8-neighbour. Per-frame counts are in
   `track-manifest.json` (`specksRepaired`). Verified 0 remaining.

Nothing here re-authors art or moves anything; the crown pixels are the model's.

## 5. Honest self-assessment against the §1 failure list

I looked at every return at 2×–5× before judging it. `work/join-zoom.png` is a 5× crop of the
trunk↔canopy junction on frames 01, 03, 05, 06 — the evidence for the claims below.

| failure mode | verdict |
|---|---|
| **seam** | **Absent, and structurally impossible.** There is one image; the crown pixels and the trunk pixels came out of the same raster. In the 5× junction crop the trunk's own dark outline runs continuously *into* the foliage; the limbs pass under the canopy edge and the canopy outline wraps them. |
| **gap** (the exp-2 killer) | **Absent.** No frame has any transparent pixel between the top of the trunk and the bottom of the crown — the canopy is drawn overlapping the limbs by construction. |
| **floating crown** | **Absent.** Every crown is anchored on branch pixels that are visible passing into it. |
| **blob** | **Present in frame 03 — the weakest frame.** Its crown is a single heavy, flat-topped dark mass (the "cabbage"), not the clumped foliage of frames 04–06. It is the one frame I would regenerate. |
| **pasted-on** | Absent in frames 04–06. Frame 01's crown is a clean mushroom cap and is a little *too* geometric — it reads as a shaped topiary rather than foliage, though it is unambiguously attached. |
| **silhouette snap** | **Absent below the crown** — the trunk silhouette is literally identical (0 px, §4.2). Present *in the crown* at the 03→04 boundary: one solid dome becomes four separate clumps. That is a topology change in the foliage, and it is the worst transition in the track. |
| **style pop** | Fixed by the §4.5 palette snap; it was real and measurable before it (mean foliage RGB flicker of ~40 units of green channel between consecutive frames). |
| **topology mutation** | Only the 03→04 crown change above. Branch topology never mutates — it is the same branches every frame. |

### The genuinely bad frame: frame-00

Frame 00 reads as **a sawn stump with a bud on it**, not a seedling. Measured foliage: **0 px** under
my classifier — the green sprig is a handful of sub-threshold pixels. This is a real failure and I
did not fix it.

Cause, measured across five attempts: **`inpaint_image` will not grow leaves in a mask that contains
nothing but empty space above a flat-cut trunk.** It completes the object it can see, and what it can
see is a pole, so it draws more pole. Attempts `inp-f0-r1` (rect 68×52), `inp-f0-r2` (rect 72×52),
`inp-f0-l1` (stem+oval lollipop mask), `inp-f0-y2` (dome lower on the stem) all came back as a bare
brown stub. The dome-over-twigs recipe that works everywhere else has nothing to bite on at 30 px
above the ground, because the base trunk has no twigs down there. `inp-f0-y1` — the shipped frame —
is the only one that produced any green at all.

I stopped rather than spend a sixth call: the shared round budget was down to 148 generations and
other experiments needed them more than frame 00 needed to be prettier.

## 6. Rejects, with job ids and reasons

### Base-canvas candidates (`create_image_pixflux`, 1 generation each)

| job id | seed | outcome |
|---|---|---|
| `815eb57d-3672-4042-b383-dddab0f27a86` | 31300 | reject — green **grass disc** under the roots (ADR-0274 D1/D6 forbid generated land) |
| `52738fdf-aed4-4fdf-bdac-0de00cd82f1b` | 31301 | reject — sand/soil disc |
| `ec861a71-7fa7-49dc-b3db-7de7e4e2f77b` | 31302 | reject — clean, but the bark is saturated orange, off-family from round 1 |
| `5facd8da-0105-430f-9770-66d27252c8cb` | 31303 | reject — soil disc |
| `4ba47386-e71e-402c-b5ea-8aae2263b885` | 31304 | reject — img2img from round-1 `frame-08` at `init_image_strength:120` asking for "every leaf gone"; **the canopy came back untouched**. img2img could not strip foliage at any strength I could afford to explore. |
| `3db7bfa4-20b6-4e94-be3f-e72b4b4ad915` | 31306 | runner-up — clean and ground-free, but washed-out pale twig tips |
| `ab9294fb-4528-44ac-a640-043740e05861` | 31307 | **SELECTED — the base canvas.** No ground, strong dark outline, warm brown bark, real buttressed root plate, clean fork |
| `0acf6506-cff9-4c3e-af59-f3a6f0ae6d63` | 31308 | reject — grass disc |
| `4db3d63a-30fd-4555-92da-da27ff7a7d24` | 31309 | reject — grass disc |

Seed 31305 was written but never submitted (rate limit, then superseded).

### Inpaint rejects (`inpaint_image`, ~20 generations each)

| job id | seed | stage | reason |
|---|---|---|---|
| `510c904f-c91e-420f-9c0f-e5744203bad3` | 31310 | f0 | 1 px hairline stem, no leaves |
| `532db75b-b14d-4a35-bd6d-dd940aa0fbc6` | 31320 | f0 | bare tapered stub, no leaves |
| `a95aa577-bda2-48cc-8f15-271bde207d02` | 31340 | f0 | bare pole (lollipop mask did not help) |
| `039eb2ed-ca30-45db-bc7d-c269d5b1d393` | 31360 | f0 | two thin dark arcs, essentially nothing |
| `a9d09b51-58d3-4b17-9931-7ea6806128d8` | 31321 | f1 | flat sawn-off pole |
| `58f69474-744d-4aac-8dd3-ef28306f6e25` | 31323 | f3 | **the mask rectangle filled solid green** |
| `c3e1eac6-c897-4a84-b3f0-0e0f1a1284ed` | 31317 | f7 | **rectangular canopy** — the crop_to_mask failure of §4.4 |
| `27368878-a474-48c9-b115-d08d7d6dfce9` | 31331 | f7 | `crop_to_mask:false` — leaked 1 672 px outside the mask + white holes |
| `07ce8374-f7f1-4f9a-ae94-069d6d1d21c4` | 31312 | f2 | usable (pointed-leaf sprays) but off-family from the clump language; superseded |
| `87372aca-d076-44d8-a290-a425ecfc2a53` | 31318 | f8 | good dome, superseded by the organic-mask version |
| `c0a8f5c1-5f98-4b76-8b9a-c65a2a7a577e` / `65f6c6df-6fc3-4497-81eb-0121a4ec3e4f` | 31315 / 31316 | f5 / f6 | rect-mask versions, superseded by the dome-mask versions |
| `0793a87a-c871-4e02-832d-99b896c0bbf9` / `e0cac3fd-e211-4aee-b9fd-425127db5a4f` | 31314 / 31334 | f4 | good frames, **cut from the track** — foliage mass below frame 03's |
| `64e63957-fed6-4027-a5ca-c6c80c3f014b` | 31335 | f5 | good frame, cut for the same reason |

### Shipped jobs

| frame | job id | seed | mask | `crop_to_mask` |
|---|---|---|---|---|
| frame-00 | `ae663397-c45a-435c-ab66-37158907f0f6` | 31350 | dome (96,152) r20×14, canvas cleared above y=164 | true |
| frame-01 | `9f084d4a-b229-4431-8baa-70f2a1a54bf4` | 31351 | dome (96,126) r28×19, cleared above y=140 | true |
| frame-02 | `7dfb8720-16eb-48a7-99ea-05ee5cd488b0` | 31352 | dome (96,100) r34×24, cleared above y=112 | true |
| frame-03 | `46e4f912-6044-4237-a04c-0f0ad3b685ae` | 31353 | dome (96,74) r44×30, cleared above y=86 | true |
| frame-04 | `3aef353d-540e-49d2-8c93-3b7c0ea58e0f` | 31336 | dome (96,56) r48×34, full base canvas | true |
| frame-05 | `825f26d6-4bf9-44dd-986d-9375b8807bb0` | 31330 | dome (96,64) r62×44, full base canvas | true |
| frame-06 | `252fc461-3818-4011-b5d2-3d567e3205fe` | 31338 | dome (96,66) r74×54, full base canvas | true |

**Generation spend for this experiment: 9 × `create_image_pixflux` (1 each) + 22 × `inpaint_image`
(the tool reported ~20 each) ≈ 449 generations.** The round pool went 1770 → 148 over the same
window, but that pool is shared with the other round-3 experiments running in parallel.

## 7. Every prompt, verbatim

### Base canvas (`create_image_pixflux`, 192×192, `no_background:true`, `view:"low top-down"`, `outline:"single color black outline"`, `shading:"basic shading"`, `detail:"medium detail"`)

Seeds 31300–31303:

> a single bare deciduous tree trunk with NO leaves at all, thick buttressed roots flaring out and gripping the ground, one tapering trunk rising and splitting into a fork of two strong bare limbs that each end in a few short bare twigs, warm reddish-brown bark with lighter tan highlights and a dark brown outline, storybook game pixel art, one tree only, centred, nothing else in the picture, no ground tile, no soil patch, no grass, no border

Seeds 31306–31309 (the ground-suppression rewrite; **31307 is the shipped base**):

> a single bare deciduous tree with NO leaves, thick warm brown trunk with dark brown bark and tan highlights, buttressed roots flaring out at the base and ending cleanly with nothing beneath them, the trunk rises and forks into two strong limbs which branch into a spread of bare twigs, storybook game pixel art, dark outline, the tree floats on a completely empty transparent background: NO soil, NO dirt patch, NO grass, NO ground disc, NO shadow, NO tile, NO border, one tree only

Seeds 31304/31305 (the img2img leaf-strip that failed), `init_image` = round-1 `tree/frame-08.png`,
`init_image_strength` 120 / 90:

> the exact same pixel-art tree in deep winter: every leaf is gone, the whole canopy has vanished, leaving only the bare dark branches and twigs of the crown against a transparent background, same warm brown trunk with flared roots, same colours, same position, no leaves, no green, no ground, no soil, no grass, transparent background

### Shipped young stages (`inpaint_image`)

frame-00 (seed 31350):

> a small tuft of fresh green leaves budding directly out of the cut top of the young stem below, a compact little clump of round leafy foliage wrapped tightly around the stem tip so the stem passes into it, two tones of green with a dark outline, storybook pixel art; the rest of the area is empty transparent background

frame-01 (seed 31351):

> a small round leafy crown budding on the top of the young trunk below, a compact clump of round green foliage with two or three short brown twigs showing at its edge, two tones of green with a dark outline, storybook pixel art; the rest of the area is empty transparent background

frame-02 (seed 31352):

> a small young canopy of round leafy clumps sitting on the branch tips of the young tree below, the clumps growing out along those exact branches with brown twigs showing through the gaps, two tones of green with a dark outline, storybook pixel art; the rest of the area is empty transparent background

frame-03 (seed 31353):

> a young canopy of round leafy clumps covering the upper branches of the tree below, each clump attached to the brown branches beneath it with twig tips poking out at the edges, layered light and dark green with a dark outline, storybook pixel art; the rest of the area is empty transparent background

### Shipped crown stages (`inpaint_image` on the untouched base canvas)

frame-04 (seed 31336):

> a spreading green canopy of round leafy clumps filling the upper half of this tree's branches, each clump attached to the brown branches beneath it with twig tips poking out at the edges, layered light and dark green with a dark outline, storybook pixel art; the rest of the area is empty transparent background

frame-05 (seed 31330):

> a broad green canopy of overlapping round leafy clumps covering most of this tree's branches, growing outward and downward along the limbs, brown branches visible through the gaps underneath, layered light and dark green with a dark outline, storybook pixel art; the rest of the area is empty transparent background

frame-06 (seed 31338):

> the full mature canopy of this tree: a broad dome of overlapping round green leafy clumps covering every branch tip, sitting down onto the main limbs so the crown and the brown boughs merge into one shape, layered light and dark green with a dark outline, storybook pixel art; the rest of the area is empty transparent background

The four failed young-stage prompts (the "young sapling stem" family) are preserved verbatim in
`work/plan.py`.

## 8. What I would do next

1. **Fix frame 00 by giving the model something to bite on.** The lesson is mechanical: inpaint grows
   foliage where it can already see twigs. The cheap fix is to make the *base canvas* carry a small
   low side-twig at ~y=160, so the first dome has a branch tip inside it. That is a base-canvas
   prompt change, not a new technique — one pixflux call plus one inpaint.
2. **Regenerate frame 03 with the clump prompt** (it currently uses a wording that produced a solid
   dome). Same mask, same seed block, one call. That removes the only topology mutation in the track.
3. **Interpolate the crown ladder to 9 frames** by adding two dome sizes between the shipped 04 and
   05 (r≈54×38 and r≈68×48). Because every crown frame inpaints the *same* base canvas, adding a
   frame is one independent call — no chain to re-run, and the trunk stays byte-identical for free.
   This is the property that makes the technique cheap to iterate.
4. **Do not go back to a rectangular mask.** §4.4 is decisive.
5. **Try `create_map_object` for the island-embedded variant.** Nothing in round 3 has yet generated
   the tree *inside* the real island plate; that is the remaining unpulled lever, and this base
   canvas is the right input for it.

## 9. Constraint compliance

- **ADR-0274 D1/D6** — no land, coast, soil disc or composite generated. Four base candidates were
  rejected specifically for arriving with a ground disc.
- **ADR-0274 §4** — fixed 192×192 transparent canvas, fixed frame count and order, one stable root
  socket at (96,188), author-time crop + anchor normalisation, prompt/model/seed/job-id provenance
  recorded above, byte budget measured (97 307 encoded / 1 032 192 decoded).
- **ADR-0274 §5** — every return is `view: "low top-down"`, matching the reference plate's camera.
  The asset fits the camera; the camera was not changed.
- **ADR-0219 / D2** — PixelLab is author-time only. Nothing in this directory reaches a build
  artifact or the browser. The token was never printed and is not in this repo.
- Nothing outside this experiment directory was written. Round-1 assets were **copied**, never
  modified (`work/r1-frame-00.png`, `work/r1-frame-08.png`).
