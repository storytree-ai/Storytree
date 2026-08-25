// mapCurrency — the forest's CURRENCY reading (ADR-0445 D3/D4/D5, `map-currency-signal`).
//
// ── THE QUESTION IS THE WHOLE DESIGN ──────────────────────────────────────────────────────────
//
// This answers "is what I am seeing current?" — NOT "is the database up?". The distinction is not
// a refinement, it is the entire reason the module exists, and it was paid for on 2026-08-25:
//
//   The forest map JOINS two sources on different clocks. The PROOF — signed verdicts — comes live
//   from Postgres and is always current. The QUESTION — which stories and capabilities exist, and
//   each criterion's exact `revision-id` — is read by `readTree(storiesDir)` from `stories/**` on
//   the APP'S OWN DISK, frozen at the commit the app was built from. Verdicts bind to criteria by
//   `criterionId` + `revisionId` (ADR-0253), so an app at an older commit reads the database
//   PERFECTLY, finds verdicts stamped with a revision it has never heard of, and correctly
//   concludes nothing has proven the criterion it is holding — and paints yellow. It asked an
//   outdated question and got an honest answer.
//
//   `agent` is the worked example: its criterion was authored 2026-08-03 at
//   `uatr1:b7b5052c7e21a3a2`, re-worded 2026-08-12 to `uatr1:380a683e4995990d`, and signed
//   2026-08-22/23 against the NEW revision. An app built between those dates paints it yellow
//   forever until rebuilt. Criteria declared on `main` went 261 (08-05) → 113 (08-24), so a
//   month-old app enforces ~148 obligations that no longer exist. The staler the client, the
//   yellower the map.
//
// A CONNECTIVITY LIGHT WOULD HAVE SHOWN GREEN THROUGH ALL OF THAT. The connection was perfect the
// entire time. That is why {@link mapCurrency} takes no `db`/`store` reachability input at all:
// there is no field here a connectivity reading could be threaded through, so the narrower question
// cannot creep back in as an "input we already have".
//
// ── THE THREE STATES (ADR-0445 D3) ───────────────────────────────────────────────────────────
//
//   green — live data AND current code.
//   amber — serving cache, OR the app is behind `main`. Either way THIS VIEW MAY UNDER-CLAIM.
//   red   — no data at all.
//
// Losing the database drops to AMBER, not red: a lost store leaves the last-known payload painted
// from the runtime cache (ADR-0240), which is data — just not confirmed data. The owner's original
// connectivity reading is therefore CONTAINED within this one rather than replaced by it.
//
// ── AMBER NAMES WHICH CAUSE, BECAUSE THE REMEDIES DIFFER (ADR-0445 D4) ────────────────────────
//
// "Serving cache" resolves by reconnecting or waiting. "Behind main" resolves only by
// rebuild-and-relaunch. One undifferentiated amber sends the developer to the wrong fix, so every
// cause carries its OWN remedy — a field, not a comment, so a cause cannot be added without
// answering what to do about it. The remedy is what the hover carries; it is deliberately NOT an
// explanation of caching, because the audience is developers who can assume the rest.
//
// ── AMBER DISCLOSES AND NEVER BLOCKS (ADR-0445 D5) ────────────────────────────────────────────
//
// This module returns a READING. It has no field that can withhold, gate, or re-paint anything, and
// nothing downstream may use it to do so. The world already under-claims when proof is absent
// (ADR-0040); amber says that absence MAY be an artifact of staleness — it never says a green is
// suspect, because green still derives from a signed verdict and cannot over-claim.
//
// Pure: no React, no `fetch`, no clock. Every input is a fact the caller already holds.

/**
 * The three states, in ADR-0445 D3's own vocabulary. The decision states them as colours, so the
 * type does too — a reader can check this file against the decision with no translation step. The
 * plain-language word each wears on screen is the RENDER's business ({@link MapCurrencyLamp}).
 */
export type MapCurrencyState = 'green' | 'amber' | 'red';

/** The distinct reasons a view may be under-claiming. Every one has a DIFFERENT remedy (D4). */
export type MapCurrencyCauseId = 'serving-cache' | 'app-behind-main' | 'server-code-moved';

/**
 * One amber cause. `remedy` is required rather than optional precisely because D4 is about the
 * remedies differing: a cause added without one would reproduce the undifferentiated amber the
 * decision refuses.
 */
export interface MapCurrencyCause {
  id: MapCurrencyCauseId;
  /** What is off, in the developer's language. */
  what: string;
  /** What to DO about it — the half that differs between causes (ADR-0445 D4). */
  remedy: string;
}

/**
 * How current the CODE half of the join is, as `/api/health` already reports it. Both fields are
 * already on the wire and already consumed by `StoreBanner`; this reading re-frames them rather
 * than adding a probe.
 */
export interface CodeCurrency {
  /**
   * `health.code.stale` — the checkout MOVED under the running server, so it is serving an older
   * bundle and an older roll-up rule than the commit on disk. Remedied by restarting the server.
   */
  serverCodeMoved: boolean;
  /**
   * `health.runtime.behind` for a PINNED runtime — how many commits the installed app's own
   * worktree is behind `origin/main`. This is the field that measures the 2026-08-25 incident
   * directly: the app's `stories/**` is that many commits old, so its criteria revisions are too.
   * Zero for a dev-fallback checkout and for the hosted studio, which send no `runtime.behind`.
   */
  behindMain: number;
}

export interface MapCurrencyInputs {
  /** Whether anything at all is painted — from cache or from a resolved read. */
  painted: boolean;
  /**
   * The paint came from the runtime cache and has NOT been confirmed by a resolved `/api/tree`
   * (ADR-0240 D3's provisional mark). Cached paint is never cached truth.
   */
  provisional: boolean;
  /** A tree read failed with nothing painted — the cold-failure path. */
  loadFailed: boolean;
  /**
   * The code-currency facts, or `null` when `/api/health` has not answered yet. `null` is NOT
   * "current": it is "not asked", and the two must never collapse — claiming green off an
   * unanswered probe is a green that verified nothing.
   */
  code: CodeCurrency | null;
}

export interface MapCurrencyReading {
  state: MapCurrencyState;
  /** Empty for green and for red; one entry per distinct amber cause. */
  causes: MapCurrencyCause[];
}

/** Reused so the cache cause reads identically wherever it is produced. */
const SERVING_CACHE: MapCurrencyCause = {
  id: 'serving-cache',
  what: 'painted from the last visit’s cached payload — not confirmed against the store',
  remedy: 'Reconnect, or wait for the next read to land.',
};

function behindMainCause(commits: number): MapCurrencyCause {
  return {
    id: 'app-behind-main',
    what: `this app is ${commits} commit${commits === 1 ? '' : 's'} behind main, so it is asking about criteria that have since moved`,
    remedy: 'Rebuild and relaunch to update.',
  };
}

const SERVER_CODE_MOVED: MapCurrencyCause = {
  id: 'server-code-moved',
  what: 'the checkout moved under the running server, so the roll-up rule is from an older commit',
  remedy: 'Restart the server: pnpm studio:down · pnpm studio:up.',
};

/**
 * The reading, or `null` when there is not yet one to give.
 *
 * `null` is a first-class answer and not a degenerate green. Two situations produce it, and in both
 * the honest thing is to render NO lamp rather than flash a state:
 *   - nothing is painted and no read has failed — the boot is still in flight;
 *   - the map is painted and nothing is wrong with the DATA, but `/api/health` has not answered, so
 *     the CODE half is simply unknown. Green would be a claim made without looking.
 *
 * The order below is deliberate. Causes are collected BEFORE the unanswered-health check, so a
 * cached paint still ambers while health is silent — losing the server must not silence the very
 * signal that says the view may be stale.
 */
export function mapCurrency(input: MapCurrencyInputs): MapCurrencyReading | null {
  if (!input.painted) {
    return input.loadFailed ? { state: 'red', causes: [] } : null;
  }

  const causes: MapCurrencyCause[] = [];
  if (input.provisional) causes.push(SERVING_CACHE);
  if (input.code?.serverCodeMoved === true) causes.push(SERVER_CODE_MOVED);
  const behind = input.code?.behindMain ?? 0;
  if (behind > 0) causes.push(behindMainCause(behind));

  if (causes.length > 0) return { state: 'amber', causes };
  if (input.code === null) return null;
  return { state: 'green', causes: [] };
}
