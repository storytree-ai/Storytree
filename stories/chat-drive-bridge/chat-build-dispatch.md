---
id: "chat-build-dispatch"
tier: capability
story: chat-drive-bridge
title: "The chat-surface build dispatch — a human-accepted unit id routes to the existing worker, progress streamed back"
outcome: "Given a human-ACCEPTED unit id, a chat-surface build-dispatch validates the unit is buildable and routes it to the EXISTING drive worker (`routedBuildRunner` / `runBuildJob` / the registry), returning a runId, and the worker's coarse progress is streamed back over the chat surface — a safe build INTENT, never a verdict-in."
status: proposed
proof_mode: integration-test
depends_on: [proposal-id-threading]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors a
# VITEST test (chat-build-dispatch.test.ts) that imports a NOT-YET-EXISTING symbol (dispatchAcceptedBuild)
# from a NEW source file in apps/studio/server (red = module-not-found against the source that does not
# exist at HEAD), then writes that one new source file (green). The new module is the chat-side build
# DISPATCH CORE — validate a human-accepted unit id is buildable, mint a run on the EXISTING
# BuildRegistry, fire runBuildJob over the injected BuildRunner, return a typed { ok, runId } — reusing
# apps/studio/server/buildWorker.ts + buildRegistry.ts verbatim (the studio-build precedent: this story
# owns the dispatch glue physically hosted in apps/studio/server). The test drives it with the REAL
# BuildRegistry + an injected SCRIPTED BuildRunner (no SDK spend, ADR-0010 §5) + an injected isBuildable.
# RUNNER: apps/studio is the ONE React/Vite workspace whose tests run under VITEST (vite.config + a
# vitest.config whose include covers BOTH `src/**/*.test.{ts,tsx}` AND `server/**/*.test.ts`) — NOT
# node:test (the vitest-runner-mismatch trap: a node:test file here is silently NOT picked up). The new
# server test MUST be a vitest file (`import { describe, it, expect } from 'vitest'`), exactly like the
# existing apps/studio/server/*.test.ts (buildWorker.test.ts, buildApi.integration.test.ts).
# proofCommand is REQUIRED so the spine scopes the proof to the single new file via the vitest runner
# (the default `pnpm --filter studio test` runs the WHOLE studio vitest suite). `install: true` + a
# typecheck wall because the new module imports BuildRegistry/BuildRunner across the server tree (the
# proof runs in a fresh worktree — tsx + tsc need the lockfile-only install, ADR-0031 §2). The scope
# stays within apps/studio/server (ADR-0087: one concrete write scope).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/server/**/*.test.ts"]
    sourceGlobs: ["apps/studio/server/**/*.ts"]
  real:
    testFile: "apps/studio/server/chat-build-dispatch.test.ts"
    sourceFile: "apps/studio/server/chat-build-dispatch.ts"
    scope:
      testGlobs: ["apps/studio/server/chat-build-dispatch.test.ts"]
      sourceGlobs: ["apps/studio/server/chat-build-dispatch.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "studio", "exec", "vitest", "run", "server/chat-build-dispatch.test.ts"]
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
---

# The chat-surface build dispatch — a human-accepted unit id routes to the existing worker

**Outcome —** Given a human-ACCEPTED unit id, a chat-surface build-dispatch validates the unit is
buildable and routes it to the EXISTING drive worker (`routedBuildRunner` / `runBuildJob` / the
registry), returning a runId, and the worker's coarse progress is streamed back over the chat surface —
a safe build INTENT, never a verdict-in.

**Depends on —** [`proposal-id-threading`](proposal-id-threading.md) — the dispatch consumes the
`proposedUnitId` that arrives on the client (threaded by capability 2) as the ACCEPTED unit id to
build. It produces no id; it validates + routes the accepted one.

> **Proof status (honest) — `proposed`, NET-NEW dispatch over the EXISTING worker.** This is the third
> link of **ADR-0108 Phase 3's bridge** + the connective tissue of **Phase 4**: the client now receives
> a machine-actionable `proposedUnitId` (capabilities 1–2), and the drive worker
> (`routedBuildRunner` → `story build --real`, which persists verdicts + opens the auto-merging PR)
> already exists — but the studio dev front mounts `/api/build` while the desktop (where chat ships)
> DISABLES build, so there is no path from an accepted proposal to that worker. This capability adds
> the chat-side DISPATCH CORE: given a human-ACCEPTED unit id, validate it is buildable, mint a run on
> the EXISTING `BuildRegistry`, fire `runBuildJob` over the EXISTING runner, return a typed
> `{ ok, runId }`, and forward the worker's coarse progress back over the chat surface. It REUSES the
> worker verbatim (the studio-build precedent — this story owns the dispatch glue physically hosted in
> `apps/studio/server`). It is a SAFE write — a build INTENT, never a verdict-in (ADR-0091).

## Guidance

**THIS BUILD — the current `--real` increment (net-new): the `dispatchAcceptedBuild` core.** Today
`handleBuild` (`apps/studio/server/apiRouter.ts`) already validates buildable → `createRun` →
`runBuildJob`, but it is the studio's `/api/build` POST/poll, wired only on the dev front; the desktop
(where chat ships) disables build, and nothing connects an ACCEPTED chat proposal to the worker. This
increment authors a new module — `dispatchAcceptedBuild` — that the chat surface calls with a
human-accepted unit id, reusing the worker machinery and returning a typed result.

- **NET-NEW, missing-symbol red.** Author `apps/studio/server/chat-build-dispatch.test.ts` (a VITEST
  file — `import { describe, it, expect } from 'vitest'`, the studio server convention) importing
  `{ dispatchAcceptedBuild }` from `"./chat-build-dispatch.js"` — which does NOT exist at HEAD, so the
  test fails module-not-found (the net-new red). Then write the one new source file (green).
- **REUSE the worker, never re-implement it.** `dispatchAcceptedBuild` takes the SAME pieces
  `BuildContext` already injects — `{ registry: BuildRegistry, runner: BuildRunner, isBuildable }` — and
  composes them exactly as `handleBuild`'s POST branch does: validate `isBuildable(unitId)`, `createRun`
  (the single-build guard), `void runBuildJob(registry, runId, unitId, runner)`, return `{ ok: true,
  runId }`. The DIFFERENCE from `handleBuild` is shape, not behaviour: it is a plain function (not an
  HTTP handler) returning a typed result the chat surface can fold into its stream, and it carries the
  `accepted` provenance (it dispatches ONLY an explicitly-accepted id — ADR-0108 d.3). Get this wrong —
  forking a second build path or reaching inside the gate — and you have duplicated the worker / crossed
  ADR-0091.
- **A SAFE write — INTENT, never a verdict.** The dispatch hands the worker a UNIT ID; it never accepts,
  signs, or persists a verdict (the spine inside the worker signs from real RED→GREEN, ADR-0091). It
  holds no signing key and no DB connection. The dispatched `story build --real` is what PERSISTS the
  verdict + opens the NON-DRAFT PR CI auto-merges (ADR-0022 / ADR-0090) — but that is the worker's doing,
  off the human's accept, not a forge pathway through the dispatch.
- **Typed refusals, never a 500-equivalent.** An UN-buildable / unknown unit id → a typed
  `{ ok: false, reason: 'not buildable' }` (the worker is never spawned against nothing — mirrors
  `handleBuild`'s 404). A second concurrent dispatch while one run is live → a typed
  `{ ok: false, reason: 'a build is already running' }` (the registry's single-build guard surfaced —
  mirrors the 409). The dispatch never throws on a known outcome.
- **The PROGRESS streams back over the chat surface.** The worker streams coarse lines into the
  registry run (`runBuildJob` → `registry.appendLine`); the chat surface reads them back (the run's
  `transcript` via the registry / the shared `GET /api/build?runId` poll the desktop mount reuses) and
  folds them into the conversation. The CORE this capability proves is the dispatch + the run wiring;
  the desktop MOUNT of it (the route + the SSE/poll glue on the local backend) is the consuming
  surface's thin glue (`apps/desktop`, the studio-build precedent), over this core.
- **The RED the spine observes:** module-not-found on `dispatchAcceptedBuild`. **The GREEN:** the new
  module composes the injected registry/runner/isBuildable; the test (real `BuildRegistry` + a scripted
  `BuildRunner` + an injected `isBuildable`) asserts a buildable accepted id returns `{ ok: true, runId }`
  and the run reaches a terminal `passed`/`failed` with the scripted runner's progress lines on its
  transcript, an un-buildable id returns the typed refusal (worker never invoked), and a concurrent
  dispatch returns the single-build refusal.

WHY THIS IS A CAPABILITY (not a contract): its honest proof spans the DISPATCH AS A WHOLE — validation,
the run mint + single-build guard, the fire-and-forget worker invocation, and the progress fold onto the
run — exercised against the REAL `BuildRegistry` + `runBuildJob` with the build runner injected as a
scripted double. That crosses the validation AND the worker wiring, so it is an integration test against
the real worker machinery, not a single isolated assertion.

REUSES THE ADR-0090 WORKER (ADR-0108 d.7 / the inner-loop-adoption-gap §5 architecture): the dispatch
is a SECOND caller of the EXISTING worker (`routedBuildRunner` routes a STORY id → `story build --real`;
`runBuildJob` runs it fire-and-forget streaming coarse progress; the `BuildRegistry` holds the run). It
does NOT decide or decompose (that is the agent's job, capabilities 1–2 surface the proposal); it
dispatches an ACCEPTED unit id. The build trigger the studio Build button already uses and this chat
dispatch are the SAME worker, two callers.

THE ACCEPT IS THE HUMAN'S, NOT THE AGENT'S (ADR-0108 d.3): `dispatchAcceptedBuild` dispatches an
EXPLICITLY-ACCEPTED unit id — the accept comes from the human's UI click (capability 4), arriving as
the dispatch's input. The dispatch never parses a free-text "yes" and never accepts on the agent's
behalf; it is the mechanism the human's click drives. The agent declared the id (capability 1); the
human accepts it (capability 4); this capability routes the accepted id.

PROOF INTEGRITY (ADR-0091): the dispatch hands the worker a build intent; the spine inside the worker
observes RED→GREEN from real exit codes and SIGNS; CI re-proves green before the trunk (ADR-0022). The
dispatch holds no signing key, no verdict path, no DB connection — the damage ceiling is a briefly-wrong
hue corrected by CI, exactly the ADR-0091 argument.

OFFLINE-TESTABLE BY INJECTION: the test injects a SCRIPTED `BuildRunner` (emits a few coarse lines + a
terminal envelope, no SDK) and an injected `isBuildable`, over the REAL `BuildRegistry` — so the
dispatch + the run wiring are proven WITHOUT a live SDK-billed build on every gate pass (ADR-0010 §5).
The live driven build (a real `story build --real` to a signed verdict + an opened PR) is the story's
operator-attested leg.

## Integration test

**Goal —** Prove that a human-accepted, buildable unit id is validated, minted as a run on the real
registry, dispatched to the worker, and its coarse progress folded back onto the run — with un-buildable
ids and concurrent dispatches refused with typed results, and no verdict ever handed in.

The integration test exercises this capability against its **real in-story collaborators** — the real
`BuildRegistry` and the real `runBuildJob` (`apps/studio/server/buildWorker.ts`) — with a SCRIPTED
`BuildRunner` and an injected `isBuildable` (no SDK spend, ADR-0010 §5). No stubs of the registry/worker
machinery.

The integration test would:

1. Call `dispatchAcceptedBuild` with a buildable accepted unit id, the real `BuildRegistry`, an injected
   `isBuildable` returning true, and a scripted `BuildRunner` that emits a few coarse lines then a
   passing envelope.
2. Assert it returns `{ ok: true, runId }`, the registry has an active run for that runId, and once the
   fire-and-forget job drains the run is terminal `passed` with the scripted progress lines on its
   `transcript` (the progress the chat surface folds back).
3. Assert an UN-buildable / unknown id (`isBuildable` returns false) returns a typed
   `{ ok: false, reason }` and the worker (`runBuildJob`) was NEVER invoked — no run minted against
   nothing (mirrors `handleBuild`'s 404).
4. Assert a SECOND `dispatchAcceptedBuild` while a run is live returns a typed
   `{ ok: false, reason: 'a build is already running' }` (the registry single-build guard surfaced),
   the running run untouched (mirrors the 409).
5. Assert the dispatch holds NO signing key and NO verdict path — it hands the worker a unit id and
   nothing else (read the function's collaborators: registry + runner + isBuildable only); no
   `events.verdict` write, no signer, is reachable through it (read/propose-then-drive integrity,
   ADR-0091). The verdict is the WORKER's, off the human's accept.
6. A scripted runner that FAILS (a non-ok envelope) → the run terminalises `failed` with a reason (an
   honest failed build surfaced back to the chat surface), never a forged pass.

## Contracts (4)

The test-proven leaf behaviours — each one assertion in the studio server suite (VITEST over
`apps/studio/server/*.test.ts`), exercised against the real `BuildRegistry` + `runBuildJob` with a
scripted `BuildRunner`.

1. **`cbd-dispatches-accepted-buildable-id`** — a buildable accepted id mints + runs
   - **asserts —** `dispatchAcceptedBuild` validates `isBuildable`, mints a run on the real registry,
     fires `runBuildJob` over the injected runner, and returns `{ ok: true, runId }`; once drained the
     run is terminal `passed` with the scripted runner's coarse progress on its `transcript`.
   - **covers —** `apps/studio/server/chat-build-dispatch.ts` (the dispatch composition) *(provisional path)*
2. **`cbd-refuses-unbuildable-id`** — an un-buildable id is a typed refusal, worker never invoked
   - **asserts —** an unknown / non-buildable id (`isBuildable` false) returns a typed
     `{ ok: false, reason }` and `runBuildJob` is NEVER invoked — no run spawned against nothing
     (mirrors `handleBuild`'s 404).
   - **covers —** `apps/studio/server/chat-build-dispatch.ts` (the validation guard)
3. **`cbd-single-build-guard`** — a concurrent dispatch is a typed refusal, running run untouched
   - **asserts —** a second `dispatchAcceptedBuild` while a run is live returns a typed
     `{ ok: false, reason: 'a build is already running' }` (the registry's single-build guard surfaced),
     the running run left untouched.
   - **covers —** `apps/studio/server/chat-build-dispatch.ts` (the createRun-refusal mapping)
4. **`cbd-intent-not-verdict`** — a safe write: intent in, no verdict path
   - **asserts —** the dispatch's only collaborators are the registry + the runner + `isBuildable`
     (read structurally) — it holds no signing key, no `events.verdict` writer, no DB connection; it
     hands the worker a unit id and nothing more (ADR-0091). The verdict + the auto-merging PR are the
     WORKER's, off the human's accept, never handed in through the dispatch.
   - **covers —** `apps/studio/server/chat-build-dispatch.ts` (the construction — registry/runner/isBuildable only)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): the dispatch core is authored as
a new module in `apps/studio/server`, test-first, beside the worker it reuses.

- **The test —** `apps/studio/server/chat-build-dispatch.test.ts` (VITEST — `import { describe, it,
  expect } from 'vitest'`, the SAME runner the existing `apps/studio/server/*.test.ts` use; node:test
  files are silently NOT picked up by the studio vitest include — the vitest-runner-mismatch trap). It
  imports `{ dispatchAcceptedBuild }` from `"./chat-build-dispatch.js"`, builds a REAL `BuildRegistry`,
  an injected `isBuildable`, and a scripted `BuildRunner` (emits coarse lines + a terminal envelope; no
  SDK). It awaits the fire-and-forget job's drain before asserting the terminal run state (poll the
  registry / await a settle, the pattern the existing buildWorker.test.ts / buildApi.integration.test.ts use).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `chat-build-dispatch.ts` does not exist at HEAD, so the test fails module-not-found (the net-new
  missing-symbol red). It asserts the dispatch, the un-buildable refusal, the single-build refusal, and
  the intent-not-verdict construction.
- **The GREEN —** `apps/studio/server/chat-build-dispatch.ts`: `dispatchAcceptedBuild({ unitId,
  registry, runner, isBuildable })` validates `isBuildable`, `createRun`s (typed refusal on the guard),
  `void runBuildJob(...)`, returns `{ ok: true, runId }`. It composes the EXISTING worker; it adds no
  build path, no signer, no DB. The import resolves, the assertions hold, the studio suite + typecheck
  are green. The HTTP/SSE mount on the desktop local backend (the route + the progress forward) is the
  consuming surface's glue (`apps/desktop`), over this core.

Rules:

- **Reuse the worker, never fork it** — compose the injected `BuildRegistry` + `BuildRunner` +
  `isBuildable` exactly as `handleBuild` does; add no second build path (ADR-0090).
- **Intent, never a verdict** — hand the worker a unit id; hold no signing key, no verdict writer
  (`cbd-intent-not-verdict`, ADR-0091). The spine signs; CI lands.
- **Typed refusals, never throw on a known outcome** — un-buildable → typed reason; concurrent →
  single-build reason (`cbd-refuses-unbuildable-id`, `cbd-single-build-guard`), mirroring the 404/409.
- **Accept comes from the human** — dispatch an EXPLICITLY-accepted id (capability 4's click); never
  parse a free-text "yes" (ADR-0108 d.3).
- **Stay in `apps/studio/server`** — the write scope is one surface (ADR-0087). The desktop mount is
  the consuming glue, a separate increment under the `desktop`-edge precedent.
