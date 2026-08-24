/**
 * `pnpm probe:decision-baseline` — the reproducer behind `decision-read-measurement-arc-inc-02`'s
 * FROZEN BASELINE: reach, chain depth and offer-to-follow over a declared window, with every
 * denominator each rests on.
 *
 * **A PROBE, NOT A GATE RUNG, and deliberately so** — the same reason `probe:decision-reads` gives.
 * Its read half is a property of ONE LAPTOP's history (`~/.claude/projects`, `~/.storytree/traces`),
 * so nothing it prints is a repo invariant anyone could be held to; wiring it into `pnpm gate` would
 * turn "this box has a short history" into a red. It is a `probe:` for that reason and not because it
 * is unimportant: it is the instrument the whole arc's design fork is argued from.
 *
 * ## THIS FILE IS THE ONLY HALF THAT TOUCHES THE WORLD
 *
 * Every number is computed by `decision-read-baseline.ts`, which is pure. This half gathers three
 * populations and hands them over:
 *
 *   - READS — from the HOST TRANSCRIPTS, through the existing extractor (`scanTranscriptDecisionReads`),
 *     never a second one. That is the source rather than the trace store because it is the only one
 *     carrying the host CONTEXT WINDOW id, and "how far down a chain did a session walk IN ONE
 *     SITTING" is a question about a window, not about a pooled worktree slot.
 *   - OFFERS — from the traversal TRACE STORE's `candidate_set` events, which is where an offer is
 *     recorded and the only place it exists.
 *   - THE SUPPORT GRAPH — from the LIVE decision log, through `loadProbeDecisions` and the
 *     `decisionSupportResolver` seam, so `supersedes` is excluded by the shape of the code rather than
 *     by a filter here (ADR-0403 dec 6 / ADR-0419 D1).
 *
 * ## WHY READS COME FROM ONE SOURCE AND NOT BOTH
 *
 * The trace store ALSO holds decision reads: the ingest writes the transcript ones onto
 * `host-transcript-*` surfaces, and the live CLI observer mints its own on `library-artifact` as the
 * command runs. Those two OVERLAP by construction — `decision-reads.ts` says so on its own face — so
 * counting reads from both sources would double-count every `library artifact adr-NNNN` read that a
 * transcript also recorded, and inflate reach and follow rate together. Taking reads from the
 * transcripts alone is the deduplicated view AND the only window-grained one. The cost is declared:
 * a CLI read made OUTSIDE the Claude harness (a Codex run, a bare terminal) has no transcript, so it
 * is invisible here while the live observer would have seen it. That is a floor, in the direction
 * this arc's floors always run.
 *
 * ## EXIT CODES
 *
 * 0 when the baseline was taken; 1 when it could not be (no decision log, no transcripts, a cyclic
 * support graph) or when the pure half reports a VACUITY reason — a set of numbers that measured
 * nothing must not exit 0 under a table of zeros, which is the failure `probe:decision-reads` was
 * repaired for and the one this arc can least afford to repeat.
 */
import fs from "node:fs";
import path from "node:path";

import {
  classifyOfferObservability,
  listTraversalSessions,
  readTraversalSession,
  resolveTraversalDir,
} from "@storytree/context-traversal-capture";
import { resolveTranscriptDir } from "@storytree/context-traversal-transcript";

import {
  computeDecisionReadBaseline,
  SupportGraphCycleError,
  type DecisionOfferObservation,
  type DecisionReadBaseline,
} from "./decision-read-baseline.js";
import { buildSupportGraph, gatherReads,
  frozenAmendsEdges,
} from "./probe-decision-gather.js";
import { loadProbeDecisions } from "./probe-decisions.js";
import { renderDecisionReadBaseline } from "./render-decision-baseline.js";

const TAG = "probe:decision-baseline";

interface Args {
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly json: string | undefined;
  readonly top: number;
}

function parseArgs(argv: readonly string[]): Args {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    const next = argv[index + 1];
    return next !== undefined && !next.startsWith("--") ? next : undefined;
  };
  const top = Number(value("--top") ?? "20");
  return {
    from: value("--from"),
    to: value("--to"),
    json: value("--json-out"),
    top: Number.isFinite(top) && top > 0 ? Math.floor(top) : 20,
  };
}

interface GatheredOffers {
  readonly offers: readonly DecisionOfferObservation[];
  readonly traceSessions: number;
  /** Trace sessions whose slot could not be established, so their offers can join to no read. */
  readonly sessionsWithoutSlot: number;
  /** Trace sessions whose lines disagree about their own identity grade — reported, never merged. */
  readonly mixedIdentitySessions: number;
}

function gatherOffers(traceDir: string): GatheredOffers {
  const summaries = listTraversalSessions({ dir: traceDir });
  const offers: DecisionOfferObservation[] = [];
  let sessionsWithoutSlot = 0;
  let mixedIdentitySessions = 0;

  for (const summary of summaries) {
    const { replay, identity, slots } = readTraversalSession({ dir: traceDir, sessionId: summary.sessionId });
    if (identity === "mixed") mixedIdentitySessions += 1;

    // WHICH KEY IS THE SLOT depends on what this trace's id turned out to name, and that is stated
    // by `classifyTraceIdentity` rather than guessed from the id's shape. A legacy trace IS keyed by
    // its slot; a window-keyed trace records the slot as a line attribute beside the identity.
    let slotId: string | undefined;
    if (identity === "slot") slotId = summary.sessionId;
    else if (slots.length === 1) slotId = slots[0];
    else if (slots.length === 0) slotId = undefined;
    else slotId = undefined; // several slots on one window: no single slot to join on.
    if (slotId === undefined) {
      sessionsWithoutSlot += 1;
      continue;
    }

    for (const event of replay.events) {
      if (event.kind !== "candidate_set") continue;
      for (const nodeId of event.candidateNodeIds) {
        offers.push({
          slotId,
          candidateSetId: event.candidateSetId,
          nodeId,
          at: event.at,
          // The REAL machinery — it builds the argv a follow would use and runs it through the actual
          // allowlist. A second copy of the rule here would agree with the renderer whatever the
          // renderer did, and the whole value of the figure is that it can disagree.
          observable: classifyOfferObservability(nodeId).observable,
        });
      }
    }
  }

  return { offers, traceSessions: summaries.length, sessionsWithoutSlot, mixedIdentitySessions };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const transcriptDir = resolveTranscriptDir();
  const traceDir = resolveTraversalDir();
  console.log(`${TAG} — transcripts: ${transcriptDir}`);
  console.log(`${TAG} — traces:      ${traceDir}`);
  console.log("");

  const { adrs, parseErrors } = await loadProbeDecisions(TAG);
  if (parseErrors.length > 0) {
    for (const error of parseErrors) console.error(`${TAG} — ${error}`);
    process.exitCode = 1;
    return;
  }

  const support = buildSupportGraph(adrs, frozenAmendsEdges());
  const gatheredReads = gatherReads(transcriptDir);
  const gatheredOffers = gatherOffers(traceDir);

  if (gatheredReads.scannedFiles === 0) {
    console.error(
      `${TAG} FAIL — no transcript files were found under ${transcriptDir}. That is a walk that read ` +
        "nothing, not a machine with no history; set STORYTREE_TRANSCRIPT_DIR if the host writes them elsewhere.",
    );
    process.exitCode = 1;
    return;
  }

  let baseline: DecisionReadBaseline;
  try {
    baseline = computeDecisionReadBaseline({
      reads: gatheredReads.reads,
      offers: gatheredOffers.offers,
      support,
      declaredFrom: args.from,
      declaredTo: args.to,
    });
  } catch (err: unknown) {
    if (err instanceof SupportGraphCycleError) {
      console.error(`${TAG} FAIL — ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  console.log(
    renderDecisionReadBaseline(baseline, {
      top: args.top,
      transcriptFiles: gatheredReads.scannedFiles,
      decisionMentions: gatheredReads.decisionMentions,
      uncorrelatedReads: gatheredReads.uncorrelatedReads,
      traceSessions: gatheredOffers.traceSessions,
      traceSessionsWithoutSlot: gatheredOffers.sessionsWithoutSlot,
      mixedIdentitySessions: gatheredOffers.mixedIdentitySessions,
    }),
  );

  if (args.json !== undefined) {
    fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true });
    fs.writeFileSync(path.resolve(args.json), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    console.log("");
    console.log(`${TAG} — machine-readable baseline written to ${args.json}`);
  }

  // A VACUITY REASON IS A NON-ZERO EXIT, and that is the whole posture of this arc's instruments: a
  // table of zeros printed under a success banner is what "nothing was deep" and "nothing was
  // measured" printing the same way actually looks like in a terminal.
  if (baseline.vacuity.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  // Fail-closed: a baseline claimed over a gather that threw is not a baseline anyone should freeze.
  console.error(`${TAG} — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
