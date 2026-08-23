import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { frozenEdgesWithinCorpus, parseAmendsSnapshot } from "./amends-snapshot.js";

// ---------------------------------------------------------------------------
// Fixtures — a miniature snapshot with the same two-table shape as the real file
// ---------------------------------------------------------------------------

/**
 * The counts table comes FIRST and contains `ADR-`-shaped prose nowhere, exactly as the real file
 * does. Its presence is the point: a parser that scanned the whole document would read its rows.
 */
function snapshot(options: { declared?: string; edgeRows?: readonly string[]; heading?: string } = {}): string {
  const declared = options.declared ?? "3";
  const heading = options.heading ?? "## Every edge";
  const rows = options.edgeRows ?? [
    "| ADR-0020 | accepted | ADR-0010 | accepted | _(no block in the amender's Status)_ |",
    "| ADR-0030 | accepted | ADR-0010 | superseded | narrows D2 |",
    "| ADR-0040 | proposed | ADR-0020 | accepted | retires D1 |",
  ];
  return [
    "# Pre-migration `amends` edge snapshot",
    "",
    "## Counts at the freeze",
    "",
    "| measure | value |",
    "| --- | --- |",
    "| decision rows | 424 |",
    `| \`amends\` edges (all statuses) | ${declared} |`,
    "| distinct amending sources | 309 |",
    "",
    heading,
    "",
    "`source → target`, with each end's status.",
    "",
    "| source | source status | target | target status | what the amender said |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The literal fixture
// ---------------------------------------------------------------------------

test("repoint-amends-reach-at-the-frozen-snapshot: reads every edge row as a from -> to pair", () => {
  const parsed = parseAmendsSnapshot(snapshot());
  assert.deepEqual(parsed.edges, [
    { from: 20, to: 10 },
    { from: 30, to: 10 },
    { from: 40, to: 20 },
  ]);
  assert.equal(parsed.declaredEdgeCount, 3);
  assert.deepEqual(parsed.problems, []);
});

test("repoint-amends-reach-at-the-frozen-snapshot: the counts table contributes no edge", () => {
  // The guard that makes the `## Every edge` split load-bearing rather than decorative: a counts
  // table carrying ADR-shaped cells must still yield exactly the edge table's rows.
  const withAdrShapedCounts = snapshot().replace(
    "| decision rows | 424 |",
    "| ADR-0099 | accepted | ADR-0098 | accepted | smuggled |",
  );
  const parsed = parseAmendsSnapshot(withAdrShapedCounts);
  assert.deepEqual(
    parsed.edges.map((e) => `${e.from}->${e.to}`),
    ["20->10", "30->10", "40->20"],
  );
});

test("repoint-amends-reach-at-the-frozen-snapshot: a row count disagreeing with the declaration is a problem", () => {
  // The read that must go RED: the file says 3, the table holds 2. A parser that trusted the rows
  // would report a smaller corpus and look exactly like a truthful read of a smaller freeze.
  const truncated = parseAmendsSnapshot(
    snapshot({
      edgeRows: [
        "| ADR-0020 | accepted | ADR-0010 | accepted | x |",
        "| ADR-0030 | accepted | ADR-0010 | accepted | y |",
      ],
    }),
  );
  assert.equal(truncated.edges.length, 2);
  assert.equal(truncated.problems.length, 1);
  assert.match(truncated.problems[0] ?? "", /declares 3 edge\(s\) but 2 row\(s\) were read/);
});

test("repoint-amends-reach-at-the-frozen-snapshot: duplicates collapse and self-edges drop, both reported", () => {
  const parsed = parseAmendsSnapshot(
    snapshot({
      declared: "4",
      edgeRows: [
        "| ADR-0020 | accepted | ADR-0010 | accepted | x |",
        "| ADR-0020 | accepted | ADR-0010 | accepted | x again |",
        "| ADR-0030 | accepted | ADR-0030 | accepted | itself |",
        "| ADR-0040 | accepted | ADR-0020 | accepted | y |",
      ],
    }),
  );
  assert.deepEqual(parsed.edges, [
    { from: 20, to: 10 },
    { from: 40, to: 20 },
  ]);
  // The declaration counts every ROW, so collapsing and dropping must not turn into a count mismatch.
  assert.deepEqual(parsed.problems, [
    "1 duplicate edge row(s) were collapsed",
    "1 self-edge row(s) were dropped",
  ]);
});

test("repoint-amends-reach-at-the-frozen-snapshot: a missing edge table and a missing declaration each say so", () => {
  const noTable = parseAmendsSnapshot(snapshot({ heading: "## Something else" }));
  assert.deepEqual(noTable.edges, []);
  assert.match(noTable.problems[0] ?? "", /no "## Every edge" section/);

  const noDeclaration = parseAmendsSnapshot(
    snapshot().replace("| `amends` edges (all statuses) | 3 |", "| unrelated | 3 |"),
  );
  assert.equal(noDeclaration.declaredEdgeCount, undefined);
  assert.match(noDeclaration.problems[0] ?? "", /no "`amends` edges \(all statuses\)" row/);
});

test("repoint-amends-reach-at-the-frozen-snapshot: edges are narrowed to ends the corpus still holds", () => {
  const edges = [
    { from: 20, to: 10 },
    { from: 30, to: 999 },
    { from: 998, to: 10 },
  ];
  const kept = frozenEdgesWithinCorpus(edges, [10, 20, 30]);
  assert.deepEqual(kept.edges, [{ from: 20, to: 10 }]);
  assert.equal(kept.dropped, 2);
});

// ---------------------------------------------------------------------------
// The REAL committed snapshot — the assertion that actually protects the instrument
// ---------------------------------------------------------------------------

test("repoint-amends-reach-at-the-frozen-snapshot: the committed snapshot parses to its frozen 517 edges", () => {
  // 517 is ADR-0431 D2's own figure, carried by `-inc-18`'s arc entry and by the snapshot's counts
  // table independently of this parser. If the file is ever regenerated or edited — which the
  // decision forbids — this is what goes red, rather than `probe:amends-reach` quietly measuring a
  // different experiment.
  const path = fileURLToPath(
    new URL("../../../docs/research/amends-edge-snapshot-2026-08-23.md", import.meta.url),
  );
  const parsed = parseAmendsSnapshot(readFileSync(path, "utf8"));
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.declaredEdgeCount, 517);
  assert.equal(parsed.edges.length, 517);
  // Spot-check both ends resolve as numbers rather than NaN sentinels.
  for (const edge of parsed.edges) {
    assert.ok(Number.isInteger(edge.from) && edge.from > 0, `bad source in ${JSON.stringify(edge)}`);
    assert.ok(Number.isInteger(edge.to) && edge.to > 0, `bad target in ${JSON.stringify(edge)}`);
  }
});
