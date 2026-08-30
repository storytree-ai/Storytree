// KNOWLEDGE DEPTH FROM THE SURFACE, joined onto a traversal at render time
// (`traversal-panel-arc`, increment `traversal-panel-depth-from-surface`; ADR-0476, inside
// ADR-0363 D2's fence).
//
// The rule lives one floor down, in `@storytree/library`'s `evaluateSurfaceDepth` — the same pure
// judge the `probe:surface-depth` diagnostic runs, so the panel and the probe can never describe the
// same corpus differently. What is HERE is the studio's half: adapting the wire's `GuidanceAsset[]`
// onto that judge, and counting what one trace's visits came to.
//
// ## WHY THIS READING AND NOT `evaluateDepthFromWork` (ADR-0476)
//
// The panel used to render depth from the WORK ANCHOR — an artifact whose `cites` names a `story:`
// or `capability:`. 135 of 2,633 artifacts do, so 258 of 3,101 joined nodes had any reading at all
// and this chip printed `deepest 1` on essentially every real trace. That was the instrument being
// honest about a place it could see almost nothing from, not a shallow corpus: seeded from the
// graph's own surface the same corpus runs 17 levels deep.
//
// `evaluateDepthFromWork` is NOT retired — it answers a different question and the probes read it.
// The two are siblings and are never summed or collapsed.
//
// ## TWO DEPTHS SHARE THE WORD ON THIS PANEL AND THEY ARE UNRELATED QUANTITIES
//
// `lib/traversalDepth.ts` is SESSION-TRAVERSAL depth: how deep in one context walk a visit sits,
// resolved from `parentVisitId` and nothing else. THIS is KNOWLEDGE depth: how far the artifact that
// was read sits from the actual work, over the authored `dependsOn` graph. Two axes on one picture,
// never one number — collapsing them would produce a figure that means nothing in either system.
//
// ## THE FENCE (ADR-0363 D2)
//
// A READ-ONLY join at RENDER time. Story nodes do not become tier 0, the two graphs are not merged,
// nothing in the corpus records the result, and no gate enforces it. **Nothing enforces the join, so
// the two graphs CAN drift and only this panel would notice** — a depth shown here is a derived
// reading of the corpus as it stands, and the surface must never present it as a guarantee.
//
// ## THE THREE READINGS, AND WHY COLLAPSING ANY TWO IS THE BUG
//
//   • PLACED — it sits in the linked graph, `depth` hops below the nearest surface opening;
//   • UNLINKED — it is in the corpus and carries no edge in either direction. NOT "at the surface"
//     and NOT "very deep": 1,945 of 3,101 nodes are in this state, and rendering them as depth 0
//     would report "everything is at the surface", which reads as health and is the exact opposite
//     of the signal this exists to give;
//   • CYCLIC — it has edges but a loop sits above it, so no longest chain exists. Provably empty
//     today (`probe:combined-dag`); a state rather than an assertion so a regression reads as an
//     absence of measurement rather than as a depth;
//   • ABSENT — the visited id is not a graph node at all. Measured across this machine's whole trace
//     index on 2026-08-20: 96 of 402 distinct visited ids, which are story/capability ids, retired
//     artifacts and CLI tokens. A panel that filed those under "unlinked" would blame the corpus for
//     ids the corpus was never asked to hold.
//
// And a fourth state that is NOT a reading at all: UNMEASURED, when `/api/assets` has not resolved or
// failed. It renders as its own sentence and never as "0 annotated" — the same trap
// `assetsStatus`/`assetsError` exist to prevent app-wide (ADR-0240 decision 3).

import { agentManifestRefs } from '@storytree/library/agent-manifest';
import { adrNumberOfArtifactId } from '@storytree/library/decision-pointer';
import {
  decisionSupportResolver,
  type SupportOnlyDecision,
} from '@storytree/library/decision-support';
import {
  evaluateSurfaceDepth,
  surfaceDepthOf,
  type SurfaceDepthReading,
  type SurfaceDepthVerdict,
} from '@storytree/library/surface-depth';
import type { GuidanceAsset, TraversalEventEnvelope } from '../types';

/**
 * The decision half of the graph, read off the SAME `/api/assets` payload as the artifact half.
 *
 * Since ADR-0403 dec 1 a decision is an ordinary Library artifact, so `listAssets()` already serves
 * every `adr-NNNN` row with its `dependsOn` — nothing new crosses the wire for this. What was
 * missing was only that the judge was called with ONE argument, which made every decision pointer
 * bedrock and reproduced the pre-ADR-0403 sink reading exactly (`traversal-panel-arc`, increment
 * `traversal-panel-draws-the-decision-depth`).
 *
 * `SupportOnlyDecision` is the load-bearing type here, not a convenience: it does not carry
 * `supersedes`, so this cannot read it even by mistake. `supersedes` points new → old and measures
 * how many times a thing was RE-DECIDED — archaeology, not distance from the work — and summing the
 * two would produce a confident number that means nothing (ADR-0403 dec 6, ADR-0431 D6b).
 *
 * `dependsOn` is passed through EXACTLY as the wire delivered it, absent included. Defaulting an
 * absent field to `[]` would erase the distinction between "this reader cannot see the edge" and
 * "this decision has none" — the two causes of a zero that `decisionsCarryingDependsOn` exists to
 * tell apart, and which were both true at once as recently as 2026-08-23.
 */
function decisionRowsOf(assets: readonly GuidanceAsset[]): SupportOnlyDecision[] {
  const rows: SupportOnlyDecision[] = [];
  for (const asset of assets) {
    // Strict four-digit shape: an artifact whose id merely BEGINS `adr-` is not a decision, and
    // rounding it to the nearest number is the failure `adrNumberOfArtifactId` guards.
    const number = adrNumberOfArtifactId(asset.id);
    if (number === null) continue;
    rows.push(asset.dependsOn === undefined ? { number } : { number, dependsOn: asset.dependsOn });
  }
  return rows;
}

export type KnowledgeDepthModel =
  /** The corpus was read: `verdict` carries the depths AND the denominators that make them readable. */
  | { readonly status: 'measured'; readonly verdict: SurfaceDepthVerdict }
  /** The corpus was NOT read. `reason` is rendered verbatim — never smoothed into an empty result. */
  | { readonly status: 'unmeasured'; readonly reason: string };

/**
 * Build the model from whatever `/api/assets` has answered so far.
 *
 * The `assetsStatus` guard is the load-bearing part. Handed an empty `assets` while the fetch is
 * still in flight, the judge would honestly report "1,612 artifacts unreachable → 0" over a corpus of
 * nothing, and the panel would render a real-looking verdict about a corpus it never saw.
 */
export function buildKnowledgeDepth(input: {
  readonly assets: readonly GuidanceAsset[];
  readonly assetsStatus: 'loading' | 'ready' | 'error';
  readonly assetsError: string;
}): KnowledgeDepthModel {
  if (input.assetsStatus === 'loading') {
    return { status: 'unmeasured', reason: 'the Library corpus has not been read yet' };
  }
  if (input.assetsStatus === 'error') {
    return {
      status: 'unmeasured',
      reason: `the Library corpus could not be read — ${input.assetsError || 'no reason given'}`,
    };
  }
  return {
    status: 'measured',
    verdict: evaluateSurfaceDepth(
      input.assets.map((asset) => ({
        id: asset.id,
        dependsOn: asset.dependsOn ?? [],
        cites: asset.cites ?? [],
        // THE AGENT MANIFEST (ADR-0481 D1) — the `context` / `rules` / `antiPatterns` / `stepRefs`
        // an agent injects into its own system prompt on every run. The whole asset is handed over,
        // not `asset.fields`, because the reader has to find them on EITHER shape: they sit at the
        // raw row's top level and under `fields` on this wire, and reading only one side is what
        // returned a plausible zero before this landed. See `agent-manifest.ts`'s header.
        manifest: agentManifestRefs(asset),
        // The kind the record-tier denominator splits on (ADR-0476 D3). `category` is the wire's
        // name for it and is present on every row.
        kind: asset.category,
      })),
      // THE SECOND ARGUMENT IS LOAD-BEARING TWICE OVER. Without it every `doc:` decision pointer is
      // bedrock — half the corpus's dependency pointers terminate at a decision — AND the decision
      // twins never collapse, so every ADR would read as its own surface at depth 0.
      decisionSupportResolver(decisionRowsOf(input.assets)),
    ),
  };
}

/** What one visited node's depth reading came to, ready for a hover label and a test hook. */
export interface MarkKnowledgeDepth {
  readonly state: SurfaceDepthReading['state'];
  /** The hop count, and `null` for every non-placed state — never a stand-in large number. */
  readonly depth: number | null;
  /** The `data-knowledge-depth` value: a number, or the state's own word. Never blank. */
  readonly attr: string;
  /** The hover sentence, appended to the mark's identity label. */
  readonly label: string;
}

/**
 * The reading for one visited node id, or `null` when the corpus was not read.
 *
 * `null` rather than a fabricated "unknown" reading: a caller that has nothing to say must render
 * nothing, not a claim about an artifact it never looked up.
 */
export function markKnowledgeDepth(
  model: KnowledgeDepthModel,
  nodeId: string | null,
): MarkKnowledgeDepth | null {
  if (model.status !== 'measured' || nodeId === null) return null;
  const reading = surfaceDepthOf(model.verdict, nodeId);
  if (reading.state === 'placed') {
    return {
      state: 'placed',
      depth: reading.depth,
      attr: String(reading.depth),
      label:
        reading.depth === 0
          ? 'knowledge depth 0 — this artifact sits at the surface, nothing points at it'
          : `knowledge depth ${reading.depth} — ${reading.depth} hop${
              reading.depth === 1 ? '' : 's'
            } below the surface`,
    };
  }
  if (reading.state === 'unlinked') {
    return {
      state: 'unlinked',
      depth: null,
      attr: 'unlinked',
      // Deliberately not a 0 and not "very deep": it carries no edge in either direction, which is
      // an absence of measurement rather than a measurement of distance.
      label: 'knowledge depth unmeasured — nothing links to this artifact and it links to nothing',
    };
  }
  if (reading.state === 'cyclic') {
    return {
      state: 'cyclic',
      depth: null,
      attr: 'cyclic',
      label: 'knowledge depth unmeasured — a dependency cycle sits above this artifact',
    };
  }
  return {
    state: 'absent',
    depth: null,
    attr: 'absent',
    label: 'not a Library artifact — no knowledge depth',
  };
}

/** What one trace's reads came to, per DISTINCT artifact — the denominators the note prints. */
export interface KnowledgeDepthReport {
  /** Distinct node ids this trace read. The denominator every other count sits over. */
  readonly visited: number;
  readonly placed: number;
  readonly unlinked: number;
  readonly cyclic: number;
  readonly absent: number;
  /** The deepest READ artifact — `null` when nothing was placed, never a 0 that reads as shallow. */
  readonly maxDepth: number | null;
  /** The placed distribution, ascending. Empty iff `placed` is 0. */
  readonly buckets: readonly { readonly depth: number; readonly count: number }[];
}

/**
 * Count what a trace's visits came to. `null` when the corpus was not read — see the header.
 *
 * DISTINCT artifacts, not visit events: a session that reads `merge-ceremony` nine times has read one
 * artifact at one depth, and counting the reads instead would let a single hot artifact dominate the
 * distribution and say something about attention rather than about depth.
 */
export function reportKnowledgeDepth(
  events: readonly TraversalEventEnvelope[],
  model: KnowledgeDepthModel,
): KnowledgeDepthReport | null {
  if (model.status !== 'measured') return null;

  const nodeIds = new Set<string>();
  for (const event of events) {
    if (event.kind === 'front_matter_read' || event.kind === 'full_payload_read') {
      nodeIds.add(event.nodeId);
    }
  }

  let placed = 0;
  let unlinked = 0;
  let cyclic = 0;
  let absent = 0;
  let maxDepth: number | null = null;
  const counts = new Map<number, number>();

  for (const nodeId of nodeIds) {
    const reading = surfaceDepthOf(model.verdict, nodeId);
    if (reading.state === 'placed') {
      placed += 1;
      counts.set(reading.depth, (counts.get(reading.depth) ?? 0) + 1);
      if (maxDepth === null || reading.depth > maxDepth) maxDepth = reading.depth;
    } else if (reading.state === 'unlinked') {
      unlinked += 1;
    } else if (reading.state === 'cyclic') {
      cyclic += 1;
    } else {
      absent += 1;
    }
  }

  return {
    visited: nodeIds.size,
    placed,
    unlinked,
    cyclic,
    absent,
    maxDepth,
    buckets: [...counts.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([depth, count]) => ({ depth, count })),
  };
}

/**
 * The corpus-wide linkage line — how much of the KNOWLEDGE corpus sits in the graph at all.
 *
 * It is printed beside every per-trace count on purpose. A trace placing 3 of its 306 reads is not
 * evidence about that session, it is a fact about the corpus's wiring, and without this line a reader
 * draws the wrong conclusion from the right number.
 *
 * ⚠ THE DENOMINATOR IS THE KNOWLEDGE TIERS ONLY (ADR-0476 D3). The figure this replaced —
 * `135/2623 anchored` — divided by 1,880 record rows (increments, friction, arcs, open questions,
 * templates) that were never candidates for an edge, which stated a fact about our record-keeping as
 * though it were a fact about our knowledge. `recordScanned` travels in the hover so the exclusion is
 * visible rather than silently applied.
 *
 * WARNING: THE EDGE SET WIDENED ON 2026-08-30 (ADR-0481 D1), so this figure is NOT comparable to an
 * older screenshot of it. The walk now also reads the AGENT MANIFEST — the `context` / `rules` /
 * `antiPatterns` / `stepRefs` an agent injects into its own system prompt on every run — which
 * un-orphaned ten artifacts, five of them the anti-slop guardrails. Measured in one corpus read:
 * `682 of 744` becomes `692 of 744`, with only the edge source differing. The WORDING is unchanged
 * because the sentence was already true of whatever edges the graph holds; the NUMBER moved.
 */
export function linkageSummary(model: KnowledgeDepthModel): string | null {
  if (model.status !== 'measured') return null;
  const { knowledgeLinked, knowledgeScanned, recordScanned, surfaces, surfaceDecisions, unlinked } =
    model.verdict;
  const pick = (count: number, one: string, many: string): string => (count === 1 ? one : many);
  return (
    `${knowledgeLinked} of ${knowledgeScanned} knowledge ` +
    `${pick(knowledgeScanned, 'artifact sits', 'artifacts sit')} in the dependency graph; ` +
    `${surfaces} ${pick(surfaces, 'surface opens', 'surfaces open')} a chain ` +
    `(${surfaceDecisions} of them decisions); ` +
    `${unlinked} ${pick(unlinked, 'node carries', 'nodes carry')} no edge either way and ` +
    `${pick(unlinked, 'has', 'have')} no depth at all. ` +
    `${recordScanned} record ${pick(recordScanned, 'row', 'rows')} ` +
    `(increments, friction, arcs, questions, templates) ` +
    `${pick(recordScanned, 'is', 'are')} excluded from that denominator.`
  );
}
