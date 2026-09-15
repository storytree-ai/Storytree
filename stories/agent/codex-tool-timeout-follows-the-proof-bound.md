---
id: "codex-tool-timeout-follows-the-proof-bound"
tier: contract
story: agent
capability: live-codex-leaf
arc: inner-loop-exit-arc
title: "Set Codex's feedback tool timeout above the longest proof bound its commands carry"
outcome: "A Codex author tells Codex to wait for a feedback tool longer than the longest proof bound its feedback commands carry, so Codex never abandons a run the spine is still executing."
status: proposed
proof_mode: contract-test
depends_on: [codex-author-arms-feedback]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/codex-tool-timeout.test.ts"]
    sourceGlobs: ["packages/agent/src/codex-author.ts", "packages/agent/src/codex-feedback-endpoint.ts"]
  real:
    testFile: "packages/agent/src/codex-tool-timeout.test.ts"
    sourceFile: "packages/agent/src/codex-author.ts"
    scope:
      testGlobs: ["packages/agent/src/codex-tool-timeout.test.ts"]
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
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# Set Codex's feedback tool timeout above the longest proof bound its commands carry

**Outcome —** A Codex author tells Codex to wait for a feedback tool longer than the longest proof
bound its feedback commands carry, so Codex never abandons a run the spine is still executing.

## Proof walkthrough

Given a real workspace under `os.tmpdir()` holding the phase's required target, and a
`CodexPhaseAuthor` over it with exact promotion manifests and an injected runner that plays Codex. The
runner answers `login status` as a ChatGPT-managed login, and for `exec` it records the argument vector,
writes the required target inside the replica, and returns one successful JSONL turn.

1. Author a phase whose one feedback command carries `timeoutMs: 1_200_000`. The exec arguments carry
   `mcp_servers.spine.tool_timeout_sec=1260`.
2. With two commands carrying `300_000` and `1_500_000`, in that order, they carry `1560`. With the
   order reversed, still `1560`.
3. With `timeoutMs: 1_000_500`, they carry `1061`: a partial second rounds up.
4. With `timeoutMs: 600_000`, the ten-minute default, they carry `900`, today's value.
5. With no `timeoutMs` on any command, and separately with each of `0`, `-1`, `Number.NaN` and
   `Number.POSITIVE_INFINITY`, they carry `900`.
6. In every case above, `mcp_servers.spine.startup_timeout_sec` carries the same number as
   `tool_timeout_sec`, exactly as it does today.

The observable is the argument vector the injected runner received for `exec`.

## Guidance

**Leaf test acceptance (prompt-exposed).** Both AUTHOR_TEST and IMPLEMENT must read this spec in full
at `stories/agent/codex-tool-timeout-follows-the-proof-bound.md`: the `## Proof walkthrough` and every
clause of the assertion under `## Contracts (1)`. The contract-id briefing in the phase prompt is an
index, never the acceptance.

**Why this exists (ADR-0570 D4).** Each feedback run is bounded by its own command's proof bound: ten
minutes by default, or a node's declared `RealProofConfig.timeoutMs` (ADR-0104), which may be longer.
Codex applies its OWN timer to an MCP tool call, and `codex-author.ts` hardcodes it at
`FEEDBACK_TOOL_TIMEOUT_SEC = 900`. A node whose proof bound exceeds fifteen minutes would therefore have
Codex give up on a run the spine is still executing, and the leaf would read that as a failure of its
own work.

**The rule.**
- `CodexFeedbackCommand` in `codex-feedback-endpoint.ts` gains an optional `timeoutMs?: number`: the
  wall-clock bound, in milliseconds, the spine applies to that command's run. The endpoint does not read
  it. Callers set it; this contract only consumes it.
- `CodexPhaseAuthor` sets the tool timeout it hands `buildCodexExecArgs` to
  `max(900, ceil(longest / 1000) + 60)` seconds, where `longest` is the largest `timeoutMs` among its
  feedback commands that is a positive finite number. When no command carries one, the value is `900`.
- The sixty seconds are headroom for the spine to kill the run, format its output and answer the call.
  The `900` floor keeps today's value for every command at the default bound.
- `@storytree/agent` imports no other storytree package, so neither the orchestrator's
  `DEFAULT_PROOF_TIMEOUT_MS` nor any other storytree constant may be imported here.

**Out of scope.** `buildCodexExecArgs` already writes one number to both `tool_timeout_sec` and
`startup_timeout_sec`; do not change that. Nothing in `packages/orchestrator` sets `timeoutMs` yet, and
no build passes the Codex leaf feedback commands yet, so this changes no build's behaviour when it lands.
`packages/agent/src/sdk-author.ts` is out of scope and must not be edited.

**The red must be an assertion.** This contract edits files that already exist, so the spine declares an
assertion red and measures its kind by counting the assertions that ran. Today every case above reads
`900`, so a test expecting `1260` fails on an assertion. Do NOT import by name any value that does not
exist yet: a test that fails to load runs no assertion and is refused at CONFIRM_RED as the wrong red.
Reach the behaviour through `CodexPhaseAuthor`, which already exists.

**Tests.** Read `packages/agent/src/codex-author-feedback.test.ts` first and play Codex the way it does:
the ChatGPT-managed `login status` answer, the JSONL turn, a real temp directory as the author's `cwd` so
the replica is seeded and promotion is real, and `promotionManifests` naming the required target. The
runner need not call the endpoint. Close or remove everything each test opened in `finally`, and bound
each await as `within` does in `codex-author.test.ts`. `packages/agent` is inside the mutation rung, so
every number in the walkthrough above is a separate case, and every expected value is written as its
LITERAL string (`mcp_servers.spine.tool_timeout_sec=1260`), never computed in the test from the rule.
Every test title starts with the contract-line id and a colon —
`test("tool-timeout-exceeds-the-longest-proof-bound: …")` — because that prefix is how coverage binds a
test to this contract. Use `node:test` and `node:assert/strict`, as the package's other tests do. The spine's
declared proof runs this file under Bun together with every other Codex test in the package — the
regression wall for the two source files this contract edits — and so does `pnpm --filter @storytree/agent test`.

## Contracts (1)

1. **`tool-timeout-exceeds-the-longest-proof-bound`** — Codex's feedback tool timeout exceeds the longest proof bound any of its feedback commands carries.
   - **asserts —** a `CodexPhaseAuthor` whose feedback commands carry `timeoutMs` passes Codex
     `mcp_servers.spine.tool_timeout_sec` equal to `max(900, ceil(longest / 1000) + 60)`, where
     `longest` is the largest positive finite `timeoutMs` among its commands, independent of command
     order; a command carrying no bound, or a bound that is zero, negative, NaN or infinite, contributes
     nothing, so an author with no usable bound passes `900`; and `startup_timeout_sec` carries the same
     number.
   - **covers —** `packages/agent/src/codex-author.ts` (`CodexPhaseAuthor`) and
     `packages/agent/src/codex-feedback-endpoint.ts` (`CodexFeedbackCommand.timeoutMs`).
   - **proven by —** a new `packages/agent/src/codex-tool-timeout.test.ts` through its declared Bun proof
     command, which runs it together with every other Codex test in the package, with the
     `@storytree/agent` typecheck as the pre-promotion wall.
