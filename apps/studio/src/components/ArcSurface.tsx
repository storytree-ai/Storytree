/**
 * THE ARC SURFACE (ADR-0267 D1 + ADR-0314) — the map's primary top-drawer lens.
 *
 * What it answers, for an owner arriving cold: for any live arc, what it is about, and which
 * questions are waiting on them — from this surface alone, without asking an agent to reconstruct
 * the context. What comes next and where an arc is up to are answered by the LANE bars (D2) rather
 * than by the panel's own prose since `arc-queue-and-question-legibility-arc` inc-01 — see the
 * `ArcBriefingPanel` doc comment below for that cut and why the increment tier itself is unaffected.
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
 *        B's index, which the mock round said the four options were for. CUT to description + open
 *        questions by inc-01 (owner: "description of arc and then open questions, dont see any more
 *        needed here") — the proposals list and the increment work-list are gone from the panel.
 *   D4 — `waiting` and `blocked` stay separate: answerable versus stuck. `blocked` now LIGHTS from
 *        an authored arc-to-arc gate (ADR-0523, `arc-queue-and-question-legibility-arc` inc-05) — one
 *        of its two named sources, not both; the half that remains undecided, and why substituting
 *        one of the mock round's rejected predicates for it is still forbidden, lives in
 *        `BLOCKED_IS_DERIVABLE` / `BLOCKED_UNAVAILABLE_NOTE`. The same gate is what NESTS a queued
 *        arc under its blocker's disclosure and pulls it off the top-level list — see `ArcLaneRow`.
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
 * WHERE THE DATA COMES FROM — TWO READS OF ONE JOIN, split by what each half of the surface draws.
 * The LANES read `ArcRollupSummary[]` off `GET /api/arcs`: a title, a lifecycle, and one narrowed
 * row per increment. The BRIEFING PANEL reads the WHOLE `ArcRollup` for the arc it is open on off
 * `GET /api/arcs/<id>` — that is where an arc's `intent`, its questions' `stakes` and each
 * increment's outcome prose live, and it needs them for one arc, not seventy-six. Both are
 * `@storytree/arc`'s one join (`loadArcRollupSummaries` is `loadArcRollups` projected), the same
 * value `storytree arc show` renders; this component derives presentation only (lib/arcSurface.ts)
 * and joins nothing.
 *
 * THE SPLIT IS A MEASUREMENT, NOT A PREFERENCE. Shipping every arc's prose so the strip could count
 * bars was 1,364,425 bytes over 76 arcs against the live store on 2026-08-20, re-polled every 30 s
 * for as long as this lens is open; the lane rows alone are 226,836. What the split costs back is
 * the panel's one loading state per selection, rendered below as `arc-briefing-reading`.
 */

import { useState } from 'react';
import { assetHref } from '../lib/route';
import { DetailDisclosure } from './DetailDisclosure';
import {
  arcBriefing,
  arcLanes,
  briefingLead,
  defaultLaneId,
  parseOptionCards,
  questionFields,
  questionRowStats,
  questionWordBudget,
  wordCount,
  BLOCKED_UNAVAILABLE_NOTE,
  type ArcLane,
  type ArcLaneScope,
} from '../lib/arcSurface';
import type {
  ArcRollup,
  ArcRollupQuestion,
  ArcRollupSummary,
  GuidanceAsset,
  SessionClaimGroup,
} from '../types';
import {
  ARC_DETAIL_UNREACHABLE,
  ARCS_UNREACHABLE,
  useArcRollup,
  type ArcRollupsState,
  type ArcRollupState,
} from '../lib/arcRollups';
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
  /**
   * Read ONE arc's whole rollup — the briefing panel's own source (`GET /api/arcs/<id>`).
   *
   * INJECTED RATHER THAN IMPORTED, like every other seam this component has: it holds no `api`, no
   * fetch and no socket, which is what lets it prove standalone. The composition root passes
   * `api.arc`; a test passes its fixtures. It must be STABLE across renders — the hook re-reads on
   * the selected id, not on this identity.
   */
  readArc: (id: string) => Promise<ArcRollup>;
  /**
   * The Library corpus — `useAppData().assets` at the mount site, ALREADY loaded for the Library
   * lens whether or not this drawer is open (`apps/studio/src/components/TreeView.tsx`). A question's
   * full authoring fields (`statement` / `context` / `options` / `analogy` / `diagram` /
   * `recommendation`, `arc-queue-and-question-legibility-arc` inc-01/inc-02) live on a structured
   * Knowledge doc's `fields` here, NOT on {@link ArcRollupQuestion} — that shape carries only
   * `stakes`/`description`, and widening it would be exactly the panel-data-source widening ADR-0314
   * forbids (the arc/lane join is a sibling lane's territory, not this one's). Reading `assets`
   * instead costs no new fetch: it is a second, independent consumer of a read the studio already
   * pays for. Defaults to `[]` so every existing caller keeps validating with no migration.
   */
  assets?: readonly GuidanceAsset[];
}

export function ArcSurface({
  arcs,
  now,
  claims = null,
  onOpen,
  readArc,
  assets = [],
}: ArcSurfaceProps): React.JSX.Element {
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
  // The panel's OWN read (`GET /api/arcs/<id>`), keyed on the selection. Called unconditionally —
  // hooks cannot be conditional — and `null` in means `null` out, which is how "nothing is selected"
  // stays distinct from "the read did not answer".
  const detail = useArcRollup(selected?.arc.id ?? null, readArc);
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
            /* STILL READING — and it says so with a moving part, not just words. The read retries
               on a 30 s budget (api.ts `arcs`), so this state can legitimately last tens of seconds
               on a slow answer; a static line of text held that long reads as a surface that has
               given up, which is the very thing the unreachable note below exists to say honestly.
               The spinner is what distinguishes "working" from "stalled" while both look identical
               in prose. It is bounded by construction — the retry is finite, so this always resolves
               to arcs or to the note below, never the never-resolving spinner #1191 rendered. */
            <p
              className="muted small arc-lanes-note arc-lanes-reading"
              data-testid="arc-lanes-reading"
              role="status"
              aria-live="polite"
            >
              <span className="spinner" aria-hidden="true" />
              Reading arcs…
            </p>
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
              <ArcLaneRow key={lane.arc.id} lane={lane} selectedId={selectedId} onSelect={setPicked} />
            ))
          )}
        </div>
        <ArcBriefingPanel lane={selected} detail={detail} onOpen={onOpen} assets={assets} />
      </div>
    </div>
  );
}

/**
 * One lane, and — RECURSIVELY — every arc queued behind it (ADR-0523 / inc-05). The arc's name and
 * state sit on the left, its unit bars on the right, and a disclosure CARET sits beside the row
 * ONLY when {@link ArcLane.queued} is non-empty — the property the wire is required to preserve: an
 * ungated arc (most of them) costs no caret, no indent and no width.
 *
 * THE CARET IS A SIBLING BUTTON, NOT A NESTED ONE. `<button>` inside `<button>` is invalid HTML, so
 * expanding the queue and selecting the arc are two buttons side by side under one wrapping row
 * rather than one control nested in the other — both stay independently reachable by keyboard,
 * which is why the lane was a `<button>` in the first place.
 */
function ArcLaneRow({
  lane,
  selectedId,
  onSelect,
}: {
  lane: ArcLane;
  selectedId: string | null;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const { arc, bars, counts, state, claimants, queued } = lane;
  const [expanded, setExpanded] = useState(false);
  const hasQueue = queued.length > 0;
  const selected = arc.id === selectedId;
  // Named sessions, deduped — one session claiming three of an arc's units is one session on it, not
  // three. Shown as the chip's tooltip so `claimed` says WHO without widening the lane (ADR-0351 D2).
  const sessions = [...new Set(claimants.map((c) => c.sessionId))];
  return (
    <div className="arc-lane-row" data-testid={`arc-lane-row:${arc.id}`}>
      <div className="arc-lane-line">
        {hasQueue && (
          <button
            type="button"
            className="arc-lane-caret"
            data-testid={`arc-lane-caret:${arc.id}`}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${queued.length} arc${queued.length === 1 ? '' : 's'} queued behind ${arc.title || arc.id}`}
            onClick={() => setExpanded((was) => !was)}
          >
            <span aria-hidden="true">{expanded ? '▾' : '▸'}</span> {queued.length}
          </button>
        )}
        <button
          type="button"
          className={`arc-lane${selected ? ' on' : ''}`}
          data-testid={`arc-lane:${arc.id}`}
          data-arc-state={state}
          aria-pressed={selected}
          onClick={() => onSelect(arc.id)}
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
            {/* Real arc titles run past the column, so the ellipsis needs a hover fallback — the
                panel shows the full title, but a reader scanning the list should not have to click
                to read one. */}
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
            {/* Counts, never a ratio (ADR-0314 D2): an arc has no denominator, so the surface says
                how many units it KNOWS about and never asserts that this is all of them. */}
            <span className="arc-lane-counts muted small">
              {counts.landed} landed · {counts.queued} queued
            </span>
          </span>
        </button>
      </div>
      {/* THE QUEUE, collapsed by default — a caret only where there is something behind it, and the
          disclosure only opens the WIDTH+INDENT cost when the owner asks for it. Each nested row is
          a full ArcLaneRow, recursively, so a queued arc that itself gates others keeps its own
          caret (depth is permitted). */}
      {expanded && hasQueue && (
        <div className="arc-lane-queued" data-testid={`arc-lane-queued:${arc.id}`}>
          {queued.map((child) => (
            <ArcLaneRow key={child.arc.id} lane={child} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
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
 * The briefing panel (D3, cut down by `arc-queue-and-question-legibility-arc` inc-01) — the space
 * the deleted axis returned, and where the owner acts.
 *
 * CUT TO TWO THINGS (inc-01), owner-directed: "description of arc and then open questions, dont see
 * any more needed here". The proposals-to-review list and the increment work-list (what's queued /
 * where it's up to) are GONE from this panel — not pruned from the corpus: an agent picking up the
 * arc still reads those rows through the increment tier itself
 * (`storytree library artifact <increment-id> --pg`), which this panel never touches. Read-only:
 * there is no reply box here by decision (ADR-0267 D6 / ADR-0314 D9), and answering happens by the
 * owner prompting an agent harness.
 *
 * A QUESTION LEAVES THE OPEN LIST BY BEING ANSWERED, NOT BY DISAPPEARING (ADR-0434 D3). Once it is
 * settled it moves to its own quiet block, under the answer that ended it. Both blocks live in
 * `arcBriefing`; neither is derived here.
 *
 * A QUESTION OPENS WITH THE QUESTION (inc-02): the flat list's "Open" button expands one question in
 * place — statement first and largest, then stakes, the diagram or an explicit "none stored" line,
 * options as FOR/AGAINST cards, the recommendation marked non-binding, and `analogy`/`context`
 * behind folds that state their own word cost — and the rest of the panel folds away while it is
 * open. `OpenQuestionDetail` owns that reading; nothing here is deleted from the stored document,
 * only reordered.
 *
 * IT READS ITS OWN ARC. The lane list carries only what a lane DRAWS, so everything below this
 * panel's header — the questions and their `stakes`, the arc's `intent` — arrives on a per-selection
 * `GET /api/arcs/<id>` (`useArcRollup`). That gives the panel three states the lane strip does not
 * have, and each renders as a different fact rather than collapsing into a plausible-looking empty
 * briefing: still reading, did not answer, and here it is. A question's OWN authoring fields
 * (`statement`/`context`/`options`/`analogy`/`diagram`/`recommendation`) do NOT arrive here — see
 * `assets` below and the comment on {@link ArcSurfaceProps.assets}.
 */
function ArcBriefingPanel({
  lane,
  detail,
  onOpen,
  assets,
}: {
  lane: ArcLane | null;
  /**
   * The selected arc's WHOLE rollup, read per selection off `GET /api/arcs/<id>` — `null` when no
   * lane is selected, `undefined` while the read is in flight, `ARC_DETAIL_UNREACHABLE` when it did
   * not answer. Everything below the header comes from here; `lane` supplies only the identity.
   */
  detail: ArcRollupState;
  onOpen?: ((selection: SearchResult) => void) | undefined;
  /** The Library corpus — see {@link ArcSurfaceProps.assets}. */
  assets: readonly GuidanceAsset[];
}): React.JSX.Element {
  // WHICH QUESTION (IF ANY) IS EXPANDED — a PURE derivation against `briefing.waiting` below, the
  // same `picked`/`selectedId` idiom `ArcSurface` uses for its own lane pick: switching arcs (or a
  // question settling elsewhere) drops a stale id on its own, with no effect needed to notice and
  // clear it. Declared before every early return below — hooks cannot follow a conditional one.
  const [openedId, setOpenedId] = useState<string | null>(null);

  if (lane === null) {
    return (
      <aside className="arc-briefing" data-testid="arc-briefing" aria-label="arc briefing">
        <p className="muted small">Pick an arc to read its briefing.</p>
      </aside>
    );
  }

  // THE HEADER RENDERS FROM THE LANE, THE BODY FROM THE DETAIL. The lane summary already carries the
  // arc's identity, so the title and the deep-link are up the moment the owner clicks and do not
  // flicker through a placeholder while the rollup arrives. Everything the panel exists to show —
  // the questions, the intent — is prose that lives only on the per-id read.
  const summary: ArcRollupSummary = lane.arc;
  const header = (
    <header className="arc-briefing-header">
      <h4 className="arc-briefing-title">{summary.title || summary.id}</h4>
      <a
        className="arc-briefing-open"
        href={assetHref(summary.id)}
        onClick={openOnClick(onOpen, {
          id: summary.id,
          title: summary.title || summary.id,
          category: 'arc',
          source: 'asset',
        })}
      >
        open the arc ↗
      </a>
    </header>
  );

  if (detail === undefined || detail === null) {
    /* STILL READING. A moving part rather than a line of prose, for the reason the lane list's own
       reading state carries one (#1436): this read runs the same join on the same 30 s budget with
       the same three attempts, so it can legitimately last, and a static sentence held that long
       reads as a surface that has given up. Bounded by construction — the retry is finite, so this
       always resolves to a briefing or to the note below. `detail === null` cannot happen with a
       lane selected (the hook returns `null` only for a `null` id) and is folded in here rather than
       given a state of its own: an impossible case must not be able to render as a CONFIDENT empty
       briefing. */
    return (
      <aside className="arc-briefing" data-testid="arc-briefing" aria-label="arc briefing">
        {header}
        <p
          className="muted small arc-briefing-reading"
          data-testid="arc-briefing-reading"
          role="status"
          aria-live="polite"
        >
          <span className="spinner" aria-hidden="true" />
          Reading this arc&apos;s briefing…
        </p>
      </aside>
    );
  }

  if (detail === ARC_DETAIL_UNREACHABLE) {
    /* THE READ DID NOT ANSWER — every attempt lost, or the arc is gone from under the poll. Said
       plainly rather than papered over with the summary's own fields: the lane knows how many
       questions wait on this arc, and rendering that count with no questions under it would be a
       briefing that looks complete and is not. What the owner can still do is open the artifact,
       which the header above already offers. */
    return (
      <aside className="arc-briefing" data-testid="arc-briefing" aria-label="arc briefing">
        {header}
        <p className="muted small arc-briefing-note" data-testid="arc-briefing-unreachable">
          This arc&apos;s briefing didn&apos;t answer — open the arc above to read it.
        </p>
      </aside>
    );
  }

  const briefing = arcBriefing(detail);
  const { arc } = briefing;
  const openedQuestion = briefing.waiting.find((q) => q.id === openedId) ?? null;

  return (
    <aside className="arc-briefing" data-testid="arc-briefing" aria-label="arc briefing">
      {header}

      {/* THE DESCRIPTION RENDERS FIRST, ALWAYS (inc-01) — the owner's own words closing the design
          conversation. Same lead/clamp treatment `arc.intent` always had; only its position moved,
          from third block to first. */}
      <section className="arc-briefing-about" aria-label="what this arc is about">
        <h5>What it is about</h5>
        <p className="arc-briefing-intent">{briefingLead(arc.intent || arc.description)}</p>
      </section>

      {/* OPEN QUESTIONS — the second and LAST section (inc-01). A flat list, NOT nested under a
          "waiting for you" heading that also held a "Proposals to review" subsection — that nesting
          is exactly what the owner asked to remove ("I never read the proposals so we should drop
          that part of the surface"). Each row carries its reading cost (word count over the seven
          authoring fields + a "no diagram" flag) and a button that expands it in place (inc-02). */}
      <section className="arc-briefing-questions" aria-label="open questions">
        <h5>Open questions</h5>
        {briefing.waiting.length === 0 ? (
          <p className="muted small" data-testid="arc-briefing-nothing-waiting">
            Nothing is waiting on you here.
          </p>
        ) : openedQuestion === null ? (
          <ul className="arc-question-list" data-testid="arc-briefing-questions">
            {briefing.waiting.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                fields={questionFields(assets, q.id)}
                onOpen={onOpen}
                onExpand={() => setOpenedId(q.id)}
              />
            ))}
          </ul>
        ) : (
          /* THE BACKGROUND FOLDS AWAY (inc-02): opening a question replaces the flat list with its
             own full reading, statement first — never a second surface, never a navigation away. */
          <OpenQuestionDetail
            question={openedQuestion}
            fields={questionFields(assets, openedQuestion.id)}
            onBack={() => setOpenedId(null)}
          />
        )}
      </section>

      {/* `blocked` is named and left UNLIT rather than omitted — an owner who was told the surface
          distinguishes blocked must be able to see that it currently cannot, instead of reading its
          absence as "nothing is blocked" (ADR-0314 D4, untouched by this arc). */}
      <p className="arc-briefing-blocked-note muted small" data-testid="arc-blocked-note">
        {BLOCKED_UNAVAILABLE_NOTE}
      </p>

      {/* SETTLED — an answered question MOVES here, it does not vanish (ADR-0434 D3). Neither
          increment of this arc named the settled block for removal — only "the proposals section"
          and "the open-work list" (the INCREMENT listings below, now gone) — and dropping it would
          silently regress the exact invisibility ADR-0434 exists to prevent, so it stays unchanged.
          ABSENT WHEN EMPTY, never an empty heading, matching `storytree arc show`. */}
      {briefing.settled.length > 0 && (
        <section className="arc-briefing-settled" aria-label="settled questions">
          <h5>Settled</h5>
          <ul className="arc-question-list" data-testid="arc-briefing-settled">
            {briefing.settled.map((q) => (
              <li
                key={q.id}
                className="arc-question arc-question-settled"
                data-testid={`arc-settled-question:${q.id}`}
              >
                <a
                  className="arc-question-title"
                  href={assetHref(q.id)}
                  onClick={openOnClick(onOpen, { id: q.id, title: q.title || q.id, category: 'open-question', source: 'asset' })}
                >
                  {q.title || q.id}
                </a>
                {q.settledAt && (
                  <span className="muted small arc-question-settled-when">
                    settled {q.settledAt.slice(0, 10)}
                  </span>
                )}
                {/* The ANSWER, through the same strip-and-clamp the stakes above gets: it is
                    authored markdown in the store and the panel renders text, so the markers would
                    show through as literal characters. Clamped harder than an open question's
                    stakes — the full answer is one click away on the title. */}
                {q.answer && (
                  <p className="arc-question-answer arc-briefing-clamp-hard">
                    {briefingLead(q.answer)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

/**
 * One OPEN question row (inc-01): the same read-only deep-link title every other row on this surface
 * uses, its reading cost (word count over the seven authoring fields + a "no diagram" flag, computed
 * off the Library corpus — see {@link ArcSurfaceProps.assets}), and a button that expands it into
 * its own full reading (`OpenQuestionDetail`, inc-02) — so the owner can see which questions are
 * cheap to answer before opening one.
 */
function QuestionRow({
  question,
  fields,
  onOpen,
  onExpand,
}: {
  question: ArcRollupQuestion;
  fields: Record<string, string>;
  onOpen?: ((selection: SearchResult) => void) | undefined;
  onExpand: () => void;
}): React.JSX.Element {
  const stats = questionRowStats(fields);
  return (
    <li className="arc-question" data-testid={`arc-question:${question.id}`}>
      <a
        className="arc-question-title"
        href={assetHref(question.id)}
        onClick={openOnClick(onOpen, {
          id: question.id,
          title: question.title || question.id,
          category: 'open-question',
          source: 'asset',
        })}
      >
        {question.title || question.id}
      </a>
      <span className="arc-question-meta muted small" data-testid={`arc-question-meta:${question.id}`}>
        {stats.wordTotal} words
        {stats.noDiagram && (
          <span data-testid={`arc-question-no-diagram:${question.id}`}> · no diagram</span>
        )}
      </span>
      <button
        type="button"
        className="arc-question-open-btn"
        data-testid={`arc-question-open:${question.id}`}
        onClick={onExpand}
      >
        Open ↗
      </button>
    </li>
  );
}

/**
 * A question's OWN full reading (inc-02, `arc-queue-and-question-legibility-arc`): the statement
 * first and largest, one stakes band, the diagram or an explicit "none stored" line, options as a
 * scannable FOR/AGAINST comparison, the recommendation marked non-binding, and `analogy`/`context`
 * behind folds that state their own word cost — closing with the word-budget readout (stored / above
 * the fold / folded). NOTHING IS DELETED from the stored document; only the reading order changes.
 *
 * READ-ONLY (ADR-0267 D6 / ADR-0314 D9): no option carries an action of its own. A question is
 * settled by the session that records the decision (`storytree question settle <id> --answer …
 * --pg`), never from this panel.
 */
function OpenQuestionDetail({
  question,
  fields,
  onBack,
}: {
  question: ArcRollupQuestion;
  fields: Record<string, string>;
  onBack: () => void;
}): React.JSX.Element {
  const budget = questionWordBudget(fields);
  const statement = fields['statement'] || question.title || question.id;
  const stakes = fields['stakes'] || question.stakes;
  const diagram = fields['diagram'] ?? '';
  const options = parseOptionCards(fields['options']);
  const recommendation = fields['recommendation'] ?? '';
  const analogy = fields['analogy'] ?? '';
  const context = fields['context'] ?? '';

  return (
    <div className="arc-question-detail" data-testid={`arc-question-detail:${question.id}`}>
      <button type="button" className="arc-question-back" onClick={onBack}>
        ← back to questions
      </button>

      {/* STATEMENT FIRST AND LARGEST — the question itself, before any of its own archaeology. */}
      <p className="arc-question-detail-statement" data-testid="arc-question-detail-statement">
        {briefingLead(statement)}
      </p>

      {/* ONE STAKES BAND — what breaks while this sits unanswered. */}
      {stakes && (
        <p className="arc-question-detail-stakes" data-testid="arc-question-detail-stakes">
          {briefingLead(stakes)}
        </p>
      )}

      {/* THE DIAGRAM, OR AN EXPLICIT LINE SAYING NONE IS STORED — never a silent omission; a missing
          picture is a fact about the question, not an empty div. */}
      <div className="arc-question-detail-diagram" data-testid="arc-question-detail-diagram">
        {diagram.trim() === '' ? (
          <p className="muted small" data-testid="arc-question-detail-no-diagram">
            No diagram stored for this question.
          </p>
        ) : (
          <pre>{diagram}</pre>
        )}
      </div>

      {/* OPTIONS AS A SCANNABLE COMPARISON — one card per option with its FOR and its AGAINST split
          out, parsed from the inline `FOR:`/`AGAINST:` convention every live row already writes. */}
      {options.length > 0 && (
        <ul className="arc-question-detail-options" data-testid="arc-question-detail-options">
          {options.map((option, index) => (
            <li key={index} className="arc-option-card">
              <p className="arc-option-summary">{briefingLead(option.summary)}</p>
              {option.forText && <p className="arc-option-for">FOR: {briefingLead(option.forText)}</p>}
              {option.againstText && (
                <p className="arc-option-against">AGAINST: {briefingLead(option.againstText)}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* THE RECOMMENDATION, VISIBLY MARKED NON-BINDING. */}
      {recommendation && (
        <p
          className="arc-question-detail-recommendation"
          data-testid="arc-question-detail-recommendation"
        >
          <strong>Recommendation (non-binding):</strong> {briefingLead(recommendation)}
        </p>
      )}

      {/* ANALOGY, THEN CONTEXT — behind folds that STATE their word cost, so the reader can see what
          they are choosing not to read. Nothing is deleted from the stored document; only the
          reading order changes. `DetailDisclosure` is reused, not re-implemented. */}
      <DetailDisclosure label={`Analogy (${wordCount(analogy)} words)`} className="arc-question-fold">
        <p>{briefingLead(analogy)}</p>
      </DetailDisclosure>
      <DetailDisclosure label={`Context (${wordCount(context)} words)`} className="arc-question-fold">
        <p>{briefingLead(context)}</p>
      </DetailDisclosure>

      {/* THE WORD-BUDGET READOUT — a small honesty instrument: a question bloated above the fold is
          visible as a number, not a feeling. */}
      <p className="muted small arc-question-word-budget" data-testid="arc-question-word-budget">
        {budget.total} words stored · {budget.aboveFold} above the fold · {budget.folded} folded
      </p>
    </div>
  );
}
