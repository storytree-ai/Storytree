# Blender spike — ADR-0280 D2a, first pass

**Date:** 2026-08-01 · **Blender:** 5.2.0 LTS, headless, CPU Cycles · **Cost:** $0

The first exercise of ADR-0280 D2a. Owner-directed after another session called out that Blender is
free and programmatically accessible: *"i want to see what we can achieve with it."*

`blender-vs-exp16.png` is the comparison — exp-16 (the owner's favourite PixelLab track) on top, this
spike through the raster back half in the middle, and the **same render without the back half** at the
bottom.

## Reproduce

```
blender --background --python blender_tree.py -- --out raw --frames 8 --res 384 --samples 56
python pixelise.py raw frames 128
```

`blender_tree.py` needs Blender's bundled Python (it imports `bpy`); `pixelise.py` needs the system
Python with numpy + Pillow. `bpy` from PyPI is **not** a route on this machine — no wheel exists for
Python 3.14.5, which is why the headless-application form is used.

## What it does

**Code owns skeleton, camera and growth — D1 unchanged.** Blender only renders. No `.blend` is a
source of truth; `blender_tree.py` is. Specifically:

- **Topology is a strict prefix.** The skeleton is grown once and every segment records the depth it
  was born at. A frame at age *a* draws the segments with `depth <= a`, and the frontier order eases
  out of zero length rather than appearing. Topology cannot mutate between frames and nothing is
  frozen to achieve it.
- **Randomness is identity-keyed** (`h01(addr, ...)`), never a draw counter — so adding a branch
  cannot reshuffle the tree into a different tree.
- **Girth follows the pipe model**, `r_parent^e = sum(r_child^e)` at `e = 2.3`.
- **Foliage rides the growth frontier**, at branch **ends** only. Leaf mass on a young twig is handed
  off to a larger lobe further out as the twig lignifies, and lobe radius is monotone in age so no
  leaf mass ever shrinks.
- **The camera is orthographic at 20°** — ADR-0280 D1's calibrated projection, the same number
  `code-your-own-call` declares. It is framed **once** to the mature extent and held identical on
  every frame, so the tree grows inside a fixed frame and its base stays planted.
- **Determinism per D2a:** CPU Cycles, `seed = 20260801`, fixed sample count, pinned LTS. No EEVEE,
  no GPU.

## The raster back half is load-bearing, and the bottom row proves it

`pixelise.py` box-downsamples the supersampled render, thresholds alpha to a hard silhouette, snaps
every colour to exp-16's committed 32-colour track palette, and applies a **material-tinted** rim —
darkened from the local colour, deeper on down-facing edges, never a uniform black key-line.

Compare the middle and bottom rows: the same geometry reads as a smooth generic 3D render without it
and as pixel art with it. **A Blender frame shipped raw is the ADR-0145 failure reproduced**, which is
why D2a makes this step mandatory rather than stylistic.

## Honest assessment

**Where it already beats the PixelLab tracks**

- **Camera.** Correct by construction. Round 3's eight tracks were all front elevation against a low
  top-down plate, the owner called that a blocker, and an 11-generation probe proved PixelLab will not
  obey a camera word. Here it is one number.
- **Continuity.** No topology snap anywhere, no frame where the tree becomes a different tree, and the
  base does not drift — without freezing anything.
- **Form.** Real ambient occlusion and real shading give the crown volume that a 2D track has to fake.
- **Cost.** $0 per render, unlimited iterations, deterministic re-runs.

**Where exp-16 is still better**

- **The opening.** exp-16 starts on a true two-leaf cotyledon seedling. This starts on a bare stump —
  the same "reads as a stump, not a seedling" complaint round 3 made of three other tracks.
- **The base.** exp-16 has a buttressed root flare. This trunk meets the ground abruptly, with no root
  spread and no contact shading or planting cue.
- **Leaf character.** exp-16 draws individual blades at mid stages; this has lobes throughout, which
  is less charming at stages 2–3.
- **Crown silhouette.** The mature crown reads flat-topped and slightly umbrella/acacia-like rather
  than the rounded canopy exp-16 ends on.

**Not claimed.** Nothing here is owner-attested, nothing has been composited on the real SVG island,
no growth track has been registered, and this is 8 frames rather than a delivered 19-frame track. It
is a first pass built in one sitting to answer "what can we achieve with it", not a candidate.
