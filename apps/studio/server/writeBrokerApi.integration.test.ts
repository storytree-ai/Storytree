// Integration test for the MOUNTED write-broker endpoint (ADR-0117): POST /api/write-broker driven
// end-to-end through createStudioServer + guestPolicy + identity over a REAL node:http server with a
// STUB backend — no DB, no Vite, no IAP (the serveApi.integration.test.ts pattern). Where
// writeBroker.test.ts exercises the HANDLER in isolation, this proves the endpoint is REACHABLE and
// members-GATED once wired into the route table:
//
//   - identity-less POST → 401 (IAP authenticates; fail-closed)
//   - a member POST      → 403 (builder scope required, ADR-0117 d.2) — nothing persisted
//   - a builder POST     → 201, the verdict persisted UNCHANGED (signer ≡ caller, no re-sign)
//   - an admin POST      → 201 (admin ⊇ builder)
//   - a mismatched signer→ 403 (attribution wall) — nothing persisted
//   - a malformed body   → 400 (shape wall) — nothing persisted
//   - a builder presence → 201 (the declarePresence seam is mounted too)
//
// INTEGRITY (ADR-0117 d.3 / ADR-0091): the persisted verdict is asserted byte-equal to the POSTed
// one, so the broker is proven to persist the spine's locally-signed verdict as-is — never re-stamping
// the signer or recomputing the anchor.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Verdict } from '@storytree/proof-protocol';
import { PresenceDeclaration } from '@storytree/notice-board';
import type { UserDoc } from '@storytree/studio-members';
import { createStudioServer } from './serve';
import { parseSeedAdmins } from './guestPolicy';
import { IAP_EMAIL_HEADER } from './identity';
import type { LibraryBackend } from './libraryBackend';

const BUILDER = 'builder@example.com'; // an active builder row
const ADMIN = 'admin@example.com'; // an active admin row
const MEMBER = 'member@example.com'; // an active member row
const OTHER = 'other-builder@example.com';
const COMMIT = 'cafebabecafebabecafebabecafebabecafebabe';

const iap = (email: string): Record<string, string> => ({
  [IAP_EMAIL_HEADER]: `accounts.google.com:${email}`,
});

const userRow = (over: Partial<UserDoc> & { email: string; role: UserDoc['role'] }): UserDoc => ({
  status: 'active',
  invitedBy: ADMIN,
  createdAt: '2026-06-14T00:00:00.000Z',
  lastSeenAt: '2026-06-14T00:00:00.000Z',
  ...over,
});

// ---------------------------------------------------------------------------
// Stub backend — records the side-effect so each wall is asserted on what was
// (or wasn't) persisted, not just a success flag. signUatVerdict mirrors the real
// store's fail-closed Verdict.parse so the persisted shape is the real one.
// ---------------------------------------------------------------------------

const persisted: { verdicts: { verdict: Verdict; actor: string }[]; presence: { actor: string }[] } = {
  verdicts: [],
  presence: [],
};

const usersDb: UserDoc[] = [
  userRow({ email: BUILDER, role: 'builder' }),
  userRow({ email: ADMIN, role: 'admin' }),
  userRow({ email: MEMBER, role: 'member' }),
];

const stubBackend: LibraryBackend = {
  listAssets: async () => [],
  createAsset: async (input) => ({ ...input, createdAt: 'now', updatedAt: 'now' }),
  updateAsset: async () => null,
  deleteAsset: async () => false,
  health: async () => ({ db: 'n/a' as const }),
  latestVerdicts: async () => null,
  activeSessions: async () => null,
  inFlightBuilds: async () => null,
  // The write-broker's verdict seam: persist the builder's locally-signed verdict UNCHANGED. The real
  // PgBackend.signUatVerdict writes `doc: verdict` through PgWorkStore as-is; this stub validates the
  // shape (like the store's fail-closed Verdict.parse) and records it.
  signUatVerdict: async (verdict, actor) => {
    const parsed = Verdict.parse(verdict);
    persisted.verdicts.push({ verdict: parsed, actor });
    return parsed;
  },
  // The write-broker's presence seam (PgPresenceStore.declare in the real backend).
  declarePresence: async (doc, actor) => {
    const parsed = PresenceDeclaration.parse(doc);
    persisted.presence.push({ actor });
    return parsed;
  },
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

beforeAll(async () => {
  distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-wb-'));
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
      usersFile: path.join(distDir, 'users.json'),
      attestationsFile: path.join(distDir, 'attestations.json'),
    },
    backend: stubBackend,
    admins: parseSeedAdmins(''), // membership comes from the rows, not the seed
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  await fs.rm(distDir, { recursive: true, force: true });
});

beforeEach(() => {
  persisted.verdicts.length = 0;
  persisted.presence.length = 0;
});

// ---------------------------------------------------------------------------
// Fixtures (the writeBroker.test.ts shapes)
// ---------------------------------------------------------------------------

/** A minimal fully-valid Verdict attributed to `signer` (default: BUILDER). */
function makeVerdict(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    unitId: 'write-broker#gate-1',
    proofMode: 'capability',
    outcome: 'pass',
    commitSha: COMMIT,
    signer: BUILDER,
    runId: 'run-write-broker-abc',
    outputVersion: 'v1',
    evidence: [],
    at: '2026-06-27T10:00:00.000Z',
    ...overrides,
  };
}

/** A minimal fully-valid PresenceDeclaration. */
function makePresence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = '2026-06-27T10:00:00.000Z';
  return {
    sessionId: 'write-broker-worktree',
    branch: 'claude/write-broker-worktree',
    workingOn: 'write-broker capability',
    nodes: [],
    status: 'active',
    startedAt: now,
    lastSeenAt: now,
    ...overrides,
  };
}

/** POST a discriminated-union body to the mounted write-broker path, as `who` (no header = no identity). */
const post = (body: Record<string, unknown>, who?: string): Promise<Response> =>
  fetch(`${base}/api/write-broker`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(who ? iap(who) : {}) },
    body: JSON.stringify(body),
  });

// ---------------------------------------------------------------------------

describe('mounted /api/write-broker — members-gated (ADR-0117)', () => {
  it('refuses an identity-less POST (401) — nothing persisted', async () => {
    const res = await post({ type: 'verdict', payload: makeVerdict() });
    expect(res.status).toBe(401);
    expect(persisted.verdicts).toHaveLength(0);
  });

  it('refuses a member (403) — builder scope required; nothing persisted', async () => {
    const res = await post({ type: 'verdict', payload: makeVerdict({ signer: MEMBER }) }, MEMBER);
    expect(res.status).toBe(403);
    expect(persisted.verdicts).toHaveLength(0);
  });

  it('a builder persists their own verdict (201) — UNCHANGED, with the spine signature intact', async () => {
    const v = makeVerdict({ signer: BUILDER });
    const res = await post({ type: 'verdict', payload: v }, BUILDER);
    expect(res.status).toBe(201);
    expect(persisted.verdicts).toHaveLength(1);
    // INTEGRITY (ADR-0117 d.3 / ADR-0091): the broker persisted the verdict AS-IS — byte-equal to what
    // the builder POSTed, the signer NOT re-stamped (it stays the spine's signer ≡ the caller). The
    // audit actor is the caller too, but it is a SEPARATE field, never the verdict's signer.
    expect(persisted.verdicts[0]?.verdict).toEqual(Verdict.parse(v));
    expect(persisted.verdicts[0]?.verdict.signer).toBe(BUILDER);
    expect(persisted.verdicts[0]?.actor).toBe(BUILDER);
  });

  it('an admin can also persist a verdict (admin ⊇ builder)', async () => {
    const res = await post({ type: 'verdict', payload: makeVerdict({ signer: ADMIN }) }, ADMIN);
    expect(res.status).toBe(201);
    expect(persisted.verdicts).toHaveLength(1);
  });

  it('refuses a verdict attributed to a different signer (403) — attribution forgery; nothing persisted', async () => {
    const res = await post({ type: 'verdict', payload: makeVerdict({ signer: OTHER }) }, BUILDER);
    expect(res.status).toBe(403);
    expect(persisted.verdicts).toHaveLength(0);
  });

  it('refuses a malformed verdict body (400) — shape wall; nothing persisted', async () => {
    const res = await post({ type: 'verdict', payload: { signer: BUILDER } }, BUILDER);
    expect(res.status).toBe(400);
    expect(persisted.verdicts).toHaveLength(0);
  });

  it('a builder persists a valid presence declaration (201) — the declarePresence seam is mounted', async () => {
    const res = await post({ type: 'presence', payload: makePresence() }, BUILDER);
    expect(res.status).toBe(201);
    expect(persisted.presence).toHaveLength(1);
    expect(persisted.presence[0]?.actor).toBe(BUILDER);
  });

  it('refuses a member presence declaration (403) — builder scope required', async () => {
    const res = await post({ type: 'presence', payload: makePresence() }, MEMBER);
    expect(res.status).toBe(403);
    expect(persisted.presence).toHaveLength(0);
  });
});
