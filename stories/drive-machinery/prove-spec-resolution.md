---
id: "prove-spec-resolution"
tier: capability
story: drive-machinery
title: "Node specs, the build registry, and ProveSpec resolution"
outcome: "Any registered node id resolves into a runnable ProveSpec for the chosen mode with nothing left to hand-wire."
status: proposed
proof_mode: integration-test
depends_on: [red-green-phase-machine, shell-test-observer, prove-it-gate, owned-loop-phase-author, real-build-worktree]
decisions: [232, 390, 555]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "--filter", "@storytree/cli", "test"]
  scope:
    testGlobs:
      - "packages/orchestrator/src/resolve-prove-spec.test.ts"
      - "packages/cli/src/codex-leaf-prompt.test.ts"
    sourceGlobs: ["packages/orchestrator/src/resolve-prove-spec.ts"]
  real:
    testFile: "packages/orchestrator/src/resolve-prove-spec.test.ts"
    sourceFile: "packages/orchestrator/src/resolve-prove-spec.ts"
    scope:
      testGlobs:
        - "packages/orchestrator/src/resolve-prove-spec.test.ts"
        - "packages/cli/src/codex-leaf-prompt.test.ts"
      sourceGlobs: ["packages/orchestrator/src/resolve-prove-spec.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/cli", "exec", "node", "--import", "../../scripts/tsx-cache-off.mjs", "--import", "tsx", "--test", "../../packages/orchestrator/src/resolve-prove-spec.test.ts", "src/codex-leaf-prompt.test.ts"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "--filter", "@storytree/cli", "typecheck"]
---

# Node specs, the build registry, and ProveSpec resolution

**Outcome —** Any registered node id resolves into a runnable ProveSpec for the chosen mode with nothing left to hand-wire.

**Depends on —** [`red-green-phase-machine`](red-green-phase-machine.md), [`shell-test-observer`](shell-test-observer.md), [`prove-it-gate`](prove-it-gate.md), [`owned-loop-phase-author`](owned-loop-phase-author.md), [`real-build-worktree`](real-build-worktree.md)

> **Proof status (honest) — `proposed`, with the LIVE-leaf arm still unsigned.** The
> resolver, the spec loader, the registry, the prompts, the feedback-tool arming, and BOTH offline
> end-to-end walks (dry-run glue and the REAL-mode worktree walk with a scripted author) are
> covered by a real, passing, offline suite (`packages/orchestrator/src/resolve-prove-spec.test.ts`,
> part of `@storytree/orchestrator` 99/99 — I ran it 2026-06-13). The pocket: live mode binds a
> REAL author selected at the injection layer — `CodexPhaseAuthor` is the omitted-runtime default
> with saved ChatGPT authentication, while `--runtime claude` selects `ClaudeAgentAuthor` explicitly
> (ADR-0555). Offline
> tests verify construction and scope arming but never run the subscription leaf; the
> genuinely-live legs are need-gated, not standing tests.

**Runtime repair status — unproven.** Contracts 9 and 10 below are amended to repair the
observed Codex prompt contradiction. The declared edit-existing proof must earn a fresh ordinary
spine-observed regression red→green; the historical offline passes above do not prove this amendment.
Capturing the final stdin with an injected process runner is an automated observation of prompt
composition, never a real author run or a signed verdict.

## Proof walkthrough (runtime amendment, written first)

Given an existing resolver, a specification with distinctive guidance and declared contract IDs,
and the existing Codex runner injection seam, a machine test:

1. Resolves omitted-runtime and explicit Codex REAL builds for net-new, edit-existing and
   refactor-for-testability fixtures, with and without installed dependencies, then passes each
   resolved phase brief and its rendered role through `CodexPhaseAuthor`. It captures the actual
   final `CodexCommand.stdin` in both AUTHOR_TEST and IMPLEMENT, after the adapter appends the
   phase manifest. It also checks the default Codex live-smoke path.
2. Reads that final stdin and the actual launch arguments: native shell/`apply_patch` authoring is
   available, MCP and proof/typecheck feedback tools are absent, and the text neither orders an
   unavailable tool nor falsely denies the available authoring tools. It expressly withholds a
   shell substitute for registered proof/typecheck feedback and assigns observations, promotion
   and signing to the spine. Exact allowed and required phase targets, outcome, guidance, declared
   contract IDs and the phase's test/source duties survive composition. Live-smoke deliberately
   retains its synthetic target pair and absence of the real unit's contract block.
3. Resolves explicit Claude builds and observes that the advertised bounded feedback tools match
   the tools actually armed: the exact proof oracle, plus typecheck only when registered. It
   compares default and explicit Codex launch selection to the existing model default and checks
   that none of these prompt changes changes a proof command, scope, promotion manifest or spine
   observation/signing seam.
4. Runs the same final-stdin assertions with an offline Library fixture for standing coverage and,
   explicitly outside the ordinary offline suite, with current live roles rendered through
   `renderLeafPhasePrompts()` without an injected store. A missing or contradictory live role
   fails that live check; an offline fixture pass alone does not establish live composition.

The new regression must fail against current prompt behavior, not an invented symbol or a
fabricated red. An injected runner only observes final prompt composition; it does not replace the
ordinary real author that writes this regression through the spine.

## Guidance

Three files, one act — turn a unit id into everything `proveUnit` needs:

- **`node-spec.ts`** — a LIGHT frontmatter loader for `stories/<story>/<unit>.md`
  (`loadNodeSpec`, `node-spec.ts`): validates JUST the fields the resolver needs (the `Frontmatter`
  zod schema, unknown keys tolerated), carries the `## Guidance` prose for prompt assembly
  (`guidanceSection`), and is LOUD on a missing/unterminated frontmatter block. `findNodeSpecFile`
  (`node-spec.ts`) locates a capability at `stories/<story>/<id>.md` and a story at
  `stories/<id>/story.md`; `mapProofMode` (`node-spec.ts`) maps the seed's test-kind vocabulary onto
  core's tier ladder.
- **`test-command-registry.ts`** — the EXPLICIT node→build-config map
  (`NODE_BUILD_REGISTRY`, `test-command-registry.ts`): for each buildable node, the REAL
  proof command and the per-phase write-scope globs; `real:` entries (ADR-0031 §2) add the REAL
  test/source files, exact-file walls, `install` and the REQUIRED-when-installed `typecheck`.
  Explicit by design — a node is buildable only once someone deliberately registers how to prove
  it; a miss is `null`, never a guess.
- **`resolve-prove-spec.ts`** — the injection layer (`resolveProveSpec` + `resolveReal`,
  `resolve-prove-spec.ts`), three modes:
  **dry-run** (offline, zero cost: a scripted phase-aware model behind
  [`owned-loop-phase-author`](owned-loop-phase-author.md), a temp workspace, a real Node test
  runner over a planted red→green pair — proves the GLUE, not the node's proofs);
  **live-smoke** (ADR-0030 Phase D: the selected REAL author — Codex by default, Claude via
  `--runtime claude` under ADR-0555 — authors the synthetic pair under phase-enforced scope); **real** (Phase F:
  nothing synthetic — the registry's real files in a
  fresh git worktree, the registry's REAL proof command, and a tree seam that COMMITS the
  authored files spine-side before reading genuine `git status` — `resolveReal`'s default
  `treeState`, which calls `commitAuthored` then `gitTreeState`).
  For the explicitly selected Claude runtime, `feedbackCommandsFor` arms the leaf's bounded
  ADR-0035 tools — `run_proof` spawns
  the SAME command the spine's observations spawn (one oracle, two consumers), `run_typecheck`
  only when registered. The prompt builders (`assemblePrompts`, `realPrompts`) splice the node's
  REAL outcome + guidance into the phase briefs, including the
  no-node_modules / typecheck-wall constraints.

**Runtime-accurate phase briefs (contracts 9 and 10).** The selected runtime is an input to
the REAL and live-smoke briefs. Omitted runtime remains Codex; the existing Codex model default,
explicit Claude selection, subscription authentication and no-fallback policy are unchanged.
Codex authors with native shell/`apply_patch` in its disposable replica, with no MCP,
`run_proof` or `run_typecheck` feedback tool. Its brief must not instruct those tools, promise
their feedback or claim shell authoring is unavailable. Available shell authoring grants no
shell-based substitute for registered proof/typecheck feedback (ADR-0232 D5). It reads and authors
within the phase's exact declared targets, then stops for the deterministic spine to observe.
The Codex write boundary is the existing complete-diff observation and exact-target promotion;
no obsolete `PreToolUse` hook or OS containment is promised. Claude's briefs retain its actual
file-tool/write-hook boundary and bounded feedback tools, with no arbitrary shell command tool.
Both runtimes retain author-only duties, dependency restrictions, stop-if-test-wrong behavior and
the spine's sole red/green/promotion/verdict authority. Preserve the synthetic smoke's distinct
purpose and the dry-run's scripted behavior.

**Authored source and proof ownership.** IMPLEMENT may edit only
`packages/orchestrator/src/resolve-prove-spec.ts`. AUTHOR_TEST may edit the existing
`packages/orchestrator/src/resolve-prove-spec.test.ts` and author
`packages/cli/src/codex-leaf-prompt.test.ts`; both are named by the explicit proof command.
The CLI integration home already consumes Library, drive, orchestrator and agent dependencies,
so it can use the production role renderer, resolver and existing injected Codex runner without
adding a dependency cycle or changing the agent adapter. The live check uses the same integration
assertions in an explicit opt-in mode; ordinary tests remain offline and need no database or model.
The offline test supplies neutral role artifacts in its own injected Library store; the shared
historical corpus fixture's Claude-specific role wording is not a current runtime specification
and must not force an adapter sanitizer or a shared-fixture source edit.
Live red/green role wording is supplied by the guidance curator. This leaf authors no Library
artifact, manifest or dependency change.

Every preserved contract ID below must name a substantive test of its own assertion. Reuse the
existing meaningful cases for unchanged contracts; adding an ID to a placeholder, a shared happy
case or an unrelated assertion does not prove it. Contract 11's declared-ID briefing remains intact.

Code edges for the `depends_on`, all imports in `resolve-prove-spec.ts`: `PathWriteScope` (from
`./phase-machine.js`), `OwnedLoopAuthor` (`./owned-loop-author.js`), `ShellTestExecutor` +
`runShellCommand` (`./shell-test-executor.js`), `gitTreeState` (`./prove-it-gate.js`),
`commitAuthored` + `platformShellCommand` (`./build-worktree.js`); plus the type edges
`test-command-registry.ts` imports — `ShellCommand` (`./shell-test-executor.js`) and
`PathWriteScopeConfig` (`./phase-machine.js`). The VALUE imports of `ClaudeAgentAuthor` and
`CodexPhaseAuthor` from `@storytree/agent` are the one place the consumed executor seam goes
concrete — deliberately HERE, in the injection layer, so the gate itself stays author-agnostic.
Whichever author is selected, its proof feedback remains untrusted: the deterministic spine reruns
the registered command out of band and remains the sole red/green/verdict authority (see the
story's executor-seam section).

## Integration test

**Goal —** A REAL node spec resolves and drives through the REAL gate offline, twice over:
(1) dry-run glue — the real `library-cli` spec → ProveSpec → `proveUnit` → signed pass → rollup
`healthy` (`packages/orchestrator/src/resolve-prove-spec.test.ts`, the test named
`dry-run glue: real library-cli spec → ProveSpec → proveUnit → signed pass → rollup healthy`);
(2) the REAL-mode walk — a fresh worktree of a throwaway repo, the registry's real proof command,
a scripted author via the `authorOverride` test seam, the spine's commit, a signed pass on a
genuinely clean tree (`resolve-prove-spec.test.ts`, the test named `REAL mode offline walk: fresh
worktree + real proof command + spine commit → signed pass on a genuinely clean tree`).

The runtime amendment adds the actual final-stdin walk above in
`packages/cli/src/codex-leaf-prompt.test.ts`, alongside resolver regressions. The existing scripted
walks remain offline tests of machinery; they are not a substitute author or signed proof for this
repair. The declared REAL proof runs both test files, and promotion retains both package suites
and typechecks as the regression floor.

## Contracts (11)

1. **`spec-files-locate-and-load`** — capability and story specs are found and parse to typed NodeSpecs with guidance prose
   - **asserts —** `findNodeSpecFile` resolves both layouts; real library specs load; no frontmatter is LOUD.
   - **covers —** `packages/orchestrator/src/node-spec.ts` — `loadNodeSpec` (with the `Frontmatter` zod schema and `guidanceSection`) and `findNodeSpecFile`
   - **proven by —** `packages/orchestrator/src/resolve-prove-spec.test.ts` — the tests `findNodeSpecFile locates a capability and a story's own spec`, `loadNodeSpec parses the real library-cli frontmatter`, `loadNodeSpec parses the real library story spec`, `loadNodeSpec is loud on a file without frontmatter`, and `loadNodeSpec wraps a malformed 'proof:' block with the file path` (REAL, passing)
2. **`proof-mode-vocabulary-maps`** — the seed's test-kind words map onto core's tier ladder
   - **asserts —** integration-test→capability, UAT→story, contract-test→contract, operator-attested shared.
   - **covers —** `node-spec.ts` — `mapProofMode` (and its `FrontmatterProofMode` vocabulary)
   - **proven by —** `resolve-prove-spec.test.ts` — the test `mapProofMode maps the frontmatter vocabulary onto core ProofMode` (REAL, passing)
3. **`registry-is-explicit`** — the registered nodes resolve to commands+scopes; a miss is null
   - **asserts —** the library story + capabilities are covered; unknown ids return null.
   - **covers —** `test-command-registry.ts` — `NODE_BUILD_REGISTRY` plus `lookupNodeBuildConfig` / `registeredNodeIds`
   - **proven by —** `resolve-prove-spec.test.ts` — the test `the registry covers the library story + its seven capabilities; a miss is null` (REAL, passing)
4. **`real-walls-really-wall`** — every REAL entry's write scope allows exactly its test file in AUTHOR_TEST and its source file in IMPLEMENT
   - **asserts —** the verdict-line and notice-board entries' walls hold; every install-bearing entry registers a typecheck (the registry-wide invariant).
   - **covers —** `test-command-registry.ts` — the `real:` arms of the `NODE_BUILD_REGISTRY` entries (`verdict-line`, `noticeboard-cli`, `tree-view`, `ambient-integration`, `verdict-glyphs`), plus `realBuildableNodeIds`
   - **proven by —** `resolve-prove-spec.test.ts` — the tests `the verdict-line entry carries a REAL proof config whose write walls really wall`, `the ambient-integration entry is REAL-buildable with install and exact-file walls`, `the noticeboard-cli entry is REAL-buildable with install and walls excluding the dispatch`, `the tree-view entry is REAL-buildable with install and walls excluding the dispatch`, and `every install-bearing REAL entry registers a typecheck command` (REAL, passing)
5. **`unregistered-is-not-buildable`** — resolution fails closed with the buildable ids; REAL mode additionally requires a real-proof config
   - **asserts —** both refusals carry guidance, never a guess.
   - **covers —** `resolve-prove-spec.ts` — the no-proof-config refusal in `resolveProveSpec` (returning `registeredNodeIds()`) and the no-`real:`-arm refusal in `resolveReal` (returning `realBuildableNodeIds()`)
   - **proven by —** `resolve-prove-spec.test.ts` — the tests `resolveProveSpec refuses a node with NEITHER a spec block NOR a registry entry` and `real mode fails closed on a registered node WITHOUT a real-proof config` (REAL, passing)
6. **`prove-spec-fields-come-off-the-real-spec`** — unitId, mapped proofMode, testId, runId, signer fill from the loaded spec
   - **asserts —** the resolved ProveSpec mirrors the node's identity.
   - **covers —** `resolve-prove-spec.ts` — the `ProveSpec` object literal `resolveProveSpec` returns (`unitId` / `proofMode` via `mapProofMode` / `testId` / `runId` / `signerInputs`)
   - **proven by —** `resolve-prove-spec.test.ts` — the test `resolveProveSpec fills the real fields off the spec (unitId, mapped proofMode, testId, runId)` (REAL, passing)
7. **`dry-run-glue-end-to-end`** — real spec → ProveSpec → proveUnit → signed pass → rollup healthy, offline
   - **asserts —** the whole chain over an InMemoryStore.
   - **covers —** `resolve-prove-spec.ts` — `resolveProveSpec`'s dry-run arm: the synthetic `ShellTestExecutor` / `PathWriteScope` seams, the `OwnedLoopAuthor` over `dryRunModel`, and `assemblePrompts`
   - **proven by —** `resolve-prove-spec.test.ts` — the test `dry-run glue: real library-cli spec → ProveSpec → proveUnit → signed pass → rollup healthy` (REAL, passing)
8. **`real-mode-walk-earns-its-tree`** — fresh worktree + real proof command + spine commit → signed pass on a genuinely clean tree
   - **asserts —** the verdict's commitSha is the spine's commit; `git status` is genuinely clean.
   - **covers —** `resolve-prove-spec.ts` — `resolveReal`, including its default `treeState` seam (`commitAuthored` then `gitTreeState`)
   - **proven by —** `resolve-prove-spec.test.ts` — the test `REAL mode offline walk: fresh worktree + real proof command + spine commit → signed pass on a genuinely clean tree` (REAL, passing — via the `authorOverride` seam; the live-leaf default is the `proposed` pocket)
9. **`prompts-brief-the-real-constraints`** — the final leaf instructions truthfully brief the selected runtime while preserving the unit and phase obligations
   - **asserts —** BOTH phases in all three REAL arms preserve outcome, guidance, contract IDs, the exact declared test/source scope, dependency restrictions, required outputs and stop-if-test-wrong behavior. A machine capturing actual final Codex stdin after rendered-role and adapter composition sees available native shell/`apply_patch` authoring and exact observed promotion, no promised `PreToolUse`/OS containment, no instruction to use unavailable proof/typecheck tools, and an explicit prohibition on substituting shell proof/typecheck feedback. The spine alone observes and signs. The same runtime truthfulness holds for live-smoke while its synthetic pair and deliberate absence of real contract IDs remain unchanged. Explicit Claude retains its actual tool and enforcement instructions. Omitted runtime, the existing Codex model default and all proof/scoping/promotion inputs are unchanged.
   - **covers —** `packages/orchestrator/src/resolve-prove-spec.ts` — `assemblePrompts`, `realPrompts`, `liveSmokePrompts` and selected-runtime brief wiring in `resolveProveSpec` / `resolveReal`; the final composition assertion consumes the existing drive role renderer and Codex adapter without granting them implementation scope.
   - **proven by —** `packages/orchestrator/src/resolve-prove-spec.test.ts` plus `packages/cli/src/codex-leaf-prompt.test.ts` — substantive runtime/phase/mode and manifest assertions, including actual final stdin with an offline rendered Library fixture and the same assertions against explicitly loaded current live roles. Amended behavior is UNPROVEN until the ordinary real spine observes its regression red→green; the opt-in live-role observation records no signature.
10. **`feedback-tools-spawn-the-same-oracle`** — advertised feedback matches the selected runtime's armed tools without adding Codex proof authority
    - **asserts —** explicit Claude's `run_proof` spawns the exact CONFIRM oracle in REAL and live-smoke, and `run_typecheck` is armed and advertised only with its registered installed-node command. Codex's actual `feedbackToolNames` remains empty, its launch keeps MCP disabled, and BOTH phases of every REAL arm and live-smoke tell it to stop for the spine's independent observations without demanding unavailable feedback or authorizing a shell substitute. Installed Codex nodes still receive the spine-owned typecheck requirement. Native authoring tool availability, default runtime/model, registered commands and spine observation/signing authority are unchanged.
    - **covers —** `packages/orchestrator/src/resolve-prove-spec.ts` — `feedbackCommandsFor`, the selected-runtime arming and brief wiring in `resolveProveSpec` / `resolveReal`, and REAL/live-smoke feedback wording.
    - **proven by —** `packages/orchestrator/src/resolve-prove-spec.test.ts` — real spawn assertions for Claude's bounded oracle and the runtime arming/brief matrix; `packages/cli/src/codex-leaf-prompt.test.ts` — final-stdin versus actual Codex launch/feedback assertions for offline and explicitly loaded live roles. Amended behavior is UNPROVEN until the ordinary real spine observes its regression red→green.
11. **`briefs-name-the-declared-contract-ids`** — the phase briefs carry the unit's declared contract ids, independent of what `## Guidance` restates
    - **asserts —** `assemblePrompts` and all three `realPrompts` arms enumerate every declared id in BOTH phases and carry the ADR-0122 naming rule in AUTHOR_TEST; the ids arrive even when the spec's own `## Guidance` names none; a unit declaring no contracts gets no block (brief parity); the live-smoke brief carries none by design.
    - **covers —** `resolve-prove-spec.ts` — the `contractsBrief` helper and its splice sites in `assemblePrompts` and the three `realPrompts` arms
    - **proven by —** `resolve-prove-spec.test.ts` — the five tests whose titles begin `briefs-name-the-declared-contract-ids —`, covering `assemblePrompts enumerates the declared ids in BOTH phases`; `the ids arrive though` the spec's own `## Guidance` restates none; `ALL THREE realPrompts arms carry them`; `a unit declaring NONE gets no block`; and `the live-SMOKE brief deliberately carries NONE` (REAL, passing)
