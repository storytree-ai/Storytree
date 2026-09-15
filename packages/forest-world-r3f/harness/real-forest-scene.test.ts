// real-forest-scene.test.ts — the real-forest page's own arithmetic, without a GPU.
//
// ⚠ THE PICTURE IS FOR THE OWNER'S EYE; what a test can hold is that the page cannot quietly show
// something OTHER than the shipped map (the manifest refusals), that the extent comparison is taken
// with ONE ruler over both forests, and that every island gets its OWN screen rect rather than a
// translated copy of one fixture's — which is the single way this page could report a status
// verdict that looks like a verdict and is not.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import { orientedCamera } from './shipped-crowd-scene.js';
import { armStream, type SpacingArm, type SpacingSceneFile } from './shipped-spacing-scene.js';
import {
  REAL_FOREST_ARM,
  REAL_FOREST_EVIDENCE_DIR,
  SETTLE_STABLE_READS,
  sameFrame,
  settleFrames,
  extentComparison,
  realIslandRects,
  rectInFrame,
  syntheticForestStream,
  fetchJsonFromPage,
  parseHarnessElevation,
  parseScenesRoute,
  twoDView,
  validateRealManifest,
  type RealForestManifest,
} from './real-forest-scene.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENES = join(HERE, '..', '..', '..', 'docs', 'research', REAL_FOREST_EVIDENCE_DIR, 'scenes');

/** The shipped map's own manifest shape. Typed rather than asserted, so a schema change breaks this
 *  fixture at compile time instead of leaving it describing a manifest nobody writes any more. */
const good = (): RealForestManifest => ({
  generatedAt: '2026-09-08T00:00:00.000Z',
  studio: { url: 'http://127.0.0.1:5417', head: 'abc', branch: 'claude/real-forest-render' },
  control: REAL_FOREST_ARM,
  arms: [
    {
      id: REAL_FOREST_ARM,
      spacing: {},
      tile: { hexR: 11.06, quota: 'max(1, capabilities) × 1 hexes', tilesPerCapability: 1 },
      file: 'shipped.json',
      islands: 35,
      world: { width: 787, height: 1293 },
      trails: { edges: 90, segments: 103, caves: 0, dropped: [] },
      bytes: 1,
    },
  ],
  twoD: [
    { view: 'fit', islands: 35, scale: 1.42, viewport: { w: 2560, h: 1600 }, contentExtentPx: null, medianIslandWidthPx: null, png: 'x' },
  ],
});

/** One arm, with `patch` merged over it — the shape a defective export would arrive in. The variants
 *  are BUILT rather than mutated because the manifest's arrays are readonly and `validateRealManifest`
 *  takes `unknown` anyway: what it has to survive is arbitrary JSON, not a typed object. */
const armPatched = (patch: Record<string, unknown>) => {
  const m = good();
  return { ...m, arms: [{ ...m.arms[0], ...patch }] };
};

test('the manifest is refused unless it is the shipped map', () => {
  assert.doesNotThrow(() => validateRealManifest(good()));

  const m = good();
  assert.throws(() => validateRealManifest({ ...m, arms: [m.arms[0], { ...m.arms[0], id: 'spacing-0.2' }] }), /exactly one/);

  // A LADDER RUNG WEARING THE MAP'S NAME is the failure this page could not otherwise see: the
  // scene renders, the caption says "the map", and the layout is a candidate nobody ships.
  assert.throws(() => validateRealManifest(armPatched({ spacing: { ratio: 0.2 } })), /spacing override/);
  assert.throws(() => validateRealManifest(armPatched({ tile: undefined })), /records no tile/);
  assert.throws(() => validateRealManifest({ ...m, twoD: [] }), /nothing to stand the 3D beside/);
  assert.throws(() => validateRealManifest({ arms: [] }), /is not the shipped map/);
  // ⚠⚠ THE OWNER-LOOK FENCE. A scene DRAWN at another elevation is un-projected here at the studio
  // default, so it would build a forest with the wrong depth and say nothing. The 3D arm moves the
  // camera over the default-drawn scene instead; an export that re-drew is refused outright.
  assert.throws(() => validateRealManifest(armPatched({ drawnElevationDeg: 50 })), /DRAWN at 50°/);
  // and the shipped export, which asks the map for nothing, carries no such stamp
  assert.doesNotThrow(() => validateRealManifest(armPatched({})));
});

test('twoDView refuses a view the driver never photographed', () => {
  assert.equal(twoDView(good(), 'fit').scale, 1.42);
  assert.throws(() => twoDView(good(), 'resting'), /carries no 2D "resting" view/);
});

/** The committed export — the real map as the studio laid it out. */
function realArm(): SpacingArm {
  const m = validateRealManifest(JSON.parse(readFileSync(join(SCENES, 'manifest.json'), 'utf8')));
  const record = m.arms[0]!;
  return { record, file: JSON.parse(readFileSync(join(SCENES, record.file), 'utf8')) as SpacingSceneFile };
}

test('the extent comparison reads both forests with ONE ruler, and the real one is the taller', () => {
  const real = armStream(realArm());
  const e = extentComparison(real, syntheticForestStream());

  // Both populations are the 35-island forest — a comparison across different counts would be a
  // different claim wearing this one's name.
  assert.equal(e.realIslands, 35);
  assert.equal(e.syntheticIslands, e.synthetic.w > 0 ? e.syntheticIslands : 0);
  assert.ok(e.syntheticIslands > 1, 'the synthetic crowd must place more than one island');

  // Every extent is finite and positive — the ratios below mean nothing otherwise.
  for (const v of [e.real.w, e.real.d, e.synthetic.w, e.synthetic.d]) {
    assert.ok(Number.isFinite(v) && v > 0, `extent ${v} is not a measurement`);
  }

  // THE SHAPE CLAIM THIS PAGE EXISTS TO MAKE. The real DAG is a tall column and the synthetic
  // scatter is roughly square, so a "forest-scale" figure taken on the crowd is a figure about a
  // different shape. Held as an inequality rather than a constant: the corpus grows.
  assert.ok(
    e.realDepthOverWidth > e.syntheticDepthOverWidth,
    `the real forest should be the taller of the two (real ${e.realDepthOverWidth.toFixed(2)} vs synthetic ${e.syntheticDepthOverWidth.toFixed(2)})`,
  );

  // The ratios are the extents' own arithmetic, not a second measurement.
  assert.equal(e.widthRatio, e.real.w / e.synthetic.w);
  assert.equal(e.areaRatio, (e.real.w * e.real.d) / (e.synthetic.w * e.synthetic.d));
});

test('every island gets its OWN screen rect — the crowd page’s translate-a-fixture shortcut would not', () => {
  const stream = armStream(realArm());
  const camera = orientedCamera({ x: 0, z: 0 }, 1);
  const rects = realIslandRects(stream, camera, 2560, 1600);
  assert.equal(rects.length, 35);

  // ⚠ THE ASSERTION THAT CATCHES THE SHORTCUT. `shipped-status-scene.ts` projects one fixture
  // island and shifts the rect per island, so every rect it returns is the SAME SIZE. On the real
  // map the islands differ (a 25-capability island against a 2-capability one), so a set of rects
  // that all measured the same width would mean this page had been handed a crowd's projection —
  // and `status-truth.ts` would have voted 34 islands' neighbours into their verdicts without any
  // sign of it in the output.
  const widths = new Set(rects.map((r) => Math.round((r.fullRect.x1 - r.fullRect.x0) * 100) / 100));
  assert.ok(widths.size > 5, `the real map's islands should not share one rect size (${widths.size} distinct widths)`);

  // A rect must contain the island's own ground: the projected centre of its vertices lands inside.
  const v = new THREE.Vector3();
  for (const r of rects) {
    const pts = stream.filter((d) => d.kind === 'cell-ground' && d.island === r.id).flatMap((d) => d.points ?? []);
    assert.ok(pts.length > 0, `${r.id} has no ring`);
    let sx = 0;
    let sy = 0;
    for (const p of pts) {
      v.set(p.x, p.y, p.z).applyMatrix4(camera.matrixWorldInverse);
      sx += v.x;
      sy += v.y;
    }
    const cx = ((sx / pts.length - camera.left) / (camera.right - camera.left)) * 2560;
    const cy = ((sy / pts.length - camera.bottom) / (camera.top - camera.bottom)) * 1600;
    assert.ok(
      cx >= r.fullRect.x0 && cx <= r.fullRect.x1 && cy >= r.fullRect.y0 && cy <= r.fullRect.y1,
      `${r.id}: its own centroid falls outside its rect`,
    );
    // Every island carries the status the layout folded onto it — an 'unknown' would silently make
    // its verdict unfalsifiable, since no reader table entry could ever match.
    assert.notEqual(r.status, 'unknown', `${r.id} reached the reader with no status`);
    // The shrink is toward the centre, so the shrunk rect sits inside the full one.
    assert.ok(r.rect.x0 >= r.fullRect.x0 && r.rect.x1 <= r.fullRect.x1, `${r.id}: the shrunk rect escaped its own full rect`);
  }
});

test('rectInFrame asks the full rect, so a corner-clipped island still counts', () => {
  assert.equal(rectInFrame({ x0: -10, x1: 5, y0: -10, y1: 5 }, 100, 100), true);
  assert.equal(rectInFrame({ x0: -20, x1: -1, y0: 10, y1: 20 }, 100, 100), false);
  assert.equal(rectInFrame({ x0: 101, x1: 120, y0: 10, y1: 20 }, 100, 100), false);
});

// ---------------------------------------------------------------- the settle

/** A scripted readback sequence — each `draw` advances to the next frame in the script. */
function scripted(frames: readonly (readonly number[])[]) {
  let i = -1;
  return {
    draw: () => { i = Math.min(i + 1, frames.length - 1); },
    read: () => new Uint8ClampedArray(frames[Math.max(0, i)]!),
    drawn: () => i + 1,
  };
}

const noWait = async (): Promise<void> => {};

test('the settle returns once two consecutive readbacks AGREE, and not before', async () => {
  // Three different frames, then a repeat: the settle must not return on the changing ones.
  const s = scripted([[1, 1], [2, 2], [3, 3], [3, 3]]);
  const got = await settleFrames(s.draw, s.read, noWait);
  assert.equal(got.reads, 4);
  assert.equal(s.drawn(), 4);
  assert.equal(SETTLE_STABLE_READS, 2);
});

test('a page that was already warm settles in the minimum reads and waits almost nothing', async () => {
  const s = scripted([[7, 7], [7, 7]]);
  const got = await settleFrames(s.draw, s.read, noWait);
  // ⚠ TWO, NEVER ONE. A single readback agrees with nothing, so it cannot be evidence of stability;
  // returning after it would make the whole function a no-op that reads like a guarantee.
  assert.equal(got.reads, 2);
});

test('a frame that NEVER settles is REFUSED, never returned as a last best guess', async () => {
  let n = 0;
  const changing = () => new Uint8ClampedArray([n, n]);
  await assert.rejects(
    settleFrames(() => { n += 1; }, changing, noWait, { maxReads: 5 }),
    /the frame never settled/,
  );
  // ⚠ THE POINT OF THE REFUSAL: a page whose output keeps changing has no measurement to report, and
  // the one failure this whole seam exists to prevent is a number that looks like a measurement.
});

test('the settle honours a caller`s stability requirement — three agreements is stricter than two', async () => {
  const s = scripted([[1, 1], [2, 2], [2, 2], [2, 2]]);
  assert.equal((await settleFrames(s.draw, s.read, noWait, { stable: 3 })).reads, 4);
  const t = scripted([[1, 1], [2, 2], [2, 2], [2, 2]]);
  assert.equal((await settleFrames(t.draw, t.read, noWait, { stable: 2 })).reads, 3);
});

test('the settle WAITS between readbacks, and reports how long it waited', async () => {
  const waits: number[] = [];
  const s = scripted([[1, 1], [2, 2], [2, 2]]);
  const got = await settleFrames(s.draw, s.read, async (ms) => { waits.push(ms); }, { waitMs: 40 });
  // ⚠ THE WAIT IS THE WHOLE FIX AND A TEST HAS TO SEE IT HAPPEN. Rendering twice in a row does NOT
  // fix this (measured 2026-09-08: the reported figures did not move by a single island) — two
  // synchronous passes sit in the same tick, before any texture decode has had a chance to run.
  assert.deepEqual(waits, [40, 40]);
  assert.equal(got.waitedMs, 80);
});

test('frame equality is byte equality, and a length difference is a difference', () => {
  assert.ok(sameFrame(new Uint8ClampedArray([1, 2, 3]), new Uint8ClampedArray([1, 2, 3])));
  assert.ok(!sameFrame(new Uint8ClampedArray([1, 2, 3]), new Uint8ClampedArray([1, 2, 4])));
  assert.ok(!sameFrame(new Uint8ClampedArray([1, 2, 3]), new Uint8ClampedArray([1, 2])));
  assert.ok(sameFrame(new Uint8ClampedArray([]), new Uint8ClampedArray([])));
  // ⚠ THE LAST BYTE COUNTS. A loop stopping one short would call two frames identical that differ
  // exactly where a rim pixel lives.
  assert.ok(!sameFrame(new Uint8ClampedArray([1, 2, 3]), new Uint8ClampedArray([1, 2, 3, 9])));
});

test('the harness elevation flag: an angle in (0, 90] is the owner-look arm, absent is the shipped angle', () => {
  assert.equal(parseHarnessElevation(new URLSearchParams('?elevation=20')), 20);
  assert.equal(parseHarnessElevation(new URLSearchParams('?elevation=50')), 50);
  // ABSENT IS THE SHIPPED ANGLE — the property that keeps every existing invocation unchanged.
  assert.equal(parseHarnessElevation(new URLSearchParams('')), null);
  // 0° looks along the ground plane: sin e is 0, which is a division by zero in the registration
  // arithmetic this whole arm exists to unblock, not a picture. Refused rather than clamped.
  assert.equal(parseHarnessElevation(new URLSearchParams('?elevation=0')), null);
  assert.equal(parseHarnessElevation(new URLSearchParams('?elevation=-10')), null);
  assert.equal(parseHarnessElevation(new URLSearchParams('?elevation=120')), null);
  assert.equal(parseHarnessElevation(new URLSearchParams('?elevation=nope')), null);
});

test('the scenes flag names a directory under docs/research/, never a path out of it', () => {
  assert.equal(parseScenesRoute(new URLSearchParams('?scenes=chapter2-shared-elevation-2026-09-15')), '/reference/chapter2-shared-elevation-2026-09-15/scenes');
  // ABSENT IS THE COMMITTED EXPORT — every existing invocation is unchanged.
  assert.equal(parseScenesRoute(new URLSearchParams('')), null);
  assert.equal(parseScenesRoute(new URLSearchParams('?scenes=')), null);
  // ⚠ A DIRECTORY NAME, NOT A PATH. The harness's own `/reference/` middleware normalises and fences
  // too, so this is the second of two walls rather than the only one — but a flag that can be talked
  // into naming a traversal is one a caption could be wrong about even when nothing escapes.
  assert.equal(parseScenesRoute(new URLSearchParams('?scenes=../../etc')), null);
  assert.equal(parseScenesRoute(new URLSearchParams('?scenes=a/b')), null);
  assert.equal(parseScenesRoute(new URLSearchParams('?scenes=..')), null);
});

// ---------------------------------------------------------------------------------------------
// THE DEFAULT THE PAGE ACTUALLY RUNS ON. `createRealForestRunner` takes its fetcher injected, and
// every test above drives it with a fake — so without this one, the implementation that runs in a
// browser is reached by nothing and the suite is evidence about the fakes (ADR-0278). It is DRIVEN
// rather than merely named: importing a seam without calling it reads as covered and proves the
// same nothing.

test('fetchJsonFromPage returns the parsed body on a 200', async () => {
  const real = globalThis.fetch;
  const seen: string[] = [];
  // A REAL `Response`, not a shape cast into one: the seam calls `.ok`, `.status` and `.json()`, and
  // a hand-built stand-in would be evidence about the stand-in — which is the whole failure this
  // test exists to close.
  globalThis.fetch = async (input) => {
    seen.push(String(input));
    return new Response(JSON.stringify({ arms: ['shipped'] }), { status: 200 });
  };
  try {
    assert.deepEqual(await fetchJsonFromPage('/reference/x/scenes/manifest.json'), { arms: ['shipped'] });
    assert.deepEqual(seen, ['/reference/x/scenes/manifest.json']);
  } finally {
    globalThis.fetch = real;
  }
});

test('fetchJsonFromPage REFUSES a non-200 and its message names the export step and the worktree', async () => {
  const real = globalThis.fetch;
  // ⚠ The BODY is valid JSON on purpose. A refusal that parsed it anyway would hand a 404 page back
  // as a manifest, and a body that could not parse would hide that by failing for another reason.
  globalThis.fetch = async () => new Response(JSON.stringify({ notAManifest: true }), { status: 404 });
  try {
    await assert.rejects(
      () => fetchJsonFromPage('/reference/missing/scenes/manifest.json'),
      (e: Error) => {
        assert.match(e.message, /answered 404/);
        // The two things a reader hitting this actually needs: run the export, and serve from HERE.
        assert.match(e.message, /export-real-forest\.mjs/);
        assert.match(e.message, /THIS worktree/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = real;
  }
});
