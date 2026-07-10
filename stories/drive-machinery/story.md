---
id: "drive-machinery"
tier: story
title: "The drive machinery"
outcome: "The spine drives any registered node through a genuine red→green proof and lands the proven commit through the merge gate."
status: proposed
proof_mode: UAT
capabilities: [halt-aware-sequence, red-green-phase-machine, work-verdict-event-log, phase-scoped-write-wall, shell-test-observer, prove-it-gate, owned-loop-phase-author, real-build-worktree, prove-spec-resolution, spec-borne-proof-config, proof-command-vocabulary, story-topo-build, story-real-chain, multi-file-existing-source, gate-as-proof-authoring, oq-hygiene-gate, build-drive-cli, adoption-pocket-classifier, uat-machine-proof-binding, uat-machine-gate-resolution, uat-bound-command-adoption]
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
# binds ClaudeAgentAuthor) — the cross-story edge the "PhaseAuthor seam is CONSUMED, not owned"
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
# Deciding ADRs (ADR-0037 §2): the spine sequence (5), the gate (20), the SDK leaf (30),
# promotion (31), leaf feedback tools (35), the OQ hygiene gate on live builds (37), the
# inner-loop-expansion keystone — node-borne proof config (57) — gate-as-proof authoring (59),
# the drive-package extraction that gave this story its own @storytree/drive home (112), and the
# fail-closed per-UAT-leg proof binding required by ADR-0180 d.5.
decisions: [5, 20, 30, 31, 35, 37, 57, 59, 60, 112, 180]
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

**`mapped` (brownfield), NOT `healthy`, no longer thinly mapped.** The machinery's dominant
behaviour is observationally verified by the real, passing offline orchestrator, CLI, drive, and
store suites. Per the Library's lifecycle definitions that observational green is brownfield
`mapped` — storytree's own prove-it-gate did not drive the original proofs red→green (the pleasing irony:
the gate cannot easily prove itself; re-running these assertions UNDER the gate is the bootstrap
step that would start earning `healthy`). The `proposed` pockets are pinned per capability; the
recurring shape is *offline-proven mechanics, live-attested-but-not-standing-tested live legs*
(the SDK leaf, the GitHub push, the live Postgres SQL, the live OQ loader).

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

`packages/agent` — the `PhaseAuthor` seam type, the live `ClaudeAgentAuthor` (ADR-0030), and the
owned-loop internals (`model.ts`/`run-turn.ts`/`step.ts`/`tool-executor.ts`/`fs-tools.ts`) — is
**not a capability of this story** (it is the `agent` organism's). The reasoning:

1. **The seam's whole point is author-agnosticism.** ADR-0030 §2 frames `PhaseAuthor` as the
   pivot seam: the spine hands a leaf exactly two authoring slices and must not care which runtime
   answers. Folding the leaf runtimes into the drive's organism would dissolve the boundary that
   makes the pivot-out fallback real. The gate consumes the seam as a TYPE only
   (`prove-it-gate.ts:18`).
2. **`packages/agent` is its own organism** — a model seam, a turn loop, a fail-closed step
   runner, a real file-tool surface, and the SDK leaf, with its own passing suite (55/55). That is
   a story-sized bounded context (ADR-0010), currently unauthored.
3. **The spine-side adapter IS in-story.** `OwnedLoopAuthor` lives in `packages/orchestrator` and
   is mapped here as [`owned-loop-phase-author`](owned-loop-phase-author.md) — the drive owns its
   side of the seam, not the loop behind it.
4. **The one place the seam goes concrete** — the VALUE import of `ClaudeAgentAuthor` in
   [`prove-spec-resolution`](prove-spec-resolution.md) (`resolve-prove-spec.ts:3-8`) — is the
   injection layer, which is exactly where a seam SHOULD be bound to an implementation.

Consequence (now realized): the `packages/agent` leaf organism is authored as
[`stories/agent`](../agent/story.md); the seam is its declared cross-story interface (ADR-0010 §4)
and this story's frontmatter carries the `agent` edge in `depends_on`. The coupling is no longer just
documented prose — it is a first-class declared, world-visible edge (the boundary gate, ADR-0074,
now sees the spine↔leaf seam).

## Capabilities (21)

Listed roots-first (a capability appears after everything it depends on). `mapped` = a real
passing offline suite observationally verifies the dominant behaviour; the Proof blockquote in
each file pins the `proposed` pockets.

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`halt-aware-sequence`](halt-aware-sequence.md) | The spine composes leaf steps in strict order and a halted step can never be reported as a pass. | mapped | — |
| 2 | [`red-green-phase-machine`](red-green-phase-machine.md) | A unit advances through the spine-owned phase ladder only via fail-closed transitions the spine itself legitimizes. | mapped | — |
| 3 | [`work-verdict-event-log`](work-verdict-event-log.md) | A unit's lifecycle status is derived as a pure projection over typed work and signing events, never hand-maintained. | mapped | — |
| 4 | [`phase-scoped-write-wall`](phase-scoped-write-wall.md) | A leaf write outside the current phase's scope is refused before it reaches the real executor, and the refusal is recorded. | mapped | `red-green-phase-machine` |
| 5 | [`shell-test-observer`](shell-test-observer.md) | Red or green is a fact the spine reads off a spawned proof command's own exit code, never a claim a leaf could forge. | mapped | `red-green-phase-machine` |
| 6 | [`prove-it-gate`](prove-it-gate.md) | A unit earns a signed PASS verdict only by walking the whole red→green ladder with spine-observed evidence on a clean committed tree. | mapped | `red-green-phase-machine` |
| 7 | [`owned-loop-phase-author`](owned-loop-phase-author.md) | The owned agent loop authors one phase slice at a time behind the PhaseAuthor seam under the in-process write wall. | mapped | `phase-scoped-write-wall`, `red-green-phase-machine` |
| 8 | [`real-build-worktree`](real-build-worktree.md) | A signed REAL pass survives its worktree: the proven commit is parked on a run-unique claude/real branch that lands through the merge gate. | mapped | `shell-test-observer` |
| 9 | [`prove-spec-resolution`](prove-spec-resolution.md) | Any registered node id resolves into a runnable ProveSpec for the chosen mode with nothing left to hand-wire. | mapped | `red-green-phase-machine`, `shell-test-observer`, `prove-it-gate`, `owned-loop-phase-author`, `real-build-worktree` |
| 10 | [`story-topo-build`](story-topo-build.md) | A story's nodes drive through the gate in dependency order with the story's UAT node last and a halt never reported as a pass. | mapped | `halt-aware-sequence`, `prove-spec-resolution`, `prove-it-gate` |
| 11 | [`oq-hygiene-gate`](oq-hygiene-gate.md) | A live story build is refused while an operator answer on a deciding ADR's open question sits unprocessed. | mapped | `prove-spec-resolution` |
| 12 | [`build-drive-cli`](build-drive-cli.md) | An operator drives any registered node or whole story through the gate from one CLI command and gets an honest envelope back. | mapped | `prove-spec-resolution`, `prove-it-gate`, `real-build-worktree`, `story-topo-build`, `oq-hygiene-gate`, `work-verdict-event-log` |
| 13 | [`spec-borne-proof-config`](spec-borne-proof-config.md) | A node carries its own proof config, so authoring it is the single act that makes it inner-loop-buildable. | mapped | `prove-spec-resolution` |
| 14 | [`proof-command-vocabulary`](proof-command-vocabulary.md) | A node declares its own proof command, so the same gate drives non-node:test work red→green. | mapped | `spec-borne-proof-config` |
| 15 | [`story-real-chain`](story-real-chain.md) | A whole story grows to signed verdicts: capabilities real-built in dependency order over one worktree, promoted once. | mapped | `story-topo-build`, `real-build-worktree`, `spec-borne-proof-config` |
| 16 | [`multi-file-existing-source`](multi-file-existing-source.md) | A node declares a multi-file scope + an edit-existing-source regression red→green (bug-fixes/refactors), keeping test-author ≠ code-author. | mapped | `spec-borne-proof-config`, `proof-command-vocabulary` |
| 17 | [`gate-as-proof-authoring`](gate-as-proof-authoring.md) | Authoring an ADR earns a signed verdict through the unchanged gate by reducing to edit-existing with a structural-completeness check — the machine witnesses hygiene, never acceptance. | mapped | `multi-file-existing-source`, `spec-borne-proof-config` |
| 18 | [`adoption-pocket-classifier`](adoption-pocket-classifier.md) | The spine turns each uncovered brownfield pocket into a proposed reliability gate with a build-tests classification and the key forks the human must settle. | mapped | `build-drive-cli` |
| 19 | [`uat-machine-proof-binding`](uat-machine-proof-binding.md) | The Story UAT parser carries each explicit proof-gate annotation into the strict per-leg model without dropping or inventing a binding. | proposed | — |
| 20 | [`uat-machine-gate-resolution`](uat-machine-gate-resolution.md) | Each parsed machine UAT leg resolves only to its named command-bearing observe gate, with every missing or ineligible binding refused. | proposed | `uat-machine-proof-binding` |
| 21 | [`uat-bound-command-adoption`](uat-bound-command-adoption.md) | `runAdopt` observes and signs each machine UAT leg only through the command supplied by that leg's resolved proof-gate binding. | proposed | `build-drive-cli`, `uat-machine-gate-resolution` |

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
  - `uat-tests.ts` parses the explicit `proof-gate` annotation into the strict per-leg model;
    `uat-tests.test.ts` is its complete literal edit-existing REAL proof pair. It has no within-story
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

**Cross-story:** the `library` edge (the store-connection seam + the OQ loader's library stores),
the `storage-protocol` + `proof-protocol` root-port edges (ADR-0075), and the **`agent`** edge — the
spine imports `@storytree/agent` to consume the `PhaseAuthor` seam (`OwnedLoopAuthor` + the gate +
the prove-spec resolver) and bind `ClaudeAgentAuthor`. See the "PhaseAuthor seam is CONSUMED, not
owned" section above for the now-settled modeling call.

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

File-per-unit here is the **registered-buildable grain** (the drive loads one spec file per
buildable node); the authored capability files above follow the seed's contracts-inline convention
(`stories/README.md`). Both conventions are real; ADR-0031 §3 records the distinction.

## Story UAT

The integrated **acceptance walkthrough** proving the organism's outcome end to end: one operator
drives a registered node from spec to a landed, signed, persisted proof.

> **HONEST status — no single scripted UAT spans the whole journey.** Steps 1–2 and 5–6 are
> offline-automated TODAY (citations inline). Steps 3–4's full live shape — a real leaf, the real
> proof command, persistence, promotion, and the non-squash landing — happened ONCE for real
> (verdict-line: run `real-mq7ky4ck`, commit `0e8f4ba` now in `main`'s ancestry) and has a
> scripted offline twin for the mechanics, but the live legs are operator-attested history, not a
> standing test. Step 7 (an agent actually USES it without coaching) is likewise operator-attested —
> the paid blind dogfood, 2026-06-15, 3/3 probes end to end. So the story's own acceptance proof is
> **part-scripted, part-attested**.
>
> **Machine re-authoring remains blocked for the live legs.** The parser
> [`uat-machine-proof-binding`](uat-machine-proof-binding.md), exact resolver
> [`uat-machine-gate-resolution`](uat-machine-gate-resolution.md), and drive consumption
> [`uat-bound-command-adoption`](uat-bound-command-adoption.md) have now established the strict
> no-fallback binding rule. Existing machine legs 1, 2, 5, and 6 therefore name the exact observe gate
> whose command proves them. The owner's requested conversion of legs 3, 4, and 7 is still blocked:
> no standing machine suite proves their full live success conditions, so they remain `human`.
> Pointing them at an offline mechanics suite would forge coverage.

**Goal —** Drive one registered node through a genuine red→green proof and land the proven commit
through the merge gate, refusing every dishonest shortcut along the way.

1. **Orient** _(witness: machine)_ _(proof-gate: drive-machinery#gate-2)_: `pnpm storytree node` lists the registered (buildable) and REAL-buildable nodes.
   **Success —** a help envelope naming both sets. *(proven: `node-build.test.ts:102`)*
2. **Prove the glue first** _(witness: machine)_ _(proof-gate: drive-machinery#gate-2)_: `pnpm storytree node build verdict-line --dry-run`. **Success —** the
   full phase trail, a signed (in-memory) verdict, a derived rollup, and the honest dry-run
   framing. *(proven: `node-build.test.ts:17`, `:74`)*
3. **The REAL build** _(witness: human)_: `pnpm storytree node build <id> --real --store pg`. **Success —** a fresh
   detached worktree; the live leaf authors the REAL test under the write wall; the spine observes
   the genuine red, the leaf implements, the spine observes the genuine green, commits the
   authored files, signs on the genuinely clean tree; the verdict persists to `events.verdict`;
   the proven commit is parked on `claude/real/<id>-<run>` and pushed (typecheck + regression
   green first for install-bearing nodes). *(mechanics proven offline:
   `resolve-prove-spec.test.ts:539` (scripted author), `build-worktree.test.ts:28-219`; the live
   leg attested once: run `real-mq7ky4ck`)*
4. **Land it** _(witness: human)_: open the PR from the promotion branch; CI auto-merges on green, NON-SQUASH, so the
   verdict's `commitSha` stays an ancestor of `main` (ADR-0031/0022). **Success —** the proven
   commit is reachable from `main`. *(attested: commit `0e8f4ba` is in this branch's ancestry)*
5. **Chain a story** _(witness: machine)_ _(proof-gate: drive-machinery#gate-2)_: `pnpm storytree story build library --dry-run`. **Success —** capabilities
   topo-ordered from `depends_on`, the story's UAT node last, every node signed over ONE event
   log, halt-is-never-a-pass. *(proven: `packages/cli/src/story-build.test.ts:17` — the integration test stays cli-resident;
   ADR-0112 moved only the `story build` driver it exercises into `@storytree/drive`; the live chain
   attested: library 8/8 signed passes, $0.48)*
6. **Refuse the dishonest paths** _(witness: machine)_ _(proof-gate: drive-machinery#gate-4)_: `--store pg` with `--dry-run` is refused (a scripted PASS
   persisted would be a forged healthy); a live story build with an unprocessed operator answer on
   a deciding ADR's OQ is refused with the three paths out. *(proven:
   `story-build.test.ts:90`/`:124`, `oq-gate.test.ts:141`)*
7. **An agent actually USES it end to end (the dogfood acceptance)** _(witness: human)_: a fresh orchestrator agent,
   onboarding from CLAUDE.md alone (the inner loop never named for it), drives a unit through steps
   1–4 to a genuine signed verdict — proving the machinery is not just correct but *usable without
   coaching*, the load-bearing question behind ADR-0057. **Success —** the agent discovers the inner
   loop, authors a self-registering node, and reaches a real `--real` signed verdict over real
   behaviour (net-new OR edit-existing). *(operator-attested — the paid blind dogfood, 2026-06-15:
   3/3 blind probes completed end to end, verified on origin — `roundTo` @14c4509, `ordinal`
   @4c0dbf3, and the edit-existing `verdictLine` @d043863 live-proving expansion C. NOT a standing
   scripted test: proving REAL authoring needs the paid live leaf — the free/offline path is the
   scripted glue only. An OFFLINE run first surfaced the gap that every probe stalled at the paid
   edge; allowing spend reversed it cleanly.)*

End state — a genuine proof earned, signed, persisted, promoted, landed, AND shown to be usable by a
fresh agent without coaching; every shortcut walled.

## Reliability Gates

The drive machinery is **brownfield** (`status: mapped`): its dominant behaviour is observationally
verified by real, passing, OFFLINE suites (the counts are in **Honest status**), but storytree's own
prove-it-gate never DROVE these proofs red→green. The pleasing irony **Honest status** notes — *the
gate cannot easily prove itself red→green* — is specifically about the **Build** path (driving a
genuine red→green): a mature machine has no live red to walk. **Adopt** sidesteps it cleanly: observe-
and-sign (ADR-0085 d.3) RECORDS an out-of-band green over an already-green suite — the suite passes or
fails on its own merits and the sign step only attests the observed result, so this is NOT the gate
driving itself red→green. So the spine's honest path off `mapped` is the author-declared **reliability
gates** below, observe-and-signed to an `adopted` verdict
([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md),
resolving [ADR-0083](../../docs/decisions/0083-author-defined-story-green-declared-obligations-machine-per.md)
Fork B). This is the `mapped → healthy` = **Adopt** transition
[ADR-0094](../../docs/decisions/0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md)
names (d.3 retired the status-blind Build for `mapped` stories).

The machinery's offline behaviour spans **three suites** — the spine (`@storytree/orchestrator`), the
CLI-resident build-drive + ADR-authoring integration tests (`@storytree/cli`), and the carved-out drive
package (`@storytree/drive`, ADR-0112) — so its capability reliability floor adopts one consolidated
observe gate per suite, every gate naming the capabilities it `(covers:)` (ADR-0097 — three
capability-covering gates over 18 capabilities reads cleaner than 18 per-cap gates, the same multi-cover
shape the `library` story uses). A fourth, command-bearing observe gate runs the CLI and drive suites
together solely for Story UAT leg 6, whose two refusal assertions span those packages; it carries no
`(covers:)` because the first three gates already cover the capabilities. The first three gates cover
the 18 already-built capabilities. The 18th —
[`adoption-pocket-classifier`](adoption-pocket-classifier.md)
— was authored `proposed` (would-be) and deliberately left uncovered; its behaviour has since been
BUILT outer-loop (2026-06-27, `assembleProposal` + `adopt plan --readings`, commit `2c170db`) with a
real offline suite in the orchestrator package, so it is now honestly brownfield (`mapped`) and
gate-1 `(covers:)` it alongside the other spine-resident caps (ADR-0097 d.5 holds: the crown's green
still MEANS every built pocket got real coverage — this one's coverage is real, not a placeholder).
Capabilities 19–21 — parser
[`uat-machine-proof-binding`](uat-machine-proof-binding.md), exact resolver
[`uat-machine-gate-resolution`](uat-machine-gate-resolution.md), and drive consumption
[`uat-bound-command-adoption`](uat-bound-command-adoption.md) — retain authored `proposed` status
while their separate signed REAL verdicts derive proof health (ADR-0020). They are intentionally not
folded into the three brownfield capability-covering observe gates: each was driven red→green through
its own literal REAL pair.

Distinct from `## Story UAT` above (the part-scripted/part-attested drive-a-node-to-a-landed-proof
journey): the gates are the author's **expandable floor**, GROWING a `_(gate: build-tests)_` regression
leg the moment observation proves insufficient (a real spine/gate defect slips through). **Honesty
boundary — observe greens OFFLINE behaviour only:** several covered caps carry a `proposed` LIVE pocket
(the SDK leaf, the live `--store pg` SQL, the GitHub push, the live OQ loader; see **Honest status** and
each cap's Proof blockquote) that observe does NOT reach — the gate attests the offline suite, which is
honest, not a gap; those live legs stay operator-attested separately and join as `build-tests` gates only
if they ever earn standing offline tests. The bootstrap step **Honest status** names — re-running these
assertions UNDER the gate red→green to start earning `healthy` — remains a separate, later move; adopting
the existing green is the honest brownfield floor.

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
   `adoption-proposal.test.ts`) — all pass offline (no DB, no API key) — then signs an `adopted` verdict
   (`storytree gate run drive-machinery#gate-1 --pg`). This is the bulk of the machinery
   (`packages/orchestrator`), so it `(covers:)` those 14 capabilities.
2. **The build-drive + ADR-authoring surface is green** _(gate: observe)_ _(covers: build-drive-cli, story-real-chain, gate-as-proof-authoring)_ `pnpm --filter @storytree/cli test`.
   The spine OBSERVES the CLI-resident integration suite green at a clean HEAD — `node build` / `story
   build` dispatch + the honest dry-run/`--real` framing and the `--store pg` + `--dry-run` refusal (a
   scripted PASS persisted would be a forged healthy) (`build-drive-cli`, `node-build.test.ts`), the
   whole-story real chain over one worktree promoted once (`story-real-chain`, `story-real-build.test.ts`),
   and ADR-authoring earning a signed verdict through the unchanged gate via the structural-completeness
   checker (`gate-as-proof-authoring`, `gate-as-proof.test.ts`) — then signs an `adopted` verdict
   (`storytree gate run drive-machinery#gate-2 --pg`). The `node build` / `story build` DRIVERS moved into
   `@storytree/drive` (ADR-0112), but their integration tests stay cli-resident, and the ADR-authoring
   completeness checker (`adr-completeness.ts` / `gate-as-proof.ts`) is genuinely CLI-resident beside the
   corpus/ADR primitives `cli` owns — so all three caps' offline proofs run under the `@storytree/cli`
   suite (the same suite `cli#gate-1` adopts).
3. **The drive package's OQ-hygiene gate is green** _(gate: observe)_ _(covers: oq-hygiene-gate)_ `pnpm --filter @storytree/drive test`.
   The spine OBSERVES the carved-out drive package green at a clean HEAD — in particular the OQ-hygiene
   gate refusing a live story build while an operator answer on a deciding ADR's open question sits
   unprocessed (`oq-gate.test.ts`) — then signs an `adopted` verdict (`storytree gate run
   drive-machinery#gate-3 --pg`). Since ADR-0112 the OQ-hygiene loader + its test live in `@storytree/drive`;
   that suite runs much more (other stories' drive surfaces), but `oq-hygiene-gate` is the only
   drive-machinery capability whose offline proof is resident there.
4. **The dishonest-path refusal pair is green** _(gate: observe)_ `pnpm --filter @storytree/cli --filter @storytree/drive test`.
   The spine OBSERVES both suites through one executable pnpm command at a clean HEAD: the CLI-resident
   integration test refuses `--store pg` with `--dry-run`, and the drive-resident OQ-hygiene test refuses
   a live story build with an unprocessed operator answer on a deciding ADR. Together they prove the
   whole of Story UAT leg 6, which binds to `drive-machinery#gate-4`. This gate carries no `(covers:)`;
   gates 2 and 3 already cover the owning capabilities, and this combined command exists only because
   no single existing gate command proved both halves of the UAT leg.

Adopting all four flips the tier off `mapped`. `healthy` stays non-authorable
([ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md)) — the authored
frontmatter `status:` stays `mapped`; the world's crown DERIVES green from the signed verdicts
([ADR-0040](../../docs/decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md)) and only
when every capability is `healthy` AND every own-proof obligation (these reliability gates) is signed
AND the **human-witnessed** Story UAT above is attested (the story node is withheld, ADR-0040;
[ADR-0082](../../docs/decisions/0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) /
ADR-0083 Fork A + ADR-0085). No single gate greens the story.

## Proof

The story carries the UAT above (ADR-0010 §2); it is proven when that walkthrough passes against
the real machinery with the capabilities' integration tests and contracts green underneath. Why
`mapped` and what stays `proposed` is pinned in **Honest status** and per capability — nothing
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
   inner loop can't yet drive, so it stays `mapped` until expansion C (multi-file builds) lands.
