// Integration test for the MOUNTED review-feed endpoint (ADR-0140 cap review-refresh-feed): GET
// /api/review/feed driven end-to-end through createStudioServer + guestPolicy + identity over a
// REAL node:http server with a STUB backend — no DB, no Vite, no IAP (the
// suggestionDecisionApi.integration.test.ts pattern). Where reviewFeedApi.test.ts exercises cap 5's
// HANDLER in isolation, this proves the endpoint is REACHABLE, member-readable, and that the
// route-table adapters carry the advisory posture:
//
//   - identity-less GET → 401 (IAP authenticates; fail-closed)
//   - a member GET      → 200 with the topic's comments AND suggestions (a GET passes the gate)
//   - the json posture (no listSuggestions seam) → 200, comments flow, suggestions [] — the
//     optional-seam degradation
//   - a THROWING backend (down DB) → 200 empty feed — the adapters swallow read failures to
//     empty lists (the advisory live-read discipline), never the central 503

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { UserDoc } from '@storytree/studio-members';
import type { Suggestion } from '@storytree/library/store';
import { createStudioServer } from './serve';
import { parseSeedAdmins } from './guestPolicy';
import { IAP_EMAIL_HEADER } from './identity';
import type { LibraryBackend } from './libraryBackend';
import type { Comment } from '../src/types';

const ADMIN = 'admin@example.com';
const MEMBER = 'member@example.com';
const TOPIC = 'slow-growth-principle';

const iap = (email: string): Record<string, string> => ({
  [IAP_EMAIL_HEADER]: `accounts.google.com:${email}`,
});

const userRow = (over: Partial<UserDoc> & { email: string; role: UserDoc['role'] }): UserDoc => ({
  status: 'active',
  invitedBy: ADMIN,
  createdAt: '2026-07-03T00:00:00.000Z',
  lastSeenAt: '2026-07-03T00:00:00.000Z',
  ...over,
});

const usersDb: UserDoc[] = [
  userRow({ email: ADMIN, role: 'admin' }),
  userRow({ email: MEMBER, role: 'member' }),
];

const comment = (id: string, topicId: string): Comment =>
  ({
    id,
    topicKind: 'asset',
    topicId,
    anchor: { kind: 'block', blockId: 'b-why', headingSlug: null, headingText: null, color: null },
    body: 'needs clarification',
    author: MEMBER,
    createdAt: '2026-07-03T00:00:00.000Z',
    resolved: false,
    resolvedAt: null,
  }) as unknown as Comment;

const suggestion = (id: string, topicId: string): Suggestion => ({
  id,
  topicKind: 'asset',
  topicId,
  block: 'b-why',
  proposed: 'proposed prose',
  original: 'original prose',
  status: 'open',
  author: MEMBER,
  createdAt: '2026-07-03T01:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
});

/**
 * The LibraryBackend surface the route table needs. `posture` picks the feed shape:
 *  - 'pg':    both reads answer (topic-filtered scripted lists)
 *  - 'json':  no listSuggestions seam (the offline backend omits it)
 *  - 'down':  both reads REJECT (a down DB behind the pg backend)
 */
function makeStubBackend(posture: 'pg' | 'json' | 'down'): LibraryBackend {
  const comments = [comment('c-target', TOPIC), comment('c-other', 'another-topic')];
  const suggestions = [suggestion('s-target', TOPIC), suggestion('s-other', 'another-topic')];
  const backend: LibraryBackend = {
    listAssets: async () => [],
    createAsset: async (input) => ({ ...input, createdAt: 'now', updatedAt: 'now' }),
    updateAsset: async () => null,
    deleteAsset: async () => false,
    health: async () => ({ db: 'n/a' as const }),
    latestVerdicts: async () => null,
    inFlightBuilds: async () => null,
    listComments: async (filter) => {
      if (posture === 'down') throw new Error('connection refused (stub down DB)');
      return comments.filter((c) => filter.topicId === undefined || c.topicId === filter.topicId);
    },
    createComment: async (c) => c,
    updateComment: async () => null,
    deleteComment: async () => false,
    listUsers: async () => usersDb.map((u) => ({ ...u })),
    getUser: async (email) => usersDb.find((u) => u.email === email.toLowerCase()) ?? null,
    upsertUser: async (doc) => doc,
    removeUser: async () => false,
    listAttestations: async () => ({}),
    recordAttestation: async (att) => att,
    close: async () => {},
  };
  if (posture !== 'json') {
    backend.listSuggestions = async (filter) => {
      if (posture === 'down') throw new Error('connection refused (stub down DB)');
      return suggestions.filter(
        (s) => filter?.topicId === undefined || s.topicId === filter.topicId,
      );
    };
  }
  return backend;
}

// ---------------------------------------------------------------------------
// Three servers: the live posture, the json posture, and the down-DB posture.
// ---------------------------------------------------------------------------

let servers: Server[] = [];
let base: string;
let jsonBase: string;
let downBase: string;
let distDir: string;

function startServer(backend: LibraryBackend, dir: string): Server {
  return createStudioServer({
    distDir: dir,
    paths: {
      repoRoot: dir,
      docsDir: path.join(dir, 'docs'),
      storiesDir: path.join(dir, 'stories'),
      dataDir: dir,
      commentsFile: path.join(dir, 'comments.json'),
      assetsFile: path.join(dir, 'assets.json'),
      usersFile: path.join(dir, 'users.json'),
      attestationsFile: path.join(dir, 'attestations.json'),
    },
    backend,
    admins: parseSeedAdmins(''), // membership comes from the rows, not the seed
  });
}

beforeAll(async () => {
  distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-feed-'));
  await fs.writeFile(path.join(distDir, 'index.html'), '<html>studio spa</html>');
  const bases: string[] = [];
  for (const posture of ['pg', 'json', 'down'] as const) {
    const server = startServer(makeStubBackend(posture), distDir);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    bases.push(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  }
  [base, jsonBase, downBase] = bases as [string, string, string];
});

afterAll(async () => {
  for (const server of servers) {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
  servers = [];
  await fs.rm(distDir, { recursive: true, force: true });
});

const get = (at: string, who?: string): Promise<Response> =>
  fetch(`${at}/api/review/feed?topicId=${TOPIC}`, {
    headers: who ? iap(who) : {},
  });

interface FeedBody {
  topicId: string;
  comments: Array<{ id: string }>;
  suggestions: Array<{ id: string; status: string }>;
}

// ---------------------------------------------------------------------------

describe('mounted /api/review/feed — member-readable, advisory (ADR-0140)', () => {
  it('refuses an identity-less GET (401) — IAP fail-closed', async () => {
    const res = await get(base);
    expect(res.status).toBe(401);
  });

  it('a member GET returns the topic feed (200) — both kinds, topic-filtered', async () => {
    const res = await get(base, MEMBER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as FeedBody;
    expect(body.topicId).toBe(TOPIC);
    expect(body.comments.map((c) => c.id)).toEqual(['c-target']);
    expect(body.suggestions.map((s) => s.id)).toEqual(['s-target']);
    expect(body.suggestions[0]?.status).toBe('open');
  });

  it('the json posture (no suggestion seam) degrades: comments flow, suggestions empty', async () => {
    const res = await get(jsonBase, MEMBER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as FeedBody;
    expect(body.comments.map((c) => c.id)).toEqual(['c-target']);
    expect(body.suggestions).toEqual([]);
  });

  it('a down DB degrades to an EMPTY feed (200), never the central 503 — the advisory read', async () => {
    const res = await get(downBase, MEMBER);
    expect(res.status).toBe(200);
    const body = (await res.json()) as FeedBody;
    expect(body.comments).toEqual([]);
    expect(body.suggestions).toEqual([]);
  });

  it('a non-GET method is refused (405)', async () => {
    const res = await fetch(`${base}/api/review/feed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...iap(ADMIN) },
      body: '{}',
    });
    expect(res.status).toBe(405);
  });
});
