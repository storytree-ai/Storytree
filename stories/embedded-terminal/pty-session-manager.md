---
id: "pty-session-manager"
tier: capability
story: embedded-terminal
title: "The Electron-main pty lifecycle manager — spawn / write / resize / dispose / route-data over an injected pty factory"
outcome: "The Electron-main pty session manager spawns a pseudo-terminal, routes its output to the session's data sink, forwards typed input and resize to the addressed session, disposes it on request or on the pty's own exit, isolates concurrent sessions, and fails closed on an unknown or already-disposed session id — all over an INJECTED pty factory, so the whole lifecycle is proven headlessly with no native module and no Electron."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors a
# node:test that imports a NOT-YET-EXISTING symbol (`PtySessionManager` + the `PtyPort` seam) from a NEW
# source file under apps/desktop/src/backend/ (red = module-not-found against the source that does not
# exist at HEAD), then writes that one new source file (green). The module is a DEEP module (deep-modules
# principle): a narrow surface (create / write / resize / dispose + a data sink) over a large hidden
# lifecycle, driven entirely through an INJECTED `PtyPort` factory — the KeychainPort ↔ CredentialBroker
# ↔ InMemoryKeychain pattern the desktop credential broker already uses. The test injects a FAKE pty (a
# port double that records write/resize/kill and can EMIT data/exit on command) — so the spawn → I/O →
# resize → dispose cycle is proven with ZERO real node-pty (a native module) and ZERO Electron. The real
# node-pty adapter + the ipcMain handlers + webContents.send are OPERATOR-ATTESTED GLUE in the Electron
# main (story "Operator-attested glue"), NOT this cap. `install: true` + a typecheck wall because the
# --real proof runs in a FRESH worktree (tsx + tsc need the lockfile-only install, ADR-0031 §2). Single
# LITERAL source file (no `*`), so the default node:test proof on the one test file is legal — no
# `proofCommand` (mirrors chat-sse-mount, the sibling apps/desktop node:test cap). SCOPE = apps/desktop
# (the manager lives in apps/desktop/src/backend/), NOT packages/*. The module imports node-pty NOWHERE
# — node-pty is reached only through the injected PtyPort, whose REAL adapter is glue — so this cap
# declares NO `addDeps` (and could not: resolveAddDepsGroup targets packages/*, never apps/*).
#
# RE-PROVE (ADR-0057 §3 expansion C): pty-session-manager.ts + its test ALREADY EXIST at HEAD (signed by
# the original story build) — this arm is driven `editsExisting` for app-owned session survival
# (terminal-orchestrator-seat increment 1, owner-directed 2026-07-12, ADR-0189): contract 6 (a main-held
# per-session SCROLLBACK ring buffer — every chunk routed to a live session is also appended to that
# session's buffer, capped in bytes, oldest-trimmed — plus `snapshot(sessionId)` returning the buffered
# output, null fail-closed on an unknown/disposed id) and contract 7 (`list()` — enumerate the live
# sessions, id + spawn cwd, creation order, disposed/exited sessions dropped). Together they are the
# re-attach affordance: a re-mounting renderer dock can enumerate still-live sessions and replay their
# scrollback, so a route change no longer kills terminals (ownership moves dock-lifetime → app-lifetime).
# The leaf reads the existing source + 5 tests, ADDS the 6th + 7th tests (behaviour-assertion reds: the
# manager at HEAD has no snapshot()/list()), then EDITS pty-session-manager.ts additively — NOT a
# net-new missing-symbol red. Preserves the existing create/write/resize/dispose/isolation/fail-closed
# behaviour + the 5 existing contracts and their EXACT test titles (every test title leads with its
# contract id — check:coverage matches titles, ADR-0122).
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/pty-session-manager.test.ts"
    sourceFile: "apps/desktop/src/backend/pty-session-manager.ts"
    editsExisting: true
    scope:
      testGlobs: ["apps/desktop/src/backend/pty-session-manager.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/pty-session-manager.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# The Electron-main pty lifecycle manager — spawn / write / resize / dispose / route-data over an injected pty factory

**Outcome —** The Electron-main pty session manager **spawns** a pseudo-terminal, **routes** its output
to the session's data sink, **forwards** typed input and resize to the addressed session, **disposes** it
on request or on the pty's own exit, **isolates** concurrent sessions, and **fails closed** on an unknown
or already-disposed session id — all over an **INJECTED pty factory**, so the whole lifecycle is proven
headlessly with no native module and no Electron.

**Depends on —** nothing (within `embedded-terminal`). It is a self-contained Electron-main module over
an injected `PtyPort`. The renderer [`terminal-dock-panel`](terminal-dock-panel.md) sits on the OTHER
side of the `desktopTerminal` contextBridge and imports nothing from this module — they share the bridge
WIRE SHAPE as a cross-boundary contract, not a code edge (the `chat-sse-mount` ↔ `chat-panel`
precedent), so there is no in-story edge either way.

> **Proof status (honest) — BUILT & SIGNED (contracts 1–5), now RE-DRIVEN for app-owned session
> survival (contracts 6–7).** Contracts 1–5 landed under the original story build's signed `--real`
> verdict — the pty **lifecycle** the Electron main drives (spawn, stream, resize, clean up per
> session). Contracts 6–7 (the main-held scrollback ring + `snapshot`, and the live-session `list`) are
> the ADR-0189 re-drive: sessions are APP-owned, not dock-owned — a re-mounting renderer re-attaches to
> still-live sessions and replays their buffered output, so a route change never kills a terminal. The
> REAL node-pty binding (the concrete adapter, the `ipcMain.handle("terminal:*")` handlers, the
> `webContents.send("terminal:data"/"terminal:exit")` stream, and the repo-scoped `terminal:list` /
> `terminal:snapshot` re-attach IPC) is the operator-attested GLUE in `apps/desktop/electron/main.ts`
> (the story's "Operator-attested glue" — a `node:test` that spawned a real native pty or drove a real
> Electron window would be the live-native trap); THIS capability is the lifecycle manager the glue
> drives, proven offline against a fake pty.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the PTY LIFECYCLE AS A WHOLE — a manager
that, over an injected `PtyPort`, answers `create(opts)` by spawning a pty handle, WIRES the handle's
`onData` to the session's registered sink and its `onExit` to teardown, forwards `write` / `resize` to
the addressed session's handle, and `dispose`s (kills + frees the id) — tracking MULTIPLE independent
sessions and failing closed on an unknown/disposed id. It spans spawn AND the bidirectional I/O routing
AND resize AND teardown AND multi-session isolation — an integration test of the lifecycle over a fake
pty, not a single isolated assertion.

WHY THIS IS A SEPARATE CAPABILITY FROM `terminal-dock-panel` (the splitting-rule, ADR-0010): the two sit
on OPPOSITE sides of the `desktopTerminal` contextBridge and prove DIFFERENT observables in DIFFERENT
suites. THIS proves the BACKEND — the Electron-main pty lifecycle (proof scope `apps/desktop`,
`node:test`, a fake pty). `terminal-dock-panel` proves the FRONTEND — the renderer xterm dock (proof
scope `apps/studio/src`, vitest jsdom, a mocked xterm + bridge). They share the bridge wire shape
(`spawn` / `write` / `resize` / `dispose` / `onData` / `onExit`) as a CONTRACT across the boundary, not a
code edge: the panel never imports the manager, the manager never imports the panel. Distinct surface,
distinct suite, distinct isolatable net-new red→green — exactly the `chat-sse-mount` (desktop) ↔
`chat-panel` (studio) split, here inside one story.

THE DEEP-MODULE SHAPE (deep-modules principle — a narrow surface over a large hidden lifecycle). Model
the pty as a NARROW injected port and the manager as the deep module over it (the `KeychainPort` ↔
`CredentialBroker` ↔ `InMemoryKeychain` pattern the desktop credential broker already uses):

- **`PtyPort`** — the narrow seam the manager reaches the pty through (the real `node-pty` adapter and
  the test fake both implement it), e.g.:
  - `spawn(opts: { shell?: string; cwd?: string; cols: number; rows: number; env?: Record<string,string> }): PtyHandle`
  - `PtyHandle`: `onData(cb: (chunk: string) => void): void` · `onExit(cb: (e: { exitCode: number }) => void): void`
    · `write(data: string): void` · `resize(cols: number, rows: number): void` · `kill(): void`
- **`PtySessionManager`** — the deep module OVER an injected `PtyPort`, e.g.:
  - `create(opts, onData, onExit): sessionId` — spawn via the port, register the session, wire the
    handle's `onData` → `onData(sessionId, chunk)` and `onExit` → teardown + `onExit(sessionId, e)`.
  - `write(sessionId, data)` · `resize(sessionId, cols, rows)` · `dispose(sessionId)` — forward to /
    tear down the addressed session; a typed no-op/`false` (never a throw) for an unknown/disposed id.
  - `has(sessionId)` / a session count — the isolation + teardown observable.
  - `snapshot(sessionId): string | null` — the session's buffered scrollback (the ring, ADR-0189);
    `null` (fail-closed, never a throw) for an unknown/disposed id.
  - `list(): Array<{ sessionId, cwd }>` — the live sessions (id + spawn cwd, creation order); a
    disposed or self-exited session drops out.

  The deletion test earns the boundary (deep-modules): delete the manager and the spawn/route/resize/
  teardown/isolation/fail-closed complexity reappears at the single ipcMain call site — it hides real
  lifecycle work behind a small surface, so it is a capability, not a pass-through.

THE INJECTED FAKE PTY IS THE ONLY SEAM (the SAME discipline `broker.test.ts` uses with `InMemoryKeychain`).
The test constructs a fake `PtyPort` whose `spawn` returns a fake handle that RECORDS `write` / `resize` /
`kill` calls and can be commanded to EMIT `onData` chunks and an `onExit` — so the manager's routing,
forwarding, teardown, and isolation are all observable deterministically with NO real node-pty and NO
Electron. No native module, no child process, no window, no DB, no network.

ELECTRON-FREE, PTY-NATIVE-FREE CORE (the standalone-resilient-library shape, mirroring `broker.ts` /
`chat-sse-mount.ts`): the module lives under `apps/desktop/src/backend/` with NO `electron` import and NO
`node-pty` import (node-pty is reached ONLY through the injected `PtyPort`, whose real adapter is glue in
the Electron main). So `node:test` drives the whole lifecycle headlessly. The Electron main
(`main.ts`) is the thin operator-attested binding that injects the real `node-pty` adapter and mounts the
`terminal:*` ipc handlers + the `webContents.send` stream (witnessed under the Story UAT legs 4–5, not
asserted in CI).

FAIL CLOSED, NEVER CRASH (the load-bearing safety observable): `write` / `resize` / `dispose` on an
unknown or already-disposed session id is a typed no-op / `false` — NEVER a throw that would crash the
Electron main (which has no per-call try/catch around an ipc handler). A disposed session's late pty
`onData` (a race after `kill`) is dropped, not routed to a freed sink. This is the pty analogue of the
broker's safety boundary — the reason the lifecycle is a manager, not raw calls at the ipc site.

THE MAIN-HELD SCROLLBACK RING (contract 6 — ADR-0189 app-owned sessions). Sessions outlive the renderer
dock (a route change unmounts it), so the MANAGER — not the renderer — must hold each session's recent
output: every chunk routed to a live session's sink is ALSO appended to that session's ring buffer, a
per-session chunk list capped in TOTAL BYTES (generous — the default sized for several thousand lines;
injectable via a constructor option, e.g. `new PtySessionManager(port, { scrollbackBytes })`, so the test
pins the trim with a tiny cap). When the cap is exceeded the OLDEST chunks are trimmed first (the newest
chunk always survives). `snapshot(sessionId)` returns the concatenated buffered output — what a
re-attaching renderer replays into a fresh xterm; on an unknown/disposed id it returns `null`
(fail-closed, never a throw). `dispose` and the pty's own exit free the buffer with the session (a
dropped post-dispose chunk is never buffered either). Plain in-memory state — no fs, no DB.

LIST THE LIVE SESSIONS (contract 7 — the re-attach enumeration). `list()` returns the live sessions —
`{ sessionId, cwd }` (the `cwd` the session was spawned with, `null` when the spawn opts carried none) —
in creation order; a disposed or self-exited session drops out. The cwd is WHY the entry carries it: the
Electron-main glue scopes re-attach PER REPO (`terminal:list` filters to the currently-selected repo's
cwd, ADR-0189), but that policy lives in the GLUE — the manager just reports facts (lifecycle only, no
policy).

## Integration test

**Goal —** Prove that the pty session manager, over an injected fake `PtyPort`, spawns a session and
routes its data to the session's sink, forwards input and resize to the addressed session, disposes it on
request and on the pty's own exit, isolates concurrent sessions, and fails closed on an unknown/disposed
id — entirely in-process: no real node-pty, no Electron, no DB, no network.

The integration test exercises this capability against its **real collaborator shape** — a fake
`PtyPort` double that records `write`/`resize`/`kill` and can emit `onData`/`onExit` on command, exactly
as `broker.test.ts` exercises `CredentialBroker` over `InMemoryKeychain`. No stubs within the manager's
own logic (the registry, the routing, the teardown are all real).

The integration test would:

1. Construct a `PtySessionManager` over a fake `PtyPort` whose `spawn` returns a recording fake handle.
   `create(opts, onData, onExit)` → assert `spawn` was called once with the opts (cols/rows/cwd) and a
   session id came back.
2. Command the fake handle to emit two `onData` chunks → assert the manager delivered each to `onData`
   tagged with THIS session's id, in order — the pty output routing.
3. `write(sessionId, "ls\n")` and `resize(sessionId, 120, 40)` → assert the fake handle recorded the
   write and the resize (the input + geometry forwarding to the addressed session).
4. `dispose(sessionId)` → assert the fake handle's `kill` was called, the session id is freed (`has` →
   false), and a subsequent `onData` from that (killed) handle is NOT routed — teardown + no
   late-delivery.
5. Spawn a SECOND session; drive data/input/dispose against each → assert each op targets ONLY its own
   handle (session A's write never reaches B; disposing A leaves B live and routing) — multi-session
   isolation.
6. Command the fake handle to emit `onExit` (the pty died on its own) → assert the manager tore the
   session down (freed the id, notified `onExit`) WITHOUT a double-kill and without leaking the sink —
   the pty-initiated teardown path.
7. `write` / `resize` / `dispose` on an unknown id, and again on an already-disposed id → assert each is
   a typed no-op / `false` and NEVER throws — the fail-closed safety boundary.
8. Command the fake handle to emit chunks with a TINY byte cap injected → assert `snapshot` returns the
   buffered output, the ring trims oldest-first past the cap, and `snapshot` on an unknown/disposed id
   is `null` — the main-held scrollback ring.
9. `list()` with two live sessions (distinct cwds) → assert both entries (id + cwd, creation order);
   dispose one / exit the other → assert each drops out — the re-attach enumeration.

## Contracts (7)

The test-proven leaf behaviours — each **one isolated automated test** in the `desktop` suite
(`node:test`, `apps/desktop/src/backend/pty-session-manager.test.ts`), the pty injected as a fake
`PtyPort`. Contracts 1–5 are BUILT (the original story build's signed verdict); contracts 6–7 are the
ADR-0189 app-owned-session re-drive (the scrollback ring + the live-session enumeration), added in this
`editsExisting` re-prove (author their tests against the existing 5, do NOT drop or retitle them). Per
ADR-0122 (`storytree coverage`), each contract id is the lead of a distinctly-named test, so `storytree
coverage pty-session-manager` reports 7/7.

1. **`psm-spawns-and-routes-data`** — create() spawns via the injected port and routes pty output to the session sink
   - **asserts —** `create(opts, onData, onExit)` calls the injected `PtyPort.spawn` exactly once with
     the opts and returns a session id; each `onData` chunk the fake handle emits is delivered to the
     session's `onData` sink, tagged with that session id, in order — the spawn + output-routing core.
   - **covers —** `apps/desktop/src/backend/pty-session-manager.ts` (create + spawn + data routing) *(provisional path)*
2. **`psm-forwards-input-and-resize`** — write()/resize() forward to the addressed session's handle
   - **asserts —** `write(sessionId, data)` and `resize(sessionId, cols, rows)` forward to THAT session's
     fake handle (the handle records the exact bytes / the exact cols×rows) — the input + geometry
     forwarding.
   - **covers —** `apps/desktop/src/backend/pty-session-manager.ts` (write + resize forwarding) *(provisional path)*
3. **`psm-disposes-and-tears-down`** — dispose() and pty exit kill the handle, free the id, and stop routing
   - **asserts —** `dispose(sessionId)` kills the fake handle, frees the id (`has` → false), and a
     post-dispose `onData` from that handle is NOT routed; AND a pty-initiated `onExit` tears the session
     down (frees the id, notifies `onExit`) without a double-kill — both teardown paths, no late delivery.
   - **covers —** `apps/desktop/src/backend/pty-session-manager.ts` (dispose + onExit teardown) *(provisional path)*
4. **`psm-isolates-multiple-sessions`** — concurrent sessions are tracked independently
   - **asserts —** with two live sessions, data/input/dispose target ONLY the addressed session (A's
     write never reaches B; A's data routes only to A's sink; disposing A leaves B live and still
     routing) — multi-session isolation.
   - **covers —** `apps/desktop/src/backend/pty-session-manager.ts` (the per-id session registry) *(provisional path)*
5. **`psm-fails-closed-on-unknown-session`** — write/resize/dispose on an unknown/disposed id is a typed no-op, never a throw
   - **asserts —** `write` / `resize` / `dispose` on an unknown id, and on an already-disposed id, each
     return a typed no-op / `false` and NEVER throw — so a stray ipc call can never crash the Electron
     main; a late `onData` after `kill` is dropped, not routed to a freed sink.
   - **covers —** `apps/desktop/src/backend/pty-session-manager.ts` (the fail-closed guards) *(provisional path)*
6. **`psm-buffers-scrollback-and-snapshots`** — every routed chunk is buffered in a byte-capped ring; snapshot() returns it, fail-closed
   - **asserts —** each chunk the fake handle emits for a live session is appended to that session's
     main-held ring buffer AND still routed to the sink; `snapshot(sessionId)` returns the concatenated
     buffered output; with a tiny `scrollbackBytes` cap injected via the constructor, the ring trims the
     OLDEST chunks first once the cap is exceeded (the newest chunk always survives); `snapshot` on an
     unknown or disposed id returns `null` (never a throw), and `dispose` frees the buffer with the
     session — the scrollback a re-attaching renderer replays (ADR-0189).
   - **covers —** `apps/desktop/src/backend/pty-session-manager.ts` (the per-session scrollback ring + snapshot) *(provisional path)*
7. **`psm-lists-live-sessions`** — list() enumerates live sessions (id + spawn cwd, creation order); disposed/exited drop out
   - **asserts —** with two sessions created (distinct `cwd` opts), `list()` returns both entries —
     `{ sessionId, cwd }`, in creation order, `cwd` as spawned (`null` when the opts carried none);
     after `dispose`ing one and emitting the other's own `onExit`, each drops out of `list()` — the
     re-attach enumeration the glue scopes per repo (ADR-0189).
   - **covers —** `apps/desktop/src/backend/pty-session-manager.ts` (the live-session enumeration) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

> **Historical (contracts 1–5).** This section describes the ORIGINAL net-new build that signed
> contracts 1–5. Contracts 6–7 are NOT net-new — they re-prove the existing source via `editsExisting`
> (the red is a behaviour-assertion failure: the manager at HEAD has no `snapshot()`/`list()`; the brief
> in the frontmatter comment governs it). Kept as the net-new history of this cap; do not read the
> "module-not-found" red below as the current build's red.

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the pty session manager as
a new module, test-first.

- **The new test —** `apps/desktop/src/backend/pty-session-manager.test.ts` (`node:test` +
  `node:assert/strict`, the package convention — a fake `PtyPort` double, NO Electron / node-pty / DB /
  network, exactly as `broker.test.ts` drives `InMemoryKeychain`). Import `{ PtySessionManager }` (and
  the `PtyPort` type) from `"./pty-session-manager.js"`. Name each test for its contract id (`psm-…`) so
  `storytree coverage pty-session-manager` reports 5/5 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `pty-session-manager.ts` does not exist at HEAD, so the test fails module-not-found (the net-new
  missing-symbol red, ADR-0057). Assert spawn+routing, input+resize forwarding, both teardown paths,
  multi-session isolation, and the fail-closed guards.
- **The GREEN —** write `apps/desktop/src/backend/pty-session-manager.ts`: the `PtyPort` /
  `PtyHandle` interfaces and the `PtySessionManager` class holding a per-id session registry, wiring each
  spawned handle's `onData`/`onExit`, forwarding `write`/`resize`, tearing down on `dispose`/exit, and
  guarding unknown/disposed ids as typed no-ops. NO `electron`, NO `node-pty` import (both are reached
  only through the injected port / the operator-attested glue). The import resolves, the assertions hold,
  and `pnpm --filter desktop test` + `pnpm --filter desktop typecheck` stay green.

Rules:

- **Injected `PtyPort` only — never import `node-pty` here** (the real adapter is glue in the Electron
  main). The module's only pty seam is the injected port, so `node:test` drives it with a fake and no
  native module ever loads at test time.
- **Electron-free core** — no `electron`/`dom` import; the ipc handlers + `webContents.send` stream are
  the operator-attested binding in `main.ts`, witnessed under the Story UAT, not asserted here.
- **Fail closed, never crash** — an op on an unknown/disposed id is a typed no-op/`false`, never a throw;
  a late `onData` after teardown is dropped. The test pins this (`psm-fails-closed-on-unknown-session`).
- **Deep module, narrow surface** — hide the spawn/route/resize/teardown/isolation lifecycle behind
  create/write/resize/dispose + a data sink (deep-modules); the deletion test earns the boundary.
- **Lifecycle only, no policy (slow growth)** — this manages pty SESSIONS. It does NOT compose the build
  command to inject (the ADR-0174 map-spawn re-point is a separate follow-on), does NOT sign / build /
  open a PR (it is the interactive surface, never the prove-it-gate leaf, ADR-0004 / ADR-0091), and does
  NOT reach cloud/web terminals (DEFERRED, ADR-0174). One local pty lifecycle, nothing more.
