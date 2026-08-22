---
id: "art-factory"
tier: story
title: "The art factory — per-object-type parametric factories that bake grounded art through one shared pipeline"
outcome: "Every forest-world object type is grown by its own parametric factory — declared structural relations in, an invariant-checked model and a deterministic draw order through one shared pipeline, baked drawables out to a build-time asset a surface composes — so the grounded-art look is authored once, machine-checked for physical soundness, and never hand-placed per object."
status: proposed
proof_mode: UAT
# Machine-judged: the factory is a pure deterministic MACHINE — declared relations → math → an
# invariant-checked model → a deterministic draw order → baked drawables. There is no integrated
# user JOURNEY to walk (the LOOK is attested elsewhere, ADR-0070 stage 2 / ADR-0219), so its green
# remains unsigned until its greenfield proof obligations earn current verdicts. The author-declared
# observe gate runs the implemented factory organs' offline suite through the deterministic spine;
# the suite alone is not a current signed pass or brownfield provenance (ADR-0395).
uat_witness: machine
arc: grounded-art-machinery-arc
# Four capabilities on the real organ boundaries (ADR-0217 D1 — art factories are per object type):
# the shared PIPELINE (stations 1–4: the model builder + projection, the invariant checker, the
# aperture cut, the deterministic draw order, the bake, and the SVG printer), the BUILDING factory
# (the parametric building modules + the kit roster), the LANDSCAPE factory (the standing-stone /
# autumn-tree / stepping-stone heroes + the hero-kit roster), and the author-time BLOCKING-SUBSTRATE
# adapter (ADR-0225 — a vendor-swappable generative-3D adapter that PRODUCES the maquette an author
# re-authors into a checkable factory input; a distinct organ from the factories, which consume such an
# input). Each organ has its own isolatable suite, so each earns a capability; the split does not go
# finer (slow growth — no per-module capability, because a module has no red→green leg the observed
# suite does not already give its organ). All four organs are greenfield `proposed`; retrospective
# registration of the three implemented factory organs does not make them brownfield (ADR-0395).
capabilities: [art-pipeline, building-factory, landscape-factory, blocking-substrate-adapter]
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
# bridged to checkable vector (219); the garden composition seam / studio fold (221); the split
# that gives the factory its own story + a spine-signable node (222); and the generative-3D
# blocking-substrate adapter that produces the bridge substrate author-time via a vendor-swappable
# adapter, NVIDIA Edify first (225).
decisions: [217, 218, 219, 221, 222, 225]
---

# The art factory — per-object-type parametric factories that bake grounded art through one shared pipeline

**Outcome —** Every forest-world object type is grown by its own parametric factory — *declared
structural relations in, an invariant-checked model and a deterministic draw order through one shared
pipeline, baked drawables out to a build-time asset a surface composes* — so the grounded-art look is
authored once, machine-checked for physical soundness, and never hand-placed per object.

## What this factory is

`packages/procedural-architecture` is the art factory decided by
ADR-0217
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
That baked output is exactly the *build-time DATA* (ADR-0217)
a surface composes, checked by drift-guard tests and pinned deterministically in git.

## The author-time blocking-substrate adapter (greenfield, unbuilt)

Upstream of the factories sits one more organ, the fourth capability
[`blocking-substrate-adapter`](blocking-substrate-adapter.md), decided by
ADR-0225
(amending ADR-0219
D2). It is the "net-new authoring tooling" ADR-0219 deferred: a **vendor-swappable, author-time
`(prompt, concept image) → block` adapter** that has a generative-3D model PRODUCE the bridge's blocking
substrate (the light ortho/parametric maquette) instead of an author hand-building the rig. NVIDIA Edify
(via the Shutterstock / Getty NVIDIA NIM services) is the first block-producing backend; Google/Gemini
stays an optional image-reference backend; Adobe is excluded (ADR-0225).

It is a **distinct organ** from the per-object-type factories: the factories CONSUME a re-authored
checkable input and prove soundness + bake; the adapter PRODUCES the reference an author re-authors into
such an input. Its load-bearing invariants are ADR-0219's, unchanged — **author-time only** (never in
the deterministic build, the runtime, or per-instance), the **maquette is thrown away**, the
**re-authored checkable vector is the source of truth**, the existing checker governs, and the shipped
map stays **2.5D-isometric** (a generated mesh is never the shipped asset). Because it holds a network
client + an owner-provided credential, it does NOT live in `@storytree/procedural-architecture` (the
browser-bundleable foundational root, ADR-0075 / ADR-0222); the recommendation is a new sibling
author-tool package depending on the factory — see the capability spec.

Unlike the three implemented factory organs, this adapter is **greenfield and unbuilt**: it is
authored as the provable journey + contract set and greens by BUILD
(ADR-0094:
*proposed builds*), not by the observe gate. Its offline core (the vendor-swappable interface,
author-selection, and the re-author hand-off to the real checker) is provable without any credential;
only the live NVIDIA-Edify backend leg is credential-gated. The story-green crown therefore stays dark
until its capabilities earn current signed verdicts — the honest state today.

## Consumers

The factory's real consumer is `apps/studio`, a consuming **SURFACE**
(ADR-0100):
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

art-factory is a **foundational root organism** (ADR-0222
D1, standing on ADR-0075's
ports-as-root-organisms and ADR-0093's
foundational-root shape) — exactly like `proof-protocol`, `storage-protocol`, and `forest-world`:
`depends_on: []`, the bottom of the dependency order, depending on nothing. `@storytree/procedural-architecture`
is registered in `repo-manifest.json` `packageOwnership.organisms` (→ `art-factory`, moved off
`forest-world` by ADR-0222 D1) and stays in the `foundational` subset that carries the minimality rule.

## Design floor — foundational minimality

The factory MUST stay browser-bundleable (the studio bundles the baked JSON and, through it, the pure
kernel), so it stays pure-math / string-building and **node-free** — zero runtime dependencies, no
`node:*` import. ADR-0075's
**foundational-minimality rule** the gate enforces — a foundational organism may only depend on other
foundational organisms — holds by construction here: art-factory depends on nothing.

## Reliability Gates

The factory is **greenfield** (`status: proposed`): `packages/procedural-architecture` was built inside
this initiative before its story/capability files were authored. Its real, passing OFFLINE automated
suite is useful evidence, but implementation or test registration order does not establish brownfield
provenance and an authored gate does not manufacture a current signed pass
(ADR-0395).
A pure deterministic machine has no integrated user JOURNEY to walk, so there is no `## UAT Test
Criteria` section (the appearance is operator-attested separately, ADR-0070 stage 2 / ADR-0219). The
author-declared observe gate below is the implemented organs' machine own-proof: the suite is the
evidence surface, while only the deterministic spine observing it green at a clean committed HEAD and
persisting an `adopted` verdict signs `art-factory#gate-1`. Its explicit `(covers:)` is deliberately
limited to the three implemented factory organs. It does not cover or imply completion of the
greenfield, unbuilt `blocking-substrate-adapter`.

1. **The implemented factory organs' suite is green** _(gate: observe)_ _(covers: art-pipeline, building-factory, landscape-factory)_
   `pnpm --filter @storytree/procedural-architecture test`. The offline suite exercises
   (no DB, no API key, no browser): the shared pipeline (**art-pipeline**: `core.test.ts`,
   `apertures.test.ts`, `draw-order.test.ts`, `bake.test.ts` — the builder/projection, the invariant
   checker, aperture cutting, the deterministic draw order, and the bake-to-drawables + byte-identical
   SVG determinism), the building factory (**building-factory**: `buildings/*.test.ts` + `kit.test.ts`
   — every parametric building sound across its parameter space, and the kit roster baking
   deterministically), and the landscape factory (**landscape-factory**: `landscape/*.test.ts` +
   `hero-kit.test.ts` — each hero physically sound and cheap, the standing stone baking to a real
   isometric solid, and the hero-kit roster baking into `kit.json` `heroes`). One command covers the
   package honestly; it does not by itself sign or adopt the three greenfield capabilities. From a
   clean committed HEAD, `storytree gate run art-factory#gate-1 --pg` makes the spine observe this
   exact command and sign only when it exits green. The capability floor remains expandable when a
   real defect or separable new organ earns its own red→green leg.

## Proof

**Green remains earned, not authored.** `packages/procedural-architecture` has a real, passing offline
suite and now declares that suite as `art-factory#gate-1`; neither the command nor its authored gate is
itself a pass. The authored rung remains `proposed` until the deterministic spine observes the command
green at a clean committed HEAD and persists the signed gate verdict. That gate can green only
`art-pipeline`, `building-factory`, and `landscape-factory`. The unbuilt
`blocking-substrate-adapter` remains unproven and therefore still holds the story crown short of
healthy (ADR-0020 / ADR-0040 / ADR-0085 / ADR-0395).

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
