export interface IslandGrowthPoint {
  readonly x: number;
  readonly y: number;
}

export interface IslandGrowthFootprint extends IslandGrowthPoint {
  readonly width: number;
  readonly height: number;
}

export interface IslandGrowthFrame {
  readonly index: number;
  readonly modulePath: `./assets/chapter2-island-growth/frame-${string}.png`;
  readonly src: string;
  readonly normalizedAnchor: IslandGrowthPoint;
}

export interface RegisteredIslandGrowthTrack {
  readonly id: string;
  readonly assetOrigin: 'checked-in-module-url';
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly frameCount: number;
  readonly frames: readonly IslandGrowthFrame[];
  readonly islandAnchor: IslandGrowthPoint;
  readonly treeRoot: IslandGrowthPoint;
  readonly matureFootprint: IslandGrowthFootprint;
  readonly depthSlot: 'island-growth-composite';
  readonly encodedFrameBytes: number;
  readonly decodedRgbaBytes: number;
}

const FRAME_COUNT = 9;
const ISLAND_ANCHOR = Object.freeze({ x: 128, y: 239 });

const FRAME_MODULE_PATHS = Object.freeze([
  './assets/chapter2-island-growth/frame-00.png',
  './assets/chapter2-island-growth/frame-01.png',
  './assets/chapter2-island-growth/frame-02.png',
  './assets/chapter2-island-growth/frame-03.png',
  './assets/chapter2-island-growth/frame-04.png',
  './assets/chapter2-island-growth/frame-05.png',
  './assets/chapter2-island-growth/frame-06.png',
  './assets/chapter2-island-growth/frame-07.png',
  './assets/chapter2-island-growth/frame-08.png',
] as const);

// Keep every module URL literal: Vite can then copy/hash each checked-in PNG for production.
const FRAME_URLS = Object.freeze([
  new URL('./assets/chapter2-island-growth/frame-00.png', import.meta.url).href,
  new URL('./assets/chapter2-island-growth/frame-01.png', import.meta.url).href,
  new URL('./assets/chapter2-island-growth/frame-02.png', import.meta.url).href,
  new URL('./assets/chapter2-island-growth/frame-03.png', import.meta.url).href,
  new URL('./assets/chapter2-island-growth/frame-04.png', import.meta.url).href,
  new URL('./assets/chapter2-island-growth/frame-05.png', import.meta.url).href,
  new URL('./assets/chapter2-island-growth/frame-06.png', import.meta.url).href,
  new URL('./assets/chapter2-island-growth/frame-07.png', import.meta.url).href,
  new URL('./assets/chapter2-island-growth/frame-08.png', import.meta.url).href,
]);

function checkedInFramePath(
  index: number,
): `./assets/chapter2-island-growth/frame-${string}.png` {
  const path = FRAME_MODULE_PATHS[index];
  if (!path) throw new Error(`Missing checked-in island growth frame ${index}.`);
  return path;
}

const FRAMES: readonly IslandGrowthFrame[] = Object.freeze(
  Array.from({ length: FRAME_COUNT }, (_, index) => {
    const modulePath = checkedInFramePath(index);
    return Object.freeze({
      index,
      modulePath,
      src: FRAME_URLS[index]!,
      normalizedAnchor: ISLAND_ANCHOR,
    });
  }),
);

/**
 * The registered appearance track. It deliberately contains no timing, easing, cue or clock:
 * those are product behavior owned by the semantic player below this author-time asset seam.
 */
export const CHAPTER2_ISLAND_GROWTH_TRACK: RegisteredIslandGrowthTrack = Object.freeze({
  id: 'chapter2-island-growth-v1',
  assetOrigin: 'checked-in-module-url',
  canvas: Object.freeze({ width: 256, height: 256 }),
  frameCount: FRAME_COUNT,
  frames: FRAMES,
  islandAnchor: ISLAND_ANCHOR,
  treeRoot: Object.freeze({ x: 128, y: 170 }),
  matureFootprint: Object.freeze({ x: 36, y: 12, width: 182, height: 228 }),
  depthSlot: 'island-growth-composite',
  encodedFrameBytes: 191_480,
  decodedRgbaBytes: 2_359_296,
});

/** App-owned semantic cue endpoints; the nine appearance frames never define cue meaning. */
export const ISLAND_GROWTH_CUE_TARGETS = Object.freeze([0, 0.18, 0.38, 0.6, 0.8, 1] as const);

export const ISLAND_GROWTH_PLAYBACK_POLICY = Object.freeze({
  easing: 'smoothstep' as const,
  transitionMs: Object.freeze([0, 520, 620, 680, 560, 720] as const),
  holdMs: Object.freeze([0, 80, 120, 100, 80, 220] as const),
});

export interface IslandGrowthPlaybackState {
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

function finiteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Island growth ${label} must be a finite number.`);
  }
}

function samePoint(a: IslandGrowthPoint, b: IslandGrowthPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Fail closed at the public seam before a malformed or drifting asset track reaches the renderer. */
export function validateIslandGrowthTrack(
  value: RegisteredIslandGrowthTrack,
): RegisteredIslandGrowthTrack {
  if (value.assetOrigin !== 'checked-in-module-url') {
    throw new Error('Island growth frames must use checked-in module URLs.');
  }
  if (value.canvas.width !== 256 || value.canvas.height !== 256 || value.frameCount !== 9) {
    throw new Error('Island growth requires one fixed 256x256 nine-frame track.');
  }
  if (value.frames.length !== value.frameCount) {
    throw new Error('Island growth frame count does not match the registered order.');
  }
  finiteNumber(value.islandAnchor.x, 'anchor x');
  finiteNumber(value.islandAnchor.y, 'anchor y');
  finiteNumber(value.treeRoot.x, 'tree root x');
  finiteNumber(value.treeRoot.y, 'tree root y');
  if (value.depthSlot !== 'island-growth-composite') {
    throw new Error('Island growth must use the registered composite painter slot.');
  }
  value.frames.forEach((frame, index) => {
    if (frame.index !== index || !samePoint(frame.normalizedAnchor, value.islandAnchor)) {
      throw new Error('Island growth frames must remain ordered on one normalized anchor.');
    }
    const expectedPath = checkedInFramePath(index);
    const isBundledPng =
      frame.src.endsWith('.png') || frame.src.startsWith('data:image/png;base64,');
    if (
      frame.modulePath !== expectedPath ||
      !isBundledPng ||
      frame.src.includes('contact-sheet')
    ) {
      throw new Error('Island growth runtime frames must be local registered PNGs.');
    }
  });
  return value;
}

export function clampNormalizedProgress(progress: number): number {
  if (!Number.isFinite(progress)) return progress === Number.POSITIVE_INFINITY ? 1 : 0;
  return Math.max(0, Math.min(1, progress));
}

/** Pure, deterministic [0,1] progress -> registered appearance-frame selection. */
export function islandGrowthFrameAtProgress(
  track: RegisteredIslandGrowthTrack,
  progress: number,
): IslandGrowthFrame {
  const valid = validateIslandGrowthTrack(track);
  const normalized = clampNormalizedProgress(progress);
  const index = Math.min(valid.frameCount - 1, Math.floor(normalized * valid.frameCount));
  return valid.frames[index]!;
}

function boundedCueIndex(cueIndex: number): number {
  return Math.max(0, Math.min(ISLAND_GROWTH_CUE_TARGETS.length - 1, Math.trunc(cueIndex)));
}

export function initialIslandGrowthPlayback(): IslandGrowthPlaybackState {
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

export function selectIslandGrowthCue(
  state: IslandGrowthPlaybackState,
  cueIndex: number,
  reducedMotion: boolean,
): IslandGrowthPlaybackState {
  const bounded = boundedCueIndex(cueIndex);
  const targetProgress = ISLAND_GROWTH_CUE_TARGETS[bounded]!;
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
  const transitionMs = ISLAND_GROWTH_PLAYBACK_POLICY.transitionMs[bounded]!;
  const holdMs = ISLAND_GROWTH_PLAYBACK_POLICY.holdMs[bounded]!;
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

/** Replay is a product-state reset, never a remount or asset-local restart. */
export function replayIslandGrowth(state: IslandGrowthPlaybackState): IslandGrowthPlaybackState {
  return {
    ...initialIslandGrowthPlayback(),
    transitionId: state.transitionId + 1,
  };
}

function smoothstep(value: number): number {
  const t = clampNormalizedProgress(value);
  return t * t * (3 - 2 * t);
}

export function advanceIslandGrowthPlayback(
  state: IslandGrowthPlaybackState,
  deltaMs: number,
): IslandGrowthPlaybackState {
  if (!state.playing) return state;
  const elapsedMs = state.elapsedMs + Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0);
  const transitionRatio = state.transitionMs === 0 ? 1 : elapsedMs / state.transitionMs;
  const eased = smoothstep(transitionRatio);
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
