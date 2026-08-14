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

import {
  COVERAGE_NEVER_SUM_NOTE,
  formatCoverageTotals,
  type CoverageDrainContext,
  type CoverageDrainVerdict,
} from "./coverage-drain.js";
import type { Envelope } from "./envelope.js";

/** A capability's coverage facts: its declared contracts + the test names across its proof surface. */
export interface CoverageUnit {
  /** The unit's tier (for the report framing — coverage is a `capability`-grain check). */
  tier: string;
  /** The declared contract ids (`NodeSpec.contracts`), in declared order. */
  contractIds: string[];
  /** The observed test names across the unit's proof surface (from `readTestSurface`). */
  testNames: string[];
  /** The test file(s) scanned, repo-relative — honest provenance for the report footer. */
  testFiles: string[];
  /**
   * How many observed test titles the static reader could NOT read in full (`readTestSurface`).
   * Absent = the loader did not measure it. Non-zero means an UNCOVERED verdict below is at least
   * partly a statement about this checker's reach, not about the tests — a different claim from
   * "no test names this contract", and one the report must not swallow.
   */
  unreadTitles?: number;
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

  // "Could not read the title" is NOT "no such test" — say which one this report means. Without this
  // line an uncovered list reads as a claim about the TESTS when it may be a claim about the READER.
  const unread = unit.unreadTitles ?? 0;
  if (unread > 0) {
    lines.push(
      "",
      `⚠ ${unread} test title(s) could NOT be read in full by this static check.`,
      "  Only their literal text was read, so a contract id sitting in an elided part was invisible and any",
      "  UNCOVERED above may be a limit of the READER rather than a missing test. A title is read statically:",
      "  a `${…}` substitution or a runtime-built name is elided, while concatenated string literals ARE read",
      "  (folded), as are parenthesised ones — so the usual fix is to make the dynamic part a plain literal.",
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

// ---------------------------------------------------------------------------
// `storytree coverage --totals` — where the whole backlog stands, on a GREEN run
// ---------------------------------------------------------------------------

/** What the whole-corpus sweep answered, as the totals report needs it. */
export interface CoverageTotalsDeps {
  /**
   * Run the corpus sweep and evaluate it against the shipped ceilings. INJECTED, and that is what
   * keeps this file free of `coverage-gate.ts` — which imports {@link CoverageUnit} from here, so a
   * direct import back would be a cycle. The composition root owns the disk walk; this owns the
   * report.
   */
  sweep: () => { verdict: CoverageDrainVerdict; context: CoverageDrainContext };
}

/**
 * `storytree coverage --totals` — print BOTH contract-coverage totals against BOTH ceilings, with the
 * aperture they were measured over, and exit 0.
 *
 * WHY THIS EXISTS, AND WHY IT IS A VERB RATHER THAN A RUNG (owner-directed 2026-08-14, option C,
 * answering the retired `oq-where-do-the-coverage-ceiling-s-two-totals-surface-on-a-g`). Since
 * ADR-0311 D2 retired the `check:coverage` rung, the ceiling's only surviving enforcement is
 * `coverage-drain.test.ts`'s live-corpus sweep — which names both totals, but ONLY when it reds. A
 * session deciding whether draining is worth its time is on a GREEN run, where the numbers appear
 * nowhere. What was measured is "a session cannot ASK", not "a breach went unnoticed", and those want
 * different remedies: a rung answers a question nobody asked, on every run, for everyone. So this
 * stays a verb, and ADR-0311 D5's fresh-catch-evidence bar for re-wiring a retired rung is not
 * engaged.
 *
 * IT REPLACES THE THROWAWAY, which is the win to confirm. Asking used to mean hand-rolling a sweep
 * script with three separate traps, TWO of which return a FALSE CLEAN — `tsx` not resolving from a
 * worktree root; `pnpm --filter … exec` making cwd the PACKAGE so an unqualified root silently
 * reports `specFilesWalked=0 scanned=0 uncovered=0`, which reads exactly like a drained backlog; and
 * a `.ts` scratch file being treated as CJS so a top-level await dies looking like a tooling break.
 * A session that hit the second trap could report the backlog drained when it was not.
 *
 * ALWAYS `ok: true`. This REPORTS, it does not judge — unlike {@link coverageCommand}, whose false is
 * an honesty verdict about one capability. The ceiling is enforced in `pnpm -r test`; a reporting
 * verb that could fail would be a second, unlegislated gate on the same numbers.
 */
export function coverageTotalsCommand(deps: CoverageTotalsDeps): Envelope {
  const { verdict, context } = deps.sweep();
  const lines: string[] = [
    "Contract-coverage totals — the whole corpus, against the shipped ceilings (ADR-0252 D3)",
    "",
    `  ${formatCoverageTotals(verdict, context)}`,
    "",
    `  ${COVERAGE_NEVER_SUM_NOTE}`,
  ];

  // The aperture is not decoration: `uncovered` FALLS as the substrate degrades, so a zero has two
  // very different readings and only the walked/scanned counts separate them. Say so where it bites.
  if (context.specFilesWalked === 0 || context.scanned === 0) {
    lines.push(
      "",
      "  ⚠ NOTHING WAS SCANNED, so these zeros measure the CHECKOUT, not the backlog. A `stories/`",
      "    tree that is absent or unreadable produces exactly this, and it reads like a drained",
      "    corpus. Re-run from a complete checkout before believing any number above.",
    );
  } else if (verdict.suppressed !== undefined || verdict.unverified !== undefined) {
    lines.push(
      "",
      `  ⚠ ${verdict.suppressed ?? verdict.unverified}`,
    );
  }

  lines.push(
    "",
    `  level: ${verdict.level}${verdict.breaches.length > 0 ? ` — ${verdict.breaches.join(" | ")}` : ""}`,
    "  Read-only and offline. This REPORTS; it gates nothing — the ceiling is enforced by",
    "  `coverage-drain.test.ts` inside `pnpm -r test`. Draining means authoring a test that NAMES the",
    "  contract, or splitting/retiring it — never raising the ceiling (ADR-0252 D3).",
  );

  return {
    ok: true,
    body: lines.join("\n"),
    next: ["storytree coverage <capability-id>", "storytree tree"],
  };
}
