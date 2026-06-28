// Integration tests for the UI-driven ADOPT API (ADR-0097 — brownfield go-green is a proving process)
// over a REAL node:http server driving the REAL dispatch (handleApiRequest) → handleAdopt, with a REAL
// BuildRegistry (SHARED with the build seam) and the adopt runner + discovery injected (no DB / git /
// subprocess — the buildApi.integration.test.ts pattern). Proves the across-the-wire contract: POST an
// adoption intent, poll its progress via the SHARED GET /api/build?runId, see the refusals (409 not
// adoptable, 409 concurrent, 400 bad body, 405 method, 404 unwired), run to a terminal verdict.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleApiRequest, type ApiContext, type AdoptContext, type BuildContext } from './apiRouter';
// The worker machinery relocated into @storytree/drive (ADR-0133 d.3); handleAdopt wraps it unchanged.
import { BuildRegistry, type BuildRunner, type BuildEnvelope } from '@storytree/drive/build-worker';
import type { LibraryBackend } from './libraryBackend';
import type { Paths } from './apiRouter';

// A runner we can hold open mid-adoption, then release — so we can observe the in-flight state, the
// concurrency refusal, and the terminal transition deterministically.
let release: ((env: BuildEnvelope) => void) | null = null;
const heldRunner: BuildRunner = async (_storyId, sink) => {
  sink('▸ adopt: observe-and-sign the observe gates, flip mapped → proposed');
  return new Promise<BuildEnvelope>((resolve) => {
    release = resolve;
  });
};

let registry: BuildRegistry;
let server: Server;
let base: string;

function makeCtx(adopt: AdoptContext | undefined, build: BuildContext | undefined): ApiContext {
  return {
    paths: {} as Paths,
    backend: {} as unknown as LibraryBackend,
    store: 'json',
    codeStamp: async () => null,
    allowDbControl: false,
    build,
    adopt,
  };
}

beforeAll(async () => {
  registry = new BuildRegistry();
  const adopt: AdoptContext = {
    registry,
    runner: heldRunner,
    isAdoptable: async (storyId) =>
      storyId === 'library' ? { ok: true } : { ok: false, reason: `story "${storyId}" is not adoptable` },
  };
  // The build seam SHARES the same registry — that is what lets the adoption run be polled via
  // GET /api/build?runId (one registry, ADR-0097). The build runner is never invoked in these tests.
  const build: BuildContext = {
    registry,
    runner: heldRunner,
    isBuildable: async () => false,
  };
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    void handleApiRequest(req, res, url, makeCtx(adopt, build));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

const postAdopt = (body: unknown) =>
  fetch(`${base}/api/adopt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

async function pollUntilTerminal(runId: string, tries = 50): Promise<Record<string, unknown>> {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`${base}/api/build?runId=${runId}`);
    const json = (await res.json()) as Record<string, unknown>;
    if (json.status !== 'building') return json;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('adoption never terminalised');
}

describe('/api/adopt', () => {
  it('runs an operator-dispatched adoption from intent to a terminal verdict, polled via the shared build registry', async () => {
    // 1. POST a valid intent → 202 { runId }.
    const accepted = await postAdopt({ storyId: 'library' });
    expect(accepted.status).toBe(202);
    const { runId } = (await accepted.json()) as { runId: string };
    expect(runId).toBeTruthy();

    // 2. GET status via the SHARED /api/build?runId → building, the coarse adopt line present.
    const live = await fetch(`${base}/api/build?runId=${runId}`);
    expect(live.status).toBe(200);
    const liveJson = (await live.json()) as { status: string; transcript: string[]; unitId: string };
    expect(liveJson.status).toBe('building');
    expect(liveJson.unitId).toBe('library');
    expect(liveJson.transcript.join('\n')).toMatch(/observe-and-sign/);

    // 3. A concurrent run is refused with 409 (the single-run guard spans build + adopt).
    const concurrent = await postAdopt({ storyId: 'library' });
    expect(concurrent.status).toBe(409);

    // 4. A non-adoptable story → 409 (validated against discovery), no run created.
    const notAdoptable = await postAdopt({ storyId: 'some-greenfield-story' });
    expect(notAdoptable.status).toBe(409);
    expect(((await notAdoptable.json()) as { error: string }).error).toMatch(/not adoptable/);

    // 5. Bad body → 400.
    expect((await postAdopt({})).status).toBe(400);

    // 6. Let the adoption finish → terminal passed with the envelope present.
    release?.({
      ok: true,
      body: 'Adopt "library": 3/3 observe gate(s) signed an `adopted` verdict.\n  → status flipped mapped → proposed',
    });
    const terminal = await pollUntilTerminal(runId);
    expect(terminal.status).toBe('passed');
    expect(String(terminal.envelope)).toMatch(/flipped mapped → proposed/);
  });

  it('refuses the wrong HTTP method with 405', async () => {
    const res = await fetch(`${base}/api/adopt`, { method: 'GET' });
    expect(res.status).toBe(405);
  });
});

describe('/api/adopt dispatch', () => {
  it('answers 404 when the adopt seam is not wired (hosted)', async () => {
    const noAdopt = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      void handleApiRequest(req, res, url, makeCtx(undefined, undefined));
    });
    await new Promise<void>((resolve) => noAdopt.listen(0, '127.0.0.1', resolve));
    const port = (noAdopt.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/adopt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: 'library' }),
      });
      expect(res.status).toBe(404);
    } finally {
      await new Promise<void>((resolve, reject) => noAdopt.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
