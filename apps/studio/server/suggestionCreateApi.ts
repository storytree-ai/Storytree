// Member suggestion-CREATE handler (ADR-0140 caps 7/8 — the server half of the Review-mode
// suggest flow).
//
// Surfaces the suggestion store's create over HTTP:
//   POST { blockId, proposedText, topicKind: 'doc' | 'asset', topicId, originalText }
//   → 201 + the stored suggestion record on success
//   → 400 on a missing/blank blockId, proposedText, topicKind, or topicId, or an ABSENT
//     originalText (an EMPTY-string original is allowed — the store schema permits `original: ''`;
//     what it must never be is unrecorded, because it is the accept-apply's drift witness)
//   → 405 on any non-POST method
//
// HONESTY WALL (the comment-author posture, handleComments/handleUatAttest): the author is
// STAMPED from the VERIFIED caller identity — a client-supplied `author` field is IGNORED, so
// a proposal's authorship cannot be forged. The open dev posture (no policy → no caller) stamps
// the conventional local `operator`.
//
// The "who may create" gate (members allowed at exactly POST /api/suggestions; cap 4,
// member-suggest-write-policy) runs in the dispatch BEFORE this handler — an anonymous or
// non-member caller never reaches it.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { HttpError, sendJson } from './httpUtil.js';

// ---------------------------------------------------------------------------
// Suggestion record shape (structurally compatible with pg-suggestion-store's
// Suggestion type — the same local-copy posture as suggestionApi.ts, so inline
// stubs and the PgSuggestionStore wrapper both satisfy the seam).
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
// Backend seam — injected per-request; production wires PgSuggestionStore.create
// through the LibraryBackend's optional suggestion seam (503 when absent — json).
// ---------------------------------------------------------------------------

export interface SuggestionCreateBackend {
  /** Persist a new open suggestion; returns the stored record. */
  createSuggestion(s: SuggestionRecord): Promise<SuggestionRecord>;
}

export interface SuggestionCreateContext {
  backend: SuggestionCreateBackend;
  /** The verified IAP caller identity (email); null = the open dev posture. */
  caller: string | null;
}

// ---------------------------------------------------------------------------
// Body reader (same pattern as suggestionApi.ts / apiRouter.ts readBody).
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
 * Handle a suggestion create.
 *
 * Body: `{ blockId, proposedText, topicKind: 'doc' | 'asset', topicId, originalText }` (the
 * api.ts createSuggestion contract). Answers 201 with the stored record.
 *
 * Throws {@link HttpError} on any wall violation; the caller's catch maps it to the response.
 */
export async function handleSuggestionCreate(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: SuggestionCreateContext,
): Promise<void> {
  if ((req.method ?? 'GET') !== 'POST') {
    throw new HttpError(405, `method ${req.method ?? 'GET'} not allowed`);
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

  const { blockId, proposedText, topicKind, topicId, originalText } = body as Record<
    string,
    unknown
  >;

  // ---- Validate (the store schema's write boundary, answered as 400s) ----

  if (typeof blockId !== 'string' || !blockId.trim()) {
    throw new HttpError(400, 'blockId is required');
  }
  if (typeof proposedText !== 'string' || !proposedText.trim()) {
    throw new HttpError(400, 'proposedText is required');
  }
  if (topicKind !== 'doc' && topicKind !== 'asset') {
    throw new HttpError(400, 'topicKind must be "doc" or "asset"');
  }
  if (typeof topicId !== 'string' || !topicId.trim()) {
    throw new HttpError(400, 'topicId is required');
  }
  // The drift witness the accept-apply verifies against — it may be EMPTY (the store allows
  // `original: ''`) but never ABSENT: an unrecorded original could later splice the wrong prose.
  if (typeof originalText !== 'string') {
    throw new HttpError(400, 'originalText is required (send "" for an empty block)');
  }

  // ---- Build the record (author stamped SERVER-side — never a body field) ----

  const record: SuggestionRecord = {
    id: randomUUID(),
    topicKind,
    topicId: topicId.trim(),
    block: blockId.trim(),
    proposed: proposedText, // prose is persisted verbatim — whitespace is content
    original: originalText,
    status: 'open',
    author: ctx.caller ?? 'operator',
    createdAt: new Date().toISOString(),
    decidedBy: null,
    decidedAt: null,
  };

  const saved = await ctx.backend.createSuggestion(record);
  sendJson(res, 201, saved);
}
