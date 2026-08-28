// clay-measure.mjs — MEASURE the brown swap on pixels a browser actually delivered.
//
// THE QUESTION IT ANSWERS, from the increment `pull-the-four-land-colours-apart-in-hue`: after
// re-authoring `mapped`'s ground family as a tilled clay, does the land still tell the truth about
// every capability it draws — and did anything ELSE move with it? The numbers are the deliverable;
// the REFUSALS are what make them worth reading.
//
// ⚠⚠ THE REFUSAL THIS DRIVER EXISTS FOR — "exactly one thing differs", PROVED rather than claimed.
// A before/after page has two ways to lie and this checks both:
//
//   1. the `mapped` pair must DIFFER between the arms. If it does not, the page ignored its
//      `palette` prop and the BEFORE arm is secretly the AFTER one — which reports "no change"
//      with the calm authority of a real measurement.
//   2. the OTHER FIVE pairs must be BYTE-IDENTICAL. If they are not, something other than the
//      brown varies with the palette and every figure taken off this page is confounded.
//
// It is ADR-0462's refusal ("the AFTER yellows must match AND the BEFORE ones must differ") turned
// onto the axis this change moves, and (2) is the half that is easy to leave out: a page CAN show
// a real difference in the panel you were looking at while quietly redrawing the other five.
//
// ⚠ IT READS `getImageData` OFF THE CANVAS, NOT A SCREENSHOT — the same reason `status-measure.mjs`
// records: two evidence pictures on this arc were Playwright ELEMENT screenshots with the page
// background composited in OPAQUE, so an alpha mask never reached the island.
//
// USAGE — and note the port, which has bitten this harness before:
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5202
//   ST_CLAY_URL=http://localhost:5202/clay.html pnpm --filter @storytree/forest-world-r3f measure-clay
//
// ⚠ `vite.config.ts` pins `strictPort: 5184` for EVERY worktree, so a sibling worktree's harness
// left running on the default port means you measure ITS tree and report the number as yours. This
// script REFUSES 5184 unless ST_CLAY_ALLOW_DEFAULT_PORT is set.

import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATUS_TOKENS, landPalette, paletteImageOfToken, toHex } from './palette-band.ts';
import { measurePixels } from './pixel-metrics.ts';
import {
  ADR0462_STATUS_TOKENS,
  colourPairs,
  foreignColourReads,
  vocabularySeparation,
} from './status-vocabulary.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env['ST_CLAY_URL'] ?? 'http://localhost:5202/clay.html';
const OUT = process.env['ST_CLAY_OUT'] ?? join(HERE, '..', '..', '..', '.clay-measure');

if (/:5184\b/.test(URL) && !process.env['ST_CLAY_ALLOW_DEFAULT_PORT']) {
  console.error(
    `REFUSED: ${URL} is the harness's pinned default port, which every worktree shares.\n` +
      'Start vite on a free port and pass ST_CLAY_URL, or set ST_CLAY_ALLOW_DEFAULT_PORT=1 if you\n' +
      'have PROVED this server is your own tree.',
  );
  process.exit(2);
}

const STATES = ['proposed', 'building', 'mapped', 'healthy', 'unhealthy', 'unknown'];
const PALETTES = { live: STATUS_TOKENS, 'pre-clay': ADR0462_STATUS_TOKENS };
/** The ONE family this change moves. Every other state is a control. */
const MOVED = 'mapped';

/** Every colour one state's ground family can deliver, under one palette. */
function familyColours(families, status) {
  const fam = families.get(status);
  const set = new Set();
  for (const token of [...fam.top, fam.side]) for (const c of paletteImageOfToken(token)) set.add(toHex(c));
  return set;
}

const WANT_GPU = process.env['ST_CLAY_GPU'] === '1';
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
// comparison page would still render islands and still produce plausible figures.
const marker = await page.evaluate(() => document.title);
if (!/a tilled clay in place of the tan/.test(marker)) {
  console.error(`REFUSED: ${URL} served "${marker}" — that is not this branch's clay page.`);
  await browser.close();
  process.exit(2);
}

await page.waitForFunction(() => window.__stExperimentSettled === true, null, { timeout: 180_000 });

// WHICH GPU DREW THESE PIXELS IS PART OF THE MEASUREMENT (the arc's 2026-08-27 finding): headless
// Chromium picks SwiftShader by default, and a report that does not say so can be quoted later as
// though it came from hardware.
const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return { renderer: '(no webgl2)', vendor: '', timerQuery: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '(masked)',
    vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : '(masked)',
    timerQuery: Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2')),
  };
});
const SOFTWARE = /swiftshader|llvmpipe|softwarerasterizer/i.test(renderer.renderer);
if (WANT_GPU && SOFTWARE) {
  console.error(
    `REFUSED: ST_CLAY_GPU=1 was asked for and the context came up on ${renderer.renderer}.\n` +
      'A software renderer reporting as hardware is the one outcome worse than no measurement.',
  );
  await browser.close();
  process.exit(2);
}

const tags = await page.evaluate(() =>
  [...document.querySelectorAll('canvas[data-st-tag]')].map((c) => c.getAttribute('data-st-tag')),
);
const expectedTags = [];
for (const zoom of [2, 8]) for (const p of ['pre-clay', 'live']) for (const st of STATES) expectedTags.push(`clay-${p}-${st}-${zoom}px`);
const missing = expectedTags.filter((t) => !tags.includes(t));
if (missing.length) {
  console.error(`REFUSED: the page is missing ${missing.length} expected canvas(es): ${missing.join(', ')}`);
  await browser.close();
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });

// The palette every panel is held to. BOTH tables' closures, because the page deliberately draws
// the retired tan in its BEFORE rows — a fence that refused it would refuse the comparison itself.
const preClayClosure = new Set();
for (const st of STATES) for (const h of familyColours(ADR0462_STATUS_TOKENS, st)) preClayClosure.add(h);
const palette = new Set([...landPalette(), ...preClayClosure]);
const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const results = {};
const digests = {};
const verdicts = [];
for (const tag of expectedTags) {
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
  const bytes = Uint8Array.from(shot.data);
  const m = measurePixels(bytes, shot.w, shot.h);
  if (!m) {
    // A blank canvas cannot fail a colour check — it has no colour to be wrong. Refuse rather than
    // record zeros, which would read as a legitimate flat measurement.
    console.error(`REFUSED: canvas ${tag} is ${shot.w}x${shot.h} with NOTHING opaque.`);
    await browser.close();
    process.exit(2);
  }
  digests[tag] = createHash('sha256').update(bytes).digest('hex').slice(0, 16);

  // `clay-pre-clay-mapped-2px` splits into more than four parts, so the state and zoom are taken
  // from the ENDS rather than by index — a positional parse would silently mis-key every
  // `pre-clay` panel as state `clay`.
  const parts = tag.split('-');
  const zoomKey = parts[parts.length - 1];
  const state = parts[parts.length - 2];
  const paletteKey = parts.slice(1, parts.length - 2).join('-');
  const families = PALETTES[paletteKey];
  if (!families) {
    console.error(`REFUSED: tag ${tag} names palette "${paletteKey}", which this driver does not know.`);
    await browser.close();
    process.exit(2);
  }
  const own = familyColours(families, state);
  const foreign = new Map();
  for (const other of STATES) {
    if (other === state) continue;
    // A state sharing this one's family contributes nothing to judge — under ADR-0462 the yellow
    // pair are ONE colour, so counting one against the other would report the merge as a leak.
    const otherColours = familyColours(families, other);
    if ([...otherColours].every((h) => own.has(h))) continue;
    for (const h of otherColours) if (!own.has(h)) foreign.set(h, other);
  }

  const offenders = new Map();
  let offPalette = 0;
  let ownPixels = 0;
  const foreignPixels = {};
  for (let i = 0; i < shot.w * shot.h; i++) {
    if (shot.data[i * 4 + 3] < 128) continue;
    const h = hex(shot.data[i * 4], shot.data[i * 4 + 1], shot.data[i * 4 + 2]);
    if (own.has(h)) ownPixels++;
    const f = foreign.get(h);
    if (f) foreignPixels[f] = (foreignPixels[f] ?? 0) + 1;
    if (!palette.has(h)) {
      offPalette++;
      offenders.set(h, (offenders.get(h) ?? 0) + 1);
    }
  }

  verdicts.push({
    tag,
    state,
    palette: paletteKey,
    ownShare: ownPixels / m.opaque,
    // The wheat override and the coast are family-less, so a family never owns the whole island;
    // half is the same floor `cover-measure.mjs` uses and is far above what a stray edge could
    // supply on a renderer with no anti-aliasing.
    present: ownPixels > m.opaque * 0.5,
    foreignPixels,
    offPalette,
    closed: offPalette === 0,
    worstOffender: [...offenders.entries()].sort((a, b) => b[1] - a[1])[0] ?? null,
  });

  writeFileSync(join(OUT, `${tag}.png`), Buffer.from(shot.png.split(',')[1], 'base64'));
  results[tag] = {
    state,
    palette: paletteKey,
    zoom: Number(zoomKey.replace('px', '')),
    w: shot.w,
    h: shot.h,
    offPalette,
    offPaletteColours: offenders.size,
    digest: digests[tag],
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

console.log(`\nrenderer  : ${renderer.renderer} (${renderer.vendor})${SOFTWARE ? '  [SOFTWARE RASTERISER]' : ''}`);
console.log(`timerQuery: ${renderer.timerQuery ? 'available' : 'absent'}`);

// ------------------------------------------------- 1. every panel wears the state it claims
console.log('\neach panel wears the state it claims, and no other state’s colours:');
for (const v of verdicts) {
  const leaked = Object.entries(v.foreignPixels).filter(([, n]) => n > 0);
  const ok = v.present && leaked.length === 0;
  if (!ok) failed = true;
  console.log(
    `  ${ok ? 'ok ' : 'XX '}${v.tag.padEnd(32)} own ${(v.ownShare * 100).toFixed(1).padStart(5)}%` +
      (leaked.length ? `  LEAKED: ${leaked.map(([s, n]) => `${s}x${n}`).join(', ')}` : ''),
  );
}

// ------------------------------------------------- 2/3. EXACTLY ONE THING DIFFERS
console.log('\nexactly one thing differs — the moved family, and only it:');
for (const zoom of [2, 8]) {
  for (const st of STATES) {
    const a = digests[`clay-pre-clay-${st}-${zoom}px`];
    const b = digests[`clay-live-${st}-${zoom}px`];
    const same = a === b;
    const want = st === MOVED ? 'DIFFER' : 'IDENTICAL';
    const ok = st === MOVED ? !same : same;
    if (!ok) failed = true;
    console.log(
      `  ${ok ? 'ok ' : 'XX '}${zoom}px ${st.padEnd(10)} ${a} ${same ? '==' : '!='} ${b}   (want ${want})`,
    );
  }
}

// The merge is still a fact about delivered pixels, in BOTH arms — this change does not touch it,
// and a comparison page is the cheapest place for that to silently stop being true.
console.log('\nand the ADR-0462 merge still holds in both arms:');
for (const zoom of [2, 8]) {
  for (const p of ['pre-clay', 'live']) {
    const a = digests[`clay-${p}-proposed-${zoom}px`];
    const b = digests[`clay-${p}-building-${zoom}px`];
    const same = a === b;
    if (!same) failed = true;
    console.log(`  ${same ? 'ok ' : 'XX '}${p.padEnd(8)} ${zoom}px  proposed ${same ? '==' : '!='} building`);
  }
}

// ------------------------------------------------- 4. palette closure
const breached = verdicts.filter((v) => !v.closed);
console.log(`\npalette closure: ${breached.length === 0 ? 'CLOSED on all ' + verdicts.length + ' panels' : 'BREACHED'}`);
for (const v of breached) {
  failed = true;
  console.log(`  XX ${v.tag.padEnd(32)} ${v.offPalette} px off-palette, worst ${v.worstOffender?.[0]}`);
}

// ------------------------------------------------- 5. the pure vocabulary numbers
const before = foreignColourReads(ADR0462_STATUS_TOKENS);
const after = foreignColourReads();
console.log('\ncan a reader be told the wrong thing? (reader model, every rung)');
console.log(`  BEFORE ${before.length} misreads: ${before.join(' · ') || '—'}`);
console.log(`  AFTER  ${after.length} misreads: ${after.join(' · ') || '—'}`);

const vBefore = vocabularySeparation(ADR0462_STATUS_TOKENS);
const vAfter = vocabularySeparation();
const pairsBefore = new Map(colourPairs(ADR0462_STATUS_TOKENS).map((p) => [`${p.a}/${p.b}`, p]));
console.log('\ncolour separation, cross-rung, TIGHTEST BY RATIO first (bar = one lighting step):');
const ranked = [...colourPairs()].sort((x, y) => x.distance / x.step - y.distance / y.step);
for (const p of ranked) {
  const b = pairsBefore.get(`${p.a}/${p.b}`) ?? pairsBefore.get(`${p.b}/${p.a}`);
  console.log(
    `  ${`${p.a}/${p.b}`.padEnd(16)} before ${(b ? b.distance / b.step : NaN).toFixed(3).padStart(6)}x` +
      `  after ${(p.distance / p.step).toFixed(3).padStart(6)}x  ${p.distance > p.step ? 'clears' : 'UNDER'}`,
  );
}
console.log(
  `\ntightest pair: ${vBefore.tightest.pair} ${vBefore.tightest.ratio.toFixed(3)}x ` +
    `-> ${vAfter.tightest.pair} ${vAfter.tightest.ratio.toFixed(3)}x`,
);
console.log(`separation floor: BEFORE ${vBefore.pass ? 'pass' : 'REFUSED'} · AFTER ${vAfter.pass ? 'pass' : 'REFUSED'}`);
// ⚠ THE INSTRUMENT MUST BE ABLE TO SAY NO. If the pre-change palette passed the floor, the floor
// is not measuring anything and the AFTER pass means nothing either.
if (vBefore.pass) {
  console.log('  XX the floor PASSED the pre-change palette — it cannot fail, so it proves nothing');
  failed = true;
}
if (!vAfter.pass) {
  console.log('  XX the floor REFUSED the shipped palette');
  failed = true;
}

writeFileSync(
  join(OUT, 'clay-measure.json'),
  `${JSON.stringify(
    {
      url: URL,
      renderer,
      software: SOFTWARE,
      movedFamily: { status: MOVED, before: ADR0462_STATUS_TOKENS.get(MOVED), after: STATUS_TOKENS.get(MOVED) },
      foreignColourReads: { before, after },
      colourPairs: { before: colourPairs(ADR0462_STATUS_TOKENS), after: colourPairs() },
      separation: { before: vBefore, after: vAfter },
      digests,
      verdicts,
      panels: results,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwrote ${join(OUT, 'clay-measure.json')} and ${expectedTags.length} PNGs`);

if (failed) {
  console.error('\nFAILED — see the XX rows above.');
  process.exit(1);
}
