import { expect, test, type Page, type TestInfo } from '@playwright/test';

// This UAT suite typechecks under tsconfig.node.json (no DOM lib), while these callbacks execute
// inside Chromium. Keep the small browser-global boundary explicit, as the shared UAT does.
declare const document: any;
declare const window: any;
declare const Image: any;
declare function requestAnimationFrame(callback: () => void): number;

const DEEP_LINK = '/?organicGrowth=organic-socket-choreography#/tree';
const FRAME_KEYS = ['empty', 'land', 'proposed', 'claimed', 'signed-proof', 'healthy'] as const;

async function anchors(page: Page): Promise<string[]> {
  return page.locator('image[data-organic-socket]').evaluateAll((images) =>
    images.map(
      (image) =>
        `${image.getAttribute('data-organic-socket')}:${image.getAttribute('data-world-anchor-x')},${image.getAttribute('data-world-anchor-y')}`,
    ),
  );
}

async function waitForOrganicPaint(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const hrefs = Array.from(
      document.querySelectorAll('image[data-organic-frame]'),
      (image: any) => image.getAttribute('href'),
    )
      .filter((href): href is string => href !== null);
    await Promise.all(
      hrefs.map(async (href) => {
        const probe = new Image();
        probe.src = href;
        await probe.decode();
      }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function advanceToFinal(page: Page): Promise<void> {
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await expect(next).toHaveCount(1);
  for (const key of FRAME_KEYS.slice(1)) {
    await next.click();
    await expect(page.locator(`[data-semantic-growth-frame="${key}"]`)).toHaveCount(1);
  }
  await expect
    .poll(
      () =>
        page
          .locator('[data-semantic-growth-frame="healthy"]')
          .getAttribute('data-organic-growth-progress'),
      { timeout: 20_000 },
    )
    .toBe('1.0000');
}

test.describe('organic socket choreography real-app witness', () => {
  test('desktop walks, plants, replays and retains the bounded final scene', async ({
    page,
  }, testInfo: TestInfo) => {
    test.setTimeout(120_000);
    const runtimePixelLabRequests: string[] = [];
    page.on('request', (request) => {
      const { hostname } = new URL(request.url());
      if (hostname === 'pixellab.ai' || hostname.endsWith('.pixellab.ai')) {
        runtimePixelLabRequests.push(request.url());
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(DEEP_LINK);

    const section = page.locator('[data-semantic-growth-frame="empty"]');
    await expect(section).toHaveCount(1);
    await expect(page.locator('.hex-coastland')).toHaveCount(1);
    await expect(page.locator('.coast-fill')).toHaveCount(1);
    await expect(page.locator('.relaxed-land')).toHaveCount(1);
    await expect(page.locator('[data-depth-slot="island-growth-composite"]')).toHaveCount(0);
    await expect(page.locator('image[data-organic-socket]')).toHaveCount(7);
    const planted = await anchors(page);
    await page.screenshot({ path: testInfo.outputPath('desktop-start.png'), fullPage: true });

    await advanceToFinal(page);
    await expect(page.locator('image[data-organic-frame="7"]')).toHaveCount(1);
    await expect(page.locator('image[data-organic-frame="3"]')).toHaveCount(6);
    await waitForOrganicPaint(page);
    expect(await anchors(page)).toEqual(planted);
    expect(runtimePixelLabRequests).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('desktop-final.png'), fullPage: true });

    const back = page.getByRole('button', { name: 'Back', exact: true });
    await expect(back).toHaveCount(1);
    await back.click();
    await expect(page.locator('[data-semantic-growth-frame="signed-proof"]')).toHaveCount(1);

    const replay = page.getByRole('button', { name: 'Replay', exact: true });
    await expect(replay).toHaveCount(1);
    await replay.click();
    await expect(page.locator('[data-semantic-growth-frame="empty"]')).toHaveCount(1);
    await expect
      .poll(() =>
        page.locator('[data-semantic-growth-frame="empty"]').getAttribute('data-organic-growth-progress'),
      )
      .toBe('0.0000');
    expect(await anchors(page)).toEqual(planted);
  });

  test('mobile reduced motion settles to the same retained final frames without overflow', async ({
    page,
  }, testInfo: TestInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(DEEP_LINK);
    const planted = await anchors(page);

    await advanceToFinal(page);
    const frameTrace = await page.locator('image[data-organic-socket]').evaluateAll((images) =>
      images.map((image) => image.getAttribute('data-organic-frame')),
    );
    expect(frameTrace).toEqual(['3', '3', '3', '7', '3', '3', '3']);
    await waitForOrganicPaint(page);
    expect(await anchors(page)).toEqual(planted);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('mobile-final.png'), fullPage: true });
  });
});
