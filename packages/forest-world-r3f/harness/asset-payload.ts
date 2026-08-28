// asset-payload.ts — WHAT A TEXTURED ASSET COSTS A VISITOR, in bytes.
//
// ============================================================================
// THE QUESTION, AND WHOSE IT IS
// ============================================================================
//
// ADR-0418 adopted textured 3D assets as the chapter-2 art direction and named, in its own
// Consequences, the one cost it took on WITHOUT A NUMBER:
//
//     "TEXTURES MOVE THE ART BACK INSIDE ADR-0380 D4's CONSTRAINT, WHICH GEOMETRY HAD
//      ESCAPED. ... The kit's source textures are 546 MB of TGA (39 maps at 2048²); what a
//      web-delivered, compressed, atlased subset costs is not known. This must be measured
//      before adoption."
//
// This module is that number, and the arithmetic that turns it into a decision. It is PURE —
// no three, no React, no browser, no filesystem — so it is `node:test`-provable and lives on
// the pure side of `scope-fence.test.ts`.
//
// ⚠ EVERY FIGURE IN `MEASURED_ARMS` IS EVIDENCE, NOT A BASELINE. Each was produced by an
// actual Blender export of an actual object out of the actual kit on 2026-08-28, and each is
// reproducible from the committed scripts in
// `docs/research/chapter2-textured-asset-2026-08-28/`. If a later pass changes the export and
// a test here goes red, the correct move is to establish what moved, say so in the landing,
// and THEN re-record — never to reflexively overwrite the number. That is the trap
// `port-provenance-must-be-pinned-to-its-own-data` records: a recorded figure updated to
// whatever the code now emits stops being provenance and becomes a self-comparison.
//
// ============================================================================
// WHY THE THREE VERDICTS BELOW ARE SHAPED THE WAY THEY ARE
// ============================================================================
//
// None of them carries a committed pixel threshold, because this arc has already measured why
// one cannot survive: a figure picked to make the answer come out is the failure
// `hardware-floor.mjs`'s own history records, and a delivered-pixel number is one machine's
// number. So each verdict is read off something ELSE IN THE SAME COMPARISON:
//
//   - `meshCompressionVerdict` reads the saving against THE DECODER'S OWN delivered bytes.
//     A compressor you must ship a decoder for is only worth its place when it saves more
//     than the decoder costs. That is a comparison between two measured quantities, not a
//     threshold; and it is NON-VACUOUS because the two cases this arc actually has fall on
//     opposite sides of it (see `asset-payload.test.ts`).
//
//   - `sufficientTextureRung` reads the rung off THE DELIVERED EXTENT of the object in the
//     frame — the smallest authored rung that still has at least one texel per delivered
//     pixel. Nothing is picked: the authored ladder is the kit's own (2048 down to 128 by
//     halving), and the delivered extent comes from the scene.
//
//   - `decodedTextureBytes` is arithmetic, not a judgment: width × height × 4 × the mip tail.
//     It exists because ADR-0380 D4's correction note carves out exactly this case —
//     "where a byte budget is uncompressed (a GPU texture, an atlas held in VRAM) the square
//     law still applies" — so the wire figure alone does not answer D4 and both must be
//     reported.

/** How the images inside a glTF are encoded. `png` is Blender's `AUTO`, which is lossless. */
export type ImageCodec = 'png' | 'webp';

/**
 * ONE MEASURED EXPORT. Bytes are of the self-contained `.glb`, which is what a visitor
 * downloads: geometry, JSON and every image in one file, one request.
 *
 * `brotliBytes` is the figure that matters for the wire — every static host this project
 * would use serves brotli — and it is here rather than derived because brotli barely moves an
 * already-compressed image and moves geometry a great deal, so the ratio is not guessable.
 */
export interface MeasuredArm {
  /** Stable key, `<subject>-<codec><quality>-<edge>`. */
  readonly key: string;
  /** What was exported: one pine, the twelve tree objects, the whole 42-object kit. */
  readonly subject: 'pine' | 'trees' | 'kit';
  readonly codec: ImageCodec;
  /** WebP quality 0–100; `null` for lossless PNG. */
  readonly quality: number | null;
  /** The longest edge every image was scaled to before export. */
  readonly textureEdgePx: number;
  /** Distinct images inside the `.glb`. */
  readonly images: number;
  /** Triangles across every primitive. */
  readonly triangles: number;
  /** Size of the `.glb` on disk. */
  readonly wireBytes: number;
  /** Size of the `.glb` after brotli -q 11 — what a real host sends. */
  readonly brotliBytes: number;
}

/**
 * THE MEASURED LADDER — Blender 5.2.1, 2026-08-28, from `Pine_Forest_Kit.blend`.
 *
 * `pine` is `Pine_Trunk_01` + `Pine_Leaves_01`: one whole tree, 780 triangles, six images
 * (base colour / normal / metallic-roughness per material). `kit` is all 42 objects and all
 * nine materials in one file.
 *
 * ⚠ The PNG rungs are here to be REJECTED, not chosen. They are Blender's default
 * (`export_image_format='AUTO'`) and they are what an unconsidered export delivers, which is
 * the number this table exists to make impossible to quote by accident.
 */
export const MEASURED_ARMS: readonly MeasuredArm[] = [
  { key: 'pine-png-2048', subject: 'pine', codec: 'png', quality: null, textureEdgePx: 2048, images: 6, triangles: 780, wireBytes: 17_181_584, brotliBytes: 17_154_827 },
  { key: 'pine-webp90-2048', subject: 'pine', codec: 'webp', quality: 90, textureEdgePx: 2048, images: 6, triangles: 780, wireBytes: 1_226_848, brotliBytes: 1_208_698 },
  { key: 'pine-webp75-2048', subject: 'pine', codec: 'webp', quality: 75, textureEdgePx: 2048, images: 6, triangles: 780, wireBytes: 645_004, brotliBytes: 628_993 },
  { key: 'pine-png-1024', subject: 'pine', codec: 'png', quality: null, textureEdgePx: 1024, images: 6, triangles: 780, wireBytes: 4_638_108, brotliBytes: 4_638_124 },
  { key: 'pine-webp90-1024', subject: 'pine', codec: 'webp', quality: 90, textureEdgePx: 1024, images: 6, triangles: 780, wireBytes: 444_120, brotliBytes: 432_387 },
  { key: 'pine-webp75-1024', subject: 'pine', codec: 'webp', quality: 75, textureEdgePx: 1024, images: 6, triangles: 780, wireBytes: 254_432, brotliBytes: 242_930 },
  { key: 'pine-png-512', subject: 'pine', codec: 'png', quality: null, textureEdgePx: 512, images: 6, triangles: 780, wireBytes: 1_391_968, brotliBytes: 1_379_341 },
  { key: 'pine-webp90-512', subject: 'pine', codec: 'webp', quality: 90, textureEdgePx: 512, images: 6, triangles: 780, wireBytes: 185_304, brotliBytes: 174_052 },
  { key: 'pine-webp75-512', subject: 'pine', codec: 'webp', quality: 75, textureEdgePx: 512, images: 6, triangles: 780, wireBytes: 116_956, brotliBytes: 105_640 },
  { key: 'pine-png-256', subject: 'pine', codec: 'png', quality: null, textureEdgePx: 256, images: 6, triangles: 780, wireBytes: 439_440, brotliBytes: 427_556 },
  { key: 'pine-webp90-256', subject: 'pine', codec: 'webp', quality: 90, textureEdgePx: 256, images: 6, triangles: 780, wireBytes: 87_456, brotliBytes: 76_210 },
  { key: 'pine-webp75-256', subject: 'pine', codec: 'webp', quality: 75, textureEdgePx: 256, images: 6, triangles: 780, wireBytes: 62_820, brotliBytes: 51_586 },
  { key: 'pine-png-128', subject: 'pine', codec: 'png', quality: null, textureEdgePx: 128, images: 6, triangles: 780, wireBytes: 150_532, brotliBytes: 138_604 },
  { key: 'pine-webp90-128', subject: 'pine', codec: 'webp', quality: 90, textureEdgePx: 128, images: 6, triangles: 780, wireBytes: 50_044, brotliBytes: 38_838 },
  { key: 'pine-webp75-128', subject: 'pine', codec: 'webp', quality: 75, textureEdgePx: 128, images: 6, triangles: 780, wireBytes: 41_340, brotliBytes: 30_049 },
  { key: 'trees-webp90-256', subject: 'trees', codec: 'webp', quality: 90, textureEdgePx: 256, images: 10, triangles: 8_172, wireBytes: 356_756, brotliBytes: 231_032 },
  { key: 'kit-webp90-512', subject: 'kit', codec: 'webp', quality: 90, textureEdgePx: 512, images: 25, triangles: 33_691, wireBytes: 1_667_324, brotliBytes: 1_234_506 },
  { key: 'kit-webp90-256', subject: 'kit', codec: 'webp', quality: 90, textureEdgePx: 256, images: 25, triangles: 33_691, wireBytes: 1_274_744, brotliBytes: 854_286 },
];

/**
 * THE SOURCE, for the ratio that is the headline. 2048² is the resolution the `.blend` itself
 * packs, and the one ADR-0418's "39 maps at 2048²" names.
 *
 * ⚠ ADR-0418's "546 MB of TGA (39 maps at 2048²)" conflates two different figures, and this
 * constant is the one it MEANT. 546 MiB is the size of `Textures_Pine_Forest_Kit.zip`, which
 * holds 196 files across THREE resolutions (1024, 2048, 4096) and unpacks to 2.97 GB. The
 * 2048² set the blend actually packs — 39 maps, the "Render Result" placeholder excluded — is
 * 377,501,364 bytes.
 */
export const SOURCE_TEXTURE_BYTES_2048 = 377_501_364;

/** Every file in `Textures_Pine_Forest_Kit.zip`, unpacked: 196 files, three resolutions. */
export const SOURCE_TEXTURE_BYTES_ALL_RESOLUTIONS = 2_972_764_128;

/** The zip as shipped — the figure ADR-0418 quotes as "546 MB of TGA". */
export const SOURCE_TEXTURE_ZIP_BYTES = 572_371_903;

/** Look one arm up by key. Throws rather than returning undefined: a missing arm is a typo in
 *  a caller, and a silently-undefined row would be reported as a zero-byte payload. */
export function armByKey(key: string): MeasuredArm {
  const found = MEASURED_ARMS.find((a) => a.key === key);
  if (!found) throw new Error(`asset-payload: no measured arm "${key}"`);
  return found;
}

// ============================================================================
// GPU MEMORY — the half of ADR-0380 D4 the wire figure does not answer
// ============================================================================

/**
 * The mip tail. A full mip chain adds 1/4 + 1/16 + ... of the base level, converging on 1/3,
 * so a mipmapped texture occupies 4/3 of its base level. three.js mipmaps by default for a
 * `LinearMipmapLinearFilter` minification, which is what `GLTFLoader` gives a glTF sampler
 * that does not say otherwise.
 */
export const MIPMAP_TAIL_FACTOR = 4 / 3;

/** Uncompressed RGBA8 — what a browser hands the GPU for a decoded PNG, WebP or JPEG. There is
 *  no path by which a WebP stays compressed in VRAM; only a GPU-compressed format (KTX2/Basis,
 *  ASTC, BCn) does that, which is the whole of the case for KTX2 and the whole of its cost. */
export const RGBA8_BYTES_PER_TEXEL = 4;

/** What one arm's images occupy in video memory once decoded and mipmapped. */
export function decodedTextureBytes(arm: MeasuredArm, mipmapped = true): number {
  const base = arm.images * arm.textureEdgePx * arm.textureEdgePx * RGBA8_BYTES_PER_TEXEL;
  return Math.round(mipmapped ? base * MIPMAP_TAIL_FACTOR : base);
}

/**
 * THE RATIO THAT IS THE ANSWER TO D4. A visitor downloads `brotliBytes`; their GPU holds
 * `decodedTextureBytes`. The gap between the two is exactly what D4's correction note warns
 * about, and it is large — a WebP is a very good wire format and no compression at all in
 * VRAM.
 */
export function decodeExpansion(arm: MeasuredArm): number {
  return decodedTextureBytes(arm) / arm.brotliBytes;
}

// ============================================================================
// MESH COMPRESSION — the verdict that made this session reject Draco and meshopt
// ============================================================================

/**
 * A MESH COMPRESSOR IS A DEPENDENCY WITH A DELIVERED SIZE, and that is the whole of the
 * argument. Draco and meshopt both shrink a glTF's geometry, and both require the browser to
 * download a decoder before it can read one. The decoder is paid ONCE per site; the saving is
 * paid once per asset file. So the question is not "does it compress?" — it always does — but
 * whether the saving on the assets you actually ship exceeds the decoder you ship to read them.
 *
 * ⚠ THIS IS NOT A THRESHOLD, AND IT IS NOT VACUOUS. The two cases this session measured land
 * on OPPOSITE SIDES of it: one pine's whole geometry is smaller than any decoder, so Draco is
 * a net loss; the 42-object kit's geometry is four times the decoder, so it is a net win. A
 * rule that returned the same answer for both would be telling you nothing.
 */
export interface MeshCompressionVerdict {
  readonly outcome: 'WORTH_IT' | 'NET_LOSS';
  /** Wire bytes saved on the asset, after brotli, by the compressor. */
  readonly savedBytes: number;
  /** Wire bytes the decoder itself adds to the site, once. */
  readonly decoderBytes: number;
  /** `savedBytes - decoderBytes`. Negative means the site got bigger. */
  readonly netBytes: number;
  readonly prose: string;
}

export interface MeshCompressionInput {
  readonly label: string;
  readonly baselineBrotliBytes: number;
  readonly compressedBrotliBytes: number;
  readonly decoderBytes: number;
}

export function meshCompressionVerdict(input: MeshCompressionInput): MeshCompressionVerdict {
  const savedBytes = input.baselineBrotliBytes - input.compressedBrotliBytes;
  const netBytes = savedBytes - input.decoderBytes;
  const outcome = netBytes > 0 ? 'WORTH_IT' : 'NET_LOSS';
  const prose =
    outcome === 'WORTH_IT'
      ? `${input.label}: saves ${savedBytes} B against a ${input.decoderBytes} B decoder — ${netBytes} B ahead.`
      : `${input.label}: saves ${savedBytes} B against a ${input.decoderBytes} B decoder — ${-netBytes} B BEHIND, so shipping the decoder costs more than the compression returns.`;
  return { outcome, savedBytes, decoderBytes: input.decoderBytes, netBytes, prose };
}

/**
 * THE DECODERS, as three.js 0.185.1 actually ships them in `three/examples/jsm/libs/`,
 * gzipped as a host would send them. Measured 2026-08-28 off this checkout's `node_modules`,
 * not quoted from anywhere:
 *
 *  - Draco: `draco/draco_decoder.wasm` (88,507) + `draco/draco_wasm_wrapper.js` (11,823).
 *  - meshopt: `meshopt_decoder.module.js` (7,804).
 *  - Basis/KTX2: `basis/basis_transcoder.wasm` (247,535) + `basis/basis_transcoder.js` (15,143).
 *
 * ⚠ These are RECORDED figures and `asset-payload.test.ts` re-reads the files, so a `three`
 * upgrade that changes a decoder reds a test instead of leaving a quietly stale argument
 * standing. That is the point of the test, not ceremony: the whole Draco-versus-meshopt
 * verdict below turns on the ratio between these three numbers.
 */
export const DRACO_DECODER_GZIP_BYTES = 100_330;
export const MESHOPT_DECODER_GZIP_BYTES = 7_804;
export const BASIS_TRANSCODER_GZIP_BYTES = 262_678;

/**
 * THE MESH-COMPRESSION LADDER, measured on 2026-08-28 with `@gltf-transform/cli@4.4.2` run
 * from `/tmp` via `npx` — deliberately NOT installed into this workspace, because measuring an
 * alternative is not adopting its toolchain.
 *
 * ⚠ Read the two subjects together or the finding inverts. Compression is worth what it saves
 * MINUS what its decoder costs, and the geometry of one pine (25,770 B) is smaller than the
 * Draco decoder that would read it.
 */
export interface CompressedArm {
  readonly key: string;
  readonly baselineKey: string;
  readonly codec: 'draco' | 'meshopt';
  readonly wireBytes: number;
  readonly brotliBytes: number;
}

export const COMPRESSED_ARMS: readonly CompressedArm[] = [
  { key: 'pine-webp90-512-draco', baselineKey: 'pine-webp90-512', codec: 'draco', wireBytes: 165_568, brotliBytes: 162_708 },
  { key: 'pine-webp90-512-meshopt', baselineKey: 'pine-webp90-512', codec: 'meshopt', wireBytes: 169_844, brotliBytes: 162_619 },
  { key: 'kit-webp90-512-draco', baselineKey: 'kit-webp90-512', codec: 'draco', wireBytes: 861_604, brotliBytes: 788_034 },
  { key: 'kit-webp90-512-meshopt', baselineKey: 'kit-webp90-512', codec: 'meshopt', wireBytes: 982_812, brotliBytes: 798_545 },
];

/** The decoder a compressed arm obliges the site to download, once. */
export function decoderBytesFor(codec: 'draco' | 'meshopt'): number {
  return codec === 'draco' ? DRACO_DECODER_GZIP_BYTES : MESHOPT_DECODER_GZIP_BYTES;
}

/** Judge one measured compressed arm against its own baseline and its own decoder. */
export function verdictForCompressedArm(arm: CompressedArm): MeshCompressionVerdict {
  return meshCompressionVerdict({
    label: arm.key,
    baselineBrotliBytes: armByKey(arm.baselineKey).brotliBytes,
    compressedBrotliBytes: arm.brotliBytes,
    decoderBytes: decoderBytesFor(arm.codec),
  });
}

// ============================================================================
// TEXTURE RESOLUTION — reading the rung off the frame rather than off taste
// ============================================================================

/** The kit's own ladder, by halving from what the `.blend` packs. */
export const TEXTURE_RUNGS: readonly number[] = [128, 256, 512, 1024, 2048];

export interface TextureRungVerdict {
  /** The smallest authored rung with at least one texel per delivered pixel. */
  readonly sufficientEdgePx: number;
  /** How many rungs above sufficient the arm sits. 0 is exact, 1 is one doubling of headroom. */
  readonly rungsAbove: number;
  /** `chosenEdge / deliveredExtentPx` — texels per delivered pixel along one axis. */
  readonly oversampling: number;
  readonly outcome: 'SUFFICIENT' | 'HEADROOM' | 'WASTEFUL';
  readonly prose: string;
}

/**
 * WHAT RESOLUTION AN OBJECT ACTUALLY NEEDS, read off how big it is IN THE FRAME.
 *
 * `deliveredExtentPx` is the object's longest on-screen extent in device pixels at the zoom
 * being judged — measured from the scene, never assumed. A texture whose edge is below that is
 * blurry; one at or just above it is sharp; one four times above it is paying for detail that
 * cannot land on a pixel.
 *
 * The verdict deliberately allows ONE rung of headroom rather than demanding the exact rung.
 * A texture is minified, not point-sampled — mip level 0 is only fully used dead-on — and the
 * kit's ladder halves, so "exact" and "one doubling" are the only two choices available. Two
 * rungs above delivers 4x the texels per pixel in each axis, 16x the memory, and no more
 * detail that can reach a screen: that is where this refuses.
 */
export function textureRungVerdict(
  arm: MeasuredArm,
  deliveredExtentPx: number,
): TextureRungVerdict {
  if (!(deliveredExtentPx > 0)) {
    throw new Error('asset-payload: deliveredExtentPx must be positive');
  }
  const sufficientEdgePx =
    TEXTURE_RUNGS.find((r) => r >= deliveredExtentPx) ?? TEXTURE_RUNGS[TEXTURE_RUNGS.length - 1]!;
  const chosenIndex = TEXTURE_RUNGS.indexOf(arm.textureEdgePx);
  const sufficientIndex = TEXTURE_RUNGS.indexOf(sufficientEdgePx);
  if (chosenIndex < 0) throw new Error(`asset-payload: ${arm.textureEdgePx} is not an authored rung`);
  const rungsAbove = chosenIndex - sufficientIndex;
  const oversampling = arm.textureEdgePx / deliveredExtentPx;
  const outcome = rungsAbove <= 0 ? 'SUFFICIENT' : rungsAbove === 1 ? 'HEADROOM' : 'WASTEFUL';
  const prose =
    `${arm.key}: ${arm.textureEdgePx}² against a ${Math.round(deliveredExtentPx)} px delivered extent ` +
    `(${oversampling.toFixed(1)} texels per delivered pixel); the sufficient rung is ${sufficientEdgePx}² — ${outcome}.`;
  return { sufficientEdgePx, rungsAbove, oversampling, outcome, prose };
}

/**
 * THE COST OF SITTING TOO HIGH ON THE LADDER, in the bytes a visitor actually pays. Pass the
 * arm you shipped and the arm at the sufficient rung, same subject and same codec.
 */
export function rungOvershootBytes(chosen: MeasuredArm, sufficient: MeasuredArm): number {
  if (chosen.subject !== sufficient.subject || chosen.codec !== sufficient.codec) {
    throw new Error('asset-payload: overshoot compares one subject in one codec');
  }
  return chosen.brotliBytes - sufficient.brotliBytes;
}
