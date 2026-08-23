// The READ gatherer and the SUPPORT-GRAPH builder that the decision-measurement probes share
// (`probe:decision-baseline`, `probe:decision-control-set`).
//
// Extracted from `probe-decision-baseline.ts` when `decision-read-measurement-arc-inc-04` needed the
// same two populations, for the reason `probe-decisions.ts` already gives one file above: these
// probes are COMPARED AGAINST EACH OTHER across sessions, so they must not drift on the population
// they measure. A control set matched on reach that gathered reads even slightly differently from
// the baseline it is matched against would be matched to a number nobody ever measured.
//
// The gatherers could not simply be imported from the baseline probe: that file calls `main()` at
// module scope, so importing it would RUN the probe. The extraction is what makes one reader possible
// rather than a preference between two copies.

import {
  collectTranscriptFiles,
  scanTranscriptDecisionReads,
  DECISION_READ_SURFACES,
} from "@storytree/context-traversal-transcript";
import { decisionAmendsResolver, parseDecisionPointer } from "@storytree/library";

import type {
  DecisionEdge,
  DecisionReadObservation,
  DecisionSupportGraph,
} from "./decision-read-baseline.js";

/**
 * The SUPPORT graph as the pure halves need it: both edge populations, kept apart.
 *
 * `dependsOn` arrives as POINTERS, because a decision's own `dependsOn` may name a Library artifact
 * or a repository file as readily as another decision — the seam reports where edges came from and
 * never learns what they mean. Resolving which is which is this caller's job and it goes through the
 * ONE parser (`parseDecisionPointer`); a pointer that names something else is COUNTED, never dropped
 * silently and never rounded to the nearest decision.
 */
export function buildSupportGraph(
  rows: readonly { number: number; amends: readonly number[]; dependsOn?: readonly string[] }[],
): DecisionSupportGraph {
  const resolver = decisionAmendsResolver(rows);
  const known = new Set(resolver.decisions);
  const amends: DecisionEdge[] = [];
  const dependsOn: DecisionEdge[] = [];
  let dependsOnNonDecisionTargets = 0;

  for (const from of resolver.decisions) {
    for (const to of resolver.amendsOf(from)) {
      // A target the log does not hold is not walkable — counted nowhere as an edge rather than
      // creating a phantom node the chain walk could descend into.
      if (known.has(to)) amends.push({ from, to });
    }
    for (const pointer of resolver.dependsOnOf(from)) {
      const target = parseDecisionPointer(pointer);
      if (target === null) {
        dependsOnNonDecisionTargets += 1;
        continue;
      }
      if (known.has(target.number)) dependsOn.push({ from, to: target.number });
    }
  }

  return {
    decisions: resolver.decisions,
    amends,
    dependsOn,
    decisionsCarryingDependsOn: resolver.decisionsCarryingDependsOn,
    dependsOnNonDecisionTargets,
  };
}

export interface GatheredReads {
  readonly reads: readonly DecisionReadObservation[];
  readonly scannedFiles: number;
  /** Tool calls that named a decision and yielded no read — the blindness denominator, carried up. */
  readonly decisionMentions: number;
  /** Reads reached but not attributable to any storytree session (the primary checkout, mostly). */
  readonly uncorrelatedReads: number;
}

/**
 * Decision reads from the HOST TRANSCRIPTS, through the existing extractor and never a second one.
 *
 * That is the source rather than the trace store because it is the only one carrying the host CONTEXT
 * WINDOW id, and "how far down a chain did a session walk IN ONE SITTING" is a question about a
 * window, not about a pooled worktree slot. The trace store also holds decision reads, and the two
 * OVERLAP by construction, so unioning them would double-count every read both routes reached.
 */
export function gatherReads(transcriptDir: string): GatheredReads {
  const files = collectTranscriptFiles(transcriptDir);
  const reads: DecisionReadObservation[] = [];
  const seen = new Set<string>();
  let decisionMentions = 0;
  let uncorrelatedReads = 0;

  for (const file of files) {
    const scan = scanTranscriptDecisionReads(file);
    decisionMentions += scan.decisionMentions;
    uncorrelatedReads += scan.uncorrelatedReads;
    for (const read of scan.reads) {
      // The SAME dedup key `ingestDecisionReads` uses, for the same reason: one tool call that named
      // a decision twice is one read of it, and the transcript walk can reach one file more than once.
      const key = `${read.toolUseId} ${read.nodeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      reads.push({
        slotId: read.sessionId,
        windowId: read.windowId,
        nodeId: read.nodeId,
        at: read.at,
        surface: DECISION_READ_SURFACES[read.shape],
      });
    }
  }

  return { reads, scannedFiles: files.length, decisionMentions, uncorrelatedReads };
}
