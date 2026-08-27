// THE ADR-0367 SCREEN-SPACE-DISTANCE GUARD'S OWN PROOF (`ground-space-truth-arc-inc-01`).
//
// The rule, and why it is a marker rather than a ban, are in `./ground-space.ts`'s header. This file
// asks the two questions a guard has to answer about itself, because a guard that gets either wrong
// is worse than none at all:
//
//   1. DOES IT FIRE? An undeclared point-to-point distance in a lattice-calling file must be
//      REPORTED. The instance that escaped PR #1356 is used as the fixture — the guard is held to
//      catching the one that actually got away, not a shape invented for the test.
//   2. DOES IT STAY QUIET? `Math.sqrt(3) * HEX_R`, a 3D vector length, a lattice-free file, a
//      generated mirror — none of these may be reported. This half matters MORE, because a guard
//      that cries wolf gets an `eslint-disable` or a widened exclusion and stops guarding anything.
//      Every over-broad-matcher case below is a way this rung could have been switched off.
//
// ⚠ AND ITS SELF-REFERENCE. The scanner reads source text, and the repo's own prose about this rule
// QUOTES the marker syntax — this very file does, several times. A scanner that read its own
// documentation as a marker would be `source-text-check-trips-on-its-own-rationale`, which is on
// this repo's list of the ways a check goes green having verified nothing. The string-literal cases
// below are that fence.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MARKER_LOOKBACK_LINES,
  balancedArgs,
  callsLattice,
  groundSpaceReport,
  isPointDistance,
  isWithinLookback,
  lineAtOffset,
  lineStartOffsets,
  parseMarker,
  scanGroundSpace,
  splitSource,
  splitTopLevel,
} from "./ground-space.js";

/** A file whose text calls a projecting lattice verb, so the rung is in scope for it. */
const lattice = (body: string): string => `import { hexCenter } from './hex.js';\nconst c = hexCenter(h);\n${body}\n`;

const scan = (body: string) => scanGroundSpace("fixture.ts", lattice(body));

// ---------------------------------------------------------------------------------------------
// 1. IT FIRES — on the instance that actually got away
// ---------------------------------------------------------------------------------------------

test("an undeclared point-to-point distance in a lattice-calling file is reported", () => {
  // The shape of `web/src/scripts/act2-walkthrough.ts:304` before the fix: a keep-out radius
  // compared against a distance between two projected points, with nothing saying which space it
  // is in. This is the site PR #1356 declared the class closed without, so it is the fixture.
  const v = scan("const near = tiles.some((t) => Math.hypot(t.x - c.x, t.y - c.y) < 42);");
  assert.ok(v, "a file calling hexCenter must be in scope");
  assert.equal(v.sites.length, 1);
  assert.equal(v.unmarked.length, 1, "an unmarked point distance is the class's own signature");
  assert.equal(v.sites[0]?.marker, undefined);

  const report = groundSpaceReport([{ path: "web/src/scripts/act2-walkthrough.ts", source: lattice("const near = Math.hypot(t.x - c.x, t.y - c.y) < 42;") }]);
  assert.equal(report.failures.length, 1);
  assert.match(report.failures[0] ?? "", /act2-walkthrough\.ts:3 — a point-to-point distance with NO space marker/);
});

test("the delta form is caught too — a distance is not always spelled with .x and .y", () => {
  const v = scan("const dx = a.x - c.x, dy = a.y - c.y;\nconst d = Math.hypot(dx, dy);");
  assert.equal(v?.unmarked.length, 1, "`hypot(dx, dy)` is the same decision wearing local names");
});

// ---------------------------------------------------------------------------------------------
// 2. IT STAYS QUIET — every one of these is a way the rung gets switched off
// ---------------------------------------------------------------------------------------------

test("`Math.sqrt(3) * HEX_R` is NOT a point distance — an over-broad matcher is how a guard dies", () => {
  // A matcher that flagged every square root, or every `hypot`, would fire on the lattice's own
  // geometry constants and on `Math.sqrt(rand()) * spread`. Those are not decisions about how far
  // apart two points are, and a rung that demanded a space marker on them would be noise — and
  // noise is what gets a rung deleted or excluded rather than answered.
  const v = scan("const rowH = Math.sqrt(3) * HEX_R;\nconst rr = Math.sqrt(rand()) * spread;");
  assert.ok(v, "the file is still in scope — it calls the lattice");
  assert.equal(v.sites.length, 0, "neither square root is a point-to-point distance");
  assert.equal(v.unmarked.length, 0);
});

test("a scalar hypot is not a point distance either", () => {
  // `Math.hypot(width, height)` is a diagonal, not a separation between two points, and neither
  // argument names a coordinate. Requiring a space marker here teaches authors the rule is arbitrary.
  const v = scan("const diag = Math.hypot(width, height);");
  assert.equal(v?.sites.length, 0);
});

test("a 3D vector length is excluded — the land camera never reached the r3f harness's (x, z)", () => {
  // `packages/forest-world-r3f/harness` measures in 3D ground coordinates and unprojects at every
  // entry point; its ~40 hypot calls are correct and unaffected. Flagging them would have made the
  // rung's first run a 40-item wall of false positives.
  const v = scan("const len = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);");
  assert.equal(v?.sites.length, 0, "a `.z` argument means 3D model space, not the land plane");
  assert.equal(isPointDistance("a.x - b.x, a.y - b.y, a.z - b.z"), false);
  assert.equal(isPointDistance("a.x - b.x, a.y - b.y"), true);
});

test("a file that never calls the lattice is OUT OF SCOPE, which is not the same as clean", () => {
  // The bug is BORN where projected coordinates are minted. `routing.ts` and `laneLayout.ts` measure
  // isotropic distances correctly, and correctly BECAUSE of what their callers pass them — a fact
  // neither file can state about itself. Taxing them buys no information.
  const v = scanGroundSpace("routing.ts", "export const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);\n");
  assert.equal(v, undefined, "out of scope returns undefined, distinct from a clean verdict");
  assert.equal(callsLattice("const x = 1;"), false);
  for (const verb of ["hexCenter", "hexCorners", "pixelToHex", "hexPath"]) {
    assert.equal(callsLattice(`const p = ${verb}(h);`), true, `${verb} mints projected coordinates`);
  }
});

test("`projectGround` / `unprojectGround` do NOT put a file in scope", () => {
  // Reaching for those is already reasoning about the projection explicitly — the behaviour this
  // rung exists to produce, not the behaviour it exists to catch.
  assert.equal(callsLattice("const g = unprojectGround(d, deg); const h = projectGround(g, deg);"), false);
});

// ---------------------------------------------------------------------------------------------
// 3. A MARKER HAS TO SAY SOMETHING, AND HAS TO BE ABOUT SOMETHING
// ---------------------------------------------------------------------------------------------

test("a marker with no reason FAILS — the ask is the point, and a bare token skips it", () => {
  const v = scan("// screen-space:\nconst d = Math.hypot(a.x - c.x, a.y - c.y);");
  assert.equal(v?.unmarked.length, 0, "it IS marked");
  assert.equal(v?.reasonless.length, 1, "…but it answers nothing, which is what the class costs");
  const report = groundSpaceReport([{ path: "f.ts", source: lattice("// screen-space:\nconst d = Math.hypot(a.x - c.x, a.y - c.y);") }]);
  assert.match(report.failures[0] ?? "", /`screen-space` marker with no reason/);
});

test("a `screen-space-defect` must NAME its increment — an uncited one is a shrug", () => {
  const bare = scan("// screen-space-defect: fix later\nconst d = Math.hypot(a.x - c.x, a.y - c.y);");
  assert.equal(bare?.reasonless.length, 1, "'fix later' is not a reference anyone can follow");

  const cited = scan(
    "// screen-space-defect: studio-island-layout-moves-to-ground-space — a projected argmin\nconst d = Math.hypot(a.x - c.x, a.y - c.y);",
  );
  assert.equal(cited?.reasonless.length, 0);
  assert.equal(cited?.knownDefects.length, 1, "a cited open instance is ACCEPTED…");
  const report = groundSpaceReport([
    {
      path: "f.ts",
      source: lattice("// screen-space-defect: studio-island-layout-moves-to-ground-space — a projected argmin\nconst d = Math.hypot(a.x - c.x, a.y - c.y);"),
    },
  ]);
  assert.equal(report.failures.length, 0, "…and never red — the class stays open, not hidden");
  assert.equal(report.knownDefects.length, 1, "…but it IS reported, so the remaining work stays in the gate's own output");
});

test("an ORPHANED marker fails — one that has drifted off the distance it was written for", () => {
  // The failure this catches: someone moves or deletes the `Math.hypot` and leaves the comment. The
  // file then reads as declared and is not, which is the quiet way a marker rung rots into decoration.
  const v = scan("// ground-space: measured after unprojecting\nconst unrelated = 1;");
  assert.equal(v?.sites.length, 0);
  assert.equal(v?.orphanedMarkers.length, 1);
  const report = groundSpaceReport([{ path: "f.ts", source: lattice("// ground-space: measured after unprojecting\nconst unrelated = 1;") }]);
  assert.match(report.failures[0] ?? "", /marker no distance claims; it has drifted off its subject/);
});

test("`screen-space-defect` is not read as `screen-space` with an odd reason", () => {
  // `screen-space` is a literal prefix of `screen-space-defect`, so the parse anchors on the colon.
  // Getting this wrong would silently downgrade every declared open instance to an ordinary
  // deliberate screen quantity, and the gate would stop listing the work that is left.
  const v = scan("// screen-space-defect: some-open-increment — why\nconst d = Math.hypot(a.x - c.x, a.y - c.y);");
  assert.equal(v?.sites[0]?.marker, "screen-space-defect");
  assert.equal(v?.sites[0]?.reason, "some-open-increment — why");
});

// ---------------------------------------------------------------------------------------------
// 4. THE LOOKBACK — a marker binds to the distance below it, and only just below it
// ---------------------------------------------------------------------------------------------

test("the lookback rule itself: at or above the site, and no further than the lookback", () => {
  assert.equal(isWithinLookback(10, 10), true, "a marker on the same line binds");
  assert.equal(isWithinLookback(10 - MARKER_LOOKBACK_LINES, 10), true, "…as does one exactly that far above");
  assert.equal(isWithinLookback(10 - MARKER_LOOKBACK_LINES - 1, 10), false, "…and one line further does not");
  // A marker BELOW its subject must never bind backwards: a comment written after a line reads as
  // being about the next one, and binding it upward would let one sentence answer for two distances.
  assert.equal(isWithinLookback(11, 10), false);
});

test("a marker binds within the lookback and not beyond it", () => {
  assert.equal(MARKER_LOOKBACK_LINES, 3);
  const filler = (n: number): string => Array.from({ length: n }, () => "const pad = 0;").join("\n");

  const near = scan(`// ground-space: unprojected first\n${filler(MARKER_LOOKBACK_LINES - 1)}\nconst d = Math.hypot(a.x - c.x, a.y - c.y);`);
  assert.equal(near?.unmarked.length, 0, "inside the lookback the marker binds");

  const far = scan(`// ground-space: unprojected first\n${filler(MARKER_LOOKBACK_LINES)}\nconst d = Math.hypot(a.x - c.x, a.y - c.y);`);
  assert.equal(far?.unmarked.length, 1, "beyond it the distance is undeclared…");
  assert.equal(far?.orphanedMarkers.length, 1, "…and the marker is an orphan, so BOTH halves red");
});

test("one marker covers a distance split across the lines below it", () => {
  // The studio's hero-tile argmin is two `Math.hypot` calls in one comparator, one per line. A rung
  // that demanded a marker per line would push authors to duplicate the same sentence.
  const v = scan(
    "// screen-space-defect: studio-island-layout-moves-to-ground-space — a projected argmin\nreturn (\n  Math.hypot(a.x - c.x, a.y - c.y) -\n  Math.hypot(b.x - c.x, b.y - c.y)\n);",
  );
  assert.equal(v?.sites.length, 2);
  assert.equal(v?.unmarked.length, 0);
  assert.equal(v?.orphanedMarkers.length, 0, "the marker is claimed, by both");
});

test("a marker in a block comment counts — the repo writes plenty of its reasoning that way", () => {
  const v = scan("/**\n * ground-space: both points were unprojected by the caller\n */\nconst d = Math.hypot(a.x - c.x, a.y - c.y);");
  assert.equal(v?.unmarked.length, 0);
  assert.equal(v?.sites[0]?.marker, "ground-space");
});

// ---------------------------------------------------------------------------------------------
// 5. THE SELF-REFERENCE FENCE — the scanner must not read prose as code, or code as prose
// ---------------------------------------------------------------------------------------------

test("the marker syntax inside a STRING is not a marker", () => {
  // This repo documents the rule in its own source, and the runner prints the three forms verbatim.
  // A scanner that accepted `"// ground-space: …"` as a declaration could be silenced with a string.
  const v = scan('const help = "// ground-space: <why>";\nconst d = Math.hypot(a.x - c.x, a.y - c.y);');
  assert.equal(v?.unmarked.length, 1, "a quoted marker declares nothing");
});

test("a `Math.hypot` inside a STRING or a COMMENT is not a site", () => {
  // The mirror of the case above: prose quoting the defect must not be reported as the defect.
  const inString = scan('const doc = "Math.hypot(a.x - b.x, a.y - b.y) is the bug";');
  assert.equal(inString?.sites.length, 0);
  const inComment = scan("// the old rule was Math.hypot(a.x - b.x, a.y - b.y)\nconst ok = 1;");
  assert.equal(inComment?.sites.length, 0);
});

test("a `//` inside a string does not start a comment", () => {
  // If it did, the rest of the line would be blanked and a real distance after a URL would vanish.
  const v = scan('const url = "https://example.com/x"; const d = Math.hypot(a.x - c.x, a.y - c.y);');
  assert.equal(v?.sites.length, 1, "the distance after the URL is still seen");
});

// ---------------------------------------------------------------------------------------------
// 6. THE FOLD — what the runner prints, and the never-vacuous floor it rests on
// ---------------------------------------------------------------------------------------------

test("the report counts what it scanned, so the runner can refuse a scan that measured nothing", () => {
  // `check-ground-space.ts` exits non-zero when either count is zero, because a pattern scanner's
  // silent failure mode is matching nothing and reporting it as a clean bill of health. That refusal
  // needs these two numbers to be real.
  const report = groundSpaceReport([
    { path: "a.ts", source: lattice("const d = Math.hypot(a.x - c.x, a.y - c.y); // ground-space: unprojected") },
    { path: "b.ts", source: "export const unrelated = 1;\n" },
  ]);
  assert.equal(report.scanned.length, 1, "only the lattice-calling file is scanned");
  assert.equal(report.siteCount, 1);
  assert.equal(report.failures.length, 0);

  const empty = groundSpaceReport([]);
  assert.equal(empty.scanned.length, 0);
  assert.equal(empty.siteCount, 0, "which is what the runner refuses on");
});

test("every failing shape reaches the report, and a clean file contributes none", () => {
  const report = groundSpaceReport([
    { path: "unmarked.ts", source: lattice("const d = Math.hypot(a.x - c.x, a.y - c.y);") },
    { path: "reasonless.ts", source: lattice("// screen-space:\nconst d = Math.hypot(a.x - c.x, a.y - c.y);") },
    { path: "orphan.ts", source: lattice("// ground-space: a reason\nconst nope = 1;") },
    { path: "clean.ts", source: lattice("// ground-space: unprojected by the caller\nconst d = Math.hypot(a.x - c.x, a.y - c.y);") },
  ]);
  assert.equal(report.failures.length, 3);
  assert.equal(report.scanned.length, 4, "the clean file is still SCANNED — it just contributes no failure");
  assert.equal(report.siteCount, 3);
});

test("a malformed call does not crash the scan", () => {
  // A truncated file, or a `Math.hypot(` whose parentheses never close. The rung reads whole trees;
  // throwing here would take the gate down on a file nobody was asking about.
  const v = scan("const d = Math.hypot(a.x - c.x, a.y - c.y");
  assert.equal(v?.sites.length, 0, "an unbalanced call is skipped, not thrown on");
});

test("nested parentheses inside the arguments are read as one argument each", () => {
  const v = scan("const d = Math.hypot(f(a.x, 2) - c.x, g(a.y) - c.y);");
  assert.equal(v?.sites.length, 1, "two arguments naming .x and .y, however they are computed");
});

// ---------------------------------------------------------------------------------------------
// 7. THE PRIMITIVE — `splitSource`, character by character
// ---------------------------------------------------------------------------------------------
//
// Every line number, every site and every marker is downstream of this one function, and it is a
// hand-rolled character machine: a cursor that can be advanced wrongly, a quote state that can be
// left open, an escape that can consume one character instead of two. Tested only THROUGH the
// scanner, most of that is unreachable — a wrong cursor usually still produces a file with the same
// answer. So it is pinned here by EXACT OUTPUT, which is the only assertion that can see the
// difference between "the right answer" and "the right answer for the wrong reason".

const codes = (src: string): string[] => splitSource(src).map((l) => l.code);
const comments = (src: string): string[] => splitSource(src).map((l) => l.comment);

test("splitSource: plain code passes through untouched, and the line COUNT is preserved", () => {
  assert.deepEqual(splitSource("const a = 1;"), [{ code: "const a = 1;", comment: "" }]);
  // Line count is load-bearing: the reported line number is this array's index.
  assert.equal(splitSource("a\nb\nc").length, 3);
  assert.equal(splitSource("").length, 1, "an empty file is one empty line, not zero lines");
  assert.equal(splitSource("a\n").length, 2, "a trailing newline leaves an empty last line");
  assert.deepEqual(codes("a\r\nb"), ["a", "b"], "CRLF splits exactly like LF");
});

test("splitSource: a `//` ends the code and starts the comment, both exactly", () => {
  assert.deepEqual(splitSource("const a = 1; // why"), [{ code: "const a = 1; ", comment: " why" }]);
  assert.deepEqual(splitSource("// whole line"), [{ code: "", comment: " whole line" }]);
  // The delimiter belongs to neither half.
  assert.equal(comments("//x")[0], "x");
});

test("splitSource: a block comment's interior is comment, across line boundaries", () => {
  assert.deepEqual(splitSource("/* a */ const b = 2;"), [{ code: " const b = 2;", comment: " a " }]);
  const multi = splitSource("/**\n * ground-space: x\n */\nconst d = 1;");
  assert.equal(multi.length, 4);
  assert.equal(multi[0]?.code, "", "the opening line contributes no code");
  assert.equal(multi[1]?.comment, " * ground-space: x", "the interior line is ALL comment");
  assert.equal(multi[1]?.code, "", "…and contributes no code, so a hypot quoted there is not a site");
  assert.equal(multi[3]?.code, "const d = 1;", "the block really did close");
  // The old scanner recognised this by pattern-matching a leading star and had no idea it was inside
  // a block at all. A star-less interior line proves the state machine, not the pattern.
  assert.equal(splitSource("/*\nground-space: y\n*/")[1]?.comment, "ground-space: y");
});

test("splitSource: a quoted string's BODY is blanked, one space per character", () => {
  // Not merely "removed" — blanked in place, because the offsets built from these lines are what
  // map a match position back to a line number.
  assert.deepEqual(codes('const s = "hi";'), ['const s = "  ";']);
  assert.deepEqual(codes("const s = 'hi';"), ["const s = '  ';"]);
  assert.equal(codes('const u = "http://x";')[0], 'const u = "        ";');
  assert.equal(comments('const u = "http://x";')[0], "", "the `//` inside the string is not a comment");
});

test("splitSource: a backtick template is kept VERBATIM — an interpolation is real code", () => {
  assert.deepEqual(codes("const t = `a${x}b`;"), ["const t = `a${x}b`;"]);
  // The case this asymmetry exists for: scene.ts computes SVG path geometry inside templates, so a
  // distance interpolated into one must still be seen.
  const v = scanGroundSpace("f.ts", "const c = hexCenter(h);\nconst p = `M ${Math.hypot(a.x - b.x, a.y - b.y)} 0`;\n");
  assert.equal(v?.sites.length, 1, "a distance inside a template is a site; blanking templates would hide it");
});

test("splitSource: an escape consumes TWO characters, so an escaped quote does not close the string", () => {
  // The mutant this is here for advances the cursor by one: the escaped quote then reads as the
  // closing quote, the rest of the line is treated as code, and a `Math.hypot` in prose becomes a
  // site. Exact output is what sees it.
  assert.deepEqual(codes("const s = 'a\\'b';"), ["const s = '    ';"]);
  assert.deepEqual(codes("const t = `a\\`b`;"), ["const t = `a\\`b`;"], "…and a template keeps both");
  const v = scanGroundSpace("f.ts", "const c = hexCenter(h);\nconst s = 'a\\'Math.hypot(p.x - q.x, p.y - q.y)';\n");
  assert.equal(v?.sites.length, 0, "still one string, so still prose");
});

test("splitSource: quotes do not bleed across lines", () => {
  // A line ending inside an unterminated quote must not put the NEXT line into string state — a real
  // file has plenty of lone apostrophes in comments, and a leak would blank the rest of the file.
  const v = splitSource("const s = 'unterminated\nconst d = Math.hypot(a.x - b.x, a.y - b.y);");
  assert.equal(v[1]?.code, "const d = Math.hypot(a.x - b.x, a.y - b.y);");
});

// ---------------------------------------------------------------------------------------------
// 8. THE OTHER PRIMITIVES
// ---------------------------------------------------------------------------------------------

test("balancedArgs reads to the MATCHING paren, not the first one", () => {
  assert.equal(balancedArgs("f(a, b)", 1), "a, b");
  assert.equal(balancedArgs("f(a, g(b, c))", 1), "a, g(b, c)");
  assert.equal(balancedArgs("xx f(a) yy", 4), "a", "it starts at the offset it is given");
  assert.equal(balancedArgs("f(a", 1), undefined, "an unclosed call is undefined, never a guess");
  assert.equal(balancedArgs("f()", 1), "", "an empty argument list is empty, not undefined");
});

test("splitTopLevel splits on commas OUTSIDE every kind of bracket", () => {
  assert.deepEqual(splitTopLevel("a, b"), ["a", " b"]);
  assert.deepEqual(splitTopLevel("f(a, b), c"), ["f(a, b)", " c"]);
  assert.deepEqual(splitTopLevel("[a, b], c"), ["[a, b]", " c"]);
  assert.deepEqual(splitTopLevel("{ a: 1, b: 2 }, c"), ["{ a: 1, b: 2 }", " c"]);
  assert.deepEqual(splitTopLevel("a"), ["a"]);
  assert.deepEqual(splitTopLevel("a, "), ["a"], "a whitespace-only tail is not a third argument");
  // The consequence for the rung: a nested call must not make a 2-argument distance look like 3.
  assert.equal(isPointDistance("f(a.x, 2) - c.x, g(a.y) - c.y"), true);
  assert.equal(isPointDistance("a.x, a.y, a.w"), false, "three arguments is not a point distance");
});

test("parseMarker anchors on the COLON and on a word boundary", () => {
  assert.deepEqual(parseMarker(" ground-space: why"), { marker: "ground-space", reason: "why" });
  assert.deepEqual(parseMarker("ground-space: why"), { marker: "ground-space", reason: "why" });
  assert.deepEqual(parseMarker(" screen-space: why"), { marker: "screen-space", reason: "why" });
  // The prefix trap: `screen-space` is a literal prefix of `screen-space-defect`. Reading the defect
  // as an ordinary screen-space marker would silently stop the gate listing the work that is left.
  assert.deepEqual(parseMarker(" screen-space-defect: inc-id — why"), {
    marker: "screen-space-defect",
    reason: "inc-id — why",
  });
  assert.equal(parseMarker("xground-space: why"), undefined, "it must start a word");
  assert.equal(parseMarker("ground-space is a phrase"), undefined, "no colon, no marker");
  assert.equal(parseMarker("nothing here"), undefined);
  assert.deepEqual(parseMarker(" ground-space:   "), { marker: "ground-space", reason: "" });
  assert.deepEqual(parseMarker(" ground-space:  spaced  "), { marker: "ground-space", reason: "spaced" });
});

test("the offset table and its reader agree, so a reported line is the line to go and look at", () => {
  assert.deepEqual(lineStartOffsets(["ab", "c", "def"]), [0, 3, 5]);
  assert.deepEqual(lineStartOffsets([]), []);
  assert.deepEqual(lineStartOffsets([""]), [0]);
  const offsets = lineStartOffsets(["ab", "c", "def"]);
  assert.equal(lineAtOffset(offsets, 0), 1);
  assert.equal(lineAtOffset(offsets, 2), 1, "the newline still belongs to the line before it");
  assert.equal(lineAtOffset(offsets, 3), 2);
  assert.equal(lineAtOffset(offsets, 4), 2);
  assert.equal(lineAtOffset(offsets, 5), 3);
  assert.equal(lineAtOffset(offsets, 7), 3);
});

test("a site deep in a long file reports its OWN line — the binary search, end to end", () => {
  // A three-line fixture exercises no branch of a binary search. This walks a site down 40 lines of
  // varying length, which is the only way an off-by-one in the midpoint or the bounds shows up.
  for (const at of [1, 2, 7, 19, 20, 33, 40]) {
    const lines: string[] = [];
    for (let i = 1; i <= 40; i++) {
      if (i === at) lines.push("const d = Math.hypot(a.x - c.x, a.y - c.y);");
      else lines.push(i % 3 === 0 ? "" : `const pad${i} = ${"0".repeat(i)};`);
    }
    const v = scanGroundSpace("f.ts", `const c = hexCenter(h);\n${lines.join("\n")}\n`);
    assert.equal(v?.sites.length, 1, `one site expected with it at line ${at}`);
    // +1 for the `hexCenter` line the fixture opens with.
    assert.equal(v?.sites[0]?.line, at + 1, `the site at file line ${at + 1} must report ${at + 1}`);
    assert.equal(
      v?.sites[0]?.text,
      "const d = Math.hypot(a.x - c.x, a.y - c.y);",
      "and the reported TEXT must be that line's, which is a second reader of the same number",
    );
  }
});

test("splitSource: each quote character is recognised in its own right", () => {
  // Dropping any ONE of the three from the open-quote test leaves that kind of literal being read as
  // code. For the backtick that is nearly invisible — a template is kept verbatim anyway — until a
  // quote INSIDE it opens a string state that swallows the rest of the line.
  assert.deepEqual(codes('const t = `a"b`;'), ['const t = `a"b`;'], "a quote inside a template is template text");
  assert.deepEqual(codes("const t = `a'b`;"), ["const t = `a'b`;"]);
  assert.deepEqual(codes(`const s = "a'b";`), ['const s = "   ";'], "an apostrophe inside a double-quoted string is body");
});

test("splitSource: a backslash at the very end of a line consumes what is not there", () => {
  // The `?? ""` branch. Reached only when an escape is the last character on the line, which is a
  // real shape (a continued string literal) and the one place the machine can read past the end.
  assert.deepEqual(codes("const s = 'a\\"), ["const s = '   "], "an unpaired escape blanks BOTH its own slot and the one that is not there");
  assert.deepEqual(codes("const t = `a\\"), ["const t = `a\\"], "a template keeps the backslash it cannot pair");
});

// ---------------------------------------------------------------------------------------------
// 9. THE MATCHERS' EDGES — where an over-broad or over-narrow pattern would change the answer
// ---------------------------------------------------------------------------------------------
//
// Everything in this section is a pair of near-misses: a shape the rung MUST see and a shape it must
// NOT, differing by one character. They exist because the two ways this rung fails are symmetric —
// too narrow and it misses the next instance, too broad and someone excludes it — and both live in
// the regexes rather than in the logic around them.

test("the lattice matcher spans whitespace but not a longer identifier, and not a line break", () => {
  assert.equal(callsLattice("const p = hexCenter (h);"), true, "a space before the paren is still a call");
  assert.equal(callsLattice("const p = myhexCenter(h);"), false, "…but a longer identifier is a different function");
  // The scan joins the code lines back together with newlines. Joining with NOTHING would splice a
  // wrapped identifier into a call that was never written.
  assert.equal(callsLattice("const p = hexCente\nr(h);"), false, "a verb split across lines is not a call");
});

test("the hypot matcher spans whitespace but not a longer identifier", () => {
  const spaced = scanGroundSpace("f.ts", "const c = hexCenter(h);\nconst d = Math.hypot (a.x - c.x, a.y - c.y);\n");
  assert.equal(spaced?.sites.length, 1, "`Math.hypot (…)` with a space is the same call");
  const longer = scanGroundSpace("f.ts", "const c = hexCenter(h);\nconst d = Math.hypotenuse(a.x - c.x, a.y - c.y);\n");
  assert.equal(longer?.sites.length, 0, "…but `Math.hypotenuse` is not `Math.hypot`");
});

test("the 3D exclusion needs a REAL `.z`, and does not fire on a z buried in an identifier", () => {
  // Over-narrow: a `.z` with no space before it must still exclude. Over-broad: a `z` later inside a
  // neighbouring identifier must NOT, or a perfectly ordinary 2D distance goes unguarded because
  // someone named a variable `bz`.
  assert.equal(isPointDistance("a.x - b.x, a.y + a.z"), false, "a 3D component anywhere excludes it");
  assert.equal(isPointDistance("a.x-bz.x, a.y-bz.y"), true, "a `z` inside an identifier is not a `.z`");
});

test("`.x` / `.y` mean the MEMBER, not any identifier that happens to end in x or y", () => {
  assert.equal(isPointDistance("a.foox, a.y"), false, "`.foox` is not `.x`");
  assert.equal(isPointDistance("a.x, a.fooy"), false, "`.fooy` is not `.y`");
});

test("the member form needs BOTH coordinates, not either", () => {
  // `||` here would report every distance that mentions an `.x` — including honest 1D arithmetic —
  // and a rung that fires on honest code is a rung someone turns off.
  assert.equal(isPointDistance("a.x - b.x, c - d"), false);
  assert.equal(isPointDistance("c - d, a.y - b.y"), false);
  assert.equal(isPointDistance("a.x - b.x, a.y - b.y"), true);
});

test("the delta form is a WHOLE identifier ending in x paired with one ending in y", () => {
  assert.equal(isPointDistance("dx, dy"), true);
  assert.equal(isPointDistance(" dx, dy"), true, "leading whitespace from the split is trimmed off");
  assert.equal(isPointDistance("delta_x, delta_y"), true, "the middle of the name is ordinary word characters");
  assert.equal(isPointDistance("1dx, dy"), false, "it must be the WHOLE argument, anchored at the start…");
  assert.equal(isPointDistance("dxq, dy"), false, "…and at the end");
  // The y half carries the same two anchors, and is a SEPARATE regex that can lose either of them.
  assert.equal(isPointDistance("dx, 1dy"), false);
  assert.equal(isPointDistance("dx, dyq"), false);
  assert.equal(isPointDistance("dx, foo"), false, "both halves, or neither");
  assert.equal(isPointDistance("foo, dy"), false);
});

// ---------------------------------------------------------------------------------------------
// 10. THE REPORT SAYS WHAT HAPPENED — every field a reader acts on
// ---------------------------------------------------------------------------------------------
//
// A rung's output IS its interface: a message naming the wrong line, or dropping the source text, or
// calling a missing increment reference a missing "reason", sends the reader somewhere else. These
// pin the parts a human actually reads.

test("an unmarked site reports an empty reason, not a stand-in", () => {
  const v = scan("const d = Math.hypot(a.x - c.x, a.y - c.y);");
  assert.equal(v?.sites[0]?.marker, undefined);
  assert.equal(v?.sites[0]?.reason, "");
});

test("the reported source text is the offending line, trimmed", () => {
  const v = scanGroundSpace("f.ts", "const c = hexCenter(h);\n      const d = Math.hypot(a.x - c.x, a.y - c.y);\n");
  assert.equal(v?.sites[0]?.text, "const d = Math.hypot(a.x - c.x, a.y - c.y);", "indentation is stripped");
  const report = groundSpaceReport([{ path: "f.ts", source: "const c = hexCenter(h);\n      const d = Math.hypot(a.x - c.x, a.y - c.y);\n" }]);
  assert.match(report.failures[0] ?? "", /const d = Math\.hypot\(a\.x - c\.x, a\.y - c\.y\);/, "and the message SHOWS it");
});

test("a plain marked site is not a known defect — only a cited `screen-space-defect` is", () => {
  // The knownDefects list is the gate's running inventory of open work. Widening it to every marked
  // site would turn a clean file into a standing list of things that are not wrong.
  const v = scan("// ground-space: unprojected by the caller\nconst d = Math.hypot(a.x - c.x, a.y - c.y);");
  assert.equal(v?.sites.length, 1);
  assert.equal(v?.knownDefects.length, 0);
});

test("a known defect is reported with its file, line and reason", () => {
  const report = groundSpaceReport([
    {
      path: "apps/studio/src/components/TreeView.tsx",
      source: "const c = hexCenter(h);\n// screen-space-defect: studio-island-layout-moves-to-ground-space — a projected argmin\nconst d = Math.hypot(a.x - c.x, a.y - c.y);\n",
    },
  ]);
  assert.equal(report.failures.length, 0);
  assert.deepEqual(report.knownDefects, [
    "apps/studio/src/components/TreeView.tsx:3 — studio-island-layout-moves-to-ground-space — a projected argmin",
  ]);
});

test("an orphaned marker's message names the line and the marker that drifted", () => {
  const report = groundSpaceReport([{ path: "f.ts", source: "const c = hexCenter(h);\n// ground-space: a reason\nconst unrelated = 1;\n" }]);
  assert.deepEqual(report.failures, [
    "f.ts:2 — a `ground-space` marker no distance claims; it has drifted off its subject",
  ]);
});

test("a missing increment reference is named as such, not as a missing `reason`", () => {
  // The two failures want different fixes: one wants a sentence, the other wants an increment id.
  // Telling an author to "add a reason" when they wrote one is how a rung earns a reputation.
  const report = groundSpaceReport([{ path: "f.ts", source: "const c = hexCenter(h);\n// screen-space-defect: soon\nconst d = Math.hypot(a.x - c.x, a.y - c.y);\n" }]);
  assert.match(report.failures[0] ?? "", /`screen-space-defect` marker with no increment reference/);
});

test("a SHORT reason is fine on an ordinary marker — the id rule is the defect marker's alone", () => {
  // `hasReason` short-circuits for non-defect markers. Without that, "pointer slop" would be judged
  // against a pattern meant for increment ids, and honest one-word reasons would red the gate.
  const v = scan("// screen-space: slop\nconst d = Math.hypot(a.x - c.x, a.y - c.y);");
  assert.equal(v?.reasonless.length, 0);
});

test("a defect reference may be a bare increment id, with no prose around it", () => {
  // The id pattern must match the id ITSELF, not merely find punctuation followed by one — a
  // pattern anchored on a non-alphanumeric would accept every DASHED id in the repo while
  // rejecting an undashed one, which is a rule nobody could have guessed from the message.
  const v = scan("// screen-space-defect: studio-island-layout-moves-to-ground-space\nconst d = Math.hypot(a.x - c.x, a.y - c.y);");
  assert.equal(v?.reasonless.length, 0);
  assert.equal(v?.knownDefects.length, 1);
  const undashed = scan("// screen-space-defect: driftspot\nconst d = Math.hypot(a.x - c.x, a.y - c.y);");
  assert.equal(undashed?.reasonless.length, 0, "an id is a run of characters, not a run of dashes");
});
