import fs from 'node:fs';
import path from 'node:path';

import { PNG } from 'pngjs';

interface Point {
  x: number;
  y: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PoseReport {
  file: string;
  sourceDimensions: [number, number];
  sourceFootprint: Box;
  cleanedFootprint: Box;
  sourceAnchorAfterCleanup: Point;
  normalizationOffset: Point;
  normalizedAnchor: Point;
  normalizedFootprint: Box;
  removedMattePixels: number;
  removedGroundPixels: number;
  encodedBytes: number;
}

interface TrackReport {
  id: string;
  canvas: { width: number; height: number; format: 'PNG'; decoded: 'RGBA8' };
  poseCount: number;
  targetAnchor: Point;
  poses: PoseReport[];
  encodedPoseBytes: number;
  decodedRgbaBytes: number;
}

interface TrackConfig {
  id: string;
  prefix: 'tree' | 'plant';
  poseCount: number;
  size: number;
  targetAnchor: Point;
}

function requiredArg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function alphaAt(png: InstanceType<typeof PNG>, x: number, y: number): number {
  return png.data[(y * png.width + x) * 4 + 3] ?? 0;
}

function alphaBox(png: InstanceType<typeof PNG>, threshold = 8): Box {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (alphaAt(png, x, y) <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('pose has no visible pixels');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function clonePng(source: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const out = new PNG({ width: source.width, height: source.height });
  source.data.copy(out.data);
  return out;
}

function clearPixel(png: InstanceType<typeof PNG>, x: number, y: number): void {
  const index = (y * png.width + x) * 4;
  png.data[index] = 0;
  png.data[index + 1] = 0;
  png.data[index + 2] = 0;
  png.data[index + 3] = 0;
}

/**
 * PixFlux reported the tree jobs as transparent, but these selected downloads arrived on a flat
 * white matte. Import-time transparency normalization removes only neutral near-white pixels; the
 * committed runtime outputs are checked again through their alpha footprints.
 */
function cleanWhiteMatte(png: InstanceType<typeof PNG>): number {
  let removed = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (y * png.width + x) * 4;
      const r = png.data[index] ?? 0;
      const g = png.data[index + 1] ?? 0;
      const b = png.data[index + 2] ?? 0;
      const a = png.data[index + 3] ?? 0;
      const neutralNearWhite =
        a > 8 &&
        Math.min(r, g, b) >= 238 &&
        Math.max(r, g, b) - Math.min(r, g, b) <= 10;
      if (!neutralNearWhite) continue;
      clearPixel(png, x, y);
      removed += 1;
    }
  }
  return removed;
}

/**
 * PixelLab followed the organic request but added a thin model-authored ground/shadow strip to
 * later tree poses. The island, its shadows and its ground stay app-owned under ADR-0274, so this
 * import pass removes only green/neutral pixels in the bottom band. Brown roots remain untouched.
 */
function cleanTreeGround(png: InstanceType<typeof PNG>): number {
  let removed = 0;
  const firstGroundRow = Math.floor(png.height * 0.77);
  for (let y = firstGroundRow; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (y * png.width + x) * 4;
      const r = png.data[index] ?? 0;
      const g = png.data[index + 1] ?? 0;
      const b = png.data[index + 2] ?? 0;
      const a = png.data[index + 3] ?? 0;
      if (a <= 8) continue;
      const greenGround = g >= r * 1.05 && g >= b * 1.08;
      const neutralShadow =
        y >= Math.floor(png.height * 0.86) &&
        Math.max(r, g, b) - Math.min(r, g, b) <= 24 &&
        g >= r &&
        g >= b &&
        Math.max(r, g, b) < 145;
      if (!greenGround && !neutralShadow) continue;
      clearPixel(png, x, y);
      removed += 1;
    }
  }
  return removed;
}

/**
 * The plant prompts likewise produced a few soil/shadow pixels below the botanical silhouette.
 * Keep greens and flower yellows; clear low-band earth/neutral pixels so only organic material
 * crosses the runtime blend seam.
 */
function cleanPlantGround(png: InstanceType<typeof PNG>): number {
  let removed = 0;
  const firstGroundRow = Math.floor(png.height * 0.45);
  for (let y = firstGroundRow; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (y * png.width + x) * 4;
      const r = png.data[index] ?? 0;
      const g = png.data[index + 1] ?? 0;
      const b = png.data[index + 2] ?? 0;
      const a = png.data[index + 3] ?? 0;
      if (a <= 8) continue;
      const botanicalGreen = g >= r * 1.04 && g >= b * 1.08;
      const flowerYellow = r >= 120 && g >= 85 && b <= Math.min(r, g) * 0.78;
      if (botanicalGreen || flowerYellow) continue;
      clearPixel(png, x, y);
      removed += 1;
    }
  }
  return removed;
}

/**
 * After cleanup the lowest three alpha rows are roots/stems only. Their alpha-weighted horizontal
 * centre plus the lowest y is the declared planted socket used for author-time registration.
 */
function lowerOrganicAnchor(
  png: InstanceType<typeof PNG>,
  box: Box,
  threshold = 8,
): Point {
  const bottom = box.y + box.height - 1;
  let weightedX = 0;
  let alpha = 0;
  for (let y = Math.max(box.y, bottom - 2); y <= bottom; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) {
      const a = alphaAt(png, x, y);
      if (a <= threshold) continue;
      weightedX += x * a;
      alpha += a;
    }
  }
  if (alpha === 0) throw new Error('could not locate cleaned organic anchor');
  return { x: Math.round(weightedX / alpha), y: bottom };
}

function translate(
  png: InstanceType<typeof PNG>,
  offset: Point,
): InstanceType<typeof PNG> {
  const out = new PNG({ width: png.width, height: png.height });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const targetX = x + offset.x;
      const targetY = y + offset.y;
      if (targetX < 0 || targetX >= png.width || targetY < 0 || targetY >= png.height) {
        if (alphaAt(png, x, y) > 8) {
          throw new Error(`normalization would clip visible pixel at ${x},${y}`);
        }
        continue;
      }
      const source = (y * png.width + x) * 4;
      const target = (targetY * png.width + targetX) * 4;
      png.data.copy(out.data, target, source, source + 4);
    }
  }
  return out;
}

function checker(out: InstanceType<typeof PNG>, x: number, y: number): void {
  const light = ((Math.floor(x / 16) + Math.floor(y / 16)) & 1) === 0;
  const value = light ? 224 : 190;
  const index = (y * out.width + x) * 4;
  out.data[index] = value;
  out.data[index + 1] = value;
  out.data[index + 2] = value;
  out.data[index + 3] = 255;
}

function compositeNearest(
  out: InstanceType<typeof PNG>,
  source: InstanceType<typeof PNG>,
  originX: number,
  originY: number,
  scale: number,
): void {
  for (let y = 0; y < source.height * scale; y += 1) {
    for (let x = 0; x < source.width * scale; x += 1) {
      const sourceX = Math.floor(x / scale);
      const sourceY = Math.floor(y / scale);
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const targetIndex = ((originY + y) * out.width + originX + x) * 4;
      const alpha = (source.data[sourceIndex + 3] ?? 0) / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        const foreground = source.data[sourceIndex + channel] ?? 0;
        const background = out.data[targetIndex + channel] ?? 0;
        out.data[targetIndex + channel] = Math.round(
          foreground * alpha + background * (1 - alpha),
        );
      }
      out.data[targetIndex + 3] = 255;
    }
  }
}

function makeContactSheet(
  trees: Array<InstanceType<typeof PNG>>,
  plants: Array<InstanceType<typeof PNG>>,
): Buffer {
  const out = new PNG({ width: 1024, height: 512 });
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) checker(out, x, y);
  }
  trees.forEach((pose, index) => compositeNearest(out, pose, index * 256, 0, 1));
  plants.forEach((pose, index) =>
    compositeNearest(out, pose, 128 + index * 256, 256, 2),
  );
  return PNG.sync.write(out);
}

function registerTrack(
  config: TrackConfig,
  sourceDir: string,
  outputRoot: string,
): { report: TrackReport; poses: Array<InstanceType<typeof PNG>> } {
  const outputDir = path.join(outputRoot, config.prefix);
  fs.mkdirSync(outputDir, { recursive: true });
  const poses: Array<InstanceType<typeof PNG>> = [];
  const reports: PoseReport[] = [];

  for (let index = 0; index < config.poseCount; index += 1) {
    const sourceName = `${config.prefix}-${String(index).padStart(2, '0')}.png`;
    const outputName = `pose-${String(index).padStart(2, '0')}.png`;
    const sourceBytes = fs.readFileSync(path.join(sourceDir, sourceName));
    const decoded = PNG.sync.read(sourceBytes);
    if (
      decoded.width !== config.size ||
      decoded.height !== config.size ||
      decoded.data.length !== config.size * config.size * 4
    ) {
      throw new Error(`${sourceName}: expected exactly ${config.size}x${config.size} RGBA`);
    }
    const cleaned = clonePng(decoded);
    const removedMattePixels = cleanWhiteMatte(cleaned);
    const sourceFootprint = alphaBox(cleaned);
    const removedGroundPixels =
      config.prefix === 'tree' ? cleanTreeGround(cleaned) : cleanPlantGround(cleaned);
    const cleanedFootprint = alphaBox(cleaned);
    const sourceAnchorAfterCleanup = lowerOrganicAnchor(cleaned, cleanedFootprint);
    const normalizationOffset = {
      x: config.targetAnchor.x - sourceAnchorAfterCleanup.x,
      y: config.targetAnchor.y - sourceAnchorAfterCleanup.y,
    };
    const normalized = translate(cleaned, normalizationOffset);
    const normalizedFootprint = alphaBox(normalized);
    const normalizedAnchor = lowerOrganicAnchor(normalized, normalizedFootprint);
    if (
      normalizedAnchor.x !== config.targetAnchor.x ||
      normalizedAnchor.y !== config.targetAnchor.y
    ) {
      throw new Error(`${sourceName}: normalized pose missed its requested anchor`);
    }
    const encoded = PNG.sync.write(normalized);
    fs.writeFileSync(path.join(outputDir, outputName), encoded);
    poses.push(normalized);
    reports.push({
      file: outputName,
      sourceDimensions: [decoded.width, decoded.height],
      sourceFootprint,
      cleanedFootprint,
      sourceAnchorAfterCleanup,
      normalizationOffset,
      normalizedAnchor,
      normalizedFootprint,
      removedMattePixels,
      removedGroundPixels,
      encodedBytes: encoded.length,
    });
  }

  return {
    poses,
    report: {
      id: config.id,
      canvas: {
        width: config.size,
        height: config.size,
        format: 'PNG',
        decoded: 'RGBA8',
      },
      poseCount: config.poseCount,
      targetAnchor: config.targetAnchor,
      poses: reports,
      encodedPoseBytes: reports.reduce((sum, pose) => sum + pose.encodedBytes, 0),
      decodedRgbaBytes: config.poseCount * config.size * config.size * 4,
    },
  };
}

const sourceDir = path.resolve(requiredArg('--source-dir'));
const outputRoot = path.resolve(requiredArg('--output-dir'));
const reportPath = path.resolve(requiredArg('--report'));
const contactSheetPath = path.resolve(requiredArg('--contact-sheet'));

const tree = registerTrack(
  {
    id: 'hero-tree',
    prefix: 'tree',
    poseCount: 4,
    size: 256,
    targetAnchor: { x: 128, y: 240 },
  },
  sourceDir,
  outputRoot,
);
const plant = registerTrack(
  {
    id: 'ground-plant',
    prefix: 'plant',
    poseCount: 3,
    size: 128,
    targetAnchor: { x: 64, y: 116 },
  },
  sourceDir,
  outputRoot,
);

fs.writeFileSync(contactSheetPath, makeContactSheet(tree.poses, plant.poses));
fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      normalizationPolicy:
        'Remove model-authored ground/shadow pixels in a bounded lower band, then translate each cleaned alpha silhouette so the alpha-weighted centre of its lowest three root/stem rows equals the track target anchor. Reject clipping or dimension drift.',
      tracks: [tree.report, plant.report],
      runtimeEncodedPoseBytes: tree.report.encodedPoseBytes + plant.report.encodedPoseBytes,
      runtimeDecodedRgbaBytes:
        tree.report.decodedRgbaBytes + plant.report.decodedRgbaBytes,
    },
    null,
    2,
  )}\n`,
);

console.log(
  JSON.stringify(
    {
      tree: tree.report,
      plant: plant.report,
    },
    null,
    2,
  ),
);
