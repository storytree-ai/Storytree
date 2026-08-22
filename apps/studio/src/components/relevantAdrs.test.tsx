// @vitest-environment jsdom
//
// ADR-0097 Layer 2 / ADR-0037 §2: the StoryPanel's "Architectural Decision Records" section resolves a
// story's `decisions:` ADR numbers against the loaded LIBRARY CORPUS and links them to the `adr`
// artifacts. A <details> disclosure collapsed by default (owner steer 2026-06-24). The corpus is
// supplied through the REAL AppDataContext (anti-slop-adoption-arc inc-06, `no-module-mocking`) — the
// seam the app itself uses — so the value is a complete, type-checked `AppData` rather than a partial
// object a mocked hook returned.
//
// ★ THE FIXTURE IS WHY THIS REGRESSION WAS SILENT, so read it as part of the unit under test.
// It used to hand-build `DocMeta`s with `group: 'Decisions'` and ids like
// `decisions/0017-the-library-tier.md` — a shape the production walker STOPPED EMITTING when
// PR #1546 deleted `docs/decisions/` (ADR-0403 dec 1), and one `DocMeta` can no longer even express.
// The suite went on passing over a lookup that was permanently empty against every real payload,
// while every story panel in the running studio rendered every one of its decisions as "(no doc
// found)". The fixtures below are `adr` ARTIFACTS in the shape `/api/assets` actually serves —
// `id: 'adr-NNNN'`, `category: 'adr'`, the ADR-0037 lifecycle on `status` — verified against the live
// store, where 409 decision rows render exactly this way.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { GuidanceAsset } from '../types';

/** One `adr` artifact in the shape `renderStoredDoc` → `toGuidanceAsset` puts on the wire. */
function decision(number: number, title: string, status: string): GuidanceAsset {
  return {
    id: `adr-${String(number).padStart(4, '0')}`,
    category: 'adr',
    title,
    description: `ADR-${String(number).padStart(4, '0')} — ${title}`,
    body: `# ADR-${String(number).padStart(4, '0')}: ${title}`,
    references: [],
    fields: { body: `# ADR-${String(number).padStart(4, '0')}: ${title}` },
    status,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

const ASSETS: GuidanceAsset[] = [
  decision(17, 'The library tier', 'accepted'),
  decision(97, 'Brownfield go-green', 'accepted'),
  // A non-decision artifact whose id could be mistaken for one by a sloppier parser.
  {
    id: 'adr-health-gate',
    category: 'guardrail',
    title: 'ADR health gate',
    description: 'not a decision',
    body: '',
    references: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

import { RelevantAdrs, adrNumberOf } from './TreeView';
import { WithAppData } from '../test/appData';

/**
 * Render the section under the real context. `assetsStatus` is driven per-test, because
 * "(no decision found)" is only TRUE once the corpus has resolved.
 */
function renderAdrs(
  decisions: number[],
  index: { assetsStatus?: 'loading' | 'ready' | 'error'; assetsError?: string } = {},
) {
  return render(
    <WithAppData
      assets={ASSETS}
      assetsStatus={index.assetsStatus ?? 'ready'}
      assetsError={index.assetsError ?? ''}
    >
      <RelevantAdrs decisions={decisions} />
    </WithAppData>,
  );
}

afterEach(() => {
  cleanup();
});

describe('adrNumberOf', () => {
  it('extracts the 4-digit number from an adr artifact id', () => {
    expect(adrNumberOf('adr-0017')).toBe(17);
    expect(adrNumberOf('adr-0097')).toBe(97);
  });

  it('returns null for an id that is not a decision', () => {
    // The deleted-producer shape must NOT parse: `decisions/0017-…md` is the doc id the file
    // walker minted before ADR-0403 dec 1, and accepting it here would let a fixture re-supply
    // the very shape this repoint removed.
    expect(adrNumberOf('decisions/0017-the-library-tier.md')).toBeNull();
    expect(adrNumberOf('open-questions.md')).toBeNull();
    expect(adrNumberOf('adr-health-gate')).toBeNull();
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

  it('links each deciding decision to its adr artifact with the title + status chip', () => {
    renderAdrs([17, 97]);
    expect(screen.getByText('Architectural Decision Records (2)')).toBeTruthy();

    // ADR-0017 resolves to its artifact, linked via assetHref, with the title and an accepted chip.
    const link = screen.getByText('The library tier').closest('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('#/asset/adr-0017');
    expect(screen.getByText('ADR-0017')).toBeTruthy();
    expect(screen.getByText('Brownfield go-green')).toBeTruthy();
    // the accepted status chips render
    expect(screen.getAllByText('accepted').length).toBe(2);
  });

  it('renders the status chip from the artifact’s own lifecycle, per decision', () => {
    render(
      <WithAppData
        assets={[decision(1, 'A proposal', 'proposed'), decision(2, 'An old call', 'superseded')]}
        assetsStatus="ready"
      >
        <RelevantAdrs decisions={[1, 2]} />
      </WithAppData>,
    );
    expect(screen.getByText('proposed')).toBeTruthy();
    expect(screen.getByText('superseded')).toBeTruthy();
  });

  it('drops a status the ADR-0037 vocabulary does not contain, rather than rendering it as a chip', () => {
    // `GuidanceAsset.status` is a bare `string` shared with every other kind's own vocabulary — an
    // arc's `parked` or an increment's `ready` must never surface as a decision's lifecycle.
    const { container } = render(
      <WithAppData assets={[decision(5, 'Odd status', 'parked')]} assetsStatus="ready">
        <RelevantAdrs decisions={[5]} />
      </WithAppData>,
    );
    expect(screen.getByText('Odd status')).toBeTruthy();
    expect(container.querySelector('.adr-status-chip')).toBeNull();
  });

  it('falls back to a plain label for a decision with no matching artifact (tolerant, never blank)', () => {
    renderAdrs([999]);
    expect(screen.getByText('ADR-0999')).toBeTruthy();
    expect(screen.getByText(/no decision found/)).toBeTruthy();
  });

  // "(no decision found)" asserts the decision does not exist. That is only true once the corpus has
  // RESOLVED — said over an index that never loaded, a real decision reads as a missing one, which is
  // the dishonesty a failed /api/assets would otherwise reach silently.
  it('says the index is still loading — not "no decision found" — while /api/assets is in flight', () => {
    renderAdrs([999], { assetsStatus: 'loading' });

    expect(screen.getByText('ADR-0999')).toBeTruthy();
    expect(screen.queryByText(/no decision found/)).toBeNull();
    expect(screen.getByText(/the library index is still loading/)).toBeTruthy();
  });

  it('says the index failed — not "no decision found" — when /api/assets rejected, carrying the reason', () => {
    const { container } = renderAdrs([999], { assetsStatus: 'error', assetsError: 'HTTP 500' });

    expect(screen.getByText('ADR-0999')).toBeTruthy();
    expect(screen.queryByText(/no decision found/)).toBeNull();
    expect(screen.getByText(/the library index failed to load/)).toBeTruthy();
    expect(container.querySelector('.doc-unresolved')?.getAttribute('title')).toBe('HTTP 500');
  });

  it('still LINKS a resolvable decision while the index is unresolved — the note is only for the gap', () => {
    // A cache-seeded index (map-payload-cache) resolves ids before /api/assets answers; only the
    // ids it CANNOT resolve are in question, so a hit must still render as a working link.
    renderAdrs([17, 999], { assetsStatus: 'loading' });

    expect(screen.getByText('The library tier').closest('a')).toBeTruthy();
    expect(screen.getByText(/the library index is still loading/)).toBeTruthy();
  });

  // THE REGRESSION FENCE. This is the assertion whose absence let PR #1546 land green: the section
  // resolved against `docs`, so a corpus carrying the decisions and a docs index carrying none was
  // indistinguishable from a corpus carrying nothing. Pin the direction explicitly.
  it('resolves from the LIBRARY corpus, never from the docs index', () => {
    render(
      <WithAppData
        assets={[]}
        assetsStatus="ready"
        docs={[
          // The deleted producer's shape, as close as `DocMeta` can still express it. Even handed
          // in deliberately, it must not resolve ADR-0017.
          { id: 'decisions/0017-the-library-tier.md', title: 'The library tier', group: 'Reference', excerpt: '' },
        ]}
        docsStatus="ready"
      >
        <RelevantAdrs decisions={[17]} />
      </WithAppData>,
    );
    expect(screen.queryByText('The library tier')).toBeNull();
    expect(screen.getByText(/no decision found/)).toBeTruthy();
  });
});
