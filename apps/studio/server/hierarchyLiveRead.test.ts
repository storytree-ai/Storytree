// THE REPOINT'S SAFETY NET (ADR-0445 D1, `map-freshness-arc` inc-03).
//
// `hierarchyProjectionParity.test.ts` (inc-02) proved the PROJECTION carries the same facts the disk
// walk does. This file proves the other half: that `foldWorkHierarchy` — the reader inc-03 points the
// map at — turns those facts back into the SAME four-part read `readTree` produces off disk.
//
// Together the two make the switch a repoint rather than a rewrite. Alone, neither would: a
// projection that matches the tree is worthless if the reader folds it differently, and this test is
// what stops an island changing colour on which source happened to answer.
//
// WHY THE WHOLE CHAIN AND NOT THE FOLD ALONE: the fold's inputs come from the projector, and its
// output is consumed as `readTree`'s. Testing it against a hand-built snapshot would assert the fold
// agrees with what THIS FILE thinks a snapshot looks like — the fault class where an expectation
// derived from its own subject cannot fail. Driving disk -> projector -> fold and comparing against
// disk -> readTree over ONE tree is what makes a disagreement anywhere in the chain visible.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { projectWorkHierarchy } from '@storytree/drive';
import {
  foldWorkHierarchy,
  canonicalUatCriterionContent,
  type WorkHierarchySnapshot,
} from '@storytree/library';
import { criterionRevisionId } from '@storytree/proof-protocol';

import { readTree } from './apiRouter.js';

const C1 = 'uatc_000000000000000000000001';
const C2 = 'uatc_000000000000000000000002';
const C3 = 'uatc_000000000000000000000003';

/** One authored criterion whose revision id actually binds its own content (ADR-0253). */
function uatItem(ordinal: number, criterionId: string, lead: string): string {
  const draft = `${String(ordinal)}. **${lead}** _(criterion-id: ${criterionId})_ _(revision-id: uatr1:0000000000000000)_ _(witness: machine)_`;
  return draft.replace(
    'uatr1:0000000000000000',
    criterionRevisionId(canonicalUatCriterionContent(draft)),
  );
}

function storySpec(): string {
  return [
    '---',
    'id: "demo"',
    'tier: story',
    'title: "Demo story"',
    'outcome: "a demo outcome"',
    'status: building',
    'proof_mode: UAT',
    'uat_witness: machine',
    'capabilities: [demo-cap, second-cap, absent-cap]',
    'depends_on: [library]',
    'consumed_by: [cli]',
    'decisions: [445]',
    'render: building',
    '---',
    '',
    '# Demo story',
    '',
    '## UAT Test Criteria',
    '',
    uatItem(1, C1, 'walk the forest'),
    '',
    uatItem(2, C2, 'read the panel'),
    '',
    '## Reliability Gates',
    '',
    '1. **The demo suite is green** _(gate: observe)_ _(covers: demo-cap)_ `pnpm test`.',
    '2. **A retired obligation** _(gate: observe)_ _(retired)_ `pnpm nothing`.',
    '',
  ].join('\n');
}

/**
 * A story whose UAT section is qualified `(would-be)` — the qualifier is on the HEADING, so every
 * criterion under it is unsignable-as-authored (ADR-0097). Carried by the projection, dropped by
 * both readers' folds.
 */
function wouldBeStory(): string {
  return [
    '---',
    'id: "aspirational"',
    'tier: story',
    'title: "Aspirational story"',
    'outcome: "declares only would-be legs"',
    'status: mapped',
    'proof_mode: UAT',
    'uat_witness: machine',
    'capabilities: []',
    '---',
    '',
    '# Aspirational story',
    '',
    '## UAT Test Criteria (would-be)',
    '',
    uatItem(1, C3, 'a leg nobody can sign yet'),
    '',
  ].join('\n');
}

/** A story that DECLARES no witness — the fail-closed `human` default is the reader's fold. */
function undeclaredWitnessStory(): string {
  return [
    '---',
    'id: "quiet"',
    'tier: story',
    'title: "Quiet story"',
    'outcome: "declares no witness"',
    'status: mapped',
    'proof_mode: UAT',
    'capabilities: []',
    '---',
    '',
    '# Quiet story',
    '',
  ].join('\n');
}

function capabilitySpec(id: string): string {
  return [
    '---',
    `id: "${id}"`,
    'tier: capability',
    'story: demo',
    `title: "${id} title"`,
    `outcome: "${id} outcome"`,
    'status: healthy',
    'proof_mode: integration-test',
    'depends_on: [demo-cap]',
    '---',
    '',
    `# ${id}`,
    '',
    '## Contracts',
    '',
    '1. **`demo-contract-one`** — the first.',
    '2. **`demo-contract-two`** — the second.',
    '',
  ].join('\n');
}

/**
 * A tree carrying every shape the two readers must agree about: a healthy story with two real
 * capabilities and one whose file is MISSING, a would-be criterion, a retired gate, a story that
 * declares no witness, and a sibling story whose spec does not parse at all.
 */
function makeTree(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'storytree-live-read-'));
  const files = {
    'demo/story.md': storySpec(),
    'demo/demo-cap.md': capabilitySpec('demo-cap'),
    'demo/second-cap.md': capabilitySpec('second-cap'),
    'quiet/story.md': undeclaredWitnessStory(),
    'aspirational/story.md': wouldBeStory(),
    'broken/story.md': 'not a spec at all',
  };
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  return root;
}

const STAMP = {
  commitSha: 'deadbeef',
  storiesTreeSha: 'cafef00d',
  generatedAt: '2026-08-26T00:00:00.000Z',
  generator: 'live-read-test',
};

/** The whole live path in one step: project the checkout, then fold it as the map would. */
function liveRead(root: string) {
  const snapshot: WorkHierarchySnapshot = projectWorkHierarchy(root, STAMP);
  return foldWorkHierarchy(snapshot);
}

/** `readTree`'s story order is `fs.readdir`'s; the fold sorts by id. Compare on equal footing. */
function byId<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

describe('the live hierarchy read reproduces the disk read', () => {
  it('map-live-hierarchy-read-reproduces-the-disk-read-field-for-field — stories and capabilities', async () => {
    const root = makeTree();
    try {
      const disk = await readTree(root);
      const live = liveRead(root);

      expect(live.stories.map((s) => s.id)).toEqual(
        byId(disk.payload.stories).map((s) => s.id),
      );

      for (const diskStory of disk.payload.stories) {
        const liveStory = live.stories.find((s) => s.id === diskStory.id);
        expect(liveStory, `story ${diskStory.id} is in the live read`).toBeDefined();
        expect({
          title: liveStory!.title,
          outcome: liveStory!.outcome,
          status: liveStory!.status,
          proofMode: liveStory!.proofMode,
          // The fold the live reader applies — NOT stored, deliberately (ADR-0040 fail-closed).
          uatWitness: liveStory!.uatWitness,
          dependsOn: liveStory!.dependsOn,
          consumedBy: liveStory!.consumedBy,
          decisions: liveStory!.decisions,
          building: liveStory!.building,
          hasError: liveStory!.error !== undefined,
        }).toEqual({
          title: diskStory.title,
          outcome: diskStory.outcome,
          status: diskStory.status,
          proofMode: diskStory.proofMode,
          uatWitness: diskStory.uatWitness,
          dependsOn: diskStory.dependsOn,
          consumedBy: diskStory.consumedBy,
          decisions: diskStory.decisions ?? [],
          building: diskStory.building === true,
          hasError: diskStory.error !== undefined,
        });

        // Capabilities in DECLARATION order, each field for field — the absent one included, since a
        // story rendering fewer capabilities than it declares is exactly the quiet under-claim this
        // arc exists to close.
        expect(liveStory!.capabilities.map((c) => c.id)).toEqual(
          diskStory.capabilities.map((c) => c.id),
        );
        for (const diskCap of diskStory.capabilities) {
          const liveCap = liveStory!.capabilities.find((c) => c.id === diskCap.id)!;
          expect({
            title: liveCap.title,
            outcome: liveCap.outcome,
            status: liveCap.status,
            proofMode: liveCap.proofMode,
            dependsOn: liveCap.dependsOn,
            testCount: liveCap.testCount,
            hasError: liveCap.error !== undefined,
          }).toEqual({
            title: diskCap.title,
            outcome: diskCap.outcome,
            status: diskCap.status,
            proofMode: diskCap.proofMode,
            dependsOn: diskCap.dependsOn,
            testCount: diskCap.testCount,
            hasError: diskCap.error !== undefined,
          });
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('map-live-hierarchy-read-reproduces-the-disk-read-field-for-field — criterion ids at the same revisions', async () => {
    const root = makeTree();
    try {
      const disk = await readTree(root);
      const live = liveRead(root);

      // THE INCIDENT'S MECHANISM. A verdict binds by `criterionId` + `revisionId` (ADR-0253); if the
      // live reader produced one different revision id, every verdict signed against it would stop
      // matching and the island would paint yellow — the exact fault, reproduced from the other side.
      expect([...live.uatCriteriaByStory.keys()].sort()).toEqual(
        [...disk.uatCriteriaByStory.keys()].sort(),
      );
      for (const [storyId, diskCriteria] of disk.uatCriteriaByStory) {
        expect(live.uatCriteriaByStory.get(storyId)).toEqual(
          diskCriteria.map((c) => ({
            criterionId: c.criterionId,
            revisionId: c.revisionId,
          })),
        );
      }

      // demo's two signable legs survive; the would-be story contributes NO marker-walk entry at
      // all, while the projection still carries its criterion — the fold is what removes it.
      expect(
        live.uatCriteriaByStory.get('demo')!.map((c) => c.criterionId),
      ).toEqual([C1, C2]);
      expect(live.uatCriteriaByStory.has('aspirational')).toBe(false);
      const snapshot = projectWorkHierarchy(root, STAMP);
      expect(
        snapshot.stories.find((s) => s.id === 'aspirational')!.uatTestCriteria.map((c) => c.criterionId),
      ).toEqual([C3]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('map-live-hierarchy-read-reproduces-the-disk-read-field-for-field — crown obligations and coverage', async () => {
    const root = makeTree();
    try {
      const disk = await readTree(root);
      const live = liveRead(root);

      expect([...live.uatTestCriteriaByStory.keys()].sort()).toEqual(
        [...disk.uatTestCriteriaByStory.keys()].sort(),
      );
      for (const [storyId, diskObligations] of disk.uatTestCriteriaByStory) {
        const idOf = (o: { criterionId?: string; id?: string }): string =>
          o.criterionId ?? o.id ?? '';
        expect(live.uatTestCriteriaByStory.get(storyId)!.map(idOf)).toEqual(
          diskObligations.map(idOf),
        );
      }

      // ADR-0436: the retired gate leaves the coverage set, on BOTH sides, via the same function.
      expect([...live.coverageByStory.keys()].sort()).toEqual(
        [...disk.coverageByStory.keys()].sort(),
      );
      for (const [storyId, diskGates] of disk.coverageByStory) {
        expect(live.coverageByStory.get(storyId)).toEqual(
          diskGates.map((g) =>
            g.covers === undefined ? { id: g.id } : { id: g.id, covers: g.covers },
          ),
        );
      }
      expect(live.coverageByStory.get('demo')).toEqual([
        { id: 'demo#gate-1', covers: ['demo-cap'] },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('map-live-hierarchy-read-applies-the-folds-the-reader-owns — no obligations for an unparseable spec', async () => {
    const root = makeTree();
    try {
      const live = liveRead(root);
      // `readTree` collects its three maps INSIDE the try, so a throwing spec contributes none. A
      // crown rolled up over criteria nobody could confirm were still authored is a green with no
      // reader — matching the omission is the point, not tolerating it.
      expect(live.uatTestCriteriaByStory.has('broken')).toBe(false);
      expect(live.uatCriteriaByStory.has('broken')).toBe(false);
      expect(live.coverageByStory.has('broken')).toBe(false);
      expect(live.stories.find((s) => s.id === 'broken')!.error).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('map-live-hierarchy-read-applies-the-folds-the-reader-owns — the witness default is resolved, not stored', async () => {
    const root = makeTree();
    try {
      const snapshot = projectWorkHierarchy(root, STAMP);
      const live = foldWorkHierarchy(snapshot);
      // The store carries `null` — the DECLARED value. The reader resolves it (ADR-0040). Asserting
      // both halves is what stops the default quietly migrating into the loader, which would put the
      // loader's rule version in the store and hand every reader a second staleness axis.
      expect(snapshot.stories.find((s) => s.id === 'quiet')!.uatWitness).toBeNull();
      expect(live.stories.find((s) => s.id === 'quiet')!.uatWitness).toBe('human');
      expect(live.stories.find((s) => s.id === 'demo')!.uatWitness).toBe('machine');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
