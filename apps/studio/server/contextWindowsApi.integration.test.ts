// Integration tests for GET /api/context-windows?session=<windowId> (contextWindowsApi.ts) over a
// REAL node:http server — the traversalApi.integration.test.ts pattern, and for the same reason:
// this route has no backend, its source of truth is a directory of JSONL files.
//
// REAL COLLABORATORS THROUGHOUT. The fixtures are host-transcript lines in the shape the Claude Code
// harness actually writes, read back through the REAL `readTranscriptWindow` the ingest uses, and the
// transcript root is pointed at a temp dir via `STORYTREE_TRANSCRIPT_DIR` — the documented operator
// override — so the env path the handler resolves through is itself under test rather than bypassed.
//
// ★ NO CONTRACT-ID PREFIX ON ANY NAME HERE, and that is deliberate rather than sloppy. The prefix
// is the coverage binding (`testNameCoversContract`) and named contracts of `context-window-meter`,
// the capability that owned this file's retired LIST mode and the standalone Context tab it fed.
// That capability is RETIRED (ADR-0456 D1). What survives is the `?session=` mode, which belongs to
// the traversal replay panel — and that panel has no capability of its own, exactly as
// `apps/studio/server/traversalApi.ts` beside it has no declared owner. An unprefixed name is inert
// to coverage, which walks contract → test.
//
// THE LIST-MODE CASES WENT WITH THE MODE, and two findings they pinned did NOT go with them: the
// `<synthetic>` zero-token tail (22 observations across 125 windows here, every one zero, TWO
// windows ENDING on one, so taking the last observation verbatim draws an EMPTY bar for a window
// that reached 437.5k) and the never-fold-a-helper rule (ADR-0413 D2) are both asserted below
// against the surviving mode, and again over the fold itself in
// `packages/context-traversal-transcript/src/context-windows.test.ts`.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { handleContextWindows, primeContextWindows, readWindowSeries } from './contextWindowsApi';
import { HttpError } from './httpUtil';

const PROJECT = 'C--code-storytree';

let transcriptRoot: string;
let priorRoot: string | undefined;
let server: Server;
let base: string;

interface LineOpts {
  readonly windowId: string;
  readonly at: string;
  readonly id: string;
  readonly tokens: number;
  readonly model?: string;
  readonly isSidechain?: boolean;
}

/** One assistant line in the shape the host harness writes. */
function assistantLine(opts: LineOpts): string {
  return JSON.stringify({
    type: 'assistant',
    sessionId: opts.windowId,
    timestamp: opts.at,
    isSidechain: opts.isSidechain ?? false,
    cwd: 'C:\\code\\storytree',
    message: {
      id: opts.id,
      model: opts.model ?? 'claude-opus-5',
      usage: { input_tokens: opts.tokens, output_tokens: 12 },
    },
  });
}

function writeWindow(windowId: string, lines: readonly string[], mtimeMs: number): string {
  const dir = path.join(transcriptRoot, PROJECT);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${windowId}.jsonl`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  const when = new Date(mtimeMs);
  fs.utimesSync(file, when, when);
  return file;
}

/** A helper transcript beside its parent window, in the harness's own `<window>/subagents/` layout. */
function writeHelper(windowId: string, agent: string, lines: readonly string[]): void {
  const dir = path.join(transcriptRoot, PROJECT, windowId, 'subagents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${agent}.jsonl`), `${lines.join('\n')}\n`);
}

async function get(pathname: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${base}${pathname}`);
  const text = await res.text();
  return { status: res.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
}

beforeAll(async () => {
  priorRoot = process.env.STORYTREE_TRANSCRIPT_DIR;
  server = createServer((req, res) => {
    void (async (): Promise<void> => {
      try {
        await handleContextWindows(req, res, new URL(req.url ?? '/', base));
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (priorRoot === undefined) delete process.env.STORYTREE_TRANSCRIPT_DIR;
  else process.env.STORYTREE_TRANSCRIPT_DIR = priorRoot;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  transcriptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-windows-'));
  process.env.STORYTREE_TRANSCRIPT_DIR = transcriptRoot;
});

describe('GET /api/context-windows?session=<id> — the replay panel’s bar (ADR-0456 D2)', () => {
  it('serves ONE window’s whole series, with the instants a playhead needs', async () => {
    writeWindow(
      'window-series',
      [
        assistantLine({ windowId: 'window-series', at: '2026-08-26T09:00:00.000Z', id: 's1', tokens: 240_900 }),
        // A recession: the quantity ADR-0248 chose precisely because it CAN fall.
        assistantLine({ windowId: 'window-series', at: '2026-08-26T09:10:00.000Z', id: 's2', tokens: 228_100 }),
        assistantLine({ windowId: 'window-series', at: '2026-08-26T09:20:00.000Z', id: 's3', tokens: 431_000 }),
      ],
      Date.parse('2026-08-26T09:20:00.000Z'),
    );

    const { status, body } = await get('/api/context-windows?session=window-series');
    expect(status).toBe(200);
    const payload = body as {
      windowId: string;
      observations: { at: string; residentTokens: number }[];
      peakTokens: number;
      absence: string | null;
    };
    expect(payload.windowId).toBe('window-series');
    expect(payload.absence).toBeNull();
    expect(payload.observations.map((o) => o.residentTokens)).toEqual([240_900, 228_100, 431_000]);
    // Without the instant the reading cannot be placed at a playhead, which is the whole job here.
    expect(payload.observations[0]?.at).toBe('2026-08-26T09:00:00.000Z');
    expect(payload.peakTokens).toBe(431_000);
  });

  it('answers an unknown window with a stated ABSENCE and a 200 — never a 404, and never an empty series', async () => {
    writeWindow(
      'window-present',
      [assistantLine({ windowId: 'window-present', at: '2026-08-26T09:00:00.000Z', id: 'p1', tokens: 10_000 })],
      Date.parse('2026-08-26T09:00:00.000Z'),
    );

    // A LEGACY slot-keyed trace id: 601 of 704 local traces are named this way, and a slot pools
    // every window that ran in it, so no single window's fullness could be drawn for one.
    const { status, body } = await get('/api/context-windows?session=sweet-lovelace-f6a3fa');
    // A 404 would read as "the route is missing" and send an operator somewhere else entirely.
    expect(status).toBe(200);
    const payload = body as { absence: string; observations: unknown[]; note: string; scan: { windowFilesFound: number } };
    expect(payload.absence).toBe('no-window-transcript');
    expect(payload.observations).toEqual([]);
    expect(payload.scan.windowFilesFound).toBe(1);
    expect(payload.note).toMatch(/worktree slot/);
  });

  it('never lets a helper transcript answer for a window (ADR-0413 D2)', async () => {
    writeHelper('window-guarded', 'agent-a16b5d320d7caa8bd', [
      assistantLine({ windowId: 'window-guarded', at: '2026-08-26T10:01:00.000Z', id: 'h1', tokens: 300_000, isSidechain: true }),
    ]);
    writeWindow(
      'window-guarded',
      [assistantLine({ windowId: 'window-guarded', at: '2026-08-26T10:00:00.000Z', id: 'p1', tokens: 100_000 })],
      Date.parse('2026-08-26T10:05:00.000Z'),
    );

    const { body } = await get('/api/context-windows?session=window-guarded');
    const payload = body as { observations: { residentTokens: number }[]; peakTokens: number };
    // 400_000 is the merged figure that must appear nowhere — no window was ever that full.
    expect(payload.observations.map((o) => o.residentTokens)).toEqual([100_000]);
    expect(payload.peakTokens).toBe(100_000);
  });

  it('refuses a window id that is not a flat token — the parameter becomes a file name', async () => {
    const { status, body } = await get('/api/context-windows?session=..%2F..%2Fetc');
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/flat token/);
  });

  it('reads the same body through the route as through the exported reader', async () => {
    writeWindow(
      'window-parity',
      [assistantLine({ windowId: 'window-parity', at: '2026-08-26T10:00:00.000Z', id: 'p1', tokens: 33_000 })],
      Date.parse('2026-08-26T10:00:00.000Z'),
    );
    const direct = await readWindowSeries('window-parity');
    const { body } = await get('/api/context-windows?session=window-parity');
    expect(body).toEqual(JSON.parse(JSON.stringify(direct)));
  });
});

describe('GET /api/context-windows — posture', () => {
  it('refuses a write by name: a transcript is the harness’s own record', async () => {
    const res = await fetch(`${base}/api/context-windows?session=window-anything`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect((JSON.parse(await res.text()) as { error: string }).error).toMatch(/read-only/);
  });

  it('refuses a bare read by NAME rather than defaulting to something (ADR-0456 D1)', async () => {
    // The machine-wide list this used to answer retired with the standalone Context tab. A caller
    // who omits `session` is asking the question the route stopped answering, and a silent fallback
    // would hand them an answer to a different one.
    const { status, body } = await get('/api/context-windows');
    expect(status).toBe(400);
    expect((body as { error: string }).error).toMatch(/which host context window/);
  });

  it('primes without throwing, on a machine with no transcript root at all', async () => {
    // Priming now warms the lazy MODULE rather than taking a reading — there is no window to name
    // before an operator picks a trace. It must stay failure-tolerant either way: a fault here
    // degrades to "the first request pays what it used to", never to a dev server that will not
    // start.
    await expect(primeContextWindows()).resolves.toBeUndefined();
  });
});
