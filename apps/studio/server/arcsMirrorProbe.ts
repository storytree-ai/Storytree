/**
 * The STUDIO half of the `GET /api/arcs` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it prints the `{ status, body }` this
 * surface serves for each request in a fixture, so the gate can diff it against the desktop's
 * hand-written copy of the same route.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app (plus the storage seam it seeds a store from). That is the whole point of the
 * design: the desktop may never import apps/studio/server (ADR-0176's one-wired-backend rule,
 * enforced by `check:boundaries`), so the comparison is made on decoded JSON by a third party rather
 * than by one surface reaching into the other.
 *
 * WHY IT DRIVES `handleApiRequest` AND NOT `handleArcs`. Most of what is hand-copied on this route
 * is expressed as a STATUS — the 405 that makes read-only a decision rather than an omission
 * (ADR-0267 D6 / ADR-0314 D9), the 503 that refuses to answer "one arc" without a store, the 404
 * that refuses to answer an unknown id with an empty shell. `handleArcs` THROWS those; the central
 * error mapping in `handleApiRequest` turns them into answers. Calling the handler directly would
 * have forced this probe to re-implement that mapping, which puts the thing under test inside the
 * instrument measuring it. The dispatcher's own catch is what runs here.
 *
 * WHAT THE FIXTURE'S STORE IS AND IS NOT. The store is INPUT, not the thing under test: the arc →
 * children join is shared code (`loadArcRollups` in @storytree/arc) that BOTH surfaces call, so
 * what is being compared is each surface's envelope around one join. This probe seeds an
 * `InMemoryStore`; the desktop probe carries its own minimal store because
 * `@storytree/storage-protocol` is not its declared dep. Only `getDoc`/`queryDocs` are exercised and
 * the rollup sorts everything it returns, so the two are interchangeable here by construction.
 *
 * Contract (shared with the desktop probe, apps/desktop/src/backend/arcs-mirror-probe.ts):
 *   argv: one or more absolute fixture DIRECTORY paths, each holding `arcs.json`
 *         (`{ docs: StoredDoc[] | null, requests: { label, method, path }[] }`) plus, when `docs` is
 *         non-null, a `docs/decisions` tree and a `stories/` tree
 *   stdout: a single JSON object `{ [fixtureDir]: { [label]: { status, body } } }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 *
 * The answers are printed VERBATIM: the third party owns the projection into comparable entries
 * (`projectArcsPayload` in packages/cli/src/mirror-conformance.ts), so the two probes cannot drift
 * in how they reshape what they measured.
 */

import { readFileSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import path from 'node:path';

import { InMemoryStore } from '@storytree/storage-protocol';

import { handleApiRequest, type ApiContext, type Paths } from './apiRouter.js';

/** The shared fixture shape — the doc set (null = no document store) plus the requests to replay. */
interface ArcFixture {
  docs: { id: string; kind: string; doc: unknown }[] | null;
  requests: { label: string; method: string; path: string }[];
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

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('arcsMirrorProbe: expected one or more fixture directory paths as arguments');
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const dir of dirs) {
  const fixture = JSON.parse(readFileSync(path.join(dir, 'arcs.json'), 'utf8')) as ArcFixture;

  let store: InMemoryStore | null = null;
  if (fixture.docs !== null) {
    store = new InMemoryStore();
    for (const d of fixture.docs) await store.upsertDoc({ id: d.id, kind: d.kind, doc: d.doc });
  }

  // Only `paths` and `backend.docStore` are on the /api/arcs path; the rest of the ApiContext is
  // deliberately absent (an open dev posture with no policy gate), so it is cast rather than faked.
  const ctx = {
    paths: {
      repoRoot: dir,
      docsDir: path.join(dir, 'docs'),
      storiesDir: path.join(dir, 'stories'),
      dataDir: dir,
      commentsFile: path.join(dir, 'comments.json'),
      assetsFile: path.join(dir, 'assets.json'),
      usersFile: path.join(dir, 'users.json'),
      attestationsFile: path.join(dir, 'attestations.json'),
    } satisfies Paths,
    backend: { docStore: async () => store },
  } as ApiContext;

  const answers: Record<string, unknown> = {};
  for (const request of fixture.requests) {
    const url = new URL(request.path, 'http://localhost');
    const req = { method: request.method, url: request.path } as IncomingMessage;
    answers[request.label] = await capture((res) => handleApiRequest(req, res, url, ctx));
  }
  out[dir] = answers;
}
process.stdout.write(JSON.stringify(out));
