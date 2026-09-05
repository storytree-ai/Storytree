// shipped-per-capability-cost.mjs — the GPU's own clock over the one-tree-per-capability page's
// arms: what the map costs per frame with the grove gone, at each cover count rung, against the map
// as it shipped, on the whole fitted forest and on one island.
//
// The same instrument as `shipped-cover-cost.mjs` (round-robin interleaved sweeps, two independent
// runs diffed row by row by `run-agreement.ts`), pointed at `shipped-per-capability.html`.
//
// ⚠⚠ THIS REPORTS AND DOES NOT GATE (ADR-0517 D4). Removing ~94% of the trees improves every number
// (ADR-0518's consequences say so in advance); the number is taken on the arc's named box
// (ADR-0505 D3), written beside the sheet and quoted in the debrief as a report. It is not the reason
// for the change, it does not pick the rung, and a good number does not substitute for the look.
// The exit code below says whether the MEASUREMENT reproduced, never whether the picture is affordable.
//
//   ST_PER_CAPABILITY_URL=http://127.0.0.1:<port>/shipped-per-capability.html pnpm --filter @storytree/forest-world-r3f measure-per-capability-cost

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { FRAME_BUDGET_60HZ_MS, median, spread } from './frame-budget.ts';
import { isInterleaved, roundRobinPlan } from './frame-cost.ts';
import { MIN_RUNS_FOR_AGREEMENT, runAgreement } from './run-agreement.ts';
import { CONTROL_ARM, PER_CAPABILITY_ARMS, SHIPPED_ARM } from './shipped-per-capability-scene.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_PER_CAPABILITY_URL'] ?? 'http://localhost:5377/shipped-per-capability.html';
const OUT =
  process.env['ST_PER_CAPABILITY_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-one-tree-per-capability-2026-09-05');
const ANGLE = process.env['ST_PER_CAPABILITY_ANGLE'] ?? 'gl';
/** The two pictures priced: the whole fitted forest (the view the map opens on) and one island at
 *  the read zoom. */
const PICTURES = [
  { size: 'forest', zoom: 'fit' },
  { size: 'one', zoom: 8 },
];
const BATCH = 20;
const REPEATS = 5;
const RUNS = MIN_RUNS_FOR_AGREEMENT;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (URL_.includes(':5184/')) {
  fail(
    "ST_PER_CAPABILITY_URL points at 5184, the port every worktree's vite pins by default — a sibling " +
      'worktree may own it, and the frame cost would be its tree rather than this one.',
  );
}

mkdirSync(OUT, { recursive: true });

const ARMS = PER_CAPABILITY_ARMS.map((a) => a.id);
const CONFIGS = PICTURES.flatMap((p) => ARMS.map((arm) => ({ arm, size: p.size, zoom: p.zoom })));
const keyOf = (c) => `${c.arm}|${c.size}|${c.zoom}`;
const plan = roundRobinPlan(CONFIGS, REPEATS);
if (!isInterleaved(plan, CONFIGS)) {
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
await page.waitForFunction(() => window.perCapabilityRunner !== undefined, null, { timeout: 600000 });
if (pageErrors.length > 0) fail(`the page reported errors:\n  ${pageErrors.join('\n  ')}`);

const warmAll = () =>
  page.evaluate(
    async ([configs]) => {
      const r = window.perCapabilityRunner;
      for (const c of configs) await r.cost({ ...c, batch: 1 });
      return true;
    },
    [CONFIGS],
  );
const sweep = async () =>
  page.evaluate(
    async ([plan_, batch]) => {
      const r = window.perCapabilityRunner;
      const out = [];
      for (const c of plan_) out.push(await r.cost({ ...c, batch }));
      return { id: r.identity(), samples: out };
    },
    [plan, BATCH],
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
    if (!s.timerQueryAvailable) fail(`${s.arm}: no EXT_disjoint_timer_query_webgl2 — there is no GPU clock to read`);
    if (s.hidden) fail(`${s.arm}: the page was HIDDEN, which suspends rAF and throttles the compositor`);
  }
}

const rowsOf = (run) => {
  const rows = [];
  for (const c of CONFIGS) {
    const usable = run.samples
      .filter((s) => keyOf(s) === keyOf(c) && s.gpuMsPerFrame !== null)
      .map((s) => s.gpuMsPerFrame);
    if (usable.length === 0) fail(`${keyOf(c)}: every sample was disjoint or untimed — nothing to quote`);
    rows.push({ key: keyOf(c), medianMs: median(usable), spreadMs: spread(usable) });
  }
  return rows;
};
const perRun = runs.map(rowsOf);
const agreement = runAgreement(perRun);
const quotable = (key) => !agreement.droppedKeys.includes(key);
const costOf = (key) => median(perRun.map((rows) => rows.find((r) => r.key === key).medianMs));
const spreadOf = (key) => median(perRun.map((rows) => rows.find((r) => r.key === key).spreadMs));
const drawnBy = (key) => runs[0].samples.find((s) => keyOf(s) === key);

const lines = [];
const say = (t) => {
  lines.push(t);
  console.log(t);
};
say(`renderer: ${id.vendor} — ${id.renderer}`);
say(`software=${id.software}`);
say(
  `plan: ${CONFIGS.length} configurations (${ARMS.length} arms × ${PICTURES.length} pictures) x ${REPEATS} interleaved repeats x ${BATCH} frames per GPU query, ` +
    `${RUNS} independent runs`,
);
say('');
say('⚠ THIS REPORTS AND DOES NOT GATE (ADR-0517 D4): the owner ruled the look ships first and is scaled down later if it proves too expensive. A better number here is a side effect of removing the grove, not the reason for it (ADR-0518).');
say('');
for (const p of PICTURES) {
  const control = keyOf({ arm: CONTROL_ARM, ...p });
  say(`ONE TREE PER CAPABILITY — FRAME COST on the GPU's own clock, ${p.size} @ ${p.zoom}`);
  say('arm             calls       tris   ms/frame   spread   vs today    % of a 60Hz frame');
  for (const arm of ARMS) {
    const key = keyOf({ arm, ...p });
    const d = drawnBy(key);
    const ms = costOf(key);
    const delta = arm === CONTROL_ARM ? 0 : ms - costOf(control);
    say(
      `${arm.padEnd(15)} ${String(d.drawCalls).padStart(5)} ${String(d.triangles).padStart(10)} ` +
        `${ms.toFixed(4).padStart(10)} ${spreadOf(key).toFixed(4).padStart(8)} ` +
        `${(arm === CONTROL_ARM ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`).padStart(10)} ` +
        `${((ms / FRAME_BUDGET_60HZ_MS) * 100).toFixed(1).padStart(8)}%` +
        (quotable(key) ? '' : '   ⚠ DROPPED — did not reproduce') +
        (arm === SHIPPED_ARM ? '   ← SHIPPED' : arm === CONTROL_ARM ? '   ← TODAY (before this landing)' : ''),
    );
  }
  say('');
}
say('DID IT REPRODUCE?');
say(`  ${agreement.prose}`);
for (const d of agreement.dropped) say(`  ⚠ ${d}`);
if (agreement.suspectIdentical) {
  say('  ⚠ every row was BIT-IDENTICAL across runs. For a GPU clock that is evidence the second');
  say('    sweep did not happen, not evidence of stability — do not quote these.');
}
say('');
const forestShipped = keyOf({ arm: SHIPPED_ARM, size: 'forest', zoom: 'fit' });
const forestBefore = keyOf({ arm: CONTROL_ARM, size: 'forest', zoom: 'fit' });
const shipped = costOf(forestShipped);
const before = costOf(forestBefore);
say('WHAT IT MEANS FOR THE BUDGET (16.67 ms at 60 Hz):');
say(
  `  the SHIPPED picture (${SHIPPED_ARM}) draws the whole 35-island map, one tree per capability and covered, in ` +
    `${shipped.toFixed(4)} ms — ${((shipped / FRAME_BUDGET_60HZ_MS) * 100).toFixed(1)}% of a frame.`,
);
say(
  `  against the map as it shipped until this landing (${CONTROL_ARM}) that is ${shipped - before >= 0 ? '+' : ''}${(shipped - before).toFixed(4)} ms ` +
    `(${(((shipped - before) / FRAME_BUDGET_60HZ_MS) * 100).toFixed(1)}% of a frame; ${(shipped / before).toFixed(2)}x).`,
);
say(
  '  ⚠ THIS IS THE GPU’S DRAW COST FOR THIS SCENE AND NOTHING ELSE. It is not the site’s frame ' +
    'time: the shipped canvas also runs React, controls and the compositor, none of which are on this page.',
);
if (quotable(forestShipped) && shipped >= FRAME_BUDGET_60HZ_MS) {
  say('');
  say('  ⚠⚠ THE SHIPPED ARM DOES NOT FIT A 60 Hz FRAME on this box. REPORTED, not acted on (ADR-0517 D4): the count rung is the owner’s lever.');
}
writeFileSync(join(OUT, 'frame-cost.txt'), `${lines.join('\n')}\n`, 'utf8');
writeFileSync(
  join(OUT, 'frame-cost.json'),
  `${JSON.stringify({ id, plan: { configs: CONFIGS, repeats: REPEATS, batch: BATCH, runs: RUNS }, runs, agreement }, null, 2)}\n`,
  'utf8',
);
console.log(`\nwrote ${join(OUT, 'frame-cost.txt')} and frame-cost.json`);
if (agreement.status === 'SINGLE_RUN' || agreement.status === 'NO_RUNS') {
  console.error(`\n⚠ ${agreement.status}: a reproducibility claim needs ${MIN_RUNS_FOR_AGREEMENT} runs.`);
  process.exit(4);
}
