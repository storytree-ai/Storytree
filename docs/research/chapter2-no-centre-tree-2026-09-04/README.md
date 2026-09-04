# Retiring the placeholder story tree from the 3D map — 2026-09-04

The increment: `retire-the-placeholder-story-tree-each-island-is-a-grove` on `land-ground-stack-arc`.
The decision: **ADR-0508**, the owner on 2026-09-03, verbatim — *"Yes we should aim to remove the
placeholder storytree - under this new look the center tree will no longer be a thing, each island
will be a small grove or forest."*

## What was retired

A cylinder trunk under a cone crown, drawn at every island's centre by `<StoryTree>` in
`ForestWorldCanvas.tsx` from the `story-tree` descriptor `worldTo3D` emitted for each `tree` group.
It predated the bought kit; since ADR-0475 D2 the LAND carries the story's own state uniformly
across the island, so the cone was a second copy of a signal the ground already reports, and it was
the one object on the map that was not from the pack.

It was also a **caster**: `groundCasters` derived an occluder from the same descriptor, so the dark
contact pool at every island's centre in every frame on this arc was its shadow. Mesh and caster
went together.

## The measurement

**Two worktrees on the RTX 2060 box, at `HEAD` and at `HEAD~1`, rendered by the same driver on the
same run.** The control arm is not a reconstruction of the previous map — it *is* the previous
commit's own code, so the two differ in this branch and in nothing else
(`comparison-control-arm-goes-stale-when-a-sibling-lands`).

```
git worktree add --detach .claude/worktrees/no-tree-after  <this branch>
git worktree add --detach .claude/worktrees/no-tree-before <this branch>~1
pnpm --filter @storytree/forest-world-r3f exec vite harness --port <p> --strictPort --host 127.0.0.1
DISPLAY=:0 ST_CANOPY_URL=http://127.0.0.1:<p>/shipped-canopy.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-canopy
DISPLAY=:0 ST_LAND_URL=http://127.0.0.1:<p>/shipped-land.html \
  pnpm --filter @storytree/forest-world-r3f measure-shipped-land
```

Renderer, proved non-software before any figure was quoted:
`ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)`.

## The result — exactly 35 casters, and nothing else

`canopy-measurements-{before,after}.json` and `canopy-report-{before,after}.txt` are the two runs
verbatim. The forest is 35 islands, so one caster per island:

| arm, forest @ 8 px/unit | casters BEFORE | casters AFTER | ground triangles | objects | draw calls |
|---|---|---|---|---|---|
| `bare`       |    35 |    **0** | 194,630 | 0 | 1 |
| `capability` |   619 |  **584** | 194,630 | 584 | 7 |
| `groves-x1`  | 1,555 | **1,520** | 194,630 | 1,520 | 7 |
| `groves-x2` (SHIPPED) | 2,314 | **2,279** | 194,630 | 2,279 | 7 |
| `groves-x3`  | 2,937 | **2,902** | 194,630 | 2,902 | 7 |

Every other column is **identical** across the two runs — ground triangles, object counts, draw
calls, parcels, the camera. The change removes 35 occluders and moves nothing else, which is what
ADR-0475 D2 requires: this deletes a duplicate signal, it does not move one.

⚠ **The one number that is NOT a straight before/after is `groves-x2`'s object count on the LAND
page**, because the land page's own shadow field changed in the same landing — see below.

## The pictures

- **`sheet-island-8px.png`** — one island at 8 px/unit, four panels. Panel 2 is worth the look: it
  is the ladder's MEASURED arm as it actually shipped, where the cone was never drawn — so the pool
  at the centre is a shadow with nothing casting it, which is the misreport `ground-casters.ts`
  exists to prevent, visible on the page. Panel 4 is the grove that stands there now.
  ⚠ **Panels 2 → 3 move TWO things**, and the caption says so: the tree's caster went, AND the land
  page's ladder now shades the map's own caster list (below), so the grove's placements darken the
  ground even in an arm that draws no props.
- **`sheet-forest-8px.png`** — the controlled comparison, and the one to read for the size of the
  change. Same page, same builder, one variable. Top row is the `bare` arm: the dark oval at each
  island's centre in BEFORE is simply absent in AFTER. Bottom row is the shipped `groves-x2` arm.
- **`sheet-forest-fit.png`** — the fitted forest, shipped arm, before and after.

## The second finding: the land page was shading an empty field

`shipped-land-measure.mjs` **refused** the first AFTER run:

> REFUSED: the shadow arm was built from ZERO casters — the island has nothing standing on it, so
> every shadow figure below would be a figure about an empty field

That guard was right, and the fault it caught predates this increment. The land page built its
occlusion field from `shippedCasters()` — the DESCRIPTOR STREAM's casters — while the shipped canvas
builds its own from `groundCasters(descriptors)` **unioned with** `placementCasters(placements)`. The
kit began casting on 2026-09-03, and the page never unioned the placements in, so its field carried
one pool where the map carried a grove's worth. Retiring the tree turned "one of many" into "none".

`shippedMapCasters()` is now the list the canvas hands its own ground, term for term, off the same
frozen footprint tables. A node test holds the same claim the driver's guard holds, so it no longer
takes a GPU to fire.

## What did NOT change

- **The 2D maps.** The studio's SVG scene and the website's string-SVG mapper draw their own
  per-story tree from the same `tree` group and are untouched; ADR-0226's crown token still has a
  job there. `CROWN_COLOUR` survives its resolver in `ForestWorldCanvas.tsx` for that reason —
  `check:palette-transcription` parses it out of that file and `src/leaf-tint.test.ts` pins the
  kit's `mapped` leaf tint to it.
- **What the ground reports.** ADR-0475 D2 stands.

## Provenance

Every figure here is re-measured on these two runs. Nothing is inherited from an increment row, from
`land-ground-stack-arc`'s intent, or from an earlier evidence sheet — the arc's own first hazard
("every layer is priced against a repository the previous layer moved").
