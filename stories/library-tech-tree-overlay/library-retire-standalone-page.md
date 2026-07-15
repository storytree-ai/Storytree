---
id: "library-retire-standalone-page"
tier: capability
story: library-tech-tree-overlay
title: "The standalone `#/library` studio page retires into the lens: `libraryHref()` re-points to the `?overlay=library#/tree` lens href (dropping its `category` parameter), `parseRoute('#/library')` (and `/library/<category>`) resolves to the tree route so a legacy bookmark lands on the forest map where the lens lives, the `{ name: 'library' }` variant is removed from the `Route` union, and every other route (`#/asset/<id>`, `#/asset/<id>/edit`, `#/asset/new`, `#/doc/<id>`, `#/tree`, `#/tree/<focus>`, `#/members`, `#/`) still resolves unchanged"
outcome: "The standalone `#/library` page RETIRES now that the owner attested the lens (ADR-0185 dec 6; the 2026-07-15 signature is recorded in the arc log). The change folds into the existing ~76-line hash router `apps/studio/src/lib/route.ts` — no new helper file. `libraryHref()` re-points to the LENS-open href: it returns a string containing `overlay=library` AND the `#/tree` hash (e.g. `?overlay=library#/tree`), NOT `#/library`, so every existing caller (top-nav, Home stat card, AssetView/AssetEditor breadcrumbs, Sidebar head-link) opens the lens with zero per-caller edits; its `category` parameter is dropped and the now-unused `asCategory` helper is removed. `parseRoute('#/library')` AND `parseRoute('#/library/<category>')` no longer yield a `{ name: 'library' }` route — both resolve to `{ name: 'tree', focus: null }` so a legacy bookmark lands on the forest map where the lens lives. `parseRoute` NEVER yields `name === 'library'` for any input, and the `{ name: 'library' }` member is REMOVED from the exported `Route` union (type-level retirement). Every OTHER route (`#/asset/<id>`, `#/asset/<id>/edit`, `#/asset/new`, `#/doc/<id>`, `#/tree`, `#/tree/<focus>`, `#/members`, `#/`) still resolves to the same variant it does today — ADR-0185 dec 6 preserves the `#/asset/<id>` deep links and the editor UNCHANGED, no collateral. This is pure-lib routing behaviour, machine-witnessed end to end; there is no operator-attested look leg (the lens's own look is the shared library-lens attestation, already signed 2026-07-15)."
status: proposed
proof_mode: integration-test
depends_on: [library-top-drawer, library-permanent-lens]
decisions: [185, 191, 188, 42, 23]
# Node-borne proof config (ADR-0057 keystone). BROWNFIELD (editsExisting: true) — this RE-POINTS and RETIRES
# routes inside the EXISTING ~76-line hash router `apps/studio/src/lib/route.ts` (present + green at HEAD). The
# RED the spine observes is a FAILING-ASSERTION red (route.ts exists — NOT module-not-found): at HEAD
# `parseRoute('#/library')` still returns `{ name: 'library', category: null }` and `libraryHref()` still returns
# `#/library`, so the v-lens assertions (libraryHref → the `?overlay=library#/tree` lens href; `/library` → the
# tree route; no `library` variant ever) fail against the standalone-page router.
# PURE-LIB — this is NOT a component cap: `route.ts` is a plain module (no React render, no jsdom DOM). So
# real.testFile is a plain `.test.ts` (NO `.tsx`, NO `@vitest-environment jsdom`, no React import) that drives
# `parseRoute` + `libraryHref` directly. real.sourceFile = route.ts; real.scope.sourceGlobs names ONLY route.ts
# (the ONE file this cap proves — every contract's `covers` points ONLY at route.ts, or CONFIRM_GREEN fail-closes
# after a full paid leaf run, `friction-cap-covers-outside-real-scope-burns-leaf-run`). Do NOT create a new helper
# file — retire the `{name:'library'}` variant, redirect `/library` paths to the tree route, re-point
# `libraryHref()` to `?overlay=library#/tree`, drop its `category` parameter, and REMOVE the now-unused
# `asCategory` helper, all inside route.ts.
#
# CRITICAL — apps/studio is VITEST (apps/studio/vitest.config.ts, include src/**/*.test.{ts,tsx}), NOT node:test.
# The default `node --test` real proof cannot run a vitest `.test.ts`. So this cap declares a `real.proofCommand`
# running the ONE test file under vitest (cwd = apps/studio). install: true (fresh-worktree tsx + tsc + vitest,
# ADR-0031 §2) + a `pnpm --filter studio typecheck` wall (the wall is where the Route-union member removal is
# type-proven — a caller still passing/reading `{ name: 'library' }` breaks typecheck). SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `lret-`-named contract test lives
# in route.test.ts. Its TITLE must carry the unique `lret-` id or coverage silently drops N-1/N past the signed
# green (`sdk-leaf-drops-contract-id-test-names` — this arc's recurring class; the fix if it happens is
# TEST-TITLE-ONLY, never an assertion/source edit).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/lib/route.test.ts"
    sourceFile: "apps/studio/src/lib/route.ts"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/lib/route.test.ts"]
      sourceGlobs:
        - "apps/studio/src/lib/route.ts"
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest, not node:test — run the ONE test file under vitest.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/lib/route.test.ts"
---

# Retire `#/library` — the standalone page folds into the lens

**Outcome —** The standalone `#/library` studio page RETIRES now that the owner attested the lens (ADR-0185 dec
6; the 2026-07-15 signature is recorded in the arc log). The lens is the `?overlay=library` search-param-driven
top drawer over `#/tree` (ADR-0191) — the Library's permanent home. The change folds entirely into the existing
~76-line hash router `apps/studio/src/lib/route.ts` (NO new helper file):

- **`libraryHref()` re-points to the lens.** It returns the LENS-open href — a string containing `overlay=library`
  AND the `#/tree` hash (e.g. `?overlay=library#/tree`), NOT `#/library`. This re-points every existing caller
  (top-nav, Home stat card, AssetView/AssetEditor breadcrumbs, Sidebar head-link) to the lens with zero per-caller
  edits. Its `category` parameter is dropped (the standalone page's category deep-link retires with the page), and
  the now-unused `asCategory` helper is removed.
- **`/library` paths redirect to the tree route.** `parseRoute('#/library')` AND `parseRoute('#/library/<category>')`
  no longer yield a `{ name: 'library' }` route — both resolve to `{ name: 'tree', focus: null }`, so a legacy
  bookmark lands on the forest map where the lens lives.
- **The `library` variant is removed from the `Route` union.** `parseRoute` NEVER yields `name === 'library'` for
  any input, and the `{ name: 'library' }` member is REMOVED from the exported `Route` type (type-level
  retirement — the `typecheck` wall proves no caller still reads it).
- **No collateral.** Every OTHER route — `#/asset/<id>`, `#/asset/<id>/edit`, `#/asset/new`, `#/doc/<id>`,
  `#/tree`, `#/tree/<focus>`, `#/members`, and `#/` — still resolves to the same variant it does today (ADR-0185
  dec 6 preserves the `#/asset/<id>` deep links and the editor UNCHANGED).

This is pure-lib routing behaviour, machine-witnessed end to end; there is NO operator-attested look leg on this
capability (the lens's own appearance is the shared library-lens attestation, already signed 2026-07-15).

**Depends on —** [`library-top-drawer`](library-top-drawer.md), [`library-permanent-lens`](library-permanent-lens.md).
Retiring the standalone page is only honest once the lens IS the Library's home: `library-permanent-lens` delivers
the `?overlay=library` flag-gated lens the redirected `/library` bookmark now lands beside, and `library-top-drawer`
delivers the collapsed-handle default so the lens is discoverable on every map load without the standalone page's
top-nav link. This capability needs both delivered as its precondition before it can redirect the page away —
`depends_on: [library-top-drawer, library-permanent-lens]`. It holds no backend seam — `route.ts` is a pure
module (hash string → `Route`), so it is deterministically drivable under plain vitest with no jsdom.

> **Proof status (honest) — `proposed`, BROWNFIELD re-point (editsExisting).** `apps/studio/src/lib/route.ts`
> EXISTS and is green at HEAD with the standalone `#/library` page live (`{ name: 'library'; category }` variant,
> `libraryHref()` → `#/library`, the `asCategory` helper). ADR-0185 dec 6 retires it now the lens is attested. A
> NET-NEW plain vitest test (`apps/studio/src/lib/route.test.ts`, NO jsdom, NO React) drives `parseRoute` +
> `libraryHref` and asserts the lens re-point, the `/library` → tree redirect, the preserved routes, and the
> never-`library` sweep — RED at HEAD as a FAILING-ASSERTION red (`libraryHref()` still returns `#/library`,
> `parseRoute('#/library')` still returns `{ name: 'library' }`), GREEN once route.ts retires the variant. Status
> stays `proposed` — `healthy` is only ever DERIVED from signed verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the RETIREMENT AS A WHOLE — re-pointing
`libraryHref()` to the lens (so every caller follows with no per-caller edit), redirecting both `/library` path
forms to the tree route, removing the `{ name: 'library' }` variant from the exported `Route` union (a type-level
change the `typecheck` wall proves), and doing all of it with ZERO collateral on the eight other routes — spanning
the href re-point, the parse redirect, the type-union retirement, and the no-collateral sweep, exercised directly
against the pure router. It is the ADR-0185 dec-6 execution now that the lens is attested; the lens itself is
`library-permanent-lens` / `library-top-drawer`, already delivered.

FOLD INTO route.ts — NO NEW HELPER FILE. The whole change lives in the existing ~76-line
`apps/studio/src/lib/route.ts`. Retire the `{ name: 'library'; category }` member from the `Route` union;
redirect the `path === '/library'` and `path.startsWith('/library/')` branches of `parseRoute` to
`{ name: 'tree', focus: null }`; re-point `libraryHref` to the `?overlay=library#/tree` lens href and drop its
`category` parameter; and REMOVE the now-unused `asCategory` helper (nothing else calls it once the `/library`
branches stop parsing a category). Do NOT author a new module, and do NOT touch any caller — the whole point is
that `libraryHref()` re-pointing carries every caller with it.

`libraryHref()` RETURNS THE LENS HREF, NOT `#/library`. The re-pointed `libraryHref()` returns a string
containing `overlay=library` AND the `#/tree` hash (e.g. `?overlay=library#/tree`) — the search-param-driven lens
invocation (ADR-0191). Assert the returned string CONTAINS `overlay=library`, CONTAINS `#/tree`, does NOT equal
`#/library`, and does NOT start with `#/library`. Pin it in `lret-library-href-opens-lens`.

`/library` PATHS REDIRECT TO THE TREE ROUTE. `parseRoute('#/library')` and `parseRoute('#/library/planner')` (a
category form) both resolve to `{ name: 'tree', focus: null }` — a legacy bookmark lands on the forest map where
the lens lives, not on a dead page. Assert both forms yield exactly `{ name: 'tree', focus: null }`. Pin it in
`lret-library-route-retired`.

EVERY OTHER ROUTE IS PRESERVED (no collateral). `#/asset/<id>`, `#/asset/<id>/edit`, `#/asset/new`, `#/doc/<id>`,
`#/tree`, `#/tree/<focus>`, `#/members`, and `#/` all still resolve to the same variant they do today — ADR-0185
dec 6 preserves the `#/asset/<id>` deep links and the editor UNCHANGED. Assert each of the eight resolves to its
current variant. Pin it in `lret-other-routes-preserved`.

`parseRoute` NEVER YIELDS `library` — AND THE VARIANT IS GONE FROM THE TYPE. Sweeping `#/library`, `#/library/`,
and `#/library/adr`, `parseRoute` never returns a route whose `name === 'library'`; and the `{ name: 'library' }`
member is REMOVED from the exported `Route` union so the type-level retirement is real (the `typecheck` wall is
where a caller still reading `{ name: 'library' }` would break). Assert no swept input yields `name === 'library'`.
Pin it in `lret-no-library-variant`.

OFFLINE-TESTABLE UNDER PLAIN VITEST (no jsdom, no React). `route.ts` is a pure module — `parseRoute(hash)` maps a
string to a `Route`, `libraryHref()` returns a string. The test imports `{ parseRoute, libraryHref }` from
`"./route"` and asserts on their return values directly; NO `@vitest-environment jsdom`, NO `@testing-library/react`,
NO real `fetch`/socket/DB/Electron. The module imports no agent/drive/model (the `modelPathBoundary.test.ts` wall
stays green).

NO LOOK LEG ON THIS CAPABILITY. Unlike the drawer's visual surfaces, retiring a route has no appearance to
attest — the lens's own look is the shared library-lens attestation the owner signed 2026-07-15 (recorded in the
arc log). This cap is machine-witnessed end to end; do NOT author a visual/colour/pixel assertion, and do NOT edit
any component or `TreeView.tsx` in this `real:` scope (the caller re-point rides `libraryHref()` for free; any
remaining glue — e.g. deleting a dead top-nav entry — is the orchestrator's supplement glue after PASS, plan §G).

## Integration test

**Goal —** Prove the `#/library` retirement against the pure router: `libraryHref()` returns the
`?overlay=library#/tree` lens href (never `#/library`); `parseRoute('#/library')` and `parseRoute('#/library/<category>')`
redirect to `{ name: 'tree', focus: null }`; every other route resolves unchanged; and `parseRoute` never yields a
`library` route for any input — entirely under plain vitest, driven by return values.

The integration test exercises this capability against the real `route.ts` (no seam to mock) — the re-pointed
`libraryHref`, the redirected parse branches, the preserved branches, and the retired variant are all real. It
would:

1. Call `libraryHref()` and assert the returned string CONTAINS `overlay=library` and `#/tree`, does NOT equal
   `#/library`, and does NOT start with `#/library`.
2. Call `parseRoute('#/library')` and `parseRoute('#/library/planner')` and assert both return exactly
   `{ name: 'tree', focus: null }`.
3. Call `parseRoute` for `#/asset/<id>`, `#/asset/<id>/edit`, `#/asset/new`, `#/doc/<id>`, `#/tree`,
   `#/tree/<focus>`, `#/members`, and `#/`, and assert each resolves to the same variant it does today (the
   `#/asset/<id>` deep link and the editor unchanged).
4. Sweep `#/library`, `#/library/`, and `#/library/adr` through `parseRoute` and assert NONE yields a route whose
   `name === 'library'` (backed by the type-level removal of the `{ name: 'library' }` member, proven by the
   `typecheck` wall).

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest,
`apps/studio/src/lib/route.test.ts`). Per ADR-0122 (`storytree coverage`) each contract id is the lead of a
distinctly-named test, so the coverage check reports 4/4 against the ONE `real.testFile`. EVERY contract's
`covers` points ONLY at `apps/studio/src/lib/route.ts` (a contract covering any file outside `real.scope.sourceGlobs`
fail-closes CONFIRM_GREEN after a full paid leaf run — `friction-cap-covers-outside-real-scope-burns-leaf-run`).
None of these is an APPEARANCE assertion — this cap has no look leg (the lens's look is the shared library-lens
attestation, signed 2026-07-15).

1. **`lret-library-href-opens-lens`** — `libraryHref()` returns the lens-open href, not `#/library`
   - **asserts —** `libraryHref()` returns a string that CONTAINS `overlay=library` AND the `#/tree` hash (e.g.
     `?overlay=library#/tree`), does NOT equal `#/library`, and does NOT start with `#/library` — so every
     existing caller (top-nav, Home stat card, AssetView/AssetEditor breadcrumbs, Sidebar head-link) opens the
     lens with zero per-caller edits.
   - **covers —** `apps/studio/src/lib/route.ts` (the re-pointed `libraryHref`)
   - **proven by —** `apps/studio/src/lib/route.test.ts` (net-new, plain vitest).
2. **`lret-library-route-retired`** — `parseRoute('#/library')` and `#/library/<category>` redirect to the tree route
   - **asserts —** `parseRoute('#/library')` AND `parseRoute('#/library/planner')` (a category form) both resolve
     to `{ name: 'tree', focus: null }` — neither returns a `{ name: 'library' }` route, so a legacy bookmark
     lands on the forest map where the lens lives.
   - **covers —** `apps/studio/src/lib/route.ts` (the redirected `/library` parse branches)
   - **proven by —** `apps/studio/src/lib/route.test.ts`.
3. **`lret-other-routes-preserved`** — every non-`library` route still resolves to the same variant it does today
   - **asserts —** `parseRoute` for `#/asset/<id>`, `#/asset/<id>/edit`, `#/asset/new`, `#/doc/<id>`, `#/tree`,
     `#/tree/<focus>`, `#/members`, and `#/` each resolves to the same variant as today (ADR-0185 dec 6 preserves
     the `#/asset/<id>` deep links and the editor UNCHANGED — no collateral).
   - **covers —** `apps/studio/src/lib/route.ts` (the preserved parse branches)
   - **proven by —** `apps/studio/src/lib/route.test.ts`.
4. **`lret-no-library-variant`** — `parseRoute` never yields a `library` route, and the variant is removed from the `Route` union
   - **asserts —** sweeping `#/library`, `#/library/`, and `#/library/adr` through `parseRoute`, NONE yields a
     route whose `name === 'library'`; and the `{ name: 'library' }` member is REMOVED from the exported `Route`
     union (type-level retirement — the `typecheck` wall proves no caller still reads it).
   - **covers —** `apps/studio/src/lib/route.ts` (the retired `Route` union member + the never-`library` parse)
   - **proven by —** `apps/studio/src/lib/route.test.ts`.

## Guidance — the brownfield slice that earns the signed verdict

The rung toward `healthy` (ADR-0057 §3, BROWNFIELD editsExisting): re-point and retire the `#/library` routes
inside the existing pure router, test-first, against a failing-assertion red.

- **The new test —** `apps/studio/src/lib/route.test.ts` (plain vitest — NO `@vitest-environment jsdom`, NO
  `@testing-library/react`, NO React import; `route.ts` is a pure module). Import `{ parseRoute, libraryHref }`
  from `"./route"` and assert on their return values directly. Name each test for its contract id (`lret-…`) so
  `storytree coverage library-retire-standalone-page` reports 4/4 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** a FAILING-ASSERTION red (route.ts exists — NOT
  module-not-found): at HEAD `libraryHref()` still returns `#/library` and `parseRoute('#/library')` still returns
  `{ name: 'library', category: null }`, so the lens-re-point and tree-redirect assertions fail against the
  standalone-page router.
- **The GREEN —** in `apps/studio/src/lib/route.ts`: remove the `{ name: 'library'; category }` member from the
  `Route` union; redirect the `'/library'` and `'/library/'` parse branches to `{ name: 'tree', focus: null }`;
  re-point `libraryHref` to the `?overlay=library#/tree` lens href and drop its `category` parameter; and remove
  the now-unused `asCategory` helper. Do NOT add a new file and do NOT edit any caller — the caller re-point rides
  `libraryHref()`. After it, the new test's assertions hold and `pnpm --filter studio test` +
  `pnpm --filter studio typecheck` stay green (the typecheck wall is where the `Route`-union member removal is
  proven — a caller still reading `{ name: 'library' }` breaks it).

Rules:

- **`libraryHref()` returns the lens href, not `#/library`** (`lret-library-href-opens-lens`) — contains
  `overlay=library` + `#/tree`, never `#/library`; the `category` parameter is dropped and every caller follows
  for free.
- **`/library` paths redirect to the tree route** (`lret-library-route-retired`) — both `#/library` and
  `#/library/<category>` resolve to `{ name: 'tree', focus: null }`.
- **Every other route is preserved** (`lret-other-routes-preserved`) — the eight non-`library` routes resolve
  unchanged; no collateral on the asset deep links or the editor (ADR-0185 dec 6).
- **`parseRoute` never yields `library`, and the variant leaves the `Route` union** (`lret-no-library-variant`) —
  a type-level retirement the `typecheck` wall proves.
- **Fold into route.ts, no new helper file, touch no caller, remove `asCategory`** — the whole change lives in the
  existing ~76-line router; the caller re-point rides `libraryHref()`.
- **No look leg on this capability** — it is pure-lib routing, machine-witnessed end to end; do NOT author a
  visual verdict, and do NOT edit `TreeView.tsx` / any component in the `real:` scope (its `sourceGlobs` is
  `route.ts` only).
- **Every `lret-` contract test TITLE carries its unique id** or `storytree coverage` silently drops coverage
  (`sdk-leaf-drops-contract-id-test-names`, this arc's recurring class — the fix if it happens is TEST-TITLE-ONLY,
  never an assertion/source edit).
