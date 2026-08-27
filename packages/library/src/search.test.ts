import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSearchIndex,
  excerptFor,
  linkedNeighbours,
  relatedArtifacts,
  resolveRefTarget,
  salientTerms,
  stemOf,
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
  // The stems ride ALONGSIDE the words, never instead of them — see the stemming block below.
  assert.deepEqual(tokenize("Amends, ANNOTATION."), ["amends", "amend", "annotation", "annot"]);
});

// ---------------------------------------------------------------------------
// Stemming (ADR-0464 D3) — the measured red was `bypass` never matching `bypassable`
// ---------------------------------------------------------------------------

test("a word and its inflections share a stem, so one query reaches all of them", () => {
  for (const word of ["bypassed", "bypassable", "bypassing", "bypasses"]) {
    assert.ok(
      tokenize(word).includes("bypass"),
      `"${word}" must reach the same stem the bare query "bypass" produces`,
    );
  }
});

test("a -ss word is not read as a plural — the carve-out the whole `bypass` case rests on", () => {
  // Without it `bypass` stems to `bypas` while `bypassed` stems to `bypass`, and the pair this
  // exists to join stops matching. The bare word must be its OWN stem.
  assert.deepEqual(tokenize("bypass"), ["bypass"]);
});

test("the stem is emitted BESIDE the word, so the exact word keeps its own weight", () => {
  const tokens = tokenize("bypassable");
  assert.ok(tokens.includes("bypassable"), "an artifact that says the exact word must still say it");
  assert.ok(tokens.includes("bypass"));
});

test("every stem is a PREFIX of its word — the property excerptFor's indexOf depends on", () => {
  // A rewriting stemmer (`relational` → `relate`) would make `excerptFor` return "" on a real match,
  // which renders as "no context available" and is simply false. Removal-only makes this structural.
  const words = "bypassable annotations increments smallest ranking merged policies gates capability";
  for (const word of words.split(" ")) {
    for (const token of tokenize(word)) {
      assert.ok(word.startsWith(token), `"${token}" must be a prefix of "${word}"`);
    }
  }
});

test("a strip that would leave a fragment is REFUSED, so `capability` is never `cap`", () => {
  // `cap` is a real word in this corpus ("the turn cap"), and conflating it with the definition every
  // session opens is the failure the four-character floor exists to prevent. The shorter `-y` rule
  // still applies, which is what joins `capability` to `capabilities`.
  const tokens = tokenize("capability");
  assert.ok(!tokens.includes("cap"), `the fragment must be refused, got ${tokens.join(", ")}`);
  assert.deepEqual(tokens, ["capability", "capabilit"]);
  assert.ok(tokenize("capabilities").includes("capabilit"), "and the plural must reach the same stem");
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

// ---------------------------------------------------------------------------
// The ranked POPULATION (ADR-0464 D3) — the tier rule and what it reports
// ---------------------------------------------------------------------------

/**
 * A corpus shaped like the live one's fault: a short knowledge artifact whose id IS the query, and
 * transient work records that say the same words at length. On the real corpus this is 66% of 2,545
 * rows; here two rows against one is enough to make the ordering assertion real.
 */
const TIERED: readonly LibrarySearchDoc[] = [
  doc({
    id: "never-bypass-the-gate",
    kind: "guardrail",
    title: "The gate is never bypassable",
    description: "Content invariants can never be bypassed; the gate refuses invalid work.",
  }),
  doc({
    id: "inc-01",
    kind: "increment",
    title: "Land the gate rung",
    body: "The gate refuses. The gate is the rung. Nothing may bypass the gate; the gate bypass check ran.",
  }),
  doc({
    id: "fr-01",
    kind: "friction",
    description: "A gate bypass was attempted and the gate refused; bypass, gate, gate, bypass.",
  }),
  doc({ id: "adr-0500", title: "Something else entirely", body: "Islands and land colour." }),
];
const TIERED_INDEX = buildSearchIndex(TIERED);

test("the transient tier does not outrank the knowledge tier for a query matching both", () => {
  const result = searchCorpus(TIERED_INDEX, "bypass gate");
  assert.deepEqual(
    result.hits.map((h) => h.id),
    ["never-bypass-the-gate"],
    "increment and friction rows must not be ranked against knowledge by default",
  );
});

test("what was held back is COUNTED, so a narrowed ranking cannot read as a whole-corpus one", () => {
  const result = searchCorpus(TIERED_INDEX, "bypass gate");
  assert.equal(result.withheld, 2, "both transient rows are reported");
  assert.equal(result.scanned, 2, "and the denominator describes what was actually ranked");
});

test("a query that matches nothing STILL reports the withheld count", () => {
  // The two facts a caller must be able to separate: "the knowledge tier has nothing for you" and
  // "your answer is in the work log and this call withheld it".
  const result = searchCorpus(TIERED_INDEX, "kumquat");
  assert.equal(result.matchCount, 0);
  assert.equal(result.withheld, 2);
});

test("a NAMED kind is the population — the tier rule does not apply on top of it", () => {
  // The failure this pins: applying the tier filter after `--kind increment` makes the one command
  // that asks for work records the one command that answers zero.
  const result = searchCorpus(TIERED_INDEX, "bypass gate", { kind: "increment" });
  assert.deepEqual(result.hits.map((h) => h.id), ["inc-01"]);
  assert.equal(result.withheld, 0, "nothing is withheld when the caller named the population");
});

test("includeTransient puts the tier back and it can then outrank knowledge", () => {
  const result = searchCorpus(TIERED_INDEX, "bypass gate", { includeTransient: true });
  assert.equal(result.scanned, 4);
  assert.equal(result.withheld, 0);
  assert.ok(
    result.hits.some((h) => h.kind === "increment" || h.kind === "friction"),
    "the opt-out must actually widen the population, not merely re-label it",
  );
});

test("relatedArtifacts obeys the same tier rule, and says how much it held back", () => {
  // The measured second fault: asked for neighbours of a guardrail it returned work-log rows matched
  // on shared vocabulary — rows that author no edges, so `--unlinked` was trivially true of them.
  const result = relatedArtifacts(TIERED_INDEX, TIERED, "never-bypass-the-gate");
  assert.ok(!result.hits.some((h) => h.kind === "increment" || h.kind === "friction"));
  assert.equal(result.withheld, 2);
  const wide = relatedArtifacts(TIERED_INDEX, TIERED, "never-bypass-the-gate", { includeTransient: true });
  assert.ok(wide.hits.some((h) => h.kind === "increment" || h.kind === "friction"));
});

test("an artifact's own id is searchable — it is the handle every command uses", () => {
  // Before ADR-0464 D3 the index never read the id. Measured on the live corpus, searching an
  // artifact by its exact id ranked it 9th, 28th and 9th; with the id indexed, 1st, 4th and 1st.
  const result = searchCorpus(TIERED_INDEX, "never-bypass-the-gate");
  assert.equal(result.hits[0]?.id, "never-bypass-the-gate");
});

test("salientTerms drops the unreachable terms ONLY when asked to seed a neighbour query", () => {
  const bare = salientTerms(INDEX, "salience-probe", 5);
  assert.ok(bare.includes("kumquat"), "unfiltered, the most distinguishing term leads");
  const reachable = salientTerms(INDEX, "salience-probe", 5, { reachableOnly: true });
  assert.ok(
    !reachable.includes("kumquat"),
    "a term no other document carries scores zero against every candidate, so it wastes a slot",
  );
});

// ---------------------------------------------------------------------------
// The stemmer's own table — one word per suffix, and the two carve-outs
// ---------------------------------------------------------------------------

/**
 * One word per entry in the suffix table, with the stem it must produce.
 *
 * EXACT EQUALITY, one row per suffix, because the suffixes are ORDERED and a table this shape is the
 * only thing that can tell a deleted rule from a rule the next one happens to cover: drop `ements`
 * and `requirements` still stems — to `require` through `ments`, not to `requir`. A test asserting
 * only "it stems somehow" would pass under both and prove nothing about the order.
 */
const SUFFIX_TABLE: ReadonlyArray<readonly [word: string, stem: string]> = [
  ["followability", "follow"],
  ["operations", "oper"],
  ["requirements", "requir"],
  ["annotation", "annot"],
  ["requirement", "requir"],
  ["arguments", "argu"],
  ["seemingly", "seem"],
  ["bypassable", "bypass"],
  ["markedly", "mark"],
  ["reversible", "revers"],
  ["findings", "find"],
  ["argument", "argu"],
  ["readiness", "readi"],
  ["smallest", "small"],
  ["policies", "polic"],
  ["ranking", "rank"],
  ["ranked", "rank"],
  ["matches", "match"],
  ["quickly", "quick"],
  ["verdicts", "verdict"],
  ["capability", "capabilit"],
];

test("every suffix in the table strips, and strips to exactly the stem the order implies", () => {
  for (const [word, stem] of SUFFIX_TABLE) {
    assert.equal(stemOf(word), stem, `stemOf("${word}")`);
  }
});

test("the -ss carve-out fires ONLY on -ss, and every other -s word still stems", () => {
  assert.equal(stemOf("bypass"), null, "a -ss word is its own stem");
  assert.equal(stemOf("progress"), null);
  assert.equal(stemOf("verdicts"), "verdict", "and an ordinary plural is unaffected");
});

test("a strip that leaves fewer than four characters is skipped, not accepted", () => {
  assert.equal(stemOf("ranking"), "rank", "exactly four is the floor, and the floor is inclusive");
  assert.equal(stemOf("moved"), null, "three would be a fragment, so nothing is stripped");
});

test("the trailing -e rule obeys the same floor, and only fires on a trailing e", () => {
  assert.equal(stemOf("merge"), "merg", "five minus the e is four — it fires");
  assert.equal(stemOf("gate"), null, "four minus the e is three — it does not");
  assert.equal(stemOf("island"), null, "and a word with no trailing e is untouched");
});

test("a two-character token survives; a one-character token does not", () => {
  // MIN_TOKEN_LENGTH is a floor, not a threshold: `db` and `up` are real query words here.
  assert.deepEqual(tokenize("db up"), ["db", "up"]);
  assert.deepEqual(tokenize("x y"), []);
});

// ---------------------------------------------------------------------------
// The id in the index (ADR-0464 D3)
// ---------------------------------------------------------------------------

/** Two artifacts identical in every indexed field EXCEPT their ids. */
const ID_ONLY: readonly LibrarySearchDoc[] = [
  doc({ id: "worktree-provisioning", title: "Alpha", description: "Beta", body: "Gamma delta" }),
  doc({ id: "unrelated-thing", title: "Alpha", description: "Beta", body: "Gamma delta" }),
];

test("a word that appears ONLY in the id is searchable, and finds only that artifact", () => {
  // The sharp form of the id case: `provisioning` is in no title, description or body, so this
  // returns nothing at all unless the id is in the index.
  const result = searchCorpus(buildSearchIndex(ID_ONLY), "provisioning");
  assert.deepEqual(result.hits.map((h) => h.id), ["worktree-provisioning"]);
});

test("related uses a BOUNDED number of the source's terms, and honours an explicit count", () => {
  const bounded = relatedArtifacts(INDEX, CORPUS, "adr-0139");
  assert.ok(bounded.terms.length <= 12, `the default is a cap, got ${bounded.terms.length}`);
  const two = relatedArtifacts(INDEX, CORPUS, "adr-0139", { termCount: 2 });
  assert.equal(two.terms.length, 2, "an explicit count is the count, not a floor");
});
