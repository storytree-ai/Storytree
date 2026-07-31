export interface OrganicKeyPosePoint {
  readonly x: number;
  readonly y: number;
}

export interface OrganicKeyPoseFootprint extends OrganicKeyPosePoint {
  readonly width: number;
  readonly height: number;
}

export interface OrganicKeyPose {
  readonly index: number;
  readonly modulePath: `./assets/chapter2-organic-keypose/${string}/pose-${string}.png`;
  readonly src: string;
  readonly normalizedAnchor: OrganicKeyPosePoint;
}

export interface RegisteredOrganicKeyPoseTrack {
  readonly id: string;
  readonly assetOrigin: 'checked-in-module-url';
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly poseCount: number;
  readonly poses: readonly OrganicKeyPose[];
  readonly rootAnchor: OrganicKeyPosePoint;
  readonly matureFootprint: OrganicKeyPoseFootprint;
  readonly encodedPoseBytes: number;
  readonly decodedRgbaBytes: number;
}

export interface OrganicGrowthProgressWindow {
  readonly start: number;
  readonly end: number;
}

export interface OrganicKeyPoseBlend {
  readonly from: OrganicKeyPose;
  readonly to: OrganicKeyPose;
  readonly mix: number;
  readonly fromOpacity: number;
  readonly toOpacity: number;
  readonly fromScale: number;
  readonly toScale: number;
}

const TREE_POSE_PATHS = Object.freeze([
  './assets/chapter2-organic-keypose/tree/pose-00.png',
  './assets/chapter2-organic-keypose/tree/pose-01.png',
  './assets/chapter2-organic-keypose/tree/pose-02.png',
  './assets/chapter2-organic-keypose/tree/pose-03.png',
] as const);

// Keep each module URL literal so Vite copies/hashes only the normalized runtime poses. The raw
// PixelLab jobs and inspection contact sheet sit beside them for provenance but are never imported.
const TREE_POSE_URLS = Object.freeze([
  new URL('./assets/chapter2-organic-keypose/tree/pose-00.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-keypose/tree/pose-01.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-keypose/tree/pose-02.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-keypose/tree/pose-03.png', import.meta.url).href,
]);

const PLANT_POSE_PATHS = Object.freeze([
  './assets/chapter2-organic-keypose/plant/pose-00.png',
  './assets/chapter2-organic-keypose/plant/pose-01.png',
  './assets/chapter2-organic-keypose/plant/pose-02.png',
] as const);

const PLANT_POSE_URLS = Object.freeze([
  new URL('./assets/chapter2-organic-keypose/plant/pose-00.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-keypose/plant/pose-01.png', import.meta.url).href,
  new URL('./assets/chapter2-organic-keypose/plant/pose-02.png', import.meta.url).href,
]);

function poses(
  paths: readonly OrganicKeyPose['modulePath'][],
  urls: readonly string[],
  anchor: OrganicKeyPosePoint,
): readonly OrganicKeyPose[] {
  return Object.freeze(
    paths.map((modulePath, index) =>
      Object.freeze({
        index,
        modulePath,
        src: urls[index]!,
        normalizedAnchor: anchor,
      }),
    ),
  );
}

const TREE_ROOT = Object.freeze({ x: 128, y: 240 });
const PLANT_ROOT = Object.freeze({ x: 64, y: 116 });

/**
 * Appearance only: four locally versioned PixelLab poses on one author-normalized root. Semantic
 * meaning, progress, windows, timing, easing and navigation stay outside this track in the app.
 */
export const CHAPTER2_HERO_TREE_KEYPOSE_TRACK: RegisteredOrganicKeyPoseTrack = Object.freeze({
  id: 'chapter2-hero-tree-keypose-v1',
  assetOrigin: 'checked-in-module-url',
  canvas: Object.freeze({ width: 256, height: 256 }),
  poseCount: 4,
  poses: poses(TREE_POSE_PATHS, TREE_POSE_URLS, TREE_ROOT),
  rootAnchor: TREE_ROOT,
  matureFootprint: Object.freeze({ x: 22, y: 20, width: 208, height: 221 }),
  encodedPoseBytes: 124_858,
  decodedRgbaBytes: 1_048_576,
});

export const CHAPTER2_GROUND_PLANT_KEYPOSE_TRACK: RegisteredOrganicKeyPoseTrack =
  Object.freeze({
    id: 'chapter2-ground-plant-keypose-v1',
    assetOrigin: 'checked-in-module-url',
    canvas: Object.freeze({ width: 128, height: 128 }),
    poseCount: 3,
    poses: poses(PLANT_POSE_PATHS, PLANT_POSE_URLS, PLANT_ROOT),
    rootAnchor: PLANT_ROOT,
    matureFootprint: Object.freeze({ x: 11, y: 44, width: 112, height: 73 }),
    encodedPoseBytes: 24_624,
    decodedRgbaBytes: 196_608,
  });

function samePoint(a: OrganicKeyPosePoint, b: OrganicKeyPosePoint): boolean {
  return a.x === b.x && a.y === b.y;
}

export function clampOrganicProgress(progress: number): number {
  if (!Number.isFinite(progress)) return progress === Number.POSITIVE_INFINITY ? 1 : 0;
  return Math.max(0, Math.min(1, progress));
}

/** Fail closed before a malformed, remote or anchor-drifting track reaches the shared renderer. */
export function validateOrganicKeyPoseTrack(
  value: RegisteredOrganicKeyPoseTrack,
): RegisteredOrganicKeyPoseTrack {
  if (value.assetOrigin !== 'checked-in-module-url') {
    throw new Error('Organic key poses must use checked-in module URLs.');
  }
  if (
    !Number.isInteger(value.canvas.width) ||
    !Number.isInteger(value.canvas.height) ||
    value.canvas.width < 32 ||
    value.canvas.height < 32
  ) {
    throw new Error('Organic key-pose canvas dimensions must be fixed positive integers.');
  }
  if (
    value.poseCount < 2 ||
    value.poseCount > 6 ||
    value.poses.length !== value.poseCount
  ) {
    throw new Error('Organic key-pose tracks require one bounded 2-6 pose order.');
  }
  if (
    value.decodedRgbaBytes !==
      value.poseCount * value.canvas.width * value.canvas.height * 4 ||
    value.encodedPoseBytes <= 0
  ) {
    throw new Error('Organic key-pose track budget metadata is inconsistent.');
  }
  value.poses.forEach((pose, index) => {
    const localPng = pose.src.endsWith('.png') || pose.src.startsWith('data:image/png;base64,');
    if (
      pose.index !== index ||
      !samePoint(pose.normalizedAnchor, value.rootAnchor) ||
      !pose.modulePath.startsWith('./assets/chapter2-organic-keypose/') ||
      !localPng ||
      /contact-sheet|source|pixellab\.ai/iu.test(pose.src)
    ) {
      throw new Error('Organic key poses must be ordered local PNGs on one normalized root.');
    }
  });
  return value;
}

/**
 * App-owned global semantic progress enters a bounded per-placement window. A track contains no
 * onset or pacing policy of its own; the public composition supplies that finite mapping.
 */
export function organicProgressInWindow(
  progress: number,
  window: OrganicGrowthProgressWindow,
): number {
  const start = clampOrganicProgress(window.start);
  const end = clampOrganicProgress(window.end);
  if (end <= start) throw new Error('Organic growth progress windows must have end > start.');
  return clampOrganicProgress((clampOrganicProgress(progress) - start) / (end - start));
}

function smoothstep(value: number): number {
  const t = clampOrganicProgress(value);
  return t * t * (3 - 2 * t);
}

/**
 * Registered key-pose blending: at most two adjacent local silhouettes are present. Cross-dissolve
 * weights sum to the app-owned entry visibility, and both slight transforms scale about the same
 * root socket in the renderer. The island/camera/scene never participates in this blend.
 */
export function organicKeyPoseBlendAtProgress(
  track: RegisteredOrganicKeyPoseTrack,
  progress: number,
): OrganicKeyPoseBlend {
  const valid = validateOrganicKeyPoseTrack(track);
  const normalized = clampOrganicProgress(progress);
  const position = normalized * (valid.poseCount - 1);
  const fromIndex = Math.min(valid.poseCount - 1, Math.floor(position));
  const toIndex = Math.min(valid.poseCount - 1, fromIndex + 1);
  const mix = toIndex === fromIndex ? 0 : smoothstep(position - fromIndex);
  // A short, local organic-only emergence from transparency; fully visible before the first
  // adjacent-pose transition is half complete. This never touches the SVG island or its shadows.
  const visibility = smoothstep(normalized / 0.12);
  return {
    from: valid.poses[fromIndex]!,
    to: valid.poses[toIndex]!,
    mix,
    fromOpacity: (1 - mix) * visibility,
    toOpacity: mix * visibility,
    // Deliberately slight (<=1.5%) and root-anchored: enough to bridge authored size gaps without
    // disguising the experiment as a scale animation.
    fromScale: 1 + mix * 0.015,
    toScale: 0.985 + mix * 0.015,
  };
}
