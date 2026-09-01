import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MIN_RUNS_FOR_AGREEMENT,
  runAgreement,
  sharedKeys,
  type RunRow,
} from './run-agreement.js';

function row(key: string, medianMs: number, spreadMs: number): RunRow {
  return { key, medianMs, spreadMs };
}

// ---------------------------------------------------------------- the real runs it was built on
//
// The two RTX 2060 runs from `docs/research/chapter2-land-floor-2026-09-01/`, verbatim. A rule
// derived from the data it will judge must be checked against that data, or it is a rule about
// nothing.

const RUN_1: RunRow[] = [
  row('flat@one@8', 0.1644, 0.008),
  row('grass@one@8', 0.5862, 0.0212),
  row('grass-amplified@one@8', 4.2216, 0.0556),
  row('flat@forest@8', 0.2505, 0.0053),
  row('grass@forest@8', 0.671, 0.0094),
  row('grass-amplified@forest@8', 4.3149, 0.119),
];
const RUN_2: RunRow[] = [
  row('flat@one@8', 0.1645, 0.0083),
  row('grass@one@8', 0.5861, 0.0259),
  row('grass-amplified@one@8', 4.2196, 0.075),
  row('flat@forest@8', 0.2499, 0.0019),
  row('grass@forest@8', 0.6711, 0.0021),
  row('grass-amplified@forest@8', 4.3128, 0.0041),
];

test('the two committed RTX 2060 runs reproduce — every row, nothing dropped', () => {
  const v = runAgreement([RUN_1, RUN_2]);
  assert.equal(v.status, 'AGREED');
  assert.deepEqual(v.droppedKeys, []);
  assert.equal(v.rows.length, 6);
  assert.ok(v.rows.every((r) => r.agreed));
  assert.equal(v.suspectIdentical, false, 'the runs differ in the last digit, as a real clock does');
});

test('the arc’s own 170–530% disagreements are DROPPED, not averaged', () => {
  // The failure this rule exists for, in the numbers the arc records from the last land increment.
  const a = [row('forest@2', 1.0, 0.05)];
  const b = [row('forest@2', 5.3, 0.06)];
  const v = runAgreement([a, b]);
  assert.equal(v.status, 'ROWS_DROPPED');
  assert.deepEqual(v.droppedKeys, ['forest@2']);
  assert.match(v.dropped[0]!, /DROPPED, not averaged/);
  assert.match(v.dropped[0]!, /430\.0%/);
  // And the averaged value appears NOWHERE — quoting 3.15 would describe neither run.
  assert.ok(!JSON.stringify(v).includes('3.15'));
});

// ---------------------------------------------------------------- the tolerance is DERIVED

test('the bar is the widest within-run spread, not an authored percentage', () => {
  // Gap 0.05 against spreads of 0.04 and 0.06 -> the wider one, 0.06, admits it.
  const admitted = runAgreement([[row('k', 1.0, 0.04)], [row('k', 1.05, 0.06)]]);
  assert.equal(admitted.status, 'AGREED');
  assert.ok(Math.abs(admitted.rows[0]!.toleranceMs - 0.06) < 1e-9);

  // The SAME gap against narrower spreads is a real disagreement. Nothing about the gap changed —
  // only what the runs said their own noise was.
  const refused = runAgreement([[row('k', 1.0, 0.01)], [row('k', 1.05, 0.02)]]);
  assert.equal(refused.status, 'ROWS_DROPPED');
});

test('a gap exactly at the tolerance is admitted; a hair over is not', () => {
  // ⚠ BINARY-EXACT VALUES ON PURPOSE. `1.1 - 1.0` is 0.10000000000000009, so a boundary test
  // written with those numbers fails on float representation rather than on the rule, and the
  // tempting repair — an epsilon on the comparison — is a fudge factor smuggled into the one
  // place this module refuses to have one. 1.25 - 1.0 is exact.
  assert.equal(runAgreement([[row('k', 1.0, 0.25)], [row('k', 1.25, 0.25)]]).status, 'AGREED');
  assert.equal(
    runAgreement([[row('k', 1.0, 0.25)], [row('k', 1.2500001, 0.25)]]).status,
    'ROWS_DROPPED',
  );
});

test('no authored percentage appears in the module at all', async () => {
  // ⚠ The neighbourhood's own history: an earlier `hardware-floor.mjs` scored rungs against
  // `16.7 * 1.35`, and its comment records 1.35 as "a number picked to make the answer come out".
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'run-agreement.ts'),
    'utf8',
  );
  const body = src.slice(src.indexOf('export function runAgreement'));
  assert.ok(!/\*\s*1\.\d/.test(body), 'no multiplicative fudge factor in the judging code');
  assert.ok(!/tolerance\w*\s*=\s*0\.\d/.test(body), 'the tolerance must come from the runs');
});

// ---------------------------------------------------------------- a single run is not a pass

test('one run is SINGLE_RUN — the absence of the question, never a tolerance that was met', () => {
  const v = runAgreement([RUN_1]);
  assert.equal(v.status, 'SINGLE_RUN');
  assert.equal(v.runs, 1);
  assert.match(v.prose, /NOT a pass/);
  // Every row must be marked un-agreed: nothing compared it to anything.
  assert.ok(v.rows.every((r) => !r.agreed));
});

test('no runs at all is its own status, not an empty pass', () => {
  const v = runAgreement([]);
  assert.equal(v.status, 'NO_RUNS');
  assert.deepEqual(v.rows, []);
  assert.doesNotMatch(v.prose, /AGREED/);
});

test('two runs is the bar, and it is a count rather than a convention', () => {
  assert.equal(MIN_RUNS_FOR_AGREEMENT, 2);
  assert.equal(runAgreement([RUN_1, RUN_2]).status, 'AGREED');
});

// ------------------------------------------------ byte-identical is a SUSPICION, not a triumph

test('all rows bit-identical is flagged — for a GPU clock that means the sweep did not rerun', () => {
  // ⚠ A verdict that scored equality highest would rank its own worst failure mode top:
  // `comparison-baseline-moves-under-the-page` produces exactly this symptom.
  const v = runAgreement([RUN_1, RUN_1]);
  assert.equal(v.status, 'AGREED');
  assert.equal(v.suspectIdentical, true);
  assert.match(v.prose, /near-impossible/);
  assert.match(v.prose, /second sweep did not run/);
});

test('one identical row among moving ones is NOT suspicious', () => {
  const a = [row('x', 1.0, 0.1), row('y', 2.0, 0.1)];
  const b = [row('x', 1.0, 0.1), row('y', 2.05, 0.1)];
  const v = runAgreement([a, b]);
  assert.equal(v.suspectIdentical, false);
  assert.equal(v.rows.find((r) => r.key === 'x')!.identical, true);
  assert.equal(v.rows.find((r) => r.key === 'y')!.identical, false);
});

test('a single run is never flagged identical — there is nothing it could equal', () => {
  assert.equal(runAgreement([RUN_1]).suspectIdentical, false);
});

// ---------------------------------------------------------------- rows must be in EVERY run

test('a row missing from one run is dropped and NAMED, never carried by its neighbours', () => {
  const a = [row('x', 1.0, 0.1), row('only-in-a', 9.0, 0.1)];
  const b = [row('x', 1.0, 0.1)];
  const v = runAgreement([a, b]);
  assert.equal(v.status, 'ROWS_DROPPED');
  assert.ok(v.droppedKeys.includes('only-in-a'));
  assert.match(v.dropped.join('\n'), /nothing to reproduce against/);
  // And it must not appear among the quotable rows.
  assert.ok(!v.rows.some((r) => r.key === 'only-in-a'));
});

test('sharedKeys is the intersection, not the union', () => {
  assert.deepEqual(
    sharedKeys([
      [row('a', 1, 0), row('b', 1, 0)],
      [row('b', 1, 0), row('c', 1, 0)],
    ]),
    ['b'],
  );
});

test('the dropped count is over every configuration touched, including absent ones', () => {
  const a = [row('x', 1.0, 0.1), row('only-in-a', 9.0, 0.1)];
  const b = [row('x', 5.0, 0.1)];
  const v = runAgreement([a, b]);
  // Two dropped — 'x' disagreed, 'only-in-a' was absent — out of two considered.
  assert.equal(v.droppedKeys.length, 2);
  assert.match(v.prose, /2 of 2 row\(s\)/);
});

// ---------------------------------------------------------------- the reported arithmetic

test('the gap and its percentage are reported so a reader can check them', () => {
  const v = runAgreement([[row('k', 1.0, 0.001)], [row('k', 1.5, 0.001)]]);
  const r = v.rows[0]!;
  assert.ok(Math.abs(r.gapMs - 0.5) < 1e-9);
  assert.ok(Math.abs(r.gapPct - 50) < 1e-9, 'the percentage is taken over the SMALLER median');
  assert.deepEqual(r.medians, [1.0, 1.5]);
  assert.deepEqual(r.spreads, [0.001, 0.001]);
});

test('more than two runs are compared across all of them, not pairwise', () => {
  // The widest disagreement is what must clear the bar — a middle run cannot rescue two outliers.
  const v = runAgreement([
    [row('k', 1.0, 0.05)],
    [row('k', 1.02, 0.05)],
    [row('k', 1.5, 0.05)],
  ]);
  assert.equal(v.status, 'ROWS_DROPPED');
  assert.ok(Math.abs(v.rows[0]!.gapMs - 0.5) < 1e-9);
  assert.equal(v.runs, 3);
});

test('a zero median does not produce a NaN or Infinity percentage', () => {
  const v = runAgreement([[row('k', 0, 0)], [row('k', 0, 0)]]);
  assert.equal(v.rows[0]!.gapPct, 0);
  assert.ok(Number.isFinite(v.rows[0]!.gapPct));
});
