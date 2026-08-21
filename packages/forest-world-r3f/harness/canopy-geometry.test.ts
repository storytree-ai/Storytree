// canopy-geometry.test.ts — THE SMALL TREE, held to the numbers it was authored against.
//
// The interesting failure this file exists to catch is NOT a crash. It is a later tweak quietly
// returning the canopy to the thing the owner already rejected: a hundred and forty-four marks
// on the ground that read as speckle rather than as a forest. Everything below is therefore an
// assertion about the DELIVERED raster — how many pixels wide, how many tall, which way round —
// rather than about the source that produced it.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANOPY_ASPECT_FLOOR,
  CANOPY_WIDTH_FLOOR,
  canopyCaster,
  canopyRadiusAt,
  growCanopy,
  groveSpecs,
  type CanopyShape,
} from './canopy-geometry.js';
import { PROP_TOKENS, rungOfNormal } from './palette-band.js';

/** The island's delivered scale and camera, restated here as the two numbers the assertions
 *  below are actually about. A width delivers all of itself; a HEIGHT foreshortens by cos(elev),
 *  and confusing the two is the 2.75x class of error this arc has paid for more than once. */
const DELIVERED_PX_PER_UNIT = 2;
const RENDER_ELEV_DEG = 50;
const UPRIGHT = Math.cos((RENDER_ELEV_DEG * Math.PI) / 180);

const SHAPES: CanopyShape[] = ['spire', 'dome'];

test('the silhouette is a TAPERED SPINDLE — a point at the tip, a foot at the ground', () => {
  for (const shape of SHAPES) {
    assert.equal(canopyRadiusAt(shape, 1), 0, `${shape} does not come to a point`);
    // NOT a point at the base. A tree that tapers to nothing where it meets the land reads as a
    // spinning top balanced on its tip — and the reference's trees have a narrow but visible
    // footprint. The floor is one ground unit at the smallest authored width, which is exactly
    // the aliasing floor and no less.
    const foot = canopyRadiusAt(shape, 0);
    assert.ok(foot > 0.1, `${shape} has no foot at all`);
    assert.ok(foot < 0.5, `${shape} has a foot half its own width — that is a barrel`);

    // ONE maximum, reached inside the tree rather than at either end, with the curve monotone on
    // each side of it. Asserted as a property rather than as a table of sampled radii, so a
    // profile tweak does not have to be re-blessed line by line — only a tweak that stopped it
    // being a spindle fails.
    const N = 200;
    const rs = Array.from({ length: N + 1 }, (_, i) => canopyRadiusAt(shape, i / N));
    let peak = 0;
    for (let i = 1; i <= N; i++) if (rs[i]! > rs[peak]!) peak = i;
    assert.ok(peak > 0 && peak < N, `${shape} is widest at an end`);
    for (let i = 1; i <= peak; i++) {
      assert.ok(rs[i]! >= rs[i - 1]! - 1e-9, `${shape} dips before its widest point`);
    }
    for (let i = peak + 1; i <= N; i++) {
      assert.ok(rs[i]! <= rs[i - 1]! + 1e-9, `${shape} bulges after its widest point`);
    }
    assert.ok(Math.abs(rs[peak]! - 1) < 1e-9, `${shape} never reaches its authored width`);
  }
});

test('a canopy tree is ONE MATERIAL and has NO TRUNK', () => {
  // Both halves matter and they are the same assertion. The reference's trees show no trunk at
  // any magnification, and at 10-18 delivered pixels wide a trunk would be a one-pixel line
  // under a crown — geometry spent on something that cannot be seen. Two tokens would also mean
  // a per-tree colour split, which is the "variation is SIZE, not colour" rule broken from the
  // inside.
  for (const shape of SHAPES) {
    const parts = growCanopy({ width: 7, height: 24, shape });
    assert.equal(parts.size, 1, `${shape} grew more than one material`);
    assert.ok(parts.has(PROP_TOKENS.canopy), `${shape} did not wear the default canopy token`);
  }
});

test('IT IS AN OBJECT, NOT SPECKLE — the delivered raster clears both inherited floors', () => {
  // The two floors are inherited measurements, not preferences (PR #1498): a feature under ~1
  // ground unit is aliasing shimmer, and an ISOLATED MARK under ~10 delivered pixels stops
  // being an object. A plant is 15 x 12 delivered — WIDER than tall — and reads as texture ON
  // the ground. A tree has to be the other way round.
  const specs = groveSpecs({ count: 24, seed: 5 });
  assert.ok(specs.length === 24);
  for (const spec of specs) {
    const wPx = spec.width * DELIVERED_PX_PER_UNIT;
    const hPx = spec.height * UPRIGHT * DELIVERED_PX_PER_UNIT;
    assert.ok(wPx >= 10, `a tree ${wPx.toFixed(1)} px wide is a mark, not an object`);
    assert.ok(
      hPx > wPx * 1.25,
      `a tree ${wPx.toFixed(1)} x ${hPx.toFixed(1)} px is wider-ish than tall — that is a shrub`,
    );
  }
  // The tallest spire in a default grove should reach the reference's own delivered proportion
  // rather than merely clearing the floor, or the whole stand reads as hedging.
  const tallest = specs.reduce((a, b) => (b.height > a.height ? b : a), specs[0]!);
  const aspect = (tallest.height * UPRIGHT) / tallest.width;
  assert.ok(aspect > 2, `the biggest tree delivers only ${aspect.toFixed(2)} : 1`);
});

test('the floors REFUSE rather than deform — a spec under them comes back at them', () => {
  const parts = growCanopy({ width: 1, height: 1, shape: 'spire' });
  const mesh = parts.get(PROP_TOKENS.canopy)!;
  assert.ok(
    mesh.bounds.w >= CANOPY_WIDTH_FLOOR - 0.01,
    `a 1-unit request grew ${mesh.bounds.w.toFixed(2)} wide`,
  );
  assert.ok(
    mesh.bounds.h >= CANOPY_WIDTH_FLOOR * CANOPY_ASPECT_FLOOR - 0.01,
    `a 1-unit request grew ${mesh.bounds.h.toFixed(2)} tall`,
  );
});

test('the mesh is the size it was asked for, so the caster and the picture agree', () => {
  // A caster that does not match its prop puts a shadow pool under nothing, which is the one
  // artefact that reads as a rendering bug rather than as a choice.
  for (const shape of SHAPES) {
    const spec = { width: 8, height: 27, shape } as const;
    const mesh = growCanopy(spec).get(PROP_TOKENS.canopy)!;
    assert.ok(Math.abs(mesh.bounds.w - 8) < 0.35, `${shape} width is ${mesh.bounds.w.toFixed(2)}`);
    assert.ok(Math.abs(mesh.bounds.h - 27) < 0.01, `${shape} height is ${mesh.bounds.h.toFixed(2)}`);
    const caster = canopyCaster(spec, { x: 3, z: -4 });
    assert.deepEqual({ x: caster.x, z: caster.z }, { x: 3, z: -4 });
    assert.equal(caster.radius, 4);
    assert.equal(caster.height, 27);
  }
});

test('a canopy delivers MORE THAN ONE RUNG — it is a solid, not a silhouette', () => {
  // The banded material picks a rung per FACE NORMAL, so a shape whose normals all fall in one
  // band delivers one flat colour and reads as a cut-out. A solid of revolution should sweep
  // most of the ladder; asserting it here rather than looking at a render is the same discipline
  // that caught `addGableRoof` shading a roof as if its pitch were 90 minus itself.
  for (const shape of SHAPES) {
    const mesh = growCanopy({ width: 7, height: 25, shape }).get(PROP_TOKENS.canopy)!;
    const rungs = new Set<number>();
    for (let i = 0; i < mesh.normals.length; i += 3) {
      rungs.add(
        rungOfNormal({ x: mesh.normals[i]!, y: mesh.normals[i + 1]!, z: mesh.normals[i + 2]! }),
      );
    }
    assert.ok(rungs.size >= 3, `${shape} delivers only ${rungs.size} rung(s)`);
  }

  // ⚠ A SPIRE CANNOT REACH THE TOP RUNG, AND THAT IS ARITHMETIC RATHER THAN A DEFECT. It is
  // recorded as an assertion so that a later widening of the profile does not slip past
  // unnoticed. `rungOfNormal` half-lambertises (`dot * 0.5 + 0.5`) before snapping onto
  // [0.78, 0.80, 0.90, 1.00], so rung 3 needs lambert >= 0.95, i.e. a normal within about 26
  // degrees of the authored light. A spire's surface is steep almost everywhere — at 7 x 25 its
  // steepest-lit normal reaches dot 0.77, which is rung 2 — so the ladder is effectively THREE
  // rungs deep for a spire and four for a dome. What carries a spire's roundness instead is the
  // SHADE KEY's hue rotation across rungs 0 to 2, which is a larger perceptual step than the
  // 0.90 -> 1.00 value one it cannot have.
  const spire = growCanopy({ width: 7, height: 25, shape: 'spire' }).get(PROP_TOKENS.canopy)!;
  const spireRungs = new Set<number>();
  for (let i = 0; i < spire.normals.length; i += 3) {
    spireRungs.add(
      rungOfNormal({ x: spire.normals[i]!, y: spire.normals[i + 1]!, z: spire.normals[i + 2]! }),
    );
  }
  assert.ok(!spireRungs.has(3), 'a spire now reaches rung 3 — the profile was widened');

  // A DOME does reach it, which is what makes the two silhouettes differ in COLOUR as well as in
  // outline: the flatter shoulder turns far enough toward the light for the brightest entry.
  const dome = growCanopy({ width: 8, height: 20, shape: 'dome' }).get(PROP_TOKENS.canopy)!;
  const domeRungs = new Set<number>();
  for (let i = 0; i < dome.normals.length; i += 3) {
    domeRungs.add(
      rungOfNormal({ x: dome.normals[i]!, y: dome.normals[i + 1]!, z: dome.normals[i + 2]! }),
    );
  }
  assert.ok(domeRungs.has(3), 'a dome no longer turns a face toward the light');
});

test('deterministic: the same spec grows byte-identical geometry (ADR-0380 D6 fence 2)', () => {
  for (const shape of SHAPES) {
    const a = growCanopy({ width: 6.5, height: 23, shape, seed: 4 }).get(PROP_TOKENS.canopy)!;
    const b = growCanopy({ width: 6.5, height: 23, shape, seed: 4 }).get(PROP_TOKENS.canopy)!;
    assert.deepEqual([...a.positions], [...b.positions]);
    assert.deepEqual([...a.normals], [...b.normals]);
  }
  const g1 = groveSpecs({ count: 30, seed: 9 });
  const g2 = groveSpecs({ count: 30, seed: 9 });
  assert.deepEqual(g1, g2);
  assert.notDeepEqual(g1, groveSpecs({ count: 30, seed: 10 }));
});

test('A GROVE VARIES IN SIZE AND NOT IN COLOUR — the reference rule, asserted', () => {
  const specs = groveSpecs({ count: 40, seed: 2, minWidth: 5, maxWidth: 10, token: PROP_TOKENS.canopyDark });

  // ONE colour across the whole stand. The reference recolours every tree on an island together
  // and never tints one against its neighbour; a grove of individually-coloured trees is
  // confetti, and it is the half of the finding easiest to get backwards.
  const tokens = new Set(specs.map((s) => s.token));
  assert.equal(tokens.size, 1);
  assert.equal([...tokens][0], PROP_TOKENS.canopyDark);

  // A REAL range of heights. Measured off the reference's groves at roughly 1 : 2.5; a stand of
  // equal trees delivers a hedge, because the silhouette's top edge stops being a line only when
  // the heights differ.
  const heights = specs.map((s) => s.height);
  const ratio = Math.max(...heights) / Math.min(...heights);
  assert.ok(ratio > 1.6, `the tallest tree is only ${ratio.toFixed(2)}x the shortest`);

  // Both silhouettes appear when both are asked for, and neither when they are not.
  const mixed = groveSpecs({ count: 40, seed: 2, domeFraction: 0.5 });
  assert.ok(mixed.some((s) => s.shape === 'dome'));
  assert.ok(mixed.some((s) => s.shape === 'spire'));
  assert.ok(groveSpecs({ count: 20, seed: 2, domeFraction: 0 }).every((s) => s.shape === 'spire'));
  assert.ok(groveSpecs({ count: 20, seed: 2, domeFraction: 1 }).every((s) => s.shape === 'dome'));
});

test('a DOME is a different tree from a SPIRE at delivered size, not just in the source', () => {
  // Two silhouettes that separate only under magnification are one silhouette as far as the
  // island is concerned — the arc's own inherited lesson about the sprite path.
  const specs = groveSpecs({ count: 60, seed: 7, domeFraction: 0.5 });
  const delivered = (s: (typeof specs)[number]) => (s.height * UPRIGHT) / s.width;
  const spires = specs.filter((s) => s.shape === 'spire').map(delivered);
  const domes = specs.filter((s) => s.shape === 'dome').map(delivered);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(spires.length > 5 && domes.length > 5);
  assert.ok(
    mean(spires) - mean(domes) > 0.5,
    `spires deliver ${mean(spires).toFixed(2)} : 1 and domes ${mean(domes).toFixed(2)} : 1 — ` +
      'too close to read as two kinds of tree',
  );
  // A dome is still a TREE and not a bush: it must stay on the tall side of square.
  assert.ok(Math.min(...domes) > 1.25, 'a dome delivered wider than it is tall');
});
