import type { ContractDecl } from "@storytree/library";

/**
 * The CONTRACT-COVERAGE classifier (ADR-0020 coverage-honesty follow-on, owner-ratified 2026-06-27).
 *
 * ADR-0020 made red→green non-forgeable: the spine observes the RED then the GREEN of *the new test*
 * out-of-band and signs the verdict spine-side, so a leaf can never forge the test it authored. But a
 * signed green proves only that ONE authored test went red→green — NOT that every enumerated
 * `## Contracts` behaviour under the unit has a test. The leaf reliably drops the hardest
 * robustness/concurrency contract (documented: `fr-bounded-never-hangs` landed UNDER a signed green),
 * and nothing caught the under-coverage. So "trustworthy" is correctly scoped to "cannot forge the
 * authored test," not "the whole spec is proven."
 *
 * This is the FIRST SLICE the owner chose: a structural, offline check that maps each declared
 * contract to an OBSERVED test by the naming convention — a contract is covered iff some test names it
 * (the convention `describe("<contract-id>: …")`, proven real by `declare-presence`'s three contracts
 * naming `presence.test.ts`'s three suites). Pure-by-injection (contract ids + test names in, report
 * out), deterministic, order-preserving — it mirrors {@link import("./adoption-proposal.js").classifyAdoption}
 * one tier DOWN (that is capability→gate coverage; this is contract→test coverage). No store / git / clock.
 *
 * Honest limits (named follow-on, mirroring adoption-proposal's "trusts the declaration; coverage
 * MEASUREMENT is follow-on"):
 *  - It is STATIC NAME-PRESENCE, not runtime observation: a test NAMED for a contract counts as
 *    covering it. It catches the DOCUMENTED failure mode (a DROPPED contract — no test names it at
 *    all). It does NOT catch a hollow test (`assert(true)` under the right name) — detecting that is
 *    the deeper follow-on (ADR-0020 §4 reward-hacking guards), and a runtime-observed coverage signal
 *    is the heavier mechanism the owner deferred.
 *  - The convention it enforces (a test name carries its contract's id) becomes a checkable standard.
 */

// ---------------------------------------------------------------------------
// Name-match: does a test name cover a contract id?
// ---------------------------------------------------------------------------

/** A character that is part of a contract-id token (ids are kebab: letters, digits, `-`, `_`). */
const ID_TOKEN_CHAR = /[A-Za-z0-9_-]/;

/** A position is a token boundary when it is the string edge or a non-id-token character. */
function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || !ID_TOKEN_CHAR.test(ch);
}

/**
 * PURE: does `testName` NAME `contractId` — i.e. contain it as a whole token? Boundary-aware on BOTH
 * sides (the chars around the match must not be id-token chars), so `fr-bounded` never matches a test
 * named for `fr-bounded-never-hangs` (the trailing `-` is an id char → not a boundary), and the
 * convention `describe("<id>: …")` matches (the trailing `:` IS a boundary). No regex on the id, so a
 * contract id with regex metacharacters is matched literally and safely.
 */
export function testNameCoversContract(testName: string, contractId: string): boolean {
  if (contractId.length === 0) return false;
  for (let from = 0; ; ) {
    const at = testName.indexOf(contractId, from);
    if (at < 0) return false;
    const before = at > 0 ? testName[at - 1] : undefined;
    const afterIdx = at + contractId.length;
    const after = afterIdx < testName.length ? testName[afterIdx] : undefined;
    if (isBoundary(before) && isBoundary(after)) return true;
    from = at + 1; // a non-boundary hit (a longer id contains this id as a substring) — keep scanning
  }
}

// ---------------------------------------------------------------------------
// Static test-name extraction
// ---------------------------------------------------------------------------

/**
 * The first string-literal argument of a `describe` / `test` / `it` call (with an optional
 * `.skip`/`.only`/`.each` modifier). Handles `'…'`, `"…"`, and `` `…` `` literals, with backslash
 * escapes. `\b` before the call name avoids matching `commit(` / `mytest(`. Static — it reads the
 * SOURCE, never executes it (offline, fail-closed: a file it cannot read contributes no names).
 */
const TEST_CALL_NAME = /\b(?:describe|test|it)(?:\.\w+)?\s*\(\s*(['"`])((?:\\.|(?!\1)[^])*?)\1/g;

/**
 * PURE: extract the declared test/suite names from a test file's SOURCE text — every `describe`/
 * `test`/`it` call's first string-literal arg, in source order. The coverage classifier matches
 * contract ids against these. A template literal with `${…}` is captured verbatim (the literal text
 * still carries any id prefix); a name built entirely dynamically is simply not matched (it then
 * cannot vouch for a contract — fail-closed toward "uncovered").
 */
export function extractTestNames(testSource: string): string[] {
  const names: string[] = [];
  for (const match of testSource.matchAll(TEST_CALL_NAME)) {
    names.push(match[2] ?? "");
  }
  return names;
}

// ---------------------------------------------------------------------------
// The classifier
// ---------------------------------------------------------------------------

/** Per-contract coverage: is it named by ≥1 observed test, and by which test name(s)? */
export interface ContractCoverage {
  /** The declared contract id (a member of the unit's `## Contracts`). */
  contractId: string;
  /** Covered iff ≥1 observed test names it (the naming convention). */
  covered: boolean;
  /** The observed test name(s) that name this contract (empty when uncovered). */
  coveredBy: string[];
}

/**
 * A unit's contract-coverage report: the per-contract classification plus the covered/uncovered
 * projections. Live-derivable (re-compute each run) — no timestamps, no verdict state, just the
 * structural diff of declared contracts against observed test names.
 */
export interface ContractCoverageReport {
  /** The unit (capability) this report is for. */
  unitId: string;
  /** Every declared contract, classified — in declared order (stable, never re-sorted). */
  contracts: ContractCoverage[];
  /** The covered contract ids (the convenience projection). */
  covered: string[];
  /**
   * The UNCOVERED contract ids — declared but named by no observed test. These are the contracts a
   * signed green would over-claim: the gap ADR-0020 §3 leaves open (it observes only the new test).
   */
  uncovered: string[];
}

/** Everything {@link classifyContractCoverage} reads, injected for determinism (pure — no I/O). */
export interface ContractCoverageSpec {
  /** The unit id (carried onto the report). */
  unitId: string;
  /** The unit's declared contract ids (from `parseContracts`), in declared order. */
  contractIds: readonly string[];
  /** The observed test names across the unit's test surface (from `extractTestNames`). */
  testNames: readonly string[];
}

/**
 * PURE: classify a unit's declared contracts by name-presence (the first slice). For each declared
 * contract, COVERED iff some observed test names it ({@link testNameCoversContract}); UNCOVERED
 * otherwise. Deterministic and order-preserving — `contracts` follows declared order; `covered` /
 * `uncovered` are stable. A duplicate contract id collapses to its first occurrence (a copy-paste slip
 * never double-counts). A unit with no declared contracts yields empty lists (vacuously covered —
 * nothing to check).
 */
export function classifyContractCoverage(spec: ContractCoverageSpec): ContractCoverageReport {
  const contracts: ContractCoverage[] = [];
  const covered: string[] = [];
  const uncovered: string[] = [];
  const seen = new Set<string>();
  for (const contractId of spec.contractIds) {
    if (seen.has(contractId)) continue; // collapse a duplicate contract id to its first occurrence
    seen.add(contractId);
    const coveredBy = spec.testNames.filter((name) => testNameCoversContract(name, contractId));
    const isCovered = coveredBy.length > 0;
    contracts.push({ contractId, covered: isCovered, coveredBy });
    (isCovered ? covered : uncovered).push(contractId);
  }
  return { unitId: spec.unitId, contracts, covered, uncovered };
}

/** Convenience: classify straight from parsed {@link ContractDecl}s (maps to their ids). */
export function classifyDeclaredCoverage(
  unitId: string,
  declared: readonly ContractDecl[],
  testNames: readonly string[],
): ContractCoverageReport {
  return classifyContractCoverage({
    unitId,
    contractIds: declared.map((c) => c.id),
    testNames,
  });
}
