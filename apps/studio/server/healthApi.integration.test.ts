// Integration tests for GET /api/health (devApi.ts handleHealth) over a REAL node:http
// server with stubbed deps — no DB, no git, no Vite (the claimsApi.integration.test.ts
// pattern). The contract under test: health always answers 200 (it is what the UI leans on
// when everything else is down); the code stamp rides along when the probe answers, is
// silently absent when it can't — and a probe REJECTION is flattened to the same absence,
// never a 500. The only error path is the 405 method guard.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleHealth, type HealthDeps } from './devApi';
import { HttpError } from './httpUtil';
import type { CodeStamp } from './codeStamp';

const fresh: CodeStamp = { startedAt: 'a'.repeat(40), head: 'a'.repeat(40), stale: false };
const moved: CodeStamp = { startedAt: 'a'.repeat(40), head: 'b'.repeat(40), stale: true };

// The stubs flip per test.
let deps: HealthDeps;

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    void handleHealth(req, res, deps).catch((err: unknown) => {
      // devApi's central HttpError mapping, inlined like the other integration suites.
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

describe('/api/health', () => {
  it('carries the store probe AND the code stamp when both answer', async () => {
    deps = {
      store: 'pg',
      health: async () => ({ db: 'ok', schema: { code: 2, db: 2 } }),
      codeStamp: async () => moved,
    };
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      store: 'pg',
      db: 'ok',
      schema: { code: 2, db: 2 },
      code: moved,
      pid: process.pid,
    });
  });

  it('stamps the json store too — the signal is backend-independent, unlike schema skew', async () => {
    deps = { store: 'json', health: async () => ({ db: 'n/a' }), codeStamp: async () => fresh };
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ store: 'json', db: 'n/a', code: fresh, pid: process.pid });
  });

  it('omits the stamp (still 200) when the probe has no answer', async () => {
    deps = { store: 'pg', health: async () => ({ db: 'unreachable' }), codeStamp: async () => null };
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ store: 'pg', db: 'unreachable', pid: process.pid });
  });

  it('flattens a probe REJECTION to the same absence — health never 500s over the stamp', async () => {
    deps = {
      store: 'pg',
      health: async () => ({ db: 'ok' }),
      codeStamp: async () => {
        throw new Error('git exploded');
      },
    };
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ store: 'pg', db: 'ok', pid: process.pid });
  });

  it('refuses non-GET', async () => {
    deps = { store: 'pg', health: async () => ({ db: 'ok' }), codeStamp: async () => null };
    const res = await fetch(`${base}/api/health`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  // The identity stamp (scripts/studio.mjs): WHO is answering, not merely that something is. Without
  // it a readiness probe observes "something on this port is healthy" and is read as "MY server is
  // healthy" — which diverges precisely when a sibling session already holds the port. Asserted on
  // its own, and across every leg above, because it must survive a degraded store and an absent code
  // stamp: the moments a launcher is MOST likely to be racing a foreign listener are exactly the
  // moments the rest of the envelope is thin.
  it("carries the answering PROCESS's own pid, whatever else the envelope is missing", async () => {
    deps = { store: 'pg', health: async () => ({ db: 'unreachable' }), codeStamp: async () => null };
    const res = await fetch(`${base}/api/health`);
    const body = (await res.json()) as { pid: unknown };
    expect(body.pid).toBe(process.pid);
    expect(Number.isInteger(body.pid)).toBe(true);
  });

  it('never lets a store probe shadow the pid stamp', async () => {
    // `pid` is written LAST in handleHealth for this reason: a HealthProbe that ever grew a `pid` of
    // its own would otherwise silently redefine identity to whatever the STORE reported.
    deps = {
      store: 'pg',
      health: async () => ({ db: 'ok', pid: 999_999 } as unknown as Awaited<ReturnType<HealthDeps['health']>>),
      codeStamp: async () => null,
    };
    const res = await fetch(`${base}/api/health`);
    expect(((await res.json()) as { pid: number }).pid).toBe(process.pid);
  });
});
