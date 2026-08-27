// status-measure.mjs — MEASURE the five-colour vocabulary on pixels a browser actually delivered.
//
// THE QUESTION IT ANSWERS, from the increment `four-status-colours-not-six` (ADR-0462): does the
// land still tell the truth about every capability it draws, now that two states share a colour
// and a third has gained one? The numbers are the deliverable, but the REFUSALS are what make them
// worth reading.
//
// ⚠⚠ IT READS `getImageData` OFF THE CANVAS, NOT A SCREENSHOT. Two evidence pictures on this arc
// were Playwright ELEMENT screenshots with the page's background composited in OPAQUE, so an alpha
// mask never reached the island and every figure derived from them was confounded. `getImageData`
// returns the canvas's own RGBA including real alpha, so the water around the island is
// transparent and the mask is exact.
//
// USAGE — and note the port, which has bitten this harness before:
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5201
//   ST_STATUS_URL=http://localhost:5201/status.html pnpm --filter @storytree/forest-world-r3f measure-status
//
// ⚠ `vite.config.ts` pins `strictPort: 5184` for EVERY worktree, so a sibling worktree's harness
// left running on the default port means you measure ITS tree and report the number as yours.
// This script REFUSES to run against 5184 unless ST_STATUS_ALLOW_DEFAULT_PORT is set, because a
// wrong-tree measurement produces a NUMBER rather than a missing file and is therefore worse than
// a crash.

import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATUS_TOKENS, landPalette, paletteImageOfToken, toHex } from './palette-band.ts';
import { measurePixels } from './pixel-metrics.ts';
import {
  LAND_COLOURS,
  LEGACY_STATUS_TOKENS,
  colourPairs,
  foreignColourReads,
  statusesWearing,
  worstColourPair,
} from './status-vocabulary.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env['ST_STATUS_URL'] ?? 'http://localhost:5201/status.html';
const OUT = process.env['ST_STATUS_OUT'] ?? join(HERE, '..', '..', '..', '.status-measure');

if (/:5184\b/.test(URL) && !process.env['ST_STATUS_ALLOW_DEFAULT_PORT']) {
  console.error(
    `REFUSED: ${URL} is the harness's pinned default port, which every worktree shares.\n` +
      'Start vite on a free port and pass ST_STATUS_URL, or set ST_STATUS_ALLOW_DEFAULT_PORT=1 if\n' +
      'you have PROVED this server is your own tree.',
  );
  process.exit(2);
}

const STATES = ['proposed', 'building', 'mapped', 'healthy', 'unhealthy', 'unknown'];
const PALETTES = { live: STATUS_TOKENS, legacy: LEGACY_STATUS_TOKENS };

/** Every colour one state's ground family can deliver, under one palette. */
function familyColours(families, status) {
  const fam = families.get(status);
  const set = new Set();
  for (const token of [...fam.top, fam.side]) for (const c of paletteImageOfToken(token)) set.add(toHex(c));
  return set;
}

/**
 * ⚠ THE GUARD THAT MATTERS MOST ON THIS PAGE, and the reason is a fault this project has already
 * met: an A/B whose two arms are secretly the SAME SCENE always reports "no measurable
 * difference", with the calm authority of a real measurement. This page has TWO ways to be
 * secretly-the-same and one way to be secretly-different, so all three are checked.
 *
 *   1. Every panel must deliver MOSTLY its own state's family colours. A panel whose `status`
 *      option never reached the fixture would draw `healthy` green under six different labels.
 *   2. The two AFTER yellow panels must be BYTE-IDENTICAL. That is the pixel proof of ADR-0462's
 *      merge — "two states, one token" established by delivered pixels rather than by reading the
 *      source — and it is the one assertion here that a source-reading test cannot make.
 *   3. The two BEFORE yellow panels must DIFFER. Without it, (2) would be satisfied by a page
 *      that ignored its `palette` prop and drew the live table in both rows, which is exactly the
 *      failure that would make the whole before/after comparison a picture of one thing twice.
 */
const YELLOW_PAIR = ['proposed', 'building'];

const WANT_GPU = process.env['ST_STATUS_GPU'] === '1';
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
// status page would still render islands and still produce plausible figures.
const marker = await page.evaluate(() => document.title);
if (!/five colours over six states/.test(marker)) {
  console.error(`REFUSED: ${URL} served "${marker}" — that is not this branch's status page.`);
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
    `REFUSED: ST_STATUS_GPU=1 was asked for and the context came up on ${renderer.renderer}.\n` +
      'A software renderer reporting as hardware is the one outcome worse than no measurement.',
  );
  await browser.close();
  process.exit(2);
}

const tags = await page.evaluate(() =>
  [...document.querySelectorAll('canvas[data-st-tag]')].map((c) => c.getAttribute('data-st-tag')),
);
const expectedTags = [];
for (const zoom of [2, 8]) for (const p of ['legacy', 'live']) for (const st of STATES) expectedTags.push(`status-${p}-${st}-${zoom}px`);
const missing = expectedTags.filter((t) => !tags.includes(t));
if (missing.length) {
  console.error(`REFUSED: the page is missing ${missing.length} expected canvas(es): ${missing.join(', ')}`);
  await browser.close();
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });

// The palette every panel is held to. BOTH tables' closures, because the page deliberately draws
// the retired one in its BEFORE rows — a fence that refused the legacy colours would refuse the
// comparison itself. The audited pages' own fence (`landPalette()` alone) is untouched.
const legacyClosure = new Set();
for (const st of STATES) for (const h of familyColours(LEGACY_STATUS_TOKENS, st)) legacyClosure.add(h);
const palette = new Set([...landPalette(), ...legacyClosure]);
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
    // A blank canvas cannot fail a colour check — it has no colour to be wrong. Refuse rather
    // than record zeros, which would read as a legitimate flat measurement.
    console.error(`REFUSED: canvas ${tag} is ${shot.w}x${shot.h} with NOTHING opaque.`);
    await browser.close();
    process.exit(2);
  }
  digests[tag] = createHash('sha256').update(bytes).digest('hex').slice(0, 16);

  const [, paletteKey, state, zoomKey] = tag.split('-');
  const families = PALETTES[paletteKey];
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
    `  ${ok ? 'ok ' : 'XX '}${v.tag.padEnd(30)} own ${(v.ownShare * 100).toFixed(1).padStart(5)}%` +
      (leaked.length ? `  LEAKED: ${leaked.map(([s, n]) => `${s}x${n}`).join(', ')}` : ''),
  );
}

// ------------------------------------------------- 2/3. the merge, proved on delivered pixels
console.log('\nthe merge, on delivered pixels:');
for (const zoom of [2, 8]) {
  const a = digests[`status-live-${YELLOW_PAIR[0]}-${zoom}px`];
  const b = digests[`status-live-${YELLOW_PAIR[1]}-${zoom}px`];
  const same = a === b;
  if (!same) failed = true;
  console.log(`  ${same ? 'ok ' : 'XX '}AFTER  ${zoom}px  proposed ${a} ${same ? '==' : '!='} building ${b}`);

  const la = digests[`status-legacy-${YELLOW_PAIR[0]}-${zoom}px`];
  const lb = digests[`status-legacy-${YELLOW_PAIR[1]}-${zoom}px`];
  const differ = la !== lb;
  if (!differ) failed = true;
  console.log(`  ${differ ? 'ok ' : 'XX '}BEFORE ${zoom}px  proposed ${la} ${differ ? '!=' : '=='} building ${lb}`);
}

// ------------------------------------------------- 4. palette closure
const breached = verdicts.filter((v) => !v.closed);
console.log(`\npalette closure: ${breached.length === 0 ? 'CLOSED on all ' + verdicts.length + ' panels' : 'BREACHED'}`);
for (const v of breached) {
  failed = true;
  console.log(`  XX ${v.tag.padEnd(30)} ${v.offPalette} px off-palette, worst ${v.worstOffender?.[0]}`);
}

// ------------------------------------------------- 5. the pure vocabulary numbers
const before = foreignColourReads(LEGACY_STATUS_TOKENS);
const after = foreignColourReads();
console.log('\ncan a reader be told the wrong thing? (reader model, every rung)');
console.log(`  BEFORE ${before.length} misreads: ${before.join(' · ')}`);
console.log(`  AFTER  ${after.length} misreads: ${after.join(' · ')}`);

const pairsBefore = new Map(colourPairs(LEGACY_STATUS_TOKENS).map((p) => [`${p.a}/${p.b}`, p.distance]));
console.log('\ncolour separation, cross-rung, closest first (bar = one lighting step):');
for (const p of colourPairs()) {
  const b = pairsBefore.get(`${p.a}/${p.b}`) ?? pairsBefore.get(`${p.b}/${p.a}`);
  console.log(
    `  ${`${p.a}/${p.b}`.padEnd(16)} before ${(b ?? NaN).toFixed(2).padStart(6)}  after ${p.distance.toFixed(2).padStart(6)}` +
      `  bar ${p.step.toFixed(2).padStart(6)}  ${p.distance > p.step ? 'clears' : 'UNDER'}`,
  );
}
const wb = worstColourPair(LEGACY_STATUS_TOKENS);
const wa = worstColourPair();
console.log(`\nworst pair of DISTINCT colours: ${wb.a}/${wb.b} ${wb.distance.toFixed(2)} -> ${wa.a}/${wa.b} ${wa.distance.toFixed(2)}`);

writeFileSync(
  join(OUT, 'status-measure.json'),
  `${JSON.stringify(
    {
      url: URL,
      renderer,
      software: SOFTWARE,
      vocabulary: LAND_COLOURS.map((c) => ({ colour: c, states: statusesWearing(c) })),
      foreignColourReads: { before, after },
      colourPairs: { before: colourPairs(LEGACY_STATUS_TOKENS), after: colourPairs() },
      worstColourPair: { before: wb, after: wa },
      digests,
      verdicts,
      panels: results,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwrote ${join(OUT, 'status-measure.json')} and ${expectedTags.length} PNGs`);

if (failed) {
  console.error('\nFAILED — see the XX rows above.');
  process.exit(1);
}
