// Integration test for the write-broker endpoint (ADR-0117 d.2–d.4):
// a builder-scoped POST that persists a builder's locally-signed VERDICT through the
// studio's store seam — validating shape (zod, strict) and attribution (signer ≡
// caller), refusing non-builders (403) and forged attribution. The store-write double
// records what was persisted so each wall is asserted on the ACTUAL SIDE-EFFECT, not
// a success flag. The presence write type is RETIRED (ADR-0200 D7 — the claim ledger
// is the one coordination machinery): `type: 'presence'` is now an unknown
// discriminator → 400, proven below.
//
// Three honesty walls under test (all enforced BEFORE any write):
//   - AUTHORIZATION (ADR-0117 d.2): builder-or-admin scope only;
//                                    no identity → 401, member → 403
//   - SHAPE (ADR-0117 d.3):         Verdict.safeParse (strict — unknown fields
//                                    rejected); invalid body → 400
//   - ATTRIBUTION (ADR-0117 d.3):   verdict.signer must equal the verified caller;
//                                    mismatch → 403; nothing persisted

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Verdict } from '@storytree/proof-protocol';
import { type ResolvedAccess } from '@storytree/studio-members';
import { handleWriteBroker } from './writeBroker.js';
import { HttpError } from './httpUtil.js';

const BUILDER = 'builder@example.com';
const ADMIN = 'admin@example.com';
const MEMBER = 'member@example.com';
const OTHER = 'other-builder@example.com';
const COMMIT = 'cafebabecafebabecafebabecafebabecafebabe';

// ---------------------------------------------------------------------------
// Stub store — records what was persisted so assertions check the side-effect
// ---------------------------------------------------------------------------

const persistedVerdicts: Verdict[] = [];

const stubBackend = {
  signUatVerdict: async (verdict: Verdict, _actor: string): Promise<Verdict> => {
    const parsed = Verdict.parse(verdict);
    persistedVerdicts.push(parsed);
    return parsed;
  },
};

// ---------------------------------------------------------------------------
// Access doubles
// ---------------------------------------------------------------------------

const builderAccess: ResolvedAccess = { email: BUILDER, role: 'builder', status: 'active', seeded: false };
const adminAccess: ResolvedAccess = { email: ADMIN, role: 'admin', status: 'active', seeded: false };
const memberAccess: ResolvedAccess = { email: MEMBER, role: 'member', status: 'active', seeded: false };

// ---------------------------------------------------------------------------
// Per-test mutable context (the server reads these per request)
// ---------------------------------------------------------------------------

let currentCaller: string | null = null;
let currentAccess: ResolvedAccess | null = null;

// ---------------------------------------------------------------------------
// HTTP server (real node:http — no Vite, no IAP, no DB)
// ---------------------------------------------------------------------------

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    void handleWriteBroker(req, res, {
      backend: stubBackend,
      caller: currentCaller,
      access: currentAccess,
    }).catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

// ---------------------------------------------------------------------------
// Fixtures
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

/** The RETIRED presence-declaration shape (ADR-0200 D7) — posted only to prove the 400 refusal. */
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

/** POST to the write-broker path with a discriminated-union body. */
const post = (body: Record<string, unknown>): Promise<Response> =>
  fetch(`${base}/api/write-broker`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// ---------------------------------------------------------------------------
// Authorization wall
// ---------------------------------------------------------------------------

describe('write-broker — AUTHORIZATION gate (builder-or-admin only, ADR-0117 d.2)', () => {
  it('refuses a request with no identity (401)', async () => {
    currentCaller = null;
    currentAccess = null;
    const res = await post({ type: 'verdict', payload: makeVerdict() });
    expect(res.status).toBe(401);
  });

  it('refuses a member (403) — builder scope required; nothing is persisted', async () => {
    const before = persistedVerdicts.length;
    currentCaller = MEMBER;
    currentAccess = memberAccess;
    const res = await post({ type: 'verdict', payload: makeVerdict({ signer: MEMBER }) });
    expect(res.status).toBe(403);
    expect(persistedVerdicts.length).toBe(before);
  });

  it('a builder persists their own verdict (201) — builder scope is sufficient', async () => {
    const before = persistedVerdicts.length;
    currentCaller = BUILDER;
    currentAccess = builderAccess;
    const res = await post({ type: 'verdict', payload: makeVerdict({ signer: BUILDER }) });
    expect(res.status).toBe(201);
    expect(persistedVerdicts.length).toBe(before + 1);
    // The persisted verdict is the REAL shape (validated by the store stub's Verdict.parse)
    expect(persistedVerdicts[persistedVerdicts.length - 1]).toMatchObject({
      unitId: 'write-broker#gate-1',
      signer: BUILDER,
      outcome: 'pass',
    });
  });

  it('an admin can also persist a verdict (admin ⊇ builder)', async () => {
    const before = persistedVerdicts.length;
    currentCaller = ADMIN;
    currentAccess = adminAccess;
    const res = await post({ type: 'verdict', payload: makeVerdict({ signer: ADMIN }) });
    expect(res.status).toBe(201);
    expect(persistedVerdicts.length).toBe(before + 1);
  });
});

// ---------------------------------------------------------------------------
// Attribution wall (verdict: signer must equal the verified caller)
// ---------------------------------------------------------------------------

describe('write-broker — ATTRIBUTION wall (signer ≡ caller, ADR-0117 d.3)', () => {
  it('refuses a verdict attributed to a different signer (403) — attribution forgery', async () => {
    const before = persistedVerdicts.length;
    currentCaller = BUILDER;
    currentAccess = builderAccess;
    // BUILDER tries to persist a verdict signed by OTHER — rejected
    const res = await post({ type: 'verdict', payload: makeVerdict({ signer: OTHER }) });
    expect(res.status).toBe(403);
    expect(persistedVerdicts.length).toBe(before); // nothing persisted
  });

  it('a builder cannot persist a verdict attributed to an admin (403)', async () => {
    const before = persistedVerdicts.length;
    currentCaller = BUILDER;
    currentAccess = builderAccess;
    const res = await post({ type: 'verdict', payload: makeVerdict({ signer: ADMIN }) });
    expect(res.status).toBe(403);
    expect(persistedVerdicts.length).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Shape wall (zod strict — invalid body → 400 BEFORE any write)
// ---------------------------------------------------------------------------

describe('write-broker — SHAPE wall (Verdict.safeParse strict, ADR-0117 d.3)', () => {
  it('refuses a verdict with missing required fields (400) — no write', async () => {
    const before = persistedVerdicts.length;
    currentCaller = BUILDER;
    currentAccess = builderAccess;
    // Missing unitId, proofMode, outcome, commitSha, runId, at
    const res = await post({ type: 'verdict', payload: { signer: BUILDER } });
    expect(res.status).toBe(400);
    expect(persistedVerdicts.length).toBe(before);
  });

  it('refuses a verdict with an unknown extra field (400) — strict mode rejects it', async () => {
    const before = persistedVerdicts.length;
    currentCaller = BUILDER;
    currentAccess = builderAccess;
    const res = await post({
      type: 'verdict',
      payload: { ...makeVerdict({ signer: BUILDER }), injectedField: 'evil' },
    });
    expect(res.status).toBe(400);
    expect(persistedVerdicts.length).toBe(before);
  });

  it('refuses an unknown type discriminator (400)', async () => {
    currentCaller = BUILDER;
    currentAccess = builderAccess;
    const res = await post({ type: 'unknown', payload: makeVerdict({ signer: BUILDER }) });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Presence write type is RETIRED (ADR-0200 D7 — presence retirement sweep)
// ---------------------------------------------------------------------------

describe('write-broker — presence write type retired (ADR-0200 D7)', () => {
  it('refuses a presence write as an unknown type discriminator (400) — nothing persisted', async () => {
    const before = persistedVerdicts.length;
    currentCaller = BUILDER;
    currentAccess = builderAccess;
    const res = await post({ type: 'presence', payload: makePresence() });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('unknown type discriminator');
    expect(persistedVerdicts.length).toBe(before);
  });
});
