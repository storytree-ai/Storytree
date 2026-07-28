// Integration tests for the map-server-memo capability (ADR-0240 stage 3: "memoize the server
// walks and add validators") over a REAL node:http server, a REAL temp-directory docs/stories
// corpus, and a REAL conditional `fetch` — only the LibraryBackend is stubbed (the
// healthApi.integration.test.ts / claimsApi.integration.test.ts pattern). A mocked filesystem or a
// stubbed walk would hollow every freshness contract here, so `/api/docs` and `/api/tree` are
// driven through the real `handleApiRequest` dispatch against files this suite writes and edits
// itself.
//
// The outcome under test: "A repeated studio load is answered without re-reading a corpus that
// has not changed on disk." At HEAD neither route sets any cache/validator header at all — every
// GET is unconditionally a fresh 200 — so each contract below is a NEW failing assertion about
// behaviour the current handlers do not implement, not a missing-symbol import.
//
// Each `describe` leads with its declared contract id as ONE plain string literal (the
// `describe("<id>: …")` convention), never a concatenation: the coverage sweep is a static AST scan
// (ADR-0126) and reads an assembled title as UNCOVERED even when the id is the first thing in it.
//
// RED PROVENANCE. Every contract here was observed failing before it was observed passing, but not
// all against the same baseline, and the difference is worth stating rather than leaving implied:
//
//   - Against the ABSENT implementation (no memo, no validators), contracts 1, 2, 5, 7 and 9 fail.
//     These are the capability's positive claims: without the code there is nothing to serve them.
//   - Contracts 3, 4, 6 and 8 are GUARD-RAILS. A server that memoizes nothing trivially satisfies
//     them — it re-walks every time, so nothing is stale, nothing is poisoned, and no route carries
//     a header it should not. Their real red is a plausible WRONG memo, and each was confirmed to
//     fail against one: 3 against a memo that never invalidates; 4 against one that returns its
//     stored object instead of a copy; 6 against one that memoizes the ENRICHED payload rather than
//     the file walk alone; 8 against folding the headers into the shared `sendJson`.
//
// Keeping the guard-rails is the point: they are what stops a later "simplification" — most
// obviously a switch to ADR-0240's literally-prescribed directory-mtime key, which contract 2 also
// rejects — from quietly reintroducing the defect this capability exists to prevent.

import { describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, writeFile, mkdir, rm, rename, unlink, utimes, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { handleApiRequest, type ApiContext } from './apiRouter';
import { memoizeCorpusWalk } from './corpusMemo';
import type { LibraryBackend } from './libraryBackend';
import type { BuildActivity } from '../src/types';

type Verdicts = Record<string, { outcome: 'pass' | 'fail'; at: string }> | null;

/** A minimal, fully-typed LibraryBackend — every real backend method is a harmless no-op except
 * `latestVerdicts` and `inFlightBuilds`, which read mutable closures so a test can change what the
 * LIVE enrichment answers between two requests against the SAME, unedited corpus. */
function makeBackend(
  getVerdicts: () => Verdicts,
  getBuilds: () => BuildActivity[] | null,
): LibraryBackend {
  return {
    listAssets: async () => [],
    createAsset: async (input) => ({ ...input, createdAt: 'now', updatedAt: 'now' }),
    updateAsset: async () => null,
    deleteAsset: async () => false,
    health: async () => ({ db: 'n/a' as const }),
    latestVerdicts: async () => getVerdicts(),
    inFlightBuilds: async () => getBuilds(),
    listComments: async () => [],
    createComment: async (c) => c,
    updateComment: async () => null,
    deleteComment: async () => true,
    listUsers: async () => [],
    getUser: async () => null,
    upsertUser: async (doc) => doc,
    removeUser: async () => false,
    listAttestations: async () => ({}),
    recordAttestation: async (att) => att,
    close: async () => {},
  };
}

/** A minimal `story.md` loadNodeSpec accepts — mirrors treeBuildable.test.ts's storySpec. */
function storySpec(outcome: string, id = 'demo'): string {
  return (
    `---\n` +
    `id: "${id}"\ntier: story\ntitle: "${id}"\noutcome: "${outcome}"\nstatus: proposed\nproof_mode: UAT\n` +
    `capabilities: []\n` +
    `---\n\n# ${id}\n`
  );
}

function guideDoc(sentence: string): string {
  return `# Guide\n\n${sentence}\n`;
}

interface Harness {
  base: string;
  docsDir: string;
  storiesDir: string;
  setVerdicts: (v: Verdicts) => void;
  setBuilds: (b: BuildActivity[] | null) => void;
}

/** Stand up an isolated temp corpus + a REAL http server over the real dispatch, run `body`
 * against it, then tear everything down — every test gets its own root, so no test can see
 * another's edits. */
async function withHarness(
  seed: (dirs: { docsDir: string; storiesDir: string }) => Promise<void>,
  body: (h: Harness) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'st-map-memo-'));
  const docsDir = path.join(root, 'docs');
  const storiesDir = path.join(root, 'stories');
  await mkdir(docsDir, { recursive: true });
  await mkdir(storiesDir, { recursive: true });
  await seed({ docsDir, storiesDir });

  let verdicts: Verdicts = null;
  let builds: BuildActivity[] | null = null;
  const ctx: ApiContext = {
    paths: {
      repoRoot: root,
      docsDir,
      storiesDir,
      dataDir: root,
      commentsFile: path.join(root, 'comments.json'),
      assetsFile: path.join(root, 'assets.json'),
      knowledgeFile: path.join(root, 'knowledge.json'),
      usersFile: path.join(root, 'users.json'),
      attestationsFile: path.join(root, 'attestations.json'),
    },
    backend: makeBackend(
      () => verdicts,
      () => builds,
    ),
    store: 'json',
    codeStamp: async () => null,
    allowDbControl: false,
  };

  let server: Server | undefined;
  try {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      void handleApiRequest(req, res, url, ctx);
    });
    await new Promise<void>((resolve) => (server as Server).listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await body({
      base,
      docsDir,
      storiesDir,
      setVerdicts: (v) => (verdicts = v),
      setBuilds: (b) => (builds = b),
    });
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => (server as Server).close((e) => (e ? reject(e) : resolve())));
    }
    await rm(root, { recursive: true, force: true });
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rewrite `file` with DIFFERENT bytes while holding its stat metadata identical — same byte length,
 * and mtime pinned back to a fixed instant with `utimes`.
 *
 * This is the instrument for the "did not re-read" contract, and it needs no mocking of any read
 * API: `listDocs` reads with `fs.promises.readFile` while `readTree` reads through
 * `loadNodeSpec`'s SYNC `readFileSync`, so no single spy covers both. Because the stat-only
 * fingerprint sees an unchanged (path, mtime, size) triple, a memoized route MUST still answer with
 * the payload it computed before this call — and a route that re-walked would answer with the new
 * bytes. The assertion therefore observes the skipped read directly, through the response.
 *
 * This is deliberately the fingerprint's one blind spot, exercised as a measuring device. It is not
 * a blessing of staleness: a same-length edit that also preserves mtime to the millisecond does not
 * arise from an editor writing a file, only from a test pinning it on purpose.
 */
const PINNED_MTIME = new Date(1_700_000_000_000);
async function rewritePreservingStat(file: string, contents: string): Promise<void> {
  const before = await stat(file);
  if (Buffer.byteLength(contents) !== before.size) {
    throw new Error(
      `rewritePreservingStat needs an identical byte length (had ${before.size}, got ${Buffer.byteLength(contents)})`,
    );
  }
  await writeFile(file, contents);
  await utimes(file, PINNED_MTIME, PINNED_MTIME);
}

/** Pin a file's mtime to the fixed instant, so a later {@link rewritePreservingStat} matches it. */
async function pinMtime(file: string): Promise<void> {
  await utimes(file, PINNED_MTIME, PINNED_MTIME);
}

describe('map-server-memo-repeats-without-re-reading-the-corpus: a repeat over an unchanged corpus is answered without reading or parsing it again', () => {
  it('answers /api/docs from the memo — new bytes behind an unchanged fingerprint are never read, and the body is byte-identical', async () => {
    const original = guideDoc('The original opening sentence for the guide.');
    // Same byte length, different content — so ONLY a genuine re-read could surface it.
    const shadow = guideDoc('The ORIGINAL OPENING sentence for the guide!');
    expect(Buffer.byteLength(shadow)).toBe(Buffer.byteLength(original));

    await withHarness(
      async ({ docsDir }) => {
        await writeFile(path.join(docsDir, 'guide.md'), original);
        await pinMtime(path.join(docsDir, 'guide.md'));
      },
      async ({ base, docsDir }) => {
        const firstBody = await (await fetch(`${base}/api/docs`)).text();
        expect(firstBody).toContain('The original opening sentence');

        await rewritePreservingStat(path.join(docsDir, 'guide.md'), shadow);

        const secondBody = await (await fetch(`${base}/api/docs`)).text();
        // The walk was skipped: the second response cannot have seen the new bytes.
        expect(secondBody).not.toContain('ORIGINAL OPENING');
        expect(secondBody).toBe(firstBody);
      },
    );
  });

  it('answers /api/tree from the memo — the story spec is not re-parsed, and the structural body is byte-identical', async () => {
    const original = storySpec('the original outcome aaa');
    const shadow = storySpec('the SHADOW outcome bbbbb');
    expect(Buffer.byteLength(shadow)).toBe(Buffer.byteLength(original));

    await withHarness(
      async ({ storiesDir }) => {
        await mkdir(path.join(storiesDir, 'demo'), { recursive: true });
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), original);
        await pinMtime(path.join(storiesDir, 'demo', 'story.md'));
      },
      async ({ base, storiesDir }) => {
        const firstBody = await (await fetch(`${base}/api/tree`)).text();
        expect(firstBody).toContain('the original outcome');

        await rewritePreservingStat(path.join(storiesDir, 'demo', 'story.md'), shadow);

        const secondBody = await (await fetch(`${base}/api/tree`)).text();
        expect(secondBody).not.toContain('SHADOW');
        expect(secondBody).toBe(firstBody);
      },
    );
  });
});

describe('map-server-memo-revalidates-on-a-content-edit: a content-only edit is visible on the next request, which directory mtime alone would miss', () => {
  it("edits a doc's CONTENT ONLY — no add, remove, or rename, so the directory's own mtime does not move", async () => {
    await withHarness(
      async ({ docsDir }) => {
        await writeFile(path.join(docsDir, 'guide.md'), guideDoc('The original opening sentence for the guide.'));
      },
      async ({ base, docsDir }) => {
        const dirBefore = await stat(docsDir);
        const first = await fetch(`${base}/api/docs`);
        const etag1 = first.headers.get('etag');
        expect(etag1).toBeTruthy();

        await sleep(20);
        await writeFile(
          path.join(docsDir, 'guide.md'),
          guideDoc('A completely different opening sentence, deliberately longer than the first one.'),
        );
        // The premise of the contract: the CONTAINING DIRECTORY's mtime did not move, so an
        // invalidation keyed on it (ADR-0240's literal wording) would serve the stale payload.
        expect((await stat(docsDir)).mtimeMs).toBe(dirBefore.mtimeMs);

        // The OLD validator must no longer match — a conditional GET with it gets a fresh 200, not 304.
        const stale = await fetch(`${base}/api/docs`, { headers: { 'If-None-Match': etag1 ?? '' } });
        expect(stale.status).toBe(200);

        const second = await fetch(`${base}/api/docs`);
        const etag2 = second.headers.get('etag');
        expect(etag2).toBeTruthy();
        expect(etag2).not.toBe(etag1);
        const docs = (await second.json()) as { excerpt: string }[];
        expect(docs.some((d) => d.excerpt.includes('completely different opening sentence'))).toBe(true);
      },
    );
  });

  it("edits story.md's CONTENT ONLY, with the story directory's own mtime likewise unmoved", async () => {
    await withHarness(
      async ({ storiesDir }) => {
        await mkdir(path.join(storiesDir, 'demo'), { recursive: true });
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), storySpec('the original outcome'));
      },
      async ({ base, storiesDir }) => {
        const storyDir = path.join(storiesDir, 'demo');
        const dirBefore = await stat(storyDir);
        const first = await fetch(`${base}/api/tree`);
        const etag1 = first.headers.get('etag');
        expect(etag1).toBeTruthy();

        await sleep(20);
        await writeFile(path.join(storyDir, 'story.md'), storySpec('an entirely different outcome'));
        expect((await stat(storyDir)).mtimeMs).toBe(dirBefore.mtimeMs);

        const stale = await fetch(`${base}/api/tree`, { headers: { 'If-None-Match': etag1 ?? '' } });
        expect(stale.status).toBe(200);

        const second = await fetch(`${base}/api/tree`);
        const etag2 = second.headers.get('etag');
        expect(etag2).toBeTruthy();
        expect(etag2).not.toBe(etag1);
        const body = (await second.json()) as { stories: { id: string; outcome: string }[] };
        expect(body.stories.find((s) => s.id === 'demo')?.outcome).toBe('an entirely different outcome');
      },
    );
  });
});

describe('map-server-memo-revalidates-on-an-add-a-remove-and-a-rename: each structural mutation of either tree is reflected on the next request', () => {
  it('reflects an added, a removed, and a renamed doc under docs/', async () => {
    await withHarness(
      async ({ docsDir }) => {
        await writeFile(path.join(docsDir, 'guide.md'), guideDoc('The original opening sentence for the guide.'));
      },
      async ({ base, docsDir }) => {
        const ids = async (): Promise<string[]> =>
          ((await (await fetch(`${base}/api/docs`)).json()) as { id: string }[]).map((d) => d.id);
        expect(await ids()).toEqual(['guide.md']);

        // ADD
        await sleep(20);
        await writeFile(path.join(docsDir, 'extra.md'), guideDoc('An additional reference document.'));
        expect(await ids()).toContain('extra.md');

        // RENAME
        await sleep(20);
        await rename(path.join(docsDir, 'extra.md'), path.join(docsDir, 'renamed.md'));
        const afterRename = await ids();
        expect(afterRename).toContain('renamed.md');
        expect(afterRename).not.toContain('extra.md');

        // REMOVE
        await sleep(20);
        await unlink(path.join(docsDir, 'renamed.md'));
        expect(await ids()).toEqual(['guide.md']);
      },
    );
  });

  it('reflects an added, a removed, and a renamed story under stories/', async () => {
    await withHarness(
      async ({ storiesDir }) => {
        await mkdir(path.join(storiesDir, 'demo'), { recursive: true });
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), storySpec('the original outcome'));
      },
      async ({ base, storiesDir }) => {
        const ids = async (): Promise<string[]> =>
          ((await (await fetch(`${base}/api/tree`)).json()) as { stories: { id: string }[] }).stories.map((s) => s.id);
        expect(await ids()).toEqual(['demo']);

        // ADD
        await sleep(20);
        await mkdir(path.join(storiesDir, 'second'), { recursive: true });
        await writeFile(path.join(storiesDir, 'second', 'story.md'), storySpec('a second outcome', 'second'));
        expect((await ids()).sort()).toEqual(['demo', 'second']);

        // RENAME (the story's own spec file moves out of discovery, so the story drops)
        await sleep(20);
        await rename(path.join(storiesDir, 'second', 'story.md'), path.join(storiesDir, 'second', 'moved.md'));
        expect(await ids()).toEqual(['demo']);

        // REMOVE
        await sleep(20);
        await rm(path.join(storiesDir, 'second'), { recursive: true, force: true });
        expect(await ids()).toEqual(['demo']);
      },
    );
  });
});

describe('map-server-memo-hands-back-an-unpollutable-payload: mutating a returned payload is never observable in a later read', () => {
  it('never lets the /api/tree live verdict enrichment survive past the request that produced it', async () => {
    // The single most important correctness contract (ADR-0240 stage 3 guidance): /api/tree
    // MUTATES its payload in place with live verdicts. If the memo ever hands back a stored
    // object (rather than something the mutation cannot reach), the first request's verdict
    // would still be attached on a LATER request over the SAME unedited corpus, once the live
    // verdict has gone away — a stale proof state arriving silently and surviving until a file
    // changes.
    await withHarness(
      async ({ storiesDir }) => {
        await mkdir(path.join(storiesDir, 'demo'), { recursive: true });
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), storySpec('the original outcome'));
      },
      async ({ base, setVerdicts }) => {
        setVerdicts({ demo: { outcome: 'pass', at: 't1' } });
        const first = await fetch(`${base}/api/tree`);
        const firstBody = (await first.json()) as { stories: { id: string; verdict?: { outcome: string } }[] };
        expect(firstBody.stories.find((s) => s.id === 'demo')?.verdict?.outcome).toBe('pass');

        // The corpus on disk is UNCHANGED — only the live verdict just disappeared.
        setVerdicts({});
        const second = await fetch(`${base}/api/tree`);
        const secondBody = (await second.json()) as { stories: { id: string; verdict?: { outcome: string } }[] };
        expect(secondBody.stories.find((s) => s.id === 'demo')?.verdict).toBeUndefined();
      },
    );
  });

  it('pins the same guarantee at the memo seam itself, so it does not rest on the route alone', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'st-map-memo-seam-'));
    try {
      await writeFile(path.join(root, 'a.md'), '# a\n');
      const compute = async (): Promise<{ stories: { id: string; verdict?: string }[] }> => ({
        stories: [{ id: 'demo' }],
      });

      const first = await memoizeCorpusWalk(root, compute);
      // Mutate the handed-back payload exactly as the live enrichment does.
      first.value.stories[0]!.verdict = 'pass';

      const second = await memoizeCorpusWalk(root, compute);
      expect(second.value.stories[0]?.verdict).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('map-server-memo-keys-per-directory: two served directories in one process never receive each other’s answer', () => {
  it('holds one entry per directory path — a second directory never evicts the first', async () => {
    const rootA = await mkdtemp(path.join(tmpdir(), 'st-map-memo-a-'));
    const rootB = await mkdtemp(path.join(tmpdir(), 'st-map-memo-b-'));
    try {
      await writeFile(path.join(rootA, 'a.md'), '# a\n');
      await writeFile(path.join(rootB, 'b.md'), '# b\n');

      const a1 = await memoizeCorpusWalk(rootA, async () => 'A-first');
      expect(a1.value).toBe('A-first');

      const b1 = await memoizeCorpusWalk(rootB, async () => 'B-first');
      expect(b1.value).toBe('B-first');

      // The discriminator: with ONE shared slot, rootB's entry would have evicted rootA's and this
      // would recompute to 'A-second'. Keyed per directory, rootA's entry is still there.
      const a2 = await memoizeCorpusWalk(rootA, async () => 'A-second');
      expect(a2.value).toBe('A-first');

      const b2 = await memoizeCorpusWalk(rootB, async () => 'B-second');
      expect(b2.value).toBe('B-first');
    } finally {
      await rm(rootA, { recursive: true, force: true });
      await rm(rootB, { recursive: true, force: true });
    }
  });

  it('serves each of two docs roots its own contents across servers in the same process', async () => {
    const seen: string[] = [];
    for (const marker of ['alpha-root-document', 'beta-root-document']) {
      await withHarness(
        async ({ docsDir }) => {
          await writeFile(path.join(docsDir, 'guide.md'), guideDoc(`Contents of the ${marker} here.`));
        },
        async ({ base }) => {
          seen.push(await (await fetch(`${base}/api/docs`)).text());
        },
      );
    }
    expect(seen[0]).toContain('alpha-root-document');
    expect(seen[0]).not.toContain('beta-root-document');
    expect(seen[1]).toContain('beta-root-document');
    expect(seen[1]).not.toContain('alpha-root-document');
  });
});

describe('map-server-memo-recomputes-live-enrichment-every-request: proof and in-flight state are never served from the file-keyed memo', () => {
  it('surfaces a newly signed verdict and a newly in-flight build over a corpus that has not changed', async () => {
    await withHarness(
      async ({ storiesDir }) => {
        await mkdir(path.join(storiesDir, 'demo'), { recursive: true });
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), storySpec('the original outcome'));
      },
      async ({ base, setVerdicts, setBuilds }) => {
        // Request 1: no live state at all.
        const first = (await (await fetch(`${base}/api/tree`)).json()) as {
          stories: { id: string; verdict?: { outcome: string } }[];
          builds?: BuildActivity[];
        };
        expect(first.stories.find((s) => s.id === 'demo')?.verdict).toBeUndefined();
        expect(first.builds).toBeUndefined();

        // The corpus on disk is untouched; only the LIVE backend answers change.
        setVerdicts({ demo: { outcome: 'pass', at: 't1' } });
        setBuilds([{ unitId: 'demo', tier: 'story', runId: 'run-1', at: 't1' }]);

        const second = (await (await fetch(`${base}/api/tree`)).json()) as {
          stories: { id: string; verdict?: { outcome: string } }[];
          builds?: BuildActivity[];
        };
        expect(second.stories.find((s) => s.id === 'demo')?.verdict?.outcome).toBe('pass');
        expect(second.builds?.[0]?.runId).toBe('run-1');
      },
    );
  });
});

describe('map-server-memo-revalidates-conditionally-over-the-full-body: both read routes carry a no-cache validator computed over the bytes actually sent', () => {
  it('answers /api/docs and /api/tree 200 with Cache-Control: no-cache and an ETag, and never a max-age', async () => {
    await withHarness(
      async ({ docsDir, storiesDir }) => {
        await writeFile(path.join(docsDir, 'guide.md'), guideDoc('The original opening sentence for the guide.'));
        await mkdir(path.join(storiesDir, 'demo'), { recursive: true });
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), storySpec('the original outcome'));
      },
      async ({ base }) => {
        for (const route of ['/api/docs', '/api/tree']) {
          const res = await fetch(`${base}${route}`);
          expect(res.status).toBe(200);
          // Validators, never caching — no-cache means "store it, but always ask" (stage 2's mandate);
          // a max-age would let a client paint proof state without asking and is refused.
          expect(res.headers.get('cache-control')).toBe('no-cache');
          expect(res.headers.get('etag')).toBeTruthy();
          expect(res.headers.get('cache-control')).not.toContain('max-age');
        }
      },
    );
  });

  it('answers a repeated conditional GET 304 with an empty body on both routes', async () => {
    await withHarness(
      async ({ docsDir, storiesDir }) => {
        await writeFile(path.join(docsDir, 'guide.md'), guideDoc('The original opening sentence for the guide.'));
        await mkdir(path.join(storiesDir, 'demo'), { recursive: true });
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), storySpec('the original outcome'));
      },
      async ({ base }) => {
        for (const route of ['/api/docs', '/api/tree']) {
          const first = await fetch(`${base}${route}`);
          const etag = first.headers.get('etag');
          expect(etag).toBeTruthy();
          const second = await fetch(`${base}${route}`, { headers: { 'If-None-Match': etag ?? '' } });
          expect(second.status).toBe(304);
          expect(await second.text()).toBe('');
          expect(second.headers.get('etag')).toBe(etag);
        }
      },
    );
  });

  it('busts the validator on a file change, and on a verdict change alone with no file change', async () => {
    await withHarness(
      async ({ storiesDir }) => {
        await mkdir(path.join(storiesDir, 'demo'), { recursive: true });
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), storySpec('the original outcome'));
      },
      async ({ base, storiesDir, setVerdicts }) => {
        const etag1 = (await fetch(`${base}/api/tree`)).headers.get('etag');
        expect(etag1).toBeTruthy();

        // (a) a FILE change busts it.
        await sleep(20);
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), storySpec('an entirely different outcome'));
        const afterFile = await fetch(`${base}/api/tree`, { headers: { 'If-None-Match': etag1 ?? '' } });
        expect(afterFile.status).toBe(200);
        const etag2 = afterFile.headers.get('etag');
        expect(etag2).not.toBe(etag1);

        // (b) a VERDICT change alone, with the corpus untouched, busts it too — the validator is
        // computed over the full body including the live enrichment, so a 304 can never hide a
        // crown that moved underneath.
        setVerdicts({ demo: { outcome: 'pass', at: 't1' } });
        const afterVerdict = await fetch(`${base}/api/tree`, { headers: { 'If-None-Match': etag2 ?? '' } });
        expect(afterVerdict.status).toBe(200);
        expect(afterVerdict.headers.get('etag')).not.toBe(etag2);
      },
    );
  });
});

describe('map-server-memo-leaves-mutable-and-write-routes-unvalidated: the validators reach the two read routes and nothing else', () => {
  it('leaves /api/assets, /api/comments, and a write response carrying neither ETag nor Cache-Control', async () => {
    await withHarness(
      async ({ docsDir }) => {
        await writeFile(path.join(docsDir, 'guide.md'), guideDoc('The original opening sentence for the guide.'));
      },
      async ({ base }) => {
        // `sendJson` is the ONE JSON sender for every route, so folding the headers into it would
        // have validated these too. They must be byte-for-byte what they are today.
        for (const route of ['/api/assets', '/api/comments']) {
          const res = await fetch(`${base}${route}`);
          expect(res.status).toBe(200);
          expect(res.headers.get('etag')).toBeNull();
          expect(res.headers.get('cache-control')).toBeNull();
        }

        const write = await fetch(`${base}/api/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: 'a comment', topicId: 'guide.md', topicKind: 'doc' }),
        });
        expect(write.status).toBe(201);
        expect(write.headers.get('etag')).toBeNull();
        expect(write.headers.get('cache-control')).toBeNull();
      },
    );
  });
});

describe('map-server-memo-never-serves-a-payload-a-mid-walk-edit-overtook: an edit landing during the walk costs a re-walk, never a stale serve', () => {
  it('keys the entry to the fingerprint observed BEFORE the walk, so the overtaken payload is never served as fresh', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'st-map-memo-race-'));
    try {
      const file = path.join(root, 'spec.md');
      await writeFile(file, '# v1\n');

      // The walk itself is overtaken: the file changes WHILE `compute` is running, so the value it
      // returns already describes the pre-edit disk.
      const first = await memoizeCorpusWalk(root, async () => {
        await sleep(20);
        await writeFile(file, '# v2 — edited during the walk\n');
        return 'pre-edit-payload';
      });
      expect(first.value).toBe('pre-edit-payload');

      // Fingerprinting BEFORE the walk keys that entry to v1, so the next request sees a different
      // fingerprint and recomputes. Fingerprinting AFTER would have stored the pre-edit payload
      // under v2's fingerprint and served it as current until something else changed.
      const second = await memoizeCorpusWalk(root, async () => 'post-edit-payload');
      expect(second.value).toBe('post-edit-payload');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
