---
id: "boot-read-routes"
tier: capability
story: desktop
title: "The local backend serves the studio's BOOT read route table — me/docs/comments — re-composed from the organism drivers"
outcome: "The local backend adds the studio's remaining boot READ routes — `me` (a local member identity), `docs` (read from the member's checkout), and `comments` (over an injected store seam) — re-composed from the organism drivers and never importing `apps/studio/server`, so the studio frontend boots and renders the forest instead of an access/error screen."
status: proposed
proof_mode: integration-test
depends_on: [local-backend-boot]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors an
# integration test that imports a NOT-YET-EXISTING symbol from a NEW source file under apps/desktop/src
# (red = module-not-found against the source that does not exist at HEAD), then writes that one new
# source file (green). The new module adds the boot READ routes (me/docs/comments) the studio frontend
# boot-gates on (ADR-0119 §2) — a read-only FS walk of the member's `docs/` for the docs route + an
# injected store seam for comments + a constant local-member identity for me — behind a node:http
# dispatcher, with NO `electron`/`dom` import and NO `apps/studio/server` import (the surface boundary,
# sibling to local-backend.ts — the operator-attested Electron main delegates to it). `install: true` +
# a typecheck wall because the module imports VALUE functions across the package boundary (the proof
# runs in a fresh worktree — tsx + tsc need the lockfile-only install, ADR-0031 §2). Single LITERAL
# source file (no `*`), so the default node:test proof on the one test file is legal — no `proofCommand`.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/boot-read-routes.test.ts"
    sourceFile: "apps/desktop/src/backend/boot-read-routes.ts"
    scope:
      testGlobs: ["apps/desktop/src/backend/boot-read-routes.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/boot-read-routes.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# The local backend serves the studio's BOOT read route table — me/docs/comments

**Outcome —** The local backend adds the studio's remaining boot READ routes — `me` (a local member
identity), `docs` (read from the member's checkout), and `comments` (over an injected store seam) —
re-composed from the organism drivers and never importing `apps/studio/server`, so the studio frontend
boots and renders the forest instead of an access/error screen.

**Depends on —**
- [`local-backend-boot`](local-backend-boot.md) — it EXTENDS the backend that capability stood up. The
  Electron main mounts BOTH dispatchers on `/api/*` (this one first, then the `local-backend-boot`
  handler, then a 404 fall-through), so this module couples to the same `/api/*` request surface and
  the same re-compose-not-import boundary the keystone established.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. It is the realization of
> **ADR-0119 §2** ("the desktop backend serves the studio's BOOT read route table"): `local-backend-boot`
> (PR #394) stood up `health`/`tree`/`assets`/`build` — the "minimal-to-journey" set ADR-0113 deferred
> the rest of. But the studio frontend (`apps/studio/src/App.tsx`) **boot-gates on `/api/me`** (its
> `meStatus` must reach `ready` with `member: true`, else the corpus never loads) and its initial load is
> `Promise.all([/api/docs, /api/assets, /api/comments])` (ANY `404` rejects the whole load → an error
> screen, not the forest). So against the minimal table the studio shows an access/error screen and the
> app never actually comes up (ADR-0119 finding 2). This capability adds the three MISSING boot read
> routes so the studio boots. The shapes it answers already exist and are real: the studio's `DEV_ME`
> (`apiRouter.ts`), `listDocs()`'s `DocMeta` walk of `<repo>/docs` (`apiRouter.ts`), and the comment
> store's `list(filter)` (`@storytree/library/store`'s `PgCommentStore`).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the boot read SET AS A WHOLE — a
`node:http` dispatcher that, mounted on `/api/*`, answers `me`/`docs`/`comments` with real envelope
bodies (a constant identity, a real read-only FS walk of a seeded `docs/` dir, and an injected store
read) AND falls through (returns `false`) for everything else so the caller's 404 still fires. It spans
the dispatcher AND the FS-walk producing the docs body AND the injected comments seam, so it is an
integration test against the real filesystem read over a seeded temp dir, not a single isolated
assertion.

WHY THIS IS A SEPARATE CAPABILITY FROM `local-backend-boot` (the splitting-rule, ADR-0010): the two
share a precondition (a mounted `/api/*` dispatcher) but prove DIFFERENT observables. `local-backend-boot`
proves "the minimal table serves real envelopes instead of the 503 stub" — its journey ends when
`health`/`tree`/`assets`/`build` answer. THIS proves "the studio's boot gate is satisfied" — its journey
ends when the frontend's `/api/me` + `Promise.all([docs, assets, comments])` no longer rejects. The
`local-backend-boot` test already serves `assets`; this one adds the two it does not (`me`, `docs`) plus
`comments`, so the boot set is complete. They are authored as siblings (two source files under
`apps/desktop/src/backend/`, two dispatchers the Electron main mounts in sequence) precisely so the
keystone's green is not re-opened to add these routes.

RE-COMPOSE THE ORGANISM DRIVERS / THE FILESYSTEM, NEVER IMPORT THE STUDIO (the boundary call, see the
story's "Local-backend boundary call" + the ADR-0119 update callout). It does NOT import
`apps/studio/server` — that is the forbidden surface→surface coupling (`static-server.ts` says so;
`studio` is `private` with no server export; `check:boundaries` enforces it). The studio's `listDocs()`
is a dependency-free read of `<repo>/docs` over `node:fs` — this module REPRODUCES that read-only walk
(it does not import it), exactly as `local-backend.ts` reproduces the studio's HTTP helpers rather than
importing them. `me` is a CONSTANT (no driver needed — the operator IS member+admin on their own
machine). `comments` reads through an INJECTED seam (`@storytree/library/store`'s `PgCommentStore.list`
in production; a stub in the test) — the module never names the store directly, so the CI-provable core
touches no DB.

THE THREE ROUTES + THEIR EXACT ENVELOPES (pin these — the leaf authors to them, the Electron main wires
to them, and the studio frontend parses them):
- **`GET /api/me`** → a BARE OBJECT, the local-member identity. The operator IS member+admin on their own
  machine (the open-dev posture the studio's `DEV_ME` already uses, `apiRouter.ts`). Export a constant
  `LOCAL_ME` mirroring `DEV_ME`'s shape: `{ email: null, role: "admin", status: "active", member: true,
  canWakeDb: false }`. Define the `LocalMe` / `MeInfo` interface LOCALLY (do not import the studio's).
- **`GET /api/docs`** → a BARE ARRAY of `DocMeta` (`{ id, title, group, excerpt, status?, decided? }`),
  from a read-only walk of the member's checkout `docs/` dir. ALGORITHM (reproduce `apiRouter.ts`
  `listDocs()` — do NOT import): recurse for `.md`; `id` = relpath under `docsDir` (POSIX-joined);
  `title` = first H1 (`/^#\s+(.+)$/m`, fallback the filename without `.md`); `group` = `"Decisions"` if
  the relpath starts with `decisions/` else `"Reference"`; `excerpt` = the first prose line/sentence
  after the title; `status`/`decided` parsed from the leading YAML frontmatter block (status one of
  proposed/accepted/superseded; the optional `decided` date) for **Decisions** docs only. A MISSING
  `docsDir` returns `[]` (never throws) — the test drives both a seeded dir AND a missing dir.
- **`GET /api/comments`** → a BARE ARRAY, from the injected `listComments` seam. Parse the optional
  `topicId` / `topicKind` from the query string and pass them as the filter (`PgCommentStore.list`'s
  shape); the studio frontend's boot load calls it with no filter, so the no-filter path is the boot path.

CRITICAL ENVELOPE SHAPES (the studio frontend parses these EXACTLY): `/api/me` is a **bare object**;
`/api/docs` and `/api/comments` are **bare arrays** (NOT `{ docs: [...] }` / `{ comments: [...] }`) —
mirroring the studio's `sendJson(res, 200, await listDocs(...))` and `sendJson(res, 200, await
backend.listComments(filter))`. A wrong envelope (a wrapping object) reads to the frontend as malformed
and is the exact "boots to an error screen" failure this capability exists to remove.

THE DISPATCHER FALLS THROUGH, IT DOES NOT 404 ITSELF: `createBootReadRoutes(deps)` returns an async
handler `(req, res, pathname) => Promise<boolean>` that returns `true` when it handled the path and
`false` otherwise — so the Electron main can mount it BEFORE the `local-backend-boot` handler and let an
unhandled path fall through to that handler's existing 404. (This is why the test mounts it behind a
wrapper that sends a 404 when it returns `false` — the deletion test that proves the dispatcher is real,
not a catch-all.)

THE CI-PROVABLE CORE IS ELECTRON-FREE (the standalone-resilient-library shape, mirroring
`local-backend.ts` + `src/credential/`): the module lives under `apps/desktop/src/backend/` with NO
`electron` and NO `dom` import, so `node:test` can drive it headlessly over a real `node:http` server.
The Electron `main.ts` is the thin operator-attested binding that mounts this dispatcher alongside the
`local-backend-boot` handler (that wiring + the running shell are witnessed under the Story UAT, not
asserted in CI).

OFFLINE-TESTABLE BY INJECTION: the docs route reads a REAL (seeded, temp) `docsDir` over `node:fs` — the
read-only FS walk IS the real collaborator, so the test seeds a temp dir rather than stubbing it. The
comments route takes an INJECTED `listComments` seam — the test passes a stub returning one real
`Comment`-shaped object; production wires `@storytree/library/store`'s `PgCommentStore.list`. The `me`
route is a constant. No real keychain, no live SDK, no DB.

## Integration test

**Goal —** Prove that the boot-read dispatcher, mounted as a `/api/*` `node:http` handler, answers the
studio's three remaining boot read routes (`me`/`docs`/`comments`) with real envelope bodies — the docs
route from a real read-only FS walk of a seeded `docs/` dir, the comments route from the injected seam,
the me route a constant local-member identity — and falls through (so the caller's 404 fires) for an
unhandled path. Entirely in-process: no Electron, no live SDK, no DB, no network beyond loopback HTTP.

The integration test exercises this capability against its **real in-story collaborators** — the real
read-only filesystem walk over a SEEDED temp `docsDir` (a real `decisions/0001-foo.md` with frontmatter +
an H1, and a `reference/glossary.md`) — with the live-spend / DB collaborators (the comment store)
injected as a scripted double. No stubs within the desktop's own composition.

The integration test would:

1. Seed a temp `docsDir`: `decisions/0001-foo.md` (YAML frontmatter `status: accepted` + a `decided`
   date, an `# ADR-0001: Foo` H1, a prose line) and `reference/glossary.md` (an H1, a prose line).
   Inject a stub `listComments` returning one real `Comment`-shaped object. Mount
   `createBootReadRoutes({ docsDir, listComments })` behind a wrapper that sends a 404 when the
   dispatcher returns `false`.
2. `GET /api/me` → 200, a BARE OBJECT with `member === true` and `role === "admin"` (the local-member
   identity, never a 401/an access wall).
3. `GET /api/docs` → 200, a BARE ARRAY containing the seeded `decisions/0001-foo.md` with
   `group: "Decisions"`, the H1 title (`ADR-0001: Foo`), and the parsed `status` — proving the real FS
   walk + the frontmatter parse ran, not a stub.
4. `GET /api/comments` → 200, a BARE ARRAY carrying the seeded comment — proving the route reached the
   injected seam and serialised its result (not a wrapping object).
5. An unhandled `/api/x` → the dispatcher returns `false`, so the wrapper's 404 fires — the deletion
   test proving the dispatcher is a real path-matcher that falls through, never a catch-all that
   swallows unknown routes.
6. (defect-driven, optional) A MISSING `docsDir` → `GET /api/docs` is 200 with a bare `[]`, never a
   thrown 500 — the read-only walk tolerates an absent dir.

## Contracts (3)

The test-proven leaf behaviours — each one isolated automated test (`node:test`, the `desktop` suite),
collaborators stubbed/seeded. None exist yet; each is the assertion a contract test WILL prove against
the real boot-read code once authored (provisional path — re-cite at real `file:line` when built).

1. **`br-me-is-a-local-member`** — `/api/me` answers the constant local-member identity, not an access wall
   - **asserts —** `GET /api/me` returns a bare object with `member: true` and `role: "admin"` (the
     `LOCAL_ME` constant — the operator IS member+admin on their own machine, the `DEV_ME`-equivalent),
     never a 401 / a non-member envelope that would make the studio render the request-access wall.
   - **covers —** `apps/desktop/src/backend/boot-read-routes.ts` (the me route + `LOCAL_ME`) *(provisional path)*
2. **`br-docs-is-a-bare-array-from-the-fs-walk`** — `/api/docs` answers the real read-only walk as a bare array
   - **asserts —** `GET /api/docs` returns a bare ARRAY of `DocMeta` from the real read-only FS walk over
     a seeded `docsDir` — a Decisions doc carries `group: "Decisions"`, its H1 title, and the parsed
     frontmatter `status`; a missing dir yields `[]`, never a throw. The envelope is the bare array, NOT a
     `{ docs: [...] }` wrapper (the studio frontend parses the array directly).
   - **covers —** `apps/desktop/src/backend/boot-read-routes.ts` (the docs route + `readLocalDocs`)
3. **`br-dispatcher-falls-through-not-404s`** — the dispatcher returns false for an unhandled path
   - **asserts —** the dispatcher handles `me`/`docs`/`comments` (returns `true`) and returns `false` for
     any other path — so the caller (the Electron main, mounting it before the `local-backend-boot`
     handler) can fall through to that handler's existing 404; the boot-read module is electron-free and
     does not import `apps/studio/server` (the surface boundary holds by construction).
   - **covers —** `apps/desktop/src/backend/boot-read-routes.ts` (the dispatcher's fall-through + import surface)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the boot-read module as a
new module, test-first.

- **The new test —** `apps/desktop/src/backend/boot-read-routes.test.ts` (`node:test` +
  `node:assert/strict`, the package convention — drive a real `node:http` server, no Electron/DOM/DB/SDK,
  exactly as `local-backend.test.ts` does). Import `{ createBootReadRoutes, LOCAL_ME, readLocalDocs }`
  (or the chosen names) from `"./boot-read-routes.js"`. Seed a temp `docsDir`; inject a stub
  `listComments` returning one real `Comment`-shaped object.
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `boot-read-routes.ts`
  does not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red, ADR-0057).
  Assert the three routes' real envelopes + the fall-through.
- **The GREEN —** write `apps/desktop/src/backend/boot-read-routes.ts`: export `LOCAL_ME` (the constant
  identity), `readLocalDocs(docsDir)` (the read-only FS walk reproducing `listDocs()`), the
  `BootReadDeps` interface (`{ docsDir; listComments }`), and `createBootReadRoutes(deps)` returning the
  async `(req, res, pathname) => Promise<boolean>` dispatcher. NO `electron`, NO `dom`, NO
  `apps/studio/server` import. After it, the import resolves, the assertions hold, and the package suite
  + typecheck stay green. The Electron `main.ts` then mounts this dispatcher alongside the
  `local-backend-boot` handler (operator-attested wiring, not CI).

Rules:

- **Re-compose / re-read, never import the studio** (the boundary call). The module reads the FS for
  docs (reproducing `listDocs()`, never importing it) and takes comments via an injected seam — it never
  imports `apps/studio/server/*`. The test pins this (`br-dispatcher-falls-through-not-404s`).
- **Electron-free core** — no `electron`/`dom` import; the shell wiring is the operator-attested binding.
- **Bare envelopes** — `/api/me` a bare object; `/api/docs` and `/api/comments` bare arrays (NOT wrapped)
  — the studio frontend parses them directly. The test pins the array shape
  (`br-docs-is-a-bare-array-from-the-fs-walk`).
- **The dispatcher falls through** — it returns `false` for an unhandled path so the caller's 404 fires;
  it is not a catch-all. The test pins this.
- **READ loop only (slow growth, ADR-0119 §2)** — mount only `me`/`docs`/`comments`. Do NOT add the
  build-trigger (it is `local-backend-boot`'s), the adopt route, or the chat SSE (consumed from
  headless-orchestrator, ADR-0108) — those are later increments.
