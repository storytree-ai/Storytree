// shipped-canopy-cost.mjs — WHAT THE DRESSED FOREST COSTS A FRAME, on the GPU's own clock.
//
// THE QUESTION IT ANSWERS. ADR-0507 D7's second half: "the frame cost of the dressed forest on the
// RTX 2060 (ADR-0505 D3), or the named gap". `shipped-canopy-measure.mjs` deliberately reports the
// PAYLOAD half — draw calls, triangles, objects — and says in its own header that frame cost is
// this box's to take. This is that leg. It drives the SAME page and the SAME runner, so the arms it
// times are the arms the sheet pictures: nothing here rebuilds a scene, and a number from this
// driver belongs to the same `groves-x2` the map stands.
//
// WHY IT MATTERS ON THIS INCREMENT AND NOT THE ONES BEFORE. The ground stack's arms all draw ONE
// mesh; these arms draw 194,630 ground triangles plus up to 2.9 million triangles of merged kit
// geometry on the 35-island forest. The cost being asked about is geometry and overdraw, not
// fragment work, and it is the first time on this arc that the number could plausibly be large.
//
// USAGE — the harness must already be serving, on a port of your own:
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5361 --strictPort --host 127.0.0.1
//   DISPLAY=:0 ST_CANOPY_URL=http://127.0.0.1:5361/shipped-canopy.html \
//     pnpm --filter @storytree/forest-world-r3f measure-canopy-cost
//
// ⚠ `DISPLAY=:0` MUST BE IN THE ENVIRONMENT EVEN HEADLESS. Without it Chromium falls back to
// SwiftShader on this box, silently, and this instrument's entire output is frame times. The
// renderer string is read out of the live context and the run REFUSES on a software rasteriser.
//
// ⚠ TWO RUNS, DIFFED ROW BY ROW BY THIS DRIVER — `run-agreement.ts`, with the tolerance DERIVED
// from the runs' own within-run spread rather than authored. A single-run invocation is loudly
// labelled and exits 4. On this arc's last frame-cost increment the forest rows came back 170-530%
// apart between runs and were dropped rather than averaged; that is what this enforces.
//
// ⚠ THE PLAN IS ROUND-ROBIN, NOT ARM-BY-ARM. Timing every repeat of one arm together lets a
// thermal or scheduling drift land entirely on one arm and read as that arm's cost;
// `roundRobinPlan` interleaves so a drift is spread across all of them, and `isInterleaved`
// refuses a plan that is not.
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked. Every number it prints is
// computed in the typechecked modules (`harness/shipped-canopy-scene.ts`'s `cost()`,
// `harness/frame-budget.ts`, `harness/run-agreement.ts`); this starts a browser, walks one page
// and decides an exit code (`measurement-instrument-must-be-typechecked`).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { FRAME_BUDGET_60HZ_MS, median, spread } from './frame-budget.ts';
import { isInterleaved, roundRobinPlan } from './frame-cost.ts';
import { MIN_RUNS_FOR_AGREEMENT, runAgreement } from './run-agreement.ts';
import { CANOPY_ARMS, CONTROL_ARM, SHIPPED_GROVE_ARM } from './shipped-canopy-scene.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_CANOPY_URL'] ?? 'http://localhost:5361/shipped-canopy.html';
const OUT =
  process.env['ST_CANOPY_COST_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-ground-canopy-2026-09-03');

/** The picture the cost is asked about: the whole map, fitted — the view the site OPENS on. */
const SIZE = 'forest';
const ZOOM = 'fit';
/** Frames inside one GPU query. A single frame here is comparable to the timer's own resolution. */
const BATCH = 20;
/** How many interleaved repeats each arm gets, per run. */
const REPEATS = 5;
/** Independent sweeps, each with its own plan. Two is the floor a reproducibility claim needs. */
const RUNS = MIN_RUNS_FOR_AGREEMENT;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

// ⚠ 5184 is the default every worktree's vite pins, so two harnesses on one box would serve each
// other's pages and the number would belong to whichever branch started first.
if (URL_.includes(':5184/')) {
  fail(
    "ST_CANOPY_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
      'worktree may own it, and the frame cost would be its tree rather than this one.',
  );
}

mkdirSync(OUT, { recursive: true });

const ARMS = [...CANOPY_ARMS];
const plan = roundRobinPlan(ARMS, REPEATS);
if (!isInterleaved(plan, ARMS)) {
  fail('the sweep plan is not interleaved — a thermal drift would land on one arm and read as its cost');
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 300000 });
await page.waitForFunction(() => window.canopyRunner !== undefined, null, { timeout: 300000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

/**
 * ONE INDEPENDENT SWEEP. Every sample is a fresh GPU query over its own warmed scene.
 *
 * ⚠ ONE UNTIMED PASS OVER EVERY ARM FIRST, AND ITS READINGS ARE THROWN AWAY. The first `cost()`
 * call for an arm BUILDS its scene — merging up to 3.1 million triangles of kit geometry and
 * uploading them — and on this driver part of that upload lands inside the first timed batch.
 * Measured: without it `bare` came back with a within-run spread of 1.63 ms against a 0.42 ms
 * median, i.e. a noise floor four times the figure, and `run-agreement` then derives its tolerance
 * from that noise and agrees with almost anything.
 */
const warmAll = () =>
  page.evaluate(
    async ([arms, size, zoom]) => {
      const r = window.canopyRunner;
      for (const arm of arms) await r.cost({ arm, size, zoom, batch: 1 });
      return true;
    },
    [ARMS, SIZE, ZOOM],
  );

const sweep = async () =>
  page.evaluate(
    async ([plan_, size, zoom, batch]) => {
      const r = window.canopyRunner;
      const out = [];
      for (const arm of plan_) out.push(await r.cost({ arm, size, zoom, batch }));
      return { id: r.identity(), samples: out };
    },
    [plan, SIZE, ZOOM, BATCH],
  );

await warmAll();

const runs = [];
for (const _ of Array.from({ length: RUNS })) {
  void _;
  runs.push(await sweep());
}
await browser.close();

const id = runs[0].id;
if (id.software) {
  fail(
    `the renderer is a software rasterizer (${id.renderer}). A frame time off SwiftShader is not ` +
      'comparable to any committed figure on this arc, and this instrument reports nothing else.',
  );
}

// ⚠ EVERY REFUSAL BELOW IS A WAY THIS RUN COULD PRINT A NUMBER THAT MEANS NOTHING.
for (const run of runs) {
  for (const s of run.samples) {
    if (!s.timerQueryAvailable) fail(`${s.arm}: no ${'EXT_disjoint_timer_query_webgl2'} — there is no GPU clock to read`);
    if (s.hidden) fail(`${s.arm}: the page was HIDDEN, which suspends rAF and throttles the compositor`);
  }
}

/** A run's rows: one median and one within-run spread per arm, over its usable samples. */
const rowsOf = (run) => {
  const rows = [];
  for (const arm of ARMS) {
    const usable = run.samples.filter((s) => s.arm === arm && s.gpuMsPerFrame !== null).map((s) => s.gpuMsPerFrame);
    if (usable.length === 0) fail(`${arm}: every sample was disjoint or untimed — nothing to quote`);
    rows.push({ key: arm, medianMs: median(usable), spreadMs: spread(usable) });
  }
  return rows;
};

const perRun = runs.map(rowsOf);
const agreement = runAgreement(perRun);
const quotable = (arm) => !agreement.droppedKeys.includes(arm);

/** The figure quoted for an arm: the median of its per-run medians. */
const costOf = (arm) => median(perRun.map((rows) => rows.find((r) => r.key === arm).medianMs));
const drawnBy = (arm) => runs[0].samples.find((s) => s.arm === arm);

const lines = [];
const say = (t) => {
  lines.push(t);
  console.log(t);
};

say(`renderer: ${id.vendor} — ${id.renderer}`);
say(`software=${id.software}`);
say(
  `plan: ${ARMS.length} arms x ${REPEATS} interleaved repeats x ${BATCH} frames per GPU query, ` +
    `${RUNS} independent runs · picture: the ${SIZE} at ${ZOOM}`,
);
say('');
say(`THE DRESSED FOREST'S FRAME COST — the GPU's own clock, ${SIZE} @ ${ZOOM}`);
say('arm          calls       tris   ms/frame   spread   vs bare   % of a 60Hz frame');
for (const arm of ARMS) {
  const d = drawnBy(arm);
  const ms = costOf(arm);
  const sp = median(perRun.map((rows) => rows.find((r) => r.key === arm).spreadMs));
  const delta = arm === CONTROL_ARM ? 0 : ms - costOf(CONTROL_ARM);
  say(
    `${arm.padEnd(12)} ${String(d.drawCalls).padStart(5)} ${String(d.triangles).padStart(10)} ` +
      `${ms.toFixed(4).padStart(10)} ${sp.toFixed(4).padStart(8)} ` +
      `${(arm === CONTROL_ARM ? '—' : `+${delta.toFixed(4)}`).padStart(9)} ` +
      `${((ms / FRAME_BUDGET_60HZ_MS) * 100).toFixed(1).padStart(8)}%` +
      (quotable(arm) ? '' : '   ⚠ DROPPED — did not reproduce'),
  );
}
say('');
say('DID IT REPRODUCE?');
say(`  ${agreement.prose}`);
for (const d of agreement.dropped) say(`  ⚠ ${d}`);
if (agreement.suspectIdentical) {
  say('  ⚠ every row was BIT-IDENTICAL across runs. For a GPU clock that is evidence the second');
  say('    sweep did not happen, not evidence of stability — do not quote these.');
}
say('');

const shipped = costOf(SHIPPED_GROVE_ARM);
const bare = costOf(CONTROL_ARM);
say('WHAT IT MEANS FOR THE BUDGET (16.67 ms at 60 Hz):');
say(
  `  the SHIPPED picture (${SHIPPED_GROVE_ARM}) draws the whole 35-island map, dressed, in ` +
    `${shipped.toFixed(4)} ms — ${((shipped / FRAME_BUDGET_60HZ_MS) * 100).toFixed(1)}% of a frame.`,
);
say(
  `  the dressing itself is +${(shipped - bare).toFixed(4)} ms over the bare ground ` +
    `(${(((shipped - bare) / FRAME_BUDGET_60HZ_MS) * 100).toFixed(1)}% of a frame).`,
);
say(
  '  ⚠ THIS IS THE GPU’S DRAW COST FOR THIS SCENE AND NOTHING ELSE. It is not the site’s frame ' +
    'time: the shipped canvas also runs React, controls and the compositor, none of which are on this page.',
);

const budgetBroken = quotable(SHIPPED_GROVE_ARM) && shipped >= FRAME_BUDGET_60HZ_MS;
if (budgetBroken) {
  say('');
  say(`  ⚠⚠ THE SHIPPED ARM DOES NOT FIT A 60 Hz FRAME on this box. The density rung is the lever.`);
}

writeFileSync(join(OUT, 'frame-cost.txt'), `${lines.join('\n')}\n`, 'utf8');
writeFileSync(
  join(OUT, 'frame-cost.json'),
  `${JSON.stringify({ id, plan: { arms: ARMS, repeats: REPEATS, batch: BATCH, runs: RUNS, size: SIZE, zoom: ZOOM }, runs, agreement }, null, 2)}\n`,
  'utf8',
);
console.log(`\nwrote ${join(OUT, 'frame-cost.txt')} and frame-cost.json`);

if (agreement.status === 'SINGLE_RUN' || agreement.status === 'NO_RUNS') {
  console.error(`\n⚠ ${agreement.status}: a reproducibility claim needs ${MIN_RUNS_FOR_AGREEMENT} runs.`);
  process.exit(4);
}
if (budgetBroken) process.exit(1);
