// grain-measure.mjs — MEASURE the grain octave on pixels a browser actually delivered.
//
// THE QUESTION IT ANSWERS: does WebGL grain read the way Cycles grain reads? Everything this
// arc has proven came out of an offline path tracer; the shipped map is a live WebGL renderer.
// This script puts the same instrument on both sides of that gap.
//
// ⚠⚠ IT READS `getImageData` OFF THE CANVAS, NOT A SCREENSHOT, AND THAT IS NOT A STYLE CHOICE.
// Two evidence pictures on this arc (`island-today.png`, `island-wild.png`) were Playwright
// ELEMENT screenshots with the harness page's checkerboard composited in OPAQUE, so an alpha
// mask never reached the island and every figure derived from them was confounded — the
// 2026-08-27 pass had to quote those two rows from an older run rather than re-measure them.
// `getImageData` returns the canvas's own RGBA including real alpha, so the water around the
// island is transparent and the mask is exact.
//
// USAGE — and note the port, which has bitten this harness before:
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5199
//   ST_GRAIN_URL=http://localhost:5199/grain.html pnpm --filter @storytree/forest-world-r3f measure-grain
//
// ⚠ `vite.config.ts` pins `strictPort: 5184` for EVERY worktree, so a sibling worktree's
// harness left running on the default port means you measure ITS tree and report the number as
// yours (measured 2026-08-22, friction `capture-default-url-is-a-port-a-sibling-worktree-may-own`).
// Pass a free port. This script REFUSES to run against 5184 unless ST_GRAIN_ALLOW_DEFAULT_PORT
// is set, because a wrong-tree measurement produces a NUMBER rather than a missing file and is
// therefore worse than a crash.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAIN_COLOUR_MIX, GRAIN_LATTICE, GRAIN_NORMAL_STRENGTH, grainFeaturePeriod } from './land-grain.ts';
import { landPalette } from './palette-band.ts';
import { measurePixels } from './pixel-metrics.ts';

/**
 * WHICH SIDE OF THE PALETTE CLOSURE EACH VARIANT IS EXPECTED TO LAND ON — declared here so this
 * script can FAIL rather than merely report.
 *
 * `land-grain.test.ts` establishes this by reading the generated shader SOURCE, which is the
 * stronger claim (it covers every reachable pixel, not the ones a run happened to draw). This
 * is the delivered-pixel confirmation of the same property, and it is worth having separately
 * because the source argument assumes the GPU does what the source says — an assumption a
 * driver, a colour-management default or a blend state can quietly break. `configureExactColour`
 * exists because exactly that happened once already.
 *
 * ⚠ IT IS NON-VACUOUS IN BOTH DIRECTIONS. A variant expected OPEN that comes back closed fails
 * too — that would mean the colour half is not reaching the framebuffer and every MICRO figure
 * for it is measuring the control under another name.
 */
const EXPECTED_CLOSED = { none: true, normal: true, colour: false, both: false };

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env['ST_GRAIN_URL'] ?? 'http://localhost:5199/grain.html';
const OUT = process.env['ST_GRAIN_OUT'] ?? join(HERE, '..', '..', '..', '.grain-measure');

if (/:5184\b/.test(URL) && !process.env['ST_GRAIN_ALLOW_DEFAULT_PORT']) {
  console.error(
    `REFUSED: ${URL} is the harness's pinned default port, which every worktree shares.\n` +
      'Start vite on a free port and pass ST_GRAIN_URL, or set ST_GRAIN_ALLOW_DEFAULT_PORT=1 if\n' +
      'you have PROVED this server is your own tree.',
  );
  process.exit(2);
}

/**
 * The committed Cycles figures this run is read against, from
 * `docs/research/chapter2-land-idiom-2026-08-27/measurements.json`. BARE LAND only — the
 * dressed rows include props, and a prop's crisp edges dominate MICRO.
 *
 * They are quoted rather than recomputed because the point is the RELATIVE lift each renderer
 * delivers, not an absolute agreement between a path tracer and a rasteriser. The two will
 * never agree absolutely: Cycles antialiases with 128 samples and a denoiser, our renderer is
 * a single-sample rasteriser with no AA at all, and that difference alone moves MICRO.
 */
const CYCLES_BARE = {
  '1948': { control: 1.15, structure: 1.19, combined: 1.83 },
  '487': { control: 4.85, combined: 5.74 },
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });

// PROVE THE TREE before trusting a single number. A page that served but is not this branch's
// grain page would still render islands and still produce plausible figures.
const marker = await page.evaluate(() => document.title);
if (!/grain octave in the live renderer/.test(marker)) {
  console.error(`REFUSED: ${URL} served "${marker}" — that is not this branch's grain page.`);
  await browser.close();
  process.exit(2);
}

await page.waitForFunction(() => window.__stExperimentSettled === true, null, { timeout: 60_000 });

const tags = await page.evaluate(() =>
  [...document.querySelectorAll('canvas[data-st-tag]')].map((c) => c.getAttribute('data-st-tag')),
);
if (tags.length === 0) {
  console.error('REFUSED: the page published no tagged canvases — nothing to measure.');
  await browser.close();
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });

const palette = new Set(landPalette());
const results = {};
const paletteVerdicts = [];
for (const tag of tags) {
  const shot = await page.evaluate((t) => {
    const c = document.querySelector(`canvas[data-st-tag="${t}"]`);
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { w: d.width, h: d.height, data: [...d.data], png: c.toDataURL('image/png') };
  }, tag);
  if (!shot) {
    console.error(`REFUSED: canvas ${tag} yielded no pixels.`);
    await browser.close();
    process.exit(2);
  }
  const m = measurePixels(Uint8Array.from(shot.data), shot.w, shot.h);
  if (!m) {
    // A blank canvas cannot fail a contrast check — it has no contrast to be wrong. Refuse
    // rather than record zeros, which would read as a legitimate flat measurement.
    console.error(`REFUSED: canvas ${tag} is ${shot.w}x${shot.h} with NOTHING opaque.`);
    await browser.close();
    process.exit(2);
  }

  // THE DELIVERED-PIXEL PALETTE READ. Opaque pixels only: the transparent water carries whatever
  // the clear left behind and is not a colour the land emitted.
  const offenders = new Map();
  let offPalette = 0;
  const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  for (let i = 0; i < shot.w * shot.h; i++) {
    if (shot.data[i * 4 + 3] < 128) continue;
    const h = hex(shot.data[i * 4], shot.data[i * 4 + 1], shot.data[i * 4 + 2]);
    if (!palette.has(h)) {
      offPalette++;
      offenders.set(h, (offenders.get(h) ?? 0) + 1);
    }
  }
  const variant = tag.split('-')[1];
  paletteVerdicts.push({
    tag,
    variant,
    offPalette,
    offPaletteColours: offenders.size,
    closed: offPalette === 0,
    expectedClosed: EXPECTED_CLOSED[variant],
  });

  writeFileSync(join(OUT, `${tag}.png`), Buffer.from(shot.png.split(',')[1], 'base64'));
  results[tag] = { w: shot.w, h: shot.h, offPalette, offPaletteColours: offenders.size, ...m };
}

await browser.close();

if (consoleErrors.length) {
  console.error(`REFUSED: the page logged ${consoleErrors.length} error(s):`);
  for (const e of consoleErrors.slice(0, 10)) console.error(`  ${e}`);
  process.exit(1);
}

// ---------------------------------------------------------------- the palette verdict

console.log('\npalette closure, on DELIVERED pixels:');
const wrongSide = [];
for (const v of paletteVerdicts) {
  const mark = v.closed === v.expectedClosed ? 'ok ' : 'XX ';
  console.log(
    `  ${mark}${v.tag.padEnd(20)} ${v.closed ? 'CLOSED' : 'OPEN  '} ` +
      `(${v.offPalette} off-palette px in ${v.offPaletteColours} colours; expected ` +
      `${v.expectedClosed ? 'CLOSED' : 'OPEN'})`,
  );
  if (v.closed !== v.expectedClosed) wrongSide.push(v);
}
if (wrongSide.length) {
  console.error(
    `\nFAILED: ${wrongSide.length} panel(s) landed on the wrong side of the palette closure. ` +
      'A variant expected CLOSED that is open means the grain is off-palette where it was ' +
      'claimed safe; a variant expected OPEN that is closed means its colour half never reached ' +
      'the framebuffer and its MICRO figure is the control under another name.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------- report

const zooms = [...new Set(Object.keys(results).map((t) => t.split('-').at(-1)))];
const variants = ['none', 'normal', 'colour', 'both'];

console.log(`\ngrain octave — delivered by ${URL}`);
console.log(
  `lattice ${GRAIN_LATTICE} units · delivered feature ~${grainFeaturePeriod().toFixed(1)} units · ` +
    `bump ${GRAIN_NORMAL_STRENGTH} · mix ${GRAIN_COLOUR_MIX}\n`,
);

const table = [];
for (const z of zooms) {
  console.log(`  ${z} —  variant     MICRO   vs none    STRUCT   vs none   RATIO   distinct  bins90`);
  const base = results[`grain-none-${z}`];
  for (const v of variants) {
    const r = results[`grain-${v}-${z}`];
    if (!r || !base) continue;
    const dMicro = ((r.micro / base.micro - 1) * 100).toFixed(1).padStart(6);
    const dStruct = ((r.struct / base.struct - 1) * 100).toFixed(1).padStart(6);
    console.log(
      `      ${v.padEnd(10)} ${r.micro.toFixed(3).padStart(7)} ${dMicro}%  ` +
        `${r.struct.toFixed(2).padStart(7)} ${dStruct}%  ${r.ratio.toFixed(3).padStart(6)}  ` +
        `${String(r.distinct).padStart(7)} ${String(r.bins90).padStart(7)}`,
    );
    table.push({
      zoom: z,
      variant: v,
      micro: r.micro,
      microLiftPct: (r.micro / base.micro - 1) * 100,
      struct: r.struct,
      structLiftPct: (r.struct / base.struct - 1) * 100,
      ratio: r.ratio,
      distinct: r.distinct,
      bins90: r.bins90,
      bins90b: r.bins90b,
      spread: r.spread,
      opaque: r.opaque,
    });
  }
  console.log('');
}

console.log('  Cycles bare-land MICRO lift for the same component, for comparison:');
console.log(
  `    1948 px: control ${CYCLES_BARE['1948'].control} → structure ${CYCLES_BARE['1948'].structure} ` +
    `→ combined ${CYCLES_BARE['1948'].combined}  (+54% over structure, +59% over control)`,
);
console.log(
  `     487 px: control ${CYCLES_BARE['487'].control} → combined ${CYCLES_BARE['487'].combined}  (+18%)\n`,
);

const reportPath = join(OUT, 'grain-measure.json');
writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      url: URL,
      grain: {
        lattice: GRAIN_LATTICE,
        featurePeriod: grainFeaturePeriod(),
        normalStrength: GRAIN_NORMAL_STRENGTH,
        colourMix: GRAIN_COLOUR_MIX,
      },
      cyclesBareReference: CYCLES_BARE,
      panels: results,
      paletteVerdicts,
      table,
    },
    null,
    2,
  )}\n`,
);
console.log(`report: ${reportPath}`);
