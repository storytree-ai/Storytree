/**
 * ReviewBlocks — the Stage-2 mount for the Review-mode surface (ADR-0140 caps 7/8),
 * reshaped to Google-Docs "suggesting mode" (owner call 2026-07-03).
 *
 * Renders a topic body PER BLOCK (splitBlocks — the stable content-hash handles
 * comment/suggestion anchors carry). The interaction is a word processor, not a
 * form:
 *
 *  • VIEW mode — pure read. The prose renders as prose; nothing is interactive,
 *    no controls at all.
 *  • REVIEW mode — each block's prose is CLICK-TO-EDIT IN PLACE. Clicking a block
 *    swaps its rendered markdown for a seamless inline <textarea> styled to look
 *    identical to the prose (the document font, no bordered card). On blur / ⌘↵ /
 *    Ctrl+↵ the edited text becomes a SUGGESTION (api.createSuggestion) — but only
 *    if it actually changed; an unchanged (or whitespace-only) edit is a no-op.
 *    Esc cancels. After a successful create the feed refreshes immediately so the
 *    new suggestion appears inline at once.
 *  • Open suggestions render inline under their block via <SuggestionView> (the
 *    light card the owner liked). Each is wrapped in a value="view" mode context so
 *    its OWN compose input stays hidden — composing now happens by editing the
 *    block, not inside the suggestion card. Its admin Accept/Reject stay (they are
 *    role-gated, not mode-gated).
 *  • Comments — an <InlineCommentThread> renders above a block that carries ≥1
 *    block-anchored comment (or that the reviewer explicitly opened via the quiet,
 *    always-visible margin "comment" affordance). Nothing is opacity:0-until-hover.
 *
 * In Review mode the feed polls on a SNAPPY, visibility-gated cadence so a peer's
 * accept/reject/post feels live within a few seconds (SuggestionView drives its
 * admin decisions straight through the api, so this poll is how those land here
 * without touching the proven component). In View mode there is no poll.
 *
 * Per-block prose is memoized as stable element references so React never
 * reconciles the rendered markdown — which would strip the annotation layer's
 * imperatively-inserted highlight <mark>s.
 */

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '../api';
import { splitBlocks } from '../lib/blocks';
import { useAppData } from '../lib/appData';
import { useOperator } from '../lib/operator';
import { Markdown } from './Markdown';
import { ReviewModeContext } from './ReviewToggle';
import { InlineCommentThread } from './InlineCommentThread';
import { SuggestionView, type Suggestion } from './SuggestionView';
import type { ReviewFeedPayload, TopicKind } from '../types';

interface ReviewBlocksProps {
  topicKind: TopicKind;
  topicId: string;
  /** The topic's markdown source — the same text splitBlocks hashed server-side. */
  body: string;
}

/** Review-mode feed cadence: snappy so a peer's decision/post feels live (owner: the 30s
 *  presence cadence made accept/reject feel dead). Visibility-gated below so a hidden tab
 *  never polls. */
const REVIEW_POLL_MS = 3_000;

export function ReviewBlocks({ topicKind, topicId, body }: ReviewBlocksProps): React.JSX.Element {
  const mode = useContext(ReviewModeContext);
  const { me } = useAppData();
  const [operator] = useOperator();
  const inReview = mode === 'review';

  // ── The one feed poll (cap 5's payload: comments + suggestions) ─────────────
  const [feed, setFeed] = useState<ReviewFeedPayload | null>(null);
  const loadFeed = useCallback(async (): Promise<void> => {
    try {
      setFeed(await api.reviewFeed(topicId));
    } catch {
      // Advisory: a down/degraded feed keeps the last-known payload — never crash.
    }
  }, [topicId]);

  // View mode: fetch once (so open suggestions still render as read-only cards) but do NOT
  // poll. Review mode: poll on the snappy cadence, gated on document visibility.
  useEffect(() => {
    void loadFeed();
    if (!inReview) return;
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void loadFeed();
    }, REVIEW_POLL_MS);
    return () => window.clearInterval(id);
  }, [loadFeed, inReview]);

  // ── Block model + memoized prose ────────────────────────────────────────────
  const blocks = useMemo(() => splitBlocks(body), [body]);
  // Stable element references per block: React bails out of reconciling an
  // identical element, so the highlight marks inside the markdown DOM survive
  // feed-poll re-renders.
  const blockBodies = useMemo(
    () => new Map(blocks.map((b) => [b.id, <Markdown>{b.text}</Markdown>] as const)),
    [blocks],
  );

  // Blocks that carry ≥1 block-anchored comment (the mount signal for a thread).
  const commentedBlocks = useMemo(() => {
    const ids = new Set<string>();
    for (const c of feed?.comments ?? []) {
      if (c.anchor.kind === 'block' && typeof c.anchor.blockId === 'string') {
        ids.add(c.anchor.blockId);
      }
    }
    return ids;
  }, [feed]);

  // Open suggestions grouped by target block, mapped store-field → component-prop
  // (SuggestionRecord {block, proposed, original} → Suggestion {blockId, proposedText, originalText}).
  const suggestionsByBlock = useMemo(() => {
    const map = new Map<string, Suggestion[]>();
    for (const s of feed?.suggestions ?? []) {
      if (s.status !== 'open') continue;
      const suggestion: Suggestion = {
        id: s.id,
        blockId: s.block,
        proposedText: s.proposed,
        originalText: s.original,
        status: s.status,
        author: s.author,
      };
      const list = map.get(s.block);
      if (list) list.push(suggestion);
      else map.set(s.block, [suggestion]);
    }
    return map;
  }, [feed]);

  // ── Reviewer-opened comment threads ─────────────────────────────────────────
  const [openThreads, setOpenThreads] = useState<ReadonlySet<string>>(() => new Set());
  function openThread(blockId: string): void {
    setOpenThreads((prev) => new Set(prev).add(blockId));
  }

  // ── Click-to-edit-in-place ──────────────────────────────────────────────────
  // The block currently being edited (its prose swapped for the inline editor), and the
  // draft text the editor holds. A single-block editor: clicking a new block commits the
  // previous one (the editor's own blur fires first).
  const [editingBlock, setEditingBlock] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // Guards a create against a double-fire (blur + a commit key), and against re-entrancy
  // while the POST is in flight.
  const committingRef = useRef(false);

  function startEdit(blockId: string, sourceText: string): void {
    setEditingBlock(blockId);
    setDraft(sourceText);
  }

  function cancelEdit(): void {
    setEditingBlock(null);
    setDraft('');
  }

  const commitEdit = useCallback(
    async (blockId: string, originalText: string): Promise<void> => {
      if (committingRef.current) return;
      const proposedText = draft;
      // Close the editor immediately (the block returns to rendered prose); a no-op edit
      // just closes with nothing posted.
      setEditingBlock(null);
      setDraft('');
      if (proposedText.trim() === '' || proposedText === originalText) return;
      committingRef.current = true;
      try {
        await api.createSuggestion({
          blockId,
          proposedText,
          topicKind,
          topicId,
          originalText,
        });
        await loadFeed(); // refresh immediately so the new suggestion appears inline at once
      } catch {
        // Advisory: a failed POST leaves the prose as-is; the reviewer can re-edit.
      } finally {
        committingRef.current = false;
      }
    },
    [draft, topicKind, topicId, loadFeed],
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={inReview ? 'review-blocks review-blocks-review' : 'review-blocks'}>
      {blocks.map((block) => {
        const showThread = commentedBlocks.has(block.id) || openThreads.has(block.id);
        const suggestions = suggestionsByBlock.get(block.id) ?? [];
        const isEditing = inReview && editingBlock === block.id;
        return (
          <div className="review-block" key={block.id} data-block-id={block.id}>
            {showThread && (
              <InlineCommentThread
                blockHandle={block.id}
                topicKind={topicKind}
                topicId={topicId}
                operator={operator}
                mode={mode}
              />
            )}

            {isEditing ? (
              <BlockEditor
                value={draft}
                onChange={setDraft}
                onCommit={() => void commitEdit(block.id, block.text)}
                onCancel={cancelEdit}
              />
            ) : inReview ? (
              <div className="review-block-prose">
                <button
                  type="button"
                  className="review-comment-affordance"
                  aria-label="Add a comment"
                  title="Comment"
                  onClick={(e) => {
                    e.stopPropagation();
                    openThread(block.id);
                  }}
                >
                  {/* a quiet speech-bubble glyph in the margin — always visible, never hover-hidden */}
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H6l-3 3v-3H3.5A1.5 1.5 0 0 1 2 9.5v-6Z"
                    />
                  </svg>
                </button>
                <div
                  className="review-editable"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    // Isolate from the article's text-selection annotation layer (cap 9's
                    // useAnnotations lives on the enclosing <article>).
                    e.stopPropagation();
                    startEdit(block.id, block.text);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      startEdit(block.id, block.text);
                    }
                  }}
                >
                  {blockBodies.get(block.id)}
                </div>
              </div>
            ) : (
              // View mode: pure read — the prose, nothing interactive.
              blockBodies.get(block.id)
            )}

            {suggestions.map((s) => (
              <div className="suggestion-slot" key={s.id}>
                <span className="suggestion-slot-label">suggested edit · {s.author}</span>
                {/* value="view" keeps the card's OWN compose input hidden — composing is now the
                    block editor; the admin Accept/Reject inside are role-gated, so they stay. */}
                <ReviewModeContext.Provider value="view">
                  <SuggestionView suggestion={s} me={me} topicKind={topicKind} topicId={topicId} />
                </ReviewModeContext.Provider>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── The inline block editor ─────────────────────────────────────────────────────
//
// An auto-growing <textarea> styled (via .block-editor in index.css) to read as the document
// prose — the document font/size/line-height/colour, no bordered card. It focuses itself and
// places the caret at the end on mount, grows to fit its content, and commits on blur or ⌘/Ctrl+↵,
// cancels on Esc.

interface BlockEditorProps {
  value: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

function BlockEditor({ value, onChange, onCommit, onCancel }: BlockEditorProps): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Focus + caret-to-end on mount.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  // Auto-grow: match the textarea height to its scroll height so it reads as a paragraph, not a box.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="block-editor"
      value={value}
      aria-label="Edit block — your change becomes a suggestion"
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          // Commit via blur so a single path (onBlur) creates the suggestion — no double-fire.
          e.currentTarget.blur();
        }
      }}
    />
  );
}
