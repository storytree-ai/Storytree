// @vitest-environment jsdom
//
// A failed doc INDEX (`/api/docs`) must be operator-visible, and must NOT blank the map.
//
// map-boot-independence (ADR-0240 decision 2 stage 4) removed the shared `status` state that used
// to gate the whole content area — correctly: blanking the app, map included, because a
// Library-corpus payload failed is precisely the coupling that stage exists to remove. But the docs
// half lost its error surface with it, leaving `console.error('failed to load /api/docs')` as the
// only report, and every consumer degrading to a fallback that reads as the truth: an ADR rendered
// "(no doc found)", a reference rendered "(unknown doc)", an in-corpus link rendered inert. That is
// decision 3's failure mode — a plausible-looking degradation presented as the answer — reached
// through a failed fetch instead of a stale cache, and it is what `docsStatus`/`docsError` close.
//
// Both halves are proven here together on purpose: the honesty is only worth anything if it did NOT
// come at the cost of re-coupling the map, and the re-coupling is the regression this file guards
// (stage 4's contract `map-boot-independence-starts-the-map-fetch-once-membership-resolves`).
//
// An INTEGRATION test over the REAL App + REAL TreeView + REAL AssetView, driven through the real
// Studio API seam — the same discipline as App.boot-independence.test.tsx, whose stubs and helpers
// this file follows deliberately rather than inventing a second house style. `Hud` is stubbed as an
// AppData probe for the same reason it is there: the REQUIRED-ness of the new fields is a claim
// about the context object, not about a rendered pixel.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';

const apiMock = vi.hoisted(() => ({
  me: vi.fn(),
  listDocs: vi.fn(),
  listAssets: vi.fn(),
  listComments: vi.fn(),
  tree: vi.fn(),
  health: vi.fn(),
  activity: vi.fn(),
  dbStatus: vi.fn(),
  dbStart: vi.fn(),
  dbWake: vi.fn(),
  deleteAsset: vi.fn(),
}));

vi.mock('./api', () => ({ api: apiMock }));
vi.mock('./lib/devStoreOverride', () => ({ useDevStoreOverride: () => null }));
vi.mock('./lib/desktopAuth', () => ({ getDesktopAuth: () => undefined }));
// Non-participating global chrome only — never TreeView or AssetView (both under test here).
vi.mock('./components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./components/DocView', () => ({ DocView: () => null }));
vi.mock('./components/MembersPanel', () => ({ MembersPanel: () => null }));
vi.mock('./components/Hud', async () => {
  const { useAppData } = await import('./lib/appData');
  return {
    Hud: (): React.JSX.Element => {
      const data = useAppData();
      return (
        <div
          data-testid="appdata-probe"
          data-keys={Object.keys(data).sort().join(',')}
          data-docs-status={data.docsStatus}
          data-docs-error={data.docsError}
        />
      );
    },
  };
});

import { App } from './App';
import type {
  ActivityPayload,
  DocMeta,
  GuidanceAsset,
  MeInfo,
  StoreHealth,
  TreePayload,
  TreeStory,
} from './types';

const MEMBER: MeInfo = {
  email: 'operator@example.com',
  role: 'admin',
  status: 'active',
  member: true,
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeStory(id: string): TreeStory {
  return {
    id,
    title: id,
    outcome: `${id} outcome`,
    status: 'healthy',
    proofMode: 'integration-test',
    uatWitness: 'machine',
    dependsOn: [],
    consumedBy: [],
    capabilities: [],
  };
}

function makeTreePayload(storyIds: string[]): TreePayload {
  return { stories: storyIds.map(makeStory), builds: [], claims: [] };
}

function makeDocs(ids: string[]): DocMeta[] {
  return ids.map((id) => ({ id, title: id, group: 'Reference', excerpt: `${id} excerpt` }));
}

/** An artifact whose Sources block cites a doc — the `RefLink` surface under test. */
function assetCiting(id: string, refs: string[]): GuidanceAsset {
  return {
    id,
    category: 'pattern',
    title: `${id} title`,
    description: `${id} description`,
    body: `${id} body`,
    references: refs,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function baseHealth(): StoreHealth {
  return {
    store: 'pg',
    db: 'ok',
    code: { startedAt: '2026-01-01T00:00:00.000Z', head: 'HEAD-A', stale: false },
  };
}

function armFastDefaults(): void {
  apiMock.me.mockResolvedValue(MEMBER);
  apiMock.listDocs.mockResolvedValue([]);
  apiMock.listAssets.mockResolvedValue([]);
  apiMock.listComments.mockResolvedValue([]);
  apiMock.tree.mockResolvedValue(makeTreePayload([]));
  apiMock.health.mockResolvedValue(baseHealth());
  apiMock.activity.mockResolvedValue({
    builds: [],
    claims: [],
    departures: [],
  } satisfies ActivityPayload);
  apiMock.dbStatus.mockResolvedValue({ state: 'RUNNABLE', activationPolicy: 'ALWAYS' });
  apiMock.dbStart.mockResolvedValue({ ok: true });
  apiMock.dbWake.mockResolvedValue({ ok: true });
}

function uniqueTerritoryIds(): string[] {
  const ids = new Set(
    Array.from(document.querySelectorAll('.hex-territory[data-story-id]')).map(
      (el) => el.getAttribute('data-story-id') ?? '',
    ),
  );
  return Array.from(ids).sort();
}

function probe(): HTMLElement {
  return screen.getByTestId('appdata-probe');
}

function navigate(hash: string): void {
  act(() => {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  navigate('#/tree');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('a failed doc index is reported, and never blanks the map', () => {
  it('keeps the map mounted and painting through a rejected /api/docs, and records the failure on the context', async () => {
    armFastDefaults();
    apiMock.tree.mockResolvedValue(makeTreePayload(['alpha']));
    apiMock.listDocs.mockRejectedValue(new Error('docs unavailable'));

    render(<App />);

    // The fence (stage 4's contract): the map reads nothing from this payload and must paint anyway.
    await waitFor(
      () => {
        expect(uniqueTerritoryIds()).toEqual(['alpha']);
      },
      { timeout: 5000 },
    );
    expect(screen.getByTestId('tree-route')).toBeTruthy();
    // …and the old blanket corpus error box stays gone — no shared readiness gate came back.
    expect(screen.queryByText(/Couldn.t reach the studio data API/i)).toBeNull();

    // The failure is no longer console-only: it is on the context, with its reason.
    await waitFor(() => {
      expect(probe().getAttribute('data-docs-status')).toBe('error');
    });
    expect(probe().getAttribute('data-docs-error')).toBe('docs unavailable');
  });

  it('carries docsStatus/docsError as REQUIRED context fields, alongside the assets pair', async () => {
    armFastDefaults();

    render(<App />);

    await waitFor(() => {
      expect(probe().getAttribute('data-docs-status')).toBe('ready');
    });
    // Required, not optional: an absent status reads as `undefined`, falls through every
    // `=== 'loading'` / `=== 'error'` check, and lands in the "genuinely absent" branch — silently
    // reintroducing the defect for any AppData built without it (ADR-0240, the stage-4 correction).
    const keys = (probe().getAttribute('data-keys') ?? '').split(',');
    expect(keys).toContain('docsStatus');
    expect(keys).toContain('docsError');
    expect(keys).toContain('assetsStatus');
    expect(probe().getAttribute('data-docs-error')).toBe('');
  });
});

describe('a doc reference is only called unknown once the index can answer', () => {
  it('reports the index failure instead of calling a cited doc unknown', async () => {
    navigate('#/asset/pattern-x');
    armFastDefaults();
    apiMock.listAssets.mockResolvedValue([assetCiting('pattern-x', ['doc:decisions/0240-map.md'])]);
    apiMock.listDocs.mockRejectedValue(new Error('docs unavailable'));

    render(<App />);

    const route = await screen.findByTestId('library-route', {}, { timeout: 5000 });
    await waitFor(() => {
      expect(within(route).getByText(/the document index failed to load/i)).toBeTruthy();
    });
    // The lie this replaces: "(unknown doc)" asserts the corpus does not hold it.
    expect(within(route).queryByText(/unknown doc/i)).toBeNull();
  });

  it('reports the index as still loading while /api/docs is in flight', async () => {
    navigate('#/asset/pattern-x');
    const docsDeferred = deferred<DocMeta[]>();
    armFastDefaults();
    apiMock.listAssets.mockResolvedValue([assetCiting('pattern-x', ['doc:decisions/0240-map.md'])]);
    apiMock.listDocs.mockImplementation(() => docsDeferred.promise);

    render(<App />);

    const route = await screen.findByTestId('library-route', {}, { timeout: 5000 });
    await waitFor(() => {
      expect(within(route).getByText(/the document index is still loading/i)).toBeTruthy();
    });
    expect(within(route).queryByText(/unknown doc/i)).toBeNull();

    // Resolving with an index that genuinely lacks it restores the honest "unknown" answer — the
    // point is the DISTINCTION, not suppressing the absent case.
    await act(async () => {
      docsDeferred.resolve(makeDocs(['decisions/0139-other.md']));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(within(route).getByText(/unknown doc/i)).toBeTruthy();
    });
    expect(within(route).queryByText(/the document index/i)).toBeNull();
  });

  it('links a cited doc normally once the index resolves and holds it', async () => {
    navigate('#/asset/pattern-x');
    armFastDefaults();
    apiMock.listAssets.mockResolvedValue([assetCiting('pattern-x', ['doc:decisions/0240-map.md'])]);
    apiMock.listDocs.mockResolvedValue(makeDocs(['decisions/0240-map.md']));

    render(<App />);

    const route = await screen.findByTestId('library-route', {}, { timeout: 5000 });
    await waitFor(() => {
      expect(within(route).getByText('decisions/0240-map.md').closest('a')).toBeTruthy();
    });
    expect(within(route).queryByText(/unknown doc/i)).toBeNull();
    expect(within(route).queryByText(/the document index/i)).toBeNull();
  });
});
