// build-detail-normal.mjs — regenerate `src/detail-normal.ts` from the committed
// `harness/assets/cliff-normal-128.png` (LAYER 6 of the approved ground material — the kit's
// cliff NORMAL map used as a DETAIL layer, build_land.py `mat_attribute()` :943-965).
//
// ⚠⚠ WHY IT IS EMBEDDED. Same reason as `build-kit-asset.mjs`: `packages/forest-world-r3f/src` is
// mirrored into the public site by `pnpm sync:web-engine`, which carries `.ts` / `.tsx` and
// nothing else, so a `src/` module that fetched `/assets/cliff-normal-128.png` would work in the
// harness and 404 for every visitor. A `.ts` module is the one shape that crosses the seam.
//
// ⚠ THE PNG IS A COMMITTED DERIVATIVE, MADE ONCE. The bought kit's `Pine_Cliff_Normal.tga`
// (2048x2048, 24 bpp, 12 MB, inside `Textures_Pine_Forest_Kit.zip`) is NOT in the repo and never
// will be — the licence is per-seat and the size is absurd for a detail tile the eye reads at a
// few texels per ground unit. It was downsampled ONCE to 128x128 and RE-NORMALISED texel by texel
// (a LANCZOS resample of an encoded normal map averages neighbouring vectors, and an average of
// unit vectors is shorter than one — the min |n| after the resample was 0.8365, so without the
// renormalise the flattest texels would have read as ~16% weaker relief than their neighbours for
// no reason in the source). The exact python that produced it, so it can be redone:
//
//   import zipfile; import numpy as np; from PIL import Image
//   z = zipfile.ZipFile('C:/code/assets/superhive/Stylized Pine Forest Nature Kit/Textures_Pine_Forest_Kit.zip')
//   tga = z.extract('Textures_Pine_Forest_Kit/2048/Cliff/Pine_Cliff_Normal.tga', SCRATCH_DIR)
//   src = Image.open(tga).convert('RGB'); assert src.size == (2048, 2048)
//   small = src.resize((128, 128), Image.LANCZOS)
//   n = np.asarray(small, dtype=np.float64) / 255.0 * 2.0 - 1.0          # decode to [-1, 1]
//   unit = n / np.linalg.norm(n, axis=-1, keepdims=True)                  # re-normalise
//   enc = np.clip(np.rint((unit + 1.0) / 2.0 * 255.0), 0, 255).astype(np.uint8)
//   Image.fromarray(enc, 'RGB').save('harness/assets/cliff-normal-128.png', format='PNG', optimize=True)
//
//   (PIL 12.2.0, numpy 2.4.4, python3 on the dev box, 2026-09-02.)
//
// MEASURED ON THE DERIVATIVE (the same script, decoding the PNG back):
//
//   mean tilt from +z     4.561°   (the 2048 source reads 5.931° — the resample averages away
//                                   the finest striation, which is the point of a 128 tile)
//   mean |n| after re-encode 1.0004  (unit to within 8-bit quantisation)
//   mean xyz              [+0.0030, -0.0004, +0.9945]  (no net lean — the tile does not push the
//                                                       ground one way)
//
// THE COST, MEASURED (2026-09-02, `node:zlib` brotli quality 11 — printed by this script):
//
//   raw .png              26,261 B on disk    26,265 B brotli  (a PNG is already deflated —
//                                                               brotli cannot shrink it)
//   base64 in a .ts       35,016 chars        27,815 B brotli  ← +5.9% over the wire, the whole
//                                                               module including its header
//                                                               (±a few B run to run: the
//                                                               header's own digits are payload)
//
// Cheaper than the kit's +12.7% because a 128-texel normal map is nearly all high-entropy bytes
// and base64 of high-entropy data brotlis back to close to the raw size. Teaching the sync to
// carry binary assets would buy back ~1.5 KB here; the argument in `build-kit-asset.mjs` stands.
//
// ⚠ THE `.png` STAYS THE ONE SOURCE OF TRUTH. `src/detail-normal.test.ts` re-derives the base64
// from the committed file byte for byte and fails if the two disagree. Re-make the PNG, run this,
// commit both.
//
//   node --import ../../scripts/tsx-cache-off.mjs --import tsx harness/build-detail-normal.mjs

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const PNG = join(HERE, 'assets', 'cliff-normal-128.png');
const OUT = join(HERE, '..', 'src', 'detail-normal.ts');
const SIZE = 128;

const bytes = readFileSync(PNG);
const base64 = bytes.toString('base64');
const sha256 = createHash('sha256').update(bytes).digest('hex');

// Read the IHDR width/height off the bytes rather than trusting the filename: a wrong-size tile
// would otherwise ship with a `DETAIL_NORMAL_SIZE` that lied about it.
const width = bytes.readUInt32BE(16);
const height = bytes.readUInt32BE(20);
if (width !== SIZE || height !== SIZE) {
  throw new Error(`cliff-normal-128.png is ${width}x${height}, not ${SIZE}x${SIZE}`);
}

const brotli = (input) =>
  brotliCompressSync(input, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

const header = `// detail-normal.ts — THE CLIFF NORMAL MAP, EMBEDDED. @generated by \`harness/build-detail-normal.mjs\`.
//
// ⚠ DO NOT EDIT THE LITERAL. The source of truth is \`harness/assets/cliff-normal-128.png\`; this
// is a projection of it, and \`detail-normal.test.ts\` re-derives the base64 from that file and
// fails if the two disagree. Re-make the PNG, re-run the generator, commit both.
//
// WHAT IT IS: LAYER 6 of the approved ground material (build_land.py \`mat_attribute()\`
// :943-965) — the bought kit's \`Pine_Cliff_Normal.tga\` used as a DETAIL layer, its relief and
// not its colour. Downsampled ONCE from 2048 to 128 and re-normalised texel by texel; the recipe
// and the measurements (mean tilt 4.561° from +z, no net lean) are in the generator's header.
//
// ⚠⚠ IT IS EMBEDDED BECAUSE THE WEB SYNC CARRIES ONLY \`.ts\` AND \`.tsx\`
// (\`isEngineSource\`, \`packages/cli/src/web-engine-sync.ts\`). A \`src/\` module that fetched
// \`/assets/cliff-normal-128.png\` would work in the parent harness and 404 in the public engine
// copy — silently, only for visitors. Measured cost of the embedding, brotli q11: the raw PNG is
// ${bytes.length.toLocaleString('en-US')} B (${brotli(bytes).toLocaleString('en-US')} B brotli — already
// deflated), the base64 ${base64.length.toLocaleString('en-US')} chars, and this whole module about 27.8 KB
// brotli (measured 2026-09-02), i.e. **+5.9% over the wire** for a tile that cannot go missing.
//
// THIS MODULE IS PURE — no \`three\`, no DOM. The browser-bound loader that turns the bytes into a
// \`Texture\` is \`detail-normal-texture.ts\`, kept separate the way \`kit-mesh.ts\` is kept from
// \`kit-asset.ts\`, so this half is provable under \`bun test\` and the mutation rung.
`;

const body = `
/** Width and height of the tile in texels — read off the PNG's IHDR by the generator, not typed. */
export const DETAIL_NORMAL_SIZE = ${SIZE};

/** Bytes of the \`.png\` itself — what a visitor would download if it were served as a file.
 *  NOT the size of this module. */
export const DETAIL_NORMAL_BYTES = ${bytes.length};

/** SHA-256 of \`harness/assets/cliff-normal-128.png\`. Held by the drift test. */
export const DETAIL_NORMAL_SHA256 = '${sha256}';

/** The \`.png\`, base64. One literal on purpose: a chunked array would need joining at runtime and
 *  would give the mutation rung one survivor per chunk to argue about. Exported because the
 *  texture loader hands it to \`TextureLoader\` as a \`data:\` URL — the browser decodes the PNG. */
export const DETAIL_NORMAL_PNG_BASE64 =
  '${base64}';

/**
 * DECODE THE PNG BYTES — for a reader that wants the container rather than a texture (the drift
 * test, a size probe, a payload table).
 *
 * ⚠ \`atob\` RETURNS A BINARY STRING, ONE BYTE PER CHAR; \`charCodeAt\` is the decode. A
 * \`TextEncoder\` over the same string would UTF-8-encode every char above 0x7f and corrupt the
 * container.
 *
 * ⚠ \`Uint8Array.from\` RATHER THAN AN INDEXED LOOP, deliberately. A \`for (let i = 0; …; i += 1)\`
 * carries mutants that flip \`+=\` to \`-=\` and \`<\` to \`>\`; neither fails an assertion, both run
 * forever, and \`check:mutation-diff\` scores a hang as UNPROVEN. There is no counter here to mutate.
 */
export function detailNormalBytes(): Uint8Array {
  return Uint8Array.from(atob(DETAIL_NORMAL_PNG_BASE64), (c) => c.charCodeAt(0));
}
`;

const source = header + body;
writeFileSync(OUT, source, 'utf8');
process.stdout.write(
  `wrote ${OUT}\n  png ${bytes.length} B · sha256 ${sha256}\n  base64 ${base64.length} chars\n` +
    `  brotli q11: png ${brotli(bytes)} B · generated .ts ${brotli(Buffer.from(source, 'utf8'))} B\n`,
);
