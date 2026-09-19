---
id: "codex-feedback-commands-run-in-the-replica"
tier: contract
story: drive-machinery
capability: prove-spec-resolution
arc: inner-loop-exit-arc
title: "Build the Codex leaf's feedback commands to run against its replica"
outcome: "The spine can hand the Codex leaf run_proof and run_typecheck commands built from the same command objects its own observations run, each retargeted from the worktree to the phase's replica, so a feedback run sees the leaf's edits instead of the unedited worktree."
status: proposed
proof_mode: contract-test
depends_on: [real-brief-carries-test-revision]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "test"]
  scope:
    testGlobs: ["packages/orchestrator/src/resolve-prove-spec.codex-feedback.test.ts"]
    sourceGlobs: ["packages/orchestrator/src/resolve-prove-spec.ts"]
  real:
    testFile: "packages/orchestrator/src/resolve-prove-spec.codex-feedback.test.ts"
    sourceFile: "packages/orchestrator/src/resolve-prove-spec.ts"
    scope:
      testGlobs: ["packages/orchestrator/src/resolve-prove-spec.codex-feedback.test.ts"]
      sourceGlobs: ["packages/orchestrator/src/resolve-prove-spec.ts"]
    install: true
    editsExisting: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "typecheck"]
---

# Build the Codex leaf's feedback commands to run against its replica

**Outcome —** The spine can hand the Codex leaf `run_proof` and `run_typecheck` commands built from the
same command objects its own observations run, each retargeted from the worktree to the phase's
replica, so a feedback run sees the leaf's edits instead of the unedited worktree.

## Proof walkthrough

The test calls two new exports of `packages/orchestrator/src/resolve-prove-spec.ts` directly:
`retargetShellCommand` and `codexFeedbackCommandsFor`. Every path lives under one real temp directory
made with `fs.mkdtempSync(path.join(os.tmpdir(), …))`, which holds three sibling directories:

- `ws`, standing for the build worktree;
- `ws-sibling`, a directory whose name EXTENDS `ws`'s, so a string-prefix comparison would wrongly
  treat it as inside the worktree;
- `replica`, standing for the phase's disposable replica.

Build every expected path with `path.join`, never by concatenating strings.

**`retargetShellCommand(cmd, workspace, replicaRoot)`**

1. **Arguments.** Retarget a command from `ws` to `replica` whose `file` is `"node"`, whose `cwd` is
   `ws`, whose `env` is `{ NODE_OPTIONS: "--import file:///guard.mjs", KEEP: "1" }`, whose `timeoutMs`
   is `1_234_567`, and whose `args` are, in order:
   - `path.join(ws, "packages", "widget", "src", "widget.test.ts")`;
   - `"--test-reporter=spec"`;
   - `"relative/child.test.ts"`;
   - `path.join(ws-sibling, "outside.test.ts")`;
   - `path.join(tmp, "elsewhere", "abs.ts")`, an absolute path outside `ws`;
   - `ws` itself;
   - `path.join(ws, "..hidden", "inside.ts")`, a path INSIDE `ws` whose first segment merely begins
     with two dots;
   - `pathToFileURL(path.join(ws, "packages", "widget", "src", "widget.test.ts")).href`.

   The returned command deep-equals one whose `file`, `env`, `timeoutMs` and 2nd, 3rd, 4th, 5th and 8th
   arguments are exactly those given, whose `cwd` is `replica`, and whose 1st, 6th and 7th arguments
   are `path.join(replica, "packages", "widget", "src", "widget.test.ts")`, `replica` and
   `path.join(replica, "..hidden", "inside.ts")`.
2. **A nested `cwd`.** A command whose `cwd` is `path.join(ws, "packages", "cli")` returns `cwd`
   `path.join(replica, "packages", "cli")`.
3. **A `cwd` that does not move.** A command whose `cwd` is `path.join(tmp, "elsewhere")` keeps it
   unchanged. A command with no `cwd` key returns a command with no `cwd` key (`"cwd" in result` is
   `false`).
4. **The input is left alone.** After each call above, the command passed in still deep-equals a
   `structuredClone` of it taken before the call, and the returned command is a different object.

**`codexFeedbackCommandsFor(proofCmd, proofDisplay, workspace, typecheckCmd?)`**

5. **Proof only.** With no typecheck command, the result is exactly one command, named `run_proof`.
   Its `description` contains the `proofDisplay` string verbatim, `FEEDBACK ONLY`, and `replica`. Its
   `timeoutMs` is `600000` when the proof command carries no `timeoutMs`, and `1200000` when the proof
   command carries `timeoutMs: 1_200_000`.
6. **Proof and typecheck.** With a typecheck command, the names are `["run_proof", "run_typecheck"]`,
   in that order. `run_typecheck`'s `description` contains `replica`. Its `timeoutMs` is the typecheck
   command's own when it carries one, and `600000` when it carries none.
7. **The proof run spawns the retargeted command.** Write `ws/probe.cjs`, which prints `WORKSPACE` and
   exits `3`, and `replica/probe.cjs`, which prints one JSON line
   `{ "where": "replica", "cwd": process.cwd(), "arg": process.argv[2] }` and exits `0`. With a proof
   command `{ file: process.execPath, args: [path.join(ws, "probe.cjs"), path.join(ws, "data.txt")],
   cwd: ws }`, `run_proof.run(replica)` resolves with `code` `0`. Its parsed stdout reads
   `where === "replica"`, `arg === path.join(replica, "data.txt")`, and a `cwd` whose
   `fs.realpathSync` equals `fs.realpathSync(replica)`. The proof command passed in still names `ws`
   in its `cwd` and first argument afterwards.
8. **A red is data.** A second replica probe that exits `1` makes that command's `run(replica)` resolve
   with `code` `1`, never throw.
9. **The typecheck run is retargeted the same way.** A typecheck command pointed at a third probe
   script under `ws`, whose replica copy prints its own marker, runs the replica copy when
   `run_typecheck.run(replica)` is called.

The observables are the returned command objects and each run's exit code and output.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (1)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

**Why this exists (ADR-0570 D3).** The Codex leaf writes a disposable replica, and nothing it writes
reaches the build worktree until the spine promotes the phase. A feedback run in the worktree would
therefore observe the UNEDITED files: feedback that lies. The spine's registered commands name the
worktree twice over. Their `cwd` is the worktree, and both proof commands the spine builds also name
the test file by ABSOLUTE worktree path: `realProofCommand`'s default route passes
`path.join(workspace, real.testFile)`, and the live smoke's `syntheticProofCmd` passes
`path.join(opts.workspace, DRY_RUN_TEST_REL)`. Moving `cwd` alone would still run the worktree's test,
which in AUTHOR_TEST does not exist yet. So a feedback run executes the registered command with its
`cwd` and every absolute argument at or inside the worktree moved to the same relative place under the
replica. Everything else is the object the spine observes, unchanged: its `env`, the report path, and
the command's own bound.

**The two exports.** Both are added to `resolve-prove-spec.ts`, beside `feedbackCommandsFor`.

- `export function retargetShellCommand(cmd: ShellCommand, workspace: string, replicaRoot: string): ShellCommand`.
  - A value MOVES when `path.isAbsolute(value)` holds and `path.relative(workspace, value)` is inside:
    it is `""`, or it is not itself absolute, is not `..`, and does not begin with `..` followed by
    `path.sep`. A moved value becomes `path.join(replicaRoot, relative)`.
  - That rule decides `cwd` when the command has one, and each argument independently.
  - `file`, every argument that does not move, `env`, `timeoutMs` and `shell` are kept exactly. A
    `file:` URL is not an absolute path, so it never moves. An absent `cwd` stays absent.
  - It returns a new object and never mutates its input. Never decide "inside" by string prefix: the
    sibling directory in step 1 is the case that catches it.
- `export function codexFeedbackCommandsFor(proofCmd: ShellCommand, proofDisplay: string, workspace: string, typecheckCmd?: ShellCommand)`.
  - Its return type is `NonNullable<CodexPhaseAuthorArgs["feedbackCommands"]>[number][]`.
    `CodexPhaseAuthorArgs` is already imported from `@storytree/agent`; the agent package's index does
    not export `CodexFeedbackCommand` by name, so do not import it.
  - It returns `run_proof`, then `run_typecheck` only when `typecheckCmd` is given.
  - Each command's `timeoutMs` is `cmd.timeoutMs ?? DEFAULT_PROOF_TIMEOUT_MS`. Import
    `DEFAULT_PROOF_TIMEOUT_MS` from `./shell-test-executor.js`, where it is exported; do not restate
    the number in source.
  - Each command's `run(replicaRoot)` is `runShellCommand(retargetShellCommand(cmd, workspace,
    replicaRoot))`, so the run keeps `runShellCommand`'s env scrub, exit-code-as-data and bound.
  - The descriptions follow `feedbackCommandsFor`'s, and say that the run is against the leaf's
    disposable replica. `run_proof`'s also says the spine re-runs the proof itself, out of band, in the
    real worktree after it promotes the phase, and that only that observation decides red and green.
    Facts, not phrasing: the test checks containment of `proofDisplay`, `FEEDBACK ONLY` and `replica`.

**Out of scope.** Nothing calls either export yet: contract
[`codex-builds-arm-feedback`](codex-builds-arm-feedback.md) wires them into both Codex author sites and
rewrites the briefs. `feedbackCommandsFor`, the Claude leaf's commands, every brief, `resolveReal` and
`resolveProveSpec` are unchanged, and no other file is edited. This changes no build's behaviour when
it lands.

**The red must be an assertion.** This contract edits a file that already exists, and its focused
proof is observed per test, so CONFIRM_RED refuses unless every new test's red is an assertion
(ADR-0573 C5) — and a test file that fails to load reports no test at all, which the review refuses
too. Neither export exists at HEAD, so importing either BY NAME fails to load and runs no assertion.
Import the module as a namespace (`import * as resolver from "./resolve-prove-spec.js"`), and open
EVERY test with
`assert.equal(typeof resolver.retargetShellCommand, "function")` and
`assert.equal(typeof resolver.codexFeedbackCommandsFor, "function")` before calling either. Type-only
imports (`import type { ShellCommand } from "./shell-test-executor.js"`) are erased and are fine.

**Tests.** `node:test` and `node:assert/strict`, as the package's other tests are. Every test title
starts with the contract-line id and a colon — `test("codex-feedback-runs-in-the-replica: …")` —
because that prefix is how coverage binds a test to this contract. Spawn probes with
`process.execPath`, never a bare `node`. Compare a child's reported `cwd` through `fs.realpathSync` on
both sides, because a temp directory can be spelled differently from inside the child. Remove the temp
directory in `finally`. The test reads no repo spec and needs no store, worktree or author.

The new test file's ownership home is `repo-manifest/source-ownership/prove-spec-resolution.json`,
already added outside this contract's write scope; do not edit any manifest.

**Declared, not observed.** No mutation rung reaches `packages/orchestrator` (ADR-0563 D3), so what the
walkthrough leaves unasserted stays a declared gap rather than a scored one. Comparison on Windows is
case-insensitive because `path.win32.relative` is; this contract does not test a differently-cased
spelling of the worktree.

## Contracts (1)

1. **`codex-feedback-runs-in-the-replica`** — the Codex leaf's feedback commands run the spine's own command objects against the phase's replica instead of the worktree.
   - **asserts —** `retargetShellCommand` moves a command's `cwd` and every absolute argument at or inside the workspace to the same relative location under the replica root, judged by path and not by string prefix, and keeps `file`, every other argument, `env` and `timeoutMs` unchanged, returning a new object without mutating its input. `codexFeedbackCommandsFor` returns `run_proof`, plus `run_typecheck` only when a typecheck command is given; each carries its command's own `timeoutMs` or `DEFAULT_PROOF_TIMEOUT_MS` and a description naming the replica, and each `run(replicaRoot)` spawns the retargeted command and returns its exit code as data, while the command object the spine observes still names the workspace.
   - **covers —** `packages/orchestrator/src/resolve-prove-spec.ts` (`retargetShellCommand`, `codexFeedbackCommandsFor`).
   - **proven by —** a new `packages/orchestrator/src/resolve-prove-spec.codex-feedback.test.ts`, through the default focused REAL proof, with the `@storytree/orchestrator` typecheck as the pre-promotion wall.
