import ts from "typescript";

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
 * This is the structural, offline check: it maps each declared contract to an OBSERVED test by the
 * naming convention — a contract is covered iff some test names it (the convention
 * `describe("<contract-id>: …")`, proven real by `declare-presence`'s three contracts naming
 * `presence.test.ts`'s three suites). Pure-by-injection (contract ids + test names in, report out),
 * deterministic, order-preserving — it mirrors {@link import("./adoption-proposal.js").classifyAdoption}
 * one tier DOWN (that is capability→gate coverage; this is contract→test coverage). No store / git / clock.
 *
 * HOLLOW-TEST DETECTION (ADR-0126, owner-directed 2026-06-27 — static AST over a runtime signal):
 * the first slice (ADR-0122) counted a test NAMED for a contract even if it was HOLLOW (`assert(true)`
 * under the right name). That is now closed at the EXTRACTION step: {@link extractVouchingTestNames}
 * parses the test source (the TypeScript compiler AST) and feeds the classifier only the names of tests
 * that actually VOUCH — a test that runs (not `.skip`/`.todo`) AND asserts something SUBSTANTIVE (an
 * `assert`/`expect` call with ≥1 argument that is not a trivially-constant literal). A hollow test is
 * simply absent from the observed names, so its contract reads UNCOVERED. Still STATIC and offline —
 * no execution, no `t.assert` plan-counting (this codebase asserts via `node:assert/strict`, which a
 * runtime reporter never counts), aligning with ADR-0020 §4's "no `assert(true)` / skipped-test" guards
 * as a lint-shaped rule.
 *
 * Honest limit (the named escalation path): detection is CONSERVATIVE — it flags only a clearly-hollow
 * test (no assertion, a constant-only assertion, or a skip), never a real test, biasing toward
 * "covered" to avoid false-hollows. A test that asserts something SUBSTANTIVE but semantically
 * IRRELEVANT to its contract (`assert.ok(unrelated)` under the right name) still reads covered —
 * judging that is the deeper follow-on (a semantic reviewer-agent, ADR-0122 / ADR-0020 §4), not a
 * structural check. The convention it enforces (a test name carries its contract's id) stays a
 * checkable standard.
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
// Hollow-test detection (ADR-0126): a test only VOUCHES if it runs and asserts substantively
// ---------------------------------------------------------------------------

/** A test/suite call observed in a test file's AST — the hollow-detection unit (ADR-0126). */
export interface ObservedTest {
  /** The test/suite name (the first string-literal arg) — what contract ids are matched against. */
  name: string;
  /** Skipped — `.skip`/`.todo` on the call, OR nested under one. A skipped test never runs, so it cannot vouch. */
  skipped: boolean;
  /**
   * VOUCHES for its name iff it is NOT skipped AND its lexical region contains ≥1 SUBSTANTIVE
   * assertion — an `assert`/`expect` call with ≥1 argument that is not a trivially-constant literal.
   * A hollow `assert(true)` (or no assertion at all) does NOT vouch. Only vouching names reach the
   * coverage classifier (so a hollow test's contract reads UNCOVERED).
   */
  vouches: boolean;
}

/** The test-runner call roots whose first string arg names a test/suite (mirrors `extractTestNames`). */
const TEST_CALL_ROOTS = new Set(["describe", "test", "it"]);
/** Modifiers that mean "named but never runs" — a `.skip`/`.todo` test asserts nothing at runtime. */
const SKIP_MODIFIERS = new Set(["skip", "todo"]);
/** The assertion-API roots this codebase uses: `node:assert/strict` (`assert.*`) and vitest (`expect`). */
const ASSERTION_NAMES = new Set(["assert", "expect"]);

/**
 * Walk a call's callee expression to its leftmost root identifier, collecting the member names along
 * the way. `describe.each([...])(name, …)` → root `describe`, members `["each"]`; `assert.ok(x)` →
 * root `assert`, members `["ok"]`; `expect(x).toBe(y)` → root `expect`, members `["toBe"]`;
 * `t.assert.ok(x)` → root `t`, members `["ok", "assert"]`. Unwraps call/paren/non-null wrappers.
 */
function calleeParts(expr: ts.Expression): { root: string | undefined; members: string[] } {
  const members: string[] = [];
  let node: ts.Expression = expr;
  for (;;) {
    if (ts.isPropertyAccessExpression(node)) {
      members.push(node.name.text);
      node = node.expression;
    } else if (ts.isElementAccessExpression(node)) {
      node = node.expression;
    } else if (ts.isCallExpression(node)) {
      node = node.expression; // descend e.g. `describe.each([...])(…)`'s inner call
    } else if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) {
      node = node.expression;
    } else {
      break;
    }
  }
  return { root: ts.isIdentifier(node) ? node.text : undefined, members };
}

/** The name a `describe`/`test`/`it` call declares — its first string-literal-like arg, or null. */
function testCallName(arg: ts.Expression | undefined): string | null {
  if (arg === undefined) return null;
  if (ts.isStringLiteralLike(arg)) return arg.text; // string + no-substitution template
  if (ts.isTemplateExpression(arg)) {
    // A template with `${…}`: the literal spans still carry any id prefix (mirrors `extractTestNames`).
    return arg.head.text + arg.templateSpans.map((s) => s.literal.text).join("");
  }
  return null;
}

/** Is this node a `describe`/`test`/`it` call? Returns its declared name + own skip/todo modifier, or null. */
function matchTestCall(node: ts.Node): { name: string; ownSkip: boolean } | null {
  if (!ts.isCallExpression(node)) return null;
  const { root, members } = calleeParts(node.expression);
  if (root === undefined || !TEST_CALL_ROOTS.has(root)) return null;
  const name = testCallName(node.arguments[0]);
  if (name === null) return null;
  return { name, ownSkip: members.some((m) => SKIP_MODIFIERS.has(m)) };
}

/** A trivially-constant literal: a scalar (or a unary/binary/paren of scalars). NOT an identifier/call/array/object. */
function isTriviallyConstant(expr: ts.Expression): boolean {
  let e: ts.Expression = expr;
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) {
    e = e.expression;
  }
  switch (e.kind) {
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return true;
  }
  if (ts.isIdentifier(e) && e.text === "undefined") return true;
  if (ts.isPrefixUnaryExpression(e)) return isTriviallyConstant(e.operand); // `!true`, `-1`
  if (ts.isBinaryExpression(e)) return isTriviallyConstant(e.left) && isTriviallyConstant(e.right); // `1 === 1`
  return false; // identifiers, property access, calls, arrays, objects, templates-with-subs → substantive
}

/** Gather every argument across a call/member chain — `expect(x).toBe(y)` yields `[y, x]`; `assert(c)` yields `[c]`. */
function chainArguments(call: ts.CallExpression): ts.Expression[] {
  const args: ts.Expression[] = [];
  let node: ts.Expression = call;
  for (;;) {
    if (ts.isCallExpression(node)) {
      args.push(...node.arguments);
      node = node.expression;
    } else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      node = node.expression;
    } else if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) {
      node = node.expression;
    } else {
      break;
    }
  }
  return args;
}

/**
 * Is `node` a SUBSTANTIVE assertion — an `assert`/`expect` call with ≥1 argument that references runtime
 * state (not a trivially-constant literal)? `assert(true)` / `expect(true).toBe(true)` / `assert.equal(1, 1)`
 * are NOT substantive (constant-only → hollow); `assert.ok(result.bounded)` / `expect(x).toBe(5)` are.
 */
function isSubstantiveAssertion(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const { root, members } = calleeParts(node.expression);
  const isAssertion =
    (root !== undefined && ASSERTION_NAMES.has(root)) || members.some((m) => ASSERTION_NAMES.has(m));
  if (!isAssertion) return false;
  return chainArguments(node).some((a) => !isTriviallyConstant(a));
}

/**
 * PURE: parse a test file's SOURCE (the TypeScript compiler AST) into the {@link ObservedTest}s it
 * declares — each `describe`/`test`/`it` call with its name, whether it is skipped (own or inherited
 * from a skipped ancestor), and whether it VOUCHES (runs AND has a substantive assertion anywhere in
 * its region, including nested tests). Source-ordered, deterministic, offline — no execution. A file
 * that cannot be parsed contributes no tests (fail-closed toward "uncovered").
 */
export function analyzeObservedTests(testSource: string): ObservedTest[] {
  const sf = ts.createSourceFile("__coverage__.ts", testSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const collected: { test: ObservedTest; pos: number }[] = [];
  /** Post-order: returns whether `node`'s subtree holds a substantive assertion. Skip flows top-down. */
  function visit(node: ts.Node, ancestorSkipped: boolean): boolean {
    const test = matchTestCall(node);
    const skippedHere = ancestorSkipped || (test !== null && test.ownSkip);
    // A test-call node is not itself an assertion; otherwise check this node directly.
    let subtreeSubstantive = test === null && isSubstantiveAssertion(node);
    ts.forEachChild(node, (child) => {
      // NB: forEachChild short-circuits on a TRUTHY return — keep this callback returning void.
      if (visit(child, skippedHere)) subtreeSubstantive = true;
    });
    if (test !== null) {
      collected.push({
        test: { name: test.name, skipped: skippedHere, vouches: subtreeSubstantive && !skippedHere },
        pos: node.getStart(sf),
      });
    }
    return subtreeSubstantive;
  }
  ts.forEachChild(sf, (child) => {
    visit(child, false);
  });
  collected.sort((a, b) => a.pos - b.pos);
  return collected.map((c) => c.test);
}

/**
 * PURE: the observed test names that VOUCH for their contract — the hollow-aware replacement for
 * {@link extractTestNames} as the coverage check's input (ADR-0126). A test whose region has no
 * substantive assertion, or that is skipped, is OMITTED — so a contract named only by a hollow test
 * reads UNCOVERED. The drop-in for `extractTestNames` in the coverage loaders.
 */
export function extractVouchingTestNames(testSource: string): string[] {
  return analyzeObservedTests(testSource)
    .filter((t) => t.vouches)
    .map((t) => t.name);
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
