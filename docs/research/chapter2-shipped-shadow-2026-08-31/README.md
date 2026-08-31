# The shadow at forest scale — three remedies, costed

**2026-08-31 · `the-forest-shadow-field-goes-coarse-at-scale` on `adopt-the-land-into-the-shipped-map-arc`**

Instrument: `packages/forest-world-r3f/harness/shipped-shadow.html` ·
`pnpm --filter @storytree/forest-world-r3f measure-shipped-shadow`
Hardware: **NVIDIA GeForce RTX 2060** (the Mint box), ANGLE/OpenGL 4.5, `MAX_TEXTURE_SIZE` 32768.
2560 × 1600 buffer, 30 renders per timed sample, 5 samples per cell, **two independent runs**
(`shadow-remedies-run1.json`, `shadow-remedies-run2.json`).

---

## The defect

`occlusionGres` is `min(SHADOW_GRES, SHADOW_TEXTURE_MAX / widestSpan)`, and the span it divides by
is the whole GROUND's. So one island (234 ground units) gets the authored **3.000** samples per
ground unit and a real thirty-five-island forest (~3,500) gets **0.585** — 5.1× coarser in each
axis, against parcels whose mean diameter is 16.57.

**The increment's own premise held in DIRECTION and was overstated in one half, and the correction
is worth having.** It said the pool "goes from a soft round shadow to a shrunken, jagged blob". The
shrinking is small: at forest scale the clamped pool covers **94.5%** of the authored-resolution
pool's area. What actually moves is the SHAPE — **15.3% of the shadow's own pixels** land somewhere
else. Look at `shadow-forest-20px-clamped.png` against `shadow-forest-20px-atlas.png`: same island,
same ladder, same relief, same grain, same camera, and one shadow is a lumpy polygon while the other
is a round pool with a soft edge and a tail.

⚠ **Read those two numbers against the SHADOW, never against the frame.** Whole-frame, the same
change is **0.309%** of the pixels — a figure that reads as "nothing happened" beside two obviously
different pictures. The denominator this page uses is the shadow's own footprint, measured by
differencing each arm against `none`: the same ground with no occlusion field at all, which is what
the map drew until 2026-08-30. An unshadowed material's ramp is the lit ladder and a shadowed one
REMAPS the lit rungs into a longer ladder, so a lit fragment delivers the same colour under both —
every differing pixel is a pixel the shadow darkened and no other.

## What each remedy allocates

| arm | samples/unit | textures | texture MB | widest edge | ground meshes | vertex MB | **total MB** |
|---|---|---|---|---|---|---|---|
| `clamped` (before) | 0.585 | 1 | 2.61 | 2048 | 1 | 0.00 | **2.61** |
| `raised` — **A** | 3.000 | 1 | 68.46 | 10498 | 1 | 0.00 | **68.46** (26.3×) |
| `per-island` — **B** | 3.000 | 35 | 3.60 | 714 | 35 | 0.00 | **3.60** (1.38×) |
| `atlas` — **C** | 3.000 | 1 | 3.60 | 3570 | 1 | 1.31 | **4.91** (1.89×) |

⚠ **AN EXPECTATION WAS REFUTED HERE, AND A TEST CAUGHT IT BEFORE THE PAGE DID.** "The atlas leaves
out the sea, so it must cost less than the map already spends" is FALSE. The map already spends
little BECAUSE it is coarse. The honest comparison is at EQUAL resolution, and there the atlas is
**19× cheaper than raising the cap**; against today's clamped field it is 1.89× the memory for
5.13× the resolution.

**A is out, and on two independent grounds.** 68 MB of a visitor's memory is exactly what
`SHADOW_TEXTURE_MAX` was written to refuse, on a field that is occluded on 0.157% of its samples.
And it needs a **10,498-texel edge** where WebGL 2 guarantees 2048 — so on any device below the
16384 class the arm is not expensive, it is unavailable.

**C degrades where A cannot.** Given only the guaranteed 2048-texel budget the packing goes coarser
rather than refusing, and lands at **2.850** samples per ground unit — 4.87× what the rect form
delivers at any size (`shadow-atlas.test.ts` holds this).

## What the renderer actually submits

⚠⚠ **THIS PAGE FOUND SOMETHING THE INCREMENT DID NOT ANTICIPATE, AND IT INVERTS HALF OF B's CASE.**
One mesh has ONE bounding sphere, so a forest built as a single buffer is submitted whole at every
zoom — all thirty-five islands, including the thirty-four off screen. Thirty-five meshes have
thirty-five bounding spheres, so three **frustum-culls** them:

| zoom | `clamped` / `raised` / `atlas` | `per-island` |
|---|---|---|
| whole forest fitted | 1 draw · 57,400 tris | **35 draws** · 57,400 tris |
| 2 px/unit | 1 draw · 57,400 tris | 9 draws · 14,760 tris |
| 8 px/unit | 1 draw · 57,400 tris | **1 draw · 1,640 tris** |
| 20 px/unit | 1 draw · 57,400 tris | **1 draw · 1,640 tris** |

The increment parked B as the arm that "gives up the one-draw ground". That is true only where the
whole forest is on screen. Everywhere else B submits *fewer* draws and 35× fewer triangles than the
one-mesh arms. The trade is not one-directional and the increment could not have known that.

## Frame cost — and which rows may be quoted

⚠⚠ **THE TWO RUNS DISAGREE AT 8 px/unit AND THAT ROW IS NOT QUOTABLE.** `clamped` came back
0.607 ms and 0.230 ms on the same tree, same box, minutes apart — a factor of 2.6, where every other
row agrees to three decimals. `atlas` at 2 px/unit is the same shape (0.256 vs 0.705). Taking two
runs is what exposes it; a single run would have been reported as a finding. The stable rows are
below and they are the ones this reads against.

**The whole forest fitted to the screen — the frame where B pays its 35 draws, and the reading that
settles the comparison. Both runs, median GPU ms per render:**

| arm | run 1 | run 2 | vs `clamped` | of a 60 Hz frame |
|---|---|---|---|---|
| `clamped` | 0.1934 | 0.1941 | — | 1.16% |
| `raised` | 0.2820 | 0.2820 | +46% | 1.69% |
| `atlas` | 0.3277 | 0.3277 | **+69%** | **1.97%** |
| `per-island` | 0.5414 | 0.4932 | +180% / +154% | 3.25% / 2.96% |

**Nothing here is unaffordable.** The widest gap is 0.35 ms — about 2% of a 60 Hz frame. So frame
cost does not disqualify any arm; it ranks them, and the ranking at the overview is
`clamped < raised < atlas < per-island`.

**Where the atlas's +0.134 ms goes.** At the fitted zoom the ground covers little of the screen, so
the frame is vertex-bound rather than fragment-bound — and the atlas is the only arm that adds
per-vertex data (a vec2 tile corner on 172,200 vertices). The fragment stage is *cheaper*, not
dearer: two multiply-adds against the rect form's two subtract-multiplies. A follow-up could halve
that attribute by carrying a per-island INDEX and looking the corner up, and this page is what would
measure whether it is worth it.

## The control that says the change is narrow

**On ONE island every arm is byte-identical to `clamped`** — 0.000% of the frame at every zoom, in
both runs. A single island was already at the authored resolution; a remedy that repainted it would
be changing the look on the very surface everything committed on this arc was measured against.
`shadow-one-20px-clamped.png` and `shadow-one-20px-atlas.png` are that claim as two files.

## The decision

**The fork as it was parked has dissolved.** It was framed as a memory-against-quality trade —
"spend the 36 MB the cap was written to protect, or give up the one-draw ground". Neither is
necessary: option C delivers the authored resolution for 1.89× a memory figure that was already
trivial, keeps the one-draw ground, and costs 2% of a 60 Hz frame at the overview. There was no
owner-level trade left to put, so none was put.

**Adopted in the same landing.** `ForestWorldCanvas.tsx` now builds `buildAtlasOcclusion` —
unconditionally and with no flag, like the relief, the ladder, the grain and the shadow before it
(the arc's end-state item 6). `clamped` survives on the instrument as a picture of the past, for the
reason the blooms page keeps its own `scattered` arm: "we removed a defect" is not something a
reader can check without seeing the defect.

**What was NOT adopted, and it is a real option rather than a rejected one.** B's frustum culling is
a genuine win at every zoom a reader actually uses, and it is orthogonal to how the field is
allocated: a ground split into one mesh per island, all of them sharing ONE atlas material and ONE
texture, would get the culling without the 35 materials. Nobody has costed it and this page is the
instrument that would.

## The files

| file | what |
|---|---|
| `shadow-forest-20px-{none,clamped,raised,per-island,atlas}.png` | **the comparison.** 20 delivered px per ground unit — a contact pool is ~480 px wide here, which is the only zoom at which this can be looked at honestly |
| `shadow-forest-8px-{none,clamped,atlas}.png` | the arc's own zoom |
| `shadow-forest-fitpx-{clamped,atlas}.png` | the whole forest fitted to a screen — ⚠ CONTEXT ONLY: a pool is 13.7 px here and the arms are near-identical **by construction** |
| `shadow-one-20px-{clamped,atlas}.png` | the control — one island, unmoved |
| `shadow-remedies-run{1,2}.json` | every reading from both runs |

Reproduce (needs a real GPU):

```bash
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5296 --strictPort
```

then, against that port:

```bash
DISPLAY=:0 ST_SHADOW_URL=http://localhost:5296/shipped-shadow.html pnpm --filter @storytree/forest-world-r3f measure-shipped-shadow
```
