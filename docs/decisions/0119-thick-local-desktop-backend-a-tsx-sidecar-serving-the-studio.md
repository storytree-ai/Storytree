---
status: accepted
decided: 2026-06-27
amends: [113]
load_bearing: true
---
# ADR-0119: Thick-local desktop backend: a tsx sidecar serving the studio's boot read route table

## Status

accepted (2026-06-27) — decided/directed by the owner in conversation while attempting to wire and test
the thick-local desktop (ADR-0113). Two integration findings surfaced when the `local-backend-boot`
factory met the real Electron shell + the real studio frontend; the owner directed they be landed as a
decision before chipping a fresh build session. Design-time alignment IS the ratification (ADR-0110).
The desktop's APPEARANCE / "feels like one app" remains operator-attested (ADR-0070).

## Context

ADR-0113 made the inner-circle desktop a **thick client**: the Electron main process serves a local
backend on `127.0.0.1` `/api/*`, re-composing the shared organism drivers (`@storytree/drive` +
`@storytree/orchestrator` + `@storytree/library/store`) rather than importing `apps/studio/server`
(the forbidden surface→surface coupling). `local-backend-boot` (PR #394) built the provable CORE of
that: `apps/desktop/src/backend/local-backend.ts` — a `createLocalBackend(deps)` FACTORY returning an
`/api/*` handler, headlessly proven by `node:test` against stubs. What it did **not** build is the part
that cannot be unit-tested: the Electron main actually RUNNING the drivers and serving the studio. Two
hard constraints emerged when wiring that:

1. **The Electron main cannot host the raw-TS drive machinery in-process.** `apps/desktop` builds the
   main with `esbuild … --format=cjs` and runs `dist/main.cjs` under Electron's plain Node — **no
   `tsx`**. `devApi.ts` reaches the drivers via lazy dynamic `import()` (needs a TS loader at runtime);
   the desktop main has none. Bundling the drivers INTO the main was tested directly: esbuild
   "succeeds" but silently empties **`import.meta.url`** (corpus paths in `load-corpus.ts`, `schema.sql`
   in `migrate.ts`) and **`import.meta.resolve("tsx")`** (`resolve-prove-spec.ts` — the build path's own
   tsx resolution) under CJS. A bundled-in-main backend is therefore quietly broken on the read AND
   build paths. (Native deps — `pg`, `cloud-sql-connector`, the SDK — compound this.)

2. **The minimal route table cannot render the studio.** `createLocalBackend` serves only
   `health`/`tree`/`assets`/`build` (ADR-0113's "minimal-to-journey"; the story DEFERRED "verbatim
   studio route-table sharing"). But the studio frontend **boot-gates on `/api/me`** (`App.tsx`:
   `meStatus` must reach `ready` with `member: true`, else the corpus never loads and the forest never
   renders) and its initial load is `Promise.all([/api/docs, /api/assets, /api/comments])` (ANY `404`
   rejects the whole load → an error screen, not the forest). So against the minimal table the studio
   shows an access/error screen — UAT leg 3 ("a real envelope, not the 503") is met, but the app does
   not actually come up. The deferred "minimal table" assumption was too minimal to render the surface
   it serves.

## Decision

1. **The desktop runs the drive machinery as a `tsx` SIDECAR, not bundled into the Electron main.**
   The main process spawns a child Node process via `tsx` (the trusted member has the toolchain,
   ADR-0113 §7) that hosts the re-composed backend (`createLocalBackend` + the read router below) and
   listens on a `127.0.0.1` port; the main's `static-server.ts` PROXIES `/api/*` to that port in place
   of the 503 stub, and reaps the child on app quit. Spawn via the Electron binary in Node mode
   (`ELECTRON_RUN_AS_NODE=1`, `--import tsx`) so no separate `node` on PATH is assumed. The agent
   boundary (ADR-0004 / ADR-0113 §2) is preserved by topology: the sidecar is a Node process the main
   owns on the member's machine; the renderer still never imports `@storytree/agent`. This is the
   honest realization of ADR-0113 §1 "the Electron main process serves a local backend" — *serves via a
   sidecar it owns*, because the raw-TS drivers + the build path's `import.meta.resolve("tsx")` cannot
   live in a bundled CJS main.

2. **The desktop backend serves the studio's BOOT read route table**, re-composed from the drivers
   (NOT imported from `apps/studio/server`). Concretely the set the frontend needs to render and that
   the desktop can honestly answer: `me` (a local member identity — the operator IS the member/admin on
   their own machine, the `DEV_ME`-equivalent the open dev posture already uses, `apiRouter.ts`),
   `health`, `docs` (read from the member's checkout), `tree`, `assets`, `comments`. This **revisits the
   story's deferred "verbatim route-table sharing"** (ADR-0113 / the story's "Local-backend boundary
   call") — that decision is **superseded in part**: the desktop serves the boot READ set, not just
   health/tree/assets. The boundary call is UNCHANGED — the desktop OWNS a read router that re-composes
   the organism drivers exactly as `devApi.ts` does; it never imports the studio server. Build / adopt /
   chat-SSE routes are NOT in this decision — they layer on later (the credential-bridge-gated build
   path, ADR-0113 §5; the consumed chat-session-stream SSE, ADR-0108 Phase 2).

3. **Structure the work so the green flips easily (owner directive).** The read router is **headlessly
   provable** — a `node:test` integration test against the real composition over an `InMemoryStore` seed
   (the `createLocalBackend` precedent), asserting `me`/`health`/`docs`/`tree`/`assets`/`comments` return
   real envelopes — so its CI-honest core greens under the spine like any capability. The thin remainder
   — the Electron main spawning the sidecar + the `/api/*` proxy + the real pg/`tsx` wiring — is the
   **operator-attested** integration leg (UAT legs 3 + 7, ADR-0070): an automated run cannot drive a
   native shell. Splitting the build this way (provable router unit ▸ attested sidecar wiring) is what
   makes "flip it green" a small, testable step rather than one un-testable lump.

4. **Brownfield, owner will not trigger UI builds for this.** With many upstream nodes still
   proposed/brown (owner is flipping them green), the desktop wiring is built as brownfield work the
   owner TESTS (the app renders the live forest), not gated behind a subscription-billed UI build. The
   build/credential path stays a later increment.

## Consequences

**Good**
- A working, testable thick desktop: launch → the live shared forest renders in the native shell (reads
  over the sidecar), the honest goal of ADR-0113 — instead of an access/error screen.
- The sidecar runs the drivers in their native habitat (raw TS, real `import.meta`, free to spawn
  git/pnpm/tsx/worktrees for the later build path) — no bundling fight with native deps.
- The provable read router flips green headlessly; only the genuinely un-testable Electron integration
  is operator-attested, so "green" is a small step.

**Bad / accepted costs**
- A second process to manage (spawn, port handshake, lifecycle/reap, proxy) — more moving parts than an
  in-main server, justified because in-main is not viable (finding 1).
- The desktop read router re-implements a slice of the studio's read handlers (`me`/`docs`/`comments` on
  top of `health`/`tree`/`assets`). Extracting a SHARED read-route organism both surfaces mount is the
  clean consolidation — explicitly a follow-on (it would touch the `studio` story), not pulled in here,
  to keep the desktop slice small. The duplication is the accepted cost of not blocking on that.

**Neutral**
- Build / adopt / chat-SSE routes remain deferred; this decision is the READ loop + how it runs.
- If packaging later hardens past dev-mode (ADR-0113 §7), the sidecar can be precompiled; the topology
  (main ▸ owned backend process ▸ proxy) is unchanged.

## References

- [ADR-0113](0113-thick-local-desktop-for-the-inner-circle-the-drive-machinery.md) — the thick-local
  desktop; **amended** (§1 "the main serves a local backend" realized as a tsx sidecar; the story's
  deferred minimal route table superseded in part by the boot read set). Its boundary call (re-compose
  the drivers, never import the studio server) STANDS.
- [ADR-0004](0004-orchestrator-agent-boundary.md) — the agent boundary; preserved by topology (the
  sidecar is a main-owned Node process; the renderer never crosses it).
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the sidecar-spawn +
  proxy + "feels like one app" are operator-attested; the read router is machine-witnessed.
- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) — the chat-SSE route
  (Phase 2) layers on this read loop later.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — owner-directed → born accepted.
- `apps/desktop/electron/{main,static-server}.ts`, `apps/desktop/src/backend/local-backend.ts` — the
  shell + the proven factory this wiring runs.
