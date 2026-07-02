// Handler-level isolated test for the accept/reject suggestion decision endpoint
// (cap accept-reject-suggestion-api, ADR-0122). Exercises handleSuggestionDecision
// directly over stub backends — no DB, no node:http server, no IAP — following the
// handler-layer test discipline (the writeBroker.ts pattern, without a real HTTP server).
//
// The suggestion store + asset-write path are both scripted as stubs. The REAL
// applySuggestionTransition (from @storytree/library/store, cap suggestion-edit-store) is
// wired into the handler under test: the ars-closed-suggestion-is-409 case verifies the
// transition guard fires from a genuinely closed suggestion, not a stub returning 409.
//
// Contract ids per ADR-0122 (each describe/it name leads with its id so
// `storytree coverage accept-reject-suggestion-api` reports 4/4):
//   ars-accept-applies-and-closes
//   ars-reject-closes-without-touching-the-doc
//   ars-closed-suggestion-is-409
//   ars-missing-suggestion-is-404

import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleSuggestionDecision } from './suggestionApi.js';
import type { SuggestionDecisionBackend } from './suggestionApi.js';
import { HttpError } from './httpUtil.js';

// ---------------------------------------------------------------------------
// Inline shape (structurally identical to pg-suggestion-store's Suggestion type,
// so the stub satisfies SuggestionDecisionBackend via TypeScript structural typing)
// ---------------------------------------------------------------------------

interface SuggestionLike {
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

function makeSuggestion(overrides: Partial<SuggestionLike> = {}): SuggestionLike {
  return {
    id: 'sugg-abc123',
    topicKind: 'asset',
    topicId: 'some-principle',
    block: 'b-intro',
    proposed: 'The new proposed body text.',
    original: 'The original body text.',
    status: 'open',
    author: 'member@example.com',
    createdAt: '2026-07-01T00:00:00.000Z',
    decidedBy: null,
    decidedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// HTTP mock helpers — no node:http server
// ---------------------------------------------------------------------------

function makeRequest(method: string, body: unknown): IncomingMessage {
  // Readable.from emits the buffer when consumed — compatible with the handler's
  // own readBody (req.on('data'/'end')) because IncomingMessage extends Readable.
  const r = Readable.from([Buffer.from(JSON.stringify(body))]);
  return Object.assign(r, { method }) as unknown as IncomingMessage;
}

interface MockResponse {
  res: ServerResponse;
  captured: { status: number; body: string };
}

function makeResponse(): MockResponse {
  const captured = { status: 200, body: '' };
  const res = {
    get statusCode(): number { return captured.status; },
    set statusCode(v: number) { captured.status = v; },
    setHeader(_n: string, _v: string): void {},
    end(data: string): void { captured.body = data; },
    write(_data: unknown): boolean { return true; },
  } as unknown as ServerResponse;
  return { res, captured };
}

// Emulate the route-level catch in apiRouter.ts: map HttpError to the HTTP response,
// re-throw anything unknown (a genuine server bug).
async function dispatch(
  req: IncomingMessage,
  mock: MockResponse,
  ctx: { backend: SuggestionDecisionBackend; caller: string | null },
): Promise<void> {
  try {
    await handleSuggestionDecision(req, mock.res, ctx);
  } catch (err) {
    if (err instanceof HttpError) {
      mock.res.statusCode = err.status;
      mock.res.end(JSON.stringify({ error: err.message }));
    } else {
      throw err;
    }
  }
}

function parseBody(captured: { body: string }): Record<string, unknown> {
  return JSON.parse(captured.body) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stub backend factory — records side-effects for assertion
// ---------------------------------------------------------------------------

interface ApplyCall {
  topicId: string;
  proposed: string;
  block: string;
}

function makeStub(storedSuggestion: SuggestionLike | null): {
  backend: SuggestionDecisionBackend;
  applyCalls: ApplyCall[];
  getSaved(): SuggestionLike | null;
} {
  const applyCalls: ApplyCall[] = [];
  let saved: SuggestionLike | null = null;

  const backend: SuggestionDecisionBackend = {
    async getSuggestion(_id: string) {
      return storedSuggestion;
    },
    async saveSuggestion(s: SuggestionLike) {
      saved = s;
      return s;
    },
    async applyToAsset(topicId: string, proposed: string, block: string): Promise<void> {
      applyCalls.push({ topicId, proposed, block });
    },
  };

  return { backend, applyCalls, getSaved: () => saved };
}

// ---------------------------------------------------------------------------
// Shared fixture value
// ---------------------------------------------------------------------------

const CALLER = 'admin@example.com';

// ---------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------

describe('handleSuggestionDecision — suggestion state machine over HTTP (cap accept-reject-suggestion-api)', () => {

  it('ars-accept-applies-and-closes: accepting an open suggestion → 200 accepted + asset-write called with proposed content', async () => {
    const open = makeSuggestion({ status: 'open' });
    const { backend, applyCalls, getSaved } = makeStub(open);

    const req = makeRequest('POST', { suggestionId: open.id, action: 'accept' });
    const mock = makeResponse();
    await dispatch(req, mock, { backend, caller: CALLER });

    // Route response
    expect(mock.captured.status).toBe(200);
    const body = parseBody(mock.captured);
    expect(body.status).toBe('accepted');
    expect(body.decidedBy).toBe(CALLER);
    expect(typeof body.decidedAt).toBe('string');
    expect(body.id).toBe(open.id);

    // Asset-write path was called with the suggestion's proposed content (APPLY, not just flip)
    expect(applyCalls.length).toBe(1);
    expect(applyCalls[0]).toMatchObject({
      topicId: open.topicId,
      proposed: open.proposed,
      block: open.block,
    });

    // The suggestion was persisted with the new status
    expect(getSaved()?.status).toBe('accepted');
    expect(getSaved()?.decidedBy).toBe(CALLER);
  });

  it('ars-reject-closes-without-touching-the-doc: rejecting an open suggestion → 200 rejected + asset-write NOT called', async () => {
    const open = makeSuggestion({ status: 'open' });
    const { backend, applyCalls, getSaved } = makeStub(open);

    const req = makeRequest('POST', { suggestionId: open.id, action: 'reject' });
    const mock = makeResponse();
    await dispatch(req, mock, { backend, caller: CALLER });

    // Route response
    expect(mock.captured.status).toBe(200);
    const body = parseBody(mock.captured);
    expect(body.status).toBe('rejected');
    expect(body.decidedBy).toBe(CALLER);

    // CRITICAL: the document MUST NOT be touched when rejecting — the proposal is discarded
    expect(applyCalls.length).toBe(0);

    // The suggestion was persisted as rejected
    expect(getSaved()?.status).toBe('rejected');
  });

  it('ars-closed-suggestion-is-409: re-deciding an already-decided suggestion → 409 (transition guard)', async () => {
    // The REAL applySuggestionTransition (wired inside the handler) throws on a closed suggestion.
    // The test provides a closed suggestion via the backend stub; the handler must map the throw → 409.
    const accepted = makeSuggestion({
      status: 'accepted',
      decidedBy: 'owner@example.com',
      decidedAt: '2026-07-01T01:00:00.000Z',
    });
    const { backend, applyCalls } = makeStub(accepted);

    const req = makeRequest('POST', { suggestionId: accepted.id, action: 'reject' });
    const mock = makeResponse();
    await dispatch(req, mock, { backend, caller: CALLER });

    expect(mock.captured.status).toBe(409);

    // CRITICAL: the document must NOT be touched when the suggestion is already closed
    expect(applyCalls.length).toBe(0);
  });

  it('ars-missing-suggestion-is-404: decision on an unknown suggestion id → 404 + asset-write not called', async () => {
    const { backend, applyCalls } = makeStub(null); // backend returns null for any id

    const req = makeRequest('POST', { suggestionId: 'nonexistent-id', action: 'accept' });
    const mock = makeResponse();
    await dispatch(req, mock, { backend, caller: CALLER });

    expect(mock.captured.status).toBe(404);

    // CRITICAL: the asset-write path must never be called for a missing suggestion
    expect(applyCalls.length).toBe(0);
  });

});
