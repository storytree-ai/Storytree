// shipped-land-measure.mjs — DRIVER for the shipped map's ground: a FIVE-arm ladder in which each
// rung differs from the one before it in exactly one thing (flat · + relief · + the banded ladder ·
// + the grain octave's NORMAL half · + its COLOUR half, that last one a REFERENCE ceiling rather
// than a shipped arm).
//
// Reproduce (⚠ needs a real GPU — see the refusals below):
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5252 --strictPort
//   DISPLAY=:0 ST_LAND_URL=http://localhost:5252/shipped-land.html \
//     pnpm --filter @storytree/forest-world-r3f measure-shipped-land
//
// ⚠ A SHELL ON PURPOSE. This is `.mjs`, so it is NOT typechecked — `tsconfig.json` covers only
// `.ts`/`.tsx`. Every number is computed in the typechecked modules (`shipped-land-scene.ts`,
// `frame-budget.ts`); this starts a browser, interleaves a sweep and decides an exit code
// (`measurement-instrument-must-be-typechecked`).
//
// ⚠ `DISPLAY=:0` MUST BE SET EVEN HEADLESS and the ANGLE flags must be passed, or Chromium falls
// back to SwiftShader SILENTLY and every frame figure is a software rasteriser's.
//
// ⚠ IT REFUSES rather than reporting on: a software renderer · the pinned default port every
// worktree shares · a console error or an HTTP >= 400 · any arm disagreeing with the control about
// triangle count, parcel count or framing (which would mean they differ in more than the one
// thing) · a flat arm whose buffer is not flat, or a relieved arm whose buffer is · a rung that
// changes no pixel at all · any arm delivering one distinct colour (a blank readback) · either
// PALETTE-CLOSED arm delivering a colour that is not an authored
// `(token x level)` entry · a non-interleaved sweep · a grain whose colour half the pure reader
// model says is admissible when the material's own comment says it is not.

import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { FRAME_BUDGET_60HZ_MS, frameBudgetVerdict, median, spread } from './frame-budget.ts';
import { grainColourHalfVerdict, admissibleMixCeiling } from './grain-status-reading.ts';
import {
  LAND_ARMS,
  LAND_STEPS,
  LAND_ZOOMS,
  PALETTE_CLOSED_ARMS,
} from './shipped-land-scene.ts';
import { CELL_GROUND_DEPTH } from '../src/cell-ground-geometry.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env['ST_LAND_URL'] ?? 'http://localhost:5231/shipped-land.html';
const OUT =
  process.env['ST_LAND_OUT'] ??
  join(HERE, '..', '..', '..', 'docs', 'research', 'chapter2-shipped-grain-2026-08-30');

// A SOFTWARE RASTERISER IS STILL REFUSED BY DEFAULT, and this escape hatch does not weaken that.
// The colour claims below (is the delivered palette closed? did the picture change?) are
// renderer-independent for an UNGRAINED land - measured on this arc: SwiftShader and an RTX 2060
// agreed to 0.025% of pixels. The FRAME claims are not, and neither is a grained picture
// (`grain-picture-is-renderer-specific`). So this flag exists to develop the colour half on a box
// with no GPU; every number and every picture that reaches `docs/research/` comes off the Mint
// box. The run stamps itself so a reader cannot mistake one for the other.
const ALLOW_SOFTWARE = process.env['ST_LAND_ALLOW_SOFTWARE'] === '1';

/**
 * WHICH ANGLE BACKEND CHROMIUM IS ASKED FOR. `gl` is the default because it is what every
 * committed figure on this arc was taken with, and a comparison whose renderer moved between
 * runs is not a comparison.
 *
 * ⚠⚠ AND BECAUSE IT IS THE DEFAULT, `ST_LAND_ALLOW_SOFTWARE=1` DOES NOT WORK ON THE WINDOWS BOX,
 * WHICH IS THE OPPOSITE OF WHAT THAT FLAG ADVERTISES. Measured 2026-08-30: under `--use-angle=gl`
 * Chromium there comes up on SwiftShader AND ITS READBACK IS BLANK — `readPixels` returns one
 * uniform colour for every arm, so `colours()` reports 1 distinct colour, every `changedPct` comes
 * back 0, and the run refuses with "that component is in the code and not in the picture" while
 * naming an innocent component. The palette closure would have passed VACUOUSLY on the same frame
 * (a blank picture delivers no off-palette pixels either). The blank-frame refusal below is what
 * turns that into a named cause.
 *
 * ⚠ THE SAME BOX HAS A REAL GPU UNDER `--use-angle=default` — measured, `ANGLE (Qualcomm,
 * Qualcomm(R) Adreno(TM) X1-85 GPU, D3D11)`, `software=false`, timer query available. So
 * `ST_LAND_ANGLE=default` is the working way to develop this page locally, and it is BETTER than
 * the software flag rather than a substitute for it. It is NOT a way to take a committed figure:
 * every number in `docs/research/chapter2-shipped-*` is an RTX 2060's, a grained picture is
 * renderer-specific to a quarter of its pixels (`grain-picture-is-renderer-specific`), and a table
 * whose rows came off two GPUs is not a ladder. Evidence still comes off the Mint box.
 */
const ANGLE = process.env['ST_LAND_ANGLE'] ?? 'gl';

const REPEATS = Number(process.env['ST_LAND_REPEATS'] ?? 7);
// 300 renders per timed batch, for the reason `kit-island-measure.mjs` records: at a batch of 20
// the overview zoom on this arc repeatably reported a HEAVIER scene as faster, which is
// physically impossible and means the batch was too short to rise above the timer's own floor.
const BATCH = Number(process.env['ST_LAND_BATCH'] ?? 300);

/** ⚠ 5184 is the default every worktree's vite pins. Two harnesses on one box would then serve
 *  each other's pages and the numbers would belong to whichever branch happened to start first. */
if (URL_.includes(':5184/')) {
  console.error('REFUSED: port 5184 is the shared worktree default — start vite on a free port.');
  process.exit(1);
}

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

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
await page.waitForFunction(() => 'landRunner' in window, null, { timeout: 120_000 });

if (consoleErrors.length > 0) fail(`the page logged errors:\n  ${consoleErrors.join('\n  ')}`);
if (httpErrors.length > 0) fail(`the page failed to load something:\n  ${httpErrors.join('\n  ')}`);

const identity = await page.evaluate(() => window.landRunner.identity());
console.log(`renderer: ${identity.vendor} — ${identity.renderer}`);
if (identity.software && !ALLOW_SOFTWARE) {
  fail(
    `${identity.renderer} is a SOFTWARE rasteriser. A frame figure taken here is not a hardware ` +
      'verdict — take it on a box with a discrete GPU (the Mint box, `ssh mint`). To develop the ' +
      'COLOUR half here, set ST_LAND_ALLOW_SOFTWARE=1: the run then stamps itself and its frame ' +
      'figures come back UNVERIFIED rather than looking like measurements.',
  );
}
if (identity.software) {
  console.log('');
  console.log('  ############################################################');
  console.log('  #  SOFTWARE RASTERISER — FRAME FIGURES BELOW ARE NOT REAL  #');
  console.log('  #  Colour and palette claims hold; timings are UNVERIFIED. #');
  console.log('  ############################################################');
  console.log('');
}
if (!identity.timerQuery && !identity.software) {
  fail(
    'EXT_disjoint_timer_query_webgl2 is unavailable. A wall clock times SUBMISSION rather than ' +
      'EXECUTION and was wrong by 30-250x when this arc last tried it (PR #1683).',
  );
}

await page.evaluate(() => window.landRunner.warm());

// ── THE SWEEP — INTERLEAVED, so a thermal or scheduling drift hits every arm alike rather than
//    landing entirely on whichever one ran last.
const readings = new Map();
for (let repeat = 0; repeat < REPEATS; repeat += 1) {
  for (const zoom of LAND_ZOOMS) {
    for (const arm of LAND_ARMS) {
      const r = await page.evaluate(
        ([a, z, b]) => window.landRunner.time(a, z, b),
        [arm, zoom, BATCH],
      );
      const key = `${arm}|${zoom}`;
      const got = readings.get(key) ?? { ...r, samples: [] };
      if (r.gpuNs !== null) got.samples.push(r.gpuNs / 1e6);
      readings.set(key, got);
    }
  }
}

// ── THE CONTROLS. Arms that differ in more than the one thing are not a comparison.
for (const zoom of LAND_ZOOMS) {
  const flat = readings.get(`flat|${zoom}`);
  if (!flat) fail(`the sweep is missing the flat arm at zoom ${zoom}`);
  for (const arm of LAND_ARMS) {
    const r = readings.get(`${arm}|${zoom}`);
    if (!r) fail(`the sweep is missing the ${arm} arm at zoom ${zoom}`);
    // EVERY arm draws the same island in the same frame with the same submission cost. Only the
    // relief field and the material may differ, and neither of those moves a triangle.
    for (const field of ['triangles', 'parcels', 'drawCalls', 'width', 'height']) {
      if (flat[field] !== r[field]) {
        fail(
          `at zoom ${zoom} ${arm} disagrees with flat about ${field} (${r[field]} vs ` +
            `${flat[field]}) — the arms must differ in one thing and in nothing else`,
        );
      }
    }
  }
  // NON-VACUITY, both ways. A flat arm whose buffer is not flat, or a relieved one whose buffer
  // is, means the page drew the same thing twice and every picture below is a picture of nothing.
  if (flat.heightSpan !== CELL_GROUND_DEPTH) {
    fail(
      `the flat arm spans ${flat.heightSpan} units in y — it should be exactly the ` +
        `${CELL_GROUND_DEPTH}-unit slab and nothing more`,
    );
  }
  for (const arm of LAND_ARMS.filter((a) => a !== 'flat')) {
    const r = readings.get(`${arm}|${zoom}`);
    if (r.heightSpan <= flat.heightSpan) {
      fail(
        `the ${arm} arm spans ${r.heightSpan} units in y, no more than the flat arm's ` +
          `${flat.heightSpan} — the relief is not reaching the buffer`,
      );
    }
  }
}

// ── DID THE LAND GAIN ANY SHADING? Relief authors no colour, so all it can do is spread each
//    status token across more of the range between its lit and unlit ends. A flat island delivers
//    a handful of colours; a relieved one delivers a gradient.
const colours = new Map();
for (const zoom of LAND_ZOOMS) {
  for (const arm of LAND_ARMS) {
    colours.set(
      `${arm}|${zoom}`,
      await page.evaluate(([a, z]) => window.landRunner.colours(a, z), [arm, zoom]),
    );
  }
}
// ⚠ NON-VACUITY OF THE WHOLE PAGE, ASKED BEFORE ANY COMPARISON. An arm delivering ONE distinct
// colour drew nothing — and a blank frame satisfies the two checks below in the direction that
// reads as a result: every rung "changes 0% of the frame" (which is reported as a missing
// component rather than as a missing picture), and the palette closure passes because a blank
// frame has no off-palette pixel in it. This refusal is what names the real cause; it exists
// because a blank readback is exactly what this driver got under `--use-angle=gl` on the Windows
// box, and it spent an hour looking like a broken relief field.
for (const zoom of LAND_ZOOMS) {
  for (const arm of LAND_ARMS) {
    const c = colours.get(`${arm}|${zoom}`);
    if (c.distinct <= 1) {
      fail(
        `at zoom ${zoom} the ${arm} arm delivered ${c.distinct} distinct colour(s) — the page ` +
          'drew nothing readable. This is a RENDERER problem, not a treatment problem: on the ' +
          'Windows box `--use-angle=gl` comes up on SwiftShader with a blank readback. Use ' +
          '`ST_LAND_ANGLE=default` to develop locally, and take committed figures on the Mint box.',
      );
    }
  }
}

const changed = new Map();
for (const zoom of LAND_ZOOMS) {
  for (const [a, b] of LAND_STEPS) {
    changed.set(
      `${a}->${b}|${zoom}`,
      await page.evaluate(([x, y, z]) => window.landRunner.changedPct(x, y, z), [a, b, zoom]),
    );
  }
}
// ⚠ NON-VACUITY, PER RUNG. A rung that changed no pixel reached the buffer and reached no
// PICTURE, which is a real finding and not something to publish eight pictures over in silence.
// It is asked of the rung rather than of the ladder: a treatment could be invisible while the
// ladder as a whole moved plenty.
for (const zoom of LAND_ZOOMS) {
  for (const [a, b] of LAND_STEPS) {
    const pct = changed.get(`${a}->${b}|${zoom}`);
    if (!(pct > 0)) {
      fail(
        `at zoom ${zoom} the step ${a} -> ${b} changes ${pct}% of the frame — that component is ` +
          'in the code and not in the picture',
      );
    }
  }
}
// AND THE PALETTE CLOSURE, WHICH IS THE FENCE THE WHOLE SURFACE RESTS ON. Every pixel the BANDED
// arm delivers must be an authored `(token x level)` entry — not nearly one, exactly one. This is
// what makes "a capability reads as the state it holds and as no other" a property of the picture
// rather than of the source (ADR-0392 D5 / ADR-0398 D7).
//
// ⚠ ASKED OF `PALETTE_CLOSED_ARMS`, WHICH IS TWO ARMS NOW AND NOT ONE. `flat` and `relief` wear a
// lit `MeshStandardMaterial` and deliver a continuous gradient by construction — that is the thing
// being replaced. `grain-both` mixes a noise ramp into its colour and is off-palette by
// construction (`land-grain.ts`), which is exactly what it is here to picture. Everything between
// them must hold, and `grain-normal` — the arm that SHIPS — is the one this increment adds to the
// list: the whole reason its half of the grain is adoptable is that the closure survives it, and a
// claim like that belongs on delivered pixels rather than in a comment.
const offPalette = new Map();
for (const zoom of LAND_ZOOMS) {
  for (const arm of PALETTE_CLOSED_ARMS) {
    const report = await page.evaluate(
      ([a, z]) => window.landRunner.offPalette(a, z),
      [arm, zoom],
    );
    offPalette.set(`${arm}|${zoom}`, report);
    if (report.count > 0) {
      fail(
        `at zoom ${zoom} the ${arm} arm delivers ${report.count} px in ${report.colours.length} ` +
          `colours that are NOT authored ladder entries (${report.colours.slice(0, 6).join(', ')}) ` +
          '— the closed palette is not closed',
      );
    }
    if (report.landPixels === 0) fail(`at zoom ${zoom} the ${arm} arm drew no land at all`);
  }
}

// ── AND THE QUESTION A PICTURE CANNOT ASK AT ALL, run here so the run's exit code carries it.
//
// ⚠⚠ THE FIXTURE ISLAND IS SINGLE-STATUS, so no sweep over these pixels can see a FOREIGN-STATUS
// read. The colour half's real question — does a 13% status-independent mottle move a ground pixel
// into a neighbouring status's family? — is answered arithmetically over all six shipped tokens by
// `grain-status-reading.ts`, exhaustively, with no GPU. It is asserted HERE because the driver is
// what decides whether the evidence directory may be written: a run that published a grained
// picture while the reader model said the mottle misreports would be publishing a regression
// (ADR-0392 D5 / ADR-0398 D7).
const grainReading = {
  authored: grainColourHalfVerdict(),
  ceiling: admissibleMixCeiling(0.001),
};
if (grainReading.authored.admissible) {
  fail(
    'the colour half now reads as ADMISSIBLE at its authored mix. That is a real result and a ' +
      'welcome one, but it means the shipped material, the fence test and the open question all ' +
      'say something that is no longer true — settle it rather than publishing over it.',
  );
}
if (!(grainReading.ceiling > 0) || grainReading.ceiling >= 0.13) {
  fail(
    `the admissible mix ceiling came back ${grainReading.ceiling}, which is either no fork at all ` +
      'or the whole authored mix — both mean the instrument is not measuring what it claims',
  );
}

// ── THE PICTURES.
mkdirSync(OUT, { recursive: true });
const pictures = [];
for (const zoom of LAND_ZOOMS) {
  for (const arm of LAND_ARMS) {
    const dataUrl = await page.evaluate(([a, z]) => window.landRunner.snapshot(a, z), [arm, zoom]);
    const name = `shipped-${arm}-${zoom}px.png`;
    writeFileSync(join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    pictures.push(name);
    console.log(`  wrote ${name}`);
  }
}

// ── THE VERDICT — ⚠⚠ TWO OF THEM, and the reason is a finding rather than a complication.
//
// `frameBudgetVerdict` is built on ONE premise about its caller's arms: every non-baseline row
// does strictly MORE fragment work than the baseline, so an arm that measures FASTER than the
// control is the instrument contradicting itself and the honest answer is UNVERIFIED. That premise
// held for every comparison this arc has run — until this one, because `relief -> banded` REPLACES
// the material rather than adding to it, and a locked palette (one dot product, one four-way
// compare, one table read) is genuinely cheaper than a PBR model over two lights. The banded arm
// measures ~2x FASTER than the ground it replaces, which is a real result and would be reported as
// a broken instrument by a single whole-ladder verdict.
//
// ⚠ THE FIRST RUN OF THIS SWEEP RETURNED PASS, AND THAT WAS LUCK RATHER THAN AGREEMENT: the flat
// arm happened to carry a wide spread that run, the derived noise floor absorbed the difference,
// and the contradiction did not fire. Split, both halves answer the question they can answer.
//
// So the ladder is verdicted in the two segments that ARE work-monotone, and the step BETWEEN them
// is reported as what it is — a straight cost comparison of two materials, in the table above.
const rowsFor = (arms) => {
  const out = [];
  for (const zoom of LAND_ZOOMS) {
    for (const arm of arms) {
      const r = readings.get(`${arm}|${zoom}`);
      out.push({
        label: `${arm} @ ${zoom}px`,
        samples: r.samples,
        software: identity.software,
        hidden: false,
      });
    }
  }
  return out;
};
// (a) THE GEOMETRY SEGMENT — one material, and the relief adds no fragment work at all, so the
//     premise holds as equality. This is the verdict the relief increment ran, unchanged.
const geometryVerdict = frameBudgetVerdict({
  rows: rowsFor(['flat', 'relief']),
  baselineLabel: `flat @ ${LAND_ZOOMS[0]}px`,
});
// (b) THE MATERIAL SEGMENT — ONE material now, called with one option changed, and each grain
//     half genuinely adds fragment work on top of the one before it. That is exactly what the
//     premise wants, and it is a stronger version of the segment than the ladder crossing could
//     run: its ceiling arm was a different material, so "more work" rested on the two being
//     comparable at all. Here the three rows are the same shader plus a term.
const materialVerdict = frameBudgetVerdict({
  rows: rowsFor(['banded', 'grain-normal', 'grain-both']),
  baselineLabel: `banded @ ${LAND_ZOOMS[0]}px`,
});
const verdict = {
  geometry: geometryVerdict,
  material: materialVerdict,
  // The worst of the two, in the vocabulary the callers of this driver already read. UNVERIFIED
  // outranks FAIL: it is a verdict about the MEASUREMENT, and a measurement that cannot be
  // believed cannot fail anything either (`frame-budget.ts`).
  status:
    geometryVerdict.status === 'UNVERIFIED' || materialVerdict.status === 'UNVERIFIED'
      ? 'UNVERIFIED'
      : geometryVerdict.status === 'FAIL' || materialVerdict.status === 'FAIL'
        ? 'FAIL'
        : 'PASS',
};

console.log('');
console.log('arm        zoom   median ms   spread ms   % of 60Hz   draws   triangles   y span   colours   land px');
for (const zoom of LAND_ZOOMS) {
  for (const arm of LAND_ARMS) {
    const r = readings.get(`${arm}|${zoom}`);
    const c = colours.get(`${arm}|${zoom}`);
    const m = median(r.samples);
    console.log(
      `${arm.padEnd(8)} ${String(zoom).padStart(4)}   ${m.toFixed(4).padStart(9)}   ` +
        `${spread(r.samples).toFixed(4).padStart(9)}   ` +
        `${((m / FRAME_BUDGET_60HZ_MS) * 100).toFixed(2).padStart(9)}   ` +
        `${String(r.drawCalls).padStart(5)}   ${String(r.triangles).padStart(9)}   ` +
        `${r.heightSpan.toFixed(2).padStart(6)}   ${String(c.distinct).padStart(7)}   ` +
        `${String(c.landPixels).padStart(7)}`,
    );
  }
}
console.log('');
for (const zoom of LAND_ZOOMS) {
  for (const [a, b] of LAND_STEPS) {
    const pct = changed.get(`${a}->${b}|${zoom}`);
    console.log(`at ${zoom} px/unit ${a} -> ${b} changes ${pct.toFixed(1)}% of the frame`);
  }
}
console.log('');
for (const zoom of LAND_ZOOMS) {
  for (const arm of PALETTE_CLOSED_ARMS) {
    const r = offPalette.get(`${arm}|${zoom}`);
    console.log(
      `at ${zoom} px/unit the ${arm} arm delivers ${r.distinctLand} distinct land colours, ` +
        `all ${r.authored} authored — ${r.count} off-palette px`,
    );
  }
}
console.log('');
console.log(
  `the grain's COLOUR half at its authored mix: admissible=${grainReading.authored.admissible}, ` +
    `worst margin ${grainReading.authored.worstMargin.toFixed(2)} at ` +
    `${grainReading.authored.worstAt} (ungrained ${grainReading.authored.ungrainedWorstMargin.toFixed(2)} ` +
    `at ${grainReading.authored.ungrainedWorstAt}); ${grainReading.authored.breaks.length} of 24 ` +
    `(status, rung) readings move. Largest admissible mix: ${grainReading.ceiling}`,
);
console.log('');
for (const zoom of LAND_ZOOMS) {
  const flat = median(readings.get(`flat|${zoom}`).samples);
  for (const arm of ['banded', 'grain-normal']) {
    const m = median(readings.get(`${arm}|${zoom}`).samples);
    const pct = flat === 0 ? Number.NaN : ((m - flat) / flat) * 100;
    console.log(
      `at ${zoom} px/unit the ${arm.toUpperCase()} ground costs ${m.toFixed(4)} ms against the ` +
        `material it replaces at ${flat.toFixed(4)} ms — ${pct.toFixed(1)}%`,
    );
  }
}
console.log('');
console.log(`frame budget (geometry: flat -> relief): ${verdict.geometry.status}`);
for (const reason of verdict.geometry.reasons ?? []) console.log(`  ${reason}`);
console.log(`frame budget (material: banded -> grain-normal -> grain-both): ${verdict.material.status}`);
for (const reason of verdict.material.reasons ?? []) console.log(`  ${reason}`);
console.log(`frame budget: ${verdict.status}`);

writeFileSync(
  join(OUT, 'shipped-grain.json'),
  `${JSON.stringify(
    {
      measuredOn: identity,
      repeats: REPEATS,
      batch: BATCH,
      zooms: LAND_ZOOMS,
      colours: Object.fromEntries(colours),
      changedPct: Object.fromEntries(changed),
      offPalette: Object.fromEntries(offPalette),
      grainReading,
      softwareRun: identity.software,
      arms: Object.fromEntries([...readings.entries()].map(([k, v]) => [k, { ...v, median: median(v.samples), spread: spread(v.samples) }])),
      verdict,
      pictures,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwrote ${join(OUT, 'shipped-grain.json')}`);

await browser.close();
process.exit(verdict.status === 'FAIL' ? 1 : 0);
