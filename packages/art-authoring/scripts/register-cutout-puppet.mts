import fs from 'node:fs';
import path from 'node:path';

import { PNG } from 'pngjs';

interface Point {
  x: number;
  y: number;
}

interface Box extends Point {
  width: number;
  height: number;
}

type PixelSelection = 'wood' | 'foliage' | 'all-visible';

interface ComponentSpec {
  file: string;
  selection: PixelSelection;
  minY: number;
  maxY: number;
  targetPivot: Point;
}

interface ComponentReport {
  file: string;
  sourceDimensions: readonly [number, number];
  selection: PixelSelection;
  selectionYRange: readonly [number, number];
  sourcePivot: Point;
  sourceFootprint: Box;
  normalizationOffset: Point;
  normalizedPivot: Point;
  normalizedFootprint: Box;
  selectedPixelCount: number;
  encodedBytes: number;
}

const WOOD = new Set([
  '96,75,44',
  '119,86,74',
  '132,107,63',
  '164,140,86',
  '224,174,94',
  '221,199,154',
  '201,184,133',
  '236,220,180',
]);

const FOLIAGE = new Set([
  '29,79,43',
  '52,115,57',
  '93,132,70',
  '164,184,94',
]);

const COMPONENTS: readonly ComponentSpec[] = [
  {
    file: 'trunk-root.png',
    selection: 'wood',
    minY: 45,
    maxY: 159,
    targetPivot: { x: 48, y: 154 },
  },
  {
    file: 'branch-left.png',
    selection: 'wood',
    minY: 15,
    maxY: 72,
    targetPivot: { x: 100, y: 90 },
  },
  {
    file: 'branch-right.png',
    selection: 'wood',
    minY: 10,
    maxY: 78,
    targetPivot: { x: 28, y: 90 },
  },
  {
    file: 'canopy-left.png',
    selection: 'foliage',
    minY: 0,
    maxY: 78,
    targetPivot: { x: 70, y: 88 },
  },
  {
    file: 'canopy-crown.png',
    selection: 'foliage',
    minY: 0,
    maxY: 72,
    targetPivot: { x: 56, y: 88 },
  },
  {
    file: 'canopy-right.png',
    selection: 'foliage',
    minY: 0,
    maxY: 78,
    targetPivot: { x: 42, y: 88 },
  },
  {
    file: 'fern-tuft.png',
    selection: 'all-visible',
    minY: 0,
    maxY: 63,
    targetPivot: { x: 32, y: 60 },
  },
  {
    file: 'flower-tuft.png',
    selection: 'all-visible',
    minY: 0,
    maxY: 63,
    targetPivot: { x: 32, y: 60 },
  },
];

function requiredArg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function rgbaIndex(png: InstanceType<typeof PNG>, x: number, y: number): number {
  return (y * png.width + x) * 4;
}

function alphaAt(png: InstanceType<typeof PNG>, x: number, y: number): number {
  return png.data[rgbaIndex(png, x, y) + 3] ?? 0;
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
  if (maxX < minX || maxY < minY) throw new Error('component has no visible pixels');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function lowerAnchor(png: InstanceType<typeof PNG>, box: Box, threshold = 8): Point {
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
  if (alpha === 0) throw new Error('component has no lower anchor');
  return { x: Math.round(weightedX / alpha), y: bottom };
}

function selectedPixel(
  png: InstanceType<typeof PNG>,
  x: number,
  y: number,
  spec: ComponentSpec,
): boolean {
  if (y < spec.minY || y > spec.maxY) return false;
  const index = rgbaIndex(png, x, y);
  const alpha = png.data[index + 3] ?? 0;
  if (alpha <= 8) return false;
  if (spec.selection === 'all-visible') return true;
  const key = `${png.data[index] ?? 0},${png.data[index + 1] ?? 0},${png.data[index + 2] ?? 0}`;
  return (spec.selection === 'wood' ? WOOD : FOLIAGE).has(key);
}

function segment(
  source: InstanceType<typeof PNG>,
  spec: ComponentSpec,
): { png: InstanceType<typeof PNG>; selectedPixelCount: number } {
  const out = new PNG({ width: source.width, height: source.height });
  let selectedPixelCount = 0;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (!selectedPixel(source, x, y, spec)) continue;
      const index = rgbaIndex(source, x, y);
      source.data.copy(out.data, index, index, index + 4);
      selectedPixelCount += 1;
    }
  }
  if (selectedPixelCount === 0) {
    throw new Error(`${spec.file}: segmentation selected no pixels`);
  }
  return { png: out, selectedPixelCount };
}

function translate(
  png: InstanceType<typeof PNG>,
  offset: Point,
): InstanceType<typeof PNG> {
  const out = new PNG({ width: png.width, height: png.height });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const source = rgbaIndex(png, x, y);
      if ((png.data[source + 3] ?? 0) <= 8) continue;
      const targetX = x + offset.x;
      const targetY = y + offset.y;
      if (targetX < 0 || targetX >= png.width || targetY < 0 || targetY >= png.height) {
        throw new Error(`normalization would clip visible pixel at ${x},${y}`);
      }
      const target = rgbaIndex(out, targetX, targetY);
      png.data.copy(out.data, target, source, source + 4);
    }
  }
  return out;
}

function paintChecker(out: InstanceType<typeof PNG>, x: number, y: number): void {
  const light = ((Math.floor(x / 12) + Math.floor(y / 12)) & 1) === 0;
  const value = light ? 238 : 210;
  const index = rgbaIndex(out, x, y);
  out.data[index] = value;
  out.data[index + 1] = value;
  out.data[index + 2] = value;
  out.data[index + 3] = 255;
}

function makeContactSheet(frames: Array<InstanceType<typeof PNG>>): Buffer {
  const columns = 4;
  const cellWidth = 144;
  const cellHeight = 176;
  const rows = Math.ceil(frames.length / columns);
  const out = new PNG({ width: columns * cellWidth, height: rows * cellHeight });
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) paintChecker(out, x, y);
  }
  frames.forEach((frame, index) => {
    const originX = (index % columns) * cellWidth + Math.floor((cellWidth - frame.width) / 2);
    const originY = Math.floor(index / columns) * cellHeight + Math.floor((cellHeight - frame.height) / 2);
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < frame.width; x += 1) {
        const source = rgbaIndex(frame, x, y);
        const targetX = originX + x;
        const targetY = originY + y;
        const target = rgbaIndex(out, targetX, targetY);
        const a = (frame.data[source + 3] ?? 0) / 255;
        for (let channel = 0; channel < 3; channel += 1) {
          const foreground = frame.data[source + channel] ?? 0;
          const background = out.data[target + channel] ?? 0;
          out.data[target + channel] = Math.round(foreground * a + background * (1 - a));
        }
      }
    }
  });
  return PNG.sync.write(out);
}

const inputDir = path.resolve(requiredArg('--input-dir'));
const outputDir = path.resolve(requiredArg('--output-dir'));
const reportPath = path.resolve(requiredArg('--report'));
const contactPath = path.resolve(requiredArg('--contact-sheet'));

fs.mkdirSync(outputDir, { recursive: true });
const reports: ComponentReport[] = [];
const normalized: Array<InstanceType<typeof PNG>> = [];

for (const spec of COMPONENTS) {
  const sourceBytes = fs.readFileSync(path.join(inputDir, spec.file));
  const source = PNG.sync.read(sourceBytes);
  const { png: segmented, selectedPixelCount } = segment(source, spec);
  const sourceFootprint = alphaBox(segmented);
  const sourcePivot = lowerAnchor(segmented, sourceFootprint);
  const normalizationOffset = {
    x: spec.targetPivot.x - sourcePivot.x,
    y: spec.targetPivot.y - sourcePivot.y,
  };
  const output = translate(segmented, normalizationOffset);
  const normalizedFootprint = alphaBox(output);
  const normalizedPivot = lowerAnchor(output, normalizedFootprint);
  if (
    normalizedPivot.x !== spec.targetPivot.x ||
    normalizedPivot.y !== spec.targetPivot.y
  ) {
    throw new Error(`${spec.file}: normalization did not settle at its target pivot`);
  }
  const encoded = PNG.sync.write(output);
  fs.writeFileSync(path.join(outputDir, spec.file), encoded);
  normalized.push(output);
  reports.push({
    file: spec.file,
    sourceDimensions: [source.width, source.height],
    selection: spec.selection,
    selectionYRange: [spec.minY, spec.maxY],
    sourcePivot,
    sourceFootprint,
    normalizationOffset,
    normalizedPivot,
    normalizedFootprint,
    selectedPixelCount,
    encodedBytes: encoded.length,
  });
}

fs.writeFileSync(contactPath, makeContactSheet(normalized));
fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      authorTimeOnly: true,
      transparentBackground: true,
      sourcePalette:
        'reference-palette.png derived from the real app SVG reference plate; exact palette matching makes deterministic semantic masks possible',
      componentCount: reports.length,
      components: reports,
      encodedComponentBytes: reports.reduce((sum, component) => sum + component.encodedBytes, 0),
      decodedRgbaBytes: reports.reduce(
        (sum, component) =>
          sum + component.sourceDimensions[0] * component.sourceDimensions[1] * 4,
        0,
      ),
    },
    null,
    2,
  )}\n`,
);

console.log(
  JSON.stringify(
    {
      componentCount: reports.length,
      encodedComponentBytes: reports.reduce((sum, component) => sum + component.encodedBytes, 0),
      decodedRgbaBytes: reports.reduce(
        (sum, component) =>
          sum + component.sourceDimensions[0] * component.sourceDimensions[1] * 4,
        0,
      ),
      components: reports,
    },
    null,
    2,
  ),
);
