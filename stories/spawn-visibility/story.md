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
# UAT CRITERIA: NONE — all six DELETED 2026-08-21 under ADR-0396 (a retired story's criteria are an
# obligation against a withdrawn journey, so they are deleted and their ordinals burned; the body keeps
# the history). Ordinals 1, 2, 3, 4, 6 and 7 are burned here (5 was already burned by ADR-0348 D6 on
# 2026-08-11). None held proof credit — all six read `proven=–`, so ADR-0396 D8's keep-the-proven fence
# did not bite. Each key is `superseded` in stories/uat-legacy-dispositions.json; the detail artifacts
# spawn-visibility#uat-4/6/7 are retired in the live store. The per-leg witness record below is kept as
# DATED HISTORY of how the list stood at deletion — it describes nothing current.
# Per-leg witness (ADR-0106) — RE-ADJUDICATED 2026-07-26 (owner-directed corpus-wide pass, ADR-0209 D8,
# arc model-uat-promotion). Then 6 machine / 1 human (was 4 machine / 3 human). NARROWED 2026-08-11
# (ADR-0348 D6): the one human leg — the spawn line's LEGIBILITY — was DELETED as a user EXPERIENCE
# rather than a user ACCEPTANCE claim, leaving 6 machine / 0 human; the intent and the record that it
# was never walkable are carried under "The spawn line's legibility".
#   - The legs at ordinals 1–4 (machine, unchanged): the typed spawn trace threaded onto the chat
#     stream, the advisory read surviving a cold-start, the panel's spawn-line geometry, the dock→tree
#     reload callback — machine-witnessed by the package + component suites over injected doubles + a
#     slow injected fn.
#   - The legs at ordinals 6 and 7 CONVERTED human → machine. Both success conditions are DOM/data
#     assertions with a compiler (a node for a known story id is present in the rendered map; a wisp is
#     present for the just-taken claim). They were human only because no harness drove them end-to-end,
#     and the old prose's own justification for the leg at 7 — "exercises the REAL cold-start the
#     machine leg injects" — is a fidelity/harness argument, not a judgment gap.
#     `human-witness-is-a-judgment-gap-not-cost` puts not-yet-harnessed on the machine rung. Neither
#     carried a `proof-gate:` (none of the three declared gates covers the end-to-end assertion), so per
#     ADR-0209 §6 both returned to UNSTAMPED — correct and honest, not green; the owner signed nothing.
#   - The leg at ordinal 5 STAYED human, narrowed, on the NO-COMPILER basis: the strings/order/arrival
#     of the spawn line were the compiled business of the leg at ordinal 3; what had no compiler was
#     whether the line READS as "a subagent is working right now" (ADR-0070 stage-2 appearance). The
#     live spawn's subscription spend was recorded as a SECOND and DISTINCT basis (a cost/blast-radius
#     reason not to run it on a gate pass), never folded into the irreducibility claim.
# The story-level uat_witness is absent → human (the ADR-0040 fail-closed signpost), so the
# machine-driven whole-story UAT node stayed withheld; the crown derived from the per-leg roll-up and
# now derives from the ADR-0085 own-proof union over a story that declares no criteria (ADR-0294 D5).
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
  geometry machine-proven; the island actually appearing after the reload was ALSO judged machine on
  2026-07-26 — it is a DOM/data assertion, not a judgment gap. *(Both claims stood as UAT legs until
  2026-08-21, when ADR-0396 deleted this retired story's criteria; the reasoning survives in the UAT
  section's history block.)*
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
(it has no separate code); it was carried by the two Story-UAT legs that asserted the map node's and
the wisp's PRESENCE. *(Re-adjudicated 2026-07-26: of the three legs it was then, only the one asking
whether the spawn line READS as a spawn happening was human-witness; the other two assert the presence
of a map node and of a wisp — DOM/data claims with a compiler, so `machine`. ADR-0348 D6 then DELETED
the appearance leg on 2026-08-11 as experience rather than acceptance, leaving the composed surface
carried machine-only. **All of this story's criteria were then deleted on 2026-08-21 under ADR-0396**,
so the composed surface run live is now carried by no leg at all — the UAT section holds the record.
The `real:` arms were dropped on retirement, so the story is no longer story-`real`-buildable — see the
frontmatter's companion-cleanup note.)*

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`chat-spawn-trace-events`](chat-spawn-trace-events.md) | The spawn boundary traces are typed as a `SpawnTrace` union and surfaced out of the swallowing claim gate: `startChatStream` intercepts them and pushes a new non-terminal `ChatStreamSpawnEvent` onto the same FIFO the deltas use — interleaved and ordered — while the trace still bumps the claim heartbeat, and an absent-spawn-deps session emits none. Machine-proven end to end over the injected `queryFn` + scripted spawn double. | — |
| 2 | [`claim-wisp-cold-start`](claim-wisp-cold-start.md) | The advisory reader gains a per-read budget (a timeout override and/or a single retry-once on cold-start) so the `inFlightClaims` read survives a DB cold-start that exceeds 4s and the fresh claim is not dropped — WITHOUT slowing the other four overlay reads or letting `/api/tree` hang. Machine-proven over an injected slow fn. | — |
| 3 | [`chat-panel-spawn-render`](chat-panel-spawn-render.md) | The studio chat surface carries the `spawn` variant on its `ChatEvent` wire union + `isChatEvent` guard and the `ChatPanel` renders it as a spawn line ("🔧 spawning story-author for `<id>`…" → "✓ story-author finished") — geometry/behaviour machine-witnessed over a scripted seam; the on-screen appearance operator-attested (ADR-0070). | `chat-spawn-trace-events` |
| 4 | [`live-story-island-refresh`](live-story-island-refresh.md) | When the chat surface sees a spawn-finished event for a story-author, `ChatDock` invokes a `TreeView.reloadTree` callback so the just-authored story's island appears live on the forest map — geometry/behaviour machine-witnessed (the callback fires on the right event, imports no drive/agent code); the island's PRESENCE after the reload also machine (re-adjudicated 2026-07-26 — a DOM/data assertion, not a judgment gap; it stood as a Story-UAT leg until ADR-0396 deleted this retired story's criteria on 2026-08-21). | `chat-panel-spawn-render` |

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

> **DELETED — all six criteria, 2026-08-21, under
> [ADR-0396](../../docs/decisions/0396-a-retired-story-s-uat-criteria-are-deleted-with-their-ordina.md).**
> A UAT criterion is a standing acceptance OBLIGATION against a story's outcome, not a record of one.
> This story is `status: retired` (ADR-0174 + ADR-0175), so its outcome is withdrawn and every
> criterion under it was an obligation against a journey nobody will run. The six legs that stood here
> — ordinals 1, 2, 3, 4, 6 and 7; ordinal 5 was already burned by ADR-0348 D6 on 2026-08-11 — are
> deleted, and **every one of those ordinals is BURNED, never reused** (ADR-0396 D2): no
> `spawn-visibility#uat-<n>` key can ever denote a second criterion.
>
> **Nothing signed was destroyed.** All six read `proven=–` at deletion — no `events.verdict` row and
> no `events.attestation` row named any of their `criterionId`s (verified per story with
> `storytree uat list spawn-visibility --pg`). ADR-0396 D8 keeps a proof-bearing criterion in place;
> none here was one.
>
> **Where the history is.** Each of the six positional keys is recorded `superseded` in
> `stories/uat-legacy-dispositions.json` with its rationale (the ledger still totals 282 keys), the
> legs themselves are in `git log -p` verbatim, and the three detail artifacts they pointed at —
> `spawn-visibility#uat-4`, `#uat-6`, `#uat-7` — are retired in the live store with the same
> rationale. The body of this story is the narrative history and is kept in place, which is what the
> retirement always intended; what is gone is the obligation, not the record.

**Goal (kept — what the journey was FOR) —** A desktop chat spawn is VISIBLE where it happens: the
operator reads a spawn line in the transcript as the subagent starts and finishes, and — for a story
the spawn just authored — watches its island appear live on the forest map with its claim wisp lit,
without reloading anything. Converse → spawn → SEE it, in the chat AND on the map.

### What the deleted legs established, carried up so it is not lost with them

These are the facts the per-leg scope notes had recorded and that the rest of this body does not
otherwise carry (ADR-0396 D3). Each was written against the code at the date given and is kept as a
dated record, not as a present-tense claim:

- **The spawn line has THREE render states, not two** (recorded 2026-07-26 against
  `apps/studio/src/components/ChatPanel.tsx:415–419`): `started` → "🔧 spawning `<role>` for `<id>`…",
  `finished` with `ok === false` → "✗ `<role>` failed", `finished` otherwise → "✓ `<role>` finished".
  The leg that stood at 3 walked only the started→finished-ok path; the FAILURE branch was never
  covered and was never claimed green.
- **`reloadTree` is at `TreeView.tsx:1518`** (called at `:1537`, passed as `onCrownRefresh` at
  `:2594`) — corrected 2026-07-26 from an earlier `:1227` citation that had already rotted.
- **`ChatDock` is DORMANT in the shipped app** (recorded 2026-07-26, `TreeView.tsx:2561` records it):
  ADR-0174 gave the dock slot to the embedded terminal and ADR-0175 held spawn/landing out of
  `app-guide`, so nothing imports or mounts `<ChatDock>`. The callback wiring is real and is exercised
  by `apps/studio/src/components/ChatDock.reload.test.tsx`, but ONLY at the component seam — a green
  there says nothing about the composed app.
- **The end-to-end presence claims were `machine` with NO harness and NO bound gate**, and that hole
  was recorded rather than closed (open modeling call 5 below). The two legs that stood at 6 and 7
  asserted that a map node for the just-authored story, and a wisp for the just-taken claim, are
  PRESENT after the composed path settles. Neither could bind a gate: none of the three `observe`
  gates below covers an end-to-end assertion, and `#gate-2` covers the advisory READ, not a rendered
  wisp. On a live story that hole would be worth closing with a composed-surface test; on this one it
  is history.
- **The map's LOOK and the wisp's COLOUR were never this story's** — they belong to the map stories'
  and `wisp-as-story-claim`'s appearance UAT respectively, per the cross-story boundary above. The
  deletion of the presence legs changes nothing there.

### The per-leg witness record, as it stood at deletion — history, describing a list that no longer exists

Kept verbatim in substance because it is the reasoning trail two adjudication passes produced, and
because ADR-0396 D3 asks that a dying leg's load-bearing content survive it. Read every sentence below
as dated: it describes how the six legs stood on 2026-08-11, not how anything stands now.

The 2026-07-26 pass (owner-directed corpus-wide, ADR-0209 D8, arc `model-uat-promotion`) left the
story at **6 machine / 1 human**, having been 4/3. The legs at ordinals 1–4 stayed `witness: machine`,
each bound to the exact package observe gate that proved it — ordinal 1 → `spawn-visibility#gate-1`,
ordinal 2 → `#gate-2`, ordinals 3–4 → `#gate-3`. The legs at ordinals 6 and 7 were CONVERTED
`human` → `machine`: each asserted the PRESENCE of a rendered thing for a known id, which is a DOM/data
assertion with a compiler, and every step between the triggering frame and the rendered node compiles.
They had been tagged human only because nothing drives them end-to-end, and the stated reason on the
leg at 7 — *"exercises the REAL cold-start the machine leg injects"* — is a fidelity/harness argument,
not a judgment gap; `human-witness-is-a-judgment-gap-not-cost` puts not-yet-harnessed on the machine
rung. Neither carried a `proof-gate:`, so per ADR-0209 §6 both returned to UNSTAMPED — correct and
honest, not green, and the owner signed nothing for them.

The leg at ordinal 5 STAYED `human` after that pass, narrowed to its irreducible core, and was then
DELETED by ADR-0348 D6 on 2026-08-11 because having no compiler was never enough to make a property an
ACCEPTANCE claim. Its basis was **no compiler**: the spawn line's exact strings, order and arrival were
the compiled business of the leg at ordinal 3; what had no compiler was whether the line READS as "a
subagent is working right now" (an ADR-0070 stage-2 appearance judgment). A **second and distinct**
basis was recorded separately rather than folded in — a live spawn is subscription-billed and writes
real files, so it was never run on a gate pass either — because conflating a cost argument with a
"nothing could observe this" claim hides the first inside the second. Its design intent survives under
"The spawn line's legibility" below.

**No splits were made, and the reason is worth keeping.** The legs at 5, 6 and 7 each fused a compiled
half with a claimed-irreducible half, but in every case the compiled half already had its own machine
leg — ordinal 3 for the spawn-line strings, ordinal 4 for the reload callback, ordinal 2 for the
advisory read. Restating those as human success conditions would have laundered compiled facts into
unrepeatable signatures, which is that migration running backwards.

No leg ever rested `either`, and none was tagged `model` — `witness: model` is unreachable through the
story schema, settled by ADR-0247 and recorded on open modeling call 4 below. The story-level
`uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the machine-driven whole-story
UAT node stayed withheld throughout; the crown derived from the per-leg roll-up, and now derives from
the ADR-0085 own-proof union over a story that declares no criteria — which is honest for a retired
story and is what ADR-0294 D5 explicitly allows.

### The spawn line's legibility — design intent, deliberately NOT a UAT leg (ADR-0348 D6)

The appearance intent that stood as ordinal 5 until 2026-08-11 is recorded here so it is not lost with
its leg. **With a real spawn running in a live transcript, the rendered spawn line should read at a
glance as "a subagent is working RIGHT NOW"; it should stay visually distinguishable from the
surrounding `delta` prose; and when it flips to the finished form it should read as the SAME line
RESOLVING — never as two unrelated lines.** That last clause is the substantive one: the whole point of
surfacing a spawn is that an operator can tell work started and then tell it finished, and a pair of
lines that do not read as one event defeats the story's outcome even when every string is correct.

The machine leg that stood at ordinal 3 pinned the line's exact strings, their order and their arrival
off the wire frame — and deliberately did not restate the reading. Under ADR-0348 D6 the reading is not
an acceptance criterion: it is continuous owner feedback gathered through use.

**This intent was never walked, and that is a RETIREMENT, not a pass.** The leg presumed the in-app
interactive orchestrator chat, **RETIRED by ADR-0174** in favour of an embedded terminal running real
Claude Code — *there is no in-app conversation left in which to spawn*, so the experience this intent
describes cannot be looked at on the shipped app. `ChatDock` is likewise dormant: nothing imports or
mounts it (`TreeView.tsx:2561`), and the callback wiring is exercised only at the component seam. The
leg was never attested — no record exists — and nobody was going to attest it under the current build.
The absence of a verdict must not later be misread as approval (ADR-0348 Consequences). *(A second,
separate fact, recorded because it was a distinct basis on the old leg and not a judgment gap: a live
spawn is subscription-billed and writes real files, so it was never run on a gate pass either.)*

**End state, as authored —** a desktop chat spawn is VISIBLE in both places the operator looks: the
transcript shows the subagent start and finish, and the map shows the new island and its lit claim
wisp, live — the two gaps the 2026-07-03 Phase-3 walk found are closed, every wall held (additive
frames, heartbeat still bumps, thin-client wall intact, advisory null-on-failure preserved).

*(Honesty note, 2026-07-26, updated 2026-08-11 and again 2026-08-21 — this end state is the AUTHORED
goal, not a record of achievement. The four legs at ordinals 1–4 were the only ones with bound proof;
the two at 6–7 were machine but unharnessed and unstamped; the appearance leg at 5 was never attested
and was deleted by ADR-0348 D6. The story is `retired` and now carries no criteria at all, so this end
state is kept as the statement of what the journey was FOR, never as a claim that it was witnessed.)*

## Reliability Gates

> **ALL THREE GATES BELOW ARE NOW UNCLAIMED — and they STAY, on purpose (2026-08-21, ADR-0396 D6).**
> The four criteria that carried the `(proof-gate:)` bindings to `spawn-visibility#gate-1`, `#gate-2`
> and `#gate-3` were deleted with the rest of this retired story's UAT list. The gates are NOT deleted
> with them: `reliabilityGateId` mints `<story>#gate-<n>` from 1-based POSITION, so removing one
> renumbers every later gate and silently re-points already-signed verdicts and surviving bindings onto
> gates they were never about — the loudest of the ADR-0253 identity traps, and it reports nothing. All
> three keep their ordinals and their text; what changed is only that no criterion names them any more.

*(History, as authored during the ADR-0097 adoption pass. Status has since moved `mapped → proposed →
retired`; the register entry and the `real:` arms are gone — see the frontmatter's companion-cleanup
note. Kept unrewritten below because the three `observe` gates it declares are what the four machine
criteria were bound to until 2026-08-21, and those bindings were unchanged by the 2026-07-26
re-adjudication.)*

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
transcript render, the dock→tree reload callback); the remainder was the Story-UAT leg asserting the
map node's PRESENCE. *(Re-adjudicated 2026-07-26: only the leg asking whether the spawn line READS as a
spawn happening was an APPEARANCE judgment staying human, and ADR-0348 D6 deleted it on 2026-08-11 as
experience rather than acceptance. The presence leg asserts a DOM/data claim and was `machine`,
unharnessed and unstamped; ADR-0396 deleted it with the rest on 2026-08-21, so the remainder is now
carried by no leg.)* So an
`observe` gate over each suite honestly covers its caps' machine
half — `healthy` still DERIVES from a signed verdict (ADR-0020), never authored.

1. **The drive spawn-trace suite is green** _(gate: observe)_ _(covers: chat-spawn-trace-events)_
   `pnpm --filter @storytree/drive test`. The spine runs it at a clean committed HEAD and OBSERVES it
   green — the typed `SpawnTrace` union + `startChatStream`'s interception that pushes a non-terminal
   `ChatStreamSpawnEvent` onto the same delta FIFO (interleaved, ordered), the heartbeat-still-bumps
   invariant (ADR-0138 §4), and the absent-spawn-deps byte-identical wall — all proven offline over the
   injected `queryFn` + scripted spawn double. This is the machine half of `chat-spawn-trace-events`
   (the criterion that stood at ordinal 1 until ADR-0396 deleted it, 2026-08-21); the `adopted`
   verdict greens the cap via `(covers:)`.
2. **The desktop advisory suite is green** _(gate: observe)_ _(covers: claim-wisp-cold-start)_
   `pnpm --filter desktop test`. The spine OBSERVES it green — `createAdvisoryReader`'s per-read budget
   (a timeout override / retry-once) that lets the `inFlightClaims` read survive a DB cold-start beyond
   4s WITHOUT slowing the other four overlay reads or letting `/api/tree` hang, and the ADR-0033
   null-on-genuine-failure contract preserved — proven offline over an injected slow fn
   (`advisory.test.ts`). This is the machine half of `claim-wisp-cold-start` (the criterion that stood
   at ordinal 2 until ADR-0396 deleted it, 2026-08-21).
3. **The studio spawn-surface suite is green** _(gate: observe)_ _(covers: chat-panel-spawn-render, live-story-island-refresh)_
   `pnpm --filter studio test`. The spine OBSERVES it green — the `spawn` variant on the `ChatEvent`
   wire union + `isChatEvent` guard and the `ChatPanel` spawn-line render (`chat-panel-spawn-render`),
   the `ChatDock` → `TreeView.reloadTree` callback firing exactly once on a story-author finish
   (`live-story-island-refresh`), and the thin-client wall (no drive/agent import) — proven offline over
   the scripted `api` seam (studio vitest/jsdom). This is the machine GEOMETRY of the two two-stage caps
   (the criteria that stood at ordinals 3–4). Their remainder was the map-node PRESENCE leg — `machine`
   since the 2026-07-26 re-adjudication and covered by no gate. *(It was two legs until ADR-0348 D6
   deleted the appearance one on 2026-08-11, and none since ADR-0396 deleted this story's criteria on
   2026-08-21.)*

Adopting these three gates signs one `adopted` verdict per gate (signer = the spine principal that
witnessed the green, approvedBy = the owner adopting it) and observe-signed the four machine UAT legs
that then stood at ordinals 1–4 against their explicitly bound package suites (ADR-0106), then flipped
the authored status `mapped → proposed` ("adoption underway", ADR-0097). No single gate greens the
story: `healthy` stays non-authorable (ADR-0020). *(Corrected 2026-07-26: this previously read "the
human legs 5–7 are attested (they already are)". After re-adjudication only the appearance leg was
human; the two presence legs were `machine` and, per ADR-0209 §6, returned to UNSTAMPED with no gate
bound — so they were NOT discharged, and no prior attestation could stand in for them. Updated
2026-08-11: ADR-0348 D6 deleted the appearance leg, so no attestation was owed at all and the crown
turned entirely on machine verdicts. Updated 2026-08-21: ADR-0396 deleted every remaining criterion, so
the crown now derives from the ADR-0085 own-proof union over a story that declares none. Retired story:
nothing here is being driven to green.)*

## Proof

The story carried a UAT walkthrough until 2026-08-21; **it carries none now** (ADR-0396 — a retired
story's criteria are an obligation against a withdrawn journey). As authored it would have been proven
by the four offline legs green under the package + backend + component suites and the two unharnessed
machine presence legs driven by some harness that does not yet exist, with the capabilities'
integration tests and contracts green underneath. *(The appearance judgment was deleted by ADR-0348 D6
on 2026-08-11 and is design intent above, not a proof obligation; the rest went under ADR-0396.)* The
capability/contract
obligations are minimal-to-green (slow growth): the trace threading is an integration test over the
real `startChatStream` FIFO with the SDK `query()` + spawn scripted; the advisory fix is isolatable
over an injected slow fn; the panel render and the reload callback are component/behaviour tests over a
scripted `api` seam (the studio vitest/jsdom convention). The on-screen APPEARANCE — whether the spawn
line reads right — is carried by no leg since ADR-0348 D6 and is never a machine visual verdict
(ADR-0070); the PRESENCE of a map node or a wisp is not appearance and was `machine` (re-adjudicated
2026-07-26), carried by no leg since ADR-0396.

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
crown additionally awaited a harness for the two unstamped machine presence legs — and nothing else,
since ADR-0348 D6 had deleted the appearance leg. Since ADR-0396 (2026-08-21) it awaits nothing: the
story declares no criteria. *(Corrected 2026-07-26: this previously read "the operator's live-spawn attestation (legs
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
4. **~~`witness: model` is UNREACHABLE through the story schema — an owner fork, not an agent's call.~~
   CLOSED — the owner settled it, and the answer is that the story schema was RIGHT.** *(Raised
   2026-07-26 during the re-adjudication; closed in place 2026-08-20, ADR-0139.)* The call asked the
   owner to settle "once and generally" why `@storytree/model-uat`'s prose parser accepted
   `(witness: model)` while the story-side enum (`UAT_TEST_CRITERION_WITNESSES`) and `proof-protocol`'s
   `UatWitness` both refused it. **[ADR-0247](../../docs/decisions/0247-retire-the-model-uat-witness-tier-the-witness-split-is-human.md)
   answered it on the very day it was raised** — owner-directed 2026-07-26, decision 1: the witness
   split is **binary**, `human` | `machine`, with no `model` witness kind, no capability tier, no
   eligibility registry and no escalation ladder. So the divergence resolves in favour of the two
   schemas that refused it; the outlier was `@storytree/model-uat`'s parser, whose whole organism
   ADR-0247 D5 puts on the retirement worklist (its story `model-uat-witness` retired 2026-08-20).
   ADR-0295 later reopened *who* may witness a journey — the model that DROVE it — but explicitly
   revives none of that machinery and still yields a `machine` outcome, so it does not reopen this.
   **No agent decided anything here:** this records an owner decision that already existed and had
   simply never been carried back onto the call it answered.
5. **The two PRESENCE claims were `machine` with NO harness and NO bound gate — a real, recorded hole.**
   *(Raised 2026-07-26. The two legs it names stood at ordinals 6 and 7 until ADR-0396 deleted this
   retired story's criteria on 2026-08-21; the call is corrected in place rather than left pointing at
   absent ordinals, and it is NOT answered by that deletion — see below.)* Both asserted the PRESENCE of
   a rendered thing (a map node for the just-authored story; a wisp for the just-taken claim) end-to-end
   across the dock → reload → render path and the overlay poll → render path. Nothing drove either, and
   none of the three declared `observe` gates covers them, so they stood UNSTAMPED. On a LIVE story that
   hole would be worth closing with a composed-surface test; on THIS story it was recorded rather than
   closed, because the story is `retired` and the composed path it would drive (`ChatDock`) is dormant.
   **Deleting the legs did not close the hole and did not decide anything about it** — it removed an
   obligation nobody was going to discharge, leaving the finding exactly as it was: if the composed
   surface is ever rebuilt, it arrives with no end-to-end proof and this call is the record of why.
