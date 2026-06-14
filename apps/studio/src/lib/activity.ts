// The world's live-ACTIVITY layer (ADR-0045): a "recently-landed" bloom — a
// transient, decaying announcement that a signed verdict landed on this unit's
// territory in the last few hours. Sibling to provenStatus in worldStatus.ts.
//
// WHY a verdict, not a merge (the rationale this layer rests on): merge-changed
// files do NOT map to story territories — almost every merge touches
// apps/packages/docs, hardly ever stories/<id>/ (the code lives OUTSIDE the spec
// tree). The only per-unit, immutable, territory-anchored "real work landed
// here" signal is the SIGNED VERDICT, and `verdict.at` is already on the wire
// (latestVerdicts → story.verdict / cap.verdict). So the bloom is a pure
// CLIENT-SIDE decoration off existing data — zero new query, endpoint, or infra.
//
// THE THROUGH-LINE (state it once, here): the durable plant HUE is the
// steady-state record (ADR-0040, verdict-derived green); the bloom is the
// TRANSIENT announcement of the *transition* that produced that hue, and it
// decays to nothing. A persistent activity dot would re-encode the bit the hue
// already carries — the exact same-bit-twice ADR-0040 used to DELETE the UAT
// badges. So activity must be transient-only: a bloom that has aged out returns
// null and the territory is back to carrying its result in colour alone.

import { BUILD_IN_FLIGHT_TTL_MS, type BuildActivity, type TreeVerdict } from '../types';

/**
 * How long a signed verdict reads as "recently landed". Owner-tunable
 * (ADR-0045 §named-deferred leaves the exact figure a future call). DO NOT ship
 * a widened value to force a screenshot — inject a recent `now` in a harness
 * instead.
 */
export const BLOOM_WINDOW_HOURS = 6;
const HOUR_MS = 3_600_000;

/** A live bloom: which hue (the verdict's outcome) and how bright (decays with age). */
export interface VerdictBloom {
  outcome: TreeVerdict['outcome'];
  /** 1 at the instant the verdict landed → 0 at the window edge; drives opacity. */
  ageRatio: number;
}

/**
 * The bloom a unit wears right now, or null if there's nothing to announce:
 * no verdict, OR the verdict landed `windowHours` ago or longer (aged out), OR
 * — v1 scope (ADR-0045 §3) — the verdict is a FAIL. A signed fail already
 * withers the plant (ADR-0040); a red bloom is a named owner call, deliberately
 * left out of v1. So only a PASS blooms.
 *
 * Pure: the caller supplies `now` (the consumer's slow ticker), the same purity
 * contract formatAge / rebandSessions obey, so the geometry never jitters
 * between renders.
 */
export function verdictBloom(
  verdict: TreeVerdict | undefined,
  now: Date,
  windowHours: number = BLOOM_WINDOW_HOURS,
): VerdictBloom | null {
  if (!verdict || verdict.outcome !== 'pass') return null;
  const ageHours = (now.getTime() - new Date(verdict.at).getTime()) / HOUR_MS;
  // An unparseable `at` (NaN) never blooms — a malformed timestamp is not a
  // landing. Future-dated or aged-out verdicts don't bloom either (a clock-skewed
  // `at` clamps to full brightness rather than overshooting; an aged-out one
  // returns null).
  if (!Number.isFinite(ageHours) || ageHours >= windowHours) return null;
  const ageRatio = Math.min(1, Math.max(0, 1 - ageHours / windowHours));
  return { outcome: verdict.outcome, ageRatio };
}

/**
 * Does ANY unit (story crown or capability) carry a live bloom at `now`? Drives
 * the legend's 'activity' row visibility (ADR-0045 §6) off the same `verdict.at`
 * the proof facts already read — the row drops out the moment the last bloom
 * ages past the window, exactly like a model with no instance.
 */
export function anyRecentLanding(
  stories: { verdict?: TreeVerdict; capabilities: { verdict?: TreeVerdict }[] }[],
  now: Date,
  windowHours: number = BLOOM_WINDOW_HOURS,
): boolean {
  for (const s of stories) {
    if (verdictBloom(s.verdict, now, windowHours)) return true;
    for (const c of s.capabilities) {
      if (verdictBloom(c.verdict, now, windowHours)) return true;
    }
  }
  return false;
}

// ---------- in-flight build activity (ADR-0048) ----------

/**
 * Is this build still in flight at `now`? True while the `building` event is
 * younger than the TTL (ADR-0048 §2). The server already drops builds whose run
 * produced a verdict; this is the SUB-POLL aging — a build vanishes the instant
 * the `now` ticker crosses the TTL, not at the next fetch (the same purity rule
 * `classifyPresence` / `verdictBloom` obey: the caller supplies `now`).
 *
 * A future-dated `at` (clock skew at the just-started instant) still reads as
 * in-flight; an unparseable `at` (NaN) does not — a malformed timestamp is not
 * live work.
 */
export function isBuildInFlight(
  at: string,
  now: Date,
  ttlMs: number = BUILD_IN_FLIGHT_TTL_MS,
): boolean {
  const elapsed = now.getTime() - new Date(at).getTime();
  if (!Number.isFinite(elapsed)) return false;
  return elapsed < ttlMs;
}

/** Are ANY builds in flight at `now`? Drives the legend's 'building' row visibility. */
export function anyInFlight(
  builds: BuildActivity[],
  now: Date,
  ttlMs: number = BUILD_IN_FLIGHT_TTL_MS,
): boolean {
  return builds.some((b) => isBuildInFlight(b.at, now, ttlMs));
}
