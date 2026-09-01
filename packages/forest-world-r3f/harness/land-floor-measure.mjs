// land-floor-measure.mjs — DRIVE the land frame floor and land the number.
//
// THE QUESTION IT ANSWERS. `land-cost-instrument-arc` end-state item 1: fragment cost must be
// isolable from geometry cost, and a frame-time threshold must actually RED a run rather than
// describing it. `docs/research/chapter2-shipped-grass-2026-09-01/README.md` leaves the frame
// cost as an explicitly NAMED GAP — layer 1 evaluates 23 lattice-noise octaves per ground
// fragment against the two the shipped grain already evaluates, and ADR-0490's stated cost is
// that "nothing here argues the full stack is affordable".
//
// ⚠⚠ WHY NOT `hardware-floor.mjs`, WHICH ALREADY HAS A THRESHOLD AND A MATERIAL SWAP. Because
// both are unreachable for this question, which `land-floor.ts`'s header sets out in full: its
// threshold scores a `gl.finish()` wall clock measured BLIND to an 8.7x change in real GPU work,
// on a scene costing under 1 ms against a 16.67 ms bar — unreachable from both directions at
// once; and its material swap dresses a hand-assembled ground with `harness/banded-material.ts`,
// which has no grass option at all. This driver reads the GPU's own clock over arms built by the
// SHIPPED builder.
//
// USAGE — and note the port, which has bitten this harness before:
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5217
//   DISPLAY=:0 ST_LAND_FLOOR_URL=http://localhost:5217/land-floor.html \
//     pnpm --filter @storytree/forest-world-r3f measure-land-floor
//
// ⚠ `vite.config.ts` pins `strictPort: 5184` for EVERY worktree, so a sibling's server left
// running on the default port means you measure ITS tree and report the number as yours. This
// script REFUSES that port and verifies the served page's own <title> before trusting a reading —
// a wrong-tree measurement produces a NUMBER rather than a missing file and is therefore worse
// than a crash. On the Mint box, 5214 is a sibling session's: check `ss -ltn` first and never
// kill a server you did not start.
//
// ⚠ `DISPLAY=:0` MUST BE IN THE ENVIRONMENT EVEN HEADLESS. Without it the GPU flags below fall
// back to SwiftShader on this box, silently. The renderer string is read out of the live context
// and the run REFUSES on a software rasteriser — this instrument's entire output is frame times.
//
// ⚠ COMMITTED FIGURES COME OFF THE RTX 2060 BOX, AND TWO RUNS ARE DIFFED ROW BY ROW. On the last
// land increment the forest rows came back 170–530% apart between runs and were DROPPED rather
// than averaged. Enforcing that INSIDE the tool is the arc's end-state item 3 and is NOT this
// increment — until it lands, take two runs and diff them by hand.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GPU_TIMER_EXTENSION, acceptSamples, isInterleaved, roundRobinPlan } from './frame-cost.ts';
import { landFloorVerdict } from './land-floor.ts';
import {
  AMPLIFY_FACTOR,
  LAND_FLOOR_AMPLIFIED,
  LAND_FLOOR_ARMS,
  LAND_FLOOR_ARM_MIX,
  LAND_FLOOR_CONTROL,
  LAND_FLOOR_LAYER,
} from './land-floor-scene.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env['ST_LAND_FLOOR_URL'] ?? 'http://localhost:5217/land-floor.html';
const OUT =
  process.env['ST_LAND_FLOOR_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-land-floor-2026-09-01');

const REPEATS = Number(process.env['ST_LAND_FLOOR_REPEATS'] ?? 7);
const BATCH = Number(process.env['ST_LAND_FLOOR_BATCH'] ?? 30);

function fail(msg) {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
}

/**
 * THE VIEWS, AS (size, zoom) PAIRS — and the DEFAULT PAIR IS A MEASUREMENT, not a preference.
 *
 * A fragment cost is only meaningful where there are ground fragments, and how much of this frame
 * is ground was measured on 2026-09-01 rather than assumed (Adreno X1-85, this page, one probe):
 *
 *   one@4    3.5%      forest@2    4.4%
 *   one@8   14.1%      forest@4    5.7%
 *   one@16  41.6%      forest@8   14.2%
 *                      forest@16  42.1%
 *
 * ⚠ THE ARC'S OVERVIEW ZOOM CANNOT BE COSTED HERE, AND THAT IS A FINDING RATHER THAN A GAP. At
 * `forest@2` — `CROWD_ZOOMS`'s overview — the ground is 4.4% of the frame, under `land-floor.ts`'s
 * coverage floor, so the timing would be mostly of clearing the buffer. The run VOIDS there rather
 * than reporting a small number, which is the honest outcome: at the overview the ground is too
 * small a share of the frame for any instrument to resolve one layer's shader against it.
 *
 * So the default is the arc's OTHER established zoom (8 px/unit, the zoom the ground's own texture
 * is read at) at BOTH map sizes. Both clear the floor at ~14%, and a default invocation that voids
 * half its own views would be an instrument refusing itself out of the box.
 */
const VIEWS = (process.env['ST_LAND_FLOOR_VIEWS'] ?? 'one@8,forest@8')
  .split(',')
  .map((v) => v.trim())
  .map((v) => {
    const parts = v.split('@');
    if (parts.length !== 2) fail(`"${v}" is not a <size>@<zoom> view`);
    return { key: v, size: parts[0], zoom: Number(parts[1]) };
  });

/**
 * WHICH ARM IS THE LAYER UNDER TEST.
 *
 * ⚠ IT IS A KNOB SO THE RUNG CAN BE PROVED TO FIRE ON REAL HARDWARE, which is this arc's own
 * standard turned on itself: a threshold that cannot fail is not a threshold. Pointing it at
 * `grass-amplified` measures a DELIBERATELY EXPENSIVE material — the layer evaluated eight times
 * over — as if it were the layer, so a run can demonstrate the budget rung going RED on the same
 * box, through the same instrument, with nothing mocked. A unit test proves the arithmetic; this
 * proves the instrument.
 */
const LAYER_ARM = process.env['ST_LAND_FLOOR_LAYER_ARM'] ?? LAND_FLOOR_LAYER;

if (/:5184\b/.test(URL) && !process.env['ST_LAND_FLOOR_ALLOW_DEFAULT_PORT']) {
  fail(
    `${URL} is the harness's pinned default port, which every worktree shares.\n` +
      'Start vite on a free port and pass ST_LAND_FLOOR_URL.',
  );
}

/**
 * WHICH ANGLE BACKEND CHROMIUM IS ASKED FOR — a knob, because the right answer differs per box
 * and getting it wrong costs an hour to a refusal that names the wrong thing.
 *
 * ⚠⚠ `gl` IS THE DEFAULT because it is what every sibling driver here uses and what the RTX 2060
 * box measures under. On the primary WINDOWS box it lands on SwiftShader, which this instrument
 * then refuses by name — and that refusal is where "every art measurement needs the Mint box"
 * came from. It is a property of THE FLAG, not of the box: measured 2026-08-30, same page, same
 * commit, two launches — `gl` gives SwiftShader with NO timer query, `default` gives
 * `ANGLE (Qualcomm, Qualcomm(R) Adreno(TM) X1-85 GPU …, D3D11)` with the timer query present.
 * So pass `ST_LAND_FLOOR_ANGLE=default` to develop against a real GPU on Windows.
 *
 * ⚠ THAT IS A DEVELOPMENT ROUTE AND NOT A MEASUREMENT ROUTE. Every committed figure on this arc
 * is an RTX 2060's, and a table whose rows came off two GPUs is not a ladder.
 */
const ANGLE = process.env['ST_LAND_FLOOR_ANGLE'] ?? 'gl';

// `--use-gl=egl` FAILS SILENTLY to SwiftShader with the same flags otherwise unchanged, so the
// renderer string is what proves which of them worked — never the flag list.
const GPU_ARGS = [
  '--use-gl=angle',
  `--use-angle=${ANGLE}`,
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
if (!/the land frame floor/.test(title)) {
  await browser.close();
  fail(`${URL} served "${title}" — that is not this branch's land-floor page.`);
}

await page.waitForFunction(() => window.__stLandFloorReady === true, null, { timeout: 120_000 });

const identity = await page.evaluate(() => window.__stLandFloorIdentity());
console.log(`renderer: ${identity.renderer}`);
console.log(`vendor:   ${identity.vendor}`);
console.log(`${GPU_TIMER_EXTENSION}: ${identity.timerQuery ? 'available' : 'ABSENT'}`);

if (identity.software) {
  await browser.close();
  fail(
    `the context came up on a SOFTWARE rasteriser (${identity.renderer}) under ` +
      `--use-angle=${ANGLE}. Every figure this instrument produces is a frame time, so a software ` +
      'run is not a slower verdict — it is no verdict.\n' +
      '  On LINUX/Mint: check DISPLAY=:0 is set; without it these flags fall back to SwiftShader.\n' +
      '  On the WINDOWS dev box: this is the flag, not the box — retry with ' +
      'ST_LAND_FLOOR_ANGLE=default, which exposes the real Adreno GPU and the timer query.',
  );
}
if (!identity.timerQuery) {
  await browser.close();
  fail(
    `${GPU_TIMER_EXTENSION} is absent, so there is no GPU clock here and this instrument would be ` +
      'the one it was built to replace, with extra steps.',
  );
}

// --- coverage, once per (arm x view) ----------------------------------------------------------
// Read back BEFORE the timed sweep, and never inside it: `readPixels` stalls the pipeline, so a
// coverage read inside a timed batch would be charged to the arm's shader.
const coverage = new Map();
for (const view of VIEWS) {
  for (const arm of LAND_FLOOR_ARMS) {
    const r = await page.evaluate((spec) => window.__stLandFloor(spec), {
      arm,
      size: view.size,
      zoom: view.zoom,
      batch: 1,
      coverage: true,
    });
    coverage.set(`${arm}@${view.key}`, r.groundCoveragePct);
  }
}

// --- the interleaved sweep --------------------------------------------------------------------
//
// ROUND-ROBIN across every (arm x view), one pass at a time. NOT repeats grouped by arm: a GPU
// drifts over a run — thermal, clock and power state all move — so grouping aliases that drift
// onto the variable and whichever arm went last always looks dearest. The order is asserted
// rather than assumed.
const CONFIGS = [];
for (const view of VIEWS) {
  for (const arm of LAND_FLOOR_ARMS) {
    CONFIGS.push({ key: `${arm}@${view.key}`, arm, size: view.size, zoom: view.zoom });
  }
}
const PLAN = roundRobinPlan(CONFIGS, REPEATS);
if (!isInterleaved(PLAN, CONFIGS)) {
  await browser.close();
  fail('the sweep plan is not interleaved — a grouped sweep aliases GPU drift onto the variable');
}

console.log(
  `\nsweep: ${CONFIGS.length} configurations x ${REPEATS} interleaved repeats, ` +
    `${BATCH} renders per timed batch, views ${VIEWS.map((v) => v.key).join(' ')}, ` +
    `layer arm "${LAYER_ARM}"\n`,
);

const samples = new Map(CONFIGS.map((c) => [c.key, []]));
const meta = new Map();
for (const config of PLAN) {
  const r = await page.evaluate((spec) => window.__stLandFloor(spec), {
    arm: config.arm,
    size: config.size,
    zoom: config.zoom,
    batch: BATCH,
  });
  // `acceptSamples` reads a `TimingSample`. There is no wall-clock route on this instrument, so
  // the field it would carry is zeroed and never reported — see the page's own header.
  samples.get(config.key).push({
    gpuMsPerFrame: r.gpuMsPerFrame,
    disjoint: r.disjoint,
    wallMsPerFrame: 0,
  });
  meta.set(config.key, r);
}

await browser.close();
if (consoleErrors.length) {
  fail(`the page logged ${consoleErrors.length} error(s):\n  ${consoleErrors.join('\n  ')}`);
}

// --- judge each view on its own ----------------------------------------------------------------
const verdicts = {};
const rowsByView = {};
for (const view of VIEWS) {
  const arms = LAND_FLOOR_ARMS.map((arm) => {
    const key = `${arm}@${view.key}`;
    const accepted = acceptSamples(samples.get(key));
    const m = meta.get(key);
    return {
      label: arm,
      samples: accepted.gpu,
      triangles: m.triangles,
      drawCalls: m.drawCalls,
      octaves: m.octaves,
      software: m.software,
      hidden: m.hidden,
      timerQueryAvailable: m.timerQueryAvailable,
      groundCoveragePct: coverage.get(key) ?? null,
      discardedDisjoint: accepted.discardedDisjoint,
      discardedUnavailable: accepted.discardedUnavailable,
    };
  });
  rowsByView[view.key] = arms;
  verdicts[view.key] = landFloorVerdict({
    arms,
    controlLabel: LAND_FLOOR_CONTROL,
    layerLabel: LAYER_ARM,
    amplifiedLabel: LAND_FLOOR_AMPLIFIED,
    amplifyFactor: AMPLIFY_FACTOR,
  });
}

// --- report ------------------------------------------------------------------------------------
const lines = [];
function say(s) {
  console.log(s);
  lines.push(s);
}

say(`renderer: ${identity.renderer}`);
say(`vendor:   ${identity.vendor}`);
say(`repeats=${REPEATS}  batch=${BATCH}  layer arm="${LAYER_ARM}"`);
say('');

for (const view of VIEWS) {
  const v = verdicts[view.key];
  say(`== ${view.size} island(s) at ${view.zoom} px per ground unit ==`);
  for (const arm of rowsByView[view.key]) {
    const dropped =
      arm.discardedDisjoint + arm.discardedUnavailable > 0
        ? `  (dropped ${arm.discardedDisjoint} disjoint, ${arm.discardedUnavailable} unavailable)`
        : '';
    const mix = LAND_FLOOR_ARM_MIX[arm.label];
    say(
      `  ${arm.label.padEnd(16)} mix ${String(mix ?? '—').padEnd(6)} ` +
        `octaves ${String(arm.octaves).padStart(4)}  tris ${arm.triangles}  calls ${arm.drawCalls}  ` +
        `cover ${arm.groundCoveragePct === null ? '—' : `${arm.groundCoveragePct.toFixed(1)}%`}` +
        `  n=${arm.samples.length}${dropped}`,
    );
  }
  for (const c of v.costs) {
    const delta =
      c.deltaMs === null
        ? '(the control)'
        : c.resolved
          ? `+${c.deltaMs.toFixed(4)} ms`
          : `UNRESOLVED — under this run's ${c.noiseFloorMs.toFixed(4)} ms noise floor, so the ` +
            'cost is unknown below that and is NOT zero';
    say(
      `  ${c.label.padEnd(16)} ${c.gpuMsPerFrame.toFixed(4)} ms/frame  ` +
        `spread ${c.spreadMs.toFixed(4)}  ${delta}`,
    );
  }
  say(`  rung: ${v.rung}   status: ${v.status}`);
  say(`  ${v.prose}`);
  for (const u of v.unverified) say(`    UNVERIFIED: ${u}`);
  for (const f of v.failures) say(`    FAILURE: ${f}`);
  say('');
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'land-floor-report.txt'), `${lines.join('\n')}\n`, 'utf8');
writeFileSync(
  join(OUT, 'land-floor-measurements.json'),
  `${JSON.stringify(
    {
      identity,
      views: VIEWS,
      layerArm: LAYER_ARM,
      repeats: REPEATS,
      batch: BATCH,
      rowsByView,
      verdicts,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log(`report: ${join(OUT, 'land-floor-report.txt')}`);

// EXIT CODES. UNVERIFIED is a verdict about the MEASUREMENT and OUTRANKS a fail: a number already
// declared meaningless cannot fail a run either, and must never be read as a pass. A FAIL exits 3
// so a caller can tell "the instrument refused to measure" from "the layer is unaffordable".
for (const view of VIEWS) {
  if (verdicts[view.key].status === 'UNVERIFIED') process.exit(1);
}
for (const view of VIEWS) {
  if (verdicts[view.key].status === 'FAIL') process.exit(3);
}
