// The build worker — the server-process piece that drives a UI-triggered build (capability
// `ui-build-trigger`, ADR-0090 Phase 1). The API's POST handler starts it FIRE-AND-FORGET after it
// returns 202; this module does the actual driving.
//
// THE WORKER IS THE SINGLE ORCHESTRATOR BOUNDARY (ADR-0090 d.2 / ADR-0004 / ADR-0091): it invokes
// the EXISTING public build entry — `nodeBuild(unitId, { live: true, verdictStore: 'pg' })`, the same
// thing `pnpm storytree node build <id> --live` runs — and reaches inside NOTHING (not the gate, not
// the spine, not the SDK leaf). The verdict it persists is the gate's, signed by the spine; the
// worker never produces or hands in a verdict. It only: feed the build's COARSE progress into the
// run's transcript, then terminalise the run with the envelope.
//
// The runner is INJECTED so this module is fully offline-testable: the registry/API tests drive it
// with a fake runner (no SDK spend); production wires `buildRunnerFromNodeBuild` over the real
// (lazily-imported) `nodeBuild`. A live `--live` build is subscription-billed, so it runs only when
// an operator clicks Build — never on a gate pass.

import type { BuildRegistry } from './buildRegistry.js';

/**
 * The build result the worker consumes — structurally the CLI's `Envelope` ({ ok, body, next? }),
 * declared locally so this module needs no import of `@storytree/cli` (which would pull the agent
 * into the studio module graph). The production adapter coerces the real `Envelope` to this shape.
 */
export interface BuildEnvelope {
  ok: boolean;
  body: string;
  /** `readonly` to match the CLI's `Envelope.next` so the real envelope is assignable without a cast. */
  next?: readonly string[];
}

/**
 * Drives one build. `sink` receives COARSE progress lines as the build emits them (the worker
 * forwards each to the run's transcript). Resolves with the final {@link BuildEnvelope}; a thrown
 * error is treated as a failed build.
 */
export type BuildRunner = (unitId: string, sink: (line: string) => void) => Promise<BuildEnvelope>;

/** The Phase-1 options the worker passes to `nodeBuild` — single node, live mode, pg verdict store. */
export interface NodeBuildLikeOpts {
  live: boolean;
  verdictStore: string;
  real?: boolean;
  dryRun?: boolean;
  actor?: string;
}

/** The `nodeBuild` entry the production runner adapts (structurally `(id, opts) => Promise<Envelope>`). */
export type NodeBuildLike = (unitId: string, opts: NodeBuildLikeOpts) => Promise<BuildEnvelope>;

/**
 * Run a build to a terminal state, streaming its coarse progress into `registry`'s run `runId`.
 * Never throws: a failed build (envelope not ok) or a thrown runner is recorded as a `failed`
 * terminal state, never an unhandled rejection (this is started fire-and-forget). The registry's
 * single-build guard is released when the run terminalises.
 */
export async function runBuildJob(
  registry: BuildRegistry,
  runId: string,
  unitId: string,
  runner: BuildRunner,
): Promise<void> {
  registry.appendLine(runId, `▸ build started: ${unitId} (--live)`);
  try {
    const envelope = await runner(unitId, (line) => registry.appendLine(runId, line));
    // Append the envelope body as coarse lines BEFORE terminalising (a terminal run accepts no more
    // appends) so the final transcript carries the phase trail + verdict line.
    for (const line of envelope.body.split('\n')) registry.appendLine(runId, line);
    if (envelope.ok) {
      registry.terminalisePassed(runId, envelope.body);
    } else {
      registry.terminaliseFailed(runId, failureReason(envelope.body));
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    registry.appendLine(runId, `✗ ${reason}`);
    registry.terminaliseFailed(runId, reason);
  }
}

/** A concise failure line lifted from a non-ok envelope body (falls back to a generic message). */
function failureReason(body: string): string {
  const line = body
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /verdict:\s*NONE|failed|refus|error/i.test(l));
  return line ?? 'build failed';
}

/**
 * Adapt the existing `nodeBuild` entry into a {@link BuildRunner} with the Phase-1 options pinned:
 * single-node `--live` (a real SDK leaf authors through the real gate), `--store pg` (the gate's
 * signed verdict persists to events.verdict, lighting the wisp + updating the hue the world reads).
 * `nodeBuild` returns only its final envelope — it does not stream — so the `sink` is unused here;
 * the live "watch it run" signal in Phase 1 is the in-flight wisp (ADR-0048) plus the start marker
 * and the final envelope. (Turn-by-turn streaming is a noted follow-on.)
 */
export function buildRunnerFromNodeBuild(nodeBuild: NodeBuildLike, actor?: string): BuildRunner {
  return async (unitId) =>
    nodeBuild(unitId, {
      live: true,
      verdictStore: 'pg',
      ...(actor !== undefined ? { actor } : {}),
    });
}
