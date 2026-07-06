// The scene-graph's inner-loop dogfood (ADR-0093 / ADR-0020): the framework-agnostic
// drawable tree is DETERMINISTIC (same input → byte-identical scene), selects the
// right drawables per folded status, and lays out the canonical structure. The
// studio's VISUAL PARITY is operator-attested (ADR-0070), not asserted here — these
// tests pin the geometry + structure the mapper renders FROM.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { crownRadius } from './sizing.js';
import { routeTrails, trailFillWidth, type TrailIsland } from './routing.js';
import {
  buildScene,
  buildTrails,
  buildTree,
  buildPlant,
  buildConifer,
  buildBloom,
  type SceneG,
  type SceneNode,
  type SceneInput,
  type SceneTerritoryInput,
  type ScenePlantInput,
} from './scene.js';

// ---------- traversal helpers ----------

function children(n: SceneNode): SceneNode[] {
  return n.el === 'g' ? n.children : [];
}
/** First descendant (incl. self) whose kind matches, DFS. */
function firstByKind(n: SceneNode, kind: string): SceneNode | null {
  if (n.kind === kind) return n;
  for (const c of children(n)) {
    const hit = firstByKind(c, kind);
    if (hit) return hit;
  }
  return null;
}
/** Every descendant (incl. self) whose kind matches. */
function allByKind(n: SceneNode, kind: string): SceneNode[] {
  const out: SceneNode[] = [];
  const walk = (m: SceneNode): void => {
    if (m.kind === kind) out.push(m);
    for (const c of children(m)) walk(c);
  };
  walk(n);
  return out;
}
function mustByKind(n: SceneNode, kind: string): SceneNode {
  const hit = firstByKind(n, kind);
  assert.ok(hit, `expected a "${kind}" node`);
  return hit;
}

// ---------- fixtures ----------

// Trail fixtures are ROUTED, not hand-forged: real `routeTrails` output on tiny island
// sets (its own invariants are pinned in routing.test.ts). Computed once at module
// load — routeTrails is a pure function, so sharing the instance is safe.
const isle = (id: string, x: number, y: number, r: number): TrailIsland => ({ id, x, y, r });

// one unobstructed edge, matching the default territories (library → cli)
const BASE_ISLANDS = [isle('library', 100, 200, 60), isle('cli', 300, 60, 50)];
const BASE_TRAILS = routeTrails(
  BASE_ISLANDS,
  [{ from: 'library', to: 'cli', title: 'cli depends on library' }],
  'scene-fixture',
);

// two near-parallel edges into one destination — the reuse discount merges a trunk
const MERGE_TRAILS = routeTrails(
  [isle('a', -800, -60, 35), isle('b', -800, 60, 35), isle('c', 0, 0, 45)],
  [
    { from: 'a', to: 'c' },
    { from: 'b', to: 'c' },
  ],
  'scene-merge',
);

// a walled-in edge — forced under the ring, so hidden ghost runs + cave portals exist
const CAVE_ISLANDS: TrailIsland[] = [isle('A', 0, 0, 30), isle('B', 600, 0, 30)];
for (let k = 0; k < 8; k++) {
  const a = (Math.PI / 4) * k;
  CAVE_ISLANDS.push(isle(`ring${k}`, 150 * Math.cos(a), 150 * Math.sin(a), 60));
}
const CAVE_TRAILS = routeTrails(CAVE_ISLANDS, [{ from: 'A', to: 'B' }], 'scene-cave');

function mkTerritory(over: Partial<SceneTerritoryInput> = {}): SceneTerritoryInput {
  return {
    id: 'library',
    status: 'healthy',
    caps: 3,
    centroid: { x: 100, y: 200 },
    radius: 60,
    treeSpot: { x: 100, y: 190 },
    labelY: 260,
    coastPaths: ['M 0 0 L 10 0 L 10 10 Z'],
    decor: [{ x: 80, y: 180, seed: 7 }],
    plants: [{ id: 'library#cap-a', status: 'healthy', x: 90, y: 205, title: 'cap a — proven' }],
    treeTitle: 'library — healthy',
    wisps: [],
    claims: [],
    plate: { w: 120, h: 33, rx: 7, idY: 14, subY: 27, idText: 'library', subText: 'healthy · 3 caps', title: 'The library' },
    ...over,
  };
}

function mkInput(over: Partial<SceneInput> = {}): SceneInput {
  return {
    offset: { x: 300, y: 400 },
    width: 1200,
    height: 1600,
    empties: [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ],
    relaxedCells: [
      { owner: 0, poly: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], variant: 1, wheat: false },
      { owner: 0, poly: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }], variant: 2, wheat: true },
      { owner: 1, poly: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], variant: 0, wheat: false },
    ],
    drawTiles: [
      { h: { q: 0, r: 0 }, owner: 0 },
      { h: { q: 1, r: 0 }, owner: 1 },
    ],
    wheatSets: [new Set(['0,0']), new Set()],
    trails: BASE_TRAILS,
    territories: [
      mkTerritory(),
      mkTerritory({ id: 'cli', caps: 2, centroid: { x: 300, y: 60 }, treeSpot: { x: 300, y: 50 }, plants: [], decor: [] }),
    ],
    ...over,
  };
}

// ---------- determinism ----------

test('buildScene is deterministic — same input → byte-identical scene', () => {
  assert.deepEqual(buildScene(mkInput()), buildScene(mkInput()));
});

test('crown jitter is seeded by the story id (same id → same blobs; different id → different)', () => {
  const a = buildTree(mkTerritory({ id: 'alpha' }));
  const a2 = buildTree(mkTerritory({ id: 'alpha' }));
  const b = buildTree(mkTerritory({ id: 'beta' }));
  assert.deepEqual(a, a2);
  const cx = (t: SceneG): number => {
    const lo = mustByKind(t, 'crown-lo');
    const blob = children(lo)[1]; // [0] is the un-jittered central blob
    assert.ok(blob && blob.el === 'circle');
    return blob.cx;
  };
  assert.notEqual(cx(a), cx(b));
});

// ---------- top-level structure ----------

test('buildScene roots an offset world group with the layers in canonical order', () => {
  const scene = buildScene(mkInput());
  assert.equal(scene.kind, 'world');
  assert.match(scene.transform ?? '', /^translate\(300\.0 400\.0\)$/);
  assert.deepEqual(
    scene.children.map((c) => c.kind),
    ['empties-layer', 'coast-layer', 'ground-mesh', 'trails-layer', 'flora-layer', 'hits-layer'],
  );
});

test('mesh ground groups cells by owner; hex ground emits a group per tile', () => {
  const mesh = buildScene(mkInput());
  const ground = mustByKind(mesh, 'ground-mesh');
  // two owners with cells → two territory groups; owner 0 has a wheat + a variant cell.
  assert.equal(allByKind(ground, 'ground').length, 2);
  assert.equal(allByKind(ground, 'cell-wheat').length, 1);
  assert.equal(allByKind(ground, 'cell').length, 2);

  const hex = buildScene(mkInput({ relaxedCells: null }));
  const hexGround = mustByKind(hex, 'ground-hex');
  assert.equal(allByKind(hexGround, 'tile').length, 2); // one group per drawTile
  assert.equal(allByKind(hexGround, 'tile-side').length, 2);
  // tile 0,0 is in owner 0's wheat set → a wheat top; tile 1,0 is a plain variant top.
  assert.equal(allByKind(hexGround, 'tile-top-wheat').length, 1);
  assert.equal(allByKind(hexGround, 'tile-top').length, 1);
});

test('empties + hits are one per input', () => {
  const scene = buildScene(mkInput());
  assert.equal(allByKind(mustByKind(scene, 'empties-layer'), 'empty').length, 2);
  assert.equal(allByKind(mustByKind(scene, 'hits-layer'), 'hit').length, 2);
});

// ---------- the trail network (ADR-0169 §2) ----------

test('the trails layer is FULL passes in order — shadow < casing < fill < ghost — then the edge metadata', () => {
  const layer = buildTrails(mkInput());
  assert.equal(layer.kind, 'trails-layer');
  assert.deepEqual(
    layer.children.map((c) => c.kind),
    ['trail-shadow-pass', 'trail-casing-pass', 'trail-fill-pass', 'trail-ghost-pass', 'trail-edges'],
  );
  // every visible segment appears exactly once per pass, one path each — passes are
  // never interleaved per path (the casing rule: a merge must read as one trail).
  const visible = BASE_TRAILS.segments.filter((s) => !s.hidden);
  assert.ok(visible.length > 0);
  for (const [pass, kind] of [
    ['trail-shadow-pass', 'trail-shadow'],
    ['trail-casing-pass', 'trail-casing'],
    ['trail-fill-pass', 'trail-fill'],
  ] as const) {
    const paths = children(mustByKind(layer, pass));
    assert.equal(paths.length, visible.length, `${pass} draws every visible segment once`);
    assert.ok(paths.every((p) => p.el === 'path' && p.kind === kind));
    assert.deepEqual(paths.map((p) => p.id).sort(), visible.map((s) => s.id).sort());
  }
  // the unobstructed fixture forces nothing under-island → an empty ghost pass.
  assert.equal(children(mustByKind(layer, 'trail-ghost-pass')).length, 0);
  // it renders inside the world above ground, below flora.
  assert.equal(firstByKind(buildScene(mkInput()), 'trails-layer')?.kind, 'trails-layer');
});

test('each segment path carries id / data-usage / data-edges + its pass width from the ONE rule', () => {
  const layer = buildTrails(mkInput());
  const byId = (pass: string, id: string): SceneNode => {
    const hit = children(mustByKind(layer, pass)).find((p) => p.id === id);
    assert.ok(hit, `${pass} carries segment ${id}`);
    return hit;
  };
  for (const seg of BASE_TRAILS.segments.filter((s) => !s.hidden)) {
    const w = trailFillWidth(seg.usage);
    const fill = byId('trail-fill-pass', seg.id);
    assert.ok(fill.el === 'path' && fill.d === seg.d, 'the fill draws the segment d verbatim');
    assert.equal(fill.usage, seg.usage);
    assert.equal(fill.edges, 'library->cli');
    assert.equal(fill.strokeWidth, w);
    assert.equal(byId('trail-casing-pass', seg.id).strokeWidth, w + 2.5);
    assert.equal(byId('trail-shadow-pass', seg.id).strokeWidth, w + 5);
  }
});

test('a spur (usage 1) fill is dash-marked; a trunk (usage ≥ 2) is solid — from usage, never authored', () => {
  const layer = buildTrails(mkInput({ trails: MERGE_TRAILS }));
  const fills = children(mustByKind(layer, 'trail-fill-pass'));
  const spurs = fills.filter((p) => p.spur === true);
  const trunks = fills.filter((p) => p.spur === undefined);
  assert.ok(spurs.length > 0 && trunks.length > 0, 'the merge fixture emerges both spurs and a trunk');
  for (const p of spurs) assert.equal(p.usage, 1);
  for (const p of trunks) assert.ok((p.usage ?? 0) >= 2, 'an unmarked fill is a trunk');
  // the merged trunk carries BOTH edge keys through data-edges.
  assert.ok(trunks.some((p) => (p.edges ?? '').split(',').sort().join(',') === 'a->c,b->c'));
  // the mark is a FILL concern only — shadow + casing stay solid under a dashed spur.
  for (const pass of ['trail-shadow-pass', 'trail-casing-pass'] as const) {
    for (const p of children(mustByKind(layer, pass))) assert.equal(p.spur, undefined);
  }
});

test('trail-edges is non-visual per-edge reveal metadata: data-from/to, title, the ordered F/R chain', () => {
  const meta = mustByKind(buildTrails(mkInput()), 'trail-edges');
  const edges = children(meta);
  assert.equal(edges.length, BASE_TRAILS.edges.length);
  const edge = edges[0]!;
  const src = BASE_TRAILS.edges[0]!;
  assert.ok(edge.el === 'g' && children(edge).length === 0, 'metadata only — no drawables');
  assert.equal(edge.kind, 'trail-edge');
  assert.equal(edge.from, src.from);
  assert.equal(edge.to, src.to);
  assert.equal(edge.title, 'cli depends on library');
  assert.equal(
    edge.segments,
    src.segments.map((r) => `${r.id}:${r.reversed ? 'R' : 'F'}`).join(','),
  );
  assert.ok((edge.segments ?? '').length > 0, 'the chain names at least one segment');
});

test('hidden under-island runs land ONLY in the ghost pass', () => {
  const layer = buildTrails(mkInput({ trails: CAVE_TRAILS }));
  const hidden = CAVE_TRAILS.segments.filter((s) => s.hidden);
  assert.ok(hidden.length > 0, 'the walled-in fixture forces hidden runs');
  const ghosts = children(mustByKind(layer, 'trail-ghost-pass'));
  assert.deepEqual(ghosts.map((p) => p.id).sort(), hidden.map((s) => s.id).sort());
  assert.ok(ghosts.every((p) => p.el === 'path' && p.kind === 'trail-ghost'));
  const hiddenIds = new Set(hidden.map((s) => s.id));
  for (const pass of ['trail-shadow-pass', 'trail-casing-pass', 'trail-fill-pass'] as const) {
    for (const p of children(mustByKind(layer, pass))) {
      assert.ok(!hiddenIds.has(p.id ?? ''), `${pass} never draws a hidden segment`);
    }
  }
});

test('cave portals are PROPS above the flora: arch + rim + apron at the rim bearing, status-folded', () => {
  const cave0 = CAVE_TRAILS.caves[0]!;
  const scene = buildScene(
    mkInput({
      trails: CAVE_TRAILS,
      territories: [mkTerritory({ id: cave0.islandId, status: 'unhealthy' })],
    }),
  );
  const flora = mustByKind(scene, 'flora-layer');
  const caves = children(flora).filter((c) => c.kind === 'cave');
  assert.equal(caves.length, CAVE_TRAILS.caves.length, 'one prop per portal');
  // appended AFTER the territories, so the arch occludes the trail disappearing under.
  const kinds = children(flora).map((c) => c.kind);
  assert.ok(kinds.lastIndexOf('territory') < kinds.indexOf('cave'));
  const cave = caves[0]!;
  assert.ok(cave.el === 'g');
  assert.equal(cave.island, cave0.islandId);
  assert.equal(cave.edges, cave0.edgeIds.join(','));
  // placed at the portal point, rotated to the outward bearing.
  const deg = (cave0.bearing * 180) / Math.PI;
  assert.equal(
    cave.transform,
    `translate(${cave0.x.toFixed(1)} ${cave0.y.toFixed(1)}) rotate(${deg.toFixed(1)})`,
  );
  // the folded island status keys the mapper's shadow/side-wall hue family; a wall
  // island with no territory wears the neutral fallback.
  for (const c of caves) {
    assert.equal(c.status, c.island === cave0.islandId ? 'unhealthy' : 'unknown');
  }
  // the dark flat-bottomed arch, its lit rim arc, and the trampled apron — sized 1.6×
  // from the portal's trail width.
  assert.ok(firstByKind(cave, 'cave-arch'));
  assert.equal(mustByKind(cave, 'cave-rim').strokeWidth, 1.5);
  const apron = mustByKind(cave, 'cave-apron');
  const hw = (cave0.width * 1.6) / 2;
  assert.ok(apron.el === 'ellipse' && Math.abs(apron.rx - hw * 1.3) < 1e-9);
});

test('buildScene stays deterministic with trails + caves present (same input → byte-identical)', () => {
  assert.deepEqual(
    buildScene(mkInput({ trails: CAVE_TRAILS })),
    buildScene(mkInput({ trails: CAVE_TRAILS })),
  );
});

// ---------- the central tree ----------

test('a healthy tree has a full canopy: trunk + 5 low blobs + 3 highlights, no bare branches', () => {
  const t = buildTree(mkTerritory({ status: 'healthy', caps: 3 }));
  assert.equal(t.kind, 'tree');
  assert.equal(t.status, 'healthy');
  assert.ok(firstByKind(t, 'trunk'));
  assert.equal(children(mustByKind(t, 'crown-lo')).length, 5);
  assert.equal(children(mustByKind(t, 'crown-hi')).length, 3);
  assert.equal(firstByKind(t, 'bare'), null);
  assert.equal(allByKind(t, 'litter').length, 0);
  // the un-jittered central blob: cx 0, r = crownRadius(caps), cy = -1.65·R.
  const central = children(mustByKind(t, 'crown-lo'))[0];
  assert.ok(central && central.el === 'circle');
  const R = crownRadius(3);
  assert.equal(central.cx, 0);
  assert.equal(central.r, R);
  assert.ok(Math.abs(central.cy - -1.65 * R) < 1e-9);
});

test('an unhealthy tree withers: bare branches + leaf litter, a sparse crown, no full canopy', () => {
  const t = buildTree(mkTerritory({ status: 'unhealthy', caps: 3 }));
  assert.equal(children(mustByKind(t, 'crown-lo')).length, 2);
  assert.equal(children(mustByKind(t, 'crown-hi')).length, 1);
  assert.equal(mustByKind(t, 'crown-hi').opacity, 0.7);
  assert.equal(children(mustByKind(t, 'bare')).length, 4);
  assert.equal(allByKind(t, 'litter').length, 4);
});

test('proposed + claimed-but-empty stories render the not-yet-full (young) form', () => {
  const central = (t: SceneTerritoryInput): number => {
    const c = children(mustByKind(buildTree(t), 'crown-lo'))[0];
    assert.ok(c && c.el === 'circle');
    return c.r;
  };
  // proposed scales the crown to 0.62; a 0-cap healthy story wears the same small form.
  assert.ok(Math.abs(central(mkTerritory({ status: 'proposed', caps: 4 })) - crownRadius(4) * 0.62) < 1e-9);
  assert.ok(Math.abs(central(mkTerritory({ status: 'healthy', caps: 0 })) - crownRadius(0) * 0.62) < 1e-9);
  // a normal healthy story keeps the full crown.
  assert.equal(central(mkTerritory({ status: 'healthy', caps: 4 })), crownRadius(4));
});

test('the human-witness signpost appears only when declared; blank vs signed seal', () => {
  assert.equal(firstByKind(buildTree(mkTerritory()), 'sign-blank'), null);
  assert.ok(firstByKind(buildTree(mkTerritory({ signpost: { outcome: null } })), 'sign-blank'));
  assert.ok(firstByKind(buildTree(mkTerritory({ signpost: { outcome: 'pass' } })), 'sign-pass'));
  assert.ok(firstByKind(buildTree(mkTerritory({ signpost: { outcome: 'fail' } })), 'sign-fail'));
});

// ---------- flora ----------

test('a plant picks its variant from its id and is alive by default', () => {
  const p = buildPlant({ id: 'x#cap', status: 'healthy', x: 0, y: 0, title: 't' });
  assert.equal(p.kind, 'flora');
  // carries its capability id — the hook each mapper keys interactivity on.
  assert.equal(p.id, 'x#cap');
  assert.equal(firstByKind(p, 'dead-ground'), null);
  // shadow is the wider living size (rx 8), not the dead size (rx 6).
  const shadow = mustByKind(p, 'shadow');
  assert.ok(shadow.el === 'ellipse' && shadow.rx === 8);
});

test('an unhealthy plant withers: a dead-ground patch, the narrower dead shadow, dead silhouette', () => {
  const p = buildPlant({ id: 'x#cap', status: 'unhealthy', x: 0, y: 0, title: 't' });
  assert.ok(firstByKind(p, 'dead-ground'));
  const shadow = mustByKind(p, 'shadow');
  assert.ok(shadow.el === 'ellipse' && shadow.rx === 6);
  // a withered plant shows a dead silhouette (twig or dead stem), never living foliage.
  assert.equal(firstByKind(p, 'flora-light'), null);
  assert.ok(firstByKind(p, 'flora-dead-twig') || firstByKind(p, 'flora-dead-stem'));
});

test('a plant bloom rides the plant; a crown bloom rides the tree (spark counts differ)', () => {
  const withBloom: ScenePlantInput = { id: 'x#cap', status: 'healthy', x: 0, y: 0, title: 't', bloom: { ageRatio: 1, outcome: 'pass' } };
  const p = buildPlant(withBloom);
  const plantBloom = mustByKind(p, 'bloom-plant');
  assert.equal(allByKind(plantBloom, 'bloom-spark').length, 3);

  const t = buildTree(mkTerritory({ bloom: { ageRatio: 0.5, outcome: 'pass' } }));
  const crownBloom = mustByKind(t, 'bloom-crown');
  assert.equal(allByKind(crownBloom, 'bloom-spark').length, 4);
  assert.ok(firstByKind(crownBloom, 'bloom-ring'));
  // the anchor folds the age into opacity: 0.3 + 0.65·ageRatio.
  const anchor = mustByKind(t, 'bloom-anchor');
  assert.equal(anchor.opacity, Number((0.3 + 0.65 * 0.5).toFixed(2)));
});

test('buildBloom is pure / id-seeded — same args → identical, different unit → different sparks', () => {
  const args = ['u1', { ageRatio: 1, outcome: 'pass' as const }, 0, -40, 28, 'crown' as const] as const;
  assert.deepEqual(buildBloom(...args), buildBloom(...args));
  assert.notDeepEqual(buildBloom('u1', { ageRatio: 1, outcome: 'pass' }, 0, 0, 8, 'plant'), buildBloom('u2', { ageRatio: 1, outcome: 'pass' }, 0, 0, 8, 'plant'));
});

// ---------- conifer decor ----------

test('a conifer is a leaning body + snow cap, its colour band from the seed', () => {
  const c = buildConifer(10, 20, 8, 5);
  assert.equal(c.kind, 'conifer');
  const body = mustByKind(c, 'conifer-body');
  assert.equal(body.variant, 5 % 3);
  assert.ok(firstByKind(c, 'conifer-snow'));
});

test('decor seeds expand to 2 + (seed % 2) conifers each', () => {
  const even = buildScene(mkInput({ territories: [mkTerritory({ decor: [{ x: 0, y: 0, seed: 4 }], plants: [] })] }));
  const odd = buildScene(mkInput({ territories: [mkTerritory({ decor: [{ x: 0, y: 0, seed: 5 }], plants: [] })] }));
  assert.equal(allByKind(mustByKind(even, 'flora-layer'), 'conifer').length, 2); // 2 + 0
  assert.equal(allByKind(mustByKind(odd, 'flora-layer'), 'conifer').length, 3); // 2 + 1
});

// ---------- the territory flora group ----------

test('a territory flora group y-sorts its drawables and carries the nameplate', () => {
  const flora = buildScene(mkInput()).children.find((c) => c.kind === 'flora-layer');
  assert.ok(flora && flora.el === 'g');
  const terr = children(flora)[0];
  assert.ok(terr && terr.kind === 'territory' && terr.el === 'g');
  assert.equal(terr.id, 'library');
  // nameplate present with the surface-folded text + box.
  const plate = mustByKind(terr, 'plate');
  const idText = mustByKind(plate, 'plate-id');
  assert.ok(idText.el === 'text' && idText.text === 'library');
  const bg = mustByKind(plate, 'plate-bg');
  assert.ok(bg.el === 'rect' && bg.width === 120 && bg.rx === 7);
});

test('a territory with in-flight builds carries a wisp orbit; none → no wisps', () => {
  const withWisp = buildScene(mkInput({ territories: [mkTerritory({ wisps: [{ runId: 'r1', title: 'building' }] })] }));
  const orbit = mustByKind(withWisp, 'wisps');
  const wisp = mustByKind(orbit, 'wisp');
  assert.equal(typeof wisp.phase, 'number');
  assert.ok(firstByKind(wisp, 'wisp-glow') && firstByKind(wisp, 'wisp-dot') && firstByKind(wisp, 'wisp-hit'));

  const noWisp = buildScene(mkInput()); // mkTerritory default has no wisps
  assert.equal(firstByKind(mustByKind(noWisp, 'flora-layer'), 'wisps'), null);
});

// ---------- the phase-resolved wisp band (ADR-0048 §3 v2) ----------

test('the wisp folds the live gate phase → a red/green band (location ⟂ form: phase is the rotation)', () => {
  const wispFor = (phase?: 'AUTHOR_TEST' | 'CONFIRM_RED' | 'IMPLEMENT' | 'CONFIRM_GREEN' | 'GATE') => {
    const scene = buildScene(
      mkInput({
        territories: [mkTerritory({ wisps: [{ runId: 'r1', title: 'building', ...(phase ? { phase } : {}) }] })],
      }),
    );
    return mustByKind(scene, 'wisp');
  };

  // red while authoring the test / confirming the red.
  assert.equal(wispFor('AUTHOR_TEST').phaseBand, 'red');
  assert.equal(wispFor('CONFIRM_RED').phaseBand, 'red');
  // green on the green observation + the gate.
  assert.equal(wispFor('CONFIRM_GREEN').phaseBand, 'green');
  assert.equal(wispFor('GATE').phaseBand, 'green');
  // IMPLEMENT (writing the source) and an absent phase are the neutral teal "building" band.
  assert.equal(wispFor('IMPLEMENT').phaseBand, 'building');
  assert.equal(wispFor(undefined).phaseBand, 'building');

  // location ⟂ form: the orbit ROTATION `phase` (a number, seeded from the runId) is UNCHANGED by
  // the build phase — the band is a separate, additive field.
  assert.equal(wispFor('GATE').phase, wispFor('CONFIRM_RED').phase);
  assert.equal(typeof wispFor('GATE').phase, 'number');
});

// ---------- the story-CLAIM wisp + the §5 honesty wall (ADR-0138) ----------

test('a territory with a claim carries a DISTINCT claim-wisp orbit (key-seeded); none → no claim wisps', () => {
  const withClaim = buildScene(
    mkInput({
      territories: [
        mkTerritory({ claims: [{ key: 's1', title: 'a session is here', colourState: 'authoring' }] }),
      ],
    }),
  );
  const orbit = mustByKind(withClaim, 'claim-wisps');
  const wisp = mustByKind(orbit, 'claim-wisp');
  // the claim wisp carries its subagent colour-state (form) and a key-seeded orbit rotation (geometry).
  assert.equal(wisp.colourState, 'authoring');
  assert.equal(typeof wisp.phase, 'number');
  // its OWN drawable family — distinct circles, never the build-wisp kinds.
  assert.ok(firstByKind(wisp, 'claim-wisp-glow') && firstByKind(wisp, 'claim-wisp-dot') && firstByKind(wisp, 'claim-wisp-hit'));

  const noClaim = buildScene(mkInput()); // mkTerritory default has no claims
  assert.equal(firstByKind(mustByKind(noClaim, 'flora-layer'), 'claim-wisps'), null);
});

test('each claim intent → its colour-state on the claim wisp (authoring / proving / supplementing)', () => {
  const claimFor = (colourState: 'authoring' | 'proving' | 'supplementing') => {
    const scene = buildScene(
      mkInput({ territories: [mkTerritory({ claims: [{ key: 'k', title: 't', colourState }] })] }),
    );
    return mustByKind(scene, 'claim-wisp');
  };
  assert.equal(claimFor('authoring').colourState, 'authoring');
  assert.equal(claimFor('proving').colourState, 'proving');
  assert.equal(claimFor('supplementing').colourState, 'supplementing');
});

test('§5 honesty wall: a claim wisp is NEVER a bloom — no bloom/outcome token anywhere on the claim layer', () => {
  // A claim in EVERY colour-state, including the at-risk "proving" (the in-flight hue that must NOT
  // read as the proven-green bloom): the claim layer must emit no bloom drawable and no `outcome`.
  for (const colourState of ['authoring', 'proving', 'supplementing'] as const) {
    const scene = buildScene(
      mkInput({ territories: [mkTerritory({ claims: [{ key: 'k', title: 't', colourState }] })] }),
    );
    const orbit = mustByKind(scene, 'claim-wisps');
    // no bloom drawable family on the claim orbit …
    for (const bloomKind of ['bloom-anchor', 'bloom-crown', 'bloom-plant', 'bloom-ring', 'bloom-spark']) {
      assert.equal(firstByKind(orbit, bloomKind), null, `claim orbit must carry no ${bloomKind}`);
    }
    // … and no node under it carries a verdict `outcome` (the bloom's hue driver).
    const walk = (n: SceneNode): void => {
      assert.equal(n.outcome, undefined, 'a claim-layer node must never carry a verdict outcome');
      for (const c of children(n)) walk(c);
    };
    walk(orbit);
  }
});

test('a BUILD wisp can carry the live subagent colourState (ADR-0138 §5) — additive to phaseBand, absent by default', () => {
  // back-compat: no colourState stamped → the wisp has none (the phaseBand look is unchanged).
  const plain = buildScene(mkInput({ territories: [mkTerritory({ wisps: [{ runId: 'r', title: 'b' }] })] }));
  assert.equal(mustByKind(plain, 'wisp').colourState, undefined);
  // stamped → the build wisp carries the role tint ALONGSIDE its red→green band.
  const tinted = buildScene(
    mkInput({ territories: [mkTerritory({ wisps: [{ runId: 'r', title: 'b', phase: 'CONFIRM_RED', colourState: 'proving' }] })] }),
  );
  const wisp = mustByKind(tinted, 'wisp');
  assert.equal(wisp.colourState, 'proving');
  assert.equal(wisp.phaseBand, 'red'); // the band still folds from the gate phase, unchanged
});

test('buildScene stays deterministic with a claim layer present (same input → byte-identical)', () => {
  const withClaims = (): SceneInput =>
    mkInput({ territories: [mkTerritory({ claims: [{ key: 's1', title: 't', colourState: 'proving' }] })] });
  assert.deepEqual(buildScene(withClaims()), buildScene(withClaims()));
});
