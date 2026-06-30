// @vitest-environment jsdom
//
// Stage-1 red-green of the studio scene MAPPER (ADR-0093 Unit 2b): the role → studio-class
// translation, the focus/hidden composition, the per-node handlers, and the skips (the
// delegation hit layer is the website's, never the studio's). The VISUAL PARITY (the inline
// render vs `?render=scene`) is operator-attested (ADR-0070); the GEOMETRY is the core's
// (forest-world/scene.test.ts). Here we trust both and pin the React translation.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  buildScene,
  type BuildPhase,
  type ClaimColourState,
  type SceneInput,
} from '@storytree/forest-world';
import { SceneView, type SceneCtx } from './SceneView';

afterEach(cleanup);

function mkInput(wispPhase?: BuildPhase, claimState: ClaimColourState = 'authoring'): SceneInput {
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
        claims: [{ key: 's1', title: 'a session is working lib', colourState: claimState }],
        plate: { w: 60, h: 33, rx: 7, idY: 14, subY: 27, idText: 'lib', subText: 'healthy · 2 caps', title: 'Library' },
      },
    ],
  };
}

function renderScene(
  over: Partial<SceneCtx> = {},
  wispPhase?: BuildPhase,
  claimState?: ClaimColourState,
): {
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
      <SceneView scene={buildScene(mkInput(wispPhase, claimState))} ctx={ctx} />
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

  it('renders the generous per-story hit rect at the BACK — transparent, behind the flora', () => {
    const { root } = renderScene();
    // the hit rect's tell is rx=14: it IS rendered now (the studio uses it for forgiving node-click
    // at the zoomed-out contain fit), and transparent so it never paints over the world.
    const hit = [...root.querySelectorAll('rect')].find((r) => r.getAttribute('rx') === '14.0');
    expect(hit).toBeTruthy();
    expect(hit?.getAttribute('fill')).toBe('transparent');
    expect(hit?.classList.contains('world-story-hit')).toBe(true);
    // it sits BEHIND the flora in document/paint order, so island tiles + plants still win their own
    // clicks: the nameplate (a flora descendant) must FOLLOW the hit rect in the document.
    const plate = root.querySelector('.world-plate-bg')!;
    expect(hit!.compareDocumentPosition(plate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('selects the story when its generous hit rect is clicked (forgiving node-click)', () => {
    const onSelectStory = vi.fn();
    const { root } = renderScene({ onSelectStory });
    const hit = [...root.querySelectorAll('rect')].find((r) => r.getAttribute('rx') === '14.0')!;
    fireEvent.click(hit);
    expect(onSelectStory).toHaveBeenCalledWith('lib');
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

  it('maps a story-claim wisp to a DISTINCT class + an animated orbit (ADR-0138 §5)', () => {
    const { root } = renderScene({}, undefined, 'authoring');
    const claim = root.querySelector('.world-claim-wisp.state-authoring');
    expect(claim).toBeTruthy();
    // it carries its own glow/dot parts and a transparent hit — its OWN family, not the build wisp's.
    expect(claim?.querySelector('.world-claim-wisp-glow')).toBeTruthy();
    expect(claim?.querySelector('.world-claim-wisp-dot')).toBeTruthy();
    expect(root.querySelector('.world-claim-wisp-hit')?.getAttribute('fill')).toBe('transparent');
    // it orbits (the rotation is geometry, seeded from the claim key).
    expect(claim?.querySelector('animateTransform')).toBeTruthy();
  });

  it('colours the claim wisp by the subagent colour-state (authoring / proving / supplementing)', () => {
    expect(renderScene({}, undefined, 'authoring').root.querySelector('.world-claim-wisp.state-authoring')).toBeTruthy();
    expect(renderScene({}, undefined, 'proving').root.querySelector('.world-claim-wisp.state-proving')).toBeTruthy();
    expect(
      renderScene({}, undefined, 'supplementing').root.querySelector('.world-claim-wisp.state-supplementing'),
    ).toBeTruthy();
  });

  it('§5 HONESTY WALL: a claim wisp is NEVER painted as the proven-green bloom (class-level)', () => {
    // The at-risk state is "proving" (the in-flight hue that must NOT read as the proven-green bloom):
    // the claim wisp must wear world-claim-wisp, and NOTHING on the claim layer may carry the bloom /
    // verdict-pass classes that ONLY a signed verdict earns (ADR-0045).
    const { root } = renderScene({}, undefined, 'proving');
    const claim = root.querySelector('.world-claim-wisp.state-proving')!;
    expect(claim).toBeTruthy();
    // the claim wisp itself is not a bloom …
    expect(claim.classList.contains('world-bloom')).toBe(false);
    expect(claim.classList.contains('verdict-pass')).toBe(false);
    // … and no descendant under the claim orbit is one either.
    expect(claim.closest('.world-claim-wisp')?.querySelector('.world-bloom')).toBeNull();
    expect(claim.querySelector('.bloom-ring, .bloom-spark, .bloom-crown, .bloom-plant')).toBeNull();
    expect(claim.querySelector('.verdict-pass')).toBeNull();
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
