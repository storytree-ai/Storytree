---
id: "forest-land-dressing"
tier: capability
story: website-experience
title: "The land dressing — what stands ON the land once the land itself reads right"
outcome: "The surfaced land is dressed: kit assets become kit meshes placed on the ground, leaf tint and prop lighting make them sit in the same light as the ground beneath them, ground cover and map dressing populate the land between the props, and the island path is laid across it — every placement derived from the scene model's cells, never from a hand-placed coordinate."
status: proposed
proof_mode: integration-test
depends_on: [forest-scene-model, forest-land-surface]
decisions: [123, 562]
# ⚠ SPLIT LANE 3 of 4 (2026-09-12). Born of the `forest-rendering-engine` split; it inherited the
# 8 modules below and NOTHING ELSE. ⚠ **No proof came with it** — ADR-0559 D5: "no continuation
# transfers proof to newly split lanes." The pre-split capability's single July 2026 signed verdict
# proved `world-to-3d.ts` and is `forest-scene-model`'s history; it says nothing about any module
# here. This lane starts `proposed` with zero signed credit.
#
# ⚠ `kit-vocabulary` IS NOT IN THIS LANE, and that is the one placement a reader will want to
# correct. It is the prop vocabulary and it looks like dressing, but `camera-framing.ts:73` imports
# `RENDER_ELEV_DEG` from it — so filing it here would make the SCENE MODEL depend on the DRESSING
# lane, a backedge across three boundaries. It lives in `forest-scene-model` as a
# taxonomy-and-constants root. Consume it from there; do not move it.
#
# WHY THIS LANE DEPENDS ON THE SURFACE AS WELL AS THE SCENE MODEL: `prop-lighting` and `leaf-tint`
# have to sit a prop in the SAME light the ground is already wearing, and `dressing-ground` /
# `cover-dressing` populate the land between props against the surfaced ground. Both edges are real
# forward value edges in the measured graph; neither is invented to be safe.
#
# Node-borne proof config (ADR-0057): NOT armed. `command` is the package suite, which really does
# run every test named below — all 8 modules carry a `node:test` suite today. There is deliberately
# NO `real:` arm: this landing draws a boundary and arms no red→green, and naming a net-new
# test/source pair here would fabricate a build nobody asked for. The first unit taken in this lane
# adds the arm with the pair it actually authors.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/forest-world-r3f", "test"]
  scope:
    testGlobs:
      - "packages/forest-world-r3f/src/kit-asset.test.ts"
      - "packages/forest-world-r3f/src/kit-mesh.test.ts"
      - "packages/forest-world-r3f/src/leaf-tint.test.ts"
      - "packages/forest-world-r3f/src/prop-lighting.test.ts"
      - "packages/forest-world-r3f/src/cover-dressing.test.ts"
      - "packages/forest-world-r3f/src/dressing-ground.test.ts"
      - "packages/forest-world-r3f/src/map-dressing.test.ts"
      - "packages/forest-world-r3f/src/island-path.test.ts"
    sourceGlobs:
      - "packages/forest-world-r3f/src/kit-asset.ts"
      - "packages/forest-world-r3f/src/kit-mesh.ts"
      - "packages/forest-world-r3f/src/leaf-tint.ts"
      - "packages/forest-world-r3f/src/prop-lighting.ts"
      - "packages/forest-world-r3f/src/cover-dressing.ts"
      - "packages/forest-world-r3f/src/dressing-ground.ts"
      - "packages/forest-world-r3f/src/map-dressing.ts"
      - "packages/forest-world-r3f/src/island-path.ts"
---

# The land dressing — what stands ON the land once the land itself reads right

**PROVENANCE — born of a split, carrying no proof.** This capability did not exist before
2026-09-12. On that day `forest-rendering-engine` (itself `r3f-world-spike` until earlier the same
day — ADR-0562) was split into four lanes on a measured import graph:
[`forest-scene-model`](forest-scene-model.md) →
[`forest-land-surface`](forest-land-surface.md) → `forest-land-dressing` (this one) →
[`forest-canvas-delivery`](forest-canvas-delivery.md). ⚠ **Nothing was inherited but the modules.**
ADR-0559 D5: *"no continuation transfers proof to newly split lanes."* The pre-split capability's
one signed verdict proved `world-to-3d.ts` and belongs to the scene-model lane's history. This lane
starts `proposed` with zero signed credit.

**Outcome —** The surfaced land is dressed: kit assets become kit meshes placed on the ground; leaf
tint and prop lighting sit them in the same light the ground is already wearing; ground cover and
map dressing populate the land between them; and the island path is laid across it — every
placement DERIVED from the scene model's cells, never from a hand-placed coordinate.

**Depends on —** [`forest-scene-model`](forest-scene-model.md) (the cells, footprint and vocabulary
every placement is derived from) and [`forest-land-surface`](forest-land-surface.md) (a prop that
is not lit like the ground it stands on reads as a sticker, so the dressing cannot be tuned against
an unlit ground). **Nothing upstream imports a dressing module**, in value or in type — the
one-way property that makes this lane claimable alongside the other two.

> **Proof status (honest) — UNPROVEN as a capability, and NOT unproven as code.** All 8 modules
> carry real `node:test` suites in `packages/forest-world-r3f` and the package suite runs green.
> What does not exist is a CONTRACT SET: no contract id leads any of those tests (ADR-0122), so
> `storytree coverage forest-land-dressing` correctly reports zero and no signed verdict names this
> unit. Authoring contracts over the behaviour these suites already assert is this lane's own first
> increment, deliberately not done in the boundary landing that created it.

## The lane — 8 modules

| group | modules |
|---|---|
| the props themselves | `kit-asset`, `kit-mesh` |
| making a prop belong to its ground | `leaf-tint`, `prop-lighting` |
| what fills the space between props | `cover-dressing`, `dressing-ground`, `map-dressing` |
| the way across the island | `island-path` |

**ONE OBJECT PER CAPABILITY (ADR-0475) is the vocabulary rule this lane serves**, and the taxonomy
that decides WHICH object is `kit-vocabulary`'s — which lives one lane up, in
[`forest-scene-model`](forest-scene-model.md). This lane builds and places what that vocabulary
names; it does not get to extend the vocabulary on its own. Extending it is a scene-model unit.

## Integration test

**Goal —** Prove that dressing is derived from the land rather than placed on top of it, and that a
dressed prop belongs to the ground it stands on.

1. Build a real scene, surface it, then dress it twice → assert the placement set is deep-equal.
   Placement is derived from the scene model's cells, so it must be as deterministic as they are; a
   dressing pass that varies run to run cannot be drift-gated and cannot be compared across an art
   change.
2. Assert every placed prop's footprint lies inside the island's true footprint and on a real cell —
   no prop hanging over the coast clip, none floating between cells. Feed a deliberately oblong
   island so a placement that silently assumes a square footprint is separable.
3. Assert a prop's delivered lighting tracks the ground's: change the light calibration the SURFACE
   lane owns and assert the prop's tint/lighting moves with it in the same direction. This is the
   leg that catches a prop lit by a constant — the "sticker" failure — and it is the reason this
   lane depends on the surface rather than only on the scene model.
4. Assert the island path is continuous across the cells it crosses, and that it reads onto the
   ground through the surface lane's wear rather than by overwriting the ground material.
5. Assert ground cover thins where the path and props already occupy the cell — dressing composes
   with itself and does not double-populate.

## Guidance

**WHY THIS IS A CAPABILITY AND NOT PART OF THE SURFACE.** The surface answers *what is the land
made of*; the dressing answers *what stands on it*. They share a precondition (a surfaced ground)
but not an observable: a surface defect shows up in a composited ground sample, a dressing defect
shows up in a placement set. The measured graph agrees — dressing imports the surface and the
surface never imports dressing, in either edge kind. Two disjoint sessions can therefore hold the
two claims at once, which is the entire point of the split.

**THE LANE FENCE, in both directions.**

- **Never import downstream.** A dressing module may import from `forest-scene-model` and
  `forest-land-surface`. It may NOT import from `forest-canvas-delivery` — including an
  `import type`, because a type-only cycle pins two modules into one lane at compile time exactly
  as firmly as a value cycle does.
- **Never reach up to add what you need.** If a dressing change wants a new constant in
  `kit-vocabulary` or a new light knob in `light-calibration`, land that upstream as its own unit
  and consume it here. Editing an upstream module from this lane is how the boundary quietly dies,
  and it is what the ownership fence in `repo-manifest.json` exists to make visible.
- **Prop art is retunable here; prop TAXONOMY is not.** Adding a new kind of object to the
  vocabulary is a scene-model change (ADR-0475's one-object-per-capability rule is a vocabulary
  rule).

**THE LOOK IS NOT THIS SUITE'S TO JUDGE.** Whether the dressed island is beautiful, or whether a
prop reads as the thing it is meant to be, is a taste judgment with no compiler — it is the owner's,
taken on the live site or a staged comparison page, and an agent never self-signs it (ADR-0070).
What this suite proves is everything mechanical underneath that: derivation, containment, lighting
agreement, continuity, and composition.
