---
id: "organism-boundary-tooling"
tier: capability
story: cli
title: "The organism-boundary analyser — the pure judge behind check:boundaries (the blocking gate + the non-blocking drift report)"
outcome: "The pure organism-boundary analyser the CLI's check:boundaries builds on: the blocking subgraph judge (every real cross-organism code edge is a declared cross-story edge) and the non-blocking declared-edge drift report (declared edges with no code backing, deriving virtual stories' real edges from their units' sourceFile imports)."
status: mapped
proof_mode: integration-test
depends_on: []
---

# The organism-boundary analyser — the pure judge behind `check:boundaries`

**Outcome —** The pure organism-boundary analyser the CLI's `check:boundaries` builds on: the BLOCKING
subgraph judge (`packages/cli/src/boundaries.ts` — every real cross-organism CODE edge must be a
declared cross-story edge, [ADR-0074](../../docs/decisions/0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md))
AND the NON-BLOCKING declared-edge **drift report** ([ADR-0115](../../docs/decisions/0115-detect-declared-edge-drift-derive-virtual-story-edges-from-s.md))
— per story, the declared edges with no code backing (drift candidates) and the backed-but-undeclared
edges, deriving a **virtual** story's real edges from its capabilities'/contracts' `proof.real.sourceFile`
imports.

> **Why this is its own capability (placement, story-author call).** `boundaries.ts` is the CLI-resident
> PURE judge `check:boundaries` ([`check-boundaries.ts`](../../packages/cli/src/check-boundaries.ts))
> gathers disk inputs for — genuinely CLI-resident (it rides the CLI's test surface,
> `boundaries.test.ts`), but a DISTINCT competence from [`cli-resident-corpus-tools`](cli-resident-corpus-tools.md)
> (the `stories/` YAML guard + the ADR frontmatter parser). The boundary analyser was previously
> unbounded to any unit; this capability homes it. Its journey is one analyser over one gathered
> boundary-input graph, with two readers — the blocking gate and the drift report — sharing the same
> computed declared-vs-code graphs.

## Guidance

- **The judge is PURE; the disk I/O is the gatherer's.** `boundaries.ts` takes a gathered
  `BoundaryInput` (the package dep graph + each story's `depends_on`/`consumed_by` + the ownership map +
  the source-import findings) and JUDGES it — no `fs`, no spawning — so the rule set is exhaustively
  unit-testable offline (`node:test` + `node:assert/strict`, builtins + `./boundaries.js` only, no
  `@storytree/*` value imports). `check-boundaries.ts` gathers the inputs from disk and wires the
  CLI/gate; that non-leaf I/O glue is NOT this capability's provable surface.
- **The blocking gate (ADR-0074) is brownfield (`mapped`).** The subgraph check + the v2 source-import
  scan + acyclicity (`checkBoundaries`, `mergeDeclaredGraph`, `findCycle`, `extractImports`, …) have a
  real, passing, OFFLINE suite, but storytree's prove-it-gate never DROVE them red→green — so they are
  observationally verified `mapped`, not `healthy`. The `boundary-judge-subgraph` contract records that
  honestly; it is not a net-new `--real` build.
- **The drift report (ADR-0115) is a non-blocking SIBLING to the gate**, not a change to it: the gate
  still REFUSES undeclared real couplings; the report only WARNS about declared edges with no code
  backing, surfacing drift candidates for periodic human / `librarian-curator` review. It reuses the
  already-written `extractImports` and the already-maintained `proof.real.sourceFile` fields — no new
  authoring burden, no new language, no build step. **It was AUTHORED as this capability's net-new
  provable slice but was DELIVERED by hand**, in an ordinary `feat(cli)` commit rather than a `--real`
  build, so storytree's gate never drove it red→green either — it is `mapped` on the same brownfield
  honesty as `boundary-judge-subgraph`, and its `real:` arm is retained for a future re-proof. The two
  blocking rules below (`hosted-story-landlord-rule`, `packages-forward-refusal`) are this capability's
  only spine-driven red→green work.
- **The report does NOT auto-classify legitimate-vs-drift.** A declared-but-unbacked edge is frequently
  LEGITIMATE (a build-artifact / IoC-injected honesty edge), so the report surfaces CANDIDATES for review
  and never decides; blocking on one would be wrong (ADR-0115 d.3/d.4).

## Integration test

**Goal —** Prove the analyser, over a gathered boundary graph, (a) still flags an undeclared real
cross-story code edge (the blocking gate, ADR-0074) and (b) emits a non-blocking drift report that, for a
VIRTUAL story (one owning no package), derives the story's real edges from its units' `proof.real.sourceFile`
imports and lists the declared-but-code-unbacked edges — all as a pure data transform with no I/O.

The integration test exercises the analyser against its **real in-capability collaborators** — the real
`extractImports` over real source-file text and the real `mergeDeclaredGraph`/set-difference over a
real-shaped declared graph — with the boundary inputs supplied as in-memory fixtures (no disk; the disk
gatherer is `check-boundaries.ts`'s glue, out of scope here).

The integration test would:

1. Feed a fixture where a package-owning story has a real `@storytree/*` import with no declared edge →
   assert the blocking judge still reports the undeclared cross-story coupling (ADR-0074 unchanged).
2. Feed the `headless-orchestrator` fixture — a SYNTHETIC fixture, not a live story: a VIRTUAL story
   (owns no package) declaring `depends_on: [agent, drive-machinery, library, notice-board]`, supplied
   with an in-memory source text modelled on the import head of `packages/drive/src/orchestrate.ts`,
   which value-imports `@storytree/agent` + `@storytree/library/store` at runtime and
   `@storytree/storage-protocol` TYPE-ONLY → assert the report derives runtime edges `{agent, library}`
   (a subpath specifier reduces to its bare package before the ownership lookup), flags `drive-machinery`
   + `notice-board` as declared-but-unbacked drift candidates, and does NOT flag `storage-protocol`
   (type-only, skipped). *(The story it is named for was RETIRED with
   [ADR-0175](../../docs/decisions/0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md)
   and its `orchestrator-composition` capability had its `real:` arm dropped, so it cites no
   `proof.real.sourceFile` and derives nothing — the fixture keeps the name as the ADR-0115 case it was
   drawn from. `packages/drive/src/orchestrate.ts` itself still exists: ADR-0175's deliberately KEPT
   half. It is the CITATION that is gone, not the file.)*
3. Assert the report is non-blocking — it returns the drift lists as data and never raises a violation /
   fails the gate (the gate's blocking violations and the report's drift candidates are separate outputs).

## Contracts (4)

1. **`boundary-judge-subgraph`** — the blocking judge: a real cross-organism code edge with no declared
   cross-story edge is a violation; acyclicity + the source-import scan hold (ADR-0074, brownfield)
   - **asserts —** `checkBoundaries` reports an undeclared cross-story coupling when a package's real
     `@storytree/*` dependency is not covered by either endpoint's declaration (`depends_on` ∪
     `consumed_by`), accepts a covered edge, flags a cross-story cycle in the merged declared graph, and
     flags the v2 source-import escapes (cross-package relative import; devDep/undeclared runtime import).
     *(Brownfield `mapped`: observed green by the existing `boundaries.test.ts`, not driven red→green by
     storytree's gate — no net-new `proof.real` build.)*
2. **`declared-edge-drift-report`** — the non-blocking report: per story, the declared edges with no code
   backing (and the backed-but-undeclared edges), deriving a virtual story's real edges from its units'
   `proof.real.sourceFile` imports (ADR-0115)
   - **asserts —** a pure function computes, per story, the set difference between the DECLARED graph
     (`depends_on` ∪ inverse(`consumed_by`)) and the REAL code-edge graph, returning **declared-but-unbacked**
     (drift candidates) and **backed-but-undeclared** edges. For a VIRTUAL story (owns no package) it
     DERIVES the real edges by mapping the `@storytree/*` imports found by `extractImports` in the story's
     units' `sourceFile`s back to owning stories, skipping `import type` (type-only) imports and test
     scaffolding. On the SYNTHETIC `headless-orchestrator` fixture (declared `[agent, drive-machinery,
     library, notice-board]`; an in-memory source text modelled on `orchestrate.ts` runtime-imports
     agent + library, type-only `storage-protocol`) the report flags `drive-machinery` and
     `notice-board` as declared-but-unbacked and does NOT flag `storage-protocol`; it surfaces
     candidates only (no legitimate-vs-drift auto-classification) and is non-blocking (report data,
     never a gate failure).
   - **proven by —** `packages/cli/src/boundaries.test.ts` — the `declaredEdgeDriftReport: …` cases,
     passing at HEAD against `declaredEdgeDriftReport` / `formatDriftReport` in
     `packages/cli/src/boundaries.ts`. *(Brownfield `mapped`: delivered by an ordinary hand-authored
     commit rather than a `--real` build, so no signed verdict backs it — see the Guidance note above.)*
3. **`hosted-story-landlord-rule`** — the blocking landlord rule: a story whose units'
   `proof.real.sourceFile`s live inside ANOTHER story's building (a foreign `packages/`/`apps/` dir) must
   declare an edge to that host in either direction, or the gate fails (ADR-0192)
   - **asserts —** `checkBoundaries` reads two new optional inputs — `unitSourceFiles` (story → its
     units' repo-relative source paths) and `dirOwners` (building dir → owning story) — and for each story
     `S` hosting a file under a foreign building owned by `T` (`T ≠ S`) requires the merged declared graph
     (`depends_on` ∪ inverse(`consumed_by`)) to contain `S → T` OR `T → S`; otherwise it appends one
     violation per `(S, T)` pair naming the story, host, building dir, and an example file, pointing the
     fix (declare the edge + optionally annotate `artifact_edges`, or re-home the file). Own-building
     files, either-direction edges, off-surface paths (`.github/`, `scripts/`, `stories/`), unmapped
     buildings, and an absent `unitSourceFiles` are all clean — the same insufficient-data skip rule 4
     takes (ADR-0166). This closes the package-granular gate's blind spot that let the
     library-tech-tree-overlay story render as an orphan island with `depends_on: []` (owner-caught
     2026-07-13; 13 violations across 7 stories fixed when decided). `boundaries.ts` stays import-free so
     the suite proves offline.
   - **proven by —** `packages/cli/src/boundaries.test.ts` — passing at HEAD against
     `checkHostedStoryLandlord` in `packages/cli/src/boundaries.ts`. Authored by the leaf inside the
     gate's AUTHOR_TEST phase; the red — those cases asserting a landlord violation `checkBoundaries`
     did not yet produce — WAS observed by the spine before the rule was added, and the resulting signed
     pass promoted the build (`--real` run `real-mrj75utd`).
4. **`packages-forward-refusal`** — the SECOND blocking rule (ADR-0192 decision 2): a story hosted in
   another story's building (a foreign `packages/`/`apps/` dir) is REFUSED unless it is named in the frozen
   grandfather register — regardless of any declared edge — so a NEW story cannot squat in a foreign
   building at all (packages-forward)
   - **asserts —** `checkBoundaries` reads one new optional input — `hostedStories` (the frozen grandfather
     register of currently-hosted story ids, from `repo-manifest.json`) — and, reusing rule 5's evidence
     (`unitSourceFiles`/`dirOwners`, `buildingDirOf`, the per-`(S, T)` dedup), for each story `S` with a
     mapped foreign-hosting pair `(S, T)` where `S` is NOT registered appends one refusal per `(S, T)` pair
     naming the story, host, building dir, and an example file — **regardless of any declared edge** (a
     declared edge satisfies rule 5 but NOT this rule; the fix is to re-home the sources into `S`'s own
     package, or add `S` to the register for a deliberate owner-reviewed grandfathering). It also keeps the
     register honest: a register entry with no mapped foreign-hosting pair (migrated, retired, or a typo) is
     itself a stale-register violation pointing at removing the entry — so the register is a self-pruning
     migration worklist. Grandfathered (registered ∧ hosted) stories, own-building files, off-surface paths,
     unmapped buildings, and an ABSENT `hostedStories` are all clean; an EMPTY `[]` register is
     defined-not-absent and fail-closed (every hosted story refused). At adoption (2026-07-13) the
     register held 18 story ids with a mapped foreign-hosting pair, all already carrying a declared host
     edge (ADR-0192); `repo-manifest.json` is its only source of truth and membership has since moved in
     both directions under review — see the contract's own `hostedStories` bullet, which deliberately
     does not re-enumerate it. `boundaries.ts` stays import-free so the suite proves offline.
   - **proven by —** `packages/cli/src/boundaries.test.ts` — passing at HEAD against
     `checkPackagesForwardRefusal` in `packages/cli/src/boundaries.ts`. Authored by the leaf inside the
     gate's AUTHOR_TEST phase; the red — those cases asserting a packages-forward refusal
     `checkBoundaries` did not yet produce — WAS observed by the spine before the rule was added, and the
     resulting signed pass promoted the build (`--real` run `real-mrja2qgq`).
