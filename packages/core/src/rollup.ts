import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Status } from "./schema.js";
import { Verdict } from "./proof.js";
import type { Store, StoreEvent } from "./store.js";

/**
 * The node-rollup projection (ADR-0006 / ADR-0020, glossary "node rollup"): a unit's lifecycle
 * status DERIVED as a pure function over the event log, never hand-maintained. `healthy` is
 * reachable ONLY through a signed pass {@link Verdict} (the prove-it-gate's `kind:"signing"`
 * append); a lifecycle work event marks `building`; NO events means the projection abstains
 * (returns `null`) so the authored frontmatter status stands.
 *
 * CONSERVATIVE BY CONSTRUCTION — never over-claim `healthy`:
 *  - a signing event whose doc does not parse as a {@link Verdict} grants nothing;
 *  - a verdict for a DIFFERENT unit grants nothing;
 *  - a `fail` verdict never grants progress (it only demotes a prior `healthy` to `unhealthy`);
 *  - any work event AFTER a pass (a rebuild started) supersedes the pass — last event wins.
 */

/** The store `kind` for lifecycle work events (the `events.work_event` stream, drive-machinery Phase A). */
export const WORK_EVENT_KIND = "work";

/** The store `kind` the prove-it-gate appends signed verdicts under (prove-it-gate.ts SIGNING_KIND). */
export const SIGNING_EVENT_KIND = "signing";

/**
 * The doc carried by a lifecycle work event. `event` is the lifecycle change (NOT the StoreEvent
 * `type`, which stays in the created/updated/deleted vocabulary); `runId` ties a `building` mark
 * to the owned-loop run that picked the unit up.
 */
export const WorkEventDoc = z
  .object({
    unitId: z.string(),
    event: z.enum(["proposed", "building", "retired"]),
    runId: z.string().optional(),
  })
  .strict();
export type WorkEventDoc = z.infer<typeof WorkEventDoc>;

/** Build the appendEvent payload for one lifecycle work event (validated before it is shaped). */
export function workEvent(
  doc: WorkEventDoc,
  actor: string,
): { id: string; kind: string; type: "created"; doc: WorkEventDoc; actor: string } {
  const valid = WorkEventDoc.parse(doc);
  const id = valid.runId !== undefined ? `${valid.runId}:${valid.unitId}` : valid.unitId;
  return { id, kind: WORK_EVENT_KIND, type: "created", doc: valid, actor };
}

/**
 * Compute one unit's derived lifecycle status from an event stream. Pure: events in, status out.
 *
 * Walks the stream in `seq` order, last relevant event wins:
 *  - a work event (`proposed`/`building`/`retired`) sets that status;
 *  - a signed PASS verdict sets `healthy`;
 *  - a signed FAIL verdict demotes a prior `healthy` to `unhealthy` and otherwise changes nothing
 *    (a fail never grants progress).
 *
 * Returns `null` when no event speaks for the unit — the projection abstains and the authored
 * status stands (ADR-0006: derived state augments, it never invents).
 */
export function rollupStatus(
  unitId: string,
  events: readonly StoreEvent[],
): z.infer<typeof Status> | null {
  let status: z.infer<typeof Status> | null = null;
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  for (const e of ordered) {
    if (e.kind === WORK_EVENT_KIND) {
      const parsed = WorkEventDoc.safeParse(e.doc);
      if (!parsed.success || parsed.data.unitId !== unitId) continue;
      status = parsed.data.event;
    } else if (e.kind === SIGNING_EVENT_KIND) {
      // Conservative: only a doc that parses as a full signed Verdict for THIS unit counts.
      const parsed = Verdict.safeParse(e.doc);
      if (!parsed.success || parsed.data.unitId !== unitId) continue;
      if (parsed.data.outcome === "pass") {
        status = "healthy";
      } else if (status === "healthy") {
        status = "unhealthy";
      }
    }
  }
  return status;
}

/**
 * A REUSABLE rollup-parity suite (node:test), mirroring {@link storeParitySuite}'s discipline:
 * the projection must read identically off ANY {@link Store} implementation — events are appended
 * through the seam and the rollup is computed over `readEvents()`. Run against `InMemoryStore`
 * here; packages/store can hold the pg impl to the same bar once the work tables are wired.
 */
export function rollupParitySuite(
  name: string,
  makeStore: () => Store | Promise<Store>,
): void {
  const passVerdict = (unitId: string): Verdict => ({
    unitId,
    proofMode: "capability",
    outcome: "pass",
    commitSha: "cafebabe",
    signer: "tester@example.com",
    runId: "run-1",
    evidence: [],
    at: "2026-06-10T00:00:00.000Z",
  });

  test(`${name} rollup parity: no events => null (the authored status stands)`, async () => {
    const store = await makeStore();
    assert.equal(rollupStatus("ghost", await store.readEvents()), null);
  });

  test(`${name} rollup parity: a building work event without a later pass => building`, async () => {
    const store = await makeStore();
    await store.appendEvent(workEvent({ unitId: "u1", event: "building", runId: "run-1" }, "tester"));
    assert.equal(rollupStatus("u1", await store.readEvents()), "building");
  });

  test(`${name} rollup parity: building then a signed pass verdict => healthy`, async () => {
    const store = await makeStore();
    await store.appendEvent(workEvent({ unitId: "u1", event: "building", runId: "run-1" }, "tester"));
    await store.appendEvent({
      id: "run-1:u1",
      kind: SIGNING_EVENT_KIND,
      type: "created",
      doc: passVerdict("u1"),
      actor: "tester@example.com",
    });
    assert.equal(rollupStatus("u1", await store.readEvents()), "healthy");
  });

  test(`${name} rollup parity: another unit's events grant nothing`, async () => {
    const store = await makeStore();
    await store.appendEvent(workEvent({ unitId: "other", event: "building" }, "tester"));
    await store.appendEvent({
      id: "run-1:other",
      kind: SIGNING_EVENT_KIND,
      type: "created",
      doc: passVerdict("other"),
      actor: "tester@example.com",
    });
    assert.equal(rollupStatus("u1", await store.readEvents()), null);
  });
}
