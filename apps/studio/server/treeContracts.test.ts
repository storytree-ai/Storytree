// readTree wires each capability's declared-contract COUNT (forest-parcels increment 1): the number
// of leaf contracts a capability spec declares under its `## Contracts` section, parsed via
// `parseContracts` (@storytree/library) — already folded into the loaded spec's `contracts` field by
// `loadNodeSpec` (packages/orchestrator/src/node-spec.ts). Proven against a TEMP fixture stories dir
// (isolated from corpus churn), exercising the REAL readTree → real loader → real parser path. The
// parser's own cases live in packages/library (contracts.test.ts).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readTree } from './apiRouter';

let dir: string;

/** A cap spec, optionally carrying a `## Contracts` section with `n` declared items. */
function capSpec(id: string, story: string, contractCount: number): string {
  const contracts =
    contractCount > 0
      ? `\n## Contracts (${contractCount})\n\n` +
        Array.from(
          { length: contractCount },
          (_, i) => `${i + 1}. **\`${id}-contract-${i + 1}\`** — leaf behaviour ${i + 1}\n`,
        ).join('')
      : '';
  return (
    `---\n` +
    `id: "${id}"\ntier: capability\nstory: ${story}\ntitle: "${id}"\n` +
    `outcome: "o"\nstatus: proposed\nproof_mode: integration-test\ndepends_on: []\n` +
    `---\n\n# ${id}\n${contracts}`
  );
}

function storySpec(id: string, caps: string[]): string {
  return (
    `---\n` +
    `id: "${id}"\ntier: story\ntitle: "${id}"\noutcome: "o"\nstatus: proposed\nproof_mode: UAT\n` +
    `capabilities: [${caps.join(', ')}]\n` +
    `---\n\n# ${id}\n`
  );
}

async function writeStory(id: string, caps: { id: string; contracts: number }[]): Promise<void> {
  const sdir = path.join(dir, id);
  await mkdir(sdir, { recursive: true });
  await writeFile(path.join(sdir, 'story.md'), storySpec(id, caps.map((c) => c.id)));
  for (const c of caps) {
    await writeFile(path.join(sdir, `${c.id}.md`), capSpec(c.id, id, c.contracts));
  }
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'st-tree-contracts-'));
  // One story with a cap declaring 3 contracts, and a sibling cap declaring none.
  await writeStory('parcels', [
    { id: 'three-contracts', contracts: 3 },
    { id: 'no-contracts', contracts: 0 },
  ]);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readTree testCount (declared-contract count, forest-parcels increment 1)', () => {
  it('counts the declared `## Contracts` items for a capability that declares them', async () => {
    const { payload } = await readTree(dir);
    const story = payload.stories.find((s) => s.id === 'parcels');
    expect(story).toBeDefined();
    const cap = story?.capabilities.find((c) => c.id === 'three-contracts');
    expect(cap?.testCount).toBe(3);
  });

  it('yields testCount 0 for a capability whose spec declares no `## Contracts` section', async () => {
    const { payload } = await readTree(dir);
    const story = payload.stories.find((s) => s.id === 'parcels');
    const cap = story?.capabilities.find((c) => c.id === 'no-contracts');
    expect(cap?.testCount).toBe(0);
  });

  it('yields testCount 0 for a capability whose spec file is missing (the tolerant error path)', async () => {
    // loadTreeCapability's missing-file branch still returns a node — testCount defaults to 0.
    const missingDir = await mkdtemp(path.join(tmpdir(), 'st-tree-contracts-missing-'));
    try {
      await mkdir(path.join(missingDir, 'ghost'), { recursive: true });
      await writeFile(
        path.join(missingDir, 'ghost', 'story.md'),
        storySpec('ghost', ['absent']),
      );
      const { payload } = await readTree(missingDir);
      const story = payload.stories.find((s) => s.id === 'ghost');
      const cap = story?.capabilities.find((c) => c.id === 'absent');
      expect(cap?.error).toBe('spec file missing');
      expect(cap?.testCount).toBe(0);
    } finally {
      await rm(missingDir, { recursive: true, force: true });
    }
  });
});
