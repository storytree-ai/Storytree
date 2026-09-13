import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { nodeEvalExecutor, proveUnit } from "@storytree/orchestrator";
import type { ProveResult, ProveSpec } from "@storytree/orchestrator";
import type { AuthorResult, PhaseAuthor } from "@storytree/agent";

/**
 * `node-build-renders-only-returned-confirm-observation`: `packages/drive/src/node-build.ts`'s
 * failure envelope must LABEL and RENDER the ELIGIBLE CONFIRM observation `proveUnit` actually
 * RETURNED on `ProveResult.failedObservation` — with the run and unit it belongs to — and must
 * never invent one (an ABSENT observation, e.g. an AUTHOR_TEST/IMPLEMENT/GATE refusal, renders
 * nothing). "Renders ONLY the RETURNED observation" is the whole contract: the renderer consumes
 * data `proveUnit` already computed, it never spawns a command of its own to manufacture one.
 *
 * At HEAD, `nodeBuild`'s failure envelope prints only `result.failedAt`/`result.reason` — the
 * transported `failedObservation` (stdout/stderr/exit code of the actual failing run,
 * `final-confirm-refusal-carries-one-original-observation`) is silently dropped. This test drives
 * a REAL `proveUnit` walk (a no-op scripted author + a real `ShellTestExecutor`-backed ordinary
 * child command, via the orchestrator's own `nodeEvalExecutor` test helper) to obtain the ACTUAL
 * returned failure, then hands it to the shared same-file renderer `node-build.ts` is expected to
 * expose — probed by NAME on the dynamically-imported module namespace, never destructured at the
 * import statement, so an absent-today export surfaces as a plain "is not a function" once called,
 * not as a module-resolution failure (the whole-module import always succeeds).
 */

const UNIT_ID = "node-build-refusal-observation-unit-fixture";
const RUN_ID = "node-build-refusal-observation-run-fixture";
const STDOUT_MARKER = "NODE_BUILD_OBS_STDOUT_MARKER";
const STDERR_MARKER = "NODE_BUILD_OBS_STDERR_MARKER";

/** A no-op author: writes nothing in either authoring phase — the spine's own observation decides. */
const noopAuthor: PhaseAuthor = {
  async author(): Promise<AuthorResult> {
    return { ok: true };
  },
};

type ConfirmObservation = { stdout: string; stderr: string; exitCode: number | null };

/** The shape of the not-yet-existing shared renderer `node-build.ts` is expected to export. */
type FailedConfirmObservationRenderer = (
  unitId: string,
  runId: string,
  observation: ConfirmObservation | undefined,
) => string[];

/**
 * Probe `node-build.ts`'s namespace for the shared renderer BY NAME, never by a destructuring
 * import — a whole-module dynamic import always succeeds regardless of what the module exports,
 * so the missing-today case surfaces only once the (undefined) value is actually CALLED, as a
 * plain runtime "is not a function", not as an import/module-resolution failure.
 */
async function loadFailedConfirmObservationRenderer(): Promise<FailedConfirmObservationRenderer> {
  const nodeBuildModule = (await import("./node-build.js")) as unknown as Record<string, unknown>;
  return nodeBuildModule["renderFailedConfirmObservation"] as FailedConfirmObservationRenderer;
}

/**
 * Drive a genuine CONFIRM_GREEN refusal through the real `proveUnit` gate: a command fixed at
 * `process.exitCode = 1` can never observe green, so AUTHOR_TEST/IMPLEMENT no-op past it and
 * CONFIRM_GREEN refuses with `failedObservation` carrying THIS run's real, spawned stdout/stderr.
 */
async function driveRealConfirmGreenFailure(): Promise<Extract<ProveResult, { ok: false }>> {
  const script =
    `console.log(${JSON.stringify(STDOUT_MARKER)}); ` +
    `process.stderr.write(${JSON.stringify(STDERR_MARKER)}); ` +
    "process.exitCode = 1;";
  const testExecutor = nodeEvalExecutor({ [UNIT_ID]: script });
  const spec: ProveSpec = {
    unitId: UNIT_ID,
    proofMode: "contract",
    testId: UNIT_ID,
    author: noopAuthor,
    testExecutor,
    store: new InMemoryStore(),
    signerInputs: { flag: "tester@example.com" },
    treeState: async () => ({ commitSha: "node-build-refusal-observation-fixture-tree", clean: true }),
    now: () => "2024-01-01T00:00:00.000Z",
    prompts: {
      authorTest: "author the failing test",
      implement: "implement against the authored test",
    },
    runId: RUN_ID,
  };
  const result = await proveUnit(spec);
  assert.equal(result.ok, false, "a command fixed at exitCode 1 can never be observed green");
  return result as Extract<ProveResult, { ok: false }>;
}

test("node-build-renders-only-returned-confirm-observation: labels the returned CONFIRM_GREEN observation with its run and unit, verbatim, without executing a command", async () => {
  const result = await driveRealConfirmGreenFailure();

  // Ground truth first — genuine, ALREADY-correct behaviour this test's renderer assertion builds
  // on (`proveUnit` already transports the exact observation that caused the refusal).
  assert.equal(result.failedAt, "CONFIRM_GREEN");
  assert.notEqual(
    result.failedObservation,
    undefined,
    "a CONFIRM_GREEN refusal must carry the original observation that caused it",
  );
  const observation = result.failedObservation as ConfirmObservation;
  assert.equal(observation.exitCode, 1);
  assert.match(observation.stdout, new RegExp(STDOUT_MARKER));
  assert.match(observation.stderr, new RegExp(STDERR_MARKER));

  // Act: hand the RETURNED observation to the production renderer.
  const renderFailedConfirmObservation = await loadFailedConfirmObservationRenderer();
  const rendered = renderFailedConfirmObservation(UNIT_ID, RUN_ID, observation).join("\n");

  assert.match(
    rendered,
    new RegExp(RUN_ID),
    "the rendered observation must attribute the run it belongs to",
  );
  assert.match(
    rendered,
    new RegExp(UNIT_ID),
    "the rendered observation must attribute the unit it belongs to",
  );
  assert.match(
    rendered,
    new RegExp(STDOUT_MARKER),
    "the rendered observation must carry the RETURNED stdout verbatim — never re-executed",
  );
  assert.match(
    rendered,
    new RegExp(STDERR_MARKER),
    "the rendered observation must carry the RETURNED stderr verbatim — never re-executed",
  );
});

test("node-build-renders-only-returned-confirm-observation: an ABSENT observation (a non-CONFIRM refusal) renders nothing — the renderer never manufactures one", async () => {
  const renderFailedConfirmObservation = await loadFailedConfirmObservationRenderer();

  const rendered = renderFailedConfirmObservation(UNIT_ID, RUN_ID, undefined);

  assert.deepEqual(
    rendered,
    [],
    "no returned observation is eligible to render — the renderer must not invent or fetch one",
  );
});
