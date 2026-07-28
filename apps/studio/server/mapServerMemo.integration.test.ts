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

import { describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { handleApiRequest, type ApiContext } from './apiRouter';
import type { LibraryBackend } from './libraryBackend';

type Verdicts = Record<string, { outcome: 'pass' | 'fail'; at: string }> | null;

/** A minimal, fully-typed LibraryBackend — every real backend method is a harmless no-op except
 * `latestVerdicts`, which reads the mutable `getVerdicts` closure so a test can change what the
 * LIVE enrichment answers between two requests against the SAME, unedited corpus. */
function makeBackend(getVerdicts: () => Verdicts): LibraryBackend {
  return {
    listAssets: async () => [],
    createAsset: async (input) => ({ ...input, createdAt: 'now', updatedAt: 'now' }),
    updateAsset: async () => null,
    deleteAsset: async () => false,
    health: async () => ({ db: 'n/a' as const }),
    latestVerdicts: async () => getVerdicts(),
    inFlightBuilds: async () => null,
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
function storySpec(outcome: string): string {
  return (
    `---\n` +
    `id: "demo"\ntier: story\ntitle: "demo"\noutcome: "${outcome}"\nstatus: proposed\nproof_mode: UAT\n` +
    `capabilities: []\n` +
    `---\n\n# demo\n`
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
    backend: makeBackend(() => verdicts),
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
    await body({ base, docsDir, storiesDir, setVerdicts: (v) => (verdicts = v) });
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => (server as Server).close((e) => (e ? reject(e) : resolve())));
    }
    await rm(root, { recursive: true, force: true });
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('/api/docs — repeated-load validators (map-server-memo)', () => {
  it('answers 200 with a no-cache validator pair: Cache-Control: no-cache + an ETag', async () => {
    await withHarness(
      async ({ docsDir }) => {
        await writeFile(path.join(docsDir, 'guide.md'), guideDoc('The original opening sentence for the guide.'));
      },
      async ({ base }) => {
        const res = await fetch(`${base}/api/docs`);
        expect(res.status).toBe(200);
        // Validators, never caching — no-cache means "store it, but always ask" (stage 2's mandate);
        // a max-age would let a client paint without asking and is refused.
        expect(res.headers.get('cache-control')).toBe('no-cache');
        expect(res.headers.get('etag')).toBeTruthy();
      },
    );
  });

  it('a repeated GET carrying the current ETag is answered 304 with an empty body — the repeat load never re-reads', async () => {
    await withHarness(
      async ({ docsDir }) => {
        await writeFile(path.join(docsDir, 'guide.md'), guideDoc('The original opening sentence for the guide.'));
      },
      async ({ base }) => {
        const first = await fetch(`${base}/api/docs`);
        const etag = first.headers.get('etag');
        expect(etag).toBeTruthy();
        const second = await fetch(`${base}/api/docs`, { headers: { 'If-None-Match': etag ?? '' } });
        expect(second.status).toBe(304);
        expect(await second.text()).toBe('');
      },
    );
  });

  it("editing a doc's CONTENT ONLY (same file, no add/remove/rename) busts the validator — directory mtime alone would miss this", async () => {
    await withHarness(
      async ({ docsDir }) => {
        await writeFile(path.join(docsDir, 'guide.md'), guideDoc('The original opening sentence for the guide.'));
      },
      async ({ base, docsDir }) => {
        const first = await fetch(`${base}/api/docs`);
        const etag1 = first.headers.get('etag');
        expect(etag1).toBeTruthy();

        await sleep(20);
        await writeFile(
          path.join(docsDir, 'guide.md'),
          guideDoc('A completely different opening sentence, deliberately longer than the first one.'),
        );

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
});

describe('/api/tree — repeated-load validators (map-server-memo)', () => {
  it('answers 200 with a no-cache validator pair: Cache-Control: no-cache + an ETag', async () => {
    await withHarness(
      async ({ storiesDir }) => {
        await mkdir(path.join(storiesDir, 'demo'), { recursive: true });
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), storySpec('the original outcome'));
      },
      async ({ base }) => {
        const res = await fetch(`${base}/api/tree`);
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-cache');
        expect(res.headers.get('etag')).toBeTruthy();
      },
    );
  });

  it('a repeated GET carrying the current ETag is answered 304 with an empty body', async () => {
    await withHarness(
      async ({ storiesDir }) => {
        await mkdir(path.join(storiesDir, 'demo'), { recursive: true });
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), storySpec('the original outcome'));
      },
      async ({ base }) => {
        const first = await fetch(`${base}/api/tree`);
        const etag = first.headers.get('etag');
        expect(etag).toBeTruthy();
        const second = await fetch(`${base}/api/tree`, { headers: { 'If-None-Match': etag ?? '' } });
        expect(second.status).toBe(304);
        expect(await second.text()).toBe('');
      },
    );
  });

  it("editing story.md's CONTENT ONLY (same file, no add/remove/rename) busts the validator", async () => {
    await withHarness(
      async ({ storiesDir }) => {
        await mkdir(path.join(storiesDir, 'demo'), { recursive: true });
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), storySpec('the original outcome'));
      },
      async ({ base, storiesDir }) => {
        const first = await fetch(`${base}/api/tree`);
        const etag1 = first.headers.get('etag');
        expect(etag1).toBeTruthy();

        await sleep(20);
        await writeFile(path.join(storiesDir, 'demo', 'story.md'), storySpec('an entirely different outcome'));

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

  it('a returned payload can never poison the memo: live verdict enrichment never survives past the request that produced it', async () => {
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
});
