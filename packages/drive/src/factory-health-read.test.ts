import { test } from "node:test";
import assert from "node:assert/strict";

import type { StoredDoc, StoreEvent } from "@storytree/storage-protocol";

import { computeBottlenecks, computeRecurrence, floorHealthReading } from "./factory-health.js";
import { loadFloorHealthReading, type FloorHealthStore } from "./factory-health-read.js";

/**
 * The store-reading half (`GET /api/floor-health`'s composition). Two things are worth a red here,
 * and neither is arithmetic — the arithmetic is `factory-health.test.ts`'s:
 *
 *   1. the loader composes the SAME three reads the CLI verb makes, so the map and the terminal
 *      cannot disagree about the floor. Asserted against the pure computes run directly, the
 *      `arcsApi.integration.test.ts` move — a handler that started deriving anything of its own
 *      shows up HERE rather than as two surfaces quietly drifting.
 *   2. what crosses the seam carries no volume figure. The reading is the first thing a renderer
 *      sees, and widening it to admit a filing count is the error that closed
 *      `factory-self-load-tune-the-guidance-loop-back-to-evidence-arc` (ADR-0316 D3).
 */

const LOUD_ID = "a-live-guardrail-that-keeps-firing";

/** The friction doc BODY these fixtures build — the fields the reading actually consumes. */
interface FrictionDocBody {
  title: string;
  route: string;
  dischargedBy?: string;
  reinforcedBy: Array<{ branch: string; date: string; evidence: string }>;
}

function frictionDoc(input: {
  id: string;
  route: string;
  dischargedBy?: string;
  dates: string[];
}): StoredDoc {
  const body: FrictionDocBody = {
    title: input.id,
    route: input.route,
    reinforcedBy: input.dates.map((date) => ({ branch: "claude/x", date, evidence: "`e`" })),
  };
  if (input.dischargedBy !== undefined) body.dischargedBy = input.dischargedBy;
  return {
    id: input.id,
    kind: "friction",
    doc: body,
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
  };
}

/**
 * A hand-rolled store rather than `InMemoryStore`, for the reason the recurrence attribution rule
 * makes unavoidable: a reinforcement is attributed to the route STANDING WHEN IT LANDED, so the
 * route event's own timestamp is the fixture. `InMemoryStore` stamps `at` with the wall clock, which
 * would date every route to today and read every reinforcement as PRE-route — a green test over a
 * reading that is structurally always quiet.
 */
function storeOf(docs: StoredDoc[], events: StoreEvent[]): FloorHealthStore {
  return {
    queryDocs: async (filter) => docs.filter((d) => filter?.kind === undefined || d.kind === filter.kind),
    readEvents: async () => events,
  };
}

function seed(): FloorHealthStore {
  return storeOf(
    [
      // LIVE, routed `guardrail` on 2026-07-11 and reinforced three times AFTER (the same-day one is
      // excluded by the attribution rule, so this reads as 3, not 4).
      frictionDoc({ id: LOUD_ID, route: "guardrail", dates: ["2026-07-11", "2026-07-12", "2026-07-16", "2026-07-28"] }),
      // DISCHARGED — its recurrence is history, not a live bottleneck.
      frictionDoc({ id: "a-remedied-item", route: "guardrail", dischargedBy: "#1031", dates: ["2026-07-20"] }),
      // An increment carrying a join edge — present so the loader's `increment` read is load-bearing:
      // drop that read and the collapsing rule reaches nothing.
      {
        id: "some-increment",
        kind: "increment",
        doc: { title: "a remedy", frictionRefs: [LOUD_ID] },
        createdAt: "2026-07-11T00:00:00.000Z",
        updatedAt: "2026-08-08T00:00:00.000Z",
      },
    ],
    [
      { seq: 1, id: LOUD_ID, kind: "friction", type: "created", doc: {}, actor: "cli", at: "2026-07-11T09:00:00.000Z" },
      {
        seq: 2,
        id: LOUD_ID,
        kind: "friction",
        type: "updated",
        doc: { route: "guardrail" },
        actor: "cli",
        at: "2026-07-11T13:54:04.888Z",
      },
    ],
  );
}

test("the loader composes the SAME reading the CLI verb's pure computes produce", async () => {
  const store = seed();

  const reading = await loadFloorHealthReading(store);

  // The authority: the pure computes, run here directly over the same reads. Any divergence between
  // what the studio serves and what `storytree factory health` prints fails THIS assertion.
  const docs = await store.queryDocs({ kind: "friction" });
  const events = await store.readEvents();
  const increments = await store.queryDocs({ kind: "increment" });
  const recurrence = computeRecurrence({ docs, events });
  const expected = floorHealthReading({
    recurrence,
    bottlenecks: computeBottlenecks({ docs, increments, recurrence }),
  });

  assert.deepEqual(reading, expected);
  assert.equal(reading.loudest?.cause, LOUD_ID);
  assert.equal(reading.loudest?.recurrences, 3, "recurrences on ONE distinct cause — never a filing count");
  assert.equal(reading.loudest?.route, "guardrail", "loudness is measured on TRIPWIRE routes only");
});

test("what crosses the seam carries no filing / session / report volume field", async () => {
  const reading = await loadFloorHealthReading(seed());

  assert.deepEqual(
    Object.keys(reading).sort(),
    ["attributionRule", "collapsingRule", "distinctCauses", "loudest", "unjoined", "window"],
    "the served reading's keys are fixed — a volume field cannot arrive without editing this line",
  );
  assert.deepEqual(Object.keys(reading.loudest ?? {}).sort(), ["cause", "members", "recurrences", "route"]);

  // Every key in the graph, not just the top level — the stated rules are PROSE and legitimately say
  // the word "filings", so this reads keys rather than scanning the serialised text for substrings.
  const keys = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === "object")
      for (const [k, v] of Object.entries(value)) {
        keys.add(k);
        walk(v);
      }
  };
  walk(reading);
  for (const forbidden of ["allFilings", "filings", "archived", "discharged", "sessions", "reports", "total"]) {
    assert.equal(keys.has(forbidden), false, `the reading must not carry a \`${forbidden}\` field`);
  }
});

test("every figure arrives with its window and its collapsing rule (ADR-0316 D2/D3)", async () => {
  const reading = await loadFloorHealthReading(seed());
  assert.ok(Object.hasOwn(reading, "window"), "a figure without its window is not reportable");
  assert.ok(reading.collapsingRule.length > 0, "a distinctness count whose rule is hidden is unaudited");
  assert.ok(reading.attributionRule.length > 0);
});

test("an empty store reads as a QUIET floor, never as a missing one", async () => {
  // Nothing filed is a real reading — `loudest` absent — and it must not be dressed up as a zero
  // signal or confused with the store being absent, which is the route's answer, not the reading's.
  const reading = await loadFloorHealthReading(storeOf([], []));
  assert.equal(reading.loudest, undefined);
  assert.equal(reading.distinctCauses, 0);
});
