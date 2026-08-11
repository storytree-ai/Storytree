---
id: "spawn-visibility"
tier: story
title: "A spawn is visible where it happens — the operator SEES the subagent in the chat transcript AND on the forest map (ADR-0137 Phase-3 follow-on)"
outcome: "During a live spawn from the desktop chat, the operator can SEE that a subagent was spawned (a spawn line in the chat transcript) and WHERE it is working (the just-authored story's island appears live on the forest map, and its claim wisp lights) — the spawn is no longer invisible."
# RETIRED by ADR-0174 + ADR-0175 (companion reconcile, owner-directed 2026-07-17 — explorer-onboarding-arc
# inc 1). This is the visibility follow-on to `chat-subagent-spawn`: it surfaced the chat's spawn activity
# in the transcript + on the map. With chat-subagent-spawn retired (the in-app interactive orchestrator
# chat retired for an embedded terminal running real Claude Code — ADR-0174; spawn/landing do not go to
# app-guide — ADR-0175), there is no chat spawn to make visible, so this follow-on is moot and retires with
# it, in place (chat-drive-bridge / scoped-glue-actuator precedent). Body kept as history; the capability
# files flip to `status: retired`. NOT retired: `wisp-as-story-claim` (the claim ledger / map wisps stay
# load-bearing for terminal Claude Code via the noticeboard).
# COMPANION CLEANUP: LANDED — verified 2026-07-26, this comment previously described it as still
# pending. The caps' `real:` arms ARE dropped; packages/cli/src/node-build.test.ts's REAL-buildable
# snapshot now carries only a comment recording their removal (search the story id; the line numbers
# this note used to cite had already rotted by 2026-08-08); and repo-manifest.json's
# hostedStories.register no longer lists this story (zero hits).
# CODE UNMOUNT: ALSO LANDED — corrected in place 2026-08-08. This line read "No code unmount was done
# (ADR-0175 item F) — the implementation is still mounted and its suites are still green", which was true
# on 2026-07-26 and went false five days later. ADR-0175's execution-status block records "SPAWN — DONE
# (2026-07-31)", and it names this story's own surface among the deletions: the `ChatStreamSpawnEvent`
# frame that carried the boundary traces out — i.e. `chat-spawn-trace-events` — went with the spawn
# thread, held gone by `apps/desktop/src/backend/spawn-surface-retired.test.ts`. Verified at file level
# on 2026-08-08, not taken from the prose. Still live and NOT this story's: the studio client's `spawn`
# variant on its `ChatEvent` wire union, which ADR-0175 assigns to `app-guide`, not to this retirement.
# ORIGINAL status note — status: proposed = ADR-0097 "adoption underway". The four capabilities LANDED in PR #567 with passing
# real-arm tests across three offline suites, but that merge ran through DB-free CI, so the prove-it-gate
# never signed a `--real --store pg` verdict — it was BROWNFIELD (built, tested, gate never drove it).
# `storytree adopt spawn-visibility` observe-and-signed the `## Reliability Gates` below + the four
# machine UAT legs and flipped mapped → proposed; NOT a `--real` build (the green base had no red to drive).
status: retired
proof_mode: UAT
# Per-leg witness (ADR-0106) — RE-ADJUDICATED 2026-07-26 (owner-directed corpus-wide pass, ADR-0209 D8,
# arc model-uat-promotion). Then 6 machine / 1 human (was 4 machine / 3 human). NARROWED 2026-08-11
# (ADR-0348 D6): the one human leg — the spawn line's LEGIBILITY — is DELETED as a user EXPERIENCE
# rather than a user ACCEPTANCE claim, leaving 6 machine / 0 human; the intent and the record that it
# was never walkable are carried under "The spawn line's legibility".
#   - Legs 1–4 (machine, unchanged): the typed spawn trace threaded onto the chat stream, the advisory
#     read surviving a cold-start, the panel's spawn-line geometry, the dock→tree reload callback —
#     machine-witnessed by the package + component suites over injected doubles + a slow injected fn.
#   - Legs 6 and 7 CONVERTED human → machine. Both success conditions are DOM/data assertions with a
#     compiler (a node for a known story id is present in the rendered map; a wisp is present for the
#     just-taken claim). They were human only because no harness drives them end-to-end, and the old
#     prose's own justification for leg 7 — "exercises the REAL cold-start the machine leg injects" —
#     is a fidelity/harness argument, not a judgment gap. `human-witness-is-a-judgment-gap-not-cost`
#     puts not-yet-harnessed on the machine rung. Neither carries a `proof-gate:` (none of the three
#     declared gates covers the end-to-end assertion), so per ADR-0209 §6 both return to UNSTAMPED —
#     correct and honest, not green; the owner signs nothing for them.
#   - Leg 5 STAYS human, narrowed, on the NO-COMPILER basis: the strings/order/arrival of the spawn line
#     are leg 3's compiled business; what has no compiler is whether the line READS as "a subagent is
#     working right now" (ADR-0070 stage-2 appearance). The live spawn's subscription spend is recorded
#     as a SECOND and DISTINCT basis (a cost/blast-radius reason not to run it on a gate pass), never
#     folded into the irreducibility claim.
# The story-level uat_witness is absent → human (the ADR-0040 fail-closed signpost), so the
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
#   (chat-drive-bridge — RETIRED (ADR-0155); stale edge dropped, 2026-07-05 map-health cleanup. The
#                     chat seam this story extends lives on with other stories: startChatStream /
#                     the ChatStreamEvent union (packages/drive/src/chat-stream.ts) with
#                     headless-orchestrator's chat-session-stream (reached via chat-subagent-spawn),
#                     the generic SSE forwarder with desktop's chat-sse-mount, and the ChatEvent union
#                     + ChatPanel render with studio's chat-panel (both reached via
#                     desktop-build-mount → desktop). Still additive: a new non-terminal `spawn`
#                     variant beside the existing delta/done/error/refused frames.)
#   - agent         — the trace-threading seam's agent-side types: the chat-stream seam this story
#                     extends imports @storytree/agent directly (SdkQueryFn / OrientationRunner /
#                     LandingSurfaceDeps, packages/drive/src/chat-stream.ts:29), and the swallowing
#                     gate the traces are lifted past lives in packages/agent/src/claim-gated-spawn.ts
#                     — a real code import the ADR-0115 drift report surfaced as "backed but
#                     undeclared: agent"; declared here to keep the edge honest.
#   - desktop-build-mount — owns the sidecar surface the chat + the advisory overlay reads ship on
#                     (apps/desktop) and the build worker the builder spawn traces flow from. The
#                     advisory cold-start fix lives in apps/desktop/src/backend/advisory.ts, consumed by
#                     backend-entry.ts's inFlightClaims overlay read.
#   (wisp-as-story-claim — the CLAIM + WISP layer this story's cold-start fix SERVES — is an outcome
#                     served, not a seam consumed directly (no import of and no edit to that story's
#                     files; the wisp render stays that story's): transitive via chat-subagent-spawn's
#                     declared edge, not re-declared here — 2026-07-05 map-health cleanup.)
#   (notice-board  — the claim PRIMITIVE the inFlightClaims read resolves — is consumed by
#                     backend-entry.ts's overlay read (desktop-build-mount's seam), not by this story's
#                     own code: transitive via the declared edges, not re-declared here.)
#   (desktop       — the SURFACE the spawn-visible chat + the live-refreshing map ship on — is reached
#                     via desktop-build-mount → desktop; operator-attested glue with no code unit here,
#                     so the edge is not declared directly.)
#   - library — the work-hierarchy schema the just-authored story renders from when TreeView reloads
#                     (the reloadTree fetch reads the tree the spawned story-author wrote to stories/).
# DIRECTION / NO CYCLE (ADR-0058): this story is a PURE SOURCE NODE — nothing depends on it. Every
# edge flows DOWN toward the roots (spawn-visibility → {chat-subagent-spawn, desktop-build-mount,
# agent, library} → … → {notice-board, library}); none of the named stories' depends_on lists this
# story, so the edges introduce no cycle (agent's only dependency is notice-board, which never reaches
# back here). In particular chat-subagent-spawn is a source node too (nothing depends on it), and this
# story depends on IT, not the reverse — a clean downward edge.
# HOSTED-STORY edges (ADR-0192 landlord rule): the caps' proof-bound sources live inside three other
# stories' territories — apps/studio/src (the ChatPanel spawn render + in-flight glue), packages/drive
# (the chat-spawn trace events), apps/desktop (the cold-start advisory) — so the hosting is declared
# and annotated (hosted seams; still a pure source node, so still no cycle).
depends_on: [chat-subagent-spawn, desktop-build-mount, agent, library, studio, drive-machinery, desktop]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [chat-subagent-spawn, desktop-build-mount, studio, drive-machinery, desktop]
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

> **RETIRED — ADR-0174 + ADR-0175 (companion reconcile, owner-directed 2026-07-17, explorer-onboarding-arc
> inc 1).** This is the visibility follow-on to
> [`chat-subagent-spawn`](../chat-subagent-spawn/story.md) — it surfaced the chat's spawn activity in the
> transcript and lit the just-authored story on the map. With chat-subagent-spawn retired (**ADR-0174**
> retired the in-app *interactive* orchestrator chat for an embedded terminal running real Claude Code;
> **ADR-0175** held spawn/landing do not belong to `app-guide`), there is no chat spawn to make visible —
> so this follow-on is moot and retires with it, IN PLACE (the `chat-drive-bridge` /
> `scoped-glue-actuator` precedent): the body below is kept as history. The code was not unmounted in that
> reconcile, and the thin PR it was deferred to has since LANDED — **ADR-0175** records "SPAWN — DONE
> (2026-07-31)", which took this story's own `ChatStreamSpawnEvent` frame with it. *(Corrected in place
> 2026-08-08; this read "The code is NOT unmounted here (a separate thin PR, ADR-0175)".)* NOT retired:
> [`wisp-as-story-claim`](../wisp-as-story-claim/story.md) — the
> claim ledger / map wisps stay load-bearing for terminal Claude Code via the noticeboard.

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
- `createChatSseMount` (`apps/desktop/src/backend/chat-sse-mount.ts:301`, forwarding loop at :374–376)
  already forwards ANY `ChatStreamEvent` generically as an SSE frame — so the new event flows through
  automatically. *(Anchor corrected 2026-07-26: the export was cited at :307.)*
- `apps/studio/src/api.ts` adds the `spawn` variant to the `ChatEvent` union + `isChatEvent` guard
  (wire shape only — the panel imports no drive/agent code, ADR-0004).
- `apps/studio/src/components/ChatPanel.tsx` renders it — "🔧 spawning story-author for `<id>`…" then
  "✓ story-author finished".

The chat panel RENDER (the actual line on screen) is operator-attested (ADR-0070 two-stage: geometry
machine-proven, appearance human-witnessed).

**FIX 2 — make a just-authored story appear live on the map (frontend + backend).**

- **(a) A story the spawn just authored does not appear live.** `TreeView.reloadTree`
  (`apps/studio/src/components/TreeView.tsx:1518`) only runs on mount / crown-refresh / after a build —
  never on a spawn. When a spawn authors a new story (the `ChatPanel` sees a `spawn`-finished event for
  a story-author), a parent (`apps/studio/src/components/ChatDock.tsx`) wires that to
  `TreeView.reloadTree` via a callback — NO drive/agent import; the thin-client wall holds. Frontend
  geometry machine-proven (leg 4); the island actually appearing after the reload is ALSO machine
  (leg 6, re-adjudicated 2026-07-26) — it is a DOM/data assertion, not a judgment gap.
  *(Anchors corrected 2026-07-26: `reloadTree` was cited at TreeView.tsx:1227; it is at :1518, called
  at :1537 and passed as `onCrownRefresh` at :2594. And `ChatDock` is DORMANT in the shipped app —
  ADR-0174 gave the dock slot to the embedded terminal, ADR-0175 held spawn/landing out of `app-guide`,
  so nothing imports or mounts `<ChatDock>` today; `TreeView.tsx:2561` records this. The wiring exists
  and its component test runs, but the composed path is not live.)*
- **(b) The claim wisp never lit even though the claim row existed.** `backend-entry.ts`'s
  `inFlightClaims` (`apps/desktop/electron/backend-entry.ts:489–491` — anchor corrected 2026-07-26; the
  file is under `electron/`, not `src/backend/`, and the read was cited at ~275–305) reads through the
  shared advisory reader
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
story-`real`-buildable (`isStoryBuildable`). The composed surface run live is NOT a fifth capability
(it has no separate code); it is Story UAT legs 6–7. *(Re-adjudicated 2026-07-26: of the three legs it
was then, only leg 5 — whether the spawn line READS as a spawn happening — was human-witness; legs 6 and
7 assert the presence of a map node and of a wisp: DOM/data claims with a compiler, so `machine`.
ADR-0348 D6 then DELETED leg 5 on 2026-08-11 as experience rather than acceptance, so what remains here
is machine-only. The `real:` arms
were subsequently dropped on retirement, so the story is no longer story-`real`-buildable — see the
frontmatter's companion-cleanup note.)*

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`chat-spawn-trace-events`](chat-spawn-trace-events.md) | The spawn boundary traces are typed as a `SpawnTrace` union and surfaced out of the swallowing claim gate: `startChatStream` intercepts them and pushes a new non-terminal `ChatStreamSpawnEvent` onto the same FIFO the deltas use — interleaved and ordered — while the trace still bumps the claim heartbeat, and an absent-spawn-deps session emits none. Machine-proven end to end over the injected `queryFn` + scripted spawn double. | — |
| 2 | [`claim-wisp-cold-start`](claim-wisp-cold-start.md) | The advisory reader gains a per-read budget (a timeout override and/or a single retry-once on cold-start) so the `inFlightClaims` read survives a DB cold-start that exceeds 4s and the fresh claim is not dropped — WITHOUT slowing the other four overlay reads or letting `/api/tree` hang. Machine-proven over an injected slow fn. | — |
| 3 | [`chat-panel-spawn-render`](chat-panel-spawn-render.md) | The studio chat surface carries the `spawn` variant on its `ChatEvent` wire union + `isChatEvent` guard and the `ChatPanel` renders it as a spawn line ("🔧 spawning story-author for `<id>`…" → "✓ story-author finished") — geometry/behaviour machine-witnessed over a scripted seam; the on-screen appearance operator-attested (ADR-0070). | `chat-spawn-trace-events` |
| 4 | [`live-story-island-refresh`](live-story-island-refresh.md) | When the chat surface sees a spawn-finished event for a story-author, `ChatDock` invokes a `TreeView.reloadTree` callback so the just-authored story's island appears live on the forest map — geometry/behaviour machine-witnessed (the callback fires on the right event, imports no drive/agent code); the island's PRESENCE after the reload also machine (leg 6, re-adjudicated 2026-07-26 — a DOM/data assertion, not a judgment gap). | `chat-panel-spawn-render` |

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

Authored from the intended consumed seams (re-verify against real imports when built). All the seams
are CONSUMED, not absorbed — four as declared `depends_on` edges (chat-subagent-spawn,
desktop-build-mount, agent — the chat-stream seam's direct `@storytree/agent` import — and library);
the chat-drive-bridge seam's owner is RETIRED (ADR-0155) and wisp-as-story-claim / notice-board /
desktop are reached transitively through the declared edges, noted below without being re-declared —
and this story owns the VISIBILITY (the typed trace + its threading onto the chat
stream, the panel's spawn-line render, the dock→tree reload callback, the advisory cold-start budget),
never the spawn authority, the SSE mount, the build worker, the claim store, the wisp render, or the
tree schema.

- **`chat-subagent-spawn`** — the spawn authority this story makes visible. The traces this story
  types + surfaces are FIRED by that story's `spawnStoryAuthor` / `spawnBuilder`
  (`packages/drive/src/spawn-deps.ts:131,139,151,153` — anchors corrected 2026-07-26, each was cited
  one line early — `onTrace({ type: "spawn_started" |
  "spawn_finished", role, unitId, ok })`) and SWALLOWED by its claim gate
  (`packages/agent/src/claim-gated-spawn.ts:137` — `onTrace(_msg: unknown)` bumps the heartbeat, drops
  the message). This story TYPES that trace (`SpawnTrace`) and threads it OUT as an additive
  `ChatStreamSpawnEvent`, additive edits to files that story's capabilities own (physically in
  agent/drive), under the "code hosted in another story's package → declare the edge" precedent
  chat-subagent-spawn itself relies on. It does NOT change what a spawn DOES.
- **`chat-drive-bridge`** *(RETIRED, ADR-0155 — the edge is dropped; the seam lives on with
  headless-orchestrator's `chat-session-stream`, desktop's `chat-sse-mount`, and studio's `chat-panel`,
  all reached through the declared edges)* — the chat seam this story extends. The `ChatStreamEvent` union threaded
  through `startChatStream` (`packages/drive/src/chat-stream.ts:202`, the delta FIFO at :210–213,
  drained at :293–294), the
  generic SSE forwarder (`apps/desktop/src/backend/chat-sse-mount.ts:301`, loop at :374–376 — `res.write(data:
  ${JSON.stringify(event)})` for ANY event), and the studio wire shape + render (`apps/studio/src/
  api.ts:108–113` the `ChatEvent` union / `:116–120` `isChatEvent`, `apps/studio/src/components/ChatPanel.tsx:405–421`).
  *(All five anchors corrected 2026-07-26 — they were cited at chat-stream.ts:83/:159–208,
  chat-sse-mount.ts:307, api.ts:88/:91.)*
  This story adds a NEW non-terminal `spawn` variant beside delta/done/error/refused — additive, the
  generic forwarder needs no change.
- **`desktop-build-mount`** — the sidecar surface + build worker the traces flow from. The advisory
  cold-start fix lives in `apps/desktop/src/backend/advisory.ts` (`createAdvisoryReader`, the shared
  overlay reader) consumed by `backend-entry.ts`'s `inFlightClaims` overlay read; the builder spawn's
  traces originate in that story's relocated worker (`spawnBuilderDispatch`). CONSUMED — this story
  softens the advisory budget, it does not own the worker or the sidecar.
- **`wisp-as-story-claim`** *(transitive — an outcome served, not a seam this story's code consumes
  directly; reached via chat-subagent-spawn's declared edge)* — the claim + wisp layer the cold-start fix serves. The work-time claim row
  the `inFlightClaims` read resolves and the wisp the forest map lights from it are that story's; this
  story stops the fresh claim being DROPPED before the wisp can light (the 4s-timeout-on-cold-start
  gap), never renders the wisp itself (witnessing the lit wisp's colour is that story's appearance UAT).
- **`notice-board`** *(transitive — consumed by `backend-entry.ts`'s overlay read, not by this story's
  own code)* — the claim primitive the `inFlightClaims` read resolves (`ClaimDoc` / the
  work-time claim store the advisory read races, `packages/notice-board/src/claim.ts`).
- **`desktop`** *(transitive — reached via desktop-build-mount's declared `desktop` edge, not a
  declared `depends_on` here)* — the surface the spawn-visible chat + the live-refreshing map ship on. The Electron
  renderer hosts the studio dist (`ChatPanel` / `TreeView` / `ChatDock`) and the sidecar composes the
  advisory reader (`backend-entry.ts`) — operator-attested glue, like the rest of that file.
- **`library`** — the work-hierarchy schema the just-authored story renders from when `TreeView`
  reloads: the `reloadTree` fetch reads the tree the spawned story-author wrote to `stories/` (ADR-0039
  disk-canonical). CONSUMED — this story owns no schema and no discovery.

## UAT Test Criteria

The integrated **acceptance walkthrough** that proves the whole `spawn-visibility` journey — converse →
spawn → SEE it in the chat AND on the map — meets its outcome end-to-end. Minimal-first (one coherent
journey), defect-driven thereafter. Mocks are forbidden in the consumed seams that CAN run offline: the
trace threading runs the REAL `startChatStream` delta-FIFO over a scripted `queryFn` + a scripted spawn
double; the advisory fix runs the REAL `createAdvisoryReader` over an injected slow fn; the panel/dock
render over the REAL `api` wire shape scripted as a double. Only the SDK `query()` and the live DB
cold-start are scripted/injected offline (ADR-0010 §5); the one irreducibly operator-attested leg is
leg 5 (re-adjudicated 2026-07-26 — legs 6 and 7 are machine, unharnessed). *(Updated 2026-08-11: ADR-0348
D6 deleted leg 5, so NO leg here is operator-attested and every surviving leg is `machine`.)*

> **HONEST status — `retired`, part-machine / part-attested.** Legs 1–4 are automatable by the package
> + component suites (`@storytree/drive` + `apps/desktop` backend + the `studio` vitest suite) over an
> injected `queryFn` + scripted spawn double + an injected slow fn + a scripted `api` seam. Legs 6–7 are
> machine-observable but have NO harness and NO bound gate — they stand UNSTAMPED. Leg 5 is
> **operator-attested** and is not a standing test.
>
> **Per-leg witness (ADR-0106) — RE-ADJUDICATED 2026-07-26** (owner-directed corpus-wide pass,
> ADR-0209 D8, arc `model-uat-promotion`). **6 machine / 1 human**, was 4/3.
>
> **NARROWED 2026-08-11 (ADR-0348 D6): the one EXPERIENCE leg is DELETED, so the story is now 6
> machine / 0 human.** It asked whether the spawn line is any GOOD to read, not whether the journey
> achieved its goal — a user EXPERIENCE property, not a user ACCEPTANCE criterion. Its design intent,
> and the record that it was never runnable, are carried under "The spawn line's legibility" above.
> Ordinal 5 is BURNED, not reused, so the surviving legs keep the numbers they have always had and no
> signed verdict or `(proof-gate:)` binding is silently re-pointed — which matters here because legs
> 1–4 carry exact `proof-gate:` bindings to `#gate-1`/`#gate-2`/`#gate-3`.
>
> - Legs 1–4 stay `witness: machine`, each bound to the exact package observe gate that proves it:
>   leg 1 → `spawn-visibility#gate-1`, leg 2 → `#gate-2`, legs 3–4 → `#gate-3`. Ids, positions,
>   witnesses and proof-gate bindings unchanged.
> - **Legs 6 and 7 CONVERTED `human` → `machine`.** Each asserts the PRESENCE of a rendered thing for a
>   known id — a map node for the just-authored story, a wisp for the just-taken claim. Those are
>   DOM/data assertions with a compiler; every step between the triggering frame and the rendered node
>   compiles. They were tagged human because nothing drives them end-to-end, and leg 7's own stated
>   reason ("exercises the REAL cold-start the machine leg injects") is a fidelity/harness argument, not
>   a judgment gap. `human-witness-is-a-judgment-gap-not-cost` puts live/expensive/not-yet-harnessed on
>   the machine rung. **Neither carries a `proof-gate:`** — none of the three declared gates covers the
>   end-to-end assertion — so per ADR-0209 §6 both return to UNSTAMPED. That is correct and honest: a
>   `machine` tag names the RIGHT KIND of witness, it does not claim the proof exists, and the owner
>   signs nothing for them.
> - **Leg 5 STAYED `human`** after that pass, narrowed to its irreducible core — and was DELETED by
>   ADR-0348 D6 on 2026-08-11, because having no compiler was never enough to make it an ACCEPTANCE
>   claim. The reasoning it recorded is kept here as the derivation. Basis: **no compiler.** The spawn line's
>   exact strings, their order and their arrival are leg 3's — already compiled and machine-witnessed;
>   what has no compiler is whether the line READS as "a subagent is working right now" (an ADR-0070
>   stage-2 appearance judgment). A **second and distinct** basis is that a live spawn is
>   subscription-billed and writes real files, so it is not run on a gate pass — that is a cost and
>   blast-radius reason to keep it off the gate, and it is recorded separately rather than folded into
>   the irreducibility claim, because conflating the two would hide a cost argument inside a
>   "nothing could observe this" claim.
> - **No splits.** Legs 5–7 each fused a compiled half with a claimed-irreducible half, but in every
>   case the compiled half ALREADY HAS its own machine leg — leg 3 for the spawn-line strings, leg 4 for
>   the reload callback, leg 2 for the advisory read. Restating those as human success conditions would
>   launder compiled facts into unrepeatable signatures, which is this migration running backwards, so
>   each narrowed leg REFERENCES its machine sibling instead of duplicating it.
>
> No leg rests `either`, and no leg is tagged `model` (`witness: model` is unreachable through the story
> schema — see Open modeling calls #4). The story-level `uat_witness` is absent → human (the ADR-0040
> fail-closed signpost), so the machine-driven whole-story UAT node stays withheld; the crown derives
> from the per-leg roll-up.

**Goal —** A desktop chat spawn is VISIBLE where it happens: the operator reads a spawn line in the
transcript as the subagent starts and finishes, and — for a story the spawn just authored — watches
its island appear live on the forest map with its claim wisp lit, without reloading anything.

### The spawn line's legibility — design intent, deliberately NOT a UAT leg (ADR-0348 D6)

The appearance intent that stood as leg 5 until 2026-08-11 is recorded here so it is not lost with its
leg. **With a real spawn running in a live transcript, the rendered spawn line should read at a glance
as "a subagent is working RIGHT NOW"; it should stay visually distinguishable from the surrounding
`delta` prose; and when it flips to the finished form it should read as the SAME line RESOLVING —
never as two unrelated lines.** That last clause is the substantive one: the whole point of surfacing a
spawn is that an operator can tell work started and then tell it finished, and a pair of lines that do
not read as one event defeats the story's outcome even when every string is correct.

Machine leg 3 pins the line's exact strings, their order and their arrival off the wire frame — and
deliberately does not restate the reading. Under ADR-0348 D6 the reading is not an acceptance criterion:
it is continuous owner feedback gathered through use.

**This intent was never walked, and that is a RETIREMENT, not a pass.** The leg presumed the in-app
interactive orchestrator chat, **RETIRED by ADR-0174** in favour of an embedded terminal running real
Claude Code — *there is no in-app conversation left in which to spawn*, so the experience this intent
describes cannot be looked at on the shipped app. `ChatDock` is likewise dormant: nothing imports or
mounts it (`TreeView.tsx:2561`), and the callback wiring is exercised only at the component seam. Leg 5
was never attested — no record exists — and nobody was going to attest it under the current build. The
absence of a verdict must not later be misread as approval (ADR-0348 Consequences). *(A second, separate
fact, recorded because it was a distinct basis on the old leg and not a judgment gap: a live spawn is
subscription-billed and writes real files, so it was never run on a gate pass either.)*

1. **The spawn trace is surfaced as an ordered chat event and still bumps the heartbeat.** _(criterion-id: uatc_bce0303470cb532601c23b58)_ _(revision-id: uatr1:76345d5c24ebaa1f)_
   _(witness: machine)_ _(proof-gate: spawn-visibility#gate-1)_ Drive `startChatStream` with a scripted `queryFn` and a scripted spawn double
   that fires `spawn_started` then `spawn_finished`. **Success —** the stream yields two non-terminal
   `spawn` events (`{ type: "spawn", phase: "started"|"finished", role, unitId, ok? }`) in order,
   interleaved with any `delta`s on the SAME FIFO, before the terminal `done`; each trace ALSO bumped
   the claim heartbeat (ADR-0138 §4 preserved); and a session run WITHOUT spawn deps yields NO `spawn`
   events (byte-identical to today).
2. **The advisory claims read survives a DB cold-start.** _(witness: machine)_ _(proof-gate: spawn-visibility#gate-2)_ Run the advisory reader _(criterion-id: uatc_82b8c868d39adbfa88b1608e)_ _(revision-id: uatr1:40c4eb075e8bd118)_
   over an injected `inFlightClaims` fn that resolves slower than 4s but under the softened budget.
   **Success —** the claims read returns the claim (not null) because it got the per-read override /
   one retry; the other four overlay reads keep their 4s budget (a slow verdicts/activity/presence read
   still nulls at 4s — `/api/tree` never hangs); and a GENUINELY failing/absent claims read still
   returns null (the ADR-0033 advisory contract intact, never a throw).
3. **The chat panel renders the spawn line off the wire frame.** _(witness: machine)_ _(proof-gate: spawn-visibility#gate-3)_ Render _(criterion-id: uatc_a8d191b854955d8fb93787e2)_ _(revision-id: uatr1:0fe22b5c420e2e8f)_ _(previous-revision-id: uatr1:e0516d4d36497c41)_
   `<ChatPanel/>` given a scripted `api` stream that emits a `spawn` frame (`phase: "started"`, role
   `story-author`) then `phase: "finished"`. **Success —** the panel's `ChatEvent` union + `isChatEvent`
   guard accept the `spawn` frame, the panel renders a "🔧 spawning story-author for `<id>`…" line that
   resolves to "✓ story-author finished", and the thin client imports no drive/agent/model
   (`modelPathBoundary.test.ts` green). (This proves GEOMETRY/BEHAVIOUR; the on-screen look is carried
   by no leg since ADR-0348 D6 — see "The spawn line's legibility" above.)
   *(Scope note, 2026-07-26 — the prose implied two render states; `ChatPanel.tsx:415–419` has THREE:
   `started` → "🔧 spawning `<role>` for `<id>`…", `finished` with `ok === false` → "✗ `<role>` failed",
   `finished` otherwise → "✓ `<role>` finished". This leg walks only the started→finished-ok path; the
   failure branch is UNCOVERED by it and is not claimed green here.)*
4. **A story-author finish triggers a live tree reload.** _(witness: machine)(detail: spawn-visibility#uat-4)_ _(proof-gate: spawn-visibility#gate-3)_ Render the dock/panel _(criterion-id: uatc_5eb5ed411bdf3959e1d5477c)_ _(revision-id: uatr1:24dfa72590a3f049)_
   given a `spawn`-finished frame for a `story-author`. **Success —** `ChatDock` invokes the injected
   `reloadTree` callback EXACTLY once for a story-author finish (and NOT for a builder finish, nor for
   `started`), the callback is a plain prop (no drive/agent import), and the reload path is the same
   `reloadTree` the crown-refresh uses (`TreeView.tsx:1518`). (Geometry/behaviour; the island's presence
   after the reload is leg 6.)
   *(Corrections, 2026-07-26 — the anchor was cited at `TreeView.tsx:1227`; `reloadTree` is at :1518.
   And `ChatDock` is DORMANT in the shipped app: ADR-0174 gave the dock slot to the embedded terminal
   and ADR-0175 held spawn/landing out of `app-guide`, so nothing imports or mounts `<ChatDock>` today
   (`TreeView.tsx:2561` records this). The callback wiring is real and is exercised by
   `apps/studio/src/components/ChatDock.reload.test.tsx`, but ONLY at the component seam — a green
   there says nothing about the composed app, which is the detail artifact's false-pass fence.)*
6. **The just-authored story's island is PRESENT on the map after a spawn-finished reload.** _(criterion-id: uatc_54c928ac0034b9e5f69b0644)_ _(revision-id: uatr1:485c5a00d4733238)_
   _(witness: machine)(detail: spawn-visibility#uat-6)_ With `stories/<id>/` present on disk, deliver a
   `spawn`-finished frame for a `story-author` to the composed dock+map surface and let the reload
   settle. **Success —** the rendered forest map then contains a node for `<id>` that was ABSENT before
   the frame, and no manual reload or refresh was issued in between.
   *(Re-adjudicated `human` → `machine`, 2026-07-26. The success condition is a DOM/data assertion — a
   node for a known id is present in the rendered tree — and every step between the frame and that node
   compiles: the callback (leg 4), the tree fetch, the render. The old tag rested on "an operator SEES
   the island", which is a data claim in a perceptual costume; nothing here is a judgment with no
   compiler. It was human only because no harness drives the reload end-to-end, and
   `human-witness-is-a-judgment-gap-not-cost` puts not-yet-harnessed on the machine rung. NO
   `proof-gate:` is bound — none of the three declared gates covers this end-to-end assertion — so per
   ADR-0209 §6 this leg returns to UNSTAMPED: correct and honest, not green. The map's LOOK, whether the
   island reads well where it lands, belongs to the map stories' appearance UAT, not to this story.)*
7. **The fresh claim's wisp is PRESENT on the map after a >4s cold-start claims read.** _(criterion-id: uatc_e2e8f08e273621cb0bbd2346)_ _(revision-id: uatr1:499f32060279d8f4)_ _(previous-revision-id: uatr1:ffac531178f38e3c)_
   _(witness: machine)(detail: spawn-visibility#uat-7)_ Drive the composed overlay with an
   `inFlightClaims` read that resolves slower than the shared 4s but inside the softened budget, then
   let the first poll after the spawn land. **Success —** that poll carries the just-taken claim and the
   map renders a wisp for it — the claim is not dropped, as it was before the cold-start fix.
   *(Re-adjudicated `human` → `machine`, 2026-07-26. Every clause compiles. The read returning the claim
   is already leg 2's; what this leg adds is that the returned claim reaches a RENDERED wisp — again a
   DOM/data assertion. The old prose's own justification, "exercises the real cold-start the machine leg
   injects", is a FIDELITY/HARNESS argument (a real slow DB versus an injected slow fn), not a judgment
   gap — precisely the substitution `human-witness-is-a-judgment-gap-not-cost` forbids. NO `proof-gate:`
   is bound: `#gate-2` covers the advisory read, not the rendered wisp — so this leg returns to
   UNSTAMPED. The wisp's COLOUR and look stay `wisp-as-story-claim`'s appearance UAT, per the
   cross-story boundary above.)*

End state — a desktop chat spawn is VISIBLE in both places the operator looks: the transcript shows the
subagent start and finish, and the map shows the new island and its lit claim wisp, live — the two gaps
the 2026-07-03 Phase-3 walk found are closed, every wall held (additive frames, heartbeat still bumps,
thin-client wall intact, advisory null-on-failure preserved).

*(Honesty note, 2026-07-26, updated 2026-08-11 — this end state is the AUTHORED goal, not a record of
achievement. Legs 1–4 are the only ones with bound proof; legs 6–7 are machine but unharnessed and
unstamped. The appearance leg that stood at 5 was never attested (no record exists — see Proof below)
and was DELETED by ADR-0348 D6, its intent carried above. The story is `retired`, so this end state is
kept as the statement of what the journey was FOR, not as a claim that it was witnessed.)*

## Reliability Gates

*(History, as authored during the ADR-0097 adoption pass. Status has since moved `mapped → proposed →
retired`; the register entry and the `real:` arms are gone — see the frontmatter's companion-cleanup
note. Kept unrewritten below because the three `observe` gates it declares are what legs 1–4 are bound
to, and those bindings are unchanged by the 2026-07-26 re-adjudication.)*

`spawn-visibility` was a **landed-but-unregistered straggler** (`status: mapped` at the time): its four capabilities
LANDED in PR #567 with passing real-arm tests across three offline suites, but that merge ran through
DB-free CI, so storytree's own prove-it-gate never signed a `--real --store pg` verdict for them — the
caps read `build=unregistered` and hold the crown at `proposed`. A fresh `--real` build is the wrong
instrument: the base is already green, so the gate finds no genuine red to drive and HALTS (and a
scripted red over mature code would be the manufactured-red rubber-stamp ADR-0097 §2 forbids). The
honest path off `mapped` is the author-declared **reliability gates** below, observe-and-signed to
`adopted` verdicts (ADR-0097 — brownfield go-green is a proving process, brown → proposed → green;
ADR-0085 — the reliability-gate author surface). Same move proven on the `cli` hub (PR #569).

The four caps span **three** suites, so the story declares **three** `observe` gates — one per suite —
each `(covers:)` only the capabilities its suite genuinely exercises (ADR-0097 §5). The two studio caps
are **two-stage** (ADR-0070): the vitest gate covers their machine GEOMETRY (the wire shape, the
transcript render, the dock→tree reload callback); the remainder is UAT leg 6. *(Re-adjudicated
2026-07-26: only leg 5 — does the spawn line READ as a spawn happening — was an APPEARANCE judgment
staying human, and ADR-0348 D6 deleted it on 2026-08-11 as experience rather than acceptance. Leg 6
asserts a map node's PRESENCE, a DOM/data claim, and is `machine`, unharnessed and unstamped.)* So an
`observe` gate over each suite honestly covers its caps' machine
half — `healthy` still DERIVES from a signed verdict (ADR-0020), never authored.

1. **The drive spawn-trace suite is green** _(gate: observe)_ _(covers: chat-spawn-trace-events)_
   `pnpm --filter @storytree/drive test`. The spine runs it at a clean committed HEAD and OBSERVES it
   green — the typed `SpawnTrace` union + `startChatStream`'s interception that pushes a non-terminal
   `ChatStreamSpawnEvent` onto the same delta FIFO (interleaved, ordered), the heartbeat-still-bumps
   invariant (ADR-0138 §4), and the absent-spawn-deps byte-identical wall — all proven offline over the
   injected `queryFn` + scripted spawn double. This is the machine half of `chat-spawn-trace-events`
   (UAT leg 1); the `adopted` verdict greens the cap via `(covers:)`.
2. **The desktop advisory suite is green** _(gate: observe)_ _(covers: claim-wisp-cold-start)_
   `pnpm --filter desktop test`. The spine OBSERVES it green — `createAdvisoryReader`'s per-read budget
   (a timeout override / retry-once) that lets the `inFlightClaims` read survive a DB cold-start beyond
   4s WITHOUT slowing the other four overlay reads or letting `/api/tree` hang, and the ADR-0033
   null-on-genuine-failure contract preserved — proven offline over an injected slow fn
   (`advisory.test.ts`). This is the machine half of `claim-wisp-cold-start` (UAT leg 2).
3. **The studio spawn-surface suite is green** _(gate: observe)_ _(covers: chat-panel-spawn-render, live-story-island-refresh)_
   `pnpm --filter studio test`. The spine OBSERVES it green — the `spawn` variant on the `ChatEvent`
   wire union + `isChatEvent` guard and the `ChatPanel` spawn-line render (`chat-panel-spawn-render`),
   the `ChatDock` → `TreeView.reloadTree` callback firing exactly once on a story-author finish
   (`live-story-island-refresh`), and the thin-client wall (no drive/agent import) — proven offline over
   the scripted `api` seam (studio vitest/jsdom). This is the machine GEOMETRY of the two two-stage caps
   (UAT legs 3–4). Their remainder is leg 6 — `machine` since the 2026-07-26 re-adjudication and covered
   by no gate. *(It was legs 5–6 until ADR-0348 D6 deleted the appearance leg on 2026-08-11.)*

Adopting these three gates signs one `adopted` verdict per gate (signer = the spine principal that
witnessed the green, approvedBy = the owner adopting it) and observe-signs the four machine UAT legs
(1–4) against their explicitly bound package suites (ADR-0106), then flips the authored status
`mapped → proposed` ("adoption underway", ADR-0097). No single gate greens the story: `healthy` stays
non-authorable (ADR-0020) — the crown DERIVES green once every capability is covered, every machine UAT
leg is signed, and legs 6–7 are discharged. *(Corrected 2026-07-26: this previously read "the human
legs 5–7 are attested (they already are)". After re-adjudication only leg 5 was human; legs 6 and 7 are
`machine` and, per ADR-0209 §6, returned to UNSTAMPED with no gate bound — so they are NOT discharged,
and no prior attestation can stand in for them. Updated 2026-08-11: ADR-0348 D6 deleted leg 5, so no
attestation is owed at all and the crown turns entirely on machine verdicts. Retired story: nothing
here is being driven to green.)*

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes — the offline legs (1–4)
green under the package + backend + component suites, and the two unharnessed machine legs (6–7) driven
by some harness that does not yet exist — with the capabilities' integration tests and contracts green
underneath. *(The appearance judgment that stood at leg 5 was deleted by ADR-0348 D6 on 2026-08-11 and
is design intent above, not a proof obligation.)* The capability/contract
obligations are minimal-to-green (slow growth): the trace threading is an integration test over the
real `startChatStream` FIFO with the SDK `query()` + spawn scripted; the advisory fix is isolatable
over an injected slow fn; the panel render and the reload callback are component/behaviour tests over a
scripted `api` seam (the studio vitest/jsdom convention). The on-screen APPEARANCE — whether the spawn
line reads right — is carried by no leg since ADR-0348 D6 and is never a machine visual verdict
(ADR-0070); the PRESENCE of a map node or a wisp is not appearance and is machine (legs 6–7,
re-adjudicated 2026-07-26).

**NO OWNER ATTESTATION WAS EVER RECORDED against any leg of this story** (verified 2026-07-26 — no row,
no fixture, no signed UAT record; the prior "already operator-attested" wording traces to a single
docs-only commit, `903b6da5` of 2026-07-04, that authored it as a bare assertion with no signer, date or
test id). So the standing open call — *does an owner attestation carry forward onto a re-adjudicated or
split leg, or must it be re-signed?* ([`wisp-as-story-claim`](../wisp-as-story-claim/story.md), open
modeling call 1, for the owner to settle once and generally) — **does not bite here**: there is no prior
signature to carry forward, re-point or scope-limit. The `uat-attestation` precedent. Nothing is being
re-raised and nothing is being decided.

**Honest status — `proposed`.** Authored status stays `proposed` everywhere: per ADR-0020, `healthy` is
only ever DERIVED from signed verdicts, never authored. The four capabilities are proof-wired so the
spine can drive their offline suites red→green (`pnpm storytree story build spawn-visibility --real`);
the story's own machine-driven UAT node is WITHHELD (`uat_witness` absent → human, ADR-0040), and the
crown additionally awaits a harness for the two unstamped machine legs 6–7 — and nothing else, since
ADR-0348 D6 deleted the appearance leg that stood at 5. *(Corrected 2026-07-26: this previously read "the operator's live-spawn attestation (legs
5–7)". The story is `retired` and its caps' `real:` arms are dropped, so the `story build --real`
command quoted just above no longer applies either — kept as history.)*

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
4. **`witness: model` is UNREACHABLE through the story schema — an owner fork, not an agent's call.**
   *(Raised 2026-07-26 during the re-adjudication.)* `@storytree/model-uat`'s prose parser recognises
   `(witness: model)` and its `Criterion` schema accepts it, but the story-side witness enum
   (`UAT_TEST_CRITERION_WITNESSES = ["human","machine","either"]`) hard-throws on it, and
   `proof-protocol`'s `UatWitness` is `z.enum(["human","machine"])`. So a model-judged witness cannot be
   authored on a story leg today even where it might be the right rung. No leg of this story is tagged
   `model`, and this re-adjudication does not decide the fork — it records it. Same call surfaced across
   the sibling stories of the ADR-0209 D8 pass; for the owner to settle once and generally.
5. **Legs 6 and 7 are `machine` with NO harness and NO bound gate — a real, recorded hole.**
   *(Raised 2026-07-26.)* Both assert the PRESENCE of a rendered thing (a map node for the just-authored
   story; a wisp for the just-taken claim) end-to-end across the dock → reload → render path and the
   overlay poll → render path. Nothing drives either today, and none of the three declared `observe`
   gates covers them, so they stand UNSTAMPED. On a LIVE story that hole would be worth closing with a
   composed-surface test; on THIS story it is recorded rather than closed, because the story is
   `retired` and the composed path it would drive (`ChatDock`) is dormant. Flagged so a future reader
   does not mistake the `machine` tag for a claim that the proof exists.
