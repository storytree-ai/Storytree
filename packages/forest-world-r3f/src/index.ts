// @storytree/forest-world-r3f — the ADR-0123 THIRD forest-world mapper: R3F/three.
// The provability firewall (the r3f-world-spike capability): this root barrel is
// the PURE half — the world-to-3D descriptor mapping, no React/three imports,
// importable under bare node:test. The browser half (<ForestWorldCanvas> + drei
// MapControls) lives behind the `./canvas` subpath and is never re-exported here —
// the same role-split-entry-point discipline as @storytree/library's `/store`.
export {
  worldTo3D,
  type Transform3D,
  type InstanceKind,
  type InstanceDescriptor,
  type SkippedDescriptor,
  type Descriptor3D,
} from './world-to-3d.js';

// The `cell-ground` family's PURE geometry half (the relaxed-mesh substrate the studio ships):
// parcel rings → one merged, flat-shaded ground buffer. Arithmetic only — no React, no three —
// so it lives on this side of the provability firewall and `<ForestWorldCanvas>` merely hands
// the result to a `<bufferGeometry>`.
export {
  cellGroundGeometry,
  cellGroundTriangles,
  normalisedRing,
  pointInTriangle,
  signedRingArea2,
  signedTriangleArea2,
  triangulateRing,
  CELL_GROUND_DEPTH,
  type P2,
  type CellGroundGeometry,
  type CellGroundGeometryInput,
  type GroundRelief,
  type LinearRgb,
  FLAT_GROUND,
} from './cell-ground-geometry.js';

// The ground's RELIEF field — the first component of the approved land treatment to cross onto
// the shipped side (`adopt-the-land-into-the-shipped-map-arc`, owner-authorised 2026-08-29).
// Pure arithmetic, a function of POSITION ONLY, so it asserts nothing about any unit's proof
// state and stays on this side of the provability firewall with everything else here.
export {
  LAND_RELIEF_AMPLITUDE,
  landGradient,
  landHeight,
  landHeightRange,
  landNormal,
  landRelief,
  type LandGradientResult,
  type LandNormalResult,
} from './land-relief.js';

// The Act 2 beat director (the act2-beat-director capability): pure, visitor-paced
// choreography — zod contracts + a pure state machine, no React/three imports.
// The schema consts (CameraTarget/LimbDelta/RoadDelta/BeatDelta/Beat/BeatScript)
// are value+type merged exports (the proof-protocol idiom).
export {
  advance,
  initialState,
  defaultScript,
  CameraTarget,
  LimbDelta,
  RoadDelta,
  BeatDelta,
  Beat,
  BeatScript,
  type WorldState,
  type DirectorState,
} from './act2-director.js';
