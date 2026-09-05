// shipped-cast-shadow-scene.test.ts — the page's ARMS and its NUMBERS, held without a browser:
// the arms vary exactly the lever they claim, the control is the map as it shipped, the shipped
// arm is a rung of every ladder, and the builder constructs no scene of its own.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { GROUND_TOKENS, SHIPPED_SHADOW_DEPTH } from '../src/ForestWorldCanvas.js';
import { COVER_CASTS } from '../src/ground-casters.js';
import { RENDER_ELEV_DEG, isDressingRole } from '../src/kit-vocabulary.js';
import { LAND_AREA_PER_CAPABILITY } from '../src/land-per-capability.js';
import { SHADOW_PENUMBRA, SHADOW_PENUMBRA_RUNGS } from '../src/land-shadow.js';
import { SHADOW_DEPTH, SHADOW_DEPTH_RUNGS, SHADOW_EDGE, deepestAdmissibleRung } from '../src/shadow-rung.js';
import { groundSanity } from './ground-sanity.js';
import { orientedCamera } from './shipped-crowd-scene.js';
import { cameraAgreement, cameraElevationDeg } from './shipped-land-ratio-scene.js';
import {
  CAST_SHADOW_ARMS,
  CAST_SHADOW_PICTURES,
  LUMA_BINS,
  CONTROL_ARM,
  DEPTH_ARMS,
  DEPTH_LADDER,
  EDGE_ARMS,
  EDGE_LADDER,
  SHAPE_ARMS,
  SHIPPED_ARM,
  armCaption,
  armCasters,
  armDepth,
  armSpec,
  armsFor,
  asCylinders,
  casterCounts,
  contactBandFor,
  depthArmId,
  depthMargins,
  derivedDepth,
  edgeArmId,
  fieldKey,
  greenLuma,
  neighbourArm,
  picture,
  picturePlacements,
  sameArm,
  zoomFor,
  type CastShadowArmSpec,
} from './shipped-cast-shadow-scene.js';
import { SHADOW_CONTACT_BAND } from '../src/contact-shade.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

const ONE = picture('one');

groundSanity();

test('⚠⚠ every arm is judged from the signed 50° — read off frameWorld through the crowd camera, never typed here', () => {
  assert.deepEqual(cameraAgreement(), []);
  assert.ok(Math.abs(cameraElevationDeg(orientedCamera({ x: 0, z: 0 }, 8)) - RENDER_ELEV_DEG) < 1e-9);
});

test('the arms: the control first, then the shape ladder, the edge ladder, the depth ladder, the shipped arm last — each ladder varying ONE lever against the shipped picks of the other two', () => {
  assert.equal(CAST_SHADOW_ARMS[0]!.id, CONTROL_ARM);
  assert.equal(CAST_SHADOW_ARMS[CAST_SHADOW_ARMS.length - 1]!.id, SHIPPED_ARM);
  assert.deepEqual(SHAPE_ARMS, ['shape-cylinder', 'shape-cone', 'shape-cover']);
  assert.deepEqual(EDGE_ARMS, EDGE_LADDER.map(edgeArmId));
  assert.deepEqual(DEPTH_ARMS, [depthArmId(derivedDepth()), ...DEPTH_LADDER.map(depthArmId)]);
  assert.deepEqual([...EDGE_LADDER], [...SHADOW_PENUMBRA_RUNGS]);
  assert.deepEqual([...DEPTH_LADDER], [...SHADOW_DEPTH_RUNGS]);
  // The control: cylinders, no cover, hard edge, derived rung — the map as it shipped.
  assert.deepEqual(armSpec(CONTROL_ARM), { id: CONTROL_ARM, ladder: 'control', profiles: false, cover: false, penumbra: 1.2, edge: 'hard', depth: null });
  const shipped = armSpec(SHIPPED_ARM);
  const strip = (a: CastShadowArmSpec): Omit<CastShadowArmSpec, 'id' | 'ladder'> => {
    const { id, ladder, ...rest } = a;
    void id;
    void ladder;
    return rest;
  };
  // Shape: cylinder → cone adds the profiles; cone → cover adds the cover; everything else shipped.
  assert.deepEqual(strip(armSpec('shape-cylinder')), { ...strip(shipped), profiles: false, cover: false });
  assert.deepEqual(strip(armSpec('shape-cone')), { ...strip(shipped), profiles: true, cover: false });
  assert.deepEqual(strip(armSpec('shape-cover')), { ...strip(shipped), profiles: true, cover: true });
  // Edge: only the penumbra moves, soft on every rung.
  for (const id of EDGE_ARMS) {
    assert.deepEqual(strip(armSpec(id)), { ...strip(shipped), penumbra: Number(id.slice('edge-'.length)), edge: 'soft' });
  }
  // Depth: only the rung moves; the first rung is the derived one (`null`).
  assert.deepEqual(strip(armSpec(DEPTH_ARMS[0]!)), { ...strip(shipped), depth: null });
  for (const id of DEPTH_ARMS.slice(1)) {
    const s = armSpec(id);
    assert.deepEqual(strip(s), { ...strip(shipped), depth: s.depth });
    assert.equal(Math.round((s.depth ?? 0) * 100), Number(id.slice('depth-'.length)));
  }
  // The rungs descend / widen.
  for (let i = 1; i < DEPTH_LADDER.length; i += 1) assert.ok(DEPTH_LADDER[i]! < DEPTH_LADDER[i - 1]!);
  assert.ok(DEPTH_LADDER[0]! < derivedDepth());
  for (let i = 1; i < EDGE_LADDER.length; i += 1) assert.ok(EDGE_LADDER[i]! > EDGE_LADDER[i - 1]!);
  for (const a of CAST_SHADOW_ARMS) assert.ok(armCaption(a.id).length > 20, `${a.id} has no caption`);
  assert.ok(armCaption(CONTROL_ARM).endsWith('(CONTROL)'));
  assert.ok(armCaption(SHIPPED_ARM).endsWith('(SHIPS)'));
  assert.ok(armCaption(CONTROL_ARM).includes('contact pools at the full rung'));
});

test('⚠⚠ THE SHIPPED ARM IS A RUNG OF EVERY LADDER — read off the source constants, and coinciding with one arm of EACH ladder', () => {
  const s = armSpec(SHIPPED_ARM);
  assert.equal(s.profiles, true, 'the silhouettes are what ships');
  assert.equal(s.cover, COVER_CASTS);
  assert.equal(s.penumbra, SHADOW_PENUMBRA);
  assert.equal(s.edge, SHADOW_EDGE);
  assert.equal(s.depth, SHADOW_DEPTH);
  const twins = CAST_SHADOW_ARMS.filter((a) => a.id !== SHIPPED_ARM && sameArm(a, s)).map((a) => a.id);
  assert.ok(twins.some((id) => SHAPE_ARMS.includes(id)), `no shape rung is the shipped arm (${twins})`);
  assert.ok(twins.some((id) => EDGE_ARMS.includes(id)), `no edge rung is the shipped arm (${twins})`);
  assert.ok(twins.some((id) => DEPTH_ARMS.includes(id)), `no depth rung is the shipped arm (${twins})`);
  assert.ok(twins.includes(depthArmId(SHADOW_DEPTH)));
  // sameArm reads the derived rung for a null depth.
  assert.equal(sameArm(armSpec(DEPTH_ARMS[0]!), { ...s, depth: derivedDepth() }), true);
  assert.equal(sameArm(armSpec(DEPTH_ARMS[0]!), { ...s, depth: 0.45 }), false);
  assert.equal(sameArm(armSpec(CONTROL_ARM), s), false);
});

test('the derived rung is DERIVED over the shipped ground’s own tokens (0.78 with the skirt’s rock rows, not the six-status 0.77) — and the margins table carries every distinct token at every rung, negative where it is negative', () => {
  assert.equal(derivedDepth(), deepestAdmissibleRung(GROUND_TOKENS));
  assert.equal(derivedDepth(), 0.78);
  assert.ok(derivedDepth() > SHADOW_DEPTH, 'the shipped depth is not below the derived rung');
  const rows = depthMargins(GROUND_TOKENS);
  // Every DISTINCT token × (the derived rung + the ladder) — the yellow's two statuses share one hex.
  assert.equal(rows.length, new Set(GROUND_TOKENS).size * (1 + DEPTH_LADDER.length));
  assert.ok(depthMargins(['#8cb85e', '#d8c069', '#d8c069']).length === 2 * (1 + DEPTH_LADDER.length));
  const green = (level: number): number => rows.find((r) => r.token === '#8cb85e' && r.level === level)!.margin;
  assert.ok(green(derivedDepth()) > 0);
  assert.ok(green(0.55) < 0, 'the negative margin is what the report exists to print');
  assert.ok(green(0.45) < green(0.55));
});

test('neighbours: each rung steps up its own ladder and the first rung of each ladder, the control and the shipped arm have none — so "vs neighbour" isolates one lever', () => {
  assert.equal(neighbourArm(CONTROL_ARM), null);
  assert.equal(neighbourArm(SHIPPED_ARM), null);
  assert.equal(neighbourArm('shape-cylinder'), null);
  assert.equal(neighbourArm('shape-cone'), 'shape-cylinder');
  assert.equal(neighbourArm('shape-cover'), 'shape-cone');
  assert.equal(neighbourArm(EDGE_ARMS[0]!), null);
  assert.equal(neighbourArm(EDGE_ARMS[1]!), EDGE_ARMS[0]);
  assert.equal(neighbourArm(DEPTH_ARMS[0]!), null);
  assert.equal(neighbourArm(DEPTH_ARMS[2]!), DEPTH_ARMS[1]);
});

test('WHAT CASTS: the same placements on every arm; the control casts cylinders from the scene roles alone; the cover arm casts from everything; the field key is the casters and the penumbra', () => {
  const placements = picturePlacements(ONE);
  assert.ok(placements.length > 0);
  const cover = placements.filter((p) => isDressingRole(p.role)).length;
  const scene = placements.length - cover;
  assert.ok(cover > 0 && scene > 0, 'the fixture stands no cover or no trees');
  const control = armCasters(CONTROL_ARM, ONE);
  const cone = armCasters('shape-cone', ONE);
  const all = armCasters('shape-cover', ONE);
  assert.equal(control.length, cone.length);
  assert.equal(all.length, control.length + cover);
  assert.ok(control.every((c) => c.profile === undefined), 'the control is not cylinders');
  assert.ok(cone.every((c) => c.profile !== undefined), 'the cone arm has a profiled caster missing');
  assert.deepEqual(asCylinders(cone), control, 'the control is not the cone arm with its profiles stripped');
  // The counts under the picture say the same.
  assert.deepEqual(casterCounts(CONTROL_ARM, ONE), { casters: control.length, scene, cover: 0, placements: placements.length });
  assert.deepEqual(casterCounts('shape-cover', ONE), { casters: all.length, scene, cover, placements: placements.length });
  // Field keys: the depth arms share the shipped field; the edge arms each have their own; the
  // control's differs from shape-cylinder's ONLY in the contact band.
  const shippedKey = fieldKey(armSpec(SHIPPED_ARM), 'one');
  for (const id of DEPTH_ARMS) assert.equal(fieldKey(armSpec(id), 'one'), shippedKey);
  assert.equal(new Set(EDGE_ARMS.map((id) => fieldKey(armSpec(id), 'one'))).size, EDGE_ARMS.length);
  assert.notEqual(fieldKey(armSpec(CONTROL_ARM), 'one'), shippedKey);
  assert.equal(contactBandFor(armSpec(CONTROL_ARM)), 'full');
  assert.equal(contactBandFor(armSpec('shape-cylinder')), SHADOW_CONTACT_BAND);
  // The control's field is the old width at the full band; the cylinder arm's the shipped width at
  // the shipped band — same casters, so the keys differ in exactly those two.
  assert.equal(fieldKey(armSpec(CONTROL_ARM), 'one'), 'one|false|false|1.2|full');
  assert.equal(fieldKey(armSpec('shape-cylinder'), 'one'), `one|false|false|${SHADOW_PENUMBRA}|${SHADOW_CONTACT_BAND}`);
});

test('the material each arm is built with: the control passes NULL (the one-rung material); the others name the shipped deep tokens only when they carry a depth', () => {
  assert.equal(armDepth(CONTROL_ARM), null);
  assert.deepEqual(armDepth('shape-cone'), SHIPPED_SHADOW_DEPTH);
  assert.deepEqual(armDepth(edgeArmId(0.6)), { deep: SHADOW_DEPTH, deepTokens: SHIPPED_SHADOW_DEPTH.deepTokens, edge: 'soft' });
  assert.deepEqual(armDepth(DEPTH_ARMS[0]!), { deep: SHADOW_DEPTH, deepTokens: [], edge: SHADOW_EDGE });
  assert.deepEqual(armDepth(depthArmId(0.45)), { deep: 0.45, deepTokens: SHIPPED_SHADOW_DEPTH.deepTokens, edge: SHADOW_EDGE });
  assert.deepEqual(armDepth(SHIPPED_ARM), SHIPPED_SHADOW_DEPTH);
  assert.ok(SHIPPED_SHADOW_DEPTH.deepTokens.length > 0, 'nothing wears the depth');
});

test('the pictures: one island at the read zoom on every arm, the forest fitted on the control and the shipped arm; the island is the ratio’s', () => {
  assert.equal(zoomFor('one'), 8);
  assert.equal(zoomFor('forest'), 'fit');
  assert.deepEqual([...armsFor('one')], CAST_SHADOW_ARMS.map((a) => a.id));
  assert.deepEqual([...armsFor('forest')], [CONTROL_ARM, SHIPPED_ARM]);
  assert.equal(CAST_SHADOW_PICTURES.length, 2);
  // The crowd's base is the island as it ships — sized by the ratio, not the drawing.
  const control = armCasters(CONTROL_ARM, ONE);
  assert.ok(control.length > 0);
  assert.ok(LAND_AREA_PER_CAPABILITY > 0);
});

test('greenLuma reads the green pixels’ luma percentiles and the darkest/brightest ratio; a flat frame reads 1, a two-tone frame reads the ratio', () => {
  const px = (r: number, g: number, b: number): number[] => [r, g, b, 255];
  const flat = new Uint8ClampedArray([...px(100, 160, 80), ...px(100, 160, 80), ...px(0, 0, 0)]);
  const f = greenLuma(flat, [0, 0, 0]);
  assert.equal(f.count, 2);
  assert.equal(f.ratio, 1);
  assert.equal(f.bins.length, LUMA_BINS);
  assert.ok(Math.abs(f.bins.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'the histogram does not sum to one');
  // luma 0.3·100 + 0.59·160 + 0.11·80 = 133.2 → bin 8 of 16.
  assert.equal(f.bins[8], 1);
  const two = new Uint8ClampedArray([...px(100, 160, 80), ...px(50, 80, 40), ...px(200, 200, 200)]);
  const t = greenLuma(two, [0, 0, 0]);
  assert.equal(t.count, 2, 'a grey pixel counted as green');
  assert.ok(Math.abs(t.ratio - 0.5) < 1e-9);
  // Alpha-keyed background for the reference.
  const ref = new Uint8ClampedArray([...px(100, 160, 80), 0, 0, 0, 0]);
  assert.equal(greenLuma(ref, null).count, 1);
  assert.equal(greenLuma(new Uint8ClampedArray([]), null).ratio, 0);
});

test('the builder builds its ground with the SHIPPED builder and its material with the SHIPPED material, handed THIS arm’s casters, penumbra and depth — and constructs no scene of its own', () => {
  const page = source('shipped-cast-shadow-scene.ts');
  assert.ok(/shippedGroundBuild\(\n?\s*stream\.filter/.test(page));
  assert.ok(page.includes('spec.penumbra,'), 'the penumbra does not reach the builder');
  assert.ok(page.includes('buildGroundMaterial(build.field, SHIPPED_GRASS, build.shore(), SHIPPED_SAND_MIX, extras, armDepth(arm))'));
  assert.ok(!page.includes('clipToCoast('), 'the page clips its own coast');
  assert.ok(!page.includes('createBandedGroundMaterial('), 'the page composes its own material');
  assert.ok(!page.includes('buildAtlasOcclusion('), 'the page builds its own field');
});
