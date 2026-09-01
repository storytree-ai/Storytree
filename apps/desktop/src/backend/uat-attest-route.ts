// The desktop's `POST /api/uat/attest` mount — a local human's "I saw it work" turned into a REAL
// `operator-attested` proof-protocol Verdict and persisted through the injected, brokered
// `ForestWriter` (never a direct DB connection, ADR-0117 d.1/d.5).
//
// THE BOUNDARY CALL, unchanged by this extraction: this does NOT import apps/studio/server (ADR-0100
// / ADR-0176). It re-composes the same journey over the SAME shared organism primitives the studio
// handler is built from — `loadNodeSpec`, `resolvedWitnessOf`, and (inside `attestLocalUat`) the
// sign-time trust guard `checkUatProof`. The duplication is the decision; the drift it invites is
// the defect.
//
// ## WHY IT LIVES HERE RATHER THAN INSIDE backend-entry.ts
//
// It was an inline closure in `electron/backend-entry.ts`'s `main()`, reachable only by booting the
// whole Electron backend — a live pg pool, the IPC bridge to the Electron main process for the
// broker identity, the launch sequence. Nothing could call it, so `check:mirror-conformance` could
// not compare it against the studio's `POST /api/uat/attest`, which it is a hand-written copy of.
// `attestations-route.ts` was extracted for exactly this reason one increment earlier, and its own
// header records the same shape; `tree-verdicts.ts` set the precedent before that.
//
// The extraction moved NO logic: the body below is the closure verbatim, with its five ambient
// captures (`storiesDir`, the broker identity request, the session git state, the running agent
// identity, and the brokered writer) turned into an injected {@link UatAttestRouteDeps}. The ONE
// addition is {@link UatAttestRouteDeps.now} — the sign clock, which the closure read straight off
// `new Date()`. It is injected for the reason `attestLocalUat`'s own `at` already is ("keeps the
// compute deterministic and derives the verdict's `runId`"): two probes comparing this route against
// the studio's run in separate processes at different moments, so a wall-clock read here is
// nondeterminism ACROSS the payloads being compared, not merely an untestable line. Production
// passes `() => new Date().toISOString()`.
//
// PURE + pg-FREE: no `electron`, no `pg`, no `@storytree/library/store`. The identity, the git state
// and the persistence all arrive through the injected seam, and the compute they are folded with is
// browser-safe raw TS loaded lazily — the `.js` re-export trap this app already navigates.

import type { IncomingMessage, ServerResponse } from "node:http";

import { loadStorySpec } from "./attestations-route.js";
import { attestLocalUat, type AttestLocalUatInput } from "./local-uat-attest.js";
import type { ForestWriter } from "./local-backend.js";

/** Everything the mount reads that is not on disk — injected, so a probe can drive it DB-free. */
export interface UatAttestRouteDeps {
  /** Absolute path to the repo's `stories/` dir — the story spec is read from it. */
  storiesDir: string;
  /**
   * The resolved local operator identity signing this attestation. Production asks the Electron main
   * process for the broker identity; it is NEVER taken from the request body (a verdict's signer is
   * not forgeable — the studio's mirror of this wall is that the signer is the verified IAP caller).
   */
  resolveSigner: () => Promise<string>;
  /** The session repo's git state; the verdict pins this commit and REFUSES a dirty tree. */
  gitState: () => { commitSha: string; clean: boolean };
  /** The running agent/session identity, when present — fed to the no-self-attest trust guard. */
  agentIdentity: () => string | null;
  /** The brokered forest writer the built verdict is persisted through (ADR-0117). */
  forestWriter: ForestWriter;
  /** ISO sign time. Injected — see the module header for why this is not a `new Date()` here. */
  now: () => string;
}

/**
 * Read a JSON object request body, refusing anything that is not one and anything over 64 KiB.
 *
 * MOVED WITH THE MOUNT, not copied: `electron/backend-entry.ts` had exactly one other reference to
 * it — the `await` on line 599, which is this route's own — so leaving a second copy behind would
 * have been the duplication class this whole extraction serves.
 */
// Stryker disable CallExpression,StringLiteral,BlockStatement: NOT KILLABLE BY ASSERTION, and the
// tell is the STATUS rather than a judgement — every mutant this covers comes back `Timeout` with an
// empty `killedBy`, never `Survived`. This promise settles only from inside a stream listener, so
// removing a listener, its event name, its body, or the `resolveBody` call leaves it pending
// forever: the request never returns, the test hangs, and Stryker attributes a timeout to no test.
// They ARE detected; they cannot be credited — the same class, and the same call, as
// `packages/cli/src/web-experience-check.ts`'s non-terminating loop guards. What the mutants would
// break IS asserted, in `uat-attest-route.test.ts`: a body over the cap, a body at the cap, invalid
// JSON, a non-object body and an empty body each have a named test, and the happy path proves a
// body arrives at all. The mutators are re-enabled immediately after this function, so nothing
// outside it is covered — and the two mutants inside it that CAN be reached are handled
// individually below rather than being swept up here.
function readJsonObject(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        rejectBody(new Error("request body is too large"));
        // Also unreachable by assertion, for a SECOND reason worth keeping distinct from the block
        // above: this one is not a timeout but an effect on a live socket — it stops a real client
        // streaming at a body already refused, and every test here pushes a finite buffer that is
        // already in memory. The refusal itself IS asserted.
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          rejectBody(new Error("request body must be a JSON object"));
          return;
        }
        resolveBody(value as Record<string, unknown>);
      } catch {
        rejectBody(new Error("request body must be valid JSON"));
      }
    });
    req.on("error", rejectBody);
  });
}
// Stryker restore CallExpression,StringLiteral,BlockStatement

/**
 * Build the `POST /api/uat/attest` mount: `(req, res, pathname) => claimed?`.
 *
 * Returns `false` for a pathname this mount does not own, so the caller's route table keeps
 * dispatching — the shape `backend-entry.ts` already composes its other mounts with.
 */
export function createUatAttestMount(
  deps: UatAttestRouteDeps,
): (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<boolean> {
  return async (req, res, pathname) => {
    if (pathname !== "/api/uat/attest") return false;
    // Stryker disable next-line StringLiteral: EQUIVALENT here and only here. This fallback decides
    // what a method-LESS request is called while being refused, and every replacement is still
    // `!== "POST"`, so the 405 fires identically. The same literal on the line below is NOT
    // equivalent — it is what the refusal NAMES — and is asserted by the no-method test.
    if ((req.method ?? "GET") !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: `method ${req.method ?? "GET"} not allowed` }));
      return true;
    }

    const body = await readJsonObject(req);
    const storyId = typeof body["storyId"] === "string" ? body["storyId"].trim() : "";
    const criterionId =
      typeof body["criterionId"] === "string" ? body["criterionId"].trim() : "";
    if (storyId.length === 0 || criterionId.length === 0) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "storyId and criterionId are required" }));
      return true;
    }

    const { loadNodeSpec, resolvedWitnessOf } = await import("@storytree/orchestrator");
    // THE SHARED `loadStorySpec`, not a second hand-written lookup — containment guard AND catch in
    // one call. It was `containedStoryFile(...)` followed by a BARE `loadNodeSpec`, which is the
    // containment half without the absence half: `containedStoryFile` deliberately does not check
    // existence (its own docblock says both callers catch), so an ordinary missing-but-contained
    // `storyId` threw straight out of this mount while the studio answered 400. Found 2026-09-01 by
    // the first test that could reach this code at all — the extraction and the `uat-attest` mirror
    // row are what made it reachable — and it had been in `electron/backend-entry.ts` unobserved for
    // as long as the route existed. The mirror follows the reference, as `/api/comments` and
    // `/api/attestations` did before it.
    const spec = loadStorySpec(deps.storiesDir, storyId, loadNodeSpec);
    if (spec === null || spec.tier !== "story") {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: `story "${storyId}" was not found` }));
      return true;
    }

    const signer = await deps.resolveSigner();
    const attestingSession = deps.agentIdentity();
    const attestInput: AttestLocalUatInput = {
      criterionId,
      outcome: body["outcome"] === "fail" ? "fail" : "pass",
      at: deps.now(),
      tests: spec.uatTestCriteria.map((test) => ({
        criterionId: test.criterionId,
        revisionId: test.revisionId,
        witness: resolvedWitnessOf(test, spec.reliabilityGates),
      })),
      signer,
      git: deps.gitState(),
      forestWriter: deps.forestWriter,
    };
    const note = body["note"];
    if (typeof note === "string") attestInput.note = note;
    if (attestingSession !== null) attestInput.agentIdentity = attestingSession;
    const result = await attestLocalUat(attestInput);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (!result.ok) {
      res.statusCode = 422;
      res.end(JSON.stringify({ error: result.reason }));
      return true;
    }
    res.statusCode = 201;
    res.end(JSON.stringify({ verdict: result.verdict }));
    return true;
  };
}
