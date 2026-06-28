---
id: "desktop-build-dispatch-mount"
tier: capability
story: chat-drive-bridge
title: "The desktop build-dispatch mount — the local backend serves a registry-backed /api/build (POST dispatch + GET poll) so the chat accept-to-land click drives a real build from within the app"
outcome: "The desktop local backend serves a registry-backed `/api/build` — POST dispatches a human-accepted unit id through the chat-build-dispatch core (`{ ok, runId }`) and `GET ?runId` returns `{ status, transcript }` — over the routed build runner wired in `backend-entry.ts`, so the ChatPanel accept-to-land affordance actually drives a build to a signed verdict + a non-draft PR from inside the app, not a 404."
status: proposed
proof_mode: integration-test
depends_on: [chat-build-dispatch]
# WHY A 5TH CAP UNDER chat-drive-bridge (not a desktop-story cap): this is the bridge's CONSUMING-SURFACE
# GLUE — the mount that lets the SAME story's accept-to-land affordance (cap 4) and dispatch core (cap 3)
# meet on one surface. The story already OWNS "the chat-build-dispatch glue physically hosted in
# apps/desktop (the mount) + apps/studio/server (the dispatch wiring)" (story.md Cross-story boundary §
# desktop; Open modeling call 3). chat-build-dispatch's own Guidance defers exactly this: "the desktop
# MOUNT of it (the route + the SSE/poll glue on the local backend) is the consuming surface's thin glue
# (apps/desktop), over this core" and "The HTTP/SSE mount on the desktop local backend ... is the
# consuming surface's glue (apps/desktop), over this core" — i.e. a SEPARATE increment, named here.
# Placing it in the `desktop` story would split ONE journey (proposal → accept → drive → land, streamed
# back) across two stories and scatter its proof (journey-principle); the desktop story owns the SURFACE
# the mount hangs on (the local backend factory + the sidecar), which this cap CONSUMES via the existing
# `desktop` cross-story edge — it does not absorb it. This cap is the bridge's last mechanical leg before
# the story is end-to-end on the desktop.
#
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
# THE BOUNDARY CALL THAT SHAPES THIS CAP (ADR-0100, decided-and-surfaced — see "Open modeling calls"):
# apps/desktop/src MAY NOT import apps/studio/server (a forbidden surface→surface coupling, asserted by
# chat-sse-mount.test.ts:552's guard test and restated in every desktop backend module). So the desktop
# CANNOT literally import `dispatchAcceptedBuild` / `handleBuild` / `BuildRegistry` / `runBuildJob` from
# apps/studio/server. The mount therefore RE-COMPOSES the same run-lifecycle algorithm LOCALLY in
# apps/desktop/src/backend/ — exactly as boot-read-routes.ts, tree-verdicts.ts, chat-sse-mount.ts, and
# forest-readiness.ts already re-compose studio algorithms rather than importing them. The chat-build-
# dispatch CORE (dispatchAcceptedBuild) stays the studio's, and is what the STUDIO dev front would mount;
# the desktop mounts its MIRROR, held to the SAME api/HTTP wire contract the ChatPanel (cap 4) already
# calls (POST /api/build {unitId} → {runId}; GET /api/build?runId → {status, transcript}). This is the
# studio-build precedent (own glue physically in a surface package while declaring the edge). It does NOT
# re-decide the honesty walls (intent-not-verdict; the spine signs; CI re-proves; the human click is the
# only trigger) — it inherits them verbatim.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────
#
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (editsExisting: true): the target
# files exist at HEAD — local-backend.ts owns createLocalBackend + the LocalBackendBuild seam + the
# POST-only /api/build branch that returns 202 and discards the sink (local-backend.ts:218-231); the
# desktop has NO GET poll and backend-entry.ts:234 wires createLocalBackend with NO `build` seam (so
# /api/build 404s "build is not enabled", local-backend.ts:219). The leaf authors a NEW failing test
# (build-dispatch-mount.test.ts) that drives the factory over the withServer node:http harness with an
# injected REGISTRY-BACKED build seam and asserts: POST /api/build {unitId} → {runId} for a buildable id,
# then GET /api/build?runId → {status, transcript} reflecting the run — RED at HEAD because the GET branch
# does not exist (405/404 on GET) and the POST returns a 202 envelope that drops the run instead of
# tracking it in a registry — then EDITS local-backend.ts to serve the registry-backed POST+GET over a
# re-composed run lifecycle (GREEN). RUNNER: the desktop suite is node:test (`node --import tsx --test
# "src/**/*.test.ts"`) — NOT vitest (the inverse vitest-runner-mismatch trap: a vitest file here is not
# run; every existing apps/desktop/src/**/*.test.ts is `import { test } from "node:test"`). The new test
# MUST be a node:test file, exactly like local-backend.test.ts / chat-sse-mount.test.ts.
# `install: true` + a typecheck wall because the factory imports across the desktop backend tree and the
# proof runs in a fresh worktree (tsx + tsc need the lockfile-only install, ADR-0031 §2); the desktop
# typecheck spans BOTH tsconfig.json (src/) and tsconfig.electron.json (electron/) — the latter type-
# checks backend-entry.ts where the production wiring lands. The edit touches a BROAD source scope
# (local-backend.ts is the one CI-proven source file; backend-entry.ts is the operator-attested sidecar
# wiring, NOT in the CI source scope — see Guidance), so a SUITE proofCommand is required: the default
# node:test on the single test file cannot observe a regression across the factory. Scope stays within
# apps/desktop/src (ADR-0087: one concrete write scope); the backend-entry.ts production mount is the
# consuming surface's attested glue, outside the CI proof (the desktop story's posture for the sidecar).
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/build-dispatch-mount.test.ts"
    sourceFile: "apps/desktop/src/backend/local-backend.ts"
    scope:
      testGlobs: ["apps/desktop/src/backend/build-dispatch-mount.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/local-backend.ts"]
    editsExisting: true
    install: true
    # The edit re-composes the run-lifecycle on the factory in local-backend.ts (the POST+GET branches +
    # a re-composed registry/runner fold). The default `node --test` on the single test file CAN observe
    # the red→green here (one literal test file, the factory's behaviour is exercised end-to-end over the
    # withServer harness), but the factory's source change is broader than one symbol, so run the desktop
    # node:test suite to catch any regression in the sibling routes the factory also serves.
    proofCommand:
      file: pnpm
      args: ["--filter", "desktop", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# The desktop build-dispatch mount — the local backend serves a registry-backed /api/build so the chat accept-to-land click drives a real build from within the app

**Outcome —** The desktop local backend serves a registry-backed `/api/build` — POST dispatches a
human-accepted unit id through the chat-build-dispatch core (`{ ok, runId }`) and `GET ?runId` returns
`{ status, transcript }` — over the routed build runner wired in `backend-entry.ts`, so the ChatPanel
accept-to-land affordance actually drives a build to a signed verdict + a non-draft PR from inside the
app, not a 404.

**Depends on —** [`chat-build-dispatch`](chat-build-dispatch.md) — this is the desktop MOUNT of that
capability's dispatch core. `chat-build-dispatch` proved `dispatchAcceptedBuild(unitId, BuildContext)`
in `apps/studio/server` (validate buildable → `createRun` → `runBuildJob` → `{ ok, runId }`) and
explicitly deferred its mount: "the desktop MOUNT of it (the route + the SSE/poll glue on the local
backend) is the consuming surface's thin glue (`apps/desktop`), over this core." This cap is that
deferred mount.

> **Proof status (honest) — `proposed`, EDIT-EXISTING, the last mechanical leg of the bridge.** This is
> the connective tissue that makes **ADR-0108 Phase 4** land on the desktop: caps 1–4 are built + signed
> (the agent declares a `proposedUnitId`, it threads to the client, the dispatch core routes an accepted
> id to the worker, the ChatPanel renders a Build button that POSTs the accepted id and polls progress),
> but the desktop where chat ships has its build seam DISABLED — `backend-entry.ts:234` wires
> `createLocalBackend` with no `build`, so `POST /api/build` 404s "build is not enabled" and there is no
> `GET /api/build?runId` poll route at all. The ChatPanel's accept-to-land click (cap 4) POSTs
> `/api/build` then polls `GET /api/build?runId` (`apps/studio/src/api.ts:194-197`) — against a route
> that does not exist on the desktop. This cap serves that route: a registry-backed `/api/build`
> (POST dispatch + GET poll) on the local backend factory, wired over the routed build runner in
> `backend-entry.ts`. After it, the ChatPanel accept-to-land affordance drives a real `story build
> --real` to a spine-signed verdict + a non-draft PR from inside the native shell. It is a SAFE write —
> a build INTENT, never a verdict-in (ADR-0091); the walls are inherited from cap 3, not re-decided.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the MOUNT AS A WHOLE — a behavioural
change to the local backend factory that serves BOTH `/api/build` verbs over a re-composed run lifecycle:
POST validates + dispatches an accepted unit id and returns `{ runId }`, and `GET ?runId` reads that run's
`{ status, transcript }` back so the client can poll progress. It spans the POST dispatch branch, the new
GET poll branch, and the run-lifecycle fold that ties them (the POST's run is the GET's run), exercised
end-to-end over a real `node:http` server with an injected seam — so it is an integration test of the
factory's `/api/build` behaviour, not a single isolated assertion.

THE BOUNDARY THAT SHAPES THE WHOLE BUILD (ADR-0100 — read this first): `apps/desktop/src` MAY NOT import
`apps/studio/server`. This is a hard, tested invariant — `chat-sse-mount.test.ts:552` asserts the desktop
"must not import apps/studio/server (forbidden surface→surface coupling)", and every desktop backend
module (`boot-read-routes.ts`, `chat-sse-mount.ts`, `tree-verdicts.ts`, `forest-readiness.ts`,
`local-backend.ts`) RE-COMPOSES the studio algorithm rather than importing it. So this mount CANNOT
literally `import { dispatchAcceptedBuild }` (or `handleBuild`, `BuildRegistry`, `runBuildJob`) from
`apps/studio/server`. **The brief's framing "mount `dispatchAcceptedBuild`" is the INTENT; the literal
import is forbidden.** The honest resolution: re-compose the SAME run-lifecycle algorithm locally in
`apps/desktop/src/backend/`, held to the SAME wire contract the ChatPanel already calls. Get this wrong —
reaching across the surface boundary to import the studio's dispatch/registry — and you have crossed
ADR-0100 (the desktop test guard will catch it, and it would couple the desktop to the studio server's
module graph the whole desktop boundary exists to prevent).

THE WIRE CONTRACT IS ALREADY FIXED BY THE CLIENT (the `api` seam the ChatPanel calls): the studio `api`
client (`apps/studio/src/api.ts`, which the desktop renders compiled — it does not get a desktop-specific
client) defines the exact shapes — `build(unitId) → POST /api/build {unitId} → { runId }`,
`buildStatus(runId) → GET /api/build?runId → { status, transcript, ... }`. The desktop mount MUST satisfy
these verbatim so the ChatPanel's accept-to-land click + progress poll (cap 4) work unchanged. The
desktop's existing POST `/api/build` already returns `{ runId }` (local-backend.ts:231) — but it discards
the run and has no GET; this cap makes the run TRACKABLE (a registry) and adds the GET.

REUSE THE RUN-LIFECYCLE ALGORITHM, RE-COMPOSED LOCALLY (the desktop precedent): the studio's run
lifecycle is `BuildRegistry` (mint a `building` run, append coarse lines, terminalise passed/failed, the
single-build guard) + `runBuildJob` (fire-and-forget: feed the runner's lines into the run, terminalise
with the envelope) + `dispatchAcceptedBuild` (validate → createRun → runBuildJob → `{ ok, runId }`). The
desktop re-composes the SAME behaviour over its existing injected build seam — NOT a new build path, NOT
a second proof path (that would be the forge risk ADR-0091 forbids). The registry is a small in-memory
state organ (the desktop already re-composes algorithms this way); the runner is the existing
`LocalBackendBuild.runner` the desktop already injects, now driven through the run rather than discarded.
The PLACEMENT of the re-composed registry (a new local module `build-run-mount.ts`, or inlined on the
factory) is the leaf's call; the contracts pin the factory's `/api/build` BEHAVIOUR over the seam, not
the internal shape.

A SAFE WRITE — INTENT, NEVER A VERDICT (ADR-0091, inherited from cap 3, NOT re-decided): the mount hands
the worker a UNIT ID and reads back COARSE progress; it never accepts, signs, or persists a verdict. The
spine inside the dispatched `story build --real` observes RED→GREEN from real exit codes and SIGNS; CI
re-proves green before the trunk (ADR-0022). The mount holds no signing key and no DB connection (the
desktop's only write path is the BROKER, ADR-0117 — and that is the forest-write route, a separate seam).
The dispatched `story build --real` is what PERSISTS the verdict + opens the NON-DRAFT PR CI auto-merges
(ADR-0090 / ADR-0022) — but that is the WORKER's doing, off the human's click, never a forge pathway
through the mount.

THE ACCEPT IS THE HUMAN'S CLICK, NOT THE AGENT'S (ADR-0108 d.3, inherited): the mount dispatches an
EXPLICITLY-accepted unit id — the accept arrives as the POST body, sent by the ChatPanel's Build click
(cap 4). The mount never parses a free-text "yes" and never accepts on the agent's behalf; it is the
backend half of the human's gate. The agent declared the id (cap 1); the human accepts it (cap 4); this
cap routes the accepted id to the worker on the desktop surface.

TYPED REFUSALS, NEVER A 500-EQUIVALENT (mirrors `handleBuild` / the desktop's existing branch): an
un-buildable / unknown unit id → a clean refusal (the existing 404 "no buildable node", or the dispatch
core's typed `{ ok: false, reason }` mapped to a 404/4xx — the leaf's call, consistent with the studio's
404). A second concurrent dispatch while a run is live → the single-build guard surfaced as a 409 (mirror
`handleBuild`'s 409). A GET for an unknown `runId` → 404 "build run not found" (mirror `handleBuild`'s
GET 404). The mount never throws on a known outcome; the factory's central catch maps `HttpError → its
status` (local-backend.ts already has this).

THE PROGRESS STREAMS BACK OVER THE POLL (the streamed-back half, ADR-0108 d.7): the worker streams coarse
lines into the registry run (`runBuildJob` → `registry.appendLine`); the GET poll reads them back
(`{ status, transcript }`), and the ChatPanel folds them into the conversation (cap 4 renders the
dispatched run's progress to its terminal state). This is the SAME poll model the studio's Build button
uses — one wire contract, two surfaces.

THE PRODUCTION WIRING IS THE SIDECAR'S ATTESTED GLUE (the desktop posture, NOT a CI capability):
`backend-entry.ts` (the thick-local sidecar) currently calls `createLocalBackend({ ..., store: "pg" })`
with NO `build` seam. The GREEN production change is to wire a `build` seam there — `isBuildable` over the
real orchestrator discovery (`isStoryBuildable` / `resolveBuildConfig`, lazily imported, exactly as
`devApi.ts` does) + `runner: routedBuildRunner(...)` over the lazily-imported `storyBuild` / `nodeBuild`
(`@storytree/drive/build`). Per the desktop story's own posture — "the sidecar wiring is attested, not a
CI capability ... the CI-proven core is the [factory], exercised through these seams by stubs"
(backend-entry.ts:53-56) — this `backend-entry.ts` wiring is the OPERATOR-ATTESTED sidecar glue, exercised
live in the story's UAT leg 5, NOT a standing CI assertion. The CI-PROVEN core of THIS cap is the FACTORY
serving the registry-backed POST+GET over an INJECTED seam (the contracts below). Do NOT attempt a
`node:test` over the real `routedBuildRunner` (it would spawn a subscription-billed `story build --real`
on a gate pass — exactly the live-spend ADR-0010 §5 forbids).

OFFLINE-TESTABLE BY INJECTION (the desktop precedent): the test drives the factory over the `withServer`
`node:http` harness (`local-backend.test.ts`'s helper) with an INJECTED build seam whose runner is a
SCRIPTED double (emits a few coarse lines + a terminal envelope, no SDK) and an injected `isBuildable` —
over the re-composed registry. So the mount's POST+GET + the run wiring are proven WITHOUT a live
SDK-billed build on every gate pass (ADR-0010 §5). The live driven build (a real `story build --real` to
a signed verdict + an opened PR) is the story's operator-attested leg 5.

## Integration test

**Goal —** Prove that the desktop local backend serves a registry-backed `/api/build`: a POST with a
buildable accepted unit id mints a tracked run and returns `{ runId }`; a `GET ?runId` returns the run's
`{ status, transcript }` reflecting the worker's coarse progress to a terminal state; an un-buildable id
is refused (worker never invoked); a concurrent POST is refused with the single-build guard; a GET for an
unknown runId is a typed 404; and the mount holds no signing key / verdict path — entirely over a real
`node:http` server with an injected scripted runner (no SDK, no DB, no Electron).

The integration test exercises this capability against its **real in-story collaborator** — the local
backend factory's `/api/build` route over the `withServer` harness — with the build seam injected (a
scripted `runner` + an injected `isBuildable`, over the re-composed registry). No stubs of the factory's
own route dispatch or the re-composed run lifecycle (the POST branch, the GET branch, and the run fold
are all real); only the build RUNNER and `isBuildable` are doubles (ADR-0010 §5).

The integration test would:

1. Create the factory via `createLocalBackend({ ..., build: <injected registry-backed seam> })` with an
   injected `isBuildable` returning true and a scripted `runner` that emits a few coarse lines then a
   passing envelope. Drive it over `withServer`.
2. POST `/api/build` with `{ unitId: <buildable> }` → assert a `2xx` with a `{ runId }` body (the run was
   minted on the re-composed registry).
3. GET `/api/build?runId=<that runId>` (after the fire-and-forget job drains — poll/await the settle, the
   pattern the existing desktop tests use) → assert `200` with `{ status, transcript }` where `status`
   reaches a terminal `passed` and `transcript` carries the scripted runner's coarse progress lines (the
   progress the ChatPanel folds back).
4. POST `/api/build` with an un-buildable id (`isBuildable` false) → assert a clean refusal (`404`,
   mirroring the existing desktop branch / the studio's 404) and that the scripted runner was NEVER
   invoked — no run minted against nothing.
5. POST `/api/build` a SECOND time while a run is live → assert the single-build guard surfaced as a
   typed refusal (`409`, mirroring `handleBuild`), the running run untouched.
6. GET `/api/build?runId=<unknown>` → assert a typed `404` "build run not found" (mirror `handleBuild`'s
   GET 404), never a 500.
7. Assert the mount holds NO signing key and NO verdict path — its only collaborators are the injected
   build seam (registry + runner + isBuildable); no `events.verdict` write, no signer, no DB connection
   is reachable through it (ADR-0091). The verdict + the auto-merging PR are the WORKER's, off the human's
   click.
8. A scripted runner that FAILS (a non-ok envelope) → the GET reflects a terminal `failed` status with a
   reason (an honest failed build surfaced back to the chat surface), never a forged pass.

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** in the `desktop` suite (node:test
over the `withServer` `node:http` harness, `apps/desktop/src/backend/build-dispatch-mount.test.ts`), the
build seam injected with a scripted runner + an injected `isBuildable` over the re-composed registry. Per
ADR-0122 (`storytree coverage`), each contract id is the lead of a distinctly-named test, so the coverage
check reports 5/5. None of these is an APPEARANCE assertion (this is a backend mount — no UI surface).

1. **`dbm-post-dispatches-buildable-id`** — a POST with a buildable accepted id mints a tracked run and returns a runId
   - **asserts —** `POST /api/build { unitId: <buildable> }` validates `isBuildable`, mints a run on the
     re-composed registry, fires the worker fire-and-forget over the injected runner, and returns a `2xx`
     with a `{ runId }` body — the dispatch the ChatPanel's Build click drives.
   - **covers —** `apps/desktop/src/backend/local-backend.ts` (the registry-backed POST branch)
2. **`dbm-get-polls-run-status-transcript`** — GET ?runId returns the tracked run's status + transcript
   - **asserts —** after the run drains, `GET /api/build?runId=<runId>` returns `200` with
     `{ status, transcript }` where `status` is terminal `passed` and `transcript` carries the scripted
     runner's coarse progress lines — the poll route the ChatPanel polls for progress (the route that does
     NOT exist at HEAD: the RED).
   - **covers —** `apps/desktop/src/backend/local-backend.ts` (the new GET poll branch)
3. **`dbm-refuses-unbuildable-id`** — an un-buildable id is a typed refusal, worker never invoked
   - **asserts —** `POST /api/build` with an unknown / non-buildable id (`isBuildable` false) returns a
     clean `404` and the injected runner is NEVER invoked — no run minted against nothing (mirrors the
     existing desktop branch / the studio's 404).
   - **covers —** `apps/desktop/src/backend/local-backend.ts` (the validation guard on POST)
4. **`dbm-single-build-guard`** — a concurrent POST is the single-build refusal, running run untouched
   - **asserts —** a SECOND `POST /api/build` while a run is live returns a typed `409` (the registry's
     single-build guard surfaced), the running run left untouched; and a GET for an unknown runId returns
     a typed `404` "build run not found" (never a 500).
   - **covers —** `apps/desktop/src/backend/local-backend.ts` (the createRun-refusal + GET-404 mapping)
5. **`dbm-intent-not-verdict`** — a safe write: intent in, progress out, no verdict path
   - **asserts —** the mount's only collaborators are the injected build seam (registry + runner +
     isBuildable) — it holds no signing key, no `events.verdict` writer, no DB connection (read
     structurally); it hands the worker a unit id and reads back coarse progress, nothing more (ADR-0091).
     A failed scripted runner surfaces a terminal `failed` status with a reason, never a forged pass. The
     verdict + the auto-merging PR are the WORKER's, off the human's click, never handed in through the
     mount.
   - **covers —** `apps/desktop/src/backend/local-backend.ts` (the construction — build seam only)

## Guidance — the edit-existing slice that earns the signed verdict

The brownfield rung toward `healthy` (ADR-0057 §3, EDIT-EXISTING): the local backend factory already
serves a POST-only `/api/build` that discards the run; this increment EDITS it to serve a registry-backed
POST+GET over a re-composed run lifecycle, test-first.

- **The new test —** `apps/desktop/src/backend/build-dispatch-mount.test.ts` (node:test —
  `import { test } from "node:test"` + `import assert from "node:assert/strict"`, the desktop convention;
  reuse the `withServer` `node:http` harness + the `stubBackend` helper from `local-backend.test.ts`; NO
  real SDK/DB/Electron/socket beyond the local `node:http` loopback the harness already uses). It builds
  the factory with an INJECTED registry-backed build seam (a scripted `runner` + an injected
  `isBuildable`), POSTs + GETs over the harness, and awaits the fire-and-forget job's drain before
  asserting the terminal GET state (poll the GET / await a settle, the pattern the existing desktop tests
  use). Name each test for its contract id (`dbm-…`) so `storytree coverage` reports 5/5 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the desktop has NO GET `/api/build` branch
  (local-backend.ts:218-231 is POST-only → a GET hits the 405 "method ... not allowed", or the POST
  returns a 202 that drops the run so a subsequent GET can find nothing), so the GET-poll assertion finds
  no tracked run → red. ASSERT THE GET POLL RETURNS THE RUN'S {status, transcript} (and the POST returns
  a trackable runId), never just that the POST 202'd (that is green-ish at HEAD against the old seam and
  fails CONFIRM_RED). The RED is the registry-backed POST+GET behaviour, absent at HEAD.
- **The GREEN —** EDIT `apps/desktop/src/backend/local-backend.ts`: re-compose the run lifecycle locally
  (a small in-memory registry — mint/append/terminalise/getRun + the single-build guard — and a
  fire-and-forget runner-to-transcript fold, mirroring `BuildRegistry` + `runBuildJob` WITHOUT importing
  them from apps/studio/server), then serve `/api/build` POST (validate `isBuildable` → mint a run → fire
  the fold over the injected runner → `{ runId }`; typed 404/409 refusals) AND GET `?runId` (read the
  run → `{ status, transcript, ... }`; 404 unknown run). The injected `LocalBackendBuild.runner` is now
  driven THROUGH the run (its `sink` appends to the run's transcript) instead of discarded. NO import from
  `apps/studio/server` (the surface boundary — the desktop test guard pins this); NO `@storytree/drive`
  build engine in `apps/desktop/src` (the renderer/src boundary; the real runner is wired in the sidecar,
  below). After it, the POST-dispatches + GET-polls + refusals + intent-not-verdict assertions hold, and
  `pnpm --filter desktop test` + `pnpm --filter desktop typecheck` stay green.
- **The production wiring (operator-attested sidecar glue, NOT a CI assertion) —** wire a `build` seam in
  `apps/desktop/electron/backend-entry.ts`'s `createLocalBackend({ ... })` call (today it passes none):
  `isBuildable` over the real orchestrator discovery (`isStoryBuildable` / `resolveBuildConfig`, lazily
  imported as `devApi.ts` does) + `runner: routedBuildRunner(...)` over the lazily-imported
  `storyBuild` / `nodeBuild` (`@storytree/drive/build`). Per the desktop story's sidecar posture
  (backend-entry.ts:53-56) this wiring is attested, not a standing CI test; it is exercised in the
  story's UAT leg 5 (a real driven build), NOT asserted in CI. (The desktop typecheck DOES span
  `tsconfig.electron.json`, so the wiring must typecheck — but its BEHAVIOUR is operator-attested.)

Rules:

- **Never import apps/studio/server** — re-compose the run lifecycle locally in `apps/desktop/src/backend/`
  (the desktop precedent, ADR-0100; the `chat-sse-mount.test.ts:552` guard pins this). The dispatch core
  stays the studio's; the desktop mounts its mirror behind the SAME wire contract.
- **Reuse the run-lifecycle behaviour, never fork the build path** — mirror `BuildRegistry` +
  `runBuildJob`; add no second build engine, no signer, no DB (ADR-0090 / ADR-0091).
- **Intent, never a verdict** — hand the worker a unit id, read back coarse progress; hold no signing key,
  no verdict writer, no DB connection (`dbm-intent-not-verdict`, ADR-0091). The spine signs; CI lands.
- **Satisfy the client's wire contract verbatim** — POST `/api/build {unitId} → {runId}`; GET
  `/api/build?runId → {status, transcript}` (the shapes `api.build` / `api.buildStatus` already call); the
  ChatPanel (cap 4) must work unchanged on the desktop.
- **Typed refusals, never throw on a known outcome** — un-buildable → 404; concurrent → 409; unknown
  runId → 404 (`dbm-refuses-unbuildable-id` / `dbm-single-build-guard`), mirroring the studio's 404/409.
- **Accept comes from the human's click** — dispatch an EXPLICITLY-accepted id arriving as the POST body
  (cap 4's click); never parse a free-text "yes" (ADR-0108 d.3).
- **Stay in `apps/desktop/src` for the CI proof; the sidecar wiring is attested** — the write scope is
  the factory (ADR-0087); the `backend-entry.ts` `routedBuildRunner` wiring is the consuming surface's
  operator-attested glue (the desktop story's posture), not a standing CI assertion.
- **The adopt-aware / status-routing path is NOT this cap** — routing a `mapped` story id to ADOPT
  (`/api/adopt` / `adoptRunnerFromAdoptStory`) rather than BUILD, and the status-aware affordance choice,
  is a SEPARATE later cap (see "Open modeling calls"). This cap mounts the BUILD dispatch only.
