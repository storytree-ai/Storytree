// generate-sprites.mts — the AUTHOR-TIME runner that produces a studio-map sprite sheet with Nano Banana
// Pro (`gemini-3-pro-image`). NOT part of the gate (outside `src/`, no tsc/test); its correctness is
// proven by RUNNING it — the committed PNGs + manifest.json are the source of truth (the model is
// non-deterministic). Run from the worktree root:
//
//   KEY=$(gcloud secrets versions access latest --secret=gemini-api-key --project=storytree-498613)
//   GEMINI_API_KEY=$KEY node --import tsx packages/art-authoring/scripts/generate-sprites.mts --sheet cosy
//
// Flags:
//   --sheet cosy|evening    which plan to author (required)
//   --only a,b,c            generate only these image files (a probe); others left as-is
//   --size 1K|2K|4K         generation size (default 1K, economical)
//   --raw-dir <path>        also write the pre-cutout PNGs here for inspection (uncommitted scratch)
//   --no-manifest           skip writing manifest.json (probe runs)
//
// Fail-closed: an absent GEMINI_API_KEY throws (the backend never reads Secret Manager, never logs the key).

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
// @ts-expect-error jpeg-js ships no types; the runner is not typechecked (outside src/).
import jpegjs from 'jpeg-js';
import { geminiNanoBananaBackend } from '../src/backends/gemini-nano-banana.js';
import { cutoutRgba, type RgbaImage } from '../src/sprite/cutout.js';
import {
  COSY_PLAN,
  EVENING_PLAN,
  spritePrompt,
  buildManifest,
  type SheetPlan,
  type MeasuredImage,
} from '../src/sprite/sprite-sheet-plan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..'); // packages/art-authoring/scripts -> repo root
const STYLE_REF = join(REPO_ROOT, 'docs', 'research', 'grounded-art-concept', 'cosy-island-concept.png');
const SHEETS_DIR = join(REPO_ROOT, 'apps', 'studio', 'public', 'art-sheets');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Decode the model's returned bytes (JPEG or PNG) into an RGBA raster for the cutout. */
function decodeToRgba(bytes: Buffer, mimeType: string): RgbaImage {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
    const d = jpegjs.decode(bytes, { useTArray: true, formatAsRGBA: true }) as { width: number; height: number; data: Uint8Array };
    return { width: d.width, height: d.height, data: d.data };
  }
  const png = PNG.sync.read(bytes);
  return { width: png.width, height: png.height, data: png.data };
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const sheetName = arg('sheet');
  const plan: SheetPlan | undefined = sheetName === 'cosy' ? COSY_PLAN : sheetName === 'evening' ? EVENING_PLAN : undefined;
  if (!plan) throw new Error(`--sheet must be cosy|evening (got ${String(sheetName)})`);

  const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean);
  const size = arg('size') ?? '1K';
  const maxDim = Number(arg('max-dim') ?? '320');
  const rawDir = arg('raw-dir');
  const writeManifest = !flag('no-manifest');

  const outDir = join(SHEETS_DIR, plan.name);
  await mkdir(outDir, { recursive: true });
  if (rawDir) await mkdir(rawDir, { recursive: true });

  const styleBytes = await readFile(STYLE_REF);
  const styleRef = { data: styleBytes.toString('base64'), mimeType: 'image/png' };
  const backend = geminiNanoBananaBackend({ imageSize: size });

  const jobs = plan.jobs.filter((j) => !only || only.includes(j.file));
  console.log(`[generate] sheet=${plan.name} size=${size} jobs=${jobs.length}${only ? ` (only ${only.join(',')})` : ''}`);

  let generated = 0;
  for (const job of jobs) {
    const prompt = spritePrompt(job, plan.styleClause);
    process.stdout.write(`  - ${job.file} … `);
    const t0 = Date.now();
    const img = await backend.generateImage({ prompt, styleRef });
    if (rawDir) {
      const ext = img.mimeType.includes('jpeg') || img.mimeType.includes('jpg') ? 'jpg' : 'png';
      await writeFile(join(rawDir, `${plan.name}-${job.file}.raw.${ext}`), img.data);
    }
    const cut = cutoutRgba(decodeToRgba(img.data, img.mimeType), { maxDim });
    await writeFile(join(outDir, `${job.file}.png`), cut.png);
    generated++;
    console.log(`ok ${cut.width}x${cut.height}px in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  console.log(`[generate] generated ${generated} image(s) into ${outDir}`);

  if (!writeManifest) {
    console.log('[generate] --no-manifest: skipping manifest.json');
    return;
  }

  // Measure every file the manifest keys reference (from disk) and assemble manifest.json.
  const files = [...new Set(Object.values(plan.keyToFile))];
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
  if (missing.length > 0) {
    console.log(`[generate] manifest NOT written — missing cut-out PNGs: ${missing.join(', ')}`);
    return;
  }
  const manifest = buildManifest(plan, measured);
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[generate] wrote ${join(outDir, 'manifest.json')} (${Object.keys(manifest.sprites).length} keys)`);
}

main().catch((err) => {
  console.error(`[generate] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
