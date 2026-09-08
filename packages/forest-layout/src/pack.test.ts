// packWorld — the RULES the relocation golden cannot see.
//
// `relocation.test.ts` compares the whole map against a frozen capture, which is the strongest
// oracle this package has and catches any change to a branch the fixture's fourteen stories reach.
// It is blind in exactly one way: a rule the fixture's corpus never exercises is a rule it cannot
// witness, and a rule whose two readings agree on that corpus is one it cannot separate. This file
// is the other half — small, purpose-built corpora that put each such rule under load, and
// assertions on the RULE rather than on the number the code happens to produce.
//
// Every corpus here is built for one question. That is deliberate: a fixture grown to serve several
// stops describing any of them, and the frozen golden's corpus cannot grow at all without
// invalidating the capture that makes it a proof.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AXIAL_DIRS,
  HEX_R,
  LAND_CAMERA_ELEVATION_DEG,
  PLAN_VIEW_ELEVATION_DEG,
  axialKey,
  estRadius,
  groundFlattening,
  groundRadiusToScreenHalfHeight,
  hash,
  hexCenter,
  storyTreeReach,
  tileQuota,
  tileUnits,
} from '@storytree/forest-world';

import { packWorld, type LayoutStory } from './pack.js';
import { ISLAND_SPACING_RATIO, gapBetween, loneSwing } from './spacing.js';

const caps = (prefix: string, n: number, dependsOn: readonly string[] = []) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i + 1}`, dependsOn: i === 0 ? dependsOn : [] }));

const story = (id: string, n: number, dependsOn: readonly string[] = [], capDeps: readonly string[] = []): LayoutStory => ({
  id,
  dependsOn,
  capabilities: caps(id, n, capDeps),
});

// ---------------------------------------------------------------------------------------------
// The OPTIONS argument is genuinely optional — every read of it is guarded
// ---------------------------------------------------------------------------------------------

test('packWorld takes no options at all, and that is the same as taking empty ones', () => {
  const stories = [story('root', 3), story('leaf', 2, ['root'])];

  // Called with NOTHING. Each `opts?.…` read below is the only thing standing between this call
  // and a TypeError, so a suite that always passes an object cannot tell the guard from its absence.
  const bare = packWorld(stories);
  assert.equal(bare.territories.length, 2);

  const empty = packWorld(stories, {});
  assert.deepEqual(JSON.parse(JSON.stringify(bare)), JSON.parse(JSON.stringify(empty)));

  // …and the four defaults it falls back to are the SHIPPED ones, not merely "something".
  const explicit = packWorld(stories, {
    plantsScatter: false,
    spacing: { ratio: ISLAND_SPACING_RATIO },
    carriedIcons: new Map(),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(bare)), JSON.parse(JSON.stringify(explicit)));
  assert.ok(bare.territories.every((t) => t.stamps.length === 0), 'no icons carried by default');
});

// ---------------------------------------------------------------------------------------------
// A forest with NO roads — the branch that returns an empty network without running the router
// ---------------------------------------------------------------------------------------------

test('a corpus with no edges yields the empty trail network, fully formed', () => {
  const stories = [story('alpha', 2), story('beta', 3), story('gamma', 1)];
  const world = packWorld(stories);

  // The SHAPE is the assertion, not just "no segments": the short-circuit builds this object by
  // hand, so each of its four fields must be a real empty array a consumer can iterate. A caller
  // reading `trails.dropped.length` must not meet `undefined` on the very map that drops nothing.
  assert.deepEqual(world.trails, { segments: [], edges: [], caves: [], dropped: [] });
  for (const k of ['segments', 'edges', 'caves', 'dropped'] as const) {
    assert.ok(Array.isArray(world.trails[k]), `${k} must be an array`);
    assert.equal(world.trails[k].length, 0, `${k} must be empty`);
  }

  // And the islands are still laid out — no edges is a forest, not an error.
  assert.deepEqual(world.territories.map((t) => t.story.id).sort(), ['alpha', 'beta', 'gamma']);
});

// ---------------------------------------------------------------------------------------------
// The ROW TIE-BREAK — two islands whose dependency barycentres are identical
// ---------------------------------------------------------------------------------------------

test('two islands with the SAME barycentre order by the id hash, not by input order', () => {
  // Both dependents hang off the one root, so `baryOf` gives them the identical number and the
  // comparator falls through to `(hash(a) % 997) - (hash(b) % 997)`. Without that fallthrough the
  // row order would be whatever the input happened to be, which is the thing being pinned.
  const stories = [story('root', 4), story('sibling-one', 2, ['root']), story('sibling-two', 2, ['root'])];
  const world = packWorld(stories);

  const rank1 = world.territories.filter((t) => t.story.id !== 'root');
  assert.equal(rank1.length, 2);
  const [left, right] = [...rank1].sort((a, b) => a.centroid.x - b.centroid.x);
  assert.ok(left && right);

  // The RULE: the smaller `hash(id) % 997` sits to the left. Asserted against `hash` itself rather
  // than against the ids this corpus happens to produce, so it survives a rename of either story.
  assert.ok(
    hash(left.story.id) % 997 < hash(right.story.id) % 997,
    `expected ${left.story.id} (${hash(left.story.id) % 997}) left of ${right.story.id} (${hash(right.story.id) % 997})`,
  );

  // …and reversing the input does not reverse the map: the tie-break is a function of the ids.
  const reversed = packWorld([stories[0]!, stories[2]!, stories[1]!]);
  const order = (w: typeof world) =>
    w.territories.filter((t) => t.story.id !== 'root').sort((a, b) => a.centroid.x - b.centroid.x).map((t) => t.story.id);
  assert.deepEqual(order(reversed), order(world));
});

// ---------------------------------------------------------------------------------------------
// The LONE-ISLAND SWING — and the foundation row's exemption from it
// ---------------------------------------------------------------------------------------------

test('a lone island swings off-centre — except on the foundation row, which never swings', () => {
  // One story per rank, three ranks. Ranks 1 and 2 are each a lone island and swing to alternating
  // sides; rank 0 is ALSO alone and must NOT swing, because the whole forest is centred on it.
  const stories = [story('base', 3), story('mid', 3, ['base']), story('top', 3, ['mid'])];
  const world = packWorld(stories);
  const at = (id: string) => world.territories.find((t) => t.story.id === id)!;

  const swing = loneSwing(estRadius(tileQuota(3)), ISLAND_SPACING_RATIO);
  const jitter = 30; // the seed's own ±, plus one lattice snap

  assert.ok(
    Math.abs(at('base').centroid.x) < swing + jitter,
    `the foundation row must stay centred, saw x=${at('base').centroid.x} against a swing of ${swing}`,
  );
  // Ranks 1 and 2 swing to OPPOSITE sides — the alternation is what keeps the roads diagonal
  // instead of stacking every one of them into a single vertical corridor.
  assert.ok(at('mid').centroid.x > 0, `rank 1 swings positive, saw ${at('mid').centroid.x}`);
  assert.ok(at('top').centroid.x < 0, `rank 2 swings negative, saw ${at('top').centroid.x}`);
});

// ---------------------------------------------------------------------------------------------
// The STAMP FAN — sides alternate, and each PAIR of stamps steps further out
// ---------------------------------------------------------------------------------------------

test('carried icons fan to alternating sides and step outward every second icon', () => {
  // THREE icons, which the golden's corpus cannot reach: its busiest island carries two, and with
  // only two the side alternation and the per-tier radius step are both indistinguishable from
  // constants. The third icon is what separates them.
  // The host is large on purpose: the fan walks each stamp INWARD until it stands on owned
  // land, so on a small island the walk claws a tier-1 stamp back past its tier-0 neighbour and the
  // step this test is about is hidden by a keep-out it has nothing to do with (measured: at twelve
  // capabilities the fourth stamp lands at 15.1 against the second's 20.1).
  const stories = [story('host', 25), story('other', 2, ['host'])];
  const world = packWorld(stories, {
    carriedIcons: new Map([['host', ['ic-a', 'ic-b', 'ic-c', 'ic-d']]]),
  });
  const host = world.territories.find((t) => t.story.id === 'host')!;
  assert.deepEqual(host.stamps.map((s) => s.icon), ['ic-a', 'ic-b', 'ic-c', 'ic-d']);

  const dx = host.stamps.map((s) => s.spot.x - host.treeSpot.x);
  // Sides alternate: even index left of the trunk, odd index right.
  assert.ok(dx[0]! < 0 && dx[2]! < 0, `even icons sit left, saw ${dx[0]} and ${dx[2]}`);
  assert.ok(dx[1]! > 0 && dx[3]! > 0, `odd icons sit right, saw ${dx[1]} and ${dx[3]}`);
  // Each side-PAIR steps further from the trunk, so a third and fourth icon never land on the
  // first two — the tier is `floor(index / 2)` and it must actually widen the offset.
  // …by a step of EXACTLY one tier's worth. "Further out" alone is too weak a claim: a step of a
  // few hundredths of a unit also satisfies it while putting the third icon on top of the first.
  const STEP_X = tileUnits(26);
  assert.ok(
    Math.abs(Math.abs(dx[2]!) - Math.abs(dx[0]!) - STEP_X) < 1e-6,
    `tier 1 steps out by ${STEP_X}, saw ${Math.abs(dx[2]!) - Math.abs(dx[0]!)}`,
  );
  assert.ok(
    Math.abs(Math.abs(dx[3]!) - Math.abs(dx[1]!) - STEP_X) < 1e-6,
    `tier 1 steps out by ${STEP_X}, saw ${Math.abs(dx[3]!) - Math.abs(dx[1]!)}`,
  );
  // …and each tier sits LOWER by its own step, a touch further in front of the trunk base.
  const dy = host.stamps.map((s) => s.spot.y - host.treeSpot.y);
  const STEP_Y = groundRadiusToScreenHalfHeight(tileUnits(6)) / groundRadiusToScreenHalfHeight(1);
  assert.ok(Math.abs(dy[2]! - dy[0]! - STEP_Y) < 1e-6, `tier 1 sits ${STEP_Y} lower, saw ${dy[2]! - dy[0]!}`);
  assert.ok(Math.abs(dy[3]! - dy[1]! - STEP_Y) < 1e-6, `tier 1 sits ${STEP_Y} lower, saw ${dy[3]! - dy[1]!}`);
});

// ---------------------------------------------------------------------------------------------
// THE MOAT — no two islands' tiles may ever touch (ADR-0528 D5)
// ---------------------------------------------------------------------------------------------

test('however tightly packed, no two islands hold adjacent tiles', () => {
  // ⚠ THIS CORPUS IS NOT DECORATIVE — IT WAS SEARCHED FOR, and most crowded forests will not do.
  // The moat has TWO belts: the seed growth FLOOR (`ringsOf + ringsOf + 1 + MOAT_HEXES`), and the
  // grower's own refusal to claim a hex adjacent to foreign soil. On nearly every corpus the floor
  // alone already holds the invariant, which leaves the refusal redundant and therefore
  // unwitnessable — a 240-arrangement sweep run with the refusal REMOVED found adjacent tiles in
  // only a handful. This is one of them, at the tightest rung: without the refusal, THREE pairs of
  // these islands touch. Ten islands, quotas from 1 to 14, three roots.
  //
  // ⚠ AND IT IS SENSITIVE TO THE IDS, not just the shape — every jitter here is hashed from the
  // story id, so renaming `i0` re-rolls the whole layout and the crowding evaporates. An earlier
  // draft of this test lost its teeth exactly that way. If it ever stops binding, re-run the search
  // rather than nudging the quotas.
  const stories = [
    story('i0', 12),
    story('i1', 5),
    story('i2', 1),
    story('i3', 12, ['i0']),
    story('i4', 13, ['i1']),
    story('i5', 7, ['i2']),
    story('i6', 1, ['i0']),
    story('i7', 11, ['i1']),
    story('i8', 14, ['i2']),
    story('i9', 7, ['i0']),
  ];
  const world = packWorld(stories, { spacing: { ratio: 0 } });

  const owner = new Map<string, number>();
  world.territories.forEach((t, i) => {
    for (const h of t.tiles) owner.set(axialKey(h), i);
  });
  assert.ok(owner.size >= 70, `expected a crowded forest, saw ${owner.size} tiles`);

  let touching = 0;
  for (const [key, mine] of owner) {
    const parts = key.split(',');
    const h = { q: Number(parts[0]), r: Number(parts[1]) };
    for (const d of AXIAL_DIRS) {
      const theirs = owner.get(axialKey({ q: h.q + d.q, r: h.r + d.r }));
      if (theirs !== undefined && theirs !== mine) touching += 1;
    }
  }
  // ONE hex of water is the smallest separation the lattice can express, and the 3D map needs it:
  // an island is drawn a little larger than its tiles, so two islands whose TILES touch overlap in
  // 3D. This is the invariant the grower's `foreignAdjacent` refusal exists to hold.
  assert.equal(touching, 0, `${touching} adjacent tile pair(s) across island boundaries`);

  // Every island still got its full quota — the moat must cost water, never land.
  for (const t of world.territories) {
    assert.equal(t.tiles.length, tileQuota(t.story.capabilities.length), `${t.story.id} short of quota`);
  }
});

// ---------------------------------------------------------------------------------------------
// THE FRAME — the top edge clears the tallest thing in the world, whichever it is
// ---------------------------------------------------------------------------------------------

test('the frame clears the topmost tile by its PROJECTED half-height, not its ground radius', () => {
  // ONE very large island, because that is what it takes to make the top edge TILE-bound. On an
  // ordinary corpus the story tree always reaches higher than the coast, so the tile term never
  // binds and this branch is unwitnessable (measured: three one-capability islands give a tile top
  // of -83.25 against a tree top of -96.20; two hundred capabilities invert it to -242.17 against
  // -222.07). Which is the whole reason this test exists apart from the golden's corpus.
  const world = packWorld([story('huge', 200)]);

  const centres = [
    ...world.drawTiles.map((t) => hexCenter(t.h)),
    ...world.empties.map((e) => hexCenter(e)),
  ];
  const halfHeight = groundRadiusToScreenHalfHeight(HEX_R);
  const tileTop = Math.min(...centres.map((p) => p.y)) - halfHeight;
  const treeTop = Math.min(
    ...world.territories.map((t) => t.treeSpot.y - storyTreeReach(t.story.capabilities.length)),
  );
  assert.ok(tileTop < treeTop, `this corpus must be tile-bound at the top (${tileTop} vs ${treeTop})`);

  // A cell's PROJECTED half-height is what it actually occupies on screen; its ground radius is
  // almost three times larger at this camera. Using the ground radius would open the frame; using
  // the wrong SIGN would crop the top by twice the half-height.
  assert.ok(halfHeight < HEX_R / 2, `the camera must foreshorten (${halfHeight} vs ${HEX_R})`);

  // `offset.y` is what places the world in the frame, so the topmost tile's own top edge lands
  // exactly one MARGIN below the frame's top — and that margin is the SAME whichever quantity was
  // topmost, which is what makes it a rule rather than a fudge for this corpus.
  const marginAbove = tileTop + world.offset.y;
  assert.ok(marginAbove > 0, `the top edge must sit inside the frame, saw ${marginAbove}`);
  const treeBoundWorld = packWorld([story('a', 1), story('b', 1, ['a'])]);
  const treeTopThere = Math.min(
    ...treeBoundWorld.territories.map((t) => t.treeSpot.y - storyTreeReach(t.story.capabilities.length)),
  );
  assert.ok(
    Math.abs(marginAbove - (treeTopThere + treeBoundWorld.offset.y)) < 1e-9,
    `the same margin must sit above whichever quantity is topmost: ${marginAbove} vs ${treeTopThere + treeBoundWorld.offset.y}`,
  );
});

// ---------------------------------------------------------------------------------------------
// THE GAP RULE reaches the map — a wider ratio actually separates two neighbours
// ---------------------------------------------------------------------------------------------

test('the derived gap widens the forest, and the legacy triple overrides it', () => {
  const stories = [story('l', 4), story('r', 4), story('up', 2, ['l', 'r'])];
  const tight = packWorld(stories, { spacing: { ratio: 0 } });
  const loose = packWorld(stories, { spacing: { ratio: 1.5 } });
  assert.ok(loose.width > tight.width, `a wider ratio must widen the map, ${loose.width} vs ${tight.width}`);

  // `legacy` WINS over `ratio` when both are given — a control arm that silently took the ratio
  // would be comparing the ladder against one of its own rungs.
  const legacyOnly = packWorld(stories, { spacing: { legacy: { rankGap: 40, islandGap: 60, rankSwing: 140 } } });
  const legacyPlusRatio = packWorld(stories, {
    spacing: { ratio: 1.5, legacy: { rankGap: 40, islandGap: 60, rankSwing: 140 } },
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(legacyPlusRatio)),
    JSON.parse(JSON.stringify(legacyOnly)),
    'the legacy triple must ignore the ratio beside it',
  );
  // And the gap rule is the one in `spacing.ts`, not a second copy: two same-size neighbours are
  // separated by `ratio × radius`, which is what makes the ladder a dial rather than a guess.
  assert.equal(gapBetween(estRadius(tileQuota(4)), estRadius(tileQuota(4)), 0), 0);
});

// ---------------------------------------------------------------------------------------------
// THE ROAD'S OWN LABEL — a derived edge names every capability pair that implies it
// ---------------------------------------------------------------------------------------------

test("a road implied by SEVERAL capability edges lists them all, comma-separated", () => {
  // A story-level road can be implied by more than one capability dependency, and the road's title
  // is where that trace survives. With one implied pair the separator is unused, so a corpus that
  // never doubles up cannot tell `', '` from `''` — and a title reading "a → xb → y" instead of
  // "a → x, b → y" is a tooltip nobody can parse.
  const provider: LayoutStory = {
    id: 'provider',
    dependsOn: [],
    capabilities: [{ id: 'p-one', dependsOn: [] }, { id: 'p-two', dependsOn: [] }],
  };
  const consumer: LayoutStory = {
    id: 'consumer',
    dependsOn: [],
    capabilities: [
      { id: 'c-one', dependsOn: ['p-one'] },
      { id: 'c-two', dependsOn: ['p-two'] },
    ],
  };
  const world = packWorld([provider, consumer]);

  const edge = world.trails.edges.find((e) => e.from === 'provider' && e.to === 'consumer');
  assert.ok(edge, `expected a derived road, saw ${JSON.stringify(world.trails.edges.map((e) => [e.from, e.to]))}`);
  assert.equal(edge.title, 'consumer depends on provider (via c-one → p-one, c-two → p-two)');
  // Belt and braces on the separator itself, so the assertion above cannot be satisfied by a title
  // that happens to run the two pairs together.
  assert.ok(edge.title.includes('p-one, c-two'), `the via list must be comma-separated: ${edge.title}`);
});

// ---------------------------------------------------------------------------------------------
// THE NAMEPLATE'S TWO BASELINES — a screen drawing and the ground line it stands on
// ---------------------------------------------------------------------------------------------

test('label-baselines-are-twins: groundLabelY projects onto labelY at the declared camera', () => {
  // ADR-0545 gave the nameplate a GROUND baseline so the marker scatter and the garden could ask
  // "is this spot in front of the plate?" on the ground instead of on the screen. `labelY` stays
  // beside it because this package's own React renderer draws at the declared camera and wants
  // screen — the same two-consumers arrangement as `radius` / `groundRadius`.
  //
  // The two are computed INDEPENDENTLY (one from projected tile centres, one from plan-view ones),
  // which is what makes this assertion worth making: it is the only thing standing between the
  // studio's plate and a silent 3x drop, and a twin nobody checks is how two spaces get mixed.
  const world = packWorld([story('alpha', 6), story('beta', 3, ['alpha'])]);
  assert.ok(world.territories.length >= 2, 'the corpus must lay out both islands');

  for (const t of world.territories) {
    assert.ok(
      Math.abs(groundRadiusToScreenHalfHeight(t.groundLabelY) - t.labelY) < 1e-9,
      `${t.story.id}: the ground baseline ${t.groundLabelY.toFixed(4)} projects to ` +
        `${groundRadiusToScreenHalfHeight(t.groundLabelY).toFixed(4)}, but the plate is drawn at ` +
        `${t.labelY.toFixed(4)} — the twins have drifted`,
    );
    // And they are genuinely two numbers rather than one aliased twice: the ground line is FARTHER
    // from the horizon than its own projection by the camera's foreshortening, so a copy-paste that
    // returned `labelY` for both fails here even though the assertion above would still pass in plan
    // view. Stated on the MAGNITUDE, because an island north of the world origin carries a negative
    // baseline and "further south" is not the same claim as "further from zero" there.
    assert.ok(Math.abs(t.labelY) > 1, `${t.story.id}: a baseline at zero would make the next line vacuous`);
    assert.ok(
      Math.abs(t.groundLabelY) > Math.abs(t.labelY),
      `${t.story.id}: the ground baseline (${t.groundLabelY.toFixed(2)}) must be farther out than ` +
        `its projection (${t.labelY.toFixed(2)}) at any camera below plan view`,
    );
    // The plate stands SOUTH of the island's own southernmost tile centre, on the ground — which is
    // what "in front of the island" means once it is a ground question rather than a screen one.
    const southmost = Math.max(
      ...t.tiles.map((h) => hexCenter(h, { elevationDeg: 90 }).y),
      t.groundCentroid.y,
    );
    assert.ok(
      t.groundLabelY > southmost + HEX_R,
      `${t.story.id}: the plate at ${t.groundLabelY.toFixed(2)} sits inside the island, whose ` +
        `southern ground edge is ${(southmost + HEX_R).toFixed(2)}`,
    );
  }
});

// ---------------------------------------------------------------------------------------------
// THE CAMERA IS AN OPTION — ADR-0527 D1 item 1
//
// ⚠ THE TWO HALVES ARE ASSERTED SEPARATELY BECAUSE THEY CAN FAIL SEPARATELY, and only one of them
// is visible to a caller. A threading that moved nothing would pass every "byte-unchanged" check
// ever written and deliver no second arm; a threading that moved the GROUND twins would deliver an
// arm and quietly re-decide which capability owns which soil.
// ---------------------------------------------------------------------------------------------

/** A corpus with enough islands to put every emission site under load — per-territory centres, the
 *  tree spot, the garden ring, the nameplate baseline and the scene bounds. */
const cameraCorpus = (): LayoutStory[] => [
  story('alpha', 5),
  story('beta', 3, ['alpha']),
  story('gamma', 7, ['alpha']),
  story('delta', 2, ['beta']),
];

test('the DEFAULT camera is byte-identical to the bare call — every current caller is unmoved', () => {
  const bare = packWorld(cameraCorpus());
  const declared = packWorld(cameraCorpus(), { elevationDeg: LAND_CAMERA_ELEVATION_DEG });
  // The WHOLE world, not a field of it: the option reaches five emission sites and a per-field
  // check would pass while a sixth moved.
  assert.deepEqual(declared, bare);
});

test('asking for PLAN VIEW un-flattens the SCREEN half — the second arm the registration work needs', () => {
  const shipped = packWorld(cameraCorpus());
  const plan = packWorld(cameraCorpus(), { elevationDeg: PLAN_VIEW_ELEVATION_DEG });
  const flat = groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  // Non-vacuity: the shipped camera really does foreshorten, so "un-flattened" is a difference and
  // not a tautology. A test written against a camera that happened to be plan view would pass
  // whatever the threading did.
  assert.ok(flat < 0.9, `the shipped camera must foreshorten for this test to mean anything, got ${flat}`);

  for (const [i, t] of plan.territories.entries()) {
    const was = shipped.territories[i];
    assert.ok(was !== undefined, 'the same territories in the same order');
    // x is UNTOUCHED by either camera — the q axis runs across the screen — so a threading that
    // scaled both axes, or the wrong one, is caught here rather than looking like success.
    assert.equal(t.treeSpot.x, was.treeSpot.x);
    // ⚠ AND y IS THE UN-PROJECTION EXACTLY, not merely "bigger": `hexCenter` projects by scaling y
    // through `groundFlattening`, so the plan-view spot must be the shipped one divided by it.
    assert.ok(Math.abs(t.treeSpot.y - was.treeSpot.y / flat) < 1e-9, `${t.treeSpot.y} vs ${was.treeSpot.y / flat}`);
    // The screen tree spot at plan view IS the ground twin — the two spaces coincide when the
    // camera is the plan view, which is what makes this option the right seam rather than a dial.
    assert.ok(Math.abs(t.treeSpot.y - t.groundTreeSpot.y) < 1e-9, 'at plan view the two spaces meet');
  }
});

test('the GROUND half does NOT move with the camera — the layout is re-projected, never re-decided', () => {
  const shipped = packWorld(cameraCorpus());
  const plan = packWorld(cameraCorpus(), { elevationDeg: PLAN_VIEW_ELEVATION_DEG });
  for (const [i, t] of plan.territories.entries()) {
    const was = shipped.territories[i];
    assert.ok(was !== undefined);
    // Which tiles the story grew onto, and where they sit on the land.
    assert.deepEqual(t.tiles, was.tiles);
    assert.deepEqual(t.groundTreeSpot, was.groundTreeSpot);
    assert.deepEqual(t.groundCentroid, was.groundCentroid);
    assert.equal(t.groundRadius, was.groundRadius);
    // And which capability owns which soil — the thing a camera must never decide.
    assert.deepEqual(
      t.caps.map((c) => [c.cap.id, c.groundSpot] as const),
      was.caps.map((c) => [c.cap.id, c.groundSpot] as const),
    );
  }
  // The coast leaves this packer in ground space (ADR-0527 D1), so it is camera-free by
  // construction — asserted rather than assumed, since "by construction" is what the bare
  // `hexCenter` sites also claimed to be.
  assert.deepEqual(plan.empties, shipped.empties);
});
