// @vitest-environment jsdom
//
// The "Sources" citation link (`<RefLink>`) across all THREE reference tokens.
//
// ADR-0107 D2 made `node:<id>` a first-class `references` token alongside `doc:<relpath>` and
// `asset:<id>`, and that ADR's own Consequences named this view as the one place that had not
// learned it: a `node:` ref rendered as inert grey text, so an artifact attached to a story's
// proving process could name that story but gave the reader no way to reach it. It now deep-links
// to that node on the forest map (`treeFocusHref`) — the Library's one edge OUT to the work tree.
//
// Pure render assertions (href + text). No look/colour/layout assertion lives here — the
// appearance of the Sources block is operator-attested (ADR-0070).

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RefLink } from './AssetView';
import { AppDataContext, type AppData } from '../lib/appData';
import type { GuidanceAsset } from '../types';

const NOW = '2026-01-01T00:00:00.000Z';

const asset: GuidanceAsset = {
  id: 'red-green',
  category: 'principle',
  title: 'Red-green',
  description: 'a test fails, then passes',
  body: 'unrelated body text',
  references: [],
  createdAt: NOW,
  updatedAt: NOW,
};

const appData: AppData = {
  docs: [],
  docIds: new Set(['decisions/0107-oq-gate.md']),
  docTitles: new Map([['decisions/0107-oq-gate.md', 'ADR-0107']]),
  assets: [asset],
  assetsStatus: 'ready',
  assetsError: '',
  me: { email: 'nobody@example.com', role: 'admin' } as AppData['me'],
  refreshAssets: async () => {},
};

function renderRef(refStr: string) {
  return render(
    <AppDataContext.Provider value={appData}>
      <RefLink refStr={refStr} />
    </AppDataContext.Provider>,
  );
}

afterEach(cleanup);

describe('RefLink', () => {
  it('reflink-node-deeplinks-to-the-map: a node:<id> ref links to that node on the tree, labelled by its id', () => {
    renderRef('node:cli');
    const link = screen.getByRole('link', { name: 'cli' });
    expect(link.getAttribute('href')).toBe('#/tree/cli');
  });

  it('reflink-node-is-encoded: a node id needing URI encoding is encoded into the hash segment', () => {
    renderRef('node:a b/c');
    expect(screen.getByRole('link').getAttribute('href')).toBe('#/tree/a%20b%2Fc');
  });

  it('reflink-asset-stays-in-the-library: an asset:<id> ref still links to the asset by title', () => {
    renderRef('asset:red-green');
    const link = screen.getByRole('link', { name: 'Red-green' });
    expect(link.getAttribute('href')).toBe('#/asset/red-green');
  });

  it('reflink-doc-still-links: a doc:<relpath> ref still links to the doc by title', () => {
    renderRef('doc:decisions/0107-oq-gate.md');
    const link = screen.getByRole('link', { name: 'ADR-0107' });
    expect(link.getAttribute('href')).toBe('#/doc/decisions%2F0107-oq-gate.md');
  });

  it('reflink-unknown-token-is-inert-text: a pointer in no known form renders as plain text, not a link', () => {
    renderRef('https://example.com/x');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('https://example.com/x')).toBeTruthy();
  });
});
