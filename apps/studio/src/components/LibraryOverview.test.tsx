// @vitest-environment jsdom
//
// Behaviour + geometry test for the Library OVERVIEW (ADR-0185 dec 4, increment 5 of the
// library-tech-tree-overlay story). This capability's honest proof spans two things:
//
//   • the PURE `overviewConstellation` module (`../lib/overviewConstellation`) — the leaf's
//     clean red→green heart: `importanceOf` (in+out DEGREE over the `references[]` graph,
//     degree-only, `load_bearing` NOT read — that's increment 6's job), `sizeTiers` (bucketing
//     importance into exactly 3 monotonic size tiers), `lodBand` (zoom → 'far' | 'mid' | 'close'
//     at settled, monotonic thresholds), `constellationLayout` (a total, deterministic,
//     cycle-tolerant position for every corpus node, wrapping `stressSeeds`), and `glowIds` (the
//     live-query match set, via `searchCorpus`, MIN_QUERY_LENGTH floor).
//   • the `<LibraryOverview>` component (`./LibraryOverview`) — the empty-state dot field over
//     the WHOLE loaded corpus, taking `assets`/`onSelect` as PROPS (no backend seam, no
//     fetch), owning its OWN search input (glows the live-query match set as a `data-glow`
//     marker) and its OWN zoom UI (a zoom-in control that walks the LOD ladder), rendering
//     EXACTLY one element per node at the FAR band (one circle per artifact, no ambient labels),
//     and lifting a node click into `onSelect` with finder-parity shape (`source: 'asset'` and the
//     artifact's own `category`).
//
// ★ THE CONSTELLATION IS ASSETS-ONLY (ADR-0403 dec 1), and the `docs` argument is gone from every
// function here. The overview drew a SQUARE per `/api/docs` entry lifting `source: 'doc'` +
// `category: 'adr'`, because a decision was a file under `docs/decisions/`. PR #1546 deleted that
// subtree, so those squares stood for REFERENCE documents wearing a decision's label while every
// real decision was already drawn as a circle out of `assets`. The `lov-*` contracts below keep
// their subjects — degree, tiers, LOD, layout totality, glow, select shape — with a decision
// fixture that is an `adr` ARTIFACT, the shape `/api/assets` really serves.
//
// NOT pinned here (the story's operator-attested UAT leg, ADR-0070): the forest-cozy palette,
// the 3-tier size sizing, the FAR↔MID↔CLOSE band transition animation, the glow pulse, the
// plaque styling, the circle/square node shapes' visual treatment, and the whole-corpus layout
// aesthetics. No visual/colour/stroke/pixel/animation assertion lives in this file — only the
// degree scoring, the size tiers, the LOD band function, the layout totality + determinism, the
// FAR element-count, the glow marker, the select result, and the no-fetch invariant.
//
// No real fetch/docContent/socket/DB/Electron — the overview holds no backend seam of its own
// (it reads only the `assets` already loaded via `useAppData()`, handed in as props).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { searchCorpus } from '../lib/librarySearch';
import {
  importanceOf,
  sizeTiers,
  lodBand,
  constellationLayout,
  glowIds,
} from '../lib/overviewConstellation';
import { LibraryOverview } from './LibraryOverview';
import type { GuidanceAsset } from '../types';

const NOW = '2026-01-01T00:00:00.000Z';

function asset(overrides: Partial<GuidanceAsset> & Pick<GuidanceAsset, 'id' | 'category' | 'title'>): GuidanceAsset {
  return {
    description: 'unrelated description text',
    body: 'unrelated body text',
    references: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// A shared small fixed corpus:
//   - hubAsset:    a `principle` referenced by leafA and leafB (in-degree 2, out-degree 0).
//   - leafA/leafB: `pattern` assets that each reference the hub (out-degree 1 apiece).
//   - leafC:       a `definition` asset with no references in or out (degree 0, isolated).
//   - arcAsset:    an `arc` asset (for the CLOSE-band kindLabel "epic" trap).
//   - leafD:       a `pattern` asset referencing the hub decision (contributes to its in-degree).
//   - hubAdr:      a DECISION referenced by leafD (in-degree 1). It is an `adr` ARTIFACT, so —
//                  unlike the retired DocMeta fixture — its own `references` ARE traversed, and
//                  its out-degree is a real count rather than a structural 0.
//   - quietAdr:    a decision referenced by nobody, referencing nobody (degree 0).
const hubAsset = asset({ id: 'hub-asset', category: 'principle', title: 'The Hub Principle' });
const leafA = asset({
  id: 'leaf-a',
  category: 'pattern',
  title: 'Leaf A',
  references: ['asset:hub-asset'],
});
const leafB = asset({
  id: 'leaf-b',
  category: 'pattern',
  title: 'Leaf B',
  references: ['asset:hub-asset'],
});
const leafC = asset({ id: 'leaf-c', category: 'definition', title: 'Leaf C' });
const arcAsset = asset({ id: 'epic-initiative', category: 'arc', title: 'The Great Migration' });
const leafD = asset({
  id: 'leaf-d',
  category: 'pattern',
  title: 'Leaf D',
  references: ['asset:adr-0001'],
});
const hubAdr = asset({
  id: 'adr-0001',
  category: 'adr',
  title: 'Hub Decision Record',
  status: 'accepted',
});
const quietAdr = asset({
  id: 'adr-0002',
  category: 'adr',
  title: 'Quiet Decision Record',
  status: 'proposed',
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---------- the pure constellation heart ----------

describe('importanceOf', () => {
  // ── lov-importance-degree-over-references ───────────────────────────────────────
  it('lov-importance-degree-over-references: importance is the in+out DEGREE over references[] — a hub referenced by two leaves outranks an isolated node, and a referencing leaf\'s OUT-degree also counts', () => {
    const importance = importanceOf([hubAsset, leafA, leafB, leafC]);
    expect(importance.get('hub-asset')).toBe(2);
    expect(importance.get('leaf-a')).toBe(1);
    expect(importance.get('leaf-b')).toBe(1);
    expect(importance.get('leaf-c')).toBe(0);
  });

  // v2 (ADR-0403 dec 1): a decision is an artifact, so its degree is scored like any other node's.
  // The old contract pinned out-degree at a STRUCTURAL 0 — `DocMeta` had no traversed `references`
  // — which is no longer a property of the corpus, only of the retired producer.
  it('lov-importance-degree-over-references: a decision is scored like any other node — in-degree from its referrers, out-degree from its own references', () => {
    const importance = importanceOf([leafD, hubAdr, quietAdr]);
    expect(importance.get(hubAdr.id)).toBe(1);
    expect(importance.get(quietAdr.id)).toBe(0);
  });

  it('lov-importance-degree-over-references: every asset id is present in the map (totality)', () => {
    const assets = [hubAsset, leafA, leafB, leafC, leafD, hubAdr, quietAdr];
    const importance = importanceOf(assets);
    for (const a of assets) expect(importance.has(a.id)).toBe(true);
  });
});

describe('sizeTiers', () => {
  // ── lov-size-tier-buckets-by-importance ────────────────────────────────────────
  it('lov-size-tier-buckets-by-importance: buckets importance into exactly 3 tiers, monotonic — the hub lands at least as high as a referencing leaf, which lands at least as high as an isolated leaf', () => {
    const tiers = sizeTiers([hubAsset, leafA, leafC]);
    for (const t of tiers.values()) expect([0, 1, 2]).toContain(t);
    expect(tiers.get('hub-asset')!).toBeGreaterThanOrEqual(tiers.get('leaf-a')!);
    expect(tiers.get('leaf-a')!).toBeGreaterThanOrEqual(tiers.get('leaf-c')!);
  });

  it('lov-size-tier-buckets-by-importance: assigns a tier to every asset id (totality)', () => {
    const assets = [hubAsset, leafA, leafC, hubAdr, quietAdr];
    const tiers = sizeTiers(assets);
    expect(tiers.size).toBe(assets.length);
  });
});

describe('lodBand', () => {
  // ── lov-lod-band-by-zoom ────────────────────────────────────────────
  it('lov-lod-band-by-zoom: zoom maps to exactly one of far/mid/close, and never reverses to a farther band as zoom increases', () => {
    expect(lodBand(0.1)).toBe('far');
    expect(lodBand(1)).toBe('far');
    expect(lodBand(2)).toBe('mid');
    expect(lodBand(3)).toBe('mid');
    expect(lodBand(4)).toBe('close');
    expect(lodBand(10)).toBe('close');

    const rank = { far: 0, mid: 1, close: 2 } satisfies Record<string, number>;
    const zooms = [0.1, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 6, 10];
    let prevRank = -1;
    for (const z of zooms) {
      const r = rank[lodBand(z)]!;
      expect(r).toBeGreaterThanOrEqual(prevRank);
      prevRank = r;
    }
  });
});

describe('constellationLayout', () => {
  // ── lov-layout-total-and-deterministic ───────────────────────────
  it('lov-layout-total-and-deterministic: assigns a position to every corpus node (totality), and is deterministic across two calls over the same corpus', () => {
    const assets = [hubAsset, leafA, leafB, leafC, leafD, hubAdr, quietAdr];
    const layout1 = constellationLayout(assets, 'overview-seed');
    const layout2 = constellationLayout(assets, 'overview-seed');

    expect(layout1.size).toBe(assets.length);
    for (const a of assets) expect(layout1.has(a.id)).toBe(true);

    for (const [id, pos] of layout1) {
      const pos2 = layout2.get(id);
      expect(pos2).toBeDefined();
      expect(pos2!.x).toBeCloseTo(pos.x, 6);
      expect(pos2!.y).toBeCloseTo(pos.y, 6);
    }
  });

  it('lov-layout-total-and-deterministic: is cycle-tolerant — a reference cycle neither throws nor drops a node', () => {
    const cycleA = asset({
      id: 'cycle-a',
      category: 'pattern',
      title: 'Cycle A',
      references: ['asset:cycle-b'],
    });
    const cycleB = asset({
      id: 'cycle-b',
      category: 'pattern',
      title: 'Cycle B',
      references: ['asset:cycle-a'],
    });
    expect(() => constellationLayout([cycleA, cycleB], 'seed')).not.toThrow();
    const layout = constellationLayout([cycleA, cycleB], 'seed');
    expect(layout.size).toBe(2);
  });
});

describe('glowIds', () => {
  // ── lov-search-glow-matched-set-via-searchcorpus (pure) ──────────────────────────
  it('lov-search-glow-matched-set-via-searchcorpus: returns exactly the ids searchCorpus matches for the query', () => {
    const assets = [hubAsset, leafC, hubAdr, quietAdr];
    const matched = glowIds('hub', assets);
    const expected = new Set(searchCorpus('hub', assets).map((r) => r.id));
    expect(matched).toEqual(expected);
    expect(matched.has(hubAsset.id)).toBe(true);
    expect(matched.has(hubAdr.id)).toBe(true);
    expect(matched.has(leafC.id)).toBe(false);
  });

  it('lov-search-glow-matched-set-via-searchcorpus: a below-floor (1-char) query glows nothing', () => {
    expect(glowIds('h', [hubAsset]).size).toBe(0);
  });
});

// ---------- the component ----------

describe('LibraryOverview', () => {
  // ── lov-empty-state-renders-constellation-no-fetch ──────────────────────────────
  it('lov-empty-state-renders-constellation-no-fetch: with no selection, renders the whole loaded corpus as a dot field — never fetches', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const assets = [hubAsset, leafA, leafB, leafC, arcAsset, hubAdr, quietAdr];

    render(<LibraryOverview assets={assets} onSelect={vi.fn()} />);

    const nodes = screen.getAllByTestId(/^library-overview-node-/);
    expect(nodes).toHaveLength(assets.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── lov-far-band-one-element-per-node ─────────────────────────
  it('lov-far-band-one-element-per-node: at the FAR band each node is exactly one element — a circle per artifact, a decision included — with no ambient labels', () => {
    const assets = [hubAsset, leafC, hubAdr];

    render(<LibraryOverview assets={assets} onSelect={vi.fn()} />);

    expect(screen.getAllByTestId(/^library-overview-node-/)).toHaveLength(3);
    expect(screen.getByTestId(`library-overview-node-${hubAsset.id}`).getAttribute('data-shape')).toBe(
      'circle',
    );
    expect(screen.getByTestId(`library-overview-node-${leafC.id}`).getAttribute('data-shape')).toBe(
      'circle',
    );
    // A decision is an ARTIFACT node, so it draws as a circle — the square was the doc-fold shape.
    expect(screen.getByTestId(`library-overview-node-${hubAdr.id}`).getAttribute('data-shape')).toBe(
      'circle',
    );

    // no ambient labels at FAR
    expect(screen.queryByText(hubAsset.title)).toBeNull();
    expect(screen.queryByText(hubAdr.title)).toBeNull();
  });

  // ── lov-search-glow-matched-set-via-searchcorpus (component) ────────────────────
  it('lov-search-glow-matched-set-via-searchcorpus: typing a live query in the overview\'s OWN search input marks matched nodes data-glow, leaves the rest unmarked; a below-floor query glows nothing', () => {
    const assets = [hubAsset, leafC, hubAdr];

    render(<LibraryOverview assets={assets} onSelect={vi.fn()} />);
    const box = screen.getByRole('textbox', { name: /search/i });

    fireEvent.change(box, { target: { value: 'hub' } });
    expect(
      screen.getByTestId(`library-overview-node-${hubAsset.id}`).getAttribute('data-glow'),
    ).toBe('true');
    expect(
      screen.getByTestId(`library-overview-node-${hubAdr.id}`).getAttribute('data-glow'),
    ).toBe('true');
    expect(
      screen.getByTestId(`library-overview-node-${leafC.id}`).hasAttribute('data-glow'),
    ).toBe(false);

    fireEvent.change(box, { target: { value: 'h' } });
    expect(
      screen.getByTestId(`library-overview-node-${hubAsset.id}`).hasAttribute('data-glow'),
    ).toBe(false);
  });

  // ── lov-node-select-yields-searchresult-asset-and-doc ────────────────────────────
  it('lov-node-select-yields-searchresult-asset-and-doc: clicking a node lifts onSelect with finder-parity SearchResult shape — source "asset" and the artifact\'s own category, a decision included', () => {
    const onSelect = vi.fn();
    const assets = [hubAsset, hubAdr];

    render(<LibraryOverview assets={assets} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId(`library-overview-node-${hubAsset.id}`));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: hubAsset.id,
        title: hubAsset.title,
        category: hubAsset.category,
        source: 'asset',
      }),
    );

    fireEvent.click(screen.getByTestId(`library-overview-node-${hubAdr.id}`));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: hubAdr.id,
        title: hubAdr.title,
        category: 'adr',
        source: 'asset',
        status: 'accepted',
      }),
    );
  });

  // ── lov-close-band-arc-plaque-reads-epic ─────────────────────────────────────────
  it('lov-close-band-arc-plaque-reads-epic: at the CLOSE band, an arc node\'s plaque reads "epic" via kindLabel, never the raw key "arc"', () => {
    const assets = [arcAsset];

    render(<LibraryOverview assets={assets} onSelect={vi.fn()} />);

    const zoomIn = screen.getByTestId('library-overview-zoom-in');
    // Zoom in repeatedly until the CLOSE band's plaque renders — decoupled from any
    // particular step size, only that repeated zoom-in eventually reaches CLOSE.
    for (let i = 0; i < 10; i++) {
      fireEvent.click(zoomIn);
    }

    const node = screen.getByTestId(`library-overview-node-${arcAsset.id}`);
    expect(within(node).getByText(arcAsset.title)).toBeTruthy();
    const kindEl = screen.getByTestId(`library-overview-node-kind-${arcAsset.id}`);
    expect(kindEl.textContent).toBe('epic');
    expect(kindEl.textContent).not.toBe('arc');
  });
});
