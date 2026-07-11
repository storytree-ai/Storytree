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
//     the WHOLE loaded corpus, taking `assets`/`docs`/`onSelect` as PROPS (no backend seam, no
//     fetch), owning its OWN search input (glows the live-query match set as a `data-glow`
//     marker) and its OWN zoom UI (a zoom-in control that walks the LOD ladder), rendering
//     EXACTLY one element per node at the FAR band (circle for an artifact, square for an ADR,
//     no ambient labels), and lifting a node click into `onSelect` with finder-parity shape
//     (`source: 'asset'` for an artifact, `source: 'doc'` + `category: 'adr'` for an ADR).
//
// NOT pinned here (the story's operator-attested UAT leg, ADR-0070): the forest-cozy palette,
// the 3-tier size sizing, the FAR↔MID↔CLOSE band transition animation, the glow pulse, the
// plaque styling, the circle/square node shapes' visual treatment, and the whole-corpus layout
// aesthetics. No visual/colour/stroke/pixel/animation assertion lives in this file — only the
// degree scoring, the size tiers, the LOD band function, the layout totality + determinism, the
// FAR element-count, the glow marker, the select result, and the no-fetch invariant.
//
// No real fetch/docContent/socket/DB/Electron — the overview holds no backend seam of its own
// (it reads only the `assets`/`docs` already loaded via `useAppData()`, handed in as props).

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
import type { GuidanceAsset, DocMeta } from '../types';

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

function doc(overrides: Partial<DocMeta> & Pick<DocMeta, 'id' | 'title'>): DocMeta {
  return {
    group: 'Decisions',
    excerpt: 'unrelated excerpt text',
    ...overrides,
  };
}

// A shared small fixed corpus:
//   - hubAsset:    a `principle` referenced by leafA and leafB (in-degree 2, out-degree 0).
//   - leafA/leafB: `pattern` assets that each reference the hub (out-degree 1 apiece).
//   - leafC:       a `definition` asset with no references in or out (degree 0, isolated).
//   - arcAsset:    an `arc` asset (for the CLOSE-band kindLabel "epic" trap).
//   - leafD:       a `pattern` asset referencing the hub ADR (contributes to its in-degree).
//   - hubAdr:      an ADR referenced by leafD (in-degree 1; out-degree always 0 — no
//                  `references` field on DocMeta).
//   - quietAdr:    an ADR referenced by nobody (degree 0).
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
  references: ['doc:decisions/0001-hub-decision.md'],
});
const hubAdr = doc({
  id: 'decisions/0001-hub-decision.md',
  title: 'Hub Decision Record',
  status: 'accepted',
});
const quietAdr = doc({
  id: 'decisions/0002-quiet-decision.md',
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
    const importance = importanceOf([hubAsset, leafA, leafB, leafC], []);
    expect(importance.get('hub-asset')).toBe(2);
    expect(importance.get('leaf-a')).toBe(1);
    expect(importance.get('leaf-b')).toBe(1);
    expect(importance.get('leaf-c')).toBe(0);
  });

  it('lov-importance-degree-over-references: an ADR\'s importance is its IN-degree only — out-degree is always 0 (DocMeta carries no references field, load_bearing NOT read)', () => {
    const importance = importanceOf([leafD], [hubAdr, quietAdr]);
    expect(importance.get(hubAdr.id)).toBe(1);
    expect(importance.get(quietAdr.id)).toBe(0);
  });

  it('lov-importance-degree-over-references: every asset and doc id is present in the map (totality)', () => {
    const assets = [hubAsset, leafA, leafB, leafC, leafD];
    const docs = [hubAdr, quietAdr];
    const importance = importanceOf(assets, docs);
    for (const a of assets) expect(importance.has(a.id)).toBe(true);
    for (const d of docs) expect(importance.has(d.id)).toBe(true);
  });
});

describe('sizeTiers', () => {
  // ── lov-size-tier-buckets-by-importance ────────────────────────────────────────
  it('lov-size-tier-buckets-by-importance: buckets importance into exactly 3 tiers, monotonic — the hub lands at least as high as a referencing leaf, which lands at least as high as an isolated leaf', () => {
    const tiers = sizeTiers([hubAsset, leafA, leafC], []);
    for (const t of tiers.values()) expect([0, 1, 2]).toContain(t);
    expect(tiers.get('hub-asset')!).toBeGreaterThanOrEqual(tiers.get('leaf-a')!);
    expect(tiers.get('leaf-a')!).toBeGreaterThanOrEqual(tiers.get('leaf-c')!);
  });

  it('lov-size-tier-buckets-by-importance: assigns a tier to every asset and doc id (totality)', () => {
    const assets = [hubAsset, leafA, leafC];
    const docs = [hubAdr, quietAdr];
    const tiers = sizeTiers(assets, docs);
    expect(tiers.size).toBe(assets.length + docs.length);
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

    const rank: Record<string, number> = { far: 0, mid: 1, close: 2 };
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
  it('lov-layout-total-and-deterministic: assigns a position to every asset+doc node (totality), and is deterministic across two calls over the same corpus', () => {
    const assets = [hubAsset, leafA, leafB, leafC, leafD];
    const docs = [hubAdr, quietAdr];
    const layout1 = constellationLayout(assets, docs, 'overview-seed');
    const layout2 = constellationLayout(assets, docs, 'overview-seed');

    expect(layout1.size).toBe(assets.length + docs.length);
    for (const a of assets) expect(layout1.has(a.id)).toBe(true);
    for (const d of docs) expect(layout1.has(d.id)).toBe(true);

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
    expect(() => constellationLayout([cycleA, cycleB], [], 'seed')).not.toThrow();
    const layout = constellationLayout([cycleA, cycleB], [], 'seed');
    expect(layout.size).toBe(2);
  });
});

describe('glowIds', () => {
  // ── lov-search-glow-matched-set-via-searchcorpus (pure) ──────────────────────────
  it('lov-search-glow-matched-set-via-searchcorpus: returns exactly the ids searchCorpus matches for the query', () => {
    const assets = [hubAsset, leafC];
    const docs = [hubAdr, quietAdr];
    const matched = glowIds('hub', assets, docs);
    const expected = new Set(searchCorpus('hub', assets, docs).map((r) => r.id));
    expect(matched).toEqual(expected);
    expect(matched.has(hubAsset.id)).toBe(true);
    expect(matched.has(hubAdr.id)).toBe(true);
    expect(matched.has(leafC.id)).toBe(false);
  });

  it('lov-search-glow-matched-set-via-searchcorpus: a below-floor (1-char) query glows nothing', () => {
    expect(glowIds('h', [hubAsset], []).size).toBe(0);
  });
});

// ---------- the component ----------

describe('LibraryOverview', () => {
  // ── lov-empty-state-renders-constellation-no-fetch ──────────────────────────────
  it('lov-empty-state-renders-constellation-no-fetch: with no selection, renders the whole loaded corpus as a dot field — never fetches', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const assets = [hubAsset, leafA, leafB, leafC, arcAsset];
    const docs = [hubAdr, quietAdr];

    render(<LibraryOverview assets={assets} docs={docs} onSelect={vi.fn()} />);

    const nodes = screen.getAllByTestId(/^library-overview-node-/);
    expect(nodes).toHaveLength(assets.length + docs.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── lov-far-band-one-element-per-node ─────────────────────────
  it('lov-far-band-one-element-per-node: at the FAR band each node is exactly one element — circle for an artifact, square for an ADR — with no ambient labels', () => {
    const assets = [hubAsset, leafC];
    const docs = [hubAdr];

    render(<LibraryOverview assets={assets} docs={docs} onSelect={vi.fn()} />);

    expect(screen.getAllByTestId(/^library-overview-node-/)).toHaveLength(3);
    expect(screen.getByTestId(`library-overview-node-${hubAsset.id}`).getAttribute('data-shape')).toBe(
      'circle',
    );
    expect(screen.getByTestId(`library-overview-node-${leafC.id}`).getAttribute('data-shape')).toBe(
      'circle',
    );
    expect(screen.getByTestId(`library-overview-node-${hubAdr.id}`).getAttribute('data-shape')).toBe(
      'square',
    );

    // no ambient labels at FAR
    expect(screen.queryByText(hubAsset.title)).toBeNull();
    expect(screen.queryByText(hubAdr.title)).toBeNull();
  });

  // ── lov-search-glow-matched-set-via-searchcorpus (component) ────────────────────
  it('lov-search-glow-matched-set-via-searchcorpus: typing a live query in the overview\'s OWN search input marks matched nodes data-glow, leaves the rest unmarked; a below-floor query glows nothing', () => {
    const assets = [hubAsset, leafC];
    const docs = [hubAdr];

    render(<LibraryOverview assets={assets} docs={docs} onSelect={vi.fn()} />);
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
  it('lov-node-select-yields-searchresult-asset-and-doc: clicking a node lifts onSelect with finder-parity SearchResult shape — asset source "asset", ADR source "doc" category "adr"', () => {
    const onSelect = vi.fn();
    const assets = [hubAsset];
    const docs = [hubAdr];

    render(<LibraryOverview assets={assets} docs={docs} onSelect={onSelect} />);

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
        source: 'doc',
      }),
    );
  });

  // ── lov-close-band-arc-plaque-reads-epic ─────────────────────────────────────────
  it('lov-close-band-arc-plaque-reads-epic: at the CLOSE band, an arc node\'s plaque reads "epic" via kindLabel, never the raw key "arc"', () => {
    const assets = [arcAsset];

    render(<LibraryOverview assets={assets} docs={[]} onSelect={vi.fn()} />);

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
