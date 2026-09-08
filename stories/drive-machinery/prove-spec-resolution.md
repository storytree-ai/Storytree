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
      - "packages/cli/src/codex-leaf-prompt.test.ts"
    sourceGlobs: ["packages/orchestrator/src/resolve-prove-spec.ts"]
  real:
    testFile: "packages/cli/src/codex-leaf-prompt.test.ts"
    sourceFile: "packages/orchestrator/src/resolve-prove-spec.ts"
    scope:
      testGlobs:
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

> **Proof status (honest) — `proposed`, with live-leaf acceptance still incomplete.** The
> resolver, the spec loader, the registry, the prompts, the feedback-tool arming, and BOTH offline
> end-to-end walks (dry-run glue and the REAL-mode worktree walk with a scripted author) are
> covered by a real, passing, offline suite (`packages/orchestrator/src/resolve-prove-spec.test.ts`,
> part of `@storytree/orchestrator` 99/99 — I ran it 2026-06-13). The pocket: live mode binds a
> REAL author selected at the injection layer — `CodexPhaseAuthor` is the omitted-runtime default
> with saved ChatGPT authentication, while `--runtime claude` selects `ClaudeAgentAuthor` explicitly
> (ADR-0555). Offline
> tests verify construction and scope arming but never run the subscription leaf; the
> genuinely-live legs are need-gated, not standing tests.

**Runtime repair status — unlanded candidate, acceptance incomplete.** Ordinary run
`real-mtszyjma` produced the current source and CLI test at
`ff9366fb9aa19716dc3c2a8dc1dc1ca21d0c8963`. Its mechanical pass and eleven named contracts do not
discharge the missing assertions below. The finite-list parser and the earlier broad Codex
wildcard invitation are repaired; remaining target-authority discrepancies and incomplete test
bodies remain owed under the full acceptance assertions. The next revision centers its genuine
source regression on the complete final-input witness below; the whole runtime repair stays open.
Capturing the final stdin with an injected process runner is an automated observation of prompt
composition, never a real author run or a signed verdict.

**Authoring prerequisite under the 2026-09-09 owner re-steer.** Continuity's implementation is a
pure event resolver, but its ordinary REAL build is not: `nodeBuild` calls `buildNodeReal`, which
calls `resolveProveSpec`/`resolveReal`; an omitted runtime constructs `CodexPhaseAuthor` and passes
the Codex `realPrompts` result into its phases. Main's false default-Codex instructions therefore
reach a default GPT-5.6 Terra continuity leaf before its own proof can begin. Repair that shared
authoring path first. This is an execution prerequisite, not a new `depends_on` edge for
[`capability-proof-continuity`](capability-proof-continuity.md).

The smallest feasible runtime unit is the complete revision already specified below: the actual
final-input witness, its source-coupled optional-literal and Claude-compatibility regression, and
all eleven substantive contract assertions. A core-prose-only subrevision cannot be driven as this
capability because a normal signed build attests the whole unit; it would leave the recorded
optional-target and explicit-Claude source regressions, plus unverified wall and typecheck-control
observations, under that attestation. The completed Astra attempt is unlanded evidence, not a retry
seed. Run the defined revision with the repository-default GPT-5.6 Terra leaf, then continue the
owner-directed order: continuity, renderer rename, four-way capability split, and safe downstream
fan-out. This preserves the product DAG while naming the shared proof-authoring repair that every
ordinary continuity build actually consumes.

## Guidance

### Next revision: the actual final-input witness

This revision proves one behavior: Codex's composed phase instructions preserve the unit's duties
and grant the write authority of its actual finite manifest. Rewrite the body of the existing
test with this EXACT title and contract ID retained:

`prompts-brief-the-real-constraints: the actual final Codex stdin composed by CodexPhaseAuthor never instructs run_proof/run_typecheck or denies native authoring, while the rendered role and phase brief survive composition`

The full capture matrix below is this test's execution path, through shared helpers. Adding only
optional-target cases to the existing multi-file test does not author this witness. Keep existing
test titles and all eleven IDs; revise existing bodies/helpers, without new `test()`/`it()` blocks
for this bounded revision. Preserve the correct finite-list parser, production manifest assertions
and substantive existing contracts 1, 2, 5, 7 and 8. Incomplete or invalid assertions are not built
proof to freeze.

The complete witness is one authoring unit, not a source-case assertion followed by optional
coverage. Its capture plan has a counted inventory before any optional-target red is claimed:
three REAL authoring shapes (net-new, edit-existing, and refactor-for-testability) × uninstalled
and installed dependencies × omitted and explicit Codex runtime × AUTHOR_TEST and IMPLEMENT is
the **24-cell REAL matrix**. The one live-smoke shape × omitted and explicit Codex runtime × both
phases is the **4-cell smoke matrix**. The shared helper records those keys and rejects a duplicate
or missing cell; a passing subset, even one that reaches the optional-literal assertion, is not
this witness.

The pinned test performs this walkthrough, in order:

1. **Build valid, distinctive inputs.** Revise `baseSpec`, `specWithReal` and `resolveRealFor`
   so each fixture passes the existing proof-config schema and supplies distinctive outcome,
   guidance and declared contract IDs. Broad edit-existing source scope requires an explicit suite
   proof command. Render neutral red/green role artifacts from the test's own injected Library
   store through `renderLeafPhasePrompts(store)`; the shared historical corpus fixture is not the
   role authority for this test.
2. **Capture the command actually composed.** Revise `captureCodexFinalStdin` to return actual
   `CodexCommand.stdin` AND launch arguments after `CodexPhaseAuthor.author`. Use production
   `codexPromotionManifest` through its existing relative import and the actual `PathWriteScope`.
   Read model/MCP selection from the captured launch and compare with the existing default;
   a separate hardcoded `buildCodexExecArgs` call cannot supply that observation. This injected
   runner observes composition only; it does not need to produce a successful real author result
   and never creates a signature.
3. **Run one complete matrix and assertion.** Execute the counted 24-cell REAL inventory above.
   The same helper also resolves the 4-cell smoke inventory, preserving its synthetic pair and
   absence of real contract IDs. It must prove that it covered each distinct key, rather than
   deriving the count from a loop or accepting one fixture twice.
   Each capture checks actual empty feedback tools, model/MCP launch selection, native authoring,
   spine-only observations/signing, exact allowed versus required targets, phase-appropriate
   test/source duties, dependency/typecheck restrictions and stopping behavior. AUTHOR_TEST stops
   after writing its test; REAL IMPLEMENT preserves the frozen test and stops/reports if it is
   wrong. Smoke retains its synthetic phase duties. Assert equivalent behavior in the composed
   input, not an IMPLEMENT-only sentence in AUTHOR_TEST. REAL captures also check the distinctive
   outcome, guidance and every declared ID survived composition. Use the complete role-plus-brief
   input, not a raw-brief substitute.
4. **Qualify the same instruction assertion.** Exercise positive controls accepting a correctly
   qualified unavailable-tool prohibition/runtime comparison and nonauthorizing wildcard context.
   Negative controls must reject unavailable-tool instructions, obsolete no-shell/containment
   claims and optional shell proof/test/typecheck/build feedback grants, including beside a
   spine-signing disclaimer. Apply that same assertion to the captures. Blanket token erasure is
   invalid; a role-supplied prohibition is part of the complete input, not a missing-smoke defect.
5. **Earn the source red through that witness.** Include schema-valid optional-target fixtures in
   the REAL matrix: spotlight admitted only by a wildcard plus exactly one additional literal
   in each phase; and a net-new fixture with an optional literal source. Assert production and
   final adapter lists contain spotlight plus optional literal, require only spotlight and exclude
   a wildcard-only sibling. Then assert the final phase instructions preserve the optional
   permission at the phase-action level, not merely by path occurrence: delimit the `Phase
   IMPLEMENT` imperative that grants write authority from shared conventions, read-only path
   descriptions and the adapter's appended target list. An optional literal occurring in
   `sourcesNamed` or an allowed-target list does not make it writable if that later imperative says
   `write ONLY <spotlight>`. The positive control accepts an IMPLEMENT action that grants the
   optional literal write authority; negative controls reject both that contradictory spotlight-only
   action and an explicit prohibition on writing the optional literal. At current source, the
   one-literal branch omits the optional target and net-new IMPLEMENT instructs spotlight-only
   writing. Those assertion failures are the regression; fixed broad wildcard prose, missing
   imports/files, invalid fixtures and broken controls are not reds.

Route the offline neutral-role and CURRENT LIVE-role paths through that same inventory and
capture/assertion helper, replacing stale fixture assumptions and blanket exclusions. The offline
path renders neutral roles from its injected store. The opt-in current-live path calls
`renderLeafPhasePrompts()` with NO injected store and runs the **same 24 REAL + 4 smoke cells and
assertions**. Missing or contradictory live roles fail that check. Ordinary tests remain offline.
This exact shared offline/live path is part of the next witness, not a later two-string spot check.

**Whole-capability acceptance remains pending.** The walkthrough and every one of the eleven full
contract assertions below are the completion bar for this same revision. Explicit Claude's
wildcard scope and legacy three-argument helper must still match `PathWriteScope`. Its REAL/smoke
feedback must still actually spawn the exact CONFIRM oracle through `realProofCommand`,
`feedbackCommandsFor` and bounded `executeFeedback`, with typecheck armed/advertised only for
its registered installed-node command. Complete the existing registry, walls, identity and
declared-ID bodies: full Library registrations plus unknown refusal; named phase walls and the
install/typecheck invariant; signer and node/run fields; both phases of assembly and all REAL
arms, IDs independent of guidance, empty-contract parity and smoke absence. Complete these
existing acceptance debts normally in this AUTHOR_TEST: they remain distinct from the
source-coupled optional-literal regression, but are not deferrable from this witness and none is
frozen as complete.

IMPLEMENT remains confined to the existing resolver. Preserve default Codex/model selection,
native shell/`apply_patch` authoring, blind feedback, explicit Claude and legacy compatibility,
proof commands, scopes, finite manifests and spine authority. Re-derive any later source regression
from then-current behavior under fresh choreography; this brief promises no future regression red
and does not preserve a defect to obtain one. A signed partial revision or eleven matching test
names cannot close the runtime repair while any full acceptance assertion remains unverified.

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

**Existing helper-call compatibility.** The existing standalone three-argument
`realPrompts(spec, real, proofDisplay)` call retains its legacy Claude-tool prose, as exercised by
the unchanged resolver suite. The runtime-aware call accepts the selected runtime explicitly;
production REAL and live-smoke resolution always supplies that selection, including Codex when
the build caller omits `runtime`. The final-input regression exercises those production resolution
boundaries for omitted and explicit runtime choices, so legacy helper compatibility cannot stand
in for truthful default-Codex instructions. This is a prompt-helper compatibility rule, not a
change to which provider or model any build selects.

**Authored source and proof ownership.** IMPLEMENT may edit only
`packages/orchestrator/src/resolve-prove-spec.ts`. AUTHOR_TEST edits only the existing
`packages/cli/src/codex-leaf-prompt.test.ts`, the single declared test spotlight and required
test output. The existing `packages/orchestrator/src/resolve-prove-spec.test.ts` is read-only
and remains in the explicit proof command as a regression floor. This single-file authoring
scope and required output remain unchanged. The CLI file already exists; its revised behavioral
assertions must be present before the spine observes red. An absent CLI test, syntax error or
broken test import is not the required runtime regression.
The CLI integration home already consumes Library, drive, orchestrator and agent dependencies,
so it can use the production role renderer, resolver and existing injected Codex runner without
adding a dependency cycle or changing the agent adapter. The live check uses the same integration
assertions in an explicit opt-in mode; ordinary tests remain offline and need no database or model.
The offline test supplies neutral role artifacts in its own injected Library store; the shared
historical corpus fixture's Claude-specific role wording is not a current runtime specification
and must not force an adapter sanitizer or a shared-fixture source edit.
Live red/green role wording is supplied by the guidance curator. This leaf authors no Library
artifact, manifest or dependency change.

Every preserved contract ID below must name a substantive test of its own assertion in the CLI
spotlight: the existing coverage reader reads that file, not every file run by the proof command.
Use the existing meaningful resolver cases as the behavioral baseline for unchanged contracts,
and exercise each corresponding assertion through its production boundary in the CLI suite.
Do not claim an unchanged contract merely because the old suite also ran: an ID on a placeholder,
a shared happy case or an unrelated assertion does not prove it. Contract 11's declared-ID briefing
remains intact. This test work does not change the coverage reader or promotion manifest.

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

### Required contract observations

These are the existing assertions from this file's Contracts section, reproduced here because this
Guidance section is the normal leaf brief. Each named contract requires its full assertion; a
matching title alone is insufficient.

The shell-feedback prohibition in contracts 9 and 10 also rejects optional suggestions to run
proof, test, typecheck or build commands as substitute feedback. Final-stdin assertions must reject
that grant even when the same text correctly reserves observations or signing to the spine.
A prohibition or runtime comparison may name an unavailable tool; test the instruction's meaning
rather than requiring the tool name's erasure.

- **`spec-files-locate-and-load`** — `findNodeSpecFile` resolves both layouts; real library specs load; no frontmatter is LOUD.
- **`proof-mode-vocabulary-maps`** — integration-test→capability, UAT→story, contract-test→contract, operator-attested shared.
- **`registry-is-explicit`** — the library story + capabilities are covered; unknown ids return null.
- **`real-walls-really-wall`** — the verdict-line and notice-board entries' walls hold; every install-bearing entry registers a typecheck (the registry-wide invariant).
- **`unregistered-is-not-buildable`** — both refusals carry guidance, never a guess.
- **`prove-spec-fields-come-off-the-real-spec`** — the resolved ProveSpec mirrors the node's identity.
- **`dry-run-glue-end-to-end`** — the whole chain over an InMemoryStore.
- **`real-mode-walk-earns-its-tree`** — the verdict's commitSha is the spine's commit; `git status` is genuinely clean.
- **`prompts-brief-the-real-constraints`** — BOTH phases in all three REAL arms preserve outcome, guidance, contract IDs, the exact declared test/source scope, dependency restrictions, required outputs and stop-if-test-wrong behavior. For multiple literal test targets, AUTHOR_TEST names the complete permitted set instead of claiming only the spotlight is writable; IMPLEMENT may read those tests but writes only its source targets. Additional allowed paths remain optional unless already required by the existing manifest, and wildcard scope never becomes Codex promotion authority. A machine capturing actual final Codex stdin after rendered-role and adapter composition sees available native shell/`apply_patch` authoring and exact observed promotion, no promised `PreToolUse`/OS containment, no instruction to use unavailable proof/typecheck tools, and an explicit prohibition on substituting shell proof/typecheck feedback. The spine alone observes and signs. The same runtime truthfulness holds for live-smoke while its synthetic pair and deliberate absence of real contract IDs remain unchanged. Explicit Claude retains its actual tool and enforcement instructions. The standalone three-argument `realPrompts` helper retains its legacy Claude prose, while production REAL/live-smoke resolution explicitly supplies the selected runtime; omitted build runtime therefore remains Codex. The existing Codex model default and all proof/scoping/promotion inputs are unchanged.
- **`feedback-tools-spawn-the-same-oracle`** — explicit Claude's `run_proof` spawns the exact CONFIRM oracle in REAL and live-smoke, and `run_typecheck` is armed and advertised only with its registered installed-node command. Codex's actual `feedbackToolNames` remains empty, its launch keeps MCP disabled, and BOTH phases of every REAL arm and live-smoke tell it to stop for the spine's independent observations without demanding unavailable feedback or authorizing a shell substitute. Installed Codex nodes still receive the spine-owned typecheck requirement. Native authoring tool availability, default runtime/model, registered commands and spine observation/signing authority are unchanged.
- **`briefs-name-the-declared-contract-ids`** — `assemblePrompts` and all three `realPrompts` arms enumerate every declared id in BOTH phases and carry the ADR-0122 naming rule in AUTHOR_TEST; the ids arrive even when the spec's own `## Guidance` names none; a unit declaring no contracts gets no block (brief parity); the live-smoke brief carries none by design.

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
`packages/cli/src/codex-leaf-prompt.test.ts`, alongside that file's substantive resolver regressions.
The existing resolver suite stays unchanged and runs in the same declared proof command. Its scripted
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
   - **asserts —** BOTH phases in all three REAL arms preserve outcome, guidance, contract IDs, the exact declared test/source scope, dependency restrictions, required outputs and stop-if-test-wrong behavior. For multiple literal test targets, AUTHOR_TEST names the complete permitted set instead of claiming only the spotlight is writable; IMPLEMENT may read those tests but writes only its source targets. Additional allowed paths remain optional unless already required by the existing manifest, and wildcard scope never becomes Codex promotion authority. A machine capturing actual final Codex stdin after rendered-role and adapter composition sees available native shell/`apply_patch` authoring and exact observed promotion, no promised `PreToolUse`/OS containment, no instruction to use unavailable proof/typecheck tools, and an explicit prohibition on substituting shell proof/typecheck feedback. The spine alone observes and signs. The same runtime truthfulness holds for live-smoke while its synthetic pair and deliberate absence of real contract IDs remain unchanged. Explicit Claude retains its actual tool and enforcement instructions. The standalone three-argument `realPrompts` helper retains its legacy Claude prose, while production REAL/live-smoke resolution explicitly supplies the selected runtime; omitted build runtime therefore remains Codex. The existing Codex model default and all proof/scoping/promotion inputs are unchanged.
   - **covers —** `packages/orchestrator/src/resolve-prove-spec.ts` — `assemblePrompts`, `realPrompts`, `liveSmokePrompts` and selected-runtime brief wiring in `resolveProveSpec` / `resolveReal`; the final composition assertion consumes the existing drive role renderer and Codex adapter without granting them implementation scope.
   - **proven by —** `packages/cli/src/codex-leaf-prompt.test.ts` — substantive runtime/phase/mode, finite test-target and manifest assertions, including actual final stdin with an offline rendered Library fixture and the same assertions against explicitly loaded current live roles. The unchanged `packages/orchestrator/src/resolve-prove-spec.test.ts` remains a regression floor. Amended behavior is UNPROVEN until the ordinary real spine observes its regression red→green; the opt-in live-role observation records no signature.
10. **`feedback-tools-spawn-the-same-oracle`** — advertised feedback matches the selected runtime's armed tools without adding Codex proof authority
    - **asserts —** explicit Claude's `run_proof` spawns the exact CONFIRM oracle in REAL and live-smoke, and `run_typecheck` is armed and advertised only with its registered installed-node command. Codex's actual `feedbackToolNames` remains empty, its launch keeps MCP disabled, and BOTH phases of every REAL arm and live-smoke tell it to stop for the spine's independent observations without demanding unavailable feedback or authorizing a shell substitute. Installed Codex nodes still receive the spine-owned typecheck requirement. Native authoring tool availability, default runtime/model, registered commands and spine observation/signing authority are unchanged.
    - **covers —** `packages/orchestrator/src/resolve-prove-spec.ts` — `feedbackCommandsFor`, the selected-runtime arming and brief wiring in `resolveProveSpec` / `resolveReal`, and REAL/live-smoke feedback wording.
    - **proven by —** `packages/cli/src/codex-leaf-prompt.test.ts` — real spawn assertions for Claude's bounded oracle, the runtime arming/brief matrix and final-stdin versus actual Codex launch/feedback assertions for offline and explicitly loaded live roles. The unchanged `packages/orchestrator/src/resolve-prove-spec.test.ts` remains a regression floor. Amended behavior is UNPROVEN until the ordinary real spine observes its regression red→green.
11. **`briefs-name-the-declared-contract-ids`** — the phase briefs carry the unit's declared contract ids, independent of what `## Guidance` restates
    - **asserts —** `assemblePrompts` and all three `realPrompts` arms enumerate every declared id in BOTH phases and carry the ADR-0122 naming rule in AUTHOR_TEST; the ids arrive even when the spec's own `## Guidance` names none; a unit declaring no contracts gets no block (brief parity); the live-smoke brief carries none by design.
    - **covers —** `resolve-prove-spec.ts` — the `contractsBrief` helper and its splice sites in `assemblePrompts` and the three `realPrompts` arms
    - **proven by —** `resolve-prove-spec.test.ts` — the five tests whose titles begin `briefs-name-the-declared-contract-ids —`, covering `assemblePrompts enumerates the declared ids in BOTH phases`; `the ids arrive though` the spec's own `## Guidance` restates none; `ALL THREE realPrompts arms carry them`; `a unit declaring NONE gets no block`; and `the live-SMOKE brief deliberately carries NONE` (REAL, passing)
