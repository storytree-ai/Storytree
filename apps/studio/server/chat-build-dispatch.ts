// The chat-surface build dispatch (capability chat-build-dispatch, ADR-0108 d.3).
//
// `dispatchAcceptedBuild` is the mechanism the human's UI click drives after accepting a proposed
// unit id from the chat agent (capability 4). It reuses the EXISTING worker machinery
// (`createRun` → `runBuildJob`) exactly as `handleBuild`'s POST branch does — the DIFFERENCE is
// shape, not behaviour: a plain function returning a typed result the chat surface folds into its
// stream, rather than an HTTP handler.
//
// SAFE WRITE — INTENT, NEVER A VERDICT (ADR-0091): the dispatch hands the worker a unit id;
// it never accepts, signs, or persists a verdict. The worker inside `runBuildJob` observes
// RED→GREEN from real exit codes and signs; CI re-proves green before trunk (ADR-0022).
// This module holds no signing key and no DB connection.

import type { BuildContext } from './apiRouter.js';
import { runBuildJob } from './buildWorker.js';

/** The typed result `dispatchAcceptedBuild` returns — folded into the chat stream by the caller. */
export type DispatchResult =
  | { ok: true; runId: string }
  | { ok: false; reason: string };

/**
 * Dispatch a human-ACCEPTED unit id to the existing build worker, returning a typed result the
 * chat surface folds into its stream.
 *
 * - Validates `unitId` is buildable via `build.isBuildable` (typed `not buildable` refusal if not).
 * - Mints a run via `build.registry.createRun` (typed `a build is already running` refusal on
 *   the single-build guard).
 * - Fires `runBuildJob` fire-and-forget — progress streams into the registry run; the chat surface
 *   reads it back via the run's transcript / the shared GET /api/build?runId poll.
 * - Returns `{ ok: true, runId }` so the caller can track the build.
 *
 * Never throws on a known outcome (mirrors `handleBuild`'s typed-result discipline).
 */
export async function dispatchAcceptedBuild(
  unitId: string,
  build: BuildContext,
): Promise<DispatchResult> {
  // Validate — a non-buildable / unknown unit id is a typed refusal; the worker is never spawned
  // against nothing (mirrors handleBuild's isBuildable guard / its 404 surfaced as a typed result).
  if (!(await build.isBuildable(unitId))) {
    return { ok: false, reason: 'not buildable' };
  }

  // Mint a run — the single-build-at-a-time guard surfaces as a typed refusal (mirrors the 409).
  const created = build.registry.createRun(unitId);
  if (!created.ok) {
    return { ok: false, reason: created.reason };
  }

  const { runId } = created.run;

  // Fire-and-forget: the worker streams coarse progress into the registry run; runBuildJob never
  // throws (it records a failed terminal state), so the floating promise can't reject.
  void runBuildJob(build.registry, runId, unitId, build.runner);

  return { ok: true, runId };
}
