---
status: accepted
decided: 2026-07-03
amends: [140]
---
# ADR-0146: Review-mode editing is a split-pane markdown editor with CriticMarkup tracking

## Status

accepted (2026-07-03) — decided/directed by the owner in conversation on 2026-07-03. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Amends ADR-0140 (settles the
compose/editing interaction it left open). This ADR consolidates a same-session design evolution: the
first Review-mode build (caps 6–8) shipped an affordance-pill compose, which the owner rejected live;
an interim "click-to-edit inline prose" direction was explored and then refined, in the same
conversation and before anything landed, into the split-pane markdown editor recorded here — so this
ADR states the editing model as decided, not the intermediate steps (which live in the conversation,
not the decision log).

## Context

ADR-0140 decided **what** Library Review mode is (a read↔work toggle, inline comments, suggestions as
proposals) and left **how you author** open. The first build resolved it with hover-revealed
"Comment"/"Suggest" pills opening a monospace compose box per block. The owner rejected it live:
*"still doesn't feel like google docs, a lot of the buttons don't seem to work, overly complicated and
slow"* — the pills were `opacity:0`-until-hover (read as broken), feedback waited on a 30 s poll (felt
dead), and the monospace box read as a form. A "click-to-edit inline prose" iteration fixed the
discoverability and feel but still wasn't right; refining it, the owner articulated the target
directly: *"just edit it all like a word processor … when in edit mode the whole thing turns to
markdown … on the right side you can show a live preview. For comments and diff tracking … give the
user a toolbar in edit mode."*

Forces weighed in-session: **word-processor feel vs. honesty to the stored format.** A raw-markdown
pane shows syntax (`**bold**`) — the opposite of a word processor — but it is exactly what is stored;
a full WYSIWYG editor hides syntax and feels like Docs but is a heavy rich-text dependency with a
markdown round-trip. **How to express comments + tracked changes** was the owner's least-settled point,
raised explicitly for discussion. And **the corpus is markdown** end to end (store, renderer, every
artifact), so changing the authoring language would ripple through the whole knowledge tier.

## Decision

Review-mode editing is a **split-pane markdown editor with CriticMarkup tracking**. Concretely (owner
directed each fork in-session):

1. **Two modes, a top-left toggle.** A clear mode switch at the **top-left** of the topic surface:
   **View** (read posture — clean rendered prose, no affordances) ↔ **Edit** (the editor). No separate
   "Review" button; the mode is the toggle. (Implementation note: the proven cap-6 `ReviewToggle`
   two-state behaviour + `ReviewModeContext` are reused; the relabel to View↔Edit and the reposition
   are a presentation change over that proven behaviour.)
2. **Edit is a split source/preview pane.** The document body becomes an editable **markdown source**
   pane on the left with a **live rendered preview** on the right (the StackEdit/Obsidian-split shape
   the owner drew). The stored format is unchanged — you edit the real markdown.
3. **Comments + tracked changes are CriticMarkup, inserted by a toolbar.** Editorial markup uses the
   established **CriticMarkup** standard — `{++insert++}`, `{--delete--}`, `{~~old~>new~~}` (a tracked
   change), `{>>comment<<}`, `{==highlight==}` — and an Edit-mode **toolbar** inserts it (or wraps the
   current selection). The preview renders CriticMarkup as tracked changes (insertions / deletions /
   substitutions) and comment bubbles; resolving a change (accept/reject) rewrites it back to clean
   markdown. This is the markdown-native answer to the owner's "toolbar to insert the syntax for
   comments and diff tracking," and a suggestion record maps naturally to a `{~~original~>proposed~~}`
   span.
4. **Everyone suggests (v1).** In Edit mode every change is a tracked suggestion (CriticMarkup), not a
   silent direct write; an admin still resolves changes and still has the whole-document asset editor
   for direct writes. No role branch in the editor. (Carried from the prior decision — the simplest
   mapping and the owner's stated preference.)
5. **Stay on markdown.** The authoring language remains markdown (+ GitHub extensions for tables etc.,
   + CriticMarkup for tracking). A richer language (MDX/AsciiDoc) or a WYSIWYG doc model was considered
   and rejected: the whole corpus is markdown, and markdown-plus-extensions covers the need at a
   fraction of the churn.

This supersedes the pill/compose model AND the interim inline-prose model. The three caps-6–8 **data
proofs stand and are reused** — the block model (`splitBlocks`), the suggestion store + create/decision
routes, and the accept-apply splice are the data layer under CriticMarkup. The caps' **UI components**
(the inline comment thread, the suggestion card) are **superseded** by this surface; reconciling those
cap specs (and retiring the now-doubly-dead text-selection annotation machinery) is a librarian /
story-author follow-on, the same clean-swap shape ADR-0140's `remove-text-selection-anchoring` already
carries.

## Consequences

- The editing surface is honest to storage (you edit real markdown) and cheap relative to a WYSIWYG
  engine, at the cost of showing syntax in the source pane — the live preview is what carries the
  "feels like a document" side.
- CriticMarkup gives tracked changes + comments a single, standard, markdown-native representation, and
  a clean accept/reject → clean-markdown resolution. The suggestion store persists these; whether the
  CriticMarkup lives inline in the body until resolved or as separate suggestion records rendered as an
  overlay is an implementation choice to settle when persistence is wired (the feel shell lands first).
- The caps-7/8 UI components (`InlineCommentThread`, `SuggestionView`) are no longer the mounted
  surface; their verdicts remain valid history over the data/behaviour they proved, but the rendered
  Review UI is the new editor. The story's UI caps need reconciling to this model.
- The text-selection annotation machinery (`annotate.ts` / `useAnnotations.tsx`) is now clearly dead;
  its removal stays the `remove-text-selection-anchoring` clean swap (ADR-0140), reinforced here.
- WYSIWYG remains **not** adopted; if a future need demands hiding syntax entirely, that is a fresh
  decision, not assumed here.
- The appearance stays owner-attested (ADR-0070); this ADR records the interaction decision, not a
  visual sign-off.

## References

- Amends ADR-0140 (Library Review mode — the model this settles the editing interaction for).
- ADR-0110 (design-time alignment is ratification — why this is born accepted).
- ADR-0070 (two-stage frontend proof — the look stays owner-attested).
- CriticMarkup — the markdown editorial-markup standard adopted for comments + tracked changes.
- Story `library-review` — the mount (`apps/studio/src/components/`), the reused data layer
  (`lib/blocks.ts`, the suggestion store + routes, the accept-apply splice), and
  `remove-text-selection-anchoring` (the clean swap this reinforces).
