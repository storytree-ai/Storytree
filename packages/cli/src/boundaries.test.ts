import { test } from "node:test";
import assert from "node:assert/strict";

import { checkBoundaries, classOf, findCycle, type Ownership } from "./boundaries.js";

// A miniature world mirroring the real ownership model (ADR-0074 §2): two organisms in distinct
// stories, two on a shared story, the substrate, and a composition root.
const ownership: Ownership = {
  organisms: {
    "@storytree/library": "library",
    "@storytree/orchestrator": "drive-machinery",
    "@storytree/agent": "drive-machinery",
    "@storytree/notice-board": "notice-board",
  },
  substrate: ["@storytree/base", "@storytree/verdict-contract"],
  compositionRoots: ["@storytree/store", "@storytree/cli"],
};

const storyGraph: Record<string, string[]> = {
  library: [],
  "drive-machinery": ["library"],
  "notice-board": ["library", "drive-machinery"],
};

test("classOf places each package in its declared class, null when unknown", () => {
  assert.equal(classOf("@storytree/library", ownership), "organism");
  assert.equal(classOf("@storytree/base", ownership), "substrate");
  assert.equal(classOf("@storytree/cli", ownership), "composition-root");
  assert.equal(classOf("@storytree/mystery", ownership), null);
});

test("a clean graph (the real shape) has zero violations", () => {
  const packageDeps: Record<string, string[]> = {
    "@storytree/verdict-contract": [], // library is a DEVDEP (parity) — excluded by the caller
    "@storytree/base": ["@storytree/verdict-contract"],
    "@storytree/library": ["@storytree/verdict-contract"],
    "@storytree/orchestrator": [
      "@storytree/agent", // same story (drive-machinery) → intra-organism
      "@storytree/base",
      "@storytree/library", // drive-machinery depends_on library ✓
      "@storytree/verdict-contract",
    ],
    "@storytree/agent": [],
    "@storytree/notice-board": [],
    "@storytree/store": ["@storytree/base", "@storytree/library", "@storytree/notice-board"],
    "@storytree/cli": ["@storytree/orchestrator", "@storytree/store"], // root→root ok
  };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph });
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("an UNDECLARED organism→organism edge is caught (the core gap A)", () => {
  // notice-board depends on library at the code level but does NOT declare drive-machinery,
  // yet imports orchestrator → undeclared coupling.
  const packageDeps = { "@storytree/notice-board": ["@storytree/orchestrator"] };
  const graph = { ...storyGraph, "notice-board": ["library"] }; // drive-machinery NOT declared
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph: graph });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /undeclared cross-story coupling/);
  assert.match(violations[0]!, /notice-board.*drive-machinery/);
});

test("a DECLARED organism→organism edge passes", () => {
  const packageDeps = { "@storytree/notice-board": ["@storytree/orchestrator"] };
  // notice-board declares drive-machinery → allowed
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph });
  assert.deepEqual(violations, []);
});

test("substrate depending on an organism is rejected (keeps base/verdict-contract minimal)", () => {
  const packageDeps = { "@storytree/verdict-contract": ["@storytree/library"] };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /substrate .* depends on organism/);
});

test("an organism depending on a composition root is rejected (nothing may import the wiring layer)", () => {
  const packageDeps = { "@storytree/library": ["@storytree/cli"] };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /composition-root/);
});

test("an unclassified package is caught (a new package can't slip in unowned)", () => {
  const packageDeps = { "@storytree/library": ["@storytree/newcomer"] };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph });
  assert.ok(violations.some((v) => /unclassified package "@storytree\/newcomer"/.test(v)));
});

test("a composition root may depend on anything, including another root", () => {
  const packageDeps = {
    "@storytree/cli": ["@storytree/store", "@storytree/orchestrator", "@storytree/library"],
  };
  const { violations } = checkBoundaries({ ownership, packageDeps, storyGraph });
  assert.deepEqual(violations, []);
});

test("a cross-story dependency cycle is caught (ADR-0058)", () => {
  const cyclic = { a: ["b"], b: ["c"], c: ["a"] };
  const { violations } = checkBoundaries({
    ownership: { organisms: {}, substrate: [], compositionRoots: [] },
    packageDeps: {},
    storyGraph: cyclic,
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0]!, /cycle/);
});

test("findCycle returns null on a DAG and a node path on a cycle", () => {
  assert.equal(findCycle({ a: ["b"], b: [] }), null);
  const c = findCycle({ a: ["b"], b: ["a"] });
  assert.ok(c && c[0] === c[c.length - 1], "cycle path starts and ends at the same node");
});
