// db control — the /api/db/* handlers, split out of devApi.ts so the endpoints are unit-testable
// in isolation.
//
// /api/db/* drives the Cloud SQL Admin REST API (ADR-0063) using the operator's ambient ADC
// credentials (ADR-0021) — no gcloud subprocess, so it never feeds the credential-lock cascade.
// That is deliberate, not a remote-exec hole: the Vite dev server binds localhost-only and is the
// operator's own session, so these endpoints are just UI buttons over the same `pnpm db:up` /
// `db:status` the operator would type.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, sendJson } from './httpUtil';
import type { CloudSqlAdmin } from '@storytree/store';

export const DB_INSTANCE = 'storytree-pg';
export const DB_PROJECT = 'storytree-498613';

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
    // REST-only (ADR-0063): no gcloud subprocess. A REST/ADC failure surfaces as a 502.
    try {
      const admin = await makeAdmin();
      const s = await admin.describe();
      return sendJson(res, 200, { state: s.state, activationPolicy: s.activationPolicy });
    } catch (err) {
      throw new HttpError(502, err instanceof Error ? err.message : String(err));
    }
  }

  if (url.pathname === '/api/db/start') {
    if (method !== 'POST') throw new HttpError(405, `method ${method} not allowed`);
    // REST-only (ADR-0063), AWAITED — a fast idempotent PATCH. The instance still takes ~a minute to
    // accept connections; the UI polls /api/health / /api/db/status. A REST/ADC failure → 502.
    try {
      const admin = await makeAdmin();
      await admin.setActivationPolicy('ALWAYS');
      return sendJson(res, 202, { ok: true });
    } catch (err) {
      throw new HttpError(502, `failed to start the database: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new HttpError(404, 'not found');
}
