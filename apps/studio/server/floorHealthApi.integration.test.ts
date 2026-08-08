// Integration tests for GET /api/floor-health (apiRouter.ts handleFloorHealth) over a REAL node:http
// server with an in-memory document store — no DB, no Vite (the arcsApi/claimsApi pattern).
//
// The contract under test is ADR-0316 D5's: the studio serves the SAME reading `storytree factory
// health` prints under "THE READING". So these assert the endpoint's payload against
// `loadFloorHealthReading` from @storytree/drive — the CLI's own composition — rather than against a
// hand-shaped literal. A handler that ever starts deriving a figure of its own goes RED here.
//
// The other half is what the endpoint must REFUSE: it carries no filing / session / report volume,
// and it sets no loud/quiet threshold. Both are load-bearing. The volume rule is what closed
// `factory-self-load-tune-the-guidance-loop-back-to-evidence-arc` (ADR-0316 D3), and a threshold
// decided server-side would put the band's one undecided call where no reader of the band can see it
// (ADR-0316 D4 keeps the instrument to measuring).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { loadFloorHealthReading } from '@storytree/drive';
import type { StoredDoc, StoreEvent } from '@storytree/storage-protocol';

import { handleFloorHealth } from './apiRouter';
import { HttpError } from './httpUtil';

const LOUD_ID = 'a-live-guardrail-that-keeps-firing';

// A hand-rolled store rather than InMemoryStore: a reinforcement is attributed to the route STANDING
// WHEN IT LANDED, so the route event's timestamp is the fixture. InMemoryStore stamps `at` with the
// wall clock, which dates every route to today and reads every reinforcement as pre-route.
const DOCS: StoredDoc[] = [
  {
    id: LOUD_ID,
    kind: 'friction',
    doc: {
      title: LOUD_ID,
      route: 'guardrail',
      reinforcedBy: ['2026-07-11', '2026-07-12', '2026-07-16', '2026-07-28'].map((date) => ({
        branch: 'claude/x',
        date,
        evidence: '`e`',
      })),
    },
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
  },
];
const EVENTS: StoreEvent[] = [
  { seq: 1, id: LOUD_ID, kind: 'friction', type: 'created', doc: {}, actor: 'cli', at: '2026-07-11T09:00:00.000Z' },
  {
    seq: 2,
    id: LOUD_ID,
    kind: 'friction',
    type: 'updated',
    doc: { route: 'guardrail' },
    actor: 'cli',
    at: '2026-07-11T13:54:04.888Z',
  },
];

const store = {
  queryDocs: async (filter?: { kind?: string }) =>
    DOCS.filter((d) => filter?.kind === undefined || d.kind === filter.kind),
  readEvents: async () => EVENTS,
};

// Flipped per test: `null` is the offline json backend, which holds no friction tier to read.
let storeResult: typeof store | null = store;

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    void handleFloorHealth(req, res, {
      // The backend seam is structurally typed here: the handler only ever calls `docStore()`.
      backend: { docStore: async () => storeResult } as never,
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
});

describe('/api/floor-health', () => {
  it('serves the SAME reading the CLI composes — not a second derivation', async () => {
    storeResult = store;
    const res = await fetch(`${base}/api/floor-health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reading: unknown };

    const expected = await loadFloorHealthReading(store);
    expect(body.reading).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  it('carries the loudest DISTINCT cause with its window and collapsing rule (ADR-0316 D2/D3)', async () => {
    storeResult = store;
    const { reading } = (await (await fetch(`${base}/api/floor-health`)).json()) as {
      reading: Record<string, unknown>;
    };
    const loudest = reading['loudest'] as { cause: string; recurrences: number; route: string };
    expect(loudest.cause).toBe(LOUD_ID);
    // Recurrences on ONE distinct cause — the only number this wire carries.
    expect(loudest.recurrences).toBe(3);
    expect(loudest.route).toBe('guardrail');
    expect(Object.hasOwn(reading, 'window')).toBe(true);
    expect(String(reading['collapsingRule']).length).toBeGreaterThan(0);
  });

  it('carries no filing / session / report volume field, at any depth', async () => {
    storeResult = store;
    const { reading } = (await (await fetch(`${base}/api/floor-health`)).json()) as { reading: unknown };
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === 'object')
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          walk(v);
        }
    };
    walk(reading);
    for (const forbidden of ['allFilings', 'filings', 'archived', 'discharged', 'sessions', 'reports', 'total']) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it('decides NO threshold — the wire carries the figure, the band reads it (ADR-0316 D4)', async () => {
    storeResult = store;
    const { reading } = (await (await fetch(`${base}/api/floor-health`)).json()) as {
      reading: Record<string, unknown>;
    };
    // No `loud`, no `state`, no `severity`: nothing here has already decided what the figure MEANS.
    for (const verdict of ['loud', 'quiet', 'state', 'severity', 'threshold', 'alert']) {
      expect(Object.hasOwn(reading, verdict)).toBe(false);
    }
  });

  it('distinguishes "no store" from "a quiet floor": the reading answers null', async () => {
    // The offline json backend has no document store at all. `reading: null` is the honest answer —
    // a band that rendered a missing instrument as "all clear" is the exact failure it exists to
    // avoid, so the two must not collapse into one payload.
    storeResult = null;
    const res = await fetch(`${base}/api/floor-health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reading: null });
  });

  it('refuses a write — the band reports, it does not adjudicate (ADR-0316 D4)', async () => {
    storeResult = store;
    const res = await fetch(`${base}/api/floor-health`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});
