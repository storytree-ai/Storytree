import {
  SIGNING_EVENT_KIND,
  Verdict,
  WORK_EVENT_KIND,
  WorkEventDoc,
} from "@storytree/verdict-contract";
import type { Status } from "@storytree/verdict-contract";
import type { StoreEvent } from "@storytree/base";

/**
 * The node-rollup COMPUTE (ADR-0006 / ADR-0020, glossary "node rollup"): a unit's lifecycle status
 * DERIVED as a pure function over the event log, never hand-maintained. MOVED here from
 * `@storytree/core`'s `rollup.ts` (ADR-0068 step 1): deriving status is the farmer organism's ruler.
 * The DATA shapes it reads ({@link Verdict}, {@link WorkEventDoc}, the kind literals, {@link Status})
 * are the verdict CONTRACT's; `StoreEvent` is the base store seam (still core, ADR-0068 step 8).
 *
 * `healthy` is reachable ONLY through a signed pass {@link Verdict} (the prove-it-gate's
 * `kind:"signing"` append); a lifecycle work event marks `building`; NO events means the projection
 * abstains (returns `null`) so the authored frontmatter status stands.
 *
 * CONSERVATIVE BY CONSTRUCTION — never over-claim `healthy`:
 *  - a signing event whose doc does not parse as a {@link Verdict} grants nothing;
 *  - a verdict for a DIFFERENT unit grants nothing;
 *  - a `fail` verdict never grants progress (it only demotes a prior `healthy` to `unhealthy`);
 *  - any work event AFTER a pass (a rebuild started) supersedes the pass — last event wins.
 */

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
): Status | null {
  let status: Status | null = null;
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
