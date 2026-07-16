// @storytree/forest-world — the shared forest-world render core (ADR-0093,
// strategy C). Pure, browser-safe, deterministic GEOMETRY: data-in → geometry-out.
// Both the studio (React mapper) and the public website (string-SVG mapper) render
// FROM this. No store, no React, no live data, no node: imports. Two pure layers:
// the geometry KERNEL below (rng / hex / sizing / ranking / coast / substrate) and
// the framework-agnostic SCENE-GRAPH (`scene.ts`) — the drawable tree the two
// mappers walk.

export { hash, rand01 } from './rng.js';

export {
  type Pt,
  type Axial,
  HEX_R,
  HEX_W,
  TILE_DEPTH,
  axialKey,
  AXIAL_DIRS,
  hexCenter,
  pixelToHex,
  hexDist,
  hexCorners,
  hexPath,
  polyPath,
} from './hex.js';

export { ringsOf, estRadius, crownRadius, storyTreeReach } from './sizing.js';

export {
  type RankStory,
  type EdgeCapability,
  type EdgeStory,
  type StoryEdge,
  storyEdges,
  rankStories,
  descendantCounts,
} from './ranking.js';

export {
  type BoundarySeg,
  boundaryRingLoops,
  loopSignedArea,
  outsetLoop,
  chaikinClosed,
  smoothLoopPath,
  smoothCoast,
} from './coast.js';

export {
  type SubstrateMode,
  type SubstrateTuning,
  type RelaxedCell,
  type DrawTile,
  MESH_TUNING,
  buildRelaxedCells,
} from './substrate.js';

export {
  type TrailIsland,
  type TrailEdgeIn,
  type TrailTuning,
  type TrailSegment,
  type TrailCave,
  type TrailEdgeOut,
  type TrailNetwork,
  routeTrails,
  trailFillWidth,
} from './routing.js';

export {
  type SceneStatus,
  type SceneKind,
  type BuildPhase,
  type WispPhaseBand,
  type ClaimColourState,
  type ClaimGrade,
  wispBand,
  type SceneNodeBase,
  type SceneG,
  type ScenePath,
  type SceneCircle,
  type SceneEllipse,
  type ScenePolygon,
  type SceneRect,
  type SceneText,
  type SceneNode,
  type SceneTrailsInput,
  type ScenePlantInput,
  type SceneTerritoryInput,
  type SceneInput,
  buildScene,
  buildTrails,
  buildTree,
  buildPlant,
  buildConifer,
  buildBloom,
  buildTerritoryFlora,
} from './scene.js';
