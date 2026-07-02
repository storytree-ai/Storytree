// @vitest-environment jsdom
//
// Behaviour test for the View ↔ Review mode toggle (ADR-0140: the word-processor mode switch).
// Pins the GEOMETRY/BEHAVIOUR only — the toggle's appearance is the story's owner-attested UAT
// leg 1, witnessed by the owner and NEVER a machine visual verdict here. What is proved:
//   • in the default View posture, no commenting/suggesting affordances are visible
//     (rt-defaults-to-view),
//   • clicking the toggle flips to Review and the affordances become visible
//     (rt-flip-to-review-exposes-affordances),
//   • a second click flips back to View and the affordances are hidden again
//     (rt-flip-back-to-view-hides-affordances).
//
// No API, no timer, no fetch — the toggle holds no backend seam. The affordance presence is
// asserted via a minimal context-consumer child: the stand-in for caps 7 and 8, which gate their
// own affordances on the 'view' | 'review' mode that ReviewToggle provides via ReviewModeContext.

import { describe, it, expect, afterEach } from 'vitest';
import { useContext } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReviewToggle, ReviewModeContext } from './ReviewToggle';

/**
 * A minimal affordance consumer — the stand-in for caps 7 (inline-comment-thread) and
 * 8 (collapsed-suggestion-view). Reads the current mode from the context ReviewToggle
 * provides and renders a visible marker ONLY when in Review mode.
 */
function TestAffordances() {
  const mode = useContext(ReviewModeContext);
  if (mode !== 'review') return null;
  return <div data-testid="review-affordances">commenting + suggesting on</div>;
}

afterEach(cleanup);

describe('ReviewToggle', () => {
  // ── rt-defaults-to-view ─────────────────────────────────────────────────────────
  it('rt-defaults-to-view: renders the toggle switch and defaults to View — no affordances visible', () => {
    render(
      <ReviewToggle>
        <TestAffordances />
      </ReviewToggle>,
    );
    // The mode switch is always rendered (it is the entire point of this component).
    expect(screen.getByRole('button', { name: /view|review/i })).toBeTruthy();
    // In the default View posture the context publishes 'view', so consumers render nothing.
    expect(screen.queryByTestId('review-affordances')).toBeNull();
  });

  // ── rt-flip-to-review-exposes-affordances ────────────────────────────────────────
  it('rt-flip-to-review-exposes-affordances: clicking the toggle flips to Review and the affordances become visible', () => {
    render(
      <ReviewToggle>
        <TestAffordances />
      </ReviewToggle>,
    );
    // Default: no affordances.
    expect(screen.queryByTestId('review-affordances')).toBeNull();

    // Flip to Review.
    fireEvent.click(screen.getByRole('button', { name: /view|review/i }));

    // The context now publishes 'review'; the consumer's marker is visible.
    expect(screen.getByTestId('review-affordances')).toBeTruthy();
  });

  // ── rt-flip-back-to-view-hides-affordances ───────────────────────────────────────
  it('rt-flip-back-to-view-hides-affordances: a second click flips back to View and hides the affordances', () => {
    render(
      <ReviewToggle>
        <TestAffordances />
      </ReviewToggle>,
    );
    const toggle = screen.getByRole('button', { name: /view|review/i });

    // Flip to Review…
    fireEvent.click(toggle);
    expect(screen.getByTestId('review-affordances')).toBeTruthy();

    // …and back to View.  The same DOM node is clicked; its text may have changed but the
    // reference is stable.
    fireEvent.click(toggle);
    expect(screen.queryByTestId('review-affordances')).toBeNull();
  });
});
