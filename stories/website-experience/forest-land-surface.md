---
id: "forest-land-surface"
tier: capability
story: website-experience
title: "The land surface — the ground, its coast, its light and its shadow, all judged against one background"
outcome: "The scene model's ground geometry is given a surface a visitor can read: the banded ground material and its grain, grass, wheat, blight, rock, sand and wear layers; the shore's grid, fall, ring and atlas where the land meets water; and the light calibration, shadow, shadow atlas, shadow rung and contact shade that make an island's proof status legible — tuned as ONE composition, because light, shadow and ground are the strongest measured interaction in the renderer."
status: proposed
proof_mode: integration-test
depends_on: [forest-scene-model]
decisions: [123, 562]
# ⚠ SPLIT LANE 2 of 4 (2026-09-12). Born of the `forest-rendering-engine` split; it inherited the
# 22 modules below and NOTHING ELSE. ⚠ **No proof came with it** — ADR-0559 D5: "no continuation
# transfers proof to newly split lanes." The pre-split capability's single July 2026 signed verdict
# is `forest-scene-model`'s history (it proved `world-to-3d.ts`), was already lifecycle-reset
# before the split, and says nothing about any module here. This lane starts `proposed` with zero
# signed credit, which is the honest reading, not a demotion.
#
# WHY LIGHT AND SHADOW ARE IN THIS LANE rather than a fifth one of their own — the arc's end state
# names it and the measurement backs it. On the real forest, shadows cost 5 islands their status
# reading and the props 7, against the rock's 0: ground and shadow are the strongest interaction in
# the renderer. Two sessions tuning ground and shadow at once would each be judging against a
# background the other is moving — the composition trap. `land-shadow` is also a shared root
# (in-degree 12), which is a second, independent argument against giving it its own lane.
#
# Node-borne proof config (ADR-0057): NOT armed. `command` is the package suite, which really does
# run every test named below — all 22 modules carry a `node:test` suite today. There is deliberately
# NO `real:` arm: this landing draws a boundary and arms no red→green, and inventing a net-new
# test/source pair here would be fabricating a build nobody asked for. Whoever takes the first unit
# in this lane adds the `real:` arm with the pair it actually authors.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/forest-world-r3f", "test"]
  scope:
    testGlobs:
      - "packages/forest-world-r3f/src/banded-ground-material.test.ts"
      - "packages/forest-world-r3f/src/banded-ground-material.blight.test.ts"
      - "packages/forest-world-r3f/src/banded-ground-material.layers.test.ts"
      - "packages/forest-world-r3f/src/banded-ground-material.level.test.ts"
      - "packages/forest-world-r3f/src/banded-ground-material.wheat.test.ts"
      - "packages/forest-world-r3f/src/land-grain.test.ts"
      - "packages/forest-world-r3f/src/land-grass.test.ts"
      - "packages/forest-world-r3f/src/land-wheat.test.ts"
      - "packages/forest-world-r3f/src/land-blight.test.ts"
      - "packages/forest-world-r3f/src/land-rock.test.ts"
      - "packages/forest-world-r3f/src/land-sand.test.ts"
      - "packages/forest-world-r3f/src/land-wear.test.ts"
      - "packages/forest-world-r3f/src/exact-colour.test.ts"
      - "packages/forest-world-r3f/src/light-calibration.test.ts"
      - "packages/forest-world-r3f/src/land-shadow.test.ts"
      - "packages/forest-world-r3f/src/shadow-atlas.test.ts"
      - "packages/forest-world-r3f/src/shadow-rung.test.ts"
      - "packages/forest-world-r3f/src/contact-shade.test.ts"
      - "packages/forest-world-r3f/src/ground-casters.test.ts"
      - "packages/forest-world-r3f/src/shore-grid.test.ts"
      - "packages/forest-world-r3f/src/shore-fall.test.ts"
      - "packages/forest-world-r3f/src/shore-atlas.test.ts"
      - "packages/forest-world-r3f/src/shore-ring.test.ts"
      - "packages/forest-world-r3f/src/trail-wear.test.ts"
      - "packages/forest-world-r3f/src/wear-atlas.test.ts"
      - "packages/forest-world-r3f/src/detail-normal-texture.test.ts"
    sourceGlobs:
      - "packages/forest-world-r3f/src/banded-ground-material.ts"
      - "packages/forest-world-r3f/src/land-grain.ts"
      - "packages/forest-world-r3f/src/land-grass.ts"
      - "packages/forest-world-r3f/src/land-wheat.ts"
      - "packages/forest-world-r3f/src/land-blight.ts"
      - "packages/forest-world-r3f/src/land-rock.ts"
      - "packages/forest-world-r3f/src/land-sand.ts"
      - "packages/forest-world-r3f/src/land-wear.ts"
      - "packages/forest-world-r3f/src/exact-colour.ts"
      - "packages/forest-world-r3f/src/light-calibration.ts"
      - "packages/forest-world-r3f/src/land-shadow.ts"
      - "packages/forest-world-r3f/src/shadow-atlas.ts"
      - "packages/forest-world-r3f/src/shadow-rung.ts"
      - "packages/forest-world-r3f/src/contact-shade.ts"
      - "packages/forest-world-r3f/src/ground-casters.ts"
      - "packages/forest-world-r3f/src/shore-grid.ts"
      - "packages/forest-world-r3f/src/shore-fall.ts"
      - "packages/forest-world-r3f/src/shore-atlas.ts"
      - "packages/forest-world-r3f/src/shore-ring.ts"
      - "packages/forest-world-r3f/src/trail-wear.ts"
      - "packages/forest-world-r3f/src/wear-atlas.ts"
      - "packages/forest-world-r3f/src/detail-normal-texture.ts"
---

# The land surface — the ground, its coast, its light and its shadow, all judged against one background

**PROVENANCE — born of a split, carrying no proof.** This capability did not exist before
2026-09-12. On that day `forest-rendering-engine` (itself `r3f-world-spike` until earlier the same
day — ADR-0562) was split into four lanes on a measured import graph:
[`forest-scene-model`](forest-scene-model.md) → `forest-land-surface` (this one) →
[`forest-land-dressing`](forest-land-dressing.md) →
[`forest-canvas-delivery`](forest-canvas-delivery.md). ⚠ **Nothing was inherited but the modules.**
The pre-split capability's one signed verdict proved `world-to-3d.ts` and belongs to the scene-model
lane's history; ADR-0559 D5 is explicit — *"no continuation transfers proof to newly split lanes."*
This lane's status is `proposed` with zero signed credit, and that is the honest reading rather than
a demotion: it was never separately proven, before or after.

**Outcome —** The scene model's ground geometry is given a surface a visitor can READ: the banded
ground material and its grain / grass / wheat / blight / rock / sand / wear layers; the shore's
grid, fall, ring and atlas where land meets water; and the light calibration, shadow, shadow atlas,
shadow rung and contact shade that make an island's proof status legible.

**Depends on —** [`forest-scene-model`](forest-scene-model.md) — there is no surface to paint until
the scene model has said where the ground is. Every module here reads the scene model's cells,
relief, coast clip, texel convention and shade ladder; **no module here is imported by a
scene-model module**, in value or in type. That one-way property is what makes this lane claimable
while the scene model is being worked.

> **Proof status (honest) — UNPROVEN as a capability, and NOT unproven as code.** All 22 modules
> carry real `node:test` suites in `packages/forest-world-r3f` (26 test files — `banded-ground-material`
> alone has five), and the package suite runs green. What does not exist is a CONTRACT SET: no
> contract id leads any of those tests (ADR-0122), so `storytree coverage forest-land-surface`
> correctly reports zero, and no signed verdict names this unit. Authoring contracts over the
> behaviour these suites already assert is this lane's own first increment — deliberately NOT done
> in the boundary landing that created it, because a contract id is proof-bearing identity and
> minting one against a test written for another purpose would credit coverage nobody earned.

## The lane — 22 modules

| group | modules |
|---|---|
| the ground material | `banded-ground-material`, `exact-colour`, `detail-normal-texture` |
| the ground's cover | `land-grain`, `land-grass`, `land-wheat`, `land-blight`, `land-rock`, `land-sand`, `land-wear` |
| the coast | `shore-grid`, `shore-fall`, `shore-atlas`, `shore-ring` |
| light and shadow | `light-calibration`, `land-shadow`, `shadow-atlas`, `shadow-rung`, `contact-shade`, `ground-casters` |
| trails on the ground | `trail-wear`, `wear-atlas` |

`detail-normal-texture` is HERE while `detail-normal` is in the scene model — that is not a slip.
The convention (what a detail-normal channel MEANS) is a scene-model root; the TEXTURE that
realises it is surface art, and it changes when the ground's look changes.

## Integration test

**Goal —** Prove that the surface layers compose onto the scene model's ground deterministically,
and that a change of proof status is still legible after the ground, light and shadow have all had
their say.

1. Build a real relaxed-mesh scene through `@storytree/forest-world`'s `buildScene` and take the
   scene model's ground geometry from it. Compose the banded ground material over it twice → assert
   the resulting layer stack / ramp is deep-equal (the surface inherits the scene model's
   determinism; a ramp that varies run to run cannot be drift-gated).
2. Assert the ramp is sized by `tokens × levels` and by NOTHING else — not by cell count, not by
   island count. This is the property that keeps a many-island forest one upload rather than one
   per island.
3. Feed islands wearing each folded `SceneStatus` through the ground material WITH light, shadow and
   contact shade applied → assert each status still resolves to a DISTINGUISHABLE delivered colour
   band, measured as a numeric separation on the composited sample rather than on the base token.
   ⚠ This is the leg that matters and the one a cheap assertion fakes: the observer here is a
   MACHINE reading composited channel values, and the separation threshold is the contract. The
   question "does the island READ as unhealthy to a person" is a different, human question and
   belongs to the owner's walk of the live site, never to this suite.
4. Assert the shore layers close: for a parcel on the coast clip, the shore grid, fall and ring
   agree on where the land ends — no gap, no double-drawn band — and the shore atlas is addressed
   by the same texel convention the scene model declares.
5. Assert a trail's wear reads onto the ground it crosses, and that removing the trail restores the
   untouched ground exactly (wear is additive and reversible, not a destructive bake).

## Guidance

**WHY THIS IS ONE CAPABILITY AND NOT THREE (ground / coast / light).** Both splitting triggers fail.
The outcome states in one sentence without conjunction-stapling — *the land gets a surface a visitor
can read* — and the proof shares one precondition (a real scene-model ground) and one observable
(the composited sample). More decisively, the measurement says these three subjects are the
renderer's strongest interaction: on the real forest, shadows cost 5 islands their status reading
and the props 7, against the rock's 0. Two sessions tuning ground and shadow at the same time would
each judge their own change against a background the other was moving. That is the composition trap,
and it is a worse cost than the serialisation it would buy relief from.

**A FOUR-LANE VERSION WITH LIGHT SEPARATE WAS CONSIDERED AND REFUSED**, and the refusal is recorded
rather than assumed: it is defensible only if the shadow work is big enough to pay for that risk,
and `land-shadow`'s in-degree of 12 makes it a shared root as well — a third argument for keeping it
with the ground it shades.

**THE LANE FENCE, and it binds in both directions.**

- **Never import downstream.** A module here may import from `forest-scene-model`. It may NOT
  import from `forest-land-dressing` or `forest-canvas-delivery` — including an `import type`. A
  type-only cycle pins two modules into one lane at compile time exactly as firmly as a value cycle
  does, and the partition was measured with the two edge kinds separated precisely because that is
  easy to miss.
- **If a surface change needs a new scene-model root, that is a scene-model unit first.** Reaching
  up into `forest-scene-model` to add the constant you need is how a lane boundary quietly dies.
  Land the root there, then consume it here.
- **Art retuning is this lane's work; geometry is not.** If the fix is "the ground is in the wrong
  place" rather than "the ground is the wrong colour", it belongs upstream.

**OBSERVERS ARE NAMED, NOT ASSUMED.** Where a contract in this lane says a status must be
"distinguishable" or "visible", it must name WHO has to be able to tell. A machine observer makes
the numeric separation the whole contract. A human observer makes the RENDERED result the contract
and cannot be discharged by a channel value — and a look-and-feel verdict is never self-signed by an
agent (ADR-0070); it is the owner's, taken on the live site.
