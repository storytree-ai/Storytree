// Electron E2E: the forest-map's NON-CLICK interactions — the two left drawers, panning, and zooming.
// These broaden the coverage the node-click spec started (apps/desktop/e2e/node-click.e2e.mjs); like it,
// they run in REAL Electron Chromium against the shared OFFLINE harness (every /api/* stubbed with a
// fixed fixture — the desktop sidecar has no json mode, so without the stubs this renders live data on a
// dev box and nothing in CI). See harness.mjs for the offline contract + the reload-reset.
//
// WHY THESE NEED REAL ELECTRON (not jsdom): pan and zoom are pointer/wheel gestures — the wheel is a
// NATIVE non-passive listener and the pan turns on real `pointermove` deltas past a slop — so they must
// be driven with real input (`win.mouse.*`) against a real layout engine; jsdom has neither. The
// drawers are plain HTML, but proving they render + toggle inside the REAL bundled studio in the
// Electron shell (not just in a unit harness) is the integration this suite is for. (The chat dock's
// toggle is plain React state with `aria-expanded`, already covered by ChatDock.test.tsx in jsdom and
// not Electron-specific — so it is intentionally left to that unit test, not duplicated here.)
//
// Run: pnpm --filter desktop test:e2e  (pretest:e2e builds the studio dist + the electron main first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchOffline,
  findEmptyPoint,
  panelOpen,
  renderedStoryIds,
  FIXTURE_MAP_STORY_IDS,
  readCameraTransform,
  waitForCameraChange,
  toggleDrawer,
  drawerOpen,
  waitDrawer,
} from './harness.mjs';

const LEGEND = '.panel-drawer.panel-legend';
const ISLANDS = '.panel-drawer.panel-islands';

test('forest map: the legend and islands drawers are collapsed by default and toggle independently', async () => {
  const { app, win } = await launchOffline();
  try {
    await win.waitForSelector(`${LEGEND} > summary.panel-drawer-head`, { state: 'visible', timeout: 8000 });
    await win.waitForSelector(`${ISLANDS} > summary.panel-drawer-head`, { state: 'visible', timeout: 8000 });

    // Both <details> start COLLAPSED (the owner default — neither drawer is open on load).
    assert.equal(await drawerOpen(win, LEGEND), false, 'the legend drawer starts collapsed');
    assert.equal(await drawerOpen(win, ISLANDS), false, 'the islands drawer starts collapsed');

    // Open ONLY the legend — the islands drawer must stay closed (the two <details> are independent).
    await toggleDrawer(win, LEGEND);
    await waitDrawer(win, LEGEND, true);
    assert.equal(await drawerOpen(win, ISLANDS), false, 'opening the legend must not open the islands drawer');

    // Click it again — it closes (back to all-collapsed).
    await toggleDrawer(win, LEGEND);
    await waitDrawer(win, LEGEND, false);

    // Now open ONLY the islands — the legend must stay closed (independent the other way too).
    await toggleDrawer(win, ISLANDS);
    await waitDrawer(win, ISLANDS, true);
    assert.equal(await drawerOpen(win, LEGEND), false, 'opening the islands drawer must not open the legend');

    // The fixture's `building: true` story (shared-lib) populates the islands drawer.
    const islandSlots = await win.evaluate(
      (sel) => document.querySelectorAll(`${sel} .shared-island-slot`).length,
      ISLANDS,
    );
    assert.ok(islandSlots >= 1, 'the islands drawer lists the fixture building (shared-lib)');

    // Click again — it closes.
    await toggleDrawer(win, ISLANDS);
    await waitDrawer(win, ISLANDS, false);
  } finally {
    await app.close();
  }
});

test('forest map: a drag past the slop pans the camera and does not select a node', async () => {
  const { app, win } = await launchOffline();
  try {
    // Guard offline-ness (same as node-click): the forest must be the fixture, not live DB data.
    assert.deepEqual(
      await renderedStoryIds(win),
      FIXTURE_MAP_STORY_IDS,
      'the forest must render the offline fixture stories (no live DB)',
    );

    const before = await readCameraTransform(win);
    assert.ok(before, 'the camera transform is present before the pan');

    const sea = await findEmptyPoint(win);
    assert.ok(sea, 'should find an empty sea point to start the drag from');

    // Real-input drag well past DRAG_SLOP (10px): down, move, move, up. Two moves so the gesture both
    // crosses the slop (turning the press into a pan) and keeps tracking — mirrors a real drag.
    await win.mouse.move(sea.x, sea.y);
    await win.mouse.down();
    await win.mouse.move(sea.x + 60, sea.y + 40);
    await win.mouse.move(sea.x + 120, sea.y + 80);
    await win.mouse.up();

    const after = await waitForCameraChange(win, before.raw);
    assert.ok(after, 'the camera transform is present after the pan');
    // A pan moves the camera TRANSLATION…
    assert.ok(
      after.tx !== before.tx || after.ty !== before.ty,
      `a pan must change the camera translation (before=${before.raw} after=${after.raw})`,
    );
    // …but NOT the scale (changing scale would be a zoom, not a pan).
    assert.equal(after.scale, before.scale, 'a pan must not change the zoom scale');
    // And a drag past the slop is a pan, NOT a select — the detail panel must not open.
    assert.equal(await panelOpen(win), false, 'a pan past the slop must not select a node');
  } finally {
    await app.close();
  }
});

test('forest map: a wheel over the viewport zooms the camera scale', async () => {
  const { app, win } = await launchOffline();
  try {
    assert.deepEqual(
      await renderedStoryIds(win),
      FIXTURE_MAP_STORY_IDS,
      'the forest must render the offline fixture stories (no live DB)',
    );

    const before = await readCameraTransform(win);
    assert.ok(before, 'the camera transform is present before the wheel');

    const over = await findEmptyPoint(win);
    assert.ok(over, 'should find a point over the map to wheel on');

    // The studio binds a NATIVE non-passive wheel listener on the viewport (React's onWheel would be
    // passive), so drive a real wheel over it. deltaY < 0 zooms IN (1.1x per tick); a few ticks give a
    // clear, un-clamped change (the zoom ceiling is 5x the fit, so zooming in from the fit has headroom).
    await win.mouse.move(over.x, over.y);
    await win.mouse.wheel(0, -120);
    await win.mouse.wheel(0, -120);
    await win.mouse.wheel(0, -120);

    const after = await waitForCameraChange(win, before.raw);
    assert.ok(after, 'the camera transform is present after the wheel');
    assert.ok(
      after.scale > before.scale,
      `a zoom-in wheel must increase the camera scale (before=${before.scale} after=${after.scale})`,
    );
  } finally {
    await app.close();
  }
});
