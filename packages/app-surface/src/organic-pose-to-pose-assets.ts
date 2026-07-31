import {
  type OrganicPoseFrame,
  type OrganicPoseHold,
  type OrganicPosePoint,
  type OrganicPoseTrack,
  type RegisteredOrganicPoseRegistry,
} from './organic-pose-to-pose-track.js';

const TREE_MODULE_PATHS = Object.freeze([
  './assets/chapter2-organic-pose-to-pose/tree/frame-00.png',
  './assets/chapter2-organic-pose-to-pose/tree/frame-01.png',
  './assets/chapter2-organic-pose-to-pose/tree/frame-02.png',
  './assets/chapter2-organic-pose-to-pose/tree/frame-03.png',
  './assets/chapter2-organic-pose-to-pose/tree/frame-04.png',
  './assets/chapter2-organic-pose-to-pose/tree/frame-05.png',
  './assets/chapter2-organic-pose-to-pose/tree/frame-06.png',
  './assets/chapter2-organic-pose-to-pose/tree/frame-07.png',
  './assets/chapter2-organic-pose-to-pose/tree/frame-08.png',
] as const);

const TREE_URLS = Object.freeze([
  new URL('./assets/chapter2-organic-pose-to-pose/tree/frame-00.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/tree/frame-01.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/tree/frame-02.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/tree/frame-03.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/tree/frame-04.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/tree/frame-05.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/tree/frame-06.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/tree/frame-07.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/tree/frame-08.png', import.meta.url).href,
]);

const TREE_SOURCE_ANCHORS = Object.freeze([
  { x: 94, y: 175 },
  { x: 94, y: 175 },
  { x: 94, y: 175 },
  { x: 94, y: 175 },
  { x: 94, y: 175 },
  { x: 95, y: 175 },
  { x: 95, y: 175 },
  { x: 94, y: 179 },
  { x: 100, y: 180 },
] as const);

const TREE_NORMALIZATION_OFFSETS = Object.freeze([
  { x: 2, y: 13 },
  { x: 2, y: 13 },
  { x: 2, y: 13 },
  { x: 2, y: 13 },
  { x: 2, y: 13 },
  { x: 1, y: 13 },
  { x: 1, y: 13 },
  { x: 2, y: 9 },
  { x: -4, y: 8 },
] as const);

const PLANT_MODULE_PATHS = Object.freeze([
  './assets/chapter2-organic-pose-to-pose/plant/frame-00.png',
  './assets/chapter2-organic-pose-to-pose/plant/frame-01.png',
  './assets/chapter2-organic-pose-to-pose/plant/frame-02.png',
  './assets/chapter2-organic-pose-to-pose/plant/frame-03.png',
  './assets/chapter2-organic-pose-to-pose/plant/frame-04.png',
] as const);

const PLANT_URLS = Object.freeze([
  new URL('./assets/chapter2-organic-pose-to-pose/plant/frame-00.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/plant/frame-01.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/plant/frame-02.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/plant/frame-03.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-pose-to-pose/plant/frame-04.png', import.meta.url).href,
]);

const PLANT_SOURCE_ANCHORS = Object.freeze([
  { x: 48, y: 95 },
  { x: 46, y: 95 },
  { x: 46, y: 92 },
  { x: 46, y: 90 },
  { x: 46, y: 90 },
] as const);

const PLANT_NORMALIZATION_OFFSETS = Object.freeze([
  { x: 0, y: -3 },
  { x: 2, y: -3 },
  { x: 2, y: 0 },
  { x: 2, y: 2 },
  { x: 2, y: 2 },
] as const);

function frame(
  index: number,
  modulePath: OrganicPoseFrame['modulePath'],
  src: string,
  sourceAnchor: OrganicPosePoint,
  normalizationOffset: OrganicPosePoint,
  normalizedAnchor: OrganicPosePoint,
): OrganicPoseFrame {
  return Object.freeze({
    index,
    modulePath,
    src,
    sourceAnchor: Object.freeze(sourceAnchor),
    normalizationOffset: Object.freeze(normalizationOffset),
    normalizedAnchor,
  });
}

function poses(boundaries: readonly number[]): readonly OrganicPoseHold[] {
  return Object.freeze(
    boundaries.slice(0, -1).map((threshold, frameIndex) =>
      Object.freeze({
        frameIndex,
        threshold,
        holdUntil: boundaries[frameIndex + 1]!,
      }),
    ),
  );
}

const TREE_ANCHOR = Object.freeze({ x: 96, y: 188 });
const PLANT_ANCHOR = Object.freeze({ x: 48, y: 92 });

const TREE_TRACK: OrganicPoseTrack = Object.freeze({
  id: 'chapter2-hero-tree-pose-track-v1',
  kind: 'hero-tree',
  assetOrigin: 'checked-in-module-url',
  transparent: true,
  canvas: Object.freeze({ width: 192, height: 192 }),
  frameDimensions: Object.freeze({ width: 192, height: 192 }),
  frameCount: TREE_MODULE_PATHS.length,
  frames: Object.freeze(
    TREE_MODULE_PATHS.map((modulePath, index) =>
      frame(
        index,
        modulePath,
        TREE_URLS[index]!,
        TREE_SOURCE_ANCHORS[index]!,
        TREE_NORMALIZATION_OFFSETS[index]!,
        TREE_ANCHOR,
      ),
    ),
  ),
  poses: poses([0, 0.13, 0.25, 0.36, 0.47, 0.58, 0.69, 0.79, 0.91, 1]),
  groundAnchor: TREE_ANCHOR,
  normalizationMode: 'author-import-time-only',
  depthSlot: 'hero-tree-organic',
  matureFootprint: Object.freeze({ x: 21, y: 16, width: 142, height: 173 }),
  encodedBytes: 144_006,
  decodedRgbaBytes: 1_327_104,
  provenance: Object.freeze({
    prompt:
      'A planted hero tree growing from a bare forked sapling into a broad moss-and-olive canopy: redraw trunk, branch and canopy silhouettes pose by pose; keep one root contact fixed; transparent background; no island, ground, camera motion, whole-object scale or fade.',
    modelId: 'PixelLab PixFlux endpoints + animate_image pose interpolation',
    generationId:
      'seed=27404 job=424f0c52-de40-4db8-b8f2-ec19e4aa92e7; seed=27402 job=aa74acbe-b388-43f7-8f42-b6e42d12bd5e; seed=27405 animation=345c3b2e-1cdd-4d9c-917c-1f1eaf25a482',
    licence: 'PixelLab subscription output; use subject to PixelLab Terms of Service',
    notes:
      'PixelLab ran only at author time. Nine downloaded transparent PNG poses were registered to the measured bottom-three-row root contact before check-in.',
    referencePlateId: 'svg-island-reference-plate.png (155x191)',
  }),
});

const PLANT_TRACK: OrganicPoseTrack = Object.freeze({
  id: 'chapter2-plant-sample-pose-track-v1',
  kind: 'plant-sample',
  assetOrigin: 'checked-in-module-url',
  transparent: true,
  canvas: Object.freeze({ width: 96, height: 96 }),
  frameDimensions: Object.freeze({ width: 96, height: 96 }),
  frameCount: PLANT_MODULE_PATHS.length,
  frames: Object.freeze(
    PLANT_MODULE_PATHS.map((modulePath, index) =>
      frame(
        index,
        modulePath,
        PLANT_URLS[index]!,
        PLANT_SOURCE_ANCHORS[index]!,
        PLANT_NORMALIZATION_OFFSETS[index]!,
        PLANT_ANCHOR,
      ),
    ),
  ),
  poses: poses([0, 0.25, 0.47, 0.68, 0.88, 1]),
  groundAnchor: PLANT_ANCHOR,
  normalizationMode: 'author-import-time-only',
  depthSlot: 'ground-plant-organic',
  matureFootprint: Object.freeze({ x: 21, y: 13, width: 56, height: 80 }),
  encodedBytes: 24_535,
  decodedRgbaBytes: 184_320,
  provenance: Object.freeze({
    prompt:
      'A bounded coral woodland flower growing from one planted stem and bud into a small flowering clump: redraw the stem, leaves, blossoms and only plant-owned grass pose by pose; keep ground contact fixed; transparent background; no soil tile, island, shadow platform, scale or fade.',
    modelId: 'PixelLab PixFlux + inpaint_image endpoint repair + animate_image pose interpolation',
    generationId:
      'seed=27414 repair=5cf7f5a0-e1a8-4ec5-92a6-352ddc265ff9; seed=27411 job=4736a2ea-be21-4ea2-adc1-3928917ef13b; seed=27415 animation=de350239-adcd-4811-a11a-844baf046ea8',
    licence: 'PixelLab subscription output; use subject to PixelLab Terms of Service',
    notes:
      'PixelLab ran only at author time. Five downloaded transparent PNG poses were registered to the measured bottom-three-row plant contact before check-in.',
    referencePlateId: 'svg-island-reference-plate.png (155x191)',
  }),
});

/**
 * Versioned author-time appearance registry for the exact organic-pose-to-pose experiment.
 * Semantic progress, timing, cue holds, Replay/Back and reduced motion remain app-owned.
 */
export const CHAPTER2_ORGANIC_POSE_TO_POSE_REGISTRY: RegisteredOrganicPoseRegistry =
  Object.freeze({
    id: 'chapter2-organic-pose-to-pose-v1',
    tracks: Object.freeze([TREE_TRACK, PLANT_TRACK]),
    budget: Object.freeze({
      maxEncodedBytes: 200_000,
      maxDecodedRgbaBytes: 1_600_000,
      maxFrameCount: 14,
      maxLayerCount: 2,
    }),
  });
