/**
 * The STUDIO half of the `GET /api/comments` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it replays a fixture's request list
 * against this surface's own `/api/comments` composition and prints what it answered, so the gate
 * can diff it against the desktop's hand-written copy of the same parse.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the boundary every probe here keeps (the desktop may never import
 * apps/studio/server, ADR-0176, enforced by `check:boundaries`), so the comparison is made on
 * decoded JSON by a third party rather than by one surface reaching into the other.
 *
 * WHY A RECORDING STORE AND NOT A COMMENT FIXTURE. Neither surface composes a comment: both parse a
 * filter out of the query string and hand it to an injected store. The parse is the whole of what
 * this route writes for itself, so the store RECORDS the filter it receives and the comparison lands
 * exactly there. A fixed comment list would have compared two stubs applying the same filter and
 * stayed green through the divergence this pair was opened on — `?topicId=` answering with every
 * comment here and none on the desktop. Same reasoning as `activityMirrorProbe.ts`'s raw rows,
 * applied to what this route actually composes.
 *
 * Contract (shared with the desktop probe, apps/desktop/src/backend/comments-mirror-probe.ts):
 *   argv: one or more absolute fixture JSON paths, each `{ requests: string[] }`
 *   stdout: a single JSON object `{ [fixturePath]: { [request]: { status, body, filter } } }` —
 *           keyed by the ARG first, which is the protocol every probe here follows
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 *
 * The body is printed as DECODED JSON; the third party owns the projection into comparable entries
 * (`projectCommentsPayload` in packages/cli/src/mirror-conformance.ts), so the two probes cannot
 * drift in how they reshape what they measured.
 */

import { readFileSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { handleComments } from './apiRouter.js';

/** The shared fixture shape — the request list both probes replay. */
interface CommentsFixture {
  requests: string[];
}

/** Capture the status and decoded JSON body a handler sends, without a socket. */
function captureBody(
  run: (res: ServerResponse) => Promise<void>,
): Promise<{ status: number; body: unknown }> {
  // A REAL ServerResponse over an unconnected socket, with only `end` swapped for a capture — the
  // shape activityMirrorProbe.ts settled on (anti-slop-adoption-arc inc-03: no `as unknown as` fake
  // claiming to be something it shares nothing with). Nothing writes to the socket: the route sets
  // `statusCode`, calls `setHeader`, then ends synchronously, so `raw` is set by the time `run`
  // resolves.
  let raw = '';
  const res = new ServerResponse(new IncomingMessage(new Socket()));
  res.end = ((chunk?: unknown): ServerResponse => {
    raw = typeof chunk === 'string' ? chunk : '';
    return res;
  }) as ServerResponse['end'];
  return run(res).then(() => ({
    status: res.statusCode,
    body: raw === '' ? null : JSON.parse(raw),
  }));
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('commentsMirrorProbe: expected one or more fixture JSON paths as arguments');
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const file of files) {
  const fixture = JSON.parse(readFileSync(file, 'utf8')) as CommentsFixture;
  const answers: Record<string, unknown> = {};
  for (const target of fixture.requests) {
    const url = new URL(target, 'http://localhost');
    const req = new IncomingMessage(new Socket());
    req.method = 'GET';
    req.url = target;
    // The RECORDING store — see the header. The composed filter is captured as its own field rather
    // than smuggled back through the comment list, which is typed `Comment[]` and would have forced
    // a cast to carry an echo. The handler declares the four verbs it reaches; the GET path uses only
    // `listComments`, and the other three refuse rather than pretend, so a probe that ever replayed a
    // write fails loudly instead of comparing a fabricated answer.
    let composed: unknown;
    const refuse = () => Promise.reject(new Error('commentsMirrorProbe replays GETs only'));
    const backend: Parameters<typeof handleComments>[3] = {
      listComments: async (filter) => {
        composed = filter;
        return [];
      },
      createComment: refuse,
      updateComment: refuse,
      deleteComment: refuse,
    };
    const answered = await captureBody((res) => handleComments(req, res, url, backend, null));
    answers[target] = { ...answered, filter: composed ?? null };
  }
  out[file] = answers;
}
process.stdout.write(JSON.stringify(out));
