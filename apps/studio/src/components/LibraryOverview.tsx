/**
 * LibraryOverview — the empty-state, whole-corpus dot field (ADR-0185 dec 4, increment 5 of the
 * library-tech-tree-overlay story).
 *
 * With no selection, the whole loaded corpus renders as a constellation of dots laid out by the
 * pure `overviewConstellation` module (`../lib/overviewConstellation`), one element per node at
 * the FAR level of detail: one circle per artifact, sized by its 3-tier importance bucket, with NO
 * ambient labels (the perf/LOD contract — the whole corpus stays one element per node at FAR).
 * Zooming in walks the LOD ladder: MID surfaces top-tier labels, CLOSE renders a two-line
 * kind-in-node plaque (title + `kindLabel`, never a hand-rolled category-label map — ADR-0183 D1).
 *
 * ★ IT DRAWS ARTIFACTS ONLY (ADR-0403 dec 1). It used to add a SQUARE per `/api/docs` entry,
 * lifting `source: 'doc'` + `category: 'adr'`, because a decision was a file under
 * `docs/decisions/`. PR #1546 deleted that subtree, which left those squares standing for the 113
 * surviving REFERENCE documents while every real decision was ALREADY drawn as a circle out of
 * `assets` — so the square was no longer a decision and the label was no longer true. The `shape`
 * branch is kept: `source` still discriminates, and a doc reached by cross-link would still draw
 * as a square if one were ever handed in.
 *
 * The component owns its OWN search input (search-glow option A — it does NOT lift the finder's
 * byte-locked internal query): as the query changes, `glowIds` marks each matched node with a
 * `data-glow` marker (never a hand-rolled highlight — the pulse animation is the operator-attested
 * look, ADR-0070). Clicking a node lifts an `onSelect(result)` call built with finder parity —
 * `source: 'asset'` and the artifact's own `category` — seeding the SAME shared `librarySelection`
 * the finder/subgraph/dive lift into.
 *
 * No fetch: this is the empty-state entry surface, reading only the `assets` already loaded via
 * `useAppData()` and handed in as props — never `docContent`, `fetch`, or a socket (the same
 * data-boundary discipline whose real-data crash the increment-3 staging walk caught).
 *
 * The dot field's palette, size sizing, band-transition animation, glow pulse, plaque styling, and
 * whole-corpus layout aesthetics are the story's operator-attested UAT leg (ADR-0185 dec 5/6,
 * ADR-0070) — not asserted here; only geometry (degree, tiers, band, layout totality/determinism,
 * FAR element-count, glow marker, select result, no-fetch) is machine-witnessed.
 */

import { useMemo, useState } from 'react';
import {
  constellationLayout,
  glowIds,
  lodBand,
  sizeTiers,
  type SizeTier,
} from '../lib/overviewConstellation';
import { kindLabel, useArcDisplay } from '../lib/kindDisplay';
import { assetResult, type SearchResult } from '../lib/librarySearch';
import type { GuidanceAsset } from '../types';

export interface LibraryOverviewProps {
  assets: GuidanceAsset[];
  /** Invoked with the clicked node's finder-parity result — the overview lifts, never owns. */
  onSelect: (result: SearchResult) => void;
  /** Invoked with a double-clicked node's finder-parity result — additive to `onSelect`. */
  onOpen?: (result: SearchResult) => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1;
const DEFAULT_ZOOM = 1;

const LAYOUT_SEED = 'library-overview';

/** Circle/square radius (px) for a size tier — geometry only, never the visual treatment. */
function radiusFor(tier: SizeTier): number {
  return 6 + tier * 4;
}

/** The Library overview: the whole-corpus, empty-state constellation dot field. */
export function LibraryOverview({ assets, onSelect, onOpen }: LibraryOverviewProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const arcDisplay = useArcDisplay();

  const layout = useMemo(() => constellationLayout(assets, LAYOUT_SEED), [assets]);
  const tiers = useMemo(() => sizeTiers(assets), [assets]);
  const glow = useMemo(() => glowIds(query, assets), [query, assets]);
  const band = lodBand(zoom);

  const nodes: SearchResult[] = useMemo(() => assets.map(assetResult), [assets]);

  function renderNode(node: SearchResult): React.JSX.Element {
    const pos = layout.get(node.id) ?? { x: 0, y: 0 };
    const shape = node.source === 'doc' ? 'square' : 'circle';
    const tier = tiers.get(node.id) ?? 0;
    const r = radiusFor(tier);
    const glowing = glow.has(node.id);

    return (
      <g
        key={node.id}
        className="library-overview-node"
        data-testid={`library-overview-node-${node.id}`}
        data-shape={shape}
        data-tier={tier}
        data-band={band}
        data-glow={glowing ? 'true' : undefined}
        transform={`translate(${pos.x}, ${pos.y})`}
        onClick={() => onSelect(node)}
        onDoubleClick={() => onOpen?.(node)}
      >
        {shape === 'circle' ? (
          <circle className="library-overview-node-shape" r={r} />
        ) : (
          <rect className="library-overview-node-shape" x={-r} y={-r} width={r * 2} height={r * 2} />
        )}

        {band === 'mid' && tier === 2 && (
          <text
            className="library-overview-node-label"
            data-testid={`library-overview-node-label-${node.id}`}
          >
            {node.title}
          </text>
        )}

        {band === 'close' && (
          <>
            <text className="library-overview-node-title">{node.title}</text>
            <text
              className="library-overview-node-kind"
              data-testid={`library-overview-node-kind-${node.id}`}
            >
              {kindLabel(node.category, arcDisplay)}
            </text>
          </>
        )}
      </g>
    );
  }

  return (
    <div className="library-overview" data-testid="library-overview">
      <div className="library-overview-controls">
        <input
          type="text"
          className="library-overview-search"
          aria-label="Search the whole library"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="library-overview-zoom">
          <button
            type="button"
            data-testid="library-overview-zoom-out"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
          >
            −
          </button>
          <span data-testid="library-overview-zoom-value">{band}</span>
          <button
            type="button"
            data-testid="library-overview-zoom-in"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
          >
            +
          </button>
        </div>
      </div>

      <svg className="library-overview-field" data-testid="library-overview-field" data-band={band}>
        {nodes.map(renderNode)}
      </svg>
    </div>
  );
}
