// Proves the two decisions the detached studio launcher (scripts/studio.mjs) makes about the port:
//
//  1. WHOSE server is it? `up`/`status` must answer "is it MINE", not merely "is something up" — a
//     port answering 200 is evidence only that SOMETHING on it is healthy, and the two diverge
//     exactly when a sibling session already holds :5173. Identity comes from the server's own `pid`
//     stamp (apiRouter.ts handleHealth) compared against the pid this launcher spawned. Covered as a
//     pure truth table AND over a real HTTP round-trip against a real SECOND PROCESS, since the
//     defect only exists when two servers are in play.
//  2. WHICH pid holds it, for the orphan reap — `studio:down` must stop whatever actually HOLDS
//     :5173, not just the pid in .studio.pid, so the PID extraction from `netstat -ano` has to pick
//     exactly the right LISTENING pids.
//
// Plus `tailSinceMarker`: a failed startup must be diagnosed from THIS run's log lines, never the
// previous attempt's, in an append-only log.
//
// The launcher is plain Node ESM (no tsx/deps, runs before install); its main() is guarded so this
// test imports the pure helpers without launching or killing anything. (apps/* is outside the
// check:boundaries scan, so this cross-root import is fine.)
import { describe, it, expect, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  parseListeningPids,
  classifyListener,
  probeHealth,
  tailSinceMarker,
  RUN_MARKER,
} from '../../../scripts/studio.mjs';

// A representative Windows `netstat -ano` slice: the dev server listening on both IPv4 and IPv6 (same
// pid), plus decoys that must NOT match — an ESTABLISHED connection, a DIFFERENT port (:51730, the
// `:5173` prefix trap), another service (:5432), and a UDP row.
const NETSTAT = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:5173           0.0.0.0:0              LISTENING       63736
  TCP    [::1]:5173             [::]:0                 LISTENING       63736
  TCP    127.0.0.1:51730        127.0.0.1:443         ESTABLISHED     999
  TCP    0.0.0.0:51730          0.0.0.0:0             LISTENING       4242
  TCP    0.0.0.0:5432           0.0.0.0:0             LISTENING       777
  UDP    0.0.0.0:5173           *:*                                   8888
`;

describe('parseListeningPids', () => {
  it('extracts the LISTENING pid for the port, deduped across IPv4 + IPv6', () => {
    expect(parseListeningPids(NETSTAT, 5173)).toEqual([63736]);
  });

  it('does not match a port that merely shares a prefix (:51730 ≠ :5173)', () => {
    expect(parseListeningPids(NETSTAT, 5173)).not.toContain(4242);
  });

  it('ignores non-LISTENING rows (ESTABLISHED) and UDP', () => {
    // 999 (ESTABLISHED on :51730) and 8888 (UDP :5173) must never appear for any port.
    const all = parseListeningPids(NETSTAT, 5173);
    expect(all).not.toContain(999);
    expect(all).not.toContain(8888);
  });

  it('finds a different port when asked', () => {
    expect(parseListeningPids(NETSTAT, 5432)).toEqual([777]);
    expect(parseListeningPids(NETSTAT, 51730)).toEqual([4242]); // the LISTENING one only
  });

  it('returns [] when nothing listens on the port (and for empty input)', () => {
    expect(parseListeningPids(NETSTAT, 9999)).toEqual([]);
    expect(parseListeningPids('', 5173)).toEqual([]);
  });
});

describe('classifyListener', () => {
  it('is idle when nothing answers — the pid file is irrelevant then', () => {
    expect(classifyListener({ recordedPid: 4242, serving: false, healthPid: null })).toBe('idle');
    expect(classifyListener({ recordedPid: null, serving: false, healthPid: null })).toBe('idle');
  });

  it('is ours only when the ANSWERING pid is the one we recorded', () => {
    expect(classifyListener({ recordedPid: 4242, serving: true, healthPid: 4242 })).toBe('ours');
  });

  it('is foreign when a different pid answers — the measured near-miss', () => {
    // The 2026-08-02 shape: our listen() died on EADDRINUSE and a sibling's healthy server answered
    // in its place. The port says "up"; only the pid says "not yours".
    expect(classifyListener({ recordedPid: 4242, serving: true, healthPid: 36400 })).toBe('foreign');
  });

  it('is foreign — never ours — when this checkout has no pid file at all', () => {
    // A second checkout starts nothing, so whatever holds the port is by definition not its server.
    // Absence of a pid file must not read as "no conflict".
    expect(classifyListener({ recordedPid: null, serving: true, healthPid: 36400 })).toBe('foreign');
  });

  it('is unidentified — not ours — when the answer carries no pid', () => {
    // A pre-stamp studio, a plain Vite 404, or something else entirely. "Cannot tell" is its own
    // verdict; collapsing it into either side is exactly the wrong answer this unit exists to stop.
    for (const healthPid of [null, undefined, 0, -1, 'abc', 1.5]) {
      expect(classifyListener({ recordedPid: 4242, serving: true, healthPid })).toBe('unidentified');
    }
  });

  it('never calls a listener ours on a malformed pid file', () => {
    expect(classifyListener({ recordedPid: null, serving: true, healthPid: 4242 })).toBe('foreign');
    expect(classifyListener({ recordedPid: undefined, serving: true, healthPid: 4242 })).toBe('foreign');
  });
});

// ---------- probeHealth over REAL HTTP ----------
//
// The defect is only observable with two servers in play, so the foreign case runs against a genuine
// SECOND OS PROCESS with a genuine different pid — not a stub. Both servers answer the health
// ENVELOPE shape; that the real handler fills `pid` with its own process id is proven next door in
// healthApi.integration.test.ts.

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const stop of cleanups) stop();
});

/** A health endpoint in THIS process — so its pid is `process.pid`. */
async function serveHereWith(body: unknown): Promise<string> {
  const server: Server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** A health endpoint in a SEPARATE process — a real foreign listener with a real foreign pid. */
async function serveInChildProcess(): Promise<{ base: string; pid: number }> {
  const src = [
    "const http = require('node:http');",
    'const s = http.createServer((req, res) => {',
    "  res.setHeader('Content-Type', 'application/json');",
    "  res.end(JSON.stringify({ store: 'pg', db: 'ok', pid: process.pid }));",
    '});',
    "s.listen(0, '127.0.0.1', () => console.log('READY ' + s.address().port));",
  ].join('\n');
  const child: ChildProcess = spawn(process.execPath, ['-e', src], {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  cleanups.push(() => child.kill());
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child health server never reported READY')), 15_000);
    let buf = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      const m = /READY (\d+)/.exec(buf);
      if (m?.[1]) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
  return { base: `http://127.0.0.1:${port}`, pid: child.pid as number };
}

describe('probeHealth', () => {
  it('reads the answering process\'s own pid off the wire', async () => {
    const base = await serveHereWith({ store: 'pg', db: 'ok', pid: process.pid });
    expect(await probeHealth(base, 5000)).toEqual({ serving: true, pid: process.pid });
  });

  it('a REAL second process is classified foreign against the pid we recorded', async () => {
    // The whole unit in one assertion: two concurrent healthy servers, and the launcher must not
    // measure the other one as its own.
    const foreign = await serveInChildProcess();
    expect(foreign.pid).not.toBe(process.pid);
    const probe = await probeHealth(foreign.base, 5000);
    expect(probe).toEqual({ serving: true, pid: foreign.pid });
    expect(classifyListener({ recordedPid: process.pid, serving: probe.serving, healthPid: probe.pid })).toBe('foreign');
    // ...and the same probe against the pid that DID answer is the accept path, so the check is a
    // comparison, not a blanket refusal.
    expect(classifyListener({ recordedPid: foreign.pid, serving: probe.serving, healthPid: probe.pid })).toBe('ours');
  });

  it('reports serving-without-identity when the envelope carries no pid (a pre-stamp studio)', async () => {
    const base = await serveHereWith({ store: 'pg', db: 'ok', code: { stale: true } });
    expect(await probeHealth(base, 5000)).toEqual({ serving: true, pid: null });
  });

  it('still reports serving when the body is not JSON at all (a plain Vite 404)', async () => {
    const server: Server = createServer((_req, res) => {
      res.statusCode = 404;
      res.end('<html>not found</html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => server.close());
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // `serving` keeps its old "is the port busy" meaning — only identity is new.
    expect(await probeHealth(base, 5000)).toEqual({ serving: true, pid: null });
  });

  it('reports not-serving (never throws) when nothing is on the port', async () => {
    // Bind then release, so the port is real but certainly closed.
    const server: Server = createServer(() => {});
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await probeHealth(`http://127.0.0.1:${port}`, 1000)).toEqual({ serving: false, pid: null });
  });
});

describe('tailSinceMarker', () => {
  const log = [
    `${RUN_MARKER}2026-08-01T00:00:00.000Z ---`,
    'PREVIOUS run line 1',
    'Error: listen EADDRINUSE: address already in use :::5173',
    `${RUN_MARKER}2026-08-03T00:00:00.000Z ---`,
    'current run line 1',
    'current run line 2',
  ].join('\n');

  it('returns only the CURRENT run — a previous attempt\'s failure can never be misread as this one', () => {
    const tail = tailSinceMarker(log, RUN_MARKER, 20);
    expect(tail).toContain('current run line 1');
    expect(tail).toContain('current run line 2');
    expect(tail).not.toContain('PREVIOUS run line 1');
    expect(tail).not.toContain('EADDRINUSE'); // the exact stale line that disguised the measured incident
  });

  it('caps the current run at `lines`, counting within the run only', () => {
    const many = [`${RUN_MARKER}x ---`, ...Array.from({ length: 50 }, (_, i) => `line ${i}`)].join('\n');
    expect(tailSinceMarker(many, RUN_MARKER, 3).split('\n')).toEqual(['line 47', 'line 48', 'line 49']);
  });

  it('falls back to a plain tail when the log carries no marker', () => {
    expect(tailSinceMarker('a\nb\nc', RUN_MARKER, 2)).toBe('b\nc');
    expect(tailSinceMarker('', RUN_MARKER, 5)).toBe('');
  });
});
