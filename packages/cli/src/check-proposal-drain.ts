// The proposal-drain ceiling gate (ADR-0287 D3), wired into `pnpm gate` — NOT into CI.
//
// ADR-0287 D1/D2 (PR #1088) made the `tool` friction route EMIT a `proposal` and cite it, so the one
// route that named only a destination finally names an artifact kind like the other seven. D3 is the
// half that keeps the new tier from becoming the old dead end: a parked remedy nothing ever reads
// would satisfy `check:friction-drain` and build nothing, exactly as `route: tool` did (6 of 125
// delivered, measured 2026-08-02).
//
// The rule, and why it is not a count: see the pure core's header (`proposal-drain.ts`). In short —
// a proposal is parked BY DESIGN, so a count ceiling would force premature builds; the ceiling is
// RECURRENCE instead. An open proposal reds when its source friction gains a reinforcement dated
// after the proposal was created. There is no number here to raise.
//
// HONEST COST, and the reachability policy ADR-0287 D3 says to mirror EXACTLY from
// `check:friction-drain`: this reads the LIVE proposal tier and the LIVE friction worklist, so it
// runs only where the DB is reachable — local gates — and SKIPs in DB-free CI. CI never enforces the
// ceiling; the standing delivery obligation does. No creds / DB unreachable → SKIP (exit 0, offline
// gate unaffected). The ONLY non-zero exit is a real recurrence against a successfully-read tier —
// never an infra blip (fail-closed on the queue, fail-open on the substrate).

import { createPool, closePool, PgLibraryStore } from "@storytree/library/store";

import {
  evaluateProposalDrain,
  type FrictionCitation,
  type ProposalDrainVerdict,
  type ProposalRecord,
  type RecurrenceHit,
  type ReinforcementRecord,
} from "./proposal-drain.js";
import { loadLocalSecrets, presentEnv } from "./secrets.js";

const TAG = "[check:proposal-drain]";
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

/** Project a stored proposal down to the pure core's minimal shape — defensively, never throwing. */
function projectProposal(stored: { id: string; doc: unknown }): ProposalRecord {
  const rec = body(stored);
  return {
    id: stored.id,
    title: str(rec, "title"),
    createdAt: str(rec, "createdAt"),
    status: str(rec, "status"),
    lifecycle: str(rec, "lifecycle"),
  };
}

/** Project a stored friction doc down to the SOURCE side of the citation edge. */
function projectFriction(stored: { id: string; doc: unknown }): FrictionCitation {
  const rec = body(stored);
  const raw = Array.isArray(rec["reinforcedBy"]) ? (rec["reinforcedBy"] as unknown[]) : [];
  const reinforcedBy: ReinforcementRecord[] = raw.map((entry) => {
    const e =
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    return { branch: str(e, "branch"), date: str(e, "date") };
  });
  return {
    id: stored.id,
    // Passed RAW: the shared token rule in `proposal-citation.ts` owns the defensive parse, so this
    // shell cannot drift from the write path's fence by pre-filtering differently.
    references: rec["references"],
    dischargedBy: str(rec, "dischargedBy"),
    reinforcedBy,
  };
}

/** The tier's shape, printed on every path so an empty signal is visibly an empty signal. */
function tally(v: ProposalDrainVerdict): string {
  const parts = [
    `${v.openCount} open`,
    ...(v.closedCount > 0 ? [`${v.closedCount} closed`] : []),
    `${v.uncitedCount} uncited`,
    `${v.deliveredCount} delivered`,
  ];
  return `${parts.join(" · ")} · ${v.total} total`;
}

/** Group hits by proposal so a five-reinforcement item prints as one block, not five lines. */
function byProposal(hits: readonly RecurrenceHit[]): Map<string, RecurrenceHit[]> {
  const grouped = new Map<string, RecurrenceHit[]>();
  for (const h of hits) {
    const bucket = grouped.get(h.proposalId);
    if (bucket === undefined) grouped.set(h.proposalId, [h]);
    else bucket.push(h);
  }
  return grouped;
}

function report(v: ProposalDrainVerdict): void {
  if (v.level === "ok") {
    console.log(`${TAG} OK — no parked remedy has been re-hit since it was parked: ${tally(v)}.`);
    return;
  }

  if (v.level === "warn") {
    console.warn(`${TAG} WARN — the proposal tier has rows the ceiling cannot judge: ${tally(v)}.`);
    for (const [id, hits] of byProposal(v.sameDay)) {
      const h = hits[0]!;
      console.warn(
        `${TAG}   ${id} was parked on ${h.createdDay} and its source friction was reinforced the SAME day —`,
      );
      console.warn(
        `${TAG}     ${hits.map((x) => `${x.frictionId}@${x.branch}`).join(", ")}. A day stamp cannot order the two, so this is not a breach.`,
      );
    }
    for (const u of v.undated) console.warn(`${TAG}   ${u}`);
    return;
  }

  // red — fail-closed
  const grouped = byProposal(v.recurrences);
  console.error(
    `${TAG} RED — ${grouped.size} parked remedy/remedies bit again after being parked (${v.recurrences.length} recurrence(s)): ${tally(v)}.`,
  );
  for (const [id, hits] of grouped) {
    const h = hits[0]!;
    console.error(`${TAG}   proposal ${id}${h.proposalTitle === "" ? "" : ` — ${h.proposalTitle}`}`);
    console.error(`${TAG}     parked ${h.createdDay}; re-hit since by:`);
    for (const x of hits) {
      console.error(`${TAG}       ${x.day}  ${x.frictionId}  (${x.branch})`);
    }
  }
  console.error(
    `${TAG}   Landing is blocked until the remedy is delivered (ADR-0287 D3). Two honest discharges:`,
  );
  console.error(
    `${TAG}     1. BUILD it — the proposal already carries the ordered steps and the readiness`,
  );
  console.error(`${TAG}        preconditions it was parked with:`);
  for (const id of grouped.keys()) {
    console.error(`${TAG}          storytree library artifact ${id} --pg`);
  }
  console.error(
    `${TAG}     2. STAMP it if the remedy has ALREADY landed — the obligation is discharged on the`,
  );
  console.error(`${TAG}        friction item, not the proposal:`);
  for (const h of v.recurrences.slice(0, 3)) {
    console.error(
      `${TAG}          storytree friction route ${h.frictionId} --route tool --reason "…" --discharged-by "<PR/ADR/asset ref>" --pg`,
    );
  }
  console.error(
    `${TAG}   There is no ceiling NUMBER to raise here: the cap is recurrence, not count (ADR-0287 D3),`,
  );
  console.error(
    `${TAG}   so an unhit proposal stays quiet forever and only a re-hit one ever escalates.`,
  );
  console.error(`${TAG}   (DB-local; CI does not enforce it.)`);
}

async function main(): Promise<void> {
  // Match the CLI: hydrate STORYTREE_DB_USER from ~/.storytree/secrets.json when unset (env wins).
  loadLocalSecrets();

  if (presentEnv("STORYTREE_DB_USER") === undefined) {
    console.log(`${TAG} SKIP — no STORYTREE_DB_USER (DB creds absent); proposal tier unverified.`);
    return;
  }

  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  let verdict: ProposalDrainVerdict | undefined;
  try {
    handle = await createPool();
    const pg = new PgLibraryStore(handle.pool);
    // Two reads, one timeout budget: the edge only exists on the friction side (ADR-0287 D1 puts no
    // reverse pointer on the proposal), so the whole worklist is the join's other half.
    const [proposals, frictions] = await withTimeout(
      Promise.all([pg.queryDocs({ kind: "proposal" }), pg.queryDocs({ kind: "friction" })]),
      LIVE_READ_TIMEOUT_MS,
      "live read",
    );
    verdict = evaluateProposalDrain(proposals.map(projectProposal), frictions.map(projectFriction));
  } catch (err) {
    // Infra failure (stopped DB, cold-start timeout, network) — SKIP, never red. The ceiling is
    // fail-closed on the QUEUE, fail-open on the SUBSTRATE.
    console.log(
      `${TAG} SKIP — live DB not reachable (${(err as Error).message}); proposal tier unverified, offline gate unaffected.`,
    );
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
  // An unexpected error is advisory only — never fail the gate on an infra problem in this check.
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); proposal tier unverified.`);
});
