import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { couplingChurn, type ChurnReport, type CommitRec } from "./coupling-churn.js";

/**
 * THE CALIBRATION — `factory-floor-health-arc` close condition 2, and the reason this arc is
 * falsifiable rather than merely deliverable: *"an instrument that cannot reproduce the archaeology
 * it exists to retire has not replaced it."*
 *
 * The target is `session-decoupling-arc-inc-22`, hand-measured on 2026-08-06 by walking every
 * `merge origin/main` re-sync on `main` and diffing `sha^1...sha^2`:
 *
 *                             re-syncs   absorbed changes   per landing
 *   BEFORE (Aug 1-3)              53           1,277           16.4
 *   AFTER  (Aug 5 12:00 ->)       16             585           18.9
 *
 *   re-syncs per merged PR 0.68 -> 0.52 · `packages/**` 55.6% -> 52.3% · `stories/` 6.1% -> 9.2%
 *   `apps/studio/data/knowledge.json` absorbed by 44 of 53 re-syncs, then by none.
 *
 * WHY A FROZEN FIXTURE RATHER THAN LIVE GIT. CI checks out with `fetch-depth: 2`, so `origin/main`
 * and its history do not exist there — a live-git calibration would be red in CI or, worse, skipped.
 * `coupling-churn.fixture.json` is a verbatim capture of the two windows' re-sync and landing commits
 * plus what each re-sync absorbed, taken 2026-08-08 with the same `git log` / `git diff --name-only`
 * this module's own adapters run. It is ~230 KB and never edited; the frozen-corpus precedent is
 * `packages/library/src/fixture/corpus.ts`. Regenerate it only to re-anchor the calibration, never to
 * make a failing assertion pass.
 *
 * TOLERANCES, STATED IN ADVANCE (close condition 2 requires this):
 *   • re-sync and landing COUNTS ........ exact
 *   • absorbed file-change totals ....... ±3%
 *   • per-landing / per-PR rates ........ ±0.5 absolute
 *   • channel-composition shares ........ ±3 percentage points
 *   • hottest-object hit count .......... exact
 *
 * WHERE THE REPRODUCTION IS NOT EXACT, AND WHY. Every count in the AFTER window reproduces to the
 * unit; the BEFORE window's absorbed total is 1,307 against a hand-counted 1,277 (+2.3%). The
 * composition shares land ~1-2pp off because inc-22's denominator is not recoverable from its prose:
 * it reports six buckets whose shares do not sum over any total it also states. This module's
 * denominator is DECLARED instead — the classified files, with `unclassified` printed beside them —
 * so the next reader can check the arithmetic rather than infer it.
 */

interface Fixture {
  commits: CommitRec[];
  paths: string[];
  absorbed: Record<string, number[]>;
}

const fixture: Fixture = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "coupling-churn.fixture.json"), "utf8"),
) as Fixture;

const absorbedFor = (commit: CommitRec): string[] =>
  (fixture.absorbed[commit.sha] ?? []).map((i) => fixture.paths[i] ?? "");

/** `session-decoupling-arc-inc-22`'s windows, in the +10:00 local time its day boundaries used. */
const BEFORE = { from: "2026-07-31T14:00:00Z", to: "2026-08-03T14:00:00Z" };
const AFTER = { from: "2026-08-05T02:00:00Z", to: "2026-08-06T06:00:00Z" };

function run(window: { from: string; to: string }): ChurnReport {
  return couplingChurn({ commits: fixture.commits, absorbedFor, window });
}

function shareOf(report: ChurnReport, channel: string): number {
  return (report.channels.find((c) => c.channel === channel)?.share ?? 0) * 100;
}

test("CALIBRATION before: 53 re-syncs over 78 landings, the hand-walked count exactly", () => {
  const report = run(BEFORE);
  assert.equal(report.sample.resyncs, 53);
  assert.equal(report.sample.landings, 78);
});

test("CALIBRATION before: absorbed churn 1,277 ±3% and per-landing 16.4 ±0.5", () => {
  const report = run(BEFORE);
  assert.ok(
    Math.abs(report.sample.absorbedChanges - 1277) / 1277 <= 0.03,
    `absorbed ${report.sample.absorbedChanges} is outside 1,277 ±3%`,
  );
  assert.ok(
    Math.abs(report.perLandingAbsorbedChurn - 16.4) <= 0.5,
    `per-landing ${report.perLandingAbsorbedChurn.toFixed(1)} is outside 16.4 ±0.5`,
  );
});

test("CALIBRATION after: 16 re-syncs, 585 absorbed changes, 18.9 per landing — exact", () => {
  const report = run(AFTER);
  assert.equal(report.sample.resyncs, 16);
  assert.equal(report.sample.landings, 31);
  assert.equal(report.sample.absorbedChanges, 585);
  assert.equal(Number(report.perLandingAbsorbedChurn.toFixed(1)), 18.9);
});

test("CALIBRATION: channel composition reproduces packages/** 55.6% -> 52.3% within 3pp", () => {
  const before = run(BEFORE);
  const after = run(AFTER);
  assert.ok(Math.abs(shareOf(before, "packages/**") - 55.6) <= 3, `before ${shareOf(before, "packages/**").toFixed(1)}%`);
  assert.ok(Math.abs(shareOf(after, "packages/**") - 52.3) <= 3, `after ${shareOf(after, "packages/**").toFixed(1)}%`);
  assert.ok(Math.abs(shareOf(before, "stories/") - 6.1) <= 3, `before stories ${shareOf(before, "stories/").toFixed(1)}%`);
  assert.ok(Math.abs(shareOf(after, "stories/") - 9.2) <= 3, `after stories ${shareOf(after, "stories/").toFixed(1)}%`);
  // The finding inc-22 actually rested on: the named coupling channel did NOT move.
  assert.ok(
    Math.abs(shareOf(before, "packages/**") - shareOf(after, "packages/**")) < 10,
    "packages/** is unchanged across the remedy — the arc's real conclusion",
  );
});

test("CALIBRATION: the single worst tenant — knowledge.json in 44 of 53 re-syncs, then none", () => {
  const before = run(BEFORE);
  const after = run(AFTER);
  const hot = before.hottest.find((h) => h.path === "apps/studio/data/knowledge.json");
  assert.equal(hot?.resyncs, 44, "the hottest object, absorbed by 83% of re-syncs");
  assert.equal(before.hottest[0]?.path, "apps/studio/data/knowledge.json", "and it led the list");
  assert.equal(
    after.hottest.some((h) => h.path === "apps/studio/data/knowledge.json"),
    false,
    "it was deleted (ADR-0302 D1) and is now absorbed by nothing",
  );
});

test("CALIBRATION: re-syncs per merged PR 0.68 -> 0.52 — but BOTH windows refuse to trend it", () => {
  // This is the arc's close condition 3 against the live fixture, and it is the whole point of D2:
  // the ratio inc-22 reported is exactly the figure this instrument declines to render, because
  // neither window reaches the reference dispatch rate. inc-22 had to say so in hand-written prose;
  // here the refusal is the output.
  const before = run(BEFORE);
  const after = run(AFTER);
  assert.equal(before.resyncsPerLanding, undefined);
  assert.equal(after.resyncsPerLanding, undefined);
  assert.equal(before.comparability.comparable, false);
  assert.equal(after.comparability.comparable, false);
  assert.ok(after.comparability.comparable === false);
  assert.match(after.comparability.failed, /landings\/day is \d+% of the reference 34\/day/);

  // The raw ratios are still recoverable from the sample the report always prints — a reader who
  // wants the number can compute it; what they cannot do is read it as a trend without seeing why.
  assert.equal(Number((before.sample.resyncs / before.sample.landings).toFixed(2)), 0.68);
  assert.equal(Number((after.sample.resyncs / after.sample.landings).toFixed(2)), 0.52);
});

test("CALIBRATION: the day the problem was measured DOES clear the comparability floor", () => {
  // 2026-08-03 (+10:00) is `session-decoupling-arc`'s own reference day. If the instrument refused
  // even here, the floor would be unreachable and the refusal meaningless.
  const report = run({ from: "2026-08-02T14:00:00Z", to: "2026-08-03T14:00:00Z" });
  assert.equal(report.comparability.comparable, true);
  assert.ok(report.resyncsPerLanding !== undefined);
  assert.equal(Number(report.resyncsPerLanding.toFixed(2)), 0.89, "inc-22's own daily series value");
  assert.equal(report.sample.landings, 45);
});

test("CALIBRATION: the daily ratio series reproduces inc-22's six published values", () => {
  // 0.40 / 0.39 / 0.89 / 0.27 / 0.33 / 0.56 across 2026-08-01..06 (+10:00). The fixture holds only
  // the two calibration windows, so Aug 4 and the second half of Aug 5-6 are outside it; the three
  // days it fully covers are asserted here and the rest is the instrument's to re-read from git.
  const day = (d: number) => ({
    from: new Date(Date.parse("2026-07-31T14:00:00Z") + (d - 1) * 86_400_000).toISOString(),
    to: new Date(Date.parse("2026-07-31T14:00:00Z") + d * 86_400_000).toISOString(),
  });
  const series = [1, 2, 3].map((d) => {
    const r = run(day(d));
    return Number((r.sample.resyncs / r.sample.landings).toFixed(2));
  });
  assert.deepEqual(series, [0.4, 0.39, 0.89]);
});
