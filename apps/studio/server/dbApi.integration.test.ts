// Integration tests for /api/db/status and /api/db/start (dbControl.ts handleDb), over a
// REAL node:http server. ADR-0063: the handlers are REST-ONLY — they call an injected
// CloudSqlAdmin client and surface a REST/ADC failure as a 502 (no gcloud fallback). We inject a
// fake admin for the REST path, so the whole suite runs offline with no Cloud SQL and no gcloud.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CloudSqlAdmin } from '@storytree/store';
import { handleDb } from './dbControl';
import { HttpError } from './httpUtil';

// ── injected REST admin (the happy path) ───────────────────────────────────────────────────
function okAdmin(state = 'RUNNABLE', activationPolicy = 'ALWAYS'): CloudSqlAdmin {
  return {
    describe: async () => ({ state, activationPolicy }),
    setActivationPolicy: async () => {},
  };
}
/** A REST client that always errors — the handler must surface it as a 502 (no fallback). */
function throwingAdmin(): CloudSqlAdmin {
  return {
    describe: async () => {
      throw new Error('REST describe failed (injected)');
    },
    setActivationPolicy: async () => {
      throw new Error('REST patch failed (injected)');
    },
  };
}

let server: Server;
let base: string;
let currentMakeAdmin: () => CloudSqlAdmin = () => okAdmin();

beforeAll(async () => {
  // A real http server routing into handleDb with the per-test injected REST admin.
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleDb(req, res, url, { makeAdmin: () => currentMakeAdmin() }).catch((err: unknown) => {
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

afterEach(() => {
  currentMakeAdmin = () => okAdmin();
});

describe('/api/db/status', () => {
  it('REST-only: returns the admin client describe result', async () => {
    currentMakeAdmin = () => okAdmin('STOPPED', 'NEVER');
    const res = await fetch(`${base}/api/db/status`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'STOPPED', activationPolicy: 'NEVER' });
  });

  it('answers 502 (not 500) when the REST client errors — no fallback', async () => {
    currentMakeAdmin = () => throwingAdmin();
    const res = await fetch(`${base}/api/db/status`);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/REST describe failed \(injected\)/);
  });

  it('refuses non-GET', async () => {
    const res = await fetch(`${base}/api/db/status`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});

describe('/api/db/start', () => {
  it('REST-only: 202 awaited', async () => {
    const res = await fetch(`${base}/api/db/start`, { method: 'POST' });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('answers 502 when the REST client errors — no fallback', async () => {
    currentMakeAdmin = () => throwingAdmin();
    const res = await fetch(`${base}/api/db/start`, { method: 'POST' });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/failed to start the database: REST patch failed \(injected\)/);
  });

  it('refuses non-POST', async () => {
    const res = await fetch(`${base}/api/db/start`);
    expect(res.status).toBe(405);
  });
});

describe('/api/db/*', () => {
  it('404s an unknown db endpoint', async () => {
    const res = await fetch(`${base}/api/db/nope`);
    expect(res.status).toBe(404);
  });
});
