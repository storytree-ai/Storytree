// The context-window METER's arithmetic (`linked-session-context-arc`, increment
// `make-the-single-window-meter-useful`, ADR-0452 D1/D2) — pure, browser-safe, and the whole of what
// the widget decides. The component draws what this returns and derives nothing of its own.
//
// WHAT THIS MEASURES, AND WHY IT IS NOT THE REPLAY PANEL'S BAR. `lib/traversalOccupancy.ts` answers
// "how did one trace's window move while it ran" — a series read at a playhead, for a trace picked
// out of a rail. This answers the different question ADR-0411 made load-bearing: "how full is a
// window, against the two marks that decide whether it takes on more work". Same quantity
// (`residentInputTokens`, ADR-0248 D1 — the reading that can FALL, never the monotonic billing
// total), different question, so the shape is different: no playhead, no picker, one reading per
// window and every window on one shared track.
//
// ★ THE MARKS ARE ADR-0411 D3'S, NOT THIS FILE'S. The SOFT mark (~400K) is "take on no NEW
// increment — finish what you hold, then hand over". The HARD mark (500K) is "land what is green,
// write the handover, let a fresh session continue". They are decision boundaries an owner set, and
// showing them is what turns a token count into something worth glancing at. Measured on this
// machine 2026-08-26: of 125 session windows, 37 crossed the soft mark and 15 crossed the hard one —
// so they are lines real work reaches, not decoration.
//
// ★★ THE MARKS ARE DRAWN AS COLOUR, NEVER AS A MARKER, TICK, OR ARC. That is the signed grammar of
// `docs/design/context-traversal/README.md` (§"Revision 2026-07-27", clause 3), which removed the
// threshold marker from the occupancy bar and shows overflow by COLOURING the over-threshold portion
// instead — the owner's stated reason being that at 200k a 500k marker had no meaning. This widget
// keeps that rule exactly and extends it to the second mark: three coloured segments, nothing drawn
// at the boundaries themselves. A future session reaching for a tick here is reaching for something
// already decided against.
//
// ★★★ NO HELPER WINDOW'S TOKENS EVER ENTER THESE FIGURES (ADR-0413 D2, permanent, restated by
// ADR-0452 D4). Helpers get their own readings on their own tracks. There is no function here that
// adds two windows together, and adding one would draw a fullness level no real window reached.

import { formatTokens } from './traversalOccupancy';

export { formatTokens };

/**
 * ADR-0411 D3's SOFT mark: past this, take on no NEW increment — finish what you hold, hand over.
 * `~400K` in the decision's own words; the tilde is about when to CHECK (at an increment boundary,
 * D5), not about the number being approximate.
 */
export const SOFT_MARK_TOKENS = 400_000;

/** ADR-0411 D3's HARD mark: land what is green, write the handover, let a fresh session continue. */
export const HARD_MARK_TOKENS = 500_000;

/**
 * The track's base ceiling.
 *
 * Deliberately ABOVE the hard mark rather than equal to it: at a ceiling of exactly 500K a window
 * that reached the hard mark fills the whole track, so "at the limit" and "past it" would draw
 * identically — and past-the-limit is the state the mark exists to make visible. At 600K the hard
 * mark sits at 83% with headroom left to see.
 */
export const BASE_SCALE_TOKENS = 600_000;

/** Ceiling growth granularity, so a series peaking above the base still gets a stable track. */
const SCALE_STEP_TOKENS = 100_000;

/** Which of ADR-0411 D3's bands a reading falls in. `calm` is below both marks. */
export type ContextBand = 'calm' | 'soft' | 'hard';

export function bandOf(residentTokens: number): ContextBand {
  if (residentTokens >= HARD_MARK_TOKENS) return 'hard';
  if (residentTokens >= SOFT_MARK_TOKENS) return 'soft';
  return 'calm';
}

/**
 * ONE ceiling for every meter the widget draws, chosen from the fullest reading among them.
 *
 * Per-window scales would be the obvious alternative and are the wrong answer: two bars drawn at
 * different scales cannot be compared by eye, and comparing them is most of why more than one is
 * shown. The cost is accepted and real — a single very full window shrinks every other meter — and
 * it is the honest direction to err, because it never makes a window look fuller than it was.
 */
export function sharedScaleTokens(readings: readonly number[]): number {
  const peak = readings.reduce((max, value) => Math.max(max, value), 0);
  if (peak <= BASE_SCALE_TOKENS) return BASE_SCALE_TOKENS;
  return Math.ceil(peak / SCALE_STEP_TOKENS) * SCALE_STEP_TOKENS;
}

/** The three coloured portions of one reading, as fractions of the track. They sum to the fill. */
export interface MeterSegments {
  /** Below the soft mark. */
  readonly calmFraction: number;
  /** Between the soft and hard marks. `0` below the soft mark. */
  readonly softFraction: number;
  /** Past the hard mark. `0` at or below it. */
  readonly hardFraction: number;
  /** Where the soft segment would begin — the component's offset, never a drawn marker. */
  readonly softStartFraction: number;
  /** Where the hard segment would begin — likewise an offset, never a drawn marker. */
  readonly hardStartFraction: number;
}

/**
 * Split one reading into its three coloured portions.
 *
 * The splits are at EXACTLY the marks: a reading of exactly 400,000 has no soft portion, and one of
 * exactly 500,000 has no hard portion — only the excess ABOVE a mark is ever coloured for it. A
 * reading above the ceiling is clamped to it, which cannot happen when the scale came from
 * {@link sharedScaleTokens} over the same readings, and is defended anyway because a caller passing
 * a stale scale must not draw a bar wider than its track.
 */
export function meterSegments(residentTokens: number, scaleTokens: number): MeterSegments {
  const scale = scaleTokens > 0 ? scaleTokens : BASE_SCALE_TOKENS;
  const clamped = Math.max(0, Math.min(residentTokens, scale));
  const calm = Math.min(clamped, SOFT_MARK_TOKENS);
  const soft = Math.max(0, Math.min(clamped, HARD_MARK_TOKENS) - SOFT_MARK_TOKENS);
  const hard = Math.max(0, clamped - HARD_MARK_TOKENS);
  return {
    calmFraction: calm / scale,
    softFraction: soft / scale,
    hardFraction: hard / scale,
    softStartFraction: Math.min(1, SOFT_MARK_TOKENS / scale),
    hardStartFraction: Math.min(1, HARD_MARK_TOKENS / scale),
  };
}

/**
 * The plain-language consequence of a reading — ADR-0411 D3's own instruction, not a paraphrase.
 *
 * This is the sentence that makes the number worth glancing at: a bar alone says how full, and a
 * session's actual question is what to do about it.
 */
export function bandGuidance(band: ContextBand): string {
  switch (band) {
    case 'hard':
      return 'past the hard mark — land what is green, write the handover, let a fresh session continue';
    case 'soft':
      return 'past the soft mark — take on no new increment; finish what is held, then hand over';
    default:
      return 'below both marks — room for another increment';
  }
}

/** "4m", "3h", "2d" — how long ago, at the coarsest unit that is still true. */
export function ageLabel(iso: string | null, nowMs: number): string {
  if (iso === null) return 'undated';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'undated';
  const minutes = Math.max(0, Math.round((nowMs - at) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
