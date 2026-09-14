---
id: "sdk-leaf-escalate-tool"
tier: contract
story: agent
capability: live-sdk-leaf
arc: inner-loop-exit-arc
title: "Arm the Claude leaf's escalate tool on every authoring slice"
outcome: "Every Claude SDK authoring slice can raise one validated escalation through a spine tool that spawns nothing, and a recorded escalation is what the slice returns, whatever its session does afterwards."
status: proposed
proof_mode: contract-test
depends_on: [authoring-escalation-shape]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs:
      - "packages/agent/src/sdk-author-escalation.test.ts"
      - "packages/agent/src/sdk-author.test.ts"
    sourceGlobs: ["packages/agent/src/sdk-author.ts"]
  real:
    testFile: "packages/agent/src/sdk-author-escalation.test.ts"
    sourceFile: "packages/agent/src/sdk-author.ts"
    scope:
      testGlobs:
        - "packages/agent/src/sdk-author-escalation.test.ts"
        - "packages/agent/src/sdk-author.test.ts"
      sourceGlobs: ["packages/agent/src/sdk-author.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: bun
      args:
        - "test"
        - "--timeout"
        - "300000"
        - "./packages/agent/src/sdk-author-escalation.test.ts"
        - "./packages/agent/src/sdk-author.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# Arm the Claude leaf's escalate tool on every authoring slice

**Outcome —** Every Claude SDK authoring slice can raise one validated escalation through a spine tool
that spawns nothing, and a recorded escalation is what the slice returns, whatever its session does
afterwards.

## Proof walkthrough

Given a `ClaudeAgentAuthor` built with a scripted `queryFn` and an injected MCP-server factory that
captures the tool definitions it is handed and returns a stand-in server config, so the test imports
no SDK and starts no session:

1. for AUTHOR_TEST and for IMPLEMENT, each with and without `feedbackCommands`, read the `Options` the
   scripted `queryFn` receives: `mcpServers.spine` is present, the captured definitions include one
   named `escalate`, `allowedTools` includes `mcp__spine__escalate` and never `Bash`, and
   `feedbackToolNames` lists the feedback commands only;
2. from inside the scripted `queryFn`, call the captured `escalate` definition's
   `handler(args, extra)`. A valid first call replies without `isError` that the escalation is
   recorded and the leaf should stop. An invalid call (a blank `statement`; an IMPLEMENT call with no
   `assertion`) replies with `isError: true` carrying the validator's reason, and records nothing. A
   call after a recorded one replies with `isError: true`, and the first stands. With
   `maxFeedbackRuns: 1`, a feedback tool still runs after any number of escalate calls, and
   `feedbackRuns` records no escalate call;
3. after a recorded escalation, end the scripted session in turn with a `success` result, an
   `error_max_turns` result, an `error_during_execution` result, no result message, and a throw. Each
   time `author()` returns `{ ok: false, error, escalation }`, with `escalation` deep-equal to the
   validated one, `error` naming the phase and the kind, and no `exhausted` key. Without an escalation
   each of those endings returns what it returns today, and the next `author()` call on the same
   instance starts with nothing recorded;
4. read `leafSystemPrompt(false)`, `leafSystemPrompt(true)`, `composeLeafSystemPrompt(body, false)`
   and `composeLeafSystemPrompt(body, true)`: each names `mcp__spine__escalate`, says AUTHOR_TEST may
   escalate a contract that cannot be tested as specified and IMPLEMENT a test that cannot be
   satisfied as written, and says an escalation never moves the verdict (as built, the closing does not
   ask for the assertion to be quoted; the tool's input shape and the validator require it); each
   still carries the phrases its existing tests assert; and
5. revise the existing test "author WITHOUT feedback commands stays the blind leaf (no MCP server,
   original prompt)" in `sdk-author.test.ts` in place, during AUTHOR_TEST, to "no FEEDBACK tool;
   escalate armed". It asserts no MCP server and no `mcp__` tool, which step 1 reverses on purpose;
   that is why the file is in this contract's test scope and in its focused proof command.

The observable is the returned `AuthorResult`, the captured `Options`, the tool replies,
`feedbackRuns`, and the prompt strings.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (1)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

This contract changes `ClaudeAgentAuthor` in `packages/agent/src/sdk-author.ts` and nothing else.

- **The channel (ADR-0569 D6).** Every `author()` slice creates the in-process `spine` MCP server,
  whether or not feedback commands are wired, and registers `escalate` on it beside one tool per
  feedback command. `allowedTools` adds `mcp__spine__escalate`; `tools` and `feedbackToolNames` are
  unchanged, and `Bash` is never allow-listed. `escalate` spawns nothing, is not a feedback tool, does
  not draw on `maxFeedbackRuns`, and is never recorded in `feedbackRuns`.
- **Admission (ADR-0569 D1).** The tool declares the input `{ statement: string; assertion?: string }`
  as a zod raw shape. The SDK's `tool()` accepts a raw shape from `zod` or `zod/v4`, and the workspace
  links zod 3.25.76, which provides both, for this package and for the SDK. Every call's arguments are
  admitted only through `parseAuthoringEscalation(phase, args)` from `./phase-author.js`, including
  arguments that already satisfy the declared shape. The first valid call in a slice is recorded;
  every later call in that slice is answered with `isError`. A new slice starts with nothing
  recorded, the way the feedback-run counter already does.
- **The return.** A slice that recorded an escalation returns `{ ok: false, error, escalation }` on
  every ending after the call, with `error` naming the phase and kind. Those endings include a
  `success` result, an exhaustion subtype (the escalation wins and `exhausted` is not set), another
  error subtype, a missing result, and a thrown query. A slice with no escalation maps each ending
  exactly as it does today, and per-slice `runs` accounting is unchanged.
- **The closings (ADR-0569 D2, D6).** The feedback closing (`leafSystemPrompt(true)`) and the blind
  closing (`leafSystemPrompt(false)`), and so `composeLeafSystemPrompt` in both modes, name
  `mcp__spine__escalate` and what each phase may escalate, where the feedback closing used to say only
  "stop and say so plainly". Each says an escalation never moves the verdict: the spine alone observes
  red and green. The phrases existing tests assert stay: "cannot run tests or shell commands",
  "FEEDBACK ONLY", "stop and say so", and "mcp__spine__".
- **The test seam.** `ClaudeAgentAuthorArgs` gains `mcpServerFactory?: typeof createSdkMcpServer`,
  defaulting to the SDK's `createSdkMcpServer`. A scripted `queryFn` reaches the registered handler
  only through the definitions that factory is handed, never through `McpServer` private fields. The
  test imports no SDK. A malformed argument reaches the handler without a cast: the declared input
  already makes `assertion` optional, so the refusal is the validator's at run time (the package
  typecheck — a pre-signature backstop — covers test files, and the house lint forbids assertion chains).

Only this leaf gets a channel (ADR-0569 D6): `codex-author.ts`, the owned loop and `pi-author.ts` are
untouched, and the phase briefs `resolve-prove-spec.ts` renders are not part of this contract.

## Contracts (1)

1. **`escalate-tool-is-armed-on-every-slice-and-recorded-once`** — the Claude leaf arms one spawn-free escalate tool on every slice, admits its input only through the seam's validator, and returns what it recorded.
   - **asserts —** in both phases, with and without `feedbackCommands`, the slice registers `escalate` on the `spine` server and allow-lists `mcp__spine__escalate`, while `feedbackToolNames` lists feedback commands only, `Bash` is never allow-listed, and escalate spawns nothing, never draws on `maxFeedbackRuns` and never enters `feedbackRuns`; a valid first call is recorded and answered without `isError`, an invalid call is answered `isError` with the validator's reason and records nothing, and a later call is answered `isError` while the first stands; a recorded escalation makes `author()` return `{ ok: false, error, escalation }`, with `error` naming phase and kind, after a `success`, an exhaustion (no `exhausted`), another error subtype, a missing result, or a throw, while a slice without one returns exactly what it returns today and each new slice starts clean; `leafSystemPrompt(false)`, `leafSystemPrompt(true)` and `composeLeafSystemPrompt` name `mcp__spine__escalate`, what each phase may escalate, and that an escalation never moves the verdict, keeping "cannot run tests or shell commands", "FEEDBACK ONLY", "stop and say so" and "mcp__spine__".
   - **covers —** `ClaudeAgentAuthor.author`, `ClaudeAgentAuthorArgs.mcpServerFactory`, `leafSystemPrompt` and `composeLeafSystemPrompt` in `packages/agent/src/sdk-author.ts`.
   - **proven by —** a new `packages/agent/src/sdk-author-escalation.test.ts` plus the revised blind-leaf test in `packages/agent/src/sdk-author.test.ts`, through the declared focused bun REAL proof over both files.
