// WHAT ADMITTING THE AGENT MANIFEST DID TO BOTH READINGS (ADR-0481 D1), measured in ONE corpus read.
//
// A one-shot verifier, deliberately NOT a `check:` or `probe:` rung — the sibling of
// `verify-panel-decision-depth.ts` and kept for the same reason: the claim in ADR-0481 is a
// BEFORE/AFTER, and a claim like that has to stay re-derivable by whoever doubts it.
//
// ## WHY IT IS ONE READ AND NOT TWO PROBE RUNS
//
// The corpus is live and several sessions write to it. Running `probe:surface-depth` at HEAD~1 and
// again at HEAD compares two different corpora and attributes the difference to the code: measured
// on 2026-08-30, five rows and one decision landed between two runs taken minutes apart, which is
// already larger than several of the deltas below. So this evaluates the SAME node set twice —
// once with each node's manifest, once with every manifest emptied — and the only thing that differs
// between the two arms is the edge source under test.
//
// Run it:
//   pnpm -C packages/cli exec node --import ../../scripts/tsx-cache-off.mjs --import tsx \
//     src/verify-manifest-edge-effect.ts

import { openCorpusStore } from "@storytree/drive";
import { renderStoredDoc } from "@storytree/library/store";
import { agentManifestRefs } from "@storytree/library/agent-manifest";
import { decisionSupportResolver, evaluateDepthFromWork, type DepthFromWorkNode } from "@storytree/library";
import { adrNumberOfArtifactId } from "@storytree/library/decision-pointer";
import {
  evaluateSurfaceDepth,
  kindOfDoc,
  surfaceDepthOf,
  type SurfaceDepthNode,
} from "@storytree/library/surface-depth";

const TAG = "verify:manifest-edge-effect";

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

/** The same nodes with every manifest emptied — the CONTROL arm, i.e. the pre-ADR-0481 reader. */
function withoutManifest(nodes: readonly SurfaceDepthNode[]): SurfaceDepthNode[] {
  return nodes.map((node) => ({ ...node, manifest: [] }));
}

function pct(part: number, whole: number): string {
  return whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const corpus = await openCorpusStore(TAG);
  try {
    const docs = await corpus.store.queryDocs();

    // The WIRE, because that is what the studio panel is handed. Both arms read it identically.
    const nodes: SurfaceDepthNode[] = docs.map((stored) => {
      const rendered = renderStoredDoc(stored) as { dependsOn?: unknown; cites?: unknown };
      return {
        id: stored.id,
        dependsOn: strings(rendered.dependsOn),
        cites: strings(rendered.cites),
        manifest: agentManifestRefs(rendered),
        kind: kindOfDoc(stored.doc),
      };
    });
    const control = withoutManifest(nodes);

    const decisionsOf = (rows: readonly DepthFromWorkNode[]) =>
      decisionSupportResolver(
        rows.flatMap((node) => {
          const number = adrNumberOfArtifactId(node.id);
          return number === null ? [] : [{ number, dependsOn: [...node.dependsOn] }];
        }),
      );

    const surfaceBefore = evaluateSurfaceDepth(control, decisionsOf(control));
    const surfaceAfter = evaluateSurfaceDepth(nodes, decisionsOf(nodes));
    const workBefore = evaluateDepthFromWork(control, decisionsOf(control));
    const workAfter = evaluateDepthFromWork(nodes, decisionsOf(nodes));

    console.log(`${TAG} — ${docs.length} rows, ONE read, both arms evaluated over the same nodes.`);
    console.log("");
    console.log(`  MANIFEST EDGES RESOLVED: ${surfaceAfter.manifestEdges} ` +
      `(${workAfter.manifestDanglingTargets} pointer(s) naming no artifact)`);
    console.log("");

    console.log("  THE SURFACE READING (ADR-0476) — what the panel prints");
    const rows: [string, number, number][] = [
      ["edges walked", surfaceBefore.edgesScanned, surfaceAfter.edgesScanned],
      ["surfaces", surfaceBefore.surfaces, surfaceAfter.surfaces],
      ["placed", surfaceBefore.placed, surfaceAfter.placed],
      ["unlinked", surfaceBefore.unlinked, surfaceAfter.unlinked],
      ["cyclic", surfaceBefore.cyclicNodes, surfaceAfter.cyclicNodes],
      ["max depth", surfaceBefore.maxDepth, surfaceAfter.maxDepth],
      ["knowledge linked", surfaceBefore.knowledgeLinked, surfaceAfter.knowledgeLinked],
      ["knowledge scanned", surfaceBefore.knowledgeScanned, surfaceAfter.knowledgeScanned],
    ];
    for (const [label, before, after] of rows) {
      const delta = after - before;
      console.log(
        `    ${label.padEnd(20)} ${String(before).padStart(6)} → ${String(after).padStart(6)}  ` +
          `${delta === 0 ? "unchanged" : (delta > 0 ? `+${delta}` : String(delta))}`,
      );
    }
    console.log(
      `    the printed denominator: ${surfaceBefore.knowledgeLinked}/${surfaceBefore.knowledgeScanned} ` +
        `(${pct(surfaceBefore.knowledgeLinked, surfaceBefore.knowledgeScanned)}) → ` +
        `${surfaceAfter.knowledgeLinked}/${surfaceAfter.knowledgeScanned} ` +
        `(${pct(surfaceAfter.knowledgeLinked, surfaceAfter.knowledgeScanned)})`,
    );
    console.log("");

    console.log("  THE DEPTH-FROM-WORK READING (ADR-0363 D2) — the figure `probe:depth-from-work` publishes");
    const workRows: [string, number, number][] = [
      ["edges walked", workBefore.edgesScanned, workAfter.edgesScanned],
      ["anchors (the seed)", workBefore.anchors, workAfter.anchors],
      ["artifacts reached", workBefore.reached, workAfter.reached],
      ["decisions reached", workBefore.decisionsReached, workAfter.decisionsReached],
      ["THE ONE NUMBER", workBefore.maxDepth, workAfter.maxDepth],
      ["artifact-only deepest", workBefore.maxArtifactDepth, workAfter.maxArtifactDepth],
    ];
    for (const [label, before, after] of workRows) {
      const delta = after - before;
      console.log(
        `    ${label.padEnd(20)} ${String(before).padStart(6)} → ${String(after).padStart(6)}  ` +
          `${delta === 0 ? "unchanged" : (delta > 0 ? `+${delta}` : String(delta))}`,
      );
    }
    console.log("");

    // THE TEN THE INCREMENT NAMED. Reported by NAME rather than by count, because "10 fewer
    // unlinked" is satisfiable by any ten rows and this claim is about these ten specifically.
    const named = [
      "never-chain-type-assertions",
      "never-widen-a-value-you-already-know",
      "never-mock-a-module-name-the-seam",
      "never-hide-omission-in-an-empty-spread",
      "five-typescript-constructs-this-house-never-writes",
      "register-follows-audience",
      "machine-in-the-loop-is-the-default-human-is-the-exception",
    ];
    console.log("  THE ARTIFACTS THE INCREMENT NAMED — by name, not by count");
    for (const id of named) {
      const before = surfaceDepthOf(surfaceBefore, id);
      const after = surfaceDepthOf(surfaceAfter, id);
      const render = (r: { state: string; depth?: number }): string =>
        r.state === "placed" ? `placed@${String(r.depth)}` : r.state;
      console.log(`    ${id.padEnd(58)} ${render(before).padEnd(12)} → ${render(after)}`);
    }

    // Every artifact whose reading MOVED, so nothing hides behind the named seven.
    const moved: string[] = [];
    for (const node of nodes) {
      const before = surfaceDepthOf(surfaceBefore, node.id);
      const after = surfaceDepthOf(surfaceAfter, node.id);
      if (before.state !== after.state) moved.push(`${node.id} (${before.state} → ${after.state})`);
    }
    console.log("");
    console.log(`  EVERY ARTIFACT WHOSE STATE MOVED (${moved.length}):`);
    for (const line of moved) console.log(`    ${line}`);
  } finally {
    await corpus.close();
  }
}

void main();
