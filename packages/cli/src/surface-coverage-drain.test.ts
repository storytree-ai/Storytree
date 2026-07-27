import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_SURFACE_COVERAGE_DRAIN_CONFIG as CEILING,
  evaluateSurfaceCoverageDrain,
} from "./surface-coverage-drain.js";
import { classifySurfaceCoverage, loadSurfaceCoverageInputs } from "./surface-coverage-gate.js";

/**
 * The `check:surface-coverage` drain ceiling (`verification-integrity-arc`, ADR-0252 D3, in ADR-0168
 * D4's shape). Pure — the core takes gap lists and a substrate flag, so every level is testable
 * without disk. The red→green pair is each axis breaching ALONE; the guards pin what the ceiling must
 * NOT fire on, since a ceiling that reds on today's honest baseline (or on a substrate failure) would
 * buy silence rather than a drain.
 *
 * TIGHTENED to 0/0 on 2026-07-28, when the orphan worklist's one item (`pnpm ci:affected`) was drained
 * by authoring `process:affected-pr-test-scope`. Both axes now carry ZERO headroom, so the minimal
 * breach on either is a SINGLE gap, and the no-summing property is asserted against an explicit
 * split-ceiling config rather than the shipped pair — at 0/0 every gap breaches, which cannot
 * distinguish independent evaluation from a sum.
 */

const USABLE = { processTierUsable: true } as const;

// ---------------------------------------------------------------------------
// RED — each axis, on its own
// ---------------------------------------------------------------------------

test("RED: the orphan axis breaches alone — ONE un-drained entrypoint reds (R=0), and is named", () => {
  // Since the 2026-07-28 drain of `pnpm ci:affected` the orphan axis carries ZERO headroom, so the
  // minimal breach is a SINGLE orphan — the fail-closed-on-growth posture the tightening bought.
  const v = evaluateSurfaceCoverageDrain({ unresolved: [], orphans: ["pnpm deploy:studio"] }, USABLE);
  assert.equal(v.level, "red");
  assert.equal(v.orphanCount, 1);
  assert.equal(v.breaches.length, 1, "only the orphan axis breached");
  assert.match(v.breaches[0] ?? "", /1 operator-facing entrypoint\(s\) have no process/);
  assert.match(v.breaches[0] ?? "", /R=0/);
  // The breach NAMES the items, so the drain is actionable from the gate output alone.
  assert.match(v.breaches[0] ?? "", /pnpm deploy:studio/);
  assert.equal(v.suppressed, undefined);

  // …and it still names every item when several arrive at once.
  const many = evaluateSurfaceCoverageDrain(
    { unresolved: [], orphans: ["pnpm deploy:studio", "pnpm ship:web"] },
    USABLE,
  );
  assert.equal(many.orphanCount, 2);
  assert.match(many.breaches[0] ?? "", /pnpm deploy:studio; pnpm ship:web/);
});

test("RED: the unresolved axis breaches alone — ONE dangling `surfaces` ref reds (U=0)", () => {
  const v = evaluateSurfaceCoverageDrain(
    { unresolved: ['launch-desktop → "pnpm --filter desktop launch"'], orphans: [] },
    USABLE,
  );
  assert.equal(v.level, "red");
  assert.equal(v.unresolvedCount, 1);
  assert.equal(v.breaches.length, 1, "only the unresolved axis breached");
  assert.match(v.breaches[0] ?? "", /1 named surface\(s\) resolve to no entrypoint/);
  assert.match(v.breaches[0] ?? "", /U=0/);
  assert.match(v.breaches[0] ?? "", /launch-desktop/);
});

test("the two axes are INDEPENDENT and never summed — neither's headroom absorbs the other", () => {
  // The no-summing property is asserted against an EXPLICIT config whose axes differ, not against the
  // shipped 0/0 pair: at 0/0 every gap breaches, so today's numbers alone cannot tell "evaluated
  // independently" apart from "summed". Here the orphan axis sits exactly AT a ceiling of 1 while a
  // single dangling ref reds — the at-ceiling orphan list must contribute no breach of its own.
  const SPLIT = { unresolvedCeiling: 0, orphanCeiling: 1 };
  const dangling = evaluateSurfaceCoverageDrain(
    { unresolved: ['p → "storytree wibble"'], orphans: ["pnpm deploy:studio"] },
    USABLE,
    SPLIT,
  );
  assert.equal(dangling.level, "red");
  assert.equal(dangling.breaches.length, 1, "the at-ceiling orphan list contributes no breach");
  assert.match(dangling.breaches[0] ?? "", /resolve to no entrypoint/);

  // …and past that same ceiling the orphan axis reds with a spotless unresolved list.
  const orphaned = evaluateSurfaceCoverageDrain({ unresolved: [], orphans: ["a", "b"] }, USABLE, SPLIT);
  assert.equal(orphaned.level, "red");
  assert.equal(orphaned.breaches.length, 1);
  assert.match(orphaned.breaches[0] ?? "", /have no process/);

  // Both breached ⇒ two SEPARATE breach lines, never one summed count (shipped ceilings).
  const both = evaluateSurfaceCoverageDrain({ unresolved: ["x"], orphans: ["a", "b"] }, USABLE);
  assert.equal(both.breaches.length, 2);
});

// ---------------------------------------------------------------------------
// FALSE-POSITIVE GUARDS — what the ceiling must NOT fire on
// ---------------------------------------------------------------------------

test("GUARD: the drained baseline (0 unresolved, 0 orphans) is OK — the tightened ceiling ships green", () => {
  // After the 2026-07-28 drain the honest baseline IS zero on both axes, so the shipped ceiling must
  // sit quiet on it. A ceiling that red on its own baseline would price the next session toward
  // loosening it rather than holding the line.
  const v = evaluateSurfaceCoverageDrain({ unresolved: [], orphans: [] }, USABLE);
  assert.equal(v.level, "ok");
  assert.deepEqual(v.breaches, []);
  assert.equal(v.suppressed, undefined);
});

test("GUARD: ZERO headroom on both axes — one gap of EITHER kind reds, so the drained list stays drained", () => {
  // The point of tightening: a ceiling above the real count is one free un-drained item of slack. At
  // 0/0 the first regression on either axis fails the gate instead of printing a warning nobody acts on.
  assert.equal(CEILING.unresolvedCeiling, 0);
  assert.equal(CEILING.orphanCeiling, 0);
  assert.equal(evaluateSurfaceCoverageDrain({ unresolved: [], orphans: ["a"] }, USABLE).level, "red");
  assert.equal(evaluateSurfaceCoverageDrain({ unresolved: ["x"], orphans: [] }, USABLE).level, "red");
});

test("GUARD: no WARN BAND was opened beneath the ceiling — a gap is never QUIETER than before bounding", () => {
  // The failure mode this pins: a ceiling that made counts under it print OK would leave the check
  // quieter than before it was bounded. At 0/0 there is no within-ceiling gap at all against a usable
  // tier — every gap escalates to RED, strictly louder than the WARN it printed before. The only
  // surviving WARN with gaps present is the fail-OPEN substrate path below, which the shell prints its
  // "drain ceiling not enforced" line beneath, so WARN prose is never left contradicting the exit code.
  for (const gaps of [
    { unresolved: [], orphans: ["a"] },
    { unresolved: ["x"], orphans: [] },
    { unresolved: ["x"], orphans: ["a"] },
  ]) {
    assert.notEqual(evaluateSurfaceCoverageDrain(gaps, USABLE).level, "ok", "a gap never prints OK");
    assert.equal(evaluateSurfaceCoverageDrain(gaps, USABLE).level, "red");
    const open = evaluateSurfaceCoverageDrain(gaps, { processTierUsable: false });
    assert.equal(open.level, "warn", "the substrate path is the only WARN left, and it is reported");
    assert.notEqual(open.suppressed, undefined);
  }
});

test("GUARD: an unusable process tier SUPPRESSES the breach — fail-open on the substrate", () => {
  // Measured on the authoring checkout: substituting an empty seed took the orphan list 1 → 11. That
  // is a substrate failure wearing a breach's clothes, so it must never red.
  const v = evaluateSurfaceCoverageDrain(
    { unresolved: [], orphans: Array.from({ length: 11 }, (_, i) => `pnpm script-${i}`) },
    { processTierUsable: false },
  );
  assert.equal(v.level, "warn", "a substrate failure never reds the gate");
  assert.notEqual(v.suppressed, undefined, "and it is REPORTED, never silently dropped");
  assert.match(v.suppressed ?? "", /no usable `process` tier/);
  assert.equal(v.breaches.length, 1, "the would-be breach is still computed and carried");
});

test("GUARD: the substrate flag suppresses ONLY when there is a breach, and never masks a real one", () => {
  // No breach ⇒ nothing to suppress, so the field stays absent even with an unusable tier.
  const quiet = evaluateSurfaceCoverageDrain({ unresolved: [], orphans: [] }, { processTierUsable: false });
  assert.equal(quiet.suppressed, undefined);
  assert.equal(quiet.level, "ok");
  // The SAME gaps against a usable tier are enforced — the flag is the only difference.
  const gaps = { unresolved: [], orphans: ["a", "b", "c"] };
  assert.equal(evaluateSurfaceCoverageDrain(gaps, { processTierUsable: false }).level, "warn");
  assert.equal(evaluateSurfaceCoverageDrain(gaps, USABLE).level, "red");
});

// ---------------------------------------------------------------------------
// The baseline, pinned against the REAL repo
// ---------------------------------------------------------------------------

test("BASELINE: the real repo sweep sits within both ceilings — a CLEAN bijection at 0/0", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const report = classifySurfaceCoverage(
    loadSurfaceCoverageInputs({
      seedPath: path.join(repoRoot, "apps", "studio", "data", "knowledge.json"),
      packageJsonPath: path.join(repoRoot, "package.json"),
    }),
  );
  const v = evaluateSurfaceCoverageDrain(
    {
      unresolved: report.unresolved.map((u) => `${u.processId} → "${u.ref}"`),
      orphans: report.orphans,
    },
    { processTierUsable: report.processCount > 0 },
  );
  assert.notEqual(
    v.level,
    "red",
    `the drain ceiling must not red on the committed repo: ${v.breaches.join(" | ")}`,
  );
  // Baselining means the ceiling equals what a real sweep found — so it can only be TIGHTENED. Both
  // axes are at 0 since the 2026-07-28 drain, so this now pins the strongest form: the committed repo
  // carries a CLEAN bijection, and any regression on either axis reds here as well as at the gate.
  assert.ok(
    report.unresolved.length <= CEILING.unresolvedCeiling,
    "unresolved surfaces must stay at or below the baselined ceiling",
  );
  assert.ok(
    report.orphans.length <= CEILING.orphanCeiling,
    "orphan entrypoints must stay at or below the baselined ceiling",
  );
  assert.equal(v.level, "ok", "the drained baseline is CLEAN, not merely within ceilings");
  // The drain itself, pinned: the process authored from ADR-0195 is what makes `pnpm ci:affected`
  // non-orphan, so deleting it re-reds this test rather than silently restoring the old warning.
  assert.ok(
    report.processCount >= 14,
    `the seed must carry the drained process tier (found ${report.processCount} processes)`,
  );
});
