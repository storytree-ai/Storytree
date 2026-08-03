import test from "node:test";
import assert from "node:assert/strict";

import {
  SANCTIONED_WALL_CLOCK,
  classifyTestTiming,
  detectWallClock,
  formatTestTiming,
  hasEnvGate,
  maskNonCode,
  parseWorkspaceRoots,
  runTestTimingGate,
} from "./test-timing-gate.js";

/**
 * The `check:test-timing` SWEEP (ADR-0276 D3) — what the fence sees, and what it must not see.
 *
 * Every fixture below is held in a STRING literal, which means this file is itself the densest
 * concentration of the fenced pattern in the repo. It does not red the gate because
 * {@link maskNonCode} blanks string bodies — so the real-repo BASELINE in `test-timing-drain.test.ts`
 * (which scans this very file) is a live proof of the masker, not just of the ceiling.
 *
 * The masker is the load-bearing precision of the whole check, in both directions: a comment
 * mentioning the API must not red (this ADR makes such comments the natural thing to write, and one
 * already exists for the sibling `Date.now`), while a call inside a template interpolation must
 * still be caught (it executes).
 */

const lines = (...ls: string[]): string => ls.join("\n");

// ---------------------------------------------------------------------------
// RED — the fenced class is detected
// ---------------------------------------------------------------------------

test("RED: a wall-clock duration in a test file is detected, with its API and exact line", () => {
  const src = lines(
    "import test from 'node:test';",
    "test('routes fast', () => {",
    "  const t0 = performance.now();",
    "  route();",
    "  assert.ok(performance.now() - t0 < 2000);",
    "});",
  );
  const hits = detectWallClock("packages/x/src/x.test.ts", src);
  assert.equal(hits.length, 2);
  assert.deepEqual(
    hits.map((h) => h.line),
    [3, 5],
    "line numbers survive masking, so the breach is actionable from gate output alone",
  );
  assert.equal(hits[0]?.api, "performance.now");
  assert.equal(hits[0]?.file, "packages/x/src/x.test.ts");
});

test("RED: `process.hrtime` is the second named API, `.bigint()` included", () => {
  const plain = detectWallClock("a.test.ts", "const d = process.hrtime(start);");
  assert.equal(plain.length, 1);
  assert.equal(plain[0]?.api, "process.hrtime");
  // The dotted form is the same API — matching the member expression catches it without a second rule.
  const big = detectWallClock("a.test.ts", "const d = process.hrtime.bigint();");
  assert.equal(big.length, 1);
  assert.equal(big[0]?.api, "process.hrtime");
});

test("RED: a call inside a TEMPLATE INTERPOLATION still counts — it executes", () => {
  // The false negative that would gut the fence: blanking a whole template literal would hide real
  // code. The masker re-enters code mode at `${`.
  const src = "t.diagnostic(`routed in ${performance.now() - t0}ms`);";
  const hits = detectWallClock("a.test.ts", src);
  assert.equal(hits.length, 1, "an interpolated call is code, not string content");
  assert.equal(hits[0]?.line, 1);
});

// ---------------------------------------------------------------------------
// FALSE-POSITIVE GUARDS — what the fence must NOT fire on
// ---------------------------------------------------------------------------

test("GUARD: a COMMENT naming the API is not a use — the doctrine may be written down", () => {
  // Not hypothetical: `orientation-runner-adapter.uat.test.ts:51` already carries exactly this shape
  // of comment for the sibling `Date.now`, and ADR-0276 makes such notes the natural thing to write.
  // A fence that red on its own doctrine would be uninstalled within a week.
  const src = lines(
    "// The clock is INJECTED here — never performance.now(), which measures the box (ADR-0276).",
    "/* nor process.hrtime, for the same reason */",
    "const now = () => fixedNow;",
  );
  assert.deepEqual(detectWallClock("a.test.ts", src), []);
});

test("GUARD: a STRING mentioning the API is not a use — remedy prose and fixtures stay legal", () => {
  const src = lines(
    "const remedy = 'do not call performance.now() in a gate-tier test';",
    'const other = "process.hrtime is out too";',
    "const tpl = `and performance.now inside a plain template`;",
  );
  assert.deepEqual(detectWallClock("a.test.ts", src), []);
});

test("GUARD: an escaped quote does not end a literal early and leak its tail", () => {
  // `'\''` would otherwise close the string and expose the rest of the line as code.
  const src = "const s = 'it\\'s fine to say performance.now() here';";
  assert.deepEqual(detectWallClock("a.test.ts", src), []);
});

test("GUARD: an interpolation RETURNS to template mode — the rest of the file is not mis-parsed", () => {
  // The bug the real-repo baseline caught and these fixtures first missed: entering `${` recorded a
  // brace depth one deeper than the interpolation's own closing `}`, so the comparison never matched,
  // the masker never re-entered template mode, and every line AFTER the first interpolated template
  // in a file was mis-parsed. Measured on routing.test.ts: line 29 held `` `segment ${id} exists` ``
  // and everything from line 30 on was blanked — including the `process.env.STORYTREE_PERF` guard at
  // :715, which made the survivor look like it had lost its gate. A one-line fixture cannot see this;
  // it needs code AFTER the interpolation.
  const src = lines(
    "assert.ok(seg, `segment ${id} exists`);",
    "const nested = `${ {a: 1}.a } and ${b}`;",
    "const t0 = performance.now();",
    "if (process.env.STORYTREE_PERF === '1') assert.ok(true);",
  );
  const hits = detectWallClock("a.test.ts", src);
  assert.equal(hits.length, 1, "code after an interpolated template is still scanned");
  assert.equal(hits[0]?.line, 3, "…and its line number is still exact");
  assert.equal(hasEnvGate(src, "STORYTREE_PERF"), true, "…and the env gate is still visible");
});

test("GUARD: masking preserves LENGTH and every newline, so positions never shift", () => {
  const src = lines("const a = 1; // performance.now()", "const b = `x`;", "/* two", "   lines */");
  const masked = maskNonCode(src);
  assert.equal(masked.length, src.length, "same length ⇒ indexes are comparable");
  assert.equal(
    masked.split("\n").length,
    src.split("\n").length,
    "newlines survive inside blanked blocks ⇒ line numbers are exact",
  );
  assert.match(masked, /^const a = 1;/, "real code is untouched");
});

// ---------------------------------------------------------------------------
// The env gate that earns the exemption (axis b's instrument)
// ---------------------------------------------------------------------------

test("the env gate is read from CODE, never from a comment that merely mentions it", () => {
  assert.equal(hasEnvGate("if (process.env.STORYTREE_PERF === '1') assert.ok(x);", "STORYTREE_PERF"), true);
  assert.equal(
    hasEnvGate("// this used to be behind process.env.STORYTREE_PERF", "STORYTREE_PERF"),
    false,
    "a commented-out gate is not a gate — otherwise deleting the `if` and leaving the note would pass",
  );
});

// ---------------------------------------------------------------------------
// Classification — the two axes
// ---------------------------------------------------------------------------

const SANCTIONED_FIXTURE = [
  { file: "pkg/src/routing.test.ts", envGate: "STORYTREE_PERF", why: "the opt-in perf bound" },
] as const;

const gated = lines(
  "const t0 = performance.now();",
  "const elapsed = performance.now() - t0;",
  "if (process.env.STORYTREE_PERF === '1') assert.ok(elapsed < 2000);",
);

test("axis (a): a hit in an UNSANCTIONED file is a gap; the sanctioned file's hits are not", () => {
  const report = classifyTestTiming({
    files: [
      { file: "pkg/src/routing.test.ts", source: gated },
      { file: "pkg/src/other.test.ts", source: "const t0 = performance.now();" },
    ],
    workspaceCount: 1,
    sanctioned: SANCTIONED_FIXTURE,
  });
  assert.equal(report.unsanctioned.length, 1);
  assert.equal(report.unsanctioned[0]?.file, "pkg/src/other.test.ts");
  assert.equal(report.sanctionedHits, 2, "the survivor's own hits are counted, never flagged");
  assert.deepEqual(report.ungatedSanctioned, []);
  assert.equal(report.clean, false);
});

test("axis (b): the survivor LOSING its env gate breaches, while axis (a) stays honestly at zero", () => {
  // The regression this axis exists for: deleting one `if` line restores the exact flake increment 1
  // removed, and the unsanctioned count never moves. Without axis (b) the allow-list is a blanket pardon.
  const report = classifyTestTiming({
    files: [
      {
        file: "pkg/src/routing.test.ts",
        source: lines("const t0 = performance.now();", "assert.ok(performance.now() - t0 < 2000);"),
      },
    ],
    workspaceCount: 1,
    sanctioned: SANCTIONED_FIXTURE,
  });
  assert.deepEqual(report.unsanctioned, [], "the file is still sanctioned, so axis (a) sees nothing");
  assert.equal(report.ungatedSanctioned.length, 1);
  assert.match(report.ungatedSanctioned[0] ?? "", /no longer guards on `process\.env\.STORYTREE_PERF`/);
  assert.equal(report.clean, false);
});

test("axis (b): a sanctioned entry whose FILE is gone is a stale exemption, not a free pass", () => {
  // A dead allow-list entry silently pardons any future file at that path — un-drained slack.
  const report = classifyTestTiming({
    files: [{ file: "pkg/src/other.test.ts", source: "assert.ok(true);" }],
    workspaceCount: 1,
    sanctioned: SANCTIONED_FIXTURE,
  });
  assert.equal(report.ungatedSanctioned.length, 1);
  assert.match(report.ungatedSanctioned[0] ?? "", /stale exemption/);
});

test("GREEN: a clean sweep — the gated survivor alone — reports OK and names the population", () => {
  const { warn, lines: out, report } = runTestTimingGate({
    loadInputs: () => ({
      files: [
        { file: "packages/forest-world/src/routing.test.ts", source: gated },
        { file: "pkg/src/plain.test.ts", source: "assert.equal(1, 1);" },
      ],
      workspaceCount: 2,
    }),
  });
  assert.equal(report.clean, true);
  assert.equal(warn, false);
  assert.match(out[0] ?? "", /OK/);
  assert.match(out[0] ?? "", /2 test files across 2 gate-tier workspaces/);
});

test("a breach is NAMED file:line — the gate output alone is enough to fix it", () => {
  const { warn, lines: out } = runTestTimingGate({
    loadInputs: () => ({
      files: [{ file: "pkg/src/slow.test.ts", source: lines("//", "const t = performance.now();") }],
      workspaceCount: 1,
    }),
  });
  assert.equal(warn, true);
  assert.ok(
    out.some((l) => l.includes("pkg/src/slow.test.ts:2") && l.includes("performance.now")),
    `expected a file:line breach line, got: ${out.join(" | ")}`,
  );
});

test("formatTestTiming reports both gap lists at once, never one hiding the other", () => {
  const { warn, lines: out } = formatTestTiming({
    unsanctioned: [{ file: "a.test.ts", api: "performance.now", line: 7 }],
    ungatedSanctioned: ["b.test.ts lost its gate"],
    scannedFiles: 9,
    scannedWorkspaces: 2,
    sanctionedHits: 0,
    clean: false,
  });
  assert.equal(warn, true);
  assert.ok(out.some((l) => l.includes("a.test.ts:7")));
  assert.ok(out.some((l) => l.includes("b.test.ts lost its gate")));
});

// ---------------------------------------------------------------------------
// The scanned population — gate-tier is DERIVED from the chain, not hardcoded
// ---------------------------------------------------------------------------

test("the workspace roots come from pnpm-workspace.yaml, and an unknown glob shape THROWS", () => {
  assert.deepEqual(
    parseWorkspaceRoots(lines("packages:", "  - 'packages/*'", "  - 'apps/*'")),
    ["packages", "apps"],
  );
  // A silently-narrowed population is a false green, so an unparseable glob must SKIP loudly (the
  // shell's catch-all) rather than scan a subset and report OK.
  assert.throws(
    () => parseWorkspaceRoots(lines("packages:", "  - 'packages/**/nested'")),
    /unsupported workspace glob/,
  );
});

test("the shipped allow-list is exactly ONE entry — the env-gated survivor ADR-0276 D3 names", () => {
  assert.equal(SANCTIONED_WALL_CLOCK.length, 1, "a second entry is a second permanent exemption");
  assert.equal(SANCTIONED_WALL_CLOCK[0]?.file, "packages/forest-world/src/routing.test.ts");
  assert.equal(SANCTIONED_WALL_CLOCK[0]?.envGate, "STORYTREE_PERF");
});
