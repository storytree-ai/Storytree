import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyContractCoverage,
  classifyDeclaredCoverage,
  extractTestNames,
  extractVouchingTestNames,
  analyzeObservedTests,
  findOptionsFormSkips,
  readTestSurface,
  testNameCoversContract,
} from "./contract-coverage.js";
import type { ObservedTest } from "./contract-coverage.js";

/**
 * The CONTRACT-COVERAGE classifier (ADR-0020 coverage-honesty follow-on). The headline red→green:
 * a unit with an UNCOVERED contract is flagged (the gap a signed `--real` green leaves open); a
 * fully-covered unit passes. Pure — fixtures in, report out; no store/git/clock.
 */

/**
 * The file name every inline fixture below is read as. The name selects the parse (a `.tsx` file is
 * read with JSX, a `.ts` file without), and these fixtures are plain TypeScript; the two tests about
 * that choice name their own files.
 */
const TS_FIXTURE = "fixture.test.ts";

// ---------------------------------------------------------------------------
// testNameCoversContract — boundary-aware name match
// ---------------------------------------------------------------------------

test("testNameCoversContract: the `describe(\"<id>: …\")` convention matches", () => {
  // The real convention (deploy-health-signal ↔ deploy-health.test.ts).
  assert.equal(
    testNameCoversContract(
      "deploy-health-red-run-classifies-loud: a failing newest run formats a loud WARN",
      "deploy-health-red-run-classifies-loud",
    ),
    true,
  );
});

test("testNameCoversContract: a shorter id does NOT match a longer contract's test (boundary)", () => {
  // `fr-bounded` must not be considered covered by a test named for `fr-bounded-never-hangs` — the
  // trailing `-` is an id-token char, so it is not a token boundary.
  assert.equal(
    testNameCoversContract("fr-bounded-never-hangs: the deadline holds", "fr-bounded"),
    false,
  );
  // …but the FULL id matches its own test.
  assert.equal(
    testNameCoversContract("fr-bounded-never-hangs: the deadline holds", "fr-bounded-never-hangs"),
    true,
  );
});

test("testNameCoversContract: the id is matched as a whole token anywhere in the name", () => {
  assert.equal(testNameCoversContract("the staleness-is-derived band is pure", "staleness-is-derived"), true);
  // A bare prefix that runs into more id chars is not a token match.
  assert.equal(testNameCoversContract("staleness-is-derivedX", "staleness-is-derived"), false);
});

test("testNameCoversContract: an empty contract id never matches", () => {
  assert.equal(testNameCoversContract("anything", ""), false);
});

// ---------------------------------------------------------------------------
// extractTestNames — static name extraction
// ---------------------------------------------------------------------------

test("extractTestNames pulls describe/test/it names (double, single, backtick, modifiers)", () => {
  const src = `
import test from "node:test";
describe("presence-doc-fail-closed: schema validation", () => {});
test('staleness-is-derived: bands are pure', () => {});
it(\`declaration-upsert-merge: merge is stable\`, () => {});
test.skip("fr-bounded-never-hangs: deadline", () => {});
it.only("only-this-one", () => {});
`;
  assert.deepEqual(extractTestNames(src), [
    "presence-doc-fail-closed: schema validation",
    "staleness-is-derived: bands are pure",
    "declaration-upsert-merge: merge is stable",
    "fr-bounded-never-hangs: deadline",
    "only-this-one",
  ]);
});

test("extractTestNames does NOT mistake a word ending in a call name (commit/mytest) for a test", () => {
  const src = `
function commit(msg) {}
const mytest = ("not a test");
describe("real-suite", () => {});
`;
  assert.deepEqual(extractTestNames(src), ["real-suite"]);
});

// ---------------------------------------------------------------------------
// extractVouchingTestNames / analyzeObservedTests — hollow-test detection (ADR-0126)
// ---------------------------------------------------------------------------

test("extractVouchingTestNames: a substantive assertion vouches; assert(true) is hollow", () => {
  const src = `
    describe("real-contract: bounded", () => {
      it("returns within the deadline", () => { assert.ok(result.bounded); });
    });
    describe("hollow-contract: bounded", () => {
      it("works", () => { assert(true); });
    });
  `;
  const vouching = extractVouchingTestNames(src, TS_FIXTURE);
  // The real suite vouches (it names the contract AND a nested test asserts substantively).
  assert.ok(vouching.includes("real-contract: bounded"));
  // The hollow suite does NOT — `assert(true)` proves nothing, so it cannot vouch for its contract.
  assert.ok(!vouching.includes("hollow-contract: bounded"));
});

test("extractVouchingTestNames: a test with NO assertion does not vouch", () => {
  const src = `it("c-x: does setup only", () => { const v = compute(); doThing(v); });`;
  assert.deepEqual(extractVouchingTestNames(src, TS_FIXTURE), []);
});

test("extractVouchingTestNames: a skipped test never vouches, even with a real assertion", () => {
  // Named but never runs — `.skip`/`.todo` cannot vouch (it asserts nothing at runtime).
  assert.deepEqual(
    extractVouchingTestNames(`it.skip("c-x: real but skipped", () => { assert.equal(actual, expected); });`, TS_FIXTURE),
    [],
  );
  // Skip propagates to nested tests — a real `it` under a skipped `describe` still never runs.
  assert.deepEqual(
    extractVouchingTestNames(`describe.skip("c-x: suite off", () => { it("inner", () => { assert.ok(v); }); });`, TS_FIXTURE),
    [],
  );
});

test("extractVouchingTestNames: expect(true).toBe(true) is hollow; expect(x).toBe(n) is substantive", () => {
  assert.deepEqual(extractVouchingTestNames(`it("c-a: x", () => { expect(true).toBe(true); });`, TS_FIXTURE), []);
  assert.deepEqual(extractVouchingTestNames(`it("c-b: x", () => { expect(result).toBe(5); });`, TS_FIXTURE), ["c-b: x"]);
});

test("extractVouchingTestNames: a constant-only assertion (assert.equal(1, 1)) is hollow", () => {
  assert.deepEqual(extractVouchingTestNames(`it("c-x: tautology", () => { assert.equal(1, 1); });`, TS_FIXTURE), []);
});

test("extractVouchingTestNames: a describe named for the contract vouches via a substantive nested it", () => {
  const src = `
    describe("fr-bounded-never-hangs: the deadline holds", () => {
      it("rejects when the broker never accepts", async () => {
        await assert.rejects(connect(brokerThatHangs));
      });
    });
  `;
  assert.ok(extractVouchingTestNames(src, TS_FIXTURE).includes("fr-bounded-never-hangs: the deadline holds"));
});

test("analyzeObservedTests: surfaces name/skipped/vouches per observed test, in source order", () => {
  const src = `
    describe("a: real", () => { it("inner-a", () => { assert.ok(x); }); });
    it.skip("b: skipped", () => { assert.ok(y); });
    it("c: hollow", () => { assert(true); });
  `;
  const observed = analyzeObservedTests(src, TS_FIXTURE);
  const byName = (n: string) => observed.find((o) => o.name === n);
  assert.equal(byName("a: real")?.vouches, true);
  assert.equal(byName("b: skipped")?.skipped, true);
  assert.equal(byName("b: skipped")?.vouches, false);
  assert.equal(byName("c: hollow")?.vouches, false);
  // Source order is preserved (the describe lead before its inner it).
  assert.deepEqual(observed.map((o) => o.name).slice(0, 2), ["a: real", "inner-a"]);
});

test("RED→GREEN (ADR-0126): a contract named only by a HOLLOW test reads UNCOVERED; a substantive test covers it", () => {
  const contractIds = ["fr-bounded-never-hangs"];
  const hollow = `describe("fr-bounded-never-hangs: deadline", () => { it("works", () => { assert(true); }); });`;
  const real = `describe("fr-bounded-never-hangs: deadline", () => { it("rejects on hang", async () => { await assert.rejects(connect(hangs)); }); });`;
  // Hollow: the name IS present, but the test proves nothing — the contract is honestly UNCOVERED.
  const hollowReport = classifyContractCoverage({
    unitId: "u",
    contractIds,
    testNames: extractVouchingTestNames(hollow, TS_FIXTURE),
  });
  assert.deepEqual(hollowReport.uncovered, ["fr-bounded-never-hangs"]);
  // Real: the SAME contract is covered once the test asserts something substantive.
  const realReport = classifyContractCoverage({
    unitId: "u",
    contractIds,
    testNames: extractVouchingTestNames(real, TS_FIXTURE),
  });
  assert.deepEqual(realReport.covered, ["fr-bounded-never-hangs"]);
});

test("contrast: static name-presence (extractTestNames) counts the hollow test — the gap ADR-0126 closes", () => {
  const hollow = `describe("fr-bounded-never-hangs: deadline", () => { it("works", () => { assert(true); }); });`;
  // The OLD signal: name-presence sees the contract NAMED → would (over-)count it as covered.
  assert.ok(extractTestNames(hollow).some((n) => n.includes("fr-bounded-never-hangs")));
  // The NEW signal: the hollow test does not vouch → the contract is honestly uncovered.
  assert.ok(!extractVouchingTestNames(hollow, TS_FIXTURE).includes("fr-bounded-never-hangs: deadline"));
});

// ---------------------------------------------------------------------------
// The OPTIONS-FORM skip — `test(name, { skip: X }, fn)` (ADR-0126's named blind spot)
//
// node:test and vitest accept a skip as a SECOND ARGUMENT as well as through a `.skip`/`.todo`
// modifier. The classifier used to read only the modifier, so a gated test with an asserting body
// reported `vouches: true` whether or not it ran (friction
// `an-environment-gated-test-has-no-observable-skip-form`). The VALUE says how certain the skip is: a
// truthy literal never runs, while an expression (`!DB`) runs or not depending on where the file
// loads. Coverage withholds credit from both; the per-test review reads the difference (ADR-0573 C6).
// ---------------------------------------------------------------------------

/** The skip facts one observed test carries, as one comparable value. */
function skipFacts(t: ObservedTest | undefined) {
  return {
    skipped: t?.skipped,
    conditionallySkipped: t?.conditionallySkipped,
    substantive: t?.substantive,
    vouches: t?.vouches,
  };
}

test("options-form skip: a truthy LITERAL value is UNCONDITIONAL — skipped, and it never vouches", () => {
  const src = `
    test("c-a: skip true", { skip: true }, () => { assert.equal(actual, expected); });
    test("c-b: skip with a reason", { skip: "needs a GPU" }, () => { assert.equal(actual, expected); });
    it("c-c: todo true", { todo: true }, () => { assert.ok(result.bounded); });
  `;
  const observed = analyzeObservedTests(src, TS_FIXTURE);
  assert.equal(observed.length, 3);
  for (const t of observed) {
    assert.deepEqual(
      skipFacts(t),
      { skipped: true, conditionallySkipped: false, substantive: true, vouches: false },
      t.name,
    );
  }
});

test("options-form skip: an EXPRESSION value is CONDITIONAL — not certain, still substantive, and it never vouches", () => {
  // The corpus's own shapes: `skip: !DB` on the live-store tests, a ternary on the credential-gated
  // backend, and the shorthand an author reaches for once the condition has a name.
  const src = `
    test("c-a: live-store gate", { skip: !DB }, () => { assert.equal(actual, expected); });
    test("c-b: credential gate", { skip: liveEnabled ? false : "credential-gated" }, () => { assert.ok(mesh.glb); });
    const skip = !shellResolves();
    test("c-c: shorthand", { skip }, () => { assert.equal(code, 0); });
    it("c-d: a gated todo", { todo: pending }, () => { assert.ok(v); });
  `;
  const byName = new Map(analyzeObservedTests(src, TS_FIXTURE).map((t) => [t.name, t]));
  for (const name of ["c-a: live-store gate", "c-b: credential gate", "c-c: shorthand", "c-d: a gated todo"]) {
    assert.deepEqual(
      skipFacts(byName.get(name)),
      { skipped: false, conditionallySkipped: true, substantive: true, vouches: false },
      name,
    );
  }
});

test("options-form skip: a FALSY literal skips nothing — the test still vouches", () => {
  // `nvidia-trellis.test.ts`'s ternary reads `false` on the branch that runs, so a rule keyed on the
  // key's mere presence would withhold credit from a test that always runs — the false-hollow
  // ADR-0126's conservative bias exists to prevent.
  const src = `
    test("c-a: skip false", { skip: false, concurrency: 2 }, () => { assert.ok(v); });
    test("c-b: todo false", { todo: false }, () => { assert.ok(v); });
    test("c-c: an empty reason", { skip: "" }, () => { assert.ok(v); });
    test("c-d: null and undefined", { skip: null, todo: undefined }, () => { assert.ok(v); });
    test("c-e: zero", { skip: 0 }, () => { assert.ok(v); });
  `;
  const observed = analyzeObservedTests(src, TS_FIXTURE);
  assert.equal(observed.length, 5);
  for (const t of observed) {
    assert.deepEqual(
      skipFacts(t),
      { skipped: false, conditionallySkipped: false, substantive: true, vouches: true },
      t.name,
    );
  }
});

test("options-form skip: a skipped SUITE passes its certainty to every test under it, and the stronger skip wins", () => {
  const src = `
    describe("c-live: needs a database", { skip: !DB }, () => {
      it("round-trips", () => { assert.deepEqual(read, written); });
      it.skip("already off", () => { assert.ok(v); });
    });
    describe("c-off: never runs", { skip: true }, () => {
      it("inner", { skip: !DB }, () => { assert.ok(v); });
    });
  `;
  const certainty = (t: ObservedTest): string =>
    t.skipped ? "unconditional" : t.conditionallySkipped ? "conditional" : "none";
  assert.deepEqual(
    analyzeObservedTests(src, TS_FIXTURE).map((t) => [t.name, certainty(t), t.vouches]),
    [
      ["c-live: needs a database", "conditional", false],
      ["round-trips", "conditional", false],
      // A certain skip outranks the suite's conditional one…
      ["already off", "unconditional", false],
      ["c-off: never runs", "unconditional", false],
      // …and a conditional skip never weakens a certain one above it.
      ["inner", "unconditional", false],
    ],
  );
});

test("RED→GREEN (ADR-0126's options-form blind spot): a contract named ONLY by an options-form-skipped test reads UNCOVERED", () => {
  // The live instance ADR-0126 measured: `release-claims-by-branch-clears-the-branch`, whose only tests
  // carry `{ skip: !DB }`, read COVERED offline, credited by tests that did not execute.
  const contractIds = ["release-claims-by-branch-clears-the-branch"];
  const coverageOf = (skip: string) =>
    classifyContractCoverage({
      unitId: "claim-store-work-time",
      contractIds,
      testNames: extractVouchingTestNames(
        `test("release-claims-by-branch-clears-the-branch: bulk-releases a branch", { skip: ${skip} }, async () => { assert.equal(released.length, 2); });`,
        TS_FIXTURE,
      ),
    });
  assert.deepEqual(coverageOf("!DB").uncovered, contractIds, "a conditional skip withholds credit");
  assert.deepEqual(coverageOf("true").uncovered, contractIds, "an unconditional skip withholds credit");
  assert.deepEqual(coverageOf("false").covered, contractIds, "a falsy literal skips nothing");
});

test("findOptionsFormSkips: reads the options form on test / it / describe, quoting the gate back", () => {
  const skips = findOptionsFormSkips(
    [
      'test("a runs", () => { assert.ok(x); });',
      'test("b is gated", { skip: !DB }, () => { assert.ok(x); });',
      'it("c is gated", { todo: "pending" }, () => { assert.ok(x); });',
      'describe("d is gated", { skip: true }, () => {});',
      'test("e is gated", { skip }, () => { assert.ok(x); });',
    ].join("\n"),
    TS_FIXTURE,
  );
  assert.deepEqual([...skips.keys()], ["b is gated", "c is gated", "d is gated", "e is gated"]);
  assert.equal(skips.get("b is gated"), "skip: !DB");
  assert.equal(skips.get("e is gated"), "skip");
});

test("findOptionsFormSkips: a FALSY literal is no skip, and neither a modifier nor a non-test call is its subject", () => {
  // The false positive the falsy exclusion prevents: `nvidia-trellis.test.ts` writes
  // `skip: liveEnabled ? false : "…"`, so a rule keyed on the key's presence would flag a test that runs.
  const skips = findOptionsFormSkips(
    [
      'test("always runs", { skip: false, concurrency: 2 }, () => { assert.ok(x); });',
      'test.skip("modifier", () => { assert.ok(x); });',
      'it.todo("todo modifier");',
      'request("/api/x", { skip: true }, () => {});',
      'configure("y", { skip: !DB });',
    ].join("\n"),
    TS_FIXTURE,
  );
  assert.deepEqual([...skips.keys()], []);
});

test("findOptionsFormSkips and analyzeObservedTests apply ONE rule: nothing the first reads as gated does the second credit", () => {
  // The coupling the `vacuous-proof` instrument rests on. Each shape either reader treats specially is
  // here, so a rule that drifted in one of them would put a name on both sides of that instrument's join.
  const src = `
    test("c-cond", { skip: !DB }, () => { assert.ok(v); });
    test("c-lit", { skip: "why" }, () => { assert.ok(v); });
    test("c-short", { skip }, () => { assert.ok(v); });
    test("c-todo", { todo: pending }, () => { assert.ok(v); });
    test("c-false", { skip: false }, () => { assert.ok(v); });
    test("c-concat" + " title", { skip: !DB }, () => { assert.ok(v); });
    describe("c-suite", { skip: !DB }, () => { it("c-inner", () => { assert.ok(v); }); });
  `;
  const gated = [...findOptionsFormSkips(src, TS_FIXTURE).keys()];
  assert.deepEqual(gated, ["c-cond", "c-lit", "c-short", "c-todo", "c-concat title", "c-suite"]);
  const vouching = new Set(extractVouchingTestNames(src, TS_FIXTURE));
  assert.deepEqual(gated.filter((name) => vouching.has(name)), []);
  assert.deepEqual([...vouching], ["c-false"], "only the falsy literal still vouches");
});

// ---------------------------------------------------------------------------
// Static TITLE READING — the readability axis (found 2026-08-06 via PR #1172)
//
// The readability axis is NOT the hollowness axis. Hollowness folds toward "covered" (ADR-0126:
// never tell an honest author their real test does not count); readability folds toward
// "uncovered" (an unread title vouches for nothing). The bug these pin: a title the checker COULD
// read statically was being folded as if it were unreadable, which routed an honest test into the
// uncovered bucket — the exact outcome ADR-0126's bias forbids.
//
// NB (the negative control): an ordinary-title fixture passes with the blind spot fully intact, so
// every test here uses a title shape the old extractor could not read.
// ---------------------------------------------------------------------------

test("readTitle: a `+`-concatenated title is READ (PR #1172 — six honest tests read 0/6 uncovered)", () => {
  // The shape a leaf authors when a title is too long for one line. Fully static, trivially foldable.
  const src = `
    test("osra-offer-set-is-stable: the offer set is stable across " +
         "repeated renders", () => { assert.deepEqual(first, second); });
  `;
  assert.deepEqual(extractVouchingTestNames(src, TS_FIXTURE), [
    "osra-offer-set-is-stable: the offer set is stable across repeated renders",
  ]);
});

test("readTitle: concatenation folds recursively (3-way) and through parentheses", () => {
  const src = `
    test("c-a" + ("-three: " + "folded recursively"), () => { assert.ok(v); });
    test(("c-b: parenthesised literal"), () => { assert.ok(w); });
  `;
  assert.deepEqual(extractVouchingTestNames(src, TS_FIXTURE), [
    "c-a-three: folded recursively",
    "c-b: parenthesised literal",
  ]);
});

test("readTitle: only LITERALS fold — a runtime operand is never evaluated, just elided", () => {
  // The static text is read (it still carries the id prefix, mirroring the template rule); the
  // runtime operand is elided, NEVER evaluated. `suffix` must not appear in the name.
  const src = `test("c-x: static lead " + suffix, () => { assert.ok(v); });`;
  assert.deepEqual(extractVouchingTestNames(src, TS_FIXTURE), ["c-x: static lead "]);
});

test("readTitle: a fully-dynamic title is OBSERVED as unread, not silently dropped", () => {
  // The honesty point: "could not parse this title" and "no test names this contract" are DIFFERENT
  // facts. The old extractor bucketed both as absent, so a signed 0/N could not be read back.
  const src = `test(titleFromAVariable, () => { assert.ok(v); });`;
  const observed = analyzeObservedTests(src, TS_FIXTURE);
  assert.equal(observed.length, 1, "the test call is observed even though its title is unreadable");
  assert.equal(observed[0]?.titleFullyStatic, false);
  assert.equal(observed[0]?.name, "", "no static text was readable");
  // …and it vouches for NOTHING — the readability fold stays closed toward "uncovered".
  assert.deepEqual(extractVouchingTestNames(src, TS_FIXTURE), []);
});

test("readTestSurface: separates 'could not read the title' from 'no such test' (the two facts)", () => {
  const src = `
    test("c-a: fully static and read", () => { assert.ok(v); });
    test(fromAVariable, () => { assert.ok(w); });
    test(\`c-c: template with \${sub}\`, () => { assert.ok(x); });
  `;
  const surface = readTestSurface(src, TS_FIXTURE);
  // Only the readable titles reach the classifier…
  assert.deepEqual(surface.vouching, ["c-a: fully static and read", "c-c: template with "]);
  // …and the two titles that were NOT fully static are COUNTED, so a 0/N report can say WHY.
  assert.equal(surface.unreadTitles, 2);
  // A surface with nothing to flag reports zero (no false alarm on ordinary titles).
  assert.equal(readTestSurface(`test("c-a: plain", () => { assert.ok(v); });`, TS_FIXTURE).unreadTitles, 0);
});

test("readTestSurface: a parameterised `it.each(table)(title, …)` is ONE test, not a phantom unread", () => {
  // `it.each(table)(title, fn)` is TWO nested calls that both reach root `it`. Only the OUTER one
  // declares a test — the inner factory's first argument is the data TABLE, which is not a title and
  // must not be counted as one the reader "could not read". MEASURED 2026-08-06: this phantom was the
  // ONLY unreadTitles hit across all 123 real-build test surfaces in the repo, and it sat on a unit
  // (`render-claim-as-wisp`) whose titles all read perfectly — so the caveat it raised was pure noise
  // on an otherwise-correct axis, and the reject-the-axis alternative would have DELETED that axis.
  const src = `
    it.each(['a', 'b'] as const)('c-each: carries %s through the fold', (v) => { assert.ok(v); });
    describe.each([1, 2])('c-suite: the %i case', (n) => { assert.equal(n, n + 0); });
  `;
  const surface = readTestSurface(src, TS_FIXTURE);
  assert.deepEqual(surface.vouching, ["c-each: carries %s through the fold", "c-suite: the %i case"]);
  assert.equal(surface.unreadTitles, 0, "a data table is not an unread title");
  assert.equal(analyzeObservedTests(src, TS_FIXTURE).length, 2, "the factories are not extra tests");
});

test("analyzeObservedTests: records the declaring call, and whether a `.each` table expands it (ADR-0573 D3)", () => {
  // The per-test join reads both: an empty suite reports no row on any runner, and a table-bound
  // declaration expands into several runtime rows that no single declaration can be bound to.
  const src = `
    describe("c-suite: a suite", () => { it("c-a: a test", () => { assert.ok(v); }); });
    it.each(['a', 'b'] as const)('c-each: carries %s', (v) => { assert.ok(v); });
    test("c-plain: a plain test", () => { assert.ok(v); });
  `;
  assert.deepEqual(
    analyzeObservedTests(src, TS_FIXTURE).map((t) => [t.name, t.call, t.parameterised]),
    [
      ["c-suite: a suite", "describe", false],
      ["c-a: a test", "it", false],
      ["c-each: carries %s", "it", true],
      ["c-plain: a plain test", "test", false],
    ],
  );
});

test("analyzeObservedTests: a `.tsx` test file parses as TSX, so a test after JSX keeps its enclosing describe (ADR-0573 D3)", () => {
  // MEASURED 2026-09-15 (`docs/research/net-new-skeleton-red-measurement-2026-09-15.md` §7): parsed as
  // plain TypeScript, every `.tsx` test file the real builds declare carries parse errors, and in four
  // of them the error recovery drops a test's enclosing `describe`. The per-test join keys on the full
  // title path, so a correct test then reads as declared and never reported, beside a reported row
  // that matches nothing. An inline object prop is the smallest shape found that loses the suite.
  const src = `
    describe("Dock", () => {
      it("c-seeds: a seed opens a tab", () => {
        render(<Dock seed={{ command: "ls", token: 1 }} />);
        expect(screen.getByRole("tab")).toBeTruthy();
      });
      it("c-follows-jsx: a test after the JSX keeps its describe", () => {
        expect(bridge.write).not.toHaveBeenCalled();
      });
    });
  `;
  assert.deepEqual(
    analyzeObservedTests(src, "Dock.test.tsx").map((t) => [...t.ancestors, t.name]),
    [
      ["Dock"],
      ["Dock", "c-seeds: a seed opens a tab"],
      ["Dock", "c-follows-jsx: a test after the JSX keeps its describe"],
    ],
  );
});

test("analyzeObservedTests: a `.ts` test file stays TypeScript, so a generic arrow and an angle-bracket assertion keep the describe", () => {
  // The other half of the same rule, and why the parse follows the file rather than always being TSX:
  // read as JSX, `<T>(x: T) => x` and `<number>parsed` open elements, and every test after them is lost.
  const src = `
    describe("identity", () => {
      it("c-generic-arrow: a generic arrow keeps its type parameter", () => {
        const identity = <T>(x: T): T => x;
        expect(identity(1)).toBe(1);
      });
      it("c-angle-assertion: an angle-bracket assertion reads its operand", () => {
        const port = <number>parsed;
        expect(port).toBe(8080);
      });
      it("c-follows-both: a test after them keeps its describe", () => {
        expect(identity).toBeDefined();
      });
    });
  `;
  assert.deepEqual(
    analyzeObservedTests(src, "identity.test.ts").map((t) => [...t.ancestors, t.name]),
    [
      ["identity"],
      ["identity", "c-generic-arrow: a generic arrow keeps its type parameter"],
      ["identity", "c-angle-assertion: an angle-bracket assertion reads its operand"],
      ["identity", "c-follows-both: a test after them keeps its describe"],
    ],
  );
});

test("readTestSurface: the `.each` exception is STRUCTURAL — a genuinely runtime title still reads unread", () => {
  // The fix drops the FACTORY, never a title. The outer call still owns the title, so an unreadable
  // one is on the record exactly as before — the readability fold is unchanged, only de-duplicated.
  const src = `it.each(table)(titleFromAVariable, (v) => { assert.ok(v); });`;
  const surface = readTestSurface(src, TS_FIXTURE);
  assert.deepEqual(surface.vouching, []);
  assert.equal(surface.unreadTitles, 1, "the OUTER call's unreadable title is still counted");
});

// ---------------------------------------------------------------------------
// The EXECUTABILITY separation: a GATED test is not an ABSENT one (ADR-0126's last deferred limit)
// ---------------------------------------------------------------------------

test("readTestSurface: a CONDITIONALLY skipped test is named apart — only one that would OTHERWISE vouch", () => {
  // ADR-0126's third fold folds `{ skip: <expr> }` toward "uncovered", because a static read cannot
  // know where the file loads. That fold is right and is NOT loosened here: what it lacked was the
  // separation the readability fold already has, so "no substantive test covers it" could mean either
  // "none exists" or "one exists and may not have run". `gatedNames` is that separation.
  const src = `
    test("c-gated: only against the live DB", { skip: !DB }, () => { assert.equal(row.branch, "b"); });
    test("c-certain: parked for now", { skip: true }, () => { assert.equal(x, 1); });
    test("c-hollow: gated AND hollow", { skip: !DB }, () => { assert.ok(true); });
    test("c-plain: ordinary", () => { assert.equal(y, 2); });
  `;
  const surface = readTestSurface(src, TS_FIXTURE);
  assert.deepEqual(surface.vouching, ["c-plain: ordinary"], "the fold is unchanged — a gated test still vouches for nothing");
  assert.deepEqual(
    surface.gatedNames,
    ["c-gated: only against the live DB"],
    "ONLY a test that would vouch but for its condition: a CERTAIN skip never runs (it is not waiting " +
      "on an environment), and a HOLLOW one would prove nothing even where its condition holds — " +
      "counting either as gated would claim a proof is being withheld when none exists",
  );
});

test("readTestSurface: gatedNames is EMPTY on an ordinary surface, so the qualifier raises no false alarm", () => {
  const surface = readTestSurface(`test("c-a: plain", () => { assert.equal(v, 1); });`, TS_FIXTURE);
  assert.deepEqual(surface.gatedNames, []);
  // `[]` is a measurement, not a silence: it says this surface was READ and nothing on it is gated,
  // which is the same three-state discipline `unreadTitles: 0` carries (ADR-0127).
  assert.deepEqual(surface.vouching, ["c-a: plain"]);
});

test("readTestSurface: a gated SUITE gates the tests beneath it (the skip is read from the enclosing call)", () => {
  // The real shape in the repo: one `describe(..., { skip: !DB })` over a file of live-DB tests. The
  // enclosing skip reaches every declaration under it, so the separation must too — otherwise the
  // commonest gated surface reports nothing gated.
  const src = `
    describe("c-live: the live-DB arm", { skip: !DB }, () => {
      it("clears the branch", () => { assert.equal(rows.length, 0); });
    });
  `;
  const surface = readTestSurface(src, TS_FIXTURE);
  assert.deepEqual(surface.vouching, []);
  assert.ok(surface.gatedNames.includes("c-live: the live-DB arm"), "the suite title is what carries the contract id");
});

test("readTitle: a concatenated title still obeys hollow-test detection (ADR-0126 is untouched)", () => {
  // Reading the title must not smuggle a hollow test past the vouching rule — the two axes compose.
  const hollow = `test("c-x: reads fine but " + "proves nothing", () => { assert(true); });`;
  assert.deepEqual(extractVouchingTestNames(hollow, TS_FIXTURE), []);
  const skipped = `test.skip("c-x: reads fine but " + "never runs", () => { assert.equal(a, b); });`;
  assert.deepEqual(extractVouchingTestNames(skipped, TS_FIXTURE), []);
});

test("RED→GREEN (PR #1172): a contract named ONLY by a concatenated title reads COVERED", () => {
  // The end-to-end regression: this is what stamped `coverage 0/6` onto a signed --real verdict
  // while all six tests existed, named their contracts verbatim, asserted substantively, and passed.
  const src = `
    test("osra-offer-set-is-stable: the offer set is stable " +
         "across repeated renders", () => { assert.deepEqual(first, second); });
  `;
  const report = classifyContractCoverage({
    unitId: "offer-set-render-agreement",
    contractIds: ["osra-offer-set-is-stable"],
    testNames: extractVouchingTestNames(src, TS_FIXTURE),
  });
  assert.deepEqual(report.uncovered, []);
  assert.deepEqual(report.covered, ["osra-offer-set-is-stable"]);
});

// ---------------------------------------------------------------------------
// classifyContractCoverage — the headline red→green
// ---------------------------------------------------------------------------

test("RED: a declared contract with no observed test is flagged UNCOVERED", () => {
  const report = classifyContractCoverage({
    unitId: "shared-forest-connection",
    contractIds: [
      "fr-ready-when-broker-accepts-builder",
      "fr-fails-closed-with-guidance-when-unbrokered",
      "fr-bounded-never-hangs",
      "fr-write-brokers-not-direct",
    ],
    // The leaf authored a test for only ONE contract — the documented drop (fr-bounded-never-hangs et al).
    testNames: ["fr-ready-when-broker-accepts-builder: a reachable broker reports ready"],
  });
  assert.deepEqual(report.covered, ["fr-ready-when-broker-accepts-builder"]);
  assert.deepEqual(report.uncovered, [
    "fr-fails-closed-with-guidance-when-unbrokered",
    "fr-bounded-never-hangs",
    "fr-write-brokers-not-direct",
  ]);
  // The dropped robustness contract is explicitly flagged not-covered.
  const bounded = report.contracts.find((c) => c.contractId === "fr-bounded-never-hangs");
  assert.equal(bounded?.covered, false);
  assert.deepEqual(bounded?.coveredBy, []);
});

test("GREEN: every declared contract named by a test classifies fully covered (none uncovered)", () => {
  // The real deploy-health-signal ↔ deploy-health.test.ts convention: three contracts, three named
  // suites (re-grounded here when declare-presence was retired by ADR-0200).
  const report = classifyContractCoverage({
    unitId: "deploy-health-signal",
    contractIds: [
      "deploy-health-red-run-classifies-loud",
      "deploy-health-green-run-classifies-quiet",
      "deploy-health-no-signal-classifies-unknown",
    ],
    testNames: [
      "deploy-health-red-run-classifies-loud: a failing newest run formats a loud WARN",
      "deploy-health-green-run-classifies-quiet: a green newest run formats one quiet line",
      "deploy-health-no-signal-classifies-unknown: no completed run reads UNVERIFIED",
      "an-extra-undeclared-suite: extra test names never confuse the classifier",
    ],
  });
  assert.deepEqual(report.uncovered, []);
  assert.equal(report.covered.length, 3);
  assert.ok(report.contracts.every((c) => c.covered));
  // The covering test name is surfaced (the honesty trail).
  assert.deepEqual(report.contracts[0]!.coveredBy, [
    "deploy-health-red-run-classifies-loud: a failing newest run formats a loud WARN",
  ]);
});

test("classifyContractCoverage: a contract named ONLY by a gated test reads GATED — separation, never credit", () => {
  // The live instance this closes (`claim-store-work-time`, measured 2026-09-16): the contract's only
  // tests carry `{ skip: !DB }`, so the report said "no substantive test covers it" — the same words it
  // uses for a contract nobody ever wrote a test for. Two different claims, one bucket.
  const report = classifyContractCoverage({
    unitId: "claim-store-work-time",
    contractIds: ["c-gated", "c-absent", "c-covered", "c-both"],
    testNames: ["c-covered: an offline test", "c-both: an offline test"],
    gatedTestNames: ["c-gated: the live-DB arm", "c-both: the live-DB arm"],
  });
  assert.deepEqual(report.covered, ["c-covered", "c-both"]);
  assert.deepEqual(
    report.uncovered,
    ["c-gated", "c-absent"],
    "a gated contract is STILL uncovered — a static read cannot tell a forced-environment gate from a " +
      "credential gate nothing forces, so the qualifier separates the claim and never credits it",
  );
  assert.deepEqual(
    report.gated,
    ["c-gated"],
    "`c-both` is covered by an offline test, so nothing about it is being withheld — a gated sibling " +
      "qualifies only a contract that is otherwise uncovered",
  );
  const gated = report.contracts.find((c) => c.contractId === "c-gated");
  assert.deepEqual(gated?.coveredBy, [], "the gated test is not a covering test");
  assert.deepEqual(gated?.gatedBy, ["c-gated: the live-DB arm"], "…but the report can NAME what is withheld");
});

test("classifyContractCoverage: `gated` is always a SUBSET of `uncovered`, so the qualifier can never widen a green", () => {
  // The property that keeps this additive. `ok` and every ceiling downstream key off `uncovered`; if a
  // gated contract could leave that list, this qualifier would silently become credit.
  const report = classifyContractCoverage({
    unitId: "u",
    contractIds: ["c-a", "c-b", "c-c"],
    testNames: ["c-a: covered"],
    gatedTestNames: ["c-a: also gated somewhere", "c-b: gated", "c-zz-undeclared: gated"],
  });
  assert.deepEqual(report.covered, ["c-a"]);
  assert.deepEqual(report.uncovered, ["c-b", "c-c"]);
  assert.deepEqual(report.gated, ["c-b"]);
  assert.ok(
    report.gated.every((id) => report.uncovered.includes(id)),
    "every gated id must also be uncovered",
  );
});

test("classifyContractCoverage: gatedTestNames is OPTIONAL — an existing caller reads exactly as before", () => {
  // `coverage-gate.ts`'s corpus sweep passes no gated names, and must keep its answer byte-for-byte:
  // the drain ceilings are calibrated on `uncovered`, and this change may not move them.
  const report = classifyContractCoverage({
    unitId: "u",
    contractIds: ["c-a", "c-b"],
    testNames: ["c-a: covered"],
  });
  assert.deepEqual(report.uncovered, ["c-b"]);
  assert.deepEqual(report.gated, [], "no gated input measured means nothing gated, never an unknown");
  assert.deepEqual(report.contracts[1]?.gatedBy, []);
});

test("classifyContractCoverage preserves declared order and collapses a duplicate id", () => {
  const report = classifyContractCoverage({
    unitId: "u",
    contractIds: ["c-b", "c-a", "c-b"], // out of order + a duplicate
    testNames: ["c-a: covered"],
  });
  assert.deepEqual(
    report.contracts.map((c) => c.contractId),
    ["c-b", "c-a"], // declared order, duplicate collapsed
  );
  assert.deepEqual(report.uncovered, ["c-b"]);
});

test("classifyContractCoverage: a unit with no declared contracts is vacuously covered", () => {
  const report = classifyContractCoverage({ unitId: "u", contractIds: [], testNames: ["x: y"] });
  assert.deepEqual(report.contracts, []);
  assert.deepEqual(report.covered, []);
  assert.deepEqual(report.uncovered, []);
});

test("classifyDeclaredCoverage maps parsed ContractDecls to their ids", () => {
  const report = classifyDeclaredCoverage(
    "u",
    [
      { id: "c-a", title: "A" },
      { id: "c-b", title: "B" },
    ],
    ["c-a: covered"],
  );
  assert.deepEqual(report.covered, ["c-a"]);
  assert.deepEqual(report.uncovered, ["c-b"]);
});
