// generate-sheet.mts — the AUTHOR-TIME runner for the COHERENT whole-sheet pipeline (sprite-art-sheets
// wave 3). ONE Nano Banana Pro call per style authors every master object on a single white field; a
// content-aware slicer cuts them back out; a crown recolour derives the five per-status trees from ONE
// master; a review contact sheet is written for the owner's look-pick. NOT part of the gate (outside
// `src/`); its correctness is proven by RUNNING it — the committed PNGs + manifest are the source of truth.
//
// Run from the worktree root (the key is fetched by the AUTHOR's tooling, never by this repo):
//
//   KEY=$(gcloud secrets versions access latest --secret=gemini-api-key --project=storytree-498613)
//   GEMINI_API_KEY=$KEY node --import tsx packages/art-authoring/scripts/generate-sheet.mts --style storybook
//
// Flags:
//   --style <name>      one of storybook|daylight|watercolor|moonlit   (or --all for every style)
//   --all               author every style in sequence
//   --validate-only     do the FREE models.list key probe and exit (no paid generation)
//   --size 1K|2K|4K     generation size (default 2K — the sheet holds ~10 objects)
//   --aspect <ratio>    generation aspect ratio (default 16:9 — a wide 2×5 grid)
//   --raw-dir <path>    also write the pre-slice generation here (uncommitted scratch)
//   --out-root <path>   sheet output root (default apps/studio/public/art-sheets)
//   --contact-dir <path>  where the review contact sheet HTML is written (default docs/research/sprite-sheets-review)
//   --merge-gap <px>    slicer near-fragment merge gap (default 8)
//   --min-area <px>     slicer speckle floor (default 200)
//
// Fail-closed: an absent GEMINI_API_KEY throws; a failed key probe throws before any paid call; a
// blob/roster count mismatch is LOUD (the contact sheet shows every numbered blob) but does not crash —
// the owner/author eyeballs the cut and re-tunes or does a per-object touch-up, never a whole re-roll.

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
// @ts-expect-error jpeg-js ships no types; the runner is not typechecked (outside src/).
import jpegjs from 'jpeg-js';
import { geminiNanoBananaBackend, GEMINI_NANO_BANANA_MODEL } from '../src/backends/gemini-nano-banana.js';
import { cutoutRgba, downscaleRgba, type RgbaImage } from '../src/sprite/cutout.js';
import {
  WHOLE_SHEET_ROSTER,
  WHOLE_SHEET_STYLES,
  wholeSheetStyle,
  wholeSheetPrompt,
  type WholeSheetStyle,
} from '../src/sprite/whole-sheet-plan.js';
import { detectBlobs, cropBlob } from '../src/sprite/blob-slice.js';
import { recolorCrown, TREE_STATUS_PALETTE } from '../src/sprite/crown-recolor.js';
import {
  renderContactSheet,
  wrapContactSheetDoc,
  type ContactSheetSlice,
  type ContactStatusTree,
} from '../src/sprite/contact-sheet.js';
import { FULL_ROSTER, FULL_KEY_TO_FILE, buildManifest, type MeasuredImage } from '../src/sprite/sprite-sheet-plan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const STYLE_REF = join(REPO_ROOT, 'docs', 'research', 'grounded-art-concept', 'cosy-island-concept.png');
const DEFAULT_SHEETS_DIR = join(REPO_ROOT, 'apps', 'studio', 'public', 'art-sheets');
const DEFAULT_CONTACT_DIR = join(REPO_ROOT, 'docs', 'research', 'sprite-sheets-review');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Decode the model's returned bytes (JPEG or PNG) into an RGBA raster. */
function decodeToRgba(bytes: Buffer, mimeType: string): RgbaImage {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
    const d = jpegjs.decode(bytes, { useTArray: true, formatAsRGBA: true }) as {
      width: number;
      height: number;
      data: Uint8Array;
    };
    return { width: d.width, height: d.height, data: d.data };
  }
  const png = PNG.sync.read(bytes);
  return { width: png.width, height: png.height, data: png.data };
}

/** Encode an RGBA raster to a JPEG data URI (for the lean contact-sheet preview of the raw generation). */
function rgbaToJpegDataUri(img: RgbaImage, quality = 82): string {
  const enc = jpegjs.encode({ data: Buffer.from(img.data), width: img.width, height: img.height }, quality) as {
    data: Buffer;
  };
  return `data:image/jpeg;base64,${enc.data.toString('base64')}`;
}
function pngToDataUri(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** FREE key probe: list models and confirm the key works (and, informationally, that the image model is
 *  visible) BEFORE any paid generation. Throws on an absent key or a failed list. */
async function validateKey(): Promise<void> {
  const apiKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY (or GOOGLE_API_KEY) is not set — hydrate gemini-api-key from Secret Manager into the env.',
    );
  }
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pager: any = await ai.models.list({ config: { pageSize: 50 } });
  const page: any[] = Array.isArray(pager?.page) ? pager.page : [];
  let count = page.length;
  let hasModel = page.some((m) => String(m?.name ?? '').includes(GEMINI_NANO_BANANA_MODEL));
  if (count === 0) {
    // fall back to async iteration if the pager didn't expose `.page`
    try {
      for await (const m of pager) {
        count++;
        if (String((m as any)?.name ?? '').includes(GEMINI_NANO_BANANA_MODEL)) hasModel = true;
        if (count >= 200) break;
      }
    } catch {
      /* ignore — count stays 0 → the guard below throws */
    }
  }
  if (count === 0) throw new Error('models.list returned nothing — the key is invalid or lacks access.');
  console.log(`[validate] key OK — ${count}+ models visible; ${GEMINI_NANO_BANANA_MODEL} ${hasModel ? 'present' : 'not on the first page (generation will still be attempted)'}.`);
}

interface RunOpts {
  size: string;
  aspect: string;
  rawDir?: string;
  outRoot: string;
  contactDir: string;
  mergeGap: number;
  minArea: number;
}

async function authorStyle(style: WholeSheetStyle, styleRef: { data: string; mimeType: string }, opts: RunOpts): Promise<void> {
  console.log(`\n[sheet ${style.name}] one whole-sheet call (${opts.size}, ${opts.aspect}) …`);
  const backend = geminiNanoBananaBackend({ imageSize: opts.size, aspectRatio: opts.aspect });
  const prompt = wholeSheetPrompt(WHOLE_SHEET_ROSTER, style.styleClause);

  const t0 = Date.now();
  const img = await backend.generateImage({ prompt, styleRef });
  console.log(`[sheet ${style.name}] generated in ${((Date.now() - t0) / 1000).toFixed(1)}s (${img.mimeType})`);
  if (opts.rawDir) {
    await mkdir(opts.rawDir, { recursive: true });
    const ext = img.mimeType.includes('jpeg') ? 'jpg' : 'png';
    await writeFile(join(opts.rawDir, `${style.name}.raw.${ext}`), img.data);
  }

  const raw = decodeToRgba(img.data, img.mimeType);
  const blobs = detectBlobs(raw, { mergeGap: opts.mergeGap, minArea: opts.minArea });
  const roster = WHOLE_SHEET_ROSTER;
  console.log(`[sheet ${style.name}] sliced ${blobs.length} blobs (roster expects ${roster.length})`);
  if (blobs.length !== roster.length) {
    console.log(`[sheet ${style.name}] ⚠ COUNT MISMATCH — the contact sheet shows every numbered blob; re-tune --merge-gap or touch up one object.`);
  }

  const outDir = join(opts.outRoot, style.name);
  await mkdir(outDir, { recursive: true });

  // Slice: zip detected blobs (reading order) to the roster (layout order). Keep each cropped raster so
  // the base tree can be recoloured in memory.
  const slices: ContactSheetSlice[] = [];
  let baseTreeRaster: RgbaImage | undefined;
  const n = Math.min(blobs.length, roster.length);
  for (let i = 0; i < n; i++) {
    const blob = blobs[i]!;
    const master = roster[i]!;
    const cut = cropBlob(raw, blob, { maxDim: 320, cropPad: 16 });
    await writeFile(join(outDir, `${master.file}.png`), cut.png);
    slices.push({ name: master.file, role: master.role, dataUri: pngToDataUri(cut.png), w: cut.width, h: cut.height });
    if (master.role === 'base-tree') {
      const p = PNG.sync.read(cut.png);
      baseTreeRaster = { width: p.width, height: p.height, data: p.data };
    }
  }

  // Crown recolour: derive the 4 non-healthy per-status trees from the base tree master (healthy = base).
  const statusTrees: ContactStatusTree[] = [];
  if (baseTreeRaster) {
    for (const { status, hex } of TREE_STATUS_PALETTE) {
      let treeBytes: Buffer;
      if (status === 'healthy') {
        treeBytes = await readFile(join(outDir, 'tree-healthy.png')); // the base slice itself
      } else {
        const recol = recolorCrown(baseTreeRaster, hex);
        const out = new PNG({ width: recol.width, height: recol.height });
        out.data.set(recol.data);
        treeBytes = PNG.sync.write(out);
        await writeFile(join(outDir, `tree-${status}.png`), treeBytes);
      }
      statusTrees.push({ status, hex, dataUri: pngToDataUri(treeBytes) });
    }
  } else {
    console.log(`[sheet ${style.name}] ⚠ no base tree slice — cannot recolour per-status trees.`);
  }

  // Manifest: reuse the studio contract's builder against the produced files.
  const plan = { name: style.name, label: style.label, styleClause: style.styleClause, jobs: FULL_ROSTER, keyToFile: FULL_KEY_TO_FILE };
  const files = [...new Set(Object.values(FULL_KEY_TO_FILE))];
  const measured: MeasuredImage[] = [];
  const missing: string[] = [];
  for (const file of files) {
    const p = join(outDir, `${file}.png`);
    if (!(await exists(p))) {
      missing.push(file);
      continue;
    }
    const png = PNG.sync.read(await readFile(p));
    measured.push({ file, pxWidth: png.width, pxHeight: png.height });
  }
  if (missing.length === 0) {
    const manifest = buildManifest(plan, measured);
    await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`[sheet ${style.name}] wrote manifest.json (${Object.keys(manifest.sprites).length} keys)`);
  } else {
    console.log(`[sheet ${style.name}] manifest NOT written — missing files: ${missing.join(', ')}`);
  }

  // Contact sheet (the owner's look-pick surface).
  const witheredSlice = slices.find((s) => s.name === 'tree-withered');
  const unhealthyTree = statusTrees.find((t) => t.status === 'unhealthy');
  const preview = raw.width > 1400 ? downscaleRgba(raw, 1400) : raw;
  const body = renderContactSheet({
    styleName: style.name,
    styleLabel: style.label,
    rawDataUri: rgbaToJpegDataUri(preview),
    blobCount: blobs.length,
    rosterCount: roster.length,
    slices,
    statusTrees,
    ...(witheredSlice ? { witheredDataUri: witheredSlice.dataUri } : {}),
    ...(unhealthyTree ? { unhealthyRecolorDataUri: unhealthyTree.dataUri } : {}),
    generatedNote: `${GEMINI_NANO_BANANA_MODEL} · ${opts.size}/${opts.aspect}`,
  });
  await mkdir(opts.contactDir, { recursive: true });
  await writeFile(join(opts.contactDir, `${style.name}.contact.html`), body);
  await writeFile(join(opts.contactDir, `${style.name}.standalone.html`), wrapContactSheetDoc(body, `${style.label} — sprite sheet review`));
  console.log(`[sheet ${style.name}] wrote contact sheet → ${join(opts.contactDir, `${style.name}.contact.html`)}`);
}

async function main(): Promise<void> {
  await validateKey();
  if (flag('validate-only')) {
    console.log('[validate-only] done — no generation.');
    return;
  }

  const styles: WholeSheetStyle[] = flag('all')
    ? [...WHOLE_SHEET_STYLES]
    : (() => {
        const name = arg('style');
        const s = name ? wholeSheetStyle(name) : undefined;
        if (!s) throw new Error(`--style must be one of ${WHOLE_SHEET_STYLES.map((x) => x.name).join('|')} (or --all)`);
        return [s];
      })();

  const opts: RunOpts = {
    size: arg('size') ?? '2K',
    aspect: arg('aspect') ?? '16:9',
    ...(arg('raw-dir') ? { rawDir: arg('raw-dir')! } : {}),
    outRoot: arg('out-root') ?? DEFAULT_SHEETS_DIR,
    contactDir: arg('contact-dir') ?? DEFAULT_CONTACT_DIR,
    mergeGap: Number(arg('merge-gap') ?? '8'),
    minArea: Number(arg('min-area') ?? '200'),
  };

  const styleBytes = await readFile(STYLE_REF);
  const styleRef = { data: styleBytes.toString('base64'), mimeType: 'image/png' };

  for (const style of styles) await authorStyle(style, styleRef, opts);
  console.log(`\n[done] authored ${styles.length} style(s).`);
}

main().catch((err) => {
  console.error(`[generate-sheet] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
