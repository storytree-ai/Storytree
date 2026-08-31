---
id: "resolve-comment"
tier: capability
story: studio
title: "Resolve and reopen a comment"
outcome: "An operator resolves a comment with the resolved state persisted across every surface."
status: "retired"
proof_mode: "integration-test"
depends_on: [dev-server-persistence-backbone]
---

# Resolve and reopen a comment

> ## ⚠ RETIRED, 2026-08-31 — ADR-0425 dec 1, recorded by `prove-unproven-capabilities-arc` inc-25
>
> **This capability's outcome names an OPERATOR, and there is no longer any operator-reachable way to
> resolve a comment.** ADR-0425 dec 1 retired studio commenting deliberately — not by neglect —
> naming MULTIPLAYER as the revival trigger, on the owner's own evidence that he never adopted it and
> grounds his conversations against the Library from Claude Code or Codex instead.
>
> **Verified at source, 2026-08-31, in this worktree.** Every surface this spec's twelve contracts and
> its eight-step integration walkthrough name is deleted:
> - `apps/studio/src/components/CommentPanel.tsx` — absent. It owned the ONLY write
>   (`toggleResolved`), the header open-count badge, the row class + pill, the `hide resolved`
>   toggle, and the Resolve/Reopen button label — contracts 5–9.
> - `apps/studio/src/lib/useAnnotations.tsx` — absent (the section-heading badge, contract 10).
> - `apps/studio/src/lib/annotate.ts` — absent (the gutter tick, contract 11).
> - No component anywhere under `apps/studio/src` calls `api.updateComment`; grepped 2026-08-31, the
>   only two hits in `src/` are the client method's own definition and a prose comment about its
>   retirement.
>
> **THIS IS A RETIREMENT OF THE CAPABILITY, NOT OF THE CODE UNDERNEATH IT — and the distinction is
> ADR-0425 dec 5, which must not be read backwards.** The server-side comment store, the
> `PATCH /api/comments?id` route and its `resolvedAt` stamp/clear, the client methods
> `api.createComment` / `updateComment` / `deleteComment`, and the proven `InlineCommentThread` +
> `ReviewBlocks` pair are all DELIBERATELY KEPT as the foundation a multiplayer revival would build
> on; dec 5 says so in terms, and adds that finding them costly is a reason to revisit that clause in
> place rather than to delete the store on the way past. So a later session must NOT read this
> retirement as licence to sweep `api.updateComment` out of `apps/studio/src/api.ts`: a client method
> with no caller is exactly what dec 5 chose to carry, and it costs nothing at rest.
>
> What is retired is the CAPABILITY — a unit whose outcome is an operator act nobody can perform.
> When multiplayer arrives, the revival re-mounts a resolve affordance and re-authors this unit
> against whatever surface it lands on; it does not un-retire this spec, whose every file citation is
> dead.
>
> **The story UAT already records the other half of this.** `studio#uat-13` asserts `comments.json`
> comes back byte-identical after the whole walkthrough — the standing machine proof that no studio
> surface writes a comment anywhere (ADR-0425 dec 3).
>
> **Everything below is kept verbatim as HISTORY.** Read no path in it as current.

**Outcome —** An operator resolves a comment with the resolved state persisted across every surface.

**Depends on —** [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md)

> **Proof status (honest, as written in 2026-06 — every file it cites is now deleted) —** CODE EXISTS AND RUNS, NO AUTOMATED PROOF. All cited behaviours work in the live app under `pnpm --filter studio dev`: toggleResolved PATCHes and refreshes (CommentPanel.tsx:89-92), the dev-API stamps/clears resolvedAt and 404s on unknown id (devApi.ts:225-240), and every propagation surface (header badge CommentPanel.tsx:54,104; hide-resolved toggle :106; row class+pill :185,190; button label :208; section heading badge useAnnotations.tsx:248-255; gutter tick annotate.ts:271,277; sidebar openCount appData.ts:27-28) is wired off the single resolved flag. NONE of the 12 contracts and NO integration test exist as runnable artifacts — no test runner, no jsdom config, no scripted/recorded integration test. RETROSPECTIVE spec; UNPROVEN by any automated check or executed walkthrough. Manual verification (clicking Resolve/Reopen and inspecting comments.json) is the only proof to date.

## Guidance

WHY depends_on is code-derived to ONLY dev-server-persistence-backbone (ADR-0010 §3): read off the source, resolve-comment's code couples to the backbone and to nothing else in-story. Its one write — toggleResolved → api.updateComment → PATCH /api/comments?id — lands in the backbone's handler (devApi.ts:225-239), and its read-back — refreshComments → GET /api/comments — is the backbone's handler too. It imports NONE of annotate-topic's create path: the two surfaces only share the Comment shape and the comments.json file, which is data adjacency, not a code edge. So although the synthesis pass once named annotate-topic as an upstream, static analysis finds no import/call from resolve into annotate — the edge is reconciled OUT. (The integration test below renders a corpus doc to exercise the section-badge and gutter surfaces — a real read-corpus collaborator used as test scaffolding, which is NOT a dependency edge (ADR-0010 §5; owner call 2026-06-06). See the resolution note at the foot of this file.)

THE PROPAGATION IS SINGLE-SOURCE, FAN-OUT. There is no per-surface resolve logic — flipping one boolean (`resolved`) plus the server stamping `resolvedAt` drives every surface derivatively. The toggle is the ONLY write (CommentPanel.tsx:89-91); everything else is a pure re-derivation after refreshComments repopulates the shared AppData.comments array (App.tsx:23-24). That is why the contracts are mostly tiny isolated derivations (count, class, label, badge text, tick flag) and the cross-surface choreography — every surface flipping off the one flag at once, against the real backbone — is the integration test's job.

TWO DECORATION MECHANISMS, KNOW THE SEAM. React-rendered surfaces (open-count badge, hide-resolved toggle, row class+pill, button label, Sidebar/Library badges) update by normal re-render off props/state. But the gutter ticks and section-heading 💬 badges are IMPERATIVE DOM mutations (useAnnotations.tsx:85-93 runs applyHighlights + updateHeadingBadges in a useLayoutEffect) because the markdown subtree is memoized and React never reconciles it. So contracts for those two surfaces test the plain functions (applyHighlights, updateHeadingBadges) against a jsdom root, NOT via React render assertions.

PATCH ROUTING QUIRK: the comment id travels as a QUERY param (?id=…), not a path segment — handleComments reads url.searchParams.get('id') (devApi.ts:226). resolvedAt is set/cleared ONLY inside the `typeof patch.resolved === 'boolean'` branch (devApi.ts:233-236), so a body-only PATCH (edit) deliberately leaves resolvedAt untouched. The 404-on-unknown-id is a thrown HttpError caught and mapped by the middleware (devApi.ts:372-375), so a handler-level contract asserts the throw/status with writeStore stubbed-and-not-called.

HONESTY: there is NO test harness wired yet (no vitest/jest config, no jsdom setup, no supertest). Every contract is the unit test that WOULD prove the leaf and the section below is the integration test that WOULD prove the fan-out; none exist in-repo. The behaviours themselves are real and currently working in the running app.

## Integration test

**Goal —** An operator resolves a comment and watches the resolved state propagate across every surface, then reopens it and watches every surface revert — with resolvedAt stamped then cleared in comments.json.

The integration test exercises resolve-comment against its **real in-story
collaborator** — the real `dev-server-persistence-backbone` (the PATCH write and the
GET re-fetch are both its handlers) — with **no stubs within the organism**
(ADR-0010 §2/§5). It seeds the target comment directly (the create path is not in scope)
and drives the real fan-out across every surface. It would:

1. PRECONDITION: start the studio with `pnpm --filter studio dev`, and seed ONE comment directly into apps/studio/data/comments.json (the create flow is NOT exercised here) — make it a SECTION-anchored comment (anchor.kind 'section' with a real headingSlug for a heading that exists in the target doc) so the section-heading badge surface is in play, on a doc topicId, with resolved:false and resolvedAt:null. Open that doc in the browser so the CommentPanel and the rendered article (gutter + section badges) are both visible.
2. ASSERT the unresolved baseline across surfaces: the Comments header shows the open-count badge including this comment (CommentPanel.tsx:104); the comment row has NO 'resolved' class and NO 'resolved' pill (CommentPanel.tsx:185,190); there is NO 'hide resolved' toggle (CommentPanel.tsx:106 renders it only when some comment is resolved); the section's heading 💬 button shows a non-zero count and the has-comments style (useAnnotations.tsx:253-256); and in the left Sidebar the doc's open-count badge includes it (Sidebar.tsx:68 via openCount). (If a TEXT-anchored comment is seeded instead, the gutter tick at annotate.ts:277 / useAnnotations.tsx:182 is the surface in play in place of the section badge.)
3. Click the comment's 'Resolve' button (CommentPanel.tsx:207-208). This fires toggleResolved → api.updateComment(id,{resolved:true}) (a real PATCH /api/comments?id=… round-trip, CommentPanel.tsx:89-91, api.ts:44-45) → on success refreshComments re-fetches GET /api/comments (App.tsx:23-24).
4. ASSERT the resolved state propagates WITHOUT a manual reload: the header open-count badge decrements (and disappears if it hit zero) because openTotal counts only !resolved (CommentPanel.tsx:54,104); the comment row gains the 'resolved' class and shows the 'resolved' pill (CommentPanel.tsx:185,190); the 'hide resolved' toggle now APPEARS (CommentPanel.tsx:106); the section heading 💬 badge count drops by one / reverts to plain 💬 (useAnnotations.tsx:248-250,255); and the Sidebar doc badge decrements (appData.ts:28).
5. READ apps/studio/data/comments.json on disk and ASSERT the seeded comment now has resolved:true and a non-null ISO resolvedAt timestamp (devApi.ts:233-236) — the persistence half of the goal, written by writeStore through the real backbone.
6. Click the SAME button, now labelled 'Reopen' (CommentPanel.tsx:208). This PATCHes {resolved:false} and refreshes again.
7. ASSERT every surface REVERTS to the unresolved baseline: open-count badge climbs back, row loses the 'resolved' class+pill, the 'hide resolved' toggle disappears again (no comment is resolved), the section heading badge count returns, the Sidebar badge climbs back.
8. RE-READ comments.json and ASSERT resolved:false and resolvedAt cleared back to null (devApi.ts:235) — completing the round-trip.

> **Note (resolved) —** This integration test renders a real corpus document (to put the
> section-badge and gutter surfaces in play), which exercises `read-corpus`'s code — yet
> `depends_on` lists only the backbone, because static analysis of resolve-comment's own
> modules finds no import/call into read-corpus. That is **correct, not a missing edge**:
> dependency edges track code coupling (ADR-0010 §3); a test may exercise any real
> in-story collaborator as scaffolding without that becoming an edge (ADR-0010 §5). Owner
> call 2026-06-06: keep `resolve-comment` separate, **no** `resolve-comment → read-corpus`
> edge.

## Contracts (12)

The test-proven leaf behaviours — each **one isolated automated test** with
collaborators stubbed (ADR-0002). No automated tests exist yet; each entry is the
assertion a contract test *would* prove, with the real code it covers.

1. **`rsv-patch-resolve-stamps-resolvedat`** — PATCH resolved:true stamps resolvedAt
   - **asserts —** handleComments given method PATCH with body {resolved:true} for an existing comment writes that comment back with resolved=true and a non-null ISO resolvedAt, and responds 200 with the updated comment.
   - **covers —** `apps/studio/server/devApi.ts:233-236,237-239`
2. **`rsv-patch-reopen-clears-resolvedat`** — PATCH resolved:false clears resolvedAt to null
   - **asserts —** handleComments given method PATCH with body {resolved:false} for a comment that was resolved (resolvedAt set) writes it back with resolved=false and resolvedAt=null.
   - **covers —** `apps/studio/server/devApi.ts:235`
3. **`rsv-patch-unknown-id-404`** — PATCH on unknown comment id 404s
   - **asserts —** handleComments PATCH with an id matching no comment responds 404 'comment not found' and never calls writeStore.
   - **covers —** `apps/studio/server/devApi.ts:227-228`
4. **`rsv-updatecomment-client-issues-patch`** — updateComment client PATCHes the id-scoped endpoint
   - **asserts —** api.updateComment(id,{resolved:true}) issues a PATCH to /api/comments?id=<encoded id> with a JSON body {resolved:true} and returns the parsed comment.
   - **covers —** `apps/studio/src/api.ts:44-45`
5. **`rsv-toggleresolved-flips-and-refreshes`** — Resolve/Reopen click toggles the flag then refreshes
   - **asserts —** toggleResolved(comment) calls api.updateComment with resolved set to the NEGATION of the comment's current resolved value, then awaits refreshComments.
   - **covers —** `apps/studio/src/components/CommentPanel.tsx:89-91`
6. **`rsv-open-count-badge-counts-unresolved`** — Header open-count badge counts only unresolved
   - **asserts —** Rendering CommentPanel over a comments set with a mix of resolved/unresolved shows the header badge equal to the count of comments with resolved===false for the topic (and the badge is absent when that count is 0).
   - **covers —** `apps/studio/src/components/CommentPanel.tsx:54,104`
7. **`rsv-hide-resolved-toggle-conditional`** — 'hide resolved' toggle appears only when some comment is resolved
   - **asserts —** CommentPanel renders the 'hide resolved' checkbox when at least one topic comment has resolved===true, and omits it when none are resolved.
   - **covers —** `apps/studio/src/components/CommentPanel.tsx:106`
8. **`rsv-resolved-row-class-and-pill`** — Resolved comment row gets the resolved class and pill
   - **asserts —** A comment with resolved===true renders its <li> with the 'resolved' class and shows the 'resolved' pill; an unresolved comment shows neither.
   - **covers —** `apps/studio/src/components/CommentPanel.tsx:185,190`
9. **`rsv-resolve-toggles-button-label`** — Action button label reflects resolved state
   - **asserts —** The per-comment action button reads 'Reopen' when resolved===true and 'Resolve' when resolved===false.
   - **covers —** `apps/studio/src/components/CommentPanel.tsx:208`
10. **`rsv-heading-badge-excludes-resolved`** — Section heading badge count excludes resolved comments
   - **asserts —** updateHeadingBadges, given a section-anchored comment that is resolved, leaves that heading's .md-comment-btn at plain '💬' without the has-comments class; an equivalent unresolved comment yields '💬 1' with has-comments.
   - **covers —** `apps/studio/src/lib/useAnnotations.tsx:248-250,255`
11. **`rsv-gutter-tick-resolved-flag`** — Gutter tick carries the resolved style for resolved text comments
   - **asserts —** applyHighlights, given a resolved text-anchored comment whose quote is found, returns a GutterTick with resolved===true (and marks the <mark> with data-resolved='true').
   - **covers —** `apps/studio/src/lib/annotate.ts:271,277`
12. **`rsv-opencount-helper-excludes-resolved`** — openCount helper (sidebar/list badge) excludes resolved
   - **asserts —** openCount(comments,topicId) returns the number of comments for that topic with resolved===false, ignoring resolved ones and other topics.
   - **covers —** `apps/studio/src/lib/appData.ts:27-28`
