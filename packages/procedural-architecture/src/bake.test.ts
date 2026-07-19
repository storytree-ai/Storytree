// The bake's contract — the two things a surface composing buildings depends on.
//
// (1) ONE BAKE, TWO PRINTERS. The SVG backend and a scene surface must be looking at
//     the same geometry in the same order, or "it looked right on the contact sheet"
//     stops being evidence about the map. The test holds the printer to the bake
//     element-for-element rather than trusting the refactor.
// (2) THE PLACEMENT CONTRACT. A normalized building stands ON the origin — centred
//     horizontally, base at y = 0 — which is what lets a caller drop it with a plain
//     `translate(x y) scale(k)`, the same convention the island's standing stones and
//     identity glyphs already use.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bakeBuilding } from './bake.js';
import { render, renderDetailed } from './render-svg.js';
import { forestWindmill } from './buildings/forest-windmill.js';
import { mushroomDwelling } from './buildings/mushroom-dwelling.js';
import { tieredPagoda } from './buildings/tiered-pagoda.js';

const MODELS = [
  { name: 'forest-windmill', model: forestWindmill },
  { name: 'mushroom-dwelling', model: mushroomDwelling },
  { name: 'tiered-pagoda', model: tieredPagoda },
];

// ---------------------------------------------------------------------------
// (1) one bake, two printers
// ---------------------------------------------------------------------------

for (const b of MODELS) {
  test(`${b.name}: every baked node is printed, and nothing else is`, () => {
    const model = b.model();
    const baked = bakeBuilding(model, { showGround: false });
    const svg = render(model, { showGround: false, background: null });

    // Count the drawable elements in the markup. `<svg>` itself is the only other tag
    // when the background is transparent and the ground shadow is off.
    const drawn = (svg.match(/<(polygon|path|ellipse)\b/g) ?? []).length;
    assert.equal(
      drawn,
      baked.nodes.length,
      `printer emitted ${drawn} elements for ${baked.nodes.length} baked nodes — the two backends have drifted`,
    );
  });

  test(`${b.name}: the printed fills appear in the baked order`, () => {
    const model = b.model();
    const baked = bakeBuilding(model, { showGround: false });
    const svg = render(model, { showGround: false });

    // Painter order IS the contract — a surface paints the nodes in sequence and stops.
    // Walking the markup's fills in order must reproduce the baked sequence exactly.
    const printed = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
    const expected = baked.nodes.map((n) => n.fill);
    assert.deepEqual(printed, expected);
  });
}

test('the ground shadow bakes as a node rather than as markup the printer invents', () => {
  const model = forestWindmill();
  const withGround = bakeBuilding(model, { showGround: true });
  const without = bakeBuilding(model, { showGround: false });

  assert.equal(withGround.nodes.length, without.nodes.length + 1);
  const first = withGround.nodes[0];
  assert.equal(first?.el, 'ellipse', 'the contact shadow is first and furthest back');
});

// ---------------------------------------------------------------------------
// (2) the placement contract
// ---------------------------------------------------------------------------

/** Every coordinate a node paints at, whatever shape it is. */
function pointsOf(nodes: ReturnType<typeof bakeBuilding>['nodes']): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const n of nodes) {
    if (n.el === 'ellipse') {
      out.push({ x: n.cx - n.rx, y: n.cy - n.ry }, { x: n.cx + n.rx, y: n.cy + n.ry });
    } else if (n.el === 'polygon') {
      for (const pair of n.points.split(' ')) {
        const [x, y] = pair.split(',').map(Number);
        if (x !== undefined && y !== undefined) out.push({ x, y });
      }
    } else {
      for (const m of n.d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
        out.push({ x: Number(m[1]), y: Number(m[2]) });
      }
    }
  }
  return out;
}

for (const b of MODELS) {
  test(`${b.name}: normalized, it stands ON the origin`, () => {
    const baked = bakeBuilding(b.model(), { normalize: true });
    const pts = pointsOf(baked.nodes);
    assert.ok(pts.length > 0);

    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys); // screen y grows DOWN, so this is the lowest point

    // Centred horizontally on x = 0 …
    assert.ok(
      Math.abs((minX + maxX) / 2) < 0.01,
      `horizontal centre is ${(minX + maxX) / 2}, expected 0`,
    );
    // … and standing on y = 0, so a caller's translate target IS the ground contact.
    assert.ok(Math.abs(maxY) < 0.01, `base is at y=${maxY}, expected 0`);

    // The reported box has to match what was actually painted, or a caller scaling to a
    // target height gets a building of the wrong size.
    assert.ok(Math.abs(baked.width - (maxX - minX)) < 0.01);
    assert.ok(Math.abs(baked.height - (Math.max(...ys) - Math.min(...ys))) < 0.01);
  });

  test(`${b.name}: normalizing MOVES the building and changes nothing else`, () => {
    const raw = bakeBuilding(b.model(), {});
    const norm = bakeBuilding(b.model(), { normalize: true });

    // Same drawables, same order, same paint — a pure translation.
    assert.equal(norm.nodes.length, raw.nodes.length);
    assert.deepEqual(norm.nodes.map((n) => n.fill), raw.nodes.map((n) => n.fill));
    assert.deepEqual(norm.nodes.map((n) => n.el), raw.nodes.map((n) => n.el));
    assert.ok(Math.abs(norm.width - raw.width) < 0.01);
    assert.ok(Math.abs(norm.height - raw.height) < 0.01);
  });

  test(`${b.name}: the bake is deterministic`, () => {
    const a = bakeBuilding(b.model(), { normalize: true });
    const c = bakeBuilding(b.model(), { normalize: true });
    assert.deepEqual(a.nodes, c.nodes);
  });
}

// ---------------------------------------------------------------------------
// what a surface composing many buildings has to budget for (ADR-0069)
// ---------------------------------------------------------------------------

// A building's DOM cost is NOT its polygon count, and the gap is the thing a surface
// gets wrong. Increment 4 measured the mushroom at 936 polygons; it bakes to ~1394
// nodes, because every fragment the ordering pass split emits TWO — a fill, plus the
// path tracing the edges it inherited (the seam fix, `bake.ts`). So the real per-building
// cost is roughly 1.5x the polygon count, and ONE mushroom already sits at about half of
// ADR-0069's comfortable 1,000–3,000 node ceiling.
//
// The consequence is a hard constraint on composition, not a tuning note: a map carrying
// a dozen islands cannot inline a copy per island. It must define each building once and
// REFERENCE it — which is what the island glue does.
test('a baked building reports its own node cost, so a surface can budget', () => {
  const cost = MODELS.map((b) => ({ name: b.name, nodes: bakeBuilding(b.model(), { normalize: true }).nodes.length }));
  for (const c of cost) {
    assert.ok(c.nodes > 100, `${c.name} baked to only ${c.nodes} nodes`);
    // A drift guard at ~1.5x ADR-0069's lower bound, not a target. Crossing it means the
    // split inflation moved and the reference-don't-inline rule needs re-checking.
    assert.ok(c.nodes < 1600, `${c.name} baked to ${c.nodes} nodes — split inflation has moved`);
  }
  // The whole kit, defined ONCE, fits inside ADR-0069's comfortable band with room to
  // spare. Defined once PER ISLAND it would not: a dozen islands is five figures. That
  // asymmetry is the whole argument for define-once-and-reference.
  const total = cost.reduce((n, c) => n + c.nodes, 0);
  assert.ok(total < 3000, `the kit totals ${total} nodes — one shared copy no longer fits ADR-0069's band`);
  assert.ok(total * 12 > 10_000, `at ${total} nodes the kit is cheap enough to inline per island; the reference rule would need re-arguing`);
});

test('a pierced wall bakes as one even-odd path, not as a patch over a hole', () => {
  const model = mushroomDwelling();
  const baked = bakeBuilding(model, { showGround: false });
  const compound = baked.nodes.filter((n) => n.el === 'path' && n.fillRule === 'evenodd');
  assert.ok(compound.length > 0, 'the mushroom has openings; none baked as a compound path');
});

test('the receipt still reaches the SVG caller unchanged', () => {
  const model = tieredPagoda();
  const detail = renderDetailed(model, { showGround: false });
  const baked = bakeBuilding(model, { showGround: false });
  assert.deepEqual(detail.order, baked.order);
  assert.equal(detail.polys.length, baked.polys.length);
});
