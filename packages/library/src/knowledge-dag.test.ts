import test from "node:test";
import assert from "node:assert/strict";

import {
  findDependsOnCycles,
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
      byId.get(path[index]!)?.dependsOn.includes(path[index + 1]!),
      `${path[index]} -> ${path[index + 1]} is an authored dependsOn edge`,
    );
  }
}

test("library-dag-accepts-acyclic-standson — empty, isolated, and branching graphs have no cycles and remain unchanged", () => {
  const isolated = Object.freeze([
    Object.freeze({ id: "isolated", dependsOn: Object.freeze([] as string[]) }),
  ]);
  const branching = Object.freeze([
    Object.freeze({ id: "top", dependsOn: Object.freeze(["left", "right"]) }),
    Object.freeze({ id: "left", dependsOn: Object.freeze(["foundation"]) }),
    Object.freeze({ id: "right", dependsOn: Object.freeze(["foundation"]) }),
    Object.freeze({ id: "foundation", dependsOn: Object.freeze([] as string[]) }),
  ]);
  const before = JSON.stringify(branching);

  assert.deepEqual(findDependsOnCycles([]), []);
  assert.deepEqual(findDependsOnCycles(isolated), []);
  assert.deepEqual(findDependsOnCycles(branching), []);
  assert.equal(JSON.stringify(branching), before, "node order and authored edge arrays are unchanged");
});

test("library-dag-rejects-standson-cycle-with-path — self, two-node, and longer reachable cycles return concrete closed paths once", () => {
  const nodes: readonly KnowledgeDagNode[] = [
    { id: "self", dependsOn: ["self"] },
    { id: "entry-one", dependsOn: ["long-a"] },
    { id: "entry-two", dependsOn: ["long-b"] },
    { id: "two-a", dependsOn: ["two-b"] },
    { id: "two-b", dependsOn: ["two-a"] },
    { id: "long-a", dependsOn: ["long-b"] },
    { id: "long-b", dependsOn: ["long-c"] },
    { id: "long-c", dependsOn: ["long-a"] },
  ];

  const cycles = findDependsOnCycles(nodes);

  assert.deepEqual(cycles, [
    ["self", "self"],
    ["long-a", "long-b", "long-c", "long-a"],
    ["two-a", "two-b", "two-a"],
  ]);
  assert.equal(cycles.length, 3, "multiple acyclic entries do not duplicate the reachable cycle");
  for (const cycle of cycles) assertClosedAuthoredPath(nodes, cycle);
});

test("library-dag-references-are-not-dependencies — citation cycles are ignored unless authored in dependsOn", () => {
  const citationCycle = [
    { id: "alpha", dependsOn: [] as string[], references: ["beta"] },
    { id: "beta", dependsOn: [] as string[], references: ["alpha"] },
  ];

  assert.deepEqual(findDependsOnCycles(citationCycle), []);
  assert.deepEqual(
    findDependsOnCycles([
      { ...citationCycle[0]!, dependsOn: ["beta"] },
      { ...citationCycle[1]!, dependsOn: ["alpha"] },
    ]),
    [["alpha", "beta", "alpha"]],
  );
});
