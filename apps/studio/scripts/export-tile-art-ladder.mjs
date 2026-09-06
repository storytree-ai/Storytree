// export-tile-art-ladder.mjs — THE 2D ART PASS'S LADDERS (ADR-0528 D2), captured from the RUNNING
// studio at the map's own views. The tile change re-bases every prop uniformly, which keeps the
// working zoom's composition exactly what it was; what it does NOT settle is the rungs the props
// should sit at now that a small story's island is one hex under a full-size tree. Each arm below
// varies ONE rung (`?treeRung=`, `?plateRung=`, `?trailRung=`, `?floraRung=` — the studio's live
// dials, read into `SceneInput.tile.rungs`) at the shipped spacing, and the sheet the owner scales
// back from is the resting view — the WORKING zoom, the hard requirement — beside the fitted one.
//
//   ST_STUDIO_URL=http://127.0.0.1:<port> node --import ../../scripts/tsx-cache-off.mjs --import tsx scripts/export-tile-art-ladder.mjs
//
// Writes into docs/research/chapter2-tile-footprint-2026-09-06/art/:
//   2d-<arm>-<view>.png      the studio at the resting (working) view and the fitted view
//   art-metrics.json         scale, median island px, read island px, plate text px per arm and view
//   art-report.txt           the same as a table, with the pixels moved against the `rung-1` arm
//
// ⚠ NOT a 3D instrument: the rungs are 2D drawing scales the 3D mapper never reads, so nothing here
// touches the island or the forest — the tile ladder proper is `export-tile-scenes.mjs`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { FLORA_ART_RUNG, PLATE_ART_RUNG, TRAIL_ART_RUNG, TREE_ART_RUNG, TILE_SCALE } from '@storytree/forest-world';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const URL_ = process.env['ST_STUDIO_URL'] ?? '';
const OUT = process.env['ST_TILE_ART_OUT'] ?? join(REPO, 'docs', 'research', 'chapter2-tile-footprint-2026-09-06', 'art');
const READ_ISLAND = process.env['ST_TILE_READ_ISLAND'] ?? 'context-traversal-capture';
const VIEWPORT = { width: 1600, height: 1000 };
const MIN_ISLANDS = Number(process.env['ST_TILE_MIN_ISLANDS'] ?? 30);
const VISIBLE_DELTA = 20;

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};
if (!URL_) fail('set ST_STUDIO_URL to the studio you started on a port of your own');
if (/:5173(\/|$)/.test(URL_)) fail("ST_STUDIO_URL points at 5173, the studio's default port — a sibling worktree may own it.");

/** The shipped rungs, then one rung moved per arm. `1/TILE_SCALE` on the trail is the 3D-consistent
 *  width (the ribbon's own width on the 2D island); the plate's rungs are the legibility bumps; the
 *  tree's descend so a one-hex island can read under its tree, and one rung ascends as the control's
 *  own scale-back direction. */
const SHIPPED = { tree: TREE_ART_RUNG, plate: PLATE_ART_RUNG, flora: FLORA_ART_RUNG, trail: TRAIL_ART_RUNG };
const ARMS = [
  { id: 'shipped', rungs: {} },
  { id: 'tree-0.8', rungs: { treeRung: 0.8 } },
  { id: 'tree-0.65', rungs: { treeRung: 0.65 } },
  { id: 'tree-1.25', rungs: { treeRung: 1.25 } },
  { id: 'plate-1.25', rungs: { plateRung: 1.25 } },
  { id: 'plate-1.5', rungs: { plateRung: 1.5 } },
  { id: `trail-3d`, rungs: { trailRung: Number((1 / TILE_SCALE).toFixed(3)) } },
  { id: 'flora-1.5', rungs: { floraRung: 1.5 } },
];
const VIEWS = [
  { id: 'resting', query: '' },
  { id: 'fit', query: 'restingView=fit' },
];

mkdirSync(OUT, { recursive: true });
const health = await (await fetch(`${URL_}/api/health`)).json().catch((e) => fail(`no /api/health at ${URL_}: ${e}`));
if (resolve(health.code.directory) !== REPO) fail(`the studio at ${URL_} runs from ${health.code.directory}, not this worktree`);
if (health.store !== 'pg' || health.db !== 'ok') fail(`the studio at ${URL_} is not on the live store`);
if (health.code.stale) fail(`the studio at ${URL_} reports itself STALE against the checkout — restart it`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// ⚠ WARM THE MAP BEFORE THE FIRST CAPTURE. The studio computes its resting frame ONCE on mount from
// the islands it has at that moment; on a cold payload cache the corpus is still streaming in, so
// the first capture of a run rests on a partial forest's median island and reports a different
// scale from every later one (measured: 2.182 against 1.787 on the same arm). One throwaway load
// fills the cache; every capture below then mounts on the whole corpus.
await page.goto(`${URL_}/?sceneExport=1#/tree`, { waitUntil: 'networkidle', timeout: 120_000 });
await page.waitForSelector('g.world-camera', { timeout: 90_000 });
await page.waitForFunction((min) => new Set([...document.querySelectorAll('[data-story-id]')].map((e) => e.getAttribute('data-story-id'))).size >= min, MIN_ISLANDS, { timeout: 120_000 });
await page.waitForTimeout(2000);

async function capture(arm, view) {
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(arm.rungs).map(([k, v]) => [k, String(v)])), sceneExport: '1' });
  if (view.query) for (const [k, v] of new URLSearchParams(view.query)) q.set(k, v);
  await page.goto(`${URL_}/?${q.toString()}#/tree`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForSelector('g.world-camera', { timeout: 90_000 });
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 160 && stable < 4; i += 1) {
    await page.waitForTimeout(500);
    const n = await page.evaluate(() => new Set([...document.querySelectorAll('[data-story-id]')].map((e) => e.getAttribute('data-story-id'))).size);
    stable = n === last && n > 0 ? stable + 1 : 0;
    last = n;
  }
  if (last < MIN_ISLANDS) fail(`${arm.id}/${view.id}: only ${last} islands settled`);
  await page.waitForFunction(() => window.__storytreeSceneExport !== undefined, null, { timeout: 60_000 });
  await page.waitForTimeout(1000);
  const read = await page.evaluate((readIsland) => {
    const b = window.__storytreeSceneExport;
    const g = document.querySelector('g.world-camera');
    const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)\s*scale\(([-\d.]+)\)/.exec(g?.getAttribute('transform') ?? '');
    const byId = new Map();
    for (const el of document.querySelectorAll('[data-story-id]')) {
      const id = el.getAttribute('data-story-id');
      const r = el.getBoundingClientRect();
      const prev = byId.get(id);
      if (!prev || r.width * r.height > prev.w * prev.h) byId.set(id, { id, w: r.width, h: r.height });
    }
    const plate = [...document.querySelectorAll('.world-plate-id')].find((e) => e.textContent === readIsland);
    const pr = plate ? plate.getBoundingClientRect() : null;
    // the story tree is the unified vocabulary's `<use>` of the autumn-tree def (ADR-0227)
    const tree = document.querySelector(`[data-story-id="${readIsland}"] use`);
    const tr = tree ? tree.getBoundingClientRect() : null;
    const widths = [...byId.values()].map((i) => i.w).sort((p, q) => p - q);
    return {
      tile: b?.tile ?? null,
      scale: m ? +m[3] : null,
      islands: byId.size,
      medianIslandWidthPx: widths[Math.floor(widths.length / 2)] ?? null,
      readIslandPx: byId.get(readIsland) ? { w: byId.get(readIsland).w, h: byId.get(readIsland).h } : null,
      plateTextPx: pr ? { w: pr.width, h: pr.height } : null,
      treePx: tr ? { w: tr.width, h: tr.height } : null,
    };
  }, READ_ISLAND);
  const png = join(OUT, `2d-${arm.id}-${view.id}.png`);
  await page.screenshot({ path: png });
  return { ...read, png };
}

const rows = [];
for (const arm of ARMS) {
  for (const view of VIEWS) {
    const r = await capture(arm, view);
    if (pageErrors.length) fail(`the page reported errors on ${arm.id}/${view.id}:\n  ${pageErrors.join('\n  ')}`);
    rows.push({ arm: arm.id, rungs: { ...SHIPPED, ...Object.fromEntries(Object.entries(arm.rungs).map(([k, v]) => [k.replace('Rung', ''), v])) }, view: view.id, ...r });
    console.log(`${arm.id.padEnd(12)} ${view.id.padEnd(8)} scale ${r.scale?.toFixed(3)}  plate text ${r.plateTextPx?.h.toFixed(1)} px  → ${r.png}`);
  }
}

// pixels moved against the shipped arm at the same view, in the browser
await page.setContent('<canvas id="a"></canvas><canvas id="b"></canvas>');
const { readFileSync } = await import('node:fs');
const dataUrl = (png) => `data:image/png;base64,${readFileSync(png).toString('base64')}`;
for (const view of VIEWS) {
  const control = rows.find((r) => r.arm === 'shipped' && r.view === view.id);
  for (const row of rows.filter((r) => r.view === view.id)) {
    if (row.arm === 'shipped') {
      row.movedVsShipped = 0;
      continue;
    }
    const m = await page.evaluate(
      async ([a, b, delta]) => {
        const load = (src) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const draw = (id, img) => { const c = document.getElementById(id); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, img.width, img.height).data; };
        const pa = draw('a', ia);
        const pb = draw('b', ib);
        let visible = 0;
        for (let i = 0; i < pa.length; i += 4) {
          if (Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])) > delta) visible += 1;
        }
        return visible;
      },
      [dataUrl(control.png), dataUrl(row.png), VISIBLE_DELTA],
    );
    row.movedVsShipped = m;
  }
}
await browser.close();

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
say(`THE 2D ART LADDER — one rung per arm at the shipped spacing; moved = pixels differing by more than ${VISIBLE_DELTA}/255 on any channel against the shipped arm at the same view (ADR-0490 D6)`);
say(`shipped rungs: tree ${SHIPPED.tree} · plate ${SHIPPED.plate} · flora ${SHIPPED.flora} · trail ${SHIPPED.trail}  (× TILE_SCALE ${TILE_SCALE.toFixed(4)} on the drawing)`);
say('');
for (const view of VIEWS) {
  say(`── ${view.id} ─────────────────────────────`);
  say('arm           rungs (tree/plate/flora/trail)   scale   median island px   read island px   tree px (w×h)   plate text px   moved>20 vs shipped');
  for (const row of rows.filter((r) => r.view === view.id)) {
    const rg = `${row.rungs.tree}/${row.rungs.plate}/${row.rungs.flora}/${row.rungs.trail}`;
    say(
      `${row.arm.padEnd(12)}  ${rg.padEnd(30)} ${row.scale.toFixed(3).padStart(6)} ${String(row.medianIslandWidthPx?.toFixed(0) ?? '—').padStart(18)} ${String(row.readIslandPx?.w.toFixed(0) ?? '—').padStart(16)} ` +
        `${(row.treePx ? `${row.treePx.w.toFixed(0)}×${row.treePx.h.toFixed(0)}` : '—').padStart(14)} ${String(row.plateTextPx?.h.toFixed(1) ?? '—').padStart(15)} ${String(row.movedVsShipped).padStart(20)}` +
        (row.arm === 'shipped' ? '   ← SHIPPED' : ''),
    );
  }
  say('');
}
writeFileSync(join(OUT, 'art-metrics.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), studio: { url: URL_, head: health.code.head, branch: health.code.branch }, readIsland: READ_ISLAND, rows }, null, 2)}\n`);
writeFileSync(join(OUT, 'art-report.txt'), `${lines.join('\n')}\n`);
console.log(`wrote ${OUT}`);
