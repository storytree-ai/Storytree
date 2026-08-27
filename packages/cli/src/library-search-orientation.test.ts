import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { libraryRelated, librarySearch } from "./library-search.js";
import { SEARCH_ORIENTATION_CORPUS, type OrientationRow } from "./search-orientation-corpus.js";

/**
 * THE ORIENTATION SUITE — the red-green fence ADR-0464 D3 asks for.
 *
 * ## What it holds, and why it is here rather than in `@storytree/library`
 *
 * The ranker's own properties are proved in `search.test.ts` against a literal fixture. This suite
 * proves the thing a SESSION experiences: it types a plain question into `storytree library search`
 * and gets back the artifact that answers it. That runs through the whole path — the `StoredDoc`
 * adapter (which is where the coverage half of the repair lives), the ranker, and the rendering — so
 * it lives where the command does. A regression in ANY of those three shows up here; a suite pointed
 * at the ranker alone would have stayed green through the fault this exists to fence, because the
 * fault was never in the ranker.
 *
 * ## The measured red, and why the controls are asserted too
 *
 * Every unfiltered case below was RED on 2026-08-27 (see the table in `./search-orientation-corpus.ts`
 * for this fixture's ranks and the live corpus's). The two CONTROL cases were already green:
 *
 *   - `--kind guardrail` narrowed the population by hand and ranked the guardrail first, which is
 *     what proved the BM25 scoring was sound and the POPULATION was the fault.
 *   - `"gate never bypassable"` — the artifact's own title words — ranked it first unfiltered.
 *
 * They are asserted rather than assumed, because a repair that fixed the broad path by breaking the
 * narrow one would otherwise land silently: `--kind increment` returning nothing is exactly what a
 * careless reading of the tier rule produces.
 *
 * ## The one thing this suite must never become
 *
 * ⚠ ADR-0464 D9: read frequency is refused as a ranking term, permanently. If a case here is ever
 * made green by "the artifacts sessions open most", the fence has been inverted — the instrument
 * would be measuring its own output, and the unread decision the corpus most needs surfaced is
 * precisely the one such a term drops. Every expectation below is answered by what a row SAYS.
 */

const TOP_N = 3;

async function orientationStore(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  for (const r of SEARCH_ORIENTATION_CORPUS satisfies readonly OrientationRow[]) {
    await store.upsertDoc({ id: r.id, kind: r.kind, doc: r.doc });
  }
  return store;
}

/**
 * The ids of the rendered hits, in rank order.
 *
 * Read off the RENDERED body rather than off a result object, deliberately: what a session sees is
 * the text, and a ranking that was right but printed in the wrong order would be just as wrong.
 * A hit's head line is `  <id>   <title>   [<kind>]`; its excerpt is indented further, and the
 * withheld-count note opens with a bracket, so neither can be mistaken for a hit.
 */
function rankedIds(body: string): string[] {
  const ids: string[] = [];
  for (const line of body.split("\n")) {
    const m = /^ {2}([A-Za-z0-9][\w.-]*) {3}\S/.exec(line);
    if (m?.[1] !== undefined) ids.push(m[1]);
  }
  return ids;
}

/** Every case's answer, and the question a session would really type to look for it. */
const ORIENTATION_CASES = [
  {
    question: "bypass gate",
    answer: "never-bypass-the-gate",
    // THE ORIGINAL RED (ADR-0464): the guardrail whose ID IS THE QUERY did not reach the top five of
    // the live corpus — eleven decisions and nine work-log entries outranked it.
    why: "the guardrail whose id is the query terms",
  },
  {
    question: "what is a capability",
    answer: "capability",
    // The definition tier is the smallest text in the corpus and the most-needed at orientation.
    why: "the definition of the term being asked about",
  },
  {
    question: "smallest unit to green",
    answer: "slow-growth-minimum-to-green",
    // Needs the stemmer (`smallest` → `small`) AND the coverage fix: the phrase this matches on
    // lives in `howToApply`, a per-kind field that was never indexed.
    why: "the principle that states the rule",
  },
  {
    question: "land work merge",
    answer: "merge-ceremony",
    // `merge-ceremony` keeps its whole body in a `steps` field. Before the coverage fix the ranker
    // saw 259 characters of description where the artifact holds several thousand words.
    why: "the process that says how",
  },
] as const;

for (const c of ORIENTATION_CASES) {
  test(`orientation: "${c.question}" returns ${c.answer} in the top ${TOP_N} — ${c.why}`, async () => {
    const store = await orientationStore();
    const env = await librarySearch(store, c.question, { kind: undefined, limit: undefined, all: false });
    assert.equal(env.ok, true);
    const ids = rankedIds(env.body);
    assert.ok(
      ids.slice(0, TOP_N).includes(c.answer),
      `"${c.question}" should surface ${c.answer} in the top ${TOP_N}; got ${JSON.stringify(ids.slice(0, 8))}`,
    );
  });
}

test("CONTROL: the --kind-narrowed path still ranks the guardrail FIRST", async () => {
  // Green before the repair and green after. It is the narrow path that PROVED the ranking was
  // sound, so a repair that broke it would have removed the evidence its own case rests on.
  const store = await orientationStore();
  const env = await librarySearch(store, "bypass gate", { kind: "guardrail", limit: undefined, all: false });
  assert.equal(env.ok, true);
  assert.equal(rankedIds(env.body)[0], "never-bypass-the-gate");
});

test("CONTROL: an artifact asked for in its own title words still ranks FIRST unfiltered", async () => {
  const store = await orientationStore();
  const env = await librarySearch(store, "gate never bypassable", {
    kind: undefined,
    limit: undefined,
    all: false,
  });
  assert.equal(env.ok, true);
  assert.equal(rankedIds(env.body)[0], "never-bypass-the-gate");
});

test("CONTROL: --kind increment still ranks increments — the tier rule is not a ban", async () => {
  // The failure mode this fences is a tier rule applied ON TOP of an explicit kind, which would make
  // the one command that asks for work records the one command that answers zero.
  const store = await orientationStore();
  const env = await librarySearch(store, "gate", { kind: "increment", limit: undefined, all: false });
  assert.equal(env.ok, true);
  const ids = rankedIds(env.body);
  assert.ok(ids.length > 0, `--kind increment must rank increments; got ${JSON.stringify(ids)}`);
  assert.doesNotMatch(env.body, /were NOT ranked/, "a named kind IS the population — nothing is withheld on top of it");
});

// ---------------------------------------------------------------------------
// the withheld tier: counted, named, and reachable
// ---------------------------------------------------------------------------

test("the transient tier is held out of the default ranking, and the count SAYS SO", async () => {
  const store = await orientationStore();
  const env = await librarySearch(store, "gate", { kind: undefined, limit: undefined, all: false });
  assert.equal(env.ok, true);
  assert.match(env.body, /transient work records — increment, friction — were NOT ranked/);
  const kinds = SEARCH_ORIENTATION_CORPUS.filter((r) => r.kind === "increment" || r.kind === "friction");
  assert.match(env.body, new RegExp(`\\(${kinds.length} transient work records`), "the count must be the real one");
});

test("--all puts the transient tier back, and a work record then outranks nothing silently", async () => {
  const store = await orientationStore();
  const narrow = await librarySearch(store, "gate", { kind: undefined, limit: "40", all: false });
  const wide = await librarySearch(store, "gate", { kind: undefined, limit: "40", all: true });
  const narrowIds = new Set(rankedIds(narrow.body));
  const wideIds = rankedIds(wide.body);
  assert.ok(
    wideIds.some((id) => !narrowIds.has(id)),
    "--all must actually widen the population, not merely re-label it",
  );
  assert.doesNotMatch(wide.body, /were NOT ranked/, "nothing is withheld under --all, so nothing should be reported as withheld");
});

// ---------------------------------------------------------------------------
// related --unlinked — the second surface ADR-0464 D3 names
// ---------------------------------------------------------------------------

test("related --unlinked answers with knowledge, not with the work log", async () => {
  // The measured fault: asked for neighbours of `never-bypass-the-gate` it returned increment rows
  // matched on words like "invariants". Those rows author no edges at all, so "nothing links these"
  // was trivially true of every one of them — the verb was answering its own question with the tier
  // that cannot fail it.
  const store = await orientationStore();
  const env = await libraryRelated(store, "never-bypass-the-gate", {
    kind: undefined,
    limit: undefined,
    unlinked: true,
    all: false,
  });
  assert.equal(env.ok, true);
  assert.doesNotMatch(env.body, /\[increment]/);
  assert.doesNotMatch(env.body, /\[friction]/);
  assert.match(env.body, /transient work records/, "and it says what it held back");
});

test("related --all reaches the transient tier when a caller asks for it", async () => {
  const store = await orientationStore();
  const env = await libraryRelated(store, "never-bypass-the-gate", {
    kind: undefined,
    limit: "40",
    unlinked: true,
    all: true,
  });
  assert.equal(env.ok, true);
  assert.match(env.body, /\[increment]/, "the tier is withheld by default, never removed");
});
