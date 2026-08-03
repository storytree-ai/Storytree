# Blender hero tree v7 — the canopy shades as one volume, and the metric that hid the rest

**Date:** 2026-08-03 · **Blender:** 5.2.0 LTS, headless, CPU Cycles · **Cost:** $0 · **Vendor calls:** 0

The target is CROWN STRUCTURE, the one gap that has survived every increment since v3 and the only
one v6 left standing. The approach is the owner's: a Ghibli-style Blender tree tutorial was triaged
into the arc's intent, and its top genuinely-new item — **normals transferred from a smooth crown
proxy, so the canopy shades as one volume rather than as a pile of blobs** — aims straight at it.

**Nothing here is owner-attested.** The LOOK verdict is the owner's (ADR-0070) and §6 records the
author's honest assessment, which includes a gap this increment did NOT close and now knows why.

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
identical to those frames of a full run. The plan line now also prints the crown proxy's extent.

**Four exploratory flags, all defaulting to the delivered track.** `--crown-normals <0..1>` is new
(§3); `--leaf-on`/`--leaf-full` (ADR-0293, owner-picked), `--framing fixed|per-stage|eased` (§5) and
`--skeleton space-colonisation|sapling` (settled by ADR-0289 D3) are unchanged. The
`--crown-normals` fork was rendered at 0.00 / 0.22 / 0.32 / 0.45 / 1.00 into `crown-normals-fork.png`:

```
for m in 0.0 0.22 0.32 0.45 1.0; do
  blender --background --python blender_tree.py -- --out work/raw-$m --frames 19 --res 384 \
      --samples 72 --shadow-samples 32 --crown-normals $m --only 18
  python pixelise.py work/raw-$m work/$m 128
done
```

## 1. The instrument was measuring the wrong thing, and that is the increment's most useful finding

"You can see the limbs running through exp-16's canopy and not through ours" has been carried since
v3 as one number: **crown GREEN FRACTION, ours 71% against exp-16's 51%.** That number is a blend of
two independent things, and the half it is mostly made of is not the half it was named for.

`measure()` scored a pixel green on `G > R and G > B`. exp-16's own warm top-highlight band
(173,167,114) fails that test, and so does its darkest foliage band (92,90,46). So **27% of exp-16's
"non-green" crown is its own foliage.** Classified by nearest FAMILY instead — the rule the raster
back half already uses — the honest statement is bark:

| mature crown | px | colours | **bark** | warm highlight | in caps | largest cap | lum |
|---|---|---|---|---|---|---|---|
| exp-16 | 4280 | 12 | **670 (15.7%)** | 874 (20.4%) | 12 | 30% | 119 |
| v6 (PR #1105) | 4706 | 8 | **185 (3.9%)** | 830 (17.6%) | 14 | 21% | 125 |
| **v7 (delivered)** | **4689** | **8** | **206 (4.4%)** | **889 (19.0%)** | **11** | **25%** | **126** |

The gap was never 71-vs-51. It is **670 bark pixels against 185** — 3.6x, where the green fraction
said 1.4x the other way. `measure.py` now prints bark and highlight as separate lines, because they
have separate causes and a figure that mixes them sends the next increment after the wrong organ,
which is what happened to four of them.

The second new column matters as much. **The highlight's connected CAPS** is the instrument for "does
the crown read as one volume or as a pile of blobs", a question argued in adjectives for four
increments. A crown of separate lobes cannot pool a highlight — each lobe presents every facing angle,
so the top band of N·L lands as one small cap per lobe. v6 scatters its highlight into 14 caps whose
largest holds 21% of it. That is the defect, stated as a number for the first time.

## 2. Verified before it was built

The whole technique rests on one fact about our renderer, so it was probed in ninety seconds rather
than assumed: **Cycles' `Geometry > Normal` — the socket `banded()` already reads — honours custom
split normals.** A sphere with all normals forced to +Z renders as ONE band where the same sphere
smooth-shaded hits all five. So no shader changes, the authored band list is untouched, and this is
not the video's EEVEE-only `Shader to RGB` route smuggled in by another name (ADR-0280 D2a pins CPU
Cycles; that node is closed to us).

## 3. The proxy is analytic, and the mix was picked from the reference's structure

The tutorial reaches this with a Data Transfer modifier off a hand-sculpted proxy mesh. **Both halves
of that are unavailable** — ADR-0280 D1 forbids a sculpted asset, and the modifier needs a
nearest-surface mapping heuristic we would then have to tune. So the proxy is an **analytic ellipsoid
fitted per frame to the lobe set that frame emitted**: exact normal everywhere, no mapping, generated
from the canopy we already author, and it tracks the crown through ADR-0293's flush for free where a
fixed proxy sized to `CROWN_C`/`CROWN_R` would be wrong on every frame but the last.

It is a blend — the lobe normals carry the clump silhouettes, the proxy carries the volume — and
`--crown-normals 0.0` is **byte-identical to the delivered v6 frame**, so the fork moves one variable.

**0.22 is not "as unified as possible", and the reason is that exp-16 is not either.** Read against
the reference rather than against the extreme, the cap metric has a peak:

| mix | highlight | caps | largest | cap sizes | bark |
|---|---|---|---|---|---|
| 0.00 | 826 (17.6%) | 12 | 21% | 177 168 148 103 72 | 206 |
| **0.22 (delivered)** | **889 (19.0%)** | **11** | **25%** | **221 217 155 135 60** | **206** |
| 0.32 | 902 (19.2%) | 9 | 54% | 486 159 143 50 37 | 207 |
| 0.45 | 909 (19.4%) | 7 | 76% | 687 160 37 19 3 | 207 |
| 1.00 | 821 (17.5%) | 11 | 79% | 650 130 24 7 3 | 206 |
| exp-16 | 874 (20.4%) | 12 | 30% | 261 244 198 83 45 | 670 |

exp-16 does **not** pool its highlight into one region — it carries a few large caps on a shared
value structure. Between 0.32 and 0.45 our separate caps percolate into a single blob, and past that
the highlight *falls* again, because a bare ellipsoid presents less area to the key than a crown of
clumps does. 0.22 buys essentially all the highlight 0.32 does and lands on exp-16's cap architecture
instead of overshooting it. `crown-normals-fork.png` is the picture; the owner can move it.

## 4. The canopy floor is a funnel, not a plane

Read the last column of that table: **bark is 206–207 px at every mix from 0 to 1.** Normals decide
which band a canopy pixel takes and never whether a pixel *is* canopy, so the technique provably
cannot move the limb half of the gap. That half is geometry, and it got its own lever.

`CANOPY_FLOOR` is a horizontal plane at a fraction of the live top. exp-16's is not. Its trunk forks
into a candelabra of primary limbs that splay up and out, its canopy sits on the ENDS of them, and
the open cone above the fork is where you read the limbs. So the floor gains a radial term: lifted
near the trunk axis, unchanged at the rim, normalised against the live crown's own half-width like
every other rule at this end of the tree. It moved bark **185 → 206**, and the foliage floor from 43%
to **44%, exactly exp-16's**, at no cost to the silhouette profile (identical to v6 to the pixel).

**The lever is then close to exhausted, and that is recorded so nobody re-turns the knob.** Measured
at a fixed mix so the three points are comparable, `CANOPY_CORE_LIFT` 0.00 → 187 px of bark,
0.20 → 207, 0.34 → 242: about 160 px per unit of lift. Reaching exp-16's 670 would need a lift near
**3.0** — a floor three tree-heights above the ground. It is the wrong knob, not an under-turned one.

## 5. The scale-convention fork is unchanged, and this is checkable rather than asserted

Both changes are canopy-only, and ADR-0293 gives frames 00–06 no canopy at all. So the whole wood
phase is **byte-identical to v6** (verified by hash on f00/f04/f06), which is exactly the part of the
track the framing fork turns on. v6's finding therefore stands untouched: under `eased`/`per-stage`
f00 is a bare pole with a root fan, magnified into a fence post, so two-phase staging tilts the fork
back toward keeping `fixed`. `framing-fork.png` is **re-rendered on the v7 frames anyway** — it is
owner-facing evidence for an open fork and it goes stale silently, so it is never left to be inferred.

`staging-fork.png` is deliberately NOT re-rendered: it is the picture the owner actually picked B
from, and a decided fork's evidence is a record of what was shown, not a live view.

## 6. Honest assessment

`exp16-vs-v6-vs-v7.png` is the three-way, every cell composited on the island's green plate.

**What the change bought**

- The crown now carries **one** light-to-dark gradient with the clumps reading on it, where v6 was a
  field of separate bubbles each with its own bright cap. Highlight caps 14 → 11 and the largest
  21% → 25% against exp-16's 12 and 30%; the warm highlight 17.6% → **19.0%** against 20.4%.
- The highlight was never thin. It was **scattered**: 830 px in v6 against exp-16's 874 in a crown
  10% larger. Naming it as fragmentation rather than as deficit is what let one lever move it.
- Crown colour count **held at 8** across the whole fork, and all 19 frames are strictly increasing on
  both silhouette and foliage area (`measure.py --monotone`, exit 0).
- Mature half-width profile identical to v6 to the pixel, widest band still exp-16's 0.58–0.67,
  foliage floor now exactly exp-16's 44%.
- Registration essentially did not move: contact-anchor spread (3.1619), frames needing a shift (11),
  max shift, ground-row spread, the source anchors, the normalisation offsets and the registered
  ground row (120) are all **exactly v6's** — the anchor rule reads a root fan and trunk footprint
  this increment never touches. Only the body-centroid figures shift in the third decimal (spread
  3.7802 → 3.7867 before, 7.2427 → 7.2493 after), because the crown they average over changed.
  Encoded bytes **31,210 → 30,939**: the track got slightly smaller.

**What it did not buy, and the diagnosis is the deliverable**

1. **The limb gap is still open: 206 px of crown bark against exp-16's 670.** It is now known not to
   be a shading problem (bark is flat across the entire normals fork) and not a floor-height problem
   (the funnel's response is ~160 px per unit lift and exp-16 would need 3.0). The remaining cause is
   structural and specific: **exp-16 is a drawing, so its open lower crown is open from the front.
   Ours is a closed 3D shell, and a void carved inside a shell is invisible through it.** Its low
   canopy is a handful of DISCRETE lobes on the ends of splayed limbs with sky between them; ours is
   enough lobes at that height to merge into a continuous band. The next lever is therefore lobe
   COUNT and SEPARATION in the bottom of the crown, or primary limbs thick enough to stand proud of
   it — not another shading technique. That is the first time this gap has had a named mechanism.
2. **Mean crown luma drifted 125 → 126** against exp-16's 119, the wrong way by one. Not tuned, because
   chasing it would mean moving the authored band positions that four increments have held.
3. The mid-flush bare twig tips (v6 §3) are unchanged and still un-tuned on purpose.

**The owner's other two triaged techniques were not needed and are not spent.** A rim light on an
extra bright band (#2) was aimed at the highlight, and #1 closed most of that gap on its own without
touching the colour budget, so spending a ninth band on it now would be paying for something already
bought. Negative-power point lights (#3) were admitted only "if a measurement moves" — none did.
Both remain available; neither can touch the limb gap, for the reason in item 1.

**Not verified, blocker unchanged and identified:** `on-island.png` is still the **v3** track's
live-lab screenshot. The lab is reachable and driveable, but every screenshot fails with *"the Browser
pane is not displayed"* and a session cannot cause a pane to be displayed. The mounted assets ARE
regenerated and `chapter2-round3-tree-candidates.test.ts` decodes the shipped PNGs independently and
passes (234 tests, exit 0).

## What the code owns (ADR-0280 D1, unchanged)

- **Topology is a strict PREFIX.** Skeleton grown once, birth iteration per node, frontier eases out
  of **zero** length.
- **Randomness is identity-keyed** (`h01` on a part's address), never a draw counter.
- **The camera is one declared scalar** — orthographic at 20°, framed once to the mature extent and
  byte-identical on every frame.
- **Growth pacing is authored and measured** — frames at equal silhouette-change arc length.
- **The crown proxy is generated, not sculpted** — an analytic ellipsoid fitted to the frame's own
  lobes. No `.blend`, no imported mesh, no Data Transfer modifier.
- **Determinism:** CPU Cycles, `seed = 20260801`, fixed samples, pinned 5.2.0 LTS, numpy recorded.

## Registered and mounted

`register_track.py` re-measures every delivered frame under the **lab's** one applied anchor rule,
normalises x, and emits `packages/app-surface/src/assets/code-blender/`. The track is the lab's fifth
candidate: `?organicGrowth=r3-lab#/tree`, button **code-blender**. The hand-entered TypeScript numbers
in `chapter2-round3-tree-candidates.ts` were updated from the emitted block — encoded bytes, the two
registry/candidate ceilings, the four body-centroid figures and the lab's `shippedTotal` — and are
re-derived from the shipped pixels by the suite. The source anchors, normalisation offsets and
`CODE_BLENDER_ANCHOR` are unchanged, because the anchor rule reads a root fan this increment does not
touch.

`groundRowSpreadPx` stays **4**, for the reason it has always had: the camera is fixed and the trunk
base is pinned at world z=0, but secondary growth thickens the trunk and the root spurs, so the near
edge of the base footprint descends by `r·sin 20°` as it fattens.

**Not claimed.** No owner LOOK on the track, no hero-tree selection, no technique adoption, no clean
-route switch, no arc closure. This is a ceiling demonstration under ADR-0280 D4, where an honest
"not good enough" is an accepted outcome.
