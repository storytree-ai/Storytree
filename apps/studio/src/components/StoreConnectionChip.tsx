/**
 * THE DATABASE-CONNECTION LIGHT (`store-connection-signal`) — a dot, a label and two words, docked
 * above the legend at the top-left of the map.
 *
 * ── IT IS DELIBERATELY INERT ──────────────────────────────────────────────────────────────────
 *
 * No button, no hover text, no click panel. The owner's instruction was that it should not need an
 * explanation, and that is a design constraint rather than a corner cut: a two-word reading that
 * needs explaining is the wrong two words. If a future state cannot be said in two words, change
 * the state, not this component.
 *
 * The one thing it must never grow is an affordance. Dismiss, retry, hide, "wake the database" —
 * all of those already live on the store banner, which owns the recovery UX and its `/api/health`
 * poller. This is a readout of that same poller's phase and nothing more; a second control here
 * would be a second, competing recovery path over one signal.
 *
 * ── NO READING, NO CHIP ───────────────────────────────────────────────────────────────────────
 *
 * A `null` reading renders nothing, exactly as `StoreBanner` renders nothing on its `unknown`
 * phase. That covers the two cases that are not readings at all: the first probe has not answered,
 * and the offline JSON store where there is no database to report on.
 */

import type { StoreConnectionReading } from '../lib/storeConnection';

export function StoreConnectionChip({
  reading,
}: {
  /** The reading, or `null` when there is not one — which renders nothing, never a fourth state. */
  reading: StoreConnectionReading | null;
}): React.JSX.Element | null {
  if (reading === null) return null;
  return (
    <div
      className={`store-connection store-connection-${reading.state}`}
      data-testid="store-connection"
      data-connection-state={reading.state}
      role="status"
    >
      <span className="store-connection-dot" aria-hidden="true" />
      <span className="store-connection-label">database</span>
      <span className="store-connection-word">{reading.word}</span>
    </div>
  );
}
