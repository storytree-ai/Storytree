# Blender hero tree v8 — the lower crown opens, and the limbs finally read through it

**Date:** 2026-08-03 · **Blender:** 5.2.0 LTS, headless, CPU Cycles · **Cost:** $0 · **Vendor calls:** 0

The target is the ONE gap v7 left standing, and v7 had already named its mechanism: **you cannot see
limbs running through our canopy.** Measured as bark inside the crown mask, **206 px against exp-16's
670** — a gap carried since v3, proven in v7 to be geometry rather than shading (bark held flat
across the entire `--crown-normals` fork) and not the canopy floor's height either (the funnel yields
~160 px of bark per unit of lift, so exp-16 would need a floor three tree-heights up).

**Delivered: 206 → 631 px (4.4% → 15.3% of crown) against exp-16's 670 (15.7%),** with the widest
band, the colour count and `--monotone` all held, and with v7's one-point luma drift closed for free.

**Nothing here is owner-attested.** The LOOK verdict is the owner's (ADR-0070) and §6 records the
author's honest assessment, including the one thing this cost.

## Reproduce

```
blender --background --python blender_tree.py -- --out raw --frames 19 --res 384 --samples 72 --shadow-samples 32
python pixelise.py raw frames 128
python measure.py frames --monotone
python measure.py ../../../../packages/app-surface/src/assets/exp-16/tree frames --frame 18
python measure.py ../../../../packages/app-surface/src/assets/exp-16/tree frames --shape --frame 18
python register_track.py --write        # -> packages/app-surface/src/assets/code-blender/
```

`blender_tree.py` runs under Blender's bundled Python; `pixelise.py`, `measure.py`, `sheet.py` and
`register_track.py` need the system Python with numpy + Pillow. `bpy` from PyPI is **not** a route on
this machine — no wheel for Python 3.14.5.

**Run the structural loop under Blender too** — `blender --background --python blender_tree.py --
--no-render` (~10 s). The plain-Python route **iterates a different tree**: the space-colonisation
reductions are numpy-version sensitive, and system numpy 2.4.4 grows a different skeleton from
Blender's bundled 2.3.4. `--only 4,9,18` renders a subset for the tight loop; subset frames are
identical to those frames of a full run. The plan line prints the crown proxy's extent and, since
this increment, **the bark proxy** (§1).

**Seven exploratory flags, all defaulting to the delivered track.** `--low-shrink` and `--low-splay`
are new (§3); `--core-lift` is new but exists only to calibrate the bark proxy (§1) and to keep v7's
exhausted-lever measurement runnable; `--crown-normals` (v7 §3), `--leaf-on`/`--leaf-full` (ADR-0293,
owner-picked), `--framing fixed|per-stage|eased` (§5) and `--skeleton` (settled by ADR-0289 D3) are
unchanged.

## 1. The geometry was decided before any of it was rendered

Every candidate for opening the lower crown is a change to **where the lobes are and how big they
are** — which `frame_state` already knows, in world units, ten seconds into a `--no-render` run. A
ten-minute render to rank a fork whose answer is in the lobe list is the same waste `cheap_silhouette`
removed for growth pacing three increments ago. So `bark_proxy()` rasterises the frame's wood discs
(with the `WOOD_HIDE` taper applied, so a sub-pixel twig is an absent twig) and its lobe discs at the
same 128 px the track ships at, takes the top 62% of the bbox exactly as `crown_mask()` does, and
counts wood not covered by canopy.

**It was calibrated against the delivered pixels before it was trusted**, on the one fork whose
rendered answer v7 had already measured — `CANOPY_CORE_LIFT`:

| core-lift | rendered bark | proxy bark |
|---|---|---|
| 0.00 | 187 | 163 |
| 0.20 | 207 | 186 |
| 0.34 | 242 | 212 |

Ordering exact, slope 89% of the real one, and the crown area it reports (4671 px) lands within 0.4%
of what `measure.py` reads off the render (4689). It **under-reports by design**: it has no depth, so
a lobe BEHIND a limb occludes in the proxy and does not in the render. The sign of that error is
known and it shrank as the crown opened — the delivered frame proxies 619 and renders 631. It is a
RANKING instrument; every number quoted as delivered in this file is `measure.py` on shipped pixels.

## 2. Two candidates were falsified before either was rendered

v7 §6 proposed the next lever as "lobe COUNT and SEPARATION in the bottom of the crown, **or primary
limbs thick enough to stand proud of it**". With the crown mask pinned to the delivered silhouette so
every variant is counted in the same 4671 px region:

| mature frame, proxy px | bark |
|---|---|
| v7 as delivered | 186 |
| **lobes removed entirely** | **1292 (27.7% of crown)** |
| taper off (`WOOD_HIDE` = 0), lobes as delivered | 186 |
| crown limbs (z/top ≥ 0.5) **1.5× / 2× / 3× / 4×** thicker, lobes as delivered | **186 / 186 / 186 / 186** |

**The ceiling is not the problem.** Take the canopy away and 1292 px of wood stand in that crown
region, against exp-16's 670 rendered (~585 in proxy units). The limbs we want to see are already
there; they are covered.

**Thicker limbs buy exactly nothing** — not approximately, identically, at every multiple out to 4× —
because the wood sits wholly inside the canopy silhouette and a thicker hidden limb is still hidden.
The second half of v7's proposed lever is FALSE on this skeleton, and it cost no renders to know.
(The taper row says the same thing from the other side, and explains why lowering `WOOD_HIDE` never
fixed this in v3.) The canopy has to open.

## 3. The lever: a lobe's radius is a function of its height — and the shrink is paid OUTWARD

`CANOPY_LOW_SHRINK` scales a lobe's radius by where it sits between the canopy floor and the live
top: smallest at the floor, untouched at the apex, eased in on the same `mat` maturity scalar both
shell rules already use, in the same `z/ztop` units the floor is already expressed in. One scalar,
self-similar, so a whip is left alone — which is also what keeps `--monotone` honest.

**Shrinking in place works and costs the silhouette**, which is why there are two scalars and not
one. Rendered at splay 0:

| variant | crown px | bark | warm highlight | caps / largest | lum | widest band | foliage floor |
|---|---|---|---|---|---|---|---|
| v7 | 4689 | 206 (4.4%) | 889 (19.0%) | 11 / 25% | 126 | 0.58–0.67 | 44% |
| shrink 0.35 | 4340 | 319 (7.4%) | 812 (18.7%) | 12 / 28% | 124 | 0.58–0.67 | 46% |
| shrink 0.50 | 4195 | 386 (9.2%) | 773 (18.4%) | 10 / 29% | 123 | **0.75–0.83** | 48% |
| shrink 0.75 | 3978 | 507 (12.7%) | 712 (17.9%) | 11 / 31% | 120 | **0.75–0.83** | 49% |

exp-16's widest band is 0.58–0.67 and v7 matched it to the band. Shrinking moved ours **up the tree**
and turned the pear back into a lollipop — ADR-0289 D2's second named defect arriving from the other
direction. The reason is one geometric line: **shrinking a lobe in place retreats its OUTER edge, and
the outer edge is what the silhouette is made of.**

exp-16 is wide at those heights AND shows bark, because its low canopy sits on the ENDS of splayed
limbs: the rim is where the foliage is and the middle is where the sky is. So `CANOPY_LOW_SPLAY` pays
the shrink outward — a lobe that loses radius is pushed horizontally out by what it lost, and its
INNER edge retreats instead. At 1.0 the outer surface does not move at all, so the half-width profile,
the widest band and the camera's mature extent are held **by construction rather than by tuning**:

| variant | crown px | bark | warm highlight | caps / largest | lum | widest band | floor |
|---|---|---|---|---|---|---|---|
| shrink 0.75, splay 0 | 3978 | 507 (12.7%) | 712 (17.9%) | 11 / 31% | 120 | 0.75–0.83 | 49% |
| shrink 0.75, splay 1.0 | 4236 | 551 (13.0%) | 787 (18.6%) | 11 / 28% | 120 | **0.58–0.67** | 48% |
| **shrink 0.90, splay 1.0 (delivered)** | **4123** | **631 (15.3%)** | **759 (18.4%)** | **13 / 28%** | **119** | **0.58–0.67** | 48% |
| exp-16 | 4280 | 670 (15.7%) | 874 (20.4%) | 12 / 30% | 119 | 0.58–0.67 | 44% |

**0.90 is the reference's number, not the column's largest** — the same rule that picked
`--crown-normals` 0.22. Bark lands at 15.3% against 15.7%, and the crown closes on exp-16 from the
other side (4689 → 4123 against 4280). Going to 1.0 overshoots the bark and undershoots the crown,
which is copying a number rather than a structure.

## 4. What was rejected, and one lever that is now measurably redundant

**The rim fade is a bad trade, and it is the repair that looks most faithful.** Since exp-16's canopy
is on the ENDS of its limbs, the obvious way to recover the foliage floor is to fade the shrink
toward the rim: keep the outer lobes full, empty only the middle. Measured at shrink 0.90 / splay 1.0
(proxy px): fade 0.0 → 619, fade 0.5 → 450, fade 1.0 → 319, recovering two and three points of floor
for 169 and 300 px of bark — about **85 px of bark per point of floor**, against a lever whose whole
purpose is bark. Pushing the shrink to 1.0 to pay for it does not get it back (477). The fade was
deleted rather than left as a knob at zero.

**v7's shading fork was RE-MEASURED on the opened crown rather than inherited**, because the
low-crown lever changed the very lobes those normals are blended against, and a measurement table
describing a superseded shape is the same silent-staleness trap as a stale picture. Five one-frame
renders, one pass, `crown-normals-fork.png` re-rendered with them:

| mix | highlight | caps | largest | bark |
|---|---|---|---|---|
| 0.00 | 729 (17.7%) | 13 | 24% | 631 |
| **0.22 (delivered)** | **759 (18.4%)** | **13** | **28%** | **631** |
| 0.32 | 751 (18.2%) | 13 | 32% | 630 |
| 0.45 | 709 (17.2%) | 8 | 38% | 629 |
| 1.00 | 476 (11.5%) | 13 | 76% | 629 |
| exp-16 | 874 (20.4%) | 12 | 30% | 670 |

Two things fall out. **v7's central claim re-verifies at the new geometry**: bark is 629–631 px at
every mix from 0 to 1, flat, exactly as it was 206–207 flat on the closed crown — shading decides
which band a canopy pixel takes and never whether a pixel is canopy. And **0.22 survives and is now
the strict optimum** where it used to be a considered compromise: it is the outright peak of the
highlight column (0.32 and 0.45 were both slightly higher on the v7 crown) and its largest cap at 28%
is the nearest row to exp-16's 30%. The percolation point moved out too — the caps used to collapse
into one blob between 0.32 and 0.45 and now hold to 0.45. Nothing was re-tuned; the default is
unchanged. It is simply now a statement about the tree we ship.

**The funnel floor now contributes nothing to bark**, and that is worth recording so nobody re-turns
it. Rendered at the delivered shrink, `CANOPY_CORE_LIFT` 0.20 → 631 px of bark and 0.00 → **631**, the
same number: the radial lift was a weak proxy for this job and the real lever subsumes it entirely.
It is KEPT at 0.20 because it is still worth 17 px of warm highlight (759 vs 742) and one point of
floor is not worth churning a v7 decision for — but it is spent as a bark lever, twice over now.

## 5. The scale-convention fork is unchanged, and `framing-fork.png` is re-rendered anyway

Both v8 changes are canopy-only and ADR-0293 gives frames 00–06 no canopy at all, so the whole wood
phase is untouched — and that is exactly the part of the track the framing fork turns on. v6's and
v7's reading therefore stands: under `eased`/`per-stage` f00 is a bare pole with a root fan, magnified
into a fence post, tilting the fork back toward keeping `fixed`. `framing-fork.png` is re-rendered on
the v8 frames regardless, because it is owner-facing evidence for an OPEN fork and it goes stale in
silence.

`frames/contact-sheet.png` — the delivered track's own 19-frame strip — was found **labelled v6**,
which is to say it had been stale for two increments including the one that wrote the rule about
stale evidence. Nothing regenerates it: `pixelise.py` writes the frames beside it and never touches
it, so it is a committed artifact with no producer in the reproduce block. It is refreshed here and
the command is now written down, which is the actual fix:

```
python sheet.py frames/contact-sheet.png "v8=frames" --frames 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18 --zoom 2
```

`staging-fork.png` is deliberately NOT re-rendered: it is the picture the owner actually picked B
from, and a decided fork's evidence is a record of what was shown, not a live view. ADR-0293's
staging boundary was CHECKED rather than assumed — `measure.py --monotone` reports frame 06 with zero
foliage and frame 07 with 20 px, so the wood phase is still f00–f06 and the flush still begins at f07.
(It is a live constraint, not a formality: an intermediate shrink of 0.62 re-timed the frames enough
to push f07 below the leaf-on threshold and would have moved the boundary the owner picked.)

## 6. Honest assessment

`exp16-vs-v7-vs-v8.png` is the three-way, every cell composited on the island's green plate.

**What the change bought**

- **The limb gap is closed to within 6%: 206 → 631 px of in-crown bark against exp-16's 670**, 4.4% →
  15.3% of crown against 15.7%. The trunk now forks into limbs you can follow up into the canopy with
  sky between the lobes, which is the read the reference has and this track has never had.
- **The crown converges on the reference from the other side too** — 4689 px → 4123 against 4280,
  where v7 was 10% larger than exp-16 and v8 is 4% smaller.
- **v7's one open drift closed for free.** v7 §6 item 2 recorded mean crown luma at 126 against
  exp-16's 119, "the wrong way by one", and declined to chase it because that would mean moving
  authored band positions. It is now **119, exactly exp-16's**, because the pixels that changed were
  bright canopy becoming shaded bark rather than any band moving.
- Highlight cap architecture held against the reference: 13 caps with the largest at 28%, against
  exp-16's 12 and 30% (v7: 11 and 25%).
- Crown colour count **held at 8**; all 19 frames strictly increasing on both silhouette and foliage
  area (`measure.py --monotone`, exit 0); widest half-width band still exp-16's 0.58–0.67.
- Registration got **better**, not just different: contact-anchor spread 3.1619 → 2.348, frames
  needing a shift 11 → 9, body-centroid spread after normalisation 7.2493 → 5.9378 and its max
  frame-to-frame step 3.4017 → 2.9788. The mature footprint narrows 92 → 88 px wide. Encoded bytes
  30,939 → 32,569 — the track grew slightly, restated in the registry ceilings, which are the
  measured actuals with zero headroom by design.

**What it cost, and it is one number**

1. **The foliage floor moved 44% → 48%.** exp-16's is 44% and v7 matched it exactly; our lowest
   foliage now sits about five pixels higher on a 119 px tree. It is the direct consequence of the
   lever — shrinking the lowest lobes lifts the lowest foliage pixel with them, and the splay is
   horizontal because vertical is the one direction an upside-down pear cannot afford (ADR-0289 D2).
   §4 records the repair that was tried, measured, and rejected at 85 px of bark per point of floor.
   The half-width profile below the widest band thins with it (band 5: 29 → 18 against exp-16's 38).
2. **The warm highlight gives back some of v7's gain**: 889 px (19.0%) → 759 (18.4%) against exp-16's
   874 (20.4%). Not tuned back, because the crown is 12% smaller and much of what left the highlight
   became the bark this increment was for — the two are the same pixels.
3. The mid-flush bare twig tips (v6 §3) are unchanged and still un-tuned on purpose.

**The owner's other two triaged techniques are still unspent, and still cannot touch what is left.** A
rim light on an extra bright band (#2) and negative-power point lights (#3) are both shading, and §2's
table is the proof that shading cannot move bark. What remains open is the floor, and that is
geometry with a measured price.

**Not verified, blocker unchanged and identified:** `on-island.png` is still the **v3** track's
live-lab screenshot. The lab is reachable and driveable, but every Browser-pane screenshot fails with
*"the pane is not displayed"* and a session cannot cause a pane to be displayed. The mounted assets
ARE regenerated and `chapter2-round3-tree-candidates.test.ts` decodes the shipped PNGs independently
and passes (304 tests, exit 0).

## What the code owns (ADR-0280 D1, unchanged)

- **Topology is a strict PREFIX.** Skeleton grown once, birth iteration per node, frontier eases out
  of **zero** length.
- **Randomness is identity-keyed** (`h01` on a part's address), never a draw counter.
- **The camera is one declared scalar** — orthographic at 20°, framed once to the mature extent and
  byte-identical on every frame.
- **Growth pacing is authored and measured** — frames at equal silhouette-change arc length.
- **The crown proxy is generated, not sculpted** — an analytic ellipsoid fitted to the frame's own
  lobes. No `.blend`, no imported mesh, no Data Transfer modifier.
- **The crown's opening is one scalar pair**, normalised against the live tree's own floor and top —
  no per-lobe authoring, no hand-placed gaps.
- **Determinism:** CPU Cycles, `seed = 20260801`, fixed samples, pinned 5.2.0 LTS, numpy recorded.

## Registered and mounted

`register_track.py` re-measures every delivered frame under the **lab's** one applied anchor rule,
normalises x, and emits `packages/app-surface/src/assets/code-blender/`. The track is the lab's fifth
candidate: `?organicGrowth=r3-lab#/tree`, button **code-blender**. Every hand-entered TypeScript number
in `chapter2-round3-tree-candidates.ts` was re-synced from the emitted `registry-block.ts.txt` — the
source anchors, the normalisation offsets, the mature footprint, encoded bytes, BOTH the registry and
candidate ceilings, the four body-centroid figures, the contact-anchor spread, the shifted-frame count
and the lab's `shippedTotal` — and the suite re-derives all of them from the shipped pixels.
`CODE_BLENDER_ANCHOR` is unchanged at (62,120).

`groundRowSpreadPx` stays **4**, for the reason it has always had: the camera is fixed and the trunk
base is pinned at world z=0, but secondary growth thickens the trunk and the root spurs, so the near
edge of the base footprint descends by `r·sin 20°` as it fattens.

**Not claimed.** No owner LOOK on the track, no hero-tree selection, no technique adoption, no clean
-route switch, no arc closure. A ceiling demonstration under ADR-0280 D4, where an honest "not good
enough" is an accepted outcome.
