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
 */

const USABLE = { processTierUsable: true } as const;

// ---------------------------------------------------------------------------
// RED — each axis, on its own
// ---------------------------------------------------------------------------

test("RED: the orphan axis breaches alone — a second un-drained entrypoint reds, and is named", () => {
  const v = evaluateSurfaceCoverageDrain(
    { unresolved: [], orphans: ["pnpm ci:affected", "pnpm deploy:studio"] },
    USABLE,
  );
  assert.equal(v.level, "red");
  assert.equal(v.orphanCount, 2);
  assert.equal(v.breaches.length, 1, "only the orphan axis breached");
  assert.match(v.breaches[0] ?? "", /2 operator-facing entrypoint\(s\) have no process/);
  assert.match(v.breaches[0] ?? "", /R=1/);
  // The breach NAMES the items, so the drain is actionable from the gate output alone.
  assert.match(v.breaches[0] ?? "", /pnpm ci:affected; pnpm deploy:studio/);
  assert.equal(v.suppressed, undefined);
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
  // A dangling ref reds even while the orphan list sits exactly AT its ceiling…
  const dangling = evaluateSurfaceCoverageDrain(
    { unresolved: ['p → "storytree wibble"'], orphans: ["pnpm ci:affected"] },
    USABLE,
  );
  assert.equal(dangling.level, "red");
  assert.equal(dangling.breaches.length, 1, "the at-ceiling orphan list contributes no breach");
  assert.match(dangling.breaches[0] ?? "", /resolve to no entrypoint/);

  // …and a two-orphan backlog reds even with a spotless unresolved list.
  const orphaned = evaluateSurfaceCoverageDrain({ unresolved: [], orphans: ["a", "b"] }, USABLE);
  assert.equal(orphaned.level, "red");
  assert.equal(orphaned.breaches.length, 1);
  assert.match(orphaned.breaches[0] ?? "", /have no process/);

  // Both breached ⇒ two SEPARATE breach lines, never one summed count.
  const both = evaluateSurfaceCoverageDrain({ unresolved: ["x"], orphans: ["a", "b"] }, USABLE);
  assert.equal(both.breaches.length, 2);
});

// ---------------------------------------------------------------------------
// FALSE-POSITIVE GUARDS — what the ceiling must NOT fire on
// ---------------------------------------------------------------------------

test("GUARD: today's honest baseline (0 unresolved, 1 orphan) is WARN, never RED — it ships green", () => {
  const v = evaluateSurfaceCoverageDrain({ unresolved: [], orphans: ["pnpm ci:affected"] }, USABLE);
  assert.equal(v.level, "warn");
  assert.deepEqual(v.breaches, []);
  assert.equal(v.suppressed, undefined);
});

test("GUARD: a clean bijection is OK with no breaches — the ceiling adds nothing to the quiet path", () => {
  const v = evaluateSurfaceCoverageDrain({ unresolved: [], orphans: [] }, USABLE);
  assert.equal(v.level, "ok");
  assert.deepEqual(v.breaches, []);
});

test("GUARD: no WARN BAND is opened beneath the ceiling — a single gap still WARNs, never OK", () => {
  // The failure mode this pins: a ceiling that made counts under it print OK would leave the check
  // QUIETER than before it was bounded. Every within-ceiling gap must still reach the WARN level.
  assert.equal(evaluateSurfaceCoverageDrain({ unresolved: [], orphans: ["a"] }, USABLE).level, "warn");
  // And with U=0, there is no such thing as a within-ceiling unresolved ref that prints OK.
  assert.equal(evaluateSurfaceCoverageDrain({ unresolved: ["x"], orphans: [] }, USABLE).level, "red");
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

test("BASELINE: the real repo sweep sits within both ceilings — the ceiling ships GREEN", () => {
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
  // Baselining means the ceiling equals what the first real sweep found — so it can only be
  // TIGHTENED. If this ever fails low, the tier was backfilled: lower the ceiling, do not raise it.
  assert.ok(
    report.unresolved.length <= CEILING.unresolvedCeiling,
    "unresolved surfaces must stay at or below the baselined ceiling",
  );
  assert.ok(
    report.orphans.length <= CEILING.orphanCeiling,
    "orphan entrypoints must stay at or below the baselined ceiling",
  );
});
