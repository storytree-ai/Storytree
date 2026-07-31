export interface ContourPoint {
  readonly x: number;
  readonly y: number;
}

export interface QuadraticContourSegment {
  readonly control: ContourPoint;
  readonly end: ContourPoint;
}

export interface ClosedQuadraticContour {
  readonly source: string;
  readonly start: ContourPoint;
  readonly segments: readonly QuadraticContourSegment[];
}

export type ContourMorphPhase =
  | 'seed'
  | 'path-interpolation'
  | 'coast-settle'
  | 'mature';

const SEED_RADIUS_X = 1.6;
const SEED_RADIUS_Y = 1.15;
const COAST_SETTLE_START = 0.84;
const TAU = Math.PI * 2;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function point(x: number, y: number): ContourPoint {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('Organic island contours require finite coordinates.');
  }
  return { x, y };
}

function midpoint(a: ContourPoint, b: ContourPoint): ContourPoint {
  return point((a.x + b.x) / 2, (a.y + b.y) / 2);
}

function lerp(a: number, b: number, progress: number): number {
  return a + (b - a) * progress;
}

function lerpPoint(a: ContourPoint, b: ContourPoint, progress: number): ContourPoint {
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

/** Parse the exact closed quadratic vocabulary emitted by forest-world's `smoothLoopPath`. */
export function parseClosedQuadraticContour(source: string): ClosedQuadraticContour {
  const tokens = source.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/giu) ?? [];
  let cursor = 0;
  const takeCommand = (expected: string): void => {
    const command = tokens[cursor]?.toUpperCase();
    if (command !== expected) {
      throw new Error(`Organic island contour expected ${expected} at token ${cursor}.`);
    }
    cursor += 1;
  };
  const takeNumber = (): number => {
    const token = tokens[cursor];
    if (token === undefined || /[A-Za-z]/u.test(token)) {
      throw new Error(`Organic island contour expected a coordinate at token ${cursor}.`);
    }
    cursor += 1;
    return Number(token);
  };

  takeCommand('M');
  const start = point(takeNumber(), takeNumber());
  const segments: QuadraticContourSegment[] = [];
  while (tokens[cursor]?.toUpperCase() === 'Q') {
    cursor += 1;
    segments.push({
      control: point(takeNumber(), takeNumber()),
      end: point(takeNumber(), takeNumber()),
    });
  }
  takeCommand('Z');
  if (cursor !== tokens.length || segments.length < 3) {
    throw new Error('Organic island contour must be one closed quadratic loop with at least three segments.');
  }
  return { source, start, segments };
}

function independentSeedControls(
  count: number,
  anchor: ContourPoint,
): readonly ContourPoint[] {
  const raw = Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index / count) * TAU;
    const organic = 1 + Math.sin((index + 1) * 2.399963229728653) * 0.14;
    return point(
      Math.cos(angle) * SEED_RADIUS_X * organic,
      Math.sin(angle) * SEED_RADIUS_Y * organic,
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
  start: ContourPoint,
  segments: readonly QuadraticContourSegment[],
): string {
  const commands = [
    `M ${formatCoordinate(start.x)} ${formatCoordinate(start.y)}`,
    ...segments.map(
      (segment) =>
        `Q ${formatCoordinate(segment.control.x)} ${formatCoordinate(segment.control.y)} ` +
        `${formatCoordinate(segment.end.x)} ${formatCoordinate(segment.end.y)}`,
    ),
  ];
  return `${commands.join(' ')} Z`;
}

export function contourMorphPhase(progress: number): ContourMorphPhase {
  const p = clamp01(progress);
  if (p <= 0) return 'seed';
  if (p >= 1) return 'mature';
  return p >= COAST_SETTLE_START ? 'coast-settle' : 'path-interpolation';
}

/**
 * Interpolate one app-native mature quadratic coast from an independent tiny seed loop. Point
 * motion is staggered around the ordered contour, so this is geometry interpolation rather than a
 * transformed snapshot. The source string is returned verbatim at settlement.
 */
export function morphOrganicIslandContour(
  maturePath: string,
  anchor: ContourPoint,
  progress: number,
): string {
  const p = clamp01(progress);
  if (p >= 1) return maturePath;
  const mature = parseClosedQuadraticContour(maturePath);
  const seedControls = independentSeedControls(mature.segments.length, anchor);
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
    const endAmount = (amounts[index]! + amounts[next]!) / 2;
    return {
      control: controls[index]!,
      end: lerpPoint(seedEnds[index]!, segment.end, endAmount),
    };
  });
  const startAmount = (amounts[amounts.length - 1]! + amounts[0]!) / 2;
  return printContour(lerpPoint(seedStart, mature.start, startAmount), segments);
}

/** Preserve the mature scene's loop count and source painter order. */
export function morphOrganicIslandContours(
  maturePaths: readonly string[],
  anchor: ContourPoint,
  progress: number,
): readonly string[] {
  return maturePaths.map((path) => morphOrganicIslandContour(path, anchor, progress));
}
