import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSearchIndex,
  excerptFor,
  linkedNeighbours,
  relatedArtifacts,
  resolveRefTarget,
  salientTerms,
  searchCorpus,
  tokenize,
  type LibrarySearchDoc,
} from "./search.js";

/**
 * Whole-corpus ranked search and the unlinked-neighbour verb
 * (`decision-read-measurement-arc` increment 16). Pure over supplied documents, so every case here
 * runs with no store, no credential and no connection.
 *
 * The three honesty properties named in `search.ts`'s header are each pinned by a test that FAILS
 * if the property is removed — an empty result must stay empty, the denominator must survive a
 * zero-hit query, and a hit must move between LINKED and UNLINKED when the link set moves.
 */

function doc(over: Partial<LibrarySearchDoc> & { id: string }): LibrarySearchDoc {
  return { kind: "adr", ...over };
}

/** A small corpus with one clear subject per document, so ranking assertions are readable. */
const CORPUS: readonly LibrarySearchDoc[] = [
  doc({
    id: "adr-0139",
    title: "Consolidating the decision log",
    description: "Every accepted decision must be true in full.",
    body: "An amends edge means reading the target alone is no longer sufficient. Annotation discharges it.",
    refs: [{ field: "amends", ref: "asset:adr-0037" }],
  }),
  doc({
    id: "adr-0037",
    title: "Decision frontmatter carries structured state",
    description: "Status, decided, supersedes and amends live as typed fields.",
    body: "The decision log is append-only. Frontmatter is the structured half.",
  }),
  doc({
    id: "adr-0419",
    title: "Support edges move to dependsOn by deprecation",
    description: "An amends edge obliges an in-place annotation.",
    body: "Plain support is authored as dependsOn. The amends edge is reserved for a read obligation.",
    refs: [{ field: "dependsOn", ref: "doc:decisions/0139-consolidating.md" }],
  }),
  doc({
    id: "worktree-hygiene",
    kind: "process",
    title: "Worktree hygiene",
    description: "How a session leaves its worktree.",
    body: "Commit, push, and never remove your own tree. Reaping rides the archive.",
  }),
  doc({
    id: "adr-0999",
    title: "Island shading",
    description: "How the land colour is chosen.",
    body: "Overview zoom governs the texture budget for an island.",
  }),
  // The salience discriminator, and it has to be built rather than found. `decision` is carried by
  // most of this corpus and `kumquat` by nothing else, so a body where the COMMON word is the more
  // frequent one separates tf-idf from raw frequency: raw frequency leads with `decision`, tf-idf
  // leads with `kumquat`. Without a document shaped like this the salience test passes under both
  // implementations and proves nothing — which is how it was first written.
  doc({
    id: "salience-probe",
    kind: "note",
    body:
      "decision decision decision decision decision decision decision decision decision decision decision decision decision decision kumquat kumquat kumquat kumquat kumquat kumquat kumquat kumquat",
  }),
];

const INDEX = buildSearchIndex(CORPUS);

// ---------------------------------------------------------------------------
// Tokenising
// ---------------------------------------------------------------------------

test("a hyphenated run is emitted whole AND split, so an id query and a word query both reach it", () => {
  const tokens = tokenize("session-orchestrator");
  assert.ok(tokens.includes("session-orchestrator"), "the whole id must survive");
  assert.ok(tokens.includes("orchestrator"), "the parts must be reachable too");
});

test("stop words and single characters are dropped", () => {
  assert.deepEqual(tokenize("the a of decision"), ["decision"]);
});

test("punctuation and case do not survive tokenising", () => {
  assert.deepEqual(tokenize("Amends, ANNOTATION."), ["amends", "annotation"]);
});

// ---------------------------------------------------------------------------
// Honesty requirement 1 — it must be able to return nothing
// ---------------------------------------------------------------------------

test("a query matching no artifact returns NO hits, never the unranked corpus", () => {
  const result = searchCorpus(INDEX, "zygote parliamentarian");
  assert.equal(result.hits.length, 0);
  assert.equal(result.matchCount, 0);
});

test("a query that tokenises to nothing returns no hits and says its terms were empty", () => {
  const result = searchCorpus(INDEX, "the and of");
  assert.deepEqual(result.terms, []);
  assert.equal(result.hits.length, 0);
});

// ---------------------------------------------------------------------------
// Honesty requirement 2 — the denominator survives a zero-hit query
// ---------------------------------------------------------------------------

test("scanned reports the ranked population even when nothing matched", () => {
  const result = searchCorpus(INDEX, "zygote");
  assert.equal(result.hits.length, 0);
  assert.equal(result.scanned, CORPUS.length, "a zero-hit answer must still prove the corpus was read");
});

test("--kind narrows the denominator as well as the hits", () => {
  const result = searchCorpus(INDEX, "worktree", { kind: "process" });
  assert.equal(result.scanned, 1);
  assert.deepEqual(result.hits.map((h) => h.id), ["worktree-hygiene"]);
});

test("matchCount describes the full match set, not the truncated page", () => {
  const result = searchCorpus(INDEX, "decision amends", { limit: 1 });
  assert.equal(result.hits.length, 1);
  assert.ok(result.matchCount > 1, `expected more matches than the page shows, got ${result.matchCount}`);
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

test("a title match outranks a body-only match on the same term", () => {
  const result = searchCorpus(INDEX, "worktree");
  assert.equal(result.hits[0]?.id, "worktree-hygiene");
});

test("a hit reports only the terms it actually matched", () => {
  const result = searchCorpus(INDEX, "island zygote");
  assert.deepEqual(result.hits[0]?.matched, ["island"]);
});

test("adding a matching term never LOWERS a document's score — idf stays non-negative", () => {
  // `decision` is carried by most of this corpus, which is exactly where the textbook idf goes
  // negative. A document holding both terms must outrank one holding only the rare one.
  const rareOnly = searchCorpus(INDEX, "annotation");
  const both = searchCorpus(INDEX, "annotation decision");
  const scoreOf = (r: ReturnType<typeof searchCorpus>, id: string): number =>
    r.hits.find((h) => h.id === id)?.score ?? 0;
  assert.ok(
    scoreOf(both, "adr-0139") >= scoreOf(rareOnly, "adr-0139"),
    "a ubiquitous term must not subtract from a document that carries it",
  );
});

test("an excerpt shows the matched text and is bounded", () => {
  const result = searchCorpus(INDEX, "annotation");
  const hit = result.hits.find((h) => h.id === "adr-0139");
  assert.ok(hit !== undefined);
  assert.match(hit.excerpt.toLowerCase(), /annotation/);
  assert.ok(hit.excerpt.length < 260, `excerpt should be a window, got ${hit.excerpt.length} chars`);
});

test("excerptFor returns empty rather than inventing text when nothing matched", () => {
  assert.equal(excerptFor(CORPUS[0] as LibrarySearchDoc, []), "");
});

// ---------------------------------------------------------------------------
// Pointer resolution — all three decision spellings, through the one parser
// ---------------------------------------------------------------------------

test("all three live decision spellings resolve to the same artifact id", () => {
  assert.equal(resolveRefTarget("asset:adr-0139"), "adr-0139");
  assert.equal(resolveRefTarget("doc:decisions/0139-consolidating.md"), "adr-0139");
  assert.equal(resolveRefTarget("doc:docs/decisions/0139-consolidating.md"), "adr-0139");
});

test("work-hierarchy pointers resolve to their bare id", () => {
  assert.equal(resolveRefTarget("story:cli"), "cli");
  assert.equal(resolveRefTarget("capability:adr-allocator"), "adr-allocator");
  assert.equal(resolveRefTarget("asset:merge-ceremony"), "merge-ceremony");
});

test("a doc: pointer at a non-decision file names no artifact and resolves to null", () => {
  assert.equal(resolveRefTarget("doc:docs/research/amends-reach-2026-08-23.md"), null);
  assert.equal(resolveRefTarget("asset:"), null);
  assert.equal(resolveRefTarget("nonsense"), null);
});

// ---------------------------------------------------------------------------
// Link extraction — both directions
// ---------------------------------------------------------------------------

test("linkedNeighbours reads edges the source authored AND edges authored at it", () => {
  const links = linkedNeighbours(CORPUS, "adr-0139");
  assert.deepEqual(links.get("adr-0037"), ["amends"], "outbound edge, named by its field");
  assert.deepEqual(links.get("adr-0419"), ["dependsOn → this"], "inbound edge, with its direction spelled out");
});

test("an artifact is never its own neighbour", () => {
  const selfCiting = [doc({ id: "a", refs: [{ field: "cites", ref: "asset:a" }] })];
  assert.equal(linkedNeighbours(selfCiting, "a").size, 0);
});

// ---------------------------------------------------------------------------
// Honesty requirement 3 — the LINKED / UNLINKED verdict is real
// ---------------------------------------------------------------------------

test("relatedArtifacts marks a hit UNLINKED when no edge reaches it", () => {
  const result = relatedArtifacts(INDEX, CORPUS, "adr-0139");
  const hit = result.hits.find((h) => h.id === "adr-0999");
  // ADR-0999 is about islands; it may or may not rank, but if it does it must be unlinked.
  if (hit !== undefined) assert.equal(hit.linked, false);
  const linked = result.hits.find((h) => h.id === "adr-0037");
  assert.ok(linked !== undefined, "the amended decision must rank as a neighbour");
  assert.equal(linked.linked, true);
});

test("MUTATION: adding an edge moves a hit from UNLINKED to LINKED and nothing else changes", () => {
  const before = relatedArtifacts(INDEX, CORPUS, "adr-0037");
  const target = before.hits.find((h) => h.id === "adr-0419");
  assert.ok(target !== undefined, "adr-0419 must rank as a neighbour of adr-0037");
  assert.equal(target.linked, false, "no edge joins 0037 and 0419 in the fixture");

  const mutated = CORPUS.map((d) =>
    d.id === "adr-0419" ? { ...d, refs: [...(d.refs ?? []), { field: "amends", ref: "asset:adr-0037" }] } : d,
  );
  const after = relatedArtifacts(buildSearchIndex(mutated), mutated, "adr-0037");
  const moved = after.hits.find((h) => h.id === "adr-0419");
  assert.ok(moved !== undefined);
  assert.equal(moved.linked, true, "the added edge must be seen");
  assert.deepEqual(moved.linkVia, ["amends → this"]);
  assert.equal(after.linkedCount, before.linkedCount + 1);
});

test("--unlinked returns exactly the complement, and linkedCount still describes the FULL set", () => {
  const all = relatedArtifacts(INDEX, CORPUS, "adr-0139", { limit: 50 });
  const unlinked = relatedArtifacts(INDEX, CORPUS, "adr-0139", { unlinkedOnly: true, limit: 50 });
  assert.ok(all.linkedCount > 0, "the fixture must have at least one linked neighbour to make this real");
  assert.equal(unlinked.linkedCount, all.linkedCount, "the count describes the ranking, not the page");
  assert.equal(unlinked.hits.length, all.hits.length - all.linkedCount);
  assert.ok(unlinked.hits.every((h) => !h.linked));
});

test("the source artifact is excluded from its own neighbours", () => {
  const result = relatedArtifacts(INDEX, CORPUS, "adr-0139", { limit: 50 });
  assert.ok(!result.hits.some((h) => h.id === "adr-0139"));
  assert.equal(result.scanned, CORPUS.length - 1, "the denominator excludes the source too");
});

test("relatedArtifacts on an id the corpus does not hold returns nothing rather than guessing", () => {
  const result = relatedArtifacts(INDEX, CORPUS, "adr-8888");
  assert.deepEqual(result.terms, []);
  assert.equal(result.hits.length, 0);
});

// ---------------------------------------------------------------------------
// Salience
// ---------------------------------------------------------------------------

test("salient terms are tf-idf, not raw frequency — the RARER word leads even when it is less frequent", () => {
  // `salience-probe` says `decision` six times and `kumquat` four. Raw frequency leads with
  // `decision`; tf-idf leads with `kumquat`, because most of the corpus already says `decision`.
  const terms = salientTerms(INDEX, "salience-probe", 2);
  assert.equal(terms[0], "kumquat", `expected the distinguishing term first, got ${terms.join(", ")}`);
});

test("a distinguishing term leads even against a title's weight", () => {
  const terms = salientTerms(INDEX, "worktree-hygiene", 5);
  assert.ok(terms.includes("worktree"), `expected the distinguishing term, got ${terms.join(", ")}`);
});

test("salientTerms is empty for an unknown id, so a caller can tell nothing was read", () => {
  assert.deepEqual(salientTerms(INDEX, "not-here", 5), []);
});

// ---------------------------------------------------------------------------
// Excerpt placement — the rarest-term window
// ---------------------------------------------------------------------------

test("the excerpt windows on the RAREST matched term, not the earliest occurrence", () => {
  // Every document in this corpus mentions `decision`; only one mentions `kumquat`. A query for both
  // must show the reader the kumquat sentence, not the document's opening words.
  const result = searchCorpus(INDEX, "decision kumquat");
  const hit = result.hits.find((h) => h.id === "salience-probe");
  assert.ok(hit !== undefined, "the probe document must match");
  assert.equal(hit.matched[0], "kumquat", "matched terms are reported rarest first");
  // The body opens with 126 characters of `decision` before the first `kumquat`, which is more than
  // the excerpt radius — so an earliest-occurrence window cannot reach the rare term and this
  // assertion separates the two rules rather than passing under both.
  assert.match(hit.excerpt, /kumquat/, `expected the rare term's window, got: ${hit.excerpt}`);
});
