// The desktop's claim-row → map-activity fold: the pure half of `inFlightClaims`
// (electron/backend-entry.ts), which serves the world's `GET /api/activity` claim layer.
//
// THE BOUNDARY CALL (ADR-0100 / ADR-0119): this RE-COMPOSES apps/studio/server/inFlightActivity.ts's
// `claimsToActivity` — it does NOT import it (a forbidden surface→surface coupling). That duplication
// is the accepted cost of the boundary, and it has a KNOWN failure mode this module exists to close:
// the studio's query grew a `grade` column at ADR-0200 D7 and the desktop copy never did, so every
// claim reached the map grade-less. The client defaults an absent grade to `work` (ADR-0200 D2
// back-compat), so an `exploring` or `waiting` session rendered as a full whole-island ORBIT instead of
// its own hover / queue geometry — two sessions on one story read as two work holders, which the D2
// mutex makes impossible. Keeping the SQL and the fold in ONE testable module (both derived from
// {@link CLAIM_ROW_COLUMNS}) is what stops the column list and the reader drifting apart again.
//
// PURE + pg-FREE: rows in, wire activities out — no `pg`, no `electron`, no store import. The live
// query lives in electron/backend-entry.ts, where the pool is.

/**
 * The claim GRADES (ADR-0200 D2), mirroring `@storytree/notice-board`'s `ClaimGrade` as a local
 * vocabulary (this module stays dependency-free, the same discipline the sibling folds follow):
 * `exploring` and `waiting` are SHARED (any number of sessions per unit), `work` is the exclusive
 * mutex. The frontend picks the wisp GEOMETRY from this — hover / queue line / whole-island orbit.
 */
export type DesktopClaimGrade = "exploring" | "waiting" | "work";

/**
 * The columns `events.node_claim` must yield for {@link claimRowsToActivity} to fold a row. The SQL
 * ({@link IN_FLIGHT_CLAIMS_SQL}) is BUILT from this list, so a column can never go missing from the
 * SELECT while the fold still expects it — the exact drift that dropped `grade`.
 */
export const CLAIM_ROW_COLUMNS = [
  "unit_id",
  "session_id",
  "grade",
  "branch",
  "intent",
  "claimed_at",
  "heartbeat_at",
] as const;

/** The live in-flight-claims read. Every live row — the composite PK `(unit_id, session_id)` means a
 *  unit may carry several (one work + any number of shared), so no `DISTINCT ON`; staleness is the
 *  fold's job (JS-side, mirroring the studio). */
export const IN_FLIGHT_CLAIMS_SQL = `SELECT ${CLAIM_ROW_COLUMNS.join(", ")}
   FROM events.node_claim`;

/** One raw `events.node_claim` row, as `pg` hands it back. */
export interface DesktopClaimRow {
  unit_id: string;
  session_id: string;
  /** ADR-0200 D2's grade column — tolerated absent/null/unknown here and normalised to `work`. */
  grade?: string | null;
  branch: string;
  intent: string;
  claimed_at: Date | string;
  heartbeat_at: Date | string;
}

/** One folded map-activity claim — the wire shape the world's `/api/activity` poll renders as a wisp. */
export interface DesktopClaimActivity {
  unitId: string;
  /** The ADR-0138 §5 honesty-wall discriminator: a claim is coordination, NEVER a proven-green bloom. */
  kind: "claim";
  sessionId: string;
  branch: string;
  intent: string;
  /** Geometry: `exploring` hovers, `waiting` queues, `work` orbits (ADR-0200 D7). */
  grade: DesktopClaimGrade;
  at: string;
}

/**
 * The claim stale-reclaim window (ADR-0138 §5) — mirrors `CLAIM_STALE_RECLAIM_MS` in
 * `@storytree/notice-board` and the studio's `inFlightActivity` fold. A claim whose heartbeat aged out
 * belongs to a crashed holder, so its wisp self-heals rather than orbiting forever.
 */
export const CLAIM_STALE_RECLAIM_MS = 2 * 60 * 60 * 1_000; // 2 h

const toIso = (at: Date | string): string =>
  at instanceof Date ? at.toISOString() : new Date(at).toISOString();

/**
 * PURE: fold live claim rows into map activities — stale rows dropped, `kind: "claim"` stamped, and
 * the grade normalised. An absent or unrecognised raw grade becomes `work` (ADR-0200 D2 back-compat:
 * an absent grade IS the work claim), so a pre-grade row still renders as today's orbit while a real
 * `exploring` / `waiting` row keeps its own geometry.
 */
export function claimRowsToActivity(
  rows: readonly DesktopClaimRow[],
  now: Date,
  staleMs: number = CLAIM_STALE_RECLAIM_MS,
): DesktopClaimActivity[] {
  const out: DesktopClaimActivity[] = [];
  for (const row of rows) {
    const hbAt = toIso(row.heartbeat_at);
    if (now.getTime() - new Date(hbAt).getTime() > staleMs) continue; // stale — self-heals
    const grade: DesktopClaimGrade =
      row.grade === "exploring" || row.grade === "waiting" ? row.grade : "work";
    out.push({
      unitId: row.unit_id,
      kind: "claim",
      sessionId: row.session_id,
      branch: row.branch,
      intent: row.intent,
      grade,
      at: toIso(row.claimed_at),
    });
  }
  return out;
}
