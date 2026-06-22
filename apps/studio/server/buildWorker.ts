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
  registry.appendLine(runId, `▸ build started: ${unitId}`);
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

/** The build a unit id resolves to: a STORY drives a whole-story chain, anything else a single NODE. */
export type BuildKind = 'node' | 'story';

/** The Phase-1/2 options the worker passes to `storyBuild` — whole story, real mode, pg verdict store. */
export interface StoryBuildLikeOpts {
  real: boolean;
  dryRun: boolean;
  verdictStore: string;
  actor?: string;
}

/** The `storyBuild` entry the production runner adapts (structurally `(id, opts) => Promise<Envelope>`). */
export type StoryBuildLike = (storyId: string, opts: StoryBuildLikeOpts) => Promise<BuildEnvelope>;

/** What {@link routedBuildRunner} composes: discovery + both public build entries (+ optional actor). */
export interface RoutedBuildDeps {
  /** Classify a unit id by tier — a story id routes to the whole-story chain, anything else a node. */
  classify: (unitId: string) => Promise<BuildKind>;
  nodeBuild: NodeBuildLike;
  storyBuild: StoryBuildLike;
  /** Optional signer/actor flag threaded to both entries (absent = the env-resolved signer). */
  actor?: string;
}

/**
 * A {@link BuildRunner} that routes by unit KIND (ADR-0090): a STORY id → `story build <id> --real`
 * — the honest whole-story chain (each node authored for real in a shared worktree, then the proven
 * chain promoted as a branch to land); a NODE id → `node build <id> --live` — the single-node build
 * that proves the PIPELINE on a synthetic task (not the node's real feature). Discovery (`classify`)
 * is injected, so this is fully offline-testable; the dev front wires it over the orchestrator's spec
 * discovery + the lazily-imported `nodeBuild`/`storyBuild`. Emits ONE coarse mode line, then defers
 * to the chosen entry's envelope.
 */
export function routedBuildRunner(deps: RoutedBuildDeps): BuildRunner {
  const actorOpt = deps.actor !== undefined ? { actor: deps.actor } : {};
  return async (unitId, sink) => {
    const kind = await deps.classify(unitId);
    if (kind === 'story') {
      sink('▸ mode: whole-story --real — authors each capability for real, then promotes a branch to land');
      return deps.storyBuild(unitId, { real: true, dryRun: false, verdictStore: 'pg', ...actorOpt });
    }
    sink('▸ mode: single-node --live — proves the build pipeline on a synthetic task');
    return deps.nodeBuild(unitId, { live: true, dryRun: false, real: false, verdictStore: 'pg', ...actorOpt });
  };
}
