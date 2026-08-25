// PARITY between the two readers of `stories/**` (ADR-0445 D1, `map-freshness-arc` inc-02).
//
// `readTree` (apiRouter.ts) is what the forest map reads TODAY, off the app's own disk. The
// projector (`@storytree/drive`) is what fills the live store's mirror. Inc-03 will point the map at
// the mirror; this test is what makes that a repoint rather than a rewrite — a mirror nothing
// compares to its original is a mirror that drifts, and the drift would surface as islands quietly
// changing colour, which is exactly the class of fault this arc exists to close.
//
// WHAT IS COMPARED: the FACTS both sides carry — the story set, each story's frontmatter fields, its
// capability ids IN ORDER, each capability's own fields, and each story's criteria and gates.
//
// WHAT IS NOT, and why that is not a hole: `readTree` additionally FOLDS — it resolves `uatWitness`
// through `effectiveUatWitness`, filters would-be criteria, drops retired gates via
// `activeReliabilityGates`, and unions the crown's obligations. The projection deliberately carries
// the RAW authored facts and leaves every fold to the reader (see the projector's header). So the
// folds are applied HERE, on the projection side, to line the two up — which is precisely the shape
// inc-03's reader will take, written down before it is needed.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { projectWorkHierarchy } from '@storytree/drive';
import {
  activeReliabilityGates,
  canonicalUatCriterionContent,
  effectiveUatWitness,
} from '@storytree/library';
import { criterionRevisionId } from '@storytree/proof-protocol';

import { readTree } from './apiRouter.js';

const C1 = 'uatc_000000000000000000000001';
const C2 = 'uatc_000000000000000000000002';

/** One authored criterion item whose revision id actually binds its own content. */
function uatItem(ordinal: number, criterionId: string, lead: string): string {
  const draft = `${String(ordinal)}. **${lead}** _(criterion-id: ${criterionId})_ _(revision-id: uatr1:0000000000000000)_ _(witness: machine)_`;
  return draft.replace('uatr1:0000000000000000', criterionRevisionId(canonicalUatCriterionContent(draft)));
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

/** A tree with a healthy story, two real capabilities, one MISSING one, and a broken sibling story. */
function makeTree(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'storytree-parity-'));
  const files = {
    'demo/story.md': storySpec(),
    'demo/demo-cap.md': capabilitySpec('demo-cap'),
    'demo/second-cap.md': capabilitySpec('second-cap'),
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
  generator: 'parity-test',
};

describe('work-hierarchy-projection-mirrors-the-checkout', () => {
  it('projects the same stories, capabilities, criteria and gates readTree renders', async () => {
    const root = makeTree();
    try {
      const disk = await readTree(root);
      const projected = projectWorkHierarchy(root, STAMP);

      // Same story set, same order.
      expect(projected.stories.map((s) => s.id)).toEqual(disk.payload.stories.map((s) => s.id));

      for (const diskStory of disk.payload.stories) {
        const mirrored = projected.stories.find((s) => s.id === diskStory.id);
        expect(mirrored, `story ${diskStory.id} is in the projection`).toBeDefined();
        expect({
          title: mirrored!.title,
          outcome: mirrored!.outcome,
          status: mirrored!.status,
          proofMode: mirrored!.proofMode,
          dependsOn: mirrored!.dependsOn,
          consumedBy: mirrored!.consumedBy,
          decisions: mirrored!.decisions,
          building: mirrored!.building,
          // THE FOLD, applied on the projection side — the reader's job, written down here.
          uatWitness: effectiveUatWitness(mirrored!.uatWitness ?? undefined),
          capabilities: mirrored!.capabilities,
          hasError: mirrored!.error !== undefined,
        }).toEqual({
          title: diskStory.title,
          outcome: diskStory.outcome,
          status: diskStory.status,
          proofMode: diskStory.proofMode,
          dependsOn: diskStory.dependsOn,
          consumedBy: diskStory.consumedBy,
          decisions: diskStory.decisions ?? [],
          building: diskStory.building === true,
          uatWitness: diskStory.uatWitness,
          capabilities: diskStory.capabilities.map((c) => c.id),
          hasError: diskStory.error !== undefined,
        });

        // Each capability, field for field, including the error node for the one whose file is absent.
        for (const diskCap of diskStory.capabilities) {
          const cap = projected.capabilities.find((c) => c.id === diskCap.id);
          expect(cap, `capability ${diskCap.id} is in the projection`).toBeDefined();
          expect({
            storyId: cap!.storyId,
            title: cap!.title,
            outcome: cap!.outcome,
            status: cap!.status,
            proofMode: cap!.proofMode,
            dependsOn: cap!.dependsOn,
            contractCount: cap!.contractCount,
            error: cap!.error,
          }).toEqual({
            storyId: diskStory.id,
            title: diskCap.title,
            outcome: diskCap.outcome,
            status: diskCap.status,
            proofMode: diskCap.proofMode,
            dependsOn: diskCap.dependsOn,
            contractCount: diskCap.testCount,
            error: diskCap.error,
          });
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('carries the criteria readTree binds verdicts by — the same ids at the same revisions', async () => {
    const root = makeTree();
    try {
      const disk = await readTree(root);
      const projected = projectWorkHierarchy(root, STAMP);

      // `uatCriteriaByStory` is readTree's WITNESSABLE list (would-be filtered out). The projection
      // carries every authored criterion, so the same filter is applied here.
      for (const [storyId, criteria] of disk.uatCriteriaByStory) {
        const mirrored = projected.stories.find((s) => s.id === storyId)!;
        expect(
          mirrored.uatTestCriteria
            .filter((c) => !c.wouldBe)
            .map((c) => ({ criterionId: c.criterionId, revisionId: c.revisionId })),
        ).toEqual(criteria.map((c) => ({ criterionId: c.criterionId, revisionId: c.revisionId })));
      }

      // And the coverage fold: `activeReliabilityGates` over the projection reproduces readTree's
      // `coverageByStory` — id and `(covers:)` alike, retired gates dropped by the same function.
      for (const [storyId, gates] of disk.coverageByStory) {
        const mirrored = projected.stories.find((s) => s.id === storyId)!;
        expect(
          activeReliabilityGates(mirrored.reliabilityGates).map((g) => ({ id: g.id, covers: g.covers })),
        ).toEqual(gates.map((g) => ({ id: g.id, covers: g.covers })));
      }

      // The retired gate is genuinely IN the projection — the fold above is what removes it, which is
      // the whole point of storing raw facts.
      const demo = projected.stories.find((s) => s.id === 'demo')!;
      expect(demo.reliabilityGates).toHaveLength(2);
      expect(activeReliabilityGates(demo.reliabilityGates)).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
