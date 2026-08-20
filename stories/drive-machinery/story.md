---
id: "drive-machinery"
tier: story
title: "The drive machinery"
outcome: "The spine drives any registered node through a genuine red→green proof and lands the proven commit through the merge gate."
status: proposed
proof_mode: UAT
capabilities: [halt-aware-sequence, red-green-phase-machine, work-verdict-event-log, phase-scoped-write-wall, shell-test-observer, prove-it-gate, owned-loop-phase-author, real-build-worktree, prove-spec-resolution, spec-borne-proof-config, proof-command-vocabulary, story-topo-build, story-real-chain, multi-file-existing-source, gate-as-proof-authoring, oq-hygiene-gate, build-drive-cli, adoption-pocket-classifier, uat-machine-proof-binding, uat-machine-gate-resolution, uat-bound-command-adoption, live-author-accounting-override, leaf-slices-observer-activation, live-build-db-preflight, post-build-curation-pass, build-usage-accounting, phase-activity-write]
# Story-level edge (ADR-0010 §4, code-import-evidenced; ADR-0036): the drive consumes the
# library story's store connection seam — createPool/closePool/applySchema in
# packages/drive/src/node-build.ts:41-44 (events.work_event/verdict are its OWN tables), and the
# oq-hygiene gate's live loader composes the library's PgLibraryStore + PgCommentStore
# (packages/drive/src/oq-gate.ts:110-119). The drive surface now lives in its own package
# @storytree/drive (ADR-0112 — carved out of packages/cli/src), re-exported through cli's
# ./build subpath for back-compat; cli depends_on drive and dispatches it from commands.ts.
# ADR-0075: the spine (orchestrator) imports the base + proof-protocol ROOT ports (the proof
# machinery reads/returns verdict-DATA via the verdict vocabulary and the base Store seam), so those
# are now declared cross-story edges — they were exempt substrate dependencies before ADR-0075.
# ADR-0058 §3 + the now-authored stories/agent organism: the spine imports @storytree/agent as a
# RUNTIME dependency (OwnedLoopAuthor + the gate consume the PhaseAuthor seam; resolve-prove-spec
# binds ClaudeAgentAuthor by default or CodexPhaseAuthor when explicitly selected) — the cross-story
# edge the "PhaseAuthor seam is CONSUMED, not owned"
# section below predicted this frontmatter would gain once the leaf organism was authored. Declared
# CONSUMER-side here; the agent root organism is depends_on [] (it imports no @storytree/* package).
depends_on: [library, storage-protocol, proof-protocol, agent, notice-board]
# Provider-side inbound edge (ADR-0074 §4): the cli HUB organism imports this story's drive
# package (packages/drive/src/node-build.ts drives `node build`/`story build` through the
# spine + the agent leaf; cli's commands.ts dispatches them, re-exporting the build seam via its
# ./build subpath, ADR-0112) — declared HERE so the hub stays de-noised and this organism owns
# its "wired into the CLI" edge. The studio app also consumes the drive surface directly now
# (lazy-imports @storytree/drive, dropping its cli dep, ADR-0112) — but via the studio→drive-machinery
# edge already declared in stories/studio/story.md, so no new graph edge appears here.
consumed_by: [cli]
# Deciding ADRs (ADR-0037 §2): the spine sequence (5), the gate (20), the live-author seam (30),
# promotion (31), leaf feedback tools (35), the OQ hygiene gate on live builds (37), the
# inner-loop-expansion keystone — node-borne proof config (57) — gate-as-proof authoring (59),
# the drive-package extraction that gave this story its own @storytree/drive home (112), the
# fail-closed per-UAT-leg proof binding required by ADR-0180 d.5, and the machine-witness conversion
# of Story UAT legs 3/4/7 (184 — leg 4 landed as the observe ancestry gate-5, leg 3 as the
# live-artifact witnessable-verdict gate-6, leg 7 as the cold-start dogfood-probe witness gate-7
# (dogfood-probe.run.ts / dogfood-witness.check.ts); all three legs now machine — no human UAT leg
# remains), and the ChatGPT-funded Codex live leaf beside the Claude compatibility default (232), and the
# accounting-only `liveAuthorOverride` widening of the resolver's author seam that lets a
# live-spend-only adapter earn a MACHINE activation leg with no agent and no credentials (243 —
# capabilities 22 and 23).
decisions: [5, 20, 30, 31, 35, 37, 57, 59, 60, 112, 180, 184, 232, 243]
---

# The drive machinery

**Outcome —** The spine drives any registered node through a genuine red→green proof and lands
the proven commit through the merge gate.

This is the story home for storytree's own build machinery: the prove-it-gate (ADR-0020), the
node/story build drive (`node build` / `story build`, PRs #26–#30), REAL worktree builds and
promotion (ADR-0031), the leaf's bounded feedback tools (ADR-0035), and the OQ-hygiene gate on
live story builds (ADR-0037 §5), plus ADR-0180's strict per-machine-UAT proof binding. Per the V1
lesson recorded in ADR-0031 §3, **machinery is
ordinary work in the ordinary tree** — it gets a normal story, not a special meta-corner. It spans
the spine in `packages/orchestrator`, proof DATA in `packages/proof-protocol`, event persistence in
`packages/library/src/store`, and the build/orchestrate drivers in `packages/drive` (carved out of
`packages/cli` per ADR-0112, re-exported through cli's `./build` subpath for back-compat) — a
multi-package organism joined only through declared ports and package seams.

## Honest status

**`proposed` (greenfield without a current signed pass), NOT `healthy`.** The machinery was built as
part of the Storytree initiative; repository history and the owning ADRs show no inherited or adopted
brownfield provenance. Its dominant behaviour is observationally verified by the real, passing offline
orchestrator, CLI, drive, and store suites, but standing tests and registration after implementation do
not alter provenance or substitute for a signed pass (ADR-0395). The unsigned live arms are pinned per
capability; the recurring shape is *offline-proven mechanics, live-attested-but-not-standing-tested live
legs* (the SDK leaf, the GitHub push, the live Postgres SQL, the live OQ loader).

**Buildability is separate from authoredness:** `verdict-line` and the three strict UAT-binding
nodes carry spec-borne `proof:` blocks today (ADR-0057 — no registry entry). A whole
`story build drive-machinery` still refuses fail-closed because the remaining capabilities have no
build config. Declaring how to prove each capability is a deliberate act, done by AUTHORING a
`proof:` block in the node's own spec rather than by an orchestrator-registry edit (authoring IS the
buildable-node gate; that is exactly what `spec-borne-proof-config` delivered).

## The PhaseAuthor seam is CONSUMED, not owned (the modeling call — now SETTLED)

**Settled 2026-06-21 (story-author, resolving `oq-agent-as-its-own-organism-story`): `packages/agent`
is now its own organism, authored as [`stories/agent`](../agent/story.md).** The seam is this story's
declared cross-story interface to that organism, and the frontmatter `depends_on` now carries the
`agent` edge (consumer-side) that this section predicted. The reasoning that drove the split (the
`splitting-rule` both triggers fire; the consumer here is the spine, agnostic to the runtime;
`packages/agent` imports no `@storytree/*` package so it is a depends_on-[] root organism) is recorded
in the agent story. The original case below stands as the rationale:

`packages/agent` — the `PhaseAuthor` seam type, the live `ClaudeAgentAuthor` compatibility default,
the opt-in `CodexPhaseAuthor` (`--runtime codex`, ADR-0232), and the owned-loop internals
(`model.ts`/`run-turn.ts`/`step.ts`/`tool-executor.ts`/`fs-tools.ts`) — is
**not a capability of this story** (it is the `agent` organism's). The reasoning:

1. **The seam's whole point is author-agnosticism.** ADR-0030 §2 frames `PhaseAuthor` as the
   pivot seam: the spine hands a leaf exactly two authoring slices and must not care which runtime
   answers. Folding the leaf runtimes into the drive's organism would dissolve the boundary that
   makes the pivot-out fallback real. The gate consumes the seam as a TYPE only
   (`prove-it-gate.ts:18`).
2. **`packages/agent` is its own organism** — a model seam, a turn loop, a fail-closed step
   runner, a real file-tool surface, and the live leaves, with its own passing suite. That is
   a story-sized bounded context (ADR-0010), currently unauthored.
3. **The spine-side adapter IS in-story.** `OwnedLoopAuthor` lives in `packages/orchestrator` and
   is mapped here as [`owned-loop-phase-author`](owned-loop-phase-author.md) — the drive owns its
   side of the seam, not the loop behind it.
4. **The one place the seam goes concrete** — the VALUE imports of `ClaudeAgentAuthor` and
   `CodexPhaseAuthor` in [`prove-spec-resolution`](prove-spec-resolution.md) — is the injection
   layer, which is exactly where a seam SHOULD be bound to the explicitly selected implementation.

Consequence (now realized): the `packages/agent` leaf organism is authored as
[`stories/agent`](../agent/story.md); the seam is its declared cross-story interface (ADR-0010 §4)
and this story's frontmatter carries the `agent` edge in `depends_on`. The coupling is no longer just
documented prose — it is a first-class declared, world-visible edge (the boundary gate, ADR-0074,
now sees the spine↔leaf seam).

## Capabilities (27)

Listed roots-first (a capability appears after everything it depends on). `proposed` means this
greenfield unit lacks a current signed pass; the Proof blockquote in each file records the standing
evidence and any unsigned live arms without treating either as brownfield provenance (ADR-0395).

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`halt-aware-sequence`](halt-aware-sequence.md) | The spine composes leaf steps in strict order and a halted step can never be reported as a pass. | proposed | — |
| 2 | [`red-green-phase-machine`](red-green-phase-machine.md) | A unit advances through the spine-owned phase ladder only via fail-closed transitions the spine itself legitimizes. | proposed | — |
| 3 | [`work-verdict-event-log`](work-verdict-event-log.md) | A unit's lifecycle status is derived as a pure projection over typed work and signing events, never hand-maintained. | proposed | — |
| 4 | [`phase-scoped-write-wall`](phase-scoped-write-wall.md) | A leaf write outside the current phase's scope is refused before it reaches the real executor, and the refusal is recorded. | proposed | `red-green-phase-machine` |
| 5 | [`shell-test-observer`](shell-test-observer.md) | Red or green is a fact the spine reads off a spawned proof command's own exit code, never a claim a leaf could forge. | proposed | `red-green-phase-machine` |
| 6 | [`prove-it-gate`](prove-it-gate.md) | A unit earns a signed PASS verdict only by walking the whole red→green ladder with spine-observed evidence on a clean committed tree. | proposed | `red-green-phase-machine` |
| 7 | [`owned-loop-phase-author`](owned-loop-phase-author.md) | The owned agent loop authors one phase slice at a time behind the PhaseAuthor seam under the in-process write wall. | proposed | `phase-scoped-write-wall`, `red-green-phase-machine` |
| 8 | [`real-build-worktree`](real-build-worktree.md) | A signed REAL pass survives its worktree: the proven commit is parked on a run-unique claude/real branch that lands through the merge gate. | proposed | `shell-test-observer` |
| 9 | [`prove-spec-resolution`](prove-spec-resolution.md) | Any registered node id resolves into a runnable ProveSpec for the chosen mode with nothing left to hand-wire. | proposed | `red-green-phase-machine`, `shell-test-observer`, `prove-it-gate`, `owned-loop-phase-author`, `real-build-worktree` |
| 10 | [`story-topo-build`](story-topo-build.md) | A story's nodes drive through the gate in dependency order with the story's UAT node last and a halt never reported as a pass. | proposed | `halt-aware-sequence`, `prove-spec-resolution`, `prove-it-gate` |
| 11 | [`oq-hygiene-gate`](oq-hygiene-gate.md) | A live story build is refused while an operator answer on a deciding ADR's open question sits unprocessed. | proposed | `prove-spec-resolution` |
| 12 | [`build-drive-cli`](build-drive-cli.md) | An operator drives any registered node or whole story through the gate from one CLI command and gets an honest envelope back. | proposed | `prove-spec-resolution`, `prove-it-gate`, `real-build-worktree`, `story-topo-build`, `oq-hygiene-gate`, `work-verdict-event-log` |
| 13 | [`spec-borne-proof-config`](spec-borne-proof-config.md) | A node carries its own proof config, so authoring it is the single act that makes it inner-loop-buildable. | proposed | `prove-spec-resolution` |
| 14 | [`proof-command-vocabulary`](proof-command-vocabulary.md) | A node declares its own proof command, so the same gate drives non-node:test work red→green. | proposed | `spec-borne-proof-config` |
| 15 | [`story-real-chain`](story-real-chain.md) | A whole story grows to signed verdicts: capabilities real-built in dependency order over one worktree, promoted once. | proposed | `story-topo-build`, `real-build-worktree`, `spec-borne-proof-config` |
| 16 | [`multi-file-existing-source`](multi-file-existing-source.md) | A node declares a multi-file scope + an edit-existing-source regression red→green (bug-fixes/refactors), keeping test-author ≠ code-author. | proposed | `spec-borne-proof-config`, `proof-command-vocabulary` |
| 17 | [`gate-as-proof-authoring`](gate-as-proof-authoring.md) | Authoring an ADR earns a signed verdict through the unchanged gate by reducing to edit-existing with a structural-completeness check — the machine witnesses hygiene, never acceptance. | proposed | `multi-file-existing-source`, `spec-borne-proof-config` |
| 18 | [`adoption-pocket-classifier`](adoption-pocket-classifier.md) | The spine turns each uncovered brownfield pocket into a proposed reliability gate with a build-tests classification and the key forks the human must settle. | proposed | `build-drive-cli` |
| 19 | [`uat-machine-proof-binding`](uat-machine-proof-binding.md) | The Story UAT parser carries each explicit proof-gate annotation into the strict per-leg model without dropping or inventing a binding. | proposed | — |
| 20 | [`uat-machine-gate-resolution`](uat-machine-gate-resolution.md) | Each parsed machine UAT leg resolves only to its named command-bearing observe gate, with every missing or ineligible binding refused. | proposed | `uat-machine-proof-binding` |
| 21 | [`uat-bound-command-adoption`](uat-bound-command-adoption.md) | `runAdopt` observes and signs each machine UAT leg only through the command supplied by that leg's resolved proof-gate binding. | proposed | `build-drive-cli`, `uat-machine-gate-resolution` |
| 22 | [`live-author-accounting-override`](live-author-accounting-override.md) | An offline caller can supply the resolved live author for accounting, and supplying it without an author override is refused fail-closed. | proposed | `prove-spec-resolution` |
| 23 | [`leaf-slices-observer-activation`](leaf-slices-observer-activation.md) | An offline real chain invokes the leaf-slices observer once per node with that node's own run accounting, and a canned live author still cannot move a verdict. | proposed | `live-author-accounting-override`, `story-real-chain` |
| 24 | [`live-build-db-preflight`](live-build-db-preflight.md) | A build that owns the live store begins only against a database it has just watched accept connections. | proposed | — |
| 25 | [`post-build-curation-pass`](post-build-curation-pass.md) | A green story build ends by enacting a scoped curator's open-question judgments behind a kind fence the curator cannot open. | proposed | — |
| 26 | [`build-usage-accounting`](build-usage-accounting.md) | A build's per-slice token accounting lands on its own event stream as a kind no verdict reads. | proposed | `work-verdict-event-log` |
| 27 | [`phase-activity-write`](phase-activity-write.md) | Each phase the spine commits to is recorded as a fresh phase-stamped `building` event by an observer that lives outside the gate. | proposed | `work-verdict-event-log` |

Capabilities 24–27 were authored on 2026-08-07 (`capability-layer-coverage-arc`) over greenfield drive
code that was already implemented and already had a passing colocated suite, but which no node's
`outcome:` covered — so `repo-manifest.json` declared it at STORY grain for want of a capability.
Retrospective registration does not change that provenance (ADR-0395), so they remain `proposed`
without current signed passes. Like capabilities 19–23, they are deliberately absent from every
`(covers:)` list in **Reliability Gates** below: gate-3 RUNS their proving files, but adding them to a
frozen covers-list changes what an already-signed verdict claims, so it stays a separate, id-aware
decision.

## Dependency graph (code-derived)

**Within-story** edges, read off the real imports/calls (ADR-0010 §3), never hand-drawn from UAT
need. The graph is acyclic; `halt-aware-sequence`, `red-green-phase-machine`, and
`work-verdict-event-log` are the roots. Type-only imports are counted (the contract shape IS the
coupling) and marked.

- `phase-scoped-write-wall` → `red-green-phase-machine`
  - `write-scoped-executor.ts:16` imports `Phase` + `WriteScope` (type-only); the wall's whole
    decision is `scope.isWriteAllowed(phase, path)` (`write-scoped-executor.ts:107-110`).
- `shell-test-observer` → `red-green-phase-machine`
  - `shell-test-executor.ts:14` imports the `TestExecutor`/`TestObservation` seam types — this
    class is the live implementation of the phase machine's observation seam.
- `prove-it-gate` → `red-green-phase-machine`
  - `prove-it-gate.ts:28` imports `advancePhase` + `nextPhase` (real calls at `:102`, `:112`,
    `:124`, `:133`) — every transition the gate makes is the machine's.
- `owned-loop-phase-author` → `phase-scoped-write-wall`
  - `owned-loop-author.ts:12-16` imports `WriteScopedToolExecutor` and constructs it around the
    leaf's tools (`:39-44`), flipping its phase per slice (`:53`).
- `owned-loop-phase-author` → `red-green-phase-machine`
  - `owned-loop-author.ts:11` imports `WriteScope` (type-only) — the wall predicate it wires in.
- `real-build-worktree` → `shell-test-observer`
  - `build-worktree.ts:21-22` imports `ShellTestExecutor` + `ShellCommand`; the promotion
    pre-checks observe green/red through it (`build-worktree.ts:251-260`).
- `prove-spec-resolution` → `red-green-phase-machine`
  - `resolve-prove-spec.ts:13` imports `PathWriteScope` (constructed at `:226`, `:309`);
    `test-command-registry.ts:2` imports `PathWriteScopeConfig` (type).
- `prove-spec-resolution` → `shell-test-observer`
  - `resolve-prove-spec.ts:15` imports `ShellTestExecutor` + `runShellCommand` (the proof
    executors at `:223`, `:306`; the feedback tools at `:397`, `:407`).
- `prove-spec-resolution` → `prove-it-gate`
  - `resolve-prove-spec.ts:17-18` imports `gitTreeState` (the REAL-mode tree seam, `:354`) and
    the `PhasePrompts`/`ProveSpec`/`TreeState` types the resolver exists to fill.
- `prove-spec-resolution` → `owned-loop-phase-author`
  - `resolve-prove-spec.ts:14` imports `OwnedLoopAuthor` — the dry-run leaf (`:239-244`).
- `prove-spec-resolution` → `real-build-worktree`
  - `resolve-prove-spec.ts:27` imports `commitAuthored` + `platformShellCommand` (the REAL-mode
    tree seam commits spine-side at `:349-353`; the typecheck command is platform-shimmed `:317`).
- `story-topo-build` → `halt-aware-sequence`
  - `story-build.ts:3` imports `runSequence`; the chain IS it (`story-build.ts:70`) — the
    halted-is-never-a-pass guard is inherited, not re-implemented.
- `story-topo-build` → `prove-spec-resolution`
  - `story-build.ts:2` imports the `NodeSpec` type (type-only) — the chain orders the resolver's
    loaded specs.
- `story-topo-build` → `prove-it-gate`
  - `story-build.ts:1` imports the `ProveResult` type (type-only) — a node's outcome in the chain
    is the gate's result.
- `oq-hygiene-gate` → `prove-spec-resolution`
  - `oq-gate.ts:2` imports the `NodeSpec` type (type-only) — the gate reads the loaded story
    spec's `decisions`.
- `build-drive-cli` → `prove-spec-resolution`
  - `node-build.ts:11-25` + `story-build.ts:8-23` import `resolveProveSpec`, `loadNodeSpec`,
    `findNodeSpecFile`, `mapProofMode`, and the registry lookups — the whole wiring surface.
- `build-drive-cli` → `prove-it-gate`
  - `node-build.ts:16` imports `proveUnit` — every mode's walk (`node-build.ts:499`, `:661`).
- `build-drive-cli` → `real-build-worktree`
  - `node-build.ts:11-25` imports `createBuildWorktree`, `promoteRealPass`,
    `runRegressionSuite`, `runWorktreeTypecheck` — the `--real` lifecycle (`:634-702`).
- `build-drive-cli` → `story-topo-build`
  - `story-build.ts:20-22` imports `runStoryBuild` + `topoOrderStoryNodes` (`:584`, `:424`).
- `build-drive-cli` → `oq-hygiene-gate`
  - `story-build.ts:61` imports `oqHygieneGate`, called live-only before any spend (`:526-527`).
- `build-drive-cli` → `work-verdict-event-log`
  - `node-build.ts:23-27` imports `workEvent` + `rollupStatus` + `verdictLine` (building marks
    `:465` and `:637`, report rollups `:1003`); `:49` imports `PgWorkStore` (the `--store pg` swap,
    `:305-315`).
- `spec-borne-proof-config` → `prove-spec-resolution` *(BUILT — ADR-0057, code-import-evidenced)*
  - extends the resolution layer: `node-spec.ts:5-6` imports `parseNodeBuildConfig` from the new
    `proof-config.ts` (validates the spec-borne `proof:` block into `spec.buildConfig`);
    `resolve-prove-spec.ts` adds `resolveBuildConfig(spec)` (spec-borne first, registry fallback) and
    `resolveProveSpec` reads the config off the loaded `NodeSpec`; `test-command-registry.ts` is
    demoted to a validation/fallback layer (imports the `NodeBuildConfig`/`RealProofConfig` shape from
    `proof-config.ts`, keeps the 7 entries as the parity oracle). The CLI build path
    (`node-build.ts`, `story-build.ts`) resolves spec-first via the same helper.
- `story-real-chain` → `story-topo-build`, `real-build-worktree`, `spec-borne-proof-config` *(BUILT — ADR-0057 §3, code-import-evidenced)*
  - `story-build.ts` reuses `runStoryBuild`/`topoOrderStoryNodes` (story-topo-build) for the topo+halt
    chain, drives each node via `buildNodeReal` over ONE `createBuildWorktree` (real-build-worktree),
    and resolves each node's `real:` arm via `resolveBuildConfig` (spec-borne-proof-config); the
    single-node REAL lifecycle is extracted into `node-build.ts:buildNodeReal` (shared with
    `node build --real`). No orchestrator code change; the spine is reused verbatim.
- `multi-file-existing-source` → `spec-borne-proof-config`, `proof-command-vocabulary` *(ADR-0057 §3 expansion C; reuses A's glob-set scope + B's suite — no new code edge)*
- `gate-as-proof-authoring` → `multi-file-existing-source`, `spec-borne-proof-config` *(ADR-0059 expansion E; reduces to C's edit-existing over a doc + the `adr-completeness` checker — no orchestrator edge)*
  - the queued next expansion (a design note, not built): widen the write scope to a glob SET and
    support edit-existing-source regression red→green. Most structure already exists (A's glob scope,
    the gate's runtime-red acceptance, B's `proofCommand` suite) — the work is the leaf brief + the
    config shape (an open design fork). Unbuilt — the edge is a planned coupling, not an observed import.
- `proof-command-vocabulary` → `spec-borne-proof-config` *(BUILT — ADR-0057 §3, code-import-evidenced)*
  - extends the spec-borne config (A) with a declarable proof command: `proof-config.ts` adds
    `RealProofConfig.proofCommand` + its forced-cwd and pnpm⇒install refines; `resolve-prove-spec.ts`
    adds `realProofCommand(real, workspace)` (the one place that chooses the declared-or-default
    command for both the CONFIRM observations and the `run_proof` feedback tool) and threads the
    command's display into `realPrompts`. The 7 default nodes are unchanged (the A parity guard stays
    green). No `test-command-registry.ts` change; no new ADR (ships under ADR-0057 §3 + ADR-0020).
- `uat-machine-proof-binding` *(authored `proposed`, REAL-proven — completed proof commit `c49e179`)*
  - `uat-test-criteria.ts` parses the explicit `proof-gate` annotation into the strict per-leg model;
    `uat-test-criteria.test.ts` is its complete literal edit-existing REAL proof pair. It has no within-story
    prerequisite and claims no resolver or adopt behaviour.
- `uat-machine-gate-resolution` → `uat-machine-proof-binding` *(authored `proposed`, REAL-proven —
  proof commit `28be1de`)*
  - `witness-resolution.ts` consumes the parser's exact `proofGateId` and returns only its named
    command-bearing observe gate or an explicit refusal. Its literal edit-existing REAL pair is
    `witness-resolution.{ts,test.ts}`.
- `uat-bound-command-adoption` → `build-drive-cli`, `uat-machine-gate-resolution` *(authored
  `proposed`, REAL-proven — completed proof commit `a7389fb`)*
  - `adopt.ts` extends the existing `runAdopt` drive entry and consumes the exact resolved command
    before signing a machine UAT id. Its literal edit-existing REAL pair is `adopt.{ts,test.ts}`.
    These three increments replace the earlier six-file unit whose spotlight proved only parsing.
- `live-author-accounting-override` → `prove-spec-resolution` *(authored `proposed`, ADR-0243 D1/D3/D6)*
  - extends the resolution layer the same way `spec-borne-proof-config` does: it widens
    `RealResolveOptions` with an accounting-only `liveAuthorOverride?: LiveAuthor` (the EXISTING
    exported union, `resolve-prove-spec.ts:233`) consumed inside the `opts.authorOverride !== undefined`
    branch at `:489-490`, and documents the deliberate `authorOverride`/`liveAuthor` asymmetry at the
    seam. Its literal edit-existing REAL pair is `resolve-prove-spec.ts` +
    `live-author-override.test.ts`. No new class, no widened shared type.
- `leaf-slices-observer-activation` → `live-author-accounting-override`, `story-real-chain`
  *(authored `proposed`, ADR-0243 D1/D3/D4)*
  - `node-build.ts` gains `RealBuildArgs.liveAuthorOverride` (spread into the `resolveOptions`
    literal) and `story-build.ts` gains the per-node `StoryBuildOpts.liveAuthorOverride` factory,
    resolved ONCE per node beside the existing `authorOverride` resolution — which is what makes the
    chain's `--real` composition site (`story-build.ts:701`,
    `opts.onLeafSlices?.({ runId, unitId, runs })`) reachable from an offline test. It cannot compile
    before the resolver accepts the option, and it drives `story-real-chain`'s offline chain to reach
    the site. The observer stays a seam drive OWNS: `packages/drive` imports nothing from any
    `@storytree/context-traversal-*` package (that would close the `check:boundaries` cycle), and the
    proof injects a SPY.

**Cross-story:** the `library` edge (the store-connection seam + the OQ loader's library stores),
the `storage-protocol` + `proof-protocol` root-port edges (ADR-0075), and the **`agent`** edge — the
spine imports `@storytree/agent` to consume the `PhaseAuthor` seam (`OwnedLoopAuthor` + the gate +
the prove-spec resolver) and bind `ClaudeAgentAuthor` by default or `CodexPhaseAuthor` when
`--runtime codex` is selected. See the "PhaseAuthor seam is CONSUMED, not owned" section above for
the now-settled modeling call.

## Units

- [`verdict-line`](verdict-line.md) — contract grain, file-per-unit. The first REAL-built node
  (Phase F): proven by a signed PASS (run `real-mq7ky4ck`, persisted to `events.verdict`), then
  **folded into the system by promotion** (ADR-0031 §3): the exact proven commit is in this
  branch's ancestry, the function is exported from `@storytree/core`, and the CLI node-build
  envelope is its live consumer.
- [`node-resolve-report`](node-resolve-report.md) — contract grain, file-per-unit, **spec-borne**
  (ADR-0057 A — its own `proof:` block makes it inner-loop-buildable with no registry edit). The
  pure core of the FREE, read-only `storytree node resolve <id>` command (the gap the blind dogfood
  test surfaced, 2026-06-15: agents had no dry way to confirm a self-registered node resolved before
  a paid `--real` build). REAL-built through the inner loop: the live leaf authored
  `resolve-report.{ts,test.ts}` in a worktree (then at `packages/cli/src/`; since ADR-0112 the file
  lives at `packages/drive/src/resolve-report.{ts,test.ts}`), the spine observed the genuine
  red→green and signed a PASS (run `real-mqelrhoj`, commit `47c9e43`, persisted to `events.verdict`);
  the `nodeResolve` CLI dispatch was wired spine-side AFTER promotion (the leaf's walls exclude
  `commands.ts`).
- [`witnessable-verdict`](witnessable-verdict.md) — contract grain, file-per-unit, **spec-borne**
  (ADR-0057 — its own `proof:` block makes it inner-loop-buildable). The pure core of the ADR-0184
  leg-3 observe gate (`drive-machinery#gate-6`): it selects the newest spine-driven **DRIVEN-tier**
  passing verdict for a drive-machinery node that is recent and lands in `main`'s ancestry (or reports
  why none qualifies), so a cheap gate can witness that a real `--real` build happened without
  re-running it. Authored `proposed`; its own `--real` verdict — leg 3's live proof — is a signed
  DRIVEN `contract` PASS (run `real-mrftf7c3`, commit `69590a6`, persisted to `events.verdict`),
  folded into the tree by promotion (PR #679).

File-per-unit here is the **registered-buildable grain** (the drive loads one spec file per
buildable node); the authored capability files above follow the seed's contracts-inline convention
(`stories/README.md`). Both conventions are real; ADR-0031 §3 records the distinction.

## UAT Test Criteria

The integrated **acceptance walkthrough** proving the organism's outcome end to end: one operator
drives a registered node from spec to a landed, signed, persisted proof.

**Goal —** Drive one registered node through a genuine red→green proof and land the proven commit
through the merge gate, so that a fresh agent can do the same without coaching.

Three legs. Each one witnesses a **real persisted artifact** — a signed verdict in `events.verdict`, a
commit in `main`'s ancestry — which is the shape this story's own prose has demanded all along: *"each
leg's gate witnesses a real persisted signed pass, never an offline mechanics suite dressed up as
acceptance."* Under ADR-0294 D2 the four legs that named `pnpm --filter <pkg> test` were the capability
rung re-signed at the story rung and were deleted on 2026-08-03, each with its proving node named (table
below; `stories/uat-legacy-dispositions.json` records them `superseded`). What remains is the journey
itself, and only the journey.

The four deleted criteria and the node that already proves each, for audit:

| deleted criterion | claim | proven at |
| --- | --- | --- |
| `uatc_fe41d841f6b38c81c2cd1e0c` | *Orient* — `pnpm storytree node` lists the registered and REAL-buildable nodes in a help envelope | [`build-drive-cli`](build-drive-cli.md) (capability) — `packages/cli/src/node-build.test.ts:102`, covered by gate-2 |
| `uatc_e4ec2bdd541d8b575ea8fd3f` | *Prove the glue first* — the `--dry-run` phase trail, in-memory signed verdict, derived rollup, honest dry-run framing | [`build-drive-cli`](build-drive-cli.md) (capability) — `packages/cli/src/node-build.test.ts:17`, `:74`, covered by gate-2. A **dry run is not the real thing**, so this was never a step of the journey above |
| `uatc_2bb0f5162edab352e64e66bf` | *Chain a story* — `story build <id> --dry-run` topo-orders capabilities from `depends_on`, story UAT node last, one event log, halt-is-never-a-pass | [`story-topo-build`](story-topo-build.md) + [`story-real-chain`](story-real-chain.md) (capabilities) — `packages/cli/src/story-build.test.ts:17`, covered by gate-1/gate-2. Also a dry run |
| `uatc_21d6fd739ddeeaade11b1b92` | *Refuse the dishonest paths* — `--store pg` with `--dry-run` refused; a live story build with an unprocessed operator answer refused | [`build-drive-cli`](build-drive-cli.md) — `story-build.test.ts:90`/`:124` (gate-2) and [`oq-hygiene-gate`](oq-hygiene-gate.md) — `oq-gate.test.ts:141` (gate-3) |

Every assertion above still runs, under the same commands, and every capability still greens: the
deletion removed a second signature at the story rung, not the evidence (ADR-0294 D2).

> **Where the earlier honesty note went.** This section used to carry a long blockquote reconciling
> which legs were scripted, which attested, and which had been converted human→machine by ADR-0184. All
> three surviving legs are ADR-0184 conversions and their gates are described in full under **Reliability
> Gates**, so that reconciliation is now history rather than current state and is not restated here
> (ADR-0139: an accepted record carries no overtaken prose; `git log -p` holds the prior text). The one
> claim from it worth keeping is the standard the whole section is now built on, quoted above: a leg's
> gate witnesses a real persisted signed pass, never an offline mechanics suite dressed up as acceptance.

> **Gate-4 no longer hosts a leg.** `drive-machinery#gate-4` was minted solely to prove deleted leg 6,
> whose two refusal assertions spanned the `cli` and `drive` suites. It is left in place deliberately:
> gate ids are POSITIONAL (`parseReliabilityGates`), so removing it would renumber gates 5/6/7 and
> silently re-point the signed verdicts and the `(proof-gate:)` bindings of the three legs above onto
> different gates. It remains a truthful observe gate over two suites that are already covered by gates
> 2 and 3 — redundant, not dishonest. Retiring it is a separate, id-aware change.


1. **The REAL build** _(witness: machine)(detail: drive-machinery#uat-3)_ _(proof-gate: drive-machinery#gate-6)_: `pnpm storytree node build <id> --real --store pg`. **Success —** a fresh _(criterion-id: uatc_c0f650ea4c3035ae8f7e5b1c)_ _(revision-id: uatr1:48ac587ee38977f9)_
   detached worktree; the live leaf authors the REAL test under the write wall; the spine observes
   the genuine red, the leaf implements, the spine observes the genuine green, commits the
   authored files, signs on the genuinely clean tree; the verdict persists to `events.verdict`;
   the proven commit is parked on `claude/real/<id>-<run>` and pushed (typecheck + regression
   green first for install-bearing nodes). *(proven: `drive-machinery#gate-6` —
   `witnessable-verdict.check.ts` reads `events.verdict` and asserts a spine-driven DRIVEN-tier
   (`contract`/`capability`/`story`, never `adopted`) passing verdict for a drive-machinery node
   exists, recent (≤90d, the ADR-0016 ageing floor) and on a commit in `main`'s ancestry; the
   deliberate subscription-funded live run that PRODUCES the artifact stays out-of-band (ADR-0010 §5)
   — minted for this conversion via `witnessable-verdict` itself: run `real-mrftf7c3`, commit
   `69590a6`, a genuine red→green; the earlier `verdict-line` run `real-mq7ky4ck` is the historical
   first.)*
2. **Land it** _(witness: machine)(detail: drive-machinery#uat-4)_ _(proof-gate: drive-machinery#gate-5)_: open the PR from the promotion branch; CI auto-merges on green, NON-SQUASH, so the _(criterion-id: uatc_3e86045325b8284e156fe886)_ _(revision-id: uatr1:3a583901a5d86eb2)_
   verdict's `commitSha` stays an ancestor of `main` (ADR-0031/0022). **Success —** the proven
   commit is reachable from `main`. *(proven: `drive-machinery#gate-5` —
   `promotion-ancestry.check.ts` asserts every attested REAL-proof commit (`0e8f4ba` verdict-line,
   `47c9e43` node-resolve-report, and the three uat-machine binding proofs) is an ancestor of HEAD, so
   a squash that orphaned the original SHA would fail it; the live residue — a real PR auto-merged into
   the real `main` — is the CI auto-merge/non-squash rail's standing guarantee, ADR-0022/0031.)*
3. **An agent actually USES it end to end (the dogfood acceptance)** _(witness: machine)(detail: drive-machinery#uat-7)_ _(proof-gate: drive-machinery#gate-7)_: a fresh orchestrator agent, _(criterion-id: uatc_5e54367bd5f458a7ef3d2b09)_ _(revision-id: uatr1:30344311ad98c613)_
   onboarding from CLAUDE.md alone (the inner loop never named for it), drives a unit through steps
   1–4 to a genuine signed verdict — proving the machinery is not just correct but *usable without
   coaching*, the load-bearing question behind ADR-0057. **Success —** the agent discovers the inner
   loop, authors a self-registering node, and reaches a real `--real` signed verdict over real
   behaviour (net-new OR edit-existing). *(proven: `drive-machinery#gate-7` — an executable cold-start probe (`dogfood-probe.run.ts`, ADR-0184 d.4) spawns a fresh `claude -p` session whose ONLY coaching is CLAUDE.md and whose task names the outcome (a signed verdict for a tiny new `dogfood-probe-*` node) but never the inner-loop means; the prompt's uncoached integrity is a standing test — `auditUncoached`, `dogfood-probe.test.ts` — ADR-0184 d.4's one-time authoring audit made executable, not re-judged per run. `dogfood-witness.check.ts` then witnesses that the fresh agent's signed verdict landed: a spine-driven DRIVEN pass for a `dogfood-probe-*` node in `main`'s ancestry, recent (≤90d), reusing leg 3's `selectWitnessableVerdict` core. First live pass: run `mrfuze9m` — a fresh uncoached agent (76 turns) discovered the inner loop from CLAUDE.md alone and drove `dogfood-probe-mrfuze9m` to a signed `contract` verdict (commit `2ea1b68`); the earlier blind dogfood, 2026-06-15 (3/3 operator-run — `roundTo` @14c4509, `ordinal` @4c0dbf3, `verdictLine` @d043863), is the historical precedent. The heavy live run stays out-of-band, ADR-0010 §5; this cheap gate only witnesses it.)*

End state — a genuine proof earned, signed, persisted, promoted, landed, AND shown to be usable by a
fresh agent without coaching; every shortcut walled.
## Reliability Gates

The drive machinery is **greenfield** (`status: proposed`): its dominant behaviour is observationally
verified by real, passing, OFFLINE suites (the counts are in **Honest status**), but it has no current
signed pass. ADR-0395 makes those facts independent: neither an already-green suite, registration after
implementation, nor the absence of a prove-it-gate red→green rewrites provenance. The observe gates
below remain authored evidence obligations, but they do not make this story eligible for the
brownfield-only Adopt transition. This audit does not manufacture replacement verdicts or proof arms;
the story and unsigned capabilities remain amber until a valid greenfield proof earns signed passes.

The machinery's offline behaviour spans **three suites** — the spine (`@storytree/orchestrator`), the
CLI-resident build-drive + ADR-authoring integration tests (`@storytree/cli`), and the carved-out drive
package (`@storytree/drive`, ADR-0112) — so its capability reliability floor carries one consolidated
observe gate per suite, every gate naming the capabilities it `(covers:)` (ADR-0097 — three
capability-covering gates over 18 capabilities reads cleaner than 18 per-cap gates, the same multi-cover
shape the `library` story uses). A fourth, command-bearing observe gate runs the CLI and drive suites
together solely for Story UAT leg 6, whose two refusal assertions span those packages; a fifth,
command-bearing observe gate runs the drive-package ancestry check solely for Story UAT leg 4 (the
proven REAL commits reached `main` non-squash, ADR-0184); a sixth, command-bearing observe gate
runs the live-artifact `witnessable-verdict` check solely for Story UAT leg 3 (a recent spine-driven
DRIVEN verdict for a drive-machinery node, landed in `main`'s ancestry, ADR-0184); and a seventh,
command-bearing observe gate runs the live-artifact `dogfood-witness` check solely for Story UAT leg 7
(the cold-start dogfood probe — a fresh, uncoached `claude -p` agent onboarding from CLAUDE.md alone
reached a signed verdict for a `dogfood-probe-*` node it authored, ADR-0184). None of gates 4–7
carries a `(covers:)` — the first three gates already cover the capabilities, and gates 4, 5, 6, and 7
each prove a UAT leg, not a capability.
The first three gates name the 18 already-built capabilities. The 18th —
[`adoption-pocket-classifier`](adoption-pocket-classifier.md)
— was authored `proposed` (would-be) and deliberately left uncovered; its behaviour has since been
BUILT outer-loop (2026-06-27, `assembleProposal` + `adopt plan --readings`, commit `2c170db`) with a
real offline suite in the orchestrator package. It remains greenfield `proposed` without a current
signed pass (ADR-0395), while gate-1's `(covers:)` records the real suite coverage rather than a
provenance claim.
Capabilities 19–21 — parser
[`uat-machine-proof-binding`](uat-machine-proof-binding.md), exact resolver
[`uat-machine-gate-resolution`](uat-machine-gate-resolution.md), and drive consumption
[`uat-bound-command-adoption`](uat-bound-command-adoption.md) — retain authored `proposed` status
while their separate signed REAL verdicts derive proof health (ADR-0020). They are intentionally not
folded into the three suite-level capability-covering observe gates: each was driven red→green through
its own literal REAL pair.
Capabilities 22–23 — [`live-author-accounting-override`](live-author-accounting-override.md) and
[`leaf-slices-observer-activation`](leaf-slices-observer-activation.md), the ADR-0243 accounting seam —
are held to the same rule and are deliberately absent from every `(covers:)` list above. Each earns
its own signed `--real` verdict; adding either to a gate's covers list would falsely let a suite-level
observation stand in for a capability's driven proof. Note that gate-1 and
gate-3 nonetheless RUN their test files (they run the whole orchestrator and drive suites), which is
exactly why both capabilities declare an explicit `proofCommand` over the whole package suite: a new
resolver option or drive passthrough that breaks a sibling test is caught inside the gate rather than
after it.

Distinct from `## UAT Test Criteria` above (the part-scripted/part-attested drive-a-node-to-a-landed-proof
journey): the gates are the author's **expandable floor**, GROWING a `_(gate: build-tests)_` regression
leg the moment observation proves insufficient (a real spine/gate defect slips through). **Honesty
boundary — observe greens OFFLINE behaviour only:** several covered caps carry a `proposed` LIVE pocket
(the SDK leaf, the live `--store pg` SQL, the GitHub push, the live OQ loader; see **Honest status** and
each cap's Proof blockquote) that observe does NOT reach — the gate attests the offline suite, which is
honest, not a gap; those live legs stay operator-attested separately and join as `build-tests` gates only
if they ever earn standing offline tests. The bootstrap step **Honest status** names — re-running these
assertions through a valid greenfield proof to start earning `healthy` — remains a separate, later move.
Adopting the existing green is not available merely because the tests predate registration (ADR-0395).

1. **The spine's own suite is green** _(gate: observe)_ _(covers: halt-aware-sequence, red-green-phase-machine, work-verdict-event-log, phase-scoped-write-wall, shell-test-observer, prove-it-gate, owned-loop-phase-author, real-build-worktree, prove-spec-resolution, spec-borne-proof-config, proof-command-vocabulary, story-topo-build, multi-file-existing-source, adoption-pocket-classifier)_ `pnpm --filter @storytree/orchestrator test`.
   The spine runs it at a clean committed HEAD and OBSERVES it green — the halt-aware sequence
   (halted-is-never-a-pass), the red→green phase machine + per-phase write wall, the shell-test observer,
   the prove-it-gate's full red→green ladder, the owned-loop PhaseAuthor under the write wall (incl. its
   fail-closed step path, now pinned by `owned-loop-author.test.ts`), the REAL worktree/promotion
   mechanics, prove-spec resolution + spec-borne proof config + the declarable proof command, the topo
   story chain, the multi-file edit-existing scope, the work/verdict event-log projection +
   signer/rollup/verdict-line proof machinery (the offline `InMemoryStore`/`PgWorkStore` parity contracts
   included), and the adoption-proposal classifier — both halves: the mechanical covers-diff AND the
   judgment half (`assembleProposal`'s pocket stamping, the recommend-only `ProposedGate` round-trip
   through the REAL `parseReliabilityGates`, the fail-closed readings boundary, the fork sweep;
   `adoption-proposal.test.ts`) — all pass offline (no DB, no API key). This is the bulk of the machinery
   (`packages/orchestrator`), so it `(covers:)` those 14 capabilities.
2. **The build-drive + ADR-authoring surface is green** _(gate: observe)_ _(covers: build-drive-cli, story-real-chain, gate-as-proof-authoring)_ `pnpm --filter @storytree/cli test`.
   The spine OBSERVES the CLI-resident integration suite green at a clean HEAD — `node build` / `story
   build` dispatch + the honest dry-run/`--real` framing and the `--store pg` + `--dry-run` refusal (a
   scripted PASS persisted would be a forged healthy) (`build-drive-cli`, `node-build.test.ts`), the
   whole-story real chain over one worktree promoted once (`story-real-chain`, `story-real-build.test.ts`),
   and ADR-authoring earning a signed verdict through the unchanged gate via the structural-completeness
   checker (`gate-as-proof-authoring`, `gate-as-proof.test.ts`). The `node build` / `story build` DRIVERS moved into
   `@storytree/drive` (ADR-0112), but their integration tests stay cli-resident, and the ADR-authoring
   completeness checker (`adr-completeness.ts` / `gate-as-proof.ts`) is genuinely CLI-resident beside the
   corpus/ADR primitives `cli` owns — so all three caps' offline proofs run under the `@storytree/cli`
   suite (the same suite `cli#gate-1` adopts).
3. **The drive package's OQ-hygiene gate is green** _(gate: observe)_ _(covers: oq-hygiene-gate)_ `pnpm --filter @storytree/drive test`.
   The spine OBSERVES the carved-out drive package green at a clean HEAD — in particular the OQ-hygiene
   gate refusing a live story build while an operator answer on a deciding ADR's open question sits
   unprocessed (`oq-gate.test.ts`). Since ADR-0112 the OQ-hygiene loader + its test live in `@storytree/drive`;
   that suite runs much more (other stories' drive surfaces), but `oq-hygiene-gate` is the only
   drive-machinery capability whose offline proof is resident there.
4. **The dishonest-path refusal pair is green** _(gate: observe)_ `pnpm --filter @storytree/cli --filter @storytree/drive test`.
   The spine OBSERVES both suites through one executable pnpm command at a clean HEAD: the CLI-resident
   integration test refuses `--store pg` with `--dry-run`, and the drive-resident OQ-hygiene test refuses
   a live story build with an unprocessed operator answer on a deciding ADR. Together they prove the
   whole of Story UAT leg 6, which binds to `drive-machinery#gate-4`. This gate carries no `(covers:)`;
   gates 2 and 3 already cover the owning capabilities, and this combined command exists only because
   no single existing gate command proved both halves of the UAT leg.
5. **The proven commits reached `main` non-squash** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/promotion-ancestry.check.ts`.
   The machine witness for Story UAT leg 4 (ADR-0184): a free, deterministic check that every attested
   drive-machinery REAL-proof commit (`0e8f4ba` verdict-line, `47c9e43` node-resolve-report, and the
   three uat-machine binding proofs) is an ancestor of HEAD — proving each reached `main` AND was not
   squashed away (a squash orphans the original SHA). Kept OUT of `pnpm -r test` (it pins real landed
   commits a shallow CI checkout lacks). Its pure teeth are covered offline by
   `promotion-ancestry.test.ts`. Carries no `(covers:)` — it proves a UAT leg, not a capability.
6. **A recent REAL build is signed, driven, and landed** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/witnessable-verdict.check.ts`.
   The machine witness for Story UAT leg 3 (ADR-0184): a live-artifact check that a spine-driven
   DRIVEN-tier (`contract`/`capability`/`story`, never the observe-and-sign `adopted` mode) passing
   verdict for a drive-machinery node exists in `events.verdict`, is recent (≤90 days — the ADR-0016
   ageing floor that forces a periodic deliberate re-run, so a stale artifact reds the gate), and pins
   a commit that is an ancestor of HEAD (it landed non-squash, reusing gate-5's ancestry primitive). The
   heavy live `--real` run that produces the artifact is OUT-OF-BAND (ADR-0010 §5 — never on a gate
   pass); this cheap command only WITNESSES the persisted signed pass. Kept OUT of `pnpm -r test` (it
   needs the live store + a full clone). Its pure teeth are covered offline by `witnessable-verdict.test.ts`.
   Carries no `(covers:)` — it proves a UAT leg, not a capability.
7. **A fresh uncoached agent reached a signed verdict** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/dogfood-witness.check.ts`.
   The machine witness for Story UAT leg 7 (ADR-0184): a live-artifact check that a spine-driven
   DRIVEN-tier passing verdict for a `dogfood-probe-*` node — one authored by a fresh, uncoached
   `claude -p` agent onboarding from CLAUDE.md alone (`dogfood-probe.run.ts`) — exists in
   `events.verdict`, is recent (≤90 days), and pins a commit in HEAD's ancestry (it landed non-squash).
   It reuses leg 3's pure witness core (`selectWitnessableVerdict`), scoped to the dogfood-probe
   namespace. The "a fresh UNCOACHED agent produced it" property is guaranteed by the harness's
   construction — its task prompt names no inner-loop mechanic (`auditUncoached`, proven by
   `dogfood-probe.test.ts`) and is code-reviewed once (ADR-0184 d.4) — not re-judged by this gate per
   run. The heavy live probe run is OUT-OF-BAND (ADR-0010 §5); this cheap command only witnesses the
   persisted signed pass. Kept OUT of `pnpm -r test` (live store + full clone). Its pure teeth are
   the leg-3 core's (`witnessable-verdict.test.ts`) plus the uncoached-prompt audit
   (`dogfood-probe.test.ts`). Carries no `(covers:)` — it proves a UAT leg, not a capability.

These seven gates record the story's evidence floor, but ADR-0395 withdraws their former use as an
Adopt route for this greenfield story. This audit runs none of them and manufactures no verdict.
`healthy` stays non-authorable
([ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md)) — the authored
frontmatter `status:` stays `proposed`; the world's crown DERIVES green from valid signed verdicts
([ADR-0040](../../docs/decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md)) and only
when every capability is `healthy` AND every own-proof obligation (these reliability gates) is signed
AND every Story UAT leg above is green. That Story UAT is now FULLY machine-witnessed (ADR-0184): each
leg derives green from its bound gate's valid signed verdict, NOT from a human "I saw it work"
attestation or a provenance-invalid Adopt shortcut (the story node stays withheld until
then, ADR-0040;
[ADR-0082](../../docs/decisions/0082-per-test-uat-test-criteria-earn-green-by-declared-witness-story-uat.md) /
ADR-0083 Fork A + ADR-0085 still govern how each machine UAT leg derives green). No single gate greens
the story.

## Proof

The story carries the UAT above (ADR-0010 §2); it is proven when that walkthrough passes against
the real machinery with the capabilities' integration tests and contracts green underneath. The
greenfield `proposed` classification and current proof evidence are pinned in **Honest status** and
per capability — nothing
here is `healthy`: per ADR-0020, `healthy` is only ever DERIVED from signed verdicts, and the only
node with one is `verdict-line` (whose authored status stays `proposed` forever, by design).

## Open modeling calls (for the owner)

1. **The story's name.** You observed the description says "the spine" while the id says
   `drive-machinery`. A rename (e.g. → `spine`) is mechanically proven — PR #69 renamed
   `studio-foundation` → `studio`: the directory name is the tree/UI key, the frontmatter id the
   build key (keep them equal), update every live reference, leave ADR prose as history.
   `verdict-line`'s persisted verdict would NOT orphan (verdicts key by unit id). Surfaced, not
   done — your call on the name.
2. **The PhaseAuthor seam framing — RESOLVED 2026-06-21.** Confirmed consumed-not-owned, and the
   `packages/agent` leaf-organism story was authored ([`stories/agent`](../agent/story.md), resolving
   `oq-agent-as-its-own-organism-story`): that story owns the seam as its declared interface (ADR-0010
   §4) and this story gained the `agent` story-level edge in `depends_on`. The split was the
   rule-decided outcome (story-author): the `splitting-rule`'s two triggers both fire and the consumer
   (the spine) is agnostic to the runtime behind the seam.
3. **`work-verdict-event-log` spans `packages/core` + `packages/store`.** I kept the projection
   and the pg event store as ONE capability (one vocabulary, one parity bar — the library's
   store-seam shape). The alternative is splitting the pg half out so the live-SQL `proposed`
   pocket is visible at capability grain.
4. **`oq-hygiene-gate`'s home (RESOLVED 2026-06-14).** It lives here because the build drive consumes
   it (the gate fires inside `story build --live`), implementing ADR-0037 §5. Its sibling machinery
   (`adr-health` + ADR-number allocation, the CI repo-path checks) is now owned by `stories/ci-cd`'s
   [`adr-health-gate`](../ci-cd/adr-health-gate.md): ADR-0037 enforcement is split by TRIGGER SURFACE
   — §3–4 on the contributor PR (ci-cd), §5 on the live `story build` drive (here) — kept with each
   trigger rather than merged. A future `decision-binding` substrate story could still absorb both;
   the owner deferred that, so this capability stays.
5. **Registering the machinery's own nodes — ADDRESSED (ADR-0057, keystone BUILT).** The keystone
   [`spec-borne-proof-config`](spec-borne-proof-config.md) is now built (outer-loop, per the
   bootstrap caveat): a node declares its own proof command + write scope in its own spec's `proof:`
   block, so *authoring* a node is what makes it buildable — no orchestrator-registry edit. The
   machinery's own capabilities are now self-driveable by authoring a `proof:` block in each (the
   next bootstrap rung toward `healthy`); the keystone itself is a multi-file change the single-file
   inner loop could not drive at registration time. That history does not change its greenfield
   provenance; without a current signed pass it stays `proposed` (ADR-0395).
