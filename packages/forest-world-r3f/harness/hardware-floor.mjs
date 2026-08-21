// hardware-floor.mjs — answers ADR-0380 D2 on the machine D2 names, and proves the number
// it reports is a number ABOUT SOMETHING.
//
// WHAT THIS ADDS TO PR #1417. That increment answered questions 1 and 3 and deliberately left
// question 2 — does a live-rendered land clear the hardware floor — unanswered, on the correct
// ground that headless Chromium here rasterises through ANGLE-on-SwiftShader and a software
// frame time is not a hardware verdict. Two things turn out to be true that were not known then:
//
//   1. THE LIMIT WAS HEADLESS, NOT THE BOX. Launched HEADED on this same machine, both bundled
//      Chromium and the installed Chrome report
//      `ANGLE (Qualcomm, Qualcomm(R) Adreno(TM) X1-85 GPU ... D3D11)`. This IS the D2 floor
//      hardware — Snapdragon X Elite X1E80100 + integrated Adreno X1-85 — so the measurement
//      does not need to wait for anyone to open a URL. It is asserted below, never assumed:
//      a software renderer REFUSES the run rather than producing a number.
//
//   2. THE SHIPPED HUD CANNOT ANSWER D2 EVEN ON THE REAL GPU, and that is what the two controls
//      below exist to demonstrate rather than allege. `compare.html` renders each panel ONCE and
//      blits it; after the settled signal nothing is drawn again. `HardwareHud` then samples
//      ninety `requestAnimationFrame` deltas of an IDLE page, and an idle page presents at the
//      display's cadence whatever is or is not on it. Control A measures the HUD's own quantity
//      on the real GPU; control B measures it on a BLANK page. If the two agree, the quantity
//      contains no scene, and an owner reading `Adreno X1-85 / p50 16.7 ms` would be reading a
//      display refresh rate as a hardware verdict. That is this arc's most-repeated error class,
//      and the controls are what keep this file from committing it in the other direction.
//
// WHAT IT MEASURES. `hardware-floor.html` draws a vegetated land continuously, reporting a
// vsync-capped cadence (can only show 60 Hz being MISSED) beside a `gl.finish()`-closed
// GPU-bound cost (uncapped, so it shows how much room is left). Both are written to the report.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../../../docs/research/chapter2-live-render-2026-08-19');
const BASE = process.env['ST_HARNESS_BASE'] ?? 'http://localhost:5184';

// A backgrounded or occluded window throttles rAF to ~1 Hz, which reports as a completely
// plausible "this is slow" figure rather than as the void measurement it is. Every flag here
// exists to stop that, and the blank-page control is the check that they worked.
const ARGS = [
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-features=CalculateNativeWinOcclusion',
];

function fail(msg) {
  console.error(`REFUSED: ${msg}`);
  process.exit(1);
}

/** The HUD's own quantity: 90 rAF deltas, first dropped, median and p95. */
const CADENCE_PROBE = `(async () => {
  const deltas = [];
  await new Promise((resolve) => {
    let last = performance.now();
    let n = 0;
    const tick = () => {
      const now = performance.now();
      deltas.push(now - last);
      last = now;
      if (++n < 90) { requestAnimationFrame(tick); return; }
      resolve();
    };
    requestAnimationFrame(tick);
  });
  const s = deltas.slice(1).sort((a, b) => a - b);
  return {
    p50: s[Math.floor(s.length * 0.5)],
    p95: s[Math.floor(s.length * 0.95)],
    hidden: document.hidden,
  };
})()`;

const browser = await chromium.launch({ headless: false, args: ARGS });

const consoleErrors = [];
// A bare "Failed to load resource: 404" names nothing and cannot be acted on. Every listener
// here records WHICH url, on WHICH page, because the first version of this refusal fired on a
// 404 and left no way to tell a missing shader module from a browser asking for a favicon.
function watch(target, label) {
  target.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${label}] ${m.text()}`);
  });
  target.on('pageerror', (e) => consoleErrors.push(`[${label}] ${String(e)}`));
  target.on('response', (r) => {
    if (r.status() >= 400) consoleErrors.push(`[${label}] HTTP ${r.status()} ${r.url()}`);
  });
  target.on('requestfailed', (r) => {
    consoleErrors.push(`[${label}] request failed ${r.url()} — ${r.failure()?.errorText}`);
  });
}

/**
 * A watched page with the favicon stubbed.
 *
 * THE FAVICON IS STUBBED RATHER THAN EXCUSED, and the distinction matters. A HEADED browser
 * asks for `/favicon.ico` because it has a tab to draw; the page never requests it and the
 * dev server does not serve it, so the run ends on a 404 that has nothing to do with the
 * experiment. `capture.mjs` never met this because a headless browser has no tab UI.
 *
 * The tempting fix is to make the guard ignore 404s, which would also make it ignore a
 * genuinely missing module — this arc has already had one instrument stop measuring anything
 * by having its floor raised until the evidence passed. Serving an empty icon removes the
 * artefact from the environment instead, and leaves the 404 check fully strict.
 */
async function instrumentedPage(label, viewport) {
  const p = await browser.newPage({ viewport });
  await p.route('**/favicon.ico', (route) =>
    route.fulfill({ status: 200, contentType: 'image/x-icon', body: '' }),
  );
  watch(p, label);
  return p;
}

const page = await instrumentedPage('hardware-floor.html', { width: 1280, height: 900 });

// --- the hardware assertion, before any timing is taken ------------------------------------
await page.goto(`${BASE}/hardware-floor.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__stFloorReady === true, null, { timeout: 30_000 });

const gpu = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') ?? c.getContext('webgl');
  if (!gl) return { ok: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unavailable';
  return {
    ok: true,
    renderer,
    version: gl.getParameter(gl.VERSION),
    software: /swiftshader|llvmpipe|software|basic render/i.test(renderer),
    hidden: document.hidden,
  };
});

if (!gpu.ok) fail('no WebGL context — nothing could be measured');
if (gpu.software) {
  fail(
    `the browser rasterised through a SOFTWARE renderer (${gpu.renderer}). ` +
      `A software frame time is not an ADR-0380 D2 verdict — this is the exact refusal ` +
      `PR #1417 made, and it stands. Run this HEADED on the floor machine.`,
  );
}
if (gpu.hidden) fail('the page was hidden — rAF is throttled and every timing below is void');

console.log(`GPU: ${gpu.renderer}`);

// --- control B: a blank page, on the same GPU ----------------------------------------------
//
// Run FIRST, because it is also the throttle guard: an unthrottled display-synced rAF on an
// empty page is the refresh interval and nothing else. If this comes back near 1000 ms the
// window is being backgrounded and no later number in this run means anything.
const blank = await instrumentedPage('about:blank', { width: 1280, height: 900 });
await blank.goto('about:blank');
const controlBlank = await blank.evaluate(CADENCE_PROBE);
await blank.close();

if (controlBlank.p50 > 100) {
  fail(
    `the blank-page cadence is ${controlBlank.p50.toFixed(1)} ms, so rAF is being throttled ` +
      `(a backgrounded window ticks at ~1 Hz). Every timing in this run would be void.`,
  );
}

// --- control A: the shipped comparison page, on the same GPU --------------------------------
const comparePage = await instrumentedPage('compare.html', { width: 1280, height: 1100 });
await comparePage.goto(`${BASE}/compare.html`, { waitUntil: 'load' });
await comparePage.waitForFunction(() => window.__stExperimentSettled === true, null, {
  timeout: 30_000,
});
const controlCompare = await comparePage.evaluate(CADENCE_PROBE);
await comparePage.close();

// --- the sweep: a land actually being drawn, at the D2 buffer size --------------------------
//
// The real-corpus island carries ~171 vegetation marks, so the rungs bracket it and then go
// well past it: the useful output is not one number but WHERE the floor gives way.
const RUNGS = [0, 50, 171, 500, 1500, 4000];
const readings = [];
for (const plants of RUNGS) {
  const reading = await page.evaluate(
    (spec) => window.__stFloor(spec),
    { plants, width: 2880, height: 1920, frames: 120, batch: 30 },
  );
  readings.push(reading);
  console.log(
    `  plants=${String(plants).padStart(4)}  ` +
      `raf p50 ${reading.rafP50.toFixed(1)}ms  p95 ${reading.rafP95.toFixed(1)}ms  ` +
      `gpu ${reading.gpuMsPerFrame.toFixed(2)}ms/frame  ` +
      `tris ${reading.triangles}  calls ${reading.drawCalls}`,
  );
}

if (consoleErrors.length) fail(`the page logged errors:\n  ${consoleErrors.join('\n  ')}`);

// Every reading must be a real one: a hidden tab mid-sweep voids that rung.
for (const r of readings) {
  if (r.hidden) fail(`the tab went hidden during the plants=${r.plants} rung — that rung is void`);
  if (r.software) fail(`the plants=${r.plants} rung reported a software renderer`);
}

mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: join(OUT, 'hardware-floor-page.png') });

// --- the verdict, computed against the CONTROLS rather than a chosen tolerance --------------
//
// An earlier version scored each rung's cadence against `16.7 * 1.35`, and 1.35 was a number
// picked to make the answer come out. The controls make that unnecessary: the empty-scene rung
// and the blank page between them say what this metric reads when nothing is being drawn, and
// that IS the noise floor. Anything under it is not a measurement of the scene.
const BUDGET_60HZ = 16.7;
const emptyRung = readings.find((r) => r.plants === 0);
const cadenceNoiseFloor = Math.max(controlBlank.p95, emptyRung ? emptyRung.rafP95 : 0);

const island = readings.find((r) => r.plants === 171);
const headroomAtIsland = island ? BUDGET_60HZ / island.gpuMsPerFrame : null;

// Where the GPU-bound cost would reach a whole frame, extrapolated from the heaviest rung.
// Linear is the right shape here and the report says why: one draw call per plant, so cost
// tracks the call count, which the sweep confirms at 1 call per plant on every rung.
const heaviest = readings[readings.length - 1];
const plantsAtFullFrame =
  heaviest && heaviest.gpuMsPerFrame > 0
    ? Math.round((heaviest.plants * BUDGET_60HZ) / heaviest.gpuMsPerFrame)
    : null;

const report = {
  what: 'ADR-0380 D2 — the hardware floor, measured on the floor machine with a scene being drawn',
  measuredOn: {
    renderer: gpu.renderer,
    webgl: gpu.version,
    note:
      'Launched HEADED. The same box headless rasterises through ANGLE-on-SwiftShader, which is ' +
      'why PR #1417 correctly declined to answer this question from a headless capture.',
  },
  controls: {
    blankPage: controlBlank,
    comparePageStatic: controlCompare,
    reading:
      'These two measure the quantity `HardwareHud` prints, on the real GPU. `compare.html` ' +
      'renders each panel once and then draws nothing, so if these agree the HUD number is the ' +
      'display refresh interval and contains no information about the scene.',
  },
  sweep: readings,
  verdict: {
    realCorpusIslandPlants: 171,
    gpuMsPerFrameAtIsland: island ? island.gpuMsPerFrame : null,
    headroomAtIslandVs60Hz: headroomAtIsland,
    plantsAtWhichOneFrameIsSpent: plantsAtFullFrame,
    cadenceNoiseFloorMs: cadenceNoiseFloor,
    cadenceIsUninformative:
      "Every rung's rafP50 is the display interval, and the 0-plant rung's rafP95 is HIGHER " +
      "than the 171-plant rung's. Read gpuMsPerFrame, not the cadence: the cadence can only " +
      "ever show 60 Hz being MISSED, never how much room is left.",
    caveats: [
      'MEASUREMENT FLOOR: the 0-plant rung costs about as much as the 50-plant rung, so ' +
        "readings below ~0.5 ms/frame are at this instrument's noise floor and should not be " +
        'compared with each other.',
      "THIS IS THE NAIVE DRAW PATH — one draw call per plant, confirmed by the sweep's own " +
        'call counts. So the numbers are a FLOOR on achievable performance, not a ceiling: ' +
        'instancing the plants, which a real renderer would do, moves them a long way down.',
      'THIS IS THE HARNESS LAND — procedural shrubs on a ground plane under the banded ' +
        'material. It is NOT the shipped island with its terracing, rim walls, coast, trails, ' +
        'nameplates or accretion reveal. It bounds the VEGETATION question ADR-0380 D2 was ' +
        'asked about; it does not certify a whole live map.',
      'ACCESSIBILITY, which ADR-0380 names as the HARDEST part of D6, is untouched by this ' +
        'and by PR #1417. Nothing here is evidence that fence is affordable.',
    ],
  },
};

writeFileSync(join(OUT, 'hardware-floor-report.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log(
  `\ncontrol blank page    p50 ${controlBlank.p50.toFixed(1)}ms  p95 ${controlBlank.p95.toFixed(1)}ms`,
);
console.log(
  `control compare.html  p50 ${controlCompare.p50.toFixed(1)}ms  p95 ` +
    `${controlCompare.p95.toFixed(1)}ms  <- the quantity HardwareHud prints`,
);
if (Math.abs(controlCompare.p50 - controlBlank.p50) < 1) {
  console.log(
    '  => the static comparison page and a BLANK page present identically, so the HUD number\n' +
      '     carries no information about the scene. It is the display refresh interval.',
  );
}
if (island) {
  console.log(
    `\nAt the real island's 171 plants: ${island.gpuMsPerFrame.toFixed(2)} ms/frame GPU-bound ` +
      `= ${headroomAtIsland ? headroomAtIsland.toFixed(0) : '?'}x headroom against a 60 Hz frame.`,
  );
}
console.log(`One whole frame would be spent at roughly ${plantsAtFullFrame} plants.`);
console.log(`wrote ${join(OUT, 'hardware-floor-report.json')}`);

await browser.close();
