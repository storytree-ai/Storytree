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
    doc("status: accepted\ndecided: 2026-06-12\nsupersedes: [14]"),
  );
  assert.equal(meta.number, 42);
  assert.equal(meta.file, FILE);
  assert.equal(meta.status, "accepted");
  assert.equal(meta.decided, "2026-06-12");
  assert.deepEqual(meta.supersedes, [14]);
});

test("rejects the retired amends edge (ADR-0431 D1: one support edge, spelled depends_on)", () => {
  // The `supersedes_in_part` precedent below, applied to the edge ADR-0431 retired. The schema is
  // `.strict()`, so a stale file still carrying the key fails LOUDLY rather than having its edge
  // silently dropped on the next `adr push` — which would lose the only copy of it.
  assert.throws(
    () => parseAdrFrontmatter(FILE, doc("status: accepted\namends: [30]")),
    /amends/,
    "a retired edge must fail to parse, never be ignored",
  );
});

test("edges default to empty; decided is optional", () => {
  const meta = parseAdrFrontmatter(FILE, doc("status: proposed"));
  assert.equal(meta.status, "proposed");
  assert.equal(meta.decided, undefined);
  assert.deepEqual(meta.supersedes, []);
});

test("rejects the retired supersedes_in_part edge (ADR-0139: the target either survives or it does not)", () => {
  // ADR-0139 retired `supersedes_in_part`; the strict schema no longer accepts the key, so a file
  // still carrying it fails to parse loudly (the `adr-frontmatter` health-check floor) rather than
  // silently sitting "live in part".
  assert.throws(() => parseAdrFrontmatter(FILE, doc("status: accepted\nsupersedes_in_part: [1, 11]")));
});

test("load_bearing parses (ADR-0086) and defaults to false", () => {
  assert.equal(parseAdrFrontmatter(FILE, doc("status: accepted")).loadBearing, false);
  assert.equal(
    parseAdrFrontmatter(FILE, doc("status: accepted\nload_bearing: true")).loadBearing,
    true,
  );
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

test("arc provenance stamp parses (ADR-0183 D3) and is absent when unstamped", () => {
  const stamped = parseAdrFrontmatter(FILE, doc("status: accepted\narc: map-pathways-arc"));
  assert.equal(stamped.arc, "map-pathways-arc");
  // Unstamped (pre-0183 / arc-less work): the key is simply absent, never defaulted.
  assert.equal(parseAdrFrontmatter(FILE, doc("status: accepted")).arc, undefined);
  // An empty stamp is a typo, not provenance — fail loudly.
  assert.throws(() => parseAdrFrontmatter(FILE, doc('status: accepted\narc: ""')));
});
