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
 * ## AND IT REFUSES TO ATTRIBUTE A FALL IT CANNOT ATTRIBUTE
 *
 * Power and attribution are different questions, and an arm can pass the first while failing the
 * second. A SECOND intervention entered the after arm on 2026-08-23 — see {@link SECOND_INTERVENTION}
 * — so a direction measured across it has two candidate causes and this design separates neither.
 * Any non-`UNDERPOWERED` verdict is therefore stamped NOT ATTRIBUTABLE, with the clean sub-arm's size
 * printed beside it. That sub-arm is FROZEN: waiting buys power only on the confounded side.
 *
 * It decides NOTHING about whether `amends` is retired — that was settled on 2026-08-23 by ADR-0431
 * (option A, retire it outright) and executed end to end, so this probe no longer feeds an open
 * question. What survives is the narrower one it can still speak to: did the annotation discharge the
 * reading, or did readers go on reaching while the corpus stopped telling them where?
 *
 * Exit 0 when a reading was taken — including an underpowered one, which measured a real denominator.
 * Exit 1 when it could not be taken at all: no decision log, no transcripts, or a vacuous arm.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveTranscriptDir } from "@storytree/context-traversal-transcript";

import {
  afterArmIsConfounded,
  amendsCorpusShape,
  compareAmendsReach,
  computeAmendsReach,
  type AmendsReachComparison,
  type AmendsReachReading,
} from "./amends-reach.js";
import type { DecisionSupportGraph, SessionGrain } from "./decision-read-baseline.js";
import { buildSupportGraph, frozenAmendsEdges, gatherReads } from "./probe-decision-gather.js";
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

/**
 * When a SECOND intervention entered the after arm — the instant this comparison stops being able to
 * ATTRIBUTE a fall to the annotation, however large the arm grows.
 *
 * ## THE TWO EVENTS, NINE MINUTES APART, AND WHY THE EARLIER ONE IS THE BOUND
 *
 *   - `2026-08-23T13:13:58Z` — PR #1596 landed ADR-0428's composed statements on the treated
 *     frontiers, which changes what a reader finds when they arrive at a decision.
 *   - `2026-08-23T13:23Z .. 14:22Z` — `-inc-18` rewrote all 517 `amends` edges onto `dependsOn` in
 *     place (measured from the write log: the `claude/retire-amends` writes on `-inc-18`'s own row
 *     and on the decision rows themselves). `-inc-19` then deleted the field and, with it, `adr
 *     list`'s `☆` mark and its `amended by NNNN` back-edge.
 *
 * The edges SURVIVED — `adr list` still derives a `depended on by NNNN` back-edge, so both directions
 * remain walkable. What did not survive is the LABEL: a pointer that said this decision was NARROWED
 * by that one now says only that something supports it, mixed in with every other support edge. That
 * is a plausible cause of a fall in crossings all by itself, and it is not the annotation.
 *
 * The bound is the EARLIER instant because either event is enough to break attribution, so the clean
 * window ends at the first of them.
 *
 * ## THIS IS PERMANENT, NOT A WAIT
 *
 * Time only moves forward, so the clean sub-arm — annotation complete AND the edge still labelled —
 * is FROZEN at whatever it held on 2026-08-23. Further accrual grows only the confounded side. A
 * session re-running this probe for a bigger arm is buying power it can no longer spend on D5's
 * actual question.
 */
const SECOND_INTERVENTION = "2026-08-23T13:13:58.000Z";

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

function renderComparison(comparison: AmendsReachComparison, confounded: boolean): string {
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
  } else if (confounded) {
    // The direction still stands as a DESCRIPTION of the two arms; what it cannot do is name a
    // cause. Printing it bare would be read as the annotation working, which is the one reading
    // this arm cannot support.
    lines.push(
      `    VERDICT: ${comparison.verdict} — NOT ATTRIBUTABLE (a second intervention is inside this arm; see ATTRIBUTION)`,
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

  // THE `amends` ARM IS JOINED AGAINST THE FROZEN EDGE SET, NOT THE LIVE CORPUS.
  //
  // `-inc-18` migrated all 517 edges onto `dependsOn` in place, so the live rows can no longer
  // supply the join key this comparison is built on: measured 2026-08-24, a live-sourced run read
  // ONE edge and reported the frozen window's 203 chain-walkers as 0. That is a deleted join key,
  // not a corpus that stopped being read, and the two are indistinguishable in the output.
  //
  // Both arms now read the SAME edge set, which is what a before/after comparison required all
  // along — an edge set that moves between the arms is a confound, not a measurement. `dependsOn`
  // stays LIVE: it is a live reading, is no part of the frozen comparison, and is counted apart and
  // never summed (ADR-0419 D1).
  // ONE LOADER, shared with every other decision-measurement probe (`probe-decision-gather.ts`).
  // A second copy here would be a second experiment the moment either drifted, which is the failure
  // `probe-decisions.ts` was extracted to prevent one file above. It THROWS rather than degrading if
  // the snapshot no longer matches its own declared count.
  let support: DecisionSupportGraph;
  try {
    support = buildSupportGraph(adrs, frozenAmendsEdges());
  } catch (error) {
    console.error(`${TAG} FAIL — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }
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
    "  — the `amends` edges are the FROZEN set, read from" +
      "\n    docs/research/amends-edge-snapshot-2026-08-23.md, NOT from the live rows. The live rows" +
      "\n    carry none and no longer can: `-inc-18` migrated them onto `dependsOn` in place and" +
      "\n    `-inc-19` deleted the field, and this comparison needs both arms joined against the same" +
      "\n    edge set (ADR-0431 D2 froze the file for exactly this).",
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
      "  ⚠ a disagreement is NOT automatically a defect, and it has TWO causes that read identically —\n" +
        "    check the corpus line above before concluding anything about readers:\n" +
        "      · the edge set GREW — `amends` edges added since the freeze make a session retrospectively\n" +
        "        cross an edge that did not exist when it read; or\n" +
        "      · the edge set SHRANK — the join key was removed underneath the comparison. This is what\n" +
        "        happened on 2026-08-24, when a live-sourced run read 1 edge and reported 203 chain-walkers\n" +
        "        as 0. It looks exactly like a collapse in reading and is not one. The `amends` arm is now\n" +
        "        sourced from the frozen snapshot precisely so this cause cannot recur.\n" +
        "    The read population itself is the line above it: if THAT agrees, the transcripts reproduced and\n" +
        "    only the edge set moved.",
    );
  }
  console.log("");

  const arms = {
    window: {
      before: computeAmendsReach({ reads: gathered.reads, support, from: args.from, to: justBefore(args.split), grain: "window" }),
      after: computeAmendsReach({ reads: gathered.reads, support, from: args.split, to: args.to, grain: "window" }),
    },
    slot: {
      before: computeAmendsReach({ reads: gathered.reads, support, from: args.from, to: justBefore(args.split), grain: "slot" }),
      after: computeAmendsReach({ reads: gathered.reads, support, from: args.split, to: args.to, grain: "slot" }),
    },
    // `satisfies`, not an annotation: this is a TOTAL table over a closed union, so the check that
    // both grains are present is kept while the literal keys stay readable (anti-slop
    // `no-known-value-widening`).
  } satisfies Record<SessionGrain, { before: AmendsReachReading; after: AmendsReachReading }>;

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
  // ATTRIBUTION, decided from the arm's OBSERVED end and at BOTH grains. Either grain reaching past
  // the second intervention confounds the report, because the report is read as one thing.
  const confounded =
    afterArmIsConfounded(arms.window.after.observedTo, SECOND_INTERVENTION) ||
    afterArmIsConfounded(arms.slot.after.observedTo, SECOND_INTERVENTION);
  // The sub-arm that saw the annotation and NOT the relabelling — the only window that could answer
  // D5 as asked. Computed from reads already gathered, so it costs a pass over memory, not a re-scan.
  const clean = {
    window: computeAmendsReach({ reads: gathered.reads, support, from: args.split, to: justBefore(SECOND_INTERVENTION), grain: "window" }),
    slot: computeAmendsReach({ reads: gathered.reads, support, from: args.split, to: justBefore(SECOND_INTERVENTION), grain: "slot" }),
  } satisfies Record<SessionGrain, AmendsReachReading>;

  console.log(`${TAG} — ADR-0419 D5: have reaches into amended decisions FALLEN?`);
  console.log(
    `  the arm must clear ${minimumArm} session(s) before ANY measure returns a direction — the largest sizing\n` +
      "  in this report, so a high-base-rate measure cannot answer off an arm the load-bearing one cannot use.",
  );
  console.log("");
  for (const comparison of comparisons) {
    console.log(renderComparison(comparison, confounded));
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

  if (confounded) {
    console.log(
      `${TAG} — ATTRIBUTION: A DIRECTION ABOVE IS NOT THE ANNOTATION'S. Read this before quoting any FALL.\n` +
        `  A SECOND intervention lands inside the after arm at ${SECOND_INTERVENTION}: ADR-0428's composed\n` +
        "  statements (PR #1596), then within ten minutes `-inc-18`'s rewrite of all 517 `amends` edges onto\n" +
        "  `dependsOn`, which took the `☆` mark and the `amended by NNNN` back-edge with it. The edges survived\n" +
        "  as `depended on by`, so both directions are still walkable — but the pointer stopped saying that the\n" +
        "  target had been NARROWED, and that alone is a candidate cause of a fall in crossings.\n" +
        "\n" +
        "  So D5's question — did the ANNOTATION discharge the reading? — has two candidate causes in this arm\n" +
        "  and this design cannot separate them. The arm that CAN answer it ends at the instant above:\n" +
        `      window grain  ${clean.window.sessionsReadingADecision} session(s) that read a decision · ` +
        `${clean.window.sessionsCrossingAnAmendsEdge} crossed an \`amends\` edge\n` +
        `      slot grain    ${clean.slot.sessionsReadingADecision} session(s) that read a decision · ` +
        `${clean.slot.sessionsCrossingAnAmendsEdge} crossed an \`amends\` edge\n` +
        `  Re-run bounded to it with:  pnpm probe:amends-reach --to ${SECOND_INTERVENTION}\n` +
        "\n" +
        "  ⚠ THAT SUB-ARM IS FROZEN AND WILL NEVER GROW. Time only moves forward, so waiting buys power only on\n" +
        "  the confounded side. This is a PERMANENT limit on D5's read test, not a denominator to wait out.",
    );
    console.log("");
  }

  console.log(
    `${TAG} — THIS DECIDES NOTHING, and it no longer has a question to feed.\n` +
      "  `oq-retire-the-amends-edge` was SETTLED on 2026-08-23 (option A, recorded by ADR-0431), and the edge is\n" +
      "  retired end to end: the field is gone from the schema and `loadBearingReach` reads the curated tag alone\n" +
      "  (ADR-0431 D4 froze the derived reach into it first — 221 members before, 221 after). So this probe answers\n" +
      "  the narrower question that survived: whether the annotation actually discharged the reading, or whether\n" +
      "  readers went on reaching and the corpus stopped telling them where.",
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
