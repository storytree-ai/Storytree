// The forest currency reading (ADR-0445 D3/D4/D5, `map-currency-signal`) — the PURE half.
//
// The suite that matters most here is the first one: it replays the 2026-08-25 incident with the
// store perfectly reachable, which is exactly the shape a connectivity light certifies as fine. If
// a later change makes {@link mapCurrency} read GREEN on those inputs, the signal has silently
// collapsed back into the narrower question it was widened out of, and that test is what says so.

import { describe, expect, it } from 'vitest';
import { mapCurrency, type CodeCurrency, type MapCurrencyInputs } from './mapCurrency';

/** A healthy, confirmed, current view — the baseline every case below perturbs by ONE fact. */
const CURRENT: MapCurrencyInputs = {
  painted: true,
  provisional: false,
  loadFailed: false,
  code: { serverCodeMoved: false, behindMain: 0 },
};

const behind = (commits: number): CodeCurrency => ({ serverCodeMoved: false, behindMain: commits });

describe('mapCurrency — the question is currency, never connectivity', () => {
  it('map-currency-signal-answers-currency-not-connectivity: an app behind main reads amber even though the store answered perfectly', () => {
    // The measured incident: nothing in the proof layer had regressed and the database connection
    // was fine the entire time. There is no reachability input on this function at all, so the
    // ONLY thing that can move the reading here is how current the app's own code is.
    const reading = mapCurrency({ ...CURRENT, code: behind(9) });
    expect(reading?.state).toBe('amber');
    expect(reading?.causes.map((c) => c.id)).toEqual(['app-behind-main']);
  });

  it('map-currency-signal-answers-currency-not-connectivity: a confirmed paint on current code reads green', () => {
    expect(mapCurrency(CURRENT)).toEqual({ state: 'green', causes: [] });
  });
});

describe('mapCurrency — amber, and which kind', () => {
  it('map-currency-signal-ambers-on-a-cached-paint: an unconfirmed cached paint is amber, never green', () => {
    const reading = mapCurrency({ ...CURRENT, provisional: true });
    expect(reading?.state).toBe('amber');
    expect(reading?.causes.map((c) => c.id)).toEqual(['serving-cache']);
  });

  it('map-currency-signal-ambers-when-the-app-is-behind-main: one commit behind still ambers, and the count reaches the reading', () => {
    const reading = mapCurrency({ ...CURRENT, code: behind(1) });
    expect(reading?.state).toBe('amber');
    expect(reading?.causes[0]?.what).toContain('1 commit behind main');
    expect(reading?.causes[0]?.what).not.toContain('1 commits');
  });

  it('map-currency-signal-ambers-when-the-app-is-behind-main: a moved server checkout is its own cause, not the behind-main one', () => {
    const reading = mapCurrency({ ...CURRENT, code: { serverCodeMoved: true, behindMain: 0 } });
    expect(reading?.state).toBe('amber');
    expect(reading?.causes.map((c) => c.id)).toEqual(['server-code-moved']);
  });

  it('map-currency-signal-names-a-distinct-remedy-per-cause: concurrent causes are all reported, each with its own remedy', () => {
    const reading = mapCurrency({
      ...CURRENT,
      provisional: true,
      code: { serverCodeMoved: true, behindMain: 4 },
    });
    expect(reading?.state).toBe('amber');
    expect(reading?.causes.map((c) => c.id)).toEqual([
      'serving-cache',
      'server-code-moved',
      'app-behind-main',
    ]);
    // D4's whole point: the remedies DIFFER, so a single undifferentiated amber would send the
    // developer to the wrong fix. Distinctness is asserted, not assumed from the prose.
    const remedies = (reading?.causes ?? []).map((c) => c.remedy);
    expect(new Set(remedies).size).toBe(remedies.length);
    expect(remedies.every((r) => r.length > 0)).toBe(true);
  });

  it('map-currency-signal-ambers-on-a-cached-paint: a cached paint still ambers while the health probe is silent', () => {
    // Losing the studio server must not silence the signal that says the view may be stale — the
    // cause is already known from the paint itself, and no probe is needed to report it.
    const reading = mapCurrency({ ...CURRENT, provisional: true, code: null });
    expect(reading?.state).toBe('amber');
    expect(reading?.causes.map((c) => c.id)).toEqual(['serving-cache']);
  });
});

describe('mapCurrency — red is nothing at all, and a lost database is not it', () => {
  it('map-currency-signal-reds-only-when-nothing-is-painted: a failed read with nothing painted is red', () => {
    expect(mapCurrency({ painted: false, provisional: false, loadFailed: true, code: null })).toEqual({
      state: 'red',
      causes: [],
    });
  });

  it('map-currency-signal-reds-only-when-nothing-is-painted: a lost store over a cached paint is amber, not red', () => {
    // ADR-0445 D3: "losing the database drops to amber". A cached paint IS data — just not
    // confirmed data — so the connectivity reading is contained within this one rather than
    // promoted to the strongest state available.
    const reading = mapCurrency({ painted: true, provisional: true, loadFailed: false, code: null });
    expect(reading?.state).toBe('amber');
  });
});

describe('mapCurrency — an unasked question is never a green', () => {
  it('map-currency-signal-withholds-a-reading-until-it-has-one: a boot still in flight has no reading', () => {
    expect(mapCurrency({ painted: false, provisional: false, loadFailed: false, code: null })).toBeNull();
  });

  it('map-currency-signal-withholds-a-reading-until-it-has-one: a painted map with no health answer is not green', () => {
    // The data half is fine and the code half is UNKNOWN. Green would be a claim made without
    // looking — the same fault class as a check whose expectation is derived from its subject.
    expect(mapCurrency({ ...CURRENT, code: null })).toBeNull();
  });
});

describe('mapCurrency — it reports, and can do nothing else', () => {
  it('map-currency-signal-discloses-without-blocking: every reading is a state plus causes and carries no gate', () => {
    const readings = [
      mapCurrency(CURRENT),
      mapCurrency({ ...CURRENT, provisional: true }),
      mapCurrency({ painted: false, provisional: false, loadFailed: true, code: null }),
    ];
    for (const reading of readings) {
      expect(reading).not.toBeNull();
      // Structural, not editorial: adding a `blocked`/`withhold`/`hide` field to the reading would
      // have to break this, which is what keeps D5 out of comment-only territory.
      expect(Object.keys(reading ?? {}).sort()).toEqual(['causes', 'state']);
    }
  });
});
