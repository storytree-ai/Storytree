---
id: "annotate-topic"
tier: capability
story: studio-foundation
title: "Annotate a topic with anchored comments"
outcome: "An operator anchors a comment onto a precise place in a rendered topic."
status: "proposed"
proof_mode: "integration-test"
depends_on: [dev-server-persistence-backbone, read-corpus]
---

# Annotate a topic with anchored comments

**Outcome —** An operator anchors a comment onto a precise place in a rendered topic.

**Depends on —** [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md), [`read-corpus`](read-corpus.md)

> **Proof status (honest) —** CODE EXISTS AND RUNS, NO AUTOMATED PROOF YET. The studio runs under `pnpm --filter studio dev` and the whole annotate flow (select → colour popover → Post; section/topic via dropdown/heading button; reload re-find + re-highlight; gutter/hover/focus navigation; doc AND asset surfaces) is implemented and wired (annotate.ts, useAnnotations.tsx, CommentPanel.tsx, Markdown.tsx, DocView.tsx, AssetView.tsx, devApi.ts, operator.ts). But there is NO automated test suite and NO scripted integration test (package.json: dev/build/preview/typecheck only; a glob for **/*.{test,spec}.{ts,tsx} under apps/studio returns nothing). Every contract describes the isolated unit test that WOULD prove a leaf; the integration test describes the walkthrough that WOULD prove the capability against its real in-story collaborators. Persistence and corpus-rendering are the real in-story collaborators (the code-derived depends_on), exercised live by the integration test, not stubbed. Nothing here is 'proven' or 'healthy'.

## Guidance

Why the merge is honest (no internal seam): useAnnotations runs ONE useLayoutEffect (useAnnotations.tsx:85-93) that calls applyHighlights AND updateHeadingBadges together, and exposes ONE overlays bundle (174-228: gutter ticks + selection popover + hovercard) plus ONE shared target/setTarget state. Text comments come from the popover commit (commit, 165-170 → textAnchorFrom), while section/topic comments come from CommentPanel's dropdown (CommentPanel.tsx:138-153) and Markdown heading buttons (Markdown.tsx:52-62 → onCommentHeading → sectionAnchor) — but ALL three flow through the same setTarget and the same CommentPanel.submit (CommentPanel.tsx:71-87). There is no running configuration where text highlighting works but section/topic posting doesn't, or vice-versa.

The anchor model is W3C text-quote (annotate.ts header): store the exact quote + 32-char prefix/suffix (CONTEXT=32, annotate.ts:11) + a startOffset hint + the nearest heading's slug. Re-finding (findQuoteRange) is deliberately offset-TOLERANT: it scopes candidates to the section window first, scores prefix/suffix matches +2 each, and only uses |idx-startOffset|/1000 as a weak tie-breaker (annotate.ts:193-211) — so an edit above the span (which shifts every absolute offset) does not break the highlight. This is the single most important behaviour to test and the hardest to see by eye.

Highlight survival depends on a render trick: DocView/AssetView MEMOIZE the markdown subtree (DocView.tsx:51-59, AssetView.tsx:21) so React never reconciles it; the <mark> wrapping is imperative DOM mutation inside useLayoutEffect that would be wiped if React re-rendered the subtree. Any rebuild must preserve this memoization-vs-imperative-mutation contract, and the article element must be position:relative for the absolutely-positioned overlays/gutter ticks to align.

topicKind is the doc/asset switch: the identical CommentPanel + useAnnotations are wired in both DocView (topicKind='doc', DocView.tsx:80-89) and AssetView (topicKind='asset', AssetView.tsx:90-99); the server only accepts 'doc'|'asset' (devApi.ts:206-208). So the capability is topic-agnostic by construction, not by a second code path.

Server hardening to preserve: readAnchor (devApi.ts:152-169) DOWNGRADES an under-specified anchor (text without quote → topic; section without headingSlug → topic) so a malformed payload can never persist an unfindable locator. POST defaults a blank author to 'operator' (devApi.ts:215), matching getOperator's own fallback (operator.ts:10).

The operator identity is intentionally thin: a single localStorage string (operator.ts), no accounts — its only journey is being stamped onto a posted comment, which is why it is demoted into this capability rather than standing alone.

## Integration test

**Goal —** Prove that an operator can anchor a comment onto a precise place in a rendered topic — a text span, a section, or the whole topic — and that a text-anchored comment is durably re-found and re-highlighted on reload (offset-tolerant), with the highlight, gutter tick, and thread navigable to each other.

The integration test exercises annotate-topic against its **real in-story
collaborators** — `read-corpus` (whose rendered markdown subtree the annotation layer
mutates and whose slugged heading ids the section anchors target) and
`dev-server-persistence-backbone` (whose comment POST/GET handlers carry the data path) —
with **no stubs within the organism** (ADR-0010 §2/§5). These two are exactly the
code-derived `depends_on` edges, exercised live. It would:

1. Start the studio (pnpm --filter studio dev) and open a corpus document (e.g. decisions/0002-...md) so read-corpus renders it as markdown with slugged headings.
2. Set an operator name once (the localStorage author-stamp); assert the composer foot reads 'as <name>'.
3. With the mouse, select an exact span of body text. Assert the selection popover appears near the selection (onMouseUp → computeTextAnchor produced a draft); pick a non-default highlight colour, then click '💬 Comment'.
4. Assert the composer flips to a 'text target' chip showing the truncated quote in the chosen colour; type a comment body and click Post.
5. Assert the POST persists through the real backbone: a new entry appears in data/comments.json with topicKind='doc', the right topicId, anchor.kind='text', the stored quote/prefix/suffix/startOffset/color, and author = the operator name.
6. Assert the just-posted span is now wrapped in a coloured <mark class='st-hl'> in the article (mutated into read-corpus's memoized subtree), a matching tick appears in the margin gutter, and the comment shows in the thread with a 're: "…"' jump tag.
7. Reload the page. Assert the comment is re-fetched and the highlight is RE-FOUND and re-wrapped (findQuoteRange) at the same span, and the gutter tick reappears — proving the anchor survives a fresh render with no live selection.
8. Edit the underlying doc file to insert a paragraph ABOVE the highlighted span (shifting its absolute offset), reload, and assert the highlight still lands on the correct span (offset-tolerant: section-window scoping + prefix/suffix scoring beat the stale startOffset).
9. Now exercise the other two anchor kinds through the SAME composer: (a) click a heading's 💬 button → the composer targets that section → post → assert anchor.kind='section' with the heading's slug, the thread shows a '§ heading' tag, and that heading's badge count increments; (b) with the dropdown left on 'Whole document', post → assert anchor.kind='topic'.
10. Navigate between a highlight and its thread: hover the <mark> to get a hovercard preview (author + snippet), click the gutter tick to scroll+flash the comment in the panel (focusId), and click the thread's quote-tag to scroll+flash the highlight in the article.
11. Open a Library artifact (AssetView, topicKind='asset') and repeat one text-anchor post to assert the identical surface annotates assets as well as docs (topic-agnostic).

## Contracts (11)

The test-proven leaf behaviours — each **one isolated automated test** with
collaborators stubbed (ADR-0002). No automated tests exist yet; each entry is the
assertion a contract test *would* prove, with the real code it covers.

1. **`at-text-anchor-from-selection`** — A live selection range yields a text-quote anchor draft (quote + context + offset + nearest heading)
   - **asserts —** Given a fixed root element with known text nodes and a Range over a substring, computeTextAnchor returns a draft whose quote equals the selected text, prefix/suffix are the 32-char neighbours, startOffset is the absolute text offset, and headingSlug/headingText are the nearest preceding .md-heading.
   - **covers —** `apps/studio/src/lib/annotate.ts:148-164`
2. **`at-anchor-builders-shape`** — topic/section/text anchor builders emit the canonical CommentAnchor shape
   - **asserts —** topicAnchor() returns kind='topic' with all locator fields null; sectionAnchor(slug,text) returns kind='section' carrying headingSlug/headingText with quote/offset still null; textAnchorFrom(draft,color) returns kind='text' carrying the draft's quote/prefix/suffix/startOffset plus the chosen color.
   - **covers —** `apps/studio/src/lib/annotate.ts:15-43`
3. **`at-refind-quote-prefers-section-window`** — Re-finding a quote scopes to its section window before falling back to the whole doc
   - **asserts —** Given a root where the same quote string occurs both outside and inside the anchor's headingSlug section, findQuoteRange returns the occurrence inside the section window (only the in-window candidate is collected unless none exists).
   - **covers —** `apps/studio/src/lib/annotate.ts:177-191`
4. **`at-refind-quote-scores-context-and-offset`** — Among duplicate occurrences, re-finding scores prefix/suffix match over a stale startOffset
   - **asserts —** Given two occurrences of the same quote where occurrence B matches the anchor's prefix and suffix but occurrence A is nearer the stored startOffset, findQuoteRange returns occurrence B (context +2/+2 outweighs the small startOffset penalty), proving offset-tolerant re-anchoring.
   - **covers —** `apps/studio/src/lib/annotate.ts:193-211`
5. **`at-apply-highlights-wraps-marks-and-ticks`** — Applying highlights wraps each text comment's span in a coloured st-hl mark and emits a gutter tick
   - **asserts —** applyHighlights(root,[textComment]) wraps the re-found span in <mark class='st-hl' data-id=COMMENT_ID> carrying the anchor colour (and data-resolved when resolved), and returns one GutterTick {id,color,resolved,top} for that comment; comments whose anchor isn't text/has no quote are skipped.
   - **covers —** `apps/studio/src/lib/annotate.ts:258-281`
6. **`at-clear-highlights-roundtrip`** — Clearing highlights restores the original text nodes
   - **asserts —** After applyHighlights then clearHighlights, the root contains no mark.st-hl and its textContent (normalised) equals the pre-highlight textContent — the wrap is non-destructive.
   - **covers —** `apps/studio/src/lib/annotate.ts:240-248`
7. **`at-heading-badges-count-unresolved-sections`** — Heading badges show the live unresolved section-comment count
   - **asserts —** updateHeadingBadges(root,comments) sets a heading button's text to '💬 N' and toggles 'has-comments' for slugs with N>0 unresolved section comments, and back to '💬' (no class) at zero; resolved and non-section comments are not counted.
   - **covers —** `apps/studio/src/lib/useAnnotations.tsx:246-258`
8. **`at-slug-parity-heading-vs-anchor`** — The same slugify drives both a rendered heading id and a section anchor's headingSlug
   - **asserts —** For a heading string, slugify(text) used by Markdown for the <h*> id equals parseHeadings(markdown) → slug used by sectionAnchor, so a section comment's headingSlug matches the rendered heading id it targets.
   - **covers —** `apps/studio/src/lib/markdown.ts:7-16,25-40`
9. **`at-server-mints-text-comment`** — POST /api/comments mints and persists a text-anchored comment with server-stamped fields
   - **asserts —** handleComments on a POST with a valid body/topicId/topicKind='doc' and a text anchor pushes a Comment with a generated id, createdAt, resolved=false, the supplied anchor (via readAnchor), and author defaulting to 'operator' when blank, then writes it to the comments store and responds 201.
   - **covers —** `apps/studio/server/devApi.ts:199-223`
10. **`at-server-anchor-downgrade`** — readAnchor downgrades an under-specified anchor to a safe kind
   - **asserts —** readAnchor returns kind='text' only when a non-empty quote is present, kind='section' only when a headingSlug is present, otherwise kind='topic' — so a text payload missing its quote (or a section missing its slug) is stored as a topic anchor rather than a broken locator.
   - **covers —** `apps/studio/server/devApi.ts:152-169`
11. **`at-operator-identity-default`** — The operator identity falls back to 'operator' when unset
   - **asserts —** getOperator() returns the localStorage 'storytree.operator' value when present and 'operator' when absent/empty, supplying the author stamp the composer sends with each comment.
   - **covers —** `apps/studio/src/lib/operator.ts:9-11`
