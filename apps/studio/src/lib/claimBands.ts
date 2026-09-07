// The claim BANDS (ADR-0535 D1) — the studio's one answer to "how much do we actually know about
// this claim's holder?", used by every surface that renders the claim ledger: the arc lane
// (lib/arcSurface.ts) and the session dock (components/TreeView.tsx).
//
// THREE BANDS, NOT TWO, AND THE MIDDLE ONE IS THE WHOLE POINT. The surface used to know only
// "claimed" and "nobody" — so a session whose liveness signal had gone dark collapsed into the
// second, and the arc lane rendered the word `quiet`, which asserts calm. That is the misread this
// module exists to make unreachable: an owner looked at an arc with 432 tool calls still running on
// it and concluded the work was finished.
//
//   · `live`      — we heard from the holder inside the staleness window. Someone IS working here.
//   · `unknown`   — a session took this claim and never released it, and we have not heard from it
//                   since. NOT a claim that nobody is working; a claim that we cannot tell, shown
//                   WITH how long it has been since we last heard (ADR-0366 D4: "a liveness probe
//                   that cannot answer is not a probe that answered no").
//   · `abandoned` — old enough that saying "we don't know" about it is itself noise. Moved OFF the
//                   arc into a tidy-up list, because a board that opens with three dozen dead rows
//                   against a handful of live ones is a board its reader learns to ignore — which
//                   is precisely how the previous self-reported presence layer died.
//
// ⚠⚠ THIS MODULE DOES NOT DECIDE STALENESS, AND THAT IS STRUCTURAL RATHER THAN POLITE.
// The `live`/`unknown` line is the server's own `stale` flag, read off the wire — the single
// `isReclaimable` predicate in @storytree/notice-board that the store enforces in SQL and
// `groupClaimsBySession` stamps onto every row. Nothing here re-derives it, and no copy of
// `CLAIM_STALE_RECLAIM_MS` lives in this file, so the browser CANNOT disagree with the command line
// about which rows are live: it never computes the answer, it reads it. Two reads of one table
// diverging is the exact fault ADR-0535 was written to repair, and the cheapest way not to
// reintroduce it one layer up is to have nothing here that could.
//
// What this module DOES own is one display-only line drawn INSIDE the already-stale set
// ({@link CLAIM_ABANDONED_DISPLAY_MS}) — a rendering decision, never a second staleness rule.
//
// Pure: no React, no fetch, no clock. Every input is already a server-stamped age.

import type { SessionClaimEntry, SessionClaimGroup } from '../types';

/**
 * How old a claim's last-heard-from stamp must be before the surface stops carrying it on the arc
 * and files it under tidy-up instead (ADR-0535 D1).
 *
 * ⚠ DISPLAY ONLY. IT IS NOT A SECOND STALENESS RULE, AND IT MUST NEVER BECOME ONE. It does not
 * touch `CLAIM_STALE_RECLAIM_MS`, it does not touch the takeover rule that lets a live session
 * reclaim a dead session's node, and no store read consults it. Weakening the takeover rule to buy
 * display honesty would let three-week-old corpses fence live work out forever — the failure in the
 * other direction, and one with no tell either.
 *
 * WHY 48 HOURS, AND WHY GENEROUS RATHER THAN TIGHT. The two mistakes this line can make are not
 * symmetric. Set it too LOW and a live-but-quiet session's claim drops off the arc, the arc reads
 * `quiet`, and we have rebuilt the exact incident ADR-0535 was written about. Set it too HIGH and
 * some corpses linger as `unknown`, which is merely untidy and still honest. So it is deliberately
 * far above any session's plausible working life rather than tuned to today's ledger.
 *
 * ⚠ AND THE MEASUREMENT IS CURRENTLY COARSER THAN IT LOOKS. The heartbeat refresh has not fired on
 * this machine since 2026-08-15 (35 of 40 rows carry a stamp identical to their claim moment), so
 * "last heard from" today means "when the claim was taken". A generous line is what keeps that
 * degradation from costing a live session its lane. The two sibling increments on
 * `ledger-liveness-honesty-arc` buy the real signal; this constant should be re-read, NOT merely
 * re-tuned, once they land.
 */
export const CLAIM_ABANDONED_DISPLAY_MS = 48 * 60 * 60 * 1_000; // 48 h

/** What a surface knows about one claim's holder — see the module header. */
export type ClaimBand = 'live' | 'unknown' | 'abandoned';

/**
 * The band for one claim entry off `GET /api/claims`.
 *
 * `stale` is the SERVER's verdict and is taken as given — see the module header for why nothing
 * here recomputes it. Only the `unknown`/`abandoned` split, which lives entirely inside the stale
 * set, is decided here.
 */
export function claimBand(entry: Pick<SessionClaimEntry, 'stale' | 'heartbeatAgeMs'>): ClaimBand {
  if (!entry.stale) return 'live';
  return entry.heartbeatAgeMs >= CLAIM_ABANDONED_DISPLAY_MS ? 'abandoned' : 'unknown';
}

/**
 * The two halves {@link partitionClaimGroups} returns — a named owner contract rather than an
 * anonymous shape, so both consumers (the arc lane and the session dock) name the same type.
 *
 * `null` in either half means the live store did not answer, which is not the same fact as an empty
 * array (nobody working). Both surfaces render two different sentences off that distinction.
 */
export interface ClaimBandPartition {
  /** Everything still worth putting in front of a reader — `live` and `unknown` alike, each marked. */
  board: SessionClaimGroup[] | null;
  /** The plainly-abandoned rows, folded away rather than dropped. */
  tidyUp: SessionClaimGroup[] | null;
}

/**
 * The two halves of the ledger a surface renders differently: everything still worth putting in
 * front of a reader (`board` — `live` and `unknown` alike), and the plainly-abandoned rows
 * (`tidyUp`).
 *
 * SPLIT AT CLAIM GRAIN, THEN REGROUPED — not at session grain. A session can hold one row it is
 * actively working and another it took days ago and forgot, and bucketing the whole group by its
 * worst (or best) row would either bury a live claim under a corpse or promote a corpse on the
 * strength of a live sibling. Groups with nothing left in a half are dropped rather than rendered
 * empty, and the input order (which `groupClaimsBySession` already made deterministic) survives in
 * both halves.
 *
 * `null` in — the live store did not answer — yields `null` in BOTH halves, which is how a surface
 * tells "no ledger here" from "nobody working". Collapsing that to `[]` is the same class of lie
 * this whole module exists to remove.
 */
export function partitionClaimGroups(
  groups: readonly SessionClaimGroup[] | null,
): ClaimBandPartition {
  if (groups === null) return { board: null, tidyUp: null };
  const half = (keep: (band: ClaimBand) => boolean): SessionClaimGroup[] =>
    groups
      .map((group) => ({ ...group, claims: group.claims.filter((c) => keep(claimBand(c))) }))
      .filter((group) => group.claims.length > 0);
  return {
    board: half((band) => band !== 'abandoned'),
    tidyUp: half((band) => band === 'abandoned'),
  };
}

/**
 * "how long since we last heard", compact — the phrase the `unknown` band is REQUIRED to carry
 * (ADR-0535 D1: an unknown reads as unknown, and it says how stale it is).
 *
 * Days appear past 48 h so the tidy-up list does not print `1219h`; the `unknown` band never
 * reaches that far by construction ({@link CLAIM_ABANDONED_DISPLAY_MS} is where it ends). Negative
 * or non-finite input clamps to `0m` rather than rendering `NaN` — a clock skew between the server
 * that stamped the age and the browser reading it must not produce a nonsense age on the one
 * surface whose whole job is to be honest about what it does not know.
 */
export function formatLastHeard(heartbeatAgeMs: number): string {
  const ms = Number.isFinite(heartbeatAgeMs) ? Math.max(0, heartbeatAgeMs) : 0;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
