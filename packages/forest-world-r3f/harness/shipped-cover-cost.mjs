// shipped-cover-cost.mjs — the GPU's own clock over the cover page's dressed arms: what each size
// rung of the ground cover costs per frame on the whole fitted forest.
//
// The same instrument as `shipped-detail-cost.mjs` (round-robin interleaved sweeps, two independent
// runs diffed row by row by `run-agreement.ts`), pointed at `shipped-cover.html`.
//
// ⚠ THIS ONE IS EXPECTED TO MOVE, UNLIKE THE DETAIL PAGE'S. The texture rung and the lighting
// fraction cost bandwidth and a few multiplies; the ground cover adds thousands of OBJECTS and
// well over a million triangles to the fitted forest — 56% more geometry than the canopy alone —
// and it does so WITHOUT adding a draw call, because every prop is merged into the same
// per-material mesh. So this is the measurement that says whether the layer is affordable, and it
// is taken on the arc's named box (ADR-0505 D3) rather than argued.
//
// ⚠ THE THREE SIZE RUNGS DRAW THE SAME GEOMETRY. Every cover arm stands the same props at the same
// triangle count and differs only in each prop's SCALE, so any difference between the three cover
// rows is FRAGMENT cost — bigger props cover more pixels — and never vertex cost. A ladder whose
// rows differ by more than the runs' own spread is telling you the fill rate noticed.
//
//   ST_COVER_URL=http://127.0.0.1:<port>/shipped-cover.html pnpm --filter @storytree/forest-world-r3f measure-cover-cost

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { FRAME_BUDGET_60HZ_MS, median, spread } from './frame-budget.ts';
import { isInterleaved, roundRobinPlan } from './frame-cost.ts';
import { MIN_RUNS_FOR_AGREEMENT, runAgreement } from './run-agreement.ts';
import { CONTROL_ARM, DRESSED_ARMS, SHIPPED_COVER_ARM } from './shipped-cover-scene.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_COVER_URL'] ?? 'http://localhost:5372/shipped-cover.html';
const OUT =
  process.env['ST_COVER_COST_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-ground-cover-2026-09-04');
const ANGLE = process.env['ST_COVER_ANGLE'] ?? 'gl';
const SIZE = 'forest';
const ZOOM = 'fit';
const BATCH = 20;
const REPEATS = 5;
const RUNS = MIN_RUNS_FOR_AGREEMENT;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_COVER_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
      'worktree may own it, and the frame cost would be its tree rather than this one.',
  );
}

mkdirSync(OUT, { recursive: true });

const ARMS = [...DRESSED_ARMS];
const plan = roundRobinPlan(ARMS, REPEATS);
if (!isInterleaved(plan, ARMS)) {
  fail('the sweep plan is not interleaved — a thermal drift would land on one arm and read as its cost');
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', `--use-angle=${ANGLE}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(m.text());
});
await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 600000 });
await page.waitForFunction(() => window.coverRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const warmAll = () =>
  page.evaluate(
    async ([arms, size, zoom]) => {
      const r = window.coverRunner;
      for (const arm of arms) await r.cost({ arm, size, zoom, batch: 1 });
      return true;
    },
    [ARMS, SIZE, ZOOM],
  );
const sweep = async () =>
  page.evaluate(
    async ([plan_, size, zoom, batch]) => {
      const r = window.coverRunner;
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
for (const run of runs) {
  for (const s of run.samples) {
    if (!s.timerQueryAvailable) fail(`${s.arm}: no ${'EXT_disjoint_timer_query_webgl2'} — there is no GPU clock to read`);
    if (s.hidden) fail(`${s.arm}: the page was HIDDEN, which suspends rAF and throttles the compositor`);
  }
}

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
say(`THE GROUND COVER — FRAME COST on the GPU's own clock, ${SIZE} @ ${ZOOM}`);
say('arm             calls       tris   ms/frame   spread   vs today   % of a 60Hz frame');
for (const arm of ARMS) {
  const d = drawnBy(arm);
  const ms = costOf(arm);
  const sp = median(perRun.map((rows) => rows.find((r) => r.key === arm).spreadMs));
  const delta = arm === CONTROL_ARM ? 0 : ms - costOf(CONTROL_ARM);
  say(
    `${arm.padEnd(15)} ${String(d.drawCalls).padStart(5)} ${String(d.triangles).padStart(10)} ` +
      `${ms.toFixed(4).padStart(10)} ${sp.toFixed(4).padStart(8)} ` +
      `${(arm === CONTROL_ARM ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`).padStart(10)} ` +
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
const shipped = costOf(SHIPPED_COVER_ARM);
const today = costOf(CONTROL_ARM);
say('WHAT IT MEANS FOR THE BUDGET (16.67 ms at 60 Hz):');
say(
  `  the SHIPPED picture (${SHIPPED_COVER_ARM}) draws the whole 35-island map, dressed and covered, in ` +
    `${shipped.toFixed(4)} ms — ${((shipped / FRAME_BUDGET_60HZ_MS) * 100).toFixed(1)}% of a frame.`,
);
say(
  `  against today's map (${CONTROL_ARM} — the same trees, no ground cover) that is ${shipped - today >= 0 ? '+' : ''}${(shipped - today).toFixed(4)} ms ` +
    `(${(((shipped - today) / FRAME_BUDGET_60HZ_MS) * 100).toFixed(1)}% of a frame).`,
);
say(
  '  ⚠ THIS IS THE GPU’S DRAW COST FOR THIS SCENE AND NOTHING ELSE. It is not the site’s frame ' +
    'time: the shipped canvas also runs React, controls and the compositor, none of which are on this page.',
);
const budgetBroken = quotable(SHIPPED_COVER_ARM) && shipped >= FRAME_BUDGET_60HZ_MS;
if (budgetBroken) {
  say('');
  say('  ⚠⚠ THE SHIPPED ARM DOES NOT FIT A 60 Hz FRAME on this box. The size rung and the recipe’s counts are both levers.');
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
