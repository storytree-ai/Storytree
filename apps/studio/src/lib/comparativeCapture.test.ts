import { describe, expect, test } from 'vitest';
import {
  computeCaptureDelta,
  formatCaptureComparisonTable,
  toRenderElementCounts,
  unionRect,
  verifyServedTree,
  type CaptureDeltaRow,
  type RenderElementCounts,
} from './comparativeCapture';

describe('unionRect', () => {
  test('empty list has no extent', () => {
    expect(unionRect([])).toBeNull();
  });

  test('single rect is its own union', () => {
    expect(unionRect([{ x: 10, y: 20, width: 30, height: 40 }])).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    });
  });

  test('bounds several rects, including negative coordinates (off-viewport parcels)', () => {
    const rects = [
      { x: -5, y: 10, width: 20, height: 10 }, // spans x -5..15
      { x: 100, y: -30, width: 5, height: 5 }, // spans x 100..105, y -30..-25
      { x: 40, y: 40, width: 10, height: 60 }, // spans y 40..100
    ];
    expect(unionRect(rects)).toEqual({ x: -5, y: -30, width: 110, height: 130 });
  });
});

describe('toRenderElementCounts', () => {
  test('no parcels on screen reads as zero extent, not unmeasured', () => {
    const counts = toRenderElementCounts({
      parcelRects: [],
      worldCave: 3,
      trailFill: 1,
      parcelBlade: 0,
    });
    expect(counts).toEqual({
      contentWidth: 0,
      contentHeight: 0,
      islandParcels: 0,
      worldCave: 3,
      trailFill: 1,
      parcelBlade: 0,
    });
  });

  test('the union bbox of the parcel rects becomes the content extent', () => {
    const counts = toRenderElementCounts({
      parcelRects: [
        { x: 0, y: 0, width: 100, height: 50 },
        { x: 200, y: 100, width: 20, height: 20 },
      ],
      worldCave: 0,
      trailFill: 5,
      parcelBlade: 40,
    });
    expect(counts.contentWidth).toBe(220);
    expect(counts.contentHeight).toBe(120);
    expect(counts.islandParcels).toBe(2);
  });
});

describe('computeCaptureDelta + formatCaptureComparisonTable', () => {
  // The arc's own by-hand reference measurement (frontend-visual-judgment-arc,
  // "already proven, ~4 minutes", 2026-08-15) — reproducing it here pins the delta math against a
  // real, previously-verified data point rather than only invented numbers.
  const CONTROL: RenderElementCounts = {
    contentWidth: 575,
    contentHeight: 912,
    islandParcels: 226,
    worldCave: 0,
    trailFill: 122,
    parcelBlade: 10258,
  };
  const SHIPPED: RenderElementCounts = {
    contentWidth: 109,
    contentHeight: 172,
    islandParcels: 196,
    worldCave: 156,
    trailFill: 106,
    parcelBlade: 7940,
  };

  test('reproduces the reference measurement\'s own reported ratios', () => {
    const rows = computeCaptureDelta(CONTROL, SHIPPED);
    const byMeasure = (measure: string): CaptureDeltaRow => {
      const row = rows.find((r) => r.measure === measure);
      if (!row) throw new Error(`no row for measure "${measure}"`);
      return row;
    };

    // 575*912 / 109*172 = 524400 / 18748 ≈ 27.98 — the reference doc says "~28x less area".
    expect(byMeasure('content extent (union bbox of `.parcel`)').noteDisplay).toBe('~28.0x less area');
    expect(byMeasure('content extent (union bbox of `.parcel`)').baselineDisplay).toBe('575 x 912 px');
    expect(byMeasure('content extent (union bbox of `.parcel`)').branchDisplay).toBe('109 x 172 px');

    // 226 -> 196 is 30 missing.
    expect(byMeasure('island parcels (`.parcel`)').noteDisplay).toBe('-30 (-13%)');

    // 0 -> 156 caves: the connector-health canary, zero-baseline so no percentage is defensible.
    expect(byMeasure('`world-cave` portals').noteDisplay).toBe('+156');

    // 122 -> 106 is 16 lost.
    expect(byMeasure('`trail-fill`').noteDisplay).toBe('-16 (-13%)');

    // 10258 -> 7940 is the reference doc's own "-23%".
    expect(byMeasure('`parcel-blade`').noteDisplay).toBe('-2318 (-23%)');
  });

  test('formats as the standard four-column markdown table', () => {
    const rows = computeCaptureDelta(CONTROL, SHIPPED);
    const table = formatCaptureComparisonTable('CONTROL (merge-base)', 'BRANCH', rows);
    const lines = table.split('\n');
    expect(lines[0]).toBe('| measure | CONTROL (merge-base) | BRANCH | |');
    expect(lines[1]).toBe('|---|---|---|---|');
    expect(lines).toHaveLength(2 + rows.length);
    expect(lines[2]).toBe(
      '| content extent (union bbox of `.parcel`) | 575 x 912 px | 109 x 172 px | ~28.0x less area |',
    );
  });

  test('identical renders read as "no change" everywhere, not a divide-by-zero artifact', () => {
    const rows = computeCaptureDelta(CONTROL, CONTROL);
    for (const row of rows) {
      expect(row.noteDisplay === 'no change' || row.noteDisplay === '~1.0x less area').toBe(true);
    }
  });

  test('a render with genuinely no content on either side is distinguishable from a real match', () => {
    const empty: RenderElementCounts = {
      contentWidth: 0,
      contentHeight: 0,
      islandParcels: 0,
      worldCave: 0,
      trailFill: 0,
      parcelBlade: 0,
    };
    const rows = computeCaptureDelta(empty, empty);
    const extent = rows.find((r) => r.measure.startsWith('content extent'));
    expect(extent?.noteDisplay).toBe('no content in either render');
  });
});

describe('verifyServedTree', () => {
  const OURS = 'fcbcb55126817d16b8d2a0deebb82bcac4fb7c13';
  const THEIRS = 'e7348a6e8265c8499279f025da7d6f693dac57fb';
  const stamp = (head: string, stale = false) => ({ code: { startedAt: head, head, stale } });

  test('the server serving our own commit passes', () => {
    expect(verifyServedTree(stamp(OURS), OURS, 'branch')).toEqual({ ok: true });
  });

  /**
   * THE DEFECT THIS GUARDS, stated as the scenario rather than as a shape. A sibling session holds
   * port 5187; `--strictPort` makes our vite exit; the readiness poll answers 200 from THEIR server;
   * the run measures their worktree and labels the numbers as ours. Before this check that was a
   * silent pass, and it is indistinguishable from a real rendering regression in the output table.
   */
  test('a stranger holding our port is REFUSED, not measured', () => {
    const verdict = verifyServedTree(stamp(THEIRS), OURS, 'branch');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('DIFFERENT tree');
    // Both commits are named, so the reader can identify the intruder without re-deriving anything.
    expect(verdict.reason).toContain(OURS.slice(0, 12));
    expect(verdict.reason).toContain(THEIRS.slice(0, 12));
    // The likeliest cause is named too — this failure is otherwise very hard to interpret.
    expect(verdict.reason).toContain('port collision');
  });

  test('an abbreviated expected sha still matches its own tree', () => {
    expect(verifyServedTree(stamp(OURS), OURS.slice(0, 12), 'baseline')).toEqual({ ok: true });
  });

  test('a sha too short to identify a tree is refused rather than matched loosely', () => {
    expect(verifyServedTree(stamp(OURS), 'fcb', 'branch').ok).toBe(false);
  });

  // FAIL-CLOSED: the three "cannot confirm" shapes must all refuse. A server that cannot name its
  // own commit has not been identified, and an unidentified tree must never be measured.
  test('a server reporting no code stamp is refused', () => {
    const verdict = verifyServedTree({ store: 'pg', db: 'ok' }, OURS, 'baseline');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('no code stamp');
  });

  test('a non-object health payload is refused', () => {
    expect(verifyServedTree(null, OURS, 'branch').ok).toBe(false);
    expect(verifyServedTree('ok', OURS, 'branch').ok).toBe(false);
  });

  test('a code stamp with no usable head is refused', () => {
    expect(verifyServedTree({ code: { startedAt: OURS, stale: false } }, OURS, 'branch').ok).toBe(false);
  });

  test('a checkout that moved under the running server is refused even though the commit matches', () => {
    const verdict = verifyServedTree(stamp(OURS, true), OURS, 'branch');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('MOVED under the running server');
  });

  test('the label names which of the two servers failed', () => {
    expect(verifyServedTree(stamp(THEIRS), OURS, 'baseline').reason).toContain('baseline');
  });
});
