---
id: "hud-chrome"
tier: capability
story: studio
title: "The floating HUD chrome — the forest map is the landing surface, the top banner and Overview page retire, and the only global chrome is a single verified-identity avatar (top-right): no brand chip, and the avatar menu is a pure account surface (no Library/Documents navigation)"
outcome: "The studio retires its top banner and its Overview/Home page: `#/` (empty hash and the old catch-all) lands on the forest map, the `home` route + `Home` component are retired (`parseRoute` never yields `home`), and the whole global chrome collapses to a SINGLE floating HUD control over the full-bleed app — a verified-identity avatar (top-right) and nothing else: NO brand chip and NO navigation affordance outside the avatar (ADR-0205, the `one-way-to-do-things` principle — the map's library drawer is THE pathway to the Library, the lens dive THE pathway into document bodies, so a permanent nav chip is a second pathway to where you already are). The avatar PRESENTS the verified `/api/me` identity (no new auth); opening it shows a read-only identity + role line and ONLY account items — Members (admin-gated), Credentials (desktop-gated), Sign out (hosted-gated) — with no Library entry, no Documents entry, and no navigation link of any kind. The free-text operator field is gone from the chrome. The visual LOOK is operator-attested separately (ADR-0070 stage 2)."
status: proposed
proof_mode: integration-test
depends_on: [dev-server-persistence-backbone]
decisions: [204, 205, 8, 42, 43, 179, 70]
# ⚠️ ADR STAMP — this capability was authored under ADR-0204 ("Retire the studio banner: full-bleed
# forest with a HUD avatar on the verified identity", accepted, amends ADR-0008) and is RE-TENSED to v2
# under ADR-0205 ("One-pathway chrome: the HUD sheds the brand chip and lens shortcuts", accepted
# 2026-07-17, amends ADR-0204) — arc studio-hud-chrome-arc. At the ADR-0204 look walk the owner retired
# the brand chip and the avatar menu's Library/Documents entries (the new `one-way-to-do-things`
# principle: the map's library drawer IS the Library pathway; the lens dive IS the document pathway).
#
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. PURE BROWNFIELD RE-TENSE (editsExisting: true, the
# ADR-0197 walk-feedback precedent): the v1 capability is SIGNED and GREEN at HEAD (run real-mrnkskyj) —
# `apps/studio/src/components/Hud.tsx`, `Hud.test.tsx`, the retired `home` route, and the banner swap all
# EXIST. There is NO module-not-found net-new red this time. The leaf RE-AUTHORS the standing
# `Hud.test.tsx` and EDITS the standing `Hud.tsx` to shed the chip + the menu's Library/Documents entries.
# At HEAD the HUD renders a brand chip and the menu carries Library + Documents items, so the v2 ABSENCE
# assertions are honest FAILING-ASSERTION reds the spine observes; GREEN once `Hud.tsx` drops the brand
# chip (the avatar becomes the only floating HUD control) and the menu drops the Library + Documents
# items. FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves GEOMETRY/BEHAVIOUR ONLY — landing
# route, banner/operator retirement, the absence of any nav chrome outside the avatar, avatar
# initials/fallback, and the menu's read-only identity + role-/posture-gated account composition. The
# panel's APPEARANCE (does the one-avatar HUD read as one coherent full-bleed app) is ADR-0205 / ADR-0070
# stage 2, OPERATOR-ATTESTED separately — do NOT add a visual/colour/pixel assertion here and do NOT sign
# a look verdict.
#
# CRITICAL — apps/studio is VITEST (apps/studio/vitest.config.ts, include src/**/*.test.{ts,tsx}), NOT
# node:test. resolveProveSpec's DEFAULT real proof command is `node --import tsx --test <testFile>`
# (node:test), which CANNOT run a vitest jsdom `.test.tsx` (no describe/it from node:test, no jsdom env).
# So this cap MUST declare a `real.proofCommand` running the ONE test file under VITEST (cwd = apps/studio,
# so the path is package-relative). install: true (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a
# `pnpm --filter studio typecheck` wall.
#
# SCOPE — real.scope.sourceGlobs is DELIBERATELY GENEROUS (`apps/studio/src/**`): this cap edits several
# src files (`Hud.tsx`, possibly `App.tsx`, `index.css`), and every contract's `covers` MUST point at a
# file INSIDE real.scope.sourceGlobs or CONFIRM_GREEN fail-closes AFTER a full paid leaf run
# (`friction-cap-covers-outside-real-scope-burns-leaf-run`). Being generous is safe; being narrow burns a
# paid run. real.testFile is the ONE file `storytree coverage` scans, so EVERY `hud-`-named contract test
# lives in `Hud.test.tsx` and its TITLE carries the unique `hud-` id or coverage silently drops N-1/N past
# the signed green (`sdk-leaf-drops-contract-id-test-names` — the fix if it happens is TEST-TITLE-ONLY,
# never an assertion/source edit). Post-re-tense there are 5 contracts → coverage must report 5/5.
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

# The floating HUD chrome — landing on the forest, one avatar, and a pure account menu

> **⚠️ Authored under ADR-0204, re-tensed to v2 under ADR-0205** — ADR-0204 "Retire the studio banner:
> full-bleed forest with a HUD avatar on the verified identity" (accepted, `amends` ADR-0008), re-tensed
> by ADR-0205 "One-pathway chrome: the HUD sheds the brand chip and lens shortcuts" (accepted 2026-07-17,
> `amends` ADR-0204). Arc `studio-hud-chrome-arc`.

**Outcome —** The studio retires its top banner and its Overview/Home page. The forest map becomes the
landing surface (`#/`, an empty hash, and the old catch-all all resolve to the tree route; the `home` route
and the `Home`/Overview component are retired, so `parseRoute` NEVER returns `home`). The only global chrome
is a **single floating HUD control** over the full-bleed app: a **verified-identity avatar** top-right, and
**nothing else** — NO brand chip and NO navigation affordance outside the avatar (ADR-0205, the
`one-way-to-do-things` principle: the map's library drawer is THE pathway to the Library and the lens dive
is THE pathway into document bodies, so a permanent navigation chip is a second pathway to where you already
are). The avatar PRESENTS the verified `/api/me` identity (no new auth); opening it shows a read-only
identity + role line and **ONLY account items** — the gated **Members** (admin only), **Credentials**
(desktop bridge only), and **Sign out** (hosted/IAP posture only) — with **no Library entry, no Documents
entry, and no navigation link of any kind**. The free-text **operator field is gone** from the chrome. The
visual LOOK is operator-attested separately (ADR-0070 stage 2); this capability's contracts are
geometry/behaviour only, provable red→green in the studio's vitest suite.

**Depends on —** [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md). The HUD presents
the caller's identity (`me`, from `GET /api/me`) — served by the backbone's `/api/*` middleware, the SAME
read-path coupling `browse-library` declares to the backbone. It needs the backbone's identity read path
delivered as its precondition, so `depends_on: [dev-server-persistence-backbone]`. (v2 note, ADR-0205: the
menu no longer carries a Documents entry, so the HUD no longer routes into the corpus — the identity read
path is the only backbone coupling that remains.)

> **Proof status (honest) — `proposed`, PURE BROWNFIELD RE-TENSE (editsExisting).** The v1 chrome is SIGNED
> and GREEN at HEAD (run real-mrnkskyj): `apps/studio/src/components/Hud.tsx` renders the floating brand chip
> + the verified-identity avatar whose menu carries Library + Documents + the gated items, the `home` route
> is retired, and `Hud.test.tsx` proves it 6/6. ADR-0205 re-tenses it: the brand chip retires (the avatar
> becomes the only floating HUD control) and the menu sheds its Library + Documents navigation entries. This
> is the ADR-0197 walk-feedback precedent — the leaf RE-AUTHORS `Hud.test.tsx` (dropping the retired
> brand-chip test, re-tensing the menu tests to assert the Library/Documents ABSENCE) and EDITS `Hud.tsx`.
> There is NO module-not-found red this time (every module exists); the RED the spine observes is purely
> FAILING-ASSERTION — at HEAD the chip renders and the menu carries Library + Documents, so the new absence
> assertions fail — going GREEN once `Hud.tsx` drops them. Status stays `proposed` — `healthy` is only ever
> DERIVED from signed verdicts (ADR-0020), never authored, and the appearance is ADR-0070 stage-2
> operator-attested, never a machine visual verdict.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the CHROME REPLACEMENT AS A WHOLE — the forest
map is the landing surface (route retirement), the top banner + Overview page + operator field retire, and
one floating avatar (with a pure account menu) is the ONLY global chrome. It spans the router change, the
App-shell swap, and the HUD component's behavioural composition, exercised against the real route module and
the rendered shell — a behavioural integration of the whole chrome, not a single isolated assertion.

WHY THE FREE-TEXT OPERATOR FIELD RETIREMENT IS ONLY HALF-DONE HERE (slow growth, the splitting-rule).
ADR-0204 retires the free-text `operator` input from the chrome; the FULL retirement — deriving comment
attribution from the verified `/api/me` identity instead of the `localStorage` operator name (ADR-0008's
single-local-operator model) — is the sibling `verified-attribution` capability, not this one. THIS
capability asserts ONLY that the field is GONE from the chrome (no `aria-label="operator identity"` input
renders anywhere). It does NOT re-wire comment authorship, and it does NOT delete
`apps/studio/src/lib/operator.ts`. Do NOT pull the attribution re-wire into this unit.

THE LANDING ROUTE RETIREMENT (unchanged from v1, still asserted). `apps/studio/src/lib/route.ts` resolves
`#/`, an empty hash, and every unmatched path to `{ name: 'tree', focus: null }`; `parseRoute` NEVER yields
a route whose `name === 'home'`; the `{ name: 'home' }` member is absent from the exported `Route` union
(type-level retirement — the `typecheck` wall proves no caller / no `RouteView` case still reads it). Every
OTHER route is preserved UNCHANGED: `#/doc/<id>`, `#/asset/<id>`, `#/asset/<id>/edit`, `#/asset/new`,
`#/members`, `#/tree`, `#/tree/<focus>` each resolve to the same variant they do today, and `#/library`
still redirects to the tree route (ADR-0185 dec 6). `apps/studio/src/components/Home.tsx` and its
`RouteView` `case 'home'` in `App.tsx` are gone; the Overview stats row died with the page — NO replacement.

THE CHROME IS A SINGLE AVATAR — NO BRAND CHIP (ADR-0205 delta). The v1 HUD rendered a floating brand chip
(top-left) that linked to the forest; ADR-0205 RETIRES it: the forest IS the landing surface (ADR-0204 D1)
and every other surface is an overlay on it, so a permanent "back to the forest" chip is a second pathway to
where you already are. After the re-tense, `apps/studio/src/components/Hud.tsx` renders NO brand chip and NO
navigation affordance outside the avatar — the top-right verified-identity avatar is the ONLY floating HUD
control. (The whole `<header className="topbar">` block was already removed in v1 into the HUD; that shell
retirement is unchanged.)

THE VERIFIED-IDENTITY AVATAR (present `/api/me`, no new auth — unchanged from v1). The top-right avatar
renders INITIALS derived from the verified identity email (`me.email` — e.g. `hua.mick@gmail.com` → `HM`)
and visually carries the ROLE (`me.role`, `admin` vs `member`, a tint or badge that reads distinctly per
role — the same `role-<role>` idiom the retired `identity-chip` used). When identity is ABSENT/unresolved
(`me.email` null, the `ANON_ME` case or a still-loading `me`), the avatar renders an HONEST FALLBACK state —
a neutral placeholder glyph, NOT a broken empty circle and NOT invented initials. NOTE (honesty):
`MeInfo.role` is `'admin' | 'member' | null` (`apps/studio/src/types.ts`); there is NO distinct `builder`
UserRole — a desktop "builder" is a `member` carrying the `canAttestUat` permission. Present `me.role`
faithfully; do NOT invent a `builder` role tint the type cannot supply.

THE AVATAR MENU — A PURE ACCOUNT SURFACE (ADR-0205 delta). Clicking the avatar opens a menu that carries the
read-only identity + role line and ONLY the account items. ADR-0205 REMOVES the v1 Library and Documents
entries — the map's library drawer (ADR-0191, the default-visible lens handle) is the one Library pathway,
and the lens dive (ADR-0185 inc 4, document/ADR bodies inside the library overlay) is the one document
pathway; a menu shortcut to either is a second pathway that must clear the `one-way-to-do-things`
justification bar, which the owner judged it does not. So the menu's items are:
- **Identity + role line** — the verified `me.email` + `me.role`, rendered READ-ONLY (text, never an input —
  this is what replaces the free-text operator field's role in the chrome).
- **Members** — present ONLY when `me.role === 'admin'`; targets `#/members` (`membersHref`). ABSENT for a
  `member`.
- **Credentials** — present ONLY when the desktop auth bridge exists (`getDesktopAuth()` /
  `window.desktopAuth`, `apps/studio/src/lib/desktopAuth.ts`); it REUSES the existing `CredentialsPanel`
  (the `DesktopCredentialsDock` precedent — the dock renders nothing when the bridge is absent, so the
  hosted/browser studio shows no dead keychain controls). ABSENT in a plain browser.
- **Sign out** — present ONLY on the hosted/IAP posture; navigates to the IAP session-clear URL
  `/?gcp-iap-mode=CLEAR_LOGIN_COOKIE`. ABSENT on the desktop posture.
- **NO Library item, NO Documents item, NO navigation link of any kind** — the menu is an account surface,
  not a nav (ADR-0205). `libraryHref()` keeps its lens semantics for in-app callers (the map drawer); only
  the retired menu shortcut dies.

THE POSTURE DISCRIMINATOR (how Sign out is gated — the leaf's plumbing, the contract pins the render;
unchanged from v1). "Sign out" is a hosted/IAP-only affordance. The honest discriminator: the DESKTOP
posture is `window.desktopAuth` PRESENT (the injected bridge, `desktopAuth.ts`); the HOSTED/IAP posture is a
production browser served under IAP with NO desktop bridge. Because a `pnpm --filter studio dev` browser is
ALSO a bridge-less browser, the leaf may combine the bridge-absence with a production/hosted signal
(`import.meta.env.PROD`) OR pass an explicit `posture` input from `App` (the composition root) — the leaf's
call. THIS capability pins the HUD's OBSERVABLE render GIVEN the posture input (hosted → Sign out present
with the clear-cookie href; desktop → Sign out absent); it does NOT dictate the plumbing mechanism. Keep the
component prop-driven for a clean jsdom unit where it helps (the `BuildSection` / `StoreBanner` precedent —
prop-driven, no context, no router), OR read `useAppData()` for `me` like `Sidebar` does; either is fine as
long as every contract's observable is drivable in jsdom.

OFFLINE-TESTABLE UNDER VITEST JSDOM (the SAME discipline `BuildSection.test.tsx` / `StoreBanner.test.tsx`
use): `@vitest-environment jsdom`, `@testing-library/react` for render / `fireEvent`, the identity/posture/
desktop-bridge inputs driven by props (or a wrapped `AppDataContext.Provider` + a set/cleared
`window.desktopAuth`). The route-retirement assertions import `{ parseRoute }` from `"../lib/route"` and
assert on return values directly (no render needed). NO real `fetch`/socket/SDK/DB/Electron.

NO LOOK LEG ON THIS CAPABILITY'S CONTRACTS (ADR-0070 stage 2 / ADR-0205). The HUD's APPEARANCE — does the
one-avatar HUD read as one coherent full-bleed app, does the avatar sit right — is OPERATOR-ATTESTED
separately (ADR-0070 stage 2, the arc's look attestation). Do NOT author a visual/colour/pixel/geometry-of-
appearance assertion here, and the leaf does NOT sign a visual verdict. The contracts prove BEHAVIOUR
(routing, presence/absence of chrome, menu composition), never look.

## Integration test

**Goal —** Prove the one-pathway chrome against the real route module and the rendered App shell: the forest
map is the landing surface and the `home` route is retired; the top banner + Overview page + operator field
are gone; the ONLY floating HUD control is the verified-identity avatar (no brand chip, no nav outside it);
and opening the avatar shows a read-only identity + role line and ONLY the role-/posture-/bridge-gated
account items (Members, Credentials, Sign out) with no Library/Documents/navigation entry — entirely under
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
3. Render the HUD and assert it renders NO brand/navigation chip and NO navigation affordance outside the
   avatar — the verified-identity avatar (top-right) is the ONLY floating HUD control.
4. Render the HUD with a verified identity (`me.email` set, role `admin`) and assert the avatar shows
   initials derived from the email and a role-keyed tint/badge; render it with `me.email` null and assert an
   honest fallback (a neutral placeholder), never a broken empty circle.
5. Click the avatar and assert the menu opens with a read-only identity + role line and NO "Library" item,
   NO "Documents" item, and no navigation link of any kind — the menu is a pure account surface.
6. Drive the gated account items on that one open menu: with role `admin` assert "Members" (→ `#/members`)
   present and with role `member` assert it absent; with `window.desktopAuth` set assert "Credentials"
   present and with it cleared assert it absent; with the hosted posture assert "Sign out"
   (→ `/?gcp-iap-mode=CLEAR_LOGIN_COOKIE`) present and with the desktop posture assert it absent.

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/Hud.test.tsx`). Per ADR-0122 (`storytree coverage`) each contract id is the lead
of a distinctly-named test, so the coverage check reports **5/5** against the ONE `real.testFile`. **⚠️ THE
LEAF HAS REGRESSED ON THIS IN BOTH PRIOR RUNS: EVERY contract's test TITLE must LEAD with its unique `hud-`
id, and the five titles must be DISTINCT** — otherwise `storytree coverage` silently drops N-1/N past the
signed green (`sdk-leaf-drops-contract-id-test-names`; the fix if it happens is TEST-TITLE-ONLY, never an
assertion/source edit). EVERY contract's `covers` points at a file INSIDE `real.scope.sourceGlobs`
(`apps/studio/src/**`) — a contract covering any file outside it fail-closes CONFIRM_GREEN after a full paid
leaf run (`friction-cap-covers-outside-real-scope-burns-leaf-run`). NONE of these is an APPEARANCE assertion
— the HUD's look is ADR-0205 / ADR-0070 stage-2 operator-attested (the arc's look leg).

1. **`hud-landing-routes-to-forest`** — the forest map is the landing surface and the `home` route is retired
   - **asserts —** `parseRoute('#/')`, `parseRoute('')`, and `parseRoute` of an unmatched path (e.g.
     `#/does-not-exist`) each return `{ name: 'tree', focus: null }`; sweeping those, `parseRoute` NEVER
     yields a route whose `name === 'home'`; the `{ name: 'home' }` member is ABSENT from the exported
     `Route` union (type-level retirement, proven by the `typecheck` wall); and `#/doc/<id>`, `#/asset/<id>`,
     `#/asset/<id>/edit`, `#/asset/new`, `#/members`, `#/tree`, `#/tree/<focus>`, and `#/library` each resolve
     to the same variant they do today (no collateral; `#/library` still redirects to the tree route).
   - **covers —** `apps/studio/src/lib/route.ts` (the retired `home` variant + the `#/`/catch-all → tree
     redirect)
   - **proven by —** `apps/studio/src/components/Hud.test.tsx` (imports `parseRoute`, plain assertions).
   - *(UNCHANGED from v1 — already green at HEAD; the re-authored test keeps this leg.)*
2. **`hud-topbar-and-operator-retired`** — no top banner, no Overview/Forest/Library nav, and no operator field render
   - **asserts —** rendering the App shell (member identity, on any route) produces NO element with class
     `topbar`, NO Overview/Forest/Library nav link in the chrome, and NO `aria-label="operator identity"`
     free-text input anywhere — the only global chrome is the floating HUD (the `<header className="topbar">`
     block is gone).
   - **covers —** `apps/studio/src/App.tsx` (the banner + operator-field removal, the HUD swap)
   - **proven by —** `apps/studio/src/components/Hud.test.tsx`.
   - *(UNCHANGED from v1 — the App-shell retirement stands; ADR-0205 touches the HUD, not this shell leg.)*
3. **`hud-no-navigation-chrome`** — the HUD renders no brand chip and the avatar is the only floating control
   - **asserts —** rendering the HUD (any route, any identity) produces NO brand/navigation chip and NO
     navigation affordance (link, nav, "home"/"forest" chip) anywhere in the HUD OUTSIDE the avatar; the
     top-right verified-identity avatar is the ONLY floating HUD control. (Replaces the retired v1
     `hud-brand-chip-links-forest` — ADR-0205: the forest IS the landing surface, so a permanent "back to
     the forest" chip is a second pathway to where you already are.)
   - **covers —** `apps/studio/src/components/Hud.tsx` (the removed brand chip; the avatar as the sole control)
   - **proven by —** `apps/studio/src/components/Hud.test.tsx`.
   - *(RE-TENSE of the retired `hud-brand-chip-links-forest` — at HEAD the chip renders, so this absence
     assertion is a failing-assertion RED until `Hud.tsx` drops the chip.)*
4. **`hud-avatar-presents-verified-identity`** — the avatar shows identity initials + a role tint, or an honest fallback
   - **asserts —** given a verified identity (`me.email` set, role `admin`), the top-right avatar renders
     initials derived from `me.email` and a role-keyed tint/badge that reads distinctly per role (admin vs
     member); given identity absent/unresolved (`me.email` null), it renders an honest fallback (a neutral
     placeholder), NEVER a broken empty circle and never invented initials. (Honesty: `me.role` is
     `admin | member | null` — there is no `builder` role tint to render; `builder` is a `member` with
     `canAttestUat`.)
   - **covers —** `apps/studio/src/components/Hud.tsx` (the avatar's initials + role tint + absent-identity fallback)
   - **proven by —** `apps/studio/src/components/Hud.test.tsx`.
   - *(UNCHANGED from v1 — the avatar's identity presentation stands.)*
5. **`hud-avatar-menu-account-only`** — opening the avatar shows the identity line and ONLY the gated account items — no Library, no Documents, no navigation
   - **asserts —** clicking the avatar opens a menu that (a) shows a READ-ONLY identity + role line
     (`me.email` + `me.role`, text — never an input), (b) contains NO "Library" item, NO "Documents" item,
     and no navigation link of any kind (the map's library drawer is the one Library pathway, the lens dive
     the one document pathway — ADR-0205), and (c) carries ONLY the account actions, each gated on the one
     open-menu surface: "Members" present ONLY when `me.role === 'admin'` (target `#/members`), absent for a
     `member`; "Credentials" present ONLY when `getDesktopAuth()` / `window.desktopAuth` exists (reusing the
     existing `CredentialsPanel`), absent in a plain browser; "Sign out" present ONLY on the hosted/IAP
     posture (target `/?gcp-iap-mode=CLEAR_LOGIN_COOKIE`), absent on the desktop posture.
   - **covers —** `apps/studio/src/components/Hud.tsx` (the menu: identity line, no navigation, role-/bridge-/posture-gated account items)
   - **proven by —** `apps/studio/src/components/Hud.test.tsx`.
   - *(RE-TENSE of the v1 `hud-avatar-menu-core-and-lenses`, ABSORBING the v1 `hud-avatar-menu-gated-items`:
     with the Library + Documents lenses gone, the menu is a single account surface — one open-menu
     observable — so the old core/gated split no longer earns two contracts, the splitting-rule. At HEAD the
     menu carries Library + Documents, so the absence assertions are failing-assertion reds until `Hud.tsx`
     drops them.)*

## Guidance — the slice that earns the signed verdict

The rung toward `healthy` (ADR-0057 §3, PURE BROWNFIELD RE-TENSE `editsExisting`, the ADR-0197 walk-feedback
precedent): re-author the standing HUD test and edit the standing HUD component to shed the brand chip and
the menu's Library/Documents entries, test-first, against a failing-assertion red.

- **The re-authored test —** `apps/studio/src/components/Hud.test.tsx` (`@vitest-environment jsdom`, vitest +
  `@testing-library/react`, the studio package convention — `vi.hoisted`/`vi.mock` and/or a wrapped
  `AppDataContext.Provider` + a set/cleared `window.desktopAuth`; NO real `fetch`/socket/SDK/DB/Electron).
  DROP the retired `hud-brand-chip-links-forest` test; ADD the `hud-no-navigation-chrome` absence test;
  re-tense the menu tests into the single `hud-avatar-menu-account-only` test (identity line + no
  Library/Documents + the three gated items on the one open menu). Import `{ Hud }` from `"./Hud"` and
  `{ parseRoute }` from `"../lib/route"`. **Name each of the FIVE tests for its contract id (`hud-…`) so
  `storytree coverage hud-chrome` reports 5/5 (ADR-0122) — the title MUST carry the id or coverage silently
  drops it; this is the exact leg the leaf regressed on twice, so double-check the five titles are distinct
  and each leads with its id.**
- **The RED the spine observes (before IMPLEMENT) —** a pure FAILING-ASSERTION red against the standing v1
  code (no module-not-found — every module exists at HEAD): `Hud.tsx` renders a brand chip
  (`hud-no-navigation-chrome` fails) and the menu carries "Library" + "Documents" items
  (`hud-avatar-menu-account-only`'s absence clause fails). The landing / banner-retirement / avatar-identity
  legs stay green throughout (already true at HEAD).
- **The GREEN —** in `apps/studio/src/components/Hud.tsx`: (a) REMOVE the floating brand chip so the avatar
  is the only floating HUD control; (b) REMOVE the menu's "Library" and "Documents" items, leaving the
  read-only identity + role line and the role-/bridge-/posture-gated Members/Credentials/Sign out. Touch
  `App.tsx` / `index.css` only as needed for the chip removal. After it, the re-authored test's assertions
  hold and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green. WIRING + the live
  appearance is witnessed at the ADR-0205 / ADR-0070 stage-2 operator-attested look leg, not asserted in CI.

Rules:

- **The forest map is the landing surface; the `home` route stays retired** (`hud-landing-routes-to-forest`)
  — unchanged from v1: `#/`, the empty hash, and the catch-all resolve to the tree route; `parseRoute` never
  yields `home`; the variant stays out of the `Route` union; every other route is preserved unchanged.
- **The top banner + Overview page + operator field stay retired into the HUD**
  (`hud-topbar-and-operator-retired`) — unchanged from v1: no `header.topbar`, no Overview/Forest/Library
  nav, no operator input. Do NOT delete `lib/operator.ts` or re-wire comment attribution — that is the
  `verified-attribution` capability.
- **The chrome is a single avatar — no brand chip** (`hud-no-navigation-chrome`) — the HUD renders no
  brand/navigation chip and no navigation affordance outside the avatar; the verified-identity avatar is the
  only floating HUD control (ADR-0205).
- **The avatar presents the verified `/api/me` identity, no new auth** (`hud-avatar-presents-verified-identity`)
  — unchanged from v1: initials from `me.email`, a role tint from `me.role` (`admin | member`, never an
  invented `builder`), and an honest fallback when identity is absent.
- **The avatar menu is a pure account surface** (`hud-avatar-menu-account-only`) — the read-only identity +
  role line and ONLY the gated account items (Members for admin, Credentials with the desktop bridge, Sign
  out on the hosted/IAP posture); NO Library entry, NO Documents entry, no navigation link of any kind
  (ADR-0205 — the map's library drawer is the one Library pathway, the lens dive the one document pathway).
- **Appearance is operator-attested, not asserted here** (ADR-0070 / ADR-0205) — prove geometry/behaviour
  only; the one-avatar HUD's look is the arc's stage-2 operator-attested leg. Do not author a visual verdict.
- **Every `hud-` contract test TITLE carries its unique id and the five are distinct** or `storytree
  coverage` silently drops coverage (`sdk-leaf-drops-contract-id-test-names` — the leaf regressed on this
  twice; the fix if it happens is TEST-TITLE-ONLY, never an assertion/source edit).
