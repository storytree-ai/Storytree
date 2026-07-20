---
id: "render-core"
tier: capability
story: forest-world
title: "The render core — the deterministic geometry kernel and framework-agnostic scene-graph both surfaces draw from"
outcome: "The pure geometry kernel (mesh, coast, ranking, hex, sizing) and the framework-agnostic scene-graph (buildScene over the core's own SceneInput) turn story data into byte-identical typed drawables — the one deterministic look both the studio and the website render."
status: mapped
proof_mode: integration-test
depends_on: []
---

# The render core — the geometry kernel + the framework-agnostic scene-graph

**Outcome —** The pure geometry kernel (mesh, coast, ranking, hex, sizing) and the framework-agnostic
scene-graph (`buildScene` over the core's own `SceneInput`) turn story data into byte-identical typed
drawables — the one deterministic look both the studio and the website render.

**Depends on —** nothing in-story; this capability IS the render core, the story's within-story root
(ADR-0010 §3). The three thin mappers (studio React, website string-SVG, R3F) live with their
surfaces/packages, not here.

> **Proof status (honest) — `mapped`, brownfield.** `packages/forest-world` has a real, passing OFFLINE
> suite (106 tests: the geometry kernel, the deterministic trail router, and the scene-graph), but
> storytree's prove-it-gate never DROVE it red→green. This capability greens via the story's `observe`
> reliability gate (`forest-world#gate-1`, `(covers: render-core)`, ADR-0085 / ADR-0097). This is the
> capability FLOOR (ADR-0222 D2, option A): one capability standing for the render core so the island
> grows honest flora, split no finer until an in-core unit earns its own red→green leg. `healthy` is
> DERIVED from the signed adopted verdict (ADR-0020 / ADR-0040), never authored.

## Guidance

The core holds BOTH pure layers (ADR-0093, strategy C). The **geometry kernel**: the relaxed
Townscaper mesh substrate (`substrate.ts`), the Chaikin-smoothed coastline (`coast.ts`), longest-path
dependency ranking (`ranking.ts`), the hex math (`hex.ts`), the seeded RNG (`rng.ts`), the tree /
territory sizing (`sizing.ts`), and the deterministic cost-grid trail router (`routing.ts`, ADR-0169).
The **scene-graph** (`scene.ts`): `buildScene` folds the core's own minimal `SceneInput` contract into
a tree of typed drawables (kind / variant / already-folded visual status) that every thin mapper walks,
and the per-parcel SURFACES emit a parcel's flora with density ∝ its `testCount`.

Determinism is the load-bearing property, and the suite asserts it directly: same input → byte-identical
mesh, coast, scene, and trail network; no store, no React, no live data, no `node:*` import. Keep the
core browser-bundleable (the studio bundles it) — pure geometry / zod-types-only. The whole suite runs
offline: `pnpm --filter @storytree/forest-world test`.

## Integration test

**Goal —** Fold a small story input through the real render core — kernel → ranking → routing → scene —
and assert a byte-identical, correctly-ranked, correctly-folded scene comes out, against the real core
modules (no stubs within the organism).

The integration test exercises render-core against its **real in-story collaborators** — the real
`substrate` / `coast` / `ranking` / `hex` / `sizing` / `routing` / `scene` modules — with no stubs. It
would build a `SceneInput` from a small story graph, assert `buildScene` produces the expected typed
drawables with folded status, ranking places a dependent strictly above every dependency (cycle-safe),
the trail router emits a deterministic shared-segment network, and a second run is byte-identical.

## Contracts (7)

The test-proven leaf behaviours — each **one isolated automated test** in the
`@storytree/forest-world` suite, mapped by the story's observe gate.

1. **`rc-mesh-substrate-deterministic`** — the relaxed mesh substrate is deterministic from a seed
   - **asserts —** `substrate.ts` builds the relaxed Townscaper mesh byte-identically for the same seed
     (the seeded RNG `rng.ts` gives no `Math.random`, no clock).
   - **covers —** `packages/forest-world/src/substrate.ts` (with `rng.ts`)
   - **proven by —** `packages/forest-world/src/forest-world.test.ts`.
2. **`rc-coastline-chaikin-smoothed`** — the coastline is a Chaikin-smoothed closed loop
   - **asserts —** `coast.ts` smooths a territory boundary into the expected Chaikin-refined coastline,
     deterministically.
   - **covers —** `packages/forest-world/src/coast.ts`
   - **proven by —** `packages/forest-world/src/forest-world.test.ts`.
3. **`rc-longest-path-ranking-cycle-safe`** — ranking places a dependent strictly above every dependency
   - **asserts —** `ranking.ts` ranks by longest path so a dependent is strictly above all its
     dependencies, and stays cycle-safe (a cycle does not hang or mis-rank).
   - **covers —** `packages/forest-world/src/ranking.ts`
   - **proven by —** `packages/forest-world/src/forest-world.test.ts`.
4. **`rc-hex-and-sizing-geometry`** — the hex math and tree/territory sizing are correct and stable
   - **asserts —** `hex.ts` computes hex coordinates/geometry and `sizing.ts` derives tree / territory
     sizes consistently for the same input.
   - **covers —** `packages/forest-world/src/hex.ts` (with `sizing.ts`)
   - **proven by —** `packages/forest-world/src/forest-world.test.ts`.
5. **`rc-trail-router-deterministic-network`** — the cost-grid router emits a deterministic shared-segment trail network
   - **asserts —** `routing.ts` routes every edge over the shared cost field (islands blocked, reuse
     discount so trunks emerge) and returns a byte-identical shared-segment network for the same
     `(islands, edges, seed)`; an edge that cannot route with islands blocked re-routes hidden with rim
     cave portals.
   - **covers —** `packages/forest-world/src/routing.ts`
   - **proven by —** `packages/forest-world/src/routing.test.ts`.
6. **`rc-scene-folds-drawables-and-status`** — `buildScene` folds `SceneInput` into typed, status-carrying drawables
   - **asserts —** `buildScene` folds the core's `SceneInput` into a tree of typed drawables (kind /
     variant / already-folded visual status), byte-identically for the same input.
   - **covers —** `packages/forest-world/src/scene.ts` (`buildScene`)
   - **proven by —** `packages/forest-world/src/scene.test.ts`.
7. **`rc-flora-density-is-test-count`** — a parcel's flora density tracks its `testCount`
   - **asserts —** a higher-`testCount` parcel grows strictly more flora on the same island / theme /
     seed (the per-parcel SURFACES density ∝ `testCount`, not parcel area).
   - **covers —** `packages/forest-world/src/scene.ts` (the parcel SURFACES)
   - **proven by —** `packages/forest-world/src/scene.test.ts`.
