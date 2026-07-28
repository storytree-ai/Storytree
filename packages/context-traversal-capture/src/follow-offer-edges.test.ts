/**
 * Story `context-traversal-capture`, capability `offer-follow-edges` (ADR-0235 / ADR-0260), story
 * spec `stories/context-traversal-capture/offer-follow-edges.md`.
 *
 * `artifact-offer-candidate-sets` (`offer-candidate-sets.ts`) records what a `library artifact <id>`
 * render OFFERED, at render time, unconditionally (ADR-0260 D2). This capability records which offer
 * a LATER read ANSWERED — and only when the answering invocation's own argv carries the offer's id
 * (ADR-0260 D3): the id travels in argv, never resolved by joining on the session's own trace (the
 * candidate-C-in-B's-clothes shape ADR-0235 clause 3 and ADR-0260 D3 both refuse).
 *
 * `planOfferIdentity` mints an offer id only where a candidate set will actually be recorded for it
 * (the same `isOfferableArtifactRead` predicate the sibling offers on), so a render can never print a
 * dangling id. `renderOfferFollowUps` turns a recorded offer into the follow-up command lines an
 * agent can literally paste — skipping any ref whose offer id carries a scheme prefix (a `doc:` ref
 * has no CLI read to follow). `parseOfferFollow` decomposes `--from-offer` from the FOLLOWING
 * invocation's own argv, purely from the string — no lookup, no history, no trace. `emitFollowedEdge`
 * is the total, pure join: it stamps the answering visit and appends one `followed_edge` event naming
 * both ends, and is a no-op — never a thrown error, never a fabricated edge — on every shape ADR-0260
 * D4 requires the mechanism to under-report rather than repair: a null `followed`, no library-artifact
 * visit in the batch, a visit that already carries a `followedEdgeId`, or a self-answering id.
 *
 * Every fixture here is hand-built in memory — no filesystem, no real store, no real CLI dispatch, no
 * clock but the injected one. No `as` cast narrows a `ContextTraversalEvent`: every narrowing goes
 * through the exported `isContextVisitEvent`, an explicit `kind` literal check, plus
 * `assert.ok`/`assert.equal`, mirroring `offer-candidate-sets.test.ts`.
 *
 * Covers the seven contracts declared in `stories/context-traversal-capture/offer-follow-edges.md`:
 *   1. a-follow-up-command-carries-the-offer-id-of-the-render-that-printed-it
 *   2. only-an-observable-read-shape-plans-an-offer-id
 *   3. the-offer-id-travels-in-argv-and-is-never-resolved-from-the-trace
 *   4. a-followed-read-stamps-its-own-visit-and-emits-one-edge-naming-the-offer
 *   5. a-malformed-or-self-answering-offer-id-records-a-read-with-no-edge
 *   6. composed-coverage-declares-followed-edges-and-candidate-follow-causality
 *   7. the-caveats-carry-the-sharpened-command-form-gap-and-the-unrepairable-under-report
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

import {
  CANDIDATE_SET_PREFIX,
  LIBRARY_ARTIFACT_SURFACE,
  OFFER_CANDIDATE_SET_CAVEATS,
  OFFER_CANDIDATE_SET_COVERAGE,
  candidateSetIdOf,
  isOfferableArtifactRead,
  offerIdOf,
  renderCoverageCaveats,
} from "./offer-candidate-sets.js";
import {
  FOLLOW_OFFER_EDGE_CAVEATS,
  FOLLOW_OFFER_EDGE_COVERAGE,
  OFFER_FLAG,
  emitFollowedEdge,
  parseOfferFollow,
  planOfferIdentity,
  renderOfferFollowUps,
} from "./follow-offer-edges.js";
import type { FollowDeps, FollowedOffer } from "./follow-offer-edges.js";

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
 * Narrows a raw event to a `followed_edge` event via an explicit `kind` literal check — never an
 * `as` cast.
 */
function expectFollowedEdge(
  event: ContextTraversalEvent | undefined,
  context: string,
): Extract<ContextTraversalEvent, { kind: "followed_edge" }> {
  assert.notEqual(event, undefined, `${context}: expected an event, got none`);
  if (event === undefined) throw new Error("unreachable");
  assert.equal(event.kind, "followed_edge", `${context}: expected kind followed_edge, got ${event.kind}`);
  if (event.kind !== "followed_edge") throw new Error("unreachable");
  return event;
}

function assertParses(event: unknown): void {
  const parsed = ContextTraversalEvent.safeParse(event);
  assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.error.issues));
}

/** A minimal `library-artifact` surface visit — the only surface `emitFollowedEdge` may stamp. */
function libraryArtifactVisitEvent(
  overrides: Partial<{
    visitId: string;
    nodeId: string;
    sessionId: string;
    at: string;
    followedEdgeId: string;
  }> = {},
): ContextVisitEvent {
  const base: ContextVisitEvent = {
    kind: "full_payload_read",
    eventId: `event:${overrides.visitId ?? "visit-answer"}`,
    sessionId: overrides.sessionId ?? "session-a",
    at: overrides.at ?? AT,
    visitId: overrides.visitId ?? "visit-answer",
    nodeId: overrides.nodeId ?? "y",
    surfaceId: LIBRARY_ARTIFACT_SURFACE,
  };
  if (overrides.followedEdgeId === undefined) return base;
  return { ...base, followedEdgeId: overrides.followedEdgeId };
}

function harnessFollowDeps(overrides: { sessionId?: string } = {}): FollowDeps {
  return {
    sessionId: overrides.sessionId ?? "session-a",
    now: () => new Date(AT),
  };
}

/** A counting `mintVisitId` fixture, so a test can assert it was (or was not) called. */
function countingMint(): { mint: () => string; count: () => number } {
  let counter = 0;
  return {
    mint: () => {
      counter += 1;
      return `visit-child-${counter}`;
    },
    count: () => counter,
  };
}

// ---------------------------------------------------------------------------
// 1. a-follow-up-command-carries-the-offer-id-of-the-render-that-printed-it
// ---------------------------------------------------------------------------

test("a-follow-up-command-carries-the-offer-id-of-the-render-that-printed-it", () => {
  const candidateSetId = candidateSetIdOf("visit-render");
  const refs = ["asset:a", "doc:decisions/0001-z.md", "asset:b", "bare-thing"];

  const lines = renderOfferFollowUps(candidateSetId, refs);

  // authored order preserved; the doc: ref skipped; every id printed is offerIdOf(ref) so it is
  // byte-identical to the id recorded in the candidate set's own candidateNodeIds.
  assert.deepEqual(lines, [
    `storytree library artifact a ${OFFER_FLAG} ${candidateSetId}`,
    `storytree library artifact b ${OFFER_FLAG} ${candidateSetId}`,
    `storytree library artifact bare-thing ${OFFER_FLAG} ${candidateSetId}`,
  ]);

  for (const ref of ["asset:a", "asset:b", "bare-thing"]) {
    const printed = offerIdOf(ref);
    assert.ok(
      lines.some((line) => line.includes(`artifact ${printed} `)),
      `expected offerIdOf(${ref})=${printed} to appear in ${JSON.stringify(lines)}`,
    );
  }

  // a doc: ref is still offered by the sibling capability, but it never gets a follow-up command
  // line here — there is no CLI read that could follow one.
  assert.equal(
    lines.some((line) => line.includes("doc:decisions/0001-z.md")),
    false,
  );

  // no refs at all -> no lines, never a placeholder.
  assert.deepEqual(renderOfferFollowUps(candidateSetId, []), []);
});

// ---------------------------------------------------------------------------
// 2. only-an-observable-read-shape-plans-an-offer-id
// ---------------------------------------------------------------------------

test("only-an-observable-read-shape-plans-an-offer-id", () => {
  const { mint, count } = countingMint();

  const identity = planOfferIdentity(["library", "artifact", "x"], mint);
  assert.notEqual(identity, null);
  if (identity === null) throw new Error("unreachable");
  assert.equal(count(), 1, "mintVisitId must be called exactly once for an offerable read");
  assert.equal(identity.visitId, "visit-child-1");
  assert.equal(identity.candidateSetId, candidateSetIdOf("visit-child-1"));
  assert.ok(identity.candidateSetId.startsWith(CANDIDATE_SET_PREFIX));

  // mirrors isOfferableArtifactRead exactly — every shape the sibling refuses an offer for must also
  // refuse a planned offer id here, and must never mint a visit id while refusing.
  const nonOffering: (readonly string[])[] = [
    ["library", "artifact", "list"],
    ["library", "artifact", "x", "--pg"],
    ["library", "artifact"],
    ["library"],
    ["tree", "x"],
    ["agents", "x"],
  ];
  for (const argv of nonOffering) {
    assert.equal(isOfferableArtifactRead(argv), false, `expected ${JSON.stringify(argv)} to be non-offerable`);
    const before = count();
    const result = planOfferIdentity(argv, mint);
    assert.equal(result, null, `expected no planned identity for ${JSON.stringify(argv)}`);
    assert.equal(count(), before, `mintVisitId must not be called for ${JSON.stringify(argv)}`);
  }
});

// ---------------------------------------------------------------------------
// 3. the-offer-id-travels-in-argv-and-is-never-resolved-from-the-trace
// ---------------------------------------------------------------------------

test("the-offer-id-travels-in-argv-and-is-never-resolved-from-the-trace", () => {
  const expected: FollowedOffer = { candidateSetId: "candidate-set:visit-render", fromVisitId: "visit-render" };

  // both flag forms parse to the identical FollowedOffer — purely from the string, no lookup, no
  // trace, no history of any kind is ever consulted (the function is handed argv and nothing else).
  const spaceForm = parseOfferFollow(["library", "artifact", "y", OFFER_FLAG, "candidate-set:visit-render"]);
  const eqForm = parseOfferFollow(["library", "artifact", "y", `${OFFER_FLAG}=candidate-set:visit-render`]);
  assert.deepEqual(spaceForm.followed, expected);
  assert.deepEqual(eqForm.followed, expected);

  // stripped down to exactly the bare shape observeCliInvocation allowlists, in both forms.
  assert.deepEqual(spaceForm.argv, ["library", "artifact", "y"]);
  assert.deepEqual(eqForm.argv, ["library", "artifact", "y"]);

  // purity: an identical call twice over is byte-identical — no hidden state.
  const again = parseOfferFollow(["library", "artifact", "y", OFFER_FLAG, "candidate-set:visit-render"]);
  assert.deepEqual(again, spaceForm);

  // no flag present at all -> followed: null, argv passes through unchanged.
  const bare = parseOfferFollow(["library", "artifact", "y"]);
  assert.deepEqual(bare, { argv: ["library", "artifact", "y"], followed: null });

  // the flag may appear anywhere in argv and is still found and stripped, leaving the remaining
  // tokens in their original relative order — the bare shape, not a re-sorted one.
  const reordered = parseOfferFollow([OFFER_FLAG, "candidate-set:visit-render", "library", "artifact", "y"]);
  assert.deepEqual(reordered.argv, ["library", "artifact", "y"]);
  assert.deepEqual(reordered.followed, expected);

  // never throws — an empty argv is a legitimate input and returns a value, not an exception.
  assert.deepEqual(parseOfferFollow([]), { argv: [], followed: null });
});

// ---------------------------------------------------------------------------
// 4. a-followed-read-stamps-its-own-visit-and-emits-one-edge-naming-the-offer
// ---------------------------------------------------------------------------

test("a-followed-read-stamps-its-own-visit-and-emits-one-edge-naming-the-offer", () => {
  const answeringVisit = libraryArtifactVisitEvent({ visitId: "visit-answer", nodeId: "y" });
  const followed: FollowedOffer = { candidateSetId: "candidate-set:visit-render", fromVisitId: "visit-render" };
  const deps = harnessFollowDeps();

  const result = emitFollowedEdge([answeringVisit], followed, deps);
  assert.equal(result.length, 2, "the answering visit passes through, stamped, plus one followed_edge appended");

  const stamped = expectVisit(result[0], "stamped answering visit");
  assert.equal(stamped.visitId, "visit-answer");
  assert.equal(stamped.followedEdgeId, "edge:visit-render:visit-answer");

  const edge = expectFollowedEdge(result[1], "recorded followed edge");
  assert.equal(edge.edgeId, "edge:visit-render:visit-answer");
  assert.equal(edge.candidateSetId, followed.candidateSetId);
  assert.equal(edge.fromVisitId, "visit-render");
  assert.equal(edge.toVisitId, "visit-answer");
  assert.equal(edge.sessionId, deps.sessionId);
  assert.equal(edge.at, AT);

  for (const event of result) assertParses(event);

  // re-running over its own output appends nothing new: the answering visit already carries a
  // followedEdgeId, and the edge id is DERIVED from the (fromVisitId, toVisitId) pair rather than
  // minted, so a second pass is a total no-op.
  const rerun = emitFollowedEdge(result, followed, deps);
  assert.deepEqual(rerun, result);
});

// ---------------------------------------------------------------------------
// 5. a-malformed-or-self-answering-offer-id-records-a-read-with-no-edge
// ---------------------------------------------------------------------------

test("a-malformed-or-self-answering-offer-id-records-a-read-with-no-edge", () => {
  const answeringVisit = libraryArtifactVisitEvent({ visitId: "visit-answer", nodeId: "y" });
  const deps = harnessFollowDeps();

  // a null followed offer (however it was refused upstream) is a total no-op.
  assert.deepEqual(emitFollowedEdge([answeringVisit], null, deps), [answeringVisit]);

  // malformed shapes never even reach a followed offer — parseOfferFollow refuses to plan an edge
  // for them, while still stripping the flag so the bare read underneath is still observed (never
  // silently deleted).
  const missingValue = parseOfferFollow(["library", "artifact", "y", OFFER_FLAG]);
  assert.equal(missingValue.followed, null);
  assert.deepEqual(missingValue.argv, ["library", "artifact", "y"]);
  assert.deepEqual(emitFollowedEdge([answeringVisit], missingValue.followed, deps), [answeringVisit]);

  const noPrefix = parseOfferFollow(["library", "artifact", "y", OFFER_FLAG, "visit-render"]);
  assert.equal(noPrefix.followed, null);
  assert.deepEqual(noPrefix.argv, ["library", "artifact", "y"]);

  const blankRemainder = parseOfferFollow(["library", "artifact", "y", OFFER_FLAG, CANDIDATE_SET_PREFIX]);
  assert.equal(blankRemainder.followed, null);
  assert.deepEqual(blankRemainder.argv, ["library", "artifact", "y"]);

  // a read cannot answer its own offer: fromVisitId equal to the answering visit's own visitId
  // records a read with no edge, even though the shape otherwise looks well-formed.
  const selfAnswer: FollowedOffer = { candidateSetId: candidateSetIdOf("visit-answer"), fromVisitId: "visit-answer" };
  assert.deepEqual(emitFollowedEdge([answeringVisit], selfAnswer, deps), [answeringVisit]);

  // a batch with no library-artifact visit at all -> no-op, whatever the followed offer looks like.
  const followed: FollowedOffer = { candidateSetId: "candidate-set:visit-render", fromVisitId: "visit-render" };
  assert.deepEqual(emitFollowedEdge([], followed, deps), []);
  const treeVisit: ContextVisitEvent = { ...answeringVisit, surfaceId: "tree" };
  assert.deepEqual(emitFollowedEdge([treeVisit], followed, deps), [treeVisit]);

  // a visit that already carries a DIFFERENT followedEdgeId (it already answered a different offer)
  // stays exactly as it is — no second edge, no overwrite.
  const alreadyAnswered = libraryArtifactVisitEvent({
    visitId: "visit-answer",
    followedEdgeId: "edge:visit-other:visit-answer",
  });
  assert.deepEqual(emitFollowedEdge([alreadyAnswered], followed, deps), [alreadyAnswered]);
});

// ---------------------------------------------------------------------------
// 6. composed-coverage-declares-followed-edges-and-candidate-follow-causality
// ---------------------------------------------------------------------------

test("composed-coverage-declares-followed-edges-and-candidate-follow-causality", () => {
  const parsed = ContextTraversalCoverage.parse(FOLLOW_OFFER_EDGE_COVERAGE);
  assert.equal(parsed.adapterId, "terminal-cli-dispatch");

  assert.ok(parsed.supported.includes("event:followed_edge"));
  assert.ok(parsed.supported.includes("field:candidate_follow_causality"));
  assert.equal(parsed.omitted.includes("event:followed_edge"), false);
  assert.equal(parsed.omitted.includes("field:candidate_follow_causality"), false);

  // every feature the sibling declared supported (including event:candidate_set) stays supported —
  // composition, never a rewrite.
  const baseParsed = ContextTraversalCoverage.parse(OFFER_CANDIDATE_SET_COVERAGE);
  for (const feature of baseParsed.supported) {
    assert.ok(parsed.supported.includes(feature), `expected base-supported ${feature} to remain supported`);
  }

  // nothing else moved: the only difference from the base is exactly the two features named above.
  const movedUp = new Set(parsed.supported.filter((feature) => !baseParsed.supported.includes(feature)));
  assert.deepEqual(
    [...movedUp].sort(),
    ["event:followed_edge", "field:candidate_follow_causality"].sort(),
  );

  assert.equal(parsed.supported.length + parsed.omitted.length, CoverageFeature.options.length);
});

// ---------------------------------------------------------------------------
// 7. the-caveats-carry-the-sharpened-command-form-gap-and-the-unrepairable-under-report
// ---------------------------------------------------------------------------

test("the-caveats-carry-the-sharpened-command-form-gap-and-the-unrepairable-under-report", () => {
  assert.equal(FOLLOW_OFFER_EDGE_CAVEATS.length, 3, "the two carried-through caveats plus one new D4 caveat");

  const byId = new Map(FOLLOW_OFFER_EDGE_CAVEATS.map((caveat) => [caveat.id, caveat] as const));

  // the doc: gap carries through byte-identical — it is still true of the inner adapter and this
  // increment leaves it untouched.
  const innerDocCaveat = OFFER_CANDIDATE_SET_CAVEATS.find(
    (caveat) => caveat.id === "doc-refs-are-offered-but-follows-are-unobservable",
  );
  assert.notEqual(innerDocCaveat, undefined);
  assert.deepEqual(byId.get("doc-refs-are-offered-but-follows-are-unobservable"), innerDocCaveat);

  // the SAME stable id, but a SHARPER note: the sibling's caveat only asked for the bare read form;
  // this one requires the offered form to carry the offer id, since a bare command now loses the
  // edge outright.
  const sharpened = byId.get("follow-completeness-depends-on-the-offered-command-form");
  const inner = OFFER_CANDIDATE_SET_CAVEATS.find(
    (caveat) => caveat.id === "follow-completeness-depends-on-the-offered-command-form",
  );
  assert.notEqual(sharpened, undefined);
  assert.notEqual(inner, undefined);
  if (sharpened === undefined || inner === undefined) throw new Error("unreachable");
  assert.notEqual(sharpened.note, inner.note, "the outer caveat must say something the inner adapter could not have written");
  assert.ok(sharpened.note.includes(OFFER_FLAG), `expected the sharpened note to name ${OFFER_FLAG}`);

  // the third, new caveat states the D4 asymmetry: a visit with no followedEdgeId means either the
  // offer went unanswered or the mechanism was bypassed — the two are indistinguishable by design,
  // and no inference may ever repair the gap.
  const carriedIds = new Set([
    "doc-refs-are-offered-but-follows-are-unobservable",
    "follow-completeness-depends-on-the-offered-command-form",
  ]);
  const newIds = [...byId.keys()].filter((id) => !carriedIds.has(id));
  assert.equal(newIds.length, 1, "expected exactly one new caveat beyond the two carried through");
  const asymmetryId = newIds[0];
  assert.notEqual(asymmetryId, undefined);
  if (asymmetryId === undefined) throw new Error("unreachable");
  const asymmetry = byId.get(asymmetryId);
  assert.notEqual(asymmetry, undefined);
  if (asymmetry === undefined) throw new Error("unreachable");
  assert.ok(asymmetry.note.trim().length > 0);
  assert.ok(/never/i.test(asymmetry.note), `expected the asymmetry note to state it is never repaired: ${asymmetry.note}`);

  // every caveat renders, id and note both.
  const rendered = renderCoverageCaveats(FOLLOW_OFFER_EDGE_CAVEATS);
  for (const caveat of FOLLOW_OFFER_EDGE_CAVEATS) {
    assert.ok(rendered.includes(caveat.id), `rendered caveats must surface id ${caveat.id}`);
    assert.ok(rendered.includes(caveat.note), `rendered caveats must surface note for ${caveat.id}`);
  }
});
