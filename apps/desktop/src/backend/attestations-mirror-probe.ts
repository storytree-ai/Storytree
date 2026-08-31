/**
 * The DESKTOP half of the `GET /api/attestations` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it replays a fixture's request list
 * against this surface's own `/api/attestations` mount and prints what it answered, so the gate can
 * diff it against the studio payload it is a hand-written copy of.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the boundary that makes the whole harness legal. This backend re-composes the
 * studio's route over its own seam and may never import apps/studio/server (ADR-0100 / ADR-0176;
 * `check:boundaries` enforces the wall), so conformance is established by a third party comparing
 * two JSON payloads, never by either side importing the other.
 *
 * WHAT MADE THIS PAIR PROBE-ABLE. The mount was an inline closure inside
 * `electron/backend-entry.ts`'s `main()`, reachable only by booting the whole Electron backend — a
 * live pg pool, a real attestation store, the launch sequence. It was extracted to
 * `attestations-route.ts` in the landing that registered this row; the extraction moved no logic and
 * the module's header records what the first comparison then measured.
 *
 * WHAT IS AT RISK. The compute is shared — `loadNodeSpec`, `deriveAttestations`, `resolvedWitnessOf`
 * / `unresolvedUatLegs`, `rollupCriterionStatus` / `rollupStoryUat`, all from @storytree/orchestrator
 * and all called by both surfaces. What is hand-copied is the READ and the ENVELOPE: which file the
 * `storyId` resolves to, whether an id that escapes the stories root is refused, the 400 for a
 * missing id, the row assembly, and which of `storyUat` / `unresolvedWitnesses` / `proven` /
 * `detailArtifactId` ride the wire at all.
 *
 * Contract (shared with the studio probe, apps/studio/server/attestationsMirrorProbe.ts):
 *   argv: one or more absolute fixture DIRECTORY paths, each holding `attestations.json`
 *         (`{ attestationEvents, verdictEvents, requests }`) plus a `stories/` tree
 *   stdout: a single JSON object `{ [fixtureDir]: { [label]: { status, body } } }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure.
 *
 * The answers are printed VERBATIM: the third party owns the projection into comparable entries
 * (`projectAttestationsPayload` in packages/cli/src/mirror-conformance.ts), so the two probes cannot
 * drift in how they reshape what they measured.
 */

import { readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import path from "node:path";

import { createAttestationsMount } from "./attestations-route.js";

/** The shared fixture shape — the two event streams plus the requests to replay. */
interface AttestationsFixture {
  attestationEvents: { seq: number; doc: unknown }[];
  verdictEvents: { kind: string; seq: number; doc: unknown }[] | null;
  requests: { label: string; method: string; path: string }[];
}

/** Capture the status + JSON body a handler sends, without a socket. */
async function capture(
  run: (res: ServerResponse) => Promise<void>,
): Promise<{ status: number; body: unknown }> {
  // A REAL ServerResponse over an unconnected socket, with only `end` swapped for a capture — the
  // studio half's idiom, and the same reason: no `as unknown as` fake claiming to be something it
  // shares nothing with. The mount ends synchronously once it has written.
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
  console.error(
    "attestations-mirror-probe: expected one or more fixture directory paths as arguments",
  );
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const dir of dirs) {
  const fixture = JSON.parse(
    readFileSync(path.join(dir, "attestations.json"), "utf8"),
  ) as AttestationsFixture;

  const mount = createAttestationsMount({
    storiesDir: path.join(dir, "stories"),
    readAttestationEvents: async () => fixture.attestationEvents,
    readVerdictEvents: async () => fixture.verdictEvents,
  });

  const answers: Record<string, unknown> = {};
  for (const request of fixture.requests) {
    const url = new URL(request.path, "http://localhost");
    const req = new IncomingMessage(new Socket());
    req.method = request.method;
    req.url = request.path;
    answers[request.label] = await capture(async (res) => {
      // A pathname this mount does not claim is a probe-visible FACT, not a silent empty: the
      // fixture only ever replays `/api/attestations`, so a `false` here means the dispatch guard
      // itself moved, and the 200-vs-404 shows up in the projection's `response:` entry.
      const claimed = await mount(req, res, url.pathname);
      if (!claimed) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "unclaimed by the attestations mount" }));
      }
    });
  }
  out[dir] = answers;
}
process.stdout.write(JSON.stringify(out));
