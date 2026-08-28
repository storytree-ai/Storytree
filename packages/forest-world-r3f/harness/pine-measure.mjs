// pine-measure.mjs — DRIVE the first-textured-asset comparison and land its three numbers.
//
// THE QUESTION IT ANSWERS. `first-textured-asset-in-the-live-renderer` on
// `adopt-the-land-into-the-shipped-map-arc`: does `packages/forest-world-r3f/` actually draw a
// bought, textured pine — and what does that cost, in bytes over the wire and in milliseconds
// per frame. ADR-0418 adopted the direction and named the payload as "the one cost this ADR
// takes on without a number"; this is the run that produces it.
//
// USAGE:
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5207
//   DISPLAY=:0 ST_PINE_URL=http://localhost:5207/pine.html \
//     pnpm --filter @storytree/forest-world-r3f measure-pine
//
// ⚠ `vite.config.ts` pins `strictPort: 5184` for EVERY worktree, so a sibling worktree's server
// left running on the default port means you measure ITS tree and report the number as yours.
// This script REFUSES that port and verifies the served page's own <title> before trusting a
// reading.
//
// ⚠ `DISPLAY=:0` MUST BE IN THE ENVIRONMENT EVEN HEADLESS. Without it the GPU flags below fall
// back to SwiftShader on this box, silently. So does `--use-gl=egl`. The renderer string is read
// out of the live context and the run REFUSES on a software rasteriser.
//
// ⚠ AND IT REFUSES THREE THINGS THAT WOULD MAKE THE COMPARISON A NON-COMPARISON:
//   1. an arm that did not draw what its manifest says it draws (`EXPECTED_DRAW_CALLS`, authored
//      upstream in `pine-asset.ts` rather than read off the scene);
//   2. a glTF arm carrying no textures — a textured asset drawn untextured is the cheapest thing
//      on the page and would be reported as a triumph;
//   3. a scene whose LIGHTS changed the banded arm's pixels. The lights exist so the glTF can be
//      lit; if they touched the procedural arm they would be a second difference and every
//      frame-cost figure here would be confounded.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MEASURED_ARMS,
  SOURCE_TEXTURE_BYTES_2048,
  SOURCE_TEXTURE_BYTES_ALL_RESOLUTIONS,
  SOURCE_TEXTURE_ZIP_BYTES,
  armByKey,
  decodeExpansion,
  decodedTextureBytes,
  textureRungVerdict,
  verdictForCompressedArm,
  COMPRESSED_ARMS,
} from './asset-payload.ts';
import { FRAME_BUDGET_60HZ_MS, frameBudgetVerdict, median, spread } from './frame-budget.ts';
import {
  GPU_TIMER_EXTENSION,
  acceptSamples,
  costBoundProse,
  integrityVerdict,
  isInterleaved,
  roundRobinPlan,
} from './frame-cost.ts';
import { EXPECTED_DRAW_CALLS, PINE_VARIANTS, ZOOMS } from './pine-asset.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env['ST_PINE_URL'] ?? 'http://localhost:5207/pine.html';
const OUT =
  process.env['ST_PINE_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-textured-asset-2026-08-28');

const REPEATS = Number(process.env['ST_PINE_REPEATS'] ?? 7);
const BATCH = Number(process.env['ST_PINE_BATCH'] ?? 20);
const WIDTH = Number(process.env['ST_PINE_WIDTH'] ?? 1440);
const HEIGHT = Number(process.env['ST_PINE_HEIGHT'] ?? 960);
/** The committed asset, whose rungs the payload table judges. */
const SHIPPED_ARM = 'pine-webp90-512';

function fail(msg) {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
}

if (/:5184\b/.test(URL) && !process.env['ST_PINE_ALLOW_DEFAULT_PORT']) {
  fail(
    `${URL} is the harness's pinned default port, which every worktree shares.\n` +
      'Start vite on a free port and pass ST_PINE_URL.',
  );
}

const GPU_ARGS = [
  '--use-gl=angle',
  '--use-angle=gl',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
];

const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`);
});

await page.goto(URL, { waitUntil: 'load' });

const title = await page.evaluate(() => document.title);
if (!/the first textured asset on the GPU clock/.test(title)) {
  await browser.close();
  fail(`${URL} served "${title}" — that is not this branch's pine page.`);
}

await page
  .waitForFunction(() => window.__stPineReady === true || typeof window.__stPineError === 'string', null, {
    timeout: 60_000,
  })
  .catch(async () => {
    await browser.close();
    fail('the page never became ready — the asset did not load and did not report why.');
  });

const loadError = await page.evaluate(() => window.__stPineError ?? null);
if (loadError) {
  await browser.close();
  fail(`the page could not load the asset: ${loadError}`);
}

const identity = await page.evaluate(() => window.__stPineIdentity());
const asset = await page.evaluate(() => window.__stPineAsset());
const calibration = await page.evaluate(() => window.__stPineCalibration());

console.log(`renderer: ${identity.renderer}`);
console.log(`vendor:   ${identity.vendor}`);
console.log(`${GPU_TIMER_EXTENSION}: ${identity.timerQuery ? 'available' : 'ABSENT'}`);
console.log(
  `\nasset:    ${asset.wireBytes} B over the wire · ${asset.triangles} triangles · ` +
    `${asset.textures.length} textures · ${asset.heightUnits.toFixed(3)} units tall`,
);
for (const t of asset.textures) console.log(`            ${t.name} ${t.width}x${t.height}`);
console.log(
  `\nlight calibration: a white fully-lit standard face delivered ${calibration.probe.toFixed(4)} ` +
    `at unit intensities; scaled x${calibration.scale.toFixed(3)} so it delivers the ladder's ` +
    `top rung ${calibration.target}`,
);

if (identity.software) {
  await browser.close();
  fail(
    `the context came up on a SOFTWARE rasteriser (${identity.renderer}). Every figure this ` +
      'instrument produces is a frame time, so a software run is not a slower verdict — it is ' +
      'no verdict. Check DISPLAY=:0 is set; without it these flags fall back to SwiftShader.',
  );
}
if (!identity.timerQuery) {
  await browser.close();
  fail(
    `${GPU_TIMER_EXTENSION} is absent, so there is no GPU clock here. PR #1683 established that ` +
      'the wall-clock route this project used before was wrong by 30-250x because it timed work ' +
      'SUBMISSION rather than GPU EXECUTION; falling back to it is not an option.',
  );
}
if (asset.textures.length === 0) {
  await browser.close();
  fail(
    'the loaded asset carries NO textures. An untextured pine is the cheapest thing on this ' +
      'page and every number below would read as a triumph.',
  );
}

// --- premise refusal: the lights must not touch the banded arm -------------------------------
//
// The lights are in every arm so the glTF can be lit. That is only legitimate if they change
// NOTHING about the arms that ignore them. Asserted here rather than argued in a comment.
const lightDiff = await page.evaluate(
  async ({ width, height }) => {
    const base = { variant: 'procedural', pxPerUnit: 8, width, height, batch: 1 };
    return window.__stPineDiff(base, { ...base, noLights: true });
  },
  { width: WIDTH, height: HEIGHT },
);
console.log(
  `\npremise — lights on vs off, procedural arm: ${lightDiff.differing} of ${lightDiff.total} pixels differ`,
);
if (lightDiff.differing !== 0) {
  await browser.close();
  fail(
    `the scene lights changed ${lightDiff.differing} pixels of the BANDED arm. They exist only ` +
      'so the glTF can be lit; if they reach the procedural arm they are a second difference ' +
      'between the arms and every frame-cost figure in this run is confounded.',
  );
}

// --- the delivered extent of ONE tree, read off the frame ------------------------------------
const extents = {};
for (const zoom of ZOOMS) {
  const perVariant = {};
  for (const variant of ['procedural', 'gltf-untextured', 'gltf']) {
    const d = await page.evaluate(
      async ({ variant: v, zoom: z, width, height }) => {
        const base = { variant: v, pxPerUnit: z, width, height, batch: 1, trees: 1 };
        return window.__stPineDiff({ ...base, variant: 'bare' }, base);
      },
      { variant, zoom, width: WIDTH, height: HEIGHT },
    );
    if (!d.bbox || d.differing === 0) {
      await browser.close();
      fail(
        `the ${variant} arm at ${zoom} px/unit drew NOTHING the bare ground did not — one tree ` +
          'changed zero pixels. An arm that draws nothing is not a cheap arm, it is an absent one.',
      );
    }
    perVariant[variant] = d;
    console.log(
      `extent — one ${variant} tree at ${zoom} px/unit: ${d.bbox.width}x${d.bbox.height} px, ` +
        `${d.differing} pixels changed, ${d.distinctColours} distinct colours delivered`,
    );
  }
  extents[zoom] = perVariant;

  // ── DID IT ACTUALLY DRAW TEXTURED? Read off delivered pixels, against a same-run control.
  //
  // ⚠ THE CONTROL IS THE SAME ASSET WITH ITS MAPS STRIPPED, NOT THE BANDED ARM, AND A SURVIVING
  // MUTATION IS WHY. Against the banded arm this check passed with every map removed — 48
  // distinct colours against 5 — because a standard material shading curved geometry delivers a
  // smooth gradient with or without a texture. It was measuring continuous shading. Against the
  // asset's own untextured twin, the only thing that can move the number is the texture.
  const control = perVariant['gltf-untextured'].distinctColours;
  const textured = perVariant.gltf.distinctColours;
  console.log(
    `        distinct colours at ${zoom} px/unit: textured ${textured} · same asset unmapped ` +
      `${control} · banded ${perVariant.procedural.distinctColours}`,
  );
  if (textured <= control * 2) {
    await browser.close();
    fail(
      `at ${zoom} px/unit the textured glTF arm delivered ${textured} distinct colours against ` +
        `${control} for the SAME asset with its maps stripped. A texture that does not at least ` +
        'double the delivered colour variety of its own unmapped twin did not bind — which is ' +
        'the cheapest possible way to pass a frame-cost measurement.',
    );
  }
}

// --- the interleaved sweep -------------------------------------------------------------------
const CONFIGS = [];
for (const zoom of ZOOMS) {
  for (const variant of PINE_VARIANTS) {
    CONFIGS.push({ key: `${variant}@${zoom}px`, variant, pxPerUnit: zoom });
  }
}
const PLAN = roundRobinPlan(CONFIGS, REPEATS);
if (!isInterleaved(PLAN, CONFIGS)) {
  await browser.close();
  fail('the sweep plan is not interleaved — a grouped sweep aliases GPU drift onto the variable');
}

console.log(
  `\nsweep: ${CONFIGS.length} configurations x ${REPEATS} interleaved repeats, ` +
    `${BATCH} renders per timed batch, ${WIDTH}x${HEIGHT} buffer\n`,
);

const samples = new Map(CONFIGS.map((c) => [c.key, []]));
const meta = new Map();
for (let i = 0; i < PLAN.length; i++) {
  const cfg = PLAN[i];
  const spec = {
    variant: cfg.variant,
    pxPerUnit: cfg.pxPerUnit,
    width: WIDTH,
    height: HEIGHT,
    batch: BATCH,
    coverage: i < CONFIGS.length,
  };
  const r = await page.evaluate((s) => window.__stPine(s), spec);
  samples.get(cfg.key).push({
    gpuMsPerFrame: r.gpuMsPerFrame,
    wallMsPerFrame: r.wallMsPerFrame,
    disjoint: r.disjoint,
  });
  if (!meta.has(cfg.key)) meta.set(cfg.key, r);
  if (i < CONFIGS.length) {
    console.log(
      `  ${cfg.key.padEnd(18)} calls ${String(r.drawCalls).padStart(2)}  ` +
        `tris ${String(r.triangles).padStart(6)}  textures ${String(r.textures).padStart(2)}  ` +
        `ground covers ${r.groundCoveragePct === null ? '?' : r.groundCoveragePct.toFixed(1)}%`,
    );
  }
}

// --- the pictures ----------------------------------------------------------------------------
//
// The arc's standing owner instruction: an increment lands a comparison he can LOOK at, arms
// differing in exactly one thing, at both zooms, on the same instrument, same run. These are the
// delivered pixels of the very scenes measured above — `toDataURL` off the same preserved
// drawing buffer, not an element screenshot (an element screenshot composites the page
// background in opaque and has confounded two evidence pictures on this arc already).
mkdirSync(OUT, { recursive: true });
const pictures = [];
for (const zoom of ZOOMS) {
  for (const variant of PINE_VARIANTS) {
    const dataUrl = await page.evaluate(
      (s) => window.__stPineSnapshot(s),
      { variant, pxPerUnit: zoom, width: WIDTH, height: HEIGHT, batch: 1 },
    );
    const name = `pine-${variant}-${zoom}px.png`;
    writeFileSync(join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    pictures.push(name);
    console.log(`picture: ${name}`);
  }
}

if (consoleErrors.length) {
  await browser.close();
  fail(`the page logged ${consoleErrors.length} error(s):\n  ${consoleErrors.join('\n  ')}`);
}
await browser.close();

// --- non-vacuity: each arm drew what its manifest says ---------------------------------------
for (const [key, r] of meta) {
  const expected = EXPECTED_DRAW_CALLS[r.variant];
  if (r.drawCalls !== expected) {
    fail(
      `"${key}" submitted ${r.drawCalls} draw calls; \`EXPECTED_DRAW_CALLS\` says ${expected}. ` +
        'That manifest is authored UPSTREAM of the scene builder precisely so a mesh that ' +
        'stopped being drawn cannot take its own expectation down with it.',
    );
  }
  if (r.groundCoveragePct !== null && r.groundCoveragePct < 99) {
    fail(
      `"${key}" covered only ${r.groundCoveragePct.toFixed(1)}% of the frame. A partly-covered ` +
        'frame under-reports every per-frame cost by exactly the uncovered fraction.',
    );
  }
}

// --- acceptance, then the verdicts -----------------------------------------------------------
const accepted = new Map();
for (const c of CONFIGS) accepted.set(c.key, acceptSamples(samples.get(c.key)));

const integrity = integrityVerdict({
  rows: CONFIGS.map((c) => ({ label: c.key, accepted: accepted.get(c.key) })),
  extensionAvailable: identity.timerQuery,
  renderer: identity.renderer,
  vendor: identity.vendor,
  software: identity.software,
  hidden: [...meta.values()].some((r) => r.hidden),
});
console.log(`\n${integrity.prose}`);
for (const r of integrity.reasons) console.log(`  - ${r}`);

// THE BUDGET RUNG, per zoom, on the GPU CLOCK, against the BARE arm measured in the SAME run.
const budgets = {};
const wallBudgets = {};
for (const zoom of ZOOMS) {
  const rowsFor = (route) =>
    PINE_VARIANTS.map((v) => ({
      label: v,
      samples: accepted.get(`${v}@${zoom}px`)[route],
      software: identity.software,
      hidden: false,
    }));
  budgets[zoom] = frameBudgetVerdict({ rows: rowsFor('gpu'), baselineLabel: 'bare' });
  wallBudgets[zoom] = frameBudgetVerdict({ rows: rowsFor('wall'), baselineLabel: 'bare' });
}

const table = [];
for (const zoom of ZOOMS) {
  const b = budgets[zoom];
  console.log(`\n${zoom} px/ground unit — GPU clock (${GPU_TIMER_EXTENSION}), ${WIDTH}x${HEIGHT}`);
  console.log('  arm            median ms   spread ms   kept   % of 60Hz frame   cost vs bare ground');
  for (const v of PINE_VARIANTS) {
    const row = b.rows.find((r) => r.label === v);
    const a = accepted.get(`${v}@${zoom}px`);
    if (!row) continue;
    console.log(
      `  ${v.padEnd(12)} ${row.gpuMsPerFrame.toFixed(3).padStart(11)}   ` +
        `${row.spreadMs.toFixed(3).padStart(9)}   ${String(a.gpu.length).padStart(2)}/${a.attempted}   ` +
        `${row.sharePct.toFixed(2).padStart(15)}   ${costBoundProse(row)}`,
    );
    table.push({
      zoom,
      variant: v,
      gpuMedianMs: row.gpuMsPerFrame,
      gpuSpreadMs: row.spreadMs,
      wallMedianMs: median(a.wall),
      wallSpreadMs: spread(a.wall),
      keptSamples: a.gpu.length,
      attemptedSamples: a.attempted,
      sharePctOf60Hz: row.sharePct,
      resolution: row.resolution,
      deltaVsControlMs: row.deltaVsBaselineMs,
      noiseFloorMs: row.noiseFloorMs,
      drawCalls: meta.get(`${v}@${zoom}px`).drawCalls,
      triangles: meta.get(`${v}@${zoom}px`).triangles,
      costStatement: costBoundProse(row),
    });
  }
  console.log(`  => ${b.prose}`);
}

// --- THE PAYLOAD, which is what this increment owes above all -------------------------------
const shipped = armByKey(SHIPPED_ARM);
const rungs = {};
for (const zoom of ZOOMS) {
  const measuredExtent = extents[zoom].gltf.bbox.height;
  rungs[zoom] = { measuredExtentPx: measuredExtent, verdict: textureRungVerdict(shipped, measuredExtent) };
}

console.log('\n--- THE DELIVERED PAYLOAD ------------------------------------------------------');
console.log(
  `source, all resolutions unpacked: ${SOURCE_TEXTURE_BYTES_ALL_RESOLUTIONS} B ` +
    `(the zip ships at ${SOURCE_TEXTURE_ZIP_BYTES} B; the 2048² set the .blend packs is ` +
    `${SOURCE_TEXTURE_BYTES_2048} B)`,
);
console.log('\n  arm                        wire B     brotli B   VRAM B (mipped)   decode expansion');
for (const arm of MEASURED_ARMS) {
  console.log(
    `  ${arm.key.padEnd(24)} ${String(arm.wireBytes).padStart(10)} ${String(arm.brotliBytes).padStart(12)} ` +
      `${String(decodedTextureBytes(arm)).padStart(17)} ${`${decodeExpansion(arm).toFixed(1)}x`.padStart(18)}`,
  );
}
console.log('\n  mesh compression, saving against the decoder it obliges you to ship:');
for (const arm of COMPRESSED_ARMS) console.log(`    ${verdictForCompressedArm(arm).prose}`);
console.log('\n  texture rung, read off the measured delivered extent:');
for (const zoom of ZOOMS) console.log(`    at ${zoom} px/unit — ${rungs[zoom].verdict.prose}`);

// --- write it out ----------------------------------------------------------------------------
const reportPath = join(OUT, 'pine-measure.json');
writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      what:
        'first-textured-asset-in-the-live-renderer — one bought pine drawn TEXTURED by ' +
        'packages/forest-world-r3f, with its delivered payload in bytes and its per-frame cost ' +
        "on the GPU's own clock",
      url: URL,
      measuredOn: {
        renderer: identity.renderer,
        vendor: identity.vendor,
        timerQueryExtension: GPU_TIMER_EXTENSION,
        timerQueryAvailable: identity.timerQuery,
        software: identity.software,
      },
      asset: { url: '/assets/pine-01.glb', ...asset },
      lightCalibration: calibration,
      premise: { lightsChangeTheBandedArm: lightDiff },
      deliveredExtents: extents,
      sweep: {
        repeats: REPEATS,
        batchRendersPerSample: BATCH,
        interleaved: true,
        zooms: ZOOMS,
        variants: PINE_VARIANTS,
        bufferWidth: WIDTH,
        bufferHeight: HEIGHT,
        frameBudget60HzMs: FRAME_BUDGET_60HZ_MS,
        expectedDrawCalls: EXPECTED_DRAW_CALLS,
      },
      integrity,
      table,
      gpuClockBudgetByZoom: budgets,
      wallClockBudgetByZoom: wallBudgets,
      payload: {
        sourceTextureBytesAllResolutions: SOURCE_TEXTURE_BYTES_ALL_RESOLUTIONS,
        sourceTextureZipBytes: SOURCE_TEXTURE_ZIP_BYTES,
        sourceTextureBytes2048: SOURCE_TEXTURE_BYTES_2048,
        shippedArm: SHIPPED_ARM,
        arms: MEASURED_ARMS.map((a) => ({
          ...a,
          decodedTextureBytes: decodedTextureBytes(a),
          decodeExpansion: decodeExpansion(a),
        })),
        meshCompression: COMPRESSED_ARMS.map((a) => ({ ...a, verdict: verdictForCompressedArm(a) })),
        textureRungByZoom: rungs,
      },
      pictures,
      rawSamples: Object.fromEntries(samples),
    },
    null,
    2,
  )}\n`,
);
console.log(`\nreport: ${reportPath}`);

if (integrity.status === 'UNVERIFIED') process.exit(1);
for (const zoom of ZOOMS) {
  if (budgets[zoom].status === 'UNVERIFIED') {
    console.error(`\nUNVERIFIED at ${zoom} px/unit: ${budgets[zoom].prose}`);
    process.exit(1);
  }
}
