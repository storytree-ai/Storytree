---
id: "art-pipeline"
tier: capability
story: art-factory
title: "The shared pipeline — a declared-relations model, invariant-checked and drawn in a deterministic order, baked to drawables and printed"
outcome: "A declared part-tree becomes an invariant-checked model, ordered by a deterministic painter pass, baked to resolved-paint drawables and printed to an SVG document — one renderer-agnostic pipeline every per-object-type factory composes."
status: mapped
proof_mode: integration-test
depends_on: []
---

# The shared pipeline — model → check → order → bake → print

**Outcome —** A declared part-tree becomes an invariant-checked model, ordered by a deterministic
painter pass, baked to resolved-paint drawables and printed to an SVG document — one renderer-agnostic
pipeline every per-object-type factory composes.

**Depends on —** nothing in-story; this is the pipeline the two factory capabilities
([`building-factory`](building-factory.md), [`landscape-factory`](landscape-factory.md)) compose, so it
is the story's within-story root (ADR-0010 §3).

> **Proof status (honest) — `mapped`, brownfield.** `packages/procedural-architecture`'s pipeline
> modules have a real, passing OFFLINE suite (`core.test.ts`, `apertures.test.ts`, `draw-order.test.ts`,
> `bake.test.ts`), but storytree's prove-it-gate never DROVE them red→green. This capability greens via
> the story's `observe` reliability gate (`art-factory#gate-1`, `(covers: art-pipeline …)`, ADR-0085 /
> ADR-0097). Do not call it proven or `healthy` — `healthy` is DERIVED from the signed adopted verdict
> (ADR-0020 / ADR-0040), never authored.

## Guidance

The pipeline is a stack of layers each ignorant of the next (`src/index.ts`): the model builder +
projection (`procedural-utils.ts`), the invariant checker (`invariants.ts` — `check` / `assertSound`),
the aperture cut (`apertures.ts`), the deterministic draw order (`draw-order.ts` — `orderForPainter` /
`findDepthConflicts`), the bake (`bake.ts` — `bakeBuilding` + `THEMES` / `themeFor`), and the SVG
printer (`render-svg.ts` — `render` / `renderDetailed`). A per-object-type factory composes station 1
and is judged by station 2; there is ONE bake and two printers (an SVG document / a scene's drawables),
so swapping the renderer replaces `render-svg` and nothing upstream — `draw-order` is projection-aware
but SVG-ignorant, so it survives the swap too.

Determinism is the load-bearing property: same parameters in → byte-identical model, draw order, bake,
and SVG out. The suite asserts it directly ("same parameters, byte-identical SVG"). Keep every layer
pure — no clock, no RNG the caller cannot seed, no `node:*` — so the browser bundle and the git-pinned
baked assets stay reproducible.

## Integration test

**Goal —** Drive a declared part-tree the whole way through the real pipeline — builder → checker →
draw order → bake → SVG — against the real pipeline modules (no stubs within the organism), asserting a
sound model orders and bakes deterministically and prints a well-formed SVG, and an unsound model is
refused by the checker before it can be drawn.

The integration test exercises art-pipeline against its **real in-story collaborators** — the real
`procedural-utils` / `invariants` / `apertures` / `draw-order` / `bake` / `render-svg` modules — with no
stubs. It would build a small declared model, assert `check` returns no violations, `orderForPainter`
yields a stable painter order with no `findDepthConflicts`, `bakeBuilding` emits resolved-paint
`BakedNode`s, and `render` prints a byte-identical SVG on a re-run; then perturb the model into an
unsound one and assert `check` returns the expected `Violation[]`.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** in the
`@storytree/procedural-architecture` suite, mapped by the story's observe gate.

1. **`ap-model-builder-derives-positions`** — the part-tree builder derives positions from declared relations, then projects
   - **asserts —** the builder composes a part-tree whose child positions are DERIVED from their parents
     (not typed coordinates) and the isometric projection maps model space to view space consistently.
   - **covers —** `packages/procedural-architecture/src/procedural-utils.ts` (the builder + projection)
   - **proven by —** `packages/procedural-architecture/src/core.test.ts`.
2. **`ap-invariant-checker-flags-violations`** — `check(model)` returns the violations of a physically-unsound model
   - **asserts —** `check` returns `[]` for a sound model and the expected `Violation[]` for an unsound
     one (a part floating past `margin`, support below `minSupport`); `assertSound` throws on the latter.
   - **covers —** `packages/procedural-architecture/src/invariants.ts` (`check` / `assertSound`)
   - **proven by —** `packages/procedural-architecture/src/core.test.ts`.
3. **`ap-aperture-cuts-real-holes`** — an opening is a hole cut into the facade, with a reveal
   - **asserts —** cutting an aperture removes real area from the facade (a hole, not an overlaid rect)
     and produces the reveal geometry.
   - **covers —** `packages/procedural-architecture/src/apertures.ts`
   - **proven by —** `packages/procedural-architecture/src/apertures.test.ts`.
4. **`ap-draw-order-is-deterministic`** — `orderForPainter` yields a stable, conflict-free painter order
   - **asserts —** `orderForPainter` returns a deterministic back-to-front order for a projected part
     set (same input → same order) and `findDepthConflicts` reports none for a well-formed model.
   - **covers —** `packages/procedural-architecture/src/draw-order.ts` (`orderForPainter` / `findDepthConflicts`)
   - **proven by —** `packages/procedural-architecture/src/draw-order.test.ts`.
5. **`ap-bake-emits-resolved-drawables`** — `bakeBuilding` emits resolved-paint drawables, deterministically
   - **asserts —** `bakeBuilding` folds a model into `BakedNode`s carrying resolved paint (`themeFor`
     over `THEMES`) and no world-space receipt, and a fresh bake matches the committed one byte-for-byte.
   - **covers —** `packages/procedural-architecture/src/bake.ts` (`bakeBuilding` / `THEMES` / `themeFor`)
   - **proven by —** `packages/procedural-architecture/src/bake.test.ts`.
6. **`ap-svg-printer-prints-deterministic-document`** — `render` prints a byte-identical SVG document
   - **asserts —** `render` / `renderDetailed` print a well-formed SVG document from a model, and the
     same parameters produce a byte-identical SVG on re-run (the determinism the suite asserts across
     the building/landscape factories).
   - **covers —** `packages/procedural-architecture/src/render-svg.ts` (`render` / `renderDetailed`)
   - **proven by —** `packages/procedural-architecture/src/core.test.ts` (the byte-identical-SVG determinism assertions).
