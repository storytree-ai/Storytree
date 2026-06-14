---
id: "drive-machinery"
tier: story
title: "The drive machinery"
outcome: "The spine drives any registered node through a genuine red→green proof and lands the proven commit through the merge gate."
status: mapped
proof_mode: UAT
capabilities: [halt-aware-sequence, red-green-phase-machine, work-verdict-event-log, phase-scoped-write-wall, shell-test-observer, prove-it-gate, owned-loop-phase-author, real-build-worktree, prove-spec-resolution, spec-borne-proof-config, proof-command-vocabulary, story-topo-build, story-real-chain, multi-file-existing-source, gate-as-proof-authoring, oq-hygiene-gate, build-drive-cli]
# Story-level edge (ADR-0010 §4, code-import-evidenced; ADR-0036): the drive consumes the
# library story's store connection seam — createPool/closePool/applySchema in
# packages/cli/src/node-build.ts:36 (events.work_event/verdict are its OWN tables), and the
# oq-hygiene gate's live loader composes the library's PgLibraryStore + PgCommentStore
# (packages/cli/src/oq-gate.ts:110-119).
depends_on: [library]
# Deciding ADRs (ADR-0037 §2): the spine sequence (5), the gate (20), the SDK leaf (30),
# promotion (31), leaf feedback tools (35), the OQ hygiene gate on live builds (37), the
# inner-loop-expansion keystone — node-borne proof config (57) — and gate-as-proof authoring (59).
decisions: [5, 20, 30, 31, 35, 37, 57, 59]
---

# The drive machinery

**Outcome —** The spine drives any registered node through a genuine red→green proof and lands
the proven commit through the merge gate.

This is the story home for storytree's own build machinery: the prove-it-gate (ADR-0020), the
node/story build drive (`node build` / `story build`, PRs #26–#30), REAL worktree builds and
promotion (ADR-0031), the leaf's bounded feedback tools (ADR-0035), and the OQ-hygiene gate on
live story builds (ADR-0037 §5). Per the V1 lesson recorded in ADR-0031 §3, **machinery is
ordinary work in the ordinary tree** — it gets a normal story, not a special meta-corner. It spans
three packages — `packages/orchestrator` (the spine), the work/verdict halves of `packages/core` +
`packages/store`, and the build surface of `packages/cli` — the same multi-package organism shape
as `library`.

## Honest status

**`mapped` (brownfield), NOT `healthy`, no longer thinly mapped.** The machinery's dominant
behaviour is observationally verified by real, passing, OFFLINE suites I ran on 2026-06-13:
`@storytree/orchestrator` **99/99**, the drive's CLI tests inside `@storytree/cli` **110/110**,
the rollup/work-store halves inside `@storytree/core` **124/124** and `@storytree/store` **40
pass + 2 live-gated skips**. Per `docs/glossary.md` that observational green is exactly brownfield
`mapped` — storytree's own prove-it-gate did not drive these proofs red→green (the pleasing irony:
the gate cannot easily prove itself; re-running these assertions UNDER the gate is the bootstrap
step that would start earning `healthy`). The `proposed` pockets are pinned per capability; the
recurring shape is *offline-proven mechanics, live-attested-but-not-standing-tested live legs*
(the SDK leaf, the GitHub push, the live Postgres SQL, the live OQ loader).

**Buildability is separate from authoredness:** of these nodes only `verdict-line` carries proof
config today (now a spec-borne `proof:` block, ADR-0057 — no longer a registry entry), so
`story build drive-machinery` would still refuse fail-closed at the build-config precheck for the
other capabilities. Declaring how to prove each capability is a deliberate later act — but it is now
done by AUTHORING a `proof:` block in the node's own spec, not by an orchestrator-registry edit
(authoring IS the buildable-node gate; that is exactly what `spec-borne-proof-config` delivered).

## The PhaseAuthor seam is CONSUMED, not owned (the modeling call)

`packages/agent` — the `PhaseAuthor` seam type, the live `ClaudeAgentAuthor` (ADR-0030), and the
owned-loop internals (`model.ts`/`run-turn.ts`/`step.ts`/`tool-executor.ts`/`fs-tools.ts`) — is
**deliberately NOT a capability of this story**. The reasoning:

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

Consequence: authoring a `packages/agent` story (the leaf organism) is **open work**; when it
exists, the seam becomes its declared cross-story interface (ADR-0010 §4) and this story's
frontmatter gains that story-level edge. Until then the coupling is documented here and in each
consuming capability, not hidden.

## Capabilities (17)

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
  - `node-build.ts:15-28` + `story-build.ts:5-12` import `resolveProveSpec`, `loadNodeSpec`,
    `findNodeSpecFile`, `mapProofMode`, and the registry lookups — the whole wiring surface.
- `build-drive-cli` → `prove-it-gate`
  - `node-build.ts:22` imports `proveUnit` — every mode's walk (`node-build.ts:251`, `:446`).
- `build-drive-cli` → `real-build-worktree`
  - `node-build.ts:16-27` imports `createBuildWorktree`, `promoteRealPass`,
    `runRegressionSuite`, `runWorktreeTypecheck` — the `--real` lifecycle (`:417-481`).
- `build-drive-cli` → `story-topo-build`
  - `story-build.ts:10-11` imports `runStoryBuild` + `topoOrderStoryNodes` (`:149`, `:193`).
- `build-drive-cli` → `oq-hygiene-gate`
  - `story-build.ts:17` imports `oqHygieneGate`, called live-only before any spend (`:174-175`).
- `build-drive-cli` → `work-verdict-event-log`
  - `node-build.ts:8-14` imports `workEvent` + `rollupStatus` + `verdictLine` (building marks
    `:219-224`, report rollups `:504`); `:36` imports `PgWorkStore` (the `--store pg` swap,
    `:165-174`).
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

**Cross-story:** the `library` edge in the frontmatter (the store-connection seam +
the OQ loader's library stores). **Cross-package, consumed:** the `PhaseAuthor` seam — see the
section above.

## Units

- [`verdict-line`](verdict-line.md) — contract grain, file-per-unit. The first REAL-built node
  (Phase F): proven by a signed PASS (run `real-mq7ky4ck`, persisted to `events.verdict`), then
  **folded into the system by promotion** (ADR-0031 §3): the exact proven commit is in this
  branch's ancestry, the function is exported from `@storytree/core`, and the CLI node-build
  envelope is its live consumer.

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
> standing test. So the story's own acceptance proof is **part-scripted, part-attested**.

**Goal —** Drive one registered node through a genuine red→green proof and land the proven commit
through the merge gate, refusing every dishonest shortcut along the way.

1. **Orient:** `pnpm storytree node` lists the registered (buildable) and REAL-buildable nodes.
   **Success —** a help envelope naming both sets. *(proven: `node-build.test.ts:102`)*
2. **Prove the glue first:** `pnpm storytree node build verdict-line --dry-run`. **Success —** the
   full phase trail, a signed (in-memory) verdict, a derived rollup, and the honest dry-run
   framing. *(proven: `node-build.test.ts:17`, `:74`)*
3. **The REAL build:** `pnpm storytree node build <id> --real --store pg`. **Success —** a fresh
   detached worktree; the live leaf authors the REAL test under the write wall; the spine observes
   the genuine red, the leaf implements, the spine observes the genuine green, commits the
   authored files, signs on the genuinely clean tree; the verdict persists to `events.verdict`;
   the proven commit is parked on `claude/real/<id>-<run>` and pushed (typecheck + regression
   green first for install-bearing nodes). *(mechanics proven offline:
   `resolve-prove-spec.test.ts:539` (scripted author), `build-worktree.test.ts:28-219`; the live
   leg attested once: run `real-mq7ky4ck`)*
4. **Land it:** open the PR from the promotion branch; CI auto-merges on green, NON-SQUASH, so the
   verdict's `commitSha` stays an ancestor of `main` (ADR-0031/0022). **Success —** the proven
   commit is reachable from `main`. *(attested: commit `0e8f4ba` is in this branch's ancestry)*
5. **Chain a story:** `pnpm storytree story build library --dry-run`. **Success —** capabilities
   topo-ordered from `depends_on`, the story's UAT node last, every node signed over ONE event
   log, halt-is-never-a-pass. *(proven: `packages/cli/src/story-build.test.ts:17`; the live chain
   attested: library 8/8 signed passes, $0.48)*
6. **Refuse the dishonest paths:** `--store pg` with `--dry-run` is refused (a scripted PASS
   persisted would be a forged healthy); a live story build with an unprocessed operator answer on
   a deciding ADR's OQ is refused with the three paths out. *(proven:
   `story-build.test.ts:90`/`:124`, `oq-gate.test.ts:141`)*

End state — a genuine proof earned, signed, persisted, promoted, and landed; every shortcut walled.

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
2. **The PhaseAuthor seam framing** (section above): confirm consumed-not-owned, and whether
   authoring the `packages/agent` leaf-organism story should be queued — that story would own the
   seam as its declared interface (ADR-0010 §4) and this story would gain the story-level edge.
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
