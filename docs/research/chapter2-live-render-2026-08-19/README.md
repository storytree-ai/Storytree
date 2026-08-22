# The live-rendered land experiment — 2026-08-19

The chapter2 code-generated-art arc's `live-rendered-land-experiment` increment, owner-directed
2026-08-19 after looking at the scale ladder: *"honestly, all these look the same, i can maybe see a
little more detail in this image, but the grass still looks like pixel triangles."*

Three instruments had already measured the SPRITE path out for this problem — hair/particle
techniques, shading levers, and resolution. This increment tries the one lever nobody had tried: a
renderer that draws at the display's resolution instead of at a fixed authored pixel budget.

## The three questions, and what this run actually answers

| | question | answered? |
|---|---|---|
| 1 | Does vegetation stop being twelve pixels? | **Qualified yes — see below.** The answer is not the one the increment expected. |
| 2 | Does it clear the ADR-0380 D2 hardware floor? | **YES, with ~41x headroom — measured on the Adreno X1-85 itself.** See section 2; this row was *"cannot be answered from here"* until the follow-up run below. |
| 3 | Does the locked palette survive in a shader? | **YES, proved on delivered pixels.** 46,576 opaque px, 0 off-palette. |

> **Section 2 was rewritten on 2026-08-19, after the rest of this document.** The original run
> declined to answer question 2 and shipped a `HardwareHud` for the owner to answer it by opening
> the page. Both halves of that turned out to be wrong in the same direction, and the correction is
> section 2. What PR #1417 itself concluded is unchanged everywhere else in this file.

## 1 — Vegetation and the twelve pixels: the honest answer is about ZOOM, not about pixels

**At the size a plant is delivered today, the two conventions very nearly tie.** `panel-delivered-size.png`
is the unflattering row and it should be read first: at ~2 device px per world unit, a live-rendered
shrub and a sprite shrub are both small green marks, and an eye at arm's length struggles to separate
them. A live renderer does not rescue a plant that is twelve pixels wide. **Nothing can**, and that is
the same thing the arc already concluded — at ~12 delivered px a plant IS a handful of triangles.

**Where the two conventions part is what happens NEXT.** `panel-zoom-ladder.png` is the finding. A
sprite is authored at a fixed pixel budget, so a bigger map scale enlarges its PIXELS; a live mesh is
rasterised at whatever the display gives it, so a bigger map scale buys DETAIL. The same three plants,
same world size, at four map scales:

| map scale | sprite | live |
|---|---|---|
| 2 px / world unit | small green mark | small green mark — **a tie** |
| 5 px / world unit | blocky bars | recognisable mounds |
| 10 px / world unit | crude rectangles | shrubs with visible lobes and shading |
| 20 px / world unit | **the "pixel triangles"** | shrubs |

So the honest claim is NOT "live rendering makes vegetation look good". It is: **the live path is the
only one where the map's zoom, or a larger art scale, buys anything at all.** On the sprite path every
increase in scale is an increase in pixel size, which is precisely the artefact the owner has now
rejected four times.

**This reframes the whole question and it is the part worth carrying forward.** The arc has been asking
"how do we make a twelve-pixel plant look good", and three instruments answered "you cannot". The live
path does not answer that question either — it removes the constraint that made it the only question.

### What was compared, and why the comparison is trustworthy

ONE GEOMETRY, TWO DELIVERY CONVENTIONS. Both sides of every panel draw the **same** procedural shrub
meshes, at the **same** footprint, through the **same** banded palette, the **same** light and the
**same** orthographic 50° camera. The only difference is where rasterisation happens. Any other shape
of this experiment — a nice new 3D plant beside a screenshot of the old one — would compare two
different plants and settle nothing. That is not hypothetical: this arc nearly published *"hair
delivers more pixels than the hand-modelled dome"* when the truth was that hair was simply a bigger
object.

The match is MECHANICAL, not promised. `plant-geometry.ts`'s `fitToFootprint` scales every generated
mesh so its bounding box IS the requested footprint, and `plant-geometry.test.ts` asserts it across
five forms and four footprints. A test also asserts that the live and sprite sides of the comparison
occupy the same box.

### A number that does NOT agree with the arithmetic, reported rather than reconciled

`w × h × fill` predicts ~13 delivered px for a 6×3 shrub. The panels actually deliver **about 5–6 px
per plant at 1 px/unit** (`capture-report.json` → `perPanel`; the smallest sprite rungs are 17 opaque
px for three whole plants). The gap is the 50° tilt foreshortening the height, plus a mound not filling
its box. Both numbers are in the report and on the page; neither is quietly substituted for the other.

⚠ **Do not add this to the arc's zero-delivery series.** The arc already carries five different
denominators (46% / 17.2% / 6.6% / 8.2% / 2.3%), every one true of what it measured and none
transferable. This is a sixth surface — a procedural mesh under an orthographic camera on a
transparent panel — and it is not comparable to any of them.

## 2 — The hardware floor IS cleared, and the two reasons it looked unanswerable were both wrong

ADR-0380 D2 names the floor precisely: a Snapdragon X Elite X1E80100 with an **integrated Adreno
X1-85**, no discrete GPU, no CUDA, at 2880x1920. The first run declined to answer it, and was right
to: headless Chromium here rasterises through **ANGLE-on-SwiftShader**, which is software, so its
frame times are the compositor's present cadence and nothing more.

Two things were then assumed rather than measured, and both are false.

### (a) The limit was HEADLESS, not the box — this machine IS the floor

`chromium.launch({ headless: false })` on this same machine reports:

```
ANGLE (Qualcomm, Qualcomm(R) Adreno(TM) X1-85 GPU (0x36334330) Direct3D11 vs_5_0 ps_5_0, D3D11)
```

The installed Chrome reports the identical string. That is the D2 floor hardware itself, so the
measurement never needed to wait for anyone to open a URL — it needed a browser with a window.
`hardware-floor.mjs` asserts this rather than assuming it: a software renderer **REFUSES** the run
instead of producing a number, which keeps PR #1417's refusal intact for any machine where it still
applies.

### (b) The shipped `HardwareHud` cannot answer D2 even on the real GPU

This is the part worth carrying forward, because the remedy looked sound and was not.

`compare.html` renders each panel **once** and blits it to a 2D canvas; after the settled signal
nothing is drawn again. `HardwareHud` then samples ninety `requestAnimationFrame` deltas of an
**idle page** — and an idle page presents at the display's refresh interval whatever is or is not on
it. So the HUD reproduces the very artefact this document correctly refused to quote from the
headless run, arrived at by a different road.

Measured, not argued — the same probe the HUD runs, on the real GPU, on two pages:

| control | p50 | p95 |
|---|---:|---:|
| a **blank page** | 16.70 ms | 18.0 ms |
| **`compare.html`**, settled | 16.70 ms | 17.8 ms |

They are the same number, and the page with 22 rendered panels is if anything *marginally faster*
than the empty one. **The HUD's reading contains no scene.** An owner opening the page and seeing
`Adreno X1-85` beside `p50 16.7 ms` would have read a display refresh rate as a hardware verdict —
this arc's most-repeated error class, in a new costume.

A second demonstration arrived by accident while staging the page for the owner, and it is the
blunter one: **the same static page, on the same GPU, in a differently-sized window, reported
`idle cadence p50 33.30 ms`** — almost exactly twice 16.7, i.e. that window was presenting at 30 Hz.
Nothing about the scene, the shader or the geometry differed between the two readings. A quantity
that halves because a window changed, while the thing it supposedly measures is byte-identical, is
measuring the presentation environment.

### What a scene that is actually being drawn costs

`hardware-floor.html` draws a vegetated land continuously at D2's 2880x1920, using the same plant
generator, the same banded material and the same signed 50-degree orthographic camera. Two numbers
are reported because they fail in different ways: `rafP50/P95` is **vsync-capped**, so it can only
ever show 60 Hz being *missed*, never headroom; `gpuMsPerFrame` times a batch of renders closed by
`gl.finish()`, so it is uncapped and is the one that shows margin.

| plants | GPU ms/frame | triangles | draw calls | rAF p95 |
|---:|---:|---:|---:|---:|
| 0 | 0.28 | 2 | 1 | 18.1 |
| 50 | 0.10 | 9,602 | 51 | 18.2 |
| **171** (the real-corpus island) | **0.41** | 32,834 | 172 | 18.1 |
| 500 | 1.14 | 96,002 | 501 | 18.1 |
| 1,500 | 3.47 | 288,002 | 1,501 | 24.2 |
| 4,000 | 8.79 | 768,002 | 4,001 | 19.8 |

**At the real island's 171 vegetation marks the land costs 0.41 ms of a 16.7 ms frame — about 41x
headroom.** Extrapolating the heaviest rung linearly, a whole frame would be spent at roughly
**7,600 plants**, some 44x the island's actual count.

**Read the cadence column as noise, not as signal.** The **empty** scene and the **171-plant** scene
have the *same* p95 (18.1), the 50-plant scene's is *higher* than both (18.2), and the blank-page
control sits at 18.0 — so across the whole range where the answer actually matters, this column is
measuring the display and not the land. The verdict in `hardware-floor-report.json` is therefore
computed against those controls rather than against a chosen tolerance: an earlier draft scored the
rungs against `16.7 x 1.35`, where 1.35 was a number picked because it made the answer come out.

### Four things this does NOT say

1. **It is the naive draw path** — one draw call per plant, confirmed by the sweep's own call
   counts. The numbers are a **floor** on achievable performance, not a ceiling; instancing, which
   any real renderer would do, moves them a long way down.
2. **It is the harness land**, not the shipped island: procedural shrubs on a ground plane. No
   terracing, rim walls, coast, trails, nameplates or accretion reveal. It bounds the **vegetation**
   question D2 was asked about; it does not certify a whole live map.
3. **Readings below ~0.5 ms/frame are at the instrument's noise floor** — the empty scene costs
   about what the 50-plant scene does. Do not compare the small rungs against each other.
4. **Accessibility — ADR-0380's own "hardest part of D6" — remains untouched**, by this run and by
   PR #1417. Nothing here is evidence that fence is affordable.

### Reproducing it

```bash
pnpm --filter @storytree/forest-world-r3f hardware-floor
```

Needs the dev server up (`pnpm --filter @storytree/forest-world-r3f dev`) and **must run headed** —
it opens real browser windows, because that is the entire point. It refuses rather than reporting a
number when the renderer is software, when the tab is hidden, when the blank-page control shows rAF
being throttled (a backgrounded window ticks at ~1 Hz and reads as a plausible "this is slow"
figure), or when any page logs an error.

## 3 — The locked palette survives in a shader, and it is proved on delivered pixels

**0 off-palette pixels out of 46,576 opaque, across 22 panels, 24 distinct delivered colours against
104 authored entries.** Read back off the composited canvases by `capture.mjs`, checked against the
palette imported from the *same module* the shader's ladder is generated from — a capture script with
its own copy of the palette would only ever prove the two copies agree.

### The design: CONSTRUCT, do not SNAP

The author-time compositor shades freely and then SNAPS each pixel to the nearest entry of a closed
palette. That is a clamp, and this arc has measured what an imperfect clamp costs: a missing
`(token × shade)` entry silently repainted an `unknown` island's rim `healthy` green over 2,564 px,
because a snap can only clamp toward what it holds — a missing entry reassigns SEMANTIC state rather
than shifting a hue.

So the shader does not snap. The palette IS the closure of (authored token × authored shade level), so
the material is handed its instance's own token and quantises only the LIGHTING SCALAR onto that same
authored ladder. Every emitted colour is a palette entry by construction. **A foreign-status read is
not made unlikely; it is unrepresentable** — `palette-band.test.ts` proves it over a continuous sweep,
and an UNBANDED control must fail the same check, so the closure test is provably testing the banding.

Reachable palette: **104 entries** (26 tokens × 4 levels, no collisions), against the shipped land-only
86 and dressed 132. A live render is therefore in the same colour regime as the sprite path, not a
generic 3D render — which is what ADR-0214 §4 asks for.

### Two corrections that cost real time and are the reusable half

**(a) WHERE THE ROUNDING HAPPENS CHANGES THE PIXEL.** A first version had the GPU compute
`token * level` in normalised floats and let the framebuffer write-back round. It delivered **929 px of
`#c2ad5e`** where the authored entry is `#c2ad5f`. The exact product for `#d8c069`'s blue channel at
level 0.9 is **94.5** — JavaScript's `Math.round` takes an exact half UP, the GPU's float-to-unorm8
conversion took it DOWN. Neither is wrong; they are not the same. The rounding now happens ONCE in
TypeScript (`tokenRamp`) and the shader SELECTS from the finished ramp, performing no colour arithmetic
at all. **On-palette now means bit-identical rather than within-one-LSB.**

**(b) A LOST WEBGL CONTEXT CANNOT FAIL A PALETTE CHECK — IT CAN ONLY PASS ONE.** The page grew to 22
canvases, past the browser's ~16 simultaneous WebGL contexts, and six were silently lost. A lost canvas
delivers zero pixels and zero colours, so the run reported **PALETTE CLOSED over six blank panels** and
looked exactly like a success. Fixed by one shared context blitted to plain 2D canvases; **caught by a
PER-CANVAS floor**, which is the guard that generalises. The global pixel floor that was already there
passed the whole time.

⚠ A follow-on: the first per-canvas floor was set at 20 px and condemned four legitimate panels
carrying 17. The floor was wrong, not the panels. **Raising a floor until the evidence passes is how an
instrument stops measuring anything** — it is now 5, chosen because the failure it exists to catch
delivers exactly zero.

### Antialiasing is OFF, and that is load-bearing

A multisampled edge BLENDS two palette entries and delivers a colour on neither. The closure proof
would then fail on the compositor's arithmetic while naming the shader. A locked-palette render is
aliased on purpose; that is what "locked" costs. Same reason `imageSmoothingEnabled` is off on the blit.

## The four ADR-0380 D6 fences

| fence | how this experiment stands with it |
|---|---|
| **Accessibility not traded away** | **NOT ADDRESSED — and it is ADR-0380's own "hardest part of D6".** This is a piece-scale harness with no labels, tooltips or hit targets, so it neither honours nor violates the fence; it simply has not reached it. Nothing here should be read as evidence the fence is affordable. |
| **Determinism moves, not disappears** | HONOURED. The geometry generator is `mulberry32`-seeded, `Math.random` is absent, and a test asserts the same seed grows a byte-identical mesh. |
| **Locked-palette identity** | HONOURED AND PROVED — section 3. |
| **Projection does not move** | HONOURED BY CONSTRUCTION. Orthographic at the arc's signed 50°, no orbit control, no perspective camera. |

### The scope fence, and the one place it bit

The increment required this be built BEHIND the existing provability firewall. Every file is in
`packages/forest-world-r3f/harness/` — dev-only, typechecked, tested. **`packages/forest-world-r3f/src`
is byte-identical to `main`.** The shipped SVG map is untouched and no default user path reaches any of
it. Adopting this into the app is a separate event and is NOT authorised by the experiment.

**That filing is a scope decision, not a tidiness one, and it was forced by CI.** The four modules first
landed in `src/` — the natural home — and CI refused: `packages/forest-world-r3f/src` is MIRRORED into
the public storytree-web repo by `pnpm sync:web-engine`, which copies every non-test file it finds and
offers no way to exclude one. The documented remedy (run the sync, commit the web submodule, bump the
gitlink) would have **published an unadopted experiment to a public repo** — precisely the "different
decision, and it is the owner's" the increment names. So the modules moved to `harness/`, which sits
outside the synced tree. `harness/scope-fence.test.ts` now holds that as a property rather than a habit,
including the reverse direction (no `src/` file may import the harness, which would leave a dangling
import in the public mirror).

⚠ **The local gate CANNOT catch this**, and it said so honestly: `check:web-engine` SKIPPED here because
the `web/` submodule is not checked out, and a skip is reported as *unverified*, never as passed. This
is the one class of failure a laptop gate structurally cannot see. Read a NARROWED green as narrowed.

## Reproducing it

```bash
pnpm --filter @storytree/forest-world-r3f test
```

```bash
pnpm --filter @storytree/forest-world-r3f dev
```

```bash
pnpm --filter @storytree/forest-world-r3f capture
```

`test` runs 55 checks (35 of them this increment's). `dev` serves the evidence page at
<http://localhost:5184/compare.html>. `capture` drives it headless, writes the pictures and
`capture-report.json` here, and **REFUSES** rather than reporting a clean palette when: the page logs a
console error, no WebGL context exists, any canvas delivers under 5 opaque px, the page total is under
5,000, or a delivered pixel is off-palette.

The capture waits on a settled signal the page publishes (`window.__stExperimentSettled`), never a
sleep — the pattern the desktop E2E harness already established.

## Files

- `live-vs-sprite.png` — the whole page.
- `panel-delivered-size.png` — **read first.** The two conventions at true delivered size, where they tie.
- `panel-zoom-ladder.png` — **the finding.** Where they part.
- `panel-magnified.png` — the art call at 20×.
- `panel-detail-ladder.png` — geodesic subdivision 0→3 at a FIXED footprint. Triangles ×4 a rung while
  the plant stays the same size — precisely what the 1×/2×/4×/8× raster ladder could not do, since that
  one scaled the same authored geometry and so authored no new detail at any rung.
- `panel-status-tokens.png` — every parcel status through one shader. ⚠ Carries its own caveat on
  the page: `worldStatus` folds `unhealthy`→`mapped` (ADR-0296) and `building`→`proposed`
  (ADR-0038), so two of the six are unreachable on a real island, and `unknown` is not a schema
  status at all but the null-status fallback — which is why it rendering as a healthy-looking green
  is worth a look. All six are drawn because the panel tests the SHADER, not a vocabulary. The arc
  has already once over-counted a palette problem by scoring all six as if the app could draw them.
- `capture-report.json` — the measured numbers, including the WebGL renderer string and per-panel counts.
- `hardware-floor-report.json` — **question 2's answer** (section 2): the Adreno renderer string, the
  two idle controls that show the `HardwareHud` reading carries no scene, the plant-count sweep, and
  a verdict computed against those controls rather than against a chosen tolerance.
  ⚠ **This is the 2026-08-19 record and is kept, not regenerated** — it is the artifact the
  write-ups cite, and a re-run measures a different box-load rather than a different hardware
  floor. Two things follow. **(a)** Its `verdict.cadenceIsUninformative` was corrected on
  2026-08-22. It had been the file's one hand-typed sentence, and it claimed the 0-plant rung's p95
  was *higher* than the island rung's when the table above shows the two are equal at 18.1. It is
  now **derived from those same rows** by `harness/cadence-verdict.ts`, and a test re-derives it
  from this very file, so the prose can no longer drift from the data the way a typed sentence
  could. No measured value changed; nothing about D2's answer changed. **(b)** Re-running the
  harness still rewrites two of the `caveats` strings, because the committed text spells their
  possessives with a backtick and the repaired source spells them with an apostrophe. That is
  2026-08-21 typography, **not drift** — restore with `git checkout -- docs/research/chapter2-live-render-2026-08-19/`.
- `hardware-floor-page.png` — the continuously-drawn land the sweep timed. It is a benchmark surface,
  **not an art panel**: nothing about how it looks is a finding, and it is not the shipped island.
