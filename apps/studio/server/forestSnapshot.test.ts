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
  type AuthoredUatCriterion,
  type ForestSnapshotAdr,
  type ForestSnapshotSources,
} from './forestSnapshot.js';
import type { ArcRollup, ArcRollupIncrement } from '@storytree/arc';

import type { TreeCapability, TreePayload, TreeStory } from '../src/types';

const AT = '2026-08-28T00:00:00.000Z';

/**
 * The fold's non-payload inputs, defaulted to EMPTY.
 *
 * ⚠ Empty here means "there is nothing", never "nobody wired it" — that is the distinction
 * `ForestSnapshotSources` makes every field required to preserve, and the helper keeps it by making
 * each empty set explicit at this one site rather than at forty call sites.
 */
function sources(over: Partial<ForestSnapshotSources> = {}): ForestSnapshotSources {
  return {
    arcRollups: [],
    uatCriteria: new Map<string, AuthoredUatCriterion>(),
    decisions: new Map<number, ForestSnapshotAdr>(),
    ...over,
  };
}

/** A decision log keyed by number, from `number → title` pairs. Every row reads `accepted` unless a
 *  test cares; status is carried, not judged. */
function log(...rows: readonly (readonly [number, string])[]): Map<number, ForestSnapshotAdr> {
  return new Map(rows.map(([number, title]) => [number, { number, status: 'accepted', title }]));
}

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
const STORY_KEYS = new Set([
  'id',
  'title',
  'status',
  'dependsOn',
  'building',
  'capabilities',
  'uat',
  'decisions',
  'arcs',
]);
const CAP_KEYS = new Set(['id', 'title', 'status', 'dependsOn']);
const STORY_ARC_KEYS = new Set(['id', 'via']);
const UAT_KEYS = new Set(['title', 'state', 'witness', 'signable']);
const ARC_KEYS = new Set(['id', 'title', 'lifecycle', 'incrementsClosed', 'incrementsOpen', 'adrs']);
/** The decision registry's tier — title and identity, and nothing that would carry a body. */
const DECISION_KEYS = new Set(['number', 'status', 'title']);

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
    for (const u of s.uat) {
      for (const key of Object.keys(u)) expect(UAT_KEYS, `uat key "${key}"`).toContain(key);
    }
    // A decision reaches the file ONCE, in the registry. A story names it by number, so a record
    // that grew back inline here would be a second, unreviewed home for the same tier.
    for (const n of s.decisions) expect(typeof n, `story decision ${String(n)}`).toBe('number');
  }
  for (const a of snapshot.arcs) {
    for (const key of Object.keys(a)) expect(ARC_KEYS, `arc key "${key}"`).toContain(key);
    for (const n of a.adrs) expect(typeof n, `arc adr ${String(n)}`).toBe('number');
  }
  for (const d of snapshot.decisions) {
    for (const key of Object.keys(d)) expect(DECISION_KEYS, `decision key "${key}"`).toContain(key);
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
    gates: [],
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
    const snap = toForestSnapshot(payload, AT, sources());

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
    const snap = toForestSnapshot(payload, AT, sources());
    const s = snap.stories[0];
    const c = s?.capabilities[0];

    // The tier the export exists to publish IS published…
    expect(s?.status).toBe('healthy');
    // …and everything below the floor is not. ⚠ `decisions` LEFT this list on 2026-09-01 and
    // `uatCriteria` was REPLACED by `uat`, both under ADR-0494 D1/D2 — the floor moved, it did not
    // disappear. The raw wire key stays forbidden because the published projection is a different,
    // narrower shape: `TreeStory.uatCriteria` carries no title and a spread of it would publish a
    // list of bare ids under a name this file never classified.
    for (const forbidden of [
      'verdict',
      'drift',
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
    const snap = toForestSnapshot(payload, AT, sources());
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
    const snap = toForestSnapshot(payload, AT, sources());
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
    const snap = toForestSnapshot(payload, AT, sources());
    expect(snap.stories.find((s) => s.id === 'lib')?.building).toBe(true);
    // absent rather than `false`, so the published JSON stays minimal
    expect(snap.stories.find((s) => s.id === 'isle')).not.toHaveProperty('building');
  });

  it('serialises to stable, newline-terminated JSON', () => {
    const payload: TreePayload = { stories: [story('a')] };
    const text = serialiseForestSnapshot(toForestSnapshot(payload, AT, sources()));
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text).generatedAt).toBe(AT);
    // an unchanged corpus republishes byte-identically at the same stamp
    expect(serialiseForestSnapshot(toForestSnapshot(payload, AT, sources()))).toBe(text);
  });
});

describe('unpublishableReason — the fail-closed publish guard', () => {
  it('REFUSES a fold with no proven story (what a down store looks like)', () => {
    // Every live story authored `proposed`, no verdicts: the shape a DB-less run produces.
    const payload: TreePayload = { stories: [story('a'), story('b'), story('c')] };
    const snap = toForestSnapshot(payload, AT, sources());
    expect(snap.provenStoryCount).toBe(0);
    expect(unpublishableReason(snap)).toMatch(/NOT ONE of them is proven/);
  });

  it('REFUSES an empty fold', () => {
    expect(unpublishableReason(toForestSnapshot({ stories: [] }, AT, sources()))).toMatch(/NO stories/);
  });

  it('passes a fold that carries proof — the only publishable state', () => {
    const payload: TreePayload = {
      stories: [story('a', { verdict: { outcome: 'pass', at: AT } }), story('b')],
    };
    expect(unpublishableReason(toForestSnapshot(payload, AT, sources()))).toBeNull();
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
    const snap = toForestSnapshot(payload, AT, sources({ arcRollups: [
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
    ] }));
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
    const snap = toForestSnapshot(payload, AT, sources({ arcRollups: [
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
    ], decisions: log(
      [453, 'The website is marketing over a real forest snapshot'],
      [442, 'Three principles govern what a storytree surface shows'],
    ) }));
    const arc = snap.arcs[0];

    expect(arc?.id).toBe('arc-1');
    expect(arc?.title).toBe('arc arc-1');
    expect(arc?.lifecycle).toBe('closed');
    expect(arc?.incrementsClosed).toBe(2);
    expect(arc?.incrementsOpen).toBe(3);
    // number-sorted, so the file republishes byte-identically whatever order the store answered in
    expect(arc?.adrs).toEqual([442, 453]);
    // …and the RECORDS live once, in the registry, reachable from either tier.
    expect(snap.decisions).toEqual([
      { number: 442, status: 'accepted', title: 'Three principles govern what a storytree surface shows' },
      { number: 453, status: 'accepted', title: 'The website is marketing over a real forest snapshot' },
    ]);
  });

  it('counts an UNRECOGNISED increment status as open, never as closed', () => {
    // `isForwardLooking` ranks an unknown status just below `closed`, and that direction is the
    // safe one: an increment this code cannot classify stays on the worklist rather than being
    // reported as something that happened.
    const snap = toForestSnapshot(payload, AT, sources({ arcRollups: [
      rollup('arc-1', { stories: ['a'], increments: [increment('i-1', 'a-status-nobody-has-written-yet')] }),
    ] }));
    expect(snap.arcs[0]?.incrementsOpen).toBe(1);
    expect(snap.arcs[0]?.incrementsClosed).toBe(0);
  });

  it('MERGES THE TWO EDGES BUT NEVER SILENTLY — ADR-0306 D4', () => {
    const snap = toForestSnapshot(payload, AT, sources({ arcRollups: [
      // the frontmatter stamp: this arc PRODUCED story a (a scan of the exporting checkout)
      rollup('produced', { stories: ['a'] }),
      // an increment citation: this arc TOUCHED story b (store-resident, same for every session)
      rollup('touched', { citedStories: [{ id: 'b', by: ['i-1'], present: true }] }),
      // both edges at once, on the same story
      rollup('either', { stories: ['a'], citedStories: [{ id: 'a', by: ['i-2'], present: true }] }),
    ] }));
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
    const snap = toForestSnapshot(payload, AT, sources({ arcRollups: [rollup('arc-1', { stories: ['a'] })] }));
    expect(snap.stories.find((s) => s.id === 'lonely')?.arcs).toEqual([]);
    expect(snap.stories.find((s) => s.id === 'lonely')).toHaveProperty('arcs');
  });

  it('publishes only the arcs a story in THIS snapshot can reach', () => {
    const snap = toForestSnapshot(payload, AT, sources({ arcRollups: [
      rollup('reaches', { stories: ['a'] }),
      // names a story the presentation fold pruned — the edge simply does not join
      rollup('retired-only', { stories: ['gone'] }),
      // names nothing at all
      rollup('unreachable'),
    ] }));
    expect(snap.arcs.map((a) => a.id)).toEqual(['reaches']);
  });
});

describe('the UAT tier — ADR-0494 D1, the story’s own acceptance journey', () => {
  const authored = new Map<string, AuthoredUatCriterion>([
    ['a#uat-1', { title: 'a fresh checkout reaches a green gate', witness: 'machine', signable: true }],
    ['a#uat-2', { title: 'the owner signs the look', witness: 'human', signable: true }],
    ['a#uat-10', { title: 'the tenth leg, whose id sorts before the second', witness: 'either', signable: true }],
  ]);

  it('joins the borrowed STATE to the authored TITLE, in the journey’s own order', () => {
    const payload: TreePayload = {
      stories: [
        story('a', {
          verdict: { outcome: 'pass', at: AT },
          uatCriteria: [
            { id: 'a#uat-1', state: 'proven' },
            { id: 'a#uat-2', state: 'pending' },
            { id: 'a#uat-10', state: 'failing' },
          ],
        }),
      ],
    };
    const snap = toForestSnapshot(payload, AT, sources({ uatCriteria: authored }));

    // ⚠ AUTHORED ORDER, NOT SORTED. A UAT is a journey and its ordinals are that journey; sorting by
    // id would also put `a#uat-10` second, which is why this list is the one thing here left unsorted.
    expect(snap.stories[0]?.uat).toEqual([
      { title: 'a fresh checkout reaches a green gate', state: 'proven', witness: 'machine', signable: true },
      { title: 'the owner signs the look', state: 'pending', witness: 'human', signable: true },
      {
        title: 'the tenth leg, whose id sorts before the second',
        state: 'failing',
        witness: 'either',
        signable: true,
      },
    ]);
    assertNoForbiddenKeys(snap);
  });

  it('PUBLISHES NO CRITERION ID — 1.9 KB of random hash no line renders (the payload narrowing)', () => {
    const payload: TreePayload = {
      stories: [
        story('a', {
          verdict: { outcome: 'pass', at: AT },
          uatCriteria: [{ id: 'uatc_027e3e8ad2253d327fc15c07', state: 'proven' }],
        }),
      ],
    };
    const authoredByHash = new Map<string, AuthoredUatCriterion>([
      ['uatc_027e3e8ad2253d327fc15c07', { title: 'the selected live runtime authors a real slice', witness: 'machine', signable: true }],
    ]);
    const text = serialiseForestSnapshot(
      toForestSnapshot(payload, AT, sources({ uatCriteria: authoredByHash })),
    );
    expect(text).toContain('the selected live runtime authors a real slice');
    expect(text).not.toContain('uatc_027e3e8ad2253d327fc15c07');
  });

  it('NEVER DROPS A LEG whose title the spec walk missed — it degrades to the leg’s own id', () => {
    // The two readers walk the same `stories/` tree, so a miss means they disagreed. A leg that
    // simply vanished from the panel would make the journey read as shorter than it is, and that is
    // the one failure a reader of the page cannot see. `either` is the parser's own default for an
    // untagged leg, so the fallback witness is the weakest TRUE claim rather than an invented one.
    const payload: TreePayload = {
      stories: [
        story('a', {
          verdict: { outcome: 'pass', at: AT },
          uatCriteria: [{ id: 'a#uat-99', state: 'pending' }],
        }),
      ],
    };
    const snap = toForestSnapshot(payload, AT, sources({ uatCriteria: authored }));
    // The id is not a published FIELD, but it is still the fallback TEXT — so the degradation is
    // visible on the page rather than a blank line or a leg that quietly vanished.
    expect(snap.stories[0]?.uat).toEqual([
      { title: 'a#uat-99', state: 'pending', witness: 'either', signable: true },
    ]);
  });

  it('CARRIES SIGNABILITY — the field that stops a green island contradicting its own steps', () => {
    // ⚠ THE MEASURED FAILURE THIS EXISTS FOR. ADR-0443 D2 drops an UNSIGNABLE leg from a story's
    // crown obligations, so a story is legitimately green while such a leg carries no verdict.
    // Measured 2026-09-01 on the published corpus, FIVE green stories have not one of their listed
    // legs signed — `website-experience` has eight. Publishing `state` alone would have put
    // "8 acceptance tests, 0 proven" under a green island.
    const payload: TreePayload = {
      stories: [
        story('a', {
          verdict: { outcome: 'pass', at: AT },
          uatCriteria: [
            { id: 'a#uat-1', state: 'pending' },
            { id: 'a#uat-2', state: 'pending' },
          ],
        }),
      ],
    };
    const snap = toForestSnapshot(
      payload,
      AT,
      sources({
        uatCriteria: new Map<string, AuthoredUatCriterion>([
          ['a#uat-1', { title: 'nothing can witness this yet', witness: 'machine', signable: false }],
          ['a#uat-2', { title: 'nobody has proved this yet', witness: 'human', signable: true }],
        ]),
      }),
    );

    // The two legs read IDENTICALLY on `state` and differently on the only field that tells them
    // apart — which is the whole point of carrying it.
    expect(snap.stories[0]?.uat.map((u) => u.state)).toEqual(['pending', 'pending']);
    expect(snap.stories[0]?.uat.map((u) => u.signable)).toEqual([false, true]);
    assertNoForbiddenKeys(snap);
  });

  it('gives a story with no witnessable leg an EMPTY list, never a missing key', () => {
    // Measured 2026-09-01, 11 of the 35 published stories carry none — a designed state a surface
    // must SAY, exactly as the arc tier's empty list is.
    const payload: TreePayload = {
      stories: [story('a', { verdict: { outcome: 'pass', at: AT } }), story('b', { uatCriteria: [] })],
    };
    const snap = toForestSnapshot(payload, AT, sources({ uatCriteria: authored }));
    for (const s of snap.stories) {
      expect(s, `story ${s.id}`).toHaveProperty('uat');
      expect(s.uat).toEqual([]);
    }
  });

  it('PUBLISHES NO UAT PROSE BEYOND THE ONE-LINE TITLE — the payload fence', () => {
    // ADR-0494's payload clause: the remedy for bulk is a narrower projection, not a runtime fetch.
    // A `## UAT Test Criteria` section is long-form prose; only the authored lead may travel, and a
    // future join that reached for the leg's body would show up here as a serialised sentinel.
    const payload: TreePayload = {
      stories: [
        story('a', {
          verdict: { outcome: 'pass', at: AT },
          uatCriteria: [{ id: 'a#uat-1', state: 'proven' }],
        }),
      ],
    };
    const text = serialiseForestSnapshot(
      toForestSnapshot(payload, AT, sources({ uatCriteria: authored })),
    );
    expect(text).toContain('a fresh checkout reaches a green gate');
    expect(text).not.toContain('an outcome nobody outside should read');
  });
});

describe('the decision tier — ADR-0494 D2, title and identity, reachable only', () => {
  const decisions = log(
    [453, 'The website is marketing over a real forest snapshot'],
    [494, 'The public site opens past the capability tree'],
    [299, 'The public website shows the real forest as a baked, redacted projection'],
  );

  it('names decisions by NUMBER on the story and carries the record ONCE, number-sorted', () => {
    const payload: TreePayload = {
      stories: [
        story('a', { verdict: { outcome: 'pass', at: AT }, decisions: [494, 453] }),
        story('b', { decisions: [453] }),
      ],
    };
    const snap = toForestSnapshot(payload, AT, sources({ decisions }));

    expect(snap.stories.find((s) => s.id === 'a')?.decisions).toEqual([453, 494]);
    expect(snap.stories.find((s) => s.id === 'b')?.decisions).toEqual([453]);
    // 453 is reached twice and appears once — the whole reason this tier is normalised.
    expect(snap.decisions.map((d) => d.number)).toEqual([453, 494]);
    assertNoForbiddenKeys(snap);
  });

  it('DE-DUPLICATES a story’s own repeated citation and sorts what is left', () => {
    const payload: TreePayload = {
      stories: [story('a', { verdict: { outcome: 'pass', at: AT }, decisions: [494, 453, 494] })],
    };
    const snap = toForestSnapshot(payload, AT, sources({ decisions }));
    expect(snap.stories[0]?.decisions).toEqual([453, 494]);
  });

  it('DROPS a citation naming no decision row rather than publishing a numbered blank', () => {
    // The corpus has its own rung for a dangling citation (`check:adr-health`). A public export that
    // invented `ADR-0999 — (unknown)` would be publishing a defect; inventing a title would be worse.
    const payload: TreePayload = {
      stories: [story('a', { verdict: { outcome: 'pass', at: AT }, decisions: [453, 999] })],
    };
    const snap = toForestSnapshot(payload, AT, sources({ decisions }));
    expect(snap.stories[0]?.decisions).toEqual([453]);
    expect(snap.decisions.map((d) => d.number)).toEqual([453]);
  });

  it('PUBLISHES NO DECISION NOTHING ON THE MAP REACHES', () => {
    // Reachability from a thing on the page is what ADR-0494 D2 decided. Shipping the log itself
    // would be a different decision, and 299 is here to prove the fold does not drift into it.
    const payload: TreePayload = {
      stories: [story('a', { verdict: { outcome: 'pass', at: AT }, decisions: [453] })],
    };
    const snap = toForestSnapshot(payload, AT, sources({ decisions }));
    expect(snap.decisions.map((d) => d.number)).toEqual([453]);
  });

  it('gives a story that declares none an EMPTY list, never a missing key', () => {
    const payload: TreePayload = {
      stories: [story('a', { verdict: { outcome: 'pass', at: AT } })],
    };
    const snap = toForestSnapshot(payload, AT, sources({ decisions }));
    expect(snap.stories[0]).toHaveProperty('decisions');
    expect(snap.stories[0]?.decisions).toEqual([]);
    expect(snap.decisions).toEqual([]);
  });
});
