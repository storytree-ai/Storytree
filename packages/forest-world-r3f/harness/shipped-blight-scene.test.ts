import test from 'node:test';
import assert from 'node:assert/strict';

import { BLIGHT_STATUS_GATE, BLIGHT_TOKEN, BLIGHT_RUNGS } from '../src/land-blight.js';
import { GRASS_STATUS_GATE } from '../src/land-grass.js';
import { WHEAT_STATUS_GATE } from '../src/land-wheat.js';
import { SHIPPED_BLIGHT, SHIPPED_BLIGHT_MIX, SHIPPED_BLIGHT_RUNG, SHIPPED_GRASS_MIX } from '../src/ForestWorldCanvas.js';
import type { Rgb255 } from '../src/shade-ladder.js';
import { SHIPPED_GROUND_COLOUR } from './shipped-baseline.js';
import {
  BLIGHT_ARMS,
  BLIGHT_READ_ZOOM,
  BLIGHT_PICTURES,
  CONTROL_ARM,
  FORCED_ISLAND,
  FORCED_STATUS,
  LADDER_ARMS,
  NOCRACKS_ARM,
  SHIPPED_RUNG,
  armBlight,
  armCaption,
  armSpec,
  blightPaletteReport,
  darkestGroundLuma,
  maxChannelGap,
  medianOfRects,
  movedPixels,
  neighbourArm,
  neighbourSeparations,
  picture,
} from './shipped-blight-scene.js';
import type { RealIslandRect } from './real-forest-scene.js';

test('the charred token this module`s ramps are stated against IS the shipped `unhealthy` token', () => {
  // ⚠ `src/land-blight.ts` may not import the harness's transcription (the web sync mirrors `src/`
  // and copies nothing from `harness/`), so it carries the value as a literal and this is the pin.
  assert.equal(BLIGHT_TOKEN, SHIPPED_GROUND_COLOUR.get('unhealthy'));
  assert.equal(FORCED_STATUS, 'unhealthy');
  assert.ok(BLIGHT_STATUS_GATE.includes(FORCED_STATUS));
});

test('the three paint gates are DISJOINT — one status wears one painted layer', () => {
  const all = [...GRASS_STATUS_GATE, ...WHEAT_STATUS_GATE, ...BLIGHT_STATUS_GATE];
  assert.equal(new Set(all).size, all.length, 'a status is named by two paint gates');
});

test('the arms are the flat control, the ladder in order, and the crack-attribution arm', () => {
  assert.equal(BLIGHT_ARMS[0]!.id, CONTROL_ARM);
  assert.equal(BLIGHT_ARMS[0]!.palette, null, 'the control must wear NO blight, or it is not the map');
  assert.equal(armBlight(CONTROL_ARM), null);
  assert.deepEqual([...LADDER_ARMS], BLIGHT_RUNGS.map((r) => r.id));
  assert.deepEqual(
    BLIGHT_ARMS.slice(1, 1 + BLIGHT_RUNGS.length).map((a) => a.id),
    BLIGHT_RUNGS.map((r) => r.id),
  );
  const noc = armSpec(NOCRACKS_ARM);
  // ⚠ THE ATTRIBUTION ARM IS THE SHIPPED BURN WITH THE CRACKS OFF, and nothing else may move, or
  // the step from it to the shipped rung is not the crack network's own contribution.
  assert.equal(noc.palette?.burn, SHIPPED_BLIGHT_RUNG.palette.burn);
  assert.equal(noc.palette?.crackMix, 0);
});

test('every arm`s material wears the shipped gate and factor — the ARMS differ only in the palette', () => {
  for (const arm of BLIGHT_ARMS) {
    const layer = armBlight(arm.id);
    if (arm.palette === null) {
      assert.equal(layer, null);
      continue;
    }
    assert.deepEqual(layer?.rows, SHIPPED_BLIGHT.rows);
    assert.equal(layer?.mix, SHIPPED_BLIGHT_MIX);
    assert.deepEqual(layer?.palette, arm.palette);
  }
  // The blight's factor is its OWN constant, set equal to the grass's; a scale-back on either must
  // not move the other, which is why this is an equality check and not a shared reference.
  assert.equal(SHIPPED_BLIGHT_MIX, SHIPPED_GRASS_MIX);
  assert.ok(SHIPPED_BLIGHT_MIX < 1, 'never 1.0 — ADR-0490 D5’s seam, kept literally');
});

test('the shipped rung is a rung of the ladder, and the re-export names the same object', () => {
  assert.ok(BLIGHT_RUNGS.some((r) => r.id === SHIPPED_BLIGHT_RUNG.id));
  assert.equal(SHIPPED_RUNG, SHIPPED_BLIGHT_RUNG);
  assert.deepEqual(SHIPPED_BLIGHT.palette, SHIPPED_BLIGHT_RUNG.palette);
});

test('an unknown arm or picture is REFUSED, so a typo`d caption cannot render an arm wearing no rung', () => {
  assert.throws(() => armSpec('charred'), /no arm "charred"/);
  assert.throws(() => armBlight('charred'), /no arm "charred"/);
  assert.throws(() => picture('fit' as never), /no picture "fit"/);
  assert.equal(neighbourArm(CONTROL_ARM), null);
  assert.equal(neighbourArm(BLIGHT_ARMS[1]!.id), CONTROL_ARM);
  assert.ok(armCaption(CONTROL_ARM).includes(CONTROL_ARM));
  assert.ok(armCaption('dead').includes('burn'));
});

test('the pictures are the acceptance frame and the read zoom, and the read zoom is the house one', () => {
  assert.deepEqual(BLIGHT_PICTURES.map((p) => p.id), ['forest', 'one']);
  assert.equal(BLIGHT_READ_ZOOM, 8);
  // The forced island is named in the read picture's caption, so a sheet cannot lose which island
  // it is a picture of.
  assert.ok(picture('one').what.includes(FORCED_ISLAND));
});

test('the palette report says what the treatment WEARS and what it DROPS, and the drops are the gated three', () => {
  const r = blightPaletteReport();
  assert.equal(r.token, BLIGHT_TOKEN);
  assert.ok(r.crackRgb.r > r.tokenRgb.r);
  assert.deepEqual(r.drops, ['2 shore sand', '3 worn path', '4 slope rock']);
  assert.ok(r.wears.some((w) => w.includes('crack network')));
  assert.ok(r.octaves > 0);
});

// ---------------------------------------------------------------- the pixel readings

const rect = (x0: number, y0: number, x1: number, y1: number, id = 'i', status = 'unhealthy'): RealIslandRect => ({
  id,
  status,
  rect: { x0, y0, x1, y1 },
  fullRect: { x0, y0, x1, y1 },
  fullAreaPx: (x1 - x0) * (y1 - y0),
});

/** A 4x1 frame: background, then three named colours. */
function frameOf(pixels: readonly Rgb255[]): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((p, i) => {
    data[i * 4] = p.r;
    data[i * 4 + 1] = p.g;
    data[i * 4 + 2] = p.b;
    data[i * 4 + 3] = 255;
  });
  return { data, width: pixels.length, height: 1 };
}

const BG: Rgb255 = { r: 16, g: 20, b: 24 };

test('the max-channel gap is per channel, which is the bar ADR-0490 D6 is stated in', () => {
  assert.equal(maxChannelGap({ r: 10, g: 10, b: 10 }, { r: 10, g: 41, b: 12 }), 31);
  assert.equal(maxChannelGap({ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }), 0);
});

test('the median over a set of rects EXCLUDES the background and pools every rect', () => {
  const f = frameOf([BG, { r: 10, g: 20, b: 30 }, { r: 50, g: 60, b: 70 }, { r: 90, g: 100, b: 110 }]);
  const got = medianOfRects(f, BG, [rect(0, 0, 2, 1), rect(2, 0, 4, 1)]);
  assert.equal(got.pixels, 3, 'the background pixel voted');
  assert.deepEqual(got.median, { r: 50, g: 60, b: 70 });
  // A rect with only background is not a crash and contributes nothing.
  assert.deepEqual(medianOfRects(f, BG, [rect(0, 0, 1, 1)]), { median: { r: 0, g: 0, b: 0 }, pixels: 0 });
});

test('the darkest ground luma skips the background — otherwise every island reports the sea', () => {
  const f = frameOf([BG, { r: 100, g: 100, b: 100 }, { r: 40, g: 40, b: 40 }]);
  assert.ok(Math.abs(darkestGroundLuma(f, BG, rect(0, 0, 3, 1)) - 40) < 1e-9);
  // ⚠ WITHOUT THE EXCLUSION this would be the background's own luma, and every rung would report
  // the same margin of zero — a number that looks like a measurement of the paint and is not.
  assert.ok(darkestGroundLuma(f, BG, rect(0, 0, 3, 1)) > 0.3 * BG.r + 0.59 * BG.g + 0.11 * BG.b);
});

test('moved pixels counts a pixel the BAR was passed on, and keeps a pixel either frame has ground at', () => {
  const a = frameOf([{ r: 100, g: 100, b: 100 }, { r: 100, g: 100, b: 100 }, BG]);
  const b = frameOf([{ r: 100, g: 100, b: 100 }, { r: 100, g: 130, b: 100 }, { r: 200, g: 200, b: 200 }]);
  const got = movedPixels(a, b, BG, rect(0, 0, 3, 1));
  // ⚠ THE THIRD PIXEL IS BACKGROUND IN `a` AND GROUND IN `b`, AND IT COUNTS. An arm that darkened a
  // rim pixel into the sea's own colour must not simply drop out of the denominator — that would
  // score a disappearing island as an unchanged one.
  assert.equal(got.islandPixels, 3);
  assert.equal(got.pixels, 2);
  assert.ok(Math.abs(got.share - 2 / 3) < 1e-12);
  // A gap exactly AT the bar has not passed it.
  const c = frameOf([{ r: 100, g: 100, b: 100 }]);
  const d = frameOf([{ r: 120, g: 100, b: 100 }]);
  assert.equal(movedPixels(c, d, BG, rect(0, 0, 1, 1)).pixels, 0);
});

test('the neighbour separation skips the forced island itself and groups by status', () => {
  const f = frameOf([
    { r: 40, g: 40, b: 40 },
    { r: 120, g: 160, b: 90 },
    { r: 120, g: 160, b: 90 },
    { r: 200, g: 190, b: 100 },
  ]);
  const rects = [
    rect(0, 0, 1, 1, FORCED_ISLAND, 'unhealthy'),
    rect(1, 0, 2, 1, 'a', 'healthy'),
    rect(2, 0, 3, 1, 'b', 'healthy'),
    rect(3, 0, 4, 1, 'c', 'proposed'),
  ];
  const got = neighbourSeparations(f, BG, rects, { r: 40, g: 40, b: 40 });
  assert.deepEqual(got.map((s) => s.status), ['healthy', 'proposed']);
  assert.equal(got[0]!.islands, 2);
  assert.equal(got[0]!.maxChannel, 120);
  assert.equal(got[1]!.islands, 1);
  assert.equal(got[1]!.maxChannel, 160);
  // ⚠ THE FORCED ISLAND MUST NOT APPEAR AS ITS OWN NEIGHBOUR, or the sheet would print a
  // separation of 0 against `unhealthy` and it would read as a failure of the paint.
  assert.ok(!got.some((s) => s.status === 'unhealthy'));
});
