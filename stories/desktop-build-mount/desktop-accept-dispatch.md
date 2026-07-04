---
id: "desktop-accept-dispatch"
tier: capability
story: desktop-build-mount
title: "The desktop accept→dispatch — an accepted unit id POSTed to the desktop reaches dispatchAcceptedBuild over the relocated worker, progress streamed back"
outcome: "An accepted `proposedUnitId` POSTed to the desktop backend reaches `dispatchAcceptedBuild` over the relocated worker, mints a run, fires `runBuildJob`, and the worker's coarse progress is read back over the desktop surface — the accept click's mechanism, end-to-end on the desktop, with a scripted runner."
status: retired
proof_mode: integration-test
depends_on: [desktop-build-route]
# RETIRED by ADR-0155 (2026-07-04). The desktop /api/chat/accept route this capability built was removed
# (PR #587: accept-dispatch.ts + its wiring in electron/backend-entry.ts deleted) — the chat surface no
# longer accepts a proposal into a build; the orchestrator drives via its spawn (ADR-0137) + landing
# (ADR-0152) tools. The `real:` arm is dropped (its test apps/desktop/src/backend/accept-dispatch.test.ts
# was deleted with the feature), so this capability is no longer REAL-buildable. This retirement is
# scoped to desktop-accept-dispatch ONLY — the desktop-build-mount story keeps its other three caps
# (worker-relocation, desktop-build-route, routed-node-real-dispatch); the /api/build route and the
# relocated dispatchAcceptedBuild worker call are UNCHANGED. Body kept as history.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
---

# The desktop accept→dispatch — an accepted unit id reaches dispatchAcceptedBuild on the desktop

**Outcome —** An accepted `proposedUnitId` POSTed to the desktop backend reaches `dispatchAcceptedBuild`
over the relocated worker, mints a run, fires `runBuildJob`, and the worker's coarse progress is read back
over the desktop surface — the accept click's mechanism, end-to-end on the desktop, with a scripted runner.

**Depends on —** [`desktop-build-route`](desktop-build-route.md) — the accept dispatch reuses the SAME
mounted `BuildContext` + registry the build route stands up (one in-flight run, the shared `GET
/api/build?runId` poll), and calls `dispatchAcceptedBuild` (relocated, capability 1) over it. It is the
accept-click front of the build route's worker wiring.

> **Proof status (honest) — `proposed`, NET-NEW accept path over the RELOCATED dispatch + the mounted
> route.** This is the third link of ADR-0133 d.3 and what makes the desktop a COMPLETE
> propose→accept→drive surface: the chat surface already carries a machine-actionable `proposedUnitId`
> (chat-drive-bridge), the relocated worker carries `dispatchAcceptedBuild` (capability 1), and the desktop
> mounts a build route over it (capability 2) — but nothing yet wires an ACCEPTED id from the chat surface
> to the dispatch on the desktop. This capability adds that accept path: a `proposedUnitId`-bearing
> proposal → human accept (a click, the affordance owned by chat-drive-bridge) → a POST to the desktop
> backend → `dispatchAcceptedBuild` over the relocated worker → `runBuildJob` → coarse progress read back
> over the desktop surface. The accept is the HUMAN's (a UI click POSTing through the api seam), never a
> free-text "yes" the agent parsed (ADR-0108 d.3).

## Guidance

**THIS BUILD — the current `--real` increment (net-new): the desktop accept→dispatch wiring.** Today the
desktop will mount `POST /api/build` (capability 2), and the relocated worker carries `dispatchAcceptedBuild`
(capability 1) — but the chat surface's accepted `proposedUnitId` has no path to the dispatch on the
desktop. This increment authors the accept path so the human's click reaches `dispatchAcceptedBuild` on the
desktop backend.

- **THE MODELING CALL — the accept path's SHAPE (decided minimally, surfaced).** Two honest shapes; the
  build (capability 3) picks one against the real renderer/backend at build time:
  - **(a) A thin accept route** — `POST /api/chat/accept { unitId }` on the desktop backend that calls
    `dispatchAcceptedBuild(unitId, build)` over the SHARED `BuildContext` (the same registry capability 2
    mounted), returning the typed `{ ok, runId }`, with progress read back over the shared `GET
    /api/build?runId`. The renderer's accept button POSTs here. This keeps the accept's `accepted`
    provenance explicit (ADR-0108 d.3 — a distinct accept act, not the generic build intake).
  - **(b) The build route reused** — the accept button POSTs the accepted id to the SAME `POST /api/build`
    (capability 2), since the relocated `dispatchAcceptedBuild` and `handleBuild`'s POST branch compose the
    identical worker pieces. Then capability 3's net-new assertion is the END-TO-END accept walk (an
    accepted id POSTed to the desktop reaches the relocated dispatch/worker and streams back) over the
    desktop surface, rather than a new route.
  - **Recommendation: (a)** — a distinct accept route keeps the `accepted` provenance legible and matches
    the chat-build-dispatch CORE (`dispatchAcceptedBuild` exists precisely because the accept is a SEPARATE
    act from the generic build POST). But the build MUST re-derive this against the real renderer's accept
    button + the real backend chain and correct if (b) is what the code wants. Either way the SCOPE is
    `apps/desktop/src`, the dispatch is the RELOCATED `dispatchAcceptedBuild`, and the net-new assertion is
    "an accepted id reaches the relocated dispatch on the desktop and streams progress back".
- **NET-NEW, the accept path is absent at HEAD.** Author `apps/desktop/src/backend/accept-dispatch.test.ts`
  (a `node:test` file). It drives the accept path with an ACCEPTED unit id over the relocated worker + a
  scripted runner, asserting the post reaches `dispatchAcceptedBuild` and the run streams progress back. At
  HEAD the accept slice does not exist (module-not-found on the new factory, or the route is absent) → red.
- **REUSE the relocated dispatch + the mounted registry, never re-implement.** The accept slice calls
  `dispatchAcceptedBuild` (from `@storytree/drive/build-worker`, capability 1) over the SAME `BuildContext` +
  registry capability 2 mounted (one in-flight run; the shared poll). It adds no second build path, no second
  registry. The DIFFERENCE from the generic build route is the `accepted` provenance — the slice dispatches
  ONLY an explicitly-accepted id (the human's click), never a free-text "yes" (ADR-0108 d.3).
- **The accept is the HUMAN's, via the api seam (ADR-0004 / ADR-0108 d.3).** The renderer's accept button
  (the affordance owned by chat-drive-bridge, already built in the studio renderer the desktop hosts) POSTs
  the accepted id through the api seam; the chat thin client imports no agent/drive/model
  (`modelPathBoundary.test.ts`). The desktop backend is the dispatch boundary; the click is the gate. The
  agent declared the id (chat-drive-bridge's proposed-unit-signal); the human accepts it (the click); this
  capability routes the accepted id to the relocated dispatch on the desktop.
- **A SAFE write — INTENT, never a verdict (ADR-0091).** The accept dispatch hands the worker a unit id; it
  never accepts (the human's click already did), signs, or persists a verdict. The spine inside `runBuildJob`
  observes RED→GREEN and signs; CI re-proves green before the trunk (ADR-0022). The write is DIRECT for the
  inner-circle MVP (the broker deferred, ADR-0133 d.2); no broker scoped here.
- **The PROGRESS streams back over the desktop surface.** `runBuildJob` streams coarse lines into the shared
  registry run (`registry.appendLine`); the desktop reads them back over the SAME `GET /api/build?runId` the
  build route mounted (capability 2). The accept dispatch reuses that poll — it adds no second progress
  channel.
- **The RED the spine observes:** the accept path is absent (module-not-found / no route) at HEAD. **The
  GREEN:** the accept slice composes the relocated `dispatchAcceptedBuild` over the mounted registry; the
  test (real relocated registry + a scripted runner, on a real `node:http` server) asserts an accepted
  buildable id mints a run + returns a runId, the worker's progress is read back over the shared poll, an
  un-buildable id is a typed refusal (never dispatched), and a concurrent accept is the single-build refusal.

WHY THIS IS A CAPABILITY (not a contract): its honest proof spans the ACCEPT PATH AS A WHOLE — the accept
intake (an accepted id in), the relocated dispatch invocation, the run mint on the shared registry, the
fire-and-forget worker, and the progress read back over the desktop surface — exercised over a REAL
`node:http` server against the REAL relocated `dispatchAcceptedBuild` + `BuildRegistry` with the runner
injected as a scripted double. That crosses the accept intake, the relocated dispatch, and the shared
progress poll, so it is an integration test against the real relocated worker over real HTTP, not a single
isolated assertion.

COMPLETES THE DESKTOP SURFACE (ADR-0133 d.3 / ADR-0108 Phase 3+4): with this capability the desktop carries
propose (chat-drive-bridge's chat mount, with a `proposedUnitId`), accept (the renderer's Build button), and
drive (the mounted build route + this accept→dispatch over the relocated worker) — a complete
propose→accept→drive surface on the shared forest. The LIVE driven walk to a signed verdict + an opened PR
is chat-drive-bridge's operator-attested leg 5, which this capability's mechanism makes possible.

PROOF INTEGRITY (ADR-0091): the accept dispatch hands the worker a build intent off the human's click; the
spine inside the worker observes RED→GREEN from real exit codes and SIGNS; CI re-proves green before the
trunk (ADR-0022). The dispatch holds no signing key, no verdict path, no DB connection — the damage ceiling
is a briefly-wrong hue corrected by CI, exactly the ADR-0091 argument and the bound ADR-0133 d.2 relies on
for the deferred-broker direct write.

OFFLINE-TESTABLE BY INJECTION: the test injects a SCRIPTED `BuildRunner` (emits coarse lines + a terminal
envelope, no SDK) over the REAL relocated `BuildRegistry`, on a REAL `node:http` server — so the accept path
+ the worker wiring are proven WITHOUT a live SDK-billed build on every gate pass (ADR-0010 §5). The live
driven accept walk is chat-drive-bridge's operator-attested leg 5.

## Integration test

**Goal —** Prove that an accepted `proposedUnitId` POSTed to the desktop backend reaches the relocated
`dispatchAcceptedBuild`, mints a run on the shared registry, fires `runBuildJob`, and the worker's coarse
progress is read back over the desktop surface — with un-buildable ids and concurrent accepts refused, and
no verdict ever handed in.

The integration test exercises this capability against its **real in-story collaborators** — the real
relocated `dispatchAcceptedBuild` + `BuildRegistry` + `runBuildJob` (`@storytree/drive/build-worker`) — over
a REAL `node:http` server, with a SCRIPTED `BuildRunner` (no SDK spend, ADR-0010 §5). No stubs of the
dispatch/registry/worker machinery.

The integration test would:

1. Stand up the desktop accept path (the chosen shape — a thin accept route, or the build route reused) over
   the SHARED `BuildContext` (real relocated `BuildRegistry`, a scripted runner, an injected `isBuildable`)
   on a real `node:http` server; POST an ACCEPTED buildable `proposedUnitId`.
2. Assert the post reaches `dispatchAcceptedBuild`, which returns `{ ok: true, runId }` (a run minted on the
   shared registry), and once the fire-and-forget job drains, `GET /api/build?runId` reports the run terminal
   `passed` with the scripted runner's coarse progress on `transcript` (the progress read back over the
   desktop surface).
3. Assert an UN-buildable / unknown accepted id (`isBuildable` false) → a typed refusal and `runBuildJob`
   NEVER invoked (no run against nothing) — the accept dispatches ONLY a buildable accepted id.
4. Assert a SECOND accept while a run is live → the single-build refusal (the shared registry's guard
   surfaced — you can't accept-and-drive twice at once), the running run untouched.
5. Assert the accept dispatch holds NO signing key and NO verdict path — its only collaborators are the
   relocated dispatch + the shared registry + the runner (read structurally); no `events.verdict` write, no
   signer is reachable (ADR-0091). The verdict is the WORKER's, off the human's accept.
6. Assert (STRUCTURALLY) that the accept slice imports the dispatch from `@storytree/drive/build-worker` by
   package name and imports NOTHING from `apps/studio/server` (the ADR-0100 wall).

## Contracts (4)

The test-proven leaf behaviours — each **one named, substantive test** in the desktop suite (`node:test`),
exercised against the real relocated `dispatchAcceptedBuild` + `BuildRegistry` over a real `node:http`
server with a scripted `BuildRunner`.

> **COVERAGE CONVENTION — REQUIRED, or the verdict reads 0/4 (ADR-0122 / ADR-0126).** A contract is
> "covered" only when some test's NAME carries the contract id as a whole token (`test("<contract-id>: …")`)
> AND that test asserts something SUBSTANTIVE. Author **one named, substantive test per contract below**,
> its name beginning with the contract id, and ASSERT ALL FOUR. Target: **4/4 covered.**

1. **`dad-accepted-id-reaches-dispatch`** — an accepted buildable id mints + runs, progress back
   - **asserts —** an ACCEPTED buildable `proposedUnitId` POSTed to the desktop accept path reaches the
     relocated `dispatchAcceptedBuild`, mints a run on the shared registry (returns a runId), fires
     `runBuildJob`, and once drained the run is terminal `passed` with the scripted progress read back over
     the shared `GET /api/build?runId` poll.
   - **covers —** `apps/desktop/src/backend/accept-dispatch.ts` (the accept intake + the relocated dispatch
     invocation) *(provisional path)*
2. **`dad-refuses-unbuildable-accepted-id`** — an un-buildable accepted id is refused, worker never invoked
   - **asserts —** an un-buildable / unknown accepted id (`isBuildable` false) → a typed refusal and
     `runBuildJob` is NEVER invoked — the accept dispatches ONLY a buildable accepted id (no run against
     nothing).
   - **covers —** `apps/desktop/src/backend/accept-dispatch.ts` (the buildability guard)
3. **`dad-single-build-guard-shared`** — a concurrent accept is refused, shared registry untouched
   - **asserts —** a second accept while a run is live → the single-build refusal (the SHARED registry's
     guard — the accept path and the build route share one in-flight run), the running run untouched.
   - **covers —** `apps/desktop/src/backend/accept-dispatch.ts` (the shared-registry refusal mapping)
4. **`dad-accept-is-intent-via-package`** — the human's accept, a safe write over the package import
   - **asserts —** the accept slice imports `dispatchAcceptedBuild` from `@storytree/drive/build-worker`
     (package name) and imports NOTHING from `apps/studio/server` (ADR-0100); its only collaborators are the
     relocated dispatch + the shared registry + the runner — it holds no signing key, no `events.verdict`
     writer, no DB connection (a build INTENT off the human's accept, ADR-0091); and the accept arrives as an
     explicit POST (the human's click via the api seam), never a parsed free-text "yes" (ADR-0108 d.3).
   - **covers —** `apps/desktop/src/backend/accept-dispatch.ts` (the import surface + the construction)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): the accept path is authored as a new
slice in `apps/desktop/src/backend`, test-first, over the relocated dispatch + the mounted build route.

- **The test —** `apps/desktop/src/backend/accept-dispatch.test.ts` (`node:test` + `node:assert/strict`,
  the desktop convention). It imports the accept slice (the chosen shape), builds a REAL relocated
  `BuildRegistry`, an injected `isBuildable`, and a scripted `BuildRunner` (emits coarse lines + a terminal
  envelope; no SDK), and drives the accept path over a REAL `node:http` server. It awaits the fire-and-forget
  job's drain before asserting the terminal run state + the progress read back over the shared poll.
- **The RED the spine observes (before IMPLEMENT) —** the accept path is absent at HEAD (module-not-found on
  the new slice / no accept route), so the test fails. It asserts the accepted-id dispatch, the un-buildable
  refusal, the shared single-build refusal, and the intent-via-package construction.
- **The GREEN —** `apps/desktop/src/backend/accept-dispatch.ts` (the chosen shape): the accept slice routes
  an accepted id to the relocated `dispatchAcceptedBuild` over the shared `BuildContext` + registry, with
  progress read back over the shared poll. It composes the relocated worker; it adds no build path, no
  signer, no DB. The import resolves, the assertions hold, the desktop suite + typecheck are green.

Rules:

- **Reuse the relocated dispatch + the shared registry** — call `dispatchAcceptedBuild` from
  `@storytree/drive/build-worker` over the SAME `BuildContext` + registry capability 2 mounted; add no second
  build path, no second registry (`dad-single-build-guard-shared`).
- **The accept is the human's, via the api seam** — dispatch an EXPLICITLY-accepted id POSTed through the
  api seam (the renderer's click); never parse a free-text "yes" (`dad-accept-is-intent-via-package`,
  ADR-0108 d.3 / ADR-0004).
- **Import the worker by package name** — `@storytree/drive/build-worker`, NEVER `apps/studio/server`
  (`dad-accept-is-intent-via-package`, ADR-0100).
- **Intent, never a verdict** — the accept dispatch hands the worker a unit id; it holds no signing key, no
  verdict writer (ADR-0091). The spine signs; CI lands. The write is direct for the MVP (broker deferred,
  ADR-0133 d.2); scope no broker.
- **Name every test for its contract (coverage convention)** — each contract gets one substantive test
  whose name begins with the contract id, so the ADR-0122/0126 classifier reads 4/4.
- **Stay in `apps/desktop/src`** — the write scope is the desktop accept slice (ADR-0087). The production
  wiring into `electron/backend-entry.ts` (the real shared `BuildContext` + the chain) + the renderer accept
  button's POST target are the desktop / chat-drive-bridge operator-attested glue (legs 5–6), a separate
  increment.
