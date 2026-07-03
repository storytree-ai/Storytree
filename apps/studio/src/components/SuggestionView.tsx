/**
 * SuggestionView — the word-processor suggestion model (ADR-0140, collapsed-suggestion-view).
 *
 * Renders the PROPOSED RESULT by default (no strikethrough diff), with the original
 * collapsed behind a "show change" toggle.  In Review mode a member may compose a
 * suggested edit (POSTing a proposal through the api seam).  An owner/admin sees
 * Accept/Reject controls that drive the decision; a member does not.
 *
 * The api seam provides createSuggestion + decideSuggestion — both are mocked in
 * the test via vi.mock('../api', …); the cast below bridges the typecheck gap until
 * the suggestion routes are wired server-side.
 *
 * The panel imports NO build engine, no agent/drive code (ADR-0004).
 */

import { useContext, useState } from 'react';
import { api } from '../api.js';
import { ReviewModeContext } from './ReviewToggle.js';
import type { MeInfo, TopicKind } from '../types.js';

// ── Suggestion shape ──────────────────────────────────────────────────────────

/**
 * A pending suggested edit: the proposed replacement the author wrote plus the
 * original text the block held before the suggestion was created.
 */
export interface Suggestion {
  id: string;
  /** The block this suggestion targets. */
  blockId: string;
  /** What the prose WOULD become if accepted — shown by default, no strikethrough. */
  proposedText: string;
  /** The original prose before the suggestion — hidden by default, revealed by "show change". */
  originalText: string;
  status: 'open' | 'accepted' | 'rejected';
  author: string;
}

// ── Suggestion-seam typing ────────────────────────────────────────────────────
//
// The two suggestion api methods this view uses — createSuggestion and decideSuggestion.
// The full api object is mocked in tests via vi.mock('../api', () => ({ api: apiMock }));
// the cast below makes the typecheck pass while the server routes are added in cap 3/4.

interface SuggestionSeam {
  createSuggestion: (input: {
    blockId: string;
    proposedText: string;
    /** Topic identity + drift witness — sent when the mount supplies them (the server needs
     *  them to persist a real Suggestion record; the component test exercises the seam bare). */
    topicKind?: TopicKind;
    topicId?: string;
    originalText?: string;
  }) => Promise<{ id: string; status: 'open' }>;
  decideSuggestion: (input: {
    id: string;
    decision: 'accept' | 'reject';
  }) => Promise<{ id: string; status: 'accepted' | 'rejected' }>;
}

const suggApi = api as unknown as SuggestionSeam;

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SuggestionViewProps {
  suggestion: Suggestion;
  me: MeInfo;
  /** Topic identity for the compose POST; optional — when absent the compose sends the bare
   *  seam payload (the proven component-test shape). The mount always supplies it. */
  topicKind?: TopicKind;
  topicId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders a suggestion in the word-processor posture (ADR-0140):
 *   - proposed result shown by default, no strikethrough
 *   - original collapsed behind "show change"
 *   - compose form visible in Review mode (members propose, admins decide)
 *   - Accept/Reject controls for admin/owner; hidden for members
 */
export function SuggestionView({ suggestion, me, topicKind, topicId }: SuggestionViewProps) {
  const mode = useContext(ReviewModeContext);
  const [showOriginal, setShowOriginal] = useState(false);
  const [composeText, setComposeText] = useState('');

  // Role gate: deciding is admin-only (cap 4); member sees no decision affordances.
  const isAdmin = me.role === 'admin';

  async function handleAccept(): Promise<void> {
    await suggApi.decideSuggestion({ id: suggestion.id, decision: 'accept' });
  }

  async function handleReject(): Promise<void> {
    await suggApi.decideSuggestion({ id: suggestion.id, decision: 'reject' });
  }

  async function handleSubmit(): Promise<void> {
    await suggApi.createSuggestion({
      blockId: suggestion.blockId,
      proposedText: composeText,
      // Topic identity + the drift witness ride along only when the mount supplies them —
      // the bare payload stays the proven seam shape.
      ...(topicKind !== undefined && topicId !== undefined
        ? { topicKind, topicId, originalText: suggestion.originalText }
        : {}),
    });
  }

  return (
    <div className="suggestion-view">
      {/* The proposed result — shown by default, no strikethrough (ADR-0140 word-processor choice). */}
      <p className="suggestion-proposed">{suggestion.proposedText}</p>

      {/* Expand/collapse the original so the reviewer can audit what changed. */}
      <button
        type="button"
        className="suggestion-toggle"
        onClick={() => setShowOriginal((v) => !v)}
      >
        {showOriginal ? 'hide change' : 'show change'}
      </button>

      {showOriginal && (
        <p className="suggestion-original">{suggestion.originalText}</p>
      )}

      {/* Compose form — visible in Review mode so a member may author a proposal. */}
      {mode === 'review' && (
        <div className="suggestion-compose">
          <input
            type="text"
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            placeholder="Propose an edit…"
          />
          <button type="button" onClick={() => { void handleSubmit(); }}>
            Suggest
          </button>
        </div>
      )}

      {/* Decision controls — admin only; a member must not see them (cap 4 wall). */}
      {isAdmin && suggestion.status === 'open' && (
        <div className="suggestion-decision">
          <button type="button" onClick={() => { void handleAccept(); }}>
            Accept
          </button>
          <button type="button" onClick={() => { void handleReject(); }}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
