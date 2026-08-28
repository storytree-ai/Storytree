# The first textured asset this project has ever drawn — and what it costs

**Increment:** `first-textured-asset-in-the-live-renderer` on `adopt-the-land-into-the-shipped-map-arc`.
**Date:** 2026-08-28. **Measured on:** `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2,
OpenGL 4.5.0)`, read out of the live context, GPU clock via `EXT_disjoint_timer_query_webgl2`.
**Integrity:** `SOUND` — every row kept 7 of 7 samples, none disjoint.

Reproduce: `pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5207`, then
`DISPLAY=:0 ST_PINE_URL=http://localhost:5207/pine.html pnpm --filter @storytree/forest-world-r3f measure-pine`.
Raw report: [`pine-measure.json`](pine-measure.json).

---

## 0. The correction that resizes the increment

Two increments on this arc describe drawing a textured asset as the cheap first probe. **It was
not.** Established by direct search before any work: `packages/forest-world-r3f/` had **no
model- or texture-loading path at all** — no `GLTFLoader`, no `useGLTF`, no `.glb`/`.gltf`, no
`TextureLoader`, no `KTX2Loader`, no `DRACOLoader`, and no `three-stdlib` / `meshoptimizer` /
`draco3d` in any `package.json` in the workspace. `@react-three/drei` is present but only its
instancing and camera exports are used. Every mesh in the package is hand-authored procedural
buffer geometry wearing `createBandedMaterial`. ADR-0418 D1's "textured, sculpted 3D assets, drawn
live" had never been drawn once.

It is now. The good news is that the capability turned out to be **self-contained and free of new
dependencies** — see §3.

---

## 1. The picture (the comparison the arc's standing instruction asks for)

Four arms, at two zooms, in one run, on one instrument, differing in exactly one thing each:

| picture | what it is |
|---|---|
| `pine-bare-{2,8}px.png` | the ground alone — the control every cost is stated against |
| `pine-procedural-{2,8}px.png` | nine of the island's **own grown trees**, the renderer the product has today |
| `pine-gltf-untextured-{2,8}px.png` | nine **bought pines with every map stripped** — the texture check's control |
| `pine-gltf-{2,8}px.png` | nine **bought, textured pines** |

Same nine ground points, same world height (30 units), same camera at 50°, same orthographic
projection, same light direction, same buffer, same run. The bought pine is a recognisable conifer
with needle silhouette and bark; the grown tree is a smooth banded blob. That difference is the
whole argument for ADR-0418's direction and it is now visible rather than asserted.

⚠ The pictures are `toDataURL` off the renderer's own preserved drawing buffer, **not** element
screenshots — an element screenshot composites the page background in opaque and has confounded
two evidence pictures on this arc already.

---

## 2. THE DELIVERED PAYLOAD — the number ADR-0418 took on without one

ADR-0418's Consequences: *"The kit's source textures are **546 MB** of TGA (39 maps at 2048²); what
a web-delivered, compressed, atlased subset costs is not known. **This must be measured before
adoption.**"*

### 2a. Three source figures, and ADR-0418 quotes the wrong one

| what | bytes |
|---|---:|
| `Textures_Pine_Forest_Kit.zip` as shipped | **572,371,903** (546 MiB) |
| unpacked, all three resolutions (196 files, 1024 / 2048 / 4096) | **2,972,764,128** (2.76 GiB) |
| the 2048² set the `.blend` actually packs (39 maps) | **377,501,364** (360 MiB) |

ADR-0418's "546 MB of TGA (39 maps at 2048²)" is the **zip's** size attached to the **2048² set's**
description. The two differ by 1.5x and the fully-unpacked figure is 5.4x the quoted one. The
decision does not turn on it, so this is a correct-in-place note rather than a re-decision.

### 2b. The answer

**One dressed pine, exported as glTF with its maps, WebP q90 at 512²: 185,304 bytes raw,
174,052 bytes brotli.** That is the committed asset, `harness/assets/pine-01.glb`.

**The whole 42-object kit — every object, all 9 materials, all 25 distinct maps, one file:
1,667,324 bytes raw, 1,234,506 bytes brotli.** So a fully dressed island's props cost about
**1.2 MB over the wire, once** — against 360 MB of source. A 306x reduction.

⚠ **And the payload does not scale with the number of props.** Nine trees on the island are nine
instances of one asset: same bytes as one. What the payload scales with is the number of DISTINCT
assets in the kit, which is why the whole-kit figure is the one to plan against and the per-tree
figure is nearly irrelevant.

### 2c. The full ladder (from `export-matrix.py`, all reproducible)

| arm | wire B | brotli B | VRAM B (mipped) | decode expansion |
|---|---:|---:|---:|---:|
| pine-png-2048 | 17,181,584 | 17,154,827 | 134,217,728 | 7.8x |
| pine-webp90-2048 | 1,226,848 | 1,208,698 | 134,217,728 | 111.0x |
| pine-webp75-2048 | 645,004 | 628,993 | 134,217,728 | 213.4x |
| pine-png-1024 | 4,638,108 | 4,638,124 | 33,554,432 | 7.2x |
| pine-webp90-1024 | 444,120 | 432,387 | 33,554,432 | 77.6x |
| pine-webp75-1024 | 254,432 | 242,930 | 33,554,432 | 138.1x |
| pine-png-512 | 1,391,968 | 1,379,341 | 8,388,608 | 6.1x |
| **pine-webp90-512 (committed)** | **185,304** | **174,052** | **8,388,608** | **48.2x** |
| pine-webp75-512 | 116,956 | 105,640 | 8,388,608 | 79.4x |
| pine-png-256 | 439,440 | 427,556 | 2,097,152 | 4.9x |
| pine-webp90-256 | 87,456 | 76,210 | 2,097,152 | 27.5x |
| pine-webp75-256 | 62,820 | 51,586 | 2,097,152 | 40.7x |
| pine-png-128 | 150,532 | 138,604 | 524,288 | 3.8x |
| pine-webp90-128 | 50,044 | 38,838 | 524,288 | 13.5x |
| pine-webp75-128 | 41,340 | 30,049 | 524,288 | 17.4x |
| trees-webp90-256 (12 objects) | 356,756 | 231,032 | 3,495,253 | 15.1x |
| **kit-webp90-512 (all 42)** | **1,667,324** | **1,234,506** | **34,952,533** | **28.3x** |
| kit-webp90-256 (all 42) | 1,274,744 | 854,286 | 8,738,133 | 10.2x |

⚠ **PNG is what an unconsidered export delivers, and it is a disaster at every rung** — 7 to 12x
WebP for identical pixels. `export_image_format='AUTO'` is Blender's default. This row exists to
make that number impossible to hit by accident.

⚠ **The VRAM column is the half the wire figure does not answer**, and ADR-0380 D4's own correction
note carves out exactly this case: *"where a byte budget is uncompressed (a GPU texture, an atlas
held in VRAM) the square law still applies."* A WebP is an excellent wire format and **no
compression at all in video memory** — the committed asset is 48x bigger on the GPU than on the
wire. The whole kit at 512² needs **35 MB of VRAM**, which is why KTX2 is not needed yet (§3c).

### 2d. Is 512² the right rung? Read off the frame, not off taste

The delivered extent of ONE tree, measured from the frame (the bounding box of pixels that differ
from the bare-ground arm), not derived:

| zoom | delivered extent | texels per delivered pixel | sufficient rung | verdict |
|---|---:|---:|---|---|
| 2 px/ground unit | 43 px | 11.9 | 128² | **WASTEFUL** |
| 8 px/ground unit | 173 px | 3.0 | 256² | **HEADROOM** |

Read honestly: **the committed asset is one rung high at the zoomed view and two rungs high at the
overview.** It is committed anyway because the zoomed view is what the detail exists for and one
asset cannot sit at two rungs at once. What removes the compromise is an LOD or mip-level split,
which is a later increment. Dropping to 256² would take one tree from 174,052 B to 76,210 B and the
whole kit from 1,234,506 B to 854,286 B.

---

## 3. The compression route chosen, and the routes rejected

**CHOSEN: glTF binary (`.glb`) with WebP textures via `EXT_texture_webp`, decoded natively by the
browser, loaded by `three`'s own `GLTFLoader`. NEW DEPENDENCY BYTES: ZERO.**

`three@0.185.1` already ships `GLTFLoader` at `three/examples/jsm/loaders/GLTFLoader.js` with the
`EXT_texture_webp` hooks wired in, and every browser this project targets decodes WebP natively. So
the entire loading path adds nothing to what a visitor downloads beyond the asset itself. That is
the smallest possible total, and it decided the route.

The decoders were measured off this checkout's `node_modules`, gzipped as a host would send them:

| route | client cost, gzipped |
|---|---:|
| WebP in glTF (chosen) | **0** |
| meshopt (`meshopt_decoder.module.js`) | 7,804 |
| Draco (`draco_decoder.wasm` + `draco_wasm_wrapper.js`) | 100,330 |
| KTX2/Basis (`basis_transcoder.wasm` + `.js`) | 262,678 |

### 3a. REJECTED — Draco, on one asset. Measured, and the sign is the point.

| arm | baseline brotli | compressed brotli | saved | decoder | net |
|---|---:|---:|---:|---:|---:|
| pine + draco | 174,052 | 162,708 | 11,344 | 100,330 | **−88,986** |
| pine + meshopt | 174,052 | 162,619 | 11,433 | 7,804 | +3,629 |
| kit + draco | 1,234,506 | 788,034 | 446,472 | 100,330 | +346,142 |
| kit + meshopt | 1,234,506 | 798,545 | 435,961 | 7,804 | **+428,157** |

**A mesh compressor is a dependency with a delivered size**, so the question is never "does it
compress" but whether the saving on the assets you ship exceeds the decoder you ship to read them.
For one pine, the ENTIRE geometry payload is 25,770 bytes — smaller than any decoder that would
read it. **At kit scale the answer inverts**, and `meshopt` beats Draco on net despite compressing
less, because its decoder is 12.9x smaller.

**So: not adopted now, and the trigger for revisiting it is named.** When the shipped map carries
the whole kit rather than one asset, meshopt is worth ~428 KB. `@gltf-transform/cli@4.4.2` was run
from `/tmp` via `npx` to produce these numbers and deliberately **not** installed into the
workspace — measuring an alternative is not adopting its toolchain.

### 3b. REJECTED — KTX2 / Basis, on two grounds, one of which is a real limitation

1. **It costs 262,678 gzipped bytes of transcoder**, 1.5x the whole committed asset, for a win that
   is in **video memory** rather than on the wire (ETC1S is comparable to WebP over the wire). The
   whole kit needs 35 MB of VRAM at 512², which is not a problem worth 263 KB to solve.
2. ⚠ **It could not be measured here at all.** `@gltf-transform/cli`'s `etc1s`/`uastc` commands
   shell out to the KTX-Software `ktx` binary, which is not installed on this box:
   `error: Command failed: command -v ktx`. So the KTX2 wire figure in this report is **absent, not
   estimated**. If KTX2 is ever revisited, installing that native toolchain is step one, and the
   claim above about ETC1S being wire-comparable should be measured rather than inherited.

### 3c. REJECTED — JPEG. The foliage's alpha lives in the base-colour map's alpha channel; JPEG has
no alpha, so the leaf cut-outs would be lost entirely. WebP carries alpha and is smaller anyway.

---

## 4. THE FRAME COST, on the GPU's own clock

PR #1683 established that this project's previous frame instrument was wrong by 30–250x because it
timed work **submission** rather than GPU **execution**. This uses the new one:
`EXT_disjoint_timer_query_webgl2`, available on this box and nowhere else in this project.
1440×960, ground filling 100% of the frame, 8 configurations × 7 interleaved repeats, 20 renders per
timed batch, disjoint samples discarded rather than averaged in.

**2 px per ground unit (the overview):**

| arm | median ms | spread | % of a 60 Hz frame | over bare ground |
|---|---:|---:|---:|---|
| bare | 0.025 | 0.001 | 0.15% | the control |
| procedural (9 grown trees) | 0.029 | 0.001 | 0.17% | +0.004 ms (1.18x) |
| gltf-untextured (9 bought pines, maps stripped) | 0.029 | 0.001 | 0.17% | +0.004 ms (1.16x) |
| **gltf (9 bought, textured pines)** | **0.035** | 0.001 | **0.21%** | **+0.010 ms (1.42x)** |

**8 px per ground unit (the zoomed view):**

| arm | median ms | spread | % of a 60 Hz frame | over bare ground |
|---|---:|---:|---:|---|
| bare | 0.025 | 0.001 | 0.15% | the control |
| procedural (9 grown trees) | 0.047 | 0.000 | 0.28% | +0.022 ms (1.88x) |
| gltf-untextured | 0.040 | 0.000 | 0.24% | +0.015 ms (1.60x) |
| **gltf** | **0.067** | 0.000 | **0.40%** | **+0.042 ms (2.69x)** |

**Verdict: PASS at both zooms.** Nine textured pines cost **four tenths of one percent of a 60 Hz
frame**. The direction is not remotely constrained by frame cost at this scale.

**And the untextured arm separates the two terms, which nothing else here can do.** At 8 px/unit
the bought geometry costs +0.015 ms and the TEXTURE costs a further +0.027 ms — so **64% of the
textured pine's cost is the texture**, not the mesh. It is also the arm that says the bought pine's
GEOMETRY is *cheaper* than the grown tree's (7,022 triangles against 9,848 for nine trees; 0.040 ms
against 0.047).

⚠ Draw calls are held **equal across all three tree arms** (3 each: ground + two materials). The
glTF pines are drawn as one `InstancedMesh` per primitive, the grown trees as one merged mesh per
authored token — both independent of the tree count. This matters because `hardware-floor.mjs`
measured this renderer **draw-call bound**, so an arm quietly issuing more calls would be measured
as dearer for a reason unrelated to being textured.

---

## 5. THE FINDING NOBODY WOULD HAVE PREDICTED: this renderer is not colour-managed, and a PBR asset
dropped into it comes out 3.5x dark

The first live render delivered foliage at **rgb(15,26,15)** against a base-colour map whose own
mean is **rgb(70,90,69)**. It looked like a deliberate, moody art choice. It was not a lighting
error at all: `srgb_to_linear(70,90,69) = (14.7, 25.4, 14.3)`.

**The mechanism.** `configureExactColour` sets `outputColorSpace = LinearSRGBColorSpace` and
`ColorManagement.enabled = false` so that an authored token like `#8cb85e` survives the round trip
byte-for-byte — the whole basis of the palette-closure claim this arc rests on. But `ColorManagement.enabled`
governs `Color` values, **not texture transfer functions**: `GLTFLoader` marks a base-colour map
`SRGBColorSpace` and three decodes it in the shader regardless. The lighting then runs in linear and
nothing ever encodes the result back out.

**The fix, and it is a convention rather than a correction.** The base-colour map is sampled **raw**
(`colorSpace = NoColorSpace`), which puts the bought asset in the same convention as everything else
on this surface: `createBandedMaterial` also does its half-lambert on authored sRGB numbers and
writes them raw. Data maps (normal, roughness) are already linear and are left alone. After the fix
the foliage delivers **rgb(62,87,67)** against its own map's rgb(70,90,69) — inside the ladder's
own 0.78–1.00 range, by construction.

**⚠ THIS IS A REAL ADOPTION HAZARD, not a harness quirk.** Any textured asset dropped onto this
renderer will come out dark and look intentional. It is silent, it is plausible, and it would very
easily be mistaken for the art. Anyone adopting textured assets into `src/` must decide the colour
convention deliberately — either put the assets in the land's raw-sRGB convention as here, or
colour-manage the whole pipeline and re-derive the palette-closure claim.

### 5a. The lights are calibrated against the land's own ladder, at runtime, not dialled

`MeshStandardMaterial` needs lights; `createBandedMaterial` ignores them. Rather than pick
intensities by eye — which `hardware-floor.mjs`'s own history records as the way an instrument stops
being one — `calibrateLights()` renders a white, fully rough, fully lit standard face in the same
context, reads it back, and scales the intensities until it delivers **exactly the banded ladder's
top rung**. Measured: the probe delivered 0.3176, scale ×3.148. A lit pine face then delivers its
base colour at `SHADE_LEVELS`'s top (1.00) and an unlit one at its floor (0.78) — the same range the
land beside it is quantised into.

---

## 6. What the run refuses, and the mutations that prove it can

Every refusal below was **fired by hand** against a deliberately broken build. `pnpm gate`'s
`check:mutation-diff` skips `harness/**` (it sits outside any workspace project's `src/`), so this
evidence is hand-run, not produced by the gate.

| # | mutation | result |
|---|---|---|
| M1 | `EXPECTED_DRAW_CALLS.gltf` changed 3 → 2 | **REFUSED** — *"gltf@2px submitted 3 draw calls; EXPECTED_DRAW_CALLS says 2"* |
| M2 | every map stripped off the loaded asset | **SURVIVED**, then fixed, then **REFUSED** — see below |
| M3 | the ground given a light-sensitive material | **REFUSED** — *"the scene lights changed 1,158,903 pixels of the BANDED arm"* |

### ⚠ M2 IS THE ONE WORTH READING. IT SURVIVED, AND THAT IS WHY THERE IS A FOURTH ARM.

The first version of the "did it actually draw textured?" check compared the glTF arm's delivered
distinct-colour count against the **procedural** arm's. Stripping every map and re-running was
supposed to refuse. **It passed** — 48 distinct colours against the banded arm's 5 — because a
`MeshStandardMaterial` shading curved geometry delivers a smooth gradient whether or not it carries
a texture. The check was measuring **continuous shading**, not texturing, and would have gone green
for an asset whose maps silently failed to bind: the cheapest possible way to pass a frame-cost
measurement.

The remedy is the house pattern: **read the bar off a control in the same run**. The same asset with
its maps stripped is now an arm (`gltf-untextured`), and the textured arm must deliver at least
double ITS colour count. Re-run with the mutation: `textured 48 · same asset unmapped 48` →
**REFUSED**. Clean run: `textured 1695 · same asset unmapped 57 · banded 5`.

The control's material is stripped of maps AND of `alphaTest`, because the foliage's alpha lives in
the base-colour map's alpha channel — without that the control would draw solid quads, a different
silhouette and a different fragment count, and would be comparing two things at once.

### The other refusals, not separately mutated

- **software rasteriser** — `DISPLAY=:0` omitted, or `--use-gl=egl`, both of which fall back to
  SwiftShader silently. Every figure here is a frame time, so a software run is no verdict.
- **`EXT_disjoint_timer_query_webgl2` absent** — falling back to the wall-clock route is not an
  option after PR #1683.
- **the pinned default port 5184** — every worktree shares it, so a sibling's server would be
  measured and reported as ours. The page's own `<title>` is checked too.
- **a non-interleaved sweep plan** — grouping repeats by configuration aliases GPU drift onto the
  variable.
- **an arm that drew nothing** the bare ground did not — an absent arm is not a cheap one.
- **ground covering < 99% of the frame** — a partly-covered frame under-reports every per-frame cost
  by exactly the uncovered fraction, and nothing in the report would say so. (This one fired for
  real during development at 12.8%, which is why `GROUND_SPAN` is sized by the frame rather than by
  the trees.)
- **a page that logged any console error, or any HTTP ≥ 400.**

---

## 7. What was committed, and what was not

**Committed:** `packages/forest-world-r3f/harness/assets/pine-01.glb` — **185,304 bytes**, one
tree, six 512² WebP maps, sha256 `652957342af29dd7e248c2d7b6a65af7a3321555f193b2feb48e26311df932a6`.
Derived output from a purchased, royalty-free kit (ADR-0380 D5 / ADR-0280 D2a: the tool may be
heavy, the output is committed locally, no vendor call or credential enters runtime, build or
deploy). ADR-0418's licence note stands: derived output is fine, redistributing the kit is not.

**NOT committed, and it must never be:** the kit itself. `Pine_Forest_Kit.blend` is 382 MB,
`Textures_Pine_Forest_Kit.zip` is 546 MiB. They live at
`~/assets/superhive/Stylized Pine Forest Nature Kit/` on the owner's box.

**How to regenerate:** `export-matrix.py` (the per-arm ladder) and `export-kit.py` (whole-kit arms),
both run headless — `~/.local/bin/blender -b "<kit>/Pine_Forest_Kit.blend" --python export-matrix.py
-- /tmp/out "Pine_Trunk_01,Pine_Leaves_01"`. `glbinfo.mjs` reads a `.glb`'s structure;
`sizes.mjs` computes raw/brotli/gzip over a directory.

⚠ **A committed picture of textured land is one renderer's picture**, exactly as
`grain-picture-is-renderer-specific` records for the grain: 24.5% of grained pixels differ between
SwiftShader and this RTX 2060. Do not build a pixel-baseline regression check over these PNGs.

---

## 8. What this does NOT do

- **It adopts nothing into `src/`.** ADR-0406 D2 and ADR-0380 D6 stand in full. This is
  `harness/` only, and the increment's fence said so.
- **It is not on `island.html` or `directions.html`.** `capture.mjs` refuses an off-palette pixel
  and a textured asset is off-palette by construction, so this has a page of its own —
  `harness/pine.html` — for exactly the reason `harness/grain.html` does.
- **It does not touch the land.** ADR-0418's own Consequences already name the land as the highest
  value unsolved thing; the kit ships 42 objects that all stand ON land and no ground material at
  all. Nothing here changes that.
- **It says nothing about how a capability's STATE is carried.** ADR-0392 D5 / ADR-0398 D7 /
  ADR-0461 hold: a bought pine is decoration on the experiment surface, and ADR-0414 D1 bans
  decorative objects on the shipped map. Putting a textured pine on the product map is not licensed
  by anything here.

## 9. The open questions this leaves

1. **One asset cannot sit at two texture rungs.** 512² is one rung high zoomed and two rungs high at
   the overview. An LOD or mip-level split is the answer and is not built.
2. **meshopt at kit scale is worth ~428 KB** and is not adopted. The trigger is named in §3a.
3. **The KTX2 wire figure is absent, not estimated** — it needs the KTX-Software `ktx` binary.
4. **The colour-convention hazard in §5 is unfenced.** Nothing mechanically stops a future textured
   asset being dropped in and rendering dark. That check does not exist.
