import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { Proposal } from "@storytree/library";

import { run } from "./commands.js";
import {
  proposalDescriptionFrom,
  proposalIdFromTitle,
  proposalList,
  proposalNew,
  type ProposalWriteDeps,
} from "./proposal.js";

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const NOW = "2026-08-03T09:15:00.000Z";

function writeDeps(store: InMemoryStore, pg = true, writable = true): ProposalWriteDeps {
  return { store, writable, actor: "test", now: NOW, pg };
}

/** The substance an author supplies: a title plus the six required body fields. */
function body(over: Record<string, string> = {}) {
  return {
    title: "One seed sync verb",
    summary: "Collapse the three seed ceremonies into a single `storytree library sync` command.",
    motivation: "Three near-identical ceremonies, each with its own zero drain ceiling, each red separately.",
    change: "`export-corpus` + `sync-corpus` + `sync-agents` -> one `library sync --pg`.",
    scope: "packages/cli only. The store schema and the seed FORMAT are UNCHANGED.",
    migration: "1. add the verb  2. re-point the three gate checks  3. retire the old flags",
    readiness: "the gate is green and no session holds a --pg write",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// `proposal new` — the SCAFFOLDER (ADR-0287 D1; the `arc new` / `adr new` precedent)
//
// The `proposal` tier had a full KIND_SPECS body table, a schema, and a place in SEED_SCOPE_KINDS —
// and zero instances, because authoring one meant reading KIND_SPECS for the field set and
// hand-writing doc JSON through `library artifact new --file`. These tests pin the contract that
// removes that cost: the author supplies substance, the CLI stamps everything mechanical.
// ---------------------------------------------------------------------------

test("proposal new scaffolds a valid proposal from the six fields — the CLI stamps the rest", async () => {
  const store = new InMemoryStore();
  const res = await proposalNew(writeDeps(store), undefined, body());
  assert.equal(res.ok, true, res.body);
  assert.match(res.body, /created proposal one-seed-sync-verb/);

  const got = (await store.getDoc("one-seed-sync-verb"))?.doc as Record<string, unknown>;
  // The authored fields, verbatim.
  assert.equal(got["title"], "One seed sync verb");
  assert.equal(got["summary"], body().summary);
  assert.equal(got["migration"], body().migration);
  // Everything else is the CLI's — the whole point of the verb.
  assert.equal(got["kind"], "proposal");
  assert.equal(got["id"], "one-seed-sync-verb");
  assert.equal(got["description"], "Collapse the three seed ceremonies into a single `storytree library sync` command.");
  assert.deepEqual(got["references"], []);
  assert.equal(got["createdAt"], NOW);
  assert.equal(got["updatedAt"], NOW);
  assert.equal(typeof got["schemaVersion"], "number", "the upcaster pins the row version");
  // `risks` is the one OPTIONAL body field — absent unless supplied, never stamped empty.
  assert.equal(got["risks"], undefined);

  // It is a real Proposal, not merely a doc the store accepted.
  assert.ok(Proposal.safeParse(got).success);
});

test("a scaffolded proposal is immediately readable by the LIST and ARTIFACT read paths", async () => {
  // Composed outward: a green writer whose output the existing readers can't consume is exactly the
  // trap a per-function suite misses.
  const store = new InMemoryStore();
  await proposalNew(writeDeps(store), undefined, body());

  const list = await proposalList({ store, pg: true });
  assert.equal(list.ok, true);
  assert.match(list.body, /storytree proposal — 1 proposal\(s\)/);
  assert.match(list.body, /one-seed-sync-verb {2}2026-08-03 {2}— One seed sync verb/);

  // The generic artifact reader renders the KIND_SPECS body — every required section present.
  const artifact = await run(["library", "artifact", "one-seed-sync-verb"], { store });
  assert.equal(artifact.ok, true, artifact.body);
  assert.match(artifact.body, /\[proposal\]/);
  assert.match(artifact.body, /\*\*The proposal\.\*\*/);
  assert.match(artifact.body, /## Motivation/);
  assert.match(artifact.body, /## The change/);
  assert.match(artifact.body, /## Migration plan/);
  assert.match(artifact.body, /## Readiness/);
});

test("proposal new names EVERY missing required field in one refusal", async () => {
  const store = new InMemoryStore();
  const bare = await proposalNew(writeDeps(store), undefined, {});
  assert.equal(bare.ok, false);
  // title + the six body fields.
  assert.match(bare.body, /proposal new needs 7 more fields/);
  for (const flag of ["--title", "--summary", "--motivation", "--change", "--scope", "--migration", "--readiness"]) {
    assert.match(bare.body, new RegExp(flag.replace("--", "--")));
  }
  assert.equal((await store.queryDocs({ kind: "proposal" })).length, 0, "nothing written on the way to a refusal");

  // One short → singular, and only the missing one is named.
  const partial = await proposalNew(writeDeps(store), undefined, { ...body(), readiness: undefined });
  assert.equal(partial.ok, false);
  assert.match(partial.body, /proposal new needs one more field/);
  assert.match(partial.body, /--readiness/);
  assert.doesNotMatch(partial.body, /--summary/);

  // Whitespace-only is EMPTY: `Markdown` is `.min(1)`, which a lone newline satisfies while meaning
  // nothing — so the trim happens before the required check, not after.
  const blank = await proposalNew(writeDeps(store), undefined, { ...body(), scope: "  ", migration: "\n" });
  assert.equal(blank.ok, false);
  assert.match(blank.body, /--scope/);
  assert.match(blank.body, /--migration/);
});

test("proposal new refuses offline — the live store is the edit surface", async () => {
  const store = new InMemoryStore();
  const offline = await proposalNew(writeDeps(store, false, false), undefined, body());
  assert.equal(offline.ok, false);
  assert.match(offline.body, /proposal new writes to the shared store — run with --pg/);
  assert.deepEqual(offline.next, ["pnpm db:up", "storytree proposal new --pg"]);
});

test("proposal new refuses an id that already exists — a scaffold never overwrites a parked remedy", async () => {
  const store = new InMemoryStore();
  await proposalNew(writeDeps(store), undefined, body());

  const clash = await proposalNew(writeDeps(store), undefined, { ...body(), summary: "something else entirely." });
  assert.equal(clash.ok, false);
  assert.match(clash.body, /proposal one-seed-sync-verb already exists — edit it, don't recreate it/);
  assert.match(clash.body, /that id was DERIVED from the title "One seed sync verb"/);
  // The parked proposal is untouched — its summary is the original.
  const untouched = (await store.getDoc("one-seed-sync-verb"))?.doc as Record<string, unknown>;
  assert.equal(untouched["summary"], body().summary);

  // Ids are shared across kinds, so another kind holding the id is a distinct, honest refusal.
  await store.upsertDoc({
    id: "taken-by-a-definition",
    kind: "definition",
    doc: {
      kind: "definition",
      id: "taken-by-a-definition",
      title: "T",
      description: "d",
      definition: "d",
      references: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    actor: "test",
  });
  const wrongKind = await proposalNew(writeDeps(store), "taken-by-a-definition", body());
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /already a definition, not a proposal/);
});

test("proposal new takes an explicit positional id, normalising it", async () => {
  const store = new InMemoryStore();
  // A copy-pasted `asset:` ref with stray capitals: normalised rather than minting an id the ref
  // regexes would later reject — which matters here, since the friction item cites it as `asset:<id>`.
  const res = await proposalNew(writeDeps(store), "asset:One Seed Sync", { ...body(), title: "Something else" });
  assert.equal(res.ok, true, res.body);
  assert.match(res.body, /created proposal one-seed-sync\b/);
  assert.ok(await store.getDoc("one-seed-sync"));
  assert.doesNotMatch(res.body, /id derived from the title/);
});

test("proposal new: --description overrides the derived one-liner; long prose keeps its newlines", async () => {
  const store = new InMemoryStore();
  const res = await proposalNew(writeDeps(store), undefined, {
    ...body(),
    migration: "1. step one\n2. step two",
    // A @path-read description arrives with newlines; the card line is a ONE-liner, so it collapses.
    description: "  A hand-written\n  card line.\n",
  });
  assert.equal(res.ok, true, res.body);
  const got = (await store.getDoc("one-seed-sync-verb"))?.doc as Record<string, unknown>;
  assert.equal(got["description"], "A hand-written card line.");
  // The body prose is NOT collapsed — multi-line values are the reason @path exists.
  assert.equal(got["migration"], "1. step one\n2. step two");
  assert.doesNotMatch(res.body, /description derived from the summary/);
});

test("proposal new refuses a title that yields no slug, rather than writing an id-less doc", async () => {
  const store = new InMemoryStore();
  const res = await proposalNew(writeDeps(store), undefined, { ...body(), title: "!!! ???" });
  assert.equal(res.ok, false);
  assert.match(res.body, /could not derive a proposal id from the title "!!! \?\?\?"/);
  assert.equal((await store.queryDocs({ kind: "proposal" })).length, 0);
});

test("proposal new carries the optional risks field when supplied", async () => {
  const store = new InMemoryStore();
  await proposalNew(writeDeps(store), undefined, { ...body(), risks: "a half-applied rename leaves dangling refs" });
  const got = (await store.getDoc("one-seed-sync-verb"))?.doc as Record<string, unknown>;
  assert.equal(got["risks"], "a half-applied rename leaves dangling refs");
  assert.ok(Proposal.safeParse(got).success);
});

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

test("proposalIdFromTitle kebab-cases without inventing a house suffix", () => {
  assert.equal(proposalIdFromTitle("One seed sync verb"), "one-seed-sync-verb");
  assert.equal(proposalIdFromTitle("Collapse the THREE ceremonies"), "collapse-the-three-ceremonies");
  // Unlike `arcIdFromTitle`'s `-arc`, no suffix is appended: this tier has no live ids to observe a
  // convention from, so asserting one would be a convention invented rather than followed.
  assert.doesNotMatch(proposalIdFromTitle("Rename the store"), /proposal/);
  assert.equal(proposalIdFromTitle("!!! ???"), "");
});

test("proposalDescriptionFrom takes the summary's first sentence, capped at a word boundary", () => {
  assert.equal(proposalDescriptionFrom("Collapse three ceremonies. Then retire the flags."), "Collapse three ceremonies.");
  // Newlines from a @path-read value collapse to single spaces.
  assert.equal(proposalDescriptionFrom("  Rename\n  the store.  "), "Rename the store.");
  // No terminator → the whole (flattened) value.
  assert.equal(proposalDescriptionFrom("no full stop here"), "no full stop here");
  // Past the cap → cut at a word boundary, ellipsed, with a dangling separator trimmed.
  const long = proposalDescriptionFrom(`${"word ".repeat(50)}end.`);
  assert.ok(long.length <= 161, long);
  assert.match(long, /…$/);
  assert.doesNotMatch(long, /\s…$/);
});

// ---------------------------------------------------------------------------
// `proposal list` — listable AT ZERO
//
// This deliberately does not defer to `library artifact list proposal`, which derives its category
// list from kinds that HAVE instances and so answers `unknown category "proposal"` on an empty tier
// (friction `an-empty-artifact-kind-is-reported-as-a-kind-that-does-not-exist`). A tier whose job is
// to carry a delivery signal must be readable at zero, because zero is the finding.
// ---------------------------------------------------------------------------

test("proposal list on an empty tier is a first-class answer, not `unknown category`", async () => {
  const store = new InMemoryStore();
  const env = await proposalList({ store, pg: true });
  assert.equal(env.ok, true);
  assert.match(env.body, /0 proposal\(s\)/);
  assert.match(env.body, /the tier is EMPTY, which is a finding rather than a missing kind/);

  // The differential that makes the above meaningful: the generic surface, on the same empty store,
  // reports the kind as if it did not exist. Pin it so the reason this verb exists stays visible —
  // and so a future fix to `listCategory` is a deliberate change here, not a silent one.
  const generic = await run(["library", "artifact", "list", "proposal"], { store });
  assert.equal(generic.ok, false);
  assert.match(generic.body, /unknown category "proposal"/);
});

test("proposal list orders by creation, oldest first, and offers each artifact", async () => {
  const store = new InMemoryStore();
  await proposalNew({ ...writeDeps(store), now: "2026-08-01T00:00:00.000Z" }, "older", body({ title: "Older" }));
  await proposalNew({ ...writeDeps(store), now: "2026-08-05T00:00:00.000Z" }, "newer", body({ title: "Newer" }));

  const env = await proposalList({ store, pg: true });
  assert.equal(env.ok, true);
  assert.ok(env.body.indexOf("older") < env.body.indexOf("newer"), "oldest first");
  assert.match(env.body, /2 proposal\(s\)/);
  assert.deepEqual(env.next?.slice(0, 2), [
    "storytree library artifact older --pg",
    "storytree library artifact newer --pg",
  ]);
});

test("proposal list offline says so; --pg is not implied", async () => {
  const env = await proposalList({ store: new InMemoryStore(), pg: false });
  assert.match(env.body, /reading the OFFLINE seed — run with --pg/);
});

// ---------------------------------------------------------------------------
// dispatch wiring (the `proposal` CLI area)
// ---------------------------------------------------------------------------

test("bare `proposal` and `proposal --help` return the help surface", async () => {
  const store = new InMemoryStore();
  for (const argv of [["proposal"], ["proposal", "--help"]]) {
    const env = await run(argv, { store });
    assert.equal(env.ok, true);
    assert.match(env.body, /the Library's parked-remedy tier/);
    // The help names the fence AND who may write it — the two forced points of ADR-0287.
    assert.match(env.body, /is the `tool` friction route's OUTPUT/);
    assert.match(env.body, /fenced to `stories\/\*\*`/);
  }
});

test("`proposal new` through the real dispatch resolves every prose flag (repeat --change = paragraphs)", async () => {
  const store = new InMemoryStore();
  const env = await run(
    [
      "proposal", "new",
      "--title", "One seed sync verb",
      "--summary", "Collapse the three seed ceremonies into one verb.",
      "--motivation", "three ceilings, three reds",
      // `--change` is declared `multiple` (it is `storytree drift`'s flag too), so repeats must
      // become paragraphs rather than the last one silently winning.
      "--change", "before: three commands",
      "--change", "after: one command",
      "--scope", "packages/cli only",
      "--migration", "1. add  2. re-point  3. retire",
      "--readiness", "gate green, no --pg write in flight",
      "--pg",
    ],
    { store, writable: true },
  );
  assert.equal(env.ok, true, env.body);
  const got = (await store.getDoc("one-seed-sync-verb"))?.doc as Record<string, unknown>;
  assert.equal(got["change"], "before: three commands\n\nafter: one command");
  assert.equal(got["scope"], "packages/cli only");
});

test("`proposal list` and an unknown subcommand route through the dispatch", async () => {
  const store = new InMemoryStore();
  const list = await run(["proposal", "list"], { store });
  assert.equal(list.ok, true);
  assert.match(list.body, /0 proposal\(s\)/);

  const unknown = await run(["proposal", "frobnicate"], { store });
  assert.equal(unknown.ok, false);
  assert.match(unknown.body, /unknown proposal command "frobnicate"/);
});
