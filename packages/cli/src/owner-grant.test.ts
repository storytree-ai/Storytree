import assert from "node:assert/strict";
import test from "node:test";

import { InnerLoopEventDoc } from "@storytree/proof-protocol";
import { InMemoryStore } from "@storytree/storage-protocol";
import { appendInnerLoopEvent, foldInnerLoopLedger } from "@storytree/orchestrator";
import { preflightInnerLoop } from "@storytree/drive";

import * as InnerLoopVerbs from "./inner-loop-verbs.js";

const ownerGrantCandidate: unknown = {
  event: "owner-grant",
  unitId: "u1",
  incrementId: "inc-a",
  runId: "r6",
  attempts: 1,
  kind: "revised-test",
  difference: "migrate the three inherited tests authorised by the settled owner answer",
  authorityQuestionRef: "asset:q-a",
  authorityDecisionRef: "asset:adr-0577",
};

test("owner-grant-carries-settled-authority: the protocol records a distinct settled-authority grant and the fold spends it exactly once", async () => {
  const parsed = InnerLoopEventDoc.safeParse(ownerGrantCandidate);
  assert.equal(parsed.success, true, "owner-grant must be a durable protocol event");
  if (!parsed.success) return;

  const store = new InMemoryStore();
  for (let attempt = 1; attempt <= 6; attempt++) {
    await appendInnerLoopEvent(store, {
      event: "attempt",
      unitId: "u1",
      incrementId: "inc-a",
      runId: `r${attempt}`,
    });
  }
  await appendInnerLoopEvent(store, parsed.data);

  const granted = foldInnerLoopLedger(await store.readEvents(), "u1");
  assert.equal(granted.remainingGrantCount, 1);
  assert.equal(granted.policy.disposition, "granted");
  assert.match(granted.policy.reason, /asset:q-a/);
  assert.match(granted.policy.reason, /asset:adr-0577/);

  const revised = await preflightInnerLoop({
    ledger: store,
    incrementId: "inc-a",
    unitIds: ["u1"],
    revise: true,
  });
  assert.equal(revised.ok, true, "the owner-granted revised-test attempt is admitted");

  await appendInnerLoopEvent(store, { event: "attempt", unitId: "u1", incrementId: "inc-a", runId: "r7" });
  const exhausted = foldInnerLoopLedger(await store.readEvents(), "u1");
  assert.equal(exhausted.remainingGrantCount, 0);
  assert.equal(exhausted.policy.disposition, "escalate");
});

test("owner-grant-carries-settled-authority: the recording verb is exposed without a missing-export red", () => {
  const recordNodeOwnerGrant: unknown = (InnerLoopVerbs as Record<string, unknown>)["recordNodeOwnerGrant"];
  assert.equal(typeof recordNodeOwnerGrant, "function");
  if (typeof recordNodeOwnerGrant !== "function") return;
  assert.ok(recordNodeOwnerGrant, "the callable is available only after the namespace assertion narrows it");
});
