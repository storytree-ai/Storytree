// Best-effort OFFLINE process↔entrypoint bijection sweep (ADR-0154), wired into `pnpm gate` AND CI.
//
// The CLI/pnpm surface is a declared projection of the `process` tier (ADR-0154): every process names
// its enacting entrypoint(s) in `surfaces`, and this gate asserts the bijection — (a) each named
// surface resolves to a real entrypoint, and (b) each operator-facing entrypoint has a process behind
// it (else it is an orphan). It WARNs, never blocks (the established `check:coverage` /
// `check:corpus-sync` pattern): "which commands do we need?" is a judgement the gate must not
// adjudicate — the orphan list is the process-tier backfill worklist, not an error.
//
// It is DB-free (reads the offline seed + package.json — pure file reads), so unlike its live-store
// sibling checks it runs identically local AND in CI. The WARN/OK logic is CI-proven by
// check-surface-coverage.test.ts; this is the thin shell that runs the sweep, prints, and ALWAYS
// exits 0. The convention + design live in surface-coverage-gate.ts's header.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runSurfaceCoverageGate, loadSurfaceCoverageInputs } from "./surface-coverage-gate.js";

const TAG = "[check:surface-coverage]";

// This file sits at packages/cli/src/ — three levels up is the repo root.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function main(): void {
  try {
    const { warn, lines } = runSurfaceCoverageGate({
      loadInputs: () =>
        loadSurfaceCoverageInputs({
          seedPath: path.join(repoRoot, "apps", "studio", "data", "knowledge.json"),
          packageJsonPath: path.join(repoRoot, "package.json"),
        }),
    });
    for (const line of lines) (warn ? console.warn : console.log)(line);
  } catch (err) {
    // Even an unexpected error is advisory only — never fail the gate on the surface-coverage check.
    console.log(
      `${TAG} SKIP — unexpected error (${(err as Error).message}); surface coverage unverified, gate unaffected.`,
    );
  }
  // WARN-only: never sets a non-zero exit code.
}

main();
