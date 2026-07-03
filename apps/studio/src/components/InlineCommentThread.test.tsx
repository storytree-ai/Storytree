// @vitest-environment jsdom
//
// Behaviour test for InlineCommentThread (ADR-0140, cap 7 of the review-mode story).
// Pins GEOMETRY/BEHAVIOUR only — the thread's appearance is the story's operator-attested UAT
// leg 2, witnessed by the owner; NO visual/appearance assertion lives here. What is proved:
//
//   • ict-in-flow-placement: the thread renders IN the document flow, not inside an aside or
//     side-panel container — the load-bearing structural observable (code-review style thread,
//     NOT the old CommentPanel sidebar).
//
//   • ict-block-anchored-post: posting a comment calls api.createComment with a BLOCK anchor
//     (kind: 'block', blockHandle) — never a text-quote or section anchor. The seam to cap 1.
//
//   • ict-feed-driven-refresh: a comment posted elsewhere appears after the next poll tick
//     (PRESENCE_POLL_MS cadence) without a page reload — fake timers drive the poll here.
//     The seam to cap 5.
//
//   • ict-review-only-affordance: the add-comment form (textarea + Post button) is HIDDEN in
//     View mode and SHOWN in Review mode. Existing comments render in both modes (read-only
//     in View). The seam to cap 6.
//
// The api client is mocked (no fetch, no DB, no socket) and the poll loop runs on fake timers.
// vi.fn() is intentionally untyped for listComments and createComment to allow block-anchor
// shapes (kind:'block') that will be added to CommentAnchor by cap 1's implementation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { PRESENCE_POLL_MS } from '../lib/presence';

// ── Api seam mock ─────────────────────────────────────────────────────────────────────────────
// Intentionally untyped (vi.fn()) so that mockResolvedValue accepts block-anchor comment shapes
// before the CommentAnchor union is extended by cap 1.
const apiMock = vi.hoisted(() => ({
  listComments: vi.fn(),
  createComment: vi.fn(),
}));
vi.mock('../api', () => ({ api: apiMock }));

import { InlineCommentThread } from './InlineCommentThread';

// ── Helpers ───────────────────────────────────────────────────────────────────────────────────

/** Flush the async chain that a mount/state-update kicked off (microtasks drain). */
const flush = (): Promise<void> => act(async () => {});
/** Advance the poll clock and flush whatever the tick triggered. */
const tick = (ms: number): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/**
 * A minimal block-anchored comment object for the listComments mock.
 * Uses the new `kind: 'block'` anchor shape (added by cap 1): the test pins the behaviour the
 * implementation must satisfy, so the shape is correct-by-design even before the type is updated.
 */
const blockComment = (id: string, body: string, blockId = 'intro-block') => ({
  id,
  topicKind: 'asset',
  topicId: 'review-topic',
  anchor: { kind: 'block', blockId },
  body,
  author: 'alice',
  createdAt: '2024-01-01T00:00:00.000Z',
  resolved: false,
  resolvedAt: null,
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.listComments.mockReset();
  apiMock.createComment.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────

describe('InlineCommentThread', () => {
  // ── ict-in-flow-placement ──────────────────────────────────────────────────────────────────
  //
  // The load-bearing structural observable: the thread is a sibling/child of the block container
  // in the document flow — NOT inside an <aside> or .comment-panel side panel. This is what
  // makes InlineCommentThread a code-review style thread that REPLACES CommentPanel (ADR-0140).
  it(
    'ict-renders-in-flow-above-its-block: renders in the document flow — not in an aside or side-panel',
    async () => {
      apiMock.listComments.mockResolvedValue([blockComment('c-1', 'Hello thread')]);

      const { container } = render(
        <InlineCommentThread
          blockHandle="intro-block"
          topicKind="asset"
          topicId="review-topic"
          operator="alice"
          mode="review"
        />,
      );
      await flush();

      // Must NOT be inside an aside (the old CommentPanel's structural element).
      expect(container.querySelector('aside')).toBeNull();
      // Must carry the in-flow structural class — the positioning anchor for the block thread.
      expect(container.querySelector('.inline-comment-thread')).toBeTruthy();
      // The existing comment renders inside the thread.
      expect(screen.getByText('Hello thread')).toBeTruthy();
    },
  );

  // ── ict-block-anchored-post ────────────────────────────────────────────────────────────────
  //
  // Adding a comment from the thread calls api.createComment with a BLOCK anchor
  // (kind: 'block', blockHandle) — never a text-quote anchor or section anchor.
  // This is the seam to cap 1 (the block-anchor type).
  it(
    'ict-posts-a-block-anchored-comment: posting sends a block anchor carrying the blockId',
    async () => {
      apiMock.listComments.mockResolvedValue([]);
      apiMock.createComment.mockResolvedValue(blockComment('c-new', 'New comment'));

      render(
        <InlineCommentThread
          blockHandle="intro-block"
          topicKind="asset"
          topicId="review-topic"
          operator="alice"
          mode="review"
        />,
      );
      await flush();

      // Type a comment body and submit.
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New comment' } });
      fireEvent.click(screen.getByRole('button', { name: /post/i }));
      await flush();

      // Exactly one createComment call, carrying a block anchor for this thread's block.
      expect(apiMock.createComment).toHaveBeenCalledTimes(1);
      expect(apiMock.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          topicKind: 'asset',
          topicId: 'review-topic',
          body: 'New comment',
          author: 'alice',
          anchor: expect.objectContaining({ kind: 'block', blockId: 'intro-block' }),
        }),
      );
    },
  );

  // ── ict-feed-driven-refresh ────────────────────────────────────────────────────────────────
  //
  // A comment posted elsewhere appears on the next poll tick (PRESENCE_POLL_MS cadence)
  // without a page reload. Fake timers drive the poll; the api seam returns an extra comment
  // on the second call. The seam to cap 5 (the review-refresh feed).
  it(
    'ict-refreshes-from-the-live-feed: a new comment appears on the next poll without a page reload',
    async () => {
      apiMock.listComments
        .mockResolvedValueOnce([blockComment('c-1', 'First comment')])
        .mockResolvedValueOnce([
          blockComment('c-1', 'First comment'),
          blockComment('c-2', 'Posted by someone else'),
        ]);

      render(
        <InlineCommentThread
          blockHandle="intro-block"
          topicKind="asset"
          topicId="review-topic"
          operator="alice"
          mode="review"
        />,
      );
      await flush(); // initial load resolves

      // After the first poll: first comment visible, second not yet.
      expect(screen.getByText('First comment')).toBeTruthy();
      expect(screen.queryByText('Posted by someone else')).toBeNull();

      // Advance to the next poll cadence — the feed re-polls and the new comment appears.
      await tick(PRESENCE_POLL_MS);
      expect(screen.getByText('Posted by someone else')).toBeTruthy();
    },
  );

  // ── ict-review-only-affordance ────────────────────────────────────────────────────────────
  //
  // The add-comment affordance (textarea + Post button) is gated on Review mode. In View mode:
  // existing comments still render (the thread is read-only, not hidden) but the form is absent.
  // The seam to cap 6 (the View ↔ Review mode toggle).
  it(
    'ict-add-affordance-is-review-only: form absent in view mode, present in review mode; comments always render',
    async () => {
      apiMock.listComments.mockResolvedValue([blockComment('c-1', 'Existing comment')]);

      const { rerender } = render(
        <InlineCommentThread
          blockHandle="intro-block"
          topicKind="asset"
          topicId="review-topic"
          operator="alice"
          mode="view"
        />,
      );
      await flush();

      // View mode: existing comments render (thread is read-only), but the form is absent.
      expect(screen.getByText('Existing comment')).toBeTruthy();
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.queryByRole('button', { name: /post/i })).toBeNull();

      // Switch to Review mode — the add-comment affordance appears.
      rerender(
        <InlineCommentThread
          blockHandle="intro-block"
          topicKind="asset"
          topicId="review-topic"
          operator="alice"
          mode="review"
        />,
      );

      expect(screen.getByRole('textbox')).toBeTruthy();
      expect(screen.getByRole('button', { name: /post/i })).toBeTruthy();
      // Existing comments still render in review mode.
      expect(screen.getByText('Existing comment')).toBeTruthy();
    },
  );
});
