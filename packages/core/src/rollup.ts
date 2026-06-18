import { z } from "zod";
import { Status, Tier } from "./schema.js";
import { Verdict } from "./proof.js";
import type { StoreEvent } from "./store.js";

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
 * to the owned-loop run that picked the unit up; `tier` feeds the `events.work_event.tier`
 * column when the event lands in the pg work store (optional — old events have none).
 */
export const WorkEventDoc = z
  .object({
    unitId: z.string(),
    event: z.enum(["proposed", "building", "retired"]),
    runId: z.string().optional(),
    tier: Tier.optional(),
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
