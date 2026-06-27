import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";

import { run } from "./commands.js";
import { formatEnvelope } from "./envelope.js";

/**
 * Offline tests (ADR-0023): seed an InMemoryStore from the studio data files via loadCorpus — no
 * Cloud SQL, no API key — and drive `run` exactly as `main` does. Asserts the choose-your-own-
 * adventure contract: a map with a total, drill-in to one artifact, list a category, and that misses
 * are guidance (ok:false + next), never throws.
 */
async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  return store;
}

test("library dashboard reports a total + categories and maps artifacts by id", async () => {
  const env = await run(["library"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /Library: OK — \d+ artifacts across \d+ categories\./);
  assert.match(env.body, /edit-first-curation/);
  // The envelope always carries `next` branches.
  assert.match(formatEnvelope(env), /\nnext:\n/);
});

test("artifact <id> prints the artifact with its id and body", async () => {
  const env = await run(["library", "artifact", "edit-first-curation"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /id: edit-first-curation/);
  assert.match(env.body, /[Ee]dit/);
});

test("artifact list <category> returns rows and a doctrine pointer", async () => {
  const env = await run(["library", "artifact", "list", "principle"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /principle {2}\(\d+\)/);
  assert.ok(env.doctrine && env.doctrine.length > 0, "list emits a doctrine pointer");
});

test("the doctrine pointers are library-sourced (not restated prose) — top help, library help, dashboard", async () => {
  const store = await seeded();
  for (const argv of [[], ["library", "--help"], ["library"]]) {
    const env = await run(argv, { store });
    assert.equal(env.ok, true, `ok: storytree ${argv.join(" ")}`);
    // each surfaces the just-in-time doctrine as a POINTER into the library, with the explore command
    const doctrine = (env.doctrine ?? []).join("\n");
    assert.match(
      doctrine,
      /pull-based-context-architecture — .+ {2}\(storytree library artifact pull-based-context-architecture\)/,
      `storytree ${argv.join(" ")} surfaces a library-sourced doctrine pointer`,
    );
    // the old inline doctrine sentence is gone from the body (no restated prose)
    assert.doesNotMatch(env.body, /choose-your-own-adventure/);
  }
});

test("unknown id is guidance (ok:false + next), not a throw", async () => {
  const env = await run(["library", "artifact", "does-not-exist"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /no artifact "does-not-exist"/);
  assert.ok(env.next && env.next.length > 0);
});

test("unknown category lists the available categories", async () => {
  const env = await run(["library", "artifact", "list", "bogus"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown category "bogus"\. available categories:/);
});

test("an unknown area is guided back to library", async () => {
  const env = await run(["wat"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown area "wat"/);
});

test("the adopt area: bare shows help, `adopt plan` needs a story id, and `story adopt-plan` redirects", async () => {
  const store = await seeded();
  // bare `adopt` shows help listing both actions (the run entry + the offline plan)
  const help = await run(["adopt"], { store });
  assert.equal(help.ok, true);
  assert.match(help.body, /storytree adopt <story-id> --pg/);
  assert.match(help.body, /storytree adopt plan <story-id>/);
  // `adopt plan` with no story id is guidance, not a throw
  const plan = await run(["adopt", "plan"], { store });
  assert.equal(plan.ok, false);
  assert.match(plan.body, /adopt plan needs a story id/);
  // the old `story adopt-plan` path is redirected, not silently broken (the reshape moved it under `adopt`)
  const moved = await run(["story", "adopt-plan"], { store });
  assert.equal(moved.ok, false);
  assert.match(moved.body, /adoption-plan moved to: storytree adopt plan/);
  assert.ok((moved.next ?? []).some((n) => /storytree adopt plan/.test(n)));
});

test("top help and the unknown-area guidance both list the adopt area", async () => {
  const store = await seeded();
  const top = await run([], { store });
  assert.equal(top.ok, true);
  assert.match(top.body, /^\s*adopt\b/m, "top help lists the adopt area");
  const unknown = await run(["wat"], { store });
  assert.equal(unknown.ok, false);
  // the area roster is consistent — it now carries both adopt and the previously-missing drift
  assert.match(unknown.body, /gate, adopt, node/);
  assert.match(unknown.body, /story, drift, adr/);
});

test("the CLI refuses --store memory for a build — there is no run-without-persisting mode (ADR-0081)", async () => {
  // ADR-0081 (amends 0060) removed the in-memory verdict store from the build SURFACE: a --live/--real
  // build always persists so real work feeds the studio, and a --dry-run is already in-memory. The
  // guard fires in the dispatch BEFORE any DB/leaf is touched (so this offline test needs neither).
  // The internal `verdictStore: "memory"` test seam is unaffected — it is not reachable from argv.
  const store = await seeded();
  for (const argv of [
    ["node", "build", "library-cli", "--live", "--store", "memory"],
    ["story", "build", "library", "--real", "--store", "memory"],
    ["node", "build", "library-cli", "--dry-run", "--store", "memory"],
  ]) {
    const env = await run(argv, { store });
    assert.equal(env.ok, false, `expected a refusal for: storytree ${argv.join(" ")}`);
    assert.match(env.body, /--store memory/);
    assert.match(env.body, /no longer|removed|always persist/i);
  }
});

test("tree focus <id> renders the node's outbound source refs", async () => {
  // glossary-wins references doc: pointers (ADRs/glossary) — outbound 'source' edges.
  const env = await run(["library", "tree", "focus", "glossary-wins"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /— tree focus/);
  assert.match(env.body, /outbound/);
  assert.match(env.body, /source — surfaced on demand/);
});

test("tree focus shows inbound intra-library edges (back-edge scan)", async () => {
  // the `trunk` definition has `asset:approval-gated-trunk`, so focusing the target sees it inbound.
  const env = await run(["library", "tree", "focus", "approval-gated-trunk"], {
    store: await seeded(),
  });
  assert.equal(env.ok, true);
  assert.match(env.body, /inbound/);
  assert.match(env.body, /← trunk/);
});

test("tree focus on a missing id is guidance, not a throw", async () => {
  const env = await run(["library", "tree", "focus", "ghost"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /no artifact "ghost" to focus/);
});

const NEW_DOC = JSON.stringify({
  id: "cli-test-note",
  category: "definition",
  title: "CLI test note",
  description: "a throwaway artifact created by a test",
  body: "## What it is\n\nA test.",
  references: [],
});

test("a write without --pg is refused with guidance (not an ephemeral write)", async () => {
  const env = await run(["library", "artifact", "edit", "edit-first-curation", "--set", "description=x"], {
    store: await seeded(),
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /writes go to the shared store/);
  // the WHY is a library-sourced doctrine pointer, not restated prose
  assert.match(
    (env.doctrine ?? []).join("\n"),
    /live-store-is-the-edit-surface — .+ {2}\(storytree library artifact live-store-is-the-edit-surface\)/,
  );
});

test("artifact new creates a validated artifact in a writable store", async () => {
  const store = await seeded();
  const env = await run(["library", "artifact", "new", "--json", NEW_DOC], { store, writable: true });
  assert.equal(env.ok, true);
  assert.match(env.body, /created cli-test-note/);
  const got = await store.getDoc("cli-test-note");
  assert.ok(got, "artifact was persisted");
});

test("artifact new refuses to overwrite an existing id (edit-first)", async () => {
  const store = await seeded();
  const dup = JSON.stringify({
    id: "glossary-wins",
    category: "pattern",
    title: "dupe",
    description: "d",
    body: "b",
    references: [],
  });
  const env = await run(["library", "artifact", "new", "--json", dup], { store, writable: true });
  assert.equal(env.ok, false);
  assert.match(env.body, /already exists — edit it/);
});

test("artifact new rejects an invalid doc with the validation message as guidance", async () => {
  const store = await seeded();
  const env = await run(["library", "artifact", "new", "--json", '{"id":"x"}'], { store, writable: true });
  assert.equal(env.ok, false);
  assert.match(env.body, /failed validation/);
});

test("artifact edit --set patches a field and re-persists", async () => {
  const store = await seeded();
  const env = await run(
    ["library", "artifact", "edit", "edit-first-curation", "--set", "description=patched by test"],
    { store, writable: true },
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /updated edit-first-curation \(set description\)/);
  const got = await store.getDoc("edit-first-curation");
  assert.equal((got?.doc as { description?: string }).description, "patched by test");
});

test("artifact edit on a missing id is guidance", async () => {
  const env = await run(["library", "artifact", "edit", "ghost", "--set", "title=x"], {
    store: await seeded(),
    writable: true,
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /no artifact "ghost" to edit/);
});

test("sync-agents without --pg is refused with the write-surface guidance", async () => {
  const env = await run(["library", "sync-agents"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /writes go to the shared store/);
});

test("sync-agents (writable) reconciles the agent tier to the seed and removes a stale agent", async () => {
  const store = await seeded();
  // A stale agent not present in the seed — sync-agents must delete it.
  await store.upsertDoc({
    id: "stale-agent",
    kind: "agent",
    doc: { id: "stale-agent", kind: "agent" },
  });
  const env = await run(["library", "sync-agents", "--pg"], { store, writable: true });
  assert.equal(env.ok, true);
  assert.match(env.body, /IN SYNC — the live agent tier equals the seed/);

  const agents = (await store.queryDocs({ kind: "agent" })).map((d) => d.id);
  assert.ok(!agents.includes("stale-agent"), "the stale agent was deleted");
  assert.ok(agents.includes("session-orchestrator"), "a known seed agent is present");
  assert.equal(await store.getDoc("stale-agent"), null);
});

test("sync-corpus without --pg is refused with the write-surface guidance", async () => {
  const env = await run(["library", "sync-corpus"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /writes go to the shared store/);
});

test("sync-corpus (writable) migrates a seed-only artifact and never clobbers a live edit", async () => {
  const store = await seeded();
  // Simulate the gap: a graduated seed principle absent from this (fresh-ish) live store. Remove one
  // known seed artifact from the live store so sync-corpus has something to migrate.
  await store.deleteDoc("real-test-must-not-leak-a-handle");
  // And a live-canonical EDIT the seed has not caught up to — sync-corpus must NOT revert it.
  const edited = (await store.getDoc("edit-first-curation"))!;
  await store.upsertDoc({
    id: "edit-first-curation",
    kind: edited.kind,
    doc: { ...(edited.doc as Record<string, unknown>), title: "LIVE EDITED TITLE" },
  });

  const env = await run(["library", "sync-corpus", "--pg"], { store, writable: true });
  assert.equal(env.ok, true);
  assert.match(env.body, /MIGRATED 1 seed-only artifact/);

  // The seed-only artifact was carried across.
  assert.ok(await store.getDoc("real-test-must-not-leak-a-handle"), "seed-only principle migrated");
  // The live edit survived (migrate-only never overwrites a present artifact).
  assert.equal(
    ((await store.getDoc("edit-first-curation"))!.doc as { title: string }).title,
    "LIVE EDITED TITLE",
    "the live-canonical edit was not clobbered",
  );
});

test("sync-corpus (writable) is idempotent — a clean live tier reports nothing to migrate", async () => {
  const store = await seeded();
  const env = await run(["library", "sync-corpus", "--pg"], { store, writable: true });
  assert.equal(env.ok, true);
  assert.match(env.body, /NOTHING TO MIGRATE/);
});

test("artifact edit that breaks the schema is refused, not persisted", async () => {
  const store = await seeded();
  const env = await run(
    ["library", "artifact", "edit", "edit-first-curation", "--set", "bogusField=nope"],
    { store, writable: true },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /would make "edit-first-curation" invalid/);
  const got = await store.getDoc("edit-first-curation");
  assert.equal((got?.doc as { bogusField?: string }).bogusField, undefined, "not persisted");
});
