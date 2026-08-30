/**
 * The DESKTOP half of the `GET /api/tree` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it replays a fixture's request list
 * against this backend's own `/api/tree` composition and prints what it answered, so the gate can
 * diff it against the studio payload it is a hand-written copy of.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the boundary that makes the whole harness legal. This backend deliberately
 * re-composes the studio's route over its own seam and may never import apps/studio/server
 * (ADR-0100 / ADR-0176; `check:boundaries` enforces the wall), so conformance is established by a
 * third party comparing two JSON payloads, not by either side importing the other.
 *
 * WHAT IS AT RISK HERE, and why it is the widest pair in the registry. Almost nothing on this route
 * is shared code. `readTreeWithCaps` (tree-verdicts.ts) is an independent re-composition of the
 * studio's `readTree`, `toDesktopTree` (hierarchy-live.ts) an independent re-composition of its
 * `foldedToTreeWalk`, and `foldVerdicts` carries this surface's own copies of `applyUatCriteria`,
 * `applyCapCoverage` and `applyUatCrowns`. The one thing genuinely shared is what sits UNDER all of
 * it — `foldWorkHierarchy` in @storytree/library and the rollup compute in @storytree/orchestrator.
 *
 * WHY IT DRIVES `createLocalBackend` AND NOT `buildTreePayload`. Part of the envelope is expressed
 * as a STATUS — the 405 method guard — and `buildTreePayload` is not exported anyway. Driving the
 * real handler puts this surface's own dispatch and error mapping inside the comparison rather than
 * re-implemented beside it. The `arcs-mirror-probe.ts` precedent, same reason.
 *
 * WHY IT RESETS THE HIERARCHY CACHE BETWEEN ARMS. `selectDesktopHierarchy` degrades live → cache →
 * disk and the studio has no cache (ADR-0445 D2). Replaying a live arm and then a disk arm in one
 * process would otherwise compare the studio's DISK walk against this surface's CACHE, which is a
 * divergence in neither. See `resetHierarchyCache` in local-backend.ts.
 *
 * Contract (shared with the studio probe, apps/studio/server/treeMirrorProbe.ts):
 *   argv: one or more absolute fixture DIRECTORY paths, each holding `tree.json`
 *         (`{ hierarchy, latestVerdicts, verdictEvents, builds, requests }`) plus a `stories/` tree
 *   stdout: a single JSON object `{ [fixtureDir]: { [label]: { status, body } } }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 *
 * The answers are printed VERBATIM: the third party owns the projection into comparable entries
 * (`projectTreePayload` in packages/cli/src/mirror-conformance.ts), so the two probes cannot drift
 * in how they reshape what they measured.
 */

import { readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import path from "node:path";

import { createLocalBackend, resetHierarchyCache } from "./local-backend.js";
import type { LocalBackendBackend } from "./local-backend.js";

/** How one fixture arm wires the work-hierarchy seam — see the studio half for why three sources. */
type HierarchySource =
  | { source: "live"; snapshot: unknown }
  | { source: "empty" }
  | { source: "absent" };

/** The shared fixture shape — the four reads the tree fold makes, plus the requests to replay. */
interface TreeFixture {
  hierarchy: HierarchySource;
  latestVerdicts: Record<string, { outcome: string; at: string }> | null;
  verdictEvents: { kind: string; seq: number; doc: unknown }[] | null;
  builds: unknown[] | null;
  requests: { label: string; method: string; path: string }[];
}

/**
 * The reads `/api/tree` must NEVER reach. Wired to throw rather than to a benign value: the gate's
 * discipline is fail-CLOSED, so a route that started pulling the asset list or the document store on
 * this path should break the probe loudly instead of quietly widening what the comparison covers.
 */
function offPath(name: string): () => never {
  return () => {
    throw new Error(`tree-mirror-probe: GET /api/tree must not call ${name}`);
  };
}

/** Capture the status + JSON body a handler sends, without a socket. */
async function capture(
  run: (res: ServerResponse) => Promise<void>,
): Promise<{ status: number; body: unknown }> {
  // A REAL ServerResponse over an unconnected socket, with only `end` swapped for a capture — the
  // studio half's idiom, and the same reason: no `as unknown as` fake claiming to be something it
  // shares nothing with. `sendJson` ends synchronously, so `body` is set by the time `run` resolves.
  let body = "";
  const sink = new ServerResponse(new IncomingMessage(new Socket()));
  sink.end = ((chunk?: unknown): ServerResponse => {
    body = typeof chunk === "string" ? chunk : "";
    return sink;
  }) as ServerResponse["end"];
  await run(sink);
  return { status: sink.statusCode, body: body === "" ? null : JSON.parse(body) };
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("tree-mirror-probe: expected one or more fixture directory paths as arguments");
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const dir of dirs) {
  const fixture = JSON.parse(readFileSync(path.join(dir, "tree.json"), "utf8")) as TreeFixture;
  // Each arm starts from a cold process — see the header.
  resetHierarchyCache();

  // OMITTED rather than stubbed for the `absent` arm: `selectDesktopHierarchy` branches on the
  // property being undefined, and a stub returning null would silently convert it into `empty`.
  const hierarchySeam =
    fixture.hierarchy.source === "absent"
      ? {}
      : {
          workHierarchy: async () =>
            fixture.hierarchy.source === "live"
              ? (fixture.hierarchy.snapshot as never)
              : null,
        };
  const backend: LocalBackendBackend = {
    ...hierarchySeam,
    latestVerdicts: async () => fixture.latestVerdicts,
    verdictEvents: async () => fixture.verdictEvents,
    inFlightBuilds: async () => fixture.builds,
    listAssets: offPath("listAssets"),
    health: offPath("health"),
    docStore: offPath("docStore"),
  };
  const handler = createLocalBackend({
    storiesDir: path.join(dir, "stories"),
    docsDir: path.join(dir, "docs"),
    store: "probe",
    backend,
  });

  const answers: Record<string, unknown> = {};
  for (const request of fixture.requests) {
    // A REAL IncomingMessage rather than a two-property literal, so the two probes hand their
    // surfaces the same kind of request object — the studio's `sendJsonValidated` reads
    // `req.headers`, and a request shape that differs between the halves is a difference in the
    // instrument rather than in what it measures.
    const req = new IncomingMessage(new Socket());
    req.method = request.method;
    req.url = request.path;
    answers[request.label] = await capture((res) => handler(req, res));
  }
  out[dir] = answers;
}
process.stdout.write(JSON.stringify(out));
