// terrain-separation.test.ts — hold the directional instrument to synthetic lands whose answer
// is known in advance. An instrument validated only against the pictures it was built for is an
// instrument that agrees with them by construction.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  anisotropyOf,
  finenessDistance,
  finenessOf,
  lumaOf,
  pairVerdict,
  readTerrain,
  signatureDistance,
  signatureOf,
  subRegions,
} from './terrain-separation.js';

const W = 200;
const H = 200;

/** An RGBA buffer painted by a function of (x, y), fully opaque unless `alpha` says otherwise. */
function paint(f: (x: number, y: number) => number, alpha: (x: number, y: number) => number = () => 255) {
  const d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = Math.max(0, Math.min(255, Math.round(f(x, y))));
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = alpha(x, y);
    }
  }
  return d;
}

/** Rows running along x — so the luma changes down y and not across x. */
const horizontalRows = (period: number) => paint((_x, y) => 128 + 100 * Math.sin((2 * Math.PI * y) / period));
/** Rows running along y. */
const verticalRows = (period: number) => paint((x) => 128 + 100 * Math.sin((2 * Math.PI * x) / period));
/** A deterministic undirected mottle — no clock, no Math.random (the harness's own rule). */
const mottle = () =>
  paint((x, y) => {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return 128 + 100 * (h - Math.floor(h) - 0.5);
  });

test('a flat field has no gradient anywhere and REFUSES rather than returning zeros', () => {
  // A signature of zeros would read as a legitimate flat measurement in a table.
  assert.equal(signatureOf(paint(() => 128), W, H), null);
});

test('rows running along x spend their gradient down y, and vice versa', () => {
  const h = signatureOf(horizontalRows(10), W, H)!;
  const v = signatureOf(verticalRows(10), W, H)!;
  assert.ok(h, 'horizontal rows produced no signature');
  // dx is index 0, dy is index 1.
  assert.ok(h[1] > h[0] * 3, `rows along x should load dy, got dx=${h[0].toFixed(3)} dy=${h[1].toFixed(3)}`);
  assert.ok(v[0] > v[1] * 3, `rows along y should load dx, got dx=${v[0].toFixed(3)} dy=${v[1].toFixed(3)}`);
});

test('a signature is a distribution — four non-negative numbers summing to one', () => {
  for (const d of [horizontalRows(9), verticalRows(13), mottle()]) {
    const s = signatureOf(d, W, H)!;
    assert.equal(s.length, 4);
    for (const v of s) assert.ok(v >= 0, 'a signature entry may not be negative');
    assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
});

test('⚠ the signature is INVARIANT TO THE TOKEN — which is the property the pair needs', () => {
  // `proposed` and `building` share a colour, so an instrument that moved when the colour moved
  // would be measuring the channel that already has nothing to say. Scaling every pixel scales
  // numerator and denominator alike.
  const bright = signatureOf(horizontalRows(10), W, H)!;
  const dim = signatureOf(paint((_x, y) => 40 + 30 * Math.sin((2 * Math.PI * y) / 10)), W, H)!;
  assert.ok(signatureDistance(bright, dim) < 0.05, 'the signature moved when only the level did');
});

test('an undirected mottle is near-isotropic; rows are not', () => {
  const m = anisotropyOf(signatureOf(mottle(), W, H)!);
  const r = anisotropyOf(signatureOf(horizontalRows(10), W, H)!);
  assert.ok(m < 2.5, `a mottle should be near-isotropic, got ${m.toFixed(2)}`);
  assert.ok(r > 4, `rows should be strongly directed, got ${r.toFixed(2)}`);
});

test('two lands running in DIFFERENT directions are far apart — and 1/3 is the CEILING', () => {
  // ⚠ THE MAXIMUM IS 1/3, NOT 1, and a bar written above it can never be cleared. Perfectly
  // crosswise rows move only two of the four channels: `dx` and `dy` swap their shares, while
  // both DIAGONALS cross the rows either way and hold 1/3 each in both lands. A first draft of
  // this test asserted `> 0.4` and failed against a correct instrument.
  const a = signatureOf(horizontalRows(10), W, H)!;
  const b = signatureOf(verticalRows(10), W, H)!;
  const d = signatureDistance(a, b);
  assert.ok(d > 0.25, `crosswise rows should be near the ceiling, got ${d.toFixed(4)}`);
  // ⚠ ~1/3, not exactly 1/3. The two diagonals are equal only in the limit; at 200x200 with a
  // one-pixel border excluded they land 0.334/0.333, so the measured maximum is 0.3337. A
  // ceiling written as an exact 1/3 fails against the very construction it describes — the same
  // trap `ground-cover.ts` records for `SEPARATION_FLOOR`, where a bar rounded UP reported its
  // own source as failing.
  assert.ok(d <= 1 / 3 + 0.01, `~1/3 is the construction's ceiling; got ${d.toFixed(4)}`);
});

test('⚠⚠ ORIENTATION ALONE IS BLIND TO SCALE — this is why the fineness channel exists', () => {
  // The defect a synthetic land caught, kept as a test so nobody deletes the second channel as
  // redundant. `fallow` and `wheatfield` run the SAME WAY on purpose — it is the same field —
  // and differ ~4.7x in feature size. On orientation alone they are 0.0002 apart.
  const a = signatureOf(horizontalRows(4), W, H)!;
  const b = signatureOf(horizontalRows(28), W, H)!;
  assert.ok(
    signatureDistance(a, b) < 0.01,
    'if this ever grows, the orientation channel has started seeing scale and this test is stale',
  );
});

test('⚠ FINENESS separates two lands at the same bearing and different scale', () => {
  const a = finenessOf(horizontalRows(4), W, H)!;
  const b = finenessOf(horizontalRows(28), W, H)!;
  const d = finenessDistance(a, b);
  assert.ok(d > 2, `7x apart in scale should be ~2.8 octaves; got ${d.toFixed(2)}`);
});

test('fineness is TOKEN-INVARIANT — crossings are counted about each line own mean', () => {
  const bright = finenessOf(horizontalRows(10), W, H)!;
  const dim = finenessOf(paint((_x, y) => 40 + 12 * Math.sin((2 * Math.PI * y) / 10)), W, H)!;
  assert.ok(finenessDistance(bright, dim) < 0.15, 'fineness moved when only the level did');
});

test('⚠ a pair separated ONLY by scale still reads as separated', () => {
  // The verdict takes either channel. A land has to be distinguishable, not distinguishable in
  // a particular way.
  const a = readTerrain(horizontalRows(4), W, H)!;
  const b = readTerrain(horizontalRows(28), W, H)!;
  const v = pairVerdict(a, b);
  assert.equal(v.separatedByDirection, false, 'premise: direction cannot tell these apart');
  assert.equal(v.separatedByScale, true);
  assert.equal(v.separated, true);
});

test('the same land twice is exactly zero apart — the instrument is not noisy by construction', () => {
  const a = signatureOf(mottle(), W, H)!;
  const b = signatureOf(mottle(), W, H)!;
  assert.equal(signatureDistance(a, b), 0);
});

test('TRANSPARENT pixels are excluded, and the silhouette edge never enters the reading', () => {
  // The water round an island is transparent. Counting the island's outline against it would
  // measure the island's SHAPE — identical in every panel — instead of its ground.
  const opaqueEverywhere = signatureOf(horizontalRows(10), W, H)!;
  // The same land, but only a centred disc is opaque. If the boundary leaked in, a strong
  // omnidirectional edge would flatten the signature toward isotropic.
  const disc = paint(
    (_x, y) => 128 + 100 * Math.sin((2 * Math.PI * y) / 10),
    (x, y) => (Math.hypot(x - W / 2, y - H / 2) < 70 ? 255 : 0),
  );
  const masked = signatureOf(disc, W, H)!;
  assert.ok(
    signatureDistance(opaqueEverywhere, masked) < 0.06,
    'the silhouette leaked into the reading',
  );
});

test('subRegions tiles the frame exactly, with no gap and no overlap', () => {
  const rs = subRegions(90, 60, 3);
  assert.equal(rs.length, 9);
  const area = rs.reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
  assert.equal(area, 90 * 60);
});

test('⚠⚠ THE BAR: a land is not separated from ITSELF', () => {
  // The instrument's most important refusal. If a terrain could clear the bar against its own
  // twin, the bar would certify anything.
  const r = readTerrain(mottle(), W, H)!;
  const v = pairVerdict(r, r);
  assert.equal(v.between, 0);
  assert.equal(v.separated, false, 'a land must never read as separated from itself');
});

test('the bar takes the WORSE of the two within-spreads, not their mean', () => {
  // A land that varies a lot across itself is one a reader cannot fingerprint from one patch;
  // averaging would let a uniform partner carry a variable one over the line.
  const a = readTerrain(horizontalRows(10), W, H)!;
  const b = readTerrain(verticalRows(10), W, H)!;
  const v = pairVerdict(a, b);
  assert.equal(v.bar, Math.max(a.withinSpread, b.withinSpread));
  assert.ok(v.separated, 'crosswise rows must clear their own within-island spread');
});

test('lumaOf is the same weighting the colour instrument uses', () => {
  assert.equal(lumaOf(255, 0, 0), 76.5);
  assert.equal(lumaOf(0, 255, 0), 150.45);
  assert.ok(Math.abs(lumaOf(0, 0, 255) - 28.05) < 1e-9);
});

test('a region with too few opaque pairs REFUSES rather than reporting a signature', () => {
  const tiny = paint(
    (_x, y) => 128 + 100 * Math.sin((2 * Math.PI * y) / 10),
    (x, y) => (x < 12 && y < 12 ? 255 : 0),
  );
  assert.equal(signatureOf(tiny, W, H), null);
});
