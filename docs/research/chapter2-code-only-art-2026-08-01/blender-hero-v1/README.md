# Blender hero tree v3 — clouds carry the crown, and the bands are authored

**Date:** 2026-08-02 · **Blender:** 5.2.0 LTS, headless, CPU Cycles · **Cost:** $0 · **Vendor calls:** 0

The third exercise of [ADR-0280](../../../decisions/0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md)
D2a. v2 delivered a registered 19-frame track and composited it on the app-owned SVG island for the
first time; its honest bottom line was that the canopy read **muted and slightly grey** against the
island's plate, and that *"a physically-lit render carries a lot of intermediate values, and
quantising them is not the same act as an artist choosing eight."*

This increment takes the owner's reading of that — *"seems like the mistake we are making is trying
to render leaves, i would of expected we would just use green clouds and then add a leaves texture"*
— and treats the residue as a **measurable defect rather than a matter of taste**.

**Nothing here is owner-attested.** The LOOK verdict is the owner's (ADR-0070) and §6 records the
author's honest assessment, which is not flattering everywhere.

## Reproduce

```
blender --background --python blender_tree.py -- --out raw --frames 19 --res 384 --samples 72 --shadow-samples 32
python pixelise.py raw frames 128
python measure.py frames --monotone
python register_track.py --write        # -> packages/app-surface/src/assets/code-blender/
```

`blender_tree.py` runs under Blender's bundled Python; `pixelise.py`, `measure.py`, `sheet.py` and
`register_track.py` need the system Python with numpy + Pillow. `bpy` from PyPI is **not** a route on
this machine — no wheel for Python 3.14.5.

**Run the structural loop under Blender too** — `blender --background --python blender_tree.py --
--no-render` (~3.5 s). v2's README offered `python blender_tree.py --no-render` as a one-second
plain-Python route, and that route **iterates a different tree**: the space-colonisation reductions
are numpy-version sensitive, and system numpy 2.4.4 grows **380 nodes over 28 iterations** where
Blender's bundled 2.3.4 grows **405 over 27**. The delivered tree is whatever the *pinned* Blender's
numpy grows, so `render-meta.json` now records the numpy version alongside the seed. `--only 14,18`
renders a subset for the tight colour loop; the retiming, camera and frame indices are unchanged, so
a subset frame is identical to that frame of a full run.

**Two exploratory flags, both defaulting to the delivered track** (verified: the defaults still
report `nodes=405 iters=27 lobes=22 span=3.1362 tz=1.4080` and the identical `RETIME` vector).

- `--framing fixed | per-stage | eased` — the open SCALE-CONVENTION fork (§6 item 3). `fixed` is D1
  as decided, one camera framed to the mature extent. `per-stage` frames each frame to its own
  extent so every stage fills the canvas; `eased` does that with exp-16's measured 0.65 opening.
  **No variant has been rendered yet** — the fork is parked, not answered.
- `--skeleton space-colonisation | sapling` (`--sap-preset <species>`) — who grows the skeleton, from
  the Blender-ecosystem spike:
  [`../../chapter2-blender-ecosystem-spike-2026-08-02/`](../../chapter2-blender-ecosystem-spike-2026-08-02/README.md).
  Needs the `sapling_tree_gen` extension from extensions.blender.org.

## The defect, measured

v2's crown was not short of green — it was **fragmented**. Same crown definition, mature frame:

| | crown px | distinct colours | green | brightest band | mean luma |
|---|---|---|---|---|---|
| exp-16 (the bar) | 4280 | **12** | 51% | (173,167,114) at **20.4%** | 119 |
| v2 (landed) | 3917 | **24** | 90% | (110,151,72) at 23% | 112 |
| **v3 (this)** | **4531** | **7** | 62% | **(173,167,114) at 20.5%** | **123** |

exp-16's confidence is twelve colours held in **large flat regions** plus one bright **warm** top
-highlight over a fifth of the canopy. v2 had two dozen values and **no highlight at all** — its
brightest band was a saturated mid-green. Note what the green fraction actually measures: exp-16's
highlight is a *khaki*, not a green, so a crown that is 90% green is a crown with no highlight in it.

Per-leaf geometry is the machine that manufactures the extra values: each blade presents its own
facing angle, so a mature crown carries a continuum of shading that quantises into speckle. **A cloud
has one surface and can hold a band.**

## The four levers

**1. Clouds carry the crown from sapling up.** v2's canopy lobes were clustered from the MATURE
skeleton's tips, so frames 0–5 had *zero* lobes and the mature frame still carried blades on every
tip born after iteration 18 — the entire outer shell. Foliage now rides the **outer orders of live
shoot** and migrates outward with growth, which is what a real canopy does and what lets one
mechanism serve both a sapling apex and a mature crown shell. Cloud seats are farthest-point sampled
from the mature skeleton **once** and every node is assigned to one, so a cloud can never appear,
merge or split between frames — only its live membership changes. Blades now exist only while one
leaf is a readable fraction of the silhouette (frames 0–9) and are gone by frame 10.

The crown's central void — what lets you watch the limbs run up into the foliage — is no longer
carved by a rule. It falls out of the outer-orders weight: an interior node is many orders from a
live tip and carries no canopy.

**2. The bands are authored, not discovered.** Foliage and bark are **cel materials**: the surface
normal dotted with one key vector, folded with ambient occlusion, through a **constant-interpolated
ramp** into an emission shader. The shader can only ever emit a band colour, so the crown's colour
count is a budget set in the source rather than whatever a nearest-neighbour search reaches. The
bands are exp-16's own committed palette values and a Standard view transform means the rendered
pixel **is** that sRGB triple — so `pixelise.py`'s palette snap became a near-identity, and v2's
chroma (×1.45) and contrast (×1.16) corrections could be **deleted** rather than retuned.

Band *positions* were tuned against measured coverage, not by eye, against exp-16's distribution.

**3. The top highlight is the same mechanism.** The iso-bands of N·L are circles perpendicular to L,
so a near-vertical key at a 20° camera projects them as horizontal stripes and every lobe reads as a
flat-topped plate. Swinging the key up-left-and-**forward** turns them into concentric rings around
an upper-left highlight. The band list chooses the colours; the light vector places them.

**4. A leaves texture is the optional lever, and the honest answer is "marginal".** At 128 px the
whole tree is ~91 px wide and a lobe is 12–20 px, so a tiled leaf texture lands sub-pixel and can
only add colours. The defensible form is a **break-up mask**: noise added to the shading value
*before* the ramp, so it scallops the terminator instead of tinting the surface. Measured at 0.00 /
0.10 / 0.20 it leaves the crown colour count at **7 in all three** — it provably cannot introduce a
value. 0.10 ships because it makes interior band edges read less like clean vector arcs; the effect
is small and is not claimed as more than that.

## Two raster-back-half findings, both from measurement rather than taste

**Order of operations was wrong in v2, and it alone cost half the colour budget.** v2 box
-downsampled 384→128 first and snapped second. Box-downsampling averages across *every* band edge in
the frame, and each average then snaps to whatever entry is nearest — so a shader emitting five flat
colours still delivers a crown of two dozen. Snapping at full resolution and taking the **block
majority** second means a band edge stays an edge.

**The orange flecks were a classification bug, not the twigs they were blamed on.** The mature crown
carried a scatter of bright bark-coloured pixels, 3.8% of it, that read as noise. Tracing them back
to the raw render showed values around (160,160,106) — Cycles **anti-aliases its own band edges**, so
the raw frame carries a fringe of intermediate values at every boundary, and an absolute
foliage-membership threshold dropped those fringes into the bark family, where the nearest brown is
(152,106,60). A **nearest-family** test has no threshold to miss and removed them completely. The
wood-taper written first to "stop twigs poking through" was treating a symptom; it is kept at a much
lower setting, for the geometry reason only.

## The handoff is proven, not asserted

Moving the canopy from blades to clouds means one population shrinks while another grows, so the
claim that matters is that the thing you can *see* never does. `measure.py --monotone` walks the
delivered track and checks both silhouette and foliage-coloured area across all 19 frames; it exits
non-zero if any frame loses either. **All 19 frames are strictly increasing on both.**

## What the code owns (ADR-0280 D1, unchanged)

- **Topology is a strict PREFIX.** Skeleton grown once, birth iteration per node, frontier eases out
  of **zero** length. Nothing is frozen to buy per-frame connectedness.
- **Randomness is identity-keyed** (`h01` on a part's address), never a draw counter, with a mix that
  genuinely avalanches.
- **The camera is one declared scalar** — orthographic at 20°, framed **once** to the mature extent
  and byte-identical on every frame.
- **Growth pacing is authored and measured** — 19 frames at equal silhouette-change arc length,
  computed author-time from an analytic projection of the skeleton.
- **Determinism:** CPU Cycles, `seed = 20260801`, fixed samples, pinned 5.2.0 LTS — plus the numpy
  version now recorded, since the skeleton is sensitive to it.

## Registered and mounted

`register_track.py` re-measures every delivered frame under the **lab's** one applied anchor rule
(round-1's), normalises x, and emits `packages/app-surface/src/assets/code-blender/`. The track is
the lab's fifth candidate: `?organicGrowth=r3-lab#/tree`, button **code-blender**.

One emitter bug was fixed rather than hand-corrected around: the TypeScript block wrote each frame's
*measured* contact row into `sourceAnchor.y`. No vertical shift is ever applied, so the registration
identity `sourceAnchor + normalizationOffset == normalizedAnchor` can only hold with the **registered
anchor row** there — v2's numbers were hand-corrected to 118 before they would pass, which is exactly
the transcription step the emitter exists to remove. The per-frame measured row is reported in
`frames[].measuredGroundRow` and bounded by `groundRowSpreadPx` against the shipped pixels, which is
where a varying contact row belongs.

`groundRowSpreadPx` stays **3** and the reason is unchanged: the camera is fixed and the trunk base
is pinned at world z=0, but secondary growth thickens the trunk, so the near edge of its own
footprint descends by `r·sin 20°` as it fattens. Buying a constant row would mean lifting the frame
as the tree matures — the base drift D1 forbids.

## 6. Honest assessment against exp-16

`exp16-vs-v2-vs-v3.png` is the three-way. `on-island.png` is the five-way composite, and it is a
**screenshot of the real lab on the real SVG island**, not a flat plate — the previous increment
found two failures a transparent contact sheet had hidden, so judgement happens on the island.

**Closed since v2, measurably**

- Crown fragmentation: **24 → 7** distinct colours, against exp-16's 12.
- The missing top highlight: **0% → 20.5%** of the crown, against exp-16's 20.4%, in the same warm
  khaki exp-16 uses.
- Band distribution now within a few points of exp-16 on every band (shade 24.9 vs 21.7, body 24.7 vs
  29.0, highlight 20.5 vs 20.4, deep shade 8.7 vs 6.8).
- Mean crown luma 123 against exp-16's 119, where v2 sat at 112 and read grey.
- Crown mass 4531 px against exp-16's 4280, where v2 sat at 3917 and read thin.

**Where it still loses, and this is the honest part**

1. **The crown is denser and less structural than exp-16's.** exp-16's crown is **29% bark by area**
   — you see the limbs running through the canopy, and that is a lot of what makes it read as a tree.
   This one is 17%, and reads closer to a solid mass. Lowering the wood taper twice moved this less
   than expected, because the twigs are geometrically *inside* the clouds rather than hidden by a
   parameter. Opening the canopy is a structural change to cloud placement, not a tuning knob.
2. **Seven colours is fewer than twelve.** The remaining five in exp-16 are all bark tones under 7%,
   and their absence is the same finding as (1) from the other side. Fewer is not automatically
   better; it is only better than *fragmented*.
3. **Scale convention.** Unchanged and still not the owner's to have been asked: exp-16's frame-0
   seedling is 65% of its mature height because each stage is drawn to fill the frame; this track
   holds ONE camera framed to the mature extent, so its frame 0 is small. Literal scale with a
   planted base and stylised scale where every stage fills the frame cannot both come from one
   camera. **That fork is explicitly out of this spike's scope and remains open.**
4. **Mid-stage readability.** exp-16's frames 4 and 9 are a characterful leafy whip; the equivalents
   here are a small bush. Better than v2's busy twig-tangle, still not charming.
5. **Root flare.** exp-16's buttress spans 37 px at 8% of tree height; this track's spans 10. The
   base was v2's gap 2 and it is closed only partially.

**Not claimed.** No owner LOOK, no hero-tree selection, no technique adoption, no clean-route switch,
no arc closure. This is a ceiling demonstration under ADR-0280 D4, where an honest "not good enough"
is an accepted outcome.
