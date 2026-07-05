---
id: "studio-build"
tier: story
title: "UI-driven build (the local loop)"
outcome: "An operator triggers a real node build from the studio UI and watches it run live to a signed verdict on their own machine."
status: proposed
proof_mode: UAT
capabilities: [build-run-registry, build-intent-api, ui-build-trigger]
# Story-level edges (ADR-0010 §4 — consumed cross-story seams, encoded as frontmatter
# depends_on; see "Cross-story boundary" below for the import-evidence at file:line):
#   - studio          — the UI/server organism this extends: the build button + transcript live
#                       in apps/studio/src/components/TreeView.tsx's island side panel, and the
#                       new endpoints hang off the SINGLE /api/* route table (apiRouter.ts,
#                       ApiContext), the same table the world's /api/tree + /api/activity serve.
#   - drive-machinery — the build path(s) the worker drives: it ROUTES by unit kind
#                       (routedBuildRunner, buildWorker.ts:144) — a node → EXISTING
#                       `nodeBuild(... --live)`, a story → EXISTING `storyBuild(... --real, openPr)`
#                       (the `story-real-chain` that lands via an auto-merging PR, ADR-0022/0031).
#   (notice-board     — the in-flight `building` teal wisp (ADR-0048) — is REUSED, not consumed by this
#                       story's own code: the work-event is appended inside drive's driveNode and read
#                       via studio's /api/activity, both behind declared edges (drive-machinery,
#                       studio); no new wisp code here, so the edge is transitive, not re-declared —
#                       redundant-transitive edge removed, 2026-07-05 map-health cleanup.)
#   - library         — the verdict SHAPE (events.verdict) + the work-hierarchy spec the build
#                       drives are library's; the worker reflects the new hue via the existing
#                       /api/tree latestVerdicts path.
depends_on: [studio, drive-machinery, library]
# Deciding ADRs (ADR-0037 §2): UI-driven orchestration shape (90), proof-bearing-worker
# integrity (91), the orchestrator/agent boundary preserved (4), and UI-drives-agents (8).
decisions: [8, 90, 91, 4]
---

# UI-driven build (the local loop)

**Outcome —** An operator triggers a real node build from the studio UI and watches it run live to
a signed verdict on their own machine.

## What this is

This is **ADR-0090's UI-driven orchestration** ("hosted build-capable backend, thin clients")
brought into the studio — *the local loop, plus story-scoped approve-to-land*. Today's terminal
trigger (`pnpm storytree node build <id> --live`) moves into the studio UI behind a THIN client + a
server-process WORKER, on the operator's OWN machine at flat subscription cost — no hosting, no
cloud credentials, no multi-tenant. The control is **scope-routed** (`routedBuildRunner`,
`apps/studio/server/buildWorker.ts:144`): a drilled-in capability runs the Phase-1 `--live`
single-node pipeline smoke; a selected story runs `story build <id> --real` and, on a green chain,
opens an auto-merging PR — the **Phase-2 approve-to-land** increment PRs #299 + #300 landed (see
"Scope, honestly" below). The mechanics below were authored Phase-1-first; the realized shape now
covers both scopes.

The shape, decided in ADR-0090 (owner + orchestrator) and **encoded here, not re-designed**:

- **Thin client → intent.** The studio frontend (`apps/studio/src`) posts a build INTENT —
  `POST /api/build { unitId }` — to the local backend. The frontend NEVER imports
  `packages/agent` (ADR-0004 / ADR-0090 d.2); the build button + a live transcript panel live in
  the EXISTING island side panel (`apps/studio/src/components/TreeView.tsx`, the
  `<aside className="tree-detail">` that already shows status, the UAT verdict line, and the
  capability sub-DAG).
- **Server-process worker = the single orchestrator boundary.** A worker in the studio SERVER
  process (`apps/studio/server`) picks up the intent and runs the EXISTING `--live` build path —
  the same thing `pnpm storytree node build <id> --live` does today
  (`packages/drive/src/node-build.ts` → `nodeBuild` → `driveNode` → `proveUnit`). A real Claude
  Agent SDK leaf authors the synthetic `add(2,3)` pair through the real prove-it-gate, the spine
  observes the genuine red→green and SIGNS, and a REAL signed verdict for the node persists to
  `events.verdict` (ADR-0091's "the verdict is produced by the gate, never handed in"). The worker
  is the single model boundary; the UI holds no model-invocation path.
- **Live progress = reuse + a thin read path.** The in-flight `building` work-event already lights
  the teal wisp (ADR-0048) via `/api/activity`, and `/api/tree`'s `latestVerdicts` already reflects
  the signed verdict hue — both are REUSED, not rebuilt. A NEW build-status read endpoint
  (`GET /api/build?runId=…`) returns a COARSE transcript (phase/progress lines + the final build
  envelope) that the UI POLLS while the build runs (owner's call: coarse + polled, no websocket).

**Scope, honestly (ADR-0090 phases).** The **node (capability) path** stays the Phase-1 `--live`
local smoke — a single-node build that proves the build PIPELINE on a synthetic task, no land. The
**story path REACHED FORWARD to ADR-0090 Phase 2 — approve-to-land** (PRs #299 + #300): selecting a
story (no cap drilled) and clicking **Build** runs `story build <id> --real`, which authors each
capability for real in a worktree and, on a GREEN chain, opens a **non-draft PR that CI auto-merges
to trunk** (ADR-0022; `claude/real/*` promotion branches merge non-squash per ADR-0031). Clicking
Build IS the approval to land — ADR-0090's "the human still owns accept-to-land" is preserved (the
click is the deliberate, owner-attested human action). STILL out of scope: hosted / multi-tenant /
cloud-auth (Phase 3); no `--real` toggle on a single node; no manual `gh pr merge`; the frontend
holds no model-invocation path — the agent runs only in the server/worker process.

## Honest proof posture — `proposed`, with the mechanics LANDED

This spec was authored FIRST, before any implementation, to bound the journey and size the units;
the implementation then LANDED (PRs #297 / #299 / #300), and the spec is now reconciled to it.
Every contract below describes the isolated unit test that proves a leaf; the capability describes
the integration test that proves it against real in-story collaborators; the story UAT below
describes the acceptance walkthrough that proves the whole loop against the real running studio.
The geometry/behaviour of all this is machine-witnessed and green. Status stays `proposed` for
every unit — not because code is missing, but because `healthy` is earned through the prove-it-gate
AND the still-pending operator obligations (the APPEARANCE attestation per ADR-0070, and the
live-run UAT, a subscription-billed human-witness action); it is never authored. The build-path
collaborators (`nodeBuild`, `storyBuild`, the spine, the SDK leaf) already existed and are real;
what this story added is the worker that ROUTES and drives them from the server process and the UI
that triggers them.

## Capabilities (3)

Listed roots-first (a capability appears after everything it depends on).

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`build-run-registry`](build-run-registry.md) | A server-side build run accumulates its coarse transcript and reaches a terminal verdict, with one build at a time. | — |
| 2 | [`build-intent-api`](build-intent-api.md) | An operator dispatches a build intent and reads its live status over the studio API. | `build-run-registry` |
| 3 | [`ui-build-trigger`](ui-build-trigger.md) | An operator triggers a build from the island panel and watches it run live to a verdict. | `build-intent-api` |

## Dependency graph (will be code-derived)

These are **within-story** edges. Until the code exists they are authored from the intended
data-flow; when the units are built they MUST be re-derived from the real imports/calls between
capabilities (static analysis, ADR-0010 §3) and corrected if the code disagrees. The graph is
acyclic; `build-run-registry` is the root (the leaf state machine, no in-story upstream).

- `build-intent-api` → `build-run-registry`
  - The API handlers (`POST /api/build`, `GET /api/build`) are the thin HTTP shell over the
    registry: POST calls the registry's `createRun` + spawns the worker against it; GET reads the
    registry's transcript + status for a `runId`. The API owns no run state of its own — it is the
    registry's transport, so it couples directly to the registry's surface.
- `ui-build-trigger` → `build-intent-api`
  - The frontend's Build button calls `POST /api/build` and the transcript panel polls
    `GET /api/build?runId=…` (through the existing `api.ts` client). The UI imports NO build code
    (ADR-0004 / ADR-0090 d.2) — its only path to a build is the API, so the trigger couples to the
    API and to nothing deeper.

## Cross-story boundary (ADR-0010 §4)

Authored from the intended consumed seams (re-verify against real imports when built). All four seams
are CONSUMED, not absorbed — three as declared `depends_on` edges; the notice-board wisp surface is
reached transitively through drive-machinery / studio (see its bullet) — and this story owns the
worker + the trigger UI, never the build engine, the spine, the wisp pipeline, or the verdict schema.

- **`studio`** — the **UI/server organism** this extends. The new endpoints are added to the SINGLE
  `/api/*` route table (`apps/studio/server/apiRouter.ts`'s `handleApiRequest` + `ApiContext`) that
  both fronts wire — the Vite dev plugin (`devApi.ts`) and the hosted server (`serve.ts`) — so the
  build endpoints are defined ONCE and the worker hangs off `ApiContext`, like `dbWake`/`invites`.
  The Build button + transcript live in the studio's island side panel
  (`apps/studio/src/components/TreeView.tsx`).
- **`drive-machinery`** — the **build path(s) the worker drives**. The worker ROUTES by unit kind
  (`routedBuildRunner`, `apps/studio/server/buildWorker.ts:144`): a NODE id → the EXISTING
  `nodeBuild(unitId, { live: true, … })` (`packages/drive/src/node-build.ts`) — the same path
  `storytree node build <id> --live` runs (→ `driveNode` → `resolveProveSpec` → `proveUnit`, the
  spine observing red/green and signing); a STORY id → the EXISTING `storyBuild(id, { real: true,
  openPr: true, … })` whole-story chain (drive-machinery's `story-real-chain`, topo-ordered from
  `depends_on`), which authors each capability for real, promotes the proven branch, and opens the
  auto-merging PR (ADR-0022 / ADR-0031). The worker NEVER reaches inside the gate or the chain/
  promote/merge engine; it calls the same public entries the CLI does and OWNS only the routing.
  Discovery of which kind a unit is, and whether a story is real-buildable
  (`isStoryBuildable(spec, caps, 'real')`, `packages/orchestrator/src/story-build.ts:234`), are
  drive-machinery's too — consumed, not reimplemented.
- **`notice-board`** *(transitive — reused, not consumed by this story's own code: the work-event is
  appended by drive's `driveNode` and read via studio's `/api/activity`, both behind declared edges)*
  — the **in-flight wisp surface**. `driveNode` already appends the `building`
  work-event that lights the teal wisp (ADR-0048), read by the world via `/api/activity`
  (`inFlightBuilds()` over `PgPresenceStore` / `classifyPresence`). Phase 1 REUSES it — no new wisp
  code; the live build simply produces the marks the existing pipeline already paints.
- **`library`** — the **verdict shape + work-hierarchy spec**. The signed verdict lands in
  `events.verdict` (the proof-protocol shape library owns) and the world reflects the new hue
  through the EXISTING `/api/tree` `latestVerdicts` path. The build also drives a real node spec
  loaded from `stories/` (`loadNodeSpec`).

## Story UAT

The integrated **acceptance walkthrough** that proves the whole `studio-build` organism — the Phase
1 local loop — meets its outcome end-to-end against the **real running studio** and the **real build
path**. It is minimal-first (one coherent operator journey: trigger → watch → verdict), defect-
driven thereafter (each real failure earns a permanent regression case, never speculative breadth).
Mocks are forbidden: the build is a REAL `--live` build (the SDK leaf genuinely authors, the spine
genuinely signs); the consumed cross-story seams are exercised real.

> **Witness note (ADR-0070).** The build MECHANICS — intent accepted, run reaches a signed verdict,
> transcript polled, hue/status updated — are agent-drivable and machine-witnessed. The studio
> button/transcript **appearance** (does the panel read well, does the live transcript feel alive)
> is NOT self-signed: it is **operator-attested** per ADR-0070's two-stage proof — the agent builds
> the look behind the existing studio surface, surfaces it, and STOPS; the owner's nod is the visual
> verdict. The owner attesting the live build run is itself a **human-witness UAT action** (a real
> `--live` build is subscription-billed; an agent should not burn the spend unattended).

**Goal —** One operator, against `pnpm --filter studio dev` with the live DB up (`pnpm db:up`),
selects a buildable node in the studio world, clicks **Build** in the island side panel, watches a
coarse live transcript stream the phase trail, and sees the run finish at a real signed verdict —
the node's hue updating in the world — entirely on their own machine.

1. Start the studio with the live store up: `pnpm db:up`, then `pnpm --filter studio dev` (the live
   backend is the default). **Success —** the data-api line logs `library/comments → Cloud SQL
   Postgres`, and `GET /api/health` reports the live store reachable — the worker can persist a
   verdict.
2. Open `#/tree`, click a buildable node (e.g. a `drive-machinery` node) to open the island side
   panel. **Success —** the `<aside className="tree-detail">` panel renders the node's status badge,
   UAT verdict line, and capability sub-DAG, AND a new **Build** control is present (only for a
   buildable node — a non-buildable node shows no button or a disabled one with the reason).
3. Click **Build**. **Success —** the client POSTs `/api/build { unitId }`, the server answers `202`
   with a `runId`, the panel flips into a "building…" state showing the transcript region, and the
   teal in-flight wisp lights on the node in the world (the existing `/api/activity` pipeline, ADR-
   0048) — proving the intent was accepted and the worker started WITHOUT the frontend importing any
   build code.
4. Watch the transcript. **Success —** the panel POLLS `GET /api/build?runId=…` and the coarse
   transcript grows line by line — the phase trail (AUTHOR_TEST → … → GATE) and progress lines — as
   the real SDK leaf authors and the spine observes red→green. (The transcript is COARSE by design,
   not a raw model log.)
5. Attempt a second build while the first is running (click Build again, or POST a second intent).
   **Success —** the server REFUSES the concurrent build (`409`, "a build is already running") — the
   single-build-at-a-time guard holds; the running build is unaffected.
6. Let the build finish. **Success —** `GET /api/build?runId=…` reports a terminal status with the
   final build envelope (verdict line, signer, cost, phase trail); the panel shows the verdict; and
   the node's hue in the world updates to reflect the freshly signed `events.verdict` (the existing
   `/api/tree` `latestVerdicts` path) WITHOUT a manual reload.
7. Confirm the verdict is real and persisted. **Success —** `storytree tree <unitId>` (or the DB)
   shows the new signed verdict in `events.verdict` — a REAL gate verdict (spine-observed red→green,
   spine-signed), not a hue handed in by the UI. The frontend never touched the verdict.
8. Confirm the scope-routed walls. **Success —** the **NODE** build (this walkthrough, steps 1–7) was
   the single-node `--live` local smoke — it opened NO git worktree, pushed NO branch, and landed
   nothing. The **STORY** path (select a real-buildable story, no cap drilled, and click Build) routes
   instead to `story build <id> --real`, which authors each capability for real and, on a green chain,
   opens a **non-draft PR that CI auto-merges to trunk** (ADR-0022; non-squash per ADR-0031) — clicking
   Build is the approve-to-land (ADR-0090 Phase 2). The remaining walls hold: no hosted run, no
   `--real` toggle on a single node, no manual `gh pr merge`.

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes against the real
running studio + the real `--live` build path, AND its capabilities' integration tests and contracts
pass underneath it. The capability/contract obligations are minimal-to-green (slow growth): the
registry state machine and the API dispatch are isolatable and machine-provable; the wiring
capability is an integration test against the real in-story collaborators with the build-path
spawn exercised through the real `nodeBuild` entry (an offline scripted `PhaseAuthor` is acceptable
in the integration test, ADR-0010 §5, to avoid billing a live SDK run on every gate pass — the live
run is the human-witness UAT action above).

**Honest status — `proposed`, and the mechanics LANDED.** The build affordance, the worker routing,
and the story/node scope split are built and machine-witnessed on `main` (PRs #297 / #299 / #300).
Status stays `proposed` because two obligations are still pending — the operator's APPEARANCE
attestation (ADR-0070) and the live-run UAT (a real subscription-billed `--live`/`--real` run is a
human-witness action) — NOT because code is missing. `healthy` is earned through the prove-it-gate,
never edited here.

## Open modeling calls (for the owner)

1. **Brownfield-downstream wiring-shape check.** You can build DOWNSTREAM of a brownfield story
   (e.g. `drive-machinery` is brownfield — not itself real-buildable, yet the worker drives the
   `nodeBuild`/`storyBuild` entries it owns) — but only if the brownfield upstream's wiring is "in
   the right shape." OPEN: can we have a CHECK that validates that wiring shape BEFORE allowing a
   downstream build, and should the Build affordance surface it? Today `isStoryBuildable(spec, caps,
   'real')` (`packages/orchestrator/src/story-build.ts:234`) only checks the SELECTED story's own
   drive-order proof config — it never inspects an UPSTREAM brownfield's wiring shape, so a downstream
   `story build --real` can proceed on an ill-shaped upstream and only fail deep inside the chain.
   The affordance COULD instead WARN "this story's upstream brownfield isn't in the right shape"
   before offering the build, rather than letting it run and break. Surfaced for the owner — the
   shape of the check (what "right shape" means, where it lives, whether it warns or refuses) is not
   decided here.
