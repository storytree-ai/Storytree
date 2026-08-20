// flower-geometry.test.ts — the three UAT verdict forms, as solids.
//
// WHAT IS WORTH ASSERTING HERE. ADR-0226 D4 reads the verdict off the FORM, so the properties
// that matter are the ones a reader's eye uses: that the three shapes are genuinely different
// solids, that a bud is never given a bloom's posture, that a wilted head actually hangs, and
// that every colour a flower can emit is an authored palette entry. Everything else — vertex
// counts, exact radii — is implementation, and asserting it would only make the tests expensive
// to change without making the island any more honest.
//
// THE ONE SIZE ASSERTION IS LOAD-BEARING. There are two foreshortenings on this island and using
// the wrong one is SILENT: it made every plant 2.75x too tall and produced a perfectly plausible
// picture. So the recovery is asserted numerically rather than trusted to the variable's name.

import assert from 'node:assert/strict';
import test from 'node:test';

import { flowersFrom, type FlowerInstance } from './flower-descriptors.js';
import { flowerSpriteBudget, growFlower } from './flower-geometry.js';
import { islandScene, type CriterionState } from './island-fixture.js';
import { LIGHT_DIR_AUTHORED, MARKER_TOKENS, landTokens } from './palette-band.js';
import type { GeneratedMesh } from './mesh-kit.js';

/** `cos(20 deg)` — the SCENE's upright foreshortening, which is what a flower's own heights
 *  recover through. Written as the number rather than imported so a test that agreed with a
 *  broken helper could not pass. */
const UPRIGHT = Math.cos((20 * Math.PI) / 180);
/** `sin(20 deg)` — the GROUND flattening. The wrong one, kept here so the test can prove the
 *  difference is 2.75x rather than assert that a name was used. */
const GROUND = Math.sin((20 * Math.PI) / 180);

const ALL = (state: CriterionState): CriterionState[] => Array.from({ length: 10 }, () => state);

function flowers(state: CriterionState): FlowerInstance[] {
  return flowersFrom(islandScene({ criteriaStates: ALL(state) }));
}

function extent(mesh: GeneratedMesh): {
  minY: number;
  maxY: number;
  w: number;
  h: number;
  d: number;
} {
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < mesh.positions.length; i += 3) {
    minY = Math.min(minY, mesh.positions[i]!);
    maxY = Math.max(maxY, mesh.positions[i]!);
  }
  return { minY, maxY, w: mesh.bounds.w, h: mesh.bounds.h, d: mesh.bounds.d };
}

test('every colour a flower can emit is an AUTHORED palette token', () => {
  // The closed-palette fence (ADR-0380 D6 fence 3), checked at the source rather than only on
  // delivered pixels: a generator that invented a token would be caught here without a browser.
  const authored = new Set(landTokens());
  for (const state of ['proven', 'pending', 'failing'] as const) {
    for (const f of flowers(state)) {
      for (const token of growFlower(f, UPRIGHT).keys()) {
        assert.ok(authored.has(token), `${state}: ${token} is not an authored token`);
      }
    }
  }
});

test('the three forms are DIFFERENT SOLIDS, and each is the authored one', () => {
  const proven = growFlower(flowers('proven')[0]!, UPRIGHT);
  const pending = growFlower(flowers('pending')[0]!, UPRIGHT);
  const failing = growFlower(flowers('failing')[0]!, UPRIGHT);

  // PROVEN: petals and a golden centre, no bud.
  assert.ok(proven.has(MARKER_TOKENS.petalProven), 'a bloom has petals');
  assert.ok(proven.has(MARKER_TOKENS.centreProven), 'and a golden centre');
  assert.ok(!proven.has(MARKER_TOKENS.bud), 'a bloom is not also a bud');

  // PENDING: a bud, and NOTHING that could read as a bloom. This is the ADR-0045 honesty wall
  // as a property of the geometry: only a signed pass opens.
  assert.ok(pending.has(MARKER_TOKENS.bud), 'a pending flower is a closed bud');
  assert.ok(!pending.has(MARKER_TOKENS.petalProven), 'a bud has no petals');
  assert.ok(!pending.has(MARKER_TOKENS.petalFailing));
  assert.ok(!pending.has(MARKER_TOKENS.centreProven), 'and no centre to read as a bloom');

  // FAILING: petals, but the DESATURATED ones, and never the bloom's.
  assert.ok(failing.has(MARKER_TOKENS.petalFailing), 'a wilted head keeps petals');
  assert.ok(!failing.has(MARKER_TOKENS.petalProven), 'but never the bloom’s cream');
  assert.ok(failing.has(MARKER_TOKENS.centreFailing));

  // All three stand on a stalk with leaves — the parts that are not the verdict.
  for (const parts of [proven, pending, failing]) {
    assert.ok(parts.has(MARKER_TOKENS.stem));
    assert.ok(parts.has(MARKER_TOKENS.leaf));
  }
});

test('a BLOOM presents up-and-outward; a WILTED head hangs BELOW where the bloom’s sat', () => {
  // Same island, same criteria, same seeds — only the state differs, so any difference in where
  // the petals END UP is the wilt and nothing else. This is the silhouette claim ADR-0226 D4
  // rests on, asserted on geometry rather than on the colour that also happens to say it.
  const proven = flowers('proven');
  const failing = flowers('failing');
  const byId = new Map(proven.map((f) => [f.criterion, f]));

  for (const f of failing) {
    const up = byId.get(f.criterion)!;
    const wilted = extent(growFlower(f, UPRIGHT).get(MARKER_TOKENS.petalFailing)!);
    const bloom = extent(growFlower(up, UPRIGHT).get(MARKER_TOKENS.petalProven)!);
    assert.ok(
      wilted.maxY < bloom.maxY,
      `${f.criterion}: a wilted head must not reach as high as the bloom it replaced ` +
        `(${wilted.maxY.toFixed(2)} vs ${bloom.maxY.toFixed(2)})`,
    );
    // A bloom lies open: broader across than it is tall. A hanging head is the opposite shape.
    assert.ok(bloom.w > bloom.h * 1.5, 'a bloom is a disc, not a spike');
    assert.ok(
      wilted.h / wilted.w > bloom.h / bloom.w,
      'a wilted head is proportionally taller than the open bloom — it hangs',
    );
  }
});

test('a BUD stands upright on its stalk and is taller than it is wide', () => {
  // A bud that came out squat, or tilted like a bloom, would be a bloom's posture on a pending
  // criterion — the exact thing "a bud is never a bloom" forbids.
  for (const f of flowers('pending')) {
    const bud = extent(growFlower(f, UPRIGHT).get(MARKER_TOKENS.bud)!);
    assert.ok(bud.h > bud.w, `a teardrop is taller than it is broad (${bud.h} vs ${bud.w})`);
    // Revolved about the stalk, so it is as deep as it is wide to within rounding.
    assert.ok(Math.abs(bud.d - bud.w) < bud.w * 0.05, 'a lathe is round');
  }
});

test('the BLOOM FACES THE LIGHT — the tilt is derived from LIGHT_DIR, not chosen', () => {
  // The appearance call is a derivation, and this is what keeps it one: if someone moves the
  // authored light and the blooms do NOT turn with it, the constant has quietly become a taste
  // number that happens to have been right once.
  const f = flowers('proven')[0]!;
  const petals = growFlower(f, UPRIGHT).get(MARKER_TOKENS.petalProven)!;
  const { w, d } = extent(petals);
  // A disc tilted `t` off horizontal about the world x axis keeps its full width in x and
  // shortens in z by cos(t). `t` is the light's own y–z tilt.
  const t = Math.atan2(LIGHT_DIR_AUTHORED[2], LIGHT_DIR_AUTHORED[1]);
  assert.ok(t > 0.15 && t < 0.6, 'the authored light leans, so the bloom leans with it');
  const expected = Math.cos(t);
  assert.ok(
    Math.abs(d / w - expected) < 0.12,
    `the bloom's depth:width should be cos(light tilt) = ${expected.toFixed(3)}, got ${(d / w).toFixed(3)}`,
  );
});

test('HEIGHTS recover through the UPRIGHT foreshortening, not the GROUND one', () => {
  // The 2.75x error, made falsifiable. Both numbers are real foreshortenings on this island and
  // both produce a plausible flower; only one of them produces the RIGHT one.
  const f = flowers('proven')[0]!;
  const right = extent(growFlower(f, UPRIGHT).get(MARKER_TOKENS.stem)!);
  const wrong = extent(growFlower(f, GROUND).get(MARKER_TOKENS.stem)!);
  const ratio = wrong.h / right.h;
  // The tolerance is 3% rather than exact, and the reason is worth stating: a stalk's own RADIUS
  // is a horizontal span and does not rescale, so it adds a constant to both bounding heights and
  // pulls their ratio a little below the pure 2.75. What the assertion has to catch is the ORDER
  // of the error, and a swapped foreshortening is nowhere near 3% away from a correct one.
  assert.ok(
    Math.abs(ratio - UPRIGHT / GROUND) < 0.03 * (UPRIGHT / GROUND),
    `swapping the two foreshortenings must change the stalk by about ${(UPRIGHT / GROUND).toFixed(2)}x, got ${ratio.toFixed(2)}x`,
  );
  // And the right one is the drawn height divided by cos, which is a LONGER stalk than drawn —
  // never a shorter one.
  assert.ok(right.h > Math.abs(f.head.y) * f.scale);
});

test('normals are unit length — the banded material’s rungs depend on it', () => {
  // A banded material quantises `dot(n, light)` onto four rungs, so a normal that is off by a
  // few per cent does not shade slightly wrong: it moves a visible rung boundary, and that reads
  // as art rather than as a bug.
  for (const state of ['proven', 'pending', 'failing'] as const) {
    for (const [, mesh] of growFlower(flowers(state)[0]!, UPRIGHT)) {
      for (let i = 0; i < mesh.normals.length; i += 3) {
        const l = Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!);
        assert.ok(Math.abs(l - 1) < 1e-4, `${state}: normal length ${l}`);
      }
    }
  }
});

test('DETERMINISM: the same flower grows the same solid, byte for byte', () => {
  const f = flowers('proven')[3]!;
  const a = growFlower(f, UPRIGHT);
  const b = growFlower(f, UPRIGHT);
  assert.deepEqual([...a.keys()], [...b.keys()]);
  for (const [token, mesh] of a) {
    assert.deepEqual(Array.from(mesh.positions), Array.from(b.get(token)!.positions));
    assert.deepEqual(Array.from(mesh.normals), Array.from(b.get(token)!.normals));
  }
});

test('the sprite budget is stated as arithmetic, and it is not flattered', () => {
  // The number exists so the live path's claim stays a claim about DETAIL rather than about
  // size. Its fill floor is LOWER than the plants' 0.7 because a stalk with a head on it leaves
  // most of its box empty — an over-stated budget would flatter the sprite convention, which is
  // the opposite of this arc's recurring error but no more honest.
  for (const f of flowers('proven')) {
    const budget = flowerSpriteBudget(f);
    assert.ok(budget > 0);
    assert.ok(budget < f.footprint.w * f.footprint.h, 'a flower never fills its own box');
  }
});
