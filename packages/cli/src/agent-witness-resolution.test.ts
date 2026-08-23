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
 * **These cases pin INVARIANTS, never the story's current witness vector — and that is deliberate,
 * twice learned.** This file pinned the exact vector twice and it red twice on a pass that was doing
 * exactly what it was supposed to: ADR-0294's deletion took the story from six legs to one, and
 * ADR-0348 D1/D7 then flipped the survivor from `human` to `machine`. Re-pinning the new vector each
 * time only re-arms the identical break for the next increment, which is what
 * `asset:edit-story-uat-criteria` step 6 forbids: *re-express the assertion as the property it was
 * protecting*. The properties below hold whatever this story's population and witnesses become — a
 * later pass that adds a leg, deletes one, or re-adjudicates one should NOT have to touch this file.
 *
 * The ADR-0106 properties actually under test:
 *  - a witness is RESOLVED per leg and never defaulted onto the human (`either` is forbidden);
 *  - a `machine` leg resolves through the EXACT gate it names — never the first observe gate found,
 *    never by ordering, never by `(covers:)` inference (ADR-0106 d.3);
 *  - an adopt pass observe-signs gate-1 plus every machine leg, and leaves any human leg for the
 *    operator — a `human` leg NEVER earns a verdict.
 *
 * ADR-0348 D7 context for the current shape: the story's one surviving leg is now `machine`, bound to
 * `agent#gate-2`, whose observe command witnesses a model-driven UAT drive record. Its two 2026-06-26
 * `operator`-signed rows are SUPERSEDED by that flip, deliberately and on the owner's ruling. None of
 * that is asserted here — it is the story's to state, not this fixture's to pin.
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
  // The invariant is the ABSENCE of `either`, not the population: ADR-0106 forbids a leg resting on
  // the fail-closed default, so every leg must carry an explicit witness whatever the vector is.
  assert.ok(spec.uatTestCriteria.length > 0, "the agent story still declares a UAT journey");
  assert.deepEqual(
    spec.uatTestCriteria.filter((l) => l.witness === "either"),
    [],
    "no agent UAT leg may rest on the `either` default",
  );
});

test("ADR-0106 instance: each machine leg resolves through the EXACT gate it names; a human leg stays human", () => {
  const spec = agentSpec();
  for (const leg of spec.uatTestCriteria) {
    const resolution = resolveWitness(leg, spec.reliabilityGates);
    if (leg.witness === "human") {
      assert.deepEqual(resolution, { witness: "human" });
      continue;
    }
    // The property, expressed against the leg's OWN declared binding rather than a hardcoded gate id:
    // resolution routes to the gate the leg NAMES, carrying that gate's OWN declared command. A
    // resolver that fell back to the first observe gate, or to ordering, would fail this the moment
    // the story declares more than one observe gate — which it now does.
    const named = spec.reliabilityGates.find((g) => g.id === leg.proofGateId);
    assert.ok(
      named !== undefined,
      `machine leg ${leg.criterionId} must name a declared reliability gate (named "${leg.proofGateId}")`,
    );
    assert.deepEqual(resolution, {
      witness: "machine",
      coverage: "observe",
      observedBy: named.id,
      proofCommand: named.proofCommand,
    });
  }
});

test("ADR-0106 instance: adopting `agent` observe-signs gate-1 + every machine leg, leaving each human leg for the operator", async () => {
  const spec = agentSpec();
  const story: AdoptStory = {
    // `mapped`, NOT `spec.status` — and for the reason this file's header already gives. ADR-0423
    // narrowed adoption ENTRY to `mapped` only (authored `proposed` is the greenfield status, so it
    // is not evidence a story entered adoption), and `agent` is `proposed` like every other story in
    // the corpus. Reading the live status here would pin the STORY'S CURRENT PROVENANCE, which is the
    // incidental state this file exists not to pin — the property under test is the adopt pass's
    // ROUTING (which obligations earn a verdict and which are left for the operator), and that is
    // unchanged. The gate and leg SETS still come from the real spec, so appending a gate to the
    // story still flows through. The entry guard itself is pinned in `@storytree/drive`'s
    // `adopt.test.ts`, where a `proposed` story is asserted REFUSED before any spend.
    status: "mapped",
    reliabilityGates: spec.reliabilityGates,
    uatTestCriteria: spec.uatTestCriteria,
  };
  const appended: { doc: { unitId: string } }[] = [];
  const deps: AdoptDeps = {
    // `AdoptedVerdictStore` asks for `appendEvent` and nothing else, so the double satisfies the
    // seam directly (anti-slop `no-chained-type-assertions`, inc-09).
    store: {
      async appendEvent(e: { doc: unknown }) {
        appended.push(e as { doc: { unitId: string } });
        return e;
      },
    },
    loadStory: () => story,
    gitState: () => ({ commitSha: "abc1234", clean: true }),
    // Every observe gate is green at HEAD — including the UAT-drive witness, whose real command needs
    // the live store and a full clone. Stubbing the observation is the point: this case is about the
    // adopt pass's ROUTING, not about any gate's real outcome.
    observe: async () => ({ code: 0 }),
    resolveApprover: () => ({ ok: true, signer: "hua.mick@gmail.com" }),
    flipStatusToProposed: () => ({ ok: true, changed: true, content: "..." }),
    now: () => new Date("2026-06-25T00:00:00.000Z"),
  };

  const env = await runAdopt("agent", {}, deps);
  assert.equal(env.ok, true);
  const machineCriterionIds = spec.uatTestCriteria
    .filter((criterion) => criterion.witness === "machine")
    .map((criterion) => criterion.criterionId);
  // Every declared gate + every machine leg earns an `adopted` verdict; a `human` leg NEVER does.
  // Derived from the story rather than listed, so appending a gate does not red this case.
  assert.deepEqual(
    appended.map((e) => e.doc.unitId).sort(),
    [...spec.reliabilityGates.map((g) => g.id), ...machineCriterionIds].sort(),
  );
  const machineCount = machineCriterionIds.length;
  const humanCriteria = spec.uatTestCriteria.filter((c) => c.witness === "human");
  assert.match(
    env.body,
    new RegExp(
      `${machineCount}/${machineCount} machine observe-signed · ${humanCriteria.length} await your witness · 0 deferred`,
    ),
  );
  // Conditional by construction: the story currently declares ZERO human legs (ADR-0348 D7), and an
  // unconditional `find(...)!` here would throw rather than report. The claim is "each human leg, if
  // any, is left for the operator" — which is exactly as true of an empty set.
  for (const humanCriterion of humanCriteria) {
    assert.match(
      env.body,
      new RegExp(`${humanCriterion.criterionId} \\(human\\) — awaits your "I saw it work"`),
    );
  }
});
