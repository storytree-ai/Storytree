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
  CHAPTER2_ORGANIC_POSE_TO_POSE_REGISTRY,
  CHAPTER2_SOCKET_CHOREOGRAPHY,
  neighbourHighlightPlan,
  laneLayout,
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

/** The fixed COMPANION witness territory (H — sgsd-companion-witness-territory): a second story
 *  composed through the exact same real pipeline, byte-stable across all six frames. It never
 *  narrates the primary's health walk (no claim, no verdict/bloom) — it exists only so the demo
 *  ALSO exercises the renderer's no-parcel `buildTerritoryFlora` path (a real procedural
 *  `story-tree` + capability `garden-flora`), which the primary's parcels-present territory never
 *  takes. */
const COMPANION_STORY_ID = 'semantic-growth-demo-companion';
const COMPANION_CAP_ID = 'semantic-growth-demo-companion-cap';
const ORGANIC_TREE_SCALE = 0.34;
const ORGANIC_PLANT_SCALE = 0.3;

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
    // sgsd-primary-selection-reuses-drawn-route-lanes: a real `depends_on` edge onto the fixed
    // companion, so the composed world's REAL trail network (`buildWorld` -> `storyEdges` ->
    // `routeTrails`) actually routes a road between the two territories — never an invented
    // lane. The companion is the dependency (`from`), the primary the dependent (`to`); the
    // companion never narrates the primary's health walk regardless of this edge.
    dependsOn: [COMPANION_STORY_ID],
    consumedBy: [],
    capabilities: [
      demoCapability(DEMO_CAP_ALPHA_ID, 6, capStatus),
      demoCapability(DEMO_CAP_BETA_ID, 5, capStatus),
    ],
    ...(verdict ? { verdict } : {}),
  };
}

/** The fixed companion story, identical on every call — never varied by frame (the primary is the
 *  only story whose status/verdict/claims change across the walk). One capability is enough for
 *  the real pipeline to grow its own tree + capability plant. */
const COMPANION_STORY: TreeStory = {
  id: COMPANION_STORY_ID,
  title: 'Semantic growth companion',
  outcome: 'a fixed witness territory carried alongside the primary story’s six-state walk',
  status: 'healthy',
  proofMode: 'UAT',
  uatWitness: 'machine',
  dependsOn: [],
  consumedBy: [],
  capabilities: [demoCapability(COMPANION_CAP_ID, 4, 'healthy')],
};

/** The unified vegetation vocabulary, PRESENT but with no fetched tree colourway (the demo
 *  performs no fetch) — the same resting shape `useVegetation` in TreeView.tsx starts every
 *  session at, before its hero-tree colourways resolve. */
const VEGETATION: SceneVegetationInput = {};

const NO_BUILDS: Map<string, BuildActivity[]> = new Map();
const NO_CLAIMS: Map<string, ClaimActivity[]> = new Map();
const NO_DEPARTURES: Map<string, DepartedClaim[]> = new Map();

/**
 * Recursively drop drawables of the given `kind` from a built scene (and its descendants), scoped
 * to the territory whose id is `scopeId` — SOURCE-LOCAL / id-scoped, never a bare `(node, kind)`
 * global strip (that would remove every territory it finds, including the companion's own
 * identity group, which the H proof forbids).
 *
 * Two real uses fold through this one helper:
 *  - `stripKind(scene, 'territory', primaryId)` drops the primary's WHOLE identity group (tree +
 *    nameplate + parcel flora + claim/departure wisps) wherever it sits in the tree — the only way
 *    to stage claimed ground with no story identity yet (the `land` frame) is to grow the real
 *    per-territory scene through the normal pipeline and then remove that one identity group,
 *    never by hand-deriving the ground geometry or copying forest-world's internals.
 *  - `stripKind(scene, 'plate', COMPANION_STORY_ID)` drops only the nameplate NESTED inside the
 *    companion's own `territory` group (once inside that group every `plate` descendant is
 *    scoped-matched) — the companion is witness context, never a narrated nameplate, on every
 *    frame.
 */
function stripKind(node: SceneNode, kind: SceneKind, scopeId: string, inScope = false): SceneNode {
  if (node.el !== 'g') return node;
  const hereInScope = inScope || (node.kind === 'territory' && node.id === scopeId);
  return {
    ...node,
    children: node.children
      .filter((c) => !(c.kind === kind && (c.id === scopeId || hereInScope)))
      .map((c) => stripKind(c, kind, scopeId, hereInScope)),
  };
}

/**
 * Drop only the primary's real GROUND wrapper's `data-story-id`/`hex-territory[data-story-id]`
 * identity tag — never removing the node or any of its real substrate/parcel/parcel-flora content
 * — so the one real ground group a `land`-onward frame keeps visible never double-counts as a
 * second clickable "territory" alongside the primary's own `territory` identity group (forest-
 * world's shared `ground`/`territory`/`coast` kinds all fold through the SAME
 * `hex-territory st-<status>` class + `data-story-id` stamp, ADR-0093 §4 — one story reads as one
 * territory everywhere else on the map because there both groups always share ONE fate; the demo's
 * `land` frame is the one place that deliberately keeps the ground while stripping the identity, so
 * it alone must undo the extra count without touching real content). Source-local, id-scoped —
 * never a global class/attribute rewrite, never touching app-surface/SceneView.
 */
function clearGroundIdentity(node: SceneNode, primaryId: string): SceneNode {
  if (node.el !== 'g') return node;
  const children = node.children.map((c) => clearGroundIdentity(c, primaryId));
  if (node.kind === 'ground' && node.id === primaryId) {
    const { id: _primaryGroundId, ...rest } = node;
    return { ...rest, children };
  }
  return { ...node, children };
}

/**
 * Retire only the primary territory's app-drawn organic material for the pose experiment.
 * Coast, ground, parcels, hit geometry, plate, proof and presence remain the real SVG scene.
 */
function withoutPrimaryVectorOrganic(
  node: SceneNode,
  inPrimaryTerritory = false,
  includeConifers = false,
): SceneNode {
  if (node.el !== 'g') return node;
  const inPrimary =
    inPrimaryTerritory || (node.kind === 'territory' && node.id === DEMO_STORY_ID);
  return {
    ...node,
    children: node.children
      .filter(
        (child) =>
          !(
            inPrimary &&
            (child.kind === 'tree' ||
              child.kind === 'flora' ||
              child.kind === 'parcel-flora' ||
              child.kind === 'baked-art' ||
              (includeConifers && child.kind === 'conifer'))
          ),
      )
      .map((child) => withoutPrimaryVectorOrganic(child, inPrimary, includeConifers)),
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
function buildFrames(
  preservePrimaryGroundIdentity = false,
): readonly SemanticGrowthFrame[] {
  // ONE composed, real world every frame reuses — the primary AND the fixed companion both enter
  // `buildWorld` together (H — sgsd-composed-through-real-studio-world-pipeline /
  // sgsd-companion-witness-territory), so the tiles, coastline, and capability layout below are
  // the SAME real geometry across every frame; only the primary story object's status/verdict/
  // claims vary per frame — the companion's story object never changes.
  // The primary enters FIRST (index 0) so every real per-territory layer (coast/ground/territory)
  // draws the primary before the companion — the DOM-order fact the "signed-proof"/"healthy"
  // regression floor above relies on (`flagged.querySelector('.hex-territory')`, unscoped, must
  // resolve to the PRIMARY's own status, never the companion's fixed `healthy` one).
  const baseWorld: HexWorld = buildWorld([demoStory('proposed'), COMPANION_STORY], {
    buildings: false,
  });
  const companionIndex = baseWorld.territories.findIndex((t) => t.story.id === COMPANION_STORY_ID);
  const primary = baseWorld.territories.find((t) => t.story.id === DEMO_STORY_ID);
  if (!primary) throw new Error('Semantic growth fixture requires its primary planted parcel.');
  const plant = primary.caps[0];
  if (!plant) throw new Error('Semantic growth fixture requires its bounded plant socket.');
  organicPoseSocketsCache = {
    tree: Object.freeze({ x: primary.treeSpot.x, y: primary.treeSpot.y }),
    plant: Object.freeze({ x: plant.x, y: plant.y }),
    island: Object.freeze({
      storyId: DEMO_STORY_ID,
      worldAnchor: Object.freeze({
        x: primary.centroid.x,
        y: primary.centroid.y,
      }),
      radius: Object.freeze({
        x: primary.radius * 1.32,
        y: primary.radius * 0.96,
      }),
    }),
  };

  // sgsd-primary-selection-reuses-drawn-route-lanes: the primary's one-hop selection plan +
  // laid-out lane, derived from the composed world's REAL trail network with the SAME shared
  // helpers the live map uses — never a demo-local path, segment renderer, or CSS animation.
  // Computed once (the network is fixed across every frame); threaded onto only the frames
  // where the primary's own identity narrates (see {@link narrativeModel} below).
  const neighbourPlan = neighbourHighlightPlan(baseWorld.trails, DEMO_STORY_ID);
  const primaryLanes = laneLayout(baseWorld.trails, neighbourPlan, {
    hand: 'auto',
    roundabouts: true,
  });

  const rawRelaxedCells = buildRelaxedCells(baseWorld, 'mesh', {});
  // The SOLE allowed filtering (H): deterministic removal of the real `buildRelaxedCells` output
  // OWNED by the fixed companion territory — never a hand-authored replacement — so the companion
  // owns zero substrate cells and the renderer's existing NO-PARCEL `buildTerritoryFlora` path
  // takes over for it (a real procedural `story-tree` + capability `garden-flora`). Every
  // primary-owned cell is retained untouched.
  const relaxedCells = rawRelaxedCells.filter((c) => c.owner !== companionIndex);

  // Swap the composed world's PRIMARY territory onto a differently-lifecycled story object without
  // touching any of its already-grown geometry (tiles/centroid/coastline/capability spots), or the
  // companion's — exactly the fact a live `/api/tree` re-poll would vary over time for the primary
  // only, while the companion sits byte-stable as witness context.
  const worldWithPrimaryStory = (story: TreeStory): HexWorld => ({
    ...baseWorld,
    territories: baseWorld.territories.map((t) => (t.story.id === DEMO_STORY_ID ? { ...t, story } : t)),
  });

  const sceneForStory = (story: TreeStory, claims: readonly ClaimActivity[] = []): SceneG => {
    const claimsByStory: Map<string, ClaimActivity[]> = claims.length
      ? new Map([[DEMO_STORY_ID, [...claims]]])
      : NO_CLAIMS;
    return buildScene(
      worldToScene(
        worldWithPrimaryStory(story),
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

  // The companion is witness context, never a narrated nameplate — its `plate` is stripped by id
  // on every single frame (source-local, id-scoped; see {@link stripKind}).
  const withoutCompanionPlate = (scene: SceneNode): SceneNode =>
    stripKind(scene, 'plate', COMPANION_STORY_ID);

  // "no claimed land, no story at all" for the PRIMARY — its whole identity group AND its real
  // ground/coast are stripped (id-scoped to the primary only), so only the companion's own
  // territory/ground/coast remain visible. Grown through the exact same real per-territory
  // pipeline as every other frame, never a separate hand-composed empty world.
  const emptyScene = (): SceneNode => {
    const scene = sceneForStory(demoStory('mapped'));
    const noPrimaryTerritory = stripKind(scene, 'territory', DEMO_STORY_ID);
    const noPrimaryGround = stripKind(noPrimaryTerritory, 'ground', DEMO_STORY_ID);
    const noPrimaryCoast = stripKind(noPrimaryGround, 'coast', DEMO_STORY_ID);
    return withoutCompanionPlate(noPrimaryCoast);
  };

  // "the plot is claimed; no story markers yet" — the real coast/ground/substrate renders through
  // the normal per-territory pipeline (kept visible — this frame's whole point), then the
  // primary's own `territory` identity group is stripped (id-scoped, so the companion's identity
  // survives) and its real ground's identity tag is cleared (content stays, {@link
  // clearGroundIdentity}) so no nameplate/tree/parcel-flora appears for the primary until
  // `proposed`.
  const landScene = (): SceneNode => {
    const scene = sceneForStory(demoStory('mapped'));
    const noPrimaryTerritory = stripKind(scene, 'territory', DEMO_STORY_ID);
    return withoutCompanionPlate(
      preservePrimaryGroundIdentity
        ? noPrimaryTerritory
        : clearGroundIdentity(noPrimaryTerritory, DEMO_STORY_ID),
    );
  };

  // `proposed`/`claimed`/`signed-proof`/`healthy`: the primary's identity group stays — only its
  // ground's identity tag is cleared (its real substrate/parcels/parcel-flora content untouched)
  // so it never double-counts alongside the primary's own `territory` group.
  const narrativeScene = (story: TreeStory, claims: readonly ClaimActivity[] = []): SceneNode =>
    withoutCompanionPlate(
      preservePrimaryGroundIdentity
        ? sceneForStory(story, claims)
        : clearGroundIdentity(sceneForStory(story, claims), DEMO_STORY_ID),
    );

  // Only once the primary's own identity narrates (`proposed` onward) does its real drawn route
  // reach the shared renderer as a lit lane — `empty`/`land` carry no primary identity yet, so
  // they stay off the real one-hop plan/layout entirely (`neighbours`/`lanes` default null).
  const narrativeModel = (
    story: TreeStory,
    claims: readonly ClaimActivity[] = [],
  ): ReturnType<typeof normalizeWorldPresentationModel> =>
    normalizeWorldPresentationModel({
      scene: narrativeScene(story, claims),
      neighbours: neighbourPlan,
      lanes: primaryLanes,
      laneMotion: 'draw',
    });

  return [
    {
      key: 'empty',
      model: normalizeWorldPresentationModel({ scene: emptyScene() }),
    },
    {
      key: 'land',
      model: normalizeWorldPresentationModel({ scene: landScene() }),
    },
    {
      key: 'proposed',
      model: narrativeModel(demoStory('proposed')),
    },
    {
      key: 'claimed',
      model: narrativeModel(demoStory('proposed'), [DEMO_CLAIM]),
    },
    {
      // Still `proposed`/non-healthy — a signed verdict alone never flips authored status (the
      // real map only greens the crown once the story's OWN status is healthy, ADR-0040) — this
      // frame carries the real signed-proof bloom (a fresh pass verdict, `verdictBloom`'s own
      // rule) while staying honest about status.
      key: 'signed-proof',
      model: narrativeModel(demoStory('proposed', { outcome: 'pass', at: NOW.toISOString() })),
    },
    {
      key: 'healthy',
      model: narrativeModel(demoStory('healthy')),
    },
  ];
}

let framesCache: readonly SemanticGrowthFrame[] | null = null;
let organicPoseFramesCache: readonly SemanticGrowthFrame[] | null = null;
let organicPoseSocketsCache: {
  readonly tree: { readonly x: number; readonly y: number };
  readonly plant: { readonly x: number; readonly y: number };
  readonly island: {
    readonly storyId: string;
    readonly worldAnchor: { readonly x: number; readonly y: number };
    readonly radius: { readonly x: number; readonly y: number };
  };
} | null = null;

/** The static fixture, computed once on first use and cached — never at this module's own
 *  top level (see {@link buildFrames}), never rebuilt afterward. */
function frames(): readonly SemanticGrowthFrame[] {
  if (!framesCache) framesCache = buildFrames();
  return framesCache;
}

function organicPoseFrames(): readonly SemanticGrowthFrame[] {
  if (!organicPoseFramesCache) organicPoseFramesCache = buildFrames(true);
  return organicPoseFramesCache;
}

function organicPoseSockets(): NonNullable<typeof organicPoseSocketsCache> {
  organicPoseFrames();
  if (!organicPoseSocketsCache) {
    throw new Error('Semantic growth fixture did not register its organic sockets.');
  }
  return organicPoseSocketsCache;
}

export interface SemanticGrowthDemoProps {
  readonly spriteSheet: SpriteStyleSheet | null;
  readonly artScale: number;
  readonly variant?: 'demo' | 'organic-pose-to-pose' | 'socket-choreography';
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
  variant = 'demo',
}: SemanticGrowthDemoProps): React.JSX.Element {
  const poseVariant = variant === 'organic-pose-to-pose';
  const socketVariant = variant === 'socket-choreography';
  const sourceFrames = poseVariant ? organicPoseFrames() : frames();
  const sockets = poseVariant || socketVariant ? organicPoseSockets() : null;
  const framesWithArt: readonly SemanticGrowthFrame[] = sourceFrames.map((f) => ({
    key: f.key,
    model: {
      ...f.model,
      scene: poseVariant
        ? withoutPrimaryVectorOrganic(f.model.scene)
        : socketVariant
          ? withoutPrimaryVectorOrganic(f.model.scene, false, true)
          : f.model.scene,
      spriteSheet,
      artScale,
    },
  }));
  return (
    <div className="tree-wrap semantic-growth-demo-host">
      <div className="tree-layout">
        <div className="world-frame">
          <div
            className="world-viewport"
            aria-label={
              poseVariant
                ? 'organic pose-to-pose growth witness (real app fixture)'
                : socketVariant
                  ? 'organic socket choreography growth witness (real app fixture)'
                  : 'semantic growth witness (static fixture)'
            }
          >
            <SemanticGrowthWorldView
              frames={framesWithArt}
              {...(poseVariant && sockets
                ? {
                    organicPoseGrowth: {
                      registry: CHAPTER2_ORGANIC_POSE_TO_POSE_REGISTRY,
                      instances: [
                        {
                          trackId: 'chapter2-hero-tree-pose-track-v1',
                          worldAnchor: sockets.tree,
                          scale: ORGANIC_TREE_SCALE,
                          progressWindow: { start: 0.18, end: 1 },
                        },
                        {
                          trackId: 'chapter2-plant-sample-pose-track-v1',
                          worldAnchor: sockets.plant,
                          scale: ORGANIC_PLANT_SCALE,
                          progressWindow: { start: 0.52, end: 1 },
                        },
                      ],
                      nativeIsland: {
                        ...sockets.island,
                        settledAtProgress: 0.18,
                      },
                    },
                  }
                : {})}
              {...(socketVariant && sockets
                ? {
                    organicGrowth: {
                      set: CHAPTER2_SOCKET_CHOREOGRAPHY,
                      rootWorldAnchor: sockets.tree,
                    },
                  }
                : {})}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
