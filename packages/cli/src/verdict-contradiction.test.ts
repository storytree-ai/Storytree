import assert from "node:assert/strict";
import test from "node:test";

import {
  type CommitClass,
  type UnitCommit,
  classTally,
  classifyCommitMessage,
  ladder,
  orderForDisplay,
  renderReport,
  share,
} from "./verdict-contradiction.js";

/** A commit in the shape the ladder consumes, with sane defaults so each test names only what it means. */
function commit(over: Partial<UnitCommit> & { readonly subject: string }): UnitCommit {
  return {
    sha: "0000000000000000000000000000000000000000",
    unitId: "some-unit",
    sourceFile: "packages/x/src/x.ts",
    testFile: "packages/x/src/x.test.ts",
    provedAt: "1111111111111111111111111111111111111111",
    touchedSource: true,
    touchedTest: true,
    testLinesAdded: 5,
    ...over,
  };
}

test("a spine re-proof commit is classified before anything else, even carrying a repair word", () => {
  // These land every time a unit is re-proved and touch the pair by construction. If they were
  // read as fixes they would dominate the shortlist outright.
  assert.equal(
    classifyCommitMessage("storytree real build real-mr6ycu73: act2-beat-director (authored by the gated leaf)"),
    "re-proof",
  );
  assert.equal(classifyCommitMessage("storytree node build foo: fix the broken thing"), "re-proof");
  assert.equal(classifyCommitMessage("  storytree story build bar: whatever  "), "re-proof");
});

test("`prefix` and `suffix` do not read as `fix` — the word-boundary rule", () => {
  // The single most likely false positive in a repo whose commits discuss prefixes constantly.
  assert.equal(classifyCommitMessage("refactor(cli): drop the redundant prefix from every id"), "refactor");
  assert.equal(classifyCommitMessage("feat(store): allow a suffix on the generated key"), "feature");
});

test("a `feat` commit that also repairs something is fix-shaped, not a feature", () => {
  // Repair words are consulted BEFORE the conventional prefix, because a fix very often lands
  // inside a feature commit and filing those away as features is the miss that matters.
  assert.equal(
    classifyCommitMessage("feat(presence): a build run never writes session presence — fix the --real clobber"),
    "fix-shaped",
  );
  assert.equal(classifyCommitMessage("feat(x): the stale row is no longer rendered"), "fix-shaped");
});

test("known conventional prefixes map to their classes, and an unknown one is unclassified", () => {
  assert.equal(classifyCommitMessage("refactor(drive): extract the build drivers"), "refactor");
  assert.equal(classifyCommitMessage("perf(map): memoise the projection"), "refactor");
  assert.equal(classifyCommitMessage("test(arc): kill the remaining lifecycle mutants"), "test-only");
  assert.equal(classifyCommitMessage("docs: restate the ceremony"), "housekeeping");
  assert.equal(classifyCommitMessage("chore(deps): bump the pinned runner"), "housekeeping");
  // `retire(...)` is a house prefix this module does not know. It must NOT become noise.
  assert.equal(classifyCommitMessage("retire(citations): remove the references field"), "unclassified");
  assert.equal(classifyCommitMessage("Make Codex worktree bootstrap gate-safe"), "unclassified");
});

test("the ladder's rungs are strictly nested, widest first", () => {
  const commits: readonly UnitCommit[] = [
    commit({ subject: "feat(a): something", unitId: "u1", touchedTest: false, testLinesAdded: 0 }),
    commit({ subject: "feat(b): something else", unitId: "u2", touchedTest: true, testLinesAdded: 0 }),
    commit({ subject: "feat(c): a third", unitId: "u3", touchedTest: true, testLinesAdded: 9 }),
    commit({ subject: "fix(d): repair the thing", unitId: "u4", touchedTest: true, testLinesAdded: 4 }),
  ];
  const l = ladder(commits, 4);
  const sizes = l.rungs.map((r) => r.commits.length);
  assert.deepEqual(sizes, [4, 3, 2, 1]);

  // Nesting is the property the report's funnel reading depends on: every rung's commits must
  // appear in the rung above it.
  for (let i = 1; i < l.rungs.length; i += 1) {
    const wider = new Set((l.rungs[i - 1]?.commits ?? []).map((c) => c.unitId + c.subject));
    for (const c of l.rungs[i]?.commits ?? []) {
      assert.ok(wider.has(c.unitId + c.subject), `rung ${i} escaped rung ${i - 1}: ${c.subject}`);
    }
  }
});

test("a commit touching only the test file is in no rung — the source is what the verdict certified", () => {
  const l = ladder([commit({ subject: "test(x): add a case", touchedSource: false })], 1);
  assert.deepEqual(
    l.rungs.map((r) => r.commits.length),
    [0, 0, 0, 0],
  );
});

test("re-proof commits are excluded from every rung and counted on their own", () => {
  const commits: readonly UnitCommit[] = [
    commit({ subject: "storytree real build real-abc: u1", unitId: "u1", testLinesAdded: 216 }),
    commit({ subject: "fix(u2): repair it", unitId: "u2", testLinesAdded: 3 }),
  ];
  const l = ladder(commits, 2);
  assert.equal(l.reProofs.length, 1);
  for (const r of l.rungs) {
    assert.ok(
      r.commits.every((c) => !c.subject.startsWith("storytree ")),
      `a re-proof reached rung ${r.key}`,
    );
  }
  assert.equal(l.rungs[l.rungs.length - 1]?.commits.length, 1);
});

test("an unclassified commit STAYS in the shortlist — the heuristic fails wide, never narrow", () => {
  // Dropping unknowns would produce a smaller, cleaner-looking number that nobody could audit,
  // and this repo carries a large minority of prefix-less commits.
  const l = ladder([commit({ subject: "Make Codex worktree bootstrap gate-safe", unitId: "u1" })], 1);
  const shortlist = l.rungs[l.rungs.length - 1]?.commits ?? [];
  assert.equal(shortlist.length, 1);
  assert.equal(classifyCommitMessage(shortlist[0]?.subject ?? ""), "unclassified");
});

test("plain noise does not reach the shortlist", () => {
  const l = ladder([commit({ subject: "refactor(x): narrow the seam", unitId: "u1" })], 1);
  assert.equal(l.rungs[0]?.commits.length, 1);
  assert.equal(l.rungs[l.rungs.length - 1]?.commits.length, 0);
});

test("a rung counts distinct UNITS, not commits — forty over three is a different claim", () => {
  const commits: readonly UnitCommit[] = [
    commit({ subject: "fix(a): one", unitId: "u1" }),
    commit({ subject: "fix(a): two", unitId: "u1" }),
    commit({ subject: "fix(b): three", unitId: "u2" }),
  ];
  const l = ladder(commits, 10);
  assert.equal(l.rungs[0]?.commits.length, 3);
  assert.equal(l.rungs[0]?.units, 2);
  assert.equal(l.rungs[0] ? share(l.rungs[0].units, l.unitsConsidered) : "", "20.0%");
});

test("the source-only reading is reported alongside, so the narrowing is shown rather than asserted", () => {
  const commits: readonly UnitCommit[] = [
    commit({ subject: "fix(a): touched source only", unitId: "u1", touchedTest: false, testLinesAdded: 0 }),
    commit({ subject: "fix(b): touched both, test grew", unitId: "u2", touchedTest: true, testLinesAdded: 7 }),
  ];
  const l = ladder(commits, 2);
  assert.equal(l.sourceOnlyFixShaped.length, 2);
  assert.equal(l.rungs[l.rungs.length - 1]?.commits.length, 1);
});

test("a zero denominator reports an absence, never 0.0%", () => {
  // "we measured and the answer is none" and "we could not measure" are different findings.
  assert.equal(share(0, 0), "n/a");
  assert.equal(share(0, 7), "0.0%");
  assert.equal(share(1, 4), "25.0%");
});

test("the class tally carries all seven keys, zeroes included", () => {
  const tally = classTally([commit({ subject: "fix(a): x" })]);
  const keys: readonly CommitClass[] = [
    "re-proof",
    "fix-shaped",
    "feature",
    "refactor",
    "test-only",
    "housekeeping",
    "unclassified",
  ];
  for (const k of keys) assert.equal(typeof tally[k], "number", `missing bucket ${k}`);
  assert.equal(tally["fix-shaped"], 1);
  assert.equal(tally.feature, 0);
});

test("display order is by test lines added, descending", () => {
  // Fixture emitted MIDDLE-OUT and never pre-sorted: under bun/JSC a comparator mutated to return
  // a constant REVERSES the array where V8 preserves it, so an already-ordered (or reverse-ordered)
  // input would let both mutants pass by coincidence. 20, 30, 10 is neither the answer nor its
  // reverse.
  const ordered = orderForDisplay([
    commit({ subject: "fix(b): mid", unitId: "b", testLinesAdded: 20 }),
    commit({ subject: "fix(a): most", unitId: "a", testLinesAdded: 30 }),
    commit({ subject: "fix(c): least", unitId: "c", testLinesAdded: 10 }),
  ]);
  assert.deepEqual(
    ordered.map((c) => c.testLinesAdded),
    [30, 20, 10],
  );
});

test("ties in test lines fall back to the unit id, so the report is stable across runs", () => {
  const ordered = orderForDisplay([
    commit({ subject: "fix: b", unitId: "beta", testLinesAdded: 5 }),
    commit({ subject: "fix: c", unitId: "gamma", testLinesAdded: 5 }),
    commit({ subject: "fix: a", unitId: "alpha", testLinesAdded: 5 }),
  ]);
  assert.deepEqual(
    ordered.map((c) => c.unitId),
    ["alpha", "beta", "gamma"],
  );
});

const INPUTS = {
  verdictsSeen: 665,
  verdictsWithBoundHash: 0,
  verdictsResolved: 178,
  unitsResolved: 108,
  unitsProofCommitMissing: 5,
  takenOn: "2026-09-06",
} as const;

test("the report carries its own smoke-test caveat, so a number cannot be quoted clean", () => {
  const md = renderReport(ladder([commit({ subject: "fix(a): x" })], 1), INPUTS);
  assert.match(md, /SMOKE TEST, not a precision figure/u);
  assert.match(md, /does not measure a false-pass RATE/u);
  assert.match(md, /OVER-report/u);
  assert.match(md, /adjudicates nothing/u);
});

test("the report states the boundHash zero as a finding rather than omitting it", () => {
  const md = renderReport(ladder([], 0), INPUTS);
  assert.match(md, /Finding 1/u);
  assert.match(md, /\*\*0 of 665\*\*/u);
  assert.match(md, /cannot be back-filled/u);
});

test("an empty shortlist reads as a MEASURED absence, not as a missing section", () => {
  const md = renderReport(ladder([commit({ subject: "refactor(x): noise" })], 12), INPUTS);
  assert.match(md, /\*\*Empty\.\*\*/u);
  assert.match(md, /measured absence, not an unmeasured one/u);
});

test("the report names how to re-take the reading over other work", () => {
  const md = renderReport(ladder([], 0), INPUTS);
  assert.match(md, /Re-running this over other work/u);
  assert.match(md, /renamed file reads as an absent/u);
});

test("a rung counts distinct COMMITS separately from rows — units share files", () => {
  // Three terminal units all declare the same studio component as their source file, so one commit
  // reaches all three. Reporting only the row count would overstate the number of things that
  // happened, in the one direction an over-reporting instrument can least afford to be misread.
  const shared = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const l = ladder(
    [
      commit({ sha: shared, subject: "fix(dock): repair the resize", unitId: "u1" }),
      commit({ sha: shared, subject: "fix(dock): repair the resize", unitId: "u2" }),
      commit({ sha: shared, subject: "fix(dock): repair the resize", unitId: "u3" }),
      commit({ sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", subject: "fix(x): another", unitId: "u1" }),
    ],
    3,
  );
  const widest = l.rungs[0];
  assert.equal(widest?.commits.length, 4);
  assert.equal(widest?.distinctCommits, 2);
  assert.equal(widest?.units, 3);
});

test("the report prints rows and distinct commits as separate columns, and says why", () => {
  const shared = "cccccccccccccccccccccccccccccccccccccccc";
  const md = renderReport(
    ladder(
      [
        commit({ sha: shared, subject: "fix(a): one repair", unitId: "u1" }),
        commit({ sha: shared, subject: "fix(a): one repair", unitId: "u2" }),
      ],
      2,
    ),
    INPUTS,
  );
  assert.match(md, /\| rung \| rows \| distinct commits \| units \|/u);
  assert.match(md, /is not a count of distinct events/u);
  // The widest rung: 2 rows, 1 distinct commit, 2 units.
  assert.match(md, /\| `touched-source` \| 2 \| 1 \| 2 \|/u);
});
