// @vitest-environment jsdom
//
// ADR-0097 Layer 2 / ADR-0037 §2: the StoryPanel's "Architectural Decision Records" section resolves a
// story's `decisions:` ADR numbers against the loaded docs and LINKS them to the Decisions-group Library
// docs. A <details> disclosure collapsed by default (owner steer 2026-06-24). The docs index is supplied
// through the REAL AppDataContext (anti-slop-adoption-arc inc-06, `no-module-mocking`) — the seam the
// app itself uses — so the value is a complete, type-checked `AppData` rather than a partial object a
// mocked hook returned.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { DocMeta } from '../types';

const DOCS = [
    { id: 'decisions/0017-the-library-tier.md', title: 'The library tier', group: 'Decisions', excerpt: '', status: 'accepted' },
    { id: 'decisions/0097-brownfield.md', title: 'Brownfield go-green', group: 'Decisions', excerpt: '', status: 'accepted' },
  { id: 'open-questions.md', title: 'Open questions', group: 'Reference', excerpt: '' },
] as DocMeta[];

import { RelevantAdrs, adrNumberOf } from './TreeView';
import { WithAppData } from '../test/appData';

/**
 * Render the section under the real context. `docsStatus` is driven per-test, because
 * "(no doc found)" is only TRUE once the index has resolved.
 */
function renderAdrs(
  decisions: number[],
  index: { docsStatus?: 'loading' | 'ready' | 'error'; docsError?: string } = {},
) {
  return render(
    <WithAppData docs={DOCS} docsStatus={index.docsStatus ?? 'ready'} docsError={index.docsError ?? ''}>
      <RelevantAdrs decisions={decisions} />
    </WithAppData>,
  );
}

afterEach(() => {
  cleanup();
});

describe('adrNumberOf', () => {
  it('extracts the 4-digit number from a Decisions doc id', () => {
    expect(adrNumberOf('decisions/0017-the-library-tier.md')).toBe(17);
    expect(adrNumberOf('decisions/0097-brownfield.md')).toBe(97);
    expect(adrNumberOf('open-questions.md')).toBeNull();
  });
});

describe('RelevantAdrs', () => {
  it('renders nothing when the story declares no decisions', () => {
    const { container } = renderAdrs([]);
    expect(container.firstChild).toBeNull();
  });

  it('is a collapsed-by-default <details> disclosure (owner steer 2026-06-24)', () => {
    const { container } = renderAdrs([17, 97]);
    const details = container.querySelector('details');
    expect(details).toBeTruthy();
    // closed by default — no `open` attribute, but the rows stay in the DOM for the link tests below
    expect(details?.hasAttribute('open')).toBe(false);
    expect(screen.getByText('Architectural Decision Records (2)')).toBeTruthy();
  });

  it('links each deciding ADR to its Decisions-group doc with the title + status chip', () => {
    renderAdrs([17, 97]);
    expect(screen.getByText('Architectural Decision Records (2)')).toBeTruthy();

    // ADR-0017 resolves to its doc, linked via docHref, with the title and an accepted chip.
    const link = screen.getByText('The library tier').closest('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('#/doc/decisions%2F0017-the-library-tier.md');
    expect(screen.getByText('ADR-0017')).toBeTruthy();
    expect(screen.getByText('Brownfield go-green')).toBeTruthy();
    // the accepted status chips render
    expect(screen.getAllByText('accepted').length).toBe(2);
  });

  it('falls back to a plain label for a decision with no matching doc (tolerant, never blank)', () => {
    renderAdrs([999]);
    expect(screen.getByText('ADR-0999')).toBeTruthy();
    expect(screen.getByText(/no doc found/)).toBeTruthy();
  });

  // "(no doc found)" asserts the ADR does not exist. That is only true once the doc index has
  // RESOLVED — said over an index that never loaded, a real ADR reads as a missing one, which is
  // the dishonesty a failed /api/docs used to reach silently (only a console.error stood behind it).
  it('says the index is still loading — not "no doc found" — while /api/docs is in flight', () => {
    renderAdrs([999], { docsStatus: 'loading' });

    expect(screen.getByText('ADR-0999')).toBeTruthy();
    expect(screen.queryByText(/no doc found/)).toBeNull();
    expect(screen.getByText(/the document index is still loading/)).toBeTruthy();
  });

  it('says the index failed — not "no doc found" — when /api/docs rejected, carrying the reason', () => {
    const { container } = renderAdrs([999], { docsStatus: 'error', docsError: 'HTTP 500' });

    expect(screen.getByText('ADR-0999')).toBeTruthy();
    expect(screen.queryByText(/no doc found/)).toBeNull();
    expect(screen.getByText(/the document index failed to load/)).toBeTruthy();
    expect(container.querySelector('.doc-unresolved')?.getAttribute('title')).toBe('HTTP 500');
  });

  it('still LINKS a resolvable ADR while the index is unresolved — the note is only for the gap', () => {
    // A cache-seeded index (map-payload-cache) resolves ids before /api/docs answers; only the
    // ids it CANNOT resolve are in question, so a hit must still render as a working link.
    renderAdrs([17, 999], { docsStatus: 'loading' });

    expect(screen.getByText('The library tier').closest('a')).toBeTruthy();
    expect(screen.getByText(/the document index is still loading/)).toBeTruthy();
  });
});
