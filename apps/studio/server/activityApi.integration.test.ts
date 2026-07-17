// Integration tests for GET /api/activity (handleActivity) over a REAL node:http
// server with a STUB backend — no DB, no Vite (the claimsApi.integration.test.ts
// pattern, ADR-0048 / ADR-0138). The contract: inFlightBuilds(), inFlightClaims() AND
// inFlightDepartures() never throw, so the endpoint always answers 200 —
// `{builds: null, claims: null, departures: null}` IS the down-DB / json-store answer
// (advisory absence), never a 503. The only error path is the 405 method guard. A claim
// carries `kind: "claim"` (the §5 honesty wall) so the renderer paints it distinct from
// a proven-green bloom, plus its GRADE (ADR-0200 D2/D7 — geometry from grade, colour
// from intent). `departures` is the wisp-out legibility wire (ADR-0200 D7, unparking
// friction-released-build-wisp-reads-as-lost-claim) — proven here at the wire.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DepartedClaim } from '@storytree/notice-board';
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
// NEVER a proof, so it must never carry a green/bloom marker. `grade` rides the wire too
// (ADR-0200 D7 — the renderer's geometry signal; colour still folds from intent).
const claim: ClaimActivity = {
  unitId: 'wisp-as-story-claim',
  kind: 'claim',
  sessionId: 'sess-xyz',
  branch: 'claude/wonderful-austin',
  intent: 'orchestrate',
  grade: 'exploring',
  at: '2026-06-30T09:00:00.000Z',
};

// A just-released claim (ADR-0200 D7 wisp-out legibility): the departure the board renders as
// "this session left" so a released wisp never reads as a LOST claim.
const departure: DepartedClaim = {
  unitId: 'wisp-as-story-claim',
  sessionId: 'sess-xyz',
  grade: 'work',
  ageMs: 30_000,
  at: '2026-06-30T09:02:00.000Z',
};

// The stubs flip per test — handleActivity reads inFlightBuilds(), inFlightClaims() AND
// inFlightDepartures().
let inFlightResult: BuildActivity[] | null = null;
let claimResult: ClaimActivity[] | null = null;
let departureResult: DepartedClaim[] | null = null;

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    void handleActivity(req, res, {
      inFlightBuilds: async () => inFlightResult,
      inFlightClaims: async () => claimResult,
      inFlightDepartures: async () => departureResult,
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
  it('answers 200 with the in-flight builds, story claims AND departures when the store answers', async () => {
    inFlightResult = [build];
    claimResult = [claim];
    departureResult = [departure];
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ builds: [build], claims: [claim], departures: [departure] });
  });

  it('answers 200 {builds: null, claims: null, departures: null} when the store is silent (down DB / json) — never a 503', async () => {
    inFlightResult = null;
    claimResult = null;
    departureResult = null;
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ builds: null, claims: null, departures: null });
  });

  it('answers 200 {builds: [], claims: [], departures: []} when nothing is building, claimed or departing', async () => {
    inFlightResult = [];
    claimResult = [];
    departureResult = [];
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ builds: [], claims: [], departures: [] });
  });

  // ADR-0138 B3 contract `live-claim-read-selects-node-claim`: the live read path surfaces
  // events.node_claim rows (folded by claimsToActivity) on the SAME wire as builds, each carrying the
  // claimed-but-not-proven discriminator and NEVER a proven-green one (the §5 honesty wall).
  it('live-claim-read-selects-node-claim: surfaces node_claim rows as claim activities, distinct from a proven-green bloom', async () => {
    inFlightResult = [];
    claimResult = [claim];
    departureResult = null;
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

  // ADR-0200 D7: the claim's GRADE rides the wire — the renderer's geometry signal (colour still
  // folds from intent, and no grade is ever a proof — ADR-0138 §5).
  it('claims on the wire carry their grade (ADR-0200 D7)', async () => {
    inFlightResult = null;
    claimResult = [claim];
    departureResult = null;
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { claims: ClaimActivity[] };
    expect(body.claims[0]?.grade).toBe('exploring');
  });

  it('builds and claims are INDEPENDENT — a claim can orbit with no driven build in flight', async () => {
    inFlightResult = null; // no driven build
    claimResult = [claim]; // but a session holds the story
    departureResult = null;
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ builds: null, claims: [claim], departures: null });
  });

  // ADR-0200 D7 wisp-out legibility: a released claim inside the window rides the SAME wire as
  // builds/claims, so the board can render the exit instead of the wisp just vanishing.
  it('departures ride the wire independently — a departure can render with nothing claimed', async () => {
    inFlightResult = null;
    claimResult = [];
    departureResult = [departure];
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ builds: null, claims: [], departures: [departure] });
  });

  // Back-compat: `inFlightDepartures` is OPTIONAL on the backend (like `inFlightClaims`) — a
  // narrow mock that omits it answers `departures: null` (advisory absence, never a throw).
  it('a backend omitting inFlightDepartures answers departures: null', async () => {
    const narrow = createServer((req, res) => {
      void handleActivity(req, res, {
        inFlightBuilds: async () => [build],
        inFlightClaims: async () => [claim],
        // no inFlightDepartures — the pre-departure backend shape
      }).catch(() => {
        res.statusCode = 500;
        res.end();
      });
    });
    await new Promise<void>((resolve) => narrow.listen(0, '127.0.0.1', resolve));
    try {
      const port = (narrow.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/activity`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ builds: [build], claims: [claim], departures: null });
    } finally {
      await new Promise<void>((resolve, reject) =>
        narrow.close((e) => (e ? reject(e) : resolve())),
      );
    }
  });

  it('refuses non-GET', async () => {
    const res = await fetch(`${base}/api/activity`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});
