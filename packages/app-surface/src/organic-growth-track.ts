import type { OrganicGrowthRenderLayer, OrganicGrowthDepthSlot } from './SceneView.js';

export interface OrganicGrowthPoint {
  readonly x: number;
  readonly y: number;
}

export interface OrganicGrowthFrame {
  readonly index: number;
  readonly modulePath: `./assets/chapter2-organic-growth/${string}/frame-${string}.png`;
  readonly src: string;
  readonly normalizedGroundAnchor: OrganicGrowthPoint;
}

export interface RegisteredOrganicGrowthClip {
  readonly id: 'hero-tree' | 'fern' | 'wildflower';
  readonly role: 'hero-tree' | 'ground-plant' | 'ground-flower';
  readonly assetOrigin: 'checked-in-module-url';
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly frameCount: number;
  readonly frames: readonly OrganicGrowthFrame[];
  readonly assetGroundAnchor: OrganicGrowthPoint;
  readonly matureFootprint: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface OrganicGrowthSocket {
  readonly id:
    | 'hero-root'
    | 'fern-west'
    | 'flower-east'
    | 'fern-north'
    | 'flower-south-east'
    | 'fern-south-west'
    | 'flower-south';
  readonly storyOrder: number;
  readonly clipId: RegisteredOrganicGrowthClip['id'];
  readonly rootOffset: OrganicGrowthPoint;
  readonly scale: number;
  readonly startProgress: number;
  readonly durationProgress: number;
  readonly depthSlot: OrganicGrowthDepthSlot;
  readonly painterOrder: number;
}

export interface RegisteredOrganicGrowthSet {
  readonly id: string;
  readonly assetOrigin: 'checked-in-module-url';
  readonly referencePlate: {
    readonly modulePath: './assets/chapter2-organic-growth/reference-plate.svg';
    readonly camera: 'app-svg-low-isometric-v1';
    readonly worldAnchor: 'primary-tree-root';
  };
  readonly clips: readonly RegisteredOrganicGrowthClip[];
  readonly sockets: readonly OrganicGrowthSocket[];
  readonly capabilityCorrespondence: {
    readonly seam: 'finite-story-order-sockets';
    readonly maxSockets: number;
    readonly uniqueClipCount: number;
    readonly maxReusePerClip: number;
  };
  readonly budget: {
    readonly encodedBytes: number;
    readonly decodedRgbaBytes: number;
    readonly uniqueFrameCount: number;
    readonly maxRuntimeLayers: number;
  };
}

const HERO_ANCHOR = Object.freeze({ x: 80, y: 189 });
const SUPPORT_ANCHOR = Object.freeze({ x: 32, y: 59 });

const HERO_PATHS = Object.freeze([
  './assets/chapter2-organic-growth/hero-tree/frame-00.png',
  './assets/chapter2-organic-growth/hero-tree/frame-01.png',
  './assets/chapter2-organic-growth/hero-tree/frame-02.png',
  './assets/chapter2-organic-growth/hero-tree/frame-03.png',
  './assets/chapter2-organic-growth/hero-tree/frame-04.png',
  './assets/chapter2-organic-growth/hero-tree/frame-05.png',
  './assets/chapter2-organic-growth/hero-tree/frame-06.png',
  './assets/chapter2-organic-growth/hero-tree/frame-07.png',
] as const);

const FERN_PATHS = Object.freeze([
  './assets/chapter2-organic-growth/fern/frame-00.png',
  './assets/chapter2-organic-growth/fern/frame-01.png',
  './assets/chapter2-organic-growth/fern/frame-02.png',
  './assets/chapter2-organic-growth/fern/frame-03.png',
] as const);

const FLOWER_PATHS = Object.freeze([
  './assets/chapter2-organic-growth/wildflower/frame-00.png',
  './assets/chapter2-organic-growth/wildflower/frame-01.png',
  './assets/chapter2-organic-growth/wildflower/frame-02.png',
  './assets/chapter2-organic-growth/wildflower/frame-03.png',
] as const);

// Every URL remains literal so Vite copies/hashes the checked-in transparent frames.
const HERO_URLS = Object.freeze([
  new URL('./assets/chapter2-organic-growth/hero-tree/frame-00.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/hero-tree/frame-01.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/hero-tree/frame-02.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/hero-tree/frame-03.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/hero-tree/frame-04.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/hero-tree/frame-05.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/hero-tree/frame-06.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/hero-tree/frame-07.png', import.meta.url).href,
]);

const FERN_URLS = Object.freeze([
  new URL('./assets/chapter2-organic-growth/fern/frame-00.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/fern/frame-01.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/fern/frame-02.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/fern/frame-03.png', import.meta.url).href,
]);

const FLOWER_URLS = Object.freeze([
  new URL('./assets/chapter2-organic-growth/wildflower/frame-00.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/wildflower/frame-01.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/wildflower/frame-02.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-growth/wildflower/frame-03.png', import.meta.url).href,
]);

function frames(
  paths: readonly OrganicGrowthFrame['modulePath'][],
  urls: readonly string[],
  anchor: OrganicGrowthPoint,
): readonly OrganicGrowthFrame[] {
  return Object.freeze(paths.map((modulePath, index) => Object.freeze({
    index,
    modulePath,
    src: urls[index]!,
    normalizedGroundAnchor: anchor,
  })));
}

const CLIPS: readonly RegisteredOrganicGrowthClip[] = Object.freeze([
  Object.freeze({
    id: 'hero-tree',
    role: 'hero-tree',
    assetOrigin: 'checked-in-module-url',
    canvas: Object.freeze({ width: 160, height: 192 }),
    frameCount: 8,
    frames: frames(HERO_PATHS, HERO_URLS, HERO_ANCHOR),
    assetGroundAnchor: HERO_ANCHOR,
    matureFootprint: Object.freeze({ x: 10, y: 12, width: 139, height: 178 }),
  }),
  Object.freeze({
    id: 'fern',
    role: 'ground-plant',
    assetOrigin: 'checked-in-module-url',
    canvas: Object.freeze({ width: 64, height: 64 }),
    frameCount: 4,
    frames: frames(FERN_PATHS, FERN_URLS, SUPPORT_ANCHOR),
    assetGroundAnchor: SUPPORT_ANCHOR,
    matureFootprint: Object.freeze({ x: 3, y: 11, width: 57, height: 53 }),
  }),
  Object.freeze({
    id: 'wildflower',
    role: 'ground-flower',
    assetOrigin: 'checked-in-module-url',
    canvas: Object.freeze({ width: 64, height: 64 }),
    frameCount: 4,
    frames: frames(FLOWER_PATHS, FLOWER_URLS, SUPPORT_ANCHOR),
    assetGroundAnchor: SUPPORT_ANCHOR,
    matureFootprint: Object.freeze({ x: 15, y: 5, width: 40, height: 55 }),
  }),
]);

const SOCKETS: readonly OrganicGrowthSocket[] = Object.freeze([
  Object.freeze({
    id: 'hero-root',
    storyOrder: 0,
    clipId: 'hero-tree',
    rootOffset: Object.freeze({ x: 0, y: 0 }),
    scale: 0.43,
    startProgress: 0.16,
    durationProgress: 0.46,
    depthSlot: 'organic-hero-tree',
    painterOrder: 20,
  }),
  Object.freeze({
    id: 'fern-west',
    storyOrder: 1,
    clipId: 'fern',
    rootOffset: Object.freeze({ x: -31, y: -8 }),
    scale: 0.36,
    startProgress: 0.38,
    durationProgress: 0.22,
    depthSlot: 'organic-ground-back',
    painterOrder: 10,
  }),
  Object.freeze({
    id: 'flower-east',
    storyOrder: 2,
    clipId: 'wildflower',
    rootOffset: Object.freeze({ x: 29, y: -7 }),
    scale: 0.34,
    startProgress: 0.44,
    durationProgress: 0.2,
    depthSlot: 'organic-ground-back',
    painterOrder: 11,
  }),
  Object.freeze({
    id: 'fern-north',
    storyOrder: 3,
    clipId: 'fern',
    rootOffset: Object.freeze({ x: -11, y: -3 }),
    scale: 0.32,
    startProgress: 0.5,
    durationProgress: 0.22,
    depthSlot: 'organic-ground-back',
    painterOrder: 12,
  }),
  Object.freeze({
    id: 'flower-south-east',
    storyOrder: 4,
    clipId: 'wildflower',
    rootOffset: Object.freeze({ x: 27, y: 11 }),
    scale: 0.35,
    startProgress: 0.56,
    durationProgress: 0.2,
    depthSlot: 'organic-ground-front',
    painterOrder: 30,
  }),
  Object.freeze({
    id: 'fern-south-west',
    storyOrder: 5,
    clipId: 'fern',
    rootOffset: Object.freeze({ x: -26, y: 15 }),
    scale: 0.34,
    startProgress: 0.62,
    durationProgress: 0.22,
    depthSlot: 'organic-ground-front',
    painterOrder: 31,
  }),
  Object.freeze({
    id: 'flower-south',
    storyOrder: 6,
    clipId: 'wildflower',
    rootOffset: Object.freeze({ x: 5, y: 19 }),
    scale: 0.36,
    startProgress: 0.68,
    durationProgress: 0.2,
    depthSlot: 'organic-ground-front',
    painterOrder: 32,
  }),
]);

export const CHAPTER2_SOCKET_CHOREOGRAPHY: RegisteredOrganicGrowthSet = Object.freeze({
  id: 'chapter2-organic-socket-choreography-v1',
  assetOrigin: 'checked-in-module-url',
  referencePlate: Object.freeze({
    modulePath: './assets/chapter2-organic-growth/reference-plate.svg',
    camera: 'app-svg-low-isometric-v1',
    worldAnchor: 'primary-tree-root',
  }),
  clips: CLIPS,
  sockets: SOCKETS,
  capabilityCorrespondence: Object.freeze({
    seam: 'finite-story-order-sockets',
    maxSockets: 7,
    uniqueClipCount: 3,
    maxReusePerClip: 3,
  }),
  budget: Object.freeze({
    encodedBytes: 66_723,
    decodedRgbaBytes: 1_114_112,
    uniqueFrameCount: 16,
    maxRuntimeLayers: 7,
  }),
});

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`Organic growth ${label} must be finite.`);
}

function samePoint(a: OrganicGrowthPoint, b: OrganicGrowthPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

export function clampOrganicProgress(progress: number): number {
  if (!Number.isFinite(progress)) return progress === Number.POSITIVE_INFINITY ? 1 : 0;
  return Math.max(0, Math.min(1, progress));
}

export function localClipProgress(
  globalProgress: number,
  startProgress: number,
  durationProgress: number,
): number {
  finite(startProgress, 'start progress');
  finite(durationProgress, 'duration');
  if (durationProgress <= 0) throw new Error('Organic growth duration must be positive.');
  const normalized = clampOrganicProgress(globalProgress);
  if (normalized <= startProgress) return 0;
  if (normalized >= startProgress + durationProgress - 1e-12) return 1;
  return (normalized - startProgress) / durationProgress;
}

export function validateOrganicGrowthSet(
  value: RegisteredOrganicGrowthSet,
): RegisteredOrganicGrowthSet {
  if (value.assetOrigin !== 'checked-in-module-url') {
    throw new Error('Organic growth requires checked-in module assets.');
  }
  if (value.clips.length !== 3 || value.sockets.length !== 7) {
    throw new Error('Organic growth is bounded to three clips and seven sockets.');
  }
  const ids = new Set<RegisteredOrganicGrowthClip['id']>();
  let expectedDecoded = 0;
  for (const clip of value.clips) {
    if (ids.has(clip.id)) throw new Error('Organic growth clip ids must be unique.');
    ids.add(clip.id);
    if (clip.frames.length !== clip.frameCount) {
      throw new Error(`Organic growth clip ${clip.id} frame count drifted.`);
    }
    expectedDecoded += clip.canvas.width * clip.canvas.height * 4 * clip.frameCount;
    clip.frames.forEach((frame, index) => {
      if (frame.index !== index || !samePoint(frame.normalizedGroundAnchor, clip.assetGroundAnchor)) {
        throw new Error(`Organic growth clip ${clip.id} lost its normalized ground anchor.`);
      }
      if (
        !frame.modulePath.startsWith(`./assets/chapter2-organic-growth/${clip.id}/`) ||
        !(frame.src.endsWith('.png') || frame.src.startsWith('data:image/png;base64,'))
      ) {
        throw new Error(`Organic growth clip ${clip.id} must use local transparent PNG modules.`);
      }
    });
  }
  if (expectedDecoded !== value.budget.decodedRgbaBytes) {
    throw new Error('Organic growth decoded budget does not match the registered frames.');
  }
  const socketIds = new Set<string>();
  const reuse = new Map<string, number>();
  let priorStart = -1;
  for (const socket of value.sockets) {
    if (socketIds.has(socket.id) || !ids.has(socket.clipId)) {
      throw new Error('Organic growth sockets must be unique and reference registered clips.');
    }
    socketIds.add(socket.id);
    reuse.set(socket.clipId, (reuse.get(socket.clipId) ?? 0) + 1);
    finite(socket.rootOffset.x, 'socket x');
    finite(socket.rootOffset.y, 'socket y');
    finite(socket.startProgress, 'socket start');
    finite(socket.durationProgress, 'socket duration');
    if (socket.startProgress <= priorStart || socket.durationProgress <= 0) {
      throw new Error('Organic growth sockets require one strictly staggered positive schedule.');
    }
    priorStart = socket.startProgress;
  }
  if (
    reuse.get('hero-tree') !== 1 ||
    reuse.get('fern') !== 3 ||
    reuse.get('wildflower') !== 3
  ) {
    throw new Error('Organic growth reuse must stay at one hero plus two clips reused three times.');
  }
  return value;
}

export function selectOrganicGrowthFrame(
  clip: RegisteredOrganicGrowthClip,
  progress: number,
): OrganicGrowthFrame {
  const normalized = clampOrganicProgress(progress);
  const index = Math.min(clip.frameCount - 1, Math.floor(normalized * clip.frameCount));
  return clip.frames[index]!;
}

export function organicGrowthLayersAtProgress(
  set: RegisteredOrganicGrowthSet,
  rootWorldAnchor: OrganicGrowthPoint,
  globalProgress: number,
): readonly OrganicGrowthRenderLayer[] {
  const valid = validateOrganicGrowthSet(set);
  const clips = new Map(valid.clips.map((clip) => [clip.id, clip]));
  return valid.sockets
    .map((socket): OrganicGrowthRenderLayer => {
      const clip = clips.get(socket.clipId)!;
      const progress = localClipProgress(
        globalProgress,
        socket.startProgress,
        socket.durationProgress,
      );
      const frame = selectOrganicGrowthFrame(clip, progress);
      return Object.freeze({
        src: frame.src,
        clipId: clip.id,
        socketId: socket.id,
        frameIndex: frame.index,
        canvas: clip.canvas,
        assetAnchor: clip.assetGroundAnchor,
        worldAnchor: Object.freeze({
          x: rootWorldAnchor.x + socket.rootOffset.x,
          y: rootWorldAnchor.y + socket.rootOffset.y,
        }),
        scale: socket.scale,
        depthSlot: socket.depthSlot,
        painterOrder: socket.painterOrder,
        localProgress: progress,
      });
    })
    .sort((a, b) => a.painterOrder - b.painterOrder);
}
