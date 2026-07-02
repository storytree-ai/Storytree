/**
 * View ↔ Review mode toggle (ADR-0140: the word-processor mode switch).
 *
 * Two states:
 *   - 'view'   — the read posture; no commenting/suggesting affordances are shown.
 *   - 'review' — commenting + suggesting turned on.
 *
 * The toggle owns the mode state and publishes it via ReviewModeContext.  Caps 7
 * (inline-comment-thread) and 8 (collapsed-suggestion-view) read the context and gate
 * their own affordances on the published value — this component gates, it does not
 * implement those affordances.
 */

import { createContext, useContext, useState } from 'react';

// ── Mode type & context ──────────────────────────────────────────────────────

export type ReviewMode = 'view' | 'review';

/**
 * The context caps 7 and 8 read.  Default is 'view' so any consumer rendered
 * outside a ReviewToggle tree gets the safe read-only posture.
 */
export const ReviewModeContext = createContext<ReviewMode>('view');

// ── Component ────────────────────────────────────────────────────────────────

interface ReviewToggleProps {
  children?: React.ReactNode;
}

/**
 * Renders the View ↔ Review mode switch and wraps children in the mode context.
 * The button label reflects the CURRENT mode so it always matches /view|review/i.
 */
export function ReviewToggle({ children }: ReviewToggleProps) {
  const [mode, setMode] = useState<ReviewMode>('view');

  function toggle() {
    setMode((m) => (m === 'view' ? 'review' : 'view'));
  }

  return (
    <ReviewModeContext.Provider value={mode}>
      <button type="button" className="btn small review-mode-toggle" onClick={toggle}>
        {mode === 'view' ? 'View' : 'Review'}
      </button>
      {children}
    </ReviewModeContext.Provider>
  );
}

/**
 * Lays out a topic surface for the current mode: in Review the side `panel`
 * (the commenting affordance — today CommentPanel, replaced in-flow by cap 7)
 * renders next to the document; in View it is hidden and the document takes
 * the full width.
 */
export function ReviewLayout({
  children,
  panel,
}: {
  children: React.ReactNode;
  panel: React.ReactNode;
}) {
  const mode = useContext(ReviewModeContext);
  return (
    <div className={mode === 'review' ? 'doc-layout' : 'doc-layout doc-layout-view'}>
      {children}
      {mode === 'review' ? panel : null}
    </div>
  );
}
