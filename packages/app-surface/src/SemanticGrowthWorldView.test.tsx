// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildScene,
  type SceneInput,
  type SceneTrailsInput,
} from '@storytree/forest-world';
import { normalizeWorldPresentationModel } from './WorldSceneView.js';
import { SemanticGrowthWorldView } from './SemanticGrowthWorldView.js';
import * as AppSurfacePackageRoot from './index.js';

// Guidance: "The public view itself imports/loads its co-located motion stylesheet, so a
// consumer cannot mount an inert semantic player by forgetting a separate CSS side effect."
// vi.mock is hoisted above every import in this file, so it intercepts the module graph's
// resolution of './semantic-growth.css' as loaded by `SemanticGrowthWorldView.tsx` itself
// (same relative path, same directory) the moment that component module is first imported
// above — not merely a mock reachable only from this test file's own (absent) import of it.
const cssSideEffect = vi.hoisted(() => ({ loaded: false }));
vi.mock('./semantic-growth.css', () => {
  cssSideEffect.loaded = true;
  return {};
});

afterEach(cleanup);

const ORDERED_KEYS = [
  'empty',
  'land',
  'proposed',
  'claimed',
  'signed-proof',
  'healthy',
] as const;

const NO_TRAILS: SceneTrailsInput = {
  segments: [],
  edges: [],
  caves: [],
  dropped: [],
};

function frameModel(key: (typeof ORDERED_KEYS)[number]) {
  const input: SceneInput = {
    offset: { x: 0, y: 0 },
    width: 100,
    height: 100,
    empties: [],
    relaxedCells: [],
    drawTiles: [],
    wheatSets: [new Set()],
    trails: NO_TRAILS,
    territories: [
      {
        id: 'semantic-growth',
        status: 'proposed',
        caps: 1,
        centroid: { x: 50, y: 50 },
        radius: 24,
        treeSpot: { x: 50, y: 45 },
        labelY: 76,
        coastPaths: ['M 20 20 L 80 20 L 50 80 Z'],
        decor: [],
        plants: [],
        treeTitle: `Growth frame: ${key}`,
        wisps:
          key === 'claimed'
            ? [{ runId: 'semantic-growth', title: 'A real work wisp', phase: 'IMPLEMENT' }]
            : [],
        plate: {
          w: 60,
          h: 30,
          rx: 7,
          idY: 13,
          subY: 25,
          idText: 'semantic-growth',
          subText: key,
          title: `Growth frame: ${key}`,
        },
      },
    ],
  };

  return normalizeWorldPresentationModel({ scene: buildScene(input) });
}

describe('SemanticGrowthWorldView', () => {
  it('plays the supplied semantic sequence deterministically, clamps navigation, and renders its real scene immediately without motion when reduced', () => {
    const frames = ORDERED_KEYS.map((key) => ({ key, model: frameModel(key) }));
    const view = render(
      <SemanticGrowthWorldView frames={frames} />,
    );

    const currentKey = (): string | null =>
      view.container.querySelector('[data-semantic-growth-frame]')?.getAttribute('data-semantic-growth-frame') ?? null;

    expect(currentKey()).toBe('empty');
    fireEvent.click(view.getByRole('button', { name: 'Back' }));
    expect(currentKey()).toBe('empty');

    for (const key of ORDERED_KEYS.slice(1)) {
      fireEvent.click(view.getByRole('button', { name: 'Next' }));
      expect(currentKey()).toBe(key);
    }
    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    expect(currentKey()).toBe('healthy');

    fireEvent.click(view.getByRole('button', { name: 'Back' }));
    expect(currentKey()).toBe('signed-proof');
    fireEvent.click(view.getByRole('button', { name: 'Replay' }));
    expect(currentKey()).toBe('empty');
    fireEvent.click(view.getByRole('button', { name: 'Next' }));
    expect(currentKey()).toBe('land');

    for (const key of ['proposed', 'claimed'] as const) {
      fireEvent.click(view.getByRole('button', { name: 'Next' }));
      expect(currentKey()).toBe(key);
    }
    expect(view.container.querySelector('.world-wisp')).toBeTruthy();

    view.rerender(
      <SemanticGrowthWorldView
        frames={frames}
        reducedMotion
      />,
    );
    expect(currentKey()).toBe('claimed');
    expect(
      view.container
        .querySelector('[data-semantic-growth-frame]')
        ?.getAttribute('data-motion'),
    ).toBe('reduced');
    expect(view.container.querySelector('.world-wisp')).toBeTruthy();
    expect(view.container.querySelector('animateTransform')).toBeNull();

    expect(() =>
      render(
        <SemanticGrowthWorldView
          frames={[...frames.slice(0, 5), frames[4]! ]}
        />,
      ),
    ).toThrow(/six|duplicate|ordered/i);
  });

  it('loads its co-located motion stylesheet as part of mounting the component, not as a separate opt-in side effect', () => {
    // Guidance: "The public view itself imports/loads its co-located motion stylesheet, so a
    // consumer cannot mount an inert semantic player by forgetting a separate CSS side effect."
    // A consumer who imports and renders only `SemanticGrowthWorldView` (as every other test in
    // this file already does) must end up with `./semantic-growth.css` evaluated as part of that
    // — never left to a caller to remember to `import './semantic-growth.css'` separately.
    expect(cssSideEffect.loaded).toBe(true);
  });

  it("reduced motion never blankets every scene descendant's transform, preserving the mapper's static placement/anchor/nesting transforms", () => {
    // Guidance: "It must preserve the scene mapper's existing static SVG transform attributes
    // used for placement, anchors, and nesting; never apply a blanket transform: none to scene
    // descendants." A universal `*` selector that forces `transform: none` under the reduced
    // `[data-motion='reduced']` state would override every static placement transform SceneView
    // stamps (a tree's ground anchor, an island's nesting group, etc.) -- not just the motion
    // vocabulary's own sweeps/orbits -- which is exactly the blanket this guidance forbids.
    const css = readFileSync(
      resolve(process.cwd(), 'src', 'semantic-growth.css'),
      'utf8',
    );
    const blanketReducedTransform = /\[data-motion=['"]reduced['"]\]\s*\*\s*\{[^}]*transform\s*:/i;
    expect(css).not.toMatch(blanketReducedTransform);
  });

  it('bounds the svg so it cannot escape through viewport sizing and cover the nav controls', () => {
    // Guidance: "Stay bounded by the supplied host. The root/SVG must not escape through
    // viewport sizing or cover the controls; Back, Next and Replay remain visible, enabled
    // click targets in normal layout at every frame and host size." A bare `width: 100%;
    // height: auto` on the svg rule has NO upper bound on the rendered height once the host is
    // wide and short (a common shape for an embedded demo player) -- the svg can grow taller
    // than the host and push, or overlap, the nav controls that sit below it in normal flow.
    // The svg rule must ALSO cap its height relative to the host (a `max-height`, or an
    // explicit `aspect-ratio` that lets `object-fit: contain` resolve it), so it always settles
    // within the host's box regardless of host width/height -- never just an unbounded `auto`.
    const css = readFileSync(
      resolve(process.cwd(), 'src', 'semantic-growth.css'),
      'utf8',
    );
    const svgRuleMatch = css.match(/\[data-semantic-growth-frame\]\s*svg\s*\{([^}]*)\}/i);
    expect(svgRuleMatch).toBeTruthy();
    const svgRuleBody = svgRuleMatch?.[1] ?? '';
    expect(svgRuleBody).toMatch(/max-height\s*:|aspect-ratio\s*:/i);
  });

  it('establishes a definite height chain on the root so the svg max-height is an actual bound, not a percentage against an auto-height root', () => {
    // Guidance: "The public root must itself participate in a definite host-height/min-height
    // chain ... so the SVG sizes into the remaining space. A percentage max-height on the SVG
    // against an auto-height root is not a bound: the proof must fail that combination because
    // it can still push the controls outside the supplied host." The root rule
    // (`[data-semantic-growth-frame] { ... }`) sets its own layout intent -- it must set a
    // definite height/min-height on itself (participating in the supplied host's height chain),
    // not leave itself `display: block` with an implicit auto height: an auto-height root makes
    // the svg's `max-height: 100%` resolve against an indefinite ancestor, so it is not a bound
    // at all -- on a wide-and-short host the svg (and everything laid out after it) can still
    // grow past the supplied host and push the Back/Next/Replay controls outside it.
    const css = readFileSync(
      resolve(process.cwd(), 'src', 'semantic-growth.css'),
      'utf8',
    );
    const rootRuleMatch = css.match(/\[data-semantic-growth-frame\]\s*\{([^}]*)\}/);
    expect(rootRuleMatch).toBeTruthy();
    const rootRuleBody = rootRuleMatch?.[1] ?? '';
    expect(rootRuleBody).toMatch(
      /(?:^|;)\s*(?:min-)?height\s*:\s*(?:100%|[\d.]+(?:px|vh|dvh|em|rem))/i,
    );
  });

  it('exports the semantic growth player from the package root as the same public seam', () => {
    // Guidance: "Export the public seam from the package root." A consumer must be able to
    // reach this view via `@storytree/app-surface`'s root barrel (this file's `index.ts`),
    // not only via the internal `./SemanticGrowthWorldView.js` module path used above.
    const rootExport = (
      AppSurfacePackageRoot as { SemanticGrowthWorldView?: typeof SemanticGrowthWorldView }
    ).SemanticGrowthWorldView;
    expect(rootExport).toBe(SemanticGrowthWorldView);
  });
});
