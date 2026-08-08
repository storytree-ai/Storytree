// @vitest-environment jsdom
//
// The factory-floor health strip (ADR-0314 D7, instrument ADR-0316, wired 2026-08-08).
//
// The assertions that matter are about what the strip REFUSES:
//   1. its signal type has no field that can carry a filing / session / report count at all, so the
//      forbidden metric cannot be passed in even by a session that wanted to;
//   2. it never renders "the floor is fine" on the strength of not having looked — a pending read
//      and a declined figure each get their own state, and neither collapses into `quiet`
//      (ADR-0316 D2's refusal, carried to the band);
//   3. it does not go loud on the first recurrence. The threshold is a decision with a stated
//      reason (`LOUD_AT_RECURRENCES`), and the quiet band prints the figure it withheld so the
//      decision is auditable from the surface rather than only from the source.
//
// No backend seam (no `api`, no fetch, no socket, no DB); no agent / drive / model import (the
// modelPathBoundary.test.ts wall stays green). The band's exact look is the arc's operator-attested
// UAT leg (ADR-0070) — deliberately not asserted here.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { FloorHealthStrip, LOUD_AT_RECURRENCES, type FloorHealthSignal } from './FloorHealthStrip';

afterEach(cleanup);

describe('FloorHealthStrip — persistent, and quiet by default (ADR-0314 D7)', () => {
  it('renders the band with nothing wired, marked `unwired`', () => {
    render(<FloorHealthStrip />);
    const strip = screen.getByTestId('floor-health-strip');
    // Persistent placement is the point: the band is present even when there is nothing to say.
    expect(strip.getAttribute('data-health-state')).toBe('unwired');
  });

  it('the unwired band shows NO figure — no volume count stands in for a missing reading', () => {
    // The only number that exists without the instrument is the raw reinforcement count, which is
    // exactly the filing volume that closed a whole arc when it was used as a health metric — so an
    // absent reading renders no number at all.
    render(<FloorHealthStrip signal={null} />);
    const strip = screen.getByTestId('floor-health-strip');
    expect(strip.textContent ?? '').not.toMatch(/\d/);
  });

  it('an instrument reporting no recurring bottleneck reads `quiet`, with its window attached', () => {
    const signal: FloorHealthSignal = {
      bottlenecks: [],
      window: '2026-08-01 → 2026-08-06',
      collapsingRule: 'routed items collapsed by cause',
    };
    render(<FloorHealthStrip signal={signal} />);
    const strip = screen.getByTestId('floor-health-strip');
    expect(strip.getAttribute('data-health-state')).toBe('quiet');
    // ADR-0316 D2: every figure carries the window it was computed over.
    expect(strip.textContent).toContain('2026-08-01 → 2026-08-06');
  });
});

describe('FloorHealthStrip — no figure is never "the floor is fine" (ADR-0316 D2)', () => {
  it('a read still in flight reads `reading`, not `quiet`', () => {
    render(<FloorHealthStrip signal={{ pending: true }} />);
    const strip = screen.getByTestId('floor-health-strip');
    expect(strip.getAttribute('data-health-state')).toBe('reading');
  });

  it('a DECLINED figure names the condition that stopped it, and never falls back to quiet', () => {
    // The instrument's own rule where a window cannot support a figure: name the condition that
    // failed instead of printing something that reads as progress. The band owes the same honesty —
    // reporting a healthy floor on the strength of not having looked is the one reading it must
    // never produce.
    render(<FloorHealthStrip signal={{ declined: 'needs the live store — this backend has none' }} />);
    const strip = screen.getByTestId('floor-health-strip');
    expect(strip.getAttribute('data-health-state')).toBe('declined');
    expect(strip.textContent).toContain('needs the live store — this backend has none');
  });

  it('every no-figure state is distinguishable from every other — they are different facts', () => {
    const states = [
      [null, 'unwired'],
      [{ pending: true }, 'reading'],
      [{ declined: 'the read did not answer' }, 'declined'],
    ] as const;
    for (const [band, expected] of states) {
      const { unmount } = render(<FloorHealthStrip signal={band} />);
      expect(screen.getByTestId('floor-health-strip').getAttribute('data-health-state')).toBe(expected);
      unmount();
    }
  });
});

describe('FloorHealthStrip — loud on a recurring DISTINCT bottleneck, never on volume', () => {
  const loud: FloorHealthSignal = {
    bottlenecks: [
      { id: 'coupling-churn-from-shared-substrate', cause: 're-sync churn from shared substrate edits', recurrences: 8 },
    ],
    window: '2026-07-11 → 2026-08-06',
    collapsingRule: 'un-discharged routed friction, collapsed by cause',
  };

  it('goes loud, naming each distinct cause and its recurrence since routing', () => {
    render(<FloorHealthStrip signal={loud} />);
    const strip = screen.getByTestId('floor-health-strip');
    expect(strip.getAttribute('data-health-state')).toBe('loud');

    const list = within(strip).getByLabelText('recurring bottlenecks');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list.textContent).toContain('re-sync churn from shared substrate edits');
    expect(list.textContent).toContain('recurred 8×');
  });

  it('links each cause into its Library artifact — a read, not an affordance to act', () => {
    render(<FloorHealthStrip signal={loud} />);
    const link = within(screen.getByTestId('floor-health-strip')).getByRole('link');
    expect(link.getAttribute('href')).toBe('#/asset/coupling-churn-from-shared-substrate');
  });

  it('prints the collapsing rule with the figure — a hidden rule is an unaudited number', () => {
    // ADR-0316 D3: "a distinctness count whose rule is hidden is just a different unaudited number".
    render(<FloorHealthStrip signal={loud} />);
    const strip = screen.getByTestId('floor-health-strip');
    expect(strip.textContent).toContain('un-discharged routed friction, collapsed by cause');
    expect(strip.textContent).toContain('2026-07-11 → 2026-08-06');
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

describe('FloorHealthStrip — the threshold is a decision, not a fall-out of the code', () => {
  const once = (recurrences: number): FloorHealthSignal => ({
    bottlenecks: [{ id: 'a-cause', cause: 'a cause that came back', recurrences }],
    window: 'all history → now',
    collapsingRule: 'collapsed by authored join edges',
  });

  it('ONE recurrence does not shout — measured on the live board, one is the background', () => {
    // Against the live board on 2026-08-08 the loudest live cause carried exactly one post-route
    // recurrence, so a band that lights at one is loud on day one and permanently after. A band
    // that is always loud is furniture, which is the opposite of what a persistent strip is for.
    render(<FloorHealthStrip signal={once(1)} />);
    expect(screen.getByTestId('floor-health-strip').getAttribute('data-health-state')).toBe('quiet');
  });

  it('the quiet band still PRINTS the sub-threshold figure and the bar it did not clear', () => {
    // The threshold has to be auditable from the surface, not only from the source: an owner who
    // thinks one recurrence deserves shouting must be able to see exactly what was withheld.
    render(<FloorHealthStrip signal={once(1)} />);
    const strip = screen.getByTestId('floor-health-strip');
    expect(strip.textContent).toContain('a cause that came back');
    expect(strip.textContent).toContain('once');
    expect(strip.textContent).toContain(String(LOUD_AT_RECURRENCES));
  });

  it('goes loud at the threshold and stays loud above it', () => {
    for (const n of [LOUD_AT_RECURRENCES, LOUD_AT_RECURRENCES + 5]) {
      const { unmount } = render(<FloorHealthStrip signal={once(n)} />);
      expect(screen.getByTestId('floor-health-strip').getAttribute('data-health-state')).toBe('loud');
      unmount();
    }
    const { unmount } = render(<FloorHealthStrip signal={once(LOUD_AT_RECURRENCES - 1)} />);
    expect(screen.getByTestId('floor-health-strip').getAttribute('data-health-state')).toBe('quiet');
    unmount();
  });

  it('the loud band lists only the causes that cleared the bar', () => {
    render(
      <FloorHealthStrip
        signal={{
          bottlenecks: [
            { id: 'loud-one', cause: 'the remedy did not take', recurrences: LOUD_AT_RECURRENCES },
            { id: 'quiet-one', cause: 'came back once', recurrences: 1 },
          ],
          window: 'all history → now',
          collapsingRule: 'collapsed by authored join edges',
        }}
      />,
    );
    const list = within(screen.getByTestId('floor-health-strip')).getByLabelText('recurring bottlenecks');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list.textContent).toContain('the remedy did not take');
    expect(list.textContent).not.toContain('came back once');
  });
});
