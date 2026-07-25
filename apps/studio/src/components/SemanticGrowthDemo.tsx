// SemanticGrowthDemo — the query-gated Studio witness stage for the public
// `SemanticGrowthWorldView` player (semantic-growth-studio-demo,
// stories/app-surface/semantic-growth-studio-demo.md).
//
// Mounted ONLY behind the exact `?semanticGrowth=demo` query flag — TreeView.tsx gates the
// mount before any other Studio state, so the clean route and any other value never even
// construct this module's fixture. This is a WITNESS STAGE, not a product controller: the six
// frames below stage the map's real growth vocabulary —
//   1. empty         — no claimed land, no story.
//   2. land           — the plot is claimed ("mapped" ground); no story markers yet.
//   3. proposed       — a pale `proposed` story stands on it, with its real capability parcels.
//   4. claimed        — a real claim/presence wisp (a session working it); status stays
//                        `proposed` — a claim never carries verdict/bloom identity.
//   5. signed-proof   — still `proposed`/non-healthy, carrying the real signed-proof bloom.
//   6. healthy        — the settled `healthy` status, bloom faded.
//
// Every frame is folded through the SAME real Studio world pipeline TreeView.tsx uses for the
// live map: deterministic representative story/capability data enters `buildWorld`, its real
// draw tiles enter `buildRelaxedCells`, and `worldToScene` (carrying the same permanent
// vegetation input) feeds `buildScene` — never a hand-authored scene-input shape, coast path, or
// hand-filled empty geometry array. No fetch, no store read, no subscription, no mutation, no
// clock-driven advance, and no Chapter 2 narration/pacing: the public `SemanticGrowthWorldView`
// owns the player, its Back/Next/Replay controls, its own reduced-motion handling, and (via its
// co-located stylesheet) the entrance/orbit/bloom motion itself — this file never copies any of
// that machinery, nor authors a transform/keyframe/animation selector of its own. It only
// supplies the fixture and reuses the sprite sheet + art scale TreeView already resolved.

import {
  buildScene,
  type SceneG,
  type SceneKind,
  type SceneNode,
  type SceneVegetationInput,
} from '@storytree/forest-world';
import {
  normalizeWorldPresentationModel,
  SemanticGrowthWorldView,
  type SemanticGrowthFrame,
} from '@storytree/app-surface';
import { buildWorld, buildRelaxedCells, worldToScene, type HexWorld } from './TreeView.js';
import type {
  BuildActivity,
  ClaimActivity,
  DepartedClaim,
  TreeCapability,
  TreeStory,
  TreeVerdict,
  WorkStatus,
} from '../types.js';
import type { SpriteStyleSheet } from '../lib/sprite-sheet.js';

/** The fixture's one representative story id + its two capability ids — enough for the real
 *  pipeline to grow a multi-tile territory with more than one capability parcel. */
const DEMO_STORY_ID = 'semantic-growth-demo';
const DEMO_CAP_ALPHA_ID = 'semantic-growth-demo-cap-alpha';
const DEMO_CAP_BETA_ID = 'semantic-growth-demo-cap-beta';

/** A fixed instant, never `Date.now()`, so the walk (and its signed-proof bloom) stays
 *  byte-identical across every render/re-mount. */
const NOW = new Date('2026-01-01T00:00:00.000Z');

function demoCapability(id: string, testCount: number, status: WorkStatus): TreeCapability {
  return {
    id,
    title: id,
    outcome: `${id} — a representative capability for the semantic-growth witness`,
    status,
    proofMode: 'contract',
    dependsOn: [],
    testCount,
  };
}

/** One representative story, varied only by the lifecycle facts a real `/api/tree` payload
 *  would vary over time (status + verdict) — its id/capabilities stay fixed so `buildWorld`
 *  grows the exact same territory every time it's called. */
function demoStory(status: WorkStatus, verdict?: TreeVerdict): TreeStory {
  const capStatus: WorkStatus = status === 'healthy' ? 'healthy' : 'proposed';
  return {
    id: DEMO_STORY_ID,
    title: 'Semantic growth witness',
    outcome: 'stages the semantic-growth vocabulary through the real Studio world pipeline',
    status,
    proofMode: 'UAT',
    uatWitness: 'machine',
    dependsOn: [],
    consumedBy: [],
    capabilities: [
      demoCapability(DEMO_CAP_ALPHA_ID, 6, capStatus),
      demoCapability(DEMO_CAP_BETA_ID, 5, capStatus),
    ],
    ...(verdict ? { verdict } : {}),
  };
}

/** The unified vegetation vocabulary, PRESENT but with no fetched tree colourway (the demo
 *  performs no fetch) — the same resting shape `useVegetation` in TreeView.tsx starts every
 *  session at, before its hero-tree colourways resolve. */
const VEGETATION: SceneVegetationInput = {};

const NO_BUILDS: Map<string, BuildActivity[]> = new Map();
const NO_CLAIMS: Map<string, ClaimActivity[]> = new Map();
const NO_DEPARTURES: Map<string, DepartedClaim[]> = new Map();

/**
 * Recursively drop every drawable of the given `kind` from a built scene (and its descendants).
 * `buildTerritoryFlora` always wraps a territory's tree + nameplate + parcel flora + claim/
 * departure wisps in one `kind: 'territory'` group — the only way to stage claimed ground with
 * no story identity yet (the `land` frame) is to grow the real per-territory scene through the
 * normal pipeline and then remove that one identity group, never by hand-deriving the ground
 * geometry or copying forest-world's internals.
 */
function stripKind(node: SceneNode, kind: SceneKind): SceneNode {
  if (node.el !== 'g') return node;
  return {
    ...node,
    children: node.children.filter((c) => c.kind !== kind).map((c) => stripKind(c, kind)),
  };
}

/** The claim/presence wisp for the `claimed` frame — coordination, never a proof (the ADR-0138
 *  §5 honesty wall the core itself enforces): the story's own status stays `proposed`, and this
 *  claim carries no bloom/verdict identity of its own. */
const DEMO_CLAIM: ClaimActivity = {
  unitId: DEMO_STORY_ID,
  kind: 'claim',
  sessionId: 'semantic-growth-demo-session',
  branch: 'claude/demo-real',
  intent: 'real',
  grade: 'work',
  at: NOW.toISOString(),
};

/**
 * Fold the fixture into the six ordered growth frames the public player requires (`FRAME_KEYS`
 * in `SemanticGrowthWorldView.tsx`). Deliberately NOT run at this module's own top level: this
 * file and TreeView.tsx import each other (TreeView.tsx mounts this component; this component
 * composes through TreeView's exported `buildWorld`/`buildRelaxedCells`/`worldToScene`), so
 * calling into `buildWorld` while either module is still mid-evaluation would reach one of
 * TreeView's own not-yet-initialized module-scope constants. Called lazily (see {@link frames}),
 * well after the whole module graph has finished loading — every real call below still happens
 * exactly once, the static fixture is still frozen the first time it's needed, never rebuilt
 * per render.
 */
function buildFrames(): readonly SemanticGrowthFrame[] {
  // The one composed, real world every claimed-land frame reuses: `buildWorld` grows its
  // territory from `demoStory`'s id/capabilities (status-independent geometry), so the tiles,
  // coastline, and capability-parcel layout below are the SAME real geometry across every frame
  // — only the story object's status/verdict/claims vary per frame.
  const baseWorld: HexWorld = buildWorld([demoStory('proposed')], { buildings: false });
  const relaxedCells = buildRelaxedCells(baseWorld, 'mesh', {});

  // Swap the composed world's one territory onto a differently-lifecycled story object without
  // touching any of its already-grown geometry (tiles/centroid/coastline/capability spots) —
  // exactly the fact a live `/api/tree` re-poll would vary over time.
  const worldWithStory = (story: TreeStory): HexWorld => ({
    ...baseWorld,
    territories: baseWorld.territories.map((t) => ({ ...t, story })),
  });

  const sceneForStory = (story: TreeStory, claims: readonly ClaimActivity[] = []): SceneG => {
    const claimsByStory: Map<string, ClaimActivity[]> = claims.length
      ? new Map([[story.id, [...claims]]])
      : NO_CLAIMS;
    return buildScene(
      worldToScene(
        worldWithStory(story),
        relaxedCells,
        NOW,
        NO_BUILDS,
        claimsByStory,
        NO_DEPARTURES,
        null,
        null,
        VEGETATION,
      ),
    );
  };

  // No claimed land, no story at all — its own real (empty) composition through the exact same
  // pipeline, never a hand-filled substitute.
  const emptyWorld: HexWorld = buildWorld([], { buildings: false });
  const emptyRelaxedCells = buildRelaxedCells(emptyWorld, 'mesh', {});
  const emptyScene = (): SceneG =>
    buildScene(
      worldToScene(
        emptyWorld,
        emptyRelaxedCells,
        NOW,
        NO_BUILDS,
        NO_CLAIMS,
        NO_DEPARTURES,
        null,
        null,
        VEGETATION,
      ),
    );

  return [
    {
      key: 'empty',
      model: normalizeWorldPresentationModel({ scene: emptyScene() }),
    },
    {
      // "the plot is claimed; no story markers yet" — the real ground/coast/substrate renders
      // through the normal per-territory pipeline, then the one `territory` identity group is
      // stripped, so no nameplate/tree/parcel-flora appears until `proposed`.
      key: 'land',
      model: normalizeWorldPresentationModel({
        scene: stripKind(sceneForStory(demoStory('mapped')), 'territory'),
      }),
    },
    {
      key: 'proposed',
      model: normalizeWorldPresentationModel({ scene: sceneForStory(demoStory('proposed')) }),
    },
    {
      key: 'claimed',
      model: normalizeWorldPresentationModel({
        scene: sceneForStory(demoStory('proposed'), [DEMO_CLAIM]),
      }),
    },
    {
      // Still `proposed`/non-healthy — a signed verdict alone never flips authored status (the
      // real map only greens the crown once the story's OWN status is healthy, ADR-0040) — this
      // frame carries the real signed-proof bloom (a fresh pass verdict, `verdictBloom`'s own
      // rule) while staying honest about status.
      key: 'signed-proof',
      model: normalizeWorldPresentationModel({
        scene: sceneForStory(demoStory('proposed', { outcome: 'pass', at: NOW.toISOString() })),
      }),
    },
    {
      key: 'healthy',
      model: normalizeWorldPresentationModel({ scene: sceneForStory(demoStory('healthy')) }),
    },
  ];
}

let framesCache: readonly SemanticGrowthFrame[] | null = null;

/** The static fixture, computed once on first use and cached — never at this module's own
 *  top level (see {@link buildFrames}), never rebuilt afterward. */
function frames(): readonly SemanticGrowthFrame[] {
  if (!framesCache) framesCache = buildFrames();
  return framesCache;
}

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
  const framesWithArt: readonly SemanticGrowthFrame[] = frames().map((f) => ({
    key: f.key,
    model: { ...f.model, spriteSheet, artScale },
  }));
  return (
    <div className="tree-wrap semantic-growth-demo-host">
      <div className="tree-layout">
        <div className="world-frame">
          <div className="world-viewport" aria-label="semantic growth witness (static fixture)">
            <SemanticGrowthWorldView frames={framesWithArt} />
          </div>
        </div>
      </div>
    </div>
  );
}
