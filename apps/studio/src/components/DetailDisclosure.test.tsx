// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DetailDisclosure } from './DetailDisclosure';

afterEach(cleanup);

describe('DetailDisclosure', () => {
  it('renders closed by default and toggles from its native summary', () => {
    const { container } = render(
      <DetailDisclosure label="Connections" count={2}>
        <p>connection rows</p>
      </DetailDisclosure>,
    );
    const details = container.querySelector('details');
    expect(details?.open).toBe(false);

    fireEvent.click(screen.getByText('Connections (2)'));
    expect(details?.open).toBe(true);
  });

  it('can start open and preserves that choice when its story content changes', () => {
    const { container, rerender } = render(
      <DetailDisclosure label="Capabilities" count={2} defaultOpen>
        <p>first story</p>
      </DetailDisclosure>,
    );
    const details = container.querySelector('details');
    expect(details?.open).toBe(true);

    fireEvent.click(screen.getByText('Capabilities (2)'));
    expect(details?.open).toBe(false);

    rerender(
      <DetailDisclosure label="Capabilities" count={9} defaultOpen>
        <p>second story</p>
      </DetailDisclosure>,
    );
    expect(details?.open).toBe(false);
    expect(screen.getByText('Capabilities (9)')).toBeTruthy();
  });
});
