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
  // In CI the app runs as root in a container under xvfb, where Chromium needs these to start: no SUID
  // sandbox as root, a real /tmp instead of a tiny container /dev/shm, and software GL (no GPU). They
  // are CI-only (gated on $CI) so local runs stay realistic, and none touch the pointer/selection paths
  // these specs guard. The ELECTRON_DISABLE_SANDBOX env the workflow sets is belt-and-braces alongside.
  const ciArgs = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] : [];
  const app = await electron.launch({
    args: ['.', ...ciArgs],
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

// ── camera (pan/zoom) helpers ────────────────────────────────────────────────────────────────────────
//
// The pan/zoom camera is the SVG `<g class="world-camera" transform="translate(tx ty) scale(scale)">`
// (apps/studio/src/components/TreeView.tsx, the worldCamera lib). A PAN changes only the translation
// (panBy keeps scale); a ZOOM changes the scale (zoomAt, which also re-centres on the cursor, so it
// moves the translation too). Reading the transform is therefore how a spec tells a pan from a zoom:
// translate-changed-but-scale-equal is a pan; scale-changed is a zoom.

/**
 * Read the world camera's transform: the parsed `{ tx, ty, scale }` plus the `raw` attribute string.
 * Returns null before the first frame is framed (the `<g>` has no transform until then). Parses the
 * three numbers out of `translate(tx ty) scale(scale)` positionally (translate's two, then scale's one).
 */
export const readCameraTransform = (win) =>
  win.evaluate(() => {
    const g = document.querySelector('g.world-camera');
    const raw = g ? g.getAttribute('transform') : null;
    if (!raw) return null;
    const nums = (raw.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    if (nums.length < 3) return null;
    return { tx: nums[0], ty: nums[1], scale: nums[2], raw };
  });

/**
 * Poll the camera transform until its `raw` string differs from `prevRaw`, then return the new parsed
 * transform. The pan/zoom handlers set `animate:false`, so the change lands within a frame or two — but
 * a React re-render is async, so a spec reads the post-gesture transform through this rather than racing
 * it. On timeout it returns the latest transform anyway, so the caller's assertion fails with the real
 * (unchanged) values rather than on a thrown timeout.
 */
export async function waitForCameraChange(win, prevRaw, { timeout = 4000 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const cur = await readCameraTransform(win);
    if (cur && cur.raw !== prevRaw) return cur;
    if (Date.now() > deadline) return cur;
    await win.waitForTimeout(60);
  }
}

// ── left-panel drawer helpers ────────────────────────────────────────────────────────────────────────
//
// The Shared-Islands panel carries two independent `<details>` drawers — `.panel-drawer.panel-legend`
// (uncontrolled) and `.panel-drawer.panel-islands` (controlled by React state) — each a clickable
// `summary.panel-drawer-head` bar, both collapsed by default. They are plain HTML, NOT subject to the
// SVG pointer-capture trap the map clicks guard against, so a Playwright locator click (real input,
// with actionability + scroll-into-view) is the right tool here — coordinate clicks are only needed
// for the SVG viewport.

/** Click a drawer's summary bar to toggle it. `drawerSelector` targets the `<details>`, e.g.
 *  '.panel-drawer.panel-legend'. */
export const toggleDrawer = (win, drawerSelector) =>
  win.locator(`${drawerSelector} > summary.panel-drawer-head`).click();

/** Whether a `<details>` drawer is currently open (its DOM `.open`). */
export const drawerOpen = (win, drawerSelector) =>
  win.evaluate((sel) => {
    const d = document.querySelector(sel);
    return !!(d && d.open);
  }, drawerSelector);

/** Wait until a drawer reaches the wanted open state (throws on timeout — the controlled islands drawer
 *  confirms its toggle through a React re-render, so a spec waits for the state rather than racing it). */
export const waitDrawer = (win, drawerSelector, want, { timeout = 4000 } = {}) =>
  win.waitForFunction(
    ([sel, w]) => {
      const d = document.querySelector(sel);
      return !!(d && d.open) === w;
    },
    [drawerSelector, want],
    { timeout },
  );
