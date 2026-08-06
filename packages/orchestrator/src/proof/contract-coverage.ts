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
 * `describe("<contract-id>: …")`, proven real by `deploy-health-signal`'s three contracts naming
 * `deploy-health.test.ts`'s three suites). Pure-by-injection (contract ids + test names in, report out),
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
 * TWO AXES, TWO FOLDS — they point in OPPOSITE directions, and each is honest only when read against
 * its own axis (corrected 2026-08-06; the module previously stated both as unscoped global claims,
 * which read as a contradiction and let the second one quietly deliver the outcome the first forbids):
 *
 *  - **HOLLOWNESS — folds toward "COVERED" (ADR-0126).** Detection is CONSERVATIVE: it flags only a
 *    clearly-hollow test (no assertion, a constant-only assertion, or a skip), never a real test. The
 *    bias exists to avoid FALSE-HOLLOWS — telling an honest author their real test does not count. A
 *    test that asserts something SUBSTANTIVE but semantically IRRELEVANT to its contract
 *    (`assert.ok(unrelated)` under the right name) still reads covered; judging that is the deeper
 *    follow-on (a semantic reviewer-agent, ADR-0122 / ADR-0020 §4), not a structural check.
 *  - **READABILITY — folds toward "UNCOVERED".** A title this checker cannot read statically vouches
 *    for nothing, because a name it never saw cannot be shown to carry a contract id. That fold is
 *    only legitimate for what is GENUINELY unreadable: whenever the title is statically readable it
 *    MUST be read, or the readability fold silently delivers the false-hollow the hollowness fold
 *    exists to prevent. That is not hypothetical — it was live until 2026-08-06 (see
 *    {@link readTestCallTitle}), when a `+`-concatenated title stamped `coverage 0/6` onto a signed
 *    `--real` verdict whose six tests all existed, named their contracts verbatim, and passed.
 *
 * Because the two folds disagree, an UNREAD title and an ABSENT test must never share a bucket: "I
 * could not read six titles" and "six tests are missing" are different claims, and a report that
 * conflates them is not a report. {@link readTestSurface} keeps them apart — the vouching names on
 * one side, the count of titles that could not be read in full on the other.
 *
 * The convention it enforces (a test name carries its contract's id) stays a checkable standard.
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
 * `test`/`it` call's first string-literal arg, in source order.
 *
 * LEGACY / CONTRAST ONLY — not the coverage input. Every production loader reads
 * {@link readTestSurface} (via {@link extractVouchingTestNames}); this regex survives as the
 * pre-ADR-0126 name-presence signal the hollow-detection tests contrast against. It reads titles
 * DIFFERENTLY from the AST path and is not maintained to agree with it: it captures only the FIRST
 * literal of a `+`-concatenated title (`"a: x" + "more"` → `"a: x"`), keeps a template's `${…}`
 * verbatim rather than eliding it, and does not see through parentheses. Read the AST path for what
 * coverage actually observes.
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
  /**
   * The test/suite name as READ from source — what contract ids are matched against. `""` when the
   * title is built entirely at runtime; a PARTIAL read (the static text only) when it is part
   * runtime, which `titleFullyStatic` distinguishes from a clean read.
   */
  name: string;
  /**
   * TRUE iff the whole title was statically readable. FALSE means this checker read some or none of
   * it, so `name` under-states the real title and a contract it would have named can read UNCOVERED
   * for a reason that has nothing to do with the test being absent or hollow. Surfaced as a count by
   * {@link readTestSurface} so a `0/N` report can say WHICH of the two things it means.
   */
  titleFullyStatic: boolean;
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

/** A test title as READ from source: the static text, plus whether the WHOLE title was static. */
export interface ReadTitle {
  /** The statically-readable text — `""` when no part of the title is a literal. */
  text: string;
  /** TRUE iff EVERY part was a static string (no `${…}` substitution, no non-literal operand). */
  fullyStatic: boolean;
}

/**
 * PURE: read a `describe`/`test`/`it` call's title from its first argument. ONE rule, applied
 * uniformly to every title shape: **read the static text, elide the runtime parts, and record
 * whether anything was elided.** Nothing is ever EVALUATED — folding stops at literals, so no
 * identifier, call, or property access is resolved.
 *
 *  - a string / no-substitution template → the text, fully static;
 *  - a parenthesised title → read through the parens (`("c-a: x")`);
 *  - `+` concatenation → both operands read RECURSIVELY and joined. A concatenation of literals is
 *    static and trivially foldable, so it is READ — this is the blind spot fixed 2026-08-06, where a
 *    title split across two lines (the ordinary way to keep a long title readable) was dropped
 *    wholesale and its contract stamped UNCOVERED onto a signed verdict;
 *  - a template with `${…}` → the literal spans, which still carry any id prefix — NOT fully static;
 *  - anything else (a bare identifier, a call) → no static text at all — NOT fully static.
 *
 * The elision is deliberately loss-TOLERANT rather than all-or-nothing, matching the template rule
 * that predates it: the house convention puts the contract id at the LEAD of the title, so the
 * literal text is where an id lives and a runtime part is almost always trailing prose. `fullyStatic`
 * is what keeps that honest — a partially-read title is reported as such ({@link readTestSurface})
 * instead of passing as a clean read. Returns null only when the call has no first argument.
 *
 * EXPORTED so every static reader of a test title in this repo can share ONE spelling. It used to be
 * private and `verification-decay.ts` carried a hand-kept copy, whose own comment named the hazard:
 * the `vacuous-proof` instrument JOINS its names against `extractVouchingTestNames`'s output, so the
 * moment the two spellings diverge the join silently misses and the instrument under-reports while
 * still looking healthy. Fixing the concatenation blind spot here would have caused exactly that, so
 * the copy was deleted in favour of this import — the drift can no longer happen.
 */
export function readTestCallTitle(arg: ts.Expression | undefined): ReadTitle | null {
  if (arg === undefined) return null;
  if (ts.isStringLiteralLike(arg)) return { text: arg.text, fullyStatic: true };
  if (ts.isParenthesizedExpression(arg)) return readTestCallTitle(arg.expression);
  if (ts.isTemplateExpression(arg)) {
    return {
      text: arg.head.text + arg.templateSpans.map((s) => s.literal.text).join(""),
      fullyStatic: false,
    };
  }
  if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = readTestCallTitle(arg.left);
    const right = readTestCallTitle(arg.right);
    return {
      text: (left?.text ?? "") + (right?.text ?? ""),
      fullyStatic: left?.fullyStatic === true && right?.fullyStatic === true,
    };
  }
  return { text: "", fullyStatic: false }; // built at runtime — readable text: none
}

/**
 * Is this node a `describe`/`test`/`it` call? Returns its read title + own skip/todo modifier, or
 * null when it is not a test call at all. A test call whose title could NOT be read is still
 * MATCHED (with empty text and `titleFullyStatic: false`) — dropping it would erase the difference
 * between "this checker could not read the title" and "no such test exists".
 */
function matchTestCall(
  node: ts.Node,
): { name: string; ownSkip: boolean; titleFullyStatic: boolean } | null {
  if (!ts.isCallExpression(node)) return null;
  const { root, members } = calleeParts(node.expression);
  if (root === undefined || !TEST_CALL_ROOTS.has(root)) return null;
  const title = readTestCallTitle(node.arguments[0]);
  if (title === null) return null;
  return {
    name: title.text,
    ownSkip: members.some((m) => SKIP_MODIFIERS.has(m)),
    titleFullyStatic: title.fullyStatic,
  };
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
 * declares — each `describe`/`test`/`it` call with its read name, whether that name was FULLY static
 * ({@link ObservedTest.titleFullyStatic}), whether it is skipped (own or inherited from a skipped
 * ancestor), and whether it VOUCHES (runs AND has a substantive assertion anywhere in its region,
 * including nested tests). Source-ordered, deterministic, offline — no execution.
 *
 * Fail-closed on the READABILITY axis, at two different grains — the distinction matters:
 *  - a SOURCE that does not parse contributes no tests at all (there is nothing to observe);
 *  - a TEST whose TITLE does not read is still OBSERVED, with empty/partial `name` and
 *    `titleFullyStatic: false`. It vouches for no contract, but it is on the record — so the report
 *    can say "unread", never silently "absent".
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
        test: {
          name: test.name,
          titleFullyStatic: test.titleFullyStatic,
          skipped: skippedHere,
          vouches: subtreeSubstantive && !skippedHere,
        },
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

/** What one read of a test source yields: the classifier's input, plus what could NOT be read. */
export interface TestSurfaceRead {
  /**
   * The observed test names that VOUCH for their contract — the coverage classifier's input
   * (ADR-0126). A test that is skipped, has no substantive assertion in its region, or has no
   * readable title is OMITTED, so a contract named only by such a test reads UNCOVERED.
   */
  vouching: string[];
  /**
   * How many observed titles this checker could NOT read in full. **The number that tells a `0/N`
   * apart from a `0/N`:** with `unreadTitles: 0` an uncovered contract is genuinely un-named by any
   * substantive test; above 0, some of the surface was never legible to a static reader, and the
   * uncovered list is at least partly a statement about THIS CHECKER rather than about the tests.
   * Both are honest outcomes; conflating them is not.
   */
  unreadTitles: number;
}

/**
 * PURE: read a test file's source ONCE into both facts the coverage surfaces need — the vouching
 * names to classify, and the count of titles that could not be read in full. Keeping them on one
 * return is the point: they come from the same parse and are only meaningful together (ADR-0126's
 * hollowness fold and the readability fold point in opposite directions, so an uncovered contract is
 * ambiguous until you know which fold produced it).
 */
export function readTestSurface(testSource: string): TestSurfaceRead {
  const observed = analyzeObservedTests(testSource);
  return {
    // An empty name vouches for nothing (`testNameCoversContract` never matches it) — drop it rather
    // than feed a meaningless "" to the classifier; `unreadTitles` is where that test is accounted.
    vouching: observed.filter((t) => t.vouches && t.name.length > 0).map((t) => t.name),
    unreadTitles: observed.filter((t) => !t.titleFullyStatic).length,
  };
}

/**
 * PURE: the observed test names that VOUCH for their contract — the hollow-aware replacement for
 * {@link extractTestNames} as the coverage check's input (ADR-0126). The drop-in for
 * `extractTestNames` in the coverage loaders; {@link readTestSurface} when the caller also wants to
 * report WHY a contract is uncovered.
 */
export function extractVouchingTestNames(testSource: string): string[] {
  return readTestSurface(testSource).vouching;
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
