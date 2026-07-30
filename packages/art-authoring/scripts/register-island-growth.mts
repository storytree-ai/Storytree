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

interface FrameReport {
  file: string;
  sourceAnchor: Point;
  sourceFootprint: Box;
  normalizationOffset: Point;
  normalizedAnchor: Point;
  normalizedFootprint: Box;
  encodedBytes: number;
}

function requiredArg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function integerArg(name: string): number {
  const value = Number(requiredArg(name));
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
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
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (alphaAt(png, x, y) <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('frame has no visible pixels');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// The canopy and coastline grow, so their bbox centre is not a stable registration cue. The lowest
// three visible rows belong to the underside of the planted parcel in this track; their alpha-weighted
// x-centre plus the lowest y is the author-time ground anchor.
function lowerIslandAnchor(png: InstanceType<typeof PNG>, box: Box, threshold = 8): Point {
  const bottom = box.y + box.height - 1;
  let weightedX = 0;
  let alpha = 0;
  for (let y = Math.max(box.y, bottom - 2); y <= bottom; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      const a = alphaAt(png, x, y);
      if (a <= threshold) continue;
      weightedX += x * a;
      alpha += a;
    }
  }
  if (alpha === 0) throw new Error('could not locate lower-island anchor');
  return { x: Math.round(weightedX / alpha), y: bottom };
}

function translate(png: InstanceType<typeof PNG>, offset: Point): InstanceType<typeof PNG> {
  const out = new PNG({ width: png.width, height: png.height });
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
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

function makeContactSheet(frames: Array<InstanceType<typeof PNG>>): Buffer {
  const columns = 3;
  const rows = Math.ceil(frames.length / columns);
  const width = columns * 256;
  const height = rows * 256;
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) checker(out, x, y);
  }
  frames.forEach((frame, index) => {
    const originX = (index % columns) * 256;
    const originY = Math.floor(index / columns) * 256;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const source = (y * 256 + x) * 4;
        const target = ((originY + y) * width + originX + x) * 4;
        const a = (frame.data[source + 3] ?? 0) / 255;
        for (let channel = 0; channel < 3; channel++) {
          const fg = frame.data[source + channel] ?? 0;
          const bg = out.data[target + channel] ?? 0;
          out.data[target + channel] = Math.round(fg * a + bg * (1 - a));
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
const targetAnchor = { x: integerArg('--anchor-x'), y: integerArg('--anchor-y') };

const names = fs
  .readdirSync(inputDir)
  .filter((name) => /^frame-\d{2}\.png$/u.test(name))
  .sort();
if (names.length === 0) throw new Error(`no frame-NN.png inputs in ${inputDir}`);

fs.mkdirSync(outputDir, { recursive: true });
const reports: FrameReport[] = [];
const normalized: Array<InstanceType<typeof PNG>> = [];

for (const name of names) {
  const sourceBytes = fs.readFileSync(path.join(inputDir, name));
  const source = PNG.sync.read(sourceBytes);
  if (source.width !== 256 || source.height !== 256 || source.data.length !== 256 * 256 * 4) {
    throw new Error(`${name}: expected exactly 256x256 decoded RGBA`);
  }
  const sourceFootprint = alphaBox(source);
  const sourceAnchor = lowerIslandAnchor(source, sourceFootprint);
  const normalizationOffset = {
    x: targetAnchor.x - sourceAnchor.x,
    y: targetAnchor.y - sourceAnchor.y,
  };
  const frame = translate(source, normalizationOffset);
  const normalizedFootprint = alphaBox(frame);
  const normalizedAnchor = lowerIslandAnchor(frame, normalizedFootprint);
  if (normalizedAnchor.x !== targetAnchor.x || normalizedAnchor.y !== targetAnchor.y) {
    throw new Error(`${name}: normalization did not settle at requested anchor`);
  }
  const encoded = PNG.sync.write(frame);
  fs.writeFileSync(path.join(outputDir, name), encoded);
  normalized.push(frame);
  reports.push({
    file: name,
    sourceAnchor,
    sourceFootprint,
    normalizationOffset,
    normalizedAnchor,
    normalizedFootprint,
    encodedBytes: encoded.length,
  });
}

fs.writeFileSync(contactPath, makeContactSheet(normalized));
fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      canvas: { width: 256, height: 256, format: 'PNG', decoded: 'RGBA8' },
      frameCount: reports.length,
      targetAnchor,
      frames: reports,
      encodedFrameBytes: reports.reduce((sum, frame) => sum + frame.encodedBytes, 0),
      decodedRgbaBytes: reports.length * 256 * 256 * 4,
    },
    null,
    2,
  )}\n`,
);

console.log(JSON.stringify({ frameCount: reports.length, targetAnchor, frames: reports }, null, 2));
