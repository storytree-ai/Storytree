// @vitest-environment jsdom
//
// THE ARC SURFACE (ADR-0267 D1 + ADR-0314) — momentum lanes, unit bars, and the briefing panel.
//
// What this holds the surface to, decision by decision:
//   D1 — lanes, and NO shared date axis (the mock's 6-week axis is deleted; nothing here draws a
//        date scale, a today-line, or a tick row).
//   D2 — one bar per increment, green landed / grey queued, and no percentage anywhere.
//   D3 — the right-hand briefing panel shows what waits on the owner and links THROUGH to the
//        Library artifact holding the question (`#/asset/<id>`), not merely to a summary.
//   D4 — `blocked` is named and left unlit, with the reason visible: absence must not read as
//        "nothing is blocked".
//   D7 — the floor-health reading is NOT here (ADR-0349 moved it to the map lamp); this surface
//        neither renders it nor accepts it, and the fence against re-mounting is asserted.
//   D9 — READ-ONLY: no comment box, no answer field, no write affordance of any kind.
//
// Plus the honest-absence contract, which is FOUR facts and not two. `arcs: null` (no document
// store) and `arcs: []` (a store with no arcs) are the distinction the endpoint itself insists on;
// still-loading and the read-never-answered are the pair this surface got wrong on its first
// landing (#1191), where a 404 from the desktop's local backend left it rendering "Reading arcs…"
// forever. A surface built to restore context can blur none of them.
//
// No backend seam (no `api`, no fetch, no socket, no DB) — the lane rows are handed in as props and
// the briefing panel's per-arc read arrives as the `readArc` FUNCTION prop, served here out of the
// same fixtures; no agent / drive / model import (the modelPathBoundary.test.ts wall stays green).
// Because that read is a promise, every briefing assertion sits behind `settle()`. The lane
// silhouette, the bar geometry and the panel's proportions are the arc's operator-attested LOOK leg
// (ADR-0070) — deliberately not asserted here.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { ArcSurface } from './ArcSurface';
import { ARCS_UNREACHABLE, type ArcRollupsState } from '../lib/arcRollups';
import type {
  ArcRollup,
  ArcRollupIncrement,
  ArcRollupQuestion,
  ArcRollupSummary,
  GuidanceAsset,
  SessionClaimGroup,
} from '../types';

afterEach(cleanup);

const NOW = new Date('2026-08-06T00:00:00Z');

/**
 * THE FIXTURE REGISTRY — the two widths of one arc, kept in step by construction.
 *
 * `GET /api/arcs` serves `ArcRollupSummary` rows (what a LANE draws) and `GET /api/arcs/<id>` serves
 * the whole `ArcRollup` (what the BRIEFING PANEL draws). `arc()` below builds the rollup, files it
 * here, and hands back the summary — so a fixture is declared once and both halves of the surface
 * see the same arc, exactly as the server's one join guarantees they do in production.
 */
const ROLLUPS = new Map<string, ArcRollup>();

/** The panel's per-selection read, served out of {@link ROLLUPS}. Rejects an unknown id like a 404. */
const readArc = async (id: string): Promise<ArcRollup> => {
  const found = ROLLUPS.get(id);
  if (found === undefined) throw new Error(`no arc "${id}"`);
  return found;
};

/**
 * Let the briefing panel's per-selection read land.
 *
 * The panel fetches the selected arc rather than reading it out of the lane list (the list carries
 * only what a lane draws), so EVERY assertion about briefing content is downstream of a promise —
 * including after a click that moves the selection. This waits for the panel's reading state to
 * clear; with no lane selected there is no read and it returns immediately.
 */
async function settle(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByTestId('arc-briefing-reading')).toBeNull();
  });
}

function increment(over: Partial<ArcRollupIncrement> & { id: string }): ArcRollupIncrement {
  return { title: `title of ${over.id}`, objective: '', status: 'proposal', ...over };
}
function landed(id: string, date: string): ArcRollupIncrement {
  return increment({ id, status: 'closed', outcome: { date, pr: '#1186' } });
}
function parked(id: string, at: string, status = 'proposal'): ArcRollupIncrement {
  return increment({ id, status, parked: at });
}
function question(id: string): ArcRollupQuestion {
  return {
    id,
    title: `Question ${id}`,
    description: `description ${id}`,
    stakes: `stakes of ${id}`,
    // ADR-0434 D1 — the helper mints an OPEN question, which is what every test using it means.
    // A settled one is spelled out at its own call site, so a fixture can never read as "waiting"
    // by omission.
    lifecycle: 'open',
  };
}
/**
 * A question that ENDED by recording its answer (ADR-0434 D2) — every field spelled out here rather
 * than defaulted in {@link question}, so a fixture can never become settled by accident either.
 */
function settledQuestion(id: string, answer = `answer of ${id}`): ArcRollupQuestion {
  return { ...question(id), lifecycle: 'settled', answer, settledAt: '2026-08-24T09:30:00Z' };
}

/**
 * A question's structured `open-question` asset (inc-01/inc-02) — the Library corpus row
 * `ArcSurfaceProps.assets` carries, and the ONLY source for `statement` / `context` / `options` /
 * `analogy` / `diagram` / `recommendation`: {@link ArcRollupQuestion} never carries them. Every field
 * defaults to `''` (absent), matching how `GuidanceAsset.fields` behaves on a real doc that omits an
 * optional section — a test wanting a specific field spells it out.
 */
function questionAsset(id: string, fields: Partial<Record<string, string>> = {}): GuidanceAsset {
  return {
    id,
    category: 'open-question',
    title: `Question ${id}`,
    description: `description ${id}`,
    body: '',
    fields: {
      stakes: '',
      statement: '',
      context: '',
      options: '',
      analogy: '',
      diagram: '',
      recommendation: '',
      ...fields,
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}
/**
 * One arc fixture — declared as a WHOLE rollup, handed back as the LANE ROW the list wire carries.
 *
 * The surface reads its arcs at two widths now: `arcs` is `ArcRollupSummary[]` off `GET /api/arcs`,
 * and the briefing panel reads the whole rollup for its selection off `GET /api/arcs/<id>`. Every
 * fixture is registered below so `readArc` can serve the second width from the same declaration —
 * a test that widened one and not the other would be measuring a state the server cannot produce.
 */
function arc(over: Partial<ArcRollup> & { id: string }): ArcRollupSummary {
  const rollup: ArcRollup = {
    title: `The ${over.id}`,
    description: '',
    lifecycle: 'active',
    intent: `intent of ${over.id}`,
    endState: `end state of ${over.id}`,
    increments: [],
    adrs: [],
    stories: [],
    // ADR-0306 D4's second story path — the STORE-resident one, kept beside `stories` and never
    // merged into it. Empty by default here; a fixture that wants one overrides it.
    citedStories: [],
    questions: [],
    waiting: false,
    ...over,
  };
  ROLLUPS.set(rollup.id, rollup);
  // The SAME narrowing the server's `summariseArcRollup` performs (packages/arc/src/arc-rollup.ts):
  // identity, lifecycle, the question COUNT, and one lane-shaped row per increment.
  //
  // The count is OPEN questions, which is what the server counts since ADR-0434 D3 — counting the
  // whole array here would let a fixture carrying a settled question light a lane the server would
  // have left quiet, i.e. measure a state the wire cannot produce.
  const openQuestions = rollup.questions.filter((q) => q.lifecycle === 'open');
  return {
    id: rollup.id,
    title: rollup.title,
    lifecycle: rollup.lifecycle,
    waiting: openQuestions.length > 0,
    openQuestions: openQuestions.length,
    increments: rollup.increments.map((inc) => {
      const row: ArcRollupSummary['increments'][number] = {
        id: inc.id,
        title: inc.title,
        status: inc.status,
      };
      if (inc.parked !== undefined) row.parked = inc.parked;
      if (inc.cites !== undefined) row.cites = inc.cites;
      if (typeof inc.outcome?.date === 'string') row.landedOn = inc.outcome.date;
      return row;
    }),
  };
}

/** The worked example ADR-0314's own D8 correction names: two green bars and three grey ones. */
const ORIENTATION_ARC = arc({
  id: 'arc-orientation-surface-arc',
  title: 'Arcs as the map’s primary orientation surface',
  increments: [
    parked('factory-floor-health-signal', '2026-08-04'),
    parked('arc-surface-lanes-and-briefing-panel', '2026-08-05'),
    parked('a-third-parked-thing', '2026-08-05'),
    landed('arc-orientation-surface-arc-inc-01', '2026-07-29'),
    landed('escalation-authors-an-open-question-briefing', '2026-08-06'),
  ],
});

describe('ArcSurface — the surface names itself', () => {
  it('renders its own heading, so the floor-health label is not the topmost text', async () => {
    // The band answers a NARROWER question than the surface (is the floor healthy, versus where is
    // every initiative up to). With no heading of its own, the band's `factory floor` label was the
    // first text in the drawer and read as the whole lens's title.
    render(<ArcSurface readArc={readArc} arcs={[ORIENTATION_ARC]} now={NOW} />);
    await settle();
    expect(screen.getByRole('heading', { name: 'Arc Surface' })).not.toBeNull();
  });

  it('puts the heading first, above the lanes', async () => {
    render(<ArcSurface readArc={readArc} arcs={[ORIENTATION_ARC]} now={NOW} />);
    await settle();
    const surface = screen.getByTestId('arc-surface');
    const heading = screen.getByRole('heading', { name: 'Arc Surface' });
    const lanes = screen.getByTestId('arc-lanes');
    expect(heading.compareDocumentPosition(lanes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(surface.contains(heading)).toBe(true);
  });
});

describe('ArcSurface — momentum lanes, no date axis (ADR-0314 D1)', () => {
  it('draws one lane per active arc', async () => {
    render(<ArcSurface readArc={readArc} arcs={[ORIENTATION_ARC, arc({ id: 'other-arc' })]} now={NOW} />);
    await settle();
    expect(screen.getByTestId('arc-lane:arc-orientation-surface-arc')).not.toBeNull();
    expect(screen.getByTestId('arc-lane:other-arc')).not.toBeNull();
  });

  it('draws NO shared date axis — the mock’s 6-week scale and today-line are deleted', async () => {
    // D1 deleted the axis because it spent ~60% of its width on empty space at the measured
    // recency distribution. Re-introducing it is the single most likely way to "reuse the mock".
    render(<ArcSurface readArc={readArc} arcs={[ORIENTATION_ARC]} now={NOW} />);
    await settle();
    const surface = screen.getByTestId('arc-surface');
    expect(surface.querySelector('.laneaxis')).toBeNull();
    expect(surface.querySelector('.now')).toBeNull();
    expect(surface.textContent ?? '').not.toMatch(/\d+\s*(weeks?|wks?) ago/i);
  });
});

describe('ArcSurface — bars are units, not time (ADR-0314 D2)', () => {
  it('draws one bar per increment, green for landed and grey for everything else', async () => {
    render(<ArcSurface readArc={readArc} arcs={[ORIENTATION_ARC]} now={NOW} />);
    await settle();
    const lane = screen.getByTestId('arc-lane:arc-orientation-surface-arc');
    const bars = lane.querySelectorAll('.arc-bar');
    expect(bars).toHaveLength(5);
    expect(lane.querySelectorAll('[data-bar-tone="landed"]')).toHaveLength(2);
    expect(lane.querySelectorAll('[data-bar-tone="queued"]')).toHaveLength(3);
  });

  it('renders counts and NO percentage — this is not a progress bar', async () => {
    // ADR-0314 D2: a percentage claims a denominator and an arc has none, because `endState` is
    // prose rather than a checklist. 2 of 5 known units is not "40% done".
    render(<ArcSurface readArc={readArc} arcs={[ORIENTATION_ARC]} now={NOW} />);
    await settle();
    const lane = screen.getByTestId('arc-lane:arc-orientation-surface-arc');
    expect(lane.textContent).toContain('2 landed');
    expect(lane.textContent).toContain('3 queued');
    // The lane is where a progress bar would live, so it carries no ratio of any shape...
    expect(lane.textContent ?? '').not.toMatch(/%|\bof 5\b|\d\s*\/\s*\d/);
    // ...and no percentage appears anywhere on the surface either.
    expect(screen.getByTestId('arc-surface').textContent ?? '').not.toContain('%');
  });

  it('parked work is visible as grey bars — it is no longer "nothing queued"', async () => {
    // ADR-0314 D2 closes Context finding 2: every mock rendered "next" as ready-plan / proposed-ADR
    // / nothing-queued, and so answered "nothing queued" for arcs carrying a dozen parked items.
    render(<ArcSurface readArc={readArc} arcs={[arc({ id: 'parked-only', increments: [parked('p1', '2026-08-01'), parked('p2', '2026-08-02')] })]} now={NOW} />);
    await settle();
    const lane = screen.getByTestId('arc-lane:parked-only');
    expect(lane.querySelectorAll('[data-bar-tone="queued"]')).toHaveLength(2);
    expect(lane.textContent).toContain('2 queued');
  });
});

describe('ArcSurface — the briefing panel is where the owner acts (ADR-0314 D3)', () => {
  const WAITING_ARC = arc({
    id: 'waiting-arc',
    questions: [question('oq-first'), question('oq-second')],
    increments: [landed('done-1', '2026-08-01'), parked('next-1', '2026-08-05')],
  });

  it('opens on the arc that has something waiting on the owner', async () => {
    render(<ArcSurface readArc={readArc} arcs={[arc({ id: 'busy-arc', increments: [landed('c', '2026-08-05')] }), WAITING_ARC]} now={NOW} />);
    await settle();
    const panel = screen.getByTestId('arc-briefing');
    expect(within(panel).getByText('The waiting-arc')).not.toBeNull();
  });

  it('lists each waiting question with a real link through to its Library artifact', async () => {
    // D3: the panel carries click-through into the ACTUAL artifact holding the question, so the
    // owner reaches the briefing, diagrams and mocks needed to answer it — `#/asset/<id>` already
    // routes, so this is deep-linking rather than a new surface. inc-01 moved the stakes PREVIEW off
    // this row (see the reading-cost describe block below); the title link survives unchanged.
    render(<ArcSurface readArc={readArc} arcs={[WAITING_ARC]} now={NOW} />);
    await settle();
    const first = screen.getByTestId('arc-question:oq-first');
    const link = within(first).getByRole('link', { name: 'Question oq-first' });
    expect(link.getAttribute('href')).toBe('#/asset/oq-first');
  });

  it('says plainly when nothing waits — an empty panel would read as an unread one', async () => {
    render(<ArcSurface readArc={readArc} arcs={[arc({ id: 'calm-arc', increments: [landed('c', '2026-08-05')] })]} now={NOW} />);
    await settle();
    expect(screen.getByTestId('arc-briefing-nothing-waiting')).not.toBeNull();
  });

  it('answers what it is about, and opens the arc itself', async () => {
    // inc-01 cut the panel to two things — the description and the open questions — so this no
    // longer also answers "what comes next" / "where it is up to" (see the "cut to two things"
    // describe block below for the fence on their removal).
    render(
      <ArcSurface
        readArc={readArc}
        arcs={[
          arc({
            id: 'waiting-arc',
            questions: [question('oq-first'), question('oq-second')],
            increments: [landed('done-1', '2026-08-01'), parked('next-1', '2026-08-05', 'ready')],
          }),
        ]}
        now={NOW}
      />,
    );
    await settle();
    const panel = screen.getByTestId('arc-briefing');
    expect(panel.textContent).toContain('intent of waiting-arc');
    expect(within(panel).getByRole('link', { name: /open the arc/ }).getAttribute('href')).toBe(
      '#/asset/waiting-arc',
    );
  });

  it('clicking a lane moves the panel to that arc', async () => {
    render(<ArcSurface readArc={readArc} arcs={[WAITING_ARC, arc({ id: 'other-arc', increments: [landed('c', '2026-08-05')] })]} now={NOW} />);
    await settle();
    fireEvent.click(screen.getByTestId('arc-lane:other-arc'));
    await settle();
    expect(within(screen.getByTestId('arc-briefing')).getByText('The other-arc')).not.toBeNull();
  });
});

// An answered question used to VANISH off this panel, because the only way to end one was to delete
// it — taking the answer with it (ADR-0434). The lifecycle and the CLI's `## Settled questions`
// landed first; `arcBriefing.settled` was computed here and read by nothing, so the owner's own
// surface was the last place still showing the disappearance.
describe('ArcSurface — an answered question MOVES to Settled, it does not vanish (ADR-0434 D3)', () => {
  const SETTLED_ARC = arc({
    id: 'settled-arc',
    questions: [question('oq-still-open'), settledQuestion('oq-answered')],
    increments: [landed('done-1', '2026-08-01')],
  });

  it('briefs the settled question under its answer, and keeps it out of "waiting on you"', async () => {
    render(<ArcSurface readArc={readArc} arcs={[SETTLED_ARC]} now={NOW} />);
    await settle();
    const waiting = screen.getByTestId('arc-briefing-questions');
    const settledBlock = screen.getByTestId('arc-briefing-settled');
    // The open one waits and the answered one does not — the whole point of the split.
    expect(within(waiting).queryByTestId('arc-question:oq-still-open')).not.toBeNull();
    expect(within(waiting).queryByTestId('arc-question:oq-answered')).toBeNull();
    // …and the answer is ON the panel, which is what makes this a move rather than a deletion.
    const row = within(settledBlock).getByTestId('arc-settled-question:oq-answered');
    expect(row.textContent).toContain('answer of oq-answered');
    expect(row.textContent).toContain('settled 2026-08-24');
  });

  it('links the settled question through to its artifact, like a waiting one does', async () => {
    // The answer on the panel is a clamped LEAD; the artifact carries the whole settlement, the
    // deciding ADR reference included. Losing the click-through here would make the fold a loss.
    render(<ArcSurface readArc={readArc} arcs={[SETTLED_ARC]} now={NOW} />);
    await settle();
    const row = screen.getByTestId('arc-settled-question:oq-answered');
    expect(within(row).getByRole('link', { name: 'Question oq-answered' }).getAttribute('href')).toBe(
      '#/asset/oq-answered',
    );
  });

  it('strips and clamps the answer, the same treatment the stakes and the intent get', async () => {
    // An answer is authored markdown in the store (`question settle --answer @file` takes prose),
    // and this panel renders TEXT — unstripped, the markers show through as literal characters,
    // and unclamped one long answer would push the blocks below it off the panel.
    const answered = settledQuestion('oq-markers', '**Retire it.** Run `storytree question settle`.');
    render(
      <ArcSurface readArc={readArc} arcs={[arc({ id: 'markers-arc', questions: [answered] })]} now={NOW} />,
    );
    await settle();
    const row = screen.getByTestId('arc-settled-question:oq-markers');
    const answer = row.querySelector('.arc-question-answer');
    expect(answer?.textContent).toBe('Retire it. Run storytree question settle.');
    expect(answer?.className).toContain('arc-briefing-clamp-hard');
  });

  it('renders NO Settled section at all on an arc that has settled nothing', async () => {
    // Empty is ABSENT, not an empty heading — what `storytree arc show` does, and the two surfaces
    // must not disagree about it. Most arcs have settled nothing; a standing empty band would cost
    // every one of them a row of the panel to say so.
    render(<ArcSurface readArc={readArc} arcs={[arc({ id: 'no-settlements', questions: [question('oq-1')] })]} now={NOW} />);
    await settle();
    expect(screen.queryByTestId('arc-briefing-settled')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Settled' })).toBeNull();
  });

  it('does not make the panel claim something is waiting when the ONLY question is settled', async () => {
    // The false wait this arc exists to end, on the surface the owner actually looks at: an arc
    // whose one question has been answered owes him nothing, and must say so while still showing
    // the answer.
    render(<ArcSurface readArc={readArc} arcs={[arc({ id: 'quiet-arc', questions: [settledQuestion('oq-answered')] })]} now={NOW} />);
    await settle();
    expect(screen.getByTestId('arc-briefing-nothing-waiting')).not.toBeNull();
    expect(screen.queryByTestId('arc-briefing-questions')).toBeNull();
    expect(screen.getByTestId('arc-settled-question:oq-answered')).not.toBeNull();
    // The LANE stays quiet too (the fence in lib/arcSurface.test.ts, seen from the rendered strip).
    expect(screen.getByTestId('arc-lane:quiet-arc').getAttribute('data-arc-state')).toBe('quiet');
  });

  it('sits BELOW the open-questions block — the move is legible as a move', async () => {
    // Adjacency is the argument for the position: a question the owner just answered reads as
    // having moved one section down. The same rows in an archive at the foot of the panel would
    // read as gone, which is the outcome this increment exists to remove.
    //
    // inc-01 moved the description to render FIRST (it used to sit under "what it is about", third
    // block down), so the order is now: about → open questions → settled. Settled still follows the
    // block it moved out of, which is the property this test holds — only the anchor changed.
    render(<ArcSurface readArc={readArc} arcs={[SETTLED_ARC]} now={NOW} />);
    await settle();
    const about = screen.getByLabelText('what this arc is about');
    const waiting = screen.getByLabelText('open questions');
    const settledBlock = screen.getByLabelText('settled questions');
    expect(about.compareDocumentPosition(waiting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(waiting.compareDocumentPosition(settledBlock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('ArcSurface — an open question’s markdown is stripped in its own full reading (inc-02)', () => {
  // Found by looking at the shipped panel against the live store: on `uat-journey-surgery-arc` the
  // waiting block rendered ~1500 characters of RAW markdown — literal ** and backticks, bullet
  // markers mid-line — which filled the drawer and pushed "What it is about" off the panel. The arc's
  // own `intent` was already stripped for precisely this reason; a question's `stakes` is authored
  // to the same cold-answerable bar (ADR-0314 D5) and needs the same treatment wherever it renders.
  // inc-01 moved the row itself off showing `stakes` at all (word count + no-diagram replace it, see
  // "a question row shows its reading cost" below); the full text now renders only in the OPENED
  // reading, so that is where the stripping is asserted.
  const LOUD_STAKES =
    '**`studio-build` sits permanently red** at the story rung.\n\n- **The map lies** in the direction `ADR-0294` set out to stop.';
  const LOUD = arc({
    id: 'loud-arc',
    questions: [
      {
        id: 'oq-loud',
        title: 'Which door?',
        stakes: LOUD_STAKES,
        description: 'A `one-liner` with **markers** too.',
        lifecycle: 'open',
      },
    ],
    increments: [landed('c', '2026-08-05')],
  });
  // `arc()` above returns the LANE-width `ArcRollupSummary`, which never carries `questions` — the
  // stakes text has to be declared once and reused, not read back off `LOUD`.
  const LOUD_ASSETS = [questionAsset('oq-loud', { stakes: LOUD_STAKES })];

  it('strips the markers rather than showing them, and keeps every word', async () => {
    render(<ArcSurface readArc={readArc} arcs={[LOUD]} now={NOW} assets={LOUD_ASSETS} />);
    await settle();
    fireEvent.click(screen.getByTestId('arc-question-open:oq-loud'));
    const stakes = screen.getByTestId('arc-question-detail-stakes');
    const text = stakes.textContent ?? '';
    expect(text).not.toContain('**');
    expect(text).not.toContain('`');
    expect(text).toContain('studio-build sits permanently red');
    expect(text).toContain('The map lies');
  });

  it('opening a loud question does not push "what it is about" out of the document', async () => {
    render(<ArcSurface readArc={readArc} arcs={[LOUD]} now={NOW} assets={LOUD_ASSETS} />);
    await settle();
    fireEvent.click(screen.getByTestId('arc-question-open:oq-loud'));
    const panel = screen.getByTestId('arc-briefing');
    expect(within(panel).getByLabelText('what this arc is about')).not.toBeNull();
  });
});

describe('ArcSurface — `blocked` is named and left UNLIT (ADR-0314 D4)', () => {
  it('lights waiting / running / quiet, and never blocked', async () => {
    render(
      <ArcSurface
        readArc={readArc}
        arcs={[
          arc({ id: 'w', questions: [question('q')] }),
          arc({ id: 'r', increments: [landed('c', '2026-08-05')] }),
          arc({ id: 'q', increments: [landed('c', '2026-06-01')] }),
          arc({ id: 'never-started' }),
        ]}
        now={NOW}
      />,
    );
    await settle();
    expect(screen.getByTestId('arc-lane:w').getAttribute('data-arc-state')).toBe('waiting');
    expect(screen.getByTestId('arc-lane:r').getAttribute('data-arc-state')).toBe('quiet');
    expect(screen.getByTestId('arc-lane:q').getAttribute('data-arc-state')).toBe('quiet');
    // B2 "never started" is rejected by name as a blocked predicate — it measures the symptom.
    expect(screen.getByTestId('arc-lane:never-started').getAttribute('data-arc-state')).toBe('quiet');
    expect(screen.getByTestId('arc-surface').querySelectorAll('[data-arc-state="blocked"]')).toHaveLength(0);
  });

  it('says WHY blocked is unlit, rather than letting its absence read as "nothing is blocked"', async () => {
    render(<ArcSurface readArc={readArc} arcs={[arc({ id: 'a', increments: [landed('c', '2026-08-05')] })]} now={NOW} />);
    await settle();
    const note = screen.getByTestId('arc-blocked-note');
    expect(note.textContent).toContain('blocked is not lit');
    expect(note.textContent).toMatch(/ADR-0306\/0308/);
  });
});

describe('ArcSurface — `claimed` is the only ledger-backed state, and it never asserts a negative (ADR-0351)', () => {
  const group = (sessionId: string, ...unitIds: string[]): SessionClaimGroup => ({
    sessionId,
    branch: `claude/${sessionId}`,
    claims: unitIds.map((unitId) => ({
      unitId,
      grade: 'work' as const,
      intent: 'orchestrate',
      ageMs: 1000,
      claimedAt: '2026-08-06T00:00:00Z',
    })),
  });

  it('lights `claimed` when a live session holds the arc, and outranks the recency states', async () => {
    render(
      <ArcSurface
        readArc={readArc}
        arcs={[arc({ id: 'held-arc', increments: [landed('c', '2026-08-05')] })]}
        now={NOW}
        claims={[group('s1', 'held-arc')]}
      />,
    );
    await settle();
    // Without the claim this arc would read `quiet` (ADR-0374 D4) — the ledger is what lifts it.
    expect(screen.getByTestId('arc-lane:held-arc').getAttribute('data-arc-state')).toBe('claimed');
  });

  it('NO claim falls through to the recency states and never renders an "unclaimed" state', async () => {
    // The asymmetry is the design: a match proves a session is on the arc; a non-match proves
    // nothing, because the join covers a measured minority of increments. A surface that rendered
    // "unclaimed" would be asserting a confident false negative on nearly every arc.
    render(
      <ArcSurface
        readArc={readArc}
        arcs={[arc({ id: 'a', increments: [landed('c', '2026-08-05')] })]}
        now={NOW}
        claims={[group('s1', 'some-other-unit')]}
      />,
    );
    await settle();
    const surface = screen.getByTestId('arc-surface');
    expect(screen.getByTestId('arc-lane:a').getAttribute('data-arc-state')).toBe('quiet');
    expect(surface.querySelectorAll('[data-arc-state="unclaimed"]')).toHaveLength(0);
    expect((surface.textContent ?? '').toLowerCase()).not.toContain('unclaimed');
  });

  it('`waiting` still outranks `claimed` — the owner-actionable state stays on top', async () => {
    render(
      <ArcSurface
        readArc={readArc}
        arcs={[arc({ id: 'both', questions: [question('q')], increments: [landed('c', '2026-08-05')] })]}
        now={NOW}
        claims={[group('s1', 'both')]}
      />,
    );
    await settle();
    expect(screen.getByTestId('arc-lane:both').getAttribute('data-arc-state')).toBe('waiting');
  });

  it('a null ledger (no live store) is the same not-proven answer as no match', async () => {
    render(
      <ArcSurface readArc={readArc} arcs={[arc({ id: 'a', increments: [landed('c', '2026-08-05')] })]} now={NOW} claims={null} />,
    );
    await settle();
    expect(screen.getByTestId('arc-lane:a').getAttribute('data-arc-state')).toBe('quiet');
  });

  it('names WHO holds it on the chip, deduped by session', async () => {
    render(
      <ArcSurface
        readArc={readArc}
        arcs={[arc({ id: 'held', increments: [landed('c', '2026-08-05')] })]}
        now={NOW}
        claims={[group('s1', 'held', 'c')]}
      />,
    );
    await settle();
    const chip = screen.getByTestId('arc-lane:held').querySelector('.arc-state-chip');
    // one session on two of its units is ONE session on the arc, not two
    expect(chip?.getAttribute('title')).toContain('held by s1');
    expect((chip?.getAttribute('title')?.match(/s1/g) ?? []).length).toBe(1);
  });
});

describe('ArcSurface — the floor-health reading is NOT here any more (ADR-0349 amends ADR-0314 D7)', () => {
  it('renders no floor-health band — the reading moved to the map lamp', async () => {
    // D7's REQUIREMENT is unchanged and better served; only its placement moved. The band lived
    // inside this lens, which renders solely under `?overlay=arcs` — so a reading whose whole point
    // was to reach the owner "without the owner going looking" was itself behind a drawer.
    // `FloorHealthLamp`, mounted on the map by TreeView, is visible whenever the floor it reports on
    // is. This assertion is the fence against a later session helpfully re-mounting it here.
    render(<ArcSurface readArc={readArc} arcs={[ORIENTATION_ARC]} now={NOW} />);
    await settle();
    const surface = screen.getByTestId('arc-surface');
    expect(screen.queryByTestId('floor-health-strip')).toBeNull();
    expect(screen.queryByTestId('floor-lamp')).toBeNull();
    expect(surface.textContent ?? '').not.toMatch(/factory floor/i);
  });

  it('takes no floor-health prop at all — the fence is structural, not a convention', async () => {
    // A surface that still ACCEPTED the band would invite the re-mount the test above forbids, and
    // would put the one undecided call (the loud/quiet threshold) within reach of a second place.
    //
    // THE FENCE IS A TYPE, SO THE TYPECHECK IS WHAT ENFORCES IT. The previous form of this test ran
    // `Object.keys` over an object literal THE TEST ITSELF WROTE and asserted `floorHealth` was not
    // among its keys — it never touched `ArcSurface`, and the literal was not even the real prop
    // list (the surface also takes `claims` and `readArc`). Confirmed hollow 2026-08-29: adding
    // `floorHealth` to `ArcSurfaceProps`, destructuring it and referencing it in the body left this
    // green, and the whole file still passed 55/55 — nothing anywhere caught it.
    //
    // `@ts-expect-error` is the assertion. It REDS `pnpm --filter studio typecheck` the moment
    // `floorHealth` becomes a legal prop, because an unused expect-error is itself an error. That is
    // a claim about the type, checked by the thing that can see types — which `Object.keys` cannot.
    render(
      <ArcSurface
        readArc={readArc}
        arcs={[ORIENTATION_ARC]}
        now={NOW}
        // @ts-expect-error — ArcSurface must NOT accept a floor-health prop (see above).
        floorHealth={{ bottlenecks: [], collapsingRule: null, window: '7d' }}
      />,
    );
    await settle();
    // …and passing it changes nothing that renders: the band is still absent.
    expect(screen.queryByTestId('floor-health-strip')).toBeNull();
    expect(screen.queryByTestId('floor-lamp')).toBeNull();
  });
});

describe('ArcSurface — honest absence: no store ≠ no arcs', () => {
  it('renders four DIFFERENT answers for loading, unreachable, no-store and no-arcs', async () => {
    const { rerender } = render(<ArcSurface readArc={readArc} arcs={undefined} now={NOW} />);
    await settle();
    expect(screen.getByTestId('arc-lanes').textContent).toContain('Reading arcs…');

    // The read never answered — no such route on this backend, or the request failed. Distinct from
    // loading: a spinner that will never resolve tells the owner to wait for something that is not
    // coming. This is the #1191 regression the desktop app exposed.
    rerender(<ArcSurface readArc={readArc} arcs={ARCS_UNREACHABLE} now={NOW} />);
    await settle();
    expect(screen.getByTestId('arc-lanes-unreachable')).not.toBeNull();
    expect(screen.getByTestId('arc-lanes').textContent).not.toContain('Reading arcs…');

    rerender(<ArcSurface readArc={readArc} arcs={null} now={NOW} />);
    await settle();
    // "the store isn't here" must never render as a confident "no arcs".
    expect(screen.getByTestId('arc-lanes-no-store')).not.toBeNull();
    expect(screen.queryByTestId('arc-lanes-unreachable')).toBeNull();

    rerender(<ArcSurface readArc={readArc} arcs={[]} now={NOW} />);
    await settle();
    expect(screen.queryByTestId('arc-lanes-no-store')).toBeNull();
    expect(screen.getByTestId('arc-lanes').textContent).toContain('No active arcs.');
  });

  it('shows a MOVING part while reading, not just the word — and only while reading', async () => {
    // The read retries on a 30 s budget (api.ts `arcs`), so this state can honestly last tens of
    // seconds. Held that long, a static line of prose reads as a surface that has given up — which
    // is precisely what the unreachable note below exists to say, and must not be said by accident.
    // The spinner is the only thing distinguishing "working" from "stalled" while both look alike.
    const { rerender } = render(<ArcSurface readArc={readArc} arcs={undefined} now={NOW} />);
    await settle();
    const reading = screen.getByTestId('arc-lanes-reading');
    expect(reading.querySelector('.spinner')).not.toBeNull();
    // Announced, not just drawn: the lanes region changes under a reader who cannot see it spin.
    expect(reading.getAttribute('role')).toBe('status');

    // It must NOT survive into a settled state — a spinner beside an answer claims work that has
    // finished, and beside the unreachable note it would promise a retry that is no longer coming.
    const settledStates: ArcRollupsState[] = [ARCS_UNREACHABLE, null, []];
    for (const settled of settledStates) {
      rerender(<ArcSurface readArc={readArc} arcs={settled} now={NOW} />);
      await settle();
      expect(screen.queryByTestId('arc-lanes-reading')).toBeNull();
    }
  });

  it('keeps the briefing panel honest in every non-answer state — no lane, no stale pick', async () => {
    for (const state of [undefined, ARCS_UNREACHABLE, null] as const) {
      const { unmount } = render(<ArcSurface readArc={readArc} arcs={state} now={NOW} />);
      await settle();
      expect(screen.getByTestId('arc-briefing').textContent).toContain('Pick an arc');
      unmount();
    }
  });

  it('drops closed AND parked arcs from the lanes (ADR-0239 D3’s active-only default)', async () => {
    render(
      <ArcSurface
        readArc={readArc}
        arcs={[
          arc({ id: 'live-arc' }),
          arc({ id: 'done-arc', lifecycle: 'closed' }),
          arc({ id: 'shelved-arc', lifecycle: 'parked' }),
        ]}
        now={NOW}
      />,
    );
    await settle();
    expect(screen.getByTestId('arc-lane:live-arc')).not.toBeNull();
    expect(screen.queryByTestId('arc-lane:done-arc')).toBeNull();
    expect(screen.queryByTestId('arc-lane:shelved-arc')).toBeNull();
  });
});

describe('ArcSurface — three scopes, one per lifecycle (ADR-0335, ADR-0374 D5)', () => {
  const THREE = [
    arc({ id: 'live-arc' }),
    arc({ id: 'done-arc', lifecycle: 'closed' }),
    arc({ id: 'shelved-arc', lifecycle: 'parked', increments: [parked('p', '2026-08-04')] }),
  ];

  it('the Closed toggle reveals what the default Active scope hides', async () => {
    render(<ArcSurface readArc={readArc} arcs={THREE} now={NOW} />);
    await settle();
    expect(screen.queryByTestId('arc-lane:done-arc')).toBeNull();

    fireEvent.click(screen.getByTestId('arc-lanes-scope:closed'));
    await settle();
    expect(screen.getByTestId('arc-lane:done-arc')).not.toBeNull();
    expect(screen.queryByTestId('arc-lane:live-arc')).toBeNull();
    expect(screen.getByTestId('arc-lane:done-arc').getAttribute('data-arc-state')).toBe('closed');
  });

  it('the Parked toggle is its own shelf — parked arcs are neither on the worklist nor lost', async () => {
    render(<ArcSurface readArc={readArc} arcs={THREE} now={NOW} />);
    await settle();
    expect(screen.queryByTestId('arc-lane:shelved-arc')).toBeNull();

    fireEvent.click(screen.getByTestId('arc-lanes-scope:parked'));
    await settle();
    const lane = screen.getByTestId('arc-lane:shelved-arc');
    expect(lane.getAttribute('data-arc-state')).toBe('parked');
    // …and ONLY parked arcs: the shelf must not quietly become a second "all".
    expect(screen.queryByTestId('arc-lane:live-arc')).toBeNull();
    expect(screen.queryByTestId('arc-lane:done-arc')).toBeNull();

    fireEvent.click(screen.getByTestId('arc-lanes-scope:active'));
    await settle();
    expect(screen.getByTestId('arc-lane:live-arc')).not.toBeNull();
    expect(screen.queryByTestId('arc-lane:shelved-arc')).toBeNull();
  });

  it('THERE IS NO `All` SCOPE — the toggle offers exactly the three lifecycles (ADR-0374 D5)', async () => {
    // The owner's call: `All` interleaved three different answers into one column, distinguished
    // only by a small chip. It is removed, not hidden, and this fences it from creeping back.
    render(<ArcSurface readArc={readArc} arcs={THREE} now={NOW} />);
    await settle();
    expect(screen.queryByTestId('arc-lanes-scope:all')).toBeNull();
    const group = screen.getByRole('group', { name: 'which arcs to show' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Active',
      'Parked',
      'Closed',
    ]);
  });

  it('an empty shelf says WHICH shelf is empty, never a bare "no arcs"', async () => {
    render(<ArcSurface readArc={readArc} arcs={[arc({ id: 'live-arc' })]} now={NOW} />);
    await settle();
    fireEvent.click(screen.getByTestId('arc-lanes-scope:parked'));
    await settle();
    expect(screen.getByTestId('arc-lanes').textContent).toContain('No parked arcs.');
  });
});

describe('ArcSurface — deep links open in the map overlay, not a navigation away (ADR-0335)', () => {
  const WITH_LINKS = arc({
    id: 'linked-arc',
    questions: [question('oq-1')],
    increments: [landed('done-1', '2026-08-01'), parked('next-1', '2026-08-05')],
  });

  it('a plain click calls onOpen and never navigates — href is still there for everything else', async () => {
    const opened: Array<{ id: string; category: string }> = [];
    render(
      <ArcSurface
        readArc={readArc}
        arcs={[WITH_LINKS]}
        now={NOW}
        onOpen={(s) => opened.push({ id: s.id, category: s.category })}
      />,
    );
    await settle();
    const openArcLink = within(screen.getByTestId('arc-briefing')).getByRole('link', { name: /open the arc/ });
    // The href stays real — right-click / middle-click / copy-link / screen readers are unaffected.
    expect(openArcLink.getAttribute('href')).toBe('#/asset/linked-arc');
    fireEvent.click(openArcLink);
    await settle();
    expect(opened).toEqual([{ id: 'linked-arc', category: 'arc' }]);

    // inc-01 removed the increment-listing sections this panel used to carry ("what comes next"),
    // so `next-1` is no longer reachable from here at all — only the arc link and the question link
    // remain to assert.
    const questionLink = screen.getByRole('link', { name: 'Question oq-1' });
    fireEvent.click(questionLink);
    await settle();
    expect(opened).toContainEqual({ id: 'oq-1', category: 'open-question' });
  });

  it('a modified click (e.g. ctrl/cmd, for opening in a new tab) is left to the browser, not intercepted', async () => {
    const opened: string[] = [];
    render(<ArcSurface readArc={readArc} arcs={[WITH_LINKS]} now={NOW} onOpen={(s) => opened.push(s.id)} />);
    await settle();
    const openArcLink = within(screen.getByTestId('arc-briefing')).getByRole('link', { name: /open the arc/ });
    fireEvent.click(openArcLink, { ctrlKey: true });
    await settle();
    expect(opened).toEqual([]);
  });

  it('without onOpen, a click is a no-op here — falls through to ordinary navigation, unchanged', async () => {
    render(<ArcSurface readArc={readArc} arcs={[WITH_LINKS]} now={NOW} />);
    await settle();
    const openArcLink = within(screen.getByTestId('arc-briefing')).getByRole('link', { name: /open the arc/ });
    // jsdom does not actually navigate on an anchor click; the assertion is simply that this does
    // not throw and the href is untouched.
    fireEvent.click(openArcLink);
    await settle();
    expect(openArcLink.getAttribute('href')).toBe('#/asset/linked-arc');
  });
});

describe('ArcSurface — READ-ONLY this round (ADR-0267 D6 / ADR-0314 D9)', () => {
  it('offers no way to answer, comment on, or edit anything', async () => {
    render(
      <ArcSurface
        readArc={readArc}
        arcs={[arc({ id: 'a', questions: [question('q1')], increments: [landed('c', '2026-08-05')] })]}
        now={NOW}
      />,
    );
    await settle();
    const surface = screen.getByTestId('arc-surface');
    // No text entry of any kind — the panel is a reading room, and answering happens by the owner
    // prompting an agent harness, not in place.
    expect(within(surface).queryAllByRole('textbox')).toEqual([]);
    expect(surface.querySelectorAll('textarea, input, form')).toHaveLength(0);
    const writeish = within(surface)
      .queryAllByRole('button')
      .filter((b) => /comment|reply|answer|resolve|edit|save|dismiss/i.test(b.textContent ?? ''));
    expect(writeish).toEqual([]);
  });

  it('every affordance is a lane selection or a read-only deep link', async () => {
    render(<ArcSurface readArc={readArc} arcs={[arc({ id: 'a', questions: [question('q1')] })]} now={NOW} />);
    await settle();
    const surface = screen.getByTestId('arc-surface');
    for (const link of within(surface).queryAllByRole('link')) {
      // `#/asset/<id>` and `#/doc/<relpath>` are reads; nothing here navigates to an edit route.
      expect(link.getAttribute('href')).toMatch(/^#\/(asset|doc)\//);
      expect(link.getAttribute('href')).not.toMatch(/\/edit$/);
    }
  });
});

describe('ArcSurface — the panel is cut to two things (inc-01, arc-queue-and-question-legibility-arc)', () => {
  const BUSY_ARC = arc({
    id: 'busy-arc',
    questions: [question('oq-1')],
    increments: [
      increment({ id: 'prop-1', status: 'proposal', parked: '2026-08-05' }),
      increment({ id: 'ready-1', status: 'ready', parked: '2026-08-04' }),
      landed('done-1', '2026-08-01'),
    ],
  });

  it('renders NO proposals section and NO open-work list, however much increment work the arc carries', async () => {
    render(<ArcSurface readArc={readArc} arcs={[BUSY_ARC]} now={NOW} />);
    await settle();
    const panel = screen.getByTestId('arc-briefing');
    expect(within(panel).queryAllByText('Proposals to review')).toEqual([]);
    expect(screen.queryByTestId('arc-briefing-proposals')).toBeNull();
    expect(screen.queryByLabelText('what comes next')).toBeNull();
    expect(screen.queryByLabelText('where it is up to')).toBeNull();
    expect(screen.queryByTestId('arc-increment-review:prop-1')).toBeNull();
    expect(screen.queryByTestId('arc-increment-review:ready-1')).toBeNull();
    expect(screen.queryByTestId('arc-increment:done-1')).toBeNull();
    expect(panel.textContent).not.toContain('title of prop-1');
    expect(panel.textContent).not.toContain('title of ready-1');
    expect(panel.textContent).not.toContain('title of done-1');
    // Withdrawing the SEAT in the panel is not pruning the increment tier: this fixture still
    // carries all three rows — the panel just no longer draws any of them.
    expect(BUSY_ARC.increments).toHaveLength(3);
  });

  it('renders the description before the open questions, in DOM order', async () => {
    render(<ArcSurface readArc={readArc} arcs={[BUSY_ARC]} now={NOW} />);
    await settle();
    const about = screen.getByLabelText('what this arc is about');
    const questions = screen.getByLabelText('open questions');
    expect(about.compareDocumentPosition(questions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('open questions are their OWN section, not nested under a "waiting for you" heading', async () => {
    render(<ArcSurface readArc={readArc} arcs={[BUSY_ARC]} now={NOW} />);
    await settle();
    expect(screen.queryByText('Waiting on you')).toBeNull();
    expect(screen.queryByLabelText('waiting on you')).toBeNull();
    expect(screen.getByLabelText('open questions')).not.toBeNull();
  });
});

describe('ArcSurface — a question row shows its reading cost (inc-01)', () => {
  it('shows the word count summed over the seven authoring fields, and no others', async () => {
    // stakes(2) + statement(1) + context(3) + options(1) + analogy(2) + diagram(1) + recommendation(3) = 13
    const fields = {
      stakes: 'a b',
      statement: 'c',
      context: 'd e f',
      options: 'g',
      analogy: 'h i',
      diagram: 'j',
      recommendation: 'k l m',
    };
    render(
      <ArcSurface
        readArc={readArc}
        arcs={[arc({ id: 'a', questions: [question('oq-1')] })]}
        now={NOW}
        assets={[questionAsset('oq-1', fields)]}
      />,
    );
    await settle();
    expect(screen.getByTestId('arc-question-meta:oq-1').textContent).toContain('13 words');
  });

  it('flags "no diagram" exactly when the diagram field is empty', async () => {
    const oneQuestionArc = arc({ id: 'a', questions: [question('oq-1')] });

    const { rerender } = render(
      <ArcSurface
        readArc={readArc}
        arcs={[oneQuestionArc]}
        now={NOW}
        assets={[questionAsset('oq-1', { diagram: 'a picture' })]}
      />,
    );
    await settle();
    expect(screen.queryByTestId('arc-question-no-diagram:oq-1')).toBeNull();

    rerender(
      <ArcSurface
        readArc={readArc}
        arcs={[oneQuestionArc]}
        now={NOW}
        assets={[questionAsset('oq-1', { diagram: '' })]}
      />,
    );
    await settle();
    expect(screen.getByTestId('arc-question-no-diagram:oq-1').textContent).toContain('no diagram');
  });

  it('carries an Open button distinct from the title link, so the owner can expand a question before opening its artifact', async () => {
    render(<ArcSurface readArc={readArc} arcs={[arc({ id: 'a', questions: [question('oq-1')] })]} now={NOW} />);
    await settle();
    const button = screen.getByTestId('arc-question-open:oq-1');
    expect(button.tagName).toBe('BUTTON');
    const link = within(screen.getByTestId('arc-question:oq-1')).getByRole('link');
    expect(link.getAttribute('href')).toBe('#/asset/oq-1');
  });
});

describe('ArcSurface — a question opens with the question, and the background folds away (inc-02, arc-queue-and-question-legibility-arc)', () => {
  const FULL_FIELDS = {
    stakes: 'What breaks if this sits unanswered, in one sentence.',
    statement: 'Should the forest compact or hold still?',
    context:
      'Some longer archaeology explaining why this is open now, several sentences long, the largest field on a real question.',
    options:
      'A — do the small thing. FOR: cheap and reversible. AGAINST: does not solve it.\n\n' +
      'B — do the big thing. FOR: solves it for good. AGAINST: expensive.',
    analogy: 'A campus where every building was resized but the roads between them were not.',
    diagram: 'A --> B --> C',
    recommendation: 'Try the small thing first, cheaply, before committing to the big one.',
  };
  const QUESTION_ARC = arc({ id: 'q-arc', questions: [question('oq-1')] });
  const ASSETS = [questionAsset('oq-1', FULL_FIELDS)];

  function openIt(assets = ASSETS): void {
    render(<ArcSurface readArc={readArc} arcs={[QUESTION_ARC]} now={NOW} assets={assets} />);
  }

  it('clicking Open replaces the flat list with the question’s own reading; Back restores it', async () => {
    openIt();
    await settle();
    expect(screen.getByTestId('arc-briefing-questions')).not.toBeNull();
    fireEvent.click(screen.getByTestId('arc-question-open:oq-1'));
    expect(screen.queryByTestId('arc-briefing-questions')).toBeNull();
    expect(screen.getByTestId('arc-question-detail:oq-1')).not.toBeNull();

    fireEvent.click(screen.getByText('← back to questions'));
    expect(screen.getByTestId('arc-briefing-questions')).not.toBeNull();
    expect(screen.queryByTestId('arc-question-detail:oq-1')).toBeNull();
  });

  it('the statement renders before stakes, options, and the context fold — in DOM order', async () => {
    openIt();
    await settle();
    fireEvent.click(screen.getByTestId('arc-question-open:oq-1'));
    const detail = screen.getByTestId('arc-question-detail:oq-1');
    const statement = screen.getByTestId('arc-question-detail-statement');
    const stakes = screen.getByTestId('arc-question-detail-stakes');
    const options = screen.getByTestId('arc-question-detail-options');
    const contextSummary = within(detail).getByText(/^Context \(\d+ words\)$/);
    expect(statement.compareDocumentPosition(stakes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(statement.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      statement.compareDocumentPosition(contextSummary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the diagram when one is stored', async () => {
    openIt();
    await settle();
    fireEvent.click(screen.getByTestId('arc-question-open:oq-1'));
    expect(screen.getByTestId('arc-question-detail-diagram').textContent).toContain('A --> B --> C');
    expect(screen.queryByTestId('arc-question-detail-no-diagram')).toBeNull();
  });

  it('renders an explicit "none stored" line when there is no diagram — never silence', async () => {
    openIt([questionAsset('oq-1', { ...FULL_FIELDS, diagram: '' })]);
    await settle();
    fireEvent.click(screen.getByTestId('arc-question-open:oq-1'));
    const note = screen.getByTestId('arc-question-detail-no-diagram');
    expect(note.textContent).toMatch(/no diagram/i);
  });

  it('renders options as FOR/AGAINST cards, parsed from the inline convention', async () => {
    openIt();
    await settle();
    fireEvent.click(screen.getByTestId('arc-question-open:oq-1'));
    const cards = within(screen.getByTestId('arc-question-detail-options')).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain('do the small thing');
    expect(cards[0]?.textContent).toContain('FOR: cheap and reversible.');
    expect(cards[0]?.textContent).toContain('AGAINST: does not solve it.');
    expect(cards[1]?.textContent).toContain('do the big thing');
  });

  it('marks the recommendation as explicitly non-binding', async () => {
    openIt();
    await settle();
    fireEvent.click(screen.getByTestId('arc-question-open:oq-1'));
    const rec = screen.getByTestId('arc-question-detail-recommendation');
    expect(rec.textContent).toMatch(/non-binding/i);
    expect(rec.textContent).toContain('Try the small thing first');
  });

  it('puts analogy and context behind folds whose labels state their own word cost, and keeps the prose', async () => {
    openIt();
    await settle();
    fireEvent.click(screen.getByTestId('arc-question-open:oq-1'));
    const detail = screen.getByTestId('arc-question-detail:oq-1');
    const analogyWords = FULL_FIELDS.analogy.trim().split(/\s+/).length;
    const contextWords = FULL_FIELDS.context.trim().split(/\s+/).length;
    const analogySummary = within(detail).getByText(`Analogy (${analogyWords} words)`);
    const contextSummary = within(detail).getByText(`Context (${contextWords} words)`);
    // Folded by default (a `<details>` with no `open` attribute) — one click away, not deleted.
    expect((analogySummary.closest('details') as HTMLDetailsElement).open).toBe(false);
    expect((contextSummary.closest('details') as HTMLDetailsElement).open).toBe(false);
    expect(detail.textContent).toContain(FULL_FIELDS.analogy);
    expect(detail.textContent).toContain(FULL_FIELDS.context);
  });

  it('carries a word-budget readout whose three numbers are arithmetically consistent', async () => {
    openIt();
    await settle();
    fireEvent.click(screen.getByTestId('arc-question-open:oq-1'));
    const text = screen.getByTestId('arc-question-word-budget').textContent ?? '';
    const match = /(\d+) words stored · (\d+) above the fold · (\d+) folded/.exec(text);
    expect(match).not.toBeNull();
    const total = Number(match?.[1]);
    const aboveFold = Number(match?.[2]);
    const folded = Number(match?.[3]);
    expect(total).toBeGreaterThan(0);
    expect(aboveFold + folded).toBe(total);
  });

  it('READ-ONLY: no option, and nothing in the opened reading, carries an action of its own', async () => {
    openIt();
    await settle();
    fireEvent.click(screen.getByTestId('arc-question-open:oq-1'));
    const options = screen.getByTestId('arc-question-detail-options');
    expect(within(options).queryAllByRole('button')).toEqual([]);
    expect(within(options).queryAllByRole('link')).toEqual([]);
    const detail = screen.getByTestId('arc-question-detail:oq-1');
    // The one button in the whole reading is the navigational "back", never an answer/settle action.
    const buttons = within(detail).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toContain('back to questions');
  });

  it('nothing is deleted from the stored fields — every whole-prose field survives verbatim in the DOM', async () => {
    // `options` is excluded from this loop deliberately: inc-02 re-flows it into one card per
    // option (summary/FOR/AGAINST as separate paragraphs), so its exact newline layout does not
    // survive as one contiguous run of `.textContent` — the dedicated cards test above is what
    // proves none of ITS words are lost. Every other field renders as one whole prose block.
    openIt();
    await settle();
    fireEvent.click(screen.getByTestId('arc-question-open:oq-1'));
    const detail = screen.getByTestId('arc-question-detail:oq-1');
    const { options: _options, ...wholeProseFields } = FULL_FIELDS;
    for (const field of Object.values(wholeProseFields)) {
      expect(detail.textContent).toContain(field);
    }
  });
});
