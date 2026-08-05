// ⚠ UNWIRED — part of retired `check:coverage`, which ADR-0311 D2 removed from the gate on
// 2026-08-05. This module is the gate logic; its entrypoint `check-coverage.ts` is invoked by
// nothing, and it is reached only from there and from its own tests — so those tests stay GREEN
// while it enforces NOTHING. Kept deliberately (ADR-0311 D5), not forgotten; re-wiring needs
// fresh production-catch evidence AND an ADR, never just the wiring.
// Tombstone: `RETIRED_CHECKS` in `gate-order.ts`, pinned by `gate-order.test.ts`.
//
// What follows is retained as written — read it as what this DID, not as current gate policy.
//
/**
 * `check:coverage` — the GATE-LEVEL contract-coverage sweep (ADR-0122 R1, the deferred gate WARN-step).
 *
 * `storytree coverage <cap>` checks ONE capability on demand ({@link import("./coverage.js").coverageCommand},
 * ADR-0122). This sweeps EVERY capability that carries a registered real-build test surface
 * (`proof.real.testFile`) and WARNs — never blocks — when one declares a `## Contracts` behaviour no
 * SUBSTANTIVE test covers (a hollow `assert(true)` / skipped test does not count, ADR-0126). It is the
 * contract→test analogue of `check:corpus-sync` / `check:agents-sync`: a best-effort, local-only nudge
 * wired into `pnpm gate`, NOT a hard build-blocking gate.
 *
 * Why a WARN, never a block (ADR-0122 deferred the hard gate): a build-blocking step would strand
 * legitimately-unbuilt `proposed` capabilities, which are honestly uncovered. The real-build-surface
 * FILTER is the safety property that makes even the WARN well-behaved — an unbuilt `proposed`
 * capability has no `proof.real` block yet, so it is never scanned. Only a capability that HAS a
 * buildable real surface (whose signed `--real` green attests ONE authored test, ADR-0020 §3) yet still
 * drops a contract is flagged; the WARN can never nag an honestly-not-yet-built capability.
 *
 * Pure-by-injection (the unit loader is a seam), mirroring `coverageCommand`: the WARN/OK decision is
 * deterministic and offline-testable with fixture units. The disk enumeration ({@link
 * loadRealBuildCoverageUnits}) is a parameterized I/O helper; the thin `check-coverage.ts` entrypoint
 * is the only place that runs the sweep + prints + exits 0.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { classifyContractCoverage, loadNodeSpec, extractVouchingTestNames } from "@storytree/orchestrator";

import type { CoverageUnit } from "./coverage.js";

const TAG = "[check:coverage]";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A capability the gate sweep loaded: its id plus the on-disk coverage facts ({@link CoverageUnit}). */
export interface GateCoverageUnit extends CoverageUnit {
  /** The capability id (the spec's frontmatter id). */
  unitId: string;
  /**
   * Whether the registered `real.testFile` actually EXISTS on disk. False means there is no proof
   * surface at all, so every contract reads uncovered for a reason that has nothing to do with
   * authoring — the `unbound` axis of {@link import("./coverage-drain.js").evaluateCoverageDrain}.
   */
  testFilePresent: boolean;
}

/** One scanned capability's gate outcome — the per-contract classification projected to id lists. */
export interface GateCoverageResult {
  /** The capability id. */
  unitId: string;
  /** Declared contract count. */
  total: number;
  /** Covered contract ids (≥1 observed test names each). */
  covered: string[];
  /** Uncovered contract ids — declared but named by no observed test (the WARN material). */
  uncovered: string[];
  /** The test file(s) scanned for this capability (honest provenance). */
  testFiles: string[];
  /** Whether the registered `real.testFile` exists on disk — see {@link GateCoverageUnit.testFilePresent}. */
  testFilePresent: boolean;
}

/** The whole-corpus gate sweep result. */
export interface GateCoverageReport {
  /** Every scanned capability (real-build surface + ≥1 declared contract), in scan order. */
  scanned: GateCoverageResult[];
  /** The subset with ≥1 uncovered contract — what the WARN names. */
  underCovered: GateCoverageResult[];
  /** True iff nothing is under-covered (OK); false iff ≥1 capability drops a contract (WARN). */
  clean: boolean;
}

/**
 * The drain-ceiling projection of a sweep ({@link import("./coverage-drain.js").CoverageGaps} plus the
 * substrate observables). PURE: the two axes are split HERE rather than in the ceiling, because which
 * bucket a capability falls into is a fact the sweep read off disk.
 *
 * `uncovered` deliberately EXCLUDES capabilities whose test file is missing — those route wholly to
 * `unbound`. That split is what makes the authoring axis immune to a deficient checkout (measured: an
 * absent test-file tree drives `uncovered` to 0 and `unbound` to every scanned capability).
 */
export function projectCoverageGaps(report: GateCoverageReport): {
  uncovered: string[];
  unbound: string[];
  scanned: number;
} {
  const uncovered: string[] = [];
  const unbound: string[] = [];
  for (const u of report.underCovered) {
    if (u.testFilePresent) uncovered.push(...u.uncovered.map((c) => `${u.unitId}/${c}`));
    else unbound.push(u.unitId);
  }
  return { uncovered, unbound, scanned: report.scanned.length };
}

// ---------------------------------------------------------------------------
// Pure classification + formatting
// ---------------------------------------------------------------------------

/**
 * PURE: classify every loaded capability ({@link classifyContractCoverage} per unit) and project the
 * under-covered subset. Deterministic and order-preserving. A capability with no declared contracts is
 * vacuously covered (a `total: 0` result, never in `underCovered`) — the disk loader already filters
 * those out, so this only arises for an explicitly-passed fixture.
 */
export function classifyGateCoverage(units: readonly GateCoverageUnit[]): GateCoverageReport {
  const scanned: GateCoverageResult[] = units.map((u) => {
    const report = classifyContractCoverage({
      unitId: u.unitId,
      contractIds: u.contractIds,
      testNames: u.testNames,
    });
    return {
      unitId: u.unitId,
      total: report.contracts.length,
      covered: report.covered,
      uncovered: report.uncovered,
      testFiles: u.testFiles,
      testFilePresent: u.testFilePresent,
    };
  });
  const underCovered = scanned.filter((s) => s.uncovered.length > 0);
  return { scanned, underCovered, clean: underCovered.length === 0 };
}

/**
 * PURE: render the gate sweep as advisory console lines + a `warn` flag. WARN names each under-covered
 * capability and the contracts it drops; OK reports the clean count. NEVER throws and never exits — the
 * caller prints the lines and always exits 0 (WARN-only, like `check:corpus-sync`).
 */
export function formatCoverageGate(report: GateCoverageReport): { warn: boolean; lines: string[] } {
  if (report.scanned.length === 0) {
    return {
      warn: false,
      lines: [
        `${TAG} OK — no capability declares contracts against a registered real-build test surface (nothing to check).`,
      ],
    };
  }
  if (report.clean) {
    const contractCount = report.scanned.reduce((n, s) => n + s.total, 0);
    return {
      warn: false,
      lines: [
        `${TAG} OK — every declared contract is covered across ${report.scanned.length} real-build ` +
          `capability(ies) (${contractCount} contracts).`,
      ],
    };
  }
  const lines = [
    `${TAG} WARN — ${report.underCovered.length} real-build capability(ies) declare a contract that NO ` +
      "SUBSTANTIVE test covers (a signed --real green attests ONE authored test, not every contract; " +
      "ADR-0020 §3 / ADR-0122). Advisory only — author a test NAMING each (the " +
      '`describe("<id>: …")` convention) AND asserting substantively (a hollow `assert(true)` or skipped ' +
      "test does not count, ADR-0126), or split/retire the contract. " +
      "Run `pnpm storytree coverage <cap>` for the per-contract report.",
  ];
  for (const u of report.underCovered) {
    lines.push(`${TAG}   ${u.unitId}: ${u.uncovered.length}/${u.total} uncovered — ${u.uncovered.join(", ")}`);
  }
  return { warn: true, lines };
}

// ---------------------------------------------------------------------------
// Injectable runner (the disk loader is the seam)
// ---------------------------------------------------------------------------

/** Everything the runner reads, injected for offline testability (the disk loader is the seam). */
export interface CoverageGateDeps {
  /** Load every real-build capability's coverage facts (real surface + ≥1 contract, already filtered). */
  loadUnits: () => GateCoverageUnit[];
}

/**
 * The injectable gate runner: load → classify → format. Returns the advisory lines + warn flag; the
 * thin `check-coverage.ts` entrypoint prints them and always exits 0. Pure-by-injection so the WARN/OK
 * decision is tested with fixtures (no disk, no DB).
 */
export function runCoverageGate(deps: CoverageGateDeps): { warn: boolean; lines: string[] } {
  return formatCoverageGate(classifyGateCoverage(deps.loadUnits()));
}

// ---------------------------------------------------------------------------
// Disk enumeration (parameterized I/O — the production `loadUnits`)
// ---------------------------------------------------------------------------

/** Recursively collect every `*.md` spec file under `storiesDir` (an unreadable dir yields none). */
function walkSpecFiles(absDir: string): string[] {
  const out: string[] = [];
  try {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const full = path.join(absDir, entry.name);
      if (entry.isDirectory()) out.push(...walkSpecFiles(full));
      else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
    }
  } catch {
    // A missing / unreadable directory contributes no spec files.
  }
  return out;
}

/**
 * Load every capability under `storiesDir` carrying a registered real-build test surface
 * (`proof.real.testFile`) AND ≥1 declared `## Contracts`. The proof surface is exactly that
 * `real.testFile` — the tightest honest signal (the EXACT file a signed `--real` green attests). A spec
 * that throws (malformed) or carries no real block / no contracts is skipped — this is the FILTER that
 * keeps unbuilt `proposed` capabilities out of the sweep. A missing/unreadable test file contributes no
 * names (fail-closed → every contract reads uncovered — a legitimate WARN: a registered real surface
 * with no authored test IS under-covered). Paths are resolved against `repoRoot`.
 */
export function loadRealBuildCoverageUnits(storiesDir: string, repoRoot: string): GateCoverageUnit[] {
  return sweepRealBuildCoverage(storiesDir, repoRoot).units;
}

/**
 * {@link loadRealBuildCoverageUnits} plus the substrate observable the drain ceiling needs: how many
 * spec files were WALKED. Zero walked and zero scanned are different states that the check's "nothing
 * to check" OK cannot distinguish (measured: an absent `stories/` tree and an empty one both reach it),
 * so the count is carried out rather than reconstructed.
 */
export function sweepRealBuildCoverage(
  storiesDir: string,
  repoRoot: string,
): { units: GateCoverageUnit[]; specFilesWalked: number } {
  const units: GateCoverageUnit[] = [];
  const specFiles = walkSpecFiles(storiesDir);
  for (const file of specFiles) {
    let spec: ReturnType<typeof loadNodeSpec>;
    try {
      spec = loadNodeSpec(file);
    } catch {
      continue; // a malformed spec is skipped (advisory sweep — never throw out of the gate)
    }
    const testFile = spec.buildConfig?.real?.testFile;
    if (testFile === undefined || spec.contracts.length === 0) continue;
    const abs = path.join(repoRoot, testFile);
    const testFilePresent = existsSync(abs);
    let testNames: string[] = [];
    if (testFilePresent) {
      try {
        // VOUCHING names only (ADR-0126): a hollow / skipped test contributes nothing, so a contract
        // named only by an `assert(true)` reads uncovered (not falsely covered).
        testNames = extractVouchingTestNames(readFileSync(abs, "utf8"));
      } catch {
        testNames = []; // an unreadable test file contributes no names (fail-closed toward uncovered)
      }
    }
    units.push({
      unitId: spec.id,
      tier: spec.tier,
      contractIds: spec.contracts.map((c) => c.id),
      testNames,
      testFiles: [testFile.replace(/\\/g, "/")],
      testFilePresent,
    });
  }
  return { units, specFilesWalked: specFiles.length };
}
