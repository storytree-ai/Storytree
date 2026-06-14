// Hosted-native DB wake (studio-cloud `hosted-db-wake`, ADR-0049): bring the idle-stopped Cloud SQL
// instance back up FROM THE CONTAINER, with no gcloud. The local `/api/db/start` (dbControl.ts)
// shells out to gcloud using the operator's ambient ADC — neither gcloud nor that ADC exists on
// Cloud Run, so hosted members were stuck behind the "membership can't be resolved" wall until
// someone ran `pnpm db:up` from a laptop. This closes that: an admin presses a button and the
// hosted studio self-recovers.
//
// Mechanism (keyless, the ADR-0021 posture — no key file in the image):
//   1. Read an OAuth access token for the Cloud Run RUNTIME service account from the metadata
//      server (cloud-platform scope on Cloud Run).
//   2. PATCH the Cloud SQL Admin REST API: settings.activationPolicy = ALWAYS — the exact inverse
//      of the cost-backstop's nightly stop (infra/cost-backstop.tf), against the same instance.
// Idempotent: patching an already-ALWAYS instance is a harmless no-op. The PATCH returns quickly
// with a long-running operation; the instance then takes ~a minute to accept connections, which the
// StoreBanner observes by polling /api/health (the same recovery path Start DB already uses).
//
// I/O is INJECTED (`DbWakeDeps`): the token fetch and the HTTP PATCH are seams, so the wake logic
// and the route handler are unit-testable offline — no metadata server, no GCP, no Cloud SQL.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, sendJson } from './httpUtil';
import { DB_INSTANCE, DB_PROJECT } from './dbControl';

/** The GCP metadata endpoint for the default (runtime) SA's access token — present on Cloud Run. */
const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

/** The Cloud SQL Admin API base — same host the cost-backstop PATCHes (infra/cost-backstop.tf). */
const SQLADMIN_BASE = 'https://sqladmin.googleapis.com/v1';

/** A response from the Cloud SQL Admin PATCH — only the bits the handler reacts to. */
export interface PatchResult {
  status: number;
  body: string;
}

/** The injectable I/O surface — real on Cloud Run, stubbed in tests. */
export interface DbWakeDeps {
  /** Fetch an OAuth access token for the runtime SA (the metadata server in production). */
  fetchToken: () => Promise<string>;
  /** Perform the authenticated PATCH against `url` with `body`; never throws on a non-2xx. */
  patch: (url: string, token: string, body: string) => Promise<PatchResult>;
  project: string;
  instance: string;
}

export interface DbWaker {
  /**
   * Kick off the instance start (activationPolicy=ALWAYS). Resolves once the Admin API has ACCEPTED
   * the patch (the instance then takes ~a minute to be reachable — the UI polls /api/health).
   * REJECTS on a token/auth/IAM/HTTP failure so the caller can surface the real reason (e.g. the
   * runtime SA still lacks cloudsql.instances.update — the Terraform grant hasn't been applied).
   */
  wake(): Promise<void>;
}

/** PURE wake over injected I/O — the testable core. */
export function createDbWaker(deps: DbWakeDeps): DbWaker {
  return {
    async wake(): Promise<void> {
      const token = await deps.fetchToken();
      const url = `${SQLADMIN_BASE}/projects/${deps.project}/instances/${deps.instance}`;
      const body = JSON.stringify({ settings: { activationPolicy: 'ALWAYS' } });
      const { status, body: replyBody } = await deps.patch(url, token, body);
      if (status < 200 || status >= 300) {
        // Trim the body so a verbose Google error payload doesn't flood the UI/logs.
        throw new Error(`Cloud SQL Admin API ${status}: ${replyBody.slice(0, 500).trim()}`);
      }
    },
  };
}

// ---------- production I/O (the metadata token + a real fetch) ----------

async function fetchMetadataToken(): Promise<string> {
  const res = await fetch(METADATA_TOKEN_URL, {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`metadata token request failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { access_token?: unknown };
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('metadata token response had no access_token');
  }
  return data.access_token;
}

async function httpPatch(url: string, token: string, body: string): Promise<PatchResult> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, body: await res.text() };
}

/**
 * The production waker: the runtime SA's metadata token + a real PATCH against the live instance
 * (project/instance default to the same constants the local db control uses). Only meaningful on
 * Cloud Run — a local `pnpm --filter studio serve` trial has no metadata server, so wake() rejects
 * (the local studio wakes the DB via gcloud / `pnpm db:up`, not this path).
 */
export function createMetadataDbWaker(
  opts: { project?: string; instance?: string } = {},
): DbWaker {
  return createDbWaker({
    fetchToken: fetchMetadataToken,
    patch: httpPatch,
    project: opts.project ?? DB_PROJECT,
    instance: opts.instance ?? DB_INSTANCE,
  });
}

// ---------- the route handler ----------

/**
 * POST /api/db/wake — fire the wake and answer 202 `{ok:true}`, mirroring /api/db/start's contract
 * so the StoreBanner's recovery loop is identical. The patch is AWAITED only far enough to confirm
 * the Admin API accepted it (so an IAM/auth failure surfaces as a 502 the admin can act on); the
 * ~1-minute instance start is the async part the UI polls /api/health for. `waker` is null where
 * hosted wake isn't wired (the dev plugin) — a clean 404 rather than a confusing 403.
 */
export async function handleDbWake(
  req: IncomingMessage,
  res: ServerResponse,
  waker: DbWaker | null,
): Promise<void> {
  const method = req.method ?? 'GET';
  if (method !== 'POST') throw new HttpError(405, `method ${method} not allowed`);
  if (!waker) throw new HttpError(404, 'hosted db wake is not available here');
  try {
    await waker.wake();
  } catch (err) {
    throw new HttpError(502, `failed to wake the database: ${err instanceof Error ? err.message : String(err)}`);
  }
  return sendJson(res, 202, { ok: true });
}
