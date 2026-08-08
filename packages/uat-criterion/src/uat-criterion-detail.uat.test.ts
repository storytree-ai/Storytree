import test from "node:test";
import assert from "node:assert/strict";
import { Criterion } from "@storytree/model-uat";
import { EXACT_CRITERION } from "./criterion.test-helpers.js";

/**
 * The story-level UAT walkthrough for `uat-criterion-detail` (ADR-0209 D5/D6), run EXCLUSIVELY
 * against the PUBLIC `@storytree/uat-criterion` ROOT barrel (`./index.js`) — never against a
 * sibling capability file directly. Each capability (kind schema, criterion pointer +
 * display-canonical title, hash-anchor freshness, story-author write-scope) is already proven in
 * isolation by its own `*.test.ts`; this file pins the STORY-level outcome:
 * a consumer that imports `@storytree/uat-criterion` (the barrel, not a deep sibling path) must
 * actually get the working contract.
 *
 * `packages/uat-criterion/src/index.ts` now re-exports every capability module's public surface,
 * so these assertions PASS. (Corrected in place 2026-08-08 under ADR-0139: this comment used to
 * state that the barrel was "a bootstrap-only doc comment with no re-exports at all — every
 * assertion below currently fails". That was true when the file was authored and is now false; it
 * was load-bearing enough to mislead the ADR-0294 pass into reading these legs as unproven, so it
 * is fixed rather than left to age.) Each test genuinely DRIVES behaviour (round-trip /
 * display-title / hash-freshness / scope-fence) through whatever the barrel provides; none of
 * them merely check that a name is present. Deletion check: remove the barrel re-exports and every
 * test below returns to red — each one both requires the symbol and then exercises real behaviour
 * through it.
 *
 * Sibling-module types are pulled in purely via `typeof import(...)` type queries (erased at
 * runtime, zero coupling) so the values fetched off the barrel are cast to their real shape;
 * only the BARREL's runtime bindings are ever invoked below.
 */

type DetailKindModule = typeof import("./detail-kind.js");
type CriterionPointerModule = typeof import("./criterion-pointer.js");
type DetailHashModule = typeof import("./detail-hash.js");
type StoryAuthorScopeModule = typeof import("./story-author-scope.js");

const barrel: Record<string, unknown> = (await import("./index.js")) as unknown as Record<
  string,
  unknown
>;

/** Fetch `name` off the public root barrel, asserting it is actually exported before casting it. */
function need<T>(name: string): T {
  const value = barrel[name];
  assert.notEqual(
    value,
    undefined,
    `the public @storytree/uat-criterion root barrel must export "${name}" — it currently does ` +
      "not (an empty barrel fails every leg of this walkthrough)",
  );
  return value as T;
}

const WELL_FORMED_DETAIL = {
  kind: "uat-criterion",
  id: "demo-story#uat-1",
  action: "Run the canonical CLI invocation end-to-end.",
  successConditions: "The command exits 0 and the artifact is written to disk.",
  evidenceExpectations: "Attach the command transcript and the written file's sha256.",
  refs: ["asset:merge-ceremony"],
};

// ── uat-1: the detail kind validates through the public port ───────────────

test("uat-1: the root barrel's UatCriterionDetail round-trips a well-formed body", () => {
  const UatCriterionDetail = need<DetailKindModule["UatCriterionDetail"]>("UatCriterionDetail");
  const parsed = UatCriterionDetail.parse(WELL_FORMED_DETAIL);
  assert.equal(parsed.action, WELL_FORMED_DETAIL.action);
  assert.equal(parsed.successConditions, WELL_FORMED_DETAIL.successConditions);
  assert.deepEqual(parsed.refs, WELL_FORMED_DETAIL.refs);
});

test("uat-1: the root barrel's UatCriterionDetail refuses a title-redefining body", () => {
  const UatCriterionDetail = need<DetailKindModule["UatCriterionDetail"]>("UatCriterionDetail");
  const result = UatCriterionDetail.safeParse({
    ...WELL_FORMED_DETAIL,
    title: "a silently redefined display title",
  });
  assert.equal(result.success, false, "the detail schema must not admit a title field");
});

// ── uat-2 RETIRED (ADR-0307 D5) ────────────────────────────────────────────
// The story's uat-2 proved "seed-canonical reconcile is kind-fenced and idempotent" through the
// barrel's `reconcileDetails`. ADR-0307 D5 withdrew the seed-canonical posture, the committed seed
// directory is gone, and the reconciler was deleted with it (ADR-0302 D4's "deleted, not left
// inert"). There is no source store to reconcile FROM, so the leg has no subject.
//
// The remaining criterion numbers are deliberately NOT renumbered: a UAT criterion id is positional,
// so closing the gap would silently re-point every already-signed verdict onto a different leg.

// ── uat-3: the criterion points; the story title stays display-canonical ───

test("uat-3: the root barrel binds a criterion to a detail id and displayTitle stays story-owned", () => {
  const bindDetail = need<CriterionPointerModule["bindDetail"]>("bindDetail");
  const displayTitle = need<CriterionPointerModule["displayTitle"]>("displayTitle");

  const criterion = Criterion.parse({ ...EXACT_CRITERION, title: "The one-line title" });
  const binding = bindDetail(criterion, "demo-story#detail-1");
  assert.equal(binding.detailArtifactId, "demo-story#detail-1");
  assert.equal(displayTitle(binding), "The one-line title");
});

test("uat-3: displayTitle never surfaces a resolved detail body's prose, even when one is attached", () => {
  const bindDetail = need<CriterionPointerModule["bindDetail"]>("bindDetail");
  const displayTitle = need<CriterionPointerModule["displayTitle"]>("displayTitle");
  const UatCriterionDetail = need<DetailKindModule["UatCriterionDetail"]>("UatCriterionDetail");

  const criterion = Criterion.parse({ ...EXACT_CRITERION, title: "The one-line title" });
  const binding = bindDetail(criterion, "demo-story#detail-1");
  const detail = UatCriterionDetail.parse(WELL_FORMED_DETAIL);
  const title = displayTitle({ criterion: binding.criterion, detail });
  assert.equal(title, "The one-line title");
  assert.notEqual(title, detail.action);
});

// ── uat-4: a substantive detail change invalidates the prior hash ──────────

test("uat-4: the root barrel's hash classifies an unchanged body as fresh and a substantive change as stale", () => {
  const computeDetailHash = need<DetailHashModule["computeDetailHash"]>("computeDetailHash");
  const classifyDetailAnchor = need<DetailHashModule["classifyDetailAnchor"]>("classifyDetailAnchor");

  const priorHash = computeDetailHash(WELL_FORMED_DETAIL);
  assert.equal(classifyDetailAnchor(priorHash, WELL_FORMED_DETAIL), "fresh");

  const changed = { ...WELL_FORMED_DETAIL, action: "a materially different action entirely" };
  assert.equal(classifyDetailAnchor(priorHash, changed), "stale");
});

test("uat-4: the story-owned display title never participates in the barrel's hash", () => {
  const computeDetailHash = need<DetailHashModule["computeDetailHash"]>("computeDetailHash");
  const withTitle = { ...WELL_FORMED_DETAIL, title: "A story-owned display one-liner" };
  assert.equal(computeDetailHash(withTitle), computeDetailHash(WELL_FORMED_DETAIL));
});

// ── uat-5: story-author's fence admits the pair and denies the rest ────────

test("uat-5: the root barrel's write-scope predicate admits stories/**", () => {
  const isStoryAuthorWriteAllowed = need<StoryAuthorScopeModule["isStoryAuthorWriteAllowed"]>(
    "isStoryAuthorWriteAllowed",
  );

  assert.equal(isStoryAuthorWriteAllowed("stories/demo-story/story.md"), true);
  assert.equal(isStoryAuthorWriteAllowed("stories/demo-story/some-capability.md"), true);
});

test("uat-5: the root barrel's write-scope predicate denies every corpus and foreign path", () => {
  const isStoryAuthorWriteAllowed = need<StoryAuthorScopeModule["isStoryAuthorWriteAllowed"]>(
    "isStoryAuthorWriteAllowed",
  );

  // Since ADR-0307 D5 a detail body is a LIVE-store write, not a committed file — so no corpus path
  // is admitted any more, this kind's retired seed directory included.
  assert.equal(
    isStoryAuthorWriteAllowed("apps/studio/data/seed-kinds/uat-criterion/demo-story#uat-1.json"),
    false,
  );
  assert.equal(
    isStoryAuthorWriteAllowed("apps/studio/data/seed-kinds/agent/story-author.json"),
    false,
  );
  assert.equal(isStoryAuthorWriteAllowed("packages/uat-criterion/src/index.ts"), false);
  assert.equal(isStoryAuthorWriteAllowed("docs/decisions/0209-model-uat-promotion.md"), false);
});

// ── uat-6 RETIRED (ADR-0307 D5) ────────────────────────────────────────────
// The story's uat-6 proved "offline seed resolve matches the reconciled contract" — it round-tripped
// a detail through `reconcileDetails` into a target store and re-hashed it. Both halves of its
// premise are withdrawn: there is no seed to resolve offline from (ADR-0302 D2 drops offline as a
// supported mode), and no reconciler. The surviving half of the property — that a detail's content
// hash is stable across a store round-trip — is already covered by uat-4 and by detail-hash.test.ts.
//
// As with uat-2: the number is retired in place, never reused and never renumbered.
