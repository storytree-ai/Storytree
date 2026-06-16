// db control (gcloud on the OPERATOR's machine) — the /api/db/* handlers, split out of
// devApi.ts so the spawn contract and the endpoints are unit-testable in isolation.
//
// /api/db/* shells out to gcloud locally. That is deliberate, not a remote-exec hole: the Vite
// dev server binds localhost-only and is the operator's own session, so these endpoints are
// just UI buttons over the same `pnpm db:up` / `gcloud sql ...` commands the operator would
// type — using the operator's ambient ADC credentials (ADR-0021).

import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, sendJson } from './httpUtil';
import type { CloudSqlAdmin } from '@storytree/store';

export const DB_INSTANCE = 'storytree-pg';
export const DB_PROJECT = 'storytree-498613';

/** The exact (command, args, options) triple a gcloud spawn must use — see gcloudInvocation. */
export interface GcloudInvocation {
  command: string;
  args: string[];
  options: {
    shell: boolean;
    stdio: ['ignore', 'pipe', 'pipe'];
    windowsHide: boolean;
  };
}

/**
 * How to spawn gcloud on `platform`, as data (pure, so the contract is testable on any host).
 *
 * On Windows gcloud is a .cmd shim, and Node refuses to spawn .cmd/.bat without a shell
 * (CVE-2024-27980 hardening) — so route through the shell there; shell:false everywhere else.
 * When the shell IS used, the command goes as ONE pre-joined string (args-with-shell is
 * deprecated, DEP0190); every argument the callers pass is a static literal, so joining is safe.
 *
 * windowsHide: the detached studio server has no console, so without it every gcloud spawn
 * pops a visible terminal window for the command's duration — and an operator closing that
 * window kills the gcloud run out from under the UI.
 */
export function gcloudInvocation(
  args: string[],
  platform: NodeJS.Platform = process.platform,
): GcloudInvocation {
  const stdio: ['ignore', 'pipe', 'pipe'] = ['ignore', 'pipe', 'pipe'];
  return platform === 'win32'
    ? { command: ['gcloud', ...args].join(' '), args: [], options: { shell: true, stdio, windowsHide: true } }
    : { command: 'gcloud', args, options: { shell: false, stdio, windowsHide: true } };
}

export function spawnGcloud(args: string[]): ChildProcessByStdio<null, Readable, Readable> {
  const { command, args: spawnArgs, options } = gcloudInvocation(args);
  return spawn(command, spawnArgs, options);
}

/** Run gcloud to completion, resolving stdout; reject on spawn failure or non-zero exit. */
export function runGcloud(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnGcloud(args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`gcloud exited ${code ?? 'null'}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

/** Injected effects for {@link handleDb}: the REST admin client. Default = ADC against the live instance. */
export interface DbControlDeps {
  makeAdmin?: () => CloudSqlAdmin | Promise<CloudSqlAdmin>;
}

// Dynamic import: a STATIC `@storytree/store` import here breaks `vite build` — vite.config.ts loads
// this module (via server/devApi → apiRouter), and node-ESM can't resolve the store's internal `.js`
// specifiers during config load (only tsx maps `.js`→`.ts`). Defer it to runtime under tsx.
const defaultMakeAdmin = async (): Promise<CloudSqlAdmin> => {
  const { createAdcCloudSqlAdmin } = await import('@storytree/store');
  return createAdcCloudSqlAdmin({ project: DB_PROJECT, instance: DB_INSTANCE });
};

export async function handleDb(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: DbControlDeps = {},
): Promise<void> {
  const method = req.method ?? 'GET';
  const makeAdmin = deps.makeAdmin ?? defaultMakeAdmin;

  if (url.pathname === '/api/db/status') {
    if (method !== 'GET') throw new HttpError(405, `method ${method} not allowed`);
    // REST-first (ADR-0063): no gcloud subprocess on the happy path. Fall back to gcloud describe.
    try {
      const admin = await makeAdmin();
      const s = await admin.describe();
      return sendJson(res, 200, { state: s.state, activationPolicy: s.activationPolicy });
    } catch {
      let out: string;
      try {
        out = await runGcloud([
          'sql',
          'instances',
          'describe',
          DB_INSTANCE,
          '--project',
          DB_PROJECT,
          '--format=value(state,settings.activationPolicy)',
        ]);
      } catch (err) {
        throw new HttpError(502, err instanceof Error ? err.message : String(err));
      }
      // `value(...)` prints the two fields on one line, tab-separated.
      const [state = 'UNKNOWN', activationPolicy = 'UNKNOWN'] = out.trim().split(/\s+/);
      return sendJson(res, 200, { state, activationPolicy });
    }
  }

  if (url.pathname === '/api/db/start') {
    if (method !== 'POST') throw new HttpError(405, `method ${method} not allowed`);
    // REST-first (ADR-0063), AWAITED — a fast idempotent PATCH, so no fire-and-forget unbounded
    // spawn (the old gcloud path). The instance still takes ~a minute to accept connections; the
    // UI polls /api/health / /api/db/status. Fall back to the gcloud fire-and-forget patch on error.
    try {
      const admin = await makeAdmin();
      await admin.setActivationPolicy('ALWAYS');
      return sendJson(res, 202, { ok: true });
    } catch {
      const child = spawnGcloud([
        'sql',
        'instances',
        'patch',
        DB_INSTANCE,
        '--project',
        DB_PROJECT,
        '--activation-policy',
        'ALWAYS',
        '--quiet',
      ]);
      try {
        // Confirm the process actually launched (gcloud missing → 'error', not an exception).
        await new Promise<void>((resolve, reject) => {
          child.once('spawn', resolve);
          child.once('error', reject);
        });
      } catch (err) {
        throw new HttpError(502, `failed to start the database: ${err instanceof Error ? err.message : String(err)}`);
      }
      child.stdout.on('data', (c: Buffer) => console.log(`[db:start] ${c.toString('utf8').trimEnd()}`));
      child.stderr.on('data', (c: Buffer) => console.log(`[db:start] ${c.toString('utf8').trimEnd()}`));
      child.on('close', (code) => console.log(`[db:start] gcloud exited with code ${code ?? 'null'}`));
      return sendJson(res, 202, { ok: true });
    }
  }

  throw new HttpError(404, 'not found');
}
