import test from "node:test";
import assert from "node:assert/strict";

import { SIGNING_EVENT_KIND, type Verdict } from "@storytree/proof-protocol";
import type { RollupEvent } from "@storytree/orchestrator";

import { storyBaselineBackfillCommand } from "./story-baseline.js";

const criterion = {
  criterionId: "uatc_111111111111111111111111",
  revisionId: "uatr1:1111111111111111",
};

test("story baseline backfill reports accepted, unproven and unreadable stories without authored-status input", async () => {
  const events: RollupEvent[] = [{
    kind: SIGNING_EVENT_KIND,
    seq: 1,
    doc: {
      unitId: criterion.criterionId,
      ...criterion,
      proofMode: "story",
      outcome: "pass",
      commitSha: "cafebabe",
      signer: "spine:storytree",
      runId: "proof",
      outputVersion: "v1",
      evidence: [],
      at: "2026-09-09T00:00:00.000Z",
    } satisfies Verdict,
  }];
  const appended: RollupEvent[] = [];
  const result = await storyBaselineBackfillCommand([], {
    store: {
      readEvents: async () => [...events, ...appended],
      appendEvent: async (event) => {
        appended.push({ kind: event.kind, seq: events.length + appended.length + 1, doc: event.doc });
        return event;
      },
    },
    candidates: () => [
      {
        storyId: "broken",
        declaration: { capabilities: [], obligations: [criterion] },
        unresolvedHealthIssue: true,
      },
      { storyId: "green", declaration: { capabilities: [], obligations: [criterion] } },
      { storyId: "unproven", declaration: { capabilities: [{ id: "cap-a", status: "building" }], obligations: [] } },
      { storyId: "unreadable", error: "story parse failed" },
    ],
    gitState: () => ({ commitSha: "cafebabe", clean: true }),
    resolveSigner: () => ({ ok: true, signer: "owner@example.com" }),
    now: () => new Date("2026-09-09T00:00:00.000Z"),
  });
  assert.equal(result.ok, true);
  assert.match(result.body, /broken: declined/);
  assert.match(result.body, /green: recorded/);
  assert.match(result.body, /unproven: declined/);
  assert.match(result.body, /unreadable: declined/);
  assert.equal(appended.length, 1);
});

test("story baseline backfill refuses without the live store", async () => {
  const result = await storyBaselineBackfillCommand([], {
    store: null,
    candidates: () => [],
    gitState: () => ({ commitSha: "cafebabe", clean: true }),
    resolveSigner: () => ({ ok: true, signer: "owner@example.com" }),
    now: () => new Date("2026-09-09T00:00:00.000Z"),
  });
  assert.equal(result.ok, false);
  assert.match(result.body, /rerun with --pg/);
});
