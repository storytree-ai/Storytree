// The scene-graph's inner-loop dogfood (ADR-0093 / ADR-0020): the framework-agnostic
// drawable tree is DETERMINISTIC (same input → byte-identical scene), selects the
// right drawables per folded status, and lays out the canonical structure. The
// studio's VISUAL PARITY is operator-attested (ADR-0070), not asserted here — these
// tests pin the geometry + structure the mapper renders FROM.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { crownRadius } from './sizing.js';
import {
  buildScene,
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
    roads: [{ from: 'library', to: 'cli', d: 'M 0 0 L 1 1', title: 'cli depends on library' }],
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
    ['empties-layer', 'coast-layer', 'ground-mesh', 'roads-layer', 'flora-layer', 'hits-layer'],
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

test('roads carry data-from / data-to + a title; empties + hits are one per input', () => {
  const scene = buildScene(mkInput());
  const road = mustByKind(scene, 'road');
  assert.equal(road.from, 'library');
  assert.equal(road.to, 'cli');
  assert.equal(road.title, 'cli depends on library');
  assert.ok(firstByKind(road, 'road-line'));
  assert.equal(allByKind(mustByKind(scene, 'empties-layer'), 'empty').length, 2);
  assert.equal(allByKind(mustByKind(scene, 'hits-layer'), 'hit').length, 2);
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
