// @vitest-environment jsdom
//
// map-boot-independence (ADR-0240 decision 2 stage 4): the forest map's own /api/tree fetch begins
// as soon as membership resolves, instead of waiting on Library-corpus payloads (/api/assets) the
// map never reads. `/api/comments` is a DEAD boot fetch — established by probe (no reader anywhere
// in apps/studio/src) — and is removed outright, never deferred.
//
// This is an INTEGRATION test over the REAL App + REAL TreeView + REAL AssetView — only the
// non-participating global chrome (Sidebar/Hud/DocView/MembersPanel) is stubbed, exactly as stages
// 1-3 did (App.route-retention.test.tsx / App.payload-cache.test.tsx). Every Studio API call is
// driven explicitly via deferred<T>() so ordering is observed, not assumed.
//
// `data-testid="library-route"` does not exist on `main` yet — it is the observable this test
// authors for the window this unit opens (node spec: "the window is created by this unit, so
// closing it belongs to this unit"): a wrapper around the non-tree route content, parallel to the
// existing `data-testid="tree-route"` wrapper around the map, so a Library route's mount can be
// observed independently of whether /api/assets has resolved yet.

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
}));

vi.mock('./api', () => ({ api: apiMock }));
vi.mock('./lib/devStoreOverride', () => ({ useDevStoreOverride: () => null }));
vi.mock('./lib/desktopAuth', () => ({ getDesktopAuth: () => undefined }));
// Non-participating global chrome only — never TreeView, never AssetView (both under test here),
// never StoreBanner (owns the health poll), never lib/poll.
vi.mock('./components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./components/Hud', () => ({ Hud: () => null }));
vi.mock('./components/DocView', () => ({ DocView: () => null }));
vi.mock('./components/MembersPanel', () => ({ MembersPanel: () => null }));

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

function makeAsset(id: string): GuidanceAsset {
  return {
    id,
    category: 'pattern',
    title: `${id} title`,
    description: `${id} description`,
    body: `${id} body`,
    references: [],
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

/** Fast, non-deferred defaults for every Studio API call — a scenario below overrides whichever
 *  call(s) it deliberately holds pending/rejecting to observe ordering or failure handling. */
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

function expectTerritories(ids: string[]): void {
  expect(uniqueTerritoryIds()).toEqual([...ids].sort());
}

/** Navigate the hash router the same way App.route-retention.test.tsx does — a real
 *  `history.replaceState` + `hashchange`, not a raw `location.hash =` write, so it also works when
 *  called BEFORE the first render (the cold-direct-link scenarios below). */
function navigate(hash: string): void {
  act(() => {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(() => {
  navigate('#/tree');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('map-boot-independence', () => {
  it("map-boot-independence-tree-fetch-starts-once-membership-resolves-without-waiting-on-assets: the map's own /api/tree fetch begins the instant membership resolves — never before, and never gated on the Library corpus (/api/assets) resolving afterward", async () => {
    const meDeferred = deferred<MeInfo>();
    const assetsDeferred = deferred<GuidanceAsset[]>();
    armFastDefaults();
    apiMock.me.mockImplementation(() => meDeferred.promise);
    apiMock.listAssets.mockImplementation(() => assetsDeferred.promise);
    apiMock.tree.mockResolvedValue(makeTreePayload(['alpha']));
    apiMock.listDocs.mockResolvedValue(makeDocs(['doc-a']));

    render(<App />);

    // Ceiling: membership hasn't resolved yet — the map must not have started fetching.
    expect(apiMock.tree).not.toHaveBeenCalled();

    await act(async () => {
      meDeferred.resolve(MEMBER);
      await Promise.resolve();
    });

    // Floor: membership just resolved, /api/assets is STILL pending (assetsDeferred is never
    // resolved anywhere in this test) — the map's own fetch must proceed regardless.
    await waitFor(
      () => {
        expect(apiMock.tree).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
    await waitFor(
      () => {
        expectTerritories(['alpha']);
      },
      { timeout: 5000 },
    );
  });

  it('map-boot-independence-boot-never-requests-comments: a completed boot never calls /api/comments — it is a dead fetch with no reader anywhere in the app, removed outright rather than deferred', async () => {
    armFastDefaults();
    apiMock.tree.mockResolvedValue(makeTreePayload(['alpha']));
    apiMock.listDocs.mockResolvedValue(makeDocs(['doc-a']));

    render(<App />);

    await waitFor(
      () => {
        expectTerritories(['alpha']);
      },
      { timeout: 5000 },
    );
    // Give any stray boot-time call the chance to have fired before asserting its absence.
    await waitFor(() => {
      expect(apiMock.listDocs).toHaveBeenCalled();
    });
    expect(apiMock.listComments).not.toHaveBeenCalled();
  });

  it('map-boot-independence-map-stays-painted-when-assets-fetch-fails: a failed /api/assets fetch never blanks the map — the map keeps its own honest error path and stays mounted and painting', async () => {
    armFastDefaults();
    apiMock.tree.mockResolvedValue(makeTreePayload(['alpha']));
    apiMock.listDocs.mockResolvedValue(makeDocs(['doc-a']));
    apiMock.listAssets.mockRejectedValue(new Error('assets unavailable'));

    render(<App />);

    await waitFor(
      () => {
        expectTerritories(['alpha']);
      },
      { timeout: 5000 },
    );
    // The old blanket "corpus" error box (App.tsx status==='error') must not have replaced the map.
    expect(screen.queryByText(/Couldn.t reach the studio data API/i)).toBeNull();
  });

  it("map-boot-independence-library-route-mounts-before-assets-resolve: a direct asset-detail link becomes reachable as soon as membership resolves, without waiting on /api/assets, and never presents the still-loading corpus as a false 'not found'", async () => {
    navigate('#/asset/asset-x');
    const assetsDeferred = deferred<GuidanceAsset[]>();
    armFastDefaults();
    apiMock.listAssets.mockImplementation(() => assetsDeferred.promise);
    apiMock.tree.mockResolvedValue(makeTreePayload([]));
    apiMock.listDocs.mockResolvedValue([]);

    render(<App />);

    // The Library route mounts even though /api/assets is still pending.
    await waitFor(
      () => {
        expect(screen.getByTestId('library-route')).toBeTruthy();
      },
      { timeout: 5000 },
    );
    // While pending it must NOT claim the artifact doesn't exist — that's the empty initial
    // `assets: []` state masquerading as a resolved, genuinely-empty corpus.
    expect(screen.queryByText(/Artifact not found/i)).toBeNull();

    // Once /api/assets genuinely resolves WITHOUT this id, the honest "not found" is expected.
    await act(async () => {
      assetsDeferred.resolve([makeAsset('some-other-asset')]);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByText(/Artifact not found/i)).toBeTruthy();
    });
  });

  it('map-boot-independence-library-route-surfaces-assets-error-distinctly-from-not-found: a failed /api/assets fetch on a Library route is shown as an honest error — never silently rendered as though the corpus resolved genuinely empty', async () => {
    navigate('#/asset/asset-x');
    armFastDefaults();
    apiMock.listAssets.mockRejectedValue(new Error('assets unavailable'));
    apiMock.tree.mockResolvedValue(makeTreePayload([]));
    apiMock.listDocs.mockResolvedValue([]);

    render(<App />);

    const libraryRoute = await screen.findByTestId('library-route', {}, { timeout: 5000 });
    await waitFor(() => {
      expect(within(libraryRoute).queryByText(/Artifact not found/i)).toBeNull();
    });
    await waitFor(() => {
      expect(within(libraryRoute).getByText(/couldn.t load|error|unavailable/i)).toBeTruthy();
    });
  });
});
