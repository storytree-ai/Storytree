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

import { openCorpusStore } from "@storytree/drive";
import { depthFromWorkNodes, evaluateDepthFromWork, readDependsOnPointers } from "@storytree/library";
import { renderStoredDoc } from "@storytree/library/store";

const TAG = "probe:depth-from-work";

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
      const rendered = renderStoredDoc(stored) as unknown as {
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
