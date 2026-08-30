// THE DRAWN VERTICAL AXIS (`traversal-panel-arc`, increment `traversal-panel-depth-on-the-axis`;
// ADR-0482 D1–D3).
//
// The replay's vertical used to carry SESSION-traversal depth from `parentVisitId` — "this read was
// reached by following a pointer the previous read offered". Measured 2026-08-30 across all 750 local
// traces and 8,965 reads, **704 carry that field (7.85%) and every one comes from the `agents`
// surface**; of the 4,735 `library-artifact` reads, where following an offer is actually possible,
// ZERO carry one. The axis has drawn nothing on any trace since it was built and will not start on
// its own, so ADR-0482 D1 moves it onto the reading that DOES exist: the ADR-0476 surface depth over
// `dependsOn`, the same figure the panel's chip already prints.
//
// ## WHAT THE AXIS NOW CLAIMS, AND WHAT IT MUST NEVER CLAIM (ADR-0482 D2)
//
// It is CORPUS DISTANCE — how far below the graph's own surface the artifact that was read sits. It
// is NOT the session's own descent, and ADR-0354 clause 5's protection against a picture claiming a
// walk that never happened is kept by SAYING SO where a reader meets the axis. {@link axisRowLabel}
// is that saying-so, and it is the reason the labels live in this module rather than in the renderer:
// a row's meaning and a row's position are one decision.
//
// `parentVisitId` and `lib/traversalDepth.ts` are UNTOUCHED and still computed (ADR-0482 D5, the
// ADR-0393 precedent: drop the drawing, keep the telemetry). A session-descent drawing stays cheap to
// restore if offer-following ever becomes routine.
//
// ## UNMEASURED GETS ITS OWN ROW, BECAUSE ROW 0 MEANS SOMETHING (ADR-0482 D3)
//
// `unlinked`, `cyclic` and `absent` are the ABSENCE of a reading, not a shallow one. Drawing them at
// row 0 would put them beside genuine surfaces and render "everything is at the surface", which reads
// as health and is the exact inversion `surface-depth.ts` refuses. They draw on a row of their own,
// BELOW the deepest measured row and labelled as unmeasured, so they are visibly off the depth scale
// rather than at the top of it.
//
// THAT ROW IS ALLOCATED WHENEVER THE CORPUS WAS READ, even on the (unobserved) trace where nothing is
// unmeasured. Making it conditional would buy one row of height and cost a branch in
// {@link knowledgeAxisRow} that no correctly-built caller can take — a line nobody can test, on the
// path every mark goes through. In practice every real trace populates it: a trace's reads include
// CLI tokens and story ids the corpus was never asked to hold.

import type { KnowledgeDepthReport, MarkKnowledgeDepth } from './knowledgeDepth';

/**
 * How many DEPTH rows the picture will draw, however deep the corpus goes.
 *
 * A display clamp and stated as one, exactly as `TRAVERSAL_MAX_DRAWN_DEPTH` was: a deeper read stacks
 * on the last depth row rather than running off the block, and {@link KnowledgeAxis.deepest} carries
 * the trace's REAL deepest reading so the clamp is never mistaken for the data's ceiling.
 *
 * 16 rather than 4. The old value was calibrated for an axis fed by `parentVisitId`, whose observed
 * maximum across every local trace was 0. This axis reads a corpus measured at 17 levels deep on
 * 2026-08-30, with real traces reaching 12 and 16, so a clamp of 4 would discard most of the signal
 * the move exists to expose. It is set one BELOW the corpus maximum on purpose: a clamp that no input
 * can reach is a line nobody can test.
 */
export const TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH = 16;

/** The vertical extent one trace's reads need, and the facts that make it readable. */
export interface KnowledgeAxis {
  /**
   * Depth rows drawn BELOW the surface row: rows `1..depthRows`. `0` means every placed read sat at
   * the surface, which is a real answer and not an absence.
   */
  readonly depthRows: number;
  /**
   * The trace's REAL deepest placed reading, unclamped. `null` when nothing was placed — never a `0`,
   * which would read as "everything is at the surface".
   */
  readonly deepest: number | null;
  /** Did {@link TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH} actually bite? Reported, so it can be stated. */
  readonly clamped: boolean;
  /**
   * Was the corpus read at all? The discriminator every other field is interpreted against.
   *
   * FALSE is the SINGLE-COLUMN case and nothing else: with no corpus there is no axis, every mark
   * sits on the spine, and the panel's own chip already says the corpus was not read.
   */
  readonly measured: boolean;
  /**
   * The row unmeasured reads draw on — `0`, the spine, when {@link measured} is false.
   *
   * A NUMBER rather than a nullable, so {@link knowledgeAxisRow} has no `?? 0` fallback on the path
   * every mark takes. The unmeasured case and the no-corpus case genuinely agree on the answer
   * (the spine), so a branch separating them would be a line no input can distinguish.
   */
  readonly unmeasuredRow: number;
  /** Total rows below the surface, unmeasured row included. What the geometry sizes against. */
  readonly rows: number;
}

/**
 * PURE: the axis one trace's reads need.
 *
 * `null` — the corpus was not read — collapses to a single column rather than to an empty scale. That
 * is `traversalDepth.ts`'s own honest default carried over: a picture with no reading draws no rows,
 * and never draws rows it cannot fill.
 */
export function buildKnowledgeAxis(report: KnowledgeDepthReport | null): KnowledgeAxis {
  if (report === null) {
    return { depthRows: 0, deepest: null, clamped: false, measured: false, unmeasuredRow: 0, rows: 0 };
  }
  const deepest = report.maxDepth;
  // `null` (nothing placed) and `0` (every placed read at the surface) must REPORT differently — that
  // is what {@link KnowledgeAxis.deepest} is for — but they need the same row arithmetic, so they are
  // resolved together HERE, once, and kept apart only where the difference is visible.
  //
  // The resolution is what lets `clamped` be a plain numeric comparison. Written against the nullable
  // instead (`deepest !== null && deepest > MAX`) the null guard can never change the answer, because
  // `null > 16` is already false — a condition no input can flip, which mutation testing correctly
  // reported as unkillable and which no reviewer could have distinguished from a real guard.
  const reached = deepest ?? 0;
  const depthRows = Math.min(TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH, reached);
  return {
    depthRows,
    deepest,
    clamped: reached > TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH,
    measured: true,
    unmeasuredRow: depthRows + 1,
    rows: depthRows + 1,
  };
}

/**
 * PURE: which row one read draws on. TOTAL — every mark draws somewhere.
 *
 * `reading === null` is the read the join has nothing to say about: the corpus was not read, or the
 * mark is a SEARCH, which reads no single node and therefore has no artifact to place. Both sit on
 * the spine, which is where they sat before this axis existed.
 *
 * ⚠ A PLACED READING IS THE ONLY ONE THAT PRODUCES A DEPTH ROW. `unlinked` / `cyclic` / `absent` go to
 * {@link KnowledgeAxis.unmeasuredRow} — see the header. The temptation is `reading.depth ?? 0`, which
 * type-checks, reads as care, and quietly files every unmeasured read at the surface.
 *
 * THE `depth === null` GUARD IS THE SAME RULE ONE LEVEL DOWN, and it is not defensive padding.
 * `MarkKnowledgeDepth` is a flat record rather than a discriminated union, so its `depth` is
 * `number | null` on EVERY state — `markKnowledgeDepth` fills it exactly when the state is `placed`,
 * but the shape does not say so. Some future reading that carries `placed` with no number must fall
 * to the unmeasured row and never to the surface: the whole point of D3 is that "we have no number"
 * and "the number is 0" are different claims, and the safe direction is the one that does not read
 * as health.
 */
export function knowledgeAxisRow(axis: KnowledgeAxis, reading: MarkKnowledgeDepth | null): number {
  if (reading === null) return 0;
  if (reading.state === 'placed' && reading.depth !== null) {
    return Math.min(axis.depthRows, reading.depth);
  }
  return axis.unmeasuredRow;
}

/**
 * PURE: what a row is called where a reader meets it — ADR-0482 D2's labelling, which is what keeps
 * the reversed clause's intent.
 *
 * Row 0 is "surface" and not "depth 0": the axis's own top is the graph's surface, and naming it with
 * a number invites reading the column as a session's descent from nowhere.
 */
export function axisRowLabel(axis: KnowledgeAxis, row: number): string {
  if (row === 0) return 'surface';
  if (row === axis.unmeasuredRow) return 'unmeasured';
  const hop = row === 1 ? 'hop' : 'hops';
  return row === axis.depthRows && axis.clamped ? `${String(row)}+ ${hop}` : `${String(row)} ${hop}`;
}

/**
 * PURE: one sentence naming what the vertical means, rendered beside the axis.
 *
 * ADR-0482 D2 makes this load-bearing rather than decorative — an unlabelled axis re-creates exactly
 * the claim ADR-0354 clause 5 was written to prevent. It states the quantity, and it states the real
 * deepest reading whenever the drawn rows are clamped short of it.
 */
export function axisCaption(axis: KnowledgeAxis): string {
  if (!axis.measured) {
    return 'depth axis unmeasured — the Library corpus was not read, so every read draws on the spine';
  }
  const base =
    'the vertical is CORPUS distance — how far below the graph’s surface the artifact sits, ' +
    'never the route this session took';
  if (axis.deepest === null) return `${base}; nothing this session read has a depth`;
  return axis.clamped
    ? `${base}; drawn to ${String(axis.depthRows)} hops, this session reached ${String(axis.deepest)}`
    : `${base}; this session reached ${String(axis.deepest)}`;
}
