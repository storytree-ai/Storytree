---
id: "verified-attribution"
tier: capability
story: studio
title: "Verified comment attribution — the comment composer presents and posts the verified `/api/me` identity, and the localStorage operator store retires"
outcome: "Comment attribution derives from the VERIFIED identity everywhere the operator field used to sit: the comment composer presents the verified identity read-only (`me.email` from `/api/me` when resolved, the conventional `operator` fallback in the open dev posture where `me.email` is null) — never a localStorage-sourced name and never an editable field — and posting a comment relies on the server's identity stamp (the verified identity on the scoped/hosted path; the `operator` fallback in the open dev posture), whatever the client still sends being derived from `/api/me`, never from localStorage. The localStorage operator store retires: `apps/studio/src/lib/operator.ts` (`useOperator`/`getOperator`, the `storytree.operator` key) is DELETED and no `storytree.operator` reference remains in `apps/studio/src` — a type-level retirement the `typecheck` wall proves (any leftover `useOperator` import breaks it). Behaviour only; any look change rides the arc's operator-attested leg (ADR-0070 stage 2)."
status: proposed
proof_mode: integration-test
depends_on: [dev-server-persistence-backbone]
decisions: [204, 8, 43, 42, 70]
# ⚠️ ADR STAMP — this capability is authored under ADR-0204 D4 ("Retire the studio banner…", accepted,
# amends ADR-0008, arc studio-hud-chrome-arc). NO NEW ADR — D4 is the deciding clause: finish the operator
# retirement inc 1 (hud-chrome, PR #756) began. Inc 1 removed the free-text operator FIELD from the chrome;
# THIS capability finishes it — comment attribution derives from the VERIFIED identity everywhere, and the
# localStorage operator store goes away.
#
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability inner-loop
# buildable — no NODE_BUILD_REGISTRY edit. BROWNFIELD (editsExisting: true), NO net-new component: the leaf
# authors a NET-NEW vitest jsdom test (`apps/studio/src/components/VerifiedAttribution.test.tsx`) that drives
# the EXISTING comment composer as FAILING-ASSERTION reds against the standing code — at HEAD `ReviewBlocks`
# reads `useOperator()` (the localStorage `storytree.operator` name) and feeds it as the comment `author`, and
# `apps/studio/src/lib/operator.ts` still exists. GREEN once the composer derives its identity from `me`
# (`/api/me`), the create path relies on the server stamp, `operator.ts` is DELETED, and no `storytree.operator`
# reference remains in `apps/studio/src`. THE OPERATOR-STORE DELETION IS TYPE-PROVEN at the `pnpm --filter studio
# typecheck` wall — a caller still importing `useOperator` after the module is gone breaks typecheck.
#
# NO LOOK LEG (ADR-0204 / ADR-0070 stage 2). Any appearance change (how the read-only identity foot reads) rides
# the arc's operator-attested look leg — do NOT author a visual/colour/pixel assertion here and do NOT sign a look
# verdict. The contracts prove BEHAVIOUR (what identity the composer presents, what author the post carries, the
# store's retirement), never look.
#
# CRITICAL — apps/studio is VITEST (apps/studio/vitest.config.ts, include src/**/*.test.{ts,tsx}), NOT node:test.
# resolveProveSpec's DEFAULT real proof command is `node --import tsx --test <testFile>` (node:test), which CANNOT
# run a vitest jsdom `.test.tsx`. So this cap MUST declare a `real.proofCommand` running the ONE test file under
# VITEST (cwd = apps/studio, so the path is package-relative). install: true (fresh-worktree tsx + tsc + vitest,
# ADR-0031 §2) + a `pnpm --filter studio typecheck` wall — the wall is where the operator.ts DELETION is proven.
#
# SCOPE — real.scope.sourceGlobs is DELIBERATELY GENEROUS (`apps/studio/src/**`): this cap edits several src
# files (`ReviewBlocks.tsx`, `InlineCommentThread.tsx`, the deleted `operator.ts`, possibly `index.css`), and
# every contract's `covers` MUST point at a file INSIDE real.scope.sourceGlobs or CONFIRM_GREEN fail-closes AFTER
# a full paid leaf run (`friction-cap-covers-outside-real-scope-burns-leaf-run`). Being generous is safe; being
# narrow burns a paid run. real.testFile is the ONE file `storytree coverage` scans, so EVERY `att-`-named
# contract test lives in `VerifiedAttribution.test.tsx` and its TITLE carries the unique `att-` id, or coverage
# silently drops N-1/N past the signed green (`sdk-leaf-drops-contract-id-test-names` — the fix if it happens is
# TEST-TITLE-ONLY, never an assertion/source edit).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/VerifiedAttribution.test.tsx"
    sourceFile: "apps/studio/src/components/ReviewBlocks.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/VerifiedAttribution.test.tsx"]
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
        - "src/components/VerifiedAttribution.test.tsx"
---

# Verified comment attribution — present and post the verified identity, retire the localStorage operator store

> **⚠️ Authored under ADR-0204 D4** — "Retire the studio banner: full-bleed forest with a HUD avatar on the
> verified identity" (accepted, `amends` ADR-0008, arc `studio-hud-chrome-arc`). D4 is the deciding clause; NO
> new ADR. This is **arc increment 2** — inc 1 ([`hud-chrome`](hud-chrome.md), PR #756) removed the free-text
> operator FIELD from the chrome; this capability finishes the retirement.

**Outcome —** Comment attribution derives from the **verified identity** everywhere the operator field used to
sit. The comment composer presents the verified identity **read-only** — `me.email` (from `GET /api/me`) when
resolved, the conventional `operator` fallback in the open dev posture where `me.email` is null — never a
localStorage-sourced name and never an editable field. Posting a comment relies on the **server's identity
stamp**: the verified identity on the scoped/hosted path (`apiRouter.ts` already ignores the client value and
stamps `scope.author`), the `operator` fallback in the open dev posture; whatever the client still sends is
derived from `/api/me`, never from localStorage. And the localStorage operator store **retires**:
`apps/studio/src/lib/operator.ts` (the `useOperator`/`getOperator` hook, the `storytree.operator` key) is
DELETED and no `storytree.operator` reference remains in `apps/studio/src` — a type-level retirement the
`typecheck` wall proves. This capability's contracts are **behaviour only**; any look change rides the arc's
operator-attested leg (ADR-0070 stage 2).

**Depends on —** [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md) — the SOLE upstream.
The composer presents the caller's identity (`me`, from `GET /api/me`) and posts through the comment create
path (`POST /api/comments`), both served by the backbone's `/api/*` middleware and its identity/server-stamp
handler (`apiRouter.ts`) — the same read/write path `dev-server-persistence-backbone` owns; that create/stamp
path delivered is this capability's precondition, so `depends_on: [dev-server-persistence-backbone]`.

> **Provenance note (no edge) —** the comment surface reworked here is the block-anchored review path —
> `ReviewBlocks` / `InlineCommentThread` (ADR-0140) — the LIVE successor to the retired text-selection
> `annotate-topic` capability (its text-span anchoring was retired by ADR-0146; the create path lives on as the
> block-anchored review surface). `annotate-topic` is deliberately NOT a `depends_on` edge: it is `status:
> retired`, and a `depends_on` into a retired node would trip topo-ordered story builds and read as live
> coupling that no longer exists. The only real, live prerequisite is `dev-server-persistence-backbone` (owner
> of `/api/me` + the comment create/stamp path).

> **Proof status (honest) — `proposed`, BROWNFIELD (editsExisting), NO net-new component.** The composer EXISTS
> and is green at HEAD wired the OLD way: `apps/studio/src/components/ReviewBlocks.tsx` calls `useOperator()`
> (line 71) — the localStorage `storytree.operator` name (`apps/studio/src/lib/operator.ts`, default
> `'operator'`, ADR-0008's single-local-operator relic) — and passes it as the `operator` prop into
> `InlineCommentThread`, whose `handlePost` sends `author: operator` on `api.createComment`
> (`InlineCommentThread.tsx:87`). ADR-0204 D4 retires all of it. A NET-NEW vitest jsdom test
> (`apps/studio/src/components/VerifiedAttribution.test.tsx`) drives the composer as failing-assertion reds
> against that standing code; GREEN once the composer derives its identity from `me` (`/api/me`), the post
> author derives from `/api/me` (never localStorage) and relies on the server stamp, and `operator.ts` is
> deleted. Status stays `proposed` — `healthy` is only ever DERIVED from signed verdicts (ADR-0020), never
> authored; the appearance is ADR-0070 stage-2 operator-attested, never a machine visual verdict.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the ATTRIBUTION REWORK AS A WHOLE — the composer
stops sourcing its author from localStorage and instead presents (read-only) and posts the verified `/api/me`
identity, AND the localStorage operator store is removed. It spans the composer's identity display, the
create-path author derivation, and the module retirement (type-proven), exercised against the real composer
render and the real `api` create seam — a behavioural integration of the whole attribution path, not a single
isolated assertion.

WHY THIS FINISHES WHAT `hud-chrome` STARTED (slow growth, the splitting-rule). ADR-0204 D4 retires ADR-0008's
localStorage single-operator model. Inc 1 ([`hud-chrome`](hud-chrome.md)) asserted ONLY that the free-text
operator FIELD is gone from the chrome; it deliberately left `apps/studio/src/lib/operator.ts` standing and did
NOT re-wire comment authorship (see hud-chrome.md "WHY THE FREE-TEXT OPERATOR FIELD RETIREMENT IS ONLY
HALF-DONE HERE"). THIS capability is that follow-on: it re-wires the author to the verified identity and DELETES
the store. The outcome is one sentence — *comment attribution derives from the verified identity everywhere, so
the localStorage operator store retires* — because the store's removal IS how the author stops coming from
localStorage: one common precondition (the comment composer), one observable (the author the post carries + no
`storytree.operator` in `src`). One capability, not two.

WHAT ALREADY EXISTS ON THE SERVER (do NOT rebuild it). The hosted/scoped create path ALREADY stamps the comment
author from the verified identity and IGNORES the client-sent value:
`apiRouter.ts:431` — `author: scope ? scope.author : asString(input.author).trim() || 'operator'`. Only the
open dev posture (JSON store, no identity scope) uses the client-sent author, falling back to `'operator'`.
This capability does NOT change the server stamp — it changes the CLIENT so the author it presents and sends
derives from `/api/me` (never localStorage), and RELIES ON that server stamp on the scoped path. The
server-side stamp is out of scope (already delivered); the contracts pin the CLIENT's observable behaviour.

THE COMPOSER PRESENTS THE VERIFIED IDENTITY (read-only). The comment composer (the block-anchored thread's
add-comment surface — `InlineCommentThread` today, rendered from `ReviewBlocks`) presents the verified identity
as READ-ONLY text (a `.composer-foot` display, OR equivalent — the exact class/element is the leaf's call). It
shows `me.email` when resolved (e.g. `hua.mick@gmail.com`); in the open dev posture where `me.email` is null it
shows the conventional `operator` fallback. It is NEVER an editable field (no `aria-label="operator identity"`
input, no text `<input>` a reviewer types a name into — that editable operator affordance is exactly what
ADR-0204 retires) and NEVER a localStorage-sourced name. `me` is already available via `useAppData()` (a
`MeInfo` = `{ email: string | null; role: UserRole | null }`, always present, `apps/studio/src/lib/appData.ts`)
— `ReviewBlocks` already imports it; the composer reads `me.email` where it read `useOperator()`.

THE POST AUTHOR DERIVES FROM `/api/me`, NOT LOCALSTORAGE, AND RELIES ON THE SERVER STAMP. Posting a comment
must no longer send a client-declared author sourced from `useOperator()`/localStorage. Whatever the client
still sends on `api.createComment({ …, author })` is derived from `/api/me` — `me.email` when resolved, the
`operator` fallback when null — and the create path RELIES on the server stamp (the scoped/hosted path
overwrites it with the verified identity; the open dev posture falls back to `'operator'`). The leaf's call
whether the client sends `me.email`, sends nothing (letting the server fallback stand), or sends the resolved
fallback — the CONTRACT pins that the sent author tracks `/api/me` and NEVER the `storytree.operator`
localStorage value.

THE LOCALSTORAGE OPERATOR STORE RETIRES (type-proven). `apps/studio/src/lib/operator.ts` (the
`useOperator`/`getOperator` hook and the `storytree.operator` key) is DELETED, and no `storytree.operator`
reference remains anywhere in `apps/studio/src`. The DELETION's real proof is the `pnpm --filter studio
typecheck` wall: after `operator.ts` is gone, any remaining `import { useOperator } from '../lib/operator'`
(today in `ReviewBlocks.tsx:49`) breaks the typecheck — a type-level retirement, the same discipline
`hud-chrome` used for the `home`-variant removal. The behavioural test additionally asserts the composer never
reads or writes the `storytree.operator` localStorage key.

OFFLINE-TESTABLE UNDER VITEST JSDOM (the SAME discipline `BuildSection.test.tsx` / `StoreBanner.test.tsx` use):
`@vitest-environment jsdom`, `@testing-library/react` for render / `fireEvent`, the identity driven by a
wrapped `AppDataContext.Provider` (a provided `me` with `email` set vs null), and `api.createComment` stubbed
(`vi.mock('../api')` or a spy) so the sent `author` argument is captured without a real `fetch`/socket/DB. The
`storytree.operator` non-use is asserted with a `localStorage` spy. NO real `fetch`/socket/SDK/DB/Electron.

NO LOOK LEG ON THIS CAPABILITY'S CONTRACTS (ADR-0204 / ADR-0070 stage 2). How the read-only identity foot READS
— its placement, tint, typography — rides the arc's operator-attested look leg. Do NOT author a
visual/colour/pixel assertion here, and the leaf does NOT sign a visual verdict. The contracts prove BEHAVIOUR
(what identity is presented, what author the post carries, the store's retirement), never look.

## Integration test

**Goal —** Prove the attribution rework against the real composer render and the real `api` create seam: the
comment composer presents the verified `/api/me` identity read-only (never a localStorage name, never an
editable field), the posted author derives from `/api/me` and relies on the server stamp, and the localStorage
operator store is gone — entirely under vitest jsdom, the identity driven by a wrapped `AppDataContext` and
`api.createComment` stubbed, no real `fetch`/socket/SDK/DB/Electron.

The integration test exercises this capability against its **real in-story collaborators** — the rendered
composer (`ReviewBlocks` / `InlineCommentThread`) and the studio `api` create client — with no stubs within the
composer itself. It would:

1. Render the comment composer with a verified identity (`me.email = 'hua.mick@gmail.com'`) and assert the
   composer presents that email in a read-only identity display (`.composer-foot` or equivalent, text — never
   an `<input>`); render it with `me.email = null` (the open dev posture) and assert it presents the
   conventional `operator` fallback; in both cases assert NO editable operator field renders anywhere (no
   `aria-label="operator identity"` input) and the displayed name is never sourced from localStorage.
2. With `api.createComment` stubbed, post a comment through the composer and assert the captured `author`
   argument tracks `/api/me` — `me.email` when resolved, the `operator` fallback when `me.email` is null —
   and NEVER the `storytree.operator` localStorage value (seed localStorage with a distinct
   `storytree.operator` name and assert the sent author does not equal it). Assert the create path relies on
   the server stamp (documented: the scoped path overwrites the client author; the open dev posture falls back
   to `'operator'`).
3. Assert the localStorage operator store is retired: rendering the composer and posting never reads or writes
   the `storytree.operator` key (a `localStorage` spy sees no `getItem`/`setItem` for it), and
   `apps/studio/src/lib/operator.ts` is deleted with no `useOperator` importer remaining (the type-level
   retirement proven by the `pnpm --filter studio typecheck` wall).

## Contracts (3)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/VerifiedAttribution.test.tsx`). Per ADR-0122 (`storytree coverage`) each contract id
is the lead of a distinctly-named test, so the coverage check reports 3/3 against the ONE `real.testFile`.
EVERY contract's `covers` points at a file INSIDE `real.scope.sourceGlobs` (`apps/studio/src/**`) — a contract
covering any file outside it fail-closes CONFIRM_GREEN after a full paid leaf run
(`friction-cap-covers-outside-real-scope-burns-leaf-run`). NONE of these is an APPEARANCE assertion — the
composer's look is ADR-0204 / ADR-0070 stage-2 operator-attested (the arc's look leg).

1. **`att-composer-shows-verified-identity`** — the composer presents the verified `/api/me` identity read-only, never a localStorage name and never an editable field
   - **asserts —** rendering the comment composer with a verified identity (`me.email = 'hua.mick@gmail.com'`,
     via a wrapped `AppDataContext.Provider`) shows that email in a read-only identity display (`.composer-foot`
     or equivalent — text, never an `<input>`); rendering it with `me.email = null` (the open dev posture)
     shows the conventional `operator` fallback; and in BOTH cases NO editable operator field renders anywhere
     (no `aria-label="operator identity"` input) and the displayed name is never sourced from the
     `storytree.operator` localStorage key.
   - **covers —** `apps/studio/src/components/InlineCommentThread.tsx` (the composer's read-only identity display)
   - **proven by —** `apps/studio/src/components/VerifiedAttribution.test.tsx` (net-new; wrapped `AppDataContext`, `@testing-library/react`).
2. **`att-post-author-from-verified-identity`** — posting a comment sends an author derived from `/api/me`, never from localStorage, and relies on the server stamp
   - **asserts —** with `api.createComment` stubbed, posting a comment through the composer calls it with an
     `author` that tracks `/api/me` — `me.email` when resolved, the `operator` fallback when `me.email` is null
     — and NEVER the `storytree.operator` localStorage value (seed localStorage with a distinct name and assert
     the sent author does not equal it). The create path relies on the server stamp (the scoped/hosted path
     overwrites the client author with the verified identity; the open dev posture falls back to `'operator'`)
     — the client no longer sources the author from `useOperator()`.
   - **covers —** `apps/studio/src/components/ReviewBlocks.tsx` (the `me`→author derivation replacing `useOperator`, passed to the composer)
   - **proven by —** `apps/studio/src/components/VerifiedAttribution.test.tsx`.
3. **`att-operator-store-retired`** — the localStorage operator store is deleted and no `storytree.operator` reference remains
   - **asserts —** `apps/studio/src/lib/operator.ts` (`useOperator`/`getOperator`, the `storytree.operator`
     key) is DELETED and no `useOperator` importer / `storytree.operator` reference remains in
     `apps/studio/src` — a type-level retirement proven by the `pnpm --filter studio typecheck` wall (any
     leftover `useOperator` import breaks it). Behaviourally, rendering the composer and posting a comment never
     reads or writes the `storytree.operator` localStorage key (a `localStorage` spy sees no `getItem`/`setItem`
     for it).
   - **covers —** `apps/studio/src/components/ReviewBlocks.tsx` (the `useOperator` import removed — the retirement site; the module deletion itself is typecheck-proven)
   - **proven by —** `apps/studio/src/components/VerifiedAttribution.test.tsx`.

## Guidance — the slice that earns the signed verdict

The rung toward `healthy` (ADR-0057 §3, BROWNFIELD `editsExisting`, no net-new component): re-wire the comment
composer's attribution to the verified identity and delete the operator store, test-first, against a
failing-assertion + type-level red.

- **The new test —** `apps/studio/src/components/VerifiedAttribution.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react`, the studio package convention — a wrapped `AppDataContext.Provider` for
  `me` and a stubbed `api.createComment` (`vi.mock('../api')` / spy) + a `localStorage` spy; NO real
  `fetch`/socket/SDK/DB/Electron). Name each test for its contract id (`att-…`) so `storytree coverage
  verified-attribution` reports 3/3 (ADR-0122) — the title MUST carry the id or coverage silently drops it.
- **The RED the spine observes (before IMPLEMENT) —** failing-assertion reds on the standing code: at HEAD the
  composer sources its author from `useOperator()`/localStorage (`ReviewBlocks.tsx:71` feeds `operator` to
  `InlineCommentThread`, which posts `author: operator`), presents no read-only verified-identity display, and
  `apps/studio/src/lib/operator.ts` still exists. Assert the read-only identity display (email + fallback), the
  no-editable-field / no-localStorage-name invariant, the post author tracking `/api/me`, and the store
  retirement (the `storytree.operator` non-use).
- **The GREEN —** (a) in `ReviewBlocks.tsx` and/or `InlineCommentThread.tsx`: derive the composer's identity
  from `me` (`useAppData().me.email ?? 'operator'`) where it read `useOperator()`, present it read-only, and
  send it (or nothing) as the `author` on `api.createComment` — relying on the server stamp; (b) DELETE
  `apps/studio/src/lib/operator.ts` and remove every `useOperator`/`getOperator` import; (c) if a
  `.composer-foot` (or equivalent) style is added, it lands in `apps/studio/src/index.css`. After it, the new
  test's assertions hold and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green (the
  typecheck wall is where the `operator.ts` deletion is proven — a dangling `useOperator` import breaks it).
  The live look of the identity foot is witnessed at the ADR-0204 / ADR-0070 stage-2 operator-attested leg, not
  asserted in CI.

Rules:

- **The composer presents the verified identity read-only** (`att-composer-shows-verified-identity`) — `me.email`
  when resolved, the `operator` fallback in the open dev posture; never an editable field, never a
  localStorage-sourced name.
- **The post author derives from `/api/me` and relies on the server stamp** (`att-post-author-from-verified-identity`)
  — the sent author tracks `me.email`/fallback, never the `storytree.operator` localStorage value; the server
  stamps the verified identity on the scoped path (already delivered — do NOT change the server).
- **The localStorage operator store retires** (`att-operator-store-retired`) — `lib/operator.ts` deleted, no
  `storytree.operator` reference in `apps/studio/src`; the deletion is proven by the `typecheck` wall.
- **Appearance is operator-attested, not asserted here** (ADR-0070 / ADR-0204) — prove behaviour only; the
  composer's look is the arc's stage-2 operator-attested leg. Do not author a visual verdict.
- **Every `att-` contract test TITLE carries its unique id** or `storytree coverage` silently drops coverage
  (`sdk-leaf-drops-contract-id-test-names` — the fix if it happens is TEST-TITLE-ONLY, never an
  assertion/source edit).
</content>
</invoke>
