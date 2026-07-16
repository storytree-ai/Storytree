import test from "node:test";
import assert from "node:assert/strict";

import { rollupStatus } from "./rollup.js";
import { usageEvent } from "./usage-event.js";

const DOC = {
  unitId: "u1",
  runId: "real-abc",
  phase: "AUTHOR_TEST" as const,
  source: "sdk-leaf" as const,
  usage: { inputTokens: 1, cacheCreationInputTokens: 2, cacheReadInputTokens: 3, outputTokens: 4 },
};

test("usageEvent shapes a validated appendEvent payload keyed by runId:unitId:phase", () => {
  const e = usageEvent(DOC, "tester@example.com");
  assert.equal(e.id, "real-abc:u1:AUTHOR_TEST");
  assert.equal(e.kind, "usage");
  assert.equal(e.type, "created");
  assert.equal(e.actor, "tester@example.com");
  assert.deepEqual(e.doc, DOC);
});

test("usageEvent fails closed on a malformed doc", () => {
  assert.throws(() => usageEvent({ ...DOC, phase: "SHIPPING" as never }, "tester"));
  assert.throws(() =>
    usageEvent({ ...DOC, usage: { tokens: 10 } as never }, "tester"),
  );
});

test("a usage event never moves a unit's derived status (accounting, not proof)", () => {
  const e = usageEvent(DOC, "tester");
  // Alone: the projection abstains — usage grants nothing.
  assert.equal(rollupStatus("u1", [{ kind: e.kind, seq: 1, doc: e.doc }]), null);
  // After a building mark: the mark stands; the usage row changes nothing.
  assert.equal(
    rollupStatus("u1", [
      { kind: "work", seq: 1, doc: { unitId: "u1", event: "building" } },
      { kind: e.kind, seq: 2, doc: e.doc },
    ]),
    "building",
  );
});
