// THE REMOTE-SHAPED PROOF for the ADR-0259 store door (`session-decoupling-arc` entry
// `httpstore-lands-before-offline-drops`).
//
// WHAT MAKES THIS THE PROOF, AND WHY THE PARITY SUITE IS NOT. `storeParitySuite` has passed over
// `HttpStore` since ADR-0259 increment 1 (PR #983) — while the door was wired to no caller and no
// server. A green parity run therefore proves the CONTRACT and says nothing about REACHABILITY. This
// test drives the real `HttpStore` client from `@storytree/storage-protocol` against the real
// `createStudioServer` route table over a REAL socket, so what is under test is the mount:
//
//   - the client is REMOTE-SHAPED: `HttpStore` speaks `fetch` and JSON only. It has no `pg` import,
//     no Cloud SQL connector, and no way to open one — which is exactly the position of a session on
//     Claude Code for the web, where client-mTLS cannot survive the agent proxy's TLS re-termination
//     (ADR-0250 / ADR-0258 D2). If this reads the library, that shape of client can.
//   - the server is the REAL dispatch, gate included, not a bare handler.
//
// The walls asserted, in the order they matter:
//   - an identity-less read → 401, and a non-member read → 403 (the studio's own wall covers the
//     door; it invents no authorization of its own — ADR-0042 d.2)
//   - a member read → the live corpus: getDoc / queryDocs / readEvents
//   - an ABSENT doc → 200 `{ doc: null }`, decoded to `null` — never 404, so a client can read 404 as
//     "the door is not mounted at this baseUrl" (store-wire.ts's load-bearing status choice)
//   - every write route → 403 BY NAME, even for an admin: ADR-0259 D5 keeps proof-bearing writes
//     gated behind an ADR-0081 amendment and an ADR-0252 review, and this ADR does not lift it
//   - no live store (the offline json backend) → 503, never an empty 200 that reads as "the corpus
//     is empty"

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HttpStore, HttpStoreError, InMemoryStore, type Store } from '@storytree/storage-protocol';
import type { UserDoc } from '@storytree/studio-members';
import { createStudioServer } from './serve';
import { parseSeedAdmins } from './guestPolicy';
import { IAP_EMAIL_HEADER } from './identity';
import type { LibraryBackend } from './libraryBackend';
import { STORE_DOOR_BASE_PATH } from './storeDoorApi';

const ADMIN = 'admin@example.com';
const MEMBER = 'member@example.com';
const STRANGER = 'stranger@example.com'; // authenticated by IAP, but no membership row

const iap = (email: string): Record<string, string> => ({
  [IAP_EMAIL_HEADER]: `accounts.google.com:${email}`,
});

const userRow = (email: string, role: UserDoc['role']): UserDoc => ({
  email,
  role,
  status: 'active',
  invitedBy: ADMIN,
  createdAt: '2026-08-04T00:00:00.000Z',
  lastSeenAt: '2026-08-04T00:00:00.000Z',
});

const usersDb: UserDoc[] = [userRow(ADMIN, 'admin'), userRow(MEMBER, 'member')];

/** The document store behind the door — a real `Store`, seeded like the live library tier. */
const docs = new InMemoryStore();

/** Flipped by the "no live store" case to model the offline json backend, which has no docStore. */
let liveStore: Store | null = docs;

const stubBackend: LibraryBackend = {
  listAssets: async () => [],
  createAsset: async (input) => ({ ...input, createdAt: 'now', updatedAt: 'now' }),
  updateAsset: async () => null,
  deleteAsset: async () => false,
  health: async () => ({ db: 'n/a' as const }),
  latestVerdicts: async () => null,
  inFlightBuilds: async () => null,
  docStore: async () => liveStore,
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

let server: Server;
let base: string;
let distDir: string;

/**
 * A remote-shaped client: `HttpStore` over the door, carrying only headers. This is the whole client
 * surface a session without a Cloud SQL connector has, so every assertion below runs through it
 * rather than through a raw `fetch` on the route.
 */
const doorAs = (who?: string): HttpStore =>
  new HttpStore({
    baseUrl: `${base}${STORE_DOOR_BASE_PATH}`,
    ...(who ? { headers: iap(who) } : {}),
  });

beforeAll(async () => {
  await docs.upsertDoc({
    id: 'merge-ceremony',
    kind: 'process',
    doc: { title: 'The merge ceremony', body: 'green unit → non-draft PR → CI merges' },
    actor: 'seed',
  });
  await docs.upsertDoc({
    id: 'slow-growth-minimum-to-green',
    kind: 'principle',
    doc: { title: 'Slow growth', body: 'the minimum to green' },
    actor: 'seed',
  });

  distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-door-'));
  await fs.writeFile(path.join(distDir, 'index.html'), '<html>studio spa</html>');
  server = createStudioServer({
    distDir,
    paths: {
      repoRoot: distDir,
      docsDir: path.join(distDir, 'docs'),
      storiesDir: path.join(distDir, 'stories'),
      dataDir: distDir,
      commentsFile: path.join(distDir, 'comments.json'),
      assetsFile: path.join(distDir, 'assets.json'),
      knowledgeFile: path.join(distDir, 'knowledge.json'),
      usersFile: path.join(distDir, 'users.json'),
      attestationsFile: path.join(distDir, 'attestations.json'),
    },
    backend: stubBackend,
    admins: parseSeedAdmins(''),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  await fs.rm(distDir, { recursive: true, force: true });
});

/** The status an `HttpStore` call refused with — the client's own error carries it. */
async function statusOf(call: () => Promise<unknown>): Promise<number> {
  try {
    await call();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpStoreError);
    return (err as HttpStoreError).status;
  }
  throw new Error('expected the door to refuse, but the call succeeded');
}

describe('the store door is gated by the studio wall it is mounted behind', () => {
  it('refuses an identity-less client 401 — IAP authenticates, the app fail-closes', async () => {
    expect(await statusOf(() => doorAs().queryDocs())).toBe(401);
  });

  it('refuses an authenticated non-member 403', async () => {
    expect(await statusOf(() => doorAs(STRANGER).queryDocs())).toBe(403);
  });
});

describe('a remote-shaped client reads the library through the door', () => {
  it('reads one document by id', async () => {
    const doc = await doorAs(MEMBER).getDoc('merge-ceremony');
    expect(doc?.id).toBe('merge-ceremony');
    expect(doc?.kind).toBe('process');
    expect((doc?.doc as { title: string }).title).toBe('The merge ceremony');
  });

  it('queries the corpus, and filters by kind', async () => {
    const all = await doorAs(MEMBER).queryDocs();
    expect(all.map((d) => d.id).sort()).toEqual(['merge-ceremony', 'slow-growth-minimum-to-green']);

    const principles = await doorAs(MEMBER).queryDocs({ kind: 'principle' });
    expect(principles.map((d) => d.id)).toEqual(['slow-growth-minimum-to-green']);
  });

  it('reads the event stream', async () => {
    const events = await doorAs(MEMBER).readEvents({ id: 'merge-ceremony' });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.id === 'merge-ceremony')).toBe(true);
  });

  it('answers an ABSENT document with null, not 404 — 404 stays "the door is not mounted here"', async () => {
    expect(await doorAs(MEMBER).getDoc('no-such-artifact')).toBeNull();

    // The same client against a WRONG mount point gets the 404 that absence never spends.
    const wrong = new HttpStore({ baseUrl: `${base}/api/not-the-door`, headers: iap(MEMBER) });
    expect(await statusOf(() => wrong.getDoc('merge-ceremony'))).toBe(404);
  });
});

describe('the door is read-only (ADR-0259 D5 is not lifted here)', () => {
  const writes: [string, (s: Store) => Promise<unknown>][] = [
    ['upsertDoc', (s) => s.upsertDoc({ id: 'x', kind: 'principle', doc: { title: 'x' } })],
    ['deleteDoc', (s) => s.deleteDoc('merge-ceremony')],
    ['appendEvent', (s) => s.appendEvent({ id: 'x', kind: 'principle', type: 'updated', doc: {} })],
  ];

  for (const [name, call] of writes) {
    it(`refuses ${name} 403 even for an ADMIN — the gate is the decision, not the role`, async () => {
      expect(await statusOf(() => call(doorAs(ADMIN)))).toBe(403);
    });
  }

  it('persists nothing through a refused write', async () => {
    await statusOf(() => doorAs(ADMIN).upsertDoc({ id: 'sneaked-in', kind: 'principle', doc: {} }));
    expect(await docs.getDoc('sneaked-in')).toBeNull();
    // And the doc a delete was attempted on is still there.
    expect(await docs.getDoc('merge-ceremony')).not.toBeNull();
  });
});

describe('the door needs a live store', () => {
  it('answers 503 when the backend has none — never an empty 200 reading as "corpus is empty"', async () => {
    liveStore = null;
    try {
      expect(await statusOf(() => doorAs(MEMBER).queryDocs())).toBe(503);
    } finally {
      liveStore = docs;
    }
  });
});
