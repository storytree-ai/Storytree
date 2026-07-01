---
status: accepted
decided: 2026-07-01
---
# ADR-0140: Library Review mode — inline block-anchored comments and suggestion-based edits

## Status

accepted (2026-07-01) — decided/directed by the owner in conversation on 2026-07-01. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The studio's library documents — especially **open questions**, the unresolved decisions a team argues out before they become ADRs — are read today through a static page with a right-hand comment panel (`apps/studio/src/components/CommentPanel.tsx`) and a text-selection / W3C text-quote annotation layer (`apps/studio/src/lib/annotate.ts` + `useAnnotations.tsx`). Two forces make that surface unfit for the collaboration we now want:

- **The comment panel is unresponsive and off to the side.** A comment lives in a side panel, detached from the prose it refers to; a reader has to map a panel entry back to the passage by eye. It reads like a stale Confluence page, not a working document.
- **Text-selection anchoring is fragile.** The `quote`/`prefix`/`suffix`/`startOffset` span anchor has to re-find its text after any edit; it breaks when the surrounding prose changes, and the select-to-highlight popover is awkward on exactly the kind of long, structured open-question document we most want reviewed.

The owner wants a **word-processor feel**: a document you switch into "Review" to comment on and suggest edits to, with comments sitting *in* the flow like a code review, and edits proposed rather than applied directly. Concretely this is meant to let a trusted external dev onboard by leaving inline comments on a seeded open-question — a live test of "multiplayer open questions" that also collects targeted feedback on where code diffs would be useful.

This also settles a **parked concurrency question**: two sessions editing the *same* library artifact are not coordinated today (ADR-0009's claim mechanism is DBOS-deferred), so a second editor's write silently clobbers the first. Review mode answers it **in the suggestion direction** — a non-owner does not overwrite the document at all; they propose a suggestion the owner accepts or rejects — rather than by adding a lock or a claim.

## Decision

Add a **Review mode** collaboration layer to library documents, governed by this model:

- **A View ↔ Review toggle**, like a word processor's mode switch. **View** is the read posture (read-only). **Review** turns on the commenting and suggesting affordances.
- **Inline comments anchored to a BLOCK POSITION, rendered in the document flow.** A comment attaches to *which block* it sits above — a stable block position within the rendered topic — and its thread renders in the flow above that block, like a code-review thread, **never** in a side panel. A comment carries **no** selected-text span: the W3C text-quote anchor (`quote`/`prefix`/`suffix`/`startOffset`, the `kind: 'text'` anchor) is **removed**, not kept alongside. A consuming reader — human or AI — infers what a comment refers to from the block position plus the surrounding text.
- **Suggestions, not direct overwrites.** Editing prose in Review mode produces a **proposed edit**: a suggestion record — separate from the comment record — with a status (`open` / `accepted` / `rejected`), an author, and the proposed replacement. The owner/admin accepts it (applying the edit through the existing admin asset-write path) or rejects it; re-deciding a closed suggestion is refused. A suggested change **renders the proposed RESULT by default**, with the original **collapsed behind a "show change" toggle — NO strikethrough** (the deliberate departure from Google-Docs-style struck-out text, which the owner dislikes).
- **Roles ride the existing access model — no new role.** Members comment and suggest; owner/admin accept/reject and may hard-edit. Members cannot hard-edit; their suggestions are additive proposals. Resolution uses `studio-members`' existing `resolveAccess` (`admin ⊇ member`), the same compute `guestPolicy` already calls.
- **No real-time, but live refresh.** A single trusted dev works async — there is no collaborative cursor / OT / CRDT. Content, comments, and suggestions refresh live via the existing 30 s visibility-gated poll (`apps/studio/src/lib/presence.ts`) or the chat SSE pattern, so a posted comment or suggestion appears without a manual reload.

The work is the `library-review` story (nine capabilities): the block-anchored comment model and the suggestion store as backend leaves; the accept/reject route and the member-suggest write policy; the live-refresh feed; the Review toggle, the inline thread, and the collapsed-suggestion surfaces (frontend, operator-attested per ADR-0070); and — last — the clean removal of the old text-selection anchoring.

## Consequences

- **The text-quote anchoring is deleted, not deprecated in place.** `annotate.ts` quote-matching, the select-to-highlight popover, the `kind: 'text'` comment anchor, and the range `<mark>` highlights go away in one clean swap (capability `remove-text-selection-anchoring`), only once the inline-thread and collapsed-suggestion surfaces have replaced what they did. This **reshapes the `annotate-topic` capability's text-selection approach** in the `studio` story; once the removal lands, `annotate-topic` is superseded-by-this-story and its text-anchor contracts are dead — a `librarian-curator` follow-on, surfaced here, not done in this pass.
- **Members gain a write path they did not have.** A member can now propose a suggestion (an additive proposal) where before they could only comment. The owner/admin gate on accept/reject and hard-edit is unchanged.
- **The same-artifact concurrency question is answered for the non-owner path** (suggestions, not clobbering) but **not** for two owners hard-editing concurrently — that remains uncoordinated (ADR-0009 deferred) and out of scope here.
- **No real-time collaboration.** Live refresh is a poll, not a shared cursor; two people typing at once is explicitly unsupported (single trusted dev, async). If concurrent editing is ever needed, that is a separate decision.
- **Block-anchor identity is a leaf-implementation call** — a block index vs a derived stable block id. The contract pins "anchored to a block, re-findable after an edit elsewhere in the doc," recommending the stable-id route (mirroring the heading slugs `Markdown.tsx` already mints); both satisfy the contract.

## References

- Story + capabilities: `stories/library-review/` (the nine-capability build; drive per-capability via `node build <cap> --real --store pg`).
- Seeded onboarding open-question: `oq-diff-view-altitude` (the diff-altitude question the reviewing dev comments on).
- ADR-0110 — owner-directed decisions are born `accepted` (this ADR's status).
- ADR-0070 — operator-attested appearance for the frontend look capabilities.
- ADR-0009 — the deferred same-artifact claim/coordination mechanism, settled here in the suggestion direction.
- Reshaped surface: the `studio` story's `annotate-topic` capability + `apps/studio/src/lib/annotate.ts` / `useAnnotations.tsx` / `CommentPanel.tsx`.
