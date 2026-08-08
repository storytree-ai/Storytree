import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyGateCoverage,
  runCoverageGate,
  loadRealBuildCoverageUnits,
  projectCoverageGaps,
  sweepRealBuildCoverage,
  type GateCoverageUnit,
} from "./coverage-gate.js";

/*
 * LOAD-BEARING — DO NOT DELETE WITH THE UNWIRED ADR-0311 LEFTOVERS.
 *
 * `check:coverage` was retired by ADR-0311 D2 and `coverage-gate.ts` beside this file carries the
 * UNWIRED banner, so this file LOOKS like a leftover. It is not. The `end-to-end over the REAL
 * corpus` test below runs inside `pnpm -r test` — GATE_PLAN step 6, which CI runs too — and walks
 * the real `stories/` tree, pinning live proof bindings that nothing else pins: that
 * `deploy-health-signal` and `act2-regrow-camera-zoom-out` are scanned and fully covered, and
 * act2's two literal `apps/studio/` proof paths. Moving or renaming one of those files reds HERE.
 *
 * Deleting this file drops that check silently. Declared, with its cost, in `gate-order.ts`'s
 * RETIRED_TEST_COMPANIONS; `gate-order.test.ts` reds if the file or the banner goes. That is not a
 * licence to re-wire the rung — ADR-0311 D5 still governs that, and this is an ordinary test.
 */

/**
 * `check:coverage` — the gate-level contract-coverage sweep (ADR-0122 R1, the deferred gate WARN-step).
 *
 * Pure-by-injection (the unit loader is a seam), so the WARN/OK decision is tested with fixture units —
 * no disk, no DB. The headline red→green: a real-build capability that DROPS a contract makes the gate
 * WARN; a fully-covered set is a clean OK. The final test grounds the disk wiring (walk + loadNodeSpec +
 * the real-surface filter + extractTestNames + classify) on the real corpus.
 */

const COVERED: GateCoverageUnit = {
  unitId: "deploy-health-signal",
  tier: "capability",
  contractIds: [
    "deploy-health-red-run-classifies-loud",
    "deploy-health-green-run-classifies-quiet",
    "deploy-health-no-signal-classifies-unknown",
  ],
  testNames: [
    "deploy-health-red-run-classifies-loud: a failing newest run formats a loud WARN",
    "deploy-health-green-run-classifies-quiet: a green newest run formats one quiet line",
    "deploy-health-no-signal-classifies-unknown: no completed run reads UNVERIFIED",
  ],
  testFiles: ["packages/cli/src/deploy-health.test.ts"],
  testFilePresent: true,
};

// The documented drop: four declared contracts, only one named by a test (ADR-0122 context).
const UNDER_COVERED: GateCoverageUnit = {
  unitId: "shared-forest-connection",
  tier: "capability",
  contractIds: [
    "fr-ready-when-broker-accepts-builder",
    "fr-fails-closed-with-guidance-when-unbrokered",
    "fr-bounded-never-hangs",
    "fr-write-brokers-not-direct",
  ],
  testNames: ["fr-ready-when-broker-accepts-builder: a reachable broker reports ready"],
  testFiles: ["apps/desktop/src/backend/forest-readiness.test.ts"],
  testFilePresent: true,
};

test("RED: a real-build capability that drops a contract makes the gate WARN and names it", () => {
  const { warn, lines } = runCoverageGate({ loadUnits: () => [COVERED, UNDER_COVERED] });
  assert.equal(warn, true);
  const body = lines.join("\n");
  assert.match(body, /WARN — 1 real-build capability/);
  assert.match(body, /shared-forest-connection: 3\/4 uncovered/);
  // The dropped robustness contract is named — exactly the gap a signed green silently omits.
  assert.match(body, /fr-bounded-never-hangs/);
  // The fully-covered capability is NOT named in the WARN list.
  assert.doesNotMatch(body, /deploy-health-signal: /);
});

test("GREEN: a fully-covered set is a clean OK, no WARN", () => {
  const { warn, lines } = runCoverageGate({ loadUnits: () => [COVERED] });
  assert.equal(warn, false);
  const body = lines.join("\n");
  assert.match(body, /OK — every declared contract is covered/);
  assert.match(body, /1 real-build capability\(ies\) \(3 contracts\)/);
  assert.doesNotMatch(body, /WARN/);
});

test("empty sweep (no real-build capability declares contracts) is a clean OK", () => {
  const { warn, lines } = runCoverageGate({ loadUnits: () => [] });
  assert.equal(warn, false);
  assert.match(lines.join("\n"), /nothing to check/);
});

test("classifyGateCoverage: a capability with no contracts is vacuously covered, never under-covered", () => {
  const report = classifyGateCoverage([
    { unitId: "x", tier: "capability", contractIds: [], testNames: [], testFiles: [], testFilePresent: true },
  ]);
  assert.equal(report.clean, true);
  assert.equal(report.underCovered.length, 0);
  assert.equal(report.scanned[0]?.total, 0);
});

test("classifyGateCoverage: multiple under-covered capabilities are all collected, in scan order", () => {
  const report = classifyGateCoverage([
    UNDER_COVERED,
    COVERED,
    { ...UNDER_COVERED, unitId: "another-gap" },
  ]);
  assert.deepEqual(
    report.underCovered.map((u) => u.unitId),
    ["shared-forest-connection", "another-gap"],
  );
  assert.equal(report.clean, false);
});

test("end-to-end over the REAL corpus: the disk loader filters to real-build capabilities and clears deploy-health-signal", () => {
  // No fixture loader — the real disk loader walks stories/, keeps only capabilities with a registered
  // real-build surface (proof.real.testFile) AND ≥1 declared contract, and scans that exact test file.
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const storiesDir = path.join(repoRoot, "stories");
  const report = classifyGateCoverage(loadRealBuildCoverageUnits(storiesDir, repoRoot));

  // The sweep is non-empty (the corpus has real-build capabilities with contracts).
  assert.ok(report.scanned.length > 0, "expected ≥1 real-build capability with contracts in the corpus");
  // The FILTER property (the safety net): every scanned unit truly declares ≥1 contract — an unbuilt
  // `proposed` capability with no real-build surface is never scanned, so the WARN cannot nag it.
  for (const u of report.scanned) {
    assert.ok(u.total > 0, `${u.unitId} should declare ≥1 contract to be scanned`);
  }
  // deploy-health-signal: a real-build surface (deploy-health.test.ts) whose three suites NAME its
  // three contracts — scanned and fully covered (the stable grounding, robust to other gaps being
  // closed; re-grounded here when declare-presence was retired by ADR-0200).
  const health = report.scanned.find((u) => u.unitId === "deploy-health-signal");
  assert.ok(health, "deploy-health-signal should be scanned (it has a real-build surface + contracts)");
  assert.equal(health.uncovered.length, 0, "deploy-health-signal's contracts are all covered");
  assert.ok(
    health.testFiles.some((f) => f.includes("deploy-health.test.ts")),
    "deploy-health-signal's scanned surface should be its registered real-build test file",
  );

  const act2 = report.scanned.find((u) => u.unitId === "act2-regrow-camera-zoom-out");
  assert.ok(act2, "act2-regrow-camera-zoom-out should be scanned");
  assert.deepEqual(act2.uncovered, [], "the drain sweep sees contract names from both real proof files");
  assert.deepEqual(act2.testFiles, [
    "apps/studio/src/lib/worldCamera.act2Bottom.node.ts",
    "apps/studio/src/components/TreeView.act2Camera.test.tsx",
  ]);
});

// ---------------------------------------------------------------------------
// The drain-ceiling projection (the axis split — `coverage-drain.ts` evaluates it)
// ---------------------------------------------------------------------------

test("projectCoverageGaps: a capability with NO test file on disk routes wholly to `unbound`, never to `uncovered`", () => {
  // This is the property that makes the uncovered axis immune to a deficient checkout, so it is
  // asserted rather than assumed: measured, an absent test-file tree drives `uncovered` to 0 and
  // `unbound` to every scanned capability. If a missing file leaked into `uncovered`, a broken
  // checkout could manufacture a breach on the axis that is enforced unconditionally.
  const gaps = projectCoverageGaps(
    classifyGateCoverage([{ ...UNDER_COVERED, testFilePresent: false }, COVERED]),
  );
  assert.deepEqual(gaps.uncovered, [], "no contract of an unbound capability counts as an authoring gap");
  assert.deepEqual(gaps.unbound, ["shared-forest-connection"]);
  assert.equal(gaps.scanned, 2, "both capabilities were still scanned");
});

test("projectCoverageGaps: an under-covered capability WITH its file present yields qualified contract ids", () => {
  const gaps = projectCoverageGaps(classifyGateCoverage([UNDER_COVERED, COVERED]));
  assert.deepEqual(gaps.unbound, []);
  assert.deepEqual(gaps.uncovered, [
    "shared-forest-connection/fr-fails-closed-with-guidance-when-unbrokered",
    "shared-forest-connection/fr-bounded-never-hangs",
    "shared-forest-connection/fr-write-brokers-not-direct",
  ]);
});

test("sweepRealBuildCoverage: carries the spec-file count out, so `scanned: 0` is distinguishable from an unread corpus", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const real = sweepRealBuildCoverage(path.join(repoRoot, "stories"), repoRoot);
  assert.ok(real.specFilesWalked > 0, "the real corpus walks spec files");
  assert.ok(real.units.length > 0);

  // An absent stories tree: the sweep reports zero WALKED, which is what lets the ceiling withhold its
  // `ok` instead of certifying the "nothing to check" OK that this state prints.
  const absent = sweepRealBuildCoverage(path.join(repoRoot, "stories-does-not-exist"), repoRoot);
  assert.equal(absent.specFilesWalked, 0);
  assert.deepEqual(absent.units, []);
});
