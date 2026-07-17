import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonBackend } from './libraryBackend';

// ADR-0210: the offline JsonBackend no longer reads a committed generated assets.json. When given a
// knowledgeFile it SEEDS a gitignored runtime store on first read (derive corpus + templates); when
// not, an absent store still reads empty (the pre-ADR-0210 behaviour the integration tests rely on).

describe('JsonBackend offline seed (ADR-0210)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jb-seed-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const backend = (opts: { knowledgeFile?: string }): JsonBackend =>
    new JsonBackend({
      assetsFile: path.join(dir, 'assets.runtime.json'),
      commentsFile: path.join(dir, 'comments.json'),
      usersFile: path.join(dir, 'users.json'),
      attestationsFile: path.join(dir, 'attestations.json'),
      ...opts,
    });

  const seedKnowledge = async (units: unknown[]): Promise<string> => {
    const file = path.join(dir, 'knowledge.json');
    await fs.writeFile(file, JSON.stringify(units), 'utf8');
    return file;
  };

  it('seeds the runtime store on first read (derived corpus + the 13 templates) and writes it to disk', async () => {
    const knowledgeFile = await seedKnowledge([
      {
        id: 'k1',
        kind: 'definition',
        title: 'K1',
        description: 'd',
        references: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const assets = await backend({ knowledgeFile }).listAssets();
    expect(assets.map((a) => a.id)).toContain('k1');
    expect(assets.filter((a) => a.category === 'template')).toHaveLength(13);

    // durability: the derived store is written to the gitignored runtime file
    const onDisk = JSON.parse(
      await fs.readFile(path.join(dir, 'assets.runtime.json'), 'utf8'),
    ) as unknown[];
    expect(onDisk).toHaveLength(assets.length);
  });

  it('is idempotent — a present runtime store is not re-seeded, so a user edit survives a restart', async () => {
    const knowledgeFile = await seedKnowledge([]);
    const first = backend({ knowledgeFile });
    await first.listAssets(); // seeds (templates only)
    await first.createAsset({
      id: 'mine',
      category: 'principle',
      title: 'Mine',
      description: 'd',
      body: 'b',
      references: [],
    });

    // a fresh backend over the same dir must SEE the edit — the seed must not clobber it
    const reopened = backend({ knowledgeFile });
    const ids = (await reopened.listAssets()).map((a) => a.id);
    expect(ids).toContain('mine');
  });

  it('without a knowledgeFile, an absent store reads empty (pre-ADR-0210 behaviour preserved)', async () => {
    expect(await backend({}).listAssets()).toEqual([]);
  });
});
