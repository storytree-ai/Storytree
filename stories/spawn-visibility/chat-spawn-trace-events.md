---
id: "chat-spawn-trace-events"
tier: capability
story: spawn-visibility
title: "Chat spawn-trace events — type the spawn trace and thread it onto the chat stream as an additive, ordered event"
outcome: "The spawn boundary traces are typed as a `SpawnTrace` union and surfaced out of the swallowing claim gate: `startChatStream` intercepts them and pushes a new non-terminal `ChatStreamSpawnEvent` onto the same FIFO the deltas use — interleaved and ordered — while the trace still bumps the claim heartbeat, and an absent-spawn-deps session emits none."
# RETIRED with the spawn-visibility story (ADR-0174 + ADR-0175, owner-directed 2026-07-17): the chat spawn
# this made visible is retired with chat-subagent-spawn (interactive orchestrator chat retired for an
# embedded terminal running real Claude Code; spawn/landing do not go to app-guide). Retired in place; body
# kept as history. The `real:` arm is dropped, so this capability is no longer REAL-buildable
# (buildableNodeIds keys on proof.real) — packages/cli/src/node-build.test.ts's REAL-buildable snapshot is
# updated in this pass.
status: retired
proof_mode: integration-test
depends_on: []
decisions: [137, 138, 112, 4]
# Node-borne proof config (ADR-0057 keystone). EDIT-EXISTING (editsExisting: true): the leaf adds a NEW
# typed `SpawnTrace` union (a new small module, e.g. packages/drive/src/spawn-trace.ts, or exported
# from spawn-deps.ts) and EDITS chat-stream.ts (owned by chat-drive-bridge, physically in
# @storytree/drive — edited here additively under the declared edge) to add a `ChatStreamSpawnEvent`
# to the ChatStreamEvent union and to wrap the injected `spawn` deps so their onTrace intercepts
# SpawnTrace messages and pushes a `spawn` event onto the delta FIFO. spawn-deps.ts is edited to emit
# the TYPED trace (the onTrace object literals gain the SpawnTrace type). The leaf authors a NEW
# failing test driving startChatStream with a scripted spawn double over a scripted queryFn — RED at
# HEAD as a RUNTIME red (the stream yields NO spawn events; the assertion for two ordered `spawn`
# frames fails at runtime — never a type-only red), GREEN after the union widening + the onTrace
# interception. A broad (>1-file) edits-existing source scope REQUIRES a suite proofCommand — run the
# @storytree/drive suite. `install: true` + a typecheck wall (imports across @storytree/drive's deps;
# fresh worktree, ADR-0031 §2). Scope stays within packages/drive (ADR-0087) — the agent-side claim
# gate (claim-gated-spawn.ts) stays trace-agnostic (onTrace: unknown), a CONSUMED dependency not
# co-edited; drive narrows the unknown to SpawnTrace on the way out.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
# The `real:` arm was dropped on retirement (explorer-onboarding-arc inc1 / ADR-0175 companion) — see the
# RETIRED note above. proof.command + proof.scope are kept as history.
---

# Chat spawn-trace events — type the trace, thread it onto the chat stream

**Outcome —** The spawn boundary traces are typed as a `SpawnTrace` union and surfaced out of the
swallowing claim gate: `startChatStream` intercepts them and pushes a new non-terminal
`ChatStreamSpawnEvent` onto the same FIFO the deltas use — interleaved and ordered — while the trace
still bumps the claim heartbeat, and an absent-spawn-deps session emits none.

**Depends on —** nothing in-story (a root — the transcript arc's foundation, FIX 1). Cross-story it
consumes `chat-subagent-spawn`'s traces (`spawnStoryAuthor`/`spawnBuilder` in
`packages/drive/src/spawn-deps.ts`, fired into the claim gate's `onTrace`) and `chat-drive-bridge`'s
stream (`startChatStream` + the `ChatStreamEvent` union + the delta FIFO,
`packages/drive/src/chat-stream.ts`).

> **Proof status (honest) — `proposed`, EDIT-EXISTING additive.** The traces ALREADY FIRE — this is
> the missing wire between "the spawn emits a trace" and "the chat shows it." Today
> `spawn-deps.ts` emits `onTrace({ type: "spawn_started"|"spawn_finished", role, unitId, ok })` into
> `claimGatedSpawn`'s `onTrace(_msg: unknown)` (`claim-gated-spawn.ts:137`), which bumps the heartbeat
> and DROPS the message. This capability TYPES that trace and threads it OUT as a new non-terminal
> `ChatStreamEvent`, additively — the heartbeat bump is preserved. Status stays `proposed` — `healthy`
> is only ever DERIVED from signed verdicts (ADR-0020), never authored.

## Guidance

TYPE THE TRACE, NARROW ON THE WAY OUT (ADR-0112): today the trace is an untyped object literal into an
`onTrace(msg: unknown)` sink. Introduce a typed `SpawnTrace` union
(`{ type: "spawn_started"; role; unitId } | { type: "spawn_finished"; role; unitId; ok }`) so BOTH the
emitter (`spawn-deps.ts`) and the consumer (`chat-stream.ts`) narrow on it. The `SpawnTrace` home is
`packages/drive` (beside its emitter + consumer) — the agent-side `claimGatedSpawn` stays
trace-AGNOSTIC (`onTrace: (msg: unknown) => void`, unchanged): it bumps the heartbeat off ANY signal
and never needs to know the shape. Drive narrows the `unknown` back to `SpawnTrace` when it intercepts
it. Get this wrong — typing the gate — and you couple the agent seam to a drive concept it should not
know (ADR-0112: drive reaches agent, not the reverse).

ADDITIVE, ABSENT-DEPS-BYTE-IDENTICAL (the §7 scale-down, chat-subagent-spawn's precedent): the
`spawn` interception is wired ONLY when `startChatStream` is called WITH `spawn` deps. Absent spawn
deps → NO `spawn` events, the stream byte-identical to today's delta/done/error/refused surface. The
wrap goes around the INJECTED `spawn` deps' `onTrace` path (the deps `startChatStream` forwards to
`orchestrate`) — a session with no spawn deps has no spawn handlers, so no trace fires, so no event.

ONE FIFO, ORDERED, NON-TERMINAL (the delta-bridge discipline, `chat-stream.ts:159–208`): the `spawn`
event rides the SAME single FIFO queue the `delta` events use — push it on the queue and `signal()`,
exactly as `onDelta` does. It is NON-TERMINAL: zero-or-more `spawn`/`delta` events interleave in
arrival order, then exactly one terminal `done`/`error`/`refused`. Do NOT add a second queue or a
second drain loop — reuse the one that already guarantees no-lost-delta ordering (the buffered-push +
single-slot-wake pattern). A `spawn_started`, some `delta`s, a `spawn_finished`, then `done` must
arrive in that order.

THE HEARTBEAT STILL BUMPS (ADR-0138 §4 — the wall that must not regress): surfacing the trace OUT to
the chat must NOT stop it bumping the claim heartbeat. `claimGatedSpawn` still receives every trace on
its `onTrace` and still calls `bumpHeartbeat` — the drive-side wrap is ADDITIONAL (it observes the same
trace stream), never a replacement that steals the signal. A live spawn must still never age into
stale-reclaim while the transcript shows it running.

## Integration test

**Goal —** Prove that with spawn deps present, a spawn double firing `spawn_started` then
`spawn_finished` yields two ordered non-terminal `spawn` events on the stream, interleaved with deltas,
before the terminal `done`; that each trace ALSO bumped the claim heartbeat; and that WITHOUT spawn
deps the stream yields no `spawn` events — offline, over the real `startChatStream` FIFO with a scripted
`queryFn` + a scripted spawn double.

Exercised against its **real in-story collaborators** — the real `startChatStream` delta-FIFO and the
real `orchestrate` chain; the SDK `query()` scripted and the `spawn` deps injected as a recording
double (a structural `SpawnSurfaceDeps` whose `spawnStoryAuthor`/`spawnBuilder` fire the traces and
record heartbeat bumps), per ADR-0010 §5.

The integration test would:

1. Drive `startChatStream` WITH a scripted `queryFn` (whose session invokes `spawn_story_author`) and a
   spawn double that, when its handler runs, fires `onTrace({ type: "spawn_started", … })` then
   `onTrace({ type: "spawn_finished", …, ok: true })` → collect the yielded events; assert exactly two
   `spawn` events (`phase: "started"` then `"finished"`, carrying `role`/`unitId`/`ok`) appear, in
   order, before the terminal `done`, interleaved correctly with any `delta`s.
2. Assert each fired trace ALSO bumped the claim heartbeat (the recording double's `bumpHeartbeat`
   count) — the ADR-0138 §4 signal is preserved, not stolen.
3. Drive `startChatStream` WITHOUT spawn deps → assert NO `spawn` event is yielded (byte-identical to
   today's surface).

## Contracts (3)

1. **`cst-spawn-trace-surfaces-as-ordered-event`** — a fired trace becomes an ordered non-terminal
   `spawn` event
   - **asserts —** with spawn deps present, a spawn double firing `spawn_started` then `spawn_finished`
     causes `startChatStream` to yield exactly two `ChatStreamSpawnEvent`s
     (`{ type: "spawn", phase: "started"|"finished", role, unitId, ok? }`) in that order, on the SAME
     FIFO the deltas use, interleaved with any deltas, before the single terminal event — the trace is
     typed as `SpawnTrace` and narrowed on the way out (never an untyped passthrough).
   - **covers —** `packages/drive/src/chat-stream.ts` (the `spawn` interception + FIFO push) +
     `packages/drive/src/spawn-trace.ts` (the `SpawnTrace` union)
   - **proven by —** `packages/drive/src/chat-spawn-trace.test.ts` (net-new, offline, scripted
     `queryFn` + spawn double).
2. **`cst-trace-both-surfaces-and-bumps`** — surfacing the trace does not steal the heartbeat
   - **asserts —** each trace fired during the spawned run BOTH yields a `spawn` event on the stream
     AND bumps the claim heartbeat through the gate's store (`claimGatedSpawn`'s `onTrace` →
     `bumpHeartbeat`, unchanged) — the drive-side interception is additional, never a replacement; a
     live spawn still never ages into stale-reclaim (ADR-0138 §4).
   - **covers —** `packages/drive/src/chat-stream.ts` (the additive wrap around the deps' trace path)
   - **proven by —** `packages/drive/src/chat-spawn-trace.test.ts`.
3. **`cst-no-spawn-events-without-spawn-deps`** — additive, absent-deps-byte-identical
   - **asserts —** `startChatStream` called WITHOUT `spawn` deps yields NO `spawn` events — the stream
     is byte-identical to today's delta/done/error/refused surface (the §7 scale-down: no spawn deps,
     no spawn handlers, no trace, no event) — so every existing chat-stream test stays green.
   - **covers —** `packages/drive/src/chat-stream.ts` (the deps-gated interception)
   - **proven by —** `packages/drive/src/chat-spawn-trace.test.ts`.
