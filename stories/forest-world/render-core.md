---
id: "render-core"
tier: capability
story: forest-world
title: "The render core — the deterministic geometry kernel and framework-agnostic scene-graph both surfaces draw from"
outcome: "The pure geometry kernel (mesh, coast, ranking, hex, sizing) and the framework-agnostic scene-graph (buildScene over the core's own SceneInput) turn story data into byte-identical typed drawables — the one deterministic look both the studio and the website render."
status: proposed
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

> **Proof status (honest) — `proposed`, greenfield without a current signed pass.**
> `packages/forest-world` was built inside this initiative and has a real, passing OFFLINE suite (122
> tests across the geometry kernel, trail router and scene-graph). Neither those standing tests nor
> retrospective capability registration makes it brownfield or Adopt-bound (ADR-0395). This is the
> capability FLOOR (ADR-0222 D2, option A): one capability standing for the render core so the island
> grows honest flora, split no finer until an in-core unit earns its own red→green leg. `healthy` is
> DERIVED from signed proof (ADR-0020 / ADR-0040), never authored.

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

## Contracts (8)

The test-proven leaf behaviours — each **one isolated automated test** in the
`@storytree/forest-world` suite; the suite is evidence, not a provenance verdict.

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
8. **`rc-claim-layer-never-folds-bloom-vocabulary`** — the scene fold's CLAIM layers never wear the
   bloom's visual vocabulary: no bloom drawable kind and no verdict `outcome`, in any grade, on the
   departure layer, or under a green build band (the ADR-0138 §5 honesty wall, in the scene core)
   - **asserts —** the layers `buildScene` folds for claims and departures carry the wall in three
     directions. **(a) Every colour-state:** for `authoring` / `proving` / `supplementing`, the
     `claim-wisps` orbit contains none of `bloom-anchor` / `bloom-crown` / `bloom-plant` /
     `bloom-ring` / `bloom-spark`, and NO node in the walked subtree carries an `outcome` — `proving`
     is the at-risk hue that must not read as the proven-green bloom. **(b) Every grade plus the
     departure layer:** with `exploring` / `waiting` / `work` claims and a departure present, no node
     under `claim-wisps` OR `departing-wisps` has a `kind` containing `bloom`, and none carries an
     `outcome`. **(c) Under a GREEN band (ADR-0212):** folding a claim whose `phase` is `GATE` leaves
     `colourState` still `proving` (green is expressed as MOTION, never overwritten into the claim's
     colour), leaves `outcome` `undefined`, and emits no `bloom` descendant — so a green band never
     turns the claim body into a proof. One-directional by design: the CONVERSE (a bloom renderer
     reaching for claim styling) is not this contract's claim and remains uncovered here.
   - **covers —** `packages/forest-world/src/scene.ts` (`buildScene`, the `claim-wisps` /
     `departing-wisps` layers) — the same fold contract 6 covers; this is its honesty INVARIANT, the
     one property of the fold that is load-bearing beyond determinism, which is why it is declared
     apart rather than folded into `rc-scene-folds-drawables-and-status`.
   - **proven by —** `packages/forest-world/src/scene.test.ts` — three tests, one per direction:
     *"§5 honesty wall: a claim wisp is NEVER a bloom — no bloom/outcome token anywhere on the claim
     layer"*, *"§5 honesty wall holds for EVERY grade + the departure layer: no bloom kind, no verdict
     outcome"*, and *"ADR-0212: folding a GREEN build band never turns the claim body into a proof
     (the §5 wall holds)"*. Offline, in the standing `pnpm --filter @storytree/forest-world test`
     suite that `forest-world#gate-1` observes.
   - **note — declared for CITATION, with no proof-config change.** This contract exists so a
     lower-tier citation of the wall (the ADR-0294 D2 deletion of `wisp-as-story-claim#uat-7`) can
     name a contract id instead of a free-form test title. This capability carries NO `proof:` block
     and none is added: authoring one would change its buildability, which is a separate story-shape
     call. The ADR-0353 contract-coverage sweep therefore does not scan this capability at all — the
     `proven by —` pointer above is the whole binding, and the suite is observed by the story's gate.
