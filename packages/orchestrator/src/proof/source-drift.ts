import type { ChangeEvent, DriftState } from "@storytree/proof-protocol";

/**
 * The source-drift COMPUTE (ADR-0016 §4). MOVED here from `@storytree/core`'s `source-drift.ts`
 * (ADR-0068 step 1): classifying whether an artifact's UPSTREAM sources drifted is the farmer
 * organism's ruler. The DATA it reads ({@link ChangeEvent}, {@link DriftState}) is the verdict
 * CONTRACT's; {@link SourceRef}/{@link SourceDriftFlag} are this compute's own result shapes.
 */

/** One `derives_from` upstream of an artifact: its id + the content-hash bound when the artifact derived from it. */
export interface SourceRef {
  /** The upstream artifact/ADR id (a `derives_from` edge target). */
  id: string;
  /** The upstream's content-hash (hashSpan) bound at derive time — the source anchor this drifts against. */
  boundHash: string;
}

/** The result of a source-drift check — ADR-0016 §4's signal, mirroring DriftFlag's three honest states. */
export interface SourceDriftFlag {
  /** `fresh` | `stale` | `drifted-undescribed` (the same DriftState as code-drift). */
  state: DriftState;
  /** True iff ANY upstream's current hash differs from the hash bound at derive time. */
  drifted: boolean;
  /** The ids of the upstreams that changed (current hash ≠ bound hash), in `sources` order. */
  changedSources: string[];
  /** The latest DESCRIBED change explaining a changed upstream — present ONLY for `stale`. */
  description: string | undefined;
}

export function classifySourceDrift(
  sources: readonly SourceRef[],
  currentHashes: ReadonlyMap<string, string>,
  changes: readonly ChangeEvent[],
): SourceDriftFlag {
  // 1. changedSources: upstreams whose current hash is present AND differs from bound hash.
  //    An absent upstream is "unknown", NOT drifted (conservative ADR-0016 bias).
  const changedSources: string[] = sources
    .filter((s) => {
      const current = currentHashes.get(s.id);
      return current !== undefined && current !== s.boundHash;
    })
    .map((s) => s.id);

  // 2. drifted flag
  const drifted = changedSources.length > 0;

  // 3. fresh
  if (!drifted) {
    return { state: "fresh", drifted: false, changedSources: [], description: undefined };
  }

  // 4. Described-change gate: changes that explain a changed upstream.
  const described = changes.filter(
    (c) =>
      changedSources.includes(c.unitId) &&
      c.description !== undefined &&
      c.description.trim().length > 0,
  );

  if (described.length === 0) {
    return {
      state: "drifted-undescribed",
      drifted: true,
      changedSources: changedSources.slice(),
      description: undefined,
    };
  }

  // Some described changes exist — pick the latest by `at`.
  const latest = described.reduce((a, b) => (b.at >= a.at ? b : a));

  return {
    state: "stale",
    drifted: true,
    changedSources: changedSources.slice(),
    description: latest.description,
  };
}
