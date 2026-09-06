import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FIX_WORDS,
  type CommitClass,
  type UnitCommit,
  classTally,
  classifyCommitMessage,
  ladder,
  orderForDisplay,
  renderReport,
  share,
  subjectWords,
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
  // The whole housekeeping family, spelled out with literal expectations rather than looped over
  // the table: a loop that reads its expected value FROM the map cannot see that map's value
  // being changed, so only literals pin these.
  assert.equal(classifyCommitMessage("style(ui): reflow the panel"), "housekeeping");
  assert.equal(classifyCommitMessage("build(pkg): pin the bundler"), "housekeeping");
  assert.equal(classifyCommitMessage("ci: add the mutation rung to the workflow"), "housekeeping");
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
  // TWO re-proofs against ONE ordinary commit, deliberately asymmetric: with one of each, a
  // partition that selected the WRONG side still reported a count of 1 and the test passed by
  // coincidence. Any fixture whose two halves are the same size cannot see an inverted predicate.
  const commits: readonly UnitCommit[] = [
    commit({ subject: "storytree real build real-abc: u1", unitId: "u1", testLinesAdded: 216 }),
    commit({ subject: "storytree real build real-def: u3", unitId: "u3", testLinesAdded: 8 }),
    commit({ subject: "fix(u2): repair it", unitId: "u2", testLinesAdded: 3 }),
  ];
  const l = ladder(commits, 3);
  assert.equal(l.reProofs.length, 2);
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
  // A NON-fix commit is included on purpose: with every fixture commit fix-shaped, dropping the
  // filter entirely produced the same number and the assertion proved nothing about filtering.
  const commits: readonly UnitCommit[] = [
    commit({ subject: "fix(a): touched source only", unitId: "u1", touchedTest: false, testLinesAdded: 0 }),
    commit({ subject: "fix(b): touched both, test grew", unitId: "u2", touchedTest: true, testLinesAdded: 7 }),
    commit({ subject: "refactor(c): plain noise", unitId: "u3", touchedTest: true, testLinesAdded: 4 }),
  ];
  const l = ladder(commits, 3);
  assert.equal(l.rungs[0]?.commits.length, 3);
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

test("a prefix-looking word MID-subject does not classify it — the regex is anchored", () => {
  // Unanchored, this reads `docs:` out of the middle and files a sentence as housekeeping.
  assert.equal(classifyCommitMessage("Update the docs: something happened"), "unclassified");
  assert.equal(classifyCommitMessage("Rewrite this feat(x): not a prefix"), "unclassified");
});

test("whitespace around the prefix is tolerated, and leading whitespace is trimmed", () => {
  assert.equal(classifyCommitMessage("feat : spaced before the colon"), "feature");
  assert.equal(classifyCommitMessage("   feat(x): indented subject"), "feature");
});

test("the subject tokeniser splits on runs of separators, emitting no empty words", () => {
  // Pinned directly because the alternative — asserting only the CLASS — cannot see the
  // difference: an extra empty string between two separators matches no repair word either way,
  // so the split's exact contract is invisible from the outside.
  assert.deepEqual(subjectWords("fix(a):  the  thing"), ["fix", "a", "the", "thing"]);
  assert.deepEqual(subjectWords("no-op change"), ["no-op", "change"]);
});

test("the ladder is always exactly four rungs, in the documented order", () => {
  const l = ladder([], 0);
  assert.equal(l.rungs.length, 4);
  assert.deepEqual(
    l.rungs.map((r) => r.key),
    ["touched-source", "co-changed-pair", "oracle-grew", "fix-shaped-or-unclassified"],
  );
});

test("the rendered report matches its committed golden, byte for byte", () => {
  // A CHARACTERISATION test over the whole document, not a spot-check. The report is ~40 prose
  // strings, every one of which is part of what this instrument delivers — a caveat silently
  // deleted from it is exactly the failure the increment warned about, and no `assert.match` on a
  // handful of phrases can see that. The expected text is FROZEN in
  // `verdict-contradiction.golden.md`: regenerate it deliberately when the wording changes,
  // reading the diff, rather than letting a re-run overwrite the thing being asserted.
  const golden = readFileSync(new URL("./verdict-contradiction.golden.md", import.meta.url), "utf8");
  const c = (over: Partial<UnitCommit> & { readonly subject: string }): UnitCommit =>
    commit({ unitId: "alpha", ...over });
  const l = ladder(
    [
      c({ sha: "1".repeat(40), subject: "fix(alpha): repair the thing", unitId: "alpha", testLinesAdded: 12 }),
      c({ sha: "2".repeat(40), subject: "feat(beta): add a thing", unitId: "beta", testLinesAdded: 3 }),
      c({ sha: "3".repeat(40), subject: "storytree real build real-x: alpha", unitId: "alpha" }),
    ],
    4,
  );
  const rendered = renderReport(l, {
    verdictsSeen: 665,
    verdictsWithBoundHash: 0,
    verdictsResolved: 178,
    unitsResolved: 108,
    unitsProofCommitMissing: 5,
    takenOn: "2026-09-06",
  });
  assert.equal(rendered.replace(/\r\n/gu, "\n").trimEnd(), golden.replace(/\r\n/gu, "\n").trimEnd());
});

test("a subject that merely MENTIONS a spine build is not a re-proof", () => {
  // The `^` anchor on RE_PROOF_SUBJECT. Unanchored, this ordinary repair would be filed as a spine
  // re-proof and dropped from the shortlist entirely — the worst direction for this instrument to
  // fail in, since re-proofs are the one class it discards.
  assert.equal(classifyCommitMessage("fix(gate): make storytree real build honest about its scope"), "fix-shaped");
  assert.equal(classifyCommitMessage("docs: explain how storytree real build signs a verdict"), "housekeeping");
});

test("every word in FIX_WORDS actually classifies a subject as fix-shaped", () => {
  // Data-driven over the exported list rather than a handful of spot-checks: a word silently
  // emptied or mistyped in the table is invisible to any test that names its own words, and the
  // table is the entire substance of the heuristic.
  assert.ok(FIX_WORDS.length > 20, "the table should be generous — over-reporting is the instruction");
  for (const word of FIX_WORDS) {
    assert.equal(classifyCommitMessage(`chore(x): something ${word} here`), "fix-shaped", `FIX_WORDS entry ${JSON.stringify(word)} does not classify`);
  }
});

test("a pipe in a commit subject is escaped so it cannot break the markdown table", () => {
  const md = renderReport(
    ladder([commit({ subject: "fix(a): handle a | b correctly", unitId: "u1" })], 1),
    INPUTS,
  );
  // A plain substring, NOT a regex. The first version of this assertion was
  // `assert.match(md, /… handle a \\| b correctly/u)`, in which the surviving `|` is an
  // ALTERNATION rather than an escaped pipe — so the pattern also matched on " b correctly" alone
  // and passed against the unescaped output too. It could not fail; the mutation rung is what
  // caught it.
  assert.ok(
    md.includes("| fix(a): handle a \\| b correctly |"),
    "a pipe must be escaped, or it silently splits the row into an extra column",
  );
});

test("the empty-shortlist sentence is emitted in full, not merely gestured at", () => {
  const md = renderReport(ladder([commit({ subject: "refactor(x): noise", unitId: "u1" })], 12), INPUTS);
  assert.ok(
    md.includes(
      "**Empty.** No later commit touched a proved unit's source AND its declared test file, added " +
        "lines to that test, and read as a repair. Over 12 units this is a measured absence, not an " +
        "unmeasured one.",
    ),
    "the empty-shortlist finding must read as a measured absence, in full",
  );
});
