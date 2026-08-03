import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveWitness } from "@storytree/library";
import { findNodeSpecFile, loadNodeSpec } from "@storytree/orchestrator";

import { runAdopt, type AdoptDeps, type AdoptStory } from "@storytree/drive";

/**
 * ADR-0106 against the CONCRETE INSTANCE — the live `stories/agent/story.md`. This grounds the whole
 * flow end to end on the real story: the classifier (unit 1) and the adopt pass (unit 2) drive it as
 * designed.
 *
 * UPDATED 2026-08-03 for ADR-0294. The story used to carry six legs (five `machine` + one `human`) and
 * this file pinned that exact vector. Five of those six were properties of modules, each bound to
 * `agent#gate-1` — the same command that greens their own capability — so ADR-0294 D2 deleted them
 * (their proving node is named per criterion in `stories/uat-legacy-dispositions.json`). ADR-0294 D1
 * quotes this story's former leg 1, *"the seam is runtime-agnostic"*, as its worked example of the
 * shape that does not belong in a UAT section. What survives is the single journey leg — the live
 * subscription-funded runtime invocation, still `witness: human`, its disposition an explicit open
 * OWNER call that this pass deliberately did not decide.
 *
 * The ADR-0106 property under test is unchanged and is what these cases still assert: a witness is
 * RESOLVED per leg and never defaulted onto the human, a `machine` leg resolves through the exact gate
 * it names, and an adopt pass signs the machine legs while leaving a `human` leg for the operator. Only
 * the pinned fixture moved.
 */

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const STORIES_DIR = path.join(REPO_ROOT, "stories");

function agentSpec() {
  const file = findNodeSpecFile(STORIES_DIR, "agent");
  assert.ok(file !== null, "stories/agent/story.md not found");
  return loadNodeSpec(file);
}

test("ADR-0106 instance: every agent UAT leg names its witness explicitly (no `either` default)", () => {
  const spec = agentSpec();
  // Post-ADR-0294 the story declares ONE leg — the live-runtime journey, `human`. The invariant this
  // case exists for is not the count but the absence of `either`: ADR-0106 forbids a leg resting on the
  // fail-closed default, so every leg must carry an explicit witness whatever the population is.
  assert.ok(spec.uatTestCriteria.length > 0, "the agent story still declares a UAT journey");
  assert.deepEqual(
    spec.uatTestCriteria.filter((l) => l.witness === "either"),
    [],
    "no agent UAT leg may rest on the `either` default",
  );
  assert.deepEqual(spec.uatTestCriteria.map((l) => l.witness), ["human"]);
});

test("ADR-0106 instance: each machine leg resolves to observe via agent#gate-1; the human leg stays human", () => {
  const spec = agentSpec();
  for (const leg of spec.uatTestCriteria) {
    const resolution = resolveWitness(leg, spec.reliabilityGates);
    if (leg.witness === "human") {
      assert.deepEqual(resolution, { witness: "human" });
    } else {
      assert.deepEqual(resolution, {
        witness: "machine",
        coverage: "observe",
        observedBy: "agent#gate-1",
        proofCommand: "pnpm --filter @storytree/agent test",
      });
    }
  }
});

test("ADR-0106 instance: adopting `agent` observe-signs gate-1 + every machine leg, leaving each human leg for the operator", async () => {
  const spec = agentSpec();
  const story: AdoptStory = {
    status: spec.status,
    reliabilityGates: spec.reliabilityGates,
    uatTestCriteria: spec.uatTestCriteria,
  };
  const appended: { doc: { unitId: string } }[] = [];
  const deps: AdoptDeps = {
    store: {
      async appendEvent(e: { doc: unknown }) {
        appended.push(e as { doc: { unitId: string } });
        return e;
      },
    } as unknown as AdoptDeps["store"],
    loadStory: () => story,
    gitState: () => ({ commitSha: "abc1234", clean: true }),
    observe: async () => ({ code: 0 }), // the agent suite is green at HEAD
    resolveApprover: () => ({ ok: true, signer: "hua.mick@gmail.com" }),
    flipStatusToProposed: () => ({ ok: true, changed: true, content: "..." }),
    now: () => new Date("2026-06-25T00:00:00.000Z"),
  };

  const env = await runAdopt("agent", {}, deps);
  assert.equal(env.ok, true);
  const machineCriterionIds = spec.uatTestCriteria
    .filter((criterion) => criterion.witness === "machine")
    .map((criterion) => criterion.criterionId);
  // gate-1 + every machine leg earns an `adopted` verdict; a `human` leg NEVER does.
  assert.deepEqual(
    appended.map((e) => e.doc.unitId).sort(),
    ["agent#gate-1", ...machineCriterionIds].sort(),
  );
  const machineCount = machineCriterionIds.length;
  const humanCount = spec.uatTestCriteria.filter((c) => c.witness === "human").length;
  assert.match(
    env.body,
    new RegExp(
      `${machineCount}/${machineCount} machine observe-signed · ${humanCount} await your witness · 0 deferred`,
    ),
  );
  const humanCriterion = spec.uatTestCriteria.find((criterion) => criterion.witness === "human")!;
  assert.match(env.body, new RegExp(`${humanCriterion.criterionId} \\(human\\) — awaits your "I saw it work"`));
});
