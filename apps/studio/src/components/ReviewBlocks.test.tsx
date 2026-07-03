// @vitest-environment jsdom
//
// Behaviour test for ReviewBlocks (ADR-0140 caps 7/8 — the Google-Docs "suggesting mode" reshape).
// Pins GEOMETRY/BEHAVIOUR only — the surface's APPEARANCE is the story's operator-attested UAT leg,
// witnessed by the owner; NO visual/appearance assertion lives here. What is proved:
//
//   • rb-view-mode-is-pure-read: in View mode the prose renders with NO editor and NO controls
//     (nothing interactive — the read posture).
//
//   • rb-click-to-edit-inline: clicking a block in Review mode swaps its rendered prose for an
//     inline editor prefilled with the block's SOURCE markdown text.
//
//   • rb-blur-creates-suggestion: editing a block then blurring POSTs api.createSuggestion ONCE
//     with { blockId, proposedText:<edited>, topicKind, topicId, originalText:<block source> }.
//
//   • rb-no-op-blur-creates-nothing: blurring with the text UNCHANGED POSTs nothing (never an
//     empty/no-op suggestion).
//
//   • rb-open-suggestion-renders-view: an open suggestion from the feed renders a SuggestionView
//     under its block (the light inline card the owner liked).
//
// The api client + appData are mocked (no fetch, no DB, no socket); Markdown is stubbed to a plain
// passthrough so the test targets ReviewBlocks' own behaviour, not markdown rendering.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react';

// ── Api seam mock ─────────────────────────────────────────────────────────────────────────────
const apiMock = vi.hoisted(() => ({
  reviewFeed: vi.fn(),
  createSuggestion: vi.fn(),
  listComments: vi.fn(),
  createComment: vi.fn(),
}));
vi.mock('../api', () => ({ api: apiMock }));

// useAppData → an admin operator (SuggestionView reads me.role; the value is inert for these tests).
vi.mock('../lib/appData', () => ({
  useAppData: () => ({ me: { role: 'admin', email: 'a@b.c', status: 'active', member: true } }),
}));

// Markdown → a plain passthrough. ReviewBlocks' behaviour (click-to-edit, blur-to-suggest) is what
// is under test, not react-markdown; the real Markdown pulls in mermaid + appData internals the
// behaviour test has no need for.
vi.mock('./Markdown', () => ({
  Markdown: ({ children }: { children: string }) => <div className="md-stub">{children}</div>,
}));

import { ReviewBlocks } from './ReviewBlocks';
import { ReviewModeContext } from './ReviewToggle';

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

// Two blank-line-separated paragraphs → two blocks (splitBlocks is the real, deterministic split).
const BODY = 'First paragraph of the doc.\n\nSecond paragraph of the doc.';
const FIRST_BLOCK_TEXT = 'First paragraph of the doc.';
const SECOND_BLOCK_TEXT = 'Second paragraph of the doc.';

const emptyFeed = { topicId: 'topic-1', comments: [], suggestions: [] };

/** Flush the async chain a mount/state-update kicked off (microtasks drain). */
const flush = (): Promise<void> => act(async () => {});

function renderReview(mode: 'view' | 'review', body = BODY) {
  return render(
    <ReviewModeContext.Provider value={mode}>
      <ReviewBlocks topicKind="asset" topicId="topic-1" body={body} />
    </ReviewModeContext.Provider>,
  );
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  apiMock.reviewFeed.mockReset().mockResolvedValue(emptyFeed);
  apiMock.createSuggestion.mockReset().mockResolvedValue({
    id: 's-new',
    topicKind: 'asset',
    topicId: 'topic-1',
    block: 'b',
    proposed: 'x',
    original: 'y',
    status: 'open',
    author: 'operator',
    createdAt: '2024-01-01T00:00:00.000Z',
    decidedBy: null,
    decidedAt: null,
  });
  apiMock.listComments.mockReset().mockResolvedValue([]);
  apiMock.createComment.mockReset().mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────

describe('ReviewBlocks', () => {
  it('rb-view-mode-is-pure-read: renders prose with no editor and no controls in view mode', async () => {
    const { container } = renderReview('view');
    await flush();

    // Prose is present…
    expect(screen.getByText(FIRST_BLOCK_TEXT)).toBeTruthy();
    // …but nothing interactive: no textarea editor and no buttons at all.
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('rb-click-to-edit-inline: clicking a block in review mode swaps prose for an editor prefilled with the block source', async () => {
    renderReview('review');
    await flush();

    // Before clicking: no editor.
    expect(document.querySelector('textarea')).toBeNull();

    // Click the block's prose.
    fireEvent.click(screen.getByText(FIRST_BLOCK_TEXT));
    await flush();

    // An inline editor appears, prefilled with the block's SOURCE text.
    const editor = document.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(editor).toBeTruthy();
    expect(editor!.value).toBe(FIRST_BLOCK_TEXT);
  });

  it('rb-blur-creates-suggestion: editing a block then blurring posts createSuggestion once with the edited text', async () => {
    renderReview('review');
    await flush();

    fireEvent.click(screen.getByText(FIRST_BLOCK_TEXT));
    await flush();

    const editor = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'First paragraph, revised.' } });
    fireEvent.blur(editor);
    await flush();

    expect(apiMock.createSuggestion).toHaveBeenCalledTimes(1);
    expect(apiMock.createSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        blockId: expect.any(String),
        proposedText: 'First paragraph, revised.',
        topicKind: 'asset',
        topicId: 'topic-1',
        originalText: FIRST_BLOCK_TEXT,
      }),
    );
  });

  it('rb-no-op-blur-creates-nothing: blurring with the text unchanged posts nothing', async () => {
    renderReview('review');
    await flush();

    fireEvent.click(screen.getByText(FIRST_BLOCK_TEXT));
    await flush();

    const editor = document.querySelector('textarea') as HTMLTextAreaElement;
    // No change, straight blur.
    fireEvent.blur(editor);
    await flush();

    expect(apiMock.createSuggestion).not.toHaveBeenCalled();
  });

  it('rb-open-suggestion-renders-view: an open suggestion from the feed renders a SuggestionView under its block', async () => {
    // Build a feed whose suggestion targets the SECOND block by its real splitBlocks id.
    const { splitBlocks } = await import('../lib/blocks');
    const blocks = splitBlocks(BODY);
    const secondId = blocks[1]!.id;

    apiMock.reviewFeed.mockResolvedValue({
      topicId: 'topic-1',
      comments: [],
      suggestions: [
        {
          id: 's-1',
          topicKind: 'asset',
          topicId: 'topic-1',
          block: secondId,
          proposed: 'Second paragraph, improved.',
          original: SECOND_BLOCK_TEXT,
          status: 'open',
          author: 'reviewer',
          createdAt: '2024-01-01T00:00:00.000Z',
          decidedBy: null,
          decidedAt: null,
        },
      ],
    });

    const { container } = renderReview('review');
    await flush();

    // The proposed result renders inside a SuggestionView card.
    const view = container.querySelector('.suggestion-view');
    expect(view).toBeTruthy();
    expect(within(view as HTMLElement).getByText('Second paragraph, improved.')).toBeTruthy();
  });
});
