# Bought 3D assets on a storytree island — the pine-kit trial, 2026-08-22

**Arc:** `chapter2-island-that-looks-good-first-arc`. **Decision:** ADR-0415.
**Predecessor evidence this builds on and does not re-derive:**
`docs/research/chapter2-islanders-canopy-2026-08-22/` (the ISLANDERS grounding pass) and
`docs/research/chapter2-live-render-2026-08-19/` (the live-render experiment).

The owner bought the **Stylized Pine Forest Nature Kit** (Cratial 3D, Superhive/Blender Market,
$19.99, royalty-free) on 2026-08-22 and asked what it would take to use it. This pass answers
that by BUILDING one island out of it, entirely from a script, and rendering it at the arc's own
camera, light and delivered size — so the picture is a comparison rather than a mood board.

Everything here is the EXPERIMENT surface. Nothing is adopted into the app; adoption stays a
separate event (ADR-0380 D6, ADR-0406 D2).

---

## 0. The correction that reframes the whole arc — READ THIS FIRST

**The map has ZOOM, on both surfaces, and the arc has been reasoning as though it did not.**

Every pass since PR #1417 has priced art against a fixed delivery of ~2 device pixels per ground
unit, and has repeatedly reached the same conclusion — "at ~12 delivered px a plant IS a handful
of triangles, and nothing operating inside a twelve-pixel budget can fix that". That measurement
is correct and still stands. **What was wrong is treating it as a CEILING.**

- The live path draws under drei `MapControls` — pan, zoom, rotate
  (`packages/forest-world-r3f/src/ForestWorldCanvas.tsx`).
- The shipped studio map zooms too: `zoomAt` / `fitWorld`, and selecting a story centres and
  zooms on that territory (`apps/studio/src/components/TreeView.tsx`). The resting zoom is itself
  an owner-tuned value (`islands-sit-too-far-apart-and-the-resting-zoom-is-too-far-out`).

So ~12 px describes the **overview** zoom, which is one view among several, not the budget every
asset must survive inside. The arc's own live-render increment had already said exactly this —
*"the live path is the ONLY one where map zoom or a larger art scale buys anything at all… it
does not answer 'make a 12-px plant look good', it REMOVES the constraint that made that the only
question"* — and later passes went on applying the floor as if the constraint were still there.

**The owner corrected it on 2026-08-22, verbatim:**

> "I'm confused why you worried about size, we have zoom enabled on our forest so users can zoom
> in and see the detail, so the more detail we can do without sacrifising performance or
> accessibility the better."

**The consequence, and it is the reason this file exists:** the ceiling on detail is
**performance and accessibility**, not a delivered-pixel budget. Both of those are measurable and
both already have instruments (`harness/hardware-floor.mjs` for the first; the ADR-0380 D6 fence 1
DOM/SVG layer for the second). A future pass that re-derives the twelve-pixel argument as a reason
NOT to add detail is repeating the mistake this section exists to stop.

What survives unchanged: at the **overview** zoom, legibility comes from contrast and silhouette,
not from fidelity. Both things are true, and they are true of different zoom levels.

---

## 1. The pack, as inventoried (`inventory.py`, output in `pack-inventory.json`)

Run: `blender.exe -b "<pack>/Pine_Forest_Kit.blend" -P inventory.py`

| | |
|---|---|
| Mesh objects | **42** in three collections (`Foliage` 20, `Pine_Trees` 12, `Rocks` 10) |
| Total triangles | **33,691** for the entire library |
| Materials | 11 |
| Images | **39, all packed**, every one 2048×2048 TGA |
| Map types | BaseColor, Normal, Roughness, AO, Subsurface |
| On disk | 913 MB (365 MB `.blend` + 546 MB texture zip + three `.fbx`) |
| Blender | 3.0 – 5.0 · Cycles · UVs unwrapped, normal-mapped |
| Licence | Royalty-free: commercial use and modification fine; no resale/repackaging, no logos |

**Per-asset triangle counts — this is the finding, not a footnote:**

| Asset class | Triangles |
|---|---|
| Grass (5 variants) | 27 – 132 |
| Ferns (3) | 128 – 144 |
| Leafy plants (2) | 514 – 518 |
| Flowers (7) | 300 – 716 |
| Pine trunk (4) | 198 – 856 |
| Pine leaves (4) | 418 – 796 |
| **A whole living pine** (trunk + leaves) | **≈ 620 – 1,650** |
| Dead pines (2) | 1,450 – 1,478 |
| Leafy bushes (3) | 1,152 – 1,728 |
| Rocks (9) | 422 – 1,274 |
| Logs (2) | 764 – 770 |
| Cliff face (1) | 8,266 |

There is **no camera, no light and no ground material** in the file. One EMPTY, `Randomize Wind`.

---

## 2. What was built (`build_island.py`)

Run: `blender.exe -b "<pack>/Pine_Forest_Kit.blend" -P build_island.py -- --samples 128 --widths 487,1948`

A 22-cell hex island — the same cellular land the arc's own islands use — dressed by seeded
scatter from the kit: 13 tree stands of 4–8, plus boulders, ferns, grasses, flowers and logs.
70 trees on the `forest` composition, 373 drawn objects, all **linked duplicates** sharing mesh
data. Deterministic: one `random.Random(seed)`, no wall-clock, no `Math.random` equivalent.

**Copied from us deliberately, so the comparison means something:**

| | Value | Source |
|---|---|---|
| Camera | orthographic, **50° elevation** | `RENDER_ELEV_DEG`, `harness/IslandView.tsx` — owner-signed 2026-08-16 |
| Light | `normalize(-0.45, 0.82, 0.35)` | `LIGHT_DIRECTION`, `harness/palette-band.ts` |
| Ground aspect | 233.8 × 135.1 = 1.73 | the real island footprint |
| Tree : island width | 2.4% | the 2.9–3.6% band the ISLANDERS pass measured us at |
| Delivered width | 487 px | what `island-wild.png` actually is |

Converting the light from three.js (Y up) to Blender (Z up) is `(x, y, z) → (x, -z, y)`.

**NOT copied, on purpose:** the closed palette and the four-rung ladder. That is the point of the
exercise — this is the target, not the shippable.

The land itself (hex prisms, procedural grass, cliff-rock skirt) is **ours**, written in this
script. The kit contributes only what stands on it.

---

## 3. The colour measurement (`measure_colour.py`)

Run: `blender.exe -b -P measure_colour.py -- <abs-path.png> …` (Blender is the PNG decoder;
there is no Pillow in this environment — and note it needs ABSOLUTE paths).

Two numbers, because they fail differently. **Carrying area** = colours covering ≥ 40 px.
**Bins for 90%** = how many colours, ordered by area, cover 90% of the opaque frame — the measure
of whether a picture can shade continuously, which is what a banded palette structurally refuses.

| Image | Opaque px | Distinct | Carrying | **Bins 90%** |
|---|---:|---:|---:|---:|
| `island-today.png` (ours, shipped look) | 172,800 | 30 | 24 | **9** |
| `island-wild.png` (ours, best dressed) | 145,126 | 69 | 58 | **17** |
| ISLANDERS (the reference) † | — | — | 212 | **474** |
| `island-pine-kit-487px.png` | 70,906 | 11,040 | 205 | **3,978** |
| `island-pine-kit-1948px.png` | 1,134,241 | 48,218 | 1,606 | **5,412** |

† from the 2026-08-22 ISLANDERS pass, taken with a slightly different instrument (it read
`island-wild` at 22 where this one reads 17). Indicative, not exact. Every other row was measured
in one pass here.

**The reference is a BAND, not a direction.** We sit at 9–17; the reference sits at 474; a
straight Cycles render of bought assets sits at ~4,000, roughly 8× PAST the thing we are trying
to look like. "More detail" is therefore not the objective on its own — the render reads
photoreal, and the owner's reference does not. What the number gives us for the first time is a
target with two sides to it.

---

## 4. Findings

1. **The detail is PAINTED, not modelled — and that is the cheap direction.** A fern is 128
   triangles; it reads as a fern because a 2048px hand-painted image with alpha is wrapped onto
   it. Our renderer paints every surface one flat authored colour. So the gap the owner sees
   between our art and a commercial pack is a **texture gap**, not a geometry gap — and textures
   are precisely what the banded palette forbids. This is a much smaller problem than "our
   generated shapes are too crude", which is what it looked like from the outside.

2. **The kit is light enough to run live in a browser as-is.** 33,691 triangles for the WHOLE
   library, ~1,000 for a tree, clean pivots, `.fbx` alongside `.blend`. Blender exports glTF
   natively and three.js loads glTF natively, so the path from this pack into
   `forest-world-r3f` is ordinary work, not a research project. Combined with finding 0 (zoom is
   real), this is the first art source the arc has found that gets BETTER as the user zooms in.

3. **The kit has no ground, and the ground is most of the frame.** 42 assets, all of them things
   that stand ON land. In a top-down island the land is roughly two thirds of every picture. The
   flat green in these renders is our own procedural material and it is the weakest thing on
   screen. **A prop pack improves the minority of the view** — the land remains ours to solve,
   and on this evidence it is the higher-value target.

4. **At the OVERVIEW zoom, contrast still beats detail.** Our brown trees on green land read at
   11 px; the kit's realistic green pines on green land do not, and the 487px render is arguably
   the WORSE composition of the two despite carrying 234× the colours. Legibility at overview
   comes from separating tones. See §0: this constrains the overview, not the zoomed view.

5. **Scripted Blender is a working factory.** Every picture here was produced headless from one
   Python file — seeded, repeatable, nothing hand-placed. "Generate the art, but in a tool that
   can model and light" keeps the reproducibility the current pipeline is genuinely good at,
   rather than trading it for hand-authored scenes.

6. **Hardware, measured — and this is the first genuinely GPU-bound work the project has had.**
   Cycles enumerates **no** GPU backend on this box: CUDA, OptiX, HIP, oneAPI and Metal are all
   absent, leaving `Snapdragon(R) X 12-core X1E80100` as the only device. Blender 5.2 LTS is a
   native ARM64 build, so the 12 cores run at full speed, but Cycles is CPU-only:

   | Render | Time (Cycles CPU, 128 samples) |
   |---|---|
   | 487 × 319 | 41 s |
   | 1948 × 1277 | 4 min 45 s |

   `second-box-absorbs-the-expensive-work-arc` records that "the GPU is NOT the value" because
   nothing storytree runs is GPU-bound. **That is now out of date for this workload and only this
   one** — the gate is still `tsc` + `node:test`. Author-time rendering is the exception.

---

## 5. Traps — all four cost real time here

- ⚠ **The kit's objects live in the kit's OWN collections** (`Foliage` / `Pine_Trees` / `Rocks`),
  not in the scene root. Hiding the scene root collection misses every one of them, and they
  render lined up in a row in the middle of the island, reading as a mysterious grey blob. Hide
  each object directly; linked duplicates are separate objects and are unaffected.
- ⚠ **A generated mesh has no UV layer, and an image-texture material on a UV-less mesh samples
  texel (0,0) for every fragment.** The island skirt rendered SOLID BLACK, which reads exactly
  like a lighting or normals bug and is neither. `build_island.py` assigns UVs by hand (plan
  projection on tops, run-length × height on the skirt).
- ⚠ **One asset is named `Pine-Leaves_02`, with a hyphen where all three siblings use an
  underscore.** Pairing trunks to leaves by a naming convention silently drops one of the four
  tree types and no error is raised. `TREE_PAIRS` lists the pairs explicitly.
- ⚠ **Probing Cycles device types raises `TypeError` for unsupported backends** rather than
  returning an empty list, so the probe has to be wrapped per type or it dies on the first one.

---

## 6. What is NOT decided here

- **Whether a textured asset may enter the LIVE RENDERER.** It may not, today, and this pass does
  not change that. **ADR-0406 D3 refuses textures by name, on the experiment island too** — *"Free
  continuous shading, gradients, textures, a nearest-entry snap, or an 'ignore these pixels'
  exception in the checker are all still refused"* — and ADR-0380 D6 fence 3 requires a live render
  to stay banded to an authored palette. No fence reaches a `.blend` file, which is why this trial
  could be built; the fences bite the moment `packages/forest-world-r3f/` draws a textured asset.
  Lifting them costs `capture.mjs` its ability to REFUSE an off-palette pixel, which is our main
  automated art instrument, so it is an owner call. Authored as an open question on the arc —
  `oq-may-a-textured-3d-asset-be-drawn-by-our-own-forest-render`, which carries four costed options —
  and settled by ADR-0415 D5 in the meantime: textured assets stay in Blender.
- **Adoption.** Nothing reaches the app. ADR-0380 D6 and ADR-0406 D2 keep experiment and adoption
  separate, and this is the first of the two.
- **How status is carried once colour is freed.** The owner's direction is to establish the look
  first and layer the meaning on afterwards. Until that layer is designed, ADR-0392 D5 /
  ADR-0398 D7 still hold: an art change does not get to decide what the map asserts.
- **The shipped map's palette.** Untouched, and out of scope for this pass.
- **Which composition.** Three were rendered; none is a pick. ADR-0392 D1 reserves one owner look
  on whole islands, and this pass did not spend it.
