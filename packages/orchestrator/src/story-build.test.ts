import test from "node:test";
import assert from "node:assert/strict";

import type { NodeSpec } from "./node-spec.js";
import type { ProveResult } from "./prove-it-gate.js";
import { runStoryBuild, topoOrderStoryNodes } from "./story-build.js";

/** A minimal NodeSpec literal (the loader's output shape, hand-built for determinism). */
function spec(
  id: string,
  tier: NodeSpec["tier"],
  dependsOn: string[] = [],
  capabilities: string[] = [],
): NodeSpec {
  return {
    id,
    tier,
    title: id,
    outcome: `outcome of ${id}`,
    status: "proposed",
    proofMode: tier === "story" ? "UAT" : tier === "capability" ? "integration-test" : "contract-test",
    story: tier === "story" ? undefined : "s",
    dependsOn,
    capabilities,
    decisions: [],
    guidance: undefined,
    file: `${id}.md`,
  };
}

function pass(unitId: string): ProveResult {
  return {
    ok: true,
    verdict: {
      unitId,
      proofMode: "capability",
      outcome: "pass",
      commitSha: "cafebabe",
      signer: "tester@example.com",
      runId: "run-1",
      evidence: [],
      at: "2026-06-10T00:00:00.000Z",
    },
    phasesVisited: ["AUTHOR_TEST", "CONFIRM_RED", "IMPLEMENT", "CONFIRM_GREEN", "GATE"],
  };
}

function fail(reason: string): ProveResult {
  return { ok: false, failedAt: "CONFIRM_RED", reason, phasesVisited: ["AUTHOR_TEST", "CONFIRM_RED"] };
}

// ── topoOrderStoryNodes ─────────────────────────────────────────────────────

test("topo order respects depends_on, breaks ties alphabetically, and puts the story LAST", () => {
  const story = spec("s", "story", [], ["c", "a", "b", "d"]);
  // d -> b -> a, c -> a; ready ties (b,c after a) resolve alphabetically.
  const caps = [
    spec("d", "capability", ["b"]),
    spec("b", "capability", ["a"]),
    spec("c", "capability", ["a"]),
    spec("a", "capability"),
  ];
  const result = topoOrderStoryNodes(story, caps);
  assert.ok(result.ok, !result.ok ? result.reason : "");
  assert.deepEqual(result.order.map((n) => n.id), ["a", "b", "c", "d", "s"]);
});

test("topo order is deterministic regardless of input order", () => {
  const story = spec("s", "story", [], ["x", "y", "z"]);
  const caps = [spec("x", "capability"), spec("y", "capability"), spec("z", "capability")];
  const forward = topoOrderStoryNodes(story, caps);
  const reversed = topoOrderStoryNodes(story, [...caps].reverse());
  assert.ok(forward.ok);
  assert.ok(reversed.ok);
  assert.deepEqual(
    forward.order.map((n) => n.id),
    reversed.order.map((n) => n.id),
  );
});

test("a dependency cycle fails closed, naming the stuck capabilities", () => {
  const story = spec("s", "story", [], ["a", "b"]);
  const caps = [spec("a", "capability", ["b"]), spec("b", "capability", ["a"])];
  const result = topoOrderStoryNodes(story, caps);
  assert.ok(!result.ok);
  assert.match(result.reason, /cycle/);
  assert.match(result.reason, /a, b/);
});

test("a depends_on edge leaving the story's capability set fails closed", () => {
  const story = spec("s", "story", [], ["a"]);
  const caps = [spec("a", "capability", ["elsewhere"])];
  const result = topoOrderStoryNodes(story, caps);
  assert.ok(!result.ok);
  assert.match(result.reason, /outside story "s"/);
});

test("a listed capability with no loaded spec, an unlisted extra, and a non-story root all fail closed", () => {
  const story = spec("s", "story", [], ["a", "ghost"]);
  const missing = topoOrderStoryNodes(story, [spec("a", "capability")]);
  assert.ok(!missing.ok);
  assert.match(missing.reason, /"ghost"/);

  const extra = topoOrderStoryNodes(spec("s", "story", [], ["a"]), [
    spec("a", "capability"),
    spec("stowaway", "capability"),
  ]);
  assert.ok(!extra.ok);
  assert.match(extra.reason, /stowaway/);

  const notStory = topoOrderStoryNodes(spec("c", "capability"), []);
  assert.ok(!notStory.ok);
  assert.match(notStory.reason, /not a story/);
});

// ── runStoryBuild ───────────────────────────────────────────────────────────

test("all nodes pass => passed, outcomes in order, costs summed", async () => {
  const order = [spec("a", "capability"), spec("b", "capability"), spec("s", "story")];
  const run = await runStoryBuild({
    order,
    buildNode: async (node) => ({ result: pass(node.id), costUsd: 0.1 }),
  });
  assert.equal(run.passed, true);
  assert.equal(run.halted, false);
  assert.deepEqual(run.outcomes.map((o) => o.unitId), ["a", "b", "s"]);
  assert.ok(Math.abs(run.totalCostUsd - 0.3) < 1e-9);
});

test("a failing node HALTS the run: later nodes never run and the run is never passed", async () => {
  const order = [spec("a", "capability"), spec("b", "capability"), spec("c", "capability")];
  const driven: string[] = [];
  const run = await runStoryBuild({
    order,
    buildNode: async (node) => {
      driven.push(node.id);
      return node.id === "b" ? { result: fail("red was green") } : { result: pass(node.id) };
    },
  });
  assert.equal(run.passed, false, "halted is NEVER a pass");
  assert.equal(run.halted, true);
  assert.equal(run.haltedAt, 1);
  assert.match(run.reason ?? "", /b failed closed at CONFIRM_RED: red was green/);
  assert.deepEqual(driven, ["a", "b"], "node c must never run after the halt");
  assert.deepEqual(run.outcomes.map((o) => o.unitId), ["a"], "only the signed prefix survives");
});

test("the budget ceiling halts the run BEFORE the next node spends anything", async () => {
  const order = [spec("a", "capability"), spec("b", "capability"), spec("c", "capability")];
  const driven: string[] = [];
  const run = await runStoryBuild({
    order,
    budgetUsd: 1,
    buildNode: async (node) => {
      driven.push(node.id);
      return { result: pass(node.id), costUsd: 0.6 };
    },
  });
  // a spends 0.6, b spends 0.6 (1.2 >= 1), so c is refused before running.
  assert.deepEqual(driven, ["a", "b"]);
  assert.equal(run.passed, false);
  assert.equal(run.halted, true);
  assert.equal(run.haltedAt, 2);
  assert.match(run.reason ?? "", /budget exhausted/);
  assert.ok(Math.abs(run.totalCostUsd - 1.2) < 1e-9);
});

test("buildNode receives the remaining budget so the caller can cap each leaf's slice", async () => {
  const seen: Array<number | undefined> = [];
  await runStoryBuild({
    order: [spec("a", "capability"), spec("b", "capability")],
    budgetUsd: 1,
    buildNode: async (_node, _index, remaining) => {
      seen.push(remaining);
      return { result: pass("x"), costUsd: 0.25 };
    },
  });
  assert.deepEqual(seen, [1, 0.75]);

  const unbounded: Array<number | undefined> = [];
  await runStoryBuild({
    order: [spec("a", "capability")],
    buildNode: async (_node, _index, remaining) => {
      unbounded.push(remaining);
      return { result: pass("x") };
    },
  });
  assert.deepEqual(unbounded, [undefined]);
});

test("a failed node's spend still counts toward the total", async () => {
  const run = await runStoryBuild({
    order: [spec("a", "capability"), spec("b", "capability")],
    buildNode: async (node) =>
      node.id === "a"
        ? { result: fail("died expensively"), costUsd: 0.4 }
        : { result: pass(node.id) },
  });
  assert.equal(run.halted, true);
  assert.ok(Math.abs(run.totalCostUsd - 0.4) < 1e-9);
});
