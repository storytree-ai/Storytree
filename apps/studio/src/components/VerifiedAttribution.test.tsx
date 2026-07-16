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
//   • va-composer-shows-verified-identity: the composer displays the resolved `me.email` text
//     when the identity has resolved.
//   • va-composer-shows-fallback-identity: the composer displays the conventional `operator`
//     fallback text when `me.email` is null (the open dev posture).
//   • va-composer-identity-is-not-editable: the identity is never an editable field — no
//     `input[aria-label="operator identity"]`, no plain `<input>` at all in the thread.
//   • va-post-uses-verified-identity: posting a comment sends an author derived from the
//     RESOLVED `me.email`, never a stale localStorage-sourced name.
//   • va-post-uses-fallback-identity: posting a comment with an UNRESOLVED identity sends the
//     `operator` fallback, never a stale localStorage-sourced name.
//   • va-never-touches-operator-localstorage: the `storytree.operator` localStorage key is never
//     read or written by the composer mount.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// ── Api seam mock ─────────────────────────────────────────────────────────────────────────────
const apiMock = vi.hoisted(() => ({
  reviewFeed: vi.fn(),
  createSuggestion: vi.fn(),
  listComments: vi.fn(),
  createComment: vi.fn(),
}));
vi.mock('../api', () => ({ api: apiMock }));

// ── AppData seam mock — a controllable `me` (the verified identity), swapped per test ──────────
const appDataMock = vi.hoisted(() => ({
  me: { role: null as 'admin' | 'member' | null, email: null as string | null },
}));
vi.mock('../lib/appData', () => ({
  useAppData: () => appDataMock,
}));

// Markdown → a plain passthrough (consistent with ReviewBlocks.test.tsx — the behaviour under
// test is attribution, not markdown rendering).
vi.mock('./Markdown', () => ({
  Markdown: ({ children }: { children: string }) => <div className="md-stub">{children}</div>,
}));

import { ReviewBlocks } from './ReviewBlocks';
import { ReviewModeContext } from './ReviewToggle';

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

const BODY = 'First paragraph of the doc.\n\nSecond paragraph of the doc.';
const emptyFeed = { topicId: 'topic-1', comments: [], suggestions: [] };

// A stale localStorage value left over from the retired single-operator model — the composer
// must never surface or send this, even though it is present in storage (the fixture mirrors the
// production failure mode: a leftover `storytree.operator` key from before this capability).
const STALE_OPERATOR_NAME = 'stale-local-operator-name';

/** Flush the async chain a mount/state-update kicked off (microtasks drain). */
const flush = (): Promise<void> => act(async () => {});

function renderReview(mode: 'view' | 'review', body = BODY) {
  return render(
    <ReviewModeContext.Provider value={mode}>
      <ReviewBlocks topicKind="asset" topicId="topic-1" body={body} />
    </ReviewModeContext.Provider>,
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
  apiMock.reviewFeed.mockReset().mockResolvedValue(emptyFeed);
  apiMock.createSuggestion.mockReset();
  apiMock.listComments.mockReset().mockResolvedValue([]);
  apiMock.createComment.mockReset().mockResolvedValue({});
  appDataMock.me = { role: null, email: null };
  window.localStorage.clear();
  // Seed the stale leftover key so a regression back to localStorage-sourced attribution would
  // be caught (production may genuinely carry this leftover from before ADR-0204 D4).
  window.localStorage.setItem('storytree.operator', STALE_OPERATOR_NAME);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────

describe('verified attribution (ADR-0204 D4)', () => {
  it('va-composer-shows-verified-identity: the composer presents the resolved verified email, never the stale localStorage name', async () => {
    appDataMock.me = { role: 'member', email: 'hua.mick@gmail.com' };
    renderReview('review');
    await flush();
    await openFirstThread();

    expect(screen.getByText('hua.mick@gmail.com')).toBeTruthy();
    expect(screen.queryByText(STALE_OPERATOR_NAME)).toBeNull();
  });

  it('va-composer-shows-fallback-identity: with no resolved identity the composer shows the conventional "operator" fallback, never the stale localStorage name', async () => {
    appDataMock.me = { role: null, email: null };
    renderReview('review');
    await flush();
    await openFirstThread();

    expect(screen.getByText('operator')).toBeTruthy();
    expect(screen.queryByText(STALE_OPERATOR_NAME)).toBeNull();
  });

  it('va-composer-identity-is-not-editable: the identity is displayed, never an editable field', async () => {
    appDataMock.me = { role: 'member', email: 'hua.mick@gmail.com' };
    const { container } = renderReview('review');
    await flush();
    await openFirstThread();

    expect(container.querySelector('[aria-label="operator identity"]')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('va-post-uses-verified-identity: posting a comment sends the RESOLVED verified email as author, never the stale localStorage name', async () => {
    appDataMock.me = { role: 'member', email: 'hua.mick@gmail.com' };
    renderReview('review');
    await flush();
    await openFirstThread();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A verified comment' } });
    fireEvent.click(screen.getByRole('button', { name: /post/i }));
    await flush();

    expect(apiMock.createComment).toHaveBeenCalledTimes(1);
    const call = apiMock.createComment.mock.calls[0]![0] as { author: string };
    expect(call.author).toBe('hua.mick@gmail.com');
    expect(call.author).not.toBe(STALE_OPERATOR_NAME);
  });

  it('va-post-uses-fallback-identity: posting with an unresolved identity sends the "operator" fallback, never the stale localStorage name', async () => {
    appDataMock.me = { role: null, email: null };
    renderReview('review');
    await flush();
    await openFirstThread();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'An unresolved comment' } });
    fireEvent.click(screen.getByRole('button', { name: /post/i }));
    await flush();

    expect(apiMock.createComment).toHaveBeenCalledTimes(1);
    const call = apiMock.createComment.mock.calls[0]![0] as { author: string };
    expect(call.author).toBe('operator');
    expect(call.author).not.toBe(STALE_OPERATOR_NAME);
  });

  it('va-never-touches-operator-localstorage: the composer never reads or writes the storytree.operator key', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    appDataMock.me = { role: 'member', email: 'hua.mick@gmail.com' };
    renderReview('review');
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
