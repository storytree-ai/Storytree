/**
 * View ↔ Edit mode toggle (ADR-0146: the top-left word-processor mode switch).
 *
 * Two states (the CONTEXT VALUE is unchanged from cap 6 — 'view' | 'review' — only the
 * visible LABEL changed to View | Edit per ADR-0146; downstream consumers still gate on
 * the 'review' value):
 *   - 'view'   — the read posture; clean rendered prose, no editing affordances.
 *   - 'review' — the editor is on (rendered as "Edit").
 *
 * The toggle owns the mode state and publishes it via ReviewModeContext.  The
 * ReviewEditor (ADR-0146) reads the context and shows the split-pane editor on 'review'.
 * This component gates; it does not implement the editor.
 */

import { createContext, useState } from 'react';

// ── Mode type & context ──────────────────────────────────────────────────────

export type ReviewMode = 'view' | 'review';

/**
 * The context caps 7 and 8 read.  Default is 'view' so any consumer rendered
 * outside a ReviewToggle tree gets the safe read-only posture.
 */
export const ReviewModeContext = createContext<ReviewMode>('view');

/**
 * A setter published alongside the mode so a child (e.g. the editor's Cancel button)
 * can return the surface to View without owning the toggle. Default is a no-op so a
 * consumer rendered outside a ReviewToggle tree stays inert. The toggle button's own
 * click behaviour is unchanged — this only exposes the same state to descendants.
 */
export const SetReviewModeContext = createContext<(mode: ReviewMode) => void>(() => {});

// ── Component ────────────────────────────────────────────────────────────────

interface ReviewToggleProps {
  children?: React.ReactNode;
}

/**
 * Renders the View ↔ Edit mode switch (a top-left segmented control) and wraps children in
 * the mode context. It is ONE button (the proven cap-6 toggle behaviour): its accessible
 * name always contains the current mode's word ("View" or "Edit") so it reads as a mode
 * switch; a click flips between the two states. The two [View | Edit] segments are the
 * visual affordance — the active one is highlighted via aria-pressed / .is-active.
 */
export function ReviewToggle({ children }: ReviewToggleProps) {
  const [mode, setMode] = useState<ReviewMode>('view');

  function toggle() {
    setMode((m) => (m === 'view' ? 'review' : 'view'));
  }

  const inEdit = mode === 'review';

  return (
    <ReviewModeContext.Provider value={mode}>
      <SetReviewModeContext.Provider value={setMode}>
        <button
          type="button"
          className="review-mode-toggle"
          onClick={toggle}
          aria-label={inEdit ? 'Edit mode — switch to View' : 'View mode — switch to Edit'}
          aria-pressed={inEdit}
        >
          <span className={`review-mode-seg${!inEdit ? ' is-active' : ''}`}>View</span>
          <span className={`review-mode-seg${inEdit ? ' is-active' : ''}`}>Edit</span>
        </button>
        {children}
      </SetReviewModeContext.Provider>
    </ReviewModeContext.Provider>
  );
}
