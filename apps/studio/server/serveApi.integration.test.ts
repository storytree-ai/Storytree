// Integration tests for the hosted studio server (serve.ts + guestPolicy + identity) over a
// REAL node:http server with a STUB backend and a temp dist/ — no DB, no Vite, no IAP (the
// claimsApi.integration.test.ts pattern). The contracts under test are studio-members
// `app-authorization` (ADR-0043, superseding ADR-0042's allowlist): IAP authenticates and the APP
// authorizes from its own users projection —
//   - identity is fail-closed (no email → 401, every route);
//   - a non-member is served NOTHING but GET /api/me (403 + requestAccess on the whole corpus);
//   - a member reads + comments as self; an admin additionally writes assets + reaches user mgmt;
//   - an invited row activates on first request;
//   - the bootstrap-admin seed (STORYTREE_STUDIO_ADMINS) is an effective active admin;
//   - a store outage during membership resolution degrades to health/me-only (503 elsewhere);
//   - db control stays structurally off.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { UserDoc } from '@storytree/studio-members';
import type { Attestation } from '@storytree/proof-protocol';
import { mergeUser, wouldOrphanAdminsOnRemove, wouldOrphanAdminsOnRole } from '@storytree/studio-members';
import { createStudioServer } from './serve';
import { parseSeedAdmins } from './guestPolicy';
import { emailFromIapHeader, IAP_EMAIL_HEADER } from './identity';
import type { LibraryBackend } from './libraryBackend';
import type { Comment } from '../src/types';

const ADMIN = 'owner@example.com'; // bootstrap seed admin (no row needed)
const MEMBER = 'member@example.com'; // an active member row
const INVITED = 'invited@example.com'; // an invited row — activates on first request
const STRANGER = 'stranger@example.com'; // no row, not seeded → non-member

const iap = (email: string): Record<string, string> => ({
  [IAP_EMAIL_HEADER]: `accounts.google.com:${email}`,
});

const userRow = (over: Partial<UserDoc> & { email: string }): UserDoc => ({
  role: 'member',
  status: 'active',
  invitedBy: ADMIN,
  createdAt: '2026-06-14T00:00:00.000Z',
  lastSeenAt: '2026-06-14T00:00:00.000Z',
  ...over,
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
const seen: {
  createdComment?: Comment;
  updatedCommentId?: string;
  assetCreated?: boolean;
  upserts: UserDoc[];
  recordedAttestation?: Attestation;
  wakeCount: number;
} = {
  upserts: [],
  wakeCount: 0,
};

/** A stub hosted DB waker — records the call instead of hitting the metadata server / Cloud SQL. */
const stubWaker = { wake: async (): Promise<void> => { seen.wakeCount += 1; } };

/** A mutable in-memory users projection so activation actually mutates (the realistic shape). */
const usersDb: UserDoc[] = [
  userRow({ email: MEMBER, role: 'member', status: 'active' }),
  userRow({ email: INVITED, role: 'member', status: 'invited' }),
];

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
  inFlightBuilds: async () => null,
  listComments: async () => [comment('mine', MEMBER), comment('theirs', 'someone-else@example.com')],
  createComment: async (c) => {
    seen.createdComment = c;
    return c;
  },
  updateComment: async (id) => {
    seen.updatedCommentId = id;
    return comment(id, MEMBER);
  },
  deleteComment: async () => true,
  listUsers: async () => usersDb.map((u) => ({ ...u })),
  getUser: async (email) => usersDb.find((u) => u.email === email.toLowerCase()) ?? null,
  // Guard-aware, like the real backends — so the API-level last-admin contract is meaningful.
  upsertUser: async (doc) => {
    seen.upserts.push(doc);
    const idx = usersDb.findIndex((u) => u.email === doc.email);
    if (idx !== -1) {
      const existing = usersDb[idx] as UserDoc;
      const merged = mergeUser(existing, {
        role: doc.role,
        status: doc.status,
        invitedBy: doc.invitedBy,
        lastSeenAt: doc.lastSeenAt,
      });
      if (wouldOrphanAdminsOnRole(usersDb, doc.email, merged.role)) {
        throw Object.assign(new Error('last admin'), { name: 'LastAdminError' });
      }
      usersDb[idx] = merged;
      return merged;
    }
    usersDb.push(doc);
    return doc;
  },
  removeUser: async (email) => {
    const target = email.toLowerCase();
    const idx = usersDb.findIndex((u) => u.email === target);
    if (idx === -1) return false;
    if (wouldOrphanAdminsOnRemove(usersDb, target)) {
      throw Object.assign(new Error('last admin'), { name: 'LastAdminError' });
    }
    usersDb.splice(idx, 1);
    return true;
  },
  listAttestations: async () => ({}),
  recordAttestation: async (att) => {
    seen.recordedAttestation = att;
    return att;
  },
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
      usersFile: path.join(distDir, 'users.json'),
      attestationsFile: path.join(distDir, 'attestations.json'),
    },
    backend: stubBackend,
    admins: parseSeedAdmins(` ${ADMIN.toUpperCase()}, `), // exercises trim + case-folding of the seed
    dbWake: stubWaker,
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
  it('serves index.html at / and real assets by path (no identity needed)', async () => {
    const root = await fetch(`${base}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('studio spa');
    const asset = await fetch(`${base}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('text/javascript');
  });

  it('falls back to index.html for unknown paths (hash routing)', async () => {
    const res = await fetch(`${base}/some/deep/link`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('studio spa');
  });

  it('refuses encoded-slash traversal with a hard 404', async () => {
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

describe('identity is fail-closed (ADR-0043 — IAP authenticates)', () => {
  it('refuses identity-less /api/* with 401 — every route, health and me included', async () => {
    for (const p of ['/api/assets', '/api/health', '/api/tree', '/api/me', '/api/db/status']) {
      const res = await fetch(`${base}${p}`);
      expect(res.status, p).toBe(401);
    }
  });
});

describe('membership gates the corpus (non-member served nothing)', () => {
  it('a stranger gets 403 + requestAccess on the whole corpus; only /api/me answers', async () => {
    for (const p of ['/api/tree', '/api/assets', '/api/comments', '/api/docs', '/api/docs/content?id=x']) {
      const res = await fetch(`${base}${p}`, { headers: iap(STRANGER) });
      expect(res.status, p).toBe(403);
      const body = (await res.json()) as { requestAccess?: boolean };
      expect(body.requestAccess, p).toBe(true);
    }
    const me = await fetch(`${base}/api/me`, { headers: iap(STRANGER) });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email: STRANGER, member: false, role: null });
  });
});

describe('roles: member vs admin reach', () => {
  it('a member reads, comments as self, but cannot write assets or reach user mgmt', async () => {
    expect((await fetch(`${base}/api/assets`, { headers: iap(MEMBER) })).status).toBe(200);
    expect((await fetch(`${base}/api/me`, { headers: iap(MEMBER) })).status).toBe(200);
    expect(await (await fetch(`${base}/api/me`, { headers: iap(MEMBER) })).json()).toMatchObject({
      email: MEMBER,
      role: 'member',
      member: true,
    });

    const write = await fetch(`${base}/api/assets`, {
      method: 'POST',
      headers: iap(MEMBER),
      body: JSON.stringify({ id: 'x', category: 'pattern', title: 't', description: 'd', body: 'b', references: [] }),
    });
    expect(write.status).toBe(403);
    expect(seen.assetCreated).toBeUndefined();

    // user management is admin-only — a member is refused before any handler (404) runs
    expect((await fetch(`${base}/api/users`, { headers: iap(MEMBER) })).status).toBe(403);
  });

  it('the bootstrap-seed admin writes assets (becomes an effective active admin)', async () => {
    const res = await fetch(`${base}/api/assets`, {
      method: 'POST',
      headers: iap(ADMIN),
      body: JSON.stringify({ id: 'y', category: 'pattern', title: 't', description: 'd', body: 'b', references: [] }),
    });
    expect(res.status).toBe(201);
    expect(seen.assetCreated).toBe(true);
    // resolution persisted the seed admin as an active admin row
    expect(seen.upserts.some((u) => u.email === ADMIN && u.role === 'admin' && u.status === 'active')).toBe(true);
    expect(await (await fetch(`${base}/api/me`, { headers: iap(ADMIN) })).json()).toMatchObject({
      email: ADMIN,
      role: 'admin',
      member: true,
    });
  });

  // ADR-0168 inc 4: `friction` is the 10th structured Library kind, so the server-side write
  // allowlist (readAssetInput → ASSET_CATEGORIES.includes) must accept it. Before the allowlist
  // wiring this POST was rejected 400 'invalid category'; a structured friction unit carries its
  // per-kind fields (statement/evidence/impact are required) and is now accepted (201).
  it('an admin writes a friction artifact (the 10th kind is on the write allowlist)', async () => {
    const res = await fetch(`${base}/api/assets`, {
      method: 'POST',
      headers: iap(ADMIN),
      body: JSON.stringify({
        id: 'friction-example',
        category: 'friction',
        title: 'Something fought a session',
        description: 'what fought a session, with evidence',
        body: '',
        fields: {
          statement: 'The DB cold-start exceeded the preflight poll.',
          evidence: 'db:up reported "unreachable within 420s" at status RUNNABLE.',
          impact: 'The build stalled for ~21 min waiting on a warm connection.',
        },
        references: [],
      }),
    });
    expect(res.status).toBe(201);
    expect(seen.assetCreated).toBe(true);
  });
});

describe('activation (invited → active on first request)', () => {
  it('an invited member is reported active and persisted active on first sign-in', async () => {
    const me = await fetch(`${base}/api/me`, { headers: iap(INVITED) });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email: INVITED, role: 'member', status: 'active', member: true });
    expect(seen.upserts.some((u) => u.email === INVITED && u.status === 'active')).toBe(true);
  });
});

describe('comment scope (preserved from ADR-0042 d.3)', () => {
  it('comment authorship is stamped from the verified identity — the client field is ignored', async () => {
    const res = await fetch(`${base}/api/comments`, {
      method: 'POST',
      headers: iap(MEMBER),
      body: JSON.stringify({ topicKind: 'asset', topicId: 'some-asset', body: 'hi', author: 'forged' }),
    });
    expect(res.status).toBe(201);
    expect(seen.createdComment?.author).toBe(MEMBER);
  });

  it('a block-anchored comment round-trips: readAnchor keeps kind block + blockId (ADR-0140)', async () => {
    const res = await fetch(`${base}/api/comments`, {
      method: 'POST',
      headers: iap(MEMBER),
      body: JSON.stringify({
        topicKind: 'asset',
        topicId: 'some-asset',
        body: 'inline thread comment',
        anchor: { kind: 'block', blockId: 'b-1a2b3c4d' },
      }),
    });
    expect(res.status).toBe(201);
    // The router must not downgrade the block anchor to 'topic' or drop its handle —
    // the store boundary (normalizeCommentAnchor) is the canonical wall downstream.
    expect(seen.createdComment?.anchor.kind).toBe('block');
    expect(seen.createdComment?.anchor.blockId).toBe('b-1a2b3c4d');
  });

  it("a member edits their own comment but not another author's; an admin may touch any", async () => {
    const own = await fetch(`${base}/api/comments?id=mine`, {
      method: 'PATCH',
      headers: iap(MEMBER),
      body: JSON.stringify({ resolved: true }),
    });
    expect(own.status).toBe(200);
    expect(seen.updatedCommentId).toBe('mine');

    const theirs = await fetch(`${base}/api/comments?id=theirs`, {
      method: 'PATCH',
      headers: iap(MEMBER),
      body: JSON.stringify({ resolved: true }),
    });
    expect(theirs.status).toBe(403);

    const adminAny = await fetch(`${base}/api/comments?id=theirs`, {
      method: 'PATCH',
      headers: iap(ADMIN),
      body: JSON.stringify({ resolved: true }),
    });
    expect(adminAny.status).toBe(200);
  });
});

describe('db control is off (structurally, not by role)', () => {
  it('db control is 403 for member AND admin', async () => {
    for (const who of [MEMBER, ADMIN]) {
      const res = await fetch(`${base}/api/db/status`, { headers: iap(who) });
      expect(res.status, who).toBe(403);
    }
  });
});

describe('hosted DB wake (ADR-0049) — admin-only, even though /api/db/* is off', () => {
  it('an admin wakes the DB (202, the waker fires); a member is refused before any wake', async () => {
    seen.wakeCount = 0;
    const member = await fetch(`${base}/api/db/wake`, { method: 'POST', headers: iap(MEMBER) });
    expect(member.status).toBe(403); // admin-only by the gate's method rule (POST, not a comment)
    expect(seen.wakeCount).toBe(0);

    const admin = await fetch(`${base}/api/db/wake`, { method: 'POST', headers: iap(ADMIN) });
    expect(admin.status).toBe(202);
    expect(await admin.json()).toEqual({ ok: true });
    expect(seen.wakeCount).toBe(1);
  });

  it('refuses non-POST (405) and identity-less wake (401)', async () => {
    expect((await fetch(`${base}/api/db/wake`, { headers: iap(ADMIN) })).status).toBe(405); // GET
    expect((await fetch(`${base}/api/db/wake`, { method: 'POST' })).status).toBe(401); // no identity
  });

  it('reports canWakeDb on /api/me — true for the admin, false for the member', async () => {
    expect(await (await fetch(`${base}/api/me`, { headers: iap(ADMIN) })).json()).toMatchObject({ canWakeDb: true });
    expect(await (await fetch(`${base}/api/me`, { headers: iap(MEMBER) })).json()).toMatchObject({ canWakeDb: false });
  });
});

describe('invite-ui: admin-only user management (ADR-0043)', () => {
  const NEWBIE = 'newbie@example.com';

  it('refuses every /api/users verb for a member (403, no mutation)', async () => {
    const get = await fetch(`${base}/api/users`, { headers: iap(MEMBER) });
    expect(get.status).toBe(403);
    const post = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: iap(MEMBER),
      body: JSON.stringify({ email: 'x@y.com', role: 'member' }),
    });
    expect(post.status).toBe(403);
    const patch = await fetch(`${base}/api/users`, {
      method: 'PATCH',
      headers: iap(MEMBER),
      body: JSON.stringify({ email: MEMBER, role: 'admin' }),
    });
    expect(patch.status).toBe(403);
    const del = await fetch(`${base}/api/users?email=${ADMIN}`, { method: 'DELETE', headers: iap(MEMBER) });
    expect(del.status).toBe(403);
  });

  it('an admin lists, invites, re-roles and removes; invite then activates on first request', async () => {
    // list
    const list = await fetch(`${base}/api/users`, { headers: iap(ADMIN) });
    expect(list.status).toBe(200);
    const rows = (await list.json()) as UserDoc[];
    expect(rows.map((u) => u.email)).toContain(MEMBER);

    // invite → an invited row, invitedBy stamped from the caller
    const invite = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: iap(ADMIN),
      body: JSON.stringify({ email: NEWBIE, role: 'member' }),
    });
    expect(invite.status).toBe(201);
    // No mailer injected → the invite still writes its row, and reports the email as skipped.
    expect(await invite.json()).toMatchObject({
      email: NEWBIE,
      role: 'member',
      status: 'invited',
      invitedBy: ADMIN,
      notify: { status: 'skipped' },
    });

    // duplicate invite → 409
    const dup = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: iap(ADMIN),
      body: JSON.stringify({ email: NEWBIE, role: 'member' }),
    });
    expect(dup.status).toBe(409);

    // first request from the invitee activates the row
    const me = await fetch(`${base}/api/me`, { headers: iap(NEWBIE) });
    expect(await me.json()).toMatchObject({ email: NEWBIE, status: 'active', member: true });

    // re-role up then back
    const up = await fetch(`${base}/api/users`, {
      method: 'PATCH',
      headers: iap(ADMIN),
      body: JSON.stringify({ email: NEWBIE, role: 'admin' }),
    });
    expect(up.status).toBe(200);
    expect(await up.json()).toMatchObject({ email: NEWBIE, role: 'admin' });
    const down = await fetch(`${base}/api/users`, {
      method: 'PATCH',
      headers: iap(ADMIN),
      body: JSON.stringify({ email: NEWBIE, role: 'member' }),
    });
    expect(down.status).toBe(200);

    // remove → gone; a request from that account then hits the wall
    const removed = await fetch(`${base}/api/users?email=${NEWBIE}`, { method: 'DELETE', headers: iap(ADMIN) });
    expect(removed.status).toBe(200);
    const after = await fetch(`${base}/api/me`, { headers: iap(NEWBIE) });
    expect(await after.json()).toMatchObject({ member: false });
  });

  it('the last admin cannot be removed or down-roled (409)', async () => {
    // ADMIN is now the sole admin in the directory
    const remove = await fetch(`${base}/api/users?email=${ADMIN}`, { method: 'DELETE', headers: iap(ADMIN) });
    expect(remove.status).toBe(409);
    const downRole = await fetch(`${base}/api/users`, {
      method: 'PATCH',
      headers: iap(ADMIN),
      body: JSON.stringify({ email: ADMIN, role: 'member' }),
    });
    expect(downRole.status).toBe(409);
  });
});

describe('attestations: member reads, admin records (ADR-0044)', () => {
  it('GET is member-readable and returns the {storyId, tests} shape', async () => {
    const res = await fetch(`${base}/api/attestations?storyId=demo-story`, { headers: iap(MEMBER) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { storyId: string; tests: unknown[] };
    expect(body.storyId).toBe('demo-story');
    expect(Array.isArray(body.tests)).toBe(true); // empty corpus → []
  });

  it('a non-member is walled from GET (403 + requestAccess)', async () => {
    const res = await fetch(`${base}/api/attestations?storyId=demo-story`, { headers: iap(STRANGER) });
    expect(res.status).toBe(403);
    expect((await res.json()) as { requestAccess?: boolean }).toMatchObject({ requestAccess: true });
  });

  it('GET without storyId is a 400', async () => {
    const res = await fetch(`${base}/api/attestations`, { headers: iap(MEMBER) });
    expect(res.status).toBe(400);
  });

  it('POST (record) is admin-only — a member is refused before any write', async () => {
    delete seen.recordedAttestation;
    const res = await fetch(`${base}/api/attestations`, {
      method: 'POST',
      headers: iap(MEMBER),
      body: JSON.stringify({ testId: 'demo-story#uat-1', outcome: 'pass' }),
    });
    expect(res.status).toBe(403);
    expect(seen.recordedAttestation).toBeUndefined();
  });

  it('an admin records a human attestation; the signer is stamped from the verified caller', async () => {
    const res = await fetch(`${base}/api/attestations`, {
      method: 'POST',
      headers: iap(ADMIN),
      body: JSON.stringify({ testId: 'demo-story#uat-2', outcome: 'pass', note: 'looked right', signer: 'forged@evil.com' }),
    });
    expect(res.status).toBe(201);
    expect(seen.recordedAttestation).toMatchObject({
      testId: 'demo-story#uat-2',
      outcome: 'pass',
      witness: 'human',
      signer: ADMIN, // stamped from IAP identity, NOT the forged body field
      note: 'looked right',
    });
    // a direct in-UI signature carries no agent relay (ADR-0044 d.4 — the higher-rigor path)
    expect(seen.recordedAttestation?.relayedBy).toBeUndefined();
  });
});

describe('store outage degrades to health/me only', () => {
  it('a backend that cannot list users keeps /api/health + /api/me alive and 503s the corpus', async () => {
    const downBackend: LibraryBackend = {
      ...stubBackend,
      listUsers: async () => {
        throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      },
    };
    const down = createStudioServer({
      distDir,
      paths: {
        repoRoot: distDir,
        docsDir: path.join(distDir, 'docs'),
        storiesDir: path.join(distDir, 'stories'),
        dataDir: distDir,
        commentsFile: path.join(distDir, 'comments.json'),
        assetsFile: path.join(distDir, 'assets.json'),
        usersFile: path.join(distDir, 'users.json'),
        attestationsFile: path.join(distDir, 'attestations.json'),
      },
      backend: downBackend,
      admins: parseSeedAdmins(ADMIN),
      dbWake: stubWaker,
    });
    await new Promise<void>((resolve) => down.listen(0, '127.0.0.1', resolve));
    const dbase = `http://127.0.0.1:${(down.address() as AddressInfo).port}`;
    try {
      expect((await fetch(`${dbase}/api/health`, { headers: iap(MEMBER) })).status).toBe(200);
      const me = await fetch(`${dbase}/api/me`, { headers: iap(MEMBER) });
      expect(me.status).toBe(200);
      expect(await me.json()).toMatchObject({ storeUnreachable: true });
      expect((await fetch(`${dbase}/api/tree`, { headers: iap(MEMBER) })).status).toBe(503);

      // The chicken-and-egg: with the store down, membership can't be resolved — yet a SEED admin
      // can still wake it (authorized off the env seed, not the projection), so the studio recovers
      // instead of staying walled (ADR-0049). A non-seed member cannot trigger a billable start.
      seen.wakeCount = 0;
      const memberWake = await fetch(`${dbase}/api/db/wake`, { method: 'POST', headers: iap(MEMBER) });
      expect(memberWake.status).toBe(403);
      expect(seen.wakeCount).toBe(0);

      const adminWake = await fetch(`${dbase}/api/db/wake`, { method: 'POST', headers: iap(ADMIN) });
      expect(adminWake.status).toBe(202);
      expect(seen.wakeCount).toBe(1);

      // canWakeDb rides /api/me even while degraded: true for the seed admin, false for the member.
      expect(await (await fetch(`${dbase}/api/me`, { headers: iap(ADMIN) })).json()).toMatchObject({
        storeUnreachable: true,
        canWakeDb: true,
      });
      expect(await (await fetch(`${dbase}/api/me`, { headers: iap(MEMBER) })).json()).toMatchObject({
        storeUnreachable: true,
        canWakeDb: false,
      });
    } finally {
      await new Promise<void>((resolve, reject) => down.close((e) => (e ? reject(e) : resolve())));
    }
  });

  it('a backend whose user-listing HANGS degrades (not wedges /api/me) via the resolution deadline', async () => {
    // The idle-stopped-DB trap behind the eternal "Resolving access…": the Cloud SQL connector
    // handshake HANGS rather than refusing, so listUsers never settles. Without the membership
    // deadline (serve.ts), /api/me would never answer and the SPA would spin forever. With it, a
    // seed admin still gets storeUnreachable + canWakeDb — fast — so the wake banner appears.
    const hangBackend: LibraryBackend = {
      ...stubBackend,
      listUsers: () => new Promise<never>(() => {}), // never resolves — the handshake hang
    };
    const hung = createStudioServer({
      distDir,
      paths: {
        repoRoot: distDir,
        docsDir: path.join(distDir, 'docs'),
        storiesDir: path.join(distDir, 'stories'),
        dataDir: distDir,
        commentsFile: path.join(distDir, 'comments.json'),
        assetsFile: path.join(distDir, 'assets.json'),
        usersFile: path.join(distDir, 'users.json'),
        attestationsFile: path.join(distDir, 'attestations.json'),
      },
      backend: hangBackend,
      admins: parseSeedAdmins(ADMIN),
      dbWake: stubWaker,
      membersResolveTimeoutMs: 50, // short deadline → deterministic, fast test
    });
    await new Promise<void>((resolve) => hung.listen(0, '127.0.0.1', resolve));
    const hbase = `http://127.0.0.1:${(hung.address() as AddressInfo).port}`;
    try {
      const me = await fetch(`${hbase}/api/me`, { headers: iap(ADMIN) });
      expect(me.status).toBe(200);
      expect(await me.json()).toMatchObject({ storeUnreachable: true, canWakeDb: true });
      // That the fetch RESOLVED at all proves the deadline degraded it: listUsers never settles,
      // so the 50ms timeout path is the only way an answer exists. No wall-clock assertion — on a
      // loaded box (pnpm -r test) elapsed time measures CPU starvation, not the deadline; a
      // regression that removes the deadline still fails here, as a test timeout.
    } finally {
      await new Promise<void>((resolve, reject) => hung.close((e) => (e ? reject(e) : resolve())));
    }
  });

  it('a backend that FAILS FAST with a non-connection-shaped error still degrades (the idle-stop 500 regression)', async () => {
    // The actual idle-stop incident: against a STOPPED Cloud SQL instance the connector does NOT hang
    // — it learns the instance isn't running and throws in ~1s, with a message matching none of
    // isConnectionError's /connect|terminat|timeout/ patterns and carrying no pg connection code. That
    // used to skip the degrade branch and re-throw → a bare 500 on /api/me → the SPA sat on a dead
    // screen with no wake button. Membership-resolution failure must ALWAYS degrade, whatever the
    // error's shape — never a 500.
    const failFastBackend: LibraryBackend = {
      ...stubBackend,
      listUsers: async () => {
        throw new Error('Cloud SQL instance is not running'); // no pg code, no connect/terminat/timeout
      },
    };
    const ff = createStudioServer({
      distDir,
      paths: {
        repoRoot: distDir,
        docsDir: path.join(distDir, 'docs'),
        storiesDir: path.join(distDir, 'stories'),
        dataDir: distDir,
        commentsFile: path.join(distDir, 'comments.json'),
        assetsFile: path.join(distDir, 'assets.json'),
        usersFile: path.join(distDir, 'users.json'),
        attestationsFile: path.join(distDir, 'attestations.json'),
      },
      backend: failFastBackend,
      admins: parseSeedAdmins(ADMIN),
      dbWake: stubWaker,
    });
    await new Promise<void>((resolve) => ff.listen(0, '127.0.0.1', resolve));
    const fbase = `http://127.0.0.1:${(ff.address() as AddressInfo).port}`;
    try {
      const me = await fetch(`${fbase}/api/me`, { headers: iap(ADMIN) });
      expect(me.status).toBe(200); // NOT 500 — degraded, not a dead screen
      expect(await me.json()).toMatchObject({ storeUnreachable: true, canWakeDb: true });
      // the corpus is honestly 503 (degraded), not 500
      expect((await fetch(`${fbase}/api/tree`, { headers: iap(MEMBER) })).status).toBe(503);
    } finally {
      await new Promise<void>((resolve, reject) => ff.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
