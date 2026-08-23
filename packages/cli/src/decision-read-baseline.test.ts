import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeDecisionReadBaseline,
  decisionNumberOfObservedId,
  decisionReadBaselineVacuity,
  longestReadChain,
  observedIdSpelling,
  supportAdjacency,
  SupportGraphCycleError,
  type DecisionOfferObservation,
  type DecisionReadObservation,
  type DecisionSupportGraph,
} from "./decision-read-baseline.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A three-rung `amends` ladder plus one isolate: 10 -> 11 -> 12, and 20 standing alone. */
function ladder(overrides: Partial<DecisionSupportGraph> = {}): DecisionSupportGraph {
  return {
    decisions: [10, 11, 12, 20],
    amends: [
      { from: 10, to: 11 },
      { from: 11, to: 12 },
    ],
    dependsOn: [],
    decisionsCarryingDependsOn: 0,
    dependsOnNonDecisionTargets: 0,
    ...overrides,
  };
}

function read(
  partial: Partial<DecisionReadObservation> & Pick<DecisionReadObservation, "nodeId">,
): DecisionReadObservation {
  return {
    slotId: "slot-a",
    windowId: "win-1",
    at: "2026-08-01T00:00:00.000Z",
    surface: "host-transcript-file-read",
    ...partial,
  };
}

function offer(
  partial: Partial<DecisionOfferObservation> & Pick<DecisionOfferObservation, "nodeId">,
): DecisionOfferObservation {
  return {
    slotId: "slot-a",
    candidateSetId: "candidate-set:v1",
    at: "2026-08-01T00:00:00.000Z",
    // Defaults to UNOBSERVABLE, which is the live majority: a `doc:`-spelled decision offer is never
    // printed as a followable line, and ADR-0312 settled that the gap is measured rather than closed.
    observable: false,
    ...partial,
  };
}

function baseline(
  reads: readonly DecisionReadObservation[],
  offers: readonly DecisionOfferObservation[] = [],
  support: DecisionSupportGraph = ladder(),
  window: { from?: string; to?: string } = {},
) {
  return computeDecisionReadBaseline({
    reads,
    offers,
    support,
    declaredFrom: window.from,
    declaredTo: window.to,
  });
}

// ---------------------------------------------------------------------------
// Id resolution — the join key
// ---------------------------------------------------------------------------

test("decision-read-baseline: every live spelling on both sides resolves to the same number", () => {
  // The reads arrive as `doc:decisions/…` and bare `adr-NNNN`; the offers as the same two plus
  // `asset:`. A resolver that knew only the pointer forms would drop the bare ids on BOTH sides of
  // one join and report a confident, low follow rate.
  assert.equal(decisionNumberOfObservedId("adr-0419"), 419);
  assert.equal(decisionNumberOfObservedId("asset:adr-0419"), 419);
  assert.equal(decisionNumberOfObservedId("doc:decisions/0419-support-edges.md"), 419);
  assert.equal(decisionNumberOfObservedId("doc:docs/decisions/0419-support-edges.md"), 419);
});

test("decision-read-baseline: an id naming something else resolves to null, never to a number", () => {
  assert.equal(decisionNumberOfObservedId("merge-ceremony"), null);
  assert.equal(decisionNumberOfObservedId("doc:docs/research/some-note.md"), null);
  // `adr-health-notes` is a legal artifact id and must never round to a decision.
  assert.equal(decisionNumberOfObservedId("adr-health-notes"), null);
  assert.equal(decisionNumberOfObservedId("asset:adr-health-notes"), null);
});

test("decision-read-baseline: the spelling census names each live form apart", () => {
  // The spelling names are the CORPUS'S OWN (`DecisionIdSpelling`), not this module's — it delegates
  // to `resolveDecisionId` rather than keeping a second table that could drift from it.
  assert.equal(observedIdSpelling("adr-0419"), "row");
  assert.equal(observedIdSpelling("asset:adr-0419"), "asset");
  assert.equal(observedIdSpelling("doc:decisions/0419-x.md"), "decisions");
  assert.equal(observedIdSpelling("doc:docs/decisions/0419-x.md"), "docs/decisions");
  assert.equal(observedIdSpelling("merge-ceremony"), null);
});

test("decision-read-baseline: reads and offers in DIFFERENT spellings of one decision still join", () => {
  // The measured live state: reads carry `doc:decisions/…`, offers carry the bare id (and vice
  // versa). A raw-string join would score this pair as offered-and-never-followed.
  const result = baseline(
    [read({ nodeId: "doc:decisions/0010-a.md", at: "2026-08-01T02:00:00.000Z" })],
    [offer({ nodeId: "adr-0010", at: "2026-08-01T01:00:00.000Z" })],
  );
  assert.equal(result.offersResolved, 1);
  assert.equal(result.offersFollowed, 1);
  assert.equal(result.decisionsOfferedNeverFollowed, 0);
});

// ---------------------------------------------------------------------------
// The support adjacency — both edges walked, never summed, `supersedes` unreachable
// ---------------------------------------------------------------------------

test("decision-read-baseline: the adjacency unions both support edges, so a rehome is neutral", () => {
  // ADR-0419 D2's drain moves an edge from a source's `amends` to its `dependsOn`. The from/to pair
  // is unchanged, so the adjacency the chain walk sees must be identical — otherwise every rehomed
  // batch would silently shorten this arc's own baseline.
  const asAmends = supportAdjacency(ladder());
  const asDependsOn = supportAdjacency(
    ladder({
      amends: [{ from: 11, to: 12 }],
      dependsOn: [{ from: 10, to: 11 }],
      decisionsCarryingDependsOn: 1,
    }),
  );
  assert.deepEqual([...asAmends.entries()].sort(), [...asDependsOn.entries()].sort());
});

test("decision-read-baseline: the two edge populations are reported apart, never as one figure", () => {
  const result = baseline([], [], ladder({ dependsOn: [{ from: 20, to: 12 }], decisionsCarryingDependsOn: 1 }));
  assert.equal(result.amendsEdges, 2);
  assert.equal(result.dependsOnEdges, 1);
  // The shape itself is the fence: there is no field on the baseline that sums them.
  assert.equal(Object.keys(result).includes("supportEdges"), false);
});

// ---------------------------------------------------------------------------
// Chain depth — the arc's load-bearing number
// ---------------------------------------------------------------------------

test("decision-read-baseline: chain depth counts only edges whose BOTH ends were read", () => {
  // Reading 10 and 12 is not walking the 10 -> 11 -> 12 chain: 11 was never read, so the session
  // crossed no edge. Two chains of 1, not one of 2 — this is what makes the number behavioural.
  const adjacency = supportAdjacency(ladder());
  assert.equal(longestReadChain(new Set([10, 12]), adjacency).depth, 1);
  assert.equal(longestReadChain(new Set([10, 11]), adjacency).depth, 2);
  assert.deepEqual(longestReadChain(new Set([10, 11, 12]), adjacency).path, [10, 11, 12]);
});

test("decision-read-baseline: the OPTIONAL root leaves the unrooted answer exactly as it was", () => {
  // ADR-0428's trial needs a chain ROOTED at a frontier; the frozen baseline needs the unrooted
  // answer it already froze. This pins that adding the parameter changed neither number — the
  // frozen figures are a published record, so "no existing caller passes it" is not enough on its own.
  const adjacency = supportAdjacency(ladder());
  const readSet = new Set([10, 11, 12]);
  assert.deepEqual(longestReadChain(readSet, adjacency), longestReadChain(readSet, adjacency, undefined));
  assert.equal(longestReadChain(readSet, adjacency).depth, 3);
});

test("decision-read-baseline: a ROOTED chain starts where it is asked to, not at the deepest node", () => {
  const adjacency = supportAdjacency(ladder());
  const readSet = new Set([10, 11, 12]);
  assert.deepEqual(longestReadChain(readSet, adjacency, 11).path, [11, 12]);
  assert.equal(longestReadChain(readSet, adjacency, 12).depth, 1);
  // A root the session never read is not a walk it took — 0, never the unrooted longest.
  assert.equal(longestReadChain(new Set([11, 12]), adjacency, 10).depth, 0);
});

test("decision-read-baseline: an empty read set is depth 0, and one unrelated read is depth 1", () => {
  const adjacency = supportAdjacency(ladder());
  assert.equal(longestReadChain(new Set(), adjacency).depth, 0);
  assert.equal(longestReadChain(new Set([20]), adjacency).depth, 1);
});

test("decision-read-baseline: a cyclic support graph THROWS naming the loop, never truncates", () => {
  // A truncated walk returns a plausible smaller number and nothing says so.
  const cyclic = supportAdjacency(
    ladder({ amends: [{ from: 10, to: 11 }, { from: 11, to: 10 }] }),
  );
  assert.throws(
    () => longestReadChain(new Set([10, 11]), cyclic),
    (err: unknown) => err instanceof SupportGraphCycleError && err.loop.length > 0,
  );
});

test("decision-read-baseline: chain depth is a distribution over sessions, never a mean", () => {
  const result = baseline([
    read({ windowId: "w1", nodeId: "adr-0010" }),
    read({ windowId: "w1", nodeId: "adr-0011" }),
    read({ windowId: "w1", nodeId: "adr-0012" }),
    read({ windowId: "w2", nodeId: "adr-0020" }),
    read({ windowId: "w3", nodeId: "adr-0010" }),
    read({ windowId: "w3", nodeId: "adr-0011" }),
  ]);
  assert.deepEqual(result.chainDepthByWindow.histogram, [
    { depth: 1, sessions: 1 },
    { depth: 2, sessions: 1 },
    { depth: 3, sessions: 1 },
  ]);
  assert.equal(result.chainDepthByWindow.sessionsWalkingAChain, 2);
  assert.equal(result.chainDepthByWindow.maxDepth, 3);
  assert.equal(result.chainDepthByWindow.deepestSessionId, "w1");
  assert.deepEqual(result.chainDepthByWindow.deepestChain, [10, 11, 12]);
});

test("decision-read-baseline: slot pooling INFLATES chain depth, and both grains prove it", () => {
  // THE MEASUREMENT THAT JUSTIFIES CARRYING A WINDOW ID AT ALL. Three windows each read ONE decision
  // — nobody walked anything — but they shared one pooled worktree slot, so the slot-grained view
  // unions them into a single three-rung sitting that never happened.
  const result = baseline([
    read({ slotId: "slot-x", windowId: "w1", nodeId: "adr-0010" }),
    read({ slotId: "slot-x", windowId: "w2", nodeId: "adr-0011" }),
    read({ slotId: "slot-x", windowId: "w3", nodeId: "adr-0012" }),
  ]);
  assert.equal(result.chainDepthByWindow.maxDepth, 1);
  assert.equal(result.chainDepthByWindow.sessionsWalkingAChain, 0);
  assert.equal(result.chainDepthBySlot.maxDepth, 3);
  assert.equal(result.chainDepthBySlot.sessionsWalkingAChain, 1);
  assert.equal(result.poolingFactor, 3);
});

test("decision-read-baseline: a read with no window id is counted, never folded into the slot", () => {
  const result = baseline([
    read({ slotId: "slot-x", windowId: undefined, nodeId: "adr-0010" }),
    read({ slotId: "slot-x", windowId: undefined, nodeId: "adr-0011" }),
  ]);
  assert.equal(result.readsWithWindowId, 0);
  assert.equal(result.readsWithoutWindowId, 2);
  assert.equal(result.chainDepthByWindow.sessionsWithAnyDecisionRead, 0);
  assert.equal(result.chainDepthByWindow.maxDepth, 0);
  // ...and the vacuity reason says the window-grained figure measured nothing, rather than letting
  // a depth of 0 read as "no session walks chains".
  assert.ok(result.vacuity.some((reason) => reason.includes("host context window id")));
});

// ---------------------------------------------------------------------------
// Reach — ranked by distinct sessions, never by raw reads
// ---------------------------------------------------------------------------

test("decision-read-baseline: one session grinding a decision cannot outrank two sessions reading another", () => {
  const result = baseline([
    ...Array.from({ length: 20 }, () => read({ windowId: "w1", nodeId: "adr-0010" })),
    read({ windowId: "w2", nodeId: "adr-0011" }),
    read({ windowId: "w3", nodeId: "adr-0011" }),
  ]);
  assert.deepEqual(result.reachByWindow[0], { decision: 11, sessions: 2, reads: 2 });
  assert.deepEqual(result.reachByWindow[1], { decision: 10, sessions: 1, reads: 20 });
});

test("decision-read-baseline: decisions nobody read are reported, not merely absent", () => {
  const result = baseline([read({ nodeId: "adr-0010" })]);
  assert.equal(result.decisionsInLog, 4);
  assert.equal(result.decisionsReachedBySlot, 1);
  assert.equal(result.decisionsNeverRead, 3);
});

test("decision-read-baseline: a read onto a decision the log does not hold is reported, not counted as reach", () => {
  const result = baseline([read({ nodeId: "adr-0999" })]);
  assert.equal(result.readsResolved, 1);
  assert.equal(result.readsOntoUnknownDecisions, 1);
  assert.equal(result.decisionsReachedBySlot, 0);
});

// ---------------------------------------------------------------------------
// Offer-to-follow
// ---------------------------------------------------------------------------

test("decision-read-baseline: a read BEFORE the offer is not a follow of it", () => {
  const result = baseline(
    [read({ nodeId: "adr-0010", at: "2026-08-01T00:00:00.000Z" })],
    [offer({ nodeId: "adr-0010", at: "2026-08-01T05:00:00.000Z" })],
  );
  assert.equal(result.offersResolved, 1);
  assert.equal(result.offersFollowed, 0);
  assert.equal(result.decisionsOfferedNeverFollowed, 1);
});

test("decision-read-baseline: a read in a DIFFERENT slot is not a follow", () => {
  const result = baseline(
    [read({ slotId: "slot-b", nodeId: "adr-0010", at: "2026-08-01T05:00:00.000Z" })],
    [offer({ slotId: "slot-a", nodeId: "adr-0010", at: "2026-08-01T01:00:00.000Z" })],
  );
  assert.equal(result.offersFollowed, 0);
});

test("decision-read-baseline: a decision offered constantly and never read is NOISE, and says so", () => {
  const result = baseline(
    [],
    Array.from({ length: 50 }, (_, i) =>
      offer({ nodeId: "adr-0020", candidateSetId: `candidate-set:v${i}` }),
    ),
  );
  assert.deepEqual(result.offerFollowRows, [{ decision: 20, offered: 50, followed: 0 }]);
  assert.equal(result.decisionsOfferedNeverFollowed, 1);
});

test("decision-read-baseline: an offer naming a non-decision is counted unresolved, never dropped", () => {
  const result = baseline([], [offer({ nodeId: "merge-ceremony" })]);
  assert.equal(result.offersObserved, 1);
  assert.equal(result.offersResolved, 0);
  assert.equal(result.offersUnresolved, 1);
});

// ---------------------------------------------------------------------------
// The declared window
// ---------------------------------------------------------------------------

test("decision-read-baseline: the declared window bounds reads and offers alike", () => {
  const result = baseline(
    [
      read({ nodeId: "adr-0010", at: "2026-07-01T00:00:00.000Z" }),
      read({ nodeId: "adr-0011", at: "2026-08-15T00:00:00.000Z" }),
    ],
    [
      offer({ nodeId: "adr-0010", at: "2026-07-01T00:00:00.000Z" }),
      offer({ nodeId: "adr-0011", at: "2026-08-15T00:00:00.000Z" }),
    ],
    ladder(),
    { from: "2026-08-01T00:00:00.000Z" },
  );
  assert.equal(result.readsObserved, 1);
  assert.equal(result.offersObserved, 1);
  assert.equal(result.observedFrom, "2026-08-15T00:00:00.000Z");
});

// ---------------------------------------------------------------------------
// Vacuity — "nothing was deep" must never print like "nothing was measured"
// ---------------------------------------------------------------------------

test("decision-read-baseline: a healthy reading reports no vacuity reason", () => {
  const result = baseline(
    [read({ windowId: "w1", nodeId: "adr-0010" }), read({ windowId: "w1", nodeId: "adr-0011" })],
    [offer({ nodeId: "adr-0010" })],
  );
  assert.deepEqual(result.vacuity, []);
});

test("decision-read-baseline: an EMPTY decision log is a vacuity reason, not a clean census", () => {
  const empty: DecisionSupportGraph = {
    decisions: [],
    amends: [],
    dependsOn: [],
    decisionsCarryingDependsOn: 0,
    dependsOnNonDecisionTargets: 0,
  };
  const result = baseline([read({ nodeId: "adr-0010" })], [offer({ nodeId: "adr-0010" })], empty);
  assert.ok(result.vacuity.some((reason) => reason.includes("0 decisions")));
});

test("decision-read-baseline: vacuity ANDs the two support edges and never tests `amends` alone", () => {
  // THE FAILURE THIS EXISTS TO PREVENT: ADR-0419 D2's drain moves edges off `amends`, so a fully
  // drained log has ZERO of them by design. An `amends`-only emptiness test would declare that
  // healthy log vacuous exactly as the migration succeeded.
  const drained = ladder({
    amends: [],
    dependsOn: [{ from: 10, to: 11 }, { from: 11, to: 12 }],
    decisionsCarryingDependsOn: 4,
  });
  const result = baseline([read({ nodeId: "adr-0010" })], [offer({ nodeId: "adr-0010" })], drained);
  assert.equal(result.amendsEdges, 0);
  assert.ok(
    !result.vacuity.some((reason) => reason.includes("support edges")),
    "a drained log is healthy, not vacuous",
  );

  // ...and a log with NEITHER edge does fire it.
  const edgeless = ladder({ amends: [], dependsOn: [] });
  const blind = baseline([read({ nodeId: "adr-0010" })], [offer({ nodeId: "adr-0010" })], edgeless);
  assert.ok(blind.vacuity.some((reason) => reason.includes("support edges")));
});

test("decision-read-baseline: zero reads and zero offers each name themselves, separately", () => {
  const noReads = baseline([], [offer({ nodeId: "adr-0010" })]);
  assert.ok(noReads.vacuity.some((reason) => reason.includes("0 decision reads were observed")));

  const noOffers = baseline([read({ windowId: "w1", nodeId: "adr-0010" })], []);
  assert.ok(noOffers.vacuity.some((reason) => reason.includes("0 decision offers were recorded")));
});

test("decision-read-baseline: reads that all fail to resolve are a JOIN failure, not a quiet corpus", () => {
  // The pointer-spelling regression, wearing a new coat: numbers that compute and are wrong.
  const result = baseline(
    [read({ nodeId: "0419" }), read({ nodeId: "ADR-0419" })],
    [offer({ nodeId: "adr-0010" })],
  );
  assert.equal(result.readsObserved, 2);
  assert.equal(result.readsResolved, 0);
  assert.ok(result.vacuity.some((reason) => reason.includes("NONE resolved")));
});

test("decision-read-baseline: the vacuity function is total over its own output", () => {
  const result = baseline([read({ windowId: "w1", nodeId: "adr-0010" })], [offer({ nodeId: "adr-0010" })]);
  // Recomputing over the returned baseline must agree with what the baseline already carries —
  // otherwise the reported reasons and the computed ones could drift apart silently.
  assert.deepEqual(decisionReadBaselineVacuity(result), result.vacuity);
});

// ---------------------------------------------------------------------------
// The observable-branch denominator — ADR-0312's rule, honoured without discarding the rest
// ---------------------------------------------------------------------------

test("decision-read-baseline: the follow rate is reported over BOTH populations, never only the offered one", () => {
  // `decision-read-measurement-arc-inc-01` (PR #1570) requires the OBSERVABLE-branch rate, because a
  // near-zero `followed_edge` count is a property of the CLI follow machinery rather than evidence
  // about agents. But this baseline's follow is a READ recovered from the read record, which exists
  // for every spelling — so it can see a follow of an offer that machinery calls unobservable, and
  // discarding those would throw away most of what the instrument genuinely saw. Both, with their
  // own denominators.
  const result = baseline(
    [read({ nodeId: "adr-0010", at: "2026-08-01T05:00:00.000Z" })],
    [
      // Followed, and UNOBSERVABLE — the case a rate over observable branches alone cannot see.
      offer({ nodeId: "doc:decisions/0010-a.md", at: "2026-08-01T01:00:00.000Z", observable: false }),
      // Followed, and observable.
      offer({ nodeId: "adr-0010", at: "2026-08-01T02:00:00.000Z", observable: true }),
      // Observable and NOT followed.
      offer({ nodeId: "adr-0020", at: "2026-08-01T02:00:00.000Z", observable: true }),
    ],
  );
  assert.equal(result.offersResolved, 3);
  assert.equal(result.offersFollowed, 2);
  assert.equal(result.offersObservable, 2);
  assert.equal(result.offersObservableFollowed, 1);
});

test("decision-read-baseline: zero observable offers is a denominator, never a vacuity reason", () => {
  // WHAT WOULD MAKE THIS RED: promoting the observable-branch emptiness to a vacuity reason. ADR-0312
  // settled that the `doc:` gap is measured and NOT closed, and ADR-0419 D3 makes the mixed period
  // deliberately long — so a probe that failed on it would be a standing false red rather than a
  // finding, which is exactly the call `decisionWalkVacuity` already made about reader-blindness.
  const result = baseline(
    [read({ windowId: "w1", nodeId: "adr-0010", at: "2026-08-01T05:00:00.000Z" })],
    [offer({ nodeId: "doc:decisions/0010-a.md", at: "2026-08-01T01:00:00.000Z", observable: false })],
  );
  assert.equal(result.offersObservable, 0);
  assert.equal(result.offersFollowed, 1, "the read record still saw the follow");
  assert.deepEqual(result.vacuity, []);
});
