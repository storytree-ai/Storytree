// crowd-reading.test.ts — the truth reading held to the standard the reading itself sets: an
// instrument nobody has seen REFUSE is not evidence.
//
// `truthReading` is the ADR-0392 D5 / ADR-0398 D7 fence in the crowd: with 35 islands in six
// states, is the one failing island still the most anomalous thing in the frame? A check that
// answered FOUND on every population would certify nothing, so the two LOST cases below are the
// load-bearing tests — one where the needle is not actually different, and one where a healthy
// island is more anomalous than it is — and the UNVERIFIED paths are tested because they are the
// ones that could silently become a pass.

import assert from 'node:assert/strict';
import test from 'node:test';

import { CROWD_POPULATION, ELEV_RAD, NEEDLE_INDEX } from './crowd-layout.js';
import {
  OBJECT_FLOOR_PX,
  countIslandBlobs,
  deltaE76,
  meanColour,
  propLegibility,
  truthReading,
  type IslandColour,
} from './crowd-reading.js';

// ------------------------------------------------------------------ the colour metric

test('dE is zero for identical colours, grows with separation, and puts white a full 100 from black', () => {
  assert.equal(deltaE76([70, 120, 70], [70, 120, 70]), 0);
  const near = deltaE76([70, 120, 70], [74, 124, 74]);
  const far = deltaE76([70, 120, 70], [200, 60, 60]);
  assert.ok(near > 0);
  assert.ok(far > near, `${far} should exceed ${near}`);
  // The published sanity check on CIE76: L* runs 0..100, so white against black is ~100. A
  // transposed matrix or a missing gamma decode would not land here.
  const whiteBlack = deltaE76([255, 255, 255], [0, 0, 0]);
  assert.ok(whiteBlack > 95 && whiteBlack < 105, `white vs black measured ${whiteBlack}`);
  // Symmetric, as a metric must be.
  assert.equal(deltaE76([200, 60, 60], [70, 120, 70]), far);
});

// ------------------------------------------------------------------ the mean over a box

/** A `bufW * bufH` RGBA buffer, every pixel fully transparent black. */
function buffer(bufW: number, bufH: number): Uint8Array {
  return new Uint8Array(bufW * bufH * 4);
}

function put(buf: Uint8Array, bufW: number, x: number, y: number, rgba: readonly [number, number, number, number]): void {
  const i = (y * bufW + x) * 4;
  buf[i] = rgba[0];
  buf[i + 1] = rgba[1];
  buf[i + 2] = rgba[2];
  buf[i + 3] = rgba[3];
}

test('the mean colour ignores fully transparent pixels, and an empty box is not a reading', () => {
  const buf = buffer(2, 2);
  // One opaque white pixel among three transparent ones. Counting the transparent pixels would
  // pull the mean down to ~64 and report a dark island that nothing on screen is.
  put(buf, 2, 0, 0, [255, 255, 255, 255]);
  const one = meanColour(buf, 2, { x0: 0, y0: 0, x1: 2, y1: 2 });
  assert.equal(one.pixels, 1);
  assert.deepEqual(one.rgb, [255, 255, 255]);

  // An all-transparent box reports ZERO pixels rather than a black island — the distinction the
  // UNVERIFIED verdict downstream depends on.
  const blank = meanColour(buffer(2, 2), 2, { x0: 0, y0: 0, x1: 2, y1: 2 });
  assert.equal(blank.pixels, 0);
  assert.deepEqual(blank.rgb, [0, 0, 0]);

  // Alpha is the only thing that excludes a pixel: an opaque BLACK pixel is a reading.
  const black = buffer(1, 1);
  put(black, 1, 0, 0, [0, 0, 0, 255]);
  assert.equal(meanColour(black, 1, { x0: 0, y0: 0, x1: 1, y1: 1 }).pixels, 1);
});

test('the mean colour averages inside the given box only, never the whole buffer', () => {
  // Left half red, right half blue, in one 4x2 buffer. A reading that swept the buffer would
  // return purple for both boxes — which is how one island's colour becomes its neighbour's.
  const bufW = 4;
  const buf = buffer(bufW, 2);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 4; x++) {
      put(buf, bufW, x, y, x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
    }
  }
  const left = meanColour(buf, bufW, { x0: 0, y0: 0, x1: 2, y1: 2 });
  const right = meanColour(buf, bufW, { x0: 2, y0: 0, x1: 4, y1: 2 });
  assert.deepEqual(left.rgb, [255, 0, 0]);
  assert.equal(left.pixels, 4);
  assert.deepEqual(right.rgb, [0, 0, 255]);
  assert.equal(right.pixels, 4);
  // And a box that straddles the two returns the average of exactly those pixels.
  const straddle = meanColour(buf, bufW, { x0: 1, y0: 0, x1: 3, y1: 1 });
  assert.equal(straddle.pixels, 2);
  assert.deepEqual(straddle.rgb, [127.5, 0, 127.5]);
});

// ------------------------------------------------------------------ the truth reading

/** The healthy population's own green. Every healthy island sits within a couple of units of it. */
const HEALTHY: readonly [number, number, number] = [70, 120, 70];

interface CrowdSpec {
  /** What the needle wears. */
  needle: readonly [number, number, number];
  /** Optionally, one HEALTHY island planted further out than the needle. */
  healthyOutlier?: readonly [number, number, number];
}

/**
 * A synthetic 35-island population wearing the real crowd's own status mix. The healthy islands
 * cluster tightly (a few units of channel jitter, which is the spread the bar is read off), and
 * the other authored states sit near them — they are not what a reader is hunting for.
 */
function crowd(spec: CrowdSpec): IslandColour[] {
  return CROWD_POPULATION.map((status, index): IslandColour => {
    const needle = index === NEEDLE_INDEX;
    const healthy: [number, number, number] = [
      HEALTHY[0] + (index % 3),
      HEALTHY[1] + (index % 2),
      HEALTHY[2] + ((index + 1) % 3),
    ];
    let rgb: [number, number, number] = status === 'healthy' ? healthy : [74, 118, 72];
    if (needle) rgb = [spec.needle[0], spec.needle[1], spec.needle[2]];
    if (spec.healthyOutlier && index === 0) {
      rgb = [spec.healthyOutlier[0], spec.healthyOutlier[1], spec.healthyOutlier[2]];
    }
    return { index, status, needle, rgb, pixels: 4000 };
  });
}

test('the truth reading FINDS a planted needle that is genuinely a different colour', () => {
  const reading = truthReading(crowd({ needle: [200, 60, 60] }));
  assert.equal(reading.verdict, 'FOUND');
  assert.equal(reading.needleRank, 1, 'a reader hunting for the failure must land on it first');
  assert.ok(reading.margin > 0, `margin was ${reading.margin}`);
  assert.ok(reading.needleDE > reading.healthyMaxDE);
  assert.equal(reading.healthyCount, 21);
  assert.ok(reading.marginSigma > 0);
  assert.match(reading.reason, /most anomalous/);
});

test('the truth reading LOSES the needle when the needle is not actually different', () => {
  // ⚠⚠ THE TEST THAT MAKES THE INSTRUMENT EVIDENCE. Dress the failing island in the healthy
  // colour plus a hair of noise — less than the healthy population's own spread — and the reading
  // must refuse to report it as findable. A check that could not do this would report FOUND for
  // any treatment at all, including one that had stopped carrying proof state entirely.
  const reading = truthReading(crowd({ needle: [HEALTHY[0] + 0.5, HEALTHY[1] + 0.5, HEALTHY[2] + 0.5] }));
  assert.equal(reading.verdict, 'LOST');
  assert.ok(reading.margin <= 0, `margin was ${reading.margin}, so it read as findable`);
  assert.ok(reading.needleRank > 1);
  assert.match(reading.reason, /wrong way/);
});

test('the truth reading LOSES the needle when a HEALTHY island is more anomalous than it is', () => {
  // The bar is read off this same run's own healthy population, so a green island that reads
  // stranger than the failing one is a failure of the picture even though the needle moved.
  const reading = truthReading(crowd({ needle: [110, 120, 70], healthyOutlier: [200, 60, 60] }));
  assert.equal(reading.verdict, 'LOST');
  assert.ok(reading.margin < 0);
  assert.ok(reading.healthyMaxDE > reading.needleDE);
  assert.match(reading.reason, /HEALTHY/);
  // Same needle, without the outlier, is found — so the LOST above is the outlier's doing and
  // not a needle that was too timid to be seen.
  assert.equal(truthReading(crowd({ needle: [110, 120, 70] })).verdict, 'FOUND');
});

test('the truth reading is UNVERIFIED — never a pass and never a fail — when the measurement is not one', () => {
  // (a) A frame in which NOTHING was caught is a reading about empty frame. It must not become a
  // LOST (which would red a build over a camera bug) nor a FOUND. This is the guard that actually
  // caught one: the page's first run projected all 35 islands through a stale view matrix.
  const allBlank = crowd({ needle: [200, 60, 60] }).map((c) => ({ ...c, pixels: 0 }));
  const blank = truthReading(allBlank);
  assert.equal(blank.verdict, 'UNVERIFIED');
  assert.match(blank.reason, /not a single opaque pixel|caught a single opaque pixel/);
  assert.equal(blank.margin, 0);
  assert.equal(blank.needleRank, 0);
  assert.equal(blank.visibleCount, 0);

  // (a2) But a PARTIAL view is a real reading, not a refusal — a zoomed-in frame legitimately
  // shows a neighbourhood, and the count of what was in frame is reported rather than folded away.
  const partial = crowd({ needle: [200, 60, 60] });
  // Ten healthy neighbours and the needle stay in frame; everything else is off the edge.
  for (let i = 10; i < partial.length - 1; i++) partial[i] = { ...partial[i]!, pixels: 0 };
  const seen = truthReading(partial);
  assert.equal(seen.verdict, 'FOUND');
  assert.equal(seen.visibleCount, 11);
  assert.equal(seen.totalCount, partial.length);
  assert.ok(seen.visibleCount < seen.totalCount);

  // (a3) And a frame the needle is NOT in cannot answer the question at all.
  const needleGone = crowd({ needle: [200, 60, 60] }).map((c) => (c.needle ? { ...c, pixels: 0 } : c));
  const absent = truthReading(needleGone);
  assert.equal(absent.verdict, 'UNVERIFIED');
  assert.match(absent.reason, /not in this frame/);

  // (b) A bar cannot be read off one island. Everything else about this population is fine —
  // every box caught pixels and the needle is present and wildly different — so a reading that
  // guessed would have said FOUND here.
  const thin: IslandColour[] = [
    { index: 0, status: 'healthy', needle: false, rgb: [70, 120, 70], pixels: 4000 },
    { index: 1, status: 'proposed', needle: false, rgb: [74, 118, 72], pixels: 4000 },
    { index: 2, status: 'unhealthy', needle: true, rgb: [200, 60, 60], pixels: 4000 },
  ];
  const one = truthReading(thin);
  assert.equal(one.verdict, 'UNVERIFIED');
  assert.match(one.reason, /only 1 healthy/);
  assert.equal(one.healthyCount, 1);

  // (c) And a population with no needle at all is a reading about nothing.
  const noNeedle = truthReading(crowd({ needle: [200, 60, 60] }).map((c) => ({ ...c, needle: false })));
  assert.equal(noNeedle.verdict, 'UNVERIFIED');
  assert.match(noNeedle.reason, /no needle/);
});

// ------------------------------------------------------------------ has the crowd turned to soup?

/** Paint an opaque `w x h` rectangle with its top-left at (x, y). */
function square(buf: Uint8Array, bufW: number, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) put(buf, bufW, x + dx, y + dy, [10, 200, 10, 255]);
  }
}

test('separated islands count separately and touching ones merge into one blob', () => {
  // The direct form of "turns to soup": two islands that run together stop being two islands.
  const bufW = 10;
  const bufH = 5;
  const apart = buffer(bufW, bufH);
  square(apart, bufW, 0, 0, 2, 2);
  square(apart, bufW, 5, 0, 2, 2);
  const two = countIslandBlobs(apart, bufW, bufH, 1);
  assert.equal(two.blobs, 2);
  assert.equal(two.largest, 4);

  // Slide them until they touch — 4-connected, so column 1 abutting column 2 is one region.
  const touching = buffer(bufW, bufH);
  square(touching, bufW, 0, 0, 2, 2);
  square(touching, bufW, 2, 0, 2, 2);
  const merged = countIslandBlobs(touching, bufW, bufH, 1);
  assert.equal(merged.blobs, 1, 'two abutting islands still read as two, so a merge would go unseen');
  assert.equal(merged.largest, 8);
});

test('a speck below the floor is not a thirty-sixth island', () => {
  const bufW = 10;
  const bufH = 5;
  const buf = buffer(bufW, bufH);
  square(buf, bufW, 0, 0, 3, 3); // 9 px — an island
  put(buf, bufW, 8, 4, [10, 200, 10, 255]); // 1 px — an anti-aliased stray
  assert.equal(countIslandBlobs(buf, bufW, bufH, 1).blobs, 2);
  assert.equal(countIslandBlobs(buf, bufW, bufH, 4).blobs, 1);
  assert.equal(countIslandBlobs(buf, bufW, bufH, 4).largest, 9);
  // And a floor above everything present counts nothing, rather than counting the largest anyway.
  assert.deepEqual(countIslandBlobs(buf, bufW, bufH, 20), { blobs: 0, largest: 0 });
  assert.deepEqual(countIslandBlobs(buffer(bufW, bufH), bufW, bufH, 1), { blobs: 0, largest: 0 });
});

// ------------------------------------------------------------------ is a prop still an object?

test('a prop clears the object floor or does not, and the SAME prop stops clearing as the crowd pulls back', () => {
  // The crowd's whole legibility risk in one assertion: nothing about the prop changes, only the
  // zoom the forest is delivered at, and it crosses from object to texture.
  const roles = [{ role: 'tree', worldSize: 30 }] as const;
  const close = propLegibility(roles, 8, ELEV_RAD)[0]!;
  const wide = propLegibility(roles, 0.2, ELEV_RAD)[0]!;
  assert.equal(close.role, 'tree');
  assert.equal(close.worldSize, 30);
  assert.ok(close.deliveredPx >= OBJECT_FLOOR_PX);
  assert.equal(close.clears, true);
  assert.ok(wide.deliveredPx < OBJECT_FLOOR_PX);
  assert.equal(wide.clears, false);
  assert.ok(wide.deliveredPx < close.deliveredPx, 'pulling back must deliver FEWER pixels');

  // The floor is a floor, not a strict threshold — a prop landing exactly on it still reads.
  const exact = propLegibility([{ role: 'onTheLine', worldSize: 1 }], OBJECT_FLOOR_PX / Math.cos(ELEV_RAD), ELEV_RAD)[0]!;
  assert.ok(Math.abs(exact.deliveredPx - OBJECT_FLOOR_PX) < 1e-9);
  assert.equal(exact.clears, true);

  // A tall prop foreshortens by cos(elevation), so it delivers LESS than its world size suggests
  // — reading it flat is the silent over-report this floor exists to catch.
  assert.ok(close.deliveredPx < close.worldSize * 8);
  assert.equal(close.axis, 'height', 'height is the conservative default, and it must stay the default');

  // ...and a WIDTH does not foreshorten at this camera. Applying the same cos to both axes would
  // under-report every width-sized prop by 36%, which is the error in the direction that quietly
  // says a legible prop is speckle.
  const flat = propLegibility([{ role: 'bloom', worldSize: 4, axis: 'width' }], 2, ELEV_RAD)[0]!;
  const tall = propLegibility([{ role: 'bloom', worldSize: 4, axis: 'height' }], 2, ELEV_RAD)[0]!;
  assert.equal(flat.axis, 'width');
  assert.ok(Math.abs(flat.deliveredPx - 8) < 1e-9, `a 4-unit width at 2 px/unit is 8 px, got ${flat.deliveredPx}`);
  assert.ok(tall.deliveredPx < flat.deliveredPx);
  assert.ok(Math.abs(tall.deliveredPx - flat.deliveredPx * Math.cos(ELEV_RAD)) < 1e-9);

  // Every role handed in comes back, in order.
  const many = propLegibility(
    [
      { role: 'tree', worldSize: 30 },
      { role: 'rock', worldSize: 3 },
      { role: 'bloom', worldSize: 1 },
    ],
    2,
    ELEV_RAD,
  );
  assert.deepEqual(
    many.map((p) => p.role),
    ['tree', 'rock', 'bloom'],
  );
  assert.deepEqual(
    many.map((p) => p.clears),
    [true, false, false],
  );
});
