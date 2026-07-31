export interface OrganicCanopyPoint {
  readonly x: number;
  readonly y: number;
}

export interface OrganicCanopyBox extends OrganicCanopyPoint {
  readonly width: number;
  readonly height: number;
}

export interface OrganicCanopySize {
  readonly width: number;
  readonly height: number;
}

export type OrganicCanopyPartKind =
  | 'major-branch'
  | 'rooted-trunk'
  | 'ground-plant';

export type OrganicCanopyPartScaleMode = 'branch' | 'trunk' | 'plant';

export type OrganicCanopyPainterSlot =
  | 'branch-behind-canopy'
  | 'canopy-collar'
  | 'trunk-front'
  | 'plant-foreground';

export interface RegisteredOrganicCanopyPart {
  readonly id: string;
  readonly kind: OrganicCanopyPartKind;
  readonly modulePath: `./assets/chapter2-organic-canopy-occlusion/v1/${string}.png`;
  readonly src: string;
  readonly canvas: OrganicCanopySize;
  readonly assetPivot: OrganicCanopyPoint;
  readonly rigSocket: OrganicCanopyPoint;
  readonly normalizedFootprint: OrganicCanopyBox;
  readonly painterSlot: Exclude<OrganicCanopyPainterSlot, 'canopy-collar'>;
  readonly painterOrder: number;
  readonly stage: { readonly start: number; readonly end: number };
  readonly initialAngleDeg: number;
  readonly scaleMode: OrganicCanopyPartScaleMode;
}

export interface RegisteredOrganicCanopyPose {
  readonly index: number;
  readonly modulePath: `./assets/chapter2-organic-canopy-occlusion/v1/canopy/pose-${string}.png`;
  readonly src: string;
  readonly canvas: OrganicCanopySize;
  readonly assetCrownSocket: OrganicCanopyPoint;
  readonly collarBounds: OrganicCanopyBox;
  readonly collarCore: OrganicCanopyBox;
  readonly opaqueCollarPixels: number;
  readonly collarCoreMinimumAlpha: 255;
}

export interface RegisteredOrganicCanopyOcclusionTrack {
  readonly id: 'chapter2-organic-canopy-occlusion-v1';
  readonly assetOrigin: 'checked-in-module-url';
  readonly rootSocketId: 'hero-tree-root';
  readonly rigRootSocket: OrganicCanopyPoint;
  readonly rigCrownSocket: OrganicCanopyPoint;
  readonly canopy: {
    readonly id: 'chapter2-connected-canopy-pose-track-v1';
    readonly frameCount: 9;
    readonly canvas: OrganicCanopySize;
    readonly assetCrownSocket: OrganicCanopyPoint;
    readonly collarBounds: OrganicCanopyBox;
    readonly collarCore: OrganicCanopyBox;
    readonly minimumOpaqueCollarPixels: 1100;
    readonly painterSlot: 'canopy-collar';
    readonly painterOrder: 30;
    readonly stage: { readonly start: number; readonly end: number };
    readonly poses: readonly RegisteredOrganicCanopyPose[];
  };
  readonly parts: readonly RegisteredOrganicCanopyPart[];
  readonly matureFootprint: OrganicCanopyBox;
  readonly depthSlot: 'organic-canopy-occlusion';
  readonly authoringEvidence: {
    readonly registrationPlate: './assets/chapter2-organic-canopy-occlusion/v1/crown-registration-plate.png';
    readonly registrationReport: './assets/chapter2-organic-canopy-occlusion/v1/canopy-registration-report.json';
    readonly runtimeExcluded: true;
  };
}

export interface OrganicCanopyPartPose {
  readonly part: RegisteredOrganicCanopyPart;
  readonly reveal: number;
  readonly angleDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface OrganicCanopyOcclusionRenderLayer {
  readonly renderKind: 'organic-canopy-occlusion';
  readonly trackId: RegisteredOrganicCanopyOcclusionTrack['id'];
  readonly progress: number;
  readonly worldRoot: OrganicCanopyPoint;
  readonly scale: number;
  readonly rigRootSocket: OrganicCanopyPoint;
  readonly rigCrownSocket: OrganicCanopyPoint;
  readonly matureFootprint: OrganicCanopyBox;
  readonly depthSlot: RegisteredOrganicCanopyOcclusionTrack['depthSlot'];
  readonly canopyPose: RegisteredOrganicCanopyPose;
  readonly canopyReveal: number;
  readonly partPoses: readonly OrganicCanopyPartPose[];
}

export interface OrganicCanopyPlaybackState {
  readonly cueIndex: number;
  readonly progress: number;
  readonly fromProgress: number;
  readonly targetProgress: number;
  readonly elapsedMs: number;
  readonly transitionMs: number;
  readonly holdMs: number;
  readonly playing: boolean;
  readonly transitionId: number;
}

export const ORGANIC_CANOPY_CUE_TARGETS = Object.freeze([
  0,
  0.16,
  0.38,
  0.58,
  0.78,
  1,
] as const);

export const ORGANIC_CANOPY_PLAYBACK_POLICY = Object.freeze({
  easing: 'smoothstep' as const,
  transitionMs: Object.freeze([0, 420, 920, 980, 1040, 1120] as const),
  holdMs: Object.freeze([0, 180, 180, 160, 140, 0] as const),
});

const ASSET_URLS = Object.freeze({
  branchLeft: new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/branch-left.png',
    import.meta.url,
  ).href,
  branchRight: new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/branch-right.png',
    import.meta.url,
  ).href,
  trunk: new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/trunk-root.png',
    import.meta.url,
  ).href,
  flower: new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/flower-tuft.png',
    import.meta.url,
  ).href,
  fern: new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/fern-tuft.png',
    import.meta.url,
  ).href,
});

const POSE_URLS = Object.freeze([
  new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/canopy/pose-00.png',
    import.meta.url,
  ).href,
  new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/canopy/pose-01.png',
    import.meta.url,
  ).href,
  new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/canopy/pose-02.png',
    import.meta.url,
  ).href,
  new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/canopy/pose-03.png',
    import.meta.url,
  ).href,
  new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/canopy/pose-04.png',
    import.meta.url,
  ).href,
  new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/canopy/pose-05.png',
    import.meta.url,
  ).href,
  new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/canopy/pose-06.png',
    import.meta.url,
  ).href,
  new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/canopy/pose-07.png',
    import.meta.url,
  ).href,
  new URL(
    './assets/chapter2-organic-canopy-occlusion/v1/canopy/pose-08.png',
    import.meta.url,
  ).href,
]);

const CANOPY_CANVAS = Object.freeze({ width: 192, height: 176 });
const ASSET_CROWN_SOCKET = Object.freeze({ x: 96, y: 160 });
const RIG_CROWN_SOCKET = Object.freeze({ x: 0, y: -50 });
const COLLAR_BOUNDS = Object.freeze({ x: 72, y: 140, width: 49, height: 31 });
const COLLAR_CORE = Object.freeze({ x: 88, y: 150, width: 17, height: 16 });
const OPAQUE_COLLAR_PIXELS = Object.freeze([
  1335,
  1308,
  1375,
  1380,
  1318,
  1296,
  1317,
  1336,
  1346,
] as const);

const PARTS: readonly RegisteredOrganicCanopyPart[] = Object.freeze([
  Object.freeze({
    id: 'branch-left',
    kind: 'major-branch',
    modulePath: './assets/chapter2-organic-canopy-occlusion/v1/branch-left.png',
    src: ASSET_URLS.branchLeft,
    canvas: Object.freeze({ width: 128, height: 96 }),
    assetPivot: Object.freeze({ x: 100, y: 90 }),
    rigSocket: Object.freeze({ x: -7, y: -74 }),
    normalizedFootprint: Object.freeze({ x: 75, y: 33, width: 53, height: 58 }),
    painterSlot: 'branch-behind-canopy',
    painterOrder: 10,
    stage: Object.freeze({ start: 0.32, end: 0.64 }),
    initialAngleDeg: 24,
    scaleMode: 'branch',
  }),
  Object.freeze({
    id: 'branch-right',
    kind: 'major-branch',
    modulePath: './assets/chapter2-organic-canopy-occlusion/v1/branch-right.png',
    src: ASSET_URLS.branchRight,
    canvas: Object.freeze({ width: 128, height: 96 }),
    assetPivot: Object.freeze({ x: 28, y: 90 }),
    rigSocket: Object.freeze({ x: 8, y: -84 }),
    normalizedFootprint: Object.freeze({ x: 4, y: 22, width: 56, height: 69 }),
    painterSlot: 'branch-behind-canopy',
    painterOrder: 20,
    stage: Object.freeze({ start: 0.36, end: 0.68 }),
    initialAngleDeg: -22,
    scaleMode: 'branch',
  }),
  Object.freeze({
    id: 'trunk-root',
    kind: 'rooted-trunk',
    modulePath: './assets/chapter2-organic-canopy-occlusion/v1/trunk-root.png',
    src: ASSET_URLS.trunk,
    canvas: Object.freeze({ width: 96, height: 160 }),
    assetPivot: Object.freeze({ x: 48, y: 154 }),
    rigSocket: Object.freeze({ x: 0, y: 0 }),
    normalizedFootprint: Object.freeze({ x: 17, y: 49, width: 69, height: 106 }),
    painterSlot: 'trunk-front',
    painterOrder: 40,
    stage: Object.freeze({ start: 0.18, end: 0.5 }),
    initialAngleDeg: -4,
    scaleMode: 'trunk',
  }),
  Object.freeze({
    id: 'flower-tuft',
    kind: 'ground-plant',
    modulePath: './assets/chapter2-organic-canopy-occlusion/v1/flower-tuft.png',
    src: ASSET_URLS.flower,
    canvas: Object.freeze({ width: 64, height: 64 }),
    assetPivot: Object.freeze({ x: 32, y: 60 }),
    rigSocket: Object.freeze({ x: 70, y: 8 }),
    normalizedFootprint: Object.freeze({ x: 19, y: 17, width: 30, height: 44 }),
    painterSlot: 'plant-foreground',
    painterOrder: 50,
    stage: Object.freeze({ start: 0.74, end: 0.96 }),
    initialAngleDeg: 9,
    scaleMode: 'plant',
  }),
  Object.freeze({
    id: 'fern-tuft',
    kind: 'ground-plant',
    modulePath: './assets/chapter2-organic-canopy-occlusion/v1/fern-tuft.png',
    src: ASSET_URLS.fern,
    canvas: Object.freeze({ width: 64, height: 64 }),
    assetPivot: Object.freeze({ x: 32, y: 60 }),
    rigSocket: Object.freeze({ x: -72, y: 10 }),
    normalizedFootprint: Object.freeze({ x: 20, y: 21, width: 25, height: 40 }),
    painterSlot: 'plant-foreground',
    painterOrder: 60,
    stage: Object.freeze({ start: 0.78, end: 1 }),
    initialAngleDeg: -10,
    scaleMode: 'plant',
  }),
]);

const POSES: readonly RegisteredOrganicCanopyPose[] = Object.freeze(
  Array.from({ length: 9 }, (_, index) => {
    const name = `pose-${String(index).padStart(2, '0')}.png`;
    const modulePath =
      `./assets/chapter2-organic-canopy-occlusion/v1/canopy/${name}` as RegisteredOrganicCanopyPose['modulePath'];
    return Object.freeze({
      index,
      modulePath,
      src: POSE_URLS[index]!,
      canvas: CANOPY_CANVAS,
      assetCrownSocket: ASSET_CROWN_SOCKET,
      collarBounds: COLLAR_BOUNDS,
      collarCore: COLLAR_CORE,
      opaqueCollarPixels: OPAQUE_COLLAR_PIXELS[index]!,
      collarCoreMinimumAlpha: 255 as const,
    });
  }),
);

export const CHAPTER2_ORGANIC_CANOPY_OCCLUSION_TRACK: RegisteredOrganicCanopyOcclusionTrack =
  Object.freeze({
    id: 'chapter2-organic-canopy-occlusion-v1',
    assetOrigin: 'checked-in-module-url',
    rootSocketId: 'hero-tree-root',
    rigRootSocket: Object.freeze({ x: 0, y: 0 }),
    rigCrownSocket: RIG_CROWN_SOCKET,
    canopy: Object.freeze({
      id: 'chapter2-connected-canopy-pose-track-v1',
      frameCount: 9,
      canvas: CANOPY_CANVAS,
      assetCrownSocket: ASSET_CROWN_SOCKET,
      collarBounds: COLLAR_BOUNDS,
      collarCore: COLLAR_CORE,
      minimumOpaqueCollarPixels: 1100,
      painterSlot: 'canopy-collar',
      painterOrder: 30,
      stage: Object.freeze({ start: 0.38, end: 0.94 }),
      poses: POSES,
    }),
    parts: PARTS,
    matureFootprint: Object.freeze({ x: -100, y: -210, width: 200, height: 280 }),
    depthSlot: 'organic-canopy-occlusion',
    authoringEvidence: Object.freeze({
      registrationPlate:
        './assets/chapter2-organic-canopy-occlusion/v1/crown-registration-plate.png',
      registrationReport:
        './assets/chapter2-organic-canopy-occlusion/v1/canopy-registration-report.json',
      runtimeExcluded: true,
    }),
  });

export function clampOrganicCanopyProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(1, progress));
}

function smoothstep(value: number): number {
  const t = clampOrganicCanopyProgress(value);
  return t * t * (3 - 2 * t);
}

function stagedProgress(
  stage: { readonly start: number; readonly end: number },
  progress: number,
): number {
  return smoothstep((progress - stage.start) / (stage.end - stage.start));
}

function scalesFor(
  mode: OrganicCanopyPartScaleMode,
  progress: number,
): readonly [number, number] {
  if (mode === 'trunk') return [0.72 + progress * 0.28, 0.08 + progress * 0.92];
  if (mode === 'branch') return [0.12 + progress * 0.88, 0.62 + progress * 0.38];
  return [0.32 + progress * 0.68, 0.08 + progress * 0.92];
}

export function organicCanopyPoseAtProgress(
  track: RegisteredOrganicCanopyOcclusionTrack,
  progress: number,
): RegisteredOrganicCanopyPose {
  const local = clampOrganicCanopyProgress(
    (clampOrganicCanopyProgress(progress) - track.canopy.stage.start) /
      (track.canopy.stage.end - track.canopy.stage.start),
  );
  const index = Math.min(track.canopy.frameCount - 1, Math.floor(local * track.canopy.frameCount));
  return track.canopy.poses[index]!;
}

export function organicCanopyLayerAtProgress(
  track: RegisteredOrganicCanopyOcclusionTrack,
  progress: number,
  worldRoot: OrganicCanopyPoint,
  scale: number,
): OrganicCanopyOcclusionRenderLayer {
  const bounded = clampOrganicCanopyProgress(progress);
  return {
    renderKind: 'organic-canopy-occlusion',
    trackId: track.id,
    progress: bounded,
    worldRoot,
    scale,
    rigRootSocket: track.rigRootSocket,
    rigCrownSocket: track.rigCrownSocket,
    matureFootprint: track.matureFootprint,
    depthSlot: track.depthSlot,
    canopyPose: organicCanopyPoseAtProgress(track, bounded),
    canopyReveal: stagedProgress(track.canopy.stage, bounded),
    partPoses: track.parts.map((part) => {
      const reveal = stagedProgress(part.stage, bounded);
      const [scaleX, scaleY] = scalesFor(part.scaleMode, reveal);
      return {
        part,
        reveal,
        angleDeg: reveal === 1 ? 0 : part.initialAngleDeg * (1 - reveal),
        scaleX,
        scaleY,
      };
    }),
  };
}

function isLocalCanopyModuleUrl(src: string): boolean {
  if (
    (src.startsWith('/') && !src.startsWith('//')) ||
    src.startsWith('file:') ||
    /^[A-Za-z]:[\\/]/u.test(src) ||
    /^https?:\/\/localhost(?::\d+)?\//u.test(src)
  ) {
    return true;
  }
  if (/^https?:\/\//u.test(src) && typeof window !== 'undefined') {
    try {
      return new URL(src).origin === window.location.origin;
    } catch {
      return false;
    }
  }
  return false;
}

export function validateOrganicCanopyOcclusionTrack(
  track: RegisteredOrganicCanopyOcclusionTrack,
): RegisteredOrganicCanopyOcclusionTrack {
  if (track.assetOrigin !== 'checked-in-module-url') {
    throw new Error('Organic canopy assets must resolve from checked-in module URLs.');
  }
  if (
    track.canopy.frameCount !== 9 ||
    track.canopy.poses.length !== 9 ||
    track.canopy.canvas.width !== 192 ||
    track.canopy.canvas.height !== 176
  ) {
    throw new Error('Organic canopy requires exactly nine registered 192x176 poses.');
  }
  if (
    track.rigRootSocket.x !== 0 ||
    track.rigRootSocket.y !== 0 ||
    track.rigCrownSocket.x !== 0 ||
    track.rigCrownSocket.y !== -50
  ) {
    throw new Error('Organic canopy rig sockets must remain invariant.');
  }
  const expectedIds = ['branch-left', 'branch-right', 'trunk-root', 'flower-tuft', 'fern-tuft'];
  if (track.parts.map((part) => part.id).join(',') !== expectedIds.join(',')) {
    throw new Error('Organic canopy must retain only the inherited branch, trunk, and plant parts.');
  }
  const painterOrder = [
    ...track.parts.map((part) => part.painterOrder),
    track.canopy.painterOrder,
  ].sort((a, b) => a - b);
  if (painterOrder.join(',') !== '10,20,30,40,50,60') {
    throw new Error('Organic canopy painter order must keep branches behind canopy, trunk, and plants.');
  }
  track.canopy.poses.forEach((pose, index) => {
    const expectedName = `pose-${String(index).padStart(2, '0')}.png`;
    if (
      pose.index !== index ||
      !pose.modulePath.endsWith(`/canopy/${expectedName}`) ||
      pose.canvas.width !== 192 ||
      pose.canvas.height !== 176 ||
      pose.assetCrownSocket.x !== 96 ||
      pose.assetCrownSocket.y !== 160 ||
      pose.collarBounds.x !== 72 ||
      pose.collarBounds.y !== 140 ||
      pose.collarBounds.width !== 49 ||
      pose.collarBounds.height !== 31 ||
      pose.collarCore.x !== 88 ||
      pose.collarCore.y !== 150 ||
      pose.collarCore.width !== 17 ||
      pose.collarCore.height !== 16 ||
      pose.opaqueCollarPixels < track.canopy.minimumOpaqueCollarPixels ||
      pose.collarCoreMinimumAlpha !== 255
    ) {
      throw new Error(`Organic canopy pose ${index} breaks its crown/collar registration.`);
    }
    if (!isLocalCanopyModuleUrl(pose.src)) {
      throw new Error('Organic canopy poses must resolve from local module URLs.');
    }
  });
  if (!Number.isFinite(track.matureFootprint.width) || track.matureFootprint.width <= 0) {
    throw new Error('Organic canopy mature footprint must be finite and positive.');
  }
  return track;
}

export function initialOrganicCanopyPlayback(): OrganicCanopyPlaybackState {
  return {
    cueIndex: 0,
    progress: 0,
    fromProgress: 0,
    targetProgress: 0,
    elapsedMs: 0,
    transitionMs: 0,
    holdMs: 0,
    playing: false,
    transitionId: 0,
  };
}

export function selectOrganicCanopyCue(
  state: OrganicCanopyPlaybackState,
  cueIndex: number,
  reducedMotion: boolean,
): OrganicCanopyPlaybackState {
  const bounded = Number.isFinite(cueIndex)
    ? Math.max(0, Math.min(ORGANIC_CANOPY_CUE_TARGETS.length - 1, Math.trunc(cueIndex)))
    : 0;
  const targetProgress = ORGANIC_CANOPY_CUE_TARGETS[bounded]!;
  const transitionId = state.transitionId + 1;
  if (reducedMotion) {
    return {
      cueIndex: bounded,
      progress: targetProgress,
      fromProgress: targetProgress,
      targetProgress,
      elapsedMs: 0,
      transitionMs: 0,
      holdMs: 0,
      playing: false,
      transitionId,
    };
  }
  const transitionMs = ORGANIC_CANOPY_PLAYBACK_POLICY.transitionMs[bounded]!;
  const holdMs = ORGANIC_CANOPY_PLAYBACK_POLICY.holdMs[bounded]!;
  return {
    cueIndex: bounded,
    progress: state.progress,
    fromProgress: state.progress,
    targetProgress,
    elapsedMs: 0,
    transitionMs,
    holdMs,
    playing: state.progress !== targetProgress || holdMs > 0,
    transitionId,
  };
}

export function nextOrganicCanopyCue(
  state: OrganicCanopyPlaybackState,
  reducedMotion: boolean,
): OrganicCanopyPlaybackState {
  return selectOrganicCanopyCue(state, state.cueIndex + 1, reducedMotion);
}

export function backOrganicCanopyCue(
  state: OrganicCanopyPlaybackState,
  reducedMotion: boolean,
): OrganicCanopyPlaybackState {
  return selectOrganicCanopyCue(state, state.cueIndex - 1, reducedMotion);
}

export function replayOrganicCanopyPlayback(
  state: OrganicCanopyPlaybackState,
): OrganicCanopyPlaybackState {
  return {
    ...initialOrganicCanopyPlayback(),
    transitionId: state.transitionId + 1,
  };
}

export function advanceOrganicCanopyPlayback(
  state: OrganicCanopyPlaybackState,
  deltaMs: number,
): OrganicCanopyPlaybackState {
  if (!state.playing) return state;
  const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
  const elapsedMs = state.elapsedMs + safeDelta;
  const ratio = state.transitionMs === 0 ? 1 : elapsedMs / state.transitionMs;
  const eased = smoothstep(ratio);
  const progress =
    state.fromProgress + (state.targetProgress - state.fromProgress) * eased;
  const playing = elapsedMs < state.transitionMs + state.holdMs;
  return {
    ...state,
    progress: playing ? progress : state.targetProgress,
    elapsedMs,
    playing,
  };
}
