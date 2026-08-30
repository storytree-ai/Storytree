// shipped-crowd-measure.mjs — DRIVER for the shipped ground at forest scale: two ladders, three
// crowd sizes, two zooms, on one buffer and one camera.
//
// Reproduce (⚠ needs a real GPU — see the refusals below):
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5288 --strictPort
//   DISPLAY=:0 ST_CROWD_LAND_URL=http://localhost:5288/shipped-crowd.html \
//     pnpm --filter @storytree/forest-world-r3f measure-shipped-crowd
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked — `tsconfig.json` covers only
// `.ts`/`.tsx`. Every number is computed in the typechecked modules (`shipped-crowd-scene.ts`,
// `frame-budget.ts`); this starts a browser, interleaves a sweep and decides an exit code
// (`measurement-instrument-must-be-typechecked`).
//
// ⚠ `DISPLAY=:0` MUST BE SET EVEN HEADLESS and the ANGLE flags must be passed, or Chromium falls
// back to SwiftShader SILENTLY and every frame figure is a software rasteriser's.
//
// ⚠ IT REFUSES rather than reporting on: a software renderer · no timer query · the pinned default
// port every worktree shares · a console error or an HTTP >= 400 · any arm disagreeing with its
// partner about triangles, parcels, framing or draw calls · a blank readback · a scene submitting
// more than ONE draw call (the claim this page exists to hold) · a crowd that is not bigger than
// the island it is a crowd of · a physically impossible frame cost.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { FRAME_BUDGET_60HZ_MS, frameBudgetVerdict, median, spread } from './frame-budget.ts';
import { CROWD_ARMS, CROWD_SIZES, CROWD_ZOOMS, FIT_ZOOM } from './shipped-crowd-scene.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_CROWD_LAND_URL'] ?? 'http://localhost:5288/shipped-crowd.html';
const OUT =
  process.env['ST_CROWD_LAND_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-shipped-crowd-2026-08-31');

// Same escape hatch, same narrow warrant as the page next door: the GEOMETRY and DRAW-CALL claims
// are renderer-independent, the FRAME figures are not. This flag develops the former on a box with
// no GPU and stamps the run so a reader cannot mistake one for the other. Every committed figure
// comes off the Mint box.
const ALLOW_SOFTWARE = process.env['ST_CROWD_LAND_ALLOW_SOFTWARE'] === '1';

/** ⚠⚠ `gl` IS THE DEFAULT because every committed figure on this arc was taken with it, and a
 *  comparison whose renderer moved between runs is not a comparison. On the WINDOWS box that comes
 *  up on SwiftShader with a BLANK readback — use `ST_CROWD_LAND_ANGLE=default` there, which reaches
 *  the real GPU and is for developing this page, never for a committed number. */
const ANGLE = process.env['ST_CROWD_LAND_ANGLE'] ?? 'gl';

const REPEATS = Number(process.env['ST_CROWD_LAND_REPEATS'] ?? 7);
// 300 renders per timed batch — the figure `shipped-land-measure.mjs` records: at a batch of 20 the
// overview zoom on this arc repeatably reported a HEAVIER scene as faster, which is physically
// impossible and means the batch was too short to rise above the timer's own floor. Kept identical
// so a crowd row and an island row are comparable without a conversion.
const BATCH = Number(process.env['ST_CROWD_LAND_BATCH'] ?? 300);

const fail = (why) => {
  console.error(`\nREFUSED: ${why}\n`);
  process.exit(1);
};

/** ⚠ 5184 is the default every worktree's vite pins. Two harnesses on one box would serve each
 *  other's pages and the numbers would belong to whichever branch started first. */
if (URL_.includes(':5184/')) {
  fail('port 5184 is the shared worktree default — start vite on a free port.');
}

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    `--use-angle=${ANGLE}`,
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
  ],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
const httpErrors = [];
page.on('response', (r) => {
  if (r.status() >= 400) httpErrors.push(`${r.status()} ${r.url()}`);
});

await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForFunction(() => 'crowdRunner' in window, null, { timeout: 180_000 });

if (consoleErrors.length > 0) fail(`the page logged errors:\n  ${consoleErrors.join('\n  ')}`);
if (httpErrors.length > 0) fail(`the page failed to load something:\n  ${httpErrors.join('\n  ')}`);

const identity = await page.evaluate(() => window.crowdRunner.identity());
console.log(`renderer: ${identity.vendor} — ${identity.renderer}`);
if (identity.software && !ALLOW_SOFTWARE) {
  fail(
    `${identity.renderer} is a SOFTWARE rasteriser. A frame figure taken here is not a hardware ` +
      'verdict — take it on a box with a discrete GPU (the Mint box, `ssh mint`). To develop the ' +
      'GEOMETRY half here, set ST_CROWD_LAND_ALLOW_SOFTWARE=1: the run then stamps itself and its ' +
      'frame figures come back UNVERIFIED rather than looking like measurements.',
  );
}
if (identity.software) {
  console.log('');
  console.log('  ############################################################');
  console.log('  #  SOFTWARE RASTERISER — FRAME FIGURES BELOW ARE NOT REAL  #');
  console.log('  #  Geometry and draw-call claims hold; timings UNVERIFIED. #');
  console.log('  ############################################################');
  console.log('');
}
if (!identity.timerQuery && !identity.software) {
  fail(
    'EXT_disjoint_timer_query_webgl2 is unavailable. A wall clock times SUBMISSION rather than ' +
      'EXECUTION and was wrong by 30-250x when this arc last tried it (PR #1683).',
  );
}

await page.evaluate(() => window.crowdRunner.warm());

const SIZES = CROWD_SIZES.map((s) => s.id);
const key = (arm, size, zoom) => `${arm}|${size}|${zoom}`;

// ── THE SWEEP — INTERLEAVED, so a thermal or scheduling drift hits every configuration alike
//    rather than landing entirely on whichever one ran last.
const readings = new Map();
for (let repeat = 0; repeat < REPEATS; repeat += 1) {
  for (const zoom of CROWD_ZOOMS) {
    for (const size of SIZES) {
      for (const arm of CROWD_ARMS) {
        const r = await page.evaluate(
          ([a, s, z, b]) => window.crowdRunner.time(a, s, z, b),
          [arm, size, zoom, BATCH],
        );
        const k = key(arm, size, zoom);
        const got = readings.get(k) ?? { ...r, samples: [] };
        if (r.gpuNs !== null) got.samples.push(r.gpuNs / 1e6);
        readings.set(k, got);
      }
    }
  }
}

// ── THE CLAIM THIS PAGE EXISTS TO HOLD. One mesh, one material, one draw call — on one island and
//    on thirty-five. If this ever fails, the increment's original premise was right after all and
//    every per-island frame figure on this arc understates the map.
for (const [k, r] of readings) {
  if (r.drawCalls !== 1) {
    fail(
      `${k} submitted ${r.drawCalls} draw calls. The whole finding of this page is that the ` +
        "forest's ground is ONE — if that stopped being true, the adopted ladder's per-draw cost " +
        'multiplies across the map and the adoption needs re-costing.',
    );
  }
}

// ── THE CONTROLS. Arms that differ in more than the one thing are not a comparison.
for (const zoom of CROWD_ZOOMS) {
  for (const size of SIZES) {
    const a = readings.get(key('shadow', size, zoom));
    const b = readings.get(key('dense', size, zoom));
    if (!a || !b) fail(`the sweep is missing ${size} at zoom ${zoom}`);
    for (const field of ['triangles', 'parcels', 'islands', 'statusRows', 'width', 'height', 'pxPerUnit', 'casters', 'shadowW', 'shadowH']) {
      if (a[field] !== b[field]) {
        fail(
          `at zoom ${zoom}/${size} the arms disagree about ${field} (${a[field]} vs ${b[field]}) ` +
            '— they must differ in the ladder and in nothing else',
        );
      }
    }
  }
  // NON-VACUITY OF THE CROWD AXIS. A crowd that is not bigger than its own island is not a crowd,
  // and every row below would be a comparison of a thing with itself.
  const one = readings.get(key('dense', 'one', zoom));
  const forest = readings.get(key('dense', 'forest', zoom));
  if (forest.triangles <= one.triangles) {
    fail(
      `at zoom ${zoom} the forest carries ${forest.triangles} triangles against the single ` +
        `island's ${one.triangles} — the crowd is not standing up`,
    );
  }
  const mono = readings.get(key('dense', 'forest-mono', zoom));
  if (mono.triangles !== forest.triangles) {
    fail(
      `at zoom ${zoom} the mono control carries ${mono.triangles} triangles against the real ` +
        `forest's ${forest.triangles} — it is only a control if the geometry is identical`,
    );
  }
  if (!(forest.statusRows > mono.statusRows)) {
    fail(
      `at zoom ${zoom} the real forest carries ${forest.statusRows} ramp rows and the mono ` +
        `control ${mono.statusRows} — the status spread this pair exists to isolate is absent`,
    );
  }
}

// ── DID ANYTHING GET DRAWN? A blank readback satisfies every comparison below in the direction
//    that reads as a result, and is exactly what `--use-angle=gl` delivers on the Windows box.
const colours = new Map();
for (const zoom of CROWD_ZOOMS) {
  for (const size of SIZES) {
    for (const arm of CROWD_ARMS) {
      colours.set(
        key(arm, size, zoom),
        await page.evaluate(
          ([a, s, z]) => window.crowdRunner.colours(a, s, z),
          [arm, size, zoom],
        ),
      );
    }
  }
}
for (const [k, c] of colours) {
  if (c.distinct <= 1) {
    fail(
      `${k} delivered ${c.distinct} distinct colour(s) — the page drew nothing readable. This is ` +
        'a RENDERER problem, not a treatment problem: on the Windows box `--use-angle=gl` comes ' +
        'up on SwiftShader with a blank readback. Use `ST_CROWD_LAND_ANGLE=default` to develop ' +
        'locally, and take committed figures on the Mint box.',
    );
  }
  if (c.landPixels === 0) {
    fail(`${k} put no land in the frame at all — the camera is not looking at the forest.`);
  }
}

// ── DOES THE LADDER CHANGE THE PICTURE? A ladder that moved no pixel would be an adoption nobody
//    could see, and every timing below would be about two identical frames.
const changed = new Map();
for (const zoom of CROWD_ZOOMS) {
  for (const size of SIZES) {
    const pct = await page.evaluate(
      ([s, z]) => window.crowdRunner.changedPct('shadow', 'dense', s, z),
      [size, zoom],
    );
    changed.set(`${size}|${zoom}`, pct);
    if (pct === 0) {
      fail(
        `at zoom ${zoom}/${size} the two ladders deliver an identical frame — either the arm ` +
          'mapping collapsed (both arms on one ladder) or the material stopped reading `lit`.',
      );
    }
  }
}

// ── WHAT FOREST SCALE DID TO ONE ISLAND'S PICTURE. At 8 px/unit every scene is framed on the SAME
//    island, and the geometry off screen changes no pixel in it — so this holds the ladder, the
//    relief, the grain, the parcels and the camera fixed, and what moves is the occlusion field's
//    resolution. `occlusionGres` clamps it from 3.0 samples per ground unit on one island to
//    whatever `SHADOW_TEXTURE_MAX` leaves on a 3,500-unit forest, and that branch had never run
//    before this page. This is the number that says whether it survived.
const scale = new Map();
for (const zoom of CROWD_ZOOMS) {
  for (const arm of CROWD_ARMS) {
    scale.set(
      `${arm}|${zoom}`,
      await page.evaluate(
        ([a, z]) => window.crowdRunner.changedBySize(a, 'one', 'forest', z),
        [arm, zoom],
      ),
    );
  }
}

// ── THE PICTURES.
mkdirSync(OUT, { recursive: true });
const shots = [];
for (const arm of CROWD_ARMS) {
  const png = await page.evaluate(
    ([a]) => window.crowdRunner.snapshot(a, 'forest', 'fit'),
    [arm, FIT_ZOOM],
  );
  const name = `crowd-fit-${arm}.png`;
  writeFileSync(join(OUT, name), Buffer.from(png.split(',')[1], 'base64'));
  shots.push(name);
}
for (const zoom of CROWD_ZOOMS) {
  for (const size of SIZES) {
    for (const arm of CROWD_ARMS) {
      const png = await page.evaluate(
        ([a, s, z]) => window.crowdRunner.snapshot(a, s, z),
        [arm, size, zoom],
      );
      const name = `crowd-${size}-${zoom}px-${arm}.png`;
      writeFileSync(join(OUT, name), Buffer.from(png.split(',')[1], 'base64'));
      shots.push(name);
    }
  }
}

// ── THE REPORT.
const rows = [];
for (const zoom of CROWD_ZOOMS) {
  for (const size of SIZES) {
    for (const arm of CROWD_ARMS) {
      const r = readings.get(key(arm, size, zoom));
      const c = colours.get(key(arm, size, zoom));
      const ms = r.samples.length > 0 ? median(r.samples) : null;
      if (ms !== null && ms <= 0) {
        fail(`${key(arm, size, zoom)} timed at ${ms} ms — a frame cannot cost nothing.`);
      }
      rows.push({
        zoom,
        size,
        arm,
        ms,
        spreadMs: r.samples.length > 1 ? spread(r.samples) : null,
        pctOfFrame: ms === null ? null : (ms / FRAME_BUDGET_60HZ_MS) * 100,
        triangles: r.triangles,
        parcels: r.parcels,
        islands: r.islands,
        statusRows: r.statusRows,
        drawCalls: r.drawCalls,
        shadowGres: r.shadowGres,
        shadowTexels: `${r.shadowW}x${r.shadowH}`,
        occlusionCoverage: r.occlusionCoverage,
        landPixels: c.landPixels,
        landFraction: c.landFraction,
      });
    }
  }
}

const fmt = (v, d = 4) => (v === null || v === undefined ? '   —   ' : v.toFixed(d));
console.log('');
// ⚠ THE SPREAD COLUMN IS MILLISECONDS, NOT A PERCENTAGE, and it is printed to four decimals for
// that reason: `spread()` returns the run-to-run range in ms, and at these costs the whole range
// is hundredths of a millisecond. Printed to one decimal it reads `0.0` — which a reader takes as
// "no variance at all" when the budget verdict two screens down is calling the same figure a
// 0.05 ms noise floor and withholding deltas against it.
console.log('zoom  size          arm     ms/frame  %60Hz   spread(ms)  draws  tris    rows  land%');
for (const r of rows) {
  console.log(
    `${String(r.zoom).padStart(4)}  ${r.size.padEnd(12)}  ${r.arm.padEnd(6)}  ` +
      `${fmt(r.ms).padStart(8)}  ${fmt(r.pctOfFrame, 2).padStart(5)}  ` +
      `${fmt(r.spreadMs).padStart(10)}  ${String(r.drawCalls).padStart(5)}  ` +
      `${String(r.triangles).padStart(6)}  ${String(r.statusRows).padStart(4)}  ` +
      `${(r.landFraction * 100).toFixed(2).padStart(5)}`,
  );
}

// The three questions the page was built to answer, computed rather than left to a reader.
const at = (zoom, size, arm) => rows.find((r) => r.zoom === zoom && r.size === size && r.arm === arm);
const ratio = (a, b) => (a?.ms && b?.ms ? a.ms / b.ms : null);
console.log('');
console.log('THE LADDER (dense ÷ shadow), by scene:');
for (const zoom of CROWD_ZOOMS) {
  for (const size of SIZES) {
    const x = ratio(at(zoom, size, 'dense'), at(zoom, size, 'shadow'));
    console.log(`  ${String(zoom).padStart(2)} px/unit  ${size.padEnd(12)}  ${x === null ? '—' : `${x.toFixed(2)}x`}`);
  }
}
console.log('');
console.log('THE CROWD, on the adopted ladder:');
for (const zoom of CROWD_ZOOMS) {
  const geom = ratio(at(zoom, 'forest-mono', 'dense'), at(zoom, 'one', 'dense'));
  const rowsX = ratio(at(zoom, 'forest', 'dense'), at(zoom, 'forest-mono', 'dense'));
  const whole = ratio(at(zoom, 'forest', 'dense'), at(zoom, 'one', 'dense'));
  console.log(
    `  ${String(zoom).padStart(2)} px/unit  geometry ${geom === null ? '—' : `${geom.toFixed(2)}x`}  ` +
      `· status spread ${rowsX === null ? '—' : `${rowsX.toFixed(2)}x`}  ` +
      `· whole forest ${whole === null ? '—' : `${whole.toFixed(2)}x`}`,
  );
}
// ⚠ THE HEADLINE, COMPUTED RATHER THAN TYPED. `cadence-verdict.ts` exists in this package because
// a hand-written sentence in a report was once false while every computed number in it held up.
// This is that sentence, derived: what the whole forest WOULD have cost if the increment's premise
// had been right (one draw per island, so the per-draw cost multiplied by 35), against what it
// actually costs with one draw for all of them.
console.log('');
console.log('IF THE PREMISE HAD BEEN TRUE (one draw per island) vs WHAT IT COSTS (one for all):');
for (const zoom of CROWD_ZOOMS) {
  const one = at(zoom, 'one', 'dense');
  const forest = at(zoom, 'forest', 'dense');
  if (!one?.ms || !forest?.ms) continue;
  const feared = one.ms * forest.islands;
  console.log(
    `  ${String(zoom).padStart(2)} px/unit  feared ${feared.toFixed(4)} ms ` +
      `(${((feared / FRAME_BUDGET_60HZ_MS) * 100).toFixed(1)}% of a 60 Hz frame)  ` +
      `· measured ${forest.ms.toFixed(4)} ms (${forest.pctOfFrame.toFixed(2)}%)  ` +
      `· overstated by ${(feared / forest.ms).toFixed(1)}x`,
  );
}

console.log('');
console.log('THE PICTURE CHANGED BY (shadow → dense):');
for (const [k, pct] of changed) console.log(`  ${k.padEnd(20)} ${pct.toFixed(2)}% of pixels`);
console.log('');
console.log('THE OCCLUSION FIELD:');
for (const size of SIZES) {
  const r = at(CROWD_ZOOMS[0], size, 'dense');
  console.log(
    `  ${size.padEnd(12)} ${r.shadowTexels.padStart(9)} texels at ${r.shadowGres.toFixed(3)} samples/unit ` +
      `· ${(r.occlusionCoverage * 100).toFixed(2)}% of the field occluded`,
  );
}
console.log('');
console.log('WHAT FOREST SCALE DID TO ONE ISLAND\'S PICTURE (one → forest, same arm and zoom):');
for (const [k, pct] of scale) console.log(`  ${k.padEnd(20)} ${pct.toFixed(2)}% of pixels`);

// ⚠ ONE VERDICT PER ZOOM, NOT ONE OVER EVERYTHING, and the reason is the helper's own assumption
// rather than presentation. `frameBudgetVerdict` calls a row IMPOSSIBLE when it comes in faster
// than the baseline while doing "strictly more work" — which needs the rows to be ordered by work.
// WITHIN a zoom they are: `one` < `forest-mono` <= `forest`, and `shadow` < `dense`, because each
// adds geometry, ramp rows or ramp entries and takes nothing away. ACROSS zooms they are not
// comparable at all — a 2 px frame and an 8 px frame are different amounts of fragment work in
// different scenes — so a single verdict spanning both would manufacture IMPOSSIBLE rows out of a
// comparison nobody asked for. The control is the single island on the ladder the map used to
// wear: the configuration every committed figure on this arc was taken on.
const budgets = {};
for (const zoom of CROWD_ZOOMS) {
  const verdict = frameBudgetVerdict({
    rows: rows
      .filter((r) => r.zoom === zoom && r.ms !== null)
      .map((r) => ({
        label: `${r.size}/${r.arm}`,
        samples: readings.get(key(r.arm, r.size, r.zoom)).samples,
        software: identity.software,
        hidden: false,
      })),
    baselineLabel: 'one/shadow',
  });
  budgets[zoom] = verdict;
  console.log('');
  console.log(`FRAME BUDGET at ${zoom} px/unit: ${verdict.status} — ${verdict.prose}`);
  for (const why of verdict.failures) console.log(`  FAIL: ${why}`);
  for (const why of verdict.unverified) console.log(`  UNVERIFIED: ${why}`);
}

const report = {
  takenAt: process.env['ST_CROWD_LAND_STAMP'] ?? null,
  renderer: identity,
  software: identity.software,
  repeats: REPEATS,
  batch: BATCH,
  rows,
  changedPct: Object.fromEntries(changed),
  changedByScale: Object.fromEntries(scale),
  budgets,
  shots,
};
writeFileSync(join(OUT, 'crowd-readings.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log('');
console.log(`wrote ${shots.length} picture(s) + crowd-readings.json to ${OUT}`);

await browser.close();
