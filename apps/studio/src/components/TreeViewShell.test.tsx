// @vitest-environment jsdom
//
// Red-green of the desktop-layout owner feedback (2026-07-13, item B — routed out of the library
// arc to the forest/app-shell surface): the forest map at #/tree is FULL-BLEED — no `pad` padding
// ring around the world — and carries NO session counter above the map (the
// "N active sessions (+M aged)" toolbar was owner-cited clutter). Self-reported session presence
// has since retired outright (ADR-0200 D7 — the claim ledger is the one coordination signal), so
// the counter now has no data source either; this stays as the regression lock that no toolbar
// counter grows back over the map. The claims-only SessionDock stays, reachable through a story
// panel's claim rows. The visual result (the map actually filling the window edge-to-edge) is the
// owner-attested look leg (ADR-0070 stage 2).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppDataContext, type AppData } from '../lib/appData';
import { api } from '../api';
import { TreeView } from './TreeView';

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
    })),
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
  // Flush the one-shot /api/tree load so the world has landed before asserting.
  await act(async () => {});
  expect(api.tree).toHaveBeenCalled();
  return container;
}

describe('TreeView shell — full-bleed map, no session counter (owner feedback 2026-07-13)', () => {
  it('asa-treeview-mounts-one-shared-world-view', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'components', 'TreeView.tsx'),
      'utf8',
    );

    expect(source).toMatch(
      /import\s*\{[\s\S]*?\bWorldSceneView\b[\s\S]*?\}\s*from '@storytree\/app-surface'/,
    );
    expect(source).toMatch(/<WorldSceneView\b/);
    expect(source).not.toMatch(
      /import\s*\{[\s\S]*?\bSceneView\b[\s\S]*?\}\s*from '\.\/SceneView\.js'/,
    );
  });

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

// semantic-growth-studio-demo (stories/app-surface/semantic-growth-studio-demo.md): an explicit
// `?semanticGrowth=demo` query flag mounts the public `SemanticGrowthWorldView` over one static,
// representative six-frame fixture; absent/empty/unknown values leave the clean Studio route byte-
// for-byte unchanged. `SemanticGrowthWorldView` stamps its current frame as
// `data-semantic-growth-frame` on its host <section> and exposes a `nav[aria-label="Semantic growth
// controls"]` with Back/Next/Replay buttons (packages/app-surface/src/SemanticGrowthWorldView.tsx) —
// this regression locks TreeView's wiring to that public contract without importing it, so a red here
// can only be TreeView ignoring the flag (today's actual behaviour), never a missing symbol.
describe('semantic-growth studio demo (`?semanticGrowth=demo`) — asa: sgsd-clean-studio-never-mounts-the-demo, sgsd-flag-mounts-one-public-six-frame-player', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('the clean route (and any unknown value) never mounts the demo; only the exact flag mounts one public six-frame player, steppable via its own Next control', async () => {
    // 1) Clean Studio (no `semanticGrowth` key at all): no semantic-growth fixture, no demo controls.
    const clean = await renderTree();
    expect(clean.querySelector('[data-semantic-growth-frame]')).toBeNull();
    expect(clean.querySelector('nav[aria-label="Semantic growth controls"]')).toBeNull();
    cleanup();

    // 2) An unknown value follows the same clean path byte-for-byte — no demo mount.
    window.history.pushState({}, '', '/?semanticGrowth=off#/tree');
    const unknown = await renderTree();
    expect(unknown.querySelector('[data-semantic-growth-frame]')).toBeNull();
    expect(unknown.querySelector('nav[aria-label="Semantic growth controls"]')).toBeNull();
    cleanup();

    // 3) `?semanticGrowth=demo#/tree`: mounts exactly one public SemanticGrowthWorldView player,
    // starting on the first of its six ordered frames (`empty`).
    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const flagged = await renderTree();
    const frames = flagged.querySelectorAll('[data-semantic-growth-frame]');
    expect(frames.length).toBe(1);
    expect(frames[0]?.getAttribute('data-semantic-growth-frame')).toBe('empty');

    // 4) Its Next control (the public component's own button, never a Studio-authored copy) steps
    // the visible frame forward through the fixture's real ordering (empty -> land).
    const nav = flagged.querySelector('nav[aria-label="Semantic growth controls"]');
    expect(nav).toBeTruthy();
    const nextButton = Array.from(nav!.querySelectorAll('button')).find((b) => b.textContent === 'Next');
    expect(nextButton).toBeTruthy();
    await act(async () => {
      nextButton!.click();
    });
    expect(
      flagged.querySelector('[data-semantic-growth-frame]')?.getAttribute('data-semantic-growth-frame'),
    ).toBe('land');
  });

  // sgsd-fixture-is-static-and-semantically-honest (stories/app-surface/semantic-growth-studio-demo.md
  // machine contract 3): "signed-proof remains proposed/non-healthy while carrying the proof bloom;
  // healthy appears only last" / "no pre-final frame may appear healthy". The `signed-proof` frame is
  // the FIFTH of six (index 4), not the final one — its underlying story must still wear the SAME
  // non-healthy status as the `proposed`/`claimed` frames (it only gains the real signed-proof bloom on
  // top), and only the sixth, final `healthy` frame may render with the `st-healthy` territory class.
  it('signed-proof stays proposed/non-healthy while carrying the proof bloom; healthy appears only last', async () => {
    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const flagged = await renderTree();
    const nav = flagged.querySelector('nav[aria-label="Semantic growth controls"]');
    expect(nav).toBeTruthy();
    const nextButton = Array.from(nav!.querySelectorAll('button')).find((b) => b.textContent === 'Next');
    expect(nextButton).toBeTruthy();

    // Walk empty -> land -> proposed -> claimed -> signed-proof (four Next clicks).
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        nextButton!.click();
      });
    }
    expect(
      flagged.querySelector('[data-semantic-growth-frame]')?.getAttribute('data-semantic-growth-frame'),
    ).toBe('signed-proof');

    const signedProofTerritory = flagged.querySelector('.hex-territory');
    expect(signedProofTerritory).toBeTruthy();
    expect(signedProofTerritory!.classList.contains('st-healthy')).toBe(false);
    // The real signed-proof bloom is still carried on this pre-final frame.
    expect(flagged.querySelector('.world-bloom')).toBeTruthy();

    // The sixth and FINAL Next reaches `healthy` — the only frame allowed to appear healthy.
    await act(async () => {
      nextButton!.click();
    });
    expect(
      flagged.querySelector('[data-semantic-growth-frame]')?.getAttribute('data-semantic-growth-frame'),
    ).toBe('healthy');
    const healthyTerritory = flagged.querySelector('.hex-territory');
    expect(healthyTerritory).toBeTruthy();
    expect(healthyTerritory!.classList.contains('st-healthy')).toBe(true);
  });

  // sgsd-fixture-is-static-and-semantically-honest (stories/app-surface/semantic-growth-studio-demo.md
  // machine contract 3): "land has no story marker" — the second frame is claimed ground with no
  // story yet (the guidance's exact sequence is "empty, then land with no story marker, then a pale
  // proposed/non-healthy story…"). A story identity only enters the walk at the THIRD frame
  // (`proposed`); `land` itself must render no nameplate/tree identity for the fixture's story id.
  it('sgsd-land-has-no-story-marker: the second (`land`) frame is claimed ground with no nameplate/tree story identity', async () => {
    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const flagged = await renderTree();
    const nav = flagged.querySelector('nav[aria-label="Semantic growth controls"]');
    expect(nav).toBeTruthy();
    const nextButton = Array.from(nav!.querySelectorAll('button')).find((b) => b.textContent === 'Next');
    expect(nextButton).toBeTruthy();

    await act(async () => {
      nextButton!.click();
    });
    expect(
      flagged.querySelector('[data-semantic-growth-frame]')?.getAttribute('data-semantic-growth-frame'),
    ).toBe('land');

    // No nameplate (`.world-plate`, the story id/status card) may render on the `land` frame — a
    // story marker only belongs from `proposed` onward.
    expect(flagged.querySelector('.world-plate')).toBeNull();
  });

  // sgsd-bounded-in-map-host (stories/app-surface/semantic-growth-studio-demo.md): "it may size
  // within the available forest frame but may not expand the page, clip/cover its navigation or
  // place Back/Next/Replay behind the SVG." The live map's `.world-frame` is only given its
  // fill-the-frame sizing (`.tree-layout > .world-frame { flex: 1 1 auto; min-height: 0; … }`,
  // index.css) when it sits INSIDE `.tree-layout` — a bare `.tree-wrap > .world-frame` (no
  // `.tree-layout` between them) never matches that selector and the frame collapses to its
  // unconstrained intrinsic (zero) height instead of bounding to the forest frame. The demo's host
  // must reuse the SAME wrapping chain, not a shortened one.
  it('sgsd-bounded-in-map-host: the demo host wraps `.world-frame` inside `.tree-layout`, the same chain the live map relies on to bound the frame instead of collapsing it', async () => {
    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const flagged = await renderTree();
    expect(flagged.querySelector('.tree-layout > .world-frame')).toBeTruthy();
  });
});
