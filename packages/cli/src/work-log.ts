/**
 * `storytree node log <unit-id>` — the work log of one unit, ROW BY ROW, with the event that caused
 * each row (ADR-0350 D3).
 *
 * ## The question this exists to answer
 *
 * "Which claim authorised this write?" — and nothing joins it today. `events.claim_event` carries a
 * `session_id`, `events.work_event` carries an `actor`, there is no correlation key between them,
 * and NEITHER TABLE HAS A `run_id` COLUMN AT ALL. So the link between the claim a session took and
 * the build that claim authorised was, until ADR-0350's producer half, reconstructible only by
 * squinting at timestamps — which is precisely the temporal-proximity inference ADR-0235 clause 3
 * bans and ADR-0260 D4 refuses to let repair an under-report.
 *
 * This is the READER half of ADR-0350 D4's "no dormant field" rule: the column lands only alongside
 * a real producer AND a real reader, proven by a test that goes red when the stamp is dropped. It
 * exists because no surface rendered an individual work event to a human — `build-unit-status`,
 * `factory`, `gate`, `gate-build-driver` and the studio's `inFlightBuilds` all FOLD the work log
 * into a derived status or a projection, and a fold cannot show a per-row cause.
 *
 * ## ABSENT IS NEVER RENDERED AS A BLANK (D3)
 *
 * Every row prints `caused by: <stream>#<seq>` or `caused by: not recorded`. Never nothing. A blank
 * reads as "nothing caused this", and an event that genuinely had no cause is a DIFFERENT fact from
 * one whose emitter never stamped one. Collapsing the two is this arc's signature failure — a stale
 * picture and a healthy one looking identical from outside — so the words "not recorded" are load
 * bearing and are not a placeholder to tidy away.
 *
 * ## SCOPE IS WORK EVENTS, AND THAT IS AN HONESTY FENCE, NOT A SHORTCUT
 *
 * `PgWorkStore.readEvents` merges three tables — `work_event`, `verdict`, `usage_event` — but only
 * the `work_event` query SELECTs the two causal columns. So only a work event can report its cause
 * from measurement. Rendering `not recorded` beside a verdict row would assert something never
 * looked at: an unmeasured field reported as unrecorded is the same lie one level up from the blank
 * D3 forbids. If the verdict and usage reads later lift the columns too, widen this fold THEN.
 *
 * ## OBSERVABILITY ONLY (D7)
 *
 * Nothing here decides anything. No status is derived, no verdict moves, no rollup consults this —
 * it renders text for a human. `causedBy` reaching a branch in the spine is a new decision, not an
 * extension of this one.
 *
 * Pure: it takes events and returns text. The store read lives at the callsite.
 */
import { WORK_EVENT_KIND, WorkEventDoc } from "@storytree/proof-protocol";
import type { CausedBy, StoreEvent } from "@storytree/storage-protocol";

/**
 * The slice of the work store this reader consumes.
 *
 * Structural, so the test never needs a database. NOTE the filter is deliberately unused by the
 * callsite: `PgWorkStore` computes an event's `id` as `${runId}:${unitId}` when a run exists, so
 * filtering by a bare unit id there silently misses every row that carries a run. The unit filter
 * below reads `doc.unitId`, which is the field that actually names the unit.
 */
export interface WorkLogReaderLike {
  readEvents(filter?: { id?: string }): Promise<StoreEvent[]>;
}

/** One row of the work log, as the append-only stream recorded it. */
export interface WorkLogEntry {
  readonly seq: number;
  readonly at: string;
  readonly actor: string;
  /** The lifecycle word the row carries — `proposed` | `building` | `retired`. */
  readonly event: WorkEventDoc["event"];
  readonly unitId: string;
  readonly runId?: string;
  readonly phase?: string;
  /**
   * The event that caused this one, when its emitter stamped one.
   *
   * `undefined` means UNRECORDED — nobody stamped it — and never "nothing caused it". The renderer
   * is required to say which (D3); no caller may treat absence as an answer.
   */
  readonly causedBy?: CausedBy;
}

/**
 * Fold the raw merged event stream into this unit's work log, oldest first.
 *
 * Non-work events are dropped (see the scope fence above), as is any row whose doc does not parse as
 * a `WorkEventDoc` — a malformed row describes nothing and is not evidence of a build.
 */
export function foldWorkLog(
  events: readonly StoreEvent[],
  unitId?: string,
): readonly WorkLogEntry[] {
  const entries: WorkLogEntry[] = [];
  for (const e of events) {
    if (e.kind !== WORK_EVENT_KIND) continue;
    const parsed = WorkEventDoc.safeParse(e.doc);
    if (!parsed.success) continue;
    const doc = parsed.data;
    if (unitId !== undefined && doc.unitId !== unitId) continue;
    // `WorkLogEntry`'s optional fields are readonly, so each present one is added by rebuilding the
    // row rather than by assigning into it.
    let entry: WorkLogEntry = {
      seq: e.seq,
      at: e.at,
      actor: e.actor,
      event: doc.event,
      unitId: doc.unitId,
    };
    if (doc.runId !== undefined) entry = { ...entry, runId: doc.runId };
    if (doc.phase !== undefined) entry = { ...entry, phase: doc.phase };
    // Carried only when the emitter stamped it. Absent stays absent (ADR-0350 D2) — it is never
    // widened to a null, and never filled from an adjacent row.
    if (e.causedBy !== undefined) entry = { ...entry, causedBy: { ...e.causedBy } };
    entries.push(entry);
  }
  return entries.sort((a, b) => a.seq - b.seq);
}

/** `2026-08-14T04:12:55.123Z` → `08-14 04:12` — the column is for ordering, not forensics. */
function shortTime(at: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(at);
  return m ? `${m[1]}-${m[2]} ${m[3]}:${m[4]}` : at.slice(0, 16);
}

/**
 * The D3 rendering, and the ONLY place this string is built.
 *
 * Two outcomes, never a third and never an empty one: a stamped edge names its stream and seq, and
 * an unstamped one says `not recorded` in words. Exported so the test can assert the exact contract
 * rather than a substring of a larger line.
 */
export function renderCausedBy(causedBy?: CausedBy): string {
  return causedBy === undefined
    ? "caused by: not recorded"
    : `caused by: ${causedBy.stream}#${causedBy.seq}`;
}

/**
 * The rendered work log.
 *
 * Oldest first: the question is "what happened to this unit, in order", and a reader tracing a build
 * is reading a sequence rather than looking up a row.
 */
export function renderWorkLog(input: {
  readonly unitId: string;
  readonly entries: readonly WorkLogEntry[];
}): string {
  const { unitId, entries } = input;
  if (entries.length === 0) {
    return [
      `no work events for "${unitId}" — the append-only log holds no build of that unit.`,
      "",
      "That is not the same as a unit that was never built: this reads events.work_event, which only",
      "a `--real`/`--live` build with `--store pg` writes to. A dry run proves nothing and persists",
      "nothing, by design (ADR-0060).",
    ].join("\n");
  }
  const lines: string[] = [
    `${entries.length} work event(s) for "${unitId}", oldest first.`,
    "",
  ];
  for (const e of entries) {
    const run = e.runId === undefined ? "" : `   run ${e.runId}`;
    const phase = e.phase === undefined ? "" : `   phase ${e.phase}`;
    lines.push(`  seq ${e.seq}  ${shortTime(e.at)}  ${e.event}  by ${e.actor}${run}${phase}`);
    // D3: EVERY row says which, on its own line. There is no branch that omits this.
    lines.push(`      ${renderCausedBy(e.causedBy)}`);
  }
  const recorded = entries.filter((e) => e.causedBy !== undefined).length;
  lines.push(
    "",
    `${recorded} of ${entries.length} event(s) above name the event that caused them.`,
    "",
    '"not recorded" means NOBODY STAMPED A CAUSE — it does not mean nothing caused the event.',
    "The emitter stamps the edge at emission or it is absent forever: there is no backfill, no",
    "correlation job, and no inferring a cause from whatever happened just before (ADR-0350 D2).",
    "So this under-reports by design, and a low count here is not by itself a defect — an event",
    "genuinely caused by nothing recorded, like a session's first claim, correctly carries none.",
  );
  return lines.join("\n");
}
