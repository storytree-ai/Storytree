/**
 * The DESKTOP half of the `GET /api/comments` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it replays a fixture's request list
 * against this surface's own `/api/comments` composition and prints what it answered, so the gate
 * can diff it against the studio's.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the desktop may never import apps/studio/server (ADR-0100 / ADR-0176, enforced by
 * `check:boundaries`), which is why the comparison is made on decoded JSON by a third party.
 *
 * WHY A RECORDING STORE: see the studio half (apps/studio/server/commentsMirrorProbe.ts). The parse
 * is the whole of what either surface writes for itself, so the injected store records its filter and
 * the comparison lands there. `createBootReadRoutes` already takes `listComments` as an injected
 * seam, so no fake is needed — the probe wires the production seam to a recorder.
 *
 * Contract (shared with the studio probe):
 *   argv: one or more absolute fixture JSON paths, each `{ requests: string[] }`
 *   stdout: a single JSON object `{ [fixturePath]: { [request]: { status, body, filter } } }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure.
 */

import { readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

import { createBootReadRoutes } from "./boot-read-routes.js";

/** The shared fixture shape — the request list both probes replay. */
interface CommentsFixture {
  requests: string[];
}

/** Capture the status and decoded JSON body a handler sends, without a socket. */
function captureBody(
  run: (res: ServerResponse) => Promise<void>,
): Promise<{ status: number; body: unknown }> {
  // A REAL ServerResponse over an unconnected socket, with only `end` swapped for a capture — the
  // studio half's idiom, and the same reason: no `as unknown as` fake claiming to be something it
  // shares nothing with. `sendJson` ends synchronously, so `raw` is set by the time `run` resolves.
  let raw = "";
  const res = new ServerResponse(new IncomingMessage(new Socket()));
  res.end = ((chunk?: unknown): ServerResponse => {
    raw = typeof chunk === "string" ? chunk : "";
    return res;
  }) as ServerResponse["end"];
  return run(res).then(() => ({
    status: res.statusCode,
    body: raw === "" ? null : JSON.parse(raw),
  }));
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("comments-mirror-probe: expected one or more fixture JSON paths as arguments");
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const file of files) {
  const fixture = JSON.parse(readFileSync(file, "utf8")) as CommentsFixture;
  // `docsDir` is required by the deps shape but unreachable on this route — every request the
  // fixture replays is `/api/comments`, and the docs branches sit behind their own pathname guards.
  let composed: unknown;
  const handler = createBootReadRoutes({
    docsDir: "",
    listComments: async (filter) => {
      composed = filter;
      return [];
    },
  });
  const answers: Record<string, unknown> = {};
  for (const target of fixture.requests) {
    const url = new URL(target, "http://localhost");
    const req = new IncomingMessage(new Socket());
    req.method = "GET";
    req.url = target;
    composed = undefined;
    const answered = await captureBody(async (res) => {
      // A pathname this mount does not claim is a probe-visible fact, not a silent empty: the
      // fixture only ever replays `/api/comments`, so a `false` here means the dispatch guard
      // itself moved, and the 200-vs-404 shows up in the projection's `response:` entry.
      const claimed = await handler(req, res, url.pathname);
      if (!claimed) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "unclaimed by the boot read mount" }));
      }
    });
    answers[target] = { ...answered, filter: composed ?? null };
  }
  out[file] = answers;
}
process.stdout.write(JSON.stringify(out));
