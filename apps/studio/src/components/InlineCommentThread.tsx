/**
 * InlineCommentThread — a block-anchored comment thread rendered in the document
 * flow above its anchor block (ADR-0140, cap 7 of the review-mode story).
 *
 * Three seams:
 *  • api.listComments  (cap 5 feed) — polled on the PRESENCE_POLL_MS cadence.
 *  • api.createComment (cap 1 anchor) — posts with a BLOCK anchor (kind:'block').
 *  • mode prop         (cap 6 toggle) — add-comment affordance shown only in review.
 *
 * NOT an <aside>. The thread renders as a div.inline-comment-thread in the document
 * flow — never in a side panel.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { PRESENCE_POLL_MS } from '../lib/presence';
import type { TopicKind, Comment } from '../types';

// ── Props ─────────────────────────────────────────────────────────────────────

interface InlineCommentThreadProps {
  /** The block this thread is anchored to (the handle cap 1 will expose). */
  blockHandle: string;
  topicKind: TopicKind;
  topicId: string;
  /** The local operator identity for new comments. */
  operator: string;
  /** 'view' → read-only thread; 'review' → add-comment affordance shown. */
  mode: 'view' | 'review';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InlineCommentThread({
  blockHandle,
  topicKind,
  topicId,
  operator,
  mode,
}: InlineCommentThreadProps): React.JSX.Element {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  // Ref so handlePost can read the CURRENT textarea value even when the React
  // controlled-input state update hasn't been flushed yet (fireEvent.change sets
  // the DOM value synchronously; the React re-render follows asynchronously).
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Feed poll (seam to cap 5) ───────────────────────────────────────────────

  const loadComments = useCallback(async (): Promise<void> => {
    try {
      const result = await api.listComments(topicId);
      // One thread per block: keep only THIS block's comments (a topic's other
      // block threads render their own).
      setComments(
        result.filter((c) => c.anchor.kind === 'block' && c.anchor.blockId === blockHandle),
      );
    } catch {
      // Advisory: keep the last-known comments on a failed poll (same discipline
      // as the presence layer's "keep last-known sessions" on a studio server error).
    }
  }, [topicId, blockHandle]);

  useEffect(() => {
    void loadComments();
    const id = window.setInterval(() => void loadComments(), PRESENCE_POLL_MS);
    return () => window.clearInterval(id);
  }, [loadComments]);

  // ── Block-anchored post (seam to cap 1) ────────────────────────────────────

  function handlePost(): void {
    // Read current DOM value so the call is correct even before the React state
    // update from the preceding onChange has been flushed.
    const text = (textareaRef.current?.value ?? body).trim();
    if (!text || busy) return;
    setBusy(true);
    // kind:'block' is the cap-1 anchor shape — `blockId` is the field the store
    // boundary (normalizeCommentAnchor) keeps; the text-span fields ride as null
    // and are stripped on write.
    void api
      .createComment({
        topicKind,
        topicId,
        body: text,
        author: operator,
        anchor: {
          kind: 'block',
          blockId: blockHandle,
          headingSlug: null,
          headingText: null,
          quote: null,
          prefix: null,
          suffix: null,
          startOffset: null,
          color: null,
        },
      })
      .then(() => {
        setBody('');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="inline-comment-thread">
      <ul>
        {comments.map((c) => (
          <li key={c.id}>{c.body}</li>
        ))}
      </ul>

      {/* add-comment affordance — shown only in review mode (seam to cap 6) */}
      {mode === 'review' && (
        <>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button type="button" onClick={handlePost}>
            Post
          </button>
        </>
      )}
    </div>
  );
}
