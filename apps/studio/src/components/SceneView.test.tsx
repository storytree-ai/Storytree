// @vitest-environment jsdom
//
// Stage-1 red-green of the studio scene MAPPER (ADR-0093 Unit 2b): the role → studio-class
// translation, the focus/hidden composition, the per-node handlers, and the skips (the
// delegation hit layer is the website's, never the studio's). The VISUAL PARITY (the inline
// render vs `?render=scene`) is operator-attested (ADR-0070); the GEOMETRY is the core's
// (forest-world/scene.test.ts). Here we trust both and pin the React translation.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { buildScene, type BuildPhase, type SceneInput } from '@storytree/forest-world';
import { SceneView, type SceneCtx } from './SceneView';

afterEach(cleanup);

function mkInput(wispPhase?: BuildPhase): SceneInput {
  return {
    offset: { x: 0, y: 0 },
    width: 100,
    height: 100,
    empties: [],
    relaxedCells: [
      { owner: 0, poly: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], variant: 1, wheat: false },
      { owner: 0, poly: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }], variant: 0, wheat: true },
    ],
    drawTiles: [],
    wheatSets: [new Set()],
    roads: [{ from: 'a', to: 'b', d: 'M 0 0 L 1 1', title: 'b depends on a' }],
    territories: [
      {
        id: 'lib',
        status: 'healthy',
        caps: 2,
        centroid: { x: 50, y: 50 },
        radius: 30,
        treeSpot: { x: 50, y: 45 },
        labelY: 80,
        coastPaths: ['M 0 0 L 1 0 Z'],
        decor: [{ x: 40, y: 40, seed: 5 }],
        plants: [{ id: 'lib#c', status: 'unhealthy', x: 45, y: 55, title: 'cap c' }],
        treeTitle: 'lib — healthy',
        signpost: { outcome: null },
        wisps: [{ runId: 'r1', title: 'building', ...(wispPhase ? { phase: wispPhase } : {}) }],
        plate: { w: 60, h: 33, rx: 7, idY: 14, subY: 27, idText: 'lib', subText: 'healthy · 2 caps', title: 'Library' },
      },
    ],
  };
}

function renderScene(over: Partial<SceneCtx> = {}, wispPhase?: BuildPhase): {
  root: HTMLElement;
  ctx: SceneCtx;
} {
  const ctx: SceneCtx = {
    territoryClassById: (id, status) => `hex-territory st-${status}${id === 'lib' ? ' is-focus' : ''}`,
    roadClassByEnds: () => 'world-trail is-ancestor',
    hidden: new Set(['unhealthy']),
    onHoverStory: vi.fn(),
    onSelectStory: vi.fn(),
    onSelectCap: vi.fn(),
    ...over,
  };
  const { container } = render(
    <svg>
      <SceneView scene={buildScene(mkInput(wispPhase))} ctx={ctx} />
    </svg>,
  );
  return { root: container, ctx };
}

describe('SceneView — the studio scene mapper', () => {
  it('maps roles to the studio classes, folding status + variant', () => {
    const { root } = renderScene();
    expect(root.querySelector('.story-tree.st-healthy')).toBeTruthy();
    // mesh cells carry their variant / wheat class.
    expect(root.querySelector('.relaxed-cell.v-1')).toBeTruthy();
    expect(root.querySelector('.relaxed-cell.is-wheat')).toBeTruthy();
    // conifer colour band = seed % 3 (5 % 3 = 2).
    expect(root.querySelector('.conifer-body.c-2')).toBeTruthy();
    // the human-witness signpost (blank, unsigned).
    expect(root.querySelector('.story-sign.sign-blank')).toBeTruthy();
  });

  it('applies the focus-aware island class + the legend status filter', () => {
    const { root } = renderScene();
    // the island group folds in territoryClassById (focus) ...
    const terr = root.querySelector('.hex-flora');
    expect(terr?.classList.contains('is-focus')).toBe(true);
    // ... and a hidden status wears is-filtered (unhealthy is filtered here).
    expect(root.querySelector('.garden-flora.st-unhealthy.is-filtered')).toBeTruthy();
    expect(root.querySelector('.story-tree')?.classList.contains('is-filtered')).toBe(false);
  });

  it('omits the website delegation hit layer (the studio binds per-node handlers)', () => {
    const { root } = renderScene();
    // the hit rect's tell is rx=14; no rect carries it (the layer is skipped). The
    // rects present are the nameplate bg (rx 7) + the signpost post (rx 1.1).
    const rects = [...root.querySelectorAll('rect')];
    expect(rects.some((r) => r.getAttribute('rx') === '14.0')).toBe(false);
    expect(root.querySelector('.world-plate-bg')).toBeTruthy();
  });

  it('drives an animated wisp orbit + an aria-hidden-free render of the static look', () => {
    const { root } = renderScene();
    const wisp = root.querySelector('.world-wisp.band-building');
    expect(wisp).toBeTruthy();
    expect(wisp?.querySelector('animateTransform')).toBeTruthy();
  });

  it('colours the wisp band by the live gate phase (ADR-0048 §3 v2)', () => {
    // a CONFIRM_RED build → a red-band wisp (and never a stale building band).
    const red = renderScene({}, 'CONFIRM_RED').root;
    expect(red.querySelector('.world-wisp.band-red')).toBeTruthy();
    expect(red.querySelector('.world-wisp.band-building')).toBeNull();
    // a GATE build → a green-band wisp.
    const green = renderScene({}, 'GATE').root;
    expect(green.querySelector('.world-wisp.band-green')).toBeTruthy();
    // an absent phase keeps the neutral teal building band (back-compat).
    const none = renderScene().root;
    expect(none.querySelector('.world-wisp.band-building')).toBeTruthy();
    expect(none.querySelector('.world-wisp.band-red')).toBeNull();
    // the orbit still animates regardless of band.
    expect(red.querySelector('.world-wisp.band-red animateTransform')).toBeTruthy();
  });

  it('selects the story on an island click; selects the capability on a plant click (stopping propagation)', () => {
    const onSelectStory = vi.fn();
    const onSelectCap = vi.fn();
    const { root } = renderScene({ onSelectStory, onSelectCap });
    fireEvent.click(root.querySelector('.hex-flora')!);
    expect(onSelectStory).toHaveBeenCalledWith('lib');

    onSelectStory.mockClear();
    fireEvent.click(root.querySelector('.garden-flora')!);
    expect(onSelectCap).toHaveBeenCalledWith('lib', 'lib#c');
    expect(onSelectStory).not.toHaveBeenCalled(); // stopPropagation
  });

  it('hovers the story from any of its island groups', () => {
    const onHoverStory = vi.fn();
    const { root } = renderScene({ onHoverStory });
    fireEvent.mouseEnter(root.querySelector('.hex-flora')!);
    expect(onHoverStory).toHaveBeenCalledWith('lib');
    fireEvent.mouseLeave(root.querySelector('.hex-flora')!);
    expect(onHoverStory).toHaveBeenCalledWith(null);
  });
});
