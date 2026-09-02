---
id: "r3f-world-spike"
tier: capability
story: website-experience
title: "The R3F spike — the real forest world rendered in 3D under map controls"
outcome: "packages/forest-world-r3f exists as the ADR-0123 third mapper: a pure, deterministic world-to-3D mapping turns a real @storytree/forest-world World + scene-graph into typed 3D instance descriptors (kind family → mesh, position → transform, folded status → material variant, unknown kind → an explicit skip, never a throw), and a minimal R3F canvas with drei MapControls renders a real World in 3D in the package's dev harness."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [123, 93]
# Node-borne proof config (ADR-0057 keystone). NET-NEW: the leaf authors a node:test file importing a
# NOT-YET-EXISTING pure module from packages/forest-world-r3f/src (red = module-not-found at HEAD),
# then writes that module (green). PRE-STEP (documented glue, ADR-0031 §2 — a leaf can never touch
# package.json): the ORCHESTRATOR scaffolds the package FIRST — package.json (name
# @storytree/forest-world-r3f; deps: @storytree/forest-world workspace:*, three, @react-three/fiber,
# @react-three/drei, react; devDeps: tsx, typescript, @types/node, @types/three), tsconfig, the
# repo-manifest.json packageOwnership.organisms entry (forest-world-r3f → website-experience) — and
# only then arms this leaf. The armed slice is the PURE mapping layer (world-to-3d.ts): it imports
# @storytree/forest-world VALUES (buildScene over the core's own SceneInput contract — buildWorld is
# studio chrome, deliberately surface-side per ADR-0093) to make a real scene-graph fixture, so
# install: true + the typecheck wall (tsx strips types; only tsc sees strict-flag violations).
# The R3F component shell + the MapControls dev harness are part of this capability's OUTCOME but
# NOT the leaf's red→green slice — they are orchestrator/frontend glue witnessed by eyes (a canvas
# has no honest node:test oracle; ADR-0070 posture), while the mapping the canvas draws from is the
# machine-proven heart.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/forest-world-r3f", "test"]
  scope:
    testGlobs: ["packages/forest-world-r3f/src/**/*.test.ts"]
    sourceGlobs: ["packages/forest-world-r3f/src/**/*.ts", "packages/forest-world-r3f/src/**/*.tsx"]
  real:
    testFile: "packages/forest-world-r3f/src/world-to-3d.test.ts"
    sourceFile: "packages/forest-world-r3f/src/world-to-3d.ts"
    scope:
      testGlobs: ["packages/forest-world-r3f/src/world-to-3d.test.ts"]
      sourceGlobs: ["packages/forest-world-r3f/src/world-to-3d.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/forest-world-r3f", "typecheck"]
---

# The R3F spike — the real forest world rendered in 3D under map controls

**Outcome —** `packages/forest-world-r3f` exists as the
ADR-0123
third mapper: a pure, deterministic **world-to-3D mapping** turns a real `@storytree/forest-world`
`World` + scene-graph into typed 3D instance descriptors, and a minimal R3F canvas with drei
`MapControls` renders a real `World` in 3D in the package's dev harness.

**Depends on —** (root — no within-story upstream; its one cross-story seam is
`@storytree/forest-world`, rolled up into the story's `depends_on`.)

> **Proof status (honest) — BUILT, leaf-proven; the authored status stays `proposed`.** The gated
> SDK leaf authored `world-to-3d.test.ts` red → `world-to-3d.ts` green through the real
> prove-it-gate (run `real-mr2pftl5`, signed PASS @ `a4993f9` 2026-07-02, persisted to
> `events.verdict`; package typecheck + suite observed green in the installed worktree), the three
> contracts are cited at real `file:line` below (`storytree coverage r3f-world-spike` → 3/3), and
> the R3F canvas + drei `MapControls` dev harness (`pnpm --filter @storytree/forest-world-r3f dev`)
> draws a real `buildScene` world in 3D — the eyes-witnessed half. 3D risk is retired before any
> experience work stands on it; `healthy` stays earned, never authored (ADR-0020) — the crown
> derives from the signed verdict.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: it is the birth of one module family — the descriptor
mapping, its package, and the harness that proves the stack end-to-end against the REAL core (a real
`buildScene` output over the core's own `SceneInput` contract, not a hand-rolled scene shape) — not a
single isolated assertion.

THE MAPPER CONSUMES THE SEMANTIC LAYER, NOT THE 2D PRIMITIVES (ADR-0123 §1 — hold this line
precisely). Input: the `World` geometry + the scene-graph's `kind` / position / `variant` / folded
`SceneStatus`. The mapper SUPPLIES its own 3D geometry where the SVG primitive geometry would
otherwise be consumed: the ground family becomes an instanced extruded prism; the story
tree family (`trunk`/`crown-*`/`bare`) becomes a 3D tree; a `road` becomes a path strip on the
ground; a `wisp` becomes a GPU sprite/point. The deterministic world-computation is REUSED, never
re-derived — we draw the EXISTING world in 3D.

WHICH GROUND FAMILY — CORRECTED 2026-09-02 (`adopt-the-land-into-the-shipped-map-arc`,
`retire-the-old-land-path`). This capability was authored when the ground family the mapper drew was
the CLASSIC extruded-hex one (`tile` groups, which the core emits when `relaxedCells` is null), and
every "hex ground" reading below said so. That substrate is RETIRED: the 3D map draws the
RELAXED-MESH land ONLY — the core's `cell` / `cell-wheat` paths, one per parcel, folded into
`cell-ground` descriptors carrying the parcel's closed ring of points and its folded `SceneStatus`.
A `tile` group is no longer mapped, and it is not skipped either: `worldTo3D` REFUSES it at the
first `tile` node it walks, with the message
`world-to-3d: the 3D map draws the relaxed-mesh land only — the classic extruded-hex ground was
retired (adopt-the-land-into-the-shipped-map-arc, retire-the-old-land-path); build the scene with
relaxedCells, not drawTiles`. A silent skip was the wrong shape for the retirement: `tile` is a kind
this mapper understood and used to draw, so degrading it to a skip would have reproduced the
2026-08-28 defect (a shipped island with no ground at all) with no record that anything had gone
wrong. `packages/forest-world`'s own two-substrate contract is untouched — the studio's 2D SVG map
still owns classic mode; what changed is which of the two the 3D mapper accepts.

DESCRIPTORS FIRST, JSX SECOND (the provability firewall). The heart is `world-to-3d.ts`: a pure
`.ts` function from the semantic layer to an array/graph of typed **instance descriptors** (mesh
kind, transform, instancing group, material variant from status). No React, no three.js import
needed for the mapping itself — so it is node:test-provable, headless, deterministic. The thin
`.tsx` layer (`<ForestWorldCanvas>`: descriptors → `<Instances>`/meshes + drei `MapControls`,
`ssr:false` posture) and the dev harness (a tiny vite page inside the package, dev-only, never
shipped) are the glue that makes the spike VISIBLE; their look is witnessed, not machine-judged
(ADR-0070). Keep every browser-only import out of the pure module.

SPIKE SCALE, NOT GOLD PLATE. The spike maps the CORE kind families (the relaxed-mesh parcel ground,
the story tree, roads, wisps) and must be TOTAL over the rest: an unhandled `SceneKind` yields an
explicit `skipped` descriptor — visible in output, never a throw, never a silent drop. Totality is
about kinds the mapper has never heard of; the retired `tile` substrate above is the ONE deliberate
exception, and it refuses rather than skips precisely because it is not one of them. The painterly
art direction, LOD, and shader work are deliberately OUT (ADR-0123 names them the true cost centres;
they arrive with the experience caps and the owner's perf-budget call).

SCAFFOLD IS GLUE (the documented pre-step). The orchestrator creates the package (deps above,
`typecheck`/`test` scripts mirroring `forest-world`'s), registers ownership in `repo-manifest.json`
(`forest-world-r3f → website-experience` — `check:boundaries` then covers the
`forest-world-r3f → @storytree/forest-world` code edge via the story's declared `depends_on`), and
updates the root-surface expectations the gate asserts. Only then does the leaf drive
`world-to-3d.test.ts` red→green.

## Integration test

**Goal —** Prove the world-to-3D mapping over the REAL core: a genuine `buildScene` scene-graph
input maps deterministically to typed 3D descriptors that carry the semantic layer faithfully.

1. Build a real scene from a small `SceneInput` via `@storytree/forest-world`'s `buildScene` (the
   core's OWN minimal structural input contract both existing mappers ride — `buildWorld` is studio
   chrome, deliberately surface-side per ADR-0093). Run `worldTo3d` twice → assert the outputs
   are deep-equal (determinism — the core's discipline carried into 3D).
2. Assert the core kind families each produced their descriptor branch: ≥1 instanced `cell-ground`
   descriptor per relaxed-mesh parcel, carrying that parcel's real (non-collapsing) ring of points
   and its folded status; a tree descriptor for a story node; a road descriptor for a dependency
   edge; a wisp-family descriptor when the scene carries one. And assert the RETIRED substrate's
   refusal: a scene the core built the classic way (`relaxedCells: null`, so it emits `tile`
   groups) makes `worldTo3D` throw `world-to-3d: the 3D map draws the relaxed-mesh land only — the
   classic extruded-hex ground was retired (adopt-the-land-into-the-shipped-map-arc,
   retire-the-old-land-path); build the scene with relaxedCells, not drawTiles` — the message
   pinned in FULL, because a mutant that softened or genericised the wording slips past a loose
   match.
3. Feed a scene node wearing each folded `SceneStatus` (`healthy` / `building` / `unhealthy` /
   `proposed`) → assert the descriptor's material/mesh variant differs by status (a proof-state
   change is VISIBLE in 3D — the observability thesis survives the mapper).
4. Feed a drawable with an unhandled/unknown `kind` → assert an explicit `skipped` descriptor (with
   the kind named) and no throw — the mapping is total and fail-visible.

## Contracts (3)

Each one isolated automated test (`node:test`, the package suite), cited at real `file:line`. Per
ADR-0122 each contract id leads a distinctly-named test; `storytree coverage r3f-world-spike`
reports 3/3.

1. **`r3f-mapping-is-deterministic`** — same World in, same descriptors out
   - **asserts —** two `worldTo3d` runs over the same real `buildScene` output are deep-equal, and
     descriptor ordering is stable — the 3D layer inherits the core's determinism, so the synced
     artifact can be drift-gated byte-stably.
   - **covers —** `packages/forest-world-r3f/src/world-to-3d.ts` — test:
     `packages/forest-world-r3f/src/world-to-3d.test.ts:155`
2. **`r3f-semantic-layer-maps-faithfully`** — kind → mesh family, position → transform, status → variant
   - **asserts —** the core kind families (relaxed-mesh parcel ground → `cell-ground`, story tree,
     road, wisp) each yield their typed descriptor branch with transforms derived from the World
     geometry, and each folded `SceneStatus` selects a distinct material/mesh variant; a scene
     carrying the RETIRED classic `tile` ground is refused outright rather than mapped or skipped.
   - **covers —** `packages/forest-world-r3f/src/world-to-3d.ts` — test:
     `packages/forest-world-r3f/src/world-to-3d.test.ts:167`
3. **`r3f-unknown-kind-skips-visibly`** — the mapping is total over kinds it has never heard of
   - **asserts —** an unhandled `SceneKind` maps to an explicit `skipped` descriptor naming the
     kind; nothing is silently dropped and nothing throws — a core addition can never crash the
     site's 3D island, only degrade visibly. (The retired classic `tile` ground is NOT an unhandled
     kind and is outside this contract: it is one the mapper understood and drew, so it refuses
     loudly instead — see the corrected ground-family note in Guidance.)
   - **covers —** `packages/forest-world-r3f/src/world-to-3d.ts` — test:
     `packages/forest-world-r3f/src/world-to-3d.test.ts:375`

## Guidance — the slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW), AFTER the orchestrator's scaffold glue:

- **The new test —** `packages/forest-world-r3f/src/world-to-3d.test.ts` (`node:test` +
  `node:assert/strict`, the workspace convention). Import `{ worldTo3d }` from `"./world-to-3d.js"`
  and the real core from `@storytree/forest-world`. Name each test for its contract id (`r3f-…`).
- **The RED the spine observes —** the import resolves nothing: `world-to-3d.ts` does not exist at
  HEAD (the net-new missing-symbol red).
- **The GREEN —** write `world-to-3d.ts`: the pure semantic-layer → descriptor mapping above (no
  React/three imports in this module). The `.tsx` canvas + MapControls harness land as follow-on
  glue in the same capability, witnessed by eyes; after the leaf, the package suite + typecheck are
  green.

Rules:

- **Consume the semantic layer only** — never re-derive geometry, never import the 2D SVG shapes.
- **Pure module / component split is the firewall** — `world-to-3d.ts` must stay importable under
  bare node:test; browser-only code lives in `.tsx` files beside it.
- **Total mapping** — unknown kinds skip visibly; the mapper may lag the core, never crash on it.
  The one exception is a kind it USED to draw: the retired classic `tile` ground refuses loudly
  (corrected 2026-09-02, above), because a skip there means an island with no ground at all.
- **No art direction here** — the spike proves the stack; the look is later, owner-witnessed work.
