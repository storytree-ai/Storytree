/**
 * The STUDIO half of the `GET /api/activity` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it prints the payload this surface's
 * `/api/activity` serves for one or more fixtures, so the gate can diff it against the desktop's
 * hand-written copy of the same route.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the same boundary the docs probe keeps (the desktop may never import
 * apps/studio/server, ADR-0176, enforced by `check:boundaries`), so the comparison is made on
 * decoded JSON by a third party rather than by one surface reaching into the other.
 *
 * WHY A ROW FIXTURE AND NOT A PAYLOAD FIXTURE. The input is RAW `events.node_claim` rows plus a
 * FIXED `now`, and this probe folds them through the surface's own `claimsToActivity`. That is the
 * whole point: the originating defect was a re-composed SELECT that lost the ADR-0200 `grade`
 * column, so a harness that injected already-folded claims would have compared two pass-throughs
 * and stayed green through exactly the drift it exists to catch. Feeding rows makes each surface's
 * own fold part of what is proven. It stays DB-free — both folds are pure (rows + now in,
 * activities out), which is why this can run in CI.
 *
 * `builds` and `departures` ride the fixture ALREADY FOLDED, and that is a stated limit rather than
 * an oversight: `departures` is shared package code (`foldDepartures` in @storytree/notice-board),
 * so no drift class exists there, while the desktop's builds fold is inline inside a `pg` query
 * closure in apps/desktop/electron/backend-entry.ts and cannot be reached without a database. For
 * those two layers this proves the route passes them through unchanged and emits the KEY — the
 * `departures`-shaped defect — not that the two folds agree.
 *
 * Contract (shared with the desktop probe, apps/desktop/src/backend/activity-mirror-probe.ts):
 *   argv: one or more absolute fixture JSON paths
 *   stdout: a single JSON object `{ [fixturePath]: <the route's response body, verbatim> }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 *
 * The body is printed VERBATIM: the third party owns the projection into comparable entries
 * (`projectActivityPayload` in packages/cli/src/mirror-conformance.ts), so the two probes cannot
 * drift in how they reshape what they measured.
 */

import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { handleActivity } from './apiRouter.js';
import { claimsToActivity, type ClaimRow } from './inFlightActivity.js';

/** The shared fixture shape — raw claim rows + a fixed `now` + the two pass-through layers. */
interface ActivityFixture {
  now: string;
  claimRows: ClaimRow[];
  builds: unknown[] | null;
  departures: unknown[] | null;
}

/** Capture the JSON body a handler sends, without a socket. */
function captureBody(run: (res: ServerResponse) => Promise<void>): Promise<string> {
  let body = '';
  const res = {
    statusCode: 0,
    setHeader(): void {},
    end(chunk?: string): void {
      body = chunk ?? '';
    },
  } as unknown as ServerResponse;
  return run(res).then(() => body);
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('activityMirrorProbe: expected one or more fixture JSON paths as arguments');
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const path of paths) {
  const fixture = JSON.parse(readFileSync(path, 'utf8')) as ActivityFixture;
  const now = new Date(fixture.now);
  const backend = {
    inFlightBuilds: async () => fixture.builds,
    inFlightClaims: async () => claimsToActivity(fixture.claimRows, now),
    inFlightDepartures: async () => fixture.departures,
  };
  const req = { method: 'GET', url: '/api/activity' } as IncomingMessage;
  const body = await captureBody((res) =>
    handleActivity(req, res, backend as unknown as Parameters<typeof handleActivity>[2]),
  );
  out[path] = JSON.parse(body);
}
process.stdout.write(JSON.stringify(out));
