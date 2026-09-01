/**
 * GOLDEN RENDERS for `library inbound` and the widened `library tree focus` (ADR-0498 D1/D2).
 *
 * WHY A WHOLE-BODY ASSERTION rather than a handful of `assert.match` probes. `check:mutation-diff`
 * reds on a SINGLE survivor and a render is mostly string literals, so every prose word, heading and
 * separator is its own mutant. A `match(/via references/)` kills only the words it quotes and leaves
 * every other literal standing; pinning the entire body kills the whole string-literal class at
 * once. `inbound.test.ts` beside this file keeps the BEHAVIOURAL assertions — what counts as an
 * edge, that the reader and the wall agree — which is what a golden body cannot express.
 *
 * These are deliberately brittle, and that is the point: changing the wording is meant to fail here,
 * where the diff shows exactly which words moved.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { StoredDoc } from "@storytree/storage-protocol";

import { run } from "./commands.js";

function doc(id: string, kind: string, body: Record<string, unknown> = {}): StoredDoc {
  return {
    id,
    kind,
    doc: { id, kind, title: `T ${id}`, ...body },
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as StoredDoc;
}

async function seed(docs: StoredDoc[]): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  for (const d of docs) await store.upsertDoc({ id: d.id, kind: d.kind, doc: d.doc });
  return store;
}

const lines = (...l: readonly string[]): string => l.join("\n");

/** The 2026-09-01 case: the edge sits in `references` residue, and there is no `dependsOn` at all. */
const REPRO: StoredDoc[] = [
  doc("adr-0028", "adr"),
  doc("adr-0018", "adr", { references: ["asset:adr-0017", "asset:adr-0028"] }),
];

test("GOLDEN: `library inbound <adr>` — the whole render, verbatim", async () => {
  const store = await seed(REPRO);
  const env = await run(["library", "inbound", "adr-0028"], { store });
  assert.equal(env.ok, true);
  assert.equal(
    env.body,
    lines(
      "adr-0028 — T adr-0028   [adr]",
      "",
      "1 artifact references this through 1 field — the same population `library artifact retire` enforces.",
      "",
      "  ← adr-0018  T adr-0018  [adr]",
      "      via references[1]",
      "",
      "authored depends_on edges: 0 of 1   (`storytree library tree focus adr-0028` shows only those)",
      "",
      "retirement is not the route while anything points here (ADR-0497 D2) — `retire` deletes",
      "the row, so the wall will refuse. The exit is a CONSOLIDATING SUPERSESSION: the row",
      "survives, so every edge above stays valid, and it leaves `adr list --current`.",
    ),
  );
  assert.deepEqual(env.next, [
    "storytree library artifact adr-0028",
    "storytree library tree focus adr-0028",
  ]);
});

test("GOLDEN: `library tree focus` — both blocks, and the note that neither is the pre-check", async () => {
  const store = await seed(REPRO);
  const env = await run(["library", "tree", "focus", "adr-0028"], { store });
  assert.equal(env.ok, true);
  assert.equal(
    env.body,
    lines(
      "# T adr-0028    [adr]   — tree focus",
      "id: adr-0028",
      "",
      "outbound  (what this stands on — its authored depends_on):",
      "  (none)",
      "",
      "inbound  (authored depends_on — the edges somebody DECLARED):",
      "  (none yet)",
      "",
      "also referenced by  (other reference-bearing fields — the population `retire` enforces):",
      "  ← adr-0018  T adr-0018  [adr]   via references[1]",
      "",
      "note: neither block alone is a retirement pre-check — `storytree library inbound adr-0028` is.",
    ),
  );
});

test("GOLDEN: `library inbound` over every field shape — grouping, ordering and the N-of-M line", async () => {
  const store = await seed([
    doc("target", "pattern"),
    doc("an-agent", "agent", {
      rules: ["asset:target"],
      stepRefs: [{ step: "s", refs: ["asset:target"] }],
    }),
    doc("an-increment", "increment", { arcRef: "asset:target" }),
    doc("a-decision", "adr", { dependsOn: ["asset:target"] }),
  ]);
  const env = await run(["library", "inbound", "target"], { store });
  assert.equal(env.ok, true);
  assert.equal(
    env.body,
    lines(
      "target — T target   [pattern]",
      "",
      "3 artifacts reference this through 4 fields — the same population `library artifact retire` enforces.",
      "",
      "  ← a-decision  T a-decision  [adr]",
      "      via dependsOn[0]",
      "  ← an-agent  T an-agent  [agent]",
      "      via rules[0], stepRefs[0].refs[0]",
      "  ← an-increment  T an-increment  [increment]",
      "      via arcRef",
      "",
      "authored depends_on edges: 1 of 3   (`storytree library tree focus target` shows only those)",
    ),
    // The target is a `pattern`, so the adr-tier supersession block is absent — pinned by absence.
  );
});

test("GOLDEN: tree focus with BOTH blocks populated — sorting, and the same doc never listed twice", async () => {
  // The single-block fixture above leaves the AUTHORED renderer, its sort, and the de-dup that
  // keeps `alsoRef` disjoint from it all unexercised. `b-declares` is the case that matters: it
  // reaches the target through an authored edge AND a second field, so it belongs in the authored
  // block ONLY — dropping the de-dup would list it in both.
  const store = await seed([
    doc("hub", "pattern"),
    doc("z-declares", "adr", { dependsOn: ["asset:hub"] }),
    doc("b-declares", "agent", { dependsOn: ["asset:hub"], rules: ["asset:hub"] }),
    // TWO unauthored paths, so the wider block's path separator is exercised: without it the two
    // field names run together into one unreadable token and no other fixture would notice.
    doc("m-residue", "adr", { references: ["asset:hub"], rules: ["asset:hub"] }),
  ]);
  const env = await run(["library", "tree", "focus", "hub"], { store });
  assert.equal(
    env.body,
    lines(
      "# T hub    [pattern]   — tree focus",
      "id: hub",
      "",
      "outbound  (what this stands on — its authored depends_on):",
      "  (none)",
      "",
      "inbound  (authored depends_on — the edges somebody DECLARED):",
      "  ← b-declares  T b-declares  [agent]",
      "  ← z-declares  T z-declares  [adr]",
      "",
      "also referenced by  (other reference-bearing fields — the population `retire` enforces):",
      "  ← m-residue  T m-residue  [adr]   via references[0], rules[0]",
      "",
      "note: neither block alone is a retirement pre-check — `storytree library inbound hub` is.",
    ),
  );
});

test("GOLDEN: tree focus whose ONLY edge is OUTBOUND — the note stays off on that alone", async () => {
  // Isolates the outbound half of `hasLibraryEdge`: nothing points at `emitter`, so if the scan for
  // an intra-library outbound line stops working, the no-edges note appears over a real edge.
  const store = await seed([
    doc("emitter", "adr", { dependsOn: ["asset:receiver"] }),
    doc("receiver", "principle"),
  ]);
  const env = await run(["library", "tree", "focus", "emitter"], { store });
  assert.equal(
    env.body,
    lines(
      "# T emitter    [adr]   — tree focus",
      "id: emitter",
      "",
      "outbound  (what this stands on — its authored depends_on):",
      "  → receiver  T receiver  [principle]   (library)",
      "",
      "inbound  (authored depends_on — the edges somebody DECLARED):",
      "  (none yet)",
      "",
      "also referenced by  (other reference-bearing fields — the population `retire` enforces):",
      "  (none)",
      "",
      "note: neither block alone is a retirement pre-check — `storytree library inbound emitter` is.",
    ),
  );
});

test("GOLDEN: tree focus with authored edges but NOTHING in the wider block", async () => {
  // Pins the `(none)` the wider block prints when it is genuinely empty, which is the reading a
  // session acts on. It is also the only shape in which `hasLibraryEdge` rests on `inbound` alone.
  const store = await seed([doc("hub", "pattern"), doc("declares", "adr", { dependsOn: ["asset:hub"] })]);
  const env = await run(["library", "tree", "focus", "hub"], { store });
  assert.equal(
    env.body,
    lines(
      "# T hub    [pattern]   — tree focus",
      "id: hub",
      "",
      "outbound  (what this stands on — its authored depends_on):",
      "  (none)",
      "",
      "inbound  (authored depends_on — the edges somebody DECLARED):",
      "  ← declares  T declares  [adr]",
      "",
      "also referenced by  (other reference-bearing fields — the population `retire` enforces):",
      "  (none)",
      "",
      "note: neither block alone is a retirement pre-check — `storytree library inbound hub` is.",
    ),
  );
});

test("GOLDEN: tree focus on a wholly ISOLATED artifact still carries the no-edges note", async () => {
  // The only shape where `hasLibraryEdge` is false. Without a fixture here, forcing it TRUE — which
  // silently drops the note explaining an empty local DAG — is invisible to every other test.
  const store = await seed([doc("island", "principle"), doc("elsewhere", "principle")]);
  const env = await run(["library", "tree", "focus", "island"], { store });
  assert.equal(
    env.body,
    lines(
      "# T island    [principle]   — tree focus",
      "id: island",
      "",
      "outbound  (what this stands on — its authored depends_on):",
      "  (none)",
      "",
      "inbound  (authored depends_on — the edges somebody DECLARED):",
      "  (none yet)",
      "",
      "also referenced by  (other reference-bearing fields — the population `retire` enforces):",
      "  (none)",
      "",
      "note: neither block alone is a retirement pre-check — `storytree library inbound island` is.",
      "",
      "note: no intra-library edges here yet — typed derives_from / consumes land in a later slice.",
    ),
  );
});

test("GOLDEN: tree focus whose ONLY edge is an outbound `doc:` decision pointer", async () => {
  // `hasLibraryEdge` asks whether ANY outbound line is an intra-library one. A `doc:` pointer is a
  // real outbound edge that is NOT one, so this is the case that separates "some" from "every".
  const store = await seed([
    doc("mixed", "adr", { dependsOn: ["doc:decisions/0001-x.md"] }),
    doc("other", "principle"),
  ]);
  const env = await run(["library", "tree", "focus", "mixed"], { store });
  assert.equal(
    env.body,
    lines(
      "# T mixed    [adr]   — tree focus",
      "id: mixed",
      "",
      "outbound  (what this stands on — its authored depends_on):",
      "  → doc:decisions/0001-x.md   (decision — surfaced on demand)",
      "",
      "inbound  (authored depends_on — the edges somebody DECLARED):",
      "  (none yet)",
      "",
      "also referenced by  (other reference-bearing fields — the population `retire` enforces):",
      "  (none)",
      "",
      "note: neither block alone is a retirement pre-check — `storytree library inbound mixed` is.",
      "",
      "note: no intra-library edges here yet — typed derives_from / consumes land in a later slice.",
    ),
  );
});

test("GOLDEN: an honest CLEAR names the population it checked and the count it scanned", async () => {
  const store = await seed([doc("lonely", "principle"), doc("other", "principle")]);
  const env = await run(["library", "inbound", "lonely"], { store });
  assert.equal(env.ok, true);
  assert.equal(
    env.body,
    lines(
      "lonely — T lonely   [principle]",
      "",
      "nothing references lonely — across EVERY reference-bearing field, which is the same",
      "population `storytree library artifact retire` enforces. So this is an honest CLEAR:",
      "the reference wall will not refuse a retire of it.",
      "",
      "(scanned 2 artifacts. A name that appears only inside PROSE is not an edge —",
      " ADR-0477 — so a paragraph may still mention this by name.)",
    ),
  );
  assert.deepEqual(env.next, [
    "storytree library artifact lonely",
    "storytree library tree focus lonely",
  ]);
});

test("GOLDEN: the help", async () => {
  const store = await seed([doc("p1", "principle")]);
  const env = await run(["library", "inbound"], { store });
  assert.equal(env.ok, true);
  assert.equal(
    env.body,
    lines(
      "storytree library inbound <id>",
      "",
      "  What points at this artifact, and THROUGH WHICH FIELD — over the same population",
      "  `library artifact retire` enforces. The retirement pre-check.",
      "",
      "  `library tree focus <id>` shows the AUTHORED depends_on edge alone, which is what it is",
      "  for. This verb is the wider read: it also sees an agent's context/rules/antiPatterns and",
      "  stepRefs, a process's branchEdges, an increment's arcRef, an open question's settledByRef,",
      "  and residue in the retired `references` list. On 2026-09-01 the narrow view said none and",
      "  the wall then refused — this is the reader that cannot say that (ADR-0498).",
      "",
      "  The field path is the useful half: `via references[13]` says the edge is residue from a",
      "  retired field, `via arcRef` says it is containment. Both need different repointing.",
      "",
      "  A name that appears only inside PROSE is NOT an edge (ADR-0477) — neither here nor at the",
      "  wall. Use `library search` to find those.",
      "",
      "  For a DECISION, any inbound reference means retirement is not the route at all (ADR-0497",
      "  D2) — the exit is a consolidating supersession, which keeps the row and every edge to it.",
      "",
      "  A READ: no --pg needed, a bare library read already dials the live store.",
      "",
      "examples",
      "  storytree library inbound adr-0028",
      "  storytree library inbound merge-ceremony",
    ),
  );
  assert.deepEqual(env.next, ["storytree library inbound adr-0028"]);
});

test("GOLDEN: an absent id is guidance pointing at search, not a throw", async () => {
  const store = await seed([doc("p1", "principle")]);
  const env = await run(["library", "inbound", "ghost"], { store });
  assert.equal(env.ok, false);
  assert.equal(env.body, 'no artifact "ghost" in the corpus. ids are exact and case-sensitive.');
  assert.deepEqual(env.next, ['storytree library search "ghost"', "storytree library"]);
});

test("GOLDEN: the `library` dashboard help advertises the verb", async () => {
  // The surface the 2026-09-01 session was standing on when it reached for the narrow reader.
  const store = await seed([doc("p1", "principle")]);
  const env = await run(["library", "--help"], { store });
  assert.match(
    env.body,
    /storytree library inbound <id> {13}what points at this, and through which field \(the retirement pre-check\)/,
  );
});

test("GOLDEN: `library tree` help routes the wall's question to the right verb", async () => {
  const store = await seed([doc("p1", "principle")]);
  const env = await run(["library", "tree"], { store });
  assert.equal(
    env.body,
    lines(
      "storytree library tree — navigate the DAG, one node at a time.",
      "",
      "  storytree library tree focus <id>   the local DAG of one artifact (in/out edges)",
      "",
      '  For "is anything standing on this?" — the retirement pre-check — reach for',
      "  `storytree library inbound <id>`, which reads every reference-bearing field rather",
      "  than the authored depends_on edge alone (ADR-0498).",
    ),
  );
});
