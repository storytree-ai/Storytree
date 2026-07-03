// Integration test for the MOUNTED suggestion-CREATE endpoint (ADR-0140 caps 7/8): POST
// /api/suggestions driven end-to-end through createStudioServer + guestPolicy + identity over a
// REAL node:http server with a STUB backend — no DB, no Vite, no IAP (the
// suggestionDecisionApi.integration.test.ts pattern). Proves the route is reachable at exactly
// the path cap 4's gate opened to members, and every wall:
//
//   - identity-less POST → 401 (IAP authenticates; fail-closed) — nothing persisted
//   - a member POST      → 201, the record persisted OPEN with the author STAMPED from the
//                          verified identity (a body `author` field is ignored — not forgeable)
//   - an admin POST      → 201 too (admin ⊇ member for an additive proposal)
//   - missing/blank blockId / proposedText / topicKind / topicId, or an ABSENT originalText →
//     400 (an EMPTY-string originalText is ALLOWED — the store schema permits `original: ''`)
//   - a GET → 405 (the endpoint is POST-only)
//   - a backend without the suggestion seam (json) → 503, mirroring the decision route

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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

const ADMIN = 'admin@example.com';
const MEMBER = 'member@example.com';

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

// ---------------------------------------------------------------------------
// Stub backend — an in-memory suggestion store, so each wall is asserted on
// what was (or wasn't) persisted, not just a status code.
// ---------------------------------------------------------------------------

const suggestionsDb = new Map<string, Suggestion>();

function makeStubBackend(withSuggestionSeam: boolean): LibraryBackend {
  const backend: LibraryBackend = {
    listAssets: async () => [],
    createAsset: async (input) => ({ ...input, createdAt: 'now', updatedAt: 'now' }),
    updateAsset: async () => null,
    deleteAsset: async () => false,
    health: async () => ({ db: 'n/a' as const }),
    latestVerdicts: async () => null,
    activeSessions: async () => null,
    inFlightBuilds: async () => null,
    listComments: async () => [],
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
  if (withSuggestionSeam) {
    backend.createSuggestion = async (s) => {
      suggestionsDb.set(s.id, s);
      return s;
    };
  }
  return backend;
}

// ---------------------------------------------------------------------------
// Two servers: one with the live suggestion seam, one without (the json posture).
// ---------------------------------------------------------------------------

let server: Server;
let base: string;
let jsonServer: Server;
let jsonBase: string;
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
  distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-sug-create-'));
  await fs.writeFile(path.join(distDir, 'index.html'), '<html>studio spa</html>');
  server = startServer(makeStubBackend(true), distDir);
  jsonServer = startServer(makeStubBackend(false), distDir);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  await new Promise<void>((resolve) => jsonServer.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  jsonBase = `http://127.0.0.1:${(jsonServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  await new Promise<void>((resolve, reject) => jsonServer.close((e) => (e ? reject(e) : resolve())));
  await fs.rm(distDir, { recursive: true, force: true });
});

beforeEach(() => {
  suggestionsDb.clear();
});

/** A well-formed create body (the api.ts createSuggestion contract); override per test. */
const goodBody = (): Record<string, unknown> => ({
  blockId: 'b-12345678',
  proposedText: 'the proposed replacement prose',
  topicKind: 'asset',
  topicId: 'asset-1',
  originalText: 'the original prose',
});

const post = (
  body: Record<string, unknown>,
  who?: string,
  at: string = `${base}/api/suggestions`,
): Promise<Response> =>
  fetch(at, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(who ? iap(who) : {}) },
    body: JSON.stringify(body),
  });

// ---------------------------------------------------------------------------

describe('mounted POST /api/suggestions — member-permitted create (ADR-0140 caps 7/8)', () => {
  it('refuses an identity-less POST (401) — nothing persisted', async () => {
    const res = await post(goodBody());
    expect(res.status).toBe(401);
    expect(suggestionsDb.size).toBe(0);
  });

  it('a member creates an OPEN suggestion (201) — author stamped from the verified identity, not the body', async () => {
    // A forged body author must be ignored — the comment-author honesty posture.
    const res = await post({ ...goodBody(), author: 'forged@example.com' }, MEMBER);
    expect(res.status).toBe(201);
    const saved = (await res.json()) as Suggestion;
    expect(saved.author).toBe(MEMBER);
    expect(saved.status).toBe('open');
    expect(saved.block).toBe('b-12345678');
    expect(saved.proposed).toBe('the proposed replacement prose');
    expect(saved.original).toBe('the original prose');
    expect(saved.topicKind).toBe('asset');
    expect(saved.topicId).toBe('asset-1');
    expect(saved.decidedBy).toBeNull();
    expect(saved.decidedAt).toBeNull();
    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toBeTruthy();
    // ...and it is what was PERSISTED, not just echoed.
    expect(suggestionsDb.get(saved.id)).toEqual(saved);
  });

  it('an admin may create too (admin ⊇ member for an additive proposal)', async () => {
    const res = await post(goodBody(), ADMIN);
    expect(res.status).toBe(201);
    expect(((await res.json()) as Suggestion).author).toBe(ADMIN);
  });

  it.each([
    ['blockId missing', { blockId: undefined }],
    ['blockId blank', { blockId: '   ' }],
    ['proposedText missing', { proposedText: undefined }],
    ['proposedText blank', { proposedText: '  ' }],
    ['topicKind missing', { topicKind: undefined }],
    ['topicKind invalid', { topicKind: 'story' }],
    ['topicId missing', { topicId: undefined }],
    ['topicId blank', { topicId: '' }],
    ['originalText ABSENT', { originalText: undefined }],
  ])('refuses %s (400) — nothing persisted', async (_name, over) => {
    const res = await post({ ...goodBody(), ...over }, MEMBER);
    expect(res.status).toBe(400);
    expect(suggestionsDb.size).toBe(0);
  });

  it('an EMPTY-string originalText is allowed (the store schema permits original: "")', async () => {
    const res = await post({ ...goodBody(), originalText: '' }, MEMBER);
    expect(res.status).toBe(201);
    expect(((await res.json()) as Suggestion).original).toBe('');
  });

  it('a GET is 405 — the create endpoint is POST-only', async () => {
    const res = await fetch(`${base}/api/suggestions`, { headers: iap(MEMBER) });
    expect(res.status).toBe(405);
  });

  it('a backend without the suggestion seam refuses 503 (needs the live store), like the decision route', async () => {
    const res = await post(goodBody(), MEMBER, `${jsonBase}/api/suggestions`);
    expect(res.status).toBe(503);
    expect(suggestionsDb.size).toBe(0);
  });
});
