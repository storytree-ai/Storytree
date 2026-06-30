// @vitest-environment jsdom
//
// The legend bar is ADAPTIVE (one entry per world model, fans expose the full
// vocabulary): these tests pin the grounding rules — which entries appear for
// an offline frontmatter-only world vs a live one with verdicts/in-flight
// builds, that absent states render dimmed as "not in world yet", and that the
// status fan drives the same hidden-status filter the old toolbar chips did.
// The legend receives the PRESENTED world (worldStatus.ts): hue already carries
// the signed verdict (ADR-0040), so the proof row speaks hue + signpost, never
// ✓/✗ badges. Session presence no longer orbits (ADR-0048 §5) — it has no
// legend row; the world's only orbiting layer is the in-flight build.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WorldLegend, legendFacts, treeForm } from './WorldLegend';
import type { BuildActivity, ClaimActivity, TreeCapability, TreeStory, WorkStatus } from '../types';

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
  consumedBy: [],
  capabilities,
  ...extra,
});

const buildFor = (unitId: string, at: string): BuildActivity => ({
  unitId,
  tier: 'capability',
  runId: `run-${unitId}`,
  at,
});

const claimFor = (unitId: string, intent: string): ClaimActivity => ({
  unitId,
  kind: 'claim',
  sessionId: `sess-${unitId}`,
  branch: `claude/${unitId}`,
  intent,
  at: '2026-06-13T23:55:00.000Z',
});

/** Today's corpus shape offline: proposed+mapped only (a zero-cap proposed story now
 *  renders the YOUNG form, the sapling state having been folded into it), no proof hues. */
const offlineWorld = (): TreeStory[] => [
  story('library', 'mapped', [cap('library-cli', 'mapped'), cap('seed-corpus', 'proposed')]),
  story('drive-machinery', 'proposed', []),
  story('studio', 'proposed', [cap('read-corpus', 'proposed')], {
    dependsOn: ['library'],
  }),
];

const noop = (): void => {};
// A fixed `now` well after every fixture's verdict.at: the bloom fixtures here
// use the literal 'now' (an unparseable date that never blooms), so the activity
// row stays absent unless a test supplies a real recent verdict.at + matching now.
const NOW = new Date('2026-06-14T00:00:00.000Z');
const renderLegend = (
  stories: TreeStory[],
  over: Partial<Parameters<typeof WorldLegend>[0]> = {},
) =>
  render(
    <WorldLegend
      stories={stories}
      now={NOW}
      hidden={new Set()}
      onToggleStatus={noop}
      onResetHidden={noop}
      {...over}
    />,
  );

afterEach(cleanup);

describe('legendFacts', () => {
  it('grounds the legend in the loaded world', () => {
    const facts = legendFacts(offlineWorld());
    expect(facts.statusTotals.get('proposed')).toEqual({ stories: 2, caps: 2 });
    expect(facts.statusTotals.get('mapped')).toEqual({ stories: 1, caps: 1 });
    // The sapling state was folded into `young` (ADR-0038 / owner 2026-06-21): the legend
    // no longer surfaces a distinct sapling fact.
    expect('saplingPresent' in facts).toBe(false);
    // no presented green, no withered, nothing witnessed — offline under-claims
    expect(facts.anyProven).toBe(false);
    expect(facts.anyDeadFlora).toBe(false);
    expect(facts.signWitnessedPass || facts.signWitnessedFail).toBe(false);
    // every story here is human-witnessed (the default) and unsigned → blank signs
    expect(facts.signBlank).toBe(true);
  });

  it('presented healthy = a signed pass painted it — anyProven on either tier', () => {
    expect(legendFacts([story('s', 'mapped', [cap('c', 'healthy')])]).anyProven).toBe(true);
    expect(legendFacts([story('s', 'healthy', [])]).anyProven).toBe(true);
    expect(legendFacts([story('s', 'mapped', [cap('c', 'mapped')])]).anyProven).toBe(false);
  });

  it('a presented-unhealthy capability withers flora (signed ✗ or authored unhealthy)', () => {
    const facts = legendFacts([story('s', 'mapped', [cap('c', 'unhealthy')])]);
    expect(facts.anyDeadFlora).toBe(true);
  });

  it('the signpost facts follow the human-witness rule (ADR-0040)', () => {
    const pass = { outcome: 'pass', at: 'now' } as const;
    const fail = { outcome: 'fail', at: 'now' } as const;
    // human + signed → witnessed (by outcome); human + unsigned → blank
    expect(legendFacts([story('s', 'healthy', [], { verdict: pass })]).signWitnessedPass).toBe(true);
    expect(legendFacts([story('s', 'unhealthy', [], { verdict: fail })]).signWitnessedFail).toBe(
      true,
    );
    expect(legendFacts([story('s', 'mapped', [])]).signBlank).toBe(true);
    // a machine-witnessed story contributes NO signpost facts at all
    const machine = legendFacts([
      story('s', 'healthy', [], { uatWitness: 'machine', verdict: pass }),
    ]);
    expect(machine.signBlank || machine.signWitnessedPass || machine.signWitnessedFail).toBe(false);
  });

  it('a zero-cap story takes its status FORM (young / withered), not a distinct sapling', () => {
    // The sapling state is gone (owner 2026-06-21): a claimed-but-empty story renders the
    // SAME growth ladder as any other — proposed ⇒ young, unhealthy ⇒ withered. retired
    // never reaches the legend (presentStories prunes it, ADR-0038).
    expect(treeForm('proposed')).toBe('young');
    expect(treeForm('unhealthy')).toBe('withered');
    expect(treeForm('mapped')).toBe('full');
    expect(treeForm('healthy')).toBe('full');
  });
});

describe('WorldLegend (adaptive bar)', () => {
  it('offline world: no orbiting (building) entry; proof stays and explains the under-claim', () => {
    renderLegend(offlineWorld());
    for (const label of ['story trees', 'garden plants', 'proof', 'decoration']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    // sessions never orbit (ADR-0048 §5) and nothing is building → no orbiting row
    expect(screen.queryByRole('button', { name: 'sessions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'building' })).toBeNull();
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

  it('proof hues and witnessed signposts light their tiles', () => {
    const stories = [
      story('s', 'healthy', [cap('c', 'healthy', { verdict: { outcome: 'pass', at: 'now' } })], {
        verdict: { outcome: 'pass', at: 'now' },
      }),
    ];
    renderLegend(stories);
    fireEvent.click(screen.getByRole('button', { name: 'proof' }));
    expect(screen.getByText(/never a roll-up/)).toBeTruthy();
    expect(screen.getByText('proven green').closest('.legend-tile')?.className).not.toContain(
      'is-absent',
    );
    expect(screen.getByText('witnessed').closest('.legend-tile')?.className).not.toContain(
      'is-absent',
    );
  });

  it('a recent signed PASS lights the activity row with the honesty caption (ADR-0045)', () => {
    // a verdict 2 h before NOW is well inside the 6 h window → it blooms
    const recent = { outcome: 'pass', at: '2026-06-13T22:00:00.000Z' } as const;
    renderLegend([story('s', 'healthy', [cap('c', 'healthy', { verdict: recent })], { verdict: recent })]);
    const chip = screen.getByRole('button', { name: 'activity' });
    expect(chip).toBeTruthy();
    fireEvent.click(chip);
    // the honesty contract: real signed-verdict events, NOT presence; fades with age
    expect(screen.getByText(/not\s+who is online/)).toBeTruthy();
    expect(screen.getByText(/durable result is the plant/)).toBeTruthy();
  });

  it('an aged-out verdict (older than the window) shows no activity row', () => {
    // a pass a full day before NOW is past the 6 h window — nothing to announce
    const old = { outcome: 'pass', at: '2026-06-13T00:00:00.000Z' } as const;
    renderLegend([story('s', 'healthy', [cap('c', 'healthy', { verdict: old })], { verdict: old })]);
    expect(screen.queryByRole('button', { name: 'activity' })).toBeNull();
  });

  it('offline world (no signed verdicts) shows no activity row', () => {
    renderLegend(offlineWorld());
    expect(screen.queryByRole('button', { name: 'activity' })).toBeNull();
  });

  it('an in-flight build lights the building row with the harness honesty caption (ADR-0048)', () => {
    // 5 min before NOW — well inside the TTL
    renderLegend(offlineWorld(), { builds: [buildFor('studio', '2026-06-13T23:55:00.000Z')] });
    const chip = screen.getByRole('button', { name: 'building' });
    expect(chip).toBeTruthy();
    fireEvent.click(chip);
    expect(screen.getByText(/work, not who is online/)).toBeTruthy();
    expect(screen.getByText(/self-clears/)).toBeTruthy();
  });

  it('an aged-out build (older than the TTL) shows no building row', () => {
    // a full day before NOW — past the TTL
    renderLegend(offlineWorld(), { builds: [buildFor('studio', '2026-06-13T00:00:00.000Z')] });
    expect(screen.queryByRole('button', { name: 'building' })).toBeNull();
  });

  it('no builds → no building row', () => {
    renderLegend(offlineWorld());
    expect(screen.queryByRole('button', { name: 'building' })).toBeNull();
  });

  it('a story claim lights the "sessions working" row with the §5 honesty caption (ADR-0138)', () => {
    renderLegend(offlineWorld(), { claims: [claimFor('studio', 'real')] });
    const chip = screen.getByRole('button', { name: 'sessions working' });
    expect(chip).toBeTruthy();
    fireEvent.click(chip);
    // the §5 wall, in operator language: a claim is coordination, NOT a proof; only the bloom is a verdict.
    expect(screen.getByText(/NOT a proof/)).toBeTruthy();
    expect(screen.getByText(/coordination/)).toBeTruthy();
    // all three colour-state swatches are offered in the drawer (the tile LABELS — the caption prose
    // also names them, so scope to the tile-label spans).
    const labels = [...document.querySelectorAll('.legend-tile-label')].map((n) => n.textContent);
    for (const state of ['authoring', 'proving', 'supplementing']) {
      expect(labels).toContain(state);
    }
  });

  it('no claims → no "sessions working" row (flag off / nothing claimed → the legend is unchanged)', () => {
    renderLegend(offlineWorld());
    expect(screen.queryByRole('button', { name: 'sessions working' })).toBeNull();
    // default (claims prop omitted) also yields no row — back-compat with every existing caller.
    renderLegend(offlineWorld(), { builds: [buildFor('studio', '2026-06-13T23:55:00.000Z')] });
    expect(screen.queryByRole('button', { name: 'sessions working' })).toBeNull();
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
    renderLegend(offlineWorld(), { onToggleStatus });
    fireEvent.click(screen.getByRole('button', { name: 'story trees' }));
    // healthy / unhealthy don't occur in this world
    expect(screen.getAllByText('not in world yet')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^proposed/ }));
    expect(onToggleStatus).toHaveBeenCalledWith('proposed');
    // building and retired are not legend STATUS states — the world folds
    // building into proposed and prunes retired (ADR-0038)
    expect(screen.queryByText('retired')).toBeNull();
  });

  it('hidden statuses surface the reset chip', () => {
    const onResetHidden = vi.fn();
    renderLegend(offlineWorld(), { hidden: new Set(['proposed']), onResetHidden });
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
