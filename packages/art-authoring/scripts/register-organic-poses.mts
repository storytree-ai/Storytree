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

function alphaBox(png: InstanceType<typeof PNG>, threshold: number): Box {
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
  if (maxX < minX || maxY < minY) throw new Error('frame has no visible pixels');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Organic tracks declare one planted contact. The bottom-most three occupied rows are the only
 * registration signal allowed here: canopy width and branch centres deliberately change from pose
 * to pose, so centring on the full alpha box would make the root walk.
 */
function plantedContact(
  png: InstanceType<typeof PNG>,
  box: Box,
  threshold: number,
): Point {
  const bottom = box.y + box.height - 1;
  let weightedX = 0;
  let alpha = 0;
  for (let y = Math.max(box.y, bottom - 2); y <= bottom; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) {
      const value = alphaAt(png, x, y);
      if (value <= threshold) continue;
      weightedX += x * value;
      alpha += value;
    }
  }
  if (alpha === 0) throw new Error('could not locate planted contact');
  return { x: Math.round(weightedX / alpha), y: bottom };
}

function translate(
  png: InstanceType<typeof PNG>,
  offset: Point,
  threshold: number,
): InstanceType<typeof PNG> {
  const out = new PNG({ width: png.width, height: png.height });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const targetX = x + offset.x;
      const targetY = y + offset.y;
      if (targetX < 0 || targetX >= png.width || targetY < 0 || targetY >= png.height) {
        if (alphaAt(png, x, y) > threshold) {
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
  const light = ((Math.floor(x / 12) + Math.floor(y / 12)) & 1) === 0;
  const value = light ? 224 : 190;
  const index = (y * out.width + x) * 4;
  out.data[index] = value;
  out.data[index + 1] = value;
  out.data[index + 2] = value;
  out.data[index + 3] = 255;
}

function makeContactSheet(
  frames: Array<InstanceType<typeof PNG>>,
  frameWidth: number,
  frameHeight: number,
): Buffer {
  const columns = Math.min(3, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const out = new PNG({ width: columns * frameWidth, height: rows * frameHeight });
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) checker(out, x, y);
  }
  frames.forEach((frame, index) => {
    const originX = (index % columns) * frameWidth;
    const originY = Math.floor(index / columns) * frameHeight;
    for (let y = 0; y < frameHeight; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const source = (y * frameWidth + x) * 4;
        const target = ((originY + y) * out.width + originX + x) * 4;
        const alpha = (frame.data[source + 3] ?? 0) / 255;
        for (let channel = 0; channel < 3; channel += 1) {
          const foreground = frame.data[source + channel] ?? 0;
          const background = out.data[target + channel] ?? 0;
          out.data[target + channel] = Math.round(
            foreground * alpha + background * (1 - alpha),
          );
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
const width = integerArg('--width');
const height = integerArg('--height');
const expectedFrames = integerArg('--expected-frames');
const alphaThreshold = integerArg('--alpha-threshold');
const targetAnchor = { x: integerArg('--anchor-x'), y: integerArg('--anchor-y') };

const names = fs
  .readdirSync(inputDir)
  .filter((name) => /^frame-\d{2}\.png$/u.test(name))
  .sort();
if (names.length !== expectedFrames) {
  throw new Error(
    `expected ${expectedFrames} frame-NN.png inputs in ${inputDir}, found ${names.length}`,
  );
}

fs.mkdirSync(outputDir, { recursive: true });
const reports: FrameReport[] = [];
const normalized: Array<InstanceType<typeof PNG>> = [];

for (const name of names) {
  const source = PNG.sync.read(fs.readFileSync(path.join(inputDir, name)));
  if (
    source.width !== width ||
    source.height !== height ||
    source.data.length !== width * height * 4
  ) {
    throw new Error(`${name}: expected exactly ${width}x${height} decoded RGBA`);
  }
  const sourceFootprint = alphaBox(source, alphaThreshold);
  const sourceAnchor = plantedContact(source, sourceFootprint, alphaThreshold);
  const normalizationOffset = {
    x: targetAnchor.x - sourceAnchor.x,
    y: targetAnchor.y - sourceAnchor.y,
  };
  const frame = translate(source, normalizationOffset, alphaThreshold);
  const normalizedFootprint = alphaBox(frame, alphaThreshold);
  const normalizedAnchor = plantedContact(frame, normalizedFootprint, alphaThreshold);
  if (
    normalizedAnchor.x !== targetAnchor.x ||
    normalizedAnchor.y !== targetAnchor.y
  ) {
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

fs.writeFileSync(contactPath, makeContactSheet(normalized, width, height));
fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      canvas: { width, height, format: 'PNG', decoded: 'RGBA8' },
      frameCount: reports.length,
      targetAnchor,
      alphaThreshold,
      anchorRule: 'alpha-weighted x across bottom three occupied rows; bottom-most occupied y',
      frames: reports,
      encodedFrameBytes: reports.reduce((sum, frame) => sum + frame.encodedBytes, 0),
      decodedRgbaBytes: reports.length * width * height * 4,
    },
    null,
    2,
  )}\n`,
);

console.log(
  JSON.stringify(
    { frameCount: reports.length, targetAnchor, frames: reports },
    null,
    2,
  ),
);
