# Blender hero tree v9 — the lower rim returns without closing the crown

**Date:** 2026-08-05 · **Blender:** 5.2.0 LTS, headless, CPU Cycles · **Cost:** $0 · **Vendor calls:** 0

v8 solved the long-standing structural gap: visible limbs inside the crown rose from 206 px to
631 px against exp-16's 670. It paid for that opening by moving the mature foliage floor from the
reference-matched 44% to 48%. v9 is the deliberately smaller follow-up: lower only the outer rim
lobes, leaving their radii and horizontal positions untouched, so the floor can return without
putting foliage back over the middle.

**Delivered at `--low-rim-drop 0.50`: foliage floor 48% → 45% against exp-16's 44%, while bark
holds at 630 px (15.0% of crown) against 670 (15.7%).** Crown area moves 4123 → 4200 against 4280;
warm highlight moves 759 → 773; mean crown luma stays exactly 119. `--low-rim-drop 0` reproduces
v8 exactly.

**Nothing here is owner-attested.** There has been no owner LOOK, hero-tree selection, technique
adoption, clean-route switch, or arc closure. This is measured author evidence only.

## Reproduce

The default command renders v9:

```text
blender --background --python blender_tree.py -- --out raw --frames 19 --res 384 --samples 72 --shadow-samples 32
python pixelise.py raw frames 128
python measure.py frames --monotone
python measure.py ../../../../packages/app-surface/src/assets/exp-16/tree frames --frame 18
python measure.py ../../../../packages/app-surface/src/assets/exp-16/tree frames --shape --frame 18
python register_track.py --write        # -> packages/app-surface/src/assets/code-blender/
python sheet.py frames/contact-sheet.png "v9=frames" --frames 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18 --zoom 2
```

The exact v8 control remains runnable rather than inferred:

```text
blender --background --python blender_tree.py -- --out raw-v8 --frames 19 --res 384 --samples 72 --shadow-samples 32 --low-rim-drop 0
python pixelise.py raw-v8 frames-v8 128
python sheet.py exp16-vs-v8-vs-v9.png "exp16=../../../../packages/app-surface/src/assets/exp-16/tree" "v8=frames-v8" "v9=frames" --frames 0,4,9,14,18 --zoom 2
```

`blender_tree.py` runs under Blender's bundled Python; `pixelise.py`, `measure.py`, `sheet.py` and
`register_track.py` need system Python with numpy + Pillow. `bpy` from PyPI is not a route on this
machine because there is no wheel for Python 3.14.5.

**Every sheet now lands with its own producer record, and a mixed-code-state sheet is refused.**
`sheet.py` writes `<name>.png.provenance.json` beside each picture — this exact argv, every cell it
composed, a content hash per frame and per output — and it REFUSES to draw when two cells declare
different code states, before it has imported the imaging stack or written a byte. The code state is
`blender_tree.py`'s own source digest, recorded in `render-meta.json` at render time and propagated
into the delivered directory's `registration.json` by `pixelise.py`; ask for it directly with
`python provenance.py check <label>=<dir> …`. A directory that declares nothing is UNDECLARED and is
never counted, so nothing here polices the pictures already committed and no gate step exists —
`provenance.py`'s module docstring carries the three observations and the decision behind that shape.

Run structural sweeps under Blender too:

```text
blender --background --python blender_tree.py -- --no-render --low-rim-drop 0
blender --background --python blender_tree.py -- --no-render --low-rim-drop 0.35
blender --background --python blender_tree.py -- --no-render --low-rim-drop 0.50
blender --background --python blender_tree.py -- --no-render --low-rim-drop 0.70
```

The plain-Python route iterates a different tree: the space-colonisation reductions are
numpy-version sensitive, and system numpy 2.4.4 grows a different skeleton from Blender's bundled
2.3.4. `--only 4,9,18` renders a subset for the tight loop; subset frames are identical to those
frames of a full run.

## 1. The v8 foundation, retained as history

v7 proved that the crown gap was geometry rather than shading. Bark inside the crown held flat
across the complete `--crown-normals` fork, and thickening covered limbs out to 4× bought exactly
nothing. With the lobes removed entirely, the structural proxy exposed 1292 px of wood against the
reference's 670 rendered px: the limbs already existed and were simply covered.

`CANOPY_LOW_SHRINK` therefore shrinks lower lobes, and `CANOPY_LOW_SPLAY` pays the lost radius
outward. At splay 1.0 the outer surface is held by construction: the inner edge retreats to expose
wood while the silhouette keeps its reference-matching widest band.

| v8 mature variant | crown px | bark | warm highlight | caps / largest | luma | widest band | floor |
|---|---:|---:|---:|---:|---:|---:|---:|
| v7, before the opening | 4689 | 206 (4.4%) | 889 (19.0%) | 11 / 25% | 126 | 0.58–0.67 | 44% |
| shrink 0.75, splay 1.0 | 4236 | 551 (13.0%) | 787 (18.6%) | 11 / 28% | 120 | 0.58–0.67 | 48% |
| **shrink 0.90, splay 1.0 (v8)** | **4123** | **631 (15.3%)** | **759 (18.4%)** | **13 / 28%** | **119** | **0.58–0.67** | **48%** |
| exp-16 | 4280 | 670 (15.7%) | 874 (20.4%) | 12 / 30% | 119 | 0.58–0.67 | 44% |

The structural proxy was calibrated before it was trusted. It rasterises wood and lobe discs at
the delivered 128 px scale, applies the same wood taper and crown-mask boundary as `measure.py`, and
ranks geometry without paying for a render. It under-reports by design because it has no depth: a
lobe behind a limb still occludes it in the proxy. On v8 it reported 619 bark pixels where the
render reported 631, so proxy values below remain ranking evidence, never substituted for shipped
pixel measurements.

The v8 attempt to repair the floor by fading the *shrink* toward the rim was rejected and remains
rejected. At shrink 0.90 / splay 1.0, rim-fade 0.0 → 0.5 → 1.0 moved proxy bark 619 → 450 → 319 for
only two and three floor points: about 85 bark pixels per recovered point. It restored radius and
therefore put canopy back over the limbs. v9 instead changes only vertical position.

## 2. The v9 lever: drop the rim, do not refill it

`CANOPY_LOW_RIM_DROP` applies only to lobes the low-crown rule actually shrank. A smooth radial gate
is zero in the core and reaches full strength at the live rim; the selected lobe moves downward by
a fraction of the radius it lost. Its radius and horizontal position do not change. Consequently
the operation can recover the lowest foliage pixels without undoing the inner-edge retreat that
made the limbs visible.

The mature structural sweep was run before the render:

| `--low-rim-drop` | proxy bark px | proxy canopy px |
|---:|---:|---:|
| **0.00 (exact v8)** | **619** | **1930** |
| 0.35 | 612 | 1970 |
| **0.50 (selected)** | **615** | **1986** |
| 0.70 | 610 | 1999 |

All four keep proxy bark within nine pixels while canopy returns monotonically. `0.50` was selected
because its rendered result closes three of the four lost floor points, closes roughly half of
v8's crown-area shortfall, and leaves rendered bark effectively identical (631 → 630). Continuing
to `0.70` buys only 13 more proxy canopy pixels while giving back another five proxy bark pixels;
there is no measured need to push past a floor already within one point of the reference. This is
the slow-growth minimum, not a claim that 0.50 is visually optimal.

`--low-rim-drop 0` is an exact v8 compatibility setting. The delivered default is `0.50`.

## 3. Delivered evidence

`exp16-vs-v8-vs-v9.png` is the current three-way comparison, with every cell composited on the
island's green plate.

| mature measurement | v8 | **v9 delivered** | exp-16 |
|---|---:|---:|---:|
| foliage floor | 48% | **45%** | 44% |
| crown area | 4123 | **4200** | 4280 |
| bark in crown | 631 (15.3%) | **630 (15.0%)** | 670 (15.7%) |
| warm highlight | 759 | **773** | 874 |
| highlight caps / largest | 13 / 28% | **11 / 29%** | 12 / 30% |
| mean crown luma | 119 | **119** | 119 |
| crown colours | 8 | **8** | — |
| widest half-width band | 0.58–0.67 | **0.58–0.67** | 0.58–0.67 |

The complete 19-frame `measure.py --monotone` run passes: both silhouette area and foliage area are
strictly increasing. Frames 00–06 contain zero foliage, and frame 07 is the first leafy frame at
19 px, so ADR-0293's owner-picked staging boundary still holds. The wood phase is untouched because
rim drop applies only to lobes the low-crown rule shrank.

The highlight architecture moves closer to the reference: v9 has 11 caps with the largest at 29%,
against exp-16's 12 / 30%. Warm-highlight area recovers 14 px without moving the authored bands or
the exact luma match. The crown still contains eight colours.

## 4. Registration and budget

`register_track.py` re-measures every delivered frame under the lab's single applied anchor rule,
normalises x, and writes `packages/app-surface/src/assets/code-blender/`. For v9 it reports:

- contact-anchor spread before normalisation: **2.4169 px**;
- frames shifted: **8**;
- body-centroid spread / max step before normalization: **3.4635 / 1.7204 px**;
- body-centroid spread / max step after normalization: **5.8901 / 2.7204 px**;
- encoded tree-track bytes: **32,959**.

These are author-time registration costs only; no runtime renderer or registration seam is added.
The applied anchor normalization makes the body centroid less steady, not more: spread rises from
3.4635 to 5.8901 px and max step from 1.7204 to 2.7204 px. That is the measured cost of pinning the
lab's shared contact rule rather than evidence that the tree itself became steadier.
The emitted registry ceilings remain the measured actuals with zero headroom by design.
`CODE_BLENDER_ANCHOR` remains (62,120), and `groundRowSpreadPx` remains 4: secondary growth thickens
the trunk and root spurs under a fixed 20° camera, so the near edge of the footprint descends as the
base fattens.

## 5. Evidence history and commands

The comparison sheets deliberately remain in sequence because each records the delivered pixels at
that increment:

- `exp16-vs-v2-vs-v3.png`: first authored cel treatment;
- `exp16-vs-v3-vs-v4.png`: canopy floor and inverted pear;
- `exp16-vs-v4-vs-v5.png`: root flare and mid-stage whip;
- `exp16-vs-v5-vs-v6.png`: two-phase track and staging work;
- `exp16-vs-v6-vs-v7.png`: crown-proxy normals;
- `exp16-vs-v7-vs-v8.png`: lower-crown shrink and splay;
- `exp16-vs-v8-vs-v9.png`: rim drop.

`framing-fork.png` records the still-open scale-convention fork. `fixed` remains the delivered
default: one camera framed once to mature extent. `per-stage` and `eased` remain exploratory only.
`staging-fork.png` is deliberately not regenerated because it is the evidence the owner actually
used to pick staging B; a decided fork's evidence is a historical record, not a live view.

`crown-normals-fork.png` is v8 evidence and remains useful because it established that shading
does not control bark: across mixes 0.00–1.00, bark stayed at 629–631 px. v9 does not retune
`--crown-normals 0.22`; it changes only the vertical position of low rim lobes. It is also the
picture that motivated the producer records above: four of its five variants were rendered before a
canopy constant existed and one after, so a sheet whose whole purpose was isolating ONE lever varied
two, with no error and no visible cue. Composed today, `sheet.py` would refuse it rather than draw
it. Nothing re-renders it — it stays as the record of what was shown.

## 6. Honest remaining gaps

v9 materially improves the one known cost of v8, but it does not erase the remaining differences:

1. **Foliage floor is still one point high:** 45% against 44%. Pushing further was not justified by
   the structural sweep and has no owner LOOK behind it.
2. **The crown remains 80 px (1.9%) smaller:** 4200 against 4280.
3. **Visible bark remains 40 px low:** 630 (15.0%) against 670 (15.7%). v9 preserves v8's structural
   win; it does not close the final six-percent count gap.
4. **Warm highlight remains low:** 773 against 874, or 18.4% against 20.4% of crown, although the cap
   count and largest-cap share now sit close to the reference at 11 / 29% against 12 / 30%.
5. **The scale convention remains an open art-direction fork.** Exp-16 holds roughly constant
   apparent height from frame 03 while this track uses one fixed mature camera and grows from 14%
   to 100% apparent height. That is ADR-0280 D1 working as authored, not a technical defect, but no
   owner has chosen between the conventions.
6. The mid-flush bare twig tips identified in v6 remain deliberately untuned.
7. `on-island.png` is still the v3 live-lab screenshot. The mounted assets are current. The claim
   that the screenshot route is unavailable is **withdrawn** — it was true only of the Browser pane.
   Headless Playwright against `pnpm studio:up` photographs the lab fine (`@playwright/test` is
   already an `apps/studio` dev dependency and its chromium is cached), and that is how the v9
   owner LOOK was staged on 2026-08-14. Three settle traps make a naive attempt produce a WRONG
   picture, all measured: a fixed sleep photographs one candidate mid-flush against a mature other
   one; settling on the sprite's `href` is no better, because the DOM sits stable at `frame-18` for
   10s+ while the draw-on reveal is still incomplete; and polling with
   `screenshot({animations:'disabled'})` PINS the reveal, so a pixel-settle loop reports "settled"
   on an incomplete raster. The damage always followed the STAGE ORDER rather than the candidate, so
   give each candidate its own page and an identical generous wait. Verify before believing a sheet:
   the SHARED, frozen plant track must render identically in every cell — if it does not, the cells
   are at different growth progress and the comparison is void.

The owner's two other triaged shading techniques—an extra rim-light band and negative-power point
lights—remain unspent. Neither can change visible bark; the normals fork already measured that
boundary. There is **no owner LOOK** on v9, so none of the measurements above is a visual verdict.

## What the code owns (ADR-0280 D1, unchanged)

- **Topology is a strict prefix.** The skeleton is grown once, every node records its birth
  iteration, and the frontier eases out of zero length.
- **Randomness is identity-keyed** (`h01` on a part's address), never a draw counter.
- **The camera is one declared scalar:** orthographic at 20°, framed once to mature extent and
  byte-identical on every frame.
- **Growth pacing is authored and measured:** frames sit at equal silhouette-change arc length.
- **The crown proxy is generated, not sculpted:** an analytic ellipsoid fitted to live lobes; no
  `.blend`, imported mesh, or Data Transfer modifier is a source of truth.
- **The crown opening is scalar and self-similar:** low shrink, outward splay, and rim drop are
  normalised against the live tree's own floor, top, and radius; there are no hand-placed gaps.
- **Determinism:** CPU Cycles, `seed = 20260801`, fixed samples, Blender 5.2.0 LTS, numpy recorded.

## Registered and mounted

The track remains the lab's fifth candidate at `?organicGrowth=r3-lab#/tree`, button
**code-blender**. `register_track.py --write` emits the manifest, registration record, shifted PNGs,
and `registry-block.ts.txt`; the app-side suite independently decodes the shipped PNGs and re-derives
the hand-entered TypeScript measurements.

**Not claimed:** no owner LOOK, hero-tree selection, technique adoption, clean-route switch, or arc
closure. This is a ceiling demonstration under ADR-0280 D4, where an honest “not good enough” remains
an accepted outcome.
