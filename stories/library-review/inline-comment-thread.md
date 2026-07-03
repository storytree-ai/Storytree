---
id: "inline-comment-thread"
tier: capability
story: library-review
title: "A block-anchored comment thread rendered in the document flow, not a side panel"
outcome: "In Review mode the studio renders a comment thread IN the document flow above its anchored block (a code-review thread), placeable at any block, and lets a member post a new block-anchored comment there; the thread is fed by the live-refresh feed so a posted comment appears on the next poll without a reload. Never a side panel. Proven by behaviour, the appearance operator-attested."
status: proposed
proof_mode: integration-test
depends_on: [block-position-comment-anchor, review-refresh-feed, review-mode-toggle]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors a vitest
# jsdom component test importing a NOT-YET-EXISTING component from a NEW source file under
# apps/studio/src/components (red = module-not-found at HEAD), then writes that one component (green).
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves GEOMETRY/BEHAVIOUR ONLY (a thread
# renders in-flow above its block; a new comment POSTs a BLOCK anchor through the api seam; the feed
# refresh surfaces a posted comment; the thread is in-flow, not a side panel — asserted structurally,
# e.g. the thread node is a sibling/child of the block, not of an aside) — the thread's APPEARANCE
# (does it read as a code-review thread) is the story's operator-attested UAT leg 2 (do NOT add a
# visual assertion here).
#
# CRITICAL — apps/studio is VITEST + jsdom, NOT node:test → a `real.proofCommand` runs the ONE file
# under vitest (cwd = apps/studio). install: true + a typecheck wall. SCOPE = apps/studio/src. The api
# seam (the comment-create POST + the feed poll) is MOCKED in the test (the BuildSection/ChatPanel
# discipline) — no real fetch/socket/DB.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/InlineCommentThread.test.tsx"
    sourceFile: "apps/studio/src/components/InlineCommentThread.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/InlineCommentThread.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/InlineCommentThread.tsx"]
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
        - "src/components/InlineCommentThread.test.tsx"
---

# A block-anchored comment thread rendered in the document flow, not a side panel

**Outcome —** In Review mode the studio renders a comment thread IN the document flow above its
anchored block (a code-review thread), placeable at any block, and lets a member post a new
block-anchored comment there; the thread is fed by the live-refresh feed so a posted comment appears on
the next poll without a reload. Never a side panel. Proven by behaviour, the appearance operator-attested.

**Depends on —** [`block-position-comment-anchor`](block-position-comment-anchor.md) (the anchor it
renders + posts), [`review-refresh-feed`](review-refresh-feed.md) (the live source it polls),
[`review-mode-toggle`](review-mode-toggle.md) (it shows only in Review mode).

> **Proof status (honest) — DATA/BEHAVIOUR VERDICT STANDS; the standalone UI is SUPERSEDED (ADR-0146).**
> This cap's `real:` behaviour arm signed a REAL PASS (`InlineCommentThread` verdict `@ dfacfbb`) — the
> block-anchored comment DATA/behaviour layer it proved (a comment renders in the document flow above
> its block, a new comment POSTs a `kind:'block'` anchor through the `api` seam, the feed-driven
> refresh, the Review-only affordance) is VALID and STANDS as the layer under the editor. But the
> `InlineCommentThread` UI COMPONENT is **superseded by the `ReviewEditor` split-pane surface**
> (ADR-0146, which amends ADR-0140): Review-mode editing is now a split source/preview markdown editor
> with CriticMarkup comments (`{>>comment<<}`), so the standalone in-flow thread component is no longer
> the mounted commenting surface. The DATA proof (block anchor + comment store + feed) is reused under
> that editor; only the rendered UI moved. Reconciling this cap's UI to the editor model (and the
> superseded `InlineCommentThread.tsx` component itself) is a librarian / story-author follow-on
> (ADR-0146 Consequences), surfaced, not done here. Its original appearance leg (UAT leg 2) is subsumed
> by the editor's owner-attested look (ADR-0070).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the INLINE THREAD AS A WHOLE — a
behavioural React component that renders a block's comments in the document flow above that block,
lets the user add a comment there (POSTing a BLOCK anchor through the `api` seam), and re-renders from
the live feed when it refreshes — spanning the in-flow render, the block-anchored post, and the
feed-driven refresh over a scripted seam, not a single isolated assertion. It is the COMMENT half of
the in-flow model; the suggestion rendering is cap 8, and the block anchor it posts is cap 1.

IN THE FLOW, NOT A SIDE PANEL (the model — ADR-0140). The thread renders ABOVE its anchored block, in
the document flow, like a code-review comment thread — NOT in a right-hand side panel (it REPLACES
`CommentPanel.tsx`). This is the load-bearing structural observable: the test asserts the thread node
is positioned in the document flow relative to its block (a sibling/child of the block container), NOT
inside an `aside` / side-panel container. A comment is placeable at ANY block (the thread can attach
above any block in the rendered topic), which is why the anchor is a block position (cap 1), not a text
span.

POSTS A BLOCK ANCHOR (the seam to cap 1). Adding a comment from the thread POSTs through the studio
`api` client (the comment-create method) with a BLOCK anchor (`kind: 'block'`, the block handle), never
a text-quote anchor — the text-selection path is gone (cap 9). The test scripts the `api` seam and
asserts the POST carries the block anchor for the thread's block.

FED BY THE LIVE FEED (the seam to cap 5). The thread's comments come from the review-refresh feed (cap
5), re-polled on the existing 30 s visibility-gated cadence (`usePresence`'s `PRESENCE_POLL_MS`). The
test scripts the feed seam to return an extra comment on a later poll and asserts the thread
re-renders with it (fake timers drive the poll) — a posted comment appears without a reload. No
real-time; the poll is the mechanism.

SHOWN ONLY IN REVIEW (the seam to cap 6). The thread's commenting affordance appears only when the mode
toggle (cap 6) is in Review; in View the thread is read-only (existing comments may render, but the
add-comment affordance is hidden). The test drives the mode prop/context and asserts the affordance
gating.

THE TWO-STAGE PROOF (frontend-builder, ADR-0070). This `real:` arm proves GEOMETRY/BEHAVIOUR ONLY — the
in-flow placement (structural), the block-anchored POST, the feed-driven refresh, the Review-only
affordance — over jsdom on fake timers with the `api` seam mocked. The thread's APPEARANCE (does it read
as a clean code-review thread, ADR-0113 §9) is the story's operator-attested UAT leg 2 — witnessed by
the owner, NEVER a machine visual verdict here. Do NOT author a visual/appearance assertion.

OFFLINE-TESTABLE BY MOCKING THE SEAM (the `BuildSection.test.tsx` / chat-panel discipline).
`@vitest-environment jsdom`, `vi.mock('../api', …)` to script the comment-create POST + the feed poll,
`@testing-library/react`, fake timers to drive the poll transitions. No real `fetch`, no socket, no DB,
no Electron — every refresh is scripted by the seam mock.

## Integration test

**Goal —** Prove that the inline thread renders a block's comments in the document flow above that
block (not a side panel), POSTs a new comment with a BLOCK anchor through the `api` seam, refreshes from
the live feed when it re-polls (a posted comment appears without a reload), and gates the add-comment
affordance on Review mode — entirely in jsdom on fake timers, the `api` seam mocked.

The integration test exercises this capability against its **real in-story collaborator** — the `api`
seam (the comment-create POST + the feed poll), scripted as a double exactly as `BuildSection.test.tsx`
scripts `api.build`/`api.buildStatus`. No stubs within the thread's own composition. It would:

1. Render `<InlineCommentThread>` for a block in Review mode with the feed seam scripted to return one
   block-anchored comment. Assert the comment renders in the thread, and the thread node is positioned
   in the document FLOW relative to its block (a sibling/child of the block container) — NOT inside a
   side-panel `aside`.
2. Type a comment and submit → assert the `api` comment-create seam was called once with a BLOCK anchor
   (`kind: 'block'`, the thread's block handle) and the typed body — a block-anchored post, never a
   text-quote anchor.
3. Advance fake timers to the next feed poll, scripted to return an ADDITIONAL comment for the block →
   assert the thread re-renders with the new comment WITHOUT a reload (the live refresh).
4. Render the same thread in VIEW mode → assert the add-comment affordance is hidden (existing comments
   may still render read-only) — the Review-only gating (cap 6 seam).
5. (Slow-growth) a blank/whitespace comment submit → assert NO seam call (the empty-comment guard).

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest
jsdom, `apps/studio/src/components/InlineCommentThread.test.tsx`), the `api` seam mocked/scripted. None
exist yet; each is the assertion a contract test WILL prove once authored (re-cite at real `file:line`
when built). Per ADR-0122 each contract id leads a distinctly-named test so `storytree coverage
inline-comment-thread` reports 4/4. None is an APPEARANCE assertion — the look is the story's
operator-attested UAT leg 2 (ADR-0070).

1. **`ict-renders-in-flow-above-its-block`** — the thread renders in the document flow, not a side panel
   - **asserts —** for a block with one comment, the thread renders the comment ABOVE/with its block in
     the document flow (the thread node is a sibling/child of the block container), and is NOT inside a
     side-panel `aside` container — the structural in-flow placement (the load-bearing replacement of
     `CommentPanel.tsx`).
   - **covers —** `apps/studio/src/components/InlineCommentThread.tsx` (the in-flow render) *(provisional path)*
2. **`ict-posts-a-block-anchored-comment`** — adding a comment POSTs a block anchor through the api seam
   - **asserts —** typing a comment and submitting calls the `api` comment-create seam EXACTLY once with
     a BLOCK anchor (`kind: 'block'`, the thread's block handle) and the typed body — a block-anchored
     post, never a text-quote anchor.
   - **covers —** `apps/studio/src/components/InlineCommentThread.tsx` (the block-anchored POST) *(provisional path)*
3. **`ict-refreshes-from-the-live-feed`** — a later feed poll surfaces a posted comment without a reload
   - **asserts —** advancing fake timers to the next feed poll (scripted to return an additional comment
     for the block) re-renders the thread with the new comment, no reload — the live-refresh feed
     (cap 5) consumed on the 30 s cadence.
   - **covers —** `apps/studio/src/components/InlineCommentThread.tsx` (the feed-driven refresh) *(provisional path)*
4. **`ict-add-affordance-is-review-only`** — the add-comment affordance shows only in Review mode
   - **asserts —** in Review mode the add-comment affordance is present; in View mode it is hidden
     (existing comments may render read-only) — the Review-only gating (the cap 6 mode seam). The
     blank-comment client-side guard (no seam call on an empty submit) is asserted within this contract's
     sibling case.
   - **covers —** `apps/studio/src/components/InlineCommentThread.tsx` (the mode gating + empty guard) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the thread as a new component,
test-first.

- **The new test —** `apps/studio/src/components/InlineCommentThread.test.tsx` (`@vitest-environment
  jsdom`, vitest + `@testing-library/react`, `vi.mock('../api', …)` to script the comment-create POST +
  the feed poll, fake timers — the `BuildSection.test.tsx` / `ChatPanel.test.tsx` shape; NO real
  `fetch`/socket/DB/Electron). Import `{ InlineCommentThread }` from `"./InlineCommentThread"`. Name each
  test for its contract id (`ict-…`) so `storytree coverage` reports 4/4 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `InlineCommentThread.tsx` does not exist at HEAD, so the test fails module-not-found (the net-new
  missing-symbol red, ADR-0057).
- **The GREEN —** write `apps/studio/src/components/InlineCommentThread.tsx`: a behavioural component
  that renders a block's comments in the document flow above the block, POSTs a new comment with a block
  anchor through the `api` seam (add an `api.createReviewComment` / reuse the comment-create method
  carrying the block anchor), and re-renders from the feed poll (reusing `PRESENCE_POLL_MS`), gated on
  Review mode (cap 6). WIRING it into DocView/AssetView (replacing the `CommentPanel` mount) + the
  appearance are witnessed under the story's UAT leg 2 (operator-attested, ADR-0070), not asserted in
  CI. After it, the import resolves, the assertions hold, and `pnpm --filter studio test` + `pnpm
  --filter studio typecheck` stay green.

Rules:

- **In the flow, never a side panel** — the thread renders above its block in the document flow (a
  code-review thread); the structural test pins this (`ict-renders-in-flow-above-its-block`).
- **Block anchor only** — a new comment POSTs a block anchor, never a text-quote span (the text path is
  gone, cap 9).
- **Live refresh, no real-time** — re-render from the feed poll on the 30 s cadence; no cursor / OT.
- **Review-only affordance** — the add-comment affordance shows only in Review mode (cap 6 seam).
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove geometry/behaviour only; the
  look is the story's UAT leg 2. Do not author a visual verdict.
