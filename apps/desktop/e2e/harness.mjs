// Shared Electron E2E harness for the storytree desktop forest-map specs.
//
// WHY THIS EXISTS (the offline contract): the desktop's real backend sidecar (electron/backend-entry.ts)
// always opens a LIVE Cloud SQL connection — it has no json/offline mode — so a test that just launches
// the app renders nothing in CI (no DB, no creds) and renders LIVE, non-deterministic data on a dev box.
// The `STORYTREE_STUDIO_STORE=json` env the launch passes is read only by the studio's OWN dev/serve
// servers, NOT by the desktop sidecar, so it is inert here. To make these specs genuinely offline AND
// deterministic we STUB the renderer's `/api/*` calls with Playwright request routing: the forest paints
// from a fixed fixture, every advisory endpoint answers benignly, and no DB is ever touched. The thing
// under test — the REAL forest-map render + pointer handlers in the REAL Electron Chromium — is
// untouched; only the data source is faked (these specs guard frontend interaction, not the backend).
//
// WHY REAL-INPUT CLICKS + RELOAD-RESET: the node-click bug this suite guards reproduces ONLY in Electron
// (pointer capture retargets a captured click), so we drive `win.mouse` real input, never `.click()` on a
// locator (see memory: forest-map-click-verify-needs-movement). Selecting a node ZOOMS the camera and
// leaves it zoomed after the selection clears, so re-finding a target in that zoomed view is unreliable —
// every case therefore RESETS by reloading to the clean fit:'contain' mount (all islands visible) and
// waits for the camera to settle before reading any coordinate. That reload-reset is what makes the
// suite pass reliably on a slow/loaded machine, where the old fixed-timeout reset flaked.

import { _electron as electron } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** apps/desktop — the Electron app root Playwright launches (`args: ['.']`). */
export const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── the deterministic offline forest (a TreePayload, apps/studio/src/types.ts) ───────────────────────
//
// Hand-authored so the world renders identically every run (buildWorld hashes all jitter from ids).
// Shape mirrors GET /api/tree. A small dependency DAG: one foundation engine, two dependents, plus one
// `building: true` shared library (excluded from the map, rendered in the Shared Islands drawer). Three
// laid-out islands give selection / pan / zoom something to act on; the building feeds the islands panel.

const cap = (id, dependsOn = []) => ({
  id,
  title: id,
  outcome: `${id} works`,
  status: 'healthy',
  proofMode: 'machine-checked',
  dependsOn,
});

/** @type {{stories: unknown[], sessions: unknown[], builds: unknown[]}} */
export const TREE_FIXTURE = {
  stories: [
    {
      id: 'alpha-engine',
      title: 'Alpha Engine',
      outcome: 'the load-bearing core',
      status: 'healthy',
      proofMode: 'machine-checked',
      uatWitness: 'machine',
      dependsOn: ['shared-lib'],
      consumedBy: [],
      capabilities: [cap('alpha-parse'), cap('alpha-eval', ['alpha-parse'])],
    },
    {
      id: 'beta-surface',
      title: 'Beta Surface',
      outcome: 'the visible surface',
      status: 'mapped',
      proofMode: 'human-witnessed',
      uatWitness: 'human',
      dependsOn: ['alpha-engine', 'shared-lib'],
      consumedBy: [],
      capabilities: [cap('beta-view')],
    },
    {
      id: 'gamma-flow',
      title: 'Gamma Flow',
      outcome: 'a dependent flow',
      status: 'proposed',
      proofMode: 'machine-checked',
      uatWitness: 'machine',
      dependsOn: ['alpha-engine'],
      consumedBy: [],
      capabilities: [cap('gamma-step')],
    },
    {
      // A `render: building` story: excluded from the map, shown in the Shared Islands drawer; its
      // consumers (alpha-engine, beta-surface) carry its bookshelf stamp (ADR-0102).
      id: 'shared-lib',
      title: 'Shared Lib',
      outcome: 'the shared building',
      status: 'healthy',
      proofMode: 'machine-checked',
      uatWitness: 'machine',
      dependsOn: [],
      consumedBy: ['alpha-engine', 'beta-surface'],
      building: true,
      capabilities: [cap('lib-core')],
    },
  ],
  sessions: [],
  builds: [],
};

/** A signed-in member so the SPA renders the app (not the request-access wall); store reads healthy so
 *  there is no StoreBanner shifting the layout (deriveLoadState → 'app'). */
const ME_FIXTURE = { email: 'e2e@local', role: 'member', status: 'active', member: true };
const HEALTH_FIXTURE = { store: 'pg', db: 'ok' };

/** Fulfil one route with a JSON body. */
const json = (route, body) => route.fulfill({ json: body });

/**
 * Register the offline `/api/*` stubs on a window. Every endpoint the studio boot touches answers from a
 * fixture so the app reaches `loadState: 'app'` and the forest paints deterministically with no DB.
 * Advisory layers (presence/activity) answer the documented "store didn't answer" null shape.
 */
export async function stubApi(win) {
  await win.route('**/api/tree', (r) => json(r, TREE_FIXTURE));
  await win.route('**/api/me', (r) => json(r, ME_FIXTURE));
  await win.route('**/api/health', (r) => json(r, HEALTH_FIXTURE));
  await win.route('**/api/docs', (r) => json(r, [])); // listDocs (and /api/docs/content is unused here)
  await win.route('**/api/assets', (r) => json(r, []));
  await win.route('**/api/comments**', (r) => json(r, []));
  await win.route('**/api/presence', (r) => json(r, { sessions: null }));
  await win.route('**/api/activity', (r) => json(r, { builds: null }));
}

/**
 * Launch the desktop app fully offline. Stubs are registered on the first window and the page is then
 * RELOADED so they are in force from a clean mount (firstWindow resolves after loadURL has already
 * started, so the very first fetches could otherwise race the stubs). Returns the app + window with the
 * forest painted and the camera settled at the fit. Always `app.close()` in a finally.
 */
export async function launchOffline() {
  const app = await electron.launch({
    args: ['.'],
    cwd: appDir,
    // Inert for the desktop sidecar (see file header) but kept so intent reads as offline; the real
    // offline guarantee is the stubs below, not this env.
    env: { ...process.env, STORYTREE_STUDIO_STORE: 'json' },
  });
  const win = await app.firstWindow();
  await stubApi(win);
  await win.evaluate(() => {
    location.hash = '#/tree';
  });
  await win.reload();
  await waitForForestSettled(win);
  return { app, win };
}

/** True iff the right-side story detail panel is open. */
export const panelOpen = (win) => win.evaluate(() => !!document.querySelector('.tree-detail'));

/** The sorted unique `data-story-id`s present in the rendered world — the proof that the forest paints
 *  from the offline fixture (not a live DB leaking in): the caller asserts this is the fixture's set. */
export const renderedStoryIds = (win) =>
  win.evaluate(() =>
    [...new Set([...document.querySelectorAll('[data-story-id]')].map((e) => e.getAttribute('data-story-id')))]
      .filter(Boolean)
      .sort(),
  );

/** The story ids the fixture LAYS OUT on the map (building-class `shared-lib` is excluded from the map
 *  and rendered in the Shared Islands drawer instead — ADR-0088). */
export const FIXTURE_MAP_STORY_IDS = ['alpha-engine', 'beta-surface', 'gamma-flow'];

/**
 * Wait for the forest to be rendered AND the camera to stop moving. SVG `<g>` isn't "visible" to
 * Playwright's heuristic, so we wait for ATTACHED, then poll the world transform until it is byte-stable
 * across two reads — the robust replacement for a fixed settle timeout (the post-mount flex re-fit and the
 * select zoom both animate, and a fixed wait flakes on a slow box).
 */
export async function waitForForestSettled(win, { timeout = 25_000 } = {}) {
  await win.waitForSelector('g.story-tree', { state: 'attached', timeout });
  const readTransform = () =>
    win.evaluate(() => {
      const g = document.querySelector('g.world-camera');
      return g ? g.getAttribute('transform') : null;
    });
  let prev = await readTransform();
  const deadline = Date.now() + 5_000;
  for (;;) {
    await win.waitForTimeout(100);
    const next = await readTransform();
    if (next === prev) return;
    prev = next;
    if (Date.now() > deadline) return; // settled enough; don't hang the spec on a perpetual animation
  }
}

/**
 * Reset to the clean forest view between interactions: reload (so any selection AND the zoomed camera are
 * discarded) and wait for the fresh fit to settle. This is what keeps re-clicks reliable — clearing a
 * selection alone leaves the camera zoomed, where re-finding a target is unreliable.
 */
export async function resetToForest(win) {
  await win.evaluate(() => {
    location.hash = '#/tree';
  });
  await win.reload();
  await waitForForestSettled(win);
}

/**
 * Find a clickable story node in the CURRENT view and return its on-screen centre (+ the story id the
 * point resolves to). Re-find before EACH click: a selection zooms the camera, so coordinates from a
 * prior step go stale. Returns null when no node's centre resolves to a clickable story element.
 */
export const findStoryTarget = (win) =>
  win.evaluate(() => {
    const HIT = 'g.hex-flora,g.story-tree,.relaxed-tile,.coast-fill-group,.world-story-hit,[data-story-id]';
    const trees = [...document.querySelectorAll('g.story-tree')]
      .map((t) => t.getBoundingClientRect())
      .filter((r) => r.width > 6 && r.left > 40 && r.top > 110 && r.bottom < window.innerHeight - 60);
    for (const r of trees) {
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const el = document.elementFromPoint(cx, cy);
      const hit = el && el.closest(HIT);
      if (hit) {
        const idEl = el.closest('[data-story-id]');
        return { cx, cy, id: idEl ? idEl.getAttribute('data-story-id') : null };
      }
    }
    return null;
  });

/** Find clear sea: a point that resolves to empty map (not on any story / panel) — for the clear-on-empty
 *  and pan gestures. Returns null if the view is fully covered (then the caller skips that assertion). */
export const findEmptyPoint = (win) =>
  win.evaluate(() => {
    const ON = 'g.hex-flora,g.story-tree,.relaxed-tile,.coast-fill-group,.world-story-hit,[data-story-id],.shared-islands-panel,.tree-detail,.panel-drawer';
    for (let y = 130; y < window.innerHeight - 120; y += 17) {
      for (let x = 320; x < window.innerWidth - 20; x += 17) {
        const el = document.elementFromPoint(x, y);
        if (!el) continue;
        if (!el.closest(ON) && (el.tagName === 'svg' || (el.getAttribute('class') || '').includes('hex-empty')))
          return { x, y };
      }
    }
    return null;
  });
