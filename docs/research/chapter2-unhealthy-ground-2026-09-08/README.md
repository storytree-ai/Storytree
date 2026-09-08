# The unhealthy ground, painted for the READ — 2026-09-08

Increment `paint-the-unhealthy-ground-for-the-read-not-the-richness` on `paint-every-land-type-arc`.
Everything here was measured on the **Mint box, RTX 2060** through headless Chromium reaching the
GPU (`ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)`, `software=false`).
No figure is inherited: every number below came off this session's own run.

Reproduce:

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5422 --strictPort --host 127.0.0.1
DISPLAY=:0 ST_BLIGHT_URL=http://127.0.0.1:5422/shipped-blight.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-blight
```

⚠ `DISPLAY=:0` must be in the environment **even headless**, or ANGLE falls back to SwiftShader and
every figure is a software figure. The driver refuses rather than reporting one.

---

## 0. A FORCED-TOKEN FIXTURE — read every picture here with that in front of it

The published map carries **no `unhealthy` island** (21 `healthy` + 14 `proposed` as at 2026-08-28;
the committed export used here carries 24 / 10 / 1 once one island is forced). So this row cannot be
judged on the shipped map at all, and nothing in this directory is a live judgement about anything
the map draws today.

What *is* live is everything else in the frame: the real 35-island layout, the real island sizes, the
real neighbours' statuses, the real props and the real occlusion field. The forced island is
`context-traversal-capture` — a real island of the real map, chosen because
`real-forest-scene.ts`'s read zoom already centres on it, so the two pages talk about the same island.

The control arm has **no shipped counterpart**: the usual "pixels moved against what ships" arm
compares a painted token to the same token as the map draws it, and there is no such frame. `flat` is
the same forced fixture wearing the flat charcoal — what the map *would* draw.

⚠ **The island's dressing is the HEALTHY island's dressing, on every arm, deliberately.** Placements
come from the unforced stream so the arms differ in exactly one thing: the ground. On the real map an
unhealthy capability's tree is a bare dead trunk (`kit-vocabulary.ts`), so these pictures **understate**
the read a real unhealthy island would get — the ground alone is carrying it here.

---

## 1. WHY THE SECOND SIGNAL CHANNEL HAD TO DO THE WORK

The `unhealthy` token is `#57544a` = `rgb(87, 84, 74)`. On the real map (2026-09-08,
`../chapter2-real-forest-2026-09-08/`) a **healthy** island delivers `rgb(87, 97, 74)`, because the
slope-gated rock layer greys a small island across its whole surface. Those two colours differ by
thirteen units on one channel and by nothing on the other two.

Hue alone therefore cannot carry this token, and there is no hue free to move it to: `mapped` owns
the clay, the in-progress token owns the gold, `unknown` owns the pale slate, the sea owns the dark
blue. So the separation is taken in the one channel nothing else on this map uses — **high internal
contrast**: a near-black ground split by a pale bone network of closed plates, at a scale the fitted
forest can still resolve as texture. That is ADR-0414's "texture presence as a signal channel
alongside hue", and this row is its strongest case.

**Zero colours are authored.** Every colour is the token scaled in linear space, ratio-preserving:
the base ramps are the grass's own stops rebased onto the token (the wheat's algebra, imported) and
then multiplied down by `burn`; the crack colour is the same token multiplied **up** by
`BLIGHT_CRACK_LIFT` = 4, delivering `rgb(166, 161, 143)`. The module authors *how far the ground has
died*, not what colour it is.

---

## 2. THE LAYER SET IS CHOSEN, NOT COPIED — and a dropped layer is a finding

The green wears six. The unhealthy ground wears **the base paint, the crack network, the detail
normal and the grain**, and drops three:

| dropped | why |
|---|---|
| **2 — the shore sand** | a bright warm band around the rim is the single largest bright region on a small island, and it is exactly the region a fitted forest resolves first. A dying island has a dead shore. |
| **3 — the worn path** | a path is a trace of USE. Nothing walks a failed capability, and a lush trail is the increment's own example of a layer that works against the read. |
| **4 — the slope rock** | the layer measured on 2026-09-08 to desaturate a real-map island past its own status. Wearing it would push the unhealthy ground toward exactly the grey the healthy islands already deliver. |

The mechanism is an **absence, not a subtraction**: layers 2, 3 and 4 all ride `grassGate`, and the
blight gate is deliberately *not* promoted into it the way the wheat's is. An unblighted material's
emitted shader is byte-identical to the one this repo compiled before the blight existed
(`banded-ground-material.blight.test.ts` asserts both halves).

⚠ **Nothing here repairs the rock layer for the green islands.** That is a finding on
`mount-the-land-on-a-real-surface-arc`'s evidence, not a decided repair, and changing a shipped
ground layer is its own decision.

---

## 3. THE LADDER, AND THE PICK

`sheet-one-8px.png` — the six arms at 8 px per ground unit.
`sheet-forest-fit.png` — four arms on the fitted forest.
`sheet-forest-find-it.png` — **the acceptance picture**: the real forest fitted, one island forced
unhealthy at the shipped rung, nothing marked. *Can it be found without being told where?*

| rung | burn | cracks | vs healthy | vs proposed | median above the sea (fitted) |
|---|---|---|---|---|---|
| `flat` (control) | — | — | 48 | 68 | 53.8 |
| `sick` | 0.20 | 0.30 | 69 | 89 | 34.2 |
| `dying` | 0.45 | 0.55 | 76 | 96 | 27.2 |
| **`dead` — SHIPS** | **0.65** | **0.75** | **83** | **103** | **20.1** |
| `scorched` | 0.80 | 0.90 | 91 | 111 | 12.1 ⚠ below the bar |
| `nocracks` | 0.65 | 0.00 | 85 | 105 | 17.8 ⚠ below the bar |

"vs healthy / vs proposed" is the largest per-channel gap between the forced island's median and the
pooled median of every island wearing that status **in the same frame** — the honest form of "does it
jump out", since that is what a viewer actually compares. ADR-0490 D6 calls 20/255 the bar at which a
pixel has moved. **Reported, never a fence** (ADR-0503 D1 / ADR-0506): the look decides
(ADR-0489 D3).

**`dead` ships: it is the boldest rung that clears the sea fence.** `scorched` does not — see §5.

---

## 4. WHAT THE CRACK NETWORK IS ACTUALLY WORTH

⚠ **Read the pixel share, not the median.** Cracks are thin lines: they move a minority of pixels a
long way, so the median barely moves while the island's appearance changes completely. On this
page's first run the median said **3/255** between the burn alone and the whole treatment — a number
that reads as "the crack layer does nothing" and is wrong about the only thing this row rests on.

| picture | the burn alone, vs the flat token | the crack network alone, vs the burn |
|---|---|---|
| fitted forest | 84.1% of the island past 20/255 | **19.0%** (56 of 295 island pixels) |
| 8 px/unit | 67.5% | **16.6%** (9,209 of 55,523 island pixels) |

And the finding that settles it: **the crack network is what keeps the island out of the water.** At
the shipped burn with the cracks off, the island's median sits **17.8** above the sea — below the bar,
must not ship. With the cracks it is **20.1**. Look at `blight-one-nocracks.png` beside
`blight-one-dead.png`: the burn alone is a featureless dark blob that reads as *unlit*, which is
precisely the "painting darker right up to invisibility" failure `PR #1792` shipped once. With the
cracks it reads as *dead*.

**How wide the cracks are, is set by the fitted zoom and not by the close-up look**
(`sheet-crack-width.png`, the `dead` rung at three widths):

| crack width | close up | fitted forest |
|---|---|---|
| 0.020 | reads best — thin pale lines splitting dark plates | lifts the median only to **18.8** ⚠ below the bar |
| **0.045 — SHIPS** | wider, marbled veins | **20.1**, clears |
| 0.070 | the read INVERTS — pale ground with dark patches | 23.7 |

So 0.045 is the smallest width that keeps the island out of the water at the map's own zoom. The
thinner crack is available as a scale-back, and this is what it costs.

---

## 5. THE ONE FENCE — the sea

A contrast metric that excludes the background rewards painting a surface darker right up to
invisibility, and it shipped once (PR #1792, the cliff whose bottom half merged into the water while
its own metric improved).

⚠ **The fence is on the MEDIAN, not on the darkest pixel.** The darkest single pixel is the deepest
shadow rung rather than the paint, and the FLAT token already fails a 20/255 reading of it (6.1 above
the sea at the fitted forest) — so a fence there would have refused the token the map already draws.
That column is direction, not a bar. What must not happen is the island *as a whole* merging with the
water.

`scorched` fails on both readings — median 12.1 above the sea, and its darkest ground pixel is
**darker than the sea** (−0.5). It is rendered so the ladder's "too far" is on the sheet, and it must
not ship.

---

## 6. ⚠ A DEFECT IN THE `real-forest` INSTRUMENT, FOUND ON THE WAY — reported, not repaired

**`real-forest-scene.ts` reads its FIRST render of each scene, and a first render can be photographed
before its textures have reached the GPU.** The frame it measures is therefore darker than the frame
it saves, and the status verdict it derives is a plausible number in the alarming direction.

Reproduced here, without a browser:

- `real-forest-measure` reports the island `agent` (healthy) in the fitted forest voting
  **12 `healthy` / 25 `unknown` / 110 `unhealthy`**, `pass: false`.
- The same 147 pixels of **its own committed `3d-fit.png`**, re-classified outside the browser with
  the instrument's own reader table and its own `W_LUMA` weighting, vote
  **67 `healthy` / 4 `unknown` / 76 `unhealthy`** — which is exactly what this page reports for the
  identical frame.
- The two PNGs are byte-identical outside a 36×27 box (the forced island), so it is not a different
  render, a different camera or a different rect: the per-island ground-pixel counts match exactly
  (147, 295, 10,348 in total).
- The `norock` arm — the one with **no kit meshes standing on the ground** — reproduces to within a
  few pixels (126 reported vs 136 recomputed). The arm carrying kit meshes is the one thrown, which
  is what points at texture upload.

**What this changes.** The headline "**1 of 35** islands read as their own status family, **31 of 35**
with the rock removed" is partly an artefact of when the frame was taken. Measured warm, on this
page, the map arm reads **22 of 35** — `healthy 17/30`, `proposed 4/4`, `unhealthy 1/1`. The rock
finding **survives in direction** (the healthy islands still misread more often than not, and
removing the rock still fixes them), but not at that magnitude.

**This page does not inherit it:** `frameOf` renders twice and measures the second frame, and says
why in terms.

Repairing `real-forest-scene.ts` belongs to `mount-the-land-on-a-real-surface-arc`, which owns that
instrument and the conclusions drawn from it.

---

## 7. THE FILES

| file | what |
|---|---|
| `sheet-forest-find-it.png` | **the acceptance picture** — the real forest fitted, one island forced unhealthy at the shipped rung, nothing marked |
| `sheet-forest-fit.png` | four arms on the fitted forest, side by side |
| `sheet-one-8px.png` | the six arms at 8 px per ground unit — the ladder the pick was made from |
| `sheet-crack-width.png` | the `dead` rung at crack widths 0.020 / 0.045 / 0.070 |
| `blight-forest-<arm>.png` | the whole fitted frame, per arm (2560×1600) |
| `blight-one-<arm>.png` | the forced island at 8 px/unit, per arm |
| `report.txt` | every number above, as the driver printed it |
| `measurements.json` | the per-arm readings in full, including every island's status verdict |

Code: `src/land-blight.ts` (the paint), `src/banded-ground-material.ts` (the seam and its refusals),
`src/ForestWorldCanvas.tsx` (`SHIPPED_BLIGHT_RUNG`, the pick),
`harness/shipped-blight-scene.ts` + `.html` + `-measure.mjs` (this page).
