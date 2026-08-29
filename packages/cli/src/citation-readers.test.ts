import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isScannable,
  isTestFile,
  parseCensus,
  reconcile,
  scanFile,
  formatVerdict,
} from "./citation-readers.js";

test("citation-readers-scan-finds-code-positions-not-prose", () => {
  const hits = scanFile(
    "a.ts",
    [
      "// the references list is provenance", // comment-only: prose
      " * carries `references` for the reader", // jsdoc continuation: prose
      "const refs = doc.references;", // property read
      "  references: z.array(z.string()),", // declaration
      "const { references } = doc;", // destructure
      'const v = bag["references"];', // string key
      "he referenced the decision", // a bare word, no code position
    ].join("\n"),
  );
  assert.deepEqual(
    hits.map((h) => h.line),
    [3, 4, 5, 6],
  );
});

test("citation-readers-scan-reports-one-indexed-lines-and-trimmed-text", () => {
  // The line number is what a reader opens the file at, and the text is what they match on; an
  // off-by-one or an untrimmed cell both make the census unusable without failing anything else.
  const hits = scanFile("a.ts", ["", "", "    const r = doc.references;   "].join("\n"));
  assert.deepEqual(hits, [{ file: "a.ts", line: 3, text: "const r = doc.references;" }]);
});

test("citation-readers-scan-matches-each-code-position-alternative-alone", () => {
  for (const line of [
    "doc.references",
    "references: string[]",
    "const { references } = d",
    "const { references, kind } = d",
    'd["references"]',
    "d['references']",
  ]) {
    assert.equal(scanFile("a.ts", line).length, 1, `should match: ${line}`);
  }
  for (const line of ["referencesOf(d)", "const referenced = 1", "see references below"]) {
    assert.equal(scanFile("a.ts", line).length, 0, `should NOT match: ${line}`);
  }
});

test("citation-readers-scan-splits-crlf-and-lf-alike", () => {
  // A CRLF checkout must not fold two readers into one line, nor leave a stray \r in the text.
  const hits = scanFile("a.ts", "doc.references;\r\nother.references;\r\n");
  assert.deepEqual(
    hits.map((h) => ({ line: h.line, text: h.text })),
    [
      { line: 1, text: "doc.references;" },
      { line: 2, text: "other.references;" },
    ],
  );
});

test("citation-readers-scan-skips-comment-only-lines", () => {
  // A comment mentioning the field in a code-looking way must not count as a reader — the census
  // would then carry rows nothing reads, and a step-4 session would chase them.
  const hits = scanFile(
    "b.ts",
    ["// doc.references is gone", ' * bag["references"] was the carrier', "  /* references: x */"].join("\n"),
  );
  assert.equal(hits.length, 0);
});

test("citation-readers-scan-keeps-a-trailing-comment-on-a-real-code-line", () => {
  // Only a line that is ONLY a comment is prose. Code with a trailing comment is still a reader.
  const hits = scanFile("b.ts", "const r = doc.references; // the citation list");
  assert.equal(hits.length, 1);
});

test("citation-readers-test-files-are-counted-not-classified", () => {
  for (const f of [
    "packages/cli/src/foo.test.ts",
    "packages/cli/src/foo.test.tsx",
    "packages/cli/src/foo.test.mts",
    "packages/x/src/a.uat.test.ts",
    "packages/x/src/a.spec.ts",
    "packages/library/src/fixture/corpus.ts",
    "fixture/top-level.ts",
  ]) {
    assert.equal(isTestFile(f), true, `should be a test file: ${f}`);
  }
  for (const f of [
    "packages/cli/src/commands.ts",
    "packages/cli/src/mytest.ts", // no dot before `test`
    "packages/cli/src/foo.test.js", // not a scanned extension
    "packages/cli/src/foo.test.ts.bak", // the anchor: not the end of the name
    "packages/cli/src/fixtures/a.ts", // `fixtures/`, not `fixture/`
    "packages/cli/src/prefixture/a.ts", // must be a whole path segment
  ]) {
    assert.equal(isTestFile(f), false, `should NOT be a test file: ${f}`);
  }
});

test("citation-readers-scannable-covers-runtime-surfaces-only", () => {
  for (const f of ["a.ts", "b.tsx", "c.mts", "d.mjs", "e.sql"]) {
    assert.equal(isScannable(f), true, `should be scannable: ${f}`);
  }
  for (const f of ["a.md", "b.json", "c.png", "d.cts", "e.js", "a.ts.bak"]) {
    assert.equal(isScannable(f), false, `should NOT be scannable: ${f}`);
  }
});

test("citation-readers-parse-census-reads-path-and-last-cell-disposition", () => {
  const entries = parseCensus(
    [
      "# heading",
      "| file | what it does | disposition |",
      "| --- | --- | --- |",
      "| `packages/cli/src/commands.ts` | the Sources block | retire |",
      "| `apps/studio/src/types.ts` | the wire type | remove |",
      "| not-a-path | prose row | ignored |",
      "| measure | value |",
    ].join("\n"),
  );
  // The disposition is the LAST cell, not the second — the table has a middle column.
  assert.deepEqual(entries, [
    { file: "packages/cli/src/commands.ts", disposition: "retire" },
    { file: "apps/studio/src/types.ts", disposition: "remove" },
  ]);
});

test("citation-readers-parse-census-takes-the-first-spelling-of-a-repeated-path", () => {
  // A path listed twice must not yield two rows: `resolved` counts census rows, so a duplicate
  // would inflate it and read as a reader that was retired twice.
  const entries = parseCensus(
    ["| `a/b.ts` | first | retire |", "| `a/b.ts` | second | remove |"].join("\n"),
  );
  assert.deepEqual(entries, [{ file: "a/b.ts", disposition: "retire" }]);
});

test("citation-readers-parse-census-accepts-an-indented-row-and-rejects-a-one-cell-row", () => {
  assert.deepEqual(parseCensus("   | `a/b.ts` | what | retire |"), [
    { file: "a/b.ts", disposition: "retire" },
  ]);
  // One cell cannot be both the path and the disposition.
  assert.deepEqual(parseCensus("| `a/b.ts` |"), []);
  assert.deepEqual(parseCensus("|"), []);
  assert.deepEqual(parseCensus("no pipe at all"), []);
});

test("citation-readers-parse-census-strips-backticks-and-surrounding-space", () => {
  assert.deepEqual(parseCensus("|   `a/b.ts`   |  x  |   retire   |"), [
    { file: "a/b.ts", disposition: "retire" },
  ]);
});

test("citation-readers-uncensused-production-reader-fails", () => {
  // The failure condition the whole verb exists for: a reader in the tree the census does not name.
  const v = reconcile(
    [{ file: "packages/cli/src/new-thing.ts", line: 1, text: "doc.references" }],
    [{ file: "packages/cli/src/commands.ts", disposition: "retire" }],
  );
  assert.equal(v.ok, false);
  assert.deepEqual(v.uncensused, ["packages/cli/src/new-thing.ts"]);
  assert.match(formatVerdict(v), /UNCENSUSED READERS/);
});

test("citation-readers-a-test-file-hit-never-fails-the-verdict", () => {
  const v = reconcile([{ file: "packages/cli/src/a.test.ts", line: 1, text: "doc.references" }], []);
  assert.equal(v.ok, true);
  assert.deepEqual(v.tests, ["packages/cli/src/a.test.ts"]);
  assert.deepEqual(v.production, []);
});

test("citation-readers-retired-reader-reports-resolved-not-failed", () => {
  // The expected end state once the arc closes: every census row resolved, nothing uncensused.
  const v = reconcile([], [{ file: "packages/cli/src/commands.ts", disposition: "retire" }]);
  assert.equal(v.ok, true);
  assert.deepEqual(v.resolved, ["packages/cli/src/commands.ts"]);
});

test("citation-readers-many-hits-in-one-file-are-one-reader", () => {
  // Files, not hits, are the census's unit — three hits in one file is one row to dispose of.
  const v = reconcile(
    [
      { file: "z.ts", line: 9, text: "doc.references" },
      { file: "z.ts", line: 2, text: "doc.references" },
    ],
    [],
  );
  assert.deepEqual(v.production, ["z.ts"]);
  assert.deepEqual(v.uncensused, ["z.ts"]);
});

test("citation-readers-verdict-lists-are-sorted", () => {
  // A stable order is what makes two runs comparable; unsorted output turns any re-run into a diff.
  const v = reconcile(
    [
      { file: "c.ts", line: 1, text: "doc.references" },
      { file: "a.ts", line: 1, text: "doc.references" },
      { file: "b.test.ts", line: 1, text: "doc.references" },
      { file: "a.test.ts", line: 1, text: "doc.references" },
    ],
    [{ file: "z/gone.ts", disposition: "retire" }, { file: "m/gone.ts", disposition: "retire" }],
  );
  assert.deepEqual(v.production, ["a.ts", "c.ts"]);
  assert.deepEqual(v.tests, ["a.test.ts", "b.test.ts"]);
  assert.deepEqual(v.uncensused, ["a.ts", "c.ts"]);
  assert.deepEqual(v.resolved, ["m/gone.ts", "z/gone.ts"]);
});

test("citation-readers-a-censused-reader-still-carrying-a-hit-is-neither-uncensused-nor-resolved", () => {
  // The ordinary mid-arc state: the census names it and the code still reads the field.
  const v = reconcile(
    [{ file: "a.ts", line: 1, text: "doc.references" }],
    [{ file: "a.ts", disposition: "retire" }],
  );
  assert.equal(v.ok, true);
  assert.deepEqual(v.uncensused, []);
  assert.deepEqual(v.resolved, []);
});

test("citation-readers-empty-scan-and-empty-census-is-ok", () => {
  const v = reconcile([], []);
  assert.equal(v.ok, true);
  assert.deepEqual(v.production, []);
  assert.deepEqual(v.tests, []);
});

test("citation-readers-verdict-states-its-own-limit", () => {
  // The caveat is load-bearing, not decoration: a lexical scan reported as a completeness proof is
  // how a step-4 session concludes it is safe when it is not.
  const v = reconcile([], []);
  const text = formatVerdict(v);
  assert.match(text, /FLOOR on the census, not a proof/);
  assert.match(text, /ADR-0477 D3 step 1/);
});

test("citation-readers-verdict-counts-are-the-scanned-populations", () => {
  const v = reconcile(
    [
      { file: "a.ts", line: 1, text: "doc.references" },
      { file: "b.test.ts", line: 1, text: "doc.references" },
    ],
    [{ file: "a.ts", disposition: "retire" }, { file: "gone.ts", disposition: "retire" }],
  );
  const text = formatVerdict(v);
  assert.match(text, /production readers scanned\s+: 1/);
  assert.match(text, /census rows\s+: 2/);
  assert.match(text, /test files \(counted only\)\s+: 1/);
  assert.match(text, /UNCENSUSED\s+: 0/);
  assert.match(text, /resolved \(no hit any more\)\s+: 1/);
  assert.match(text, /✓ gone\.ts/);
  assert.doesNotMatch(text, /UNCENSUSED READERS/);
});

test("citation-readers-word-boundaries-keep-lookalike-identifiers-out", () => {
  // The `\b` anchors are what stop the scan reporting neighbours of the field as readers. Without
  // them the census fills with rows nothing reads, and a step-4 session spends its time on them.
  for (const line of ["doc.referencesOf(x)", "const myreferences: string[] = []", "obj.crossReferences"]) {
    assert.equal(scanFile("a.ts", line).length, 0, `should NOT match: ${line}`);
  }
  // …while the real spellings still match, so the anchors are not simply refusing everything.
  for (const line of ["doc.references", "references: string[]"]) {
    assert.equal(scanFile("a.ts", line).length, 1, `should match: ${line}`);
  }
});

test("citation-readers-parse-census-needs-a-row-that-STARTS-with-a-pipe", () => {
  // Prose containing pipes is not a table row. Without the leading-pipe guard this line yields a
  // spurious census entry, which reads as a reader being accounted for when it never was.
  assert.deepEqual(parseCensus("x | a/b.ts | retire | y"), []);
  // A row that starts with a pipe but does not end with one is still a row — the guard is on the
  // START, and testing the end instead would accept the prose line above.
  assert.deepEqual(parseCensus("| a/b.ts | retire | x"), [{ file: "a/b.ts", disposition: "retire" }]);
});

test("citation-readers-parse-census-accepts-a-two-cell-row", () => {
  // Two cells is the minimum a census row can be: the path and its disposition.
  assert.deepEqual(parseCensus("| a/b.ts | retire |"), [{ file: "a/b.ts", disposition: "retire" }]);
});

test("citation-readers-parse-census-trims-inside-stripped-backticks", () => {
  // The cell is trimmed before the backticks come off, so space INSIDE them survives that pass and
  // would leave a path no scan can ever match.
  assert.deepEqual(parseCensus("| ` a/b.ts ` | x | retire |"), [
    { file: "a/b.ts", disposition: "retire" },
  ]);
});

test("citation-readers-format-verdict-renders-the-failing-report-exactly", () => {
  // The expected text is written out by hand rather than derived from the function: an expectation
  // computed from its own subject cannot fail (`an-expectation-derived-from-its-subject-cannot-fail`).
  const v = reconcile(
    [{ file: "packages/cli/src/new.ts", line: 1, text: "doc.references" }],
    [{ file: "packages/cli/src/old.ts", disposition: "retire" }],
  );
  assert.equal(
    formatVerdict(v),
    [
      "probe:citation-readers — readers of the `references` field (ADR-0477 D3 step 1)",
      "",
      "  production readers scanned : 1",
      "  census rows                : 1",
      "  test files (counted only)  : 0",
      "  UNCENSUSED                 : 1",
      "  resolved (no hit any more) : 1",
      "",
      "UNCENSUSED READERS — the census is stale and step 4 is NOT safe:",
      "  ✗ packages/cli/src/new.ts",
      "",
      "resolved — named by the census, no code-position hit remains:",
      "  ✓ packages/cli/src/old.ts",
      "",
      "This scan is a FLOOR on the census, not a proof of it: it is lexical, so it cannot see a\n" +
        "reader that reaches the field through a computed key or an untyped record walk, and it cannot\n" +
        "tell the library field from an unrelated property of the same name. Walk the census's own\n" +
        "dispositions before removing anything.",
    ].join("\n"),
  );
});

test("citation-readers-format-verdict-omits-both-lists-when-there-is-nothing-to-list", () => {
  // The clean-run shape: neither heading appears, so a green report cannot be misread as carrying
  // an empty failure list.
  const v = reconcile(
    [{ file: "a.ts", line: 1, text: "doc.references" }],
    [{ file: "a.ts", disposition: "retire" }],
  );
  assert.equal(
    formatVerdict(v),
    [
      "probe:citation-readers — readers of the `references` field (ADR-0477 D3 step 1)",
      "",
      "  production readers scanned : 1",
      "  census rows                : 1",
      "  test files (counted only)  : 0",
      "  UNCENSUSED                 : 0",
      "  resolved (no hit any more) : 0",
      "",
      "This scan is a FLOOR on the census, not a proof of it: it is lexical, so it cannot see a\n" +
        "reader that reaches the field through a computed key or an untyped record walk, and it cannot\n" +
        "tell the library field from an unrelated property of the same name. Walk the census's own\n" +
        "dispositions before removing anything.",
    ].join("\n"),
  );
});

test("citation-readers-code-position-tolerates-any-spacing", () => {
  // Real code spells these several ways; a pattern demanding one exact spacing silently misses
  // readers, and a missed reader is precisely what the census exists to prevent.
  for (const line of [
    "references:string[]", // no space before the colon
    "references   : string[]", // several
    "{references}", // destructure, no spaces
    "{references,kind}", // destructure with a sibling, no spaces
    "{ references , kind }", // spaces everywhere
  ]) {
    assert.equal(scanFile("a.ts", line).length, 1, `should match: ${line}`);
  }
});

test("citation-readers-parse-census-distinguishes-no-cells-from-one-cell", () => {
  // Two different malformed rows, two different guards. A row with no cells at all…
  assert.deepEqual(parseCensus("|"), []);
  // …and a row with exactly one, where that cell would have to be both path and disposition.
  assert.deepEqual(parseCensus("| a/b.ts |"), []);
  // Two cells is the first shape that carries both.
  assert.deepEqual(parseCensus("| a/b.ts | retire |"), [{ file: "a/b.ts", disposition: "retire" }]);
});
