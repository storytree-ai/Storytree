import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_COVERAGE_DRAIN_CONFIG as CEILING, evaluateCoverageDrain } from "./coverage-drain.js";
import { classifyGateCoverage, projectCoverageGaps, sweepRealBuildCoverage } from "./coverage-gate.js";

/**
 * The `check:coverage` drain ceiling (`verification-integrity-arc`, ADR-0252 D3, in ADR-0168 D4's
 * shape). Pure — the core takes gap lists and what the sweep read, so every level is testable without
 * disk. The red→green pair is each axis breaching ALONE; the guards pin what the ceiling must NOT fire
 * on, since a ceiling that reds on today's honest baseline (or on a broken checkout) would buy silence
 * rather than a drain.
 *
 * The two axes carry DIFFERENT guards on purpose, because the two substrates were measured to fail in
 * opposite directions: an absent `stories/` tree DEFLATES the sweep to a false clean, while an absent
 * test-file tree INFLATES `unbound` to every scanned capability. So `uncovered` is enforced
 * unconditionally and `unbound` is not — the asymmetry is the subject of several assertions below.
 */

const CTX = { specFilesWalked: 281, scanned: 112 } as const;

const contracts = (n: number): string[] => Array.from({ length: n }, (_, i) => `cap-${i}/contract-${i}`);
const caps = (n: number): string[] => Array.from({ length: n }, (_, i) => `cap-${i}`);

// ---------------------------------------------------------------------------
// RED — each axis, on its own
// ---------------------------------------------------------------------------

test("coverage drain: the uncovered axis reds ALONE, one contract past its ceiling", () => {
  const v = evaluateCoverageDrain(
    { uncovered: contracts(CEILING.uncoveredCeiling + 1), unbound: caps(CEILING.unboundCeiling) },
    CTX,
  );
  assert.equal(v.level, "red");
  assert.equal(v.breaches.length, 1, "only the breached axis reports");
  assert.match(v.breaches[0]!, /named by no substantive test/);
  assert.match(v.breaches[0]!, new RegExp(`U=${CEILING.uncoveredCeiling}`));
});

test("coverage drain: the unbound axis reds ALONE, one capability past its ceiling", () => {
  const v = evaluateCoverageDrain(
    { uncovered: contracts(CEILING.uncoveredCeiling), unbound: caps(CEILING.unboundCeiling + 1) },
    CTX,
  );
  assert.equal(v.level, "red");
  assert.equal(v.breaches.length, 1);
  assert.match(v.breaches[0]!, /register a real-build test surface that does not exist/);
  assert.match(v.breaches[0]!, new RegExp(`B=${CEILING.unboundCeiling}`));
});

test("coverage drain: the breach names every offending id, so a RED is actionable without a second run", () => {
  const v = evaluateCoverageDrain({ uncovered: [], unbound: ["a", "b", "c"] }, CTX, {
    uncoveredCeiling: 0,
    unboundCeiling: 0,
  });
  assert.equal(v.level, "red");
  for (const id of ["a", "b", "c"]) assert.match(v.breaches[0]!, new RegExp(id));
});

// ---------------------------------------------------------------------------
// GREEN — the honest baseline, and the axes never summed
// ---------------------------------------------------------------------------

test("coverage drain: the shipped ceiling is GREEN at exactly the baseline it was measured on", () => {
  const v = evaluateCoverageDrain(
    { uncovered: contracts(CEILING.uncoveredCeiling), unbound: caps(CEILING.unboundCeiling) },
    CTX,
  );
  assert.equal(v.level, "warn", "a backlog within its ceiling still WARNs — it is never silent");
  assert.deepEqual(v.breaches, []);
});

test("coverage drain: the axes are NEVER summed — the measured concurrent case that a sum is blind to", () => {
  // Measured 2026-07-28: one session drains two uncovered contracts by authoring vouching tests while
  // another MOVES a test file without updating the spec that binds it. The summed contract total holds
  // at 121 and the capability count FALLS 41 -> 40, so a ceiling on either summed projection sees
  // nothing — while a proof surface has disappeared.
  const before = { uncovered: contracts(119), unbound: caps(1) };
  const after = { uncovered: contracts(117), unbound: caps(2) };
  assert.equal(before.uncovered.length + before.unbound.length * 2, 121, "the summed projection is unchanged...");
  assert.equal(after.uncovered.length + after.unbound.length * 2, 121, "...at exactly 121");

  assert.equal(evaluateCoverageDrain(before, CTX).level, "warn");
  const v = evaluateCoverageDrain(after, CTX);
  assert.equal(v.level, "red", "the split pair catches what the sum cannot");
  assert.equal(v.uncoveredCount, 117, "and it caught it while the authoring backlog IMPROVED");
});

test("coverage drain: a fully clean sweep over a real population certifies ok", () => {
  const v = evaluateCoverageDrain({ uncovered: [], unbound: [] }, CTX);
  assert.equal(v.level, "ok");
  assert.equal(v.unverified, undefined);
});

// ---------------------------------------------------------------------------
// The substrate guards — asymmetric, because the directions were measured to differ
// ---------------------------------------------------------------------------

test("coverage drain: the uncovered axis is enforced even on a partial sweep — its count is a LOWER bound", () => {
  // Measured: every substrate deficiency drives `uncovered` toward zero (missing files route wholly to
  // `unbound`), so nothing can manufacture this breach and it is never suppressed.
  const v = evaluateCoverageDrain(
    { uncovered: contracts(CEILING.uncoveredCeiling + 1), unbound: [] },
    { specFilesWalked: 3, scanned: 2 },
  );
  assert.equal(v.level, "red");
  assert.equal(v.suppressed, undefined);
});

test("coverage drain: an unbound breach over EVERY scanned capability is reported but NOT enforced", () => {
  // Measured: an absent test-file tree took `unbound` from 1 to 112 of 112 scanned. That is a checkout
  // fault wearing a breach's clothes.
  const v = evaluateCoverageDrain({ uncovered: [], unbound: caps(112) }, { specFilesWalked: 281, scanned: 112 });
  assert.equal(v.level, "warn", "a substrate failure never reds the gate");
  assert.equal(v.breaches.length, 1, "the breach is still COMPUTED and reported (no silent caps)");
  assert.match(v.suppressed ?? "", /measures the checkout rather than the bindings/);
});

test("coverage drain: a PARTIAL unbound breach is enforced — suppression is all-or-nothing by measurement", () => {
  const v = evaluateCoverageDrain({ uncovered: [], unbound: caps(111) }, { specFilesWalked: 281, scanned: 112 });
  assert.equal(v.level, "red");
  assert.equal(v.suppressed, undefined);
});

test("coverage drain: suppressing the unbound axis does NOT suppress a co-occurring uncovered breach", () => {
  const v = evaluateCoverageDrain(
    { uncovered: contracts(CEILING.uncoveredCeiling + 1), unbound: caps(5) },
    { specFilesWalked: 281, scanned: 5 },
  );
  assert.equal(v.level, "red", "the axis the substrate cannot inflate still reds");
  assert.equal(v.breaches.length, 2, "both are reported");
  assert.notEqual(v.suppressed, undefined);
});

test("coverage drain: a sweep that scanned NOTHING is never certified ok", () => {
  // Measured: an absent `stories/` tree and an empty one both reach scanned=0, where the check prints
  // `OK — ... (nothing to check)` and exits 0. The clean result is not evidence.
  const v = evaluateCoverageDrain({ uncovered: [], unbound: [] }, { specFilesWalked: 0, scanned: 0 });
  assert.equal(v.level, "warn");
  assert.match(v.unverified ?? "", /nothing was scanned \(0 spec file\(s\) walked/);
});

test("coverage drain: withholding ok never converts into a breach", () => {
  const v = evaluateCoverageDrain({ uncovered: [], unbound: [] }, { specFilesWalked: 0, scanned: 0 });
  assert.deepEqual(v.breaches, []);
  assert.notEqual(v.level, "red");
});

// ---------------------------------------------------------------------------
// The ceiling against the REAL corpus — the baseline is a fact on disk, not a fixture
// ---------------------------------------------------------------------------

test("coverage drain: the live corpus sweep is GREEN at the shipped ceiling", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const { units, specFilesWalked } = sweepRealBuildCoverage(path.join(repoRoot, "stories"), repoRoot);
  const { uncovered, unbound, scanned } = projectCoverageGaps(classifyGateCoverage(units));
  const v = evaluateCoverageDrain({ uncovered, unbound }, { specFilesWalked, scanned });
  assert.notEqual(
    v.level,
    "red",
    `the corpus breached its own ceiling: ${v.breaches.join(" | ")}. Drain it (author a test naming ` +
      "the contract, split/retire it, or repair the binding) — do NOT raise the ceiling (ADR-0252 D3).",
  );
});
