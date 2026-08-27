# The shipped forest map meets ADR-0380 D6 fence 4

**2026-08-28 · increment `the-shipped-canvas-meets-the-isometric-fence` on
`adopt-the-land-into-the-shipped-map-arc` · NVIDIA GeForce RTX 2060 via ANGLE/OpenGL 4.5, headless
Chromium, `DISPLAY=:0`**

## The answer

The shipped canvas drew through a **perspective camera under a rotate-capable orbit control**.
ADR-0380 D6 fence 4 licenses none of the three. It does now draw through an **orthographic camera
with rotation disabled**, and **pan and zoom are untouched**.

| | BEFORE | AFTER |
|---|---|---|
| projection, read off the uploaded matrix | `perspective` | `orthographic` |
| delivered px/ground-unit across one island | a **range** | **one number** |
| near/far spread, mesh island (900x560) | 1.6462 → 1.5398 = **6.91%** | 1.6428 → 1.6428 = **0.00%** |
| near/far spread, classic control (1900x1200) | 3.9145 → 3.7235 = **5.13%** | 3.9395 → 3.9395 = **0.00%** |
| free rotation | enabled | `enableRotate={false}` |
| zoom | wheel / pinch | **unchanged** |
| pan | left drag | **unchanged** |
| draw calls, triangles | 3 / 1784 | 3 / 1784 — identical |

**The framing was deliberately preserved, so the pictures compare projections and nothing else.**
On the widest mount the delivered scale is 3.9395 px/unit before and 3.9395 after — identical to
four decimals; the others move by under 0.5%. The island lands at the same size in the same place,
and the only thing that changes is whether its near edge is drawn bigger than its far one.

## Was it live?

**No — and it is worth stating precisely, because "live user-visible defect" and "dormant spike"
are different reports.** The `web/` submodule was checked out and swept: nothing in `apps/`, and
nothing in `web/`, mounts `<ForestWorldCanvas>`. The public site imports exactly one thing from the
synced engine — `act2-director`, a pure zod state machine with no WebGL context. So this was a
**dormant compliance defect**: the spike authored the camera, ADR-0380 later fenced the projection,
and nobody reconciled the two.

That cuts both ways, and the second way is the one that decided the remedy. Nothing depends on the
perspective, so there was no case for asking the owner to move a fence he set deliberately. The
increment's own body named that fork — *"if the perspective is load-bearing for the site's Act 2,
say so with evidence and route it to him"* — and the evidence points the other way.

## Why this blocks the land work rather than sitting beside it

Every component of the treatment this arc is carrying in — relief, coast, skirt, the grain octave —
is authored against a **fixed light direction**. `harness/palette-band.ts` carries the fence in its
own comment: *"A live land is still a 2.5D isometric picture (ADR-0380 D6 fence 4: the projection
does not move), so this is a fixed authored direction rather than a scene-graph light a camera could
swing around."* Under a rotatable camera the banded shading slides across static geometry as the
view moves — the exact defect that comment exists to prevent. So this is a **precondition of the
promotion**, not a tidy-up.

## The pictures

Same island, same fixture, same GPU, minutes apart. Cropped to the island and scaled, because at
full frame the island is a small part of a mostly-empty panel and the change reads as nothing.

- `projection-overview.png` — the overview zoom (640x420 panel, 3x)
- `projection-zoom.png` — **the zoom the owner singled out** (1280x840 panel, 2x)
- `projection-classic.png` — the widest frame measured (1900x1200 panel, 2x)

Each carries a third row: the **difference, amplified 6x**. Every parcel edge moved, and the
outermost moved most — which is what a perspective spread looks like when you subtract it.

At native resolution the change touches **1.15%–2.20% of pixels**, max channel delta 108. That is a
small change and it should be reported as one: the fix removes a subtle distortion, it does not
restyle the map.

## The instrument, and what was wrong with the old one

**The projection is now read off the matrix the driver was actually given**
(`harness/projection-probe.ts`). `getUniformLocation` is wrapped to remember the location three.js
got back for the name `projectionMatrix`, and `uniformMatrix4fv` records what is uploaded to it —
the same wrap-the-prototype route `baseline.tsx` already uses for draw counts.

⚠ **The instrument it replaces could not have failed.** `baseline.tsx` carried a `shippedCamera()`
marked *"⚠ Transcribed from ForestWorldCanvas.tsx:158-168"* and a `pxPerUnitAt(d, h, fovDeg = 45)`
beside it, and the whole 5.1% finding rested on them. An expectation derived from its subject cannot
fail: point the canvas at an orthographic camera and a transcribed fov-45 formula goes on reporting
5.1%; transcribe the new camera instead and the same formula reports 0.0% whether or not the shipped
file ever changed. Either way the headline is a restatement of what the page believes, arriving with
the authority of a measurement. Both helpers are deleted.

**An orthographic matrix delivers one scale because `clip.w` is a constant 1** — there is no
perspective divide, so the same world unit lands on the same number of pixels wherever it sits. The
0.0% is a property of the matrix, not of the arithmetic that read it.

### The check can go red — demonstrated, not asserted

`fence-goes-red-on-the-old-camera.txt` is the new instrument run against the **old camera**, same
page, same GPU, `src/ForestWorldCanvas.tsx` reverted to `aaa057d5`. All seven mounts come back
`PERSPECTIVE` and the driver refuses with a non-zero exit. The three source-level guards in
`shipped-baseline.test.ts` were checked the same way: three fail, nineteen pass.

⚠ One of those guards asserts **`fov` is absent**, not merely that `orthographic` is present. R3F
reads the presence of a `fov` prop as a request for a PerspectiveCamera, so
`<Canvas orthographic camera={{ fov: 45 }}>` is a canvas that looks compliant, reads compliant in
review, and is not.

## Two things measured on the way that are worth not re-deriving

1. **There is no view matrix on the wire.** three declares `viewMatrix` in its shader chunks, but
   nothing in `meshStandardMaterial` reads it, so the GLSL compiler eliminates it and
   `getUniformLocation` returns null. The obvious fallback — recover it from the `modelViewMatrix`
   uploaded beside an identity `modelMatrix` — was built and then **removed**, because a census of
   the actual uploads refuted it: **570 `modelViewMatrix` uploads against 2 identity `modelMatrix`
   uploads and zero non-identity ones**. `modelMatrix` is eliminated from the standard-material
   programs too. This costs the orthographic answer nothing, which is why the fallback is gone
   rather than patched.
2. **A classification and a spread fail independently.** The first version of the probe returned
   `indeterminate` when it had a projection matrix but no view matrix — so a perspective matrix it
   had read perfectly (m[11] = −1, m[15] = 0, m[5] = 2.4142) was thrown away, and the refusal
   announced *"the page captured no matrix at all"* about a page that had. Pinned by a test.

## Files

| file | what it is |
|---|---|
| `before-perspective.json` | the full baseline report on the retired camera |
| `after-orthographic.json` | the same report on the shipped camera |
| `fence-goes-red-on-the-old-camera.txt` | the new instrument refusing the old camera |
| `projection-*.png` | before / after / amplified-difference, at three deliveries |

## What this does NOT do

- **It does not adopt the land treatment.** ADR-0418 D4 / ADR-0380 D6 keep that a separate,
  deliberate event. Nothing here adds relief, grain, coast or skirt to `src/`.
- **It does not touch the third, stale `STATUS_COLOUR` map** in the shipped file. That is a
  different decision on the same file: the same lookup colours the story-tree crown as well as the
  ground, and `palette-band.ts`'s ground and crown tokens disagree for `building`, so a uniform
  six-hex swap to ADR-0462 would be wrong for the crown.
- **It does not sign off the look.** ADR-0070 makes this surface's appearance the owner's verdict.
  The pictures above are what that verdict is taken on.
