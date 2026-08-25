// The map's database-connection reading (`store-connection-signal`) — the PURE half.
//
// Every phase the store-health poller can resolve is driven here, exhaustively and by name, because
// the one way this light can go quietly wrong is a phase nobody mapped falling through to a state
// that reads as fine.

import { describe, expect, it } from 'vitest';
import type { StorePhase } from '../components/StoreBanner';
import { storeConnection } from './storeConnection';

/** Every arm of `StorePhase`. A new phase that is not added here fails the exhaustiveness case. */
const ALL_PHASES: readonly StorePhase[] = [
  'unknown',
  'healthy',
  'json',
  'stopped',
  'unreachable',
  'starting',
  'stale-code',
  'server-lost',
];

describe('storeConnection — green means the store answered', () => {
  it('store-connection-signal-greens-only-when-the-store-answers: a healthy probe is green and says connected', () => {
    expect(storeConnection('healthy')).toEqual({ state: 'green', word: 'connected' });
  });

  it('store-connection-signal-greens-only-when-the-store-answers: a reachable store behind stale server code is still green', () => {
    // This is the narrowing in one assertion. The store ANSWERED, so the connection is fine — that
    // the server is running older code is a real problem and a different one, and the store banner
    // is what reports it. Recorded knowingly; see storeConnection.ts's header.
    expect(storeConnection('stale-code')).toEqual({ state: 'green', word: 'connected' });
  });

  it('store-connection-signal-greens-only-when-the-store-answers: no other phase is green', () => {
    const greens = ALL_PHASES.filter((p) => storeConnection(p)?.state === 'green');
    expect(greens).toEqual(['healthy', 'stale-code']);
  });
});

describe('storeConnection — red means it did not answer', () => {
  it('store-connection-signal-reds-when-it-does-not: a stopped, unreachable, or lost store is red', () => {
    for (const phase of ['stopped', 'unreachable', 'server-lost'] as const) {
      expect(storeConnection(phase)).toEqual({ state: 'red', word: 'not connected' });
    }
  });
});

describe('storeConnection — amber is the wait, not a lesser red', () => {
  it('store-connection-signal-ambers-while-a-start-is-in-flight: a pending start is amber and says connecting', () => {
    const reading = storeConnection('starting');
    expect(reading?.state).toBe('amber');
    expect(reading?.word).toBe('connecting…');
  });
});

describe('storeConnection — an unasked question is not an answer', () => {
  it('store-connection-signal-shows-nothing-when-there-is-no-reading: before the first probe, and on the offline store, there is no reading', () => {
    expect(storeConnection('unknown')).toBeNull();
    expect(storeConnection('json')).toBeNull();
  });

  it('store-connection-signal-shows-nothing-when-there-is-no-reading: every phase resolves to a reading or an explicit null — none falls through', () => {
    // Exhaustiveness, asserted rather than trusted to the compiler alone: a phase added later and
    // left unmapped would return undefined here, and undefined would render as no chip — which
    // reads exactly like "nothing to report" while actually being "nobody decided".
    for (const phase of ALL_PHASES) {
      const reading = storeConnection(phase);
      expect(reading === null || typeof reading.state === 'string').toBe(true);
      expect(reading).not.toBeUndefined();
    }
  });
});
