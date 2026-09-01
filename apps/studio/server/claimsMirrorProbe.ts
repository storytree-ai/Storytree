/**
 * The STUDIO half of the `GET /api/claims` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it prints the `{ status, body }` this
 * surface serves for each request in a fixture, so the gate can diff it against the desktop's
 * hand-written copy of the same route.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the desktop may never import apps/studio/server (ADR-0176's one-wired-backend
 * rule, enforced by `check:boundaries`), so the comparison is made on decoded JSON by a third party
 * rather than by one surface reaching into the other.
 *
 * WHY IT DRIVES `handleApiRequest` AND NOT `handleClaims`, for the reason the arcs probe beside it
 * does: the 405 that makes this route read-only is THROWN by the handler and turned into an answer
 * by the dispatcher's central error mapping. Calling the handler directly would force this probe to
 * re-implement that mapping, which puts the thing under test inside the instrument measuring it —
 * and the desktop's half of the pair is its dispatcher's catch, so the two would be compared at
 * different layers. That layer mismatch is exactly what manufactured a false finding on
 * `/api/health`.
 *
 * WHAT IS ACTUALLY COMPARED HERE, because it is NOT the fold. Both surfaces reach the ledger through
 * the same shared `PgClaimStore.listLiveClaims()` and fold what it returns through the same shared
 * `groupClaimsBySession`; there is no second SELECT and no second fold. What each surface writes for
 * itself is the ENVELOPE — the 405, the advisory `{ sessions: null }` a down store or a seam-less
 * backend must answer instead of a 503, and the `null`-versus-`[]` distinction the dock renders as
 * two different things. So the fixture injects at `sessionClaims`, which is precisely where the two
 * surfaces stop sharing code.
 *
 * Contract (shared with the desktop probe, apps/desktop/src/backend/claims-mirror-probe.ts):
 *   argv: one or more absolute fixture JSON paths
 *         (`{ now, claims: unknown[] | null, seamAbsent: boolean, requests: {label,method,path}[] }`)
 *   stdout: a single JSON object `{ [fixturePath]: { [label]: { status, body } } }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 *
 * The answers are printed VERBATIM: the third party owns the projection into comparable entries
 * (`projectClaimsPayload` in packages/cli/src/mirror-conformance.ts), so the two probes cannot drift
 * in how they reshape what they measured.
 */

import { readFileSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import path from 'node:path';

import { handleApiRequest, type ApiContext, type Paths } from './apiRouter.js';

/** The shared fixture shape — the claim rows the seam yields, and the requests to replay. */
interface ClaimsFixture {
  /** The instant BOTH probes pin their clock to, so the fold is decided by data. */
  now: string;
  claims: unknown[] | null;
  seamAbsent: boolean;
  requests: { label: string; method: string; path: string }[];
}

/**
 * Freeze this process's wall clock to the fixture's `now`, BEFORE any request is replayed.
 *
 * THIS IS THE FIXTURE DECIDING THE CLOCK, WHICH IS THIS HARNESS'S OWN RULE — `activity-fixtures`
 * carries a fixed `now` "so the 2 h stale-reclaim window is decided by data, never by wall-clock".
 * That row can pass its `now` as an argument because its fold sits behind the seam; here the fold is
 * INSIDE the route (`groupClaimsBySession(claims, new Date())`), so the only way to hand both
 * surfaces the same instant is to fix the instant each process reads.
 *
 * WITHOUT IT THIS ROW IS FLAKY BY CONSTRUCTION, and measured so on its first run: the grouped
 * payload carries `ageMs` / `heartbeatAgeMs` per claim, computed against each surface's own clock,
 * and the two probes are separate processes launched one after the other — so eight leaves diverged
 * by 307 ms and the row reported cross-surface drift where the only difference was elapsed time.
 * Exempting those leaves instead would have been worse twice over: the exemption SELF-PRUNES when
 * its two sides agree, so a run where both probes landed in one millisecond would red for the
 * opposite reason, and the same fixed clock is what makes the STALE row's fate a property of the
 * data rather than of how long the harness took to get here.
 *
 * IT FAKES NOTHING THAT IS UNDER TEST. Both probes freeze to the SAME value, so neither surface is
 * given an advantage, and what is compared is still each surface's own composition. Only the
 * zero-argument `new Date()` and `Date.now()` are pinned — an explicit `new Date(iso)` still parses
 * what it is given, which is what the fixture's own rows need.
 */
function freezeClockAt(iso: string): void {
  const RealDate = Date;
  const frozen = RealDate.parse(iso);
  globalThis.Date = new Proxy(RealDate, {
    construct: (target, args: unknown[]) =>
      args.length === 0 ? new target(frozen) : Reflect.construct(target, args),
  });
  Date.now = (): number => frozen;
}

/** Capture the status + JSON body a handler sends, without a socket. */
async function capture(
  run: (res: ServerResponse) => Promise<void>,
): Promise<{ status: number; body: unknown }> {
  // A REAL ServerResponse over an unconnected socket, with only `end` swapped for a capture — the
  // idiom every probe here shares, and the same reason: no `as unknown as` fake claiming to be
  // something it shares nothing with.
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
  console.error('claimsMirrorProbe: expected one or more fixture JSON paths as arguments');
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const file of files) {
  const fixture = JSON.parse(readFileSync(file, 'utf8')) as ClaimsFixture;
  freezeClockAt(fixture.now);
  const dir = path.dirname(file);

  // Only `backend.sessionClaims` is on the /api/claims path; the rest of the ApiContext is
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
    // The seam under test. Absent ENTIRELY on the `seam-absent` arm — `?.()` is the branch the route
    // takes for a narrow backend, and it is not the same code path as a seam answering `null`.
    backend: fixture.seamAbsent ? {} : { sessionClaims: async () => fixture.claims },
  } as ApiContext;

  const answers: Record<string, unknown> = {};
  for (const request of fixture.requests) {
    const url = new URL(request.path, 'http://localhost');
    const req = { method: request.method, url: request.path } as IncomingMessage;
    answers[request.label] = await capture((res) => handleApiRequest(req, res, url, ctx));
  }
  out[file] = answers;
}
process.stdout.write(JSON.stringify(out));
