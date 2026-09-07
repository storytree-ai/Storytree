import { test } from "node:test";
import assert from "node:assert/strict";

import type { Resteer } from "./knowledge.js";
import {
  interventionRate,
  resteerReport,
  RESTEER_CAPTURE_START,
  RESTEER_NOT_COMPUTABLE,
  RESTEER_NOT_COMPUTABLE_WITH_DENOMINATOR,
  type SessionPopulation,
} from "./resteer-report.js";

/**
 * The re-steer tier's DENOMINATOR (`follow-the-research-arc`, increment
 * `resteer-session-denominator`). These tests fence the four ways an intervention rate can be quietly
 * wrong: counting a session twice, counting an unattributable row as a session, letting the numerator
 * escape the denominator, and reporting 0% where the honest answer is "no data".
 */

function row(id: string, branch: string | undefined): Resteer {
  // Built in two statements rather than with a conditional spread: an unstamped row must genuinely
  // OMIT `provenance`, and `...(cond ? {} : {…})` hides that omission behind an empty object
  // (`anti-slop(no-conditional-empty-object-spread)`).
  const base = {
    kind: "resteer",
    id,
    title: `re-steer ${id}`,
    description: "fixture",
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    schemaVersion: 1,
    references: [],
    disposition: "defect",
    dispositionBy: "owner",
    mode: "step-repetition",
  };
  if (branch === undefined) return base as Resteer;
  return { ...base, provenance: { branch, date: "2026-09-06", source: "retro" } } as Resteer;
}

function population(branches: readonly string[]): SessionPopulation {
  return { branches, since: RESTEER_CAPTURE_START, source: "test fixture" };
}

test("resteer-denominator: the rate is sessions-with-an-intervention over sessions, not rows over sessions", () => {
  // FOUR rows, TWO of them on the same branch. A session the owner corrected four times is still ONE
  // intervened session — counting rows here would report 4/3 and exceed 100%.
  const rows = [
    row("a", "claude/one"),
    row("b", "claude/one"),
    row("c", "claude/one"),
    row("d", "claude/two"),
  ];
  const reading = interventionRate(rows, population(["claude/one", "claude/two", "claude/three"]));

  assert.equal(reading.interveneSessions, 2);
  assert.equal(reading.totalSessions, 3);
  assert.equal(reading.rate, 2 / 3);
});

test("resteer-denominator: an unattributable stamp is counted in NEITHER side", () => {
  // `HEAD` is what a detached checkout reports; a row with no provenance falls back to `(unstamped)`.
  // Both name a session nothing can identify, so neither may enter the numerator (that would assert
  // an attribution) and neither can enter the denominator (which is built from branch names).
  const rows = [row("a", "claude/one"), row("b", "HEAD"), row("c", undefined)];
  const reading = interventionRate(rows, population(["claude/one", "claude/two"]));

  assert.equal(reading.interveneSessions, 1);
  assert.equal(reading.totalSessions, 2);
  assert.equal(reading.rate, 0.5);
  assert.equal(reading.unattributableRows, 2);
  assert.deepEqual(reading.outsidePopulation, []);
});

test("resteer-denominator: a filing branch outside the population is reported, never folded into the numerator", () => {
  // A session that filed a re-steer and never landed leaves no merge commit, so it is absent from the
  // population. Counting it anyway would let the numerator escape the denominator — the one arithmetic
  // failure that can print a rate above 100%.
  // Seeded in NON-alphabetical order so the result proves the SORT rather than inheriting insertion
  // order from the filing set. A reader comparing this list across two windows needs it stable.
  const rows = [
    row("a", "claude/landed"),
    row("b", "claude/zeta-abandoned"),
    row("c", "claude/alpha-abandoned"),
  ];
  const reading = interventionRate(rows, population(["claude/landed"]));

  assert.equal(reading.interveneSessions, 1);
  assert.equal(reading.totalSessions, 1);
  assert.equal(reading.rate, 1);
  assert.deepEqual(reading.outsidePopulation, [
    "claude/alpha-abandoned",
    "claude/zeta-abandoned",
  ]);
});

test("resteer-denominator: the numerator can never exceed the denominator", () => {
  // The property the previous test fences by example, stated directly: whatever the rows say, a rate
  // over 1 is unreachable.
  const rows = ["p", "q", "r", "s"].map((id) => row(id, `claude/${id}`));
  const reading = interventionRate(rows, population(["claude/p"]));

  assert.ok(reading.rate !== undefined && reading.rate <= 1);
  assert.equal(reading.interveneSessions, 1);
});

test("resteer-denominator: an empty population reports undefined, never a reassuring 0%", () => {
  // A 0% intervention rate over zero sessions reads as a factory nobody ever had to correct. The
  // honest answer is that the figure is undefined.
  const reading = interventionRate([row("a", "claude/one")], population([]));

  assert.equal(reading.rate, undefined);
  assert.equal(reading.totalSessions, 0);
});

test("resteer-denominator: the report is honest either way — no population means the rate stays NOT COMPUTABLE", () => {
  const rows = [row("a", "claude/one")];

  const without = resteerReport(rows);
  assert.equal(without.interventionRate, undefined);
  assert.deepEqual(without.notComputable, RESTEER_NOT_COMPUTABLE);
  assert.ok(
    without.notComputable.some((c) => c.includes("HUMAN INTERVENTION RATE")),
    "without a denominator the tier must still say the rate cannot be computed",
  );

  const with_ = resteerReport(rows, population(["claude/one", "claude/two"]));
  assert.equal(with_.interventionRate?.rate, 0.5);
  assert.deepEqual(with_.notComputable, RESTEER_NOT_COMPUTABLE_WITH_DENOMINATOR);
});

test("resteer-denominator: TCR@k stays uncomputable once a denominator exists, and the reason narrows", () => {
  // The denominator SELECTS ON LANDING, so a completion rate over it is ~100% by construction. That is
  // a selection artifact, not a finding, and the caveat must say so rather than disappearing.
  const report = resteerReport([row("a", "claude/one")], population(["claude/one"]));

  // The whole caveat, verbatim. A half of it that silently emptied would still satisfy a
  // `includes("TCR@k")` check while losing the reason — and the reason IS the content here.
  assert.deepEqual(report.notComputable, [
    "TCR@k — the session denominator SELECTS ON LANDING, so every session in it completed by " +
      "construction and a completion rate over that population would read ~100% as a selection " +
      "artifact. It needs a population that includes the sessions which never landed.",
  ]);
  assert.ok(
    !report.notComputable.some((c) => c.includes("HUMAN INTERVENTION RATE")),
    "the intervention-rate caveat must be gone once the rate is actually reported",
  );
});

test("resteer-denominator: the window floor is the capture's own start date", () => {
  // Sessions before the capture landed could not have filed a row. Widening the window past this date
  // only inflates the denominator and drives the rate toward zero — the reassuring direction.
  assert.equal(RESTEER_CAPTURE_START, "2026-09-05");
});
