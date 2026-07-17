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
    });
  });

  it('stamps the json store too — the signal is backend-independent, unlike schema skew', async () => {
    deps = { store: 'json', health: async () => ({ db: 'n/a' }), codeStamp: async () => fresh };
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ store: 'json', db: 'n/a', code: fresh });
  });

  it('omits the stamp (still 200) when the probe has no answer', async () => {
    deps = { store: 'pg', health: async () => ({ db: 'unreachable' }), codeStamp: async () => null };
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ store: 'pg', db: 'unreachable' });
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
    expect(await res.json()).toEqual({ store: 'pg', db: 'ok' });
  });

  it('refuses non-GET', async () => {
    deps = { store: 'pg', health: async () => ({ db: 'ok' }), codeStamp: async () => null };
    const res = await fetch(`${base}/api/health`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});
