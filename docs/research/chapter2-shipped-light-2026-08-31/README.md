# The shipped map's colour pipeline — the transfer function it was never in

**2026-08-31 · `cross-the-light-calibration-probe` on `adopt-the-land-into-the-shipped-map-arc`
· RTX 2060, two runs, every figure identical to the last digit · reproduce with
`pnpm --filter @storytree/forest-world-r3f measure-shipped-light`**

---

## 0. The short version

**The increment's premise pointed the right way and named the wrong mechanism, and the real one is
much larger.** It was parked believing the shipped crowns read lighter than the approved
`chapter2-vocabulary-2026-08-29/island-kit-8px.png` because `calibrateLights` PROBES a renderer and
scales for a specular term the authored arithmetic does not model, and the canvas ran no probe.

They do read lighter. But the probe is the small half. `<ForestWorldCanvas>` mounted
@react-three/fiber's **default** `<Canvas>`, whose defaults are `ACESFilmicToneMapping` and an sRGB
output encode; `harness/kit-island-scene.ts`, which produced the approved picture, calls
`configureExactColour` **first** and calibrates **second**. The two surfaces were never in the same
transfer function, and no light intensity closes that.

| what a white, fully-lit, fully-rough standard face delivers | measured |
|---|---|
| through the reference's linear passthrough | **0.3176** |
| through the shipped canvas's ACES + sRGB encode | **0.6627** — 2.09x, before any probe |

**And the same finding made the probe itself invalid, which is why the two crossed together.**
`scale = target / probe` is a one-shot solve, exact only where the delivered value is LINEAR in
intensity:

| pipeline | probe | scale | delivered after the scale | target |
|---|---|---|---|---|
| `app-today` | 0.6627 | — (no probe) | 0.6627 | 1.0 |
| `exact` | 0.3176 | — (no probe) | 0.3176 | 1.0 |
| `exact-probe` | 0.3176 | **3.1481** | **1.0000** | 1.0 |

In exact-colour mode the correction lands on the ladder's top rung exactly. Through ACES it does
not, and iterating cannot rescue it: the curve asymptotes, so reaching 1.0 wants a scale near 1e6.
The modelled figure is **0.764 of the rung it aimed at** — a 24% miss wearing a measurement's
clothes. `calibrateLights` therefore **refuses** outside exact-colour mode, and
`src/light-calibration.test.ts` holds that premise with a transcription of three's own ACES chunk.

**And a third thing fell out: this instrument was in a configuration of its own.** A bare
`new THREE.WebGLRenderer` is sRGB-out with **no** tone mapping — neither the product nor the
reference. Harmless while these pages measured only the ground; not harmless from the moment they
started drawing a dressed island, because a `MeshStandardMaterial` crown is subject to both
transforms. `createLandRunner` now takes a pipeline and defaults to what ships.

---

## 1. The comparison — one thing at a time, at both zooms

Each rung differs from the one it names in exactly one thing. Pictures are the renderer's own
buffer, both zooms, same framing, same island (the 164-parcel island the studio ships).

| file | pipeline |
|---|---|
| `dressed-app-today-2px.png` / `-8px.png` | the shipped canvas as it drew on 2026-08-30 |
| `dressed-exact-2px.png` / `-8px.png` | + exact-colour mode |
| `dressed-exact-probe-2px.png` / `-8px.png` | + the measured calibration — **what ships after this** |

The delivered PROP pixels — every pixel the bought kit adds to the same island bare, so this is a
measurement of the props rather than of a guess about which colours belong to a crown:

| pipeline | zoom | changed px | mean rgb | saturated | crushed |
|---|---|---|---|---|---|
| `app-today` | 2 | 2140 | 75.8 90.7 77.2 | 0 | 0 |
| `app-today` | 8 | 36027 | 75.3 90.7 76.9 | 0 | 0 |
| `exact` | 2 | 2140 | 21.0 27.5 21.4 | 0 | 0 |
| `exact` | 8 | 36027 | 20.8 27.5 21.3 | 0 | 0 |
| `exact-probe` | 2 | 2140 | 66.4 86.6 67.5 | 0 | 0 |
| `exact-probe` | 8 | 36027 | 65.7 86.6 67.2 | 0 | 0 |

`exact` alone is the 3.5x darkening `harness/pine-scene.ts` has documented since the pine arm: a PBR
asset dropped into an un-managed pipeline with no output transform to open the result back up. It is
an intermediate rung, not a candidate. `exact-probe` is what the reference render does.

**What moves visibly:** the crowns lose the pale blue-grey wash and come back to the reference's
deep desaturated conifer green, and the story tree's cone stops reading as a near-black silhouette
and lands on a legible mid-green — the ladder's own range, which is the point.

⚠ **The judgment is the owner's and this file does not make it.** `island-kit-8px.png` is a picture
of the HARNESS island and the product draws the studio's, so no two frames here are comparable pixel
for pixel. What is comparable is the CONFIGURATION, and that is asserted in code rather than argued:
`harness/shipped-baseline.test.ts` refuses unless the reference scene and the shipped canvas are
configured by the same two modules, through the re-exports the ADOPTED ledger holds in place.

---

## 2. THE GROUND DOES NOT MOVE — the claim that makes this safe rather than merely nicer

The land's colour is a capability's status (ADR-0392 D5 / ADR-0398 D7). A transfer-function change
that moved a ground pixel would be changing what the map REPORTS, which is the one direction this
surface may not be wrong in.

It moves nothing. The ground-only frame is **byte-identical in all three pipelines** at both zooms,
measured as a hash across three separate page loads, with **0 off-palette pixels** in each:

| pipeline | 2 px/unit | 8 px/unit |
|---|---|---|
| `app-today` | `2b030:b6f683ef` | `2b0e60:b9e69751` |
| `exact` | `2b030:b6f683ef` | `2b0e60:b9e69751` |
| `exact-probe` | `2b030:b6f683ef` | `2b0e60:b9e69751` |

25630 land px at 2 px/unit and 410396 at 8, 5 distinct colours of 25 authored entries, in every arm.

**The mechanism, and it is why the ground was always right:** three appends neither
`<tonemapping_fragment>` nor `<colorspace_fragment>` to a raw `ShaderMaterial` — both chunks live
inside the BUILT-IN materials' sources — so `createBandedGroundMaterial` writes its authored ramp
entry straight to the framebuffer whatever the renderer holds. The arc's palette-closure proof was
never at risk from the canvas's configuration, and is not at risk from changing it. What that
*means*, though, is that until today the map drew its ground through one transfer function and every
prop, tree, cave and wisp standing on it through another.

The driver refuses a run in which those hashes disagree.

---

## 3. What the instrument now refuses

Every one of these is a way this comparison could look right and mean nothing.

- the three pipelines collapsing to fewer than two distinct renderer states (an axis comparing a
  thing with itself);
- `exact` or `app-today` applying a correction, or `exact-probe` applying none;
- the calibration missing the ladder's top rung by more than one byte;
- two pipelines delivering the same mean prop colour (the axis reached nothing);
- **the ground differing between pipelines** — §2, and the one that would mean this change is moving
  what the map reports rather than only how it looks;
- any pipeline delivering an off-palette ground pixel, or drawing no land at all (a blank frame is
  off-palette-free too);
- any pipeline drawing zero props (a kit that failed to parse produces a picture identical to the
  bare island and says nothing about why);
- the renderer changing between page loads; a software rasteriser; a console error or HTTP >= 400.

---

## 4. Reproducing

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port <free> --strictPort
DISPLAY=:0 ST_LIGHT_URL=http://localhost:<free>/shipped-land.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-light
```

Two runs on the RTX 2060 agreed on **every digit** — probe, scale, delivered, prop means, changed-px
counts and both ground hashes. That is expected here and worth saying: unlike the frame-cost pages
on this arc, nothing on this one is timed, so there is no thermal or scheduling drift for a median
to absorb.

⚠ The probe/scale/delivered column is renderer-INDEPENDENT and reproduced to four decimals on the
Windows box under `ST_LIGHT_ANGLE=default` (Adreno X1-85). The prop means and the ground hashes are
not: they differ between the two GPUs by under 1% and by hash respectively, because the grain octave
is renderer-specific to a fraction of its pixels. Every figure and picture above is the RTX 2060's.
