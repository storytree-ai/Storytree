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

/** The verdict {@link verifyServedTree} returns. `reason` is present exactly when `ok` is false. */
export interface ServedTreeVerdict {
  readonly ok: boolean;
  readonly reason?: string;
}

/** The shortest prefix we will accept as an identity claim. A collision at this width is not a
 *  realistic failure mode; refusing a legitimately-abbreviated sha would be. */
const MIN_SHA_PREFIX = 7;

/**
 * Does the server we are about to measure actually serve the commit we believe it does?
 *
 * WHY THIS EXISTS — a measured failure, not a hypothetical. `comparative-capture` starts its two dev
 * servers on FIXED ports (5187/5188) with `--strictPort`. When a sibling session already holds one of
 * those ports vite EXITS, and nothing downstream notices: `waitForReady` polls the URL, gets a healthy
 * `200` from the STRANGER'S server, and the run measures a completely different worktree while
 * labelling it this branch. On a box carrying dozens of worktrees and parallel sessions that collision
 * is routine — one was found live on 2026-08-18, a server on a neighbouring port started with
 * `startDevServer`'s exact flags from an unrelated worktree.
 *
 * The signature it produces is the expensive part: the same islands at non-similar relative offsets,
 * unreproducible on re-measure, and impossible to tell apart from a real rendering regression. It cost
 * this arc a day of chasing scroll offsets and element-choice theories for a ~180px disagreement that
 * two honest instruments could never have reconciled, because they were not looking at the same tree.
 *
 * FAILS CLOSED. A missing or unreadable stamp is a REFUSAL, never a pass: an instrument that cannot
 * say which tree it measured has not measured anything. That is the same rule
 * `readMotionSettled` applies to a missing settle bridge, for the same reason.
 */
export function verifyServedTree(
  health: unknown,
  expectedSha: string,
  label: string,
): ServedTreeVerdict {
  const expected = expectedSha.trim().toLowerCase();
  if (expected.length < MIN_SHA_PREFIX) {
    return { ok: false, reason: `${label}: expected commit "${expectedSha}" is too short to identify a tree` };
  }
  if (typeof health !== "object" || health === null) {
    return { ok: false, reason: `${label}: /api/health returned no object — cannot confirm which tree it serves` };
  }
  const code = (health as { code?: unknown }).code;
  if (typeof code !== "object" || code === null) {
    return {
      ok: false,
      reason:
        `${label}: /api/health reported no code stamp — cannot confirm which tree it serves. ` +
        `A server that cannot name its own commit must not be measured.`,
    };
  }
  const head = (code as { head?: unknown }).head;
  if (typeof head !== "string" || head.length < MIN_SHA_PREFIX) {
    return { ok: false, reason: `${label}: /api/health reported no usable code.head — cannot confirm which tree it serves` };
  }
  const served = head.trim().toLowerCase();
  if (served !== expected && !served.startsWith(expected) && !expected.startsWith(served)) {
    return {
      ok: false,
      reason:
        `${label}: the server is serving a DIFFERENT tree than this run believes. ` +
        `expected ${expected.slice(0, 12)}, serving ${served.slice(0, 12)}. ` +
        `The likeliest cause is a port collision: another session already held this port, ` +
        `--strictPort made our own vite exit, and the readiness poll answered from theirs.`,
    };
  }
  if ((code as { stale?: unknown }).stale === true) {
    return {
      ok: false,
      reason:
        `${label}: the checkout MOVED under the running server (code.stale) — ` +
        `the served bundle no longer matches its own working tree. Restart the server before measuring.`,
    };
  }
  return { ok: true };
}
