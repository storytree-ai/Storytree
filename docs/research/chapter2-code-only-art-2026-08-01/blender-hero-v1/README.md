# Blender hero tree v4 — the crown gets a floor, and the tree gets a waist

**Date:** 2026-08-03 · **Blender:** 5.2.0 LTS, headless, CPU Cycles · **Cost:** $0 · **Vendor calls:** 0

The fourth exercise of [ADR-0280](../../../decisions/0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md)
D2a, and the first one aimed at defects the owner NAMED rather than at a gap we found ourselves.
[ADR-0289](../../../decisions/0289-the-chapter-2-growth-track-animates-a-tree-forming-not-a-sap.md)
D2 names exactly two, both in this directory's own canopy code rather than in the skeleton:

> "we seem to be added the greenary at the trunk for some reason, and we losing the overall upside
> down pair shape of the tree"

**Nothing here is owner-attested.** The LOOK verdict is the owner's (ADR-0070) and §6 records the
author's honest assessment, which is not flattering everywhere.

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
Blender's bundled 2.3.4. The delivered tree is whatever the *pinned* Blender's numpy grows, so
`render-meta.json` records the numpy version alongside the seed. `--only 14,18` renders a subset for
the tight colour loop; the retiming, camera and frame indices are unchanged, so a subset frame is
identical to that frame of a full run.

The `--no-render` plan now prints a **canopy-area proxy per frame and flags any frame that shrinks**,
which is the ten-second version of the ten-minute `--monotone` check — see "the obligation the floor
creates" below.

**Two exploratory flags, both defaulting to the delivered track.**

- `--framing fixed | per-stage | eased` — the scale-convention fork. **Now rendered** (§5) where every
  previous increment left it built-but-unseen.
- `--skeleton space-colonisation | sapling` (`--sap-preset <species>`) — who grows the skeleton, from
  the Blender-ecosystem spike:
  [`../../chapter2-blender-ecosystem-spike-2026-08-02/`](../../chapter2-blender-ecosystem-spike-2026-08-02/README.md).
  Settled by ADR-0289 D3 in favour of ours; retained so the question stays answered rather than open.

## 1. The two defects, measured

The previous increments argued the silhouette in adjectives. `measure.py --shape` states it as
half-width by height decile, base to apex, plus the height of the lowest row carrying canopy:

| height band | 0.00-0.08 | 0.17-0.25 | 0.25-0.33 | 0.42-0.50 | 0.58-0.67 | 0.83-0.92 | 0.92-1.00 | foliage floor |
|---|---|---|---|---|---|---|---|---|
| exp-16 (the bar) | 23 | 9.5 | 7.5 | 38.5 | **47** | 31.5 | 22 | **44%** |
| v3 (landed 08-02) | 8.5 | 18.5 | 20.5 | 39.5 | **45.5** | 29 | 14.5 | **16%** |
| **v4 (this)** | 10 | **5** | **4** | 26 | 44 | 38 | 20 | **45%** |

Both defects are in that table.

**"Greenery at the trunk" is the foliage floor.** exp-16 carries no canopy below 44% of its height.
v3's lowest canopy sat at 16%, and three of its 21 mature clouds were centred at 30%, 36% and 48% of
tree height — detached bubbles flanking a bare bole.

**"Losing the upside-down pear" is the WAIST.** The two crowns already agreed on where they are
widest and on how wide, so the phrase was never about the top of the tree. What exp-16 has and v3 did
not is a narrow stem: exp-16 pinches to a 7.5 px half-width at a quarter of its height and then jumps
to 38.5 by half, while v3 ramped smoothly 18.5 → 20.5 → 39.5 and read as an oval on a short stick.

## 2. The fix, and why it is two halves of one question

**The canopy floor.** v3's rule for where foliage sits was purely TOPOLOGICAL — a node bears canopy
if it is within a few orders of a live tip. A short lateral that ENDS low on the bole is within zero
orders of a live tip, so it scored full weight and grew a cloud beside the trunk. The floor is the
missing GEOMETRIC half: a node bears canopy only if it is in the crown, and the crown is the top of
the tree. It is a FRACTION of the live tree's own height, not a world z, which is what lets one rule
serve both ends of the track — a sapling's apex is at 100% of its own height and greens; the same
lateral, once the leader has climbed past it, falls below the rising floor and lignifies.

**The crown envelope was raised and shortened.** z 0.86–2.74 (an ellipsoid as tall as it is wide,
starting at 29% of tree height) becomes z 1.24–2.76 — the same rounded shape, lifted onto a bole. The
low attractor ring moved with it and now sits just UNDER the crown floor, so at maturity those limbs
are bare wood fanning into the canopy, which is what exp-16 shows, rather than a second tier of
foliage hanging beside the trunk.

**And the outward push stopped pushing down.** Clouds sit on the outside of the crown volume, which
v3 implemented as a full radial vector from the crown centre — so every cloud below that centre was
pushed DOWN and out, the one direction an upside-down pear cannot afford to grow. Clamping the
vertical component to zero keeps the shell on the sides and the top and leaves the underside alone.

## 3. What ADR-0289 D1 let us delete

D1 says the track animates a tree FORMING, not a sapling maturing: frame 0 need not be a botanically
plausible seedling and the mid frames need not be plausible trees of a given age. That retires a
whole apparatus, and it is **deleted rather than kept behind a flag** — git is the archive:

- the leaf BLADE geometry, its whorl placement and its per-shoot size ramp,
- the age-dependent first flush,
- the blade-to-cloud handoff gate (`N_BLADE_FULL` / `N_BLADE_OFF`),
- the two-leaf cotyledon organ and its senescence ramp,
- the third material they needed, and three dead colour constants left over from before the cel-band
  rewrite.

**ONE mechanism now carries the canopy from the first frame to the last**, which is what v3's lever 1
claimed and only half did. The generator is **62 code lines lighter** (non-blank, non-comment) and
three lines shorter overall — the deletion is real, and the comments explaining the canopy rules grew
to nearly meet it.

## 4. The obligation the floor creates, and how it is discharged

A floor that RISES can take foliage off a limb the leader has overtopped, so `measure.py --monotone`
— written for v3's blade-to-cloud handoff — inherits a live obligation rather than a historical one.
It was **not** free:

- Applied at full strength to a whip, both shell rules take foliage off faster than the whip grows
  it. The first cut lost canopy across frames 4→5→6 and FAILED `--monotone` on the delivered pixels.
  Both rules describe a tree that already HAS a crown, so one maturity scalar now eases them in
  together: at the seedling there is no floor and every order is an outer order.
- Restricting the cloud SEATS to the mature crown looked like the obvious repair for
  clouds-beside-the-trunk and is the wrong one — it leaves a sapling, every node of which is below
  the mature crown floor, assigned to a single nearest seat, so the first nine frames render one
  lollipop. The low seats were never the defect. That reasoning is recorded at `cloud_seats`.
- `CLOUD_RISE` had to come down from 3.2 to 1.5. A branching burst puts a whole shell of nodes one
  order deeper in a single frame, and while blades covered the young frames that did not matter.

**All 19 frames are strictly increasing on both silhouette and foliage area.** The author-time proxy
in the `--no-render` plan agrees, which is what made three of those findings cheap to reach.

One measurement note worth keeping: the foliage floor is the lowest row carrying at least three
foliage pixels, not the lowest foliage pixel. Frame 14 reported an 18% floor on the strength of ONE
stray pixel while its canopy actually bottomed at 40%, and a metric a single pixel can move is a
metric that sends the next iteration after the wrong thing.

## 5. The scale-convention fork — rendered at last, and it does not dissolve

`--framing` was built in the previous increment and **nothing had ever been rendered with it**.
`framing-fork.png` is the three conventions against exp-16, every cell on the island's own plate.

**First, the premise was wrong, in three places, and is corrected.** Every previous statement of this
fork claimed exp-16 "draws each stage to fill the frame". Nobody had measured it. Measured across
exp-16's 19 frames:

| | f00 | f01 | f02 | f03 | f09 | f12 | f18 |
|---|---|---|---|---|---|---|---|
| exp-16 height, % of mature | 65 | 70 | 82 | **98** | 91 | **86** | 100 |

It reaches 91–99% at frame 03 and stays there, NON-monotonically — it shrinks from 110 px to 96 px
between f03 and f12 before returning to 112. Its convention is closer to a *constant apparent height*
from stage 3, with growth reading as width (53 → 95 px) and density. Corrected in
`register_track.py`'s emitted `knownWeakness` (the manifest is generated, so that is the source), and
here.

**The correction makes the fork BROADER, not narrower.** ADR-0289 deflated it on the grounds that its
whole force was a ~18 px opening frame. But the gap was never confined to the opening — it is the
whole middle of the track. Rendered heights, in canvas px:

| | f00 | f04 | f09 | f14 | f18 |
|---|---|---|---|---|---|
| fixed (delivered) | 16 | 30 | 66 | 91 | 121 |
| eased | 77 | 97 | 113 | 118 | 121 |
| per-stage | 119 | 119 | 120 | 120 | 121 |
| exp-16 | 73 | 105 | 102 | 108 | 112 |

`eased` tracks exp-16 closely; `per-stage` overshoots. So the fork is answerable now rather than
parked.

**But the render also supplies a reason not to take it yet, and it is the honest finding here.**
Magnifying the early frames does not flatter them — it shows how little is in them. At f04 `eased`
gives a large smooth blob with a bare leader poking out of the top, where exp-16 gives a leafy whip
with a root flare. **The fixed camera is currently hiding a mid-stage weakness rather than causing
one**, and switching conventions would surface exactly the per-stage character work ADR-0289 D1
deprioritised. Recommendation: keep `fixed`, and treat the fork as blocked on mid-stage character
rather than on taste. The owner's call either way; the picture is now on the table.

## 6. Honest assessment against exp-16

`exp16-vs-v3-vs-v4.png` is the three-way, every cell composited on the island's green plate —
`sheet.py` refuses to draw a cell on transparency, because a transparent contact sheet hid two
failures in an earlier increment.

**Closed by this increment, measurably**

- Foliage floor **16% → 45%**, against exp-16's 44%. The lowest mature cloud is now centred at 60% of
  apex height; v3 had three centred at 30%, 36% and 48%.
- The waist exists: half-width **20.5 → 4** at a quarter of tree height, against exp-16's 7.5.
- The upper crown improved as a side effect of not pushing clouds downward: 0.92–1.00 half-width
  **14.5 → 20**, against exp-16's 22.
- Anchor registration got steadier: contact-anchor spread **4.43 → 1.76 px**, frames needing a shift
  **17 → 5**, max shift **2 → 1 px**. Ground-row spread stays 3 for the unchanged reason below.

**Held, not traded away**

- Crown colour count **8**, against v3's 7 and exp-16's 12 — the cel-band result survives the canopy
  rework intact.
- Warm top highlight at **20.6%** of the crown, against exp-16's 20.4%.
- Mean crown luma 125 (v3 123, exp-16 119); crown mass 4494 px (v3 4531, exp-16 4280).

**Where it still loses**

1. **Root flare.** exp-16's buttress spans 37 px at 8% of tree height; this track's spans ~20. It is
   now the largest single difference in the profile table (base band 23 against 10) and it was
   already gap 5 in v3. Untouched here.
2. **Mid-stage character.** exp-16's f04 and f09 are leafy whips with visible roots; v4's are a ball
   on a stem. Better than v3's twig-tangle and worse than the bar. §5 shows this is also what blocks
   the scale-convention fork, which makes it the most load-bearing remaining gap rather than a
   cosmetic one.
3. **The crown is still less structural than exp-16's** — you see fewer limbs running through the
   canopy. Unchanged from v3's item 1, and the canopy floor did not address it.
4. **The crown sits slightly high and small.** Widest band 0.67–0.75 against exp-16's 0.58–0.67, and
   26 against 38.5 in the 0.42–0.50 band. Chasing that decile further would be fitting to a
   hand-drawn reference; recorded rather than tuned.

**Not verified this increment:** `on-island.png` is the **v3** track's live-lab screenshot and has
NOT been retaken — the browser pane in this session would not composite frames, so no live screenshot
was possible. The mounted assets ARE regenerated, and `chapter2-round3-tree-candidates.test.ts`
decodes the shipped PNGs independently and passes, so the lab will show v4; what is missing is a
photograph of it. The island judgement above rests on the offline plate composite instead.

## What the code owns (ADR-0280 D1, unchanged and reaffirmed by ADR-0289)

- **Topology is a strict PREFIX.** Skeleton grown once, birth iteration per node, frontier eases out
  of **zero** length. Nothing is frozen to buy per-frame connectedness.
- **Randomness is identity-keyed** (`h01` on a part's address), never a draw counter.
- **The camera is one declared scalar** — orthographic at 20°, framed **once** to the mature extent
  and byte-identical on every frame.
- **Growth pacing is authored and measured** — 19 frames at equal silhouette-change arc length,
  computed author-time from an analytic projection of the skeleton.
- **Determinism:** CPU Cycles, `seed = 20260801`, fixed samples, pinned 5.2.0 LTS, numpy version
  recorded.

## Registered and mounted

`register_track.py` re-measures every delivered frame under the **lab's** one applied anchor rule,
normalises x, and emits `packages/app-surface/src/assets/code-blender/`. The track is the lab's fifth
candidate: `?organicGrowth=r3-lab#/tree`, button **code-blender**. The hand-entered TypeScript numbers
in `chapter2-round3-tree-candidates.ts` were updated from the emitted block and are re-derived from
the shipped pixels by the suite.

`groundRowSpreadPx` stays **3** and the reason is unchanged: the camera is fixed and the trunk base is
pinned at world z=0, but secondary growth thickens the trunk, so the near edge of its own footprint
descends by `r·sin 20°` as it fattens. Buying a constant row would mean lifting the frame as the tree
matures — the base drift D1 forbids.

**Not claimed.** No owner LOOK, no hero-tree selection, no technique adoption, no clean-route switch,
no arc closure. This is a ceiling demonstration under ADR-0280 D4, where an honest "not good enough"
is an accepted outcome.
