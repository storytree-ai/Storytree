// cover-measure.mjs — MEASURE the ground covers on pixels a browser actually delivered.
//
// THE QUESTION IT ANSWERS, from the increment `wheat-and-yellow-grass-to-the-same-quality`:
// does a wheat field or a yellow grass reach the quality bar the grain crossing set on green,
// and does either of them cost the map's report anything? Two questions, two verdicts, both
// able to fail — the numbers are the point, but the refusals are what make them worth reading.
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
//   ST_COVER_URL=http://localhost:5199/cover.html pnpm --filter @storytree/forest-world-r3f measure-cover
//
// ⚠ `vite.config.ts` pins `strictPort: 5184` for EVERY worktree, so a sibling worktree's
// harness left running on the default port means you measure ITS tree and report the number as
// yours (measured 2026-08-22, friction `capture-default-url-is-a-port-a-sibling-worktree-may-own`).
// Pass a free port. This script REFUSES to run against 5184 unless ST_COVER_ALLOW_DEFAULT_PORT
// is set, because a wrong-tree measurement produces a NUMBER rather than a missing file and is
// therefore worse than a crash.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GROUND_COVERS,
  SEPARATION_FLOOR,
  YELLOW_GRASS,
  coverTokens,
  coverPalette,
  coverVerdict,
  describeToken,
  shadeRungGaps,
  worstStatusPair,
} from './ground-cover.ts';
import { STATUS_TOKENS, landPalette, paletteImageOfToken, toHex } from './palette-band.ts';
import { measurePixels } from './pixel-metrics.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env['ST_COVER_URL'] ?? 'http://localhost:5199/cover.html';
const OUT = process.env['ST_COVER_OUT'] ?? join(HERE, '..', '..', '..', '.cover-measure');

if (/:5184\b/.test(URL) && !process.env['ST_COVER_ALLOW_DEFAULT_PORT']) {
  console.error(
    `REFUSED: ${URL} is the harness's pinned default port, which every worktree shares.\n` +
      'Start vite on a free port and pass ST_COVER_URL, or set ST_COVER_ALLOW_DEFAULT_PORT=1 if\n' +
      'you have PROVED this server is your own tree.',
  );
  process.exit(2);
}

/**
 * WHICH COVER EACH PANEL IS SUPPOSED TO BE WEARING — declared here so this script can FAIL
 * rather than merely report.
 *
 * ⚠⚠ THIS IS THE GUARD THAT MATTERS MOST ON THIS PAGE, and the reason is a fault this project
 * has already met: an A/B whose two arms are secretly the SAME SCENE always reports "no
 * measurable difference", with the calm authority of a real measurement, and that is
 * indistinguishable from a genuine null result. A comparison of three ground covers has exactly
 * that failure mode one dropped prop away — if `cover` never reached the material, all three
 * columns would be the status green, every row would agree, and the page would read as a clean
 * finding that covers change nothing.
 *
 * So each panel is required to DELIVER its own cover's colours and to deliver NONE of the other
 * covers'. Both halves are needed: presence alone would pass if a panel drew every cover at
 * once, and absence alone would pass on a blank canvas.
 */
const EXPECTED_COVER = { status: null, wheat: 'wheat', yellowgrass: 'yellowGrass' };

/** The colours a cover's tokens can deliver, and the colours belonging to the OTHER covers. */
function coverColours(cover) {
  const set = new Set();
  for (const token of coverTokens(cover)) for (const c of paletteImageOfToken(token)) set.add(toHex(c));
  return set;
}
const COVER_COLOURS = Object.fromEntries(GROUND_COVERS.map((c) => [c, coverColours(c)]));

/**
 * The committed grain-crossing figures this run is read against, from
 * `docs/research/chapter2-grain-crossing-2026-08-27/`. BARE LAND, status green, the same
 * fixture and the same two zooms — so the `status` column below should reproduce them, and a
 * column that does not means something moved underneath this page rather than that covers
 * behave oddly.
 */
const GREEN_REFERENCE = {
  8: { flat: 0.374, grain: 1.058, liftPct: 183 },
  2: { flat: 1.408 },
};

/**
 * ⚠ WHICH GPU DREW THESE PIXELS IS PART OF THE MEASUREMENT, AND IT IS RECORDED RATHER THAN
 * ASSUMED.
 *
 * Headless Chromium picks **SwiftShader** by default on every platform — a software rasteriser.
 * That is a perfectly reproducible way to draw, and for a palette-closure claim it is arguably the
 * strictest reading available; but a report that does not say which renderer produced it can be
 * quoted later as though it came from hardware, and this arc's whole fence is a claim about what
 * pixels a GPU delivers. So the renderer string is read out of the live context and written into
 * `cover-measure.json` on every run.
 *
 * `ST_COVER_GPU=1` asks for the real device instead. The flags are not interchangeable and the
 * combination matters: measured on the RTX 2060 box, `--use-gl=angle --use-angle=gl` reaches the
 * NVIDIA driver **headless**, while `--use-gl=egl` silently falls back to SwiftShader and reports
 * a plausible-looking result from software. Verified by reading `UNMASKED_RENDERER_WEBGL`, never
 * by trusting the flag.
 */
const WANT_GPU = process.env['ST_COVER_GPU'] === '1';
const GPU_ARGS = ['--use-gl=angle', '--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'];
const launchOptions = { headless: true };
if (WANT_GPU) launchOptions.args = GPU_ARGS;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });

// PROVE THE TREE before trusting a single number. A page that served but is not this branch's
// cover page would still render islands and still produce plausible figures.
const marker = await page.evaluate(() => document.title);
if (!/a wheat field and a yellow grass/.test(marker)) {
  console.error(`REFUSED: ${URL} served "${marker}" — that is not this branch's cover page.`);
  await browser.close();
  process.exit(2);
}

await page.waitForFunction(() => window.__stExperimentSettled === true, null, { timeout: 120_000 });

// THE RENDERER, read off a live context on the page that just drew. A separate context from the
// panels', but the same process and the same driver selection, which is what the record is for.
const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return { renderer: '(no webgl2)', vendor: '', timerQuery: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '(masked)',
    vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : '(masked)',
    // Recorded because it is the capability the arc's UNDISCHARGED frame-cost item needs, and
    // knowing which machines have it is half of knowing where that work can run.
    timerQuery: Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2')),
  };
});
const SOFTWARE = /swiftshader|llvmpipe|softwarerasterizer/i.test(renderer.renderer);
if (WANT_GPU && SOFTWARE) {
  console.error(
    `REFUSED: ST_COVER_GPU=1 was asked for and the context came up on ${renderer.renderer}.\n` +
      'A software renderer reporting as hardware is the one outcome worse than no measurement — ' +
      'it produces a plausible number attributed to a GPU that never drew it.',
  );
  await browser.close();
  process.exit(2);
}

const tags = await page.evaluate(() =>
  [...document.querySelectorAll('canvas[data-st-tag]')].map((c) => c.getAttribute('data-st-tag')),
);
if (tags.length === 0) {
  console.error('REFUSED: the page published no tagged canvases — nothing to measure.');
  await browser.close();
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });

// The page-local palette: the audited pages' closed set PLUS the covers. See `ground-cover.ts`'s
// header — `landTokens()` is deliberately not widened, so `capture.mjs`'s fence on
// `island.html` / `directions.html` does not move by a single entry.
const palette = new Set([...landPalette(), ...coverPalette()]);
const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const results = {};
const paletteVerdicts = [];
const coverVerdicts = [];
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

  // THE DELIVERED-PIXEL READ. Opaque pixels only: the transparent water carries whatever the
  // clear left behind and is not a colour the land emitted.
  const offenders = new Map();
  const delivered = new Map();
  let offPalette = 0;
  for (let i = 0; i < shot.w * shot.h; i++) {
    if (shot.data[i * 4 + 3] < 128) continue;
    const h = hex(shot.data[i * 4], shot.data[i * 4 + 1], shot.data[i * 4 + 2]);
    delivered.set(h, (delivered.get(h) ?? 0) + 1);
    if (!palette.has(h)) {
      offPalette++;
      offenders.set(h, (offenders.get(h) ?? 0) + 1);
    }
  }
  const [, coverKey, grainKey, zoomKey] = tag.split('-');
  paletteVerdicts.push({
    tag,
    offPalette,
    offPaletteColours: offenders.size,
    closed: offPalette === 0,
    worstOffender: [...offenders.entries()].sort((a, b) => b[1] - a[1])[0] ?? null,
  });

  // THE ARMS-ARE-DIFFERENT VERDICT.
  const expected = EXPECTED_COVER[coverKey];
  const counts = {};
  for (const c of GROUND_COVERS) {
    let n = 0;
    for (const [h, k] of delivered) if (COVER_COLOURS[c].has(h)) n += k;
    counts[c] = n;
  }
  const wants = expected === null ? [] : [expected];
  const forbidden = GROUND_COVERS.filter((c) => !wants.includes(c));
  coverVerdicts.push({
    tag,
    expected,
    counts,
    // A covered panel must be MOSTLY its cover — a handful of pixels would be satisfied by a
    // stray anti-aliased edge, and there is no anti-aliasing here for it to come from.
    present: expected === null ? true : counts[expected] > m.opaque * 0.5,
    leaked: forbidden.filter((c) => counts[c] > 0),
    opaque: m.opaque,
  });

  writeFileSync(join(OUT, `${tag}.png`), Buffer.from(shot.png.split(',')[1], 'base64'));
  results[tag] = {
    cover: coverKey,
    grain: grainKey,
    zoom: Number(zoomKey.replace('px', '')),
    w: shot.w,
    h: shot.h,
    offPalette,
    offPaletteColours: offenders.size,
    ...m,
  };
}

await browser.close();

if (consoleErrors.length) {
  console.error(`REFUSED: the page logged ${consoleErrors.length} error(s):`);
  for (const e of consoleErrors.slice(0, 10)) console.error(`  ${e}`);
  process.exit(1);
}

let failed = false;

// ---------------------------------------------------------------- the arms-are-different verdict

console.log('\neach panel wears the cover it claims, and only that one:');
for (const v of coverVerdicts) {
  const ok = v.present && v.leaked.length === 0;
  if (!ok) failed = true;
  const share = v.expected === null ? 'n/a' : `${((v.counts[v.expected] / v.opaque) * 100).toFixed(1)}%`;
  console.log(
    `  ${ok ? 'ok ' : 'XX '}${v.tag.padEnd(28)} expected ${String(v.expected).padEnd(12)} ` +
      `share ${share.padStart(6)}` +
      (v.leaked.length ? `  LEAKED: ${v.leaked.join(', ')}` : ''),
  );
}
if (failed) {
  console.error(
    '\nFAILED: at least one panel is not wearing the cover it advertises. An A/B whose arms are ' +
      'secretly the same scene reports "no measurable difference" with the authority of a real ' +
      'measurement — every figure below would be that, so nothing else here is worth reading.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------- the palette verdict

console.log('\npalette closure, on DELIVERED pixels (landPalette + the cover widening):');
for (const v of paletteVerdicts) {
  if (!v.closed) failed = true;
  console.log(
    `  ${v.closed ? 'ok ' : 'XX '}${v.tag.padEnd(28)} ${v.closed ? 'CLOSED' : 'OPEN  '} ` +
      `(${v.offPalette} off-palette px in ${v.offPaletteColours} colours` +
      (v.worstOffender ? `, worst ${v.worstOffender[0]} x${v.worstOffender[1]}` : '') +
      ')',
  );
}
if (failed) {
  console.error(
    '\nFAILED: a panel delivered a colour outside the closed palette. Every panel here wears the ' +
      "grain's NORMAL half only, which perturbs the surface normal BEFORE the lighting is " +
      'quantised — so every delivered pixel must still be an authored ramp entry. An open panel ' +
      'means either the colour half reached this page or a cover token is not declared.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------- the separation report

console.log('\nCAN A COVER BE READ AS A PROOF STATE? — matched condition, luma-weighted');
const worst = worstStatusPair();
for (const cover of GROUND_COVERS) {
  for (const token of coverTokens(cover)) {
    const v = coverVerdict(token);
    const d = describeToken(token);
    // ⚠ WHEAT IS THE BAR, NOT A CANDIDATE, so it is marked `ref` rather than passed or failed.
    // Scoring the reference against itself is a category error that prints as a verdict: it
    // would read as this run having adjudicated a colour the app already ships, which nothing
    // here is entitled to do — that is the owner's open question.
    const mark = cover === 'wheat' ? 'ref' : v.ok ? 'ok ' : 'XX ';
    console.log(
      `  ${mark} ${cover.padEnd(12)} ${token}  L${d.luma.toFixed(0).padStart(4)}  ` +
        `nearest ${v.separation.nearest.padEnd(10)} ${v.separation.distance.toFixed(2).padStart(6)}  ` +
        (cover === 'wheat'
          ? '(this is where the bar comes from)'
          : `(bar ${SEPARATION_FLOOR}, margin ${v.margin >= 0 ? '+' : ''}${v.margin.toFixed(2)})`),
    );
    console.log(`       at ${v.separation.at}`);
    console.log(
      '       per status: ' +
        Object.entries(v.separation.per)
          .map(([s, x]) => `${s} ${x.toFixed(1)}`)
          .join(' · '),
    );
  }
}
console.log(
  `\n  for scale: the closest two DIFFERENT statuses are ${worst.a} and ${worst.b} at ` +
    `${worst.distance.toFixed(2)} (${worst.at}) — the map already draws a MEANINGFUL difference ` +
    'that quietly.',
);
console.log(
  `  the ladder's own rung gaps on ${YELLOW_GRASS}: ` +
    shadeRungGaps(YELLOW_GRASS)
      .map((g) => g.toFixed(2))
      .join(' / ') +
    "  — the first is the 0.78->0.80 step, which is why \"one shade rung\" is not one number.",
);

// ---------------------------------------------------------------- the contrast report

const zooms = [...new Set(Object.values(results).map((r) => r.zoom))].sort((a, b) => a - b);
const covers = ['status', 'wheat', 'yellowgrass'];

console.log(`\nground cover x grain — delivered by ${URL}`);
console.log(
  `renderer: ${renderer.renderer}${SOFTWARE ? '  [SOFTWARE RASTERISER]' : '  [hardware]'}` +
    `  ·  EXT_disjoint_timer_query_webgl2 ${renderer.timerQuery ? 'available' : 'ABSENT'}\n`,
);
const table = [];
for (const z of zooms) {
  console.log(`  ${z} px/unit —  cover         MICRO    grain lift    STRUCT   distinct  bins90  spread`);
  for (const c of covers) {
    const flat = results[`cover-${c}-flat-${z}px`];
    const grain = results[`cover-${c}-grain-${z}px`];
    if (!flat || !grain) continue;
    const lift = (grain.micro / flat.micro - 1) * 100;
    console.log(
      `      ${c.padEnd(12)} ${flat.micro.toFixed(3).padStart(6)} -> ${grain.micro.toFixed(3).padStart(6)}  ` +
        `${lift.toFixed(1).padStart(7)}%  ${grain.struct.toFixed(2).padStart(7)}  ` +
        `${String(grain.distinct).padStart(7)} ${String(grain.bins90).padStart(6)}  ` +
        `${grain.spread.toFixed(1).padStart(6)}`,
    );
    table.push({
      zoom: z,
      cover: c,
      microFlat: flat.micro,
      microGrain: grain.micro,
      grainLiftPct: lift,
      structFlat: flat.struct,
      structGrain: grain.struct,
      distinctFlat: flat.distinct,
      distinctGrain: grain.distinct,
      bins90Flat: flat.bins90,
      bins90Grain: grain.bins90,
      spreadFlat: flat.spread,
      spreadGrain: grain.spread,
      opaqueFlat: flat.opaque,
      opaqueGrain: grain.opaque,
    });
  }
  console.log('');
}

console.log('  the committed green figures this page must reproduce in its `status` column:');
console.log(
  `    8 px: flat ${GREEN_REFERENCE[8].flat} -> grained ${GREEN_REFERENCE[8].grain} ` +
    `(+${GREEN_REFERENCE[8].liftPct}%)   ·   2 px: flat ${GREEN_REFERENCE[2].flat}`,
);

// ⚠ THE MASK MUST BE IDENTICAL ACROSS EVERY PANEL AT A ZOOM. Same fixture, same camera, same
// geometry — only the material differs — so a mask that moved means the panels are not the
// comparison they claim to be, and every lift above is measured over a different island.
console.log('\n  mask check (opaque px must be identical within a zoom):');
for (const z of zooms) {
  const at = Object.values(results).filter((r) => r.zoom === z);
  const opaque = [...new Set(at.map((r) => r.opaque))];
  const ok = opaque.length === 1;
  if (!ok) failed = true;
  console.log(`    ${ok ? 'ok ' : 'XX '}${z} px/unit: ${opaque.join(', ')} over ${at.length} panels`);
}
if (failed) {
  console.error(
    '\nFAILED: the panels at one zoom cover different numbers of pixels, so they are not the same ' +
      'island under different materials and no lift above is attributable to the cover or the grain.',
  );
  process.exit(1);
}

const reportPath = join(OUT, 'cover-measure.json');
writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      url: URL,
      // The hardware the pixels came off. See the launch block: a report that cannot say which
      // renderer drew it can be quoted later as though it came from a GPU.
      renderer,
      software: SOFTWARE,
      covers: Object.fromEntries(
        GROUND_COVERS.map((c) => [
          c,
          coverTokens(c).map((t) => ({ ...describeToken(t), ...coverVerdict(t) })),
        ]),
      ),
      separationFloor: SEPARATION_FLOOR,
      worstStatusPair: worst,
      statusTokens: Object.fromEntries([...STATUS_TOKENS].map(([k, v]) => [k, v])),
      greenReference: GREEN_REFERENCE,
      panels: results,
      paletteVerdicts,
      coverVerdicts,
      table,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nreport: ${reportPath}`);
