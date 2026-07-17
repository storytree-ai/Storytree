// Stage-1 red-green of the vine-routed DAG geometry helpers (ADR-0188 dec 5 / ADR-0193 dec 3, the
// library-dag-canvas capability — Option C rework). These pin the PURE contracts the SVG canvas
// leans on: the 2-line title wrap + ellipsis clamp, the border-anchored bezier edge path, and the
// stands-on / stood-on-by swimlane bands. The APPEARANCE is owner-attested (ADR-0070), NOT asserted
// here — only the machine geometry.

import { describe, it, expect } from 'vitest';
import {
  wrapTitle,
  edgePath,
  fitViewBox,
  focusSwimlanes,
  FOCUS_NODE_WIDTH,
  MIN_VIEW_WIDTH,
  MIN_VIEW_HEIGHT,
  type FocusNode,
  type FocusBBox,
} from './focusGraph';

function node(id: string, side: FocusNode['side'], x: number): FocusNode {
  return {
    id,
    title: id,
    category: 'principle',
    source: 'asset',
    side,
    onChain: true,
    ephemeral: false,
    x,
    y: 50,
  };
}

describe('wrapTitle — 2-line greedy wrap with ellipsis clamp', () => {
  it('keeps a short title on one line, no ellipsis', () => {
    expect(wrapTitle('The live store')).toEqual(['The live store']);
  });

  it('wraps a title that needs two lines without dropping content', () => {
    const lines = wrapTitle('The cross-cutting knowledge tier resolves it', 27, 2);
    expect(lines).toHaveLength(2);
    expect(lines.join(' ')).toBe('The cross-cutting knowledge tier resolves it');
    expect(lines.some((l) => l.includes('…'))).toBe(false);
  });

  it('clamps an over-long title to two lines and ellipsises the last', () => {
    const lines = wrapTitle('Retire the generated apps/studio/data/assets.json corpus export view', 27, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
  });

  it('keeps the id-forward prefix on line 1', () => {
    const lines = wrapTitle('ADR-0018: Knowledge tier Phase 1 — structured source of truth, graph shape');
    expect(lines[0]!.startsWith('ADR-0018:')).toBe(true);
    expect(lines).toHaveLength(2);
  });

  it('hard-clips a lone word wider than the line', () => {
    const [only] = wrapTitle('supercalifragilisticexpialidociousnessotron', 20, 2);
    expect(only!.endsWith('…')).toBe(true);
    expect(only!.length).toBeLessThanOrEqual(20);
  });

  it('returns a single empty line for empty text (never throws)', () => {
    expect(wrapTitle('   ')).toEqual(['']);
  });
});

describe('edgePath — border-anchored bezier through the rank gap', () => {
  it('leaves the source RIGHT border and lands on the target LEFT border, level', () => {
    const from = { x: 100, y: 93 };
    const to = { x: 400, y: 93 };
    // x1 = 100 + 210/2 = 205 ; x2 = 400 - 210/2 = 295 ; dx = max(28, (295-205)*0.5) = 45
    expect(edgePath(from, to)).toBe('M205,93 C250,93 250,93 295,93');
  });

  it('anchors to the node borders, not the centres', () => {
    const d = edgePath({ x: 0, y: 0 }, { x: 500, y: 40 });
    expect(d.startsWith(`M${0 + FOCUS_NODE_WIDTH / 2},0`)).toBe(true);
    expect(d.endsWith(`${500 - FOCUS_NODE_WIDTH / 2},40`)).toBe(true);
  });
});

describe('fitViewBox — zoom cap: pad a small graph, leave a big one', () => {
  it('pads a small (single-node) bbox up to the minimum window, centred', () => {
    const tiny: FocusBBox = { minX: 500, minY: 500, width: 266, height: 66 };
    const view = fitViewBox(tiny);
    expect(view.width).toBe(MIN_VIEW_WIDTH);
    expect(view.height).toBe(MIN_VIEW_HEIGHT);
    // content stays centred: shifted left/up by half the shortfall
    expect(view.minX).toBe(500 - (MIN_VIEW_WIDTH - 266) / 2);
    expect(view.minY).toBe(500 - (MIN_VIEW_HEIGHT - 66) / 2);
    // the original content is fully contained
    expect(view.minX).toBeLessThanOrEqual(tiny.minX);
    expect(view.minX + view.width).toBeGreaterThanOrEqual(tiny.minX + tiny.width);
  });

  it('leaves a graph larger than the minimum unchanged (still fits-to-view)', () => {
    const big: FocusBBox = { minX: 0, minY: 0, width: MIN_VIEW_WIDTH + 800, height: MIN_VIEW_HEIGHT + 400 };
    expect(fitViewBox(big)).toEqual(big);
  });

  it('pads only the deficient axis', () => {
    const wideShort: FocusBBox = { minX: 0, minY: 0, width: MIN_VIEW_WIDTH + 500, height: 120 };
    const view = fitViewBox(wideShort);
    expect(view.width).toBe(wideShort.width); // wide enough — untouched
    expect(view.height).toBe(MIN_VIEW_HEIGHT); // short — padded up
  });
});

describe('focusSwimlanes — stands-on / stood-on-by grounds', () => {
  const bbox: FocusBBox = { minX: 0, minY: 0, width: 656, height: 100 };

  it('bands both sides, pinned to the bbox edges, split at the centre midpoints', () => {
    const nodes = [node('c', 'centre', 300), node('u', 'upstream', 100), node('d', 'downstream', 500)];
    const lanes = focusSwimlanes(nodes, bbox);
    expect(lanes.left).toEqual({ x: 0, width: 200 }); // [minX, mid(100,300)=200]
    expect(lanes.right).toEqual({ x: 400, width: 256 }); // [mid(300,500)=400, maxX=656]
  });

  it('omits a side that has no fan', () => {
    const upstreamOnly = focusSwimlanes([node('c', 'centre', 300), node('u', 'upstream', 100)], bbox);
    expect(upstreamOnly.left).not.toBeNull();
    expect(upstreamOnly.right).toBeNull();
  });

  it('yields no bands when there is no centre', () => {
    expect(focusSwimlanes([node('u', 'upstream', 100)], bbox)).toEqual({ left: null, right: null });
  });
});
