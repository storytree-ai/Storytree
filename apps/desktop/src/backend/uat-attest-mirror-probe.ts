/**
 * The DESKTOP half of the `POST /api/uat/attest` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it replays a fixture's request list
 * against this surface's own signing composition and prints what that composition handed its
 * PERSISTENCE SEAM, so the gate can diff it against the studio's.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the desktop may never import apps/studio/server (ADR-0100 / ADR-0176, enforced by
 * `check:boundaries`), which is why the comparison is made on decoded JSON by a third party.
 *
 * WHY A CAPTURING `ForestWriter` AND NOT A DATABASE: see the studio half
 * (apps/studio/server/uatAttestMirrorProbe.ts) for the shared argument, plus one reason that is this
 * surface's alone — the desktop is architecturally FORBIDDEN from opening a DB connection
 * (ADR-0117 d.1/d.5) and persists through exactly this injected seam, so a database-backed
 * comparison would have to break that wall or compare only one side.
 *
 * IT DRIVES THE REAL MOUNT, not `attestLocalUat` directly. The wrapper is the drift surface — which
 * spec an id resolves to and whether that resolution is CONTAINED, which witness the trust guard is
 * fed, how the body is read — so a probe that composed those itself would BE the surface and leave
 * the copy under test unobserved. That is why the mount was extracted out of
 * `electron/backend-entry.ts` first (uat-attest-route.ts's header records it), the same move
 * `attestations-route.ts` needed one increment earlier.
 *
 * Contract (shared with the studio probe):
 *   argv: one or more absolute fixture DIRECTORIES, each holding `stories/` and `attest.json`
 *   stdout: a single JSON object `{ [fixtureDir]: { [label]: { composed, refusedBecause } } }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure.
 */

import { readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import path from "node:path";

import type { Verdict } from "@storytree/proof-protocol";

import { createUatAttestMount } from "./uat-attest-route.js";

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

/** A REAL `IncomingMessage` over an unconnected socket carrying a JSON body — the studio half's idiom. */
function jsonRequest(body: Record<string, unknown>): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  req.method = "POST";
  req.url = "/api/uat/attest";
  req.headers["content-type"] = "application/json";
  req.push(JSON.stringify(body));
  req.push(null);
  return req;
}

/** Capture the status and decoded JSON body the mount sends, without a socket. */
function captureBody(
  run: (res: ServerResponse) => Promise<void>,
): Promise<{ status: number; body: unknown }> {
  // A REAL ServerResponse over an unconnected socket, with only `end` swapped for a capture — the
  // idiom every probe here uses. The mount ends synchronously, so `raw` is set when `run` resolves.
  let raw = "";
  const res = new ServerResponse(new IncomingMessage(new Socket()));
  res.end = ((chunk?: unknown): ServerResponse => {
    raw = typeof chunk === "string" ? chunk : "";
    return res;
  }) as ServerResponse["end"];
  return run(res).then(() => ({ status: res.statusCode, body: raw === "" ? null : JSON.parse(raw) }));
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("uat-attest-mirror-probe: expected one or more fixture directories as arguments");
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const dir of dirs) {
  const fixture = JSON.parse(
    readFileSync(path.join(dir, "attest.json"), "utf8"),
  ) as UatAttestFixture;
  const answers: Record<string, Composition> = {};
  for (const request of fixture.requests) {
    // The CAPTURING writer — see the header. It answers `persisted: true` because this arm is about
    // what was COMPOSED: a writer that refused would exercise the desktop's delivery wall, which is
    // a wall the studio does not have and which its own suite proves (the row's `fenced-elsewhere`
    // clause). What is captured is the verdict handed over, unaltered.
    let composed: Verdict | null = null;
    const mount = createUatAttestMount({
      storiesDir: path.join(dir, "stories"),
      // Injected rather than resolved — the studio half's header explains why the signer source is
      // held constant across both surfaces. The per-request override is the `sandbox:` arm.
      resolveSigner: () => Promise.resolve(request.signer ?? fixture.signer),
      gitState: () => ({ commitSha: fixture.commitSha, clean: fixture.clean }),
      agentIdentity: () => fixture.agentIdentity,
      forestWriter: {
        write: (write) => {
          composed = write.payload as Verdict;
          return Promise.resolve({ persisted: true, status: 201, body: null });
        },
      },
      now: () => fixture.at,
    });
    const answered = await captureBody(async (res) => {
      // A pathname this mount does not claim is a probe-visible fact, not a silent empty: every
      // request replayed here is `POST /api/uat/attest`, so a `false` means the dispatch guard
      // itself moved — and a fabricated answer would be compared as if the surface had given it.
      const claimed = await mount(jsonRequest(request.body), res, "/api/uat/attest");
      if (!claimed) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "unclaimed by the uat-attest mount" }));
      }
    });
    const body = answered.body as { error?: unknown } | null;
    answers[request.label] = {
      composed,
      // A refusal on this surface is a non-201 carrying `{ error }`. Read off the answer rather than
      // off the refusal object so the ENVELOPE the mount composes is inside what is reported.
      refusedBecause:
        answered.status === 201 ? null : typeof body?.error === "string" ? body.error : null,
    };
  }
  out[dir] = answers;
}
process.stdout.write(JSON.stringify(out));
