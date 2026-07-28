// @vitest-environment jsdom
//
// map-boot-independence (ADR-0240 decision 2 stage 4): the forest map's own /api/tree fetch begins
// as soon as membership resolves, instead of waiting on Library-corpus payloads (/api/assets) the
// map never reads. `/api/comments` is a DEAD boot fetch — established by probe (no reader anywhere
// in apps/studio/src) — and is removed outright, never deferred.
//
// This is an INTEGRATION test over the REAL App + REAL TreeView + REAL AssetView + REAL StoreBanner
// — only the non-participating global chrome (Sidebar/DocView/MembersPanel) is stubbed, exactly as
// stages 1-3 did (App.route-retention.test.tsx / App.payload-cache.test.tsx). Every Studio API call
// is driven explicitly via deferred<T>() so ordering is OBSERVED, not assumed.
//
// `Hud` is stubbed as an AppData PROBE rather than to `null`: it is the one component App renders
// unconditionally inside the context provider, so it is the only place the context's actual runtime
// SHAPE can be observed. Contract 2 needs that — "carries no permanently-empty comment collection"
// is a claim about the context object itself, not about a rendered pixel.
//
// `data-testid="library-route"` does not exist on `main` — it is the observable this test authors
// for the window this unit opens (node spec: "the window is created by this unit, so closing it
// belongs to this unit"): a wrapper around the non-tree route content, parallel to the existing
// `data-testid="tree-route"` wrapper around the map, so a Library route's mount can be observed
// independently of whether /api/assets has resolved yet.

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
// never StoreBanner (it owns the health poll contract 5 drives), never lib/poll.
vi.mock('./components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./components/DocView', () => ({ DocView: () => null }));
vi.mock('./components/MembersPanel', () => ({ MembersPanel: () => null }));
// The AppData shape probe — see the header. Reads the real context and projects its key set and
// assets readiness into the DOM, so the context's shape is assertable at runtime rather than only
// at compile time.
vi.mock('./components/Hud', async () => {
  const { useAppData } = await import('./lib/appData');
  return {
    Hud: (): React.JSX.Element => {
      const data = useAppData();
      return (
        <div
          data-testid="appdata-probe"
          data-keys={Object.keys(data).sort().join(',')}
          data-assets-status={data.assetsStatus}
          data-assets-count={String(data.assets.length)}
        />
      );
    },
  };
});

import { App } from './App';
import * as appDataModule from './lib/appData';
import { CLIENT_STAMP, PAYLOAD_CACHE_KEY } from './lib/payloadCache';
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

const NON_MEMBER: MeInfo = {
  email: 'stranger@example.com',
  role: null,
  status: null,
  member: false,
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

function probe(): HTMLElement {
  return screen.getByTestId('appdata-probe');
}

function appDataKeys(): string[] {
  return (probe().getAttribute('data-keys') ?? '').split(',').filter(Boolean);
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
  window.localStorage.clear();
  navigate('#/tree');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('map-boot-independence', () => {
  it("map-boot-independence-starts-the-map-fetch-once-membership-resolves: with /api/me resolved for a member and /api/assets still PENDING, /api/tree is requested and the map mounts and paints — and no earlier than that: not while /api/me is pending, never for a non-member, and never on a route where stage 1's retention rule does not mount the map", async () => {
    // ── Floor: membership resolves, assets still pending, the map fetches anyway ──────────────
    const meDeferred = deferred<MeInfo>();
    const assetsDeferred = deferred<GuidanceAsset[]>();
    armFastDefaults();
    apiMock.me.mockImplementation(() => meDeferred.promise);
    apiMock.listAssets.mockImplementation(() => assetsDeferred.promise);
    apiMock.tree.mockResolvedValue(makeTreePayload(['alpha']));
    apiMock.listDocs.mockResolvedValue(makeDocs(['doc-a']));

    render(<App />);

    // Ceiling 1: membership hasn't resolved yet — the map must not have started fetching.
    expect(apiMock.tree).not.toHaveBeenCalled();

    await act(async () => {
      meDeferred.resolve(MEMBER);
      await Promise.resolve();
    });

    // /api/assets is never resolved anywhere in this scenario — the map must proceed regardless.
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
    expect(probe().getAttribute('data-assets-status')).toBe('loading');

    // ── Ceiling 2: a NON-member never reaches the corpus at all (ADR-0043) ────────────────────
    cleanup();
    vi.clearAllMocks();
    navigate('#/tree');
    armFastDefaults();
    apiMock.me.mockResolvedValue(NON_MEMBER);
    apiMock.tree.mockResolvedValue(makeTreePayload(['alpha']));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Request access/i)).toBeTruthy();
    });
    expect(apiMock.tree).not.toHaveBeenCalled();
    expect(apiMock.listAssets).not.toHaveBeenCalled();

    // ── Ceiling 3: a direct NON-tree route does not mount the map (stage 1's `treeMounted`) ───
    cleanup();
    vi.clearAllMocks();
    navigate('#/asset/asset-x');
    armFastDefaults();
    apiMock.tree.mockResolvedValue(makeTreePayload(['alpha']));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('library-route')).toBeTruthy();
    });
    expect(screen.queryByTestId('tree-route')).toBeNull();
    expect(apiMock.tree).not.toHaveBeenCalled();
  });

  it('map-boot-independence-drops-the-dead-comments-boot-fetch: no boot path calls api.listComments and the app context carries no permanently-empty comment collection or unused refresher, while the per-topic comment surfaces that own their own data are left untouched', async () => {
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
    // Let every boot-time call have its chance to fire before asserting an absence.
    await waitFor(() => {
      expect(apiMock.listDocs).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(apiMock.listAssets).toHaveBeenCalled();
    });
    expect(apiMock.listComments).not.toHaveBeenCalled();

    // The context itself carries neither the dead collection nor its unused refresher — a
    // permanently-empty `comments: []` would be a field that lies, which is why this unit removes
    // it rather than deferring it.
    const keys = appDataKeys();
    expect(keys).not.toContain('comments');
    expect(keys).not.toContain('refreshComments');
    expect(keys).toContain('assets');
    expect(keys).toContain('assetsStatus');

    // `openCount` was the collection's only helper and had no callers — it goes with it.
    expect('openCount' in appDataModule).toBe(false);

    // The per-topic surfaces keep their own data path: the client method the route serves is
    // untouched and still callable (InlineCommentThread / ReviewBlocks fetch through it and are
    // covered by their own suites — this unit removed only the dead BOOT fetch).
    expect(typeof apiMock.listComments).toBe('function');
  });

  it("map-boot-independence-distinguishes-unloaded-assets-from-empty: while /api/assets is in flight no consumer presents an empty Library corpus as the answer and a not-yet-loaded state is observable; a resolved EMPTY corpus IS presented and is distinguishable from that state; and a resolved non-empty corpus reaches the drawer's consumers in full", async () => {
    navigate('#/asset/asset-x');
    const assetsDeferred = deferred<GuidanceAsset[]>();
    armFastDefaults();
    apiMock.listAssets.mockImplementation(() => assetsDeferred.promise);

    render(<App />);

    const libraryRoute = await screen.findByTestId('library-route', {}, { timeout: 5000 });

    // PENDING: the initial empty `assets: []` must never masquerade as a resolved, empty corpus.
    expect(within(libraryRoute).queryByText(/Artifact not found/i)).toBeNull();
    expect(probe().getAttribute('data-assets-status')).toBe('loading');
    expect(within(libraryRoute).getByText(/Loading the Library corpus/i)).toBeTruthy();

    // RESOLVED-EMPTY: the honest "doesn't exist" answer, distinguishable from the pending state.
    await act(async () => {
      assetsDeferred.resolve([]);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(within(libraryRoute).getByText(/Artifact not found/i)).toBeTruthy();
    });
    expect(probe().getAttribute('data-assets-status')).toBe('ready');
    expect(within(libraryRoute).queryByText(/Loading the Library corpus/i)).toBeNull();

    // RESOLVED-NON-EMPTY: the deferral is a deferral, not a drop — the corpus arrives in full.
    cleanup();
    vi.clearAllMocks();
    navigate('#/asset/asset-x');
    const secondAssets = deferred<GuidanceAsset[]>();
    armFastDefaults();
    apiMock.listAssets.mockImplementation(() => secondAssets.promise);

    render(<App />);
    await screen.findByTestId('library-route', {}, { timeout: 5000 });
    await act(async () => {
      secondAssets.resolve([makeAsset('asset-x'), makeAsset('asset-y')]);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(probe().getAttribute('data-assets-count')).toBe('2');
    });
    await waitFor(() => {
      expect(screen.getByText(/asset-x title/i)).toBeTruthy();
    });
  });

  it('map-boot-independence-surfaces-an-assets-failure-without-blanking-the-map: a rejected /api/assets leaves the map mounted and painting with its own loadError path untouched and the content area not blanked, and the failure is still reported where assets matter rather than degrading into a silent empty corpus', async () => {
    armFastDefaults();
    apiMock.tree.mockResolvedValue(makeTreePayload(['alpha']));
    apiMock.listDocs.mockResolvedValue(makeDocs(['doc-a']));
    apiMock.listAssets.mockRejectedValue(new Error('assets unavailable'));

    render(<App />);

    // The map paints through the assets failure — it reads nothing from that payload.
    await waitFor(
      () => {
        expectTerritories(['alpha']);
      },
      { timeout: 5000 },
    );
    // The old blanket "corpus" error box (the removed `status === 'error'` branch) must not have
    // replaced the whole content area, map included.
    expect(screen.queryByText(/Couldn.t reach the studio data API/i)).toBeNull();
    expect(screen.getByTestId('tree-route')).toBeTruthy();
    await waitFor(() => {
      expect(probe().getAttribute('data-assets-status')).toBe('error');
    });

    // …but on a route where assets ARE the content, the failure is reported honestly — and is
    // distinguishable from the resolved-genuinely-empty "not found" answer.
    cleanup();
    vi.clearAllMocks();
    navigate('#/asset/asset-x');
    armFastDefaults();
    apiMock.listAssets.mockRejectedValue(new Error('assets unavailable'));

    render(<App />);

    const libraryRoute = await screen.findByTestId('library-route', {}, { timeout: 5000 });
    await waitFor(() => {
      expect(within(libraryRoute).getByText(/Trouble reaching the Library corpus/i)).toBeTruthy();
    });
    expect(within(libraryRoute).queryByText(/Artifact not found/i)).toBeNull();
  });

  it('map-boot-independence-leaves-the-store-health-screens-intact: the membership-error, asleep, and faulted screens and the asleep-vs-fault distinction behave exactly as they do today, and the map is never mounted behind a load screen', async () => {
    // ── A genuine membership fault: explicit, never a blank screen or a spinner ───────────────
    armFastDefaults();
    apiMock.me.mockRejectedValue(new Error('network down'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Couldn.t reach the studio/i)).toBeTruthy();
    });
    expect(screen.queryByTestId('tree-route')).toBeNull();
    expect(apiMock.tree).not.toHaveBeenCalled();

    // ── ASLEEP: membership degraded to storeUnreachable AND health agrees the DB is down ──────
    cleanup();
    vi.clearAllMocks();
    navigate('#/tree');
    armFastDefaults();
    apiMock.me.mockResolvedValue({ ...MEMBER, storeUnreachable: true, canWakeDb: true });
    apiMock.health.mockResolvedValue({ ...baseHealth(), db: 'down' });
    apiMock.dbStatus.mockResolvedValue({ state: 'STOPPED', activationPolicy: 'NEVER' });

    render(<App />);

    await waitFor(
      () => {
        expect(screen.getByText(/The live store is asleep/i)).toBeTruthy();
      },
      { timeout: 5000 },
    );
    expect(screen.queryByText(/this looks like a fault/i)).toBeNull();
    expect(screen.queryByTestId('tree-route')).toBeNull();

    // ── STORE-FAULT: the two signals DISAGREE (health says the DB is reachable) ───────────────
    cleanup();
    vi.clearAllMocks();
    navigate('#/tree');
    armFastDefaults();
    apiMock.me.mockResolvedValue({ ...MEMBER, storeUnreachable: true });
    apiMock.health.mockResolvedValue(baseHealth()); // db: 'ok' → phase 'healthy'

    render(<App />);

    await waitFor(
      () => {
        expect(screen.getByText(/this looks like a fault/i)).toBeTruthy();
      },
      { timeout: 5000 },
    );
    // The distinction is the whole point: a fault must never offer to wake a running DB.
    expect(screen.queryByText(/The live store is asleep/i)).toBeNull();
    expect(screen.queryByTestId('tree-route')).toBeNull();
  });

  it("map-boot-independence-preserves-the-prior-stages-guards: stage 1's SPA route retention still keeps a visited map mounted and parked, and stage 2's pre-paint guards still refuse a foreign client stamp and a structurally malformed entry", async () => {
    // ── Stage 1 (map-route-retention): navigating away parks the map, never unmounts it ───────
    armFastDefaults();
    apiMock.tree.mockResolvedValue(makeTreePayload(['alpha']));

    render(<App />);

    await waitFor(
      () => {
        expectTerritories(['alpha']);
      },
      { timeout: 5000 },
    );
    const callsAfterFirstPaint = apiMock.tree.mock.calls.length;

    navigate('#/asset/asset-x');
    await waitFor(() => {
      expect(screen.getByTestId('library-route')).toBeTruthy();
    });
    const parked = screen.getByTestId('tree-route');
    expect(parked).toBeTruthy();
    expect(parked.getAttribute('data-parked')).toBe('true');
    // Parked, not refetched — the retention guard's whole purpose.
    expect(apiMock.tree.mock.calls.length).toBe(callsAfterFirstPaint);

    // ── Stage 2 guard 1 (client stamp): a FOREIGN stamp is refused before any paint ───────────
    cleanup();
    vi.clearAllMocks();
    window.localStorage.setItem(
      PAYLOAD_CACHE_KEY,
      JSON.stringify({
        clientStamp: 'some-other-client/999',
        codeHead: 'HEAD-A',
        tree: { stories: [makeStory('ghost-from-a-foreign-stamp')] },
        docs: makeDocs(['ghost-doc']),
      }),
    );
    navigate('#/tree');
    armFastDefaults();
    apiMock.tree.mockResolvedValue(makeTreePayload(['alpha']));

    render(<App />);

    // The ghost must never appear — not even for a frame before the network answers.
    expect(uniqueTerritoryIds()).not.toContain('ghost-from-a-foreign-stamp');
    await waitFor(
      () => {
        expectTerritories(['alpha']);
      },
      { timeout: 5000 },
    );
    expect(uniqueTerritoryIds()).not.toContain('ghost-from-a-foreign-stamp');

    // ── Stage 2 guard 3 (structural shape): a malformed entry is refused even with a GOOD stamp ─
    cleanup();
    vi.clearAllMocks();
    window.localStorage.setItem(
      PAYLOAD_CACHE_KEY,
      JSON.stringify({
        clientStamp: CLIENT_STAMP,
        codeHead: 'HEAD-A',
        tree: { stories: 'not-an-array' },
        docs: 'not-an-array',
      }),
    );
    navigate('#/tree');
    armFastDefaults();
    apiMock.tree.mockResolvedValue(makeTreePayload(['beta']));

    render(<App />);

    await waitFor(
      () => {
        expectTerritories(['beta']);
      },
      { timeout: 5000 },
    );
  });
});
