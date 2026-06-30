// inFlightActivity — the pure claim-row → ClaimActivity[] fold (B1 + B2).
// Mirror of inFlightBuilds.ts for events.node_claim rows.
//
// Why a standalone module: the LIVE SQL reading events.node_claim needs a DB
// (activityApi integration test + operator-attested deep-link), but the
// stale-drop filter and the ADR-0138 §5 honesty-wall discriminator are pure
// data math — red-green here without a DB.

/**
 * Mirrors CLAIM_STALE_RECLAIM_MS from @storytree/notice-board (2 hours).
 * A claim whose heartbeatAt is past this threshold is stale: the holder
 * crashed/was killed and never ran release(), so the wisp self-heals rather
 * than orbiting forever.
 */
const CLAIM_STALE_RECLAIM_MS = 2 * 60 * 60 * 1_000; // 2 h

/** One raw row from the events.node_claim query (scalar projection). */
export interface ClaimRow {
  unit_id: string;
  session_id: string;
  branch: string;
  intent: string;
  claimed_at: Date | string;
  heartbeat_at: Date | string;
}

/**
 * Wire shape for a claimed-but-not-proven activity (ADR-0138 §5 honesty wall).
 * `kind: "claim"` is the discriminator — a renderer paints this distinct from
 * the proven-green bloom (ADR-0045). The fold enforces this in data, before any pixel.
 */
export interface ClaimActivity {
  /** The claimed unit — a story or capability id. */
  unitId: string;
  /** Discriminator: always "claim" — never "green" or "bloom" (ADR-0138 §5). */
  kind: 'claim';
  sessionId: string;
  branch: string;
  intent: string;
  /** ISO string of `claimed_at`. */
  at: string;
}

/**
 * Fold the claim rows into the wire shape: normalise `claimed_at` to ISO,
 * DROP a claim whose `heartbeatAt` is past the stale-reclaim window (2 h),
 * and set `kind: "claim"` so a renderer paints it distinct from the
 * proven-green bloom (ADR-0138 §5, ADR-0045).
 * Pure: rows + now in, ClaimActivity[] out.
 */
export function claimsToActivity(rows: readonly ClaimRow[], now: Date): ClaimActivity[] {
  const out: ClaimActivity[] = [];
  for (const row of rows) {
    const hbAt =
      row.heartbeat_at instanceof Date
        ? row.heartbeat_at.toISOString()
        : new Date(row.heartbeat_at).toISOString();
    if (now.getTime() - new Date(hbAt).getTime() > CLAIM_STALE_RECLAIM_MS) continue;
    const claimedAt =
      row.claimed_at instanceof Date
        ? row.claimed_at.toISOString()
        : new Date(row.claimed_at).toISOString();
    out.push({
      unitId: row.unit_id,
      kind: 'claim',
      sessionId: row.session_id,
      branch: row.branch,
      intent: row.intent,
      at: claimedAt,
    });
  }
  return out;
}
