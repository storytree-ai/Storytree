// Electron E2E: the forest-map node-click MUST open the right-side detail panel — clean clicks AND
// clicks with a few px of mouse jitter — and an empty-map tap must clear it. This guards a regression
// that ONLY reproduced in the desktop's Electron Chromium (not plain Chrome): the pan feature's
// `setPointerCapture` on pointerdown made the captured click retarget to the viewport, so node clicks
// ran clearSelection instead of selecting. The studio now (a) captures lazily — only once a real drag
// starts — and (b) selects by COORDINATE hit-test on the viewport, which is immune to capture-retarget
// and to a moved click landing on a non-leaf SVG common ancestor.
//
// Run: pnpm --filter desktop test:e2e  (pretest:e2e builds the studio dist + the electron main first).
// Offline + deterministic via STORYTREE_STUDIO_STORE=json — no DB. This is the seed of the Electron
// TDD flow; broadening it (drawers, pan/zoom, CI/headless) is tracked separately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..'); // apps/desktop

test('forest map: a story-node click opens the detail panel (clean + jittered); empty map clears', async () => {
  const app = await electron.launch({
    args: ['.'],
    cwd: appDir,
    env: { ...process.env, STORYTREE_STUDIO_STORE: 'json' },
  });
  try {
    const win = await app.firstWindow();
    const panelOpen = () => win.evaluate(() => !!document.querySelector('.tree-detail'));
    const reset = async () => {
      await win.evaluate(() => {
        location.hash = '#/tree';
      });
      // wait for the prior selection to actually clear so re-clicking a node selects (not toggles off)
      await win.waitForSelector('.tree-detail', { state: 'detached', timeout: 4000 }).catch(() => {});
      await win.waitForTimeout(120);
    };

    await win.evaluate(() => {
      location.hash = '#/tree';
    });
    // SVG <g> isn't "visible" to Playwright's heuristic — wait for ATTACHED, then let the camera settle.
    await win.waitForSelector('g.story-tree', { state: 'attached', timeout: 25000 });
    await win.waitForTimeout(600);

    // Re-find a clickable node EACH time: selecting one zooms the camera, so coordinates from a prior
    // step go stale. Returns a node whose centre resolves to a clickable story element (incl. the hit rect).
    const findTarget = () =>
      win.evaluate(() => {
        const trees = [...document.querySelectorAll('g.story-tree')]
          .map((t) => t.getBoundingClientRect())
          .filter((r) => r.width > 6 && r.left > 40 && r.top > 110 && r.bottom < window.innerHeight - 60);
        for (const r of trees) {
          const cx = Math.round(r.left + r.width / 2);
          const cy = Math.round(r.top + r.height / 2);
          const el = document.elementFromPoint(cx, cy);
          if (el && el.closest('g.hex-flora,g.story-tree,.relaxed-tile,.coast-fill-group,.world-story-hit'))
            return { cx, cy };
        }
        return null;
      });

    // 1) a CLEAN click selects the story (this is what regressed in Electron)
    await reset();
    const t1 = await findTarget();
    assert.ok(t1, 'should find a clickable story node');
    await win.mouse.click(t1.cx, t1.cy);
    await win.waitForTimeout(300);
    assert.ok(await panelOpen(), 'a clean click on a node opens the detail panel');

    // 2) a JITTERED click (~7px between press and release) still selects — not eaten as a micro-drag
    await reset();
    const t2 = await findTarget();
    assert.ok(t2, 'should find a clickable story node (jitter case)');
    await win.mouse.move(t2.cx, t2.cy);
    await win.mouse.down();
    await win.mouse.move(t2.cx + 6, t2.cy + 4);
    await win.mouse.up();
    await win.waitForTimeout(300);
    assert.ok(await panelOpen(), 'a jittered click on a node opens the detail panel');

    // 3) clicking far-off empty map clears the selection
    const empty = await win.evaluate(() => {
      for (let y = 130; y < window.innerHeight - 120; y += 17) {
        for (let x = 320; x < window.innerWidth - 20; x += 17) {
          const el = document.elementFromPoint(x, y);
          if (!el) continue;
          const onStory = el.closest(
            'g.hex-flora,g.story-tree,.relaxed-tile,.coast-fill-group,.world-story-hit,.shared-islands-panel,.tree-detail',
          );
          if (!onStory && (el.tagName === 'svg' || (el.getAttribute('class') || '').includes('hex-empty')))
            return { x, y };
        }
      }
      return null;
    });
    if (empty) {
      await win.mouse.click(empty.x, empty.y);
      await win.waitForTimeout(250);
      assert.equal(await panelOpen(), false, 'clicking empty map clears the selection');
    }
  } finally {
    await app.close();
  }
});
