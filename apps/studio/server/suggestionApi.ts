// Accept/reject suggestion decision handler (cap accept-reject-suggestion-api, ADR-0122).
//
// Surfaces the suggestion state machine over HTTP:
//   POST { suggestionId, action: 'accept' | 'reject' }
//   → 200 + updated suggestion on success
//   → 404 if the suggestion does not exist
//   → 409 if the suggestion is already closed (re-deciding is not allowed)
//
// On ACCEPT the handler applies the proposed content to the targeted asset block via
// backend.applyToAsset — the same path as the admin asset-write (LibraryBackend.updateAsset).
// On REJECT the document is untouched: the proposal is discarded without any write to the asset.
//
// The "who may decide" gate (403 for members) lives in cap 4 (member-suggest-write-policy) and
// is applied by the caller before reaching this handler. This cap proves the state-transition +
// apply behaviour, assuming an authorized caller.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, sendJson } from './httpUtil.js';

// ---------------------------------------------------------------------------
// Suggestion record shape (structurally compatible with
// pg-suggestion-store's Suggestion type — structural typing lets the
// PgSuggestionStore wrapper and inline stubs both satisfy the seam).
// ---------------------------------------------------------------------------

interface SuggestionRecord {
  id: string;
  topicKind: 'doc' | 'asset';
  topicId: string;
  block: string;
  proposed: string;
  original: string;
  status: 'open' | 'accepted' | 'rejected';
  author: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

// ---------------------------------------------------------------------------
// Backend seam — injected per-request; production wires PgSuggestionStore +
// the LibraryBackend admin asset-write path.
// ---------------------------------------------------------------------------

export interface SuggestionDecisionBackend {
  /** Fetch a suggestion by id; returns null if not found. */
  getSuggestion(id: string): Promise<SuggestionRecord | null>;
  /** Persist the updated suggestion after a transition. */
  saveSuggestion(s: SuggestionRecord): Promise<SuggestionRecord>;
  /**
   * Apply the proposed content to the targeted asset block (ACCEPT path only).
   * Mirrors LibraryBackend.updateAsset called with the suggestion's proposed prose.
   */
  applyToAsset(topicId: string, proposed: string, block: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Handler context
// ---------------------------------------------------------------------------

export interface SuggestionDecisionContext {
  backend: SuggestionDecisionBackend;
  /** The verified IAP caller identity (email); null = no authenticated identity. */
  caller: string | null;
}

// ---------------------------------------------------------------------------
// Pure state-machine transition (mirrors applySuggestionTransition from
// packages/library/src/store/pg-suggestion-store.ts — kept local to avoid
// a deep import outside the library package's declared `exports` map).
// ---------------------------------------------------------------------------

function applyTransition(
  current: SuggestionRecord,
  action: 'accept' | 'reject',
  decidedBy: string,
  decidedAt: string,
): SuggestionRecord {
  if (current.status !== 'open') {
    throw new Error(
      `Cannot decide a closed suggestion (already ${current.status}); re-deciding is not allowed`,
    );
  }
  return {
    ...current,
    status: action === 'accept' ? 'accepted' : 'rejected',
    decidedBy,
    decidedAt,
  };
}

// ---------------------------------------------------------------------------
// Body reader (same pattern as writeBroker.ts / apiRouter.ts readBody).
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
 * Handle a suggestion accept/reject decision.
 *
 * Body: `{ suggestionId: string; action: 'accept' | 'reject' }`
 *
 * Throws {@link HttpError} on any wall violation; the caller's catch maps it to the response.
 */
export async function handleSuggestionDecision(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: SuggestionDecisionContext,
): Promise<void> {
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

  const { suggestionId, action } = body as Record<string, unknown>;

  if (typeof suggestionId !== 'string' || !suggestionId) {
    throw new HttpError(400, 'suggestionId is required');
  }
  if (action !== 'accept' && action !== 'reject') {
    throw new HttpError(400, 'action must be "accept" or "reject"');
  }

  // ---- Fetch suggestion (404 if missing) ----

  const suggestion = await ctx.backend.getSuggestion(suggestionId);
  if (!suggestion) {
    throw new HttpError(404, `suggestion "${suggestionId}" not found`);
  }

  // ---- Apply transition (409 if already closed) ----

  let updated: SuggestionRecord;
  try {
    updated = applyTransition(
      suggestion,
      action,
      ctx.caller ?? 'unknown',
      new Date().toISOString(),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HttpError(409, msg);
  }

  // ---- ACCEPT path: apply proposed content to the asset (before persisting) ----

  if (action === 'accept') {
    await ctx.backend.applyToAsset(suggestion.topicId, suggestion.proposed, suggestion.block);
  }

  // ---- Persist the transitioned suggestion ----

  const saved = await ctx.backend.saveSuggestion(updated);

  sendJson(res, 200, saved);
}
