---
id: "desktop-build-mount"
tier: story
title: "The desktop build mount — relocate the build worker into @storytree/drive, mount build + accept→dispatch on the desktop, so the thick-local app drives a build (ADR-0133 / ADR-0108 Phase 3+4)"
outcome: "The build worker machinery (BuildRegistry / runBuildJob / dispatchAcceptedBuild + the BuildContext type) moves out of apps/studio/server into the shared @storytree/drive package, where the desktop local backend may legally reuse it; the desktop sidecar then mounts POST /api/build (202 + runId, fire-and-forget) over a BuildContext wired from the relocated worker, and the chat accept click reaches dispatchAcceptedBuild on that same backend — so the desktop becomes a complete propose→accept→drive→land surface on the shared forest, with the worker's coarse progress streamed back."
status: proposed
proof_mode: UAT
# Per-leg witness (ADR-0106): the offline mechanics legs (the worker exports from its new drive home with
# the studio importers still green; the desktop build route over a scripted runner; the desktop accept→
# dispatch over a scripted runner) are machine-witnessed by the package + desktop suites. The LIVE driven
# desktop walk (a real chat proposal accepted by a click that drives a real `story build --real` to a
# spine-signed verdict + an opened PR) and its APPEARANCE are NOT this story's UAT legs — they are
# chat-drive-bridge's operator-attested Story UAT legs 5–6 (ADR-0070), which this story UNBLOCKS by
# delivering the mechanism. This story's own UAT proves the MECHANISM is mounted and reachable end-to-end
# OFFLINE (scripted build runner, ADR-0010 §5 — never a live SDK build on a gate pass). The story-level
# uat_witness is absent → human (the ADR-0040 fail-closed signpost), so the machine-driven whole-story UAT
# node stays withheld; the crown derives from the per-leg roll-up.
# desktop-accept-dispatch RETIRED by ADR-0155 (2026-07-04) — the chat /api/chat/accept route it built was
# removed (PR #587); dropped from this list so the crown rolls over the three live caps only. The story
# keeps worker-relocation, desktop-build-route (both green via the observe gates below) and
# routed-node-real-dispatch (green via its own --real verdict). See desktop-accept-dispatch.md (retired).
capabilities: [worker-relocation, desktop-build-route, routed-node-real-dispatch]
# WHY A NEW STORY, NOT AN EDIT TO chat-drive-bridge OR desktop OR studio-build:
#   - chat-drive-bridge is ADR-0108 Phase 3+4's BRIDGE (the proposed-unit signal, the id threading, the
#     dispatch CORE, the accept affordance). Its four machine-provable capabilities are landed + green; its
#     remaining work is the operator-attested live walk (legs 5–6). Adding the RELOCATION + the DESKTOP MOUNT
#     to it would be a second journey grafted onto a story whose own journey is complete-bar-attestation.
#   - desktop owns the thick-local SURFACE (the shell, the sidecar, the boot-read + chat mounts). It does not
#     own the build worker, and "mount build" is not its journey — it is the glue that completes THIS one.
#   - studio-build owns the worker in apps/studio/server. Relocating the worker is a change to WHERE that
#     machinery lives, forced by ADR-0100 (an app may not import another app's server); studio-build's
#     importers must stay green, but the relocation's JOURNEY is "make the desktop able to drive a build",
#     not "improve the studio build worker".
# THE ONE JOURNEY (ADR-0010 journey-principle): relocate-the-worker → mount-build-on-the-desktop →
# wire-the-accept-click-to-it. A consumer (the inner-circle co-builder, ADR-0133 d.1) who finishes the first
# step (the worker is reachable from a package) immediately needs the second (the route is mounted) and the
# third (the click reaches it) to get any value — there is no value in a relocated-but-unmounted worker, and
# no value in a mounted route the click can't reach. It is one journey: the desktop can drive a build.
#
# Story-level edges (ADR-0010 §4 — consumed cross-story seams, encoded here as frontmatter depends_on;
# the import/consumption evidence at file:line is in "Cross-story boundary" below):
#   - drive-machinery — the PACKAGE HOME the worker moves INTO, and the build ENTRIES the worker drives. The
#                       relocated BuildRegistry / runBuildJob / dispatchAcceptedBuild / BuildContext land in a
#                       NEW @storytree/drive subpath (@storytree/drive/build-worker), beside the existing
#                       @storytree/drive/build entries (nodeBuild/storyBuild/adoptStory) the routedBuildRunner
#                       drives. This is the studio-build precedent inverted: code that USED to live in a
#                       surface package moves DOWN into the shared package both surfaces may import. drive
#                       imports NOTHING from @storytree/cli (ADR-0112) and NOTHING from apps/* — so the
#                       relocated worker (registry → node:crypto only; worker → registry + local types) sits
#                       cleanly at this tier.
#   - studio-build    — the worker being RELOCATED, and the studio IMPORTER that must stay green. studio-build
#                       owns the worker in apps/studio/server (buildWorker.ts / buildRegistry.ts) + the
#                       handleBuild intake + the BuildContext type in apiRouter.ts + the devApi.ts wiring. This
#                       story MOVES that machinery to @storytree/drive and RE-POINTS the studio importers
#                       (apiRouter.ts, devApi.ts, the existing server suites) at the package — they must stay
#                       green (parity). This story OWNS the relocation; studio-build owns the original site.
#   - chat-drive-bridge — LINEAGE ONLY, edge dropped (2026-07-05 map audit): chat-drive-bridge authored
#                       dispatchAcceptedBuild (apps/studio/server/chat-build-dispatch.ts) + the accept
#                       affordance this story relocated/wired, but that story is RETIRED (ADR-0155 — the
#                       chat accept front was removed; dispatchAcceptedBuild lives on in the drive worker
#                       subpath, consumed by chat-subagent-spawn's builder-spawn-dispatch). A depends_on
#                       edge to a retired story can never render and is corpus rot — the history stays
#                       here, the edge is gone.
#   - desktop         — the SURFACE the build route + accept→dispatch mount ON. The desktop local backend
#                       (apps/desktop/electron/backend-entry.ts) already mounts the boot-read routes + the chat
#                       SSE mount, re-composing drivers from PACKAGES (never importing apps/studio/server,
#                       ADR-0100/0119). This story adds the build route mount + the accept→dispatch wiring on
#                       that SAME backend, beside chat-sse-mount. This story OWNS the desktop build-mount glue
#                       physically hosted in apps/desktop/src/backend; the desktop story owns the sidecar +
#                       the surface those mounts hang on.
#   - library         — the work-hierarchy schema the build route validates against (isStoryBuildable /
#                       resolveBuildConfig over @storytree/orchestrator discovery), and the seed corpus the
#                       offline proofs render. CONSUMED, not owned. (orchestrator discovery is reached
#                       transitively via drive-machinery / desktop's existing edges; it is not a separate
#                       story.)
# DIRECTION / NO CYCLE (ADR-0058): this story is a PURE SOURCE NODE — nothing depends on it. Every edge flows
# DOWN toward the roots: desktop-build-mount → {studio-build, desktop} → … → drive-machinery
# → {library, storage-protocol, proof-protocol, agent, notice-board}. None of the named stories'
# depends_on lists desktop-build-mount, so the edges introduce no cycle. (The former chat-drive-bridge
# edge was dropped when that story retired — see the lineage note above.)
#   - studio (ADR-0192 landlord rule): worker-relocation's proof scope spans the RE-POINTED studio
#     importers (apps/studio/server/apiRouter.ts / devApi.ts are literal entries in its
#     real.scope.sourceGlobs) — the relocation edited the studio server's build-worker imports in
#     place, so the story's proof-bound write scope reaches into the studio's territory. A
#     hosted-seam edge, annotated below.
depends_on: [drive-machinery, studio-build, desktop, library, studio]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [studio-build, desktop, studio]
# Deciding ADRs (ADR-0037 §2): 133 (PRIMARY — the inner-circle desktop is the priority and decision 3
# names THIS story's mechanism; its temporary broker deferral was later lifted by 180); 108 (the
# phased chat→drive→land — this completes Phase 3+4 ON THE
# DESKTOP surface, where chat-drive-bridge built the bridge on apps/studio/server); 113 (the thick-local
# desktop the mount hangs on); 117 + 180 (desktop proof writes use the authenticated broker; the old
# direct-write deferral is no longer current); 91 (proof integrity — the dispatch is a SAFE
# build INTENT, never a verdict-in; the spine inside runBuildJob observes RED→GREEN and signs; the agent holds
# no key); 4 (the chat thin client imports no agent/drive/model — its only route is the api seam; the desktop
# renderer is held too); 100 (an app may not import another app's server — the WALL that FORCES the relocation,
# the reason the worker must move to a package); 176 (the complete current sidecar decision, carrying
# forward 119's re-compose-from-PACKAGES boundary — the established pattern the build mount follows);
# 90 (the build worker reused verbatim — routedBuildRunner →
# story build --real, the single agent boundary); 22 (CI re-proves green before the trunk — the backstop for
# broker trust boundary + what lands the PR the worker opens). Context: 0048 (the build wisp the dispatched
# run blooms) / 0070 (the live driven appearance is operator-attested, chat-drive-bridge's legs 5–6).
# Post-landing increment (2026-07-02): 144 (owner-directed — the routed NODE dispatch drives
# `node build --real` with persist semantics instead of the synthetic `--live` smoke; landing stays the
# human gate over the parked branch, ADR-0136 amended in degree). Capability routed-node-real-dispatch;
# the story's other caps and its own status are untouched.
decisions: [133, 108, 113, 117, 180, 91, 4, 100, 176, 90, 22, 144]
---

# The desktop build mount — relocate the build worker into @storytree/drive, mount build + accept→dispatch on the desktop

**Outcome —** The build worker machinery (`BuildRegistry` / `runBuildJob` / `dispatchAcceptedBuild` + the
`BuildContext` type) moves out of `apps/studio/server` into the shared `@storytree/drive` package, where
the desktop local backend may legally reuse it; the desktop sidecar then mounts `POST /api/build` (202 +
runId, fire-and-forget) over a `BuildContext` wired from the relocated worker, and the chat accept click
reaches `dispatchAcceptedBuild` on that same backend — so the desktop becomes a complete
propose→accept→drive→land surface on the shared forest, with the worker's coarse progress streamed back.

## What this is

This is **the one missing piece of glue** between two things that already exist on the desktop and one
thing that exists only in the studio server. The owner directed (2026-06-28, **ADR-0133**) going all-in on
the **thick-local desktop** as the inner-circle surface, so co-builders can help finish storytree's own
tree fast. ADR-0133 decision 3 names this story's mechanism exactly: *relocate the worker machinery into
`@storytree/drive`, then mount `POST /api/build` + the chat accept→dispatch on the desktop local backend*.

**The two ends already on the desktop, and the wall between them and the worker:**

- **PROPOSE → the chat surface ships on the desktop (built).** `createChatSseMount`
  (`apps/desktop/src/backend/chat-sse-mount.ts`) mounts `POST /api/chat` on the desktop sidecar
  (`apps/desktop/electron/backend-entry.ts`), streaming `startChatStream`'s events as SSE. With
  chat-drive-bridge landed, that stream now carries a machine-actionable `proposedUnitId`, and the studio
  renderer the desktop hosts has the explicit accept-to-land Build button (`accept-to-land-affordance`).
- **DRIVE → the build worker exists, but ONLY in `apps/studio/server` (built).** `routedBuildRunner` +
  `runBuildJob` + the `BuildRegistry` (`apps/studio/server/buildWorker.ts`, `buildRegistry.ts`) route a
  STORY id → `story build --real` (persists real verdicts, opens the NON-DRAFT PR CI auto-merges, ADR-0022)
  / a NODE id → `node build --live` (synthetic, non-persisting — the shape at authoring time; ADR-0144
  later re-routed the node arm to the node's REAL proof with persist semantics, capability 4
  [`routed-node-real-dispatch`](routed-node-real-dispatch.md), landing staying the human gate over the
  parked branch). `handleBuild` (`apps/studio/server/
  apiRouter.ts`) is `POST /api/build {unitId} → 202 {runId}` + `GET /api/build?runId`, behind the injected
  `BuildContext { registry, runner, isBuildable }` wired by `devApi.ts`. And `dispatchAcceptedBuild`
  (`apps/studio/server/chat-build-dispatch.ts`, the chat-drive-bridge dispatch CORE) reuses that worker —
  but is route-mounted NOWHERE.
- **THE WALL (ADR-0100 / ADR-0119).** An app may not import another app's server — `backend-entry.ts`
  RE-COMPOSES drivers from PACKAGES; it does not import `apps/studio/server`. So the desktop cannot reach
  the studio-server-resident worker as-is. **Build is explicitly DISABLED on the desktop**
  (`backend-entry.ts` header + the `createLocalBackend` `[+ build, disabled here]` note).

**The seam where they fail to meet:** the desktop has chat (propose + the accept button) but no build;
the worker has the build but lives behind the surface wall. **This story moves the worker DOWN into the
shared package both surfaces may import, then mounts build + the accept→dispatch on the desktop** — closing
the seam on the SAME surface where chat already ships.

**What this UNBLOCKS (not this story's to attest):** chat-drive-bridge's operator-attested Story UAT
**legs 5–6** — a REAL chat proposal accepted by a click that drives a real `story build --real` to a
spine-signed verdict + an opened PR, with progress streamed back, inside the native shell — need a desktop
that can drive a build. This story delivers that mechanism. Those legs stay owned by chat-drive-bridge
(ADR-0070, operator-attested); this story does NOT duplicate or re-attest them.

## The three-part journey (ADR-0133 d.3) — what gets built

Bounded to ONE journey: *the desktop can drive a build*. Roots-first, the journey is three capabilities,
each an isolatable red→green leaf proven OFFLINE (a scripted build runner — ADR-0010 §5, never a live
SDK-billed build on a gate pass):

1. **Relocate the worker into `@storytree/drive`.** Move `BuildRegistry`, the `runBuildJob` /
   `routedBuildRunner` / `buildRunnerFromNodeBuild` / `adoptRunnerFromAdoptStory` family, the
   `dispatchAcceptedBuild` dispatch, and the `BuildContext` type into a new `@storytree/drive/build-worker`
   subpath — and re-point the studio importers (`apiRouter.ts`, `devApi.ts`, the server suites) at the
   package, all still green. The desktop may now import the worker legally (a package, not another app's
   server).
2. **Mount the build route on the desktop.** Mount `POST /api/build` (202 + runId, fire-and-forget) +
   `GET /api/build?runId` on the desktop sidecar, wired with a `BuildContext` over the relocated worker
   (the `devApi.ts` recipe: lazy `@storytree/drive/build` runner, `@storytree/orchestrator` discovery for
   `isBuildable`), beside the existing chat mount.
3. **Wire the accept click to the mounted dispatch.** The accept click's POST reaches
   `dispatchAcceptedBuild` on the desktop backend, so a `proposedUnitId`-bearing proposal → click →
   dispatch → `runBuildJob` → coarse progress streamed back, all on the desktop surface.

## Honest proof posture — `proposed`, multi-increment, slow-growth

This spec is authored FIRST, before any implementation, to bound the journey and size the units; the inner
loop builds it (this story authors the work hierarchy only). Every contract below describes the isolated
unit test that proves a leaf; the capability describes the integration test that proves it against real
in-story collaborators; the Story UAT below describes the acceptance walkthrough that proves the whole
mount is mounted and reachable offline.

This is a **MULTI-INCREMENT arc** (slow growth, minimum-to-green): one provable contract is driven to a
signed verdict per session, then the next is spawned. The honest status is `proposed`:

- The **mechanics ARE genuinely proof-wired** — each capability carries a `proof:` block with a `real:` arm
  describing a NET-NEW red→green against the real package/app source. `worker-relocation` is the modeling
  call to read closely (see its own §"Proof posture — a relocation is not a free refactor"): a pure
  cut-and-paste relocation is refactor-parity, NOT an isolatable red→green; so the unit's net-new,
  spine-observable assertion is the **package-boundary contract** — `@storytree/drive/build-worker` EXPORTS
  the worker trio (a NEW subpath, module-not-found at HEAD = the right-kind red) AND imports nothing from
  `apps/*` (the ADR-0100 wall the relocation exists to satisfy), with the studio importers re-pointed and
  still green. The desktop legs are clean offline route/integration tests over a SCRIPTED build runner,
  mirroring `chat-sse-mount.test.ts` / `boot-read-routes.test.ts`.
- The **live driven desktop walk is NOT a leg of this story.** A real chat proposal accepted by a click
  that drives a real `story build --real` to a signed verdict + an opened PR — and its appearance inside the
  native shell — are chat-drive-bridge's operator-attested legs 5–6 (ADR-0070). This story proves the
  mechanism is mounted and reachable; chat-drive-bridge proves it works live, once this mechanism exists.

**The integrity walls (encoded in every contract + the Story UAT):**

- **ADR-0100 / ADR-0119 — the desktop backend re-composes from PACKAGES, never imports `apps/studio/
  server`.** This is the WALL that forces the relocation: the worker must live in a package for the desktop
  to reuse it. The relocated worker imports nothing from `apps/*`; the desktop mount imports the worker by
  package name. Get this wrong — having the desktop import `apps/studio/server`, or leaving the worker
  there — and the mount is illegal (the exact coupling ADR-0100 forbids).
- **ADR-0091 — the dispatch is a SAFE build INTENT, never a verdict-in.** The route + the dispatch hand the
  worker a unit id; they hold no signing key and no verdict path. The spine inside `runBuildJob` observes
  real RED→GREEN exit codes and SIGNS; CI re-proves green before the trunk (ADR-0022). The damage ceiling
  stays a briefly-wrong hue, corrected by CI — exactly ADR-0091's argument. ADR-0180 now routes desktop
  proof persistence through the authenticated broker without moving signing into that broker.
- **ADR-0004 — the chat/ChatPanel thin client never imports agent/drive/model.** Its only route is the
  `api` seam; the agent/build boundary is the backend process. The desktop renderer is held to this
  (`modelPathBoundary.test.ts` holds `apps/studio/src`); the accept click POSTs through the api seam, it
  does not call the dispatch in-process.
- **ADR-0117 broker target is current (ADR-0180).** ADR-0133's temporary "secure later" deferral has
  ended for desktop verdict, UAT-attestation, and presence writes. The desktop still signs locally;
  authenticated broker callers persist the signed bytes, and the broker never re-signs them. This
  build-mount story does not own that separate proof-write composition.

Status stays `proposed` for every unit — `healthy` is earned through the prove-it-gate (and, for the live
legs that belong to chat-drive-bridge, the operator's attestation); it is never authored (ADR-0020).

## Capabilities (3 live; 1 retired)

> **`desktop-accept-dispatch` RETIRED by ADR-0155 (2026-07-04).** The desktop `/api/chat/accept` route it
> built was removed in PR #587 (the session-orchestrator drives via its spawn + landing tools rather than
> accepting a chat proposal into a build). It is dropped from the capability list, the dependency graph,
> Story UAT leg 3, and Reliability Gate 2's `(covers:)`; its spec is kept as `status: retired` history. The
> three remaining caps below are unaffected — the `/api/build` route and the relocated
> `dispatchAcceptedBuild` worker call (still used by `builder-spawn-dispatch`) are UNCHANGED.

Listed roots-first (a capability appears after everything it depends on). All three live caps are **proof-wired**
(ADR-0057 — each carries a `proof:` block with a `real:` arm describing a genuine additive net-new
red→green against the real package/app source), so they form a **dependency-closed, acyclic set in which
every member resolves a `real:` arm** — what makes the WHOLE story story-`real`-buildable
(`isStoryBuildable`).

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`worker-relocation`](worker-relocation.md) | The build worker machinery (`BuildRegistry`, the `runBuildJob`/`routedBuildRunner`/runner family, `dispatchAcceptedBuild`, the `BuildContext` type) lives in a new `@storytree/drive/build-worker` subpath, importing nothing from `apps/*`; the studio importers (`apiRouter.ts`, `devApi.ts`, the server suites) re-point at the package and stay green. | — |
| 2 | [`desktop-build-route`](desktop-build-route.md) | The desktop local backend mounts `POST /api/build` (202 + runId, fire-and-forget) + `GET /api/build?runId`, wired with a `BuildContext` over the relocated worker (lazy `@storytree/drive/build` runner + `@storytree/orchestrator` discovery for `isBuildable`); a scripted runner proves the route without SDK spend. | `worker-relocation` |
| ~~3~~ | ~~[`desktop-accept-dispatch`](desktop-accept-dispatch.md)~~ | **RETIRED by ADR-0155** — the desktop `/api/chat/accept` route was removed (PR #587); spec kept as history. | ~~`desktop-build-route`~~ |
| 3 | [`routed-node-real-dispatch`](routed-node-real-dispatch.md) | A NODE-classified unit dispatched through `routedBuildRunner` drives the node's REAL proof with persist semantics — `nodeBuild(unitId, { real: true, dryRun: false, verdictStore: 'pg' })`, never the synthetic non-persisting `--live` smoke — with a mode line naming the real red→green, the persisted verdict, and the parked `claude/real/<unit>-<run>` branch the human lands (story branch unchanged). Post-landing increment, ADR-0144. | `worker-relocation` |

## Dependency graph (will be code-derived)

These are **within-story** edges. Until the code exists they are authored from the intended data-flow; when
the units are built they MUST be re-derived from the real imports/calls between capabilities (static
analysis, ADR-0010 §3) and corrected if the code disagrees. The graph is a tree rooted at
`worker-relocation` (the package-home leaf, no in-story upstream): the desktop mount chain hangs off it,
and the ADR-0144 routing flip hangs off it directly.

- `desktop-build-route` → `worker-relocation`
  - The route mounts a `BuildContext` over the relocated worker — it imports `BuildRegistry` /
    `runBuildJob` / the `BuildContext` type from `@storytree/drive/build-worker`, the NEW home capability 1
    creates. It cannot be mounted until the worker is reachable from a package (the desktop may not import
    `apps/studio/server`, ADR-0100). It couples directly to the relocated worker's exported surface.
- ~~`desktop-accept-dispatch` → `desktop-build-route`~~ (RETIRED by ADR-0155 — the accept-click front is gone)
- `routed-node-real-dispatch` → `worker-relocation`
  - The ADR-0144 flip EDITS the node arm of `routedBuildRunner` inside the relocated
    `packages/drive/src/build-worker.ts` — the file capability 1 created. It couples to the relocated
    worker's routing composition and to nothing else in-story (the accept path that CALLS the routed
    runner is the relocated dispatch itself — its chat-drive-bridge lineage is history, see the
    frontmatter note; that story is retired and the edge dropped).

## Cross-story boundary (ADR-0010 §4)

Authored from the intended consumed seams (re-verify against real imports when built). All four live
edges (plus the retired chat-drive-bridge lineage record below) are CONSUMED, not absorbed — this story owns the RELOCATION (moving the worker into the shared package + the
re-point) and the DESKTOP MOUNT GLUE (the build route + the accept→dispatch on the desktop backend), never
the build entries, the build path, the chat surface, the desktop sidecar infrastructure, or the library
schema. The "code physically hosted in another story's package while declaring the `depends_on` edge" is
the **studio-build precedent** — here inverted: code that LIVED in a surface package moves DOWN into the
shared package both surfaces import.

- **`drive-machinery`** — the **package the worker moves INTO, and the build entries it drives**. The
  relocated machinery lands in a NEW `@storytree/drive/build-worker` subpath (sibling to the existing
  `@storytree/drive/build` entries `nodeBuild` / `storyBuild` / `adoptStory`, `packages/drive/src/build.ts`),
  exercised by `node:test` (`node --import tsx --test`) — the package's convention, the same one
  chat-drive-bridge's `proposal-id-threading.test.ts` already uses in this package. The relocated worker
  reuses NOTHING new from drive: `BuildRegistry` imports only `node:crypto`; the worker imports only the
  registry + the build entries it already drives via the runner. `@storytree/drive` imports NOTHING from
  `@storytree/cli` (ADR-0112) and NOTHING from `apps/*` — so the worker sits cleanly at this tier. CONSUMED
  as the host package; this story owns the relocated modules + their new subpath.
- **`studio-build`** — the **worker being relocated, and the studio importer kept green**. studio-build owns
  the worker in `apps/studio/server` (`buildWorker.ts`, `buildRegistry.ts`), the `handleBuild` intake + the
  `BuildContext` type in `apiRouter.ts`, and the `devApi.ts` wiring. This story MOVES that machinery to
  `@storytree/drive/build-worker` and RE-POINTS the studio importers at the package — `apiRouter.ts`
  (imports `runBuildJob` / `BuildRunner` / `BuildRegistry`), `devApi.ts` (imports `BuildRegistry` /
  `routedBuildRunner` / `adoptRunnerFromAdoptStory`), `chat-build-dispatch`'s old home (the dispatch moves
  WITH the worker), and the server suites (`buildRegistry.test.ts`, `buildWorker.test.ts`,
  `buildApi.integration.test.ts`, `adoptApi.integration.test.ts`). They must
  stay green (parity). (`chat-build-dispatch.test.ts`, the studio parity test of the relocated dispatch,
  was removed with ADR-0155's retirement of the `chat-build-dispatch` cap — the dispatch's behaviour is
  covered by `@storytree/drive`'s `build-worker-relocation.test.ts`.) This story OWNS the relocation; studio-build owns the original site + its
  surface-resident `handleBuild` HTTP wrapper (which stays a thin wrapper over the relocated `runBuildJob`).
- **`chat-drive-bridge`** *(RETIRED, ADR-0155 — lineage record; the `depends_on` edge was dropped in the
  2026-07-05 map audit since an edge to a retired story can never render)* — the **dispatch that was
  relocated, and the live legs it once unblocked**. chat-drive-bridge
  authored `dispatchAcceptedBuild` (`apps/studio/server/chat-build-dispatch.ts`) + the accept-to-land Build
  affordance (the studio `ChatPanel`). The dispatch moves into the drive worker subpath WITH the rest of the
  worker (it imported `runBuildJob` + the `BuildContext` type — both relocating). The accept click (already
  built in the renderer the desktop hosts) is wired through the desktop's mounted dispatch by capability 3.
  This story DELIVERS the mechanism chat-drive-bridge's operator-attested legs 5–6 need (the live driven
  desktop walk + appearance); those legs stay owned by chat-drive-bridge (ADR-0070). CONSUMED — this story
  re-homes the dispatch + mounts it; it does not own the affordance or the live attestation.
- **`desktop`** — the **surface the build route + accept→dispatch mount ON**. The desktop local backend
  (`apps/desktop/electron/backend-entry.ts`) already mounts the boot-read routes (`createBootReadRoutes`) +
  the chat SSE mount (`createChatSseMount`), re-composing drivers from PACKAGES and chaining each dispatcher
  (first to claim the request wins). This story adds the build route mount (a new
  `apps/desktop/src/backend/build-route.ts` factory, mirroring `chat-sse-mount.ts` — local HTTP helpers, an
  injectable runner, a `(req, res, pathname) => Promise<boolean>` chain handler) + the accept→dispatch wiring
  on that SAME backend. This story OWNS the desktop build-mount glue physically hosted in
  `apps/desktop/src/backend`; the desktop story owns the sidecar (`backend-entry.ts`) + the surface those
  mounts hang on (the one production-wiring edit to `backend-entry.ts` — chaining the new dispatcher — is the
  operator-attested sidecar glue the desktop story already assigns there, exactly as the chat mount was). The
  desktop renderer is held to ADR-0004 (`modelPathBoundary.test.ts`): the chat panel imports no
  agent/drive/model.
- **`library`** — the **work-hierarchy schema the build route validates against**. Buildability is resolved
  via `isStoryBuildable` / `resolveBuildConfig` (`@storytree/orchestrator` discovery, the same precheck
  `node build` / `story build` use) over the seed corpus. The offline proofs render the SAME in-memory seed
  / inject a scripted `isBuildable`. CONSUMED — this story owns no schema and no discovery (orchestrator
  discovery is reached transitively via drive-machinery / desktop's existing edges).

## Story UAT

The integrated **acceptance walkthrough** that proves the whole `desktop-build-mount` — the desktop becomes
a build-capable surface — meets its outcome end-to-end, OFFLINE. It is minimal-first
(one coherent journey: the worker is reachable from a package → the desktop mounts build over it; the
accept-click third step RETIRED with `desktop-accept-dispatch`, ADR-0155), defect-driven thereafter (each
real failure earns a permanent regression case, never speculative breadth). Mocks are forbidden in the
consumed seams that CAN run offline: the relocated worker is the REAL `BuildRegistry` + `runBuildJob`; the
desktop route drives the REAL relocated worker over a REAL node:http server. Only the BUILD RUNNER is scripted offline (a
live `story build --real` is subscription-billed AND lands real work, ADR-0010 §5) — and the live driven
walk is exercised in chat-drive-bridge's operator-attested legs, NOT here.

> **HONEST status — `proposed`, mechanism-mounted-offline; the live walk belongs to chat-drive-bridge.**
> The two legs below (leg 3 retired by ADR-0155) are automatable by the package + desktop suites
> (`@storytree/drive` + the desktop
> `node:test` suite) over a scripted build runner + the in-memory seed. There is NO live leg in this
> story's UAT — the live driven desktop build (a real `story build --real` to a spine-signed verdict + an
> opened PR, with progress streamed back) and its appearance are **chat-drive-bridge's** operator-attested
> Story UAT legs 5–6 (ADR-0070), which this story UNBLOCKS. This story's UAT therefore proves the MECHANISM
> is mounted and reachable end-to-end offline; it deliberately does NOT re-prove or re-attest the live
> walk that lives in chat-drive-bridge.
>
> **Per-leg witness (ADR-0106).** The two remaining legs (`uat-1`, `uat-2`) are `witness: machine` — the
> suites demonstrably cover them and each names its exact proof gate, so the adopt pass
> observe-and-signs them. **Leg 3 (the accept→dispatch
> walk) was RETIRED by ADR-0155** with the `desktop-accept-dispatch` cap — the `/api/chat/accept` route +
> `accept-dispatch.test.ts` were removed in PR #587, so there is nothing left to witness there. No leg is
> `human` here (the human-witness legs are chat-drive-bridge's, not this story's). No leg rests `either`.
> The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the machine-driven
> whole-story UAT node stays withheld; the crown derives from the per-leg roll-up.

**Goal —** The build worker is reachable from a shared package (importing nothing from `apps/*`, the
studio importers still green); the desktop local backend mounts a build route over it, mints a run on the
relocated registry, and
streams the worker's coarse progress back — all offline over a scripted runner, with no verdict ever
handed in and no app importing another app's server.

1. **The worker lives in a shared package, importing nothing from `apps/*`, and the studio still builds.**
   _(witness: machine)_ _(proof-gate: desktop-build-mount#gate-3)_ Import the worker trio (`BuildRegistry`, `runBuildJob`, `dispatchAcceptedBuild`,
   the `BuildContext` type) from `@storytree/drive/build-worker`, and run the relocated worker's own suite +
   the re-pointed studio server suite. **Success —** the subpath resolves and the trio is exported (it does
   NOT resolve at HEAD — the right-kind module-not-found red); the relocated worker imports nothing from
   `apps/*` (the ADR-0100 wall the relocation exists to satisfy, asserted structurally); the studio
   importers (`apiRouter.ts`, `devApi.ts`) re-point at the package and the existing server suites
   (`buildWorker.test.ts`, `buildRegistry.test.ts`, the two integration
   suites) stay green from the new home (parity — no behaviour changed, only the home).
2. **The desktop mounts a build route over the relocated worker.** _(witness: machine)_ _(proof-gate: desktop-build-mount#gate-2)_ Stand up the
   desktop build-route dispatcher on a real `node:http` server with an injected scripted `BuildContext`
   (real `BuildRegistry`, a scripted runner, an injected `isBuildable`). **Success —** `POST /api/build
   {unitId}` validates buildable, mints a run, returns 202 `{ runId }` (fire-and-forget); `GET
   /api/build?runId` returns the run's status + coarse transcript; an un-buildable / unknown id is a clean
   404 (worker never spawned against nothing); a wrong method is 405; the dispatcher falls through (returns
   false) for every other path (not a catch-all) — exactly the `handleBuild` typed-answer contract, now on
   the desktop surface, importing the worker by package name (never `apps/studio/server`).
> **~~Leg 3. An accepted id POSTed to the desktop reaches the dispatch and streams progress back.~~
> RETIRED by ADR-0155 (2026-07-04).** This leg proved the `desktop-accept-dispatch` cap — the desktop
> `/api/chat/accept` route reaching `dispatchAcceptedBuild`. That route + its `accept-dispatch.test.ts` were
> removed in PR #587 (the session-orchestrator drives via its spawn + landing tools rather than accepting a
> chat proposal into a build), so this leg has nothing left to witness and is dropped. The relocated
> `dispatchAcceptedBuild` worker call itself REMAINS live under `builder-spawn-dispatch`; only the desktop
> chat ACCEPT front retired. (Deliberately left as a non-numbered note so it no longer parses as a `#uat-n`
> obligation.)

End state — the worker lives in a shared package the desktop may legally import; the desktop mounts a build
route (`POST /api/build`) over it and drives a (scripted, offline) run to a streamed terminal state on the
desktop surface — every wall held (no app imports another app's server; the route handed in no verdict; the
spine signs, not the route; CI is the second proof before the trunk).

## Reliability Gates

The two unregistered capabilities — `worker-relocation`, `desktop-build-route` (the third,
`desktop-accept-dispatch`, was RETIRED by ADR-0155)
— are **brownfield-by-outcome** (`status: mapped`): each LANDED with a real, passing, OFFLINE automated
test that genuinely exercises it (the relocation's package-boundary contract; the desktop route
driven over the REAL relocated worker on a real `node:http` server), but storytree's own
prove-it-gate never DROVE those proofs to a persisted verdict — the `--real --store pg` signing was skipped
at build time, so the code is tested-but-UNREGISTERED. On a GREEN base a fresh `--real` Build HALTS (there
is no red→green left to earn, and *halt is never a pass*, ADR-0130), so the honest path off `mapped` is
**not** a manufactured Build over mature tested code — it is the author-declared **reliability gates** below,
observe-and-signed to an `adopted` verdict
([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md),
resolving [ADR-0083](../../docs/decisions/0083-author-defined-story-green-declared-obligations-machine-per.md)
Fork B). This is the `mapped → healthy` = **Adopt** transition
[ADR-0094](../../docs/decisions/0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) names
(d.3 retired the status-blind Build for `mapped` stories), greening each covered capability via the
`(covers:)` coverage ADR-0097 §5/§2 defines. Distinct from `## Story UAT` above (the integrated, offline
acceptance journey): the gates are the author's **expandable reliability floor** — they start by adopting
the existing green suites and GROW a `_(gate: build-tests)_` gate (a genuine red→green regression leg) the
moment observation proves insufficient — a real relocation / route / accept-dispatch defect slips through
the existing suite.

The capabilities span two owning package suites, so two observe gates name the capability each suite
behaviourally covers (the coverage is real, not declared-only: each test is the cap's own integration
test over its real collaborators, ADR-0097 §2). A third observe gate runs the drive and studio suites
together solely for Story UAT leg 1: the leg promises both the relocated worker contract and the
re-pointed studio importer parity, and neither owning-suite gate proves that full conjunction alone.

1. **The relocated worker's `@storytree/drive` suite is green** _(gate: observe)_ _(covers: worker-relocation)_ `pnpm --filter @storytree/drive test`. The
   spine runs it at a clean committed HEAD and OBSERVES it green — the worker-relocation package-boundary
   contract (**worker-relocation**: `build-worker-relocation.test.ts` — the `@storytree/drive/build-worker`
   subpath exports the `BuildRegistry` / `runBuildJob` / `dispatchAcceptedBuild` / `routedBuildRunner` trio;
   over the REAL relocated `BuildRegistry` a scripted runner mints + drives to a terminal `passed` with its
   progress on the transcript; `build-worker.ts` imports nothing from `apps/*` (the ADR-0100 wall the
   relocation exists to satisfy); and the un-buildable / single-build typed refusals moved intact) passes
   offline (no DB, no API key, no SDK) — then signs an `adopted` verdict. This observes the whole
   `@storytree/drive` suite, which carries the relocation behaviour this leaf owns; `worker-relocation`
   greens via this gate's `(covers:)` (ADR-0097 §5). The wider cross-package PARITY claim (the studio
   importers re-pointed at the package and still green) is observed by gate 3's combined command, not
   inferred from this drive-only suite. (`routed-node-real-dispatch`
   already carries its own signed `--real` verdict from a genuine edit-existing red→green — the ADR-0144
   node-branch flip — so it is not re-adopted here.)
2. **The desktop backend suite is green** _(gate: observe)_ _(covers: desktop-build-route)_ `pnpm --filter desktop test`. The
   spine runs it at a clean committed HEAD and OBSERVES it green — the desktop build route
   (**desktop-build-route**: `build-route.test.ts` — `createBuildRouteMount` serves `POST /api/build` → 202
   + runId fire-and-forget + `GET /api/build?runId` → status + coarse transcript, the 404 / 409 / 405 typed
   answers and the chain fall-through, driven over the REAL relocated `BuildRegistry` + `runBuildJob` on a
   real `node:http` server, importing the worker by package name never `apps/studio/server`) passes offline
   (no DB, no API key, no SDK, no Electron) — then signs an `adopted` verdict. This observes the whole desktop
   `src/**` suite; the cap greens via this gate's `(covers:)` (ADR-0097 §5). The one production-wiring
   edit to `apps/desktop/electron/backend-entry.ts` (chaining the dispatchers + constructing the real
   `BuildContext`) is the desktop story's operator-attested sidecar glue, not a leg of this gate.
   (The `desktop-accept-dispatch` cap this gate ALSO covered was RETIRED by ADR-0155 — its
   `/api/chat/accept` route + `accept-dispatch.test.ts` were removed in PR #587; it is dropped from this
   gate's `(covers:)` and from the story's capability list.)
3. **The relocation and studio-importer parity are green together** _(gate: observe)_ `pnpm --filter @storytree/drive --filter studio test`.
   The spine OBSERVES both suites through one executable pnpm command at a clean HEAD. The drive suite
   proves the relocated worker's exports, real registry/worker behaviour, and no-`apps/*` boundary;
   the studio suite proves the re-pointed server importers and integration surface remain green from
   the new package home. Together they prove all of Story UAT leg 1, which binds to
   `desktop-build-mount#gate-3`. This gate carries no `(covers:)`: gate 1 already covers
   `worker-relocation`; this combined command exists only to bind the wider UAT leg honestly.

Adopting these three gates flips the story off `mapped`. `healthy` stays non-authorable
([ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md)) — the authored `status:`
is never `healthy`; the world's crown DERIVES green from the signed verdicts
([ADR-0040](../../docs/decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md)) and only when
every capability is `healthy` (`worker-relocation` and `desktop-build-route` via gates 1–2;
`routed-node-real-dispatch` via its own `--real` verdict) AND every own-proof obligation (the two
machine-witnessed Story UAT legs above)
is signed
([ADR-0082](../../docs/decisions/0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) /
ADR-0083 Fork A + ADR-0085). No single gate greens the story; there are no `human` UAT legs here
(`uat-1` and `uat-2` are both `witness: machine`; the former leg 3 is retired and non-numbered), so it
greens fully by machine observation once the gates + legs are signed.

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes — the two remaining legs green under
the package + desktop suites over a scripted build runner — with the capabilities' integration tests and
contracts green underneath. The capability/contract obligations are minimal-to-green (slow growth): the
relocation's net-new assertion is the package-boundary contract (the worker exports from its new home,
imports nothing from `apps/*`, the studio importers re-pointed + green); the desktop route is an
integration test against the real relocated registry + a scripted runner on a real `node:http` server; the
accept→dispatch is an integration test against the real relocated dispatch + registry with the runner
injected (a scripted double — ADR-0010 §5, so a live SDK-billed build is never run on a gate pass).

**Honest status — `proposed`.** Nothing here is `healthy`: per ADR-0020, `healthy` is only ever DERIVED
from signed verdicts, and this story has none yet. The three capabilities are proof-wired so the spine can
drive their offline suites red→green under its own gate
(`pnpm storytree story build desktop-build-mount --real`); the story's own machine-driven UAT node is
WITHHELD (its `uat_witness` is absent → human, ADR-0040), so driving the three capabilities to a signed
verdict is what makes the WHOLE story buildable. The live driven desktop walk this story UNBLOCKS is
chat-drive-bridge's operator-attested legs 5–6 — `healthy` is never authored here.

## Open modeling calls (for the owner)

The calls below were decided minimally and are RECORDED here as decided-and-surfaced (they are forced by
existing decisions, reversible, and internal — not re-litigated per the owner-fork bar):

1. **The worker's new home is a NEW `@storytree/drive/build-worker` subpath (decided).** The relocated
   machinery lands in a new narrow subpath beside the existing `@storytree/drive/build` entries, NOT in the
   `.` barrel (the barrel is the broad runtime surface; the build seam is deliberately a separate narrow
   subpath the studio imports lazily, and the desktop will too). FORCED by ADR-0100 (the desktop may not
   import `apps/studio/server`, so the worker must live in a package) + the established subpath pattern
   (`./build`, `./secrets`). Surfaced (not re-opened) so the boundary is visible.
2. **The studio `handleBuild` HTTP wrapper STAYS in `apps/studio/server` (decided).** Only the worker
   MACHINERY (registry / runBuildJob / runner family / dispatch / `BuildContext` type) relocates; the
   studio's `handleBuild` / `handleAdopt` HTTP handlers (the `POST /api/build` intake on the studio dev
   front) stay where they are, now thin wrappers over the relocated `runBuildJob` + the relocated
   `BuildContext` type. The studio keeps its own route mount; the desktop gets its own. Both call the SAME
   relocated worker — two callers, one worker, the ADR-0090 single-boundary invariant preserved. Surfaced
   (not re-opened).
3. **The desktop build route is a NEW factory in `apps/desktop/src/backend` (decided).** Mirroring
   `chat-sse-mount.ts` (local HTTP helpers reproduced, not imported from studio; an injectable runner; a
   chain-dispatcher `(req, res, pathname) => Promise<boolean>`). The one production-wiring edit to
   `apps/desktop/electron/backend-entry.ts` (chaining the new dispatcher + constructing its `BuildContext`
   from the lazy `@storytree/drive/build` runner + `@storytree/orchestrator` discovery, exactly as the chat
   mount was wired) is the operator-attested sidecar glue the `desktop` story already assigns to
   `backend-entry.ts` — the CI-proven core is the route factory, exercised by the desktop suite over stubs.
   Surfaced (not re-opened).
4. **ADR-0117 broker target is current; the old deferral is closed by ADR-0180.** Desktop verdict,
   UAT-attestation, and presence writes now persist through the authenticated `builder`-gated broker;
   local signing and local build compute remain. This story still does not own that proof-write
   composition, but it no longer records the temporary direct path as current.

This story stays a **pure source node** — nothing depends on it — so the new edges (`drive-machinery`,
`studio-build`, `chat-drive-bridge`, `desktop`, `library`) introduce no cycle (ADR-0058):
`chat-drive-bridge` already depends on `studio-build` + `desktop`, and every edge flows DOWN toward the
roots; nothing flows back up to this story.
