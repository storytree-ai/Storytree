// Integration test for the MOUNTED suggestion-decision endpoint (ADR-0140): POST
// /api/suggestions/decision driven end-to-end through createStudioServer + guestPolicy + identity
// over a REAL node:http server with a STUB backend — no DB, no Vite, no IAP (the
// writeBrokerApi.integration.test.ts pattern). Where suggestionDecisionApi.test.ts exercises cap 3's
// HANDLER in isolation, this proves the endpoint is REACHABLE and gated by cap 4's
// member-suggest write policy once wired into the route table:
//
//   - identity-less POST → 401 (IAP authenticates; fail-closed) — nothing transitioned
//   - a member POST      → 403 (deciding is admin-only, the cap 4 gate) — nothing transitioned
//   - an admin REJECT    → 200, the record transitioned to rejected via the store seam
//   - an admin ACCEPT of a DOC suggestion → 501 and the record stays OPEN (the remaining honesty
//                          wall: docs are files on disk, not writable through this backend — a
//                          suggestion is NEVER marked accepted without its content applied, and
//                          the refusal fires BEFORE the save)
//   - an admin ACCEPT whose target asset is missing → 404, the record stays OPEN
//   - an unknown id      → 404; a re-decide of a closed record → 409 (the store race wall)
//   - a backend without the suggestion seam (json) → 503, mirroring the write-broker's refusal
//
// The HAPPY accept path (block located, original verified, body spliced + persisted) is proven in
// suggestionAcceptApplyApi.integration.test.ts; the create path (/api/suggestions) in
// suggestionCreateApi.integration.test.ts (ADR-0140 caps 7/8).

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
// Stub backend — an in-memory suggestion row with the REAL store's transition
// semantics (closed rows refuse a re-decide), so each wall is asserted on what
// was (or wasn't) persisted, not just a status code.
// ---------------------------------------------------------------------------

const openSuggestion = (): Suggestion => ({
  id: 'sug-1',
  topicKind: 'asset',
  topicId: 'asset-1',
  block: 'block-1',
  proposed: 'the proposed replacement prose',
  original: 'the original prose',
  status: 'open',
  author: MEMBER,
  createdAt: '2026-07-03T00:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
});

const suggestionsDb = new Map<string, Suggestion>();

/** The LibraryBackend surface the route table needs; suggestion seam included. */
function makeStubBackend(withSuggestionSeam: boolean): LibraryBackend {
  const backend: LibraryBackend = {
    listAssets: async () => [],
    createAsset: async (input) => ({ ...input, createdAt: 'now', updatedAt: 'now' }),
    updateAsset: async () => null,
    deleteAsset: async () => false,
    health: async () => ({ db: 'n/a' as const }),
    latestVerdicts: async () => null,
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
    backend.getSuggestion = async (id) => suggestionsDb.get(id) ?? null;
    // Mirrors PgSuggestionStore.transition: null on missing id, throws the closed-suggestion
    // error on a re-decide, otherwise stamps the decision and persists atomically.
    backend.transitionSuggestion = async (id, action, decidedBy, decidedAt) => {
      const current = suggestionsDb.get(id);
      if (!current) return null;
      if (current.status !== 'open') {
        throw new Error(
          `Cannot decide a closed suggestion (already ${current.status}); re-deciding is not allowed`,
        );
      }
      const updated: Suggestion = {
        ...current,
        status: action === 'accept' ? 'accepted' : 'rejected',
        decidedBy,
        decidedAt,
      };
      suggestionsDb.set(id, updated);
      return updated;
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
  distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-sug-'));
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
  suggestionsDb.set('sug-1', openSuggestion());
});

const post = (
  body: Record<string, unknown>,
  who?: string,
  at: string = `${base}/api/suggestions/decision`,
): Promise<Response> =>
  fetch(at, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(who ? iap(who) : {}) },
    body: JSON.stringify(body),
  });

// ---------------------------------------------------------------------------

describe('mounted /api/suggestions/decision — admin-gated (ADR-0140)', () => {
  it('refuses an identity-less POST (401) — nothing transitioned', async () => {
    const res = await post({ suggestionId: 'sug-1', action: 'reject' });
    expect(res.status).toBe(401);
    expect(suggestionsDb.get('sug-1')?.status).toBe('open');
  });

  it('refuses a member (403) — deciding is admin-only (the cap 4 gate); nothing transitioned', async () => {
    const res = await post({ suggestionId: 'sug-1', action: 'reject' }, MEMBER);
    expect(res.status).toBe(403);
    expect(suggestionsDb.get('sug-1')?.status).toBe('open');
  });

  it('an admin REJECT transitions the record (200) — decided by the caller, doc untouched', async () => {
    const res = await post({ suggestionId: 'sug-1', action: 'reject' }, ADMIN);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Suggestion;
    expect(body.status).toBe('rejected');
    const stored = suggestionsDb.get('sug-1');
    expect(stored?.status).toBe('rejected');
    expect(stored?.decidedBy).toBe(ADMIN);
  });

  it('an admin ACCEPT of a DOC suggestion refuses 501 and the record stays OPEN — docs are files on disk', async () => {
    // The remaining honesty wall (asset accept-apply is wired — see
    // suggestionAcceptApplyApi.integration.test.ts): a doc topic is a file on disk, not writable
    // through this backend. The 501 fires BEFORE any transition persists, so a suggestion can
    // never read `accepted` while the doc was never changed.
    suggestionsDb.set('sug-doc', {
      ...openSuggestion(),
      id: 'sug-doc',
      topicKind: 'doc',
      topicId: 'decisions/0140-review-mode.md',
    });
    const res = await post({ suggestionId: 'sug-doc', action: 'accept' }, ADMIN);
    expect(res.status).toBe(501);
    expect(suggestionsDb.get('sug-doc')?.status).toBe('open');
  });

  it('an admin ACCEPT whose target asset is missing is 404 and the record stays OPEN', async () => {
    // The stub backend serves NO assets, so sug-1 (an asset suggestion) has nothing to apply to.
    // The refusal fires BEFORE the transition persists — never accepted-without-applied.
    const res = await post({ suggestionId: 'sug-1', action: 'accept' }, ADMIN);
    expect(res.status).toBe(404);
    expect(suggestionsDb.get('sug-1')?.status).toBe('open');
  });

  it('an unknown suggestion id is 404', async () => {
    const res = await post({ suggestionId: 'sug-missing', action: 'reject' }, ADMIN);
    expect(res.status).toBe(404);
  });

  it('re-deciding a closed suggestion is 409 (the store race wall)', async () => {
    const first = await post({ suggestionId: 'sug-1', action: 'reject' }, ADMIN);
    expect(first.status).toBe(200);
    const second = await post({ suggestionId: 'sug-1', action: 'reject' }, ADMIN);
    expect(second.status).toBe(409);
    expect(suggestionsDb.get('sug-1')?.status).toBe('rejected');
  });

  it('a GET is 405 — the decision endpoint is POST-only', async () => {
    const res = await fetch(`${base}/api/suggestions/decision`, { headers: iap(ADMIN) });
    expect(res.status).toBe(405);
  });

  it('a backend without the suggestion seam refuses 503 (needs the live store), like the write-broker', async () => {
    const res = await post(
      { suggestionId: 'sug-1', action: 'reject' },
      ADMIN,
      `${jsonBase}/api/suggestions/decision`,
    );
    expect(res.status).toBe(503);
    expect(suggestionsDb.get('sug-1')?.status).toBe('open');
  });
});
