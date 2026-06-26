---
id: "headless-session-runner"
tier: capability
story: headless-orchestrator
title: "A single read-only SDK session that runs an injected prompt with orientation tools wired and surfaces a proposal"
outcome: "A single read-only SDK session runs an injected system prompt with the orientation tools wired, surfaces the agent's final proposal text, and fails closed on a dead/empty session — one session at a time."
status: proposed
proof_mode: integration-test
depends_on: [orientation-tool-surface]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors a
# test that imports a NOT-YET-EXISTING symbol from a NEW source file (red = module-not-found against the
# source that does not exist at HEAD), then writes that one new source file (green), driving the runner
# with an injected `queryFn` scripted double (zero live SDK calls — the same offline seam runSdkCurator
# uses). `install: true` + a typecheck wall because the new module lives in @storytree/agent and imports
# the SDK `query` type + the SdkQueryFn seam (the proof runs in a fresh worktree — tsx + tsc need the
# lockfile-only install, ADR-0031 §2). Single LITERAL source file (no `*`), so the default node:test
# proof on the one test file is legal — no `proofCommand`.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/**/*.test.ts"]
    sourceGlobs: ["packages/agent/src/**/*.ts"]
  real:
    testFile: "packages/agent/src/headless-orchestrator.test.ts"
    sourceFile: "packages/agent/src/headless-orchestrator.ts"
    scope:
      testGlobs: ["packages/agent/src/headless-orchestrator.test.ts"]
      sourceGlobs: ["packages/agent/src/headless-orchestrator.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# A single read-only SDK session that orients and proposes

**Outcome —** A single read-only SDK session runs an injected system prompt with the orientation tools
wired, surfaces the agent's final proposal text, and fails closed on a dead/empty session — one session
at a time.

**Depends on —** [`orientation-tool-surface`](orientation-tool-surface.md) — the runner wires the
read-only orientation tools INTO the `query()` options; it builds the surface that capability owns and
hands it to the SDK session.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. The runner is the
> `runSdkCurator` sibling (`packages/agent/src/sdk-curator.ts`) PLUS the orientation tool surface — a
> single read-only `query()` with an INJECTED system prompt, the read tools wired, an injectable
> `queryFn` seam (the same `SdkQueryFn` from `packages/agent/src/sdk-author.ts`), returning the final
> proposal text, never throwing. The SDK is imported here (the single-import-site rule, ADR-0004 — this
> module joins `sdk-author.ts` / `sdk-curator.ts` in `packages/agent`).

## Guidance

WHY THIS IS A CAPABILITY: its honest proof is the SESSION LIFECYCLE — run one read-only `query()` with
an injected prompt + the orientation tools wired, let the scripted session call a tool and emit a final
proposal, surface that proposal, and fail closed on a dead/empty session — exercised against the real
orientation tool surface (the real `run()` over the seed) so the wiring and the proposal extraction are
proven end-to-end. The individual invariants (read-only options, fail-closed on no result, the
single-session guard) are contract-testable (below).

THE RUNNER IS `runSdkCurator` + READ TOOLS (the decisive precedent): mirror `runSdkCurator` exactly —
`Options` with the injected `systemPrompt`, `permissionMode: "bypassPermissions"`, a turn/budget
ceiling, and the injectable `queryFn` defaulting to the real SDK `query()`. The ONE difference: where
the curator sets `tools: []` (its data is in the prompt), the orchestrator sets the orientation tool
surface — `createSdkMcpServer({ name, tools })` over the read-only tools (the `ClaudeAgentAuthor` MCP
pattern, `packages/agent/src/sdk-author.ts`), and `allowedTools` listing exactly those read tools. NO
`Write`/`Edit`/`Bash` (those would let the agent act — Phase 1 is read/propose only).

NEVER THROWS (the `runSdkCurator` contract): a failed session returns `{ ok: false, error }` so the
enclosing composition stays robust. Read the final proposal off the SDK result message (the `result`
field on a successful result, exactly as `runSdkCurator` reads it). A session that ends with NO result
message, or a non-success subtype, is a fail-closed `{ ok: false, error }` — never a forged
`{ ok: true }` with an empty proposal (the *halted-is-never-a-pass* discipline, generalised: a dead
session is not a proposal).

ONE SESSION AT A TIME (ADR-0108 decision 6): the runner serves a SINGLE live orchestration — a second
concurrent run is refused while one is in flight (mirroring the build worker's single-build guard). The
refusal is a typed result, never a thrown crash. This is a deliberate Phase-1 simplification (one
operator, own machine); multi-session concurrency is the hosted phase's, and must NOT be designed in
now. (The single-session guard MAY live in the composition that owns the entry instead of the runner —
wherever it lives, it is proven; the contract below pins the behaviour, not the file.)

NO BUILD, NO SIGN, NO LAND (ADR-0091): the runner ORIENTS and PROPOSES. It holds no signing key, hands
in no verdict, triggers no build, opens no PR. Its only side effect is the SDK session's read-tool
calls and the proposal text it returns. Get this wrong — wiring a build/gate/PR tool — and you have
crossed into Phase 3/4 scope.

OFFLINE-TESTABLE BY INJECTION: the integration test drives the runner with an injected `queryFn`
scripted double (the `runSdkCurator` test pattern) — a scripted async iterable that emits a tool-call
turn (dispatching to the real orientation tool over the seed) then a result message carrying the
proposal. Zero live SDK spend; the live `query()` is the Story UAT human-witness leg.

## Integration test

**Goal —** Prove that the runner runs one read-only session with the orientation tools wired, the
scripted session's tool call dispatches to the REAL orientation surface, and the runner surfaces the
final proposal — with a dead session failing closed and a concurrent run refused.

The integration test exercises this capability against its **real in-story collaborator** — the real
`orientation-tool-surface` wired over an `InMemoryStore` seed + the real `stories/` corpus — with an
injected `queryFn` scripted double (no live SDK spend, ADR-0010 §5) standing in for the model. It is an
integration test, not a contract, because it spans the runner AND the real tool surface producing the
envelope the scripted session reads.

The integration test would:

1. Build the orientation tool surface (real `run()` over the seed) and run the runner with an injected
   `queryFn` whose scripted session: emits a tool-call turn for the `tree` (or `library`) orientation
   tool, then a result message whose `result` is a proposal string.
2. Assert the scripted tool call DISPATCHED to the real orientation surface (the tool's envelope body
   flowed back into the session) — the tools were genuinely wired, not stubbed away.
3. Assert the runner returned `{ ok: true, proposal: <the result string> }` — the final proposal is
   surfaced off the result message.
4. Assert the `query()` options the runner built carry the orientation tools in `allowedTools` and NO
   `Write`/`Edit`/`Bash` — the session is read-only.
5. Drive a DEAD session (an injected `queryFn` that yields no result message, or an error subtype) →
   the runner returns `{ ok: false, error }` (fail-closed), never `{ ok: true }` with an empty proposal.
6. Attempt a SECOND run while one is in flight → it is REFUSED (the single-session typed result), and
   the running session is untouched. (If the guard lives in the composition, this leg moves there; the
   behaviour is proven either way.)

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** (`node:test`, the
`@storytree/agent` suite), collaborators stubbed (the injected `queryFn` double). None exist yet; each
is the assertion a contract test WILL prove against the real runner code once authored (provisional
path — re-cite when built).

1. **`hsr-wires-read-only-options`** — the session options are read-only with the orientation tools
   - **asserts —** the `Options` the runner builds carry the injected `systemPrompt`,
     `permissionMode: "bypassPermissions"`, the orientation tool surface in `allowedTools`, and NO
     `Write`/`Edit`/`Bash` tool — the read-only session shape.
   - **covers —** `packages/agent/src/headless-orchestrator.ts` (the options builder) *(provisional path)*
2. **`hsr-surfaces-final-proposal`** — the proposal is read off the result message
   - **asserts —** given an injected `queryFn` yielding a success result with a `result` string, the
     runner returns `{ ok: true, proposal: <that string> }` — the final proposal is the result text,
     exactly as `runSdkCurator` reads its final message.
   - **covers —** `packages/agent/src/headless-orchestrator.ts` (the result extraction)
3. **`hsr-no-result-fails-closed`** — a dead session is a refusal, never a forged pass
   - **asserts —** a session ending with NO result message returns `{ ok: false, error }` (and a
     non-success subtype likewise), never `{ ok: true }` with an empty proposal — halted is never a
     pass.
   - **covers —** `packages/agent/src/headless-orchestrator.ts` (the fail-closed terminal)
4. **`hsr-never-throws`** — a thrown session is captured, not propagated
   - **asserts —** when the injected `queryFn` throws, the runner returns `{ ok: false, error }`
     (the `runSdkCurator` never-throws contract), never letting the throw escape into the caller.
   - **covers —** `packages/agent/src/headless-orchestrator.ts` (the try/catch)
5. **`hsr-refuses-concurrent-session`** — one session at a time
   - **asserts —** with a session in flight, a second run is refused with a typed result (not a throw),
     and the running session is unaffected; once it terminates, a new run is admitted. (Pins the
     ADR-0108-decision-6 single-session guard wherever it lives.)
   - **covers —** `packages/agent/src/headless-orchestrator.ts` (the single-session guard)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the read-only
headless-session runner as a new module, test-first.

- **The new test —** `packages/agent/src/headless-orchestrator.test.ts` (`node:test` +
  `node:assert/strict`). Import `{ runHeadlessOrchestrator }` (or the chosen name) from
  `"./headless-orchestrator.js"`, and the orientation tool surface factory from
  `"./orientation-tools.js"`. Build the injected `queryFn` scripted double the `runSdkCurator` tests use
  (a `function* () {}` yielding the turn(s) + a result message).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `headless-orchestrator.ts` does not exist at HEAD, so the test fails module-not-found (the net-new
  missing-symbol red). Assert the runner surfaces the scripted result's proposal, builds read-only
  options with the orientation tools, and fails closed on a no-result session.
- **The GREEN —** write `packages/agent/src/headless-orchestrator.ts`: `runHeadlessOrchestrator(args)`,
  the `runSdkCurator` shape (`packages/agent/src/sdk-curator.ts`) PLUS the orientation tool surface in
  the options — an injected `systemPrompt` + `userPrompt` (the programmatic intent), the read-only
  tools wired via `createSdkMcpServer`, the injectable `queryFn` defaulting to the real `query()`,
  reading the proposal off the result message, never throwing. After it, the import resolves, the
  assertions hold, and the package suite + typecheck stay green.

Rules:

- **Mirror `runSdkCurator`'s never-throws + result-extraction discipline exactly** — a failed/empty
  session is `{ ok: false, error }`, never a forged `{ ok: true }`.
- **READ-ONLY tools only** — wire the orientation surface, NEVER `Write`/`Edit`/`Bash` (those are
  Phase 3+ act-authority). The test pins the read-only options (`hsr-wires-read-only-options`).
- **No verdict, no build, no land** — the runner orients and proposes; it holds no signing key and
  hands in no verdict (ADR-0091). Do not wire a build/gate/PR tool.
