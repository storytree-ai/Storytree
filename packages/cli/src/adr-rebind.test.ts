import { InMemoryStore } from "@storytree/storage-protocol";
import { hashSpan } from "@storytree/orchestrator";
import assert from "node:assert/strict";
import test from "node:test";

import { run } from "./commands.js";
import { planRebind, refuteSource } from "./adr-rebind.js";

/**
 * `storytree adr rebind` — THE EXPLICIT FREEZE, END-TO-END through `run([...])` (ADR-0438).
 *
 * `grounded-decisions-arc` increment 03, units 1 and 3.
 *
 * EVERY CLI ASSERTION READS THE ROW BACK OUT OF THE STORE, for the reason `adr-sources.test.ts`
 * records next door: a decision's fields do not flow by spread — several writers name them one by
 * one — so a test over a verb's own return value passes while the row loses the field two layers
 * later (`adr-row-writers-enumerate-fields-and-drop-new-ones`).
 *
 * ## THE EXPECTATION IS NOT DERIVED FROM ITS SUBJECT
 *
 * The fixture tree here is a LITERAL, and the hashes the tests assert are computed by
 * {@link hashSpan} over spans written out in the test itself — never by running the verb and reading
 * back whatever it produced. That distinction is the whole difference between proving the freeze
 * lands the right value and proving it lands *a* value: the second is the fault class this repo has
 * recorded more than any other, and an anchor mechanism asserting its own output would be the
 * purest instance of it.
 *
 * The one thing shared with production is `hashSpan` itself, and that is deliberate rather than
 * sloppy — it is the CONTRACT between this verb and the sweep. If the verb froze a differently
 * normalised value the sweep would report drift on the very next run, so a test that computed its
 * own fingerprint would be pinning a value nothing reads.
 */

const SPAN = "export const answer = 42;\n";
const OTHER = "export const other = 1;\n";
const FILE = "packages/example/src/thing.ts";

// The three fixture trees. `Map` rather than an object literal, and not merely to satisfy the
// linter: a repo-relative lookup is keyed by an ARBITRARY string, so `.get()` returning
// `string | undefined` is the honest signature — an object index would either widen the literal
// away (`no-known-value-widening`) or need a cast to admit a key it does not declare.

/** The tree as it stood when the anchors were authored. */
const TREE_AT_BIND = new Map([[FILE, `${OTHER}${SPAN}`]]);

/** The same tree after `answer` was edited — the span MOVED, everything else is identical. */
const TREE_MOVED = new Map([[FILE, `${OTHER}export const answer = 43;\n`]]);

/** The same tree after `answer` was DELETED — the span cannot be located at all. */
const TREE_GONE = new Map([[FILE, OTHER]]);

const treeReader =
  (tree: ReadonlyMap<string, string>) =>
  (rel: string): string | undefined =>
    tree.get(rel);

/** What `answer`'s declaration hashes to in {@link TREE_AT_BIND} — computed here, not read back. */
const HASH_AT_BIND = hashSpan(SPAN);

async function seed(store: InMemoryStore, number: number, sources: unknown): Promise<string> {
  const id = `adr-${String(number).padStart(4, "0")}`;
  // ONE unconditional spread over a base, chosen by a ternary — the house shape (anti-slop
  // `no-conditional-empty-object-spread` refuses the `...(x ? {y} : {})` form, `no-known-value-
  // widening` refuses an annotated open dictionary). Here it is also the SUBJECT: ADR-0223's
  // absent-vs-empty distinction is the whole three-state field, so a fixture that could not express
  // "the key is not there" would silently test only two of the three states.
  const base = {
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
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
  await store.upsertDoc({ id, kind: "adr", doc: sources === undefined ? base : { ...base, sources } });
  return id;
}

const anchorsOf = async (store: InMemoryStore, id: string): Promise<Record<string, unknown>[]> => {
  const doc = ((await store.getDoc(id))?.doc ?? {}) as Record<string, unknown>;
  return (doc["sources"] ?? []) as Record<string, unknown>[];
};

// ---------------------------------------------------------------------------
// Unit 1 — the freeze
// ---------------------------------------------------------------------------

test("adr rebind --pg FIRST-FREEZES a declared anchor that was never bound (ADR-0438 D3)", async () => {
  // The half ADR-0438 D3 added to this verb. Under the withdrawn ADR-0424 D2 the first hash rode the
  // green flip, so a "rebind" would only ever have re-frozen. With no automatic freeze anywhere, an
  // anchor is BORN unbound and this verb is the only thing that can ever bind it — if it skipped the
  // unbound case, nothing in the system would freeze anything and the sweep would compare nothing
  // forever while reporting a clean corpus.
  const store = new InMemoryStore();
  const id = await seed(store, 900, [{ claim: "D1", file: FILE, symbol: "answer" }]);

  const env = await run(["adr", "rebind", "900"], {
    store,
    writable: true,
    adrSpans: treeReader(TREE_AT_BIND),
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /FIRST FREEZE/);

  const [anchor] = await anchorsOf(store, id);
  assert.equal(anchor?.["boundHash"], HASH_AT_BIND, "the stored hash is the span's, computed here");
  assert.equal(anchor?.["claim"], "D1", "and the identity half is untouched");
});

test("adr rebind --pg RE-FREEZES a bound anchor whose span has moved", async () => {
  // ADR-0139's missing second half landing: the prose was corrected in place, somebody re-read the
  // code, and THIS is the act that records that they did. The old hash is replaced, not merged.
  const store = new InMemoryStore();
  const id = await seed(store, 901, [{ file: FILE, symbol: "answer", boundHash: HASH_AT_BIND }]);

  const env = await run(["adr", "rebind", "901"], {
    store,
    writable: true,
    adrSpans: treeReader(TREE_MOVED),
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /RE-FROZEN/);

  const [anchor] = await anchorsOf(store, id);
  assert.equal(anchor?.["boundHash"], hashSpan("export const answer = 43;\n"));
});

test("adr rebind on an unchanged span writes NOTHING — a re-read that found nothing is not a write", async () => {
  // The `updatedAt` assertion is the load-bearing half. A verb that patched unconditionally would
  // touch the row on every run, and `updatedAt` is what freshness checks elsewhere read — a rebind
  // that reported "fresh" while bumping the timestamp would make every decision look freshly
  // curated by a command that changed nothing.
  const store = new InMemoryStore();
  const id = await seed(store, 902, [{ file: FILE, symbol: "answer", boundHash: HASH_AT_BIND }]);

  const env = await run(["adr", "rebind", "902"], {
    store,
    writable: true,
    adrSpans: treeReader(TREE_AT_BIND),
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /nothing to freeze/);

  const doc = ((await store.getDoc(id))?.doc ?? {}) as Record<string, unknown>;
  assert.equal(doc["updatedAt"], "2026-08-24T00:00:00.000Z", "the row was not touched at all");
});

test("adr rebind WITHOUT --pg is a dry read — it reports the freeze and writes nothing", async () => {
  // The freeze asserts "somebody looked" (ADR-0438 D2), so the author has to be able to SEE what it
  // is about to assert that over before asserting it. A verb whose only mode was the write would
  // make the reading step something you do somewhere else, or not at all.
  const store = new InMemoryStore();
  const id = await seed(store, 903, [{ file: FILE, symbol: "answer" }]);

  const env = await run(["adr", "rebind", "903"], {
    store,
    writable: false,
    adrSpans: treeReader(TREE_AT_BIND),
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /DRY READ/);

  const [anchor] = await anchorsOf(store, id);
  assert.equal(Object.hasOwn(anchor ?? {}, "boundHash"), false, "nothing was frozen");
});

test("adr rebind NEVER freezes a span it cannot locate, and freezes its siblings anyway", async () => {
  // The authoring trap the first drain met: an anchor onto machinery a later decision had deleted
  // bound fine against history and then reported unlocatable forever. Freezing whatever was found
  // would have hidden that at authoring time. Refusing the WHOLE write would be the opposite defect
  // — one bad anchor would block a decision's grounding permanently — and it buys nothing, because
  // the unlocatable one keeps reding the sweep either way.
  const store = new InMemoryStore();
  const id = await seed(store, 904, [
    { claim: "gone", file: FILE, symbol: "answer" },
    { claim: "here", file: FILE, symbol: "other" },
  ]);

  const env = await run(["adr", "rebind", "904"], {
    store,
    writable: true,
    adrSpans: treeReader(TREE_GONE),
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /UNLOCATABLE/);
  assert.match(env.body, /were NOT frozen/);
  // Same rule on the other route out of a drift finding: the fix-the-anchor leg is a WRITE.
  assert.ok(
    env.body.includes("    storytree library artifact edit adr-0904 --set sources=@anchors.json --pg, then rebind"),
    env.body,
  );

  const anchors = await anchorsOf(store, id);
  assert.equal(Object.hasOwn(anchors[0] ?? {}, "boundHash"), false, "the missing span is not frozen");
  assert.equal(anchors[1]?.["boundHash"], hashSpan(OTHER), "its sibling is");
});

test("adr rebind on a decision carrying NO anchors refuses, and points at the authoring route", async () => {
  // It re-reads anchors somebody attested by hand; it never invents them. Auto-anchoring was
  // measured at 795 candidates across 200 decisions, mostly coincidental identifier collisions.
  const store = new InMemoryStore();
  await seed(store, 905, undefined);

  const env = await run(["adr", "rebind", "905"], {
    store,
    writable: true,
    adrSpans: treeReader(TREE_AT_BIND),
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /no code anchors/);
  assert.match(env.body, /NEVER auto-anchor/);
  // The authoring route it points at is a WRITE, so it carries the `edit` verb. Without it the
  // command is a read that exits 0 over the render and stores nothing.
  assert.ok(
    env.body.includes("  storytree library artifact edit adr-0905 --set sources=@anchors.json --pg"),
    env.body,
  );
});

// ---------------------------------------------------------------------------
// Unit 3 — the drain route, and the discharge that is not free
// ---------------------------------------------------------------------------

test("adr rebind --refute WITHOUT --reason is REFUSED, and nothing is written", async () => {
  // THE HEADLINE REFUSAL of unit 3. Refuting says the ANCHOR was the error, so it discharges a
  // finding without repairing anything — the one route that could quietly empty the backlog. A
  // refutation with no recorded reason is indistinguishable from nobody having looked, and it is
  // the cheapest move available, which is exactly why it must not also be the free one.
  const store = new InMemoryStore();
  const id = await seed(store, 906, [{ file: FILE, symbol: "answer", boundHash: HASH_AT_BIND }]);

  const env = await run(["adr", "rebind", "906", "--refute", `${FILE}#answer`], {
    store,
    writable: true,
    adrSpans: treeReader(TREE_AT_BIND),
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /needs --reason/);

  const [anchor] = await anchorsOf(store, id);
  assert.equal(anchor?.["boundHash"], HASH_AT_BIND, "the anchor is exactly as it was");
  assert.equal(Object.hasOwn(anchor ?? {}, "refuted"), false);
});

test("adr rebind --refute --reason RETAINS the anchor, records the why, and strips the hash", async () => {
  // All three properties are one rule. RETAINED: deleting the entry would discharge the finding and
  // take the record of who decided, and why, with it — the sweep could then never print it. WHY:
  // stored on the anchor rather than in a commit message, so a later reader can disagree. HASH
  // STRIPPED: a refuted anchor is not a binding any more, and leaving the hash would keep it in the
  // sweep's comparison set, so the finding would survive its own discharge.
  const store = new InMemoryStore();
  const id = await seed(store, 907, [{ file: FILE, symbol: "answer", boundHash: HASH_AT_BIND }]);

  const env = await run(
    ["adr", "rebind", "907", "--refute", `${FILE}#answer`, "--reason", "the prose never rested on this span"],
    { store, writable: true, adrSpans: treeReader(TREE_MOVED) },
  );
  assert.equal(env.ok, true, env.body);

  const anchors = await anchorsOf(store, id);
  assert.equal(anchors.length, 1, "retained, never deleted");
  assert.equal(anchors[0]?.["refuted"], "the prose never rested on this span");
  assert.equal(Object.hasOwn(anchors[0] ?? {}, "boundHash"), false, "and it is a binding no more");
  assert.equal(anchors[0]?.["file"], FILE, "the identity survives so the sweep can still name it");
});

test("adr rebind --refute on a key this decision does not carry refuses, and lists the keys", async () => {
  // A key that names nothing is a TYPO on a copy-pasted finding id, and the useful answer is the set
  // it could have been. Writing nothing and saying so beats a silent no-op that reports success.
  const store = new InMemoryStore();
  await seed(store, 908, [{ file: FILE, symbol: "answer", boundHash: HASH_AT_BIND }]);

  const env = await run(["adr", "rebind", "908", "--refute", "nope#missing", "--reason", "x"], {
    store,
    writable: true,
    adrSpans: treeReader(TREE_AT_BIND),
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /no anchor keyed/);
  assert.match(env.body, new RegExp(`${FILE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}#answer`));
});

test("adr rebind leaves an already-REFUTED anchor completely alone", async () => {
  // A refutation is a CLOSED matter, not outstanding work. If a later rebind re-froze it, the drain's
  // third discharge would be undone by the routine maintenance of the first — and silently, since
  // the anchor would simply reappear in the comparison set carrying a fresh hash.
  const store = new InMemoryStore();
  const id = await seed(store, 909, [{ file: FILE, symbol: "answer", refuted: "wrong span" }]);

  const env = await run(["adr", "rebind", "909"], {
    store,
    writable: true,
    adrSpans: treeReader(TREE_AT_BIND),
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /refuted/);

  const [anchor] = await anchorsOf(store, id);
  assert.equal(Object.hasOwn(anchor ?? {}, "boundHash"), false, "still not a binding");
  assert.equal(anchor?.["refuted"], "wrong span");
});

test("--reason WITHOUT --refute is refused rather than ignored", async () => {
  // A silently dropped `--reason` is how a durable record gets written and lost inside one command.
  // The flag only ever means one thing here, so an invocation carrying it without its verb is a
  // mistake worth naming — and a rebind needs no reason, because re-reading the code IS the reason.
  const store = new InMemoryStore();
  await seed(store, 910, [{ file: FILE, symbol: "answer" }]);

  const env = await run(["adr", "rebind", "910", "--reason", "because"], {
    store,
    writable: true,
    adrSpans: treeReader(TREE_AT_BIND),
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /--reason means nothing without --refute/);
});

// ---------------------------------------------------------------------------
// The pure core
// ---------------------------------------------------------------------------

test("planRebind reports every anchor, including the ones it will not write", async () => {
  // The plan is the REPORT as well as the write list, so an anchor that produces no write must still
  // produce a row. A planner that returned only the writes would leave `fresh` and `unlocatable`
  // invisible, and "nothing to do" would then look identical to "I could not find half of these".
  const plans = planRebind(
    [
      { file: FILE, symbol: "answer" },
      { file: FILE, symbol: "other", boundHash: hashSpan(OTHER) },
      { file: FILE, symbol: "vanished" },
      { file: "packages/example/src/gone.ts" },
      { file: FILE, symbol: "answer", refuted: "wrong span" },
    ],
    treeReader(TREE_AT_BIND),
  );
  assert.deepEqual(
    plans.map((plan) => plan.kind),
    ["first-freeze", "fresh", "unlocatable", "unlocatable", "refuted"],
  );
});

test("refuteSource strips the hash as it records the reason — one act, never two", async () => {
  // Pinned on the pure core as well as end-to-end because the pair is the invariant: a hand-written
  // `{refuted, boundHash}` entry is the shape a future author gets wrong, and `boundRef` guards it a
  // second time on the read side for exactly that reason.
  const refuted = refuteSource([{ file: FILE, symbol: "answer", boundHash: HASH_AT_BIND }], `${FILE}#answer`, "why");
  assert.equal(refuted.ok, true);
  if (!refuted.ok) return;
  assert.equal(refuted.next[0]?.refuted, "why");
  assert.equal(refuted.next[0]?.boundHash, undefined);
});
