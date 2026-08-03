# Blender hero tree v5 — the tree gets a root system, and the whip gets somewhere to put leaves

**Date:** 2026-08-03 · **Blender:** 5.2.0 LTS, headless, CPU Cycles · **Cost:** $0 · **Vendor calls:** 0

The fifth exercise of [ADR-0280](../../../decisions/0280-chapter-2-organic-art-is-code-generated-code-owns-skeleton-c.md)
D2a, aimed at the two gaps v4's own §6 named and did not claim: **root flare** and **mid-stage
character**. [ADR-0289](../../../decisions/0289-the-chapter-2-growth-track-animates-a-tree-forming-not-a-sap.md)
D2's two owner-named defects were closed by v4 and are not revisited; D1's licence — the track
animates a tree FORMING, so no frame owes anyone a botanically plausible age — is what makes this
increment's root work legal, and it is spent again rather than widened.

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
`render-meta.json` records the numpy version alongside the seed. `--only 4,9,18` renders a subset for
the tight loop; the retiming, camera and frame indices are unchanged, so a subset frame is identical
to that frame of a full run.

The `--no-render` plan prints a **canopy-area proxy per frame and flags any frame that shrinks**,
which is the ten-second version of the ten-minute `--monotone` check. Every structural finding below
was reached on it before a single frame was rendered.

**Two exploratory flags, both defaulting to the delivered track.**

- `--framing fixed | per-stage | eased` — the scale-convention fork, re-rendered against this
  increment's frames (§5).
- `--skeleton space-colonisation | sapling` (`--sap-preset <species>`) — who grows the skeleton, from
  the Blender-ecosystem spike:
  [`../../chapter2-blender-ecosystem-spike-2026-08-02/`](../../chapter2-blender-ecosystem-spike-2026-08-02/README.md).
  Settled by ADR-0289 D3 in favour of ours; retained so the question stays answered rather than open.

## 1. The two gaps, measured

`measure.py --shape` states the silhouette as half-width by height decile, base to apex, plus the
height of the lowest row carrying canopy. The mature frame:

| height band | 0.00-0.08 | 0.08-0.17 | 0.17-0.25 | 0.25-0.33 | 0.42-0.50 | 0.58-0.67 | 0.92-1.00 | widest band | foliage floor |
|---|---|---|---|---|---|---|---|---|---|
| exp-16 (the bar) | **23** | 18 | 10 | 8 | 38 | **47** | 22 | 0.58-0.67 | 44% |
| v4 (landed 08-03) | **10** | 6 | 5 | 4 | 26 | 38 | 20 | 0.67-0.75 | 45% |
| **v5 (this)** | **22** | 15 | 6 | 6 | 29 | 41 | 34 | **0.58-0.67** | 43% |

and the base rows, as a width in delivered pixels at a height expressed as a fraction of each tree's
own height — the buttress read on its own:

| | 2% | 5% | 8% | 12% | | mid-track (f09) 2% | 5% | 8% |
|---|---|---|---|---|---|---|---|---|
| exp-16 | 27 | **46** | 37 | 25 | | 51 | 71 | 46 |
| v4 | 17 | **14** | 11 | 10 | | 7 | 6 | 4 |
| **v5** | 33 | **40** | 30 | 20 | | 20 | 23 | 18 |

## 2. Root flare — three causes, only one of them a taste knob

The v4 note called this "levers `N_ROOT` / `FLARE_AMT` / `FLARE_H`", i.e. a tuning job. Two thirds of
it turned out not to be.

**The flare never reached full strength, and no number in the file said so.** `t_root` normalised the
live trunk radius against a hard-coded 0.175. This skeleton's mature trunk is 0.1173, so the *mature*
frame was drawn at 0.72 of its own authored flare, and the constant that decided it had no
relationship to the tree it was scaling. It is now normalised against the **measured mature trunk
radius**, taken once from the mature frame exactly as `R_SCALE` already is (`R0_MATURE`), so full
growth means full flare by construction. A skeleton with a different branch density inherits the
right buttress instead of a wrong one.

**The flare was too short to be a buttress.** exp-16 is still 37 px wide at 8% of its height; an
`exp(-z/0.12)` decay is at 15% of its peak by then, so ours was a fillet at the soil with whiskers
rather than ridges climbing a bole. `FLARE_H` 0.12 → 0.22, and the spur taper — which ran to 4.5% of
its base radius, putting the outer half of every spur under a pixel — now keeps a tenth of its girth
out to the tip.

**And the spurs were simply too short.** `reach` and `rise` roughly doubled, `N_ROOT` 7 → 9.

## 3. Roots arrive with the tree, and the fraction is the whole idea

Keyed on girth alone the buttress was *absent* for the first third of the track (`t_root` = 0.06 at
frame 4), while exp-16 carries a root fan 35-45% of its own height wide from frame ZERO. So the base
is now **two** scalars: GIRTH still follows the trunk, and REACH follows the tree.

The first attempt at "follows the tree" ramped the reach toward its mature *world* length, and it is
worth recording because it looked right in the constants and was obviously wrong on the plate: a 32 px
seedling stood on a 28 px span of one-pixel spokes — a rake, not a root. The reach is a **fraction of
the live tree's own height**, which is the same move `CANOPY_FLOOR` makes at the other end of the tree
and for the same reason: one rule then serves a whip and a mature bole without a second constant.

A spur thinner than a delivered pixel is not drawn thin, it is drawn absent, so the girth also carries
an absolute floor of one canvas pixel — stated in the units the floor is actually about. It binds only
while the trunk is a seedling's; at maturity `base_r * thick` is five times it.

## 4. Mid-stage character — the gap was in the skeleton, not the canopy

**This is the load-bearing one, and it had been diagnosed in the wrong organ for two increments.**
v4's §6 called it "a ball on a stem" and v3's before it called it a twig-tangle; both looked at the
canopy. The canopy was not the problem.

Measured: the lowest thing a v4 tree could branch to sat at z=0.80, and the bole runs to 0.90. **Every
branch in the whole track was born within a tenth of the leader's own tip.** At frame 6 that is a bare
stem carrying one tuft, and no cloud rule can put foliage on a stem that has no shoots. exp-16's f04
carries side shoots from a fifth of its height, which is what a canopy needs somewhere to sit.

So the fix is a **third attractor ring**, below the bole break (`N_MID` / `MID_R` / `MID_Z`). It is the
same hedge risk the existing low ring's comment warns about, and the answer is the machinery v4 built:
the canopy floor strips foliage below 40% of the live top, so these lignify into bare stubs on the bole
exactly as the leader overtops them. They are kept SHORT because the other thing they touch is the
WAIST — ADR-0289 D2's second defect — and the profile table above says how much room there was: exp-16
is 10 and 8 in the two deciles they land in against v4's 5 and 4, and v5 spends 1 and 2 of that.

Two canopy changes ride along, both of which only mattered once there was a whip to sit on:

- **Seats.** 22 seats farthest-point-sampled from the whole skeleton are 22 seats spent on the mature
  crown, because that is where 340 of the 352 nodes are — the nine nodes alive at frame 4 fell into
  TWO. `N_CLOUD_YOUNG` seats are now sampled from the juvenile prefix first. This is the OPPOSITE of
  the move recorded at `cloud_seats` as a trap: that one *withdrew* seats from the young tree and
  rendered nine lollipops; this one adds them, and the canopy floor that makes a low seat harmless at
  maturity makes these harmless too.
- **Size.** `CLOUD_BASE` and `CLOUD_MIN` are world radii tuned for a mature crown; on a 0.68-unit
  seedling one of them is a ball a quarter of the tree's height across. Both now scale by the same
  maturity scalar that eases the shell rules in. **Measured down from 1.0, not up from 0**: the first
  cut used 0.34, the mid-track tufts fell under a delivered pixel each, and the whip read as bare —
  which is the opposite defect, not a fix.

## 5. The scale-convention fork — no longer blocked

`framing-fork.png` is the three conventions against exp-16, re-rendered on this increment's frames,
every cell on the island's own plate.

v4 rendered this fork for the first time and recommended keeping `fixed`, with a specific reason:
magnifying the early frames did not flatter them, because at f04 `eased` gave "a large smooth blob
with a bare leader poking out of the top" where exp-16 gave a leafy whip with a root flare. That
reason has been **discharged, not argued away**. Under `eased`, v5's f04 and f09 are whips carrying
three or four tufts up the stem and standing on a visible root fan.

**So the fork is a live owner choice now, and the recommendation changes to: no recommendation.**
`eased` tracks exp-16's apparent-height convention closely and `per-stage` overshoots it (measured in
the previous increment and unchanged — the camera rule is untouched here). What blocked it was mid-
stage character and that is what moved. The premise correction v4 made stands: exp-16 does NOT draw
each stage to fill the frame, it holds 91-99% of its mature height from f03 and is non-monotone, so
the divergence is the whole middle of the track rather than one opening frame.

**One defect the fork would still surface, and it is the opening frame.** At f00 the canopy sits below
a bare leader tip, because a frontier node needs `CLOUD_RISE` iterations of age before it carries
weight. Under the delivered `fixed` camera that frame is 16 px tall and it is invisible; under `eased`
it is 77 px and it is a stick with a bobble. Recorded rather than tuned — it is the opening frame of a
convention nobody has chosen yet.

## 6. Honest assessment against exp-16

`exp16-vs-v4-vs-v5.png` is the three-way, every cell composited on the island's green plate —
`sheet.py` refuses to draw a cell on transparency, because a transparent contact sheet hid two
failures in an earlier increment.

**Closed by this increment, measurably**

- **Root flare.** Base band half-width **10 → 22**, against exp-16's 23; the 5%-of-height row spans
  **14 → 40 px** against exp-16's 46. This was the largest single difference in the profile table and
  it is now the smallest of the ones left.
- **A root system in the mid frames.** At f09 the base row spans **6 → 23 px**. exp-16's is 71, but
  its frames are drawn at near-constant apparent height, so that is 70% of its own height against our
  33% — and our fraction is deliberately the same at every stage, which is a convention, not a miss.
- **Mid-stage character.** At f09 the foliage floor drops **45% → 32%** (exp-16 1%): the canopy now
  runs down the stem instead of sitting on top of it. Under `eased`, f04 and f09 read as leafy whips.
- **Crown position.** Widest band **0.67-0.75 → 0.58-0.67**, which is exp-16's — v4's §6 item 4 said
  the crown sat slightly high and declined to chase it; the mid ring moved it without being asked to.
- **The waist survived.** 6 and 6 against exp-16's 10 and 8, where v4 was 5 and 4. Still a narrower
  stem than the bar, so ADR-0289 D2's second defect stays closed.

**Held, not traded away**

- Crown colour count **8**, unchanged, against exp-16's 12 — the cel-band result survives a skeleton
  change, a seat change and a size change.
- All 19 frames strictly increasing on both silhouette and foliage area (`measure.py --monotone`).
- Mean crown luma 125, crown mass 4707 px (v4 4494, exp-16 4280).

**Where it still loses**

1. **Registration got less steady, and this is the increment's real cost.** Contact-anchor spread
   **1.76 → 3.02 px**, frames needing a shift **5 → 13**, max shift **1 → 2 px**, ground-row spread
   **3 → 4**. The applied rule reads alpha-weighted x across the bottom three rows, and those rows are
   now a nine-spur root fan that is not left-right symmetric instead of a trunk footprint that nearly
   was. It is the price of the thing §2 bought, it is paid at author time only, and it is still less
   than half exp-15's 10.61. Reducing the spurs' angular jitter would buy some of it back and would be
   fitting the generator to the measurement; not done.
2. **The warm top highlight thinned.** (173,167,114) covers **17.6%** of the crown against v4's 20.6%
   and exp-16's 20.4%. The crown grew 5% and the highlight did not grow with it. Not a fragmentation
   failure — the colour count is unchanged.
3. **The crown is still less structural than exp-16's**, and slightly more so than before: crown green
   fraction **65% → 70%** against exp-16's 51%. You see fewer limbs running through our canopy because
   there is more canopy. Unchanged in kind from v3's item 1 and still unaddressed.
4. **The buttress reads as a splayed fan where exp-16's reads as ridges.** The spans now agree; the
   drawing does not. exp-16 separates its spurs with dark outline and leaves plate between them, and
   ours merge into a skirt near the axis.
5. **Byte cost.** The track's encoded size is **24,478 → 30,226** bytes (+23%) for the extra root and
   canopy pixels. The registry ceilings are the measured actuals, so this is restated, not absorbed.

**Not verified this increment, with the blocker now identified:** `on-island.png` is still the **v3**
track's live-lab screenshot. The lab was reached and `code-blender` selected in it, but **every
screenshot fails with "the Browser pane is not displayed, so the page is not compositing frames"** —
the blocker is the pane, not the lab or the assets, and it is not something the session can fix from
inside. The mounted assets ARE regenerated and `chapter2-round3-tree-candidates.test.ts` decodes the
shipped PNGs independently and passes, so the lab will show v5; what is missing is a photograph of it.
The island judgement above rests on the offline plate composite, whose plate is sampled from the lab's
own render.

## What the code owns (ADR-0280 D1, unchanged and reaffirmed by ADR-0289)

- **Topology is a strict PREFIX.** Skeleton grown once, birth iteration per node, frontier eases out
  of **zero** length. Nothing is frozen to buy per-frame connectedness — which is why the mid ring's
  shoots are permanent low stubs on the mature bole rather than something the track drops.
- **Randomness is identity-keyed** (`h01` on a part's address), never a draw counter.
- **The camera is one declared scalar** — orthographic at 20°, framed **once** to the mature extent
  and byte-identical on every frame. The frame extent now includes the buttress, so a per-stage camera
  cannot crop the organ it is being pointed at.
- **Growth pacing is authored and measured** — 19 frames at equal silhouette-change arc length,
  computed author-time from an analytic projection of the skeleton. That projection draws wood and
  canopy and not roots, deliberately: the roots are keyed to the same growth the pacing measures, so
  they carry no independent pacing information.
- **Determinism:** CPU Cycles, `seed = 20260801`, fixed samples, pinned 5.2.0 LTS, numpy version
  recorded.

## Registered and mounted

`register_track.py` re-measures every delivered frame under the **lab's** one applied anchor rule,
normalises x, and emits `packages/app-surface/src/assets/code-blender/`. The track is the lab's fifth
candidate: `?organicGrowth=r3-lab#/tree`, button **code-blender**. The hand-entered TypeScript numbers
in `chapter2-round3-tree-candidates.ts` were updated from the emitted block and are re-derived from
the shipped pixels by the suite.

`groundRowSpreadPx` rises to **4** and the reason extends the existing one rather than replacing it:
the camera is fixed and the trunk base is pinned at world z=0, but secondary growth thickens the
trunk AND the root spurs, so the near edge of the base footprint descends by `r·sin 20°` as it
fattens — over a wider footprint than before. Buying a constant row would mean lifting the frame as
the tree matures, the base drift D1 forbids.

**Not claimed.** No owner LOOK, no hero-tree selection, no technique adoption, no clean-route switch,
no arc closure. This is a ceiling demonstration under ADR-0280 D4, where an honest "not good enough"
is an accepted outcome.
