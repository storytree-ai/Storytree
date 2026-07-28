// Tiny HTTP helpers shared by the dev API route modules (devApi.ts, dbControl.ts):
// the status-carrying error the central catch maps to a response, and the one JSON sender.

import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Extra fields merged into the JSON error body (e.g. `{ requestAccess: true }`). */
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data, null, 2));
}

/**
 * The validated sender (map-server-memo, ADR-0240 stage 3): the SAME 200 body `sendJson` would send
 * (byte-identical, so no client parses anything differently), plus a `no-cache` + `ETag` validator
 * pair computed over the bytes actually sent. `no-cache` means "store it, but ALWAYS ask" — never
 * `max-age`, which would let a client paint proof state without asking (ADR-0240 decision 3). A
 * repeated GET carrying the current ETag in `If-None-Match` gets a 304 with an empty body instead of
 * the full payload — the repeat load the whole capability exists to answer.
 *
 * Deliberately opt-in (a separate sender, not folded into `sendJson`) — `sendJson` is the ONE JSON
 * sender for every route in the app, so adding headers inside it would put a validator on every write
 * response too; only `/api/docs` and `/api/tree` call this one.
 */
export function sendJsonValidated(req: IncomingMessage, res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data, null, 2);
  const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('ETag', etag);
  const ifNoneMatch = req.headers['if-none-match'];
  if (typeof ifNoneMatch === 'string' && ifNoneMatch === etag) {
    res.statusCode = 304;
    res.end();
    return;
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(body);
}
