// asset-payload.test.ts — every verdict, fired both ways.
//
// WHAT THIS SUITE IS FOR. `asset-payload.ts` answers ADR-0418's one unnumbered cost, and an
// answer nobody can falsify is not a measurement. So each of the three verdicts is exercised
// with a case that PASSES it and a case that REFUSES it, and — this is the part that matters —
// the two cases are both REAL, drawn from the same session's exports rather than invented to
// make a branch execute. A rule that returns the same verdict for every input this project
// actually has is telling you nothing, and inventing an input to prove otherwise hides that.
//
// ⚠ THE MUTATION RUNG DOES NOT COVER THIS FILE. `pnpm gate`'s `check:mutation-diff` skips
// `harness/**` (it sits outside any workspace project's `src/`), so it reports NOTHING TO
// MUTATE. Hand-run mutation evidence for this module is in
// `docs/research/chapter2-textured-asset-2026-08-28/README.md`.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { deliveredTreeExtentPx } from './pine-asset.js';
import {
  BASIS_TRANSCODER_GZIP_BYTES,
  COMPRESSED_ARMS,
  DRACO_DECODER_GZIP_BYTES,
  MEASURED_ARMS,
  MESHOPT_DECODER_GZIP_BYTES,
  MIPMAP_TAIL_FACTOR,
  SOURCE_TEXTURE_BYTES_2048,
  TEXTURE_RUNGS,
  armByKey,
  decodeExpansion,
  decodedTextureBytes,
  meshCompressionVerdict,
  rungOvershootBytes,
  textureRungVerdict,
  verdictForCompressedArm,
} from './asset-payload.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const THREE_LIBS = join(HERE, '..', 'node_modules', 'three', 'examples', 'jsm', 'libs');

// ============================================================================
// The table itself
// ============================================================================

test('every measured arm is internally consistent and keyed uniquely', () => {
  const keys = new Set(MEASURED_ARMS.map((a) => a.key));
  assert.equal(keys.size, MEASURED_ARMS.length, 'two arms share a key');
  for (const arm of MEASURED_ARMS) {
    assert.ok(arm.wireBytes > 0, `${arm.key} has no bytes`);
    assert.ok(arm.brotliBytes > 0, `${arm.key} has no brotli bytes`);
    assert.ok(TEXTURE_RUNGS.includes(arm.textureEdgePx), `${arm.key} is off the authored ladder`);
    // Brotli may be a hair LARGER than the input when the input is already-compressed image
    // data (pine-png-1024 is, by 16 bytes) — but never by a meaningful margin.
    assert.ok(
      arm.brotliBytes < arm.wireBytes * 1.01,
      `${arm.key} brotli ${arm.brotliBytes} is not plausible against ${arm.wireBytes}`,
    );
  }
});

test('the PNG rungs are the ones an unconsidered export delivers, and they are an order of magnitude worse', () => {
  // This is the finding that makes the codec choice a decision rather than a preference: the
  // SAME pixels, the SAME resolution, PNG against WebP q90.
  for (const edge of [2048, 1024, 512, 256]) {
    const png = armByKey(`pine-png-${edge}`);
    const webp = armByKey(`pine-webp90-${edge}`);
    assert.ok(
      png.brotliBytes > webp.brotliBytes * 5,
      `at ${edge}² PNG (${png.brotliBytes}) is not the disaster it should be against WebP (${webp.brotliBytes})`,
    );
  }
});

test('the committed asset is 226x smaller than the source maps it came from', () => {
  const shipped = armByKey('pine-webp90-512');
  const kit = armByKey('kit-webp90-512');
  // The whole 42-object kit, every map, one file: against the 2048² TGA set the blend packs.
  const ratio = SOURCE_TEXTURE_BYTES_2048 / kit.brotliBytes;
  assert.ok(ratio > 200, `the kit only shrank ${ratio.toFixed(0)}x`);
  // And one tree is a rounding error next to a single 2048² TGA.
  assert.ok(shipped.brotliBytes < 12_582_956 / 50, 'one dressed pine should be under a fiftieth of one source map');
});

// ============================================================================
// Mesh compression — the verdict that must go BOTH ways or it is vacuous
// ============================================================================

test('Draco is a NET LOSS on one pine and a WIN on the whole kit — the same rule, opposite answers', () => {
  const onePine = verdictForCompressedArm(
    COMPRESSED_ARMS.find((a) => a.key === 'pine-webp90-512-draco')!,
  );
  const wholeKit = verdictForCompressedArm(
    COMPRESSED_ARMS.find((a) => a.key === 'kit-webp90-512-draco')!,
  );
  assert.equal(onePine.outcome, 'NET_LOSS');
  assert.equal(wholeKit.outcome, 'WORTH_IT');
  // The non-vacuity claim, stated: if this rule could only ever say one thing, both of the
  // project's real cases would land on the same side of it. They do not.
  assert.notEqual(onePine.outcome, wholeKit.outcome);
  assert.ok(onePine.netBytes < -80_000, `one pine should be far behind, got ${onePine.netBytes}`);
  assert.ok(wholeKit.netBytes > 300_000, `the kit should be far ahead, got ${wholeKit.netBytes}`);
  assert.match(onePine.prose, /BEHIND/);
});

test('meshopt beats Draco on NET bytes at kit scale, despite compressing less', () => {
  const draco = verdictForCompressedArm(COMPRESSED_ARMS.find((a) => a.key === 'kit-webp90-512-draco')!);
  const meshopt = verdictForCompressedArm(COMPRESSED_ARMS.find((a) => a.key === 'kit-webp90-512-meshopt')!);
  // Draco compresses harder...
  assert.ok(draco.savedBytes > meshopt.savedBytes, 'Draco should win on raw compression');
  // ...and still loses, because its decoder is 12.9x the size of meshopt's.
  assert.ok(meshopt.netBytes > draco.netBytes, 'meshopt should win on net delivered bytes');
});

test('the verdict flips exactly at the decoder size, and refuses a break-even as a loss', () => {
  const exact = meshCompressionVerdict({
    label: 'break-even',
    baselineBrotliBytes: 200_000,
    compressedBrotliBytes: 100_000,
    decoderBytes: 100_000,
  });
  assert.equal(exact.outcome, 'NET_LOSS', 'break-even buys nothing and must not read as a win');
  const oneByteBetter = meshCompressionVerdict({
    label: 'one byte better',
    baselineBrotliBytes: 200_001,
    compressedBrotliBytes: 100_000,
    decoderBytes: 100_000,
  });
  assert.equal(oneByteBetter.outcome, 'WORTH_IT');
});

test('the decoder figures are re-read from three, so an upgrade reds this instead of drifting', () => {
  const gz = (p: string): number => gzipSync(readFileSync(p), { level: 9 }).byteLength;
  const draco = join(THREE_LIBS, 'draco');
  if (!existsSync(draco)) {
    // A checkout without node_modules cannot answer this. Say so rather than pass silently.
    assert.fail(`three's decoder libs are not installed at ${THREE_LIBS} — run pnpm install`);
  }
  const dracoBytes = gz(join(draco, 'draco_decoder.wasm')) + gz(join(draco, 'draco_wasm_wrapper.js'));
  const meshoptBytes = gz(join(THREE_LIBS, 'meshopt_decoder.module.js'));
  const basisBytes =
    gz(join(THREE_LIBS, 'basis', 'basis_transcoder.wasm')) +
    gz(join(THREE_LIBS, 'basis', 'basis_transcoder.js'));
  // Within 2% — gzip is deterministic for a given zlib, but the zlib is the platform's.
  const near = (actual: number, recorded: number): boolean => Math.abs(actual - recorded) / recorded < 0.02;
  assert.ok(near(dracoBytes, DRACO_DECODER_GZIP_BYTES), `draco decoder is now ${dracoBytes}, recorded ${DRACO_DECODER_GZIP_BYTES}`);
  assert.ok(near(meshoptBytes, MESHOPT_DECODER_GZIP_BYTES), `meshopt decoder is now ${meshoptBytes}, recorded ${MESHOPT_DECODER_GZIP_BYTES}`);
  assert.ok(near(basisBytes, BASIS_TRANSCODER_GZIP_BYTES), `basis transcoder is now ${basisBytes}, recorded ${BASIS_TRANSCODER_GZIP_BYTES}`);
});

// ============================================================================
// GPU memory — the half of ADR-0380 D4 the wire figure does not answer
// ============================================================================

test('decoded VRAM is arithmetic, and it dwarfs the wire figure', () => {
  const shipped = armByKey('pine-webp90-512');
  // 6 images x 512 x 512 x 4 bytes x 4/3 for the mip tail.
  assert.equal(decodedTextureBytes(shipped), Math.round(6 * 512 * 512 * 4 * MIPMAP_TAIL_FACTOR));
  assert.equal(decodedTextureBytes(shipped, false), 6 * 512 * 512 * 4);
  // The gap is the whole of ADR-0380 D4's carve-out: a WebP is a very good wire format and
  // no compression at all in video memory.
  assert.ok(decodeExpansion(shipped) > 40, `expansion is only ${decodeExpansion(shipped).toFixed(1)}x`);
});

test('the whole kit still fits in tens of megabytes of VRAM, which is why KTX2 is not yet needed', () => {
  const kit = armByKey('kit-webp90-512');
  const vram = decodedTextureBytes(kit);
  assert.ok(vram < 64 * 1024 * 1024, `the kit needs ${(vram / 1048576).toFixed(1)} MiB of VRAM`);
  // And the transcoder that would shrink it costs more on the wire than the kit's own textures.
  assert.ok(
    BASIS_TRANSCODER_GZIP_BYTES > 200_000,
    'the KTX2 case rests on the transcoder being expensive; if it got cheap, re-open it',
  );
});

// ============================================================================
// Texture resolution — read off the frame, not off taste
// ============================================================================

test('the rung verdict refuses the naive 2048 export and accepts the committed 512 one', () => {
  // The delivered extents are the pine as this session actually draws it, DERIVED from the
  // scene rather than typed in: a 30-unit tree, foreshortened by cos(50 degrees), at 2 and 8
  // device pixels per ground unit. 38.6 px and 154.3 px.
  const overview = deliveredTreeExtentPx(2);
  const zoomed = deliveredTreeExtentPx(8);
  const naive = armByKey('pine-webp90-2048');
  const shipped = armByKey('pine-webp90-512');

  assert.equal(textureRungVerdict(naive, zoomed).outcome, 'WASTEFUL');
  assert.equal(textureRungVerdict(naive, overview).outcome, 'WASTEFUL');
  assert.equal(textureRungVerdict(shipped, zoomed).outcome, 'HEADROOM');
  assert.equal(textureRungVerdict(shipped, overview).outcome, 'WASTEFUL');

  // ⚠ And that last line is the honest reading, not a bug: at the OVERVIEW zoom the committed
  // asset is two rungs high. It is committed anyway because the arc's zoomed view is the one
  // the detail exists for, and a single asset cannot sit at two rungs at once. What would
  // remove the compromise is a mip-level or LOD split, which is a later increment's job.
});

test('a rung below what the frame delivers is SUFFICIENT rather than refused — the check bounds waste, not blur', () => {
  const small = armByKey('pine-webp90-128');
  assert.equal(textureRungVerdict(small, 240).outcome, 'SUFFICIENT');
  assert.equal(textureRungVerdict(small, 240).sufficientEdgePx, 256);
  assert.equal(textureRungVerdict(small, 240).rungsAbove, -1);
});

test('oversampling is texels per delivered pixel, and the overshoot is stated in bytes', () => {
  const naive = armByKey('pine-webp90-2048');
  assert.equal(textureRungVerdict(naive, 256).oversampling, 8);
  assert.equal(
    rungOvershootBytes(naive, armByKey('pine-webp90-256')),
    1_208_698 - 76_210,
  );
  assert.throws(
    () => rungOvershootBytes(naive, armByKey('kit-webp90-512')),
    /one subject in one codec/,
  );
});

test('the rung verdict refuses inputs it cannot answer rather than inventing an answer', () => {
  assert.throws(() => textureRungVerdict(armByKey('pine-webp90-512'), 0), /positive/);
  assert.throws(() => textureRungVerdict(armByKey('pine-webp90-512'), -4), /positive/);
  assert.throws(() => armByKey('pine-webp90-777'), /no measured arm/);
});
