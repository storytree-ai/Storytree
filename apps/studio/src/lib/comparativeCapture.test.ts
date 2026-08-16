import { describe, expect, test } from 'vitest';
import {
  computeCaptureDelta,
  formatCaptureComparisonTable,
  toRenderElementCounts,
  unionRect,
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
