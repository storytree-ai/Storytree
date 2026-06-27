/**
 * `storytree coverage <capability-id>` — the CONTRACT-COVERAGE report (ADR-0020 coverage-honesty
 * follow-on, owner-ratified 2026-06-27).
 *
 * The prove-it-gate signs a green for the ONE authored test it observed go red→green (ADR-0020 §3) —
 * it cannot forge that test, but it never checks that EVERY enumerated `## Contracts` behaviour has a
 * test. The leaf reliably drops the hardest contract (documented: `fr-bounded-never-hangs` landed
 * under a signed green) and nothing caught it. This command catches it: it loads a capability's
 * declared contracts + the test names across its proof surface, runs the pure
 * {@link classifyContractCoverage}, and FLAGS any contract no test names.
 *
 * Read-only and OFFLINE: it reads the spec + test files off disk and classifies in memory — no DB, no
 * `--pg`, no spend. Pure-by-injection (the unit loader is a seam), so the command is offline-testable
 * with a fixture loader — mirrors `adopt-plan.ts` (ADR-0097 Layer 2), one tier DOWN.
 *
 * Envelope `ok`: TRUE when every declared contract is covered (or the unit declares none — vacuously
 * covered); FALSE when ≥1 contract is uncovered (the flag/block) or the unit can't be found. Unlike
 * `adopt plan` (a brownfield work-plan that stays ok:true), an uncovered contract is an HONESTY
 * violation — a green here would over-claim — so it fails the check.
 */

import { classifyContractCoverage, type ContractCoverage } from "@storytree/orchestrator";

import type { Envelope } from "./envelope.js";

/** A capability's coverage facts: its declared contracts + the test names across its proof surface. */
export interface CoverageUnit {
  /** The unit's tier (for the report framing — coverage is a `capability`-grain check). */
  tier: string;
  /** The declared contract ids (`NodeSpec.contracts`), in declared order. */
  contractIds: string[];
  /** The observed test names across the unit's proof surface (from `extractTestNames`). */
  testNames: string[];
  /** The test file(s) scanned, repo-relative — honest provenance for the report footer. */
  testFiles: string[];
}

export interface CoverageDeps {
  /** Load a unit's coverage facts; null for a missing/odd spec. Injectable for tests. */
  loadUnit: (unitId: string) => CoverageUnit | null;
}

/** Render the covering test name(s) for a covered contract (first one, the convention witness). */
function coveredByLine(c: ContractCoverage): string {
  const first = c.coveredBy[0];
  return first !== undefined ? `by "${first}"` : "";
}

/** The covered/uncovered classification rendered as report lines (mirrors adopt-plan's style). */
function classificationLines(contracts: ContractCoverage[]): string[] {
  const idWidth = Math.max(1, ...contracts.map((c) => c.contractId.length));
  return contracts.map((c) =>
    c.covered
      ? `  ✓ ${c.contractId.padEnd(idWidth)}  COVERED    ${coveredByLine(c)}`
      : `  ○ ${c.contractId.padEnd(idWidth)}  UNCOVERED  no substantive test covers it`,
  );
}

/**
 * `storytree coverage <capability-id>` — flag any declared contract with no observed test.
 */
export async function coverageCommand(
  unitId: string | undefined,
  deps: CoverageDeps,
): Promise<Envelope> {
  if (unitId === undefined || unitId.trim().length === 0) {
    return {
      ok: false,
      body: "coverage needs a capability id: storytree coverage <capability-id>",
      next: ["storytree tree"],
    };
  }
  const id = unitId.trim();
  const unit = deps.loadUnit(id);
  if (unit === null) {
    return {
      ok: false,
      body: `no unit "${id}" (looked for stories/<story>/${id}.md or stories/${id}/story.md, or its spec did not load).`,
      next: ["storytree tree"],
    };
  }

  if (unit.contractIds.length === 0) {
    return {
      ok: true,
      body: `Unit "${id}" (tier: ${unit.tier}) declares no \`## Contracts\` — nothing to check (coverage is a capability-grain check; a story's coverage is its capabilities').`,
      next: ["storytree tree", `storytree coverage <capability-id>`],
    };
  }

  const report = classifyContractCoverage({
    unitId: id,
    contractIds: unit.contractIds,
    testNames: unit.testNames,
  });
  const total = report.contracts.length;
  const lines: string[] = [
    `Contract coverage for "${id}" (tier: ${unit.tier}) — ADR-0020 coverage honesty`,
    "",
    `contracts: ${total}  (${report.covered.length} covered, ${report.uncovered.length} uncovered)`,
    "",
    ...classificationLines(report.contracts),
  ];

  if (report.uncovered.length > 0) {
    lines.push(
      "",
      `⚠ ${report.uncovered.length} UNCOVERED contract(s): ${report.uncovered.join(", ")}`,
      "  A signed green over-claims these — the gate observes only the ONE authored test (ADR-0020 §3),",
      "  not every enumerated contract. Author a test that NAMES each (the `describe(\"<id>: …\")`",
      "  convention) AND asserts something substantive (a hollow `assert(true)` does not count, ADR-0126),",
      "  or split/retire the contract if it is not a real obligation.",
    );
  }

  lines.push(
    "",
    unit.testFiles.length > 0
      ? `scanned ${unit.testFiles.length} test file(s): ${unit.testFiles.join(", ")}`
      : "scanned NO test files — the unit declares no real-build test surface to observe (so every contract reads uncovered).",
    "COVERED = a SUBSTANTIVE test NAMES the contract (the naming convention). Static AST (ADR-0126): a",
    "hollow `assert(true)` or a skipped test does NOT count, so it catches both a DROPPED contract and a",
    "hollow one. A substantive-but-irrelevant assertion still reads covered — the semantic-reviewer follow-on.",
  );

  return {
    // ok is FALSE when a contract is uncovered — this is a coverage CHECK (a green would over-claim),
    // not a work-plan report. A unit with every contract covered passes.
    ok: report.uncovered.length === 0,
    body: lines.join("\n"),
    next: [`storytree tree`, `storytree coverage ${id}`],
  };
}
