// OFFLINE process↔entrypoint bijection sweep (ADR-0154), wired into `pnpm gate` AND CI.
//
// The CLI/pnpm surface is a declared projection of the `process` tier (ADR-0154): every process names
// its enacting entrypoint(s) in `surfaces`, and this gate asserts the bijection — (a) each named
// surface resolves to a real entrypoint, and (b) each operator-facing entrypoint has a process behind
// it (else it is an orphan). "Which commands do we need?" is still a judgement the gate does not
// adjudicate; the orphan list is the process-tier backfill worklist.
//
// It is DB-free (reads the offline seed + package.json — pure file reads), so unlike its live-store
// sibling checks it runs identically local AND in CI. The WARN/OK logic is CI-proven by
// check-surface-coverage.test.ts; the convention + design live in surface-coverage-gate.ts's header.
//
// FAIL-CLOSED AT A DRAIN CEILING (added by `verification-integrity-arc` under ADR-0252 D3, in
// ADR-0168 D4's shape). This was WARN-only, exit 0 at every gap count — so when ADR-0195 landed the
// `ci:affected` script with no process behind it, the orphan worklist went 0 → 1 and thirteen days of
// green gates and green CI passed over a bijection that was broken on `main`. The ceiling, its two
// independent axes, the differential control behind them, and both baselines live in the pure
// `surface-coverage-drain.ts`; this shell runs the sweep, prints, and sets the exit code. The OK/WARN
// levels are UNCHANGED — RED is layered above them, so this check is strictly stronger than before
// and never quieter.
//
// BOTH AXES ARE NOW AT ZERO (tightened 2026-07-28, after `pnpm ci:affected` was drained by authoring
// `process:affected-pr-test-scope` from ADR-0195). There is no headroom left: any orphan, or any
// dangling `surfaces` ref, reds the gate on its first appearance. Against a usable process tier the
// WARN level is therefore unreachable — the formatter still prints its WARN lines, but the RED block
// below always follows them, so what a reader sees and what the exit code does agree. WARN survives
// only on the fail-OPEN substrate path, where the "not enforced" line is printed directly beneath it.
//
// Reachability policy is unchanged and now matters more: the catch-all below still SKIPs and exits 0
// on any unexpected error, and a breach computed against a seed carrying no usable `process` tier is
// reported but NOT enforced (fail-closed on the gaps, fail-open on the substrate).

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_SURFACE_COVERAGE_DRAIN_CONFIG as CEILING,
  evaluateSurfaceCoverageDrain,
} from "./surface-coverage-drain.js";
import { runSurfaceCoverageGate, loadSurfaceCoverageInputs } from "./surface-coverage-gate.js";

const TAG = "[check:surface-coverage]";

// This file sits at packages/cli/src/ — three levels up is the repo root.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function main(): void {
  const { warn, lines, report } = runSurfaceCoverageGate({
    loadInputs: () =>
      loadSurfaceCoverageInputs({
        seedPath: path.join(repoRoot, "apps", "studio", "data", "knowledge.json"),
        packageJsonPath: path.join(repoRoot, "package.json"),
      }),
  });
  for (const line of lines) (warn ? console.warn : console.log)(line);

  // ---- the drain ceiling (ADR-0168 D4's shape) ------------------------------------------------
  //
  // The process tier is USABLE only when the seed actually yielded processes. A seed with none
  // reclassifies every orphan-checked entrypoint as an orphan (measured on this checkout: 1 → 11),
  // which would turn a substrate failure into a bijection breach.
  const drain = evaluateSurfaceCoverageDrain(
    {
      unresolved: report.unresolved.map((u) => `${u.processId} → "${u.ref}"`),
      orphans: report.orphans,
    },
    { processTierUsable: report.processCount > 0 },
  );

  // A breach the process tier could not support is REPORTED, never enforced and never dropped.
  if (drain.suppressed !== undefined) {
    console.warn(`${TAG}   (drain ceiling not enforced — ${drain.suppressed}.)`);
    for (const b of drain.breaches) console.warn(`${TAG}     would breach: ${b}`);
    return;
  }

  if (drain.level !== "red") return;

  console.error(
    `${TAG} RED — surface-coverage drain ceiling breached: ${drain.unresolvedCount} unresolved ` +
      `surface(s), ${drain.orphanCount} orphan entrypoint(s).`,
  );
  for (const b of drain.breaches) console.error(`${TAG}   ${b}`);
  console.error(
    `${TAG}   Landing is blocked until the ADR-0154 bijection is restored. For an UNRESOLVED surface,`,
  );
  console.error(
    `${TAG}   fix the process's \`surfaces\` ref (or add the entrypoint it names). For an ORPHAN,`,
  );
  console.error(
    `${TAG}   author the \`process\` deriving from its ADR straight into the live store with`,
  );
  console.error(
    `${TAG}   \`pnpm storytree library artifact new --file <doc.json> --pg\` (ADR-0302 D1 — there is no`,
  );
  console.error(
    `${TAG}   seed to author into and no sync step), or RETIRE the entrypoint — clearing the gaps back`,
  );
  console.error(`${TAG}   below U=${CEILING.unresolvedCeiling} / R=${CEILING.orphanCeiling}.`);
  console.error(
    `${TAG}   (Bijection drift only — this never decides WHICH commands or processes should exist.)`,
  );
  // FAIL-CLOSED: only a genuine ceiling breach against a usable process tier sets a non-zero exit.
  process.exitCode = 1;
}

try {
  main();
} catch (err) {
  // Even an unexpected error is advisory only — never fail the gate on an unreadable input.
  console.log(
    `${TAG} SKIP — unexpected error (${(err as Error).message}); surface coverage unverified, gate unaffected.`,
  );
}
