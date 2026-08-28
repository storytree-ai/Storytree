import test from "node:test";
import assert from "node:assert/strict";

import { dependsOnEdges } from "./depends-on-edges.js";
import type { AssetTarget } from "./knowledge-sources.js";

/**
 * The corpus view {@link dependsOnEdges} resolves through — the same `resolveAsset` shape
 * `groupSources` takes, filled here from a literal table rather than from a store.
 */
const CORPUS: ReadonlyMap<string, AssetTarget> = new Map<string, AssetTarget>([
  ["adr-0139", { kind: "adr", title: "Consolidate the load-bearing set" }],
  ["adr-0403", { kind: "adr", title: "The decision log moves into the store" }],
  ["adr-0427", { kind: "adr", title: "Delete the amends presence check" }],
  ["never-bypass-the-gate", { kind: "guardrail", title: "Never bypass the gate" }],
  ["red-green", { kind: "definition", title: "Red-green" }],
  ["merge-ceremony", { kind: "process", title: "Merge ceremony" }],
  ["slow-growth", { kind: "principle", title: "Slow growth, minimum to green" }],
  ["untitled-row", { kind: "pattern", title: "" }],
]);

const resolve = (id: string): AssetTarget | null => CORPUS.get(id) ?? null;

test("an authored asset: edge resolves to its target's title AND kind", () => {
  // The block ADR-0464 D1 deletes printed a bare command per pointer, discarding the title and the
  // type its own Sources block had already computed. The replacement carries both — that discard is
  // half of what ADR-0464's Context measures as the defect.
  assert.deepEqual(dependsOnEdges(["asset:adr-0139"], resolve), [
    { ref: "asset:adr-0139", label: "Consolidate the load-bearing set [adr]" },
  ]);
});

test("BOTH doc: decision spellings canonicalise to the adr-NNNN row", () => {
  // Not a nicety: measured 2026-08-27, `doc:` is the ONLY spelling four whole tiers use for their
  // authored edges (principle 128/128, pattern 45/45, guardrail 35/35, techstack 19/19). A reader
  // that walked `asset:` alone would render an empty onward block for every one of them.
  assert.deepEqual(
    dependsOnEdges(["doc:decisions/0139-a-thing.md", "doc:docs/decisions/0403-another.md"], resolve),
    [
      { ref: "asset:adr-0139", label: "Consolidate the load-bearing set [adr]" },
      { ref: "asset:adr-0403", label: "The decision log moves into the store [adr]" },
    ],
  );
});

test("the two spellings of ONE decision collapse to ONE edge", () => {
  assert.deepEqual(dependsOnEdges(["doc:decisions/0139-a-thing.md", "asset:adr-0139"], resolve), [
    { ref: "asset:adr-0139", label: "Consolidate the load-bearing set [adr]" },
  ]);
});

test("an author's order is preserved WITHIN a group", () => {
  assert.deepEqual(dependsOnEdges(["asset:adr-0427", "asset:adr-0139", "asset:adr-0403"], resolve), [
    { ref: "asset:adr-0427", label: "Delete the amends presence check [adr]" },
    { ref: "asset:adr-0139", label: "Consolidate the load-bearing set [adr]" },
    { ref: "asset:adr-0403", label: "The decision log moves into the store [adr]" },
  ]);
});

test("edges come out in the Sources grouping order, not the order they were authored", () => {
  // The agent tier is 16.8 edges wide across every kind in the corpus, so this is what turns a flat
  // dump into a scannable one. The expected order is SOURCE_GROUP_ORDER's, written out literally:
  // Definitions, Principles, Guardrails, Decisions (ADRs), then Other (a `process` has no heading).
  const authored = [
    "asset:merge-ceremony",
    "asset:adr-0139",
    "asset:never-bypass-the-gate",
    "asset:red-green",
    "asset:slow-growth",
  ];
  assert.deepEqual(
    dependsOnEdges(authored, resolve).map((e) => e.ref),
    [
      "asset:red-green",
      "asset:slow-growth",
      "asset:never-bypass-the-gate",
      "asset:adr-0139",
      "asset:merge-ceremony",
    ],
  );
});

test("a pointer at no artifact is DROPPED, never rendered as an unknown pointer", () => {
  // A `next:` line is a promise that the command runs. ADR-0464 D8 leaves fourteen offered commands
  // naming nothing that exists; reproducing that class on the surface built to replace it would be a
  // strange way to honour the decision. Under-reporting is the honest failure mode (ADR-0260 D4).
  assert.deepEqual(dependsOnEdges(["asset:no-such-artifact", "asset:adr-0139"], resolve), [
    { ref: "asset:adr-0139", label: "Consolidate the load-bearing set [adr]" },
  ]);
  assert.deepEqual(dependsOnEdges(["asset:no-such-artifact"], resolve), []);
});

test("a doc: pointer at a repository file that is not a decision is dropped", () => {
  // It resolves to a FILE, not to a CLI read — the same coverage caveat the Sources block declares
  // for the token. A dangling decision NUMBER is dropped by the resolver arm above, not by this one.
  assert.deepEqual(dependsOnEdges(["doc:docs/research/a-note.md", "asset:adr-0139"], resolve), [
    { ref: "asset:adr-0139", label: "Consolidate the load-bearing set [adr]" },
  ]);
  assert.deepEqual(dependsOnEdges(["doc:decisions/9999-not-in-the-corpus.md"], resolve), []);
});

test("a target carrying no title falls back to its id rather than a bare bracketed kind", () => {
  assert.deepEqual(dependsOnEdges(["asset:untitled-row"], resolve), [
    { ref: "asset:untitled-row", label: "untitled-row [pattern]" },
  ]);
});

test("no authored edges is an empty list, not an empty-looking one", () => {
  assert.deepEqual(dependsOnEdges([], resolve), []);
});
