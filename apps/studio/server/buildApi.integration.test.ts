// Integration tests for the UI-driven build API (capability build-intent-api, ADR-0090 Phase 1)
// over a REAL node:http server driving the REAL dispatch (handleApiRequest) → handleBuild, with a
// REAL BuildRegistry behind it and the build runner + discovery injected (no SDK spend, the
// activityApi.integration.test.ts pattern). Proves the across-the-wire contract: POST an intent,
// read live status, see the refusals (404 unknown id, 409 concurrent, 400 bad body, 405 method),
// run to a terminal verdict.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleApiRequest, type ApiContext, type BuildContext } from './apiRouter';
// The worker machinery relocated into @storytree/drive (ADR-0133 d.3); handleBuild wraps it unchanged.
import { BuildRegistry, type BuildRunner, type BuildEnvelope } from '@storytree/drive/build-worker';
import type { LibraryBackend } from './libraryBackend';
import type { Paths } from './apiRouter';

// A runner we can hold open mid-build, then release — so we can observe the `building` state, the
// concurrency refusal, and the terminal transition deterministically.
let release: ((env: BuildEnvelope) => void) | null = null;
const heldRunner: BuildRunner = async (_unitId, sink) => {
  sink('phase: AUTHOR_TEST');
  return new Promise<BuildEnvelope>((resolve) => {
    release = resolve;
  });
};

function makeCtx(build: BuildContext | undefined): ApiContext {
  // Only the /api/build branch is exercised; the rest of the route table is never reached, so the
  // backend/paths can be inert stubs.
  return {
    paths: {} as Paths,
    backend: {} as unknown as LibraryBackend,
    store: 'json',
    codeStamp: async () => null,
    allowDbControl: false,
    build,
  };
}

let registry: BuildRegistry;
let server: Server;
let base: string;

beforeAll(async () => {
  registry = new BuildRegistry();
  const build: BuildContext = {
    registry,
    runner: heldRunner,
    isBuildable: async (unitId) => unitId === 'library-cli',
  };
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    void handleApiRequest(req, res, url, makeCtx(build));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

const postBuild = (body: unknown) =>
  fetch(`${base}/api/build`, {
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
  throw new Error('build never terminalised');
}

describe('/api/build', () => {
  it('runs an operator-dispatched build from intent to a terminal verdict over the wire', async () => {
    // 1. POST a valid intent → 202 { runId }.
    const accepted = await postBuild({ unitId: 'library-cli' });
    expect(accepted.status).toBe(202);
    const { runId } = (await accepted.json()) as { runId: string };
    expect(runId).toBeTruthy();

    // 2. GET status immediately → building, transcript growing with coarse lines.
    const live = await fetch(`${base}/api/build?runId=${runId}`);
    expect(live.status).toBe(200);
    const liveJson = (await live.json()) as { status: string; transcript: string[]; unitId: string };
    expect(liveJson.status).toBe('building');
    expect(liveJson.unitId).toBe('library-cli');
    expect(liveJson.transcript).toContain('phase: AUTHOR_TEST');

    // 3. A concurrent build is refused with 409 (the single-build guard), first run untouched.
    const concurrent = await postBuild({ unitId: 'library-cli' });
    expect(concurrent.status).toBe(409);
    expect(((await concurrent.json()) as { error: string }).error).toMatch(/already running/i);

    // 4. Unknown / unbuildable id → 404 (validated against real discovery), no run created.
    const unknown = await postBuild({ unitId: 'no-such-node' });
    expect(unknown.status).toBe(404);

    // 5. Bad body → 400; unknown runId GET → 404.
    expect((await postBuild({})).status).toBe(400);
    expect((await fetch(`${base}/api/build?runId=nope`)).status).toBe(404);

    // 6. Let the build finish → terminal passed with the envelope present.
    release?.({ ok: true, body: 'verdict: PASS (signed by operator)\nphase trail: AUTHOR_TEST → GATE' });
    const terminal = await pollUntilTerminal(runId);
    expect(terminal.status).toBe('passed');
    expect(String(terminal.envelope)).toMatch(/verdict: PASS/);
  });

  it('refuses the wrong HTTP method with 405', async () => {
    const res = await fetch(`${base}/api/build`, { method: 'DELETE' });
    expect(res.status).toBe(405);
  });
});

describe('/api/build dispatch', () => {
  it('answers 404 when the build seam is not wired (hosted, Phase 1)', async () => {
    const noBuild = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      void handleApiRequest(req, res, url, makeCtx(undefined));
    });
    await new Promise<void>((resolve) => noBuild.listen(0, '127.0.0.1', resolve));
    const port = (noBuild.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId: 'library-cli' }),
      });
      expect(res.status).toBe(404);
    } finally {
      await new Promise<void>((resolve, reject) => noBuild.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
