/**
 * `pnpm probe:surface-depth` — what the traversal panel's depth chip reads over the LIVE corpus
 * (ADR-0476, `traversal-panel-arc` increment `traversal-panel-depth-from-surface`).
 *
 * **A PROBE, NOT A GATE RUNG**, for `probe:depth-from-work`'s reason exactly: ADR-0363 D2 fences this
 * join as a read-only render-time projection that no gate enforces, and a `check:` name would also be
 * picked up by the gate plan's unplanned-check guard.
 *
 * ## WHY IT EXISTS AT ALL
 *
 * So that nobody quotes a figure out of a session transcript. Every number ADR-0476 states — 701
 * surfaces, 17 levels, 1,945 unlinked, the record-tier split — is re-derivable here in one command,
 * against the corpus as it stands today rather than as it stood when the decision was written.
 *
 * ## IT READS THE WIRE, NOT THE RAW ROW
 *
 * The panel reads `renderStoredDoc` output, so this must too, or the probe and the surface it exists
 * to describe can disagree while both report honestly — the measured failure behind
 * `probe:depth-from-work` (660 authored edges raw vs 554 rendered, gate green throughout).
 *
 * ## EXIT CODES
 *
 * 0 when the reading was taken; 1 when it could not be (no store) or when the walk reports a VACUITY
 * reason — a blind reader returns "the corpus is flat", which is a plausible finding rather than an
 * obvious error, so it must exit non-zero rather than print.
 */

import { renderStoredDoc } from "@storytree/library/store";
import { agentManifestRefs } from "@storytree/library/agent-manifest";
import {
  evaluateSurfaceDepth,
  surfaceDepthOf,
  surfaceWalkVacuity,
  RECORD_KINDS,
} from "@storytree/library/surface-depth";
import { decisionSupportResolver } from "@storytree/library/decision-support";
import { adrNumberOfArtifactId } from "@storytree/library/decision-pointer";
import { openCorpusStore } from "@storytree/drive";

const TAG = "probe:surface-depth";

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

function kindOf(doc: unknown): string {
  const payload = doc as { kind?: unknown; category?: unknown } | null | undefined;
  const kind = payload?.kind ?? payload?.category;
  return typeof kind === "string" ? kind : "";
}

async function main(): Promise<void> {
  const corpus = await openCorpusStore(TAG);
  try {
    const docs = await corpus.store.queryDocs();
    const nodes = docs.map((stored) => {
      const rendered = renderStoredDoc(stored) as { dependsOn?: unknown; cites?: unknown };
      return {
        id: stored.id,
        dependsOn: strings(rendered.dependsOn),
        cites: strings(rendered.cites),
        // READ OFF THE RENDERED WIRE, deliberately — this probe exists to mirror what the studio
        // panel sees, and the panel is handed `renderStoredDoc` output. Reading `stored.doc` here
        // would make the probe agree with itself and disagree with the surface it reports on.
        manifest: agentManifestRefs(rendered),
        kind: kindOf(stored.doc),
      };
    });

    const decisions = nodes.flatMap((node) => {
      const number = adrNumberOfArtifactId(node.id);
      return number === null ? [] : [{ number, dependsOn: node.dependsOn }];
    });

    const verdict = evaluateSurfaceDepth(nodes, decisionSupportResolver(decisions));

    console.log(`${TAG} — ${docs.length} rows on the wire, ${decisions.length} of them decisions.`);
    console.log("");
    console.log("  THE GRAPH");
    console.log(
      `    ${verdict.nodesScanned} nodes (${verdict.artifactsScanned} artifacts + ` +
        `${verdict.decisionsScanned} decisions, counted ONCE each), ${verdict.edgesScanned} edges`,
    );
    console.log(
      `    of those, ${verdict.manifestEdges} come from an AGENT MANIFEST — the ` +
        `context/rules/antiPatterns/stepRefs an agent injects on every run (ADR-0481 D1)`,
    );
    console.log(
      `    ${verdict.surfaces} surfaces (${verdict.surfaceDecisions} of them decisions) · ` +
        `${verdict.placed} placed · ${verdict.unlinked} unlinked · ${verdict.cyclicNodes} cyclic`,
    );
    console.log(`    deepest ${verdict.maxDepth}${verdict.deepestId === null ? "" : ` — ${verdict.deepestId}`}`);
    console.log("");
    console.log("  THE DENOMINATOR THE PANEL PRINTS (ADR-0476 D3)");
    console.log(
      `    knowledge tiers : ${verdict.knowledgeLinked} of ${verdict.knowledgeScanned} linked`,
    );
    console.log(
      `    record tiers    : ${verdict.recordLinked} of ${verdict.recordScanned} linked — EXCLUDED ` +
        `(${[...RECORD_KINDS].join(", ")})`,
    );
    console.log("");
    console.log("  DEPTH DISTRIBUTION (placed nodes, longest chain from a surface)");
    for (const bucket of verdict.histogram) {
      console.log(`    ${String(bucket.depth).padStart(3)}  ${"█".repeat(Math.min(60, bucket.count))} ${bucket.count}`);
    }
    console.log("");
    console.log("  UNLINKED BY KIND — the population no seeding can give a depth");
    const unlinkedByKind = new Map<string, number>();
    const totalByKind = new Map<string, number>();
    for (const node of nodes) {
      // A decision twin is collapsed away, so ask about the id the panel would be handed.
      const kind = node.kind === "" ? "(unknown)" : node.kind;
      totalByKind.set(kind, (totalByKind.get(kind) ?? 0) + 1);
      if (surfaceDepthOf(verdict, node.id).state === "unlinked") {
        unlinkedByKind.set(kind, (unlinkedByKind.get(kind) ?? 0) + 1);
      }
    }
    for (const [kind, count] of [...unlinkedByKind.entries()].sort((a, b) => b[1] - a[1])) {
      const total = totalByKind.get(kind) ?? 0;
      const share = total === 0 ? 0 : Math.round((count / total) * 100);
      const tier = RECORD_KINDS.has(kind) ? "record " : "";
      console.log(`    ${String(count).padStart(5)}/${String(total).padEnd(5)} ${String(share).padStart(3)}%  ${tier}${kind}`);
    }

    const vacuity = surfaceWalkVacuity(verdict);
    if (vacuity.length > 0) {
      console.error("");
      console.error(`${TAG} UNVERIFIED — the reading measured nothing it could be trusted on:`);
      for (const reason of vacuity) console.error(`  · ${reason}`);
      process.exitCode = 1;
      return;
    }

    console.log("");
    console.log(`${TAG} PASS — the walk saw its subject.`);
  } finally {
    await corpus.close();
  }
}

main().catch((err: unknown) => {
  // Fail-closed: a claim about a corpus nobody read is not a passing one.
  console.error(`${TAG} — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
