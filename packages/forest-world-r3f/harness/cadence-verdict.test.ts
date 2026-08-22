// cadence-verdict.test.ts — the check that was missing when the report shipped a false claim.
//
// The ADR-0380 D2 report carried exactly one statement no instrument checked: a hand-typed
// sentence about which rung's rafP95 was higher, which its own rows contradicted. Every
// computed field in that file was correct. So the test that matters is not "is the arithmetic
// right" — it is "is the PROSE still what the data says", which is the assertion below that
// reads the committed artifact and re-derives its sentence.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { cadenceNoiseFloorMs, describeCadence, type CadenceVerdictInput } from './cadence-verdict.js';

/** The committed 2026-08-19 evidence artifact — the one three write-ups cite. */
const REPORT_URL = new URL(
  '../../../docs/research/chapter2-live-render-2026-08-19/hardware-floor-report.json',
  import.meta.url,
);

interface Report {
  controls: { blankPage: { p50: number; p95: number } };
  sweep: { plants: number; rafP50: number; rafP95: number }[];
  verdict: { realCorpusIslandPlants: number; cadenceNoiseFloorMs: number; cadenceIsUninformative: string };
}

function committedReport(): Report {
  return JSON.parse(readFileSync(REPORT_URL, 'utf8')) as Report;
}

function inputFrom(report: Report): CadenceVerdictInput {
  return {
    sweep: report.sweep,
    blankPage: report.controls.blankPage,
    islandPlants: report.verdict.realCorpusIslandPlants,
  };
}

test('the committed report\'s cadence sentence is what its own rows produce', () => {
  const report = committedReport();
  assert.equal(
    describeCadence(inputFrom(report)),
    report.verdict.cadenceIsUninformative,
    'the published prose has drifted from the data it describes — which is the exact defect ' +
      'this module was written to end, and hand-editing either side is what causes it',
  );
});

test('the committed noise floor is the one the controls establish', () => {
  const report = committedReport();
  assert.equal(cadenceNoiseFloorMs(inputFrom(report)), report.verdict.cadenceNoiseFloorMs);
});

test('the sentence states the empty and island rungs read the SAME, because they do', () => {
  // The correction itself, asserted against the artifact rather than against a memory of it:
  // the 0-plant and 171-plant rungs both read 18.1, so no reading of this report may say one
  // is higher than the other. That was the false claim.
  const report = committedReport();
  const empty = report.sweep.find((r) => r.plants === 0);
  const island = report.sweep.find((r) => r.plants === report.verdict.realCorpusIslandPlants);
  assert.ok(empty && island);
  assert.equal(empty.rafP95, island.rafP95);
  assert.match(report.verdict.cadenceIsUninformative, /is AT the empty-scene noise floor/);
  assert.doesNotMatch(report.verdict.cadenceIsUninformative, /HIGHER/);
});

test('NON-VACUITY: the sentence is derived — move a number and it moves', () => {
  // Without this, everything above would still pass if `describeCadence` returned one frozen
  // string, which is precisely the failure being repaired.
  const report = committedReport();
  const base = describeCadence(inputFrom(report));
  const lifted = describeCadence({
    ...inputFrom(report),
    sweep: report.sweep.map((r) =>
      r.plants === report.verdict.realCorpusIslandPlants ? { ...r, rafP95: r.rafP95 + 4 } : r,
    ),
  });
  assert.notEqual(base, lifted);
  assert.match(lifted, /sits 4\.0 ms above the empty-scene noise floor/);
});

test('an island rung above the floor is described as above it, not at it', () => {
  // The 2026-08-21 re-run of this instrument has exactly this shape — 0-plant 18.5, island
  // 18.6 — so the branch is a real run's, not a hypothetical.
  const sentence = describeCadence({
    blankPage: { p50: 16.7, p95: 18 },
    islandPlants: 171,
    sweep: [
      { plants: 0, rafP50: 16.7, rafP95: 18.5 },
      { plants: 171, rafP50: 16.7, rafP95: 18.6 },
    ],
  });
  assert.match(sentence, /sits 0\.1 ms above the empty-scene noise floor of 18\.5 ms/);
  assert.doesNotMatch(sentence, /is AT the empty-scene noise floor/);
});

test('a sweep whose p95 rises with weight is NOT reported as an inversion', () => {
  const sentence = describeCadence({
    blankPage: { p50: 16.7, p95: 16.8 },
    islandPlants: 171,
    sweep: [
      { plants: 0, rafP50: 16.7, rafP95: 17 },
      { plants: 50, rafP50: 16.7, rafP95: 17.5 },
      { plants: 171, rafP50: 16.7, rafP95: 18 },
      { plants: 500, rafP50: 16.7, rafP95: 22 },
    ],
  });
  assert.match(sentence, /does rise with weight/);
  assert.doesNotMatch(sentence, /does not order the rungs by weight/);
});

test('the durable claim survives every branch — read gpuMsPerFrame, not the cadence', () => {
  const shapes: CadenceVerdictInput[] = [
    inputFrom(committedReport()),
    {
      blankPage: { p50: 16.7, p95: 18 },
      islandPlants: 171,
      sweep: [{ plants: 0, rafP50: 16.7, rafP95: 18 }],
    },
    {
      blankPage: { p50: 16.7, p95: 16.8 },
      islandPlants: 171,
      sweep: [
        { plants: 0, rafP50: 16.7, rafP95: 17 },
        { plants: 171, rafP50: 16.7, rafP95: 18 },
      ],
    },
  ];
  for (const shape of shapes) {
    assert.match(describeCadence(shape), /Read gpuMsPerFrame, not the cadence/);
  }
});
