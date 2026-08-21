---
id: "chat-drive-bridge"
tier: story
title: "The propose→drive bridge — a chat proposal becomes a human-accepted, spine-signed, landed build (ADR-0108 Phases 3–4)"
outcome: "From a chat conversation the orchestrator proposes a machine-actionable unit id; the human accepts it with one explicit, non-spoofable click; that click dispatches the already-built drive worker against the unit; the spine observes real RED→GREEN and signs; a non-draft PR opens for CI to land — and the build's coarse progress streams back into the same conversation, all the way to the signed verdict + opened PR."
# RETIRED by ADR-0155 (2026-07-04). This whole story built the chat propose_unit → accept-to-Build
# handshake (ADR-0108 d.3). That handshake was removed in PR #587: the desktop session-orchestrator now
# DRIVES via its spawn (ADR-0137) + landing (ADR-0152) tools rather than proposing a unit for a human to
# click "Build". All four capabilities (proposed-unit-signal, proposal-id-threading, chat-build-dispatch,
# accept-to-land-affordance) are retired with ADR-0155 as their deciding record; their deleted-feature
# tests went with PR #587. At that point only the chat propose/accept front retired, and the relocated
# `dispatchAcceptedBuild` worker call outlived it under desktop-build-mount. THAT IS NO LONGER TRUE: this
# note used to close "REMAINS live under desktop-build-mount / builder-spawn-dispatch", and both halves
# are dead — ADR-0175 retired builder-spawn-dispatch and deleted its packages/drive/src/spawn-builder.ts,
# the function's only caller, and ADR-0404 d.5 then DELETED the function itself. Body kept as history. The two live legs (operator-attested) were moot: the accept-to-land experience they attested
# no longer exists. NARROWED 2026-08-11 (ADR-0348 D6): the APPEARANCE leg at ordinal 6 was DELETED as a
# user EXPERIENCE rather than a user ACCEPTANCE claim — intent carried in "The accept-and-watch feel".
# CLOSED 2026-08-21 (ADR-0396): ALL FIVE remaining criteria are DELETED and their ordinals burned,
# because a retired story's criteria are an obligation against a withdrawn journey. See the
# `## UAT Test Criteria` section, which is now the record rather than a list.
status: retired
proof_mode: UAT
# UAT CRITERIA: NONE since 2026-08-21 (ADR-0396). Ordinals 1–5 burned here; 6 was already burned by
# ADR-0348 D6. None held proof credit (all read `proven=–`), so ADR-0396 D8's keep-the-proven fence did
# not bite; each key is `superseded` in stories/uat-legacy-dispositions.json and the detail artifact
# chat-drive-bridge#uat-5 is retired in the live store. Everything below this line is DATED HISTORY of
# how the list stood, not a description of anything current.
# Per-leg witness (ADR-0106): the offline mechanics legs (the non-spoofable proposed-unit signal, the
# threading through the stream, the dispatch routing/validation, the progress fold) are machine-
# witnessed. The accept-to-land AFFORDANCE's APPEARANCE (the proposal card + the Build button's
# look/feel, the live-progress feel) was human-witness (operator-attested, ADR-0070) until ADR-0348 D6
# deleted that leg on 2026-08-11; it is now design intent, never a leg. Its GEOMETRY/BEHAVIOUR (the
# button dispatches a build, progress renders) is machine-witnessed and unchanged.
# RE-ADJUDICATED 2026-07-26 (ADR-0209 D8 — see the `## UAT Test Criteria` section): the tags were
# UNCHANGED at 4 machine (ordinals 1–4) / 2 human (ordinals 5–6), and both human legs were tested
# against `human-witness-is-a-judgment-gap-not-cost` rather than inherited. The leg at 5 stayed human on
# TWO recorded bases that are neither of them a judgment gap — real metered subscription spend, and an
# outward-facing action (it opens a PR CI auto-merges onto the trunk); the leg at 6 was human on the
# NO-COMPILER basis (ADR-0070 stage-2 appearance) and was DELETED by ADR-0348 D6 — having no compiler
# was never enough to make it an ACCEPTANCE claim. ZERO splits: every compiled half those two legs also
# asserted already had its own machine leg here, so each referenced its sibling instead of restating it.
# The claim corrected in that pass was the one attached to the four machine legs — that "the suites
# demonstrably cover them" — which had been FALSE since PR #587 deleted those tests; no leg ever carried
# a proof-gate binding, so resolveWitness reported all four `refused`. Per ADR-0209 §6 that was honest:
# a tag records which witness is RIGHT, never that a proof exists, and the owner signed nothing here.
# The story-level uat_witness is absent → human (the ADR-0040 fail-closed signpost), so the machine-
# driven whole-story UAT node stayed withheld; the crown derived from the per-leg roll-up and now
# derives from the ADR-0085 own-proof union over a story that declares no criteria (ADR-0294 D5).
capabilities: [proposed-unit-signal, proposal-id-threading, chat-build-dispatch, accept-to-land-affordance]
# WHY A NEW STORY, NOT AN EDIT TO headless-orchestrator: that story is ADR-0108 Phases 1–2 and is
# read/propose ONLY — its proof posture explicitly rests on "no builds, no signing, no landing" and it
# states "Phases 3–5 ... remain out of scope." Adding DRIVE authority would break that invariant.
# Phase 3 (drive authority) + Phase 4 (land with the human gate) are this story's bounded journey: the
# BRIDGE between the built propose end (headless-orchestrator) and the built drive end (studio-build's
# worker), plus the explicit human accept-to-land gate (ADR-0108 decision 3). Both ends already exist;
# the missing piece is the bridge + the gate.
#
# Story-level edges (ADR-0010 §4 — consumed cross-story seams, encoded here as frontmatter depends_on;
# the import/consumption evidence at file:line is in "Cross-story boundary" below):
#   - agent        — the headless-session organism that captures the proposal. The non-spoofable
#                    proposed-unit SIGNAL (a typed read-only `propose_unit({ unitId })` tool whose
#                    invocation surfaces a typed `proposedUnitId` on HeadlessOrchestratorResult) is a
#                    new module/edit in packages/agent — FORCED by ADR-0004's single-import-site rule
#                    (every @anthropic-ai/* import lives in packages/agent; the proposal capture rides
#                    the same SDK session `runHeadlessOrchestrator` runs, so it cannot live elsewhere).
#                    This is the studio-build precedent: own code physically hosted in another story's
#                    package while declaring the depends_on edge.
#   - drive-machinery — the composition + stream + the build entries the bridge reuses. The
#                    proposedUnitId is threaded through `orchestrate()` and surfaced on
#                    `startChatStream`'s `done` event (packages/drive/src/orchestrate.ts, chat-stream.ts,
#                    owned by headless-orchestrator but PHYSICALLY in @storytree/drive since ADR-0112) —
#                    so this story EDITS drive-resident code it does not own the story for (same precedent
#                    again). The DISPATCH reuses the public build entries `routedBuildRunner` drives —
#                    `storyBuild`/`nodeBuild` (@storytree/drive/build) — never reaching inside the gate.
#   - studio-build  — the build WORKER the dispatch reuses verbatim: `routedBuildRunner` +
#                    `runBuildJob` + the `BuildRegistry` (cited here as apps/studio/server/buildWorker.ts;
#                    CORRECTED 2026-07-26 — that file no longer exists, ADR-0133 d.3 relocated all three to
#                    packages/drive/src/build-worker.ts, exported via @storytree/drive/build-worker), which
#                    already routes a STORY id → `story build --real` (persists real verdicts to
#                    events.verdict, opens a NON-DRAFT PR that CI auto-merges — ADR-0022 / ADR-0090).
#                    The chat dispatch is a SECOND caller of that same worker, not a new build path.
#   - desktop       — the surface the chat (and its build dispatch) ships ON: the desktop local backend
#                    mounts POST /api/chat (`chat-sse-mount`, apps/desktop) and the renderer hosts the
#                    chat panel (a studio frontend thin client). The accept-to-land affordance + the
#                    chat-side build-dispatch route are mounted on the SAME local backend so both halves
#                    of the bridge sit on one surface (the studio dev front mounts /api/build but NOT
#                    /api/chat; the desktop mounts /api/chat but build is DISABLED — the bridge puts both
#                    on the same surface, ADR-0113 where the thick client ships). This story OWNS the
#                    chat-build-dispatch glue physically hosted in apps/desktop + apps/studio/server.
#   - library      — the work-hierarchy schema the dispatch validates against (`isStoryBuildable` /
#                    `resolveBuildConfig` over @storytree/orchestrator discovery + the seed corpus), and
#                    the same in-memory seed the offline proofs render. CONSUMED, not owned.
# DIRECTION / NO CYCLE (ADR-0058): this story is a PURE SOURCE NODE — nothing depends on it. desktop
# already depends_on headless-orchestrator (the Phase-2 backend), and every edge here flows DOWN toward
# the roots (bridge → desktop → headless-orchestrator → agent; bridge → studio-build → studio →
# drive-machinery → agent). Nothing flows back up to the bridge, so the new edges introduce no cycle.
depends_on: [agent, drive-machinery, studio-build, desktop, library]
# Deciding ADRs (ADR-0037 §2): 108 (the phased build — Phase 3 drive authority + Phase 4 land-with-gate,
# THIS); 30 (human owns the outer loop, amended in degree — the human's click is the accept-to-land);
# 91 (proof integrity — the agent DRIVES, the spine observes RED→GREEN and SIGNS, the agent holds no
# key and hands in no verdict — the dispatch is a SAFE build INTENT, never a verdict-in); 4 (the
# orchestrator/agent boundary — the chat thin client imports no agent/drive/model, its only route is
# the api streaming seam); 90 (the build worker the dispatch reuses — routedBuildRunner → story build
# --real, the single agent boundary); 22 (CI lands the trunk — the non-draft PR the worker opens);
# 70 (the accept-to-land affordance's appearance is operator-attested); 112 (the bridge core's
# drive-package placement); 113 (the thick desktop where chat + its build dispatch ship); 128 (the
# adoption gap this closes — "no path from a proposal to a signed --real build"). Context: 0048 (the
# build wisp the dispatched run blooms) / 0057 (the inner loop is the default these builds adopt).
decisions: [108, 30, 91, 4, 90, 22, 70, 112, 113, 128]
---

# The propose→drive bridge — a chat proposal becomes a human-accepted, spine-signed, landed build

**Outcome —** From a chat conversation the orchestrator proposes a machine-actionable unit id; the
human accepts it with one explicit, non-spoofable click; that click dispatches the already-built drive
worker against the unit; the spine observes real RED→GREEN and signs; a non-draft PR opens for CI to
land — and the build's coarse progress streams back into the same conversation, all the way to the
signed verdict + opened PR.

## What this is

This is **ADR-0108 Phase 3 (drive authority) + Phase 4 (land with the human gate)** — *the
propose→drive bridge*, named the highest-leverage lever for inner-loop adoption in
[`docs/research/inner-loop-adoption-gap.md`](../../docs/research/inner-loop-adoption-gap.md) §5 and
[ADR-0128](../../docs/decisions/0128-the-bare-forest-map-is-honest-by-absence-inner-loop-adoption.md)
§4 (owner green-lit 2026-06-28). The research's TL;DR is exact: the conversational outer loop is wired
into the studio **only as far as propose** — ADR-0108 Phase 3 is unbuilt, so making a session drive
`--real` is still a manual CLI step almost every session skips ("**no path from a proposal to a signed
`--real` build**"). This story builds that path.

**Both ENDS already exist.** The missing piece is the BRIDGE between them plus the explicit human
accept-to-land gate:

*(The two bullets below describe the code as it stood when this story was authored. They are kept as the
historical premise, with **every citation re-checked against HEAD on 2026-07-26** alongside the ADR-0209
D8 witness re-adjudication; each correction is marked inline. Six of them had drifted.)*

- **The PROPOSE end (built, read/propose only).** `runHeadlessOrchestrator`
  (`packages/agent/src/headless-orchestrator.ts:234`) runs the `session-orchestrator` agent headlessly
  and returns `HeadlessOrchestratorResult` — capturing only the SDK session's final **free text**
  `result.result`. *(Corrected 2026-07-26: that shape was cited as `{ ok, proposal?, costUsd?, turns? }`;
  at `headless-orchestrator.ts:145` it is today `{ ok, proposal?, costUsd?, turns?, sessionId?, error? }`
  — `sessionId` was added by ADR-0170 chat continuity. It has never carried a `proposedUnitId`; see the
  retirement note.)* The orientation surface (`buildOrientationTools`,
  `packages/agent/src/orientation-tools.ts:163`) is a read-only tool set. *(Corrected 2026-07-26 — this
  read "exactly THREE read tools (tree / library / noticeboard), each with an EMPTY input schema", and
  BOTH halves are now false: `READ_SURFACES` at `orientation-tools.ts:117` declares FOUR surfaces — tree
  / library / noticeboard / **agents** — and the schemas are not empty: each tool is mounted at
  `headless-orchestrator.ts:322–335` with `{ args: z.array(z.string()).optional() }`, the drill-down
  tokens a `next:` pointer supplies.)* `orchestrate()` (`packages/drive/src/orchestrate.ts:161`) threads
  the result through; `startChatStream` (`packages/drive/src/chat-stream.ts:202`) yields a terminal
  `done` event (`ChatStreamDoneEvent`, `chat-stream.ts:78`) carrying `proposal` / `costUsd` / `turns`
  *(and, since ADR-0170, `sessionId`)*; `createChatSseMount` (`apps/desktop/src/backend/
  chat-sse-mount.ts:301`) serialises those as SSE on `POST /api/chat`; the `ChatPanel`
  (`apps/studio/src/components/ChatPanel.tsx:445`) renders the `done` proposal text. The proposal is
  **free text** — there is no machine-actionable unit id anywhere in this chain. *(Still true at HEAD,
  and now true PERMANENTLY rather than pending: ADR-0155 retired the id, and `ChatPanel.tsx:453–455`
  carries the standing marker "No accept-to-Build button (ADR-0155, retiring ADR-0108 d.3)".)*
- **The DRIVE end (built).** `routedBuildRunner` routes a STORY id → `story build --real` (persists real
  verdicts to `events.verdict`, opens a NON-DRAFT PR that CI auto-merges — ADR-0022; "clicking Build IS
  the approval to land") and a NODE id → a node build; `runBuildJob` runs it fire-and-forget, streaming
  COARSE progress into a `BuildRegistry`. *(Corrected 2026-07-26, TWICE. **The file moved:** all three
  were cited at `apps/studio/server/buildWorker.ts`, which no longer exists — ADR-0133 d.3 relocated them
  to `packages/drive/src/build-worker.ts` (`BuildRegistry:77`, `runBuildJob:218`, `routedBuildRunner:337`),
  exported via the `@storytree/drive/build-worker` subpath; only `apps/studio/server/buildWorker.test.ts`
  stayed behind, importing across. **The node route changed:** this read "a NODE id → `node build --live`
  (synthetic, non-persisting)", but `build-worker.ts:340–357` today routes a node id to `nodeBuild(unitId,
  { real: true, dryRun: false, verdictStore: 'pg' })` — a REAL, verdict-persisting build with `openPr`
  deliberately withheld (ADR-0144 made the accepted node build real and persisted; ADR-0136 withheld the
  PR). Any reader treating a chat-dispatched node build as synthetic would be wrong about what it costs
  and what it writes.)* `handleBuild` (`apps/studio/server/apiRouter.ts:1595`) is `POST /api/build
  {unitId} → 202 {runId}` + `GET /api/build?runId → { status, transcript, envelope }`, behind the
  injected `BuildContext { registry, runner: routedBuildRunner, isBuildable }` wired by `devApi.ts:106`.
  *(Both still accurate at HEAD; note only that `BuildContext` is now DEFINED at
  `packages/drive/src/build-worker.ts:379` and merely re-exported by `apiRouter.ts:66`.)*

**The seam where they fail to meet:** the studio dev server mounts `/api/build` (drive) but NOT
`/api/chat` (propose); the desktop backend (`backend-entry.ts`) mounts `/api/chat` (propose) but build
is DISABLED. The bridge must put both halves on the **same surface** (the desktop local backend, where
the thick client ships, ADR-0113) and connect them: a non-spoofable proposed unit id out of the agent,
threaded to the client, an explicit human accept that dispatches the worker, and the build's progress
streamed back into the conversation.

> **CORRECTED 2026-07-26 (ADR-0209 D8 pass) — this seam is CLOSED, but not by this story.** "The desktop
> backend mounts `/api/chat` but build is DISABLED" is false at HEAD: `apps/desktop/electron/
> backend-entry.ts:669` mounts `createBuildRouteMount(build)` (`apps/desktop/src/backend/build-route.ts`,
> POST/GET `/api/build`) over the relocated worker's `BuildContext`, alongside `createChatSseMount` →
> `POST /api/chat`. Both halves DO now sit on the same local backend. What never came back is the piece
> this story owned — the propose→accept handshake between them: ADR-0155 retired the `propose_unit`
> declaration and the human's accept click, so the trigger on that surface is the orchestrator's own
> `spawn_builder` tool (`packages/drive/src/spawn-builder.ts:40` → `dispatchAcceptedBuild`), not a
> proposal a human clicks Build on. The premise this section states as the story's motivating gap has
> therefore been overtaken twice over, and is kept only as the authored history.

**A known, recorded limitation this story's first increment lived next to — SINCE RESOLVED, and its
citation was wrong even when written.** As authored, this paragraph read: *"(`backend-entry.ts:226–231`):
the landed `createChatSseMount` accepts only `{ queryFn? }` — it cannot yet forward an
`OrientationRunner`, so a live session's orientation tools fall back to the no-op stub and the agent
cannot read the live tree/library/board"*, and deferred that wiring to a separate fork. **Corrected
2026-07-26 (ADR-0209 D8 pass) — three separate falsehoods:**

- **Wrong directory.** There is no `apps/desktop/src/backend/backend-entry.ts`. The file is
  `apps/desktop/electron/backend-entry.ts`.
- **Wrong lines.** `backend-entry.ts:226–231` today is inside the Electron main-process broker's
  `process.on("message", …)` response handler — `brokerRequests` plumbing, nothing to do with chat or
  orientation.
- **Wrong substance — the limitation itself is dead.** `createChatSseMount` no longer accepts only
  `{ queryFn? }`: `ChatSseMountDeps` (`apps/desktop/src/backend/chat-sse-mount.ts:205`) declares
  `queryFn?`, **`runner?: SseOrientationRunner`** (`:218`), `spawn?`, `landing?`, `inspect?` and
  `maxTurns?`, and forwards all of them (`:364–368`). A REAL runner is wired in production:
  `backend-entry.ts:570` builds one via `createOrientationRunner` and `:1057–1063` passes it as
  `createChatSseMount({ runner: orientationRunner, … })`. A live desktop chat session therefore reads
  the live tree/library/board today; it does not fall back to a no-op stub.

Nothing about this story's own posture changes — it is retired, and its offline proofs scripted the
`queryFn` regardless. The correction matters only so no reader inherits a dead constraint (and so
"Open modeling calls" #4 below, which rested entirely on this premise, is not read as still open).

## The five-part journey (ADR-0108 Phase 3 + 4) — what gets built

Bounded to ONE journey: *proposal → (human accept) → drive → sign → land, streamed back*. The five
mechanical pieces decompose into the four capabilities below (roots-first), each an isolatable
red→green leaf except the affordance's appearance (operator-attested):

1. A **non-spoofable, machine-actionable proposed unit id** out of the orchestrator — the agent
   *declares* which unit it proposes via a typed read-only tool, distinct from the human's accept.
2. That **`proposedUnitId` threaded** through `orchestrate()` → `startChatStream`'s `done` event → the
   SSE wire → the thin client.
3. A **build-dispatch the chat surface can call** — given an ACCEPTED unit id, validate buildable +
   route to the worker (reusing `routedBuildRunner` / `runBuildJob`), returning a runId; the build's
   coarse progress streamed back over the chat surface.
4. The **explicit accept-to-land affordance** in the chat thin client — a Build button/confirm on a
   proposal carrying a `proposedUnitId`; clicking it dispatches the build. The **non-spoofable human
   gate**.

## Honest proof posture — `proposed`, multi-increment, propose-and-accept-then-drive

This spec is authored FIRST, before any implementation, to bound the Phase 3+4 journey and size the
units; the inner loop builds it (this story authors the work hierarchy only). Every contract below
describes the isolated unit test that proves a leaf; the capability describes the integration test that
proves it against real in-story collaborators; the Story UAT below describes the acceptance walkthrough
that proves the whole bridge.

This is a **MULTI-INCREMENT arc** (slow growth, minimum-to-green): one provable contract is driven to a
signed verdict per session, then the next is spawned. The honest status is `proposed`:

- The **offline-provable mechanics ARE genuinely proof-wired** — each carries a `proof:` block with a
  `real:` arm (a NET-NEW red→green against `packages/agent` / `packages/drive` / `apps/studio/server` /
  `apps/desktop`, driven through an injected `queryFn` + scripted doubles + the in-memory seed). The
  agent surfaces a typed `proposedUnitId` from a typed read-only tool invocation (no write tool exists;
  the signal is the agent's structural declaration, never a parse of free text); the stream threads it
  to the `done` event; the dispatch validates buildable and routes the ACCEPTED id to the real worker
  registry; the progress fold forwards the worker's coarse lines back over the chat surface. These are
  clean offline `node:test`s, designed so the spine's prove-it-gate CAN drive them red→green.
- The **accept-to-land AFFORDANCE is two-stage (ADR-0070).** Its GEOMETRY/BEHAVIOUR — the Build button
  appears only on a proposal carrying a `proposedUnitId`, clicking it POSTs the accepted id through the
  `api` seam and renders the dispatched run's progress, and it is the ONLY path to a build (no
  free-text "yes" is ever parsed) — is machine-witnessed (a component/behaviour test). Its APPEARANCE —
  the proposal card + the button's look/feel, the live-progress feel inside the native shell — was
  **operator-attested / human-witness** (a Story UAT leg, ADR-0070) until ADR-0348 D6 deleted it on
  2026-08-11; it is now design intent under "The accept-and-watch feel", carried by no leg.

**The integrity walls (encoded in every contract + the Story UAT):**

- **ADR-0108 decision 3 — accept-to-land is EXPLICIT and NON-SPOOFABLE.** The human's click on a UI
  affordance (a button/confirm) authorizes the drive-and-land; the agent NEVER lands on a free-text
  "yes" it parsed. The agent *proposes* (and, in the full loop, drives up to the trunk); the human's
  click is the gate. The proposed-unit signal (the agent's declaration) and the accept (the human's
  click) are SEPARATE acts — the agent cannot manufacture the accept.
- **ADR-0091 — the agent DRIVES the spine, never signs.** The spine observes real RED→GREEN exit codes
  and signs; the agent holds no signing key and hands in no verdict. The dispatch is a SAFE write — a
  build INTENT (a unit id to the worker), never a verdict-in. CI independently re-proves green before
  the trunk (ADR-0022). The damage ceiling stays a briefly-wrong hue, corrected by CI.
- **ADR-0004 — the chat thin client never imports agent/drive/model.** Its only route is the `api`
  streaming/dispatch seam; the agent boundary is the backend process. (`apps/studio/src` is held to
  this by `modelPathBoundary.test.ts`.)

Status stays `proposed` for every unit — `healthy` is earned through the prove-it-gate AND the
operator's attestation of the affordance; it is never authored (ADR-0020). *(Corrected 2026-07-26: every
unit here — the story and all four capabilities — has carried `status: retired` since ADR-0155 / PR #587.
The `healthy`-is-never-authored rule is unchanged and still binding; only the "stays `proposed`"
accounting was stale.)*

## Capabilities (4)

Listed roots-first (a capability appears after everything it depends on). All four are **proof-wired**
(ADR-0057 — each carries a `proof:` block with a `real:` arm describing a genuine additive net-new
red→green against the real package/app source), so they form a **dependency-closed, acyclic set in
which every member resolves a `real:` arm** — exactly what makes the WHOLE story story-`real`-buildable
(`isStoryBuildable`). The affordance's APPEARANCE is NOT a separate capability (it has no isolatable
red→green — it was the human-witness Story UAT leg at ordinal 6 and is design intent since ADR-0348
D6); the
`accept-to-land-affordance` capability owns the affordance's machine-provable GEOMETRY/BEHAVIOUR.

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`proposed-unit-signal`](proposed-unit-signal.md) | The headless orchestrator captures a non-spoofable, machine-actionable proposed unit id — declared by the agent through a typed read-only tool, surfaced as a typed `proposedUnitId` field on the result — distinct from any human accept. | — |
| 2 | [`proposal-id-threading`](proposal-id-threading.md) | The `proposedUnitId` is threaded through the `orchestrate()` composition and surfaced on `startChatStream`'s terminal `done` event (and thereby the SSE wire), reusing the Phase-1/2 chain verbatim. | `proposed-unit-signal` |
| 3 | [`chat-build-dispatch`](chat-build-dispatch.md) | Given a human-ACCEPTED unit id, a chat-surface build-dispatch validates the unit is buildable and routes it to the EXISTING drive worker (`routedBuildRunner` / `runBuildJob` / the registry), returning a runId, and the worker's coarse progress is streamed back over the chat surface — a safe build INTENT, never a verdict-in. | `proposal-id-threading` |
| 4 | [`accept-to-land-affordance`](accept-to-land-affordance.md) | The chat thin client renders an explicit, non-spoofable Build affordance ONLY on a proposal carrying a `proposedUnitId`; clicking it dispatches the build through the `api` seam and renders the run's progress — the human accept-to-land gate (geometry/behaviour machine-witnessed; appearance operator-attested). | `chat-build-dispatch` |

## Dependency graph (will be code-derived)

These are **within-story** edges. Until the code exists they are authored from the intended data-flow;
when the units are built they MUST be re-derived from the real imports/calls between capabilities
(static analysis, ADR-0010 §3) and corrected if the code disagrees. The graph is a chain;
`proposed-unit-signal` is the root (the agent-side capture leaf, no in-story upstream).

- `proposal-id-threading` → `proposed-unit-signal`
  - The threading reads the typed `proposedUnitId` the signal capability surfaces on
    `HeadlessOrchestratorResult` and carries it through `orchestrate()`'s `OrchestrateResult` and onto
    `startChatStream`'s `done` event — so it couples directly to the result shape the signal capability
    widens. Nothing downstream of the result shape exists for it to couple to.
- `chat-build-dispatch` → `proposal-id-threading`
  - The dispatch consumes the `proposedUnitId` that arrives on the client (threaded by capability 2)
    as the ACCEPTED unit id to build, validates it, and routes it to the worker. It is the consumer of
    the threaded id; it couples to the wire shape capability 2 produces and to the EXISTING worker
    (a consumed `studio-build` seam), not to anything deeper in-story.
- `accept-to-land-affordance` → `chat-build-dispatch`
  - The affordance is the thin-client front of the dispatch: it renders the Build button on a
    proposal carrying a `proposedUnitId` and, on click, calls the dispatch through the `api` seam and
    renders the run's progress. It owns no dispatch/validation logic — it adapts the dispatch into a
    UI gesture, so it couples to the dispatch's seam and to nothing deeper.

## Cross-story boundary (ADR-0010 §4)

Authored from the intended consumed seams (re-verify against real imports when built). All five are
CONSUMED, not absorbed — this story owns the BRIDGE (the proposed-unit capture, the id threading, the
chat-side dispatch glue, the accept affordance), never the SDK seam, the drive composition/stream, the
build worker, the desktop mount infrastructure, or the library schema. The "code physically hosted in
another story's package while declaring the `depends_on` edge" is the **studio-build precedent**
(studio-build owns its worker in `apps/studio/server` while `depends_on studio`).

- **`agent`** — the **headless-session organism that captures the proposal**. The non-spoofable
  proposed-unit signal physically lives in `packages/agent` (a new typed read-only tool +
  result-field capture, sibling to `orientation-tools.ts` / `headless-orchestrator.ts`) — FORCED by
  ADR-0004's single-import-site rule: the capture rides the SAME SDK `query()` session
  `runHeadlessOrchestrator` runs (it reads the agent's tool-use of a typed `propose_unit` tool), and
  every `@anthropic-ai/*` import lives in `packages/agent`, so it cannot live anywhere else. It REUSES
  the package's published seams: `buildOrientationTools` / `OrientationTool`
  (`packages/agent/src/orientation-tools.ts`), the `HeadlessOrchestratorResult` shape and the
  `createSdkMcpServer` + `tool` MCP wiring (`packages/agent/src/headless-orchestrator.ts`), and the
  injectable `SdkQueryFn` (`packages/agent/src/sdk-author.ts`) the offline proof scripts.
- **`drive-machinery`** — the **composition + stream the id threads through, AND the build entries the
  dispatch reuses**. The `proposedUnitId` is threaded through `orchestrate()`
  (`packages/drive/src/orchestrate.ts`, the `OrchestrateResult` type) and surfaced on
  `startChatStream`'s `done` event (`packages/drive/src/chat-stream.ts`, the `ChatStreamDoneEvent`
  type) — both physically in `@storytree/drive` (owned by `drive-machinery`; the `done` event is owned
  by headless-orchestrator's `chat-session-stream`, also drive-resident — this story EDITS that
  drive-resident code under the same "code hosted elsewhere" precedent). The DISPATCH reuses the public
  build entries `routedBuildRunner` drives — `storyBuild` / `nodeBuild` (`@storytree/drive/build`) —
  through the worker, never reaching inside the gate (ADR-0091). `@storytree/drive` imports NOTHING
  from `@storytree/cli` (ADR-0112's hard invariant).
- **`studio-build`** — the **build worker reused verbatim**. The chat dispatch is a SECOND caller of
  `routedBuildRunner` + `runBuildJob` + the `BuildRegistry` (cited as `apps/studio/server/buildWorker.ts`
  — *corrected 2026-07-26: relocated by ADR-0133 d.3 to `packages/drive/src/build-worker.ts`, exported as
  `@storytree/drive/build-worker`; `apps/studio/server/buildWorker.test.ts` is all that stayed behind*)
  and the `handleBuild` intake (`apps/studio/server/apiRouter.ts:1595`, `POST /api/build {unitId} → 202
  {runId}` + the `GET /api/build?runId` poll) behind the injected `BuildContext` (`devApi.ts:106`;
  `BuildContext` is now DEFINED at `build-worker.ts:379` and only re-exported by `apiRouter.ts:66`). It
  routes a STORY id → `story build --real` — the honest whole-story chain that PERSISTS real verdicts
  and opens the NON-DRAFT PR CI auto-merges (ADR-0022 / ADR-0090). This story adds a chat-driven
  *trigger* of that worker; it does not re-implement the worker or the build path.
- **`desktop`** — the **surface the chat + its build dispatch ship ON**. The chat is mounted on the
  desktop local backend (`POST /api/chat` via `createChatSseMount`, `apps/desktop/src/backend/
  chat-sse-mount.ts`) and rendered by the renderer chat panel (a studio frontend thin client). The
  bridge mounts the chat-side build dispatch + makes the accept affordance reach the worker on the SAME
  local backend — closing the seam where the studio mounts `/api/build` but not `/api/chat` and the
  desktop mounts `/api/chat` but disables build. *(Corrected 2026-07-26: the desktop no longer disables
  build — `apps/desktop/electron/backend-entry.ts:669` mounts `createBuildRouteMount(build)` for POST/GET
  `/api/build` beside the chat mount. The co-location seam is closed; the propose→accept handshake this
  story owned is what ADR-0155 retired. See the corrected note under "The seam where they fail to meet".)*
  This story OWNS the chat-build-dispatch glue
  physically hosted in `apps/desktop` (the mount) + `apps/studio/server` (the dispatch wiring) under
  the studio-build precedent, while the desktop story owns the surface those mounts hang on. The
  desktop renderer is held to ADR-0004 (`modelPathBoundary.test.ts`): the chat panel imports no
  agent/drive/model.
- **`library`** — the **work-hierarchy schema the dispatch validates against**. Buildability is
  resolved via `isStoryBuildable` / `resolveBuildConfig` (`@storytree/orchestrator` discovery, the
  same precheck `node build`/`story build` use) over the fixture corpus (`loadFixtureCorpus` over
  `@storytree/library`). The offline proofs render the SAME in-memory seed. CONSUMED — this story owns
  no schema and no discovery.

## UAT Test Criteria

> **DELETED — all five criteria, 2026-08-21, under
> [ADR-0396](../../docs/decisions/0396-a-retired-story-s-uat-criteria-are-deleted-with-their-ordina.md).**
> A UAT criterion is a standing acceptance OBLIGATION against a story's outcome, not a record of one.
> This story has been `status: retired` since ADR-0155 / PR #587, so its outcome is withdrawn and every
> criterion under it was an obligation against a journey nobody will run. The five legs that stood here
> — ordinals 1, 2, 3, 4 and 5; ordinal 6 was already burned by ADR-0348 D6 on 2026-08-11 — are deleted,
> and **every one of those ordinals is BURNED, never reused** (ADR-0396 D2): no
> `chat-drive-bridge#uat-<n>` key can ever denote a second criterion.
>
> **Nothing signed was destroyed.** All five read `proven=–` at deletion — no `events.verdict` row and
> no `events.attestation` row named any of their `criterionId`s. ADR-0396 D8 keeps a proof-bearing
> criterion in place when its story retires; none here was one.
>
> **Where the history is.** Each of the five positional keys is recorded `superseded` in
> `stories/uat-legacy-dispositions.json` with its rationale (the ledger still totals 282 keys), the legs
> themselves are in `git log -p` verbatim, and the one detail artifact they pointed at —
> `chat-drive-bridge#uat-5` — is retired in the live store with the same rationale. The body of this
> story is the narrative history and is kept in place; what is gone is the obligation, not the record.
>
> **This ADR is the answer to a question this story was carrying.** The leg that stood at ordinal 5
> ended with *"Whether a retired story's UAT legs should be DELETED (ordinals burned, as ADR-0348 D6 did
> for experience legs) or kept verbatim as history is a story-author / librarian disposition call,
> deliberately not made here."* It has now been made, and this is it.

**Goal (kept — what the journey was FOR) —** A chat conversation surfaces a proposal carrying a
machine-actionable unit id; the human accepts it with one explicit click; that click dispatches the
real drive worker; the spine observes RED→GREEN and signs; a non-draft PR opens for CI; and the build's
coarse progress streams back into the conversation — the human's click being the only path to the
build, and the agent having signed nothing.

### What the deleted legs established, carried up so it is not lost with them

These are the facts the per-leg records had established and that the rest of this body does not
otherwise carry (ADR-0396 D3), each dated to when it was written:

- **The whole accept-to-Build surface is GONE, and the negative assertions that survive exist to keep
  it gone.** ADR-0155 / PR #587 removed the `propose_unit` tool, the `proposedUnitId` field, the accept
  route and the ChatPanel Build button, and deleted every test that covered the four machine legs
  (`packages/agent/src/proposed-unit-signal.test.ts`,
  `packages/drive/src/proposal-id-threading.test.ts`,
  `apps/studio/src/components/ChatPanel.accept.test.tsx`). What is deliberately still asserted is the
  ABSENCE: `packages/agent/src/landing-tool-surface.test.ts:197` and
  `packages/drive/src/chat-stream.test.ts:475`.
- **The four machine legs were UNBOUND, and that was correct rather than a gap to close.** This story
  declares no `## Reliability Gates` section, so no leg ever carried a `proof-gate:` and
  `resolveWitness` reported every machine leg `refused`. Minting an `observe` gate over a surface that
  was deliberately deleted would be exactly the rubber-stamp ADR-0097 §2 bans. The tags stayed
  `machine` because `machine` was the RIGHT KIND of witness for what those legs asserted — a returned
  field, a stream event's field, a routing-and-refusal decision, and a DOM presence plus a call count
  all compile — and per ADR-0209 §6 they were UNSTAMPED. An open binding gap on a retired unit was the
  truthful state, not a defect.
- **A false coverage claim once stood here and was removed.** The section preamble used to say of the
  four machine legs *"the suites demonstrably cover them, so the adopt pass observe-and-signs them."*
  That had been false since PR #587. It was corrected in place on 2026-07-26 rather than left standing.
- **The spend on the live leg was UNDERSTATED as authored.** Since ADR-0144 a chat-accepted NODE id
  also routes to a persisting `--real` build, so there was no cheap variant of that walk.
- **IRREDUCIBLE and CURRENTLY UNWALKABLE are independent facts, and neither implies the other.** The
  leg at ordinal 5 was `human` because of spend and outward action, and *separately* could not be
  walked. ADR-0348 D6 deleted the leg at ordinal 6 on the FIRST kind of fact (an experience property is
  not an acceptance criterion), never on the second — unwalkability is recorded, never a deletion
  ground on its own. ADR-0396 deletes on a third ground again: the STORY is retired.

### The per-leg witness record, as it stood at deletion — history, describing a list that no longer exists

Read every sentence below as dated: it describes how the legs stood on 2026-08-13, not how anything
stands now.

The 2026-07-26 re-adjudication (ADR-0209 D8) left the classification UNCHANGED — the legs at ordinals
1–4 `witness: machine`, the legs at 5–6 `witness: human`, none `either`, none `model` (`witness: model`
is unreachable through the story schema, whose parser accepts only `human|machine|either`). What
changed was that the tags became ARGUED rather than inherited, and the false coverage claim above was
removed.

**The leg at ordinal 5 stayed `human` on SPEND and OUTWARD ACTION** — real metered subscription spend,
and an outward-facing action (the worker opens a NON-DRAFT PR that CI auto-merges onto the trunk,
ADR-0022) — and on neither a judgment gap nor a harness gap. That basis was recorded separately from
irreducibility on purpose: a spend/outward basis DISSOLVES if the spend and the outward write go away,
whereas a no-compiler basis dissolves under neither. **ADR-0348 D2/D3 then withdrew both halves**, and
the ADR-0357 triage of 2026-08-13 found that the leg still did not flip, because the journey cannot be
walked at all — binding a `machine` gate would mint one that can never go green for a reason that is
neither a harness limit nor a product defect, the indistinguishable red ADR-0357 exists to control. The
triage recorded a third answer that neither of ADR-0348's two fits: MOOT. ADR-0396 is what that third
answer resolves to.

**The leg at ordinal 6 was `human` on the NO-COMPILER basis, and on that basis alone** — not spend
(rendering the panel bills nothing), not liveness, not a missing harness: whether the proposal card,
the Build button and the live progress *read* as one coherent accept-and-watch experience is an
ADR-0070 stage-2 aesthetic verdict with no oracle. **ADR-0348 D6 deleted it because that was never
enough** — a no-compiler property still has to be an ACCEPTANCE claim before its witness matters at
all, and this one was not. Its intent survives under "The accept-and-watch feel" below.

**ZERO splits, and the reason.** The legs at 5 and 6 each fused a compiled half with an irreducible
half — but in every case the compiled half already had its own machine leg in this same story: the leg
at ordinal 3 for the dispatch's validate/route/refuse, the coarse-progress fold and the no-verdict-path
wall; the leg at ordinal 4 for the conditional Build affordance, the single accepted-id POST, the
progress render and the no-free-text-path wall. Splitting those out as fresh human success conditions
would have laundered compiled facts into unrepeatable signatures.

The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the
machine-driven whole-story UAT node stayed withheld; the crown derived from the per-leg roll-up, and
now derives from the ADR-0085 own-proof union over a story that declares no criteria (ADR-0294 D5).

### The accept-and-watch feel — design intent, deliberately NOT a UAT leg (ADR-0348 D6)

The appearance intent that stood as ordinal 6 until 2026-08-11 is recorded here so it is not lost with
its leg. **The proposal card, the Build button and the live build progress should read well inside the
native shell: the approval gate should be LEGIBLE — it should *read* as a deliberate authorization
rather than as one more chat reply — the progress should feel alive, and the journey from proposal to
landed PR should be coherent as ONE conversation.** The legibility half matters more than most look
verdicts, because this surface is where a human authorizes a real, billed, trunk-landing build; an
approval affordance that reads like a chat bubble is a safety problem wearing an aesthetic costume.

The machine leg that stood at ordinal 4 pinned the mechanical wall underneath it — the Build affordance
is conditional, a single accepted-id POST is the only path, the progress renders, and there is no
free-text path to a build. That is the fact that only the click triggers a build; it is NOT the claim
that a reader recognises the click as an authorization. Under ADR-0348 D6 the second is not an
acceptance criterion, and no component author ever signs a visual verdict either way.

**This intent was never walked, and that is a RETIREMENT, not a pass.** ADR-0155 / PR #587 removed the
`propose_unit` tool, the `proposedUnitId` field, the accept route and the ChatPanel Build button; the
negative assertions that survive (`packages/agent/src/landing-tool-surface.test.ts:197`,
`packages/drive/src/chat-stream.test.ts:475`) exist to keep them gone. **The experience this intent
describes does not exist to be looked at.** Nobody has judged it, nobody can, and the absence of a
verdict must not later be misread as approval (ADR-0348 Consequences). If the accept-and-watch loop is
ever rebuilt, this paragraph is the brief for what it should feel like.

**End state, as authored —** a chat conversation drove a real, spine-signed, CI-landing build off one
explicit human click on a proposal the agent declared a machine-actionable id for, with progress
streamed back the whole way — every wall held (the agent declared but did not accept; the human's click
was the only path to the build; the spine signed, the agent did not; CI is the second proof before the
trunk). *(Authored goal, never a record of achievement: the story is retired, its surface deleted, and
it now carries no criteria at all.)*

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes — the offline legs (1–4)
green under the package + server + component suites and the live driven-landing (5) operator-attested —
with the capabilities' integration tests and contracts green underneath. *(The appearance leg that stood
at 6 was deleted by ADR-0348 D6 on 2026-08-11; it is design intent above, not a proof obligation.)* The
capability/contract obligations are minimal-to-green (slow growth): the proposed-unit capture and the
id threading are isolatable and machine-provable over an injected `queryFn` + the in-memory seed; the
dispatch is an integration test against the real worker registry + the real discovery/seed with the
build runner injected (a scripted double — ADR-0010 §5, so a live SDK-billed build is never run on a
gate pass); the affordance's geometry/behaviour is a component/behaviour test, its appearance the
human-witness UAT leg until ADR-0348 D6, and design intent since. *(This whole paragraph is
authoring-time history: since ADR-0396, 2026-08-21, the story carries no UAT criteria at all.)*

**Honest status — `retired` (ADR-0155); authored as `proposed`.** *(Header corrected 2026-07-26 — see
the same correction above. Everything the paragraph says about `healthy` remains exactly true; only the
status word was stale.)* Nothing here is `healthy`: per ADR-0020, `healthy` is only ever DERIVED
from signed verdicts, and this story has none yet. The four capabilities are proof-wired so the spine
can drive their offline suites red→green under its own gate
(`pnpm storytree story build chat-drive-bridge --real`); the story's own machine-driven UAT node is
WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving the four capabilities to a signed
verdict is what makes the WHOLE story buildable, and the crown additionally awaits the operator's one
attestation on the live leg — `healthy` is never authored here. *(Authoring-time history: the story and
all four capabilities are `retired`, the surface was deleted in PR #587, and since ADR-0396 the story
declares no criteria, so no attestation is owed and the `story build --real` command quoted above cannot
run.)*

## Open modeling calls (for the owner)

The PLACEMENT calls below were decided minimally and are RECORDED here as decided-and-surfaced (they
are forced by existing decisions, reversible, and internal — not re-litigated per the owner-fork bar):

1. **The proposed-unit SIGNAL lives in `packages/agent` (decided).** The typed read-only `propose_unit`
   tool + the result-field capture are a new module/edit in `packages/agent`, sibling to
   `orientation-tools.ts` / `headless-orchestrator.ts`. FORCED by ADR-0004's single-import-site rule —
   the capture rides the same SDK session, and every `@anthropic-ai/*` import lives in `packages/agent`.
   Surfaced (not re-opened) so the boundary is visible.
2. **The threading EDITS drive-resident code owned by headless-orchestrator (decided).** The
   `proposedUnitId` is carried through `orchestrate()` (`OrchestrateResult`) and onto
   `startChatStream`'s `done` event (`ChatStreamDoneEvent`) — both physically in `@storytree/drive`,
   owned by headless-orchestrator's `orchestrator-composition` / `chat-session-stream`. This story EDITS
   those drive-resident files (additive: a new optional field) under the same "code hosted in another
   story's package → declare the edge" precedent. It does NOT fork the composition or the stream. The
   `drive-machinery` edge covers the physical host; the consumed-surface owner is headless-orchestrator
   (reached transitively via desktop's existing edge). Surfaced (not re-opened).
3. **The chat-side build dispatch + mount are hosted in `apps/studio/server` + `apps/desktop` (decided).**
   The dispatch reuses the EXISTING worker (`routedBuildRunner` / `runBuildJob` / `handleBuild`) — a
   second caller, not a new build path — wired so both `/api/chat` (propose) and the build dispatch sit
   on the SAME desktop local backend (ADR-0113, where the thick client ships). This is the studio-build
   precedent (own glue physically in a surface package while declaring the edge). Surfaced (not
   re-opened).
4. **~~NOT resolved here — the live OrientationRunner fork.~~ CLOSED — resolved elsewhere; struck
   2026-07-26 (ADR-0209 D8 pass), and it is no longer an open call for the owner.** As authored this
   read: *"`createChatSseMount` accepts only `{ queryFn? }` and cannot forward an `OrientationRunner`, so
   a LIVE chat session's orientation tools fall back to the no-op stub (`backend-entry.ts:226–231`)"*,
   and deferred the wiring to a separate fork. Every load-bearing part of that is false at HEAD — the
   mount takes a `runner?: SseOrientationRunner` (`chat-sse-mount.ts:218`), a real one is built at
   `apps/desktop/electron/backend-entry.ts:570` and passed at `:1057–1063`, and the cited file path and
   line range were wrong even when written (see the corrected limitation note in "What this is" above).
   Nothing is owed here: the fork was resolved by the desktop/headless-orchestrator line of work, not by
   this retired story. No new ADR is warranted — ADR-0108 already designed Phase 3+4, and the placement
   calls in 1–3 land inside the already-accepted ADR-0108 / ADR-0112 / ADR-0113 frame.

This story stays a **pure source node** — nothing depends on it — so the new edges (`agent`,
`drive-machinery`, `studio-build`, `desktop`, `library`) introduce no cycle (ADR-0058): `desktop`
already depends on `headless-orchestrator`, and every edge flows DOWN toward the roots; nothing flows
back up to the bridge.
