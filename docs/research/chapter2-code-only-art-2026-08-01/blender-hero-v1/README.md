# Blender hero tree v6 — two phases: grow the wood, then flush the leaves

**Date:** 2026-08-03 · **Blender:** 5.2.0 LTS, headless, CPU Cycles · **Cost:** $0 · **Vendor calls:** 0

[ADR-0293](../../../decisions/0293-the-chapter-2-growth-track-grows-the-wood-first-and-flushes.md),
owner-directed, on looking at the v5 track (PR #1103):

> "looks much nicer, but the leaves forming while the truck grows looks really ugly, can we just grow
> the truck and branches and the put the leaves on?"

Five versions grew wood and leaves together from frame zero. Nobody ever argued for that — it fell
out of v1 and survived because every later increment was aimed at something else. This one changes
the SEQUENCE and, deliberately, nothing else.

**Nothing here is owner-attested beyond the staging direction itself.** The LOOK verdict is the
owner's (ADR-0070) and §5 records the author's honest assessment.

## Reproduce

```
blender --background --python blender_tree.py -- --out raw --frames 19 --res 384 --samples 72 --shadow-samples 32
python pixelise.py raw frames 128
python measure.py frames --monotone
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
identical to those frames of a full run.

**Three exploratory flags, all defaulting to the delivered track.**

- `--leaf-on <N>` / `--leaf-full <N>` — where the phase boundary sits (§2). Owner-picked from
  `staging-fork.png`; the committed default is that pick.
- `--framing fixed | per-stage | eased` — the scale-convention fork, re-rendered on these frames
  (§4), where it now reads differently than it did one increment ago.
- `--skeleton space-colonisation | sapling` — settled by ADR-0289 D3 in favour of ours; retained so
  the question stays answered rather than open.

## 1. The change, and how small it is

One scalar moves. `con`, which already gated every cloud's weight, is re-keyed from "on at the first
frame" to "zero until the wood phase is over, then a smooth ramp to full". The skeleton, its birth
iterations, the camera, the pacing rule, the canopy rules (outer orders, crown floor, seats, cloud
sizing) and the whole root system are untouched.

The frame budget either side of the boundary is **not authored**. ADR-0280 D1 places frames at equal
silhouette-change arc length, so moving the flush later moves frames to where the change now is —
the split is expressed once, as an onset, and the pacing rule does the rest.

`--no-render` now prints `mat`, `con` and how many live lobes sit on juvenile seats, which is what
answers §3 below in ten seconds instead of a render.

## 2. Where the boundary sits — an owner pick from pictures

`staging-fork.png` is the three options rendered. Frames of bare wood before the first leaf:

| | wood-only frames | flush frames | reads as |
|---|---|---|---|
| A — `--leaf-on 12` | f00-f04 (26%) | 14 | barely see the branching; closest to what shipped |
| **B — `--leaf-on 17` (delivered)** | **f00-f06 (37%)** | **12** | **a recognisable branching tree, then a full flush** |
| C — `--leaf-on 23` | f00-f10 (58%) | 8 | the most striking winter tree; the flush is compressed |

**The owner picked B.** ADR-0293 D3 says where this sits is an art-direction choice with a rendered
answer rather than a number to argue about, so it stayed a flag and the pictures were the ask.

## 3. What the change cost, and one thing it did not

**The flush shows bare twig tips, and there is no length lever.** In a two-phase track the twigs
reach full length in the wood phase and the clouds then grow outward from inside them, so through
the flush every outer twig stands proud of the foliage arriving on it. A twig's extent is its
skeleton; the only lever is RADIUS, and a sub-pixel twig is an absent twig at 128 px — the same
mechanism the in-crown bark flecks were killed with. `WOOD_HIDE` went **0.32 → 0.78**, which cleans
the late frames measurably (compare f15 and f18 in `exp16-vs-v5-vs-v6.png`). It does **not** clean
the middle of the flush, because the same small `con` that keeps the clouds small there also keeps
the taper shallow. The residue reads as a tree in bud-break. Whether that is a defect or a feature is
a LOOK call and it is left to the owner rather than tuned blind. `WOOD_HIDE` is keyed on canopy
weight, which is zero for the whole wood phase, so none of this touches the winter tree.

**The young-canopy apparatus was suspected dead and is NOT — measured, not assumed.**
`N_CLOUD_YOUNG`, `CLOUD_FLOOR_YOUNG`, `CLOUD_ORDERS_YOUNG` and the `mat` easing all exist to make one
canopy mechanism serve a sapling and a mature crown, and if leaves only ever land on a nearly-grown
tree none of them has anything left to serve. Rather than delete on suspicion the `--no-render` plan
now prints the answer: the first leafy frame carries **`mat` = 0.69**, and `mat` climbs 0.69 → 1.00
across the flush, so the shell easing shapes most of the leafing-out. The seats are the weak case —
a juvenile seat owns exactly ONE live lobe, on four frames (f09-f12). Nothing is deleted; the case
for deleting the seats specifically is now a measurement someone can re-run.

**`measure.py --monotone` needed a correction, and it is not a loosening.** ADR-0293 makes "this
frame has no canopy at all" legitimate, and the classifier cannot tell a leafless frame from a leafy
one. Frame 00 is a 30-pixel hairline whose canopy is provably empty — `con` is 0, no cloud is
emitted — yet THREE of its trunk pixels quantise onto the darkest foliage band (92,90,46) exactly.
Frame 01 has none, so the series read 3 → 0 and the check called a leafless frame a foliage
regression. `FOLIAGE_NOISE_PX = 6` floors that; the first genuinely leafy frame carries 29, and every
frame from there is compared exactly as before. Same lesson `shape()`'s `FLOOR_MIN_PX` already
learned.

## 4. The scale-convention fork reads differently now, and it is worth saying so

The previous increment unblocked this fork and handed it over with **no recommendation**, because
v5's magnified early frames had finally become leafy whips. `framing-fork.png` is re-rendered on
these frames, and the picture has changed: under `eased` and `per-stage`, f00 is now a bare pole with
a root fan — magnified, it reads as a fence post. `fixed` hides that completely, because at 16 px
there is nothing to read either way.

So two-phase staging pushes the fork back toward **keeping `fixed`**, and by a wider margin than the
reason v5 discharged.

Say precisely what that does and does not retract. v5's finding was that magnifying its early frames
finally showed leafy whips rather than a blob, and that remains true **of v5**. It is not true of
what ships now, and not because the whips got worse: f04 is inside the wood phase by construction,
and f09 is two frames into the flush carrying tufts on bare branches. What the mid frames show now is
branching STRUCTURE, which is the whole point of ADR-0293 — but structure is thin, and thin is what a
magnifying convention exposes. The opening frame got barer at the same time as it stayed smallest,
and that is the frame a magnifying convention magnifies most. The owner's call either way; the
current picture is on the table.

## 5. Honest assessment

`exp16-vs-v5-vs-v6.png` is the three-way, every cell composited on the island's green plate.

**What the change bought**

- The thing the track exists to show is now watchable. The trunk, the buttress and the branching each
  have frames in which they are the subject; before, they were inside a green mass from frame zero.
- The late frames are cleaner than v5's — the deeper twig taper removes bark that used to poke
  through the crown.
- It cost one scalar. Every mechanism the previous four increments built and measured survives, and
  the mature frame is essentially unchanged: half-width profile identical to v5's to within a pixel,
  widest band still exp-16's 0.58-0.67, foliage floor 43% against exp-16's 44%, crown colour count
  **8**, mean luma 125.
- All 19 frames strictly increasing on both silhouette and foliage area.

**What it cost**

1. **The mid-flush bud-break twigs** (§3). The most visible new artifact, un-tuned on purpose.
2. **Registration moved a little further off.** Contact-anchor spread **3.02 → 3.16 px** and the
   registered ground row 118 → 120, though frames needing a shift improved **13 → 11**. Author-time
   only.
3. **Byte cost.** The track's encoded size is **30,226 → 31,210** bytes, restated in the registry
   ceilings, which are the measured actuals with zero headroom by design.
4. **Crown structure is unchanged and still the standing gap** — crown green **71%** against exp-16's
   51%. Sequencing the phases was a plausible route at it (the limbs finally get frames of their own)
   and it did not move the mature number, because at f18 the two tracks are the same tree.
5. **The opening frames are barer as well as smaller**, which is §4's problem.

**Not verified, blocker unchanged and identified:** `on-island.png` is still the **v3** track's
live-lab screenshot. The lab is reachable and driveable — the previous increment selected
`code-blender` in it through `javascript_tool` — but every screenshot fails with *"the Browser pane is
not displayed, so the page is not compositing frames"*, and a session cannot cause a pane to be
displayed. The mounted assets ARE regenerated and `chapter2-round3-tree-candidates.test.ts` decodes
the shipped PNGs independently and passes.

## What the code owns (ADR-0280 D1, unchanged; ADR-0289 and ADR-0293 narrow only what it depicts)

- **Topology is a strict PREFIX.** Skeleton grown once, birth iteration per node, frontier eases out
  of **zero** length.
- **Randomness is identity-keyed** (`h01` on a part's address), never a draw counter.
- **The camera is one declared scalar** — orthographic at 20°, framed once to the mature extent and
  byte-identical on every frame.
- **Growth pacing is authored and measured** — and it is what allocates the frames either side of the
  phase boundary, so the split is one number rather than two.
- **Determinism:** CPU Cycles, `seed = 20260801`, fixed samples, pinned 5.2.0 LTS, numpy version
  recorded.

## Registered and mounted

`register_track.py` re-measures every delivered frame under the **lab's** one applied anchor rule,
normalises x, and emits `packages/app-surface/src/assets/code-blender/`. The track is the lab's fifth
candidate: `?organicGrowth=r3-lab#/tree`, button **code-blender**. The hand-entered TypeScript numbers
in `chapter2-round3-tree-candidates.ts` were updated from the emitted block and are re-derived from
the shipped pixels by the suite.

`groundRowSpreadPx` stays **4**, for the reason it has always had: the camera is fixed and the trunk
base is pinned at world z=0, but secondary growth thickens the trunk and the root spurs, so the near
edge of the base footprint descends by `r·sin 20°` as it fattens. Buying a constant row would mean
lifting the frame as the tree matures — the base drift D1 forbids.

**Not claimed.** No owner LOOK on the track, no hero-tree selection, no technique adoption, no clean
-route switch, no arc closure. This is a ceiling demonstration under ADR-0280 D4, where an honest
"not good enough" is an accepted outcome.
