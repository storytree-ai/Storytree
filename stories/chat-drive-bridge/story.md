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
# tests went with PR #587. The relocated `dispatchAcceptedBuild` worker call REMAINS live under
# desktop-build-mount / builder-spawn-dispatch — only the chat propose/accept front retired. Body kept as
# history. The live legs 5–6 (operator-attested) are moot: the accept-to-land experience they attested no
# longer exists.
status: retired
proof_mode: UAT
# Per-leg witness (ADR-0106): the offline mechanics legs (the non-spoofable proposed-unit signal, the
# threading through the stream, the dispatch routing/validation, the progress fold) are machine-
# witnessed by the package + server suites over an injected queryFn / scripted build runner. The
# accept-to-land AFFORDANCE's APPEARANCE (the proposal card + the Build button's look/feel, the live-
# progress feel) is human-witness (operator-attested, ADR-0070), exactly like headless-orchestrator's
# leg 4 — its GEOMETRY/BEHAVIOUR (the button dispatches a build, progress renders) is machine-witnessed.
# The story-level uat_witness is absent → human (the ADR-0040 fail-closed signpost), so the machine-
# driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up.
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
#                    `runBuildJob` + the `BuildRegistry` (apps/studio/server/buildWorker.ts), which
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

- **The PROPOSE end (built, read/propose only).** `runHeadlessOrchestrator`
  (`packages/agent/src/headless-orchestrator.ts`) runs the `session-orchestrator` agent headlessly and
  returns `HeadlessOrchestratorResult { ok, proposal?, costUsd?, turns? }` — capturing only the SDK
  session's final **free text** `result.result`. The orientation surface (`buildOrientationTools`,
  `packages/agent/src/orientation-tools.ts`) is exactly THREE read tools (tree / library / noticeboard),
  each with an EMPTY input schema. `orchestrate()` (`packages/drive/src/orchestrate.ts`) threads the
  result through; `startChatStream` (`packages/drive/src/chat-stream.ts`) yields a terminal `done` event
  carrying `proposal` / `costUsd` / `turns`; `createChatSseMount` (`apps/desktop/src/backend/
  chat-sse-mount.ts`) serialises those as SSE on `POST /api/chat`; the `ChatPanel`
  (`apps/studio/src/components/ChatPanel.tsx`) renders the `done` proposal text. The proposal is
  **free text** — there is no machine-actionable unit id anywhere in this chain.
- **The DRIVE end (built).** `routedBuildRunner` (`apps/studio/server/buildWorker.ts`) routes a STORY
  id → `story build --real` (persists real verdicts to `events.verdict`, opens a NON-DRAFT PR that CI
  auto-merges — ADR-0022; "clicking Build IS the approval to land") and a NODE id → `node build --live`
  (synthetic, non-persisting); `runBuildJob` runs it fire-and-forget, streaming COARSE progress into a
  `BuildRegistry`. `handleBuild` (`apps/studio/server/apiRouter.ts`) is `POST /api/build {unitId} → 202
  {runId}` + `GET /api/build?runId → { status, transcript, envelope }`, behind the injected
  `BuildContext { registry, runner: routedBuildRunner, isBuildable }` wired by `devApi.ts`.

**The seam where they fail to meet:** the studio dev server mounts `/api/build` (drive) but NOT
`/api/chat` (propose); the desktop backend (`backend-entry.ts`) mounts `/api/chat` (propose) but build
is DISABLED. The bridge must put both halves on the **same surface** (the desktop local backend, where
the thick client ships, ADR-0113) and connect them: a non-spoofable proposed unit id out of the agent,
threaded to the client, an explicit human accept that dispatches the worker, and the build's progress
streamed back into the conversation.

**A known, recorded limitation this story's first increment lives next to** (`backend-entry.ts:226–231`):
the landed `createChatSseMount` accepts only `{ queryFn? }` — it cannot yet forward an
`OrientationRunner`, so a live session's orientation tools fall back to the no-op stub and the agent
cannot read the live tree/library/board. That live-runner wiring is a SEPARATE deferred fork (the
`OrientationRunner` is the CLI `run()`, which neither desktop nor `@storytree/drive` may import —
headless-orchestrator §"Open modeling calls" pins the resolution shape). This story does NOT resolve
that fork; its offline proofs script the `queryFn` and its live leg is operator-attested, exactly the
headless-orchestrator posture. (Wiring the live orientation runner is a clean follow-on, not this
story's journey.)

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
  the proposal card + the button's look/feel, the live-progress feel inside the native shell — is
  **operator-attested / human-witness** (the Story UAT leg, ADR-0070), exactly like
  headless-orchestrator's live leg 4.

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
operator's attestation of the affordance; it is never authored (ADR-0020).

## Capabilities (4)

Listed roots-first (a capability appears after everything it depends on). All four are **proof-wired**
(ADR-0057 — each carries a `proof:` block with a `real:` arm describing a genuine additive net-new
red→green against the real package/app source), so they form a **dependency-closed, acyclic set in
which every member resolves a `real:` arm** — exactly what makes the WHOLE story story-`real`-buildable
(`isStoryBuildable`). The affordance's APPEARANCE is NOT a separate capability (it has no isolatable
red→green — it is the human-witness Story UAT leg, mirroring headless-orchestrator's live leg 4); the
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
  `routedBuildRunner` + `runBuildJob` + the `BuildRegistry` (`apps/studio/server/buildWorker.ts`) and
  the `handleBuild` intake (`apps/studio/server/apiRouter.ts`, `POST /api/build {unitId} → 202
  {runId}` + the `GET /api/build?runId` poll) behind the injected `BuildContext` (`devApi.ts`). It
  routes a STORY id → `story build --real` — the honest whole-story chain that PERSISTS real verdicts
  and opens the NON-DRAFT PR CI auto-merges (ADR-0022 / ADR-0090). This story adds a chat-driven
  *trigger* of that worker; it does not re-implement the worker or the build path.
- **`desktop`** — the **surface the chat + its build dispatch ship ON**. The chat is mounted on the
  desktop local backend (`POST /api/chat` via `createChatSseMount`, `apps/desktop/src/backend/
  chat-sse-mount.ts`) and rendered by the renderer chat panel (a studio frontend thin client). The
  bridge mounts the chat-side build dispatch + makes the accept affordance reach the worker on the SAME
  local backend — closing the seam where the studio mounts `/api/build` but not `/api/chat` and the
  desktop mounts `/api/chat` but disables build. This story OWNS the chat-build-dispatch glue
  physically hosted in `apps/desktop` (the mount) + `apps/studio/server` (the dispatch wiring) under
  the studio-build precedent, while the desktop story owns the surface those mounts hang on. The
  desktop renderer is held to ADR-0004 (`modelPathBoundary.test.ts`): the chat panel imports no
  agent/drive/model.
- **`library`** — the **work-hierarchy schema the dispatch validates against**. Buildability is
  resolved via `isStoryBuildable` / `resolveBuildConfig` (`@storytree/orchestrator` discovery, the
  same precheck `node build`/`story build` use) over the seed corpus (`loadCorpus` over
  `@storytree/library`). The offline proofs render the SAME in-memory seed. CONSUMED — this story owns
  no schema and no discovery.

## Story UAT

The integrated **acceptance walkthrough** that proves the whole `chat-drive-bridge` — the Phase 3+4
propose→accept→drive→sign→land loop — meets its outcome end-to-end. It is minimal-first (one coherent
journey: chat proposes a unit id → human clicks Build → worker drives → spine signs → PR opens →
progress streams back), defect-driven thereafter (each real failure earns a permanent regression case,
never speculative breadth). Mocks are forbidden in the consumed seams that CAN run offline: the
dispatch routes to the REAL worker registry over the REAL discovery + seed corpus; the threaded id is
the REAL `orchestrate` → `startChatStream` chain. Only the SDK `query()` is scripted offline (the paid
leaf can't be a free standing test) and the real drive + the affordance's appearance are exercised live
in the operator-attested legs.

> **HONEST status — `proposed`, propose-accept-then-drive, part-scripted / part-attested.** The offline
> legs (1–4) are automatable by the package + server suites (`@storytree/agent` + `@storytree/drive` +
> `apps/studio/server` + the desktop/studio component suite) over an injected `queryFn` + scripted
> build runner + the in-memory seed. Leg 5 — a REAL chat conversation whose proposal the operator
> ACCEPTS with a click, driving a REAL `story build --real` to a spine-signed verdict + an opened PR,
> with progress streamed back — is **operator-attested** (subscription-billed AND it lands real work;
> an agent should not burn the spend or open a PR unattended), NOT a standing test. Leg 6 (the
> affordance's APPEARANCE) is operator-attested under ADR-0070. This UAT is therefore part-scripted,
> part-attested — the `agent`/`headless-orchestrator`/`studio-build` honesty pattern.
>
> **Per-leg witness (ADR-0106).** Legs 1–4 are `witness: machine` — the suites demonstrably cover
> them, so the adopt pass observe-and-signs them. Legs 5–6 are `witness: human` — the live driven
> landing and the appearance are experiential/operator-attested with no standing offline test, so they
> (and they alone) await the operator's "I saw it work" (ADR-0082). No leg rests `either`. The
> story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the machine-
> driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up.

**Goal —** A chat conversation surfaces a proposal carrying a machine-actionable unit id; the human
accepts it with one explicit click; that click dispatches the real drive worker; the spine observes
RED→GREEN and signs; a non-draft PR opens for CI; and the build's coarse progress streams back into the
conversation — the human's click being the only path to the build, and the agent having signed nothing.

1. **The agent declares a non-spoofable proposed unit id.** _(witness: machine)_ Drive the headless
   orchestrator with a scripted `queryFn` whose session invokes the typed `propose_unit({ unitId })`
   read-only tool, then ends. **Success —** the runner returns `{ ok: true, proposal: <text>,
   proposedUnitId: <id> }` — the id comes from the agent's structural tool invocation (a typed signal),
   NOT from parsing the free-text proposal; the tool is read-only (no write tool exists on the surface);
   and a session that never calls `propose_unit` returns `proposedUnitId: undefined` (no forged id).
2. **The id is threaded to the stream's terminal `done` event.** _(witness: machine)_ Drive
   `startChatStream` (through `orchestrate`) with the same scripted session. **Success —** the terminal
   `done` event carries `proposedUnitId` alongside `proposal` / `costUsd` / `turns`, reusing the
   Phase-1/2 chain verbatim (the real `session-orchestrator` render, no fork) — so the SSE wire delivers
   a machine-actionable id to the client.
3. **A human-accepted id dispatches the real worker and streams progress back.** _(witness: machine)_
   Call the chat-side build dispatch with an ACCEPTED unit id and an injected scripted build runner over
   the real registry + the real discovery/seed. **Success —** the dispatch validates the unit is
   buildable, routes it to `runBuildJob` against the registry (returning a runId), the worker's coarse
   progress lines are forwarded back over the chat surface, and an UN-buildable / unknown id is refused
   with a typed error (never dispatched) — the dispatch is a build INTENT only (no signing key, no
   verdict path).
4. **The accept affordance is the only path to the build, and it is explicit.** _(witness: machine)_
   Render the chat thin client given a `done` frame carrying a `proposedUnitId`. **Success —** a Build
   affordance appears ONLY because the frame carries a `proposedUnitId` (a `done` frame without one
   shows no Build button); clicking it POSTs the accepted id through the `api` seam (the dispatch) and
   the panel renders the dispatched run's progress; there is NO code path by which a free-text "yes"
   parsed from the conversation triggers a build (ADR-0108 d.3); and the thin client imports no
   agent/drive/model (ADR-0004).
5. **Live: a chat proposal, accepted by a click, drives a real signed build and opens a PR.**
   _(witness: human)_ In the desktop app, hold a REAL chat conversation (a real subscription `query()`),
   get a proposal carrying a unit id, and CLICK Build to accept it. **Success —** the click dispatches
   `story build --real` on the real worker, the spine observes RED→GREEN and SIGNS a verdict persisted
   to `events.verdict`, a NON-DRAFT PR opens for CI to auto-merge (ADR-0022), the build's coarse
   progress streams back into the conversation to that signed verdict + opened PR — and the AGENT signed
   nothing, handed in no verdict, and did not land without the human's click (ADR-0091 / ADR-0108 d.3).
   *(operator-attested — a real driven build is subscription-billed AND lands real work; an agent should
   not burn the spend or open a PR unattended.)*
6. **The chat surface reads as one accept-and-watch experience.** _(witness: human)_ **Success —** the
   proposal card, the Build button, and the live build progress read well inside the native shell — the
   approval gate is legible (it is clearly a deliberate click, not a chat reply), the progress feels
   alive, and the journey from proposal to landed PR is coherent in one conversation. *(operator-attested
   appearance, ADR-0070 — the component author signs no visual verdict.)*

End state — a chat conversation drove a real, spine-signed, CI-landing build off one explicit human
click on a proposal the agent declared a machine-actionable id for, with progress streamed back the
whole way — every wall held (the agent declared but did not accept; the human's click was the only path
to the build; the spine signed, the agent did not; CI is the second proof before the trunk).

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes — the offline legs (1–4)
green under the package + server + component suites, the live driven-landing (5) and the appearance (6)
operator-attested — with the capabilities' integration tests and contracts green underneath. The
capability/contract obligations are minimal-to-green (slow growth): the proposed-unit capture and the
id threading are isolatable and machine-provable over an injected `queryFn` + the in-memory seed; the
dispatch is an integration test against the real worker registry + the real discovery/seed with the
build runner injected (a scripted double — ADR-0010 §5, so a live SDK-billed build is never run on a
gate pass); the affordance's geometry/behaviour is a component/behaviour test, its appearance the
human-witness UAT leg.

**Honest status — `proposed`.** Nothing here is `healthy`: per ADR-0020, `healthy` is only ever DERIVED
from signed verdicts, and this story has none yet. The four capabilities are proof-wired so the spine
can drive their offline suites red→green under its own gate
(`pnpm storytree story build chat-drive-bridge --real`); the story's own machine-driven UAT node is
WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving the four capabilities to a signed
verdict is what makes the WHOLE story buildable, and the crown additionally awaits the operator's
attestation (legs 5–6) — `healthy` is never authored here.

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
4. **NOT resolved here — the live OrientationRunner fork.** `createChatSseMount` accepts only
   `{ queryFn? }` and cannot forward an `OrientationRunner`, so a LIVE chat session's orientation tools
   fall back to the no-op stub (`backend-entry.ts:226–231`). That live-runner wiring is a SEPARATE
   deferred fork (the runner is the CLI `run()`, which neither desktop nor `@storytree/drive` may
   import; the resolution shape — a `buildOrientationRunner` composed from the organism reads in
   `@storytree/drive` — is pinned in headless-orchestrator's §"Open modeling calls" call 3). This story
   does NOT depend on resolving it: its offline proofs script the `queryFn`, and its live leg is
   operator-attested (the agent proposes off its system prompt; live-state orientation is the
   follow-on). No new ADR is warranted — ADR-0108 already designed Phase 3+4, and the placement calls
   land inside the already-accepted ADR-0108 / ADR-0112 / ADR-0113 frame.

This story stays a **pure source node** — nothing depends on it — so the new edges (`agent`,
`drive-machinery`, `studio-build`, `desktop`, `library`) introduce no cycle (ADR-0058): `desktop`
already depends on `headless-orchestrator`, and every edge flows DOWN toward the roots; nothing flows
back up to the bridge.
