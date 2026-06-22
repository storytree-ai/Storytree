---
id: "build-intent-api"
tier: capability
story: studio-build
title: "Build intent + status API"
outcome: "An operator dispatches a build intent and reads its live status over the studio API."
status: "proposed"
proof_mode: "integration-test"
depends_on: [build-run-registry]
---

# Build intent + status API

**Outcome —** An operator dispatches a build intent and reads its live status over the studio API.

**Depends on —** [`build-run-registry`](build-run-registry.md) — the API is the thin HTTP transport
over the registry; it owns no run state of its own.

> **Proof status (honest) — NOT BUILT.** This precedes the code. The endpoints, their handlers, and
> the integration test below are specs awaiting implementation. They will be added to the studio's
> SINGLE `/api/*` route table (`apiRouter.ts`'s `handleApiRequest` + `ApiContext`), the same table
> `/api/tree` and `/api/activity` already live on, so they are defined once for both fronts (the
> Vite dev plugin and the hosted `serve.ts`).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the request→response contract over a
REAL `node:http` server with the registry behind it — POST an intent, get a `runId`, GET the status
back, see the refusals — exactly the `apiRouter.ts` integration-test style
(`activityApi.integration.test.ts` / `uatAttestApi.integration.test.ts`). Individual validations
(unknown id → 404, concurrent → 409, bad method → 405) are contract-testable, but "an operator
dispatches a build and reads its live status" is the across-the-wire walk.

THE INTENT IS A SAFE WRITE, NOT A VERDICT (ADR-0090 d.2 / ADR-0091): `POST /api/build` writes an
INTENT — it asks the worker to run the gate; it never accepts or persists a verdict. The verdict is
produced by the gate inside the worker (the drive-machinery story) and persisted by `nodeBuild`'s
own `--store pg` path. There is NO endpoint that takes a verdict as input — that is the forge
pathway ADR-0091 forbids by construction. Do not add one.

WHERE IT WIRES: add the routes to `handleApiRequest`'s dispatch and the worker (the registry + the
build-path spawn) to `ApiContext` — the same seam `dbWake` / `invites` / `policy` use. The dev
plugin (`devApi.ts`) and the hosted server (`serve.ts`) both construct `ApiContext`, so the worker
is wired in TWO places but the route table stays single. Phase 1 is LOCAL: the dev-plugin posture
(open localhost) is the target; the hosted posture is Phase 3 and its auth/policy gate is NOT
designed here (the `policy.gate` already runs before dispatch — a later phase scopes the build verb,
this phase does not).

ENDPOINT SHAPES (owner's call: coarse + polled, no websocket):
  - `POST /api/build` body `{ unitId }` → `202 { runId }` on accept; `404` unknown/unbuildable id;
    `409` a build already running; `400` missing/!string unitId. The worker is started
    fire-and-forget AFTER the 202 (the client polls for progress — the POST does not block on the
    build).
  - `GET /api/build?runId=<id>` → `200 { runId, unitId, status, transcript, envelope? }` for a known
    run; `404` unknown runId. `status` ∈ building | passed | failed. `envelope` present only when
    terminal. (A `GET /api/builds` list is optional Phase-1 sugar; the single-run GET is the
    load-bearing read.)

VALIDATE THE UNIT ID AGAINST REAL DISCOVERY: an accepted `unitId` must be a real buildable node —
reuse drive-machinery's `buildableNodeIds(storiesDir)` / `findNodeSpecFile` (the same discovery
`storytree node build` uses), so a typo'd or non-buildable id is a clean 404, never a worker that
spawns against nothing. Do NOT reimplement discovery in the studio.

NEVER 500 ON A KNOWN OUTCOME: like the rest of the route table, every known outcome is a typed HTTP
answer (a refused concurrent build is 409 via the registry's typed result, an unknown id is 404). A
500 means a genuine bug, not a refused request — the central catch in `handleApiRequest` already
maps `HttpError` → its status.

## Integration test

**Goal —** Prove that an operator can dispatch a build intent and read its live status over the
real `/api/*` route table, with the registry behind it and the build-path spawn injected.

The integration test exercises this capability against its **real in-story collaborators** — the
real `handleApiRequest` dispatch (or the build handlers directly over a real `node:http` server, the
`activityApi.integration.test.ts` pattern), the real `build-run-registry`, and the real node
discovery — with the live SDK leaf replaced by an injected scripted `PhaseAuthor` (ADR-0010 §5, no
billed spend). No stubs within the organism.

The integration test would, over a real `node:http` server:

1. `POST /api/build { unitId: '<real buildable node>' }` → `202` with a `runId`; assert a run now
   exists in the registry for that id, non-terminal.
2. `GET /api/build?runId=<id>` immediately → `200` with `status: 'building'` and a transcript that
   is growing (possibly empty then non-empty as the scripted build advances).
3. `POST /api/build { unitId }` again while the first run is live → `409` "a build is already
   running"; the first run is untouched.
4. `POST /api/build { unitId: 'no-such-node' }` → `404` (validated against real discovery); no run
   created.
5. `POST /api/build {}` (missing unitId) → `400`; `GET /api/build?runId=nope` → `404` unknown run.
6. Let the scripted build finish; `GET /api/build?runId=<id>` → `200` with `status: 'passed'` and
   the terminal envelope (verdict line, signer, phase trail) present — the across-the-wire proof
   that a dispatched intent runs to a readable terminal verdict.
7. `POST /api/build` and `GET /api/build` with the wrong HTTP method → `405` (the method guard,
   parity with the rest of the route table).

## Contracts (6)

Each **one isolated automated test** (vitest, the studio suite), collaborators stubbed (a fake
registry / a fake discovery). None exist yet; each is the assertion a contract test WILL prove
(re-cite at real `file:line` when built).

1. **`bia-post-build-accepts-and-returns-runid`** — a valid intent is accepted with a runId
   - **asserts —** `POST /api/build` with a valid `{ unitId }` for a buildable node returns `202`
     `{ runId }`, calls the registry's `createRun(unitId)` exactly once, and starts the worker
     (fire-and-forget) against the returned run.
   - **covers —** `apps/studio/server/apiRouter.ts` (handleBuild POST) *(provisional)*
2. **`bia-post-build-unknown-id-404`** — an unknown / unbuildable id is refused
   - **asserts —** `POST /api/build { unitId: 'no-such-node' }` returns `404` (validated against the
     injected discovery), and `createRun` is NOT called.
   - **covers —** `apps/studio/server/apiRouter.ts` (handleBuild id validation)
3. **`bia-post-build-concurrent-409`** — a concurrent build is a 409, not a 500
   - **asserts —** when the registry's `createRun` returns its single-build refusal, the handler maps
     it to `409` `{ error: 'a build is already running' }` (an `HttpError`, not an uncaught throw).
   - **covers —** `apps/studio/server/apiRouter.ts` (handleBuild concurrency mapping)
4. **`bia-post-build-bad-body-400`** — a missing / non-string unitId is a 400
   - **asserts —** `POST /api/build` with `{}` or `{ unitId: 42 }` returns `400` "unitId is
     required", no run created.
   - **covers —** `apps/studio/server/apiRouter.ts` (handleBuild body validation)
5. **`bia-get-build-returns-run-status`** — the status read returns the run's transcript + status
   - **asserts —** `GET /api/build?runId=<known>` returns `200` with `{ runId, unitId, status,
     transcript }` from the registry, and the terminal `envelope` only when the run is terminal;
     `GET` for an unknown `runId` returns `404`.
   - **covers —** `apps/studio/server/apiRouter.ts` (handleBuild GET)
6. **`bia-build-method-guard-405`** — only POST dispatches and only GET reads
   - **asserts —** a non-POST to the dispatch and a non-GET to the status read each throw
     `HttpError(405)` (parity with `handleActivity` / `handlePresence`), so the build verb is
     method-scoped (the seam a later-phase policy gate will lean on).
   - **covers —** `apps/studio/server/apiRouter.ts` (the build method guards)
