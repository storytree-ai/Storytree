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
// No backend seam (no `api`, no fetch, no socket, no DB) — the rollups are handed in as props; no
// agent / drive / model import (the modelPathBoundary.test.ts wall stays green). The lane
// silhouette, the bar geometry and the panel's proportions are the arc's operator-attested LOOK leg
// (ADR-0070) — deliberately not asserted here.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { ArcSurface } from './ArcSurface';
import { ARCS_UNREACHABLE, type ArcRollupsState } from '../lib/arcRollups';
import type {
  ArcRollup,
  ArcRollupIncrement,
  ArcRollupQuestion,
  SessionClaimGroup,
} from '../types';

afterEach(cleanup);

const NOW = new Date('2026-08-06T00:00:00Z');

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
  return { id, title: `Question ${id}`, description: `description ${id}`, stakes: `stakes of ${id}` };
}
function arc(over: Partial<ArcRollup> & { id: string }): ArcRollup {
  return {
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
  it('renders its own heading, so the floor-health label is not the topmost text', () => {
    // The band answers a NARROWER question than the surface (is the floor healthy, versus where is
    // every initiative up to). With no heading of its own, the band's `factory floor` label was the
    // first text in the drawer and read as the whole lens's title.
    render(<ArcSurface arcs={[ORIENTATION_ARC]} now={NOW} />);
    expect(screen.getByRole('heading', { name: 'Arc Surface' })).not.toBeNull();
  });

  it('puts the heading first, above the lanes', () => {
    render(<ArcSurface arcs={[ORIENTATION_ARC]} now={NOW} />);
    const surface = screen.getByTestId('arc-surface');
    const heading = screen.getByRole('heading', { name: 'Arc Surface' });
    const lanes = screen.getByTestId('arc-lanes');
    expect(heading.compareDocumentPosition(lanes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(surface.contains(heading)).toBe(true);
  });
});

describe('ArcSurface — momentum lanes, no date axis (ADR-0314 D1)', () => {
  it('draws one lane per active arc', () => {
    render(<ArcSurface arcs={[ORIENTATION_ARC, arc({ id: 'other-arc' })]} now={NOW} />);
    expect(screen.getByTestId('arc-lane:arc-orientation-surface-arc')).not.toBeNull();
    expect(screen.getByTestId('arc-lane:other-arc')).not.toBeNull();
  });

  it('draws NO shared date axis — the mock’s 6-week scale and today-line are deleted', () => {
    // D1 deleted the axis because it spent ~60% of its width on empty space at the measured
    // recency distribution. Re-introducing it is the single most likely way to "reuse the mock".
    render(<ArcSurface arcs={[ORIENTATION_ARC]} now={NOW} />);
    const surface = screen.getByTestId('arc-surface');
    expect(surface.querySelector('.laneaxis')).toBeNull();
    expect(surface.querySelector('.now')).toBeNull();
    expect(surface.textContent ?? '').not.toMatch(/\d+\s*(weeks?|wks?) ago/i);
  });
});

describe('ArcSurface — bars are units, not time (ADR-0314 D2)', () => {
  it('draws one bar per increment, green for landed and grey for everything else', () => {
    render(<ArcSurface arcs={[ORIENTATION_ARC]} now={NOW} />);
    const lane = screen.getByTestId('arc-lane:arc-orientation-surface-arc');
    const bars = lane.querySelectorAll('.arc-bar');
    expect(bars).toHaveLength(5);
    expect(lane.querySelectorAll('[data-bar-tone="landed"]')).toHaveLength(2);
    expect(lane.querySelectorAll('[data-bar-tone="queued"]')).toHaveLength(3);
  });

  it('renders counts and NO percentage — this is not a progress bar', () => {
    // ADR-0314 D2: a percentage claims a denominator and an arc has none, because `endState` is
    // prose rather than a checklist. 2 of 5 known units is not "40% done".
    render(<ArcSurface arcs={[ORIENTATION_ARC]} now={NOW} />);
    const lane = screen.getByTestId('arc-lane:arc-orientation-surface-arc');
    expect(lane.textContent).toContain('2 landed');
    expect(lane.textContent).toContain('3 queued');
    // The lane is where a progress bar would live, so it carries no ratio of any shape...
    expect(lane.textContent ?? '').not.toMatch(/%|\bof 5\b|\d\s*\/\s*\d/);
    // ...and no percentage appears anywhere on the surface either.
    expect(screen.getByTestId('arc-surface').textContent ?? '').not.toContain('%');
  });

  it('parked work is visible as grey bars — it is no longer "nothing queued"', () => {
    // ADR-0314 D2 closes Context finding 2: every mock rendered "next" as ready-plan / proposed-ADR
    // / nothing-queued, and so answered "nothing queued" for arcs carrying a dozen parked items.
    render(<ArcSurface arcs={[arc({ id: 'parked-only', increments: [parked('p1', '2026-08-01'), parked('p2', '2026-08-02')] })]} now={NOW} />);
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

  it('opens on the arc that has something waiting on the owner', () => {
    render(<ArcSurface arcs={[arc({ id: 'busy-arc', increments: [landed('c', '2026-08-05')] }), WAITING_ARC]} now={NOW} />);
    const panel = screen.getByTestId('arc-briefing');
    expect(within(panel).getByText('The waiting-arc')).not.toBeNull();
  });

  it('lists each waiting question STAKES-first, and links through to its Library artifact', () => {
    // D3: the panel carries click-through into the ACTUAL artifact holding the question, so the
    // owner reaches the briefing, diagrams and mocks needed to answer it — `#/asset/<id>` already
    // routes, so this is deep-linking rather than a new surface.
    render(<ArcSurface arcs={[WAITING_ARC]} now={NOW} />);
    const first = screen.getByTestId('arc-question:oq-first');
    expect(first.textContent).toContain('stakes of oq-first');
    const link = within(first).getByRole('link', { name: 'Question oq-first' });
    expect(link.getAttribute('href')).toBe('#/asset/oq-first');
  });

  it('says plainly when nothing waits — an empty panel would read as an unread one', () => {
    render(<ArcSurface arcs={[arc({ id: 'calm-arc', increments: [landed('c', '2026-08-05')] })]} now={NOW} />);
    expect(screen.getByTestId('arc-briefing-nothing-waiting')).not.toBeNull();
  });

  it('answers what it is about / where it is up to / what comes next, and opens the arc itself', () => {
    render(
      <ArcSurface
        arcs={[arc({ ...WAITING_ARC, increments: [landed('done-1', '2026-08-01'), parked('next-1', '2026-08-05', 'ready')] })]}
        now={NOW}
      />,
    );
    const panel = screen.getByTestId('arc-briefing');
    expect(panel.textContent).toContain('intent of waiting-arc');
    expect(within(panel).getByLabelText('what comes next').textContent).toContain('title of next-1');
    expect(within(panel).getByLabelText('where it is up to').textContent).toContain('title of done-1');
    expect(within(panel).getByRole('link', { name: /open the arc/ }).getAttribute('href')).toBe(
      '#/asset/waiting-arc',
    );
  });

  it('clicking a lane moves the panel to that arc', () => {
    render(<ArcSurface arcs={[WAITING_ARC, arc({ id: 'other-arc', increments: [landed('c', '2026-08-05')] })]} now={NOW} />);
    fireEvent.click(screen.getByTestId('arc-lane:other-arc'));
    expect(within(screen.getByTestId('arc-briefing')).getByText('The other-arc')).not.toBeNull();
  });
});

describe('ArcSurface — a queued increment is explicitly REVIEWABLE (ADR-0359, inc-01)', () => {
  const MIXED = arc({
    id: 'mixed-arc',
    increments: [
      increment({ id: 'prop-1', status: 'proposal', parked: '2026-08-05' }),
      increment({ id: 'ready-1', status: 'ready', parked: '2026-08-04' }),
      landed('done-1', '2026-08-01'),
    ],
  });

  it('gives every forward-looking increment a named review action, with a real href', () => {
    // The defect: a queued increment rendered as a bare title link, so nothing on the surface said
    // it could be opened and read — the owner could see that an arc had queued work and could not
    // reliably reach the proposal itself.
    render(<ArcSurface arcs={[MIXED]} now={NOW} />);
    const panel = screen.getByTestId('arc-briefing');
    const review = within(panel).getByTestId('arc-increment-review:prop-1');
    expect(review.getAttribute('href')).toBe('#/asset/prop-1');
    expect(review.textContent).toContain('Review proposal');
    // A real anchor, so it is keyboard-reachable, copyable and middle-clickable without any
    // handler of ours — the affordance is native, not simulated.
    expect(review.tagName).toBe('A');
    expect(review.getAttribute('tabindex')).toBeNull();
  });

  it('a ready/active increment is reviewable too, but is not called a proposal', () => {
    render(<ArcSurface arcs={[MIXED]} now={NOW} />);
    const review = screen.getByTestId('arc-increment-review:ready-1');
    expect(review.getAttribute('href')).toBe('#/asset/ready-1');
    expect(review.textContent).toContain('Review');
    expect(review.textContent).not.toContain('proposal');
  });

  it('LANDED increments stay visibly distinct and inherit no proposal label', () => {
    render(<ArcSurface arcs={[MIXED]} now={NOW} />);
    expect(screen.queryByTestId('arc-increment-review:done-1')).toBeNull();
    const row = screen.getByTestId('arc-increment:done-1');
    expect(row.getAttribute('data-increment-status')).toBe('closed');
    expect(row.textContent).not.toMatch(/proposal/i);
  });

  it('a plain click on the review action opens the overlay in place, like a question does', () => {
    const opened: Array<{ id: string; category: string }> = [];
    render(
      <ArcSurface arcs={[MIXED]} now={NOW} onOpen={(s) => opened.push({ id: s.id, category: s.category })} />,
    );
    fireEvent.click(screen.getByTestId('arc-increment-review:prop-1'));
    expect(opened).toEqual([{ id: 'prop-1', category: 'increment' }]);
  });
});

describe('ArcSurface — proposals surface where the owner scans (ADR-0359 D2/D3)', () => {
  const PROPOSALS_ARC = arc({
    id: 'proposals-arc',
    increments: [
      increment({ id: 'prop-1', status: 'proposal', parked: '2026-08-05' }),
      increment({ id: 'ready-1', status: 'ready', parked: '2026-08-04' }),
      landed('done-1', '2026-08-01'),
    ],
  });

  it('lists proposals inside "Waiting on you", as their own labelled group', () => {
    render(<ArcSurface arcs={[PROPOSALS_ARC]} now={NOW} />);
    const waiting = within(screen.getByTestId('arc-briefing')).getByLabelText('waiting on you');
    const group = within(waiting).getByTestId('arc-briefing-proposals');
    expect(group.textContent).toContain('title of prop-1');
    expect(within(group).getByTestId('arc-increment-review:prop-1')).not.toBeNull();
  });

  it('keeps ready/active work out of it — decided work is not asking for a review (D3)', () => {
    render(<ArcSurface arcs={[PROPOSALS_ARC]} now={NOW} />);
    const group = screen.getByTestId('arc-briefing-proposals');
    expect(group.textContent).not.toContain('title of ready-1');
    // …and nothing is lost: it is still under "what comes next".
    const next = within(screen.getByTestId('arc-briefing')).getByLabelText('what comes next');
    expect(next.textContent).toContain('title of ready-1');
  });

  it('does not claim "nothing is waiting" while proposals sit there', () => {
    render(<ArcSurface arcs={[PROPOSALS_ARC]} now={NOW} />);
    expect(screen.queryByTestId('arc-briefing-nothing-waiting')).toBeNull();
  });

  it('questions still come first — they are answerable now, a proposal is a read', () => {
    render(
      <ArcSurface
        arcs={[arc({ id: 'both', questions: [question('oq-1')], increments: [parked('prop-1', '2026-08-05')] })]}
        now={NOW}
      />,
    );
    const waiting = within(screen.getByTestId('arc-briefing')).getByLabelText('waiting on you');
    const questions = within(waiting).getByTestId('arc-briefing-questions');
    const proposals = within(waiting).getByTestId('arc-briefing-proposals');
    expect(
      questions.compareDocumentPosition(proposals) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('THE FENCE (D4): the LANE chip is unmoved — a proposal never reads as `waiting`', () => {
    // ADR-0351 D1 removed a state that lit on every lane and so discriminated nothing; all 13
    // active arcs carried open increments on 2026-08-12. The panel shows proposals, the lane does
    // not. Read ADR-0359 D4 before "fixing" this apparent inconsistency.
    render(<ArcSurface arcs={[PROPOSALS_ARC]} now={NOW} />);
    expect(screen.getByTestId('arc-lane:proposals-arc').getAttribute('data-arc-state')).toBe('quiet');
  });
});

describe('ArcSurface — a question BRIEFS, it does not flood (ADR-0359)', () => {
  // Found by looking at the shipped panel against the live store: on `uat-journey-surgery-arc` the
  // waiting block rendered ~1500 characters of RAW markdown — literal ** and backticks, bullet
  // markers mid-line — which filled the drawer and pushed "What it is about" off the panel. The arc's
  // own `intent` was already stripped and clamped for precisely this reason; a question's `stakes` is
  // authored to the same cold-answerable bar (ADR-0314 D5) and had neither treatment.
  const LOUD = arc({
    id: 'loud-arc',
    questions: [
      {
        id: 'oq-loud',
        title: 'Which door?',
        stakes: '**`studio-build` sits permanently red** at the story rung.\n\n- **The map lies** in the direction `ADR-0294` set out to stop.',
        description: 'A `one-liner` with **markers** too.',
      },
    ],
    increments: [landed('c', '2026-08-05')],
  });

  it('strips the markers rather than showing them, and keeps every word', () => {
    render(<ArcSurface arcs={[LOUD]} now={NOW} />);
    const stakes = screen.getByTestId('arc-question:oq-loud').querySelector('.arc-question-stakes');
    const text = stakes?.textContent ?? '';
    expect(text).not.toContain('**');
    expect(text).not.toContain('`');
    expect(text).toContain('studio-build sits permanently red');
    expect(text).toContain('The map lies');
  });

  it('clamps it, so one loud question cannot push the rest of the briefing off the panel', () => {
    render(<ArcSurface arcs={[LOUD]} now={NOW} />);
    const stakes = screen.getByTestId('arc-question:oq-loud').querySelector('.arc-question-stakes');
    // The clamp is CSS; what is asserted here is that the class carrying it is applied — the height
    // itself is the operator-attested LOOK leg, not a jsdom fact.
    expect(stakes?.className).toContain('arc-briefing-clamp');
    // …and the sections below it are still in the document, which is the point of clamping.
    const panel = screen.getByTestId('arc-briefing');
    expect(within(panel).getByLabelText('what this arc is about')).not.toBeNull();
    expect(within(panel).getByLabelText('where it is up to')).not.toBeNull();
  });

  it('the one-line description is stripped too — it sits in the same block', () => {
    render(<ArcSurface arcs={[LOUD]} now={NOW} />);
    const row = screen.getByTestId('arc-question:oq-loud');
    expect(row.textContent).toContain('A one-liner with markers too.');
  });
});

describe('ArcSurface — the landed log collapses to one line (ADR-0359 D1)', () => {
  const LONG_ARC = arc({
    id: 'long-arc',
    increments: [
      ...Array.from({ length: 12 }, (_, i) => landed(`done-${i}`, '2026-07-01')),
      landed('done-last', '2026-08-05'),
    ],
  });

  it('renders a summary line instead of the whole log, and stays CLOSED by default', () => {
    // The defect: one <li> per closed increment, which was 57 rows on `verification-integrity-arc`
    // against the live store on 2026-08-12 — at the bottom of a scroll past whatever the owner
    // came for.
    render(<ArcSurface arcs={[LONG_ARC]} now={NOW} />);
    const section = within(screen.getByTestId('arc-briefing')).getByLabelText('where it is up to');
    const details = section.querySelector('details');
    expect(details).not.toBeNull();
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(section.querySelector('summary')?.textContent).toBe('13 landed · last 2026-08-05 #1186');
    // Every row is INSIDE the collapsed disclosure — nothing escapes the fold.
    for (const row of section.querySelectorAll('.arc-increment')) {
      expect((details as HTMLDetailsElement).contains(row)).toBe(true);
    }
  });

  it('opening it restores the full list, unchanged — the log is folded, not deleted', () => {
    render(<ArcSurface arcs={[LONG_ARC]} now={NOW} />);
    const section = within(screen.getByTestId('arc-briefing')).getByLabelText('where it is up to');
    const details = section.querySelector('details') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(details.open).toBe(true);
    expect(section.querySelectorAll('.arc-increment')).toHaveLength(13);
    expect(section.textContent).toContain('title of done-last');
  });

  it('the two blocks the owner reads stay always-open — neither is behind a disclosure', () => {
    render(
      <ArcSurface
        arcs={[arc({ id: 'a', questions: [question('oq-1')], increments: [landed('c', '2026-08-05')] })]}
        now={NOW}
      />,
    );
    const panel = screen.getByTestId('arc-briefing');
    expect(within(panel).getByLabelText('waiting on you').querySelector('details')).toBeNull();
    expect(within(panel).getByLabelText('what this arc is about').querySelector('details')).toBeNull();
  });
});

describe('ArcSurface — `blocked` is named and left UNLIT (ADR-0314 D4)', () => {
  it('lights waiting / running / quiet, and never blocked', () => {
    render(
      <ArcSurface
        arcs={[
          arc({ id: 'w', questions: [question('q')] }),
          arc({ id: 'r', increments: [landed('c', '2026-08-05')] }),
          arc({ id: 'q', increments: [landed('c', '2026-06-01')] }),
          arc({ id: 'never-started' }),
        ]}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('arc-lane:w').getAttribute('data-arc-state')).toBe('waiting');
    expect(screen.getByTestId('arc-lane:r').getAttribute('data-arc-state')).toBe('quiet');
    expect(screen.getByTestId('arc-lane:q').getAttribute('data-arc-state')).toBe('quiet');
    // B2 "never started" is rejected by name as a blocked predicate — it measures the symptom.
    expect(screen.getByTestId('arc-lane:never-started').getAttribute('data-arc-state')).toBe('quiet');
    expect(screen.getByTestId('arc-surface').querySelectorAll('[data-arc-state="blocked"]')).toHaveLength(0);
  });

  it('says WHY blocked is unlit, rather than letting its absence read as "nothing is blocked"', () => {
    render(<ArcSurface arcs={[arc({ id: 'a', increments: [landed('c', '2026-08-05')] })]} now={NOW} />);
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

  it('lights `claimed` when a live session holds the arc, and outranks the recency states', () => {
    render(
      <ArcSurface
        arcs={[arc({ id: 'held-arc', increments: [landed('c', '2026-08-05')] })]}
        now={NOW}
        claims={[group('s1', 'held-arc')]}
      />,
    );
    // Without the claim this arc would read `quiet` (ADR-0374 D4) — the ledger is what lifts it.
    expect(screen.getByTestId('arc-lane:held-arc').getAttribute('data-arc-state')).toBe('claimed');
  });

  it('NO claim falls through to the recency states and never renders an "unclaimed" state', () => {
    // The asymmetry is the design: a match proves a session is on the arc; a non-match proves
    // nothing, because the join covers a measured minority of increments. A surface that rendered
    // "unclaimed" would be asserting a confident false negative on nearly every arc.
    render(
      <ArcSurface
        arcs={[arc({ id: 'a', increments: [landed('c', '2026-08-05')] })]}
        now={NOW}
        claims={[group('s1', 'some-other-unit')]}
      />,
    );
    const surface = screen.getByTestId('arc-surface');
    expect(screen.getByTestId('arc-lane:a').getAttribute('data-arc-state')).toBe('quiet');
    expect(surface.querySelectorAll('[data-arc-state="unclaimed"]')).toHaveLength(0);
    expect((surface.textContent ?? '').toLowerCase()).not.toContain('unclaimed');
  });

  it('`waiting` still outranks `claimed` — the owner-actionable state stays on top', () => {
    render(
      <ArcSurface
        arcs={[arc({ id: 'both', questions: [question('q')], increments: [landed('c', '2026-08-05')] })]}
        now={NOW}
        claims={[group('s1', 'both')]}
      />,
    );
    expect(screen.getByTestId('arc-lane:both').getAttribute('data-arc-state')).toBe('waiting');
  });

  it('a null ledger (no live store) is the same not-proven answer as no match', () => {
    render(
      <ArcSurface arcs={[arc({ id: 'a', increments: [landed('c', '2026-08-05')] })]} now={NOW} claims={null} />,
    );
    expect(screen.getByTestId('arc-lane:a').getAttribute('data-arc-state')).toBe('quiet');
  });

  it('names WHO holds it on the chip, deduped by session', () => {
    render(
      <ArcSurface
        arcs={[arc({ id: 'held', increments: [landed('c', '2026-08-05')] })]}
        now={NOW}
        claims={[group('s1', 'held', 'c')]}
      />,
    );
    const chip = screen.getByTestId('arc-lane:held').querySelector('.arc-state-chip');
    // one session on two of its units is ONE session on the arc, not two
    expect(chip?.getAttribute('title')).toContain('held by s1');
    expect((chip?.getAttribute('title')?.match(/s1/g) ?? []).length).toBe(1);
  });
});

describe('ArcSurface — the floor-health reading is NOT here any more (ADR-0349 amends ADR-0314 D7)', () => {
  it('renders no floor-health band — the reading moved to the map lamp', () => {
    // D7's REQUIREMENT is unchanged and better served; only its placement moved. The band lived
    // inside this lens, which renders solely under `?overlay=arcs` — so a reading whose whole point
    // was to reach the owner "without the owner going looking" was itself behind a drawer.
    // `FloorHealthLamp`, mounted on the map by TreeView, is visible whenever the floor it reports on
    // is. This assertion is the fence against a later session helpfully re-mounting it here.
    render(<ArcSurface arcs={[ORIENTATION_ARC]} now={NOW} />);
    const surface = screen.getByTestId('arc-surface');
    expect(screen.queryByTestId('floor-health-strip')).toBeNull();
    expect(screen.queryByTestId('floor-lamp')).toBeNull();
    expect(surface.textContent ?? '').not.toMatch(/factory floor/i);
  });

  it('takes no floor-health prop at all — the fence is structural, not a convention', () => {
    // A surface that still ACCEPTED the band would invite the re-mount the test above forbids, and
    // would put the one undecided call (the loud/quiet threshold) within reach of a second place.
    const props = Object.keys({ arcs: undefined, now: NOW, onOpen: undefined });
    expect(props).not.toContain('floorHealth');
  });
});

describe('ArcSurface — honest absence: no store ≠ no arcs', () => {
  it('renders four DIFFERENT answers for loading, unreachable, no-store and no-arcs', () => {
    const { rerender } = render(<ArcSurface arcs={undefined} now={NOW} />);
    expect(screen.getByTestId('arc-lanes').textContent).toContain('Reading arcs…');

    // The read never answered — no such route on this backend, or the request failed. Distinct from
    // loading: a spinner that will never resolve tells the owner to wait for something that is not
    // coming. This is the #1191 regression the desktop app exposed.
    rerender(<ArcSurface arcs={ARCS_UNREACHABLE} now={NOW} />);
    expect(screen.getByTestId('arc-lanes-unreachable')).not.toBeNull();
    expect(screen.getByTestId('arc-lanes').textContent).not.toContain('Reading arcs…');

    rerender(<ArcSurface arcs={null} now={NOW} />);
    // "the store isn't here" must never render as a confident "no arcs".
    expect(screen.getByTestId('arc-lanes-no-store')).not.toBeNull();
    expect(screen.queryByTestId('arc-lanes-unreachable')).toBeNull();

    rerender(<ArcSurface arcs={[]} now={NOW} />);
    expect(screen.queryByTestId('arc-lanes-no-store')).toBeNull();
    expect(screen.getByTestId('arc-lanes').textContent).toContain('No active arcs.');
  });

  it('shows a MOVING part while reading, not just the word — and only while reading', () => {
    // The read retries on a 30 s budget (api.ts `arcs`), so this state can honestly last tens of
    // seconds. Held that long, a static line of prose reads as a surface that has given up — which
    // is precisely what the unreachable note below exists to say, and must not be said by accident.
    // The spinner is the only thing distinguishing "working" from "stalled" while both look alike.
    const { rerender } = render(<ArcSurface arcs={undefined} now={NOW} />);
    const reading = screen.getByTestId('arc-lanes-reading');
    expect(reading.querySelector('.spinner')).not.toBeNull();
    // Announced, not just drawn: the lanes region changes under a reader who cannot see it spin.
    expect(reading.getAttribute('role')).toBe('status');

    // It must NOT survive into a settled state — a spinner beside an answer claims work that has
    // finished, and beside the unreachable note it would promise a retry that is no longer coming.
    const settledStates: ArcRollupsState[] = [ARCS_UNREACHABLE, null, []];
    for (const settled of settledStates) {
      rerender(<ArcSurface arcs={settled} now={NOW} />);
      expect(screen.queryByTestId('arc-lanes-reading')).toBeNull();
    }
  });

  it('keeps the briefing panel honest in every non-answer state — no lane, no stale pick', () => {
    for (const state of [undefined, ARCS_UNREACHABLE, null] as const) {
      const { unmount } = render(<ArcSurface arcs={state} now={NOW} />);
      expect(screen.getByTestId('arc-briefing').textContent).toContain('Pick an arc');
      unmount();
    }
  });

  it('drops closed AND parked arcs from the lanes (ADR-0239 D3’s active-only default)', () => {
    render(
      <ArcSurface
        arcs={[
          arc({ id: 'live-arc' }),
          arc({ id: 'done-arc', lifecycle: 'closed' }),
          arc({ id: 'shelved-arc', lifecycle: 'parked' }),
        ]}
        now={NOW}
      />,
    );
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

  it('the Closed toggle reveals what the default Active scope hides', () => {
    render(<ArcSurface arcs={THREE} now={NOW} />);
    expect(screen.queryByTestId('arc-lane:done-arc')).toBeNull();

    fireEvent.click(screen.getByTestId('arc-lanes-scope:closed'));
    expect(screen.getByTestId('arc-lane:done-arc')).not.toBeNull();
    expect(screen.queryByTestId('arc-lane:live-arc')).toBeNull();
    expect(screen.getByTestId('arc-lane:done-arc').getAttribute('data-arc-state')).toBe('closed');
  });

  it('the Parked toggle is its own shelf — parked arcs are neither on the worklist nor lost', () => {
    render(<ArcSurface arcs={THREE} now={NOW} />);
    expect(screen.queryByTestId('arc-lane:shelved-arc')).toBeNull();

    fireEvent.click(screen.getByTestId('arc-lanes-scope:parked'));
    const lane = screen.getByTestId('arc-lane:shelved-arc');
    expect(lane.getAttribute('data-arc-state')).toBe('parked');
    // …and ONLY parked arcs: the shelf must not quietly become a second "all".
    expect(screen.queryByTestId('arc-lane:live-arc')).toBeNull();
    expect(screen.queryByTestId('arc-lane:done-arc')).toBeNull();

    fireEvent.click(screen.getByTestId('arc-lanes-scope:active'));
    expect(screen.getByTestId('arc-lane:live-arc')).not.toBeNull();
    expect(screen.queryByTestId('arc-lane:shelved-arc')).toBeNull();
  });

  it('THERE IS NO `All` SCOPE — the toggle offers exactly the three lifecycles (ADR-0374 D5)', () => {
    // The owner's call: `All` interleaved three different answers into one column, distinguished
    // only by a small chip. It is removed, not hidden, and this fences it from creeping back.
    render(<ArcSurface arcs={THREE} now={NOW} />);
    expect(screen.queryByTestId('arc-lanes-scope:all')).toBeNull();
    const group = screen.getByRole('group', { name: 'which arcs to show' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Active',
      'Parked',
      'Closed',
    ]);
  });

  it('an empty shelf says WHICH shelf is empty, never a bare "no arcs"', () => {
    render(<ArcSurface arcs={[arc({ id: 'live-arc' })]} now={NOW} />);
    fireEvent.click(screen.getByTestId('arc-lanes-scope:parked'));
    expect(screen.getByTestId('arc-lanes').textContent).toContain('No parked arcs.');
  });
});

describe('ArcSurface — deep links open in the map overlay, not a navigation away (ADR-0335)', () => {
  const WITH_LINKS = arc({
    id: 'linked-arc',
    questions: [question('oq-1')],
    increments: [landed('done-1', '2026-08-01'), parked('next-1', '2026-08-05')],
  });

  it('a plain click calls onOpen and never navigates — href is still there for everything else', () => {
    const opened: Array<{ id: string; category: string }> = [];
    render(
      <ArcSurface
        arcs={[WITH_LINKS]}
        now={NOW}
        onOpen={(s) => opened.push({ id: s.id, category: s.category })}
      />,
    );
    const openArcLink = within(screen.getByTestId('arc-briefing')).getByRole('link', { name: /open the arc/ });
    // The href stays real — right-click / middle-click / copy-link / screen readers are unaffected.
    expect(openArcLink.getAttribute('href')).toBe('#/asset/linked-arc');
    fireEvent.click(openArcLink);
    expect(opened).toEqual([{ id: 'linked-arc', category: 'arc' }]);

    const questionLink = screen.getByRole('link', { name: 'Question oq-1' });
    fireEvent.click(questionLink);
    expect(opened).toContainEqual({ id: 'oq-1', category: 'open-question' });

    const incrementLink = screen.getByRole('link', { name: 'title of next-1' });
    fireEvent.click(incrementLink);
    expect(opened).toContainEqual({ id: 'next-1', category: 'increment' });
  });

  it('a modified click (e.g. ctrl/cmd, for opening in a new tab) is left to the browser, not intercepted', () => {
    const opened: string[] = [];
    render(<ArcSurface arcs={[WITH_LINKS]} now={NOW} onOpen={(s) => opened.push(s.id)} />);
    const openArcLink = within(screen.getByTestId('arc-briefing')).getByRole('link', { name: /open the arc/ });
    fireEvent.click(openArcLink, { ctrlKey: true });
    expect(opened).toEqual([]);
  });

  it('without onOpen, a click is a no-op here — falls through to ordinary navigation, unchanged', () => {
    render(<ArcSurface arcs={[WITH_LINKS]} now={NOW} />);
    const openArcLink = within(screen.getByTestId('arc-briefing')).getByRole('link', { name: /open the arc/ });
    // jsdom does not actually navigate on an anchor click; the assertion is simply that this does
    // not throw and the href is untouched.
    fireEvent.click(openArcLink);
    expect(openArcLink.getAttribute('href')).toBe('#/asset/linked-arc');
  });
});

describe('ArcSurface — READ-ONLY this round (ADR-0267 D6 / ADR-0314 D9)', () => {
  it('offers no way to answer, comment on, or edit anything', () => {
    render(
      <ArcSurface
        arcs={[arc({ id: 'a', questions: [question('q1')], increments: [landed('c', '2026-08-05')] })]}
        now={NOW}
      />,
    );
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

  it('every affordance is a lane selection or a read-only deep link', () => {
    render(<ArcSurface arcs={[arc({ id: 'a', questions: [question('q1')] })]} now={NOW} />);
    const surface = screen.getByTestId('arc-surface');
    for (const link of within(surface).queryAllByRole('link')) {
      // `#/asset/<id>` and `#/doc/<relpath>` are reads; nothing here navigates to an edit route.
      expect(link.getAttribute('href')).toMatch(/^#\/(asset|doc)\//);
      expect(link.getAttribute('href')).not.toMatch(/\/edit$/);
    }
  });
});
