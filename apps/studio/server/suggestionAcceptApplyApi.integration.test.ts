// Integration test for the ACCEPT-APPLY path (ADR-0140 caps 7/8 — the un-deferred 501): POST
// /api/suggestions/decision `accept` driven end-to-end through createStudioServer + guestPolicy
// over a REAL node:http server with a STUB backend that carries an asset store — proving the
// splice, not just the status transition (the suggestionDecisionApi.integration.test.ts pattern;
// that file keeps the walls, this one proves the happy path and the drift refusals):
//
//   - an admin ACCEPT locates the target block in the CURRENT asset body by its content-hash
//     handle (the shared ../src/lib/blocks model), verifies the recorded original, splices the
//     proposed text, persists through backend.updateAsset (every other field preserved), AND
//     transitions the suggestion to accepted — in that order (apply before save)
//   - original ≠ current block text → 409 (original-drifted): the suggestion STAYS OPEN and the
//     asset is UNCHANGED — never accepted-without-applied
//   - an unknown blockId → 409 (block-not-found): same no-op guarantees
//   - a STRUCTURED asset (per-kind fields — the body is a derived render) → 409: same guarantees
//   - REJECT never touches the doc: no updateAsset call, asset unchanged

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { UserDoc } from '@storytree/studio-members';
import type { Suggestion } from '@storytree/library/store';
import type { GuidanceAsset } from '../src/types';
import { splitBlocks } from '../src/lib/blocks';
import { createStudioServer } from './serve';
import { parseSeedAdmins } from './guestPolicy';
import { IAP_EMAIL_HEADER } from './identity';
import type { LibraryBackend, AssetInput } from './libraryBackend';

const ADMIN = 'admin@example.com';
const MEMBER = 'member@example.com';

const iap = (email: string): Record<string, string> => ({
  [IAP_EMAIL_HEADER]: `accounts.google.com:${email}`,
});

const userRow = (over: Partial<UserDoc> & { email: string; role: UserDoc['role'] }): UserDoc => ({
  status: 'active',
  invitedBy: ADMIN,
  createdAt: '2026-07-03T00:00:00.000Z',
  lastSeenAt: '2026-07-03T00:00:00.000Z',
  ...over,
});

const usersDb: UserDoc[] = [
  userRow({ email: ADMIN, role: 'admin' }),
  userRow({ email: MEMBER, role: 'member' }),
];

// ---------------------------------------------------------------------------
// The asset under suggestion: a three-block body; the suggestion targets the
// middle block by the SAME content-hash handle the client mount derives.
// ---------------------------------------------------------------------------

const ASSET_BODY =
  'First paragraph of guidance prose.\n\n' +
  'Second paragraph — the block the suggestion targets.\n\n' +
  'Third paragraph, untouched.';

const blocks = splitBlocks(ASSET_BODY);
const target = blocks[1]!;
const PROPOSED = 'Second paragraph, rewritten by the reviewer.';
const SPLICED = ASSET_BODY.slice(0, target.start) + PROPOSED + ASSET_BODY.slice(target.end);

const bodyAsset = (): GuidanceAsset => ({
  id: 'asset-1',
  category: 'template',
  title: 'A body-bearing unit',
  description: 'the asset the suggestion targets',
  body: ASSET_BODY,
  references: ['doc:decisions/0140-review-mode.md'],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const structuredAsset = (): GuidanceAsset => ({
  id: 'asset-structured',
  category: 'principle',
  title: 'A structured unit',
  description: 'its body is a derived render of its fields',
  body: ASSET_BODY, // the derived render a splice cannot honestly edit
  fields: { oneLine: 'the structured field content' },
  references: [],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const openSuggestion = (over: Partial<Suggestion> = {}): Suggestion => ({
  id: 'sug-1',
  topicKind: 'asset',
  topicId: 'asset-1',
  block: target.id,
  proposed: PROPOSED,
  original: target.text,
  status: 'open',
  author: MEMBER,
  createdAt: '2026-07-03T00:00:00.000Z',
  decidedBy: null,
  decidedAt: null,
  ...over,
});

// ---------------------------------------------------------------------------
// Stub backend — in-memory assets + suggestions with the REAL store's
// transition semantics, and an updateAsset that RECORDS every call so "the
// doc was never touched" is asserted on writes, not inferred from a status.
// ---------------------------------------------------------------------------

const suggestionsDb = new Map<string, Suggestion>();
const assetsDb = new Map<string, GuidanceAsset>();
const updateCalls: Array<{ id: string; input: AssetInput }> = [];

function makeStubBackend(): LibraryBackend {
  const backend: LibraryBackend = {
    listAssets: async () => [...assetsDb.values()],
    createAsset: async (input) => ({ ...input, createdAt: 'now', updatedAt: 'now' }),
    updateAsset: async (id, input) => {
      const existing = assetsDb.get(id);
      if (!existing) return null;
      updateCalls.push({ id, input });
      const next: GuidanceAsset = {
        ...input,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: '2026-07-03T01:00:00.000Z',
      };
      assetsDb.set(id, next);
      return next;
    },
    deleteAsset: async () => false,
    health: async () => ({ db: 'n/a' as const }),
    latestVerdicts: async () => null,
    inFlightBuilds: async () => null,
    listComments: async () => [],
    createComment: async (c) => c,
    updateComment: async () => null,
    deleteComment: async () => false,
    listUsers: async () => usersDb.map((u) => ({ ...u })),
    getUser: async (email) => usersDb.find((u) => u.email === email.toLowerCase()) ?? null,
    upsertUser: async (doc) => doc,
    removeUser: async () => false,
    listAttestations: async () => ({}),
    recordAttestation: async (att) => att,
    close: async () => {},
  };
  backend.getSuggestion = async (id) => suggestionsDb.get(id) ?? null;
  backend.transitionSuggestion = async (id, action, decidedBy, decidedAt) => {
    const current = suggestionsDb.get(id);
    if (!current) return null;
    if (current.status !== 'open') {
      throw new Error(
        `Cannot decide a closed suggestion (already ${current.status}); re-deciding is not allowed`,
      );
    }
    const updated: Suggestion = {
      ...current,
      status: action === 'accept' ? 'accepted' : 'rejected',
      decidedBy,
      decidedAt,
    };
    suggestionsDb.set(id, updated);
    return updated;
  };
  return backend;
}

// ---------------------------------------------------------------------------

let server: Server;
let base: string;
let distDir: string;

beforeAll(async () => {
  distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-sug-apply-'));
  await fs.writeFile(path.join(distDir, 'index.html'), '<html>studio spa</html>');
  server = createStudioServer({
    distDir,
    paths: {
      repoRoot: distDir,
      docsDir: path.join(distDir, 'docs'),
      storiesDir: path.join(distDir, 'stories'),
      dataDir: distDir,
      commentsFile: path.join(distDir, 'comments.json'),
      assetsFile: path.join(distDir, 'assets.json'),
      usersFile: path.join(distDir, 'users.json'),
      attestationsFile: path.join(distDir, 'attestations.json'),
    },
    backend: makeStubBackend(),
    admins: parseSeedAdmins(''),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  await fs.rm(distDir, { recursive: true, force: true });
});

beforeEach(() => {
  suggestionsDb.clear();
  assetsDb.clear();
  updateCalls.length = 0;
  assetsDb.set('asset-1', bodyAsset());
  assetsDb.set('asset-structured', structuredAsset());
  suggestionsDb.set('sug-1', openSuggestion());
});

const decide = (suggestionId: string, action: 'accept' | 'reject'): Promise<Response> =>
  fetch(`${base}/api/suggestions/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...iap(ADMIN) },
    body: JSON.stringify({ suggestionId, action }),
  });

// ---------------------------------------------------------------------------

describe('accept-apply end-to-end — the block splice through the admin asset-write path (ADR-0140)', () => {
  it('an admin ACCEPT splices the block into the asset AND transitions the suggestion', async () => {
    const res = await decide('sug-1', 'accept');
    expect(res.status).toBe(200);

    // The suggestion transitioned, attributed to the decider.
    const saved = (await res.json()) as Suggestion;
    expect(saved.status).toBe('accepted');
    expect(saved.decidedBy).toBe(ADMIN);
    expect(suggestionsDb.get('sug-1')?.status).toBe('accepted');

    // The asset body was spliced — target block replaced, neighbours byte-identical.
    expect(assetsDb.get('asset-1')?.body).toBe(SPLICED);

    // ...through the SAME admin asset-write path (updateAsset), every other field preserved.
    expect(updateCalls).toHaveLength(1);
    const call = updateCalls[0]!;
    expect(call.id).toBe('asset-1');
    expect(call.input.title).toBe('A body-bearing unit');
    expect(call.input.category).toBe('template');
    expect(call.input.description).toBe('the asset the suggestion targets');
    expect(call.input.references).toEqual(['doc:decisions/0140-review-mode.md']);
  });

  it('original drifted (block edited since the suggestion) → 409, suggestion stays OPEN, asset untouched', async () => {
    suggestionsDb.set(
      'sug-drift',
      openSuggestion({ id: 'sug-drift', original: 'what the reviewer THOUGHT the block said' }),
    );
    const res = await decide('sug-drift', 'accept');
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain('original-drifted');
    expect(suggestionsDb.get('sug-drift')?.status).toBe('open');
    expect(assetsDb.get('asset-1')?.body).toBe(ASSET_BODY);
    expect(updateCalls).toHaveLength(0);
  });

  it('block no longer exists in the current body → 409, suggestion stays OPEN, asset untouched', async () => {
    suggestionsDb.set('sug-gone', openSuggestion({ id: 'sug-gone', block: 'b-deadbeef' }));
    const res = await decide('sug-gone', 'accept');
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain('block-not-found');
    expect(suggestionsDb.get('sug-gone')?.status).toBe('open');
    expect(assetsDb.get('asset-1')?.body).toBe(ASSET_BODY);
    expect(updateCalls).toHaveLength(0);
  });

  it('a STRUCTURED asset (derived body) → 409, suggestion stays OPEN, asset untouched', async () => {
    suggestionsDb.set(
      'sug-structured',
      openSuggestion({ id: 'sug-structured', topicId: 'asset-structured' }),
    );
    const res = await decide('sug-structured', 'accept');
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain('structured');
    expect(suggestionsDb.get('sug-structured')?.status).toBe('open');
    expect(assetsDb.get('asset-structured')?.body).toBe(ASSET_BODY);
    expect(updateCalls).toHaveLength(0);
  });

  it('REJECT never touches the doc — no asset write, record transitioned', async () => {
    const res = await decide('sug-1', 'reject');
    expect(res.status).toBe(200);
    expect(suggestionsDb.get('sug-1')?.status).toBe('rejected');
    expect(assetsDb.get('asset-1')?.body).toBe(ASSET_BODY);
    expect(updateCalls).toHaveLength(0);
  });
});
