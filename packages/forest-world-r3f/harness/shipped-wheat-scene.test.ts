// shipped-wheat-scene.test.ts — the page's ARMS and its NUMBERS, held without a browser: the arms
// vary exactly the anchor, the control is the map as it shipped (no wheat, the green alone deep),
// the shipped arm is a rung of the ladder, the green picture is a proof of no change, and the
// canvas's wheat constants are what the source says they are.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  GRASS_GATE_ROWS,
  PAINTED_STATUS_GATE,
  SHIPPED_GRASS_MIX,
  SHIPPED_SHADOW_DEPTH,
  SHIPPED_WHEAT,
  SHIPPED_WHEAT_ANCHOR,
  SHIPPED_WHEAT_LIFT,
  SHIPPED_WHEAT_MIX,
  WHEAT_GATE_ROWS,
} from '../src/ForestWorldCanvas.js';
import { GRASS_STATUS_GATE } from '../src/land-grass.js';
import { GRASS_TOKEN_REFERENCE, WHEAT_ANCHORS, WHEAT_LIFTS, WHEAT_STATUS_GATE } from '../src/land-wheat.js';
import { SHADOW_DEPTH, SHADOW_EDGE } from '../src/shadow-rung.js';
import { separationOf } from './ground-cover.js';
import { groundSanity } from './ground-sanity.js';
import { SHIPPED_GROUND_COLOUR } from './shipped-baseline.js';
import {
  CONTROL_ARM,
  LADDER_ARMS,
  SHIPPED_ARM,
  TODAY_SHADOW_DEPTH,
  WHEAT_ARMS,
  WHEAT_PICTURES,
  armCaption,
  armDepth,
  armSpec,
  armWheat,
  armsFor,
  islandStatusMix,
  monoCasters,
  monoStream,
  neighbourArm,
  pictureStatus,
  sameArm,
  shippedLayoutArm,
  wheatArmId,
} from './shipped-wheat-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

groundSanity();

// ---------------------------------------------------------------- the canvas's constants

test('the wheat gate resolves to the two yellow ROWS, disjoint from the grass`s, through the canvas`s own row order', () => {
  const rows = [...SHIPPED_GROUND_COLOUR.keys()];
  assert.deepEqual([...WHEAT_GATE_ROWS], WHEAT_STATUS_GATE.map((s) => rows.indexOf(s)));
  assert.deepEqual([...WHEAT_GATE_ROWS], [2, 3]);
  for (const row of WHEAT_GATE_ROWS) assert.ok(!GRASS_GATE_ROWS.includes(row));
  // Both rows are ONE authored token — the wheat paints one colour for one state.
  assert.equal(SHIPPED_GROUND_COLOUR.get('building'), SHIPPED_GROUND_COLOUR.get('proposed'));
  // Derived from the gate in the source, never a literal row list.
  const src = source('../src/ForestWorldCanvas.tsx');
  assert.match(src, /WHEAT_GATE_ROWS: readonly number\[\] = WHEAT_STATUS_GATE\.map\(groundRowOf\)/);
});

test('the shipped wheat is one rung of the ladder, at the grass`s strength, on the wheat rows — and never 1.0', () => {
  assert.ok(WHEAT_ANCHORS.some((a) => a.hex === SHIPPED_WHEAT_ANCHOR), 'the pick is not a rung of the ladder');
  assert.equal(SHIPPED_WHEAT_MIX, SHIPPED_GRASS_MIX, 'the treatment transfers at one strength');
  assert.ok(SHIPPED_WHEAT_MIX < 1, 'ADR-0490 D5: modulate, never replace');
  assert.deepEqual(SHIPPED_WHEAT, { mix: SHIPPED_WHEAT_MIX, rows: WHEAT_GATE_ROWS, anchor: SHIPPED_WHEAT_ANCHOR, lift: SHIPPED_WHEAT_LIFT });
  // The lift is a rung of the paleness ladder, at or above the derivation.
  assert.ok(WHEAT_LIFTS.some((l) => l.lift === SHIPPED_WHEAT_LIFT), 'the lift is not a rung of the paleness ladder');
  assert.ok(SHIPPED_WHEAT_LIFT >= 1);
  // The green reference the ramps are stated against IS the shipped healthy token.
  assert.equal(GRASS_TOKEN_REFERENCE, SHIPPED_GROUND_COLOUR.get('healthy'));
});

test('the shadow`s depth follows the PAINTED gate — the green and the yellow deep, every other token at the derived rung', () => {
  assert.deepEqual([...PAINTED_STATUS_GATE], [...GRASS_STATUS_GATE, ...WHEAT_STATUS_GATE]);
  assert.deepEqual([...SHIPPED_SHADOW_DEPTH.deepTokens], PAINTED_STATUS_GATE.map((s) => SHIPPED_GROUND_COLOUR.get(s)!));
  assert.equal(SHIPPED_SHADOW_DEPTH.deep, SHADOW_DEPTH);
  assert.equal(SHIPPED_SHADOW_DEPTH.edge, SHADOW_EDGE);
  // The control's depth is what shipped BEFORE: the grass gate alone.
  assert.deepEqual([...TODAY_SHADOW_DEPTH.deepTokens], GRASS_STATUS_GATE.map((s) => SHIPPED_GROUND_COLOUR.get(s)!));
  assert.equal(TODAY_SHADOW_DEPTH.deep, SHADOW_DEPTH);
  assert.equal(TODAY_SHADOW_DEPTH.edge, SHADOW_EDGE);
  assert.ok(SHIPPED_SHADOW_DEPTH.deepTokens.length > TODAY_SHADOW_DEPTH.deepTokens.length);
});

test('the ladder ascends the 2026-08-27 instrument`s separation axis — nearest a proof state first, the mustard last', () => {
  // Re-derived on the CURRENT vocabulary rather than quoted from the table; `separationOf` is the
  // 2026-08-27 cover instrument, welcome here as an instrument (the arc's intent), never as a shape.
  const seps = WHEAT_ANCHORS.map((a) => separationOf(a.hex).distance);
  for (let i = 1; i < seps.length; i += 1) {
    assert.ok(seps[i]! >= seps[i - 1]! - 1e-9, `${WHEAT_ANCHORS[i]!.id} (${seps[i]}) sits nearer a proof state than ${WHEAT_ANCHORS[i - 1]!.id} (${seps[i - 1]})`);
  }
  // And the mustard buys well over the straw's — the 1.8x the intent quotes, on today's vocabulary.
  assert.ok(seps[seps.length - 1]! > seps[0]! * 1.5, `mustard ${seps[3]} vs straw ${seps[0]}`);
});

// ---------------------------------------------------------------- the arms

test('the arms: the control first, one rung per anchor in ladder order, the shipped arm last — the anchor the only moving part', () => {
  assert.equal(WHEAT_ARMS[0]!.id, CONTROL_ARM);
  assert.equal(WHEAT_ARMS[WHEAT_ARMS.length - 1]!.id, SHIPPED_ARM);
  assert.deepEqual(LADDER_ARMS, WHEAT_ANCHORS.map((a) => wheatArmId(a.id)));
  assert.deepEqual(armSpec(CONTROL_ARM), { id: CONTROL_ARM, anchor: null, rung: null, lift: null });
  // Every rung wears the SHIPPED lift, held fixed — this ladder varies the anchor and nothing else.
  for (const a of WHEAT_ANCHORS) assert.deepEqual(armSpec(wheatArmId(a.id)), { id: wheatArmId(a.id), anchor: a.hex, rung: a.id, lift: SHIPPED_WHEAT_LIFT });
  const shipped = armSpec(SHIPPED_ARM);
  assert.equal(shipped.anchor, SHIPPED_WHEAT_ANCHOR);
  const twins = LADDER_ARMS.filter((id) => sameArm(armSpec(id), shipped));
  assert.equal(twins.length, 1, `the shipped arm coincides with ${twins.length} rungs`);
  assert.equal(shipped.rung, armSpec(twins[0]!).rung);
  assert.throws(() => armSpec('wheat-gold'), /no arm "wheat-gold"/);
  for (const a of WHEAT_ARMS) assert.ok(armCaption(a.id).length > 40, `${a.id} has no caption`);
  assert.ok(armCaption(CONTROL_ARM).endsWith('(CONTROL)'));
  assert.ok(armCaption(SHIPPED_ARM).endsWith('(SHIPS)'));
  assert.ok(armCaption(wheatArmId('mustard')).includes('#b0b040'));
  assert.ok(armCaption(wheatArmId('mustard')).includes(`lifted ${SHIPPED_WHEAT_LIFT.toFixed(2)}`), 'the caption names the lift the rung wears');
  // `sameArm` compares BOTH ladders' levers: an arm at another lift is not the same picture.
  assert.ok(!sameArm(shipped, { ...shipped, lift: shipped.lift! + 0.5 }));
});

test('armWheat: null on the control, the SHIPPED rows and factor on every rung — only the anchor differs', () => {
  assert.equal(armWheat(CONTROL_ARM), null);
  for (const id of [...LADDER_ARMS, SHIPPED_ARM]) {
    const w = armWheat(id);
    assert.ok(w !== null);
    assert.equal(w.mix, SHIPPED_WHEAT_MIX);
    assert.deepEqual([...w.rows], [...WHEAT_GATE_ROWS]);
    assert.equal(w.anchor, armSpec(id).anchor);
    assert.equal(w.lift, SHIPPED_WHEAT_LIFT, `${id} does not wear the shipped lift`);
  }
  assert.deepEqual(armWheat(SHIPPED_ARM), SHIPPED_WHEAT);
});

test('armDepth: the control wears the pre-landing depth, every wheat arm the shipped one', () => {
  assert.deepEqual(armDepth(CONTROL_ARM), TODAY_SHADOW_DEPTH);
  for (const id of [...LADDER_ARMS, SHIPPED_ARM]) assert.deepEqual(armDepth(id), SHIPPED_SHADOW_DEPTH);
});

test('neighbourArm isolates ONE step of the anchor: none for the control and the first rung, the rung below otherwise', () => {
  assert.equal(neighbourArm(CONTROL_ARM), null);
  assert.equal(neighbourArm(LADDER_ARMS[0]!), null);
  for (let i = 1; i < LADDER_ARMS.length; i += 1) assert.equal(neighbourArm(LADDER_ARMS[i]!), LADDER_ARMS[i - 1]!);
  // The shipped twin's neighbour is its rung's.
  const twin = LADDER_ARMS.find((id) => sameArm(armSpec(id), armSpec(SHIPPED_ARM)))!;
  assert.equal(neighbourArm(SHIPPED_ARM), neighbourArm(twin));
});

// ---------------------------------------------------------------- the pictures

test('three pictures: the green proof carries control and shipped only; the yellow and the forest carry the whole ladder', () => {
  assert.deepEqual(WHEAT_PICTURES.map((p) => p.id), ['green', 'yellow', 'forest']);
  assert.deepEqual([...armsFor('green')], [CONTROL_ARM, SHIPPED_ARM]);
  assert.deepEqual([...armsFor('yellow')], WHEAT_ARMS.map((a) => a.id));
  assert.deepEqual([...armsFor('forest')], WHEAT_ARMS.map((a) => a.id));
  assert.equal(pictureStatus('green'), 'healthy');
  assert.equal(pictureStatus('yellow'), 'proposed');
  assert.throws(() => pictureStatus('forest'), /real map/);
  assert.equal(WHEAT_PICTURES[0]!.zoom, 8);
  assert.equal(WHEAT_PICTURES[2]!.zoom, 'fit');
});

test('the mono stream re-stamps EVERY parcel with the picture`s status, and a proposed island stands no bloom', () => {
  const green = monoStream('healthy');
  const yellow = monoStream('proposed');
  const cells = (s: readonly { kind: string; material?: string | undefined }[]) => s.filter((d) => d.kind === 'cell-ground');
  assert.ok(cells(green).length > 0);
  assert.equal(cells(green).length, cells(yellow).length, 'the same island');
  assert.ok(cells(yellow).every((d) => d.material === 'proposed'));
  assert.ok(cells(green).every((d) => d.material === 'healthy'));
  assert.ok(green.some((d) => d.kind === 'uat-bloom'), 'the green island keeps its blooms');
  assert.ok(!yellow.some((d) => d.kind === 'uat-bloom'), 'a proposed island has signed nothing');
  assert.ok(yellow.some((d) => d.kind === 'trail-strip'), 'the strips dock on both');
  // Casters: the same island stands its trees on both; the yellow stands NO cover (the cover grows
  // on healthy islands only), so it casts fewer.
  assert.ok(monoCasters('green').length > monoCasters('yellow').length);
  assert.ok(monoCasters('yellow').length > 0, 'the yellow island still stands its trees');
});

test('islandStatusMix counts ISLANDS, one status each, off the cell-ground descriptors', () => {
  const mix = islandStatusMix([
    { kind: 'cell-ground', group: 'cell-ground', transform: { x: 0, y: 0, z: 0 }, island: 'a', material: 'healthy' },
    { kind: 'cell-ground', group: 'cell-ground', transform: { x: 0, y: 0, z: 0 }, island: 'a', material: 'healthy' },
    { kind: 'cell-ground', group: 'cell-ground', transform: { x: 0, y: 0, z: 0 }, island: 'b', material: 'proposed' },
    { kind: 'uat-bloom', group: 'uat-bloom', transform: { x: 0, y: 0, z: 0 }, island: 'c', material: 'healthy' },
  ]);
  assert.deepEqual(mix, { healthy: 1, proposed: 1 });
});

test('shippedLayoutArm picks the export whose ratio IS the shipped ratio, and refuses when none does', () => {
  const arm = (id: string, ratio: number | undefined) => ({ record: { id, spacing: ratio === undefined ? { legacy: { rankGap: 1, islandGap: 1, rankSwing: 1 } } : { ratio } } }) as never;
  const arms = [arm('today', undefined), arm('spacing-0.5', 0.5), arm('spacing-0', 0)];
  assert.equal((shippedLayoutArm(arms, 0) as { record: { id: string } }).record.id, 'spacing-0');
  assert.throws(() => shippedLayoutArm(arms, 0.3), /no exported layout carries the shipped ratio 0.3/);
});

// ---------------------------------------------------------------- the page reads the shipped builder

test('the page builds every arm through the SHIPPED builder, handing it this arm`s wheat and depth and nothing else', () => {
  const page = source('shipped-wheat-scene.ts');
  assert.ok(page.includes('buildGroundMaterial(build.field, SHIPPED_GRASS, build.shore(), SHIPPED_SAND_MIX, extras, depth, wheat)'));
  // The wheat and depth are the TABLE's, resolved once per scene — the paleness page shares this.
  assert.ok(page.includes('const wheat = table.wheat(arm);'));
  assert.ok(page.includes('groundMesh(timed.build, wheat, table.depth(arm))'));
  assert.ok(page.includes('groundMesh(build, wheat, table.depth(arm))'));
  assert.equal([...page.matchAll(/buildGroundMaterial\(/g)].length, 1, 'one material call, shared by every picture');
  assert.ok(page.includes('shippedGroundBuild('), 'the mono ground is the canvas`s own build');
  // The canvas's CellGround still passes no wheat of its own — the default IS the shipped wheat.
  const canvas = source('../src/ForestWorldCanvas.tsx');
  assert.match(canvas, /buildGroundMaterial\(field, SHIPPED_GRASS, shore\(\), SHIPPED_SAND_MIX, extras\)/);
  assert.match(canvas, /wheat: GroundWheatLayer \| null = SHIPPED_WHEAT,/);
});
