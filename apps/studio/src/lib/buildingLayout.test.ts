// Stage-1 red-green of ADR-0102 (per-island icon stamps; you carry the icon of what you
// depend on). The two provable layers: (a) every island's DETERMINISTIC identity icon
// (`storyIcon`), and (b) the both-directions STAMP PROMOTION (`promotedStamps` /
// `stampsByCarrier`) — a sink hub radiates its icon onto its consumers, a source hub
// agglomerates a city of its dependencies' icons. The APPEARANCE (the icon art, the city's
// legibility) is owner-attested (ADR-0070), NOT asserted here.

import { describe, it, expect } from 'vitest';
import {
  storyIcon,
  promotedStamps,
  stampsByCarrier,
  sharedIslandStories,
  ICON_SHAPES,
  type IconStamp,
} from './buildingLayout';
import type { WiredNode } from './connectionSet';
import type { TreeStory } from '../types';

const node = (id: string, dependsOn: string[] = [], consumedBy: string[] = []): WiredNode => ({
  id,
  dependsOn,
  consumedBy,
});

const story = (id: string, building?: boolean): TreeStory => ({
  id,
  title: id,
  outcome: '',
  status: 'mapped',
  proofMode: 'red-green',
  uatWitness: 'machine',
  dependsOn: [],
  consumedBy: [],
  ...(building ? { building: true } : {}),
  capabilities: [],
});

// A faithful subgraph of the REAL corpus (stories/*/story.md, 2026-06-25): `library` and `cli`
// are both `render: building`. cli's edges are declared PROVIDER-SIDE on each spoke
// (`consumed_by: [cli]`); library is `consumed_by: [cli]` AND depends_on proof-protocol; studio
// depends on the two buildings (library, cli) plus its non-building deps; store depends on library.
const BUILDINGS = new Set(['library', 'cli']);
function corpus(): WiredNode[] {
  return [
    node('cli'), // edgeless in the DAG; every edge it owns is declared on a spoke
    node('library', ['proof-protocol', 'storage-protocol'], ['cli']),
    node('proof-protocol', [], ['cli']),
    node('storage-protocol', ['proof-protocol'], ['cli']),
    node('agent', [], ['cli']),
    node('drive-machinery', ['library', 'storage-protocol', 'proof-protocol', 'agent'], ['cli']),
    node('notice-board', ['library', 'drive-machinery'], ['cli']),
    node('store', ['library']),
    node('studio', ['library', 'drive-machinery', 'notice-board', 'forest-world', 'studio-members', 'proof-protocol', 'cli']),
    node('forest-world'),
    node('studio-members'),
  ];
}

const CORPUS_IDS = corpus().map((n) => n.id);

describe('storyIcon — every island carries its own deterministic identity icon (ADR-0102 §1)', () => {
  it('is deterministic — the same id yields an equal identity', () => {
    expect(storyIcon('library')).toEqual(storyIcon('library'));
    expect(storyIcon('drive-machinery')).toEqual(storyIcon('drive-machinery'));
  });

  it('keeps shape in [0, ICON_SHAPES) and hue in [0, 360)', () => {
    for (const id of CORPUS_IDS) {
      const icon = storyIcon(id);
      expect(icon.shape).toBeGreaterThanOrEqual(0);
      expect(icon.shape).toBeLessThan(ICON_SHAPES);
      expect(icon.hue).toBeGreaterThanOrEqual(0);
      expect(icon.hue).toBeLessThan(360);
    }
  });

  it('derives the monogram from the id (multi-word initials; single-word first-two-letters)', () => {
    expect(storyIcon('drive-machinery').monogram).toBe('DM');
    expect(storyIcon('notice-board').monogram).toBe('NB');
    expect(storyIcon('proof-protocol').monogram).toBe('PP');
    expect(storyIcon('library').monogram).toBe('LI');
    expect(storyIcon('cli').monogram).toBe('CL');
    expect(storyIcon('studio').monogram).toBe('ST');
    expect(storyIcon('agent').monogram).toBe('AG');
  });

  it('gives pairwise-DISTINCT full identities across the corpus (icons are distinguishable)', () => {
    const keys = CORPUS_IDS.map((id) => {
      const i = storyIcon(id);
      return `${i.shape}|${i.hue}|${i.monogram}`;
    });
    expect(new Set(keys).size).toBe(CORPUS_IDS.length);
  });
});

describe('promotedStamps / stampsByCarrier — both-directions promotion (ADR-0102 §2/§3)', () => {
  const stamps = (): IconStamp[] => promotedStamps(corpus(), BUILDINGS);
  const carriers = (): Map<string, string[]> => stampsByCarrier(stamps());

  it('studio carries BOTH library and cli — the two buildings it depends on', () => {
    const studio = carriers().get('studio') ?? [];
    expect(studio).toContain('library');
    expect(studio).toContain('cli');
  });

  it("cli's city = its 6 dependencies' icons (the SOURCE-hub agglomeration)", () => {
    const city = carriers().get('cli') ?? [];
    for (const dep of ['agent', 'drive-machinery', 'library', 'notice-board', 'proof-protocol', 'storage-protocol']) {
      expect(city).toContain(dep);
    }
    // exactly those six — cli depends on nothing else present
    expect([...city].sort()).toEqual(
      ['agent', 'drive-machinery', 'library', 'notice-board', 'proof-protocol', 'storage-protocol'].sort(),
    );
  });

  it("library's city = its two real deps [proof-protocol, storage-protocol], NOT suppressed", () => {
    // GROUND TRUTH (stories/library/story.md): `library depends_on: [proof-protocol, storage-protocol]`.
    // Under ADR-0102 ("you carry the icon of what you depend on") library carries BOTH — its small
    // 2-icon city vs cli's 6-icon city is the sink/source asymmetry (§3); the deps are KEPT as
    // stamps, never dropped (ADR-0074 §1). (NB: the build prompt said `['proof-protocol']`, a
    // simplification the real corpus overtakes — library gained storage-protocol as a dep.)
    expect(carriers().get('library')).toEqual(['proof-protocol', 'storage-protocol']);
  });

  it('the ONLY on-map carrier of cli\'s icon is studio (no other depends_on names cli)', () => {
    const carriersOfCli = stamps().filter((s) => s.icon === 'cli').map((s) => s.on);
    expect(carriersOfCli).toEqual(['studio']);
  });

  it('every consumer of library carries library (the SINK-hub radiation)', () => {
    const c = carriers();
    for (const consumer of ['store', 'drive-machinery', 'notice-board', 'studio', 'cli']) {
      expect(c.get(consumer) ?? []).toContain('library');
    }
  });

  it('the both-buildings dedup: cli carries library, library does NOT carry cli (no cycle)', () => {
    const s = stamps();
    // exactly one {on: cli, icon: library} despite both directions emitting it
    expect(s.filter((x) => x.on === 'cli' && x.icon === 'library')).toHaveLength(1);
    // and never the reverse (ADR-0058 forbids cycles)
    expect(s.some((x) => x.on === 'library' && x.icon === 'cli')).toBe(false);
  });

  it('is deterministic and order-independent (shuffle input → same result)', () => {
    const forward = promotedStamps(corpus(), BUILDINGS);
    const reversed = promotedStamps([...corpus()].reverse(), BUILDINGS);
    expect(reversed).toEqual(forward);
    // stable ordering: sorted by (on, icon)
    const sorted = [...forward].sort((a, b) =>
      a.on < b.on ? -1 : a.on > b.on ? 1 : a.icon < b.icon ? -1 : a.icon > b.icon ? 1 : 0,
    );
    expect(forward).toEqual(sorted);
  });

  it('restricts to PRESENT ids (a dangling dependency is ignored)', () => {
    // library declares depends_on a ghost that is not in the node list → no stamp for it
    const nodes = [node('cli'), node('library', ['ghost'], ['cli']), node('proof-protocol', [], ['cli'])];
    const s = promotedStamps(nodes, BUILDINGS);
    expect(s.some((x) => x.icon === 'ghost' || x.on === 'ghost')).toBe(false);
    // present edges still promote: cli carries library + proof-protocol; library carries nothing present-but-its-ghost
    const byCarrier = stampsByCarrier(s);
    expect([...(byCarrier.get('cli') ?? [])].sort()).toEqual(['library', 'proof-protocol']);
    expect(byCarrier.get('library')).toBeUndefined();
  });

  it('never stamps a building on itself (self-edges cannot occur)', () => {
    expect(stamps().every((x) => x.on !== x.icon)).toBe(true);
  });

  it('is empty when no building id is present', () => {
    const plain = [node('a', ['b']), node('b')];
    expect(promotedStamps(plain, BUILDINGS)).toEqual([]);
    expect(promotedStamps(plain, new Set())).toEqual([]);
    // a building id named but absent from the nodes ⇒ still empty
    expect(promotedStamps(plain, new Set(['library']))).toEqual([]);
  });

  it('stampsByCarrier dedups + sorts each carrier`s icon list', () => {
    const dupes: IconStamp[] = [
      { on: 'x', icon: 'b' },
      { on: 'x', icon: 'a' },
      { on: 'x', icon: 'b' },
    ];
    expect(stampsByCarrier(dupes).get('x')).toEqual(['a', 'b']);
  });
});

describe('sharedIslandStories — the building-class roster for the Shared Islands panel', () => {
  it('selects exactly the stories tagged building === true (generic over the flag)', () => {
    const stories = [
      story('library', true),
      story('cli', true),
      story('store'),
      story('future-shared', true),
    ];
    expect(sharedIslandStories(stories).map((s) => s.id)).toEqual(['library', 'cli', 'future-shared']);
  });

  it('is empty when no story is a building (a plain forest)', () => {
    expect(sharedIslandStories([story('a'), story('b')])).toEqual([]);
  });

  it('preserves the input order of building stories (stable for the panel render)', () => {
    const stories = [story('b1', true), story('mid'), story('b2', true), story('b3', true)];
    expect(sharedIslandStories(stories).map((s) => s.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('treats an absent building flag as not-a-building (the common case)', () => {
    expect(sharedIslandStories([story('plain')])).toEqual([]);
  });
});
