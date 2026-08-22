import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore, type StoreEvent } from "@storytree/storage-protocol";

import { arcCommand } from "./arc.js";
import type { ArcRollupIncrement } from "./arc-rollup.js";
import {
  NAMED_LANDING_CAP,
  deriveArcNarrativeStaleness,
  narrativeLastChangedAt,
  renderNarrativeStaleness,
} from "./narrative-staleness.js";

// The arc narrative staleness signal (`arc-narrative-staleness-signal`, `session-ambition-arc`).
//
// THE RED CASE THIS EXISTS FOR is `redCase()` below — the measured shape from the friction that
// produced the increment: an intent written on 2026-07-24 still pitching, as the strongest unspent
// candidate, work that landed on 2026-08-03 and is listed in the log directly beneath it. Every
// other test here is a fence around that one: the boundary where it must go quiet, the third state
// where it must say "unknown" rather than nothing, and — the load-bearing one — the lifecycle
// recompute that must NOT be mistaken for the prose being revisited.

let seq = 0;

/** One history row. `doc` is the whole arc as it stood after that write, exactly as the store keeps it. */
function ev(at: string, doc: Record<string, unknown>, type: StoreEvent["type"] = "updated"): StoreEvent {
  seq += 1;
  return { seq, id: "a1", kind: "arc", type, doc, actor: "cli", at };
}

function closed(id: string, date: string, extra: Record<string, unknown> = {}): ArcRollupIncrement {
  return {
    id,
    title: `${id} title`,
    objective: "o",
    status: "closed",
    outcome: { date, ...(extra["pr"] !== undefined ? { pr: extra["pr"] as string } : {}) },
  };
}

function open(id: string, status = "proposal"): ArcRollupIncrement {
  return { id, title: `${id} title`, objective: "o", status };
}

const PROSE = { intent: "the intent prose", endState: "the end state prose" };

/**
 * The measured shape from `arc-narrative-fields-have-no-staleness-signal`: prose authored at
 * chartering, three landings after it, and — critically — a LIFECYCLE recompute after those landings
 * that touched the arc doc without touching the prose.
 */
function redCase(): ReturnType<typeof deriveArcNarrativeStaleness> {
  const chartered = { ...PROSE, lifecycle: "active" };
  return deriveArcNarrativeStaleness({
    ...PROSE,
    increments: [closed("inc-10", "2026-08-03", { pr: "#1108" }), closed("inc-11", "2026-08-06"), open("inc-12")],
    events: [
      ev("2026-07-24T09:00:00.000Z", chartered, "created"),
      // ADR-0335: an increment write recomputes the arc's lifecycle and patches `updatedAt` on the
      // ARC. The prose is untouched, so this must not read as the narrative being revisited.
      ev("2026-08-06T18:00:00.000Z", { ...chartered, lifecycle: "active", updatedAt: "2026-08-06" }),
    ],
  });
}

test("RED: prose written before landings on the same arc is reported stale, and the landings are named", () => {
  const s = redCase();
  assert.equal(s.stale, true, "the friction's own shape must fire");
  assert.equal(s.undatable, false);

  const intent = s.fields.find((f) => f.field === "intent");
  assert.ok(intent);
  assert.equal(intent.lastWrittenAt, "2026-07-24T09:00:00.000Z");
  assert.deepEqual(
    intent.unseen.map((l) => l.id),
    ["inc-11", "inc-10"],
    "newest landing first",
  );
  assert.equal(intent.unseen[0]?.date, "2026-08-06");

  // The endState is prose with the same (absent) producer, so it goes stale on the same evidence.
  const endState = s.fields.find((f) => f.field === "endState");
  assert.equal(endState?.unseen.length, 2);

  const body = renderNarrativeStaleness(s, "a1").join("\n");
  assert.match(body, /NARRATIVE STALENESS/);
  assert.match(body, /inc-10/);
  assert.match(body, /#1108/, "the landing ref is what a reader follows");
  assert.match(body, /2026-07-24/, "when the prose was written");
  assert.match(body, /storytree arc edit a1/, "the correct-in-place next step");
});

test("a lifecycle recompute does NOT refresh the narrative stamp (the arc's own updatedAt is not the source)", () => {
  // Without this, the signal inverts: `recomputeArcLifecycle` patches the ARC on every increment
  // write, so the more an arc lands the fresher its prose would look. Deleting the fold and reading
  // `arc.updatedAt` instead passes every other test in this file and fails only this one.
  const s = redCase();
  const intent = s.fields.find((f) => f.field === "intent");
  assert.equal(intent?.lastWrittenAt, "2026-07-24T09:00:00.000Z");
  assert.notEqual(intent?.lastWrittenAt, "2026-08-06T18:00:00.000Z");
  assert.equal(s.stale, true);
});

test("GREEN: prose rewritten after the landings is not stale, and renders nothing", () => {
  const s = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: [closed("inc-10", "2026-08-03")],
    events: [
      ev("2026-07-24T09:00:00.000Z", { intent: "old", endState: "old" }, "created"),
      ev("2026-08-14T11:00:00.000Z", PROSE),
    ],
  });
  assert.equal(s.stale, false);
  assert.equal(s.undatable, false);
  assert.deepEqual(renderNarrativeStaleness(s, "a1"), []);
});

test("only the field that was left behind is reported", () => {
  const s = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: [closed("inc-10", "2026-08-03")],
    events: [
      ev("2026-07-24T09:00:00.000Z", { intent: "old", endState: PROSE.endState }, "created"),
      // The end state was revisited after the landing; the intent was not.
      ev("2026-08-10T09:00:00.000Z", { intent: "old", endState: "revised" }),
      ev("2026-08-11T09:00:00.000Z", { intent: PROSE.intent, endState: "revised" }),
    ],
  });
  assert.equal(s.stale, false, "both fields now postdate the landing");

  const s2 = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: [closed("inc-10", "2026-08-12")],
    events: [
      ev("2026-07-24T09:00:00.000Z", { intent: PROSE.intent, endState: "old" }, "created"),
      ev("2026-08-13T09:00:00.000Z", { intent: PROSE.intent, endState: PROSE.endState }),
    ],
  });
  assert.equal(s2.stale, true);
  assert.deepEqual(
    s2.fields.filter((f) => f.unseen.length > 0).map((f) => f.field),
    ["intent"],
    "the end state was rewritten after the landing; the intent was not",
  );
  const body = renderNarrativeStaleness(s2, "a1");
  assert.equal(
    body.filter((l) => l.trimStart().startsWith("end state:")).length,
    0,
    "a field that is current is not listed",
  );
});

test("the day boundary: a same-day landing is quiet, the next day fires", () => {
  const base = {
    ...PROSE,
    events: [ev("2026-08-03T23:59:00.000Z", PROSE, "created")],
  };
  assert.equal(
    deriveArcNarrativeStaleness({ ...base, increments: [closed("inc-10", "2026-08-03")] }).stale,
    false,
    "same day is unorderable across a date and an instant — stay quiet",
  );
  assert.equal(
    deriveArcNarrativeStaleness({ ...base, increments: [closed("inc-10", "2026-08-04")] }).stale,
    true,
    "the very next day fires — the quiet window is exactly one day wide, not a blanket",
  );
});

test("forward-looking increments are never landings", () => {
  const s = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: [open("inc-a", "proposal"), open("inc-b", "ready"), open("inc-c", "active"), open("inc-d", "?")],
    events: [ev("2026-07-01T09:00:00.000Z", PROSE, "created")],
  });
  assert.equal(s.stale, false, "an intention cannot be something the prose failed to notice");
  assert.equal(s.undatable, false, "and with no landings there is nothing to be unknown about either");
  assert.deepEqual(renderNarrativeStaleness(s, "a1"), []);
});

test("UNKNOWN is not FRESH: landings with no write history report the third state", () => {
  const s = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: [closed("inc-10", "2026-08-03")],
    events: [],
  });
  assert.equal(s.stale, false);
  assert.equal(s.undatable, true);
  const body = renderNarrativeStaleness(s, "a1").join("\n");
  assert.match(body, /UNKNOWN IS NOT FRESH/);
  assert.match(body, /1 landing\b/, "singular, and it says how many it could not check against");
});

test("an arc with no landings says nothing at all, however old its prose", () => {
  const s = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: [],
    events: [],
  });
  assert.equal(s.undatable, false, "young is not unknown — there is nothing to be stale against");
  assert.deepEqual(renderNarrativeStaleness(s, "a1"), []);
});

test("an arc with no prose has nothing to go stale", () => {
  const s = deriveArcNarrativeStaleness({
    intent: "",
    endState: "   ",
    increments: [closed("inc-10", "2026-08-03")],
    events: [ev("2026-07-01T09:00:00.000Z", {}, "created")],
  });
  assert.deepEqual(s.fields, []);
  assert.equal(s.stale, false);
  assert.equal(s.undatable, false);
  assert.deepEqual(renderNarrativeStaleness(s, "a1"), []);
});

test("a closed increment with no date is NAMED, never silently dropped", () => {
  const undated: ArcRollupIncrement = { id: "inc-x", title: "t", objective: "o", status: "closed" };
  const s = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: [closed("inc-10", "2026-08-03"), undated],
    events: [ev("2026-07-01T09:00:00.000Z", PROSE, "created")],
  });
  assert.deepEqual(s.undatedLandings, ["inc-x"]);
  const body = renderNarrativeStaleness(s, "a1").join("\n");
  assert.match(body, /not compared \(closed with no date\): inc-x/);
});

test("an arc whose only landings are undated reports UNKNOWN rather than silence", () => {
  const s = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: [{ id: "inc-x", title: "t", objective: "o", status: "closed" }],
    events: [],
  });
  assert.equal(s.undatable, true);
  assert.match(renderNarrativeStaleness(s, "a1").join("\n"), /UNKNOWN IS NOT FRESH/);
});

test("the named-landing cap says how many it did not name", () => {
  const many = Array.from({ length: NAMED_LANDING_CAP + 3 }, (_, i) =>
    closed(`inc-${String(i).padStart(2, "0")}`, `2026-08-${String(10 + i).padStart(2, "0")}`),
  );
  const s = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: many,
    events: [ev("2026-07-01T09:00:00.000Z", PROSE, "created")],
  });
  const body = renderNarrativeStaleness(s, "a1").join("\n");
  assert.match(body, new RegExp(`… and 3 more`));
  assert.equal(s.fields[0]?.unseen.length, NAMED_LANDING_CAP + 3, "the DATA is never capped, only the render");
});

test("narrativeLastChangedAt: first appearance, disappearance, and out-of-order events", () => {
  const events = [
    ev("2026-07-01T00:00:00.000Z", { intent: "a" }, "created"),
    ev("2026-07-02T00:00:00.000Z", { intent: "a", other: "x" }),
    ev("2026-07-03T00:00:00.000Z", { intent: "b" }),
    ev("2026-07-04T00:00:00.000Z", {}),
  ];
  assert.equal(narrativeLastChangedAt(events, "intent"), "2026-07-04T00:00:00.000Z", "going absent is a change");
  assert.equal(narrativeLastChangedAt(events.slice(0, 3), "intent"), "2026-07-03T00:00:00.000Z");
  assert.equal(
    narrativeLastChangedAt(events.slice(0, 2), "intent"),
    "2026-07-01T00:00:00.000Z",
    "a write that left the value identical is not a change",
  );
  assert.equal(narrativeLastChangedAt([], "intent"), null, "no history is null, never a date");

  // Ordering is by `seq`, not by array position: a backend that returns rows in another order must
  // not change the answer.
  const shuffled = [events[2]!, events[0]!, events[1]!];
  assert.equal(narrativeLastChangedAt(shuffled, "intent"), "2026-07-03T00:00:00.000Z");
});

// ── The wiring: does any of this reach `arc show`? ────────────────────────────────────────────────
//
// The pure suite above proves the verdict. These prove it is CONSULTED, and consulted in the right
// PLACE — a warning rendered after the prose arrives once the reader has already believed it, which
// is the position that failed in the friction.
//
// The arc's history is injected rather than accumulated, because `InMemoryStore` stamps every event
// from the wall clock: with real events, "the prose was written before the landing" could only be
// staged by dating a landing into the future, which is a stranger fixture than an explicit history.
// Everything else here is the real store, the real join and the real renderer.
class FixedHistoryStore extends InMemoryStore {
  constructor(private readonly history: readonly StoreEvent[]) {
    super();
  }
  override async readEvents(filter?: { id?: string }): Promise<StoreEvent[]> {
    return this.history.filter((e) => filter?.id === undefined || e.id === filter.id).map((e) => ({ ...e }));
  }
}

const ARC_DOC = {
  kind: "arc",
  id: "a1",
  title: "An arc",
  description: "d",
  intent: "The strongest unspent candidate is the thing that already shipped.",
  endState: "The owner has looked.",
  lifecycle: "active",
  references: [],
  createdAt: "2026-07-24",
  updatedAt: "2026-08-06",
};

function incDoc(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: "increment",
    title: "Custom crown-proxy normals",
    description: "d",
    objective: "o",
    body: "b",
    arcRef: "asset:a1",
    status: "closed",
    references: [],
    createdAt: "2026-08-03",
    updatedAt: "2026-08-03",
    ...overrides,
  };
}

async function showWith(history: readonly StoreEvent[]): Promise<string> {
  const root = mkdtempSync(path.join(tmpdir(), "arc-narrative-"));
  try {
    const store = new FixedHistoryStore(history);
    await store.upsertDoc({ id: "a1", kind: "arc", doc: ARC_DOC });
    await store.upsertDoc({
      id: "inc-10",
      kind: "increment",
      doc: incDoc({ id: "inc-10", outcome: { date: "2026-08-03", pr: "#1108" } }),
    });
    // A missing decisions/stories dir is the ordinary offline shape — the loaders report empty.
    const res = await arcCommand("show", "a1", {
      store,
      storiesDir: path.join(root, "stories"),
      pg: true,
    });
    assert.equal(res.ok, true);
    return res.body;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("arc show renders the staleness block, and renders it BEFORE the prose it qualifies", async () => {
  const body = await showWith([
    { seq: 1, id: "a1", kind: "arc", type: "created", doc: ARC_DOC, actor: "cli", at: "2026-07-24T09:00:00.000Z" },
    // The lifecycle recompute that follows the landing: same prose, new stamp.
    { seq: 2, id: "a1", kind: "arc", type: "updated", doc: ARC_DOC, actor: "cli", at: "2026-08-03T18:00:00.000Z" },
  ]);
  assert.match(body, /NARRATIVE STALENESS/);
  assert.match(body, /inc-10/);
  const warning = body.indexOf("NARRATIVE STALENESS");
  const prose = body.indexOf("**The intent.**");
  assert.ok(warning >= 0 && prose >= 0);
  assert.ok(warning < prose, "the caveat must precede the claim it qualifies");
});

test("arc show says nothing when the prose postdates every landing", async () => {
  const body = await showWith([
    // BOTH fields must be revisited: `endState` is prose with the same absent producer, so leaving
    // it at its chartering value would (correctly) keep the block firing on that half alone.
    {
      seq: 1,
      id: "a1",
      kind: "arc",
      type: "created",
      doc: { ...ARC_DOC, intent: "old", endState: "old" },
      actor: "cli",
      at: "2026-07-24T09:00:00.000Z",
    },
    { seq: 2, id: "a1", kind: "arc", type: "updated", doc: ARC_DOC, actor: "cli", at: "2026-08-14T09:00:00.000Z" },
  ]);
  assert.doesNotMatch(body, /NARRATIVE STALENESS/);
  assert.doesNotMatch(body, /NARRATIVE FRESHNESS UNKNOWN/);
  assert.match(body, /\*\*The intent\.\*\*/, "the ordinary render is untouched");
});

test("arc show reports UNKNOWN, not silence, when the arc has landings but no readable history", async () => {
  const body = await showWith([]);
  assert.match(body, /NARRATIVE FRESHNESS UNKNOWN/);
  assert.match(body, /UNKNOWN IS NOT FRESH/);
});

test("a store that cannot answer readEvents degrades to UNKNOWN rather than to a clean bill", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "arc-narrative-"));
  try {
    class BrokenHistoryStore extends InMemoryStore {
      override async readEvents(): Promise<StoreEvent[]> {
        throw new Error("history unavailable");
      }
    }
    const store = new BrokenHistoryStore();
    await store.upsertDoc({ id: "a1", kind: "arc", doc: ARC_DOC });
    await store.upsertDoc({
      id: "inc-10",
      kind: "increment",
      doc: incDoc({ id: "inc-10", outcome: { date: "2026-08-03" } }),
    });
    const res = await arcCommand("show", "a1", {
      store,
      storiesDir: path.join(root, "stories"),
      pg: true,
    });
    assert.equal(res.ok, true, "a history read that throws must not take `arc show` down");
    assert.match(res.body, /NARRATIVE FRESHNESS UNKNOWN/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the second stale field compresses when its landings are already covered — and does NOT when they are not", () => {
  // The ordinary shape: the end state was revisited after the intent, so its unseen set is a strict
  // subset. Repeating five identical rows on an orientation surface whose size is already a measured
  // cost buys nothing, so the second field says the count and points at the first list.
  const subset = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: [closed("inc-01", "2026-08-01"), closed("inc-02", "2026-08-05")],
    events: [
      ev("2026-07-24T09:00:00.000Z", { intent: PROSE.intent, endState: "old" }, "created"),
      ev("2026-08-03T09:00:00.000Z", PROSE),
    ],
  });
  const body = renderNarrativeStaleness(subset, "a1");
  assert.equal(subset.fields.find((f) => f.field === "intent")?.unseen.length, 2);
  assert.equal(subset.fields.find((f) => f.field === "endState")?.unseen.length, 1);
  const endLine = body.find((l) => l.trimStart().startsWith("end state:"));
  assert.ok(endLine);
  assert.match(endLine, /1 increment landed since, all of them within the intent's 2 above\./);
  assert.equal(
    body.filter((l) => l.includes("inc-02")).length,
    1,
    "the shared landing is printed once, not once per stale field",
  );

  // The compression is CONDITIONAL, not cosmetic: an end state stale on a landing the intent has
  // already seen is a different fact and must still be named in full.
  const disjoint = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: [closed("inc-01", "2026-08-01"), closed("inc-02", "2026-08-05")],
    events: [
      ev("2026-07-24T09:00:00.000Z", { intent: "old", endState: PROSE.endState }, "created"),
      // The INTENT is the one revisited late here, so it has the smaller set and renders first.
      ev("2026-08-03T09:00:00.000Z", PROSE),
    ],
  });
  const dbody = renderNarrativeStaleness(disjoint, "a1");
  assert.doesNotMatch(dbody.join("\n"), /all of them within/);
  assert.equal(
    dbody.filter((l) => l.includes("inc-01")).length,
    1,
    "inc-01 is unseen by the end state only, so it appears under the end state",
  );
  assert.equal(dbody.filter((l) => l.includes("inc-02")).length, 2, "inc-02 is unseen by both fields");
});

test("--no-log stops the overflow line pointing at a log that is not rendered", () => {
  const many = Array.from({ length: NAMED_LANDING_CAP + 2 }, (_, i) =>
    closed(`inc-${String(i).padStart(2, "0")}`, `2026-08-${String(10 + i).padStart(2, "0")}`),
  );
  const s = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: many,
    events: [ev("2026-07-01T09:00:00.000Z", PROSE, "created")],
  });
  assert.match(renderNarrativeStaleness(s, "a1").join("\n"), /every landing is in the increment log below\./);
  assert.match(
    renderNarrativeStaleness(s, "a1", { noLog: true }).join("\n"),
    /drop --no-log to read the full increment log below\./,
  );
});

test("the UNKNOWN block does not point at a log --no-log has collapsed either", () => {
  const s = deriveArcNarrativeStaleness({
    ...PROSE,
    increments: [closed("inc-10", "2026-08-03")],
    events: [],
  });
  assert.doesNotMatch(renderNarrativeStaleness(s, "a1").join("\n"), /drop --no-log/);
  assert.match(renderNarrativeStaleness(s, "a1", { noLog: true }).join("\n"), /\(drop --no-log to see it\)\./);
});
