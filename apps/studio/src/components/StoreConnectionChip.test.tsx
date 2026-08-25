// @vitest-environment jsdom
//
// The database-connection light's RENDER (`store-connection-signal`). The reading is proved next
// door in `lib/storeConnection.test.ts`; this file is about what reaches the screen — that each
// state is distinguishable, that the whole message is on the face, and that the chip carries
// nothing to act on.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { storeConnection } from '../lib/storeConnection';
import { StoreConnectionChip } from './StoreConnectionChip';

afterEach(cleanup);

describe('StoreConnectionChip — three states, each visibly its own', () => {
  it('store-connection-signal-greens-only-when-the-store-answers: a connected store paints green and says so', () => {
    render(<StoreConnectionChip reading={storeConnection('healthy')} />);
    const chip = screen.getByTestId('store-connection');
    expect(chip.getAttribute('data-connection-state')).toBe('green');
    expect(chip.textContent).toBe('databaseconnected');
  });

  it('store-connection-signal-reds-when-it-does-not: an unreachable store paints red and says so', () => {
    render(<StoreConnectionChip reading={storeConnection('unreachable')} />);
    const chip = screen.getByTestId('store-connection');
    expect(chip.getAttribute('data-connection-state')).toBe('red');
    expect(chip.textContent).toBe('databasenot connected');
  });

  it('store-connection-signal-ambers-while-a-start-is-in-flight: a pending start paints amber and says so', () => {
    render(<StoreConnectionChip reading={storeConnection('starting')} />);
    const chip = screen.getByTestId('store-connection');
    expect(chip.getAttribute('data-connection-state')).toBe('amber');
    expect(chip.textContent).toBe('databaseconnecting…');
  });

  it('store-connection-signal-shows-nothing-when-there-is-no-reading: a null reading renders no chip at all', () => {
    render(<StoreConnectionChip reading={null} />);
    expect(screen.queryByTestId('store-connection')).toBeNull();
  });
});

describe('StoreConnectionChip — nothing to click, nothing to explain', () => {
  it('store-connection-signal-carries-no-affordance: the chip holds no control and no hover text', () => {
    render(<StoreConnectionChip reading={storeConnection('unreachable')} />);
    const chip = screen.getByTestId('store-connection');
    // The owner's instruction was that it should not need an explanation. A `title`, a button, or a
    // link here would each be a way for one to creep back in — and the store banner already owns
    // the recovery UX, so a control here would be a second, competing path over one signal.
    expect(chip.querySelectorAll('button, a, [role="button"]')).toHaveLength(0);
    expect(chip.getAttribute('title')).toBeNull();
    expect(chip.querySelector('[title]')).toBeNull();
  });

  it('store-connection-signal-carries-no-affordance: the whole message is the two words on the face', () => {
    // Nothing is hidden behind an interaction: what the chip says when you look at it is all it
    // has. `word` is short enough to read at a glance, which is the constraint that keeps it so.
    for (const phase of ['healthy', 'starting', 'unreachable'] as const) {
      cleanup();
      const reading = storeConnection(phase);
      render(<StoreConnectionChip reading={reading} />);
      const chip = screen.getByTestId('store-connection');
      expect(chip.textContent).toContain(reading?.word ?? '');
      expect((reading?.word ?? '').split(' ').length).toBeLessThanOrEqual(2);
    }
  });
});
