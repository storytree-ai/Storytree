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
//   D7 — the floor-health strip is present, above the lanes.
//   D9 — READ-ONLY: no comment box, no answer field, no write affordance of any kind.
//
// Plus the honest-absence contract the surface inherits from its endpoint: `arcs: null` (no
// document store) and `arcs: []` (a store with no arcs) are DIFFERENT facts and must render
// differently — a surface built to restore context cannot blur them into a confident empty state.
//
// No backend seam (no `api`, no fetch, no socket, no DB) — the rollups are handed in as props; no
// agent / drive / model import (the modelPathBoundary.test.ts wall stays green). The lane
// silhouette, the bar geometry and the panel's proportions are the arc's operator-attested LOOK leg
// (ADR-0070) — deliberately not asserted here.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { ArcSurface } from './ArcSurface';
import type { ArcRollup, ArcRollupIncrement, ArcRollupQuestion } from '../types';

afterEach(cleanup);

const NOW = new Date('2026-08-06T00:00:00Z');

function increment(over: Partial<ArcRollupIncrement> & { id: string }): ArcRollupIncrement {
  return { title: `title of ${over.id}`, objective: '', status: 'proposal', ...over };
}
function landed(id: string, date: string): ArcRollupIncrement {
  return increment({ id, status: 'closed', outcome: { date, pr: '#1186' } });
}
function parked(id: string, at: string): ArcRollupIncrement {
  return increment({ id, status: 'proposal', parked: at });
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
    render(<ArcSurface arcs={[WAITING_ARC]} now={NOW} />);
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
    expect(screen.getByTestId('arc-lane:r').getAttribute('data-arc-state')).toBe('running');
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

describe('ArcSurface — the floor-health strip sits above the lanes (ADR-0314 D7)', () => {
  it('renders the strip, and it precedes the lanes in the document', () => {
    render(<ArcSurface arcs={[ORIENTATION_ARC]} now={NOW} />);
    const strip = screen.getByTestId('floor-health-strip');
    const lanes = screen.getByTestId('arc-lanes');
    // Persistent placement is the point: it must reach the owner without them going looking.
    expect(strip.compareDocumentPosition(lanes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.getAttribute('data-health-state')).toBe('unwired');
  });
});

describe('ArcSurface — honest absence: no store ≠ no arcs', () => {
  it('renders three DIFFERENT answers for loading, no-store and no-arcs', () => {
    const { rerender } = render(<ArcSurface arcs={undefined} now={NOW} />);
    expect(screen.getByTestId('arc-lanes').textContent).toContain('Reading arcs…');

    rerender(<ArcSurface arcs={null} now={NOW} />);
    // "the store isn't here" must never render as a confident "no arcs".
    expect(screen.getByTestId('arc-lanes-no-store')).not.toBeNull();

    rerender(<ArcSurface arcs={[]} now={NOW} />);
    expect(screen.queryByTestId('arc-lanes-no-store')).toBeNull();
    expect(screen.getByTestId('arc-lanes').textContent).toContain('No active arcs.');
  });

  it('drops closed arcs from the lanes (ADR-0239 D3’s active-only default)', () => {
    render(<ArcSurface arcs={[arc({ id: 'live-arc' }), arc({ id: 'done-arc', lifecycle: 'closed' })]} now={NOW} />);
    expect(screen.getByTestId('arc-lane:live-arc')).not.toBeNull();
    expect(screen.queryByTestId('arc-lane:done-arc')).toBeNull();
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
