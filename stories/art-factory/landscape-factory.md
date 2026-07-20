---
id: "landscape-factory"
tier: capability
story: art-factory
title: "The landscape factory — hero landscape modules that bake to real isometric solids and the garden hero-kit roster"
outcome: "Each landscape hero (standing-stone, autumn-tree, stepping-stone) is a parametric factory module that builds a sound, cheap model baking to a real isometric solid, and the fixed garden set bakes deterministically into the hero-kit roster a surface composes."
status: mapped
proof_mode: integration-test
depends_on: [art-pipeline]
---

# The landscape factory — hero landscape modules + the garden hero-kit roster

**Outcome —** Each landscape hero (standing-stone, autumn-tree, stepping-stone) is a parametric factory
module that builds a sound, cheap model baking to a real isometric solid, and the fixed garden set bakes
deterministically into the hero-kit roster a surface composes.

**Depends on —** [`art-pipeline`](art-pipeline.md). A landscape hero composes the pipeline's model
builder (station 1), is judged by its invariant checker (station 2), and is baked by the pipeline's bake
— a real within-story code edge onto the pipeline (ADR-0010 §3).

> **Proof status (honest) — `mapped`, brownfield.** The landscape modules have real, passing OFFLINE
> suites (`landscape/*.test.ts`, `hero-kit.test.ts`), but storytree's prove-it-gate never DROVE them
> red→green. This capability greens via the story's `observe` reliability gate (`art-factory#gate-1`,
> `(covers: … landscape-factory)`, ADR-0085 / ADR-0097). `healthy` is DERIVED from the signed adopted
> verdict (ADR-0020 / ADR-0040), never authored.

## Guidance

Each landscape hero is its own factory module (`./landscape/*`, ADR-0217 D1). The **standing-stone**
(ADR-0218, the first landscape object type driven through the factory so it reads as a true isometric
baked solid beside the buildings) bakes via `bakeStone` / `STONE_DEF_ID` into its own build-time asset
`stone.json` — a define-once/reference-many def (`the stone is CHEAP — one def, referenced many`) that
stands on the origin (the placement contract) and carries no world-space receipt. The **autumn-tree**
(`expectedTreePartCount`) is the studio garden-flag central tree (ADR-0221). The **stepping-stone** is
the least-rendered hero (fewest nodes).

The **hero-kit roster** (`hero-kit.ts` — `HERO_KIT` / `bakeHeroKit`) is the fixed, named cosy-island
GARDEN set (grounded-art inc 10): it composes `cottage` + `gazebo` (from the building modules) AND
`autumn-tree` + `stepping-stone` (landscape heroes), all lit uniformly from `KIT_LIGHT_ANGLE` — "a
cottage and a tree standing on one island cast their light the same way, and a test holds it" — and
bakes into `kit.json` under the `heroes` key, the build-time asset `apps/studio/src/lib/factoryBuildings.ts`
folds onto the island. The roster spans two organs on purpose (it is a garden COMPOSITION, not a pure
landscape set); it lives here because the landscape heroes are its defining members and its own
proof is the uniform-light + deterministic-bake roster test.

## Integration test

**Goal —** Build each landscape hero through the real pipeline and assert it is physically sound, cheap,
and bakes to a real isometric solid (standing-stone to `stone.json`, on the origin, no world-space
receipt), then bake the garden hero-kit and assert it bakes deterministically with uniform light — all
against the real landscape modules and the real pipeline (no stubs within the organism).

The integration test exercises landscape-factory against its **real in-story collaborators** — the real
landscape modules, the real building modules the roster draws (`cottage` / `gazebo`), and the real
`art-pipeline` — with no stubs. It would build each hero at its defaults, assert `check`-soundness and
the node-count budgets, bake the standing stone and assert a fresh bake matches the committed
`stone.json`, and bake `HERO_KIT` asserting every entry is lit from the same angle.

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** in the
`@storytree/procedural-architecture` suite, mapped by the story's observe gate.

1. **`lf-standing-stone-bakes-isometric-solid`** — the standing stone bakes to a cheap, origin-placed isometric solid
   - **asserts —** `standingStone(DEFAULTS)` is `check`-sound across its parameter space; `bakeStone`
     produces a real isometric solid (not a flat card), lit from the island sun, standing on the origin
     with no world-space receipt, and CHEAP (one def, far under a building's cost); a fresh bake matches
     the committed `stone.json`.
   - **covers —** `packages/procedural-architecture/src/landscape/standing-stone.ts` (`standingStone` / `bakeStone` / `STONE_DEF_ID`)
   - **proven by —** `packages/procedural-architecture/src/landscape/standing-stone.test.ts`.
2. **`lf-autumn-tree-sound-part-count`** — the autumn tree builds a sound model with the expected part count
   - **asserts —** `autumnTree(DEFAULTS)` builds a `check`-sound model whose part tree matches
     `expectedTreePartCount`, and the shipped defaults are the ones under test.
   - **covers —** `packages/procedural-architecture/src/landscape/autumn-tree.ts` (`autumnTree` / `expectedTreePartCount`)
   - **proven by —** `packages/procedural-architecture/src/landscape/autumn-tree.test.ts`.
3. **`lf-stepping-stone-least-rendered-and-deterministic`** — the stepping stone is the cheapest hero and bakes deterministically
   - **asserts —** `steppingStone(DEFAULTS)` is `check`-sound across its parameter space, stays a handful
     of nodes (the LEAST-rendered hero), and prints a byte-identical SVG on re-run.
   - **covers —** `packages/procedural-architecture/src/landscape/stepping-stone.ts`
   - **proven by —** `packages/procedural-architecture/src/landscape/stepping-stone.test.ts`.
4. **`lf-hero-kit-roster-bakes-uniform-light`** — the garden hero-kit roster bakes deterministically, lit uniformly
   - **asserts —** `bakeHeroKit()` bakes every `HERO_KIT` entry (cottage, gazebo, autumn-tree,
     stepping-stone) to a `BakedHeroEntry`, all lit from the same `KIT_LIGHT_ANGLE`, and the roster bakes
     deterministically into `kit.json` `heroes`.
   - **covers —** `packages/procedural-architecture/src/hero-kit.ts` (`HERO_KIT` / `bakeHeroKit`)
   - **proven by —** `packages/procedural-architecture/src/hero-kit.test.ts`.
