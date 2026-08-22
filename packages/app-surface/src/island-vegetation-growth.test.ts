// Stage-1 red-green for the per-object vegetation growth DRIVER (ADR-0292 D1/D2/D3/D5/D6).
//
// Everything here runs against a scene built by the real `buildScene`, not a hand-shaped stand-in:
// the whole point of the driver is that it recognises the objects the map actually draws, and a
// fixture that agreed with the driver but not with the scene would prove nothing. Both central-tree
// shapes are covered — the procedural `buildTree` group AND the shipped `vegHeroTreeUse` `baked-use`,
// which is what the studio renders today.
//
// The VISUAL verdict is the owner's (ADR-0070 stage 2). Nothing here claims the growth looks right —
// only that it is per-object, rooted, deterministic, bounded by its island's window, and that nothing
// it adds survives the settle.

import { describe, expect, it } from 'vitest';
import {
  buildScene,
  type SceneGardenHero,
  type SceneInput,
  type SceneNode,
  type SceneStatus,
  type SceneVegHeroTrees,
} from '@storytree/forest-world';
import {
  PLATE_SETTLE_END,
  PLATE_SETTLE_START,
  VEGETATION_GROW_SPAN,
  VEGETATION_STAGGER_SPAN,
  deriveIslandVegetationPlan,
  deriveIslandVegetationPlans,
  islandTreeVariation,
  islandVegetationAtProgress,
  vegetationStaggerDelay,
  type IslandVegetationInput,
  type IslandVegetationPlan,
  type VegetationRender,
} from './island-vegetation-growth.js';
import { EXP16_TREE_GROWTH_TRACK, POSE_PLANT_GROWTH_TRACK } from './shared-growth-tracks.js';
import { wrapperContentBounds } from './sprite-sizing.js';

const hero = (fill: string): SceneGardenHero => ({
  nodes: [{ el: 'polygon', points: '0,0 5,0 0,-5', fill, stroke: '#210', strokeWidth: 0.3 }],
  width: 10,
  height: 20.6,
});
const HERO_TREES: SceneVegHeroTrees = {
  healthy: hero('#0a0'),
  proposed: hero('#e95'),
  unhealthy: hero('#c33'),
  unknown: hero('#9a9'),
};

interface FixtureOpts {
  readonly status?: SceneStatus;
  readonly caps?: number;
  readonly plants?: readonly { id: string; x: number; y: number }[];
  readonly heroTrees?: boolean;
}

function mkInput(opts: FixtureOpts = {}): SceneInput {
  const status = opts.status ?? 'healthy';
  const plants = opts.plants ?? [
    { id: 'lib#a', x: 40, y: 52 },
    { id: 'lib#b', x: 58, y: 56 },
    { id: 'lib#c', x: 46, y: 62 },
  ];
  const input: SceneInput = {
    offset: { x: 0, y: 0 },
    width: 100,
    height: 100,
    empties: [],
    relaxedCells: null,
    drawTiles: [],
    wheatSets: [new Set()],
    trails: { segments: [], edges: [], caves: [], dropped: [] },
    territories: [
      {
        id: 'lib',
        status,
        caps: opts.caps ?? plants.length,
        centroid: { x: 50, y: 50 },
        groundRadius: 30,
        screenRadius: 30,
        treeSpot: { x: 50, y: 45 },
        labelY: 80,
        coastPaths: ['M 0 0 L 1 0 Z'],
        decor: [
          { x: 34, y: 40, seed: 5 },
          { x: 66, y: 44, seed: 11 },
        ],
        plants: plants.map((p) => ({ id: p.id, status, x: p.x, y: p.y, title: p.id })),
        treeTitle: 'lib',
        signpost: { outcome: null },
        wisps: [],
        claims: [],
        plate: {
          w: 60,
          h: 33,
          rx: 7,
          idY: 14,
          subY: 27,
          idText: 'lib',
          subText: 'healthy',
          title: 'Library',
        },
      },
    ],
  };
  if (opts.heroTrees !== false) input.vegetation = { heroTrees: HERO_TREES };
  return input;
}

function territoryOf(scene: SceneNode, storyId: string): SceneNode {
  const stack: SceneNode[] = [scene];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.kind === 'territory' && node.id === storyId) return node;
    if (node.el === 'g') stack.push(...node.children);
  }
  throw new Error(`no territory ${storyId} in the scene`);
}

function mkPlan(opts: FixtureOpts = {}): IslandVegetationPlan {
  const input = mkInput(opts);
  const territory = territoryOf(buildScene(input), 'lib');
  const t = input.territories[0]!;
  const plan = deriveIslandVegetationPlan(territory, {
    storyId: t.id,
    caps: t.caps,
    radius: t.screenRadius,
    status: t.status,
  });
  if (!plan) throw new Error('no plan');
  return plan;
}

const roles = (plan: IslandVegetationPlan): string[] => plan.objects.map((o) => o.role);

describe('the driver finds every object the map draws — and nothing else', () => {
  it('reads the SHIPPED central tree, which is a baked-use, not a group', () => {
    const plan = mkPlan();
    expect(roles(plan).filter((r) => r === 'tree')).toHaveLength(1);
    const tree = plan.objects.find((o) => o.role === 'tree')!;
    expect(tree.node.el).toBe('baked-use');
    // Rooted at the island's own tree spot — the anchor the scene already placed it at.
    expect(tree.anchor).toEqual({ x: 50, y: 45 });
  });

  it('reads the PROCEDURAL central tree too, so a surface without the colourways still grows', () => {
    const plan = mkPlan({ heroTrees: false });
    const tree = plan.objects.find((o) => o.role === 'tree')!;
    expect(tree.node.kind).toBe('tree');
    expect(tree.anchor).toEqual({ x: 50, y: 45 });
  });

  it('reads one plant per capability, the conifers, and the nameplate', () => {
    const counted = roles(mkPlan()).reduce<Record<string, number>>((acc, role) => {
      acc[role] = (acc[role] ?? 0) + 1;
      return acc;
    }, {});
    expect(counted.tree).toBe(1);
    expect(counted.plant).toBe(3);
    expect(counted.decor).toBeGreaterThan(0); // conifers expanded from the two decor seeds
    expect(counted.plate).toBe(1);
  });

  it('leaves the wisp layers alone — a session being here is not something the forest grows', () => {
    const input = mkInput();
    const withSession: SceneInput = {
      ...input,
      territories: [
        {
          ...input.territories[0]!,
          claims: [{ key: 's1', title: 'a session', colourState: 'authoring' }],
          wisps: [{ runId: 'r1', title: 'building' }],
        },
      ],
    };
    const territory = territoryOf(buildScene(withSession), 'lib');
    const plan = deriveIslandVegetationPlan(territory, {
      storyId: 'lib',
      caps: 3,
      radius: 30,
      status: 'healthy',
    })!;
    const kinds = plan.objects.map((o) => o.node.kind);
    expect(kinds).not.toContain('wisps');
    expect(kinds).not.toContain('claim-wisps');
  });

  it('finds every island on the map in one pass', () => {
    const input = mkInput();
    const two: SceneInput = {
      ...input,
      wheatSets: [new Set(), new Set()],
      territories: [
        input.territories[0]!,
        { ...input.territories[0]!, id: 'app', centroid: { x: 150, y: 50 }, treeSpot: { x: 150, y: 45 } },
      ],
    };
    const inputs: IslandVegetationInput[] = [
      { storyId: 'app', caps: 3, radius: 30, status: 'healthy' },
      { storyId: 'lib', caps: 3, radius: 30, status: 'healthy' },
      { storyId: 'ghost', caps: 1, radius: 10, status: 'proposed' },
    ];
    const plans = deriveIslandVegetationPlans(buildScene(two), inputs);
    expect([...plans.keys()].sort()).toEqual(['app', 'lib']); // a story with no island is simply absent
  });
});

// ── the PARCELS shape — what the shipped studio map actually draws ────────────────────────────────
//
// This block exists because the first cut of the driver was green against the fixtures above and
// WRONG on the real map. Under the ADR-0226 unified vocabulary a parcels-present island retires the
// conifer clumps AND the one-plant-per-capability ring, and its vegetation becomes ~52 `parcel-flora`
// marks that carry NO placement transform at all: they draw in island coordinates. Rooting a beat in
// `translate(x y)` therefore rooted every one of them at (0, 0) — a scale about the world origin, and
// one shared stagger seed for the whole island. Measured on the live corpus: 2,083 marks across 40
// islands, every one of them broken.

function mkParcelInput(): SceneInput {
  // A 3x3 patch of square cells, split between two capability parcels.
  const cells = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = 34 + col * 12;
      const y = 38 + row * 12;
      cells.push({
        owner: 0,
        poly: [
          { x, y },
          { x: x + 12, y },
          { x: x + 12, y: y + 12 },
          { x, y: y + 12 },
        ],
        variant: (row + col) % 3,
        wheat: false,
      });
    }
  }
  const base = mkInput({ caps: 2 });
  return {
    ...base,
    relaxedCells: cells,
    territories: [
      {
        ...base.territories[0]!,
        parcels: [
          { capId: 'lib#a', status: 'healthy', testCount: 4, theme: 'meadow', seed: { x: 40, y: 44 } },
          { capId: 'lib#b', status: 'healthy', testCount: 3, theme: 'woodland', seed: { x: 62, y: 62 } },
        ],
      },
    ],
  };
}

function mkParcelPlan(): IslandVegetationPlan {
  const input = mkParcelInput();
  const territory = territoryOf(buildScene(input), 'lib');
  const t = input.territories[0]!;
  return deriveIslandVegetationPlan(territory, {
    storyId: t.id,
    caps: t.caps,
    radius: t.screenRadius,
    status: t.status,
  })!;
}

describe('the ADR-0226 parcel vocabulary — the shipped map’s real vegetation', () => {
  it('grows the parcel marks, which is where the per-capability vegetation actually lives', () => {
    const plan = mkParcelPlan();
    const marks = plan.objects.filter((o) => o.node.kind === 'parcel-flora');
    expect(marks.length).toBeGreaterThan(4);
    // Every one of them is MEASURED — none carries a placement transform to root in.
    expect(marks.every((o) => o.rootMode === 'measured')).toBe(true);
    // …and the central tree still roots in its own placement, as it always did.
    expect(plan.objects.find((o) => o.role === 'tree')!.rootMode).toBe('placement');
  });

  it('roots each mark at its OWN ground contact, never at the world origin', () => {
    const marks = mkParcelPlan().objects.filter((o) => o.node.kind === 'parcel-flora');
    // The bug this pins: an anchor of (0,0) means `scale(g)` about the map corner — the mark flies in
    // from off-island instead of sprouting where it stands.
    expect(marks.every((o) => o.anchor.x !== 0 || o.anchor.y !== 0)).toBe(true);
    // Contacts sit inside the island's own cell patch, not at some shared point.
    for (const mark of marks) {
      expect(mark.anchor.x).toBeGreaterThan(20);
      expect(mark.anchor.x).toBeLessThan(90);
      expect(mark.anchor.y).toBeGreaterThan(24);
      expect(mark.anchor.y).toBeLessThan(90);
    }
    expect(new Set(marks.map((o) => `${o.anchor.x.toFixed(2)},${o.anchor.y.toFixed(2)}`)).size).toBe(
      marks.length,
    );
  });

  it('gives the marks genuinely different beats — one seed for the island was the same bug', () => {
    const marks = mkParcelPlan().objects.filter((o) => o.node.kind === 'parcel-flora');
    expect(new Set(marks.map((o) => o.start.toFixed(4))).size).toBeGreaterThan(2);
  });

  it('hands the render a scale-about-point for measured marks and none for placed ones', () => {
    const plan = mkParcelPlan();
    const mid = islandVegetationAtProgress(plan, 0.6);
    const rooted = [...mid.values()].filter(
      (r): r is Extract<VegetationRender, { kind: 'rooted' }> => r.kind === 'rooted',
    );
    expect(rooted.length).toBeGreaterThan(0);
    expect(rooted.some((r) => r.origin !== null)).toBe(true);
    for (const render of rooted) {
      if (render.origin) expect(render.origin.x !== 0 || render.origin.y !== 0).toBe(true);
    }
  });
});

describe('the stagger is decorative and deterministic (ADR-0292 D5)', () => {
  it('is byte-identical for the same graph, every run', () => {
    const a = mkPlan();
    const b = mkPlan();
    expect(a.objects.map((o) => [o.role, o.start, o.end])).toEqual(
      b.objects.map((o) => [o.role, o.start, o.end]),
    );
    expect(a.tree).toEqual(b.tree);
  });

  it('depends on WHERE an object stands, never on its position in a list', () => {
    // The honesty property: reordering the capabilities cannot reorder the sprouting, so the stagger
    // is structurally incapable of claiming a capability build order the payload does not carry.
    const forward = mkPlan({
      plants: [
        { id: 'lib#a', x: 40, y: 52 },
        { id: 'lib#b', x: 58, y: 56 },
        { id: 'lib#c', x: 46, y: 62 },
      ],
    });
    const reversed = mkPlan({
      plants: [
        { id: 'lib#c', x: 46, y: 62 },
        { id: 'lib#b', x: 58, y: 56 },
        { id: 'lib#a', x: 40, y: 52 },
      ],
    });
    const byAnchor = (plan: IslandVegetationPlan): Record<string, number> =>
      Object.fromEntries(
        plan.objects
          .filter((o) => o.role === 'plant')
          .map((o) => [`${o.anchor.x},${o.anchor.y}`, o.start]),
      );
    expect(byAnchor(reversed)).toEqual(byAnchor(forward));
  });

  it('gives two objects on the same island genuinely different beats', () => {
    const starts = mkPlan()
      .objects.filter((o) => o.role === 'plant' || o.role === 'decor')
      .map((o) => o.start);
    expect(new Set(starts.map((s) => s.toFixed(4))).size).toBeGreaterThan(1);
  });

  it('draws every delay from inside the stagger window', () => {
    for (const storyId of ['lib', 'app', 'a-very-long-story-id', 'x']) {
      for (let i = 0; i < 40; i++) {
        const delay = vegetationStaggerDelay(storyId, 'decor', { x: i * 3.5, y: 100 - i });
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThan(VEGETATION_STAGGER_SPAN);
      }
    }
  });
});

describe('every beat lives inside its island’s own window (ADR-0292 D1/D6)', () => {
  it('starts at or after 0 and finishes at or before 1', () => {
    for (const plan of [mkPlan(), mkPlan({ status: 'unhealthy' }), mkPlan({ heroTrees: false })]) {
      for (const object of plan.objects) {
        expect(object.start).toBeGreaterThanOrEqual(0);
        expect(object.end).toBeLessThanOrEqual(1 + 1e-9);
        expect(object.end).toBeGreaterThan(object.start);
      }
    }
  });

  it('gives the TREE the island’s whole window — no stagger, so tree and ground finish together', () => {
    const tree = mkPlan().objects.find((o) => o.role === 'tree')!;
    expect(tree.start).toBe(0);
    expect(tree.end).toBe(1);
  });

  it('keeps the nameplate out of the vegetation stagger', () => {
    const plate = mkPlan().objects.find((o) => o.role === 'plate')!;
    expect(plate.start).toBe(PLATE_SETTLE_START);
    expect(plate.end).toBe(PLATE_SETTLE_END);
  });

  it('lines the last sprout up with the island landing', () => {
    expect(VEGETATION_STAGGER_SPAN + VEGETATION_GROW_SPAN).toBeCloseTo(1, 12);
  });
});

describe('nothing this arc adds survives the settle (ADR-0292 D6)', () => {
  it('leaves NO decor transform and NO nameplate offset at cursor 1', () => {
    const rendered = [...islandVegetationAtProgress(mkPlan(), 1).values()];
    expect(rendered.every((r) => r.kind === 'track')).toBe(true);
    expect(rendered.some((r) => r.kind === 'rooted')).toBe(false);
    expect(rendered.some((r) => r.kind === 'settle')).toBe(false);
  });

  it('is IDENTICAL at 1 and at every cursor past it — there is nothing left to advance', () => {
    const plan = mkPlan();
    const at = (p: number): unknown =>
      [...islandVegetationAtProgress(plan, p).values()].map((r) => JSON.stringify(r));
    expect(at(1.5)).toEqual(at(1));
    expect(at(1)).toEqual(at(1));
  });

  it('does carry the tree and the plants at 1 — they are the settled map’s art, not a leftover beat', () => {
    const rendered = [...islandVegetationAtProgress(mkPlan(), 1).values()].filter(
      (r): r is Extract<VegetationRender, { kind: 'track' }> => r.kind === 'track',
    );
    expect(rendered).toHaveLength(4); // one tree + three plants
    expect(rendered.every((r) => r.grown === 1)).toBe(true);
    const tree = rendered.find((r) => r.role === 'tree')!;
    expect(tree.placement.frameIndex).toBe(EXP16_TREE_GROWTH_TRACK.frames.length - 1);
    const plant = rendered.find((r) => r.role === 'plant')!;
    expect(plant.placement.frameIndex).toBe(POSE_PLANT_GROWTH_TRACK.frames.length - 1);
  });

  it('shows nothing at all at cursor 0 — the island grows from bare ground', () => {
    const rendered = [...islandVegetationAtProgress(mkPlan(), 0).values()];
    for (const render of rendered) {
      if (render.kind === 'track') expect(render.placement.drawnHeight).toBe(0);
      else expect(render.opacity).toBe(0);
    }
  });
});

describe('per-object growth is rooted and monotone across the island window', () => {
  it('never shrinks a tree or a plant as its island accretes', () => {
    const plan = mkPlan();
    const heights = new Map<SceneNode, number>();
    for (let i = 0; i <= 400; i++) {
      for (const [node, render] of islandVegetationAtProgress(plan, i / 400)) {
        if (render.kind !== 'track') continue;
        const previous = heights.get(node) ?? -1;
        expect(render.placement.drawnHeight).toBeGreaterThanOrEqual(previous - 1e-9);
        heights.set(node, render.placement.drawnHeight);
      }
    }
  });

  it('scales decor from 0 to 1 and the nameplate only slides', () => {
    const plan = mkPlan();
    const mid = islandVegetationAtProgress(plan, 0.7);
    const decor = [...mid.values()].filter((r) => r.kind === 'rooted');
    for (const render of decor) {
      expect(render.kind === 'rooted' && render.scale).toBeGreaterThanOrEqual(0);
      expect(render.kind === 'rooted' && render.scale).toBeLessThanOrEqual(1);
    }
    const plate = [...mid.values()].find((r) => r.kind === 'settle');
    // Present at 0.7 (its window is 0.55 → 0.9) and carrying a rise, never a scale.
    expect(plate).toBeDefined();
    expect(plate && 'scale' in plate).toBe(false);
    expect(plate?.kind === 'settle' && plate.dy).toBeLessThan(0);
  });
});

describe('code varies the ONE shared track per island (ADR-0292 D3)', () => {
  it('keeps CAPABILITY COUNT readable — more capabilities, a bigger tree', () => {
    // Asserted through the WHOLE pipeline, not on the variation helper alone, because the size is
    // inherited from the body being replaced now: a unit test of the helper would happily pass while
    // the measurement that feeds it was wrong. (It was: the first cut derived the size from
    // `SceneTerritoryInput.radius`, which is the LAYOUT radius, and shipped a tree ~2.7x taller than
    // the one it replaced.)
    const height = (caps: number): number =>
      mkPlan({ caps, heroTrees: false, plants: [] }).tree.matureHeight;
    expect(height(6)).toBeGreaterThan(height(3));
    expect(height(3)).toBeGreaterThan(height(1));
  });

  it('INHERITS the size of the body it replaces, rather than re-deriving one', () => {
    // The rule `fitSpritePlacement` already follows after the owner's "way too big" verdict. Pinned
    // as a ratio so it survives an art change: the track stands where the vector body stood.
    const input = mkInput({ heroTrees: false, caps: 4 });
    const territory = territoryOf(buildScene(input), 'lib');
    const treeNode = [...(territory as { children: SceneNode[] }).children].find(
      (c) => c.kind === 'tree',
    )!;
    const bounds = wrapperContentBounds(treeNode)!;
    const bodyHeight = bounds.maxY - bounds.minY;
    const plan = deriveIslandVegetationPlan(territory, {
      storyId: 'lib',
      caps: 4,
      radius: 30,
      status: 'healthy',
    })!;
    // Within the seeded jitter band (+/-6%) of the body it replaces — never a multiple of it.
    expect(plan.tree.matureHeight).toBeGreaterThan(bodyHeight * 0.93);
    expect(plan.tree.matureHeight).toBeLessThan(bodyHeight * 1.07);
  });

  it('falls back to the procedural proportion when a body cannot be measured', () => {
    const measured = islandTreeVariation({ storyId: 'lib', caps: 4, radius: 30, status: 'healthy' }, 40);
    const fallback = islandTreeVariation({ storyId: 'lib', caps: 4, radius: 30, status: 'healthy' }, null);
    expect(measured.matureHeight).toBeGreaterThan(38);
    expect(measured.matureHeight).toBeLessThan(43);
    expect(fallback.matureHeight).toBeGreaterThan(0);
    expect(fallback.matureHeight).not.toBeCloseTo(measured.matureHeight, 3);
  });

  it('walks EVERY island to the mature frame — the form channel was measured out', () => {
    // Deliberate, and the reason is in `island-vegetation-growth.ts`: exp-16's early frames are a
    // SAPLING, not a withered tree, so a per-status frame ceiling made `unhealthy` read as a seedling
    // and `proposed` as a weed. Pinned here so the idea is not quietly re-introduced.
    for (const status of ['healthy', 'unhealthy', 'proposed', 'mapped'] as const) {
      const tree = [...islandVegetationAtProgress(mkPlan({ status }), 1).values()].find(
        (r): r is Extract<VegetationRender, { kind: 'track' }> =>
          r.kind === 'track' && r.role === 'tree',
      )!;
      expect(tree.placement.frameIndex).toBe(EXP16_TREE_GROWTH_TRACK.frames.length - 1);
    }
  });

  it('keeps STATUS readable as HUE — the status rides the render for the stylesheet to key on', () => {
    const at = (status: SceneStatus): SceneStatus | null => {
      const tree = [...islandVegetationAtProgress(mkPlan({ status }), 1).values()].find(
        (r): r is Extract<VegetationRender, { kind: 'track' }> => r.kind === 'track' && r.role === 'tree',
      )!;
      return tree.status;
    };
    expect(at('unhealthy')).toBe('unhealthy');
    expect(at('healthy')).toBe('healthy');
  });

  it('breaks the repetition — two stories never wear the identical tree', () => {
    const a = islandTreeVariation({ storyId: 'lib', caps: 4, radius: 30, status: 'healthy' });
    const b = islandTreeVariation({ storyId: 'app', caps: 4, radius: 30, status: 'healthy' });
    expect([a.matureHeight, a.flipped]).not.toEqual([b.matureHeight, b.flipped]);
  });

  it('breaks the repetition — two stories never wear the identical tree size', () => {
    const a = mkPlan({ heroTrees: false }).tree;
    const heights = ['lib', 'app', 'cli'].map(
      (id) => islandTreeVariation({ storyId: id, caps: 4, radius: 30, status: 'healthy' }, 40).matureHeight,
    );
    expect(new Set(heights.map((h) => h.toFixed(4))).size).toBe(3);
    expect(a.matureHeight).toBeGreaterThan(0);
  });
});
