// Integration tests for GET /api/arcs and /api/arcs/<id> (apiRouter.ts handleArcs) over a REAL
// node:http server with an IN-MEMORY document store — no DB, no Vite (the claimsApi/activityApi
// integration pattern).
//
// The contract under test is ADR-0267's: the studio serves the SAME derived arc → children join the
// CLI renders. So these tests deliberately assert the endpoint's payload against `loadArcRollup`
// from @storytree/drive — the CLI's own join — rather than against a hand-shaped literal. That is
// what makes a future fork RED here: if the handler ever starts deriving anything itself, the two
// stop agreeing and this suite says so.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { InMemoryStore } from '@storytree/storage-protocol';
import { loadArcRollup } from '@storytree/arc';

import { handleArcs, type Paths } from './apiRouter';
import { HttpError } from './httpUtil';

const store = new InMemoryStore();
// Flipped per test: `null` is the offline json backend, which genuinely holds no arcs.
let storeResult: InMemoryStore | null = store;

let server: Server;
let base: string;
let root: string;
let paths: Paths;

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'arcs-api-'));
  const docsDir = path.join(root, 'docs');
  const storiesDir = path.join(root, 'stories');
  mkdirSync(path.join(docsDir, 'decisions'), { recursive: true });
  mkdirSync(path.join(storiesDir, 'surface-story'), { recursive: true });
  writeFileSync(
    path.join(docsDir, 'decisions', '0267-arcs-take-the-slot.md'),
    '---\nstatus: accepted\narc: surface-arc\n---\n\n# ADR-0267: Arcs take the slot\n',
  );
  writeFileSync(
    path.join(storiesDir, 'surface-story', 'story.md'),
    '---\nid: "surface-story"\ntier: story\narc: surface-arc\n---\n\n# Surface story\n',
  );
  paths = {
    repoRoot: root,
    docsDir,
    storiesDir,
    dataDir: root,
    commentsFile: path.join(root, 'c.json'),
    assetsFile: path.join(root, 'a.json'),
    usersFile: path.join(root, 'u.json'),
    attestationsFile: path.join(root, 'at.json'),
  };

  await store.upsertDoc({
    id: 'surface-arc',
    kind: 'arc',
    doc: {
      kind: 'arc',
      id: 'surface-arc',
      title: 'Arcs as the primary orientation surface',
      description: 'the arc surface',
      intent: 'Arcs are what the owner meets on the map.',
      endState: 'The owner stops asking for a re-onboarding briefing.',
      references: [],
      createdAt: '2026-07-29',
      updatedAt: '2026-07-30',
    },
  });
  // The landing is a CHILD ROW since ADR-0305 D1 — the arc doc carries no increment array at all.
  await store.upsertDoc({
    id: 'surface-arc-inc-01',
    kind: 'increment',
    doc: {
      kind: 'increment',
      id: 'surface-arc-inc-01',
      title: 'the rollup landed',
      description: 'd',
      objective: 'the rollup landed',
      body: 'the rollup landed',
      arcRef: 'asset:surface-arc',
      status: 'closed',
      outcome: { date: '2026-07-30', pr: '#1010' },
      references: [],
      createdAt: '2026-07-30',
      updatedAt: '2026-07-30',
    },
  });
  await store.upsertDoc({
    id: 'oq-blocked-meaning',
    kind: 'open-question',
    doc: {
      kind: 'open-question',
      id: 'oq-blocked-meaning',
      title: 'What exactly qualifies as blocked?',
      description: 'D7 names blocked but does not define it',
      stakes: 'The surface cannot render a blocked state until this is settled.',
      statement: 's',
      context: 'c',
      arcRef: 'asset:surface-arc',
      references: [],
      createdAt: '2026-07-30',
      updatedAt: '2026-07-30',
    },
  });

  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleArcs(req, res, url, {
      paths,
      backend: { docStore: async () => storeResult },
    }).catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  rmSync(root, { recursive: true, force: true });
});

describe('/api/arcs', () => {
  it('serves the SAME rollup the CLI join produces — not a second derivation', async () => {
    storeResult = store;
    const res = await fetch(`${base}/api/arcs/surface-arc`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown;

    // The authority: drive's own join, run here directly. Any divergence between what the studio
    // serves and what `storytree arc show` renders shows up as a failure of THIS assertion.
    const expected = await loadArcRollup(
      { store, decisionsDir: path.join(paths.docsDir, 'decisions'), storiesDir: paths.storiesDir },
      'surface-arc',
    );
    expect(body).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  it('carries the increment log, the derived children, and the D7 waiting state', async () => {
    storeResult = store;
    const body = (await (await fetch(`${base}/api/arcs/surface-arc`)).json()) as Record<string, unknown>;
    // ONE increment list, joined by `arcRef` — the studio reads the SAME value `arc show` renders,
    // so the two surfaces cannot disagree about what an arc contains.
    expect(body['increments']).toEqual([
      {
        id: 'surface-arc-inc-01',
        title: 'the rollup landed',
        objective: 'the rollup landed',
        status: 'closed',
        outcome: { date: '2026-07-30', pr: '#1010' },
      },
    ]);
    expect(body['adrs']).toEqual([{ number: 267, status: 'accepted', title: 'Arcs take the slot' }]);
    expect(body['stories']).toEqual(['surface-story']);
    expect((body['questions'] as { id: string }[]).map((q) => q.id)).toEqual(['oq-blocked-meaning']);
    // ADR-0267 D7: `waiting` IS defined (the arc has open questions); `blocked` deliberately is not.
    expect(body['waiting']).toBe(true);
    expect(body['lifecycle']).toBe('active');
    expect(Object.hasOwn(body, 'blocked')).toBe(false);
  });

  it('lists every arc at /api/arcs', async () => {
    storeResult = store;
    const body = (await (await fetch(`${base}/api/arcs`)).json()) as { arcs: { id: string }[] };
    expect(body.arcs.map((a) => a.id)).toEqual(['surface-arc']);
  });

  it('404s an unknown arc id rather than answering with an empty shell', async () => {
    storeResult = store;
    const res = await fetch(`${base}/api/arcs/no-such-arc`);
    expect(res.status).toBe(404);
  });

  it('distinguishes "no store" from "no arcs": the list answers null, a fetch answers 503', async () => {
    // The offline json backend has no document store at all. `arcs: null` is the honest answer —
    // a surface built to RESTORE context must not present a missing store as a confident empty list.
    storeResult = null;
    const list = await fetch(`${base}/api/arcs`);
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ arcs: null });

    const one = await fetch(`${base}/api/arcs/surface-arc`);
    expect(one.status).toBe(503);
  });

  it('refuses a write — the surface is read-only this round (ADR-0267 D6)', async () => {
    storeResult = store;
    const res = await fetch(`${base}/api/arcs/surface-arc`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});
