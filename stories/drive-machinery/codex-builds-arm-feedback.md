---
id: "codex-builds-arm-feedback"
tier: contract
story: drive-machinery
capability: prove-spec-resolution
arc: inner-loop-exit-arc
title: "Arm the Codex leaf with run_proof and run_typecheck in every build, and brief it to iterate"
outcome: "A REAL build and the live smoke hand the Codex leaf the spine's registered feedback commands, retargeted into its replica, and brief it to run and iterate against them as the Claude leaf is briefed, while still telling it that a shell run is no substitute for them."
status: proposed
proof_mode: contract-test
depends_on: [codex-feedback-commands-run-in-the-replica]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "--filter", "@storytree/cli", "test"]
  scope:
    testGlobs:
      - "packages/cli/src/codex-leaf-prompt.test.ts"
      - "packages/orchestrator/src/resolve-prove-spec.test.ts"
    sourceGlobs: ["packages/orchestrator/src/resolve-prove-spec.ts"]
  real:
    testFile: "packages/cli/src/codex-leaf-prompt.test.ts"
    sourceFile: "packages/orchestrator/src/resolve-prove-spec.ts"
    scope:
      testGlobs:
        - "packages/cli/src/codex-leaf-prompt.test.ts"
        - "packages/orchestrator/src/resolve-prove-spec.test.ts"
      sourceGlobs: ["packages/orchestrator/src/resolve-prove-spec.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/cli", "exec", "node", "--import", "../../scripts/tsx-cache-off.mjs", "--import", "tsx", "--test", "../../packages/orchestrator/src/resolve-prove-spec.test.ts", "../../packages/orchestrator/src/resolve-prove-spec.codex-feedback.test.ts", "../../packages/orchestrator/src/resolve-prove-spec.revision.test.ts", "src/codex-leaf-prompt.test.ts"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "--filter", "@storytree/cli", "typecheck"]
---

# Arm the Codex leaf with run_proof and run_typecheck in every build, and brief it to iterate

**Outcome —** A REAL build and the live smoke hand the Codex leaf the spine's registered feedback
commands, retargeted into its replica, and brief it to run and iterate against them as the Claude leaf
is briefed, while still telling it that a shell run is no substitute for them.

## Proof walkthrough

Every case resolves through production `resolveProveSpec`, in REAL mode and in the live smoke, for the
omitted runtime (which selects Codex) and for explicit `runtime: "codex"`, with explicit
`runtime: "claude"` as the unchanged control. Nothing authors: a resolved author is inspected, never
invoked. The only launches captured are the existing `captureCodexFinalLaunches` helper's own.

1. **Every Codex build is armed.** The resolved `CodexPhaseAuthor`'s `feedbackToolNames` is:
   - `["mcp__spine__run_proof", "mcp__spine__run_typecheck"]` for each existing fixture that installs
     dependencies and registers a typecheck (`INSTALL_REAL`, `EDITS_EXISTING_REAL`,
     `REFACTOR_FOR_TESTS_REAL`), and for the REAL `stories/notice-board/tree-view.md` spec;
   - `["mcp__spine__run_proof"]` for `NET_NEW_REAL`, which installs nothing, and for the
     wildcard-only zero-literal witness's fixture;
   - `["mcp__spine__run_proof"]` for the live smoke, for both runtime choices, including the runtime
     selection test in `packages/orchestrator/src/resolve-prove-spec.test.ts`.
2. **The REAL briefs tell Codex to iterate.** For each of the four fixtures and both runtime choices,
   BOTH briefs:
   - contain `run_proof`, `native shell/apply_patch access`,
     `not a substitute for the spine's registered observations` and
     `spine alone observes the official red/green`;
   - never match `/cannot run shell commands/i`, `/no automated feedback tool/i` or `/no MCP tools/i`;
   - contain `run_typecheck` exactly when the fixture installs dependencies and registers a typecheck.
     For `NET_NEW_REAL`, neither brief mentions `run_typecheck`.
3. **Outside the tooling sentence, Codex is briefed as Claude is.** For each of the four fixtures, the
   text from `Phase AUTHOR_TEST` to the end of the AUTHOR_TEST brief is identical between the Codex and
   Claude resolutions, and so is the text from `Phase IMPLEMENT` to the end of the IMPLEMENT brief. For
   each installed fixture, both runtimes' briefs contain
   ``Use the `run_typecheck` feedback tool before stopping.``
4. **The live smoke tells Codex to iterate.** For both runtime choices, both live-smoke briefs contain
   `run_proof`, `native shell/apply_patch access`,
   `not a substitute for the spine's registered observations` and
   `spine alone observes the official red/green`. They still match
   `/do not run (?:a )?shell (?:proof, test, typecheck, or build|command) .*feedback/i`, and never match
   `/cannot run shell commands/i` or `/no automated feedback tool/i`. From `Phase AUTHOR_TEST` to the
   end, the Codex and Claude live-smoke AUTHOR_TEST briefs are identical, and so are their IMPLEMENT
   briefs from `Phase IMPLEMENT`.
5. **Composition survives.** Each existing final-stdin capture — the live-smoke boundary helper, the
   wildcard-only witness, the final-stdin test, the offline rendered role, and the opt-in current-live
   roles — now reads `run_proof` in each phase's final stdin. It still reads the rendered role,
   `Phase brief`, the adapter's `spine will run all registered proof commands after you stop` and
   `disposable replica`, and never `cannot run shell commands`. A final stdin mentions `run_typecheck`
   exactly when its node registers a typecheck: `INSTALL_REAL` does, the wildcard-only witness does not.
6. **Explicit Claude is unchanged.** Every existing explicit-Claude test passes unmodified.

The observables are each resolved author's `feedbackToolNames` and the text of each brief and
captured final stdin.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and both full assertions under `## Contracts (2)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

**Why this exists (ADR-0570 D1).** `inner-loop-exit-arc` end state 5, aligned with the owner on
2026-09-12: the Codex leaf iterates to green as the Claude leaf does, with `run_proof` and
`run_typecheck` armed against the same command object the spine observes. The adapter is built and
dormant (`live-codex-leaf`). Contract
[`codex-feedback-commands-run-in-the-replica`](codex-feedback-commands-run-in-the-replica.md) built the
commands. This contract hands them to every Codex build and stops briefing Codex that it is blind.
ADR-0232 D5 is NOT narrowed: a proof, test, typecheck or build command run through Codex's own shell is
still no substitute for the registered feedback, and no Codex claim moves the phase machine.

**The wiring, in `resolve-prove-spec.ts`.**
- `resolveReal`'s Codex arm sets `codexArgs.feedbackCommands` to
  `codexFeedbackCommandsFor(realProofCmd, proofDisplay, opts.workspace, typecheckCmd)`: the SAME
  `realProofCmd` and `typecheckCmd` objects the spine's CONFIRM observations and the Claude leaf's
  `feedbackCommandsFor` already use.
- The live smoke's Codex arm in `resolveProveSpec` sets `codexArgs.feedbackCommands` to
  `codexFeedbackCommandsFor(syntheticProofCmd, \`node ${DRY_RUN_TEST_REL}\`, opts.workspace)`.
- The Claude and pi arms and `feedbackCommandsFor` are unchanged.

**The Codex REAL brief, in `realPrompts`.**
- `toolingLine` for Codex states four things:
  - it authors with native shell/apply_patch access in a disposable replica of this repo;
  - it can run that same proof command against its replica at any time via the `run_proof` feedback
    tool, in bounded runs whose output is feedback and never the verdict;
  - running a proof, test, typecheck or build command itself through its shell is NOT a substitute for
    the spine's registered observations, and is not feedback;
  - the spine alone observes the official red/green, promotes the exact allowed targets, and signs the
    verdict, out of band after it stops.

  It no longer says no feedback tool or no MCP tool exists. Keep `native shell/apply_patch access`,
  `not a substitute for the spine's registered observations` and
  `spine alone observes the official red/green` verbatim, because the tests match them.
- `typecheckClose`, `redClose` and `greenClose` take Claude's wording for both runtimes, including
  `greenClose`'s `` and `run_typecheck` is green`` suffix for a node that installs dependencies and
  registers a typecheck. Their `codexRuntime` conditionals go.
- `namedSourceGlobs` / `namedTestGlobs` keep filtering wildcards for Codex: that is about its finite
  promotion targets, not about feedback.
- The ADR-0571 D4 revision block is untouched, and a brief with no revision is still the exact prefix
  of a revised one.
- Correct every comment in `realPrompts` and `liveSmokePrompts` that says Codex has no feedback tool.

**The Codex live-smoke brief, in `liveSmokePrompts`.**
- `feedbackLine` for Codex says it authors with native shell/apply_patch access in a disposable replica
  of this temp workspace; that the `run_proof` feedback tool runs that test command against its replica
  (bounded runs; feedback, never the verdict); ``Do not run a shell proof, test, typecheck, or build
  command as feedback: shell access is not a substitute for the spine's registered observations.``; and
  that the spine alone observes the official red/green itself.
- `redCheck` takes Claude's wording for both runtimes.

**The tests that pin today's blind Codex — the COMPLETE set.** Measured by grep on 2026-09-15 and
re-checked after `inner-loop-exit-arc-inc-09` landed. Every flipped test keeps its contract-line id
prefix; rewrite the rest of its title to the armed truth.

In `packages/cli/src/codex-leaf-prompt.test.ts`:
1. **The header comment** above the shared fixtures says Codex "genuinely has NO
   `run_proof`/`run_typecheck` feedback tool". Rewrite it to the armed truth.
2. **The REAL-brief test** (`… default and explicit Codex REAL builds never claim run_proof …`) asserts
   `doesNotMatch(/run_proof/)`. It becomes walkthrough steps 1, 2 and 3 for the four fixtures.
3. **The live-smoke test** (`… default Codex LIVE-SMOKE brief never claims run_proof …`) asserts
   `doesNotMatch(/run_proof/)`, and its `assertShellFeedbackBoundary` asserts the CAPTURE HELPER's
   `mcp_servers={}` and empty `feedbackToolNames`. It becomes walkthrough steps 1, 4 and 5.
4. **The wildcard-only zero-literal witness** asserts the resolved author's `feedbackToolNames` is `[]`,
   the helper's `mcp_servers={}` and empty names, and `doesNotMatch(/run_proof|run_typecheck|cannot run
   shell commands/i)` on the final stdin. The resolved author now carries `["mcp__spine__run_proof"]`;
   the final stdin matches `run_proof` and still matches neither `run_typecheck` (the fixture registers
   no typecheck) nor `cannot run shell commands`. Its `phaseAction` end marker is adapter text and
   stays.
5. **The final-stdin test** (`… the actual final Codex stdin composed by CodexPhaseAuthor never
   instructs run_proof/run_typecheck …`) asserts both are absent for `INSTALL_REAL`. Both are now
   present.
6. **The offline rendered role test** asserts `doesNotMatch(/run_proof/)`. It now matches.
7. **The opt-in helper `currentLiveRolesComposeTruthfullyForCodex`** asserts
   `doesNotMatch(/run_proof/)`. It now matches.
8. **`feedback-tools-spawn-the-same-oracle: Codex's actual feedbackToolNames stays empty and MCP stays
   disabled in both REAL and live-smoke`** becomes walkthrough step 1 for `tree-view` in REAL and in the
   live smoke, with both briefs matching `run_proof`, and `run_typecheck` in the REAL briefs. Its
   `buildCodexExecArgs` `mcp_servers={}` assertion describes an author with no feedback commands, which
   is the agent package's own contract (`codex-exec-args-arm-feedback`), not a build: remove it here.

In `packages/orchestrator/src/resolve-prove-spec.test.ts`:
9. **`live runtime selection defaults to Codex and preserves Claude explicitly`** asserts the default
   runtime's `feedbackToolNames` is `[]`. It is now `["mcp__spine__run_proof"]`.

Nothing else in either file changes.

⚠ **`captureCodexFinalLaunches` stays UNARMED.** It builds its own `CodexPhaseAuthor` from
`CODEX_TEST_CWD`, a fixture directory that does not exist, and passes no feedback commands. Its
`mcp_servers={}` and empty `feedbackToolNames` describe that fixture, not a build, so assertions about
them are replaced by assertions on the RESOLVED author (step 1). Do not arm the helper: an armed author
would open a loopback endpoint and link dependencies into a replica of a directory that does not
exist. The helper's `CodexFinalLaunch.feedbackToolNames` field may stay, unasserted, or go.

**The red is an assertion red.** Every flipped assertion fails at HEAD on content: HEAD resolves Codex
with `feedbackToolNames` `[]` and briefs it that no feedback tool exists. The test imports nothing new.

**Declared, not observed.** The commands inside a resolved `CodexPhaseAuthor` are private, so their
retargeting and their tool timeout are not observable from resolution. Contract
`codex-feedback-commands-run-in-the-replica` proves the commands, and this wiring is confirmed by
reading `resolveReal` and the live smoke's Codex arm. No mutation rung reaches `packages/orchestrator`
(ADR-0563 D3). `packages/cli` is inside the rung, but this contract edits no `packages/cli` source.

**Out of scope.** `packages/agent`, `packages/drive` (the envelope line is contract
[`node-build-renders-codex-feedback-runs`](node-build-renders-codex-feedback-runs.md), which ships in
the same landing), the dry-run, `assemblePrompts`, the model default, the promotion manifests and every
other `resolveReal` input.

## Contracts (2)

1. **`prompts-brief-the-real-constraints`** — the final leaf instructions truthfully brief the selected runtime while preserving the unit and phase obligations
   - **asserts —** BOTH phases in all three REAL arms preserve outcome, guidance, contract IDs, the exact declared test/source scope, dependency restrictions, required outputs and stop-if-test-wrong behavior, and wildcard scope never becomes Codex promotion authority. A machine capturing actual final Codex stdin after rendered-role and adapter composition sees native shell/`apply_patch` authoring in a disposable replica, exact observed promotion, an instruction to run and iterate against `run_proof` — and `run_typecheck` exactly when the node registers one — and an explicit statement that a shell proof, test, typecheck or build run is not a substitute for the spine's registered observations. It never sees a claim that no feedback tool exists or that shell authoring is unavailable. Outside the tooling sentence, the Codex and Claude phase actions are identical for a literal scope. The spine alone observes and signs. The same truthfulness holds for the live smoke, while its synthetic pair and deliberate absence of real contract IDs are unchanged. Explicit Claude keeps its tool and enforcement instructions, and omitted build runtime remains Codex.
   - **covers —** `packages/orchestrator/src/resolve-prove-spec.ts` — `realPrompts` and `liveSmokePrompts`.
   - **proven by —** `packages/cli/src/codex-leaf-prompt.test.ts`, with `packages/orchestrator/src/resolve-prove-spec.test.ts`, `resolve-prove-spec.codex-feedback.test.ts` and `resolve-prove-spec.revision.test.ts` as the regression floor, through the declared REAL proof command.
2. **`feedback-tools-spawn-the-same-oracle`** — advertised feedback matches the selected runtime's armed tools, for Claude and for Codex
   - **asserts —** explicit Claude's `run_proof` spawns the exact CONFIRM oracle in REAL and the live smoke, and `run_typecheck` is armed and advertised only with its registered installed-node command. A Codex build is armed from the same registered command objects through `codexFeedbackCommandsFor`: its `feedbackToolNames` is `mcp__spine__run_proof`, plus `mcp__spine__run_typecheck` exactly when an installed node registers a typecheck, in REAL and in the live smoke. BOTH phases of every REAL arm and of the live smoke tell it to run and iterate against those tools, and none authorizes a shell substitute. Native authoring tools, the default runtime and model, the registered commands, and the spine's sole observation and signing authority are unchanged.
   - **covers —** `packages/orchestrator/src/resolve-prove-spec.ts` — the Codex arms of `resolveReal` and `resolveProveSpec`, and the REAL and live-smoke feedback wording.
   - **proven by —** `packages/cli/src/codex-leaf-prompt.test.ts` and `packages/orchestrator/src/resolve-prove-spec.test.ts`, through the declared REAL proof command.
