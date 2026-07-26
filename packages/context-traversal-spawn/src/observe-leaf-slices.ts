/**
 * The build spawn boundary adapter (ADR-0235 / ADR-0241): turn one build's per-slice leaf run
 * accounting into linked parent/child context-traversal lanes.
 *
 * Pure observer. No filesystem, no clock of its own beyond an injected one, no `@storytree/agent`,
 * no `@storytree/drive`. `LeafSliceRun` is declared structurally here — matching what the SDK leaf
 * already collects per authoring slice (`SdkRunInfo` in `packages/agent/src/sdk-author.ts`, read
 * structurally by `sliceUsageDocs()` in `packages/drive/src/usage.ts`) — so this package never
 * imports the agent organism and every proof here runs offline.
 */

import {
  ContextTraversalCoverage,
  ContextTraversalEvent,
  CoverageFeature,
} from "@storytree/context-traversal-telemetry";

/** The four token axes a leaf slice reports; the wire twin of `TokenUsage` (`@storytree/agent`). */
export interface LeafSliceUsage {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
}

/**
 * One authoring slice's run accounting, structurally declared (never imported) so this package
 * stays free of the agent organism. Matches what the SDK leaf collects per phase.
 */
export interface LeafSliceRun {
  phase: string;
  subtype: string;
  turns: number;
  costUsd?: number;
  usage?: LeafSliceUsage;
  byModel?: Record<string, LeafSliceUsage & { costUsd?: number; contextWindow?: number }>;
}

export interface ObserveLeafSlicesArgs {
  parentSessionId: string;
  runId: string;
  unitId: string;
  runs: readonly LeafSliceRun[];
  /** Injected clock — this observer has no clock of its own. */
  now: () => Date;
  /** Injected id generator — this observer mints no identity of its own beyond composed ids. */
  nextId: () => string;
}

const AUTHOR_TEST_PHASE = "AUTHOR_TEST";
const RED_BUILDER_AGENT = "red-builder";
const GREEN_BUILDER_AGENT = "green-builder";

function agentTypeFor(phase: string): string {
  return phase === AUTHOR_TEST_PHASE ? RED_BUILDER_AGENT : GREEN_BUILDER_AGENT;
}

/**
 * `__` is the separator (not `:`): a child session id is also a filename (`<sessionId>.jsonl`), and
 * `:` is illegal in a path segment on Windows — a colon-separated id silently drops the sink's
 * write (`catch { return false }`, measured, not theorised). `__` stays legal across every
 * supported platform while keeping the id composed from the declared build identity alone.
 */
function childSessionIdFor(parentSessionId: string, runId: string, unitId: string, phase: string): string {
  return `${parentSessionId}__build__${runId}__${unitId}__${phase}`;
}

function isSuccess(subtype: string): boolean {
  return subtype === "success";
}

/**
 * Pass-through, never a lookup/estimate: the capacity carried onto a child's aggregate
 * `model_context` observation is present only when this slice's `byModel` declares exactly ONE
 * distinct positive window. Two models declaring the SAME window is unambiguous; two models
 * declaring DIFFERENT windows is ambiguous and must never be guessed; a declared `0` or negative
 * value is not a capacity (the vocabulary is `count.positive()`); no declaration at all leaves
 * nothing to attribute.
 */
function contextWindowCapacityFor(byModel: LeafSliceRun["byModel"]): number | undefined {
  if (byModel === undefined) return undefined;
  const declaredWindows = new Set<number>();
  for (const model of Object.values(byModel)) {
    if (model.contextWindow !== undefined && model.contextWindow > 0) {
      declaredWindows.add(model.contextWindow);
    }
  }
  return declaredWindows.size === 1 ? [...declaredWindows][0] : undefined;
}

/**
 * Contract 8: a slice declaring exactly one `byModel` key sends that key OUT as `modelId` — a
 * `byModel` key becomes runtime-declared metadata on the wire, independent of whether a window was
 * also declared or valid. Two or more declared keys is ambiguous (which key produced this
 * observation?) and must never be guessed; no `byModel` at all leaves nothing to attribute.
 */
function modelIdFor(byModel: LeafSliceRun["byModel"]): string | undefined {
  if (byModel === undefined) return undefined;
  const keys = Object.keys(byModel);
  return keys.length === 1 ? keys[0] : undefined;
}

/**
 * Turn one build's authoring slices into a chronological `ContextTraversalEvent[]`: for each
 * slice, a `spawn_handoff` on the parent, an optional `model_context` on the child (only when the
 * slice reported usage), and a `result_return` on the parent — the same `edgeId` joining the
 * handoff and the return.
 */
export function observeLeafSlices(args: ObserveLeafSlicesArgs): ContextTraversalEvent[] {
  const { parentSessionId, runId, unitId, runs, now, nextId } = args;
  const events: ContextTraversalEvent[] = [];

  for (const run of runs) {
    const childSessionId = childSessionIdFor(parentSessionId, runId, unitId, run.phase);
    const edgeId = nextId();

    events.push({
      kind: "spawn_handoff",
      eventId: nextId(),
      sessionId: parentSessionId,
      at: now().toISOString(),
      edgeId,
      parentSessionId,
      childSessionId,
      agentType: agentTypeFor(run.phase),
    });

    if (run.usage !== undefined) {
      const totalInputTokens =
        run.usage.inputTokens + run.usage.cacheCreationInputTokens + run.usage.cacheReadInputTokens;
      const contextWindowCapacity = contextWindowCapacityFor(run.byModel);
      const modelId = modelIdFor(run.byModel);
      events.push({
        kind: "model_context",
        eventId: nextId(),
        sessionId: childSessionId,
        at: now().toISOString(),
        cumulativeInputTokens: totalInputTokens,
        addedInputTokens: totalInputTokens,
        ...(contextWindowCapacity !== undefined ? { contextWindowCapacity } : {}),
        ...(modelId !== undefined ? { modelId } : {}),
      });
    }

    const ok = isSuccess(run.subtype);
    events.push({
      kind: "result_return",
      eventId: nextId(),
      sessionId: parentSessionId,
      at: now().toISOString(),
      edgeId,
      parentSessionId,
      childSessionId,
      ...(run.usage !== undefined ? { resultTokenCount: run.usage.outputTokens } : {}),
      ok,
    });
  }

  return events;
}

/**
 * Exhaustive coverage declaration for this adapter: `supported` names exactly what
 * {@link observeLeafSlices} emits; `omitted` is every remaining member of the closed
 * `CoverageFeature` domain, derived from the vocabulary itself so a future addition cannot leave a
 * silent gap.
 */
const SUPPORTED_FEATURES = [
  "surface:spawned_agent",
  "surface:claude_sdk",
  "event:spawn_handoff",
  "event:model_context",
  "event:result_return",
  "field:model_tokens",
  "field:child_context_window",
  "field:context_window_capacity",
] as const;

const supportedSet = new Set<string>(SUPPORTED_FEATURES);

export const BUILD_SPAWN_BOUNDARY_COVERAGE = ContextTraversalCoverage.parse({
  adapterId: "context-traversal-spawn/observe-leaf-slices",
  supported: SUPPORTED_FEATURES,
  omitted: CoverageFeature.options.filter((feature) => !supportedSet.has(feature)),
});
