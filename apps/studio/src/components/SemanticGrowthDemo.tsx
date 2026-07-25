// SemanticGrowthDemo — the query-gated Studio witness stage for the public
// `SemanticGrowthWorldView` player (semantic-growth-studio-demo,
// stories/app-surface/semantic-growth-studio-demo.md).
//
// Mounted ONLY behind the exact `?semanticGrowth=demo` query flag — TreeView.tsx gates the
// mount before any other Studio state, so the clean route and any other value never even
// construct this module's fixture. This is a WITNESS STAGE, not a product controller: the six
// frames below are a fixed, static snapshot of the map's real growth vocabulary —
//   1. empty         — bare coast, no claimed land, no story.
//   2. land           — the plot is claimed ("mapped" ground); no story markers yet.
//   3. proposed       — a pale `proposed` story stands on it.
//   4. claimed        — a real claim/presence wisp (a session working it); status stays
//                        `proposed` — a claim never carries verdict/bloom identity.
//   5. signed-proof   — a real signed-proof: `healthy` status with a fresh landing bloom.
//   6. healthy        — the settled `healthy` status, bloom faded.
// built from the SAME `@storytree/forest-world` scene-graph contract TreeView folds its own
// live world into, so nothing here re-derives status colour, claim colour, or bloom rules — it
// only stages one deterministic instance of them. No fetch, no store read, no subscription, no
// mutation, no clock-driven advance, and no Chapter 2 narration/pacing: the public
// `SemanticGrowthWorldView` owns the player, its Back/Next/Replay controls, and its own
// reduced-motion handling — this file never copies any of that machinery. It only supplies the
// fixture and reuses the sprite sheet + art scale TreeView already resolved.

import {
  buildScene,
  type SceneInput,
  type SceneStatus,
  type SceneTerritoryInput,
  type SceneTrailsInput,
} from '@storytree/forest-world';
import {
  normalizeWorldPresentationModel,
  SemanticGrowthWorldView,
  type SemanticGrowthFrame,
} from '@storytree/app-surface';
import type { SpriteStyleSheet } from '../lib/sprite-sheet.js';

const DEMO_STORY_ID = 'semantic-growth-demo';

const NO_TRAILS: SceneTrailsInput = { segments: [], edges: [], caves: [], dropped: [] };

/** The fixture's fixed island geometry, shared by every claimed-land frame so only the
 *  status/claim/bloom facts change between them (the point of a growth witness: the SAME plot
 *  of ground, staged through its real states). */
const CENTROID = { x: 50, y: 52 };
const TREE_SPOT = { x: 50, y: 46 };
const COAST = ['M 14 22 L 86 22 L 78 78 L 22 78 Z'];

/** A handful of pale coast hexes — "empty ground": land nobody has claimed yet. */
const EMPTY_COAST: SceneInput['empties'] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
];

function territory(
  status: SceneStatus,
  extra?: Partial<SceneTerritoryInput>,
): SceneTerritoryInput {
  return {
    id: DEMO_STORY_ID,
    status,
    caps: 1,
    centroid: CENTROID,
    radius: 26,
    treeSpot: TREE_SPOT,
    labelY: 80,
    coastPaths: COAST,
    decor: [],
    plants: [],
    wisps: [],
    treeTitle: `${DEMO_STORY_ID} — ${status}`,
    plate: {
      w: 70,
      h: 30,
      rx: 7,
      idY: 13,
      subY: 25,
      idText: DEMO_STORY_ID,
      subText: status,
      title: `${DEMO_STORY_ID} — ${status}`,
    },
    ...extra,
  };
}

function frameInput(territories: readonly SceneTerritoryInput[]): SceneInput {
  return {
    offset: { x: 0, y: 0 },
    width: 100,
    height: 100,
    empties: territories.length ? [] : EMPTY_COAST,
    relaxedCells: [],
    drawTiles: [],
    wheatSets: territories.map(() => new Set<string>()),
    trails: NO_TRAILS,
    territories: [...territories],
  };
}

/** The six ordered growth frames the public player requires (`FRAME_KEYS` in
 *  `SemanticGrowthWorldView.tsx`), each built from real semantic identities rather than a
 *  Studio-invented vocabulary. Computed ONCE at module scope — a static fixture, never a
 *  per-render rebuild. */
const FRAMES: readonly SemanticGrowthFrame[] = [
  {
    key: 'empty',
    model: normalizeWorldPresentationModel({ scene: buildScene(frameInput([])) }),
  },
  {
    key: 'land',
    model: normalizeWorldPresentationModel({
      scene: buildScene(frameInput([territory('mapped')])),
    }),
  },
  {
    key: 'proposed',
    model: normalizeWorldPresentationModel({
      scene: buildScene(frameInput([territory('proposed')])),
    }),
  },
  {
    key: 'claimed',
    model: normalizeWorldPresentationModel({
      scene: buildScene(
        frameInput([
          territory('proposed', {
            // A real claim/presence wisp — coordination, never a proof (the ADR-0138 §5 honesty
            // wall the core itself enforces): the status above stays `proposed`, and this claim
            // carries no `bloom`/verdict identity.
            claims: [
              {
                key: 'semantic-growth-demo-session',
                title: `${DEMO_STORY_ID} — a session is working this story · a claim, not a proof`,
                colourState: 'proving',
                grade: 'work',
              },
            ],
          }),
        ]),
      ),
    }),
  },
  {
    key: 'signed-proof',
    model: normalizeWorldPresentationModel({
      scene: buildScene(
        frameInput([territory('healthy', { bloom: { ageRatio: 0, outcome: 'pass' } })]),
      ),
    }),
  },
  {
    key: 'healthy',
    model: normalizeWorldPresentationModel({
      scene: buildScene(frameInput([territory('healthy')])),
    }),
  },
];

export interface SemanticGrowthDemoProps {
  readonly spriteSheet: SpriteStyleSheet | null;
  readonly artScale: number;
}

/**
 * The `?semanticGrowth=demo` witness stage (TreeView.tsx gates the mount, never anything else).
 * Reuses TreeView's already-resolved sprite sheet + art scale on every frame — this component
 * owns no manifest request, resolver, asset, or art policy of its own — and mounts the public
 * player unmodified. Supplies exactly one static fixture, nothing else.
 */
export function SemanticGrowthDemo({
  spriteSheet,
  artScale,
}: SemanticGrowthDemoProps): React.JSX.Element {
  const framesWithArt: readonly SemanticGrowthFrame[] = FRAMES.map((f) => ({
    key: f.key,
    model: { ...f.model, spriteSheet, artScale },
  }));
  return (
    <div className="tree-wrap semantic-growth-demo-host">
      <div className="world-frame">
        <div className="world-viewport" aria-label="semantic growth witness (static fixture)">
          <SemanticGrowthWorldView frames={framesWithArt} />
        </div>
      </div>
    </div>
  );
}
