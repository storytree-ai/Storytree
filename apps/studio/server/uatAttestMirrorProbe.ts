/**
 * The STUDIO half of the `POST /api/uat/attest` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it replays a fixture's request list
 * against this surface's own signing composition and prints what that composition handed its
 * PERSISTENCE SEAM, so the gate can diff it against the desktop's hand-written copy of the same
 * journey.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the boundary every probe here keeps (the desktop may never import
 * apps/studio/server, ADR-0176, enforced by `check:boundaries`), so the comparison is made on
 * decoded JSON by a third party rather than by one surface reaching into the other.
 *
 * WHY A CAPTURING BACKEND AND NOT A DATABASE (ADR-0495 D3). `ctx.backend.signUatVerdict` is the seam
 * this route persists through and it is an interface method with more than one implementation, so
 * wiring it to a capture needs no new machinery. It is also the ONLY isolation that is safe here:
 * `events.verdict` is append-only in the SHARED live store and is what green is made of, so a CI
 * step exercising the real write on every PR would append operator-attested verdicts nobody signed —
 * the failure already fenced by `--store pg` being refused for dry-runs. This probe holds no
 * credential at all, so no crash or misconfiguration can reach production.
 *
 * WHAT IT PRINTS IS THE BUILT VERDICT, NOT THE RESPONSE (ADR-0495 D2). The verdict is the artifact; a
 * 201 body is a receipt of it, and two surfaces that recorded different things can echo equally
 * plausible receipts. The refusal REASON rides alongside so a refused arm is compared on more than
 * its silence — see `projectUatAttestPayload` for what the judge does with each.
 *
 * Contract (shared with the desktop probe, apps/desktop/src/backend/uat-attest-mirror-probe.ts):
 *   argv: one or more absolute fixture DIRECTORIES, each holding `stories/` and `attest.json`
 *         (`{ signer, agentIdentity, commitSha, clean, at, requests }`)
 *   stdout: a single JSON object `{ [fixtureDir]: { [label]: { composed, refusedBecause } } }` —
 *           keyed by the ARG first, which is the protocol every probe here follows
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 */

import { readFileSync } from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import path from 'node:path';

import type { Verdict } from '@storytree/proof-protocol';

import { handleUatAttest, type Paths } from './apiRouter.js';
import { HttpError } from './httpUtil.js';

/** The shared fixture shape — the injected sign inputs plus the request list both probes replay. */
interface UatAttestFixture {
  signer: string;
  agentIdentity: string;
  commitSha: string;
  clean: boolean;
  at: string;
  requests: { label: string; signer?: string; body: Record<string, unknown> }[];
}

/** What each arm reports: what this surface composed for persistence, or why it refused. */
interface Composition {
  composed: Verdict | null;
  refusedBecause: string | null;
}

/**
 * A REAL `IncomingMessage` over an unconnected socket carrying a JSON body — the shape
 * `commentsMirrorProbe.ts` settled on (no `as unknown as` fake claiming to be something it shares
 * nothing with), with the body pushed ahead of the read so `readJsonBody`'s stream resolves.
 */
function jsonRequest(body: Record<string, unknown>): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  req.method = 'POST';
  req.url = '/api/uat/attest';
  req.headers['content-type'] = 'application/json';
  req.push(JSON.stringify(body));
  req.push(null);
  return req;
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('uatAttestMirrorProbe: expected one or more fixture directories as arguments');
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const dir of dirs) {
  const fixture = JSON.parse(readFileSync(path.join(dir, 'attest.json'), 'utf8')) as UatAttestFixture;
  const answers: Record<string, Composition> = {};
  for (const request of fixture.requests) {
    // The CAPTURING seam — see the header. `signUatVerdict` returns the saved verdict, which the
    // handler echoes into its 201 body; returning the verdict UNCHANGED is what the real pg backend
    // does too, so nothing about the composition under test is altered by capturing it.
    let composed: Verdict | null = null;
    const paths: Paths = {
      repoRoot: dir,
      docsDir: path.join(dir, 'docs'),
      storiesDir: path.join(dir, 'stories'),
      dataDir: path.join(dir, 'data'),
      commentsFile: path.join(dir, 'data', 'comments.json'),
      assetsFile: path.join(dir, 'data', 'assets.json'),
      usersFile: path.join(dir, 'data', 'users.json'),
      attestationsFile: path.join(dir, 'data', 'attestations.json'),
    };
    const res = new ServerResponse(new IncomingMessage(new Socket()));
    res.end = ((): ServerResponse => res) as ServerResponse['end'];
    let refusedBecause: string | null = null;
    try {
      await handleUatAttest(
        jsonRequest(request.body),
        res,
        {
          paths,
          backend: {
            signUatVerdict: async (verdict) => {
              composed = verdict;
              return verdict;
            },
          },
          // The injected sign clock — the fixture's fixed `at`. Two probes in two processes at two
          // moments would otherwise disagree on every verdict's `at` and `runId`.
          now: () => fixture.at,
        },
        // The VERIFIED caller, which is this route's signer. Injected rather than resolved: where an
        // identity comes from is each surface's own concern, and what it does with one is the
        // comparison. A per-request override is how the `sandbox:` arm varies it.
        request.signer ?? fixture.signer,
        fixture.commitSha,
      );
    } catch (err) {
      // A refusal is an `HttpError` on this surface; anything else is a broken probe and must not be
      // reported as a refusal — two surfaces that both crashed would otherwise compare equal.
      if (!(err instanceof HttpError)) throw err;
      refusedBecause = err.message;
    }
    answers[request.label] = { composed, refusedBecause };
  }
  out[dir] = answers;
}
process.stdout.write(JSON.stringify(out));
