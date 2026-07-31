export interface CutoutPuppetPoint {
  readonly x: number;
  readonly y: number;
}

export interface CutoutPuppetBox extends CutoutPuppetPoint {
  readonly width: number;
  readonly height: number;
}

export type CutoutPuppetPartKind =
  | 'rooted-trunk'
  | 'major-branch'
  | 'canopy-cluster'
  | 'ground-plant';

export type CutoutPuppetScaleMode = 'trunk' | 'branch' | 'canopy' | 'plant';

export interface RegisteredCutoutPuppetPart {
  readonly id: string;
  readonly kind: CutoutPuppetPartKind;
  readonly modulePath: `./assets/chapter2-organic-cutout-puppet/v1/${string}.png`;
  readonly src: string;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly assetPivot: CutoutPuppetPoint;
  readonly socket: CutoutPuppetPoint;
  readonly normalizedFootprint: CutoutPuppetBox;
  readonly layerDepth: number;
  readonly stage: {
    readonly start: number;
    readonly end: number;
  };
  readonly initialAngleDeg: number;
  readonly scaleMode: CutoutPuppetScaleMode;
  readonly encodedBytes: number;
}

export interface RegisteredCutoutPuppetRig {
  readonly id: string;
  readonly assetOrigin: 'checked-in-module-url';
  readonly rootSocketId: 'hero-tree-root';
  readonly parts: readonly RegisteredCutoutPuppetPart[];
  readonly matureFootprint: CutoutPuppetBox;
  readonly depthSlot: 'organic-cutout-puppet';
  readonly encodedComponentBytes: number;
  readonly decodedRgbaBytes: number;
  readonly maxComponentCount: 8;
}

export interface CutoutPuppetPartPose {
  readonly part: RegisteredCutoutPuppetPart;
  readonly reveal: number;
  readonly angleDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface CutoutPuppetRenderLayer {
  readonly rigId: string;
  readonly progress: number;
  readonly worldRoot: CutoutPuppetPoint;
  readonly scale: number;
  readonly matureFootprint: CutoutPuppetBox;
  readonly depthSlot: 'organic-cutout-puppet';
  readonly poses: readonly CutoutPuppetPartPose[];
}

export interface CutoutPuppetPlaybackState {
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

export const CUTOUT_PUPPET_CUE_TARGETS = Object.freeze([
  0,
  0.16,
  0.38,
  0.58,
  0.78,
  1,
] as const);

export const CUTOUT_PUPPET_PLAYBACK_POLICY = Object.freeze({
  transitionMs: Object.freeze([0, 420, 920, 980, 1040, 1120] as const),
  holdMs: Object.freeze([0, 180, 180, 160, 140, 0] as const),
});

const COMPONENT_URLS = Object.freeze({
  trunk: new URL(
    './assets/chapter2-organic-cutout-puppet/v1/trunk-root.png',
    import.meta.url,
  ).href,
  branchLeft: new URL(
    './assets/chapter2-organic-cutout-puppet/v1/branch-left.png',
    import.meta.url,
  ).href,
  branchRight: new URL(
    './assets/chapter2-organic-cutout-puppet/v1/branch-right.png',
    import.meta.url,
  ).href,
  canopyLeft: new URL(
    './assets/chapter2-organic-cutout-puppet/v1/canopy-left.png',
    import.meta.url,
  ).href,
  canopyCrown: new URL(
    './assets/chapter2-organic-cutout-puppet/v1/canopy-crown.png',
    import.meta.url,
  ).href,
  canopyRight: new URL(
    './assets/chapter2-organic-cutout-puppet/v1/canopy-right.png',
    import.meta.url,
  ).href,
  fern: new URL(
    './assets/chapter2-organic-cutout-puppet/v1/fern-tuft.png',
    import.meta.url,
  ).href,
  flower: new URL(
    './assets/chapter2-organic-cutout-puppet/v1/flower-tuft.png',
    import.meta.url,
  ).href,
});

const PARTS: readonly RegisteredCutoutPuppetPart[] = Object.freeze([
  Object.freeze({
    id: 'branch-left',
    kind: 'major-branch',
    modulePath:
      './assets/chapter2-organic-cutout-puppet/v1/branch-left.png',
    src: COMPONENT_URLS.branchLeft,
    canvas: Object.freeze({ width: 128, height: 96 }),
    assetPivot: Object.freeze({ x: 100, y: 90 }),
    socket: Object.freeze({ x: -7, y: -74 }),
    normalizedFootprint: Object.freeze({ x: 75, y: 33, width: 53, height: 58 }),
    layerDepth: 20,
    stage: Object.freeze({ start: 0.32, end: 0.64 }),
    initialAngleDeg: 24,
    scaleMode: 'branch',
    encodedBytes: 1771,
  }),
  Object.freeze({
    id: 'branch-right',
    kind: 'major-branch',
    modulePath:
      './assets/chapter2-organic-cutout-puppet/v1/branch-right.png',
    src: COMPONENT_URLS.branchRight,
    canvas: Object.freeze({ width: 128, height: 96 }),
    assetPivot: Object.freeze({ x: 28, y: 90 }),
    socket: Object.freeze({ x: 8, y: -84 }),
    normalizedFootprint: Object.freeze({ x: 4, y: 22, width: 56, height: 69 }),
    layerDepth: 22,
    stage: Object.freeze({ start: 0.36, end: 0.68 }),
    initialAngleDeg: -22,
    scaleMode: 'branch',
    encodedBytes: 2247,
  }),
  Object.freeze({
    id: 'trunk-root',
    kind: 'rooted-trunk',
    modulePath:
      './assets/chapter2-organic-cutout-puppet/v1/trunk-root.png',
    src: COMPONENT_URLS.trunk,
    canvas: Object.freeze({ width: 96, height: 160 }),
    assetPivot: Object.freeze({ x: 48, y: 154 }),
    socket: Object.freeze({ x: 0, y: 0 }),
    normalizedFootprint: Object.freeze({ x: 17, y: 49, width: 69, height: 106 }),
    layerDepth: 30,
    stage: Object.freeze({ start: 0.18, end: 0.5 }),
    initialAngleDeg: -4,
    scaleMode: 'trunk',
    encodedBytes: 5110,
  }),
  Object.freeze({
    id: 'canopy-left',
    kind: 'canopy-cluster',
    modulePath:
      './assets/chapter2-organic-cutout-puppet/v1/canopy-left.png',
    src: COMPONENT_URLS.canopyLeft,
    canvas: Object.freeze({ width: 112, height: 96 }),
    assetPivot: Object.freeze({ x: 70, y: 88 }),
    socket: Object.freeze({ x: -36, y: -124 }),
    normalizedFootprint: Object.freeze({ x: 29, y: 16, width: 82, height: 73 }),
    layerDepth: 40,
    stage: Object.freeze({ start: 0.48, end: 0.82 }),
    initialAngleDeg: -7,
    scaleMode: 'canopy',
    encodedBytes: 6371,
  }),
  Object.freeze({
    id: 'canopy-right',
    kind: 'canopy-cluster',
    modulePath:
      './assets/chapter2-organic-cutout-puppet/v1/canopy-right.png',
    src: COMPONENT_URLS.canopyRight,
    canvas: Object.freeze({ width: 112, height: 96 }),
    assetPivot: Object.freeze({ x: 42, y: 88 }),
    socket: Object.freeze({ x: 40, y: -122 }),
    normalizedFootprint: Object.freeze({ x: 2, y: 12, width: 76, height: 77 }),
    layerDepth: 42,
    stage: Object.freeze({ start: 0.52, end: 0.86 }),
    initialAngleDeg: 8,
    scaleMode: 'canopy',
    encodedBytes: 6405,
  }),
  Object.freeze({
    id: 'canopy-crown',
    kind: 'canopy-cluster',
    modulePath:
      './assets/chapter2-organic-cutout-puppet/v1/canopy-crown.png',
    src: COMPONENT_URLS.canopyCrown,
    canvas: Object.freeze({ width: 112, height: 96 }),
    assetPivot: Object.freeze({ x: 56, y: 88 }),
    socket: Object.freeze({ x: 0, y: -146 }),
    normalizedFootprint: Object.freeze({ x: 30, y: 23, width: 50, height: 66 }),
    layerDepth: 44,
    stage: Object.freeze({ start: 0.56, end: 0.9 }),
    initialAngleDeg: -5,
    scaleMode: 'canopy',
    encodedBytes: 3569,
  }),
  Object.freeze({
    id: 'flower-tuft',
    kind: 'ground-plant',
    modulePath:
      './assets/chapter2-organic-cutout-puppet/v1/flower-tuft.png',
    src: COMPONENT_URLS.flower,
    canvas: Object.freeze({ width: 64, height: 64 }),
    assetPivot: Object.freeze({ x: 32, y: 60 }),
    socket: Object.freeze({ x: 70, y: 8 }),
    normalizedFootprint: Object.freeze({ x: 19, y: 17, width: 30, height: 44 }),
    layerDepth: 54,
    stage: Object.freeze({ start: 0.74, end: 0.96 }),
    initialAngleDeg: 9,
    scaleMode: 'plant',
    encodedBytes: 1950,
  }),
  Object.freeze({
    id: 'fern-tuft',
    kind: 'ground-plant',
    modulePath:
      './assets/chapter2-organic-cutout-puppet/v1/fern-tuft.png',
    src: COMPONENT_URLS.fern,
    canvas: Object.freeze({ width: 64, height: 64 }),
    assetPivot: Object.freeze({ x: 32, y: 60 }),
    socket: Object.freeze({ x: -72, y: 10 }),
    normalizedFootprint: Object.freeze({ x: 20, y: 21, width: 25, height: 40 }),
    layerDepth: 55,
    stage: Object.freeze({ start: 0.78, end: 1 }),
    initialAngleDeg: -10,
    scaleMode: 'plant',
    encodedBytes: 1462,
  }),
]);

export const CHAPTER2_ORGANIC_CUTOUT_PUPPET_RIG: RegisteredCutoutPuppetRig =
  Object.freeze({
    id: 'chapter2-organic-cutout-puppet-v1',
    assetOrigin: 'checked-in-module-url',
    rootSocketId: 'hero-tree-root',
    parts: PARTS,
    matureFootprint: Object.freeze({ x: -84, y: -211, width: 170, height: 221 }),
    depthSlot: 'organic-cutout-puppet',
    encodedComponentBytes: 28_885,
    decodedRgbaBytes: 321_536,
    maxComponentCount: 8,
  });

export function clampCutoutPuppetProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(1, progress));
}

function smoothstep(value: number): number {
  const t = clampCutoutPuppetProgress(value);
  return t * t * (3 - 2 * t);
}

function localPartProgress(
  part: RegisteredCutoutPuppetPart,
  progress: number,
): number {
  const span = part.stage.end - part.stage.start;
  if (span <= 0) return progress >= part.stage.end ? 1 : 0;
  return smoothstep((progress - part.stage.start) / span);
}

function scalesFor(
  mode: CutoutPuppetScaleMode,
  progress: number,
): readonly [number, number] {
  if (mode === 'trunk') return [0.72 + progress * 0.28, 0.08 + progress * 0.92];
  if (mode === 'branch') return [0.12 + progress * 0.88, 0.62 + progress * 0.38];
  if (mode === 'plant') return [0.32 + progress * 0.68, 0.08 + progress * 0.92];
  const scale = 0.12 + progress * 0.88;
  return [scale, scale];
}

export function cutoutPuppetPosesAtProgress(
  rig: RegisteredCutoutPuppetRig,
  progress: number,
): readonly CutoutPuppetPartPose[] {
  const bounded = clampCutoutPuppetProgress(progress);
  return rig.parts.map((part) => {
    const local = localPartProgress(part, bounded);
    const [scaleX, scaleY] = scalesFor(part.scaleMode, local);
    return {
      part,
      reveal: local,
      angleDeg: part.initialAngleDeg * (1 - local),
      scaleX,
      scaleY,
    };
  });
}

export function cutoutPuppetLayerAtProgress(
  rig: RegisteredCutoutPuppetRig,
  progress: number,
  worldRoot: CutoutPuppetPoint,
  scale: number,
): CutoutPuppetRenderLayer {
  return {
    rigId: rig.id,
    progress: clampCutoutPuppetProgress(progress),
    worldRoot,
    scale,
    matureFootprint: rig.matureFootprint,
    depthSlot: rig.depthSlot,
    poses: cutoutPuppetPosesAtProgress(rig, progress),
  };
}

export function initialCutoutPuppetPlayback(): CutoutPuppetPlaybackState {
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

export function selectCutoutPuppetCue(
  state: CutoutPuppetPlaybackState,
  cueIndex: number,
  reducedMotion: boolean,
): CutoutPuppetPlaybackState {
  const bounded = Math.max(
    0,
    Math.min(CUTOUT_PUPPET_CUE_TARGETS.length - 1, Math.trunc(cueIndex)),
  );
  const targetProgress = CUTOUT_PUPPET_CUE_TARGETS[bounded]!;
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
  const transitionMs = CUTOUT_PUPPET_PLAYBACK_POLICY.transitionMs[bounded]!;
  const holdMs = CUTOUT_PUPPET_PLAYBACK_POLICY.holdMs[bounded]!;
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

export function replayCutoutPuppet(
  state: CutoutPuppetPlaybackState,
): CutoutPuppetPlaybackState {
  return {
    ...initialCutoutPuppetPlayback(),
    transitionId: state.transitionId + 1,
  };
}

export function advanceCutoutPuppetPlayback(
  state: CutoutPuppetPlaybackState,
  deltaMs: number,
): CutoutPuppetPlaybackState {
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

export function validateCutoutPuppetRig(
  rig: RegisteredCutoutPuppetRig,
): readonly string[] {
  const errors: string[] = [];
  if (rig.parts.length === 0 || rig.parts.length > rig.maxComponentCount) {
    errors.push(`component count ${rig.parts.length} exceeds the bounded rig`);
  }
  const ids = new Set<string>();
  let encodedBytes = 0;
  let decodedBytes = 0;
  let previousDepth = Number.NEGATIVE_INFINITY;
  for (const part of rig.parts) {
    if (ids.has(part.id)) errors.push(`duplicate part id ${part.id}`);
    ids.add(part.id);
    if (!part.modulePath.startsWith('./assets/chapter2-organic-cutout-puppet/')) {
      errors.push(`${part.id} is not a checked-in organic cutout asset`);
    }
    if (
      part.assetPivot.x < 0 ||
      part.assetPivot.x > part.canvas.width ||
      part.assetPivot.y < 0 ||
      part.assetPivot.y > part.canvas.height
    ) {
      errors.push(`${part.id} pivot leaves its fixed canvas`);
    }
    if (
      part.stage.start < 0 ||
      part.stage.end > 1 ||
      part.stage.end <= part.stage.start
    ) {
      errors.push(`${part.id} has an invalid stagger interval`);
    }
    if (part.layerDepth < previousDepth) {
      errors.push(`${part.id} breaks monotonic painter order`);
    }
    previousDepth = part.layerDepth;
    encodedBytes += part.encodedBytes;
    decodedBytes += part.canvas.width * part.canvas.height * 4;
  }
  if (encodedBytes !== rig.encodedComponentBytes) {
    errors.push(`encoded budget mismatch ${encodedBytes} != ${rig.encodedComponentBytes}`);
  }
  if (decodedBytes !== rig.decodedRgbaBytes) {
    errors.push(`decode budget mismatch ${decodedBytes} != ${rig.decodedRgbaBytes}`);
  }
  const root = rig.parts.find((part) => part.kind === 'rooted-trunk');
  if (!root || root.socket.x !== 0 || root.socket.y !== 0) {
    errors.push('rooted trunk must remain planted at rig-local (0,0)');
  }
  return errors;
}
