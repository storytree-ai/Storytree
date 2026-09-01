// visible-delta-smoke.mjs — DOES THE WIRING ACTUALLY RUN IN A BROWSER? A bounded smoke over the
// two comparison pages that now call `visible-delta.ts`, proving the module reaches real captured
// pixels rather than only the test's synthetic ones.
//
// ⚠⚠ IT IS A WIRING CHECK AND EXPLICITLY NOT A MEASUREMENT, which is why it accepts a software
// rasteriser where `shipped-grass-measure.mjs` refuses one. Nothing here is quoted as a figure
// about the land: the assertions are that the runner exposes the rung, that the rung PASSES on
// pixels this run captured, and that the instrument SEPARATES two arms known to differ from an arm
// compared against itself. A GPU is needed to make the numbers mean something about the map; it is
// not needed to prove the call path exists, and pretending otherwise would put this check behind a
// box it does not need.
//
// ⚠ The port is deliberately its own and NOT vite's default: `strictport-vite-collision-measures-
// a-siblings-worktree` — two harnesses on one box would serve each other's pages and the answer
// would belong to whichever branch started first.

// ⚠ THE SERVER IS THE OPERATOR'S, NOT THIS SCRIPT'S — the same shape every other driver here
// uses. Start it yourself on a port no sibling holds and pass it in:
//
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5419 --strictPort
//   ST_SMOKE_URL=http://localhost:5419 pnpm --filter @storytree/forest-world-r3f exec \
//     node --import ../../scripts/tsx-cache-off.mjs --import tsx harness/visible-delta-smoke.mjs
//
// then kill that vite BY PID and check it actually died — its children outlive the parent shell on
// Windows, and a stray listener is how the next run measures a page nobody meant to serve.

import { chromium } from '@playwright/test';

const ORIGIN = process.env.ST_SMOKE_URL ?? 'http://localhost:5419';

const fail = (why) => {
  console.error(`REFUSED: ${why}`);
  process.exitCode = 1;
};

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => fail(`the page threw: ${e.message}`));

  // ---- the GRASS page -----------------------------------------------------------------------
  await page.goto(`${ORIGIN}/shipped-grass.html`, { waitUntil: 'domcontentloaded', timeout: 540000 });
  await page.waitForFunction(() => window.grassRunner !== undefined, null, { timeout: 540000 });
  const grass = await page.evaluate(async () => {
    const r = window.grassRunner;
    r.warm();
    const control = r.read('flat', 'one', 8);
    const treated = r.read('visible', 'one', 8);
    return {
      renderer: r.identity().renderer,
      software: r.identity().software,
      sensitivity: r.sensitivity('one', 8),
      control: { touched: control.touched, visible: control.visible, delta: control.delta },
      treated: { touched: treated.touched, visible: treated.visible, delta: treated.delta },
    };
  });

  console.log(`\nrenderer: ${grass.renderer} (software=${grass.software})`);
  console.log(`\nGRASS PAGE — sensitivity rung: ${grass.sensitivity.length === 0 ? 'PASSED' : 'FAILED'}`);
  for (const r of grass.sensitivity) console.log(`  ${r}`);
  if (grass.sensitivity.length > 0) {
    fail('the grass page could not prove it resolves the ADR-0490 D6 boundary on its own pixels');
  }

  const show = (name, d) => {
    console.log(
      `  ${name.padEnd(9)} touched ${String(d.touched).padStart(8)} · visible ` +
        `${String(d.visible).padStart(8)} · p50 ${String(d.delta.p50).padStart(3)} · max ` +
        `${String(d.delta.max).padStart(3)} · overstatement ` +
        (d.delta.overstatement === null ? 'n/a (nothing visible)' : `${d.delta.overstatement.toFixed(2)}x`),
    );
    for (const band of d.delta.bands) {
      if (band.pixels === 0) continue;
      console.log(
        `      ${band.label.padEnd(14)} ${String(band.from).padStart(3)}..${String(band.to).padEnd(3)} ` +
          `${String(band.pixels).padStart(8)} px  ${(band.shareOfMoved * 100).toFixed(2)}% of moved`,
      );
    }
  };
  console.log('\n  THE DISTRIBUTION, on real captured frames:');
  show('control', grass.control);
  show('treated', grass.treated);

  // ⚠ THE DISCRIMINATION CLAIM, ON REAL FRAMES rather than synthetic ones: an arm compared against
  // ITSELF must read as no movement, and an arm known to differ must not. A tool that cannot
  // separate those two has measured nothing, whatever number it printed.
  if (grass.control.touched !== 0) {
    fail(`the CONTROL arm differs from itself by ${grass.control.touched} px — the control is not a control`);
  }
  if (grass.treated.visible === 0) {
    fail('the arm whose whole claim is that it is VISIBLE moved no pixel past the bar');
  }
  console.log(
    `\n  DISCRIMINATES: control vs itself = ${grass.control.touched} px touched; ` +
      `treated vs control = ${grass.treated.visible} px visible.`,
  );

  // ---- the SKIRT page -----------------------------------------------------------------------
  await page.goto(`${ORIGIN}/shipped-skirt.html`, { waitUntil: 'domcontentloaded', timeout: 540000 });
  await page.waitForFunction(() => window.skirtRunner !== undefined, null, { timeout: 540000 });
  const skirt = await page.evaluate(async () => {
    const r = window.skirtRunner;
    r.warm();
    return {
      sensitivity: r.sensitivity('one', 8),
      flat: r.delta('flat', 'one', 8),
      rock: r.delta('rock', 'one', 8),
    };
  });
  console.log(`\nSKIRT PAGE — sensitivity rung: ${skirt.sensitivity.length === 0 ? 'PASSED' : 'FAILED'}`);
  for (const r of skirt.sensitivity) console.log(`  ${r}`);
  if (skirt.sensitivity.length > 0) {
    fail('the skirt page could not prove it resolves the ADR-0490 D6 boundary on its own pixels');
  }
  show('flat', { touched: skirt.flat.touched, visible: skirt.flat.visible, delta: skirt.flat });
  show('rock', { touched: skirt.rock.touched, visible: skirt.rock.visible, delta: skirt.rock });
  if (skirt.flat.touched !== 0) fail('the skirt CONTROL arm differs from itself');
  if (skirt.rock.visible === 0) fail('the shipped skirt arm moved no pixel past the bar');

  console.log(`\n${process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED — both pages call the shared instrument and it discriminates'}`);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  if (browser !== undefined) await browser.close();
}
