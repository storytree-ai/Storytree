// @vitest-environment jsdom
//
// Behaviour test for the Library OPEN OVERLAY (ADR-0187 dec 2, `library-open-overlay` capability
// of the library-tech-tree-overlay story). Its honest proof spans three things, all pinned in this
// ONE file (ADR-0122 — `storytree coverage` scans only `real.testFile`):
//
//   • MOUNT-OVER-MAP + REUSE — a non-null `selection` mounts a distinct `library-open-overlay`
//     container that nests the landed, byte-locked `<LibraryDiveBody selection={selection} />`
//     router VERBATIM inside it (never a re-authored body renderer);
//   • NULL-RENDERS-NOTHING — a null `selection` renders nothing: no overlay container, no
//     `LibraryDiveBody` — the overlay's closed state;
//   • DISMISS — a dismiss affordance (a close/back button, or Esc) invokes the `onDismiss`
//     callback prop; the overlay itself does not manage open/closed state (the glue clears the
//     selection on `onDismiss`, unmounting it), so this test only proves the callback fires.
//
// NOT pinned here (operator-attested UAT leg, ADR-0070/ADR-0185 dec 5): the forest-cozy palette,
// the "Word doc over the map" reading-pane appearance. No visual/colour/pixel assertion lives in
// this file.
//
// `LibraryDiveBody` is REUSED, not mocked or reimplemented — its own routing/fetch/error-guard
// behaviour is already proven in `LibraryDiveBody.test.tsx` (`ldb-*`); this file only proves the
// CONTAINER wraps it. `api.docContent` is stubbed exactly as `LibraryDiveBody.test.tsx` does, so a
// doc selection can be exercised without a real fetch. No real fetch/socket/DB/Electron beyond the
// stubbed docContent.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { LibraryOpenOverlay } from './LibraryOpenOverlay';
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
    assetsStatus: 'ready',
    assetsError: '',
    me: { email: null, role: null, status: null, member: false },
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

describe('LibraryOpenOverlay — null selection renders nothing', () => {
  it('loo-null-selection-renders-nothing: with selection null the overlay is closed — no container, no LibraryDiveBody', () => {
    const { container } = renderWithAppData(
      <LibraryOpenOverlay selection={null} onDismiss={vi.fn()} />,
      appData(),
    );

    expect(screen.queryByTestId('library-open-overlay')).toBeNull();
    expect(screen.queryByTestId('library-dive-body')).toBeNull();
    expect(container.textContent).toBe('');
  });
});

describe('LibraryOpenOverlay — mounts the full-detail body over the map', () => {
  it('loo-open-overlay-mounts-full-detail-over-map: a non-null selection mounts a distinct overlay container nesting the reused LibraryDiveBody router, rendering its full asset detail', () => {
    const target = asset({
      id: 'open-overlay-target',
      title: 'Open Overlay Target',
      category: 'principle',
      body: 'the open overlay target body prose, rendered in full by the reused AssetView',
    });
    const selection: SearchResult = {
      id: target.id,
      title: target.title,
      category: target.category,
      source: 'asset',
    };

    renderWithAppData(
      <LibraryOpenOverlay selection={selection} onDismiss={vi.fn()} />,
      appData({ assets: [target] }),
    );

    const overlay = screen.getByTestId('library-open-overlay');
    expect(overlay).toBeTruthy();

    // The reused `LibraryDiveBody` router is nested INSIDE the overlay container — never
    // reimplemented — and its full body renders through it (AssetView, unchanged).
    const diveBody = screen.getByTestId('library-dive-body');
    expect(overlay.contains(diveBody)).toBe(true);
    expect(screen.getByText(target.title)).toBeTruthy();
    expect(screen.getByText(/the open overlay target body prose/)).toBeTruthy();
    expect(docContentMock).not.toHaveBeenCalled();
  });

  it('loo-open-overlay-routes-doc-selection: a doc selection nested inside the overlay fetches and renders through the reused DocView, unchanged', async () => {
    docContentMock.mockResolvedValue({
      id: 'decisions/0004-open-overlay-doc.md',
      title: 'Open Overlay Doc Decision',
      markdown: '# Open Overlay Doc Heading\n\nOpen overlay doc body prose.',
    });
    const adrDoc = doc({
      id: 'decisions/0004-open-overlay-doc.md',
      title: 'Open Overlay Doc Decision',
    });
    const selection: SearchResult = {
      id: adrDoc.id,
      title: adrDoc.title,
      category: 'adr',
      source: 'doc',
    };

    renderWithAppData(
      <LibraryOpenOverlay selection={selection} onDismiss={vi.fn()} />,
      appData({ docs: [adrDoc] }),
    );

    const overlay = screen.getByTestId('library-open-overlay');
    const diveBody = screen.getByTestId('library-dive-body');
    expect(overlay.contains(diveBody)).toBe(true);

    await waitFor(() => expect(docContentMock).toHaveBeenCalledWith(adrDoc.id));
    await waitFor(() => expect(screen.getByText('Open Overlay Doc Heading')).toBeTruthy());
  });
});

describe('LibraryOpenOverlay — dismiss is transient, unlike the permanent lens', () => {
  it('loo-dismiss-fires-ondismiss: a dismiss affordance (close button or Esc) invokes onDismiss, the overlay itself never managing its own open/closed state', () => {
    const target = asset({
      id: 'open-overlay-dismiss-target',
      title: 'Open Overlay Dismiss Target',
      category: 'principle',
    });
    const selection: SearchResult = {
      id: target.id,
      title: target.title,
      category: target.category,
      source: 'asset',
    };
    const onDismiss = vi.fn();

    renderWithAppData(
      <LibraryOpenOverlay selection={selection} onDismiss={onDismiss} />,
      appData({ assets: [target] }),
    );

    const overlay = screen.getByTestId('library-open-overlay');
    const dismissButton = screen.queryByRole('button', { name: /close|dismiss|back/i });

    if (dismissButton) {
      fireEvent.click(dismissButton);
    } else {
      // Esc-to-dismiss is an acceptable equivalent affordance (story-author's call).
      fireEvent.keyDown(overlay, { key: 'Escape', code: 'Escape' });
    }

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
