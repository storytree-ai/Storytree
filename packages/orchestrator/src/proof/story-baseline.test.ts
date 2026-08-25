import test from "node:test";
import assert from "node:assert/strict";

import type { StoryBaselineScope, Verdict } from "@storytree/proof-protocol";
import {
  SIGNING_EVENT_KIND,
  WORK_EVENT_KIND,
  storyBaselineScope,
} from "@storytree/proof-protocol";
import type { StoreEvent } from "@storytree/storage-protocol";

import { rollupCapStatus, rollupStoryGreen, type StoryCapabilityRef } from "./uat-proof.js";
import { expansionBeyondBaseline, matchesStoryBaseline, storyBaselineOf } from "./story-baseline.js";

/**
 * The story-BASELINE fold (ADR-0416 D6) and the CROSS-READER AGREEMENT the durable-green model rests
 * on. Two facts need separate channels — the delivered baseline and the expansion beyond it — and
 * every reader must derive both identically from the same store.
 */

let seq = 0;
function verdictEvent(
  unitId: string,
  outcome: "pass" | "fail" = "pass",
  scope?: StoryBaselineScope,
): StoreEvent {
  seq += 1;
  const doc: Verdict = {
    unitId,
    proofMode: "story",
    outcome,
    commitSha: "cafebabe",
    signer: "owner@example.com",
    runId: "run-1",
    outputVersion: "v1",
    evidence: [],
    at: "2026-08-25T00:00:00.000Z",
  };
  if (scope !== undefined) doc.storyBaseline = scope;
  return { seq, id: `e${seq}`, kind: SIGNING_EVENT_KIND, type: "created", doc, actor: "t", at: doc.at };
}

function buildingEvent(unitId: string): StoreEvent {
  seq += 1;
  return {
    seq,
    id: `w${seq}`,
    kind: WORK_EVENT_KIND,
    type: "created",
    doc: { unitId, event: "building", runId: "run-2" },
    actor: "t",
    at: "2026-08-25T01:00:00.000Z",
  };
}

const SCOPE = storyBaselineScope(["cap-a", "cap-b"], ["g1"]);

// ── Recovering the baseline ─────────────────────────────────────────────────────────────────────

test("baseline: a story with no baseline verdict has none", () => {
  assert.equal(storyBaselineOf("s", [verdictEvent("s")]), null);
});

test("baseline: a passing story verdict CARRYING a scope establishes it", () => {
  const found = storyBaselineOf("s", [verdictEvent("s", "pass", SCOPE)]);
  assert.deepEqual(found?.capabilityIds, ["cap-a", "cap-b"]);
});

test("baseline: another unit's baseline verdict establishes nothing here", () => {
  assert.equal(storyBaselineOf("s", [verdictEvent("other", "pass", SCOPE)]), null);
});

test("baseline: a FAIL never establishes or advances a baseline — the prior one stands", () => {
  // ADR-0416 D3: a failure is evidence the outcome is broken, not a record of what was proven.
  const wider = storyBaselineScope(["cap-a", "cap-b", "cap-c"], ["g1"]);
  const events = [verdictEvent("s", "pass", SCOPE), verdictEvent("s", "fail", wider)];
  assert.deepEqual(storyBaselineOf("s", events)?.capabilityIds, ["cap-a", "cap-b"]);
});

test("baseline: a later, wider PASS advances it (ADR-0416 D7 — the baseline advances)", () => {
  const wider = storyBaselineScope(["cap-a", "cap-b", "cap-c"], ["g1"]);
  const events = [verdictEvent("s", "pass", SCOPE), verdictEvent("s", "pass", wider)];
  assert.deepEqual(storyBaselineOf("s", events)?.capabilityIds, ["cap-a", "cap-b", "cap-c"]);
});

// ── Naming the expansion ────────────────────────────────────────────────────────────────────────

const declared = (...ids: string[]): StoryCapabilityRef[] => ids.map((id) => ({ id }));

test("expansion: with NO baseline, nothing is expansion", () => {
  // A story that has never been proven is not "expanding" — it is unproven, and every declaration it
  // carries is part of its first attempt. Calling that expansion would paint the signal on every grey
  // story in the world and make it mean nothing.
  const e = expansionBeyondBaseline(null, { capabilities: declared("cap-a"), obligations: [{ id: "g1" }] });
  assert.equal(e.expanded, false);
});

test("expansion: capabilities and obligations declared since the baseline are NAMED", () => {
  const e = expansionBeyondBaseline(SCOPE, {
    capabilities: declared("cap-a", "cap-b", "cap-new"),
    obligations: [{ id: "g1" }, { id: "g2" }],
  });
  assert.deepEqual(e.capabilityIds, ["cap-new"]);
  assert.deepEqual(e.obligationIds, ["g2"]);
  assert.equal(e.expanded, true);
});

test("expansion: a declaration inside the baseline is not expansion, in any order", () => {
  const e = expansionBeyondBaseline(SCOPE, {
    capabilities: declared("cap-b", "cap-a"),
    obligations: [{ id: "g1" }],
  });
  assert.equal(e.expanded, false);
});

test("expansion: a RETIRED capability is withdrawn scope, not added scope", () => {
  const e = expansionBeyondBaseline(SCOPE, {
    capabilities: [{ id: "cap-a" }, { id: "cap-gone", status: "retired" }],
    obligations: [{ id: "g1" }],
  });
  assert.deepEqual(e.capabilityIds, []);
});

test("expansion: the fingerprint also catches WITHDRAWN scope, which the diff deliberately does not", () => {
  const shrunk = { capabilities: declared("cap-a"), obligations: [{ id: "g1" }] };
  assert.equal(expansionBeyondBaseline(SCOPE, shrunk).expanded, false);
  assert.equal(matchesStoryBaseline(SCOPE, shrunk), false);
  assert.equal(
    matchesStoryBaseline(SCOPE, { capabilities: declared("cap-b", "cap-a"), obligations: [{ id: "g1" }] }),
    true,
  );
});

// ── The CROSS-READER AGREEMENT (the measured map-vs-CLI divergence) ─────────────────────────────
// The CLI reads a MERGED stream (`PgWorkStore.readEvents`: work events + verdicts); the studio and
// desktop backends read `events.verdict` ALONE, shaped as signing events. Measured 2026-08-25, the
// two disagreed: `rollupStatus` was last-event-wins, so a `building` mark appended after a signed
// pass un-proved the capability for the CLI while the map — which never sees work events — still
// read it green. The map was the honest one (ADR-0416 D3/D4), and 12 islands read green there
// against 10 in `storytree tree`.

test("agreement: a `building` mark after a signed pass no longer forks the two readers", () => {
  const verdictsOnly = [verdictEvent("s.cap-a", "pass"), verdictEvent("uatc-x", "pass")];
  // What the CLI sees: the same verdicts PLUS the lifecycle work event the studio never reads.
  const merged = [...verdictsOnly, buildingEvent("s.cap-a")];

  // The per-capability fold agrees — no green crown floating over a plant that reads differently.
  assert.equal(rollupCapStatus("s.cap-a", verdictsOnly), "healthy");
  assert.equal(rollupCapStatus("s.cap-a", merged), "healthy");

  // …and so does the crown, which is the number the owner actually reads off the map.
  const caps: StoryCapabilityRef[] = [{ id: "s.cap-a", status: "proposed" }];
  assert.equal(rollupStoryGreen(caps, [], verdictsOnly), "healthy");
  assert.equal(rollupStoryGreen(caps, [], merged), "healthy");
});

test("agreement: the undertaken clause does not fork either — a work event never decides it", () => {
  // If a `building` mark could make a `proposed` capability undertaken, the CLI would hold a story
  // grey that the map greened, from the same store.
  const caps: StoryCapabilityRef[] = [
    { id: "s.cap-a", status: "healthy" },
    { id: "s.cap-intent", status: "proposed" },
  ];
  const verdictsOnly = [verdictEvent("s.cap-a", "pass")];
  const merged = [...verdictsOnly, buildingEvent("s.cap-intent")];
  assert.equal(rollupStoryGreen(caps, [], verdictsOnly), "healthy");
  assert.equal(rollupStoryGreen(caps, [], merged), "healthy");
});
