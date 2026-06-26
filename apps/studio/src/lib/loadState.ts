// The studio's load + store-down state machine — the single honest decision for "which screen
// do we show while access resolves and while the live store is asleep/booting?"
//
// The owner principle is HONESTY OVER REASSURANCE (incident 2026-06-27): never imply success,
// never hang silently. The hosted studio sits on the shared Cloud SQL store, which now sleeps
// 1am–7am Sydney for cost (ADR-0015) — so a dead "Resolving access…" with no recovery affordance
// is the common, worst failure. This function turns the raw inputs into a small discriminated
// union the render switches on, so every transition is honest AND unit-testable without a DOM:
//
//   • CHECKING       — access is still resolving (BOUNDED by api.me's abort window; it always
//                      resolves to one of the states below — never an indefinite spinner).
//   • ASLEEP         — the server degraded to a 200 with me.storeUnreachable AND the independent
//                      /api/health poll agrees the DB is unreachable: the live store is asleep,
//                      likely idle-stopped. Seed admins (canWakeDb) get the "Wake the database"
//                      button; members wait for an admin. Always a Retry too.
//   • STORE-FAULT    — me.storeUnreachable, BUT /api/health independently reports the DB IS
//                      reachable. The two signals disagree, so this is NOT a sleeping DB — it's an
//                      unexpected fault. Say so honestly and offer Retry; do NOT tell the user to
//                      wake an already-running DB (that would be dishonest reassurance). This is
//                      the owner's "so I can tell if there IS an issue" case.
//   • STARTING       — a wake fired (or the health poll reports the instance coming up): show
//                      live "starting… ~a minute" progress, driven by StoreBanner's health poll.
//   • TAKING-LONGER  — STARTING has run well past the ~1-minute expectation: say so honestly
//                      rather than implying success or dying silently.
//   • SERVER-LOST    — /api/health itself stopped answering (the dev/studio server, not the DB).
//   • ERROR          — api.me ITSELF rejected (network / abort / a non-OK that is NOT the 200
//                      storeUnreachable path): the genuine-fault path, shown explicitly with the
//                      message + Retry, so the owner can tell a real fault from a sleeping DB.
//   • REQUEST-ACCESS — resolved, store up, but the caller isn't a member (the ADR-0043 wall).
//   • APP            — resolved, store up, caller is a member: render the studio.
//
// The store-down arc (ASLEEP → STARTING → TAKING-LONGER → SERVER-LOST) reads StoreBanner's
// existing health-poll `Phase` rather than reinventing a poller — App lifts the phase up via a
// callback and feeds it here. `elapsedMs` is time since the phase entered `starting`, used only
// for the TAKING-LONGER threshold; it is irrelevant in every other state.

import type { MeInfo } from '../types';
import type { StorePhase } from '../components/StoreBanner';

/**
 * How long the live store may sit in `starting` before the UI says "this is taking longer than
 * usual" — honestly, instead of implying it's about to succeed. The wake itself usually completes
 * in ~1 minute (StoreBanner's "usually about a minute" copy), so a sensible past-expectation
 * threshold is well beyond that: ~2.5 minutes. Below this the copy stays "~a minute"; at or past
 * it the copy admits the overrun while still saying it should come up.
 */
export const TAKING_LONGER_MS = 150_000; // 2.5 minutes

/** The screen the studio shows, derived from the raw load/store-health inputs. */
export type LoadState =
  | { kind: 'checking' }
  | { kind: 'asleep'; canWake: boolean }
  | { kind: 'store-fault' }
  | { kind: 'starting' }
  | { kind: 'taking-longer' }
  | { kind: 'server-lost' }
  | { kind: 'error'; message: string }
  | { kind: 'request-access'; email: string | null }
  | { kind: 'app' };

/** The phases in which /api/health independently CONFIRMS the DB is reachable. */
const DB_REACHABLE_PHASES: ReadonlySet<StorePhase> = new Set<StorePhase>(['healthy', 'stale-code']);

/**
 * Derive the honest load screen.
 *
 * @param meStatus  the membership-resolution status (App's `meStatus`).
 * @param me        the resolved MeInfo, or null while it hasn't resolved.
 * @param phase     StoreBanner's health-poll phase (lifted up); `'unknown'` until the first probe.
 * @param elapsedMs ms since the store-down arc entered `starting` (0 otherwise). Only the
 *                  STARTING vs TAKING-LONGER split reads it.
 */
export function deriveLoadState(
  meStatus: 'loading' | 'ready' | 'error',
  me: MeInfo | null,
  phase: StorePhase,
  elapsedMs: number,
): LoadState {
  // A genuine fault resolving membership (network / abort / a non-200) is the path the owner most
  // wants distinguishable from a sleeping DB — show it explicitly, never a blank screen or spinner.
  if (meStatus === 'error') {
    // …unless the health poll has independently confirmed the studio server itself is gone, in
    // which case "the server is unreachable" is the more honest, specific message.
    if (phase === 'server-lost') return { kind: 'server-lost' };
    return { kind: 'error', message: '' };
  }

  // While membership is still resolving. This is BOUNDED — api.me carries a 10s abort, so meStatus
  // always leaves 'loading' for 'ready' or 'error'; CHECKING can never be a permanent spinner.
  if (meStatus === 'loading' || me === null) return { kind: 'checking' };

  // From here membership RESOLVED (meStatus === 'ready', me present). The server degrades a store
  // outage to a 200 carrying storeUnreachable (never a 500), so we own the recovery UX here.
  if (me.storeUnreachable === true) {
    // The store-down arc, driven by StoreBanner's health poll. A wake (or an instance already
    // booting) shows live STARTING progress; well past the ~1-minute expectation we say so.
    if (phase === 'starting') {
      return elapsedMs >= TAKING_LONGER_MS ? { kind: 'taking-longer' } : { kind: 'starting' };
    }
    if (phase === 'server-lost') return { kind: 'server-lost' };
    // Two INDEPENDENT signals (the owner's "tell if there IS an issue" case): membership couldn't
    // resolve (storeUnreachable) but /api/health says the DB IS reachable. They disagree, so this
    // is a FAULT, not a sleep — say so honestly rather than offering to wake a running DB.
    if (DB_REACHABLE_PHASES.has(phase)) return { kind: 'store-fault' };
    // Otherwise the DB really is unreachable: it's asleep. Offer wake (admins) / wait (members).
    return { kind: 'asleep', canWake: me.canWakeDb === true };
  }

  // Store up, membership resolved: member → the app, non-member → the request-access wall.
  if (me.member === true) return { kind: 'app' };
  return { kind: 'request-access', email: me.email };
}
