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
