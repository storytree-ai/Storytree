/**
 * Story `context-traversal-capture`, capability `artifact-offer-candidate-sets`
 * (ADR-0235 / ADR-0260), story spec
 * `stories/context-traversal-capture/artifact-offer-candidate-sets.md`.
 *
 * `resolveArtifactOffers` re-derives, from argv + a stub store, exactly the ref ids
 * `viewArtifact` would print in its Sources block (`packages/cli/src/commands.ts:269-294`) — the
 * doc's own `references` array is the printed offer list, unconditionally, in every
 * `renderStoredDoc` branch, so nothing here is inferred or re-derived beyond that array.
 * `emitCandidateSet` is a pure function of the render's own visit plus the offered ids: it is
 * handed no future events and can consult none, so an offer is recorded at RENDER time whether or
 * not anything ever follows it (ADR-0260 D2) — the point contract 4 exists to falsify.
 *
 * Every fixture here is hand-built in memory — no filesystem, no real store, no real CLI dispatch.
 * No `as` cast narrows a `ContextTraversalEvent`: every narrowing goes through the exported
 * `isContextVisitEvent`, an explicit `kind` literal check, plus `assert.ok`/`assert.equal`,
 * mirroring `descend-agent-refs.test.ts`'s `expectVisit` helper.
 *
 * Covers the seven contracts declared in
 * `stories/context-traversal-capture/artifact-offer-candidate-sets.md`:
 *   1. offers-resolve-to-exactly-the-printed-sources-refs-in-authored-order
 *   2. only-the-bare-library-artifact-id-shape-offers
 *   3. a-missing-doc-or-rejecting-store-offers-nothing-and-never-throws
 *   4. an-offer-is-recorded-at-render-time-even-when-nothing-follows
 *   5. the-candidate-set-names-the-visit-that-rendered-it-and-never-replaces-it
 *   6. composed-coverage-declares-candidate-sets-and-still-denies-followed-edges
 *   7. the-coverage-declaration-names-both-adr-0260-d7-gaps
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ContextTraversalCoverage,
  ContextTraversalEvent,
  CoverageFeature,
  isContextVisitEvent,
} from "@storytree/context-traversal-telemetry";
import type { ContextVisitEvent } from "@storytree/context-traversal-telemetry";

import { AGENT_DESCENT_COVERAGE } from "./descend-agent-refs.js";
import {
  OFFER_CANDIDATE_SET_CAVEATS,
  OFFER_CANDIDATE_SET_COVERAGE,
  emitCandidateSet,
  renderCoverageCaveats,
  resolveArtifactOffers,
} from "./offer-candidate-sets.js";
import type { OfferDeps, OfferDocStore } from "./offer-candidate-sets.js";

const AT = "2026-07-29T00:00:00.000Z";

/** Narrows a raw event to a visit event (front_matter_read | full_payload_read) or fails loudly. */
function expectVisit(event: ContextTraversalEvent | undefined, context: string): ContextVisitEvent {
  assert.notEqual(event, undefined, `${context}: expected an event, got none`);
  if (event === undefined) throw new Error("unreachable");
  assert.equal(isContextVisitEvent(event), true, `${context}: expected a visit event, got kind=${event.kind}`);
  if (!isContextVisitEvent(event)) throw new Error("unreachable");
  return event;
}

/**
 * Narrows a raw event to a `candidate_set` event via an explicit `kind` literal check — never an
 * `as` cast. `ContextTraversalEvent` carries no exported type-guard for this kind the way
 * `isContextVisitEvent` does for visits, so the discriminant narrow is done inline.
 */
function expectCandidateSet(
  event: ContextTraversalEvent | undefined,
  context: string,
): Extract<ContextTraversalEvent, { kind: "candidate_set" }> {
  assert.notEqual(event, undefined, `${context}: expected an event, got none`);
  if (event === undefined) throw new Error("unreachable");
  assert.equal(event.kind, "candidate_set", `${context}: expected kind candidate_set, got ${event.kind}`);
  if (event.kind !== "candidate_set") throw new Error("unreachable");
  return event;
}

function assertParses(event: unknown): void {
  const parsed = ContextTraversalEvent.safeParse(event);
  assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.error.issues));
}

/** A minimal in-memory fixture satisfying the structural `OfferDocStore` (== `AgentDocStore`) port. */
interface StoreFixtureDoc {
  readonly kind: string;
  readonly doc: unknown;
}

function fixtureStore(
  docs: ReadonlyMap<string, StoreFixtureDoc>,
  opts: { readonly throwOn?: ReadonlySet<string> } = {},
): OfferDocStore {
  return {
    async getDoc(id: string) {
      if (opts.throwOn?.has(id) === true) {
        throw new Error(`simulated store failure for ${id}`);
      }
      const found = docs.get(id);
      if (found === undefined) return null;
      return { id, kind: found.kind, doc: found.doc };
    },
  };
}

function libraryArtifactVisitEvent(
  overrides: Partial<{ visitId: string; nodeId: string; sessionId: string; at: string }> = {},
): ContextTraversalEvent {
  return {
    kind: "full_payload_read",
    eventId: `event:${overrides.visitId ?? "visit-render"}`,
    sessionId: overrides.sessionId ?? "session-a",
    at: overrides.at ?? AT,
    visitId: overrides.visitId ?? "visit-render",
    nodeId: overrides.nodeId ?? "artifact-1",
    surfaceId: "library-artifact",
  };
}

function harnessDeps(overrides: { sessionId?: string } = {}): OfferDeps {
  let counter = 0;
  return {
    sessionId: overrides.sessionId ?? "session-a",
    nextVisitId: () => {
      counter += 1;
      return `visit-child-${counter}`;
    },
    now: () => new Date(AT),
  };
}

// ---------------------------------------------------------------------------
// 1. offers-resolve-to-exactly-the-printed-sources-refs-in-authored-order
// ---------------------------------------------------------------------------

test("offers-resolve-to-exactly-the-printed-sources-refs-in-authored-order", async () => {
  const docs = new Map<string, StoreFixtureDoc>([
    [
      "x",
      {
        kind: "principle",
        doc: {
          references: ["asset:a", "doc:decisions/0001-z.md", "asset:b", "bare-thing", 7],
        },
      },
    ],
  ]);
  const store = fixtureStore(docs);

  const offered = await resolveArtifactOffers(["library", "artifact", "x"], store);
  // asset: stripped, doc: kept prefix-and-all, the unrecognised ref passed through verbatim, the
  // non-string entry (7) dropped, authored order preserved — never sorted, never regrouped the way
  // the Sources block displays them.
  assert.deepEqual(offered, ["a", "doc:decisions/0001-z.md", "b", "bare-thing"]);
});

// ---------------------------------------------------------------------------
// 2. only-the-bare-library-artifact-id-shape-offers
// ---------------------------------------------------------------------------

test("only-the-bare-library-artifact-id-shape-offers", async () => {
  const docs = new Map<string, StoreFixtureDoc>([
    ["x", { kind: "principle", doc: { references: ["asset:a"] } }],
  ]);
  const store = fixtureStore(docs);

  // the bare triple resolves x's refs.
  assert.deepEqual(await resolveArtifactOffers(["library", "artifact", "x"], store), ["a"]);

  // every other shape — including the "list" sub-verb and a trailing flag, both of which really do
  // print a Sources block in the real CLI — observes no rendering visit and so offers nothing.
  const nonOffering: (readonly string[])[] = [
    ["library", "artifact", "list"],
    ["library", "artifact", "x", "--pg"],
    ["library", "artifact"],
    ["library"],
    ["tree", "x"],
    ["agents", "x"],
  ];
  for (const argv of nonOffering) {
    const result = await resolveArtifactOffers(argv, store);
    assert.deepEqual(result, [], `expected no offer for ${JSON.stringify(argv)}`);
  }
});

// ---------------------------------------------------------------------------
// 3. a-missing-doc-or-rejecting-store-offers-nothing-and-never-throws
// ---------------------------------------------------------------------------

test("a-missing-doc-or-rejecting-store-offers-nothing-and-never-throws", async () => {
  const missingStore = fixtureStore(new Map());
  assert.deepEqual(await resolveArtifactOffers(["library", "artifact", "ghost"], missingStore), []);

  // a store that REJECTS resolving the doc must never propagate — the offer degrades to [].
  const throwingStore = fixtureStore(new Map(), { throwOn: new Set(["x"]) });
  assert.deepEqual(await resolveArtifactOffers(["library", "artifact", "x"], throwingStore), []);

  const oddDocs = new Map<string, StoreFixtureDoc>([
    ["no-refs", { kind: "principle", doc: {} }],
    ["refs-string", { kind: "principle", doc: { references: "asset:not-an-array" } }],
  ]);
  const oddStore = fixtureStore(oddDocs);
  // a doc with no `references` key at all offers nothing.
  assert.deepEqual(await resolveArtifactOffers(["library", "artifact", "no-refs"], oddStore), []);
  // a `references` that is a string rather than an array must never be spread into per-character
  // offers — it offers nothing.
  assert.deepEqual(await resolveArtifactOffers(["library", "artifact", "refs-string"], oddStore), []);
});

// ---------------------------------------------------------------------------
// 4. an-offer-is-recorded-at-render-time-even-when-nothing-follows
// ---------------------------------------------------------------------------

test("an-offer-is-recorded-at-render-time-even-when-nothing-follows", () => {
  const artifactVisit = libraryArtifactVisitEvent({ visitId: "visit-render" });
  const deps = harnessDeps();

  // `observed` holds ONLY the artifact visit — no visit to a, b, or c, and no later event of any
  // kind.
  const result = emitCandidateSet([artifactVisit], ["a", "b", "c"], deps);
  assert.equal(result.length, 2, "the visit passes through and exactly one candidate_set is appended");

  const candidate = expectCandidateSet(result[1], "recorded offer");
  assert.deepEqual([...candidate.candidateNodeIds], ["a", "b", "c"]);

  // the branch-not-taken claim, not merely a length: compute the offered ids that appear as the
  // nodeId of NO visit event in the returned batch, and assert that set is exactly ["a","b","c"] —
  // every offer recorded, none of them followed. This falsifies an implementation that records only
  // ids some visit in the batch already names (the lazy, containment-tree shape ADR-0260 D2 exists
  // to refuse).
  const visitedNodeIds = new Set(result.filter(isContextVisitEvent).map((event) => event.nodeId));
  const neverVisited = ["a", "b", "c"].filter((id) => !visitedNodeIds.has(id));
  assert.deepEqual(neverVisited, ["a", "b", "c"]);

  // an empty offer set appends nothing at all — `.nonempty()` makes a zero-candidate offer
  // unrepresentable, and a placeholder would be an invented offer.
  assert.deepEqual(emitCandidateSet([artifactVisit], [], deps), [artifactVisit]);
});

// ---------------------------------------------------------------------------
// 5. the-candidate-set-names-the-visit-that-rendered-it-and-never-replaces-it
// ---------------------------------------------------------------------------

test("the-candidate-set-names-the-visit-that-rendered-it-and-never-replaces-it", () => {
  const artifactVisit = libraryArtifactVisitEvent({ visitId: "visit-render" });
  const deps = harnessDeps();

  const result = emitCandidateSet([artifactVisit], ["a", "b"], deps);
  assert.equal(result.length, 2);

  // the artifact visit comes FIRST and survives the JSON round-trip byte-identical to the input
  // visit — no candidateSetId or any other key stamped onto it. Read what the bytes the sink will
  // write actually are, not an in-memory identity.
  const [passthroughRaw, candidateRaw] = result;
  const passthroughVisit = expectVisit(passthroughRaw, "render visit passthrough");
  assert.equal(passthroughVisit.visitId, "visit-render");
  const passthroughOnDisk: unknown = JSON.parse(JSON.stringify(passthroughRaw));
  const inputOnDisk: unknown = JSON.parse(JSON.stringify(artifactVisit));
  assert.deepEqual(passthroughOnDisk, inputOnDisk, "the render visit must pass through byte-identical, never mutated");

  const candidate = expectCandidateSet(candidateRaw, "named offer");
  // the appended event's candidateSetId CONTAINS the rendering visit's visitId, so the offer is
  // joinable to the render that made it without any correlation.
  assert.ok(
    candidate.candidateSetId.includes(passthroughVisit.visitId),
    `expected candidateSetId ${candidate.candidateSetId} to name visit ${passthroughVisit.visitId}`,
  );
  // its surfaceId equals that visit's surfaceId — narrow presence before comparing two possibly-
  // undefined values.
  assert.notEqual(passthroughVisit.surfaceId, undefined);
  assert.equal(candidate.surfaceId, passthroughVisit.surfaceId);

  // every returned event parses through ContextTraversalEvent.
  for (const event of result) assertParses(event);

  // a batch holding no library-artifact visit appends nothing.
  assert.deepEqual(emitCandidateSet([], ["a"], deps), []);
  const treeVisit: ContextTraversalEvent = { ...artifactVisit, surfaceId: "tree" };
  assert.deepEqual(emitCandidateSet([treeVisit], ["a"], deps), [treeVisit]);

  // re-running emitCandidateSet over its OWN output with the same offeredIds appends nothing new —
  // no second, duplicate candidate set.
  const rerun = emitCandidateSet(result, ["a", "b"], deps);
  assert.deepEqual(rerun, result);
});

// ---------------------------------------------------------------------------
// 6. composed-coverage-declares-candidate-sets-and-still-denies-followed-edges
// ---------------------------------------------------------------------------

test("composed-coverage-declares-candidate-sets-and-still-denies-followed-edges", () => {
  const parsed = ContextTraversalCoverage.parse(OFFER_CANDIDATE_SET_COVERAGE);
  assert.equal(parsed.adapterId, "terminal-cli-dispatch");

  assert.ok(parsed.supported.includes("event:candidate_set"));
  assert.equal(parsed.omitted.includes("event:candidate_set"), false);

  // every feature AGENT_DESCENT_COVERAGE declared supported — including field:parent_visit_id and
  // field:prior_visit_id — is still supported. Composition, never a rewrite.
  for (const feature of AGENT_DESCENT_COVERAGE.supported) {
    assert.ok(parsed.supported.includes(feature), `expected base-supported ${feature} to remain supported`);
  }
  assert.ok(parsed.supported.includes("field:parent_visit_id"));
  assert.ok(parsed.supported.includes("field:prior_visit_id"));

  // this increment records the offer and nothing whatever about which offer was answered.
  const stillOmitted: CoverageFeature[] = ["event:followed_edge", "field:candidate_follow_causality"];
  for (const feature of stillOmitted) {
    assert.ok(parsed.omitted.includes(feature), `expected ${feature} to remain omitted`);
  }

  assert.equal(parsed.supported.length + parsed.omitted.length, CoverageFeature.options.length);
});

// ---------------------------------------------------------------------------
// 7. the-coverage-declaration-names-both-adr-0260-d7-gaps
// ---------------------------------------------------------------------------

test("the-coverage-declaration-names-both-adr-0260-d7-gaps", () => {
  assert.equal(OFFER_CANDIDATE_SET_CAVEATS.length, 2);

  const ids = OFFER_CANDIDATE_SET_CAVEATS.map((c) => c.id);
  assert.deepEqual(
    [...ids].sort(),
    [
      "doc-refs-are-offered-but-follows-are-unobservable",
      "follow-completeness-depends-on-the-offered-command-form",
    ].sort(),
  );

  for (const caveat of OFFER_CANDIDATE_SET_CAVEATS) {
    assert.ok(caveat.note.trim().length > 0, `caveat ${caveat.id} must carry a non-blank note`);
  }

  // asserted on the returned string, not by reading the constant a second time.
  const rendered = renderCoverageCaveats(OFFER_CANDIDATE_SET_CAVEATS);
  for (const caveat of OFFER_CANDIDATE_SET_CAVEATS) {
    assert.ok(rendered.includes(caveat.id), `rendered caveats must surface id ${caveat.id}`);
    assert.ok(rendered.includes(caveat.note), `rendered caveats must surface note for ${caveat.id}`);
  }
});
