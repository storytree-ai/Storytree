// The PROVABLE CORE behind the corpus-scale comparative capture (frontend-visual-judgment-arc,
// increment `frontend-corpus-scale-comparative-capture`): pure geometry + delta + table-formatting,
// pushed down out of `scripts/comparative-capture.mjs` so it is red→green tested rather than only
// eyeballed off a screenshot pair. Numbers first, image second — the increment's own design note.
//
// The GLUE (spinning two dev servers against the same live corpus, driving a real browser, reading
// `.parcel` / `.world-cave` / `.trail-fill` / `.parcel-blade` off the live DOM) lives in the script,
// which calls back into this module for everything that can be asserted without a browser.

/** An axis-aligned rectangle in the SAME coordinate space as every other rect passed to {@link unionRect}. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The smallest rect containing every rect in `rects`, or `null` for an empty list (there is no
 * content to bound — the caller reads that as zero extent, never as "unmeasured").
 */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The five machine-checkable measures the increment names: content extent (union bbox of `.parcel`
 * in viewport pixels — post camera-fit, which is exactly what a shrunken-camera defect moves), the
 * island-parcel count, the `world-cave` fallback-portal count (the connector-health canary,
 * `asset:a-connector-that-does-not-connect-is-a-defect`), `trail-fill` segments, and `parcel-blade`
 * marks (the densest per-signal draw, so the steepest early-warning on a shrink).
 */
export interface RenderElementCounts {
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly islandParcels: number;
  readonly worldCave: number;
  readonly trailFill: number;
  readonly parcelBlade: number;
}

/** The literal CSS selectors the browser-side extraction reads — kept beside the counts they
 *  produce so a class rename is one diff instead of two drifting copies. */
export const CAPTURE_SELECTORS = {
  parcel: ".parcel",
  worldCave: ".world-cave",
  trailFill: ".trail-fill",
  parcelBlade: ".parcel-blade",
} as const;

/** One row of the rendered comparison table. */
export interface CaptureDeltaRow {
  readonly measure: string;
  readonly baselineDisplay: string;
  readonly branchDisplay: string;
  readonly noteDisplay: string;
}

function fmtPx(width: number, height: number): string {
  return `${Math.round(width)} x ${Math.round(height)} px`;
}

/** A ratio note for an area comparison — "~Nx less/more area", or the degenerate all-zero/one-zero cases. */
function areaRatioNote(baselineArea: number, branchArea: number): string {
  if (baselineArea === 0 && branchArea === 0) return "no content in either render";
  if (branchArea === 0) return "branch renders NO content";
  if (baselineArea === 0) return "baseline rendered NO content";
  const ratio = baselineArea / branchArea;
  return ratio >= 1 ? `~${ratio.toFixed(1)}x less area` : `~${(1 / ratio).toFixed(1)}x more area`;
}

/** A signed delta note for a plain count — "+156", "-30 (-13%)", "no change". */
function countNote(baseline: number, branch: number): string {
  const delta = branch - baseline;
  if (delta === 0) return "no change";
  const sign = delta > 0 ? "+" : "";
  const pct = baseline !== 0 ? ` (${sign}${((delta / baseline) * 100).toFixed(0)}%)` : "";
  return `${sign}${delta}${pct}`;
}

/**
 * Compute the five-row delta table between a baseline (`merge-base(origin/main, HEAD)`) render and
 * this branch's render of the SAME live corpus. Pure — every number here is already in hand; nothing
 * touches the DOM or the network.
 */
export function computeCaptureDelta(
  baseline: RenderElementCounts,
  branch: RenderElementCounts,
): CaptureDeltaRow[] {
  const baselineArea = baseline.contentWidth * baseline.contentHeight;
  const branchArea = branch.contentWidth * branch.contentHeight;
  return [
    {
      measure: "content extent (union bbox of `.parcel`)",
      baselineDisplay: fmtPx(baseline.contentWidth, baseline.contentHeight),
      branchDisplay: fmtPx(branch.contentWidth, branch.contentHeight),
      noteDisplay: areaRatioNote(baselineArea, branchArea),
    },
    {
      measure: "island parcels (`.parcel`)",
      baselineDisplay: String(baseline.islandParcels),
      branchDisplay: String(branch.islandParcels),
      noteDisplay: countNote(baseline.islandParcels, branch.islandParcels),
    },
    {
      measure: "`world-cave` portals",
      baselineDisplay: String(baseline.worldCave),
      branchDisplay: String(branch.worldCave),
      noteDisplay: countNote(baseline.worldCave, branch.worldCave),
    },
    {
      measure: "`trail-fill`",
      baselineDisplay: String(baseline.trailFill),
      branchDisplay: String(branch.trailFill),
      noteDisplay: countNote(baseline.trailFill, branch.trailFill),
    },
    {
      measure: "`parcel-blade`",
      baselineDisplay: String(baseline.parcelBlade),
      branchDisplay: String(branch.parcelBlade),
      noteDisplay: countNote(baseline.parcelBlade, branch.parcelBlade),
    },
  ];
}

/** Render the delta table as the markdown shape used throughout this arc's writeups. */
export function formatCaptureComparisonTable(
  baselineLabel: string,
  branchLabel: string,
  rows: readonly CaptureDeltaRow[],
): string {
  const header = `| measure | ${baselineLabel} | ${branchLabel} | |`;
  const sep = "|---|---|---|---|";
  const body = rows.map(
    (r) => `| ${r.measure} | ${r.baselineDisplay} | ${r.branchDisplay} | ${r.noteDisplay} |`,
  );
  return [header, sep, ...body].join("\n");
}

/**
 * Turn raw per-`.parcel` viewport rects + the other three selector counts into
 * {@link RenderElementCounts}. The browser-side extraction (the script) hands this the cheapest
 * possible payload — rects and counts, no DOM — so the union-bbox math stays here, tested, rather
 * than duplicated inside a `page.evaluate` closure.
 */
export function toRenderElementCounts(extraction: {
  readonly parcelRects: readonly Rect[];
  readonly worldCave: number;
  readonly trailFill: number;
  readonly parcelBlade: number;
}): RenderElementCounts {
  const bbox = unionRect(extraction.parcelRects);
  return {
    contentWidth: bbox?.width ?? 0,
    contentHeight: bbox?.height ?? 0,
    islandParcels: extraction.parcelRects.length,
    worldCave: extraction.worldCave,
    trailFill: extraction.trailFill,
    parcelBlade: extraction.parcelBlade,
  };
}
