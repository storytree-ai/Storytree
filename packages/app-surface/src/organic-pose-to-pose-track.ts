export interface OrganicPosePoint {
  readonly x: number;
  readonly y: number;
}

export interface OrganicPoseFootprint extends OrganicPosePoint {
  readonly width: number;
  readonly height: number;
}

export type OrganicPoseTrackKind = 'hero-tree' | 'plant-sample';

export type OrganicPoseDepthSlot = 'hero-tree-organic' | 'ground-plant-organic';

export interface OrganicPoseFrame {
  readonly index: number;
  readonly modulePath: `./${string}.png`;
  readonly src: string;
  readonly sourceAnchor: OrganicPosePoint;
  /**
   * Import metadata only. The renderer uses normalizedAnchor and never applies this offset.
   */
  readonly normalizationOffset: OrganicPosePoint;
  readonly normalizedAnchor: OrganicPosePoint;
}

export interface OrganicPoseHold {
  readonly frameIndex: number;
  readonly threshold: number;
  readonly holdUntil: number;
}

export interface OrganicPoseProvenance {
  readonly prompt: string;
  readonly modelId: string;
  readonly generationId: string;
  readonly licence: string;
  readonly notes: string;
  readonly referencePlateId: string;
}

export interface OrganicPoseTrack {
  readonly id: string;
  readonly kind: OrganicPoseTrackKind;
  readonly assetOrigin: 'checked-in-module-url';
  readonly transparent: true;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly frameDimensions: {
    readonly width: number;
    readonly height: number;
  };
  readonly frameCount: number;
  readonly frames: readonly OrganicPoseFrame[];
  readonly poses: readonly OrganicPoseHold[];
  readonly groundAnchor: OrganicPosePoint;
  readonly normalizationMode: 'author-import-time-only';
  readonly depthSlot: OrganicPoseDepthSlot;
  readonly matureFootprint: OrganicPoseFootprint;
  readonly encodedBytes: number;
  readonly decodedRgbaBytes: number;
  readonly provenance: OrganicPoseProvenance;
}

export interface OrganicPoseRegistryBudget {
  readonly maxEncodedBytes: number;
  readonly maxDecodedRgbaBytes: number;
  readonly maxFrameCount: number;
  readonly maxLayerCount: number;
}

export interface RegisteredOrganicPoseRegistry {
  readonly id: string;
  readonly tracks: readonly OrganicPoseTrack[];
  readonly budget: OrganicPoseRegistryBudget;
}

export const ORGANIC_POSE_CUE_TARGETS = Object.freeze(
  [0, 0.18, 0.38, 0.6, 0.8, 1] as const,
);

export const ORGANIC_POSE_PLAYBACK_POLICY = Object.freeze({
  easing: 'smoothstep' as const,
  transitionMs: Object.freeze([0, 520, 620, 680, 560, 720] as const),
  holdMs: Object.freeze([0, 80, 120, 100, 80, 220] as const),
});

export type OrganicPosePlaybackPhase = 'settled' | 'transitioning' | 'holding';

export interface OrganicPosePlaybackState {
  readonly cueIndex: number;
  readonly progress: number;
  readonly fromProgress: number;
  readonly targetProgress: number;
  readonly elapsedMs: number;
  readonly transitionMs: number;
  readonly holdMs: number;
  readonly phase: OrganicPosePlaybackPhase;
  readonly playing: boolean;
  readonly transitionId: number;
}

function finiteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Organic pose ${label} must be a finite number.`);
  }
}

function positiveInteger(value: unknown, label: string): asserts value is number {
  finiteNumber(value, label);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Organic pose ${label} must be a positive integer.`);
  }
}

function nonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Organic pose ${label} must be recorded.`);
  }
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * 8;
}

function samePoint(left: OrganicPosePoint, right: OrganicPosePoint): boolean {
  return sameNumber(left.x, right.x) && sameNumber(left.y, right.y);
}

function isLocalModuleUrl(src: string): boolean {
  if (
    (src.startsWith('/') && !src.startsWith('//')) ||
    src.startsWith('file:') ||
    src.startsWith('data:image/png;base64,') ||
    /^[A-Za-z]:[\\/]/.test(src) ||
    /^https?:\/\/localhost(?::\d+)?\//.test(src)
  ) {
    return true;
  }
  if (/^https?:\/\//.test(src) && typeof window !== 'undefined') {
    try {
      return new URL(src).origin === window.location.origin;
    } catch {
      return false;
    }
  }
  return false;
}

const FORBIDDEN_RUNTIME_FIELD =
  /(?:pixellab(?:url|host|endpoint)?|vendor(?:url|client)?|client|credentials?|api[-_]?key|secret|token|asset[-_]?clock|clock|timer|animation[-_]?cursor)/i;

function assertNoRuntimeVendorFields(value: unknown): void {
  const visited = new WeakSet<object>();
  const visit = (candidate: unknown): void => {
    if (typeof candidate === 'string') {
      if (/https?:\/\/(?:[^/]*\.)?pixellab\.ai(?:\/|$)/i.test(candidate)) {
        throw new Error('Organic pose manifests cannot contain a runtime PixelLab URL.');
      }
      return;
    }
    if (candidate === null || typeof candidate !== 'object') return;
    if (visited.has(candidate)) return;
    visited.add(candidate);
    for (const [field, child] of Object.entries(candidate)) {
      if (FORBIDDEN_RUNTIME_FIELD.test(field)) {
        throw new Error(`Organic pose manifest contains forbidden runtime field "${field}".`);
      }
      visit(child);
    }
  };
  visit(value);
}

function validatePoint(point: OrganicPosePoint, label: string): void {
  finiteNumber(point.x, `${label} x`);
  finiteNumber(point.y, `${label} y`);
}

function expectedDepthSlot(kind: OrganicPoseTrackKind): OrganicPoseDepthSlot {
  return kind === 'hero-tree' ? 'hero-tree-organic' : 'ground-plant-organic';
}

function validateProvenance(provenance: OrganicPoseProvenance): void {
  nonEmpty(provenance.prompt, 'prompt');
  nonEmpty(provenance.modelId, 'model id');
  nonEmpty(provenance.generationId, 'generation id');
  nonEmpty(provenance.licence, 'licence');
  nonEmpty(provenance.notes, 'provenance notes');
  nonEmpty(provenance.referencePlateId, 'reference plate id');
}

export function validateOrganicPoseTrack(track: OrganicPoseTrack): OrganicPoseTrack {
  assertNoRuntimeVendorFields(track);
  nonEmpty(track.id, 'track id');
  if (track.kind !== 'hero-tree' && track.kind !== 'plant-sample') {
    throw new Error('Organic pose tracks must be a hero-tree or bounded plant sample.');
  }
  if (track.assetOrigin !== 'checked-in-module-url' || track.transparent !== true) {
    throw new Error('Organic pose frames must be transparent checked-in module URLs.');
  }
  positiveInteger(track.canvas.width, 'canvas width');
  positiveInteger(track.canvas.height, 'canvas height');
  positiveInteger(track.frameDimensions.width, 'frame width');
  positiveInteger(track.frameDimensions.height, 'frame height');
  if (
    track.frameDimensions.width !== track.canvas.width ||
    track.frameDimensions.height !== track.canvas.height
  ) {
    throw new Error('Organic pose frames must retain one fixed canvas.');
  }
  positiveInteger(track.frameCount, 'frame count');
  if (track.frames.length !== track.frameCount || track.poses.length !== track.frameCount) {
    throw new Error('Organic pose frame and pose counts must match the registered order.');
  }
  validatePoint(track.groundAnchor, 'ground anchor');
  if (track.normalizationMode !== 'author-import-time-only') {
    throw new Error('Organic pose anchor normalization is author/import-time only.');
  }
  if (track.depthSlot !== expectedDepthSlot(track.kind)) {
    throw new Error('Organic pose track uses the wrong registered depth slot.');
  }
  validatePoint(track.matureFootprint, 'mature footprint');
  positiveInteger(track.matureFootprint.width, 'mature footprint width');
  positiveInteger(track.matureFootprint.height, 'mature footprint height');
  positiveInteger(track.encodedBytes, 'encoded bytes');
  positiveInteger(track.decodedRgbaBytes, 'decoded RGBA bytes');
  const expectedDecodedBytes =
    track.frameDimensions.width * track.frameDimensions.height * 4 * track.frameCount;
  if (track.decodedRgbaBytes !== expectedDecodedBytes) {
    throw new Error('Organic pose decoded RGBA cost must match its fixed frames.');
  }
  validateProvenance(track.provenance);

  track.frames.forEach((frame, index) => {
    if (frame.index !== index) {
      throw new Error('Organic pose frames must remain in registered playback order.');
    }
    if (
      !frame.modulePath.startsWith('./assets/') ||
      frame.modulePath.includes('../') ||
      !isLocalModuleUrl(frame.src)
    ) {
      throw new Error('Organic pose frames must resolve from a local module URL.');
    }
    validatePoint(frame.sourceAnchor, `frame ${index} source anchor`);
    validatePoint(frame.normalizationOffset, `frame ${index} normalization offset`);
    validatePoint(frame.normalizedAnchor, `frame ${index} normalized anchor`);
    const importedAnchor = {
      x: frame.sourceAnchor.x + frame.normalizationOffset.x,
      y: frame.sourceAnchor.y + frame.normalizationOffset.y,
    };
    if (
      !samePoint(importedAnchor, track.groundAnchor) ||
      !samePoint(frame.normalizedAnchor, track.groundAnchor)
    ) {
      throw new Error(
        'Organic pose frames must retain one ground anchor after author-time normalization.',
      );
    }
  });

  track.poses.forEach((pose, index) => {
    finiteNumber(pose.threshold, `pose ${index} threshold`);
    finiteNumber(pose.holdUntil, `pose ${index} hold`);
    if (
      pose.frameIndex !== index ||
      pose.threshold < 0 ||
      pose.holdUntil > 1 ||
      pose.threshold >= pose.holdUntil
    ) {
      throw new Error('Organic pose thresholds and holds must be ordered within [0,1].');
    }
    const expectedThreshold = index === 0 ? 0 : track.poses[index - 1]!.holdUntil;
    if (!sameNumber(pose.threshold, expectedThreshold)) {
      throw new Error('Organic pose thresholds and holds must form one continuous mapping.');
    }
  });
  if (!sameNumber(track.poses.at(-1)!.holdUntil, 1)) {
    throw new Error('Organic pose holds must retain the final pose through progress 1.');
  }
  return track;
}

export function validateOrganicPoseRegistry(
  registry: RegisteredOrganicPoseRegistry,
): RegisteredOrganicPoseRegistry {
  assertNoRuntimeVendorFields(registry);
  nonEmpty(registry.id, 'registry id');
  const tracks = registry.tracks.map(validateOrganicPoseTrack);
  if (
    tracks.length !== 2 ||
    tracks[0]?.kind !== 'hero-tree' ||
    tracks[1]?.kind !== 'plant-sample'
  ) {
    throw new Error(
      'Organic pose Experiment 1 requires separate hero-tree and bounded plant sample layers.',
    );
  }
  positiveInteger(registry.budget.maxEncodedBytes, 'encoded byte budget');
  positiveInteger(registry.budget.maxDecodedRgbaBytes, 'decoded RGBA byte budget');
  positiveInteger(registry.budget.maxFrameCount, 'frame budget');
  positiveInteger(registry.budget.maxLayerCount, 'layer budget');
  const encodedBytes = tracks.reduce((total, track) => total + track.encodedBytes, 0);
  const decodedRgbaBytes = tracks.reduce(
    (total, track) => total + track.decodedRgbaBytes,
    0,
  );
  const frameCount = tracks.reduce((total, track) => total + track.frameCount, 0);
  if (encodedBytes > registry.budget.maxEncodedBytes) {
    throw new Error('Organic pose tracks exceed the encoded byte budget.');
  }
  if (decodedRgbaBytes > registry.budget.maxDecodedRgbaBytes) {
    throw new Error('Organic pose tracks exceed the decoded RGBA byte budget.');
  }
  if (frameCount > registry.budget.maxFrameCount) {
    throw new Error('Organic pose tracks exceed the frame budget.');
  }
  if (tracks.length > registry.budget.maxLayerCount) {
    throw new Error('Organic pose tracks exceed the layer budget.');
  }
  return registry;
}

export function clampOrganicPoseProgress(progress: number): number {
  if (!Number.isFinite(progress)) return progress === Number.POSITIVE_INFINITY ? 1 : 0;
  return Math.max(0, Math.min(1, progress));
}

export function organicPoseFrameAtProgress(
  track: OrganicPoseTrack,
  progress: number,
): OrganicPoseFrame {
  const valid = validateOrganicPoseTrack(track);
  const normalized = clampOrganicPoseProgress(progress);
  let selected = valid.poses[0]!;
  for (const pose of valid.poses) {
    if (normalized < pose.threshold) break;
    selected = pose;
  }
  return valid.frames[selected.frameIndex]!;
}

function boundedCueIndex(cueIndex: number): number {
  if (!Number.isFinite(cueIndex)) return 0;
  return Math.max(0, Math.min(ORGANIC_POSE_CUE_TARGETS.length - 1, Math.trunc(cueIndex)));
}

export function initialOrganicPosePlayback(): OrganicPosePlaybackState {
  return {
    cueIndex: 0,
    progress: 0,
    fromProgress: 0,
    targetProgress: 0,
    elapsedMs: 0,
    transitionMs: 0,
    holdMs: 0,
    phase: 'settled',
    playing: false,
    transitionId: 0,
  };
}

export function selectOrganicPoseCue(
  state: OrganicPosePlaybackState,
  cueIndex: number,
  reducedMotion: boolean,
): OrganicPosePlaybackState {
  const bounded = boundedCueIndex(cueIndex);
  const targetProgress = ORGANIC_POSE_CUE_TARGETS[bounded]!;
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
      phase: 'settled',
      playing: false,
      transitionId,
    };
  }
  const transitionMs =
    state.progress === targetProgress
      ? 0
      : ORGANIC_POSE_PLAYBACK_POLICY.transitionMs[bounded]!;
  const holdMs = ORGANIC_POSE_PLAYBACK_POLICY.holdMs[bounded]!;
  const phase: OrganicPosePlaybackPhase =
    transitionMs > 0 ? 'transitioning' : holdMs > 0 ? 'holding' : 'settled';
  return {
    cueIndex: bounded,
    progress: state.progress,
    fromProgress: state.progress,
    targetProgress,
    elapsedMs: 0,
    transitionMs,
    holdMs,
    phase,
    playing: phase !== 'settled',
    transitionId,
  };
}

export function nextOrganicPoseCue(
  state: OrganicPosePlaybackState,
  reducedMotion: boolean,
): OrganicPosePlaybackState {
  return selectOrganicPoseCue(state, state.cueIndex + 1, reducedMotion);
}

export function backOrganicPoseCue(
  state: OrganicPosePlaybackState,
  reducedMotion: boolean,
): OrganicPosePlaybackState {
  return selectOrganicPoseCue(state, state.cueIndex - 1, reducedMotion);
}

export function replayOrganicPosePlayback(
  state: OrganicPosePlaybackState,
): OrganicPosePlaybackState {
  return {
    ...initialOrganicPosePlayback(),
    transitionId: state.transitionId + 1,
  };
}

function smoothstep(value: number): number {
  const normalized = clampOrganicPoseProgress(value);
  return normalized * normalized * (3 - 2 * normalized);
}

export function advanceOrganicPosePlayback(
  state: OrganicPosePlaybackState,
  deltaMs: number,
): OrganicPosePlaybackState {
  if (!state.playing) return state;
  const boundedDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
  const elapsedMs = state.elapsedMs + boundedDelta;
  const transitionRatio =
    state.transitionMs === 0 ? 1 : elapsedMs / state.transitionMs;
  const eased = smoothstep(transitionRatio);
  const progress =
    state.fromProgress + (state.targetProgress - state.fromProgress) * eased;
  const totalMs = state.transitionMs + state.holdMs;
  const phase: OrganicPosePlaybackPhase =
    elapsedMs < state.transitionMs
      ? 'transitioning'
      : elapsedMs < totalMs
        ? 'holding'
        : 'settled';
  return {
    ...state,
    progress: phase === 'transitioning' ? progress : state.targetProgress,
    elapsedMs,
    phase,
    playing: phase !== 'settled',
  };
}
