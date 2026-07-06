// @vitest-environment jsdom
//
// Stage-1 red-green of the studio-only world CHROME overlay (ADR-0093 Unit D): with the shared
// scene-graph now the DEFAULT render, the chrome that lived ONLY in the inline `<g>` — the solar
// spokes (`world.solar.spokes`) and the distributed-consumer building STAMPS (`Territory.stamps`) —
// is layered ON TOP of `<SceneView>` (ADR-0093 Decision 2: studio chrome layers on top, never pushed
// into the shared core). This pins that the overlay still emits both, so the flip to scene-default
// regresses neither. The chrome's PLACEMENT inside the one `<svg>` is wiring (typecheck + the
// operator-attested deep-link); its content is pinned here.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { StudioWorldChrome, type HexWorld } from './TreeView';

afterEach(cleanup);

/** A minimal world with two territories (one carrying stamps); `withSolar` adds the spoke layer
 *  (omitted entirely for the dag-mode case, since `solar` is optional, not nullable). */
function mkWorld(opts: { withSolar?: boolean } = {}): HexWorld {
  const withSolar = opts.withSolar ?? true;
  const base = {
    width: 200,
    height: 200,
    offset: { x: 0, y: 0 },
    empties: [],
    drawTiles: [],
    trails: { segments: [], edges: [], caves: [], dropped: [] },
    territories: [
      {
        story: { id: 'studio', title: 'Studio', status: 'healthy', capabilities: [] },
        tiles: [],
        centroid: { x: 50, y: 50 },
        radius: 30,
        treeSpot: { x: 50, y: 45 },
        caps: [],
        decor: [],
        wheatTiles: new Set<string>(),
        coastPaths: [],
        coastLoops: [],
        labelY: 80,
        // studio carries two identity stamps (library + cli).
        stamps: [
          { icon: 'library', spot: { x: 40, y: 50 } },
          { icon: 'cli', spot: { x: 60, y: 50 } },
        ],
        buildingGlyph: false,
      },
      {
        story: { id: 'cli', title: 'Cli', status: 'healthy', capabilities: [] },
        tiles: [],
        centroid: { x: 150, y: 50 },
        radius: 30,
        treeSpot: { x: 150, y: 45 },
        caps: [],
        decor: [],
        wheatTiles: new Set<string>(),
        coastPaths: [],
        coastLoops: [],
        labelY: 80,
        stamps: [],
        buildingGlyph: false,
      },
    ],
    ...(withSolar
      ? {
          solar: {
            center: { x: 100, y: 100 },
            rings: [],
            spokes: [
              { from: 'cli', to: 'library', d: 'M 0 0 L 10 10' },
              { from: 'studio', to: 'library', d: 'M 5 5 L 15 15' },
            ],
          },
        }
      : {}),
  } as unknown as HexWorld;
  return base;
}

function renderChrome(world: HexWorld, onStampClick = vi.fn()): HTMLElement {
  const { container } = render(
    <svg>
      <StudioWorldChrome world={world} hidden={new Set()} onStampClick={onStampClick} />
    </svg>,
  );
  return container;
}

describe('StudioWorldChrome — the on-top studio chrome overlay', () => {
  it('renders the solar spokes when the world is in solar mode', () => {
    const root = renderChrome(mkWorld());
    expect(root.querySelector('.solar-spoke-net')).toBeTruthy();
    expect(root.querySelectorAll('.solar-spoke').length).toBe(2);
  });

  it('omits the spoke net when there is no solar layer (dag mode)', () => {
    const root = renderChrome(mkWorld({ withSolar: false }));
    expect(root.querySelector('.solar-spoke-net')).toBeNull();
  });

  it('renders the distributed-consumer building stamps each island carries', () => {
    const root = renderChrome(mkWorld());
    // studio carries two stamps; cli carries none → exactly two stamps in the overlay.
    expect(root.querySelectorAll('.story-icon-stamp').length).toBe(2);
  });

  it('renders the per-nameplate identity-key glyph for every island (parity with the legacy render)', () => {
    // ADR-0102: each island shows its OWN identity building beside its name tag — studio chrome the
    // inline/legacy path drew but the shared scene-graph does NOT, so the default flip must restore
    // it or a familiar element regresses. One key glyph per territory (two here).
    const root = renderChrome(mkWorld());
    const keys = root.querySelectorAll('.world-plate-key');
    expect(keys.length).toBe(2);
    // each key wraps a real IconGlyph (the .story-icon-art body), not an empty group.
    expect(keys[0]?.querySelector('.story-icon-art')).toBeTruthy();
  });

  it('a stamp click highlights the shared island it names (onStampClick wired through)', () => {
    const onStampClick = vi.fn();
    const root = renderChrome(mkWorld(), onStampClick);
    const stamp = root.querySelector('.story-icon-stamp.is-link');
    expect(stamp).toBeTruthy();
    fireEvent.click(stamp!);
    expect(onStampClick).toHaveBeenCalledTimes(1);
    // it names one of the carried building ids.
    expect(['library', 'cli']).toContain(onStampClick.mock.calls[0]?.[0]);
  });
});
