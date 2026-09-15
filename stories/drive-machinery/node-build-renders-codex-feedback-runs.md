---
id: "node-build-renders-codex-feedback-runs"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: inner-loop-exit-arc
title: "Report an armed Codex leaf's feedback runs in the build envelope"
outcome: "A build envelope for a Codex leaf reports the feedback runs the spine executed for it, or that it was armed and called none, and keeps today's none line only for a Codex leaf given no feedback tools."
status: proposed
proof_mode: contract-test
depends_on: [codex-builds-arm-feedback]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/node-build-codex-feedback.test.ts"]
    sourceGlobs: ["packages/drive/src/node-build.ts"]
  real:
    testFile: "packages/drive/src/node-build-codex-feedback.test.ts"
    sourceFile: "packages/drive/src/node-build.ts"
    scope:
      testGlobs: ["packages/drive/src/node-build-codex-feedback.test.ts"]
      sourceGlobs: ["packages/drive/src/node-build.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: bun
      args:
        - "test"
        - "--preload"
        - "./scripts/tsx-cache-off.mjs"
        - "--timeout"
        - "300000"
        - "./packages/drive/src/node-build-codex-feedback.test.ts"
        - "./packages/drive/src/pi-runtime-wiring.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# Report an armed Codex leaf's feedback runs in the build envelope

**Outcome —** A build envelope for a Codex leaf reports the feedback runs the spine executed for it,
or that it was armed and called none, and keeps today's none line only for a Codex leaf given no
feedback tools.

## Proof walkthrough

The test builds authors directly and reads `liveLeafLines(author)` from
`packages/drive/src/node-build.ts`. Nothing authors, builds or reaches a store.

Each Codex author is `new CodexPhaseAuthor({ cwd: os.tmpdir(), writeGlobs: { AUTHOR_TEST:
["unit.test.ts"], IMPLEMENT: ["unit.ts"] }, isWriteAllowed: () => true, runner })`, where `runner`
throws if it is ever called. An ARMED author is also given `feedbackCommands`, each
`{ name, description, run }` with a `run` that resolves `{ code: 0, stdout: "", stderr: "" }`.
Construction does no I/O. Its `runs` and `violations` stay empty, and each case pushes its feedback
runs onto `author.feedbackRuns` directly.

1. **Armed, with runs.** An author armed with `run_proof` and `run_typecheck`, whose `feedbackRuns`
   holds, in order, `{ phase: "AUTHOR_TEST", tool: "run_proof", code: 1 }`,
   `{ phase: "IMPLEMENT", tool: "run_proof", code: 0 }` and
   `{ phase: "IMPLEMENT", tool: "run_typecheck", code: null }`, renders exactly these four lines:
   ```
   leaf:        Codex CLI / ChatGPT subscription (no slices ran)
   cost:        not metered — ChatGPT subscription quota (no API/list-price USD asserted)
   scope walls: no write refusals
   feedback:    3 bounded run(s) — AUTHOR_TEST:run_proof=exit 1, IMPLEMENT:run_proof=green, IMPLEMENT:run_typecheck=exit none (feedback only; the spine's own observations decided)
   ```
2. **Armed, no runs.** The same author with no feedback runs renders the same first three lines, then
   exactly:
   ```
   feedback:    0 bounded runs — armed with run_proof, run_typecheck; the leaf called none (the spine's own observations decided)
   ```
   An author armed with `run_proof` alone ends on
   `feedback:    0 bounded runs — armed with run_proof; the leaf called none (the spine's own observations decided)`.
3. **Unarmed.** An author given no feedback commands renders the same first three lines, then exactly
   today's `feedback:    none — the spine reruns every registered proof command out of band`.
4. **Claude is untouched.** A Claude author from `cannedLiveAuthor([])` (in
   `packages/drive/src/real-chain-fixture.ts`) with no feedback runs renders no line beginning
   `feedback:`. The same author, after `{ phase: "IMPLEMENT", tool: "run_proof", code: 0 }` is pushed
   onto its `feedbackRuns`, renders
   `feedback:    1 bounded run(s) — IMPLEMENT:run_proof=green (feedback only; the spine's own observations decided)`
   as its last line.
5. **pi is untouched.** The declared proof also runs `packages/drive/src/pi-runtime-wiring.test.ts`
   unmodified, which pins pi's own `none` line exactly.

The observable is the returned array, compared with `assert.deepEqual` against LITERAL strings.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (1)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

**Why this exists (ADR-0570 D5).** The build envelope's Codex branch always prints
`feedback:    none — the spine reruns every registered proof command out of band`. That stops being true
for every Codex build the moment contract [`codex-builds-arm-feedback`](codex-builds-arm-feedback.md)
arms the leaf, so the two ship in the same landing. The envelope is also where ADR-0570 D6's
measurement is read: iteration is the spine's OWN record of feedback runs per phase, never Codex's
report of what it did. A Codex phase is one `codex exec` turn by construction, so `turns` cannot show
iteration.

**The rule, in `liveLeafLines`'s Codex branch.**
- When `feedbackRuns` is non-empty, the feedback line is exactly the Claude branch's feedback line.
  Render both through one helper local to `node-build.ts`, so the two cannot drift, and keep the Claude
  output byte-identical.
- Otherwise, when `feedbackToolNames` is non-empty, the line is
  `feedback:    0 bounded runs — armed with <names>; the leaf called none (the spine's own observations decided)`.
  `<names>` is `feedbackToolNames` in order, each with its `mcp__spine__` prefix removed, joined by
  `, `. `SdkFeedbackRun.tool` records the bare name (`run_proof`), so both lines spell tools the same
  way.
- Otherwise the line is today's `none` line, unchanged.
- Arming is read from `feedbackToolNames`, the author's own record of the tools it was given. Never
  infer it from the runtime.
- Every other Codex line, the Claude branch's other lines and the whole pi branch are unchanged.

**The red must be an assertion.** This contract edits a file that already exists. Today the Codex branch
always prints the `none` line, so steps 1 and 2 fail on the returned lines. Import only names that exist
today: `CodexPhaseAuthor` from `@storytree/agent`, `liveLeafLines` from `./node-build.js`, and
`cannedLiveAuthor` from `./real-chain-fixture.js`.

**Tests.** The package runs its tests under Bun; use `node:test` and `node:assert/strict`, as
`pi-runtime-wiring.test.ts` does. Every test title starts with the contract-line id and a colon —
`test("codex-envelope-reports-feedback-runs: …")` — because that prefix is how coverage binds a test to
this contract. `packages/drive` is inside the mutation rung, so every expected line is written as its
LITERAL string, never computed in the test from the rule, and each step above is its own case.

The new test file's ownership home is `repo-manifest/source-ownership/build-drive-cli.json`, already
added outside this contract's write scope; do not edit any manifest.

**Out of scope.** `packages/agent`, `packages/orchestrator`, the story envelope's callers of
`liveLeafLines`, and everything in `node-build.ts` outside `liveLeafLines` and the one helper it gains.

## Contracts (1)

1. **`codex-envelope-reports-feedback-runs`** — the build envelope reports a Codex leaf's feedback runs from the spine's own record.
   - **asserts —** `liveLeafLines` renders a Codex author that recorded feedback runs with exactly the Claude branch's feedback line, each run as `<phase>:<tool>=green` or `=exit <code>` with a null code as `none`. It renders an armed Codex author with no runs as `0 bounded runs — armed with` its tool names without the `mcp__spine__` prefix, and a Codex author given no feedback commands with today's `none` line. The Claude branch's feedback line is byte-identical to today's, a Claude author with no runs still renders no feedback line, and pi's `none` line is unchanged.
   - **covers —** `packages/drive/src/node-build.ts` (`liveLeafLines`).
   - **proven by —** a new `packages/drive/src/node-build-codex-feedback.test.ts`, together with the unmodified `packages/drive/src/pi-runtime-wiring.test.ts`, through the declared Bun proof command, with the `@storytree/drive` typecheck as the pre-promotion wall.
