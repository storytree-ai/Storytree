import test from "node:test";
import assert from "node:assert/strict";

import {
  isSpawnUatTest,
  adjudicateMutants,
  entryPointsFromScripts,
  formatMutationVerdict,
  isTestFile,
  type MutationReport,
  type MutationTarget,
  parseUnifiedDiffRanges,
  type ProjectDir,
  runsUnderBun,
  selectMutationTargets,
  siblingTestFor,
  skipDisposition,
} from "./mutation-diff.js";

const PROJECTS: ProjectDir[] = [
  { name: "@storytree/cli", dir: "packages/cli" },
  { name: "@storytree/library", dir: "packages/library" },
  { name: "studio", dir: "apps/studio" },
];

// ── parseUnifiedDiffRanges ───────────────────────────────────────────────────

test("mutation-diff: a hunk with an explicit count yields that inclusive span", () => {
  const ranges = parseUnifiedDiffRanges(["+++ b/packages/cli/src/a.ts", "@@ -10,0 +12,3 @@"].join("\n"));
  assert.deepEqual(ranges, [{ file: "packages/cli/src/a.ts", ranges: [{ start: 12, end: 14 }] }]);
});

test("mutation-diff: a hunk header with no count means exactly one line", () => {
  const ranges = parseUnifiedDiffRanges(["+++ b/packages/cli/src/a.ts", "@@ -10 +12 @@"].join("\n"));
  assert.deepEqual(ranges, [{ file: "packages/cli/src/a.ts", ranges: [{ start: 12, end: 12 }] }]);
});

test("mutation-diff: a pure deletion (+n,0) contributes no range", () => {
  // There is no new-side line to mutate. Treating `+12,0` as a one-line span would put the line
  // BELOW the deletion in scope, which the branch did not touch.
  const ranges = parseUnifiedDiffRanges(["+++ b/packages/cli/src/a.ts", "@@ -10,4 +12,0 @@"].join("\n"));
  assert.deepEqual(ranges, []);
});

test("mutation-diff: a deleted file (/dev/null on the new side) contributes nothing", () => {
  const ranges = parseUnifiedDiffRanges(
    ["+++ /dev/null", "@@ -1,5 +0,0 @@", "+++ b/packages/cli/src/b.ts", "@@ -1 +1 @@"].join("\n"),
  );
  assert.deepEqual(ranges, [{ file: "packages/cli/src/b.ts", ranges: [{ start: 1, end: 1 }] }]);
});

test("mutation-diff: hunks before any +++ marker are ignored rather than mis-attributed", () => {
  const ranges = parseUnifiedDiffRanges(["@@ -1,2 +1,2 @@", "+++ b/packages/cli/src/a.ts", "@@ -5 +5 @@"].join("\n"));
  assert.deepEqual(ranges, [{ file: "packages/cli/src/a.ts", ranges: [{ start: 5, end: 5 }] }]);
});

test("mutation-diff: adjacent and overlapping spans are merged into one", () => {
  const ranges = parseUnifiedDiffRanges(
    ["+++ b/packages/cli/src/a.ts", "@@ -1 +10,3 @@", "@@ -1 +13,2 @@", "@@ -1 +11,1 @@"].join("\n"),
  );
  // 10-12 and 13-14 are adjacent (13 === 12 + 1) and 11-11 is inside 10-12 — one span, not three.
  assert.deepEqual(ranges, [{ file: "packages/cli/src/a.ts", ranges: [{ start: 10, end: 14 }] }]);
});

test("mutation-diff: spans separated by a gap stay separate", () => {
  const ranges = parseUnifiedDiffRanges(
    ["+++ b/packages/cli/src/a.ts", "@@ -1 +10,2 @@", "@@ -1 +20,1 @@"].join("\n"),
  );
  assert.deepEqual(ranges, [
    { file: "packages/cli/src/a.ts", ranges: [{ start: 10, end: 11 }, { start: 20, end: 20 }] },
  ]);
});

test("mutation-diff: several files are reported separately and sorted by path", () => {
  const ranges = parseUnifiedDiffRanges(
    ["+++ b/packages/cli/src/z.ts", "@@ -1 +1 @@", "+++ b/packages/cli/src/a.ts", "@@ -1 +2 @@"].join("\n"),
  );
  assert.deepEqual(ranges.map((r) => r.file), ["packages/cli/src/a.ts", "packages/cli/src/z.ts"]);
});

test("mutation-diff: CRLF line endings parse identically to LF", () => {
  const ranges = parseUnifiedDiffRanges(["+++ b/packages/cli/src/a.ts\r", "@@ -10,0 +12,3 @@\r"].join("\n"));
  assert.deepEqual(ranges, [{ file: "packages/cli/src/a.ts", ranges: [{ start: 12, end: 14 }] }]);
});

// ── isTestFile ───────────────────────────────────────────────────────────────

test("mutation-diff: test files are recognised, source files are not", () => {
  assert.equal(isTestFile("packages/cli/src/a.test.ts"), true);
  assert.equal(isTestFile("packages/cli/src/a.e2e.test.ts"), true);
  assert.equal(isTestFile("packages/cli/src/a.ts"), false);
  assert.equal(isTestFile("packages/cli/src/testing.ts"), false);
});

// ── selectMutationTargets ────────────────────────────────────────────────────

const existing = (...files: string[]): ReadonlySet<string> => new Set(files);

test("mutation-diff: a changed source file becomes one glob per span, scoped to its project", () => {
  const selection = selectMutationTargets({
    changed: [
      { file: "packages/cli/src/a.ts", ranges: [{ start: 4, end: 6 }, { start: 20, end: 20 }] },
    ],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/src/a.ts"),
  });
  assert.equal(selection.targets.length, 1);
  const target = selection.targets[0];
  assert.ok(target !== undefined);
  assert.equal(target.project, "@storytree/cli");
  assert.equal(target.dir, "packages/cli");
  assert.deepEqual(target.mutateGlobs, ["packages/cli/src/a.ts:20-20", "packages/cli/src/a.ts:4-6"]);
  assert.deepEqual(target.sourceFiles, ["packages/cli/src/a.ts"]);
  assert.equal(selection.skipReason, null);
});

test("mutation-diff: changed test files are collected, never mutated", () => {
  const selection = selectMutationTargets({
    changed: [
      { file: "packages/cli/src/a.ts", ranges: [{ start: 1, end: 1 }] },
      { file: "packages/cli/src/a.test.ts", ranges: [{ start: 1, end: 9 }] },
    ],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/src/a.ts", "packages/cli/src/a.test.ts"),
  });
  assert.deepEqual(selection.changedTestFiles, ["packages/cli/src/a.test.ts"]);
  assert.deepEqual(selection.targets[0]?.sourceFiles, ["packages/cli/src/a.ts"]);
});

test("mutation-diff: a file the branch DELETED is dropped, not handed to Stryker as a glob", () => {
  const selection = selectMutationTargets({
    changed: [{ file: "packages/cli/src/gone.ts", ranges: [{ start: 1, end: 3 }] }],
    projects: PROJECTS,
    existingFiles: existing(),
  });
  assert.equal(selection.targets.length, 0);
  assert.ok(selection.skipReason !== null);
});

test("mutation-diff: a .ts file outside any project's src/ is dropped and the reason says so", () => {
  const selection = selectMutationTargets({
    changed: [{ file: "packages/cli/scripts/tool.ts", ranges: [{ start: 1, end: 2 }] }],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/scripts/tool.ts"),
  });
  assert.equal(selection.targets.length, 0);
  assert.match(String(selection.skipReason), /outside any project's src\//);
  assert.match(String(selection.skipReason), /1 changed \.ts file/);
});

test("mutation-diff: declaration files and non-TypeScript files are never mutated", () => {
  const selection = selectMutationTargets({
    changed: [
      { file: "packages/cli/src/types.d.ts", ranges: [{ start: 1, end: 2 }] },
      { file: "packages/cli/src/data.json", ranges: [{ start: 1, end: 2 }] },
    ],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/src/types.d.ts", "packages/cli/src/data.json"),
  });
  assert.equal(selection.targets.length, 0);
});

test("mutation-diff: a file outside every workspace project is dropped", () => {
  const selection = selectMutationTargets({
    changed: [{ file: "scripts/root-tool.ts", ranges: [{ start: 1, end: 1 }] }],
    projects: PROJECTS,
    existingFiles: existing("scripts/root-tool.ts"),
  });
  assert.equal(selection.targets.length, 0);
});

test("mutation-diff: changes in two projects produce two targets, sorted by project name", () => {
  const selection = selectMutationTargets({
    changed: [
      { file: "packages/library/src/b.ts", ranges: [{ start: 1, end: 1 }] },
      { file: "packages/cli/src/a.ts", ranges: [{ start: 2, end: 2 }] },
    ],
    projects: PROJECTS,
    existingFiles: existing("packages/library/src/b.ts", "packages/cli/src/a.ts"),
  });
  assert.deepEqual(selection.targets.map((t) => t.project), ["@storytree/cli", "@storytree/library"]);
});

test("mutation-diff: backslash paths are normalised before ownership is decided", () => {
  const selection = selectMutationTargets({
    changed: [{ file: "packages\\cli\\src\\a.ts", ranges: [{ start: 1, end: 1 }] }],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/src/a.ts"),
  });
  assert.deepEqual(selection.targets[0]?.sourceFiles, ["packages/cli/src/a.ts"]);
});

// ── entryPointsFromScripts / the exemption ───────────────────────────────────

test("mutation-diff: a root script's -C dir is resolved, so the entry point is repo-relative", () => {
  const entries = entryPointsFromScripts({
    "check:thing": "pnpm -C packages/cli exec node --import ../../scripts/tsx-cache-off.mjs --import tsx src/check-thing.ts",
  });
  // Read as repo-relative, this would be `src/check-thing.ts` — a path that does not exist, so the
  // exemption would silently match nothing while appearing to work.
  assert.deepEqual(entries, ["packages/cli/src/check-thing.ts"]);
});

test("mutation-diff: a script with no -C keeps the path as written", () => {
  assert.deepEqual(entryPointsFromScripts({ x: "tsx scripts/tool.ts" }), ["scripts/tool.ts"]);
});

test("mutation-diff: non-.ts tokens and flags are not entry points", () => {
  const entries = entryPointsFromScripts({
    x: "node --import ../../scripts/tsx-cache-off.mjs --import tsx src/a.ts",
  });
  assert.deepEqual(entries, ["src/a.ts"]);
});

test("mutation-diff: several scripts naming the same file yield one entry", () => {
  const entries = entryPointsFromScripts({
    a: "pnpm -C packages/cli exec tsx src/x.ts",
    b: "pnpm -C packages/cli exec tsx src/x.ts",
  });
  assert.deepEqual(entries, ["packages/cli/src/x.ts"]);
});

test("mutation-diff: an exempt entry point is dropped from mutation and REPORTED", () => {
  const selection = selectMutationTargets({
    changed: [
      { file: "packages/cli/src/check-thing.ts", ranges: [{ start: 1, end: 40 }] },
      { file: "packages/cli/src/lib.ts", ranges: [{ start: 2, end: 3 }] },
    ],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/src/check-thing.ts", "packages/cli/src/lib.ts"),
    exemptFiles: new Set(["packages/cli/src/check-thing.ts"]),
  });
  assert.deepEqual(selection.exempted, ["packages/cli/src/check-thing.ts"]);
  assert.deepEqual(selection.targets[0]?.sourceFiles, ["packages/cli/src/lib.ts"]);
});

test("mutation-diff: when ONLY entry points changed, the skip reason names them", () => {
  const selection = selectMutationTargets({
    changed: [{ file: "packages/cli/src/check-thing.ts", ranges: [{ start: 1, end: 40 }] }],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/src/check-thing.ts"),
    exemptFiles: new Set(["packages/cli/src/check-thing.ts"]),
  });
  assert.equal(selection.targets.length, 0);
  assert.match(String(selection.skipReason), /executable entry points/);
  assert.match(String(selection.skipReason), /check-thing\.ts/);
});

test("mutation-diff: with no exemption set supplied, nothing is exempt", () => {
  const selection = selectMutationTargets({
    changed: [{ file: "packages/cli/src/check-thing.ts", ranges: [{ start: 1, end: 4 }] }],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/src/check-thing.ts"),
  });
  assert.deepEqual(selection.exempted, []);
  assert.equal(selection.targets.length, 1);
});

test("mutation-diff: the sibling test of a source file follows the repo convention", () => {
  assert.equal(siblingTestFor("packages/cli/src/a.ts"), "packages/cli/src/a.test.ts");
  assert.equal(siblingTestFor("packages\\cli\\src\\a.ts"), "packages/cli/src/a.test.ts");
});

// ── adjudicateMutants ────────────────────────────────────────────────────────

/** A report where one mutant in `a.ts` is killed by the tests named. */
function reportWith(args: {
  status: string;
  killedBy?: string[];
  testFiles?: Record<string, string[]>;
}): MutationReport {
  const testFiles: Record<string, { tests: { id: string; name: string }[] }> = {};
  for (const [file, ids] of Object.entries(args.testFiles ?? {})) {
    testFiles[file] = { tests: ids.map((id) => ({ id, name: `${file} > case ${id}` })) };
  }
  return {
    files: {
      "packages/cli/src/a.ts": {
        mutants: [
          {
            id: "m1",
            mutatorName: "ConditionalExpression",
            status: args.status,
            killedBy: args.killedBy ?? [],
            location: { start: { line: 12 } },
          },
        ],
      },
    },
    testFiles,
  };
}

test("mutation-diff: a mutant killed by THIS branch's changed test passes", () => {
  const verdict = adjudicateMutants(
    reportWith({ status: "Killed", killedBy: ["t1"], testFiles: { "packages/cli/src/a.test.ts": ["t1"] } }),
    ["packages/cli/src/a.test.ts"],
  );
  assert.equal(verdict.verdict, "pass");
  assert.equal(verdict.counted, 1);
  assert.equal(verdict.mutants[0]?.outcome, "proven");
  assert.deepEqual(verdict.reasons, []);
});

test("mutation-diff: a mutant killed ONLY by a test this branch did not touch fails", () => {
  const verdict = adjudicateMutants(
    reportWith({ status: "Killed", killedBy: ["t9"], testFiles: { "packages/cli/src/old.test.ts": ["t9"] } }),
    ["packages/cli/src/a.test.ts"],
  );
  assert.equal(verdict.verdict, "fail");
  assert.equal(verdict.mutants[0]?.outcome, "killed-by-others");
  assert.match(verdict.reasons.join("\n"), /killed only by tests this branch did not touch/);
});

test("mutation-diff: a mutant killed by BOTH a new and an old test passes on the new one", () => {
  const verdict = adjudicateMutants(
    reportWith({
      status: "Killed",
      killedBy: ["t9", "t1"],
      testFiles: { "packages/cli/src/old.test.ts": ["t9"], "packages/cli/src/a.test.ts": ["t1"] },
    }),
    ["packages/cli/src/a.test.ts"],
  );
  assert.equal(verdict.verdict, "pass");
  assert.equal(verdict.mutants[0]?.outcome, "proven");
});

test("mutation-diff: constraint 4 — a Killed mutant with an EMPTY killedBy is unproven, not a pass", () => {
  const verdict = adjudicateMutants(
    reportWith({ status: "Killed", killedBy: [], testFiles: { "packages/cli/src/a.test.ts": ["t1"] } }),
    ["packages/cli/src/a.test.ts"],
  );
  assert.equal(verdict.verdict, "fail");
  assert.equal(verdict.mutants[0]?.outcome, "unproven");
  assert.match(verdict.reasons.join("\n"), /UNPROVEN/);
});

test("mutation-diff: constraint 4 — a killedBy naming an id the report cannot resolve is unproven", () => {
  const verdict = adjudicateMutants(
    reportWith({ status: "Killed", killedBy: ["ghost"], testFiles: { "packages/cli/src/a.test.ts": ["t1"] } }),
    ["packages/cli/src/a.test.ts"],
  );
  assert.equal(verdict.mutants[0]?.outcome, "unproven");
  assert.equal(verdict.verdict, "fail");
});

test("mutation-diff: a survivor fails", () => {
  const verdict = adjudicateMutants(reportWith({ status: "Survived" }), ["packages/cli/src/a.test.ts"]);
  assert.equal(verdict.verdict, "fail");
  assert.equal(verdict.mutants[0]?.outcome, "survived");
  assert.match(verdict.reasons.join("\n"), /SURVIVED/);
});

test("mutation-diff: an uncovered mutant fails and is reported distinctly from a survivor", () => {
  const verdict = adjudicateMutants(reportWith({ status: "NoCoverage" }), ["packages/cli/src/a.test.ts"]);
  assert.equal(verdict.verdict, "fail");
  assert.equal(verdict.mutants[0]?.outcome, "no-coverage");
  assert.match(verdict.reasons.join("\n"), /NO COVERAGE/);
});

test("mutation-diff: a Timeout names no test, so it is unproven rather than credited", () => {
  const verdict = adjudicateMutants(reportWith({ status: "Timeout" }), ["packages/cli/src/a.test.ts"]);
  assert.equal(verdict.mutants[0]?.outcome, "unproven");
  assert.equal(verdict.verdict, "fail");
});

test("mutation-diff: a CompileError is excluded from the count, not scored either way", () => {
  const verdict = adjudicateMutants(reportWith({ status: "CompileError" }), ["packages/cli/src/a.test.ts"]);
  assert.equal(verdict.mutants[0]?.outcome, "excluded");
  assert.equal(verdict.counted, 0);
  // Every mutant excluded means nothing was actually proved — that is vacuous, never a pass.
  assert.equal(verdict.verdict, "vacuous");
});

test("mutation-diff: an empty report is vacuous, never a pass", () => {
  const verdict = adjudicateMutants({ files: {}, testFiles: {} }, ["packages/cli/src/a.test.ts"]);
  assert.equal(verdict.verdict, "vacuous");
  assert.equal(verdict.counted, 0);
  assert.match(verdict.reasons.join("\n"), /proved nothing/);
});

test("mutation-diff: a report missing files/testFiles entirely is vacuous rather than throwing", () => {
  const verdict = adjudicateMutants({}, []);
  assert.equal(verdict.verdict, "vacuous");
});

test("mutation-diff: the sandbox's absolute test path suffix-matches the repo-relative one", () => {
  // The sandbox segment (`.stryker-tmp/sandbox-8471`) changes every run; equality would never match.
  const verdict = adjudicateMutants(
    reportWith({
      status: "Killed",
      killedBy: ["t1"],
      testFiles: { "/repo/.stryker-tmp/sandbox-8471/packages/cli/src/a.test.ts": ["t1"] },
    }),
    ["packages/cli/src/a.test.ts"],
  );
  assert.equal(verdict.verdict, "pass");
  assert.equal(verdict.mutants[0]?.outcome, "proven");
});

test("mutation-diff: an AMBIGUOUS suffix credits nothing rather than guessing a file", () => {
  // Two sandbox paths both end in `a.test.ts`; crediting either would be a coin flip.
  const report: MutationReport = {
    files: {
      "packages/cli/src/a.ts": {
        mutants: [{ id: "m1", mutatorName: "M", status: "Killed", killedBy: ["t1"], location: { start: { line: 1 } } }],
      },
    },
    testFiles: {
      "/sandbox/packages/cli/src/a.test.ts": { tests: [{ id: "t1", name: "x" }] },
      "/sandbox/packages/other/src/a.test.ts": { tests: [{ id: "t2", name: "y" }] },
    },
  };
  const verdict = adjudicateMutants(report, ["a.test.ts"]);
  assert.equal(verdict.mutants[0]?.outcome, "killed-by-others");
  assert.equal(verdict.verdict, "fail");
});

test("mutation-diff: coveredBy is NOT consulted — constraint 1", () => {
  // A mutant that SURVIVED while a changed test merely covered it must still fail. If the rung ever
  // read `coveredBy`, this would flip to a pass and credit a test that discriminates nothing.
  const report: MutationReport = {
    files: {
      "packages/cli/src/a.ts": {
        mutants: [
          {
            id: "m1",
            mutatorName: "M",
            status: "Survived",
            killedBy: [],
            location: { start: { line: 3 } },
          },
        ],
      },
    },
    testFiles: { "packages/cli/src/a.test.ts": { tests: [{ id: "t1", name: "covers it" }] } },
  };
  const verdict = adjudicateMutants(report, ["packages/cli/src/a.test.ts"]);
  assert.equal(verdict.verdict, "fail");
  assert.equal(verdict.mutants[0]?.outcome, "survived");
});

test("mutation-diff: mixed outcomes count every failing class in the reasons", () => {
  const report: MutationReport = {
    files: {
      "packages/cli/src/a.ts": {
        mutants: [
          { id: "1", status: "Killed", killedBy: ["t1"], location: { start: { line: 1 } } },
          { id: "2", status: "Survived", killedBy: [], location: { start: { line: 2 } } },
          { id: "3", status: "Killed", killedBy: [], location: { start: { line: 3 } } },
          { id: "4", status: "NoCoverage", killedBy: [], location: { start: { line: 4 } } },
          { id: "5", status: "CompileError", killedBy: [], location: { start: { line: 5 } } },
        ],
      },
    },
    testFiles: { "packages/cli/src/a.test.ts": { tests: [{ id: "t1", name: "n" }] } },
  };
  const verdict = adjudicateMutants(report, ["packages/cli/src/a.test.ts"]);
  assert.equal(verdict.verdict, "fail");
  assert.equal(verdict.counted, 4);
  assert.equal(verdict.reasons.length, 3);
});

// ── formatMutationVerdict ────────────────────────────────────────────────────

const TARGET: MutationTarget = {
  project: "@storytree/cli",
  dir: "packages/cli",
  mutateGlobs: ["packages/cli/src/a.ts:1-3"],
  sourceFiles: ["packages/cli/src/a.ts"],
};

test("mutation-diff: a pass renders the counts and says what was proved", () => {
  const verdict = adjudicateMutants(
    reportWith({ status: "Killed", killedBy: ["t1"], testFiles: { "packages/cli/src/a.test.ts": ["t1"] } }),
    ["packages/cli/src/a.test.ts"],
  );
  const body = formatMutationVerdict("[mutation]", verdict, [TARGET]);
  assert.match(body, /1 changed source file\(s\), 1 changed line span\(s\), 1 mutant\(s\) counted/);
  assert.match(body, /PASS/);
});

test("mutation-diff: a failure names the offending mutant with its file, line and mutator", () => {
  const verdict = adjudicateMutants(reportWith({ status: "Survived" }), []);
  const body = formatMutationVerdict("[mutation]", verdict, [TARGET]);
  assert.match(body, /SURVIVED packages\/cli\/src\/a\.ts:12 \[ConditionalExpression\]/);
  assert.match(body, /no test named/);
  assert.doesNotMatch(body, /PASS/);
});

test("mutation-diff: a failure caps the listing at 25 and says how many more there are", () => {
  const mutants = Array.from({ length: 31 }, (_, i) => ({
    id: String(i),
    mutatorName: "M",
    status: "Survived",
    killedBy: [] as string[],
    location: { start: { line: i + 1 } },
  }));
  const verdict = adjudicateMutants({ files: { "a.ts": { mutants } }, testFiles: {} }, []);
  const body = formatMutationVerdict("[mutation]", verdict, [TARGET]);
  assert.equal(verdict.counted, 31);
  // 31 failing, 25 listed, so exactly 6 remain — an off-by-one here misreports the backlog.
  assert.match(body, /… and 6 more/);
  // Count the per-mutant LISTING lines only — the summary line names SURVIVED too.
  const listed = body.split("\n").filter((l) => l.startsWith("[mutation]   SURVIVED"));
  assert.equal(listed.length, 25);
});

test("mutation-diff: a failing mutant that WAS credited names the crediting file, not 'no test named'", () => {
  const verdict = adjudicateMutants(
    reportWith({ status: "Killed", killedBy: ["t9"], testFiles: { "packages/cli/src/old.test.ts": ["t9"] } }),
    ["packages/cli/src/a.test.ts"],
  );
  const body = formatMutationVerdict("[mutation]", verdict, [TARGET]);
  assert.match(body, /killed by packages\/cli\/src\/old\.test\.ts/);
  assert.doesNotMatch(body, /no test named/);
});

test("mutation-diff: a mutant with no location renders the file alone, not 'file:null'", () => {
  const verdict = adjudicateMutants(
    { files: { "packages/cli/src/a.ts": { mutants: [{ id: "1", status: "Survived" }] } }, testFiles: {} },
    [],
  );
  assert.equal(verdict.mutants[0]?.line, null);
  const body = formatMutationVerdict("[mutation]", verdict, [TARGET]);
  assert.match(body, /SURVIVED packages\/cli\/src\/a\.ts \[unknown\]/);
  assert.doesNotMatch(body, /null/);
});

test("mutation-diff: a Killed mutant with killedBy ABSENT (not just empty) is unproven", () => {
  const verdict = adjudicateMutants(
    { files: { "a.ts": { mutants: [{ id: "1", status: "Killed" }] } }, testFiles: {} },
    [],
  );
  assert.equal(verdict.mutants[0]?.outcome, "unproven");
});

// ── the edges the first mutation run found unproven ──────────────────────────

test("mutation-diff: a .test.tsx file is a test file too", () => {
  // The `||` in isTestFile: without this case, dropping the second branch changes nothing.
  assert.equal(isTestFile("packages/cli/src/a.test.tsx"), true);
  assert.equal(isTestFile("packages/cli/src/a.tsx"), false);
});

test("mutation-diff: a diff path is normalised — leading ./ stripped and trailing space trimmed", () => {
  const ranges = parseUnifiedDiffRanges(["+++ b/./packages/cli/src/a.ts  ", "@@ -1 +3,2 @@"].join("\n"));
  assert.deepEqual(ranges, [{ file: "packages/cli/src/a.ts", ranges: [{ start: 3, end: 4 }] }]);
});

test("mutation-diff: a +++ path without the b/ prefix is still read", () => {
  const ranges = parseUnifiedDiffRanges(["+++ packages/cli/src/a.ts", "@@ -1 +5 @@"].join("\n"));
  assert.deepEqual(ranges, [{ file: "packages/cli/src/a.ts", ranges: [{ start: 5, end: 5 }] }]);
});

test("mutation-diff: only the LEADING b/ is stripped, never one deeper in the path", () => {
  const ranges = parseUnifiedDiffRanges(["+++ b/b/c.ts", "@@ -1 +1 @@"].join("\n"));
  assert.deepEqual(ranges, [{ file: "b/c.ts", ranges: [{ start: 1, end: 1 }] }]);
});

test("mutation-diff: a malformed hunk header is skipped rather than parsed as line NaN", () => {
  const ranges = parseUnifiedDiffRanges(
    ["+++ b/a.ts", "@@ this is not a hunk @@", "@@ -1 +7 @@"].join("\n"),
  );
  assert.deepEqual(ranges, [{ file: "a.ts", ranges: [{ start: 7, end: 7 }] }]);
});

test("mutation-diff: merging tie-breaks equal starts by end, so the widest span wins", () => {
  const ranges = parseUnifiedDiffRanges(
    ["+++ b/a.ts", "@@ -1 +10,1 @@", "@@ -1 +10,5 @@"].join("\n"),
  );
  assert.deepEqual(ranges, [{ file: "a.ts", ranges: [{ start: 10, end: 14 }] }]);
});

test("mutation-diff: the LONGER project dir wins when one dir prefixes another", () => {
  // `packages/library` and `packages/library-store` both look plausible for a file under the latter.
  const nested: ProjectDir[] = [
    { name: "@storytree/library", dir: "packages/library" },
    { name: "@storytree/library-store", dir: "packages/library-store" },
  ];
  const selection = selectMutationTargets({
    changed: [{ file: "packages/library-store/src/a.ts", ranges: [{ start: 1, end: 1 }] }],
    projects: nested,
    existingFiles: existing("packages/library-store/src/a.ts"),
  });
  assert.equal(selection.targets[0]?.project, "@storytree/library-store");
});

test("mutation-diff: the skip reason reports BOTH drop causes when both occurred", () => {
  const selection = selectMutationTargets({
    changed: [
      { file: "packages/cli/scripts/tool.ts", ranges: [{ start: 1, end: 1 }] },
      { file: "packages/cli/src/entry.ts", ranges: [{ start: 1, end: 1 }] },
    ],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/scripts/tool.ts", "packages/cli/src/entry.ts"),
    exemptFiles: new Set(["packages/cli/src/entry.ts"]),
  });
  const reason = String(selection.skipReason);
  assert.match(reason, /outside any project's src\//);
  assert.match(reason, /executable entry points/);
  assert.match(reason, /;/);
});

test("mutation-diff: resolving an entry point collapses .. segments", () => {
  assert.deepEqual(entryPointsFromScripts({ x: "pnpm -C packages/cli exec tsx ../drive/src/a.ts" }), [
    "packages/drive/src/a.ts",
  ]);
});

test("mutation-diff: a -C flag with no following token does not crash or invent a base", () => {
  assert.deepEqual(entryPointsFromScripts({ x: "pnpm -C" }), []);
});

test("mutation-diff: entry points are returned sorted and de-duplicated across scripts", () => {
  const entries = entryPointsFromScripts({
    b: "tsx z.ts",
    a: "tsx a.ts",
    c: "tsx a.ts",
  });
  assert.deepEqual(entries, ["a.ts", "z.ts"]);
});

test("mutation-diff: an empty script set yields no entry points", () => {
  assert.deepEqual(entryPointsFromScripts({}), []);
});

test("mutation-diff: globs are emitted sorted, so the config is stable run to run", () => {
  const selection = selectMutationTargets({
    changed: [
      { file: "packages/cli/src/b.ts", ranges: [{ start: 1, end: 1 }] },
      { file: "packages/cli/src/a.ts", ranges: [{ start: 9, end: 9 }] },
    ],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/src/b.ts", "packages/cli/src/a.ts"),
  });
  assert.deepEqual(selection.targets[0]?.mutateGlobs, [
    "packages/cli/src/a.ts:9-9",
    "packages/cli/src/b.ts:1-1",
  ]);
  assert.deepEqual(selection.targets[0]?.sourceFiles, ["packages/cli/src/a.ts", "packages/cli/src/b.ts"]);
});

test("mutation-diff: one file changed twice contributes its name once", () => {
  const selection = selectMutationTargets({
    changed: [
      { file: "packages/cli/src/a.ts", ranges: [{ start: 1, end: 1 }] },
      { file: "packages/cli/src/a.ts", ranges: [{ start: 9, end: 9 }] },
    ],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/src/a.ts"),
  });
  assert.deepEqual(selection.targets[0]?.sourceFiles, ["packages/cli/src/a.ts"]);
  assert.equal(selection.targets[0]?.mutateGlobs.length, 2);
});

test("mutation-diff: changed test files are sorted", () => {
  const selection = selectMutationTargets({
    changed: [
      { file: "packages/cli/src/z.test.ts", ranges: [{ start: 1, end: 1 }] },
      { file: "packages/cli/src/a.test.ts", ranges: [{ start: 1, end: 1 }] },
      { file: "packages/cli/src/s.ts", ranges: [{ start: 1, end: 1 }] },
    ],
    projects: PROJECTS,
    existingFiles: existing(
      "packages/cli/src/z.test.ts",
      "packages/cli/src/a.test.ts",
      "packages/cli/src/s.ts",
    ),
  });
  assert.deepEqual(selection.changedTestFiles, [
    "packages/cli/src/a.test.ts",
    "packages/cli/src/z.test.ts",
  ]);
});

test("mutation-diff: a test id with a non-string id is ignored rather than indexed as undefined", () => {
  const report: MutationReport = {
    files: {
      "a.ts": { mutants: [{ id: "1", status: "Killed", killedBy: ["t1"], location: { start: { line: 1 } } }] },
    },
    testFiles: { "packages/cli/src/a.test.ts": { tests: [{ name: "no id here" }] } },
  };
  const verdict = adjudicateMutants(report, ["packages/cli/src/a.test.ts"]);
  assert.equal(verdict.mutants[0]?.outcome, "unproven");
});

test("mutation-diff: a mutant file entry with no mutants array contributes nothing", () => {
  const verdict = adjudicateMutants({ files: { "a.ts": {} }, testFiles: {} }, []);
  assert.equal(verdict.verdict, "vacuous");
  assert.equal(verdict.mutants.length, 0);
});

// ── exact wording, so a mutated string literal cannot pass a loose regex ──────

test("mutation-diff: the summary counts line reads exactly as specified", () => {
  const verdict = adjudicateMutants(
    reportWith({ status: "Killed", killedBy: ["t1"], testFiles: { "packages/cli/src/a.test.ts": ["t1"] } }),
    ["packages/cli/src/a.test.ts"],
  );
  const lines = formatMutationVerdict("[mutation]", verdict, [TARGET]).split("\n");
  assert.equal(lines[0], "[mutation] 1 changed source file(s), 1 changed line span(s), 1 mutant(s) counted");
  assert.equal(
    lines[1],
    "[mutation] PASS — every mutant in this branch's changed lines was killed by this branch's own tests",
  );
  assert.equal(lines.length, 2);
});

test("mutation-diff: an uncredited failing line reads exactly as specified", () => {
  const verdict = adjudicateMutants(reportWith({ status: "Survived" }), []);
  const lines = formatMutationVerdict("[mutation]", verdict, [TARGET]).split("\n");
  assert.ok(
    lines.includes(
      "[mutation]   SURVIVED packages/cli/src/a.ts:12 [ConditionalExpression] — no test named",
    ),
    lines.join("\n"),
  );
  assert.ok(
    lines.includes(
      "[mutation] The rung asks only about the lines THIS branch changed. Strengthen this branch's own tests until each",
    ),
  );
  assert.ok(
    lines.includes(
      "[mutation] mutant above is caught, or record why the mutant is equivalent and cannot be killed.",
    ),
  );
});

test("mutation-diff: a credited failing line names the file exactly", () => {
  const verdict = adjudicateMutants(
    reportWith({ status: "Killed", killedBy: ["t9"], testFiles: { "packages/cli/src/old.test.ts": ["t9"] } }),
    ["packages/cli/src/a.test.ts"],
  );
  const lines = formatMutationVerdict("[mutation]", verdict, [TARGET]).split("\n");
  assert.ok(
    lines.includes(
      "[mutation]   KILLED-BY-OTHERS packages/cli/src/a.ts:12 [ConditionalExpression] — killed by packages/cli/src/old.test.ts",
    ),
    lines.join("\n"),
  );
});

test("mutation-diff: each failing-class summary line reads exactly as specified", () => {
  const report: MutationReport = {
    files: {
      "a.ts": {
        mutants: [
          { id: "1", status: "Survived", location: { start: { line: 1 } } },
          { id: "2", status: "NoCoverage", location: { start: { line: 2 } } },
          { id: "3", status: "Killed", killedBy: [], location: { start: { line: 3 } } },
          { id: "4", status: "Killed", killedBy: ["t9"], location: { start: { line: 4 } } },
        ],
      },
    },
    testFiles: { "old.test.ts": { tests: [{ id: "t9", name: "n" }] } },
  };
  const verdict = adjudicateMutants(report, ["a.test.ts"]);
  assert.deepEqual(verdict.reasons, [
    "1 mutant(s) SURVIVED — no test noticed the change",
    "1 mutant(s) had NO COVERAGE — no test reaches this line",
    "1 mutant(s) were killed only by tests this branch did not touch — the branch's own tests do not discriminate them",
    "1 mutant(s) are UNPROVEN — killed, but the report named no test (constraint 4: never a pass, never a survivor)",
  ]);
});

test("mutation-diff: the vacuous reason reads exactly as specified", () => {
  const verdict = adjudicateMutants({}, []);
  assert.deepEqual(verdict.reasons, [
    "source was selected for mutation but the report counted no mutants — the run proved nothing, which is not a pass",
  ]);
});

// ── exact skip reasons, one per drop cause ───────────────────────────────────

const SKIP_HEAD = "this branch changes no mutable source under a workspace project's src/";

test("mutation-diff: with no drop cause the skip reason is the bare sentence", () => {
  const selection = selectMutationTargets({
    changed: [{ file: "packages/cli/src/gone.ts", ranges: [{ start: 1, end: 1 }] }],
    projects: PROJECTS,
    existingFiles: existing(),
  });
  assert.equal(selection.skipReason, SKIP_HEAD);
});

test("mutation-diff: the outside-src cause appends exactly one clause", () => {
  const selection = selectMutationTargets({
    changed: [{ file: "packages/cli/scripts/t.ts", ranges: [{ start: 1, end: 1 }] }],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/scripts/t.ts"),
  });
  assert.equal(
    selection.skipReason,
    `${SKIP_HEAD} — 1 changed .ts file(s) sit outside any project's src/`,
  );
});

test("mutation-diff: the entry-point cause appends exactly one clause naming the file", () => {
  const selection = selectMutationTargets({
    changed: [{ file: "packages/cli/src/e.ts", ranges: [{ start: 1, end: 1 }] }],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/src/e.ts"),
    exemptFiles: new Set(["packages/cli/src/e.ts"]),
  });
  assert.equal(
    selection.skipReason,
    `${SKIP_HEAD} — 1 are executable entry points (packages/cli/src/e.ts)`,
  );
});

test("mutation-diff: two exempt files are listed sorted and comma-joined", () => {
  const selection = selectMutationTargets({
    changed: [
      { file: "packages/cli/src/z.ts", ranges: [{ start: 1, end: 1 }] },
      { file: "packages/cli/src/a.ts", ranges: [{ start: 1, end: 1 }] },
    ],
    projects: PROJECTS,
    existingFiles: existing("packages/cli/src/z.ts", "packages/cli/src/a.ts"),
    exemptFiles: new Set(["packages/cli/src/z.ts", "packages/cli/src/a.ts"]),
  });
  assert.deepEqual(selection.exempted, ["packages/cli/src/a.ts", "packages/cli/src/z.ts"]);
  assert.equal(
    selection.skipReason,
    `${SKIP_HEAD} — 2 are executable entry points (packages/cli/src/a.ts, packages/cli/src/z.ts)`,
  );
});

// ── path resolution and tokenising edges ─────────────────────────────────────

test("mutation-diff: empty and '.' segments collapse when resolving an entry point", () => {
  assert.deepEqual(entryPointsFromScripts({ x: "pnpm -C packages//cli exec tsx ./src/./a.ts" }), [
    "packages/cli/src/a.ts",
  ]);
});

test("mutation-diff: '..' past the base does not escape into an empty prefix", () => {
  assert.deepEqual(entryPointsFromScripts({ x: "pnpm -C a exec tsx ../../b.ts" }), ["b.ts"]);
});

test("mutation-diff: runs of whitespace between tokens are collapsed, not treated as tokens", () => {
  assert.deepEqual(entryPointsFromScripts({ x: "  pnpm   -C   packages/cli   exec  tsx   src/a.ts  " }), [
    "packages/cli/src/a.ts",
  ]);
});

test("mutation-diff: a flag ending in .ts is not mistaken for an entry point", () => {
  assert.deepEqual(entryPointsFromScripts({ x: "tsx --thing=a.ts src/b.ts" }), ["src/b.ts"]);
});

test("mutation-diff: the sibling test path is built exactly, replacing only the final .ts", () => {
  assert.equal(siblingTestFor("packages/cli/src/a.ts.ts"), "packages/cli/src/a.ts.test.ts");
});

test("mutation-diff: a +++ line with extra spacing still yields the bare path", () => {
  const ranges = parseUnifiedDiffRanges(["+++    b/a.ts   ", "@@ -1 +2 @@"].join("\n"));
  assert.deepEqual(ranges, [{ file: "a.ts", ranges: [{ start: 2, end: 2 }] }]);
});

test("mutation-diff: a line that merely contains @@ but does not start with it is not a hunk", () => {
  const ranges = parseUnifiedDiffRanges(
    ["+++ b/a.ts", " code with @@ -1 +99,9 @@ inside it", "@@ -1 +4 @@"].join("\n"),
  );
  assert.deepEqual(ranges, [{ file: "a.ts", ranges: [{ start: 4, end: 4 }] }]);
});

test("mutation-diff: a hunk header missing the +side is skipped", () => {
  const ranges = parseUnifiedDiffRanges(["+++ b/a.ts", "@@ -1,2 @@", "@@ -1 +6 @@"].join("\n"));
  assert.deepEqual(ranges, [{ file: "a.ts", ranges: [{ start: 6, end: 6 }] }]);
});

// ── ordering, which only an unsorted input with a tie can pin down ────────────

test("mutation-diff: out-of-order hunks with an equal start still merge correctly", () => {
  // Requires BOTH halves of the comparator: the primary start sort to bring 10,* together, and the
  // secondary end sort so the wider span is not swallowed by the narrower one.
  const ranges = parseUnifiedDiffRanges(
    ["+++ b/a.ts", "@@ -1 +20,1 @@", "@@ -1 +10,6 @@", "@@ -1 +10,3 @@"].join("\n"),
  );
  assert.deepEqual(ranges, [
    { file: "a.ts", ranges: [{ start: 10, end: 15 }, { start: 20, end: 20 }] },
  ]);
});

test("mutation-diff: three files come back in path order, not input order", () => {
  const ranges = parseUnifiedDiffRanges(
    [
      "+++ b/m.ts", "@@ -1 +1 @@",
      "+++ b/z.ts", "@@ -1 +1 @@",
      "+++ b/a.ts", "@@ -1 +1 @@",
    ].join("\n"),
  );
  assert.deepEqual(ranges.map((r) => r.file), ["a.ts", "m.ts", "z.ts"]);
});

test("mutation-diff: three projects come back in project-name order, not input order", () => {
  const many: ProjectDir[] = [
    { name: "@storytree/m", dir: "packages/m" },
    { name: "@storytree/z", dir: "packages/z" },
    { name: "@storytree/a", dir: "packages/a" },
  ];
  const selection = selectMutationTargets({
    changed: [
      { file: "packages/m/src/x.ts", ranges: [{ start: 1, end: 1 }] },
      { file: "packages/z/src/x.ts", ranges: [{ start: 1, end: 1 }] },
      { file: "packages/a/src/x.ts", ranges: [{ start: 1, end: 1 }] },
    ],
    projects: many,
    existingFiles: existing("packages/m/src/x.ts", "packages/z/src/x.ts", "packages/a/src/x.ts"),
  });
  assert.deepEqual(selection.targets.map((t) => t.project), [
    "@storytree/a",
    "@storytree/m",
    "@storytree/z",
  ]);
});

test("mutation-diff: two crediting test files are reported in sorted order", () => {
  const verdict = adjudicateMutants(
    reportWith({
      status: "Killed",
      killedBy: ["t2", "t1"],
      testFiles: { "z.test.ts": ["t2"], "a.test.ts": ["t1"] },
    }),
    ["a.test.ts", "z.test.ts"],
  );
  assert.deepEqual(verdict.mutants[0]?.killedByFiles, ["a.test.ts", "z.test.ts"]);
});

// ── the listing cap boundary ─────────────────────────────────────────────────

function survivors(n: number): MutationReport {
  return {
    files: {
      "a.ts": {
        mutants: Array.from({ length: n }, (_, i) => ({
          id: String(i),
          mutatorName: "M",
          status: "Survived",
          location: { start: { line: i + 1 } },
        })),
      },
    },
    testFiles: {},
  };
}

test("mutation-diff: exactly 25 failing mutants are all listed with no 'and more' line", () => {
  const body = formatMutationVerdict("[m]", adjudicateMutants(survivors(25), []), [TARGET]);
  assert.equal(body.split("\n").filter((l) => l.startsWith("[m]   SURVIVED")).length, 25);
  assert.doesNotMatch(body, /and \d+ more/);
});

test("mutation-diff: 26 failing mutants list 25 and report exactly one more", () => {
  const body = formatMutationVerdict("[m]", adjudicateMutants(survivors(26), []), [TARGET]);
  assert.equal(body.split("\n").filter((l) => l.startsWith("[m]   SURVIVED")).length, 25);
  assert.match(body, /… and 1 more/);
});

test("mutation-diff: neither proven nor excluded mutants appear in the failure listing", () => {
  const report: MutationReport = {
    files: {
      "a.ts": {
        mutants: [
          { id: "p", mutatorName: "PROVEN", status: "Killed", killedBy: ["t1"], location: { start: { line: 1 } } },
          { id: "x", mutatorName: "EXCLUDED", status: "CompileError", location: { start: { line: 2 } } },
          { id: "s", mutatorName: "FAILING", status: "Survived", location: { start: { line: 3 } } },
        ],
      },
    },
    testFiles: { "a.test.ts": { tests: [{ id: "t1", name: "n" }] } },
  };
  const verdict = adjudicateMutants(report, ["a.test.ts"]);
  assert.equal(verdict.counted, 2);
  const body = formatMutationVerdict("[m]", verdict, [TARGET]);
  assert.match(body, /\[FAILING\]/);
  assert.doesNotMatch(body, /\[PROVEN\]/);
  assert.doesNotMatch(body, /\[EXCLUDED\]/);
});

test("mutation-diff: a mutant with no status at all is carried as Unknown and excluded", () => {
  const verdict = adjudicateMutants(
    { files: { "a.ts": { mutants: [{ id: "1", location: { start: { line: 1 } } }] } }, testFiles: {} },
    [],
  );
  assert.equal(verdict.mutants[0]?.status, "Unknown");
  assert.equal(verdict.mutants[0]?.outcome, "excluded");
});

test("mutation-diff: a non-string test id is not indexed, so it credits nothing", () => {
  // A real report is JSON off disk, so a numeric id arrives by PARSING rather than by asserting a
  // literal into the wrong type — which is also what the house rule against assertion chains wants.
  const report = JSON.parse(
    JSON.stringify({
      files: {
        "a.ts": { mutants: [{ id: "1", status: "Killed", killedBy: ["7"], location: { start: { line: 1 } } }] },
      },
      testFiles: { "a.test.ts": { tests: [{ id: 7, name: "numeric id" }] } },
    }),
  ) as MutationReport;
  const verdict = adjudicateMutants(report, ["a.test.ts"]);
  assert.equal(verdict.mutants[0]?.outcome, "unproven");
});

test("mutation-diff: a huge line number that overflows to Infinity is skipped, not recorded", () => {
  const huge = "9".repeat(400);
  const ranges = parseUnifiedDiffRanges(["+++ b/a.ts", `@@ -1 +${huge},2 @@`, "@@ -1 +3 @@"].join("\n"));
  assert.deepEqual(ranges, [{ file: "a.ts", ranges: [{ start: 3, end: 3 }] }]);
});

// ── the last edges the mutation run left standing ────────────────────────────

test("mutation-diff: a -C at token index 0 is still found", () => {
  // `dirFlag >= 0` vs `> 0`: only a -C in first position separates them.
  assert.deepEqual(entryPointsFromScripts({ x: "-C packages/cli tsx src/a.ts" }), [
    "packages/cli/src/a.ts",
  ]);
});

test("mutation-diff: a trailing -C with no directory leaves the path repo-relative", () => {
  assert.deepEqual(entryPointsFromScripts({ x: "tsx src/a.ts -C" }), ["src/a.ts"]);
});

test("mutation-diff: only the FINAL .ts is replaced when a directory also ends in .ts", () => {
  assert.equal(siblingTestFor("packages/x.ts/a.ts"), "packages/x.ts/a.test.ts");
});

test("mutation-diff: a /dev/null section contributes nothing even when its hunk adds lines", () => {
  // A positive-count hunk under /dev/null is what separates "we skipped the file" from "we skipped
  // the hunk" — with a +n,0 hunk the two are indistinguishable.
  const ranges = parseUnifiedDiffRanges(
    ["+++ /dev/null", "@@ -1,5 +3,4 @@", "+++ b/a.ts", "@@ -1 +9 @@"].join("\n"),
  );
  assert.deepEqual(ranges, [{ file: "a.ts", ranges: [{ start: 9, end: 9 }] }]);
});

test("mutation-diff: a b/ deeper in the path is not stripped — only a LEADING one is", () => {
  const ranges = parseUnifiedDiffRanges(["+++ a/b/c.ts", "@@ -1 +1 @@"].join("\n"));
  assert.deepEqual(ranges, [{ file: "a/b/c.ts", ranges: [{ start: 1, end: 1 }] }]);
});

test("mutation-diff: a line that ENDS with @@ but does not start with it is not a hunk", () => {
  const ranges = parseUnifiedDiffRanges(
    ["+++ b/a.ts", "some trailing text @@", "@@ -1 +8 @@"].join("\n"),
  );
  assert.deepEqual(ranges, [{ file: "a.ts", ranges: [{ start: 8, end: 8 }] }]);
});

test("mutation-diff: a multi-digit count on the MINUS side still parses", () => {
  const ranges = parseUnifiedDiffRanges(["+++ b/a.ts", "@@ -1,25 +7,2 @@"].join("\n"));
  assert.deepEqual(ranges, [{ file: "a.ts", ranges: [{ start: 7, end: 8 }] }]);
});

test("mutation-diff: an undefined testFiles entry is skipped rather than thrown on", () => {
  const report: MutationReport = {
    files: { "a.ts": { mutants: [{ id: "1", status: "Survived", location: { start: { line: 1 } } }] } },
    testFiles: { "gone.test.ts": undefined },
  };
  const verdict = adjudicateMutants(report, ["gone.test.ts"]);
  assert.equal(verdict.verdict, "fail");
  assert.equal(verdict.counted, 1);
});

test("mutation-diff: an undefined files entry is skipped rather than thrown on", () => {
  const verdict = adjudicateMutants({ files: { "a.ts": undefined }, testFiles: {} }, []);
  assert.equal(verdict.verdict, "vacuous");
  assert.equal(verdict.mutants.length, 0);
});

test("mutation-diff: a multi-digit count on the PLUS side still parses", () => {
  // `(?:,(\d+))?` vs `(?:,(\d))?`: only a two-digit added-line count separates them.
  const ranges = parseUnifiedDiffRanges(["+++ b/a.ts", "@@ -1 +7,12 @@"].join("\n"));
  assert.deepEqual(ranges, [{ file: "a.ts", ranges: [{ start: 7, end: 18 }] }]);
});

test("mutation-diff: the header counts every mutated file, not just the first", () => {
  const twoFiles: MutationTarget = {
    project: "@storytree/cli",
    dir: "packages/cli",
    mutateGlobs: ["packages/cli/src/a.ts:1-2", "packages/cli/src/b.ts:1-2"],
    sourceFiles: ["packages/cli/src/a.ts", "packages/cli/src/b.ts"],
  };
  const verdict = adjudicateMutants(reportWith({ status: "Survived" }), []);
  const body = formatMutationVerdict("[m]", verdict, [twoFiles]);
  assert.match(body, /^\[m\] 2 changed source file\(s\), 2 changed line span\(s\), 1 mutant\(s\) counted$/m);
});

test("mutation-diff: every reason is echoed into the rendered body, tagged", () => {
  const verdict = adjudicateMutants(reportWith({ status: "Survived" }), []);
  const body = formatMutationVerdict("[m]", verdict, [TARGET]);
  assert.ok(
    body.split("\n").includes("[m] 1 mutant(s) SURVIVED — no test noticed the change"),
    body,
  );
});

test("mutation-diff: two crediting files are joined with a comma and space in the body", () => {
  const verdict = adjudicateMutants(
    reportWith({
      status: "Killed",
      killedBy: ["t1", "t2"],
      testFiles: { "old-a.test.ts": ["t1"], "old-b.test.ts": ["t2"] },
    }),
    ["mine.test.ts"],
  );
  const body = formatMutationVerdict("[m]", verdict, [TARGET]);
  assert.match(body, /killed by old-a\.test\.ts, old-b\.test\.ts$/m);
});

test("mutation-diff: a location with no start reads as an unknown line, not a crash", () => {
  const verdict = adjudicateMutants(
    { files: { "a.ts": { mutants: [{ id: "1", status: "Survived", location: {} }] } }, testFiles: {} },
    [],
  );
  assert.equal(verdict.mutants[0]?.line, null);
});

// ── skipDisposition ─────────────────────────────────────────────────────────
//
// The rung's SKIP is the commonest outcome it has (a corpus, docs or config landing changes no
// mutable TypeScript), and the two runners that read it disagree about what a non-zero code means.
// `gate-run.ts` reads 3 as a declared SKIP and prints GATE GREEN, NARROWED; `.github/workflows/ci.yml`
// runs the same script as a plain step where ANY non-zero code is a hard failure. So the fact is
// stated either way and only the code differs — see `gate-skip-exit-3-is-local-only` in
// `check-web-experience-closure.ts`, whose bootstrap branch established this shape.

test("mutation-diff: locally a skip DECLARES itself with the gate's skip code", () => {
  assert.deepEqual(skipDisposition({ inCi: false, gateSkipExitCode: 3 }), {
    exitCode: 3,
    label: "SKIP",
  });
});

test("mutation-diff: in CI a skip exits 0 — a declared 3 there is read as a hard failure", () => {
  assert.deepEqual(skipDisposition({ inCi: true, gateSkipExitCode: 3 }), {
    exitCode: 0,
    label: "NOTHING TO MUTATE",
  });
});

test("mutation-diff: the skip code is the caller's, never re-declared here", () => {
  assert.equal(skipDisposition({ inCi: false, gateSkipExitCode: 7 }).exitCode, 7);
  // CI's zero is NOT the caller's code — it is the one branch that must not carry it.
  assert.equal(skipDisposition({ inCi: true, gateSkipExitCode: 7 }).exitCode, 0);
});

test("mutation-diff: the two dispositions never share a label — the runners must be told apart", () => {
  const local = skipDisposition({ inCi: false, gateSkipExitCode: 3 });
  const ci = skipDisposition({ inCi: true, gateSkipExitCode: 3 });
  assert.notEqual(local.label, ci.label);
  assert.notEqual(local.exitCode, ci.exitCode);
});

// ── runsUnderBun ─────────────────────────────────────────────────────────────
//
// The rung runs Stryker's bun test runner. A project whose own suite is `vitest run` needs a DOM
// environment the bun runner does not provide, so handing Stryker one kills the DRY RUN before a
// single mutant is tested — measured on the first branch to touch a `packages/forest-world` source
// file and an `apps/studio` snapshot in the same diff. These pin the discrimination, including the
// two shapes the real repo actually carries.

test("runsUnderBun: a plain bun suite is runnable", () => {
  assert.equal(runsUnderBun("bun test --timeout 300000 src/"), true);
});

test("runsUnderBun: a bun suite behind a chained prelude is still runnable", () => {
  // packages/cli's real script — a tsx guard, then the bun suite.
  assert.equal(
    runsUnderBun(
      "node --import ../../scripts/tsx-cache-off.mjs --import tsx scripts/validate-corpus.ts && bun test --preload ../../scripts/tsx-cache-off.mjs --timeout 300000 src/",
    ),
    true,
  );
});

test("runsUnderBun: vitest is NOT runnable — this is the case that killed the dry run", () => {
  assert.equal(runsUnderBun("vitest run"), false);
});

test("runsUnderBun: a project with no test script is not runnable", () => {
  assert.equal(runsUnderBun(undefined), false);
});

test("runsUnderBun: a script that merely MENTIONS bun does not count as running bun test", () => {
  // The failure this guards is the opposite of the one above and just as quiet: matching too widely
  // would readmit exactly the projects the narrowing exists to exclude.
  assert.equal(runsUnderBun("echo use bun to run these && vitest run"), false);
  assert.equal(runsUnderBun("bunx vitest run"), false);
  assert.equal(runsUnderBun("vitest run --reporter=bun-tests"), false);
});

test("runsUnderBun: the boundary before `bun` is load-bearing, not decoration", () => {
  // A pattern that dropped the leading boundary would match any script whose text merely CONTAINS
  // the letters — and readmit the projects this narrowing exists to exclude.
  assert.equal(runsUnderBun("rebun test src/"), false);
  assert.equal(runsUnderBun("prebun  test"), false);
  assert.equal(runsUnderBun("pnpm exec bun test src/"), true);
  assert.equal(runsUnderBun("build.sh;bun test"), true);
});

test("runsUnderBun: the separator between `bun` and `test` must be whitespace", () => {
  assert.equal(runsUnderBun("bun test"), true);
  assert.equal(runsUnderBun("bun  test src/"), true);
  assert.equal(runsUnderBun("buntest src/"), false);
  assert.equal(runsUnderBun("bun-test src/"), false);
});

test("runsUnderBun: `bun test` must END a word — `bun tests` is a different command", () => {
  assert.equal(runsUnderBun("bun testing-helper.ts"), false);
  assert.equal(runsUnderBun("bun tests/"), false);
});

test("runsUnderBun: an empty script is not runnable", () => {
  assert.equal(runsUnderBun(""), false);
});

// ---------------------------------------------------------------------------
// Spawn-based acceptance legs are excluded from the mutation runner (2026-08-28)
// ---------------------------------------------------------------------------

test("isSpawnUatTest: a `.uat.test.ts` leg is excluded, an ordinary unit test is NOT", () => {
  // THE MEASURED REASON, so this is not read as taste. On clean `origin/main` at 785cc021, with a
  // one-line comment added to `terminal-capture.ts` and another to `terminal-capture.uat.test.ts`
  // purely to force this rung to select them, SIX legs of that UAT file failed Stryker's INITIAL DRY
  // RUN with `connect ECONNREFUSED 127.0.0.1:<port>` and the rung exited 1 having evaluated no mutant
  // at all. Those legs spawn the real CLI against a real fixture door started in `before` and killed
  // in `after`; Stryker's `perTest` analysis re-runs the suite and finds the door dead.
  assert.equal(isSpawnUatTest("packages/context-traversal-capture/src/terminal-capture.uat.test.ts"), true);
  assert.equal(isSpawnUatTest("packages/context-traversal-telemetry/src/orientation-runner-adapter.uat.test.ts"), true);

  // ⚠ THE NEGATIVE HALF IS THE POINT — it is what stops this becoming the curated opt-out list that
  // `entryPointsFromScripts` refuses by design. An ordinary unit test must stay IN the runner however
  // much a session might prefer it out; the only way to claim the exemption is to rename a file to
  // assert it is an acceptance leg, which is a visible lie rather than a quiet one.
  assert.equal(isSpawnUatTest("packages/cli/src/cli.test.ts"), false);
  assert.equal(isSpawnUatTest("packages/cli/src/mutation-diff.test.ts"), false);
  assert.equal(isSpawnUatTest("packages/context-traversal-capture/src/query-render.test.ts"), false);

  // Near misses, so the rule cannot be widened by an accident of naming: the suffix is exact, and a
  // file merely mentioning "uat" elsewhere in its path or stem is an ordinary test.
  assert.equal(isSpawnUatTest("packages/cli/src/uat-criteria.test.ts"), false);
  assert.equal(isSpawnUatTest("packages/cli/src/uat.test.ts.bak"), false);
  assert.equal(isSpawnUatTest("packages/uat/src/thing.test.ts"), false);
  assert.equal(isSpawnUatTest("packages/cli/src/thing.uat.ts"), false);
});
