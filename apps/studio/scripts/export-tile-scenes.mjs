// export-tile-scenes.mjs — walk the ADR-0528 tile ladder through the RUNNING studio and export, per gap
// rung, the scene graph the 2D map actually built on the DERIVED tile, so the 3D comparison page
// (`packages/forest-world-r3f/harness/shipped-tile.html`) renders the REAL forest as this map lays it
// out — beside the map as it SHIPPED, exported from the untouched code.
//
// Run the studio on a port of your own (never 5173 — a sibling worktree may own it), then from
// `apps/studio`:
//
//   ST_STUDIO_URL=http://127.0.0.1:<port> node scripts/export-tile-scenes.mjs
//
// It writes, into docs/research/chapter2-tile-footprint-2026-09-06/:
//   scenes/tile-spacing-<r>.json   the scene graph on the derived tile at gap ratio r (pruned to what
//                                  the 3D mapper reads — `pruneSceneForMapper`) + layout bookkeeping
//   scenes/today.json              THE CONTROL — copied from `old-tile/scenes/spacing-<shipped>.json`, the
//                                  export taken from the untouched code at the merge-base BEFORE any
//                                  file of this branch was edited (`export-spacing-scenes.mjs` pointed
//                                  at `old-tile/`); its source head is recorded on the arm
//   scenes/manifest.json           which arms, on which tile, from which corpus and head, when
//   2d-<arm>-<view>.png            the 2D studio map itself: fitted, at the designed resting view, and
//                                  at the read island's own deep link (the WORKING zoom an operator
//                                  selects and reads at)
//   2d-metrics.json                the 2D camera scale and island pixel sizes per arm and view
//
// ⚠ IT READS THE DELIVERED SCENE OFF THE PAGE, never a re-derivation (`?sceneExport=1`,
// `src/lib/sceneExport.ts`): what the 3D page renders is byte-for-byte the 2D map's own layout at that
// rung — same live corpus, same fold, same vegetation. The bridge also reports the TILE the lattice was
// built on, and the export REFUSES a studio whose tile is not smaller than the control's: that would be
// the old tile wearing the new arm ids.
//
// ⚠ THE CONTROL IS NOT RE-EXPORTED HERE, ON PURPOSE. The tile is a module constant of the shared
// engine; once this branch has changed it, no running studio can stand the old tile any more. The
// control is therefore taken FIRST, from the clean tree, and carried in with its head recorded — the
// same reason the spacing page typed its legacy gaps as history. `git diff <that head>..HEAD` on the
// layout files is how a reader checks the control is still what ships.
//
// ⚠ FAIL CLOSED ON A HALF-LOADED MAP and ⚠ THE SERVER MUST BE THIS WORKTREE'S — as `export-spacing-scenes.mjs`.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { PRE_ADR0528_TILE } from '@storytree/forest-world';

import { ISLAND_SPACING_RATIO, ISLAND_SPACING_RUNGS, spacingArmId } from '../src/lib/islandSpacing.ts';
import { pruneSceneForMapper } from '../src/lib/sceneExport.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const URL_ = process.env['ST_STUDIO_URL'] ?? '';
const EVIDENCE_OUT = process.env['ST_TILE_EVIDENCE_OUT'] ?? join(REPO, 'docs', 'research', 'chapter2-tile-footprint-2026-09-06');
const SCENES_OUT = join(EVIDENCE_OUT, 'scenes');
const OLD_TILE = process.env['ST_TILE_CONTROL_DIR'] ?? join(EVIDENCE_OUT, 'old-tile');
const CONTROL_ARM = 'today';
/** The island the read zoom is centred on — the real story the harness fixture is shaped after
 *  (`READ_ISLAND` in `shipped-spacing-scene.ts`). */
const READ_ISLAND = process.env['ST_TILE_READ_ISLAND'] ?? 'context-traversal-capture';
const VIEWPORT = { width: 1600, height: 1000 };
const MIN_ISLANDS = Number(process.env['ST_TILE_MIN_ISLANDS'] ?? 30);

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exit(1);
};

if (!URL_) fail('set ST_STUDIO_URL to the studio you started on a port of your own (e.g. http://127.0.0.1:5397)');
if (/:5173(\/|$)/.test(URL_)) fail("ST_STUDIO_URL points at 5173, the studio's default port — a sibling worktree may own it. Start your own on another port.");

// ---- the control: the old-tile export, taken from the clean tree
const oldManifestPath = join(OLD_TILE, 'scenes', 'manifest.json');
if (!existsSync(oldManifestPath)) fail(`no control export at ${oldManifestPath} — run export-spacing-scenes.mjs from the UNTOUCHED tree into old-tile/ first`);
const oldManifest = JSON.parse(readFileSync(oldManifestPath, 'utf8'));
const controlSourceArm = oldManifest.arms.find((a) => a.spacing?.ratio === oldManifest.shippedRatio);
if (!controlSourceArm) fail(`the old-tile export carries no arm at its shipped ratio ${oldManifest.shippedRatio}`);
const controlScene = JSON.parse(readFileSync(join(OLD_TILE, 'scenes', controlSourceArm.file), 'utf8'));
// The clean-tree export predates the bridge's `tile` field, so the control's tile is the one TYPED AS
// HISTORY in the engine (`PRE_ADR0528_TILE`) — what the code at the recorded head drew, checkable by
// `git show <head>:packages/forest-world/src/hex.ts`. A control that DOES carry a tile must agree.
const controlTile = controlScene.tile ?? { hexR: PRE_ADR0528_TILE.hexR, quota: PRE_ADR0528_TILE.quota };
if (typeof controlTile.hexR !== 'number' || controlTile.hexR !== PRE_ADR0528_TILE.hexR) {
  fail(`the control at ${controlSourceArm.file} stands on hex radius ${controlTile.hexR}, not the pre-ADR-0528 tile's ${PRE_ADR0528_TILE.hexR}`);
}

/** The arms exported here: the derived tile at every rung of the spacing ladder. */
const ARMS = ISLAND_SPACING_RUNGS.map((ratio) => ({ id: `tile-${spacingArmId(ratio)}`, query: `spacing=${ratio}`, spacing: { ratio } }));
/** The three 2D views captured per arm. */
const VIEWS = [
  { id: 'fit', query: 'restingView=fit', hash: '#/tree' },
  { id: 'resting', query: '', hash: '#/tree' },
  { id: 'island', query: '', hash: `#/tree/${encodeURIComponent(READ_ISLAND)}` },
];

mkdirSync(SCENES_OUT, { recursive: true });

// ---- the server is this worktree's
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

/** Load one arm+view, wait for the corpus to settle, read the bridge and the delivered camera. */
async function capture(arm, view) {
  const url = `${URL_}/?${arm.query}${view.query ? `&${view.query}` : ''}&sceneExport=1${view.hash}`;
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
  if (last < MIN_ISLANDS) fail(`${arm.id}/${view.id}: only ${last} islands settled (floor ${MIN_ISLANDS}) — the map never finished loading`);
  await page.waitForFunction(() => window.__storytreeSceneExport !== undefined, null, { timeout: 60_000 });
  await page.waitForTimeout(1000);
  const read = await page.evaluate((readIsland) => {
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
    // the nameplate text's delivered size at this view, on the read island — the legibility number
    const plate = [...document.querySelectorAll('[data-story-id] .world-plate-id, .world-plate-id')].find((e) => e.textContent === readIsland);
    const plateRect = plate ? plate.getBoundingClientRect() : null;
    return {
      bridge: JSON.stringify(b),
      camera: { transform: t, scale: m ? +m[3] : null },
      islands2d: [...byId.values()],
      plateTextPx: plateRect ? { w: plateRect.width, h: plateRect.height } : null,
    };
  }, READ_ISLAND);
  const png = join(EVIDENCE_OUT, `2d-${arm.id}-${view.id}.png`);
  await page.screenshot({ path: png });
  return { ...read, png };
}

const twoD = [];
const armRecords = [];
let derivedTile = null;

for (const arm of ARMS) {
  let bridgeJson = null;
  for (const view of VIEWS) {
    const r = await capture(arm, view);
    if (pageErrors.length) fail(`the page reported errors on ${arm.id}/${view.id}:\n  ${pageErrors.join('\n  ')}`);
    const bridge = JSON.parse(r.bridge);
    if (!bridge.tile || typeof bridge.tile.hexR !== 'number') fail(`${arm.id}: the bridge carries no tile record — is this studio running the ADR-0528 engine?`);
    if (!(bridge.tile.hexR < controlTile.hexR)) {
      fail(`${arm.id}: the studio's tile (hex radius ${bridge.tile.hexR}) is not smaller than the control's (${controlTile.hexR}) — the old tile wearing the new arm ids`);
    }
    if (derivedTile === null) derivedTile = bridge.tile;
    else if (JSON.stringify(derivedTile) !== JSON.stringify(bridge.tile)) fail(`${arm.id}/${view.id}: the tile changed between captures`);
    if (view.id === 'fit') {
      bridgeJson = bridge;
      const slim = { ...bridge, scene: pruneSceneForMapper(bridge.scene) };
      writeFileSync(join(SCENES_OUT, `${arm.id}.json`), JSON.stringify(slim));
      bridgeJson.slimBytes = JSON.stringify(slim).length;
    } else if (bridgeJson) {
      const a = JSON.stringify(bridgeJson.world.islands);
      const b = JSON.stringify(bridge.world.islands);
      if (a !== b) fail(`${arm.id}: the ${view.id} view laid the forest out differently from the fitted one — the view moved the layout`);
    }
    const xs = r.islands2d.map((i) => i.x);
    const ys = r.islands2d.map((i) => i.y);
    const x2 = r.islands2d.map((i) => i.x + i.w);
    const y2 = r.islands2d.map((i) => i.y + i.h);
    const read = r.islands2d.find((i) => i.id === READ_ISLAND) ?? null;
    twoD.push({
      arm: arm.id,
      view: view.id,
      islands: r.islands2d.length,
      scale: r.camera.scale,
      contentExtentPx: r.islands2d.length ? { w: Math.max(...x2) - Math.min(...xs), h: Math.max(...y2) - Math.min(...ys) } : null,
      medianIslandWidthPx: r.islands2d.length ? [...r.islands2d.map((i) => i.w)].sort((p, q) => p - q)[Math.floor(r.islands2d.length / 2)] : null,
      readIslandPx: read ? { w: read.w, h: read.h } : null,
      plateTextPx: r.plateTextPx,
      png: r.png,
    });
    console.log(`${arm.id.padEnd(18)} ${view.id.padEnd(8)} islands ${r.islands2d.length}  scale ${r.camera.scale}  → ${r.png}`);
  }
  armRecords.push({
    id: arm.id,
    spacing: arm.spacing,
    tile: derivedTile,
    source: { head: health.code.head, branch: health.code.branch, generatedAt: new Date().toISOString() },
    file: `${arm.id}.json`,
    islands: bridgeJson.world.islands.length,
    world: { width: bridgeJson.world.width, height: bridgeJson.world.height },
    trails: bridgeJson.trails,
    bytes: bridgeJson.slimBytes,
  });
}
await browser.close();

// ---- the control rides in from the clean-tree export, with its head recorded
copyFileSync(join(OLD_TILE, 'scenes', controlSourceArm.file), join(SCENES_OUT, `${CONTROL_ARM}.json`));
for (const view of ['fit', 'resting']) {
  const src = join(OLD_TILE, `2d-${controlSourceArm.id}-${view}.png`);
  if (existsSync(src)) copyFileSync(src, join(EVIDENCE_OUT, `2d-${CONTROL_ARM}-${view}.png`));
}
const oldMetricsPath = join(OLD_TILE, '2d-metrics.json');
if (existsSync(oldMetricsPath)) {
  const rows = JSON.parse(readFileSync(oldMetricsPath, 'utf8')).rows.filter((row) => row.arm === controlSourceArm.id);
  for (const row of rows) twoD.unshift({ ...row, arm: CONTROL_ARM, png: join(EVIDENCE_OUT, `2d-${CONTROL_ARM}-${row.view}.png`) });
}
const controlRecord = {
  id: CONTROL_ARM,
  spacing: { ratio: oldManifest.shippedRatio },
  tile: controlTile,
  source: { head: oldManifest.studio.head, branch: oldManifest.studio.branch, generatedAt: oldManifest.generatedAt },
  file: `${CONTROL_ARM}.json`,
  islands: controlSourceArm.islands,
  world: controlSourceArm.world,
  trails: controlSourceArm.trails,
  bytes: controlSourceArm.bytes,
};

const manifest = {
  generatedAt: new Date().toISOString(),
  studio: { url: URL_, head: health.code.head, branch: health.code.branch },
  shippedRatio: ISLAND_SPACING_RATIO,
  rungs: [...ISLAND_SPACING_RUNGS],
  control: CONTROL_ARM,
  tile: derivedTile,
  controlTile,
  arms: [controlRecord, ...armRecords],
};
writeFileSync(join(SCENES_OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(EVIDENCE_OUT, '2d-metrics.json'), `${JSON.stringify({ generatedAt: manifest.generatedAt, readIsland: READ_ISLAND, rows: twoD }, null, 2)}\n`);

// ---- the trails survived (ADR-0520's consequence list, item 1) — verified, not assumed
for (const a of manifest.arms) {
  if (a.trails.edges !== controlRecord.trails.edges) fail(`${a.id}: ${a.trails.edges} edges routed against the control's ${controlRecord.trails.edges} — an edge was lost in the re-layout`);
  if (a.trails.dropped.length !== controlRecord.trails.dropped.length) {
    fail(`${a.id}: ${a.trails.dropped.length} dropped edges against the control's ${controlRecord.trails.dropped.length}: ${JSON.stringify(a.trails.dropped)}`);
  }
  if (a.islands !== controlRecord.islands) fail(`${a.id}: ${a.islands} islands against the control's ${controlRecord.islands}`);
}
console.log(
  `\nexported ${armRecords.length} derived-tile arms (${armRecords.map((a) => `${a.id} ${(a.bytes / 1024).toFixed(0)} KB`).join(', ')}) + the control from ${OLD_TILE} (head ${oldManifest.studio.head.slice(0, 8)})\n` +
    `tile: derived hex radius ${derivedTile.hexR} (${derivedTile.quota}) against the control's ${controlTile.hexR} (${controlTile.quota})\n` +
    `trails: every arm routes ${controlRecord.trails.edges} edges with ${controlRecord.trails.dropped.length} dropped — the network survived every re-layout\n` +
    `→ ${SCENES_OUT}\n→ ${EVIDENCE_OUT}`,
);
