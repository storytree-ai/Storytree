---
id: "collapsed-suggestion-view"
tier: capability
story: library-review
title: "A suggestion renders the proposed result by default, original behind a show-change toggle"
outcome: "A suggestion renders the PROPOSED RESULT by default (no strikethrough) with the original collapsed behind a 'show change' expand toggle; in Review mode a member may compose a suggested edit (POSTing a proposal), and an owner/admin sees Accept/Reject controls that drive the suggestion's decision through the api seam. Proven by behaviour, the appearance operator-attested."
status: proposed
proof_mode: integration-test
depends_on: [accept-reject-suggestion-api, suggestion-edit-store, review-mode-toggle]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors a vitest
# jsdom component test importing a NOT-YET-EXISTING component from a NEW source file under
# apps/studio/src/components (red = module-not-found at HEAD), then writes that one component (green).
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves GEOMETRY/BEHAVIOUR ONLY (proposed
# result shown by default + NO strikethrough; 'show change' expands the original; a member can compose
# a suggested edit POSTing a proposal; owner/admin Accept/Reject drive the decision through the api
# seam; a member does NOT see accept/reject controls) — the suggestion view's APPEARANCE (does the
# collapsed/expanded change read cleanly) is the story's operator-attested UAT leg 4 (do NOT add a
# visual assertion here).
#
# CRITICAL — apps/studio is VITEST + jsdom, NOT node:test → a `real.proofCommand` runs the ONE file
# under vitest (cwd = apps/studio). install: true + a typecheck wall. SCOPE = apps/studio/src. The api
# seam (the suggestion-create POST + the accept/reject decision) is MOCKED in the test — no real
# fetch/socket/DB.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/SuggestionView.test.tsx"
    sourceFile: "apps/studio/src/components/SuggestionView.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/SuggestionView.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/SuggestionView.tsx"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/SuggestionView.test.tsx"
---

# A suggestion renders the proposed result by default, original behind a show-change toggle

**Outcome —** A suggestion renders the PROPOSED RESULT by default (no strikethrough) with the original
collapsed behind a "show change" expand toggle; in Review mode a member may compose a suggested edit
(POSTing a proposal), and an owner/admin sees Accept/Reject controls that drive the suggestion's
decision through the `api` seam. Proven by behaviour, the appearance operator-attested.

**Depends on —** [`accept-reject-suggestion-api`](accept-reject-suggestion-api.md) (the decision the
controls drive), [`suggestion-edit-store`](suggestion-edit-store.md) (the suggestion record it renders),
[`review-mode-toggle`](review-mode-toggle.md) (compose shows only in Review mode).

> **Proof status (honest) — DATA/BEHAVIOUR VERDICT STANDS; the standalone UI is SUPERSEDED (ADR-0146).**
> This cap's `real:` behaviour arm signed a REAL PASS (`SuggestionView` verdict `@ b65087f`) — the
> suggestion DATA/behaviour layer it proved (proposed-result-by-default with no strikethrough, the
> "show change" expand, a member composing a proposal POSTed through the `api` seam, role-gated
> Accept/Reject driving the decision, plus the accept-apply splice) is VALID and STANDS as the layer
> under the editor. But the `SuggestionView` UI COMPONENT is **superseded by the `ReviewEditor`
> split-pane surface** (ADR-0146, which amends ADR-0140): a suggestion is now expressed as a CriticMarkup
> substitution (`{~~original~>proposed~~}`) rendered as a tracked change in the editor's preview, with
> accept/reject rewriting it back to clean markdown — so the standalone collapsed-suggestion card is no
> longer the mounted surface. The DATA proof (suggestion store + create/decision routes + accept-apply
> splice) is reused under that editor; only the rendered UI moved. Reconciling this cap's UI to the
> editor model (and the superseded `SuggestionView.tsx` component itself) is a librarian / story-author
> follow-on (ADR-0146 Consequences), surfaced, not done here. Its original appearance leg (UAT leg 4) is
> subsumed by the editor's owner-attested look (ADR-0070).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the SUGGESTION VIEW AS A WHOLE — a
behavioural React component that renders the proposed result by default (no strikethrough), expands the
original behind "show change", lets a member compose a suggested edit (POSTing a proposal), and gives
an owner/admin Accept/Reject controls that drive the decision through the `api` seam (and hides those
controls from a member) — spanning the collapsed/expanded render, the compose-and-POST, and the
role-gated decision over a scripted seam, not a single isolated assertion. It is the SUGGESTION half of
the in-flow model; the comment thread is cap 7, and the decision backend is cap 3.

PROPOSED RESULT BY DEFAULT, NO STRIKETHROUGH (the model — ADR-0140). A suggested deletion/replacement
renders the PROPOSED RESULT (what the prose would become) by default — NOT a strikethrough-the-old +
underline-the-new diff. The original is COLLAPSED behind a "show change" expand toggle; expanding it
reveals the original (so the reviewer can see what changed). This is the deliberate word-processor
choice (read the result, expand to audit the change) over a code-diff presentation. The test asserts:
the proposed text shows by default, NO strikethrough element is present, and the original is hidden
until "show change" is clicked.

COMPOSE IS A PROPOSAL (the seam to caps 2/4). In Review mode a member may compose a suggested edit to a
block — editing the prose produces a PROPOSED edit POSTed through the `api` seam (the suggestion-create
method), NOT a direct overwrite (a member cannot hard-edit, cap 4). The test scripts the seam and
asserts the compose POSTs a proposal (the proposed replacement + the block) with status `open`.

ROLE-GATED DECISION CONTROLS (the seam to cap 3). An owner/admin sees Accept/Reject controls on an
`open` suggestion; clicking them drives the decision through the `api` seam (the accept/reject method,
cap 3's route). A MEMBER does NOT see those controls (deciding is admin-only, cap 4) — the test renders
the view as a member and asserts the controls are absent, and as an admin and asserts clicking Accept
calls the decision seam. The view reads the caller's role (from `me`) to gate the controls; the SERVER
is the real wall (cap 4), this is the affordance gating.

THE TWO-STAGE PROOF (frontend-builder, ADR-0070). This `real:` arm proves GEOMETRY/BEHAVIOUR ONLY — the
proposed-result-by-default render (no strikethrough), the show-change expand, the compose-POST, the
role-gated decision controls — over jsdom with the `api` seam mocked. The view's APPEARANCE (does the
collapsed/expanded change read cleanly, ADR-0113 §9) is the story's operator-attested UAT leg 4 —
witnessed by the owner, NEVER a machine visual verdict here. Do NOT author a visual/appearance assertion.

OFFLINE-TESTABLE BY MOCKING THE SEAM (the `BuildSection.test.tsx` / chat-panel discipline).
`@vitest-environment jsdom`, `vi.mock('../api', …)` to script the suggestion-create POST + the
accept/reject decision, `@testing-library/react`, fake timers if needed. No real `fetch`, no socket, no
DB, no Electron — every outcome is scripted by the seam mock.

## Integration test

**Goal —** Prove that a suggestion renders the proposed result by default (no strikethrough) with the
original behind a "show change" toggle, that a member can compose a suggested edit (POSTing a proposal),
and that an owner/admin sees Accept/Reject controls (driving the decision through the seam) while a
member does not — entirely in jsdom, the `api` seam mocked.

The integration test exercises this capability against its **real in-story collaborator** — the `api`
seam (the suggestion-create POST + the accept/reject decision), scripted as a double. No stubs within
the view's own composition. It would:

1. Render `<SuggestionView>` for an `open` suggestion (with `proposed` + `original`). Assert the
   PROPOSED result text shows by default, NO strikethrough element is present, and the original is
   HIDDEN.
2. Click "show change" → assert the original is revealed (and collapses again on toggle) — the
   expand-to-audit affordance.
3. In Review mode as a member, compose a suggested edit on a block and submit → assert the `api`
   suggestion-create seam was called once with the proposed replacement + the block + status `open`
   (a proposal, not an overwrite).
4. Render an `open` suggestion as an ADMIN → assert Accept and Reject controls are present; click
   Accept → assert the `api` decision seam was called with `accept` for the suggestion id. Click Reject
   on another → asserts the seam called with `reject`.
5. Render the same `open` suggestion as a MEMBER → assert the Accept/Reject controls are ABSENT (a
   member cannot decide; affordance gating mirrors the cap-4 server wall).

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/SuggestionView.test.tsx`), the `api` seam mocked/scripted. None exist
yet; each is the assertion a contract test WILL prove once authored (re-cite at real `file:line` when
built). Per ADR-0122 each contract id leads a distinctly-named test so `storytree coverage
collapsed-suggestion-view` reports 4/4. None is an APPEARANCE assertion — the look is the story's
operator-attested UAT leg 4 (ADR-0070).

1. **`csv-proposed-result-by-default-no-strikethrough`** — the proposed result shows by default, no strikethrough
   - **asserts —** for an `open` suggestion the PROPOSED result text renders by default, NO
     strikethrough element is present, and the original is hidden — the word-processor presentation
     (read the result), not a code diff.
   - **covers —** `apps/studio/src/components/SuggestionView.tsx` (the default proposed-result render) *(provisional path)*
2. **`csv-show-change-expands-the-original`** — "show change" reveals (and re-collapses) the original
   - **asserts —** clicking "show change" reveals the original prose; toggling again re-collapses it —
     the expand-to-audit affordance.
   - **covers —** `apps/studio/src/components/SuggestionView.tsx` (the show-change toggle) *(provisional path)*
3. **`csv-member-composes-a-proposal`** — a member's edit POSTs a suggestion, not an overwrite
   - **asserts —** in Review mode a member composing a suggested edit and submitting calls the `api`
     suggestion-create seam once with the proposed replacement + the block + status `open` — a proposal,
     never a direct overwrite (a member cannot hard-edit).
   - **covers —** `apps/studio/src/components/SuggestionView.tsx` (the compose → suggestion-create POST) *(provisional path)*
4. **`csv-decision-controls-are-admin-only`** — owner/admin sees Accept/Reject; a member does not
   - **asserts —** an admin sees Accept + Reject on an `open` suggestion and clicking them calls the
     `api` decision seam with `accept` / `reject` for the suggestion id; a member does NOT see those
     controls — the role-gated affordance mirroring the cap-4 server wall.
   - **covers —** `apps/studio/src/components/SuggestionView.tsx` (the role-gated decision controls) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the suggestion view as a new
component, test-first.

- **The new test —** `apps/studio/src/components/SuggestionView.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react`, `vi.mock('../api', …)` to script the suggestion-create POST + the
  accept/reject decision — the `BuildSection.test.tsx` / `ChatPanel.test.tsx` shape; NO real
  `fetch`/socket/DB/Electron). Import `{ SuggestionView }` from `"./SuggestionView"`. Name each test for
  its contract id (`csv-…`) so `storytree coverage` reports 4/4 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `SuggestionView.tsx` does not exist at HEAD, so the test fails module-not-found (the net-new
  missing-symbol red, ADR-0057).
- **The GREEN —** write `apps/studio/src/components/SuggestionView.tsx`: a behavioural component that
  renders the proposed result by default (no strikethrough) with a "show change" expand for the
  original, composes a suggested edit POSTing a proposal through the `api` seam (add
  `api.createSuggestion` + `api.decideSuggestion`), and shows role-gated Accept/Reject controls driving
  the decision. WIRING it into the topic surface + the appearance are witnessed under the story's UAT
  leg 4 (operator-attested, ADR-0070), not asserted in CI. After it, the import resolves, the assertions
  hold, and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green.

Rules:

- **Proposed result by default, no strikethrough** — render what the prose becomes; the original is
  behind "show change". The test pins both (`csv-proposed-result-by-default-no-strikethrough`,
  `csv-show-change-expands-the-original`).
- **A member composes a proposal, never an overwrite** — compose POSTs a suggestion; a member cannot
  hard-edit (cap 4).
- **Decision controls are admin-only affordances** — owner/admin sees Accept/Reject; a member does not.
  The SERVER is the real wall (cap 4); this gates the affordance.
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove geometry/behaviour only; the
  look is the story's UAT leg 4. Do not author a visual verdict.
