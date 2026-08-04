// The arc-proposal drain ceiling gate (ADR-0298 D3), wired into `pnpm gate` AND — since ADR-0302 D3 —
// into CI's `verify` job.
//
// ADR-0298 D1/D2 retired the `proposal` kind and made the `tool` friction route park its remedy as an
// entry on the ARC that owns it, cited from the item's `references`. D3 is the half that keeps the
// new shape from becoming the old dead end: a parked remedy nothing ever reads would satisfy
// `check:friction-drain` and build nothing, exactly as a bare `route: tool` did (6 of 125 delivered,
// measured 2026-08-02). It preserves ADR-0287 D3's ceiling verbatim; only the object it counts moved.
//
// The rule, and why it is not a count: see the pure core's header (`arc-proposal-drain.ts`). In short
// — a parked entry is parked BY DESIGN, so a count ceiling would force premature builds; the ceiling
// is RECURRENCE instead. An open entry reds when a friction item it names gains a reinforcement dated
// after the entry was parked. There is no number here to raise.
//
// REACHABILITY, AND HOW IT CHANGED. This reads the LIVE arcs and the LIVE friction worklist. The
// policy ADR-0287 D3 set and ADR-0298 D3 kept had it run only where the DB is reachable — local
// gates — and SKIP in DB-free CI, because CI held no credential. ADR-0302 D3 gives CI one, so this
// now runs there too, off the existing keyless WIF identity (`infra/ci-presence.tf`) with
// `STORYTREE_DB_USER` set on that step alone.
//
// The ceiling itself is UNCHANGED — fail-closed on the QUEUE, fail-open on the SUBSTRATE: a real
// recurrence against a successfully-read corpus is the only non-zero exit, and an infra blip is a
// SKIP. What ADR-0302 D3 adds is that an environment may DECLARE the live store mandatory, via
// `STORYTREE_DB_REQUIRED`, and there both absence arms turn red instead — a credentialed environment
// that skips is a check that cannot bite. One shared, tested decision in `db-required.ts` (see its
// header for why it is an explicit declaration and not an `if (CI)`), so this rung and
// `check:friction-drain` can never drift apart on it. The standing delivery obligation, not CI,
// remains what actually drains the board.

import { createPool, closePool, PgLibraryStore } from "@storytree/library/store";

import {
  evaluateArcProposalDrain,
  type ArcProposalDrainVerdict,
  type ArcProposalRecord,
  type FrictionRecord,
  type RecurrenceHit,
  type ReinforcementRecord,
} from "./arc-proposal-drain.js";
import {
  DB_REQUIRED_ENV,
  dbIsRequired,
  evaluateDbAbsence,
  type DbAbsence,
} from "./db-required.js";
import { loadLocalSecrets, presentEnv } from "./secrets.js";

const TAG = "[check:arc-proposal-drain]";
/** Bound the live reads so a stopped DB can't hang the gate (matches check:friction-drain). */
const LIVE_READ_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref?.();
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** The untyped body of a stored doc, defensively ({} when it is not an object). */
function body(stored: { doc: unknown }): Record<string, unknown> {
  return typeof stored.doc === "object" && stored.doc !== null
    ? (stored.doc as Record<string, unknown>)
    : {};
}

function str(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Flatten one stored ARC into its parked entries, in the pure core's minimal shape — defensively,
 * never throwing. An arc with no `proposals` contributes nothing, which is the normal case.
 */
function projectArcEntries(stored: { id: string; doc: unknown }): ArcProposalRecord[] {
  const rec = body(stored);
  const raw = Array.isArray(rec["proposals"]) ? (rec["proposals"] as unknown[]) : [];
  const out: ArcProposalRecord[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const e = item as Record<string, unknown>;
    const id = str(e, "id");
    if (id === undefined) continue;
    const refs = Array.isArray(e["frictionRefs"])
      ? (e["frictionRefs"] as unknown[]).filter((r): r is string => typeof r === "string")
      : [];
    out.push({
      arcId: stored.id,
      id,
      title: str(e, "title"),
      parked: str(e, "parked"),
      frictionRefs: refs,
      realized: e["realized"],
    });
  }
  return out;
}

/** Project a stored friction doc down to the reinforcement side of the join. */
function projectFriction(stored: { id: string; doc: unknown }): FrictionRecord {
  const rec = body(stored);
  const raw = Array.isArray(rec["reinforcedBy"]) ? (rec["reinforcedBy"] as unknown[]) : [];
  const reinforcedBy: ReinforcementRecord[] = raw.map((entry) => {
    const e =
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    return { branch: str(e, "branch"), date: str(e, "date") };
  });
  return {
    id: stored.id,
    dischargedBy: str(rec, "dischargedBy"),
    reinforcedBy,
  };
}

/** The parked population's shape, printed on every path so an empty signal is visibly an empty signal. */
function tally(v: ArcProposalDrainVerdict): string {
  const parts = [
    `${v.openCount} parked`,
    ...(v.realizedCount > 0 ? [`${v.realizedCount} realized`] : []),
    `${v.uncitedCount} uncited`,
    `${v.deliveredCount} delivered`,
  ];
  return `${parts.join(" · ")} · ${v.total} total`;
}

/** Group hits by entry so a five-reinforcement item prints as one block, not five lines. */
function byEntry(hits: readonly RecurrenceHit[]): Map<string, RecurrenceHit[]> {
  const grouped = new Map<string, RecurrenceHit[]>();
  for (const h of hits) {
    const key = `${h.arcId}/${h.entryId}`;
    const bucket = grouped.get(key);
    if (bucket === undefined) grouped.set(key, [h]);
    else bucket.push(h);
  }
  return grouped;
}

function report(v: ArcProposalDrainVerdict): void {
  if (v.level === "ok") {
    console.log(`${TAG} OK — no parked remedy has been re-hit since it was parked: ${tally(v)}.`);
    return;
  }

  if (v.level === "warn") {
    console.warn(`${TAG} WARN — the parked-work list has rows the ceiling cannot judge: ${tally(v)}.`);
    for (const [key, hits] of byEntry(v.sameDay)) {
      const h = hits[0]!;
      console.warn(
        `${TAG}   ${key} was parked on ${h.parkedDay} and a friction it names was reinforced the SAME day —`,
      );
      console.warn(
        `${TAG}     ${hits.map((x) => `${x.frictionId}@${x.branch}`).join(", ")}. A day stamp cannot order the two, so this is not a breach.`,
      );
    }
    for (const u of v.undated) console.warn(`${TAG}   ${u}`);
    return;
  }

  // red — fail-closed
  const grouped = byEntry(v.recurrences);
  console.error(
    `${TAG} RED — ${grouped.size} parked remedy/remedies bit again after being parked (${v.recurrences.length} recurrence(s)): ${tally(v)}.`,
  );
  for (const [key, hits] of grouped) {
    const h = hits[0]!;
    console.error(`${TAG}   ${key}${h.entryTitle === "" ? "" : ` — ${h.entryTitle}`}`);
    console.error(`${TAG}     parked ${h.parkedDay}; re-hit since by:`);
    for (const x of hits) {
      console.error(`${TAG}       ${x.day}  ${x.frictionId}  (${x.branch})`);
    }
  }
  console.error(
    `${TAG}   Landing is blocked until the remedy is delivered (ADR-0298 D3). Three honest discharges:`,
  );
  console.error(
    `${TAG}     1. BUILD it — the entry already carries the ordered steps and readiness it was parked with:`,
  );
  for (const key of grouped.keys()) {
    console.error(`${TAG}          storytree arc show ${key.split("/")[0]} --pg`);
  }
  console.error(`${TAG}     2. MARK IT LANDED once it ships — run this beside the closing leg's increment:`);
  for (const [key] of [...grouped].slice(0, 3)) {
    const [arcId, entryId] = key.split("/");
    console.error(`${TAG}          storytree arc proposal realize ${arcId} --id ${entryId} --pr "<ref>" --pg`);
  }
  console.error(
    `${TAG}     3. STAMP it if the remedy landed WITHOUT ever being parked (the pre-ADR-0298 path):`,
  );
  for (const h of v.recurrences.slice(0, 3)) {
    console.error(
      `${TAG}          storytree friction route ${h.frictionId} --route tool --reason @<file> --discharged-by "<PR/ADR/asset ref>" --pg`,
    );
  }
  console.error(
    `${TAG}   There is no ceiling NUMBER to raise here: the cap is recurrence, not count (ADR-0298 D3),`,
  );
  console.error(
    `${TAG}   so an unhit entry stays quiet forever and only a re-hit one ever escalates.`,
  );
  console.error(`${TAG}   (Runs local AND in CI since ADR-0302 D3.)`);
}

/** Print an absence verdict and set the exit code it calls for. Shared by both arms below. */
function reportAbsence(absence: DbAbsence): void {
  const verdict = evaluateDbAbsence({
    absence,
    required: dbIsRequired(process.env[DB_REQUIRED_ENV]),
    subject: "parked work",
  });
  if (verdict.level === "red") {
    console.error(`${TAG} ${verdict.message}`);
    process.exitCode = 1;
  } else {
    console.log(`${TAG} ${verdict.message}`);
  }
}

async function main(): Promise<void> {
  // Match the CLI: hydrate STORYTREE_DB_USER from ~/.storytree/secrets.json when unset (env wins).
  loadLocalSecrets();

  if (presentEnv("STORYTREE_DB_USER") === undefined) {
    reportAbsence({ kind: "no-credential" });
    return;
  }

  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  let verdict: ArcProposalDrainVerdict | undefined;
  try {
    handle = await createPool();
    const pg = new PgLibraryStore(handle.pool);
    // Two reads, one timeout budget: the parked entries live inside the arc docs (ADR-0298 D1), and
    // the whole friction worklist is the join's other half.
    const [arcs, frictions] = await withTimeout(
      Promise.all([pg.queryDocs({ kind: "arc" }), pg.queryDocs({ kind: "friction" })]),
      LIVE_READ_TIMEOUT_MS,
      "live read",
    );
    verdict = evaluateArcProposalDrain(arcs.flatMap(projectArcEntries), frictions.map(projectFriction));
  } catch (err) {
    // Infra failure (stopped DB, cold-start timeout, network). SKIP by default — the ceiling is
    // fail-closed on the QUEUE, fail-open on the SUBSTRATE — unless this environment declared the
    // live store mandatory, in which case an unread ceiling is a red rather than a silent pass.
    reportAbsence({ kind: "unreachable", detail: (err as Error).message });
    return;
  } finally {
    if (handle) await closePool(handle.pool, handle.connector).catch(() => {});
  }

  if (verdict === undefined) return; // unreachable; the catch returns on failure.

  report(verdict);
  // FAIL-CLOSED: only a genuine recurrence against a real read sets a non-zero exit.
  if (verdict.level === "red") process.exitCode = 1;
}

main().catch((err: unknown) => {
  // An unexpected error is advisory only — never fail the gate on an infra problem in this check —
  // EXCEPT where the environment declared the live store mandatory, in which case "unverified" and
  // "passed" must not print the same way. Same policy as the two arms above, deliberately.
  reportAbsence({ kind: "unreachable", detail: `unexpected error: ${(err as Error).message}` });
});
