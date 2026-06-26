---
id: "local-backend-boot"
tier: capability
story: desktop
title: "The Electron main composes a local studio backend from the organism drivers and serves it on 127.0.0.1 /api/*"
outcome: "The Electron main process composes a local studio backend from the organism drivers and serves it on `127.0.0.1` `/api/*`, replacing the `static-server.ts` 503 stub."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors an
# integration test that imports a NOT-YET-EXISTING symbol from a NEW source file under apps/desktop/src
# (red = module-not-found against the source that does not exist at HEAD), then writes that one new
# source file (green). The new module composes the build/orchestrate drivers from @storytree/drive +
# spec discovery from @storytree/orchestrator + reads from @storytree/library/store behind a node:http
# `/api/*` handler, with NO `electron`/`dom` import (the CI-provable core, sibling to src/credential/ —
# the Electron main wires this factory in, the operator-attested layer). `install: true` + a typecheck
# wall because the module imports VALUE functions across the package boundary (the proof runs in a fresh
# worktree — tsx + tsc need the lockfile-only install, ADR-0031 §2). Single LITERAL source file (no `*`),
# so the default node:test proof on the one test file is legal — no `proofCommand`.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/local-backend.test.ts"
    sourceFile: "apps/desktop/src/backend/local-backend.ts"
    scope:
      testGlobs: ["apps/desktop/src/backend/local-backend.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/local-backend.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# The Electron main composes a local studio backend from the organism drivers

**Outcome —** The Electron main process composes a local studio backend from the organism drivers and
serves it on `127.0.0.1` `/api/*`, replacing the `static-server.ts` 503 stub.

**Depends on —** *(none — a root capability: the thick-client keystone, no in-story upstream. It stands
the backend up; `local-credential-wiring` and `shared-forest-connection` build on it.)*

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code; the whole thick-client
> layer is authored before implementation (ADR-0113). The seam it replaces already exists:
> `apps/desktop/electron/static-server.ts` boots a `127.0.0.1` server serving the compiled studio dist
> and STUBS `/api/*` with `503 {"error":"no backend in the desktop shell (Step 1; worker wiring is
> Step 2)"}`. The drivers it composes already exist and are real: `@storytree/drive`'s `routedBuildRunner`
> /`nodeBuild`/`storyBuild`/`orchestrate` + `@storytree/orchestrator`'s `findNodeSpecFile`/`loadNodeSpec`/
> `isStoryBuildable` — the EXACT composition `apps/studio/server/devApi.ts` already wires for the studio.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the local backend AS A WHOLE — a
`node:http` request handler that, mounted on `/api/*`, dispatches real read/build routes composed from
the organism drivers and returns real envelope bodies (an integration test against the real drivers over
an in-memory seed). It spans the route handler AND the composed drivers producing the bodies, so it is
an integration test, not a single isolated assertion.

WHY THIS IS A ROOT + THE KEYSTONE: it imports no other in-story capability. It is the piece that makes
the desktop "thick" — until `/api/*` serves a real backend, nothing else (the credential wiring, the
shared-forest writes, the chat surface) has anywhere to land. `local-credential-wiring` and
`shared-forest-connection` both build ON the backend this capability stands up.

THE LOCAL BACKEND IS RE-COMPOSED FROM THE ORGANISM DRIVERS, NOT IMPORTED FROM THE STUDIO (the boundary
call, see the story's "Local-backend boundary call"). It does NOT import `apps/studio/server` — that is a
forbidden surface→surface coupling (`static-server.ts` says so; `studio` is `private` with no server
export). Instead it composes the SAME organism drivers the studio server is built from, exactly as
`apps/studio/server/devApi.ts` does:
- **build/orchestrate** — `@storytree/drive` (`routedBuildRunner` over `nodeBuild`/`storyBuild`/
  `adoptStory`, and `orchestrate` for the chat surface), `loadLocalSecrets` from `@storytree/drive/secrets`,
  lazily imported inside the route closures (the raw-TS `.js` re-export trap `devApi.ts` already navigates);
- **discovery** — `@storytree/orchestrator` (`findNodeSpecFile`/`loadNodeSpec`/`isStoryBuildable`/
  `resolveBuildConfig`) to classify a unit id by tier the SAME way the CLI prechecks;
- **reads** — `@storytree/library/store` (`loadCorpus` + the in-memory seed) for the library/tree routes.

THE ROUTE TABLE IS MINIMAL-TO-JOURNEY (slow growth, ADR-0113's "minimal first"): mount only what the
thick-client journey needs — the library/tree/activity reads, the build trigger (`routedBuildRunner`),
and the chat SSE (the consumed headless-orchestrator Phase-2 route). Do NOT port the hosted concerns the
desktop has no use for: NO IAP / `guestPolicy` / members / invites / `db-control` / hosted db-wake. (If
the studio's full route table later proves worth sharing verbatim, extracting it into a shared organism
is a clean follow-on — out of scope here.)

THE MAIN PROCESS IS THE AGENT BOUNDARY (ADR-0004 / ADR-0090 d.2 / ADR-0113 §2): this backend runs in the
Electron MAIN process. The renderer (the studio UI) talks to it over `/api` exactly as it talks to a
hosted backend — it never imports `@storytree/agent` and holds no model path. The desktop reaches the SDK
only TRANSITIVELY through drive's `orchestrate` (the single-import-site, ADR-0004) — this module never
names `@anthropic-ai/*`.

THE CI-PROVABLE CORE IS ELECTRON-FREE (the standalone-resilient-library shape, mirroring
`src/credential/`): the backend factory lives under `apps/desktop/src/backend/` with NO `electron` and NO
`dom` import, so `node:test` can drive it headlessly. The Electron `main.ts` is the thin operator-attested
binding that imports this factory and replaces `serveStudio`'s `/api/*` 503 branch with it (that wiring +
the running shell are witnessed under `electron-shell`/the Story UAT, not asserted in CI). Keep the
factory a plain function over an injected port set (the drivers injected as callbacks) so the test passes
doubles and no live SDK/DB is touched.

OFFLINE-TESTABLE BY INJECTION: the factory takes the drivers (the build runner, the discovery, the read
dispatch) as injected callbacks — the integration test drives it with the REAL discovery + reads over an
`InMemoryStore` seed and a scripted/stub build runner (no live SDK, no DB). Production wires the real
lazily-imported `@storytree/drive` drivers, the same shape `devApi.ts` uses.

## Integration test

**Goal —** Prove that the local backend factory, mounted as a `/api/*` `node:http` handler and composed
from the real organism drivers, serves real read/build routes (real envelope bodies) instead of the
`static-server.ts` 503 stub — entirely in-process, no Electron, no live SDK, no DB.

The integration test exercises this capability against its **real in-story collaborators** — the real
`@storytree/orchestrator` discovery + the real `@storytree/library/store` reads over an `InMemoryStore`
seed (`loadCorpus`) — with the live-spend drivers (the SDK build/orchestrate) injected as scripted
doubles. No stubs within the desktop's own composition.

The integration test would:

1. Build the local backend handler over injected deps: the real read dispatch + discovery, and a stub
   build runner (no SDK spend).
2. Issue a `GET /api/*` read request (a library/tree route) against the handler → it returns a real
   envelope body sourced from the real reads over the seed — **not** a 503, **not** the `static-server.ts`
   stub string.
3. Issue a build-trigger `POST /api/*` → the handler dispatches to the injected build runner (asserting
   the route reaches the runner with the unit id) and returns the accepted/started response shape, never
   crossing into the verdict store directly.
4. Assert the composed factory imports NO `electron` and NO `apps/studio/server` module (a structural
   check: the module under test is electron-free and does not couple to the studio surface).
5. An unknown `/api/*` route, or a malformed request, returns an honest error envelope (a 4xx with
   guidance), never a thrown crash and never HTML for a JSON fetch.

## Contracts (3)

The test-proven leaf behaviours — each one isolated automated test (`node:test`, the `desktop` suite),
collaborators stubbed. None exist yet; each is the assertion a contract test WILL prove against the real
backend code once authored (the file is named provisionally — re-cite at real `file:line` when built).

1. **`lb-api-serves-real-envelope-not-503`** — a read route returns a real body, never the stub
   - **asserts —** mounted on `/api/*`, a read route handler returns the read dispatch's real envelope
     body (over an injected real read + seed), and NEVER returns the `static-server.ts` 503 stub
     (`"no backend in the desktop shell …"`) — the stub branch is replaced, not shadowed.
   - **covers —** `apps/desktop/src/backend/local-backend.ts` (the read route) *(provisional path)*
2. **`lb-build-route-reaches-the-injected-runner`** — a build trigger dispatches to the driver, not the verdict store
   - **asserts —** a build-trigger request routes to the injected build runner with the unit id and
     returns its accepted/started shape; the handler holds no signing key and writes no verdict directly
     (ADR-0091) — it only triggers the driver.
   - **covers —** `apps/desktop/src/backend/local-backend.ts` (the build route)
3. **`lb-core-is-electron-and-studio-free`** — the provable core crosses neither boundary
   - **asserts —** the backend factory module imports no `electron` and no `apps/studio/server/*` — it is
     the Electron-free, surface-boundary-respecting core (the renderer/agent topology + the studio
     surface boundary both hold by construction).
   - **covers —** `apps/desktop/src/backend/local-backend.ts` (the module's import surface)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the local backend factory
as a new module, test-first.

- **The new test —** `apps/desktop/src/backend/local-backend.test.ts` (`node:test` + `node:assert/strict`,
  the package convention). Import `{ createLocalBackend }` (or the chosen factory name) from
  `"./local-backend.js"`. Build an `InMemoryStore` + `loadCorpus` for the real seed, the real discovery,
  and a stub build runner.
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `local-backend.ts`
  does not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red, ADR-0057).
  Assert that the handler serves a real read envelope (not the 503), routes a build trigger to the
  injected runner, and is electron-free.
- **The GREEN —** write `apps/desktop/src/backend/local-backend.ts`: a factory that takes the injected
  drivers (read dispatch + discovery + build runner) and returns a `node:http` request handler for
  `/api/*` mounting the minimal-to-journey routes (reads, build trigger, chat SSE seam). NO `electron`,
  NO `dom`, NO `apps/studio/server` import. After it, the import resolves, the assertions hold, and the
  package suite + typecheck stay green. The Electron `main.ts` then imports this factory and replaces the
  `static-server.ts` `/api/*` 503 branch with it (operator-attested wiring, not CI).

Rules:

- **Compose the organism drivers; never import the studio server** (the boundary call). The factory
  imports `@storytree/drive` / `@storytree/orchestrator` / `@storytree/library/store` — never
  `apps/studio/server/*`. The test pins this (`lb-core-is-electron-and-studio-free`).
- **Electron-free core** — no `electron`/`dom` import in the factory; the shell wiring is the
  operator-attested binding. The test pins this.
- **Minimal-to-journey routes** — mount only reads + build trigger + chat SSE; do NOT port the hosted
  IAP/members/invites/db-control concerns.
- **Trigger, never sign** — the build route reaches the driver; it holds no signing key and writes no
  verdict directly (ADR-0091).
