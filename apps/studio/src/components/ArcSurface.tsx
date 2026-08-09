/**
 * THE ARC SURFACE (ADR-0267 D1 + ADR-0314) — the map's primary top-drawer lens.
 *
 * What it answers, for an owner arriving cold: for any live arc, what it is about, where it is up
 * to, what comes next, and which questions are waiting on them — from this surface alone, without
 * asking an agent to reconstruct the context.
 *
 * THE LAYOUT IS DECIDED, NOT PROPOSED (ADR-0314, owner-picked 2026-08-05 — mock option B, modified).
 * Do not re-mock it and do not re-render to "check" it; the pick is made.
 *
 *   D1 — momentum lanes, one per arc, with option B's shared 6-week DATE AXIS DELETED. The axis made
 *        staleness a shape rather than a label, but it spent ~60% of its width on empty space: at the
 *        measured recency distribution almost every landing bunches against the today-line.
 *   D2 — each lane's bars are UNITS, not time: green for a closed (landed) increment, grey for one
 *        not completed yet. Position carries no date meaning. This is deliberately NOT a progress
 *        bar — see `laneCounts` in lib/arcSurface.ts for why the missing percentage is the point.
 *   D3 — the width the axis freed becomes a BRIEFING PANEL on the right: what waits on the owner,
 *        with click-through into the actual Library artifact holding the question, so they can reach
 *        the briefing, diagrams and mocks needed to answer it. `#/asset/<id>` already routes, so this
 *        is deep-linking rather than a new surface. It composes option C's reading room into option
 *        B's index, which the mock round said the four options were for.
 *   D4 — `waiting` and `blocked` stay separate: answerable versus stuck. `blocked` is NOT lit here,
 *        because neither of its two sources is derivable yet — the refusal, and why substituting one
 *        of the mock round's rejected predicates is forbidden, lives in `BLOCKED_IS_DERIVABLE`.
 *   D7 — a persistent factory-floor health strip sits ABOVE the lanes ({@link FloorHealthStrip}),
 *        fed by `GET /api/floor-health` (ADR-0316's instrument, wired 2026-08-08). The strip owns the
 *        loud/quiet threshold; this component only passes the band through.
 *   D9 — READ-ONLY. No comment affordance, no answering in place, no write path (ADR-0267 D6). The
 *        click-through is a read; the briefing itself is authored by the escalating session
 *        (`storytree question new`, ADR-0314 D5, landed #1186), never by the owner through here.
 *
 * WHERE THE DATA COMES FROM. One already-joined `ArcRollup[]` off `GET /api/arcs` — drive's
 * `loadArcRollups`, the same join `storytree arc show` renders. This component derives presentation
 * only (lib/arcSurface.ts) and joins nothing.
 */

import { useState } from 'react';
import { assetHref } from '../lib/route';
import {
  arcBriefing,
  arcLanes,
  briefingLead,
  defaultLaneId,
  BLOCKED_UNAVAILABLE_NOTE,
  type ArcLane,
  type ArcLaneScope,
} from '../lib/arcSurface';
import type { ArcRollupIncrement } from '../types';
import { ARCS_UNREACHABLE, type ArcRollupsState } from '../lib/arcRollups';
import { FloorHealthStrip, type FloorHealthBand } from './FloorHealthStrip';
import type { SearchResult } from '../lib/librarySearch';

export interface ArcSurfaceProps {
  /** `undefined` while nothing has answered · `null` when the backend has no document store. */
  arcs: ArcRollupsState;
  /** Injected so every recency judgement is reproducible in a test. */
  now: Date;
  /**
   * What the floor-health band is reading (ADR-0314 D7, instrument ADR-0316) — already mapped from
   * the wire by `lib/floorHealth.ts`'s `floorHealthBand`, so this component joins nothing. Absent
   * means no reading is wired into this mount, which the band renders as such rather than as calm.
   */
  floorHealth?: FloorHealthBand | null;
  /**
   * Open an artifact in the map's `LibraryOpenOverlay` instead of navigating away (the same callback
   * `LibraryFocusGraph`/`LibrarySelectionCard` are handed, ADR-0335's UI fix). Every deep-link on this
   * surface stays a real `<a href={assetHref(id)}>` — right-click / middle-click / copy-link / screen
   * readers all still work exactly as before — but a plain left-click is intercepted and opens the
   * overlay in place. Omitted (e.g. in isolation tests), a plain click falls through to the browser's
   * normal navigation, unchanged from before this prop existed.
   */
  onOpen?: (selection: SearchResult) => void;
}

export function ArcSurface({ arcs, now, floorHealth, onOpen }: ArcSurfaceProps): React.JSX.Element {
  // ADR-0335: closed arcs are drawn one flag away, not only "one click away in the Library" — the
  // studio surface had no equivalent of the CLI's `arc list --all|--closed` until this scope toggle.
  const [scope, setScope] = useState<ArcLaneScope>('active');
  const lanes = Array.isArray(arcs) ? arcLanes(arcs, now, scope) : [];
  const [picked, setPicked] = useState<string | null>(null);
  // The pick is only honoured while it still names a live lane: the list re-polls, and an arc that
  // closed under the owner (or fell out of the current scope) must not leave the panel pinned to a
  // lane that is no longer drawn.
  const selectedId =
    picked !== null && lanes.some((l) => l.arc.id === picked) ? picked : defaultLaneId(lanes);
  const selected = lanes.find((l) => l.arc.id === selectedId) ?? null;
  const emptyLabel =
    scope === 'active' ? 'No active arcs.' : scope === 'closed' ? 'No closed arcs.' : 'No arcs.';

  return (
    <div className="arc-surface" data-testid="arc-surface">
      {/* D7: persistent, above the lanes — it must reach the owner without them going looking. */}
      <FloorHealthStrip signal={floorHealth ?? null} />
      <div className="arc-surface-panes">
        <div className="arc-lanes" data-testid="arc-lanes" aria-label="arcs">
          {/* ADR-0335: which arcs draw. Always rendered (even mid-load) so the control itself never
              flickers in and out — only the list beneath it changes. */}
          <div className="arc-lanes-scope" role="group" aria-label="which arcs to show">
            {(['active', 'closed', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`arc-lanes-scope-btn${scope === s ? ' on' : ''}`}
                aria-pressed={scope === s}
                data-testid={`arc-lanes-scope:${s}`}
                onClick={() => setScope(s)}
              >
                {s === 'active' ? 'Active' : s === 'closed' ? 'Closed' : 'All'}
              </button>
            ))}
          </div>
          {arcs === undefined ? (
            <p className="muted small arc-lanes-note">Reading arcs…</p>
          ) : arcs === ARCS_UNREACHABLE ? (
            /* The read never answered — the request failed, or this backend does not serve the
               route at all. The desktop's local backend used to be the standing example of the
               latter; it mirrors `/api/arcs` now, so what reaches here is a backend older than that
               mirror, or a genuine failure. Distinct from "Reading arcs…": a spinner that will never
               resolve is a worse lie than an empty list, because it tells the owner to wait for
               something that is not coming. */
            <p className="muted small arc-lanes-note" data-testid="arc-lanes-unreachable">
              Arcs aren&apos;t available here — the arc read didn&apos;t answer.
            </p>
          ) : arcs === null ? (
            /* `null` and `[]` are DIFFERENT facts (the /api/arcs handler is explicit about this):
               "the store isn't here" must never render as a confident "no arcs". */
            <p className="muted small arc-lanes-note" data-testid="arc-lanes-no-store">
              Arcs need the live store — this backend has none.
            </p>
          ) : lanes.length === 0 ? (
            <p className="muted small arc-lanes-note">{emptyLabel}</p>
          ) : (
            lanes.map((lane) => (
              <ArcLaneRow
                key={lane.arc.id}
                lane={lane}
                selected={lane.arc.id === selectedId}
                onSelect={() => setPicked(lane.arc.id)}
              />
            ))
          )}
        </div>
        <ArcBriefingPanel lane={selected} onOpen={onOpen} />
      </div>
    </div>
  );
}

/**
 * One lane: the arc's name and state on the left, its unit bars on the right. A button rather than
 * a div so the lane is reachable by keyboard — the panel is where the owner acts, and it must not
 * need a mouse to get there.
 */
function ArcLaneRow({
  lane,
  selected,
  onSelect,
}: {
  lane: ArcLane;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  const { arc, bars, counts, state } = lane;
  return (
    <button
      type="button"
      className={`arc-lane${selected ? ' on' : ''}`}
      data-testid={`arc-lane:${arc.id}`}
      data-arc-state={state}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="arc-lane-name">
        <span className={`arc-state-chip arc-state-${state}`}>{state}</span>
        {/* Real arc titles run past the column, so the ellipsis needs a hover fallback — the panel
            shows the full title, but a reader scanning the list should not have to click to read one. */}
        <span className="arc-lane-title" title={arc.title || arc.id}>
          {arc.title || arc.id}
        </span>
      </span>
      <span className="arc-lane-track" aria-label={`${counts.landed} landed, ${counts.queued} queued`}>
        {bars.map((bar) => (
          <span
            key={bar.id}
            className={`arc-bar arc-bar-${bar.tone}`}
            data-bar-tone={bar.tone}
            title={`${bar.title || bar.id} — ${bar.status}`}
          />
        ))}
        {/* Counts, never a ratio (ADR-0314 D2): an arc has no denominator, so the surface says how
            many units it KNOWS about and never asserts that this is all of them. */}
        <span className="arc-lane-counts muted small">
          {counts.landed} landed · {counts.queued} queued
        </span>
      </span>
    </button>
  );
}

/**
 * A deep link that stays a real `<a href>` (right-click / middle-click / copy-link / screen readers
 * unaffected) but, on a plain unmodified left-click, opens the artifact in the map's overlay instead
 * of navigating the whole app away from the forest (ADR-0335's UI fix). Without `onOpen` this is a
 * no-op and the click falls through to ordinary navigation — the pre-fix behaviour, unchanged.
 */
function openOnClick(
  onOpen: ((selection: SearchResult) => void) | undefined,
  selection: SearchResult,
): (event: React.MouseEvent<HTMLAnchorElement>) => void {
  return (event) => {
    if (!onOpen) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(selection);
  };
}

/**
 * The briefing panel (D3) — the space the deleted axis returned, and where the owner acts.
 *
 * It defaults to the selected arc's briefing and leads with what is WAITING when anything is. Each
 * question links straight into its Library artifact, so the owner reaches the full briefing the
 * escalating session authored (ADR-0314 D5) rather than a one-line summary they then have to go
 * looking for. Read-only: there is no reply box here by decision (ADR-0267 D6 / ADR-0314 D9), and
 * answering happens by the owner prompting an agent harness.
 */
function ArcBriefingPanel({
  lane,
  onOpen,
}: {
  lane: ArcLane | null;
  onOpen?: ((selection: SearchResult) => void) | undefined;
}): React.JSX.Element {
  if (lane === null) {
    return (
      <aside className="arc-briefing" data-testid="arc-briefing" aria-label="arc briefing">
        <p className="muted small">Pick an arc to read its briefing.</p>
      </aside>
    );
  }
  const briefing = arcBriefing(lane.arc);
  const { arc } = briefing;

  return (
    <aside className="arc-briefing" data-testid="arc-briefing" aria-label="arc briefing">
      <header className="arc-briefing-header">
        <h4 className="arc-briefing-title">{arc.title || arc.id}</h4>
        <a
          className="arc-briefing-open"
          href={assetHref(arc.id)}
          onClick={openOnClick(onOpen, { id: arc.id, title: arc.title || arc.id, category: 'arc', source: 'asset' })}
        >
          open the arc ↗
        </a>
      </header>

      {/* WAITING FIRST — the half that makes this a place to act rather than another index. */}
      <section className="arc-briefing-waiting" aria-label="waiting on you">
        <h5>Waiting on you</h5>
        {briefing.waiting.length === 0 ? (
          <p className="muted small" data-testid="arc-briefing-nothing-waiting">
            Nothing is waiting on you here.
          </p>
        ) : (
          <ul className="arc-question-list">
            {briefing.waiting.map((q) => (
              <li key={q.id} className="arc-question" data-testid={`arc-question:${q.id}`}>
                {/* Stakes lead — what breaks while this stays unsettled (ADR-0314 D5's briefing
                    shape). The link reaches the artifact carrying the rest: the options, the
                    diagrams, the non-binding recommendation. */}
                <a
                  className="arc-question-title"
                  href={assetHref(q.id)}
                  onClick={openOnClick(onOpen, { id: q.id, title: q.title || q.id, category: 'open-question', source: 'asset' })}
                >
                  {q.title || q.id}
                </a>
                {q.stakes && <p className="arc-question-stakes">{q.stakes}</p>}
                {q.description && <p className="muted small">{q.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* `blocked` is named and left UNLIT rather than omitted — an owner who was told the surface
          distinguishes blocked must be able to see that it currently cannot, instead of reading its
          absence as "nothing is blocked" (ADR-0314 D4). */}
      <p className="arc-briefing-blocked-note muted small" data-testid="arc-blocked-note">
        {BLOCKED_UNAVAILABLE_NOTE}
      </p>

      <section className="arc-briefing-about" aria-label="what this arc is about">
        <h5>What it is about</h5>
        <p className="arc-briefing-intent">{briefingLead(arc.intent || arc.description)}</p>
      </section>

      <section className="arc-briefing-next" aria-label="what comes next">
        <h5>What comes next</h5>
        {briefing.next.length === 0 ? (
          <p className="muted small">Nothing queued.</p>
        ) : (
          <ul className="arc-increment-list">
            {briefing.next.map((inc) => (
              <IncrementRow key={inc.id} increment={inc} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </section>

      <section className="arc-briefing-landed" aria-label="where it is up to">
        <h5>Where it is up to</h5>
        {briefing.landed.length === 0 ? (
          <p className="muted small">Nothing has landed yet.</p>
        ) : (
          <ul className="arc-increment-list">
            {briefing.landed.map((inc) => (
              <IncrementRow key={inc.id} increment={inc} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

/** One increment row — the same rendering on both halves, so a reader compares like with like. */
function IncrementRow({
  increment,
  onOpen,
}: {
  increment: ArcRollupIncrement;
  onOpen?: ((selection: SearchResult) => void) | undefined;
}): React.JSX.Element {
  const landedOn = increment.outcome?.date;
  const pr = increment.outcome?.pr;
  return (
    <li className="arc-increment" data-increment-status={increment.status}>
      <a
        className="arc-increment-title"
        href={assetHref(increment.id)}
        onClick={openOnClick(onOpen, {
          id: increment.id,
          title: increment.title || increment.id,
          category: 'increment',
          source: 'asset',
        })}
      >
        {increment.title || increment.id}
      </a>
      <span className="muted small">
        {' '}
        · {increment.status}
        {landedOn ? ` · ${landedOn}` : ''}
        {pr ? ` · ${pr}` : ''}
        {increment.parked ? ` · parked ${increment.parked.slice(0, 10)}` : ''}
      </span>
    </li>
  );
}
