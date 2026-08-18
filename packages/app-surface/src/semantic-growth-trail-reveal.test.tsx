// @vitest-environment jsdom
//
// The Chapter 2 witness's ARRIVAL DRAW-ON beat (ADR-0169's `arrivalGrowPlan`, wired into the
// semantic-growth player for the first time).
//
// Why this file exists rather than a one-line fixture change: `SceneView` only ever REFERENCES
// `mask="url(#trail-m-<id>)"`; the mask ELEMENTS were emitted in exactly one place in the repo
// (TreeView's own `<defs>`), and `SemanticGrowthWorldView` rendered a bare `<svg>` with no
// `<defs>` at all. An unresolved mask reference renders UNMASKED in SVG, so setting `reveal`
// alone would have left the trail fully drawn from the first paint with dead wiring behind it —
// a silent no-op with nothing red to show for it. Hence the load-bearing assertion below is not
// "a mask attribute is present" but "every mask REFERENCE resolves to a mask element in the same
// document".

import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildScene,
  trailFillWidth,
  type SceneInput,
  type SceneNode,
  type SceneTrailsInput,
} from '@storytree/forest-world';
import { normalizeWorldPresentationModel } from './WorldSceneView.js';
import {
  SemanticGrowthWorldView,
  type SemanticGrowthFrame,
  type SemanticGrowthFrameKey,
} from './SemanticGrowthWorldView.js';
import { arrivalGrowPlan, REVEAL_STAGGER_MS, type TrailRevealPlan } from './trailReveal.js';

afterEach(cleanup);

const ARRIVING_ID = 'arriving-island';
const NEIGHBOUR_ID = 'neighbour-island';

const ORDERED_KEYS = [
  'empty',
  'land',
  'proposed',
  'claimed',
  'signed-proof',
  'healthy',
] as const;

/** A real two-segment chain between two islands — the same shape `routeTrails` emits for a
 *  single `depends_on` edge (the demo fixture's own primary→companion road), so the plan under
 *  test is a plan over REAL segment ids the scene actually draws, never an invented one. */
const TRAILS: SceneTrailsInput = {
  segments: [
    {
      id: 'seg-near',
      d: 'M 60 40 C 70 40 80 40 90 40',
      points: [
        { x: 60, y: 40 },
        { x: 90, y: 40 },
      ],
      usage: 2,
      hidden: false,
    },
    {
      id: 'seg-far',
      d: 'M 90 40 C 100 40 110 40 120 40',
      points: [
        { x: 90, y: 40 },
        { x: 120, y: 40 },
      ],
      usage: 1,
      hidden: false,
    },
  ],
  edges: [
    {
      from: NEIGHBOUR_ID,
      to: ARRIVING_ID,
      // ordered from -> to: the far segment leaves the neighbour, the near one lands on the
      // arriving island, so growth outward from the arrival walks the chain backwards.
      segments: [
        { id: 'seg-far', reversed: false },
        { id: 'seg-near', reversed: false },
      ],
    },
  ],
  caves: [],
  dropped: [],
};

function territory(id: string, cx: number, cy: number, key: string) {
  return {
    id,
    status: 'proposed' as const,
    caps: 1,
    centroid: { x: cx, y: cy },
    groundRadius: 20,
    screenRadius: 20,
    treeSpot: { x: cx, y: cy - 4 },
    labelY: cy + 24,
    coastPaths: [`M ${cx - 20} ${cy - 20} L ${cx + 20} ${cy - 20} L ${cx} ${cy + 20} Z`],
    decor: [],
    plants: [],
    treeTitle: `${id} (${key})`,
    wisps: [],
    plate: {
      w: 40,
      h: 18,
      rx: 4,
      idY: 8,
      subY: 15,
      idText: id,
      subText: key,
      title: id,
    },
  };
}

function sceneFor(key: string): SceneNode {
  const input: SceneInput = {
    offset: { x: 0, y: 0 },
    width: 160,
    height: 90,
    empties: [],
    relaxedCells: [],
    drawTiles: [],
    wheatSets: [new Set()],
    trails: TRAILS,
    territories: [
      territory(ARRIVING_ID, 40, 40, key),
      territory(NEIGHBOUR_ID, 140, 40, key),
    ],
  };
  return buildScene(input);
}

function growPlan(): TrailRevealPlan {
  const plan = arrivalGrowPlan(TRAILS, new Set([ARRIVING_ID]));
  if (!plan) throw new Error('fixture must produce a real arrival grow plan');
  return plan;
}

/** Six ordered frames, the arrival plan set on exactly one of them (the witness's own rule:
 *  the beat rides the ARRIVAL frame, so the mount-fired mask animation plays once). */
function framesWithRevealOn(
  revealKey: SemanticGrowthFrameKey,
): readonly SemanticGrowthFrame[] {
  const plan = growPlan();
  return ORDERED_KEYS.map((key) => ({
    key,
    model: normalizeWorldPresentationModel({
      scene: sceneFor(key),
      ...(key === revealKey ? { reveal: plan } : {}),
    }),
  }));
}

function masks(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('mask')] as unknown as HTMLElement[];
}

/** Every `mask="url(#…)"` reference in the rendered DOM, paired with whether it RESOLVES. */
function maskReferences(
  container: HTMLElement,
): { readonly ref: string; readonly resolves: boolean }[] {
  return [...container.querySelectorAll('[mask]')].map((el) => {
    const ref = el.getAttribute('mask') ?? '';
    const id = /^url\(#(.+)\)$/.exec(ref)?.[1] ?? '';
    return { ref, resolves: id !== '' && container.querySelector(`[id="${id}"]`) !== null };
  });
}

function segmentPathData(container: HTMLElement, segId: string): string {
  const path = container.querySelector(`path.trail-fill[data-id="${segId}"]`);
  if (!path) throw new Error(`fixture scene did not draw trail segment ${segId}`);
  return path.getAttribute('d') ?? '';
}

describe('SemanticGrowthWorldView arrival draw-on', () => {
  it('resolves every mask reference it attaches — one <mask> per revealed segment', () => {
    const plan = growPlan();
    expect(plan.segments.map((s) => s.id)).toEqual(['seg-near', 'seg-far']);

    const { container } = render(
      <SemanticGrowthWorldView frames={framesWithRevealOn('empty')} reducedMotion={false} />,
    );

    // The gap this unit closes: the player emitted NO <defs> at all, so the masks the scene
    // references did not exist and the trail painted statically, fully drawn.
    expect(masks(container).map((m) => m.getAttribute('id'))).toEqual([
      'trail-m-seg-near',
      'trail-m-seg-far',
    ]);
    const refs = maskReferences(container);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((r) => r.resolves)).toBe(true);
  });

  it('resolves each segment path off the scene, carrying the plan timing verbatim', () => {
    const plan = growPlan();
    const { container } = render(
      <SemanticGrowthWorldView frames={framesWithRevealOn('empty')} reducedMotion={false} />,
    );

    for (const seg of plan.segments) {
      const mask = container.querySelector(`#trail-m-${seg.id}`);
      expect(mask, `mask for ${seg.id}`).not.toBeNull();
      expect(mask!.getAttribute('maskUnits')).toBe('userSpaceOnUse');
      const maskPath = mask!.querySelector('path');
      expect(maskPath, `mask path for ${seg.id}`).not.toBeNull();
      // RevealSegment carries no `d`; the witness must resolve it off the SCENE, so the mask
      // stroke lies exactly over the segment the scene drew.
      expect(maskPath!.getAttribute('d')).toBe(segmentPathData(container, seg.id));
      expect(maskPath!.getAttribute('pathLength')).toBe('1');
      expect(maskPath!.getAttribute('class')).toBe(
        `trail-reveal-mask${seg.fromEnd ? ' from-end' : ''}`,
      );
      expect(maskPath!.style.animationDelay).toBe(`${seg.delayMs}ms`);
      // wide enough to cover the stroke it grows: the segment's own fill width + the casing
      // and shadow widen, exactly as the live map's own defs compute it.
      expect(Number.parseFloat(maskPath!.style.strokeWidth)).toBeCloseTo(
        trailFillWidth(seg.revealedUsage) + 8,
        6,
      );
    }
    // the staggered beat is the plan's, unscaled — REVEAL_STAGGER_MS is shared with the live map.
    expect(plan.segments.map((s) => s.delayMs)).toEqual([0, REVEAL_STAGGER_MS]);
  });

  // "Once per arrival", precisely: the plan rides ONE frame, so walking the six keys crosses the
  // draw-on exactly once. Re-entering that frame (Back / Replay) re-mounts the same mask and
  // replays the same beat — which is the deterministic half, not a second beat: the same cursor
  // position always selects the same output (proven by the Back/Replay case below).
  it('plays the beat exactly once per arrival — only the arrival frame carries masks', () => {
    const { container } = render(
      <SemanticGrowthWorldView frames={framesWithRevealOn('proposed')} reducedMotion={false} />,
    );
    const next = (): void => {
      fireEvent.click(container.querySelector('button:nth-of-type(2)')!);
    };
    const frameKey = (): string | null =>
      container.querySelector('section')!.getAttribute('data-semantic-growth-frame');

    expect(frameKey()).toBe('empty');
    expect(masks(container)).toHaveLength(0);
    next();
    expect(frameKey()).toBe('land');
    expect(masks(container)).toHaveLength(0);
    next();
    expect(frameKey()).toBe('proposed');
    expect(masks(container)).toHaveLength(2);
    expect(container.querySelectorAll('.trail-fill.is-growing')).toHaveLength(2);
    // every later frame simply PAINTS the trail: no plan, no mask, no growth class.
    for (const later of ['claimed', 'signed-proof', 'healthy']) {
      next();
      expect(frameKey()).toBe(later);
      expect(masks(container), `masks on ${later}`).toHaveLength(0);
      expect(container.querySelectorAll('.trail-fill.is-growing')).toHaveLength(0);
      expect(container.querySelectorAll('[mask]')).toHaveLength(0);
    }
  });

  it('selects the same output for the arrival frame reached forward, by Back, and by Replay', () => {
    const { container } = render(
      <SemanticGrowthWorldView frames={framesWithRevealOn('proposed')} reducedMotion={false} />,
    );
    const [back, next, replay] = [...container.querySelectorAll('button')];
    const svg = (): string => container.querySelector('svg')!.outerHTML;

    fireEvent.click(next!);
    fireEvent.click(next!);
    const forward = svg();
    expect(forward).toContain('trail-m-seg-near');

    fireEvent.click(next!); // claimed
    fireEvent.click(back!); // back onto the arrival frame
    expect(svg()).toBe(forward);

    fireEvent.click(replay!); // back to `empty`
    expect(masks(container)).toHaveLength(0);
    fireEvent.click(next!);
    fireEvent.click(next!);
    expect(svg()).toBe(forward);
  });

  it('settles reduced motion on a fully drawn trail — no mask, no growth class', () => {
    const { container } = render(
      <SemanticGrowthWorldView frames={framesWithRevealOn('empty')} reducedMotion />,
    );
    expect(masks(container)).toHaveLength(0);
    expect(container.querySelectorAll('[mask]')).toHaveLength(0);
    expect(container.querySelectorAll('.is-growing')).toHaveLength(0);
    // the trail itself is still drawn — settlement is the FINAL scene, never a hidden trail.
    expect(container.querySelectorAll('path.trail-fill')).toHaveLength(2);
  });

  it('emits no <defs> at all when no frame carries a plan (the clean route stays as it was)', () => {
    const { container } = render(
      <SemanticGrowthWorldView
        frames={ORDERED_KEYS.map((key) => ({
          key,
          model: normalizeWorldPresentationModel({ scene: sceneFor(key) }),
        }))}
        reducedMotion={false}
      />,
    );
    expect(container.querySelectorAll('defs')).toHaveLength(0);
    expect(container.querySelectorAll('[mask]')).toHaveLength(0);
  });
});
