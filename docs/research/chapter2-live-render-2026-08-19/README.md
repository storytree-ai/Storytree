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
| 2 | Does it clear the ADR-0380 D2 hardware floor? | **NO — and it cannot be answered from here.** Needs the owner, on the owner's GPU. |
| 3 | Does the locked palette survive in a shader? | **YES, proved on delivered pixels.** 46,576 opaque px, 0 off-palette. |

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

## 2 — The hardware floor is NOT answered, and this is the honest limit of the whole run

ADR-0380 D2 names the floor precisely: a Snapdragon X Elite X1E80100 with an **integrated Adreno
X1-85**, no discrete GPU, no CUDA, at 2880×1920. **This run cannot measure that**, and it would have
been easy to pretend otherwise.

Headless Chromium on this box rasterises WebGL through **ANGLE-on-SwiftShader** — measured every run,
recorded in `capture-report.json` → `webgl.renderer`, never assumed. SwiftShader is a **software**
rasteriser. It delivers the same PIXELS a GPU would, so questions 1 and 3 are sound; it says nothing
whatever about frame cost on the Adreno. The frame timing in the report sits at a suspiciously flat
~16.7 ms, which is the headless compositor's present cadence, not a GPU-bound cost — it is labelled
`RELATIVE ONLY` in the report itself.

**Reporting a SwiftShader frame time as a D2 verdict would be exactly the class of error this arc has
had to correct five times.** So it is not reported. Question 2 needs the owner to open the harness in
a real browser on the real machine; that is staged below.

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

Scope fence: the increment required this be built BEHIND the existing provability firewall. All code is
in `packages/forest-world-r3f` (the spike) and its dev-only `harness/`. **The shipped SVG map is
untouched; no default user path reaches any of it.** Adopting this into the app is a separate event and
is NOT authorised by the experiment.

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
