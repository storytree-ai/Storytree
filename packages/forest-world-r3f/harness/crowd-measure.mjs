// crowd-measure.mjs — DRIVER for the crowd question: 35 islands, four arms, two zooms.
//
// Reproduce:
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5214
//   DISPLAY=:0 ST_CROWD_URL=http://localhost:5214/crowd.html \
//     pnpm --filter @storytree/forest-world-r3f measure-crowd
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked — `tsconfig.json` covers only
// `.ts`/`.tsx`. Every number is computed in the typechecked modules (`crowd-layout.ts`,
// `crowd-scene.ts`, `crowd-reading.ts`, `crowd-page.ts`, `frame-budget.ts`); this starts a
// browser, interleaves a sweep and decides an exit code
// (`measurement-instrument-must-be-typechecked`).
//
// ⚠ `DISPLAY=:0` MUST BE SET EVEN HEADLESS and the flags must be angle/gl, or Chromium falls back
// to SwiftShader SILENTLY and every frame figure becomes a verdict about the CPU.
//
// ⚠ IT REFUSES, rather than reporting, on: a software renderer · no
// `EXT_disjoint_timer_query_webgl2` (a wall clock is not an option after PR #1683, which found the
// previous instrument wrong by 30-250x because it timed SUBMISSION rather than EXECUTION) · the
// pinned default port every worktree shares · a console error or an HTTP >= 400 · a truth reading
// that survives its own falsification · the two merge arms delivering different pictures · a
// physically impossible frame cost.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { FRAME_BUDGET_60HZ_MS, frameBudgetVerdict, median, spread } from './frame-budget.ts';
import { CROWD_ARMS } from './crowd-scene.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_CROWD_URL'] ?? 'http://localhost:5214/crowd.html';
const OUT =
  process.env['ST_CROWD_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-crowd-2026-08-28');

const REPEATS = Number(process.env['ST_CROWD_REPEATS'] ?? 7);
// ⚠ 120, AND THE FLOOR IS FORCED BY THE INSTRUMENT, NOT CHOSEN. The one-island page needed 300
// because its frames were ~0.1 ms and the batch had to lift them clear of the timer's own noise.
// A 35-island frame is roughly an order of magnitude more work, so the same clearance arrives
// sooner; the refusals below are what actually police it — if any arm comes back UNRESOLVED or a
// bigger scene times FASTER than a smaller one, this run does not publish.
const BATCH = Number(process.env['ST_CROWD_BATCH'] ?? 120);
const ZOOMS = ['forest', 'neighbourhood', 'island'];

function fail(msg) {
  console.error(`\nREFUSED: ${msg}\n`);
  process.exit(1);
}

if (/:5184\b/.test(URL_) && !process.env['ST_CROWD_ALLOW_DEFAULT_PORT']) {
  fail(`${URL_} is the harness's pinned default port, which every worktree shares. Use a free one.`);
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

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const response = await page.goto(URL_, { waitUntil: 'load', timeout: 180_000 }).catch((e) => {
  fail(`could not reach ${URL_} — ${e}`);
});
if (response && response.status() >= 400) fail(`${URL_} answered ${response.status()}`);

await page
  .waitForFunction(() => window.__stCrowdReady === true || typeof window.__stCrowdError === 'string', null, {
    timeout: 600_000,
  })
  .catch(async () => {
    await browser.close();
    fail(`${URL_} never became ready`);
  });

const pageError = await page.evaluate(() => window.__stCrowdError ?? null);
if (pageError) {
  await browser.close();
  fail(`the page threw: ${pageError}`);
}

const identity = await page.evaluate(() => window.__stCrowdIdentity());
if (identity.software || /swiftshader|llvmpipe|software/i.test(identity.renderer)) {
  await browser.close();
  fail(
    `rendered by ${identity.renderer}, a software rasteriser — every frame figure here would be a ` +
      'verdict about the CPU. Check DISPLAY=:0 is set; without it these flags fall back silently.',
  );
}
if (!identity.timerQuery) {
  await browser.close();
  fail(
    'EXT_disjoint_timer_query_webgl2 is absent, so there is no GPU clock. Falling back to a wall ' +
      'clock is not an option after PR #1683 — it timed submission, not execution, and was wrong by ' +
      '30-250x.',
  );
}

const pngOf = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');

// ------------------------------------------------------------------ what the forest IS

const shape = await page.evaluate(() => window.__stCrowdShape());

// ------------------------------------------------------------------ the pictures

const pictures = [];
for (const zoom of ZOOMS) {
  for (const arm of CROWD_ARMS) {
    const dataUrl = await page.evaluate(([a, z]) => window.__stCrowdSnapshot(a, z), [arm, zoom]);
    const name = `crowd-${arm}-${zoom}.png`;
    writeFileSync(join(OUT, name), pngOf(dataUrl));
    pictures.push({ arm, zoom, file: name });
  }
}

// ------------------------------------------------------------------ Q1: legibility

const legibility = {};
for (const zoom of ZOOMS) {
  legibility[zoom] = await page.evaluate((z) => window.__stCrowdLegibility(z), zoom);
}

const blobs = [];
for (const zoom of ZOOMS) {
  for (const arm of CROWD_ARMS) {
    const reading = await page.evaluate(([a, z]) => window.__stCrowdBlobs(a, z), [arm, zoom]);
    blobs.push({ arm, zoom, ...reading });
  }
}

// ------------------------------------------------------------------ Q2: does the map still tell
// the truth — and the falsification that proves the reading can fail

const truth = [];
for (const zoom of ZOOMS) {
  for (const arm of CROWD_ARMS) {
    const real = await page.evaluate(([a, z]) => window.__stCrowdTruth(a, z, false), [arm, zoom]);
    // ⚠ THE FALSIFICATION ARM, RUN EVERY TIME AND NOT ONCE AS A CEREMONY. Every island is given
    // the SAME status, so the needle is no longer different from its neighbours. A reading that
    // still says FOUND is finding something other than the failure — position, jitter, the
    // scatter — and its FOUND on the real arm means nothing.
    const uniform = await page.evaluate(([a, z]) => window.__stCrowdTruth(a, z, true), [arm, zoom]);
    truth.push({
      arm,
      zoom,
      real: strip(real),
      falsified: strip(uniform),
      falsificationHeld: uniform.verdict !== 'FOUND',
    });
  }
}

function strip(reading) {
  const { islands, ...rest } = reading;
  return { ...rest, islandCount: islands.length };
}

const brokenFalsifications = truth.filter((t) => !t.falsificationHeld);
if (brokenFalsifications.length > 0) {
  await browser.close();
  fail(
    'the truth reading SURVIVED its own falsification on ' +
      brokenFalsifications.map((t) => `${t.arm}@${t.zoom}`).join(', ') +
      ' — with every island wearing the same status it still reported the needle FOUND, so it is ' +
      'finding position or scatter rather than proof state. An instrument that cannot fail is not ' +
      'evidence (three were caught in this factory in two days).',
  );
}

// ------------------------------------------------------------------ Q3: what it costs

await page.evaluate(() => window.__stCrowdWarm());

const plan = [];
for (let r = 0; r < REPEATS; r++) {
  for (const zoom of ZOOMS) for (const arm of CROWD_ARMS) plan.push({ arm, zoom });
}
// ⚠ INTERLEAVED, NOT GROUPED. Grouping repeats by configuration aliases GPU drift onto the
// variable: the last arm measured would carry every thermal or clock change of the whole sweep.
const samples = new Map();
const counters = new Map();
for (const { arm, zoom } of plan) {
  const reading = await page.evaluate(
    ([a, z, b]) => window.__stCrowdTime(a, z, b),
    [arm, zoom, BATCH],
  );
  const key = `${arm}@${zoom}`;
  if (!samples.has(key)) samples.set(key, []);
  if (reading.gpuNs !== null) samples.get(key).push(reading.gpuNs / 1e6);
  counters.set(key, reading);
}

const cost = [];
for (const zoom of ZOOMS) {
  for (const arm of CROWD_ARMS) {
    const key = `${arm}@${zoom}`;
    const ms = samples.get(key) ?? [];
    const counter = counters.get(key);
    cost.push({
      arm,
      zoom,
      pxPerUnit: counter.pxPerUnit,
      drawCalls: counter.drawCalls,
      triangles: counter.triangles,
      width: counter.width,
      height: counter.height,
      resolvedSamples: ms.length,
      samplesMs: ms,
      medianMs: ms.length > 0 ? median(ms) : null,
      spreadMs: ms.length > 0 ? spread(ms) : null,
      frameSharePct: ms.length > 0 ? (median(ms) / FRAME_BUDGET_60HZ_MS) * 100 : null,
    });
  }
}

// ⚠⚠ WHETHER A COST MAY BE QUOTED IS `frame-budget.ts`'S CALL, NOT THIS DRIVER'S.
//
// An earlier version of this file refused any arm whose spread exceeded HALF its own median. That
// is exactly the move this repo keeps having to undo — a number picked here to make an answer come
// out — and it was wrong in a measurable direction: the disturbance on this box is roughly constant
// in ABSOLUTE size (~0.1 ms), so a ratio bar refused the CHEAP arms while passing the expensive
// ones that carried the same noise.
//
// The house rule states every cost against a CONTROL and withholds a delta that does not clear the
// wider of the two rows' spreads — `RESOLVED`, `BELOW_NOISE` or `IMPOSSIBLE`. That is the same rule,
// applied where it belongs: to the DELTA being claimed rather than to the median being reported.
// A median still gets printed with its own spread beside it, so an uncertain row is visibly
// uncertain instead of silently absent.
const budget = {};
for (const zoom of ZOOMS) {
  const rows = CROWD_ARMS.map((arm) => {
    const c = cost.find((r) => r.arm === arm && r.zoom === zoom);
    return { label: arm, samples: c.samplesMs, software: false, hidden: false };
  });
  budget[zoom] = frameBudgetVerdict({ rows, baselineLabel: 'bare' });
}

const unresolved = cost.filter((c) => c.resolvedSamples < Math.ceil(REPEATS / 2));
if (unresolved.length > 0) {
  await browser.close();
  fail(
    'the GPU clock gave no usable verdict for ' +
      unresolved.map((c) => `${c.arm}@${c.zoom} (${c.resolvedSamples}/${REPEATS})`).join(', ') +
      ' — every sample was disjoint, so there is nothing here to publish.',
  );
}

// ⚠ A PHYSICAL IMPOSSIBILITY IS A SIGNAL TO MEASURE HARDER, NOT TO PUBLISH. The previous page
// caught a MORE detailed island timing FASTER than a bare one, refused, and re-measured at a
// bigger batch. Adding geometry cannot subtract cost, so a dressed arm beating the bare control by
// more than the wider of the two spreads is the instrument failing, not a saving.
const impossible = [];
for (const zoom of ZOOMS) {
  const bare = cost.find((c) => c.arm === 'bare' && c.zoom === zoom);
  for (const arm of ['today', 'kit', 'kit-merged']) {
    const row = cost.find((c) => c.arm === arm && c.zoom === zoom);
    const noise = Math.max(bare.spreadMs, row.spreadMs);
    if (row.medianMs < bare.medianMs - noise) {
      impossible.push(
        `${arm}@${zoom} drew ${row.triangles.toLocaleString()} triangles in ${row.medianMs.toFixed(3)} ms ` +
          `against bare's ${bare.triangles.toLocaleString()} in ${bare.medianMs.toFixed(3)} ms, ` +
          `a gap of ${(bare.medianMs - row.medianMs).toFixed(3)} ms outside the ${noise.toFixed(3)} ms noise floor`,
      );
    }
  }
}
if (impossible.length > 0) {
  await browser.close();
  fail(
    'adding work cannot subtract cost, so these are the instrument failing rather than a saving — ' +
      `raise ST_CROWD_BATCH above ${BATCH} until they clear:\n  ` +
      impossible.join('\n  '),
  );
}

// ⚠ THE TWO MERGE ARMS MUST DELIVER THE SAME PICTURE — checked on PIXELS, not on triangles.
//
// The first version of this check compared triangle counts and refused a correct run: at the
// zoomed view `kit` reported 98,410 triangles and `kit-merged` 2,138,068, because 35 per-island
// groups are frustum-culled individually while one forest-spanning merged mesh never is. Both
// place identical props. So the claim has to be stated over what a READER receives.
const merge = [];
for (const zoom of ZOOMS) {
  const diff = await page.evaluate(
    ([a, b, z]) => window.__stCrowdCompare(a, b, z),
    ['kit', 'kit-merged', zoom],
  );
  merge.push(diff);
  // The bar is the land's own shade-ladder step — the finest difference any ground pixel is
  // allowed to express. Below it the two pictures differ by less than the land's own resolution.
  if (diff.differingBeyondLadderStep > 0.005) {
    await browser.close();
    fail(
      `at ${zoom} zoom the two merge arms delivered DIFFERENT pictures — ` +
        `${(diff.differingBeyondLadderStep * 100).toFixed(2)}% of the frame moved by more than the ` +
        `land's own shade step (max channel delta ${diff.maxChannelDelta}). They must place identical ` +
        'props; a cheaper arm that draws a different forest is not a remedy.',
    );
  }
}

// WHAT THE MERGE COSTS IN CULLING — reported, not refused. This is the finding the triangle check
// above was mistaking for a fault.
const culling = ZOOMS.map((zoom) => {
  const perIsland = cost.find((c) => c.arm === 'kit' && c.zoom === zoom);
  const forestWide = cost.find((c) => c.arm === 'kit-merged' && c.zoom === zoom);
  return {
    zoom,
    perIslandTriangles: perIsland.triangles,
    forestWideTriangles: forestWide.triangles,
    submittedRatio: forestWide.triangles / perIsland.triangles,
    perIslandDrawCalls: perIsland.drawCalls,
    forestWideDrawCalls: forestWide.drawCalls,
    drawCallRatio: perIsland.drawCalls / forestWide.drawCalls,
  };
});

// ------------------------------------------------------------------ the record

const report = {
  measuredAt: new Date().toISOString(),
  renderer: identity,
  batch: BATCH,
  repeats: REPEATS,
  shape,
  pictures,
  legibility,
  blobs,
  truth,
  cost,
  budget,
  merge,
  culling,
  consoleErrors,
};
writeFileSync(join(OUT, 'crowd.json'), `${JSON.stringify(report, null, 2)}\n`);

if (consoleErrors.length > 0) {
  await browser.close();
  fail(`the page logged ${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 3).join(' | ')}`);
}

await browser.close();

// ------------------------------------------------------------------ what it says, on the way out

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nrenderer: ${identity.renderer}`);
console.log(
  `\nTHE FOREST: ${shape.islands} islands (${shape.proven} healthy) over ` +
    `${Math.round(shape.screenW)}x${Math.round(shape.screenH)} ground units, ` +
    `${(shape.landFraction * 100).toFixed(2)}% land — the real map's own measured density.`,
);
console.log(
  `THE WHOLE-FOREST ZOOM: ${shape.fitPxPerUnit.toFixed(2)} device px per ground unit fitted to the ` +
    `screen with nothing wasted — the crowd's BEST case, and already ` +
    `${shape.coarserThanIslandOverview.toFixed(1)}x COARSER than the 2 px/unit every one-island picture ` +
    `on this arc is taken at. The shipped canvas's own framing rule is coarser still, at ` +
    `${shape.visitor.devicePxPerUnit.toFixed(2)} — it takes its spread off raw ground z, which the ` +
    '50-degree camera then foreshortens.',
);
console.log(`props standing in the whole crowd: ${shape.props.total}`);

console.log('\nLEGIBILITY — does a prop still read as an object?');
for (const zoom of ZOOMS) {
  console.log(`  ${zoom}:`);
  for (const row of legibility[zoom]) {
    console.log(
      `    ${pad(row.role, 12)} ${pad(row.deliveredPx.toFixed(1) + ' px', 10)} ${row.clears ? 'object' : 'BELOW THE FLOOR — speckle'}`,
    );
  }
}

console.log('\nTRUTH — can the failing island still be picked out?');
for (const row of truth) {
  console.log(
    `  ${pad(`${row.arm}@${row.zoom}`, 20)} ${pad(row.real.verdict, 11)} ` +
      `rank ${row.real.needleRank}/${row.real.visibleCount} in frame  margin ${row.real.margin.toFixed(2)} dE ` +
      `(${row.real.marginSigma.toFixed(1)} sigma)  [falsified: ${row.falsified.verdict}]` +
      (row.real.outrankedBy.length > 0
        ? `  outranked by ${row.real.outrankedBy.map((o) => o.status).join(', ')}`
        : ''),
  );
}

console.log('\nCOST — on the GPU\'s own clock');
console.log(
  `  ${pad('arm@zoom', 26)} ${pad('ms', 8)} ${pad('spread', 8)} ${pad('%frame', 8)} ${pad('draws', 7)} ` +
    `${pad('triangles', 11)} vs bare`,
);
for (const row of cost) {
  const judged = budget[row.zoom].rows.find((r) => r.label === row.arm);
  const vs =
    judged.resolution === 'BASELINE'
      ? '—'
      : judged.resolution === 'RESOLVED'
        ? `+${judged.deltaVsBaselineMs.toFixed(3)} ms (${judged.factorVsBaseline.toFixed(1)}x)`
        : judged.resolution === 'BELOW_NOISE'
          ? 'BELOW NOISE — not quotable'
          : 'IMPOSSIBLE — instrument fault';
  console.log(
    `  ${pad(`${row.arm}@${row.zoom}`, 26)} ${pad(row.medianMs.toFixed(3), 8)} ${pad(row.spreadMs.toFixed(3), 8)} ` +
      `${pad(row.frameSharePct.toFixed(2), 8)} ${pad(row.drawCalls, 7)} ${pad(row.triangles.toLocaleString(), 11)} ${vs}`,
  );
}
for (const zoom of ZOOMS) {
  console.log(`  ${zoom}: ${budget[zoom].status} — ${budget[zoom].prose}`);
}

console.log('\nTHE MERGE REMEDY — same pixels, different draw calls, different culling');
for (const row of culling) {
  const diff = merge.find((m) => m.zoom === row.zoom);
  console.log(
    `  ${pad(row.zoom, 8)} draw calls ${row.perIslandDrawCalls} -> ${row.forestWideDrawCalls} ` +
      `(${row.drawCallRatio.toFixed(1)}x fewer)  triangles SUBMITTED ` +
      `${row.perIslandTriangles.toLocaleString()} -> ${row.forestWideTriangles.toLocaleString()} ` +
      `(${row.submittedRatio.toFixed(1)}x more — culling lost)  ` +
      `pictures differ beyond the ladder step on ${(diff.differingBeyondLadderStep * 100).toFixed(3)}% of the frame`,
  );
}

console.log(`\nwrote ${join(OUT, 'crowd.json')} and ${pictures.length} pictures\n`);
