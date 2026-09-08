#!/usr/bin/env node
// measure-land-view.mjs — WHERE THE LAND VIEW'S TIME ACTUALLY GOES, on the REAL forest, in the app.
//
//   pnpm --filter studio measure:land-view --url http://127.0.0.1:5479 --output ../../docs/research/<dir>
//
// The owner signed the look and reported two things in one sentence — it takes a while to load, and
// it is a little laggy once up — plus a cause he explicitly marked as a guess. The increment
// `the-land-view-loads-and-runs-fast-enough` says to measure before curing. This collects; the
// deciding is `src/lib/landViewProfile.ts`, which is pure and unit-tested.
//
// ⚠⚠ IT MEASURES THE APP, NOT A HARNESS PAGE, and that is the increment's own instruction. Every
// frame-cost figure on the land arcs so far was taken on one island or on a synthetic 35-island
// stand-in that is 3.2x too wide; none of them describes this.
//
// ⚠⚠ IT REFUSES A SOFTWARE RASTERISER. A land view profiled on SwiftShader would report a GPU cost
// that belongs to a CPU, and the whole question is which stage dominates. Put DISPLAY=:0 in the
// environment on this box.
//
// ⚠ THE MEASURED ARM IS VITE DEV, DELIBERATELY, because that is what the owner ran when he reported
// the lag. Dev keeps real module paths, which is also what lets the attribution name a package
// rather than a minified chunk. A production build is a DIFFERENT question and this says so in its
// own report rather than quietly answering it.
//
// ⚠ A SHELL ON PURPOSE (`.mjs`, not typechecked), like the measure scripts beside it: it drives a
// browser and writes files, and it DECIDES NOTHING — every number it prints comes from the pure
// module, and a run that collected nothing refuses there rather than reporting a zero.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

import {
  FRAME_BUDGET_MS,
  busyMs,
  cpuSplitIsReportable,
  frameCost,
  networkSplit,
  rankedStages,
  stageSplit,
} from '../src/lib/landViewProfile.ts';

const VIEWPORT = { width: 1600, height: 1000 };
/** How long to watch the steady state once the land has drawn. Long enough that a stall rarer than
 *  one in twenty frames is still visible in `worstMs`/`overBudget` — see the p95 note in the pure
 *  module's tests, which pins why a percentile alone would miss it. */
const STEADY_MS = 6000;
/** ⚠⚠ THE SETTLE IS MEASURED, NOT ASSUMED, AND THE MEASUREMENT IS ITSELF THE ANSWER TO "TAKES A
 *  WHILE TO LOAD". Two earlier runs of this instrument used a fixed wait — first none, then 5 s —
 *  and BOTH charged the tail of the load to the steady state: the "idle" arm came back at 417 ms a
 *  frame with a single 3.8 s stall inside it, while the arm taken six seconds later ran at a clean
 *  16.7 ms. Same page, same scene, different moment. So the page is watched in one-second windows
 *  until one of them is quiet, and how long that took is reported as a figure rather than spent as
 *  a constant. The variable is TIME — the same lesson `settleFrames` carries (ADR-0553), met here
 *  from the other side. */
const SETTLE_WINDOW_MS = 1000;
// ⚠ 1.25 BUDGETS AND TWO CONSECUTIVE WINDOWS, both measured corrections. At two budgets (33.3 ms)
// the map-alone arm slipped under the bar at 33.3 exactly, was declared settled 4.8 s in, and then
// ran the next six seconds at 83 ms a frame — which would have been published as "the SVG map is
// janky and the land view is smooth" off a bar it had marginally cleared. One window is not a
// settle, for the same reason one readback is not a settled frame (`settleFrames`, ADR-0553).
const SETTLE_QUIET_MS = 1.25 * (1000 / 60);
const SETTLE_QUIET_WINDOWS = 2;
const SETTLE_GIVE_UP_MS = 60000;
/** The frames-per-second a blank page reaches in THIS browser, measured every run as the floor.
 *  Without it, "the land view runs at 2.7 fps" is indistinguishable from "headless throttles rAF",
 *  which is the reading a reviewer will reach for first and which would be free to believe. */
const FLOOR_MS = 3000;

/**
 * WATCH UNTIL THE PAGE IS QUIET, and say how long that took.
 *
 * ⚠ IT REPORTS `settled: false` RATHER THAN THROWING when the page never goes quiet. A view that is
 * permanently busy is a real answer to this increment's question and must reach the report, not
 * become a crash; the arm that follows is then labelled as taken on a page still working.
 */
async function settle(target, label) {
  const startedAt = Date.now();
  let quiet = 0;
  for (;;) {
    const window = frameCost(await target.evaluate(watchFrames, SETTLE_WINDOW_MS));
    const waitedMs = Date.now() - startedAt;
    quiet = window.medianMs <= SETTLE_QUIET_MS ? quiet + 1 : 0;
    if (quiet >= SETTLE_QUIET_WINDOWS) return { settled: true, waitedMs, windowMedianMs: window.medianMs };
    if (waitedMs >= SETTLE_GIVE_UP_MS) {
      console.warn(`measure-land-view — ${label} never went quiet within ${SETTLE_GIVE_UP_MS} ms`);
      return { settled: false, waitedMs, windowMedianMs: window.medianMs };
    }
  }
}

/** Watch `requestAnimationFrame` for `ms` and return the deltas, as a page function. */
const watchFrames = (ms) =>
  new Promise((done) => {
    const deltas = [];
    let previous = null;
    const stopAt = performance.now() + ms;
    const step = (t) => {
      if (previous !== null) deltas.push(t - previous);
      previous = t;
      if (t < stopAt) requestAnimationFrame(step);
      else done(deltas);
    };
    requestAnimationFrame(step);
  });

function readArgs(argv) {
  const values = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (!arg?.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    values.set(arg.slice(2), value);
    i += 1;
  }
  for (const required of ['url', 'output']) {
    if (!values.has(required)) throw new Error(`--${required} is required`);
  }
  return {
    base: new URL(values.get('url')),
    output: resolve(values.get('output')),
    allowSoftware: values.get('allow-software') === '1',
  };
}

const fail = (why) => {
  console.error(`measure-land-view — REFUSED: ${why}`);
  process.exit(1);
};

/** ⚠ THE FLAG GOES ON THE REAL QUERY STRING, BEFORE THE HASH. The studio routes on the hash and its
 *  flag readers read `window.location.search`, so `#/tree?landView=1` mounts nothing at all. */
function landViewUrl(base, on) {
  const url = new URL(base.href);
  if (on) url.searchParams.set('landView', '1');
  url.hash = '/tree';
  return url.href;
}

const args = readArgs(process.argv.slice(2));
await mkdir(args.output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=gl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: VIEWPORT });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
// 1 kHz: fine enough that a 10 ms stage is ten samples rather than one, and coarse enough that the
// profiler's own overhead is not the thing being measured.
await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });

const started = Date.now();
await cdp.send('Profiler.start');
await page.goto(landViewUrl(args.base, true), { waitUntil: 'domcontentloaded', timeout: 300000 });

// WAIT FOR THE LAND TO ACTUALLY BE THERE — a mounted canvas that renders nothing looks exactly like
// a working one, so the wait is for a canvas with real dimensions inside the land panel and not for
// the panel itself.
await page
  .waitForFunction(
    () => {
      const panel = document.querySelector('[data-testid="land-view"]');
      const canvas = panel?.querySelector('canvas');
      return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
    },
    null,
    { timeout: 300000 },
  )
  .catch(() => fail('the land view never produced a sized canvas — nothing was measured'));
const drawnAtMs = Date.now() - started;

const { profile } = await cdp.send('Profiler.stop');
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const renderer = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') ?? c.getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  const name = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  return { name, software: /swiftshader|llvmpipe|software/i.test(name) };
});
if (renderer.software && !args.allowSoftware) {
  fail(
    `the renderer is a software rasteriser (${renderer.name}) — put DISPLAY=:0 in the environment, ` +
      'or --allow-software 1 to take the CPU numbers anyway and do NOT quote a GPU cost from them',
  );
}

// THE HARNESS'S OWN FLOOR, in this same browser — the control that makes every frame figure below
// mean something. A blank page here reaches 60 Hz; if it did not, nothing else in section 4 would
// be about the studio.
const floorPage = await browser.newPage({ viewport: VIEWPORT });
await floorPage.goto('about:blank');
const floor = frameCost(await floorPage.evaluate(watchFrames, FLOOR_MS));
await floorPage.close();
if (floor.medianMs > 2 * FRAME_BUDGET_MS) {
  fail(
    `a blank page in this browser draws at ${floor.medianMs.toFixed(1)} ms per frame — the harness ` +
      'itself is throttled, so no frame figure taken here would be about the studio',
  );
}

// ⚠ SETTLE FIRST, AND MEASURE THE SETTLE. The land view is "up" the moment its canvas has a size
// and is still working long after; watching immediately charges the tail of the LOAD to the steady
// state. How long it takes to go quiet is the honest reading of "takes a while to load" — longer
// than "time to first canvas", and the number a viewer actually experiences.
const landSettle = await settle(page, 'the land view');
const idleDeltas = await page.evaluate(watchFrames, STEADY_MS);

// AND UNDER A DRAG, because the studio's own map pans and that is when a viewer meets the cost.
//
// ⚠⚠ THROUGH `page.mouse`, NOT `dispatchEvent`. A synthetic PointerEvent is untrusted and does not
// engage pointer capture, so an earlier version of this arm produced a perfectly smooth 16.7 ms
// median with a `worst` equal to its median — a drag arm that dragged nothing, and it reads exactly
// like good news. The watcher is started WITHOUT awaiting so the mouse can move while it counts.
// ⚠ AN ELEMENT SCREENSHOT, NOT `toDataURL`. A WebGL canvas without `preserveDrawingBuffer` hands
// back a BLANK image outside its own render tick, so a `toDataURL` comparison reads "nothing moved"
// on every run — including runs where everything moved. It said exactly that on the first attempt.
const dragCanvas = await page.$('[data-testid="land-view"] canvas');
if (dragCanvas === null) fail('the land canvas vanished before the drag arm');
const dragShotBefore = await dragCanvas.screenshot();
const dragWatch = page.evaluate(watchFrames, STEADY_MS);
const dragBox = await page.evaluate(() => {
  const c = document.querySelector('[data-testid="land-view"] canvas');
  if (!(c instanceof HTMLCanvasElement)) return null;
  const b = c.getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
});
if (dragBox === null) fail('the land canvas vanished before the drag arm');
const cx = dragBox.x + dragBox.w / 2;
const cy = dragBox.y + dragBox.h / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
const dragUntil = Date.now() + STEADY_MS;
for (let i = 0; Date.now() < dragUntil; i += 1) {
  const k = ((i * 7) % 200) - 100;
  await page.mouse.move(cx + k, cy + k / 2);
}
await page.mouse.up();
const dragDeltas = await dragWatch;
// ⚠⚠ DID THE DRAG DRAG? A drag arm that moved nothing returns a flawless 16.7 ms median with
// `worst` equal to it, which reads as "panning is free" and is the single most flattering thing
// this instrument could report by accident. So the canvas is photographed either side and the arm
// is REFUSED if the pixels did not move — the same non-vacuity the ground-truth arms carry.
const dragMoved = !(await dragCanvas.screenshot()).equals(dragShotBefore);
if (!dragMoved) {
  fail(
    'the drag arm moved no pixels — the pointer never reached the controls, so its frame cost is ' +
      'about a still scene and must not be reported as the cost of panning',
  );
}

const resources = await page.evaluate(() =>
  performance
    .getEntriesByType('resource')
    .map((e) => ({ name: e.name, durationMs: e.duration, transferSizeBytes: e.transferSize ?? 0 })),
);
// ⚠ CLOSED BEFORE THE CONTROL OPENS. Two live pages means the hidden one's rAF is throttled, and
// whichever arm was measured second would come back slower for a reason that is not the studio's.
await page.close();

// THE CONTROL ARM: the same route with the flag OFF. Without it, every figure above is "what the
// studio costs", not "what the LAND VIEW costs" — the store payload and React are paid either way.
const control = await browser.newPage({ viewport: VIEWPORT });
const controlStarted = Date.now();
await control.goto(landViewUrl(args.base, false), { waitUntil: 'domcontentloaded', timeout: 300000 });
await control
  .waitForFunction(() => document.querySelectorAll('svg').length > 0 && document.querySelector('[data-testid="land-view"]') === null, null, { timeout: 300000 })
  .catch(() => fail('the control arm never drew the map without the land view'));
const controlDrawnAtMs = Date.now() - controlStarted;
const controlSettle = await settle(control, 'the map alone');
const controlIdle = await control.evaluate(watchFrames, STEADY_MS);
await control.close();

await browser.close();

// ---- the deciding, all of it in the pure module
const split = stageSplit(profile);
const net = networkSplit(resources);
const idle = frameCost(idleDeltas);
const drag = frameCost(dragDeltas);
const controlIdleCost = frameCost(controlIdle);

const measurements = {
  measuredAt: new Date().toISOString(),
  url: args.base.href,
  arm: 'vite dev — the build the owner ran when he reported the lag',
  renderer,
  viewport: VIEWPORT,
  load: {
    landViewDrawnAtMs: drawnAtMs,
    mapOnlyDrawnAtMs: controlDrawnAtMs,
    landViewSettle: landSettle,
    mapOnlySettle: controlSettle,
  },
  cpu: { totalMs: split.totalMs, byStage: split.byStage, ranked: rankedStages(split) },
  network: net,
  // ⚠ EVERY `/api/` ROW VERBATIM, because `transferSize` UNDER-REPORTS and the summary above
  // inherits it: the dev arm reported 0.07 MB of API traffic where the server actually sent 37.2
  // MiB. The rows are kept so a reader can see WHICH call dominates rather than a total that may
  // be wrong, and the report says to confirm a byte figure with `curl` against the server.
  apiRequests: resources
    .filter((e) => e.name.includes('/api/'))
    .map((e) => ({ path: new URL(e.name).pathname, durationMs: Math.round(e.durationMs), transferSizeBytes: e.transferSizeBytes }))
    .sort((a, b) => b.transferSizeBytes - a.transferSizeBytes),
  frames: { harnessFloor: floor, idle, drag, controlIdle: controlIdleCost, budgetMs: FRAME_BUDGET_MS },
};
await writeFile(`${args.output}/measurements.json`, `${JSON.stringify(measurements, null, 2)}\n`);

const ms = (n) => `${n.toFixed(1)} ms`;
const measurementsApiLines = (list) =>
  list
    .filter((e) => e.name.includes('/api/'))
    .sort((a, b) => b.transferSizeBytes - a.transferSizeBytes)
    .slice(0, 8)
    .map((e) => `     ${String(Math.round(e.transferSizeBytes / 1024)).padStart(7)} kB  ${String(Math.round(e.durationMs)).padStart(6)} ms  ${new URL(e.name).pathname}`);
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const lines = [
  "THE LAND VIEW'S LOAD AND FRAME COST, on the real forest, in the studio",
  `measured  ${measurements.measuredAt}`,
  `renderer  ${renderer.name} (software=${renderer.software})`,
  `arm       ${measurements.arm}`,
  '',
  '1. TIME TO THE LAND BEING ON SCREEN',
  `   with the land view   ${drawnAtMs} ms`,
  `   the map alone        ${controlDrawnAtMs} ms   <- the control: what a member pays without the flag`,
  `   the land view's own  ${drawnAtMs - controlDrawnAtMs} ms`,
  '',
  '   AND THE HONEST READING OF "TAKES A WHILE" — a canvas with a size is not a page that has',
  '   finished. Time from there until a whole second of frames comes in under two budgets:',
  `   land view  +${landSettle.waitedMs} ms${landSettle.settled ? '' : '  (NEVER WENT QUIET — every figure below was taken on a page still working)'}`,
  `   map alone  +${controlSettle.waitedMs} ms${controlSettle.settled ? '' : '  (NEVER WENT QUIET)'}`,
  `   so a viewer waits ${((drawnAtMs + landSettle.waitedMs) / 1000).toFixed(1)} s for a land view that has stopped moving,`,
  `   against ${((controlDrawnAtMs + controlSettle.waitedMs) / 1000).toFixed(1)} s for the map alone.`,
  '',
  `2. WHERE THE CPU WENT — self time, ${ms(split.totalMs)} sampled (${ms(busyMs(split))} of it BUSY),`,
  '   shares against the WHOLE, waiting included',
  ...(cpuSplitIsReportable(split)
    ? [
        ...rankedStages(split).map((r) => `   ${r.stage.padEnd(18)} ${ms(r.ms).padStart(10)}  ${r.share.toFixed(1)}%`),
        '   ⚠ `unattributed` is anything with no module url that is not idle or GC. It is reported',
        '     rather than divided out; a split that cannot say what it missed is not a split.',
      ]
    : [
        '   WITHHELD — this arm`s module names carry no package path (a production build`s chunks are',
        '   minified), so the attribution placed almost none of the busy time and every stage would',
        '   print 0.0 ms. That table reads like "no stage costs anything" and would be the most',
        '   misleading thing here. The CPU question is answered on the DEV arm; this arm answers the',
        '   load and the frames.',
      ]),
  '',
  '   EVERY /api/ CALL, largest first — ⚠ `transferSize` UNDER-REPORTS (the dev arm read 0.07 MB',
  '   where the server sent 37.2 MiB), so confirm any byte figure with curl against the server:',
  ...measurementsApiLines(resources),
  '',
  '3. WHAT THE NETWORK COST — per request, and they OVERLAP, so these do not sum to a timeline',
  `   store payload (/api/)   ${ms(net.storePayloadMs)}  ${mb(net.storePayloadBytes)}   <- the map pays this too`,
  `   the canvas + the kit    ${ms(net.canvasChunkMs)}  ${mb(net.canvasChunkBytes)}   <- only a land-view viewer pays this`,
  `   everything else         ${ms(net.otherMs)}  ${mb(net.otherBytes)}`,
  '',
  `4. FRAME COST ONCE IT HAS SETTLED — 60 Hz budget is ${FRAME_BUDGET_MS.toFixed(1)} ms`,
  `   HARNESS FLOOR      median ${ms(floor.medianMs)} over ${floor.frames} frames on about:blank — the control that makes the rest mean something`,
  `   idle, land view    median ${ms(idle.medianMs)}  p95 ${ms(idle.p95Ms)}  worst ${ms(idle.worstMs)}  late ${idle.late}/${idle.frames}`,
  `   idle, map alone    median ${ms(controlIdleCost.medianMs)}  p95 ${ms(controlIdleCost.p95Ms)}  worst ${ms(controlIdleCost.worstMs)}  late ${controlIdleCost.late}/${controlIdleCost.frames}`,
  `   under a drag       median ${ms(drag.medianMs)}  p95 ${ms(drag.p95Ms)}  worst ${ms(drag.worstMs)}  late ${drag.late}/${drag.frames}`,
  `   "late" is over ${(1.5 * FRAME_BUDGET_MS).toFixed(1)} ms — rAF reports an ON-TIME 60 Hz frame as 16.7 ms, so a strict`,
  '   comparison against the 16.667 budget calls every healthy frame late (it did, 216 of 360).',
  '   ⚠ READ `worst` AND `over budget`, NOT ONLY THE PERCENTILE: with sixty frames p95 sits at the',
  '     57th, so a stall rarer than four frames in sixty is invisible to it by construction.',
  '',
  'IT DECIDES NOTHING. This is the split the increment asked for before any cure is chosen.',
];
const report = `${lines.join('\n')}\n`;
await writeFile(`${args.output}/report.txt`, report);
console.log(report);
console.log(`→ ${args.output}`);
