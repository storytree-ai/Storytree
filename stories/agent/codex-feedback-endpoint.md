---
id: "codex-feedback-endpoint"
tier: contract
story: agent
capability: live-codex-leaf
arc: inner-loop-exit-arc
title: "Serve the spine's feedback commands to Codex from a token-gated loopback MCP endpoint"
outcome: "A loopback MCP endpoint, authenticated by a per-phase bearer token, exposes the spine's registered feedback commands as argument-free tools and runs them itself within one shared budget."
status: proposed
proof_mode: contract-test
depends_on: []
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/codex-feedback-endpoint.test.ts"]
    sourceGlobs: ["packages/agent/src/codex-feedback-endpoint.ts"]
  real:
    testFile: "packages/agent/src/codex-feedback-endpoint.test.ts"
    sourceFile: "packages/agent/src/codex-feedback-endpoint.ts"
    scope:
      testGlobs: ["packages/agent/src/codex-feedback-endpoint.test.ts"]
      sourceGlobs: ["packages/agent/src/codex-feedback-endpoint.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
    editsExisting: false
---

# Serve the spine's feedback commands to Codex from a token-gated loopback MCP endpoint

**Outcome —** A loopback MCP endpoint, authenticated by a per-phase bearer token, exposes the spine's
registered feedback commands as argument-free tools and runs them itself within one shared budget.

## Proof walkthrough

Open the endpoint for phase `IMPLEMENT` on a synthetic replica root, with two recording commands,
`run_proof` and `run_typecheck`, a run cap of two, and a `record` callback. Each command's `run` logs
the root it was given and returns a fixed `{ code, stdout, stderr }`; nothing is spawned. Every request
below is a real HTTP request made with `fetch`.

1. Read the handle. `url` is `http://127.0.0.1:<port>/mcp` on a port the operating system assigned,
   and the variable name is `STORYTREE_SPINE_MCP_TOKEN`. A second endpoint, opened alongside with a
   `run_proof` whose `run` rejects, reports a different `token`.
2. POST `tools/call` for `run_proof` with no `Authorization` header, then with a wrong bearer token:
   both are answered 401 and no command's log grows. Send a GET carrying the right token: it is
   answered 405.
3. With the right token, POST `initialize` carrying a protocol version. The result echoes that
   version, carries `capabilities.tools` and names the server `spine`. POST
   `notifications/initialized` with no `id`: it is answered 202.
4. POST `tools/list`. It lists exactly two tools, each with its command's name and description, and an
   input schema accepting no properties.
5. POST `tools/call` for `run_proof` with `arguments: { command: "echo injected" }`. The command runs
   once, with the replica root, and the result is one text content item equal to
   `formatFeedbackOutput` of the command's output, with no `isError`. Call a tool no command
   registered, then a method the endpoint does not serve: each answers a JSON-RPC error, and no log
   grows.
6. POST `tools/call` for `run_typecheck`: it runs. POST `tools/call` for `run_proof` again: the result
   carries `isError` and the budget refusal, and nothing runs. `record` saw exactly two runs, each
   `{ phase: "IMPLEMENT", tool, code }`.
7. POST `tools/call` for `run_proof` to the second endpoint: the result carries `isError`, and the run
   is recorded with `code: null`.
8. `close()` both endpoints. A further request to either `url` cannot connect.

The observable is the HTTP status, the JSON-RPC body, each command's own log, and the runs `record`
received.

## Guidance

**Leaf test acceptance (prompt-exposed).** Both AUTHOR_TEST and IMPLEMENT must read this spec in full
at `stories/agent/codex-feedback-endpoint.md`: the `## Proof walkthrough` and every clause of the
assertion under `## Contracts (1)`. The contract-id briefing in the phase prompt is an index, never the
acceptance.

**The adapter is dormant.** Nothing in `packages/orchestrator/src/resolve-prove-spec.ts` passes
feedback commands to the Codex leaf yet, so no build behaviour changes when this lands. Leave that file
alone. `packages/agent/src/sdk-author.ts` is out of scope and must not be edited.
*(Overtaken 2026-09-15: contract `codex-builds-arm-feedback` now passes feedback commands to the
Codex leaf in every build, so the adapter is armed. This contract's own write scope is unchanged.)*

**This contract adds one module and no caller.** `packages/agent/src/codex-feedback-endpoint.ts`
exports `openCodexFeedbackEndpoint`. It takes the authoring phase, the replica root, the commands, the
run cap and a `record` callback, and resolves to a handle carrying `url`, `token`, `tokenEnvVar` and
`close()`. The command shape `{ name, description, run(replicaRoot) }` is declared in this module,
because `codex-author.ts` is outside this contract's write scope.

- **One budget decision for both leaves.** Adapt each command to the Claude leaf's `FeedbackCommand`
  by closing over the replica root, and hand it to `executeFeedback`, imported from `./sdk-author.js`.
  That function already refuses a run past the cap without running it, returns a command that throws
  as an error result recorded with `code: null`, frames the output with `formatFeedbackOutput`, and
  calls `record` with `{ phase, tool, code }` (ADR-0570 D5). Count a run against the cap inside the
  `record` you pass it, exactly as `ClaudeAgentAuthor` does. Importing it is the whole of this
  contract's use of `sdk-author.ts`.
- **Transport.** JSON-RPC 2.0 over HTTP POST, answered with plain `application/json`. codex-cli 0.145.0
  accepted that without opening an event stream (ADR-0570's evidence), so no event stream is needed.
- **Local only.** Listen on `127.0.0.1` with port 0, never on `localhost` and never on every
  interface. The token is fresh per endpoint, and a request without it runs nothing.
- **The leaf controls zero arguments.** The input schema is
  `{ type: "object", properties: {}, additionalProperties: false }`, and a call's `arguments` are never
  read.

**Tests.** Make every request with `fetch` against the handle's `url`. Close every endpoint in
`finally`, so a failed assertion leaves no listener holding the test process open, and bound each await
as `within` does in `codex-author.test.ts`. `packages/agent` is inside the mutation rung, and CI's
Linux run once found a survivor that only Windows had killed. So a test names every operator-facing
string by its LITERAL value, never through an exported constant: `STORYTREE_SPINE_MCP_TOKEN`, the
`spine` server name, the `/mcp` path, `Bearer`, and the JSON-RPC method names. Every test title starts
with the contract-line id and a colon —
`test("token-gated-loopback-mcp-runs-only-registered-commands: …")` — because that prefix is how
coverage binds a test to this contract. Use `node:test` and `node:assert/strict`: the spine's focused
proof runs this file under Node, and `pnpm --filter @storytree/agent test` runs it under Bun, so it must
pass under both.

## Contracts (1)

1. **`token-gated-loopback-mcp-runs-only-registered-commands`** — an authenticated local endpoint runs the spine's fixed commands itself, inside one budget.
   - **asserts —** `openCodexFeedbackEndpoint` listens on `127.0.0.1` on an ephemeral port and reports
     `url` as `http://127.0.0.1:<port>/mcp`, a fresh random `token`, and the token's environment-variable
     name `STORYTREE_SPINE_MCP_TOKEN`; a POST without `Authorization: Bearer <token>`, or with a wrong
     token, is answered 401 and runs nothing, and a non-POST is answered 405; `initialize` answers with
     the client's protocol version, `capabilities.tools` and server name `spine`, and a JSON-RPC
     notification with no `id` is answered 202; `tools/list` lists exactly one tool per command, with
     the command's name and description and an input schema accepting no properties;
     `tools/call <name>` runs that command through `executeFeedback` from `./sdk-author.js`, ignores any
     arguments the caller sends, invokes the command's `run` with the replica root the endpoint was
     opened for, and returns its text as MCP text content, with `isError` on a budget or spawn refusal;
     an unknown tool or method is a JSON-RPC error, never a run; the run cap is shared across commands,
     so the call past it is refused without running; every budget-consuming run is recorded as
     `{ phase, tool, code }`; and after `close()` a later request cannot connect.
   - **covers —** `packages/agent/src/codex-feedback-endpoint.ts`.
   - **proven by —** a new `packages/agent/src/codex-feedback-endpoint.test.ts` through the default
     focused REAL proof, with the `@storytree/agent` typecheck as the pre-promotion wall.
