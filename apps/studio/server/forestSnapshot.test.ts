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
const STORY_KEYS = new Set(['id', 'title', 'status', 'dependsOn', 'building', 'capabilities']);
const CAP_KEYS = new Set(['id', 'title', 'status', 'dependsOn']);

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
  }
}

describe('toForestSnapshot — the published allow-list', () => {
  it('carries the shape the site renders, and stamps the moment', () => {
    const payload: TreePayload = {
      stories: [
        story('b', { capabilities: [cap('b2'), cap('b1')] }),
        story('a', { dependsOn: ['b'] }),
      ],
    };
    const snap = toForestSnapshot(payload, AT);

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
    const snap = toForestSnapshot(payload, AT);
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
    const snap = toForestSnapshot(payload, AT);
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
    const snap = toForestSnapshot(payload, AT);
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
    const snap = toForestSnapshot(payload, AT);
    expect(snap.stories.find((s) => s.id === 'lib')?.building).toBe(true);
    // absent rather than `false`, so the published JSON stays minimal
    expect(snap.stories.find((s) => s.id === 'isle')).not.toHaveProperty('building');
  });

  it('serialises to stable, newline-terminated JSON', () => {
    const payload: TreePayload = { stories: [story('a')] };
    const text = serialiseForestSnapshot(toForestSnapshot(payload, AT));
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text).generatedAt).toBe(AT);
    // an unchanged corpus republishes byte-identically at the same stamp
    expect(serialiseForestSnapshot(toForestSnapshot(payload, AT))).toBe(text);
  });
});

describe('unpublishableReason — the fail-closed publish guard', () => {
  it('REFUSES a fold with no proven story (what a down store looks like)', () => {
    // Every live story authored `proposed`, no verdicts: the shape a DB-less run produces.
    const payload: TreePayload = { stories: [story('a'), story('b'), story('c')] };
    const snap = toForestSnapshot(payload, AT);
    expect(snap.provenStoryCount).toBe(0);
    expect(unpublishableReason(snap)).toMatch(/NOT ONE of them is proven/);
  });

  it('REFUSES an empty fold', () => {
    expect(unpublishableReason(toForestSnapshot({ stories: [] }, AT))).toMatch(/NO stories/);
  });

  it('passes a fold that carries proof — the only publishable state', () => {
    const payload: TreePayload = {
      stories: [story('a', { verdict: { outcome: 'pass', at: AT } }), story('b')],
    };
    expect(unpublishableReason(toForestSnapshot(payload, AT))).toBeNull();
  });
});
