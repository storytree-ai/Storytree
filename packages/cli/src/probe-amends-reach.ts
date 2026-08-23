/**
 * `pnpm probe:amends-reach` — ADR-0419 Decision 5's own test: **have reaches into amended decisions
 * fallen** now that every amended decision self-describes?
 *
 * **A PROBE, NOT A GATE RUNG**, for `probe:decision-baseline`'s reason exactly: its read half is a
 * property of ONE LAPTOP's history (`~/.claude/projects`), so nothing it prints is a repo invariant
 * anyone could be held to, and wiring it into `pnpm gate` would turn "this box has a short history"
 * into a red.
 *
 * ## THIS EXISTS BECAUSE THE INSTRUMENT HAS BEEN NAMED THREE DIFFERENT WAYS
 *
 * D5 says the question "becomes answerable once targets are self-describing: if reaches into amended
 * decisions fall, the edge has become pure provenance." Three artifacts have since named three
 * different instruments for that sentence — `-inc-04`'s arc entry says the drain BURNDOWN (which
 * measures the PRECONDITION, and whose probe ADR-0427 has since deleted), while this increment and
 * `oq-retire-the-amends-edge` option D both say `probe:depth-from-work` (which measures the CORPUS'S
 * SHAPE and observes no reader at all). Neither can see a reach. "Reach" is defined by this arc's own
 * frozen baseline as DISTINCT SESSIONS THAT READ A DECISION, so the instrument has to be one that
 * reads the READ RECORD — this one, over the populations `probe:decision-baseline` already gathers.
 *
 * ## WHAT IT MEASURES, AND WHAT IT REFUSES TO
 *
 * It splits the read record at the instant the annotation drain completed and reports the same rates
 * on both sides. It refuses to call a fall the after arm could not have detected: the drain finished
 * hours after the baseline was frozen, so the after arm starts near-empty and grows by a handful of
 * sessions a day. `UNDERPOWERED` is the expected answer for some weeks, and it is a RESULT — the
 * measurement reporting its own denominator rather than a percentage over four sessions.
 *
 * It decides NOTHING about whether `amends` is retired. That is `oq-retire-the-amends-edge`, whose
 * named blocker (a replacement for `loadBearingReach`, which closes over `amends` alone) this
 * measurement does not touch.
 *
 * Exit 0 when a reading was taken — including an underpowered one, which measured a real denominator.
 * Exit 1 when it could not be taken at all: no decision log, no transcripts, or a vacuous arm.
 */
import fs from "node:fs";
import path from "node:path";

import { resolveTranscriptDir } from "@storytree/context-traversal-transcript";

import {
  amendsCorpusShape,
  compareAmendsReach,
  computeAmendsReach,
  type AmendsReachComparison,
  type AmendsReachReading,
} from "./amends-reach.js";
import type { SessionGrain } from "./decision-read-baseline.js";
import { buildSupportGraph, gatherReads } from "./probe-decision-gather.js";
import { loadProbeDecisions } from "./probe-decisions.js";

const TAG = "probe:amends-reach";

/**
 * The frozen baseline's declared window — `docs/research/decision-read-baseline-2026-08-23.md` §1.
 * The BEFORE arm defaults to starting here so the two instruments span the same history.
 */
const BASELINE_FROM = "2026-06-08T00:00:00.000Z";
const BASELINE_TO = "2026-08-23T00:00:00.000Z";

/**
 * The frozen baseline's own chain figures, at window grain (§2), carried as CONSTANTS so this probe
 * can check itself against the freeze rather than asking the reader to.
 *
 * Over the frozen window they must reproduce EXACTLY: chain depth >= 2 means the session read both
 * ends of at least one support edge, the support graph then held 513 `amends` edges and 0
 * `dependsOn`, so "walked a chain" and "crossed an amends edge" were the same event. A disagreement
 * means one of the two instruments has drifted off the population it claims to measure, and the
 * number below is the tripwire that says so.
 */
const FROZEN_SESSIONS_READING_A_DECISION = 401;
const FROZEN_SESSIONS_WALKING_A_CHAIN = 203;

/**
 * When the annotation drain reached 453/453 — the instant ADR-0419 D5's precondition was satisfied.
 *
 * MEASURED, NOT ASSUMED. Batches 2 and 3 (`-inc-09` / `-inc-11`) landed as live-store decision-row
 * edits with no PR, so git records nothing; this is the newest `updatedAt` across `-inc-09`'s 47
 * annotated targets, and `-inc-09`'s own arc entry reports the WHOLE backlog at zero when it
 * finished, which is what makes it the completion instant rather than merely the last write.
 */
const DRAIN_COMPLETED = "2026-08-23T05:39:57.000Z";

/** The relative fall the after arm is sized to catch, unless the caller asks for a smaller one. */
const DEFAULT_DETECTABLE_FALL = 0.5;

interface Args {
  readonly from: string;
  readonly split: string;
  readonly to: string | undefined;
  readonly fall: number;
  readonly json: string | undefined;
}

function parseArgs(argv: readonly string[]): Args {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    return argv[index + 1];
  };
  const fall = Number(value("--fall") ?? DEFAULT_DETECTABLE_FALL);
  return {
    from: value("--from") ?? BASELINE_FROM,
    split: value("--split") ?? DRAIN_COMPLETED,
    to: value("--to"),
    fall: Number.isFinite(fall) && fall > 0 && fall < 1 ? fall : DEFAULT_DETECTABLE_FALL,
    json: value("--json-out"),
  };
}

/** The instant one millisecond before `at` — the BEFORE arm's inclusive upper bound. */
function justBefore(at: string): string {
  return new Date(new Date(at).getTime() - 1).toISOString();
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function interval(comparison: AmendsReachComparison["before"]): string {
  return `${pct(comparison.rate)} (95% CI ${pct(comparison.low)}..${pct(comparison.high)})`;
}

function renderArm(label: string, reading: AmendsReachReading): string {
  const lines: string[] = [];
  const total = reading.sessionsReadingADecision;
  const rate = (n: number): string => (total === 0 ? "n/a" : pct(n / total));
  lines.push(`  ${label}`);
  lines.push(`    declared ${reading.declaredFrom ?? "(open)"} .. ${reading.declaredTo ?? "(open)"}`);
  lines.push(`    observed ${reading.observedFrom ?? "(nothing)"} .. ${reading.observedTo ?? "(nothing)"}`);
  lines.push(`    ${reading.reads} read(s) over ${total} session(s) that read a decision`);
  lines.push(
    `    PLAIN REACH    ${reading.sessionsReadingAnAmendedDecision} session(s) read an amended decision (${rate(reading.sessionsReadingAnAmendedDecision)})`,
  );
  lines.push(
    `                   ${reading.amendedDecisionsRead} amended decision(s) read, median reach ${reading.amendedReachMedian}; ` +
      `${reading.unamendedDecisionsRead} unamended, median reach ${reading.unamendedReachMedian}`,
  );
  lines.push(
    `    CROSSING       ${reading.sessionsCrossingAnAmendsEdge} session(s) read BOTH ends of an \`amends\` edge (${rate(reading.sessionsCrossingAnAmendsEdge)})`,
  );
  lines.push(
    `                   ${reading.amendsCrossings} (session, edge) crossing(s) over ${reading.amendsEdgesCrossed} distinct edge(s)`,
  );
  lines.push(
    `    DIRECTION      ${reading.directions.amendedFirst} amended-first (the read the annotation is written to remove) · ` +
      `${reading.directions.amenderFirst} amender-first · ${reading.directions.simultaneous} same instant`,
  );
  lines.push(
    `    dependsOn      ${reading.sessionsCrossingADependsOnEdge} session(s) crossed a \`dependsOn\` edge — counted APART, never summed (ADR-0419 D1)`,
  );
  if (reading.vacuity.length > 0) {
    for (const reason of reading.vacuity) lines.push(`    ⚠ VACUOUS: ${reason}`);
  }
  return lines.join("\n");
}

function renderComparison(comparison: AmendsReachComparison): string {
  const lines: string[] = [];
  lines.push(`  ${comparison.measure}`);
  lines.push(`    BEFORE  ${comparison.beforeCount}/${comparison.beforeTotal}  ${interval(comparison.before)}`);
  lines.push(`    AFTER   ${comparison.afterCount}/${comparison.afterTotal}  ${interval(comparison.after)}`);
  if (comparison.verdict === "UNDERPOWERED") {
    const required = Math.max(comparison.sessionsNeeded, comparison.minimumArm);
    const why =
      comparison.minimumArm > comparison.sessionsNeeded
        ? `${comparison.sessionsNeeded} for this measure alone, raised to the report's floor of ${comparison.minimumArm}`
        : `${comparison.sessionsNeeded}`;
    lines.push(
      `    VERDICT: UNDERPOWERED — the after arm holds ${comparison.afterTotal} session(s) and would need ` +
        `${required} (${why}) to detect a ${pct(comparison.detectableFall)} fall at 80% power. ` +
        "No direction is computed, because none could be trusted.",
    );
  } else {
    lines.push(`    VERDICT: ${comparison.verdict}`);
  }
  return lines.join("\n");
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
  const shape = amendsCorpusShape(support);
  const gathered = gatherReads(transcriptDir);

  if (gathered.scannedFiles === 0) {
    console.error(
      `${TAG} FAIL — no transcript files were found under ${transcriptDir}. That is a walk that read ` +
        "nothing, not a machine with no history; set STORYTREE_TRANSCRIPT_DIR if the host writes them elsewhere.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`${TAG} — the corpus, as of this run`);
  console.log(`  ${shape.decisions} decisions`);
  console.log(
    `  ${shape.amendsEdges} \`amends\` edge(s) over ${shape.amendedDecisions} amended decision(s) from ${shape.amenderDecisions} amender(s)`,
  );
  console.log(
    `  ${shape.dependsOnEdges} \`dependsOn\` edge(s) on ${shape.decisionsCarryingDependsOn} decision row(s) carrying the field`,
  );
  console.log("  — counted APART and never summed (ADR-0419 D1)");
  console.log("");

  // --- CALIBRATION against the freeze, before anything is compared ---
  const frozen = computeAmendsReach({
    reads: gathered.reads,
    support,
    from: BASELINE_FROM,
    to: BASELINE_TO,
    grain: "window",
  });
  const readsAgree = frozen.sessionsReadingADecision === FROZEN_SESSIONS_READING_A_DECISION;
  const chainAgrees = frozen.sessionsCrossingAnAmendsEdge === FROZEN_SESSIONS_WALKING_A_CHAIN;
  console.log(`${TAG} — calibration against the frozen baseline's window (window grain)`);
  console.log(
    `  sessions that read a decision: ${frozen.sessionsReadingADecision} vs the frozen ${FROZEN_SESSIONS_READING_A_DECISION} — ${readsAgree ? "AGREES" : "DISAGREES"}`,
  );
  console.log(
    `  sessions that crossed an \`amends\` edge: ${frozen.sessionsCrossingAnAmendsEdge} vs the frozen chain figure ${FROZEN_SESSIONS_WALKING_A_CHAIN} — ${chainAgrees ? "AGREES" : "DISAGREES"}`,
  );
  if (!readsAgree || !chainAgrees) {
    console.log(
      "  ⚠ a disagreement is NOT automatically a defect: the frozen figures are over a fixed window of an\n" +
        "    append-only transcript store, so they should reproduce — but `amends` edges added to the log SINCE\n" +
        "    the freeze can make a session retrospectively cross an edge that did not exist when it read. Read\n" +
        "    the corpus line above before concluding the instrument drifted.",
    );
  }
  console.log("");

  const arms: Record<SessionGrain, { before: AmendsReachReading; after: AmendsReachReading }> = {
    window: {
      before: computeAmendsReach({ reads: gathered.reads, support, from: args.from, to: justBefore(args.split), grain: "window" }),
      after: computeAmendsReach({ reads: gathered.reads, support, from: args.split, to: args.to, grain: "window" }),
    },
    slot: {
      before: computeAmendsReach({ reads: gathered.reads, support, from: args.from, to: justBefore(args.split), grain: "slot" }),
      after: computeAmendsReach({ reads: gathered.reads, support, from: args.split, to: args.to, grain: "slot" }),
    },
  };

  console.log(`${TAG} — the two arms, split at the drain's completion (${args.split})`);
  console.log("");
  for (const grain of ["window", "slot"] as const) {
    console.log(`  === ${grain.toUpperCase()} GRAIN ===`);
    console.log(renderArm("BEFORE (targets not yet self-describing)", arms[grain].before));
    console.log("");
    console.log(renderArm("AFTER (453/453 annotated)", arms[grain].after));
    console.log("");
  }

  interface Spec {
    readonly measure: string;
    readonly beforeCount: number;
    readonly beforeTotal: number;
    readonly afterCount: number;
    readonly afterTotal: number;
  }
  const specs: Spec[] = [];
  for (const grain of ["window", "slot"] as const) {
    const { before, after } = arms[grain];
    specs.push(
      {
        measure: `[${grain}] sessions that CROSSED an \`amends\` edge, of sessions that read a decision`,
        beforeCount: before.sessionsCrossingAnAmendsEdge,
        beforeTotal: before.sessionsReadingADecision,
        afterCount: after.sessionsCrossingAnAmendsEdge,
        afterTotal: after.sessionsReadingADecision,
      },
      {
        measure: `[${grain}] sessions that READ an amended decision, of sessions that read a decision`,
        beforeCount: before.sessionsReadingAnAmendedDecision,
        beforeTotal: before.sessionsReadingADecision,
        afterCount: after.sessionsReadingAnAmendedDecision,
        afterTotal: after.sessionsReadingADecision,
      },
      {
        measure: `[${grain}] AMENDED-FIRST crossings, of all crossings — the read the annotation removes`,
        beforeCount: before.directions.amendedFirst,
        beforeTotal: before.amendsCrossings,
        afterCount: after.directions.amendedFirst,
        afterTotal: after.amendsCrossings,
      },
    );
  }

  // TWO PASSES, and the second is what stops this report cherry-picking itself. `sessionsNeeded`
  // falls as a base rate moves away from 50%, so the high-base-rate measures size themselves cheaply
  // and would return a direction off an arm the load-bearing measure cannot use. The floor is the
  // LARGEST sizing in the report: no measure speaks until the arm could carry the least sensitive one.
  const unfloored = specs.map((spec) => compareAmendsReach({ ...spec, detectableFall: args.fall }));
  const minimumArm = Math.max(...unfloored.map((c) => c.sessionsNeeded).filter((n) => Number.isFinite(n)));
  const comparisons: AmendsReachComparison[] = specs.map((spec) =>
    compareAmendsReach({ ...spec, detectableFall: args.fall, minimumArm }),
  );
  console.log(`${TAG} — ADR-0419 D5: have reaches into amended decisions FALLEN?`);
  console.log(
    `  the arm must clear ${minimumArm} session(s) before ANY measure returns a direction — the largest sizing\n` +
      "  in this report, so a high-base-rate measure cannot answer off an arm the load-bearing one cannot use.",
  );
  console.log("");
  for (const comparison of comparisons) {
    console.log(renderComparison(comparison));
    console.log("");
  }

  const underpowered = comparisons.filter((c) => c.verdict === "UNDERPOWERED").length;
  if (underpowered > 0) {
    console.log(
      `${TAG} — ${underpowered} of ${comparisons.length} comparison(s) UNDERPOWERED. That is a reading of the\n` +
        "  DENOMINATOR, not a failure to take one: the drain completed hours after the baseline was frozen, so the\n" +
        "  after arm accumulates at the rate sessions actually read decisions. Re-run when it has grown; nothing\n" +
        "  about the corpus needs to change for the answer to arrive.",
    );
    console.log("");
  }

  console.log(
    `${TAG} — THIS DECIDES NOTHING. \`oq-retire-the-amends-edge\` stays open, and its named blocker is untouched:\n` +
      "  `loadBearingReach` closes over `amends` ALONE, ADR-0419 D1 forbids a plain support edge promoting its\n" +
      "  target into the calibrate set, and no replacement computation has been designed.",
  );

  if (args.json !== undefined) {
    // RESOLVED AGAINST THE INVOKING DIRECTORY, not this process's. The `probe:` script runs through
    // `pnpm -C packages/cli`, so `process.cwd()` is the package, and a caller who passed a repo-root
    // relative path gets a `packages/cli/docs/…` tree silently created instead. pnpm carries the
    // original directory in `INIT_CWD` for exactly this.
    const out = path.resolve(process.env["INIT_CWD"] ?? process.cwd(), args.json);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      `${JSON.stringify(
        {
          corpus: shape,
          split: args.split,
          detectableFall: args.fall,
          calibration: {
            window: BASELINE_FROM,
            to: BASELINE_TO,
            sessionsReadingADecision: frozen.sessionsReadingADecision,
            frozenSessionsReadingADecision: FROZEN_SESSIONS_READING_A_DECISION,
            sessionsCrossingAnAmendsEdge: frozen.sessionsCrossingAnAmendsEdge,
            frozenSessionsWalkingAChain: FROZEN_SESSIONS_WALKING_A_CHAIN,
          },
          arms,
          comparisons,
          transcriptFiles: gathered.scannedFiles,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log("");
    console.log(`${TAG} — machine-readable reading written to ${out}`);
  }

  // A VACUOUS ARM is the one thing that is not a reading. An UNDERPOWERED comparison is.
  const vacuousBefore = arms.window.before.vacuity.length > 0;
  if (vacuousBefore) {
    console.error("");
    console.error(`${TAG} FAIL — the BEFORE arm measured nothing: ${arms.window.before.vacuity.join("; ")}`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(`${TAG} — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
