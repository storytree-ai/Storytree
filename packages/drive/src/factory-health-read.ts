import type { Store } from "@storytree/storage-protocol";

import {
  computeBottlenecks,
  computeRecurrence,
  floorHealthReading,
  type FloorHealthReading,
} from "./factory-health.js";

/**
 * THE STORE-READING HALF of the factory-floor health instrument (ADR-0316) — the one composition
 * that turns a live store into {@link FloorHealthReading}.
 *
 * `factory-health.ts` is PURE by construction (the caller supplies docs + events), which is what
 * makes its calibration cases testable without a database. This file is the deliberate other half:
 * the three reads, in one place, so a second surface cannot compose them slightly differently.
 *
 * WHY IT EXISTS AT ALL. `storytree factory health` renders the reading in a terminal; ADR-0316 D5
 * names ADR-0314 D7's floor-health strip as the instrument's first committed CONSUMER, and the
 * studio serves that strip over `GET /api/floor-health`. The studio frontend cannot import
 * `@storytree/drive` (ADR-0004), so the arrow runs drive → studio server → wire, exactly as
 * `loadArcRollups` does for `GET /api/arcs`. Keeping the composition HERE rather than in the route
 * is what stops the map and the CLI from ever disagreeing about the floor.
 *
 * NO WINDOW PARAMETER, AND THAT IS THE DECISION. The band reads the floor over all history, because
 * every figure in the reading is a COUNT on one distinct cause rather than a rate — ADR-0316 D2's
 * refusal case is for rate-sensitive figures whose window must be comparable to a reference, and
 * `recurrences` is not one. The reading still carries its window (all history → now) because D2
 * requires every figure to arrive with the window it was computed over, not because narrowing it
 * would be meaningful here.
 */

/** The seam this needs: two reads, no writes. Report-only by construction (ADR-0316 D4). */
export type FloorHealthStore = Pick<Store, "queryDocs" | "readEvents">;

/**
 * Read the live store and compose the floor-health reading.
 *
 * The three reads are the SAME three `storytree factory health` makes, in the same order, and they
 * feed the same two pure computes — `recurrence` is threaded into {@link computeBottlenecks} rather
 * than recomputed so the per-cause recurrence figure is the one number question 1 reports. Two
 * figures on one screen that disagreed would be worse than one.
 *
 * Reads the whole event log because the `Store` seam's `readEvents` filters by id only; a kind
 * filter belongs on the seam, not in a second reader here. That cost is why the studio fetches this
 * on its own slow cadence rather than the world's poll.
 */
export async function loadFloorHealthReading(store: FloorHealthStore): Promise<FloorHealthReading> {
  const docs = await store.queryDocs({ kind: "friction" });
  const events = await store.readEvents();
  const increments = await store.queryDocs({ kind: "increment" });
  const recurrence = computeRecurrence({ docs, events });
  const bottlenecks = computeBottlenecks({ docs, increments, recurrence });
  return floorHealthReading({ recurrence, bottlenecks });
}
