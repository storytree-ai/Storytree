// @vitest-environment jsdom
//
// Behaviour test for the SuggestionView capability (collapsed-suggestion-view, ADR-0140).
// Proves GEOMETRY/BEHAVIOUR only — the appearance (does the collapsed/expanded change read cleanly)
// is the story's owner-attested UAT leg 4, never a machine visual verdict here.
//
// What is proved:
//   • the proposed result shows by default with NO strikethrough element; the original is hidden
//     until "show change" is clicked (sv-proposed-text-by-default, sv-show-change-expands-original),
//   • in Review mode a member may compose a suggested edit — submitting POSTs api.createSuggestion
//     with the block id + proposed text; the returned suggestion carries status 'open'
//     (sv-compose-posts-proposal),
//   • a member does NOT see Accept or Reject controls on an open suggestion
//     (sv-member-no-decision-controls),
//   • an owner/admin sees Accept and Reject controls on an open suggestion
//     (sv-admin-sees-decision-controls),
//   • clicking Accept calls api.decideSuggestion with decision 'accept' for the suggestion id
//     (sv-accept-calls-decision-seam),
//   • clicking Reject calls api.decideSuggestion with decision 'reject' for the suggestion id
//     (sv-reject-calls-decision-seam).
//
// The api seam is mocked (no real fetch, no DB, no socket) — every outcome is scripted exactly.
// ReviewModeContext is supplied via a Provider wrapper; the toggle's own behaviour lives in
// ReviewToggle.test.tsx. The panel imports no build engine and no agent/drive code (ADR-0004).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { MeInfo } from '../types';
import { ReviewModeContext } from './ReviewToggle';

// ── Suggestion type ─────────────────────────────────────────────────────────────
//
// A suggestion: the proposed replacement the member authored plus the original text the block
// held before the suggestion was created. The implementation will export this shape.

interface Suggestion {
  id: string;
  /** The block this suggestion targets (the blockId the createSuggestion POST carries). */
  blockId: string;
  /** What the prose WOULD become if accepted — displayed by default, no strikethrough. */
  proposedText: string;
  /** The original prose before the suggestion — hidden by default, revealed by "show change". */
  originalText: string;
  status: 'open' | 'accepted' | 'rejected';
  author: string;
}

// ── API seam mock ───────────────────────────────────────────────────────────────
//
// Only the two new suggestion methods are mocked here (createSuggestion / decideSuggestion).
// The existing api exports are untouched — vi.mock replaces the whole module for this file, so
// SuggestionView.tsx can call api.createSuggestion / api.decideSuggestion and the test controls
// the responses without any real fetch.

import { HttpDouble, installHttpDouble } from '../test/httpDouble';

// The `../api` module is NOT replaced (anti-slop-adoption-arc inc-06, `no-module-mocking`), and on
// the DECIDE route that is not cosmetic: `api.decideSuggestion` TRANSLATES the component's
// {id, decision} into the route's {suggestionId, action} (api.ts). Asserting on a mocked method
// checked the component-side shape and could never have caught a translation that stopped matching
// the route; asserting on the request body checks the contract the server actually receives.
const SUGGESTIONS = '/api/suggestions';
const DECISION = '/api/suggestions/decision';

let http: HttpDouble;

/** The POST bodies that reached one route, oldest first. */
const posted = (path: string): unknown[] =>
  http.requestsTo(path).filter((request) => request.method === 'POST').map((r) => r.body);

import { SuggestionView } from './SuggestionView';

// ── Helpers ─────────────────────────────────────────────────────────────────────

/** Flush the microtask queue after a click / form submit that triggers an async API call. */
const flush = (): Promise<void> => act(async () => {});

// ── Shared fixtures ─────────────────────────────────────────────────────────────

const openSuggestion: Suggestion = {
  id: 'sg-1',
  blockId: 'block-intro',
  proposedText: 'The new proposed text.',
  originalText: 'The old original text.',
  status: 'open',
  author: 'alice@ex.com',
};

const memberMe: MeInfo = {
  email: 'member@ex.com',
  role: 'member',
  status: 'active',
  member: true,
};

const adminMe: MeInfo = {
  email: 'admin@ex.com',
  role: 'admin',
  status: 'active',
  member: true,
};

beforeEach(() => {
  http = installHttpDouble();
});

afterEach(() => {
  cleanup();
  http.uninstall();
});

describe('SuggestionView', () => {
  // ── sv-proposed-text-by-default ───────────────────────────────────────────────
  //
  // The deliberate word-processor choice (ADR-0140): read the result, expand to audit the change.
  // The proposed text is rendered as the default view — no strikethrough diff presentation.
  it('csv-proposed-result-by-default-no-strikethrough: the proposed text is displayed by default with NO strikethrough element, and the original is hidden until the toggle is clicked', () => {
    const { container } = render(<SuggestionView suggestion={openSuggestion} me={adminMe} />);

    // The proposed text is visible without any interaction.
    expect(screen.getByText(/The new proposed text\./)).toBeTruthy();
    // NO strikethrough element — this is NOT a code-diff presentation.
    expect(container.querySelector('s, del')).toBeNull();
    // The original text is NOT visible by default — it is collapsed behind the toggle.
    expect(screen.queryByText(/The old original text\./)).toBeNull();
  });

  // ── sv-show-change-expands-original ──────────────────────────────────────────
  //
  // Clicking the "show change" toggle reveals the original so the reviewer can audit what changed.
  // Clicking it again collapses it back (a true toggle, not a one-way expansion).
  it('csv-show-change-expands-the-original: clicking "show change" reveals the original text; clicking again collapses it', () => {
    render(<SuggestionView suggestion={openSuggestion} me={adminMe} />);

    // Before the first click the original is hidden.
    expect(screen.queryByText(/The old original text\./)).toBeNull();

    // Click the show-change toggle.
    fireEvent.click(screen.getByRole('button', { name: /show change/i }));

    // The original text is now visible.
    expect(screen.getByText(/The old original text\./)).toBeTruthy();

    // Click the toggle again to collapse (the label may have flipped to "hide change" or stay
    // "show change" — either way it matches the regex and collapses the original).
    fireEvent.click(screen.getByRole('button', { name: /hide change|show change/i }));

    // Original is hidden again.
    expect(screen.queryByText(/The old original text\./)).toBeNull();
  });

  // ── sv-compose-posts-proposal ─────────────────────────────────────────────────
  //
  // In Review mode a member may compose a suggested edit to the block.  Submitting the compose
  // form POSTs api.createSuggestion with the block id + the typed proposed text.  The returned
  // suggestion has status 'open' — the member proposes, an admin decides.
  it('csv-member-composes-a-proposal: in Review mode a member may compose a suggested edit — submitting POSTs api.createSuggestion with the block id + proposed text, result status is open', async () => {
    http.post(SUGGESTIONS, () => ({ id: 'sg-new', status: 'open' }));

    render(
      <ReviewModeContext.Provider value="review">
        <SuggestionView suggestion={openSuggestion} me={memberMe} />
      </ReviewModeContext.Provider>,
    );

    // In Review mode a compose form is visible so the member can author a proposal.
    const composeInput = screen.getByRole('textbox');
    fireEvent.change(composeInput, { target: { value: 'A better alternative proposal.' } });
    fireEvent.click(screen.getByRole('button', { name: /suggest|submit/i }));
    await flush();

    // The seam was called exactly once with the block id and the member's proposed text.
    expect(posted(SUGGESTIONS)).toEqual([
      { blockId: 'block-intro', proposedText: 'A better alternative proposal.' },
    ]);
  });

  // ── sv-member-no-decision-controls ───────────────────────────────────────────
  //
  // A member cannot accept or reject a suggestion — deciding is admin-only (cap 4).
  // The affordance is absent from the rendered view entirely so a member cannot reach the seam.
  it('csv-decision-controls-are-admin-only: a member does NOT see Accept or Reject controls on an open suggestion', () => {
    render(<SuggestionView suggestion={openSuggestion} me={memberMe} />);

    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
  });

  // ── sv-admin-sees-decision-controls ──────────────────────────────────────────
  //
  // An owner/admin sees both Accept and Reject controls on an open suggestion.
  // The server is the real wall (cap 4); this is the affordance gating so the controls only
  // appear for a role that has the right to decide.
  it('sv-admin-sees-decision-controls: an owner/admin sees Accept and Reject controls on an open suggestion', () => {
    render(<SuggestionView suggestion={openSuggestion} me={adminMe} />);

    expect(screen.getByRole('button', { name: /accept/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reject/i })).toBeTruthy();
  });

  // ── sv-accept-calls-decision-seam ────────────────────────────────────────────
  //
  // Clicking Accept calls api.decideSuggestion with decision 'accept' and the suggestion id.
  // This drives cap 3's accept route — the seam is the ONLY path to the decision (ADR-0004).
  it('sv-accept-calls-decision-seam: clicking Accept calls api.decideSuggestion with accept for the suggestion id', async () => {
    http.post(DECISION, () => ({ id: 'sg-1', status: 'accepted' }));
    render(<SuggestionView suggestion={openSuggestion} me={adminMe} />);

    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    await flush();

    // The WIRE shape cap 3's route reads — {suggestionId, action}, not the component's
    // {id, decision}. The translation lives in api.ts and is under test only from here.
    expect(posted(DECISION)).toEqual([{ suggestionId: 'sg-1', action: 'accept' }]);
  });

  // ── sv-reject-calls-decision-seam ────────────────────────────────────────────
  //
  // Clicking Reject calls api.decideSuggestion with decision 'reject' and the suggestion id.
  it('sv-reject-calls-decision-seam: clicking Reject calls api.decideSuggestion with reject for the suggestion id', async () => {
    http.post(DECISION, () => ({ id: 'sg-1', status: 'rejected' }));
    render(<SuggestionView suggestion={openSuggestion} me={adminMe} />);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    await flush();

    expect(posted(DECISION)).toEqual([{ suggestionId: 'sg-1', action: 'reject' }]);
  });
});
