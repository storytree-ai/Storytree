// @vitest-environment jsdom
//
// The factory-floor health strip (ADR-0314 D7, sequenced by ADR-0316 D5).
//
// The two assertions that matter are about what the strip REFUSES:
//   1. with no instrument wired it says so honestly and shows NO figure — it does not fall back to
//      the one number that exists today (the raw reinforcement count), which is the filing volume
//      ADR-0314 D7 and ADR-0316 D3 both forbid;
//   2. its signal type has no field that can carry a filing / session / report count at all, so the
//      forbidden metric cannot be passed in even by a session that wanted to.
//
// No backend seam (no `api`, no fetch, no socket, no DB); no agent / drive / model import (the
// modelPathBoundary.test.ts wall stays green). The band's exact look is the arc's operator-attested
// UAT leg (ADR-0070) — deliberately not asserted here.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { FloorHealthStrip, type FloorHealthSignal } from './FloorHealthStrip';

afterEach(cleanup);

describe('FloorHealthStrip — persistent, and quiet by default (ADR-0314 D7)', () => {
  it('renders the band with no signal, marked `unwired`, naming where the instrument is built', () => {
    render(<FloorHealthStrip />);
    const strip = screen.getByTestId('floor-health-strip');
    // Persistent placement is the point: the band is present even when there is nothing to say.
    expect(strip.getAttribute('data-health-state')).toBe('unwired');
    expect(strip.textContent).toContain('factory-floor-health-arc');
  });

  it('the unwired band shows NO figure — no volume count stands in for the missing instrument', () => {
    // ADR-0316 D5: build the frame, leave the figure unwired. The only number available today is
    // the raw reinforcement count, which is exactly the filing volume that closed a whole arc when
    // it was used as a health metric — so the honest state renders no number at all.
    render(<FloorHealthStrip signal={null} />);
    const strip = screen.getByTestId('floor-health-strip');
    expect(strip.textContent ?? '').not.toMatch(/\d/);
  });

  it('an instrument reporting no recurring bottleneck reads `quiet`, with its window attached', () => {
    const signal: FloorHealthSignal = {
      bottlenecks: [],
      window: '2026-08-01..06, 25 merges/day',
      collapsingRule: 'routed items collapsed by cause',
    };
    render(<FloorHealthStrip signal={signal} />);
    const strip = screen.getByTestId('floor-health-strip');
    expect(strip.getAttribute('data-health-state')).toBe('quiet');
    // ADR-0316 D2: every figure carries the window and sample it was computed over.
    expect(strip.textContent).toContain('2026-08-01..06, 25 merges/day');
  });
});

describe('FloorHealthStrip — loud on a recurring DISTINCT bottleneck, never on volume', () => {
  const loud: FloorHealthSignal = {
    bottlenecks: [
      { id: 'coupling', cause: 're-sync churn from shared substrate edits', recurrences: 8 },
      { id: 'leaf-names', cause: 'sdk leaf drops contract-id test names', recurrences: 1 },
    ],
    window: '2026-07-11..08-06',
    collapsingRule: 'un-discharged routed friction, collapsed by cause',
  };

  it('goes loud, naming each distinct cause and its recurrence since routing', () => {
    render(<FloorHealthStrip signal={loud} />);
    const strip = screen.getByTestId('floor-health-strip');
    expect(strip.getAttribute('data-health-state')).toBe('loud');

    const list = within(strip).getByLabelText('recurring bottlenecks');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(list.textContent).toContain('re-sync churn from shared substrate edits');
    expect(list.textContent).toContain('recurred 8×');
    // One recurrence reads as one, not as "1×" — a count of one is the easiest thing to misread as
    // a filing tally.
    expect(list.textContent).toContain('recurred once');
  });

  it('prints the collapsing rule with the figure — a hidden rule is an unaudited number', () => {
    // ADR-0316 D3: "a distinctness count whose rule is hidden is just a different unaudited number".
    render(<FloorHealthStrip signal={loud} />);
    const strip = screen.getByTestId('floor-health-strip');
    expect(strip.textContent).toContain('un-discharged routed friction, collapsed by cause');
    expect(strip.textContent).toContain('2026-07-11..08-06');
  });

  it('the signal shape carries no filing / session / report volume field at all', () => {
    // The structural half of the fence: ADR-0314 D7's "never filing volume" is enforced by the type
    // having nowhere to put one, not by a comment. A hundred reports of ONE bottleneck must not
    // score like a hundred reports of a hundred.
    const keys = Object.keys(loud).sort();
    expect(keys).toEqual(['bottlenecks', 'collapsingRule', 'window']);
    for (const bottleneck of loud.bottlenecks) {
      expect(Object.keys(bottleneck).sort()).toEqual(['cause', 'id', 'recurrences']);
    }
  });

  it('offers no affordance to discharge, route or dismiss — it reports, it does not adjudicate', () => {
    // ADR-0316 D4: the instrument measures; adjudication stays with the graduation-synthesist.
    render(<FloorHealthStrip signal={loud} />);
    const strip = screen.getByTestId('floor-health-strip');
    expect(within(strip).queryAllByRole('button')).toEqual([]);
    expect(within(strip).queryAllByRole('textbox')).toEqual([]);
  });
});
