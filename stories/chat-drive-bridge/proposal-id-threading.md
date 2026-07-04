---
id: "proposal-id-threading"
tier: capability
story: chat-drive-bridge
title: "Thread the proposed unit id through the composition and onto the stream's terminal done event"
outcome: "The `proposedUnitId` is threaded through the `orchestrate()` composition and surfaced on `startChatStream`'s terminal `done` event (and thereby the SSE wire), reusing the Phase-1/2 chain verbatim."
status: retired
proof_mode: integration-test
depends_on: [proposed-unit-signal]
# RETIRED by ADR-0155 (2026-07-04). The proposedUnitId threading onto ChatStreamDoneEvent / the SSE
# `done` frame this capability built was removed (PR #587): the stream contract no longer carries a
# proposedUnitId because the orchestrator drives rather than proposes-and-waits. The `real:` arm is
# dropped (its test packages/drive/src/proposal-id-threading.test.ts was deleted with the feature), so
# this capability is no longer REAL-buildable. Body kept as history.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
---

# Thread the proposed unit id through the composition and onto the stream's done event

**Outcome —** The `proposedUnitId` is threaded through the `orchestrate()` composition and surfaced on
`startChatStream`'s terminal `done` event (and thereby the SSE wire), reusing the Phase-1/2 chain
verbatim.

**Depends on —** [`proposed-unit-signal`](proposed-unit-signal.md) — the value threaded here is the
typed `proposedUnitId` that capability captures on `HeadlessOrchestratorResult`. This capability carries
it the rest of the way to the client; it produces no id of its own.

> **Proof status (honest) — `proposed`, EDIT-EXISTING additive threading.** This is the second link of
> **ADR-0108 Phase 3's bridge**: the agent now DECLARES a proposed unit id (capability 1), but it stops
> at `HeadlessOrchestratorResult` — `orchestrate()` does not carry it through and `startChatStream`'s
> `done` event does not surface it, so the id never reaches the client and nothing can dispatch a build.
> This capability threads the field additively: `OrchestrateResult` carries `proposedUnitId` through,
> and `ChatStreamDoneEvent` surfaces it — so the SSE wire (`createChatSseMount` serialises the event
> verbatim) delivers a machine-actionable id to the thin client. It REUSES the Phase-1/2 chain
> verbatim — the real `session-orchestrator` render, the real `startChatStream` — adding ONLY the
> carried field, never a forked path.

## Guidance

**THIS BUILD — the current `--real` increment (edit-existing): thread `proposedUnitId` through
`orchestrate` → the `done` event.** Today `orchestrate()` returns `OrchestrateResult`
(`HeadlessOrchestratorResult & { refused?, reason? }`) and `startChatStream` yields a
`ChatStreamDoneEvent { type:'done', proposal, costUsd, turns }`. With capability 1 landed,
`HeadlessOrchestratorResult` carries `proposedUnitId?: string` — but `orchestrate` already spreads the
runner result through, so the value is ALREADY present on `OrchestrateResult` transitively. What is
MISSING is surfacing it on the stream's terminal `done` event. This increment widens
`ChatStreamDoneEvent` with `proposedUnitId?: string` and maps it from the orchestrate result.

- **EDIT-EXISTING, not net-new.** `chat-stream.ts` + `orchestrate.ts` EXIST; read them, ADD a new
  failing test (`packages/drive/src/proposal-id-threading.test.ts`), then EDIT. The red is a RUNTIME
  assertion on a missing `done`-event field, never a module-not-found.
- **The threading is ADDITIVE and verbatim-reuse.** `orchestrate` already returns
  `HeadlessOrchestratorResult & {...}`, so `proposedUnitId` flows through it transitively once
  capability 1 widens the result — VERIFY that and, if the spread is structural, the orchestrate edit
  may be a no-op or a one-line explicit carry for clarity. The substantive edit is in `chat-stream.ts`:
  widen `ChatStreamDoneEvent` with `proposedUnitId?: string` and set it from `result.proposedUnitId`
  in the `done` branch (chat-stream.ts ~line 131). Do NOT touch the `error`/`refused` branches (a
  refused/failed session has no proposed id) and do NOT re-render the prompt or re-wire anything.
- **The RED the spine observes:** the new test drives `startChatStream` with an injected `queryFn`
  whose scripted session declares `proposedUnitId` (via the capability-1 `propose_unit` path) and a
  proposal, consumes the stream, and asserts the terminal `done` event's `proposedUnitId` equals the
  declared id. At HEAD `ChatStreamDoneEvent` has no `proposedUnitId` → `undefined` → red. ASSERT THE
  TYPED FIELD on the `done` event, never just that a `done` event arrived (that is green at HEAD and
  fails CONFIRM_RED).
- **The GREEN:** after the field is threaded, the `done` event carries the id; a session that declares
  no id yields a `done` event with `proposedUnitId: undefined` (honest absence); the package suite +
  typecheck stay green.

WHY THIS IS A CAPABILITY (not a contract): its honest proof spans the THREADING AS A WHOLE — the value
leaves the runner result, survives `orchestrate`'s composition, and arrives on `startChatStream`'s
terminal event — exercised against the REAL `orchestrate` composition (the real `renderAgentPrompt` +
the real runner) with the SDK `query()` scripted. That crosses the composition AND the stream adapter,
so it is an integration test against the real in-story collaborator, not a single isolated assertion.

REUSES THE PHASE-1/2 CHAIN, NEVER FORKS IT (ADR-0108 d.2 / the chat-session-stream invariant): the test
drives the REAL `orchestrate` (the real `session-orchestrator` render) and the REAL `startChatStream`.
This capability adds ONLY a carried field; it does not re-render the prompt, re-wire the orientation
tools, or stand up a second streaming path. Get this wrong — re-implementing the stream to inject the
id — and you have forked the one streaming core both surfaces mount.

READ/PROPOSE ONLY (ADR-0091): threading the proposed id changes nothing about authority — the stream
still surfaces a PROPOSAL (now with a machine-actionable id attached), holds no signing key, hands in
no verdict, triggers no build. The id is a PROPOSAL the human later accepts (capability 4), never a
build this capability triggers.

OFFLINE-TESTABLE BY INJECTION: the test injects `orchestrate`'s `queryFn` scripted double (passed
through `startChatStream`), so the threading is proven WITHOUT a live SDK run on every gate pass
(ADR-0010 §5). The live run is the story's operator-attested leg.

## Integration test

**Goal —** Prove that a proposed unit id declared by the session survives `orchestrate()` and is
surfaced on `startChatStream`'s terminal `done` event — reusing the real Phase-1/2 chain with a scripted
`queryFn`, read/propose only.

The integration test exercises this capability against its **real in-story collaborator** — the real
`orchestrate` composition (the real `renderAgentPrompt` + the real runner over the real seed corpus)
and the real `startChatStream` — with an injected `queryFn` scripted double. No stubs within the
organism.

The integration test would:

1. Drive `startChatStream` with an injected `queryFn` whose scripted session declares a proposed unit
   id (the capability-1 `propose_unit` tool path) and emits a proposal.
2. Consume the event stream → assert the terminal `done` event carries `proposedUnitId` equal to the
   declared id, alongside `proposal` / `costUsd` / `turns` (the existing fields, unbroken).
3. Assert the adapter drove the REAL `orchestrate` composition (the real `session-orchestrator` prompt
   was rendered) — not a forked/bespoke session.
4. A session that declares NO proposed id → the terminal `done` event carries `proposedUnitId:
   undefined` (honest absence), the proposal still surfaced.
5. A failed session (a dead session) → a terminal `error` event with NO `proposedUnitId` (the field is
   on `done` only); a single-session refusal → a terminal `refused` event with no id — the threading
   touches only the success path.
6. Assert no build/PR/verdict side effect occurred (read/propose only, ADR-0091) — the adapter holds no
   signing key and no build runner; the id is a proposal, not a dispatch.

## Contracts (3)

The test-proven leaf behaviours — each one assertion in the `@storytree/drive` suite (`node:test`),
exercised against the real `orchestrate` composition with an injected `queryFn` scripted double.

1. **`pit-done-event-carries-proposed-id`** — the declared id reaches the terminal `done` event
   - **asserts —** when the scripted session declares a proposed unit id, `startChatStream`'s terminal
     `done` event carries `proposedUnitId` equal to that id — the field the SSE wire serialises to the
     client. The existing `proposal` / `costUsd` / `turns` fields are still present (unbroken).
   - **covers —** `packages/drive/src/chat-stream.ts` (the `done` branch + `ChatStreamDoneEvent`) +
     `packages/drive/src/orchestrate.ts` (the carried result) *(provisional paths)*
2. **`pit-absent-id-is-undefined-on-done`** — no declaration → no id on the wire
   - **asserts —** a session that declares no proposed unit id yields a `done` event with
     `proposedUnitId: undefined` (honest absence, no forged/default id), the proposal still surfaced.
   - **covers —** `packages/drive/src/chat-stream.ts` (the `done` mapping)
3. **`pit-id-only-on-success-path`** — error/refused carry no id
   - **asserts —** a dead/error session yields a terminal `error` event and a single-session refusal a
     terminal `refused` event, NEITHER carrying `proposedUnitId` — the threading touches the success
     (`done`) path only, never inventing an id for a session that produced no proposal.
   - **covers —** `packages/drive/src/chat-stream.ts` (the `error`/`refused` branches, unchanged)

## Guidance — the edit-existing slice that earns the signed verdict

The brownfield rung toward `healthy` (ADR-0057 §3, EDIT-EXISTING): `orchestrate.ts` + `chat-stream.ts`
already landed (ADR-0108 Phase 1/2) and are real. This increment EDITS them to thread `proposedUnitId`
onto the terminal `done` event, test-first.

- **The new test —** `packages/drive/src/proposal-id-threading.test.ts` (`node:test` +
  `node:assert/strict`). Import `{ startChatStream }` from `"./chat-stream.js"`. Build an
  `InMemoryStore` + `loadCorpus` for the real seed. Inject a `queryFn` scripted double (passed through
  to `orchestrate`) whose session declares a proposed unit id (the capability-1 path) — the SAME
  scripted-session pattern `chat-stream.test.ts` already uses, extended to declare an id. NO real SDK.
- **The RED the spine observed (before IMPLEMENT) —** the files EXIST, so the red is a RUNTIME
  assertion: assert the terminal `done` event's `proposedUnitId` equals the declared id. At HEAD
  `ChatStreamDoneEvent` has no such field → `undefined` → red. (Asserting "a `done` event arrived"
  would be GREEN at HEAD and fail CONFIRM_RED — assert the TYPED field.)
- **The GREEN —** widen `ChatStreamDoneEvent` (in `chat-stream.ts`) with `proposedUnitId?: string` and
  set it from the orchestrate result in the `done` branch; verify `OrchestrateResult` already carries
  the field transitively (capability 1 widened `HeadlessOrchestratorResult`) and add an explicit carry
  only if the spread does not cover it. Then the typed assertion holds; the absence + error/refused
  cases stay clean; the package suite + typecheck stay green.

Rules:

- **Edit, don't fork** — the real `orchestrate`/`startChatStream` chain is untouched except for the
  additive carried field. The three terminal event types still work as before (`pit-id-only-on-success-path`).
- **Additive, success-path only** — `proposedUnitId` rides the `done` event only; `error`/`refused`
  carry no id. Do not invent an id for a session that produced no proposal.
- **Read/propose only** — the threaded id is a PROPOSAL; hold no signing key, hand in no verdict,
  trigger no build (ADR-0091). The dispatch is capability 3; the accept is capability 4.
- **Stay in `@storytree/drive`** — the write scope is one package (ADR-0087). The agent-side result
  field (capability 1) is a CONSUMED dependency; do NOT edit `@storytree/agent` here.
