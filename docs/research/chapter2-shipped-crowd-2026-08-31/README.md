# The shipped ground at forest scale — the adopted ladder, costed on a crowd

**2026-08-31 · `cost-the-adopted-ladder-on-a-crowd` on `adopt-the-land-into-the-shipped-map-arc`
· RTX 2060, two runs, controls re-run · reproduce with
`pnpm --filter @storytree/forest-world-r3f measure-shipped-crowd`**

---

## 0. The short version

**The increment's premise was false, and correcting it is the result.** It was parked believing the
forest map draws many islands, *each its own draw call*, and concluded — soundly, given that — that
the adopted nine-rung ladder's measured **per-draw** cost would multiply across a real map.

It does not multiply, because there is only ever **one draw**. `ForestWorldCanvas` mounts exactly
one `<CellGround>` over the whole descriptor stream; a territory *is* an island; so the entire
forest's ground is one merged buffer wearing one material. The ramp uniform uploads **once per
frame**, not once per island.

**What the whole 35-island forest's ground actually costs on the adopted ladder:**

| zoom | measured | share of a 60 Hz frame |
|---|---|---|
| 2 px/unit (the overview a laptop opens on) | 0.0838–0.0869 ms | **0.50–0.52%** |
| 8 px/unit (the zoomed read) | 0.1256–0.1260 ms | **0.75–0.76%** |

**And what it would have cost had the premise held** — the per-island figure times 35 islands,
computed by the driver rather than written here:

| zoom | feared | measured | overstated by |
|---|---|---|---|
| 2 px/unit | 2.00–2.11 ms (12.0–12.6% of a frame) | 0.084–0.087 ms | **23.1–25.1x** |
| 8 px/unit | 4.12 ms (24.7% of a frame) | 0.126 ms | **32.7–32.8x** |

**A second finding fell out, and it is the one worth acting on.** The occlusion field's resolution
is clamped by `SHADOW_TEXTURE_MAX`, a budget written for a forest nobody had drawn yet. This is the
first thing to draw one. On a single island the field is sampled at **3.000 samples per ground
unit**; on the 35-island forest it drops to **0.585** — **5.1x coarser** — and the contact pool
under a story tree visibly shrinks and goes ragged. See §4; it is a `look` regression at forest
scale, not a cost one.

---

## 1. What was measured, and how it is controlled

Three scenes on **one buffer and one camera** — a 2560x1600 laptop screen, the shipped view
direction read out of `frameWorld`, the forest re-centred so all three frame the **same island** at
the origin. Two arms, differing in the shade ladder and in nothing else.

| scene | islands | parcels | triangles | ramp rows | what it isolates |
|---|---|---|---|---|---|
| `one` | 1 | 164 | 1,640 | 1 | the island every committed figure on this arc was taken on |
| `forest-mono` | 35 | 5,740 | 57,400 | 1 | **the extra geometry alone** |
| `forest` | 35 | 5,740 | 57,400 | 6 | **plus the six-status branch spread** |

| arm | ladder |
|---|---|
| `shadow` | `LEGACY_SHADE_LEVELS` — four rungs, what the map wore until 2026-08-31 |
| `dense` | `SHADE_LEVELS` — nine rungs, what it wears now |

Both arms are reached through the **existing `litLadderOf`** in `shipped-land-scene.ts`, never a
local copy, so a crowd figure and an island figure cannot be about two different ladders.

⚠ **`forest-mono` is not a third art option.** It is `forest` with every island's status set to the
one the single-island evidence was taken on. `shipped-crowd-scene.test.ts` asserts the two crowds'
parcels stand in **byte-identical places** — equal triangle counts alone would also be satisfied by
two different forests of the same size. Without that control, a crowd figure coming in high could
not be attributed to the geometry or to the branch spread, and the ladder would have been blamed
for whichever the reader expected.

**Why the buffer is a screen rather than the island's own bounds.** On the one-island pages the
buffer is fitted to the island, so "2 px per ground unit" is a property of the picture; a
3,500-unit forest fitted that way would need a 27,000 px buffer. Here the screen is fixed and the
zoom decides how much forest lands in it — so **neither timed zoom holds the whole forest**, and
that is the honest question: *what does the rest of the forest cost me while I am looking at one
island of it?* At 2 px/unit the frame holds 1,280 x 800 ground units; at 8 px/unit, 320 x 200.

⚠ **This also means the two zooms are not comparable to the committed one-island figures**
(`chapter2-shipped-adopted-ladder-2026-08-31` §3a, which reported 6.8x at the overview). Those were
taken on a buffer fitted to the island, where land is most of the frame; here land is 0.63% of the
frame at 2 px/unit. The **within-this-page** comparisons are the ones that hold.

---

## 2. The numbers, both runs

Median GPU ms per render, 7 repeats of a 300-render batch, interleaved. `draws` was **1 in every
one of the 12 configurations, in both runs**, and the driver refuses the run if it is ever not.

| zoom | scene | arm | run 1 ms | run 2 ms | delta | % of 60 Hz |
|---|---|---|---|---|---|---|
| 2 | one | shadow | 0.0148 | 0.0149 | +0.4% | 0.09% |
| 2 | one | dense | 0.0572 | 0.0602 | +5.2% | 0.34% |
| 2 | forest-mono | shadow | 0.0557 | 0.0560 | +0.7% | 0.33% |
| 2 | forest-mono | dense | 0.0744 | 0.0747 | +0.3% | 0.45% |
| 2 | forest | shadow | 0.0557 | 0.0561 | +0.7% | 0.33% |
| 2 | forest | dense | 0.0869 | 0.0838 | −3.5% | 0.52% |
| 8 | one | shadow | 0.1078 | 0.1079 | +0.1% | 0.65% |
| 8 | one | dense | 0.1177 | 0.1177 | +0.0% | 0.71% |
| 8 | forest-mono | shadow | 0.1119 | 0.1122 | +0.3% | 0.67% |
| 8 | forest-mono | dense | 0.1211 | 0.1214 | +0.3% | 0.73% |
| 8 | forest | shadow | 0.1119 | 0.1122 | +0.3% | 0.67% |
| 8 | forest | dense | 0.1260 | 0.1256 | −0.4% | 0.76% |

**Every row reproduces within 5.2%, ten of twelve within 0.7%.** The two rows that moved most
(`2/one/dense` +5.2%, `2/forest/dense` −3.5%) are the two smallest absolute figures on the page,
where a few hundredths of a millisecond of run-to-run noise is a large percentage of a very small
number. Both runs' raw readings are committed as `crowd-readings-run1.json` /
`crowd-readings-run2.json`.

### What the crowd axis costs, on the adopted ladder

| zoom | geometry (`one`→`forest-mono`) | status spread (`forest-mono`→`forest`) | whole forest (`one`→`forest`) |
|---|---|---|---|
| 2 px/unit | 1.30x / 1.24x | 1.17x / 1.12x | 1.52x / 1.39x |
| 8 px/unit | 1.03x / 1.03x | 1.04x / 1.03x | 1.07x / 1.07x |

**The status spread costs essentially nothing** — 1.03x to 1.17x, at or inside the run-to-run
noise, and the 8 px rows are 1.03–1.04x. That refutes the one mechanism by which the ladder *could*
have cost more per pixel on a bigger map: the material selects its colour through a chain of
`if (idx == n)` comparisons, and a frame carrying six ramp rows makes those branches diverge within
a warp where an all-`healthy` island's never did. It is measurable and it is not a cost.

**The geometry costs 1.24–1.30x at the overview and 1.03x zoomed in**, on 35x the triangles. The
asymmetry is the frame: at 8 px/unit the extra 55,760 triangles are almost all off screen, so they
cost their vertex transform and nothing else.

### What the ladder costs, by scene

| zoom | `one` | `forest-mono` | `forest` |
|---|---|---|---|
| 2 px/unit | 3.87x / 4.05x | 1.34x / 1.33x | 1.56x / 1.50x |
| 8 px/unit | 1.09x / 1.09x | 1.08x / 1.08x | 1.13x / 1.12x |

⚠ **Read the 3.87–4.05x as the ratio it is, not as a cost.** It is 0.0572 ms against 0.0148 —
0.34% of a frame against 0.09%. The nine-rung ladder carries a fixed per-frame cost (a ramp of 54
`vec3` where four rungs carried 24, and a longer selection chain) that a nearly-empty frame has
almost nothing to amortise it against: at 2 px/unit a single island is **0.63% of the screen**. Put
a real forest in the same frame and the ratio falls to 1.50–1.56x; open the zoomed read and it is
1.09x. **The ratio is largest exactly where the absolute number is smallest**, which is the shape a
fixed cost always makes.

---

## 3. The pictures

- `crowd-fit-{dense,shadow}.png` — the whole 35-island forest fitted to the screen (0.573 px/unit).
  The overview, never timed: `fit` delivers a different px/unit per scene, so a timing taken at it
  would compare three different frames and call the difference the ladder's.
- `crowd-{one,forest-mono,forest}-{2,8}px-{dense,shadow}.png` — every timed configuration.

Pictures are **byte-identical between the two runs** (md5-checked), so what differs between two of
them is the variable named in the filename and nothing else.

The ladder moves **7.78–7.79% of pixels** at the zoomed read and **0.49–2.42%** at the overview —
so the adoption is visible in every scene, and no comparison below is of a thing with itself.

⚠ **`forest-8px` and `forest-mono-8px` are the same picture, and that is correct.** At 8 px/unit
only the centre island is in frame, and it wears the same status in both crowds. Their difference
is entirely off screen — which is exactly why it had to be measured rather than looked at.

---

## 4. The occlusion field degrades at forest scale — the finding to act on

| scene | field | samples per ground unit |
|---|---|---|
| `one` | 714 x 151 texels | **3.000** (`SHADOW_GRES`, the full rate) |
| `forest` / `forest-mono` | 1334 x 2048 texels | **0.585** |

`occlusionGres` is `min(SHADOW_GRES, SHADOW_TEXTURE_MAX / widestSpan)`. `src/land-shadow.ts:58-66`
budgets for this case in terms — *"a forest of thirty-five islands spread over a thousand units
square would cost 36 MB of the visitor's memory... Clamping the RESOLUTION rather than refusing
keeps the shadow correct and merely coarser on a scene nobody has drawn yet"*. **This page draws
it.** The forest spans ~3,500 ground units, so the clamp bites and the field is **5.1x coarser in
each axis**: one texel every 1.71 ground units, against parcels that average 16.57 across.

**Compare `crowd-one-8px-dense.png` with `crowd-forest-8px-dense.png`.** Same island, same ladder,
same relief, same grain, same camera; the *only* thing that differs is the field's resolution. The
contact pool under the story tree goes from a soft round shadow to a shrunken, jagged blob.

Measured: forest scale moves **0.05% of the frame** at 8 px/unit. ⚠ **Read that number with its
denominator.** Land is 10.02% of that frame and the shadow is a small fraction of the land, so
0.05% of 4.1 M pixels — about 2,000 px — is most of the shadow, not a rounding artefact. The
pictures are what make the size of it legible; the number is what says the picture moved at all.

**What this is and is not.** It is not a cost finding — the frame figures above already include the
coarse field, and it is cheap. It is a **look** finding, and the owner's standing test for this arc
is the look surviving the app's constraints. It is also not a regression this arc introduced: the
clamp predates it, and nothing had ever rendered a scene large enough to reach it.

⚠ **The remedy is a fork, not an obvious fix, and it is not taken here.** Raising
`SHADOW_TEXTURE_MAX` restores the resolution and spends the memory the cap was written to protect
(36 MB at the full rate, on a field that is empty almost everywhere — `occlusionCoverage` is
**0.16%** on the forest against **3.11%** on one island). Building the field **per island** instead
of over the whole ground bounds keeps both, at the price of the one-material/one-draw property this
page's first finding rests on. That is an engineering decision worth its own increment.

---

## 5. What this does not settle

- **It is the LAND only.** No props, no story trees. The kit props are their own draw calls and
  their own increment; nothing here says what 35 islands of props cost.
- **It is one forest shape.** 35 islands at the real map's measured density
  (`forest-snapshot-2026-08-28`), scattered on a jittered grid. Topology decides which island is
  next to which; it does not change how many are in frame or how much of the frame is land, which
  is all this page asks.
- **It does not re-open the adoption.** The owner signed the nine-rung ladder off on
  `oq-which-shade-ladder-should-the-map-wear-and-the-yellow-doe`. This costs it at the scale the
  map is actually drawn at and finds it affordable — under 0.8% of a 60 Hz frame for the whole
  forest's ground at either zoom.
- **It says nothing about mounting.** `<ForestWorldCanvas>` is still mounted in nothing but its own
  dev harness (`oq-the-map-this-arc-is-improving-is-mounted-nowhere-which-ma`), and *look first,
  mount second* stands.
