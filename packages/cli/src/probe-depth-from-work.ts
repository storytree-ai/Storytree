/**
 * `pnpm probe:depth-from-work` — the RAW-vs-RENDERED probe for ADR-0363 D2's depth-from-work join.
 *
 * **A DIAGNOSTIC, NOT A GATE RUNG, and deliberately so.** ADR-0363 D2's fence says the join is
 * read-only at render time: nothing in the corpus records the result and NO GATE ENFORCES IT. This is
 * not wired into `pnpm gate` and never should be. It exists to be run by hand after a change to the
 * join, the wire, or the `dependsOn` / `cites` fields — which is the one instruction the increment
 * that built this leaves behind.
 *
 * ## THE TRAP IT EXISTS FOR
 *
 * A gate rung reading RAW stored rows and a UI reading the RENDERED wire can BOTH report honestly and
 * still disagree, with nothing to tell you: `check:library-dag-acyclic` once counted 660 `dependsOn`
 * edges where the studio would have drawn 554. Only a probe measuring both IN THE SAME RUN and
 * diffing them surfaces that. So this reads each stored doc twice — straight off the payload the way
 * `dependsOnNodes` does, and through `renderStoredDoc` the way `toGuidanceAsset` does for the browser —
 * and reports any doc where the two disagree.
 *
 * ## AND THE ANCHOR, WHICH IS HALF THE ANSWER
 *
 * It then runs the same `evaluateDepthFromWork` the studio panel runs and prints its denominators. An
 * artifact UNREACHABLE from any work anchor is not the same as one that is VERY DEEP, so "nothing was
 * deep" and "nothing was measured" must never print the same way — see `@storytree/library`'s
 * `knowledge-depth.ts`, which is where every rule lives. This file reads, prints, and decides nothing.
 *
 * Exit 0 when the two views agree; 1 when they disagree or the corpus could not be read. A
 * disagreement is a real defect in the wire, not a judgment about the corpus's shape — a thin anchor
 * is reported and is never a failure.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAdrMetas, openCorpusStore } from "@storytree/drive";
import {
  decisionAmendsResolver,
  decisionWalkVacuity,
  depthFromWorkNodes,
  evaluateDepthFromWork,
  readDependsOnPointers,
  REPO_ROOT_ENV,
  renderCombinedNodeId,
  resolveRepoRoot,
} from "@storytree/library";
import { renderStoredDoc } from "@storytree/library/store";

const TAG = "probe:depth-from-work";

/** The repo root — a PARAMETER (ADR-0246), not a derivation from this file's own location. */
const repoRoot = resolveRepoRoot({
  env: process.env[REPO_ROOT_ENV],
  derived: path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", ".."),
}).root;

/**
 * Where the decision half comes from TODAY. It is read here rather than inside the walk precisely
 * because ADR-0403 dec 3 made edge resolution a seam: the walk takes a `DecisionAmendsResolver` and
 * never learns that this one was built from files, so `decision-log-home-arc`'s migration replaces
 * these two lines and nothing else.
 */
const DECISIONS_DIR = path.join(repoRoot, "docs", "decisions");

/** The two pointer fields, per doc, as one comparable string. */
function signature(dependsOn: readonly string[], cites: readonly string[]): string {
  return JSON.stringify({ dependsOn, cites });
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

async function main(): Promise<void> {
  const corpus = await openCorpusStore(TAG);
  try {
    // ONE bulk read for a whole-corpus question — the shape ADR-0345 measured as ~10x cheaper than
    // repeated `getDoc`s, and the same read `check:library-dag-acyclic` makes.
    const docs = await corpus.store.queryDocs();

    const rawRows = docs.map((stored) => {
      const payload = stored.doc as { cites?: unknown } | null | undefined;
      return {
        id: stored.id,
        // ADR-0402 read tolerance, TEMPORARY — remove after the batch drain (depends-on-compat.ts).
        // THE TOLERANCE BELONGS ON BOTH SIDES, and that does not make them agree by construction:
        // each side exists to MIRROR a real reader — this one `dependsOnNodes` (the gate rung), the
        // other `renderStoredDoc` (the browser wire) — and both of those are now tolerant. Making
        // only this side tolerant would report ~778 disagreements that are real but say nothing
        // about the wire; making neither tolerant is what let both sides agree, at zero, on a lie.
        doc: { dependsOn: readDependsOnPointers(stored.doc), cites: strings(payload?.cites) },
      };
    });

    const renderedRows = docs.map((stored) => {
      const rendered = renderStoredDoc(stored) as {
        dependsOn?: unknown;
        cites?: unknown;
        degraded?: unknown;
      };
      return {
        id: stored.id,
        degraded: typeof rendered.degraded === "string",
        doc: { dependsOn: strings(rendered.dependsOn), cites: strings(rendered.cites) },
      };
    });

    const disagreements: string[] = [];
    for (let index = 0; index < rawRows.length; index += 1) {
      const raw = rawRows[index]!;
      const rendered = renderedRows[index]!;
      if (signature(raw.doc.dependsOn, raw.doc.cites) === signature(rendered.doc.dependsOn, rendered.doc.cites)) {
        continue;
      }
      disagreements.push(
        `  ${raw.id}: raw dependsOn=${raw.doc.dependsOn.length}/cites=${raw.doc.cites.length} ` +
          `vs rendered dependsOn=${rendered.doc.dependsOn.length}/cites=${rendered.doc.cites.length}` +
          (rendered.degraded ? " (rendered DEGRADED)" : ""),
      );
    }

    const rawVerdict = evaluateDepthFromWork(depthFromWorkNodes(rawRows));
    const renderedVerdict = evaluateDepthFromWork(depthFromWorkNodes(renderedRows));
    const degraded = renderedRows.filter((row) => row.degraded).length;

    console.log(`${TAG} — ${docs.length} stored artifacts, read RAW and RENDERED in one run.`);
    console.log(
      `  RAW      ${rawVerdict.edgesScanned} walkable edges, ${rawVerdict.bedrockTargets} doc: bedrock, ` +
        `${rawVerdict.danglingTargets} dangling, ${rawVerdict.anchors} anchors`,
    );
    console.log(
      `  RENDERED ${renderedVerdict.edgesScanned} walkable edges, ${renderedVerdict.bedrockTargets} doc: bedrock, ` +
        `${renderedVerdict.danglingTargets} dangling, ${renderedVerdict.anchors} anchors ` +
        `(${degraded} degraded row${degraded === 1 ? "" : "s"})`,
    );

    // The panel reads the RENDERED wire, so the depth denominators are reported from that view.
    const { anchors, anchorEdges, artifactsScanned, reached, unreachable, maxDepth, histogram } =
      renderedVerdict;
    console.log("");
    console.log(`  depth from the work, as the studio would draw it:`);
    console.log(
      `    anchors: ${anchors} of ${artifactsScanned} artifacts name a story/capability ` +
        `(${anchorEdges} asset: pointer${anchorEdges === 1 ? "" : "s"} out of the seed)`,
    );
    // Both denominators, always: an unreachable artifact was NOT measured, and reporting only the
    // reached count would let a nearly-blind instrument read as a healthy shallow corpus.
    console.log(`    reached: ${reached}   unreachable: ${unreachable}   deepest: ${maxDepth}`);
    console.log(
      `    distribution: ${
        histogram.length === 0
          ? "(nothing reached)"
          : histogram.map((bucket) => `${bucket.count}@${bucket.depth}`).join("  ")
      }`,
    );

    // ---------------------------------------------------------------------------------------
    // THE DECISION-AWARE READING (ADR-0403 dec 4, `adrs-into-the-dag-arc-inc-09`)
    // ---------------------------------------------------------------------------------------
    // The same walk over the same RENDERED rows, this time handed a resolver, so it continues past
    // a decision on `amends` alone. Printed BESIDE the sink reading rather than replacing it: the
    // studio panel still takes the resolver-less path (`traversal-panel-arc` is parked and its owner
    // LOOK is fenced), so a reader must be able to see both numbers and which one the panel draws.
    const { adrs, parseErrors } = loadAdrMetas(DECISIONS_DIR);
    if (parseErrors.length > 0) {
      // Fail-closed: a depth over a decision log that did not fully parse is a depth over an unknown
      // population, and a confident number there is worse than no number.
      console.error("");
      console.error(`${TAG} — ${parseErrors.length} decision file(s) failed to parse:`);
      for (const line of parseErrors) console.error(`  ${line}`);
      process.exitCode = 1;
      return;
    }
    // `adrs` carries `supersedes` too; `decisionAmendsResolver`'s PARAMETER TYPE is what drops it,
    // so there is no filtering to forget here (ADR-0403 dec 6).
    const withDecisions = evaluateDepthFromWork(
      depthFromWorkNodes(renderedRows),
      decisionAmendsResolver(adrs),
    );

    console.log("");
    console.log(`  and the same walk continued PAST a decision, on \`amends\` only:`);
    console.log(
      `    decisions: ${withDecisions.decisionsScanned} read, ${withDecisions.amendsEdges} ` +
        `\`amends\` edges resolving (${withDecisions.decisionDanglingTargets} dangling) — ` +
        `\`supersedes\` is NOT walked and is never summed with this (ADR-0403 dec 6)`,
    );
    console.log(
      `    the join: ${withDecisions.decisionEdges} \`doc:\` pointer(s) walked through onto a ` +
        `decision, where the sink rule stopped at ${renderedVerdict.bedrockTargets}`,
    );
    console.log(
      `    reached: ${withDecisions.reached} artifact(s) + ${withDecisions.decisionsReached} ` +
        `decision(s)   unreachable artifacts: ${withDecisions.unreachable}`,
    );
    console.log(
      `    THE ONE NUMBER (ADR-0403 dec 4): ${withDecisions.maxDepth}` +
        (withDecisions.deepestId === null
          ? ""
          : `   witness: ${renderCombinedNodeId(withDecisions.deepestId)}`),
    );
    console.log(
      `      artifact-only deepest, unchanged: ${withDecisions.maxArtifactDepth} ` +
        `(the pre-ADR-0403 sink reading, and the one the studio panel still draws)`,
    );
    console.log(
      `      decisions by depth: ${
        withDecisions.decisionHistogram.length === 0
          ? "(none reached)"
          : withDecisions.decisionHistogram.map((bucket) => `${bucket.count}@${bucket.depth}`).join("  ")
      }`,
    );
    // ⚠ THE SAMPLE, NOT THE POPULATION — the same caveat `probe:adr-graph` prints, for the same
    // reason. The anchor is 67 of 1,734 artifacts, so most decision pointers hang off something the
    // walk cannot reach at all and cannot move a ceiling. A bare number gets quoted as a settled one.
    console.log(
      `      ⚠ a FLOOR, not a settled ceiling: only pointers whose artifact is reachable from the ` +
        `work at all can move it, and the anchor is ${renderedVerdict.anchors} of ` +
        `${renderedVerdict.artifactsScanned} artifacts. Widen the anchor and this rises. A thin ` +
        `reading is a fact about our WIRING, never a clean bill of health.`,
    );
    // TWO MEASURES, TWO NAMES — the house rule this arc applies to `amends` vs `supersedes`, applied
    // again one level up. `probe:adr-graph`'s Candidate A projected "2 -> 10"; that is a LONGEST-PATH
    // arithmetic (`libraryDepth + 1 + the decision's longest amends chain`), while depth-from-work is
    // SHORTEST-PATH by construction — ADR-0363's own rule is that "an artifact reachable by several
    // chains takes the SHORTEST … the long way round is not the distance". The gap is not a defect in
    // either: 390 pointers land on 145 distinct decisions, so a decision sitting deep in one ladder is
    // usually ALSO pointed at directly by a shallower artifact, and the long chain collapses.
    // Shortest-path is the right semantic HERE, because the question this instrument answers is "how
    // far from the work did the agent have to reach", and a decision cited straight off a near-work
    // artifact is near the work however deep its own ladder runs.
    console.log(
      `      ⚠ NOT the same measure as \`probe:adr-graph\`'s Candidate A projection of 10: that is a ` +
        `LONGEST-path arithmetic, this is SHORTEST-path (ADR-0363 — "the long way round is not the ` +
        `distance"). Never quote one figure as the other.`,
    );

    const vacuity = decisionWalkVacuity(withDecisions);
    if (vacuity.length > 0) {
      // UNVERIFIED — a walk that resolved no crossing pointer returns the sink number wearing a new
      // name, which reads as "the ceiling did not move" rather than as "the join was invisible".
      console.error("");
      console.error(`${TAG} UNVERIFIED — the decision-aware reading measured nothing:`);
      for (const reason of vacuity) console.error(`  · ${reason}`);
      process.exitCode = 1;
      return;
    }

    if (disagreements.length > 0) {
      console.error("");
      console.error(
        `${TAG} FAIL — ${disagreements.length} artifact(s) whose RAW rows and RENDERED wire disagree ` +
          `on dependsOn/cites. A rung reading one and a surface reading the other would both report ` +
          `honestly and still describe different graphs:`,
      );
      for (const line of disagreements) console.error(line);
      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log(`${TAG} PASS — the raw rows and the rendered wire agree on every artifact's pointers.`);
  } finally {
    await corpus.close();
  }
}

main().catch((err: unknown) => {
  // Fail-closed for `check:library-dag-acyclic`'s reason: a fidelity claim made against a corpus
  // nobody read is not a passing one.
  console.error(`${TAG} — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
