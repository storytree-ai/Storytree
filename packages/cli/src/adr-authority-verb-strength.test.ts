/**
 * The arms that discriminate `adr authority`'s remaining decisions — each written against a fixture
 * chosen so that the WRONG implementation gives a DIFFERENT answer.
 *
 * Several of these exist because a plausible-looking test could not have failed. The transcribed
 * count is the clearest: a corpus with equally many transcribed and non-transcribed stamps reports
 * the same number whether the predicate reads `=== true` or `!== true`, so the fixture here is
 * deliberately unbalanced. Same shape for the multi-issue refusal (one issue cannot show whether the
 * issues are joined by a newline) and the fence stripping (asserting THAT a fence vanishes does not
 * pin what it is replaced WITH).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { adrAuthority, classifyFromProse, statusSectionOf, type AdrAuthorityDeps } from "./adr-authority-verb.js";

const STOCK = "decided/directed by the owner in conversation on 2026-06-29.";
const idOf = (n: number): string => `adr-${String(n).padStart(4, "0")}`;

async function seed(store: InMemoryStore, number: number, extra: Record<string, unknown> = {}): Promise<void> {
  const id = idOf(number);
  await store.upsertDoc({
    id,
    kind: "adr",
    doc: {
      kind: "adr",
      id,
      title: `Decision ${String(number)}`,
      description: `ADR-${String(number).padStart(4, "0")} — Decision ${String(number)}`,
      body: `# ADR-${String(number).padStart(4, "0")}: D\n\n## Status\n\naccepted.\n`,
      number,
      status: "accepted",
      supersedes: [],
      loadBearing: false,
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
      ...extra,
    },
  });
}

const depsFor = (store: InMemoryStore, writable = true): AdrAuthorityDeps => ({
  store,
  writable,
  actor: "cli@claude/test",
  today: "2026-09-05",
});

const authorityOf = async (store: InMemoryStore, n: number): Promise<Record<string, unknown> | undefined> =>
  ((await store.getDoc(idOf(n)))?.doc as Record<string, unknown> | undefined)?.["authority"] as
    | Record<string, unknown>
    | undefined;

test("statusSectionOf: a fence INSIDE the Status section is stripped, and to NOTHING", () => {
  // Asserting the exact section pins the replacement TEXT. A fence replaced with any other string
  // would still "strip the fence" and would show up here.
  const body = ["# T", "", "## Status", "", "accepted, see", "```", "fenced", "```", "and done.", "", "## Decision", "", "x", ""].join("\n");
  assert.equal(statusSectionOf(body), "\n\naccepted, see\n\nand done.\n\n");
});

test("statusSectionOf: an INLINE `## Status` before the real heading is not mistaken for it", () => {
  // The `^` anchor. Without it the first match is the mid-line mention, and the section returned
  // would be the tail of THAT sentence rather than the record's actual status.
  const body = ["# T", "", "See the ## Status section.", "", "## Status", "", "accepted.", ""].join("\n");
  assert.equal(statusSectionOf(body), "\n\naccepted.\n");
});

test("classifyFromProse: a non-string body classifies to nothing rather than throwing", () => {
  for (const body of [42, null, undefined, {}, ["## Status", STOCK]]) {
    assert.equal(classifyFromProse(body), null, `${JSON.stringify(body)} must classify to nothing`);
  }
});

test("adr authority: only `adr` rows are read — a sibling kind never enters the denominator", async () => {
  // The `queryDocs({ kind: "adr" })` filter. Dropped, every artifact in the corpus would be counted
  // in a figure that claims to describe the decision log.
  const store = new InMemoryStore();
  await seed(store, 100);
  await store.upsertDoc({
    id: "a-principle",
    kind: "principle",
    doc: { kind: "principle", id: "a-principle", title: "P", description: "d", body: "b", number: 999 },
  });
  const env = await adrAuthority(undefined, {}, depsFor(store));
  assert.match(env.body, /0 of 1 decision rows declare a basis/);
});

test("adr authority: the owner's words are TRIMMED before they are stored", async () => {
  const store = new InMemoryStore();
  await seed(store, 100);
  await adrAuthority("100", { basis: "owner-directed", ownerSaid: "  do the thing\n" }, depsFor(store));
  assert.equal((await authorityOf(store, 100))?.["ownerSaid"], "do the thing");
});

test("adr authority: whitespace-only owner words are treated as NO quote, and the refusal says so", async () => {
  // The `!== ""` test after the trim. A blank string is not a directive, and accepting it would let
  // an owner basis validate on evidence that is literally nothing.
  const store = new InMemoryStore();
  await seed(store, 100);
  const env = await adrAuthority("100", { basis: "owner-directed", ownerSaid: "   \n  " }, depsFor(store));
  assert.equal(env.ok, false);
  assert.match(env.body, /must quote the owner verbatim/);
  assert.equal(await authorityOf(store, 100), undefined);
});

test("adr authority: a draft breaking SEVERAL schema rules reports each on its own line", async () => {
  // The refusal joins the schema's issues with a newline. Joined with "", the rules would run
  // together into one unreadable sentence — and a single-issue fixture cannot tell the two apart.
  const store = new InMemoryStore();
  await seed(store, 100);
  const env = await adrAuthority(
    "100",
    { basis: "agent-derived", ownerSaid: "words", transcribedFromProse: true },
    depsFor(store),
  );
  assert.equal(env.ok, false);
  const lines = env.body.split("\n").filter((l) => l.trim() !== "");
  assert.ok(lines.length >= 2, `expected several issues on separate lines, got ${JSON.stringify(env.body)}`);
});

test("adr authority: the index counts TRANSCRIBED stamps, not merely non-quoted ones", async () => {
  // Deliberately UNBALANCED — 1 transcribed against 2 that are not. With equal populations the
  // predicate `=== true` and its negation report the same number, and the assertion cannot fail.
  const store = new InMemoryStore();
  await seed(store, 100, {
    authority: { basis: "owner-directed", scribedBy: "x", at: "d", transcribedFromProse: true },
  });
  await seed(store, 200, {
    authority: { basis: "owner-directed", scribedBy: "x", at: "d", ownerSaid: "his words" },
  });
  await seed(store, 300, { authority: { basis: "agent-flipped", scribedBy: "x", at: "d" } });
  const env = await adrAuthority(undefined, {}, depsFor(store));
  assert.match(env.body, /1 {2}transcribed from the record's own prose/);
  assert.match(env.body, /1 {2}carry his verbatim words/);
});

test("adr authority --backfill: the failure block is separated from the counts by a blank line", async () => {
  const store = new InMemoryStore();
  const id = idOf(100);
  await store.upsertDoc({
    id,
    kind: "adr",
    // No `description`, so it cannot re-validate on the way back in.
    doc: {
      kind: "adr",
      id,
      title: "Broken",
      body: `# ADR-0100: Broken\n\n## Status\n\naccepted — ${STOCK}\n`,
      number: 100,
      status: "accepted",
    },
  });
  const env = await adrAuthority(undefined, { backfill: true }, depsFor(store));
  assert.equal(env.ok, false);
  assert.match(env.body, /\n\n⚠ 1 row\(s\) FAILED:/);
});

test("adr authority <n>: the follow-up offered depends on whether the record is already stamped", async () => {
  // The `next:` ternary. Both arms, because an unconditional one would hand a reader a stamp command
  // for a record that already carries one.
  const store = new InMemoryStore();
  await seed(store, 100);
  await seed(store, 200, { authority: { basis: "agent-derived", scribedBy: "x", at: "d" } });
  assert.deepEqual((await adrAuthority("100", {}, depsFor(store))).next, [
    "storytree library artifact adr-0100",
    "storytree adr authority 100 --basis agent-derived --pg",
  ]);
  assert.deepEqual((await adrAuthority("200", {}, depsFor(store))).next, [
    "storytree library artifact adr-0200",
    "storytree adr authority",
  ]);
});
