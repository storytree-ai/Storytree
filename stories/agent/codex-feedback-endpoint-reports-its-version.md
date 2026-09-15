---
id: "codex-feedback-endpoint-reports-its-version"
tier: contract
story: agent
capability: live-codex-leaf
arc: inner-loop-exit-arc
title: "Report a server version in the Codex feedback endpoint's initialize answer"
outcome: "The Codex feedback endpoint answers initialize with a server version beside the name spine, leaving its protocol-version echo unchanged."
status: proposed
proof_mode: contract-test
depends_on: [codex-feedback-endpoint]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/codex-feedback-endpoint-version.test.ts"]
    sourceGlobs: ["packages/agent/src/codex-feedback-endpoint.ts"]
  real:
    testFile: "packages/agent/src/codex-feedback-endpoint-version.test.ts"
    sourceFile: "packages/agent/src/codex-feedback-endpoint.ts"
    scope:
      testGlobs: ["packages/agent/src/codex-feedback-endpoint-version.test.ts"]
      sourceGlobs: ["packages/agent/src/codex-feedback-endpoint.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
    editsExisting: true
---

# Report a server version in the Codex feedback endpoint's initialize answer

**Outcome —** The Codex feedback endpoint answers `initialize` with a server version beside the name
`spine`, leaving its protocol-version echo unchanged.

## Proof walkthrough

Open an endpoint with `openCodexFeedbackEndpoint` for phase `IMPLEMENT`, on a synthetic replica root,
with one recording `run_proof` command, a run cap of one and a `record` callback. Every request is a
real HTTP POST made with `fetch` to the handle's `url`, carrying `Authorization: Bearer <token>`;
nothing is spawned.

1. POST `initialize` carrying protocol version `2025-06-18`. The result's `serverInfo.name` is
   `spine`, `serverInfo.version` is a string of at least one character, and `protocolVersion` is
   `2025-06-18`.
2. POST `initialize` again carrying `2025-03-26`. `protocolVersion` is `2025-03-26`, and `serverInfo`
   still carries the name `spine` and a non-empty `version`.

The observable is the JSON-RPC `initialize` result alone: no tool is listed or called.

## Guidance

**Leaf test acceptance (prompt-exposed).** Both AUTHOR_TEST and IMPLEMENT must read this spec in full
at `stories/agent/codex-feedback-endpoint-reports-its-version.md`: the `## Proof walkthrough` and every
clause of the assertion under `## Contracts (1)`. The contract-id briefing in the phase prompt is an
index, never the acceptance.

**The adapter is dormant.** Nothing in `packages/orchestrator/src/resolve-prove-spec.ts` passes
feedback commands to the Codex leaf yet, so no build behaviour changes when this lands. Leave that file
alone. `packages/agent/src/sdk-author.ts` is out of scope and must not be edited.
*(Overtaken 2026-09-15: contract `codex-builds-arm-feedback` now passes feedback commands to the
Codex leaf in every build, so the adapter is armed. This contract's own write scope is unchanged.)*

**Why this contract exists: a measured defect in a signed one.** Contract `codex-feedback-endpoint`
answers `initialize` with `serverInfo: { name: "spine" }` and no `version`, and its test asserts only
the name, so nothing signed pins the version-less shape. On 2026-09-15 a probe ran the leaf's
production `codex exec` flags, on codex-cli 0.145.0, against a loopback HTTP MCP endpoint answering
with exactly that `serverInfo`. The out-of-band request log recorded `initialize` and nothing after it:
no `notifications/initialized`, no `tools/list`, no `tools/call`. The model answered that the
`run_proof` tool was unavailable, and the turn still exited 0. The control run, the same harness with
`version: "0.0.1"`, went end to end: `tools/call` happened and the tool's output reached the model. So
Codex drops a server that reports no version without failing anything a build observes, which
ADR-0570's Evidence and D2 now record.

**The change is one field.** Give the `serverInfo` that `openCodexFeedbackEndpoint` returns from
`initialize` in `packages/agent/src/codex-feedback-endpoint.ts` a `version`. The protocol-version echo,
`capabilities.tools`, authentication, the tools and the budget stay exactly as
`codex-feedback-endpoint` signed them. Its own test, `codex-feedback-endpoint.test.ts`, is outside this
contract's write scope and must stay green unedited.

- **The version value is not a protocol requirement beyond being a non-empty string.** Codex needed a
  version to be present, not a particular one. So the test asserts a string of at least one character
  and never a literal value, which would pin a number nobody decided.
- **The red is an assertion.** The test imports only `openCodexFeedbackEndpoint`, which
  `codex-feedback-endpoint.ts` already exports, so the file loads, `initialize` is answered, and the
  check on `serverInfo.version` fails. That matters because this contract edits a file that already
  exists: the spine declares an assertion red and counts the assertions that ran, and a test importing
  a value the module does not export yet would never load and would be refused at CONFIRM_RED.

**Tests.** Close the endpoint in `finally`, so a failed assertion leaves no listener holding the test
process open, and bound each await as `within` does in `codex-author.test.ts`. `packages/agent` is
inside the mutation rung, and CI's Linux run once found a survivor that only Windows had killed. So a
test names every operator-facing string by its LITERAL value, never through an exported constant: the
`spine` server name, `initialize` and `Bearer`. Every test title starts with the contract-line id and a
colon — `test("initialize-names-spine-with-a-non-empty-version: …")` — because that prefix is how
coverage binds a test to this contract. Use `node:test` and `node:assert/strict`: the spine's focused
proof runs this file under Node, and `pnpm --filter @storytree/agent test` runs it under Bun, so it must
pass under both.

## Contracts (1)

1. **`initialize-names-spine-with-a-non-empty-version`** — `initialize` reports a server version beside the name; codex-cli 0.145.0 was measured to drop a server without one.
   - **asserts —** `openCodexFeedbackEndpoint` answers an authorized `initialize` with a `serverInfo`
     whose `name` is `"spine"` and whose `version` is a non-empty string, while `protocolVersion` still
     echoes the protocol version the client sent.
   - **covers —** `packages/agent/src/codex-feedback-endpoint.ts`.
   - **proven by —** a new `packages/agent/src/codex-feedback-endpoint-version.test.ts` through the
     default focused REAL proof, with the `@storytree/agent` typecheck as the pre-promotion wall.
