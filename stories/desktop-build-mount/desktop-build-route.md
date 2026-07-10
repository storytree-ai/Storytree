---
id: "desktop-build-route"
tier: capability
story: desktop-build-mount
title: "The desktop build route — POST /api/build (202 + runId) + GET /api/build?runId mounted on the desktop backend over the relocated worker"
outcome: "The desktop local backend mounts `POST /api/build` (202 + runId, fire-and-forget) + `GET /api/build?runId`, wired with a `BuildContext` over the relocated worker (lazy `@storytree/drive/build` runner + `@storytree/orchestrator` discovery for `isBuildable`); a scripted runner proves the route without SDK spend."
status: proposed
proof_mode: integration-test
depends_on: [worker-relocation]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors a NEW
# node:test (build-route.test.ts) in apps/desktop/src/backend that imports a NOT-YET-EXISTING factory
# (createBuildRouteMount) from a NEW source file (build-route.ts) — RED at HEAD because the module does not
# exist (module-not-found, the right-kind red) — then writes that one new source file (green). The new
# module is the desktop build-route MOUNT — a (req, res, pathname) => Promise<boolean> chain-dispatcher that
# handles POST /api/build (validate buildable → createRun → void runBuildJob → 202 {runId}) + GET
# /api/build?runId (run status + transcript), mirroring apps/studio/server/apiRouter.ts's handleBuild but as
# a desktop-resident factory over an INJECTED BuildContext (from @storytree/drive/build-worker, capability
# 1). It mirrors chat-sse-mount.ts (local HTTP helpers reproduced, not imported from studio; an injectable
# dep; a fall-through chain handler). The test drives it on a REAL node:http server with a scripted runner +
# an injected isBuildable (no SDK spend, ADR-0010 §5). RUNNER: apps/desktop is node:test (node --import tsx
# --test "src/**/*.test.ts") — the SAME runner chat-sse-mount.test.ts / boot-read-routes.test.ts use; the
# new test is a node:test file. A SINGLE LITERAL test file (no `*`), so the default node:test proof on the
# one test file is legal — no proofCommand. `install: true` + a typecheck wall because the new module imports
# the relocated worker + BuildContext from @storytree/drive/build-worker across the package boundary (the
# proof runs in a fresh worktree — tsx + tsc need the lockfile-only install, ADR-0031 §2). The scope stays
# within apps/desktop/src (ADR-0087: one concrete write scope) — the production wiring of this mount into
# electron/backend-entry.ts is the desktop story's operator-attested sidecar glue, a separate increment.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/build-route.test.ts"
    sourceFile: "apps/desktop/src/backend/build-route.ts"
    scope:
      testGlobs: ["apps/desktop/src/backend/build-route.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/build-route.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# The desktop build route — POST /api/build + GET /api/build?runId on the desktop backend

**Outcome —** The desktop local backend mounts `POST /api/build` (202 + runId, fire-and-forget) + `GET
/api/build?runId`, wired with a `BuildContext` over the relocated worker (lazy `@storytree/drive/build`
runner + `@storytree/orchestrator` discovery for `isBuildable`); a scripted runner proves the route without
SDK spend.

**Depends on —** [`worker-relocation`](worker-relocation.md) — the route mounts a `BuildContext` over the
relocated worker; it imports `BuildRegistry` / `runBuildJob` / the `BuildContext` type from
`@storytree/drive/build-worker`, the NEW home capability 1 creates. It cannot be mounted until the worker is
reachable from a package (the desktop may not import `apps/studio/server`, ADR-0100).

> **Proof status (honest) — `proposed`, NET-NEW desktop route over the RELOCATED worker.** This is the
> second link of ADR-0133 d.3: the worker now lives in `@storytree/drive/build-worker` (capability 1), and
> the desktop sidecar already mounts the boot-read routes + the chat SSE mount — but build is DISABLED on
> the desktop (`backend-entry.ts`'s `[+ build, disabled here]`). This capability adds the desktop build
> ROUTE: a `(req, res, pathname) => Promise<boolean>` chain-dispatcher that handles `POST /api/build`
> (validate buildable → mint a run → fire `runBuildJob` → 202 `{runId}`) + `GET /api/build?runId` (status +
> coarse transcript), wired over an INJECTED `BuildContext` from the relocated worker. It MIRRORS
> `handleBuild` (`apps/studio/server/apiRouter.ts`) but as a desktop-resident factory — the SAME typed-answer
> contract, on the desktop surface, importing the worker by package name (never `apps/studio/server`).

## Guidance

**THIS BUILD — the current `--real` increment (net-new): the `createBuildRouteMount` factory.** Today the
desktop sidecar (`apps/desktop/electron/backend-entry.ts`) chains `createBootReadRoutes` → `createChatSseMount`
→ `createLocalBackend`, and build is disabled. `handleBuild` exists only as a studio-server HTTP handler.
This increment authors a desktop-resident build-route factory — `createBuildRouteMount` — that the sidecar
can chain beside the chat mount, wired over the relocated worker's `BuildContext`.

- **NET-NEW, missing-symbol red.** Author `apps/desktop/src/backend/build-route.test.ts` (a `node:test`
  file — `import { test } from "node:test"; import assert from "node:assert/strict"`, the desktop
  convention) importing `{ createBuildRouteMount }` from `"./build-route.js"` — which does NOT exist at HEAD,
  so the test fails module-not-found (the net-new red). Then write the one new source file (green).
- **MIRROR `chat-sse-mount.ts`, the established desktop-mount pattern.** Like `createChatSseMount`,
  `createBuildRouteMount`: imports the worker by PACKAGE name (`@storytree/drive/build-worker` — never
  `apps/studio/server`, the ADR-0100 wall); reproduces the local HTTP helpers (`readBody`, `readJsonBody`)
  rather than importing them from studio; takes an INJECTED dep (here a `BuildContext { registry, runner,
  isBuildable }`, as `createChatSseMount` takes `{ queryFn? }`); and returns a `(req, res, pathname) =>
  Promise<boolean>` handler that claims ONLY its routes (`POST /api/build`, `GET /api/build`) and returns
  `false` for everything else (the chain fall-through — NOT a catch-all). Get this wrong — a catch-all that
  swallows other routes, or importing `apps/studio/server` — and the chain breaks / the wall is crossed.
- **COMPOSE the relocated worker exactly as `handleBuild` does.** `POST /api/build {unitId}`: validate
  `await build.isBuildable(unitId)` (404 on a non-buildable / unknown id — never spawn the worker against
  nothing); `build.registry.createRun(unitId)` (409 on the single-build guard); `void runBuildJob(registry,
  runId, unitId, runner)` fire-and-forget; respond 202 `{ runId }`. `GET /api/build?runId`: `registry.getRun`
  → 200 `{ runId, unitId, status, transcript, envelope?, reason? }` (404 unknown run). Wrong method → 405.
  Every known outcome is a typed HTTP answer, never a 500 — the SAME contract `handleBuild` holds.
- **A SAFE write — INTENT, never a verdict (ADR-0091).** The route hands the worker a UNIT ID; it never
  accepts, signs, or persists a verdict. There is deliberately NO endpoint that takes a verdict as input
  (the forge pathway ADR-0091 forbids). The spine inside `runBuildJob` observes RED→GREEN and signs; CI
  re-proves green before the trunk (ADR-0022).
- **The PRODUCTION wiring is a separate increment.** This capability proves the route FACTORY over an
  injected `BuildContext` (a scripted runner, an injected `isBuildable`). Constructing the REAL
  `BuildContext` in `backend-entry.ts` (the lazy `@storytree/drive/build` `nodeBuild`/`storyBuild` runner via
  `routedBuildRunner`, the `@storytree/orchestrator` discovery for `isBuildable` — the `devApi.ts` recipe)
  and chaining the new dispatcher is the desktop story's operator-attested sidecar glue (the SAME posture as
  the chat mount's `backend-entry.ts` wiring). The CI-proven core is the factory; the sidecar wiring is
  attested.
- **The RED the spine observes:** module-not-found on `createBuildRouteMount`. **The GREEN:** the new factory
  composes the injected `BuildContext`; the test (real relocated `BuildRegistry` + a scripted runner + an
  injected `isBuildable`, on a real `node:http` server) asserts a buildable POST returns 202 `{runId}` and
  the run reaches a terminal state with the scripted progress on its transcript, an un-buildable id is a 404,
  a wrong method is 405, and the handler falls through for an unrelated path.

WHY THIS IS A CAPABILITY (not a contract): its honest proof spans the ROUTE AS A WHOLE — the POST intake
(validate → mint → fire-and-forget → 202), the GET poll (status + transcript), the typed refusals
(404/405), and the chain fall-through — exercised over a REAL `node:http` server against the REAL relocated
`BuildRegistry` + `runBuildJob` with the build runner injected as a scripted double. That crosses the HTTP
intake, the worker wiring, and the chain contract, so it is an integration test against the real relocated
worker over real HTTP, not a single isolated assertion.

REUSES THE RELOCATED WORKER (ADR-0133 d.3 / ADR-0090): the route is a SECOND surface's mount of the SAME
worker the studio's `handleBuild` mounts — one worker, two surfaces. It does NOT re-implement the build
path or fork a second boundary. The studio dev front mounts `/api/build`; this mounts the SAME contract on
the desktop, where chat already ships.

PROOF INTEGRITY (ADR-0091 / ADR-0117 / ADR-0180): the route hands the worker a build intent; the spine
inside the worker signs from real RED→GREEN; CI re-proves green before the trunk (ADR-0022). The route
holds no signing key and no verdict-input path. ADR-0180 ended ADR-0133 d.2's temporary direct-write
deferral for desktop proof writes: persistence goes through the authenticated broker as each caller lands,
while this capability continues to scope only the build-intent route.

OFFLINE-TESTABLE BY INJECTION: the test injects a SCRIPTED `BuildRunner` (emits coarse lines + a terminal
envelope, no SDK) and an injected `isBuildable`, over the REAL relocated `BuildRegistry`, on a REAL
`node:http` server — so the route + the worker wiring are proven WITHOUT a live SDK-billed build on every
gate pass (ADR-0010 §5). The live driven build is chat-drive-bridge's operator-attested leg.

## Integration test

**Goal —** Prove that the desktop build-route factory mounts `POST /api/build` (202 + runId,
fire-and-forget) + `GET /api/build?runId` over the relocated worker, with typed refusals (404/405) and a
chain fall-through, importing the worker by package name (never `apps/studio/server`).

The integration test exercises this capability against its **real in-story collaborators** — the real
relocated `BuildRegistry` and the real relocated `runBuildJob` (`@storytree/drive/build-worker`) — over a
REAL `node:http` server, with a SCRIPTED `BuildRunner` and an injected `isBuildable` (no SDK spend, ADR-0010
§5), exactly the `chat-sse-mount.test.ts` / `boot-read-routes.test.ts` posture. No stubs of the
registry/worker machinery.

The integration test would:

1. Mount `createBuildRouteMount({ registry: <real relocated BuildRegistry>, runner: <scripted>, isBuildable:
   <injected true> })` on a real `node:http` server (the chain handler), then `POST /api/build { unitId }`
   for a buildable id.
2. Assert it returns 202 `{ runId }`, and once the fire-and-forget job drains, `GET /api/build?runId`
   returns 200 with `status: 'passed'` and the scripted runner's coarse progress on `transcript` (+ the
   terminal `envelope`).
3. Assert an UN-buildable / unknown id (`isBuildable` false) → `POST /api/build` returns 404 and the worker
   (`runBuildJob`) was NEVER invoked — no run minted against nothing (the `handleBuild` 404 contract).
4. Assert a second `POST /api/build` while a run is live → 409 (the registry single-build guard surfaced),
   the running run untouched (the `handleBuild` 409 contract).
5. Assert a wrong method (e.g. `DELETE /api/build`) → 405, and an unrelated path (e.g. `GET /api/health`) →
   the handler returns `false` (falls through to the next dispatcher — NOT a catch-all), proving it chains
   cleanly beside the boot-read + chat mounts.
6. Assert (STRUCTURALLY) that `build-route.ts` imports the worker from `@storytree/drive/build-worker` by
   package name and imports NOTHING from `apps/studio/server` (the ADR-0100 wall) — read the source, scan
   its import specifiers.

## Contracts (4)

The test-proven leaf behaviours — each **one named, substantive test** in the desktop suite (`node:test`),
exercised against the real relocated `BuildRegistry` + `runBuildJob` over a real `node:http` server with a
scripted `BuildRunner`.

> **COVERAGE CONVENTION — REQUIRED, or the verdict reads 0/4 (ADR-0122 / ADR-0126).** A contract is
> "covered" only when some test's NAME carries the contract id as a whole token (`test("<contract-id>: …")`)
> AND that test asserts something SUBSTANTIVE. Author **one named, substantive test per contract below**,
> its name beginning with the contract id, and ASSERT ALL FOUR. Target: **4/4 covered.**

1. **`dbr-post-dispatches-buildable-id`** — a buildable POST mints + runs, 202 + runId
   - **asserts —** `POST /api/build {unitId}` for a buildable id validates `isBuildable`, mints a run on the
     real relocated registry, fires `runBuildJob` over the injected runner, returns 202 `{ runId }`, and
     once drained `GET /api/build?runId` reports `status: 'passed'` with the scripted progress on
     `transcript`.
   - **covers —** `apps/desktop/src/backend/build-route.ts` (the POST intake + the GET poll) *(provisional path)*
2. **`dbr-refuses-unbuildable-id`** — an un-buildable id is a 404, worker never invoked
   - **asserts —** an unknown / non-buildable id (`isBuildable` false) → `POST /api/build` returns 404 and
     `runBuildJob` is NEVER invoked — no run spawned against nothing (the `handleBuild` 404 contract).
   - **covers —** `apps/desktop/src/backend/build-route.ts` (the buildability guard)
3. **`dbr-typed-answers-and-fall-through`** — 409 single-build, 405 wrong method, false fall-through
   - **asserts —** a second concurrent POST → 409 (single-build guard, running run untouched); a wrong
     method → 405; an unrelated path → the handler returns `false` (chain fall-through, not a catch-all) —
     the full typed-answer + chain contract, mirroring `handleBuild` + the chat-mount fall-through.
   - **covers —** `apps/desktop/src/backend/build-route.ts` (the method/path routing + refusal mapping)
4. **`dbr-imports-worker-by-package-not-app`** — the ADR-0100 wall, intent-not-verdict
   - **asserts —** `build-route.ts` imports the worker from `@storytree/drive/build-worker` (package name)
     and imports NOTHING from `apps/studio/server` (structural source read, ADR-0100); and the route's only
     collaborators are the injected `BuildContext` (registry + runner + isBuildable) — it holds no signing
     key, no `events.verdict` writer, no DB connection (a build INTENT only, ADR-0091).
   - **covers —** `apps/desktop/src/backend/build-route.ts` (the import surface + the construction)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): the build route is authored as a new
factory in `apps/desktop/src/backend`, test-first, beside `chat-sse-mount.ts` it mirrors.

- **The test —** `apps/desktop/src/backend/build-route.test.ts` (`node:test` + `node:assert/strict`, the
  SAME runner the existing `apps/desktop/src/backend/*.test.ts` use — e.g. `chat-sse-mount.test.ts`,
  `boot-read-routes.test.ts`). It imports `{ createBuildRouteMount }` from `"./build-route.js"`, builds a
  REAL relocated `BuildRegistry`, an injected `isBuildable`, and a scripted `BuildRunner` (emits coarse
  lines + a terminal envelope; no SDK), and drives it over a REAL `node:http` server (the
  `chat-sse-mount.test.ts` createServer/AddressInfo pattern). It awaits the fire-and-forget job's drain
  before asserting the terminal run state.
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `build-route.ts` does
  not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red). It asserts the
  202+runId dispatch, the 404/409/405 typed answers, the chain fall-through, and the no-`apps/studio/server`
  import wall.
- **The GREEN —** `apps/desktop/src/backend/build-route.ts`: `createBuildRouteMount(build: BuildContext)`
  returns the chain-dispatcher that handles `POST /api/build` (validate → createRun → void runBuildJob → 202)
  + `GET /api/build?runId` (status + transcript), importing the worker from `@storytree/drive/build-worker`.
  It composes the relocated worker; it adds no build path, no signer, no DB. The import resolves, the
  assertions hold, the desktop suite + typecheck are green.

Rules:

- **Mirror the chat-mount pattern** — local HTTP helpers reproduced (not imported from studio), an
  injectable dep, a `(req, res, pathname) => Promise<boolean>` chain handler that falls through for unowned
  paths (`dbr-typed-answers-and-fall-through`).
- **Import the worker by package name** — `@storytree/drive/build-worker`, NEVER `apps/studio/server`
  (`dbr-imports-worker-by-package-not-app`, ADR-0100). This is the property capability 1's relocation makes
  possible.
- **Typed answers, never throw on a known outcome** — 404 un-buildable, 409 single-build, 405 wrong method,
  202 dispatch (`dbr-refuses-unbuildable-id`, `dbr-post-dispatches-buildable-id`), the SAME contract
  `handleBuild` holds.
- **Intent, never a verdict** — the route hands the worker a unit id; it holds no signing key, no verdict
  writer (`dbr-imports-worker-by-package-not-app`, ADR-0091). The spine signs; CI lands.
- **Name every test for its contract (coverage convention)** — each contract gets one substantive test
  whose name begins with the contract id, so the ADR-0122/0126 classifier reads 4/4.
- **Stay in `apps/desktop/src`** — the write scope is the desktop route factory (ADR-0087). The production
  wiring into `electron/backend-entry.ts` (the real `BuildContext` + the chain) is the desktop story's
  operator-attested sidecar glue, a separate increment; the accept→dispatch wiring is capability 3.
