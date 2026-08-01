# Blender hero tree v2 — a delivered 19-frame track, composited on the real island

**Date:** 2026-08-02 · **Blender:** 5.2.0 LTS, headless, CPU Cycles · **Cost:** $0 · **Vendor calls:** 0

The second exercise of [ADR-0280](../../../decisions/0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md)
D2a, and the first code track ever composited on the app-owned SVG island. `../blender-spike/`
was the first pass — it answered *"what can Blender do"* and lost to exp-16 on four named gaps.
This closes all four, delivers a registered 19-frame track, and mounts it in the round-3
comparison lab as a fifth switchable candidate.

**Nothing here is owner-attested.** The LOOK verdict is the owner's (ADR-0070) and §5 records the
author's honest assessment against exp-16, which is not flattering everywhere.

## Reproduce

```
blender --background --python blender_tree.py -- --out raw --frames 19 --res 384 --samples 72 --shadow-samples 32
python pixelise.py raw frames 128
python register_track.py --write        # -> packages/app-surface/src/assets/code-blender/
```

`blender_tree.py` runs under Blender's bundled Python (it imports `bpy`); `pixelise.py` and
`register_track.py` need the system Python with numpy + Pillow. `bpy` from PyPI is **not** a route
on this machine — no wheel for Python 3.14.5 — and the headless-application route is preferred
anyway, since Blender bundles its own interpreter and can be version-pinned.

`blender_tree.py --no-render` runs the skeleton and the retiming under plain Python in about a
second, which is how the structure was iterated without a Blender launch per attempt.

**`raw/` is not committed.** It is 2.7 MB of exactly reproducible intermediate — the command above
regenerates it from the seed. `frames/` (the delivered 128px track), both contact sheets and the
three scripts are what the repo carries.

## The four gaps, and what closed each

| gap (v1 README §"Where exp-16 is still better") | what it was | what closed it |
|---|---|---|
| **1. The opening** — "reads as a stump, not a seedling" | v1's girth was STATIC: the mature trunk radius was drawn from frame 0, so a 1.0-tall, 0.135-radius cylinder appeared at once | girth is now **secondary growth** — pipe model over an age-dependent tip radius, so a young stem is a young stem — plus a **two-leaf cotyledon pair** on the base internode that opens, holds, and senesces as the first true leaves flush |
| **2. The base** — no root flare, no planting cue | v1's trunk met the ground abruptly | **buttress spurs** that climb the bole and descend to the soil, a **base flare** on the lower trunk, and a real **cast contact shadow** from a second Blender pass |
| **3. Leaf character** — lobes throughout | v1 drew ico-sphere lobes at every stage | individual **leaf blades** on young shoots, shed as a shoot lignifies, with canopy lobes taking the mass over |
| **4. Crown silhouette** — flat-topped, acacia-like | v1 used fixed-angle recursion | **space colonisation** into a rounded attractor envelope, proportioned so the mature silhouette lands on exp-16's (80×111 px of a 128 canvas against exp-16's 79×111) |

Round 3 §5 item 6 records that no track kept a planting cue and several read as standing on stilts.
The contact shadow answers that, and it mines the one thing `code-sdf-volume` got right — it had
the only working ground contact in the round-4 pool — with a production renderer instead of a
hand-rolled sphere-tracer.

## What the code owns (ADR-0280 D1, unchanged)

- **Topology is a strict PREFIX.** The skeleton is grown once; every node records the iteration it
  was born at; a frame at reveal *N* draws nodes with `birth <= N` and the frontier eases out of
  **zero** length. Topology cannot mutate between frames and **nothing is frozen** to achieve it.
- **Randomness is identity-keyed** (`h01(addr, …)`), never a draw counter.
- **The camera is one declared scalar** — orthographic at 20°, ADR-0280 D1's calibrated
  projection, framed **once** to the mature extent and byte-identical on every frame.
- **Growth pacing is authored, and measured.** The 19 frames are placed at equal
  *silhouette-change arc length*, computed author-time from an analytic projection of the skeleton
  (`cheap_silhouette` + `retime`), not at equal time. Blender then renders only the 19 chosen frames.
- **Determinism:** CPU Cycles, `seed = 20260801`, fixed samples, pinned 5.2.0 LTS.

## The raster back half is still load-bearing — and the composite proved it twice

`pixelise.py` box-downsamples the supersampled render, thresholds alpha to a hard silhouette, snaps
every colour to exp-16's committed 32-colour track palette, and applies a material-tinted rim.
Two of its steps exist **only because the composite exposed a failure the contact sheet hid**:

- **Chroma and value are pushed before the snap.** A physically-lit CPU render lands mid-value and
  low-chroma. It looked fine in isolation and washed out the instant it sat on the island's
  saturated green plate.
- **The snap is family-aware.** The first correction over-shot: pushing chroma across the whole
  31-colour palette let deeply shaded greens land on browns, and since the crown interior is the
  shadiest part of the tree the error concentrated exactly where the foliage should be — the crown
  read as a brown thicket with green flecks. Foliage is now classified on the RAW render (a green
  base keeps `g > r` at every light level) and snapped within its own family.

This is the concrete case for ADR-0280 D2a making the raster step mandatory rather than stylistic,
and for ADR-0280's own listed risk that *"no code track has been composited on the real island,
which is where round-3 tracks lost points won on transparency."* It cost two iterations to find,
and neither was visible on a contact sheet.

## Registered and mounted

`register_track.py` re-measures every delivered frame under the **lab's** one applied anchor rule
(round-1's: *alpha-weighted x across bottom three occupied rows; bottom-most occupied y*, alpha > 8)
— not under a rule of this track's choosing — normalises x, and emits
`packages/app-surface/src/assets/code-blender/` with a manifest and a per-frame registration report.
The TypeScript registry states the numbers as literals and
`chapter2-round3-tree-candidates.test.ts` re-derives them by decoding the shipped PNGs.

The track is the lab's fifth candidate: `?organicGrowth=r3-lab#/tree`, button **code-blender**.

**One honest divergence is recorded rather than papered over.** The four hand-authored candidates
declare `groundRowSpreadPx: 0` — 2D art with a flat base pins its contact row exactly. This track
declares **3**. The camera is fixed and the trunk base is pinned at world z=0, but secondary growth
thickens the trunk, so the near edge of its own footprint descends by `r·sin 20°` as it fattens.
Buying a constant row would mean shifting the frame upward as the tree matures — the tree rising
out of the ground — which is the base drift ADR-0280 D1 forbids. The suite asserts the declared
band; it did not have its exact-row rule weakened for the candidates it was written for.

## 5. Honest assessment against exp-16

`exp16-vs-v1-vs-v2.png` is the three-way at frames 0 / 4 / 9 / 14 / 18.
`on-island.png` is the composite comparison — the thing no code track had.

**Where v2 beats v1 (the spike), measurably**

All four named gaps close. Frame 0 is a true cotyledon seedling instead of a bare stump; the base
has a flare, buttress roots and a contact shadow; mid stages draw individual blades; the mature
crown is rounded rather than flat-topped.

**Where it still beats every PixelLab track**

- **Camera.** One number, correct by construction, where an 11-generation probe proved PixelLab
  will not obey a camera word.
- **Continuity.** No topology snap anywhere, and nothing frozen to get it.
- **Ground contact.** The only track in the pool with a real cast contact shadow.
- **Cost.** $0 per render, deterministic, unlimited iterations.

**Where exp-16 is still better — and this is the honest headline**

1. **Saturation and confidence of the mass.** The composite is where this shows. Against the
   island's green plate all four PixelLab tracks read as saturated, chunky, deliberate pixel art;
   this one reads muted and slightly grey, and its canopy — even after a density pass that closed
   most of the gaps — is softer-edged than exp-16's. Two rounds of chroma and contact-density work
   narrowed it and did not close it. The residue is that a physically-lit render carries a lot of
   intermediate values, and quantising them is not the same act as an artist choosing eight.
   **This is the honest bottom line of the ceiling question.**
2. **Scale convention.** exp-16's frame-0 seedling is 73 px tall of 128 — **65% of its mature
   height** — because each stage is drawn to fill the frame. This track holds ONE camera framed to
   the mature extent, so its frame 0 is 18 px and the first third of the track is small in frame.
   That is D1's fixed camera doing exactly what it promises, not a bug — but it is a real
   **art-direction fork the owner has not been asked about**: literal scale with a planted base, or
   stylised scale where every stage fills the frame. They cannot both be had from one camera.
3. **Mid-stage readability.** exp-16's frames 4 and 9 are characterful — a leafy whip with a
   spectacular buttressed root system on show. The equivalent frames here are busier and smaller,
   and more bare twig shows through the foliage.

**Not claimed.** No owner LOOK, no hero-tree selection, no technique adoption, no clean-route
switch, no arc closure. This is a ceiling demonstration under ADR-0280 D4, where an honest
"not good enough" is an accepted outcome.
