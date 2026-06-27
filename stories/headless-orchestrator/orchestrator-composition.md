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
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (editsExisting: true): orchestrate.ts
# already exists at HEAD (the Phase-1 composition landed #373), so this increment EDITS it rather than
# authoring a net-new file. The leaf authors a NEW regression test (orchestrate-single-session.test.ts)
# that FAILS against current behaviour — a second concurrent orchestrate() is today refused only by a
# GENERIC error (no typed discriminator), so an assertion on a TYPED `refused`/`reason` result is red at
# HEAD — then EDITS orchestrate.ts to add a composition-level single-session guard returning that typed
# result (green). `install: true` + a typecheck wall because orchestrate.ts imports renderAgentPrompt +
# the runner from @storytree/agent + @storytree/library (the proof runs in a fresh worktree — tsx + tsc
# need the lockfile-only install, ADR-0031 §2). Single LITERAL source file (orchestrate.ts, no `*`), so
# the default node:test proof on the one test file is legal — no `proofCommand`. The scope stays within
# packages/drive (ADR-0087: one concrete package per write scope) — the agent-side runner whose
# module-level inFlight guard this surfaces as a typed result is a CONSUMED dependency, not a co-edited file.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
  real:
    testFile: "packages/drive/src/orchestrate-single-session.test.ts"
    sourceFile: "packages/drive/src/orchestrate.ts"
    scope:
      testGlobs: ["packages/drive/src/orchestrate-single-session.test.ts"]
      sourceGlobs: ["packages/drive/src/orchestrate.ts"]
    editsExisting: true
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# The Phase-1 composition + programmatic entry

**Outcome —** A programmatic intent renders the session-orchestrator agent, drives a scripted headless
session against the real seed corpus, and surfaces an orientation/proposal.

**Depends on —** [`headless-session-runner`](headless-session-runner.md) — the composition is the thin
programmatic shell over the runner: it renders the prompt, assembles the orientation deps, and calls
the runner.

> **Proof status (honest) — `proposed`.** Phase 1 LANDED this composition (#373); ADR-0112 then
> relocated it. The composition is the Phase-1 programmatic entry — a thin CLI command, NOT an
> HTTP/chat endpoint (that is Phase 2). It renders the SAME `session-orchestrator` system prompt the
> terminal session uses (`renderAgentPrompt`, `packages/library/src/store/render-agent.ts`, ADR-0051)
> and drives the runner against the real seed corpus. Since ADR-0112 the composition lives in
> `@storytree/drive`; `packages/cli` hosts `run()` + the `orchestrate` command, and the leaf's
> `ClaudeAgentAuthor` stays in `@storytree/agent`.
>
> **Current `--real` increment — the composition-level TYPED single-session guard (contract 5).** The
> single-session BRAKE (ADR-0108 d.6) is NOT unimplemented: it already lives in `runHeadlessOrchestrator`
> (`@storytree/agent`) as a module-level `inFlight` flag, proven by `headless-orchestrator.test.ts`, and
> `orchestrate()` inherits it transitively. What this increment adds is the COMPOSITION-level enforcement
> with a TYPED `{ refused, reason }` result (today the refusal is a generic error a consumer cannot
> distinguish from a hard failure) — read/propose only, no new authority.

## Guidance

**THIS BUILD — the current `--real` increment (edit-existing): the composition-level TYPED single-session
guard.** The single-session BRAKE (ADR-0108 d.6, "one orchestration session at a time") is ALREADY
enforced for `orchestrate()` transitively — `runHeadlessOrchestrator` (`@storytree/agent`) holds a
module-level `inFlight` flag and refuses a second concurrent run. What is MISSING is a COMPOSITION-level,
TYPED refusal: today a concurrent `orchestrate()` returns a GENERIC `{ ok: false, error: "session
in-flight…" }`, indistinguishable from any other failure, so a consumer (the chat surface) cannot tell
"busy, retry" from a hard error. This increment makes `orchestrate()` itself enforce the brake and return
a TYPED result — `{ ok: false, refused: true, reason: "single-session", error }` — the running session
left untouched.

- **EDIT-EXISTING, not net-new.** orchestrate.ts EXISTS; read it, ADD a new failing regression test
  (`packages/drive/src/orchestrate-single-session.test.ts`), then EDIT orchestrate.ts. The red is a
  RUNTIME assertion, never a missing-symbol import.
- **The typed result type stays in `@storytree/drive`** (ADR-0087 — one package per write scope): widen
  `OrchestrateResult` in orchestrate.ts to `HeadlessOrchestratorResult & { refused?: true; reason?:
  "single-session" }` (or an equivalent in-package type). Do NOT edit `@storytree/agent`.
- **The guard fires synchronously at the TOP of `orchestrate()`**, before the `await renderAgentPrompt`:
  if a composition session is already in flight, return the typed refusal immediately; otherwise mark
  in-flight, run, and clear the flag in a `finally`. This composition guard is the authoritative, typed
  brake; the runner's `inFlight` flag remains a lower-level backstop.
- **The RED the spine observes:** the new test starts a first `orchestrate()` whose injected `queryFn`
  BLOCKS on a test-held promise so it stays in-flight, yields control, then awaits a SECOND `orchestrate()`
  and asserts `second.refused === true` and `second.reason === "single-session"`. At HEAD there is no
  typed field → `refused` is `undefined` → red. ASSERT THE TYPED FIELD, never a bare `ok === false`: a
  bare `ok:false` is already green at HEAD (the runner enforces it) and would fail CONFIRM_RED.
- **The GREEN:** after the composition guard is added the typed assertion passes; then unblock the first
  session and assert it STILL completes normally with its proposal (the running session untouched).

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
verdict, triggers no build, opens no PR, lands nothing. The single-session guard (ADR-0108 decision 6) is
enforced AT THE COMPOSITION (contract 5 — a typed `{ refused, reason }` refusal) over the runner's
module-level `inFlight` backstop (one orchestration at a time). Get this wrong — wiring a build/gate/PR
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
6. A second concurrent intent → refused with a TYPED result (`{ refused, reason: "single-session" }`,
   distinguishable from a generic failure), the running orchestration untouched (it completes normally).

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** (`node:test`, the
`@storytree/drive` suite), collaborators stubbed. Contracts 1–4 are PROVEN by `orchestrate.test.ts` (the
Phase-1 composition landed #373). Contract 5 is the current `--real` increment — the composition-level
TYPED single-session guard (`orchestrate-single-session.test.ts`), authored test-first by the gated leaf.

1. **`oc-renders-the-orchestrator-agent`** — the prompt is the rendered session-orchestrator, not a
   fork
   - **asserts —** the composition obtains its system prompt from `renderAgentPrompt(store,
     "session-orchestrator")` and passes THAT to the runner — a non-empty prompt carrying the
     orchestrator role; it does NOT hard-code a bespoke orchestrator prompt. (A stubbed `renderAgentPrompt`
     is asserted to have been called with `"session-orchestrator"`.)
   - **covers —** `packages/drive/src/orchestrate.ts` (the render call) *(provisional path)*
2. **`oc-feeds-intent-as-user-prompt`** — the programmatic intent drives the session
   - **asserts —** the composition feeds the caller's programmatic intent to the runner as the
     `userPrompt` — the intent steers the orientation, and the entry is a plain function arg / CLI arg,
     not an HTTP body.
   - **covers —** `packages/drive/src/orchestrate.ts` (the intent plumbing)
3. **`oc-surfaces-proposal-read-only`** — a proposal is surfaced with no act side effect
   - **asserts —** on a successful scripted session the entry returns `{ ok: true, proposal: … }`, and
     no build/PR/verdict path is invoked (the entry holds no signing key, no build runner) — read/propose
     only (ADR-0091).
   - **covers —** `packages/drive/src/orchestrate.ts` (the return path)
4. **`oc-fails-closed-on-dead-session`** — a failed session is an honest failure
   - **asserts —** when the runner reports `{ ok: false, error }`, the entry surfaces that failure
     (never a forged proposal), and the single-session slot is released for the next intent.
   - **covers —** `packages/drive/src/orchestrate.ts` (the fail-closed path)
5. **`oc-single-session-guard`** — a second concurrent orchestrate() is refused with a TYPED result
   - **asserts —** while one `orchestrate()` session is in flight, a second concurrent call is refused
     with a TYPED result (`{ ok: false, refused: true, reason: "single-session" }`) — distinguishable
     from a generic failure — and the running session is untouched (it completes normally with its
     proposal). The brake (ADR-0108 d.6) is enforced AT THE COMPOSITION, surfacing the runner's
     module-level `inFlight` guard as a typed refusal a consumer can render as "busy, retry" rather than
     a hard error. *(The runner-level guard alone is already proven by
     `packages/agent/src/headless-orchestrator.test.ts`; this contract proves the COMPOSITION enforces it
     AND types it.)*
   - **covers —** `packages/drive/src/orchestrate.ts` (the composition-level single-session guard)
     *(provisional path — re-cite at real `file:line` when built)*

## Guidance — the edit-existing slice that earns the signed verdict

The brownfield rung toward `healthy` (ADR-0057 §3, EDIT-EXISTING): the Phase-1 composition
(`packages/drive/src/orchestrate.ts`) already landed (#373) and is real. This increment EDITS it to add
the composition-level TYPED single-session guard, test-first.

- **The new test —** `packages/drive/src/orchestrate-single-session.test.ts` (`node:test` +
  `node:assert/strict`). Import `{ orchestrate }` from `"./orchestrate.js"`. Build an `InMemoryStore` +
  `loadCorpus` for the real seed. Use the deterministic blocking-`queryFn` pattern (mirroring
  `packages/agent/src/headless-orchestrator.test.ts`): the first `orchestrate()`'s injected `queryFn`
  awaits a test-held promise so it stays in flight; the second `orchestrate()` is awaited while the first
  is blocked; then the first is unblocked and drained.
- **The RED the spine observes (before IMPLEMENT) —** orchestrate.ts EXISTS, so the red is a RUNTIME
  assertion, not module-not-found: assert the second concurrent call returns a TYPED refusal
  (`second.refused === true`, `second.reason === "single-session"`). At HEAD `orchestrate()` has no
  composition guard and no typed field — a concurrent call is refused only by the runner's generic
  `{ ok: false, error: "session in-flight…" }`, so `second.refused` is `undefined` → red. (Asserting a
  bare `ok === false` would be GREEN at HEAD via the runner and fail CONFIRM_RED — assert the TYPED field.)
- **The GREEN —** EDIT `packages/drive/src/orchestrate.ts`: widen `OrchestrateResult` (in-package) to
  carry `refused?: true; reason?: "single-session"`, and add a composition-level guard that fires
  synchronously at the TOP of `orchestrate()` (before `await renderAgentPrompt`): if a session is already
  in flight return the typed refusal; otherwise mark in-flight, run, and clear the flag in a `finally`.
  Then `second.refused === true` holds, the unblocked first session completes normally, and the package
  suite + typecheck stay green.

Rules:

- **Edit, don't fork** — the existing render/runner wiring is untouched; this adds ONLY the guard + the
  typed field. The prompt still comes from `renderAgentPrompt(store, "session-orchestrator")` (ADR-0051).
- **The typed result stays in `@storytree/drive`** — do NOT edit `@storytree/agent` (ADR-0087, one
  package per write scope). The runner's `inFlight` flag remains a lower-level backstop.
- **Assert the TYPED field, never a bare `ok:false`** — the runner already makes a bare `ok:false` green
  at HEAD; the genuine red is the typed discriminator (contract 5, `oc-single-session-guard`).
- **Read/propose only** — surface a proposal / a typed refusal; hold no signing key, hand in no verdict,
  trigger no build, open no PR (ADR-0091).
