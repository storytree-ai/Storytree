---
id: "desktop-build-mount"
tier: story
title: "The desktop build mount — relocate the build worker into @storytree/drive, mount build + accept→dispatch on the desktop, so the thick-local app drives a build (ADR-0133 / ADR-0108 Phase 3+4)"
outcome: "The build worker machinery (BuildRegistry / runBuildJob / routedBuildRunner + the BuildContext type) moves out of apps/studio/server into the shared @storytree/drive package, where the desktop local backend may legally reuse it; the desktop sidecar then mounts POST /api/build (202 + runId, fire-and-forget) over a BuildContext wired from the relocated worker — so the desktop becomes a build-capable surface on the shared forest, with the worker's coarse progress streamed back. (Two clauses were corrected: the machinery list also named dispatchAcceptedBuild, and a third clause promised the chat accept click reaching it on that same backend. The accept-click front RETIRED with desktop-accept-dispatch under ADR-0155, and ADR-0404 d.5 then DELETED the function itself — caller-less since ADR-0175 removed spawn-builder.ts. The relocation and the desktop mount both stand; the engine is untouched.)"
status: retired
proof_mode: UAT
# RETIRED by ADR-0422 (2026-08-23). This story's journey is "the desktop becomes a build-capable
# surface … mounts POST /api/build", and ADR-0404 reversed it: dispatching a build is a CLI verb and
# no UI dispatches one. The mount went first (desktop-build-route, retired by ADR-0404); ADR-0422 then
# deleted the ENGINE the mount had been built over, after measuring that BuildRegistry / runBuildJob /
# routedBuildRunner / adoptRunnerFromAdoptStory had zero production consumers left. That took the
# story's last two live capabilities — `worker-relocation` and `routed-node-real-dispatch` — and with
# them every proof-bound source this story owned.
#
# So the retirement is BOTH mechanical and honest. Mechanically: with the code gone for good, RETIRE
# is the only sanctioned coverage drain (ADR-0252 D3), and all four capabilities are now retired with
# their `real:` arms dropped. Honestly: a `proposed` story tells every reader of the tree that this
# work is live and that the desktop dispatches builds, and neither is true.
#
# What LANDED here and is NOT withdrawn: the relocation proved packages/drive imports nothing from
# apps/* (the ADR-0100 wall), a property check:boundaries still holds over the package; and ADR-0144's
# persist semantics for a real node build stand, reached now via `storytree node build <id> --real
# --store pg`. repo-manifest.json drops this story's per-file binding and its hostedStories register
# entry in the same landing — with no proof-bound source left in a foreign building, the register
# entry would otherwise be a `packages-forward stale-register` violation (ADR-0192 D3).
#
# The UAT legs and gates below are KEPT and left unclaimed rather than renumbered: gate and criterion
# ordinals are positional, so removing one silently re-points the surviving legs' (proof-gate:)
# bindings and any signed verdict that named them. Body kept as history.
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
# desktop-build-route RETIRED by ADR-0404 (2026-08-22) — dispatching a build is a CLI verb, so the
# desktop's POST/GET /api/build mount was removed: createBuildRouteMount + build-route.ts +
# build-route.test.ts DELETED, with the wiring in electron/backend-entry.ts. Its `real:` arm bound those
# exact paths and is dropped, so it is no longer REAL-buildable and nothing implements it; it leaves this
# list and gate 2's (covers:). Its closing sentence read "the relocated worker it mounted over is
# UNTOUCHED (ADR-0404 D6) … so `worker-relocation` stands, as does routed-node-real-dispatch" — true
# when written, overtaken by ADR-0422, which deleted that worker and retired both. See
# desktop-build-route.md (retired).
# desktop-accept-dispatch RETIRED by ADR-0155 (2026-07-04) — the chat /api/chat/accept route it built was
# removed (PR #587). It too recorded that the story kept TWO live capabilities after ADR-0404; ADR-0422
# retired both, so all four are now retired and the story with them. See desktop-accept-dispatch.md and
# desktop-build-route.md (both retired).
capabilities: [worker-relocation, routed-node-real-dispatch]
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
#                       relocated BuildRegistry / runBuildJob / routedBuildRunner / BuildContext land in a
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
#                       chat accept front was removed). A depends_on
#                       edge to a retired story can never render and is corpus rot — the history stays
#                       here, the edge is gone.
#                       CORRECTED (ADR-0404 d.5): this note used to close "dispatchAcceptedBuild lives on
#                       in the drive worker subpath, consumed by chat-subagent-spawn's
#                       builder-spawn-dispatch". Both halves are dead. ADR-0175 retired
#                       builder-spawn-dispatch and deleted its packages/drive/src/spawn-builder.ts, which
#                       was the function's only caller; ADR-0404 d.5 then deleted dispatchAcceptedBuild
#                       and its DispatchResult type outright. The function no longer exists anywhere. The
#                       ENGINE it wrapped is untouched — BuildRegistry / runBuildJob / routedBuildRunner /
#                       BuildContext all still ship on @storytree/drive/build-worker with live callers.
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
artifact_edges: [studio-build, desktop, studio, library]
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

**Outcome —** The build worker machinery (`BuildRegistry` / `runBuildJob` / `routedBuildRunner` + the
`BuildContext` type) moves out of `apps/studio/server` into the shared `@storytree/drive` package, where
the desktop local backend may legally reuse it; the desktop sidecar then mounts `POST /api/build` (202 +
runId, fire-and-forget) over a `BuildContext` wired from the relocated worker — so the desktop becomes a
build-capable surface on the shared forest, with the worker's coarse progress streamed back.

> **Two clauses corrected — the accept-click step and the function it called are both gone.** This outcome
> read "`BuildRegistry` / `runBuildJob` / `dispatchAcceptedBuild` + the `BuildContext` type", and closed
> "…and the chat accept click reaches `dispatchAcceptedBuild` on that same backend — so the desktop becomes
> a complete propose→accept→drive→land surface". Neither half stands:
> - the **accept-click third step RETIRED** with the `desktop-accept-dispatch` capability
>   (ADR-0155,
>   2026-07-04) — its `/api/chat/accept` route was removed in PR #587, and it was already dropped from
>   `capabilities:`, the dependency graph, UAT leg 3 and gate 2;
> - the **function itself was DELETED** by
>   ADR-0404 d.5
>   — ADR-0175
>   had removed its only caller (`packages/drive/src/spawn-builder.ts`) and retired the
>   `builder-spawn-dispatch` capability, leaving it exercised by nothing but its own test.
>
> **The build ENGINE is untouched by either.** `BuildRegistry`, `runBuildJob`, `routedBuildRunner` and the
> `BuildContext` type all still exist on `@storytree/drive/build-worker` and still have callers — the
> studio's `handleBuild` and the desktop's `build-route.ts`. What this story delivered — the relocation and
> the desktop build mount — both stand; what is withdrawn is the accept-click front on top of them.

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
  but is route-mounted NOWHERE. *(That was the world at authoring time and is kept as the record of what
  this story faced. `dispatchAcceptedBuild` was relocated by capability 1, then DELETED by ADR-0404 d.5
  once ADR-0175 removed its only caller — it never did get route-mounted. The worker it wrapped did, and
  still is.)*
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
SDK-billed build on a gate pass). *(As authored, step 3 below was the accept-click wiring. It was
withdrawn — see the strikethrough — and the story's third live capability is now the ADR-0144 increment
`routed-node-real-dispatch`; the delivered journey is steps 1–2.)*

1. **Relocate the worker into `@storytree/drive`.** Move `BuildRegistry`, the `runBuildJob` /
   `routedBuildRunner` / `buildRunnerFromNodeBuild` / `adoptRunnerFromAdoptStory` family and the
   `BuildContext` type into a new `@storytree/drive/build-worker`
   subpath — and re-point the studio importers (`apiRouter.ts`, `devApi.ts`, the server suites) at the
   package, all still green. The desktop may now import the worker legally (a package, not another app's
   server). *(This step also moved the `dispatchAcceptedBuild` dispatch. It did move, and then ADR-0404 d.5
   deleted it — caller-less once ADR-0175 removed `spawn-builder.ts`. Everything else in this list still
   lives on the subpath.)*
2. **Mount the build route on the desktop.** Mount `POST /api/build` (202 + runId, fire-and-forget) +
   `GET /api/build?runId` on the desktop sidecar, wired with a `BuildContext` over the relocated worker
   (the `devApi.ts` recipe: lazy `@storytree/drive/build` runner, `@storytree/orchestrator` discovery for
   `isBuildable`), beside the existing chat mount.
3. ~~**Wire the accept click to the mounted dispatch.** The accept click's POST reaches
   `dispatchAcceptedBuild` on the desktop backend, so a `proposedUnitId`-bearing proposal → click →
   dispatch → `runBuildJob` → coarse progress streamed back, all on the desktop surface.~~
   **WITHDRAWN — this third step was never delivered and can no longer be.** Its capability
   `desktop-accept-dispatch` was RETIRED by ADR-0155 (the `/api/chat/accept` route removed in PR #587,
   the session-orchestrator driving via its spawn + landing tools instead), and ADR-0404 d.5 has since
   DELETED `dispatchAcceptedBuild` itself. The journey this story actually completes is steps 1–2: the
   worker is reachable from a shared package, and the desktop mounts a build route over it. The
   ADR-0144 increment `routed-node-real-dispatch` took the third capability slot.

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
> three remaining caps below are unaffected — the `/api/build` route is UNCHANGED.
>
> **CORRECTED (ADR-0404 d.5).** That last sentence also protected "the relocated `dispatchAcceptedBuild`
> worker call (still used by `builder-spawn-dispatch`)" as UNCHANGED. It is no longer true in either half:
> ADR-0175 retired `builder-spawn-dispatch` and deleted its `packages/drive/src/spawn-builder.ts` — the
> function's only caller — and ADR-0404 d.5 then deleted `dispatchAcceptedBuild` and its `DispatchResult`
> type. The three live caps are still unaffected, because none of them called it: the `/api/build` route
> and the relocated `BuildRegistry` / `runBuildJob` / `routedBuildRunner` / `BuildContext` engine all
> stand.

Listed roots-first (a capability appears after everything it depends on). All three live caps are **proof-wired**
(ADR-0057 — each carries a `proof:` block with a `real:` arm describing a genuine additive net-new
red→green against the real package/app source), so they form a **dependency-closed, acyclic set in which
every member resolves a `real:` arm** — what makes the WHOLE story story-`real`-buildable
(`isStoryBuildable`).

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`worker-relocation`](worker-relocation.md) | The build worker machinery (`BuildRegistry`, the `runBuildJob`/`routedBuildRunner`/runner family, the `BuildContext` type) lives in a new `@storytree/drive/build-worker` subpath, importing nothing from `apps/*`; the studio importers (`apiRouter.ts`, `devApi.ts`, the server suites) re-point at the package and stay green. *(Also carried `dispatchAcceptedBuild`, deleted by ADR-0404 d.5 — caller-less since ADR-0175.)* | — |
| ~~2~~ | ~~[`desktop-build-route`](desktop-build-route.md)~~ | **RETIRED by ADR-0404 (2026-08-22)** — dispatching a build is a CLI verb, so the desktop `POST`/`GET /api/build` mount was removed: `createBuildRouteMount`, `build-route.ts` and `build-route.test.ts` deleted with their wiring in `electron/backend-entry.ts`. Spec kept as history; the relocated worker it mounted over is untouched (D6). | ~~`worker-relocation`~~ |
| ~~3~~ | ~~[`desktop-accept-dispatch`](desktop-accept-dispatch.md)~~ | **RETIRED by ADR-0155** — the desktop `/api/chat/accept` route was removed (PR #587); spec kept as history. | ~~`desktop-build-route`~~ |
| 3 | [`routed-node-real-dispatch`](routed-node-real-dispatch.md) | A NODE-classified unit dispatched through `routedBuildRunner` drives the node's REAL proof with persist semantics — `nodeBuild(unitId, { real: true, dryRun: false, verdictStore: 'pg' })`, never the synthetic non-persisting `--live` smoke — with a mode line naming the real red→green, the persisted verdict, and the parked `claude/real/<unit>-<run>` branch the human lands (story branch unchanged). Post-landing increment, ADR-0144. | `worker-relocation` |

## Dependency graph (will be code-derived)

These are **within-story** edges. Until the code exists they are authored from the intended data-flow; when
the units are built they MUST be re-derived from the real imports/calls between capabilities (static
analysis, ADR-0010 §3) and corrected if the code disagrees. The graph is a tree rooted at
`worker-relocation` (the package-home leaf, no in-story upstream): the desktop mount chain hangs off it,
and the ADR-0144 routing flip hangs off it directly.

- ~~`desktop-build-route` → `worker-relocation`~~ (RETIRED by ADR-0404 — the mount is deleted, so the
  edge has no code left to derive from. It read: the route mounted a `BuildContext` over the relocated
  worker, importing `BuildRegistry` / `runBuildJob` / the `BuildContext` type from
  `@storytree/drive/build-worker`, and could not be mounted until the worker was reachable from a package.)
- ~~`desktop-accept-dispatch` → `desktop-build-route`~~ (RETIRED by ADR-0155 — the accept-click front is gone)
- `routed-node-real-dispatch` → `worker-relocation`
  - The ADR-0144 flip EDITS the node arm of `routedBuildRunner` inside the relocated
    `packages/drive/src/build-worker.ts` — the file capability 1 created. It couples to the relocated
    worker's routing composition and to nothing else in-story. *(This parenthetical read "the accept path
    that CALLS the routed runner is the relocated dispatch itself". That path is gone twice over —
    ADR-0155 retired the accept front and ADR-0404 d.5 deleted `dispatchAcceptedBuild`. The routed runner's
    live callers are the studio's `handleBuild` and the desktop's `build-route.ts`, both of which construct
    a `BuildContext` over it directly. The chat-drive-bridge lineage remains history — see the frontmatter
    note; that story is retired and the edge dropped.)*

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
  was removed with ADR-0155's retirement of the `chat-build-dispatch` cap. Its coverage then sat in
  `@storytree/drive`'s `build-worker-relocation.test.ts` — **until ADR-0404 d.5**, which deleted
  `dispatchAcceptedBuild` and removed those assertions with it. **No suite covers the dispatch's behaviour
  now, because there is no dispatch**; the relocation suite still carries all four `wr-*` contracts over
  the engine that remains.) This story OWNS the relocation; studio-build owns the original site + its
  surface-resident `handleBuild` HTTP wrapper (which stays a thin wrapper over the relocated `runBuildJob`).
- **`chat-drive-bridge`** *(RETIRED, ADR-0155 — lineage record; the `depends_on` edge was dropped in the
  2026-07-05 map audit since an edge to a retired story can never render)* — the **dispatch that was
  relocated, and the live legs it once unblocked**. chat-drive-bridge
  authored `dispatchAcceptedBuild` (`apps/studio/server/chat-build-dispatch.ts`) + the accept-to-land Build
  affordance (the studio `ChatPanel`). The dispatch moved into the drive worker subpath WITH the rest of the
  worker (it imported `runBuildJob` + the `BuildContext` type — both relocating).
  This story DELIVERS the mechanism chat-drive-bridge's operator-attested legs 5–6 need (the live driven
  desktop walk + appearance); those legs stay owned by chat-drive-bridge (ADR-0070). CONSUMED — this story
  re-homed the dispatch; it does not own the affordance or the live attestation.
  *(CORRECTED: this entry said "the accept click … is wired through the desktop's mounted dispatch by
  capability 3", and closed "this story re-homes the dispatch + mounts it". Neither happened. Capability 3
  — `desktop-accept-dispatch` — was RETIRED by ADR-0155 before that wiring landed, so the dispatch was
  re-homed but never mounted; ADR-0404 d.5 has since DELETED `dispatchAcceptedBuild` and its
  `DispatchResult` type, ADR-0175 having removed its only caller. The re-homing is kept in the record
  because it is what this story did.)*
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

## UAT Test Criteria

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
> The ONE leg below (leg 2 deleted 2026-08-21 under ADR-0294 D2; leg 3 retired by ADR-0155) is
> automatable by the package + desktop suites
> (`@storytree/drive` + the desktop
> `node:test` suite) over a scripted build runner + the in-memory seed. There is NO live leg in this
> story's UAT — the live driven desktop build (a real `story build --real` to a spine-signed verdict + an
> opened PR, with progress streamed back) and its appearance are **chat-drive-bridge's** operator-attested
> Story UAT legs 5–6 (ADR-0070), which this story UNBLOCKS. This story's UAT therefore proves the MECHANISM
> is mounted and reachable end-to-end offline; it deliberately does NOT re-prove or re-attest the live
> walk that lives in chat-drive-bridge.
>
> **Per-leg witness (ADR-0106).** The one remaining leg (`uat-1`) is `witness: machine` — the
> suites demonstrably cover it and it names its exact proof gate, so the adopt pass
> observe-and-signs it. *(This paragraph read "The two remaining legs (`uat-1`, `uat-2`) are
> `witness: machine`" until 2026-08-21.)* **Leg 3 (the accept→dispatch
> walk) was RETIRED by ADR-0155** with the `desktop-accept-dispatch` cap — the `/api/chat/accept` route +
> `accept-dispatch.test.ts` were removed in PR #587, so there is nothing left to witness there. No leg is
> `human` here (the human-witness legs are chat-drive-bridge's, not this story's). No leg rests `either`.
> The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the machine-driven
> whole-story UAT node stays withheld; the crown derives from the per-leg roll-up.

> **ADR-0294 D2 pass — 2026-08-21.** **Leg 2** ("the desktop mounts a build route over the relocated
> worker") was DELETED, not re-pointed. Its proof already lives one rung down at this story's own
> capability [`desktop-build-route`](desktop-build-route.md), whose four contracts are asserted in
> `apps/desktop/src/backend/build-route.test.ts` by tests named for them — checked against those
> tests' ACTUAL assertions, clause for clause: `dbr-post-dispatches-buildable-id` (a buildable POST
> mints and runs over the REAL relocated worker, 202 + `runId`, and a `GET` poll reaching `passed` —
> the leg's 202-and-transcript halves), `dbr-refuses-unbuildable-id` (404 with the worker never
> invoked), `dbr-typed-answers-and-fall-through` (409 concurrent, 405 wrong method, `false`
> fall-through on an unrelated path) and `dbr-imports-worker-by-package-not-app` (imports the worker
> by package name, nothing from `apps/studio/server`). Reliability gate 2 below already runs exactly
> that suite and already carries `(covers: desktop-build-route)`, so the leg was a second signature
> over a capability the same command greens.
>
> **Correction, 2026-08-22 (ADR-0404).** That `(covers: desktop-build-route)` clause was true when this
> pass ran and is not now: the capability has since been RETIRED with the route it proved, so the
> `(covers:)` was dropped from gate 2 and `build-route.test.ts` no longer exists. Nothing above is
> re-decided by that — the leg deletion stands on its own reasoning, and gate 2 stays in place (ids are
> positional) now covering no capability, exactly as it already stood for `desktop-accept-dispatch`.
>
> Its ordinal `desktop-build-mount#uat-2` is BURNED and recorded `superseded` in
> [`stories/uat-legacy-dispositions.json`](../uat-legacy-dispositions.json); leg 1 KEEPS ordinal 1
> and no survivor may ever be renumbered onto 2. The leg carried `proven=–` (no signed verdict) at
> deletion, so no proof credit was destroyed, and it held no `(detail:)` pointer, so no
> `uat-criterion` artifact was orphaned. Reliability gate 2 is LEFT IN PLACE and is now unclaimed by
> any criterion — gate ids are positional, so deleting one would silently re-point signed verdicts
> and surviving bindings.
>
> **Leg 1 was NOT a D2 candidate and stays.** Its gate command is `pnpm --filter @storytree/drive
> --filter studio test` — TWO packages — and the conjunction it proves (the relocated worker's
> exports and boundary AND the re-pointed studio importers still green from the new home) is proven
> by neither owning suite alone, which is exactly why gate 3 exists and carries no `(covers:)`.

**Goal —** The build worker is reachable from a shared package (importing nothing from `apps/*`, the
studio importers still green); the desktop local backend mounts a build route over it, mints a run on the
relocated registry, and
streams the worker's coarse progress back — all offline over a scripted runner, with no verdict ever
handed in and no app importing another app's server.

**End state** — the worker lives in a shared package the desktop may legally import; the desktop mounts a build
route (`POST /api/build`) over it and drives a (scripted, offline) run to a streamed terminal state on the
desktop surface — every wall held (no app imports another app's server; the route handed in no verdict; the
spine signs, not the route; CI is the second proof before the trunk). *(This paragraph and the retired-leg-3
note below sat BELOW the numbered list until 2026-08-21. The parser appends every non-numbered line to the
item currently open, so they were part of the last criterion's bound content; moving them above the list is
what keeps leg 1's `(revision-id:)` binding intact now that it is the last item.)*

> **~~Leg 3. An accepted id POSTed to the desktop reaches the dispatch and streams progress back.~~
> RETIRED by ADR-0155 (2026-07-04).** This leg proved the `desktop-accept-dispatch` cap — the desktop
> `/api/chat/accept` route reaching `dispatchAcceptedBuild`. That route + its `accept-dispatch.test.ts` were
> removed in PR #587 (the session-orchestrator drives via its spawn + landing tools rather than accepting a
> chat proposal into a build), so this leg has nothing left to witness and is dropped.
> (Deliberately left as a non-numbered note so it no longer parses as a `#uat-n` obligation.)
>
> **CORRECTED (ADR-0404 d.5).** This note closed with "the relocated `dispatchAcceptedBuild` worker call
> itself REMAINS live under `builder-spawn-dispatch`; only the desktop chat ACCEPT front retired." Both
> halves have since fallen: ADR-0175 retired `builder-spawn-dispatch` and deleted its only caller
> (`packages/drive/src/spawn-builder.ts`), and ADR-0404 d.5 deleted `dispatchAcceptedBuild` and its
> `DispatchResult` type. The leg's retirement is unaffected — it was already dropped for its own reason.

> **ADR-0404 d.5 pass — 2026-08-21, leg 1 re-worded.** Leg 1's walkthrough named
> `dispatchAcceptedBuild` as one of the four symbols to import from `@storytree/drive/build-worker`. That
> export no longer exists, so the leg as written could not be executed as described. It now names
> `routedBuildRunner` — which `build-worker-relocation.test.ts` imports and asserts — leaving the leg's
> claim (the subpath resolves, the worker imports nothing from `apps/*`, the studio importers stay green)
> intact. The criterion is NOT deleted and its `uatc_` id is unchanged; only the prose moved, so its
> `(revision-id:)` was recomputed with `storytree uat rerevision` and the superseded value recorded as
> `(previous-revision-id:)`. No ordinal was renumbered and no reliability gate was touched.


1. **The worker lives in a shared package, importing nothing from `apps/*`, and the studio still builds.** _(criterion-id: uatc_4840168f18bf2c73f3a547b8)_ _(revision-id: uatr1:50ed86368b85d445)_ _(previous-revision-id: uatr1:244dfa46ad675ff3)_
   _(witness: machine)_ _(proof-gate: desktop-build-mount#gate-3)_ Import the worker trio (`BuildRegistry`, `runBuildJob`, `routedBuildRunner`,
   the `BuildContext` type) from `@storytree/drive/build-worker`, and run the relocated worker's own suite +
   the re-pointed studio server suite. **Success —** the subpath resolves and the trio is exported (it does
   NOT resolve at HEAD — the right-kind module-not-found red); the relocated worker imports nothing from
   `apps/*` (the ADR-0100 wall the relocation exists to satisfy, asserted structurally); the studio
   importers (`apiRouter.ts`, `devApi.ts`) re-point at the package and the existing server suites
   (`buildWorker.test.ts`, `buildRegistry.test.ts`, the two integration
   suites) stay green from the new home (parity — no behaviour changed, only the home).

## Reliability Gates

The unregistered capability `worker-relocation` (of the three this section was written for,
`desktop-accept-dispatch` was RETIRED by ADR-0155 and `desktop-build-route` by ADR-0404)
is **brownfield-by-outcome** (`status: mapped`): it LANDED with a real, passing, OFFLINE automated
test that genuinely exercises it (the relocation's package-boundary contract), but storytree's own
prove-it-gate never DROVE those proofs to a persisted verdict — the `--real --store pg` signing was skipped
at build time, so the code is tested-but-UNREGISTERED. On a GREEN base a fresh `--real` Build HALTS (there
is no red→green left to earn, and *halt is never a pass*, ADR-0130), so the honest path off `mapped` is
**not** a manufactured Build over mature tested code — it is the author-declared **reliability gates** below,
observe-and-signed to an `adopted` verdict
(ADR-0085,
resolving ADR-0083
Fork B). This is the `mapped → healthy` = **Adopt** transition
ADR-0094 names
(d.3 retired the status-blind Build for `mapped` stories), greening each covered capability via the
`(covers:)` coverage ADR-0097 §5/§2 defines. Distinct from `## UAT Test Criteria` above (the integrated, offline
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
   subpath exports the `BuildRegistry` / `runBuildJob` / `routedBuildRunner` trio + the `BuildContext` type;
   over the REAL relocated `BuildRegistry` a scripted runner mints + drives to a terminal `passed` with its
   progress on the transcript; `build-worker.ts` imports nothing from `apps/*` (the ADR-0100 wall the
   relocation exists to satisfy); and the single-build typed refusal moved intact — *this description named
   `dispatchAcceptedBuild` as a fourth export and "the un-buildable / single-build typed refusals" until
   ADR-0404 d.5 deleted that function; the un-buildable arm was its guard and is now pinned at the callers
   (`build-route.test.ts`'s 404 branch, the studio `buildApi` suite), and the gate's ordinal, command and
   `(covers:)` are all unchanged*) passes
   offline (no DB, no API key, no SDK) — then signs an `adopted` verdict. This observes the whole
   `@storytree/drive` suite, which carries the relocation behaviour this leaf owns; `worker-relocation`
   greens via this gate's `(covers:)` (ADR-0097 §5). The wider cross-package PARITY claim (the studio
   importers re-pointed at the package and still green) is observed by gate 3's combined command, not
   inferred from this drive-only suite. (`routed-node-real-dispatch`
   already carries its own signed `--real` verdict from a genuine edit-existing red→green — the ADR-0144
   node-branch flip — so it is not re-adopted here.)
2. **The desktop backend suite is green** _(gate: observe)_ `pnpm --filter desktop test`. The
   spine runs it at a clean committed HEAD and OBSERVES the whole desktop `src/**` suite green offline
   (no DB, no API key, no SDK, no Electron) — then signs an `adopted` verdict.
   **This gate now covers NO capability, and carries no `(covers:)`.** It covered two, and both were
   retired with the routes they proved: `desktop-accept-dispatch` by ADR-0155 (the `/api/chat/accept`
   route + `accept-dispatch.test.ts` removed in PR #587), and `desktop-build-route` by ADR-0404
   (2026-08-22) — `createBuildRouteMount` and `build-route.test.ts` deleted along with the wiring in
   `electron/backend-entry.ts`, because dispatching a build is a CLI verb and no UI dispatches one.
   The gate itself is LEFT IN PLACE: gate ids are positional, so deleting one would silently re-point
   signed verdicts. It is also unclaimed by any CRITERION — story UAT leg 2 restated exactly the
   `desktop-build-route` contracts this same command greened, so ADR-0294 D2 deleted it on 2026-08-21,
   one day before the capability itself went. So the gate today observes a real suite and greens
   nothing through `(covers:)`, which is honest rather than broken.
3. **The relocation and studio-importer parity are green together** _(gate: observe)_ `pnpm --filter @storytree/drive --filter studio test`.
   The spine OBSERVES both suites through one executable pnpm command at a clean HEAD. The drive suite
   proves the relocated worker's exports, real registry/worker behaviour, and no-`apps/*` boundary;
   the studio suite proves the re-pointed server importers and integration surface remain green from
   the new package home. Together they prove all of Story UAT leg 1, which binds to
   `desktop-build-mount#gate-3`. This gate carries no `(covers:)`: gate 1 already covers
   `worker-relocation`; this combined command exists only to bind the wider UAT leg honestly.

Adopting these three gates flips the story off `mapped`. `healthy` stays non-authorable
(ADR-0020) — the authored `status:`
is never `healthy`; the world's crown DERIVES green from the signed verdicts
(ADR-0040) and only when
every capability is `healthy` (`worker-relocation` via gate 1; `routed-node-real-dispatch` via its own
`--real` verdict — `desktop-build-route`, which greened via gate 2, was retired by ADR-0404 and no
longer rolls into the crown) AND every own-proof obligation (the ONE
machine-witnessed Story UAT leg above)
is signed
(ADR-0082 /
ADR-0083 Fork A + ADR-0085). No single gate greens the story; there are no `human` UAT legs here
(`uat-1` is `witness: machine`; `uat-2` was deleted 2026-08-21 under ADR-0294 D2 and its ordinal is
burned; the former leg 3 is retired and non-numbered), so it
greens fully by machine observation once the gates + the leg are signed. *(This paragraph read "the two
machine-witnessed Story UAT legs above" and "`uat-1` and `uat-2` are both `witness: machine`" until that
deletion.)*

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes — the one remaining leg green under
the combined drive + studio suite — with the capabilities' integration tests and
contracts green underneath. *(This read "the two remaining legs green under the package + desktop
suites" until 2026-08-21, when leg 2 was deleted under ADR-0294 D2 as a restatement of the
`desktop-build-route` contracts the desktop suite already proved — and that capability was itself
retired by ADR-0404 the next day.)* The capability/contract obligations are minimal-to-green (slow growth): the
relocation's net-new assertion is the package-boundary contract (the worker exports from its new home,
imports nothing from `apps/*`, the studio importers re-pointed + green); the desktop route WAS an
integration test against the real relocated registry + a scripted runner on a real `node:http` server —
in both cases with the build runner injected as a scripted double (ADR-0010 §5, so a live SDK-billed build
is never run on a gate pass). *(A third clause promised "the accept→dispatch is an integration test against
the real relocated dispatch + registry with the runner injected". No such obligation survives: its
capability `desktop-accept-dispatch` was RETIRED by ADR-0155, and ADR-0404 d.5 then deleted
`dispatchAcceptedBuild`, so there is no dispatch left to integration-test. The two obligations above are
the story's whole proof surface.)*

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
