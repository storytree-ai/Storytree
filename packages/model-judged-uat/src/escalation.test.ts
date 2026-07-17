import test from "node:test";
import assert from "node:assert/strict";

import { classifyEscalation } from "./escalation.js";

test("escalation-routes-pass-fail-inconclusive: the four honest routes", () => {
  assert.deepEqual(
    classifyEscalation({ outcome: "PASS", requiredTier: "advanced", frontierAvailable: true }),
    { status: "ok", action: "sign" },
  );
  assert.deepEqual(
    classifyEscalation({ outcome: "FAIL", requiredTier: "advanced", frontierAvailable: true }),
    { status: "ok", action: "build" },
  );
  assert.deepEqual(
    classifyEscalation({
      outcome: "INCONCLUSIVE",
      requiredTier: "advanced",
      frontierAvailable: true,
    }),
    { status: "ok", action: "escalate-frontier" },
  );
  assert.deepEqual(
    classifyEscalation({
      outcome: "INCONCLUSIVE",
      requiredTier: "frontier",
      frontierAvailable: true,
    }),
    { status: "ok", action: "escalate-human" },
  );
});

test("escalation-unavailable-frontier-holds: advanced INCONCLUSIVE with no frontier holds", () => {
  assert.deepEqual(
    classifyEscalation({
      outcome: "INCONCLUSIVE",
      requiredTier: "advanced",
      frontierAvailable: false,
    }),
    { status: "ok", action: "hold" },
  );
});

test("escalation-refuses-fail-to-human: FAIL never yields escalate-human", () => {
  const normal = classifyEscalation({
    outcome: "FAIL",
    requiredTier: "frontier",
    frontierAvailable: true,
  });
  assert.equal(normal.status, "ok");
  if (normal.status === "ok") {
    assert.equal(normal.action, "build");
    assert.notEqual(normal.action, "escalate-human");
  }

  const override = classifyEscalation({
    outcome: "FAIL",
    requiredTier: "frontier",
    frontierAvailable: true,
    attemptHumanOverride: true,
  });
  assert.equal(override.status, "refused");
  if (override.status === "refused") {
    assert.match(override.reason, /laundered/);
  }
});
