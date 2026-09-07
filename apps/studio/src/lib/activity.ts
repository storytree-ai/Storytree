// The world's live-ACTIVITY layer: the in-flight BUILD signal (ADR-0048).
//
// WHAT USED TO LIVE HERE, and why it is gone (ADR-0529). This module also carried the
// "recently-landed" verdict bloom (ADR-0045) — a transient decaying announcement that a signed
// verdict had landed on a unit's territory. It has not been drawn on any surface since 2026-07-23:
// the bloom was built by `buildTree`, and ADR-0227 replaced `buildTree` with a `<use>` of the baked
// hero whenever the studio supplies `vegetation.heroTrees`, which it does for every status. The
// owner retired it rather than restoring it — he reads the forest as a glance-level signal, and a
// transient per-landing announcement is not what he glances for.
//
// THE THROUGH-LINE SURVIVES THE BLOOM, and it is the durable half: the plant HUE is the
// steady-state record (ADR-0040, verdict-derived green). The bloom was only ever the transient
// announcement of the TRANSITION that produced that hue. Removing it takes nothing away from the
// record, because the hue was always where the record lived — which is also why nothing here needs
// a replacement: a persistent activity dot would re-encode the bit the hue already carries, the
// same-bit-twice shape ADR-0040 used to DELETE the UAT badges.

import { BUILD_IN_FLIGHT_TTL_MS, type BuildActivity, type TreeVerdict } from '../types';

// ---------- in-flight build activity (ADR-0048) ----------

/**
 * Is this build still in flight at `now`? True while the `building` event is
 * younger than the TTL (ADR-0048 §2). The server already drops builds whose run
 * produced a verdict; this is the SUB-POLL aging — a build vanishes the instant
 * the `now` ticker crosses the TTL, not at the next fetch. PURE: the caller supplies `now` (the
 * consumer's slow ticker), the same contract `formatAge` obeys, so nothing jitters between renders.
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
