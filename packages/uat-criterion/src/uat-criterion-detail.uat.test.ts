import test from "node:test";
import assert from "node:assert/strict";
import { Criterion } from "@storytree/model-uat";
import { InMemoryStore } from "@storytree/storage-protocol";

/**
 * The story-level UAT walkthrough for `uat-criterion-detail` (ADR-0209 D5/D6), run EXCLUSIVELY
 * against the PUBLIC `@storytree/uat-criterion` ROOT barrel (`./index.js`) — never against a
 * sibling capability file directly. Each capability (kind schema, seed-canonical reconcile,
 * criterion pointer + display-canonical title, hash-anchor freshness, story-author write-scope)
 * is already proven in isolation by its own `*.test.ts`; this file pins the STORY-level outcome:
 * a consumer that imports `@storytree/uat-criterion` (the barrel, not a deep sibling path) must
 * actually get the working contract.
 *
 * `packages/uat-criterion/src/index.ts` at HEAD is a bootstrap-only doc comment with no
 * re-exports at all — every assertion below currently fails because the symbol it pulls off the
 * barrel is `undefined`. Each test genuinely DRIVES behaviour (round-trip / kind-fenced reconcile
 * / display-title / hash-freshness / scope-fence) through whatever the barrel provides; none of
 * them merely check that a name is present. Deletion check: remove the eventual barrel
 * re-exports and every test below returns to red — each one both requires the symbol and then
 * exercises real behaviour through it.
 *
 * Sibling-module types are pulled in purely via `typeof import(...)` type queries (erased at
 * runtime, zero coupling) so the values fetched off the barrel are cast to their real shape;
 * only the BARREL's runtime bindings are ever invoked below.
 */

type DetailKindModule = typeof import("./detail-kind.js");
type CriterionPointerModule = typeof import("./criterion-pointer.js");
type DetailHashModule = typeof import("./detail-hash.js");
type DetailSeedSyncModule = typeof import("./detail-seed-sync.js");
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

// ── uat-2: seed-canonical reconcile is kind-fenced and idempotent ──────────

test("uat-2: the root barrel's reconcileDetails upserts, deletes stale, and leaves other kinds untouched", async () => {
  const reconcileDetails = need<DetailSeedSyncModule["reconcileDetails"]>("reconcileDetails");

  const source = new InMemoryStore();
  await source.upsertDoc({ id: "s1#c1", kind: "uat-criterion", doc: WELL_FORMED_DETAIL });

  const target = new InMemoryStore();
  await target.upsertDoc({
    id: "s1#gone",
    kind: "uat-criterion",
    doc: { ...WELL_FORMED_DETAIL, id: "s1#gone" },
  });
  await target.upsertDoc({ id: "p1", kind: "principle", doc: { id: "p1", kind: "principle" } });

  const result = await reconcileDetails(source, target);
  assert.deepEqual(result.upserted, ["s1#c1"]);
  assert.deepEqual(result.deleted, ["s1#gone"]);
  assert.ok(await target.getDoc("p1"), "an unrelated kind must be left untouched by the sync");
  assert.equal(await target.getDoc("s1#gone"), null, "the stale detail of THIS kind must be deleted");
});

test("uat-2: a second reconcile via the barrel is a no-op (inSync, nothing left to delete)", async () => {
  const reconcileDetails = need<DetailSeedSyncModule["reconcileDetails"]>("reconcileDetails");
  const source = new InMemoryStore();
  await source.upsertDoc({ id: "s1#c1", kind: "uat-criterion", doc: WELL_FORMED_DETAIL });
  const target = new InMemoryStore();

  await reconcileDetails(source, target);
  const second = await reconcileDetails(source, target);
  assert.deepEqual(second.deleted, []);
  assert.equal(second.inSync, true);
});

// ── uat-3: the criterion points; the story title stays display-canonical ───

test("uat-3: the root barrel binds a criterion to a detail id and displayTitle stays story-owned", () => {
  const bindDetail = need<CriterionPointerModule["bindDetail"]>("bindDetail");
  const displayTitle = need<CriterionPointerModule["displayTitle"]>("displayTitle");

  const criterion = Criterion.parse({ id: "demo-story#uat-1", title: "The one-line title" });
  const binding = bindDetail(criterion, "demo-story#detail-1");
  assert.equal(binding.detailArtifactId, "demo-story#detail-1");
  assert.equal(displayTitle(binding), "The one-line title");
});

test("uat-3: displayTitle never surfaces a resolved detail body's prose, even when one is attached", () => {
  const bindDetail = need<CriterionPointerModule["bindDetail"]>("bindDetail");
  const displayTitle = need<CriterionPointerModule["displayTitle"]>("displayTitle");
  const UatCriterionDetail = need<DetailKindModule["UatCriterionDetail"]>("UatCriterionDetail");

  const criterion = Criterion.parse({ id: "demo-story#uat-1", title: "The one-line title" });
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

test("uat-5: the root barrel's write-scope predicate admits stories/** and the detail seed surface", () => {
  const isStoryAuthorWriteAllowed = need<StoryAuthorScopeModule["isStoryAuthorWriteAllowed"]>(
    "isStoryAuthorWriteAllowed",
  );
  const seedDir = need<StoryAuthorScopeModule["UAT_CRITERION_DETAIL_SEED_DIR"]>(
    "UAT_CRITERION_DETAIL_SEED_DIR",
  );

  assert.equal(isStoryAuthorWriteAllowed("stories/demo-story/story.md"), true);
  assert.equal(isStoryAuthorWriteAllowed(`${seedDir}demo-story#uat-1.json`), true);
});

test("uat-5: the root barrel's write-scope predicate denies a neighbouring kind and every foreign path", () => {
  const isStoryAuthorWriteAllowed = need<StoryAuthorScopeModule["isStoryAuthorWriteAllowed"]>(
    "isStoryAuthorWriteAllowed",
  );
  const seedRoot = need<StoryAuthorScopeModule["LIBRARY_SEED_KIND_ROOT"]>("LIBRARY_SEED_KIND_ROOT");

  assert.equal(isStoryAuthorWriteAllowed(`${seedRoot}agent/story-author.json`), false);
  assert.equal(isStoryAuthorWriteAllowed("packages/uat-criterion/src/index.ts"), false);
  assert.equal(isStoryAuthorWriteAllowed("docs/decisions/0209-model-uat-promotion.md"), false);
});

// ── uat-6: offline seed resolve matches the reconciled contract ────────────

test("uat-6: a detail resolved from the seed store after reconcile parses and hashes identically to the source", async () => {
  const reconcileDetails = need<DetailSeedSyncModule["reconcileDetails"]>("reconcileDetails");
  const UatCriterionDetail = need<DetailKindModule["UatCriterionDetail"]>("UatCriterionDetail");
  const computeDetailHash = need<DetailHashModule["computeDetailHash"]>("computeDetailHash");

  const source = new InMemoryStore();
  await source.upsertDoc({ id: "demo-story#uat-1", kind: "uat-criterion", doc: WELL_FORMED_DETAIL });
  const target = new InMemoryStore();
  await reconcileDetails(source, target);

  const resolved = await target.getDoc("demo-story#uat-1");
  assert.ok(resolved, "the detail must resolve from the target after reconcile");
  const detail = UatCriterionDetail.parse(resolved!.doc);
  assert.equal(detail.action, WELL_FORMED_DETAIL.action);
  assert.equal(computeDetailHash(detail), computeDetailHash(WELL_FORMED_DETAIL));
});
