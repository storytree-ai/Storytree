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
import type { RollupEvent } from "./rollup.js";
import {
  expansionBeyondBaseline,
  advanceStoryBaseline,
  backfillStoryBaselines,
  matchesStoryBaseline,
  resolveStoryHealth,
  storyBaselineOf,
} from "./story-baseline.js";

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

test("story health: an established baseline survives a changed current revision with no witness", () => {
  const old = { criterionId: "uatc_111111111111111111111111", revisionId: "uatr1:1111111111111111" };
  const revised = { ...old, revisionId: "uatr1:2222222222222222" };
  const scope = storyBaselineScope([], [old.criterionId]);
  const resolution = resolveStoryHealth({
    storyId: "s",
    declaration: { capabilities: [], obligations: [revised] },
    events: [verdictEvent("s", "pass", scope)],
  });
  assert.equal(resolution.currentStatus, null, "the revised criterion still needs exact fresh proof");
  assert.equal(resolution.status, "healthy", "proof absence cannot erase delivered green");
  assert.deepEqual(resolution.pendingObligationIds, [old.criterionId]);
  assert.equal(resolution.baselineToRecord, null);
});

test("story health: current criterion failure and explicit health issues win unhealthy", () => {
  const criterion = { criterionId: "uatc_111111111111111111111111", revisionId: "uatr1:1111111111111111" };
  const scope = storyBaselineScope([], [criterion.criterionId]);
  const pass = verdictEvent("s", "pass", scope);
  const currentPass = verdictEvent(criterion.criterionId);
  currentPass.doc = { ...currentPass.doc as Verdict, ...criterion };
  const currentFail = verdictEvent(criterion.criterionId, "fail");
  currentFail.doc = { ...currentFail.doc as Verdict, ...criterion };
  assert.equal(
    resolveStoryHealth({
      storyId: "s",
      declaration: { capabilities: [], obligations: [criterion] },
      events: [pass, currentPass, currentFail],
    }).status,
    "unhealthy",
  );
  assert.equal(
    resolveStoryHealth({
      storyId: "s",
      declaration: { capabilities: [], obligations: [criterion] },
      events: [pass, currentPass],
      unresolvedHealthIssue: true,
    }).status,
    "unhealthy",
  );
});

test("story health: a first-ever exact current criterion failure is unhealthy", () => {
  const criterion = { criterionId: "uatc_111111111111111111111111", revisionId: "uatr1:1111111111111111" };
  const currentFail = verdictEvent(criterion.criterionId, "fail");
  currentFail.doc = { ...currentFail.doc as Verdict, ...criterion };
  const resolution = resolveStoryHealth({
    storyId: "s",
    declaration: { capabilities: [], obligations: [criterion] },
    events: [currentFail],
  });
  assert.equal(resolution.currentStatus, null, "a fail still grants no lifecycle progress");
  assert.equal(resolution.status, "unhealthy", "story health treats current signed failure as evidence");
});

test("story health: current complete proof requests one canonical baseline establishment", () => {
  const criterion = { criterionId: "uatc_111111111111111111111111", revisionId: "uatr1:1111111111111111" };
  const currentPass = verdictEvent(criterion.criterionId);
  currentPass.doc = { ...currentPass.doc as Verdict, ...criterion };
  const resolution = resolveStoryHealth({
    storyId: "s",
    declaration: { capabilities: [], obligations: [criterion] },
    events: [currentPass],
  });
  assert.equal(resolution.status, "healthy");
  assert.deepEqual(resolution.baselineToRecord, storyBaselineScope([], [criterion.criterionId]));
});

test("story health: a signed whole-story failure wins over an established baseline", () => {
  const scope = storyBaselineScope(["cap-a"], []);
  const events = [verdictEvent("s", "pass", scope), verdictEvent("s", "fail")];
  const resolution = resolveStoryHealth({
    storyId: "s",
    declaration: { capabilities: [{ id: "cap-a", status: "healthy" }], obligations: [] },
    events,
  });
  assert.equal(resolution.status, "unhealthy");
});

test("story health: a prior whole-story failure is recoverable by newer complete exact proof", () => {
  const criterion = { criterionId: "uatc_111111111111111111111111", revisionId: "uatr1:1111111111111111" };
  const scope = storyBaselineScope([], [criterion.criterionId]);
  const baseline = verdictEvent("s", "pass", scope);
  const failed = verdictEvent("s", "fail");
  const repaired = verdictEvent(criterion.criterionId);
  repaired.doc = { ...repaired.doc as Verdict, ...criterion };
  const resolution = resolveStoryHealth({
    storyId: "s",
    declaration: { capabilities: [], obligations: [criterion] },
    events: [baseline, failed, repaired],
  });
  assert.equal(resolution.currentStatus, "healthy");
  assert.equal(resolution.status, "healthy");
  assert.deepEqual(resolution.baselineToRecord, scope);
});

test("story health: retirement is the explicit auditable reset that clears established green", () => {
  const scope = storyBaselineScope([], ["g1"]);
  const events = [verdictEvent("g1"), verdictEvent("s", "pass", scope), {
    seq: ++seq,
    id: `w${seq}`,
    kind: WORK_EVENT_KIND,
    type: "created" as const,
    doc: { unitId: "s", event: "retired" as const },
    actor: "owner",
    at: "2026-08-25T02:00:00.000Z",
  }];
  const resolution = resolveStoryHealth({
    storyId: "s",
    declaration: { capabilities: [], obligations: [{ id: "g1" }] },
    events,
  });
  assert.equal(resolution.baseline, null);
  assert.equal(resolution.status, null);
});

test("baseline writer: a final current proof appends one story pass carrying the canonical scope", async () => {
  const criterion = { criterionId: "uatc_111111111111111111111111", revisionId: "uatr1:1111111111111111" };
  const currentPass = verdictEvent(criterion.criterionId);
  currentPass.doc = { ...currentPass.doc as Verdict, ...criterion };
  const appended: unknown[] = [];
  const result = await advanceStoryBaseline({
    storyId: "s",
    declaration: { capabilities: [], obligations: [criterion] },
    store: {
      readEvents: async () => [currentPass],
      appendEvent: async (event) => { appended.push(event); return event; },
    },
    provenance: {
      commitSha: "cafebabe",
      signer: "spine:storytree",
      runId: "r-final",
      at: "2026-09-09T00:00:00.000Z",
    },
  });
  assert.equal(result.state, "recorded");
  assert.equal(appended.length, 1);
  const event = appended[0] as { doc: Verdict };
  assert.equal(event.doc.unitId, "s");
  assert.deepEqual(event.doc.storyBaseline, storyBaselineScope([], [criterion.criterionId]));
});

test("baseline backfill: records only evidence-complete stories and reports every choice within the bound", async () => {
  const criterion = { criterionId: "uatc_111111111111111111111111", revisionId: "uatr1:1111111111111111" };
  const currentPass = verdictEvent(criterion.criterionId);
  currentPass.doc = { ...currentPass.doc as Verdict, ...criterion };
  const events: RollupEvent[] = [currentPass];
  const appended: RollupEvent[] = [];
  const reports = await backfillStoryBaselines({
    candidates: [
      { storyId: "green", declaration: { capabilities: [], obligations: [criterion] } },
      { storyId: "unproven", declaration: { capabilities: [{ id: "missing", status: "building" }], obligations: [] } },
      { storyId: "unreadable", error: "story parse failed" },
      { storyId: "later", declaration: { capabilities: [], obligations: [criterion] } },
    ],
    store: {
      readEvents: async () => [...events, ...appended],
      appendEvent: async (event) => {
        appended.push({ kind: event.kind, seq: events.length + appended.length + 1, doc: event.doc });
        return event;
      },
    },
    provenance: {
      commitSha: "cafebabe",
      signer: "spine:storytree",
      runIdPrefix: "backfill",
      at: "2026-09-09T00:00:00.000Z",
    },
    limit: 3,
  });
  assert.deepEqual(reports.map((report) => [report.storyId, report.state]), [
    ["green", "recorded"],
    ["later", "recorded"],
    ["unproven", "declined"],
    ["unreadable", "deferred"],
  ]);
  assert.equal(appended.length, 2);
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
