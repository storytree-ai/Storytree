/**
 * The DESKTOP half of the `GET /api/claims` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it replays a fixture's request list
 * against this surface's own `/api/claims` composition and prints what it answered, so the gate can
 * diff it against the studio's.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the desktop may never import apps/studio/server (ADR-0100 / ADR-0176, enforced by
 * `check:boundaries`), which is why the comparison is made on decoded JSON by a third party.
 *
 * WHY THE SEAM IS `sessionClaims` AND THE FIXTURE CARRIES `ClaimDocT` ROWS. Both surfaces reach the
 * ledger through the SAME shared `PgClaimStore.listLiveClaims()` and fold what it returns through
 * the SAME shared `groupClaimsBySession` — there is no second SELECT and no second fold, which is
 * why this row's subject is the ENVELOPE: the 405 that makes the route read-only, the advisory
 * `{ sessions: null }` that a down store or a seam-less backend must answer instead of a 503, and
 * the difference between `null` and `[]` that the dock renders as two different things. Injecting
 * at `sessionClaims` puts the fixture exactly where the two surfaces stop sharing code.
 *
 * WHY THE FIXTURE MINTS ITS OWN TIMESTAMPS AND ITS OWN `now`. `groupClaimsBySession` is called with
 * the WALL CLOCK on both surfaces and neither route takes an injectable clock, so a fixture carrying
 * fixed dates would age past the 2 h stale window and silently stop exercising the live branch. The
 * harness mints the rows relative to the instant it writes the fixture and records that instant as
 * `now`; {@link freezeClockAt} pins this process to it, so which rows are live is a property of the
 * DATA rather than of when this probe happened to run.
 *
 * Contract (shared with the studio probe, apps/studio/server/claimsMirrorProbe.ts):
 *   argv: one or more absolute fixture JSON paths
 *   stdout: a single JSON object `{ [fixturePath]: { [label]: { status, body } } }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 */

import { readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import path from "node:path";

import { createLocalBackend, type LocalBackendBackend } from "./local-backend.js";

/** The shared fixture shape — the claim rows the seam yields, and the requests both probes replay. */
interface ClaimsFixture {
  /** The instant BOTH probes pin their clock to, so the fold is decided by data. */
  now: string;
  /** `ClaimDocT`-shaped rows, or `null` for the down-store posture the route answers advisorily. */
  claims: unknown[] | null;
  /** When true the backend omits `sessionClaims` ENTIRELY — the json / narrow-stub posture. */
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

/**
 * A backend method this row's requests must never reach. It THROWS rather than returning an empty
 * value: a silent stub would let a dispatch that wandered onto the wrong branch answer 200 with
 * nothing, and two surfaces answering nothing agree perfectly.
 */
function offPath(name: string): () => never {
  return () => {
    throw new Error(`claims-mirror-probe: ${name} is off this route's path and must not be called`);
  };
}

/** Capture the status and decoded JSON body a handler sends, without a socket. */
async function capture(
  run: (res: ServerResponse) => Promise<void>,
): Promise<{ status: number; body: unknown }> {
  // A REAL ServerResponse over an unconnected socket, with only `end` swapped for a capture — the
  // idiom every probe here shares, and the same reason: no `as unknown as` fake claiming to be
  // something it shares nothing with.
  let body = "";
  const sink = new ServerResponse(new IncomingMessage(new Socket()));
  sink.end = ((chunk?: unknown): ServerResponse => {
    body = typeof chunk === "string" ? chunk : "";
    return sink;
  }) as ServerResponse["end"];
  await run(sink);
  return { status: sink.statusCode, body: body === "" ? null : JSON.parse(body) };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("claims-mirror-probe: expected one or more fixture JSON paths as arguments");
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const file of files) {
  const fixture = JSON.parse(readFileSync(file, "utf8")) as ClaimsFixture;
  freezeClockAt(fixture.now);

  const backend: LocalBackendBackend = {
    listAssets: offPath("listAssets"),
    latestVerdicts: offPath("latestVerdicts"),
    inFlightBuilds: offPath("inFlightBuilds"),
    health: offPath("health"),
  };
  // The seam under test, added only when the fixture wires it. Written as a statement rather than a
  // conditional spread because the omission is the POINT here: on the `seam-absent` arm the route
  // takes its `?.()` branch, which is not the same code path as a seam answering `null`.
  if (!fixture.seamAbsent) {
    backend.sessionClaims = async () => fixture.claims;
  }
  const handler = createLocalBackend({
    // No route in this fixture reads either directory; they are required by the deps shape.
    storiesDir: path.join(path.dirname(file), "stories"),
    docsDir: path.join(path.dirname(file), "docs"),
    store: "probe",
    backend,
  });

  const answers: Record<string, unknown> = {};
  for (const request of fixture.requests) {
    const req = { method: request.method, url: request.path } as IncomingMessage;
    answers[request.label] = await capture((res) => handler(req, res));
  }
  out[file] = answers;
}
process.stdout.write(JSON.stringify(out));
