import test from "node:test";
import assert from "node:assert/strict";

import type { ReliabilityGate, UatTestCriterion } from "@storytree/library";

import type { AdoptedVerdictStore } from "./observe-and-sign.js";
import { memoizeObserve, signMachineCriteria } from "./sign-machine-criteria.js";

/**
 * ONE OBSERVATION PER DISTINCT COMMAND — the primitive's own spend fence.
 *
 * A story's machine legs routinely all bind the SAME covering observe gate, so an unmemoized runner
 * pays that suite once per LEG rather than once per RUN. Signing `studio` (13 legs, one gate, a
 * ~5.3-minute Playwright suite) cost ~80 minutes of serial browser time for what one clean
 * observation settles — the friction `uat-run-re-observes-the-same-command-once-per-leg`. It is
 * asserted HERE, in the shared primitive, because that is what makes it unreachable for a caller to
 * lack it: `storytree adopt` wrapped its own runner and `storytree uat run` did not, which is exactly
 * how the two surfaces diverged.
 *
 * These assert the CALL COUNT on a recording runner. A signed-count assertion passes either way, so
 * it could never have caught this.
 */

// A recording store double — the signed rows are counted, not inspected (that is observe-and-sign's).
function recordingStore(): AdoptedVerdictStore & { appended: unknown[] } {
  const appended: unknown[] = [];
  return {
    appended,
    async appendEvent(e) {
      appended.push(e);
      return e;
    },
  };
}

/** A recording observe runner: every command it is handed, in order. */
function recordingObserve(code = 0): { seen: string[]; observe: (c: string) => Promise<{ code: number }> } {
  const seen: string[] = [];
  return {
    seen,
    observe: async (c: string) => {
      seen.push(c);
      return { code };
    },
  };
}

const CLEAN = async () => ({ commitSha: "cafebabe0123", clean: true });

const SHARED_GATE: ReliabilityGate = {
  id: "demo#gate-1",
  title: "The demo suite is green",
  kind: "observe",
  proofCommand: "pnpm --filter demo test",
  covers: [],
};

const OTHER_GATE: ReliabilityGate = {
  id: "demo#gate-2",
  title: "The other suite is green",
  kind: "observe",
  proofCommand: "pnpm --filter other test",
  covers: [],
};

/** N machine legs, all bound to `gateId` — the shape a well-covered story's UAT section really has. */
function legsBoundTo(gateId: string, count: number, offset = 0): UatTestCriterion[] {
  return Array.from({ length: count }, (_unused, i) => {
    const n = (offset + i + 1).toString(16).padStart(24, "0");
    return {
      criterionId: `uatc_${n}`,
      revisionId: `uatr1:${n.slice(-16)}`,
      title: `Leg ${offset + i + 1}`,
      witness: "machine" as const,
      wouldBe: false,
      proofGateId: gateId,
    };
  });
}

test("SPEND: 13 legs sharing one covering gate observe that command ONCE — and all 13 sign", async () => {
  const legs = legsBoundTo(SHARED_GATE.id, 13);
  const rec = recordingObserve();
  const store = recordingStore();
  const res = await signMachineCriteria({
    legs,
    gates: [SHARED_GATE],
    store,
    gitState: CLEAN,
    observe: rec.observe,
    runId: "uat-run:test",
    now: () => "2026-08-24T00:00:00.000Z",
  });
  assert.deepEqual(rec.seen, ["pnpm --filter demo test"], `one observation for the pass; got ${rec.seen.length}`);
  assert.equal(res.signed, 13, "the single clean observation still greens every leg it covers");
  assert.equal(res.anyRefused, false);
  assert.equal(store.appended.length, 13, "one signed verdict row per leg — the set is not collapsed");
});

test("SPEND: DISTINCT commands are not collapsed — each is observed exactly once", async () => {
  const legs = [...legsBoundTo(SHARED_GATE.id, 3), ...legsBoundTo(OTHER_GATE.id, 2, 3)];
  const rec = recordingObserve();
  const res = await signMachineCriteria({
    legs,
    gates: [SHARED_GATE, OTHER_GATE],
    store: recordingStore(),
    gitState: CLEAN,
    observe: rec.observe,
    runId: "uat-run:test",
    now: () => "2026-08-24T00:00:00.000Z",
  });
  assert.deepEqual(rec.seen.slice().sort(), ["pnpm --filter demo test", "pnpm --filter other test"]);
  assert.equal(res.signed, 5);
});

test("SPEND: a RED command is observed once too — the shared result refuses every leg it covers", async () => {
  // Fail-closed the same way: memoizing must not turn one red into a re-run that might come back
  // green, and must not sign the siblings of a leg whose command was watched failing.
  const legs = legsBoundTo(SHARED_GATE.id, 4);
  const rec = recordingObserve(1);
  const store = recordingStore();
  const res = await signMachineCriteria({
    legs,
    gates: [SHARED_GATE],
    store,
    gitState: CLEAN,
    observe: rec.observe,
    runId: "uat-run:test",
    now: () => "2026-08-24T00:00:00.000Z",
  });
  assert.deepEqual(rec.seen, ["pnpm --filter demo test"]);
  assert.equal(res.signed, 0);
  assert.equal(store.appended.length, 0, "a red signs nothing — a red is left red");
});

test("SPEND: skipped legs cost nothing — narrowing to one criterion observes only its command", async () => {
  const legs = [...legsBoundTo(SHARED_GATE.id, 2), ...legsBoundTo(OTHER_GATE.id, 1, 2)];
  const rec = recordingObserve();
  const res = await signMachineCriteria({
    legs,
    gates: [SHARED_GATE, OTHER_GATE],
    store: recordingStore(),
    gitState: CLEAN,
    observe: rec.observe,
    runId: "uat-run:test",
    now: () => "2026-08-24T00:00:00.000Z",
    onlyCriterionIds: [legs[2]!.criterionId],
  });
  assert.deepEqual(rec.seen, ["pnpm --filter other test"], "the unnamed siblings' gate is never run");
  assert.equal(res.signed, 1);
});

test("memoizeObserve: concurrent callers share the IN-FLIGHT run rather than racing a second one", async () => {
  let started = 0;
  let release: (() => void) | undefined;
  const observe = memoizeObserve(async () => {
    started += 1;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { code: 0 };
  });
  const both = Promise.all([observe("pnpm test"), observe("pnpm test")]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, 1, "the second caller joined the promise already in flight");
  release?.();
  assert.deepEqual(await both, [{ code: 0 }, { code: 0 }]);
});
