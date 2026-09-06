// shipped-shadow-scale-scene.test.ts — the page's ARMS and its NUMBERS, held without a browser: the
// arms vary exactly the lever they claim, each ladder rides the shipped picks of the other two, the
// control is the map as it shipped after PR #1841 / #1845 (typed as history), the shipped arm is a
// rung of every ladder, the levers reach the FIELD the way they claim (the pool narrows the soft
// band, the width narrows the full band, the depth touches only the material), the luma reader is
// honest, and the builder constructs no scene of its own.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CONTACT_SPREAD, CONTACT_SPREAD_RUNGS } from '../src/contact-shade.js';
import { GROUND_TOKENS, SHIPPED_SHADOW_DEPTH } from '../src/ForestWorldCanvas.js';
import { TREE_SHADOW_WIDTH, TREE_SHADOW_WIDTH_RUNGS } from '../src/ground-casters.js';
import { profileMaxWidth } from '../src/land-shadow.js';
import { atlasCoverage } from '../src/shadow-atlas.js';
import { SHADOW_DEPTH, SHADOW_DEPTH_SCALE_BACK_RUNGS, SHADOW_EDGE, deepestAdmissibleRung } from '../src/shadow-rung.js';
import { groundSanity } from './ground-sanity.js';
import {
  DEPTH_ARMS,
  DEPTH_LADDER,
  LUMA_BINS,
  POOL_ARMS,
  POOL_LADDER,
  SCALE_ARMS,
  SCALE_CONTROL_ARM,
  SCALE_PICTURES,
  SCALE_SHIPPED_ARM,
  TODAY_PICKS,
  WIDTH_ARMS,
  WIDTH_LADDER,
  depthArmId,
  depthMargins,
  derivedDepth,
  fieldKey,
  landLuma,
  poolArmId,
  sameScaleArm,
  scaleArmCaption,
  scaleArmCasters,
  scaleArmDepth,
  scaleArmGroundBuild,
  scaleArmSpec,
  scaleArmsFor,
  scaleNeighbourArm,
  scalePicture,
  scalePictureStatus,
  widthArmId,
  type ScaleArmSpec,
} from './shipped-shadow-scale-scene.js';
import { SPACING_EVIDENCE_DIR, validateManifest, type SpacingArm, type SpacingSceneFile } from './shipped-spacing-scene.js';
import { shippedLayoutArm } from './shipped-wheat-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENES = join(HERE, '..', '..', '..', 'docs', 'research', SPACING_EVIDENCE_DIR, 'scenes');

groundSanity();

/** The committed shipped layout — only the mono pictures are built here, so it is read once for the
 *  seam and never rendered. */
function shippedLayout(): SpacingArm {
  const manifest = validateManifest(JSON.parse(readFileSync(join(SCENES, 'manifest.json'), 'utf8')));
  const arms: SpacingArm[] = manifest.arms.map((record) => ({
    record,
    file: JSON.parse(readFileSync(join(SCENES, record.file), 'utf8')) as SpacingSceneFile,
  }));
  return shippedLayoutArm(arms, manifest.shippedRatio);
}

const LAYOUT = shippedLayout();

const strip = (a: ScaleArmSpec): Omit<ScaleArmSpec, 'id' | 'ladder'> => {
  const { id, ladder, ...rest } = a;
  void id;
  void ladder;
  return rest;
};

test('the arms: the control first, the pool ladder, the width ladder, the depth ladder, the shipped arm last — each ladder varying ONE lever against the shipped picks of the other two', () => {
  assert.equal(SCALE_ARMS[0]!.id, SCALE_CONTROL_ARM);
  assert.equal(SCALE_ARMS[SCALE_ARMS.length - 1]!.id, SCALE_SHIPPED_ARM);
  assert.deepEqual(POOL_ARMS, POOL_LADDER.map(poolArmId));
  assert.deepEqual(WIDTH_ARMS, WIDTH_LADDER.map(widthArmId));
  assert.deepEqual(DEPTH_ARMS, [depthArmId(derivedDepth()), ...DEPTH_LADDER.map(depthArmId)]);
  assert.deepEqual([...POOL_LADDER], [...CONTACT_SPREAD_RUNGS]);
  assert.deepEqual([...WIDTH_LADDER], [...TREE_SHADOW_WIDTH_RUNGS]);
  assert.deepEqual([...DEPTH_LADDER], [...SHADOW_DEPTH_SCALE_BACK_RUNGS]);
  // The control: the map after PR #1841 / #1845, typed as history.
  assert.deepEqual(TODAY_PICKS, { pool: 1, width: 1, depth: 0.55 });
  assert.deepEqual(scaleArmSpec(SCALE_CONTROL_ARM), { id: SCALE_CONTROL_ARM, ladder: 'control', ...TODAY_PICKS });
  const shipped = scaleArmSpec(SCALE_SHIPPED_ARM);
  for (const id of POOL_ARMS) assert.deepEqual(strip(scaleArmSpec(id)), { ...strip(shipped), pool: Number(id.slice('pool-'.length)) });
  for (const id of WIDTH_ARMS) assert.deepEqual(strip(scaleArmSpec(id)), { ...strip(shipped), width: Number(id.slice('width-'.length)) });
  assert.deepEqual(strip(scaleArmSpec(DEPTH_ARMS[0]!)), { ...strip(shipped), depth: null });
  for (const id of DEPTH_ARMS.slice(1)) {
    const s = scaleArmSpec(id);
    assert.deepEqual(strip(s), { ...strip(shipped), depth: s.depth });
    assert.equal(Math.round((s.depth ?? 0) * 100), Number(id.slice('depth-'.length)));
  }
  // The ladders descend: smaller pool, narrower cone, DEEPER rung (listed lightest first).
  for (let i = 1; i < POOL_LADDER.length; i += 1) assert.ok(POOL_LADDER[i]! < POOL_LADDER[i - 1]!);
  for (let i = 1; i < WIDTH_LADDER.length; i += 1) assert.ok(WIDTH_LADDER[i]! < WIDTH_LADDER[i - 1]!);
  for (let i = 1; i < DEPTH_LADDER.length; i += 1) assert.ok(DEPTH_LADDER[i]! < DEPTH_LADDER[i - 1]!);
  assert.ok(DEPTH_LADDER[0]! < derivedDepth());
  assert.equal(POOL_LADDER[0], TODAY_PICKS.pool, 'the pool ladder starts at the pool as it shipped');
  assert.equal(WIDTH_LADDER[0], TODAY_PICKS.width, 'the width ladder starts at the cone as it shipped');
  assert.equal(DEPTH_LADDER[DEPTH_LADDER.length - 1], TODAY_PICKS.depth, 'the depth ladder ends at the depth as it shipped');
  for (const a of SCALE_ARMS) assert.ok(scaleArmCaption(a.id).length > 20, `${a.id} has no caption`);
  assert.ok(scaleArmCaption(SCALE_CONTROL_ARM).includes('(CONTROL'));
  assert.ok(scaleArmCaption(SCALE_SHIPPED_ARM).endsWith('(SHIPS)'));
  assert.ok(scaleArmCaption(poolArmId(0)).includes('no contact pool'));
  assert.throws(() => scaleArmSpec('nope'), /no arm/);
});

test('⚠⚠ THE SHIPPED ARM IS A RUNG OF EVERY LADDER — read off the source constants, and coinciding with one arm of EACH ladder; it is not the control', () => {
  const s = scaleArmSpec(SCALE_SHIPPED_ARM);
  assert.equal(s.pool, CONTACT_SPREAD);
  assert.equal(s.width, TREE_SHADOW_WIDTH);
  assert.equal(s.depth, SHADOW_DEPTH);
  const twins = SCALE_ARMS.filter((a) => a.id !== SCALE_SHIPPED_ARM && sameScaleArm(a, s)).map((a) => a.id);
  assert.ok(twins.some((id) => POOL_ARMS.includes(id)), `no pool rung is the shipped arm (${twins})`);
  assert.ok(twins.some((id) => WIDTH_ARMS.includes(id)), `no width rung is the shipped arm (${twins})`);
  assert.ok(twins.some((id) => DEPTH_ARMS.includes(id)), `no depth rung is the shipped arm (${twins})`);
  assert.ok(twins.includes(poolArmId(CONTACT_SPREAD)));
  assert.ok(twins.includes(widthArmId(TREE_SHADOW_WIDTH)));
  assert.ok(twins.includes(depthArmId(SHADOW_DEPTH)));
  assert.equal(sameScaleArm(scaleArmSpec(SCALE_CONTROL_ARM), s), false, 'the shipped arm is the control — nothing was scaled back');
  // sameScaleArm reads the derived rung for a null depth.
  assert.equal(sameScaleArm(scaleArmSpec(DEPTH_ARMS[0]!), { ...s, depth: derivedDepth() }), true);
  assert.equal(sameScaleArm(scaleArmSpec(DEPTH_ARMS[0]!), { ...s, depth: 0.45 }), false);
  // And every pick is a SCALE-BACK from the control: smaller pool, narrower cone, lighter depth.
  assert.ok(s.pool < TODAY_PICKS.pool);
  assert.ok(s.width < TODAY_PICKS.width);
  assert.ok((s.depth ?? 0) > TODAY_PICKS.depth);
});

test('neighbours: each rung steps up its own ladder; the control, the shipped arm and each ladder’s first rung have none — so "vs neighbour" isolates one lever', () => {
  assert.equal(scaleNeighbourArm(SCALE_CONTROL_ARM), null);
  assert.equal(scaleNeighbourArm(SCALE_SHIPPED_ARM), null);
  assert.equal(scaleNeighbourArm(POOL_ARMS[0]!), null);
  assert.equal(scaleNeighbourArm(POOL_ARMS[1]!), POOL_ARMS[0]);
  assert.equal(scaleNeighbourArm(WIDTH_ARMS[0]!), null);
  assert.equal(scaleNeighbourArm(WIDTH_ARMS[2]!), WIDTH_ARMS[1]);
  assert.equal(scaleNeighbourArm(DEPTH_ARMS[0]!), null);
  assert.equal(scaleNeighbourArm(DEPTH_ARMS[3]!), DEPTH_ARMS[2]);
});

test('the pictures: the green and the yellow mono islands carry every arm; the forest carries the control and the shipped arm', () => {
  assert.deepEqual(SCALE_PICTURES.map((p) => p.id), ['green', 'yellow', 'forest']);
  assert.deepEqual([...scaleArmsFor('green')], SCALE_ARMS.map((a) => a.id));
  assert.deepEqual([...scaleArmsFor('yellow')], SCALE_ARMS.map((a) => a.id));
  assert.deepEqual([...scaleArmsFor('forest')], [SCALE_CONTROL_ARM, SCALE_SHIPPED_ARM]);
  assert.equal(scalePicture('green').zoom, 8);
  assert.equal(scalePicture('forest').zoom, 'fit');
  assert.throws(() => scalePicture('nope' as never), /no picture/);
  // The yellow island wears an in-progress status, the green the healthy one — the wheat page's own.
  assert.notEqual(scalePictureStatus('green'), scalePictureStatus('yellow'));
  assert.equal(scalePictureStatus('green'), 'healthy');
});

test('the depth: the shipped deep tokens at this arm’s rung with the shipped edge; the derived rung names NO deep token; the control wears its typed 0.55 on the same tokens', () => {
  assert.deepEqual(scaleArmDepth(SCALE_SHIPPED_ARM), SHIPPED_SHADOW_DEPTH);
  assert.deepEqual(scaleArmDepth(SCALE_CONTROL_ARM), { deep: 0.55, deepTokens: SHIPPED_SHADOW_DEPTH.deepTokens, edge: SHADOW_EDGE });
  assert.deepEqual(scaleArmDepth(DEPTH_ARMS[0]!), { deep: SHADOW_DEPTH, deepTokens: [], edge: SHADOW_EDGE });
  assert.deepEqual(scaleArmDepth(depthArmId(0.7)), { deep: 0.7, deepTokens: SHIPPED_SHADOW_DEPTH.deepTokens, edge: SHADOW_EDGE });
  assert.equal(derivedDepth(), deepestAdmissibleRung(GROUND_TOKENS));
  assert.equal(derivedDepth(), 0.78);
  const rows = depthMargins(GROUND_TOKENS);
  assert.equal(rows.length, new Set(GROUND_TOKENS).size * (1 + DEPTH_LADDER.length));
  const green = (level: number): number => rows.find((r) => r.token === '#8cb85e' && r.level === level)!.margin;
  assert.ok(green(derivedDepth()) > 0);
  assert.ok(green(0.55) < 0, 'the negative margin is what the report exists to print');
  assert.ok(green(0.62) > green(0.55) && green(0.7) > green(0.62), 'lighter is a larger margin');
});

test('⚠⚠ THE LEVERS REACH THE FIELD THE WAY THEY CLAIM, on the green island: the pool narrows the soft band and never the full one; the width narrows the full band; the depth arms share the shipped field', () => {
  const field = (arm: string) => scaleArmGroundBuild(arm, 'green', LAYOUT).build.field!;
  // The field keys: the depth arms share the shipped field; every pool and width rung has its own.
  const shipped = scaleArmSpec(SCALE_SHIPPED_ARM);
  for (const id of DEPTH_ARMS) assert.equal(fieldKey(scaleArmSpec(id), 'green'), fieldKey(shipped, 'green'));
  assert.notEqual(fieldKey(scaleArmSpec(SCALE_CONTROL_ARM), 'green'), fieldKey(shipped, 'green'));
  assert.equal(fieldKey(shipped, 'green'), `green|${CONTACT_SPREAD}|${TREE_SHADOW_WIDTH}`);
  assert.notEqual(fieldKey(shipped, 'green'), fieldKey(shipped, 'yellow'));
  // The pool ladder: soft occupancy falls, full occupancy holds.
  let lastSoft = Infinity;
  const fullAtPool0 = atlasCoverage(field(POOL_ARMS[0]!), 0.5);
  for (const id of POOL_ARMS) {
    const f = field(id);
    const soft = atlasCoverage(f, 0.25) - atlasCoverage(f, 0.5);
    assert.ok(soft < lastSoft, `${id}: soft ${soft} vs ${lastSoft}`);
    assert.equal(atlasCoverage(f, 0.5), fullAtPool0, `${id} moved the full band`);
    lastSoft = soft;
  }
  // No pool at all: the soft band is the cast term's own penumbra and nothing else — narrower than
  // every pooled rung, and not zero (the edge is soft).
  assert.ok(lastSoft > 0);
  // The width ladder: full occupancy falls as the cone narrows.
  let lastFull = Infinity;
  for (const id of WIDTH_ARMS) {
    const full = atlasCoverage(field(id), 0.5);
    assert.ok(full < lastFull, `${id}: full ${full} vs ${lastFull}`);
    lastFull = full;
  }
  // The casters are the SAME list on every arm but for the trees' silhouettes: same count, same
  // positions, same radii (the pool's size), the tree profiles narrowed.
  const control = scaleArmCasters(SCALE_CONTROL_ARM, 'green', LAYOUT);
  const narrow = scaleArmCasters(widthArmId(0.5), 'green', LAYOUT);
  assert.equal(control.length, narrow.length);
  assert.ok(control.length > 20);
  let trees = 0;
  for (const [i, c] of control.entries()) {
    const n = narrow[i]!;
    assert.deepEqual([c.x, c.z, c.radius, c.height, c.pool], [n.x, n.z, n.radius, n.height, n.pool]);
    if (c.profile !== undefined && n.profile !== undefined && profileMaxWidth(c.profile) !== profileMaxWidth(n.profile)) {
      trees += 1;
      assert.ok(Math.abs(profileMaxWidth(n.profile) - 0.5 * profileMaxWidth(c.profile)) < 1e-12);
    }
  }
  assert.ok(trees > 0, 'no tree was narrowed');
  // The shipped arm's ground build IS the memo the shipped field key points at.
  assert.equal(scaleArmGroundBuild(SCALE_SHIPPED_ARM, 'green', LAYOUT), scaleArmGroundBuild(depthArmId(0.7), 'green', LAYOUT));
});

test('landLuma reads every land pixel and nothing of the background: percentiles, ratio and bins', () => {
  const bg: readonly [number, number, number] = [16, 20, 24];
  const px = (r: number, g: number, b: number): number[] => [r, g, b, 255];
  const frame = new Uint8ClampedArray([px(...bg), px(...bg), px(0, 0, 0), px(255, 255, 255), px(100, 100, 100)].flat());
  const l = landLuma(frame, bg);
  assert.equal(l.count, 3);
  assert.equal(l.p05, 0);
  assert.equal(l.p50, 100);
  assert.equal(l.p95, 255);
  assert.equal(l.ratio, 0);
  assert.equal(l.bins.length, LUMA_BINS);
  assert.ok(Math.abs(l.bins.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.ok(Math.abs(l.bins[0]! - 1 / 3) < 1e-12 && Math.abs(l.bins[6]! - 1 / 3) < 1e-12 && Math.abs(l.bins[15]! - 1 / 3) < 1e-12);
  const empty = landLuma(new Uint8ClampedArray([...px(...bg)]), bg);
  assert.deepEqual([empty.count, empty.p05, empty.ratio], [0, 0, 0]);
  assert.ok(empty.bins.every((b) => b === 0));
});

test('the page adopts nothing of its own: the shipped builders, the picks read off the source, no scene of its own', () => {
  const page = readFileSync(join(HERE, 'shipped-shadow-scale-scene.ts'), 'utf8');
  assert.ok(page.includes('shippedGroundBuild('), 'the ground is the shipped builder');
  assert.ok(page.includes('buildGroundMaterial('), 'the material is the shipped builder');
  assert.ok(!page.includes('CellGroundGeometryInput'), 'no geometry input of its own');
  assert.ok(page.includes('CONTACT_SPREAD') && page.includes('TREE_SHADOW_WIDTH') && page.includes('SHADOW_DEPTH'), 'the picks are read, not restated');
  assert.ok(page.includes('SHADOW_PENUMBRA') && page.includes('SHADOW_CONTACT_BAND'), 'the levers this page does NOT vary are the shipped ones');
});
