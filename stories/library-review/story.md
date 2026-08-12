---
id: "library-review"
tier: story
title: "Review mode — a word-processor collaboration layer for library documents"
outcome: "A member opens a library open-question in Review mode, drops an inline comment at a block position, and proposes a collapsed suggestion the owner accepts — comments and suggestions placed in the document flow (never a side panel), and the old text-selection anchoring is gone."
status: proposed
proof_mode: UAT
# ADR-0348 D1 (2026-08-12): every surviving story-UAT leg is `witness: machine`, model-driven. This
# comment previously read that the frontend legs (the Review toggle, the inline thread, the
# collapsed-suggestion controls) were human-witness "because a UI an agent cannot drive is a
# human-witness UAT action" — that was a HARNESS statement, not a judgment gap
# (asset:human-witness-is-a-judgment-gap-not-cost), and the harness now exists (ADR-0295 D1's
# executor, packages/drive/src/uat-drive*.ts). Appearance verdicts remain a separate mechanism at the
# capability rung (ADR-0070 stage 2), untouched here. The story still carries NO blanket
# `uat_witness: machine` override — each UAT leg below marks its own witness and names its own
# `(proof-gate:)`, which is what makes the binding self-describing rather than registry-driven.
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
#  - studio (ADR-0192 landlord rule): the review surfaces are HOSTED in the studio's territory — the
#    caps bind sources under apps/studio (suggestionApi.ts, the inline review UI) riding the studio's
#    server + context wires. A hosted-seam edge, annotated below.
depends_on: [library, studio-members, studio]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [library, studio]
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

## UAT Test Criteria

The integrated **acceptance walkthrough** that proves the whole `library-review` journey end-to-end
against the **real running studio** + its real `library` / `studio-members` collaborators. It is
minimal-first (one coherent member→owner journey: open an open-question in Review, comment at a block,
suggest an edit, the owner accepts) — `uat-proves-the-goal-not-the-surface`: this proves the GOAL, not
every surface; the list grows only when a real defect earns a permanent case. **Every surviving leg is
now `_(witness: machine)_`, each bound to its own model-driven observe gate below (ADR-0348 D1/D5).**
The story carries no `human` leg at all: a UI an agent could not drive was a HARNESS statement, not a
judgment gap, and the harness now exists.

### ADR-0348 D1 — the five human legs are `machine`, model-driven (2026-08-12)

**All five surviving legs flipped `human → machine` in the same change that bound each to a
`(proof-gate:)`, exactly as ADR-0348 D5 orders it.** This story was the cleanest case in the whole
17-leg population and it named its own disposition below in advance: its legs were tagged `human`
because *"an agent cannot drive the UI"*, which
`asset:human-witness-is-a-judgment-gap-not-cost` classes as a HARNESS statement rather than a judgment
gap. ADR-0348 D1 narrows `human` to taste alone, and the harness that was missing — the model-driven
UAT executor of ADR-0295 D1 — landed 2026-08-12 in `packages/drive/src/uat-drive*.ts`. Nothing about
these five journeys changed; only the claim about who can walk them.

Each leg binds `library-review#gate-1` … `#gate-5` under `## Reliability Gates` below (a NEW section —
this story declared none before, so no gate ordinal was renumbered). The gate does not drive: it
witnesses a persisted `events.uat_drive` record produced out-of-band by
`uat-drive.run.ts`, at the criterion's current content-bound `revision-id` and at a commit in `main`'s
ancestry. Re-authoring any of these journeys therefore invalidates its drive rather than carrying an
old green onto a new claim — which is why the five revisions below were recomputed in this same change.

The note under the ADR-0294 disposition table deferring this re-adjudication to chip `task_47c74cb0`
is **discharged here**, by the increment ADR-0348 created for it.

### ADR-0294 disposition of the nine original criteria

**Four of nine deleted (2026-08-08) — every `witness: machine` leg, all as D2 duplicates.** The five
survivors were the `witness: human` legs, kept for a scoping reason rather than a proof one: this
story's human legs were tagged human because "an agent cannot drive the UI", which
`human-witness-is-a-judgment-gap-not-cost` classes as a HARNESS statement rather than a judgment gap.
Re-adjudicating them was ADR-0209 §8 witness work belonging to a later increment, not to that pass;
ADR-0294 D2 deletes duplicates, it does not re-tag witnesses. **That re-adjudication has now happened
— see the ADR-0348 note above; all five are `machine`.** The `Keep. witness: human` verdicts in the
table below are the 2026-08-08 disposition as it stood and are left unedited as that pass's record.

The four deleted legs map one-to-one onto capabilities that each signed a REAL PASS through
`node build --real --store pg` (the runs are recorded in this story's `## Proof` section), which is
the capability rung re-signed at the story rung in its plainest form. Every citation below was checked
against the named suite's actual test titles.

**The surviving numbers are deliberately NOT closed up.** `3`, `5`, `6` and `9` are burned. Each of
those four carried a `(detail:)` pointer at `library-review#uat-<n>`; those live `uat-criterion`
artifacts are retired in the store (ADR-0307 D5 — the tier is live-canonical, so retirement is a
`--pg` write, not a file deletion). The five survivors keep their pointers intact, which the
`PILOT_STORY_IDS` coverage check requires.

| original leg | criterion id | disposition |
|---|---|---|
| 1. **Open an open-question in Review** | `uatc_50675817f38dafb3d307de22` | **Keep.** `witness: human`; re-adjudication belongs to `task_47c74cb0`. |
| 2. **Comment at a block position** | `uatc_76b48b635e2a58dabf134d05` | **Keep.** Same basis. |
| 3. **The comment persisted with a block anchor** | `uatc_76681235d644938d2598380c` | **Delete as duplicate.** [`block-position-comment-anchor`](block-position-comment-anchor.md), `packages/library/src/store/pg-comment-store.test.ts`: **“bpa-block-anchor-is-the-stored-shape: normalizeCommentAnchor returns a block anchor canonical (blockId kept, legacy text-span fields stripped)”** asserts both halves of this leg — that the stored anchor IS block-position, and that it is NOT a quote/prefix/suffix text span; **“normalizeCommentAnchor: legacy text kind is downgraded to topic and stripped of text-span fields”** pins the stripping directly. |
| 4. **Propose a suggestion** | `uatc_579e8c23c11391ebd2396159` | **Keep.** `witness: human`; same basis as leg 1. |
| 5. **The suggestion is a proposal, not an overwrite** | `uatc_8d2b3ad46f16f3f8c1dda241` | **Delete as duplicate.** [`suggestion-edit-store`](suggestion-edit-store.md), `packages/library/src/store/pg-suggestion-store.test.ts`: **“ses-record-validates-at-the-boundary: SuggestionSchema accepts a valid open suggestion”** pins status `open` carrying the proposed replacement, and **“SuggestionSchema refuses a blank author”** pins the author field. The document-unchanged half is STRUCTURAL rather than asserted — the suggestion store is handed no document-write path — which is the same kind of claim this story already declares structural elsewhere. |
| 6. **A member cannot accept/reject** | `uatc_afeb19036c9f6e66ceb082e5` | **Delete as duplicate.** [`member-suggest-write-policy`](member-suggest-write-policy.md), `apps/studio/server/guestPolicy.test.ts`: **“msp-member-cannot-decide-a-suggestion: a member POST to the suggestion-decision path is 403 (deciding is admin-only)”** asserts the refusal, and **“msp-admin-may-do-all-four: an admin may comment, suggest, accept/reject, and hard-edit”** pins the admit side. The stays-`open` clause follows from the 403: the decision route never runs, so no transition is applied. |
| 7. **The owner accepts** | `uatc_2c1854c481f8d507d1b88ebd` | **Keep.** `witness: human`; same basis as leg 1. |
| 8. **Live refresh, no reload** | `uatc_ee3daee25bc4403dc413100a` | **Keep.** Same basis. |
| 9. **The old text-selection commenting is gone** | `uatc_d5785439b3378b3c34aef9d1` | **Delete on D1 first, D2 second.** A grep for absent symbols is not a step in a narratable journey — nobody walks it — and this leg's own success condition literally named `pnpm --filter studio test` + `pnpm --filter studio typecheck`, i.e. the package suite, as the thing that discharges it. Its claim was verified true before deletion (2026-08-08): `apps/studio/src/lib/annotate.ts`, `apps/studio/src/lib/useAnnotations.tsx` and `apps/studio/src/components/CommentPanel.tsx` are all absent, and no `text` kind survives on the comment anchor — the only remaining `kind: 'text'` in the tree is a CriticMarkup SEGMENT type in `apps/studio/src/lib/criticmarkup.ts`, an unrelated shape. Nothing unproven is dropped. |

1. **Open an open-question in Review.** _(witness: machine)(detail: library-review#uat-1)_ _(proof-gate: library-review#gate-1)_ Open a library open-question in the studio _(criterion-id: uatc_50675817f38dafb3d307de22)_ _(revision-id: uatr1:387958f502e9fa79)_ _(previous-revision-id: uatr1:c45ed3b712f91d3a)_
   and flip the View → Review toggle. **Success —** the surface enters Review mode; the commenting +
   suggesting affordances appear, View was read-only.
2. **Comment at a block position.** _(witness: machine)(detail: library-review#uat-2)_ _(proof-gate: library-review#gate-2)_ In Review mode, drop an inline comment above a _(criterion-id: uatc_76b48b635e2a58dabf134d05)_ _(revision-id: uatr1:7ec7f2f018bcb2d8)_ _(previous-revision-id: uatr1:f162af5d3872ecda)_
   specific block (not a side panel; not a text selection). **Success —** the comment thread renders
   IN the document flow above that block, like a code-review thread.
4. **Propose a suggestion.** _(witness: machine)(detail: library-review#uat-4)_ _(proof-gate: library-review#gate-3)_ As a member, edit a block's prose in Review mode and _(criterion-id: uatc_579e8c23c11391ebd2396159)_ _(revision-id: uatr1:e61dda1e2684f208)_ _(previous-revision-id: uatr1:4cabbf0e6953dd9f)_
   submit it as a suggestion. **Success —** a suggestion record is created `open` (a proposal, not a
   direct overwrite); the surface shows the PROPOSED RESULT by default with the original collapsed
   behind a "show change" toggle — no strikethrough.
7. **The owner accepts.** _(witness: machine)(detail: library-review#uat-7)_ _(proof-gate: library-review#gate-4)_ As the owner/admin, click Accept. **Success —** _(criterion-id: uatc_2c1854c481f8d507d1b88ebd)_ _(revision-id: uatr1:6a5213adb2e9f346)_ _(previous-revision-id: uatr1:aee83238ae66332a)_
   the suggestion flips `open → accepted`, the edit is applied to the document through the admin
   asset-write path, and re-deciding the now-closed suggestion is refused.
8. **Live refresh, no reload.** _(witness: machine)(detail: library-review#uat-8)_ _(proof-gate: library-review#gate-5)_ With the open-question open, a second comment / _(criterion-id: uatc_ee3daee25bc4403dc413100a)_ _(revision-id: uatr1:03e7a20acab3e7bb)_ _(previous-revision-id: uatr1:bdfcd2940eee27cc)_
   suggestion is posted (another session / a scripted POST). **Success —** it appears on the Review
   surface within the poll window WITHOUT a manual reload (the 30 s visibility-gated refresh feed).
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

## Reliability Gates

**A NEW section (2026-08-12, ADR-0348 D1/D5). This story declared no reliability gates before, so
gates 1–5 are minted fresh and NO existing gate ordinal was renumbered** — the one move
`asset:edit-story-uat-criteria` step 2 forbids outright, because gate ids are positional and
renumbering silently re-points already-signed verdicts and surviving `(proof-gate:)` bindings.

These five gates exist **solely to prove the five UAT legs above**, one gate per leg, in the shape
`drive-machinery` gates 4–7 established: a command-bearing `observe` gate carrying no `(covers:)`,
because it proves a journey rather than a capability. Adding any of them to a `(covers:)` list would
let an observe-and-sign `adopt` pass green a capability that never went red (ADR-0085 / ADR-0097) —
this story's nine capabilities keep earning their own `--real` verdicts, recorded in `## Proof` above.

**Every gate below runs the same witness check, and that is the whole point.** A `machine` leg is
MODEL-DRIVEN exactly when the observe gate it names runs `uat-drive-witness.check.ts` — the binding is
self-describing, so nothing needs a second registry saying which legs a model drives and which a suite
does, and the two can never disagree (`packages/drive/src/uat-drive.ts`, `isModelDrivenGate`).

**None of these gates drives anything, and none of them spends.** The drive is deliberately
out-of-band: `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive.run.ts library-review
<criterion-id>` spawns a fresh subscription-funded session that walks the authored journey against the
real running studio and appends a record to `events.uat_drive` — ADR-0010 §5 keeps that off every gate
path, exactly as `dogfood-probe.run.ts` is. The gate is the cheap standing WITNESS of that persisted
artifact, and the spine still mints the verdict over the exit code IT watched, so ADR-0295 D2's *no
model signs its own verdict* holds with the signing path unchanged.

A gate here goes red — honestly, not spuriously — when no `pass` record exists for the criterion's
CURRENT `revision-id`, when the drive's commit is not in HEAD's ancestry, or when the newest record is
older than 90 days (the ADR-0016 ageing floor). Re-authoring one of these journeys is therefore a
deliberate re-drive, not a silent carry-forward of a green nobody re-earned.

1. **UAT leg 1 — "Open an open-question in Review" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts library-review uatc_50675817f38dafb3d307de22`.
   Witnesses that a model brought the studio up, opened a real library open-question and flipped
   View → Review against the running surface, observing that the commenting + suggesting affordances
   appeared and that View was read-only.
2. **UAT leg 2 — "Comment at a block position" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts library-review uatc_76b48b635e2a58dabf134d05`.
   Witnesses that a model dropped an inline comment above a specific block in Review mode and observed
   the thread render IN the document flow — not in a side panel, not anchored to a text selection.
3. **UAT leg 4 — "Propose a suggestion" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts library-review uatc_579e8c23c11391ebd2396159`.
   Witnesses that a model, acting as a member, edited a block's prose and submitted it as a
   suggestion, observing an `open` proposal (not a direct overwrite) rendered as the PROPOSED RESULT
   with the original collapsed behind "show change".
4. **UAT leg 7 — "The owner accepts" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts library-review uatc_2c1854c481f8d507d1b88ebd`.
   Witnesses that a model, acting as owner/admin, accepted the suggestion and observed the
   `open → accepted` flip, the edit applied through the admin asset-write path, and re-deciding the
   now-closed suggestion refused.
5. **UAT leg 8 — "Live refresh, no reload" was driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts library-review uatc_ee3daee25bc4403dc413100a`.
   Witnesses that a model posted a second comment / suggestion out of band and observed it appear on
   the open Review surface within the poll window with no manual reload.

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
