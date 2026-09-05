/**
 * `pnpm probe:ppr` — the Personalized PageRank bake-off against our own BM25, on our own reads.
 *
 * `follow-the-research-arc-inc-03`, the HippoRAG trial (arXiv 2405.14831). The pure half is
 * {@link import("./ppr.js")}; this half reads the transcripts and the live corpus, and it is the
 * only half allowed to touch either.
 *
 * **A DIAGNOSTIC, NOT A GATE RUNG**, the `probe:co-read-edges` and `probe:adr-graph` precedent
 * exactly. It measures and writes nothing: no corpus write, no ADR edit, no decision changed. A
 * `check:` name would be picked up by the gate plan's unplanned-check guard, which is the concrete
 * reason the verb is `probe:`.
 *
 * ## THE THREE ARMS, AND WHY THE BASELINE IS THE SHIPPED ONE
 *
 * The control is `library search`'s OWN BM25 — `buildSearchIndex` + `searchCorpus` through
 * `toSearchDoc`, the same three calls `librarySearch` makes — never a re-implementation. A control
 * arm built here would drift from what ships and would flatter whichever side its author tuned last;
 * comparing against what ships is the only comparison anyone can act on.
 *
 * The query handed to it is the SEED DECISION'S TITLE. That is what an agent has when it has landed
 * on one decision and wants the rest: the words on the thing in front of it. Both arms therefore get
 * the same question — *given this decision, what else does this window need?* — and differ only in
 * whether they answer it from TEXT or from STRUCTURE.
 *
 * ## ⚠ THE GOLD IS OBSERVED, NOT AUTHORED (ADR-0513 D8)
 *
 * Scoring `dependsOn`-derived queries against `dependsOn` is a tautology that passes trivially. The
 * gold here is what a real context window actually went on to read, so the edges PPR walks and the
 * answers it is scored against come from independent sources. The full argument is in
 * {@link import("./ppr.js")}'s header; the split below closes the second, subtler circularity for
 * the co-read arm.
 *
 * ## FAIL-CLOSED BOUNDARIES
 *
 * Zero transcript files, zero resolved reads, zero cases, or an UNCONVERGED walk are all instrument
 * failures and exit 1. A low recall from a real population is a RESULT and exits 0 — "the graph does
 * not predict what agents read next" is a finding this arc explicitly accepts (`a negative is a
 * landing here, not a failure`). The one thing that must never happen is a number published from a
 * walk that never settled.
 */
import { resolveTranscriptDir } from "@storytree/context-traversal-transcript";
import { openCorpusStore } from "@storytree/drive";
import { buildSearchIndex, relatedArtifacts, searchCorpus } from "@storytree/library";

import { computeCoReadEdges } from "./co-read-edges.js";
import { decisionNumberOfObservedId, type DecisionEdge } from "./decision-read-baseline.js";
import { toSearchDoc } from "./library-search.js";
import {
  buildPprGraph,
  buildRetrievalCases,
  chanceRecallAtK,
  hopDistances,
  pairedDifference,
  personalizedPageRank,
  rankFromScores,
  recallAtK,
  splitWindowsByHash,
  type PprGraph,
  type RetrievalCase,
} from "./ppr.js";
import { buildSupportGraph, frozenAmendsEdges, gatherReads } from "./probe-decision-gather.js";
import { loadProbeDecisions } from "./probe-decisions.js";

const TAG = "probe:ppr";
const CUTS = [5, 10, 20] as const;
const TEST_SHARE = 0.5;
/** A co-read pair seen in only one window is a coincidence as easily as a relation. */
const CO_READ_MIN_WINDOWS = 2;

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const adrLabel = (n: number): string => `ADR-${String(n).padStart(4, "0")}`;

interface ArmResult {
  readonly name: string;
  readonly note: string;
  /** Mean recall at each cut in {@link CUTS}, over the scored cases. */
  readonly recall: readonly number[];
  readonly scored: number;
  /** Per-case recall, keyed by window, so two arms can be PAIRED on the cases both ranked. */
  readonly byWindow: ReadonlyMap<string, readonly number[]>;
}

/** The two arms' per-case scores at one cut, over the cases BOTH of them ranked. */
function alignAt(a: ArmResult, b: ArmResult, cutIndex: number) {
  const left: number[] = [];
  const right: number[] = [];
  for (const [windowId, scores] of a.byWindow) {
    const other = b.byWindow.get(windowId);
    if (other === undefined) continue;
    left.push(scores[cutIndex] ?? 0);
    right.push(other[cutIndex] ?? 0);
  }
  return { a: left, b: right };
}

/** Mean over the cases, computed per cut so one short ranking cannot skew another cut. */
function scoreArm(
  name: string,
  note: string,
  cases: readonly RetrievalCase[],
  rank: (entry: RetrievalCase) => readonly number[] | null,
): ArmResult {
  const totals = CUTS.map(() => 0);
  const byWindow = new Map<string, readonly number[]>();
  let scored = 0;
  for (const entry of cases) {
    const ranked = rank(entry);
    if (ranked === null) continue;
    const gold = new Set(entry.gold);
    const perCut = CUTS.map((k) => recallAtK(ranked, gold, k));
    perCut.forEach((value, index) => {
      totals[index] = (totals[index] ?? 0) + value;
    });
    byWindow.set(entry.windowId, perCut);
    scored += 1;
  }
  return {
    name,
    note,
    scored,
    byWindow,
    recall: totals.map((total) => (scored === 0 ? 0 : total / scored)),
  };
}

function pprArm(
  name: string,
  note: string,
  graph: PprGraph,
  cases: readonly RetrievalCase[],
  alpha: number,
): ArmResult {
  return scoreArm(name, note, cases, (entry) => {
    if (!graph.indexOf.has(entry.seed)) return null;
    const result = personalizedPageRank(graph, [entry.seed], { alpha });
    if (!result.converged) {
      throw new Error(
        `${TAG} FAIL — the walk for ${adrLabel(entry.seed)} did not converge at alpha ${alpha}. ` +
          "A ranking from an unsettled walk is not a measurement; raise DEFAULT_MAX_ITERATIONS.",
      );
    }
    return rankFromScores(graph, result.scores, [entry.seed]);
  });
}

function renderArms(arms: readonly ArmResult[], chance: readonly number[]): void {
  const width = Math.max(...arms.map((arm) => arm.name.length), 8);
  const head = CUTS.map((k) => `recall@${k}`.padStart(10)).join("");
  console.log(`  ${"arm".padEnd(width)}${head}   ×chance@20  cases`);
  for (const arm of arms) {
    const cells = arm.recall.map((value) => pct(value).padStart(10)).join("");
    const base = chance[CUTS.length - 1] ?? 0;
    const lift = base === 0 ? "n/a" : `${((arm.recall[CUTS.length - 1] ?? 0) / base).toFixed(1)}x`;
    console.log(
      `  ${arm.name.padEnd(width)}${cells}   ${lift.padStart(10)}  ${String(arm.scored).padStart(5)}`,
    );
  }
  const chanceCells = chance.map((value) => pct(value).padStart(10)).join("");
  console.log(`  ${"chance".padEnd(width)}${chanceCells}   ${"1.0x".padStart(10)}      —`);
  for (const arm of arms) console.log(`    ${arm.name} — ${arm.note}`);
}

async function main(): Promise<void> {
  const transcriptDir = resolveTranscriptDir();
  console.log(`${TAG} — transcripts: ${transcriptDir}`);

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
      `${TAG} FAIL — no transcript files under ${transcriptDir}. That is a walk that read nothing, ` +
        "not a machine with no history; set STORYTREE_TRANSCRIPT_DIR if the host writes them elsewhere.",
    );
    process.exitCode = 1;
    return;
  }

  const reading = buildRetrievalCases(gathered.reads, decisionNumberOfObservedId);
  if (reading.cases.length === 0) {
    console.error(
      `${TAG} FAIL — ${gathered.scannedFiles} transcript file(s) scanned and not one window read two ` +
        "distinct decisions. That is an instrument that saw nothing, not a corpus nobody reads.",
    );
    process.exitCode = 1;
    return;
  }

  const { train, test } = splitWindowsByHash(reading.cases, TEST_SHARE);
  const trainWindows = new Set(train.map((entry) => entry.windowId));

  // The co-read arm's edges come from the TRAIN half ONLY, through the SHIPPED reader — never a
  // second pair-builder written here. Scoring co-read edges on the windows that built them would be
  // circular in the flattering direction, which is the whole reason this split exists.
  const trainReads = gathered.reads.filter(
    (read) => read.windowId !== undefined && trainWindows.has(read.windowId),
  );
  const coRead = computeCoReadEdges(
    trainReads,
    support.amends,
    support.dependsOn,
    decisionNumberOfObservedId,
  );
  const coReadEdges: DecisionEdge[] = coRead.pairs
    .filter((pair) => pair.windows >= CO_READ_MIN_WINDOWS)
    .map((pair) => ({ from: pair.low, to: pair.high }));

  const authored = buildPprGraph(support.decisions, support.dependsOn);
  const directed = buildPprGraph(support.decisions, support.dependsOn, { directed: true });
  const augmented = buildPprGraph(support.decisions, [...support.dependsOn, ...coReadEdges]);

  console.log(`${TAG} — scanned ${gathered.scannedFiles} transcript file(s)`);
  console.log("");
  console.log(`${TAG} — the population, with every denominator it rests on`);
  console.log(`  decisions in the log        ${support.decisions.length}`);
  console.log(`  authored dependsOn edges    ${authored.edgeCount}   (${authored.droppedEndpoints} named a decision the log does not hold)`);
  console.log(`  decisions with no edge      ${authored.danglingNodes}`);
  console.log(`  windows reading a decision  ${reading.windowsSeen}`);
  console.log(`  ...reading 2+ distinct      ${reading.cases.length}   — the scorable cases`);
  console.log(`  dropped (no window id)      ${reading.readsWithoutWindow}   — counted, never folded onto a slot`);
  console.log(`  unresolved reads            ${reading.unresolvedReads}`);
  console.log(`  train / test windows        ${train.length} / ${test.length}   (deterministic hash split)`);
  console.log(`  co-read edges from TRAIN    ${coReadEdges.length}   (seen in ${CO_READ_MIN_WINDOWS}+ windows)`);
  console.log("");

  // The BM25 control, through the shipped calls and nothing else.
  const corpus = await openCorpusStore(TAG);
  let arms: ArmResult[];
  try {
    const rows = await corpus.store.queryDocs();
    const searchDocs = rows.map(toSearchDoc);
    const index = buildSearchIndex(searchDocs);
    const titleOf = new Map<number, string>();
    for (const doc of searchDocs) {
      const number = decisionNumberOfObservedId(doc.id);
      if (number !== null && doc.title !== undefined) titleOf.set(number, doc.title);
    }

    const bm25 = scoreArm(
      "bm25",
      "the SHIPPED `library search` ranker, queried with the seed decision's own title",
      test,
      (entry) => {
        const title = titleOf.get(entry.seed);
        if (title === undefined || title.trim() === "") return null;
        const result = searchCorpus(index, title, { kind: "adr", limit: 200 });
        return result.hits
          .map((hit) => decisionNumberOfObservedId(hit.id))
          .filter((n): n is number => n !== null && n !== entry.seed);
      },
    );

    /**
     * ⚠ THE NULL THAT DECIDES WHETHER ANY OF THIS IS ABOUT THE SEED.
     *
     * On an undirected graph a high alpha drives PPR toward the degree-proportional stationary
     * distribution (pinned by `ppr.test.ts`), so a PPR arm can score well by surfacing the same
     * dozen hub decisions for EVERY query — which on this corpus is a live risk, since the
     * load-bearing set is re-read constantly. This arm ranks by degree ALONE and never looks at the
     * seed. If it lands near the PPR arms, the lift is popularity wearing personalization's clothes
     * and the finding collapses; the chance null cannot catch that, because it is a fact about the
     * corpus rather than about the arithmetic.
     */
    const degreeOrder = authored.nodes
      .map((node, index) => ({ node, degree: (authored.neighbours[index] ?? []).length }))
      .sort((a, b) => b.degree - a.degree || a.node - b.node)
      .map((entry) => entry.node);

    const popularity = scoreArm(
      "degree",
      "STATIC hub ranking that ignores the seed entirely — the null for 'is the seeding doing work?'",
      test,
      (entry) => degreeOrder.filter((node) => node !== entry.seed),
    );

    /**
     * ⚠ THE FAIR TEXT ARM, AND THE ONE THIS TRIAL WOULD HAVE BEEN RIGGED WITHOUT.
     *
     * `bm25` above is handed the seed's TITLE, which is what an agent types. But the shipped answer
     * to the question this trial actually asks — *given this artifact, what else bears on it?* — is
     * `library related`, which lifts the source's own twelve most distinguishing tf-idf terms and
     * searches with those. Scoring a graph method against the weaker of two shipped text retrievers
     * would manufacture the result, so both run and the STRONGER one is the bar PPR has to clear.
     */
    const docIdOf = new Map<number, string>();
    for (const doc of searchDocs) {
      const number = decisionNumberOfObservedId(doc.id);
      if (number !== null) docIdOf.set(number, doc.id);
    }
    const related = scoreArm(
      "related",
      "the SHIPPED `library related` ranker — the source's own top-12 tf-idf terms, the fair text bar",
      test,
      (entry) => {
        const sourceId = docIdOf.get(entry.seed);
        if (sourceId === undefined) return null;
        const result = relatedArtifacts(index, searchDocs, sourceId, { kind: "adr", limit: 200 });
        return result.hits
          .map((hit) => decisionNumberOfObservedId(hit.id))
          .filter((n): n is number => n !== null && n !== entry.seed);
      },
    );

    /**
     * ⚠ THE ACTUAL HippoRAG SHAPE, AND WITHOUT IT THIS TRIAL TESTS A STRAW MAN.
     *
     * HippoRAG does not spread from a node you already know — it retrieves SEEDS BY TEXT from the
     * query, then lets Personalized PageRank spread from all of them at once. That two-stage shape is
     * the method; the single-seed arms above are a simplification that happens to be easy to set up
     * here because our "query" is itself a decision. Reporting "PPR does not help" from the
     * simplification alone would be a claim about my harness rather than about the published method.
     *
     * So: the seed decision PLUS the top text matches for its title become the restart vector.
     */
    const hybridSeedCount = 5;
    const hybrid = scoreArm(
      "ppr-hybrid",
      `HippoRAG's own two stages — BM25 picks ${hybridSeedCount} seeds by TEXT, then PPR spreads from all of them`,
      test,
      (entry) => {
        const title = titleOf.get(entry.seed);
        if (title === undefined || title.trim() === "") return null;
        if (!authored.indexOf.has(entry.seed)) return null;
        const hits = searchCorpus(index, title, { kind: "adr", limit: hybridSeedCount });
        const seeds = [
          entry.seed,
          ...hits
            .hits.map((hit) => decisionNumberOfObservedId(hit.id))
            .filter((n): n is number => n !== null && authored.indexOf.has(n)),
        ];
        const result = personalizedPageRank(authored, seeds, { alpha: 0.5 });
        if (!result.converged) throw new Error(`${TAG} FAIL — hybrid walk did not converge`);
        return rankFromScores(authored, result.scores, [entry.seed]);
      },
    );

    arms = [
      bm25,
      related,
      popularity,
      hybrid,
      pprArm("ppr-0.50", "authored dependsOn, undirected, alpha 0.50 (HippoRAG's damping)", authored, test, 0.5),
      pprArm("ppr-0.85", "authored dependsOn, undirected, alpha 0.85 (classic PageRank damping)", authored, test, 0.85),
      pprArm("ppr-dir", "authored dependsOn, DIRECTED, alpha 0.50 — is the direction load-bearing?", directed, test, 0.5),
      pprArm("ppr+coread", "authored PLUS co-read edges built from the TRAIN half only, alpha 0.50", augmented, test, 0.5),
    ];
  } finally {
    await corpus.close();
  }

  const poolSize = support.decisions.length - 1;
  const chance = CUTS.map((k) => chanceRecallAtK(k, poolSize));

  console.log(`${TAG} — the bake-off, scored on the ${test.length} TEST windows`);
  console.log(`  (chance is exact: recall@k under a uniformly random ranking of ${poolSize} candidates is k/${poolSize})`);
  renderArms(arms, chance);
  console.log("");

  // ⚠ THE SECTION THAT STOPS A ONE-POINT GAP READING AS A WINNER. The arms above sit within a
  // couple of points of each other at the wide cuts, which on ~140 cases is noise until a paired
  // interval says otherwise. Every headline sentence in the write-up must cite a row from here.
  const armByName = new Map(arms.map((arm) => [arm.name, arm]));
  const pairs: readonly (readonly [string, string, number])[] = [
    ["ppr-0.50", "related", 0],
    ["ppr-0.50", "related", 2],
    ["ppr+coread", "related", 2],
    ["ppr-hybrid", "related", 0],
    ["ppr-hybrid", "related", 2],
    ["ppr-hybrid", "ppr-0.50", 2],
    ["ppr+coread", "ppr-0.50", 2],
    ["ppr-0.50", "bm25", 0],
    ["ppr-0.50", "ppr-dir", 2],
  ];
  console.log(`${TAG} — PAIRED differences, 95% interval, on the cases BOTH arms ranked`);
  console.log(`  ${"comparison".padEnd(26)}${"cut".padEnd(6)}${"mean Δ".padStart(9)}${"95% interval".padStart(20)}   verdict`);
  for (const [leftName, rightName, cutIndex] of pairs) {
    const left = armByName.get(leftName);
    const right = armByName.get(rightName);
    if (left === undefined || right === undefined) continue;
    const aligned = alignAt(left, right, cutIndex);
    if (aligned.a.length < 2) continue;
    const paired = pairedDifference(aligned.a, aligned.b);
    const label = `${leftName} − ${rightName}`;
    const interval = `[${(paired.ci95[0] * 100).toFixed(1)}, ${(paired.ci95[1] * 100).toFixed(1)}]`;
    console.log(
      `  ${label.padEnd(26)}${`@${CUTS[cutIndex]}`.padEnd(6)}${`${(paired.meanDifference * 100).toFixed(1)}pp`.padStart(9)}${interval.padStart(20)}   ${
        paired.separates ? "SEPARATES" : "within noise"
      }`,
    );
  }
  console.log("");

  // How much of the gold an authored traversal could EVER reach — the honest analogue of MuSiQue's
  // connectedness filter. Reporting the partition beats dropping the easy cases: the share of gold
  // that is one hop away is itself a fact about whether agents walk the paths we lay for them.
  let adjacent = 0;
  let twoPlus = 0;
  let unreachable = 0;
  for (const entry of test) {
    const distances = hopDistances(authored, entry.seed, entry.gold);
    for (const target of entry.gold) {
      const distance = distances.get(target) ?? Number.POSITIVE_INFINITY;
      if (distance === 1) adjacent += 1;
      else if (Number.isFinite(distance)) twoPlus += 1;
      else unreachable += 1;
    }
  }
  const goldTotal = adjacent + twoPlus + unreachable;
  console.log(`${TAG} — where the gold SITS relative to the seed, over authored edges`);
  console.log(`  gold pairs in the test half ${goldTotal}`);
  console.log(`  one hop away                ${adjacent}   ${pct(adjacent / Math.max(1, goldTotal))}   — a walk we authored finds these trivially`);
  console.log(`  two or more hops            ${twoPlus}   ${pct(twoPlus / Math.max(1, goldTotal))}   — the population spreading is FOR`);
  console.log(`  unreachable at any distance ${unreachable}   ${pct(unreachable / Math.max(1, goldTotal))}   — no authored traversal can EVER surface these`);
}

void main();
