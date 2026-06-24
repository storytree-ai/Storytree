// @vitest-environment jsdom
//
// ADR-0097 Layer 2 / ADR-0037 §2: the StoryPanel's "Architectural Decision Records" section resolves a
// story's `decisions:` ADR numbers against the loaded docs and LINKS them to the Decisions-group Library
// docs. A <details> disclosure collapsed by default (owner steer 2026-06-24). useAppData is mocked to
// supply the docs index (the section is otherwise presentational).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { DocMeta } from '../types';

const data = vi.hoisted(() => ({
  docs: [
    { id: 'decisions/0017-the-library-tier.md', title: 'The library tier', group: 'Decisions', excerpt: '', status: 'accepted' },
    { id: 'decisions/0097-brownfield.md', title: 'Brownfield go-green', group: 'Decisions', excerpt: '', status: 'accepted' },
    { id: 'glossary.md', title: 'Glossary', group: 'Reference', excerpt: '' },
  ] as DocMeta[],
}));
vi.mock('../lib/appData', () => ({ useAppData: () => ({ docs: data.docs }) }));

import { RelevantAdrs, adrNumberOf } from './TreeView';

afterEach(cleanup);

describe('adrNumberOf', () => {
  it('extracts the 4-digit number from a Decisions doc id', () => {
    expect(adrNumberOf('decisions/0017-the-library-tier.md')).toBe(17);
    expect(adrNumberOf('decisions/0097-brownfield.md')).toBe(97);
    expect(adrNumberOf('glossary.md')).toBeNull();
  });
});

describe('RelevantAdrs', () => {
  it('renders nothing when the story declares no decisions', () => {
    const { container } = render(<RelevantAdrs decisions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('is a collapsed-by-default <details> disclosure (owner steer 2026-06-24)', () => {
    const { container } = render(<RelevantAdrs decisions={[17, 97]} />);
    const details = container.querySelector('details');
    expect(details).toBeTruthy();
    // closed by default — no `open` attribute, but the rows stay in the DOM for the link tests below
    expect(details?.hasAttribute('open')).toBe(false);
    expect(screen.getByText('Architectural Decision Records (2)')).toBeTruthy();
  });

  it('links each deciding ADR to its Decisions-group doc with the title + status chip', () => {
    render(<RelevantAdrs decisions={[17, 97]} />);
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
    render(<RelevantAdrs decisions={[999]} />);
    expect(screen.getByText('ADR-0999')).toBeTruthy();
    expect(screen.getByText(/no doc found/)).toBeTruthy();
  });
});
