---
id: "library-review"
tier: story
title: "Review mode — a word-processor collaboration layer for library documents"
outcome: "A member opens a library open-question in Review mode, drops an inline comment at a block position, and proposes a collapsed suggestion the owner accepts — comments and suggestions placed in the document flow (never a side panel), and the old text-selection anchoring is gone."
status: proposed
proof_mode: UAT
# Frontend legs (the Review toggle, the inline thread, the collapsed-suggestion controls) are
# operator-attested per ADR-0070 — a UI an agent cannot drive is a human-witness UAT action, not a
# machine visual verdict (uat-proves-the-goal-not-the-surface). The backend journey (open-question
# read, block-anchored comment persisted, suggestion proposed → accepted, state transitions, the
# member-suggest write policy, the live-refresh feed) is machine-witnessed. So the story is mixed-
# witness and carries NO blanket `uat_witness: machine` override — each UAT leg below marks its own
# witness (ADR-0040 fail-closed default for the un-drivable surfaces).
capabilities: [block-position-comment-anchor, suggestion-edit-store, accept-reject-suggestion-api, member-suggest-write-policy, review-refresh-feed, review-mode-toggle, inline-comment-thread, collapsed-suggestion-view, remove-text-selection-anchoring]
# Consumer-side outbound edges (code-evidenced):
#  - library: the comment + suggestion stores live in `@storytree/library/store` (pg-comment-store.ts
#    and the new pg-suggestion-store), the same node-only subpath the studio's PgBackend already rides;
#    the suggestion record validates Tier/Status-adjacent shapes at its write boundary. The studio
#    server resolves library docs (the open-questions Review mode targets) through the library backend.
#  - studio-members: the member-suggest write policy resolves the caller's role with `resolveAccess`
#    (members comment + suggest; owner/admin accept/reject + hard-edit) — the SAME compute guestPolicy
#    already calls. No new role is added (members + admins suffice); this consumes the existing one.
# These are CONSUMED seams (this story imports them), not absorbed — the within-`studio`-organism
# work (the inline UI, the accept/reject route, the policy evolution) all sits in apps/studio, but the
# persistence + role compute are library / studio-members organisms, so the edges are declared.
depends_on: [library, studio-members]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [library]
# Relevant ADRs: ADR-0140 (Library Review mode) — the governing model; ADR-0146 (amends 0140) — the
# editing interaction: Review-mode editing is a split-pane markdown editor with CriticMarkup tracking.
# ADR-0140 records the model: block-position (not text-span) comment anchoring, suggestions-as-proposals
# (accept/reject, proposed-result-by-default rendering, no strikethrough), the member/owner role split,
# async live-refresh (no real-time), and the clean removal of the old text-selection / quote anchoring.
# ADR-0146 settles HOW you author: a top-left View↔Edit toggle, a split markdown-source + live-preview
# pane, and comments + tracked changes as CriticMarkup inserted by a toolbar — reusing the caps-6–8 DATA
# proofs (block model, suggestion store + routes, accept-apply splice) while superseding their standalone
# UI components.
decisions: [140, 146]
---

# Review mode — a word-processor collaboration layer for library documents

**Outcome —** A member opens a library open-question in Review mode, drops an inline comment at a
block position, and proposes a collapsed suggestion the owner accepts — comments and suggestions
placed in the document flow (never a side panel), and the old text-selection anchoring is gone.

This is a responsive, word-processor-feel collaboration layer for library documents — especially
**open questions**, the unresolved decisions a team argues out before they become ADRs. It replaced
the old right-panel comment form (`CommentPanel.tsx`) and the old text-selection / quote anchoring
(`annotate.ts` + `useAnnotations.tsx`) — all three now DELETED (cap 9, the clean swap) — with two moves
borrowed from a word processor and a code review. **The landed editing surface is the split-pane
markdown editor (ADR-0146, amending ADR-0140):** a top-left View↔Edit toggle, a markdown source pane +
live preview, and comments + tracked changes as CriticMarkup inserted by a toolbar. The two moves below
are the model ADR-0140 fixed; ADR-0146 settled how you author them:

- **A Review toggle (View ↔ Review)** — a mode switch, like a word processor's. View is the read
  posture; Review turns on commenting and suggesting.
- **Inline comments at a BLOCK POSITION, rendered IN the document flow** (above a block, like a
  code-review thread) — NOT in a side panel. A comment is anchored only to a block position (WHICH
  block), never to a selected text span; the consuming AI infers what a comment refers to from
  position + surrounding text.
- **Suggestions, not direct overwrites** — editing prose in Review mode produces a PROPOSED edit (a
  suggestion) the owner/admin accepts or rejects. A suggested deletion/replacement renders the
  PROPOSED RESULT by default, with the original collapsed behind a "show change" expand toggle — NO
  strikethrough.

## The model (from ADR-0140)

- **Roles (no new role — the existing two suffice).** Members comment + suggest; owner/admin
  accept/reject and may hard-edit. Members cannot hard-edit; their suggestions are additive proposals.
  Resolution rides `studio-members`' existing `resolveAccess` (`admin ⊇ member`), the same compute
  `guestPolicy` already calls — this story does NOT add a role.
- **Block-position anchor replaces the text-quote anchor.** A comment's anchor records WHICH block
  (a stable block index / id within the rendered topic), not a `quote`/`prefix`/`suffix` span. The
  W3C text-quote machinery (`annotate.ts` re-find, the `<mark>` highlights, the select-to-highlight
  popover) is REMOVED, not kept alongside — a clean swap (ADR-0140; the owner wants the dead code
  gone, the removal is its own capability `remove-text-selection-anchoring`).
- **Suggestions are a separate record from comments.** A suggestion is a proposed edit with a status
  (`open` / `accepted` / `rejected`), authored by a member, resolved by an owner/admin. It carries
  the proposed replacement and enough of the original to render the collapsed "show change" view.
  Accepting applies the edit (through the existing admin asset-write path); rejecting closes it; both
  are owner/admin-only state transitions.
- **No real-time, but live refresh.** A single trusted dev works async — there is no collaborative
  cursor / OT / CRDT. But content, comments, and suggestions REFRESH live (reuse the existing 30 s
  visibility-gated poll, `apps/studio/src/lib/presence.ts`, or the chat SSE pattern) so a posted
  comment / suggestion appears without a reload.

## Capabilities (9)

Listed roots-first (a capability appears after everything it depends on). Each row marks its **class**
— LEAF (an isolatable backend red→green, armed with `--real` so the orchestrator drives it through
`node build --real --store pg`), LOOK (a frontend two-stage cap: behaviour red→green in vitest plus an
operator-attested appearance, ADR-0070), or GLUE (no isolated red→green — orchestrator-supplemented).

| # | capability | class | outcome | `--real` | depends on |
|---|---|---|---|---|---|
| 1 | [`block-position-comment-anchor`](block-position-comment-anchor.md) | LEAF | A comment is anchored to a block position (which block), not a text span; the text-quote anchor shape is gone from the stored model. | yes (R1) | — |
| 2 | [`suggestion-edit-store`](suggestion-edit-store.md) | LEAF | A proposed edit persists as a suggestion record with status `open`/`accepted`/`rejected`, author + proposed replacement, through the validated store boundary. | yes (R2) | — |
| 3 | [`accept-reject-suggestion-api`](accept-reject-suggestion-api.md) | LEAF | An owner/admin accepts or rejects a suggestion; the API enforces the open→accepted / open→rejected transitions and refuses re-deciding a closed one. | yes | `suggestion-edit-store` |
| 4 | [`member-suggest-write-policy`](member-suggest-write-policy.md) | LEAF | The studio policy lets a member POST comments + suggestions but refuses accept/reject + hard-edit; owner/admin may do all four. | yes (R1) | `suggestion-edit-store` |
| 5 | [`review-refresh-feed`](review-refresh-feed.md) | LEAF | A feed endpoint returns a topic's comments + suggestions so the Review surface refreshes live (the 30 s poll) without a reload. | yes | `block-position-comment-anchor`, `suggestion-edit-store` |
| 6 | [`review-mode-toggle`](review-mode-toggle.md) | LOOK | The studio renders a View ↔ Review mode switch; Review turns on the commenting + suggesting affordances, View is read-only. | (look) | — |
| 7 | [`inline-comment-thread`](inline-comment-thread.md) | LOOK | A block-anchored comment thread renders IN the document flow above its block (a code-review thread), placeable at any block in Review mode — never a side panel. | (look) | `block-position-comment-anchor`, `review-refresh-feed`, `review-mode-toggle` |
| 8 | [`collapsed-suggestion-view`](collapsed-suggestion-view.md) | LOOK | A suggestion renders the proposed result by default with the original collapsed behind a "show change" toggle (no strikethrough); owner/admin sees accept/reject controls. | (look) | `accept-reject-suggestion-api`, `suggestion-edit-store`, `review-mode-toggle` |
| 9 | [`remove-text-selection-anchoring`](remove-text-selection-anchoring.md) | GLUE | The old text-selection / quote anchoring is gone — `annotate.ts` quote-matching, the select-to-highlight popover, the `kind:'text'` anchor, and the range `<mark>` highlights are deleted; the suite stays green and no text-anchor path remains. | (glue) | `inline-comment-thread`, `collapsed-suggestion-view` |

## Dependency graph (what lands before what)

The backend leaf caps (1–5) land FIRST: the frontend look caps (6–8) consume their wire shapes (the
block-anchored comment, the suggestion record + accept/reject route, the refresh feed), and the
removal (9) lands LAST — only once the inline thread + collapsed-suggestion surfaces REPLACE the old
text-selection commenting can the old path be deleted without leaving the surface unable to comment.
This `depends_on` ordering is exactly the orchestrator's build order (topological, ADR-0010 §3): a
frontend cap that renders a block-anchored comment cannot pass until the block anchor exists in the
stored model and the feed serves it.

- `accept-reject-suggestion-api` → `suggestion-edit-store` — the route reads/writes the suggestion
  record + drives its status transitions.
- `member-suggest-write-policy` → `suggestion-edit-store` — the policy gates the suggestion write the
  store persists.
- `review-refresh-feed` → `block-position-comment-anchor`, `suggestion-edit-store` — the feed returns
  both record kinds for a topic.
- `inline-comment-thread` → `block-position-comment-anchor` (the anchor it renders), `review-refresh-feed`
  (the live source), `review-mode-toggle` (only shown in Review mode).
- `collapsed-suggestion-view` → `accept-reject-suggestion-api` (the controls' backend),
  `suggestion-edit-store` (the record it renders), `review-mode-toggle`.
- `remove-text-selection-anchoring` → `inline-comment-thread`, `collapsed-suggestion-view` — the
  replacement surfaces must exist before the old one is deleted.

## Relationship to the `studio` story (a re-shape, not a fork)

This story REPLACES three `studio` capabilities' user-facing surface: `annotate-topic` (the
text-selection anchoring), the right-panel `CommentPanel` form, and part of `resolve-comment`'s panel
fan-out. It does NOT re-author them — the `studio` story keeps owning the persistence backbone, the
corpus read path, and the asset editor, which this story CONSUMES (the `library` and `studio-members`
edges). The clean-swap removal (capability 9) deletes `studio`'s `annotate.ts` / `useAnnotations.tsx`
and retires `annotate-topic`'s text-anchor contracts; once landed, the `librarian-curator` should
reconcile the `studio` story (mark `annotate-topic` superseded-by-this-story, drop the dead
text-anchor contracts). That curation is a follow-on, surfaced here, NOT done in this authoring pass.

## Story UAT

The integrated **acceptance walkthrough** that proves the whole `library-review` journey end-to-end
against the **real running studio** + its real `library` / `studio-members` collaborators. It is
minimal-first (one coherent member→owner journey: open an open-question in Review, comment at a block,
suggest an edit, the owner accepts) — `uat-proves-the-goal-not-the-surface`: this proves the GOAL, not
every surface; the list grows only when a real defect earns a permanent case. Each leg marks its
witness — the backend legs are machine-exercised (`_(witness: machine)_`); the UI legs an agent cannot
drive are human-witness actions (`_(witness: human)_`, ADR-0070 / ADR-0040), recorded not skipped.

1. **Open an open-question in Review.** _(witness: human)_ Open a library open-question in the studio
   and flip the View → Review toggle. **Success —** the surface enters Review mode; the commenting +
   suggesting affordances appear, View was read-only.
2. **Comment at a block position.** _(witness: human)_ In Review mode, drop an inline comment above a
   specific block (not a side panel; not a text selection). **Success —** the comment thread renders
   IN the document flow above that block, like a code-review thread.
3. **The comment persisted with a block anchor.** _(witness: machine)_ Inspect the stored comment.
   **Success —** it carries a block-position anchor (which block), NOT a `quote`/`prefix`/`suffix`
   text-span anchor — the block-position model end-to-end.
4. **Propose a suggestion.** _(witness: human)_ As a member, edit a block's prose in Review mode and
   submit it as a suggestion. **Success —** a suggestion record is created `open` (a proposal, not a
   direct overwrite); the surface shows the PROPOSED RESULT by default with the original collapsed
   behind a "show change" toggle — no strikethrough.
5. **The suggestion is a proposal, not an overwrite.** _(witness: machine)_ Inspect the stored doc +
   the suggestion record. **Success —** the document is UNCHANGED; the suggestion holds the proposed
   replacement with status `open`, author = the member.
6. **A member cannot accept/reject.** _(witness: machine)_ As a member, attempt accept and reject on
   the suggestion. **Success —** both refused (member scope); the suggestion stays `open`.
7. **The owner accepts.** _(witness: human + machine)_ As the owner/admin, click Accept. **Success —**
   the suggestion flips `open → accepted`, the edit is applied to the document through the admin
   asset-write path, and re-deciding the now-closed suggestion is refused.
8. **Live refresh, no reload.** _(witness: human)_ With the open-question open, a second comment /
   suggestion is posted (another session / a scripted POST). **Success —** it appears on the Review
   surface within the poll window WITHOUT a manual reload (the 30 s visibility-gated refresh feed).
9. **The old text-selection commenting is gone.** _(witness: machine)_ Search the built studio for the
   removed path. **Success —** `annotate.ts` quote-matching, the select-to-highlight popover, the
   `kind:'text'` comment anchor, and the range `<mark>` highlights are absent; `pnpm --filter studio
   test` + `pnpm --filter studio typecheck` are green — a clean swap, no two systems side by side.

## Proof

**Honest status — all 9 capabilities BUILT; the frontend surface PIVOTED to the split-pane editor
(ADR-0146).** The five LEAF caps (1–5) each signed a REAL PASS through `node build --real --store pg`:
cap 1 run `real-mr22bwt5` (verdict @ `879608f`), cap 2 run `real-mr24u2mt` (@ `d597d36`), cap 3 run
`real-mr3is5wu` (@ `b33d27c` — the accept-APPLY half deferred loudly, see its spec), cap 4 run
`real-mr3kexsx` (@ `a62393c`), cap 5 run `real-mr41u3ro` (@ `6c06f94`) — the block-anchor comment
model, the suggestion store, the accept/reject route + accept-apply splice, the member-suggest policy,
and the live-refresh feed. These DATA/behaviour layers all STAND. Cap 6 (the toggle, LOOK) signed its
behaviour stage (run `real-mr446rcm`, @ `8a37714`); caps 7 (`InlineCommentThread`, @ `dfacfbb`) and 8
(`SuggestionView`, @ `b65087f`) signed their behaviour stages. Cap 9 (GLUE — the clean swap) is LANDED
+ green on branch `claude/split-editor-refine-e89a5f`: `annotate.ts` / `useAnnotations.tsx` /
`CommentPanel.tsx` deleted, `kind:'text'` retired from `CommentAnchor` + server `readAnchor`, dead
`<mark>.st-hl` CSS removed; studio typecheck + 623 tests green and a grep-absence of the text-anchor
symbols confirms no two systems side by side.

**The frontend PIVOT (ADR-0146, amending ADR-0140).** Two same-session look-rejections (the
affordance-pill compose, then an interim inline-prose direction — neither its own ADR) resolved into a
**split-pane markdown editor with CriticMarkup**: a **top-left View↔Edit toggle**, an editable markdown
**source pane (left)** + **live preview (right)**, and comments + tracked changes as CriticMarkup
(`{++ins++}` / `{--del--}` / `{~~old~>new~~}` / `{>>comment<<}` / `{==hl==}`) inserted by a toolbar.
The editor shell lives at `apps/studio/src/components/ReviewEditor.tsx` (+ `lib/criticmarkup.ts`,
`ReviewToggle.tsx` relabeled View/Edit), mounted in `AssetView.tsx`. The caps-6–8 **DATA/behaviour
proofs are reused** as the layer under this editor (the block model `lib/blocks.ts`, the suggestion
store + create/decision routes, the accept-apply splice); the caps-7/8 **standalone UI components**
(`InlineCommentThread`, `SuggestionView`) are **superseded** by the editor surface — their data
verdicts remain valid history, their standalone UI is no longer mounted (see each cap's proof-status
note). Retiring those superseded components (and the dead `ReviewBlocks.tsx`) is a follow-on.

Authored `status` fields stay `proposed` for the LEAF/LOOK caps (`healthy` is earned through the gate,
never authored — ADR-0020); cap 9 (GLUE, no gate arm) is flipped to `accepted` per ADR-0084, its bar
(suite green + text-anchor path gone) being met on the branch. The story's appearance is owner-attested
(ADR-0070); the owner approved the editor look in-session 2026-07-03.

## Open modeling calls (for the owner)

Surfaced rather than guessed — easy to revise (plain files), flagged for the orchestrator/owner:

1. **Block-anchor identity — index vs stable id.** A block-position anchor needs a STABLE handle for
   "which block". Two options: a block INDEX (Nth block in the rendered topic — simple, but shifts
   when blocks are inserted above) or a derived stable block ID (a slug/hash of the block, like the
   heading slugs `Markdown.tsx` already mints — survives insertions). `block-position-comment-anchor`
   leaves this to the leaf's implementation but the contract pins "anchored to a block, re-findable
   after an edit elsewhere in the doc". Recommend the stable-id route (the heading-slug precedent),
   but it is a genuine call. NOT blocking — both satisfy the contract.
2. **Where the suggestion + comment stores live.** The comment store is already
   `@storytree/library/store/pg-comment-store.ts`; the new suggestion store is authored as a sibling
   there (`pg-suggestion-store.ts`) so both ride the studio's existing PgBackend `#ready()` path. An
   alternative — a single combined "review-event" store — was rejected (the splitting-rule: comments
   and suggestions have distinct outcomes + distinct status models). Recorded, not re-litigated.
3. **`studio`-story reconciliation (a follow-on, now that cap 9 has landed).** Capability 9 has landed
   (the clean swap), so the `studio` story's `annotate-topic` capability is superseded and its 11
   text-anchor contracts (`at-text-anchor-from-selection`, `at-refind-quote-*`, `at-apply-highlights-*`,
   `at-anchor-builders-shape`, etc.) describe code that is now DELETED. The librarian pass at this
   landing marked `stories/studio/annotate-topic.md` as superseded-by-`library-review` with a note (see
   that file); a full retirement of the dead contract bodies (they still describe live `file:line`
   refs into deleted code) is FLAGGED as a story-author follow-on rather than gutted in this pass.
4. **Superseded frontend UI components (ADR-0146 follow-on).** The caps-7/8 UI components
   (`InlineCommentThread.tsx`, `SuggestionView.tsx`) and the dead `ReviewBlocks.tsx` are superseded by
   the `ReviewEditor` split-pane surface; their DATA/behaviour verdicts stand, but the standalone
   components are no longer mounted. Retiring the dead component files + tests is a librarian /
   story-author follow-on (ADR-0146 Consequences), surfaced here.
5. **The story UAT spec still tests the removed text-selection flow.** `apps/studio/uat/story-uat.spec.ts`
   still drives `mark.st-hl` / drag-to-comment — a Playwright UAT (NOT in the vitest gate, so
   non-blocking) that is now obsolete against the block/editor model. A UAT-leg rewrite to the editor
   journey is a story-author / librarian follow-on, flagged here.
