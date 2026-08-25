/**
 * THE FOREST'S CURRENCY SIGNAL (ADR-0445 D3/D4/D5) — a three-state indicator answering
 * "is what I am seeing current?".
 *
 * ── WHY IT IS NOT A CONNECTIVITY LIGHT ────────────────────────────────────────────────────────
 *
 * The owner's first proposal for this was a red/amber/green light for database connectivity. That
 * exact light would have shown GREEN throughout the 2026-08-25 incident it exists to catch: the
 * connection was perfect the whole time, and the map was wrong because the app's disk and the
 * database sat at different commits (`lib/mapCurrency.ts`'s header carries the mechanism). The
 * question was widened; the owner's constraints were kept — three states, and no explanation of
 * caching to an audience of developers.
 *
 * ── WHAT EACH STATE MEANS ─────────────────────────────────────────────────────────────────────
 *
 *   green — live data AND current code.
 *   amber — serving cache, OR the app is behind `main`. Either way THIS VIEW MAY UNDER-CLAIM.
 *   red   — no data at all.
 *
 * AMBER NAMES WHICH CAUSE (D4), because the remedies differ and one undifferentiated amber sends
 * the developer to the wrong fix. The cause and its remedy ride the hover (`title`) so the reading
 * is one pointer-rest away, and the same pair is in the expandable detail for keyboard and for
 * reading at leisure. What the hover carries is the REMEDY, never a lecture about caching.
 *
 * ── IT DISCLOSES; IT NEVER BLOCKS (D5) ────────────────────────────────────────────────────────
 *
 * There is no affordance here to gate, withhold, dismiss or re-paint anything, and there must never
 * be one. The world already under-claims when proof is absent (ADR-0040); amber says that absence
 * MAY be an artifact of staleness. It never says a green is suspect — green still derives from a
 * signed verdict and cannot over-claim, so a rendering that blurred those two would be wrong in the
 * one direction this signal exists to prevent.
 *
 * ── NO READING, NO LAMP ───────────────────────────────────────────────────────────────────────
 *
 * A `null` reading renders NOTHING, exactly as `StoreBanner` renders nothing on its `unknown`
 * phase. Both cases it covers are "not asked yet" rather than "fine" — a boot still in flight, or a
 * health probe that has not answered — and flashing a state through them would be inventing one.
 *
 * ── THE DOCK IS THE CALLER'S ──────────────────────────────────────────────────────────────────
 *
 * Unlike its neighbour `FloorHealthLamp`, this component carries no positioning of its own, because
 * it has TWO mounts: pinned over the map inside `.map-instrument-stack`, and in ordinary flow on
 * the map's "couldn't load the tree" screen — which is the only surface where the RED state is
 * reachable at all (nothing painted means there is no map to pin it over).
 */

import { useState } from 'react';
import type { MapCurrencyReading, MapCurrencyState } from '../lib/mapCurrency';

/** The one-word reading, in the owner's language rather than the colour's. */
const STATE_WORD = {
  green: 'current',
  amber: 'may be behind',
  red: 'no data',
} satisfies Readonly<Record<MapCurrencyState, string>>;

/**
 * What each state means in one sentence — the hover's opening line for green and red, and the
 * detail panel's heading for all three. Amber's causes are appended to it (D4).
 */
const STATE_SENTENCE = {
  green: 'Live data, and this app is on current code.',
  amber: 'This view may be under-claiming — what is missing may not be missing.',
  red: 'No data at all — nothing was read from the store and nothing was cached.',
} satisfies Readonly<Record<MapCurrencyState, string>>;

/**
 * The glyph — a signal disc whose fill is the state carrier, so the shape reads as ONE instrument
 * in three conditions rather than three icons. Deliberately not the andon lamp next door: they
 * answer different questions and must not be mistaken for each other.
 */
function CurrencyGlyph(): React.JSX.Element {
  return (
    <svg
      className="map-currency-glyph"
      viewBox="0 0 16 16"
      width="15"
      height="15"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="map-currency-ring" cx="8" cy="8" r="6.2" />
      <circle className="map-currency-core" cx="8" cy="8" r="3.2" />
    </svg>
  );
}

/**
 * The hover text: the state's sentence, then one `what — remedy` line per cause. Built as a plain
 * string so it lands in the native tooltip AND in the accessible description without a second
 * rendering path that could drift from the panel below.
 */
export function currencyHoverText(reading: MapCurrencyReading): string {
  const lines = [STATE_SENTENCE[reading.state]];
  for (const cause of reading.causes) lines.push(`${cause.what} — ${cause.remedy}`);
  return lines.join('\n');
}

export function MapCurrencyLamp({
  reading,
}: {
  /**
   * The reading, or `null` when there is not one yet. `null` renders nothing at all — never a
   * fourth visual state, and never a green stood in for an unasked question.
   */
  reading: MapCurrencyReading | null;
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (reading === null) return null;

  const word = STATE_WORD[reading.state];
  const hover = currencyHoverText(reading);

  return (
    <div className="map-currency-dock" data-testid="map-currency-dock">
      <div className={`map-currency map-currency-${reading.state}`} data-currency-state={reading.state}>
        <button
          type="button"
          className="map-currency-face"
          data-testid="map-currency"
          title={hover}
          aria-expanded={open}
          aria-label={`map — ${word}`}
          onClick={() => setOpen((v) => !v)}
        >
          <CurrencyGlyph />
          <span className="map-currency-text">
            <span className="map-currency-label">map</span>
            <span className="map-currency-state">{word}</span>
          </span>
        </button>
      </div>

      {open && (
        <div
          className="map-currency-detail"
          data-testid="map-currency-detail"
          role="group"
          aria-label="map currency"
        >
          <p className="map-currency-sentence">{STATE_SENTENCE[reading.state]}</p>
          {reading.causes.length > 0 && (
            <ul className="map-currency-causes" aria-label="why this view may be behind">
              {reading.causes.map((cause) => (
                <li key={cause.id} className="map-currency-cause-row" data-cause={cause.id}>
                  <span className="map-currency-cause">{cause.what}</span>
                  {/* The REMEDY, not an explanation — the two causes resolve differently and a
                      single undifferentiated amber sends the developer to the wrong fix (D4). */}
                  <span className="map-currency-remedy">{cause.remedy}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
