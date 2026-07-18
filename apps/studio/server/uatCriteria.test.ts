// Unit + integration tests for the story's WITNESSABLE UAT test criteria summary (the marker walk
// map layer, forest-parcels arc increment 2, apiRouter.applyUatCriteria / readTree's `uatCriteriaByStory`).
//
// MEMBERSHIP: one entry per WITNESSABLE UAT test criterion (`spec.uatTestCriteria.filter(t =>
// !t.wouldBe)`) — `## Reliability Gates` (ADR-0085 brownfield obligations) are DELIBERATELY EXCLUDED,
// unlike the crown's `ownObligations` union (`applyUatCrowns`'s `uatTestCriteriaByStory`). would-be
// (aspirational, ADR-0097) legs are excluded too.
//
// STATE: derived from the SAME signed per-test verdict source the crown roll-up and the attestations
// route's `provenOf` use (`rollupStatus`): a signed pass -> 'proven', a signed fail -> 'failing', no
// signed verdict OR the live store can't answer (events === null, the json backend / a down DB) ->
// 'pending' — silently, never throws, never fabricates.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SIGNING_EVENT_KIND } from '@storytree/proof-protocol';
import { rollupStatus } from '@storytree/orchestrator';

import { applyUatCriteria, readTree } from './apiRouter.js';
import type { TreeStory } from '../src/types';

function story(id: string, over: Partial<TreeStory> = {}): TreeStory {
  return {
    id,
    title: id,
    outcome: '',
    status: 'proposed',
    proofMode: 'UAT',
    uatWitness: 'human',
    dependsOn: [],
    consumedBy: [],
    capabilities: [],
    ...over,
  };
}

function verdictEvent(seq: number, unitId: string, outcome: 'pass' | 'fail', at: string) {
  return {
    kind: SIGNING_EVENT_KIND,
    seq,
    doc: {
      unitId,
      proofMode: 'operator-attested',
      outcome,
      commitSha: 'cafebabe',
      signer: 'owner@example.com',
      runId: `run-${seq}`,
      at,
    },
  };
}

// ---------------------------------------------------------------------------
// applyUatCriteria (pure) — the per-test state derivation
// ---------------------------------------------------------------------------

describe('applyUatCriteria', () => {
  it('a signed pass verdict yields state "proven"', () => {
    const stories = [story('demo')];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }]]]);
    const events = [verdictEvent(1, 'demo#uat-1', 'pass', '2026-07-17T00:00:00.000Z')];
    applyUatCriteria(stories, map, events, rollupStatus);
    expect(stories[0]!.uatCriteria).toEqual([{ id: 'demo#uat-1', state: 'proven' }]);
  });

  it('a regressed (previously-passed, now-failed) verdict yields state "failing"', () => {
    // rollupStatus is conservative (a bare fail with no prior pass grants nothing, "never over-claim
    // healthy" — it only DEMOTES a prior pass): a first-ever fail is 'pending', not 'failing'. The
    // 'failing' state is reached the same way `unhealthy` is — a regression after a proven pass.
    const stories = [story('demo')];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }]]]);
    const events = [
      verdictEvent(1, 'demo#uat-1', 'pass', '2026-07-17T00:00:00.000Z'),
      verdictEvent(2, 'demo#uat-1', 'fail', '2026-07-17T01:00:00.000Z'),
    ];
    applyUatCriteria(stories, map, events, rollupStatus);
    expect(stories[0]!.uatCriteria).toEqual([{ id: 'demo#uat-1', state: 'failing' }]);
  });

  it('a first-ever fail (no prior pass) does NOT over-claim "failing" — rollupStatus abstains to "pending"', () => {
    const stories = [story('demo')];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }]]]);
    const events = [verdictEvent(1, 'demo#uat-1', 'fail', '2026-07-17T00:00:00.000Z')];
    applyUatCriteria(stories, map, events, rollupStatus);
    expect(stories[0]!.uatCriteria).toEqual([{ id: 'demo#uat-1', state: 'pending' }]);
  });

  it('no signed verdict for the id yields state "pending"', () => {
    const stories = [story('demo')];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }]]]);
    applyUatCriteria(stories, map, [], rollupStatus);
    expect(stories[0]!.uatCriteria).toEqual([{ id: 'demo#uat-1', state: 'pending' }]);
  });

  it('a null events source (json backend / down DB) yields "pending" for every criterion, never throws', () => {
    const stories = [story('demo')];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }, { id: 'demo#uat-2' }]]]);
    applyUatCriteria(stories, map, null, rollupStatus);
    expect(stories[0]!.uatCriteria).toEqual([
      { id: 'demo#uat-1', state: 'pending' },
      { id: 'demo#uat-2', state: 'pending' },
    ]);
  });

  it('omitting the rollup function entirely (no injected rollup) also yields "pending", never throws', () => {
    const stories = [story('demo')];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }]]]);
    const events = [verdictEvent(1, 'demo#uat-1', 'pass', '2026-07-17T00:00:00.000Z')];
    applyUatCriteria(stories, map, events); // no rollup injected
    expect(stories[0]!.uatCriteria).toEqual([{ id: 'demo#uat-1', state: 'pending' }]);
  });

  it('a story with no membership entry gets an empty uatCriteria array (never left undefined)', () => {
    const stories = [story('legacy')];
    applyUatCriteria(stories, new Map(), null, rollupStatus);
    expect(stories[0]!.uatCriteria).toEqual([]);
  });

  it('one entry per witnessable criterion, each independently resolved (mixed proven/failing/pending)', () => {
    const stories = [story('demo')];
    const map = new Map([
      ['demo', [{ id: 'demo#uat-1' }, { id: 'demo#uat-2' }, { id: 'demo#uat-3' }]],
    ]);
    const events = [
      verdictEvent(1, 'demo#uat-1', 'pass', '2026-07-17T01:00:00.000Z'),
      // demo#uat-2 regressed: a prior pass, then a fail — rollupStatus's demotion path to 'unhealthy'.
      verdictEvent(2, 'demo#uat-2', 'pass', '2026-07-17T01:30:00.000Z'),
      verdictEvent(3, 'demo#uat-2', 'fail', '2026-07-17T02:00:00.000Z'),
      // demo#uat-3 has no verdict at all.
    ];
    applyUatCriteria(stories, map, events, rollupStatus);
    expect(stories[0]!.uatCriteria).toEqual([
      { id: 'demo#uat-1', state: 'proven' },
      { id: 'demo#uat-2', state: 'failing' },
      { id: 'demo#uat-3', state: 'pending' },
    ]);
  });

  it('a regression (a later fail after an earlier pass) resolves to "failing", not "proven" (last event wins)', () => {
    const stories = [story('demo')];
    const map = new Map([['demo', [{ id: 'demo#uat-1' }]]]);
    const events = [
      verdictEvent(1, 'demo#uat-1', 'pass', '2026-07-17T01:00:00.000Z'),
      verdictEvent(2, 'demo#uat-1', 'fail', '2026-07-17T02:00:00.000Z'),
    ];
    applyUatCriteria(stories, map, events, rollupStatus);
    expect(stories[0]!.uatCriteria).toEqual([{ id: 'demo#uat-1', state: 'failing' }]);
  });
});

// ---------------------------------------------------------------------------
// readTree's uatCriteriaByStory — membership over a REAL spec parse
// ---------------------------------------------------------------------------

let dir: string;

function storySpec(id: string, uatSection: string, extra = ''): string {
  return (
    `---\n` +
    `id: "${id}"\ntier: story\ntitle: "${id}"\noutcome: "o"\nstatus: proposed\nproof_mode: UAT\n` +
    `capabilities: []\n` +
    `---\n\n# ${id}\n\n${uatSection}\n${extra}`
  );
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'st-uat-criteria-'));
  await mkdir(path.join(dir, 'mixed'), { recursive: true });
  // Two witnessable UAT legs + one reliability gate — membership must include ONLY the two UAT legs.
  await writeFile(
    path.join(dir, 'mixed', 'story.md'),
    storySpec(
      'mixed',
      [
        '## UAT Test Criteria',
        '',
        '1. **First leg** _(witness: machine)_: it works.',
        '2. **Second leg** _(witness: human)_: it also works.',
      ].join('\n'),
      [
        '',
        '## Reliability Gates',
        '',
        '1. **A brownfield gate** _(gate: observe)_ `pnpm test`.',
        '',
      ].join('\n'),
    ),
  );
  await mkdir(path.join(dir, 'aspirational'), { recursive: true });
  // Every leg is would-be (aspirational) — membership must be EMPTY (excluded, not just un-green-blocking).
  await writeFile(
    path.join(dir, 'aspirational', 'story.md'),
    storySpec(
      'aspirational',
      [
        '## UAT Test Criteria (would-be)',
        '',
        '1. **Someday leg** _(witness: human)_: not yet scripted.',
      ].join('\n'),
    ),
  );
  await mkdir(path.join(dir, 'none'), { recursive: true });
  await writeFile(path.join(dir, 'none', 'story.md'), storySpec('none', ''));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readTree uatCriteriaByStory (membership, forest-parcels inc-2)', () => {
  it('collects only the witnessable UAT legs, excluding reliability gates', async () => {
    const { uatCriteriaByStory } = await readTree(dir);
    expect(uatCriteriaByStory.get('mixed')?.map((t) => t.id)).toEqual([
      'mixed#uat-1',
      'mixed#uat-2',
    ]);
  });

  it('excludes would-be (aspirational) legs entirely — no membership entry', async () => {
    const { uatCriteriaByStory } = await readTree(dir);
    expect(uatCriteriaByStory.get('aspirational')).toBeUndefined();
  });

  it('a story with no UAT section has no membership entry', async () => {
    const { uatCriteriaByStory } = await readTree(dir);
    expect(uatCriteriaByStory.get('none')).toBeUndefined();
  });

  it('applying applyUatCriteria over the real membership + no events yields "pending" legs only for "mixed"', async () => {
    const { payload, uatCriteriaByStory } = await readTree(dir);
    applyUatCriteria(payload.stories, uatCriteriaByStory, null, rollupStatus);
    const mixed = payload.stories.find((s) => s.id === 'mixed');
    expect(mixed?.uatCriteria).toEqual([
      { id: 'mixed#uat-1', state: 'pending' },
      { id: 'mixed#uat-2', state: 'pending' },
    ]);
    const aspirational = payload.stories.find((s) => s.id === 'aspirational');
    expect(aspirational?.uatCriteria).toEqual([]); // aspirational legs never surface here
  });
});
