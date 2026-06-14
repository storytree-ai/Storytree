// Unit tests for hosted DB wake (dbWake.ts) — fully OFFLINE: the token fetch and the HTTP PATCH are
// injected, so nothing here touches the metadata server, GCP, or Cloud SQL. Two contracts:
//   • createDbWaker hits the RIGHT instance with the RIGHT body, and turns a non-2xx into a throw
//     that carries the real Admin-API reason (so a missing IAM grant is actionable, not silent);
//   • handleDbWake answers 202 {ok:true} (mirroring /api/db/start), 405 on non-POST, 404 when wake
//     isn't wired (the dev plugin), and 502 carrying the failure when the waker rejects.

import { describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDbWaker, handleDbWake, type DbWaker, type PatchResult } from './dbWake';
import { HttpError } from './httpUtil';

describe('createDbWaker', () => {
  it('PATCHes the right instance URL with activationPolicy=ALWAYS and the bearer token', async () => {
    const calls: { url: string; token: string; body: string }[] = [];
    const waker = createDbWaker({
      fetchToken: async () => 'tok-123',
      patch: async (url, token, body): Promise<PatchResult> => {
        calls.push({ url, token, body });
        return { status: 200, body: '{"name":"operation-1"}' };
      },
      project: 'storytree-498613',
      instance: 'storytree-pg',
    });

    await waker.wake();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      'https://sqladmin.googleapis.com/v1/projects/storytree-498613/instances/storytree-pg',
    );
    expect(calls[0]?.token).toBe('tok-123');
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ settings: { activationPolicy: 'ALWAYS' } });
  });

  it('accepts any 2xx (e.g. 200 with an operation resource)', async () => {
    const waker = createDbWaker({
      fetchToken: async () => 't',
      patch: async () => ({ status: 200, body: '{}' }),
      project: 'p',
      instance: 'i',
    });
    await expect(waker.wake()).resolves.toBeUndefined();
  });

  it('throws with the Admin-API status + reason on a non-2xx (a missing IAM grant is actionable)', async () => {
    const waker = createDbWaker({
      fetchToken: async () => 't',
      patch: async () => ({
        status: 403,
        body: '{"error":{"message":"Permission cloudsql.instances.update denied"}}',
      }),
      project: 'p',
      instance: 'i',
    });
    await expect(waker.wake()).rejects.toThrow(/Cloud SQL Admin API 403/);
    await expect(waker.wake()).rejects.toThrow(/cloudsql\.instances\.update denied/);
  });

  it('propagates a token-fetch failure (never silently no-ops)', async () => {
    const waker = createDbWaker({
      fetchToken: async () => {
        throw new Error('metadata token response had no access_token');
      },
      patch: async () => ({ status: 200, body: '{}' }),
      project: 'p',
      instance: 'i',
    });
    await expect(waker.wake()).rejects.toThrow(/metadata token/);
  });
});

describe('handleDbWake (over a real http server)', () => {
  /** Spin a one-route server that maps HttpError → its status, like apiRouter's central catch. */
  async function withServer(
    waker: DbWaker | null,
    fn: (base: string) => Promise<void>,
  ): Promise<void> {
    const server: Server = createServer((req, res) => {
      void handleDbWake(req, res, waker).catch((err: unknown) => {
        const status = err instanceof HttpError ? err.status : 500;
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      await fn(base);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  }

  const okWaker: DbWaker = { wake: async () => {} };

  it('answers 202 {ok:true} on POST when the wake is accepted', async () => {
    await withServer(okWaker, async (base) => {
      const res = await fetch(`${base}/api/db/wake`, { method: 'POST' });
      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ ok: true });
    });
  });

  it('refuses non-POST with 405', async () => {
    await withServer(okWaker, async (base) => {
      expect((await fetch(`${base}/api/db/wake`)).status).toBe(405);
    });
  });

  it('404s when hosted wake is not wired (null waker — the dev plugin)', async () => {
    await withServer(null, async (base) => {
      const res = await fetch(`${base}/api/db/wake`, { method: 'POST' });
      expect(res.status).toBe(404);
    });
  });

  it('surfaces a waker failure as 502 with the reason (not a silent 200)', async () => {
    const failing: DbWaker = {
      wake: async () => {
        throw new Error('Cloud SQL Admin API 403: cloudsql.instances.update denied');
      },
    };
    await withServer(failing, async (base) => {
      const res = await fetch(`${base}/api/db/wake`, { method: 'POST' });
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/failed to wake the database/);
      expect(body.error).toMatch(/cloudsql\.instances\.update denied/);
    });
  });
});
