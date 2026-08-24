/**
 * WHOLE-CORPUS RANKED SEARCH, AND THE UNLINKED-NEIGHBOUR VERB
 * (`decision-read-measurement-arc` increment 16).
 *
 * ## WHY THIS EXISTS, AND WHY IT IS A PREREQUISITE RATHER THAN A CONVENIENCE
 *
 * The owner directed the retirement of the `amends` edge on 2026-08-23 and attached one condition to
 * it: *"because this may change the structure of how our adrs are linked, we need to make sure
 * theres a mechanism for models to search the corpus and find adrs that are not linked to what they
 * are currently looking at."*
 *
 * Read that precisely, because it asks for MORE than search. Following an edge can only ever return
 * what somebody already linked. The decision that bears on your subject and that NOBODY connected is
 * invisible to every traversal we own — `library tree focus`, the depth walk, `adr list`'s back-edges
 * and `loadBearingReach`'s closure are all edge-following, so all four are blind to exactly the same
 * set. That blindness exists today; retiring an edge type is what makes it worth paying to fix.
 *
 * ## WHAT THE CORPUS HAD INSTEAD, MEASURED BEFORE THIS WAS BUILT
 *
 * - `library query --kind k --where field~value` — case-insensitive SUBSTRING against ONE named
 *   field, unranked. It requires you to already know the word, which is the thing a reader looking
 *   for unfamiliar material does not have.
 * - `library artifact list <category>` — the CLI's own help calls it *"the interim search"*.
 * - `adr list` — titles and edges. It never opens a body.
 *
 * There was no ranked, whole-corpus, whole-body search of any kind.
 *
 * ## WHY THIS IS IN-PROCESS RANKING AND NOT POSTGRES FULL-TEXT SEARCH
 *
 * The obvious alternative is a `tsvector` index and a `search` verb on the `Store` seam. It was
 * declined on the SHAPE of the seam, not on taste. `Store` is a deliberately narrow document/event
 * contract that `InMemoryStore`, `PgLibraryStore` and `HttpStore` are all held to by one shared
 * parity suite (ADR-0259), so a search verb is a three-implementation change plus a migration — and
 * `libraryQuery` ALREADY calls `store.queryDocs()` and scans the whole corpus in process. At ~616
 * artifacts the read is one the caller is paying anyway, so ranking it here costs a traversal of
 * memory that is already resident and buys a module that is pure, browser-safe, and provable against
 * the fixture with no database at all. If the corpus outgrows that, the seam change is still
 * available and this module's SHAPE is what it would have to satisfy.
 *
 * ## THE HONESTY REQUIREMENTS, WHICH ARE THE PART WORTH REVIEWING
 *
 * A search verb is an unusually easy place to build a green check that verified nothing, so three
 * properties are structural rather than incidental:
 *
 * 1. **It must be able to return NOTHING.** A query matching no artifact returns no hits. A ranker
 *    that fell back to "everything, in id order" would look identical to a working one on every
 *    query a reviewer would think to try, and would silently answer "here are your neighbours" for a
 *    corpus that has none.
 * 2. **Every result carries its denominator** ({@link SearchResult.scanned}). "No unlinked
 *    neighbours" and "the corpus was never read" are different facts, and without the count they
 *    render identically — the same distinction `DecisionSupportResolver.decisions` exists to make.
 * 3. **{@link relatedArtifacts} reports LINKED and UNLINKED over the SAME ranking.** It does not run
 *    one query for the linked set and another for the rest. The unlinked set is defined by
 *    subtraction from a single ranked list, so a hit cannot appear in neither, and the linked count
 *    is a check on the link extraction rather than a separate measurement.
 *
 * Pure and browser-safe: no `node:` import, no store, no zod. The CLI supplies the rows.
 */

import { adrDocId, ASSET_REF_PREFIX, parseDecisionPointer } from "./decision-pointer.js";

/**
 * One outbound pointer, WITH the field that authored it.
 *
 * The field is carried rather than flattened away because "linked via `cites`" and "linked via
 * `dependsOn`" are different claims to a reader deciding whether the connection is real — and
 * because a link set that could not name its source field would be unable to say WHICH edge type
 * disappearing changed the answer, which is the whole subject of the arc this was built for.
 */
export interface DocRef {
  /** The field the pointer was authored in — `dependsOn`, `cites`, `references`, `amends`, … */
  readonly field: string;
  /** The pointer exactly as stored, in whichever of the live spellings its author used. */
  readonly ref: string;
}

/**
 * The view of an artifact this module ranks. Structural on purpose: the CLI adapts a `StoredDoc`,
 * a test adapts a fixture literal, and neither shape is imported here.
 */
export interface LibrarySearchDoc {
  readonly id: string;
  readonly kind: string;
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly body?: string | undefined;
  /** Every outbound pointer the artifact authors, from every field that holds one. */
  readonly refs?: readonly DocRef[] | undefined;
}

/** One ranked hit. */
export interface SearchHit {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  /** BM25, summed over the query terms this document actually matched. Comparable within one run only. */
  readonly score: number;
  /** The query terms this document matched — never the ones it did not. */
  readonly matched: readonly string[];
  /** A single window of the source text around the strongest match, for a reader deciding whether to open it. */
  readonly excerpt: string;
}

export interface SearchResult {
  /** The query after tokenising and stop-word removal. EMPTY means the query said nothing searchable. */
  readonly terms: readonly string[];
  /** How many documents were ranked — the denominator. See honesty requirement 2 in the header. */
  readonly scanned: number;
  /** How many documents matched at least one term, BEFORE `limit` truncated the list. */
  readonly matchCount: number;
  readonly hits: readonly SearchHit[];
}

export interface SearchOptions {
  /** Restrict the ranked population to one kind. Absent ranks every kind. */
  readonly kind?: string | undefined;
  /** How many hits to return. The counts above always describe the FULL match set. */
  readonly limit?: number | undefined;
}

/**
 * Words carried by so much of this corpus that their presence in a query says nothing about which
 * artifact is wanted.
 *
 * Deliberately SHORT and deliberately generic-English-only. The temptation is to add the project's
 * own high-frequency vocabulary — `decision`, `artifact`, `session`, `gate` — and it is a trap: BM25
 * already discounts a term that appears in most documents, by measurement, on the corpus as it
 * actually stands. A hand-kept list of domain words would do the same job WORSE (it cannot update
 * itself) and would silently make some queries unanswerable — searching for `gate` is a legitimate
 * thing to want, and a stop-word list is the one mechanism that cannot be overridden by a caller.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "do", "does", "for", "from",
  "had", "has", "have", "how", "in", "into", "is", "it", "its", "not", "of", "on", "or", "our",
  "that", "the", "their", "them", "then", "there", "these", "they", "this", "to", "was", "we",
  "were", "what", "when", "which", "who", "why", "will", "with", "would", "you", "your",
]);

/** Below this length a token is noise in prose and an ordinal in an id; either way it does not discriminate. */
const MIN_TOKEN_LENGTH = 2;

/** BM25 term-frequency saturation. The standard value; nothing here justifies tuning it. */
const BM25_K1 = 1.2;
/** BM25 length normalisation. The standard value. */
const BM25_B = 0.75;

/**
 * Field weights, applied by repeating a field's tokens in the bag.
 *
 * A title match is worth far more than a body match on a corpus whose bodies run to ten thousand
 * characters — without this, one incidental mention inside a long ADR outranks a decision whose
 * TITLE is the subject. The weights are integers because repetition is how BM25 takes them, and
 * fractional weights would need a parallel scoring path for no gain.
 */
const TITLE_WEIGHT = 6;
const DESCRIPTION_WEIGHT = 3;
const BODY_WEIGHT = 1;

const DEFAULT_LIMIT = 20;

/**
 * Split text into search tokens.
 *
 * HYPHENS SURVIVE, AND THEN ALSO SPLIT. `adr-0139`, `session-orchestrator` and `prove-it-gate` are
 * single concepts in this corpus and a tokeniser that shattered them would make the most precise
 * query a reader can type — the id itself — the least effective one. So a hyphenated run is emitted
 * WHOLE and its parts are emitted too: searching `adr-0139` matches the exact id strongly, and
 * searching `orchestrator` still reaches `session-orchestrator`.
 *
 * ⚠ Do not "simplify" this to `split(/\W+/)`. That is the version this replaced, and its failure is
 * invisible: every query still returns plausible results, ranked by the wrong thing.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const runs = text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g);
  if (runs === null) return out;
  for (const run of runs) {
    if (run.includes("-")) {
      if (run.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(run)) out.push(run);
      for (const part of run.split("-")) {
        if (part.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(part)) out.push(part);
      }
      continue;
    }
    if (run.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(run)) out.push(run);
  }
  return out;
}

/** The weighted token bag for one artifact — title tokens repeated, then description, then body. */
function docTokens(doc: LibrarySearchDoc): string[] {
  const bag: string[] = [];
  const push = (text: string | undefined, weight: number): void => {
    if (text === undefined || text === "") return;
    const tokens = tokenize(text);
    for (let i = 0; i < weight; i += 1) bag.push(...tokens);
  };
  push(doc.title, TITLE_WEIGHT);
  push(doc.description, DESCRIPTION_WEIGHT);
  push(doc.body, BODY_WEIGHT);
  return bag;
}

/** Term frequencies for one bag. */
function frequencies(tokens: readonly string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/** One document, prepared for scoring. Built once per ranking pass and reused across queries. */
interface IndexedDoc {
  readonly doc: LibrarySearchDoc;
  readonly tf: Map<string, number>;
  readonly length: number;
}

/**
 * The prepared corpus. Built by {@link buildSearchIndex} and handed to {@link searchCorpus} /
 * {@link relatedArtifacts}, so a caller running several queries — which `related` does by
 * construction — tokenises the corpus once rather than once per query.
 */
export interface SearchIndex {
  readonly docs: readonly IndexedDoc[];
  /** How many documents contain each term at least once. The `df` half of BM25's idf. */
  readonly documentFrequency: ReadonlyMap<string, number>;
  readonly averageLength: number;
  readonly byId: ReadonlyMap<string, LibrarySearchDoc>;
}

export function buildSearchIndex(docs: readonly LibrarySearchDoc[]): SearchIndex {
  const indexed: IndexedDoc[] = [];
  const df = new Map<string, number>();
  let totalLength = 0;
  for (const doc of docs) {
    const tokens = docTokens(doc);
    const tf = frequencies(tokens);
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
    totalLength += tokens.length;
    indexed.push({ doc, tf, length: tokens.length });
  }
  return {
    docs: indexed,
    documentFrequency: df,
    averageLength: docs.length === 0 ? 0 : totalLength / docs.length,
    byId: new Map(docs.map((d) => [d.id, d])),
  };
}

/**
 * BM25 inverse document frequency, in the form that stays non-negative.
 *
 * The textbook `ln((N - df + 0.5) / (df + 0.5))` goes NEGATIVE for a term carried by more than half
 * the corpus, which on a corpus this self-referential is a real case, not a pathological one — and a
 * negative contribution means adding a matching term can LOWER a document's score. The `1 +` form
 * is the standard remedy and is why a query mixing one rare and one ubiquitous term still ranks the
 * document that has both above the document that has only the rare one.
 */
function idf(df: number, total: number): number {
  return Math.log(1 + (total - df + 0.5) / (df + 0.5));
}

/**
 * Score one document, and report the terms it matched RAREST FIRST.
 *
 * The ordering is not cosmetic. {@link excerptFor} windows on the first term in this list, and
 * "earliest occurrence of any matched term" put every decision's excerpt on its own `# ADR-NNNN:
 * <title>` heading — because the heading contains `adr`, which nearly every decision carries, so the
 * window landed at character 2 and showed the reader the title they were already looking at.
 * Windowing on the rarest term instead puts it where the distinguishing evidence is, generically,
 * without a hand-kept list of words this corpus happens to over-use.
 */
/** One document's BM25 score, and the matched terms RAREST-FIRST (the excerpt windows on `[0]`). */
interface DocScore {
  score: number;
  matched: string[];
}

function scoreDoc(index: SearchIndex, entry: IndexedDoc, terms: readonly string[]): DocScore {
  const total = index.docs.length;
  let score = 0;
  const hits: Array<{ term: string; df: number }> = [];
  for (const term of terms) {
    const f = entry.tf.get(term);
    if (f === undefined || f === 0) continue;
    const df = index.documentFrequency.get(term) ?? 0;
    hits.push({ term, df });
    const norm =
      index.averageLength === 0 ? 1 : 1 - BM25_B + (BM25_B * entry.length) / index.averageLength;
    score += idf(df, total) * ((f * (BM25_K1 + 1)) / (f + BM25_K1 * norm));
  }
  hits.sort((a, b) => a.df - b.df || a.term.localeCompare(b.term));
  return { score, matched: hits.map((h) => h.term) };
}

/** How much text an excerpt shows either side of the match. */
const EXCERPT_RADIUS = 90;

/**
 * A single window of source text around the RAREST matched term — `matched` arrives rarest-first
 * from {@link scoreDoc}, so this windows on `matched[0]`.
 *
 * ONE window, not a stitched set of them. A reader is deciding whether to open the artifact, and a
 * concatenation of six fragments joined by ellipses is longer, harder to read, and no more use for
 * that decision than the first honest sentence.
 *
 * Falls back to the next term when the rarest one appears only in the title (which is ranked but is
 * not part of the excerpt haystack) — an empty excerpt on a real match would read as "no context
 * available" when in fact context exists.
 */
export function excerptFor(doc: LibrarySearchDoc, matched: readonly string[]): string {
  // THE BODY FIRST, and the description only when there is no body. On a decision row the stored
  // description is `ADR-NNNN — <title>`, so an excerpt drawn from it repeats the title the reader is
  // already looking at — measured against the live corpus, where every decision hit rendered its own
  // title twice before this line said `body` first.
  const haystack = doc.body !== undefined && doc.body !== "" ? doc.body : (doc.description ?? "");
  if (haystack === "" || matched.length === 0) return "";
  const lower = haystack.toLowerCase();
  // IN ORDER, first hit wins — `matched` is rarest-first, so this is the rarest term that actually
  // occurs in the haystack. Not `Math.min` over all of them: that is the earliest-occurrence rule
  // this replaced, and it is how every decision's excerpt ended up on its own title heading.
  let at = -1;
  for (const term of matched) {
    const found = lower.indexOf(term);
    if (found !== -1) {
      at = found;
      break;
    }
  }
  if (at === -1) return "";
  const start = Math.max(0, at - EXCERPT_RADIUS);
  const end = Math.min(haystack.length, at + EXCERPT_RADIUS);
  const slice = haystack.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${slice}${end < haystack.length ? "…" : ""}`;
}

/**
 * Rank the corpus against a free-text query.
 *
 * Returns NO hits when nothing matches — see honesty requirement 1. A caller rendering this must not
 * paper over an empty result with the unranked corpus.
 */
export function searchCorpus(
  index: SearchIndex,
  query: string,
  opts: SearchOptions = {},
): SearchResult {
  const terms = [...new Set(tokenize(query))];
  const pool = opts.kind === undefined ? index.docs : index.docs.filter((d) => d.doc.kind === opts.kind);
  if (terms.length === 0) return { terms, scanned: pool.length, matchCount: 0, hits: [] };

  const scored: SearchHit[] = [];
  for (const entry of pool) {
    const { score, matched } = scoreDoc(index, entry, terms);
    if (matched.length === 0) continue;
    scored.push({
      id: entry.doc.id,
      kind: entry.doc.kind,
      title: entry.doc.title ?? entry.doc.id,
      score,
      matched,
      excerpt: excerptFor(entry.doc, matched),
    });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    terms,
    scanned: pool.length,
    matchCount: scored.length,
    hits: scored.slice(0, opts.limit ?? DEFAULT_LIMIT),
  };
}

/**
 * Resolve one stored pointer to the artifact id it names, or `null` when it names no artifact.
 *
 * DECISIONS RESOLVE FIRST, through the single parser in `decision-pointer.ts`. All three live
 * spellings of a decision reach the same `adr-NNNN` row, and a reader that handled only the
 * `asset:` one would report a decision's own neighbours as unlinked — the ~35x under-count shape
 * this arc has already been bitten by twice.
 *
 * A `doc:` pointer at a non-decision file (a research note, a workflow) names a REPOSITORY FILE and
 * not an artifact, so it resolves to `null` rather than to a fabricated id.
 */
export function resolveRefTarget(ref: string): string | null {
  const decision = parseDecisionPointer(ref);
  if (decision !== null) return adrDocId(decision.number);
  for (const prefix of [ASSET_REF_PREFIX, "story:", "capability:"]) {
    if (ref.startsWith(prefix)) {
      const id = ref.slice(prefix.length);
      return id === "" ? null : id;
    }
  }
  return null;
}

/** One neighbour, with the verdict this verb exists to deliver. */
export interface RelatedHit extends SearchHit {
  /** True when an edge already joins this artifact to the source, in EITHER direction. */
  readonly linked: boolean;
  /**
   * How the link was made — `dependsOn`, `cites → this`, `amends`, … Empty when `linked` is false.
   * Direction is spelled out because "I point at it" and "it points at me" are different facts to a
   * reader deciding whether the corpus already carries the connection they are about to author.
   */
  readonly linkVia: readonly string[];
}

export interface RelatedResult {
  readonly sourceId: string;
  /** The salient terms lifted from the source artifact — what the ranking actually asked. */
  readonly terms: readonly string[];
  /** How many artifacts were ranked. The denominator; see honesty requirement 2. */
  readonly scanned: number;
  /** How many of the ranked artifacts already carry an edge to or from the source. */
  readonly linkedCount: number;
  readonly hits: readonly RelatedHit[];
}

export interface RelatedOptions extends SearchOptions {
  /** Return only the neighbours no edge reaches — the set edge-following can never surface. */
  readonly unlinkedOnly?: boolean | undefined;
  /** How many of the source's own strongest terms to search with. */
  readonly termCount?: number | undefined;
}

/** How many terms are lifted off the source artifact by default. */
const DEFAULT_TERM_COUNT = 12;

/**
 * The terms that most distinguish one artifact from the rest of the corpus.
 *
 * tf-idf, not raw frequency. Raw frequency returns the words this corpus says most — which are the
 * same for every artifact in it, so every "related" query would return the same neighbours. Ranking
 * by tf·idf instead returns the words that are common IN THIS DOCUMENT and rare everywhere else,
 * which is what makes two artifacts about the same subject find each other.
 */
export function salientTerms(index: SearchIndex, id: string, count: number): string[] {
  const entry = index.docs.find((d) => d.doc.id === id);
  if (entry === undefined) return [];
  const total = index.docs.length;
  const scored: Array<{ term: string; weight: number }> = [];
  for (const [term, f] of entry.tf) {
    const df = index.documentFrequency.get(term) ?? 0;
    // A term carried by EVERY document distinguishes nothing; idf handles that by measurement, and
    // a term unique to this document is kept — it is often the id of the thing itself.
    scored.push({ term, weight: f * idf(df, total) });
  }
  scored.sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));
  return scored.slice(0, count).map((s) => s.term);
}

/**
 * Every artifact id joined to `sourceId` by an authored edge, in either direction, with the field
 * and direction that joined them.
 *
 * BOTH DIRECTIONS, because the question is "does the corpus already connect these?" and an edge
 * answers that whichever end authored it. A one-directional reading would report a decision as an
 * unlinked neighbour of the very decision that amends it.
 */
export function linkedNeighbours(
  docs: readonly LibrarySearchDoc[],
  sourceId: string,
): Map<string, string[]> {
  const links = new Map<string, string[]>();
  const add = (id: string, via: string): void => {
    if (id === sourceId) return;
    const existing = links.get(id);
    if (existing === undefined) links.set(id, [via]);
    else if (!existing.includes(via)) existing.push(via);
  };
  const source = docs.find((d) => d.id === sourceId);
  for (const ref of source?.refs ?? []) {
    const target = resolveRefTarget(ref.ref);
    if (target !== null) add(target, ref.field);
  }
  for (const doc of docs) {
    if (doc.id === sourceId) continue;
    for (const ref of doc.refs ?? []) {
      if (resolveRefTarget(ref.ref) === sourceId) add(doc.id, `${ref.field} → this`);
    }
  }
  return links;
}

/**
 * Rank the corpus by similarity to ONE artifact, and say of each neighbour whether an edge already
 * reaches it.
 *
 * This is the verb the owner asked for. `--unlinked` filters to the set no traversal can reach: the
 * artifacts that are about the same thing and that nobody connected.
 *
 * The source artifact is excluded from its own results — it is trivially its own best match, and
 * including it would waste the first row of every answer.
 */
export function relatedArtifacts(
  index: SearchIndex,
  docs: readonly LibrarySearchDoc[],
  sourceId: string,
  opts: RelatedOptions = {},
): RelatedResult {
  const terms = salientTerms(index, sourceId, opts.termCount ?? DEFAULT_TERM_COUNT);
  const links = linkedNeighbours(docs, sourceId);
  const pool = index.docs.filter(
    (d) => d.doc.id !== sourceId && (opts.kind === undefined || d.doc.kind === opts.kind),
  );
  if (terms.length === 0) {
    return { sourceId, terms, scanned: pool.length, linkedCount: 0, hits: [] };
  }

  const scored: RelatedHit[] = [];
  let linkedCount = 0;
  for (const entry of pool) {
    const { score, matched } = scoreDoc(index, entry, terms);
    if (matched.length === 0) continue;
    const via = links.get(entry.doc.id) ?? [];
    const linked = via.length > 0;
    if (linked) linkedCount += 1;
    scored.push({
      id: entry.doc.id,
      kind: entry.doc.kind,
      title: entry.doc.title ?? entry.doc.id,
      score,
      matched,
      excerpt: excerptFor(entry.doc, matched),
      linked,
      linkVia: via,
    });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  // `linkedCount` counts the FULL ranked set, before the unlinked filter and before `limit` — it is
  // a check on the link extraction, so narrowing it to what is displayed would destroy its purpose.
  const shown = opts.unlinkedOnly === true ? scored.filter((h) => !h.linked) : scored;
  return {
    sourceId,
    terms,
    scanned: pool.length,
    linkedCount,
    hits: shown.slice(0, opts.limit ?? DEFAULT_LIMIT),
  };
}
