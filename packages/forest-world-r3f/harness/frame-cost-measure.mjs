// frame-cost-measure.mjs — DRIVE the GPU-clock frame-cost instrument and land the numbers.
//
// THE QUESTION IT ANSWERS. `adopt-the-land-into-the-shipped-map-arc` end-state item 2 asks what
// the land treatment costs per frame at both zooms, with the GRAIN OCTAVE COSTED SEPARATELY —
// it is the component most likely to be unaffordable and the one carrying the zoomed view. No
// instrument capable of answering that existed: `hardware-floor.mjs` is measured DRAW-CALL
// bound (quadrupling its fragments moved its number 0%; removing its plants dropped it 97%), so
// a shader A/B there resolves nothing and says so as "below the noise floor".
//
// USAGE — and note the port, which has bitten this harness before:
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5203
//   DISPLAY=:0 ST_FRAME_URL=http://localhost:5203/frame-cost.html \
//     pnpm --filter @storytree/forest-world-r3f measure-frame
//
// ⚠ `vite.config.ts` pins `strictPort: 5184` for EVERY worktree, so a sibling worktree's server
// left running on the default port means you measure ITS tree and report the number as yours.
// This script REFUSES that port and verifies the served page's own <title> before trusting a
// reading — a wrong-tree measurement produces a NUMBER rather than a missing file and is
// therefore worse than a crash.
//
// ⚠ `DISPLAY=:0` MUST BE IN THE ENVIRONMENT EVEN HEADLESS. Without it the GPU flags below fall
// back to SwiftShader on this box, silently. So does `--use-gl=egl`. The renderer string is read
// out of the live context and the run REFUSES on a software rasteriser: a software frame time
// is not a hardware verdict, and this instrument's entire output is frame times.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FRAME_BUDGET_60HZ_MS, frameBudgetVerdict, median, spread } from './frame-budget.ts';
import {
  GPU_TIMER_EXTENSION,
  acceptSamples,
  costBoundProse,
  costChartSvg,
  finishRouteVerdict,
  integrityVerdict,
  isInterleaved,
  roundRobinPlan,
} from './frame-cost.ts';
import { GRAIN_VARIANTS, REDUCTION_VARIANTS, SIN_CALLS_PER_FRAGMENT } from './frame-cost-scene.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env['ST_FRAME_URL'] ?? 'http://localhost:5203/frame-cost.html';
const OUT =
  process.env['ST_FRAME_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-frame-cost-2026-08-28');

const REPEATS = Number(process.env['ST_FRAME_REPEATS'] ?? 7);
const BATCH = Number(process.env['ST_FRAME_BATCH'] ?? 30);
const WIDTH = Number(process.env['ST_FRAME_WIDTH'] ?? 2880);
const HEIGHT = Number(process.env['ST_FRAME_HEIGHT'] ?? 1920);
const ZOOMS = (process.env['ST_FRAME_ZOOMS'] ?? '2,8').split(',').map((z) => Number(z.trim()));
const WITH_REDUCTIONS = process.env['ST_FRAME_REDUCTIONS'] === '1';

const VARIANTS = WITH_REDUCTIONS ? [...GRAIN_VARIANTS, ...REDUCTION_VARIANTS] : [...GRAIN_VARIANTS];

function fail(msg) {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
}

if (/:5184\b/.test(URL) && !process.env['ST_FRAME_ALLOW_DEFAULT_PORT']) {
  fail(
    `${URL} is the harness's pinned default port, which every worktree shares.\n` +
      'Start vite on a free port and pass ST_FRAME_URL.',
  );
}

// The flags that reach the real device on this box. `--use-gl=egl` FAILS SILENTLY to
// SwiftShader with the same flags otherwise unchanged, so the renderer string is what proves
// which of them worked — never the flag list.
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

// PROVE THE TREE before trusting a single number.
const title = await page.evaluate(() => document.title);
if (!/the grain octave on the GPU clock/.test(title)) {
  await browser.close();
  fail(`${URL} served "${title}" — that is not this branch's frame-cost page.`);
}

await page.waitForFunction(() => window.__stFrameCostReady === true, null, { timeout: 60_000 });

const identity = await page.evaluate(() => window.__stFrameCostIdentity());
console.log(`renderer: ${identity.renderer}`);
console.log(`vendor:   ${identity.vendor}`);
console.log(`${GPU_TIMER_EXTENSION}: ${identity.timerQuery ? 'available' : 'ABSENT'}`);

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
    `${GPU_TIMER_EXTENSION} is absent, so there is no GPU clock here and this instrument would ` +
      'be hardware-floor.mjs with extra steps.',
  );
}

// --- the interleaved sweep ------------------------------------------------------------------
//
// ROUND-ROBIN across every (variant x zoom) configuration, one pass at a time. NOT repeats
// grouped by configuration: a GPU drifts over a run — thermal, clock and power state all move —
// so grouping aliases that drift onto the variable and whichever arm went last always looks
// dearest. The order is asserted rather than assumed.
const CONFIGS = [];
for (const zoom of ZOOMS) {
  for (const variant of VARIANTS) {
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
    // Coverage is read once per configuration — it is a framebuffer readback and costs more
    // than the measurement it is protecting.
    coverage: i < CONFIGS.length,
  };
  const r = await page.evaluate((s) => window.__stFrameCost(s), spec);
  samples.get(cfg.key).push({
    gpuMsPerFrame: r.gpuMsPerFrame,
    wallMsPerFrame: r.wallMsPerFrame,
    disjoint: r.disjoint,
  });
  if (!meta.has(cfg.key)) meta.set(cfg.key, r);
  if (i < CONFIGS.length) {
    console.log(
      `  ${cfg.key.padEnd(20)} calls ${r.drawCalls}  tris ${r.triangles}  ` +
        `ground covers ${r.groundCoveragePct === null ? '?' : r.groundCoveragePct.toFixed(1)}% ` +
        `of the frame`,
    );
  }
}

if (consoleErrors.length) {
  await browser.close();
  fail(`the page logged ${consoleErrors.length} error(s):\n  ${consoleErrors.join('\n  ')}`);
}
await browser.close();

// --- non-vacuity: the scene must actually be what it claims ---------------------------------
for (const [key, r] of meta) {
  if (r.drawCalls !== 1) {
    fail(
      `"${key}" submitted ${r.drawCalls} draw calls, not 1. The whole point of this scene is that ` +
        'it is FRAGMENT bound; at more than one call the shader stops being the dominant term ' +
        'and this becomes the instrument it was built to replace.',
    );
  }
  if (r.groundCoveragePct !== null && r.groundCoveragePct < 100) {
    fail(
      `"${key}" drew ground over only ${r.groundCoveragePct.toFixed(1)}% of the frame. Every ` +
        'figure here is a per-frame fragment cost, so a partly-covered frame under-reports it ' +
        'by exactly the uncovered fraction and nothing in the report would say so.',
    );
  }
}

// --- acceptance, then the verdicts ----------------------------------------------------------

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

// THE BUDGET RUNG, per zoom, on the GPU CLOCK. The control is the `none` arm measured in the
// SAME run — never a committed figure. `frame-budget.ts` withholds any delta that does not
// clear the wider of the two rows' spreads, and voids the run on a negative one.
const budgets = {};
for (const zoom of ZOOMS) {
  budgets[zoom] = frameBudgetVerdict({
    rows: VARIANTS.map((v) => ({
      label: v,
      samples: accepted.get(`${v}@${zoom}px`).gpu,
      software: identity.software,
      hidden: false,
    })),
    baselineLabel: 'none',
  });
}

// THE SAME ARITHMETIC ON THE WALL-CLOCK ROUTE, so the two routes can be compared as VERDICTS
// and not only as medians. If the old route cannot resolve what the GPU clock can, that is the
// concrete cost of the instrument this replaces.
const wallBudgets = {};
for (const zoom of ZOOMS) {
  wallBudgets[zoom] = frameBudgetVerdict({
    rows: VARIANTS.map((v) => ({
      label: v,
      samples: accepted.get(`${v}@${zoom}px`).wall,
      software: identity.software,
      hidden: false,
    })),
    baselineLabel: 'none',
  });
}

// --- the table ------------------------------------------------------------------------------

const table = [];
for (const zoom of ZOOMS) {
  const b = budgets[zoom];
  console.log(`\n${zoom} px/ground unit — GPU clock (${GPU_TIMER_EXTENSION}), ${WIDTH}x${HEIGHT}`);
  console.log(
    '  variant          sin/frag   median ms   spread ms   kept   % of 60Hz frame   cost vs none',
  );
  for (const v of VARIANTS) {
    const row = b.rows.find((r) => r.label === v);
    const a = accepted.get(`${v}@${zoom}px`);
    if (!row) continue;
    console.log(
      `  ${v.padEnd(15)} ${String(SIN_CALLS_PER_FRAGMENT[v]).padStart(8)}   ` +
        `${row.gpuMsPerFrame.toFixed(3).padStart(9)}   ${row.spreadMs.toFixed(3).padStart(9)}   ` +
        `${String(a.gpu.length).padStart(2)}/${a.attempted}   ` +
        `${row.sharePct.toFixed(2).padStart(15)}   ${costBoundProse(row)}`,
    );
    table.push({
      zoom,
      variant: v,
      sinCallsPerFragment: SIN_CALLS_PER_FRAGMENT[v],
      gpuMedianMs: row.gpuMsPerFrame,
      gpuSpreadMs: row.spreadMs,
      wallMedianMs: median(a.wall),
      wallSpreadMs: spread(a.wall),
      keptSamples: a.gpu.length,
      attemptedSamples: a.attempted,
      discardedDisjoint: a.discardedDisjoint,
      discardedUnavailable: a.discardedUnavailable,
      sharePctOf60Hz: row.sharePct,
      resolution: row.resolution,
      deltaVsControlMs: row.deltaVsBaselineMs,
      noiseFloorMs: row.noiseFloorMs,
      costStatement: costBoundProse(row),
    });
  }
  console.log(`  => ${b.prose}`);
}

// --- the gl.finish() cross-check ------------------------------------------------------------

console.log('\nthe gl.finish() cross-check — the SAME batch, timed both ways:');
console.log('  configuration        GPU clock ms   gl.finish() ms    ratio   verdict');
const routes = [];
for (const c of CONFIGS) {
  const a = accepted.get(c.key);
  const v = finishRouteVerdict({ label: c.key, gpu: a.gpu, wall: a.wall });
  routes.push(v);
  console.log(
    `  ${c.key.padEnd(20)} ${v.gpuMedianMs.toFixed(3).padStart(12)}   ` +
      `${v.wallMedianMs.toFixed(3).padStart(14)}   ${v.ratio.toFixed(2).padStart(6)}   ` +
      v.hypothesis,
  );
}
const tally = routes.reduce((m, r) => m.set(r.hypothesis, (m.get(r.hypothesis) ?? 0) + 1), new Map());
const dominant = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
console.log(
  `\n  => ${dominant[1]}/${routes.length} configurations say ${dominant[0]}.\n` +
    `     ${routes.find((r) => r.hypothesis === dominant[0]).prose}`,
);

// --- write it out ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });

// THE PICTURE, derived from the very numbers printed above rather than hand-drawn. The arc's
// standing owner instruction is that an increment lands a comparison he can LOOK at; for a cost
// question that is primarily the table, and this is the same table with the bars drawn.
const chartPath = join(OUT, 'frame-cost.svg');
writeFileSync(
  chartPath,
  `${costChartSvg({
    title: 'What the land grain costs per frame, on the GPU\'s own clock',
    subtitles: [
      identity.renderer,
      `${WIDTH}x${HEIGHT}, ground filling the frame in ONE draw call · median of ${REPEATS} ` +
        `interleaved repeats · a disjoint sample is discarded, never averaged in`,
    ],
    seriesLabels: ZOOMS.map((z) => `${z} px / ground unit`),
    rows: VARIANTS.map((v) => ({
      variant: v,
      sinCalls: SIN_CALLS_PER_FRAGMENT[v],
      values: ZOOMS.map((z) => budgets[z].rows.find((r) => r.label === v).gpuMsPerFrame),
    })),
  })}\n`,
);
console.log(`chart:  ${chartPath}`);

const reportPath = join(OUT, 'frame-cost.json');
writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      what:
        'adopt-the-land-into-the-shipped-map-arc end-state item 2 — the per-frame cost of the ' +
        'land grain, costed separately, on the GPU\'s own clock',
      url: URL,
      measuredOn: {
        renderer: identity.renderer,
        vendor: identity.vendor,
        timerQueryExtension: GPU_TIMER_EXTENSION,
        timerQueryAvailable: identity.timerQuery,
        software: identity.software,
      },
      scene: {
        drawCalls: [...meta.values()][0]?.drawCalls ?? null,
        triangles: [...meta.values()][0]?.triangles ?? null,
        groundCoveragePct: Object.fromEntries(
          [...meta.entries()].map(([k, r]) => [k, r.groundCoveragePct]),
        ),
        bufferWidth: WIDTH,
        bufferHeight: HEIGHT,
      },
      sweep: {
        repeats: REPEATS,
        batchRendersPerSample: BATCH,
        interleaved: true,
        zooms: ZOOMS,
        variants: VARIANTS,
        frameBudget60HzMs: FRAME_BUDGET_60HZ_MS,
      },
      integrity,
      table,
      gpuClockBudgetByZoom: budgets,
      wallClockBudgetByZoom: wallBudgets,
      finishRouteCrossCheck: routes,
      rawSamples: Object.fromEntries(samples),
    },
    null,
    2,
  )}\n`,
);
console.log(`\nreport: ${reportPath}`);

// A run whose measurement could not be believed exits non-zero. UNVERIFIED is a verdict about
// the MEASUREMENT and it OUTRANKS a fail: a number already declared meaningless cannot fail a
// run either, and it must never be read as a pass.
if (integrity.status === 'UNVERIFIED') process.exit(1);
for (const zoom of ZOOMS) {
  if (budgets[zoom].status === 'UNVERIFIED') {
    console.error(`\nUNVERIFIED at ${zoom} px/unit: ${budgets[zoom].prose}`);
    process.exit(1);
  }
}
