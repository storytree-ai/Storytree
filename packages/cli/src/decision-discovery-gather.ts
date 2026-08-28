/**
 * THE WORLD-TOUCHING HALF of the DECISION DISCOVERY section — the one composition that turns a live
 * store plus this machine's host transcripts into a {@link DecisionDiscoveryReading}.
 *
 * `decision-discovery.ts` is PURE by construction (the caller supplies a computed baseline), which is
 * what makes its gate ordering testable without a database or a disk. This file is the deliberate
 * other half: the reads, in one place, so a second surface cannot compose them slightly differently.
 * It is the same split `factory-health-read.ts` draws for questions 1 and 2.
 *
 * ## IT REUSES THE PROBE'S GATHERERS AND NEVER A SECOND COPY (ADR-0444 D1)
 *
 * `gatherReads`, `buildSupportGraph` and `frozenAmendsEdges` are the SAME functions
 * `probe:decision-baseline` calls, for the reason `probe-decision-gather.ts` was extracted in the
 * first place: these numbers are compared against each other across sessions, so a second
 * implementation becomes a second experiment the moment either drifts. The one thing this file does
 * differently is deliberate and stated below — it gathers no offers.
 *
 * ## NO OFFERS ARE GATHERED, SO THE TRAVERSAL TRACE STORE IS NEVER OPENED
 *
 * The section computes no offer figure (see `decision-discovery.ts` for why offer-to-follow is
 * deferred), so `offers: []` here is not a shortcut or a degraded read — it is the absence of a
 * question. That is what keeps this composition free of the one substrate currently in motion, and
 * it is why the section's refusal check is scoped rather than reusing
 * `decisionReadBaselineVacuity`, which would read an offer-free input as a blind instrument.
 *
 * ## THE DECISION LOG COMES FROM THE STORE THE CALLER ALREADY HOLDS
 *
 * `loadProbeDecisions` opens its OWN corpus store, which is right for a standalone probe and wrong
 * here: `factory health` is already holding a store, and a verb that opened a second connection to
 * read the same rows could report figures the rest of its own report disagreed with. So this reads
 * through `loadTitledAdrMetasFromStore` directly — the same function `loadProbeDecisions` wraps —
 * and keeps that wrapper's EMPTY-IS-AN-ERROR rule, because zero decisions means an unmigrated,
 * wrong or unreachable store and never a decision log that happens to hold none.
 *
 * ## ONE SWEEP, TWO READINGS — AND THE SECOND IS NOT A SECOND EXPERIMENT
 *
 * Reach is read over a TRAILING FIXED COUNT of context windows rather than the declared span
 * (`decision-discovery-kpi-arc-inc-02`), so this composes a second baseline from a subset of the
 * SAME gathered reads. It is not a second gather and never a second arithmetic: the slice is a pure
 * filter ({@link trailingWindowSlice}) and the sliced arm goes through the same
 * `computeDecisionReadBaseline` the unsliced one does, so the two cannot drift. The expensive part —
 * the transcript sweep — happens exactly once.
 *
 * ## COST, STATED RATHER THAN DISCOVERED
 *
 * The transcript sweep is the expensive part: 3,990 files in ~14s when this was written, and it
 * grows with this disk's history rather than with the corpus. That is why `factory health` still
 * takes a sub-question argument — `storytree factory health recurrence` skips this entirely. If the
 * sweep ever dominates the report, the fix is a windowed file filter at the collector, not a cache
 * here, because a cached reading is a reading nobody can date.
 */
import { resolveTranscriptDir } from "@storytree/context-traversal-transcript";
import { loadTitledAdrMetasFromStore } from "@storytree/drive";

import { composeDecisionDiscoveryReading, REFERENCE_DECLARED_TO } from "./decision-discovery.js";
import { SupportGraphCycleError } from "./decision-read-baseline.js";
import { buildSupportGraph, frozenAmendsEdges, gatherReads } from "./probe-decision-gather.js";

import type { DecisionDiscoveryReading } from "./decision-discovery.js";
import type { Store } from "@storytree/storage-protocol";

/**
 * The seam this needs. Report-only by construction (ADR-0316 D4) — it is `Store` rather than a
 * narrower `Pick` because `loadTitledAdrMetasFromStore` takes the whole seam, and a narrowing that
 * has to be cast back at the call site documents nothing and hides a real widening.
 */
export type DecisionDiscoveryStore = Store;

export interface DecisionDiscoveryOutcome {
  /** The reading, or NULL when one could not be taken at all. */
  readonly reading: DecisionDiscoveryReading | null;
  /**
   * Why no reading could be taken. NULL when one was.
   *
   * Distinct from the reading's OWN `refusals`, and the two must not be merged: this says the
   * instrument could not run, that says it ran and measured nothing. They have different remedies
   * and a reader who cannot tell them apart will retry the wrong one.
   */
  readonly unavailable: string | null;
  /** Transcript files swept — the blindness denominator, carried up so a small sweep is visible. */
  readonly scannedFiles: number;
}

export interface DecisionDiscoveryWindow {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

/**
 * Read the live store and this machine's transcripts, and compose the decision-discovery reading.
 *
 * The window defaults to "since the reference was frozen", which is the only default that answers
 * the question the section exists for — did anything since the freeze make discovery worse? A window
 * that overlapped the reference would be measuring the reference against itself.
 */
export async function loadDecisionDiscoveryReading(
  store: DecisionDiscoveryStore,
  window: DecisionDiscoveryWindow = {},
): Promise<DecisionDiscoveryOutcome> {
  const { adrs, unreadable } = await loadTitledAdrMetasFromStore(store);
  if (unreadable) {
    return {
      reading: null,
      unavailable: "the decision log could not be READ at all (bring the DB up: pnpm db:up)",
      scannedFiles: 0,
    };
  }
  if (adrs.length === 0) {
    return {
      reading: null,
      unavailable: "the decision log read as EMPTY — an unmigrated or wrong store, never a clean census",
      scannedFiles: 0,
    };
  }

  let support;
  try {
    support = buildSupportGraph(adrs, frozenAmendsEdges());
  } catch (error) {
    // The frozen snapshot REFUSES rather than degrading when it no longer matches its own declared
    // count (ADR-0431 D2), and that refusal must reach the reader rather than becoming an empty graph
    // — a support graph with no edges and one with unreadable edges both walk to depth 1.
    return { reading: null, unavailable: `the frozen support snapshot could not be read: ${messageOf(error)}`, scannedFiles: 0 };
  }

  const gathered = gatherReads(resolveTranscriptDir());
  if (gathered.scannedFiles === 0) {
    return {
      reading: null,
      unavailable: `no host transcripts were found at ${resolveTranscriptDir()} — this reading is a property of one machine's history`,
      scannedFiles: 0,
    };
  }

  const declaredFrom = window.from ?? REFERENCE_DECLARED_TO;
  try {
    // The two-arm assembly is PURE and lives with the rest of the pure half, so it is executed by
    // tests rather than only by a live run — see `composeDecisionDiscoveryReading` for why.
    //
    // The argument object below is NOT MUTATION-COVERABLE HERE, and the boundary is the point. This
    // function sweeps this machine's host transcripts and dials the live decision log, so nothing
    // credential-free can execute it (ADR-0302 D3) — which is exactly WHY the assembly it calls was
    // extracted. What is left on this line is the hand-off itself: four values read from the world
    // and passed straight through. Everything downstream of it is mutation-covered, and the live
    // `factory health` run is what exercises this line.
    return {
      // Stryker disable next-line ObjectLiteral: see the note above — the world-facing hand-off.
      reading: composeDecisionDiscoveryReading({
        reads: gathered.reads,
        support,
        declaredFrom,
        declaredTo: window.to,
      }),
      unavailable: null,
      scannedFiles: gathered.scannedFiles,
    };
  } catch (error) {
    if (error instanceof SupportGraphCycleError) {
      return { reading: null, unavailable: `the support graph holds a cycle, so no chain has a length: ${error.message}`, scannedFiles: gathered.scannedFiles };
    }
    throw error;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
