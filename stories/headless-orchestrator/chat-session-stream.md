---
id: "chat-session-stream"
tier: capability
story: headless-orchestrator
title: "The chat surface (Phase 2) — an HTTP intake + SSE route streams an orchestrate-driven session"
outcome: "An HTTP chat intake + SSE route streams an `orchestrate`-driven session's live output to a thin-client chat panel — reusing the Phase-1 composition, read/propose only."
status: proposed
proof_mode: integration-test
depends_on: [orchestrator-composition]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors an
# integration test that imports a NOT-YET-EXISTING symbol from a NEW source file in @storytree/drive
# (red = module-not-found against the source that does not exist at HEAD), then writes that one new
# source file (green). The new module is the streaming adapter over the Phase-1 `orchestrate`
# composition — an SSE-shaped event stream + a chat-message intake — driven with an injected `queryFn`
# scripted double (zero live SDK spend). It lives in @storytree/drive beside orchestrate.ts (the
# studio-build precedent — source physically in drive, capability owned by this story) so BOTH the
# studio worker and the desktop local backend mount the SAME streaming core, not a fork. `install: true`
# + a typecheck wall because it imports the orchestrate composition + the SdkQueryFn seam across the
# package (the proof runs in a fresh worktree — tsx + tsc need the lockfile-only install, ADR-0031 §2).
# The scope stays within packages/drive (ADR-0087: one concrete package per write scope) — the
# agent-side runner it transitively calls is a CONSUMED dependency, not a co-edited file. Single LITERAL
# source file (no `*`), so the default node:test proof on the one test file is legal — no `proofCommand`.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
  real:
    testFile: "packages/drive/src/chat-stream.test.ts"
    sourceFile: "packages/drive/src/chat-stream.ts"
    scope:
      testGlobs: ["packages/drive/src/chat-stream.test.ts"]
      sourceGlobs: ["packages/drive/src/chat-stream.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# The chat surface (Phase 2) — an HTTP intake + SSE route streams an orchestrate-driven session

**Outcome —** An HTTP chat intake + SSE route streams an `orchestrate`-driven session's live output to a
thin-client chat panel — reusing the Phase-1 composition, read/propose only.

**Depends on —** [`orchestrator-composition`](orchestrator-composition.md) — the chat surface is the
streaming HTTP front of the Phase-1 composition: it drives `orchestrate` and forwards its live output to
the client. It owns no loop logic of its own.

> **Proof status (honest) — NOT BUILT, `proposed`.** This is **ADR-0108 Phase 2** (the chat surface),
> authored before implementation. It precedes no green. It REUSES the Phase-1 composition verbatim:
> `orchestrate` (`packages/drive/src/orchestrate.ts`, the real `session-orchestrator` render + headless
> session), which already exists and is real. Phase 2 adds a STREAM + an HTTP intake around it — not a
> new loop, not a forked prompt. The renderer chat PANEL (the thin client) is operator-attested where it
> ships (the `desktop` story's "feels like one app" UAT leg, ADR-0070 / ADR-0113); THIS capability owns
> the provable SSE/intake BACKEND.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the CHAT SESSION STREAM AS A WHOLE — a
chat-message intake that starts an `orchestrate` session and an SSE-shaped event stream that forwards the
session's live output (and a terminal done/error event) to the client. That spans the intake AND the real
`orchestrate` composition producing the output, so it is an integration test against the real composition
(SDK `query()` scripted), not a single isolated assertion.

IT REUSES THE PHASE-1 COMPOSITION, NEVER FORKS IT (ADR-0108 d.2 / the Phase-1 intent): the chat surface
drives `orchestrate({ intent, store, runner, queryFn, ... })` — the SAME composition the Phase-1
programmatic entry and the terminal `orchestrate` command use. It does NOT re-render the prompt, re-wire
the orientation tools, or re-implement the session. It adapts the composition's result into a stream. Get
this wrong — standing up a second orchestration path here — and you have forked the one loop the design
rests on.

ONE STREAMING CORE, MOUNTED BY BOTH SURFACES (the studio-build precedent): the streaming adapter lives in
`@storytree/drive` (beside `orchestrate.ts`), so BOTH consumers mount the SAME core — the studio worker
(ADR-0090, when hosting returns) AND the desktop local backend (ADR-0113, where it ships first). This
capability is OWNED by the headless-orchestrator story while its source sits physically in
`@storytree/drive` (exactly as `orchestrator-composition` owns `orchestrate.ts` in drive). The HTTP
MOUNTING (the `/api/chat` route + the SSE response wiring) is the consuming surface's thin glue (the
desktop's `local-backend-boot`), over THIS streaming core.

THE INTAKE IS HTTP, THE STREAM IS SSE (the Phase-2 surface shape, ADR-0108 d.1): a chat message arrives
as an HTTP intake (a POST body / a function arg the route adapts), and the session's live output is
delivered as a Server-Sent-Events stream (a sequence of typed events ending in a terminal done/error).
The adapter is transport-shaped but transport-agnostic at its core: it yields an async stream of events
the route serialises as SSE — so it stays offline-testable (the test consumes the event stream directly,
no real socket).

READ/PROPOSE ONLY, NO SIGNING (ADR-0091 / the Phase-2 wall): the chat surface streams an orient+propose
session. It holds NO signing key, hands in NO verdict, triggers NO build, opens NO PR, lands NOTHING
(Phases 3–5). Whole-loop authority + the accept-to-land gate are LATER increments — this capability adds
the conversational surface over the read/propose runtime, nothing more. The single-session guard the
composition enforces still holds (one orchestration at a time; a second concurrent chat session is
refused).

THE THIN CLIENT NEVER IMPORTS THE AGENT (ADR-0108 d.1 / ADR-0004): the renderer chat panel sends messages
and renders the stream; it never imports `@storytree/agent` and holds no model path. The agent boundary
is the backend process (the desktop main, ADR-0113 §2) — this capability runs there, behind the SSE
route; the renderer is downstream of the route.

OFFLINE-TESTABLE BY INJECTION: the adapter takes `orchestrate`'s injectable `queryFn` (a scripted double)
and the orientation runner, passed through to the composition — so the intake → session → stream is
proven WITHOUT a live SDK run on every gate pass (ADR-0010 §5). The live chat run (a real subscription
`query()` streaming to a real panel) is the operator-attested leg (the desktop Story UAT / the Phase-1
live-run pattern), not a standing test.

## Integration test

**Goal —** Prove that a chat-message intake starts an `orchestrate` session and streams its live output
as a sequence of SSE-shaped events ending in a terminal done event — reusing the real Phase-1
composition with a scripted `queryFn`, read/propose only, no live SDK and no real socket.

The integration test exercises this capability against its **real in-story collaborator** — the real
`orchestrate` composition (the real `renderAgentPrompt` + the real runner over the real seed corpus) with
an injected `queryFn` scripted double. No stubs within the organism.

The integration test would:

1. Send a chat-message intake (an intent) to the adapter with an injected `queryFn` whose scripted
   session calls an orientation tool then emits a proposal.
2. Consume the adapter's event stream → assert it yields a sequence of typed events carrying the
   session's live output and ending in a terminal DONE event with the surfaced proposal — the SSE shape
   the route serialises.
3. Assert the adapter drove the REAL `orchestrate` composition (the real `session-orchestrator` prompt
   was rendered, the orientation deps assembled over the real seed) — not a forked/bespoke session.
4. Assert no build/PR/verdict side effect occurred (read/propose only, ADR-0091) — the adapter holds no
   signing key and no build runner.
5. A failed session (injected dead/error `queryFn`) → the stream ends in a terminal ERROR event (an
   honest failure), never a forged proposal and never a hung stream.
6. A second concurrent chat session → refused (the single-session guard), the running session's stream
   untouched.

## Contracts (4)

The test-proven leaf behaviours — each one isolated automated test (`node:test`, the `@storytree/drive`
suite), collaborators stubbed. None exist yet; each is the assertion a contract test WILL prove against
the real adapter code once authored (provisional path — re-cite at real `file:line` when built).

1. **`cs-streams-session-output-as-events`** — the session's output is forwarded as a terminating event stream
   - **asserts —** driving the adapter with a scripted session yields a sequence of typed events carrying
     the live output and ending in a terminal DONE event with the proposal — the SSE shape the route
     serialises (no real socket in the test).
   - **covers —** `packages/drive/src/chat-stream.ts` (the stream) *(provisional path)*
2. **`cs-drives-the-real-orchestrate-not-a-fork`** — the adapter reuses the Phase-1 composition
   - **asserts —** the adapter drives `orchestrate` (the real composition) with the intake as the intent
     and the injected `queryFn` passed through — it does NOT re-render the prompt or re-implement the
     session (a stubbed `orchestrate` is asserted to have been called with the intent).
   - **covers —** `packages/drive/src/chat-stream.ts` (the composition reuse)
3. **`cs-read-propose-only`** — no act side effect, no signing
   - **asserts —** on a successful scripted session the adapter surfaces a proposal in its terminal event,
     and no build/PR/verdict path is invoked — the adapter holds no signing key, no build runner
     (read/propose only, ADR-0091).
   - **covers —** `packages/drive/src/chat-stream.ts` (the read/propose boundary)
4. **`cs-fails-closed-and-single-session`** — a dead session ends in an error event; concurrency is refused
   - **asserts —** a dead/error session yields a terminal ERROR event (never a forged proposal, never a
     hung stream), and a second concurrent session is refused (the single-session guard, ADR-0108 d.6),
     the running session untouched.
   - **covers —** `packages/drive/src/chat-stream.ts` (the fail-closed + single-session path)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the chat streaming adapter
as a new module in `@storytree/drive`, test-first.

- **The new test —** `packages/drive/src/chat-stream.test.ts` (`node:test` + `node:assert/strict`).
  Import `{ chatSessionStream }` (or the chosen name) from `"./chat-stream.js"`. Build an `InMemoryStore`
  + `loadCorpus` for the real seed and an injected `queryFn` scripted double passed through to
  `orchestrate`.
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `chat-stream.ts` does
  not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red). Assert the
  event stream, the real-`orchestrate` reuse, the read/propose boundary, and the fail-closed +
  single-session path.
- **The GREEN —** write `packages/drive/src/chat-stream.ts`: an adapter that takes a chat intake (intent)
  + the injectable `queryFn`/runner, drives `orchestrate`, and yields an async stream of typed events
  (live output + a terminal done/error) the consuming route serialises as SSE. Reuse `orchestrate`
  verbatim; hold no signing key, no build runner; enforce the single-session guard. After it, the import
  resolves, the assertions hold, and the package suite + typecheck stay green. The HTTP mounting (the
  `/api/chat` route + the SSE response) is the consuming surface's glue (the desktop's `local-backend-boot`),
  over this core.

Rules:

- **Reuse `orchestrate`, never fork it** — the adapter drives the real Phase-1 composition (ADR-0108 d.2).
  The test pins this (`cs-drives-the-real-orchestrate-not-a-fork`).
- **Read/propose only** — surface a proposal in the stream; hold no signing key, hand in no verdict,
  trigger no build, open no PR (ADR-0091). Phases 3–5 are out of scope.
- **Fail closed, never hang** — a dead session ends in a terminal error event; the single-session guard
  holds (ADR-0108 d.6). The test pins this.
- **Transport-agnostic core** — yield an event stream the route serialises as SSE; keep the core
  socket-free so it stays offline-testable.
