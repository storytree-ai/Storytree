import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveWitness } from "@storytree/library";
import { findNodeSpecFile, loadNodeSpec } from "@storytree/orchestrator";

import { runAdopt, type AdoptDeps, type AdoptStory } from "@storytree/drive";

/**
 * ADR-0106 against the CONCRETE INSTANCE — the live `stories/agent/story.md`. Its six UAT legs read
 * `either` before the witness resolution; ADR-0106's story-writer decision records each leg's witness
 * in the prose (the asymmetric rule applied: legs 1–4 and 6 are `machine` — the package's own offline
 * suite, `agent#gate-1`, demonstrably covers them; leg 5 is `human` — the live `query()` is
 * experiential/operator-attested with no standing offline test). This grounds the whole flow end to
 * end on the real story: the classifier (unit 1) and the adopt pass (unit 2) drive it as designed.
 */

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const STORIES_DIR = path.join(REPO_ROOT, "stories");

function agentSpec() {
  const file = findNodeSpecFile(STORIES_DIR, "agent");
  assert.ok(file !== null, "stories/agent/story.md not found");
  return loadNodeSpec(file);
}

test("ADR-0106 instance: the agent story's six UAT legs are authored 5 machine + 1 human (no `either`)", () => {
  const spec = agentSpec();
  assert.equal(spec.uatTests.length, 6, `expected 6 UAT legs, got ${spec.uatTests.length}`);
  assert.deepEqual(
    spec.uatTests.map((l) => l.witness),
    ["machine", "machine", "machine", "machine", "human", "machine"],
  );
});

test("ADR-0106 instance: each machine leg resolves to observe via agent#gate-1; leg 5 stays human", () => {
  const spec = agentSpec();
  for (const leg of spec.uatTests) {
    const resolution = resolveWitness(leg, spec.reliabilityGates);
    if (leg.id === "agent#uat-5") {
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

test("ADR-0106 instance: adopting `agent` observe-signs gate-1 + the 5 machine legs, leaving leg 5 for the operator", async () => {
  const spec = agentSpec();
  const story: AdoptStory = {
    status: spec.status,
    reliabilityGates: spec.reliabilityGates,
    uatTests: spec.uatTests,
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
  // gate-1 + the five machine legs (1–4, 6) each earn an `adopted` verdict; leg 5 (human) does NOT.
  assert.deepEqual(
    appended.map((e) => e.doc.unitId).sort(),
    ["agent#gate-1", "agent#uat-1", "agent#uat-2", "agent#uat-3", "agent#uat-4", "agent#uat-6"],
  );
  assert.match(env.body, /5\/5 machine observe-signed · 1 await your witness · 0 deferred/);
  assert.match(env.body, /agent#uat-5 \(human\) — awaits your "I saw it work"/);
});
