// Write-broker endpoint (ADR-0117 d.2–d.4): a builder-scoped POST that persists a
// builder's locally-signed verdict or presence declaration through the studio's store
// seam — validating shape (zod strict) and attribution (signer/session ≡ caller),
// refusing non-builders (403) and forged attribution. Holds NO signing key and NEVER
// re-signs (the inverse of /api/uat/attest which stamps the signer; the broker takes
// a fully-formed Verdict and persists it unchanged — after verifying it).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { Verdict } from '@storytree/proof-protocol';
import { PresenceDeclaration, type PresenceDeclarationDoc } from '@storytree/notice-board';
import type { ResolvedAccess } from '@storytree/studio-members';
import { HttpError, sendJson } from './httpUtil.js';

// ---------------------------------------------------------------------------
// Store-write seam (injected by the caller; the production wiring uses PgBackend +
// PgPresenceStore; the integration test injects a recording stub).
// ---------------------------------------------------------------------------

export interface WriteBrokerBackend {
  /** Persist a builder's locally-signed verdict (same store path as PgBackend.signUatVerdict). */
  signUatVerdict(verdict: Verdict, actor: string): Promise<Verdict>;
  /** Upsert a builder's presence declaration (same store path as PgPresenceStore.declare). */
  declarePresence(doc: PresenceDeclarationDoc, actor: string): Promise<PresenceDeclarationDoc>;
}

// ---------------------------------------------------------------------------
// Handler context (injected per-request; production resolves from IAP + DB).
// ---------------------------------------------------------------------------

export interface WriteBrokerContext {
  backend: WriteBrokerBackend;
  /** The verified IAP caller identity (email); null = no authenticated identity. */
  caller: string | null;
  /** The resolved studio-members access for the caller; null = not in the directory. */
  access: ResolvedAccess | null;
}

// ---------------------------------------------------------------------------
// Body reader (the same pattern as apiRouter.ts readBody).
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/write-broker — persists a builder's locally-signed verdict or presence
 * declaration through the studio's store seam.
 *
 * Three walls enforced BEFORE any write:
 *   - AUTHORIZATION (ADR-0117 d.2): builder-or-admin only; no identity → 401; member → 403
 *   - SHAPE (ADR-0117 d.3):         Verdict / PresenceDeclaration .safeParse strict;
 *                                    invalid body or unknown type → 400
 *   - ATTRIBUTION (ADR-0117 d.3):   verdict.signer must equal the verified caller;
 *                                    mismatch → 403 (a builder cannot persist another's verdict)
 *
 * Throws {@link HttpError} on any wall violation; the caller's catch maps it to the response.
 */
export async function handleWriteBroker(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: WriteBrokerContext,
): Promise<void> {
  // ---- AUTHORIZATION wall ----

  if (!ctx.caller) {
    throw new HttpError(401, 'authentication required');
  }

  const role = ctx.access?.role;
  if (!role || (role !== 'builder' && role !== 'admin')) {
    throw new HttpError(403, 'builder or admin role required');
  }

  // ---- Parse body ----

  const raw = await readBody(req);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'invalid JSON body');
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'body must be a JSON object');
  }

  const { type, payload } = body as Record<string, unknown>;

  // ---- Dispatch on type discriminator ----

  if (type === 'verdict') {
    // ---- SHAPE wall (Verdict.safeParse strict) ----
    const result = Verdict.safeParse(payload);
    if (!result.success) {
      throw new HttpError(400, `invalid verdict shape: ${result.error.message}`);
    }
    const verdict = result.data;

    // ---- ATTRIBUTION wall: signer must be the verified caller ----
    if (verdict.signer !== ctx.caller) {
      throw new HttpError(
        403,
        `verdict signer "${verdict.signer}" does not match authenticated caller "${ctx.caller}"`,
      );
    }

    const persisted = await ctx.backend.signUatVerdict(verdict, ctx.caller);
    sendJson(res, 201, { ok: true, verdict: persisted });
  } else if (type === 'presence') {
    // ---- SHAPE wall (PresenceDeclaration.safeParse strict) ----
    const result = PresenceDeclaration.safeParse(payload);
    if (!result.success) {
      throw new HttpError(400, `invalid presence shape: ${result.error.message}`);
    }
    const doc = result.data;

    const persisted = await ctx.backend.declarePresence(doc, ctx.caller);
    sendJson(res, 201, { ok: true, presence: persisted });
  } else {
    throw new HttpError(400, `unknown type discriminator "${String(type)}"`);
  }
}
