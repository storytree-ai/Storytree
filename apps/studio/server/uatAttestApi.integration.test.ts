// Integration test for the studio's operator-attested UAT verdict surface (ADR-0082 — the "I saw it
// work" button) over a REAL node:http server with a STUB backend, a temp dist/, and a temp stories/
// fixture — no DB, no Vite, no IAP (the serveApi.integration.test.ts pattern). The honesty walls
// under test:
//   - POST /api/uat/attest is admin-only (the gate's method rule: POST, not /api/comments);
//   - the signer is STAMPED from the verified IAP identity — a client `signer` field is ignored
//     (a verdict's signer cannot be forged);
//   - `checkUatProof` refuses a MACHINE-witness test (a click is not a machine proof) before any write;
//   - the persisted verdict is a REAL operator-attested events.verdict row (not the events.attestation
//     vouch), and GET /api/attestations then reports the per-test PROVEN state + the story-UAT roll-up.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SIGNING_EVENT_KIND, Verdict } from '@storytree/proof-protocol';
import { createStudioServer } from './serve';
import { parseSeedAdmins } from './guestPolicy';
import { IAP_EMAIL_HEADER } from './identity';
import type { LibraryBackend } from './libraryBackend';

const ADMIN = 'owner@example.com'; // bootstrap seed admin
const MEMBER = 'member@example.com'; // a non-admin (a stub returns no row → seeded-only admin model)
const COMMIT = 'cafebabecafebabecafebabecafebabecafebabe';

const iap = (email: string): Record<string, string> => ({
  [IAP_EMAIL_HEADER]: `accounts.google.com:${email}`,
});

// The story fixture: one human-witness test (attestable by a click) and one machine-witness test
// (which a click must NOT be able to green). loadNodeSpec parses the `## Story UAT` prose into
// demo-story#uat-1 (human) and demo-story#uat-2 (machine).
const STORY_MD = `---
id: "demo-story"
tier: story
title: "Demo story"
outcome: "A demo outcome."
status: proposed
proof_mode: UAT
---

# Demo story

## Story UAT

1. **See it work** _(witness: human)_: the operator sees it. **Success —** seen.
2. **Machine check** _(witness: machine)_: a machine checks it. **Success —** checked.
`;

/** The signed verdicts the stub backend "persisted" — drives the GET proven enrichment. */
const signed: Verdict[] = [];

const stubBackend: LibraryBackend = {
  listAssets: async () => [],
  createAsset: async (input) => ({ ...input, createdAt: 'now', updatedAt: 'now' }),
  updateAsset: async () => null,
  deleteAsset: async () => false,
  health: async () => ({ db: 'ok' as const }),
  latestVerdicts: async () => null,
  // The signed verdicts reflected back as the events.verdict stream, so GET proven/storyUat works.
  verdictEvents: async () =>
    signed.map((doc, i) => ({ kind: SIGNING_EVENT_KIND, seq: i + 1, doc })),
  // The verdict WRITE: validate (fail-closed, like the real PgWorkStore) then record.
  signUatVerdict: async (verdict) => {
    const parsed = Verdict.parse(verdict);
    signed.push(parsed);
    return parsed;
  },
  inFlightBuilds: async () => null,
  listComments: async () => [],
  createComment: async (c) => c,
  updateComment: async () => null,
  deleteComment: async () => false,
  // A bare directory: only the seed admin (ADMIN) is an effective admin; everyone else is a non-member.
  listUsers: async () => [],
  getUser: async () => null,
  upsertUser: async (doc) => doc,
  removeUser: async () => false,
  listAttestations: async () => ({}),
  recordAttestation: async (att) => att,
  close: async () => {},
};

let server: Server;
let base: string;
let tmp: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-uat-'));
  const distDir = path.join(tmp, 'dist');
  const storiesDir = path.join(tmp, 'stories');
  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(path.join(distDir, 'index.html'), '<html>studio</html>');
  await fs.mkdir(path.join(storiesDir, 'demo-story'), { recursive: true });
  await fs.writeFile(path.join(storiesDir, 'demo-story', 'story.md'), STORY_MD);

  server = createStudioServer({
    distDir,
    paths: {
      repoRoot: tmp,
      docsDir: path.join(tmp, 'docs'),
      storiesDir,
      dataDir: tmp,
      commentsFile: path.join(tmp, 'comments.json'),
      assetsFile: path.join(tmp, 'assets.json'),
      usersFile: path.join(tmp, 'users.json'),
      attestationsFile: path.join(tmp, 'attestations.json'),
    },
    backend: stubBackend,
    admins: parseSeedAdmins(ADMIN),
    // Inject a stamp so the served commit resolves (no real git in the temp repo).
    codeStamp: async () => ({ startedAt: COMMIT, head: COMMIT, stale: false }),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  await fs.rm(tmp, { recursive: true, force: true });
});

const postAttest = (
  who: string | null,
  body: Record<string, unknown>,
): Promise<Response> =>
  fetch(`${base}/api/uat/attest`, {
    method: 'POST',
    headers: { ...(who ? iap(who) : {}), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/uat/attest — admin-gated, signer not forgeable', () => {
  it('refuses an identity-less write (401)', async () => {
    expect((await postAttest(null, { testId: 'demo-story#uat-1' })).status).toBe(401);
  });

  it('refuses a non-admin (403) — admin-only by the gate method rule; nothing is signed', async () => {
    const before = signed.length;
    expect((await postAttest(MEMBER, { testId: 'demo-story#uat-1' })).status).toBe(403);
    expect(signed.length).toBe(before);
  });

  it('an admin signs a human-witness test; the signer is the IAP identity, NOT the forged body field', async () => {
    const res = await postAttest(ADMIN, {
      testId: 'demo-story#uat-1',
      outcome: 'pass',
      note: 'looked right',
      signer: 'forged@evil.com',
    });
    expect(res.status).toBe(201);
    const persisted = signed.find((v) => v.unitId === 'demo-story#uat-1');
    expect(persisted).toBeDefined();
    expect(persisted).toMatchObject({
      unitId: 'demo-story#uat-1',
      proofMode: 'operator-attested', // a REAL gate verdict, not the events.attestation vouch
      outcome: 'pass',
      signer: ADMIN, // stamped from IAP, NOT 'forged@evil.com'
      commitSha: COMMIT,
    });
    // The story under-claims (uat-2 is still unproven) — it does NOT green from one test.
    expect(await res.json()).toMatchObject({ storyUat: null });
  });

  it('REFUSES a machine-witness test — a click cannot green a machine proof (422); nothing is signed', async () => {
    const before = signed.length;
    const res = await postAttest(ADMIN, { testId: 'demo-story#uat-2', outcome: 'pass' });
    expect(res.status).toBe(422);
    expect((await res.json()) as { error?: string }).toMatchObject({ error: expect.stringMatching(/machine/i) });
    expect(signed.length).toBe(before);
  });

  it('rejects an unknown / undeclared test id (400)', async () => {
    expect((await postAttest(ADMIN, { testId: 'demo-story#uat-99' })).status).toBe(400);
    expect((await postAttest(ADMIN, { testId: '' })).status).toBe(400);
  });
});

describe('GET /api/attestations — the per-test PROVEN state (ADR-0082)', () => {
  it('reports proven=pass for the signed test and the story-UAT roll-up, member-readable', async () => {
    const res = await fetch(`${base}/api/attestations?storyId=demo-story`, { headers: iap(ADMIN) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tests: { id: string; witness: string; proven?: 'pass' | 'fail' }[];
      storyUat?: 'healthy' | 'unhealthy' | null;
    };
    const uat1 = body.tests.find((t) => t.id === 'demo-story#uat-1');
    const uat2 = body.tests.find((t) => t.id === 'demo-story#uat-2');
    expect(uat1?.proven).toBe('pass'); // the signed human test reads PROVEN
    expect(uat2?.proven).toBeUndefined(); // the machine test is still un-proven (–)
    expect(body.storyUat).toBe(null); // not every test passes → under-claims, never a stale green
  });
});
