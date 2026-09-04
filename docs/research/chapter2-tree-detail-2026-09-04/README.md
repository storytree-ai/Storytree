# The trees' detail — the kit's texture rung, and how a crown is lit (2026-09-04)

The increment: `trees-carry-the-kits-detail-texture-rung-and-crown-lighting` on
`land-ground-stack-arc`. The owner, 2026-09-03, on the canopy sheet
(`chapter2-ground-canopy-2026-09-03/sheet-8px.png`) beside the render he stamped: *"this looks
nice, but the trees dont seem to have as much detail as our target image."* Two mechanisms were
named before anyone measured: the embedded kit shipped ONE texture rung, 128 texels; and every
crown is lit by the ground's derived lights, ambient at the ladder floor. The texture half was
DECIDED the same morning (**ADR-0508 D1**, native maps); the lighting half is a LOOK, rendered as
a ladder under **ADR-0503 D3** and shipped bold under D1.

> ⚠ Every figure here was taken on this run, on the arc's named box (ADR-0505 D3): **NVIDIA
> GeForce RTX 2060** (ANGLE / OpenGL 4.5), `--use-gl=angle`, `software=false`, exact-colour mode,
> lights calibrated by the map's own probe (a lit white face delivered 0.3176 at the authored
> intensities; scale 3.1481; ladder floor **0.80**). Nothing is inherited from an increment row,
> an arc intent or an earlier sheet. A development run on the laptop's Adreno X1-85
> (`ST_DETAIL_ANGLE=default`) agreed to within a few pixels on every count and is not quoted.

## The finding first — the trees read flat because of how they are LIT, not because of their texels

Six arms over the **same** dressed ground (the canopy page's own builder for the shipped grove arm,
with the grove's shadows in the field, so the only pixels that differ between arms are the props'):

| one island @ 8 px/unit | unlit face | px moved >20/255 vs today | prop luma p10 / p50 / p90 | spread | MICRO | families | largest |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `bare` (the mask, nothing standing) | — | 106,365 | — | — | 0.66 | 41 | 8.0% |
| **`texture-128` — TODAY** (control) | 80% | 0 | 73 / 81 / 88 | 15 | 1.81 | 43 | 7.1% |
| `texture-native` — ADR-0508 D1 alone | 80% | **103** | 73 / 81 / 88 | 15 | 1.86 | 43 | 7.8% |
| `crown-60` | 60% | 1,810 | 64 / 79 / 87 | 23 | 2.12 | 46 | 5.8% |
| `crown-45` | 45% | 13,275 | 58 / 78 / 88 | 30 | 2.35 | 47 | 4.9% |
| **`crown-30` — SHIPPED** | **30%** | **28,781** | **51 / 76 / 88** | **37** | **2.61** | 47 | 4.9% |
| the approved render (Cycles) | | | | | 2.54 | 36 | 5.2% |

- **The native maps changed 103 pixels on an island of 165,000 prop pixels, and left the prop
  luma distribution exactly where it was.** A grove pine stands 18 × 0.55–0.80 units and the
  shipped view is a 45° elevation, so at 8 px/unit a crown is about 56–81 px tall; a needle card's
  share of the 128-texel atlas was already near one texel per delivered pixel, and what 2048
  texels add at this zoom is a crisper alpha-tested edge, which a 20/255 rule can barely see. The
  owner's reason for native was ZOOM (ADR-0508: *"we have zoom enabled on our map"*) and that
  reason stands; it is simply not where the missing detail went.
- **The lighting ladder is where it went.** Every prop received the ground's 80:20 ambient-to-key
  split, so an unlit needle sat at 80% of a lit one and all of Cycles' self-shadowing had a fifth
  of the range to happen in. Lowering the unlit face to 30% of the lit one widens the prop luma
  spread from 15 to 37 and lifts MICRO from 1.81 to **2.61, past the approved render's 2.54** —
  the first arm on this arc to reach the reference's micro-contrast — while the largest colour
  family falls from 7.1% to 4.9% (approved 5.2%).
- The rung-to-rung step is deliberately below the visibility bar per pixel (`vs-leaner>20` is
  882 / 1 / 2 px) while the cumulative move is far above it: the ladder is smooth, and "scale it
  back" one rung is a change the eye reads as tone, not as a different picture.

## What ships (`src/`)

1. **The kit at its native 2048-texel maps** (ADR-0508 D1). `export-dressing.py` now emits native
   by default and takes a rung only for a comparison arm; the 128 export is kept as
   `harness/assets/dressing-kit-128.glb` for exactly the control arm here (it reproduces
   byte-for-byte from this box's Blender 5.2.0 — sha256 `6aaab1fa…`, the committed file's own).
   `build-kit-asset.mjs` measures its brotli figures at every regeneration rather than carrying a
   transcription.
2. **`src/prop-lighting.ts` — a prop's ambient-to-key split as a property of its MATERIAL.** The
   fragment shader, patched at `#include <lights_fragment_end>`, rescales what the calibrated
   ambient and key delivered so that a lit white face still lands on the ladder's top rung (the
   calibration's invariant) while an unlit face lands at `fraction` instead of the floor. At the
   floor both scales are exactly one. Installed by `prepareKitMaterial` and re-installed on every
   tinted clone — `Material.clone()` copies neither `onBeforeCompile` nor the program cache key,
   and a capability's state-tinted crown lit differently from a grove pine is the one thing this
   surface may never draw. **The shipped fraction is 0.30**, `KIT_PROP_INDIRECT_FRACTION`.
3. **What did NOT change, on purpose.** The scene lights, the shade ladder and every committed
   figure about the GROUND: the `bare` arm is the canopy page's shipped ground byte for byte
   (the driver refuses any arm whose ground triangles differ from the control's). And the state
   vocabulary: a lit face lands on the top rung at every fraction, so a tinted crown's lit colour
   — what `leaf-tint.ts` predicts and the delivered-pixel guards read — is exactly what it was.

## The pick — `crown-30`, the boldest rung, per ADR-0503 D1/D3

`sheet-8px.png` is the ladder beside the approved render; `crop-8px.png` the same five arms at a
stand, 560×300 at 2×, with `crop-reference.png` the same-sized crop of the approved render. At the
floor the crowns are flat silhouettes; at 30% they carry dark cores under lit tips, which is what
the reference's pines do. **ADR-0507 D5's opening-view fence passes on every rung**
(`sheet-forest-fit.png`): the largest colour family at the fitted forest is 7.7% on all five
dressed arms, the islands stay clean green blocks, and the canopy simply reads darker (mean prop
luma 79 → 64 at fit). A scale-back is one constant, to a rung already on the sheet.

## The payload — ADR-0508 D1's "as long as the browser can handle it", measured

| kit | wire (`.glb`) | brotli q11 | base64 in `kit-asset.ts` | base64 + brotli | decoded on the GPU (mips) | textures | fetch + parse |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 128 texels (until this landing) | 162,748 B | 110,487 B | 217,000 B | 124,438 B | 786,429 B | 9 × 128² | 39 ms |
| **native 2048 texels (ships)** | **1,715,496 B** | 1,647,262 B | 2,287,328 B | **1,661,335 B** | **201,326,589 B** | 9 × 2048² | **387 ms** |

- **Over the wire: ×13.4** (the order of magnitude ADR-0508's consequences named). Brotli buys
  almost nothing on webp bytes, so the base64 tax the embedding pays is now the 0.9% brotli
  recovers of base64's own 33% — the embedded module costs 1.66 MB where the raw file would cost
  1.65 MB. The route that drops it (teaching `sync:web-engine` to carry binary assets) is written
  up in `build-kit-asset.mjs` and not taken.
- **On the GPU: 201 MB of texture memory** — nine 2048² RGBA8 textures with their mip chains
  (`textureGpuBytes`). That is the number a "decent hardware" bar actually bites on: a discrete
  desktop GPU does not notice it; an integrated or mobile part might. The remedy, if a real visitor
  ever cannot hold the map, is GPU texture compression (KTX2/Basis, ~4–8× smaller in VRAM), which
  `chapter2-textured-asset-2026-08-28/` priced (a 262 KB transcoder) and did not adopt — a later
  decision, not this row's, and ADR-0508 already names the export rung as the first scale-back.
- **Fetch + parse: 39 → 387 ms** on the RTX box (89 → 602 ms on the Adreno laptop) — the kit half
  of the canvas's mount cost. The placement and ground-build half (1,680 ms for the shipped grove
  rung, canopy README) is untouched by this row.
- The metallic-roughness texture serves both `roughnessMap` and `metalnessMap`; `materialTextures`
  keys textures by uuid, so it is counted once and the data-slot list reads `metalnessMap,normalMap`.

## Frame cost — the RTX 2060 (`frame-cost.txt`, `shipped-detail-cost.mjs`)

Five dressed arms × five interleaved repeats × 20 frames per GPU query, two independent runs
diffed row by row by `run-agreement.ts`. The whole 35-island forest, fitted.

| arm | draw calls | triangles | ms/frame | vs today | % of a 60 Hz frame |
| --- | --- | --- | --- | --- | --- |
| `texture-128` (today) | 7 | 2,440,708 | 1.1508 | — | 6.9% |
| `texture-native` | 7 | 2,440,708 | 1.1535 | +0.0027 | 6.9% |
| `crown-60` | 7 | 2,440,708 | 1.1477 | −0.0030 | 6.9% |
| `crown-45` | 7 | 2,440,708 | 1.1634 | +0.0127 | 7.0% |
| **`crown-30`** | 7 | 2,440,708 | **1.1641** | **+0.0133** | **7.0%** |

Every row reproduced across both runs. Neither the texture rung nor the lighting fraction moves the
frame: the differences are inside the runs' own spread (0.03–0.04 ms). The shipped picture draws
the dressed map in 1.16 ms.

## Named gaps

- **The pack's AO maps never reach the export.** `Pine_Branches_AO.tga`, `Pine_Forest_Foliage_AO`
  and `Pine_Trunks_AO` are in the `.blend` and are not wired to a socket the glTF exporter carries,
  so the kit ships base colour, normal and metallic-roughness only. The between-branch darkening
  Cycles shows is partly ambient occlusion; a wired or baked AO map is the next lever on the crown
  after this one, and it is a re-export, not a shader change.
- The trunk's brown mass at each tree's base (the canopy README's gap) is unchanged — bought
  geometry, lit at the same split as the crown.
- The per-arm "prop" statistics are over EVERY pixel that differs from `bare` — crowns, trunks and
  the criterion flowers — because the mask has no way to tell them apart. "Crown" in the tables is
  shorthand for "prop".
- The kit is parsed once per rung on the comparison page (the fraction is a property of the
  materials the merged meshes share); the shipped canvas parses it once.

## Delivered size, for the record

| view | px/unit | a grove pine (18 × 0.55–0.80 units at 45°) | a capability pine (18 units) |
| --- | --- | --- | --- |
| one island @ 8 | 8.000 | 56–81 px tall | 102 px |
| one island fitted | 8.158 | 57–83 px | 104 px |
| the forest fitted | 0.573 | 4.0–5.8 px | 7.3 px |

## Files

`report.txt` · `measurements.json` · `payload.json` · `frame-cost.txt` · `frame-cost.json` ·
24 frames `<arm>-<one|forest>-<8|fit>.png` (2560×1600) · `sheet-8px.png` · `crop-8px.png` ·
`crop-reference.png` · `sheet-forest-fit.png`.

Reproduce (the RTX box): `pnpm --filter @storytree/forest-world-r3f exec vite harness --port <p>
--strictPort --host 127.0.0.1`, then `DISPLAY=:0 ST_DETAIL_URL=http://127.0.0.1:<p>/shipped-detail.html
pnpm --filter @storytree/forest-world-r3f measure-shipped-detail` and `… measure-detail-cost`.
Sheets: `harness/contact-sheet.mjs` / `harness/crop-sheet.mjs`.
