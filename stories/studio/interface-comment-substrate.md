# Cross-story interface: `comment-substrate`

A declared cross-story interface per ADR-0010 §4
(declared 2026-06-11, resolving `feedback-graduation` owner call #3). ADR-0010 leaves the schema
term provisional (`boundary` / `port`) and names no canonical location, so this one-pager lives
with the owning story; ratify shape and home when `packages/core` formalises the entity.

## Name

`comment-substrate` — the comment/post persistence surface: typed comment events appended over a
live projection, anchored to corpus documents.

## Owner

The **`studio`** organism ([story](story.md)). The substrate was built for the studio's
annotate/resolve surfaces and the studio remains its reference consumer; its persistence now lives
behind the shared store seam.

## What constitutes the interface

The store-seam comment surface in
[`packages/store/src/pg-comment-store.ts`](../../packages/store/src/pg-comment-store.ts):

- **`PgCommentStore`** — `list(filter?)` · `create(comment, actor)` · `update(id, patch, actor)` ·
  `remove(id, actor)` (event-appending soft remove; history stays).
- **`mergeCommentPatch(existing, patch)`** — the pure upsert-merge semantics (undefined ignored,
  inputs never mutated).
- The types **`Comment`**, **`CommentAnchor`**, **`CommentPatch`**, **`CommentFilter`**.
- The tables **`events.comment_event`** (append-only history) + **`events.comment`** (projection)
  in [`packages/store/src/schema.sql`](../../packages/store/src/schema.sql).

Everything else about comments (the studio's anchor resolution, rendering, UI state) is
story-internal — consumers couple to the seam above only.

## Consumers

- [`stories/feedback-graduation`](../feedback-graduation/story.md) — `cite-event` and
  `archive-with-reason` sit ON this substrate (cites target comments; archival drops a comment
  from the live surface, history preserved). The substrate is consumed, never re-scoped, there.
