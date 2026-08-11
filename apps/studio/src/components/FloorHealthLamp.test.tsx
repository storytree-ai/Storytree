// @vitest-environment jsdom
//
// The factory-floor lamp (ADR-0349, amending ADR-0314 D7's placement; instrument ADR-0316).
//
// This suite is the old `FloorHealthStrip.test.tsx` carried forward. Every refusal it fenced is
// re-asserted here, because the reading's PLACEMENT changed and none of its rules did:
//   1. the signal type has no field that can carry a filing / session / report count at all, so the
//      forbidden metric cannot be passed in even by a session that wanted to;
//   2. it never renders "the floor is fine" on the strength of not having looked — a pending read
//      and a declined figure each get their own state, and neither collapses into `quiet`
//      (ADR-0316 D2's refusal, carried to the lamp);
//   3. it does not light on the first recurrence. The threshold is a decision with a stated reason
//      (`LOUD_AT_RECURRENCES`), and it stays auditable from the surface rather than only from source.
//
// TWO ASSERTIONS CHANGED SHAPE WITH THE MOVE, AND BOTH ARE CALLED OUT WHERE THEY APPEAR RATHER THAN
// QUIETLY RELAXED — the old "no buttons at all" proxy for read-only, and where the sub-threshold
// figure is printed. Neither rule was weakened; the surface they were written against became a
// disclosure rather than an always-open band.
//
// No backend seam (no `api`, no fetch, no socket, no DB); no agent / drive / model import (the
// modelPathBoundary.test.ts wall stays green). The lamp's exact look is the arc's operator-attested
// UAT leg (ADR-0070) — deliberately not asserted here.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import {
  FloorHealthLamp,
  floorLampState,
  LOUD_AT_RECURRENCES,
  type FloorHealthBand,
  type FloorHealthSignal,
  type FloorLampState,
} from './FloorHealthLamp';

afterEach(cleanup);

const lamp = (): HTMLElement => screen.getByTestId('floor-lamp');
const state = (): string | null => screen.getByTestId('floor-lamp').closest('.floor-lamp')!.getAttribute('data-lamp-state');
/** Open the disclosure — the detail is one click away rather than always on screen. */
const openDetail = (): HTMLElement => {
  fireEvent.click(lamp());
  return screen.getByTestId('floor-lamp-detail');
};

describe('FloorHealthLamp — present, and quiet by default (ADR-0314 D7, placed by ADR-0349)', () => {
  it('renders the lamp with nothing wired, marked `unwired`', () => {
    render(<FloorHealthLamp />);
    // Persistent placement is the point: the lamp is present even when there is nothing to say. What
    // ADR-0349 changed is WHERE that persistence holds — the map, not a lens behind `?overlay=arcs`.
    expect(state()).toBe('unwired');
  });

  it('the unwired lamp shows NO figure — no volume count stands in for a missing reading', () => {
    // The only number that exists without the instrument is the raw reinforcement count, which is
    // exactly the filing volume that closed a whole arc when it was used as a health metric — so an
    // absent reading renders no number at all, and no pips either.
    render(<FloorHealthLamp signal={null} />);
    expect(screen.getByTestId('floor-lamp-dock').textContent ?? '').not.toMatch(/\d/);
    expect(screen.getByTestId('floor-lamp-dock').querySelector('.floor-lamp-pip')).toBeNull();
  });

  it('an instrument reporting no recurring bottleneck reads `quiet`, with its window attached', () => {
    const signal: FloorHealthSignal = {
      bottlenecks: [],
      window: '2026-08-01 → 2026-08-06',
      collapsingRule: 'routed items collapsed by cause',
    };
    render(<FloorHealthLamp signal={signal} />);
    expect(state()).toBe('quiet');
    // ADR-0316 D2: every figure carries the window it was computed over.
    expect(openDetail().textContent).toContain('2026-08-01 → 2026-08-06');
  });
});

describe('FloorHealthLamp — no figure is never "the floor is fine" (ADR-0316 D2)', () => {
  it('a read still in flight reads `reading`, not `quiet`', () => {
    render(<FloorHealthLamp signal={{ pending: true }} />);
    expect(state()).toBe('reading');
  });

  it('a DECLINED figure names the condition that stopped it, and never falls back to quiet', () => {
    // The instrument's own rule where a window cannot support a figure: name the condition that
    // failed instead of printing something that reads as progress. The lamp owes the same honesty —
    // reporting a healthy floor on the strength of not having looked is the one reading it must
    // never produce.
    render(<FloorHealthLamp signal={{ declined: 'needs the live store — this backend has none' }} />);
    expect(state()).toBe('declined');
    expect(openDetail().textContent).toContain('needs the live store — this backend has none');
  });

  it('every no-figure state is distinguishable from every other — they are different facts', () => {
    // The desktop mirror (mirrored-route-conformance) exists precisely to keep `declined` separable
    // from `quiet`; a relocation that collapsed any of these into another would defeat that pair.
    const cases: Array<[FloorHealthBand | null, FloorLampState]> = [
      [null, 'unwired'],
      [{ pending: true }, 'reading'],
      [{ declined: 'the read did not answer' }, 'declined'],
      [{ bottlenecks: [], window: 'all history → now', collapsingRule: 'r' }, 'quiet'],
    ];
    for (const [band, expected] of cases) {
      expect(floorLampState(band)).toBe(expected);
    }
    expect(new Set(cases.map(([, e]) => e)).size).toBe(cases.length);
  });
});

describe('FloorHealthLamp — lit on a recurring DISTINCT bottleneck, never on volume', () => {
  const loud: FloorHealthSignal = {
    bottlenecks: [
      { id: 'coupling-churn-from-shared-substrate', cause: 're-sync churn from shared substrate edits', recurrences: 8 },
    ],
    window: '2026-07-11 → 2026-08-06',
    collapsingRule: 'un-discharged routed friction, collapsed by cause',
  };

  it('goes loud, naming each distinct cause and its recurrence since routing', () => {
    render(<FloorHealthLamp signal={loud} />);
    expect(state()).toBe('loud');

    const list = within(openDetail()).getByLabelText('recurring bottlenecks');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list.textContent).toContain('re-sync churn from shared substrate edits');
    expect(list.textContent).toContain('recurred 8×');
  });

  it('links each cause into its Library artifact — a read, not an affordance to act', () => {
    render(<FloorHealthLamp signal={loud} />);
    const link = within(openDetail()).getByRole('link');
    expect(link.getAttribute('href')).toBe('#/asset/coupling-churn-from-shared-substrate');
  });

  it('prints the collapsing rule with the figure — a hidden rule is an unaudited number', () => {
    // ADR-0316 D3: "a distinctness count whose rule is hidden is just a different unaudited number".
    // The band this replaces had to ellipsise this onto one line to avoid growing to 100px; the
    // disclosure gives it room to be read in full, which is what D3 actually asks for.
    render(<FloorHealthLamp signal={loud} />);
    const detail = openDetail();
    expect(detail.textContent).toContain('un-discharged routed friction, collapsed by cause');
    expect(detail.textContent).toContain('2026-07-11 → 2026-08-06');
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
    //
    // ⚠ THIS ASSERTION CHANGED SHAPE, AND THE RULE DID NOT. The band asserted `no buttons at all`,
    // which was a sound proxy while the reading was always-open prose. The lamp is a DISCLOSURE, so
    // it necessarily owns one button — the one that opens its own provenance. That is a READ, the
    // same class as the artifact deep-link beside it. What D4 forbids is acting ON the reading, so
    // the fence is now stated directly: the only control is the disclosure, and nothing offers to
    // dismiss, discharge, route, acknowledge or snooze.
    render(<FloorHealthLamp signal={loud} />);
    const dock = screen.getByTestId('floor-lamp-dock');
    fireEvent.click(lamp());
    const buttons = within(dock).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBe(lamp());
    expect(within(dock).queryAllByRole('textbox')).toEqual([]);
    expect(within(dock).queryAllByRole('checkbox')).toEqual([]);
    // The blocklist scans CONTROL LABELS, never the panel's prose — the collapsing rule legitimately
    // contains "un-discharged routed friction", and a scan over free text would fail on the very
    // provenance ADR-0316 D3 requires the lamp to print.
    const controlText = [...within(dock).getAllByRole('button'), ...within(dock).getAllByRole('link')]
      .map((el) => `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''}`.toLowerCase())
      .join(' ');
    expect(controlText).not.toMatch(/dismiss|discharge|acknowledge|snooze|resolve|mute/);
  });

  it('the lamp is inert when there is nothing to disclose — no empty panel', () => {
    render(<FloorHealthLamp />);
    fireEvent.click(lamp());
    expect(screen.queryByTestId('floor-lamp-detail')).toBeNull();
  });
});

describe('FloorHealthLamp — the threshold is a decision, not a fall-out of the code', () => {
  const once = (recurrences: number): FloorHealthSignal => ({
    bottlenecks: [{ id: 'a-cause', cause: 'a cause that came back', recurrences }],
    window: 'all history → now',
    collapsingRule: 'collapsed by authored join edges',
  });

  it('ONE recurrence does not light the lamp — measured on the live board, one is the background', () => {
    // Against the live board on 2026-08-08 the loudest live cause carried exactly one post-route
    // recurrence, so a lamp that lights at one is lit on day one and permanently after. A lamp that
    // is always lit is furniture, which is the opposite of what a persistent instrument is for.
    render(<FloorHealthLamp signal={once(1)} />);
    expect(state()).toBe('quiet');
  });

  it('draws the threshold at rest: one pip per required recurrence, filled by the loudest cause', () => {
    // ⚠ THE SECOND CHANGED ASSERTION. The band PRINTED the withheld figure inline because it had a
    // full row to print it in. The lamp is small, so the same auditability is carried two ways: the
    // pip row encodes the bar and how far the loudest cause climbed WITHOUT a click, and the figure
    // itself is one disclosure away (asserted next). The rule — an owner who thinks one recurrence
    // deserves shouting must be able to see exactly what was withheld — is unchanged.
    render(<FloorHealthLamp signal={once(1)} />);
    const pips = screen.getByTestId('floor-lamp-dock').querySelectorAll('.floor-lamp-pip');
    expect(pips).toHaveLength(LOUD_AT_RECURRENCES);
    expect(screen.getByTestId('floor-lamp-dock').querySelectorAll('.floor-lamp-pip.on')).toHaveLength(1);
  });

  it('the quiet lamp still SHOWS the sub-threshold figure and the bar it did not clear', () => {
    render(<FloorHealthLamp signal={once(1)} />);
    const detail = openDetail();
    expect(detail.textContent).toContain('a cause that came back');
    expect(detail.textContent).toContain('once');
    expect(detail.textContent).toContain(String(LOUD_AT_RECURRENCES));
  });

  it('lights at the threshold and stays lit above it', () => {
    for (const n of [LOUD_AT_RECURRENCES, LOUD_AT_RECURRENCES + 5]) {
      expect(floorLampState(once(n))).toBe('loud');
    }
    expect(floorLampState(once(LOUD_AT_RECURRENCES - 1))).toBe('quiet');
  });

  it('a sub-threshold cause is listed as BELOW the bar, never mixed in as if it had cleared it', () => {
    // The band showed only qualifying causes, because a persistent always-open row had to stay
    // short. The disclosure can afford to show both — which is strictly more auditable — but only if
    // the two are never confusable, so a sub-threshold row is marked and says which bar it missed.
    render(
      <FloorHealthLamp
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
    const list = within(openDetail()).getByLabelText('recurring bottlenecks');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const below = rows.filter((r) => r.hasAttribute('data-below'));
    expect(below).toHaveLength(1);
    expect(below[0]!.textContent).toContain('came back once');
    expect(below[0]!.textContent).toContain(`below ${LOUD_AT_RECURRENCES}`);
    // and the qualifying one is NOT marked below
    expect(rows.find((r) => !r.hasAttribute('data-below'))!.textContent).toContain('the remedy did not take');
  });
});
