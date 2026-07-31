export interface MaskRevealPoint {
  readonly x: number;
  readonly y: number;
}

export interface OrganicMaskBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface OrganicMaskPath {
  readonly part: 'trunk' | 'branches' | 'plants';
  readonly points: readonly MaskRevealPoint[];
  readonly strokeWidth: number;
  readonly stagger: number;
}

export interface OrganicMaskFoliageCluster {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly stagger: number;
}

export type OrganicMaskDepthSlot = 'ground-plants' | 'hero-tree';
export type OrganicMaskLayerKind = 'plants' | 'hero-tree';

export interface RegisteredOrganicMaskLayer {
  readonly kind: OrganicMaskLayerKind;
  readonly modulePath:
    | './assets/chapter2-organic-growth/mask-reveal-v1/plant-cluster-mature.png'
    | './assets/chapter2-organic-growth/mask-reveal-v1/hero-tree-mature.png';
  readonly src: string;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly assetAnchor: MaskRevealPoint;
  readonly matureBounds: OrganicMaskBounds;
  readonly worldSocket: 'plants' | 'root';
  readonly scale: number;
  readonly depthSlot: OrganicMaskDepthSlot;
  readonly paths: readonly OrganicMaskPath[];
  readonly foliage: readonly OrganicMaskFoliageCluster[];
}

export interface RegisteredOrganicMaskRevealTrack {
  readonly id: 'chapter2-organic-mask-reveal-v1';
  readonly assetOrigin: 'checked-in-module-url';
  readonly layers: readonly RegisteredOrganicMaskLayer[];
  readonly budget: {
    readonly layerCount: 2;
    readonly encodedBytes: number;
    readonly decodedRgbaBytes: number;
    readonly maxEncodedBytes: number;
    readonly maxDecodedRgbaBytes: number;
  };
}

export interface MaskRevealState {
  readonly progress: number;
  readonly land: number;
  readonly trunk: number;
  readonly branches: number;
  readonly foliage: number;
  readonly plants: number;
}

export interface OrganicMaskRenderLayer extends RegisteredOrganicMaskLayer {
  readonly x: number;
  readonly y: number;
  readonly worldSocketPoint: MaskRevealPoint;
  readonly reveal: number;
  readonly revealState: MaskRevealState;
}

export interface OrganicMaskRevealRenderState {
  readonly id: RegisteredOrganicMaskRevealTrack['id'];
  readonly progress: number;
  readonly nativeLand: {
    readonly storyId: string;
    readonly worldAnchor: MaskRevealPoint;
    readonly reveal: number;
    readonly radiusX: number;
    readonly radiusY: number;
  };
  readonly layers: readonly OrganicMaskRenderLayer[];
}

export interface OrganicMaskRevealSockets {
  readonly root: MaskRevealPoint;
  readonly plants: MaskRevealPoint;
}

interface CenterlineSpec {
  readonly start: MaskRevealPoint;
  readonly end: MaskRevealPoint;
  readonly bend: number;
  readonly wave: number;
  readonly phase: number;
  readonly segments: number;
}

/**
 * Deterministic organic centreline generator. Registration is expressed through a start/end and
 * a small number of shape parameters; the renderer only stringifies the emitted point array.
 */
export function organicMaskCenterline(spec: CenterlineSpec): readonly MaskRevealPoint[] {
  const count = Math.max(2, Math.trunc(spec.segments));
  const dx = spec.end.x - spec.start.x;
  const dy = spec.end.y - spec.start.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const nx = -dy / magnitude;
  const ny = dx / magnitude;
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const t = index / (count - 1);
      const envelope = Math.sin(Math.PI * t);
      const offset =
        spec.bend * envelope +
        spec.wave * envelope * Math.sin(t * Math.PI * 2 + spec.phase);
      return Object.freeze({
        x: spec.start.x + dx * t + nx * offset,
        y: spec.start.y + dy * t + ny * offset,
      });
    }),
  );
}

function path(
  part: OrganicMaskPath['part'],
  strokeWidth: number,
  stagger: number,
  spec: CenterlineSpec,
): OrganicMaskPath {
  return Object.freeze({
    part,
    strokeWidth,
    stagger,
    points: organicMaskCenterline(spec),
  });
}

const PLANT_PATHS = Object.freeze([
  path('plants', 18, 0, {
    start: { x: 256, y: 230 },
    end: { x: 245, y: 135 },
    bend: -4,
    wave: 3,
    phase: 0.4,
    segments: 18,
  }),
  path('plants', 16, 0.12, {
    start: { x: 256, y: 230 },
    end: { x: 278, y: 135 },
    bend: 9,
    wave: 4,
    phase: 1.8,
    segments: 16,
  }),
  path('plants', 18, 0.24, {
    start: { x: 256, y: 230 },
    end: { x: 220, y: 165 },
    bend: -7,
    wave: 3,
    phase: 2.5,
    segments: 15,
  }),
  path('plants', 18, 0.32, {
    start: { x: 256, y: 230 },
    end: { x: 292, y: 148 },
    bend: 6,
    wave: 3,
    phase: 1.2,
    segments: 14,
  }),
  path('plants', 22, 0.4, {
    start: { x: 256, y: 228 },
    end: { x: 216, y: 218 },
    bend: -2,
    wave: 2,
    phase: 0.8,
    segments: 10,
  }),
  path('plants', 22, 0.48, {
    start: { x: 256, y: 228 },
    end: { x: 302, y: 216 },
    bend: 2,
    wave: 2,
    phase: 2,
    segments: 10,
  }),
] as const);

const TREE_PATHS = Object.freeze([
  path('trunk', 74, 0, {
    start: { x: 256, y: 480 },
    end: { x: 256, y: 315 },
    bend: 10,
    wave: 5,
    phase: 0.2,
    segments: 22,
  }),
  path('trunk', 24, 0.08, {
    start: { x: 256, y: 448 },
    end: { x: 176, y: 464 },
    bend: -4,
    wave: 3,
    phase: 1.3,
    segments: 13,
  }),
  path('trunk', 24, 0.14, {
    start: { x: 256, y: 448 },
    end: { x: 338, y: 466 },
    bend: 4,
    wave: 3,
    phase: 2.4,
    segments: 13,
  }),
  path('branches', 42, 0, {
    start: { x: 256, y: 350 },
    end: { x: 150, y: 285 },
    bend: -12,
    wave: 5,
    phase: 0.6,
    segments: 18,
  }),
  path('branches', 42, 0.08, {
    start: { x: 256, y: 348 },
    end: { x: 362, y: 285 },
    bend: 12,
    wave: 5,
    phase: 1.4,
    segments: 18,
  }),
  path('branches', 34, 0.18, {
    start: { x: 254, y: 326 },
    end: { x: 190, y: 245 },
    bend: -9,
    wave: 4,
    phase: 2.1,
    segments: 16,
  }),
  path('branches', 34, 0.25, {
    start: { x: 258, y: 326 },
    end: { x: 322, y: 245 },
    bend: 9,
    wave: 4,
    phase: 2.8,
    segments: 16,
  }),
] as const);

const TREE_FOLIAGE = Object.freeze([
  Object.freeze({ cx: 170, cy: 285, rx: 58, ry: 66, stagger: 0 }),
  Object.freeze({ cx: 256, cy: 260, rx: 76, ry: 52, stagger: 0.1 }),
  Object.freeze({ cx: 342, cy: 288, rx: 58, ry: 62, stagger: 0.2 }),
  Object.freeze({ cx: 220, cy: 325, rx: 76, ry: 52, stagger: 0.3 }),
  Object.freeze({ cx: 305, cy: 325, rx: 72, ry: 52, stagger: 0.4 }),
] as const);

const PLANT_SRC = new URL(
  './assets/chapter2-organic-growth/mask-reveal-v1/plant-cluster-mature.png',
  import.meta.url,
).href;
const HERO_TREE_SRC = new URL(
  './assets/chapter2-organic-growth/mask-reveal-v1/hero-tree-mature.png',
  import.meta.url,
).href;

export const CHAPTER2_ORGANIC_MASK_REVEAL_TRACK: RegisteredOrganicMaskRevealTrack =
  Object.freeze({
    id: 'chapter2-organic-mask-reveal-v1',
    assetOrigin: 'checked-in-module-url',
    layers: Object.freeze([
      Object.freeze({
        kind: 'plants',
        modulePath:
          './assets/chapter2-organic-growth/mask-reveal-v1/plant-cluster-mature.png',
        src: PLANT_SRC,
        canvas: Object.freeze({ width: 512, height: 256 }),
        assetAnchor: Object.freeze({ x: 256, y: 230 }),
        matureBounds: Object.freeze({ x: 212, y: 132, width: 91, height: 99 }),
        worldSocket: 'plants',
        scale: 0.22,
        depthSlot: 'ground-plants',
        paths: PLANT_PATHS,
        foliage: Object.freeze([]),
      }),
      Object.freeze({
        kind: 'hero-tree',
        modulePath:
          './assets/chapter2-organic-growth/mask-reveal-v1/hero-tree-mature.png',
        src: HERO_TREE_SRC,
        canvas: Object.freeze({ width: 512, height: 512 }),
        assetAnchor: Object.freeze({ x: 256, y: 480 }),
        matureBounds: Object.freeze({ x: 128, y: 223, width: 250, height: 258 }),
        worldSocket: 'root',
        scale: 0.38,
        depthSlot: 'hero-tree',
        paths: TREE_PATHS,
        foliage: TREE_FOLIAGE,
      }),
    ]),
    budget: Object.freeze({
      layerCount: 2,
      encodedBytes: 25_164,
      decodedRgbaBytes: 1_572_864,
      maxEncodedBytes: 65_536,
      // Two RGBA decode buffers: one active composition plus one browser upload/transition copy.
      maxDecodedRgbaBytes: 3_145_728,
    }),
  });

export const MASK_REVEAL_CUE_TARGETS = Object.freeze([0, 0.22, 0.52, 0.72, 0.9, 1] as const);

export const MASK_REVEAL_PLAYBACK_POLICY = Object.freeze({
  easing: 'smoothstep' as const,
  transitionMs: Object.freeze([0, 620, 780, 640, 660, 520] as const),
  holdMs: Object.freeze([0, 80, 120, 100, 80, 180] as const),
});

export interface MaskRevealPlaybackState {
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

function samePoint(a: MaskRevealPoint, b: MaskRevealPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function isLocalPng(layer: RegisteredOrganicMaskLayer): boolean {
  return (
    layer.modulePath.startsWith(
      './assets/chapter2-organic-growth/mask-reveal-v1/',
    ) &&
    layer.modulePath.endsWith('.png') &&
    (layer.src.endsWith('.png') ||
      layer.src.startsWith('data:image/png;base64,') ||
      layer.src.includes('.png?'))
  );
}

/** Fail closed before an unregistered or moving organic asset reaches the shared renderer. */
export function validateOrganicMaskRevealTrack(
  track: RegisteredOrganicMaskRevealTrack,
): RegisteredOrganicMaskRevealTrack {
  if (track.assetOrigin !== 'checked-in-module-url' || track.layers.length !== 2) {
    throw new Error('Organic mask reveal requires exactly two checked-in appearance layers.');
  }
  if (
    track.layers[0]?.kind !== 'plants' ||
    track.layers[0].depthSlot !== 'ground-plants' ||
    track.layers[1]?.kind !== 'hero-tree' ||
    track.layers[1].depthSlot !== 'hero-tree'
  ) {
    throw new Error('Organic mask layers must retain ground-plants then hero-tree painter order.');
  }
  for (const layer of track.layers) {
    if (!isLocalPng(layer) || layer.scale <= 0 || !Number.isFinite(layer.scale)) {
      throw new Error('Organic mask layers must be finite registered local PNGs.');
    }
    if (
      layer.paths.some(
        (entry) =>
          entry.points.length < 2 ||
          entry.strokeWidth <= 0 ||
          entry.stagger < 0 ||
          entry.stagger >= 1,
      )
    ) {
      throw new Error('Organic mask paths require bounded deterministic centreline geometry.');
    }
    const coverage = fullMaskCoverageBounds(layer);
    if (
      coverage.x > layer.matureBounds.x ||
      coverage.y > layer.matureBounds.y ||
      coverage.x + coverage.width <
        layer.matureBounds.x + layer.matureBounds.width ||
      coverage.y + coverage.height <
        layer.matureBounds.y + layer.matureBounds.height
    ) {
      throw new Error('Organic mask geometry clips the registered mature alpha bounds.');
    }
  }
  if (
    track.layers[0].canvas.width !== 512 ||
    track.layers[0].canvas.height !== 256 ||
    !samePoint(track.layers[0].assetAnchor, { x: 256, y: 230 }) ||
    track.layers[1].canvas.width !== 512 ||
    track.layers[1].canvas.height !== 512 ||
    !samePoint(track.layers[1].assetAnchor, { x: 256, y: 480 })
  ) {
    throw new Error('Organic mask assets do not match their normalized registration canvases.');
  }
  return track;
}

/** Conservative full-settlement envelope used by import proof to reject clipped mature alpha. */
export function fullMaskCoverageBounds(layer: RegisteredOrganicMaskLayer): OrganicMaskBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const pathEntry of layer.paths) {
    const halfStroke = pathEntry.strokeWidth / 2;
    for (const point of pathEntry.points) {
      minX = Math.min(minX, point.x - halfStroke);
      minY = Math.min(minY, point.y - halfStroke);
      maxX = Math.max(maxX, point.x + halfStroke);
      maxY = Math.max(maxY, point.y + halfStroke);
    }
  }
  for (const cluster of layer.foliage) {
    minX = Math.min(minX, cluster.cx - cluster.rx);
    minY = Math.min(minY, cluster.cy - cluster.ry);
    maxX = Math.max(maxX, cluster.cx + cluster.rx);
    maxY = Math.max(maxY, cluster.cy + cluster.ry);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    throw new Error('Organic mask layer has no registered coverage geometry.');
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function clampMaskRevealProgress(progress: number): number {
  if (!Number.isFinite(progress)) return progress === Number.POSITIVE_INFINITY ? 1 : 0;
  return Math.max(0, Math.min(1, progress));
}

function smoothstep(value: number): number {
  const t = clampMaskRevealProgress(value);
  return t * t * (3 - 2 * t);
}

function windowProgress(progress: number, start: number, end: number): number {
  return smoothstep((clampMaskRevealProgress(progress) - start) / (end - start));
}

/** Pure semantic progress -> the five continuous app-owned reveal channels. */
export function maskRevealStateAtProgress(progress: number): MaskRevealState {
  const normalized = clampMaskRevealProgress(progress);
  return {
    progress: normalized,
    land: windowProgress(normalized, 0, 0.22),
    trunk: windowProgress(normalized, 0.16, 0.58),
    branches: windowProgress(normalized, 0.34, 0.75),
    foliage: windowProgress(normalized, 0.5, 0.92),
    plants: windowProgress(normalized, 0.66, 1),
  };
}

export function strokeRevealAtProgress(
  progress: number,
): { readonly dashArray: 1; readonly dashOffset: number } {
  return {
    dashArray: 1,
    dashOffset: 1 - clampMaskRevealProgress(progress),
  };
}

function layerReveal(layer: RegisteredOrganicMaskLayer, state: MaskRevealState): number {
  return layer.kind === 'plants'
    ? state.plants
    : Math.max(state.trunk, state.branches, state.foliage);
}

/**
 * Compose registered appearance against fixed app/world sockets. Progress affects only mask
 * channels; x/y/scale are computed exclusively from immutable registration and socket geometry.
 */
export function buildOrganicMaskRevealLayer(
  track: RegisteredOrganicMaskRevealTrack,
  sockets: OrganicMaskRevealSockets,
  progress: number,
  storyId: string,
): OrganicMaskRevealRenderState {
  const valid = validateOrganicMaskRevealTrack(track);
  const revealState = maskRevealStateAtProgress(progress);
  const layers = valid.layers.map((layer): OrganicMaskRenderLayer => {
    const worldSocketPoint = sockets[layer.worldSocket];
    return {
      ...layer,
      x: worldSocketPoint.x - layer.assetAnchor.x * layer.scale,
      y: worldSocketPoint.y - layer.assetAnchor.y * layer.scale,
      worldSocketPoint,
      reveal: layerReveal(layer, revealState),
      revealState,
    };
  });
  return {
    id: valid.id,
    progress: revealState.progress,
    nativeLand: {
      storyId,
      worldAnchor: sockets.root,
      reveal: revealState.land,
      radiusX: 86,
      radiusY: 58,
    },
    layers,
  };
}

function boundedCueIndex(cueIndex: number): number {
  return Math.max(0, Math.min(MASK_REVEAL_CUE_TARGETS.length - 1, Math.trunc(cueIndex)));
}

export function initialMaskRevealPlayback(): MaskRevealPlaybackState {
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

export function selectMaskRevealCue(
  state: MaskRevealPlaybackState,
  cueIndex: number,
  reducedMotion: boolean,
): MaskRevealPlaybackState {
  const bounded = boundedCueIndex(cueIndex);
  const targetProgress = MASK_REVEAL_CUE_TARGETS[bounded]!;
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
  const transitionMs = MASK_REVEAL_PLAYBACK_POLICY.transitionMs[bounded]!;
  const holdMs = MASK_REVEAL_PLAYBACK_POLICY.holdMs[bounded]!;
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

/** Replay resets app state directly; the mature assets stay mounted and are never regenerated. */
export function replayMaskReveal(state: MaskRevealPlaybackState): MaskRevealPlaybackState {
  return {
    ...initialMaskRevealPlayback(),
    transitionId: state.transitionId + 1,
  };
}

export function advanceMaskRevealPlayback(
  state: MaskRevealPlaybackState,
  deltaMs: number,
): MaskRevealPlaybackState {
  if (!state.playing) return state;
  const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
  const elapsedMs = state.elapsedMs + safeDelta;
  const ratio = state.transitionMs === 0 ? 1 : elapsedMs / state.transitionMs;
  const progress =
    state.fromProgress +
    (state.targetProgress - state.fromProgress) * smoothstep(ratio);
  const playing = elapsedMs < state.transitionMs + state.holdMs;
  return {
    ...state,
    progress: playing ? progress : state.targetProgress,
    elapsedMs,
    playing,
  };
}
