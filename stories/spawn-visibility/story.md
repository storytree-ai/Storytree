---
id: "spawn-visibility"
tier: story
title: "A spawn is visible where it happens — the operator SEES the subagent in the chat transcript AND on the forest map (ADR-0137 Phase-3 follow-on)"
outcome: "During a live spawn from the desktop chat, the operator can SEE that a subagent was spawned (a spawn line in the chat transcript) and WHERE it is working (the just-authored story's island appears live on the forest map, and its claim wisp lights) — the spawn is no longer invisible."
status: proposed
proof_mode: UAT
# Per-leg witness (ADR-0106): the offline mechanics legs (the typed spawn trace threaded onto the chat
# stream, the SSE frame carrying it, the frontend geometry that renders the spawn line and triggers the
# live tree reload, the advisory retry that survives a DB cold-start) are machine-witnessed by the
# package + component suites over injected doubles + scripted queues + a slow injected fn. The live
# legs — a REAL desktop spawn in which the operator READS the "🔧 spawning story-author…" line, SEES
# the new island appear, and SEES the fresh claim wisp light — are human-witness (operator-attested,
# ADR-0070 two-stage: the geometry/behaviour is machine-proven, the on-screen appearance human-
# witnessed). The story-level uat_witness is absent → human (the ADR-0040 fail-closed signpost), so the
# machine-driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up.
capabilities: [chat-spawn-trace-events, chat-panel-spawn-render, live-story-island-refresh, claim-wisp-cold-start]
# WHY A NEW STORY, NOT AN EDIT TO chat-subagent-spawn:
#   - chat-subagent-spawn is the SPAWN AUTHORITY story (ADR-0137 Phase 3): its bounded journey is
#     "the chat can SPAWN the right subagent under a held claim, walls intact" — converse → claim →
#     spawn → the human lands. That journey's proof rests on the spawn HAPPENING correctly (fenced
#     writes, claim-first, no verdict back); it does NOT promise the operator can SEE the spawn as it
#     runs. Its five capabilities are landed (signed --real). Grafting "surface the spawn in the chat +
#     light it on the map" onto it would be a SECOND journey on a story that is complete-bar-attestation
#     — the exact precedent chat-subagent-spawn itself invokes for why it is not an edit to
#     headless-orchestrator (a landed story's own invariant must not be reopened to carry new work).
#   - This is a FOLLOW-ON that closes two gaps found in the 2026-07-03 ADR-0137 Phase-3 live UAT walk:
#     the spawn fired, but the operator could not TELL it had. The traces already exist inside
#     spawnStoryAuthor/spawnBuilder (packages/drive/src/spawn-deps.ts ~125–160, onTrace({ type:
#     "spawn_started"|"spawn_finished", … })) but are swallowed by claimGatedSpawn's heartbeat-only
#     onTrace (packages/agent/src/claim-gated-spawn.ts:137 — onTrace(_msg: unknown) bumps the heartbeat
#     and drops the message) and never reach the chat; and the fresh claim wisp is dropped on a DB
#     cold-start by advisory.ts's 4s timeout. Two root causes → two fix arcs, ONE journey.
# THE ONE JOURNEY (journey-principle): the operator converses with the desktop chat, the orchestrator
# spawns (chat-subagent-spawn's authority), and the operator SEES it — in the transcript ("🔧 spawning
# story-author for <id>…" → "✓ story-author finished") AND on the map (the new island appears live, its
# claim wisp lights). Finishing "I can see the spawn in the chat" immediately leads the SAME operator to
# need "and I can see where it's working on the map" — one glance, one conversation, one loop. They are
# one journey, one story. The splitting-rule's triggers do not fire: the outcome is one sentence (the
# operator SEES the spawn where it happens — transcript + map), and the proof is one coherent
# walkthrough (converse → spawn → read the line → watch the island bloom and the wisp light).
#
# Story-level edges (ADR-0010 §4 — consumed cross-story seams, encoded here as frontmatter depends_on;
# the import/consumption evidence at file:line is in "Cross-story boundary" below):
#   - chat-subagent-spawn — the SPAWN AUTHORITY this story makes visible: it owns the traces
#                     (packages/drive/src/spawn-deps.ts's onTrace({ type: "spawn_started"|
#                     "spawn_finished", role, unitId, ok })) and the claim gate that swallows them
#                     (packages/agent/src/claim-gated-spawn.ts). This story TYPES those traces and
#                     threads them out as additive ChatStreamEvents — additive edits to files that
#                     story's capabilities own (physically in agent/drive), never a fork of the spawn.
#   - chat-drive-bridge — owns the chat SSE mount + the ChatPanel/api.ts chat seam this story extends:
#                     the ChatStreamEvent union threaded through startChatStream (packages/drive/src/
#                     chat-stream.ts), the generic SSE forwarder (apps/desktop/src/backend/
#                     chat-sse-mount.ts:307), and the ChatEvent union + isChatEvent guard + ChatPanel
#                     render (apps/studio/src/api.ts, ChatPanel.tsx). Additive: a new non-terminal
#                     `spawn` variant beside the existing delta/done/error/refused frames.
#   - desktop-build-mount — owns the sidecar surface the chat + the advisory overlay reads ship on
#                     (apps/desktop) and the build worker the builder spawn traces flow from. The
#                     advisory cold-start fix lives in apps/desktop/src/backend/advisory.ts, consumed by
#                     backend-entry.ts's inFlightClaims overlay read.
#   - wisp-as-story-claim — owns the CLAIM + WISP layer this story's cold-start fix serves: the
#                     work-time claim row inFlightClaims reads and the wisp the forest map lights from
#                     it. This story does not build the wisp; it stops the fresh claim being dropped
#                     before the wisp can light (ADR-0138).
#   - notice-board — the claim PRIMITIVE the inFlightClaims read resolves (ClaimDoc / the work-time
#                     claim store the advisory read races).
#   - desktop — the SURFACE the spawn-visible chat + the live-refreshing map ship on: the Electron
#                     renderer hosts the studio dist (ChatPanel + TreeView + ChatDock), and the sidecar
#                     composes the advisory reader. Operator-attested glue.
#   - library — the work-hierarchy schema the just-authored story renders from when TreeView reloads
#                     (the reloadTree fetch reads the tree the spawned story-author wrote to stories/).
# DIRECTION / NO CYCLE (ADR-0058): this story is a PURE SOURCE NODE — nothing depends on it. Every
# edge flows DOWN toward the roots (spawn-visibility → {chat-subagent-spawn, chat-drive-bridge,
# desktop-build-mount, wisp-as-story-claim, desktop} → … → {notice-board, library}); none of the named
# stories' depends_on lists this story, so the new edges introduce no cycle. In particular
# chat-subagent-spawn is a source node too (nothing depends on it), and this story depends on IT, not
# the reverse — a clean downward edge.
depends_on: [chat-subagent-spawn, chat-drive-bridge, desktop-build-mount, wisp-as-story-claim, notice-board, desktop, library]
# Deciding ADRs (ADR-0037 §2): 137 (PRIMARY — the Phase-3 spawn whose ACTIVITY this surfaces; the walk
# that found the gaps was ADR-0137's live UAT); 70 (two-stage visual proof — the chat spawn line + the
# live island + the lit wisp are machine-proven in geometry, operator-attested in appearance); 138 (the
# claim wisp the cold-start fix serves; §5 the subagent role colours the wisp); 4 (the thin-client wall
# — the studio ChatPanel/ChatDock import no drive/agent code; the spawn frame is a plain-JSON wire
# shape, the reload a plain callback); 33 (the advisory reads are null-on-failure, ADR-0033 — the fix
# keeps that contract, only softens the cold-start budget); 108 (Phase-3 drive authority, the chat as
# session-orchestrator that spawns); 106 (per-leg witness — the machine legs adopt-signed, the live
# legs human-witness).
decisions: [137, 70, 138, 4, 33, 108, 106]
---

# A spawn is visible where it happens — the operator SEES the subagent in the chat AND on the map

**Outcome —** During a live spawn from the desktop chat, the operator can SEE that a subagent was
spawned (a spawn line in the chat transcript) and WHERE it is working (the just-authored story's island
appears live on the forest map, and its claim wisp lights) — the spawn is no longer invisible.

## What this is

This is the **visibility follow-on to `chat-subagent-spawn`** (ADR-0137 Phase 3, spawn authority
landed). That story built the chat's power to spawn the right subagent under a held claim — the
story-author to bring a story in, the builder leaf to drive a change. It proved the spawn HAPPENS
correctly (fenced writes, claim-first, no verdict back). It did NOT make the spawn VISIBLE: during the
**2026-07-03 ADR-0137 Phase-3 live UAT walk** the spawn fired, but the operator **could not tell** it
had. Two root causes surfaced two fix arcs — and they are one journey (converse → spawn → SEE it, in
the chat AND on the map).

**FIX 1 — surface spawn activity in the chat transcript (drive/SSE seam, MACHINE-PROVEN).** The
boundary traces already exist: `packages/drive/src/spawn-deps.ts` (~lines 125–160) fires
`onTrace({ type: "spawn_started" | "spawn_finished", role, unitId, ok })` inside
`spawnStoryAuthor` / `spawnBuilder`. But they are **swallowed** by `claimGatedSpawn`'s heartbeat-only
`onTrace` (`packages/agent/src/claim-gated-spawn.ts:137` — `onTrace(_msg: unknown)` bumps the claim
heartbeat and DROPS the message) and never reach the chat. The fix threads them out as ADDITIVE
`ChatStreamEvent`s:

- A typed `SpawnTrace` union in drive, so both emitter and consumer narrow on it (today `spawn-deps`
  emits untyped object literals into an `onTrace(msg: unknown)` sink).
- `startChatStream` (`packages/drive/src/chat-stream.ts`) wraps the injected `spawn` deps so its
  `onTrace` intercepts `SpawnTrace` messages and pushes a new `ChatStreamSpawnEvent`
  (`{ type: "spawn", phase: "started" | "finished", role, unitId, ok? }`) onto the SAME FIFO queue the
  `delta` events use — interleaved, non-terminal, ordered. Fully additive: absent spawn deps ⇒
  byte-identical to today.
- `createChatSseMount` (`apps/desktop/src/backend/chat-sse-mount.ts:307`) already forwards ANY
  `ChatStreamEvent` generically as an SSE frame — so the new event flows through automatically.
- `apps/studio/src/api.ts` adds the `spawn` variant to the `ChatEvent` union + `isChatEvent` guard
  (wire shape only — the panel imports no drive/agent code, ADR-0004).
- `apps/studio/src/components/ChatPanel.tsx` renders it — "🔧 spawning story-author for `<id>`…" then
  "✓ story-author finished".

The chat panel RENDER (the actual line on screen) is operator-attested (ADR-0070 two-stage: geometry
machine-proven, appearance human-witnessed).

**FIX 2 — make a just-authored story appear live on the map (frontend + backend).**

- **(a) A story the spawn just authored does not appear live.** `TreeView.reloadTree`
  (`apps/studio/src/components/TreeView.tsx:1227`) only runs on mount / crown-refresh / after a build —
  never on a spawn. When a spawn authors a new story (the `ChatPanel` sees a `spawn`-finished event for
  a story-author), a parent (`apps/studio/src/components/ChatDock.tsx`) wires that to
  `TreeView.reloadTree` via a callback — NO drive/agent import; the thin-client wall holds. Frontend
  geometry machine-proven; the island appearing live is operator-attested.
- **(b) The claim wisp never lit even though the claim row existed.** `backend-entry.ts`'s
  `inFlightClaims` (~275–305) reads through the shared advisory reader
  (`apps/desktop/src/backend/advisory.ts`), whose 4s timeout (`timeoutMs ?? 4_000`) DROPS the claim
  read on a DB cold-start (which can far exceed 4s), silently returning null → the fresh claim wisp is
  dropped. The fix gives the claims read a softer budget — a per-read timeout override and/or a
  single retry-once on cold-start — WITHOUT slowing the other four overlay reads (never a blanket
  raise of the shared 4s, which would risk hanging `/api/tree`). CI-provable in
  `apps/desktop/src/backend/advisory.test.ts`. Backend, MACHINE-PROVEN.

It ADHERES TO the existing seams — the delta-FIFO stream, the generic SSE forwarder, the advisory
null-on-failure contract, the thin-client `api` wire shape, the claim-wisp layer — it makes the spawn
VISIBLE through them, never reinvents or bypasses them.

## Honest proof posture — `proposed`, additive, part-machine / part-attested

This spec is authored FIRST, before any implementation, to bound the visibility journey and size the
units; the inner loop builds it (this story authors the work hierarchy only). Every contract below
describes the isolated unit test that proves a leaf; the capability describes the integration test that
proves it against real in-story collaborators; the Story UAT below describes the acceptance walkthrough
that proves the whole "the operator sees the spawn where it happens" journey.

**The walls (encoded in the contracts + the Story UAT — pinned by TESTS, not by prose):**

- **Additive, absent-deps-byte-identical (the §7 scale-down, chat-subagent-spawn's precedent).** A
  chat session with NO spawn deps emits NO `spawn` events — the stream is byte-identical to today's
  delta/done/error/refused surface. Pinned by `cst-no-spawn-events-without-spawn-deps`.
- **The trace is surfaced, the heartbeat still bumps (ADR-0138 §4 preserved).** Threading the trace
  OUT to the chat must NOT stop it bumping the claim heartbeat — a live spawn still never ages out.
  Pinned by `cst-trace-both-surfaces-and-bumps`.
- **The thin-client wall holds (ADR-0004).** The studio `ChatPanel` / `ChatDock` render the `spawn`
  frame and trigger the reload through a plain-JSON wire shape + a plain callback; they import no
  drive/agent/model code (the `modelPathBoundary.test.ts` wall stays green). Pinned across
  `chat-panel-spawn-render` and `live-story-island-refresh`.
- **The advisory contract is preserved — null on failure, never a hang (ADR-0033).** The cold-start
  fix softens ONLY the claims read's budget (a per-read override / one retry); the other four overlay
  reads keep their 4s, and `/api/tree` never hangs. Pinned by
  `cwc-only-the-claims-read-gets-the-softer-budget` + `cwc-still-null-on-genuine-failure`.

Status stays `proposed` for every unit — `healthy` is earned through the prove-it-gate AND the
operator's live-spawn attestation of the on-screen appearance; it is never authored (ADR-0020).

## Capabilities (4)

Listed roots-first (a capability appears after everything it depends on). All four are **proof-wired**
(ADR-0057 — each carries a `proof:` block with a `real:` arm), so they form a dependency-closed,
acyclic set in which every member resolves a `real:` arm — what makes the WHOLE story
story-`real`-buildable (`isStoryBuildable`). The live on-screen appearance (the spawn line read, the
island seen to bloom, the wisp seen to light) is NOT a fifth capability (it has no separate code — it
is the composed surface run live); it is the human-witness Story UAT legs 5–7.

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`chat-spawn-trace-events`](chat-spawn-trace-events.md) | The spawn boundary traces are typed as a `SpawnTrace` union and surfaced out of the swallowing claim gate: `startChatStream` intercepts them and pushes a new non-terminal `ChatStreamSpawnEvent` onto the same FIFO the deltas use — interleaved and ordered — while the trace still bumps the claim heartbeat, and an absent-spawn-deps session emits none. Machine-proven end to end over the injected `queryFn` + scripted spawn double. | — |
| 2 | [`claim-wisp-cold-start`](claim-wisp-cold-start.md) | The advisory reader gains a per-read budget (a timeout override and/or a single retry-once on cold-start) so the `inFlightClaims` read survives a DB cold-start that exceeds 4s and the fresh claim is not dropped — WITHOUT slowing the other four overlay reads or letting `/api/tree` hang. Machine-proven over an injected slow fn. | — |
| 3 | [`chat-panel-spawn-render`](chat-panel-spawn-render.md) | The studio chat surface carries the `spawn` variant on its `ChatEvent` wire union + `isChatEvent` guard and the `ChatPanel` renders it as a spawn line ("🔧 spawning story-author for `<id>`…" → "✓ story-author finished") — geometry/behaviour machine-witnessed over a scripted seam; the on-screen appearance operator-attested (ADR-0070). | `chat-spawn-trace-events` |
| 4 | [`live-story-island-refresh`](live-story-island-refresh.md) | When the chat surface sees a spawn-finished event for a story-author, `ChatDock` invokes a `TreeView.reloadTree` callback so the just-authored story's island appears live on the forest map — geometry/behaviour machine-witnessed (the callback fires on the right event, imports no drive/agent code); the island appearing live operator-attested. | `chat-panel-spawn-render` |

## Dependency graph (will be code-derived)

These are **within-story** edges. Until the code exists they are authored from the intended data-flow;
when the units are built they MUST be re-derived from the real imports/calls between capabilities
(static analysis, ADR-0010 §3) and corrected if the code disagrees. The graph is acyclic;
`chat-spawn-trace-events` and `claim-wisp-cold-start` are independent roots (the transcript arc and the
map-wisp arc; FIX 1 and FIX 2b).

- `chat-panel-spawn-render` → `chat-spawn-trace-events`
  - The panel render consumes the wire shape the trace-events capability produces: the `spawn` frame's
    `{ phase, role, unitId, ok? }` fields arrive over the SSE wire (threaded by capability 1 onto the
    `ChatStreamEvent` → SSE frame chain), so the panel's `ChatEvent` union + render couple directly to
    that frame shape and to nothing deeper in-story.
- `live-story-island-refresh` → `chat-panel-spawn-render`
  - The refresh is the map-side consequence of the panel seeing a spawn frame: the panel/dock observe
    the `spawn`-finished frame (rendered by capability 3) and, only for a story-author finish, invoke
    the reload callback. It couples to the panel's handling of the frame; it owns no stream/wire logic.
- `claim-wisp-cold-start` is an independent root (FIX 2b)
  - The advisory budget fix is backend-only (`apps/desktop/src/backend/advisory.ts`) and shares no
    in-story code with the transcript arc — it serves the SAME journey (the wisp lights so the operator
    sees WHERE the spawn works) but couples to no other capability in this story. It is the second root.

## Cross-story boundary (ADR-0010 §4)

Authored from the intended consumed seams (re-verify against real imports when built). All seven are
CONSUMED, not absorbed — this story owns the VISIBILITY (the typed trace + its threading onto the chat
stream, the panel's spawn-line render, the dock→tree reload callback, the advisory cold-start budget),
never the spawn authority, the SSE mount, the build worker, the claim store, the wisp render, or the
tree schema.

- **`chat-subagent-spawn`** — the spawn authority this story makes visible. The traces this story
  types + surfaces are FIRED by that story's `spawnStoryAuthor` / `spawnBuilder`
  (`packages/drive/src/spawn-deps.ts:130,138,150,152` — `onTrace({ type: "spawn_started" |
  "spawn_finished", role, unitId, ok })`) and SWALLOWED by its claim gate
  (`packages/agent/src/claim-gated-spawn.ts:137` — `onTrace(_msg: unknown)` bumps the heartbeat, drops
  the message). This story TYPES that trace (`SpawnTrace`) and threads it OUT as an additive
  `ChatStreamSpawnEvent`, additive edits to files that story's capabilities own (physically in
  agent/drive), under the "code hosted in another story's package → declare the edge" precedent
  chat-subagent-spawn itself relies on. It does NOT change what a spawn DOES.
- **`chat-drive-bridge`** — the chat seam this story extends. The `ChatStreamEvent` union threaded
  through `startChatStream` (`packages/drive/src/chat-stream.ts:83`, the delta FIFO at :159–208), the
  generic SSE forwarder (`apps/desktop/src/backend/chat-sse-mount.ts:307` — `res.write(data:
  ${JSON.stringify(event)})` for ANY event), and the studio wire shape + render (`apps/studio/src/
  api.ts:88` the `ChatEvent` union / `:91` `isChatEvent`, `apps/studio/src/components/ChatPanel.tsx`).
  This story adds a NEW non-terminal `spawn` variant beside delta/done/error/refused — additive, the
  generic forwarder needs no change.
- **`desktop-build-mount`** — the sidecar surface + build worker the traces flow from. The advisory
  cold-start fix lives in `apps/desktop/src/backend/advisory.ts` (`createAdvisoryReader`, the shared
  overlay reader) consumed by `backend-entry.ts`'s `inFlightClaims` overlay read; the builder spawn's
  traces originate in that story's relocated worker (`spawnBuilderDispatch`). CONSUMED — this story
  softens the advisory budget, it does not own the worker or the sidecar.
- **`wisp-as-story-claim`** — the claim + wisp layer the cold-start fix serves. The work-time claim row
  the `inFlightClaims` read resolves and the wisp the forest map lights from it are that story's; this
  story stops the fresh claim being DROPPED before the wisp can light (the 4s-timeout-on-cold-start
  gap), never renders the wisp itself (witnessing the lit wisp's colour is that story's appearance UAT).
- **`notice-board`** — the claim primitive the `inFlightClaims` read resolves (`ClaimDoc` / the
  work-time claim store the advisory read races, `packages/notice-board/src/claim.ts`).
- **`desktop`** — the surface the spawn-visible chat + the live-refreshing map ship on. The Electron
  renderer hosts the studio dist (`ChatPanel` / `TreeView` / `ChatDock`) and the sidecar composes the
  advisory reader (`backend-entry.ts`) — operator-attested glue, like the rest of that file.
- **`library`** — the work-hierarchy schema the just-authored story renders from when `TreeView`
  reloads: the `reloadTree` fetch reads the tree the spawned story-author wrote to `stories/` (ADR-0039
  disk-canonical). CONSUMED — this story owns no schema and no discovery.

## Story UAT

The integrated **acceptance walkthrough** that proves the whole `spawn-visibility` journey — converse →
spawn → SEE it in the chat AND on the map — meets its outcome end-to-end. Minimal-first (one coherent
journey), defect-driven thereafter. Mocks are forbidden in the consumed seams that CAN run offline: the
trace threading runs the REAL `startChatStream` delta-FIFO over a scripted `queryFn` + a scripted spawn
double; the advisory fix runs the REAL `createAdvisoryReader` over an injected slow fn; the panel/dock
render over the REAL `api` wire shape scripted as a double. Only the SDK `query()` and the live DB
cold-start are scripted/injected offline (ADR-0010 §5); the live spawn walk is the operator-attested
legs.

> **HONEST status — `proposed`, part-machine / part-attested.** Legs 1–4 are automatable by the package
> + component suites (`@storytree/drive` + `apps/desktop` backend + the `studio` vitest suite) over an
> injected `queryFn` + scripted spawn double + an injected slow fn + a scripted `api` seam. Legs 5–7 —
> a REAL desktop spawn in which the operator READS the spawn line, SEES the new island appear, and SEES
> the fresh claim wisp light — are **operator-attested** (ADR-0070 two-stage: the geometry/behaviour is
> machine-proven, the on-screen appearance is human-witnessed; and a live spawn is subscription-billed
> and writes real files, so it is not run on a gate pass), NOT standing tests.
>
> **Per-leg witness (ADR-0106).** Legs 1–4 are `witness: machine`; legs 5–7 are `witness: human`. No
> leg rests `either`. The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed
> signpost), so the machine-driven whole-story UAT node stays withheld; the crown derives from the
> per-leg roll-up.

**Goal —** A desktop chat spawn is VISIBLE where it happens: the operator reads a spawn line in the
transcript as the subagent starts and finishes, and — for a story the spawn just authored — watches
its island appear live on the forest map with its claim wisp lit, without reloading anything.

1. **The spawn trace is surfaced as an ordered chat event and still bumps the heartbeat.**
   _(witness: machine)_ Drive `startChatStream` with a scripted `queryFn` and a scripted spawn double
   that fires `spawn_started` then `spawn_finished`. **Success —** the stream yields two non-terminal
   `spawn` events (`{ type: "spawn", phase: "started"|"finished", role, unitId, ok? }`) in order,
   interleaved with any `delta`s on the SAME FIFO, before the terminal `done`; each trace ALSO bumped
   the claim heartbeat (ADR-0138 §4 preserved); and a session run WITHOUT spawn deps yields NO `spawn`
   events (byte-identical to today).
2. **The advisory claims read survives a DB cold-start.** _(witness: machine)_ Run the advisory reader
   over an injected `inFlightClaims` fn that resolves slower than 4s but under the softened budget.
   **Success —** the claims read returns the claim (not null) because it got the per-read override /
   one retry; the other four overlay reads keep their 4s budget (a slow verdicts/activity/presence read
   still nulls at 4s — `/api/tree` never hangs); and a GENUINELY failing/absent claims read still
   returns null (the ADR-0033 advisory contract intact, never a throw).
3. **The chat panel renders the spawn line off the wire frame.** _(witness: machine)_ Render
   `<ChatPanel/>` given a scripted `api` stream that emits a `spawn` frame (`phase: "started"`, role
   `story-author`) then `phase: "finished"`. **Success —** the panel's `ChatEvent` union + `isChatEvent`
   guard accept the `spawn` frame, the panel renders a "🔧 spawning story-author for `<id>`…" line that
   resolves to "✓ story-author finished", and the thin client imports no drive/agent/model
   (`modelPathBoundary.test.ts` green). (This proves GEOMETRY/BEHAVIOUR; the on-screen look is leg 5.)
4. **A story-author finish triggers a live tree reload.** _(witness: machine)_ Render the dock/panel
   given a `spawn`-finished frame for a `story-author`. **Success —** `ChatDock` invokes the injected
   `reloadTree` callback EXACTLY once for a story-author finish (and NOT for a builder finish, nor for
   `started`), the callback is a plain prop (no drive/agent import), and the reload path is the same
   `reloadTree` the crown-refresh uses (`TreeView.tsx:1227`). (Geometry/behaviour; the island appearing
   live is leg 6.)
5. **Live: the operator READS the spawn line in the transcript.** _(witness: human)_ In the desktop
   app, converse until the orchestrator spawns the story-author. **Success —** a "🔧 spawning
   story-author…" line appears in the conversation as the subagent starts and resolves to a "✓ …
   finished" line — the operator can TELL a spawn happened, live, without inspecting logs.
   *(operator-attested appearance, ADR-0070 — subscription-billed.)*
6. **Live: the just-authored story's island appears on the map.** _(witness: human)_ **Success —** as
   the spawned story-author writes `stories/<id>/` and finishes, the new story's island appears on the
   forest map WITHOUT a manual reload — the operator SEES where the spawn worked. *(operator-attested.)*
7. **Live: the fresh claim wisp lights (even on a cold-start DB).** _(witness: human)_ **Success —**
   the just-taken story claim's wisp lights on the map on the first poll after the spawn, even when the
   DB was cold-started and the claims read took longer than 4s — the wisp is no longer dropped.
   *(operator-attested — exercises the real cold-start the machine leg injects.)*

End state — a desktop chat spawn is VISIBLE in both places the operator looks: the transcript shows the
subagent start and finish, and the map shows the new island and its lit claim wisp, live — the two gaps
the 2026-07-03 Phase-3 walk found are closed, every wall held (additive frames, heartbeat still bumps,
thin-client wall intact, advisory null-on-failure preserved).

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes — the offline legs (1–4)
green under the package + backend + component suites, the live appearance (5–7) operator-attested —
with the capabilities' integration tests and contracts green underneath. The capability/contract
obligations are minimal-to-green (slow growth): the trace threading is an integration test over the
real `startChatStream` FIFO with the SDK `query()` + spawn scripted; the advisory fix is isolatable
over an injected slow fn; the panel render and the reload callback are component/behaviour tests over a
scripted `api` seam (the studio vitest/jsdom convention). The on-screen appearance is the human-witness
UAT leg, never a machine visual verdict (ADR-0070).

**Honest status — `proposed`.** Authored status stays `proposed` everywhere: per ADR-0020, `healthy` is
only ever DERIVED from signed verdicts, never authored. The four capabilities are proof-wired so the
spine can drive their offline suites red→green (`pnpm storytree story build spawn-visibility --real`);
the story's own machine-driven UAT node is WITHHELD (`uat_witness` absent → human, ADR-0040), and the
crown additionally awaits the operator's live-spawn attestation (legs 5–7).

## Open modeling calls (for the owner / the orchestrator)

1. **The `SpawnTrace` union's HOME is `packages/drive` (surfaced, not re-opened).** The trace is
   emitted in `packages/drive/src/spawn-deps.ts` and consumed in `packages/drive/src/chat-stream.ts`,
   so the typed union lives in drive beside them — not in `packages/agent` (the claim gate stays
   trace-agnostic: `claimGatedSpawn`'s `onTrace` still takes `unknown` and bumps the heartbeat; drive
   narrows the `unknown` to `SpawnTrace` on the way OUT). This keeps the agent-side gate a consumed,
   unchanged seam. Surfaced so the boundary is visible; forced by ADR-0112 (drive reaches agent, the
   trace shape it interprets is drive's).
2. **The finer subagent-role → wisp COLOUR is consumed, not built (as in chat-subagent-spawn).** This
   story lights the wisp by not DROPPING the fresh claim; the wisp's colour-by-subagent is
   wisp-as-story-claim's (ADR-0138 §5). If the live island/wisp needs a finer role than the claim
   `intent` carries today, that is a small amend to `notice-board`'s claim schema owned by
   wisp-as-story-claim — flagged, not built here.
3. **The cold-start budget SHAPE (timeout override vs retry-once) is the leaf's call, bounded here.**
   The contract pins the OUTCOME (the claims read survives a >4s cold-start; the other four reads keep
   4s; `/api/tree` never hangs; null-on-genuine-failure preserved), not the mechanism. A per-read
   `timeoutMs` override, a single retry-once, or both, are all acceptable — the leaf chooses the
   minimal one that passes the contracts. Surfaced so the leaf does not over-build (no blanket raise of
   the shared 4s, which would risk hanging `/api/tree`).
