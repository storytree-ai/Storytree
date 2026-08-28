# The bug that looks like an art direction, and the check that can now catch it

**Increment:** `guard-the-textured-asset-colour-convention` on `adopt-the-land-into-the-shipped-map-arc`.
**Date:** 2026-08-28. **Measured on:** `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2,
OpenGL 4.5.0)`, read out of the live context. **Verdict:** the convention HOLDS, and the check that
says so has been shown to refuse the state it exists to refuse.

Reproduce:

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5209
DISPLAY=:0 ST_CONVENTION_URL=http://localhost:5209/colour-convention.html \
  pnpm --filter @storytree/forest-world-r3f measure-convention
```

Raw reports: [`colour-convention.json`](colour-convention.json) (the checkout as it stands) and
[`colour-convention-BROKEN.json`](colour-convention-BROKEN.json) (the same run with the convention
removed). `snapshot-arm.mjs` is what took the two pictures.

---

## 1. THE PICTURE — one variable moved, same camera, same run

| picture | what it is |
|---|---|
| `convention-raw-{2,8}px.png` | nine bought pines, base-colour maps sampled RAW — the convention |
| `convention-managed-{2,8}px.png` | the same nine, same everything, base-colour maps decoded as sRGB |

**Look at `convention-managed-8px.png` on its own and nothing is wrong with it.** Dark, silhouetted
conifers on light grass. It reads as a deliberate, slightly moody art direction — which is exactly
the danger, and exactly why the defect survived its first render and was found by arithmetic rather
than by eye. Beside `convention-raw-8px.png` it is obviously 3.5x too dark; alone it is a style.

`convention-raw-8px.png` is byte-identical to the previous increment's `pine-gltf-8px.png`, which is
a small independent check that this run reproduced that one rather than resembling it.

---

## 2. WHAT GOES WRONG, in one paragraph

This renderer is deliberately **not** colour-managed. `configureExactColour` sets
`outputColorSpace = LinearSRGBColorSpace` and `ColorManagement.enabled = false` so an authored token
like `#8cb85e` survives the round trip byte-for-byte — the whole basis of the palette-closure claim
ADR-0380 / ADR-0406 / ADR-0418 rest on. But **`ColorManagement.enabled` governs `Color` VALUES, not
texture transfer functions.** `GLTFLoader` marks a glTF base-colour map `SRGBColorSpace` regardless,
three decodes it in the shader, the lighting runs in linear, and nothing ever encodes the result back
out. So a bought texture arrives about 3.5x dark while every authored colour beside it is exact.

The convention is therefore: **a base-colour map is sampled RAW** (`NoColorSpace`), which puts a
bought asset in the same convention `createBandedMaterial` already uses. **Data maps — normal,
roughness, metalness, AO — carry linear data and are LEFT ALONE**; forcing those raw would be a
second, opposite bug.

`first-textured-asset-in-the-live-renderer` found this and fixed it by hand, in one loader call, and
recorded (README §9 item 4) that nothing mechanically stopped it coming back. This increment is that
mechanism.

---

## 3. THE CHECK — three legs, because no one of them covers the hazard

The hazard is not "the fix gets reverted". It is **"the next textured asset is loaded by a path that
never knew about the convention"** — a different page, a different session, a fresh
`new GLTFLoader()`. That is a coverage problem, not a correctness one, so the check has a leg for
each half and a third for the part neither can reach.

| leg | where | what it can catch | what it cannot |
|---|---|---|---|
| **A — the convention is correct** | `texture-convention.test.ts`, pure | the function stops putting colour maps raw, or starts touching data maps | a caller that never calls it |
| **B — every loader routes through it** | the same file, a scan over `harness/` | a NEW module that reaches for a loader without the convention | a loader reached by a computed name |
| **C — the frame actually delivers raw** | `colour-convention-measure.mjs`, on the GPU | the convention being invoked and not working — a three upgrade, a map in a slot the convention does not name | an asset that is not on the page |

Leg B scrapes its subject list **off the directory**, not off a manifest, so a new page cannot opt
out by not being on a list — there is no list to be off. It matches import statements and
constructor calls rather than the bare word, because `asset-payload.ts` discusses `GLTFLoader` in
prose and loads nothing; a check keyed on the word would demand the convention of a comment, and the
honest fix for that would be to weaken the check.

### 3a. Leg C reads its bar off a control in the same run

For every material an asset carries, three swatches are drawn in one context, on one quad, under one
light, differing in exactly one thing — which texture is bound:

1. the asset's own map, as the production loading path left it;
2. a flat 1x1 texture of that map's own mean, forced raw — **the RAW hypothesis**;
3. a flat 1x1 texture of that map's mean-after-linearising, forced raw — **the MANAGED hypothesis**.

Arms 2 and 3 are what the frame *would* look like under each convention, **measured rather than
modelled**. That means the standard material's BRDF constants, its surviving specular term and the
light calibration all cancel instead of having to be reproduced in JavaScript, where they would
drift. It also means the bar is a same-run control rather than a number someone picked.

The verdict is then whichever control the delivered pixels match, to within 12%:

**As the checkout stands:**

| material | verdict | delivered | raw control | managed control | separation | map |
|---|---|---|---|---|---|---|
| Pine_Branches | **RAW** | (70,91,70) | (70,91,70) | (18,27,16) | 3.79x | 512² |
| Pine_Trunks | **RAW** | (112,82,72) | (112,82,72) | (42,23,17) | 3.24x | 512² |

**With the convention removed — the pre-fix state:**

| material | verdict | delivered | raw control | managed control |
|---|---|---|---|---|
| Pine_Branches | **COLOUR-MANAGED** | (17,27,16) | (70,91,70) | (18,27,16) |
| Pine_Trunks | **COLOUR-MANAGED** | (42,22,17) | (112,82,72) | (42,23,17) |

The delivered foliage in the broken state is rgb(17,27,16) against the previous increment's
hand-measured rgb(15,26,15) — the same defect, reproduced by a different instrument.

### 3b. Two fail-closed floors, because a check that cannot discriminate must say so

- **Hypothesis separation ≥ 2.0x.** A near-black or near-flat map linearises to nearly itself, so no
  frame of it can say which convention produced it. The run answers `INDISCRIMINATE` and **fails**
  rather than passing — passing there would be reporting the instrument's own blindness as a green.
  Measured separations here are 3.24x and 3.79x, comfortably clear.
- **The material manifest is hand-authored upstream of the loader** (`ASSET_MATERIALS`). Every
  judgement is made per material *found in the asset*, so an asset whose materials failed to load
  carries none, every judgement passes trivially, and the run reports a green over an empty set. That
  is the `an-expectation-derived-from-its-subject-cannot-fail` shape, and the manifest is what makes
  adding a material a visible two-place edit.

---

## 4. THE MUTATIONS — five, every one fired by hand against a deliberately broken build

`pnpm gate`'s `check:mutation-diff` skips `harness/**` (it sits outside any workspace project's
`src/`), so this evidence is hand-run.

| # | mutation | leg A/B (pure) | leg C (GPU) |
|---|---|---|---|
| M1 | the convention call deleted from the loader — **the exact pre-fix state** | **REFUSED** | **REFUSED** — both materials COLOUR-MANAGED |
| M2 | `RAW_COLOUR_SPACE` flipped from `''` to `'srgb'` | **REFUSED** (2 tests) | **REFUSED** |
| M3 | a new harness module importing `GLTFLoader` without the convention | **REFUSED** — names the file | not applicable (not on the page) |
| M4 | the manifest declares one material where the asset carries two | — | **REFUSED** — names both sets |
| M5 | the asset's maps silently fail to bind, so nothing is judged | — | **REFUSED** — *"no material was judged at all"* |

### ⚠ M1 AND M2 SURVIVED THE FIRST VERSION OF THE PURE LEGS, AND BOTH HOLES WERE REAL

This is the part worth reading, because in both cases the check looked rigorous and was not.

**M1 survived leg B** because the scan asked whether a module *mentioned* `applyRawColourConvention`.
Deleting the call left the **import** behind, the name was still in the file, and the scan stayed
green over the precise state it exists to refuse. **An import is not a use.** It now requires a call,
matched on a non-comment line.

**M2 survived leg A** because the test asserted `material.map.colorSpace === RAW_COLOUR_SPACE` — the
same constant the subject uses. Changing that constant moved both sides together and the test could
not fail. It is the exact shape `an-expectation-derived-from-its-subject-cannot-fail` describes,
arriving in a one-token mutation. Fixed two ways: the assertion is against the literal `''`, and a
new test pins `RAW_COLOUR_SPACE` to **three's own `THREE.NoColorSpace`** rather than to a
transcription of it — the convention is three's, not ours, so the value is captured from the library
that defines it (`capture-the-oracle-for-a-convention-you-dont-own`).

Both holes were found by running the mutations, not by reading the code. This arc has hit "an
instrument that could not fail" four times in three days; two of those four are in this table.

---

## 5. ONE THING THE PROBE HAD TO SOLVE, and it produced a wrong answer first

The first run of leg C answered `NEITHER` for the foliage: delivered rgb(72,91,71) against a raw
control of rgb(30,38,29). Both numbers were right; they were means of **different sets of texels**.

Reading a map's texels means drawing it into a 2D canvas, and `getImageData` **un-premultiplies** —
so every texel with alpha 0 comes back BLACK whatever its real colour is, while the GPU samples that
colour perfectly happily. The pine's foliage map is a cut-out leaf card, mostly transparent, so the
JavaScript mean was dragged toward black by texels the frame never showed.

The fix is to compare **only fully opaque texels**, on both sides: `alphaTest` at 254/255 discards
every texel that is not solid, and the same predicate selects the texels the source mean is taken
over. With nearest filtering at 1:1 — each swatch is rendered at its own map's resolution — the two
sets are then *exactly* equal rather than approximately. A `MIN_OPAQUE_FRACTION` floor refuses a map
too cut-out to judge.

**A partly transparent texel is also blended against whatever is behind it**, so its delivered colour
is not its own; the same cut removes that confound. The renderer is built `alpha: true,
premultipliedAlpha: false` so a discarded texel leaves a pixel the readback can tell from a solid
one, and a solid pixel's rgb is written unscaled.

---

## 6. What this does NOT do

- **It adopts nothing into `src/`.** ADR-0406 D2 and ADR-0380 D6 stand. `harness/` only.
- **It does not take the other horn of the fork.** Colour-managing the whole pipeline instead —
  §5 of the previous increment's README — is a materially larger decision reaching across
  ADR-0380 / ADR-0406 / ADR-0418, and belongs to whoever proposes it explicitly. If it is ever
  taken, `texture-convention.ts` is what has to change and this check is what will notice.
- **It is not a `pnpm gate` rung.** Leg A and leg B run in `pnpm -r test` (they are node tests). Leg
  C needs a GPU and a dev server, so it is a driver you run, like every other measurement on this
  arc.
- **It does not check assets that are not on its page.** `GUARDED_ASSETS` in
  `colour-convention-scene.ts` is what puts an asset under leg C; adding a committed asset means
  adding it there and to `ASSET_MATERIALS`.
