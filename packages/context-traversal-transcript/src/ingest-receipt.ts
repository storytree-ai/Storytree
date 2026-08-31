/**
 * THE HARNESS INGEST'S RECEIPT — whether this adapter has ever looked at a session (ADR-0484 D5
 * deliverable 4), story `context-traversal-transcript`.
 *
 * ## THE ABSENCE THIS EXISTS TO NAME
 *
 * Neither harness ingest is ambient. Both need an explicit `storytree traversal ingest`, no hook
 * runs either, and a run that recovers nothing writes nothing. So a trace carrying no
 * harness-derived event is EXACTLY as consistent with *this session read no decision* as with
 * *nobody has ever looked* — and until this file existed the replay printed those two the same way,
 * which is the absence-versus-zero fault this codebase refuses everywhere else. `ship.ts`'s cursor is
 * the shape it borrows: a small JSON sidecar beside the trace, whose ABSENCE is itself the answer.
 *
 * ## WRITTEN HERE, READ IN THE REPLAY COMPOSITION, FORMAT DECLARED IN NEITHER
 *
 * The writer is this organism (only the harness adapter knows it ran); the reader is
 * `@storytree/context-traversal-spawn`'s replay composition (only it renders a session's replay);
 * the trace directory belongs to `@storytree/context-traversal-capture`. Three organisms, so the
 * FORMAT lives in the one package all three already depend on — the filename and the schema are
 * `@storytree/context-traversal-telemetry`'s `traversal-harness-provenance.ts`, and neither side
 * spells them itself. That is what keeps a reader and a writer in different packages from drifting
 * into two shapes of one file.
 *
 * ## IT NEVER FAILS AN INGEST
 *
 * A receipt is a statement ABOUT a run, so a receipt that cannot be written must not take the run
 * down with it: every function here returns rather than throws, and a caller that ignores the return
 * has lost bookkeeping and nothing else. That is the same posture the capture path takes toward
 * telemetry, narrowed by ADR-0484 D4's correction — never silent, so the failure is returned rather
 * than swallowed, and the report prints it.
 *
 * ## AND THE FLOOR IS DECLARED RATHER THAN IMPLIED
 *
 * A receipt says a run HAPPENED. It does not, and cannot, say the run saw everything: the omissions
 * each ingest already declares still stand. What it removes is one specific ambiguity — a zero that
 * was never measured reading identically to a zero that was.
 */
import fs from "node:fs";
import path from "node:path";

import {
  HarnessIngestReceipt,
  harnessIngestReceiptFileName,
  mergeHarnessIngestRun,
  type HarnessIngestAdapter,
} from "@storytree/context-traversal-telemetry";

/** Where one session's receipt sits: beside its trace, named by the ONE shared spelling. */
function receiptPath(traceDir: string, sessionId: string): string {
  return path.join(traceDir, harnessIngestReceiptFileName(sessionId));
}

/**
 * Read a session's receipt, or `null` when it has none.
 *
 * `null` COLLAPSES two states on purpose — no file at all, and a file that will not parse as a
 * receipt — and the collapse is in the safe direction. Both render as *never run, so this absence is
 * unmeasured*, which under-claims measurement rather than over-claiming it; the opposite default
 * would let a corrupt sidecar assert that somebody had looked. A subsequent run overwrites it, so
 * the unreadable case repairs itself the first time the ingest is asked again.
 */
export function readHarnessIngestReceipt(
  traceDir: string,
  sessionId: string,
): HarnessIngestReceipt | null {
  try {
    // Stryker disable next-line StringLiteral: EQUIVALENT — an unrecognised encoding string is not
    // rejected by the runtime this suite runs on, so `"utf8"` -> `""` reads the same bytes. The
    // literal is kept because it states the intent; nothing observable distinguishes the two.
    const raw = fs.readFileSync(receiptPath(traceDir, sessionId), "utf8");
    const parsed = HarnessIngestReceipt.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // ONE catch, not two. `ship.ts` splits the read from the parse because its two answers DIFFER —
    // a missing cursor is `null` and an unreadable one degrades to the empty cursor. Here both are
    // `null`, so a split would be a branch nothing could ever observe.
    return null;
  }
}

export interface RecordHarnessIngestArgs {
  /** The trace directory the sink writes under — supplied, never resolved here. */
  readonly traceDir: string;
  /** The trace this run is a statement about. A window id where the events landed under one. */
  readonly sessionId: string;
  readonly adapter: HarnessIngestAdapter;
  /** What this run recovered for that trace. Zero is the MEASURED zero this whole file exists for. */
  readonly observed: number;
  /** What it appended. Below `observed` on a re-ingest, which is the idempotence property. */
  readonly appended: number;
  /** The run's timestamp, ISO-8601. Injected: this module owns no clock, so its tests are exact. */
  readonly at: string;
}

/**
 * Record that one adapter ran over one trace. Returns whether the receipt reached disk.
 *
 * MERGES rather than replaces, so the two adapters' rows survive each other — the occupancy ingest
 * running must not erase the decision-read ingest's answer for the same session, which would restore
 * the very ambiguity this removes for one half while fixing it for the other.
 */
export function recordHarnessIngestRun(args: RecordHarnessIngestArgs): boolean {
  const { traceDir, sessionId, adapter, observed, appended, at } = args;
  const merged = mergeHarnessIngestRun(readHarnessIngestReceipt(traceDir, sessionId), adapter, {
    at,
    observed,
    appended,
  });

  try {
    fs.mkdirSync(traceDir, { recursive: true });
    // Stryker disable next-line StringLiteral: EQUIVALENT — the runtime this suite runs on does not
    // reject an unrecognised encoding string on write, so `"utf8"` -> `""` writes the same bytes.
    fs.writeFileSync(receiptPath(traceDir, sessionId), `${JSON.stringify(merged)}\n`, "utf8");
    return true;
  } catch {
    // Bookkeeping, never the run: an ingest that recovered real events has done its job whether or
    // not the note about it landed. The caller reports the false rather than swallowing it.
    return false;
  }
}
