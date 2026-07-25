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
import type { SpriteStyleSheet } from './sprite-sheet.js';

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

/** Like {@link frameModel} but with the territory's real geometry (coast/centroid/tree/plate)
 * placed around a caller-chosen region -- so two frame sets can carry genuinely different
 * COMPOSED WORLD BOUNDS while both still walking the same six ordered semantic keys. Used only
 * to prove the representative framing actually derives from the world's real geometry, never a
 * fixed magic default shared by every world regardless of where it actually sits. */
function frameModelAt(
  key: (typeof ORDERED_KEYS)[number],
  region: { readonly cx: number; readonly cy: number },
) {
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
        centroid: { x: region.cx, y: region.cy },
        radius: 24,
        treeSpot: { x: region.cx, y: region.cy - 5 },
        labelY: region.cy + 26,
        coastPaths: [
          `M ${region.cx - 30} ${region.cy - 30} L ${region.cx + 30} ${region.cy - 30} L ${region.cx} ${region.cy + 30} Z`,
        ],
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

  it('preserves the signed-proof bloom overlay when a sprite sheet renders the tree — renderer choice may change artwork, never erase proof-bloom semantics', () => {
    // Guidance: "Sprite replacement must preserve semantic descendants owned by the replaced scene
    // node. Replacing the tree visual with Storybook must retain the signed-proof `.world-bloom`
    // overlay identity that Vector exposes; renderer choice may change artwork, never erase
    // proof-bloom semantics." The signed-proof frame keeps its story proposed/non-healthy while
    // carrying the real proof bloom (a `bloom-anchor` > `bloom-crown` descendant of the `tree` node,
    // composed to the `.world-bloom` class by the scene mapper). A "Storybook" sprite sheet covering
    // `tree:proposed` re-skins the tree wrapper as an `<image>` -- that swap must NOT silently drop
    // the bloom overlay the vector render exposes for the exact same frame.
    const signedProofInput: SceneInput = {
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
          treeTitle: 'Growth frame: signed-proof',
          wisps: [],
          bloom: { ageRatio: 0.5, outcome: 'pass' },
          plate: {
            w: 60,
            h: 30,
            rx: 7,
            idY: 13,
            subY: 25,
            idText: 'semantic-growth',
            subText: 'signed-proof',
            title: 'Growth frame: signed-proof',
          },
        },
      ],
    };

    const storybookSheet: SpriteStyleSheet = {
      name: 'storybook',
      label: 'Storybook — warm (cosy rebuilt)',
      sprites: {
        'tree:proposed': {
          href: '/art-sheets/storybook/tree-proposed.svg',
          w: 40,
          h: 60,
          anchorX: 0.5,
          anchorY: 1,
        },
      },
    };

    const signedProofModel = normalizeWorldPresentationModel({
      scene: buildScene(signedProofInput),
      spriteSheet: storybookSheet,
    });

    const frames = ORDERED_KEYS.map((key) =>
      key === 'signed-proof' ? { key, model: signedProofModel } : { key, model: frameModel(key) },
    );

    const view = render(<SemanticGrowthWorldView frames={frames} />);
    for (const key of ORDERED_KEYS.slice(1, 5)) {
      fireEvent.click(view.getByRole('button', { name: 'Next' }));
    }
    expect(
      view.container.querySelector('[data-semantic-growth-frame="signed-proof"]'),
    ).toBeTruthy();
    // the sprite sheet DID re-skin the tree with real artwork ...
    expect(view.container.querySelector('image')).toBeTruthy();
    // ... but the signed-proof bloom overlay Vector exposes for this exact frame must still be
    // present -- the renderer swap must never erase proof-bloom semantics.
    expect(view.container.querySelector('.world-bloom')).toBeTruthy();
  });

  it('holds one deterministic representative world framing across the whole walk, derived from the composed world bounds -- never a magic 0 0 100 100 default or a frame-by-frame camera jump', () => {
    // Guidance: "Accept one deterministic representative world framing alongside the six
    // frames and hold it stable through the whole walk. It is the host's normal contain-style
    // view of the composed world bounds ... it is not a magic `0 0 100 100`, a crop around the
    // current tree, or a frame-by-frame camera jump." Two worlds whose real geometry sits in
    // genuinely different places (one composed near (50, 50), one composed far away near
    // (520, 420)) cannot honestly resolve to the SAME representative framing -- that would only
    // be true of a framing that ignores the actual composed bounds entirely (the current fixed
    // `viewBox="0 0 100 100"`). Within either single world, the framing must not move as the
    // cursor walks Next/Back/Replay across all six frames -- that is the "hold it stable",
    // "never a frame-by-frame camera jump" half of the same guidance.
    const readViewBox = (container: HTMLElement): string | null =>
      container.querySelector('svg')?.getAttribute('viewBox') ?? null;

    const nearFrames = ORDERED_KEYS.map((key) => ({
      key,
      model: frameModelAt(key, { cx: 50, cy: 50 }),
    }));
    const nearView = render(<SemanticGrowthWorldView frames={nearFrames} />);
    const nearInitial = readViewBox(nearView.container);
    expect(nearInitial).toBeTruthy();
    for (const key of ORDERED_KEYS.slice(1)) {
      fireEvent.click(nearView.getByRole('button', { name: 'Next' }));
      expect(readViewBox(nearView.container)).toBe(nearInitial);
    }
    fireEvent.click(nearView.getByRole('button', { name: 'Back' }));
    expect(readViewBox(nearView.container)).toBe(nearInitial);
    fireEvent.click(nearView.getByRole('button', { name: 'Replay' }));
    expect(readViewBox(nearView.container)).toBe(nearInitial);
    nearView.unmount();

    const farFrames = ORDERED_KEYS.map((key) => ({
      key,
      model: frameModelAt(key, { cx: 520, cy: 420 }),
    }));
    const farView = render(<SemanticGrowthWorldView frames={farFrames} />);
    const farInitial = readViewBox(farView.container);
    expect(farInitial).toBeTruthy();
    for (const key of ORDERED_KEYS.slice(1)) {
      fireEvent.click(farView.getByRole('button', { name: 'Next' }));
      expect(readViewBox(farView.container)).toBe(farInitial);
    }
    farView.unmount();

    // the representative framing must actually reflect where the composed world sits -- a
    // world composed far from the origin cannot share the near world's framing, and it
    // cannot coincide with the fixed 0 0 100 100 default either.
    expect(farInitial).not.toBe(nearInitial);
    expect(farInitial).not.toBe('0 0 100 100');
  });

  it('grounds the semantic vocabulary in independently named, role-scoped motion profiles -- arrive-ground, arrive-pop, wisp-in (alongside the real SVG orbit), and bloom-pulse -- never one shared settle grouping', () => {
    // Guidance: "coast/relaxed ground uses the existing `arrive-ground` scale `0.78 -> 1`,
    // flora/tree/nameplate/parcels use `arrive-pop` scale `0.55 -> 1`, the claim uses the real
    // `wisp-in` plus its existing SVG orbit, and signed proof uses the real `bloom-pulse`
    // `0.94 <-> 1.06`. Apply each family only when that semantic role enters. Do not group
    // territory, claim wisp, bloom and arrival under one new settle keyframe." A source/CSS
    // read, not a render: this must reject the CURRENT single `semantic-growth-settle`
    // grouping outright and positively discriminate each named profile's own keyframe body and
    // its own role-scoped selector -- never re-grouped with another role's classes.
    const css = readFileSync(
      resolve(process.cwd(), 'src', 'semantic-growth.css'),
      'utf8',
    );
    const sceneView = readFileSync(resolve(process.cwd(), 'src', 'SceneView.tsx'), 'utf8');

    // reject the current grouped settle keyframe entirely -- it must not survive under any name
    // that still bundles every role behind one shared animation.
    expect(css).not.toMatch(/semantic-growth-settle/);

    const arriveGround = css.match(/@keyframes\s+arrive-ground\s*\{([\s\S]*?)\n\}/);
    expect(arriveGround).toBeTruthy();
    expect(arriveGround?.[1] ?? '').toMatch(/scale\(\s*0\.78\s*\)/);
    expect(arriveGround?.[1] ?? '').toMatch(/scale\(\s*1\s*\)/);

    const arrivePop = css.match(/@keyframes\s+arrive-pop\s*\{([\s\S]*?)\n\}/);
    expect(arrivePop).toBeTruthy();
    expect(arrivePop?.[1] ?? '').toMatch(/scale\(\s*0\.55\s*\)/);
    expect(arrivePop?.[1] ?? '').toMatch(/scale\(\s*1\s*\)/);

    const bloomPulse = css.match(/@keyframes\s+bloom-pulse\s*\{([\s\S]*?)\n\}/);
    expect(bloomPulse).toBeTruthy();
    expect(bloomPulse?.[1] ?? '').toMatch(/0\.94/);
    expect(bloomPulse?.[1] ?? '').toMatch(/1\.06/);

    const wispIn = css.match(/@keyframes\s+wisp-in\s*\{([\s\S]*?)\n\}/);
    expect(wispIn).toBeTruthy();

    // each profile must be wired through its OWN rule, scoped to its OWN semantic role --
    // never re-grouped onto another role's classes under the same animation.
    const selectorsAnimatedBy = (animationName: string): string[] => {
      const re = new RegExp(
        `([^{}]+)\\{[^{}]*animation(?:-name)?:\\s*${animationName}[^{}]*\\}`,
        'g',
      );
      return [...css.matchAll(re)].map((m) => m[1] ?? '');
    };

    const groundSelectors = selectorsAnimatedBy('arrive-ground');
    expect(groundSelectors.length).toBeGreaterThan(0);
    for (const selector of groundSelectors) {
      expect(selector).not.toMatch(/\.world-claim-wisp|\.world-bloom/);
    }

    const popSelectors = selectorsAnimatedBy('arrive-pop');
    expect(popSelectors.length).toBeGreaterThan(0);
    for (const selector of popSelectors) {
      expect(selector).not.toMatch(/\.world-claim-wisp|\.world-bloom/);
    }

    const wispSelectors = selectorsAnimatedBy('wisp-in');
    expect(wispSelectors.length).toBeGreaterThan(0);
    for (const selector of wispSelectors) {
      expect(selector).toMatch(/\.world-claim-wisp/);
      expect(selector).not.toMatch(/\.world-bloom/);
    }

    const bloomSelectors = selectorsAnimatedBy('bloom-pulse');
    expect(bloomSelectors.length).toBeGreaterThan(0);
    for (const selector of bloomSelectors) {
      expect(selector).toMatch(/\.world-bloom/);
      expect(selector).not.toMatch(/\.world-claim-wisp/);
    }

    // the claim's real SVG orbit rides ALONGSIDE wisp-in, never replaced by it.
    expect(sceneView).toMatch(/animateTransform/);
  });

  it('keeps the arrive-pop sweep off the full CSS `transform` property when it is bound directly to the mapper-positioned tree/flora/plate groups it repositions -- never overriding the static placement anchor those groups carry mid-sweep', () => {
    // Guidance: "For mapper-positioned SVG elements, forbid semantic-growth arrival/pulse rules
    // and keyframes from animating the full CSS `transform` property. A source assertion must
    // fail `transform: scale(...)` as well as `transform: translate(...)`: either replaces the
    // element's SVG placement transform during animation even though `getAttribute('transform')`
    // still reports the original translate. Use the additive individual `scale:` property with
    // `transform-box: fill-box` ... or animate a dedicated inner visual wrapper while the outer
    // mapper-authored placement wrapper remains static ... Attribute equality alone is not proof;
    // the machine test must inspect real CSS/source and verify the individual scale/origin/
    // stagger or equivalent wrapper structure."
    //
    // `.story-tree` (the tree group), `.garden-flora` (a plant group) and `.world-plate` (the
    // nameplate group) are each stamped by the SCENE (not this package) with their own real
    // ground/root anchor -- `transform="translate(...)"` -- which `SceneView.tsx` passes straight
    // through onto whatever element it renders (`if (node.transform) props.transform =
    // node.transform;`, asserted below). The current `arrive-pop` rule binds `animation:
    // arrive-pop` DIRECTLY to those same three classes, and its keyframe sweeps the full CSS
    // `transform` property (`transform: scale(0.55) -> scale(1)`) -- on an SVG element that
    // already carries its own placement `transform` attribute, the CSS shorthand REPLACES that
    // attribute for the sweep's duration (the DOM attribute itself never changes, so attribute
    // equality alone would wrongly read as proof nothing moved). This must go through the
    // additive `scale` route (paired with `transform-box: fill-box`) or a dedicated inner wrapper
    // distinct from the placement-carrying class -- never the bare shorthand directly on it.
    const css = readFileSync(
      resolve(process.cwd(), 'src', 'semantic-growth.css'),
      'utf8',
    );
    const sceneView = readFileSync(resolve(process.cwd(), 'src', 'SceneView.tsx'), 'utf8');

    expect(sceneView).toMatch(
      /if\s*\(node\.transform\)\s*props\.transform\s*=\s*node\.transform;/,
    );

    const ruleRe = /([^{}]+)\{([^{}]*animation(?:-name)?:\s*arrive-pop\b[^{}]*)\}/g;
    const rules = [...css.matchAll(ruleRe)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }));
    expect(rules.length).toBeGreaterThan(0);

    const keyframeBody = css.match(/@keyframes\s+arrive-pop\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const keyframeSweepsFullTransform = /transform\s*:\s*(?:scale|translate)/i.test(keyframeBody);

    for (const role of ['story-tree', 'garden-flora', 'world-plate']) {
      const boundDirectlyToPlacementClass = rules.find((r) =>
        r.selectors.some((sel) => new RegExp(`\\.${role}\\s*$`).test(sel)),
      );
      // it must still cover this role by name -- either bound directly, or through a dedicated
      // inner wrapper selector nested under it.
      const coveredAtAll =
        boundDirectlyToPlacementClass ||
        rules.some((r) => r.selectors.some((sel) => new RegExp(`\\.${role}\\b`).test(sel)));
      expect(coveredAtAll).toBeTruthy();
      if (!boundDirectlyToPlacementClass) continue; // only a nested wrapper selector -- never the bare placement class itself; safe.
      const declaresAdditiveScale =
        /(?:^|[^-\w])scale\s*:\s*[\d.]/.test(boundDirectlyToPlacementClass.body) &&
        /transform-box\s*:\s*fill-box/.test(boundDirectlyToPlacementClass.body);
      // bound directly to the placement-carrying class itself: the full `transform` sweep is
      // only safe here behind the additive `scale` route (with `transform-box: fill-box`) --
      // never the bare shorthand.
      expect(keyframeSweepsFullTransform && !declaresAdditiveScale).toBe(false);
    }
  });
});
