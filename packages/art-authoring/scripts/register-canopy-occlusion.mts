/**
 * Author/import-time registration for Experiment 8's PixelLab canopy sequence.
 *
 * `prepare` extracts the foliage-only endpoint silhouettes from the two accepted
 * PixelLab jobs, places them on the fixed crown plate, and authors the compact
 * natural join. `finalize` normalizes PixelLab's interpolated raw frames onto
 * that same plate, reapplies the identical join, writes the runtime poses, and
 * emits executable registration/budget evidence.
 *
 * Runtime code never imports this script, the raw PixelLab jobs, the reference
 * plate, or the contact sheet.
 */

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
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

interface FrameReport {
  readonly file: string;
  readonly sourceFile: string;
  readonly sourceDimensions: readonly [number, number];
  readonly sourceFootprint: Box;
  readonly normalizationOffset: Point;
  readonly registeredCrownSocket: Point;
  readonly registeredFootprint: Box;
  readonly legacyCollarPixelsExcluded: number;
  readonly opaqueCollarPixels: number;
  readonly collarCoreMinimumAlpha: number;
  readonly encodedBytes: number;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ASSET_ROOT = path.resolve(
  SCRIPT_DIR,
  '../../app-surface/src/assets/chapter2-organic-canopy-occlusion/v1',
);
const SOURCE_ROOT = path.join(ASSET_ROOT, 'sources');
const RAW_SEQUENCE_ROOT = path.join(SOURCE_ROOT, 'canopy-sequence');
const CANOPY_ROOT = path.join(ASSET_ROOT, 'canopy');

const CANVAS = Object.freeze({ width: 192, height: 176 });
// Register the socket at the actual authored trunk/canopy contact. The paired rig
// socket preserves the established net transform (-96, -210), so this evidence
// correction cannot move the rendered tree or its camera framing.
const CROWN_SOCKET = Object.freeze({ x: 96, y: 112 });
const RIG_CROWN_SOCKET = Object.freeze({ x: 0, y: -98 });
const LEGACY_COLLAR_Y = 141;
const COLLAR_BOUNDS = Object.freeze({ x: 72, y: 101, width: 49, height: 31 });
const COLLAR_CORE = Object.freeze({ x: 91, y: 105, width: 11, height: 18 });
const MIN_OPAQUE_COLLAR_PIXELS = 1100;

// Forced palette recorded by the inherited real-app reference plate. Exact
// matching makes the foliage extraction deterministic and keeps PixelLab's
// accidentally generated wood/land pixels out of the shipped crown frames.
const FOLIAGE = new Set([
  '29,79,43',
  '52,115,57',
  '93,132,70',
  '164,184,94',
]);

const COLLAR_DARK = Object.freeze([29, 79, 43, 255] as const);
const COLLAR_MID = Object.freeze([52, 115, 57, 255] as const);
const COLLAR_LIGHT = Object.freeze([93, 132, 70, 255] as const);
const WOOD_DARK = Object.freeze([96, 75, 44, 255] as const);
const WOOD_MID = Object.freeze([132, 107, 63, 255] as const);

const PART_REGISTRATIONS = Object.freeze({
  branchLeft: Object.freeze({
    socket: Object.freeze({ x: -7, y: -74 }),
    pivot: Object.freeze({ x: 100, y: 90 }),
  }),
  branchRight: Object.freeze({
    socket: Object.freeze({ x: 8, y: -84 }),
    pivot: Object.freeze({ x: 28, y: 90 }),
  }),
  trunk: Object.freeze({
    socket: Object.freeze({ x: 0, y: 0 }),
    pivot: Object.freeze({ x: 48, y: 154 }),
  }),
});

function runtimeRelativeOffset(registration: {
  readonly socket: Point;
  readonly pivot: Point;
}): Point {
  const canopyTopLeft = {
    x: RIG_CROWN_SOCKET.x - CROWN_SOCKET.x,
    y: RIG_CROWN_SOCKET.y - CROWN_SOCKET.y,
  };
  return {
    x: registration.socket.x - registration.pivot.x - canopyTopLeft.x,
    y: registration.socket.y - registration.pivot.y - canopyTopLeft.y,
  };
}

const RUNTIME_RELATIVE_OFFSETS = Object.freeze({
  branchLeft: Object.freeze(runtimeRelativeOffset(PART_REGISTRATIONS.branchLeft)),
  branchRight: Object.freeze(runtimeRelativeOffset(PART_REGISTRATIONS.branchRight)),
  trunk: Object.freeze(runtimeRelativeOffset(PART_REGISTRATIONS.trunk)),
});

function rgbaIndex(png: PNG, x: number, y: number): number {
  return (y * png.width + x) * 4;
}

function alphaAt(png: PNG, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return 0;
  return png.data[rgbaIndex(png, x, y) + 3] ?? 0;
}

function alphaBox(png: PNG, threshold = 8): Box {
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
  if (maxX < minX || maxY < minY) throw new Error('frame contains no visible pixels');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function visibleMask(source: PNG, foliageOnly: boolean, maxSourceY = source.height - 1): Uint8Array {
  const mask = new Uint8Array(source.width * source.height);
  for (let y = 0; y < source.height; y += 1) {
    if (y > maxSourceY) continue;
    for (let x = 0; x < source.width; x += 1) {
      const index = rgbaIndex(source, x, y);
      const alpha = source.data[index + 3] ?? 0;
      if (alpha <= 8) continue;
      if (foliageOnly) {
        const key = `${source.data[index] ?? 0},${source.data[index + 1] ?? 0},${source.data[index + 2] ?? 0}`;
        if (!FOLIAGE.has(key)) continue;
      }
      mask[y * source.width + x] = 1;
    }
  }
  return mask;
}

/** Keep one connected crown. Detached ground flecks and floating leaf clusters are discarded. */
function largestComponent(source: PNG, foliageOnly: boolean, maxSourceY?: number): PNG {
  const mask = visibleMask(source, foliageOnly, maxSourceY);
  const seen = new Uint8Array(mask.length);
  let largest: number[] = [];
  const neighbours = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const;

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || seen[start] === 1) continue;
    const queue = [start];
    const component: number[] = [];
    seen[start] = 1;
    while (queue.length > 0) {
      const current = queue.pop()!;
      component.push(current);
      const x = current % source.width;
      const y = Math.floor(current / source.width);
      for (const [dx, dy] of neighbours) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) continue;
        const candidate = ny * source.width + nx;
        if (mask[candidate] !== 1 || seen[candidate] === 1) continue;
        seen[candidate] = 1;
        queue.push(candidate);
      }
    }
    if (component.length > largest.length) largest = component;
  }

  if (largest.length === 0) throw new Error('no connected foliage component found');
  const out = new PNG({ width: source.width, height: source.height });
  for (const pixel of largest) {
    const sourceIndex = pixel * 4;
    source.data.copy(out.data, sourceIndex, sourceIndex, sourceIndex + 4);
  }
  return out;
}

/** PixelLab interpolated the rejected y141..171 ellipse into every raw frame. Remove that
 * author-time contamination before component selection; the natural crown taper ends above it. */
function excludeLegacyCollar(source: PNG): {
  readonly png: PNG;
  readonly excludedPixels: number;
} {
  const out = new PNG({ width: source.width, height: source.height });
  source.data.copy(out.data);
  let excludedPixels = 0;
  for (let y = LEGACY_COLLAR_Y; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      const index = rgbaIndex(out, x, y);
      if ((out.data[index + 3] ?? 0) > 8) excludedPixels += 1;
      out.data[index] = 0;
      out.data[index + 1] = 0;
      out.data[index + 2] = 0;
      out.data[index + 3] = 0;
    }
  }
  return { png: out, excludedPixels };
}

function registeredFrame(
  source: PNG,
  maxWidth: number,
  foliageOnly: boolean,
  maxSourceY?: number,
  maxScale = 1,
): {
  readonly png: PNG;
  readonly sourceFootprint: Box;
  readonly normalizationOffset: Point;
  readonly legacyCollarPixelsExcluded: number;
} {
  const cleaned = excludeLegacyCollar(source);
  const crown = largestComponent(cleaned.png, foliageOnly, maxSourceY);
  const sourceFootprint = alphaBox(crown);
  const scale = Math.min(maxScale, maxWidth / sourceFootprint.width, 132 / sourceFootprint.height);
  const scaledWidth = Math.max(1, Math.round(sourceFootprint.width * scale));
  const scaledHeight = Math.max(1, Math.round(sourceFootprint.height * scale));
  // Preserve the natural upper-crown silhouette while landing its taper around the real
  // runtime trunk-top join (visible trunk pixels begin near canopy-local y105).
  const targetBottomY = 135;
  const targetX = CROWN_SOCKET.x - Math.floor(scaledWidth / 2);
  const targetY = targetBottomY - scaledHeight + 1;
  const out = new PNG({ width: CANVAS.width, height: CANVAS.height });

  for (let y = 0; y < scaledHeight; y += 1) {
    for (let x = 0; x < scaledWidth; x += 1) {
      const sourceX = sourceFootprint.x + Math.min(sourceFootprint.width - 1, Math.floor(x / scale));
      const sourceY = sourceFootprint.y + Math.min(sourceFootprint.height - 1, Math.floor(y / scale));
      const sourceIndex = rgbaIndex(crown, sourceX, sourceY);
      if ((crown.data[sourceIndex + 3] ?? 0) <= 8) continue;
      const targetIndex = rgbaIndex(out, targetX + x, targetY + y);
      crown.data.copy(out.data, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }

  authorNaturalJoin(out);
  return {
    png: out,
    sourceFootprint,
    normalizationOffset: {
      x: targetX - sourceFootprint.x,
      y: targetY - sourceFootprint.y,
    },
    legacyCollarPixelsExcluded: cleaned.excludedPixels,
  };
}

function paintPixel(png: PNG, x: number, y: number, rgba: readonly number[]): void {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const index = rgbaIndex(png, x, y);
  png.data[index] = rgba[0]!;
  png.data[index + 1] = rgba[1]!;
  png.data[index + 2] = rgba[2]!;
  png.data[index + 3] = rgba[3]!;
}

function paintEllipse(
  png: PNG,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rgba: readonly number[],
): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) paintPixel(png, x, y, rgba);
    }
  }
}

function paintSegment(
  png: PNG,
  from: Point,
  to: Point,
  radius: number,
  rgba: readonly number[],
): void {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = steps === 0 ? 0 : step / steps;
    paintEllipse(
      png,
      Math.round(from.x + (to.x - from.x) * ratio),
      Math.round(from.y + (to.y - from.y) * ratio),
      radius,
      radius,
      rgba,
    );
  }
}

/**
 * A narrow, connected lower-canopy skirt around the REAL trunk-top join. The small
 * forked wood bridge sits behind the unchanged foreground trunk; asymmetric leaf
 * lobes continue the crown down either side without forming a second green crown.
 * Everything is authored into each pose; runtime correction remains forbidden.
 */
function authorNaturalJoin(png: PNG): void {
  // Wood first: a compact Y bridge from the trunk top into the two lower crown shoulders.
  paintSegment(png, { x: 96, y: 124 }, { x: 96, y: 103 }, 4, WOOD_DARK);
  paintSegment(png, { x: 96, y: 112 }, { x: 80, y: 102 }, 3, WOOD_DARK);
  paintSegment(png, { x: 97, y: 112 }, { x: 113, y: 101 }, 3, WOOD_DARK);
  paintSegment(png, { x: 96, y: 121 }, { x: 97, y: 105 }, 1, WOOD_MID);

  // Uneven foliage shoulders: small connected lobes, deliberately not one lower ellipse.
  paintEllipse(png, 78, 105, 7, 5, COLLAR_DARK);
  paintEllipse(png, 85, 102, 8, 6, COLLAR_MID);
  paintEllipse(png, 88, 112, 8, 6, COLLAR_DARK);
  paintEllipse(png, 106, 111, 8, 6, COLLAR_DARK);
  paintEllipse(png, 110, 102, 9, 6, COLLAR_MID);
  paintEllipse(png, 117, 106, 5, 5, COLLAR_DARK);
  paintEllipse(png, 82, 102, 3, 2, COLLAR_LIGHT);
  paintEllipse(png, 109, 101, 3, 2, COLLAR_LIGHT);

  // The compact bridge core is the invariant registration proof. It is wood-toned and
  // covered by the runtime trunk, never exposed as a rectangular foliage patch.
  for (let y = COLLAR_CORE.y; y < COLLAR_CORE.y + COLLAR_CORE.height; y += 1) {
    for (let x = COLLAR_CORE.x; x < COLLAR_CORE.x + COLLAR_CORE.width; x += 1) {
      paintPixel(png, x, y, (x + y) % 4 === 0 ? WOOD_MID : WOOD_DARK);
    }
  }
}

function collarEvidence(png: PNG): { readonly pixels: number; readonly minimumAlpha: number } {
  let pixels = 0;
  let minimumAlpha = 255;
  for (let y = COLLAR_BOUNDS.y; y < COLLAR_BOUNDS.y + COLLAR_BOUNDS.height; y += 1) {
    for (let x = COLLAR_BOUNDS.x; x < COLLAR_BOUNDS.x + COLLAR_BOUNDS.width; x += 1) {
      if (alphaAt(png, x, y) >= 250) pixels += 1;
    }
  }
  for (let y = COLLAR_CORE.y; y < COLLAR_CORE.y + COLLAR_CORE.height; y += 1) {
    for (let x = COLLAR_CORE.x; x < COLLAR_CORE.x + COLLAR_CORE.width; x += 1) {
      minimumAlpha = Math.min(minimumAlpha, alphaAt(png, x, y));
    }
  }
  return { pixels, minimumAlpha };
}

function composite(target: PNG, source: PNG, dx: number, dy: number): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
      const sourceIndex = rgbaIndex(source, x, y);
      const sourceAlpha = (source.data[sourceIndex + 3] ?? 0) / 255;
      if (sourceAlpha <= 0) continue;
      const targetIndex = rgbaIndex(target, tx, ty);
      const targetAlpha = (target.data[targetIndex + 3] ?? 0) / 255;
      const outAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
      for (let channel = 0; channel < 3; channel += 1) {
        const sourceColor = source.data[sourceIndex + channel] ?? 0;
        const targetColor = target.data[targetIndex + channel] ?? 0;
        target.data[targetIndex + channel] = Math.round(
          (sourceColor * sourceAlpha + targetColor * targetAlpha * (1 - sourceAlpha)) /
            Math.max(outAlpha, Number.EPSILON),
        );
      }
      target.data[targetIndex + 3] = Math.round(outAlpha * 255);
    }
  }
}

async function readPng(file: string): Promise<PNG> {
  return PNG.sync.read(await readFile(file));
}

async function writePng(file: string, png: PNG): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, PNG.sync.write(png));
}

async function buildRegistrationPlate(): Promise<PNG> {
  const plate = new PNG({ width: CANVAS.width, height: CANVAS.height });
  // Exact mature runtime transforms converted from rig coordinates into the canopy canvas.
  composite(
    plate,
    await readPng(path.join(ASSET_ROOT, 'branch-left.png')),
    RUNTIME_RELATIVE_OFFSETS.branchLeft.x,
    RUNTIME_RELATIVE_OFFSETS.branchLeft.y,
  );
  composite(
    plate,
    await readPng(path.join(ASSET_ROOT, 'branch-right.png')),
    RUNTIME_RELATIVE_OFFSETS.branchRight.x,
    RUNTIME_RELATIVE_OFFSETS.branchRight.y,
  );
  composite(
    plate,
    await readPng(path.join(ASSET_ROOT, 'trunk-root.png')),
    RUNTIME_RELATIVE_OFFSETS.trunk.x,
    RUNTIME_RELATIVE_OFFSETS.trunk.y,
  );
  return plate;
}

function checker(width: number, height: number): PNG {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = ((Math.floor(x / 12) + Math.floor(y / 12)) & 1) === 0 ? 238 : 210;
      paintPixel(out, x, y, [value, value, value, 255]);
    }
  }
  return out;
}

async function contactSheet(frames: readonly PNG[], file: string): Promise<void> {
  const columns = 3;
  const rows = Math.ceil(frames.length / columns);
  const cellWidth = CANVAS.width + 24;
  const cellHeight = CANVAS.height + 24;
  const out = checker(columns * cellWidth, rows * cellHeight);
  const leftBranch = await readPng(path.join(ASSET_ROOT, 'branch-left.png'));
  const rightBranch = await readPng(path.join(ASSET_ROOT, 'branch-right.png'));
  const trunk = await readPng(path.join(ASSET_ROOT, 'trunk-root.png'));
  frames.forEach((frame, index) => {
    const cell = new PNG({ width: CANVAS.width, height: CANVAS.height });
    // Runtime painter order: branch wood -> canopy/collar -> structural trunk.
    composite(
      cell,
      leftBranch,
      RUNTIME_RELATIVE_OFFSETS.branchLeft.x,
      RUNTIME_RELATIVE_OFFSETS.branchLeft.y,
    );
    composite(
      cell,
      rightBranch,
      RUNTIME_RELATIVE_OFFSETS.branchRight.x,
      RUNTIME_RELATIVE_OFFSETS.branchRight.y,
    );
    composite(cell, frame, 0, 0);
    composite(
      cell,
      trunk,
      RUNTIME_RELATIVE_OFFSETS.trunk.x,
      RUNTIME_RELATIVE_OFFSETS.trunk.y,
    );
    composite(
      out,
      cell,
      (index % columns) * cellWidth + 12,
      Math.floor(index / columns) * cellHeight + 12,
    );
  });
  await writePng(file, out);
}

async function prepare(): Promise<void> {
  const youngSource = await readPng(path.join(SOURCE_ROOT, 'pixellab-young-endpoint.png'));
  const matureSource = await readPng(path.join(SOURCE_ROOT, 'pixellab-mature-endpoint.png'));
  // PixFlux supplied coherent tree studies despite the foliage-only prompt. The
  // upper plate bounds isolate the connected crown while excluding the generated
  // trunk/ground study; this is recorded source evidence, not hidden cleanup.
  const young = registeredFrame(youngSource, 82, true, 108);
  const mature = registeredFrame(matureSource, 172, true, 124, 1.12);
  const youngFile = path.join(SOURCE_ROOT, 'canopy-endpoint-young-registered.png');
  const matureFile = path.join(SOURCE_ROOT, 'canopy-endpoint-mature-registered.png');
  await writePng(youngFile, young.png);
  await writePng(matureFile, mature.png);
  await writePng(path.join(ASSET_ROOT, 'crown-registration-plate.png'), await buildRegistrationPlate());
  await contactSheet([young.png, mature.png], path.join(SOURCE_ROOT, 'endpoint-inspection.png'));
  console.log(
    JSON.stringify(
      {
        canvas: CANVAS,
        crownSocket: CROWN_SOCKET,
        rigCrownSocket: RIG_CROWN_SOCKET,
        netCanopyTransform: {
          x: RIG_CROWN_SOCKET.x - CROWN_SOCKET.x,
          y: RIG_CROWN_SOCKET.y - CROWN_SOCKET.y,
        },
        runtimeRelativeOffsets: RUNTIME_RELATIVE_OFFSETS,
        legacyCollarExclusion: { yFrom: LEGACY_COLLAR_Y },
        collarBounds: COLLAR_BOUNDS,
        collarCore: COLLAR_CORE,
        young: { sourceFootprint: young.sourceFootprint, evidence: collarEvidence(young.png) },
        mature: { sourceFootprint: mature.sourceFootprint, evidence: collarEvidence(mature.png) },
        next: 'PixelLab animate_image between the two registered endpoint files, then place its raw frames in sources/canopy-sequence and run finalize.',
      },
      null,
      2,
    ),
  );
}

async function finalize(): Promise<void> {
  const names = (await readdir(RAW_SEQUENCE_ROOT))
    .filter((name) => /^frame-\d\d\.png$/u.test(name))
    .sort();
  if (names.length !== 9) {
    throw new Error(`expected exactly 9 raw PixelLab canopy poses, found ${names.length}`);
  }
  await mkdir(CANOPY_ROOT, { recursive: true });
  const reports: FrameReport[] = [];
  const frames: PNG[] = [];
  for (const [index, name] of names.entries()) {
    const sourceFile = path.join(RAW_SEQUENCE_ROOT, name);
    const source = await readPng(sourceFile);
    if (source.width !== CANVAS.width || source.height !== CANVAS.height) {
      throw new Error(`${name}: expected fixed ${CANVAS.width}x${CANVAS.height} canvas`);
    }
    const registered = registeredFrame(source, 172, false);
    const evidence = collarEvidence(registered.png);
    if (evidence.minimumAlpha !== 255) {
      throw new Error(`${name}: opaque natural-join core is incomplete`);
    }
    if (evidence.pixels < MIN_OPAQUE_COLLAR_PIXELS) {
      throw new Error(
        `${name}: natural join has only ${evidence.pixels} opaque pixels; expected at least ${MIN_OPAQUE_COLLAR_PIXELS}`,
      );
    }
    const outputName = `pose-${String(index).padStart(2, '0')}.png`;
    const outputFile = path.join(CANOPY_ROOT, outputName);
    await writePng(outputFile, registered.png);
    const encodedBytes = (await stat(outputFile)).size;
    frames.push(registered.png);
    reports.push({
      file: `canopy/${outputName}`,
      sourceFile: `sources/canopy-sequence/${name}`,
      sourceDimensions: [source.width, source.height],
      sourceFootprint: registered.sourceFootprint,
      normalizationOffset: registered.normalizationOffset,
      registeredCrownSocket: CROWN_SOCKET,
      registeredFootprint: alphaBox(registered.png),
      legacyCollarPixelsExcluded: registered.legacyCollarPixelsExcluded,
      opaqueCollarPixels: evidence.pixels,
      collarCoreMinimumAlpha: evidence.minimumAlpha,
      encodedBytes,
    });
  }
  await writePng(
    path.join(ASSET_ROOT, 'crown-registration-plate.png'),
    await buildRegistrationPlate(),
  );
  await contactSheet(frames, path.join(ASSET_ROOT, 'canopy-contact-sheet.png'));
  const report = {
    schemaVersion: 2,
    authorTimeOnly: true,
    fixedCanvas: CANVAS,
    frameCount: reports.length,
    crownSocket: CROWN_SOCKET,
    rigCrownSocket: RIG_CROWN_SOCKET,
    netCanopyTransform: {
      x: RIG_CROWN_SOCKET.x - CROWN_SOCKET.x,
      y: RIG_CROWN_SOCKET.y - CROWN_SOCKET.y,
    },
    collarBounds: COLLAR_BOUNDS,
    collarCore: COLLAR_CORE,
    collarKind: 'natural-lower-canopy-skirt-and-wood-bridge',
    minimumOpaqueCollarPixels: MIN_OPAQUE_COLLAR_PIXELS,
    legacyCollarExclusion: {
      yFrom: LEGACY_COLLAR_Y,
      reason: 'Owner LOOK found the interpolated y141..171 ellipse disconnected and blob-like.',
    },
    runtimeRelativeOffsets: RUNTIME_RELATIVE_OFFSETS,
    registrationPlate: 'crown-registration-plate.png',
    runtimeCorrection: false,
    sourceToRegisteredPolicy:
      'Exclude the interpolated legacy ellipse at y141+; retain one connected PixelLab crown; normalize it at author/import time; then author a narrow asymmetric leaf skirt and opaque wood bridge around the real trunk-top join at y105..131.',
    frames: reports,
    encodedCanopyBytes: reports.reduce((sum, frame) => sum + frame.encodedBytes, 0),
    decodedCanopyRgbaBytes: reports.length * CANVAS.width * CANVAS.height * 4,
  };
  await writeFile(
    path.join(ASSET_ROOT, 'canopy-registration-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

const mode = process.argv[2] ?? 'prepare';
if (mode === 'prepare') await prepare();
else if (mode === 'finalize') await finalize();
else throw new Error(`unknown mode ${mode}; expected prepare or finalize`);
