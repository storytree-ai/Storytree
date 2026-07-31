import type { SceneNode } from '@storytree/forest-world';

export interface SvgIslandAccretionPoint {
  readonly x: number;
  readonly y: number;
}

export interface SvgIslandAccretionCell {
  readonly key: string;
  readonly path: string;
  readonly points: readonly SvgIslandAccretionPoint[];
  readonly centroid: SvgIslandAccretionPoint;
  readonly neighbourKeys: readonly string[];
  readonly boundary: boolean;
  readonly wave: number;
  readonly order: number;
  readonly revealStart: number;
  readonly revealEnd: number;
}

export interface SvgIslandAccretionPlan {
  readonly storyId: string;
  readonly worldAnchor: SvgIslandAccretionPoint;
  readonly cells: readonly SvgIslandAccretionCell[];
  readonly boundaryCellKeys: readonly string[];
  readonly coastPaths: readonly string[];
  readonly orderByKey: ReadonlyMap<string, number>;
}

export interface SvgIslandAccretionCellReveal {
  readonly key: string;
  readonly path: string;
  readonly centroid: SvgIslandAccretionPoint;
  readonly neighbourKeys: readonly string[];
  readonly wave: number;
  readonly order: number;
  readonly scale: number;
}

export interface SvgIslandAccretionCoastReveal {
  readonly key: string;
  readonly centre: SvgIslandAccretionPoint;
  readonly radius: number;
  readonly neighbourKeys: readonly string[];
  readonly order: number;
  readonly scale: number;
}

export interface SvgIslandAccretionState {
  readonly storyId: string;
  readonly worldAnchor: SvgIslandAccretionPoint;
  readonly progress: number;
  readonly mature: boolean;
  readonly cells: readonly SvgIslandAccretionCellReveal[];
  readonly cellByPath: ReadonlyMap<string, SvgIslandAccretionCellReveal>;
  readonly coastProgress: number;
  readonly coastReveals: readonly SvgIslandAccretionCoastReveal[];
}

interface SourceCell {
  readonly key: string;
  readonly path: string;
  readonly points: readonly SvgIslandAccretionPoint[];
  readonly centroid: SvgIslandAccretionPoint;
  readonly sourceOrder: number;
}

interface PolygonTopology {
  readonly adjacency: readonly (readonly number[])[];
  readonly boundary: ReadonlySet<number>;
}

const LAND_SETTLED_AT = 0.82;
const CELL_START_SPAN = 0.62;
const CELL_REVEAL_DURATION = LAND_SETTLED_AT - CELL_START_SPAN;
const COAST_START = LAND_SETTLED_AT;
const COAST_START_SPAN = 0.12;
const COAST_REVEAL_DURATION = 1 - COAST_START - COAST_START_SPAN;
const TAU = Math.PI * 2;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function pointKey(point: SvgIslandAccretionPoint): string {
  return `${point.x.toFixed(4)},${point.y.toFixed(4)}`;
}

function edgeKey(a: SvgIslandAccretionPoint, b: SvgIslandAccretionPoint): string {
  const aKey = pointKey(a);
  const bKey = pointKey(b);
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function topologyFor(
  polygons: readonly (readonly SvgIslandAccretionPoint[])[],
): PolygonTopology {
  const neighbours = polygons.map(() => new Set<number>());
  const cellsByEdge = new Map<string, number[]>();
  for (let index = 0; index < polygons.length; index += 1) {
    const polygon = polygons[index];
    if (!polygon || polygon.length < 3) {
      throw new Error('SVG island accretion cells must be polygons with at least three points.');
    }
    for (const point of polygon) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new Error('SVG island accretion cell coordinates must be finite.');
      }
    }
    for (let edge = 0; edge < polygon.length; edge += 1) {
      const a = polygon[edge];
      const b = polygon[(edge + 1) % polygon.length];
      if (!a || !b) continue;
      const key = edgeKey(a, b);
      const owners = cellsByEdge.get(key);
      if (owners) owners.push(index);
      else cellsByEdge.set(key, [index]);
    }
  }

  const boundary = new Set<number>();
  for (const owners of cellsByEdge.values()) {
    if (owners.length === 1) {
      boundary.add(owners[0]!);
      continue;
    }
    if (owners.length !== 2) {
      throw new Error('SVG island accretion requires manifold shared-edge cell geometry.');
    }
    const a = owners[0]!;
    const b = owners[1]!;
    neighbours[a]?.add(b);
    neighbours[b]?.add(a);
  }
  return {
    adjacency: neighbours.map((entries) => [...entries].sort((a, b) => a - b)),
    boundary,
  };
}

/** Exact polygon topology: two cells are adjacent only when they own the same complete edge. */
export function deriveSharedEdgeAdjacency(
  polygons: readonly (readonly SvgIslandAccretionPoint[])[],
): readonly (readonly number[])[] {
  return topologyFor(polygons).adjacency;
}

function parsePolygonPath(path: string): readonly SvgIslandAccretionPoint[] {
  const tokens = path.match(/[MLZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/giu) ?? [];
  const points: SvgIslandAccretionPoint[] = [];
  let index = 0;
  while (index < tokens.length) {
    const command = tokens[index];
    if (command === 'Z' || command === 'z') {
      index += 1;
      continue;
    }
    if (command !== 'M' && command !== 'm' && command !== 'L' && command !== 'l') {
      throw new Error('SVG island accretion accepts only real polygon M/L/Z cell paths.');
    }
    const x = Number(tokens[index + 1]);
    const y = Number(tokens[index + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error('SVG island accretion found an invalid polygon coordinate.');
    }
    points.push({ x, y });
    index += 3;
  }
  if (points.length < 3) {
    throw new Error('SVG island accretion requires polygonal real-cell paths.');
  }
  return points;
}

function polygonCentroid(
  points: readonly SvgIslandAccretionPoint[],
): SvgIslandAccretionPoint {
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }
  return {
    x: x / (3 * twiceArea),
    y: y / (3 * twiceArea),
  };
}

function collectIslandGeometry(
  scene: SceneNode,
  storyId: string,
): { readonly cells: readonly SourceCell[]; readonly coastPaths: readonly string[] } {
  const cells: SourceCell[] = [];
  const coastPaths: string[] = [];

  const walk = (node: SceneNode, inGround: boolean, inCoast: boolean): void => {
    const targetGround =
      inGround || (node.el === 'g' && node.kind === 'ground' && node.id === storyId);
    const targetCoast =
      inCoast || (node.el === 'g' && node.kind === 'coast' && node.id === storyId);
    if (
      targetGround &&
      node.el === 'path' &&
      (node.kind === 'cell' || node.kind === 'cell-wheat')
    ) {
      const points = parsePolygonPath(node.d);
      const sourceOrder = cells.length;
      cells.push({
        key: `cell-${sourceOrder.toString().padStart(3, '0')}`,
        path: node.d,
        points,
        centroid: polygonCentroid(points),
        sourceOrder,
      });
    }
    if (targetCoast && node.el === 'path' && node.kind === 'coast-shore') {
      coastPaths.push(node.d);
    }
    if (node.el === 'g') {
      for (const child of node.children) walk(child, targetGround, targetCoast);
    }
  };
  walk(scene, false, false);
  if (cells.length === 0 || coastPaths.length === 0) {
    throw new Error(`SVG island accretion could not find real ground/coast geometry for "${storyId}".`);
  }
  return { cells, coastPaths };
}

function distanceSquared(
  a: SvgIslandAccretionPoint,
  b: SvgIslandAccretionPoint,
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function angleFrom(
  anchor: SvgIslandAccretionPoint,
  point: SvgIslandAccretionPoint,
  wave: number,
): number {
  const raw = Math.atan2(point.y - anchor.y, point.x - anchor.x) + wave * 0.71;
  return ((raw % TAU) + TAU) % TAU;
}

/** Build one deterministic adjacency-wave plan directly from the retained SceneNode polygons. */
export function deriveSvgIslandAccretionPlan(
  scene: SceneNode,
  storyId: string,
  worldAnchor: SvgIslandAccretionPoint,
): SvgIslandAccretionPlan {
  if (
    storyId.trim() === '' ||
    !Number.isFinite(worldAnchor.x) ||
    !Number.isFinite(worldAnchor.y)
  ) {
    throw new Error('SVG island accretion requires a finite app-owned island anchor.');
  }
  const geometry = collectIslandGeometry(scene, storyId);
  const topology = topologyFor(geometry.cells.map((cell) => cell.points));
  const seed = geometry.cells.reduce((best, cell, index) => {
    const bestCell = geometry.cells[best]!;
    const delta = distanceSquared(worldAnchor, cell.centroid) -
      distanceSquared(worldAnchor, bestCell.centroid);
    return delta < 0 || (delta === 0 && cell.sourceOrder < bestCell.sourceOrder)
      ? index
      : best;
  }, 0);

  const waves = geometry.cells.map(() => -1);
  waves[seed] = 0;
  const queue = [seed];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    for (const neighbour of topology.adjacency[current] ?? []) {
      if (waves[neighbour] !== -1) continue;
      waves[neighbour] = waves[current]! + 1;
      queue.push(neighbour);
    }
  }
  if (queue.length !== geometry.cells.length) {
    throw new Error('SVG island accretion requires one connected shared-edge cell graph.');
  }

  const maxWave = Math.max(...waves);
  const waveGap = maxWave > 0 ? CELL_START_SPAN / (maxWave + 1) : 0;
  const orderedIndices: number[] = [];
  const revealStartBySource = new Map<number, number>();
  for (let wave = 0; wave <= maxWave; wave += 1) {
    const entries = geometry.cells
      .map((cell, index) => ({ cell, index }))
      .filter((entry) => waves[entry.index] === wave)
      .sort(
        (a, b) =>
          angleFrom(worldAnchor, a.cell.centroid, wave) -
            angleFrom(worldAnchor, b.cell.centroid, wave) ||
          distanceSquared(worldAnchor, a.cell.centroid) -
            distanceSquared(worldAnchor, b.cell.centroid) ||
          a.cell.sourceOrder - b.cell.sourceOrder,
      );
    entries.forEach((entry, withinWave) => {
      const spread = entries.length > 1 ? withinWave / (entries.length - 1) : 0;
      revealStartBySource.set(entry.index, wave * waveGap + spread * waveGap * 0.55);
      orderedIndices.push(entry.index);
    });
  }

  const orderBySource = new Map(orderedIndices.map((source, order) => [source, order]));
  const cells = orderedIndices.map((sourceIndex): SvgIslandAccretionCell => {
    const source = geometry.cells[sourceIndex]!;
    const revealStart = revealStartBySource.get(sourceIndex) ?? 0;
    return {
      key: source.key,
      path: source.path,
      points: source.points,
      centroid: source.centroid,
      neighbourKeys: (topology.adjacency[sourceIndex] ?? [])
        .map((index) => geometry.cells[index]!.key)
        .sort(),
      boundary: topology.boundary.has(sourceIndex),
      wave: waves[sourceIndex]!,
      order: orderBySource.get(sourceIndex)!,
      revealStart,
      revealEnd: revealStart + CELL_REVEAL_DURATION,
    };
  });

  const boundaryCellKeys = cells
    .filter((cell) => cell.boundary)
    .map((cell) => cell.key);
  return {
    storyId,
    worldAnchor: { ...worldAnchor },
    cells,
    boundaryCellKeys,
    coastPaths: [...geometry.coastPaths],
    orderByKey: new Map(cells.map((cell) => [cell.key, cell.order])),
  };
}

function coastRadius(cell: SvgIslandAccretionCell): number {
  const radius = Math.max(
    ...cell.points.map((point) => Math.sqrt(distanceSquared(cell.centroid, point))),
  );
  return radius * 2.4;
}

/** Select one immutable geometric reveal state. Progress 1 explicitly means no renderer clipping. */
export function svgIslandAccretionAtProgress(
  plan: SvgIslandAccretionPlan,
  inputProgress: number,
): SvgIslandAccretionState {
  const progress = clamp01(inputProgress);
  const cells = plan.cells.map((cell): SvgIslandAccretionCellReveal => ({
    key: cell.key,
    path: cell.path,
    centroid: cell.centroid,
    neighbourKeys: cell.neighbourKeys,
    wave: cell.wave,
    order: cell.order,
    scale: smoothstep(
      (progress - cell.revealStart) / (cell.revealEnd - cell.revealStart),
    ),
  }));
  const cellByKey = new Map(cells.map((cell) => [cell.key, cell]));
  const coastProgress = clamp01((progress - COAST_START) / (1 - COAST_START));
  const coastReveals = plan.cells.map(
    (cell, order): SvgIslandAccretionCoastReveal => {
      const start = COAST_START +
        (plan.cells.length > 1
          ? (order / (plan.cells.length - 1)) * COAST_START_SPAN
          : 0);
      return {
        key: cell.key,
        centre: cell.centroid,
        radius: coastRadius(cell),
        neighbourKeys: cell.neighbourKeys,
        order,
        scale: smoothstep((progress - start) / COAST_REVEAL_DURATION),
      };
    },
  );
  return {
    storyId: plan.storyId,
    worldAnchor: plan.worldAnchor,
    progress,
    mature: progress === 1,
    cells,
    cellByPath: new Map(
      plan.cells.map((cell) => [cell.path, cellByKey.get(cell.key)!]),
    ),
    coastProgress,
    coastReveals,
  };
}
