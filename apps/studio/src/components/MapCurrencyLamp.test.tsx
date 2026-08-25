// @vitest-environment jsdom
//
// The forest currency signal's RENDER (ADR-0445 D3/D4/D5, `map-currency-signal`). The pure reading
// is proved next door in `lib/mapCurrency.test.ts`; this file is about what reaches the screen —
// that amber names WHICH cause on hover with its own remedy, that the lamp offers nothing to act
// on, and that a `null` reading paints no state at all.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { mapCurrency } from '../lib/mapCurrency';
import { MapCurrencyLamp } from './MapCurrencyLamp';

afterEach(cleanup);

const GREEN = mapCurrency({
  painted: true,
  provisional: false,
  loadFailed: false,
  code: { serverCodeMoved: false, behindMain: 0 },
});
const CACHED = mapCurrency({
  painted: true,
  provisional: true,
  loadFailed: false,
  code: { serverCodeMoved: false, behindMain: 0 },
});
const BEHIND = mapCurrency({
  painted: true,
  provisional: false,
  loadFailed: false,
  code: { serverCodeMoved: false, behindMain: 5 },
});
const NO_DATA = mapCurrency({ painted: false, provisional: false, loadFailed: true, code: null });

/** The rendered state marker — read off the marked element rather than guessed at a nesting level. */
function stateOf(): string | null {
  const marked = screen.getByTestId('map-currency-dock').querySelector('[data-currency-state]');
  return marked?.getAttribute('data-currency-state') ?? null;
}

describe('MapCurrencyLamp — three states, each visibly its own', () => {
  it('map-currency-signal-answers-currency-not-connectivity: a current view paints green and says so in words', () => {
    render(<MapCurrencyLamp reading={GREEN} />);
    expect(stateOf()).toBe('green');
    expect(screen.getByTestId('map-currency').textContent).toContain('current');
  });

  it('map-currency-signal-ambers-on-a-cached-paint: a cached paint paints amber, not green', () => {
    render(<MapCurrencyLamp reading={CACHED} />);
    expect(stateOf()).toBe('amber');
  });

  it('map-currency-signal-reds-only-when-nothing-is-painted: no data at all paints red and names that fact', () => {
    render(<MapCurrencyLamp reading={NO_DATA} />);
    expect(stateOf()).toBe('red');
    expect(screen.getByTestId('map-currency').textContent).toContain('no data');
  });

  it('map-currency-signal-withholds-a-reading-until-it-has-one: a null reading renders no lamp at all', () => {
    render(<MapCurrencyLamp reading={null} />);
    expect(screen.queryByTestId('map-currency-dock')).toBeNull();
  });
});

describe('MapCurrencyLamp — amber names WHICH cause, with its own remedy (ADR-0445 D4)', () => {
  it('map-currency-signal-names-a-distinct-remedy-per-cause: the cached-paint hover carries the reconnect remedy, not a rebuild', () => {
    render(<MapCurrencyLamp reading={CACHED} />);
    const hover = screen.getByTestId('map-currency').getAttribute('title') ?? '';
    expect(hover).toMatch(/reconnect/i);
    expect(hover).not.toMatch(/rebuild/i);
  });

  it('map-currency-signal-names-a-distinct-remedy-per-cause: the behind-main hover carries the rebuild remedy and the commit count', () => {
    render(<MapCurrencyLamp reading={BEHIND} />);
    const hover = screen.getByTestId('map-currency').getAttribute('title') ?? '';
    expect(hover).toMatch(/rebuild and relaunch/i);
    expect(hover).toContain('5 commits behind main');
    // The two amber causes must not converge on one remedy — that convergence is precisely the
    // failure D4 names, and it would be invisible from either test alone.
    expect(hover).not.toMatch(/reconnect/i);
  });

  it('map-currency-signal-ambers-when-the-app-is-behind-main: the expanded detail lists each cause with its remedy', () => {
    render(<MapCurrencyLamp reading={BEHIND} />);
    expect(screen.queryByTestId('map-currency-detail')).toBeNull();
    fireEvent.click(screen.getByTestId('map-currency'));
    const detail = screen.getByTestId('map-currency-detail');
    expect(detail.querySelector('[data-cause="app-behind-main"]')).not.toBeNull();
    expect(detail.textContent).toMatch(/Rebuild and relaunch/i);
  });
});

describe('MapCurrencyLamp — it discloses and never blocks (ADR-0445 D5)', () => {
  it('map-currency-signal-discloses-without-blocking: the only control is the disclosure itself — nothing to dismiss, gate or repaint', () => {
    render(<MapCurrencyLamp reading={BEHIND} />);
    const dock = screen.getByTestId('map-currency-dock');
    // ONE button, and it is the expander. A "dismiss"/"hide"/"ignore" affordance here would be the
    // second, louder refusal layered over the world's own honest under-claim (ADR-0040).
    const buttons = dock.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute('data-testid')).toBe('map-currency');
    fireEvent.click(screen.getByTestId('map-currency'));
    expect(dock.querySelectorAll('button')).toHaveLength(1);
  });

  it('map-currency-signal-discloses-without-blocking: amber says the view may under-claim, never that a green is suspect', () => {
    render(<MapCurrencyLamp reading={BEHIND} />);
    fireEvent.click(screen.getByTestId('map-currency'));
    const text = screen.getByTestId('map-currency-detail').textContent ?? '';
    expect(text).toMatch(/under-claiming/i);
    // Green derives from a signed verdict and cannot over-claim (ADR-0040). Wording that cast doubt
    // on what IS painted green would be wrong in the one direction this signal must never go.
    expect(text).not.toMatch(/wrong|suspect|unreliable|do not trust/i);
  });
});
