// Integration tests for GET /api/activity (handleActivity) over a REAL node:http
// server with a STUB backend — no DB, no Vite (the presenceApi.integration.test.ts
// pattern, ADR-0048). The contract: inFlightBuilds() never throws, so the endpoint
// always answers 200 — `{builds: null}` IS the down-DB / json-store answer (advisory
// absence), never a 503. The only error path is the 405 method guard.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleActivity } from './devApi';
import { HttpError } from './httpUtil';
import type { BuildActivity } from '../src/types';

const build: BuildActivity = {
  unitId: 'studio',
  tier: 'capability',
  runId: 'live-smoke-abc123',
  at: '2026-06-14T12:00:00.000Z',
};

// The stub flips per test — handleActivity only needs inFlightBuilds().
let inFlightResult: BuildActivity[] | null = null;

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    void handleActivity(req, res, {
      inFlightBuilds: async () => inFlightResult,
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
  it('answers 200 with the in-flight builds when the store answers', async () => {
    inFlightResult = [build];
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ builds: [build] });
  });

  it('answers 200 {builds: null} when the store is silent (down DB / json) — never a 503', async () => {
    inFlightResult = null;
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ builds: null });
  });

  it('answers 200 {builds: []} when nothing is building', async () => {
    inFlightResult = [];
    const res = await fetch(`${base}/api/activity`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ builds: [] });
  });

  it('refuses non-GET', async () => {
    const res = await fetch(`${base}/api/activity`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});
