// readTree wires the story-level Build affordance (ADR-0090 Phase 2 increment): each story node
// carries `storyBuildable` — whether `story build <id> --real` has real work to drive — computed via
// the orchestrator's `isStoryBuildable` predicate over the loaded cap specs. Proven against a TEMP
// fixture stories dir (isolated from corpus churn), exercising the REAL readTree → real loader →
// real predicate path. The predicate's own cases live in packages/orchestrator (story-buildable.test.ts).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readTree } from './apiRouter';

let dir: string;

/** A cap spec with a spec-borne proof block; `real` adds the `--real` arm (ADR-0057). */
function capSpec(id: string, story: string, opts: { real?: boolean } = {}): string {
  // Scope globs must be rooted under packages/ or apps/ (ADR-0087).
  const realArm = opts.real
    ? `  real:\n    testFile: "packages/x/${id}.test.ts"\n    sourceFile: "packages/x/${id}.ts"\n    scope:\n      testGlobs: ["packages/x/${id}.test.ts"]\n      sourceGlobs: ["packages/x/${id}.ts"]\n`
    : '';
  return (
    `---\n` +
    `id: "${id}"\ntier: capability\nstory: ${story}\ntitle: "${id}"\n` +
    `outcome: "o"\nstatus: proposed\nproof_mode: integration-test\ndepends_on: []\n` +
    `proof:\n  command:\n    file: node\n    args: ["--test"]\n  scope:\n    testGlobs: ["packages/x/*.test.ts"]\n    sourceGlobs: ["packages/x/*.ts"]\n` +
    realArm +
    `---\n\n# ${id}\n`
  );
}

function storySpec(
  id: string,
  caps: string[],
  opts: { status?: string; reliabilityGate?: boolean } = {},
): string {
  const status = opts.status ?? 'proposed';
  // A brownfield story's Adopt path (ADR-0085): one `observe` reliability gate with an inline command.
  const gates = opts.reliabilityGate
    ? `\n## Reliability Gates\n\n1. **The suite is green** _(gate: observe)_ \`pnpm --filter @storytree/x test\`.\n`
    : '';
  return (
    `---\n` +
    `id: "${id}"\ntier: story\ntitle: "${id}"\noutcome: "o"\nstatus: ${status}\nproof_mode: UAT\n` +
    `capabilities: [${caps.join(', ')}]\n` +
    `---\n\n# ${id}\n${gates}`
  );
}

async function writeStory(
  id: string,
  caps: { id: string; real?: boolean }[],
  opts: { status?: string; reliabilityGate?: boolean } = {},
): Promise<void> {
  const sdir = path.join(dir, id);
  await mkdir(sdir, { recursive: true });
  await writeFile(path.join(sdir, 'story.md'), storySpec(id, caps.map((c) => c.id), opts));
  for (const c of caps) {
    await writeFile(path.join(sdir, `${c.id}.md`), capSpec(c.id, id, { ...(c.real ? { real: true } : {}) }));
  }
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'st-tree-buildable-'));
  // notice-board shape: all caps real-buildable, human-witnessed (story node withheld) ⇒ real-buildable.
  await writeStory('nb', [{ id: 'a', real: true }, { id: 'b', real: true }]);
  // library shape: caps live-only (no real arm) ⇒ NOT real-buildable (but its caps are live-buildable).
  await writeStory('liveonly', [{ id: 'c' }, { id: 'd' }]);
  // agent shape: capless ⇒ nothing to drive ⇒ not story-buildable.
  await writeStory('capless', []);
  // a mix: one non-real cap drops the whole story below real-buildable.
  await writeStory('mixed', [{ id: 'e', real: true }, { id: 'f' }]);
  // ADR-0094 mapped → Adopt: a brownfield (mapped) story that declares a `## Reliability Gates` gate.
  await writeStory('adopt', [{ id: 'g' }], { status: 'mapped', reliabilityGate: true });
  // ADR-0094 d.3: a mapped story with REAL caps but NO reliability gates — never lights Build (the
  // agent / binding-staleness shape); it has no go-green affordance until gates are authored.
  await writeStory('brownNoGates', [{ id: 'h', real: true }], { status: 'mapped' });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readTree storyBuildable (story-level --real affordance)', () => {
  it('marks an all-real-buildable story storyBuildable, and a capless/live-only/mixed one not', async () => {
    const { payload } = await readTree(dir);
    const byId = new Map(payload.stories.map((s) => [s.id, s]));

    expect(byId.get('nb')?.storyBuildable).toBe(true);
    expect(byId.get('liveonly')?.storyBuildable).toBe(false);
    expect(byId.get('capless')?.storyBuildable).toBe(false);
    expect(byId.get('mixed')?.storyBuildable).toBe(false);

    // The per-cap single-node `buildable` flag is independent of the story-level one: the live-only
    // story's caps are still single-node buildable (they carry a proof config).
    expect(byId.get('liveonly')?.capabilities.every((c) => c.buildable === true)).toBe(true);
  });
});

describe('readTree goGreen (status-aware go-green affordance, ADR-0094)', () => {
  it('lights Build for a proposed real-buildable story, Adopt for a mapped story with gates, none otherwise', async () => {
    const { payload } = await readTree(dir);
    const byId = new Map(payload.stories.map((s) => [s.id, s]));

    // `proposed` + a real build to drive ⇒ Build (drive author-declared obligations red→green).
    expect(byId.get('nb')?.goGreen).toBe('build');
    // `proposed` with no real path ⇒ no go-green action.
    expect(byId.get('liveonly')?.goGreen).toBe('none');
    expect(byId.get('capless')?.goGreen).toBe('none');
    expect(byId.get('mixed')?.goGreen).toBe('none');

    // `mapped` + declared `## Reliability Gates` ⇒ Adopt (observe-and-sign), with the gates surfaced.
    expect(byId.get('adopt')?.goGreen).toBe('adopt');
    expect(byId.get('adopt')?.adoptGates).toEqual([
      { id: 'adopt#gate-1', kind: 'observe', command: 'pnpm --filter @storytree/x test' },
    ]);

    // `mapped` with REAL caps but NO gates ⇒ NOT Build (ADR-0094 d.3), no affordance / no adoptGates.
    expect(byId.get('brownNoGates')?.goGreen).toBe('none');
    expect(byId.get('brownNoGates')?.storyBuildable).toBe(true); // the MECHANISM still says buildable…
    expect(byId.get('brownNoGates')?.adoptGates).toBeUndefined(); // …but the affordance is gated on status.

    // adoptGates is present ONLY for the adopt affordance (lean wire).
    expect(byId.get('nb')?.adoptGates).toBeUndefined();
  });
});
