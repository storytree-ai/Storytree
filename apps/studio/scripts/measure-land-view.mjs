#!/usr/bin/env node
// measure-land-view.mjs — WHERE THE LAND VIEW'S TIME ACTUALLY GOES, on the REAL forest, in the app.
//
//   pnpm --filter studio measure:land-view --url http://127.0.0.1:<port> --output <dir> \
//     --arm "<which build, on which machine>" [--angle gl|default] [--sourcemaps 1] [--keep-profiles 1]
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
// ⚠⚠ IT PROFILES THE WHOLE WAIT, IN PHASES. Its first version stopped the CPU profile the moment the
// canvas had a size — and on the production arm 25.9 of the 32.5 seconds came AFTER that, so the
// largest part of the wait was never attributed. Phase A is navigation to a sized canvas; phase B is
// from there until the page goes quiet; phase C is a long idle window sized off the studio's own poll
// and clock-tick cadences, because a cost that recurs on a thirty-second poll is invisible to a
// six-second window by construction. The map-alone control is profiled in the same phases, so the
// land view is charged only for what it adds.
//
// ⚠⚠ IT REFUSES A SOFTWARE RASTERISER. A land view profiled on SwiftShader would report a GPU cost
// that belongs to a CPU. On the Linux RTX box put DISPLAY=:0 in the environment; on the Windows box
// pass `--angle default`, because `gl` lands on SwiftShader there.
//
// ⚠ THE ARM IS NAMED BY WHOEVER RUNS IT, AND THE NAME IS REQUIRED. The first version wrote a constant
// "vite dev" label into every report, its production one included. Dev is what the owner ran;
// production is what a member gets. Dev's CPU figures are inflated twice over — hundreds of unbundled
// modules, and React StrictMode running `LandView`'s body, where its land stream is computed, twice
// per render — so the CPU split is read off a production build attributed through its own source
// maps (`vite build --sourcemap`, then `--sourcemaps 1` here).
//
// ⚠ THE FLOOR IS TAKEN FIRST, on a page of its own before either arm. The first version opened it
// while the land view was still loading, which hid the land page for three seconds its settle then
// did not count.
//
// ⚠ A SHELL ON PURPOSE (`.mjs`, not typechecked), like the measure scripts beside it: it drives a
// browser and writes files, and it DECIDES NOTHING — every number it prints comes from the pure
// module, and a run that collected nothing refuses there rather than reporting a zero.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

import {
  FRAME_BUDGET_MS,
  LATE_FRAME_MS,
  bursts,
  busyMs,
  cpuSplitIsReportable,
  frameCost,
  lateFrameClusters,
  locatorFromSourceMaps,
  moduleSplit,
  networkSplit,
  rankedStages,
  sourceLocator,
  stageDelta,
  stageSplit,
  sumSplits,
} from '../src/lib/landViewProfile.ts';
import { AGE_TICK_MS, SLOW_POLL_MS } from '../src/lib/poll.ts';

const VIEWPORT = { width: 1600, height: 1000 };
/** How long to watch the steady state once the land has drawn — the first version's six seconds,
 *  unprofiled, so these rows stay comparable with its figures. */
const STEADY_MS = 6000;
/** ⚠ PHASE C IS DERIVED FROM THE STUDIO'S OWN CADENCES, NOT CHOSEN. Two slow polls and one clock tick,
 *  plus a margin: long enough that anything the studio does on a timer happens inside it at least
 *  once, so "no stall was seen" cannot mean "no timer fired". */
const LONG_IDLE_MS = Math.max(2 * SLOW_POLL_MS, AGE_TICK_MS) + 5000;
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
/** Raised from the first version's sixty seconds: the acceptance-floor laptop is slower than the RTX
 *  box, and a settle that gives up reports "never went quiet" where a figure was available. */
const SETTLE_GIVE_UP_MS = 180000;
/** The frames-per-second a blank page reaches in THIS browser, measured every run as the floor.
 *  Without it, "the land view runs at 2.7 fps" is indistinguishable from "headless throttles rAF",
 *  which is the reading a reviewer will reach for first and which would be free to believe. */
const FLOOR_MS = 3000;
/** How many files the module table lists before summing the rest. */
const TOP_MODULES = 15;
/** Land-stream samples this close (ms) are one run, and a run needs this much land-stream time. */
const BURST_OPTIONS = { mergeGapMs: 100, minMemberMs: 50 };
/** Late frames this close (ms) are one stall. */
const LATE_CLUSTER_GAP_MS = 1000;
const ANGLE_BACKENDS = ['gl', 'default', 'd3d11', 'vulkan', 'metal'];

/**
 * WATCH UNTIL THE PAGE IS QUIET, and say how long that took — window by window, because the SHAPE of
 * the tail (a steady drag, or a few long stalls) is part of the answer.
 *
 * ⚠ IT REPORTS `settled: false` RATHER THAN THROWING when the page never goes quiet. A view that is
 * permanently busy is a real answer to this increment's question and must reach the report, not
 * become a crash; the arm that follows is then labelled as taken on a page still working.
 */
async function settle(target, label) {
  const startedAt = Date.now();
  const windows = [];
  let quiet = 0;
  for (;;) {
    const window = frameCost(await target.evaluate(watchFrames, SETTLE_WINDOW_MS));
    const waitedMs = Date.now() - startedAt;
    windows.push({ atMs: waitedMs, medianMs: window.medianMs, worstMs: window.worstMs, frames: window.frames });
    quiet = window.medianMs <= SETTLE_QUIET_MS ? quiet + 1 : 0;
    if (quiet >= SETTLE_QUIET_WINDOWS) return { settled: true, waitedMs, windowMedianMs: window.medianMs, windows };
    if (waitedMs >= SETTLE_GIVE_UP_MS) {
      console.warn(`measure-land-view — ${label} never went quiet within ${SETTLE_GIVE_UP_MS} ms`);
      return { settled: false, waitedMs, windowMedianMs: window.medianMs, windows };
    }
  }
}

/**
 * Watch `requestAnimationFrame` for `ms` and return the deltas, as a page function.
 *
 * ⚠ IT KEEPS WATCHING UNTIL IT HAS ONE DELTA. A main thread blocked for longer than the window hands
 * back a single callback past the deadline, and an empty list would make `frameCost` refuse a window
 * that measured something real — the longest frame of the run.
 */
const watchFrames = (ms) =>
  new Promise((done) => {
    const deltas = [];
    let previous = null;
    const stopAt = performance.now() + ms;
    const step = (t) => {
      if (previous !== null) deltas.push(t - previous);
      previous = t;
      if (t < stopAt || deltas.length === 0) requestAnimationFrame(step);
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
  for (const required of ['url', 'output', 'arm']) {
    if (!values.has(required)) throw new Error(`--${required} is required`);
  }
  const angle = values.get('angle') ?? 'gl';
  if (!ANGLE_BACKENDS.includes(angle)) {
    throw new Error(`--angle ${angle} is not an ANGLE backend this driver passes on (${ANGLE_BACKENDS.join(' | ')})`);
  }
  return {
    base: new URL(values.get('url')),
    output: resolve(values.get('output')),
    arm: values.get('arm'),
    angle,
    allowSoftware: values.get('allow-software') === '1',
    sourcemaps: values.get('sourcemaps') === '1',
    keepProfiles: values.get('keep-profiles') === '1',
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

/** Every console error and uncaught exception a page raises, in arrival order. */
function collectErrors(target) {
  const errors = [];
  target.on('pageerror', (e) => errors.push(e.message));
  target.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** A CDP session on `target` with the sampling profiler armed. */
async function armProfiler(target) {
  const cdp = await target.context().newCDPSession(target);
  await cdp.send('Profiler.enable');
  // 1 kHz: fine enough that a 10 ms stage is ten samples rather than one, and coarse enough that the
  // profiler's own overhead is not the thing being measured.
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  return cdp;
}

/** Run `work` under the profiler, and hand back both what it returned and the profile. */
async function profiled(cdp, work) {
  await cdp.send('Profiler.start');
  const result = await work();
  const { profile } = await cdp.send('Profiler.stop');
  return { result, profile };
}

/**
 * THE PRODUCTION ARM'S ATTRIBUTION — each chunk the profiles ran, named through its own source map.
 *
 * ⚠ A MISSING MAP COMES BACK 200 WITH index.html, because `serve.ts` falls back to the SPA shell for
 * any path it cannot find. So a map is only a map once it parses as one; everything else is counted
 * as a chunk WITHOUT a map, and the report says how many there were.
 */
async function attributionFor(profiles) {
  if (!args.sourcemaps) return { locate: undefined, mapped: [], unmapped: [] };
  const chunks = new Set();
  for (const profile of profiles) {
    for (const node of profile.nodes) {
      const url = node.callFrame.url;
      if (url.startsWith(args.base.origin) && url.endsWith('.js')) chunks.add(url);
    }
  }
  const maps = new Map();
  const unmapped = [];
  for (const chunk of chunks) {
    const body = await fetch(`${chunk}.map`)
      .then((response) => (response.ok ? response.text() : null))
      .catch(() => null);
    let map = null;
    try {
      map = body === null ? null : JSON.parse(body);
    } catch {
      map = null;
    }
    if (map === null || !Array.isArray(map.sources) || typeof map.mappings !== 'string') {
      unmapped.push(chunk);
      continue;
    }
    maps.set(chunk, sourceLocator(map));
  }
  if (maps.size === 0) {
    fail(
      '--sourcemaps 1 was asked for and no chunk served a source map — build with `vite build --sourcemap`, ' +
        'or drop the flag and accept a withheld production CPU split',
    );
  }
  return { locate: locatorFromSourceMaps(maps), mapped: [...maps.keys()], unmapped };
}

const args = readArgs(process.argv.slice(2));
await mkdir(args.output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', `--use-angle=${args.angle}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

// ---- THE FLOOR, FIRST: the renderer this browser got, and the frame rate a blank page reaches in it.
const floorPage = await browser.newPage({ viewport: VIEWPORT });
await floorPage.goto('about:blank');
const renderer = await floorPage.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') ?? c.getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  const name = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  return { name, software: /swiftshader|llvmpipe|software/i.test(name) };
});
if (renderer.software && !args.allowSoftware) {
  fail(
    `the renderer is a software rasteriser (${renderer.name}) — on the Linux box put DISPLAY=:0 in the ` +
      'environment, on Windows pass --angle default, or --allow-software 1 to take the CPU numbers anyway ' +
      'and do NOT quote a GPU cost from them',
  );
}
const floor = frameCost(await floorPage.evaluate(watchFrames, FLOOR_MS));
await floorPage.close();
if (floor.medianMs > 2 * FRAME_BUDGET_MS) {
  fail(
    `a blank page in this browser draws at ${floor.medianMs.toFixed(1)} ms per frame — the harness ` +
      'itself is throttled, so no frame figure taken here would be about the studio',
  );
}

// ---- THE LAND-VIEW ARM
const page = await browser.newPage({ viewport: VIEWPORT });
const landErrors = collectErrors(page);
const landCdp = await armProfiler(page);
const started = Date.now();

// PHASE A — WAIT FOR THE LAND TO ACTUALLY BE THERE. A mounted canvas that renders nothing looks
// exactly like a working one, so the wait is for a canvas with real dimensions inside the land panel
// and not for the panel itself.
const phaseA = await profiled(landCdp, async () => {
  await page.goto(landViewUrl(args.base, true), { waitUntil: 'domcontentloaded', timeout: 300000 });
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
  return Date.now() - started;
});
const drawnAtMs = phaseA.result;
if (landErrors.length > 0) fail(`the page reported errors while loading:\n  ${landErrors.join('\n  ')}`);

// PHASE B — ⚠ SETTLE FIRST, AND MEASURE THE SETTLE. The land view is "up" the moment its canvas has a
// size and is still working long after; watching immediately charges the tail of the LOAD to the
// steady state. How long it takes to go quiet is the honest reading of "takes a while to load" — and
// what the page DOES in that time is the part the first version never profiled.
const phaseB = await profiled(landCdp, () => settle(page, 'the land view'));
const landSettle = phaseB.result;
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

// PHASE C — the long idle window, profiled: what the page does at rest, timers included.
const phaseC = await profiled(landCdp, () => page.evaluate(watchFrames, LONG_IDLE_MS));

const resources = await page.evaluate(() =>
  performance
    .getEntriesByType('resource')
    .map((e) => ({ name: e.name, durationMs: e.duration, transferSizeBytes: e.transferSize ?? 0 })),
);
// ⚠ CLOSED BEFORE THE CONTROL OPENS. Two live pages means the hidden one's rAF is throttled, and
// whichever arm was measured second would come back slower for a reason that is not the studio's.
await page.close();

// ---- THE CONTROL ARM: the same route with the flag OFF, in the same phases. Without it, every figure
// above is "what the studio costs", not "what the LAND VIEW costs" — the store payload and React are
// paid either way.
const control = await browser.newPage({ viewport: VIEWPORT });
const controlErrors = collectErrors(control);
const controlCdp = await armProfiler(control);
const controlStarted = Date.now();
const controlA = await profiled(controlCdp, async () => {
  await control.goto(landViewUrl(args.base, false), { waitUntil: 'domcontentloaded', timeout: 300000 });
  await control
    .waitForFunction(
      () => document.querySelectorAll('svg').length > 0 && document.querySelector('[data-testid="land-view"]') === null,
      null,
      { timeout: 300000 },
    )
    .catch(() => fail('the control arm never drew the map without the land view'));
  return Date.now() - controlStarted;
});
const controlDrawnAtMs = controlA.result;
if (controlErrors.length > 0) fail(`the control page reported errors while loading:\n  ${controlErrors.join('\n  ')}`);
const controlB = await profiled(controlCdp, () => settle(control, 'the map alone'));
const controlSettle = controlB.result;
const controlIdle = await control.evaluate(watchFrames, STEADY_MS);
const controlC = await profiled(controlCdp, () => control.evaluate(watchFrames, LONG_IDLE_MS));
await control.close();

await browser.close();

// ---- the deciding, all of it in the pure module
const profiles = {
  landA: phaseA.profile,
  landB: phaseB.profile,
  landC: phaseC.profile,
  controlA: controlA.profile,
  controlB: controlB.profile,
  controlC: controlC.profile,
};
const attribution = await attributionFor(Object.values(profiles));
const locate = attribution.locate;
const splits = Object.fromEntries(Object.entries(profiles).map(([name, profile]) => [name, stageSplit(profile, locate)]));
const addedToLoad = stageDelta(sumSplits([splits.landA, splits.landB]), sumSplits([splits.controlA, splits.controlB]));
const addedAtRest = stageDelta(splits.landC, splits.controlC);
const modules = {
  landA: moduleSplit(profiles.landA, TOP_MODULES, locate),
  landB: moduleSplit(profiles.landB, TOP_MODULES, locate),
  landC: moduleSplit(profiles.landC, TOP_MODULES, locate),
  controlC: moduleSplit(profiles.controlC, TOP_MODULES, locate),
};
const isLandStream = (stage) => stage === 'land-stream';
const landStreamRuns = {
  landA: bursts(profiles.landA, isLandStream, BURST_OPTIONS, locate),
  landB: bursts(profiles.landB, isLandStream, BURST_OPTIONS, locate),
  landC: bursts(profiles.landC, isLandStream, BURST_OPTIONS, locate),
};
const net = networkSplit(resources);
const idle = frameCost(idleDeltas);
const drag = frameCost(dragDeltas);
const controlIdleCost = frameCost(controlIdle);
const longIdle = frameCost(phaseC.result);
const controlLongIdle = frameCost(controlC.result);
const stalls = {
  land: lateFrameClusters(phaseC.result, LATE_CLUSTER_GAP_MS),
  control: lateFrameClusters(controlC.result, LATE_CLUSTER_GAP_MS),
};

const measurements = {
  measuredAt: new Date().toISOString(),
  url: args.base.href,
  arm: args.arm,
  angle: args.angle,
  renderer,
  viewport: VIEWPORT,
  windows: { steadyMs: STEADY_MS, longIdleMs: LONG_IDLE_MS, slowPollMs: SLOW_POLL_MS, ageTickMs: AGE_TICK_MS },
  attribution: {
    sourcemaps: args.sourcemaps,
    mappedChunks: attribution.mapped.length,
    unmappedChunks: attribution.unmapped,
  },
  load: {
    landViewDrawnAtMs: drawnAtMs,
    mapOnlyDrawnAtMs: controlDrawnAtMs,
    landViewSettle: landSettle,
    mapOnlySettle: controlSettle,
  },
  cpu: Object.fromEntries(
    Object.entries(splits).map(([name, split]) => [
      name,
      { totalMs: split.totalMs, busyMs: busyMs(split), reportable: cpuSplitIsReportable(split), byStage: split.byStage },
    ]),
  ),
  addedToLoad,
  addedAtRest,
  modules,
  landStreamRuns,
  network: net,
  // ⚠ EVERY `/api/` ROW VERBATIM, because `transferSize` UNDER-REPORTS and the summary above
  // inherits it: the dev arm reported 0.07 MB of API traffic where the server actually sent 37.2
  // MiB. The rows are kept so a reader can see WHICH call dominates rather than a total that may
  // be wrong, and the report says to confirm a byte figure with `curl` against the server.
  apiRequests: resources
    .filter((e) => e.name.includes('/api/'))
    .map((e) => ({ path: new URL(e.name).pathname, durationMs: Math.round(e.durationMs), transferSizeBytes: e.transferSizeBytes }))
    .sort((a, b) => b.transferSizeBytes - a.transferSizeBytes),
  frames: {
    harnessFloor: floor,
    idle,
    drag,
    controlIdle: controlIdleCost,
    longIdle,
    controlLongIdle,
    budgetMs: FRAME_BUDGET_MS,
    lateMs: LATE_FRAME_MS,
  },
  stalls,
  errorsAfterLoad: { landView: landErrors, mapAlone: controlErrors },
};
await writeFile(`${args.output}/measurements.json`, `${JSON.stringify(measurements, null, 2)}\n`);
if (args.keepProfiles) {
  for (const [name, profile] of Object.entries(profiles)) {
    await writeFile(`${args.output}/${name}.cpuprofile`, JSON.stringify(profile));
  }
}

const ms = (n) => `${n.toFixed(1)} ms`;
const sec = (n) => `${(n / 1000).toFixed(1)} s`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const pct = (part, whole) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—');
const rows = (items, perRow) => {
  const out = [];
  for (let i = 0; i < items.length; i += perRow) out.push(items.slice(i, i + perRow));
  return out;
};
const stageLines = (split, indent) =>
  cpuSplitIsReportable(split)
    ? rankedStages(split).map((r) => `${indent}${r.stage.padEnd(18)} ${ms(r.ms).padStart(10)}  ${r.share.toFixed(1).padStart(5)}%`)
    : [
        `${indent}WITHHELD — the attribution placed under a quarter of this phase's busy time`,
        `${indent}(${ms(busyMs(split))} busy, ${ms(split.byStage.unattributed)} of it unattributed). A production`,
        `${indent}build's chunks carry no package path: re-run with --sourcemaps 1 on a --sourcemap build.`,
      ];
const moduleLines = (split, indent) => [
  ...split.rows.map((r) => `${indent}${ms(r.ms).padStart(10)} ${pct(r.ms, split.totalMs).padStart(6)}  ${r.stage.padEnd(16)} ${r.module}`),
  `${indent}${ms(split.restMs).padStart(10)} ${pct(split.restMs, split.totalMs).padStart(6)}  ${''.padEnd(16)} … ${split.restModules} more module(s)`,
];
const runLines = (list, indent) =>
  list.length === 0
    ? [`${indent}none`]
    : [
        `${indent}${list.length} run(s), ${ms(list.reduce((sum, run) => sum + run.memberMs, 0))} of land-stream time in them:`,
        ...rows(
          list.map((run) => `+${sec(run.startMs)} ${Math.round(run.memberMs)} ms`),
          6,
        ).map((row) => `${indent}  ${row.join('   ')}`),
      ];
const stallLines = (list, indent) =>
  list.length === 0
    ? [`${indent}no late frames`]
    : rows(
        list.map((c) => `+${sec(c.atMs)} ${c.frames}x worst ${Math.round(c.worstMs)} ms`),
        3,
      ).map((row) => `${indent}${row.join('   ')}`);
const settleLines = (result, indent) =>
  rows(
    result.windows.map((w) => `+${sec(w.atMs)} ${Math.round(w.medianMs)}/${Math.round(w.worstMs)}`),
    8,
  ).map((row) => `${indent}${row.join('  ')}`);
const deltaLines = (list, indent) =>
  list.map((r) => `${indent}${r.stage.padEnd(18)} ${ms(r.addedMs).padStart(10)}   (land view ${ms(r.landMs)}, map alone ${ms(r.controlMs)})`);
const frameRow = (c) => `median ${ms(c.medianMs)}  p95 ${ms(c.p95Ms)}  worst ${ms(c.worstMs)}  late ${c.late}/${c.frames}`;
const apiLines = resources
  .filter((e) => e.name.includes('/api/'))
  .sort((a, b) => b.transferSizeBytes - a.transferSizeBytes)
  .slice(0, 8)
  .map((e) => `     ${String(Math.round(e.transferSizeBytes / 1024)).padStart(7)} kB  ${String(Math.round(e.durationMs)).padStart(6)} ms  ${new URL(e.name).pathname}`);
const phaseHead = (label, split) => `   ${label} — ${ms(split.totalMs)} sampled, ${ms(busyMs(split))} of it busy`;
const errorLines = [
  ...landErrors.map((e) => `   land view: ${e}`),
  ...controlErrors.map((e) => `   map alone: ${e}`),
];

const lines = [
  "THE LAND VIEW'S LOAD AND FRAME COST, on the real forest, in the studio",
  `measured     ${measurements.measuredAt}`,
  `arm          ${args.arm}`,
  `renderer     ${renderer.name} (software=${renderer.software}, --use-angle=${args.angle})`,
  `attribution  ${
    args.sourcemaps
      ? `source maps — ${attribution.mapped.length} chunk(s) mapped, ${attribution.unmapped.length} without one`
      : "each frame's own module url"
  }`,
  '',
  '1. TIME TO THE LAND BEING ON SCREEN',
  `   with the land view   ${drawnAtMs} ms`,
  `   the map alone        ${controlDrawnAtMs} ms   <- the control: what a member pays without the flag`,
  `   the land view's own  ${drawnAtMs - controlDrawnAtMs} ms`,
  '',
  '   AND THE HONEST READING OF "TAKES A WHILE" — a canvas with a size is not a page that has',
  '   finished. Time from there until two consecutive one-second windows run under 1.25 budgets:',
  `   land view  +${landSettle.waitedMs} ms${landSettle.settled ? '' : '  (NEVER WENT QUIET — every figure below was taken on a page still working)'}`,
  `   map alone  +${controlSettle.waitedMs} ms${controlSettle.settled ? '' : '  (NEVER WENT QUIET)'}`,
  `   so a viewer waits ${((drawnAtMs + landSettle.waitedMs) / 1000).toFixed(1)} s for a land view that has stopped moving,`,
  `   against ${((controlDrawnAtMs + controlSettle.waitedMs) / 1000).toFixed(1)} s for the map alone.`,
  '',
  "   THE LAND VIEW'S TAIL, one entry per window — seconds since the canvas had a size, then",
  '   median/worst frame in ms:',
  ...settleLines(landSettle, '     '),
  '',
  "2. WHERE THE CPU WENT — self time per stage, shares against each phase's WHOLE, waiting included",
  phaseHead('A. navigation to a sized canvas', splits.landA),
  ...stageLines(splits.landA, '      '),
  phaseHead('B. a sized canvas to quiet', splits.landB),
  ...stageLines(splits.landB, '      '),
  phaseHead(`C. a ${sec(LONG_IDLE_MS)} idle window after the drag`, splits.landC),
  ...stageLines(splits.landC, '      '),
  '   ⚠ `unattributed` is anything with no module url that is not idle or GC. It is reported',
  '     rather than divided out; a split that cannot say what it missed is not a split.',
  '',
  '   WHAT THE LAND VIEW ADDED over the map alone, stage by stage (negative: the land arm came in cheaper)',
  '   to load and settle, phases A + B:',
  ...deltaLines(addedToLoad, '      '),
  `   at rest, phase C (${sec(LONG_IDLE_MS)} each):`,
  ...deltaLines(addedAtRest, '      '),
  '',
  `3. WHICH FILES — the top ${TOP_MODULES} modules by self time, shares against the phase's whole`,
  '   A. navigation to a sized canvas',
  ...moduleLines(modules.landA, '      '),
  '   B. a sized canvas to quiet',
  ...moduleLines(modules.landB, '      '),
  '   C. the long idle window',
  ...moduleLines(modules.landC, '      '),
  '   the map alone at rest, its phase C — what the studio does without the flag',
  ...moduleLines(modules.controlC, '      '),
  '',
  `4. WHEN THE LAND STREAM RAN — separate runs of its work, seconds from each phase's own start`,
  `   (samples within ${BURST_OPTIONS.mergeGapMs} ms are one run; a run needs ${BURST_OPTIONS.minMemberMs} ms of land-stream time)`,
  '   A. navigation to a sized canvas',
  ...runLines(landStreamRuns.landA, '      '),
  '   B. a sized canvas to quiet',
  ...runLines(landStreamRuns.landB, '      '),
  '   C. the long idle window',
  ...runLines(landStreamRuns.landC, '      '),
  '',
  '5. WHAT THE NETWORK COST — per request, and they OVERLAP, so these do not sum to a timeline',
  `   store payload (/api/)   ${ms(net.storePayloadMs)}  ${mb(net.storePayloadBytes)}   <- the map pays this too`,
  `   the canvas + the kit    ${ms(net.canvasChunkMs)}  ${mb(net.canvasChunkBytes)}   <- only a land-view viewer pays this`,
  `   everything else         ${ms(net.otherMs)}  ${mb(net.otherBytes)}`,
  '   EVERY /api/ CALL, largest first — ⚠ `transferSize` UNDER-REPORTS (a dev arm read 0.07 MB where',
  '   the server sent 37.2 MiB), so confirm any byte figure with curl against the server:',
  ...apiLines,
  '',
  `6. FRAME COST — 60 Hz budget is ${FRAME_BUDGET_MS.toFixed(1)} ms`,
  `   HARNESS FLOOR      median ${ms(floor.medianMs)} over ${floor.frames} frames on about:blank — the control that makes the rest mean something`,
  `   idle, land view    ${frameRow(idle)}`,
  `   idle, map alone    ${frameRow(controlIdleCost)}`,
  `   under a drag       ${frameRow(drag)}`,
  `   long idle, land    ${frameRow(longIdle)}`,
  `   long idle, map     ${frameRow(controlLongIdle)}`,
  `   "late" is over ${LATE_FRAME_MS.toFixed(1)} ms — rAF reports an ON-TIME 60 Hz frame as 16.7 ms, so a strict`,
  '   comparison against the 16.667 budget calls every healthy frame late (it did, 216 of 360).',
  '   ⚠ READ `worst` AND `late`, NOT ONLY THE PERCENTILE: with sixty frames p95 sits at the 57th, so',
  '     a stall rarer than four frames in sixty is invisible to it by construction.',
  '',
  `   WHEN THE LATE FRAMES CAME in the ${sec(LONG_IDLE_MS)} windows — seconds from each window's start,`,
  `   late frames within ${LATE_CLUSTER_GAP_MS} ms counted as one stall:`,
  '   land view',
  ...stallLines(stalls.land, '      '),
  '   map alone',
  ...stallLines(stalls.control, '      '),
  ...(errorLines.length > 0 ? ['', '7. ERRORS AFTER THE LOAD — reported, not refused, since the load itself was clean', ...errorLines] : []),
  '',
  'IT DECIDES NOTHING. This is the split the increment asked for before any cure is chosen.',
];
const report = `${lines.join('\n')}\n`;
await writeFile(`${args.output}/report.txt`, report);
console.log(report);
console.log(`→ ${args.output}`);
