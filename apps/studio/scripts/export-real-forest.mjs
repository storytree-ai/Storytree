// export-real-forest.mjs — EXPORT THE REAL MAP, ONCE, AS IT SHIPS TODAY: the scene graph the studio's
// own 2D map built for the live corpus, plus the 2D picture itself at the fitted framing, so the 3D
// harness can render THE SAME FOREST and the two can be put side by side.
//
// Run the studio on a port of your own (never 5173 — a sibling worktree may own it; the memory
// `strictport-vite-collision-measures-a-siblings-worktree` is exactly this), then from `apps/studio`:
//
//   ST_STUDIO_URL=http://127.0.0.1:<port> node scripts/export-real-forest.mjs
//
// ⚠ IT IS THE SPACING EXPORTER'S SIBLING, NOT ITS REPLACEMENT, and the difference is the whole point.
// `export-spacing-scenes.mjs` and `export-tile-scenes.mjs` walk a LADDER: they drive the map through
// arms that do not ship, because their pages judge a candidate. This one exports exactly ONE arm and
// asks the map for NOTHING — no `spacing=`, no `tile=`, no rung override — so what it writes is the
// layout a member opens the studio on today. There is no control arm here because there is nothing
// being compared: the subject is the map itself.
//
// ⚠ IT READS THE DELIVERED SCENE OFF THE PAGE, never a re-derivation. The bridge (`?sceneExport=1`,
// `src/lib/sceneExport.ts`) parks the exact `buildScene(worldToScene(buildWorld(...)))` the map drew
// on `window`. A driver that rebuilt the world in Node would be a second layout that could drift
// from the shipped one, and `TreeView.tsx` cannot be imported under Node anyway.
//
// ⚠ FAIL CLOSED ON A HALF-LOADED MAP — the corpus streams in and the world is rebuilt as it does, so
// an early read exports a forest that is not there yet. Wait for the island count to stop moving,
// refuse below a floor, then read.
//
// ⚠ THE SERVER MUST BE THIS WORKTREE'S, ON THE LIVE STORE. `/api/health` stamps both; a fixture-backed
// or sibling-backed studio would hand over someone else's forest under this file's name.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { pruneSceneForMapper } from '../src/lib/sceneExport.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const URL_ = process.env['ST_STUDIO_URL'] ?? '';
const EVIDENCE_OUT = process.env['ST_REAL_EVIDENCE_OUT'] ?? join(REPO, 'docs', 'research', 'chapter2-real-forest-2026-09-08');
const SCENES_OUT = process.env['ST_REAL_SCENES_OUT'] ?? join(EVIDENCE_OUT, 'scenes');
/** The 3D harness renders at `CROWD_VIEWPORT` (2560x1600, dpr 1). The 2D map is captured at the SAME
 *  pixel size so the two pictures are the same buffer, and only what is IN them differs. */
const VIEWPORT = { width: 2560, height: 1600 };
const MIN_ISLANDS = Number(process.env['ST_REAL_MIN_ISLANDS'] ?? 30);
/** The one arm's id — the shipped map. Named rather than `default` so a sheet's caption can say it. */
const ARM = 'shipped';

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (!URL_) fail('set ST_STUDIO_URL to the studio you started on a port of your own (e.g. http://127.0.0.1:5417)');
if (/:5173(\/|$)/.test(URL_)) fail("ST_STUDIO_URL points at 5173, the studio's default port — a sibling worktree may own it. Start your own on another port.");

mkdirSync(SCENES_OUT, { recursive: true });
mkdirSync(EVIDENCE_OUT, { recursive: true });

const health = await (await fetch(`${URL_}/api/health`)).json().catch((e) => fail(`no /api/health at ${URL_}: ${e}`));
if (!health || typeof health.code?.directory !== 'string') fail(`/api/health carries no code.directory — is ${URL_} a studio?`);
if (resolve(health.code.directory) !== REPO) {
  fail(`the studio at ${URL_} runs from ${health.code.directory}, not this worktree (${REPO}) — its packer is someone else's`);
}
if (health.store !== 'pg' || health.db !== 'ok') {
  fail(`the studio at ${URL_} is not on the live store (store=${health.store}, db=${health.db}) — the layout would be of a fixture, not the corpus`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

/** Load one view, wait for the corpus to settle, read the bridge, the delivered camera and the 2D picture. */
async function capture(view) {
  const url = `${URL_}/?sceneExport=1${view.query ? `&${view.query}` : ''}#/tree`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForSelector('g.world-camera', { timeout: 90_000 });
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 160 && stable < 4; i += 1) {
    await page.waitForTimeout(500);
    const n = await page.evaluate(
      () => new Set([...document.querySelectorAll('[data-story-id]')].map((e) => e.getAttribute('data-story-id'))).size,
    );
    stable = n === last && n > 0 ? stable + 1 : 0;
    last = n;
  }
  if (last < MIN_ISLANDS) fail(`${view.id}: only ${last} islands settled (floor ${MIN_ISLANDS}) — the map never finished loading`);
  await page.waitForFunction(() => window.__storytreeSceneExport !== undefined, null, { timeout: 60_000 });
  await page.waitForTimeout(1000);
  const read = await page.evaluate(() => {
    const b = window.__storytreeSceneExport;
    const g = document.querySelector('g.world-camera');
    const t = g?.getAttribute('transform') ?? '';
    const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)\s*scale\(([-\d.]+)\)/.exec(t);
    const byId = new Map();
    for (const el of document.querySelectorAll('[data-story-id]')) {
      const id = el.getAttribute('data-story-id');
      const r = el.getBoundingClientRect();
      const prev = byId.get(id);
      if (!prev || r.width * r.height > prev.w * prev.h) byId.set(id, { id, w: r.width, h: r.height, x: r.x, y: r.y });
    }
    return {
      bridge: JSON.stringify(b),
      camera: { transform: t, scale: m ? +m[3] : null },
      islands2d: [...byId.values()],
    };
  });
  const png = join(EVIDENCE_OUT, `2d-${view.id}.png`);
  await page.screenshot({ path: png });
  return { ...read, png };
}

/** The two 2D views: the whole forest fitted — the one the 3D page's own fit is comparable to — and
 *  the designed resting view the map actually opens on (ADR-0471), which is a CROP of it. */
const VIEWS = [
  { id: 'fit', query: 'restingView=fit' },
  { id: 'resting', query: '' },
];

const rows = [];
let bridgeJson = null;
for (const view of VIEWS) {
  const r = await capture(view);
  if (pageErrors.length) fail(`the page reported errors on ${view.id}:\n  ${pageErrors.join('\n  ')}`);
  const bridge = JSON.parse(r.bridge);
  if (view.id === 'fit') {
    bridgeJson = bridge;
    // Pruned to what the mapper reads — the 2D grass, shrubs, plates and coast are drawn by nothing
    // in 3D and are four fifths of the bytes. The bookkeeping rides alongside untouched.
    const slim = { ...bridge, scene: pruneSceneForMapper(bridge.scene) };
    writeFileSync(join(SCENES_OUT, `${ARM}.json`), JSON.stringify(slim));
    bridgeJson.slimBytes = JSON.stringify(slim).length;
  } else if (bridgeJson) {
    // the two views must be the SAME layout — the camera is the only thing the view flag changes
    if (JSON.stringify(bridgeJson.world.islands) !== JSON.stringify(bridge.world.islands)) {
      fail('the fitted and resting views laid the forest out differently — the view flag moved the layout');
    }
  }
  const xs = r.islands2d.map((i) => i.x);
  const ys = r.islands2d.map((i) => i.y);
  const x2 = r.islands2d.map((i) => i.x + i.w);
  const y2 = r.islands2d.map((i) => i.y + i.h);
  rows.push({
    view: view.id,
    islands: r.islands2d.length,
    scale: r.camera.scale,
    viewport: { w: VIEWPORT.width, h: VIEWPORT.height },
    contentExtentPx: r.islands2d.length ? { w: Math.max(...x2) - Math.min(...xs), h: Math.max(...y2) - Math.min(...ys) } : null,
    medianIslandWidthPx: r.islands2d.length ? [...r.islands2d.map((i) => i.w)].sort((p, q) => p - q)[Math.floor(r.islands2d.length / 2)] : null,
    png: r.png,
  });
  console.log(`${view.id.padEnd(8)} islands ${r.islands2d.length}  scale ${r.camera.scale}  → ${r.png}`);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  studio: { url: URL_, head: health.code.head, branch: health.code.branch },
  control: ARM,
  arms: [
    {
      id: ARM,
      spacing: bridgeJson.spacing ?? {},
      tile: bridgeJson.tile,
      file: `${ARM}.json`,
      islands: bridgeJson.world.islands.length,
      world: { width: bridgeJson.world.width, height: bridgeJson.world.height },
      trails: bridgeJson.trails,
      bytes: bridgeJson.slimBytes,
    },
  ],
  twoD: rows,
};
writeFileSync(join(SCENES_OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();

console.log(
  `\nexported the shipped layout: ${manifest.arms[0].islands} islands, ${(manifest.arms[0].bytes / 1024).toFixed(0)} KB, ` +
    `${manifest.arms[0].trails.edges} trail edges routed / ${manifest.arms[0].trails.dropped.length} dropped\n` +
    `→ ${SCENES_OUT}\n→ ${EVIDENCE_OUT}`,
);
