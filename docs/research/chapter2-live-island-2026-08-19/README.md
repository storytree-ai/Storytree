# The live-rendered island — 2026-08-19

The owner looked at the plant-row pass (PR #1417) and replied with two things:

> looks better then the triangles, but the live version just like circular swirls. what does this
> look like on the island?

The second is the arc's own standing rule turned back on it — *judge on the ISLAND, never a
contact sheet* — and the first pass broke it. This pass answers both.

## What the island shows

**At the size it is actually delivered, the two conventions read almost the same** —
`panel-delivered.png`, and this repeats the plant-row finding at island scale rather than
overturning it. Both panels are a green hex mass with dark-green vegetation clumped into drift
beds. On a whole island the live path's extra detail is spent below the threshold at which anything
is legible.

**Zoomed in, the island parts the same way the plant row did** (`panel-zoom.png`). The sprite land
develops staircased edges and its plants become pixel clusters; the live land keeps clean cell
edges and the plants stay plants.

**Two things about the LAND are worth naming, and neither is about the renderer.**

1. **The bare island is one flat colour with no interior definition at all** (`panel-bare-and-mixed.png`,
   top). That is not a bug and not a rendering limitation — it is the composition of three
   owner-directed decisions: flat green ground, mesh seams removed, and one surface rather than
   three hash-picked variants. Every cell on an all-healthy island therefore carries the same token
   at the same band, so the ground is a single unbroken field. **All of the island's visual interest
   is now the vegetation**, which raises the stakes on the vegetation considerably.
2. **The wall skirts are nearly invisible** at 50° with a 2.2-unit cell depth — a few dark slivers
   along the south rim. The land reads as a flat cut-out rather than as a solid with thickness.

The mixed panel (bottom) shows the banded material carrying a second status: the `unhealthy` parcel
is unmistakable charcoal, and its plants darken with it. Nothing is snapped, so a parcel can only
emit its own family's colours — the palette closure holds on a whole island.

## The swirls fork

**`mound` — the shape shown in the first pass — genuinely IS circular swirls, and the owner's read
is a fair description of the geometry.** Every lobe is a sphere scaled on the world axes, so the
outline is a union of circles, and the banded shading lays concentric rings inside each one. The
rings *are* the swirl.

**`foliage` changes only ORIENTATION and PROPORTION**: each lobe flattened into a leaf-like disc and
tilted onto its own axis. Same lobe count, same footprint, same detail ladder, same triangle cost,
same palette. It is a silhouette answer, which is the lever this arc measured as the affordable one
(silhouette variety costs 0 palette entries; micro-relief costs +619).

`panel-swirls-fork.png` shows both zoomed, and both at delivered size. **At delivered size the two
are close**; zoomed, foliage reads distinctly leafier and less bubbly.

**This is an owner call and the evidence deliberately does not adjudicate it.** See below.

## An instrument I nearly corrupted, kept here because the mistake is the lesson

A test measured the two silhouettes' outline roughness and asserted that foliage is ROUGHER than the
mound, on the theory that tilted discs step where stacked spheres taper. **It measured the opposite**
— foliage 0.178 against the mound's 0.279, because the foliage lobes are broader and overlap more,
so the profile fills in more continuously.

The tempting fix was to flip the inequality until it passed. That would have been worthless: *does
this look like circular swirls* is an APPEARANCE question, and ADR-0070 puts appearance behind an
operator's eye rather than a machine's. **A metric invented after the fact and tuned until it agrees
with the conclusion someone already wants is not evidence — it is decoration that reads as
evidence.** The test now asserts only what geometry can honestly carry: that the two styles are
genuinely different and stably so across seeds. The number is reported here; the verdict is the
owner's.

## Two bugs the first island render would have presented as art problems

Both are worth carrying because both produce a plausible-looking picture rather than an obvious
failure.

**(1) THE GROUND WAS MOSTLY MISSING.** SVG `(x, y)` maps to 3D `(x, z)`, which **flips handedness**,
so cell polygons came out wound the wrong way and front-face culling removed every top face. What
survived was the wall skirts — the island rendered as a lattice of thin green lines over holes, and
read like a design failure. The winding is now DERIVED from each polygon's own signed area, so
whichever way a cell was authored its triangles face `+y`. Opaque pixels on the same page: **5.19M →
6.70M**.

**(2) EVERY PLANT WAS 2.75× TOO TALL.** There are two different foreshortenings and the first render
used the wrong one:

- a **ground** distance shortens by `sin(elev)` = **0.342** at the land camera;
- an **upright** height shortens by `cos(elev)` = **0.940**.

A plant's footprint carries both — its width is a ground span, its height is an upright mark's drawn
height, its position is a ground point. Dividing the HEIGHT by the GROUND flattening multiplied every
plant by 2.75 and produced shrubs towering over the cells they stand on. `camera.ts` names the split
precisely and supplies a helper for each; using one where the other belongs is silent.

**(3) A THIRD, CAUGHT BY A TEST RATHER THAN BY LOOKING.** The projection round-trip check first
asserted that the ground island is "roughly as deep as it is wide", reasoning that a hex island is
near-isotropic. It measured 0.578 and failed — and the PREMISE was wrong, not the extractor: this
fixture's tiles span a deliberately wide 5×3 layout. An assertion that depends on the caller's tile
layout is not a projection check; it just happens to pass on round islands. It now compares the
island against ITS OWN projection and asserts the depth ratio is exactly `1/sin(20°)`, which is true
for any layout and false the moment the unprojection is dropped or doubled.

## Numbers

- **6,698,362** opaque delivered pixels, **0 off-palette**, **11** distinct delivered colours against
  104 authored entries. The palette closure holds on a whole island, not just a plant row.
- 13 hexes, 11 capabilities, all healthy. Density is `2 + tests × 1.9` (ADR-0226 D2).
- **81 checks** in the package.

⚠ The frame timings in `capture-report.json` remain **RELATIVE ONLY** — headless Chromium here is
SwiftShader (software). The ADR-0380 D2 hardware-floor question is still unanswered and still needs
the owner's own machine; the `HardwareHud` on both pages answers it in one look.

## Fixture honesty

`island-fixture.ts` is shaped after `context-traversal-capture` (the arc's chosen research surface)
but is NOT the live corpus — a harness page must render with no database. Its shape and its
all-healthy status distribution are the real island's; its test COUNTS are the real spread's shape,
not the real numbers. The ways it is not the real thing are written down in the fixture itself
rather than left to be discovered.

## Files

- `panel-delivered.png` — **read first.** The whole island, life size, both conventions.
- `panel-zoom.png` — where they part.
- `panel-swirls-fork.png` — **the owner call.** mound vs foliage, zoomed and at delivered size.
- `panel-bare-and-mixed.png` — the land with no vegetation, and one unhealthy capability.
- `live-island.png` — the whole page.
- `capture-report.json` — measured numbers, including the WebGL renderer string.

## Reproducing

```bash
pnpm --filter @storytree/forest-world-r3f dev
```

Then `http://localhost:5184/island.html`. The capture is:

```bash
ST_HARNESS_URL=http://localhost:5184/island.html ST_OUT_DIR=docs/research/chapter2-live-island-2026-08-19 ST_FULL_PAGE_NAME=live-island.png ST_PANEL_NAMES=delivered,zoom,swirls-fork,bare-and-mixed pnpm --filter @storytree/forest-world-r3f run capture
```

⚠ If port 5184 is already held by another worktree's harness, Vite refuses to start — but the
existing server still answers `/island.html` with **HTTP 200** via SPA fallback, serving a DIFFERENT
page. Check the served `<title>` before trusting a capture, or run on a free port with
`--port <n> --strictPort`.
