// @vitest-environment jsdom
//
// The forest currency signal, WIRED (ADR-0445 D3, `map-currency-signal`). The reading and the render
// are proved in isolation next door; this file exists because neither of those can fail if the lamp
// is never mounted, or if the health facts never reach it. That is the fault class the studio has
// been bitten by before — a green package suite over a dishonest live render — so the chain
// `/api/health` → StoreBanner's single poller → App → TreeView → the lamp is driven end to end here,
// through the REAL components, with only the non-participating global chrome handed in as stubs.
//
// THE CENTRAL CASE IS THE ONE A CONNECTIVITY LIGHT GETS WRONG: `db: 'ok'`, the store answering
// perfectly, the tree resolving — and the app seven commits behind `main`. That is the 2026-08-25
// incident, and the map must say amber over it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { App, type AppSurfaces } from './App';
import { HttpDouble, installHttpDouble } from './test/httpDouble';
import type {
  ActivityPayload,
  MeInfo,
  StoreHealth,
  TreePayload,
  TreeStory,
} from './types';

const ME = '/api/me';
const DOCS = '/api/docs';
const ASSETS = '/api/assets';
const COMMENTS = '/api/comments';
const TREE = '/api/tree';
const HEALTH = '/api/health';
const ACTIVITY = '/api/activity';
const DB_STATUS = '/api/db/status';
// The map's optional art-style sheet: not an api route and not what this suite is about, but the
// REAL TreeView asks for it and the double fails closed, so it has to be declared.
const ART_SHEET = '/art-sheets/storybook/manifest.json';

let http: HttpDouble;

const MEMBER: MeInfo = {
  email: 'operator@example.com',
  role: 'admin',
  status: 'active',
  member: true,
};

// Only the chrome that takes no part in this chain. Never TreeView (it mounts the lamp), never
// StoreBanner (it owns the single /api/health poller the code facts are lifted from).
const SURFACES: AppSurfaces = {
  Sidebar: () => null,
  Hud: () => null,
  DocView: () => null,
  AssetView: () => null,
  AssetEditor: () => null,
  MembersPanel: () => null,
};

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

const TREE_PAYLOAD: TreePayload = { stories: [makeStory('alpha')], builds: [], claims: [] };

/**
 * A health response with the DATABASE PERFECTLY FINE. `runtime` is what each scenario varies — the
 * whole point being that nothing about `db`/`store` moves the reading.
 */
function health(runtime?: StoreHealth['runtime']): StoreHealth {
  const base: StoreHealth = {
    store: 'pg',
    db: 'ok',
    code: { startedAt: '2026-01-01T00:00:00.000Z', head: 'HEAD-A', stale: false },
  };
  // The hosted/dev studio genuinely omits `runtime`, so the absent case is a real shape rather than
  // a spread convenience — built as its own statement (`no-conditional-empty-object-spread`).
  if (runtime === undefined) return base;
  return { ...base, runtime };
}

function armDefaults(runtime?: StoreHealth['runtime']): void {
  http.get(ME, () => MEMBER);
  http.get(ASSETS, () => []);
  http.get(COMMENTS, () => []);
  http.get(DOCS, () => []);
  http.get(ACTIVITY, () => ({ builds: [], claims: [], departures: [] } satisfies ActivityPayload));
  http.get(DB_STATUS, () => ({ state: 'RUNNABLE', activationPolicy: 'ALWAYS' }));
  http.get(HEALTH, () => health(runtime));
  http.get(TREE, () => TREE_PAYLOAD);
}

/** The rendered currency state, or null when no lamp is on screen at all. */
function currencyState(): string | null {
  return document.querySelector('[data-currency-state]')?.getAttribute('data-currency-state') ?? null;
}

beforeEach(() => {
  window.localStorage.clear();
  http = installHttpDouble();
  http.get(ART_SHEET, () => new Response('', { status: 404 }));
});

afterEach(() => {
  cleanup();
  http.uninstall();
  window.localStorage.clear();
});

describe('the forest currency signal, wired through the real app', () => {
  it('map-currency-signal-answers-currency-not-connectivity: a behind-main app ambers on the live map while the database answers perfectly', async () => {
    armDefaults({ branch: 'main', behind: 7, pinned: true });

    render(<App surfaces={SURFACES} />);

    await waitFor(() => {
      expect(currencyState()).toBe('amber');
    });
    // The store was never in doubt — `db: 'ok'` on every probe. A connectivity light reads this
    // exact scenario as green, which is why the wider question had to be the one asked.
    expect(http.countTo(HEALTH)).toBeGreaterThan(0);
    const hover = screen.getByTestId('map-currency').getAttribute('title') ?? '';
    expect(hover).toContain('7 commits behind main');
    expect(hover).toMatch(/rebuild and relaunch/i);
  });

  it('map-currency-signal-answers-currency-not-connectivity: a current app on a resolved tree ambers at nothing — the live map reads green', async () => {
    armDefaults({ branch: 'main', behind: 0, pinned: true });

    render(<App surfaces={SURFACES} />);

    await waitFor(() => {
      expect(currencyState()).toBe('green');
    });
    expect(screen.getByTestId('map-currency').textContent).toContain('current');
  });

  it('map-currency-signal-discloses-without-blocking: the amber map still paints its world in full', async () => {
    armDefaults({ branch: 'main', behind: 7, pinned: true });

    render(<App surfaces={SURFACES} />);

    await waitFor(() => {
      expect(currencyState()).toBe('amber');
    });
    // D5: amber withholds nothing. The territory is on screen beside the warning, not instead of it.
    expect(document.querySelector('.hex-territory[data-story-id="alpha"]')).not.toBeNull();
    expect(screen.queryByText(/Growing the world/i)).toBeNull();
  });
});
