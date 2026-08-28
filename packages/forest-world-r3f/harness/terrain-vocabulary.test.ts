// terrain-vocabulary.test.ts — hold ADR-0461's vocabulary to what the decision actually says.
//
// The tests that matter here are the ones that can FAIL for a reason someone would otherwise
// discover in a render: the terrain count following STATES rather than colours, the
// colour-blind pair being separated by something, the names carrying no hue, and the GLSL
// agreeing with the TypeScript that generated it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBandedMaterial } from './banded-material.js';
import { grainFeaturePeriod } from './land-grain.js';
import { STATUS_TOKENS } from './palette-band.js';

/** The green the other tests use as a neutral token — the terrain, not the colour, is what
 *  these assertions are about. */
const HEALTHY = STATUS_TOKENS.get('healthy')!.top[0]!;
import {
  TERRAINS,
  TERRAIN_STATES,
  colourBlindPairs,
  terrainFeature,
  terrainNamed,
  terrainOf,
  terrainWarp,
  terrainWarpGlsl,
} from './terrain-vocabulary.js';

test('⚠ the vocabulary has one terrain per STATE — six, not five', () => {
  // ADR-0461 D4: "count the terrains by STATE, never by COLOUR … an increment scoped off the
  // colour count will author one treatment too few and will not notice." This is the assertion
  // that notices.
  assert.equal(TERRAINS.length, 6);
  assert.equal(TERRAIN_STATES.length, 6);
  for (const s of TERRAIN_STATES) assert.ok(terrainOf(s), `state ${s} has no terrain`);
  const names = new Set(TERRAINS.map((t) => t.name));
  assert.equal(names.size, 6, 'no two states may share a terrain name');
});

test('⚠ FIVE colours over six states — the vocabulary really does carry a colour-blind pair', () => {
  // NON-VACUITY for the test below. If the palette ever separated proposed and building, the
  // colour-blind pair would vanish and "terrain separates them" would become unfalsifiable
  // while still passing. This asserts the premise is live.
  const tokens = new Set(TERRAINS.map((t) => t.token));
  assert.equal(tokens.size, 5, 'ADR-0462: five colours over six states');
  const pairs = colourBlindPairs();
  assert.equal(pairs.length, 1, 'exactly one pair shares a colour today');
  const states = [pairs[0]!.a.state, pairs[0]!.b.state].sort();
  assert.deepEqual(states, ['building', 'proposed']);
});

test('⚠⚠ the colour-blind pair is separated by the TERRAIN, since nothing else can', () => {
  // The load-bearing one. Once two states share a hue, colour cannot tell them apart at all —
  // so if their warps were also equal the map would be unable to distinguish two states it is
  // committed to drawing, and would do it silently.
  for (const { a, b } of colourBlindPairs()) {
    assert.equal(a.token, b.token, 'premise: same colour');
    const differs = a.stretch !== b.stretch || a.bearing !== b.bearing || a.lattice !== b.lattice;
    assert.ok(differs, `${a.name} and ${b.name} share a colour AND a warp — nothing separates them`);
    // And not merely different — different by enough to be a different LAND. A 5% lattice
    // difference would satisfy the line above and be invisible at any zoom.
    const fa = terrainFeature(a, grainFeaturePeriod());
    const fb = terrainFeature(b, grainFeaturePeriod());
    const ratio = Math.max(fa.across / fb.across, fb.across / fa.across);
    assert.ok(ratio >= 3, `${a.name}/${b.name} feature scales are only ${ratio.toFixed(2)}x apart`);
  }
});

test('names carry no hue (ADR-0461 D2 — role, not position)', () => {
  const hues = /green|yellow|black|grey|gray|brown|blue|red|white|slate|amber|gold/i;
  for (const t of TERRAINS) {
    assert.doesNotMatch(t.name, hues, `terrain '${t.name}' names a colour — D2 forbids it`);
  }
});

test('every token is an authored status token — a terrain invents no colour', () => {
  // The land's colour is a capability's status (ADR-0392 D5 / ADR-0398 D7). A terrain adds a
  // channel; it may not quietly add a sixth colour to the vocabulary.
  const authored = new Set([...STATUS_TOKENS.values()].map((f) => f.top[0]!));
  for (const t of TERRAINS) {
    assert.ok(authored.has(t.token), `terrain '${t.name}' wears ${t.token}, which no status owns`);
    assert.equal(t.token, STATUS_TOKENS.get(t.state)!.top[0], `${t.name} must wear its own state's token`);
  }
});

test('all six mappings are the owner’s, and the row still says which three he originated', () => {
  // ADR-0461 D5 left "which terrain maps to which state beyond the three the owner named"
  // undecided, and the other three carried `proposed-here` until he answered on 2026-08-28
  // ("All three are fine"). The vocabulary is now settled in full — so this asserts BOTH halves:
  // that nothing is still a guess, and that a later reader can still tell his three from the
  // three he accepted, without reading a commit message.
  const named = TERRAINS.filter((t) => t.provenance === 'owner-named').map((t) => t.name).sort();
  assert.deepEqual(named, ['forest', 'swamp', 'wheatfield']);
  const accepted = TERRAINS.filter((t) => t.provenance === 'owner-accepted').map((t) => t.name).sort();
  assert.deepEqual(accepted, ['fallow', 'heath', 'scree']);
  assert.equal(named.length + accepted.length, TERRAINS.length, 'every row must be settled');
  for (const t of TERRAINS) assert.ok(t.character.length > 20, `${t.name} must say what it IS`);
});

test('the delivered feature is 2.6x the lattice, not the lattice', () => {
  const base = grainFeaturePeriod();
  const forest = terrainNamed('forest')!;
  const f = terrainFeature(forest, base);
  assert.equal(f.across, base, 'an isotropic terrain at lattice 1 delivers the base grain');
  assert.equal(f.along, base, 'and delivers it equally in both directions');
  // NON-VACUITY: the ratio really is not 1 for the base grain, so `base` is not a lattice.
  assert.ok(base > 5, `grainFeaturePeriod is ${base}; if this is 2.5 someone passed the lattice`);
});

test('an anisotropic terrain is longer ALONG its bearing than across it', () => {
  const wheat = terrainNamed('wheatfield')!;
  const f = terrainFeature(wheat, grainFeaturePeriod());
  assert.ok(f.along > f.across * 3, 'wheatfield must actually read as rows');
});

test('⚠ the warp squeezes the SAMPLE, so a point along the bearing moves LESS in field space', () => {
  // The sign error this guards is the one that produces rows at ninety degrees to the authored
  // bearing — which looks deliberate, and is wrong.
  const t = terrainNamed('wheatfield')!;
  const d = 10;
  const along: readonly [number, number] = [Math.cos(t.bearing) * d, Math.sin(t.bearing) * d];
  const across: readonly [number, number] = [-Math.sin(t.bearing) * d, Math.cos(t.bearing) * d];
  const o = terrainWarp(t, 0, 0);
  const a = terrainWarp(t, along[0], along[1]);
  const b = terrainWarp(t, across[0], across[1]);
  const moved = (p: readonly [number, number]) => Math.hypot(p[0] - o[0], p[1] - o[1]);
  assert.ok(
    moved(a) < moved(b),
    `walking ALONG the bearing moved ${moved(a).toFixed(3)} in field space and ACROSS moved ` +
      `${moved(b).toFixed(3)} — the squeeze is inverted, and the rows will run crosswise`,
  );
});

test('the emitted GLSL carries the SAME constants as the TypeScript warp', () => {
  // The constants are interpolated into the shader from this module rather than hand-typed —
  // the same discipline `bandGlsl` and `grainGlsl` follow — so the two halves cannot drift on
  // the numbers that decide the look. This parses them back out and checks.
  for (const t of TERRAINS) {
    const src = terrainWarpGlsl(t);
    assert.match(src, /vec2 st_terrainWarp\(vec2 p\)/);
    assert.ok(src.includes(t.stretch.toFixed(6)), `${t.name}: stretch missing from its GLSL`);
    assert.ok(src.includes(t.lattice.toFixed(6)), `${t.name}: lattice missing from its GLSL`);
    assert.ok(src.includes(Math.cos(t.bearing).toFixed(6)), `${t.name}: bearing missing from its GLSL`);
    assert.ok(src.includes(t.name), `${t.name}: the generated source must say which terrain it is`);
  }
});

test('two terrains never emit the same warp source', () => {
  // If they did, two states would be drawn identically and every downstream measurement would
  // report "no difference" with the calm authority of a real one.
  const sources = TERRAINS.map((t) => terrainWarpGlsl(t).replace(/\/\/.*/g, ''));
  assert.equal(new Set(sources).size, TERRAINS.length, 'two terrains emit identical warp GLSL');
});

test('the isotropic terrains really are isotropic', () => {
  for (const name of ['forest', 'swamp', 'scree'] as const) {
    const t = terrainNamed(name)!;
    assert.equal(t.stretch, 1, `${name} is authored as an undirected land`);
  }
});

/* ── the material wiring ───────────────────────────────────────────────────────────────────
   A vocabulary that never reaches a fragment is a table, not a terrain. These are the
   assertions that say the warp actually arrives — and, just as importantly, that it does not
   arrive anywhere it was not asked for. ─────────────────────────────────────────────────── */

test('a material with NO terrain compiles the source it always did', () => {
  // The same argument the grain makes, for the same reason: a panel that predates the
  // vocabulary must deliver the pixels it always delivered, or every comparison against an
  // earlier pass silently becomes a comparison of two different renderers.
  const plain = createBandedMaterial({ token: HEALTHY, grain: { mode: 'normal' } });
  assert.doesNotMatch(plain.fragmentShader, /st_terrainWarp/);
  assert.match(plain.fragmentShader, /st_grainGradient\(vWorld\.xz\)/);
});

test('a terrain reaches the grain sample site', () => {
  const t = terrainNamed('wheatfield')!;
  const m = createBandedMaterial({ token: HEALTHY, grain: { mode: 'normal' }, terrain: t });
  assert.match(m.fragmentShader, /vec2 st_terrainWarp\(vec2 p\)/, 'the warp must be defined');
  assert.match(m.fragmentShader, /st_grainGradient\(st_terrainWarp\(vWorld\.xz\)\)/);
  assert.doesNotMatch(m.fragmentShader, /st_grainGradient\(vWorld\.xz\)/, 'the unwarped call must be gone');
});

test('⚠ a terrain reaches BOTH grain halves, never only one', () => {
  // A terrain that warped only the normal half would deliver a directional bump under an
  // undirected mottle — a picture that reads as a bug in the art rather than in the wiring,
  // and one nobody would think to look for in a shader.
  const t = terrainNamed('fallow')!;
  const m = createBandedMaterial({ token: HEALTHY, grain: { mode: 'both' }, terrain: t });
  assert.match(m.fragmentShader, /st_grainGradient\(st_terrainWarp\(vWorld\.xz\)\)/);
  assert.match(m.fragmentShader, /st_grainRamped\(st_terrainWarp\(vWorld\.xz\)\)/);
  assert.doesNotMatch(m.fragmentShader, /st_grain\w+\(vWorld\.xz\)/, 'no unwarped sample may survive');
});

test('terrainWithoutGrainIsInert: a terrain on an UNGRAINED material emits nothing', () => {
  // The terrain warps the grain's sample coordinate; with no grain there is nothing to warp.
  // Emitting a dead `st_terrainWarp` would be a reader's evidence that a terrain is active on
  // a panel that is drawing none.
  const m = createBandedMaterial({ token: HEALTHY, terrain: terrainNamed('swamp')! });
  assert.doesNotMatch(m.fragmentShader, /st_terrainWarp/);
});

test('⚠⚠ NON-VACUITY: the two colour-blind states compile DIFFERENT shaders', () => {
  // The whole vocabulary rests on this. If `proposed` and `building` compiled the same source
  // they would draw the same pixels, and every downstream measurement would report "no
  // difference" with the calm authority of a real measurement — the failure mode this arc has
  // met before (`self-comparison-invariance-suites-are-blind-by-construction`).
  const pair = colourBlindPairs()[0]!;
  const a = createBandedMaterial({ token: pair.a.token, grain: { mode: 'normal' }, terrain: pair.a });
  const b = createBandedMaterial({ token: pair.b.token, grain: { mode: 'normal' }, terrain: pair.b });
  assert.equal(pair.a.token, pair.b.token, 'premise: the tokens really are the same');
  assert.notEqual(a.fragmentShader, b.fragmentShader, 'same colour AND same shader — nothing separates them');
});

test('every terrain in the vocabulary compiles a distinct shader', () => {
  const sources = TERRAINS.map(
    (t) => createBandedMaterial({ token: t.token, grain: { mode: 'normal' }, terrain: t }).fragmentShader,
  );
  assert.equal(new Set(sources).size, TERRAINS.length);
});
