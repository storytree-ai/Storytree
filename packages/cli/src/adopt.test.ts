import test from "node:test";
import assert from "node:assert/strict";

import type { ReliabilityGate } from "@storytree/library";

import { adoptCommand, adoptHelp, type AdoptDispatchDeps } from "./adopt.js";
import type { AdoptPlanStory } from "./adopt-plan.js";

/**
 * `storytree adopt` (ADR-0097 / ADR-0106): the area DISPATCHER's offline tests. Pure-by-injection like
 * `gate` / `uat` — every seam is faked, so routing + opts threading are tested with no DB, no git, no
 * subprocess. The RUN engine's honesty walls themselves are exhaustively covered in `@storytree/drive`'s
 * `adopt.test.ts` (runAdopt); these prove the CLI surface routes to it correctly and that `plan` reaches
 * the offline classifier.
 */

// ── doubles ────────────────────────────────────────────────────────────────

function recordingStore(): { appended: unknown[]; appendEvent: NonNullable<AdoptDispatchDeps["store"]>["appendEvent"] } {
  const appended: unknown[] = [];
  return {
    appended,
    async appendEvent(e) {
      appended.push(e.doc);
      return e;
    },
  };
}

const OBSERVE_GATES: ReliabilityGate[] = [
  { id: "lib#gate-1", title: "the suite is green", kind: "observe", covers: ["cap-a"], proofCommand: "pnpm test" },
];

// caps [cap-a, cap-b], one gate covering cap-a → 1 covered, 1 uncovered.
const PLAN_STORY: AdoptPlanStory = {
  status: "mapped",
  capabilities: ["cap-a", "cap-b"],
  gates: [{ id: "lib#gate-1", kind: "observe", covers: ["cap-a"] }],
};

function deps(over: Partial<AdoptDispatchDeps> = {}): AdoptDispatchDeps {
  return {
    store: recordingStore(),
    loadStory: () => ({ status: "mapped", reliabilityGates: OBSERVE_GATES, uatTests: [] }),
    gitState: () => ({ commitSha: "abc1234", clean: true }),
    observe: async () => ({ code: 0 }),
    resolveApprover: () => ({ ok: true, signer: "hua.mick@gmail.com" }),
    flipStatusToProposed: () => ({ ok: true, changed: true, content: "..." }),
    loadPlanStory: () => PLAN_STORY,
    now: () => new Date("2026-06-27T00:00:00.000Z"),
    ...over,
  };
}

// ── help ───────────────────────────────────────────────────────────────────

test("adopt help lists both actions: the run entry and the offline plan", () => {
  const env = adoptHelp();
  assert.equal(env.ok, true);
  assert.match(env.body, /storytree adopt <story-id> --pg/);
  assert.match(env.body, /storytree adopt plan <story-id>/);
});

// ── plan (offline classifier) ────────────────────────────────────────────────

test("adopt plan routes to the offline adoption-plan classifier", async () => {
  const env = await adoptCommand({ mode: "plan", target: "library" }, {}, deps());
  assert.equal(env.ok, true);
  assert.match(env.body, /Adoption plan for "library"/);
  assert.match(env.body, /\(1 covered, 1 uncovered\)/);
});

test("adopt plan needs a story id", async () => {
  const env = await adoptCommand({ mode: "plan", target: undefined }, {}, deps());
  assert.equal(env.ok, false);
  assert.match(env.body, /adopt plan needs a story id/);
});

// ── run (drive's runAdopt, wired) ─────────────────────────────────────────────

test("adopt run signs each observe gate, flips mapped→proposed, and threads the --signer flag to the approver", async () => {
  const store = recordingStore();
  let seenFlag: string | undefined = "UNSET";
  const env = await adoptCommand(
    { mode: "run", target: "library" },
    { signer: "approver@example.com" },
    deps({
      store,
      resolveApprover: (flag) => {
        seenFlag = flag;
        return { ok: true, signer: flag ?? "fallback@example.com" };
      },
    }),
  );
  assert.equal(env.ok, true);
  assert.equal(seenFlag, "approver@example.com", "the --signer flag reached the approver chain");
  assert.match(env.body, /1\/1 observe gate/);
  assert.match(env.body, /flipped mapped → proposed/);
  assert.equal(store.appended.length, 1, "one signed `adopted` verdict persisted");
});

test("adopt run needs a story id", async () => {
  const env = await adoptCommand({ mode: "run", target: undefined }, {}, deps());
  assert.equal(env.ok, false);
  assert.match(env.body, /adopt needs a story id/);
});

test("adopt run refuses offline (no --pg store — a verdict that evaporates greens nothing)", async () => {
  const env = await adoptCommand({ mode: "run", target: "library" }, {}, deps({ store: null }));
  assert.equal(env.ok, false);
  assert.match(env.body, /live store/);
});

test("adopt run refuses a non-brownfield (healthy) story (the wall lives in runAdopt)", async () => {
  const env = await adoptCommand(
    { mode: "run", target: "library" },
    {},
    deps({ loadStory: () => ({ status: "healthy", reliabilityGates: OBSERVE_GATES, uatTests: [] }) }),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /not a brownfield/);
});
