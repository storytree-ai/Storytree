import test from "node:test";
import assert from "node:assert/strict";

import {
  findStandsOnCycles,
  type KnowledgeDagNode,
} from "./knowledge-dag.js";

function assertClosedAuthoredPath(
  nodes: readonly KnowledgeDagNode[],
  path: readonly string[],
): void {
  assert.ok(path.length >= 2, "a cycle path includes at least one edge");
  assert.equal(path[0], path.at(-1), "the cycle path is closed");

  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (let index = 0; index < path.length - 1; index += 1) {
    assert.ok(
      byId.get(path[index]!)?.standsOn.includes(path[index + 1]!),
      `${path[index]} -> ${path[index + 1]} is an authored standsOn edge`,
    );
  }
}

test("library-dag-accepts-acyclic-standson — empty, isolated, and branching graphs have no cycles and remain unchanged", () => {
  const isolated = Object.freeze([
    Object.freeze({ id: "isolated", standsOn: Object.freeze([] as string[]) }),
  ]);
  const branching = Object.freeze([
    Object.freeze({ id: "top", standsOn: Object.freeze(["left", "right"]) }),
    Object.freeze({ id: "left", standsOn: Object.freeze(["foundation"]) }),
    Object.freeze({ id: "right", standsOn: Object.freeze(["foundation"]) }),
    Object.freeze({ id: "foundation", standsOn: Object.freeze([] as string[]) }),
  ]);
  const before = JSON.stringify(branching);

  assert.deepEqual(findStandsOnCycles([]), []);
  assert.deepEqual(findStandsOnCycles(isolated), []);
  assert.deepEqual(findStandsOnCycles(branching), []);
  assert.equal(JSON.stringify(branching), before, "node order and authored edge arrays are unchanged");
});

test("library-dag-rejects-standson-cycle-with-path — self, two-node, and longer reachable cycles return concrete closed paths once", () => {
  const nodes: readonly KnowledgeDagNode[] = [
    { id: "self", standsOn: ["self"] },
    { id: "entry-one", standsOn: ["long-a"] },
    { id: "entry-two", standsOn: ["long-b"] },
    { id: "two-a", standsOn: ["two-b"] },
    { id: "two-b", standsOn: ["two-a"] },
    { id: "long-a", standsOn: ["long-b"] },
    { id: "long-b", standsOn: ["long-c"] },
    { id: "long-c", standsOn: ["long-a"] },
  ];

  const cycles = findStandsOnCycles(nodes);

  assert.deepEqual(cycles, [
    ["self", "self"],
    ["long-a", "long-b", "long-c", "long-a"],
    ["two-a", "two-b", "two-a"],
  ]);
  assert.equal(cycles.length, 3, "multiple acyclic entries do not duplicate the reachable cycle");
  for (const cycle of cycles) assertClosedAuthoredPath(nodes, cycle);
});

test("library-dag-references-are-not-dependencies — citation cycles are ignored unless authored in standsOn", () => {
  const citationCycle = [
    { id: "alpha", standsOn: [] as string[], references: ["beta"] },
    { id: "beta", standsOn: [] as string[], references: ["alpha"] },
  ];

  assert.deepEqual(findStandsOnCycles(citationCycle), []);
  assert.deepEqual(
    findStandsOnCycles([
      { ...citationCycle[0]!, standsOn: ["beta"] },
      { ...citationCycle[1]!, standsOn: ["alpha"] },
    ]),
    [["alpha", "beta", "alpha"]],
  );
});
