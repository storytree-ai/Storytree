// @vitest-environment jsdom
//
// Behaviour + routing test for the Library DIVE BODY (ADR-0185 dec 3/4, increment 4 of the
// library-tech-tree-overlay story). This capability's honest proof spans two things, both pinned
// in this ONE file (ADR-0122 — `storytree coverage` scans only `real.testFile`):
//
//   • the PURE routing heart `planDive(selection)` (`../lib/diveBody`) — maps a
//     `SearchResult | null` to a render plan, routing on the `source` discriminant
//     ('asset' | 'doc'), NEVER on `category` (an ADR result carries `category: 'adr'` but
//     `source: 'doc'` — trap: routing on category would send it down the wrong path);
//   • the `<LibraryDiveBody>` component (`./LibraryDiveBody`) — takes `selection` as a PROP (no
//     backend seam of its own), REUSES the existing `AssetView`/`DocView` renderers (never a new
//     markdown/Sources renderer), fetches an ADR's body ONLY through DocView's own
//     `api.docContent`, and surfaces DocView's error state rather than crashing when that fetch
//     rejects.
//
// NOT pinned here (the story's operator-attested UAT leg 4, ADR-0070): the forest-cozy palette,
// the reading-pane legibility, and the empty/prompt-state styling. No visual/colour assertion
// lives in this file.
//
// `api.docContent` is stubbed (the one on-demand fetch this increment allows, ADR-0185 dec 3/4);
// `mermaid` is stubbed exactly as `Markdown.test.tsx` does, since the real body/doc content
// rendered here carries no ```mermaid fence and the routing/fetch behaviour is what this file
// pins, not diagram rendering. No real fetch/socket/DB/Electron beyond the stubbed docContent.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { planDive } from '../lib/diveBody';
import { LibraryDiveBody } from './LibraryDiveBody';
import { AppDataContext, type AppData } from '../lib/appData';
import type { SearchResult } from '../lib/librarySearch';
import type { GuidanceAsset, DocMeta } from '../types';

const docContentMock = vi.hoisted(() => vi.fn());
vi.mock('../api', () => ({
  api: {
    docContent: docContentMock,
    deleteAsset: vi.fn(),
    updateAsset: vi.fn(),
  },
}));

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (_id: string, chart: string) => ({ svg: `<svg>${chart}</svg>` })),
}));
vi.mock('mermaid', () => ({ default: mermaidMock }));

const NOW = '2026-01-01T00:00:00.000Z';

function asset(
  overrides: Partial<GuidanceAsset> & Pick<GuidanceAsset, 'id' | 'category' | 'title'>,
): GuidanceAsset {
  return {
    description: 'unrelated description text',
    body: 'unrelated body text',
    references: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function doc(overrides: Partial<DocMeta> & Pick<DocMeta, 'id' | 'title'>): DocMeta {
  return {
    group: 'Decisions',
    excerpt: 'unrelated excerpt text',
    ...overrides,
  };
}

function appData(overrides: Partial<AppData> = {}): AppData {
  return {
    docs: [],
    docIds: new Set(),
    docTitles: new Map(),
    assets: [],
    comments: [],
    me: { email: null, role: null, status: null, member: false },
    refreshComments: vi.fn(),
    refreshAssets: vi.fn(),
    ...overrides,
  };
}

function renderWithAppData(ui: React.ReactElement, data: AppData) {
  return render(<AppDataContext.Provider value={data}>{ui}</AppDataContext.Provider>);
}

afterEach(() => {
  cleanup();
  docContentMock.mockReset();
});

// ---------- the pure routing heart ----------

describe('planDive', () => {
  it('ldb-plandive-empty-on-null: a null selection plans the empty state', () => {
    expect(planDive(null)).toEqual({ kind: 'empty' });
  });

  it('ldb-plandive-routes-on-source-not-category: routes on `source`, never `category` — an ADR result (category "adr", source "doc") plans a doc dive, not an asset dive', () => {
    const assetSelection: SearchResult = {
      id: 'oq-asset-target',
      title: 'An Asset',
      category: 'principle',
      source: 'asset',
    };
    expect(planDive(assetSelection)).toEqual({ kind: 'asset', id: 'oq-asset-target' });

    const adrSelection: SearchResult = {
      id: 'decisions/0001-plan-dive-routing.md',
      title: 'Plan Dive Routing Decision',
      category: 'adr',
      source: 'doc',
    };
    expect(planDive(adrSelection)).toEqual({
      kind: 'doc',
      id: 'decisions/0001-plan-dive-routing.md',
    });
  });
});

// ---------- the component ----------

describe('LibraryDiveBody — empty/prompt state', () => {
  it('ldb-empty-state-no-selection: with no selection renders a bare pick-an-artifact prompt, mounting neither AssetView nor DocView, calling no fetch', () => {
    renderWithAppData(<LibraryDiveBody selection={null} />, appData());

    const panel = screen.getByTestId('library-dive-body');
    expect(panel).toBeTruthy();
    expect(screen.getByText(/pick an artifact/i)).toBeTruthy();

    // Neither renderer mounted: no AssetView "Sources" heading, no DocView doc-crumb article.
    expect(screen.queryByText('Sources')).toBeNull();
    expect(panel.querySelector('.asset-detail')).toBeNull();
    expect(panel.querySelector('.doc-layout')).toBeNull();
    expect(docContentMock).not.toHaveBeenCalled();
  });
});

describe('LibraryDiveBody — asset selection reuses AssetView', () => {
  it('ldb-asset-selection-renders-assetview-body-and-sources: an asset selection mounts AssetView, rendering its full body + Sources from the loaded corpus, with no docContent fetch', () => {
    const target = asset({
      id: 'dive-sources-target',
      title: 'Dive Sources Target',
      category: 'principle',
    });
    const referencer = asset({
      id: 'dive-referencing-asset',
      title: 'Dive Referencing Asset',
      category: 'pattern',
      body: 'the referencing asset body prose, rendered in full by AssetView',
      references: ['asset:dive-sources-target'],
    });
    const data = appData({ assets: [referencer, target] });
    const selection: SearchResult = {
      id: referencer.id,
      title: referencer.title,
      category: referencer.category,
      source: 'asset',
    };

    renderWithAppData(<LibraryDiveBody selection={selection} />, data);

    // The full body renders (AssetView's own body renderer) …
    expect(screen.getByText(referencer.title)).toBeTruthy();
    expect(screen.getByText(/the referencing asset body prose/)).toBeTruthy();
    // … and Sources, resolved against the already-loaded corpus.
    expect(screen.getByText('Sources')).toBeTruthy();
    expect(screen.getByText(target.title)).toBeTruthy();

    // The asset dive path is fetch-free (AssetView reads only the loaded corpus).
    expect(docContentMock).not.toHaveBeenCalled();
  });
});

describe('LibraryDiveBody — doc selection reuses DocView and fetches on demand', () => {
  it('ldb-doc-selection-fetches-and-renders-markdown: a doc (ADR) selection mounts DocView, which calls the stubbed docContent with the id and renders its returned markdown', async () => {
    docContentMock.mockResolvedValue({
      id: 'decisions/0002-dive-doc-decision.md',
      title: 'Dive Doc Decision',
      markdown: '# Dive Doc Heading\n\nDive doc body prose.',
    });
    const adrDoc = doc({
      id: 'decisions/0002-dive-doc-decision.md',
      title: 'Dive Doc Decision',
    });
    const selection: SearchResult = {
      id: adrDoc.id,
      title: adrDoc.title,
      category: 'adr',
      source: 'doc',
    };

    renderWithAppData(<LibraryDiveBody selection={selection} />, appData({ docs: [adrDoc] }));

    await waitFor(() => expect(docContentMock).toHaveBeenCalledWith(adrDoc.id));
    await waitFor(() => expect(screen.getByText('Dive Doc Heading')).toBeTruthy());
    expect(screen.getByText('Dive doc body prose.')).toBeTruthy();
  });
});

describe('LibraryDiveBody — doc fetch-error guard', () => {
  it('ldb-doc-fetch-error-surfaces-error-not-crash: when docContent rejects, DocView\'s error state renders and the panel does not throw', async () => {
    docContentMock.mockRejectedValue(new Error('dive fetch boom'));
    const adrDoc = doc({
      id: 'decisions/0003-dive-doc-error.md',
      title: 'Dive Doc Error Decision',
    });
    const selection: SearchResult = {
      id: adrDoc.id,
      title: adrDoc.title,
      category: 'adr',
      source: 'doc',
    };

    expect(() =>
      renderWithAppData(<LibraryDiveBody selection={selection} />, appData({ docs: [adrDoc] })),
    ).not.toThrow();

    await waitFor(() =>
      expect(screen.getByText(/couldn.t load this document/i)).toBeTruthy(),
    );
    expect(screen.getByText('dive fetch boom')).toBeTruthy();
  });
});
