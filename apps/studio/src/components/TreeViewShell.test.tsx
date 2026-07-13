// @vitest-environment jsdom
//
// Red-green of the desktop-layout owner feedback (2026-07-13, item B — routed out of the library
// arc to the forest/app-shell surface): the forest map at #/tree is FULL-BLEED — no `pad` padding
// ring around the world — and carries NO session-presence counter above the map (the
// "N active sessions (+M aged)" toolbar was owner-cited clutter). The SessionDock itself stays:
// still reachable through a story panel's session rows (detail → "all sessions"); only the
// always-on map-top counter goes. ADR-0128's honest-by-absence and ADR-0138's claim wisps are
// untouched — the wisp remains the map's presence render. The visual result (the map actually
// filling the window edge-to-edge) is the owner-attested look leg (ADR-0070 stage 2).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { AppDataContext, type AppData } from '../lib/appData';
import { api } from '../api';
import { TreeView } from './TreeView';

// The tree payload carries ACTIVE sessions (one orbiting, one parked) — exactly the input that
// used to render the "1 active session (+1 aged)" counter, so its absence is load-bearing.
vi.mock('../api', () => ({
  api: {
    tree: vi.fn(async () => ({
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
      sessions: [
        {
          sessionId: 'sess-live',
          branch: 'claude/x',
          workingOn: 'something',
          nodes: [],
          band: 'fresh',
          lastSeenAt: new Date().toISOString(),
        },
        {
          sessionId: 'sess-old',
          branch: 'claude/y',
          workingOn: 'older thing',
          nodes: [],
          band: 'possibly-dead',
          lastSeenAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
        },
      ],
    })),
    presence: vi.fn(async () => ({ sessions: null })),
    activity: vi.fn(async () => ({ builds: null, claims: null })),
  },
}));

afterEach(cleanup);

const appData: AppData = {
  docs: [],
  docIds: new Set(),
  docTitles: new Map(),
  assets: [],
  comments: [],
  me: { email: 'owner@example.com', role: 'admin', status: 'active', member: true },
  refreshComments: async () => {},
  refreshAssets: async () => {},
};

async function renderTree(): Promise<HTMLElement> {
  const { container } = render(
    <AppDataContext.Provider value={appData}>
      <TreeView focus={null} />
    </AppDataContext.Provider>,
  );
  // Flush the one-shot /api/tree load so the sessions seed has landed before asserting.
  await act(async () => {});
  expect(api.tree).toHaveBeenCalled();
  return container;
}

describe('TreeView shell — full-bleed map, no session counter (owner feedback 2026-07-13)', () => {
  it('full-bleed-map: the tree wrap carries no `pad` padding ring around the world', async () => {
    const container = await renderTree();
    const wrap = container.querySelector('.tree-wrap');
    expect(wrap).toBeTruthy();
    expect(wrap!.classList.contains('pad')).toBe(false);
  });

  it('no-session-counter: active sessions render NO toolbar counter above the map', async () => {
    const container = await renderTree();
    expect(container.querySelector('.tree-toolbar')).toBeNull();
    expect(container.textContent).not.toMatch(/active session/i);
    expect(container.textContent).not.toMatch(/aged session/i);
  });
});
