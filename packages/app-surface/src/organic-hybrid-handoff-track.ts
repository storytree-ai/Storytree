import { CHAPTER2_ORGANIC_POSE_TO_POSE_REGISTRY } from './organic-pose-to-pose-assets.js';
import {
  clampOrganicPoseProgress,
  organicPoseFrameAtProgress,
  validateOrganicPoseTrack,
  type OrganicPoseFrame,
  type OrganicPosePoint,
  type OrganicPoseTrack,
} from './organic-pose-to-pose-track.js';

export type OrganicHybridPartKind = 'rooted-trunk' | 'ground-plant';
export type OrganicHybridScaleMode = 'trunk' | 'plant';

export interface OrganicHybridBox extends OrganicPosePoint {
  readonly width: number;
  readonly height: number;
}

export interface RegisteredOrganicHybridPart {
  readonly id: 'trunk-root' | 'flower-tuft' | 'fern-tuft';
  readonly kind: OrganicHybridPartKind;
  readonly modulePath: `./assets/chapter2-organic-cutout-puppet/v1/${string}.png`;
  readonly src: string;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly assetPivot: OrganicPosePoint;
  readonly socket: OrganicPosePoint;
  readonly normalizedFootprint: OrganicHybridBox;
  readonly layerDepth: number;
  readonly stage: { readonly start: number; readonly end: number };
  readonly initialAngleDeg: number;
  readonly scaleMode: OrganicHybridScaleMode;
  readonly encodedBytes: number;
}

export interface OrganicHybridPartPose {
  readonly part: RegisteredOrganicHybridPart;
  readonly reveal: number;
  readonly angleDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface OrganicHybridCutoutLayer {
  readonly rigId: string;
  readonly progress: number;
  readonly worldRoot: OrganicPosePoint;
  readonly scale: number;
  readonly depthSlot: 'organic-hybrid-cutout';
  readonly poses: readonly OrganicHybridPartPose[];
}

export type OrganicHybridHandoffPhase =
  | 'empty'
  | 'cutout-trunk'
  | 'continuity-pose'
  | 'pose-to-pose-crown';

export interface RegisteredOrganicHybridHandoffRig {
  readonly id: 'chapter2-organic-hybrid-handoff-v1';
  readonly assetOrigin: 'checked-in-module-url';
  readonly technique: 'registered-hybrid-handoff';
  readonly matchCut: true;
  readonly localBlend: 'none';
  readonly rootSocketId: 'hero-tree-root';
  readonly referencePlateId: 'svg-island-reference-plate.png';
  readonly cutoutParts: readonly RegisteredOrganicHybridPart[];
  readonly poseTreeTrack: OrganicPoseTrack;
  readonly cutoutScale: number;
  readonly poseTreeScale: number;
  readonly handoffAt: number;
  readonly continuityPose: {
    readonly frameIndex: 3;
    readonly trackProgress: number;
    readonly cutoutAssetAnchor: OrganicPosePoint;
    readonly poseAssetAnchor: OrganicPosePoint;
    readonly cutoutWorldFootprint: OrganicHybridBox;
    readonly poseWorldFootprint: OrganicHybridBox;
    readonly heightDeltaRatio: number;
  };
  readonly budget: {
    readonly encodedBytes: number;
    readonly encodedByteLimit: number;
    readonly decodedRgbaBytes: number;
    readonly decodedRgbaByteLimit: number;
    readonly maxSimultaneousLayers: 3;
  };
}

export interface OrganicHybridHandoffState {
  readonly progress: number;
  readonly phase: OrganicHybridHandoffPhase;
  readonly cutoutLayer: OrganicHybridCutoutLayer;
  readonly poseTreeFrame: OrganicPoseFrame | null;
  readonly poseTreeProgress: number | null;
  readonly handoff: {
    readonly kind: 'match-cut';
    readonly continuityPoseFrame: 3;
    readonly localBlend: 'none';
    readonly doubleTrunk: false;
  };
}

const TREE_TRACK = CHAPTER2_ORGANIC_POSE_TO_POSE_REGISTRY.tracks.find(
  (track) => track.kind === 'hero-tree',
);

if (!TREE_TRACK) {
  throw new Error('Registered hybrid handoff requires the preferred pose-to-pose hero tree.');
}

const CUTOUT_URLS = Object.freeze({
  trunk: new URL(
    './assets/chapter2-organic-cutout-puppet/v1/trunk-root.png',
    import.meta.url,
  ).href,
  flower: new URL(
    './assets/chapter2-organic-cutout-puppet/v1/flower-tuft.png',
    import.meta.url,
  ).href,
  fern: new URL(
    './assets/chapter2-organic-cutout-puppet/v1/fern-tuft.png',
    import.meta.url,
  ).href,
});

const CUTOUT_PARTS: readonly RegisteredOrganicHybridPart[] = Object.freeze([
  Object.freeze({
    id: 'trunk-root',
    kind: 'rooted-trunk',
    modulePath: './assets/chapter2-organic-cutout-puppet/v1/trunk-root.png',
    src: CUTOUT_URLS.trunk,
    canvas: Object.freeze({ width: 96, height: 160 }),
    assetPivot: Object.freeze({ x: 48, y: 154 }),
    socket: Object.freeze({ x: 0, y: 0 }),
    normalizedFootprint: Object.freeze({ x: 17, y: 49, width: 69, height: 106 }),
    layerDepth: 30,
    stage: Object.freeze({ start: 0.18, end: 0.42 }),
    initialAngleDeg: -4,
    scaleMode: 'trunk',
    encodedBytes: 5_110,
  }),
  Object.freeze({
    id: 'flower-tuft',
    kind: 'ground-plant',
    modulePath: './assets/chapter2-organic-cutout-puppet/v1/flower-tuft.png',
    src: CUTOUT_URLS.flower,
    canvas: Object.freeze({ width: 64, height: 64 }),
    assetPivot: Object.freeze({ x: 32, y: 60 }),
    socket: Object.freeze({ x: 70, y: 8 }),
    normalizedFootprint: Object.freeze({ x: 19, y: 17, width: 30, height: 44 }),
    layerDepth: 54,
    stage: Object.freeze({ start: 0.5, end: 0.82 }),
    initialAngleDeg: 9,
    scaleMode: 'plant',
    encodedBytes: 1_950,
  }),
  Object.freeze({
    id: 'fern-tuft',
    kind: 'ground-plant',
    modulePath: './assets/chapter2-organic-cutout-puppet/v1/fern-tuft.png',
    src: CUTOUT_URLS.fern,
    canvas: Object.freeze({ width: 64, height: 64 }),
    assetPivot: Object.freeze({ x: 32, y: 60 }),
    socket: Object.freeze({ x: -72, y: 10 }),
    normalizedFootprint: Object.freeze({ x: 20, y: 21, width: 25, height: 40 }),
    layerDepth: 55,
    stage: Object.freeze({ start: 0.58, end: 0.9 }),
    initialAngleDeg: -10,
    scaleMode: 'plant',
    encodedBytes: 1_462,
  }),
]);

const CUTOUT_SCALE = 0.5;
const POSE_TREE_SCALE = 0.34;
const HANDOFF_AT = 0.42;
const CONTINUITY_POSE_PROGRESS = 0.36;
const CUTOUT_HANDOFF_FOOTPRINT = Object.freeze({
  x: 17 * CUTOUT_SCALE,
  y: 49 * CUTOUT_SCALE,
  width: 69 * CUTOUT_SCALE,
  height: 106 * CUTOUT_SCALE,
});
const POSE_HANDOFF_FOOTPRINT = Object.freeze({
  x: 40 * POSE_TREE_SCALE,
  y: 36 * POSE_TREE_SCALE,
  width: 119 * POSE_TREE_SCALE,
  height: 153 * POSE_TREE_SCALE,
});
const HEIGHT_DELTA_RATIO =
  Math.abs(CUTOUT_HANDOFF_FOOTPRINT.height - POSE_HANDOFF_FOOTPRINT.height) /
  Math.max(CUTOUT_HANDOFF_FOOTPRINT.height, POSE_HANDOFF_FOOTPRINT.height);

export const CHAPTER2_ORGANIC_HYBRID_HANDOFF_RIG: RegisteredOrganicHybridHandoffRig =
  Object.freeze({
    id: 'chapter2-organic-hybrid-handoff-v1',
    assetOrigin: 'checked-in-module-url',
    technique: 'registered-hybrid-handoff',
    matchCut: true,
    localBlend: 'none',
    rootSocketId: 'hero-tree-root',
    referencePlateId: 'svg-island-reference-plate.png',
    cutoutParts: CUTOUT_PARTS,
    poseTreeTrack: TREE_TRACK,
    cutoutScale: CUTOUT_SCALE,
    poseTreeScale: POSE_TREE_SCALE,
    handoffAt: HANDOFF_AT,
    continuityPose: Object.freeze({
      frameIndex: 3,
      trackProgress: CONTINUITY_POSE_PROGRESS,
      cutoutAssetAnchor: Object.freeze({ x: 48, y: 154 }),
      poseAssetAnchor: Object.freeze({ x: 96, y: 188 }),
      cutoutWorldFootprint: CUTOUT_HANDOFF_FOOTPRINT,
      poseWorldFootprint: POSE_HANDOFF_FOOTPRINT,
      heightDeltaRatio: HEIGHT_DELTA_RATIO,
    }),
    budget: Object.freeze({
      encodedBytes: 152_528,
      encodedByteLimit: 180_000,
      decodedRgbaBytes: 1_421_312,
      decodedRgbaByteLimit: 1_500_000,
      maxSimultaneousLayers: 3,
    }),
  });

function smoothstep(value: number): number {
  const t = clampOrganicPoseProgress(value);
  return t * t * (3 - 2 * t);
}

function localPartProgress(part: RegisteredOrganicHybridPart, progress: number): number {
  return smoothstep((progress - part.stage.start) / (part.stage.end - part.stage.start));
}

function partPose(
  part: RegisteredOrganicHybridPart,
  progress: number,
): OrganicHybridPartPose {
  const reveal = localPartProgress(part, progress);
  const scaleX =
    part.scaleMode === 'trunk' ? 0.72 + reveal * 0.28 : 0.32 + reveal * 0.68;
  const scaleY = 0.08 + reveal * 0.92;
  return {
    part,
    reveal,
    angleDeg: part.initialAngleDeg * (1 - reveal),
    scaleX,
    scaleY,
  };
}

function poseProgressAfterHandoff(progress: number, rig: RegisteredOrganicHybridHandoffRig): number {
  const local = clampOrganicPoseProgress(
    (progress - rig.handoffAt) / (1 - rig.handoffAt),
  );
  return rig.continuityPose.trackProgress +
    local * (1 - rig.continuityPose.trackProgress);
}

function isLocalAsset(src: string): boolean {
  return (
    src.startsWith('file:') ||
    src.startsWith('data:image/png;base64,') ||
    src.startsWith('/') ||
    /^https?:\/\/localhost(?::\d+)?\//u.test(src) ||
    (typeof window !== 'undefined' &&
      /^https?:\/\//u.test(src) &&
      new URL(src).origin === window.location.origin)
  );
}

export function validateOrganicHybridHandoffRig(
  rig: RegisteredOrganicHybridHandoffRig,
): RegisteredOrganicHybridHandoffRig {
  validateOrganicPoseTrack(rig.poseTreeTrack);
  if (
    rig.technique !== 'registered-hybrid-handoff' ||
    rig.matchCut !== true ||
    rig.localBlend !== 'none'
  ) {
    throw new Error('Organic hybrid handoff must be one registered match cut with no ghosting blend.');
  }
  if (rig.cutoutParts.map((part) => part.id).join(',') !== 'trunk-root,flower-tuft,fern-tuft') {
    throw new Error('Organic hybrid handoff may use only the liked cutout trunk and plants.');
  }
  if (rig.cutoutParts.some((part) => part.kind !== 'rooted-trunk' && part.kind !== 'ground-plant')) {
    throw new Error('Rejected cutout canopy and branch parts cannot enter the hybrid rig.');
  }
  if (rig.poseTreeTrack.kind !== 'hero-tree') {
    throw new Error('Organic hybrid handoff must finish on the preferred whole-tree pose track.');
  }
  if (
    rig.handoffAt <= 0 ||
    rig.handoffAt >= 1 ||
    rig.continuityPose.frameIndex !== 3 ||
    organicPoseFrameAtProgress(rig.poseTreeTrack, rig.continuityPose.trackProgress).index !==
      rig.continuityPose.frameIndex
  ) {
    throw new Error('Organic hybrid handoff continuity pose is not registered to pose frame 3.');
  }
  if (rig.continuityPose.heightDeltaRatio > 0.03) {
    throw new Error('Organic hybrid handoff trunk silhouettes do not match at registered height.');
  }
  if (
    rig.cutoutParts.some((part) => !isLocalAsset(part.src)) ||
    rig.budget.encodedBytes > rig.budget.encodedByteLimit ||
    rig.budget.decodedRgbaBytes > rig.budget.decodedRgbaByteLimit
  ) {
    throw new Error('Organic hybrid handoff assets must stay local and inside the declared budget.');
  }
  return rig;
}

export function organicHybridHandoffAtProgress(
  inputRig: RegisteredOrganicHybridHandoffRig,
  inputProgress: number,
  worldRoot: OrganicPosePoint,
): OrganicHybridHandoffState {
  const rig = validateOrganicHybridHandoffRig(inputRig);
  const progress = clampOrganicPoseProgress(inputProgress);
  const afterHandoff = progress >= rig.handoffAt;
  const poses = rig.cutoutParts
    .filter((part) => !(part.kind === 'rooted-trunk' && afterHandoff))
    .map((part) => partPose(part, progress))
    .filter((pose) => pose.reveal > 0);
  const poseTreeProgress = afterHandoff
    ? poseProgressAfterHandoff(progress, rig)
    : null;
  const poseTreeFrame = poseTreeProgress === null
    ? null
    : organicPoseFrameAtProgress(rig.poseTreeTrack, poseTreeProgress);
  const phase: OrganicHybridHandoffPhase =
    progress <= 0
      ? 'empty'
      : !afterHandoff
        ? 'cutout-trunk'
        : poseTreeFrame?.index === rig.continuityPose.frameIndex
          ? 'continuity-pose'
          : 'pose-to-pose-crown';
  return {
    progress,
    phase,
    cutoutLayer: {
      rigId: rig.id,
      progress,
      worldRoot: { ...worldRoot },
      scale: rig.cutoutScale,
      depthSlot: 'organic-hybrid-cutout',
      poses,
    },
    poseTreeFrame,
    poseTreeProgress,
    handoff: {
      kind: 'match-cut',
      continuityPoseFrame: 3,
      localBlend: 'none',
      doubleTrunk: false,
    },
  };
}
