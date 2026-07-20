---
id: "art-factory"
tier: story
title: "The art factory — per-object-type parametric factories that bake grounded art through one shared pipeline"
outcome: "Every forest-world object type is grown by its own parametric factory — declared structural relations in, an invariant-checked model and a deterministic draw order through one shared pipeline, baked drawables out to a build-time asset a surface composes — so the grounded-art look is authored once, machine-checked for physical soundness, and never hand-placed per object."
status: mapped
proof_mode: UAT
# Machine-judged: the factory is a pure deterministic MACHINE — declared relations → math → an
# invariant-checked model → a deterministic draw order → baked drawables. There is no integrated
# user JOURNEY to walk (the LOOK is attested elsewhere, ADR-0070 stage 2 / ADR-0219), so its green
# is an `observe` reliability gate over the existing offline suite, observe-and-signed into an
# `adopted` machine verdict (ADR-0085). No DB, no API key, no browser — the math is exercised headless.
uat_witness: machine
arc: grounded-art-machinery-arc
# Three capabilities on the real organ boundaries (ADR-0217 D1 — art factories are per object type):
# the shared PIPELINE (stations 1–4: the model builder + projection, the invariant checker, the
# aperture cut, the deterministic draw order, the bake, and the SVG printer), the BUILDING factory
# (the parametric building modules + the kit roster), and the LANDSCAPE factory (the standing-stone /
# autumn-tree / stepping-stone heroes + the hero-kit roster). Each organ has its own isolatable
# offline suites, so each earns a capability; the split does not go finer (slow growth — no per-module
# capability, because a module has no red→green leg the observed suite does not already give its organ).
capabilities: [art-pipeline, building-factory, landscape-factory]
# Foundational root organism (ADR-0222 D1, standing on ADR-0075 / ADR-0093): the package is
# zero-dependency and browser-safe (`@storytree/procedural-architecture` — pure math + string
# building, no other workspace package, no `node:*`), so it sits at the bottom of the order alongside
# proof-protocol / storage-protocol / forest-world with `depends_on: []`. It stays in the manifest's
# `foundational` subset that carries the minimality rule.
depends_on: []
# Consumed by `apps/studio` (a SURFACE, ADR-0100 — its edge is declared consumer-side in the studio
# story's own `depends_on`, so it does NOT appear here; mirrors forest-world, which does not list the
# studio in `consumed_by` either). No workspace PACKAGE organism imports the factory today —
# forest-world's scene-graph takes the baked defs as opaque surface-supplied data (ADR-0218 / ADR-0221),
# importing nothing from this package — so `consumed_by` is empty.
consumed_by: []
# Deciding ADRs (ADR-0037 §2): the factory-per-object-type design + explicit draw order + kit
# (217); the fenced baked-art scene family the bake feeds (218); generative entry author-time only,
# bridged to checkable vector (219); the garden composition seam / studio fold (221); and the split
# that gives the factory its own story + a spine-signable node (222).
decisions: [217, 218, 219, 221, 222]
---

# The art factory — per-object-type parametric factories that bake grounded art through one shared pipeline

**Outcome —** Every forest-world object type is grown by its own parametric factory — *declared
structural relations in, an invariant-checked model and a deterministic draw order through one shared
pipeline, baked drawables out to a build-time asset a surface composes* — so the grounded-art look is
authored once, machine-checked for physical soundness, and never hand-placed per object.

## What this factory is

`packages/procedural-architecture` is the art factory decided by
[ADR-0217](../../docs/decisions/0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md)
(accepted, `amends` ADR-0214): art is grown from **declared structural relations** rather than typed
coordinates, so a building's parts derive their positions from each other and a pure checker can
refuse a physically-unsound result before a human ever looks. It is pure math + string building —
zero runtime dependencies, browser-safe, depending on no other workspace package.

The factory runs the **stations** of ADR-0217, each layer ignorant of the next (`src/index.ts`):

- **the model builder + projection** (`procedural-utils.ts`) — station 1's surface: vectors, shapes,
  the part-tree builder, the isometric projection.
- **the invariant checker** (`invariants.ts`) — station 2's gate: `check(model) → Violation[]`
  (and `assertSound`), so an unsound model is caught by math, not by eye.
- **the aperture cut** (`apertures.ts`) — an opening is a *hole*: facade cutting and the reveal.
- **the deterministic draw order** (`draw-order.ts`) — station 3: the explicit painter order
  (`orderForPainter`, projection-aware but renderer-ignorant) and its `findDepthConflicts` check.
- **the bake** (`bake.ts`) — station 3's output as DRAWABLES: `bakeBuilding` → `BakedNode`s with
  resolved paint (`THEMES` / `themeFor`), the pipeline minus the document.
- **the SVG printer** (`render-svg.ts`) — the ONE file that knows what an SVG *document* is
  (`render` / `renderDetailed`); swap it for a three.js backend and nothing upstream changes.

On top of that pipeline sit the **per-object-type factories** — a building module (`./buildings/*`)
or a landscape hero (`./landscape/*`) composes the builder and is judged by the checker — and the
**rosters** that bake the whole set to a build-time asset: `KIT` / `bakeKit` → `kit.json` (buildings),
`HERO_KIT` / `bakeHeroKit` → `kit.json` `heroes` (landscape heroes), and `bakeStone` → `stone.json`.
That baked output is exactly the *build-time DATA* ([ADR-0217](../../docs/decisions/0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md))
a surface composes, checked by drift-guard tests and pinned deterministically in git.

## Consumers

The factory's real consumer is `apps/studio`, a consuming **SURFACE**
([ADR-0100](../../docs/decisions/0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md)):
`apps/studio/src/lib/factoryBuildings.ts` imports the baked `@storytree/procedural-architecture/kit.json`
and `/stone.json` and folds them onto the island (ADR-0221). That package edge is declared
**consumer-side** in the studio story's own `depends_on` (per ADR-0100 / ADR-0222 D1), so it does not
appear in this story's `consumed_by` — the same convention forest-world follows for the studio.

The forest-world scene-graph is **not** a package consumer: ADR-0218 / ADR-0221 pass the factory's
baked defs into the shared scene as *opaque surface-supplied data* (`SceneBakedDef` / `SceneBakedUse`),
so `packages/forest-world` imports nothing from this package — the only mention of it there is a comment
naming the data's provenance (`packages/forest-world/src/scene.ts`). No workspace package draws an
inbound package-graph edge, so `consumed_by: []` and `depends_on: []` leave the factory a foundational
root.

## Why it is a foundational root organism

art-factory is a **foundational root organism** ([ADR-0222](../../docs/decisions/0222-split-the-art-factory-into-its-own-story-forest-world-gains.md)
D1, standing on [ADR-0075](../../docs/decisions/0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md)'s
ports-as-root-organisms and [ADR-0093](../../docs/decisions/0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)'s
foundational-root shape) — exactly like `proof-protocol`, `storage-protocol`, and `forest-world`:
`depends_on: []`, the bottom of the dependency order, depending on nothing. `@storytree/procedural-architecture`
is registered in `repo-manifest.json` `packageOwnership.organisms` (→ `art-factory`, moved off
`forest-world` by ADR-0222 D1) and stays in the `foundational` subset that carries the minimality rule.

## Design floor — foundational minimality

The factory MUST stay browser-bundleable (the studio bundles the baked JSON and, through it, the pure
kernel), so it stays pure-math / string-building and **node-free** — zero runtime dependencies, no
`node:*` import. [ADR-0075](../../docs/decisions/0075-model-the-shared-ports-as-root-organisms-collapse-the-substr.md)'s
**foundational-minimality rule** the gate enforces — a foundational organism may only depend on other
foundational organisms — holds by construction here: art-factory depends on nothing.

## Reliability Gates

The factory is **brownfield** (`status: mapped`): `packages/procedural-architecture` has a real,
passing, OFFLINE automated suite (152 tests today) that observationally verifies the whole pipeline and
every per-object-type factory, but storytree's own prove-it-gate never DROVE those proofs red→green. So
its honest path off `mapped` is the author-declared **reliability gate** below, observe-and-signed to an
`adopted` verdict ([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md),
resolving [ADR-0083](../../docs/decisions/0083-author-defined-story-green-declared-obligations-machine-per.md)
Fork B) — the `mapped → healthy` = **Adopt** transition
([ADR-0094](../../docs/decisions/0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md)
d.3, closing the "no story, no spine verdict" gap the grounded-art arc's increment 4 flagged). A pure
deterministic machine has no integrated user JOURNEY to walk, so there is no `## UAT Test Criteria`
section (the appearance is operator-attested separately, ADR-0070 stage 2 / ADR-0219); the gate is the
author's **expandable reliability floor**, starting by adopting the existing green suite and GROWING a
`_(gate: build-tests)_` gate (a genuine red→green regression leg) the moment observation proves
insufficient — a real geometry/physics defect slips a factory past the checker to a surface.

1. **The factory's own suite is green** _(gate: observe)_ _(covers: art-pipeline, building-factory, landscape-factory)_ `pnpm --filter @storytree/procedural-architecture test`.
   The spine runs it at a clean committed HEAD and OBSERVES it green — all **152** offline tests pass
   (no DB, no API key, no browser): the shared pipeline (**art-pipeline**: `core.test.ts`,
   `apertures.test.ts`, `draw-order.test.ts`, `bake.test.ts` — the builder/projection, the invariant
   checker, aperture cutting, the deterministic draw order, and the bake-to-drawables + byte-identical
   SVG determinism), the building factory (**building-factory**: `buildings/*.test.ts` + `kit.test.ts`
   — every parametric building sound across its parameter space, and the kit roster baking
   deterministically), and the landscape factory (**landscape-factory**: `landscape/*.test.ts` +
   `hero-kit.test.ts` — each hero physically sound and cheap, the standing stone baking to a real
   isometric solid, and the hero-kit roster baking into `kit.json` `heroes`) — then signs an `adopted`
   verdict (`storytree gate run art-factory#gate-1 --pg`). The three capabilities above green via this
   gate's `(covers:)` ([ADR-0097](../../docs/decisions/0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)
   §5): each is a brownfield organ whose suite this one command runs, so one observe over the whole
   package is the honest adoption unit, not three separate commands over the same `tsx --test` run.

Adopting this gate flips the factory off `mapped`. `healthy` stays non-authorable
([ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md)) — the authored
frontmatter `status:` stays `mapped`; the world's crown DERIVES green from the signed verdict
([ADR-0040](../../docs/decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md)) and only
when every capability is `healthy` (satisfied here by this gate's `(covers:)`) AND this own-proof
obligation is signed (ADR-0083 Fork A + ADR-0085).

## Proof

**Status off `mapped` is EARNED, not authored.** `packages/procedural-architecture` already has a
real, passing, offline suite (152 tests today — the pipeline's determinism / invariants / draw order /
bake, and every per-object-type factory sound across its parameter space) that observationally verifies
the whole machine; that observational green is brownfield `mapped`. The factory leaves `mapped` exactly
when its `observe` reliability gate above is **adopted**: the spine observes the suite green at a clean
committed HEAD and signs an `adopted` machine verdict
([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)).
`healthy` is non-authorable ([ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md))
— the authored frontmatter `status:` stays `mapped`; the world crown DERIVES green from the signed
verdict.

## Open modeling calls (for the owner)

1. **Per-asset registry seam** (ADR-0222 D3, recorded as direction, not built). Today a new baked asset
   lands as an edit to a shared roster hot file (`kit.ts` / `hero-kit.ts`). Extending ADR-0218's
   define-once/reference-many family so registering a new asset is a per-asset addition — the shape that
   would let parallel art sessions add assets without contending on one roster file — is built when
   sessions actually contend on a roster, not before (slow growth). If it lands, it likely earns its own
   capability here (a real red→green leg: "a new asset registers without touching the roster").
2. **DB-resident art** stays a deferred fork (ADR-0222 D3 / Rejected) needing its own ADR if a concrete
   need arrives (e.g. member-facing customization) — the property is right, the knowledge-tier DB is the
   wrong home while the website consumes synced built output.
