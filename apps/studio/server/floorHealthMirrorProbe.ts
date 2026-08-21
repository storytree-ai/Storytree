/**
 * The STUDIO half of the `GET /api/floor-health` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it prints the `{ status, body }` this
 * surface serves for each request in a fixture, so the gate can diff it against the desktop's
 * hand-written copy of the same route.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app. That is the whole point of the design: the desktop may never import
 * apps/studio/server (ADR-0176's one-wired-backend rule, enforced by `check:boundaries`), so the
 * comparison is made on decoded JSON by a third party rather than by one surface reaching into the
 * other.
 *
 * WHY IT DRIVES `handleApiRequest` AND NOT `handleFloorHealth`. What is hand-copied on this route is
 * its ENVELOPE, and half of that envelope is expressed as a STATUS: the 405 that makes report-only a
 * decision rather than an omission (ADR-0316 D4). `handleFloorHealth` THROWS that; the central error
 * mapping in `handleApiRequest` turns it into an answer. Calling the handler directly would have
 * forced this probe to re-implement that mapping, which puts the thing under test inside the
 * instrument measuring it. The dispatcher's own catch is what runs here.
 *
 * WHY THE FIXTURE STORE IS HAND-ROLLED RATHER THAN AN `InMemoryStore`, on BOTH surfaces. A
 * reinforcement is attributed to the route STANDING WHEN IT LANDED, read off the event log's
 * timestamps (drive's `RECURRENCE_ATTRIBUTION_RULE`). The `Store` seam's `appendEvent` accepts no
 * `at` — every implementation stamps its own — so a store that RECORDED the fixture's events would
 * date every route to today and read every reinforcement as PRE-route, leaving `loudest` absent and
 * the interesting half of the reading unexercised. Worse for a MIRROR comparison specifically: the
 * two probes run in separate processes at different moments, so a wall-clock stamp is nondeterminism
 * ACROSS the two payloads being compared. Serving the fixture's docs and events VERBATIM makes the
 * whole comparison deterministic. (The studio's own floorHealthApi.integration.test.ts carries the
 * same fixture for the first of those two reasons.)
 *
 * The store is INPUT, not the subject: the reading itself is shared code — `loadFloorHealthReading`
 * in @storytree/drive, which BOTH surfaces call — so what is compared is each surface's envelope
 * around one composition. This probe's store and the desktop probe's are interchangeable by
 * construction: both serve the same fixture arrays and neither computes anything.
 *
 * Contract (shared with the desktop probe, apps/desktop/src/backend/floor-health-mirror-probe.ts):
 *   argv: one or more absolute fixture JSON PATHS, each holding
 *         `{ docs: StoredDoc[] | null, events: StoreEvent[], requests: { label, method, path }[] }`
 *         (`docs: null` means wire NO document store — the advisory-absence arm)
 *   stdout: a single JSON object `{ [fixturePath]: { [label]: { status, body } } }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 *
 * The answers are printed VERBATIM: the third party owns the projection into comparable entries
 * (`projectFloorHealthPayload` in packages/cli/src/mirror-conformance.ts), so the two probes cannot
 * drift in how they reshape what they measured.
 */

import { readFileSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { handleApiRequest, type ApiContext } from './apiRouter.js';

/** The shared fixture shape — the store's two reads (null docs = no store) plus the requests. */
interface FloorHealthFixture {
  docs: { id: string; kind: string; doc: unknown; createdAt: string; updatedAt: string }[] | null;
  events: {
    seq: number;
    id: string;
    kind: string;
    type: 'created' | 'updated' | 'deleted';
    doc: unknown;
    actor: string;
    at: string;
  }[];
  requests: { label: string; method: string; path: string }[];
}

/**
 * A read-only document store serving the fixture VERBATIM — see the header for why nothing here may
 * stamp its own timestamps.
 *
 * Only `queryDocs` and `readEvents` are on this route (`loadFloorHealthReading` reads nothing else).
 * The other four throw: floor-health is report-only by ADR-0316 D4, so a route that ever started
 * writing — or reaching for a doc by id — must break the probe LOUDLY rather than quietly widening
 * what this comparison covers. Fail-closed is the harness's discipline throughout.
 */
function fixtureStore(fixture: FloorHealthFixture) {
  const offPath = (name: string) => (): never => {
    throw new Error(`floorHealthMirrorProbe: GET /api/floor-health must not call ${name}`);
  };
  return {
    queryDocs: async (filter?: { kind?: string }) =>
      (fixture.docs ?? []).filter((d) => filter?.kind === undefined || d.kind === filter.kind),
    readEvents: async (filter?: { id?: string }) =>
      fixture.events.filter((e) => filter?.id === undefined || e.id === filter.id),
    upsertDoc: offPath('upsertDoc'),
    getDoc: offPath('getDoc'),
    deleteDoc: offPath('deleteDoc'),
    appendEvent: offPath('appendEvent'),
  };
}

/** Capture the status + JSON body a handler sends, without a socket. */
async function capture(
  run: (res: ServerResponse) => Promise<void>,
): Promise<{ status: number; body: unknown }> {
  // A REAL ServerResponse over an unconnected socket, with only `end` swapped for a capture. This
  // was a three-property object literal reached through an `as unknown as` chain — a fake claiming
  // to be something it shares nothing with (anti-slop-adoption-arc inc-03). Nothing writes to the
  // socket: the route sets `statusCode`, calls `setHeader`, then ends.
  let body = '';
  const sink = new ServerResponse(new IncomingMessage(new Socket()));
  sink.end = ((chunk?: unknown): ServerResponse => {
    body = typeof chunk === 'string' ? chunk : '';
    return sink;
  }) as ServerResponse['end'];
  await run(sink);
  return { status: sink.statusCode, body: body === '' ? null : JSON.parse(body) };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('floorHealthMirrorProbe: expected one or more fixture JSON paths as arguments');
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const file of files) {
  const fixture = JSON.parse(readFileSync(file, 'utf8')) as FloorHealthFixture;
  const store = fixture.docs === null ? null : fixtureStore(fixture);

  // Only `backend.docStore` is on the /api/floor-health path; the rest of the ApiContext is
  // deliberately absent (an open dev posture with NO policy gate, so a non-GET reaches the handler
  // and its 405 rather than being refused upstream), so it is cast rather than faked.
  const ctx = { backend: { docStore: async () => store } } as ApiContext;

  const answers: Record<string, unknown> = {};
  for (const request of fixture.requests) {
    const url = new URL(request.path, 'http://localhost');
    const req = { method: request.method, url: request.path } as IncomingMessage;
    answers[request.label] = await capture((res) => handleApiRequest(req, res, url, ctx));
  }
  out[file] = answers;
}
process.stdout.write(JSON.stringify(out));
