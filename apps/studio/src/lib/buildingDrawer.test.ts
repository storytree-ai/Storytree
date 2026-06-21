// buildingDrawer — the PURE state math for the left-rail/drawer (owner ask 2026-06-21,
// under ADR-0076's distributed-building model). The rail lists the building-tagged
// stories; clicking one OPENS the drawer on it; clicking the SAME one (or close) COLLAPSES
// it; clicking ANOTHER switches it — one building open at a time. Pure (no React/DOM) so
// the toggle logic is unit-testable here, Stage-1 red-green of the behaviour (ADR-0070);
// the APPEARANCE of the drawer is owner-attested, never self-signed.

import { describe, it, expect } from 'vitest';
import { buildingStories, nextDrawerSelection } from './buildingDrawer.js';
import type { TreeStory } from '../types';

const story = (id: string, extra: Partial<TreeStory> = {}): TreeStory => ({
  id,
  title: id,
  outcome: '',
  status: 'mapped',
  proofMode: 'UAT',
  uatWitness: 'human',
  dependsOn: [],
  consumedBy: [],
  capabilities: [],
  ...extra,
});

describe('buildingStories — the rail roster', () => {
  it('selects only stories tagged render:building, in input order', () => {
    const stories = [
      story('studio'),
      story('library', { building: true }),
      story('cli'),
      story('toolkit', { building: true }),
    ];
    expect(buildingStories(stories).map((s) => s.id)).toEqual(['library', 'toolkit']);
  });

  it('is empty when nothing is tagged a building', () => {
    expect(buildingStories([story('studio'), story('cli')])).toEqual([]);
  });

  it('tolerates a null story list (pre-load)', () => {
    expect(buildingStories(null)).toEqual([]);
  });
});

describe('nextDrawerSelection — one building open at a time', () => {
  it('opens a building when none is open', () => {
    expect(nextDrawerSelection(null, 'library')).toBe('library');
  });

  it('clicking the SAME open building collapses the drawer', () => {
    expect(nextDrawerSelection('library', 'library')).toBe(null);
  });

  it('clicking ANOTHER building switches to it (still one open)', () => {
    expect(nextDrawerSelection('library', 'toolkit')).toBe('toolkit');
  });
});
