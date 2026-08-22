import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  areaOf,
  isTestFile,
  locationsForRule,
  readDiagnostics,
  readSite,
  sampleSites,
  type SiteLocation,
} from "./lint-panel-sites.js";

const diagnostic = (code: string, filename: string, line: number) => ({
  code,
  filename,
  labels: [{ span: { offset: 0, length: 4, line, column: 1 } }],
});

void test("readDiagnostics accepts both the wrapped and bare-array report shapes", () => {
  const bare = readDiagnostics(JSON.stringify([diagnostic("anti-slop(x)", "a.ts", 1)]));
  const wrapped = readDiagnostics(
    JSON.stringify({ diagnostics: [diagnostic("anti-slop(x)", "a.ts", 1)] }),
  );
  assert.equal(bare.length, 1);
  assert.equal(wrapped.length, 1);
  assert.deepEqual(readDiagnostics(JSON.stringify({ other: 1 })), []);
});

void test("locationsForRule keeps only the named rule and normalises Windows separators", () => {
  const diagnostics = readDiagnostics(
    JSON.stringify([
      diagnostic("anti-slop(no-unsafe-dictionary-type)", "packages\\cli\\src\\a.ts", 4),
      diagnostic("eslint(no-unused-vars)", "packages/cli/src/b.ts", 9),
      diagnostic("anti-slop(no-unsafe-dictionary-type)", "apps/studio/src/c.ts", 7),
    ]),
  );
  const found = locationsForRule(diagnostics, "anti-slop/no-unsafe-dictionary-type");
  assert.equal(found.length, 2);
  assert.deepEqual(
    found.map((f) => f.file),
    ["packages/cli/src/a.ts", "apps/studio/src/c.ts"],
  );
});

void test("locationsForRule drops diagnostics with no usable span", () => {
  const found = locationsForRule(
    [{ code: "anti-slop(rule)", filename: "a.ts", labels: [] }, { code: "anti-slop(rule)" }],
    "anti-slop/rule",
  );
  assert.deepEqual(found, []);
});

void test("areaOf groups at two segments", () => {
  assert.equal(areaOf("packages/library/src/deep/thing.ts"), "packages/library");
  assert.equal(areaOf("apps/studio/server/api.ts"), "apps/studio");
});

/**
 * The reason sampling exists at all: a head-of-list sample of this rule would be one directory. The
 * assertion is on the SPREAD, so it goes red if the round-robin is ever replaced by a slice.
 */
void test("sampling spreads across areas rather than draining the densest one", () => {
  const locations: SiteLocation[] = [];
  for (let i = 0; i < 40; i += 1) {
    locations.push({ file: "packages/cli/src/big.ts", line: i + 1, offset: i, length: 3 });
  }
  locations.push({ file: "packages/storage-protocol/src/store.ts", line: 5, offset: 0, length: 3 });
  locations.push({ file: "apps/studio/src/panel.tsx", line: 9, offset: 0, length: 3 });

  const picked = sampleSites(locations, { limit: 6, contextLines: 2 });
  assert.equal(picked.length, 6);
  const areas = new Set(picked.map((p) => areaOf(p.file)));
  assert.equal(areas.size, 3, "all three areas must be represented, not just the dense one");
});

/**
 * The regression this rule exists for, and it was a REAL sample, not a hypothetical: alphabetical
 * area order plus round-robin reaches only the alphabetically-first areas, so `storage-protocol` —
 * the seam carrying the strongest architectural case AGAINST the rule this lane adjudicated — was
 * silently absent from the first packet built. Ordering by density is what puts it back.
 */
void test("a sparse but architecturally central area is not lost behind alphabetically-earlier ones", () => {
  const locations: SiteLocation[] = [];
  // Many areas that sort BEFORE "packages/storage-protocol" alphabetically.
  for (const area of ["apps/aa", "apps/bb", "packages/cc", "packages/dd", "packages/ee"]) {
    for (let i = 0; i < 30; i += 1) {
      locations.push({ file: `${area}/src/f${String(i)}.ts`, line: 1, offset: 0, length: 3 });
    }
  }
  // The dense area the rule really lives in, plus the sparse seam that matters.
  for (let i = 0; i < 60; i += 1) {
    locations.push({ file: `packages/zz/src/f${String(i)}.ts`, line: 1, offset: 0, length: 3 });
  }
  for (let i = 0; i < 5; i += 1) {
    locations.push({
      file: `packages/storage-protocol/src/f${String(i)}.ts`,
      line: 1,
      offset: 0,
      length: 3,
    });
  }
  const picked = sampleSites(locations, { limit: 7, contextLines: 2 });
  const areas = [...new Set(picked.map((p) => areaOf(p.file)))];
  assert.equal(areas[0], "packages/zz", "the densest area leads");
  assert.ok(
    areas.includes("packages/storage-protocol"),
    `sparse seam missing from the sample: ${areas.join(", ")}`,
  );
});

void test("test files are recognised so a panel is not shown code held to a different bar", () => {
  assert.ok(isTestFile("packages/cli/src/a.test.ts"));
  assert.ok(isTestFile("apps/studio/src/b.test.tsx"));
  assert.ok(isTestFile("packages/drive/src/c.test.mts"));
  assert.ok(isTestFile("apps/desktop/e2e/launch.mjs"));
  assert.ok(!isTestFile("packages/cli/src/a.ts"));
  assert.ok(!isTestFile("packages/cli/definition-injection.d.mts"));
  assert.ok(!isTestFile("packages/cli/src/latest.ts"));
});

void test("sampling spreads across files within one area too", () => {
  const locations: SiteLocation[] = [];
  for (let i = 0; i < 10; i += 1) {
    locations.push({ file: "packages/cli/src/a.ts", line: i + 1, offset: i, length: 3 });
  }
  locations.push({ file: "packages/cli/src/b.ts", line: 1, offset: 0, length: 3 });
  locations.push({ file: "packages/cli/src/c.ts", line: 1, offset: 0, length: 3 });
  const picked = sampleSites(locations, { limit: 3, contextLines: 2 });
  assert.equal(new Set(picked.map((p) => p.file)).size, 3);
});

void test("sampling is deterministic and never exceeds what the report holds", () => {
  const locations: SiteLocation[] = [
    { file: "packages/cli/src/a.ts", line: 1, offset: 0, length: 3 },
    { file: "apps/studio/src/b.ts", line: 2, offset: 0, length: 3 },
  ];
  const first = sampleSites(locations, { limit: 10, contextLines: 2 });
  const again = sampleSites(locations, { limit: 10, contextLines: 2 });
  assert.deepEqual(first, again);
  assert.equal(first.length, 2, "a limit above the population must not loop forever or pad");
});

/**
 * The span is a BYTE offset. Sliced as a UTF-16 string it lands somewhere else entirely, and every
 * non-ASCII character before it widens the gap — which in this codebase means every em-dash in every
 * comment. Caught by the judges on the first panel run of `anti-slop-adoption-arc` inc-04, one of
 * whom held the resulting nonsense excerpts against the RULE rather than against the tool.
 *
 * The em-dash below is the whole test: remove it and both slicings agree.
 */
void test("the flagged span is read as BYTES — a multi-byte character before it must not shift the excerpt", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lint-panel-utf8-"));
  const body = [
    "// an em-dash — and another — before the construct",
    "// a second comment line — with more of them —",
    "const x: Record<string, unknown> = {};",
  ].join("\n");
  writeFileSync(path.join(root, "a.ts"), body, "utf8");

  const bytes = Buffer.from(body, "utf8");
  const offset = bytes.indexOf(Buffer.from("Record<string, unknown>", "utf8"));
  const length = Buffer.byteLength("Record<string, unknown>", "utf8");
  assert.notEqual(offset, body.indexOf("Record<string, unknown>"), "the two indexings must differ");

  const site = readSite(root, { file: "a.ts", line: 3, offset, length }, 1);
  assert.equal(site.flagged, "Record<string, unknown>");
});

void test("readSite extracts the flagged span and the surrounding lines", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lint-panel-"));
  mkdirSync(path.join(root, "pkg"), { recursive: true });
  const body = ["line one", "line two", "const x: Record<string, unknown> = {};", "line four"].join(
    "\n",
  );
  writeFileSync(path.join(root, "pkg", "a.ts"), body, "utf8");
  const offset = body.indexOf("Record<string, unknown>");
  const site = readSite(
    root,
    { file: "pkg/a.ts", line: 3, offset, length: "Record<string, unknown>".length },
    1,
  );
  assert.equal(site.flagged, "Record<string, unknown>");
  assert.equal(site.line, 3);
  assert.ok(site.context.includes("line two"));
  assert.ok(site.context.includes("line four"));
  assert.ok(!site.context.includes("line one"), "context must respect the requested window");
});
