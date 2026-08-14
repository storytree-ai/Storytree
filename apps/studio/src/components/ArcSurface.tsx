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
 *   D7 — the factory-floor health reading NO LONGER LIVES HERE (ADR-0349 amends D7's placement, and
 *        D7's requirement is unchanged and better served). It was a persistent band above the lanes,
 *        which put a reading whose whole point was to reach the owner "without the owner going
 *        looking" inside a lens that renders only under `?overlay=arcs`. It is now
 *        `FloorHealthLamp`, mounted on the map by `TreeView` — visible whenever the floor it reports
 *        on is. Do not re-mount it here: the surface deliberately carries no floor-health prop, and
 *        the band's `factory floor` label reading as this surface's TITLE is the second defect that
 *        move fixed (see the heading below).
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
import { DetailDisclosure } from './DetailDisclosure';
import {
  arcBriefing,
  arcLanes,
  briefingLead,
  defaultLaneId,
  landedSummary,
  BLOCKED_UNAVAILABLE_NOTE,
  LANDED_STATUS,
  PROPOSAL_STATUS,
  type ArcLane,
  type ArcLaneScope,
} from '../lib/arcSurface';
import type { ArcRollupIncrement, SessionClaimGroup } from '../types';
import { ARCS_UNREACHABLE, type ArcRollupsState } from '../lib/arcRollups';
import type { SearchResult } from '../lib/librarySearch';

export interface ArcSurfaceProps {
  /** `undefined` while nothing has answered · `null` when the backend has no document store. */
  arcs: ArcRollupsState;
  /** Injected so every recency judgement is reproducible in a test. */
  now: Date;
  /**
   * Live claims grouped by session (`GET /api/claims`), used ONLY to light `claimed` — the one lane
   * state on this surface backed by the claim ledger rather than by dates (ADR-0351 D2).
   *
   * POSITIVE-ONLY, and the asymmetry is load-bearing: a match proves a session is on this arc, a
   * non-match proves nothing, so absent/`null` claims simply fall through to the recency states. The
   * surface never renders "unclaimed". Coverage is genuinely partial — see `arcClaimants` for the
   * measured reason — which is exactly why this ADDS a state instead of replacing them.
   */
  claims?: readonly SessionClaimGroup[] | null;
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

export function ArcSurface({ arcs, now, claims = null, onOpen }: ArcSurfaceProps): React.JSX.Element {
  // ADR-0335: closed arcs are drawn one flag away, not only "one click away in the Library" — the
  // studio surface had no equivalent of the CLI's `arc list --closed` until this scope toggle.
  // ADR-0374 D5 made it THREE scopes, one per lifecycle: `Parked` joined, and `All` was removed as
  // a view that answered no question of its own (the owner's call).
  const [scope, setScope] = useState<ArcLaneScope>('active');
  const lanes = Array.isArray(arcs) ? arcLanes(arcs, now, scope, claims) : [];
  const [picked, setPicked] = useState<string | null>(null);
  // The pick is only honoured while it still names a live lane: the list re-polls, and an arc that
  // closed under the owner (or fell out of the current scope) must not leave the panel pinned to a
  // lane that is no longer drawn.
  const selectedId =
    picked !== null && lanes.some((l) => l.arc.id === picked) ? picked : defaultLaneId(lanes);
  const selected = lanes.find((l) => l.arc.id === selectedId) ?? null;
  const emptyLabel = `No ${scope} arcs.`;

  return (
    <div className="arc-surface" data-testid="arc-surface">
      {/* THE SURFACE NAMES ITSELF. Without this the first text in the drawer was the floor-health
          band's own `factory floor` label, which then read as the whole lens's title — the band
          answers a NARROWER question than the surface does (is the floor healthy, versus where is
          every initiative up to), so borrowing its label mis-titled the surface and over-claimed the
          band. The drawer's `Arcs | Library` toggle does not fill this slot: it lives in the handle
          bar BELOW the body (LibraryDrawer.tsx), so nothing above the lanes said what this is. */}
      <header className="arc-surface-header">
        <h3 className="arc-surface-title">Arc Surface</h3>
      </header>
      <div className="arc-surface-panes">
        <div className="arc-lanes" data-testid="arc-lanes" aria-label="arcs">
          {/* ADR-0335 / ADR-0374 D5: which arcs draw. Always rendered (even mid-load) so the control
              itself never flickers in and out — only the list beneath it changes.

              ONE BUTTON PER LIFECYCLE, and that is the whole set: every arc sits under exactly one
              of the three, so the toggle is a partition rather than a set of filters. `All` used to
              sit at the end and was removed — it drew the three groups interleaved into one column,
              where the only thing distinguishing them was the small state chip, so the reader had to
              re-derive per lane what the scope buttons already answer. */}
          <div className="arc-lanes-scope" role="group" aria-label="which arcs to show">
            {(['active', 'parked', 'closed'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`arc-lanes-scope-btn${scope === s ? ' on' : ''}`}
                aria-pressed={scope === s}
                data-testid={`arc-lanes-scope:${s}`}
                onClick={() => setScope(s)}
              >
                {s === 'active' ? 'Active' : s === 'parked' ? 'Parked' : 'Closed'}
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
  const { arc, bars, counts, state, claimants } = lane;
  // Named sessions, deduped — one session claiming three of an arc's units is one session on it, not
  // three. Shown as the chip's tooltip so `claimed` says WHO without widening the lane (ADR-0351 D2).
  const sessions = [...new Set(claimants.map((c) => c.sessionId))];
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
        <span
          className={`arc-state-chip arc-state-${state}`}
          {...(sessions.length > 0
            ? { title: `held by ${sessions.join(', ')} — ${claimants.map((c) => c.unitId).join(', ')}` }
            : {})}
        >
          {state}
        </span>
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

      {/* WAITING FIRST — the half that makes this a place to act rather than another index.
          TWO GROUPS since ADR-0359 D2: authored questions (answerable right now) and parked
          PROPOSALS (a read, then a direction). They are labelled separately rather than merged,
          because the owner does different things with them and the second is not answerable in
          the sense the first is. Questions lead. */}
      <section className="arc-briefing-waiting" aria-label="waiting on you">
        <h5>Waiting on you</h5>
        {briefing.waiting.length === 0 && briefing.proposals.length === 0 ? (
          <p className="muted small" data-testid="arc-briefing-nothing-waiting">
            Nothing is waiting on you here.
          </p>
        ) : null}
        {briefing.waiting.length > 0 && (
          <ul className="arc-question-list" data-testid="arc-briefing-questions">
            {briefing.waiting.map((q) => (
              <li key={q.id} className="arc-question" data-testid={`arc-question:${q.id}`}>
                {/* Stakes lead — what breaks while this stays unsettled (ADR-0314 D5's briefing
                    shape). The link reaches the artifact carrying the rest: the options, the
                    analogy, the diagrams, the non-binding recommendation. */}
                <a
                  className="arc-question-title"
                  href={assetHref(q.id)}
                  onClick={openOnClick(onOpen, { id: q.id, title: q.title || q.id, category: 'open-question', source: 'asset' })}
                >
                  {q.title || q.id}
                </a>
                {/* STRIPPED AND CLAMPED, for the reason `.arc-briefing-intent` already is: these
                    are markdown in the store, the panel renders TEXT, and a `stakes` authored to
                    ADR-0314 D5's cold-answerable bar runs to hundreds of words. Unclamped, one loud
                    question filled the drawer and pushed "What it is about" off the panel — the raw
                    `**` and backticks showing through as literal characters on the way. The full
                    prose is one click away through the link above (D3's click-through), which is
                    what makes the clamp a fold rather than a loss. */}
                {q.stakes && (
                  <p className="arc-question-stakes arc-briefing-clamp">{briefingLead(q.stakes)}</p>
                )}
                {q.description && <p className="muted small">{briefingLead(q.description)}</p>}
              </li>
            ))}
          </ul>
        )}
        {briefing.proposals.length > 0 && (
          <>
            <h6 className="arc-briefing-subhead">Proposals to review</h6>
            <ul className="arc-increment-list arc-proposal-list" data-testid="arc-briefing-proposals">
              {briefing.proposals.map((inc) => (
                <IncrementRow key={inc.id} increment={inc} onOpen={onOpen} />
              ))}
            </ul>
          </>
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

      {/* WHAT COMES NEXT is now DECIDED work only — `ready` and `active`. Proposals moved up into
          "Waiting on you" (ADR-0359 D3) rather than being listed twice. When everything queued is a
          proposal this block is empty, and it must not say "nothing queued" — there IS queued work,
          it is sitting above asking for a look. */}
      <section className="arc-briefing-next" aria-label="what comes next">
        <h5>What comes next</h5>
        {briefing.next.length === 0 ? (
          <p className="muted small">
            {briefing.proposals.length > 0
              ? 'Nothing dispatched — everything queued is waiting on your review above.'
              : 'Nothing queued.'}
          </p>
        ) : (
          <ul className="arc-increment-list">
            {briefing.next.map((inc) => (
              <IncrementRow key={inc.id} increment={inc} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </section>

      {/* WHERE IT IS UP TO — FOLDED, NOT DELETED (ADR-0359 D1). This block rendered one row per
          closed increment, which is 57 rows on `verification-integrity-arc` and put the two blocks
          the owner actually reads at the top of a long scroll. It is the least perishable of the
          four and was drawn at the same volume as the most perishable. So: a one-line summary, and
          the full list one click away behind a closed-by-default disclosure. Deleting it outright
          would make ADR-0267's "where is it up to" unanswerable from the surface that exists to
          answer it, which is why this is a fold. `DetailDisclosure` is REUSED rather than
          re-implemented — it already owns the open-state-lives-with-the-disclosure behaviour. */}
      <section className="arc-briefing-landed" aria-label="where it is up to">
        <h5>Where it is up to</h5>
        {briefing.landed.length === 0 ? (
          <p className="muted small">Nothing has landed yet.</p>
        ) : (
          <DetailDisclosure label={landedSummary(lane.arc)} className="arc-landed-disclosure">
            <ul className="arc-increment-list">
              {briefing.landed.map((inc) => (
                <IncrementRow key={inc.id} increment={inc} onOpen={onOpen} />
              ))}
            </ul>
          </DetailDisclosure>
        )}
      </section>
    </aside>
  );
}

/**
 * One increment row — the same rendering everywhere it appears, so a reader compares like with like.
 *
 * A FORWARD-LOOKING ROW CARRIES AN EXPLICIT REVIEW ACTION (ADR-0359). The title has always been a
 * link, but nothing on the surface SAID a queued increment could be opened and read: the owner could
 * see that an arc had queued work and could not reliably reach the proposal itself. The action is a
 * plain `<a href>`, so it is keyboard-reachable, copyable and middle-clickable with no handler of
 * ours — a plain left-click is intercepted into the same in-place overlay a question opens.
 *
 * A LANDED ROW GETS NO ACTION, and its label never says "proposal": there is nothing to review on
 * something that has already landed, and inheriting the word would misdescribe it.
 */
function IncrementRow({
  increment,
  onOpen,
}: {
  increment: ArcRollupIncrement;
  onOpen?: ((selection: SearchResult) => void) | undefined;
}): React.JSX.Element {
  const landedOn = increment.outcome?.date;
  const pr = increment.outcome?.pr;
  const queued = increment.status !== LANDED_STATUS;
  const selection: SearchResult = {
    id: increment.id,
    title: increment.title || increment.id,
    category: 'increment',
    source: 'asset',
  };
  return (
    <li
      className="arc-increment"
      data-increment-status={increment.status}
      data-testid={`arc-increment:${increment.id}`}
    >
      <a
        className="arc-increment-title"
        href={assetHref(increment.id)}
        onClick={openOnClick(onOpen, selection)}
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
      {queued && (
        <a
          className="arc-increment-review"
          data-testid={`arc-increment-review:${increment.id}`}
          href={assetHref(increment.id)}
          onClick={openOnClick(onOpen, selection)}
        >
          {increment.status === PROPOSAL_STATUS ? 'Review proposal ↗' : 'Review ↗'}
        </a>
      )}
    </li>
  );
}
