import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  CHAPTER2_ROUND3_LAB_BUDGET,
  CHAPTER2_ROUND3_TREE_CANDIDATES,
  chapter2Round3TreeCandidate,
  type Chapter2HeroTreeCandidate,
} from './chapter2-round3-tree-candidates.js';
import { CHAPTER2_PLANT_SAMPLE_TRACK } from './organic-pose-to-pose-assets.js';
import {
  validateOrganicPoseRegistry,
  type OrganicPoseTrack,
} from './organic-pose-to-pose-track.js';

/**
 * The anchor rule this whole lab is registered under, re-implemented independently of the
 * author-time Python so the registered numbers are checked against the shipped PNG rather than
 * against the script that produced them:
 *
 *   "alpha-weighted x across bottom three occupied rows; bottom-most occupied y", alpha > 8.
 */
const ALPHA_THRESHOLD = 8;

interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colourType: number;
  readonly rgba: Uint8Array;
  readonly alpha: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Minimal decoder for the only PNG shape this registry admits: 8-bit RGBA, non-interlaced. */
function decodePng(bytes: Uint8Array): DecodedPng {
  expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = bytes[24]!;
  const colourType = bytes[25]!;
  const interlace = bytes[28]!;
  expect({ bitDepth, colourType, interlace }).toEqual({
    bitDepth: 8,
    colourType: 6,
    interlace: 0,
  });

  const parts: Uint8Array[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (type === 'IDAT') parts.push(bytes.slice(offset + 8, offset + 8 + length));
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  const raw = new Uint8Array(inflateSync(Buffer.concat(parts.map((p) => Buffer.from(p)))));

  const bpp = 4;
  const stride = width * bpp;
  const out = new Uint8Array(width * height * bpp);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)]!;
    const src = row * (stride + 1) + 1;
    const dst = row * stride;
    const up = dst - stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[src + i]!;
      const a = i >= bpp ? out[dst + i - bpp]! : 0;
      const b = row > 0 ? out[up + i]! : 0;
      const c = row > 0 && i >= bpp ? out[up + i - bpp]! : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + a;
          break;
        case 2:
          value = x + b;
          break;
        case 3:
          value = x + ((a + b) >> 1);
          break;
        case 4:
          value = x + paeth(a, b, c);
          break;
        default:
          throw new Error(`Unsupported PNG filter ${filter} on row ${row}.`);
      }
      out[dst + i] = value & 0xff;
    }
  }

  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) alpha[i] = out[i * bpp + 3]!;
  return { width, height, bitDepth, colourType, rgba: out, alpha };
}

type Rgb = readonly [number, number, number];

function findFoliageBands(value: unknown): readonly Rgb[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const bands = record['foliageBands'];
  if (
    Array.isArray(bands) &&
    bands.every(
      (band) =>
        Array.isArray(band) &&
        band.length === 3 &&
        band.every((channel) => typeof channel === 'number'),
    )
  ) {
    return bands as unknown as readonly Rgb[];
  }
  for (const child of Object.values(record)) {
    const nested = findFoliageBands(child);
    if (nested) return nested;
  }
  return undefined;
}

function codeBlenderFoliageBands(): readonly Rgb[] {
  const manifest = manifestOf(chapter2Round3TreeCandidate('code-blender'));
  const shippedBands = findFoliageBands(manifest);
  if (shippedBands) return shippedBands;

  // The shipped manifest identifies the authoring source; its registration records the exact
  // palette family used by the raster back half. Follow that declaration instead of copying
  // colour literals into this independently implemented pixel proof.
  const researchDir = manifest['researchDir'];
  if (typeof researchDir !== 'string') throw new Error('code-blender lost its palette source');
  const authorRegistration = JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../${researchDir}/frames/registration.json`, import.meta.url)),
      'utf8',
    ),
  ) as Record<string, unknown>;
  const sourceBands = findFoliageBands(authorRegistration);
  if (!sourceBands) throw new Error('code-blender palette source lost its foliage bands');
  return sourceBands;
}

function countFoliagePixels(png: DecodedPng, bands: readonly Rgb[]): number {
  let count = 0;
  for (let i = 0; i < png.width * png.height; i += 1) {
    if (png.rgba[i * 4 + 3]! <= 200) continue;
    const r = png.rgba[i * 4]!;
    const g = png.rgba[i * 4 + 1]!;
    const b = png.rgba[i * 4 + 2]!;
    if (bands.some((band) => r === band[0] && g === band[1] && b === band[2])) count += 1;
  }
  return count < 7 ? 0 : count;
}

/**
 * The one rule, applied to a decoded frame. Returns the EXACT weighted x deliberately: rounding
 * here would import a tie-break convention, and this suite exists to check the registered number
 * against the pixels independently of the Python that produced it.
 */
function measureGroundAnchor(png: DecodedPng): { readonly x: number; readonly y: number } {
  const occupiedRows: number[] = [];
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.alpha[y * png.width + x]! > ALPHA_THRESHOLD) {
        occupiedRows.push(y);
        break;
      }
    }
  }
  expect(occupiedRows.length).toBeGreaterThan(2);
  const band = occupiedRows.slice(-3);
  let weight = 0;
  let weightedX = 0;
  for (const y of band) {
    for (let x = 0; x < png.width; x += 1) {
      const a = png.alpha[y * png.width + x]!;
      if (a > ALPHA_THRESHOLD) {
        weight += a;
        weightedX += a * x;
      }
    }
  }
  expect(weight).toBeGreaterThan(0);
  return { x: weightedX / weight, y: occupiedRows.at(-1)! };
}

function heroTree(candidate: Chapter2HeroTreeCandidate): OrganicPoseTrack {
  const track = candidate.registry.tracks.find(
    (entry) => entry.id === candidate.heroTreeTrackId,
  );
  if (!track) throw new Error(`Candidate ${candidate.id} lost its hero-tree track.`);
  return track;
}

function manifestOf(candidate: Chapter2HeroTreeCandidate): Record<string, unknown> {
  const url =
    candidate.id === 'incumbent'
      ? new URL('./assets/chapter2-organic-pose-to-pose/manifest.json', import.meta.url)
      : new URL(`./assets/${candidate.id}/manifest.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as Record<string, unknown>;
}

const CANDIDATES = CHAPTER2_ROUND3_TREE_CANDIDATES;
const NEW_CANDIDATES = CANDIDATES.filter((candidate) => candidate.id !== 'incumbent');

describe('Chapter 2 round-3 hero-tree candidates', () => {
  it('registers exactly five candidates in comparison order, each a valid two-layer registry', () => {
    expect(CANDIDATES.map((candidate) => candidate.id)).toEqual([
      'incumbent',
      'exp-15',
      'exp-16',
      'exp-18',
      'code-blender',
    ]);
    for (const candidate of CANDIDATES) {
      const registry = validateOrganicPoseRegistry(candidate.registry);
      expect(registry.tracks.map((track) => track.kind)).toEqual([
        'hero-tree',
        'plant-sample',
      ]);
      expect(chapter2Round3TreeCandidate(candidate.id)).toBe(candidate);
      expect(heroTree(candidate).id).toBe(candidate.heroTreeTrackId);
    }
    // Registry ids and hero-tree track ids are unique, so a picker cannot alias two candidates.
    expect(new Set(CANDIDATES.map((c) => c.registry.id)).size).toBe(5);
    expect(new Set(CANDIDATES.map((c) => c.heroTreeTrackId)).size).toBe(5);
  });

  it('pins the SAME plant track object into every candidate, so a tree swap cannot change the plant', () => {
    for (const candidate of CANDIDATES) {
      expect(candidate.registry.tracks[1]).toBe(CHAPTER2_PLANT_SAMPLE_TRACK);
    }
  });

  it('carries the frame count, order and canvas its manifest claims', () => {
    for (const candidate of NEW_CANDIDATES) {
      const track = heroTree(candidate);
      const manifest = manifestOf(candidate);
      const manifestTrack = (manifest['tracks'] as Record<string, unknown>[])[0]!;

      expect(manifest['id']).toBe(candidate.registry.id);
      expect(manifest['candidateId']).toBe(candidate.id);
      expect(manifestTrack['id']).toBe(track.id);
      expect(manifestTrack['frameCount']).toBe(track.frameCount);
      expect(track.frames).toHaveLength(track.frameCount);
      expect(candidate.frameCount).toBe(track.frameCount);
      expect(manifestTrack['registeredRootAnchor']).toEqual(track.groundAnchor);
      expect(candidate.groundAnchor).toEqual(track.groundAnchor);
      expect(candidate.canvas).toEqual(track.canvas);

      // Registered order IS the manifest's declared order, index for index.
      expect(track.frames.map((frame) => frame.modulePath)).toEqual(
        (manifestTrack['frameOrder'] as string[]).map((entry) => `./assets/${candidate.id}/${entry}`),
      );
      expect(track.frames.map((frame) => frame.index)).toEqual(
        track.frames.map((_frame, index) => index),
      );
    }
  });

  it('resolves every referenced asset file, and every file is the declared 8-bit RGBA canvas', () => {
    for (const candidate of NEW_CANDIDATES) {
      const track = heroTree(candidate);
      let encodedBytes = 0;
      for (const frame of track.frames) {
        const path = fileURLToPath(new URL(frame.modulePath, import.meta.url));
        expect(existsSync(path), `${frame.modulePath} is missing`).toBe(true);
        const png = decodePng(new Uint8Array(readFileSync(path)));
        expect({ width: png.width, height: png.height }).toEqual(track.frameDimensions);
        encodedBytes += statSync(path).size;
      }
      expect(encodedBytes).toBe(track.encodedBytes);
      expect(track.decodedRgbaBytes).toBe(
        track.frameDimensions.width * track.frameDimensions.height * 4 * track.frameCount,
      );
    }
  });

  it('registers an anchor that is TRUE of the shipped pixels under the one applied rule', () => {
    for (const candidate of NEW_CANDIDATES) {
      const track = heroTree(candidate);
      let worstResidual = 0;
      for (const frame of track.frames) {
        const path = fileURLToPath(new URL(frame.modulePath, import.meta.url));
        const measured = measureGroundAnchor(decodePng(new Uint8Array(readFileSync(path))));
        const residual = Math.abs(measured.x - track.groundAnchor.x);
        // The bottom-most occupied row is pinned exactly wherever the candidate declares a
        // flat contact band (every hand-authored one does), and inside the declared band
        // otherwise. See `groundRowSpreadPx`: a code-generated track rendered through one fixed
        // camera cannot hold a constant contact row while its trunk thickens, and buying one
        // would mean drifting the base (ADR-0280 D1).
        expect(
          Math.abs(measured.y - track.groundAnchor.y),
          `${candidate.id} ${frame.modulePath} ground row`,
        ).toBeLessThanOrEqual(candidate.anchorRule.groundRowSpreadPx);
        expect(residual, `${candidate.id} ${frame.modulePath} residual`).toBeLessThanOrEqual(0.5);
        worstResidual = Math.max(worstResidual, residual);

        expect(frame.normalizedAnchor).toEqual(track.groundAnchor);
        expect({
          x: frame.sourceAnchor.x + frame.normalizationOffset.x,
          y: frame.sourceAnchor.y + frame.normalizationOffset.y,
        }).toEqual(track.groundAnchor);
      }
      expect(worstResidual).toBeCloseTo(candidate.anchorRule.maxAnchorResidualPx, 4);
    }
  });

  it('ships the owner-picked code-blender staging boundary as bare wood before the leaf flush', () => {
    const track = heroTree(chapter2Round3TreeCandidate('code-blender'));
    const bands = codeBlenderFoliageBands();
    const foliage = track.frames.map((frame) => {
      const path = fileURLToPath(new URL(frame.modulePath, import.meta.url));
      return countFoliagePixels(decodePng(new Uint8Array(readFileSync(path))), bands);
    });

    // Match the author-side classifier's explicit noise floor: fewer than seven pixels is
    // quantisation noise from shaded bark, not a canopy. The proof itself reads shipped RGBA.
    expect(foliage.slice(0, 7)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(foliage.findIndex((count) => count > 0)).toBe(7);
    for (let frame = 8; frame < foliage.length; frame += 1) {
      expect(foliage[frame], `frame ${frame} foliage`).toBeGreaterThanOrEqual(
        foliage[frame - 1]!,
      );
    }
  });

  it('states the anchor as a residual bound because exp-15 lands exactly on the rounding tie', () => {
    // Two exp-15 frames measure 96.5 against a registered 96. Python rounds that half-to-even
    // (96) and JavaScript half-up (97), so an equality claim would have been true only of the
    // language that wrote it. The registration prefers not to move art at a tie, and the number
    // that is true in both languages is the 0.5 px bound.
    const exp15 = heroTree(chapter2Round3TreeCandidate('exp-15'));
    const ties = exp15.frames.filter((frame) => {
      const path = fileURLToPath(new URL(frame.modulePath, import.meta.url));
      const measured = measureGroundAnchor(decodePng(new Uint8Array(readFileSync(path))));
      return Math.abs(Math.abs(measured.x - exp15.groundAnchor.x) - 0.5) < 1e-9;
    });
    expect(ties.map((frame) => frame.index)).toEqual([3, 8]);
    for (const frame of ties) {
      expect(frame.normalizationOffset).toEqual({ x: 0, y: 0 });
    }
    expect(chapter2Round3TreeCandidate('exp-15').anchorRule.maxAnchorResidualPx).toBe(0.5);
  });

  it('reports the anchor-rule divergence honestly, including where the applied rule costs stability', () => {
    for (const candidate of NEW_CANDIDATES) {
      // For the three NEW candidates the registry's normalizationOffset IS the shift this
      // registration applied to the research-delivered frame, so the two must agree exactly.
      const shifted = heroTree(candidate).frames.filter(
        (frame) => frame.normalizationOffset.x !== 0 || frame.normalizationOffset.y !== 0,
      );
      expect(candidate.anchorRule.framesShifted).toBe(shifted.length);
      expect(candidate.anchorRule.maxAbsShiftPx).toBe(
        shifted.reduce(
          (worst, frame) =>
            Math.max(
              worst,
              Math.abs(frame.normalizationOffset.x),
              Math.abs(frame.normalizationOffset.y),
            ),
          0,
        ),
      );
    }

    // The incumbent is REUSED unchanged, so nothing was re-normalised for it here. Its registry
    // offsets are round-1's own, measured against the pre-normalisation model returns rather than
    // against a delivered frame — a different quantity, which is why the identity above is scoped
    // to the new candidates.
    const incumbent = chapter2Round3TreeCandidate('incumbent');
    expect(incumbent.anchorRule.framesShifted).toBe(0);
    expect(
      heroTree(incumbent).frames.some(
        (frame) => frame.normalizationOffset.x !== 0 || frame.normalizationOffset.y !== 0,
      ),
    ).toBe(true);

    for (const candidate of CANDIDATES) {
      // A candidate needing no shift is one whose own rule already AGREED with round-1's.
      const agrees = candidate.anchorRule.framesShifted === 0;
      expect(agrees).toBe(candidate.anchorRule.contactAnchorSpreadPx < 1);
      if (!agrees) {
        // The divergence is recorded on both axes, never as a single flattering number.
        expect(candidate.anchorRule.contactAnchorSpreadPx).toBeGreaterThan(
          candidate.anchorRule.experimentDeclaredDriftPx,
        );
        // And the price is recorded too: re-pinning to the contact widened the body walk.
        expect(candidate.anchorRule.bodyCentroidSpreadAfterPx).toBeGreaterThan(
          candidate.anchorRule.bodyCentroidSpreadBeforePx,
        );
        expect(candidate.anchorRule.bodyCentroidMaxStepAfterPx).toBeGreaterThan(
          candidate.anchorRule.bodyCentroidMaxStepBeforePx,
        );
      }
      expect(candidate.anchorRule.maxAnchorResidualPx).toBeLessThanOrEqual(0.5);
    }

    // exp-15 is the only new candidate whose delivered frames already satisfied round-1's rule.
    expect(
      CANDIDATES.filter((candidate) => candidate.anchorRule.framesShifted === 0).map((c) => c.id),
    ).toEqual(['incumbent', 'exp-15']);

    // Only the code-generated track carries a contact BAND rather than a pinned row.
    expect(
      CANDIDATES.filter((c) => c.anchorRule.groundRowSpreadPx > 0).map((c) => c.id),
    ).toEqual(['code-blender']);
  });

  it('restates the byte budget per candidate against the measured cost, never silently blown', () => {
    const prior = CHAPTER2_ROUND3_LAB_BUDGET.priorCeilings;
    for (const candidate of CANDIDATES) {
      const encoded = candidate.registry.tracks.reduce((sum, t) => sum + t.encodedBytes, 0);
      const decoded = candidate.registry.tracks.reduce((sum, t) => sum + t.decodedRgbaBytes, 0);
      const frames = candidate.registry.tracks.reduce((sum, t) => sum + t.frameCount, 0);

      expect(candidate.budget.encodedBytes).toBe(encoded);
      expect(candidate.budget.decodedRgbaBytes).toBe(decoded);
      expect(candidate.budget.frameCount).toBe(frames);
      expect(candidate.budget.layerCount).toBe(candidate.registry.tracks.length);

      if (candidate.id === 'incumbent') {
        // Reused unchanged, so it still carries round-1's own envelope rather than a restated
        // ceiling. It must still fit inside it.
        expect(candidate.registry.budget).toEqual({
          maxEncodedBytes: prior.encodedBytes,
          maxDecodedRgbaBytes: prior.decodedRgbaBytes,
          maxFrameCount: prior.frameCount,
          maxLayerCount: prior.layerCount,
        });
        expect(encoded).toBeLessThanOrEqual(prior.encodedBytes);
        expect(decoded).toBeLessThanOrEqual(prior.decodedRgbaBytes);
        expect(frames).toBeLessThanOrEqual(prior.frameCount);
      } else {
        // The restated ceiling is the measured actual: zero headroom, so growth fails validation.
        expect(candidate.registry.budget.maxEncodedBytes).toBe(encoded);
        expect(candidate.registry.budget.maxDecodedRgbaBytes).toBe(decoded);
        expect(candidate.registry.budget.maxFrameCount).toBe(frames);
        expect(candidate.registry.budget.maxLayerCount).toBe(2);
      }

      // `exceedsPriorCeiling` names exactly the round-1 axes this candidate breaks.
      const expected: string[] = [];
      if (encoded > prior.encodedBytes) expected.push('encodedBytes');
      if (decoded > prior.decodedRgbaBytes) expected.push('decodedRgbaBytes');
      if (frames > prior.frameCount) expected.push('frameCount');
      expect([...candidate.budget.exceedsPriorCeiling]).toEqual(expected);
    }

    // Measured on 2026-08-01: exp-18 and the incumbent fit the round-1 envelope whole; the two
    // dense tracks do not, and that is stated rather than absorbed.
    expect(
      Object.fromEntries(CANDIDATES.map((c) => [c.id, [...c.budget.exceedsPriorCeiling]])),
    ).toEqual({
      incumbent: [],
      'exp-15': ['decodedRgbaBytes', 'frameCount'],
      'exp-16': ['frameCount'],
      'exp-18': [],
      'code-blender': ['frameCount'],
    });
  });

  it('restates the lab budget as one mounted candidate, with the shipped total stated separately', () => {
    const lab = CHAPTER2_ROUND3_LAB_BUDGET;
    expect(lab.mountedHeroTreeTracksAtOnce).toBe(1);
    expect(lab.mountedOrganicLayersAtOnce).toBe(2);

    // The mounted worst case is a MAX over candidates, because only one tree is ever mounted.
    expect(lab.mountedWorstCase.encodedBytes).toBe(
      Math.max(...CANDIDATES.map((c) => c.budget.encodedBytes)),
    );
    expect(lab.mountedWorstCase.decodedRgbaBytes).toBe(
      Math.max(...CANDIDATES.map((c) => c.budget.decodedRgbaBytes)),
    );
    expect(lab.mountedWorstCase.frameCount).toBe(
      Math.max(...CANDIDATES.map((c) => c.budget.frameCount)),
    );
    expect(
      chapter2Round3TreeCandidate(lab.mountedWorstCase.decodedRgbaBytesCandidate).budget
        .decodedRgbaBytes,
    ).toBe(lab.mountedWorstCase.decodedRgbaBytes);

    // The shipped total is a SUM over the four hero-tree tracks plus the one shared plant track.
    const heroEncoded = CANDIDATES.reduce((sum, c) => sum + heroTree(c).encodedBytes, 0);
    const heroDecoded = CANDIDATES.reduce((sum, c) => sum + heroTree(c).decodedRgbaBytes, 0);
    const heroFrames = CANDIDATES.reduce((sum, c) => sum + heroTree(c).frameCount, 0);
    expect(lab.shippedTotal.encodedBytes).toBe(
      heroEncoded + CHAPTER2_PLANT_SAMPLE_TRACK.encodedBytes,
    );
    expect(lab.shippedTotal.decodedRgbaBytesIfEveryTrackDecoded).toBe(
      heroDecoded + CHAPTER2_PLANT_SAMPLE_TRACK.decodedRgbaBytes,
    );
    expect(lab.shippedTotal.frameCount).toBe(
      heroFrames + CHAPTER2_PLANT_SAMPLE_TRACK.frameCount,
    );
    expect(lab.shippedTotal.heroTreeTracks).toBe(CANDIDATES.length);

    // The shipped total genuinely breaks the round-1 envelope; saying so is the point.
    expect(lab.shippedTotal.encodedBytes).toBeGreaterThan(lab.priorCeilings.encodedBytes);
    expect([...lab.shippedTotal.exceedsPriorCeiling]).toEqual([
      'encodedBytes',
      'decodedRgbaBytes',
      'frameCount',
    ]);
  });

  it('keeps every candidate progress mapping continuous, ordered and settled at 1', () => {
    for (const candidate of CANDIDATES) {
      const track = heroTree(candidate);
      expect(track.poses).toHaveLength(track.frameCount);
      track.poses.forEach((pose, index) => {
        expect(pose.frameIndex).toBe(index);
        expect(pose.threshold).toBeLessThan(pose.holdUntil);
        expect(pose.threshold).toBe(index === 0 ? 0 : track.poses[index - 1]!.holdUntil);
      });
      expect(track.poses.at(-1)!.holdUntil).toBe(1);
    }
  });

  it('carries no runtime vendor seam and no authoring artifact in the registry module', () => {
    const source = readFileSync(
      fileURLToPath(new URL('chapter2-round3-tree-candidates.ts', import.meta.url)),
      'utf8',
    );
    // Every frame is a statically analysable local module URL, one per registered frame.
    expect(
      source.match(
        /new URL\('\.\/assets\/(?:exp-1[568]|code-blender)\/tree\/frame-\d\d\.png',\s*import\.meta\.url\)/g,
      ),
    ).toHaveLength(NEW_CANDIDATES.reduce((sum, c) => sum + c.frameCount, 0));
    expect(source).not.toMatch(
      /https?:\/\/(?:[^/]*\.)?pixellab\.ai|XMLHttpRequest|WebSocket|fetch\s*\(/i,
    );
    expect(source).not.toMatch(
      /(?:api[-_]?key|secret|credential|bearer[-_]?token)\s*[:=]\s*['"][^'"]+/i,
    );
    for (const candidate of NEW_CANDIDATES) {
      for (const frame of heroTree(candidate).frames) {
        expect(frame.modulePath).not.toMatch(/contact-sheet|preview|raw|work|reject/i);
        expect(frame.src).not.toMatch(/pixellab\.ai/i);
      }
    }
  });
});
