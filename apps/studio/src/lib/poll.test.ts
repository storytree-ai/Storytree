// @vitest-environment jsdom
//
// The shared slow-poll infrastructure (lib/poll.ts) rehomed out of the retired presence lib
// (ADR-0200 D7): the cadence constant the remaining live layers ride, the store-recovered
// snap-back event, and the `now` ticker that ages wisps/blooms between polls.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
  AGE_TICK_MS,
  SLOW_POLL_MS,
  STORE_RECOVERED_EVENT,
  notifyStoreRecovered,
  useNowTick,
} from './poll';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('poll cadence', () => {
  it('keeps the one shared slow cadence (StoreBanner parity — one cost envelope)', () => {
    expect(SLOW_POLL_MS).toBe(30_000);
    expect(AGE_TICK_MS).toBe(60_000);
  });
});

describe('notifyStoreRecovered', () => {
  it('dispatches the store-recovered window event the polling hooks listen for', () => {
    const heard = vi.fn();
    window.addEventListener(STORE_RECOVERED_EVENT, heard);
    notifyStoreRecovered();
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(STORE_RECOVERED_EVENT, heard);
  });
});

describe('useNowTick', () => {
  it('re-derives `now` on the age tick so consumers age between polls with zero fetches', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useNowTick());
    const first = result.current;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGE_TICK_MS);
    });
    expect(result.current.getTime()).toBeGreaterThan(first.getTime());
  });
});
