import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import {
  arcOfUnit,
  buildUnitArcIndex,
  loadUnitArcIndex,
  resolveUnitArcs,
  type UnitArcIndex,
} from "./unit-arc.js";

/**
 * WHICH ARC A UNIT ID BELONGS TO (ADR-0541 D1).
 *
 * The subject is the mixed namespace a traversal trace's `cut_for` holds: arc ids, generated
 * increment ids, and bare increment slugs, none of which can be told apart by their shape. The
 * property under test is that resolution is a LOOKUP and never a pattern match — and that the two
 * empty-arc cases stay distinguishable, which is the whole of ADR-0541 D4.
 */

function stored(kind: string, id: string, doc: Record<string, unknown> = {}) {
  return { id, kind, doc: { kind, id, ...doc }, createdAt: "", updatedAt: "" };
}

const INDEX: UnitArcIndex = buildUnitArcIndex(
  [
    stored("increment", "map-arc-inc-01", { arcRef: "asset:map-arc" }),
    stored("increment", "the-cliffs-dark-base-must-read-against-the-sea", { arcRef: "asset:art-arc" }),
    stored("increment", "orphan-increment", {}),
  ],
  [stored("arc", "map-arc"), stored("arc", "art-arc")],
);

test("a generated increment id resolves through its own arcRef, not through its prefix", () => {
  assert.equal(arcOfUnit("map-arc-inc-01", INDEX), "map-arc");
});

test("a BARE increment slug resolves too — the namespace cannot be read off the string", () => {
  // The measured case that rules out every prefix/suffix heuristic: nothing about this id says
  // "increment", and nothing about it names its arc.
  assert.equal(arcOfUnit("the-cliffs-dark-base-must-read-against-the-sea", INDEX), "art-arc");
});

test("an arc id resolves to itself", () => {
  assert.equal(arcOfUnit("map-arc", INDEX), "map-arc");
});

test("a unit the corpus does not place on an arc resolves to NOTHING, never to a guess", () => {
  // A capability is the ordinary shape here — 20% of the measured September population claimed real
  // work belonging to no arc. It must answer null rather than borrow a lexically similar arc.
  assert.equal(arcOfUnit("traversal-trace-sink", INDEX), null);
  // An id that merely LOOKS like an arc is not one: only the corpus decides.
  assert.equal(arcOfUnit("some-invented-arc", INDEX), null);
});

test("an increment whose arcRef is absent or unreadable is left out of the index, not placeholdered", () => {
  assert.equal(INDEX.incrementArcs.has("orphan-increment"), false);
  assert.equal(arcOfUnit("orphan-increment", INDEX), null);
});

test("buildUnitArcIndex ignores an arcRef that is not an asset: pointer", () => {
  const index = buildUnitArcIndex([stored("increment", "i1", { arcRef: "map-arc" })], []);
  assert.equal(index.incrementArcs.size, 0);
});

// ---------------------------------------------------------------------------
// resolveUnitArcs — ADR-0541 D4's four states, and the two that must never collapse
// ---------------------------------------------------------------------------

test("ONE arc: a single unit resolves to a single-entry arc list", () => {
  assert.deepEqual(resolveUnitArcs(["map-arc-inc-01"], INDEX), {
    units: ["map-arc-inc-01"],
    arcs: ["map-arc"],
  });
});

test("SEVERAL arcs are LISTED, never reduced to one", () => {
  const resolved = resolveUnitArcs(
    ["map-arc-inc-01", "the-cliffs-dark-base-must-read-against-the-sea"],
    INDEX,
  );
  assert.deepEqual(resolved.arcs, ["map-arc", "art-arc"]);
});

test("two units on the SAME arc list it once — first-seen order, deduped", () => {
  const resolved = resolveUnitArcs(["map-arc-inc-01", "map-arc"], INDEX);
  assert.deepEqual(resolved.units, ["map-arc-inc-01", "map-arc"]);
  assert.deepEqual(resolved.arcs, ["map-arc"]);
});

test("WORKED ON NO ARC and ARC NOT RECORDED are different answers — the units are what separates them", () => {
  // ⚠ The load-bearing case (ADR-0541 D4). Both have an empty arc list; only the unit list can tell
  // a session that claimed real unhomed work from a session that recorded nothing at all. A reader
  // that looked only at `arcs` would report the first as the second, inflating September's apparent
  // unknown share from 13% to 33%.
  const noArc = resolveUnitArcs(["forest-scene-model"], INDEX);
  const notRecorded = resolveUnitArcs([], INDEX);
  assert.deepEqual(noArc.arcs, []);
  assert.deepEqual(notRecorded.arcs, []);
  assert.deepEqual(noArc.units, ["forest-scene-model"]);
  assert.deepEqual(notRecorded.units, []);
  assert.notDeepEqual(noArc, notRecorded);
});

test("a blank unit names nobody and a duplicate is not a second unit", () => {
  assert.deepEqual(resolveUnitArcs(["", "   ", "map-arc", "map-arc"], INDEX), {
    units: ["map-arc"],
    arcs: ["map-arc"],
  });
});

test("a unit is trimmed before it is looked up", () => {
  assert.deepEqual(resolveUnitArcs(["  map-arc-inc-01 "], INDEX).arcs, ["map-arc"]);
});

// ---------------------------------------------------------------------------
// loadUnitArcIndex — the store half
// ---------------------------------------------------------------------------

test("loadUnitArcIndex reads increments and arcs from the store", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "a1",
    kind: "arc",
    doc: { kind: "arc", id: "a1", title: "A", description: "d" },
  });
  await store.upsertDoc({
    id: "i1",
    kind: "increment",
    doc: { kind: "increment", id: "i1", title: "I", objective: "o", arcRef: "asset:a1" },
  });
  // A doc of a THIRD kind must not enter either half — the index answers about increments and arcs.
  await store.upsertDoc({
    id: "q1",
    kind: "open-question",
    doc: { kind: "open-question", id: "q1", title: "Q", description: "d", stakes: "s", arcRef: "asset:a1" },
  });

  const index = await loadUnitArcIndex(store);
  assert.equal(arcOfUnit("i1", index), "a1");
  assert.equal(arcOfUnit("a1", index), "a1");
  assert.equal(arcOfUnit("q1", index), null);
});
