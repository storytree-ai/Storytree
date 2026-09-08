// @vitest-environment jsdom
//
// TreeView.landView.test.tsx — `?landView=1` opens the land BESIDE the working map, and its absence
// leaves that map exactly as it shipped.
//
// ⚠ THE SECOND HALF IS THE ONE WORTH HAVING. "A land view exists" is easy to satisfy; what this
// increment promised is that the working map is NOT TOUCHED, and the only way to hold that is to
// assert the closed state as hard as the open one — the panel absent, the split modifier absent,
// and the map's own frame still the one child of the layout it has always been.
//
// ⚠ THE CANVAS IS NEVER REACHED HERE, and that is by construction rather than by stubbing: the
// panel refuses to mount it before it has a measured frame, and jsdom lays nothing out and ships no
// `ResizeObserver`. So this suite exercises the real wiring without pulling three.js into a
// headless runner — the same branch a first paint takes in a browser.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';

import { AppDataContext, type AppData } from '../lib/appData';
import { HttpDouble, installHttpDouble } from '../test/httpDouble';
import { TreeView } from './TreeView';

const TREE_PAYLOAD = {
  stories: [
    {
      id: 'studio',
      title: 'Studio',
      outcome: 'the studio serves',
      status: 'healthy',
      proofMode: 'UAT',
      uatWitness: 'machine',
      dependsOn: [],
      consumedBy: [],
      capabilities: [],
    },
  ],
};

let http: HttpDouble;

beforeEach(() => {
  http = installHttpDouble();
  http.get('/api/tree', () => TREE_PAYLOAD);
  http.get('/api/activity', () => ({ builds: null, claims: null }));
});

afterEach(() => {
  cleanup();
  http.uninstall();
  window.history.replaceState(null, '', '/');
});

const appData: AppData = {
  docs: [],
  docIds: new Set(),
  docTitles: new Map(),
  docsStatus: 'ready',
  docsError: '',
  assets: [],
  assetsStatus: 'ready',
  assetsError: '',
  me: { email: 'owner@example.com', role: 'admin', status: 'active', member: true },
  refreshAssets: async () => {},
};

async function renderTreeAt(search: string): Promise<HTMLElement> {
  window.history.replaceState(null, '', `/${search}`);
  const { container } = render(
    <AppDataContext.Provider value={appData}>
      <TreeView focus={null} />
    </AppDataContext.Provider>,
  );
  await act(async () => {});
  return container;
}

describe('the land view beside the working map', () => {
  it('is ABSENT by default — the map route is the one that shipped', async () => {
    const container = await renderTreeAt('');
    expect(container.querySelector('[data-testid="land-view"]')).toBeNull();
    const layout = container.querySelector('.tree-layout');
    expect(layout).toBeTruthy();
    expect(layout!.classList.contains('has-land-view')).toBe(false);
    expect(container.querySelector('.world-frame')).toBeTruthy();
  });

  it('opens on `?landView=1`, AS A SIBLING of the map frame rather than in place of it', async () => {
    const container = await renderTreeAt('?landView=1');
    const panel = container.querySelector('[data-testid="land-view"]');
    expect(panel).toBeTruthy();
    // ⚠ THE MAP IS STILL THERE. A view that replaced the map would satisfy every other assertion
    // in this file, which is why this one is stated separately.
    const frame = container.querySelector('.world-frame');
    expect(frame).toBeTruthy();
    // Siblings under the same layout, and the layout is what carries the split.
    const layout = container.querySelector('.tree-layout');
    expect(layout!.classList.contains('has-land-view')).toBe(true);
    expect(panel!.parentElement).toBe(layout);
    expect(frame!.parentElement).toBe(layout);
  });

  it('does not open on a near miss, so the renderer chunk is never fetched by accident', async () => {
    for (const miss of ['?landView=0', '?landview=1', '?landView=']) {
      const container = await renderTreeAt(miss);
      expect(container.querySelector('[data-testid="land-view"]')).toBeNull();
      cleanup();
    }
  });
});
