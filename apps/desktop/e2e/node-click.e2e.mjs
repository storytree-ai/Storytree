// Electron E2E: the forest-map node-click MUST open the right-side detail panel — clean clicks AND
// clicks with a few px of mouse jitter — and an empty-map tap must clear it. This guards a regression
// that ONLY reproduced in the desktop's Electron Chromium (not plain Chrome): the pan feature's
// `setPointerCapture` on pointerdown made the captured click retarget to the viewport, so node clicks
// ran clearSelection instead of selecting. The studio now (a) captures lazily — only once a real drag
// starts — and (b) selects by COORDINATE hit-test on the viewport, which is immune to capture-retarget
// and to a moved click landing on a non-leaf SVG common ancestor.
//
// Run: pnpm --filter desktop test:e2e  (pretest:e2e builds the studio dist + the electron main first).
// Genuinely OFFLINE + deterministic: the shared harness stubs every `/api/*` call with a fixed fixture
// (the desktop sidecar has no json mode — it always opens a live DB — so without the stubs this renders
// live data on a dev box and nothing in CI). See harness.mjs for the offline contract and the
// reload-reset that keeps re-clicks reliable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  launchOffline,
  resetToForest,
  findStoryTarget,
  findEmptyPoint,
  panelOpen,
  renderedStoryIds,
  FIXTURE_MAP_STORY_IDS,
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
    const t1 = await findStoryTarget(win);
    assert.ok(t1, 'should find a clickable story node');
    await win.mouse.click(t1.cx, t1.cy);
    await win.waitForSelector('.tree-detail', { state: 'attached', timeout: 4000 });
    assert.ok(await panelOpen(win), 'a clean click on a node opens the detail panel');

    // 2) a JITTERED click (~7px between press and release) still selects — not eaten as a micro-drag
    await resetToForest(win);
    const t2 = await findStoryTarget(win);
    assert.ok(t2, 'should find a clickable story node (jitter case)');
    await win.mouse.move(t2.cx, t2.cy);
    await win.mouse.down();
    await win.mouse.move(t2.cx + 6, t2.cy + 4); // < DRAG_SLOP (10px), so still a click, not a pan
    await win.mouse.up();
    await win.waitForSelector('.tree-detail', { state: 'attached', timeout: 4000 });
    assert.ok(await panelOpen(win), 'a jittered click on a node opens the detail panel');

    // 3) clicking far-off empty map clears the selection
    await resetToForest(win);
    const t3 = await findStoryTarget(win);
    assert.ok(t3, 'should find a clickable story node (clear case)');
    await win.mouse.click(t3.cx, t3.cy);
    await win.waitForSelector('.tree-detail', { state: 'attached', timeout: 4000 });
    const empty = await findEmptyPoint(win);
    if (empty) {
      await win.mouse.click(empty.x, empty.y);
      await win.waitForSelector('.tree-detail', { state: 'detached', timeout: 4000 });
      assert.equal(await panelOpen(win), false, 'clicking empty map clears the selection');
    }
  } finally {
    await app.close();
  }
});
