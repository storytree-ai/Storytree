import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { Frame, VisibleDeltaReading } from './visible-delta.js';
import {
  SENSITIVITY_MOVE,
  VISIBLE_DELTA,
  amplifyBy,
  channelMove,
  magnitudeBands,
  sensitivityReasons,
  visibleDeltaDistribution,
  visibleDeltaProse,
  visibleDeltaVerdict,
  voidnessReasons,
} from './visible-delta.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(HERE, rel), 'utf8');

/** A frame of `n` identical pixels. */
function flat(n: number, r: number, g = r, b = r): Uint8ClampedArray {
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** A frame whose pixel `i` has red `moves[i]` and is otherwise black — so differenced against a
 *  black frame, pixel `i` moved by exactly `moves[i]`. */
function movedBy(moves: readonly number[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(moves.length * 4);
  for (let i = 0; i < moves.length; i++) {
    out[i * 4] = moves[i]!;
    out[i * 4 + 3] = 255;
  }
  return out;
}

// ---------------------------------------------------------------- the threshold is CITED, and singular

test('the threshold is ADR-0490 D6 exactly, and the probe is one above it', () => {
  assert.equal(VISIBLE_DELTA, 20);
  assert.equal(SENSITIVITY_MOVE, 21);
});

// ⚠⚠ THE FENCE THE INCREMENT IS ACTUALLY ABOUT. Four independent declarations of this one
// authored number existed at HEAD — two scenes and two drivers. Deduping them once fixes today;
// this test is what stops a fifth appearing, and it is deliberately a SOURCE-TEXT assertion,
// because the fault it guards is invisible to any assertion about values: four copies reading 20
// agree perfectly right up until one of them does not.
test('VISIBLE_DELTA is declared in exactly ONE file in the harness', () => {
  const declarations: string[] = [];
  for (const name of readdirSync(HERE)) {
    if (!/\.(ts|tsx|mjs)$/.test(name)) continue;
    if (name === 'visible-delta.test.ts') continue;
    if (/(^|[^\w])(const|let|var)\s+VISIBLE_DELTA\s*=/.test(source(name))) declarations.push(name);
  }
  assert.deepEqual(
    declarations,
    ['visible-delta.ts'],
    `the ADR-0490 D6 threshold must have ONE home; found it declared in ${declarations.join(', ')}`,
  );
});

test('both comparison pages CALL the shared instrument rather than walking pixels themselves', () => {
  for (const page of ['shipped-grass-scene.ts', 'shipped-skirt-scene.ts']) {
    const text = source(page);
    assert.ok(
      /from '\.\/visible-delta\.js'/.test(text),
      `${page} must import the metric rather than declaring it`,
    );
    assert.ok(
      !/Math\.abs\(pa\[i\]/.test(text),
      `${page} still carries its own channel-difference walk`,
    );
  }
});

// ---------------------------------------------------------------- the ladder is a partition

test('the bands partition 1..255 with no gap and no overlap', () => {
  const bands = magnitudeBands();
  assert.equal(bands[0]!.from, 1);
  assert.equal(bands.at(-1)!.to, 255);
  for (let i = 1; i < bands.length; i++) {
    assert.equal(bands[i]!.from, bands[i - 1]!.to + 1, `gap or overlap before band ${i}`);
  }
  // Every move in 1..255 lands in exactly one band.
  for (let d = 1; d <= 255; d++) {
    const hits = bands.filter((band) => d >= band.from && d <= band.to);
    assert.equal(hits.length, 1, `a move of ${d} matched ${hits.length} bands`);
  }
});

test('exactly one band sits below the bar, and it ends AT the bar', () => {
  const bands = magnitudeBands();
  const below = bands.filter((band) => !band.visible);
  assert.equal(below.length, 1);
  assert.equal(below[0]!.to, VISIBLE_DELTA);
  assert.equal(below[0]!.label, 'sub-threshold');
});

test('the ladder is DERIVED from the threshold rather than hard-coded at 20', () => {
  assert.deepEqual(
    magnitudeBands(10).map((band) => band.to),
    [10, 20, 40, 80, 160, 255],
  );
  assert.deepEqual(
    magnitudeBands().map((band) => band.to),
    [20, 40, 80, 160, 255],
  );
});

test('the top band says `over Nx` when the channel range cut it short', () => {
  // 8x20 = 160, and doubling would reach 320 — past what a channel can move.
  assert.equal(magnitudeBands().at(-1)!.label, 'over 8x');
  // 64x2 = 128 and 128x2 = 256 > 255, so the same cap applies at a different threshold.
  assert.equal(magnitudeBands(2).at(-1)!.label, 'over 64x');
});

test('a threshold with no ladder is refused rather than looped over', () => {
  assert.throws(() => magnitudeBands(0), /no ladder/);
  assert.throws(() => magnitudeBands(255), /no ladder/);
  assert.throws(() => magnitudeBands(2.5), /no ladder/);
});

// ---------------------------------------------------------------- the pixel walk

test('the move is the LARGEST channel move, not the mean and not the luma', () => {
  const a = flat(1, 0, 0, 0);
  const b = flat(1, 0, 0, 90);
  // Only blue moved, and blue is 7% of luma — a luma metric would report ~6.5.
  assert.equal(channelMove(a, b, 0), 90);
});

test('alpha is not read', () => {
  const a = new Uint8ClampedArray([10, 10, 10, 255]);
  const b = new Uint8ClampedArray([10, 10, 10, 0]);
  assert.equal(channelMove(a, b, 0), 0);
});

// ---------------------------------------------------------------- THE BOUNDARY the rule turns on

test('a move of exactly the threshold is touched but NOT visible', () => {
  const reading = visibleDeltaDistribution(flat(100, 0), movedBy(Array.from({ length: 100 }, () => VISIBLE_DELTA)));
  assert.equal(reading.touched, 100);
  assert.equal(reading.visible, 0);
  assert.equal(reading.overstatement, null);
});

test('one unit more is visible on every pixel', () => {
  const reading = visibleDeltaDistribution(flat(100, 0), movedBy(Array.from({ length: 100 }, () => VISIBLE_DELTA + 1)));
  assert.equal(reading.touched, 100);
  assert.equal(reading.visible, 100);
  assert.equal(reading.overstatement, 1);
});

// ---------------------------------------------------------------- IT DISCRIMINATES: differ vs not

test('two frames that do NOT differ read as no movement, and are flagged as a suspicion', () => {
  const verdict = visibleDeltaVerdict(flat(64, 120), flat(64, 120));
  assert.equal(verdict.status, 'READ');
  assert.equal(verdict.reading!.touched, 0);
  assert.equal(verdict.reading!.visible, 0);
  assert.equal(verdict.reading!.max, 0);
  assert.equal(verdict.suspicions.length, 1);
  assert.match(verdict.suspicions[0]!, /BYTE-IDENTICAL/);
});

test('two frames that DO differ read as movement, on the same instrument in the same shape', () => {
  const control = flat(64, 120);
  const verdict = visibleDeltaVerdict(amplifyBy(control, 40), control);
  assert.equal(verdict.status, 'READ');
  assert.equal(verdict.reading!.visible, 64);
  assert.equal(verdict.reading!.max, 40);
  assert.equal(verdict.suspicions.length, 0);
});

// ⚠⚠ THE REGRESSION TEST FOR THE ACTUAL INCIDENT. Recomputing the two misjudged increments by
// magnitude showed every pixel had moved, and none of them by more than 37/255, with a typical
// move of 8. Under the retired metric that reads "the whole frame changed"; under this one it
// reads "nothing is visible". Both numbers are true and only one of them is a picture.
test('the historical case: every pixel touched, none visible, and the overstatement is named', () => {
  const moves = Array.from({ length: 1000 }, () => 8);
  moves[0] = 37;
  const reading = visibleDeltaDistribution(flat(1000, 0), movedBy(moves));
  assert.equal(reading.touched, 1000);
  assert.equal(reading.visible, 1);
  assert.equal(reading.p50, 8);
  assert.equal(reading.max, 37);
  assert.equal(reading.overstatement, 1000);
  const subThreshold = reading.bands.find((band) => !band.visible)!;
  assert.equal(subThreshold.pixels, 999);
  assert.ok(subThreshold.shareOfMoved > 0.99);
});

// ⚠⚠ THE THIRD TRAP, REFUSED BY CONSTRUCTION. A spread metric returned 33.8 for BOTH the shipped
// and the approved picture. These two frames have IDENTICAL single-frame statistics — same
// histogram, same mean, same standard deviation, same colour count — because one is the other's
// checkerboard inverse. Any measure of a single frame's spread calls them the same image. A
// measure of MOVEMENT must not.
test('frames with identical single-frame statistics still register their movement', () => {
  const n = 400;
  const a = new Uint8ClampedArray(n * 4);
  const b = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const dark = i % 2 === 0;
    const av = dark ? 40 : 200;
    for (let c = 0; c < 3; c++) {
      a[i * 4 + c] = av;
      b[i * 4 + c] = dark ? 200 : 40;
    }
    a[i * 4 + 3] = 255;
    b[i * 4 + 3] = 255;
  }
  const histogramOf = (f: Uint8ClampedArray): Map<number, number> => {
    const h = new Map<number, number>();
    for (let i = 0; i < f.length; i += 4) h.set(f[i]!, (h.get(f[i]!) ?? 0) + 1);
    return h;
  };
  assert.deepEqual([...histogramOf(a)].sort(), [...histogramOf(b)].sort(), 'premise: same histogram');

  const reading = visibleDeltaDistribution(a, b);
  assert.equal(reading.visible, n, 'every pixel moved 160/255 and every one must be credited');
  assert.equal(reading.max, 160);
});

// ---------------------------------------------------------------- the distribution, not a scalar

test('moves are placed in the right bands and the shares are over MOVED pixels', () => {
  const moves = [
    ...Array.from({ length: 40 }, () => 5), // sub-threshold
    ...Array.from({ length: 20 }, () => 30), // 1-2x
    ...Array.from({ length: 20 }, () => 60), // 2-4x
    ...Array.from({ length: 10 }, () => 100), // 4-8x
    ...Array.from({ length: 10 }, () => 200), // over 8x
  ];
  const reading = visibleDeltaDistribution(flat(moves.length, 0), movedBy(moves));
  assert.deepEqual(
    reading.bands.map((band) => [band.label, band.pixels]),
    [
      ['sub-threshold', 40],
      ['1-2x', 20],
      ['2-4x', 20],
      ['4-8x', 10],
      ['over 8x', 10],
    ],
  );
  assert.equal(reading.touched, 100);
  assert.equal(reading.visible, 60);
  assert.equal(reading.bands[0]!.shareOfMoved, 0.4);
  assert.equal(
    reading.bands.reduce((sum, band) => sum + band.pixels, 0),
    reading.touched,
    'the bands must account for every moved pixel',
  );
});

test('pixels that did not move are counted in no band', () => {
  const reading = visibleDeltaDistribution(flat(10, 0), movedBy([0, 0, 0, 0, 0, 50, 50, 50, 50, 50]));
  assert.equal(reading.frame, 10);
  assert.equal(reading.touched, 5);
  assert.equal(
    reading.bands.reduce((sum, band) => sum + band.pixels, 0),
    5,
  );
});

test('percentiles describe the moved pixels, not the frame', () => {
  // 90 pixels still, 10 moved: a frame-wide median would be 0 and say nothing.
  const reading = visibleDeltaDistribution(
    flat(100, 0),
    movedBy([...Array.from({ length: 90 }, () => 0), ...Array.from({ length: 9 }, () => 30), 250]),
  );
  assert.equal(reading.touched, 10);
  assert.equal(reading.p50, 30);
  assert.equal(reading.p99, 250);
  assert.equal(reading.max, 250);
});

test('an unmoved frame reports zero percentiles rather than dividing by nothing', () => {
  const reading = visibleDeltaDistribution(flat(16, 77), flat(16, 77));
  assert.equal(reading.p50, 0);
  assert.equal(reading.p90, 0);
  assert.equal(reading.overstatement, null);
  for (const band of reading.bands) assert.equal(band.shareOfMoved, 0);
});

// ---------------------------------------------------------------- the probe

test('the probe moves EVERY channel by exactly the amount asked, at both ends of the range', () => {
  for (const base of [0, 5, 127, 128, 200, 255]) {
    const control = flat(8, base);
    const probe = amplifyBy(control, SENSITIVITY_MOVE);
    for (let i = 0; i < control.length; i += 4) {
      assert.equal(
        channelMove(control, probe, i),
        SENSITIVITY_MOVE,
        `a base of ${base} did not move by ${SENSITIVITY_MOVE} — the clamping trap`,
      );
    }
  }
});

test('the probe leaves alpha alone', () => {
  const control = new Uint8ClampedArray([10, 10, 10, 33]);
  assert.equal(amplifyBy(control, 21)[3], 33);
});

test('a probe that cannot move every channel exactly is refused', () => {
  assert.throws(() => amplifyBy(flat(4, 100), 129), /cannot move every channel exactly/);
  assert.throws(() => amplifyBy(flat(4, 100), 0), /cannot move every channel exactly/);
});

// ---------------------------------------------------------------- RUNG 1 — voidness

test('frames of different sizes are refused, not differenced', () => {
  const reasons = voidnessReasons(flat(10, 0), flat(11, 0));
  assert.equal(reasons.length, 1);
  assert.match(reasons[0]!, /not comparable/);
  assert.equal(visibleDeltaVerdict(flat(10, 0), flat(11, 0)).rung, 'VOIDNESS');
});

test('an empty capture is refused', () => {
  assert.match(voidnessReasons(new Uint8ClampedArray(0), flat(4, 0))[0]!, /empty/);
});

test('a buffer that is not whole RGBA pixels is refused', () => {
  const ragged = new Uint8ClampedArray(9);
  assert.ok(voidnessReasons(ragged, new Uint8ClampedArray(9)).some((r) => /whole number/.test(r)));
});

// ⚠⚠ THE ALIASING CASE. Both pages read through a memoising `pixels(arm, size, zoom)`; one key
// collision hands the same array back for two arms and every delta is zero BY CONSTRUCTION. The
// page would print "these arms look identical" having compared nothing.
test('the same buffer handed in twice is refused rather than reported as no change', () => {
  const one = flat(32, 90);
  const verdict = visibleDeltaVerdict(one, one);
  assert.equal(verdict.status, 'UNVERIFIED');
  assert.equal(verdict.rung, 'VOIDNESS');
  assert.equal(verdict.reading, null);
  assert.match(verdict.unverified.join(' '), /SAME buffer object/);
  // And an equal-but-distinct pair is NOT refused — it is a real reading with a suspicion.
  assert.equal(visibleDeltaVerdict(flat(32, 90), flat(32, 90)).status, 'READ');
});

// ---------------------------------------------------------------- RUNG 2 — sensitivity

test('a healthy instrument passes both limbs of the sensitivity rung', () => {
  assert.deepEqual(sensitivityReasons(flat(64, 130)), []);
  assert.deepEqual(sensitivityReasons(flat(64, 0)), []);
  assert.deepEqual(sensitivityReasons(flat(64, 255)), []);
});

// ⚠⚠ THE RUNG'S WHOLE PURPOSE, PROVED BY SEEDING THE FAULT RATHER THAN ASSERTING THE HAPPY PATH.
// A rung whose failure branch is never exercised is a rung nobody has evidence works, so each
// broken comparator below is a real fault this instrument could plausibly acquire.

/** A comparator that sees nothing — a readback that returned the same frame twice, a compare that
 *  lost its channels. Under the retired arrangement this reported `visible: 0` and every page read
 *  it as "the arms look alike". */
const blindReader = (): VisibleDeltaReading => ({
  frame: 0,
  touched: 0,
  visible: 0,
  overstatement: null,
  bands: [],
  p50: 0,
  p90: 0,
  p99: 0,
  max: 0,
});

test('a BLIND comparator is caught, and the reason says what the null actually means', () => {
  const reasons = sensitivityReasons(flat(64, 100), VISIBLE_DELTA, blindReader);
  assert.ok(reasons.some((r) => /one MORE than the bar/.test(r)));
  assert.ok(reasons.some((r) => /same null a blind instrument returns/.test(r)));
});

test('an OFF-BY-ONE at the bar is caught — `>=` where ADR-0490 D6 says `>`', () => {
  // The exact mutant `check:mutation-diff` would seed, and the one limb one cannot see: it counts
  // every pixel at the bar as visible, which is right for +21 and wrong for +20.
  const inclusiveReader = (a: Frame, b: Frame, threshold: number): VisibleDeltaReading => {
    const honest = visibleDeltaDistribution(a, b, threshold);
    let visible = 0;
    for (let i = 0; i < a.length; i += 4) if (channelMove(a, b, i) >= threshold) visible += 1;
    return { ...honest, visible };
  };
  const reasons = sensitivityReasons(flat(64, 100), VISIBLE_DELTA, inclusiveReader);
  assert.equal(reasons.length, 1, 'the +21 limb must still pass — only the boundary limb fails');
  assert.match(reasons[0]!, /the bar itself, which ADR-0490 D6 does NOT credit/);
  assert.match(reasons[0]!, /not the threshold the decision states/);
});

test('the honest comparator passes both limbs at every threshold it can probe', () => {
  for (let threshold = 1; threshold <= 127; threshold++) {
    assert.deepEqual(
      sensitivityReasons(flat(16, 100), threshold),
      [],
      `the instrument failed its own rung at a bar of ${threshold}`,
    );
  }
});

// ⚠ THE LIMIT OF THIS RUNG, PINNED SO IT IS NOT MISREAD AS COVERAGE. Both probes are derived
// FROM the threshold, so the rung passes happily at a bar that has drifted away from the decision.
// That claim is held by the two tests at the top of this file instead — the pinned constant and the
// one-declaration fence — and this test exists to record that the division is deliberate.
test('the rung cannot detect a DRIFTED bar, which is why the constant is pinned separately', () => {
  assert.deepEqual(sensitivityReasons(flat(64, 100), 40), []);
});

test('a bar too high to probe REFUSES rather than throwing out of whichever page called it', () => {
  const reasons = sensitivityReasons(flat(64, 100), 200);
  assert.equal(reasons.length, 1);
  assert.match(reasons[0]!, /cannot be probed/);
});

test('the sensitivity rung outranks the reading, and an unverified run carries no reading', () => {
  const control = flat(64, 100);
  const verdict = visibleDeltaVerdict(amplifyBy(control, 100), control, 200);
  assert.equal(verdict.status, 'UNVERIFIED');
  assert.equal(verdict.rung, 'SENSITIVITY');
  assert.equal(verdict.reading, null);
  assert.match(verdict.prose, /UNVERIFIED at the SENSITIVITY rung/);
});

// ---------------------------------------------------------------- the prose is derived

test('the prose carries the headline, the typical move and the overstatement', () => {
  const reading = visibleDeltaDistribution(
    flat(100, 0),
    movedBy([...Array.from({ length: 75 }, () => 8), ...Array.from({ length: 25 }, () => 64)]),
  );
  const prose = visibleDeltaProse('READ', 'READING', reading);
  assert.match(prose, /25 of 100 px moved by more than 20\/255/);
  assert.match(prose, /25\.00% of the frame/);
  assert.match(prose, /typical move 8\/255/);
  assert.match(prose, /largest 64\/255/);
  assert.match(prose, /would have read 4\.0x higher/);
  assert.match(prose, /ADR-0490 D6/);
});

test('the prose says so when the whole change is sub-threshold', () => {
  const reading = visibleDeltaDistribution(flat(10, 0), movedBy(Array.from({ length: 10 }, () => 3)));
  assert.match(visibleDeltaProse('READ', 'READING', reading), /where none is visible at all/);
});

// ---------------------------------------------------------------- no fudge factor anywhere

// ⚠ The sibling instruments carry this same guard, and for the same reason: an earlier
// `hardware-floor.mjs` scored rungs against `16.7 * 1.35` and its own comment records 1.35 as
// "a number picked to make the answer come out".
test('the judging code carries no multiplicative tolerance', () => {
  const text = source('visible-delta.ts');
  const judging = text.slice(text.indexOf('export function voidnessReasons'));
  assert.equal(
    /[*]\s*1\.\d|1\.\d+\s*[*]/.test(judging),
    false,
    'a fudge factor appeared in the rungs',
  );
});
