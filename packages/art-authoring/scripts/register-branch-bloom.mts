/**
 * Author/import-time registration for Experiment 9's bounded PixelLab leaf family.
 *
 * The accepted PixelLab studies intentionally remain in `sources/` as provenance.
 * Their over-eager generated wood is not shipped: this importer retains foliage
 * colours plus their one-pixel outline, normalizes the visible mass onto a fixed
 * 64x64 branch-local plate, and authors a five-pixel foliage neck over the exact
 * attachment socket. Runtime code imports only the registered cutouts.
 */

import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Box extends Point {
  readonly width: number;
  readonly height: number;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const ASSET_ROOT = path.join(
  REPO_ROOT,
  'packages/app-surface/src/assets/chapter2-organic-branch-bloom/v1',
);
const SOURCE_ROOT = path.join(ASSET_ROOT, 'sources');
const SOURCE_COMMIT = '4ed9bf38';
const SOURCE_ASSET_ROOT =
  'packages/app-surface/src/assets/chapter2-organic-cutout-puppet/v1';
const CANVAS = Object.freeze({ width: 64, height: 64 });
const SOCKET = Object.freeze({ x: 32, y: 58 });
const FAMILY = Object.freeze([
  { id: 'fan-spray', raw: 'pixellab-fan-spray.png', out: 'leaf-fan-spray.png', sourceMaxY: 43 },
  { id: 'fork-rosette', raw: 'pixellab-fork-rosette.png', out: 'leaf-fork-rosette.png', sourceMaxY: 42 },
  { id: 'tip-tuft', raw: 'pixellab-tip-tuft.png', out: 'leaf-tip-tuft.png', sourceMaxY: 39 },
] as const);
const INHERITED = Object.freeze([
  'trunk-root.png',
  'branch-left.png',
  'branch-right.png',
  'fern-tuft.png',
  'flower-tuft.png',
  'reference-palette.png',
  'reference-plate.png',
] as const);

function pixelIndex(png: PNG, x: number, y: number): number {
  return (y * png.width + x) * 4;
}

function alphaAt(png: PNG, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return 0;
  return png.data[pixelIndex(png, x, y) + 3] ?? 0;
}

function alphaBox(png: PNG): Box {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (alphaAt(png, x, y) <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('registered sprite has no visible pixels');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function isFoliageSeed(png: PNG, x: number, y: number): boolean {
  const i = pixelIndex(png, x, y);
  if ((png.data[i + 3] ?? 0) <= 8) return false;
  const r = png.data[i] ?? 0;
  const g = png.data[i + 1] ?? 0;
  const b = png.data[i + 2] ?? 0;
  // Green through yellow-green, excluding brown/pink generated branches and roots.
  return g >= 38 && g >= b * 1.08 && g >= r * 0.62 && r - g <= 52;
}

function foliageMask(source: PNG, sourceMaxY: number): Uint8Array {
  const seeds = new Uint8Array(source.width * source.height);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (y <= sourceMaxY && isFoliageSeed(source, x, y)) seeds[y * source.width + x] = 1;
    }
  }
  const mask = new Uint8Array(seeds);
  // Retain the selective dark outline immediately around accepted foliage pixels.
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (alphaAt(source, x, y) <= 8 || seeds[y * source.width + x] === 1) continue;
      let adjacent = false;
      for (let dy = -1; dy <= 1 && !adjacent; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) continue;
          if (seeds[ny * source.width + nx] === 1) {
            adjacent = true;
            break;
          }
        }
      }
      if (adjacent) mask[y * source.width + x] = 1;
    }
  }
  return mask;
}

function maskBox(mask: Uint8Array, width: number, height: number): Box {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] !== 1) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('PixelLab source contains no foliage pixels');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function paint(png: PNG, x: number, y: number, rgba: readonly number[]): void {
  const i = pixelIndex(png, x, y);
  png.data[i] = rgba[0]!;
  png.data[i + 1] = rgba[1]!;
  png.data[i + 2] = rgba[2]!;
  png.data[i + 3] = rgba[3]!;
}

function register(
  source: PNG,
  sourceMaxY: number,
): { readonly png: PNG; readonly sourceBox: Box; readonly offset: Point } {
  if (source.width !== CANVAS.width || source.height !== CANVAS.height) {
    throw new Error(`expected ${CANVAS.width}x${CANVAS.height} PixelLab source`);
  }
  const mask = foliageMask(source, sourceMaxY);
  const sourceBox = maskBox(mask, source.width, source.height);
  const out = new PNG({ width: CANVAS.width, height: CANVAS.height });
  const targetX = Math.max(2, Math.min(CANVAS.width - sourceBox.width - 2, SOCKET.x - Math.floor(sourceBox.width / 2)));
  const targetBottom = SOCKET.y - 3;
  const targetY = Math.max(2, targetBottom - sourceBox.height + 1);
  for (let y = 0; y < sourceBox.height; y += 1) {
    for (let x = 0; x < sourceBox.width; x += 1) {
      const sx = sourceBox.x + x;
      const sy = sourceBox.y + y;
      if (mask[sy * source.width + sx] !== 1) continue;
      const sourceIndex = pixelIndex(source, sx, sy);
      const targetIndex = pixelIndex(out, targetX + x, targetY + y);
      source.data.copy(out.data, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }
  // A tiny leaf-coloured neck guarantees alpha coverage through the exact local socket;
  // branch wood paints over it at runtime, so the connection has no exposed crop seam.
  const dark = [29, 79, 43, 255] as const;
  const mid = [52, 115, 57, 255] as const;
  for (let y = SOCKET.y - 5; y <= SOCKET.y; y += 1) {
    for (let x = SOCKET.x - 2; x <= SOCKET.x + 2; x += 1) {
      paint(out, x, y, (x + y) % 3 === 0 ? dark : mid);
    }
  }
  return {
    png: out,
    sourceBox,
    offset: { x: targetX - sourceBox.x, y: targetY - sourceBox.y },
  };
}

function gitShow(repoPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['show', `${SOURCE_COMMIT}:${repoPath}`],
      { cwd: REPO_ROOT, encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`git show failed for ${repoPath}: ${String(stderr)}`));
          return;
        }
        resolve(Buffer.from(stdout));
      },
    );
  });
}

function sourceArgs(): ReadonlyMap<string, string> {
  const pairs = process.argv.slice(2).filter((arg) => arg.startsWith('--source='));
  return new Map(
    pairs.map((arg) => {
      const value = arg.slice('--source='.length);
      const split = value.indexOf('=');
      if (split < 1) throw new Error(`invalid source argument: ${arg}`);
      return [value.slice(0, split), value.slice(split + 1)] as const;
    }),
  );
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PixelLab source download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main(): Promise<void> {
  await mkdir(SOURCE_ROOT, { recursive: true });
  for (const file of INHERITED) {
    const data = await gitShow(`${SOURCE_ASSET_ROOT}/${file}`);
    await writeFile(path.join(ASSET_ROOT, file), data);
  }

  const args = sourceArgs();
  const reports = [];
  for (const member of FAMILY) {
    const url = args.get(member.id);
    const rawFile = path.join(SOURCE_ROOT, member.raw);
    if (url) await writeFile(rawFile, await download(url));
    const source = PNG.sync.read(await readFile(rawFile));
    const registered = register(source, member.sourceMaxY);
    const outputFile = path.join(ASSET_ROOT, member.out);
    await writeFile(outputFile, PNG.sync.write(registered.png));
    const footprint = alphaBox(registered.png);
    reports.push({
      id: member.id,
      source: `sources/${member.raw}`,
      output: member.out,
      sourceDimensions: [source.width, source.height],
      sourceMaxY: member.sourceMaxY,
      sourceFootprint: registered.sourceBox,
      normalizationOffset: registered.offset,
      registeredSocket: SOCKET,
      socketAlpha: alphaAt(registered.png, SOCKET.x, SOCKET.y),
      registeredFootprint: footprint,
      encodedBytes: (await stat(outputFile)).size,
      decodedRgbaBytes: CANVAS.width * CANVAS.height * 4,
    });
  }

  const inheritedBytes = Object.fromEntries(
    await Promise.all(
      INHERITED.map(async (file) => [file, (await stat(path.join(ASSET_ROOT, file))).size] as const),
    ),
  );
  const report = {
    schemaVersion: 1,
    authorTimeOnly: true,
    sourceCommit: SOURCE_COMMIT,
    fixedCanvas: CANVAS,
    branchLocalSocket: SOCKET,
    familySize: FAMILY.length,
    runtimeCorrection: false,
    sourceToRegisteredPolicy:
      'Retain foliage colours plus their selective one-pixel outline, remove generated wood at author/import time, normalize the leaf mass to a fixed 64x64 plate, and author a five-pixel foliage neck through the exact branch-local socket.',
    inheritedBytes,
    members: reports,
    encodedLeafFamilyBytes: reports.reduce((sum, item) => sum + item.encodedBytes, 0),
    decodedLeafFamilyRgbaBytes: reports.reduce((sum, item) => sum + item.decodedRgbaBytes, 0),
  };
  await writeFile(
    path.join(ASSET_ROOT, 'registration-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

await main();
