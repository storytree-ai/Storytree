# The grain octave, in the live renderer — 2026-08-27

Increment `the-grain-octave-in-the-live-renderer` on `adopt-the-land-into-the-shipped-map-arc`.

**The question.** Everything `adopt-the-land-into-the-shipped-map-arc` inherits was measured in
Cycles — an offline path tracer, on a desktop GPU, with no frame budget and no payload. The map we
ship is `packages/forest-world-r3f`, a live WebGL renderer in a browser, and **nothing that has
been proven had ever run in it**. The arc's intent names the grain octave as the sharp end of that
crossing: it is what makes the ground survive being zoomed into (+54% MICRO on bare land at
1948 px), it is nearly free in a path tracer, and it is *not* obviously free in a browser.

**The answer: it crosses, and it crosses better than the ladder analysis predicted.** The half of
the grain that our locked palette can express — the normal half — raises pixel-scale contrast by
**+183%** at the zoomed view **for zero palette cost and zero change in luminance spread**. It is
the cheapest thing this arc has measured.

---

## 1. What was built

- **`harness/land-grain.ts`** — the grain field, pure and node-provable, plus the GLSL that
  evaluates the same field on a GPU with every authored constant interpolated in from the module
  (the `bandGlsl` precedent: a shader and a test holding private copies of the same numbers prove
  nothing about each other).
- **`harness/pixel-metrics.ts`** — MICRO / STRUCT / bins90 over an RGBA buffer, transcribed from
  `chapter2-land-idiom-2026-08-27/measure_land.py` so a number taken off a *browser* can be read
  against that pass's committed table. That instrument only runs inside Blender.
- **`harness/grain-measure.mjs`** + **`harness/grain.html`** — eight panels (four variants × two
  zooms), measured on delivered pixels.
- An opt-in `grain` option on `createBandedMaterial`. Absent, it emits no grain GLSL at all, so
  every panel that predates the grain draws the pixels it always drew.

## 2. What the Cycles grain actually is — two mechanisms, not one

Read off `build_land.py`'s `mat_attribute` rather than off the prose:

| half | Cycles | what it does |
|---|---|---|
| **colour** | `_noise(scale=95, detail=2, roughness=0.55)` → a two-stop dark ramp, mixed at fac **0.130** | tints the delivered colour |
| **normal** | a bump driven by the same noise at strength **0.30** | perturbs the surface normal |

**They land on opposite sides of our palette closure, and that is the finding that shapes
everything below.** Our material does not multiply colour on the GPU at all: `tokenRamp` rounds the
finished colours in TypeScript and the shader SELECTS one and writes it through. So the normal half
perturbs the lambert *before* quantisation and every delivered pixel is still an authored ramp
entry; the colour half mixes into the output and is off-palette **by construction**.

## 3. Two constants that could not be transcribed

⚠ **`GRAIN_LATTICE` is a lattice spacing, not a delivered feature size.** Blender's `Scale=95` on
generated coordinates is 95 lattice cells across the island's 233.8-unit bounding box → 2.46 ground
units, cross-checked by the detail normal one block below it in the same material ("~2.4 ground
units"). But a smoothstep value-noise field does not turn over once per cell: successive hash sites
are independent, so it crosses its mean about once every 1.3 cells. **Measured on three scan lines
over a 2,000-unit span: 2.52, 2.60, 2.90 — a mean of 2.68.** The delivered feature is therefore
**~6.7 ground units, not 2.5**, and anyone sizing the grain against the ~16.5-unit cell pitch or a
pixel budget needs that number. It is `GRAIN_FEATURE_RATIO`, with a test under it.

⚠ **Cycles' bump strength 0.30 CANNOT be transcribed, and transcribing it produces a component
that does nothing while every test around it stays green.** Blender's Bump Strength blends between
the true normal and a height-derived one inside its own shading; ours multiplies a gradient in
field-units per ground unit. Measured, as the fraction of flat ground the grain moves to a
neighbouring rung:

| strength | 0.3 | 0.6 | **1.0** | 1.5 | 2.0 |
|---|---|---|---|---|---|
| ground flipped | **0.00%** | 1.35% | **14.4%** | 32.6% | 44.4% |

At Cycles' own 0.30 the grain is *invisible*: the field's median gradient is 0.138 per ground unit,
tilting the normal ~2.4°, where flat ground needs **9–11°** to reach a neighbouring rung
(half-lambert 0.9105 sits on rung 2; rung 3 needs +0.0395, rung 1 needs −0.0605). **1.0** is the
smallest strength delivering a visible grain while leaving ~85% of the ground on its own rung.

## 4. The measurement

Four variants, two zooms, bare land throughout — no plants, no flowers, no tree. Same fixture,
cells, relief, token, light, camera and projection; **the grain is the only difference**. The
island is 233.8 units on its long axis, so 2 and 8 device px per ground unit reproduce the research
pass's 487 px and 1948 px frames within 4%. Opaque-pixel masks are **identical** across all four
variants at each zoom (77,008 and 1,234,059), so no figure below is a masking artefact.

Pixels are read with `getImageData` off the canvas, not screenshotted — two earlier evidence
pictures on this arc were element screenshots with the page background composited in opaque, and
every figure derived from them was confounded.

### 8 px/unit — the zoom the owner singled out

| variant | MICRO | vs control | STRUCT | vs control | distinct | bins90 | spread | palette |
|---|---|---|---|---|---|---|---|---|
| no grain | 0.374 | — | 8.65 | — | 4 | 3 | 36.7 | CLOSED |
| **normal half** | **1.058** | **+183%** | 9.06 | +4.8% | **4** | **3** | **36.7** | **CLOSED** |
| colour half | 0.895 | +139% | 9.34 | +8.0% | 186 | 94 | 45.4 | OPEN |
| both halves | 1.463 | +291% | 9.60 | +11.0% | 186 | 104 | 47.1 | OPEN |

### 2 px/unit — the overview, where contrast carries

| variant | MICRO | vs control | STRUCT | vs control | distinct | bins90 | palette |
|---|---|---|---|---|---|---|---|
| no grain | 1.408 | — | 6.56 | — | 4 | 3 | CLOSED |
| **normal half** | **3.873** | **+175%** | 6.24 | −4.9% | **4** | **3** | **CLOSED** |
| colour half | 3.289 | +134% | 6.43 | −2.1% | 184 | 94 | OPEN |
| both halves | 5.086 | +261% | 6.15 | −6.3% | 184 | 104 | OPEN |

**The palette column is measured on delivered pixels, and the check fails in both directions** — a
variant expected CLOSED that comes back open, *and* a variant expected OPEN that comes back closed
(which would mean its colour half never reached the framebuffer and its MICRO figure is the control
under another name). All eight landed as predicted.

---

## 5. What the numbers say

**1. The normal half is nearly free, and "nearly" is doing less work than usual.** +183% MICRO at
the zoom, and look at what it does *not* cost: `distinct` stays at **4**, `bins90` stays at **3**,
and the luminance percentiles are **unchanged to a tenth** (p2 131.4, p50 151.6, p98 168.1, spread
36.7 — identical to the control). It is pure spatial redistribution of colours the palette already
held. STRUCT actually rises 4.8% at the zoom and falls 4.9% at the overview, against Cycles' grain
costing −2.7% STRUCT at overview — comparable, and in neither case does the pixel-scale richness
come out of the structural contrast that carries the 487 px read.

**2. Our ungrained land is about 3× flatter than Cycles' ungrained land, and the relative lifts
must be read against that.** Control MICRO: ours 0.374 vs Cycles 1.15 at the zoom, ours 1.408 vs
4.85 at overview — a ratio of 3.1 and 3.4. That is not a defect; it is a 4-rung banded palette with
no antialiasing beside a 128-sample path trace with a denoiser. So **our +183% and Cycles' +59% are
not the same claim**, and the honest comparison is the absolute one:

| | Cycles 1948 px | ours 8 px/unit |
|---|---|---|
| ungrained | 1.15 | 0.374 |
| grained, palette-closed half only | — | **1.058** |
| grained, both halves | 1.83 | 1.463 |

The palette-closed half alone reaches **92% of Cycles' *ungrained* MICRO** and **58% of its grained
figure**. Both halves reach **80%**. The component crosses; it does not arrive whole.

**3. The picture is better than the ladder analysis predicted, and the prediction is worth
recording as wrong.** A four-rung ladder can only express grain as a threshold crossing, so the
expectation going in was *stipple* — a two-tone dither that scores on MICRO while looking like
noise. `grain-normal-8px.png` is not that. It reads as mottled ground, closer to lichen on rock
than to dither, because the relief means the underlying lambert already varies and the rung
boundaries sweep across the surface rather than sitting still. **The threshold analysis was right
about the mechanism and wrong about the appearance**, which is the specific reason this increment
was a measurement rather than a port.

**4. The colour half is the weaker half on its own, and it costs the most.** +139% against the
normal half's +183%, for 186 delivered colours and a broken palette closure. It earns its place
only in combination (+291%), and `grain-both-8px.png` shows what it buys and what it spends: a
softer, more continuous surface, and a visibly **paler** land — the 13% mix toward a light grain
stop lifts the whole island (p2 131.4 → 124.7, but p98 168.1 → 171.8, so it widens spread by
stretching both ends). An island's darkest value is doing work; this spends some of it, which is
the same argument the 2026-08-27 pass made about a pale skirt.

---

## 6. What this changes for the arc

**`replace-the-palette-closure-check` moves earlier.** The arc's intent has it as "a precondition
of ADOPTION specifically" (ADR-0418 D4). It is now also **the precondition of the grain's second
half**: the colour mechanism is legal on `harness/` under ADR-0418 D2/D3 but `capture.mjs` refuses
an off-palette pixel and exits non-zero, so today the colour half cannot appear on any page the
audit runs over. That is why the grain comparison has a page of its own rather than two more panels
on `island.html`.

**But the arc is not blocked on it.** The normal half is capturable today, costs the palette
nothing, and delivers 58% of the reference's grained pixel-scale contrast. If the crossing had to
stop here it would still have moved the ground most of the way from "watercolour wash" to something
that survives the zoom.

**The suggested order in the arc's intent survives.** The grain was named as the cheapest genuine
probe; it was, and it is now measured rather than assumed.

## 7. What is NOT established here

- **Frame cost.** `harness/hardware-floor.*` sweeps draw-call and object count and hard-fails only
  on renderer identity — there is **no frame-time threshold that can fail a run**, and it swaps in
  no alternate material, so fragment-shader cost is never isolated. **End-state item 2 asks for a
  grain cost "against the hardware floor"; that instrument does not exist yet**, and nothing here
  should be read as a performance result.

  What *can* be stated is the arithmetic, and it is not small. One field evaluation is 2 octaves ×
  4 lattice corners = **8 `sin` calls**. The colour half evaluates the field once (8). The normal
  half takes a central difference in two axes, so **four** field evaluations = **32**. Both halves
  together are **40 transcendental calls per fragment**, on the two thirds of the frame the land
  occupies. Two obvious reductions are available and untried: a forward difference plus the centre
  sample is 3 evaluations rather than 4 (−25%), and `dFdx`/`dFdy` on a single sample would make the
  gradient nearly free at the cost of screen-space rather than ground-space derivatives. Neither is
  worth doing before there is an instrument that can tell whether it mattered.
- **Anything about the SHIPPED renderer.** All of this is `harness/`. `src/ForestWorldCanvas.tsx`
  draws each capability as one instanced 6-segment cylinder on flat ground with no shader at all;
  it has nothing to graft a grain onto. Promoting the harness pipeline into the shipped canvas is
  the arc's larger, duller first half and is untouched here.
- **Whether the grain is compatible with what the land's colour ASSERTS.** ADR-0418 D5 — how a
  story's health is carried once colour is no longer carrying it — is unanswered, and it is the
  arc's critical path. The normal half is the one component of this treatment that is *inert* on
  that question, because it delivers no colour the palette did not already hold; the colour half is
  not, and nothing here settles it.
- **Portability of the hash.** `fract(sin(…))` is not reproducible across GPU vendors, and
  `Math.sin` and a GPU's `sin` are different functions. What is guaranteed is that the shader's
  CONSTANTS come from `land-grain.ts` rather than a hand-typed copy. These figures are from
  Chromium's SwiftShader software rasteriser; a different GPU will place the grain's speckles
  differently, though not change its statistics.

## 8. Reproducing it

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5199
ST_GRAIN_URL=http://localhost:5199/grain.html pnpm --filter @storytree/forest-world-r3f measure-grain
```

⚠ `vite.config.ts` pins `strictPort: 5184` for **every** worktree, so running on the default port
means you may measure a sibling worktree's tree and report the number as yours. `grain-measure.mjs`
refuses port 5184 outright, and checks the page's own title before trusting a pixel.

Output lands in `.grain-measure/` (gitignored); the copy kept as evidence is this directory.
`grain-measure.json` carries every figure above plus the per-panel palette verdicts.
