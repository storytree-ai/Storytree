import type {
  BranchBloomAsset,
  BranchBloomCluster,
  RegisteredBranchBloomRig,
} from './branch-bloom-rig.js';

const asset = (
  id: string,
  modulePath: BranchBloomAsset['modulePath'],
  src: string,
  width: number,
  height: number,
  pivot: BranchBloomAsset['pivot'],
  encodedBytes: number,
): BranchBloomAsset => ({
  id,
  modulePath,
  src,
  canvas: Object.freeze({ width, height }),
  pivot: Object.freeze(pivot),
  encodedBytes,
  decodedRgbaBytes: width * height * 4,
});

// Keep every URL literal at its module site. Vite can then fingerprint and
// copy these checked-in sprites into the production bundle; a dynamic
// URL construction from the variable module path survives the build as a
// broken `/assets/assets/...` request.
const ASSET_URLS = Object.freeze({
  trunkRoot: new URL(
    './assets/chapter2-organic-branch-bloom/v1/trunk-root.png',
    import.meta.url,
  ).href,
  branchLeft: new URL(
    './assets/chapter2-organic-branch-bloom/v1/branch-left.png',
    import.meta.url,
  ).href,
  branchRight: new URL(
    './assets/chapter2-organic-branch-bloom/v1/branch-right.png',
    import.meta.url,
  ).href,
  fernTuft: new URL(
    './assets/chapter2-organic-branch-bloom/v1/fern-tuft.png',
    import.meta.url,
  ).href,
  flowerTuft: new URL(
    './assets/chapter2-organic-branch-bloom/v1/flower-tuft.png',
    import.meta.url,
  ).href,
  leafFanSpray: new URL(
    './assets/chapter2-organic-branch-bloom/v1/leaf-fan-spray.png',
    import.meta.url,
  ).href,
  leafForkRosette: new URL(
    './assets/chapter2-organic-branch-bloom/v1/leaf-fork-rosette.png',
    import.meta.url,
  ).href,
  leafTipTuft: new URL(
    './assets/chapter2-organic-branch-bloom/v1/leaf-tip-tuft.png',
    import.meta.url,
  ).href,
});

const ASSETS = Object.freeze([
  asset(
    'trunk-root',
    './assets/chapter2-organic-branch-bloom/v1/trunk-root.png',
    ASSET_URLS.trunkRoot,
    96,
    160,
    { x: 48, y: 154 },
    5110,
  ),
  asset(
    'branch-left',
    './assets/chapter2-organic-branch-bloom/v1/branch-left.png',
    ASSET_URLS.branchLeft,
    128,
    96,
    { x: 100, y: 90 },
    1771,
  ),
  asset(
    'branch-right',
    './assets/chapter2-organic-branch-bloom/v1/branch-right.png',
    ASSET_URLS.branchRight,
    128,
    96,
    { x: 28, y: 90 },
    2247,
  ),
  asset(
    'fern-tuft',
    './assets/chapter2-organic-branch-bloom/v1/fern-tuft.png',
    ASSET_URLS.fernTuft,
    64,
    64,
    { x: 32, y: 60 },
    1462,
  ),
  asset(
    'flower-tuft',
    './assets/chapter2-organic-branch-bloom/v1/flower-tuft.png',
    ASSET_URLS.flowerTuft,
    64,
    64,
    { x: 32, y: 60 },
    1950,
  ),
  asset(
    'leaf-fan-spray',
    './assets/chapter2-organic-branch-bloom/v1/leaf-fan-spray.png',
    ASSET_URLS.leafFanSpray,
    64,
    64,
    { x: 32, y: 58 },
    2079,
  ),
  asset(
    'leaf-fork-rosette',
    './assets/chapter2-organic-branch-bloom/v1/leaf-fork-rosette.png',
    ASSET_URLS.leafForkRosette,
    64,
    64,
    { x: 32, y: 58 },
    3549,
  ),
  asset(
    'leaf-tip-tuft',
    './assets/chapter2-organic-branch-bloom/v1/leaf-tip-tuft.png',
    ASSET_URLS.leafTipTuft,
    64,
    64,
    { x: 32, y: 58 },
    3188,
  ),
] as const);

const cluster = (
  value: BranchBloomCluster,
): BranchBloomCluster => Object.freeze({
  ...value,
  branchLocalSocket: Object.freeze(value.branchLocalSocket),
  bloom: Object.freeze(value.bloom),
});

/**
 * Experiment 9: a real hierarchy, not a canopy collage.
 *
 * Reuse matrix (eight instances / three authored shapes): fan 3, rosette 3,
 * tip 2. The asymmetric sockets, mirrors, scale and rotation variations stop
 * reuse reading as repeated stamps. All clusters paint under their parent wood.
 */
export const CHAPTER2_ORGANIC_BRANCH_BLOOM_RIG: RegisteredBranchBloomRig = Object.freeze({
  id: 'chapter2-organic-branch-bloom-v1',
  assetOrigin: 'checked-in-module-url',
  normalizationMode: 'author-import-time-only',
  trunk: Object.freeze({
    assetId: 'trunk-root',
    grow: Object.freeze({ start: 0.2, end: 0.43 }),
  }),
  branches: Object.freeze([
    Object.freeze({
      id: 'branch-left',
      assetId: 'branch-left',
      parentPartId: 'trunk-root' as const,
      trunkLocalSocket: Object.freeze({ x: -7, y: -74 }),
      settle: Object.freeze({ start: 0.38, end: 0.56 }),
      startRotation: -16,
      restRotation: 0,
    }),
    Object.freeze({
      id: 'branch-right',
      assetId: 'branch-right',
      parentPartId: 'trunk-root' as const,
      trunkLocalSocket: Object.freeze({ x: 8, y: -84 }),
      settle: Object.freeze({ start: 0.41, end: 0.59 }),
      startRotation: 15,
      restRotation: 0,
    }),
  ]),
  leafFamilyAssetIds: Object.freeze([
    'leaf-fan-spray',
    'leaf-fork-rosette',
    'leaf-tip-tuft',
  ]),
  clusters: Object.freeze([
    cluster({
      id: 'left-tip',
      familyAssetId: 'leaf-fan-spray',
      parentBranchId: 'branch-left',
      branchLocalSocket: { x: 25, y: 29 },
      bloom: { start: 0.58, end: 0.72 },
      restRotation: -17,
      settleRotation: -5,
      restScale: 1.25,
      mirrorX: false,
      painterOrder: 10,
    }),
    cluster({
      id: 'left-mid',
      familyAssetId: 'leaf-fork-rosette',
      parentBranchId: 'branch-left',
      branchLocalSocket: { x: 53, y: 35 },
      bloom: { start: 0.605, end: 0.75 },
      restRotation: 9,
      settleRotation: 4,
      restScale: 1.45,
      mirrorX: true,
      painterOrder: 20,
    }),
    cluster({
      id: 'left-shoulder',
      familyAssetId: 'leaf-tip-tuft',
      parentBranchId: 'branch-left',
      branchLocalSocket: { x: 80, y: 48 },
      bloom: { start: 0.63, end: 0.78 },
      restRotation: -5,
      settleRotation: -3,
      restScale: 1.45,
      mirrorX: false,
      painterOrder: 30,
    }),
    cluster({
      id: 'left-crown',
      familyAssetId: 'leaf-fan-spray',
      parentBranchId: 'branch-left',
      branchLocalSocket: { x: 103, y: 23 },
      bloom: { start: 0.655, end: 0.815 },
      restRotation: 16,
      settleRotation: 5,
      restScale: 1.7,
      mirrorX: true,
      painterOrder: 40,
    }),
    cluster({
      id: 'right-crown',
      familyAssetId: 'leaf-fork-rosette',
      parentBranchId: 'branch-right',
      branchLocalSocket: { x: 25, y: 25 },
      bloom: { start: 0.61, end: 0.755 },
      restRotation: -13,
      settleRotation: -4,
      restScale: 1.65,
      mirrorX: false,
      painterOrder: 15,
    }),
    cluster({
      id: 'right-shoulder',
      familyAssetId: 'leaf-tip-tuft',
      parentBranchId: 'branch-right',
      branchLocalSocket: { x: 48, y: 54 },
      bloom: { start: 0.64, end: 0.795 },
      restRotation: 6,
      settleRotation: 3,
      restScale: 1.42,
      mirrorX: true,
      painterOrder: 25,
    }),
    cluster({
      id: 'right-mid',
      familyAssetId: 'leaf-fan-spray',
      parentBranchId: 'branch-right',
      branchLocalSocket: { x: 74, y: 39 },
      bloom: { start: 0.67, end: 0.83 },
      restRotation: -8,
      settleRotation: -5,
      restScale: 1.45,
      mirrorX: false,
      painterOrder: 35,
    }),
    cluster({
      id: 'right-tip',
      familyAssetId: 'leaf-fork-rosette',
      parentBranchId: 'branch-right',
      branchLocalSocket: { x: 104, y: 30 },
      bloom: { start: 0.7, end: 0.865 },
      restRotation: 18,
      settleRotation: 5,
      restScale: 1.25,
      mirrorX: true,
      painterOrder: 45,
    }),
  ]),
  plants: Object.freeze([
    Object.freeze({
      id: 'fern-tuft',
      assetId: 'fern-tuft',
      rootLocalSocket: Object.freeze({ x: -39, y: 10 }),
      grow: Object.freeze({ start: 0.49, end: 0.67 }),
      restRotation: -3,
    }),
    Object.freeze({
      id: 'flower-tuft',
      assetId: 'flower-tuft',
      rootLocalSocket: Object.freeze({ x: 39, y: 8 }),
      grow: Object.freeze({ start: 0.54, end: 0.72 }),
      restRotation: 4,
    }),
  ]),
  assets: ASSETS,
  budget: Object.freeze({
    maxEncodedBytes: 24_000,
    maxDecodedRgbaBytes: 260_000,
    maxLeafFamilySize: 3,
    maxClusterInstances: 8,
  }),
});
