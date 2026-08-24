import { InMemoryStore } from "@storytree/storage-protocol";
import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import test from "node:test";

import { run } from "./commands.js";

/**
 * ADR-0424's GROUNDED CLAIMS, END-TO-END through `run([...])`, asserting the STORED ROW.
 *
 * `grounded-decisions-arc` increment 01, units 2 and 4.
 *
 * THIS FILE EXISTS BECAUSE A UNIT TEST CANNOT SEE THE FAULT IT GUARDS. A decision's fields do not
 * flow by spread — four writers name them one by one (`AdrMeta` in `@storytree/drive`,
 * `parseAdrDocument` / `renderAdrDocument` in `@storytree/library`, `scaffoldRow`, and `adrPush`'s
 * `updated` object), so a field added to the schema is dropped by every writer that was not edited
 * and each drop reports `ok: true` (`adr-row-writers-enumerate-fields-and-drop-new-ones`). A test
 * over the scaffold's own return value passes while the row loses the field two layers later. So
 * every assertion here reads the row back out of the store.
 *
 * For `sources` the finding is that THREE of those four writers must NOT carry it, and that is
 * ADR-0424 D6 rather than an omission: the anchors are computed metadata about the CODE, not part of
 * what the decision decided, so they stay off the document a human hand-edits. What has to be proved
 * is therefore the pair — the row keeps them, and the document never sees them.
 */

const NOW = new Date("2026-08-24T02:00:00.000Z");

/** A BOUND anchor: an identity plus the hash frozen at the green flip. */
const BOUND = {
  claim: "D7",
  file: "packages/cli/src/adr-round-trip.ts",
  symbol: "adrPush",
  boundHash: "a1b2c3d4",
};

/** The same anchor before acceptance — declared, with nothing bound to it yet (ADR-0424 D2). */
const DECLARED = { claim: "D2", file: "packages/cli/src/adr.ts", symbol: "scaffoldRow" };

async function seed(store: InMemoryStore, number: number, extra: Record<string, unknown> = {}): Promise<void> {
  const id = `adr-${String(number).padStart(4, "0")}`;
  await store.upsertDoc({
    id,
    kind: "adr",
    doc: {
      kind: "adr",
      id,
      title: "A decision under test",
      description: `ADR-${String(number).padStart(4, "0")} — A decision under test`,
      body: `# ADR-${String(number).padStart(4, "0")}: A decision under test\n\n## Decision\n\nSomething.\n`,
      number,
      status: "accepted",
      supersedes: [],
      loadBearing: false,
      references: [],
      createdAt: "2026-08-23T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:00.000Z",
      ...extra,
    },
  });
}

const rowOf = async (store: InMemoryStore, id: string): Promise<Record<string, unknown>> =>
  ((await store.getDoc(id))?.doc ?? {}) as Record<string, unknown>;

/** Write `document` to a temp path, run the body, and clean up whatever happens. */
async function withDocument(name: string, document: string, body: (path: string) => Promise<void>): Promise<void> {
  const path = `${process.env["TEMP"] ?? "."}/${name}`;
  await writeFile(path, document, "utf8");
  try {
    await body(path);
  } finally {
    await rm(path, { force: true });
  }
}

// ---------------------------------------------------------------------------
// D7 — a push must not be able to clear a drift flag
// ---------------------------------------------------------------------------

test("adr push does NOT clear a decision's anchors — a corrected document is not a re-check", async () => {
  // THE HEADLINE PIN (ADR-0424 D7). `adrPush` writes `{...row, <named fields>}`, so a field it does
  // not name survives. That spread reads like an oversight and is load-bearing here: the anchors say
  // what the code looked like when somebody last checked it, and editing the decision's own PROSE is
  // no evidence at all that anyone re-checked the CODE. If a push could rebind, the cheapest way to
  // clear a drift finding would be to re-push the document that drifted — *halted is never a pass*,
  // wearing a different hat. Rebinding is its own verb (`grounded-decisions-arc-inc-03`), never a
  // flag on this one.
  const store = new InMemoryStore();
  await seed(store, 424, { sources: [BOUND, DECLARED] });
  const before = (await rowOf(store, "adr-0424"))["sources"];

  await withDocument(
    "adr-0424-push.md",
    "---\nstatus: accepted\n---\n# ADR-0424: A decision under test\n\n## Decision\n\nSomething else.\n",
    async (path) => {
      const env = await run(["adr", "push", "424", "--file", path], { store, writable: true });
      assert.equal(env.ok, true, env.body);
    },
  );

  const after = await rowOf(store, "adr-0424");
  assert.match(String(after["body"]), /Something else/, "the document's edit landed");
  assert.deepEqual(after["sources"], before, "and the anchors are untouched");
});

test("adr push cannot ADD anchors — a `sources:` key in the document is refused (ADR-0424 D6)", async () => {
  // The other half of the same rule, and the reason the push CANNOT launder drift even if someone
  // tries the direct route. A hash inside a hand-editable document is not evidence of anything: it
  // is editable to whatever value makes the finding go away. The parser's known-key set refuses it
  // rather than dropping it silently, so the attempt fails loudly and the row is untouched.
  const store = new InMemoryStore();
  await seed(store, 425);

  await withDocument(
    "adr-0425-push.md",
    '---\nstatus: accepted\nsources: ["packages/cli/src/adr.ts"]\n---\n# ADR-0425: A decision under test\n\n## Decision\n\nX.\n',
    async (path) => {
      const env = await run(["adr", "push", "425", "--file", path], { store, writable: true });
      assert.equal(env.ok, false);
      assert.match(env.body, /unknown frontmatter key `sources`/);
    },
  );

  assert.equal(Object.hasOwn(await rowOf(store, "adr-0425"), "sources"), false, "nothing was written");
});

test("adr pull renders a grounded decision with no trace of its anchors", async () => {
  // Completes the round trip end-to-end: if a pull EMITTED the key, the very next push would parse it
  // back and D6 would be dead in practice however the schema is written.
  const store = new InMemoryStore();
  await seed(store, 426, { sources: [BOUND] });
  const out = `${process.env["TEMP"] ?? "."}/adr-0426-pull.md`;
  try {
    const env = await run(["adr", "pull", "426", "--out", out], { store });
    assert.equal(env.ok, true, env.body);
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(out, "utf8");
    assert.doesNotMatch(text, /sources|a1b2c3d4|adrPush/);
  } finally {
    await rm(out, { force: true });
  }
});

// ---------------------------------------------------------------------------
// The scaffold — writer 3, and the absent-not-empty rule at the moment of birth
// ---------------------------------------------------------------------------

test("adr new writes a row carrying NO anchors key at all — absent, never an empty list", async () => {
  // A new decision is born `proposed` and therefore ungrounded (ADR-0424 D2: the truth obligation has
  // not attached yet). ABSENT is what says "nobody has ever grounded this"; a scaffold that emitted
  // `[]` would claim somebody looked, and a coverage reader could never tell the two apart again.
  const store = new InMemoryStore();
  const env = await run(["adr", "new", "--title", "A fresh decision", "--pg"], {
    store,
    writable: true,
    adr: { allocate: async () => ({ number: 900 }) },
  });
  assert.equal(env.ok, true, env.body);
  const row = await rowOf(store, "adr-0900");
  assert.equal(row["status"], "proposed");
  assert.equal(Object.hasOwn(row, "sources"), false);
});

// ---------------------------------------------------------------------------
// The authoring route that exists today — the generic field-scoped edit
// ---------------------------------------------------------------------------

test("library artifact edit --set sources=<json> lands the anchors on the stored row", async () => {
  // Until the binding verb lands (`grounded-decisions-arc-inc-03`) this is the ONLY way to author an
  // anchor, and it needs no wiring: `arrayFieldsForKind` reads the array-typed fields straight off
  // the schema, so the `--set` path parses the value as JSON on the same validated write. Asserting
  // it end-to-end is what makes "the field is authorable today" a fact rather than a hope — and it is
  // also the one route that proves `sources` survives `upcastAndValidate` and the store's own write.
  const store = new InMemoryStore();
  await seed(store, 427);
  const env = await run(
    ["library", "artifact", "edit", "adr-0427", "--set", `sources=${JSON.stringify([BOUND])}`, "--pg"],
    { store, writable: true, now: () => NOW },
  );
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(await rowOf(store, "adr-0427").then((r) => r["sources"]), [BOUND]);
});

test("an UNBOUND anchor survives the write — the three states are not flattened anywhere", async () => {
  // ADR-0424 D2's declared-but-unbound state, proved through the real write path rather than at the
  // schema. A validator or a writer that quietly required `boundHash` would make it impossible to
  // declare an anchor before acceptance, which is the whole moment the binding is supposed to ride.
  const store = new InMemoryStore();
  await seed(store, 428, { status: "proposed" });
  const env = await run(
    ["library", "artifact", "edit", "adr-0428", "--set", `sources=${JSON.stringify([DECLARED])}`, "--pg"],
    { store, writable: true, now: () => NOW },
  );
  assert.equal(env.ok, true, env.body);
  const stored = (await rowOf(store, "adr-0428"))["sources"] as Record<string, unknown>[];
  assert.equal(stored.length, 1);
  assert.equal(Object.hasOwn(stored[0] ?? {}, "boundHash"), false);
});

test("an EMPTIED anchor list is stored as an empty list, not folded into absence", async () => {
  // "Somebody looked and this decision grounds nothing" is a different fact from "nobody looked", and
  // only key presence carries it (ADR-0223). Folding them is what silently decremented a denominator
  // in the `dependsOn` work.
  const store = new InMemoryStore();
  await seed(store, 429, { sources: [BOUND] });
  const env = await run(["library", "artifact", "edit", "adr-0429", "--set", "sources=[]", "--pg"], {
    store,
    writable: true,
    now: () => NOW,
  });
  assert.equal(env.ok, true, env.body);
  const row = await rowOf(store, "adr-0429");
  assert.equal(Object.hasOwn(row, "sources"), true);
  assert.deepEqual(row["sources"], []);
});

test("a malformed anchor is REFUSED at the write, never stored at ok: true", async () => {
  // The strict schema at the write boundary. A typo'd key would otherwise persist and the sweep would
  // compare against a span nobody named — a finding invented out of a bad write.
  const store = new InMemoryStore();
  await seed(store, 430, { sources: [BOUND] });
  const env = await run(
    ["library", "artifact", "edit", "adr-0430", "--set", `sources=${JSON.stringify([{ ...BOUND, verified: true }])}`, "--pg"],
    { store, writable: true, now: () => NOW },
  );
  assert.equal(env.ok, false);
  assert.deepEqual(await rowOf(store, "adr-0430").then((r) => r["sources"]), [BOUND], "the row is as it was");
});
