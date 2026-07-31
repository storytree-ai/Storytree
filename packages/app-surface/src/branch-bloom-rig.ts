export interface BranchBloomPoint {
  readonly x: number;
  readonly y: number;
}

export interface BranchBloomWindow {
  readonly start: number;
  readonly end: number;
}

export interface BranchBloomAsset {
  readonly id: string;
  readonly modulePath: `./${string}.png`;
  readonly src: string;
  readonly canvas: { readonly width: number; readonly height: number };
  readonly pivot: BranchBloomPoint;
  readonly encodedBytes: number;
  readonly decodedRgbaBytes: number;
}

export interface BranchBloomBranch {
  readonly id: string;
  readonly assetId: string;
  readonly parentPartId: 'trunk-root';
  readonly trunkLocalSocket: BranchBloomPoint;
  readonly settle: BranchBloomWindow;
  readonly startRotation: number;
  readonly restRotation: number;
}

export interface BranchBloomCluster {
  readonly id: string;
  readonly familyAssetId: string;
  readonly parentBranchId: string;
  readonly branchLocalSocket: BranchBloomPoint;
  readonly bloom: BranchBloomWindow;
  readonly restRotation: number;
  readonly settleRotation: number;
  readonly restScale: number;
  readonly mirrorX: boolean;
  /** Lower values paint first, beneath later clusters and then beneath branch wood. */
  readonly painterOrder: number;
}

export interface BranchBloomPlant {
  readonly id: string;
  readonly assetId: string;
  readonly rootLocalSocket: BranchBloomPoint;
  readonly grow: BranchBloomWindow;
  readonly restRotation: number;
}

export interface BranchBloomBudget {
  readonly maxEncodedBytes: number;
  readonly maxDecodedRgbaBytes: number;
  readonly maxLeafFamilySize: number;
  readonly maxClusterInstances: number;
}

export interface RegisteredBranchBloomRig {
  readonly id: string;
  readonly assetOrigin: 'checked-in-module-url';
  readonly normalizationMode: 'author-import-time-only';
  readonly trunk: {
    readonly assetId: string;
    readonly grow: BranchBloomWindow;
  };
  readonly branches: readonly BranchBloomBranch[];
  readonly leafFamilyAssetIds: readonly string[];
  readonly clusters: readonly BranchBloomCluster[];
  readonly plants: readonly BranchBloomPlant[];
  readonly assets: readonly BranchBloomAsset[];
  readonly budget: BranchBloomBudget;
}

export interface BranchBloomClusterRenderLayer extends BranchBloomCluster {
  readonly src: string;
  readonly canvas: BranchBloomAsset['canvas'];
  readonly assetPivot: BranchBloomPoint;
  readonly bloomScale: number;
  readonly rotation: number;
}

export interface BranchBloomBranchRenderLayer extends BranchBloomBranch {
  readonly src: string;
  readonly canvas: BranchBloomAsset['canvas'];
  readonly assetPivot: BranchBloomPoint;
  readonly growScale: number;
  readonly rotation: number;
  readonly clusters: readonly BranchBloomClusterRenderLayer[];
}

export interface BranchBloomPlantRenderLayer extends BranchBloomPlant {
  readonly src: string;
  readonly canvas: BranchBloomAsset['canvas'];
  readonly assetPivot: BranchBloomPoint;
  readonly growScale: number;
}

export interface BranchBloomRenderLayer {
  readonly rigId: string;
  readonly progress: number;
  readonly worldRoot: BranchBloomPoint;
  readonly scale: number;
  readonly trunk: {
    readonly id: 'trunk-root';
    readonly src: string;
    readonly canvas: BranchBloomAsset['canvas'];
    readonly assetPivot: BranchBloomPoint;
    readonly growScale: number;
  };
  readonly branches: readonly BranchBloomBranchRenderLayer[];
  readonly plants: readonly BranchBloomPlantRenderLayer[];
  readonly leafFamilySize: number;
}

export interface BranchBloomBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const FORBIDDEN_RUNTIME_FIELD =
  /(?:vendor(?:url|client)?|credentials?|api[-_]?key|secret|token|asset[-_]?clock|timer|animation[-_]?cursor)/iu;

function assertNoRuntimeVendorState(value: unknown): void {
  const visited = new WeakSet<object>();
  const visit = (candidate: unknown): void => {
    if (typeof candidate === 'string') {
      if (/^https?:\/\//iu.test(candidate) && typeof window !== 'undefined') {
        try {
          if (new URL(candidate).origin !== window.location.origin) {
            throw new Error('Branch bloom assets must resolve from the app origin.');
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('app origin')) throw error;
        }
      }
      return;
    }
    if (candidate === null || typeof candidate !== 'object') return;
    if (visited.has(candidate)) return;
    visited.add(candidate);
    for (const [field, child] of Object.entries(candidate)) {
      if (FORBIDDEN_RUNTIME_FIELD.test(field)) {
        throw new Error(`Branch bloom rig contains forbidden runtime field "${field}".`);
      }
      visit(child);
    }
  };
  visit(value);
}

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`Branch bloom ${label} must be finite.`);
}

function positive(value: number, label: string): void {
  finite(value, label);
  if (value <= 0) throw new Error(`Branch bloom ${label} must be positive.`);
}

function point(value: BranchBloomPoint, label: string): void {
  finite(value.x, `${label} x`);
  finite(value.y, `${label} y`);
}

function validateWindow(value: BranchBloomWindow, label: string): void {
  finite(value.start, `${label} start`);
  finite(value.end, `${label} end`);
  if (value.start < 0 || value.end > 1 || value.start >= value.end) {
    throw new Error(`Branch bloom ${label} must be ordered within [0,1].`);
  }
}

export function clampBranchBloomProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(1, progress));
}

function localProgress(progress: number, range: BranchBloomWindow): number {
  return clampBranchBloomProgress((progress - range.start) / (range.end - range.start));
}

function smoothstep(progress: number): number {
  const t = clampBranchBloomProgress(progress);
  return t * t * (3 - 2 * t);
}

/** One bounded overshoot and settle: secondary action, never a perpetual shimmer. */
export function clusterBloomPose(
  progress: number,
  cluster: Pick<BranchBloomCluster, 'bloom' | 'restRotation' | 'settleRotation' | 'restScale'>,
): { readonly scale: number; readonly rotation: number } {
  const local = localProgress(progress, cluster.bloom);
  const first = Math.min(1, local / 0.76);
  const settle = Math.max(0, (local - 0.76) / 0.24);
  const scale =
    local < 0.76
      ? cluster.restScale * 1.045 * smoothstep(first)
      : cluster.restScale * (1.045 - 0.045 * smoothstep(settle));
  return {
    scale,
    rotation:
      cluster.restRotation + cluster.settleRotation * (1 - smoothstep(local)),
  };
}

function assetMap(rig: RegisteredBranchBloomRig): ReadonlyMap<string, BranchBloomAsset> {
  return new Map(rig.assets.map((asset) => [asset.id, asset]));
}

export function validateBranchBloomRig(rig: RegisteredBranchBloomRig): RegisteredBranchBloomRig {
  assertNoRuntimeVendorState(rig);
  if (rig.id.trim() === '') throw new Error('Branch bloom rig id must be recorded.');
  if (rig.assetOrigin !== 'checked-in-module-url') {
    throw new Error('Branch bloom assets must be checked-in module URLs.');
  }
  if (rig.normalizationMode !== 'author-import-time-only') {
    throw new Error('Branch bloom normalization must happen at author/import time.');
  }
  const assets = assetMap(rig);
  if (assets.size !== rig.assets.length) throw new Error('Branch bloom asset ids must be unique.');
  for (const asset of rig.assets) {
    if (
      !asset.modulePath.startsWith('./assets/') ||
      asset.modulePath.includes('../') ||
      asset.src.trim() === ''
    ) {
      throw new Error('Branch bloom assets must use local module paths.');
    }
    positive(asset.canvas.width, `${asset.id} canvas width`);
    positive(asset.canvas.height, `${asset.id} canvas height`);
    point(asset.pivot, `${asset.id} pivot`);
    positive(asset.encodedBytes, `${asset.id} encoded bytes`);
    positive(asset.decodedRgbaBytes, `${asset.id} decoded bytes`);
    if (asset.decodedRgbaBytes !== asset.canvas.width * asset.canvas.height * 4) {
      throw new Error(`Branch bloom ${asset.id} decoded cost must match one RGBA canvas.`);
    }
  }
  if (!assets.has(rig.trunk.assetId)) throw new Error('Branch bloom trunk asset is missing.');
  validateWindow(rig.trunk.grow, 'trunk growth');
  if (rig.branches.length !== 2 || new Set(rig.branches.map((part) => part.id)).size !== 2) {
    throw new Error('Branch bloom rig requires exactly two unique structural branches.');
  }
  for (const branch of rig.branches) {
    if (!assets.has(branch.assetId) || branch.parentPartId !== 'trunk-root') {
      throw new Error('Every branch must attach to the registered trunk.');
    }
    point(branch.trunkLocalSocket, `${branch.id} trunk-local socket`);
    validateWindow(branch.settle, `${branch.id} settle`);
    finite(branch.startRotation, `${branch.id} start rotation`);
    finite(branch.restRotation, `${branch.id} rest rotation`);
  }
  const family = new Set(rig.leafFamilyAssetIds);
  if (family.size !== rig.leafFamilyAssetIds.length || family.size < 2) {
    throw new Error('Branch bloom leaf family must contain distinct reusable assets.');
  }
  if (family.size > rig.budget.maxLeafFamilySize) {
    throw new Error('Branch bloom leaf family exceeds its bounded budget.');
  }
  for (const assetId of family) {
    if (!assets.has(assetId)) throw new Error(`Branch bloom leaf family asset "${assetId}" is missing.`);
  }
  if (rig.clusters.length > rig.budget.maxClusterInstances) {
    throw new Error('Branch bloom cluster count exceeds its bounded budget.');
  }
  const branchById = new Map(rig.branches.map((branch) => [branch.id, branch]));
  if (new Set(rig.clusters.map((cluster) => cluster.id)).size !== rig.clusters.length) {
    throw new Error('Branch bloom cluster ids must be unique.');
  }
  const reuse = new Map<string, number>();
  for (const cluster of rig.clusters) {
    const branch = branchById.get(cluster.parentBranchId);
    if (!branch || !family.has(cluster.familyAssetId)) {
      throw new Error('Every cluster must use a registered family asset and parent branch.');
    }
    point(cluster.branchLocalSocket, `${cluster.id} branch-local socket`);
    const branchAsset = assets.get(branch.assetId)!;
    if (
      cluster.branchLocalSocket.x < 0 ||
      cluster.branchLocalSocket.y < 0 ||
      cluster.branchLocalSocket.x >= branchAsset.canvas.width ||
      cluster.branchLocalSocket.y >= branchAsset.canvas.height
    ) {
      throw new Error('Every branch-local socket must fall inside its parent wood canvas.');
    }
    validateWindow(cluster.bloom, `${cluster.id} bloom`);
    if (cluster.bloom.start < branch.settle.end) {
      throw new Error('Every cluster bloom must begin only after its parent branch settles.');
    }
    positive(cluster.restScale, `${cluster.id} rest scale`);
    finite(cluster.restRotation, `${cluster.id} rest rotation`);
    finite(cluster.settleRotation, `${cluster.id} settle rotation`);
    reuse.set(cluster.familyAssetId, (reuse.get(cluster.familyAssetId) ?? 0) + 1);
  }
  for (const assetId of family) {
    if ((reuse.get(assetId) ?? 0) < 2) {
      throw new Error('Every bounded leaf asset must be visibly reused at least twice.');
    }
  }
  for (const plant of rig.plants) {
    if (!assets.has(plant.assetId)) throw new Error('Branch bloom plant asset is missing.');
    point(plant.rootLocalSocket, `${plant.id} root-local socket`);
    validateWindow(plant.grow, `${plant.id} growth`);
  }
  const encoded = rig.assets.reduce((sum, asset) => sum + asset.encodedBytes, 0);
  const decoded = rig.assets.reduce((sum, asset) => sum + asset.decodedRgbaBytes, 0);
  if (encoded > rig.budget.maxEncodedBytes || decoded > rig.budget.maxDecodedRgbaBytes) {
    throw new Error('Branch bloom rig exceeds its asset/decode budget.');
  }
  return rig;
}

export function branchBloomLayerAtProgress(
  unvalidatedRig: RegisteredBranchBloomRig,
  progress: number,
  worldRoot: BranchBloomPoint,
  scale: number,
): BranchBloomRenderLayer {
  const rig = validateBranchBloomRig(unvalidatedRig);
  point(worldRoot, 'world root');
  positive(scale, 'world scale');
  const p = clampBranchBloomProgress(progress);
  const assets = assetMap(rig);
  const trunkAsset = assets.get(rig.trunk.assetId)!;
  const branches = rig.branches.map((branch) => {
    const asset = assets.get(branch.assetId)!;
    const branchProgress = smoothstep(localProgress(p, branch.settle));
    const clusters = rig.clusters
      .filter((cluster) => cluster.parentBranchId === branch.id)
      .sort((left, right) => left.painterOrder - right.painterOrder)
      .map((cluster) => {
        const leafAsset = assets.get(cluster.familyAssetId)!;
        const pose = clusterBloomPose(p, cluster);
        return {
          ...cluster,
          src: leafAsset.src,
          canvas: leafAsset.canvas,
          assetPivot: leafAsset.pivot,
          bloomScale: pose.scale,
          rotation: pose.rotation,
        };
      });
    return {
      ...branch,
      src: asset.src,
      canvas: asset.canvas,
      assetPivot: asset.pivot,
      growScale: branchProgress,
      rotation:
        branch.startRotation + (branch.restRotation - branch.startRotation) * branchProgress,
      clusters,
    };
  });
  const plants = rig.plants.map((plant) => {
    const asset = assets.get(plant.assetId)!;
    return {
      ...plant,
      src: asset.src,
      canvas: asset.canvas,
      assetPivot: asset.pivot,
      growScale: smoothstep(localProgress(p, plant.grow)),
    };
  });
  return {
    rigId: rig.id,
    progress: p,
    worldRoot,
    scale,
    trunk: {
      id: 'trunk-root',
      src: trunkAsset.src,
      canvas: trunkAsset.canvas,
      assetPivot: trunkAsset.pivot,
      growScale: smoothstep(localProgress(p, rig.trunk.grow)),
    },
    branches,
    plants,
    leafFamilySize: rig.leafFamilyAssetIds.length,
  };
}

/** Conservative mature bounds used only to hold one camera for the entire walk. */
export function branchBloomMatureBounds(
  unvalidatedRig: RegisteredBranchBloomRig,
  worldRoot: BranchBloomPoint,
  scale: number,
): BranchBloomBounds {
  const rig = validateBranchBloomRig(unvalidatedRig);
  point(worldRoot, 'world root');
  positive(scale, 'world scale');
  const assets = assetMap(rig);
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  const include = (left: number, top: number, right: number, bottom: number): void => {
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  };
  const trunk = assets.get(rig.trunk.assetId)!;
  include(
    -trunk.pivot.x,
    -trunk.pivot.y,
    trunk.canvas.width - trunk.pivot.x,
    trunk.canvas.height - trunk.pivot.y,
  );
  for (const branch of rig.branches) {
    const branchAsset = assets.get(branch.assetId)!;
    include(
      branch.trunkLocalSocket.x - branchAsset.pivot.x,
      branch.trunkLocalSocket.y - branchAsset.pivot.y,
      branch.trunkLocalSocket.x + branchAsset.canvas.width - branchAsset.pivot.x,
      branch.trunkLocalSocket.y + branchAsset.canvas.height - branchAsset.pivot.y,
    );
    for (const cluster of rig.clusters.filter((item) => item.parentBranchId === branch.id)) {
      const leaf = assets.get(cluster.familyAssetId)!;
      const socketX = branch.trunkLocalSocket.x - branchAsset.pivot.x + cluster.branchLocalSocket.x;
      const socketY = branch.trunkLocalSocket.y - branchAsset.pivot.y + cluster.branchLocalSocket.y;
      const radius =
        Math.hypot(
          Math.max(leaf.pivot.x, leaf.canvas.width - leaf.pivot.x),
          Math.max(leaf.pivot.y, leaf.canvas.height - leaf.pivot.y),
        ) * cluster.restScale;
      include(socketX - radius, socketY - radius, socketX + radius, socketY + radius);
    }
  }
  for (const plant of rig.plants) {
    const plantAsset = assets.get(plant.assetId)!;
    include(
      plant.rootLocalSocket.x - plantAsset.pivot.x,
      plant.rootLocalSocket.y - plantAsset.pivot.y,
      plant.rootLocalSocket.x + plantAsset.canvas.width - plantAsset.pivot.x,
      plant.rootLocalSocket.y + plantAsset.canvas.height - plantAsset.pivot.y,
    );
  }
  return {
    minX: worldRoot.x + minX * scale,
    minY: worldRoot.y + minY * scale,
    maxX: worldRoot.x + maxX * scale,
    maxY: worldRoot.y + maxY * scale,
  };
}
