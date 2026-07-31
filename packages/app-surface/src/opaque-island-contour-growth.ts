export interface OpaqueContourPoint {
  readonly x: number;
  readonly y: number;
}

export interface OpaqueQuadraticContourSegment {
  readonly control: OpaqueContourPoint;
  readonly end: OpaqueContourPoint;
}

export interface OpaqueClosedQuadraticContour {
  readonly source: string;
  readonly start: OpaqueContourPoint;
  readonly segments: readonly OpaqueQuadraticContourSegment[];
}

export type OpaqueContourGrowthPhase =
  | 'zero-area-seed'
  | 'path-interpolation'
  | 'coast-settle'
  | 'mature';

const SEED_RADIUS_X = 1.6;
const SEED_RADIUS_Y = 1.15;
const SEED_GERMINATION_END = 0.08;
const COAST_SETTLE_START = 0.84;
const TAU = Math.PI * 2;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function point(x: number, y: number): OpaqueContourPoint {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('Opaque island contours require finite coordinates.');
  }
  return { x, y };
}

function midpoint(a: OpaqueContourPoint, b: OpaqueContourPoint): OpaqueContourPoint {
  return point((a.x + b.x) / 2, (a.y + b.y) / 2);
}

function lerp(a: number, b: number, progress: number): number {
  return a + (b - a) * progress;
}

function lerpPoint(
  a: OpaqueContourPoint,
  b: OpaqueContourPoint,
  progress: number,
): OpaqueContourPoint {
  return point(lerp(a.x, b.x, progress), lerp(a.y, b.y, progress));
}

function smoothstep(progress: number): number {
  const p = clamp01(progress);
  return p * p * (3 - 2 * p);
}

function formatCoordinate(value: number): string {
  const normalized = Math.abs(value) < 0.00005 ? 0 : value;
  return normalized.toFixed(4).replace(/\.?0+$/u, '');
}

/** Parse the closed quadratic vocabulary emitted by forest-world's mature SVG coast. */
export function parseOpaqueClosedQuadraticContour(
  source: string,
): OpaqueClosedQuadraticContour {
  const tokens = source.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/giu) ?? [];
  let cursor = 0;
  const takeCommand = (expected: string): void => {
    const command = tokens[cursor]?.toUpperCase();
    if (command !== expected) {
      throw new Error(`Opaque island contour expected ${expected} at token ${cursor}.`);
    }
    cursor += 1;
  };
  const takeNumber = (): number => {
    const token = tokens[cursor];
    if (token === undefined || /[A-Za-z]/u.test(token)) {
      throw new Error(`Opaque island contour expected a coordinate at token ${cursor}.`);
    }
    cursor += 1;
    return Number(token);
  };

  takeCommand('M');
  const start = point(takeNumber(), takeNumber());
  const segments: OpaqueQuadraticContourSegment[] = [];
  while (tokens[cursor]?.toUpperCase() === 'Q') {
    cursor += 1;
    segments.push({
      control: point(takeNumber(), takeNumber()),
      end: point(takeNumber(), takeNumber()),
    });
  }
  takeCommand('Z');
  if (cursor !== tokens.length || segments.length < 3) {
    throw new Error('Opaque island contour must be one closed quadratic loop.');
  }
  return { source, start, segments };
}

function zeroAreaSeedControls(
  count: number,
  anchor: OpaqueContourPoint,
  progress: number,
): readonly OpaqueContourPoint[] {
  const seedScale = smoothstep(progress / SEED_GERMINATION_END);
  const raw = Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index / count) * TAU;
    const organic = 1 + Math.sin((index + 1) * 2.399963229728653) * 0.14;
    return point(
      Math.cos(angle) * SEED_RADIUS_X * organic * seedScale,
      Math.sin(angle) * SEED_RADIUS_Y * organic * seedScale,
    );
  });
  const meanX = raw.reduce((sum, candidate) => sum + candidate.x, 0) / count;
  const meanY = raw.reduce((sum, candidate) => sum + candidate.y, 0) / count;
  return raw.map((candidate) =>
    point(anchor.x + candidate.x - meanX, anchor.y + candidate.y - meanY),
  );
}

function interpolationAmount(progress: number): number {
  const p = clamp01(progress);
  if (p <= COAST_SETTLE_START) {
    return 0.96 * smoothstep(p / COAST_SETTLE_START);
  }
  return 0.96 + 0.04 * smoothstep(
    (p - COAST_SETTLE_START) / (1 - COAST_SETTLE_START),
  );
}

function localInterpolation(global: number, index: number, count: number): number {
  const wave = 0.5 + 0.5 * Math.sin((index / count) * TAU - Math.PI / 3);
  const delay = wave * 0.12;
  return smoothstep((global - delay) / (1 - delay));
}

function printContour(
  start: OpaqueContourPoint,
  segments: readonly OpaqueQuadraticContourSegment[],
): string {
  return [
    `M ${formatCoordinate(start.x)} ${formatCoordinate(start.y)}`,
    ...segments.map(
      (segment) =>
        `Q ${formatCoordinate(segment.control.x)} ${formatCoordinate(segment.control.y)} ` +
        `${formatCoordinate(segment.end.x)} ${formatCoordinate(segment.end.y)}`,
    ),
    'Z',
  ].join(' ');
}

export function opaqueContourGrowthPhase(progress: number): OpaqueContourGrowthPhase {
  const p = clamp01(progress);
  if (p <= 0) return 'zero-area-seed';
  if (p >= 1) return 'mature';
  return p >= COAST_SETTLE_START ? 'coast-settle' : 'path-interpolation';
}

/**
 * Interpolate the existing opaque SVG coast from a zero-area seed into its exact mature path.
 * No opacity, whole-island transform, raster substitute or topology swap participates.
 */
export function growOpaqueIslandContour(
  maturePath: string,
  anchor: OpaqueContourPoint,
  progress: number,
): string {
  const p = clamp01(progress);
  if (p >= 1) return maturePath;
  const mature = parseOpaqueClosedQuadraticContour(maturePath);
  const seedControls = zeroAreaSeedControls(mature.segments.length, anchor, p);
  const seedEnds = seedControls.map((control, index) =>
    midpoint(control, seedControls[(index + 1) % seedControls.length]!),
  );
  const seedStart = midpoint(seedControls[seedControls.length - 1]!, seedControls[0]!);
  const global = interpolationAmount(p);
  const amounts = mature.segments.map((_segment, index) =>
    localInterpolation(global, index, mature.segments.length),
  );
  const controls = mature.segments.map((segment, index) =>
    lerpPoint(seedControls[index]!, segment.control, amounts[index]!),
  );
  const segments = mature.segments.map((segment, index) => {
    const next = (index + 1) % mature.segments.length;
    return {
      control: controls[index]!,
      end: lerpPoint(
        seedEnds[index]!,
        segment.end,
        (amounts[index]! + amounts[next]!) / 2,
      ),
    };
  });
  const startAmount = (amounts[amounts.length - 1]! + amounts[0]!) / 2;
  return printContour(lerpPoint(seedStart, mature.start, startAmount), segments);
}

export function growOpaqueIslandContours(
  maturePaths: readonly string[],
  anchor: OpaqueContourPoint,
  progress: number,
): readonly string[] {
  return maturePaths.map((path) => growOpaqueIslandContour(path, anchor, progress));
}
