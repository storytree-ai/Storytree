/**
 * The STUDIO half of the cross-surface conformance harness for the replay panel's three local-file
 * reads — `GET /api/traversal`, `/api/traversal/sessions` and `/api/context-windows`
 * (`pnpm check:mirror-conformance`). A probe, not a route: it prints the `{ status, body }` this
 * surface serves for each request in a fixture, so the gate can diff it against the desktop's
 * hand-written copy of the same three routes.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app. That is the whole point of the design: the desktop may never import
 * apps/studio/server (ADR-0176's one-wired-backend rule, enforced by `check:boundaries`), so the
 * comparison is made on decoded JSON by a third party rather than by one surface reaching into the
 * other.
 *
 * WHY IT DRIVES `handleApiRequest` AND NOT `handleTraversal`. What is hand-copied on these routes is
 * their ENVELOPE, and most of that envelope is expressed as a STATUS: 400 refuses a bad id BY NAME,
 * 404 says "this machine holds no trace for that id", a 200 carrying `skipped > 0` says "the trace
 * was present but unreadable" (ADR-0241 D5), and 405 makes read-only a decision rather than an
 * omission. The handlers THROW those; the central error mapping in `handleApiRequest` turns them
 * into answers. Calling a handler directly would force this probe to re-implement that mapping,
 * which puts the thing under test inside the instrument measuring it.
 *
 * WHY THE FIXTURE IS A DIRECTORY AND THE ENV IS SET HERE. These routes have no backend: their source
 * of truth is a directory of JSONL files, reached through the ambient `STORYTREE_TRAVERSAL_DIR` /
 * `STORYTREE_TRANSCRIPT_DIR` overrides. Setting them here rather than handing the handlers a path
 * puts the resolution both surfaces perform INSIDE the comparison. Both probes receive the SAME
 * absolute fixture paths, which matters: `dir` rides the sessions wire and `scan.root` rides the
 * occupancy wire, so a surface resolving its root differently is a divergence rather than an
 * expected mismatch between two per-surface temp dirs.
 *
 * The fixture is INPUT, not the subject. The replay, the index and the occupancy fold are shared
 * package code both surfaces call — @storytree/context-traversal-{capture,spawn,transcript} — so
 * what is compared is each surface's envelope around one composition.
 *
 * Contract (shared with the desktop probe, apps/desktop/src/backend/traversal-mirror-probe.ts):
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

import { readFileSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { handleApiRequest, type ApiContext } from './apiRouter.js';

/** The shared fixture shape — the two ambient roots plus the requests replayed against them. */
interface TraversalFixture {
  traceDir: string;
  transcriptRoot: string;
  requests: { label: string; method: string; path: string }[];
}

/** Capture the status + JSON body a handler sends, without a socket. */
async function capture(
  run: (res: ServerResponse) => Promise<void>,
): Promise<{ status: number; body: unknown }> {
  // A REAL ServerResponse over an unconnected socket, with only `end` swapped for a capture — the
  // shape the sibling probes use (anti-slop-adoption-arc inc-03 removed the `as unknown as` fakes).
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
  console.error('traversalMirrorProbe: expected one or more fixture JSON paths as arguments');
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const file of files) {
  const fixture = JSON.parse(readFileSync(file, 'utf8')) as TraversalFixture;
  process.env['STORYTREE_TRAVERSAL_DIR'] = fixture.traceDir;
  process.env['STORYTREE_TRANSCRIPT_DIR'] = fixture.transcriptRoot;

  // NOTHING on the ApiContext is read by these three routes — they hold no store, no policy and no
  // backend. It is cast rather than faked so that a route which ever started reaching for one fails
  // loudly here rather than quietly widening what this comparison covers. No policy gate is wired,
  // so a non-GET reaches the handler and its own 405 instead of being refused upstream.
  const ctx = {} as ApiContext;

  const answers: Record<string, unknown> = {};
  for (const request of fixture.requests) {
    const url = new URL(request.path, 'http://localhost');
    const req = { method: request.method, url: request.path } as IncomingMessage;
    answers[request.label] = await capture((res) => handleApiRequest(req, res, url, ctx));
  }
  out[file] = answers;
}
process.stdout.write(JSON.stringify(out));
