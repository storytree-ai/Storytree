// Electron E2E: the forest-map POINTER-CAPTURE regression wall — both halves of the one bug class
// that ONLY reproduces in the desktop's Electron Chromium (not plain Chrome): the pan feature's
// `setPointerCapture` on pointerdown made the captured click retarget to the viewport, so node clicks
// ran clearSelection instead of selecting. The studio now (a) captures lazily — only once a real drag
// starts — and (b) selects by COORDINATE hit-test on the viewport, which is immune to capture-retarget
// and to a moved click landing on a non-leaf SVG common ancestor. The wall's two halves:
//   • a CLICK (clean or jittered under the slop) SELECTS — and an empty-map tap clears;
//   • a DRAG past the slop PANS and does NOT select (the gesture that motivated the capture).
//
// Run: pnpm --filter desktop test:e2e  (pretest:e2e builds the studio dist + the electron main first).
// Genuinely OFFLINE + deterministic: the shared harness stubs every `/api/*` call with a fixed fixture
// and launches the app in e2e mode (no backend sidecar — see harness.mjs for the offline contract and
// the reload-reset that keeps re-clicks reliable).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchOffline,
  resetToForest,
  findStoryTarget,
  findEmptyPoint,
  panelOpen,
  waitForPanel,
  renderedStoryIds,
  FIXTURE_MAP_STORY_IDS,
  readCameraTransform,
  waitForCameraChange,
} from './harness.mjs';

test('forest map: a story-node click opens the detail panel (clean + jittered); empty map clears', async () => {
  const { app, win } = await launchOffline();
  try {
    // GUARD that this is genuinely OFFLINE: the forest must be the fixture, not live DB data leaking in
    // (the desktop sidecar opens a live DB on a dev box). If the stubs ever break, this fails loudly here
    // rather than the suite silently testing non-deterministic live data.
    assert.deepEqual(
      await renderedStoryIds(win),
      FIXTURE_MAP_STORY_IDS,
      'the forest must render the offline fixture stories (no live DB)',
    );

    // 1) a CLEAN click selects the story (this is what regressed in Electron)
    // Panel waits go through waitForPanel (evaluate polling), never a Playwright DOM-wait task —
    // a wait task armed right after the click's hash navigation can wedge permanently in this
    // Electron (see waitForPanel in harness.mjs for the full trap).
    const t1 = await findStoryTarget(win);
    assert.ok(t1, 'should find a clickable story node');
    await win.mouse.click(t1.cx, t1.cy);
    await waitForPanel(win, { present: true });
    assert.ok(await panelOpen(win), 'a clean click on a node opens the detail panel');

    // 2) a JITTERED click (~7px between press and release) still selects — not eaten as a micro-drag
    await resetToForest(win);
    const t2 = await findStoryTarget(win);
    assert.ok(t2, 'should find a clickable story node (jitter case)');
    await win.mouse.move(t2.cx, t2.cy);
    await win.mouse.down();
    await win.mouse.move(t2.cx + 6, t2.cy + 4); // < DRAG_SLOP (10px), so still a click, not a pan
    await win.mouse.up();
    await waitForPanel(win, { present: true });
    assert.ok(await panelOpen(win), 'a jittered click on a node opens the detail panel');

    // 3) clicking far-off empty map clears the selection
    await resetToForest(win);
    const t3 = await findStoryTarget(win);
    assert.ok(t3, 'should find a clickable story node (clear case)');
    await win.mouse.click(t3.cx, t3.cy);
    await waitForPanel(win, { present: true });
    const empty = await findEmptyPoint(win);
    if (empty) {
      await win.mouse.click(empty.x, empty.y);
      await waitForPanel(win, { present: false });
      assert.equal(await panelOpen(win), false, 'clicking empty map clears the selection');
    }

    // 4) the OTHER half of the capture wall: a drag past DRAG_SLOP (10px) pans the camera —
    //    translation moves, scale holds — and does NOT select a node.
    await resetToForest(win);
    const before = await readCameraTransform(win);
    assert.ok(before, 'the camera transform is present before the pan');
    const sea = await findEmptyPoint(win);
    assert.ok(sea, 'should find an empty sea point to start the drag from');
    // Real-input drag well past the slop: down, move, move, up. Two moves so the gesture both
    // crosses the slop (turning the press into a pan) and keeps tracking — mirrors a real drag.
    await win.mouse.move(sea.x, sea.y);
    await win.mouse.down();
    await win.mouse.move(sea.x + 60, sea.y + 40);
    await win.mouse.move(sea.x + 120, sea.y + 80);
    await win.mouse.up();
    const after = await waitForCameraChange(win, before.raw);
    assert.ok(after, 'the camera transform is present after the pan');
    assert.ok(
      after.tx !== before.tx || after.ty !== before.ty,
      `a pan must change the camera translation (before=${before.raw} after=${after.raw})`,
    );
    assert.equal(after.scale, before.scale, 'a pan must not change the zoom scale');
    assert.equal(await panelOpen(win), false, 'a pan past the slop must not select a node');
  } finally {
    await app.close();
  }
});
