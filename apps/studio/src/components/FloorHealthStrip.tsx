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
 * ── THE FIGURE IS DELIBERATELY UNWIRED, AND THAT IS THE DECIDED STATE ─────────────────────────
 *
 * ADR-0316 (`amends: [314]`) resolves the ownership split this component sits on. The STRIP stays
 * ADR-0314's — "its D7 factory-floor health strip is still that surface's to build" — but the
 * INSTRUMENT that computes the signal moved to `factory-floor-health-arc` under ADR-0316 D1–D4, and
 * that inverts the dependency: D5 records that D7's strip is *"currently unbuildable without it"*,
 * because the only floor figure that exists in the data today is the raw reinforcement count, which
 * is exactly the filing volume ADR-0314 D7 and ADR-0316 D3 both forbid. Its Sequencing consequence
 * gives this component its marching orders verbatim: *"a session reaching `factory-floor-health-
 * signal` before this instrument lands should build the strip's frame and leave the figure unwired
 * rather than substitute a volume count."*
 *
 * So `signal == null` is not a placeholder awaiting a TODO — it is the honest current state, and it
 * renders as such: the band is present and quiet, and it names where the instrument is being built.
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
 * with the graduation-synthesist, and a band with a "dismiss" button would be adjudicating.
 */

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

/** Where the instrument is being built — shown in the unwired state so the band is not a dead end. */
const INSTRUMENT_HOME = 'factory-floor-health-arc';

export interface FloorHealthStripProps {
  /**
   * The instrument's reading, or `null`/absent while no instrument is wired (the current, decided
   * state — ADR-0316 D5). Never synthesise one from filing counts to fill the gap.
   */
  signal?: FloorHealthSignal | null;
}

/**
 * The strip. Three states, each with a stable `data-health-state` marker so the band's reading is
 * assertable without depending on its wording:
 *
 *   `unwired` — no instrument yet (ADR-0316 D5). Quiet, and names where it is being built.
 *   `quiet`   — the instrument answered and the floor is fine. Quiet is the DEFAULT posture.
 *   `loud`    — distinct bottlenecks are recurring. This is the state the owner must not miss.
 */
export function FloorHealthStrip({ signal }: FloorHealthStripProps): React.JSX.Element {
  const state = signal == null ? 'unwired' : signal.bottlenecks.length === 0 ? 'quiet' : 'loud';

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
        <span className="floor-health-note muted small">
          no health instrument wired yet — the measurement is being built on{' '}
          <code>{INSTRUMENT_HOME}</code>
        </span>
      )}
      {state === 'quiet' && signal != null && (
        <span className="floor-health-note muted small">
          no distinct bottleneck recurring · {signal.window}
        </span>
      )}
      {state === 'loud' && signal != null && (
        <>
          <ul className="floor-health-bottlenecks" aria-label="recurring bottlenecks">
            {signal.bottlenecks.map((b) => (
              <li key={b.id} className="floor-health-bottleneck">
                <span className="floor-health-cause">{b.cause}</span>
                <span className="floor-health-recurrences">
                  {b.recurrences === 1 ? 'recurred once' : `recurred ${b.recurrences}×`} since routed
                </span>
              </li>
            ))}
          </ul>
          {/* ADR-0316 D2/D3: the window and the collapsing rule travel WITH the figure — a
              distinctness count whose rule is hidden is just a different unaudited number. */}
          <span className="floor-health-provenance muted small">
            {signal.window} · collapsed by: {signal.collapsingRule}
          </span>
        </>
      )}
    </div>
  );
}
