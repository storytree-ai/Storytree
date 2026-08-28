/**
 * The DESKTOP half of the cross-surface conformance harness for the replay panel's three local-file
 * reads — `GET /api/traversal`, `/api/traversal/sessions` and `/api/context-windows`
 * (`pnpm check:mirror-conformance`). A probe, not a route: it prints the `{ status, body }` this
 * backend serves for each request in a fixture, so the gate can diff it against the studio payload
 * it is a hand-written copy of.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the boundary that makes the whole harness legal. This backend deliberately
 * re-composes the studio's routes over its own dispatcher and may never import apps/studio/server
 * (ADR-0176; `check:boundaries` enforces the wall), so conformance is established by a third party
 * comparing two JSON payloads, not by either side importing the other.
 *
 * WHAT IS AND IS NOT UNDER TEST HERE. The SUBSTANCE is shared package code both surfaces call —
 * `replayTraversalSessionAllAdapters`, `computeDecisionPoints`, `listTraversalSessionsIncremental`,
 * `readWindowOccupancySeries` — so the replay's CONTENT carries no re-composition risk (those
 * packages' own suites own it). What is hand-copied is the ENVELOPE: the method guards and their
 * stated reasons, the two flat-token id guards, the honest-empty index answer with `dir` on the
 * wire, the 404-vs-200 fork for an unreadable trace, and `/api/context-windows`'s deliberate
 * NON-404 for a window with no transcript. Most of that is expressed as a STATUS, which is why this
 * probe prints the status alongside the body and drives the REAL `createTraversalRoutes` dispatcher
 * — including its own error mapping — rather than a branch in isolation.
 *
 * WHY IT ALSO ASSERTS FALL-THROUGH. This dispatcher answers `false` for a path it does not own, and
 * the Electron chain's next mount then fires. A probe that ignored that could not tell "served a
 * 404" from "declined the path", so the two are kept apart here: a declined path is reported as the
 * chain's own `unknown endpoint` 404, which is exactly what the surface serves in that case.
 *
 * WHY THE FIXTURE IS A DIRECTORY AND THE ENV IS SET HERE — identical to the studio probe's reason.
 * These routes have no backend: their source of truth is a directory of JSONL files reached through
 * the ambient `STORYTREE_TRAVERSAL_DIR` / `STORYTREE_TRANSCRIPT_DIR` overrides, so setting them here
 * puts the resolution both surfaces perform INSIDE the comparison. Both probes receive the SAME
 * absolute fixture paths, which matters: `dir` rides the sessions wire and `scan.root` rides the
 * occupancy wire.
 *
 * Contract (shared with the studio probe, apps/studio/server/traversalMirrorProbe.ts):
 *   argv: one or more absolute fixture JSON PATHS, each holding
 *         `{ traceDir: string, transcriptRoot: string, requests: { label, method, path }[] }`
 *   stdout: a single JSON object `{ [fixturePath]: { [label]: { status, body } } }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 *
 * The answers are printed VERBATIM: the third party owns the projection into comparable entries
 * (`projectTraversalPayload` in packages/cli/src/mirror-conformance.ts), so the two probes cannot
 * drift in how they reshape what they measured.
 */

import { readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

import { createTraversalRoutes } from "./traversal-routes.js";

/** The shared fixture shape — the two ambient roots plus the requests replayed against them. */
interface TraversalFixture {
  traceDir: string;
  transcriptRoot: string;
  requests: { label: string; method: string; path: string }[];
}

/** Capture the status + JSON body a handler sends, without a socket. */
async function capture(
  run: (res: ServerResponse) => Promise<boolean>,
): Promise<{ status: number; body: unknown }> {
  // A REAL ServerResponse over an unconnected socket, with only `end` swapped for a capture — the
  // shape the sibling probes use (anti-slop-adoption-arc inc-03 removed the `as unknown as` fakes).
  let body = "";
  const sink = new ServerResponse(new IncomingMessage(new Socket()));
  sink.end = ((chunk?: unknown): ServerResponse => {
    body = typeof chunk === "string" ? chunk : "";
    return sink;
  }) as ServerResponse["end"];
  const handled = await run(sink);
  // A DECLINED path is not a served answer. Reporting it as the chain's own catch-all 404 is what
  // this surface actually serves in that case — and it keeps "declined" distinguishable from a 404
  // this dispatcher chose, which is the difference the whole increment turns on.
  if (!handled) return { status: 404, body: { error: "unknown endpoint" } };
  return { status: sink.statusCode, body: body === "" ? null : JSON.parse(body) };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("traversal-mirror-probe: expected one or more fixture JSON paths as arguments");
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const file of files) {
  const fixture = JSON.parse(readFileSync(file, "utf8")) as TraversalFixture;
  process.env["STORYTREE_TRAVERSAL_DIR"] = fixture.traceDir;
  process.env["STORYTREE_TRANSCRIPT_DIR"] = fixture.transcriptRoot;

  const routes = createTraversalRoutes();

  const answers: Record<string, unknown> = {};
  for (const request of fixture.requests) {
    // The Electron chain hands each mount a PATHNAME, so the probe reproduces that call shape
    // exactly — driving it any other way would prove a contract this backend never uses.
    const pathname = new URL(request.path, "http://localhost").pathname;
    const req = { method: request.method, url: request.path } as IncomingMessage;
    answers[request.label] = await capture((res) => routes(req, res, pathname));
  }
  out[file] = answers;
}
process.stdout.write(JSON.stringify(out));
