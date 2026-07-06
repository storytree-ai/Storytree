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
  type SceneTrailsInput,
} from '@storytree/forest-world';
import { trailRevealPlan } from '../lib/trailReveal';
import { SceneView, type SceneCtx } from './SceneView';

afterEach(cleanup);

/** A tiny hand-built ADR-0169 trail network: the a→lib edge rides two shared-able
 *  segments (tseg1 a spur, tseg2 the trunk-side approach), the lib→b edge bores a
 *  hidden under-island run (tseg3) through a cave portal on lib's rim. */
function mkTrails(): SceneTrailsInput {
  return {
    segments: [
      {
        id: 'tseg1',
        d: 'M 0 0 C 10 0 20 0 30 0',
        points: [{ x: 0, y: 0 }, { x: 30, y: 0 }],
        usage: 1,
        hidden: false,
      },
      {
        id: 'tseg2',
        d: 'M 30 0 C 40 0 50 0 60 0',
        points: [{ x: 30, y: 0 }, { x: 60, y: 0 }],
        usage: 2,
        hidden: false,
      },
      {
        id: 'tseg3',
        d: 'M 60 0 C 70 0 80 0 90 0',
        points: [{ x: 60, y: 0 }, { x: 90, y: 0 }],
        usage: 1,
        hidden: true,
      },
    ],
    edges: [
      {
        from: 'a',
        to: 'lib',
        title: 'lib depends on a',
        segments: [
          { id: 'tseg1', reversed: false },
          { id: 'tseg2', reversed: false },
        ],
      },
      { from: 'lib', to: 'b', segments: [{ id: 'tseg3', reversed: false }] },
    ],
    caves: [
      { islandId: 'lib', x: 55, y: 5, bearing: Math.PI / 2, width: 4.5, edgeIds: ['lib->b'] },
    ],
    dropped: [],
  };
}

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
    trails: mkTrails(),
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
    reveal: null,
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

  it('marks an arriving island across its per-island groups (arrival staging)', () => {
    // 'lib' is the arriving island. (Trails are hidden by default per ADR-0169 §3, so
    // arrival no longer draws a road on — the island layers alone stage the entrance.)
    const { root } = renderScene({ arrivalIds: new Set(['lib', 'b']) });
    // the island's flora / coast / ground groups all wear arrive-island (the CSS
    // keyframes stage coast → ground → flora off this one class per layer).
    expect(root.querySelector('.hex-flora.arrive-island')).toBeTruthy();
    expect(root.querySelector('.coast-fill-group.arrive-island')).toBeTruthy();
    expect(root.querySelector('.relaxed-tile.arrive-island')).toBeTruthy();
  });

  it('renders zero arrival artifacts when no story is entering (the steady-state board)', () => {
    const { root } = renderScene();
    expect(root.querySelector('[class*="arrive"]')).toBeNull();
    // an arrival set that names no rendered story is equally inert.
    const other = renderScene({ arrivalIds: new Set(['not-here']) }).root;
    expect(other.querySelector('[class*="arrive"]')).toBeNull();
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

describe('SceneView — the ADR-0169 trail network mapping', () => {
  it('maps the cased passes, stamping the reveal hooks (data-id/usage/edges) on every segment', () => {
    const { root } = renderScene();
    // visible segments draw once per pass — shadow, casing, fill (2 visible here) …
    expect(root.querySelectorAll('.trail-shadow-pass .trail-shadow')).toHaveLength(2);
    expect(root.querySelectorAll('.trail-casing-pass .trail-casing')).toHaveLength(2);
    expect(root.querySelectorAll('.trail-fill-pass .trail-fill')).toHaveLength(2);
    // … and the hidden under-island run lands ONLY in the ghost pass.
    expect(root.querySelectorAll('.trail-ghost-pass .trail-ghost')).toHaveLength(1);
    expect(root.querySelector('.trail-fill[data-id="tseg3"]')).toBeNull();
    const fill = root.querySelector('.trail-fill[data-id="tseg1"]')!;
    expect(fill.getAttribute('data-usage')).toBe('1');
    expect(fill.getAttribute('data-edges')).toBe('a->lib');
  });

  it('dashes a spur fill (usage 1) and keeps a trunk fill solid — computed, never authored', () => {
    const { root } = renderScene();
    expect(root.querySelector('.trail-fill[data-id="tseg1"]')!.classList.contains('is-spur')).toBe(true);
    expect(root.querySelector('.trail-fill[data-id="tseg2"]')!.classList.contains('is-spur')).toBe(false);
    // shadow/casing never carry the spur dash (the casing rule keeps the base solid).
    expect(root.querySelector('.trail-casing.is-spur')).toBeNull();
  });

  it('emits the per-edge reveal metadata (from/to/ordered chain) for every edge', () => {
    const { root } = renderScene();
    const edge = root.querySelector('.trail-edge[data-from="a"][data-to="lib"]')!;
    expect(edge).toBeTruthy();
    expect(edge.getAttribute('data-segments')).toBe('tseg1:F,tseg2:F');
  });

  it('hides every trail by default: no is-revealed, no mask, no world focus class', () => {
    const { root } = renderScene(); // reveal: null
    expect(root.querySelector('.is-revealed')).toBeNull();
    expect(root.querySelector('[mask]')).toBeNull();
    expect(root.querySelector('.world-has-focus')).toBeNull();
  });

  it('reveals the focused island`s segments: mask + direction tint + revealed-width step', () => {
    const plan = trailRevealPlan(mkTrails(), 'lib');
    const { root } = renderScene({ reveal: plan });
    // the world root wears the focus hook (CSS dims the rest of the world off it).
    expect(root.querySelector('.world-has-focus')).toBeTruthy();
    // a→lib is lib's DEPENDENCY (to === lib) → warm `dir-out`, both its segments masked.
    const fill1 = root.querySelector('.trail-fill[data-id="tseg1"]')!;
    const fill2 = root.querySelector('.trail-fill[data-id="tseg2"]')!;
    expect(fill1.classList.contains('is-revealed')).toBe(true);
    expect(fill1.classList.contains('dir-out')).toBe(true);
    expect(fill2.getAttribute('mask')).toBe('url(#trail-m-tseg2)');
    // lib→b is a DEPENDENT edge (from === lib) → cooler `dir-in` on its ghost run.
    const ghost = root.querySelector('.trail-ghost[data-id="tseg3"]')!;
    expect(ghost.classList.contains('is-revealed')).toBe(true);
    expect(ghost.classList.contains('dir-in')).toBe(true);
    // width steps from the REVEALED edge count (1 through tseg2 here), not the global
    // usage (2): fill = 2 + 2.5·√1 = 4.5, its casing +2.5 = 7.
    expect(fill2.getAttribute('stroke-width')).toBe('4.5');
    expect(
      root.querySelector('.trail-casing[data-id="tseg2"]')!.getAttribute('stroke-width'),
    ).toBe('7');
  });

  it('renders the cave portal as an island prop wearing the folded island status', () => {
    const { root } = renderScene();
    const cave = root.querySelector('.world-cave.st-healthy')!;
    expect(cave).toBeTruthy();
    expect(cave.getAttribute('data-island')).toBe('lib');
    expect(cave.getAttribute('data-edges')).toBe('lib->b');
    expect(cave.getAttribute('transform')).toMatch(/translate\(55\.0 5\.0\) rotate\(90\.0\)/);
    // the three parts: trampled apron, dark arch, lit rim.
    expect(cave.querySelector('.cave-apron')).toBeTruthy();
    expect(cave.querySelector('.cave-arch')).toBeTruthy();
    expect(cave.querySelector('.cave-rim')).toBeTruthy();
  });
});
