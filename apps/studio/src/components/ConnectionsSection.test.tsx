// @vitest-environment jsdom
//
// Stage-1 red-green of the detail panel's wiring surface (ADR-0074 §4). These pin
// the RENDER behaviour the owner-attested appearance (ADR-0070) sits on top of:
// both directions show, known ids navigate (a button → onNavigate), dangling ids
// render inert (a <code>, never a button), and an unwired node renders nothing.
// The connection-set COMPUTE is asserted in lib/connectionSet.test.ts; here we
// trust it and feed resolved sets.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConnectionsSection } from './ConnectionsSection';
import type { ConnectionSet } from '../lib/connectionSet';

afterEach(cleanup);

const renderSection = (
  connections: ConnectionSet,
  knownIds: string[],
  onNavigate = vi.fn(),
): { onNavigate: ReturnType<typeof vi.fn> } => {
  render(
    <ConnectionsSection
      connections={connections}
      storyIds={new Set(knownIds)}
      onNavigate={onNavigate}
    />,
  );
  return { onNavigate };
};

describe('ConnectionsSection', () => {
  it('shows BOTH directions with their labels', () => {
    renderSection(
      { dependsOn: ['library', 'store'], consumedBy: ['cli', 'drive-machinery'] },
      ['library', 'store', 'cli', 'drive-machinery'],
    );
    expect(screen.getByText(/depends on/)).toBeTruthy();
    expect(screen.getByText(/consumed by/)).toBeTruthy();
    // every wiring id is on screen, both sides
    for (const id of ['library', 'store', 'cli', 'drive-machinery']) {
      expect(screen.getByRole('button', { name: id })).toBeTruthy();
    }
  });

  it('a known id navigates when clicked (click-to-navigate)', () => {
    const { onNavigate } = renderSection(
      { dependsOn: ['library'], consumedBy: [] },
      ['library'],
    );
    fireEvent.click(screen.getByRole('button', { name: 'library' }));
    expect(onNavigate).toHaveBeenCalledWith('library');
  });

  it('a dangling id (no such story) renders inert, never a navigable button', () => {
    renderSection({ dependsOn: ['ghost'], consumedBy: [] }, []); // ghost is not a known story
    expect(screen.queryByRole('button', { name: 'ghost' })).toBeNull();
    const chip = screen.getByText('ghost');
    expect(chip.tagName).toBe('CODE');
    expect(chip.getAttribute('title')).toMatch(/no such story/);
  });

  it('omits the depends-on row when there is no outbound edge', () => {
    renderSection({ dependsOn: [], consumedBy: ['cli'] }, ['cli']);
    expect(screen.queryByText(/depends on/)).toBeNull();
    expect(screen.getByText(/consumed by/)).toBeTruthy();
  });

  it('omits the consumed-by row when nothing consumes the node', () => {
    renderSection({ dependsOn: ['library'], consumedBy: [] }, ['library']);
    expect(screen.getByText(/depends on/)).toBeTruthy();
    expect(screen.queryByText(/consumed by/)).toBeNull();
  });

  it('renders nothing for an unwired node (no edges either way)', () => {
    const { container } = render(
      <ConnectionsSection
        connections={{ dependsOn: [], consumedBy: [] }}
        storyIds={new Set()}
        onNavigate={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
