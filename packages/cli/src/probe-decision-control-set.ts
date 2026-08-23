/**
 * `pnpm probe:decision-control-set` — the reproducer behind
 * `decision-read-measurement-arc-inc-04`'s FROZEN HELD-OUT CONTROL SET.
 *
 * **A PROBE, NOT A GATE RUNG**, for exactly the reason `probe:decision-baseline` gives: its read half
 * is a property of ONE LAPTOP's history, so nothing it prints is a repo invariant anyone could be
 * held to, and wiring it into `pnpm gate` would turn "this box has a short history" into a red.
 *
 * ## WHAT IT PRINTS, AND WHAT IS FROZEN
 *
 * The FROZEN record is `docs/research/decision-composition-control-set-2026-08-23.md` — the member
 * lists, written down before any composition exists. This probe is how that record was produced and
 * how a later session checks whether the structure it was drawn from still holds. The two will
 * DIVERGE as the log grows, and that is expected rather than drift: a component gains a member the
 * day a new decision amends one of its members, and the frozen record is the selection as of its own
 * date. A later trial reports against the FROZEN lists; this probe says how far the ground has moved
 * under them.
 *
 * ## EXIT CODES
 *
 * 0 when the selection was computed — INCLUDING when it computed that no matched design fits, which
 * is a finding and not a failure. 1 when it could not be computed at all (no decision log, no
 * transcripts, a cyclic support graph) or when the pure half reports a VACUITY reason, because a set
 * of numbers that measured nothing must not exit 0 under a table of zeros.
 */
import fs from "node:fs";
import path from "node:path";

import { resolveTranscriptDir } from "@storytree/context-traversal-transcript";

import {
  selectDecisionControlSet,
  DOMINANT_UNIT_SHARE,
  type ArmBalance,
  type ComponentStats,
  type DecisionControlSetSelection,
  type MatchedPair,
} from "./decision-control-set.js";
import { decisionNumberOfObservedId, SupportGraphCycleError } from "./decision-read-baseline.js";
import { buildSupportGraph, gatherReads } from "./probe-decision-gather.js";
import { loadProbeDecisions } from "./probe-decisions.js";

const TAG = "probe:decision-control-set";

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

const adr = (n: number): string => `ADR-${String(n).padStart(4, "0")}`;
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

function renderComponent(component: ComponentStats): string {
  const members =
    component.members.length <= 8
      ? component.members.map(adr).join(", ")
      : `${component.members.slice(0, 6).map(adr).join(", ")}, … (+${component.members.length - 6} more)`;
  return [
    `  component ${adr(component.id)}`,
    `    decisions ${component.members.length}   amends ${component.amendsEdges}   dependsOn ${component.dependsOnEdges}` +
      `   reach ${component.reachWindows}   walks ${component.walkWindows}   deepest ${component.maxDepthObserved}` +
      `   median member reach ${component.medianMemberReach}`,
    `    ${members}`,
  ].join("\n");
}

function renderPairs(pairs: readonly MatchedPair[], balance: ArmBalance): string[] {
  const out: string[] = [];
  out.push("  rank  treated      control      walk gap   reach gap");
  for (const pair of pairs) {
    out.push(
      `  ${String(pair.rank).padStart(4)}  ${adr(pair.treated).padEnd(12)} ${adr(pair.control).padEnd(12)} ` +
        `${String(pair.walkGap).padStart(8)}   ${String(pair.reachGap).padStart(9)}`,
    );
  }
  out.push("");
  out.push("  ARM BALANCE — printed so imbalance cannot hide behind the word 'matched'");
  out.push(`    units    treated ${balance.treatedUnits}   control ${balance.controlUnits}`);
  out.push(`    reach    treated ${balance.treatedReachWindows}   control ${balance.controlReachWindows}`);
  out.push(`    walks    treated ${balance.treatedWalkWindows}   control ${balance.controlWalkWindows}`);
  out.push(
    `    worst pair   walk gap ${balance.worstPairWalkGap}   reach gap ${balance.worstPairReachGap}`,
  );
  return out;
}

function render(selection: DecisionControlSetSelection, top: number): string {
  const out: string[] = [];
  const s = selection;

  out.push("THE SUBJECT, AS OF THIS RUN");
  out.push(
    `  decisions ${s.decisionsInLog}   amends edges ${s.amendsEdges}   dependsOn edges ${s.dependsOnEdges}` +
      "   (counted apart, never summed — ADR-0419 D1)",
  );
  out.push(
    `  context windows that read a decision ${s.windowsObserved}   reads carrying no window id ${s.readsWithoutWindowId}`,
  );
  out.push("");

  out.push("UNIT A — SUPPORT COMPONENTS (the CONSERVATIVE unit: no support edge crosses one)");
  out.push(
    `  components ${s.componentCount}   singletons ${s.singletonComponents}` +
      `   structurally eligible ${s.structurallyEligibleComponents}   informative ${s.informativeComponents}`,
  );
  out.push(
    `  largest holds ${pct(s.largestComponentWalkShare)} of all walked chains and ${pct(s.largestComponentReachShare)} of all reach`,
  );
  out.push("");
  out.push(`  THE COMPONENT CENSUS — largest first, top ${top}`);
  for (const component of s.components.slice(0, top)) out.push(renderComponent(component));
  if (s.components.length > top) {
    out.push(`  … and ${s.components.length - top} smaller components not listed`);
  }
  out.push("");
  if (s.componentDesignInfeasible.length > 0) {
    out.push("  VERDICT — NO MATCHED DESIGN FITS AT THIS UNIT. A finding, not a failure.");
    for (const reason of s.componentDesignInfeasible) out.push(`    - ${reason}`);
    out.push("");
    out.push(
      "  The decision log is not a forest of comparable families. It is one giant component plus",
    );
    out.push("  debris, so the guaranteed-clean unit buys its guarantee at the price of the design.");
  } else {
    out.push("  VERDICT — a matched design fits at this unit.");
    out.push(...renderPairs(s.frontierPairs, s.frontierBalance));
  }
  out.push("");

  out.push("UNIT B — CHAIN FRONTIERS (the fork's own object: where a composed statement would live)");
  out.push(
    `  frontiers ${s.frontierCount}   informative (read >= 1 window) ${s.informativeFrontiers}` +
      `   largest holds ${pct(s.largestFrontierWalkShare)} of all frontier walks`,
  );
  out.push("");
  out.push(`  THE FRONTIER CENSUS — most-walked first, top ${top}`);
  out.push("    frontier    arm         subtree  depth   reach   walks");
  for (const frontier of s.frontiers.slice(0, top)) {
    out.push(
      `    ${adr(frontier.decision).padEnd(11)} ${(s.frontierArms.get(frontier.decision) ?? "ineligible").padEnd(11)} ` +
        `${String(frontier.subtreeSize).padStart(7)} ${String(frontier.subtreeDepth).padStart(6)} ` +
        `${String(frontier.reachWindows).padStart(7)} ${String(frontier.walkWindows).padStart(7)}`,
    );
  }
  if (s.frontiers.length > top) {
    out.push(`    … and ${s.frontiers.length - top} more frontiers not listed`);
  }
  out.push("");
  if (s.frontierDesignInfeasible.length > 0) {
    out.push("  VERDICT — NO MATCHED DESIGN FITS AT THIS UNIT EITHER.");
    for (const reason of s.frontierDesignInfeasible) out.push(`    - ${reason}`);
  } else {
    out.push(`  THE FROZEN MATCHED SPLIT — ${s.frontierPairs.length} pair(s)`);
    out.push(...renderPairs(s.frontierPairs, s.frontierBalance));
    out.push("");
    out.push(
      `  CONTAMINATION — ${s.frontierContaminationWindows} of ${s.windowsObserved} windows ` +
        `(${pct(s.windowsObserved === 0 ? 0 : s.frontierContaminationWindows / s.windowsObserved)}) read BOTH arms in one sitting.`,
    );
    out.push(
      "  This is the price of the finer unit. It is BEHAVIOURAL, not structural, and it biases toward",
    );
    out.push("  the null — a reader helped in one arm may simply stop reading, depressing the other too.");
  }
  out.push("");

  out.push("FLOORS, STATED");
  out.push(
    "  Reach and walk counts are a property of ONE BOX's transcript history and every capture blind",
  );
  out.push(
    "  spot REMOVES reads, so both are FLOORS. A READ IS NOT COMPREHENSION: a model given insufficient",
  );
  out.push(
    "  context answers confidently rather than abstaining, so nothing here says a walk was cheap or a",
  );
  out.push(
    `  composed frontier would have been read. The ${pct(DOMINANT_UNIT_SHARE)} dominance threshold is a stated`,
  );
  out.push("  JUDGMENT — the shares above are printed so a reader may apply their own.");

  if (s.vacuity.length > 0) {
    out.push("");
    out.push("VACUITY — one or more figures above did NOT see its subject:");
    for (const reason of s.vacuity) out.push(`  - ${reason}`);
  } else {
    out.push("");
    out.push("VACUITY — none. Every figure above saw its subject.");
  }

  return out.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const transcriptDir = resolveTranscriptDir();
  console.log(`${TAG} — transcripts: ${transcriptDir}`);
  console.log("");

  const { adrs, parseErrors } = await loadProbeDecisions(TAG);
  if (parseErrors.length > 0) {
    for (const error of parseErrors) console.error(`${TAG} — ${error}`);
    process.exitCode = 1;
    return;
  }

  const support = buildSupportGraph(adrs);
  const gathered = gatherReads(transcriptDir);

  if (gathered.scannedFiles === 0) {
    console.error(
      `${TAG} FAIL — no transcript files were found under ${transcriptDir}. That is a walk that read ` +
        "nothing, not a machine with no history; set STORYTREE_TRANSCRIPT_DIR if the host writes them elsewhere.",
    );
    process.exitCode = 1;
    return;
  }

  let selection: DecisionControlSetSelection;
  try {
    selection = selectDecisionControlSet(
      { reads: gathered.reads, support, declaredFrom: args.from, declaredTo: args.to },
      decisionNumberOfObservedId,
    );
  } catch (err: unknown) {
    if (err instanceof SupportGraphCycleError) {
      console.error(`${TAG} FAIL — ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  console.log(render(selection, args.top));

  if (args.json !== undefined) {
    fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true });
    // A Map does not survive JSON.stringify — the arms would silently serialise as `{}` and a frozen
    // record whose assignment column was an empty object is the exact failure this file exists to
    // prevent. Written as an explicit array of pairs instead.
    const serialisable = {
      ...selection,
      frontierArms: [...selection.frontierArms.entries()].map(([frontier, arm]) => ({ frontier, arm })),
    };
    fs.writeFileSync(path.resolve(args.json), `${JSON.stringify(serialisable, null, 2)}\n`, "utf8");
    console.log("");
    console.log(`${TAG} — machine-readable selection written to ${args.json}`);
  }

  if (selection.vacuity.length > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  // Fail-closed: a selection claimed over a gather that threw is not a selection anyone should freeze.
  console.error(`${TAG} — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
