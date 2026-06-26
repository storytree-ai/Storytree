---
id: "orchestrator-composition"
tier: capability
story: headless-orchestrator
title: "The Phase-1 composition + programmatic entry — render the session-orchestrator agent, drive a session, surface a proposal"
outcome: "A programmatic intent renders the session-orchestrator agent, drives a scripted headless session against the real seed corpus, and surfaces an orientation/proposal."
status: proposed
proof_mode: integration-test
depends_on: [headless-session-runner]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors a
# test that imports a NOT-YET-EXISTING symbol from a NEW source file in @storytree/cli (red =
# module-not-found against the source that does not exist at HEAD), then writes that one new source file
# (green), driving the composition with an injected `queryFn` scripted double. `install: true` + a
# typecheck wall because the new module lives in @storytree/cli and imports renderAgentPrompt + the
# runner from @storytree/agent + @storytree/library (the proof runs in a fresh worktree — tsx + tsc need
# the lockfile-only install, ADR-0031 §2). Single LITERAL source file (no `*`), so the default node:test
# proof on the one test file is legal — no `proofCommand`. The scope stays within packages/cli (ADR-0087:
# one concrete package per write scope) — the agent-side runner it calls is a CONSUMED dependency, not a
# co-edited file.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/**/*.test.ts"]
    sourceGlobs: ["packages/cli/src/**/*.ts"]
  real:
    testFile: "packages/cli/src/orchestrate.test.ts"
    sourceFile: "packages/cli/src/orchestrate.ts"
    scope:
      testGlobs: ["packages/cli/src/orchestrate.test.ts"]
      sourceGlobs: ["packages/cli/src/orchestrate.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
---

# The Phase-1 composition + programmatic entry

**Outcome —** A programmatic intent renders the session-orchestrator agent, drives a scripted headless
session against the real seed corpus, and surfaces an orientation/proposal.

**Depends on —** [`headless-session-runner`](headless-session-runner.md) — the composition is the thin
programmatic shell over the runner: it renders the prompt, assembles the orientation deps, and calls
the runner.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. The composition is the
> Phase-1 programmatic entry — a thin CLI command, NOT an HTTP/chat endpoint (that is Phase 2). It
> renders the SAME `session-orchestrator` system prompt the terminal session uses
> (`renderAgentPrompt`, `packages/cli/src/agents.ts`, ADR-0051) and drives the runner against the real
> seed corpus. It lives in `packages/cli` — which already owns `renderAgentPrompt` + `run()`, already
> binds `ClaudeAgentAuthor` in its build path, and depends on `@storytree/agent`.

## Guidance

WHY THIS IS A CAPABILITY: it is where the runtime wires together — render the REAL `session-orchestrator`
agent, assemble the orientation deps (the in-memory seed `store` + the real `stories/` corpus), drive
the runner, and surface the proposal — proven by an integration test against the real in-story
collaborators (the real `renderAgentPrompt`, the real `run()` over the real seed corpus) with the SDK
`query()` scripted. It is the integration seam the Story UAT rides; the runner and the orientation
surface are its upstream.

THE LOOP DEFINITION IS THE RENDERED AGENT, NOT A FORK (ADR-0108 decision 2 / ADR-0051): the composition
calls `renderAgentPrompt(store, "session-orchestrator")` to assemble the orchestrator's system prompt —
the SAME prompt the terminal session embodies and the CLAUDE.md region is generated from. The runtime
RUNS that prompt; it does NOT re-author or fork the loop. Edit the library `session-orchestrator`
artifact, regenerate, and both the terminal and this runtime move together. Get this wrong — hard-coding
a bespoke orchestrator prompt here — and you have forked the one loop definition the whole design rests
on.

THE INTENT IS PROGRAMMATIC, NOT A CHAT ENDPOINT (Phase 1 scope wall): the entry takes a programmatic
intent (a thin CLI command / a function arg — "orient and propose a unit for <focus>"), feeds it as the
runner's `userPrompt`, and returns the proposal. There is NO HTTP route, NO SSE stream, NO chat panel
(those are Phase 2). Keep the composition REUSABLE at the package level (a plain async function the CLI
command calls), so Phase 2's studio chat worker reuses it rather than re-implementing — do NOT bury it
as CLI-private glue.

DECLARES PRESENCE LIKE ANY SESSION (ADR-0033): the orchestration declares itself on the notice board
(the session courtesy every session owes). But Phase 1's PROOF is orientation+proposal, NOT presence —
the declaration is not the deliverable, and the offline integration test does not require the live board
(presence reads need the live store; the offline proof exercises the render + the scripted session over
the seed).

READ/PROPOSE ONLY (ADR-0091): the composition surfaces a PROPOSAL. It holds no signing key, hands in no
verdict, triggers no build, opens no PR, lands nothing. The single-session guard (ADR-0108 decision 6)
is enforced here or in the runner (one orchestration at a time). Get this wrong — wiring a build/gate/PR
call — and you have crossed into Phase 3/4.

OFFLINE-TESTABLE BY INJECTION: the integration test drives the composition with an injected `queryFn`
scripted double (passed through to the runner), so the render + the session + the proposal extraction
are proven WITHOUT a live SDK run on every gate pass (ADR-0010 §5). The live run is the Story UAT
human-witness leg.

## Integration test

**Goal —** Prove that the programmatic entry renders the REAL `session-orchestrator` prompt, drives the
runner against the real seed corpus with a scripted session, and surfaces the proposal — read/propose
only.

The integration test exercises this capability against its **real in-story collaborators** — the real
`renderAgentPrompt(store, "session-orchestrator")` over an `InMemoryStore` seed (`loadCorpus`), the real
orientation surface over the real `stories/` corpus, and the real runner — with an injected `queryFn`
scripted double (no live SDK spend, ADR-0010 §5). It is an integration test, not a contract, because it
spans the composition AND the real render + runner producing the prompt and the proposal.

The integration test would:

1. Call the programmatic entry with a focus intent and an injected `queryFn` whose scripted session
   calls an orientation tool then emits a proposal result.
2. Assert the system prompt handed to the runner is the REAL rendered `session-orchestrator` prompt — a
   non-empty prompt carrying the orchestrator's role + injected guidance (e.g. it contains the agent's
   title / a known guidance fragment), NOT a stub or a bespoke hard-coded string.
3. Assert the orientation deps were assembled over the real seed corpus + the real `stories/` (the
   scripted tool call returned a real envelope body) — the agent oriented on real surfaces.
4. Assert the entry returned the surfaced proposal (`{ ok: true, proposal: … }`), read/propose only —
   no build/PR/verdict side effect occurred (no worktree, no `events.verdict` write).
5. A failed session (injected dead/error `queryFn`) → the entry returns a fail-closed result with the
   error, never a forged proposal.
6. A second concurrent intent → refused (the single-session guard), the running orchestration untouched.

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** (`node:test`, the
`@storytree/cli` suite), collaborators stubbed. None exist yet; each is the assertion a contract test
WILL prove against the real composition code once authored (provisional path — re-cite when built).

1. **`oc-renders-the-orchestrator-agent`** — the prompt is the rendered session-orchestrator, not a
   fork
   - **asserts —** the composition obtains its system prompt from `renderAgentPrompt(store,
     "session-orchestrator")` and passes THAT to the runner — a non-empty prompt carrying the
     orchestrator role; it does NOT hard-code a bespoke orchestrator prompt. (A stubbed `renderAgentPrompt`
     is asserted to have been called with `"session-orchestrator"`.)
   - **covers —** `packages/cli/src/orchestrate.ts` (the render call) *(provisional path)*
2. **`oc-feeds-intent-as-user-prompt`** — the programmatic intent drives the session
   - **asserts —** the composition feeds the caller's programmatic intent to the runner as the
     `userPrompt` — the intent steers the orientation, and the entry is a plain function arg / CLI arg,
     not an HTTP body.
   - **covers —** `packages/cli/src/orchestrate.ts` (the intent plumbing)
3. **`oc-surfaces-proposal-read-only`** — a proposal is surfaced with no act side effect
   - **asserts —** on a successful scripted session the entry returns `{ ok: true, proposal: … }`, and
     no build/PR/verdict path is invoked (the entry holds no signing key, no build runner) — read/propose
     only (ADR-0091).
   - **covers —** `packages/cli/src/orchestrate.ts` (the return path)
4. **`oc-fails-closed-on-dead-session`** — a failed session is an honest failure
   - **asserts —** when the runner reports `{ ok: false, error }`, the entry surfaces that failure
     (never a forged proposal), and the single-session slot is released for the next intent.
   - **covers —** `packages/cli/src/orchestrate.ts` (the fail-closed path)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the Phase-1 composition
as a new module in `packages/cli`, test-first.

- **The new test —** `packages/cli/src/orchestrate.test.ts` (`node:test` + `node:assert/strict`).
  Import `{ orchestrate }` (or the chosen entry name) from `"./orchestrate.js"`. Build an
  `InMemoryStore` + `loadCorpus` for the real seed, and an injected `queryFn` scripted double passed
  through to the runner.
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `orchestrate.ts`
  does not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red). Assert
  the entry renders the real `session-orchestrator` prompt, drives the runner against the real seed +
  `stories/`, and surfaces the scripted proposal read/propose-only.
- **The GREEN —** write `packages/cli/src/orchestrate.ts`: a plain async `orchestrate(args)` that
  (1) renders the prompt via `renderAgentPrompt(store, "session-orchestrator")` (fail-closed if the
  agent is missing — never a silent stub), (2) builds the orientation deps (the `store` + `storiesDir`),
  (3) calls `runHeadlessOrchestrator` (the `@storytree/agent` runner) with the rendered prompt, the
  programmatic intent as `userPrompt`, the orientation tools, and the injectable `queryFn`, and
  (4) returns the surfaced proposal. Keep it a reusable package-level function (Phase 2 reuses it). After
  it, the import resolves, the assertions hold, and the package suite + typecheck stay green.

Rules:

- **Render the agent, never fork it** — the prompt MUST come from `renderAgentPrompt(store,
  "session-orchestrator")` (ADR-0051). The test pins this (`oc-renders-the-orchestrator-agent`).
- **Programmatic intent, no chat endpoint** — the entry is a function / CLI arg; do NOT add an HTTP
  route or SSE stream (Phase 2).
- **Read/propose only** — surface a proposal; hold no signing key, hand in no verdict, trigger no
  build, open no PR (ADR-0091). The single-session guard holds (ADR-0108 decision 6).
- **Keep it reusable at the package level** — a plain async function the CLI command calls, so Phase 2's
  studio worker reuses it, not a CLI-private closure.
