// Integration tests for GET /api/context-windows (contextWindowsApi.ts) over a REAL node:http
// server — the traversalApi.integration.test.ts pattern, and for the same reason: this route has no
// backend, its source of truth is a directory of JSONL files.
//
// REAL COLLABORATORS THROUGHOUT. The fixtures are host-transcript lines in the shape the Claude Code
// harness actually writes, read back through the REAL `readTranscriptWindow` the ingest uses, and the
// transcript root is pointed at a temp dir via `STORYTREE_TRANSCRIPT_DIR` — the documented operator
// override — so the env path the handler resolves through is itself under test rather than bypassed.
//
// THE CRUX IS THE SYNTHETIC TAIL. The harness emits `model: "<synthetic>"` assistant lines carrying an
// all-zero usage block; measured on this machine 2026-08-26, 22 of them across 125 windows, every one
// zero, and TWO windows END on one. Taking the last observation verbatim therefore draws an EMPTY
// meter for a window that reached 437.5k. That is a defect a reader cannot see and a bar cannot
// confess, so it is pinned first.
//
// ★ THE `?session=` CASES CARRY NO CONTRACT-ID PREFIX, and that is deliberate rather than sloppy.
// The prefix is the coverage binding (`testNameCoversContract`) and names a contract of
// `context-window-meter` — the capability that owns this file's LIST mode and the tab it feeds.
// The session mode belongs to the traversal replay panel (ADR-0456 D2), which has no capability of
// its own, so a `context-window-meter-…` prefix here would assert a contract about the meter that
// these cases do not test. An unprefixed name is inert to coverage, which walks contract → test.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { handleContextWindows, primeContextWindows, readContextWindows, readWindowSeries } from './contextWindowsApi';
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

describe('GET /api/context-windows — the reading', () => {
  it('context-window-meter-reads-the-window-the-harness-is-writing: does not let a synthetic zero-token tail draw an empty meter for a full window', async () => {
    writeWindow(
      'window-synthetic-tail',
      [
        assistantLine({ windowId: 'window-synthetic-tail', at: '2026-08-26T10:00:00.000Z', id: 'm1', tokens: 120_000 }),
        assistantLine({ windowId: 'window-synthetic-tail', at: '2026-08-26T10:05:00.000Z', id: 'm2', tokens: 437_477 }),
        // The harness's own synthetic line: zero usage, and LAST.
        assistantLine({
          windowId: 'window-synthetic-tail',
          at: '2026-08-26T10:06:00.000Z',
          id: 'm3',
          tokens: 0,
          model: '<synthetic>',
        }),
      ],
      Date.parse('2026-08-26T10:06:00.000Z'),
    );

    const { status, body } = await get('/api/context-windows');
    expect(status).toBe(200);
    const [window] = (body as { windows: { residentTokens: number; peakTokens: number; observationCount: number; syntheticObservations: number }[] }).windows;

    // The reading is the last REAL request, not the synthetic zero that followed it.
    expect(window?.residentTokens).toBe(437_477);
    expect(window?.peakTokens).toBe(437_477);
    // Excluded, and SAID so — a silent exclusion is a number nobody can check.
    expect(window?.observationCount).toBe(2);
    expect(window?.syntheticObservations).toBe(1);
  });

  it('context-window-meter-reads-the-window-the-harness-is-writing: reports a peak that a later reading fell below — the quantity ADR-0248 chose because it CAN fall', async () => {
    writeWindow(
      'window-receding',
      [
        assistantLine({ windowId: 'window-receding', at: '2026-08-26T09:00:00.000Z', id: 'r1', tokens: 240_900 }),
        // A compaction: occupancy recedes. A monotonic billing total could never draw this.
        assistantLine({ windowId: 'window-receding', at: '2026-08-26T09:10:00.000Z', id: 'r2', tokens: 228_100 }),
      ],
      Date.parse('2026-08-26T09:10:00.000Z'),
    );

    const { body } = await get('/api/context-windows');
    const [window] = (body as { windows: { residentTokens: number; peakTokens: number }[] }).windows;
    expect(window?.residentTokens).toBe(228_100);
    expect(window?.peakTokens).toBe(240_900);
  });

  it('context-window-meter-reports-its-own-limits: orders by the last READING, not by the file’s mtime — so the ages printed down the list agree with it', async () => {
    // The window whose FILE is freshest but whose last request is oldest. A transcript is touched by
    // things that are not model requests, so mtime and last-reading genuinely diverge — observed on
    // this machine as ages reading 1m, 33m, 5h, 25m down a list captioned "newest first".
    writeWindow(
      'window-touched-late',
      [assistantLine({ windowId: 'window-touched-late', at: '2026-08-26T04:00:00.000Z', id: 't1', tokens: 60_000 })],
      Date.parse('2026-08-26T11:59:00.000Z'),
    );
    writeWindow(
      'window-active',
      [assistantLine({ windowId: 'window-active', at: '2026-08-26T11:00:00.000Z', id: 'a1', tokens: 70_000 })],
      Date.parse('2026-08-26T11:00:30.000Z'),
    );

    const { body } = await get('/api/context-windows');
    const payload = body as { windows: { windowId: string }[] };
    expect(payload.windows.map((w) => w.windowId)).toEqual(['window-active', 'window-touched-late']);
  });

  it('context-window-meter-reports-its-own-limits: orders windows newest-first and reports what it read against what it found', async () => {
    writeWindow(
      'window-old',
      [assistantLine({ windowId: 'window-old', at: '2026-08-20T09:00:00.000Z', id: 'o1', tokens: 50_000 })],
      Date.parse('2026-08-20T09:00:00.000Z'),
    );
    writeWindow(
      'window-new',
      [assistantLine({ windowId: 'window-new', at: '2026-08-26T09:00:00.000Z', id: 'n1', tokens: 90_000 })],
      Date.parse('2026-08-26T09:00:00.000Z'),
    );

    const { body } = await get('/api/context-windows');
    const payload = body as { windows: { windowId: string }[]; scan: { root: string; windowFilesFound: number; windowFilesRead: number } };
    expect(payload.windows.map((w) => w.windowId)).toEqual(['window-new', 'window-old']);
    expect(payload.scan.windowFilesFound).toBe(2);
    expect(payload.scan.windowFilesRead).toBe(2);
    // WHERE it looked, on the wire: "no windows" and "no transcripts under the root I was pointed
    // at" send an operator to different places.
    expect(payload.scan.root).toBe(transcriptRoot);
  });

  it('context-window-meter-reports-its-own-limits: answers an honest empty reading for a machine with no transcripts, never an error', async () => {
    const { status, body } = await get('/api/context-windows');
    const payload = body as { windows: unknown[]; scan: { windowFilesFound: number } };
    expect(status).toBe(200);
    expect(payload.windows).toEqual([]);
    expect(payload.scan.windowFilesFound).toBe(0);
  });
});

describe('GET /api/context-windows — helper windows are never folded in (ADR-0413 D2 / ADR-0452 D4)', () => {
  it('context-window-meter-never-folds-a-helper-into-a-window: reads each helper’s own peak and leaves the parent’s figure untouched by it', async () => {
    // Every line of a real helper transcript stamps the PARENT's session id and is a sidechain line.
    writeHelper('window-with-helpers', 'agent-a16b5d320d7caa8bd', [
      assistantLine({ windowId: 'window-with-helpers', at: '2026-08-26T10:01:00.000Z', id: 'h1', tokens: 40_000, isSidechain: true }),
      assistantLine({ windowId: 'window-with-helpers', at: '2026-08-26T10:02:00.000Z', id: 'h2', tokens: 71_000, isSidechain: true }),
    ]);
    writeHelper('window-with-helpers', 'agent-b4c92361d40107d6c', [
      assistantLine({ windowId: 'window-with-helpers', at: '2026-08-26T10:03:00.000Z', id: 'h3', tokens: 210_000, isSidechain: true }),
    ]);
    writeWindow(
      'window-with-helpers',
      [assistantLine({ windowId: 'window-with-helpers', at: '2026-08-26T10:00:00.000Z', id: 'p1', tokens: 150_000 })],
      Date.parse('2026-08-26T10:05:00.000Z'),
    );

    const { body } = await get('/api/context-windows');
    const payload = body as {
      windows: { residentTokens: number; peakTokens: number; helpersJoined: boolean; helpers: { file: string; peakTokens: number; requestCount: number }[] }[];
      scan: { helperFilesFound: number; helperFilesRead: number; helperFilesOnMachine: number };
    };
    const [window] = payload.windows;

    // THE FENCE: the parent reads exactly its own 150k. 150k + 71k + 210k = 431k is the number this
    // route must never produce, because no window was ever that full.
    expect(window?.residentTokens).toBe(150_000);
    expect(window?.peakTokens).toBe(150_000);

    expect(window?.helpersJoined).toBe(true);
    // Ordered by their own peaks, each with its OWN reading, identified by file (a helper window has
    // no id of its own — its lines carry the parent's).
    expect(window?.helpers.map((h) => [h.file, h.peakTokens, h.requestCount])).toEqual([
      ['agent-b4c92361d40107d6c.jsonl', 210_000, 1],
      ['agent-a16b5d320d7caa8bd.jsonl', 71_000, 2],
    ]);
    expect(payload.scan.helperFilesFound).toBe(2);
    expect(payload.scan.helperFilesRead).toBe(2);
    expect(payload.scan.helperFilesOnMachine).toBe(2);
  });

  it('context-window-meter-never-folds-a-helper-into-a-window: never counts a helper transcript as a session window of its own', async () => {
    writeHelper('window-alone', 'agent-only', [
      assistantLine({ windowId: 'window-alone', at: '2026-08-26T10:01:00.000Z', id: 'h1', tokens: 40_000, isSidechain: true }),
    ]);
    writeWindow(
      'window-alone',
      [assistantLine({ windowId: 'window-alone', at: '2026-08-26T10:00:00.000Z', id: 'p1', tokens: 10_000 })],
      Date.parse('2026-08-26T10:05:00.000Z'),
    );

    const { body } = await get('/api/context-windows');
    const payload = body as {
      windows: { windowId: string }[];
      scan: { windowFilesFound: number; helperFilesOnMachine: number };
    };
    // ONE session window. The helper is under `subagents/` and is not one, however many readings it
    // carries — counting it would inflate the population the widget claims to show. It IS counted as
    // a helper transcript on the machine, which is the number that keeps "no helper windows" and
    // "none under what I looked at" distinguishable.
    expect(payload.windows.map((w) => w.windowId)).toEqual(['window-alone']);
    expect(payload.scan.windowFilesFound).toBe(1);
    expect(payload.scan.helperFilesOnMachine).toBe(1);
  });
});

describe('GET /api/context-windows?session=<id> — the replay panel\u2019s bar (ADR-0456 D2)', () => {
  it('serves ONE window\u2019s whole series, with the instants a playhead needs', async () => {
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
  it('context-window-meter-reports-its-own-limits: refuses a write by name: a transcript is the harness’s own record', async () => {
    const res = await fetch(`${base}/api/context-windows`, { method: 'POST' });
    expect(res.status).toBe(405);
    expect((JSON.parse(await res.text()) as { error: string }).error).toMatch(/read-only/);
  });

  it('context-window-meter-reports-its-own-limits: primes without throwing, and priming and the route read the same body', async () => {
    writeWindow(
      'window-primed',
      [assistantLine({ windowId: 'window-primed', at: '2026-08-26T10:00:00.000Z', id: 'p1', tokens: 33_000 })],
      Date.parse('2026-08-26T10:00:00.000Z'),
    );
    await expect(primeContextWindows()).resolves.toBeUndefined();
    const direct = await readContextWindows();
    const { body } = await get('/api/context-windows');
    expect(body).toEqual(JSON.parse(JSON.stringify(direct)));
  });
});
