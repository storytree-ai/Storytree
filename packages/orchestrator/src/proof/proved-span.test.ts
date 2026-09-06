/**
 * ADR-0534 — the proved-span compute: what a `--real` verdict binds.
 *
 *   (a) `changedRangesByFile` reads `git diff --unified=0` into NEW-side ranges; deletions are a
 *       neighbourhood, removed files are omitted.
 *   (b) `topLevelStatements` names what a symbol anchor can re-locate and marks wiring as ignorable.
 *   (c) `provedSpans`: net-new file → one symbol anchor per declaration; an edit inside one function
 *       → that function only; an import-only or comment-only change → nothing; an unnamed changed
 *       statement or a non-TypeScript file → file grain; overloads → the first declaration's text.
 *   (d) determinism: the same inputs bind the same unit hash, and the order is path-then-position.
 *   (e) `computeProvedBinding` end to end over a REAL temporary git repo — base commit, an edit,
 *       a second commit — with anchors that re-hash from the committed bytes; nothing staged, or an
 *       equal base/head, binds nothing; a git failure yields `undefined` rather than a throw.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { hashSpan } from "./anchor-compute.js";
import {
  changedRangesByFile,
  computeProvedBinding,
  provedSpans,
  topLevelStatements,
} from "./proved-span.js";

const execFileP = promisify(execFile);

// ── (a) diff parsing ─────────────────────────────────────────────────────────────────────────────

test("(a) changedRangesByFile: new-side ranges per file; deletions become a neighbourhood; removed files are omitted", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -3 +3 @@",
    "-old",
    "+new",
    "@@ -10,2 +10,4 @@",
    "+x",
    "+y",
    "@@ -20,3 +21,0 @@",
    "-gone",
    "-gone",
    "-gone",
    "diff --git a/src/gone.ts b/src/gone.ts",
    "--- a/src/gone.ts",
    "+++ /dev/null",
    "@@ -1,5 +0,0 @@",
    "-everything",
    "diff --git a/src/new.ts b/src/new.ts",
    "--- /dev/null",
    "+++ b/src/new.ts",
    "@@ -0,0 +1,2 @@",
    "+a",
    "+b",
    "",
  ].join("\n");
  const ranges = changedRangesByFile(diff);
  assert.deepEqual(ranges.get("src/a.ts"), [
    { start: 3, end: 3 },
    { start: 10, end: 13 },
    { start: 21, end: 22 },
  ]);
  assert.equal(ranges.has("src/gone.ts"), false, "a deleted file has no new side");
  assert.deepEqual(ranges.get("src/new.ts"), [{ start: 1, end: 2 }]);
});

// ── (b) statements ───────────────────────────────────────────────────────────────────────────────

const SOURCE = [
  'import { x } from "./x.js";', // 1  ignorable
  "", // 2
  "/** doc */", // 3  (leading trivia — not part of the statement)
  "export interface Shape {", // 4
  "  id: string;", // 5
  "}", // 6
  "", // 7
  "export const LIMIT = 3;", // 8
  "", // 9
  "export function area(s: Shape): number {", // 10
  "  return s.id.length * LIMIT;", // 11
  "}", // 12
  "", // 13
  'export { x } from "./x.js";', // 14 ignorable
  "", // 15
  "export default area;", // 16 unnamed (ExportAssignment)
  "",
].join("\n");

test("(b) topLevelStatements: names, line spans without leading trivia, and the three bindings", () => {
  const stmts = topLevelStatements(SOURCE, "src/s.ts");
  assert.deepEqual(
    stmts.map((s) => [s.name, s.binding, s.startLine, s.endLine]),
    [
      [undefined, "ignorable", 1, 1],
      ["Shape", "named", 4, 6],
      ["LIMIT", "named", 8, 8],
      ["area", "named", 10, 12],
      [undefined, "ignorable", 14, 14],
      [undefined, "unnamed", 16, 16],
    ],
  );
  assert.equal(stmts[1]?.text, "export interface Shape {\n  id: string;\n}", "text excludes the doc comment");
});

// ── (c) span selection ───────────────────────────────────────────────────────────────────────────

const NET_NEW = [
  "export interface Shape {",
  "  id: string;",
  "}",
  "export function area(s: Shape): number {",
  "  return s.id.length;",
  "}",
  "",
].join("\n");

test("(c1) a net-new file binds one symbol anchor per top-level declaration, in source order", () => {
  const spans = provedSpans([{ path: "src/n.ts", text: NET_NEW, ranges: [{ start: 1, end: 6 }] }], "c0ffee");
  assert.ok(spans !== undefined);
  assert.deepEqual(
    spans.anchors.map((a) => [a.file, a.symbol, a.boundCommit]),
    [
      ["src/n.ts", "Shape", "c0ffee"],
      ["src/n.ts", "area", "c0ffee"],
    ],
  );
  assert.equal(spans.anchors[0]?.boundHash, hashSpan("export interface Shape {\n  id: string;\n}"));
  assert.equal(spans.anchors[1]?.boundHash, hashSpan("export function area(s: Shape): number {\n  return s.id.length;\n}"));
  assert.equal(
    spans.boundHash,
    hashSpan(["export interface Shape {\n  id: string;\n}", "export function area(s: Shape): number {\n  return s.id.length;\n}"].join("\n")),
    "the unit hash is hashSpan over the anchored spans joined in order",
  );
});

test("(c2) an edit inside one function binds THAT function only — not its neighbours, not the file", () => {
  const spans = provedSpans([{ path: "src/s.ts", text: SOURCE, ranges: [{ start: 11, end: 11 }] }], "c0ffee");
  assert.ok(spans !== undefined);
  assert.deepEqual(spans.anchors.map((a) => a.symbol), ["area"]);
  assert.equal(spans.anchors[0]?.boundHash, hashSpan("export function area(s: Shape): number {\n  return s.id.length * LIMIT;\n}"));
});

test("(c3) an import-only change, or a change in leading trivia, binds nothing", () => {
  assert.equal(provedSpans([{ path: "src/s.ts", text: SOURCE, ranges: [{ start: 1, end: 1 }] }], "c0ffee"), undefined);
  assert.equal(provedSpans([{ path: "src/s.ts", text: SOURCE, ranges: [{ start: 3, end: 3 }] }], "c0ffee"), undefined);
  assert.equal(provedSpans([{ path: "src/s.ts", text: SOURCE, ranges: [] }], "c0ffee"), undefined);
});

test("(c4) a changed UNNAMED statement widens that file to file grain (no symbol), and a non-TypeScript file is file grain always", () => {
  const widened = provedSpans(
    [{ path: "src/s.ts", text: SOURCE, ranges: [{ start: 11, end: 11 }, { start: 16, end: 16 }] }],
    "c0ffee",
  );
  assert.ok(widened !== undefined);
  assert.deepEqual(widened.anchors.map((a) => [a.file, a.symbol]), [["src/s.ts", undefined]]);
  assert.equal(widened.anchors[0]?.boundHash, hashSpan(SOURCE));

  const sql = "CREATE TABLE t (id int);\n";
  const other = provedSpans([{ path: "db/schema.sql", text: sql, ranges: [{ start: 1, end: 1 }] }], "c0ffee");
  assert.ok(other !== undefined);
  assert.deepEqual(other.anchors, [{ file: "db/schema.sql", boundHash: hashSpan(sql), boundCommit: "c0ffee" }]);
});

test("(c5) overloads: a change to a later declaration of a name binds the FIRST declaration's text, once", () => {
  const text = [
    "export function f(a: string): void;", // 1
    "export function f(a: number): void;", // 2
    "export function f(a: unknown): void {", // 3
    "  void a;", // 4
    "}", // 5
    "",
  ].join("\n");
  const spans = provedSpans([{ path: "src/o.ts", text, ranges: [{ start: 4, end: 4 }] }], "c0ffee");
  assert.ok(spans !== undefined);
  assert.deepEqual(spans.anchors.map((a) => a.symbol), ["f"]);
  assert.equal(spans.anchors[0]?.boundHash, hashSpan("export function f(a: string): void;"));
});

// ── (d) determinism and order ────────────────────────────────────────────────────────────────────

test("(d) the same inputs bind the same unit hash; anchors order by path then position regardless of input order", () => {
  const files = [
    { path: "src/z.ts", text: NET_NEW, ranges: [{ start: 1, end: 6 }] },
    { path: "src/a.ts", text: SOURCE, ranges: [{ start: 11, end: 11 }, { start: 5, end: 5 }] },
  ];
  const one = provedSpans(files, "c0ffee");
  const two = provedSpans([...files].reverse(), "c0ffee");
  assert.ok(one !== undefined && two !== undefined);
  assert.equal(one.boundHash, two.boundHash);
  assert.deepEqual(
    one.anchors.map((a) => `${a.file}#${a.symbol}`),
    ["src/a.ts#Shape", "src/a.ts#area", "src/z.ts#Shape", "src/z.ts#area"],
  );
});

// ── (e) end to end over a real git repo ──────────────────────────────────────────────────────────

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileP("git", args, { cwd });
  return stdout;
}

const GIT_IDENTITY = ["-c", "user.name=proved-span-test", "-c", "user.email=proved-span@test.invalid"];

async function withRepo(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "proved-span-"));
  try {
    await git(["init", "-q"], root);
    await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function commitAll(root: string, message: string): Promise<string> {
  await git(["add", "-A"], root);
  await git([...GIT_IDENTITY, "commit", "-q", "-m", message], root);
  return (await git(["rev-parse", "HEAD"], root)).trim();
}

test("(e1) computeProvedBinding over a real repo: an edit inside one function binds that function at the attested commit", async () => {
  await withRepo(async (root) => {
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src/s.ts"), SOURCE);
    await fs.writeFile(path.join(root, "src/s.test.ts"), "// test\n");
    const base = await commitAll(root, "base");

    const edited = SOURCE.replace("return s.id.length * LIMIT;", "return s.id.length * LIMIT + 1;");
    await fs.writeFile(path.join(root, "src/s.ts"), edited);
    await fs.writeFile(path.join(root, "src/s.test.ts"), "// test edited too\n");
    const head = await commitAll(root, "leaf");

    // The caller passes IMPLEMENT-scope files only — the test file is not bound even though it changed.
    const binding = await computeProvedBinding({ workspace: root, baseSha: base, headSha: head, files: ["src/s.ts"] });
    assert.ok(binding !== undefined);
    assert.deepEqual(binding.anchors?.map((a) => [a.file, a.symbol, a.boundCommit]), [["src/s.ts", "area", head]]);
    const committed = await git(["show", `${head}:src/s.ts`], root);
    const area = topLevelStatements(committed, "src/s.ts").find((s) => s.name === "area");
    assert.ok(area !== undefined);
    assert.equal(binding.anchors?.[0]?.boundHash, hashSpan(area.text), "the anchor hashes the COMMITTED bytes");
    assert.equal(binding.boundHash, hashSpan(area.text));
  });
});

test("(e2) a net-new file binds every declaration; a file that was not staged is not bound", async () => {
  await withRepo(async (root) => {
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src/other.ts"), "export const other = 1;\n");
    const base = await commitAll(root, "base");
    await fs.writeFile(path.join(root, "src/n.ts"), NET_NEW);
    const head = await commitAll(root, "leaf");
    const binding = await computeProvedBinding({
      workspace: root,
      baseSha: base,
      headSha: head,
      files: ["src/n.ts", "src/other.ts"],
    });
    assert.ok(binding !== undefined);
    assert.deepEqual(binding.anchors?.map((a) => `${a.file}#${a.symbol}`), ["src/n.ts#Shape", "src/n.ts#area"]);
  });
});

test("(e3) nothing to bind: no files, or base == head, or only a test file changed → undefined, never a throw", async () => {
  await withRepo(async (root) => {
    await fs.writeFile(path.join(root, "a.ts"), "export const a = 1;\n");
    const base = await commitAll(root, "base");
    assert.equal(await computeProvedBinding({ workspace: root, baseSha: base, headSha: base, files: ["a.ts"] }), undefined);
    assert.equal(await computeProvedBinding({ workspace: root, baseSha: base, headSha: "0000000", files: [] }), undefined);
    // A git failure (unknown commit) is reported, not thrown: the verdict signs unbound.
    const errors: string[] = [];
    const original = console.error;
    console.error = (msg: string) => {
      errors.push(String(msg));
    };
    try {
      assert.equal(
        await computeProvedBinding({ workspace: root, baseSha: base, headSha: "0000000000000000000000000000000000000000", files: ["a.ts"] }),
        undefined,
      );
    } finally {
      console.error = original;
    }
    assert.equal(errors.length, 1);
    assert.match(errors[0] ?? "", /signs UNBOUND/);
  });
});
