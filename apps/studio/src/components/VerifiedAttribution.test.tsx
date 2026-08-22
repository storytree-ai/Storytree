// @vitest-environment jsdom
//
// Behaviour test for the "verified-attribution" capability (ADR-0204 D4): comment attribution
// derives from the VERIFIED `/api/me` identity everywhere the operator field used to sit — the
// comment composer presents it read-only, posting relies on it, and the localStorage operator
// store is never consulted. Exercised through the real composer mount (`ReviewBlocks` →
// `InlineCommentThread`) with `api` stubbed (no fetch/socket/DB) and `useAppData` driven by a
// controllable `me` — the same discipline `ReviewBlocks.test.tsx` / `Hud.test.tsx` use.
//
// NO visual/look assertion here (ADR-0070 stage 2 owns the LOOK of the identity foot) — every
// assertion below is presence/absence of text, editability, the posted `author`, and localStorage
// key usage.
//
// What is proved:
//
//   • att-composer-shows-verified-identity: the composer displays the resolved `me.email` text
//     when the identity has resolved.
//   • va-composer-shows-fallback-identity: the composer displays the conventional `operator`
//     fallback text when `me.email` is null (the open dev posture).
//   • va-composer-identity-is-not-editable: the identity is never an editable field — no
//     `input[aria-label="operator identity"]`, no plain `<input>` at all in the thread.
//   • att-post-author-from-verified-identity: posting a comment sends an author derived from the
//     RESOLVED `me.email`, never a stale localStorage-sourced name.
//   • va-post-uses-fallback-identity: posting a comment with an UNRESOLVED identity sends the
//     `operator` fallback, never a stale localStorage-sourced name.
//   • att-operator-store-retired: the operator module is gone and the `storytree.operator` localStorage key is never
//     read or written by the composer mount.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

import { HttpDouble, installHttpDouble } from '../test/httpDouble';
import { WithAppData } from '../test/appData';
import type { MeInfo } from '../types';

// THE SEAMS ARE REAL, NOT MOCKED MODULES (anti-slop-adoption-arc inc-06, `no-module-mocking`): the
// TRANSPORT is doubled (src/test/httpDouble.ts), the verified identity arrives through the app's own
// `AppDataContext`, and `Markdown` is the REAL component — the stub's stated reason (mermaid +
// appData internals) was removed by this lane's diagram seam.
//
// It also tightens exactly what this file is about. The mocked hook returned a two-field `me`
// ({role, email}); the real context takes a complete `MeInfo`, so an attribution surface that
// started reading `member` or `status` can no longer silently see `undefined` here.
const FEED = '/api/review/feed';
const COMMENTS = '/api/comments';

let http: HttpDouble;

/** The comment POST bodies that reached the wire, oldest first. */
const postedComments = (): Array<{ author?: string }> =>
  http
    .requestsTo(COMMENTS)
    .filter((request) => request.method === 'POST')
    .map((request) => (request.body ?? {}) as { author?: string });

import { ReviewBlocks } from './ReviewBlocks';
import { ReviewModeContext } from './ReviewToggle';

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

const BODY = 'First paragraph of the doc.\n\nSecond paragraph of the doc.';
const emptyFeed = { topicId: 'topic-1', comments: [], suggestions: [] };

/** A resolved, verified caller — the identity the composer must present and post. */
const MEMBER: MeInfo = {
  email: 'hua.mick@gmail.com',
  role: 'member',
  status: 'active',
  member: true,
};

// A stale localStorage value left over from the retired single-operator model — the composer
// must never surface or send this, even though it is present in storage (the fixture mirrors the
// production failure mode: a leftover `storytree.operator` key from before this capability).
const STALE_OPERATOR_NAME = 'stale-local-operator-name';

/** Flush the async chain a mount/state-update kicked off (microtasks drain). */
const flush = (): Promise<void> => act(async () => {});

/** The unresolved caller — signed in as nobody, which is a different fact from "not loaded". */
const NO_IDENTITY: MeInfo = { email: null, role: null, status: null, member: false };

function renderReview(mode: 'view' | 'review', me: MeInfo = NO_IDENTITY, body = BODY) {
  return render(
    <WithAppData me={me}>
      <ReviewModeContext.Provider value={mode}>
        <ReviewBlocks topicKind="asset" topicId="topic-1" body={body} />
      </ReviewModeContext.Provider>
    </WithAppData>,
  );
}

/** Opens the first block's comment thread (the review-mode margin affordance) and returns it. */
async function openFirstThread(): Promise<void> {
  const affordances = screen.getAllByRole('button', { name: 'Add a comment' });
  fireEvent.click(affordances[0]!);
  await flush();
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  http = installHttpDouble();
  http.get(FEED, () => emptyFeed);
  http.get(COMMENTS, () => []);
  http.post(COMMENTS, () => ({}));
  window.localStorage.clear();
  // Seed the stale leftover key so a regression back to localStorage-sourced attribution would
  // be caught (production may genuinely carry this leftover from before ADR-0204 D4).
  window.localStorage.setItem('storytree.operator', STALE_OPERATOR_NAME);
});

afterEach(() => {
  cleanup();
  http.uninstall();
  window.localStorage.clear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────

describe('verified attribution (ADR-0204 D4)', () => {
  it('att-composer-shows-verified-identity: the composer presents the resolved verified email, never the stale localStorage name', async () => {
    renderReview('review', MEMBER);
    await flush();
    await openFirstThread();

    expect(screen.getByText('hua.mick@gmail.com')).toBeTruthy();
    expect(screen.queryByText(STALE_OPERATOR_NAME)).toBeNull();
  });

  it('va-composer-shows-fallback-identity: with no resolved identity the composer shows the conventional "operator" fallback, never the stale localStorage name', async () => {
    renderReview('review', NO_IDENTITY);
    await flush();
    await openFirstThread();

    expect(screen.getByText('operator')).toBeTruthy();
    expect(screen.queryByText(STALE_OPERATOR_NAME)).toBeNull();
  });

  it('va-composer-identity-is-not-editable: the identity is displayed, never an editable field', async () => {
    const { container } = renderReview('review', MEMBER);
    await flush();
    await openFirstThread();

    expect(container.querySelector('[aria-label="operator identity"]')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('att-post-author-from-verified-identity: posting a comment sends the RESOLVED verified email as author, never the stale localStorage name', async () => {
    renderReview('review', MEMBER);
    await flush();
    await openFirstThread();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A verified comment' } });
    fireEvent.click(screen.getByRole('button', { name: /post/i }));
    await flush();

    // The author on the SERIALISED request body — what the server is actually told.
    expect(postedComments()).toHaveLength(1);
    expect(postedComments()[0]?.author).toBe('hua.mick@gmail.com');
    expect(postedComments()[0]?.author).not.toBe(STALE_OPERATOR_NAME);
  });

  it('va-post-uses-fallback-identity: posting with an unresolved identity sends the "operator" fallback, never the stale localStorage name', async () => {
    renderReview('review', NO_IDENTITY);
    await flush();
    await openFirstThread();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'An unresolved comment' } });
    fireEvent.click(screen.getByRole('button', { name: /post/i }));
    await flush();

    expect(postedComments()).toHaveLength(1);
    expect(postedComments()[0]?.author).toBe('operator');
    expect(postedComments()[0]?.author).not.toBe(STALE_OPERATOR_NAME);
  });

  it('att-operator-store-retired: the operator module is deleted and the composer never touches the storytree.operator key', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    renderReview('review', MEMBER);
    await flush();
    await openFirstThread();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Another comment' } });
    fireEvent.click(screen.getByRole('button', { name: /post/i }));
    await flush();

    expect(getItemSpy).not.toHaveBeenCalledWith('storytree.operator');
    expect(setItemSpy).not.toHaveBeenCalledWith('storytree.operator', expect.anything());

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});
