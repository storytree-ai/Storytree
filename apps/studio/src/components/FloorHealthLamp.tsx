/**
 * THE FACTORY-FLOOR LAMP (ADR-0349, amending ADR-0314 D7) — a small andon lamp pinned to the map,
 * quiet when the floor is fine and lit when a shared bottleneck recurs.
 *
 * ── WHY IT IS A LAMP ON THE MAP AND NO LONGER A BAND IN THE DRAWER ────────────────────────────
 *
 * ADR-0314 D7 asked for a reading that reaches the owner *"without the owner going looking"*, and
 * placed it as a persistent band above the arc lanes. The placement did not deliver the ask, and the
 * failure was structural rather than cosmetic: the band lived INSIDE the arcs lens, which renders
 * only under `?overlay=arcs` — one of three drawer states, and not the default. A reading you must
 * open a drawer to see is one you have to go looking for.
 *
 * It also mis-titled the surface it sat on. With no heading of its own on `ArcSurface`, the band's
 * `factory floor` label was the topmost text in the lens and read as the name of the whole surface —
 * which over-claimed the band (it answers *is the floor healthy*, a strictly narrower question than
 * *where is every initiative up to*) and left the arc surface anonymous. ADR-0349 splits the two:
 * the surface names itself, and the reading moves out here.
 *
 * THE MAP IS THE RIGHT HOME BECAUSE THE MAP IS THE FLOOR. The world view already draws the factory —
 * stories as trees, sessions as wisps, claims as lit territory. A lamp over that scene is the
 * reading in its own context, and it is visible whenever the floor is.
 *
 * ── WHAT IT COSTS, AND WHY THE CADENCE MOVED WITH IT ──────────────────────────────────────────
 *
 * Widening WHEN the reading is visible widens when it is FETCHED, and this read is not cheap: each
 * call scans the whole friction tier and the whole library event log. The compensation is in
 * `lib/floorHealth.ts` — the success cadence went from 5 minutes to 30, which is honest rather than
 * merely convenient, because the figure moves on a DAILY grain (a route lands, or a filing is
 * reinforced). A 30-minute worst-case latency on a daily-grain signal costs the owner nothing, and
 * the wider window then costs the shared store less per hour than the old narrow one did.
 *
 * ── THE UNIT IS THE DISTINCT BOTTLENECK, NEVER FILING VOLUME (carried forward, unchanged) ──────
 *
 * ADR-0314 D7 and ADR-0316 D3 state the same rule and it is fenced STRUCTURALLY, not by comment:
 * {@link FloorHealthSignal} has no field that can carry a count of filings, sessions, or reports.
 * The only number it accepts is `recurrences` — how many times ONE distinct cause came back AFTER it
 * was routed — and it must arrive alongside the window it was measured over (ADR-0316 D2) and the
 * collapsing rule that produced the distinctness (ADR-0316 D3: *"a distinctness count whose rule is
 * hidden is just a different unaudited number"*). A hundred reports of one bottleneck must never
 * score like a hundred reports of a hundred; that error closed a whole arc
 * (`factory-self-load-tune-the-guidance-loop-back-to-evidence-arc`, whose two closing metrics both
 * counted filings).
 *
 * READ-ONLY (ADR-0267 D6 / ADR-0314 D9). The lamp reports; it offers no affordance to discharge,
 * route, or acknowledge anything — ADR-0316 D4 keeps adjudication with the graduation-synthesist,
 * and a lamp with a "dismiss" button would be adjudicating. Its links are READS: the same
 * click-through into the Library artifact the briefing panel makes (ADR-0314 D3).
 */

import { useState } from 'react';
import { assetHref } from '../lib/route';

/**
 * One DISTINCT bottleneck on the floor — a cause, not a filing. `recurrences` counts how many times
 * it came back AFTER it was routed, which is the only half that is a signal: evidence gathered
 * BEFORE routing is not recurrence.
 */
export interface FloorBottleneck {
  /** Stable id for the collapsed cause — used as the render key, never shown as a number. */
  id: string;
  /** The cause in the owner's language — what keeps going wrong. */
  cause: string;
  /** Recurrences SINCE the cause was routed. Zero is meaningful: routed, and quiet since. */
  recurrences: number;
}

/**
 * The instrument's output, when there is one. Every figure arrives with its provenance attached,
 * because ADR-0316 D2 makes a figure without its window and sample non-reportable and D3 makes a
 * distinctness count without its collapsing rule unauditable.
 *
 * There is deliberately no `filings`, `reports`, `sessions` or `total` field. Adding one is the
 * error both ADRs name, and it should require editing this interface and answering for it.
 */
export interface FloorHealthSignal {
  /** The distinct recurring causes. Empty ⇒ the floor is quiet, which is a real reading. */
  bottlenecks: FloorBottleneck[];
  /** The window + sample every figure here was computed over (ADR-0316 D2). */
  window: string;
  /** The rule by which filings were collapsed into distinct causes (ADR-0316 D3). */
  collapsingRule: string;
}

/**
 * Nothing has answered yet. Its own arm rather than a null, because "still reading" and "there is no
 * reading" are different facts and a lamp that blurred them would tell the owner to wait for
 * something that may not be coming — the spinner-that-never-resolves defect #1192 fixed on the arcs
 * lens next door.
 */
export interface FloorHealthPending {
  pending: true;
}

/**
 * NO FIGURE, and the condition that stopped it — ADR-0316 D2's refusal, carried through to the lamp.
 *
 * The instrument's own rule is that where a window cannot support a figure it names the condition
 * that failed instead of printing a number that reads as progress. The lamp owes that rule the same
 * honesty on its side: a decline renders as a DECLINE, never as `quiet`. Falling back to quiet would
 * report "the floor is fine" on the strength of not having looked, which is the one reading this
 * lamp must never produce. It is why the declined lamp is drawn UNLIT AND HATCHED rather than merely
 * dim — the desktop mirror exists precisely to keep `declined` distinguishable from `quiet`
 * (`stories/desktop/mirrored-route-conformance.md`), and a relocation that collapsed the two
 * visually would defeat that pair.
 */
export interface FloorHealthDecline {
  /** Why there is no figure, in the owner's language. */
  declined: string;
}

/** What the lamp may be handed. Every arm is a different fact; only one of them is a reading. */
export type FloorHealthBand = FloorHealthSignal | FloorHealthPending | FloorHealthDecline;

/**
 * THE THRESHOLD — how many post-route recurrences on ONE distinct cause light the lamp.
 *
 * This is the call ADR-0314 D7 left open ("a shared bottleneck recurs", no number) and ADR-0316 D4
 * deliberately kept out of the instrument. Settled at 2, on this reasoning:
 *
 *   ≥1 IS NOT A THRESHOLD. Measured against the live board on 2026-08-08, the loudest live cause
 *   carried exactly ONE post-route recurrence — so a lamp that lights at one is lit on its first
 *   day and permanently after, and a lamp that is always lit is furniture. The owner's ask was
 *   *"when this stuff needs my attention we can make it very visible"*; always-on is the failure of
 *   that ask, not a cautious version of it.
 *
 *   ONE RECURRENCE CAN BE LAG, TWO CANNOT. The instrument already excludes same-day reinforcements
 *   (their ordering is unprovable from a day-granular date), but a single recurrence the week after
 *   guidance lands is still consistent with a session that was already in flight when it landed. Two
 *   says the remedy did not take.
 *
 *   IT DISCRIMINATES ON THE REAL RECORD. The floor's one genuine "the remedy did not take" story —
 *   `sdk-leaf-drops-contract-id-test-names`, ×8 after its guardrail route — clears this bar by a
 *   mile, while today's ×1 background does not. That is the discrimination the lamp is for.
 *
 * It is a constant, not a decision cast in code — and the lamp now DRAWS it: the pip row renders one
 * pip per required recurrence and fills them as the count climbs, so the bar a quiet floor did not
 * clear is visible on the surface itself rather than only in this file. Retune it here, in one
 * place, and say so on the arc.
 */
export const LOUD_AT_RECURRENCES = 2;

export interface FloorHealthLampProps {
  /**
   * What the lamp is reading: the instrument's signal, a pending read, or a stated decline.
   * `null`/absent means no reading is wired into this view at all — never synthesise one from filing
   * counts to fill the gap, and never let an absence render as a quiet floor.
   */
  signal?: FloorHealthBand | null;
}

const isDecline = (band: FloorHealthBand): band is FloorHealthDecline => 'declined' in band;
const isPending = (band: FloorHealthBand): band is FloorHealthPending => 'pending' in band;

/** The five states, each a different fact. `unwired` is the absence of a reading, not a calm one. */
export type FloorLampState = 'unwired' | 'reading' | 'declined' | 'quiet' | 'loud';

/** Which state a band reads as. Pure and exported so the mapping is assertable without a render. */
export function floorLampState(band: FloorHealthBand | null): FloorLampState {
  if (band === null) return 'unwired';
  if (isPending(band)) return 'reading';
  if (isDecline(band)) return 'declined';
  return band.bottlenecks.some((b) => b.recurrences >= LOUD_AT_RECURRENCES) ? 'loud' : 'quiet';
}

/** The one-word state the lamp says out loud, beside the glyph. */
const STATE_WORD: Readonly<Record<FloorLampState, string>> = {
  unwired: 'not wired',
  reading: 'reading…',
  declined: 'no reading',
  quiet: 'quiet',
  loud: 'recurring',
};

/**
 * The andon glyph — a signal lamp, which is what a factory floor actually uses to say the line is in
 * trouble. The housing is constant; only the bulb and the rays change with state, so the shape reads
 * as ONE instrument in five conditions rather than five different icons.
 */
function LampGlyph({ state }: { state: FloorLampState }): React.JSX.Element {
  return (
    <svg
      className="floor-lamp-glyph"
      viewBox="0 0 20 20"
      width="17"
      height="17"
      aria-hidden="true"
      focusable="false"
    >
      {/* the shade — always drawn, so the instrument is recognisable even unlit */}
      <path className="floor-lamp-shade" d="M3.6 7.4 L10 1.8 L16.4 7.4 Z" />
      {/* the bulb — the state carrier */}
      <circle className="floor-lamp-bulb" cx="10" cy="12.2" r="4" />
      {/* rays, drawn only when the lamp is lit (CSS hides them otherwise) */}
      <g className="floor-lamp-rays">
        <path d="M3.4 12.2 H1.2" />
        <path d="M16.6 12.2 H18.8" />
        <path d="M5.5 16.5 L4 18" />
        <path d="M14.5 16.5 L16 18" />
      </g>
    </svg>
  );
}

/**
 * The pip row — {@link LOUD_AT_RECURRENCES} pips, filled by how far the loudest cause has climbed.
 *
 * This is what makes the threshold auditable from the surface rather than only from this file. A
 * quiet floor showing one filled pip of two says, without a sentence, *"something recurred once and
 * that is below the bar"* — so an owner who thinks one recurrence deserves shouting can see exactly
 * what was withheld. Recurrences past the threshold add no pips (the row would grow without bound);
 * the count is carried in the text and the detail panel instead.
 */
function PipRow({ recurrences }: { recurrences: number }): React.JSX.Element {
  return (
    <span className="floor-lamp-pips" aria-hidden="true">
      {Array.from({ length: LOUD_AT_RECURRENCES }, (_, i) => (
        <span key={i} className={`floor-lamp-pip${i < recurrences ? ' on' : ''}`} />
      ))}
    </span>
  );
}

/**
 * The lamp. A compact always-visible instrument over the map, with the detail one click away rather
 * than always on screen — the band it replaces had to ellipsise a ~450-word collapsing rule onto one
 * line to avoid pushing the lanes down, which is the shape of a reading that does not fit where it
 * was put. Here the rule is carried IN FULL in the expandable panel and in the accessible name, and
 * the resting state is a glyph, two pips and one word.
 *
 * Each state carries a stable `data-lamp-state` marker so the reading is assertable without
 * depending on its wording.
 */
export function FloorHealthLamp({ signal }: FloorHealthLampProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const band = signal ?? null;
  const state = floorLampState(band);
  const reading = band !== null && !isDecline(band) && !isPending(band) ? band : null;
  // The loudest cause drives the pips whether or not it clears the bar — a quiet floor with one
  // recurrence must still show the one, or the withheld figure is invisible again.
  const loudest = reading?.bottlenecks.reduce<FloorBottleneck | null>(
    (best, b) => (best === null || b.recurrences > best.recurrences ? b : best),
    null,
  );
  const lit = reading?.bottlenecks.filter((b) => b.recurrences >= LOUD_AT_RECURRENCES) ?? [];
  const detail = band !== null && (reading !== null || isDecline(band));

  return (
    <div className="floor-lamp-dock" data-testid="floor-lamp-dock">
      <div className={`floor-lamp floor-lamp-${state}`} data-lamp-state={state}>
        <button
          type="button"
          className="floor-lamp-face"
          data-testid="floor-lamp"
          aria-expanded={detail ? open : undefined}
          aria-label={`factory floor — ${STATE_WORD[state]}`}
          // Not an affordance to ACT on the reading (ADR-0316 D4) — it opens the reading's own
          // provenance, which is a read. With nothing to show it stays inert rather than opening an
          // empty panel.
          onClick={() => detail && setOpen((v) => !v)}
        >
          <LampGlyph state={state} />
          <span className="floor-lamp-text">
            <span className="floor-lamp-label">factory floor</span>
            <span className="floor-lamp-state">
              {STATE_WORD[state]}
              {state === 'loud' && lit.length > 1 ? ` ×${lit.length}` : ''}
            </span>
          </span>
          {reading !== null && <PipRow recurrences={loudest?.recurrences ?? 0} />}
        </button>
      </div>

      {open && detail && (
        <div className="floor-lamp-detail" data-testid="floor-lamp-detail" role="group" aria-label="floor reading">
          {band !== null && isDecline(band) ? (
            /* ADR-0316 D2, carried to the lamp: name the condition that failed. Anything that reads
               as "all clear" here would be reporting the floor healthy on the strength of not having
               looked. */
            <p className="floor-lamp-declined" data-testid="floor-lamp-declined">
              No reading — {band.declined}
            </p>
          ) : reading !== null ? (
            <>
              {reading.bottlenecks.length === 0 ? (
                <p className="floor-lamp-none">No distinct bottleneck is recurring.</p>
              ) : (
                <ul className="floor-lamp-causes" aria-label="recurring bottlenecks">
                  {reading.bottlenecks.map((b) => (
                    <li key={b.id} className="floor-lamp-cause-row" data-below={b.recurrences < LOUD_AT_RECURRENCES ? '' : undefined}>
                      {/* A read, not an affordance: the same click-through into the Library artifact
                          the briefing panel makes (ADR-0314 D3). */}
                      <a className="floor-lamp-cause" href={assetHref(b.id)}>
                        {b.cause}
                      </a>
                      <span className="floor-lamp-recurrences">
                        {b.recurrences === 1 ? 'recurred once' : `recurred ${b.recurrences}×`} since routed
                        {b.recurrences < LOUD_AT_RECURRENCES ? ` · below ${LOUD_AT_RECURRENCES}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {/* ADR-0316 D2/D3: the window and the collapsing rule travel WITH the figure — a
                  distinctness count whose rule is hidden is just a different unaudited number. The
                  band this replaces had to ellipsise the rule onto one line; here it has room to be
                  read in full, which is what D3 actually asks for. */}
              <p className="floor-lamp-window">{reading.window}</p>
              <p className="floor-lamp-rule">collapsed by: {reading.collapsingRule}</p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
