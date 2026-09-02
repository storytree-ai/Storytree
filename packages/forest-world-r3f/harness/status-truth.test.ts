// status-truth.test.ts — hostile fixtures for the six-status truth reader.
//
// ⚠⚠ `check:mutation-diff` MUTATES `src/` ONLY, so every line of `status-truth.ts` is unproven by
// it — `harness/` is out of the rung's reach entirely. The proof this module gets is the one this
// file's header records rather than a green mutation report: six faults were hand-seeded into
// `status-truth.ts` (flip the plurality to minority, count background as ground, drop a channel
// from the distance, swap own/foreign shares, make an empty island pass, treat a tie as a pass),
// this suite was run against each in turn, and each was restored before the next. The kill count is
// recorded in `docs/research/chapter2-six-status-truth-2026-09-02/README.md` §7 — this file is
// written so every one of those six mutations produces at least one failing assertion here.
//
// Every fixture is built INSIDE its own test (`mutation-rung-scores-a-hang-as-unproven` §11): a
// frame, a background colour and a reader table are all constructed fresh per test rather than
// memoised at module scope, so nothing here is "static coverage" a hand sweep could misread.

import assert from 'node:assert/strict';
import test from 'node:test';

import { deliveredForLevel, type Rgb255 } from '../src/shade-ladder.js';
import { W_LUMA } from '../src/shadow-rung.js';
import { SHIPPED_GRASS_MIX } from '../src/ForestWorldCanvas.js';
import { shippedLadder, SHIPPED_STATUSES } from './grain-status-reading.js';
import { grassMixedColour, grassReachableColours } from './grass-status-reading.js';
import { SHIPPED_GROUND_COLOUR } from './shipped-baseline.js';
import {
  familyKeyOf,
  fullReaderTable,
  isBackgroundPixel,
  islandVerdict,
  nearestReadStatus,
  statusPairSeparation,
  statusTruthVerdict,
  weightedDistance2,
  type Frame,
  type IslandSpec,
  type PixelRect,
} from './status-truth.js';

/** The frame's own clear colour — magenta, off the land palette entirely (the same convention
 *  `frame-cost-scene.ts`'s `CLEAR_RGB` uses, for the same reason: a cleared pixel can never be
 *  mistaken for a ground pixel, so its vote — or its exclusion — is unambiguous to check). */
function bg(): Rgb255 {
  return { r: 255, g: 0, b: 255 };
}

function makeFrame(width: number, height: number, background: Rgb255): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    data[p * 4] = background.r;
    data[p * 4 + 1] = background.g;
    data[p * 4 + 2] = background.b;
    data[p * 4 + 3] = 255;
  }
  return { data, width, height };
}

function paintRect(frame: Frame, rect: PixelRect, colour: Rgb255): void {
  for (let y = rect.y0; y < rect.y1; y += 1) {
    for (let x = rect.x0; x < rect.x1; x += 1) {
      const i = (y * frame.width + x) * 4;
      frame.data[i] = colour.r;
      frame.data[i + 1] = colour.g;
      frame.data[i + 2] = colour.b;
      frame.data[i + 3] = 255;
    }
  }
}

// ---------------------------------------------------------------- the reader table

test('fullReaderTable carries all six statuses, each with one entry per shipped rung', () => {
  const table = fullReaderTable();
  assert.deepEqual(Object.keys(table).sort(), [...SHIPPED_STATUSES].sort());
  const ladder = shippedLadder();
  for (const status of SHIPPED_STATUSES) {
    assert.equal(table[status]!.length, ladder.length, `${status} has the wrong rung count`);
  }
  const token = SHIPPED_GROUND_COLOUR.get('healthy')!;
  assert.deepEqual(table['healthy'], ladder.map((level) => deliveredForLevel(token, level)));
});

test('fullReaderTable accepts a narrower status/level list', () => {
  const table = fullReaderTable(['healthy', 'unknown'], [0.9]);
  assert.deepEqual(Object.keys(table).sort(), ['healthy', 'unknown']);
  assert.equal(table['healthy']!.length, 1);
});

// ---------------------------------------------------------------- the distance

test('weightedDistance2 is the arc\'s own luma-weighted squared distance over ALL three channels', () => {
  // Hand-computed against the formula directly — the seam a "drop a channel" mutant breaks.
  const a: Rgb255 = { r: 10, g: 20, b: 30 };
  const b: Rgb255 = { r: 0, g: 0, b: 0 };
  const expected = W_LUMA[0] * 100 + W_LUMA[1] * 400 + W_LUMA[2] * 900;
  assert.equal(weightedDistance2(a, b), expected);
  assert.ok(weightedDistance2(a, b) !== W_LUMA[0] * 100 + W_LUMA[1] * 400, 'the blue term must count');
  assert.equal(weightedDistance2(a, a), 0);
});

// ---------------------------------------------------------------- nearest-status search

test('nearestReadStatus returns the exact status at an exact token/rung match', () => {
  const table = fullReaderTable();
  const level = shippedLadder()[0]!;
  const healthy = deliveredForLevel(SHIPPED_GROUND_COLOUR.get('healthy')!, level);
  assert.equal(nearestReadStatus(healthy, table), 'healthy');
  const unknown = deliveredForLevel(SHIPPED_GROUND_COLOUR.get('unknown')!, level);
  assert.equal(nearestReadStatus(unknown, table), 'unknown');
});

test('nearestReadStatus ties break to the alphabetically first status', () => {
  // `building` and `proposed` share ONE authored token (ADR-0462), so a colour drawn from it is
  // an EXACT tie between the two — a real one, not a hand-forced coincidence — and the search must
  // resolve it deterministically rather than however object-key order happens to fall.
  const table = fullReaderTable();
  const level = shippedLadder()[0]!;
  const shared = deliveredForLevel(SHIPPED_GROUND_COLOUR.get('building')!, level);
  assert.equal(nearestReadStatus(shared, table), 'building');
});

// ---------------------------------------------------------------- background exclusion

test('isBackgroundPixel matches only an exact background colour', () => {
  const b = bg();
  assert.equal(isBackgroundPixel(b, b), true);
  assert.equal(isBackgroundPixel({ r: b.r + 1, g: b.g, b: b.b }, b), false);
});

// ---------------------------------------------------------------- family folding

test('familyKeyOf folds the shared proposed/building token and leaves every other status a singleton', () => {
  assert.equal(familyKeyOf('proposed'), familyKeyOf('building'));
  assert.equal(familyKeyOf('building'), 'building', 'the fold key is the alphabetically first member');
  for (const status of SHIPPED_STATUSES) {
    if (status === 'proposed' || status === 'building') continue;
    assert.equal(familyKeyOf(status), status);
  }
});

// ---------------------------------------------------------------- islandVerdict: the hostile fixtures

test('an island painted entirely in a FOREIGN token fails, and reads that foreign family', () => {
  const table = fullReaderTable();
  const level = shippedLadder()[0]!;
  const background = bg();
  const rect: PixelRect = { x0: 0, y0: 0, x1: 10, y1: 10 };
  const frame = makeFrame(10, 10, background);
  paintRect(frame, rect, deliveredForLevel(SHIPPED_GROUND_COLOUR.get('unknown')!, level));

  const island: IslandSpec = { id: 'i', status: 'healthy', rect };
  const v = islandVerdict(frame, background, island, table);

  assert.equal(v.empty, false);
  assert.equal(v.groundPixels, 100);
  assert.equal(v.readFamily, 'unknown');
  assert.equal(v.pass, false);
  assert.equal(v.ownShare, 0);
  assert.equal(v.foreignShare, 1);
});

test('a healthy island with grass-mixed pixels still reads healthy', () => {
  // Layer 1 mixes a real grass colour into the base at SHIPPED_GRASS_MIX (0.32) — the shipped
  // mix, not an invented one — and only on `healthy` ground (GRASS_STATUS_GATE). A pixel that
  // includes this mix must not be misread as a foreign status.
  const table = fullReaderTable();
  const level = shippedLadder()[0]!;
  const background = bg();
  const base = deliveredForLevel(SHIPPED_GROUND_COLOUR.get('healthy')!, level);
  const reach = grassReachableColours();
  const grass = reach[Math.floor(reach.length / 2)]!;
  const mixed = grassMixedColour(base, grass, SHIPPED_GRASS_MIX);

  const rect: PixelRect = { x0: 0, y0: 0, x1: 10, y1: 10 };
  const frame = makeFrame(10, 10, background);
  paintRect(frame, rect, mixed);

  const island: IslandSpec = { id: 'i', status: 'healthy', rect };
  const v = islandVerdict(frame, background, island, table);

  assert.equal(v.readFamily, 'healthy', `grass-mixed pixel ${JSON.stringify(mixed)} read as ${v.readFamily}`);
  assert.equal(v.pass, true);
});

test('background pixels inside the rect do not vote', () => {
  const table = fullReaderTable();
  const level = shippedLadder()[0]!;
  const background = bg();
  const frame = makeFrame(10, 10, background);
  // Only the left half is painted; the right half stays background.
  paintRect(frame, { x0: 0, y0: 0, x1: 5, y1: 10 }, deliveredForLevel(SHIPPED_GROUND_COLOUR.get('healthy')!, level));

  const island: IslandSpec = { id: 'i', status: 'healthy', rect: { x0: 0, y0: 0, x1: 10, y1: 10 } };
  const v = islandVerdict(frame, background, island, table);

  assert.equal(v.groundPixels, 50, 'the background half must not be counted as ground');
  assert.equal(v.ownShare, 1);
  assert.equal(v.pass, true);
});

test('an island rect with no ground pixels is reported EMPTY, never a pass', () => {
  const background = bg();
  const frame = makeFrame(10, 10, background);
  const island: IslandSpec = { id: 'i', status: 'healthy', rect: { x0: 0, y0: 0, x1: 10, y1: 10 } };
  const v = islandVerdict(frame, background, island);

  assert.equal(v.empty, true);
  assert.equal(v.groundPixels, 0);
  assert.equal(v.readFamily, null);
  assert.equal(v.pass, false);
});

test('a clear majority decides the plurality, and ownShare/foreignShare are not interchangeable', () => {
  const table = fullReaderTable();
  const level = shippedLadder()[0]!;
  const background = bg();
  const rect: PixelRect = { x0: 0, y0: 0, x1: 10, y1: 10 };
  const frame = makeFrame(10, 10, background);
  // 90 px healthy, 10 px unknown — an exact, checkable split.
  paintRect(frame, rect, deliveredForLevel(SHIPPED_GROUND_COLOUR.get('healthy')!, level));
  paintRect(frame, { x0: 0, y0: 0, x1: 10, y1: 1 }, deliveredForLevel(SHIPPED_GROUND_COLOUR.get('unknown')!, level));

  const island: IslandSpec = { id: 'i', status: 'healthy', rect };
  const v = islandVerdict(frame, background, island, table);

  assert.equal(v.groundPixels, 100);
  assert.equal(v.readFamily, 'healthy', 'the 90-pixel majority must decide the read, not the 10-pixel minority');
  assert.equal(v.pass, true);
  assert.equal(v.ownShare, 0.9);
  assert.equal(v.foreignShare, 0.1);
  assert.notEqual(v.ownShare, v.foreignShare, 'a swap of the two fields would still leave this false');
});

test('a family-level TIE does not automatically pass — the alphabetical tie-break decides it', () => {
  // Exactly 50/50 between `healthy` and `unknown`, on an island STAMPED `unknown`. `healthy`
  // sorts first, so the correct (first-wins, strict `>`) tie-break reads the family as `healthy`
  // and the island — stamped `unknown` — FAILS. A mutant that let a later-sorted family win an
  // exact tie (`>=` instead of `>`) would flip this specific case to a pass.
  const table = fullReaderTable();
  const level = shippedLadder()[0]!;
  const background = bg();
  const rect: PixelRect = { x0: 0, y0: 0, x1: 10, y1: 10 };
  const frame = makeFrame(10, 10, background);
  paintRect(frame, { x0: 0, y0: 0, x1: 10, y1: 5 }, deliveredForLevel(SHIPPED_GROUND_COLOUR.get('healthy')!, level));
  paintRect(frame, { x0: 0, y0: 5, x1: 10, y1: 10 }, deliveredForLevel(SHIPPED_GROUND_COLOUR.get('unknown')!, level));

  const island: IslandSpec = { id: 'i', status: 'unknown', rect };
  const v = islandVerdict(frame, background, island, table);

  assert.equal(v.groundPixels, 100);
  assert.equal(v.familyVotes['healthy'], 50);
  assert.equal(v.familyVotes['unknown'], 50);
  assert.equal(v.readFamily, 'healthy', 'an exact tie must resolve to the alphabetically first family');
  assert.equal(v.pass, false, 'a tie is not this island\'s own family, so it must not pass');
});

test('proposed and building are the SAME family, so a building island painted the shared token passes', () => {
  const table = fullReaderTable();
  const level = shippedLadder()[0]!;
  const background = bg();
  const rect: PixelRect = { x0: 0, y0: 0, x1: 6, y1: 6 };
  const frame = makeFrame(6, 6, background);
  paintRect(frame, rect, deliveredForLevel(SHIPPED_GROUND_COLOUR.get('proposed')!, level));

  const island: IslandSpec = { id: 'i', status: 'building', rect };
  const v = islandVerdict(frame, background, island, table);

  assert.equal(v.pass, true);
  assert.equal(v.readFamily, v.ownFamily);
});

// ---------------------------------------------------------------- the pair-separation table

test('statusPairSeparation reports EXACTLY one zero pair: proposed/building', () => {
  const pairs = statusPairSeparation();
  const zero = pairs.filter((p) => p.minDistance === 0);
  assert.equal(zero.length, 1, `expected one zero pair, got ${JSON.stringify(zero)}`);
  assert.deepEqual([zero[0]!.a, zero[0]!.b].sort(), ['building', 'proposed']);
  for (const p of pairs) {
    if (p === zero[0]) continue;
    assert.ok(p.minDistance > 0, `${p.a}/${p.b} separation is ${p.minDistance}, expected > 0`);
  }
});

// ---------------------------------------------------------------- the whole verdict

test('statusTruthVerdict aggregates every island and surfaces the zero pair', () => {
  const table = fullReaderTable();
  const level = shippedLadder()[0]!;
  const background = bg();
  const frame = makeFrame(20, 10, background);
  paintRect(frame, { x0: 0, y0: 0, x1: 10, y1: 10 }, deliveredForLevel(SHIPPED_GROUND_COLOUR.get('healthy')!, level));
  // Painted `unknown` but LABELLED `mapped` — a deliberate mismatch, so `allPass` must go false.
  paintRect(frame, { x0: 10, y0: 0, x1: 20, y1: 10 }, deliveredForLevel(SHIPPED_GROUND_COLOUR.get('unknown')!, level));

  const islands: IslandSpec[] = [
    { id: 'a', status: 'healthy', rect: { x0: 0, y0: 0, x1: 10, y1: 10 } },
    { id: 'b', status: 'mapped', rect: { x0: 10, y0: 0, x1: 20, y1: 10 } },
  ];
  const v = statusTruthVerdict(frame, background, islands, table);

  assert.equal(v.islands.length, 2);
  assert.equal(v.islands[0]!.pass, true);
  assert.equal(v.islands[1]!.pass, false);
  assert.equal(v.islands[1]!.readFamily, 'unknown');
  assert.equal(v.allPass, false);
  assert.ok(v.zeroPairs.some(([a, b]) => a === 'building' && b === 'proposed'));
});
