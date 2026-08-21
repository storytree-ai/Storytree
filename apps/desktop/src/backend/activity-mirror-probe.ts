/**
 * The DESKTOP half of the `GET /api/activity` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it prints the payload this backend's
 * `/api/activity` serves for one or more fixtures, so the gate can diff it against the studio
 * payload it is a hand-written copy of.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the boundary that makes the whole harness legal. This backend deliberately
 * re-composes the studio's route over its own seam and may never import apps/studio/server
 * (ADR-0176; `check:boundaries` enforces the wall), so conformance is established by a third party
 * comparing two JSON payloads, not by either side importing the other.
 *
 * WHY A ROW FIXTURE AND NOT A PAYLOAD FIXTURE. The input is RAW `events.node_claim` rows plus a
 * FIXED `now`, folded here through this surface's own `claimRowsToActivity`. That is the whole
 * point: the originating defect was THIS surface's re-composed SELECT losing the ADR-0200 `grade`
 * column (claim-activity.ts's own header records it), so a harness that injected already-folded
 * claims would have compared two pass-throughs and stayed green through exactly the drift it exists
 * to catch. Both folds are pure (rows + now in, activities out), so this stays DB-free and runs in
 * CI.
 *
 * `builds` and `departures` ride the fixture ALREADY FOLDED — a stated limit, not an oversight:
 * `departures` is shared package code (`foldDepartures` in @storytree/notice-board) so no drift
 * class exists there, and this surface's builds fold is inline inside a `pg` query closure in
 * electron/backend-entry.ts, unreachable without a database. For those two layers this proves the
 * route passes them through unchanged and emits the KEY — the `departures`-shaped defect — not that
 * the two folds agree.
 *
 * Contract (shared with the studio probe, apps/studio/server/activityMirrorProbe.ts):
 *   argv: one or more absolute fixture JSON paths
 *   stdout: a single JSON object `{ [fixturePath]: <the route's response body, verbatim> }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 *
 * The body is printed VERBATIM: the third party owns the projection into comparable entries
 * (`projectActivityPayload` in packages/cli/src/mirror-conformance.ts), so the two probes cannot
 * drift in how they reshape what they measured.
 */

import { readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

import { claimRowsToActivity, type DesktopClaimRow } from "./claim-activity.js";
import { createLocalBackend } from "./local-backend.js";

/** The shared fixture shape — raw claim rows + a fixed `now` + the two pass-through layers. */
interface ActivityFixture {
  now: string;
  claimRows: DesktopClaimRow[];
  builds: unknown[] | null;
  departures: unknown[] | null;
}

/**
 * The reads `/api/activity` must NEVER reach. Wired to throw rather than to a benign value: the
 * gate's discipline is fail-CLOSED, so a route that started pulling the tree or the asset list on
 * this path should break the probe loudly instead of quietly widening what the comparison covers.
 */
function offPath(name: string): () => never {
  return () => {
    throw new Error(`activity-mirror-probe: GET /api/activity must not call ${name}`);
  };
}

/** Capture the JSON body a handler sends, without a socket. */
function captureBody(run: (res: ServerResponse) => Promise<void>): Promise<string> {
  // A REAL ServerResponse over an unconnected socket, with only `end` swapped for a capture. This
  // was a three-property object literal reached through an `as unknown as` chain — a fake claiming
  // to be something it shares nothing with (anti-slop-adoption-arc inc-03). Nothing writes to the
  // socket: the route sets `statusCode`, calls `setHeader`, then ends.
  let body = "";
  const res = new ServerResponse(new IncomingMessage(new Socket()));
  res.end = ((chunk?: unknown): ServerResponse => {
    body = typeof chunk === "string" ? chunk : "";
    return res;
  }) as ServerResponse["end"];
  return run(res).then(() => body);
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("activity-mirror-probe: expected one or more fixture JSON paths as arguments");
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const path of paths) {
  const fixture = JSON.parse(readFileSync(path, "utf8")) as ActivityFixture;
  const now = new Date(fixture.now);
  const handler = createLocalBackend({
    storiesDir: "(unused on the /api/activity path)",
    docsDir: "(unused on the /api/activity path)",
    store: "probe",
    backend: {
      inFlightBuilds: async () => fixture.builds,
      inFlightClaims: async () => claimRowsToActivity(fixture.claimRows, now),
      inFlightDepartures: async () => fixture.departures,
      listAssets: offPath("listAssets"),
      latestVerdicts: offPath("latestVerdicts"),
      health: offPath("health"),
    },
  });
  const req = { method: "GET", url: "/api/activity" } as IncomingMessage;
  const body = await captureBody((res) => handler(req, res));
  out[path] = JSON.parse(body);
}
process.stdout.write(JSON.stringify(out));
