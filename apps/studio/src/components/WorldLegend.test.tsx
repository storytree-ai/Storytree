// @vitest-environment jsdom
//
// The legend bar is ADAPTIVE (one entry per world model, fans expose the full
// vocabulary): these tests pin the grounding rules — which entries appear for
// an offline frontmatter-only world vs a live one with verdicts/sessions, that
// absent states render dimmed as "not in world yet", and that the status fan
// drives the same hidden-status filter the old toolbar chips did. The legend
// receives the PRESENTED world (worldStatus.ts): hue already carries the
// signed verdict (ADR-0040), so the proof row speaks hue + signpost, never
// ✓/✗ badges.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WorldLegend, legendFacts } from './WorldLegend';
import type { TreeCapability, TreeSession, TreeStory, WorkStatus } from '../types';

const cap = (
  id: string,
  status: WorkStatus | null,
  extra: Partial<TreeCapability> = {},
): TreeCapability => ({
  id,
  title: id,
  outcome: '',
  status,
  proofMode: 'red-green',
  dependsOn: [],
  ...extra,
});

const story = (
  id: string,
  status: WorkStatus | null,
  capabilities: TreeCapability[],
  extra: Partial<TreeStory> = {},
): TreeStory => ({
  id,
  title: id,
  outcome: '',
  status,
  proofMode: 'UAT',
  uatWitness: 'human',
  dependsOn: [],
  capabilities,
  ...extra,
});

const session = (id: string, band: TreeSession['band']): TreeSession => ({
  sessionId: id,
  branch: 'claude/x',
  workingOn: 'gardening',
  nodes: [],
  band,
  lastSeenAt: '2026-06-12T00:00:00.000Z',
});

/** Today's corpus shape offline: proposed+mapped only, one sapling, no proof hues. */
const offlineWorld = (): TreeStory[] => [
  story('library', 'mapped', [cap('library-cli', 'mapped'), cap('seed-corpus', 'proposed')]),
  story('drive-machinery', 'proposed', []),
  story('studio', 'proposed', [cap('read-corpus', 'proposed')], {
    dependsOn: ['library'],
  }),
];

const noop = (): void => {};
const renderLegend = (
  stories: TreeStory[],
  sessions: TreeSession[] = [],
  over: Partial<Parameters<typeof WorldLegend>[0]> = {},
) =>
  render(
    <WorldLegend
      stories={stories}
      sessions={sessions}
      hidden={new Set()}
      onToggleStatus={noop}
      onResetHidden={noop}
      {...over}
    />,
  );

afterEach(cleanup);

describe('legendFacts', () => {
  it('grounds the legend in the loaded world', () => {
    const facts = legendFacts(offlineWorld(), [session('s1', 'fresh')]);
    expect(facts.statusTotals.get('proposed')).toEqual({ stories: 2, caps: 2 });
    expect(facts.statusTotals.get('mapped')).toEqual({ stories: 1, caps: 1 });
    expect(facts.saplingPresent).toBe(true);
    // no presented green, no withered, nothing witnessed — offline under-claims
    expect(facts.anyProven).toBe(false);
    expect(facts.anyDeadFlora).toBe(false);
    expect(facts.signWitnessedPass || facts.signWitnessedFail).toBe(false);
    // every story here is human-witnessed (the default) and unsigned → blank signs
    expect(facts.signBlank).toBe(true);
    expect([...facts.bands]).toEqual(['fresh']);
  });

  it('presented healthy = a signed pass painted it — anyProven on either tier', () => {
    expect(legendFacts([story('s', 'mapped', [cap('c', 'healthy')])], []).anyProven).toBe(true);
    expect(legendFacts([story('s', 'healthy', [])], []).anyProven).toBe(true);
    expect(legendFacts([story('s', 'mapped', [cap('c', 'mapped')])], []).anyProven).toBe(false);
  });

  it('a presented-unhealthy capability withers flora (signed ✗ or authored unhealthy)', () => {
    const facts = legendFacts([story('s', 'mapped', [cap('c', 'unhealthy')])], []);
    expect(facts.anyDeadFlora).toBe(true);
  });

  it('the signpost facts follow the human-witness rule (ADR-0040)', () => {
    const pass = { outcome: 'pass', at: 'now' } as const;
    const fail = { outcome: 'fail', at: 'now' } as const;
    // human + signed → witnessed (by outcome); human + unsigned → blank
    expect(legendFacts([story('s', 'healthy', [], { verdict: pass })], []).signWitnessedPass).toBe(
      true,
    );
    expect(legendFacts([story('s', 'unhealthy', [], { verdict: fail })], []).signWitnessedFail).toBe(
      true,
    );
    expect(legendFacts([story('s', 'mapped', [])], []).signBlank).toBe(true);
    // a machine-witnessed story contributes NO signpost facts at all
    const machine = legendFacts(
      [story('s', 'healthy', [], { uatWitness: 'machine', verdict: pass })],
      [],
    );
    expect(machine.signBlank || machine.signWitnessedPass || machine.signWitnessedFail).toBe(false);
  });

  it('an unhealthy zero-cap story is NOT a sapling (it withers instead)', () => {
    // retired never reaches the legend — presentStories prunes it (ADR-0038)
    expect(legendFacts([story('s', 'unhealthy', [])], []).saplingPresent).toBe(false);
    expect(legendFacts([story('s', 'proposed', [])], []).saplingPresent).toBe(true);
  });
});

describe('WorldLegend (adaptive bar)', () => {
  it('offline world: no sessions entry; proof stays and explains the under-claim', () => {
    renderLegend(offlineWorld());
    for (const label of ['story trees', 'garden plants', 'proof', 'decoration']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'sessions' })).toBeNull();
    // roads and focus carry no legend entry — self-explanatory in place (ADR-0038)
    expect(screen.queryByRole('button', { name: 'roads' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'focus' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'proof' }));
    expect(screen.getByText(/under-claims/)).toBeTruthy();
    // no signed verdicts anywhere — proof hues and the witnessed seal are dimmed examples,
    // while every (default-human) story stands behind a blank signpost
    expect(screen.getByText('proven green').closest('.legend-tile')?.className).toContain(
      'is-absent',
    );
    expect(screen.getByText('witnessed').closest('.legend-tile')?.className).toContain('is-absent');
    expect(screen.getByText('awaiting witness').closest('.legend-tile')?.className).not.toContain(
      'is-absent',
    );
  });

  it('proof hues and witnessed signposts light their tiles; sessions stay advisory', () => {
    const stories = [
      story('s', 'healthy', [cap('c', 'healthy', { verdict: { outcome: 'pass', at: 'now' } })], {
        verdict: { outcome: 'pass', at: 'now' },
      }),
    ];
    renderLegend(stories, [session('s1', 'stale')]);
    fireEvent.click(screen.getByRole('button', { name: 'proof' }));
    expect(screen.getByText(/never a roll-up/)).toBeTruthy();
    expect(screen.getByText('proven green').closest('.legend-tile')?.className).not.toContain(
      'is-absent',
    );
    expect(screen.getByText('witnessed').closest('.legend-tile')?.className).not.toContain(
      'is-absent',
    );
    fireEvent.click(screen.getByRole('button', { name: 'sessions' }));
    expect(screen.getByText(/advisory only/)).toBeTruthy();
  });

  it('a machine-witnessed world has no signpost states at all', () => {
    renderLegend([
      story('s', 'healthy', [cap('c', 'healthy')], {
        uatWitness: 'machine',
        verdict: { outcome: 'pass', at: 'now' },
      }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'proof' }));
    expect(screen.getByText('awaiting witness').closest('.legend-tile')?.className).toContain(
      'is-absent',
    );
    expect(screen.getByText('witnessed').closest('.legend-tile')?.className).toContain('is-absent');
  });

  it('Escape closes the drawer', () => {
    renderLegend(offlineWorld());
    fireEvent.click(screen.getByRole('button', { name: 'story trees' }));
    expect(screen.getByRole('region', { name: 'legend — story trees' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'legend — story trees' })).toBeNull();
  });

  it('the status fan dims absent states and filters present ones', () => {
    const onToggleStatus = vi.fn();
    renderLegend(offlineWorld(), [], { onToggleStatus });
    fireEvent.click(screen.getByRole('button', { name: 'story trees' }));
    // healthy / unhealthy don't occur in this world
    expect(screen.getAllByText('not in world yet')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^proposed/ }));
    expect(onToggleStatus).toHaveBeenCalledWith('proposed');
    // building and retired are not legend states at all — the world folds
    // building into proposed and prunes retired (ADR-0038)
    expect(screen.queryByText('building')).toBeNull();
    expect(screen.queryByText('retired')).toBeNull();
  });

  it('hidden statuses surface the reset chip', () => {
    const onResetHidden = vi.fn();
    renderLegend(offlineWorld(), [], { hidden: new Set(['proposed']), onResetHidden });
    fireEvent.click(screen.getByRole('button', { name: /show all statuses \(1 hidden\)/ }));
    expect(onResetHidden).toHaveBeenCalled();
  });

  it('a second click on the open entry closes the drawer', () => {
    renderLegend(offlineWorld());
    const chip = screen.getByRole('button', { name: 'story trees' });
    fireEvent.click(chip);
    expect(screen.getByRole('region', { name: 'legend — story trees' })).toBeTruthy();
    fireEvent.click(chip);
    expect(screen.queryByRole('region', { name: 'legend — story trees' })).toBeNull();
  });
});
