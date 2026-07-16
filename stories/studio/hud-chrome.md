---
id: "hud-chrome"
tier: capability
story: studio
title: "The floating HUD chrome — the forest map is the landing surface, the top banner and Overview page retire, and the only global chrome is a floating brand chip (top-left) and a verified-identity avatar menu (top-right)"
outcome: "The studio retires its top banner and its Overview/Home page: `#/` (empty hash and the old catch-all) lands on the forest map, the `home` route + `Home` component are retired (`parseRoute` never yields `home`), and the whole global chrome collapses to a floating HUD over the full-bleed app — a brand chip (top-left) that links to the forest, and a verified-identity avatar (top-right) whose menu carries the read-only identity + role, the Library lens, Documents, and the posture-/role-gated Members, Credentials, and Sign out actions. The free-text operator field is gone from the chrome. Identity stays the existing `/api/me` (the avatar PRESENTS it; no new auth); the visual LOOK is operator-attested separately (ADR-0070 stage 2)."
status: proposed
proof_mode: integration-test
depends_on: [dev-server-persistence-backbone]
decisions: [204, 8, 42, 43, 179, 70]
# ⚠️ ADR STAMP — this capability is authored under ADR-0204 ("Retire the studio banner: full-bleed
# forest with a HUD avatar on the verified identity", accepted, amends ADR-0008, arc studio-hud-chrome-arc).
#
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. MIXED net-new + brownfield (editsExisting: true):
# the leaf authors a NET-NEW vitest jsdom test (`apps/studio/src/components/Hud.test.tsx`) that imports a
# NOT-YET-EXISTING component from a NEW source file (`apps/studio/src/components/Hud.tsx`) — the
# module-not-found RED the spine observes (net-new missing-symbol, ADR-0057) — AND drives the brownfield
# route/App changes as FAILING-ASSERTION reds against the standing code (at HEAD `parseRoute('#/')` still
# returns `{ name: 'home' }`, App still renders `header.topbar` + the operator field). GREEN once the HUD
# component exists, `route.ts` retires `home`, and `App.tsx` swaps the banner for the HUD and drops the
# operator field. FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves GEOMETRY/BEHAVIOUR ONLY —
# landing route, banner/operator retirement, brand-chip target, avatar initials/fallback, and the menu's
# read-only identity + role-/posture-gated composition. The panel's APPEARANCE (does the HUD read as one
# coherent full-bleed app) is ADR-0204 / ADR-0070 stage 2, OPERATOR-ATTESTED separately — do NOT add a
# visual/colour/pixel assertion here and do NOT sign a look verdict.
#
# CRITICAL — apps/studio is VITEST (apps/studio/vitest.config.ts, include src/**/*.test.{ts,tsx}), NOT
# node:test. resolveProveSpec's DEFAULT real proof command is `node --import tsx --test <testFile>`
# (node:test), which CANNOT run a vitest jsdom `.test.tsx` (no describe/it from node:test, no jsdom env).
# So this cap MUST declare a `real.proofCommand` running the ONE test file under VITEST (cwd = apps/studio,
# so the path is package-relative). install: true (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a
# `pnpm --filter studio typecheck` wall — the wall is where the `home`-variant removal from the `Route`
# union is type-proven (a caller/`RouteView` still reading `{ name: 'home' }` breaks typecheck).
#
# SCOPE — real.scope.sourceGlobs is DELIBERATELY GENEROUS (`apps/studio/src/**`): this cap edits several
# src files (the new `Hud.tsx`, `App.tsx`, `route.ts`, the deleted `Home.tsx`, `index.css`, possibly
# `Sidebar.tsx`), and every contract's `covers` MUST point at a file INSIDE real.scope.sourceGlobs or
# CONFIRM_GREEN fail-closes AFTER a full paid leaf run (`friction-cap-covers-outside-real-scope-burns-leaf-run`).
# Being generous is safe; being narrow burns a paid run. real.testFile is the ONE file `storytree coverage`
# scans, so EVERY `hud-`-named contract test lives in `Hud.test.tsx` and its TITLE carries the unique `hud-`
# id or coverage silently drops N-1/N past the signed green (`sdk-leaf-drops-contract-id-test-names` — the
# fix if it happens is TEST-TITLE-ONLY, never an assertion/source edit).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/Hud.test.tsx"
    sourceFile: "apps/studio/src/components/Hud.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/Hud.test.tsx"]
      sourceGlobs:
        - "apps/studio/src/**"
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest (jsdom), not node:test — run the ONE test file under vitest.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/Hud.test.tsx"
---

# The floating HUD chrome — landing on the forest, a brand chip, and a verified-identity avatar

> **⚠️ Authored under ADR-0204** — "Retire the studio banner: full-bleed forest with a HUD avatar on the
> verified identity" (accepted, `amends` ADR-0008, arc `studio-hud-chrome-arc`).

**Outcome —** The studio retires its top banner and its Overview/Home page. The forest map becomes the
landing surface (`#/`, an empty hash, and the old catch-all all resolve to the tree route; the `home` route
and the `Home`/Overview component are retired, so `parseRoute` NEVER returns `home`). The only global chrome
is a **floating HUD** over the full-bleed app: a **brand chip** top-left that links to the forest, and a
**verified-identity avatar** top-right whose menu carries a read-only identity + role line, the **Library**
lens toggle, **Documents**, and the gated **Members** (admin only), **Credentials** (desktop bridge only),
and **Sign out** (hosted/IAP posture only). The free-text **operator field is gone** from the chrome.
Identity stays the existing `/api/me` — the avatar PRESENTS it (no new auth). The visual LOOK is
operator-attested separately (ADR-0070 stage 2); this capability's contracts are geometry/behaviour only,
provable red→green in the studio's vitest suite.

**Depends on —** [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md). The HUD presents
the caller's identity (`me`, from `GET /api/me`) and its Documents item routes into the corpus (`GET
/api/docs`) — both served by the backbone's `/api/*` middleware, the SAME read-path coupling
`browse-library` declares to the backbone. It needs the backbone's identity + corpus read path delivered as
its precondition, so `depends_on: [dev-server-persistence-backbone]`.

> **Proof status (honest) — `proposed`, MIXED net-new + brownfield (editsExisting).** The chrome EXISTS and
> is green at HEAD: `apps/studio/src/App.tsx` renders `<header className="topbar">` (brand + Overview/Forest/
> Library/Members nav + the identity chip + the free-text operator field), `RouteView` maps `home` →
> `<Home />`, and `apps/studio/src/lib/route.ts` returns `{ name: 'home' }` for `#/` and the catch-all.
> ADR-0204 retires all of it. A NET-NEW vitest jsdom test (`apps/studio/src/components/Hud.test.tsx`) imports
> the not-yet-existing `Hud` component (module-not-found RED, ADR-0057) and drives the brownfield route/App
> changes as failing-assertion reds; GREEN once `Hud.tsx` exists, `route.ts` retires `home`, `App.tsx` swaps
> the banner for the HUD and drops the operator field, and `Home.tsx` is deleted. Status stays `proposed` —
> `healthy` is only ever DERIVED from signed verdicts (ADR-0020), never authored, and the appearance is
> ADR-0070 stage-2 operator-attested, never a machine visual verdict.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the CHROME REPLACEMENT AS A WHOLE — the forest
map becomes the landing surface (route retirement), the top banner + Overview page retire, and one floating
HUD (brand chip + verified-identity avatar menu) replaces them, with the menu composing itself off the
identity's role and the deploy posture. It spans the router change, the App-shell swap, and the new HUD
component's behavioural composition, exercised against the real route module and the rendered shell — a
behavioural integration of the whole chrome, not a single isolated assertion.

WHY THE FREE-TEXT OPERATOR FIELD RETIREMENT IS ONLY HALF-DONE HERE (slow growth, the splitting-rule).
ADR-0204 retires the free-text `operator` input from the chrome; the FULL retirement — deriving comment
attribution from the verified `/api/me` identity instead of the `localStorage` operator name (ADR-0008's
single-local-operator model) — is the NEXT capability, not this one. THIS capability asserts ONLY that the
field is GONE from the chrome (no `aria-label="operator identity"` input renders anywhere). It does NOT
re-wire comment authorship, and it does NOT delete `apps/studio/src/lib/operator.ts` (the `useOperator`
hook / `getOperator()` stay until the attribution follow-on lands — removing the field is a clean swap that
does not need to break the still-standing author path). Do NOT pull the attribution re-wire into this unit.

THE LANDING ROUTE RETIREMENT (fold into `route.ts`, remove the `home` variant). At HEAD
`apps/studio/src/lib/route.ts` returns `{ name: 'home' }` for `path === '' || path === '/'` AND as the
catch-all `return`, and the exported `Route` union carries `{ name: 'home' }`. Retire it: `#/`, an empty
hash, and every unmatched path resolve to `{ name: 'tree', focus: null }`; `parseRoute` NEVER yields a route
whose `name === 'home'`; and the `{ name: 'home' }` member is REMOVED from the exported `Route` union
(type-level retirement — the `typecheck` wall proves no caller / no `RouteView` case still reads it). Every
OTHER route is preserved UNCHANGED: `#/doc/<id>`, `#/asset/<id>`, `#/asset/<id>/edit`, `#/asset/new`,
`#/members`, `#/tree`, `#/tree/<focus>` each resolve to the same variant they do today, and `#/library`
still redirects to the tree route (already retired to the lens by `library-retire-standalone-page`,
ADR-0185 dec 6 — unchanged here). Delete `apps/studio/src/components/Home.tsx` and its `RouteView` `case
'home'` in `App.tsx` (its import too); the Overview stats row dies with the page — NO replacement (the
owner's call, ADR-0204).

THE BANNER RETIRES INTO THE HUD (swap in `App.tsx`, a NEW `Hud.tsx` component). The whole
`<header className="topbar">` block in `App.tsx` (the `brand` link, the `topnav` with Overview/Forest/
Library/Members links, the `identity-chip`, and the `<label className="operator">` input) is REMOVED and
replaced by the floating HUD — a new `apps/studio/src/components/Hud.tsx` rendered once, globally, over the
full-bleed app on every route. After the swap, NO element with class `topbar` renders, NO Overview/Forest/
Library nav link renders in the chrome, and NO operator input renders anywhere. The brand chip and the
avatar menu carry every affordance the retired banner held (the nav links become avatar-menu items).

THE VERIFIED-IDENTITY AVATAR (present `/api/me`, no new auth). The top-right avatar renders INITIALS derived
from the verified identity email (`me.email` — e.g. `hua.mick@gmail.com` → `HM`) and visually carries the
ROLE (`me.role`, `admin` vs `member`, a tint or badge that reads distinctly per role — the same
`role-<role>` idiom the retired `identity-chip` used). When identity is ABSENT/unresolved (`me.email` null,
the `ANON_ME` case or a still-loading `me`), the avatar renders an HONEST FALLBACK state — a neutral
placeholder glyph, NOT a broken empty circle and NOT invented initials. NOTE (honesty): `MeInfo.role` is
`'admin' | 'member' | null` (`apps/studio/src/types.ts`); there is NO distinct `builder` UserRole — a
desktop "builder" is a `member` carrying the `canAttestUat` permission. Present `me.role` faithfully; do NOT
invent a `builder` role tint the type cannot supply.

THE AVATAR MENU (opens on the avatar; composes off role + posture). Clicking the avatar opens a menu whose
items are:
- **Identity + role line** — the verified `me.email` + `me.role`, rendered READ-ONLY (text, never an input —
  this is what replaces the free-text operator field's role in the chrome).
- **Library** — targets the `?overlay=library` lens over the tree (`libraryHref()` already returns
  `?overlay=library#/tree`, ADR-0191). Assert the target CONTAINS `overlay=library` AND `#/tree` (never the
  retired `#/library`).
- **Documents** — navigates into the document corpus view (a `#/doc/<relpath>` route — the existing `DocView`
  surface; e.g. the first `group === 'Decisions'` doc, the `Home` Stat's precedent `docHref(firstAdr.id)`).
  Assert the target resolves (via `parseRoute`) to a `{ name: 'doc' }` route.
- **Members** — present ONLY when `me.role === 'admin'`; targets `#/members` (`membersHref`). ABSENT for a
  `member`.
- **Credentials** — present ONLY when the desktop auth bridge exists (`getDesktopAuth()` /
  `window.desktopAuth`, `apps/studio/src/lib/desktopAuth.ts`); it REUSES the existing `CredentialsPanel`
  (the `DesktopCredentialsDock` precedent — the dock renders nothing when the bridge is absent, so the
  hosted/browser studio shows no dead keychain controls). ABSENT in a plain browser.
- **Sign out** — present ONLY on the hosted/IAP posture; navigates to the IAP session-clear URL
  `/?gcp-iap-mode=CLEAR_LOGIN_COOKIE`. ABSENT on the desktop posture.

THE POSTURE DISCRIMINATOR (how Sign out is gated — the leaf's plumbing, the contract pins the render). "Sign
out" is a hosted/IAP-only affordance. The honest discriminator: the DESKTOP posture is
`window.desktopAuth` PRESENT (the injected bridge, `desktopAuth.ts`); the HOSTED/IAP posture is a production
browser served under IAP with NO desktop bridge. Because a `pnpm --filter studio dev` browser is ALSO a
bridge-less browser, the leaf may combine the bridge-absence with a production/hosted signal
(`import.meta.env.PROD`) OR pass an explicit `posture` input from `App` (the composition root) — the leaf's
call. THIS capability pins the HUD's OBSERVABLE render GIVEN the posture input (hosted → Sign out present
with the clear-cookie href; desktop → Sign out absent); it does NOT dictate the plumbing mechanism. Keep the
component prop-driven for a clean jsdom unit where it helps (the `BuildSection` / `StoreBanner` precedent —
prop-driven, no context, no router), OR read `useAppData()` for `me`/`docs` like `Home`/`Sidebar` do; either
is fine as long as every contract's observable is drivable in jsdom.

OFFLINE-TESTABLE UNDER VITEST JSDOM (the SAME discipline `BuildSection.test.tsx` / `StoreBanner.test.tsx`
use): `@vitest-environment jsdom`, `@testing-library/react` for render / `fireEvent`, the identity/posture/
desktop-bridge inputs driven by props (or a wrapped `AppDataContext.Provider` + a set/cleared
`window.desktopAuth`). The route-retirement assertions import `{ parseRoute }` from `"../lib/route"` and
assert on return values directly (no render needed). NO real `fetch`/socket/SDK/DB/Electron.

NO LOOK LEG ON THIS CAPABILITY'S CONTRACTS (ADR-0070 stage 2 / ADR-0204). The HUD's APPEARANCE — does it read
as one coherent full-bleed app, do the chip and avatar sit right — is OPERATOR-ATTESTED separately (ADR-0070
stage 2, the arc's look attestation). Do NOT author a visual/colour/pixel/geometry-of-appearance assertion
here, and the leaf does NOT sign a visual verdict. The contracts prove BEHAVIOUR (routing, presence/absence
of chrome, menu composition), never look.

## Integration test

**Goal —** Prove the chrome replacement against the real route module and the rendered App shell: the forest
map is the landing surface and the `home` route is retired; the top banner + Overview page + operator field
are gone; and one floating HUD (brand chip + verified-identity avatar menu) carries the identity, the Library
lens, Documents, and the role-/posture-/bridge-gated Members, Credentials, and Sign out — entirely under
vitest jsdom, driven by identity/posture/bridge inputs, no real `fetch`/socket/SDK/DB/Electron.

The integration test exercises this capability against its **real in-story collaborators** — the real
`route.ts` module (no seam to mock) and the rendered App/HUD composition — with no stubs within the chrome.
It would:

1. Call `parseRoute('#/')`, `parseRoute('')`, and `parseRoute('#/does-not-exist')` and assert each returns
   `{ name: 'tree', focus: null }`; sweep `#/`, `''`, and a bogus path and assert NONE yields a route whose
   `name === 'home'`; and assert `#/doc/<id>`, `#/asset/<id>`, `#/asset/<id>/edit`, `#/asset/new`,
   `#/members`, `#/tree`, `#/tree/<focus>`, and `#/library` each resolve to the same variant they do today.
2. Render the App shell (member identity) on a non-tree route and assert NO element with class `topbar`
   renders, NO Overview/Forest/Library nav link renders, and NO `aria-label="operator identity"` input
   renders anywhere — the only chrome is the floating HUD.
3. Render the HUD and assert a floating brand chip (top-left) renders and its link target resolves (via
   `parseRoute`) to the tree route.
4. Render the HUD with a verified identity (`me.email` set, role `admin`) and assert the avatar shows
   initials derived from the email and a role-keyed tint/badge; render it with `me.email` null and assert an
   honest fallback (a neutral placeholder), never a broken empty circle.
5. Click the avatar and assert the menu opens with a read-only identity + role line, a "Library" item
   targeting the `?overlay=library#/tree` lens href, and a "Documents" item resolving to a `#/doc` route.
6. Drive the gated items: with role `admin` assert "Members" (→ `#/members`) present and with role `member`
   assert it absent; with `window.desktopAuth` set assert "Credentials" present and with it cleared assert it
   absent; with the hosted posture assert "Sign out" (→ `/?gcp-iap-mode=CLEAR_LOGIN_COOKIE`) present and with
   the desktop posture assert it absent.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/Hud.test.tsx`). Per ADR-0122 (`storytree coverage`) each contract id is the lead
of a distinctly-named test, so the coverage check reports 6/6 against the ONE `real.testFile`. EVERY
contract's `covers` points at a file INSIDE `real.scope.sourceGlobs` (`apps/studio/src/**`) — a contract
covering any file outside it fail-closes CONFIRM_GREEN after a full paid leaf run
(`friction-cap-covers-outside-real-scope-burns-leaf-run`). NONE of these is an APPEARANCE assertion — the
HUD's look is ADR-0204 / ADR-0070 stage-2 operator-attested (the arc's look leg).

1. **`hud-landing-routes-to-forest`** — the forest map is the landing surface and the `home` route is retired
   - **asserts —** `parseRoute('#/')`, `parseRoute('')`, and `parseRoute` of an unmatched path (e.g.
     `#/does-not-exist`) each return `{ name: 'tree', focus: null }`; sweeping those, `parseRoute` NEVER
     yields a route whose `name === 'home'`; the `{ name: 'home' }` member is REMOVED from the exported
     `Route` union (type-level retirement, proven by the `typecheck` wall); and `#/doc/<id>`, `#/asset/<id>`,
     `#/asset/<id>/edit`, `#/asset/new`, `#/members`, `#/tree`, `#/tree/<focus>`, and `#/library` each resolve
     to the same variant they do today (no collateral; `#/library` still redirects to the tree route).
   - **covers —** `apps/studio/src/lib/route.ts` (the retired `home` variant + the `#/`/catch-all → tree
     redirect)
   - **proven by —** `apps/studio/src/components/Hud.test.tsx` (net-new; imports `parseRoute`, plain assertions).
2. **`hud-topbar-and-operator-retired`** — no top banner, no Overview/Forest/Library nav, and no operator field render
   - **asserts —** rendering the App shell (member identity, on any route) produces NO element with class
     `topbar`, NO Overview/Forest/Library nav link in the chrome, and NO `aria-label="operator identity"`
     free-text input anywhere — the only global chrome is the floating HUD (the `<header className="topbar">`
     block is gone).
   - **covers —** `apps/studio/src/App.tsx` (the banner + operator-field removal, the HUD swap)
   - **proven by —** `apps/studio/src/components/Hud.test.tsx`.
3. **`hud-brand-chip-links-forest`** — a floating brand chip renders on every route and links to the forest
   - **asserts —** the HUD renders a floating brand chip (top-left) on every route, and its link target
     resolves (via `parseRoute`) to the tree route (`{ name: 'tree' }`) — a click lands on the forest map.
   - **covers —** `apps/studio/src/components/Hud.tsx` (the brand chip) *(net-new)*
   - **proven by —** `apps/studio/src/components/Hud.test.tsx`.
4. **`hud-avatar-presents-verified-identity`** — the avatar shows identity initials + a role tint, or an honest fallback
   - **asserts —** given a verified identity (`me.email` set, role `admin`), the top-right avatar renders
     initials derived from `me.email` and a role-keyed tint/badge that reads distinctly per role (admin vs
     member); given identity absent/unresolved (`me.email` null), it renders an honest fallback (a neutral
     placeholder), NEVER a broken empty circle and never invented initials. (Honesty: `me.role` is
     `admin | member | null` — there is no `builder` role tint to render; `builder` is a `member` with
     `canAttestUat`.)
   - **covers —** `apps/studio/src/components/Hud.tsx` (the avatar's initials + role tint + absent-identity fallback)
   - **proven by —** `apps/studio/src/components/Hud.test.tsx`.
5. **`hud-avatar-menu-core-and-lenses`** — opening the avatar shows the identity line, the Library lens, and Documents
   - **asserts —** clicking the avatar opens a menu containing (a) a READ-ONLY identity + role line
     (`me.email` + `me.role`, text — never an input), (b) a "Library" item whose target CONTAINS
     `overlay=library` AND `#/tree` (the `libraryHref()` lens href, never `#/library`), and (c) a "Documents"
     item whose target resolves (via `parseRoute`) to a `{ name: 'doc' }` route (the corpus `DocView`).
   - **covers —** `apps/studio/src/components/Hud.tsx` (the menu open + identity line + Library/Documents items)
   - **proven by —** `apps/studio/src/components/Hud.test.tsx`.
6. **`hud-avatar-menu-gated-items`** — Members (admin), Credentials (desktop bridge), and Sign out (hosted) gate correctly
   - **asserts —** each conditionally-present item renders in its positive case and is ABSENT in its negative
     case: "Members" present ONLY when `me.role === 'admin'` (target `#/members`), absent for a `member`;
     "Credentials" present ONLY when `getDesktopAuth()` / `window.desktopAuth` exists (reusing the existing
     `CredentialsPanel`), absent in a plain browser; "Sign out" present ONLY on the hosted/IAP posture (target
     `/?gcp-iap-mode=CLEAR_LOGIN_COOKIE`), absent on the desktop posture. The three gates share the one open
     menu surface, so they fold into this one contract (the `chat-panel` sibling-case precedent).
   - **covers —** `apps/studio/src/components/Hud.tsx` (the role-/bridge-/posture-gated menu items)
   - **proven by —** `apps/studio/src/components/Hud.test.tsx`.

## Guidance — the slice that earns the signed verdict

The rung toward `healthy` (ADR-0057 §3, MIXED net-new + brownfield `editsExisting`): author the HUD as a new
component and retire the banner/route, test-first, against a module-not-found + failing-assertion red.

- **The new test —** `apps/studio/src/components/Hud.test.tsx` (`@vitest-environment jsdom`, vitest +
  `@testing-library/react`, the studio package convention — `vi.hoisted`/`vi.mock` and/or a wrapped
  `AppDataContext.Provider` + a set/cleared `window.desktopAuth`; NO real `fetch`/socket/SDK/DB/Electron).
  Import `{ Hud }` from `"./Hud"` (the module-not-found RED at HEAD) and `{ parseRoute }` from
  `"../lib/route"`. Name each test for its contract id (`hud-…`) so `storytree coverage hud-chrome` reports
  6/6 (ADR-0122) — the title MUST carry the id or coverage silently drops it.
- **The RED the spine observes (before IMPLEMENT) —** a MIXED red: `./Hud` does not exist at HEAD
  (module-not-found, the net-new missing-symbol red, ADR-0057) PLUS failing-assertion reds on the standing
  code (`parseRoute('#/')` still returns `{ name: 'home' }`; the App still renders `header.topbar` + the
  `aria-label="operator identity"` input). Assert the landing redirect, the banner/operator retirement, the
  brand chip, the avatar initials/fallback, and the menu composition (core + gated).
- **The GREEN —** (a) in `apps/studio/src/lib/route.ts`: return `{ name: 'tree', focus: null }` for `#/`, the
  empty hash, and the catch-all, and REMOVE the `{ name: 'home' }` member from the exported `Route` union;
  (b) delete `apps/studio/src/components/Home.tsx` and its `RouteView` `case 'home'` + import in `App.tsx`;
  (c) write `apps/studio/src/components/Hud.tsx` — the floating brand chip + the verified-identity avatar menu
  (identity line, Library lens, Documents, and the role-/bridge-/posture-gated Members/Credentials/Sign out),
  reusing the existing `CredentialsPanel` for the Credentials item; (d) in `App.tsx` remove the whole
  `<header className="topbar">` block (brand, topnav, identity-chip, operator field) and render `<Hud />`
  globally over the full-bleed app; (e) style the HUD in `apps/studio/src/index.css`. After it, the new
  test's assertions hold and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green (the
  typecheck wall is where the `home`-variant removal is proven — a dangling `RouteView` case or caller reading
  `{ name: 'home' }` breaks it). WIRING the HUD into the shell + the live appearance is witnessed at the
  ADR-0204 / ADR-0070 stage-2 operator-attested look leg, not asserted in CI.

Rules:

- **The forest map is the landing surface; the `home` route retires** (`hud-landing-routes-to-forest`) — `#/`,
  the empty hash, and the catch-all resolve to the tree route; `parseRoute` never yields `home`; the variant
  leaves the `Route` union (a type-level retirement the `typecheck` wall proves); every other route is
  preserved unchanged.
- **The top banner + Overview page + operator field retire into the HUD** (`hud-topbar-and-operator-retired`)
  — no `header.topbar`, no Overview/Forest/Library nav, no operator input; the Overview stats row dies with
  the page with NO replacement (ADR-0204). Do NOT delete `lib/operator.ts` or re-wire comment attribution —
  that is the NEXT capability.
- **The brand chip links to the forest** (`hud-brand-chip-links-forest`) — a floating top-left chip on every
  route whose target resolves to the tree route.
- **The avatar presents the verified `/api/me` identity, no new auth** (`hud-avatar-presents-verified-identity`)
  — initials from `me.email`, a role tint from `me.role` (`admin | member`, never an invented `builder`), and
  an honest fallback when identity is absent.
- **The avatar menu composes off role + posture** (`hud-avatar-menu-core-and-lenses`,
  `hud-avatar-menu-gated-items`) — the read-only identity line + Library lens + Documents always; Members only
  for admin, Credentials only with the desktop bridge, Sign out only on the hosted/IAP posture; each gated
  item absent in its negative case.
- **Appearance is operator-attested, not asserted here** (ADR-0070 / ADR-0204) — prove geometry/behaviour
  only; the HUD's look is the arc's stage-2 operator-attested leg. Do not author a visual verdict.
- **Every `hud-` contract test TITLE carries its unique id** or `storytree coverage` silently drops coverage
  (`sdk-leaf-drops-contract-id-test-names` — the fix if it happens is TEST-TITLE-ONLY, never an
  assertion/source edit).
