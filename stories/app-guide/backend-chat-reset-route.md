---
id: "backend-chat-reset-route"
tier: capability
story: terminal-chat
title: "OPTIONAL / STRETCH — a POST /api/chat/reset route clears the backend single-session guard so a wedged session recovers without a restart"
outcome: "A `POST /api/chat/reset` route on the chat sidecar clears the backend composition single-session guard (`compositionInFlight`) so a genuinely wedged chat session is recoverable without restarting the app — via an exported guard-reset the mount calls, holding no signing key and starting no session."
status: proposed
proof_mode: integration-test
depends_on: []
# OPTIONAL / STRETCH — this capability MAY be HELD without blocking the terminal-feel story (the
# thin-client reset in `transcript-reset` is honest on its own: it clears the panel and aborts the client
# stream; the "New chat" affordance works). This unit recovers a genuinely WEDGED BACKEND session (the
# single-session guard stuck true) without an app restart. It is SIDECAR/DRIVE work, NOT thin-client — so
# it does NOT touch apps/studio/src and carries no modelPathBoundary concern.
#
# Node-borne proof config (ADR-0057 keystone). BROWNFIELD (editsExisting): `compositionInFlight` is a
# module-level `let` in packages/drive/src/orchestrate.ts:107 with NO exported reset, and the desktop chat
# sidecar (apps/desktop/src/backend/chat-sse-mount.ts) mounts ONLY POST /api/chat (it falls through for
# everything else — see csm-dispatcher-falls-through-not-404s). The RED the spine observes: (1) an assertion
# that a drive-exported guard reset clears an in-flight guard fails (no such export exists), and (2) an
# assertion that the sidecar answers POST /api/chat/reset by clearing the guard fails against the mount at
# HEAD (it returns false / 404 for that path). The proof spans the drive guard-reset export AND the sidecar
# route. SCOPE default = apps/desktop (the sidecar mount lives there); the drive guard-reset export is a
# cross-package collaborator (declared cross-story edge to drive-machinery — see depends note in the story).
# node:test package suite (apps/desktop), the chat-sse-mount precedent. `install: true` + typecheck wall
# (imports a VALUE across the package boundary — the drive guard reset; ADR-0031 §2).
#
# HELD-BY-DEFAULT NOTE FOR THE ORCHESTRATOR: do NOT auto-build this in the same chain as the three
# thin-client caps. Build it only if/when the owner asks for backend-wedge recovery — the story's UAT is
# satisfiable without it. Its `real:` arm is authored so it IS buildable when picked up, but it is a
# separate landing.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/chat-reset-route.test.ts"
    sourceFile: "apps/desktop/src/backend/chat-reset-route.ts"
    scope:
      testGlobs: ["apps/desktop/src/backend/chat-reset-route.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/chat-reset-route.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# OPTIONAL / STRETCH — a POST /api/chat/reset route clears the backend single-session guard

**Outcome —** A `POST /api/chat/reset` route on the chat sidecar clears the backend composition
single-session guard (`compositionInFlight`) so a genuinely wedged chat session is recoverable without
restarting the app — via an exported guard-reset the mount calls, holding no signing key and starting no
session.

> **OPTIONAL / STRETCH — may be HELD.** This capability is a stretch: the terminal-feel story's UAT is
> satisfiable WITHOUT it (the thin-client [`transcript-reset`](transcript-reset.md) clears the panel and
> aborts the CLIENT stream, and the "New chat" affordance works). This unit recovers a genuinely WEDGED
> BACKEND session — the composition single-session guard stuck `true` after an abnormal end — without an app
> restart. Build it only if/when the owner asks for backend-wedge recovery. It is authored buildable so it
> can be picked up, but it lands separately from the three thin-client capabilities.

**Depends on —** nothing within `terminal-chat`. It CONSUMES a drive-machinery seam (the exported
composition guard-reset it calls) — a CROSS-STORY edge declared on the story (`terminal-chat` →
`drive-machinery`), not a within-story `depends_on`. It also mounts alongside the existing desktop
[`chat-sse-mount`](../desktop/chat-sse-mount.md) dispatcher (a `desktop` capability) — this route is the
SIBLING dispatcher pattern that story already established, re-used here.

> **Proof status (honest) — BROWNFIELD, `proposed`.** `compositionInFlight` is a module-level `let` in
> `packages/drive/src/orchestrate.ts:107` with NO exported reset; the desktop chat sidecar mounts ONLY
> `POST /api/chat` (`apps/desktop/src/backend/chat-sse-mount.ts`, falling through for every other path).
> This capability adds the drive guard-reset export + the `POST /api/chat/reset` sidecar route.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the RESET ROUTE AS A WHOLE — a `node:http`
dispatcher that answers `POST /api/chat/reset` by clearing the drive composition single-session guard
(through an exported drive seam) and returning a `200`, AND falls through (returns `false`) for every other
path so the existing 404 / sibling dispatchers still fire. It spans the route intake AND the real drive
guard-reset collaborator AND the fall-through — an integration test against the real drive guard, not a
single isolated assertion. It mirrors the `chat-sse-mount` sibling-dispatcher shape exactly.

WHY IT IS NOT FOLDED INTO `chat-sse-mount` (the splitting-rule, ADR-0010): `chat-sse-mount` (a `desktop`
capability, already green) proves the STREAMING chat intake (`POST /api/chat` → SSE). THIS proves a
DIFFERENT observable — a `POST /api/chat/reset` that clears the backend guard (a one-shot control, no
stream, no session started). Distinct path, distinct observable, its own isolatable net-new red→green.
Authored as a SIBLING dispatcher (a new source file under `apps/desktop/src/backend/`, mounted alongside
`chat-sse-mount`) precisely so `chat-sse-mount`'s green is not re-opened to add the reset route — the exact
sibling precedent `boot-read-routes` / `chat-sse-mount` set.

THE DRIVE GUARD NEEDS AN EXPORTED RESET (the cross-package half). `compositionInFlight` is a private
module-level `let` — the mount cannot clear it directly. So drive must export a narrow guard-reset (e.g.
`resetCompositionGuard()` in `orchestrate.ts`) that sets `compositionInFlight = false`. This is a small,
honest addition: it clears ONLY the composition guard (a recovery valve for a wedged session), does NOT
abort an actually-running SDK session mid-flight (that is not this route's job — it is the "the guard is
stuck but no session is really running" recovery), and holds no signing key. The route calls this exported
reset; the test drives the route against the real drive export (the real in-story/cross-story collaborator),
no stub.

READ/CONTROL ONLY, NO SIGNING, NO SESSION (ADR-0091, inherited from the chat surface's read/propose wall).
The reset route clears a guard; it starts NO session, holds NO signing key, hands in NO verdict, triggers
NO build, opens NO PR. It is a recovery control, not a build path. Fail-closed: a non-POST or a wrong path
falls through; the route never does anything but clear the guard + return 200.

THE CI-PROVABLE CORE IS ELECTRON-FREE (the standalone-resilient-library shape, mirroring
`chat-sse-mount.ts`): the module lives under `apps/desktop/src/backend/` with NO `electron`/`dom` import, so
`node:test` drives it headlessly over a real `node:http` server + a loopback `fetch`. The Electron sidecar
(`backend-entry.ts`) mounting this dispatcher alongside `chat-sse-mount` is the operator-attested wiring
(the story's UAT leg), not asserted in CI.

WIRING THE FRONTEND RESET TO CALL THIS ROUTE IS A FOLLOW-ON, NOT THIS CAPABILITY (slow growth). This
capability adds the ROUTE + the guard-reset. Making the thin-client [`transcript-reset`](transcript-reset.md)
ALSO POST `/api/chat/reset` on reset (so the operator's reset clears the backend too) is a small follow-on —
it would add an `api.chatReset()` seam call inside the thin-client wall — deliberately NOT pulled in here, so
this stretch unit stays a clean backend-only landing. Until then, this route is callable directly (e.g. by
the owner via curl / a dev affordance) for wedge recovery.

OFFLINE-TESTABLE BY DRIVING THE REAL GUARD (the SAME discipline `chat-sse-mount.test.ts` uses): `node:test`
+ `node:assert/strict`, a real `node:http` server + loopback `fetch`, driving the route against the REAL
drive guard export (set the guard in-flight via the real `orchestrate` path or a test helper, POST the
reset route, assert the guard cleared). No Electron/DOM/DB/SDK.

## Integration test

**Goal —** Prove that the reset dispatcher, mounted as a `/api/*` `node:http` handler, answers
`POST /api/chat/reset` by clearing the real drive composition single-session guard and returning `200`, and
falls through (returns `false`) for any other path. Entirely in-process: no Electron, no live SDK, no DB, no
network beyond loopback HTTP.

The integration test exercises this capability against its **real cross-story collaborator** — the real
drive composition guard (`compositionInFlight` + its exported reset in `@storytree/drive`) — no stub.

The integration test would:

1. Mount `createChatResetRoute()` behind a wrapper that 404s when the dispatcher returns `false`. Put the
   drive composition guard into the in-flight state (via the real drive path / test helper).
2. `POST /api/chat/reset` → assert a `200` AND that the drive composition guard is now cleared (a fresh
   session would be allowed) — the wedge-recovery journey against the real guard.
3. An unhandled `POST /api/x` (or a `GET /api/chat/reset`) → assert the dispatcher returns `false` so the
   wrapper's 404 fires — a real path-matcher that falls through, never a catch-all.

## Contracts (2)

The test-proven leaf behaviours — each **one isolated automated test** in the `desktop` suite (`node:test`,
`apps/desktop/src/backend/chat-reset-route.test.ts`), driving the real drive guard. Per ADR-0122
(`storytree coverage`), each contract id is the lead of a distinctly-named test, so `storytree coverage
backend-chat-reset-route` reports 2/2.

1. **`bcr-clears-the-composition-guard`** — POST /api/chat/reset clears the backend single-session guard and returns 200
   - **asserts —** with the drive composition single-session guard in the in-flight state, a
     `POST /api/chat/reset` clears it (a subsequent session is allowed) and returns `200` — the wedge
     recovery, proven against the REAL drive guard. Fails against HEAD (no exported guard-reset; the sidecar
     404s the path) — the brownfield red.
   - **covers —** `apps/desktop/src/backend/chat-reset-route.ts` (the reset route → drive guard-reset) and
     `packages/drive/src/orchestrate.ts` (the exported `resetCompositionGuard`)
2. **`bcr-falls-through-not-404s`** — the dispatcher returns false for any other path
   - **asserts —** the dispatcher handles `POST /api/chat/reset` (returns `true`) and returns `false` for
     any other path/method (a `GET`, `/api/chat`, `/api/me`) so the caller can fall through to the existing
     404 / sibling dispatchers — electron-free, importing no `apps/studio/server` (the surface boundary
     holds by construction).
   - **covers —** `apps/desktop/src/backend/chat-reset-route.ts` (the dispatcher's fall-through + import
     surface)

## Guidance — the net-new slice that earns the signed verdict

The BROWNFIELD rung toward `healthy` (ADR-0057 §3): author the guard-reset + route assertions (the red
against the no-export / 404 code at HEAD), then add the drive export + the sidecar route (the green).

- **The new test —** `apps/desktop/src/backend/chat-reset-route.test.ts` (`node:test` +
  `node:assert/strict`, a real `node:http` server + loopback `fetch`, driving the real drive guard — the
  `chat-sse-mount.test.ts` convention). Name each test for its `bcr-…` contract id so `storytree coverage
  backend-chat-reset-route` reports 2/2 (ADR-0122).
- **The RED the spine observes —** the import resolves nothing (`chat-reset-route.ts` does not exist at
  HEAD) and there is no exported drive guard-reset — the test fails module-not-found / unresolved symbol
  (the net-new + brownfield red).
- **The GREEN —** export a narrow `resetCompositionGuard()` from `packages/drive/src/orchestrate.ts`
  (sets `compositionInFlight = false`); write `apps/desktop/src/backend/chat-reset-route.ts` exporting
  `createChatResetRoute()` returning the `(req, res, pathname) => Promise<boolean>` dispatcher that, on
  `POST /api/chat/reset`, calls the drive reset + returns `200`, and returns `false` otherwise. NO
  `electron`/`dom`, NO `apps/studio/server` import. The Electron sidecar (`backend-entry.ts`) then mounts
  this alongside `chat-sse-mount` (operator-attested wiring, not CI).

Rules:

- **Clear the guard, start no session** — the route is a recovery valve; it holds no signing key, starts no
  session, opens no PR (ADR-0091). Read/control only.
- **Sibling dispatcher, fall through** — mount alongside `chat-sse-mount`; return `false` for any other
  path (`bcr-falls-through-not-404s`).
- **Electron-free core** — no `electron`/`dom`/`apps/studio/server` import; the sidecar wiring is the
  operator-attested binding.
- **Stretch / held-by-default** — this lands separately from the thin-client caps; the story's UAT does not
  require it.
