/**
 * The frozen baseline as a human reads it — `decision-read-measurement-arc-inc-02`.
 *
 * PURE: a string in, a string out, no clock and no world. Separated from the probe so the exact text
 * that goes into the frozen research document is asserted by a test rather than eyeballed once.
 *
 * ## EVERY NUMBER PRINTS WITH ITS DENOMINATOR, ON THE SAME LINE
 *
 * That is the one editorial rule here, and it is not house style. "0 sessions walked a chain" is the
 * finding that would FALSIFY this arc's hypothesis, and it is indistinguishable from "0 sessions were
 * measured" unless the denominator is beside it. `probe:depth-from-work` states the same rule for the
 * corpus-shape walk; this is that rule applied to a behavioural one.
 */
import { decisionLabel } from "@storytree/library";

import type { DecisionReadBaseline, ChainDepthReading } from "./decision-read-baseline.js";

export interface BaselineRenderContext {
  readonly top: number;
  readonly transcriptFiles: number;
  readonly decisionMentions: number;
  readonly uncorrelatedReads: number;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "n/a (denominator 0)";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function renderChainDepth(reading: ChainDepthReading, lines: string[]): void {
  const grain =
    reading.grain === "window"
      ? "WINDOW grain — one host context window, i.e. one sitting"
      : "SLOT grain — the pooled worktree slot, which unions several sittings";
  lines.push(`  ${grain}`);
  lines.push(
    `    sessions identified: ${reading.sessionsIdentified}   ` +
      `with >=1 decision read: ${reading.sessionsWithAnyDecisionRead}`,
  );
  // THE NUMBER, and it prints with the population it is over on the same line — see the header.
  lines.push(
    `    sessions that walked a chain (depth >= 2): ${reading.sessionsWalkingAChain} of ` +
      `${reading.sessionsWithAnyDecisionRead} (${pct(reading.sessionsWalkingAChain, reading.sessionsWithAnyDecisionRead)})`,
  );
  lines.push(`    deepest single sitting: ${reading.maxDepth}`);
  if (reading.deepestChain.length > 0) {
    lines.push(
      `      ${reading.deepestChain.map(decisionLabel).join(" -> ")}` +
        (reading.deepestSessionId === null ? "" : `   [${reading.deepestSessionId}]`),
    );
  }
  if (reading.histogram.length === 0) {
    lines.push("    distribution: (none — no session of this grain read a decision)");
  } else {
    lines.push("    distribution (sessions at each depth, never a mean):");
    for (const bucket of reading.histogram) {
      lines.push(
        `      depth ${String(bucket.depth).padStart(2)}: ${String(bucket.sessions).padStart(5)} ` +
          `session${bucket.sessions === 1 ? "" : "s"}`,
      );
    }
  }
}

export function renderDecisionReadBaseline(
  baseline: DecisionReadBaseline,
  context: BaselineRenderContext,
): string {
  const lines: string[] = [];

  lines.push("DECISION-READ BASELINE — reach and chain depth");
  lines.push(
    `  declared window: ${baseline.declaredFrom ?? "(open)"} .. ${baseline.declaredTo ?? "(open)"}`,
  );
  lines.push(
    `  observed within it: ${baseline.observedFrom ?? "(nothing)"} .. ${baseline.observedTo ?? "(nothing)"}`,
  );

  lines.push("");
  lines.push("THE SUBJECT — the decision log this is measured against");
  lines.push(`  decisions in the log: ${baseline.decisionsInLog}`);
  // COUNTED APART AND NEVER SUMMED (ADR-0419 D1). One blended "support edges" figure would hide the
  // entire `amends`-to-`dependsOn` migration these two lines exist to track.
  lines.push(
    `  support edges, counted apart (never summed — ADR-0419 D1): ` +
      `amends ${baseline.amendsEdges}   dependsOn ${baseline.dependsOnEdges}`,
  );
  lines.push(
    `  decisions arriving with the \`dependsOn\` FIELD present: ${baseline.decisionsCarryingDependsOn} ` +
      `of ${baseline.decisionsInLog}   (presence, not non-emptiness — a reader that supplies no field ` +
      "reads 0 here and is blind, not empty)",
  );
  lines.push(
    `  \`dependsOn\` pointers on a decision naming something other than a decision: ` +
      `${baseline.dependsOnNonDecisionTargets}   (a real, expected state — not an error)`,
  );

  lines.push("");
  lines.push("THE INSTRUMENT — what was seen, and what it could not see");
  lines.push(`  transcript files swept: ${context.transcriptFiles}`);
  lines.push(
    `  decision reads observed: ${baseline.readsObserved}   resolved to a decision: ${baseline.readsResolved}   ` +
      `unresolved: ${baseline.readsUnresolved}`,
  );
  lines.push(
    `  reads onto a number the log does not hold: ${baseline.readsOntoUnknownDecisions}   ` +
      "(reported, and excluded from reach — a deleted or renumbered decision would surface here)",
  );
  lines.push(
    `  tool calls that NAMED a decision and yielded no read: ${context.decisionMentions}   ` +
      "(the blindness denominator — a MENTION count, mostly prose, never a target to drive to zero)",
  );
  lines.push(
    `  reads reached but attributable to no storytree session: ${context.uncorrelatedReads}   ` +
      "(overwhelmingly the primary checkout, which `deriveIdentity()` rule 3 refuses by design)",
  );
  lines.push(
    `  reads carrying a host WINDOW id: ${baseline.readsWithWindowId}   without one: ${baseline.readsWithoutWindowId}`,
  );
  lines.push("  read id spellings (the join's left side):");
  if (baseline.readSpellings.length === 0) lines.push("    (none)");
  for (const row of baseline.readSpellings) {
    lines.push(`    ${String(row.reads).padStart(6)}  ${row.spelling}`);
  }
  lines.push("  read surfaces (which instrument shape saw them):");
  if (baseline.readSurfaces.length === 0) lines.push("    (none)");
  for (const row of baseline.readSurfaces) {
    lines.push(`    ${String(row.reads).padStart(6)}  ${row.surface}`);
  }
  lines.push("");
  lines.push("1. REACH — decisions ranked by DISTINCT SESSIONS, never by raw read count");
  lines.push(
    `  decisions read by >=1 session: ${baseline.decisionsReachedBySlot} of ${baseline.decisionsInLog} ` +
      `(${pct(baseline.decisionsReachedBySlot, baseline.decisionsInLog)}) at slot grain; ` +
      `${baseline.decisionsReachedByWindow} at window grain`,
  );
  lines.push(
    `  decisions NO observed session read: ${baseline.decisionsNeverRead} of ${baseline.decisionsInLog} ` +
      `(${pct(baseline.decisionsNeverRead, baseline.decisionsInLog)})`,
  );
  lines.push(`  top ${context.top} by distinct WINDOWS:`);
  if (baseline.reachByWindow.length === 0) {
    lines.push("    (none — no read carried a window id, so this rank measured nothing)");
  }
  for (const row of baseline.reachByWindow.slice(0, context.top)) {
    lines.push(
      `    ${decisionLabel(row.decision)}  ${String(row.sessions).padStart(4)} window${row.sessions === 1 ? "" : "s"}` +
        `   (${row.reads} raw read${row.reads === 1 ? "" : "s"})`,
    );
  }
  lines.push(`  top ${context.top} by distinct SLOTS (the same rank, at the pooled grain):`);
  if (baseline.reachBySlot.length === 0) lines.push("    (none)");
  for (const row of baseline.reachBySlot.slice(0, context.top)) {
    lines.push(
      `    ${decisionLabel(row.decision)}  ${String(row.sessions).padStart(4)} slot${row.sessions === 1 ? "" : "s"}` +
        `   (${row.reads} raw read${row.reads === 1 ? "" : "s"})`,
    );
  }

  lines.push("");
  lines.push("2. CHAIN DEPTH — how far down ONE support chain a session walked in one sitting");
  lines.push(
    "  THE ARC'S LOAD-BEARING NUMBER. An edge rollup removes the cost of walking a chain, so if",
  );
  lines.push(
    "  sessions do not walk chains the edge-rollup hypothesis is FALSIFIED. Both grains are printed",
  );
  lines.push("  because they disagree and the gap between them is what the identity axis was worth.");
  renderChainDepth(baseline.chainDepthByWindow, lines);
  renderChainDepth(baseline.chainDepthBySlot, lines);
  lines.push(
    `  pooling factor (windows per slot, over sessions that read a decision): ` +
      `${baseline.poolingFactor ?? "n/a"}`,
  );

  lines.push("");
  // SECTION 3 — OFFER-TO-FOLLOW — WAS HERE, and ADR-0464 D7 retired it with its subject. It read
  // the offer record (`candidate_set`) and reported how many decision pointers were offered, in which
  // spelling, how many of those a follow could ever have been observed on, and how many were
  // answered. Nothing records an offer any more.
  //
  // NOT REPLACED BY A ZEROED SECTION, deliberately. A block printing "offers recorded: 0 ... followed:
  // 0 of 0" would read as a finding about how agents behave — the exact misreading its own ADR-0312
  // caveat existed to prevent — when it would only mean the population is gone. The honest render of a
  // retired figure is its absence, and the two sections that remain say what they measured.
  //
  // The three trace-session context fields went with it for the same reason: they described the
  // gathering step that existed only to feed this section, and this probe no longer opens the trace
  // directory at all.

  lines.push("");
  if (baseline.vacuity.length === 0) {
    lines.push("VACUITY — none. Every figure above saw its subject.");
  } else {
    lines.push("VACUITY — one or more figures above measured NOTHING. Do not freeze this run:");
    for (const reason of baseline.vacuity) lines.push(`  - ${reason}`);
  }

  lines.push("");
  lines.push(
    "EVERY FIGURE IS A FLOOR, AND THE BIAS IS TWO-SIDED. Capture blind spots REMOVE reads, which can",
  );
  lines.push(
    "only shorten the longest chain a read set contains, so lost capture pushes chain depth DOWN. Slot",
  );
  lines.push(
    "pooling UNIONS several sittings into one, which can only lengthen it, so pooling pushes the",
  );
  lines.push(
    "slot-grained figure UP. A read is not comprehension, and a model given insufficient context",
  );
  lines.push("answers confidently rather than abstaining — no figure here says agents are getting on fine.");

  return lines.join("\n");
}
