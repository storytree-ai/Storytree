import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { libraryQuery, libraryQueryHelp, type QueryOptions } from "./library-query.js";

/**
 * `storytree library query` — the ad-hoc predicate read (`tool-signal-gaps-arc`, from friction
 * `no-verb-answers-an-ad-hoc-question-of-the-live-store`).
 *
 * The predicate LANGUAGE is proved in `@storytree/library`'s `query.test.ts`. What is proved here is
 * the CLI-shaped half a session actually meets: the count answer, the refusals, and the fact that a
 * bad flag is reported rather than silently producing an empty — an empty result and a rejected
 * query look identical to a caller, and reading "0" as an answer is the failure this verb exists to
 * remove.
 */

async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "alpha-arc",
    kind: "arc",
    doc: { id: "alpha-arc", kind: "arc", title: "Alpha", lifecycle: "active" },
  });
  await store.upsertDoc({
    id: "beta-arc",
    kind: "arc",
    doc: { id: "beta-arc", kind: "arc", title: "Beta drift", lifecycle: "closed" },
  });
  await store.upsertDoc({
    id: "gamma-arc",
    kind: "arc",
    doc: { id: "gamma-arc", kind: "arc", title: "Gamma" },
  });
  await store.upsertDoc({
    id: "inc-1",
    kind: "increment",
    doc: { id: "inc-1", kind: "increment", outcome: { pr: 1234 }, anchor: { sha: "abc" } },
  });
  return store;
}

const base: QueryOptions = {
  kind: undefined,
  where: [],
  field: undefined,
  count: false,
  limit: undefined,
};

test("--count answers the `how many rows of kind K satisfy P` question with the number alone", async () => {
  const env = await libraryQuery(await seeded(), {
    ...base,
    kind: "arc",
    where: ["lifecycle=active"],
    count: true,
  });
  assert.equal(env.ok, true);
  assert.equal(env.body, "1");
});

test("the row render names the total it was drawn from, so a count is never read out of context", async () => {
  const env = await libraryQuery(await seeded(), { ...base, kind: "arc", where: ["title~drift"] });
  assert.equal(env.ok, true);
  assert.match(env.body, /^1 of 3 arc matching `title~drift`/);
  assert.match(env.body, /beta-arc/);
});

test("--field projects a dotted path instead of the title", async () => {
  const env = await libraryQuery(await seeded(), {
    ...base,
    kind: "increment",
    field: "outcome.pr",
  });
  assert.equal(env.ok, true);
  assert.match(env.body, /inc-1\s+1234/);
});

test("a MISSING --kind is refused and LISTS the available kinds", async () => {
  const env = await libraryQuery(await seeded(), { ...base });
  assert.equal(env.ok, false);
  assert.match(env.body, /needs --kind/);
  assert.match(env.body, /arc, increment/);
});

test("an UNKNOWN kind is refused with the same list — never answered as an empty result", async () => {
  const env = await libraryQuery(await seeded(), { ...base, kind: "arcs" });
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown kind "arcs"/);
  assert.match(env.body, /arc, increment/);
});

test("EVERY malformed clause is reported at once, not one re-run at a time", async () => {
  const env = await libraryQuery(await seeded(), {
    ...base,
    kind: "arc",
    where: ["lifecycle", "title", "lifecycle=active"],
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /2 malformed --where clauses/);
  assert.match(env.body, /--where lifecycle\s/);
  assert.match(env.body, /--where title\s/);
  assert.match(env.body, /operators:/, "the refusal teaches the language it just rejected");
});

test("a malformed clause REFUSES rather than returning an empty match — the whole point of the verb", async () => {
  // A silently-dropped clause would return `ok: true` with a plausible number, which is exactly the
  // class of defect this arc exists to close: a command that runs to completion and reports
  // something that is not the thing the caller asked for.
  const env = await libraryQuery(await seeded(), { ...base, kind: "arc", where: ["bogus"] });
  assert.equal(env.ok, false);
});

test("--limit caps the rows and SAYS it truncated; the count line still reflects the full set", async () => {
  const env = await libraryQuery(await seeded(), { ...base, kind: "arc", limit: "2" });
  assert.equal(env.ok, true);
  assert.match(env.body, /^3 of 3 arc/, "the header counts every match, not the shown rows");
  assert.match(env.body, /… 1 more/);
});

test("a non-numeric --limit is refused rather than silently defaulting", async () => {
  for (const bad of ["zero", "0", "-3", "2.5"]) {
    const env = await libraryQuery(await seeded(), { ...base, kind: "arc", limit: bad });
    assert.equal(env.ok, false, `--limit ${bad} should refuse`);
    assert.match(env.body, /positive whole number/);
  }
});

test("no clauses is a valid query — --kind alone lists the kind", async () => {
  const env = await libraryQuery(await seeded(), { ...base, kind: "arc" });
  assert.equal(env.ok, true);
  assert.match(env.body, /^3 of 3 arc$/m, "no predicate clause is named when there is none");
});

test("the help page names every operator the parser accepts", async () => {
  const env = libraryQueryHelp();
  assert.equal(env.ok, true);
  for (const op of ["field=value", "field!=value", "field~value", "field?", "field!?"]) {
    assert.ok(env.body.includes(op), `help must document ${op}`);
  }
});
