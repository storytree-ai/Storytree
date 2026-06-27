// Best-effort OFFLINE per-contract coverage sweep (ADR-0122 R1), wired into `pnpm gate` — NOT into CI.
//
// `storytree coverage <cap>` checks ONE capability on demand; this sweeps EVERY capability carrying a
// registered real-build test surface (`proof.real.testFile`) and WARNs — never blocks — on any declared
// `## Contracts` behaviour no observed test names. It is the contract→test analogue of check:corpus-sync:
//
//   - a real-build capability drops a contract -> WARN naming it (+ `storytree coverage <cap>` to drill in).
//   - every contract covered (or nothing to scan) -> OK.
//
// It ALWAYS exits 0 and is READ-ONLY (no store, no writes — pure file reads). It lives in `pnpm gate`,
// not CI: a hard build-blocking gate would strand legitimately-unbuilt `proposed` capabilities (ADR-0122
// deferred it). The real-build-surface FILTER is the safety net — an unbuilt capability has no
// `proof.real` block, so it is never scanned. The WARN/OK logic is CI-proven by coverage-gate.test.ts;
// this is the local nudge over the live corpus.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runCoverageGate, loadRealBuildCoverageUnits } from "./coverage-gate.js";

const TAG = "[check:coverage]";

// This file sits at packages/cli/src/ — three levels up is the repo root.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const storiesDir = path.join(repoRoot, "stories");

function main(): void {
  try {
    const { warn, lines } = runCoverageGate({
      loadUnits: () => loadRealBuildCoverageUnits(storiesDir, repoRoot),
    });
    for (const line of lines) (warn ? console.warn : console.log)(line);
  } catch (err) {
    // Even an unexpected error is advisory only — never fail the gate on the coverage check.
    console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); coverage unverified, gate unaffected.`);
  }
  // WARN-only: never sets a non-zero exit code.
}

main();
