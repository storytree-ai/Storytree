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
import { normalizeWorldPresentationModel, WorldSceneView } from './WorldSceneView.js';
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

  it('never announces a state by translating the whole scene, a terrain/island group or a complete flora/asset group laterally -- every semantic-growth arrival/pulse keyframe stays off the full CSS `transform` shorthand, and settled placement transforms stay identical across Next, Back, Replay and under reduced motion', () => {
    // Guidance: "Never translate the whole world, island/terrain group, or complete sprite/flora
    // group laterally to announce a state ... Reveal terrain where it lies; grow flora/tree from
    // planted/root anchors ..." Machine contract "Anchored-motion red": "fails any whole-scene,
    // whole-terrain/island or whole-flora/asset entry keyframe containing lateral translation ...
    // also compares settled static placement transforms through forward, Back, Replay and reduced
    // motion." Plus the "SVG transform-composition floor": "fails any semantic-growth arrival or
    // pulse selector/keyframe that sets the full `transform:` property on mapper-positioned
    // terrain, flora/tree, claim or bloom elements, including `transform: scale(...)`."
    const css = readFileSync(
      resolve(process.cwd(), 'src', 'semantic-growth.css'),
      'utf8',
    );

    const arriveGroundBody = css.match(/@keyframes\s+arrive-ground\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const arrivePopBody = css.match(/@keyframes\s+arrive-pop\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const wispInBody = css.match(/@keyframes\s+wisp-in\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const bloomPulseBody = css.match(/@keyframes\s+bloom-pulse\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    // no whole-group lateral slide as entry motion, on any of the four semantic profiles. Static
    // SVG placement translations (the scene mapper's own ground anchors / nesting, asserted via
    // `getAttribute('transform')` below) are untouched and are not themselves animation.
    for (const body of [arriveGroundBody, arrivePopBody, wispInBody, bloomPulseBody]) {
      expect(body).not.toBe('');
      expect(body).not.toMatch(/translate[XY]?\s*\(/);
    }

    // the additive individual `scale:` property, never the full CSS `transform:` shorthand -- the
    // shorthand visually REPLACES a mapper-positioned element's own SVG placement
    // `transform="translate(...)"` for the sweep's duration even though `getAttribute('transform')`
    // keeps reporting the untouched original: attribute equality alone is not proof (checked below).
    for (const body of [arriveGroundBody, arrivePopBody, bloomPulseBody]) {
      expect(body).not.toMatch(/transform\s*:/);
    }

    // settled placement transforms: every real SVG `transform` attribute the scene mapper stamps
    // (ground/root anchors, nesting) must read identically whether reached by walking forward,
    // stepping Back, or Replaying, and must not change again once reduced motion renders the same
    // markers immediately.
    const frames = ORDERED_KEYS.map((key) => ({ key, model: frameModel(key) }));
    const view = render(<SemanticGrowthWorldView frames={frames} />);
    const placementTransforms = (): string[] =>
      [...view.container.querySelectorAll('[transform]')].map(
        (el) => el.getAttribute('transform') ?? '',
      );

    const empty = placementTransforms();
    for (const _key of ORDERED_KEYS.slice(1)) {
      fireEvent.click(view.getByRole('button', { name: 'Next' }));
    }
    const healthy = placementTransforms();
    fireEvent.click(view.getByRole('button', { name: 'Back' }));
    const signedProof = placementTransforms();

    fireEvent.click(view.getByRole('button', { name: 'Replay' }));
    expect(placementTransforms()).toEqual(empty);

    for (const _key of ORDERED_KEYS.slice(1)) {
      fireEvent.click(view.getByRole('button', { name: 'Next' }));
    }
    expect(placementTransforms()).toEqual(healthy);

    fireEvent.click(view.getByRole('button', { name: 'Back' }));
    expect(placementTransforms()).toEqual(signedProof);

    view.rerender(<SemanticGrowthWorldView frames={frames} reducedMotion />);
    expect(placementTransforms()).toEqual(signedProof);
  });

  it("binds the studio's real growth vocabulary to the exact already-landed `.pop-motion-inner` seam -- `transform-box: fill-box`, ground-vs-root-anchor `transform-origin`, the reused Studio overshoot easing and a nonzero inter-layer stagger -- never a flat, simultaneous, centered-origin sweep", () => {
    // Guidance / machine contract "Exact inner-wrapper vocabulary red D": "The valid outer/inner
    // separation landed at c87382ba, but the proof still under-claimed the intended in-game
    // vocabulary: CSS continued to use full `transform: scale`, a simultaneous flat 320ms
    // ease-out, centered origin, no fill-box and no stagger/overshoot. The next red binds the
    // exact landed inner seam to the already-existing Studio motion profile."
    const css = readFileSync(
      resolve(process.cwd(), 'src', 'semantic-growth.css'),
      'utf8',
    );
    const sceneView = readFileSync(resolve(process.cwd(), 'src', 'SceneView.tsx'), 'utf8');

    // the already-landed exact wrapper -- a renamed/mismatched selector or a second wrapper is red.
    expect(sceneView).toMatch(/className:\s*'pop-motion-inner'/);
    expect(css).toMatch(/\.pop-motion-inner/);

    const arriveGroundBody = css.match(/@keyframes\s+arrive-ground\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const arrivePopBody = css.match(/@keyframes\s+arrive-pop\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const bloomPulseBody = css.match(/@keyframes\s+bloom-pulse\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const wispInBody = css.match(/@keyframes\s+wisp-in\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    // every semantic-growth keyframe grows through the additive individual `scale:` channel --
    // never the full `transform:` shorthand.
    for (const body of [arriveGroundBody, arrivePopBody, bloomPulseBody]) {
      expect(body).not.toBe('');
      expect(body).not.toMatch(/transform\s*:/);
      expect(body).toMatch(/(?:^|[^-\w])scale\s*:\s*[\d.]/);
    }
    // reused verbatim -- never new transform geometry.
    expect(arriveGroundBody).toMatch(/scale\s*:\s*0\.78\b/);
    expect(arrivePopBody).toMatch(/scale\s*:\s*0\.55\b/);
    expect(bloomPulseBody).toMatch(/scale\s*:\s*0\.94\b/);
    expect(bloomPulseBody).toMatch(/scale\s*:\s*1\.06\b/);

    const flatRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selector: m[1] ?? '',
      body: m[2] ?? '',
    }));
    const groundRules = flatRules.filter((r) => /animation(?:-name)?:\s*arrive-ground\b/.test(r.body));
    const popRules = flatRules.filter((r) => /animation(?:-name)?:\s*arrive-pop\b/.test(r.body));
    const bloomRules = flatRules.filter((r) => /animation(?:-name)?:\s*bloom-pulse\b/.test(r.body));

    // every rule that actually plays one of these three keyframes declares `transform-box:
    // fill-box` -- the additive `scale` channel only composes against the element's own painted
    // geometry with this box declared.
    for (const rules of [groundRules, popRules, bloomRules]) {
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule.body).toMatch(/transform-box\s*:\s*fill-box/);
      }
    }

    // ground scales from its own center; the story identity standing on it grows from its
    // planted/root anchor -- `center bottom` -- never a shared centered origin that would make a
    // tree appear to grow from its own middle instead of the ground it is rooted in.
    for (const rule of groundRules) {
      expect(rule.body).toMatch(/transform-origin\s*:\s*center\s*;/);
    }
    const rootedPopRules = popRules.filter(
      (r) => r.selector.includes('.story-tree') || r.selector.includes('.garden-flora'),
    );
    expect(rootedPopRules.length).toBeGreaterThan(0);
    for (const rule of rootedPopRules) {
      expect(rule.body).toMatch(/transform-origin\s*:\s*center\s+bottom\s*;/);
    }

    // the existing brief Studio overshoot, reused verbatim -- never a new easing curve.
    expect(css).toMatch(/cubic-bezier\(\s*0\.34\s*,\s*1\.45\s*,\s*0\.5\s*,\s*1\s*\)/);

    // ground, the story identity and the proof bloom do not all enter simultaneously as one flat
    // 320ms ease-out -- at least one layer carries a distinct nonzero `animation-delay`.
    const delayOf = (rules: { selector: string; body: string }[]): string =>
      rules[0]?.body.match(/animation-delay\s*:\s*([^;]+);/)?.[1]?.trim() ?? '0ms';
    const delays = new Set([delayOf(groundRules), delayOf(popRules), delayOf(bloomRules)]);
    expect(delays.size).toBeGreaterThan(1);

    // the claim's entrance stays local opacity only -- never a scale sweep -- with its existing
    // mapper-owned SVG orbit intact alongside it.
    expect(wispInBody).not.toBe('');
    expect(wispInBody).not.toMatch(/scale\s*[:(]/);
    expect(sceneView).toMatch(/animateTransform/);
  });

  it('qualifies every full-motion arrival selector by the exact frame key on which that role first enters -- never the generic [data-semantic-growth-frame][data-motion="full"] targeting', () => {
    // Guidance: "Add a separate executable entering-delta selector audit. Full-motion arrival
    // selectors must be qualified by exactly one entering frame: terrain=`land`;
    // tree/flora/plate/parcel-boundary/parcel-flora=`proposed`; wisp=`claimed`;
    // bloom=`signed-proof`. Generic `[data-semantic-growth-frame][data-motion='full']` arrival
    // targeting is red. Terrain/identity arrivals must not match claimed, signed-proof or
    // healthy; claim arrival must not match signed-proof or healthy; no arrival matches healthy."
    const css = readFileSync(resolve(process.cwd(), 'src', 'semantic-growth.css'), 'utf8');

    // the bare frame-key-less prefix every current arrival rule shares is red outright.
    expect(css).not.toMatch(/\[data-semantic-growth-frame\]\[data-motion=['"]full['"]\]/);

    const selectorsAnimatedBy = (animationName: string): string[] => {
      const re = new RegExp(
        `([^{}]+)\\{[^{}]*animation(?:-name)?:\\s*${animationName}\\b[^{}]*\\}`,
        'g',
      );
      return [...css.matchAll(re)]
        .flatMap((m) => (m[1] ?? '').split(','))
        .map((s) => s.trim());
    };

    const matchesFrame = (selector: string, key: string): boolean =>
      new RegExp(`\\[data-semantic-growth-frame=['"]${key}['"]\\]`).test(selector);

    const groundSelectors = selectorsAnimatedBy('arrive-ground');
    expect(groundSelectors.length).toBeGreaterThan(0);
    for (const selector of groundSelectors) {
      expect(matchesFrame(selector, 'land')).toBe(true);
      for (const forbidden of ['claimed', 'signed-proof', 'healthy']) {
        expect(matchesFrame(selector, forbidden)).toBe(false);
      }
    }

    const popSelectors = selectorsAnimatedBy('arrive-pop');
    expect(popSelectors.length).toBeGreaterThan(0);
    for (const selector of popSelectors) {
      expect(matchesFrame(selector, 'proposed')).toBe(true);
      for (const forbidden of ['claimed', 'signed-proof', 'healthy']) {
        expect(matchesFrame(selector, forbidden)).toBe(false);
      }
    }

    const wispSelectors = selectorsAnimatedBy('wisp-in');
    expect(wispSelectors.length).toBeGreaterThan(0);
    for (const selector of wispSelectors) {
      expect(matchesFrame(selector, 'claimed')).toBe(true);
      for (const forbidden of ['signed-proof', 'healthy']) {
        expect(matchesFrame(selector, forbidden)).toBe(false);
      }
    }

    const bloomSelectors = selectorsAnimatedBy('bloom-pulse');
    expect(bloomSelectors.length).toBeGreaterThan(0);
    for (const selector of bloomSelectors) {
      expect(matchesFrame(selector, 'signed-proof')).toBe(true);
      expect(matchesFrame(selector, 'healthy')).toBe(false);
    }
  });

  it('resolves the full cascaded animation profile (shorthand + longhand precedence, real @keyframes bodies) for every discovered role hook and proves the authored choreography bundle: a finite single bloom pulse, a non-equivalent parcel-boundary/parcel-flora pair never grouped under one selector, a translate-only plate settle, and a start-time stagger (planted first, boundary +100ms, earliest parcel flora +60ms past boundary with per-item variation, plate +180ms past planted)', () => {
    // Guidance: "One executable authored-choreography case must prove the coherent bundle
    // together ... Discover each role selector independently from rendered hooks, without
    // assuming any animation name. `resolvedProfile(selector)` parses shorthand positional
    // tokens and longhands, applies longhand precedence, resolves
    // name/duration/easing/delay/iteration/fill, then loads the resolved name's actual
    // `@keyframes`, strips comments and canonicalizes declarations by offset ... Plate/planted
    // and parcel boundary/parcel flora canonical bodies must each be non-equivalent ... Bloom
    // iteration resolves ... to numeric exactly `1` ... The same case resolves CSS
    // profiles -- not DOM existence -- for Vector tree/flora `.pop-motion-inner` and Storybook
    // direct `image.story-tree`/`image.garden-flora` hooks from a sheet defining both.
    // Start-time assertions use resolved delays ..."
    function stripKeyframeBlocks(source: string): string {
      return source.replace(/@keyframes\s+[\w-]+\s*\{[\s\S]*?\n\}\n*/g, '');
    }

    function splitDecls(body: string): string[] {
      return body
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d.length > 0);
    }

    function endsWithSelectorSuffix(selector: string, suffix: string): boolean {
      if (selector === suffix) return true;
      if (!selector.endsWith(suffix)) return false;
      const before = selector[selector.length - suffix.length - 1];
      return before === undefined || before === ' ' || before === '>' || before === '~' || before === '+';
    }

    function findRules(nonKeyframeCss: string, suffix: string): { selector: string; body: string }[] {
      const out: { selector: string; body: string }[] = [];
      for (const m of nonKeyframeCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectorList = (m[1] ?? '').split(',').map((s) => s.trim());
        const body = m[2] ?? '';
        for (const selector of selectorList) {
          if (endsWithSelectorSuffix(selector, suffix)) out.push({ selector, body });
        }
      }
      return out;
    }

    const TIMING_KEYWORDS = new Set(['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end']);
    const FILL_KEYWORDS = new Set(['none', 'forwards', 'backwards', 'both']);
    const DIRECTION_KEYWORDS = new Set(['normal', 'reverse', 'alternate', 'alternate-reverse']);
    const PLAYSTATE_KEYWORDS = new Set(['running', 'paused']);

    function tokenizeShorthand(value: string): string[] {
      const tokens: string[] = [];
      let depth = 0;
      let cur = '';
      for (const ch of value) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        if (ch === ' ' && depth === 0) {
          if (cur) tokens.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      if (cur) tokens.push(cur);
      return tokens;
    }

    interface AnimationParts {
      name?: string;
      duration?: string;
      easing?: string;
      delay?: string;
      iteration?: string;
      fill?: string;
    }

    function parseAnimationShorthand(value: string): AnimationParts {
      const tokens = tokenizeShorthand(value.trim());
      const out: AnimationParts = {};
      let sawDuration = false;
      for (const tok of tokens) {
        if (/^-?\d*\.?\d+m?s$/i.test(tok)) {
          if (!sawDuration) {
            out.duration = tok;
            sawDuration = true;
          } else {
            out.delay = tok;
          }
          continue;
        }
        if (tok === 'infinite') {
          out.iteration = 'infinite';
          continue;
        }
        if (/^\d+(\.\d+)?$/.test(tok)) {
          out.iteration = tok;
          continue;
        }
        if (TIMING_KEYWORDS.has(tok) || tok.startsWith('cubic-bezier(') || tok.startsWith('steps(')) {
          out.easing = tok;
          continue;
        }
        if (FILL_KEYWORDS.has(tok)) {
          out.fill = tok;
          continue;
        }
        if (DIRECTION_KEYWORDS.has(tok) || PLAYSTATE_KEYWORDS.has(tok)) continue;
        out.name = tok;
      }
      return out;
    }

    function toMs(value: string | undefined): number {
      if (value === undefined) return 0;
      const m = /^(-?\d*\.?\d+)(m?s)$/i.exec(value.trim());
      if (!m) return 0;
      const n = Number(m[1]);
      return (m[2] ?? 'ms').toLowerCase() === 's' ? n * 1000 : n;
    }

    interface ResolvedAnimation {
      name: string;
      durationMs: number;
      easing: string | undefined;
      delayMs: number;
      iteration: number | 'infinite';
      fill: string;
    }

    function resolvedAnimation(nonKeyframeCss: string, suffix: string): ResolvedAnimation | null {
      const rules = findRules(nonKeyframeCss, suffix);
      if (rules.length === 0) return null;
      let shorthand: AnimationParts = {};
      const longhand: AnimationParts = {};
      for (const rule of rules) {
        for (const decl of splitDecls(rule.body)) {
          const idx = decl.indexOf(':');
          if (idx < 0) continue;
          const prop = decl.slice(0, idx).trim();
          const value = decl.slice(idx + 1).trim();
          if (prop === 'animation') shorthand = { ...shorthand, ...parseAnimationShorthand(value) };
          else if (prop === 'animation-name') longhand.name = value;
          else if (prop === 'animation-duration') longhand.duration = value;
          else if (prop === 'animation-timing-function') longhand.easing = value;
          else if (prop === 'animation-delay') longhand.delay = value;
          else if (prop === 'animation-iteration-count') longhand.iteration = value;
          else if (prop === 'animation-fill-mode') longhand.fill = value;
        }
      }
      const merged: AnimationParts = { ...shorthand, ...longhand };
      if (!merged.name) return null;
      return {
        name: merged.name,
        durationMs: toMs(merged.duration),
        easing: merged.easing,
        delayMs: toMs(merged.delay),
        iteration:
          merged.iteration === undefined ? 1 : merged.iteration === 'infinite' ? 'infinite' : Number(merged.iteration),
        fill: merged.fill ?? 'none',
      };
    }

    function keyframeCanonical(fullCss: string, name: string): Map<number, string> | null {
      const re = new RegExp(`@keyframes\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`);
      const m = fullCss.match(re);
      if (!m) return null;
      const body = (m[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
      const canonical = new Map<number, string>();
      for (const stop of body.matchAll(/([\w%.,\s]+?)\s*\{([^}]*)\}/g)) {
        const offsets = (stop[1] ?? '')
          .split(',')
          .map((s) => s.trim())
          .map((s) => (s === 'from' ? 0 : s === 'to' ? 100 : Number.parseFloat(s)));
        const decls = splitDecls(stop[2] ?? '')
          .map((d) => {
            const i = d.indexOf(':');
            return `${d.slice(0, i).trim()}:${d.slice(i + 1).trim()}`;
          })
          .sort();
        const declString = decls.join(';');
        for (const off of offsets) canonical.set(off, declString);
      }
      return canonical;
    }

    function canonicalKeyframeString(map: Map<number, string> | null): string {
      if (!map) return '';
      return [...map.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([off, decl]) => `${off}%{${decl}}`)
        .join('|');
    }

    function keyframePropertySet(map: Map<number, string> | null): Set<string> {
      const props = new Set<string>();
      if (!map) return props;
      for (const decl of map.values()) {
        for (const pair of decl.split(';')) {
          if (!pair) continue;
          const i = pair.indexOf(':');
          if (i > 0) props.add(pair.slice(0, i));
        }
      }
      return props;
    }

    interface FullProfile extends ResolvedAnimation {
      keyframe: Map<number, string> | null;
    }

    function resolvedProfile(fullCss: string, nonKeyframeCss: string, suffix: string): FullProfile | null {
      const anim = resolvedAnimation(nonKeyframeCss, suffix);
      if (!anim) return null;
      return { ...anim, keyframe: keyframeCanonical(fullCss, anim.name) };
    }

    // Discover each role's rendered hook directly from real component output -- never assumed by
    // animation name -- before resolving its CSS profile below.
    const richInput: SceneInput = {
      offset: { x: 0, y: 0 },
      width: 200,
      height: 200,
      empties: [],
      relaxedCells: [
        { owner: 0, poly: [{ x: 40, y: 40 }, { x: 50, y: 40 }, { x: 50, y: 50 }, { x: 40, y: 50 }], variant: 1, wheat: false },
        { owner: 0, poly: [{ x: 60, y: 40 }, { x: 70, y: 40 }, { x: 70, y: 50 }, { x: 60, y: 50 }], variant: 0, wheat: false },
      ],
      drawTiles: [],
      wheatSets: [new Set()],
      trails: NO_TRAILS,
      territories: [
        {
          id: 'semantic-growth',
          status: 'proposed',
          caps: 1,
          centroid: { x: 50, y: 50 },
          radius: 40,
          treeSpot: { x: 50, y: 45 },
          labelY: 90,
          coastPaths: ['M 20 20 L 80 20 L 50 80 Z'],
          decor: [],
          plants: [{ id: 'semantic-growth#a', status: 'proposed', x: 45, y: 55, title: 'flora a' }],
          treeTitle: 'Growth frame: choreography',
          wisps: [],
          // The claim/presence wisp is a DISTINCT `claims` field from the build `wisps` field the
          // other fixtures in this file use (`.world-wisp`, asserted elsewhere) --
          // `.world-claim-wisp` only renders from a real `claims` entry. Folded straight into this
          // one fixture (alongside the bloom below) to keep the render count down.
          claims: [{ key: 'semantic-growth-session', title: 'A real claim', colourState: 'authoring' }],
          bloom: { ageRatio: 0.5, outcome: 'pass' },
          plate: {
            w: 60,
            h: 30,
            rx: 7,
            idY: 13,
            subY: 25,
            idText: 'semantic-growth',
            subText: 'choreography',
            title: 'Growth frame: choreography',
          },
        },
      ],
    };
    const richModel = normalizeWorldPresentationModel({ scene: buildScene(richInput) });
    const richView = render(
      <svg>
        <WorldSceneView model={richModel} />
      </svg>,
    );
    expect(richView.container.querySelector('.story-tree')).toBeTruthy();
    expect(richView.container.querySelector('.garden-flora')).toBeTruthy();
    expect(richView.container.querySelector('.world-plate')).toBeTruthy();
    expect(richView.container.querySelector('.world-claim-wisp')).toBeTruthy();
    expect(richView.container.querySelector('.world-bloom')).toBeTruthy();
    richView.unmount();

    // Capability PARCELS retire the plain plant ring when present (`buildTerritoryFlora`), so the
    // parcel/parcel-flora hooks are discovered from a DISTINCT parcels-present render rather than
    // the plain plant fixture above.
    const parcelInput: SceneInput = {
      ...richInput,
      territories: [
        {
          ...richInput.territories[0]!,
          plants: [],
          parcels: [
            { capId: 'semantic-growth#a', status: 'proposed', testCount: 2, theme: 'meadow', seed: { x: 45, y: 45 } },
          ],
        },
      ],
    };
    const parcelModel = normalizeWorldPresentationModel({ scene: buildScene(parcelInput) });
    const parcelView = render(
      <svg>
        <WorldSceneView model={parcelModel} />
      </svg>,
    );
    expect(parcelView.container.querySelector('.parcel')).toBeTruthy();
    expect(parcelView.container.querySelector('.parcel-flora')).toBeTruthy();
    parcelView.unmount();

    const growthSheet: SpriteStyleSheet = {
      name: 'storybook',
      label: 'Storybook — both tree and flora',
      sprites: {
        'tree:proposed': { href: '/art-sheets/storybook/tree-proposed.svg', w: 40, h: 60, anchorX: 0.5, anchorY: 1 },
        'flora:proposed': { href: '/art-sheets/storybook/flora-proposed.svg', w: 20, h: 20, anchorX: 0.5, anchorY: 1 },
      },
    };
    const spriteModel = normalizeWorldPresentationModel({ scene: buildScene(richInput), spriteSheet: growthSheet });
    const spriteView = render(
      <svg>
        <WorldSceneView model={spriteModel} />
      </svg>,
    );
    expect(spriteView.container.querySelector('image.story-tree')).toBeTruthy();
    expect(spriteView.container.querySelector('image.garden-flora')).toBeTruthy();
    spriteView.unmount();

    const css = readFileSync(resolve(process.cwd(), 'src', 'semantic-growth.css'), 'utf8');
    const sceneView = readFileSync(resolve(process.cwd(), 'src', 'SceneView.tsx'), 'utf8');
    const nonKeyframeCss = stripKeyframeBlocks(css);

    const treeProfile = resolvedProfile(css, nonKeyframeCss, '.story-tree .pop-motion-inner');
    const floraProfile = resolvedProfile(css, nonKeyframeCss, '.garden-flora .pop-motion-inner');
    const plateProfile = resolvedProfile(css, nonKeyframeCss, '.world-plate .pop-motion-inner');
    const boundaryProfile = resolvedProfile(css, nonKeyframeCss, '.parcel');
    const parcelFloraProfile = resolvedProfile(css, nonKeyframeCss, '.parcel-flora');
    const bloomProfile = resolvedProfile(css, nonKeyframeCss, '.world-bloom');
    const wispProfile = resolvedProfile(css, nonKeyframeCss, '.world-claim-wisp');
    const spriteTreeProfile = resolvedProfile(css, nonKeyframeCss, 'image.story-tree');
    const spriteFloraProfile = resolvedProfile(css, nonKeyframeCss, 'image.garden-flora');

    for (const profile of [
      treeProfile,
      floraProfile,
      plateProfile,
      boundaryProfile,
      parcelFloraProfile,
      bloomProfile,
      wispProfile,
      spriteTreeProfile,
      spriteFloraProfile,
    ]) {
      expect(profile).toBeTruthy();
    }

    // bloom pulses exactly once (finite), never forever -- reject shorthand/longhand counts
    // above 1 and 'infinite'; its finite fill settles the terminal body at rest values.
    expect(bloomProfile!.iteration).toBe(1);
    expect(['forwards', 'both']).toContain(bloomProfile!.fill);
    const bloomOffsets = [...(bloomProfile!.keyframe?.keys() ?? [])].sort((a, b) => a - b);
    const bloomTerminalOffset = bloomOffsets[bloomOffsets.length - 1];
    const bloomTerminal =
      bloomTerminalOffset === undefined ? undefined : bloomProfile!.keyframe!.get(bloomTerminalOffset);
    expect(bloomTerminal).toMatch(/scale:\s*1(?:\.0+)?(?:;|$)/);
    expect(bloomTerminal).toMatch(/opacity:\s*1(?:\.0+)?(?:;|$)/);

    // parcel boundary is a ground reveal -- opacity/reveal only, never a scale sweep; parcel
    // flora is rooted growth -- scale plus an opacity sprout. A real property-SET difference,
    // never just differing numeric endpoints/delays.
    const boundaryProps = keyframePropertySet(boundaryProfile!.keyframe);
    expect(boundaryProps.has('scale')).toBe(false);
    const floraProps = keyframePropertySet(parcelFloraProfile!.keyframe);
    expect(floraProps.has('scale')).toBe(true);
    expect(canonicalKeyframeString(boundaryProfile!.keyframe)).not.toBe(
      canonicalKeyframeString(parcelFloraProfile!.keyframe),
    );
    expect([...boundaryProps].sort()).not.toEqual([...floraProps].sort());

    // never grouped under one shared selector list.
    const flatSelectorGroups = [...nonKeyframeCss.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) =>
      (m[1] ?? '').split(',').map((s) => s.trim()),
    );
    const groupsBoundaryWithFlora = flatSelectorGroups.some(
      (selectors) =>
        selectors.some((s) => endsWithSelectorSuffix(s, '.parcel')) &&
        selectors.some((s) => endsWithSelectorSuffix(s, '.parcel-flora')),
    );
    expect(groupsBoundaryWithFlora).toBe(false);

    // plate settles with an individual vertical-only `translate:` property, never a scale sweep,
    // on the same landed `.pop-motion-inner` composition.
    const plateProps = keyframePropertySet(plateProfile!.keyframe);
    expect(plateProps.has('scale')).toBe(false);
    const plateTranslateDecl = [...(plateProfile!.keyframe?.values() ?? [])].find((d) =>
      /(?:^|;)translate:/.test(d),
    );
    expect(plateTranslateDecl).toBeTruthy();
    expect(plateTranslateDecl).toMatch(/translate:\s*0(?:px)?\s+-?[\d.]+(?:px)?/);

    // resolved-delay choreography: planted tree/flora first; parcel boundary at least 100ms
    // later; earliest parcel flora at least 60ms after boundary with per-item variation; plate
    // at least 180ms after planted.
    expect(boundaryProfile!.delayMs).toBeGreaterThanOrEqual(treeProfile!.delayMs + 100);
    expect(plateProfile!.delayMs).toBeGreaterThanOrEqual(treeProfile!.delayMs + 180);

    const perItemFloraDelays = [
      ...nonKeyframeCss.matchAll(
        /\.parcel-flora(?::nth-[\w-]+\([^)]*\)|\[[^\]]*(?:offset|stagger|delay)[^\]]*\])\s*\{([^}]*)\}/gi,
      ),
    ].map((m) => toMs(/animation-delay\s*:\s*([^;]+);/.exec(m[1] ?? '')?.[1]?.trim()));
    expect(perItemFloraDelays.length).toBeGreaterThan(0);
    expect(new Set(perItemFloraDelays).size).toBeGreaterThanOrEqual(2);
    expect(Math.min(...perItemFloraDelays)).toBeGreaterThanOrEqual(boundaryProfile!.delayMs + 60);

    // the claim's entrance stays local/non-spatial, riding alongside its real SVG orbit.
    const wispProps = keyframePropertySet(wispProfile!.keyframe);
    expect(wispProps.has('scale')).toBe(false);
    expect(sceneView).toMatch(/animateTransform/);

    // immediate, honest reduced semantics: no role hook above ever carries a real (non-'none')
    // animation under [data-motion='reduced'].
    for (const suffix of [
      '.story-tree .pop-motion-inner',
      '.garden-flora .pop-motion-inner',
      '.world-plate .pop-motion-inner',
      '.parcel',
      '.parcel-flora',
      '.world-claim-wisp',
      '.world-bloom',
    ]) {
      const reducedRules = findRules(nonKeyframeCss, suffix).filter(
        (r) => /data-motion=['"]reduced['"]/.test(r.selector) && /animation(?:-name)?:\s*(?!none\b)/.test(r.body),
      );
      expect(reducedRules.length).toBe(0);
    }
  });
});
