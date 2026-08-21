// KNOWLEDGE DEPTH FROM THE WORK, joined onto a traversal at render time
// (`traversal-panel-arc`, increment `standson-depth-from-work-join`; ADR-0363 D2).
//
// The rule lives one floor down, in `@storytree/library`'s `evaluateDepthFromWork` — the same pure
// judge the `probe:depth-from-work` diagnostic runs, so the panel and the probe can never describe
// the same corpus differently. What is HERE is the studio's half: adapting the wire's
// `GuidanceAsset[]` onto that judge, and counting what one trace's visits came to.
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
//   • REACHED — a chain of authored edges connects it to a work anchor, `depth` hops long;
//   • UNREACHABLE — it is in the corpus, and no chain does. NOT "very deep": rendering an unmeasured
//     artifact as a deep one reports the exact opposite of the health signal this exists to give;
//   • ABSENT — the visited id is not a Library artifact at all. Measured across this machine's whole
//     trace index on 2026-08-20: 96 of 402 distinct visited ids, which are story/capability ids,
//     retired artifacts and CLI tokens. A panel that filed those under "unreachable" would blame the
//     corpus for ids the corpus was never asked to hold.
//
// And a fourth state that is NOT a reading at all: UNMEASURED, when `/api/assets` has not resolved or
// failed. It renders as its own sentence and never as "0 annotated" — the same trap
// `assetsStatus`/`assetsError` exist to prevent app-wide (ADR-0240 decision 3).

import {
  depthFromWorkOf,
  evaluateDepthFromWork,
  type DepthFromWorkReading,
  type DepthFromWorkVerdict,
} from '@storytree/library/knowledge-depth';
import type { GuidanceAsset, TraversalEventEnvelope } from '../types';

export type KnowledgeDepthModel =
  /** The corpus was read: `verdict` carries the depths AND the denominators that make them readable. */
  | { readonly status: 'measured'; readonly verdict: DepthFromWorkVerdict }
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
    verdict: evaluateDepthFromWork(
      input.assets.map((asset) => ({
        id: asset.id,
        dependsOn: asset.dependsOn ?? [],
        cites: asset.cites ?? [],
      })),
    ),
  };
}

/** What one visited node's depth reading came to, ready for a hover label and a test hook. */
export interface MarkKnowledgeDepth {
  readonly state: DepthFromWorkReading['state'];
  /** The hop count, and `null` for both non-reached states — never a stand-in large number. */
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
  const reading = depthFromWorkOf(model.verdict, nodeId);
  if (reading.state === 'reached') {
    return {
      state: 'reached',
      depth: reading.depth,
      attr: String(reading.depth),
      label:
        reading.depth === 0
          ? 'knowledge depth 0 — this artifact names the work itself'
          : `knowledge depth ${reading.depth} from the work`,
    };
  }
  if (reading.state === 'unreachable') {
    return {
      state: 'unreachable',
      depth: null,
      attr: 'unreachable',
      // Deliberately not "very deep" and not a number: no authored chain reaches it, which is an
      // absence of measurement rather than a measurement of distance.
      label: 'knowledge depth unmeasured — no authored chain reaches this from the work',
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
  readonly reached: number;
  readonly unreachable: number;
  readonly absent: number;
  /** The deepest READ artifact — `null` when nothing was reached, never a 0 that reads as shallow. */
  readonly maxDepth: number | null;
  /** The reached distribution, ascending. Empty iff `reached` is 0. */
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

  let reached = 0;
  let unreachable = 0;
  let absent = 0;
  let maxDepth: number | null = null;
  const counts = new Map<number, number>();

  for (const nodeId of nodeIds) {
    const reading = depthFromWorkOf(model.verdict, nodeId);
    if (reading.state === 'reached') {
      reached += 1;
      counts.set(reading.depth, (counts.get(reading.depth) ?? 0) + 1);
      if (maxDepth === null || reading.depth > maxDepth) maxDepth = reading.depth;
    } else if (reading.state === 'unreachable') {
      unreachable += 1;
    } else {
      absent += 1;
    }
  }

  return {
    visited: nodeIds.size,
    reached,
    unreachable,
    absent,
    maxDepth,
    buckets: [...counts.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([depth, count]) => ({ depth, count })),
  };
}

/**
 * The corpus-wide anchor line — how much of the corpus the join can see AT ALL.
 *
 * It is printed beside every per-trace count on purpose. A trace annotating 3 of its 306 reads is not
 * evidence about that session: measured on the live corpus, only 42 of 1,612 artifacts anchor the
 * walk in the first place, so a thin per-trace figure is a fact about the CORPUS's wiring. Without
 * this line a reader would draw the wrong conclusion from the right number.
 */
export function anchorSummary(model: KnowledgeDepthModel): string | null {
  if (model.status !== 'measured') return null;
  const { anchors, artifactsScanned, reached } = model.verdict;
  return (
    `${anchors} of ${artifactsScanned} artifact${artifactsScanned === 1 ? '' : 's'} name a story or ` +
    `capability and anchor the walk; ${reached} artifact${reached === 1 ? '' : 's'} have a depth at all`
  );
}
