import type { SdkRunInfo } from "@storytree/agent";
import { usageEvent } from "@storytree/orchestrator";
import type { UsageEventDoc } from "@storytree/proof-protocol";
import type { Store } from "@storytree/storage-protocol";

/**
 * Per-slice token-usage persistence: map the SDK leaf's run accounting
 * ({@link SdkRunInfo}, collected by `ClaudeAgentAuthor.runs`) into `UsageEventDoc`s and append
 * them to the build's event store — `events.usage_event` under `--store pg` (a real build), the
 * in-memory store otherwise (a dry-run/live smoke's accounting honestly dies with the run, like
 * its verdict).
 *
 * ACCOUNTING, never proof: usage rides its own event kind (the signed verdict deliberately
 * carries no runtime cost), `rollupStatus` ignores it, and the append is ADVISORY — a failed
 * accounting write logs and never fails a green build (the phaseActivityWriter posture).
 */

/** The identity a build run stamps on its usage rows. */
export interface UsageRunIds {
  unitId: string;
  runId: string;
  /** The configured leaf model (the coarse label; the doc's byModel split carries the truth). */
  model?: string;
}

/**
 * Map one build's leaf slices to usage docs. Pure. A slice that reported no token breakdown is
 * SKIPPED (capture is additive — there is nothing honest to persist for it); the doc keeps the
 * slice's coarse turns/costUsd accounting alongside the breakdown.
 */
export function sliceUsageDocs(ids: UsageRunIds, runs: readonly SdkRunInfo[]): UsageEventDoc[] {
  const docs: UsageEventDoc[] = [];
  for (const run of runs) {
    if (run.usage === undefined) continue;
    docs.push({
      unitId: ids.unitId,
      runId: ids.runId,
      phase: run.phase,
      source: "sdk-leaf",
      usage: run.usage,
      turns: run.turns,
      costUsd: run.costUsd,
      ...(ids.model !== undefined ? { model: ids.model } : {}),
      ...(run.byModel !== undefined ? { byModel: run.byModel } : {}),
    });
  }
  return docs;
}

/**
 * Append one build's per-slice usage to the store, best-effort: returns the number of rows
 * appended; a store/validation failure is reported through `warn` and swallowed — accounting
 * must never fail a build that already proved (or honestly failed) its unit.
 */
export async function appendSliceUsage(
  store: Store,
  ids: UsageRunIds,
  runs: readonly SdkRunInfo[],
  signer: string,
  warn: (message: string) => void = (m) => console.error(`[usage] ${m}`),
): Promise<number> {
  let appended = 0;
  for (const doc of sliceUsageDocs(ids, runs)) {
    try {
      await store.appendEvent(usageEvent(doc, signer));
      appended += 1;
    } catch (e) {
      warn(`usage event for ${doc.unitId} (${doc.phase}) did not persist: ${(e as Error).message}`);
    }
  }
  return appended;
}
