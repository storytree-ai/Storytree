---
id: "repo-selection"
tier: capability
story: terminal-repo-picker
title: "The Electron-main repo selection module — validate / persist / read / resolve-cwd over injected DirProbe + SelectionStore ports"
outcome: "The Electron-main repo selection module validates a candidate directory over an injected DirProbe, persists a valid selection over an injected SelectionStore (and refuses to persist an invalid one), reads the persisted selection back, and resolves the terminal's cwd to the selected directory (else a caller-supplied fallback) — failing closed on a bad, absent, or now-invalid path by returning a typed reason / the fallback, NEVER throwing, all over injected ports so the whole lifecycle is proven headlessly with no node:fs and no Electron."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors a
# node:test that imports a NOT-YET-EXISTING symbol (`RepoSelection` + the `DirProbe`/`SelectionStore`
# seams) from a NEW source file under apps/desktop/src/backend/ (red = module-not-found against the source
# that does not exist at HEAD), then writes that one new source file (green). The module is a DEEP module
# (deep-modules principle): a narrow surface (select / current / resolveCwd) over a hidden lifecycle
# (validation rules + persistence + fallback resolution), driven entirely through injected ports — the
# KeychainPort ↔ CredentialBroker ↔ InMemoryKeychain pattern the desktop credential broker already uses.
# The test injects a FAKE DirProbe (scriptable exists/isDirectory/isGitRepo) and a FAKE SelectionStore (an
# in-memory read/write double) — so validation, persistence, read-back, and fail-closed fallback are
# proven with ZERO real node:fs and ZERO Electron. The real node:fs DirProbe + the userData SelectionStore
# + the native dialog + the ipc handlers + the resolveCwd→terminal-spawn thread are OPERATOR-ATTESTED GLUE
# in the Electron main (story "Operator-attested glue"), NOT this cap. `install: true` + a typecheck wall
# because the --real proof runs in a FRESH worktree (tsx + tsc need the lockfile-only install, ADR-0031
# §2). Single LITERAL source file (no `*`), so the default node:test proof on the one test file is legal —
# no `proofCommand` (mirrors pty-session-manager, the sibling apps/desktop node:test cap). SCOPE =
# apps/desktop (the module lives in apps/desktop/src/backend/), NOT packages/*. The module imports node:fs
# NOWHERE — the filesystem is reached only through the injected DirProbe/SelectionStore, whose REAL
# adapters are glue — so this cap declares NO `addDeps` (and could not: resolveAddDepsGroup targets
# packages/*, never apps/*).
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/repo-selection.test.ts"
    sourceFile: "apps/desktop/src/backend/repo-selection.ts"
    scope:
      testGlobs: ["apps/desktop/src/backend/repo-selection.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/repo-selection.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# The Electron-main repo selection module — validate / persist / read / resolve-cwd over injected DirProbe + SelectionStore ports

**Outcome —** The Electron-main repo selection module **validates** a candidate directory over an injected
`DirProbe`, **persists** a valid selection over an injected `SelectionStore` (and **refuses** to persist
an invalid one), **reads** the persisted selection back, and **resolves** the terminal's `cwd` to the
selected directory (else a caller-supplied fallback) — **failing closed** on a bad, absent, or now-invalid
path by returning a typed reason / the fallback, **never throwing**, all over injected ports so the whole
lifecycle is proven headlessly with no `node:fs` and no Electron.

**Depends on —** nothing (within `terminal-repo-picker`). It is a self-contained Electron-main module over
injected `DirProbe` + `SelectionStore` ports. The renderer [`repo-picker-panel`](repo-picker-panel.md)
sits on the OTHER side of the `desktopRepo` contextBridge and imports nothing from this module — they
share the bridge WIRE SHAPE (`pick` / `get`) as a cross-boundary contract, not a code edge (the
`pty-session-manager` ↔ `terminal-dock-panel` precedent), so there is no in-story edge either way.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. It is the provable core of
> the repo picker: the selection **lifecycle** the Electron main needs so the terminal can open in the
> user's chosen repo. The real `node:fs` `DirProbe` + the userData `SelectionStore` + the native
> `dialog.showOpenDialog` + the `ipcMain.handle("dialog:pickDirectory" | "repo:get")` handlers + threading
> `resolveCwd(serveRoot)` into the existing `terminal:spawn` are the operator-attested GLUE in
> `apps/desktop/electron/main.ts` (the story's "Operator-attested glue" — a `node:test` that opened a real
> dialog or wrote a real userData file would be the live-native trap); THIS capability is the selection
> lifecycle the glue drives, proven offline against injected fakes.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the SELECTION LIFECYCLE AS A WHOLE — a
module that, over injected ports, VALIDATES a candidate directory (exists / is a directory / is a git
repo), PERSISTS a valid one (and refuses an invalid one), READS the persisted selection back, and RESOLVES
the terminal cwd (the selected dir when still valid, else a fallback) — failing closed on every bad/absent
path. It spans validation AND persistence AND read-back AND fallback resolution AND the fail-closed safety
boundary — an integration test of the lifecycle over fake ports, not a single isolated assertion.

WHY THIS IS A SEPARATE CAPABILITY FROM `repo-picker-panel` (the splitting-rule, ADR-0010): the two sit on
OPPOSITE sides of the `desktopRepo` contextBridge and prove DIFFERENT observables in DIFFERENT suites.
THIS proves the BACKEND — the Electron-main validate/persist/resolve lifecycle (proof scope
`apps/desktop`, `node:test`, injected fakes). `repo-picker-panel` proves the FRONTEND — the renderer
picker control (proof scope `apps/studio/src`, vitest jsdom, a mocked bridge). They share the bridge wire
shape (`pick` / `get`) as a CONTRACT across the boundary, not a code edge: the panel never imports this
module, this module never imports the panel. Distinct surface, distinct suite, distinct isolatable net-new
red→green — exactly the `pty-session-manager` (desktop) ↔ `terminal-dock-panel` (studio) split, here
inside one story.

THE DEEP-MODULE SHAPE (deep-modules principle — a narrow surface over a hidden lifecycle). Model the
filesystem and the persistence as NARROW injected ports and the selector as the deep module over them (the
`KeychainPort` ↔ `CredentialBroker` ↔ `InMemoryKeychain` pattern the desktop credential broker already
uses):

- **`DirProbe`** — the narrow read-only filesystem seam the validator reaches the OS through (the real
  `node:fs` adapter and the test fake both implement it), e.g.:
  - `exists(path: string): boolean` · `isDirectory(path: string): boolean` · `isGitRepo(path: string): boolean`
- **`SelectionStore`** — the narrow persistence seam (the real userData-JSON adapter and the test fake
  both implement it), e.g.:
  - `read(): string | null` — the persisted selected path, or null · `write(path: string): void` — persist it
- **`RepoSelection`** — the deep module OVER the injected ports, e.g.:
  - `select(path): { ok: true; path } | { ok: false; reason }` — validate via `DirProbe`; on valid →
    `SelectionStore.write(path)` + return ok; on invalid → return a typed reason and do NOT write.
  - `current(): string | null` — `SelectionStore.read()` (the persisted selection).
  - `resolveCwd(fallback: string): string` — the selected dir when a persisted selection is still valid,
    else the `fallback` (what the Electron main passes as the terminal's default cwd). Fail-closed, never
    throws.

  The deletion test earns the boundary (deep-modules): delete `RepoSelection` and the
  validation/persistence/fallback complexity reappears at the single `dialog:pickDirectory` /
  `terminal:spawn` call sites — it hides real lifecycle work behind a small surface, so it is a capability,
  not a pass-through.

THE INJECTED FAKES ARE THE ONLY SEAMS (the SAME discipline `broker.test.ts` uses with `InMemoryKeychain`).
The test constructs a fake `DirProbe` whose `exists` / `isDirectory` / `isGitRepo` are SCRIPTED per path
and a fake `SelectionStore` backed by an in-memory value — so validation, persistence, read-back, and
fallback are all observable deterministically with NO real `node:fs` and NO Electron. No filesystem, no
dialog, no window, no DB, no network.

ELECTRON-FREE, FS-FREE CORE (the standalone-resilient-library shape, mirroring `broker.ts` /
`pty-session-manager.ts`): the module lives under `apps/desktop/src/backend/` with NO `electron` import
and NO `node:fs` import (the filesystem is reached ONLY through the injected `DirProbe`/`SelectionStore`,
whose real adapters are glue in the Electron main). So `node:test` drives the whole lifecycle headlessly.
The Electron main (`main.ts`) is the thin operator-attested binding that injects the real `node:fs`
DirProbe + the userData SelectionStore, mounts the `dialog:pickDirectory` / `repo:get` ipc handlers over
`dialog.showOpenDialog`, and threads `resolveCwd(serveRoot)` into the existing `terminal:spawn` (witnessed
under the Story UAT legs 3–5, not asserted in CI).

FAIL CLOSED, NEVER THROW (the load-bearing safety observable): `select` on a missing / non-directory /
non-git path returns a typed `{ ok: false; reason }`, NEVER a throw; `resolveCwd` on an absent OR
now-invalid persisted selection returns the fallback, NEVER a throw. A bad selection is never persisted,
so a stale/invalid path can never silently become the terminal's cwd. This is the reason the selection is
a validated module, not a raw path read at the ipc site — an ipc handler has no per-call try/catch, and a
throw there would crash the Electron main.

VALIDATION STRICTNESS — a valid selection requires `exists && isDirectory && isGitRepo` (the repo-picker-
true reading: the feature picks a *repo*, so a non-git directory is rejected with a typed reason). Whether
`isGitRepo` is hard-required or advisory is a minimal-to-green modeling call surfaced in the story's "Open
modeling calls" — the default here is the stricter reading; relaxing to `exists && isDirectory` is a
one-line change if the owner would rather allow any directory.

## Integration test

**Goal —** Prove that the repo selection module, over injected fake `DirProbe` + `SelectionStore` ports,
validates a candidate directory, persists a valid selection and refuses an invalid one, reads the
persisted selection back, and resolves the terminal cwd (selected-when-valid else fallback) — failing
closed on every bad/absent path, never throwing — entirely in-process: no real node:fs, no Electron, no
dialog, no DB, no network.

The integration test exercises this capability against its **real collaborator shape** — a fake
`DirProbe` (scripted per-path `exists`/`isDirectory`/`isGitRepo`) and a fake `SelectionStore` (an
in-memory read/write double), exactly as `broker.test.ts` exercises `CredentialBroker` over
`InMemoryKeychain`. No stubs within the module's own logic (the validation, the persistence gating, the
resolution are all real).

The integration test would:

1. Construct a `RepoSelection` over a fake `DirProbe` (scripted so `/repo` exists + isDirectory +
   isGitRepo) and a fake `SelectionStore`. `select("/repo")` → assert it returns a typed ok with the path
   AND the fake `SelectionStore.write` recorded `/repo` — the validate + persist core.
2. `select` a missing path, a file (exists but not a directory), and an existing non-git directory →
   assert each returns a typed `{ ok: false; reason }`, NEVER throws, and the `SelectionStore.write` was
   NOT called for any of them — the fail-closed validation + persist-refusal.
3. `current()` → assert it returns the persisted `/repo` via `SelectionStore.read` (and null when the
   store holds nothing) — the read-back.
4. `resolveCwd("/serve-root")` with `/repo` persisted + still valid → assert it returns `/repo`; then
   script the `DirProbe` so `/repo` is no longer valid (e.g. deleted) and assert `resolveCwd` returns the
   `/serve-root` fallback — the resolution + the now-invalid fallback.
5. `resolveCwd("/serve-root")` with NOTHING persisted → assert it returns `/serve-root`, never throws —
   the absent-selection fallback (what the terminal gets on a fresh install).

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** in the `desktop` suite (`node:test`,
`apps/desktop/src/backend/repo-selection.test.ts`), the filesystem + persistence injected as fake
`DirProbe` / `SelectionStore`. None exist yet; each is the assertion a contract test WILL prove against
the real module once authored (provisional path — re-cite at real `file:line` when built). Per ADR-0122
(`storytree coverage`), each contract id is the lead of a distinctly-named test, so
`storytree coverage repo-selection` reports 5/5.

1. **`rsel-accepts-valid-git-dir`** — select() on an existing git directory validates and returns a typed ok
   - **asserts —** `select(path)` on a path the injected `DirProbe` reports as existing + a directory + a
     git repo returns a typed `{ ok: true; path }` — the three-part validation over the injected probe.
   - **covers —** `apps/desktop/src/backend/repo-selection.ts` (select + validation) *(provisional path)*
2. **`rsel-rejects-invalid-path-with-reason`** — select() on a missing/non-dir/non-git path returns a typed reason, never throws
   - **asserts —** `select(path)` on a missing path, on an existing non-directory, and on an existing
     non-git directory each returns a typed `{ ok: false; reason }` and NEVER throws — the fail-closed
     validation boundary (so a stray ipc call can never crash the Electron main).
   - **covers —** `apps/desktop/src/backend/repo-selection.ts` (the validation guards) *(provisional path)*
3. **`rsel-persists-valid-not-invalid`** — a valid select persists via SelectionStore; an invalid one does not
   - **asserts —** a valid `select` calls the injected `SelectionStore.write` with the path; an invalid
     `select` does NOT call `write` (the store is untouched) — persistence gated on validity, so an invalid
     path can never become the persisted selection.
   - **covers —** `apps/desktop/src/backend/repo-selection.ts` (the persist-on-valid gate) *(provisional path)*
4. **`rsel-current-reads-persisted`** — current() reads the persisted selection (null when none)
   - **asserts —** `current()` returns the persisted path via `SelectionStore.read` after a valid select,
     and `null` when the store holds nothing — the read-back the `repo:get` ipc handler exposes.
   - **covers —** `apps/desktop/src/backend/repo-selection.ts` (current) *(provisional path)*
5. **`rsel-resolvecwd-selected-else-fallback`** — resolveCwd() returns the selected dir when valid, else the fallback, never throws
   - **asserts —** `resolveCwd(fallback)` returns the persisted selection when it is still valid; returns
     the `fallback` when nothing is persisted OR the persisted path is no longer valid; and NEVER throws —
     the terminal-cwd resolution + the fail-closed fallback (what the Electron main threads into the pty
     spawn).
   - **covers —** `apps/desktop/src/backend/repo-selection.ts` (resolveCwd) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the repo selection module as
a new module, test-first.

- **The new test —** `apps/desktop/src/backend/repo-selection.test.ts` (`node:test` + `node:assert/strict`,
  the package convention — fake `DirProbe` + `SelectionStore` doubles, NO Electron / node:fs / dialog / DB
  / network, exactly as `broker.test.ts` drives `InMemoryKeychain`). Import `{ RepoSelection }` (and the
  `DirProbe` / `SelectionStore` types) from `"./repo-selection.js"`. Name each test for its contract id
  (`rsel-…`) so `storytree coverage repo-selection` reports 5/5 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `repo-selection.ts` does not exist at HEAD, so the test fails module-not-found (the net-new
  missing-symbol red, ADR-0057). Assert validation (accept/reject), persist-on-valid gating, read-back, and
  the resolveCwd selected-else-fallback path.
- **The GREEN —** write `apps/desktop/src/backend/repo-selection.ts`: the `DirProbe` / `SelectionStore`
  interfaces and the `RepoSelection` class validating a candidate over the injected `DirProbe`, persisting
  a valid one over the injected `SelectionStore`, reading it back, and resolving the cwd
  selected-else-fallback — guarding every bad/absent path as a typed reason / the fallback, never a throw.
  NO `electron`, NO `node:fs` import (both are reached only through the injected ports / the
  operator-attested glue). The import resolves, the assertions hold, and `pnpm --filter desktop test` +
  `pnpm --filter desktop typecheck` stay green.

Rules:

- **Injected ports only — never import `node:fs` or `electron` here** (the real adapters are glue in the
  Electron main). The module's only seams are the injected `DirProbe`/`SelectionStore`, so `node:test`
  drives it with fakes and no filesystem is ever touched at test time.
- **Fail closed, never throw** — `select` on a bad path is a typed `{ ok: false; reason }`; `resolveCwd`
  on an absent/invalid selection is the fallback; neither throws (an ipc handler has no try/catch). The
  test pins this (`rsel-rejects-invalid-path-with-reason`, `rsel-resolvecwd-selected-else-fallback`).
- **Persist only on valid** — an invalid selection is NEVER written, so a stale/invalid path can never
  silently become the terminal's cwd (`rsel-persists-valid-not-invalid`).
- **Deep module, narrow surface** — hide the validate/persist/read/resolve lifecycle behind
  select/current/resolveCwd (deep-modules); the deletion test earns the boundary.
- **Selection only, no policy (slow growth)** — this validates + persists + resolves ONE selected
  directory. It does NOT clone/add/list/switch repos, does NOT open the native dialog (that is glue in
  main), does NOT sign / build / open a PR (it is the interactive surface, never the prove-it-gate leaf,
  ADR-0004 / ADR-0091), and does NOT reach cloud/web working directories (DEFERRED, ADR-0174). One picked
  cwd, nothing more.
