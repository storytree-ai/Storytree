/**
 * The DESKTOP half of the `GET /api/floor-health` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it prints the `{ status, body }` this
 * backend serves for each request in a fixture, so the gate can diff it against the studio payload
 * it is a hand-written copy of.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the boundary that makes the whole harness legal. This backend deliberately
 * re-composes the studio's route over its own seam and may never import apps/studio/server
 * (ADR-0176; `check:boundaries` enforces the wall), so conformance is established by a third party
 * comparing two JSON payloads, not by either side importing the other.
 *
 * WHAT IS AND IS NOT UNDER TEST HERE. The reading is shared code — `loadFloorHealthReading` in
 * @storytree/drive, which both surfaces call — so the figure's CONTENT carries no re-composition
 * risk (drive's own suites own that). What is hand-copied is the ENVELOPE: the method guard and its
 * stated reason, the "no document store" answer, and the `{ reading }` key itself. Half of that is
 * expressed as a STATUS, which is why this probe prints the status alongside the body and drives the
 * real `createLocalBackend` handler — including its own central error mapping — rather than the
 * floor-health branch in isolation.
 *
 * WHY THE FIXTURE STORE IS HAND-ROLLED AND SERVES ITS EVENTS VERBATIM. A reinforcement is attributed
 * to the route STANDING WHEN IT LANDED, read off the event log's timestamps (drive's
 * `RECURRENCE_ATTRIBUTION_RULE`). The `Store` seam's `appendEvent` accepts no `at` — every
 * implementation stamps its own — so a store that RECORDED the fixture's events would date every
 * route to today and read every reinforcement as PRE-route, leaving `loudest` absent and the
 * interesting half of the reading unexercised. Worse for a MIRROR comparison specifically: the two
 * probes run in separate processes at different moments, so a wall-clock stamp is nondeterminism
 * ACROSS the two payloads being compared. Serving the fixture verbatim makes it deterministic.
 *
 * The store is INPUT, not the subject. It is defined HERE because `@storytree/storage-protocol` is
 * drive's declared dep and not desktop's, so pnpm's strict isolation will not resolve its types from
 * apps/desktop (the same reason arcs-mirror-probe.ts and chat-sse-mount.test.ts carry their own
 * fixture stores). It and the studio probe's store are interchangeable by construction: both serve
 * the same fixture arrays and neither computes anything.
 *
 * Contract (shared with the studio probe, apps/studio/server/floorHealthMirrorProbe.ts):
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

import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createLocalBackend } from "./local-backend.js";
import type { LocalBackendBackend } from "./local-backend.js";

/** The shared fixture shape — the store's two reads (null docs = no store) plus the requests. */
interface FloorHealthFixture {
  docs: { id: string; kind: string; doc: unknown; createdAt: string; updatedAt: string }[] | null;
  events: {
    seq: number;
    id: string;
    kind: string;
    type: "created" | "updated" | "deleted";
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
 * The other four satisfy the seam's SHAPE and throw: floor-health is report-only by ADR-0316 D4, so
 * a route that ever started writing — or reaching for a doc by id — must break the probe LOUDLY
 * rather than quietly widening what this comparison covers.
 */
class FixtureStore {
  readonly #fixture: FloorHealthFixture;

  constructor(fixture: FloorHealthFixture) {
    this.#fixture = fixture;
  }

  async queryDocs(filter?: { kind?: string }) {
    return (this.#fixture.docs ?? []).filter(
      (d) => filter?.kind === undefined || d.kind === filter.kind,
    );
  }
  async readEvents(filter?: { id?: string }) {
    return this.#fixture.events.filter((e) => filter?.id === undefined || e.id === filter.id);
  }
  async upsertDoc(): Promise<never> {
    throw new Error("floor-health-mirror-probe: the route is report-only — it must not upsertDoc");
  }
  async patchDoc(): Promise<never> {
    throw new Error("floor-health-mirror-probe: the route is report-only — it must not patchDoc");
  }
  async getDoc(): Promise<never> {
    throw new Error("floor-health-mirror-probe: the route must not getDoc");
  }
  async deleteDoc(): Promise<never> {
    throw new Error("floor-health-mirror-probe: the route is report-only — it must not deleteDoc");
  }
  async appendEvent(): Promise<never> {
    throw new Error("floor-health-mirror-probe: the route is report-only — it must not appendEvent");
  }
}

/**
 * The reads `/api/floor-health` must NEVER reach. Wired to throw rather than to a benign value: the
 * gate's discipline is fail-CLOSED, so a route that started pulling the tree or the asset list on
 * this path should break the probe loudly instead of quietly widening what the comparison covers.
 */
function offPath(name: string): () => never {
  return () => {
    throw new Error(`floor-health-mirror-probe: GET /api/floor-health must not call ${name}`);
  };
}

/** Capture the status + JSON body a handler sends, without a socket. */
async function capture(
  run: (res: ServerResponse) => Promise<void>,
): Promise<{ status: number; body: unknown }> {
  let body = "";
  const sink = {
    statusCode: 0,
    setHeader(): void {},
    end(chunk?: string): void {
      body = chunk ?? "";
    },
  };
  await run(sink as unknown as ServerResponse);
  return { status: sink.statusCode, body: body === "" ? null : JSON.parse(body) };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("floor-health-mirror-probe: expected one or more fixture JSON paths as arguments");
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const file of files) {
  const fixture = JSON.parse(readFileSync(file, "utf8")) as FloorHealthFixture;
  const store = fixture.docs === null ? null : new FixtureStore(fixture);

  const backend: LocalBackendBackend = {
    docStore: async () => store,
    listAssets: offPath("listAssets"),
    latestVerdicts: offPath("latestVerdicts"),
    inFlightBuilds: offPath("inFlightBuilds"),
    health: offPath("health"),
  };
  // `storiesDir`/`docsDir` are never read on this path — floor-health joins no on-disk tree — but the
  // factory requires them; they are pointed at the fixture file's own path so a route that started
  // walking a tree here would fail loudly rather than silently reading the repo.
  const handler = createLocalBackend({
    storiesDir: file,
    docsDir: file,
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
