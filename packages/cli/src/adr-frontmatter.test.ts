import { test } from "node:test";
import assert from "node:assert/strict";

import { parseAdrFrontmatter } from "./adr-frontmatter.js";

const FILE = "0042-example-decision.md";

function doc(frontmatter: string): string {
  return `---\n${frontmatter}\n---\n\n# ADR-0042: Example\n`;
}

test("parses status, decided, and outgoing edges", () => {
  const meta = parseAdrFrontmatter(
    FILE,
    doc("status: accepted\ndecided: 2026-06-12\nsupersedes: [14]\nsupersedes_in_part: [1, 11]\namends: [30]"),
  );
  assert.equal(meta.number, 42);
  assert.equal(meta.file, FILE);
  assert.equal(meta.status, "accepted");
  assert.equal(meta.decided, "2026-06-12");
  assert.deepEqual(meta.supersedes, [14]);
  assert.deepEqual(meta.supersedesInPart, [1, 11]);
  assert.deepEqual(meta.amends, [30]);
});

test("edges default to empty; decided is optional", () => {
  const meta = parseAdrFrontmatter(FILE, doc("status: proposed"));
  assert.equal(meta.status, "proposed");
  assert.equal(meta.decided, undefined);
  assert.deepEqual(meta.supersedes, []);
  assert.deepEqual(meta.supersedesInPart, []);
  assert.deepEqual(meta.amends, []);
});

test("rejects an unknown status word", () => {
  assert.throws(() => parseAdrFrontmatter(FILE, doc("status: ratified")));
});

test("rejects a typo'd key loudly (strict frontmatter)", () => {
  assert.throws(() => parseAdrFrontmatter(FILE, doc("status: accepted\nsuperceded_by: [1]")));
});

test("rejects a file with no frontmatter block", () => {
  assert.throws(
    () => parseAdrFrontmatter(FILE, "# ADR-0042: Example\n"),
    /no frontmatter block/,
  );
});

test("rejects a non-ADR filename", () => {
  assert.throws(
    () => parseAdrFrontmatter("notes.md", doc("status: accepted")),
    /not an ADR filename/,
  );
});
