// lpf-* contracts (library-process-flow, ADR-0266 / library-typed-edges) — a `process` asset's
// authored `branchEdges` must join the DOWNSTREAM frontier of the focus DAG as real successor edges,
// each carrying its authored label and a `kind: 'branch'` tag, never routed through `referencesOf`
// (which would rank them upstream and invert the flow). At HEAD `buildFocusGraph` reads only
// `asset.references` — branchEdges are ignored entirely, so every assertion below is a genuine
// behaviour red, not a type-only change.

import { describe, it, expect } from 'vitest';
import { buildFocusGraph } from './focusGraph';
import type { GuidanceAsset } from '../types';
import type { SearchResult } from './librarySearch';

function process(
  id: string,
  branchEdges?: { ref: string; label?: string }[],
): GuidanceAsset {
  return {
    id,
    category: 'process',
    title: id,
    description: `${id} description`,
    body: `${id} body`,
    references: [],
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
    ...(branchEdges ? { branchEdges } : {}),
  };
}

function principle(id: string): GuidanceAsset {
  return {
    id,
    category: 'principle',
    title: id,
    description: `${id} description`,
    body: `${id} body`,
    references: [],
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  };
}

function centreOf(asset: GuidanceAsset): SearchResult {
  return { id: asset.id, title: asset.title, category: asset.category, source: 'asset' };
}

describe('lpf — process branchEdges become downstream flow edges', () => {
  it('lpf-branch-target-renders-downstream: a branch target joins the downstream frontier as a real node + edge', () => {
    const stationA = principle('station-a');
    const stationB = principle('station-b');
    const centreAsset = process('software-factory-line-fixture', [
      { ref: 'asset:station-a', label: 'station A' },
      { ref: 'asset:station-b', label: 'station B' },
    ]);
    const assets = [centreAsset, stationA, stationB];

    const result = buildFocusGraph({ centre: centreOf(centreAsset), assets, docs: [] });

    const nodeA = result.nodes.find((n) => n.id === 'station-a');
    const nodeB = result.nodes.find((n) => n.id === 'station-b');
    expect(nodeA).toBeDefined();
    expect(nodeA?.side).toBe('downstream');
    expect(nodeB).toBeDefined();
    expect(nodeB?.side).toBe('downstream');

    const edgeA = result.edges.find((e) => e.from === 'software-factory-line-fixture' && e.to === 'station-a');
    const edgeB = result.edges.find((e) => e.from === 'software-factory-line-fixture' && e.to === 'station-b');
    expect(edgeA).toBeDefined();
    expect(edgeB).toBeDefined();
  });

  it('lpf-branch-edge-carries-its-label: the produced edge carries the authored label verbatim, or none when unlabelled', () => {
    const stationA = principle('station-a');
    const stationC = principle('station-c');
    const centreAsset = process('software-factory-line-fixture', [
      { ref: 'asset:station-a', label: 'station A — the labelled one' },
      { ref: 'asset:station-c' },
    ]);
    const assets = [centreAsset, stationA, stationC];

    const result = buildFocusGraph({ centre: centreOf(centreAsset), assets, docs: [] });

    const edgeA = result.edges.find((e) => e.from === 'software-factory-line-fixture' && e.to === 'station-a');
    expect(edgeA?.label).toBe('station A — the labelled one');

    const edgeC = result.edges.find((e) => e.from === 'software-factory-line-fixture' && e.to === 'station-c');
    expect(edgeC).toBeDefined();
    expect(edgeC?.label).toBeUndefined();
  });

  it('lpf-branch-edge-is-kind-tagged: a branch-derived edge is kind-tagged apart from an ordinary reference edge', () => {
    const stationA = principle('station-a');
    const centreAsset = process('software-factory-line-fixture', [
      { ref: 'asset:station-a', label: 'station A' },
    ]);
    // An ordinary reference edge, upstream of the centre, for contrast.
    const upstreamRef = principle('upstream-ref');
    const centreWithRef: GuidanceAsset = { ...centreAsset, references: ['asset:upstream-ref'] };
    const assets = [centreWithRef, stationA, upstreamRef];

    const result = buildFocusGraph({ centre: centreOf(centreWithRef), assets, docs: [] });

    const branchEdge = result.edges.find(
      (e) => e.from === 'software-factory-line-fixture' && e.to === 'station-a',
    );
    const refEdge = result.edges.find(
      (e) => e.from === 'upstream-ref' && e.to === 'software-factory-line-fixture',
    );
    expect(branchEdge?.kind).toBe('branch');
    expect(refEdge).toBeDefined();
    expect(refEdge?.kind).not.toBe('branch');
  });

  it('lpf-no-branch-edges-yields-none: a process with no branchEdges contributes no branch nodes or edges', () => {
    const otherProcess = process('other-process-fixture'); // no branchEdges field at all
    const unrelated = principle('unrelated-asset');
    const assets = [otherProcess, unrelated];

    const result = buildFocusGraph({ centre: centreOf(otherProcess), assets, docs: [] });

    expect(result.nodes.some((n) => n.id === 'unrelated-asset')).toBe(false);
    expect(result.edges).toHaveLength(0);
  });
});
