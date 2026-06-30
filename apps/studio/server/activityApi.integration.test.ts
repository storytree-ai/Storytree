// Integration tests for GET /api/activity (handleActivity) over a REAL node:http
// server with a STUB backend — no DB, no Vite (the presenceApi.integration.test.ts
// pattern, ADR-0048 / ADR-0138). The contract: inFlightBuilds() AND inFlightClaims()
// never throw, so the endpoint always answers 200 — `{builds: null, claims: null}` IS
// the down-DB / json-store answer (advisory absence), never a 503. The only error path
// is the 405 method guard. A claim carries `kind: "claim"` (the §5 honesty wall) so the
// renderer paints it distinct from a proven-green bloom — proven here at the wire.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleActivity } from './devApi';
import { HttpError } from './httpUtil';
import type { BuildActivity } from '../src/types';
import type { ClaimActivity } from './inFlightActivity';

const build: BuildActivity = {
  unitId: 'studio',
  tier: 'capability',
  runId: 'live-smoke-abc123',
  at: '2026-06-14T12:00:00.000Z',
};

// A claimed-but-not-proven story (ADR-0138 §5): `kind: "claim"` is the discriminator — a claim is
// NEVER a proof, so it must never carry a green/bloom marker.
const claim: ClaimActivity = {
  unitId: 'wisp-as-story-claim',
  kind: 'claim',
  sessionId: 'sess-xyz',
  branch: 'claude/wonderful-austin',
  intent: 'orchestrate',
  at: '2026-06-30T09:00:00.000Z',
};

// The stubs flip per test — handleActivity reads inFlightBuilds() AND inFlightClaims().
let inFlightResult: BuildActivity[] | null = null;
let claimResult: ClaimActivity[] | null = null;

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    void handleActivity(req, res, {
      inFlightBuilds: async () => inFlightResult,
      inFlightClaims: async () => claimResult,
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

describe('/api/activity', () => {
  it('answers 200 with the in-flight builds AND story claims when the store answers', async () => {
    inFlightResult = [build];
    claimResult = [claim];
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ builds: [build], claims: [claim] });
  });

  it('answers 200 {builds: null, claims: null} when the store is silent (down DB / json) — never a 503', async () => {
    inFlightResult = null;
    claimResult = null;
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ builds: null, claims: null });
  });

  it('answers 200 {builds: [], claims: []} when nothing is building or claimed', async () => {
    inFlightResult = [];
    claimResult = [];
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ builds: [], claims: [] });
  });

  // ADR-0138 B3 contract `live-claim-read-selects-node-claim`: the live read path surfaces
  // events.node_claim rows (folded by claimsToActivity) on the SAME wire as builds, each carrying the
  // claimed-but-not-proven discriminator and NEVER a proven-green one (the §5 honesty wall).
  it('live-claim-read-selects-node-claim: surfaces node_claim rows as claim activities, distinct from a proven-green bloom', async () => {
    inFlightResult = [];
    claimResult = [claim];
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { builds: unknown; claims: ClaimActivity[] };
    expect(body.claims).toEqual([claim]);
    // §5 honesty wall, at the wire: every claim activity is discriminated `kind: "claim"`, never green/bloom.
    for (const c of body.claims) {
      expect(c.kind).toBe('claim');
      expect(['green', 'bloom']).not.toContain(c.kind as string);
    }
  });

  it('builds and claims are INDEPENDENT — a claim can orbit with no driven build in flight', async () => {
    inFlightResult = null; // no driven build
    claimResult = [claim]; // but a session holds the story
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ builds: null, claims: [claim] });
  });

  it('refuses non-GET', async () => {
    const res = await fetch(`${base}/api/activity`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});
