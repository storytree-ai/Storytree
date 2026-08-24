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

import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  collectTranscriptFiles,
  scanTranscriptDecisionReads,
  DECISION_READ_SURFACES,
} from "@storytree/context-traversal-transcript";
import { decisionSupportResolver, parseDecisionPointer } from "@storytree/library";

import { frozenEdgesWithinCorpus, parseAmendsSnapshot } from "./amends-snapshot.js";

import type {
  DecisionEdge,
  DecisionReadObservation,
  DecisionSupportGraph,
} from "./decision-read-baseline.js";

/**
 * The frozen `amends` edge set's home. ADR-0431 D2: never regenerated, never edited.
 *
 * Module-relative rather than cwd-relative, because a probe is run from the repo root, from
 * `packages/cli`, and from a worktree, and the file it must read is the same one every time.
 */
const SNAPSHOT_PATH = fileURLToPath(
  new URL("../../../docs/research/amends-edge-snapshot-2026-08-23.md", import.meta.url),
);

/**
 * WORLD: the 517 pre-migration `amends` edges, read back out of the committed snapshot.
 *
 * ## WHY AN INSTRUMENT READS A FILE INSTEAD OF THE CORPUS
 *
 * `-inc-18` migrated every `amends` edge onto `dependsOn` in place and `-inc-19` deleted the field,
 * so the live rows cannot supply this population at all. That is not a corpus that stopped being
 * amended — it is a JOIN KEY that was retired underneath a set of comparisons frozen before it went,
 * and in a probe's output the two are indistinguishable: both read 0.
 *
 * Measured 2026-08-24, before the fix: a live-sourced `probe:amends-reach` read ONE edge and
 * reported the frozen window's 203 chain-walkers as 0, while its read population reconciled 401/401.
 * Every probe here carries frozen constants of that kind, so all of them join against this file.
 *
 * REFUSES rather than degrades. A snapshot that no longer matches its own declared count is evidence
 * of an edit ADR-0431 D2 forbids, and measuring a different experiment under this name is worse than
 * not measuring.
 */
export function frozenAmendsEdges(): readonly DecisionEdge[] {
  const parsed = parseAmendsSnapshot(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  if (parsed.problems.length > 0) {
    throw new Error(
      `the frozen amends snapshot could not be read as authoritative (${SNAPSHOT_PATH}): ` +
        parsed.problems.join("; "),
    );
  }
  return parsed.edges;
}

/**
 * The SUPPORT graph as the pure halves need it: both edge populations, kept apart.
 *
 * ## `amends` IS A PARAMETER, AND ITS BEING REQUIRED IS THE POINT
 *
 * There is no live source for it any more (ADR-0431 D1 retired the field), so this function cannot
 * derive it — and a defaulted empty list would let every caller silently report 0 against a frozen
 * constant, which reads as a collapse rather than as a missing input. Callers pass
 * {@link frozenAmendsEdges}; a caller that genuinely wants no `amends` arm passes `[]` and has said
 * so out loud.
 *
 * `dependsOn` stays LIVE and arrives as POINTERS, because a decision's own `dependsOn` may name a
 * Library artifact or a repository file as readily as another decision — the seam reports where
 * edges came from and never learns what they mean. Resolving which is which is this caller's job and
 * it goes through the ONE parser (`parseDecisionPointer`); a pointer that names something else is
 * COUNTED, never dropped silently and never rounded to the nearest decision.
 */
export function buildSupportGraph(
  rows: readonly { number: number; dependsOn?: readonly string[] }[],
  amendsEdges: readonly DecisionEdge[],
): DecisionSupportGraph {
  const resolver = decisionSupportResolver(rows);
  const known = new Set(resolver.decisions);
  const dependsOn: DecisionEdge[] = [];
  let dependsOnNonDecisionTargets = 0;

  for (const from of resolver.decisions) {
    for (const pointer of resolver.dependsOnOf(from)) {
      const target = parseDecisionPointer(pointer);
      if (target === null) {
        dependsOnNonDecisionTargets += 1;
        continue;
      }
      if (known.has(target.number)) dependsOn.push({ from, to: target.number });
    }
  }

  // A target the log does not hold is not walkable — dropped rather than allowed to create a phantom
  // node the chain walk could descend into, the same discipline the `dependsOn` loop applies above.
  const amends = frozenEdgesWithinCorpus(amendsEdges, resolver.decisions).edges;

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
