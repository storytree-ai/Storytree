/**
 * The STUDIO half of the `GET /api/tree` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it replays a fixture's request list
 * against this surface's own `/api/tree` composition and prints what it answered, so the gate can
 * diff it against the desktop's hand-written copy of the same fold.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app. That is the whole design: the desktop may never import apps/studio/server
 * (ADR-0100 / ADR-0176's one-wired-backend rule, enforced by `check:boundaries`), so the comparison
 * is made on decoded JSON by a third party rather than by one surface reaching into the other.
 *
 * WHY THIS PAIR IS WORTH A ROW, and it is not a hypothetical. Commit `71f68d2b` folded
 * `parseAdrWireSignals` into the studio's `listDocs` and left the desktop's copy alone; over the real
 * tree that silently dropped `loadBearing` from 88 ADRs and `references` from 168, and nothing
 * anywhere went red. `/api/tree` is the same shape at a larger radius: `readTree` (apiRouter.ts) and
 * `readTreeWithCaps` (tree-verdicts.ts) are two independent walks of one `stories/` tree,
 * `foldedToTreeWalk` and `toDesktopTree` are two independent adapters over one shared projection
 * fold, and the four enrichment passes (own verdicts, `applyUatCriteria`, `applyCapCoverage`,
 * `applyUatCrowns`) exist once on each surface.
 *
 * WHY IT DRIVES `handleApiRequest` AND NOT `buildTreePayload`. Part of what is hand-copied is
 * expressed as a STATUS — the 405 that makes this route read-only. `buildTreePayload` never sees a
 * method; the dispatcher's own guard and central error mapping do, so the probe drives the real
 * dispatcher and prints the status beside the body. The `arcsMirrorProbe.ts` precedent, same reason.
 *
 * Contract (shared with the desktop probe, apps/desktop/src/backend/tree-mirror-probe.ts):
 *   argv: one or more absolute fixture DIRECTORY paths, each holding `tree.json`
 *         (`{ hierarchy, latestVerdicts, verdictEvents, builds, requests }`) plus a `stories/` tree
 *   stdout: a single JSON object `{ [fixtureDir]: { [label]: { status, body } } }` — keyed by the
 *           ARG first, which is the protocol every probe here follows
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 *
 * The answers are printed VERBATIM: the third party owns the projection into comparable entries
 * (`projectTreePayload` in packages/cli/src/mirror-conformance.ts), so the two probes cannot drift
 * in how they reshape what they measured.
 */

import { readFileSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import path from 'node:path';

import { handleApiRequest, type ApiContext, type Paths } from './apiRouter.js';

/**
 * How one fixture arm wires the work-hierarchy seam (ADR-0445 D1) — the map's QUESTION half.
 *
 * Three named sources rather than a nullable snapshot, because the two ABSENCES are different facts
 * with different code paths on both surfaces: a backend that serves no projection is a
 * configuration choice, while a store that answers with none means the loader has not run. Collapsing
 * them into one `null` would leave one of the two disk-fallback branches uncompared.
 */
type HierarchySource =
  | { source: 'live'; snapshot: unknown }
  | { source: 'empty' }
  | { source: 'absent' };

/** The shared fixture shape — the four reads the tree fold makes, plus the requests to replay. */
interface TreeFixture {
  hierarchy: HierarchySource;
  latestVerdicts: Record<string, { outcome: string; at: string }> | null;
  verdictEvents: { kind: string; seq: number; doc: unknown }[] | null;
  builds: unknown[] | null;
  requests: { label: string; method: string; path: string }[];
}

/** Capture the status + JSON body a handler sends, without a socket. */
async function capture(
  run: (res: ServerResponse) => Promise<void>,
): Promise<{ status: number; body: unknown }> {
  // A REAL ServerResponse over an unconnected socket, with only `end` swapped for a capture — the
  // idiom every probe here uses (anti-slop-adoption-arc inc-03: no `as unknown as` fake claiming to
  // be something it shares nothing with). Nothing writes to the socket: the route sets `statusCode`,
  // calls `setHeader`, then ends synchronously.
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
  console.error('treeMirrorProbe: expected one or more fixture directory paths as arguments');
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const dir of dirs) {
  const fixture = JSON.parse(readFileSync(path.join(dir, 'tree.json'), 'utf8')) as TreeFixture;

  // The four seams the tree fold reads, wired from the fixture. `workHierarchy` is OMITTED rather
  // than stubbed for the `absent` arm — `selectHierarchy` branches on the property being undefined,
  // and a stub returning null would silently convert that arm into the `empty` one.
  const hierarchySeam =
    fixture.hierarchy.source === 'absent'
      ? {}
      : {
          workHierarchy: async () =>
            fixture.hierarchy.source === 'live' ? fixture.hierarchy.snapshot : null,
        };
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
    backend: {
      ...hierarchySeam,
      latestVerdicts: async () => fixture.latestVerdicts,
      verdictEvents: async () => fixture.verdictEvents,
      inFlightBuilds: async () => fixture.builds,
    },
  } as ApiContext;

  const answers: Record<string, unknown> = {};
  for (const request of fixture.requests) {
    const url = new URL(request.path, 'http://localhost');
    // A REAL IncomingMessage, not a two-property literal: `/api/tree` answers through
    // `sendJsonValidated`, which reads `req.headers['if-none-match']` to serve a 304. A fake with no
    // `headers` throws there, and the probe would report a 500 that the real server never sends.
    const req = new IncomingMessage(new Socket());
    req.method = request.method;
    req.url = request.path;
    answers[request.label] = await capture((res) => handleApiRequest(req, res, url, ctx));
  }
  out[dir] = answers;
}
process.stdout.write(JSON.stringify(out));
