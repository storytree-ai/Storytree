// readTree plumbs the story's `decisions:` ADR numbers (the panel's "Relevant ADRs") onto each story
// — proven against a TEMP fixture stories dir (isolated from corpus churn) through the REAL readTree →
// real orchestrator loader path.
//
// The second ADR-0097 Layer-2 surface this file also covered — `adoption`, the covered/uncovered
// `classifyAdoption` covers-diff that rode with `goGreen === 'adopt'` — was REMOVED from the tree
// payload by ADR-0404 D4 along with the Adopt panel that was its only consumer. The classifier itself
// is untouched in @storytree/orchestrator and keeps its own tests there.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readTree } from './apiRouter';

let dir: string;

/** A minimal capability spec (status irrelevant to the covers-diff — it is structural). */
function capSpec(id: string, story: string): string {
  return (
    `---\n` +
    `id: "${id}"\ntier: capability\nstory: ${story}\ntitle: "${id}"\n` +
    `outcome: "o"\nstatus: mapped\nproof_mode: integration-test\ndepends_on: []\n` +
    `---\n\n# ${id}\n`
  );
}

/**
 * A brownfield (`mapped`) story with `decisions:`, two capabilities, and two `observe` gates whose
 * `(covers:)` green ONLY `cap-a` — leaving `cap-b` uncovered (the seed-corpus-scripts shape).
 */
function storySpec(): string {
  return (
    `---\n` +
    `id: "demo"\ntier: story\ntitle: "demo"\noutcome: "o"\nstatus: mapped\nproof_mode: UAT\n` +
    `uat_witness: machine\n` +
    `capabilities: [cap-a, cap-b]\n` +
    `decisions: [85, 97]\n` +
    `---\n\n# demo\n\n` +
    `## Reliability Gates\n\n` +
    `1. **Suite A is green** _(gate: observe)_ _(covers: cap-a)_ \`pnpm --filter @storytree/a test\`.\n` +
    `2. **Suite B is green** _(gate: observe)_ \`pnpm --filter @storytree/b test\`.\n`
  );
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'st-tree-adoption-'));
  const sdir = path.join(dir, 'demo');
  await mkdir(sdir, { recursive: true });
  await writeFile(path.join(sdir, 'story.md'), storySpec());
  await writeFile(path.join(sdir, 'cap-a.md'), capSpec('cap-a', 'demo'));
  await writeFile(path.join(sdir, 'cap-b.md'), capSpec('cap-b', 'demo'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readTree ADR-0097 Layer 2 wiring (decisions)', () => {
  it('plumbs the deciding ADR numbers onto the story (Relevant ADRs)', async () => {
    const { payload } = await readTree(dir);
    const demo = payload.stories.find((s) => s.id === 'demo');
    expect(demo?.decisions).toEqual([85, 97]);
  });

});
