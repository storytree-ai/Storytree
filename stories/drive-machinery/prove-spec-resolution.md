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
bodies are identified in the completion table. The declared edit-existing proof must earn a fresh
ordinary spine-observed regression red→green on current source behavior and complete every row.
Capturing the final stdin with an injected process runner is an automated observation of prompt
composition, never a real author run or a signed verdict.

## Guidance

### Complete the existing candidate

The existing CLI test must complete EVERY row below in the same AUTHOR_TEST phase. Keep its
current test titles and eleven contract IDs; extend their bodies and shared helpers rather than
rebuilding the file or stopping after one named regression. Existing finite-manifest extraction
and the correctly scoped wildcard checks are the regression baseline, not the next source red.
Preserve their substance while replacing blanket wildcard-presence exclusions with assertions
about permission. No incomplete assertion is frozen as built.

The current source has three related target-authority discrepancies: it hides an optional literal
when the spotlight is matched only by a wildcard and filtering leaves one literal; net-new
IMPLEMENT still says to write only the spotlight even when the manifest permits another literal;
and unconditional filtering narrows explicit Claude's actual glob scope and the legacy helper
call. The first rows below assert those remaining behaviors. Do not reuse the already-fixed broad
Codex wildcard invitation as the expected red, or manufacture red from tool-name erasure, a broken
fixture, missing import or absent file.

All fixture configurations must pass the existing proof-config schema; an edit-existing fixture
with a broad source scope declares an explicit suite proof command. Use the production
`codexPromotionManifest` by its existing relative import. Runtime scope and promotion semantics
are observed inputs to the test, never changed to accommodate the prompt.

The table identifies existing tests by unique title text; retain each full existing title and ID.
The helper rows support those existing bodies and do not create new proof authority.

| Existing body or helper | Required completion in this AUTHOR_TEST |
| --- | --- |
| `for a multi-file REAL fixture, AUTHOR_TEST names the COMPLETE permitted test set` | Retain production manifest and final allowed/required list assertions. Add a valid fixture whose spotlight is matched only by a wildcard plus one additional literal in each phase. Assert that the manifest contains spotlight plus optional literal, only spotlight is required, and the actual final phase instructions preserve both permissions. Add the net-new optional-source case: IMPLEMENT must permit the optional literal rather than instructing spotlight-only writing. These are current-source assertion failures; the wildcard-only sibling still receives no Codex write permission. |
| `explicit Claude REAL/live-smoke briefs are UNCHANGED` and `standalone 3-arg realPrompts helper` | Exercise explicit Claude in REAL and smoke, and the legacy helper call. For a valid wildcard scope, compare the brief's granted scope to `PathWriteScope`: Claude retains its actual glob-based permission; Codex's finite promotion rule must not silently narrow it. Preserve bounded feedback, no arbitrary shell tool and legacy call compatibility. |
| `baseSpec`, `specWithReal`, `resolveRealFor`, `captureCodexFinalStdin` and `extractCodexTargetLists` | Build schema-valid fixtures with distinctive outcome, guidance and contract IDs. Keep the fixed list parser and production manifests. Return the actual captured `CodexCommand.stdin` AND launch arguments from the injected runner after `CodexPhaseAuthor.author` composes them. Observe the selected default model and disabled MCP from that launch; a separate hardcoded `buildCodexExecArgs` call is not evidence of the captured launch. This remains automated input observation, not a successful real author or signed proof. |
| `default and explicit Codex REAL builds` and `the actual final Codex stdin composed by CodexPhaseAuthor` | Drive one shared final-input assertion over all three REAL arms × installed/uninstalled × omitted/explicit Codex × AUTHOR_TEST/IMPLEMENT. Each fixture supplies distinctive outcome, guidance and contract IDs. Assert actual native authoring availability, no unavailable feedback instructions or shell substitute, spine-only observations/signing, unchanged selected model/launch, exact allowed/required targets, outcome/guidance/IDs, dependency restrictions and each phase's test/source and stop-if-test-wrong duties. Raw-brief checks alone do not satisfy this row. |
| `default Codex LIVE-SMOKE brief` and `Codex's actual feedbackToolNames stays empty and MCP stays disabled` | Use the same capture/assertion path for both smoke phases and both Codex selections, with smoke's synthetic test/source pair and deliberate absence of real contract IDs. Check actual empty feedback tools and captured MCP/model selection. Judge the complete role-plus-brief instructions; do not invent a source failure from a prohibition already supplied by the rendered role. |
| `an offline rendered role` and `the CURRENT LIVE roles` | Replace the shared historical corpus fixture with neutral role artifacts in the test's own injected Library store. Run the shared complete final-input matrix with those rendered roles. The existing opt-in calls `renderLeafPhasePrompts()` without a store and reuses the SAME matrix and assertions; ordinary tests stay offline. A missing/contradictory live role fails that check. |
| Existing final-input assertion bodies | Exercise controls that accept correctly qualified tool prohibitions/runtime comparisons and nonauthorizing wildcard context, but reject unavailable-tool instructions, obsolete no-shell/containment claims and optional shell proof/test/typecheck/build feedback grants even beside a spine-signing disclaimer. Assertions judge instruction meaning; blanket token exclusions are invalid. |
| `explicit Claude REAL install-node arms run_proof + run_typecheck spawning the exact CONFIRM oracle` | Use the existing `realProofCommand`, `feedbackCommandsFor` and bounded `executeFeedback` seams to invoke feedback and observe the actual spawned command/output against the registered CONFIRM oracle in REAL and smoke. Exercise installed and uninstalled cases so typecheck is armed and advertised only when registered. Tool-name arrays alone do not prove this row; no private author fields or real model calls are needed. |
| `registry-is-explicit`, `real-walls-really-wall`, `prove-spec-fields-come-off-the-real-spec`, `briefs-name-the-declared-contract-ids` | Complete their existing bodies: the full declared Library registration set and unknown refusal; the named entries' actual phase walls plus install/typecheck invariant; signer as well as node/run identity propagation; IDs in both phases of assembly and all three REAL arms, absent-contract parity and smoke absence. Each assertion stays under its own existing contract ID. |
| `spec-files-locate-and-load`, `proof-mode-vocabulary-maps`, `unregistered-is-not-buildable`, `dry-run-glue-end-to-end`, `real-mode-walk-earns-its-tree` | Preserve their substantive existing loader/refusal, vocabulary, resolution and offline machinery assertions. The scripted author in the offline machinery fixture does not replace this real run's author. |

AUTHOR_TEST is complete only when every required row is authored, with a genuine remaining-source
assertion failure and no fixture/syntax failure. IMPLEMENT changes only the existing resolver to
satisfy that complete suite. Preserve default Codex/model selection, native shell/`apply_patch`
authoring, blind feedback, explicit Claude and legacy helper behavior, proof commands, scope
enforcement, finite manifests and spine authority. A mechanically signed pass or eleven matching
test names alone does not discharge the acceptance requirements.

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
