// Contract for the definitions projection (ADR-0307 D4) — the ~12 KB generated table the
// UserPromptSubmit hook reads in place of the 1.25 MB seed corpus ADR-0302 D1 decommits.
//
// The invariants that matter, and why each is a test rather than a comment:
//   - it carries ONLY id/title/oneLine/kind — a projection that grew bodies would re-create the
//     glossary ADR-0135 retired and break ADR-0156's pull-based bodies;
//   - it is STABLE — an unstable order would produce a diff on every regeneration, which is the
//     exact churn this whole effort exists to remove;
//   - its output is consumable by the hook's own `selectDefinitions` without a second code path;
//   - it accepts both the StoredDoc envelope and a raw corpus array, since the generator reads a
//     store today and the seed shape is what every fixture in the repo still looks like.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFINITIONS_PROJECTION_BASENAME,
  buildDefinitionsProjection,
  renderDefinitionsProjection,
} from "./definitions-projection.js";
import { selectDefinitions } from "../definition-injection.mjs";

/** The StoredDoc envelope shape `store.queryDocs()` returns. */
function stored(id: string, doc: Record<string, unknown>): Record<string, unknown> {
  return { id, kind: "definition", doc, createdAt: "t", updatedAt: "t" };
}

test("projects id/title/oneLine from the StoredDoc envelope", () => {
  const out = buildDefinitionsProjection([
    stored("verdict", { id: "verdict", kind: "definition", title: "verdict", oneLine: "The pass/fail outcome." }),
  ]);
  assert.deepEqual(out, [
    { kind: "definition", id: "verdict", title: "verdict", oneLine: "The pass/fail outcome." },
  ]);
});

test("accepts a RAW corpus array too — the two shapes differ only by nesting", () => {
  const out = buildDefinitionsProjection([
    { kind: "definition", id: "arc", title: "Arc", oneLine: "A named multi-story intent." },
  ]);
  assert.deepEqual(out, [
    { kind: "definition", id: "arc", title: "Arc", oneLine: "A named multi-story intent." },
  ]);
});

test("carries ONLY the four fields — never the whatItIs/whatItIsNot body (ADR-0156)", () => {
  const out = buildDefinitionsProjection([
    stored("story", {
      id: "story",
      kind: "definition",
      title: "story",
      oneLine: "The top-level unit of work.",
      whatItIs: "A LONG BODY that must not travel",
      whatItIsNot: "ALSO LONG",
      references: ["capability"],
    }),
  ]);
  assert.deepEqual(Object.keys(out[0]!).sort(), ["id", "kind", "oneLine", "title"]);
  const rendered = renderDefinitionsProjection(out);
  assert.ok(!rendered.includes("LONG BODY"), "no body text reaches the projection");
  assert.ok(!rendered.includes("references"), "no reference graph either");
});

test("drops non-definitions and definitions with no usable oneLine", () => {
  const out = buildDefinitionsProjection([
    stored("verdict", { id: "verdict", kind: "definition", title: "verdict", oneLine: "kept" }),
    { id: "some-principle", kind: "principle", doc: { title: "P", oneLine: "not a definition" } },
    stored("blank", { id: "blank", kind: "definition", title: "blank", oneLine: "" }),
    stored("missing", { id: "missing", kind: "definition", title: "missing" }),
    "not an object",
    null,
  ]);
  assert.deepEqual(out.map((d) => d.id), ["verdict"]);
});

test("falls back to the id when a title is absent — the hook matches on both surfaces", () => {
  const out = buildDefinitionsProjection([
    stored("proof-mode", { id: "proof-mode", kind: "definition", oneLine: "Four ways to earn healthy." }),
  ]);
  assert.equal(out[0]?.title, "proof-mode");
});

test("is STABLE — sorted by id, so regeneration produces no spurious diff", () => {
  const docs = [
    stored("story", { id: "story", kind: "definition", title: "story", oneLine: "c" }),
    stored("arc", { id: "arc", kind: "definition", title: "Arc", oneLine: "a" }),
    stored("gate", { id: "gate", kind: "definition", title: "gate", oneLine: "b" }),
  ];
  assert.deepEqual(buildDefinitionsProjection(docs).map((d) => d.id), ["arc", "gate", "story"]);
  // Input order must not reach the output.
  assert.deepEqual(
    buildDefinitionsProjection([...docs].reverse()).map((d) => d.id),
    ["arc", "gate", "story"],
  );
});

test("renders pretty-printed JSON with a trailing newline — a committed file must diff readably", () => {
  const text = renderDefinitionsProjection(buildDefinitionsProjection([
    stored("arc", { id: "arc", kind: "definition", title: "Arc", oneLine: "a" }),
  ]));
  assert.ok(text.endsWith("\n"));
  assert.ok(text.includes("\n  {\n"), "multi-line, not one giant conflict-prone line");
  assert.deepEqual(JSON.parse(text), buildDefinitionsProjection([
    stored("arc", { id: "arc", kind: "definition", title: "Arc", oneLine: "a" }),
  ]));
});

test("the rendered file feeds the hook's OWN selector — one code path, not two", () => {
  const projection = JSON.parse(
    renderDefinitionsProjection(
      buildDefinitionsProjection([
        stored("verdict", { id: "verdict", kind: "definition", title: "verdict", oneLine: "The pass/fail outcome." }),
        stored("arc", { id: "arc", kind: "definition", title: "Arc", oneLine: "A named intent." }),
      ]),
    ),
  ) as Parameters<typeof selectDefinitions>[1];

  const matched = selectDefinitions("what does a verdict prove?", projection);
  assert.deepEqual(matched.map((d) => d.id), ["verdict"]);
});

test("the generated file's name is the one the hook resolves", () => {
  assert.equal(DEFINITIONS_PROJECTION_BASENAME, "definitions.generated.json");
});
