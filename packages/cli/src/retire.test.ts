import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/base";
import type { StoredDoc } from "@storytree/base";

import { run } from "./commands.js";
import { findDependents, referencedAssetIds } from "./retire.js";

/** A minimal stored doc — retire reads `title`/`kind` and scans the body; it does not re-validate. */
function doc(id: string, kind: string, body: Record<string, unknown> = {}): StoredDoc {
  return { id, kind, doc: { id, kind, title: `T ${id}`, references: [], ...body }, updatedAt: "2026-01-01T00:00:00.000Z" } as StoredDoc;
}

async function seed(docs: StoredDoc[]): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  for (const d of docs) await store.upsertDoc({ id: d.id, kind: d.kind, doc: d.doc });
  return store;
}

// --- the pure reference scan -------------------------------------------------------------------

test("referencedAssetIds pulls asset:<id> from references[], refList fields, and inline prose", () => {
  const ids = referencedAssetIds({
    references: ["asset:alpha", "doc:decisions/0001-x.md"],
    context: ["asset:beta", "asset:gamma"],
    statement: "as noted in asset:delta this matters",
    nested: { deeper: ["asset:alpha"] }, // dupe of alpha — deduped
  });
  assert.deepEqual([...ids].sort(), ["alpha", "beta", "delta", "gamma"]);
});

test("findDependents finds referrers across all fields, excludes self, sorts by id", () => {
  const docs = [
    doc("target", "principle"),
    doc("z-ref", "definition", { references: ["asset:target"] }),
    doc("a-agent", "agent", { rules: ["asset:target"] }), // refList — the field tree-focus misses
    doc("unrelated", "pattern", { references: ["asset:other"] }),
    doc("self-ref", "guardrail", { references: ["asset:self-ref"] }), // never depends on itself
  ];
  const deps = findDependents("target", docs);
  assert.deepEqual(deps.map((d) => d.id), ["a-agent", "z-ref"]);
});

// --- the command (offline, via run) ------------------------------------------------------------

test("retire without --pg is refused (writes go to the shared store)", async () => {
  const store = await seed([doc("p1", "principle")]);
  const env = await run(["library", "artifact", "retire", "p1", "--reason", "obsolete"], { store });
  assert.equal(env.ok, false);
  assert.match(env.body, /writes go to the shared store/);
  assert.ok(await store.getDoc("p1"), "the artifact is untouched");
});

test("retire without --reason is refused (rationale is mandatory)", async () => {
  const store = await seed([doc("p1", "principle")]);
  const env = await run(["library", "artifact", "retire", "p1"], { store, writable: true });
  assert.equal(env.ok, false);
  assert.match(env.body, /retire needs --reason/);
  assert.ok(await store.getDoc("p1"), "nothing deleted");
});

test("retire of an absent id is guidance, not a throw", async () => {
  const store = await seed([doc("p1", "principle")]);
  const env = await run(["library", "artifact", "retire", "ghost", "--reason", "x"], {
    store,
    writable: true,
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /no artifact "ghost" to retire/);
});

test("retire a clean non-OQ artifact deletes it with a recorded rationale + session actor", async () => {
  const store = await seed([doc("p1", "principle")]);
  const env = await run(["library", "artifact", "retire", "p1", "--reason", "folded into p2"], {
    store,
    writable: true,
    actor: "tester@example.com",
  });
  assert.equal(env.ok, true);
  assert.match(env.body, /retired p1 {2}\[principle\]/);
  assert.match(env.body, /reason: folded into p2/);
  assert.equal(await store.getDoc("p1"), null, "row dropped from the projection");
  const deleted = (await store.readEvents({ id: "p1" })).find((e) => e.type === "deleted");
  assert.equal(deleted?.actor, "tester@example.com", "the SESSION actor is stamped, not the curator");
  assert.equal((deleted?.doc as { retiredReason?: string }).retiredReason, "folded into p2");
});

test("retire is HARD-REFUSED while another artifact references it (the only gate)", async () => {
  const store = await seed([
    doc("target", "principle"),
    doc("dependent", "definition", { references: ["asset:target"] }),
  ]);
  const env = await run(["library", "artifact", "retire", "target", "--reason", "x"], {
    store,
    writable: true,
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /cannot retire "target"/);
  assert.match(env.body, /← dependent/);
  assert.ok(await store.getDoc("target"), "the artifact survives the refusal");
});

test("the gate catches an agent refList dependency (not just references[])", async () => {
  // The trap: tree-focus's inbound scan only reads references[]; an agent inlines an asset via a
  // refList field. The retire gate must see it, or it would wave through the most common dependency.
  const store = await seed([
    doc("inlined-asset", "pattern"),
    doc("an-agent", "agent", { rules: ["asset:inlined-asset"] }),
  ]);
  const env = await run(["library", "artifact", "retire", "inlined-asset", "--reason", "x"], {
    store,
    writable: true,
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /cannot retire "inlined-asset"/);
  assert.match(env.body, /← an-agent/);
});

test("a malformed --superseded-by is refused with guidance", async () => {
  const store = await seed([doc("p1", "principle")]);
  const env = await run(
    ["library", "artifact", "retire", "p1", "--reason", "x", "--superseded-by", "garbage"],
    { store, writable: true },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /bad --superseded-by/);
  assert.ok(await store.getDoc("p1"), "nothing deleted on a bad ref");
});

test("a valid --superseded-by (doc: or asset:) folds onto the delete event", async () => {
  const store = await seed([doc("p1", "principle")]);
  const env = await run(
    ["library", "artifact", "retire", "p1", "--reason", "x", "--superseded-by", "doc:decisions/0059-x.md"],
    { store, writable: true },
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /superseded by: doc:decisions\/0059-x\.md/);
  const deleted = (await store.readEvents({ id: "p1" })).find((e) => e.type === "deleted");
  assert.equal((deleted?.doc as { supersededBy?: string }).supersededBy, "doc:decisions/0059-x.md");
});
