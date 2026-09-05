/**
 * `pnpm probe:co-read-edges [--top <n>]` — the IO half of {@link computeCoReadEdges}.
 *
 * `follow-the-research-arc-inc-04`. Derives the relation nobody authored — two decisions read in one
 * context window — and classifies each pair against the authored support graph, so the question
 * "does co-reading surface a neighbour no edge reaches?" can be answered from observation rather
 * than from text similarity. The compute, its session-key reasoning and its fences are in
 * `co-read-edges.ts`; this module only reads.
 *
 * READS THE HOST TRANSCRIPTS, NOT THE TRACE STORE, and that is the same call `gatherReads` already
 * documents: transcripts are the only source carrying the host CONTEXT WINDOW id, and "read in one
 * sitting" is a question about a window rather than about a pooled worktree slot. The two sources
 * OVERLAP by construction, so unioning them would double-count every read both routes reached.
 *
 * ## EXIT CODE
 *
 * 0 when a derivation was actually taken; 1 when it could not be — no decision log, no transcript
 * files, or no resolved reads at all. A set of numbers that measured nothing must not exit 0 under a
 * table of zeros, which is the failure `probe:decision-reads` was repaired for. ⚠ Note the honest
 * boundary: ZERO PAIRS from a real population is a RESULT and exits 0. "Nobody ever read two
 * decisions in one sitting" is a finding; "I read no transcripts" is a broken instrument.
 */
import { resolveTranscriptDir } from "@storytree/context-traversal-transcript";

import { ADJACENCY_GAP, computeCoReadEdges, type CoReadReading } from "./co-read-edges.js";
import { decisionNumberOfObservedId } from "./decision-read-baseline.js";
import { buildSupportGraph, frozenAmendsEdges, gatherReads } from "./probe-decision-gather.js";
import { loadProbeDecisions } from "./probe-decisions.js";

const TAG = "probe:co-read-edges";
const DEFAULT_TOP = 25;

function parseTop(argv: readonly string[]): number {
  const index = argv.indexOf("--top");
  if (index === -1) return DEFAULT_TOP;
  const raw = argv[index + 1];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TOP;
}

const pct = (part: number, whole: number): string =>
  whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(1)}%`;

function render(reading: CoReadReading, top: number): void {
  console.log(`${TAG} — the population, with every denominator it rests on`);
  console.log(`  resolved reads            ${reading.resolvedReads}`);
  console.log(`  unresolved (not an ADR)   ${reading.unresolvedReads}`);
  console.log(`  dropped (no window id)    ${reading.readsWithoutWindow}   — counted, never folded onto a slot`);
  console.log(`  windows                   ${reading.windows}`);
  console.log(
    `  windows yielding a pair   ${reading.windowsYieldingPairs}   (${pct(reading.windowsYieldingPairs, reading.windows)} read 2+ distinct decisions)`,
  );
  console.log(
    `  worst single window       ${reading.maxPairsFromOneWindow} pairs   — pair count is QUADRATIC in a window's reads`,
  );
  console.log("");

  console.log(`${TAG} — the pairs`);
  console.log(`  decisions read            ${reading.distinctDecisionsRead}`);
  console.log(
    `  possible pairs            ${reading.possiblePairs}   — the universe; observed pairs are ${pct(reading.pairs.length, reading.possiblePairs)} of it`,
  );
  console.log(`  distinct co-read pairs    ${reading.pairs.length}`);
  console.log(
    `  already authored          ${reading.authoredPairs}   (${pct(reading.authoredPairs, reading.pairs.length)})`,
  );
  console.log(
    `  NOVEL (no edge reaches)   ${reading.novelPairs}   (${pct(reading.novelPairs, reading.pairs.length)})`,
  );
  console.log(
    `    of those, numerically adjacent (gap <= ${ADJACENCY_GAP})   ${reading.novelPairsNumericallyAdjacent}   (${pct(reading.novelPairsNumericallyAdjacent, reading.novelPairs)})`,
  );
  console.log(
    `    ⚠ consecutive decisions are usually authored in ONE sitting about ONE subject — reading both discovers nothing.`,
  );
  console.log(
    `  novel in 2+ windows       ${reading.novelPairsInMultipleWindows}   — the ones coincidence explains least`,
  );
  console.log("");

  console.log(`${TAG} — do co-reads recover the edges we DID author?`);
  console.log(
    `  authored edges co-read    ${reading.authoredEdgesCoRead} of ${reading.authoredEdgesWithBothEndsRead}` +
      `   (${pct(reading.authoredEdgesCoRead, reading.authoredEdgesWithBothEndsRead)})`,
  );
  console.log(`    denominator is edges whose BOTH ends were read — the only ones that COULD be co-read.`);
  const chance = reading.authoredCoReadExpectedByChance;
  const lift = chance === 0 ? "n/a" : `${(reading.authoredEdgesCoRead / chance).toFixed(1)}x`;
  console.log(
    `  expected by chance        ${chance.toFixed(1)} at this density   → observed is ${lift} chance`,
  );
  console.log(`    ⚠ WITHOUT THIS the recall figure is unreadable — a dense enough pair set recovers edges by arithmetic.`);
  console.log(`  support populations       amends ${reading.amendsEdges} · dependsOn ${reading.dependsOnEdges}   (never summed)`);
  console.log("");

  const novel = reading.pairs.filter((pair) => !pair.authored).slice(0, top);
  if (novel.length === 0) {
    console.log(`${TAG} — no novel pairs to inspect.`);
    return;
  }
  console.log(`${TAG} — top ${novel.length} novel pairs, FOR HAND INSPECTION (this is a hypothesis, not a relation)`);
  for (const pair of novel) {
    const label = `ADR-${String(pair.low).padStart(4, "0")} + ADR-${String(pair.high).padStart(4, "0")}`;
    console.log(`  ${String(pair.windows).padStart(3)} windows   ${label}`);
  }
}

async function main(): Promise<void> {
  const top = parseTop(process.argv.slice(2));
  const transcriptDir = resolveTranscriptDir();
  console.log(`${TAG} — transcripts: ${transcriptDir}`);
  console.log("");

  const { adrs, parseErrors } = await loadProbeDecisions(TAG);
  if (parseErrors.length > 0) {
    for (const error of parseErrors) console.error(`${TAG} — ${error}`);
    process.exitCode = 1;
    return;
  }

  const support = buildSupportGraph(adrs, frozenAmendsEdges());
  const gathered = gatherReads(transcriptDir);

  if (gathered.scannedFiles === 0) {
    console.error(
      `${TAG} FAIL — no transcript files were found under ${transcriptDir}. That is a walk that read ` +
        "nothing, not a machine with no history; set STORYTREE_TRANSCRIPT_DIR if the host writes them elsewhere.",
    );
    process.exitCode = 1;
    return;
  }

  const reading = computeCoReadEdges(
    gathered.reads,
    support.amends,
    support.dependsOn,
    decisionNumberOfObservedId,
  );

  if (reading.resolvedReads === 0) {
    console.error(
      `${TAG} FAIL — ${gathered.scannedFiles} transcript file(s) scanned and not one read resolved to a ` +
        "decision. That is an instrument that saw nothing, not a corpus nobody reads.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`${TAG} — scanned ${gathered.scannedFiles} transcript file(s)`);
  console.log("");
  render(reading, top);
}

void main();
