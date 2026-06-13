// Integration tests for the hosted studio server (serve.ts + guestPolicy +
// identity) over a REAL node:http server with a STUB backend and a temp dist/
// — no DB, no Vite, no IAP (the presenceApi.integration.test.ts pattern). The
// contracts under test are studio-hosting `serve-mode` + `guest-scope`
// (ADR-0042): static SPA serving with a traversal guard; fail-closed identity;
// guests read + comment with the author STAMPED from the verified identity and
// an own-comments-only wall; the admin allowlist gating asset writes; db
// control structurally off.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStudioServer } from './serve';
import { parseAdmins } from './guestPolicy';
import { emailFromIapHeader, IAP_EMAIL_HEADER } from './identity';
import type { LibraryBackend } from './libraryBackend';
import type { Comment } from '../src/types';

const GUEST = 'guest@example.com';
const ADMIN = 'owner@example.com';
const iap = (email: string): Record<string, string> => ({
  [IAP_EMAIL_HEADER]: `accounts.google.com:${email}`,
});

/** A comment owned by `author` (anchor fields irrelevant to the policy under test). */
function comment(id: string, author: string): Comment {
  return {
    id,
    topicKind: 'asset',
    topicId: 'some-asset',
    anchor: {
      kind: 'topic',
      headingSlug: null,
      headingText: null,
      quote: null,
      prefix: null,
      suffix: null,
      startOffset: null,
      color: null,
    },
    body: 'a comment',
    author,
    createdAt: '2026-06-14T00:00:00.000Z',
    resolved: false,
    resolvedAt: null,
  };
}

/** What each backend method last received — the stub records instead of persisting. */
const seen: { createdComment?: Comment; updatedCommentId?: string; assetCreated?: boolean } = {};

const stubBackend: LibraryBackend = {
  listAssets: async () => [],
  createAsset: async (input) => {
    seen.assetCreated = true;
    return { ...input, body: input.body, createdAt: 'now', updatedAt: 'now' };
  },
  updateAsset: async () => null,
  deleteAsset: async () => false,
  health: async () => ({ db: 'n/a' as const }),
  latestVerdicts: async () => null,
  activeSessions: async () => null,
  listComments: async () => [comment('mine', GUEST), comment('theirs', 'someone-else@example.com')],
  createComment: async (c) => {
    seen.createdComment = c;
    return c;
  },
  updateComment: async (id) => {
    seen.updatedCommentId = id;
    return comment(id, GUEST);
  },
  deleteComment: async () => true,
  close: async () => {},
};

let server: Server;
let base: string;
let distDir: string;

beforeAll(async () => {
  distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-dist-'));
  await fs.writeFile(path.join(distDir, 'index.html'), '<html>studio spa</html>');
  await fs.mkdir(path.join(distDir, 'assets'));
  await fs.writeFile(path.join(distDir, 'assets', 'app.js'), 'console.log("app")');

  server = createStudioServer({
    distDir,
    // docs/stories point at the temp dir too — empty corpus, fine for policy tests.
    paths: {
      repoRoot: distDir,
      docsDir: path.join(distDir, 'docs'),
      storiesDir: path.join(distDir, 'stories'),
      dataDir: distDir,
      commentsFile: path.join(distDir, 'comments.json'),
      assetsFile: path.join(distDir, 'assets.json'),
    },
    backend: stubBackend,
    admins: parseAdmins(` ${ADMIN.toUpperCase()}, `), // exercises trim + case-folding
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  await fs.rm(distDir, { recursive: true, force: true });
});

describe('identity parsing', () => {
  it('takes the email after the IAP prefix, lowercased', () => {
    expect(emailFromIapHeader('accounts.google.com:Dev@Example.Com')).toBe('dev@example.com');
    expect(emailFromIapHeader('dev@example.com')).toBe('dev@example.com');
    expect(emailFromIapHeader('accounts.google.com:')).toBeNull();
  });
});

describe('static SPA serving', () => {
  it('serves index.html at / and real assets by path', async () => {
    const root = await fetch(`${base}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('studio spa');
    const asset = await fetch(`${base}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('text/javascript');
  });

  it('falls back to index.html for unknown paths (hash routing) — no identity needed', async () => {
    const res = await fetch(`${base}/some/deep/link`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('studio spa');
  });

  it('refuses encoded-slash traversal with a hard 404', async () => {
    // Plain ".." and whole-segment "%2e%2e" never reach the resolver — WHATWG URL
    // parsing clamps dot segments at the root. The vector the guard exists for is
    // ENCODED SLASHES: "%2f" survives URL parsing as one opaque segment and only
    // becomes "/" at our decodeURIComponent — re-introducing "..", which must 404.
    const secret = path.join(distDir, '..', 'studio-serve-secret.txt');
    await fs.writeFile(secret, 'not yours');
    try {
      const res = await fetch(`${base}/assets/%2e%2e%2f%2e%2e%2fstudio-serve-secret.txt`);
      expect(res.status).toBe(404);
    } finally {
      await fs.rm(secret, { force: true });
    }
  });
});

describe('fail-closed identity (guarded mode)', () => {
  it('refuses identity-less /api/* with 401 — every route, health included', async () => {
    for (const p of ['/api/assets', '/api/health', '/api/tree', '/api/db/status']) {
      const res = await fetch(`${base}${p}`);
      expect(res.status, p).toBe(401);
    }
  });

  it('an identified guest reads', async () => {
    const assets = await fetch(`${base}/api/assets`, { headers: iap(GUEST) });
    expect(assets.status).toBe(200);
    const health = await fetch(`${base}/api/health`, { headers: iap(GUEST) });
    expect(health.status).toBe(200);
  });
});

describe('guest scope (ADR-0042 d.3)', () => {
  it('guest asset writes → 403; admin asset writes pass through', async () => {
    const payload = JSON.stringify({
      id: 'new-asset',
      category: 'pattern',
      title: 't',
      description: 'd',
      body: 'b',
      references: [],
    });
    const guest = await fetch(`${base}/api/assets`, {
      method: 'POST',
      headers: iap(GUEST),
      body: payload,
    });
    expect(guest.status).toBe(403);
    expect(seen.assetCreated).toBeUndefined();

    const admin = await fetch(`${base}/api/assets`, {
      method: 'POST',
      headers: iap(ADMIN),
      body: payload,
    });
    expect(admin.status).toBe(201);
    expect(seen.assetCreated).toBe(true);
  });

  it('db control is off for guest AND admin (structurally, not by allowlist)', async () => {
    for (const who of [GUEST, ADMIN]) {
      const res = await fetch(`${base}/api/db/status`, { headers: iap(who) });
      expect(res.status, who).toBe(403);
    }
  });

  it('comment authorship is stamped from the verified identity — the client field is ignored', async () => {
    const res = await fetch(`${base}/api/comments`, {
      method: 'POST',
      headers: iap(GUEST),
      body: JSON.stringify({
        topicKind: 'asset',
        topicId: 'some-asset',
        body: 'hello from the circle',
        author: 'forged-operator', // must not survive
      }),
    });
    expect(res.status).toBe(201);
    expect(seen.createdComment?.author).toBe(GUEST);
  });

  it("a guest edits their own comment but not another author's", async () => {
    const own = await fetch(`${base}/api/comments?id=mine`, {
      method: 'PATCH',
      headers: iap(GUEST),
      body: JSON.stringify({ resolved: true }),
    });
    expect(own.status).toBe(200);
    expect(seen.updatedCommentId).toBe('mine');

    const theirs = await fetch(`${base}/api/comments?id=theirs`, {
      method: 'PATCH',
      headers: iap(GUEST),
      body: JSON.stringify({ resolved: true }),
    });
    expect(theirs.status).toBe(403);

    const deleted = await fetch(`${base}/api/comments?id=theirs`, {
      method: 'DELETE',
      headers: iap(GUEST),
    });
    expect(deleted.status).toBe(403);
  });

  it('an admin may touch any comment (still identity-stamped on create)', async () => {
    const res = await fetch(`${base}/api/comments?id=theirs`, {
      method: 'PATCH',
      headers: iap(ADMIN),
      body: JSON.stringify({ resolved: true }),
    });
    expect(res.status).toBe(200);
  });
});
