// Integration tests for /api/db/status and /api/db/start (dbControl.ts handleDb), over a
// REAL node:http server. ADR-0063: the handlers are REST-FIRST — they call an injected
// CloudSqlAdmin client; on a REST failure they fall back to gcloud. We inject a fake admin for
// the REST path, and keep a fake `gcloud` shim first on PATH (a node script behind a platform
// wrapper) to exercise the gcloud fallback offline, with no Cloud SQL and no gcloud install.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CloudSqlAdmin } from '@storytree/store';
import { handleDb } from './dbControl';
import { HttpError } from './httpUtil';

// The shim's behaviour is driven by FAKE_GCLOUD_* env vars (children inherit process.env).
const SHIM_IMPL = `// fake gcloud — see dbApi.integration.test.ts
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (process.env.FAKE_GCLOUD_MODE === 'fail') {
  process.stderr.write('fake gcloud: simulated failure\\n');
  process.exit(7);
}
if (args.includes('describe')) {
  // Real gcloud's --format=value(a,b) prints one line, tab-separated.
  process.stdout.write((process.env.FAKE_GCLOUD_STATE ?? 'RUNNABLE\\tALWAYS') + '\\n');
  process.exit(0);
}
if (args.includes('patch')) {
  // Keep running PAST the 202 response, then leave a marker — proving the
  // fire-and-forget child outlives the request that spawned it.
  const ms = Number(process.env.FAKE_GCLOUD_PATCH_MS ?? 200);
  setTimeout(() => {
    if (process.env.FAKE_GCLOUD_DONE_FILE) {
      writeFileSync(process.env.FAKE_GCLOUD_DONE_FILE, JSON.stringify(args));
    }
    process.stdout.write('patched\\n');
    process.exit(0);
  }, ms);
} else {
  process.stderr.write('fake gcloud: unknown invocation: ' + args.join(' ') + '\\n');
  process.exit(2);
}
`;

// ── injected REST admin (the happy path) ───────────────────────────────────────────────────
function okAdmin(state = 'RUNNABLE', activationPolicy = 'ALWAYS'): CloudSqlAdmin {
  return {
    describe: async () => ({ state, activationPolicy }),
    setActivationPolicy: async () => {},
  };
}
/** A REST client that always errors — forces the handler down its gcloud fallback. */
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

let shimDir: string;
let server: Server;
let base: string;
let savedPath: string | undefined;
let currentMakeAdmin: () => CloudSqlAdmin = () => okAdmin();

const FAKE_ENV = ['FAKE_GCLOUD_STATE', 'FAKE_GCLOUD_MODE', 'FAKE_GCLOUD_PATCH_MS', 'FAKE_GCLOUD_DONE_FILE'] as const;

beforeAll(async () => {
  // 1. The fake gcloud, first on PATH for every child this test process spawns.
  shimDir = await mkdtemp(path.join(tmpdir(), 'fake-gcloud-'));
  const impl = path.join(shimDir, 'gcloud-impl.mjs');
  await writeFile(impl, SHIM_IMPL, 'utf8');
  if (process.platform === 'win32') {
    // cmd.exe resolves `gcloud` → gcloud.cmd via PATH/PATHEXT — same as the real .cmd shim.
    await writeFile(path.join(shimDir, 'gcloud.cmd'), `@echo off\r\nnode "%~dp0gcloud-impl.mjs" %*\r\n`, 'utf8');
  } else {
    const sh = path.join(shimDir, 'gcloud');
    await writeFile(sh, `#!/bin/sh\nexec node "$(dirname "$0")/gcloud-impl.mjs" "$@"\n`, 'utf8');
    await chmod(sh, 0o755);
  }
  savedPath = process.env.PATH;
  process.env.PATH = `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`;

  // 2. A real http server routing into handleDb with the per-test injected REST admin.
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
  process.env.PATH = savedPath ?? '';
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  // Windows can still hold the shim dir while the last patch child exits; best-effort.
  await rm(shimDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

afterEach(() => {
  for (const k of FAKE_ENV) delete process.env[k];
  currentMakeAdmin = () => okAdmin();
});

describe('/api/db/status', () => {
  it('REST-first: returns the admin client describe result, no gcloud', async () => {
    currentMakeAdmin = () => okAdmin('STOPPED', 'NEVER');
    const res = await fetch(`${base}/api/db/status`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'STOPPED', activationPolicy: 'NEVER' });
  });

  it('falls back to gcloud describe when the REST client errors', async () => {
    currentMakeAdmin = () => throwingAdmin();
    process.env.FAKE_GCLOUD_STATE = 'PENDING_CREATE\tALWAYS';
    const res = await fetch(`${base}/api/db/status`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'PENDING_CREATE', activationPolicy: 'ALWAYS' });
  });

  it('answers 502 (not 500) when BOTH REST and the gcloud fallback fail', async () => {
    currentMakeAdmin = () => throwingAdmin();
    process.env.FAKE_GCLOUD_MODE = 'fail';
    const res = await fetch(`${base}/api/db/status`);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/exited 7/);
    expect(body.error).toMatch(/simulated failure/);
  });

  it('refuses non-GET', async () => {
    const res = await fetch(`${base}/api/db/status`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});

describe('/api/db/start', () => {
  it('REST-first: 202 awaited, no gcloud child spawned', async () => {
    const doneFile = path.join(shimDir, `patch-rest-${Date.now()}.json`);
    process.env.FAKE_GCLOUD_DONE_FILE = doneFile;
    process.env.FAKE_GCLOUD_PATCH_MS = '50';
    // okAdmin resolves the PATCH; the gcloud fallback must NOT run.
    const res = await fetch(`${base}/api/db/start`, { method: 'POST' });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    // Give a generous window: if gcloud had been spawned, the shim would have written the marker.
    await new Promise((r) => setTimeout(r, 300));
    expect(existsSync(doneFile)).toBe(false);
  });

  it('falls back to the gcloud fire-and-forget patch when REST errors; the child outlives the request', async () => {
    currentMakeAdmin = () => throwingAdmin();
    const doneFile = path.join(shimDir, `patch-done-${Date.now()}.json`);
    process.env.FAKE_GCLOUD_DONE_FILE = doneFile;
    process.env.FAKE_GCLOUD_PATCH_MS = '600';

    const res = await fetch(`${base}/api/db/start`, { method: 'POST' });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    // The response came back while the gcloud child was still running…
    expect(existsSync(doneFile)).toBe(false);

    // …and the orphaned child completes on its own schedule.
    const deadline = Date.now() + 5_000;
    while (!existsSync(doneFile) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(existsSync(doneFile)).toBe(true);
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
