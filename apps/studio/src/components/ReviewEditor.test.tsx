// @vitest-environment jsdom
//
// Stage-1 behaviour test for ReviewEditor (ADR-0146 — the split-pane markdown editor with a
// CriticMarkup toolbar that replaces ReviewBlocks). Pins GEOMETRY/BEHAVIOUR only; the surface's
// APPEARANCE is the story's OWNER-attested UAT leg (ADR-0070) — no visual assertion here. Proved:
//
//   • re-view-mode-is-read-only: View mode renders the prose with NO source textarea.
//   • re-edit-mode-splits-source-and-preview: Edit mode renders the source textarea + a preview.
//   • re-typing-updates-preview: editing the source updates the live preview.
//   • re-toolbar-wraps-selection: an Insert toolbar click wraps the current selection in {++…++}.
//   • re-preview-renders-tracked-change: a {++…++} in the source renders an insertion element
//     in the preview.
//
// The transport is doubled (no fetch, no DB) and appData arrives through the real context. The test
// targets ReviewEditor's own behaviour, not react-markdown.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

import { HttpDouble, installHttpDouble } from '../test/httpDouble';
import { WithAppData } from '../test/appData';

// THE SEAMS ARE REAL, NOT MOCKED MODULES (anti-slop-adoption-arc inc-06, `no-module-mocking`): the
// TRANSPORT is doubled, appData comes through the app's own `AppDataContext`, and `Markdown` is the
// REAL component — the stub's reason (mermaid + appData internals) was removed by this lane's
// diagram seam.
const FEED = '/api/review/feed';
const ASSETS = '/api/assets';

let http: HttpDouble;

/** How many times the editor actually polled the review feed. */
const feedReads = (): number => http.countTo(FEED);

import { ReviewEditor } from './ReviewEditor';
import { ReviewModeContext, SetReviewModeContext } from './ReviewToggle';
import { SLOW_POLL_MS } from '../lib/poll';

const BODY = 'First paragraph.\n\nSecond paragraph.';

const flush = (): Promise<void> => act(async () => {});

function renderEditor(
  mode: 'view' | 'review',
  body = BODY,
  setMode: (m: 'view' | 'review') => void = () => {},
) {
  return render(
    <WithAppData>
      <ReviewModeContext.Provider value={mode}>
      <SetReviewModeContext.Provider value={setMode}>
        <ReviewEditor
          asset={{
            id: 'oq-x',
            category: 'template',
            title: 'T',
            description: 'D',
            body,
            references: [],
          }}
        />
        </SetReviewModeContext.Provider>
      </ReviewModeContext.Provider>
    </WithAppData>,
  );
}

beforeEach(() => {
  http = installHttpDouble();
  http.patch(ASSETS, () => ({}));
  http.get(FEED, () => ({ topicId: 'oq-x', comments: [], suggestions: [] }));
});
afterEach(() => {
  cleanup();
  http.uninstall();
  vi.useRealTimers();
});

describe('ReviewEditor', () => {
  it('re-view-mode-is-read-only: View mode renders prose with no source textarea', () => {
    const { container } = renderEditor('view');
    expect(screen.queryByLabelText('Markdown source')).toBeNull();
    // The body still renders (through the stubbed Markdown) in the read-only view container.
    expect(container.querySelector('.review-view')?.textContent).toContain('First paragraph.');
  });

  it('re-edit-mode-splits-source-and-preview: Edit mode renders the source textarea and a preview', () => {
    renderEditor('review');
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    expect(source).toBeTruthy();
    expect(source.value).toBe(BODY);
    // The preview pane carries a "Preview" label.
    expect(screen.getByText('Preview')).toBeTruthy();
  });

  it('re-typing-updates-preview: editing the source updates the live preview', async () => {
    const { container } = renderEditor('review');
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    fireEvent.change(source, { target: { value: 'A whole new body.' } });
    // The debounced preview catches up.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    // Scope to the preview pane (the textarea also holds the text as its value).
    const preview = container.querySelector('.review-preview-body');
    expect(preview?.textContent).toContain('A whole new body.');
  });

  it('re-toolbar-wraps-selection: an Insert click wraps the selection in {++…++}', async () => {
    renderEditor('review', 'hello world');
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    // Select "hello".
    source.focus();
    source.setSelectionRange(0, 5);
    fireEvent.click(screen.getByTitle('Insert {++ … ++}'));
    await flush();
    expect(source.value).toBe('{++hello++} world');
  });

  it('re-preview-renders-tracked-change: a {++…++} source renders an insertion element', async () => {
    const { container } = renderEditor('review', 'a {++added++} b');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    const ins = container.querySelector('ins.cm-ins');
    expect(ins).toBeTruthy();
    expect(ins?.textContent).toBe('added');
  });

  it('re-preview-renders-deletion: a {--…--} source renders a deletion element', async () => {
    const { container } = renderEditor('review', 'a {--gone--} b');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    const del = container.querySelector('del.cm-del');
    expect(del).toBeTruthy();
    expect(del?.textContent).toBe('gone');
  });

  it('re-no-comment-surface: the open Review document neither reads the comment feed nor renders a peer comment (ADR-0425 dec 1)', async () => {
    vi.useFakeTimers();
    // The feed is ROUTED and answers a comment, so this proves a CHOICE not to read rather than a
    // route that would have thrown: `installHttpDouble` is fail-closed, and a served payload the
    // editor never asks for is the sharpest available evidence that the surface is gone.
    const peerComment = {
      id: 'comment-from-peer',
      topicKind: 'asset',
      topicId: 'oq-x',
      anchor: { kind: 'block', blockId: 'intro' },
      body: 'A peer comment posted out of band',
      author: 'peer@example.com',
      createdAt: '2026-08-21T00:00:00.000Z',
      resolved: false,
      resolvedAt: null,
    };
    http.get(FEED, () => ({ topicId: 'oq-x', comments: [peerComment], suggestions: [] }));

    renderEditor('review');
    await flush();

    // POSITIVE ANCHOR FIRST: the editor really mounted. Without it every absence below would also
    // "hold" on a surface that failed to render at all — the green-that-verified-nothing shape.
    expect(screen.getByLabelText('Markdown source')).toBeTruthy();

    // ADR-0425 dec 1 retires studio commenting: the editor used to poll this feed and render its
    // comments read-only, which showed a remark on a surface that could never produce one. Neither
    // happens now — on mount, or ever, since the interval went with the poll.
    expect(feedReads()).toBe(0);
    expect(screen.queryByText(peerComment.body)).toBeNull();
    expect(screen.queryByLabelText('Peer comments')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLOW_POLL_MS * 3);
    });

    expect(feedReads()).toBe(0);
    expect(screen.queryByText(peerComment.body)).toBeNull();
  });

  it('re-toolbar-preserves-caret: a toolbar insert restores focus + selection to the wrapped text (the same path that restores scroll)', async () => {
    renderEditor('review', 'hello world');
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    // Select "hello", then wrap it — the value is rewritten, which would otherwise drop the
    // caret and snap the scroll to the top.
    source.focus();
    source.setSelectionRange(0, 5);
    fireEvent.click(screen.getByTitle('Insert {++ … ++}'));
    await flush();
    expect(source.value).toBe('{++hello++} world');
    // Focus stayed in the textarea (the layout-effect restore ran)…
    expect(document.activeElement).toBe(source);
    // …and the selection is back on the wrapped inner text, not reset to the top (offset 0).
    expect(source.value.slice(source.selectionStart, source.selectionEnd)).toBe('hello');
    expect(source.selectionStart).toBe(3);
  });

  it('re-cancel-reverts-edits-and-exits: Cancel discards in-progress edits and returns to View', async () => {
    const setMode = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderEditor('review', BODY, setMode);
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    fireEvent.change(source, { target: { value: 'scratch edits that should be discarded' } });
    expect(source.value).toBe('scratch edits that should be discarded');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await flush();
    // The source reverts to the original body…
    expect((screen.getByLabelText('Markdown source') as HTMLTextAreaElement).value).toBe(BODY);
    // …and the editor asks to switch back to View.
    expect(setMode).toHaveBeenCalledWith('view');
    confirmSpy.mockRestore();
  });

  it('re-cancel-guards-unsaved-edits: declining the confirm keeps the edits and stays in Edit', async () => {
    const setMode = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderEditor('review', BODY, setMode);
    const source = screen.getByLabelText('Markdown source') as HTMLTextAreaElement;
    fireEvent.change(source, { target: { value: 'keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await flush();
    // The edits survive and the mode is not switched.
    expect((screen.getByLabelText('Markdown source') as HTMLTextAreaElement).value).toBe('keep me');
    expect(setMode).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
