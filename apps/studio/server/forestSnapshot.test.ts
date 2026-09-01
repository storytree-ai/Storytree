// The public forest snapshot's fold (ADR-0453 D5/D7).
//
// ⚠ THE POINT OF THIS SUITE IS THAT IT CAN FAIL, so most of it is written against the state the
// snapshot is FORBIDDEN to be in rather than the state it should be in. An allow-list test that only
// asserts the fields it wants ("id is present, title is present") passes unchanged on the day someone
// spreads `...story` into the output and leaks the whole `TreeStory` — including the in-flight wisp
// layer ADR-0453 D5 keeps off this page. So the leak assertions below name the forbidden keys
// EXPLICITLY, and one of them (`assertNoForbiddenKeys`) walks every key the output actually carries
// rather than the keys the test remembered to check.

import { describe, it, expect } from 'vitest';

import {
  FOREST_SNAPSHOT_SCHEMA_VERSION,
  serialiseForestSnapshot,
  toForestSnapshot,
  unpublishableReason,
} from './forestSnapshot.js';
import type { ArcRollup, ArcRollupIncrement } from '@storytree/arc';

import type { TreeCapability, TreePayload, TreeStory } from '../src/types';

const AT = '2026-08-28T00:00:00.000Z';

function cap(id: string, over: Partial<TreeCapability> = {}): TreeCapability {
  return {
    id,
    title: `cap ${id}`,
    outcome: 'an outcome nobody outside should read',
    status: 'proposed',
    proofMode: 'INTEGRATION',
    dependsOn: [],
    testCount: 7,
    ...over,
  };
}

function story(id: string, over: Partial<TreeStory> = {}): TreeStory {
  return {
    id,
    title: `story ${id}`,
    outcome: 'an outcome nobody outside should read',
    status: 'proposed',
    proofMode: 'UAT',
    uatWitness: 'human',
    dependsOn: [],
    consumedBy: [],
    capabilities: [],
    ...over,
  };
}

/** Every key the snapshot is allowed to carry, per tier. */
const STORY_KEYS = new Set(['id', 'title', 'status', 'dependsOn', 'building', 'capabilities', 'arcs']);
const CAP_KEYS = new Set(['id', 'title', 'status', 'dependsOn']);
const STORY_ARC_KEYS = new Set(['id', 'via']);
const ARC_KEYS = new Set(['id', 'title', 'lifecycle', 'incrementsClosed', 'incrementsOpen', 'adrs']);
const ARC_ADR_KEYS = new Set(['number', 'status', 'title']);

/**
 * Walk what the output ACTUALLY has, not what the test remembered to look for — this is what makes
 * the suite fail on a field added upstream and spread through, rather than on a field this file was
 * updated to know about.
 */
function assertNoForbiddenKeys(snapshot: ReturnType<typeof toForestSnapshot>): void {
  for (const s of snapshot.stories) {
    for (const key of Object.keys(s)) expect(STORY_KEYS, `story key "${key}"`).toContain(key);
    for (const c of s.capabilities) {
      for (const key of Object.keys(c)) expect(CAP_KEYS, `capability key "${key}"`).toContain(key);
    }
    for (const a of s.arcs) {
      for (const key of Object.keys(a)) expect(STORY_ARC_KEYS, `story arc key "${key}"`).toContain(key);
    }
  }
  for (const a of snapshot.arcs) {
    for (const key of Object.keys(a)) expect(ARC_KEYS, `arc key "${key}"`).toContain(key);
    for (const d of a.adrs) {
      for (const key of Object.keys(d)) expect(ARC_ADR_KEYS, `arc adr key "${key}"`).toContain(key);
    }
  }
}

/**
 * A rollup whose every PROSE field is a distinctive sentinel — the fence test's subject.
 *
 * The sentinels matter more than the shape: the fence below greps the SERIALISED snapshot for them,
 * so it fails on prose that leaks under a key nobody thought to forbid, which is the failure a
 * key-name allow-list alone cannot see.
 */
function rollup(id: string, over: Partial<ArcRollup> = {}): ArcRollup {
  return {
    id,
    title: `arc ${id}`,
    description: 'PROSE-description — a one-liner derived from the intent',
    lifecycle: 'active',
    intent: 'PROSE-intent — the strategy layer, which does not ship',
    endState: 'PROSE-endState — where this arc is trying to get to',
    increments: [],
    adrs: [],
    stories: [],
    citedStories: [],
    questions: [],
    waiting: false,
    ...over,
  };
}

function increment(id: string, status: string, over: Partial<ArcRollupIncrement> = {}): ArcRollupIncrement {
  return {
    id,
    title: `increment ${id}`,
    objective: 'PROSE-objective — what this increment delivers',
    status,
    ...over,
  };
}

describe('toForestSnapshot — the published allow-list', () => {
  it('carries the shape the site renders, and stamps the moment', () => {
    const payload: TreePayload = {
      stories: [
        story('b', { capabilities: [cap('b2'), cap('b1')] }),
        story('a', { dependsOn: ['b'] }),
      ],
    };
    const snap = toForestSnapshot(payload, AT, []);

    expect(snap.schemaVersion).toBe(FOREST_SNAPSHOT_SCHEMA_VERSION);
    expect(snap.generatedAt).toBe(AT);
    expect(snap.storyCount).toBe(2);
    expect(snap.capabilityCount).toBe(2);
    // sorted by id, so an unchanged corpus republishes byte-identically
    expect(snap.stories.map((s) => s.id)).toEqual(['a', 'b']);
    expect(snap.stories[1]?.capabilities.map((c) => c.id)).toEqual(['b1', 'b2']);
    expect(snap.stories[0]?.dependsOn).toEqual(['b']);
    assertNoForbiddenKeys(snap);
  });

  it('LEAKS NOTHING below the public depth floor — named field by field', () => {
    const payload: TreePayload = {
      stories: [
        story('a', {
          verdict: { outcome: 'pass', at: AT },
          drift: 'stale',
          decisions: [453],
          consumedBy: ['b'],
          uatCriteria: [{ id: 'uat-1', state: 'proven' }],
          capabilities: [cap('a1', { verdict: { outcome: 'pass', at: AT }, drift: 'stale' })],
        }),
      ],
    };
    const snap = toForestSnapshot(payload, AT, []);
    const s = snap.stories[0];
    const c = s?.capabilities[0];

    // The tier the export exists to publish IS published…
    expect(s?.status).toBe('healthy');
    // …and everything below the floor is not.
    for (const forbidden of [
      'verdict',
      'drift',
      'decisions',
      'consumedBy',
      'uatCriteria',
      'outcome',
      'proofMode',
      'uatWitness',
      'error',
    ]) {
      expect(s, `story leaked ${forbidden}`).not.toHaveProperty(forbidden);
    }
    for (const forbidden of ['verdict', 'drift', 'outcome', 'proofMode', 'testCount', 'error']) {
      expect(c, `capability leaked ${forbidden}`).not.toHaveProperty(forbidden);
    }
    assertNoForbiddenKeys(snap);
  });

  it('DROPS THE WISP LAYER — ADR-0453 D5: no session is working right now in a snapshot', () => {
    const payload: TreePayload = {
      stories: [story('a')],
      builds: [{ storyId: 'a', capabilityId: 'a1', startedAt: AT } as never],
      sessions: [{ sessionId: 's', branch: 'b' } as never],
      claims: [{ nodeId: 'a' } as never],
    };
    const snap = toForestSnapshot(payload, AT, []);
    for (const forbidden of ['builds', 'sessions', 'claims']) {
      expect(snap, `snapshot leaked ${forbidden}`).not.toHaveProperty(forbidden);
    }
    assertNoForbiddenKeys(snap);
  });

  it('carries the studio’s OWN presentation fold, not the authored paint', () => {
    // The corpus this ships is uniformly authored `proposed` (measured 2026-08-26). If the export
    // read `status` straight off the payload, every island below would be the same colour — which is
    // exactly the failure ADR-0453 D7 exists to prevent. Green comes from the signed verdict.
    const payload: TreePayload = {
      stories: [
        story('proven', { status: 'proposed', verdict: { outcome: 'pass', at: AT } }),
        story('unproven', { status: 'proposed' }),
        story('failed', { status: 'proposed', verdict: { outcome: 'fail', at: AT } }),
        story('brownfield', { status: 'mapped' }),
        story('gone', { status: 'retired' }),
      ],
    };
    const snap = toForestSnapshot(payload, AT, []);
    const by = new Map(snap.stories.map((s) => [s.id, s.status]));

    expect(by.get('proven')).toBe('healthy');
    expect(by.get('unproven')).toBe('proposed');
    // a signed FAIL under-claims to unproven; it never paints green (ADR-0296 / ADR-0040)
    expect(by.get('failed')).toBe('proposed');
    expect(by.get('brownfield')).toBe('mapped');
    // retired units do not render at all (ADR-0038)
    expect(by.has('gone')).toBe(false);
    expect(snap.storyCount).toBe(4);
    expect(snap.provenStoryCount).toBe(1);
  });

  it('keeps `building`, which is a render hint and not a live signal', () => {
    const payload: TreePayload = {
      stories: [story('lib', { building: true }), story('isle')],
    };
    const snap = toForestSnapshot(payload, AT, []);
    expect(snap.stories.find((s) => s.id === 'lib')?.building).toBe(true);
    // absent rather than `false`, so the published JSON stays minimal
    expect(snap.stories.find((s) => s.id === 'isle')).not.toHaveProperty('building');
  });

  it('serialises to stable, newline-terminated JSON', () => {
    const payload: TreePayload = { stories: [story('a')] };
    const text = serialiseForestSnapshot(toForestSnapshot(payload, AT, []));
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text).generatedAt).toBe(AT);
    // an unchanged corpus republishes byte-identically at the same stamp
    expect(serialiseForestSnapshot(toForestSnapshot(payload, AT, []))).toBe(text);
  });
});

describe('unpublishableReason — the fail-closed publish guard', () => {
  it('REFUSES a fold with no proven story (what a down store looks like)', () => {
    // Every live story authored `proposed`, no verdicts: the shape a DB-less run produces.
    const payload: TreePayload = { stories: [story('a'), story('b'), story('c')] };
    const snap = toForestSnapshot(payload, AT, []);
    expect(snap.provenStoryCount).toBe(0);
    expect(unpublishableReason(snap)).toMatch(/NOT ONE of them is proven/);
  });

  it('REFUSES an empty fold', () => {
    expect(unpublishableReason(toForestSnapshot({ stories: [] }, AT, []))).toMatch(/NO stories/);
  });

  it('passes a fold that carries proof — the only publishable state', () => {
    const payload: TreePayload = {
      stories: [story('a', { verdict: { outcome: 'pass', at: AT } }), story('b')],
    };
    expect(unpublishableReason(toForestSnapshot(payload, AT, []))).toBeNull();
  });
});

describe('the arc tier — ADR-0453 D12, title and shape only', () => {
  const payload: TreePayload = { stories: [story('a'), story('b'), story('lonely')] };

  it('⚠ PUBLISHES NO ARC PROSE — the fence, and the reason this suite exists', () => {
    // The absent bodies are the ONLY protection on this tier: the forest is safe because it is
    // illegible by construction (ADR-0453 D3), and arc prose is readable English about strategy, so
    // that argument does not carry up here. Every prose field the rollup holds is a sentinel string
    // and the assertion is against the SERIALISED file — so a leak under a key this test never
    // thought to name still reds, which is the whole difference between this and a key allow-list.
    const snap = toForestSnapshot(payload, AT, [
      rollup('arc-1', {
        stories: ['a'],
        increments: [
          increment('i-1', 'closed', { outcome: { date: AT, pr: '#60', note: 'PROSE-note — why it closed' } }),
          increment('i-2', 'proposal'),
        ],
        questions: [
          {
            id: 'oq-1',
            title: 'a question',
            description: 'PROSE-description-question',
            stakes: 'PROSE-stakes — what breaks while this is unsettled',
            lifecycle: 'open',
          },
        ],
        waiting: true,
      }),
    ]);
    const text = serialiseForestSnapshot(snap);

    for (const prose of [
      'PROSE-description',
      'PROSE-intent',
      'PROSE-endState',
      'PROSE-objective',
      'PROSE-note',
      'PROSE-description-question',
      'PROSE-stakes',
    ]) {
      expect(text, `the published snapshot leaked ${prose}`).not.toContain(prose);
    }
    // …and the whole question/story-list tier is absent as an object, not merely as prose.
    for (const forbidden of ['description', 'intent', 'endState', 'questions', 'waiting', 'stories', 'citedStories']) {
      expect(snap.arcs[0], `arc leaked ${forbidden}`).not.toHaveProperty(forbidden);
    }
    assertNoForbiddenKeys(snap);
  });

  it('carries title, lifecycle, the increment counts and the attached decisions', () => {
    const snap = toForestSnapshot(payload, AT, [
      rollup('arc-1', {
        lifecycle: 'closed',
        stories: ['a'],
        increments: [
          increment('i-1', 'closed'),
          increment('i-2', 'closed'),
          increment('i-3', 'proposal'),
          increment('i-4', 'ready'),
          increment('i-5', 'active'),
        ],
        adrs: [
          { number: 453, status: 'accepted', title: 'The website is marketing over a real forest snapshot' },
          { number: 442, status: 'accepted', title: 'Three principles govern what a storytree surface shows' },
        ],
      }),
    ]);
    const arc = snap.arcs[0];

    expect(arc?.id).toBe('arc-1');
    expect(arc?.title).toBe('arc arc-1');
    expect(arc?.lifecycle).toBe('closed');
    expect(arc?.incrementsClosed).toBe(2);
    expect(arc?.incrementsOpen).toBe(3);
    // number-sorted, so the file republishes byte-identically whatever order the store answered in
    expect(arc?.adrs.map((a) => a.number)).toEqual([442, 453]);
    expect(arc?.adrs[0]?.status).toBe('accepted');
  });

  it('counts an UNRECOGNISED increment status as open, never as closed', () => {
    // `isForwardLooking` ranks an unknown status just below `closed`, and that direction is the
    // safe one: an increment this code cannot classify stays on the worklist rather than being
    // reported as something that happened.
    const snap = toForestSnapshot(payload, AT, [
      rollup('arc-1', { stories: ['a'], increments: [increment('i-1', 'a-status-nobody-has-written-yet')] }),
    ]);
    expect(snap.arcs[0]?.incrementsOpen).toBe(1);
    expect(snap.arcs[0]?.incrementsClosed).toBe(0);
  });

  it('MERGES THE TWO EDGES BUT NEVER SILENTLY — ADR-0306 D4', () => {
    const snap = toForestSnapshot(payload, AT, [
      // the frontmatter stamp: this arc PRODUCED story a (a scan of the exporting checkout)
      rollup('produced', { stories: ['a'] }),
      // an increment citation: this arc TOUCHED story b (store-resident, same for every session)
      rollup('touched', { citedStories: [{ id: 'b', by: ['i-1'], present: true }] }),
      // both edges at once, on the same story
      rollup('either', { stories: ['a'], citedStories: [{ id: 'a', by: ['i-2'], present: true }] }),
    ]);
    const by = new Map(snap.stories.map((s) => [s.id, s.arcs]));

    expect(by.get('a')).toEqual([
      { id: 'either', via: 'both' },
      { id: 'produced', via: 'stamped' },
    ]);
    expect(by.get('b')).toEqual([{ id: 'touched', via: 'cited' }]);
  });

  it('gives a story no arc reaches an EMPTY list, never a missing key', () => {
    // The empty state is designed, not accidental: measured 2026-08-28, three of the 35 live
    // stories are reachable from no arc at all. An absent key would be indistinguishable from a
    // snapshot written before the arc layer existed, which is a different fact.
    const snap = toForestSnapshot(payload, AT, [rollup('arc-1', { stories: ['a'] })]);
    expect(snap.stories.find((s) => s.id === 'lonely')?.arcs).toEqual([]);
    expect(snap.stories.find((s) => s.id === 'lonely')).toHaveProperty('arcs');
  });

  it('publishes only the arcs a story in THIS snapshot can reach', () => {
    const snap = toForestSnapshot(payload, AT, [
      rollup('reaches', { stories: ['a'] }),
      // names a story the presentation fold pruned — the edge simply does not join
      rollup('retired-only', { stories: ['gone'] }),
      // names nothing at all
      rollup('unreachable'),
    ]);
    expect(snap.arcs.map((a) => a.id)).toEqual(['reaches']);
  });
});
