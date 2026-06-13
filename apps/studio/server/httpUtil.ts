// Tiny HTTP helpers shared by the dev API route modules (devApi.ts, dbControl.ts):
// the status-carrying error the central catch maps to a response, and the one JSON sender.

import type { ServerResponse } from 'node:http';

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
