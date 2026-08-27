// terrain-measure.mjs — DOES A NAMED TERRAIN CARRY A STATE THAT COLOUR CANNOT?
//
// THE QUESTION, from `name-the-four-states-as-terrains` on `adopt-the-land-into-the-shipped-map-arc`.
// ADR-0461 D1 decides that a capability's state is a named terrain rather than a tint. ADR-0462
// settled the colour vocabulary at five colours over SIX states, so `proposed` and `building`
// wear the same token. This measures whether the terrain actually separates them — on delivered
// pixels, with a bar read off a control in the same run.
//
// USAGE:
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5241 --strictPort
//   DISPLAY=:0 ST_TERRAIN_GPU=1 ST_TERRAIN_URL=http://localhost:5241/terrain.html \
//     pnpm --filter @storytree/forest-world-r3f measure-terrain
//
// ⚠ IT READS `getImageData` OFF THE CANVAS, NOT A SCREENSHOT, and this run has its own reason on
// top of the arc's standing one. A first pass compared two element SCREENSHOTS of the pair and
// they came back 466 px and 465 px tall — one row apart, from where the elements happened to sit
// on the page — so a byte-identity check between two panels that ARE identical could never have
// passed. `getImageData` returns the canvas's own buffer, including real alpha, so the water is
// transparent and the mask is exact.
//
// ⚠ THE GPU FLAGS ARE NOT INTERCHANGEABLE AND ONE OF THEM LIES. `--use-gl=egl` falls back to
// SwiftShader silently on this box, and so does omitting DISPLAY even headless. `ST_TERRAIN_GPU=1`
// REFUSES a software context rather than reporting a plausible number as a GPU one.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { landPalette } from './palette-band.ts';
import { pairVerdict, readTerrain } from './terrain-separation.ts';
import { TERRAINS, colourBlindPairs, terrainOf } from './terrain-vocabulary.ts';
import { separationOf } from './ground-cover.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env['ST_TERRAIN_URL'] ?? 'http://localhost:5241/terrain.html';
const OUT = process.env['ST_TERRAIN_OUT'] ?? join(HERE, '..', '..', '..', '.terrain-measure');
const WANT_GPU = process.env['ST_TERRAIN_GPU'] === '1';
const GPU_ARGS = ['--use-gl=angle', '--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'];

let failures = 0;
function refuse(msg) {
  console.error(`\nREFUSED: ${msg}`);
  failures++;
}

// ⚠ `vite.config.ts` pins strictPort 5184 for EVERY worktree — the default port may be a sibling
// worktree's server, and a wrong-tree measurement produces a NUMBER rather than a missing file.
if (/:5184\b/.test(URL) && !process.env['ST_TERRAIN_ALLOW_DEFAULT_PORT']) {
  console.error(`REFUSED: ${URL} is the harness's shared default port. Start vite on a free one.`);
  process.exit(2);
}

const browser = await chromium.launch(WANT_GPU ? { args: GPU_ARGS } : {});
const page = await browser.newPage({ viewport: { width: 2400, height: 1700 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });

// PROVE THE TREE before trusting a number. A page that served but is not this branch's terrain
// page would still render islands and still produce plausible figures.
const title = await page.evaluate(() => document.title);
if (!/the states as terrains/.test(title)) {
  console.error(`REFUSED: ${URL} served "${title}" — that is not this branch's terrain page.`);
  await browser.close();
  process.exit(2);
}

await page.waitForFunction(() => window.__stExperimentSettled === true, null, { timeout: 180_000 });

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
if (WANT_GPU && /swiftshader|llvmpipe|software/i.test(renderer.renderer)) {
  console.error(`REFUSED: ST_TERRAIN_GPU=1 asked for hardware and got ${renderer.renderer}.`);
  await browser.close();
  process.exit(2);
}
console.log(`renderer: ${renderer.renderer}`);
console.log(`vendor:   ${renderer.vendor}`);
console.log(`EXT_disjoint_timer_query_webgl2: ${renderer.timerQuery ? 'available' : 'ABSENT'}\n`);

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
const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Every panel, read once off its own canvas buffer. */
const panels = new Map();
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
    refuse(`canvas ${tag} yielded no pixels`);
    continue;
  }
  const data = Uint8Array.from(shot.data);
  const reading = readTerrain(data, shot.w, shot.h);
  if (!reading) {
    // A blank canvas has no contrast to be wrong about. Refuse rather than record zeros, which
    // would read as a legitimate flat land.
    refuse(`canvas ${tag} is ${shot.w}x${shot.h} and carries too little opaque land to measure`);
    continue;
  }
  // PALETTE CLOSURE, on every panel. A terrain that reported a colour no status owns would be
  // the art asserting a state the work does not hold — the one way this arc can do real harm.
  let offPalette = 0;
  const offenders = new Map();
  let opaque = 0;
  for (let i = 0; i < shot.w * shot.h; i++) {
    if (data[i * 4 + 3] < 128) continue;
    opaque++;
    const h = hex(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (!palette.has(h)) {
      offPalette++;
      offenders.set(h, (offenders.get(h) ?? 0) + 1);
    }
  }
  panels.set(tag, { ...reading, w: shot.w, h: shot.h, opaque, offPalette, offenders, data, png: shot.png });
  writeFileSync(join(OUT, `${tag}.png`), Buffer.from(shot.png.split(',')[1], 'base64'));
}

if (consoleErrors.length) refuse(`the page logged ${consoleErrors.length} error(s): ${consoleErrors[0]}`);

// ── palette ─────────────────────────────────────────────────────────────────────────────────
console.log('PALETTE CLOSURE');
for (const [tag, p] of panels) {
  if (p.offPalette > 0) {
    const worst = [...p.offenders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    refuse(`${tag}: ${p.offPalette} off-palette px (worst: ${worst.map(([h, n]) => `${h} x${n}`).join(', ')})`);
  }
}
if (failures === 0) console.log(`  CLOSED on all ${panels.size} panels — every delivered pixel is an authored ramp entry\n`);

// ── ⚠⚠ THE PREMISE: colour really cannot separate the pair ──────────────────────────────────
// This is the load-bearing refusal, and it is the one that stops the whole page being a picture
// of one thing twice. The two BEFORE panels must be BYTE-IDENTICAL: same token, same field, same
// light, no terrain. If they differ, something other than the terrain varies between the two
// states and every AFTER difference below is confounded.
const bytesEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const pairs = colourBlindPairs();
console.log('THE PREMISE — colour alone, on the pair that shares a token');
for (const { a, b } of pairs) {
  const pa = panels.get(`terrain-${a.state}-off-8px`);
  const pb = panels.get(`terrain-${b.state}-off-8px`);
  if (!pa || !pb) {
    refuse(`the BEFORE panels for ${a.state}/${b.state} are missing — the premise cannot be checked`);
    continue;
  }
  if (bytesEqual(pa.data, pb.data)) {
    console.log(`  ${a.state} and ${b.state} without terrain: BYTE-IDENTICAL (${pa.opaque} opaque px)`);
    console.log('  → colour cannot separate them. Anything below is the terrain and nothing else.\n');
  } else {
    let n = 0;
    for (let i = 0; i < pa.data.length; i += 4) if (pa.data[i] !== pb.data[i]) n++;
    refuse(
      `${a.state} and ${b.state} differ WITHOUT a terrain (${n} px). They share a token, so ` +
        'something else varies with the status and every terrain figure below is confounded.',
    );
  }
}

// ── the readings ────────────────────────────────────────────────────────────────────────────
console.log('EVERY TERRAIN, ON DELIVERED PIXELS AT 8 px / GROUND UNIT');
console.log('  terrain        state       anisotropy   fineness x/y      within(dir)  within(scale)');
for (const t of TERRAINS) {
  const p = panels.get(`terrain-${t.state}-on-8px`);
  if (!p) continue;
  console.log(
    `  ${t.name.padEnd(13)} ${t.state.padEnd(11)} ${p.anisotropy.toFixed(2).padStart(9)}   ` +
      `${p.fineness.x.toFixed(2).padStart(5)}/${p.fineness.y.toFixed(2).padEnd(6)}  ` +
      `${p.withinSpread.toFixed(4).padStart(9)}   ${p.withinFineness.toFixed(3).padStart(9)}`,
  );
}

// ── ⚠⚠ THE VERDICT ─────────────────────────────────────────────────────────────────────────
console.log('\nTHE PAIR COLOUR CANNOT SEPARATE — does the terrain?');
const verdicts = [];
for (const { a, b } of pairs) {
  const pa = panels.get(`terrain-${a.state}-on-8px`);
  const pb = panels.get(`terrain-${b.state}-on-8px`);
  if (!pa || !pb) {
    refuse(`the AFTER panels for ${a.state}/${b.state} are missing`);
    continue;
  }
  const v = pairVerdict(pa, pb);
  verdicts.push({ a: a.name, b: b.name, states: [a.state, b.state], ...v });
  console.log(`  ${a.name} (${a.state}) vs ${b.name} (${b.state})`);
  console.log(`    colour distance:        0.00  — they wear the same token, by decision`);
  console.log(
    `    direction:  ${v.between.toFixed(4)} against a same-run bar of ${v.bar.toFixed(4)}  ` +
      `→ ${v.separatedByDirection ? 'SEPARATED' : 'no'}`,
  );
  console.log(
    `    scale:      ${v.betweenFineness.toFixed(3)} octaves against a bar of ${v.barFineness.toFixed(3)}  ` +
      `→ ${v.separatedByScale ? 'SEPARATED' : 'no'}`,
  );
  console.log(`    VERDICT: ${v.separated ? `SEPARATED, ${v.margin.toFixed(1)}x its bar` : 'NOT SEPARATED'}`);
  if (!v.separated) {
    refuse(
      `${a.name} and ${b.name} share a colour AND are not distinguishable as land. The two ` +
        'states are indistinguishable on the map, which is the one thing the vocabulary exists to prevent.',
    );
  }
}

// Every other pair, for the record — these are already separated by hue, so terrain is an
// enrichment there rather than the carrier, and saying so is the honest claim.
console.log('\nEVERY OTHER PAIR — already separated by colour; terrain is an enrichment, not the carrier');
const all = [];
for (let i = 0; i < TERRAINS.length; i++) {
  for (let j = i + 1; j < TERRAINS.length; j++) {
    const a = TERRAINS[i];
    const b = TERRAINS[j];
    if (a.token === b.token) continue;
    const pa = panels.get(`terrain-${a.state}-on-8px`);
    const pb = panels.get(`terrain-${b.state}-on-8px`);
    if (!pa || !pb) continue;
    const v = pairVerdict(pa, pb);
    const colour = separationOf(a.token);
    all.push({ a: a.name, b: b.name, ...v, colourNearest: colour.nearest });
    console.log(
      `  ${a.name.padEnd(11)} vs ${b.name.padEnd(11)} dir ${v.between.toFixed(4)}/${v.bar.toFixed(4)}  ` +
        `scale ${v.betweenFineness.toFixed(2)}/${v.barFineness.toFixed(2)}  ` +
        `${v.separated ? `also separated as LAND (${v.margin.toFixed(1)}x)` : 'colour only'}`,
    );
  }
}
const alsoLand = all.filter((v) => v.separated).length;
console.log(`\n  ${alsoLand} of ${all.length} colour-separated pairs are ALSO separated as land.`);

// ── the overview ────────────────────────────────────────────────────────────────────────────
// ⚠ THE ROW THAT CAN FAIL HONESTLY. A treatment that only works zoomed in is where this gets
// found out, and reporting the 2 px row is how it gets found out here rather than on the map.
console.log('\nAT THE OVERVIEW (2 px / ground unit) — does a terrain survive being small?');
for (const { a, b } of pairs) {
  const pa = panels.get(`terrain-${a.state}-on-2px`);
  const pb = panels.get(`terrain-${b.state}-on-2px`);
  if (!pa || !pb) {
    console.log('  NOT MEASURED — the overview panels are missing.');
    continue;
  }
  const v = pairVerdict(pa, pb);
  verdicts.push({ a: a.name, b: b.name, zoom: 2, ...v });
  console.log(
    `  ${a.name} vs ${b.name}: dir ${v.between.toFixed(4)}/${v.bar.toFixed(4)} · ` +
      `scale ${v.betweenFineness.toFixed(3)}/${v.barFineness.toFixed(3)} → ` +
      `${v.separated ? `SEPARATED, ${v.margin.toFixed(1)}x` : 'NOT SEPARATED at this zoom'}`,
  );
  // ⚠ NOT A REFUSAL. The overview is a genuinely harder frame and a terrain that carries only
  // at the zoom is a real, reportable result rather than a broken run — the arc's own measured
  // finding is that detail is what the overview cannot hold. It is REPORTED loudly and left for
  // a person to weigh.
  if (!v.separated) {
    console.log('  ⚠ the terrain does NOT carry at the overview — colour is the only channel there.');
  }
}

writeFileSync(
  join(OUT, 'terrain-measure.json'),
  `${JSON.stringify(
    {
      url: URL,
      renderer,
      panels: Object.fromEntries(
        [...panels].map(([k, p]) => [
          k,
          {
            w: p.w,
            h: p.h,
            opaque: p.opaque,
            offPalette: p.offPalette,
            signature: p.signature,
            anisotropy: p.anisotropy,
            fineness: p.fineness,
            withinSpread: p.withinSpread,
            withinFineness: p.withinFineness,
          },
        ]),
      ),
      verdicts,
      otherPairs: all,
      vocabulary: TERRAINS.map((t) => ({ ...t, terrain: terrainOf(t.state)?.name })),
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwrote ${OUT}`);

await browser.close();
if (failures > 0) {
  console.error(`\n${failures} REFUSAL(S) — this run does not support a claim.`);
  process.exit(1);
}
