---
id: "codex-leaf-escalates"
tier: contract
story: agent
capability: live-codex-leaf
arc: inner-loop-exit-arc
title: "Let an armed Codex leaf escalate through the spine endpoint, as the Claude leaf does"
outcome: "An armed Codex leaf can end an authoring slice with a typed escalation — an untestable contract or an unsatisfiable test — and the author returns it to the gate instead of promoting the phase."
status: proposed
proof_mode: contract-test
depends_on: [codex-author-arms-feedback, codex-tool-timeout-follows-the-proof-bound]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/codex-author-escalation.test.ts"]
    sourceGlobs: ["packages/agent/src/codex-author.ts", "packages/agent/src/codex-feedback-endpoint.ts"]
  real:
    testFile: "packages/agent/src/codex-author-escalation.test.ts"
    sourceFile: "packages/agent/src/codex-author.ts"
    scope:
      testGlobs: ["packages/agent/src/codex-author-escalation.test.ts"]
      sourceGlobs: ["packages/agent/src/codex-author.ts", "packages/agent/src/codex-feedback-endpoint.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: bun
      args:
        - "test"
        - "--timeout"
        - "300000"
        - "./packages/agent/src/codex-author.test.ts"
        - "./packages/agent/src/codex-author-feedback.test.ts"
        - "./packages/agent/src/codex-bound-suspend.test.ts"
        - "./packages/agent/src/codex-exec-args-feedback.test.ts"
        - "./packages/agent/src/codex-feedback-endpoint.test.ts"
        - "./packages/agent/src/codex-feedback-endpoint-version.test.ts"
        - "./packages/agent/src/codex-replica-links.test.ts"
        - "./packages/agent/src/codex-tool-timeout.test.ts"
        - "./packages/agent/src/codex-author-escalation.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# Let an armed Codex leaf escalate through the spine endpoint, as the Claude leaf does

**Outcome —** An armed Codex leaf can end an authoring slice with a typed escalation — an untestable
contract or an unsatisfiable test — and the author returns it to the gate instead of promoting the
phase.

## Proof walkthrough

Given a real workspace under `os.tmpdir()` holding the phase's required target, and a `CodexPhaseAuthor`
over it with exact promotion manifests, one `run_proof` feedback command, and an injected runner that
plays Codex over HTTP exactly as `codex-author-feedback.test.ts` does.

1. `tools/list` lists exactly `run_proof` and `escalate`, in any order. `escalate`'s `inputSchema` is
   `{ type: "object", properties: { statement: { type: "string" }, assertion: { type: "string" } }, required: ["statement"], additionalProperties: false }`.
2. In AUTHOR_TEST the runner calls `escalate` with `{ statement: "the contract names no observable" }`,
   then writes the required target in the replica and returns a successful turn. The call answers the
   text `escalation recorded; this slice is ending — stop now.` without `isError`. `author()` resolves
   `{ ok: false, error: "AUTHOR_TEST escalated (untestable-contract): the contract names no observable",
   escalation: { phase: "AUTHOR_TEST", kind: "untestable-contract", statement: "the contract names no observable" } }`.
   The phase's run record is still written, with the turn's token usage. The required target was NOT
   promoted into the workspace, and `feedbackRuns` is empty.
3. A second valid `escalate` call in the same slice answers `isError: true` with the text
   `an escalation was already recorded for this slice; this call is refused (exactly one escalation may be recorded per slice).`,
   and the FIRST escalation is the one returned.
4. In IMPLEMENT, `{ statement: "no implementation can satisfy it", assertion: "expects both 4 and 5 from add(2, 2)" }`
   returns an escalation of kind `unsatisfiable-test` carrying that assertion.
5. An invalid call — IMPLEMENT with no `assertion`, or a blank `statement` in either phase — answers
   `isError: true` with `parseAuthoringEscalation`'s own reason. Nothing is recorded, and when the runner
   then completes normally the phase promotes and `author()` resolves `{ ok: true }`.
6. An escalation wins over every other ending, with nothing promoted. It wins when the runner, after
   escalating:
   - throws;
   - returns `timedOut: true`;
   - exits non-zero;
   - writes an unlisted file.
7. `escalate` never draws on the feedback budget. After a valid or refused `escalate` call, `run_proof`
   still runs the full five times, and no `escalate` call ever appears in `feedbackRuns`.
8. The composed stdin of an armed author ends with the escalation closing below. An author constructed
   without feedback commands opens no endpoint, so it has no `escalate` tool, and its stdin carries no
   escalation closing.

The observable is what the injected runner received over HTTP, the resolved `AuthorResult`, the run
record, the workspace after the phase, `feedbackRuns`, and the captured stdin.

## Guidance

**Leaf test acceptance (prompt-exposed).** Both AUTHOR_TEST and IMPLEMENT must read this spec in full
at `stories/agent/codex-leaf-escalates.md`: the `## Proof walkthrough` and every clause of the assertion
under `## Contracts (1)`. The contract-id briefing in the phase prompt is an index, never the acceptance.

**Why (ADR-0569).** ADR-0569 gives both authoring phases a typed escalation, and the Claude leaf raises
it through `mcp__spine__escalate` (`sdk-author.ts`). The seam the gate reads is already on main:
`AuthorResult.escalation`, `AuthoringEscalation` and `parseAuthoringEscalation` in `phase-author.ts`.
The Codex leaf's MCP server is the loopback endpoint in `codex-feedback-endpoint.ts`, so its escalation
belongs there, beside `run_proof`.

**The endpoint — `codex-feedback-endpoint.ts`.**
- `OpenCodexFeedbackEndpointArgs` gains an optional
  `recordEscalation: (escalation: AuthoringEscalation) => void`. With it absent, the endpoint behaves
  exactly as today: `tools/list` is the commands, and `escalate` is an unknown tool.
- With it present, `tools/list` adds `escalate`. `tools/call` for `escalate` reads `params.arguments`.
  It is the only tool that reads arguments, and only through `parseAuthoringEscalation(phase, arguments)`.
  The first valid call is recorded and answered as walkthrough step 2; every later call is refused as
  step 3; an invalid one returns its reason as step 5.
- `escalate` never spawns anything, never calls `record`, and never touches the feedback budget.
- Its description, written literally: `Raise a validated, phase-scoped escalation instead of continuing this authoring slice or working around a frozen input you believe is wrong. Ends the slice without a verdict — it never moves the verdict; the spine alone observes red/green out-of-band. AUTHOR_TEST takes { statement }, IMPLEMENT takes { statement, assertion }. Exactly the first valid call in a slice is recorded; every later call is refused.`

**The author — `codex-author.ts`.**
- Each `author()` call keeps its own escalation slot and passes `recordEscalation` to the endpoint it
  opens.
- Once the runner settles, a recorded escalation is returned as
  `{ ok: false, error: \`${phase} escalated (${kind}): ${statement}\`, escalation }` — the Claude leaf's
  `escalationError` format — and it wins over every other ending:
  - a runner that threw, or one that returned `timedOut: true`, left no stream to parse, so the
    escalation returns at once;
  - otherwise the run record is still written first, so the slice's token usage stays accounted, and the
    escalation returns before the scope, exit-code, stream and required-target checks, and before
    promotion.
- On every path the phase promotes nothing, the replica is still removed, and the endpoint is still
  closed.
- An armed author appends this closing to the composed stdin, after the existing adapter lines, written
  literally:
  `If a frozen input is itself wrong and the phase is genuinely impossible, raise it through the \`escalate\` tool on the spine MCP server instead of guessing or working around it: in AUTHOR_TEST you may report the contract itself is untestable; in IMPLEMENT you may report that no correct implementation can satisfy the authored test as written. Raising an escalation ends this slice without a verdict — it never moves the verdict; the spine alone observes red and green, out-of-band, just as it always does.`
- `feedbackToolNames` stays scoped to the feedback commands, as the Claude leaf's does: `escalate` is not
  in it.
- An author without feedback commands opens no endpoint, so it has no `escalate` tool, which keeps
  `codex-author-arms-feedback`'s unarmed clause true. No build passes the Codex leaf feedback commands
  yet, so no build reaches this channel when it lands; once builds arm the leaf, every armed author
  carries it.

**Out of scope.** `sdk-author.ts` and `phase-author.ts` must not be edited. Nothing in
`packages/orchestrator` or `packages/drive` changes: the gate already routes an `AuthorResult.escalation`.

**The red must be an assertion.** This contract edits files that already exist. Today `escalate` is an
unknown tool (`-32602`), and `author()` resolves `{ ok: true }`, so the tests fail on assertions. Import
only values that already exist; the escalation types are type-only imports.

**Tests.** Read `packages/agent/src/codex-author-feedback.test.ts` first and play Codex the way it does,
including closing everything in `finally` and bounding every await as `within` does in
`codex-author.test.ts`. `packages/agent` is inside the mutation rung, so every tool name, answer text,
error string and schema is written LITERALLY in the test, never read from an exported constant. Every
test title starts with the contract-line id and a colon — `test("codex-escalation-ends-the-slice: …")`
— because that prefix is how coverage binds a test to this contract. Use `node:test` and
`node:assert/strict`, as the package's other tests do. The spine's declared proof runs this file under Bun
together with every other Codex test in the package — the regression wall for the two source files this
contract edits — and so does `pnpm --filter @storytree/agent test`.

## Contracts (1)

1. **`codex-escalation-ends-the-slice`** — an armed Codex leaf can escalate once per slice, and the escalation, not the phase's work, is what the author returns.
   - **asserts —** an armed `CodexPhaseAuthor`'s endpoint lists `escalate` beside its feedback commands
     with the declared input schema; the first valid call, validated by `parseAuthoringEscalation` for the
     slice's own phase, is recorded and answered as recorded, every later call is refused, and an invalid
     call returns its reason and records nothing; a recorded escalation makes `author()` resolve
     `{ ok: false, error, escalation }` in the Claude leaf's error format and win over a successful turn, a
     thrown or timed-out runner, a non-zero exit and a refused promotion, with nothing promoted and the
     run record still written whenever the runner returned a stream; `escalate` never spawns, never appears
     in `feedbackRuns` and never consumes the feedback budget; an armed author's stdin ends with the
     escalation closing; and an author without feedback commands has neither the tool nor the closing.
   - **covers —** `packages/agent/src/codex-author.ts` (`CodexPhaseAuthor`) and
     `packages/agent/src/codex-feedback-endpoint.ts` (`openCodexFeedbackEndpoint`).
   - **proven by —** a new `packages/agent/src/codex-author-escalation.test.ts` through its declared Bun
     proof command, which runs it together with every other Codex test in the package, with the
     `@storytree/agent` typecheck as the pre-promotion wall.
