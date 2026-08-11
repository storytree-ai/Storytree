// Integration tests for GET /api/traversal + /api/traversal/sessions (traversalApi.ts handleTraversal)
// over a REAL node:http server — the claimsApi.integration.test.ts pattern, with no backend stub at all
// because this route has no backend: its source of truth is a directory of JSONL files.
//
// REAL COLLABORATORS THROUGHOUT. Fixtures are written through the capture sink's own
// `appendTraversalEvents` into a temp dir (never a hand-shaped file), the corrupt line is appended as
// raw bytes the way a crash-truncated write lands on disk, and the payload is compared against what the
// REAL `replayTraversalSessionAllAdapters` returns — so these prove the WIRING lands the composition's
// actual output, not a re-test of the composition's own (already-covered) replay logic.
//
// The trace dir is pointed at the temp dir via `STORYTREE_TRAVERSAL_DIR`, which is also the documented
// operator override — so the env path the handler resolves through is itself under test rather than
// bypassed by an injected directory.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { appendTraversalEvents, computeDecisionPoints } from '@storytree/context-traversal-capture';
import { replayTraversalSessionAllAdapters } from '@storytree/context-traversal-spawn';

import { handleTraversal } from './traversalApi';
import { HttpError } from './httpUtil';

const SESSION = 'session-under-test';
const CHILD = 'session-under-test-child';

let traceDir: string;
let priorTraceDir: string | undefined;
let server: Server;
let base: string;

function traceFile(dir: string, sessionId: string): string {
  return path.join(dir, `${sessionId}.jsonl`);
}

/**
 * A mixed fixture through the real sink: one terminal read event plus a build-spawn triple, under one
 * session. The `spawn_handoff` carries increment 1's `model`/`runtime` (PR #1272) so the lane the panel
 * draws is honestly attributed, and the `model_context` carries NO `residentInputTokens` — the shape a
 * never-ingested session actually has, which is what the occupancy honesty below is about.
 */
function writeFixture(dir: string, sessionId: string): void {
  const ok = appendTraversalEvents(
    [
      {
        kind: 'front_matter_read',
        eventId: 'event:visit-1',
        sessionId,
        visitId: 'visit-1',
        nodeId: 'node-a',
        surfaceId: 'tree',
        at: '2026-08-11T10:00:00.000Z',
      },
      {
        kind: 'full_payload_read',
        eventId: 'event:visit-2',
        sessionId,
        visitId: 'visit-2',
        nodeId: 'node-b',
        surfaceId: 'library-artifact',
        parentVisitId: 'visit-1',
        at: '2026-08-11T10:00:01.000Z',
      },
      {
        kind: 'spawn_handoff',
        eventId: 'event:spawn-1',
        sessionId,
        at: '2026-08-11T10:00:02.000Z',
        edgeId: 'edge-1',
        parentSessionId: sessionId,
        childSessionId: CHILD,
        agentType: 'explorer',
        model: 'claude-opus-5',
        runtime: 'sdk-leaf',
      },
      {
        kind: 'model_context',
        eventId: 'event:model-1',
        sessionId,
        at: '2026-08-11T10:00:03.000Z',
        cumulativeInputTokens: 1_500,
        addedInputTokens: 1_500,
      },
      {
        kind: 'result_return',
        eventId: 'event:result-1',
        sessionId,
        at: '2026-08-11T10:00:04.000Z',
        edgeId: 'edge-1',
        parentSessionId: sessionId,
        childSessionId: CHILD,
        ok: true,
      },
    ],
    { dir, sessionId },
  );
  expect(ok).toBe(true);
}

beforeAll(async () => {
  priorTraceDir = process.env['STORYTREE_TRAVERSAL_DIR'];
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    void handleTraversal(req, res, url).catch((err: unknown) => {
      // apiRouter's central HttpError mapping, inlined like claimsApi.integration.test.ts.
      res.statusCode = err instanceof HttpError ? err.status : 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  if (priorTraceDir === undefined) delete process.env['STORYTREE_TRAVERSAL_DIR'];
  else process.env['STORYTREE_TRAVERSAL_DIR'] = priorTraceDir;
  fs.rmSync(traceDir, { recursive: true, force: true });
});

beforeEach(() => {
  // A FRESH dir per test: the handler resolves the env var on every request, so each test gets its own
  // trace world and none can be polluted by a sibling's fixture (or by this operator's real traces).
  fs.rmSync(traceDir ?? '', { recursive: true, force: true });
  traceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-traversal-route-'));
  process.env['STORYTREE_TRAVERSAL_DIR'] = traceDir;
});

describe('GET /api/traversal?session=<id>', () => {
  it('replays a known session to the shape the real composition returns, coverage and skipped count included', async () => {
    writeFixture(traceDir, SESSION);

    const res = await fetch(`${base}/api/traversal?session=${SESSION}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    // The WIRE is the composition's output — proves the wiring, and pins that the route serves the
    // STRUCTURED replay rather than the rendered text `storytree traversal show` prints. Plus the ONE
    // thing the route composes on top: `computeDecisionPoints` over the same events, so the panel's
    // offer fans and `storytree traversal show` read the identical join rather than two copies of it.
    const view = replayTraversalSessionAllAdapters(SESSION, { dir: traceDir });
    const expected = JSON.parse(
      JSON.stringify({ ...view, decisionPoints: computeDecisionPoints(view.events) }),
    ) as unknown;
    expect(body).toEqual(expected);

    expect(body['sessionId']).toBe(SESSION);
    expect(body['skipped']).toBe(0);
    expect(body['partial']).toBe(false);

    // Chronological, every event kind present, nothing dropped — the panel plots this list directly.
    const events = body['events'] as { kind: string; at: string }[];
    expect(events.map((e) => e.kind)).toEqual([
      'front_matter_read',
      'full_payload_read',
      'spawn_handoff',
      'model_context',
      'result_return',
    ]);

    // The depth edge the panel indents on exists ONLY because `parentVisitId` was on the event —
    // never inferred from adjacency (ADR-0235 clause 3).
    expect(body['relationships']).toEqual([
      { fromId: 'visit-1', toId: 'visit-2', kind: 'parent_visit' },
    ]);

    // Increment 1's lane attribution survives the wire: a lane can name the model it ran on.
    const spawn = events[2] as unknown as { agentType: string; model?: string; runtime?: string };
    expect(spawn.agentType).toBe('explorer');
    expect(spawn.model).toBe('claude-opus-5');
    expect(spawn.runtime).toBe('sdk-leaf');
  });

  it('carries the payload’s own honesty: both adapter coverage declarations and the caveats ride with it', async () => {
    writeFixture(traceDir, SESSION);

    const res = await fetch(`${base}/api/traversal?session=${SESSION}`);
    const body = (await res.json()) as Record<string, unknown>;

    // Coverage is what makes the picture readable: the panel must be able to say which event kinds and
    // fields its adapters CANNOT see. Both declarations, with both sides — never one adapter, never one
    // side (ADR-0235 clause 6).
    const coverage = body['coverage'] as { adapterId: string; supported: string[]; omitted: string[] }[];
    expect(coverage.length).toBeGreaterThanOrEqual(2);
    for (const declaration of coverage) {
      expect(declaration.supported.length + declaration.omitted.length).toBeGreaterThan(0);
      expect(declaration.omitted.length).toBeGreaterThan(0);
    }
    // The event kinds this trace visibly carries must be supported by SOME declaration — a payload
    // whose coverage denied what its own events show would be the self-denial clause 6 forbids.
    const unionSupported = new Set(coverage.flatMap((d) => d.supported));
    for (const feature of [
      'event:front_matter_read',
      'event:full_payload_read',
      'event:spawn_handoff',
      'event:model_context',
      'event:result_return',
    ]) {
      expect(unionSupported).toContain(feature);
    }

    // The caveats the closed feature enum cannot state (ADR-0260 D7) — a coverage list alone would let
    // the panel present a thin picture as a complete one.
    const caveats = body['coverageCaveats'] as { id: string; note: string }[];
    expect(caveats.length).toBeGreaterThan(0);
    for (const caveat of caveats) {
      expect(caveat.id.length).toBeGreaterThan(0);
      expect(caveat.note.length).toBeGreaterThan(0);
    }
  });

  it('reports an unobserved occupancy series as unobserved — never as zeros', async () => {
    writeFixture(traceDir, SESSION);

    const res = await fetch(`${base}/api/traversal?session=${SESSION}`);
    const body = (await res.json()) as Record<string, unknown>;

    // This fixture's `model_context` carries no `residentInputTokens`, which is what EVERY
    // never-ingested session looks like: occupancy comes from the host-transcript adapter, and that
    // adapter is not ambient (`storytree traversal ingest <sessionId>`, ADR-0248 D1). The route must
    // say so rather than hand the bar a zero series it would draw as an empty window.
    const occupancy = body['occupancy'] as {
      modelContextCount: number;
      observationCount: number;
      declared: boolean;
      note: string;
    };
    expect(occupancy.modelContextCount).toBe(1);
    expect(occupancy.observationCount).toBe(0);
    expect(occupancy.note).toContain('no occupancy series');
    expect(occupancy.note).toContain('Absence is unobserved, never zero');
    // No adapter this composition installs claims per-request occupancy, so the payload says that too.
    expect(occupancy.declared).toBe(false);
  });

  it('counts an ingested occupancy observation, and still reports it as undeclared by these adapters', async () => {
    writeFixture(traceDir, SESSION);
    // What `traversal ingest` appends: a per-REQUEST observation carrying resident tokens. Written
    // through the same real sink, so it is a genuinely parseable event and not a shaped literal.
    const ok = appendTraversalEvents(
      [
        {
          kind: 'model_context',
          eventId: 'event:model-occupancy',
          sessionId: SESSION,
          at: '2026-08-11T10:00:05.000Z',
          windowId: 'window-1',
          modelId: 'claude-opus-5',
          cumulativeInputTokens: 2_000,
          addedInputTokens: 2_000,
          residentInputTokens: 240_900,
          contextWindowCapacity: 500_000,
        },
      ],
      { dir: traceDir, sessionId: SESSION },
    );
    expect(ok).toBe(true);

    const res = await fetch(`${base}/api/traversal?session=${SESSION}`);
    const body = (await res.json()) as Record<string, unknown>;
    const occupancy = body['occupancy'] as { observationCount: number; declared: boolean; note: string };

    expect(occupancy.observationCount).toBe(1);
    // The inverse honesty, and the reason `declared` is computed rather than asserted: the occupancy is
    // really there, and NO declaration on this replay covers it — the producing adapter's own
    // declaration is not part of this composition yet. Saying both is the honest answer; smoothing
    // either side would be a claim the trace does not support.
    expect(occupancy.declared).toBe(false);
    expect(occupancy.note).toContain('1 of 2 model_context observation(s) carry residentInputTokens');
    expect(occupancy.note).toContain('field:resident_input_tokens');
  });

  it('reports a corrupt line in skipped rather than dropping it silently', async () => {
    writeFixture(traceDir, SESSION);
    fs.appendFileSync(traceFile(traceDir, SESSION), 'this is not json at all\n', { encoding: 'utf8' });

    const res = await fetch(`${base}/api/traversal?session=${SESSION}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    // The count is the whole point (ADR-0241 D5): a truncated trace served as complete would let the
    // panel present a partial picture as the session's full history.
    expect(body['skipped']).toBe(1);
    expect(body['partial']).toBe(true);
    // Every good event still replays — the corrupt line is skipped, not the file.
    expect((body['events'] as unknown[]).length).toBe(5);
  });

  it('404s an unknown session id rather than serving an empty replay', async () => {
    writeFixture(traceDir, SESSION);

    const res = await fetch(`${base}/api/traversal?session=no-such-session`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('no readable trace');
    expect(body.error).toContain('no-such-session');
  });

  it('400s a missing session param, and refuses a session id that is not a flat token', async () => {
    const missing = await fetch(`${base}/api/traversal`);
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toContain('session=<sessionId>');

    // The id becomes a FILENAME inside the trace dir, so a separator or `..` segment would be a
    // filesystem escape. Refused before any read — never normalised into something that resolves.
    for (const evil of ['../../../etc/passwd', '..', 'a/b', 'a\\b']) {
      const res = await fetch(`${base}/api/traversal?session=${encodeURIComponent(evil)}`);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toContain('invalid session id');
    }
  });

  it('refuses a non-GET — a trace is an observation record, not something a UI writes', async () => {
    const res = await fetch(`${base}/api/traversal?session=${SESSION}`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});

describe('GET /api/traversal/sessions', () => {
  it('lists the sessions with a readable trace, newest-observed timestamp included', async () => {
    writeFixture(traceDir, SESSION);
    writeFixture(traceDir, 'session-second');

    const res = await fetch(`${base}/api/traversal/sessions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dir: string;
      sessions: { sessionId: string; eventCount: number; lastObservedAt: string | null }[];
    };

    expect(body.dir).toBe(traceDir);
    expect(body.sessions.map((s) => s.sessionId).sort()).toEqual(['session-second', SESSION]);
    for (const session of body.sessions) {
      expect(session.eventCount).toBe(5);
      expect(session.lastObservedAt).toBe('2026-08-11T10:00:04.000Z');
    }
  });

  it('answers an EMPTY list for a trace dir with no traces, rather than erroring', async () => {
    const res = await fetch(`${base}/api/traversal/sessions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dir: string; sessions: unknown[] };
    // A machine that has captured nothing yet is a normal state — and so is the hosted container,
    // which captures nothing ever (traces are local by the owner's 2026-08-10 decision). The dir rides
    // along so "no sessions" is distinguishable from "nothing under the directory I was pointed at".
    expect(body.sessions).toEqual([]);
    expect(body.dir).toBe(traceDir);
  });

  it('answers an EMPTY list for a trace dir that does not exist at all', async () => {
    const absent = path.join(traceDir, 'nested', 'never-created');
    process.env['STORYTREE_TRAVERSAL_DIR'] = absent;

    const res = await fetch(`${base}/api/traversal/sessions`);
    expect(res.status).toBe(200);
    expect((await res.json()) as { sessions: unknown[] }).toEqual({ dir: absent, sessions: [] });
  });

  // The route answers from an incremental index keyed on each trace's mtime+size (increment
  // `traversal-panel-index-read`, traversalIndexMemo.ts — where the memo's own semantics are proved
  // directly). THIS asserts the property END TO END over real HTTP, because it is the one a cache
  // can silently break and the one an operator would meet: the panel is open while their own live
  // session keeps appending, and a second request must see what the first could not.
  it('reflects a trace appended to AFTER an earlier request already answered', async () => {
    writeFixture(traceDir, SESSION);

    const first = (await (await fetch(`${base}/api/traversal/sessions`)).json()) as {
      sessions: { sessionId: string; eventCount: number; lastObservedAt: string | null }[];
    };
    expect(first.sessions).toHaveLength(1);
    expect(first.sessions[0]?.eventCount).toBe(5);
    expect(first.sessions[0]?.lastObservedAt).toBe('2026-08-11T10:00:04.000Z');

    // A live session appends one more visit through the sink — how a trace genuinely grows.
    expect(
      appendTraversalEvents(
        [
          {
            kind: 'front_matter_read',
            eventId: 'event:visit-appended',
            sessionId: SESSION,
            visitId: 'visit-appended',
            nodeId: 'node-c',
            surfaceId: 'tree',
            at: '2026-08-11T18:00:00.000Z',
          },
        ],
        { dir: traceDir, sessionId: SESSION },
      ),
    ).toBe(true);

    const second = (await (await fetch(`${base}/api/traversal/sessions`)).json()) as {
      sessions: { sessionId: string; eventCount: number; lastObservedAt: string | null }[];
    };
    expect(second.sessions[0]?.eventCount).toBe(6);
    expect(second.sessions[0]?.lastObservedAt).toBe('2026-08-11T18:00:00.000Z');
  });

  it('sees a trace file that did not exist when an earlier request answered', async () => {
    const empty = (await (await fetch(`${base}/api/traversal/sessions`)).json()) as {
      sessions: unknown[];
    };
    expect(empty.sessions).toEqual([]);

    writeFixture(traceDir, 'session-arrived-later');

    const after = (await (await fetch(`${base}/api/traversal/sessions`)).json()) as {
      sessions: { sessionId: string }[];
    };
    expect(after.sessions.map((s) => s.sessionId)).toEqual(['session-arrived-later']);
  });
});
