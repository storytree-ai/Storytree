/**
 * `pnpm probe:decision-composition-trial` — ADR-0428's reading: DEPTH BY ALTITUDE, BY ARM, over the
 * frozen matched pairs.
 *
 * `decision-read-measurement-arc` / `compose-the-treated-arm-with-a-staleness-marker`.
 *
 * ## WHAT IT ANSWERS, AND WHAT IT REFUSES TO ANSWER
 *
 * ADR-0428 D5, owner-directed: *"we are not trying to universally shorten the agents walk, as a whole
 * maybe but I imagine sometimes it structurally makes sense for some things to take a while to
 * reach."* So this probe never prints a single mean chain depth as the result. A fall in mean depth
 * is, from that number alone, indistinguishable from readers ceasing to read what they needed.
 *
 * It prints depth by ALTITUDE class, treated arm against control arm, with the difference stated —
 * the question being *did depth fall where the question was shallow, and HOLD where it was deep?*
 *
 * ## HOW A TRIAL IS ACTUALLY READ OFF IT
 *
 * Run it TWICE over two periods and compare the contrasts, not the raw depths:
 *
 *   - BEFORE — `--to 2026-08-23T00:00:00.000Z`, the frozen baseline's own window. Nothing was
 *     composed then, so every contrast should sit near zero; that is the matched design working, and
 *     a large contrast here is evidence about the MATCHING, not about composition.
 *   - AFTER — `--from <the day composition landed>`. A treated-arm fall concentrated in the classes
 *     where the question was shallow, with the deep classes holding, is the result ADR-0428 predicts.
 *
 * The arms come from the committed write-up and are NEVER re-derived (ADR-0428 D6): the corpus has
 * moved since the freeze, so `probe:decision-control-set` today produces a different experiment.
 *
 * ## KNOWN PRICE, MEASURED AND NOT RE-DERIVED HERE
 *
 * 46 of 401 sittings (11.5%) read from BOTH arms in one sitting. It is behavioural rather than
 * structural, cannot be designed away at frontier grain, and biases toward the NULL — it makes any
 * real effect look SMALLER, so a positive result survives it. The probe prints the contaminated
 * window count it observes itself rather than quoting the frozen figure, because contamination is a
 * property of the observation period and a later period has its own.
 *
 * ## WHAT THIS IS NOT
 *
 * NOT a gate rung, for `probe:decision-baseline`'s stated reason: the read half is a property of ONE
 * LAPTOP's transcript history, so nothing here is a repo invariant anyone could be held to. And NOT
 * a quality check over composed statements (ADR-0428 D7 / ADR-0427) — it measures reading behaviour
 * and grades no prose.
 *
 * ## EXIT CODES
 *
 * 0 when a reading was taken, INCLUDING when it shows no difference — that is a finding. 1 when it
 * could not be taken at all (no store, no transcripts, an unparseable frozen table, a cyclic support
 * graph) or when the pure half reports a VACUITY reason, because a table of zeros must never exit 0
 * under the reading "composition changed nothing".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDecisionId, resolveTranscriptDir } from "@storytree/context-traversal-transcript";

import {
  computeCompositionTrial,
  parseFrozenArms,
  type CompositionTrialReading,
  type TrialContrast,
} from "./decision-composition-trial.js";
import { resolveLabelSet, type AltitudeLabel } from "./decision-altitude.js";
import { decisionNumberOfObservedId, SupportGraphCycleError } from "./decision-read-baseline.js";
import { buildSupportGraph, gatherReads,
  frozenAmendsEdges,
} from "./probe-decision-gather.js";
import { loadProbeDecisions } from "./probe-decisions.js";

const TAG = "probe:decision-composition-trial";
const EXIT_UNREADABLE = 1;

/**
 * The two committed inputs, anchored to THIS MODULE rather than to `process.cwd()`.
 *
 * The probe runs through `pnpm -C packages/cli exec`, so the working directory is the package and a
 * repo-relative default would resolve to `packages/cli/docs/research/…` and refuse — the trap
 * `probe:decision-altitude` already documents.
 */
const FROZEN_ARMS = fileURLToPath(
  new URL("../../../docs/research/decision-composition-control-set-2026-08-23.md", import.meta.url),
);
const DEFAULT_LABELS = fileURLToPath(
  new URL("../../../docs/research/decision-altitude-labels-2026-08-23.json", import.meta.url),
);

const out = (line = ""): void => {
  process.stdout.write(`${line}\n`);
};

const num = (n: number, dp = 2): string => n.toFixed(dp);
const signed = (n: number, dp = 2): string => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}`;
const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
const adr = (n: number): string => `ADR-${String(n).padStart(4, "0")}`;
const classOf = (altitude: string | null): string => altitude ?? "(unlabelled)";

/** The committed label file's shape — `probe:decision-altitude`'s, restated at its second reader. */
interface AltitudeLabelFile {
  readonly passA: { readonly labels: readonly AltitudeLabel[] };
}

interface Args {
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly labels: string;
}

function parseArgs(argv: readonly string[]): Args {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    const next = argv[index + 1];
    return next !== undefined && !next.startsWith("--") ? next : undefined;
  };
  return { from: value("--from"), to: value("--to"), labels: value("--labels") ?? DEFAULT_LABELS };
}

function renderContrast(contrast: TrialContrast): string[] {
  const { treated: t, control: c } = contrast;
  const share = (cell: TrialContrast["treated"]): string =>
    cell.readings === 0 ? "   —  " : pct(cell.walks / cell.readings).padStart(6);
  return [
    `  ${classOf(contrast.altitude).padEnd(14)}` +
      `  treated ${String(t.frontiers).padStart(3)} frontiers ${String(t.readings).padStart(4)} readings` +
      `  depth ${num(t.meanDepthOverReaders)}  walked ${share(t)}`,
    `  ${" ".repeat(14)}` +
      `  control ${String(c.frontiers).padStart(3)} frontiers ${String(c.readings).padStart(4)} readings` +
      `  depth ${num(c.meanDepthOverReaders)}  walked ${share(c)}`,
    `  ${" ".repeat(14)}  treated − control:  depth ${signed(contrast.depthDifference)}` +
      `   walk share ${signed(contrast.walkShareDifference * 100, 1)} pts`,
  ];
}

function render(reading: CompositionTrialReading, args: Args): string {
  const lines: string[] = [];
  lines.push("THE OBSERVATION PERIOD");
  lines.push(
    `  from ${args.from ?? "(open)"}   to ${args.to ?? "(open)"}` +
      `   context windows ${reading.windowsObserved}   decision reads ${reading.readsInWindow}`,
  );
  lines.push("");
  lines.push("DEPTH BY ALTITUDE, BY ARM — the metric is PROPORTIONALITY, not shortening (ADR-0428 D5)");
  lines.push(
    "  `depth` is the ROOTED chain from the frontier, in records, averaged over the windows that read",
  );
  lines.push(
    "  it — a window reading the frontier alone counts 1. `walked` is the share that went deeper.",
  );
  lines.push("");
  for (const contrast of reading.contrasts) {
    if (contrast.treated.readings === 0 && contrast.control.readings === 0) continue;
    lines.push(...renderContrast(contrast));
    lines.push("");
  }
  lines.push("HOW TO READ IT");
  lines.push("  A negative depth difference concentrated in the SHALLOW classes, with the deep ones");
  lines.push("  holding, is the result ADR-0428 predicts. A uniform fall across every class is NOT the");
  lines.push("  same finding — it is indistinguishable from readers reading less than they needed.");
  lines.push("  Nothing here says a walk was expensive, or that a composed statement was read: a read");
  lines.push("  count is not a sufficiency measure.");
  lines.push("");
  lines.push("DENOMINATORS, STATED");
  lines.push(
    `  frontiers read by nobody in this period: ${reading.unreadFrontiers.length}` +
      (reading.unreadFrontiers.length === 0
        ? ""
        : `  (${reading.unreadFrontiers.slice(0, 8).map(adr).join(", ")}` +
          `${reading.unreadFrontiers.length > 8 ? ", …" : ""})`),
  );
  lines.push(
    `  frontiers the committed classification does not label: ${reading.unlabelledFrontiers.length}` +
      (reading.unlabelledFrontiers.length === 0
        ? ""
        : `  (${reading.unlabelledFrontiers.slice(0, 8).map(adr).join(", ")}` +
          `${reading.unlabelledFrontiers.length > 8 ? ", …" : ""})`),
  );
  lines.push("");
  lines.push("  CONTAMINATION is behavioural and belongs to THIS period, so it is not inherited from the");
  lines.push("  freeze's 11.5%. It biases toward the null — it makes a real effect look SMALLER — so a");
  lines.push("  positive result survives it and a null result does not become one because of it.");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let arms;
  try {
    arms = parseFrozenArms(fs.readFileSync(FROZEN_ARMS, "utf8"));
  } catch (e) {
    out(`${TAG}: ${(e as Error).message}`);
    process.exitCode = EXIT_UNREADABLE;
    return;
  }

  let labels: readonly AltitudeLabel[];
  try {
    // `passA` is the EDITORIAL classification — the same half `probe:decision-altitude` reports
    // against, and the one ADR-0428 D5 names. Pass B is a committed lexical classifier that
    // reproduces it only 52.4% (kappa 0.288), so reading it here instead would silently change what
    // "altitude" means between two instruments that are meant to be compared.
    const file = JSON.parse(fs.readFileSync(args.labels, "utf8")) as AltitudeLabelFile;
    labels = file.passA.labels;
  } catch (e) {
    out(`${TAG}: could not read the altitude labels at ${path.resolve(args.labels)}: ${(e as Error).message}`);
    process.exitCode = EXIT_UNREADABLE;
    return;
  }
  // ONE resolution point, never a string join — `-inc-01` measured a raw join at ~35x under-count.
  const resolved = resolveLabelSet(labels, resolveDecisionId);

  const { adrs, parseErrors } = await loadProbeDecisions(TAG);
  if (adrs.length === 0) {
    for (const problem of parseErrors) out(`${TAG}: ${problem}`);
    process.exitCode = EXIT_UNREADABLE;
    return;
  }
  const support = buildSupportGraph(adrs, frozenAmendsEdges());

  const transcriptDir = resolveTranscriptDir();
  const gathered = gatherReads(transcriptDir);
  if (gathered.scannedFiles === 0) {
    out(`${TAG}: no host transcripts under ${transcriptDir} — there is nothing to read behaviour from.`);
    process.exitCode = EXIT_UNREADABLE;
    return;
  }

  let reading: CompositionTrialReading;
  try {
    // Unconditional spreads over a base, chosen by ternaries — the window bounds must be ABSENT
    // under `exactOptionalPropertyTypes`, and this says so without a conditional `{}` spread
    // (`no-conditional-empty-object-spread`) or an annotated accumulator (`no-known-value-widening`).
    const trialBase = {
      arms,
      support,
      altitude: resolved.byDecision,
      reads: gathered.reads,
      resolve: decisionNumberOfObservedId,
    };
    const withFrom = args.from === undefined ? trialBase : { ...trialBase, from: args.from };
    reading = computeCompositionTrial(
      args.to === undefined ? withFrom : { ...withFrom, to: args.to },
    );
  } catch (e) {
    if (e instanceof SupportGraphCycleError) {
      out(`${TAG}: ${e.message}`);
      process.exitCode = EXIT_UNREADABLE;
      return;
    }
    throw e;
  }

  out(render(reading, args));

  if (reading.vacuity.length > 0) {
    out("");
    out(`${TAG}: VACUOUS — this reading measured nothing, and must not be read as a null result:`);
    for (const reason of reading.vacuity) out(`  - ${reason}`);
    process.exitCode = EXIT_UNREADABLE;
  }
}

await main();
