---
id: "building-factory"
tier: capability
story: art-factory
title: "The building factory — parametric building modules that build sound models and bake to the kit roster"
outcome: "Each building type (mushroom-dwelling, forest-windmill, tiered-pagoda, cottage, gazebo) is a parametric factory module that builds a physically-sound model across its parameter space and bakes, with the whole set, deterministically into the kit roster a surface composes."
status: mapped
proof_mode: integration-test
depends_on: [art-pipeline]
---

# The building factory — parametric building modules + the kit roster

**Outcome —** Each building type (mushroom-dwelling, forest-windmill, tiered-pagoda, cottage, gazebo)
is a parametric factory module that builds a physically-sound model across its parameter space and
bakes, with the whole set, deterministically into the kit roster a surface composes.

**Depends on —** [`art-pipeline`](art-pipeline.md). A building module composes the pipeline's model
builder (station 1) and is judged by its invariant checker (station 2), then baked by `bakeBuilding` —
a real within-story code edge onto the pipeline (ADR-0010 §3).

> **Proof status (honest) — `mapped`, brownfield.** The building modules have real, passing OFFLINE
> suites (`buildings/*.test.ts`, `kit.test.ts`), but storytree's prove-it-gate never DROVE them
> red→green. This capability greens via the story's `observe` reliability gate (`art-factory#gate-1`,
> `(covers: … building-factory …)`, ADR-0085 / ADR-0097). `healthy` is DERIVED from the signed adopted
> verdict (ADR-0020 / ADR-0040), never authored.

## Guidance

Every building is its own factory module (`./buildings/*`, ADR-0217 D1: art factories are per object
type), each naming its parameter block `DEFAULTS` and its builder a `<name>` function
(`mushroomDwelling` / `forestWindmill` / `tieredPagoda` / `cottage` / `gazebo`); the barrel
disambiguates the `DEFAULTS` per building rather than picking a winner (`src/index.ts`). A module builds
a part-tree through `procedural-utils` and is validated by `check` / `assertSound` — soundness is proven
NOT just at defaults but ACROSS the parameter space (the suite sweeps parameters and re-checks). The
roster (`kit.ts` — `KIT` / `bakeKit`, `KIT_LIGHT_ANGLE`) bakes the whole set into `kit.json`, the
build-time asset `apps/studio/src/lib/factoryBuildings.ts` folds onto the island; the committed bake is
guarded against drift (a fresh bake must match the committed one). `tiered-pagoda` has no own
`.test.ts` file — it is covered by `buildings/new-buildings.test.ts` alongside the newer buildings.

## Integration test

**Goal —** Build each building type through the real pipeline and assert it is physically sound across
its parameter space, then bake the whole kit and assert the roster bakes deterministically to the
committed `kit.json` — against the real building modules and the real pipeline (no stubs within the
organism).

The integration test exercises building-factory against its **real in-story collaborators** — the real
building modules and the real `art-pipeline` (`check` / `bakeBuilding`) — with no stubs. It would build
each building at its `DEFAULTS` and at swept parameters, assert `check` returns no violations for each,
`bakeKit` produces `BakedKitEntry[]` for the whole roster, and a fresh kit bake matches the committed
`kit.json`.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** in the
`@storytree/procedural-architecture` suite, mapped by the story's observe gate.

1. **`bf-mushroom-dwelling-sound-and-part-count`** — mushroom-dwelling builds a sound model with the expected part count
   - **asserts —** `mushroomDwelling(DEFAULTS)` builds a model `check`-sound at defaults and across its
     parameter space, with `expectedPartCount` matching the built part tree.
   - **covers —** `packages/procedural-architecture/src/buildings/mushroom-dwelling.ts`
   - **proven by —** `packages/procedural-architecture/src/buildings/mushroom-dwelling.test.ts`.
2. **`bf-forest-windmill-sound`** — forest-windmill builds a sound model across its parameter space
   - **asserts —** `forestWindmill(DEFAULTS)` and swept parameters build `check`-sound models (the
     windmill's blades / tower relations hold).
   - **covers —** `packages/procedural-architecture/src/buildings/forest-windmill.ts`
   - **proven by —** `packages/procedural-architecture/src/buildings/forest-windmill.test.ts`.
3. **`bf-tiered-pagoda-sound`** — tiered-pagoda builds a sound stacked model
   - **asserts —** `tieredPagoda(DEFAULTS)` builds a `check`-sound tiered model (each tier supported by
     the one below within `minSupport`).
   - **covers —** `packages/procedural-architecture/src/buildings/tiered-pagoda.ts`
   - **proven by —** `packages/procedural-architecture/src/buildings/new-buildings.test.ts`.
4. **`bf-cottage-sound`** — cottage builds a sound model at its defaults and across parameters
   - **asserts —** `cottage(DEFAULTS)` builds a `check`-sound model; the shipped defaults are the ones
     under test.
   - **covers —** `packages/procedural-architecture/src/buildings/cottage.ts`
   - **proven by —** `packages/procedural-architecture/src/buildings/cottage.test.ts`.
5. **`bf-gazebo-sound`** — gazebo builds a sound open-structure model
   - **asserts —** `gazebo(DEFAULTS)` builds a `check`-sound model (the open gazebo's roof-on-posts
     relations hold).
   - **covers —** `packages/procedural-architecture/src/buildings/gazebo.ts`
   - **proven by —** `packages/procedural-architecture/src/buildings/gazebo.test.ts`.
6. **`bf-kit-roster-bakes-deterministically`** — the kit roster bakes the whole set to a stable `kit.json`
   - **asserts —** `bakeKit()` bakes every `KIT` entry to a `BakedKitEntry`, lit from `KIT_LIGHT_ANGLE`,
     and a fresh bake matches the committed `kit.json` byte-for-byte (the drift guard).
   - **covers —** `packages/procedural-architecture/src/kit.ts` (`KIT` / `bakeKit` / `KIT_LIGHT_ANGLE`)
   - **proven by —** `packages/procedural-architecture/src/kit.test.ts`.
