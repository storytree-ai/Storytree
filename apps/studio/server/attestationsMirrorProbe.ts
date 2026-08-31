/**
 * The STUDIO half of the `GET /api/attestations` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it replays a fixture's request list
 * against this surface's own `/api/attestations` composition and prints what it answered, so the
 * gate can diff it against the desktop's hand-written copy of the same join.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app and the shared packages it already depends on. The desktop may never import
 * apps/studio/server (ADR-0100 / ADR-0176, enforced by `check:boundaries`), so the comparison is made
 * on decoded JSON by a third party rather than by one surface reaching into the other.
 *
 * WHY THIS PAIR IS WORTH A ROW. The desktop's copy carried the comment "same logic as
 * uatContextForStory in apiRouter.ts" — a stated duplication that nothing watched. It also sat
 * INLINE inside `electron/backend-entry.ts`'s `main()`, so no probe could reach it at all; it was
 * extracted to `apps/desktop/src/backend/attestations-route.ts` in the landing that registered this
 * row, which is what made the comparison possible.
 *
 * WHY IT DRIVES `handleApiRequest` AND NOT `handleAttestations`. Half this route's envelope is a
 * STATUS — 400 for a missing `storyId`, 405 for a method neither surface serves — and `handleAttestations`
 * THROWS those while the dispatcher's central mapping turns them into answers. Calling the handler
 * directly would put the thing under test inside the instrument measuring it.
 *
 * WHY THE FIXTURE FEEDS RAW ATTESTATION EVENTS. The two surfaces draw their store seam at different
 * levels: the studio's backend method `listAttestations` folds `events.attestation` through
 * `deriveAttestations`, while the desktop folds the raw stream inside the route. Handing each side
 * its own level from ONE raw fixture is what keeps the comparison on the ROUTE composition — the
 * layer-mismatch trap that manufactured a false finding on `/api/health` one increment earlier. The
 * fold below is the production `PgBackend.listAttestations` verbatim (same shared function, same
 * ignored `storyId`), so the store stays INPUT rather than the subject.
 *
 * Contract (shared with the desktop probe, apps/desktop/src/backend/attestations-mirror-probe.ts):
 *   argv: one or more absolute fixture DIRECTORY paths, each holding `attestations.json`
 *         (`{ attestationEvents, verdictEvents, requests }`) plus a `stories/` tree
 *   stdout: a single JSON object `{ [fixtureDir]: { [label]: { status, body } } }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 *
 * The answers are printed VERBATIM: the third party owns the projection into comparable entries
 * (`projectAttestationsPayload` in packages/cli/src/mirror-conformance.ts), so the two probes cannot
 * drift in how they reshape what they measured.
 */

import { readFileSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import path from 'node:path';

import { deriveAttestations } from '@storytree/orchestrator';

import { handleApiRequest, type ApiContext, type Paths } from './apiRouter.js';
import type { LibraryBackend } from './libraryBackend.js';

/** The shared fixture shape — the two event streams plus the requests to replay. */
interface AttestationsFixture {
  attestationEvents: { seq: number; doc: unknown }[];
  verdictEvents: { kind: string; seq: number; doc: unknown }[] | null;
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
  console.error('attestationsMirrorProbe: expected one or more fixture directory paths as arguments');
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const dir of dirs) {
  const fixture = JSON.parse(
    readFileSync(path.join(dir, 'attestations.json'), 'utf8'),
  ) as AttestationsFixture;

  // `PgBackend.listAttestations` verbatim: fold the raw stream through the SHARED
  // `deriveAttestations` and key it by test id. `storyId` is ignored there too — the projection is
  // the whole log, and the route filters by joining it to the story's own legs.
  const marks = Object.fromEntries(deriveAttestations(fixture.attestationEvents));

  // The THREE backend verbs `handleAttestations` declares, and nothing else — the same `Pick` the
  // handler's own signature takes, so this is a real narrowing rather than a fake that has to be
  // cast through `unknown` (the house standard refuses that, and it would discard the evidence a
  // reader wants here most).
  const backend: Pick<
    LibraryBackend,
    'listAttestations' | 'recordAttestation' | 'verdictEvents'
  > = {
    listAttestations: async () => marks,
    verdictEvents: async () => fixture.verdictEvents,
    // Never reached: the fixture replays no POST — the desktop deliberately serves no write on this
    // route, so a write request would compare a correct difference (see the `MIRRORS` row). Wired to
    // REJECT rather than to a benign value, so a route that started writing on a read breaks the
    // probe loudly instead of quietly widening what is compared.
    recordAttestation: () => Promise.reject(new Error('attestationsMirrorProbe replays GETs only')),
  };
  // Only `paths` and those three verbs are on the `/api/attestations` path; the rest of the
  // ApiContext is deliberately absent (an open dev posture with no policy gate), so it is cast
  // rather than faked — the `arcsMirrorProbe.ts` shape.
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
    backend,
  } as ApiContext;

  const answers: Record<string, unknown> = {};
  for (const request of fixture.requests) {
    const url = new URL(request.path, 'http://localhost');
    const req = new IncomingMessage(new Socket());
    req.method = request.method;
    req.url = request.path;
    answers[request.label] = await capture((res) => handleApiRequest(req, res, url, ctx));
  }
  out[dir] = answers;
}
process.stdout.write(JSON.stringify(out));
