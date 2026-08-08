/**
 * The factory-floor health strip (ADR-0314 D7) — a persistent band across the top of the arc
 * drawer that stays quiet when the floor is fine and goes loud when a shared bottleneck recurs.
 *
 * Owner-directed 2026-08-04: *"when this stuff needs my attention we can make it very visible that
 * there is something wrong on the factory floor."* It is deliberately NOT an arc state — every
 * per-arc state answers *what is the state of THIS arc*, and none answers *is the floor healthy*.
 * The same bottleneck hit eight times in a week lights up no arc state at all. Persistent placement
 * is the point: it must reach the owner without the owner going looking.
 *
 * ── THE FIGURE IS WIRED (2026-08-08), AND THE BAND OWNS THE THRESHOLD ─────────────────────────
 *
 * ADR-0316 (`amends: [314]`) resolved the ownership split this component sits on. The STRIP stayed
 * ADR-0314's — "its D7 factory-floor health strip is still that surface's to build" — while the
 * INSTRUMENT that computes the signal moved to `factory-floor-health-arc` under ADR-0316 D1–D4, and
 * D5 named this strip its first committed CONSUMER. That instrument landed in #1215; the figure
 * arrives here over `GET /api/floor-health` (drive's `loadFloorHealthReading`, the same composition
 * `storytree factory health` prints under "THE READING"), mapped by `lib/floorHealth.ts`.
 *
 * What the instrument deliberately does NOT supply is the loud/quiet threshold — ADR-0314 D7 says
 * the band goes loud when "a shared bottleneck recurs" and never states a number, and ADR-0316 D4
 * keeps the instrument to measuring, so the verb prints the figure and says in its own output that
 * the band reading it decides. It is decided here, once, as {@link LOUD_AT_RECURRENCES}.
 *
 * ── THE UNIT IS THE DISTINCT BOTTLENECK, NEVER FILING VOLUME ──────────────────────────────────
 *
 * ADR-0314 D7 and ADR-0316 D3 state the same rule, and it is fenced STRUCTURALLY here rather than
 * by comment: {@link FloorHealthSignal} has no field that can carry a count of filings, sessions, or
 * reports. The only number it accepts is `recurrences` — how many times ONE distinct cause came
 * back AFTER it was routed — and it must arrive alongside the window it was measured over
 * (ADR-0316 D2) and the collapsing rule that produced the distinctness (ADR-0316 D3: "a distinctness
 * count whose rule is hidden is just a different unaudited number"). A hundred reports of one
 * bottleneck must never score like a hundred reports of a hundred; that error closed a whole arc
 * (`factory-self-load-tune-the-guidance-loop-back-to-evidence-arc`, whose two closing metrics both
 * counted filings).
 *
 * READ-ONLY, like everything else this round (ADR-0267 D6 / ADR-0314 D9): the strip reports; it
 * offers no affordance to discharge, route, or acknowledge anything. ADR-0316 D4 keeps adjudication
 * with the graduation-synthesist, and a band with a "dismiss" button would be adjudicating. The loud
 * band links each cause into its Library artifact, which is a READ — the same click-through the
 * briefing panel makes (ADR-0314 D3) — not an affordance to act on it here.
 */

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
 * reading" are different facts and a band that blurred them would tell the owner to wait for
 * something that may not be coming — the spinner-that-never-resolves defect #1192 fixed on the arcs
 * lens next door.
 */
export interface FloorHealthPending {
  pending: true;
}

/**
 * NO FIGURE, and the condition that stopped it — ADR-0316 D2's refusal, carried through to the band.
 *
 * The instrument's own rule is that where a window cannot support a figure it names the condition
 * that failed instead of printing a number that reads as progress. The band owes that rule the same
 * honesty on its side: a decline renders as a DECLINE, never as `quiet`. Falling back to quiet would
 * report "the floor is fine" on the strength of not having looked, which is the one reading this band
 * must never produce.
 */
export interface FloorHealthDecline {
  /** Why there is no figure, in the owner's language. */
  declined: string;
}

/** What the band may be handed. Every arm is a different fact; only one of them is a reading. */
export type FloorHealthBand = FloorHealthSignal | FloorHealthPending | FloorHealthDecline;

/**
 * THE THRESHOLD — how many post-route recurrences on ONE distinct cause make the band loud.
 *
 * This is the call ADR-0314 D7 left open ("a shared bottleneck recurs", no number) and ADR-0316 D4
 * deliberately kept out of the instrument. Settled here, at 2, on this reasoning:
 *
 *   ≥1 IS NOT A THRESHOLD. Measured against the live board on 2026-08-08, the loudest live cause
 *   carried exactly ONE post-route recurrence — so a band that lights at one is loud on its first
 *   day and permanently after, and a band that is always loud is furniture. The owner's ask was
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
 *   mile, while today's ×1 background does not. That is the discrimination the band is for.
 *
 * It is a constant, not a decision cast in code: the QUIET band prints the sub-threshold figure and
 * this number beside it, so an owner who thinks one recurrence deserves shouting can see exactly what
 * was withheld and say so. Retune it here, in one place, and say so on the arc.
 */
export const LOUD_AT_RECURRENCES = 2;

export interface FloorHealthStripProps {
  /**
   * What the band is reading: the instrument's signal, a pending read, or a stated decline.
   * `null`/absent means no reading is wired into this view at all — never synthesise one from filing
   * counts to fill the gap, and never let an absence render as a quiet floor.
   */
  signal?: FloorHealthBand | null;
}

const isDecline = (band: FloorHealthBand): band is FloorHealthDecline => 'declined' in band;
const isPending = (band: FloorHealthBand): band is FloorHealthPending => 'pending' in band;

/**
 * The strip. Five states, each with a stable `data-health-state` marker so the band's reading is
 * assertable without depending on its wording:
 *
 *   `unwired`  — nothing is wired into this view. Shows no figure at all.
 *   `reading`  — the read is in flight and has not answered yet.
 *   `declined` — there is no figure, and the band says which condition stopped it (ADR-0316 D2).
 *   `quiet`    — the instrument answered and nothing clears {@link LOUD_AT_RECURRENCES}. The DEFAULT
 *                posture, and it still prints what it saw rather than only that it saw nothing.
 *   `loud`     — a distinct cause is recurring past the threshold. The state the owner must not miss.
 */
export function FloorHealthStrip({ signal }: FloorHealthStripProps): React.JSX.Element {
  const band = signal ?? null;
  const reading = band !== null && !isDecline(band) && !isPending(band) ? band : null;
  const loud = reading?.bottlenecks.filter((b) => b.recurrences >= LOUD_AT_RECURRENCES) ?? [];
  const state =
    band === null
      ? 'unwired'
      : isPending(band)
        ? 'reading'
        : isDecline(band)
          ? 'declined'
          : loud.length > 0
            ? 'loud'
            : 'quiet';

  return (
    <div
      className={`floor-health-strip floor-health-${state}`}
      data-testid="floor-health-strip"
      data-health-state={state}
      role="status"
      aria-label="factory floor health"
    >
      <span className="floor-health-label">factory floor</span>
      {state === 'unwired' && (
        <span className="floor-health-note muted small">no floor reading is wired into this view</span>
      )}
      {state === 'reading' && <span className="floor-health-note muted small">reading the floor…</span>}
      {state === 'declined' && band !== null && isDecline(band) && (
        /* ADR-0316 D2, carried to the band: name the condition that failed. Anything that reads as
           "all clear" here would be reporting the floor healthy on the strength of not having
           looked. */
        <span className="floor-health-note muted small" data-testid="floor-health-declined">
          no reading — {band.declined}
        </span>
      )}
      {state === 'quiet' && reading !== null && (
        /* Quiet still SHOWS what it saw. Printing the sub-threshold figure is what makes the
           threshold auditable from the surface itself rather than only from this file. */
        <span className="floor-health-note muted small">
          {reading.bottlenecks.length === 0
            ? 'no distinct bottleneck recurring'
            : `quiet below ${LOUD_AT_RECURRENCES} recurrences · loudest: ${reading.bottlenecks
                .map((b) => `${b.cause} (${b.recurrences === 1 ? 'once' : `${b.recurrences}×`})`)
                .join(', ')}`}{' '}
          · {reading.window}
        </span>
      )}
      {state === 'loud' && reading !== null && (
        <>
          <ul className="floor-health-bottlenecks" aria-label="recurring bottlenecks">
            {loud.map((b) => (
              <li key={b.id} className="floor-health-bottleneck">
                {/* A read, not an affordance: the same click-through into the Library artifact the
                    briefing panel makes (ADR-0314 D3), so "something is wrong" is one click from
                    what exactly. */}
                <a className="floor-health-cause" href={assetHref(b.id)}>
                  {b.cause}
                </a>
                <span className="floor-health-recurrences">
                  {b.recurrences === 1 ? 'recurred once' : `recurred ${b.recurrences}×`} since routed
                </span>
              </li>
            ))}
          </ul>
          {/* ADR-0316 D2/D3: the window and the collapsing rule travel WITH the figure — a
              distinctness count whose rule is hidden is just a different unaudited number.

              The rule is ~450 words of qualification and this is a PERSISTENT band: rendered raw it
              measured 100px tall, three lines of dense prose pushing the lanes down every time the
              floor is loud. So it is carried in full — in the DOM, in the accessible name, and in
              `storytree factory health`'s output — and shown on ONE line that ellipsises, with its
              load-bearing first sentence in the visible span. Attached and readable is what D3 asks
              for; dominating the surface it annotates is not. */}
          <span className="floor-health-provenance muted small" title={reading.collapsingRule}>
            {reading.window} · collapsed by: {reading.collapsingRule}
          </span>
        </>
      )}
    </div>
  );
}
