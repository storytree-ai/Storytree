// skirt-rock-separation.test.ts — THE OBLIGATION THE SKIRT'S ROCK INHERITS BY BEING FAMILY-LESS.
//
// ⚠⚠ WHY THIS FILE IS IN `harness/` AND NOT BESIDE THE MODULE IT GUARDS. The rock lives in
// `src/stepped-skirt.ts`; the STATUS tokens it must not collide with live in `ForestWorldCanvas.tsx`,
// which imports React and three and cannot be pulled into a `node:test` file. `shipped-baseline.ts`
// already parses that map off the shipped file's own source as `SHIPPED_GROUND_COLOUR` — so the
// comparison can only be made here, against the transcription the gate already holds to the source.
//
// THE OBLIGATION ITSELF is `prop-tokens.test.ts`'s, applied to a new family-less token: no colour a
// decoration can deliver may be a colour a status family delivers (ADR-0406 D4). A cliff that
// delivered `unhealthy`'s exact pixel would be an ornament indistinguishable from a status read —
// the one thing the owner's own settlement still forbids, because his test is that the island's
// state stays READABLE.
//
// ⚠ THE OWNER MOVED THE FENCE AND DID NOT REMOVE IT. "Every ground colour is a report" is retired;
// "can I tell what state this island is in" replaced it. An exact collision is the one failure that
// answers that question NO by construction rather than by judgement, so it is the half of his test
// that a machine can hold — and the only half. The rest is the picture, and the picture is
// `docs/research/chapter2-shipped-skirt-2026-09-01/`.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SKIRT_ROCK,
  SKIRT_ROCK_LIT,
  SKIRT_ROCK_SHADED,
  SKIRT_ROCK_SHADED_SUNK,
  darkestShadedRock,
  lumaOf,
  mappedShadedRock,
  rimEdgeKeys,
  shadeBelowHalfDepth,
  shadeBelowLadderFloor,
  shadedRockAboveSea,
} from '../src/stepped-skirt.js';
import { SHIPPED_COAST, clipToCoast, edgeKey } from '../src/coast-clip.js';
import { SHIPPED_SHORE } from '../src/shore-fall.js';
import { shoreArmRingPlan } from '../src/shore-ring.js';
import { crowdCells, crowdSize } from './shipped-crowd-scene.js';
import { SHADE_LEVELS, deliveredForLevel, parseHex, toHex, type Rgb255 } from '../src/shade-ladder.js';
import { SHIPPED_GROUND_COLOUR, SHIPPED_LIGHTING } from './shipped-baseline.js';
import { SHADOW_RUNG } from './shadow-ladder.js';
import { VISIBLE_DELTA } from './visible-delta.js';
import {
  ARM_CONTROL,
  CONTROL_ARM,
  SKIRT_ARMS,
  SKIRT_GROUND_TOKENS,
  SKIRT_ROCK_LIT_ROW,
  SKIRT_ROCK_ROW,
  SKIRT_ROCK_SHADED_ROW,
  armSkirt,
  type SkirtArm,
} from './shipped-skirt-scene.js';

/**
 * EVERY ROCK THIS MAP OR THIS PAGE CAN DRAW, and each is held to the whole obligation below.
 *
 * ⚠⚠ THREE, NOT ONE, SINCE 2026-09-01 — and the median is still here because it is still DRAWN:
 * it is the `rock` arm's token, i.e. the control the two-token cliff is measured against, so
 * retiring it from this check would stop guarding a colour the comparison page still paints. What
 * SHIPS is the pair.
 */
const ROCKS: readonly (readonly [string, string])[] = [
  ['the LIT rock (ships)', SKIRT_ROCK_LIT],
  ['the SHADED rock (ships)', SKIRT_ROCK_SHADED],
  ['the MEDIAN rock (the comparison page’s `rock` arm)', SKIRT_ROCK],
];

/** Every pixel a token can deliver on the shipped ladder. */
function ramp(token: string): Rgb255[] {
  return SHADE_LEVELS.map((level) => deliveredForLevel(token, level));
}

/** Rec.709 luma, the axis the research judged the island's dark anchor on. */
const luma = (c: Rgb255): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** Euclidean distance in 8-bit RGB. Crude as a perceptual model and deliberately so: it is used
 *  here only to REPORT how much clearance the rock has, never to pass or fail. The pass/fail is the
 *  exact collision below, which needs no model at all. */
const rgbDistance = (a: Rgb255, b: Rgb255): number =>
  Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

test('⚠ NO ROCK LEDGE CAN EVER DELIVER A COLOUR A STATUS FAMILY DELIVERS', () => {
  const status = new Map<string, string>();
  for (const [name, token] of SHIPPED_GROUND_COLOUR) {
    for (const c of ramp(token)) status.set(toHex(c), `${name} (${token})`);
  }
  const collisions: string[] = [];
  for (const [what, token] of ROCKS) {
    for (const c of ramp(token)) {
      const hit = status.get(toHex(c));
      if (hit !== undefined) collisions.push(`${what} delivers ${toHex(c)}, which is ${hit}`);
    }
  }
  assert.deepEqual(
    collisions,
    [],
    'A cliff that delivers a status colour makes the island’s edge indistinguishable from a status ' +
      'read. Move the ROCK, never a status token — the statuses are decided (ADR-0462) and the rocks ' +
      'are measurements that may be re-taken.',
  );
});

test('⚠ THE THREE ROCKS ARE DISTINCT HEXES — the ramp table indexes them by identity', () => {
  // `shipped-skirt-scene.ts` resolves each rock's ramp row with `indexOf`, which is exact only if
  // no two rocks share a hex. Two equal tokens would silently give both the FIRST one's row, so an
  // arm asking for the shaded rock would be handed the lit one's colour — and the page would
  // report a null result for a component it never drew.
  const hexes = ROCKS.map(([, token]) => token);
  assert.equal(new Set(hexes).size, hexes.length, `two rocks share a hex: ${hexes.join(', ')}`);
});

test('every rock’s nearest status neighbour is named and its clearance is reported', () => {
  for (const [what, token] of ROCKS) {
    let nearest = { status: '', d: Number.POSITIVE_INFINITY, rock: '', status_: '' };
    for (const [name, statusToken] of SHIPPED_GROUND_COLOUR) {
      for (const s of ramp(statusToken)) {
        for (const r of ramp(token)) {
          const d = rgbDistance(r, s);
          if (d < nearest.d) nearest = { status: name, d, rock: toHex(r), status_: toHex(s) };
        }
      }
    }
    // ⚠ THIS ASSERTS A FLOOR, NOT A TARGET, and the floor is low on purpose. Every rock here is
    // a statistic of the APPROVED RENDER'S OWN skirt pixels rather than a hue chosen for distance,
    // so a tight bar would be this test overruling the picture the owner stamped. What it forbids
    // is a rock drifting to within a rounding of a status — which no measurement would ever
    // produce and a careless edit would.
    assert.ok(
      nearest.d > 8,
      `${what}'s nearest status pixel is ${nearest.status} at distance ${nearest.d.toFixed(1)} ` +
        `(${nearest.rock} vs ${nearest.status_})`,
    );
    console.log(
      `skirt rock clearance: ${what} — nearest status is ${nearest.status} at RGB distance ` +
        `${nearest.d.toFixed(1)} (${nearest.rock} vs ${nearest.status_})`,
    );
  }
});

test('⚠ THE PAIR CLEARS THE STATUSES BY MORE THAN THE SINGLE ROCK EVER DID', () => {
  // ⚠⚠ THIS IS THE HALF OF THE OWNER'S OUTCOME TEST A MACHINE CAN HOLD, ASKED OF THE
  // CHANGE RATHER THAN OF THE STATE. A second family-less colour reads at first glance as a second
  // chance to be mistaken for a status. It is the opposite here, and the reason is arithmetic: the
  // median rock sits INSIDE `unhealthy`'s own luma band (62.1–77.1 against 67.1–83.9),
  // which is why the skirt's evidence page recorded its 9.0 clearance as "the one place this is
  // tight". Splitting the mask at its own median moves BOTH halves out of that band. If a later
  // edit ever narrows the pair back toward the single rock's clearance, this fails and says so.
  const clearance = (token: string): number => {
    let best = Number.POSITIVE_INFINITY;
    for (const [, statusToken] of SHIPPED_GROUND_COLOUR) {
      for (const s of ramp(statusToken)) {
        for (const r of ramp(token)) best = Math.min(best, rgbDistance(r, s));
      }
    }
    return best;
  };
  const median = clearance(SKIRT_ROCK);
  for (const token of [SKIRT_ROCK_LIT, SKIRT_ROCK_SHADED]) {
    assert.ok(
      clearance(token) > median,
      `${token} clears the statuses by ${clearance(token).toFixed(1)}, no better than the single ` +
        `rock's ${median.toFixed(1)} — the pair is meant to buy separation, not spend it`,
    );
  }
  console.log(
    `skirt pair clearance: single ${median.toFixed(1)} → lit ` +
      `${clearance(SKIRT_ROCK_LIT).toFixed(1)} / shaded ${clearance(SKIRT_ROCK_SHADED).toFixed(1)}`,
  );
});

test('the rock is DARKER than every status the map can draw — it is the island’s anchor', () => {
  // The research's finding in one assertion: the cliff supplies the island's darkest value, and a
  // pale skirt spends it. If a status token were ever authored darker than the rock, the cliff
  // would stop being the anchor and this component's whole justification would have moved.
  //
  // ⚠ THE ANCHOR IS THE DARKEST PIXEL THE CLIFF CAN DELIVER, so it is the minimum over the
  // WHOLE pair rather than over one token. The LIT rock is deliberately NOT the anchor — it is
  // lighter than `unhealthy` — and asking each token separately would fail on a true statement.
  const darkestRock = Math.min(...ROCKS.flatMap(([, t]) => ramp(t).map(luma)));
  for (const [name, token] of SHIPPED_GROUND_COLOUR) {
    const darkestStatus = Math.min(...ramp(token).map(luma));
    if (name === 'unhealthy') {
      // ⚠ `unhealthy` IS THE CLOSE ONE AND IT IS NAMED RATHER THAN LUMPED IN. ADR-0470 settled it
      // as a charred near-black, so it is the one family the rock cannot be much darker than. The
      // clearance is asserted as a real gap rather than as an ordering, so a token edit that
      // narrowed it to nothing fails here instead of on the map.
      assert.ok(
        darkestStatus - darkestRock > 3,
        `unhealthy's darkest pixel (${darkestStatus.toFixed(1)}) sits within 3 luma of the rock's ` +
          `(${darkestRock.toFixed(1)}) — the cliff and a dead island's ground now read alike`,
      );
      continue;
    }
    assert.ok(
      darkestStatus > darkestRock,
      `${name} can deliver a pixel darker than the rock, so the cliff is not the island's anchor`,
    );
  }
});

test('the rocks are APPENDED rows, so no status was renumbered to make room for them', () => {
  // ⚠ THE CLAIM IS "NO STATUS MOVED", NOT "THE ROCK IS LAST". It was spelled as the second when
  // there was one rock and the two were the same sentence; they are not the same sentence with
  // three. Row `i` is what a vertex carrying `statusIndex === i` wears, so a status that changed
  // row paints every parcel a DIFFERENT status's colour — which is the failure this guards, and it
  // is indifferent to how many family-less tokens sit past the end.
  assert.equal(SKIRT_GROUND_TOKENS[SKIRT_ROCK_ROW], SKIRT_ROCK);
  assert.equal(SKIRT_GROUND_TOKENS[SKIRT_ROCK_LIT_ROW], SKIRT_ROCK_LIT);
  assert.equal(SKIRT_GROUND_TOKENS[SKIRT_ROCK_SHADED_ROW], SKIRT_ROCK_SHADED);
  const statuses = [...SHIPPED_GROUND_COLOUR.values()];
  for (let i = 0; i < statuses.length; i += 1) {
    assert.equal(SKIRT_GROUND_TOKENS[i], statuses[i], `status row ${i} moved`);
  }
  // and every rock sits PAST the statuses rather than among them
  for (const row of [SKIRT_ROCK_ROW, SKIRT_ROCK_LIT_ROW, SKIRT_ROCK_SHADED_ROW]) {
    assert.ok(row >= statuses.length, `a rock took row ${row}, which a status owns`);
  }
});

// ─────────────────────────────────────────────────
// ⚠⚠ THE SECOND OBLIGATION — AGAINST THE SEA, NOT AGAINST THE STATUSES.
//
// Every test above asks whether a rock can be mistaken for a STATUS. None of them asks whether it
// can be told from the WATER behind it, and that is the failure that shipped (PR #1792): the shaded
// rock's lower quartile was lifted off the approved render — an RGBA image 53.8% transparent, whose
// dark values never sat against any sea — and dropped onto this scene's `#101418`. Delivered at the
// ladder's floor it was `rgb(23,26,30)` against a background of `rgb(16,20,24)`: a largest-channel
// move of 7, twelve of the cliff's eighteen pixels merged into the sea, and the cliff read 6 px tall
// where the single rock had read 18. The owner saw it by looking; no rung did, because `imageStats`
// anchors on the island's OWN pixels with the background excluded and scores a surface BETTER the
// closer it gets to vanishing (`a-metric-scored-in-isolation-rewards-invisibility`).
//
// So the fence names the background. The bar is ADR-0490 D6's own authored floor — a largest-channel
// move of more than `VISIBLE_DELTA` (20/255), the same number every comparison page credits a reader
// with seeing — applied to EVERY pixel a shipping rock can deliver: each ladder rung AND the shadow
// rung, because a colour that clears the sea at full light and merges with it in shade is a cliff
// whose lower half still disappears. It is asserted over the shipping pair and REPORTED for the
// median rock, which is the comparison page's control and not a colour the map draws.

/** The scene's own sea, as the framebuffer holds it. */
const SEA = parseHex(SHIPPED_LIGHTING.background);

/** Every level a shipping rock can be delivered at: the nine authored rungs and the shadow rung. */
const EVERY_LEVEL: readonly number[] = [...SHADE_LEVELS, SHADOW_RUNG];

/** The largest single-channel move between a delivered pixel and the sea — ADR-0490 D6's axis. */
const seaMove = (c: Rgb255): number =>
  Math.max(Math.abs(c.r - SEA.r), Math.abs(c.g - SEA.g), Math.abs(c.b - SEA.b));

test('⚠⚠ EVERY PIXEL A SHIPPING ROCK CAN DELIVER CLEARS THE SEA BY MORE THAN THE VISIBLE BAR — on every rung, the shadow rung included', () => {
  const merged: string[] = [];
  for (const [what, token] of ROCKS) {
    if (token === SKIRT_ROCK) continue; // the median is the page's control arm, reported below
    for (const level of EVERY_LEVEL) {
      const c = deliveredForLevel(token, level);
      const move = seaMove(c);
      if (move <= VISIBLE_DELTA) {
        merged.push(
          `${what} at rung ${level.toFixed(3)} delivers ${toHex(c)}, a largest-channel move of ` +
            `${move} from the sea ${toHex(SEA)} — under the ${VISIBLE_DELTA}/255 bar`,
        );
      }
    }
  }
  assert.deepEqual(
    merged,
    [],
    'A rock the sea swallows is a cliff that loses its height. Re-pick the ROCK against THIS ' +
      'scene’s background — never lift a dark value off the approved render, whose sea is not ours ' +
      '(ADR-0490 D6 is the bar; `the-cliffs-dark-base-must-read-against-the-sea` is the record).',
  );
});

test('the median rock’s own clearance from the sea is reported, so the control arm’s reading has a number beside it', () => {
  const darkest = Math.min(...EVERY_LEVEL.map((level) => seaMove(deliveredForLevel(SKIRT_ROCK, level))));
  console.log(
    `skirt rock vs sea: the MEDIAN rock's smallest largest-channel move from ${toHex(SEA)} is ` +
      `${darkest} (bar ${VISIBLE_DELTA}); shipping pair — lit ` +
      `${Math.min(...EVERY_LEVEL.map((l) => seaMove(deliveredForLevel(SKIRT_ROCK_LIT, l))))}, shaded ` +
      `${Math.min(...EVERY_LEVEL.map((l) => seaMove(deliveredForLevel(SKIRT_ROCK_SHADED, l))))}`,
  );
  // ⚠ NOT AN ASSERTION ON THE MEDIAN — it is not drawn by the map. The assertion that matters is
  // the one above, on the pair that ships; this test exists so the page's control arm carries the
  // same reading and a reader can see how far each rock sits from the water.
  assert.ok(Number.isFinite(darkest));
});

test('⚠ THE FENCE IS NOT VACUOUS: the rock the sea swallowed FAILS it on every rung, which is what it shipped as', () => {
  // A fence that the withdrawn colour would also have passed verifies nothing. `#1d2025` is kept
  // as the comparison page's `two-token-sunk` arm precisely so this can be asked of it.
  const moves = EVERY_LEVEL.map((level) => seaMove(deliveredForLevel(SKIRT_ROCK_SHADED_SUNK, level)));
  assert.ok(
    moves.every((m) => m <= VISIBLE_DELTA),
    `the sunk rock clears the sea on some rung (${moves.join(', ')}) — the fence would not have caught PR #1792`,
  );
  assert.ok(Math.max(...moves) < 14, `the sunk rock's best rung moves ${Math.max(...moves)}; the record says 13`);
});

test('⚠⚠ THE SHIPPED SHADED ROCK IS THE FENCE’S OWN FLOOR — the darkest base that clears the sea on every rung, found by search', () => {
  // The hex in `stepped-skirt.ts` is a literal so the closure machinery reads a string; this pins
  // it to the search that chose it, so a hand edit that drifts from the derivation fails by name
  // rather than shipping as taste. The bar is ADR-0490 D6's own; the levels are every rung the
  // material can deliver, the shadow rung included.
  const floorRock = darkestShadedRock(SEA, VISIBLE_DELTA, EVERY_LEVEL);
  assert.equal(
    SKIRT_ROCK_SHADED,
    floorRock.hex,
    `SKIRT_ROCK_SHADED no longer equals darkestShadedRock(sea, ${VISIBLE_DELTA}, every rung) — re-derive, ` +
      'or record a new pick in its doc comment AND here',
  );
  assert.equal(floorRock.aboveSea, 21, `the fence's floor moved to ${floorRock.aboveSea} luma above the sea`);
  // ⚠ AND THE SEARCH IS NOT VACUOUS: the rung below the floor must FAIL the fence somewhere, or
  // "darkest admissible" is just "the first rung tried"
  const below = shadedRockAboveSea(SEA, floorRock.aboveSea - 1);
  assert.ok(
    EVERY_LEVEL.some((level) => seaMove(deliveredForLevel(below, level)) <= VISIBLE_DELTA),
    `${below}, one luma under the floor, clears the sea on every rung — the search stopped early`,
  );
  // and the rung-maker it is built on does what its name says: delivered at the ladder's darkest
  // rung, the luma sits the stated distance above the water (to the rounding of one hex)
  for (const above of [21, 28.5, 36, 44]) {
    const delivered = deliveredForLevel(shadedRockAboveSea(SEA, above), SHADE_LEVELS[0]!);
    assert.ok(
      Math.abs(lumaOf(delivered) - (lumaOf(SEA) + above)) < 1.5,
      `shadedRockAboveSea(sea, ${above}) delivers luma ${lumaOf(delivered).toFixed(1)} at the floor, ` +
        `not ${(lumaOf(SEA) + above).toFixed(1)}`,
    );
  }
  // the MAPPED rung — the ladder's principled alternative, kept on the page as `two-token-mapped`
  // — keeps the quartile's own fraction of the range: 11.4% of the way from the floor to the lit
  // rock's full light
  const floor = lumaOf(SEA) + VISIBLE_DELTA;
  const ceiling = lumaOf(deliveredForLevel(SKIRT_ROCK_LIT, SHADE_LEVELS[SHADE_LEVELS.length - 1]!));
  const mapped = lumaOf(deliveredForLevel(mappedShadedRock(SEA, VISIBLE_DELTA), SHADE_LEVELS[0]!));
  const fraction = (mapped - floor) / (ceiling - floor);
  assert.ok(Math.abs(fraction - (31.7 - 20.7) / (117.6 - 20.7)) < 0.02, `the mapped rock sits ${fraction.toFixed(3)} of the way up the headroom`);
  // and it is lighter than the floor, which is what makes it a scale-back rung rather than a dead one
  assert.ok(mapped > lumaOf(deliveredForLevel(SKIRT_ROCK_SHADED, SHADE_LEVELS[0]!)));
});

test('the pair spans the range THE SEA PERMITS and no more — the approved 5.7x is unreachable here by arithmetic', () => {
  // The reachable span on this map is the lit rock at full light over the darkest pixel that
  // still clears the water. The withdrawn pair "reached" 4.5x by spending pixels below that floor.
  const litTop = lumaOf(deliveredForLevel(SKIRT_ROCK_LIT, SHADE_LEVELS[SHADE_LEVELS.length - 1]!));
  const seaFloor = lumaOf(SEA) + VISIBLE_DELTA;
  const seaSpan = litTop / seaFloor;
  const pairSpan = litTop / lumaOf(deliveredForLevel(SKIRT_ROCK_SHADED, SHADE_LEVELS[0]!));
  const ladderSpan = SHADE_LEVELS[SHADE_LEVELS.length - 1]! / SHADE_LEVELS[0]!;
  assert.ok(seaSpan < 117.6 / 20.7, 'the sea now permits the approved range — this test’s premise has moved');
  assert.ok(pairSpan <= seaSpan, `the pair spans ${pairSpan.toFixed(2)}x, past the ${seaSpan.toFixed(2)}x the sea permits — some rung is under water`);
  assert.ok(pairSpan > ladderSpan, `the pair spans ${pairSpan.toFixed(2)}x, no more than one token's ${ladderSpan.toFixed(2)}x`);
  console.log(
    `skirt pair span: ${pairSpan.toFixed(2)}x of the ${seaSpan.toFixed(2)}x this sea permits ` +
      `(approved render 5.68x; one token ${ladderSpan.toFixed(2)}x; the sunk pair ` +
      `${(litTop / lumaOf(deliveredForLevel(SKIRT_ROCK_SHADED_SUNK, SHADE_LEVELS[0]!))).toFixed(2)}x, below the floor)`,
  );
});

test('the rocks parse to the measured statistics of the approved render’s own skirt pixels', () => {
  // ⚠⚠ THIS IS THE WHOLE PROVENANCE CLAIM IN THREE LINES, and it is the one thing about these
  // tokens that cannot be re-derived from anything else in the repository. The mask is the set of
  // pixels where `land-combined-1948px.png` and `land-strata-1948px.png` differ — the same render
  // differing in NOTHING but the skirt material, so the mask IS the skirt, exactly. Over those
  // 76,297 pixels: the median is what shipped on 2026-09-01, and the two quartiles are the median
  // of its shaded half and the median of its lit half. If a later session re-takes the measurement
  // it must move these numbers here, where the claim is written down, rather than only the hexes.
  assert.deepEqual(parseHex(SKIRT_ROCK), { r: 77, g: 77, b: 79 });
  // ⚠ THE LOWER QUARTILE IS THE SUNK ROCK, NOT THE ONE THAT SHIPS. The measurement stands — it is
  // the render's own statistic — but a dark value measured against a transparent background is
  // only valid there, and the rock the map draws is that quartile RE-BASED onto our sea's headroom
  // (`mappedShadedRock`, pinned to its derivation below). The quartile keeps its pin here so the
  // provenance chain from the render to the shipped hex has no unmeasured link in it.
  assert.deepEqual(parseHex(SKIRT_ROCK_SHADED_SUNK), { r: 29, g: 32, b: 37 });
  assert.deepEqual(parseHex(SKIRT_ROCK_LIT), { r: 115, g: 114, b: 116 });
  // and they are ordered, which is what makes "lit" and "shaded" the right names for them — for
  // the quartile the render measured and for the rock that ships in its place
  assert.ok(luma(parseHex(SKIRT_ROCK_SHADED_SUNK)) < luma(parseHex(SKIRT_ROCK_SHADED)));
  assert.ok(luma(parseHex(SKIRT_ROCK_SHADED)) < luma(parseHex(SKIRT_ROCK)));
  assert.ok(luma(parseHex(SKIRT_ROCK)) < luma(parseHex(SKIRT_ROCK_LIT)));
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// AND THE ONE THAT GUARDS THE SEAM BETWEEN THIS COMPONENT AND ITS NEIGHBOUR.

test('⚠ every rim edge the geometry WALKS is a rim edge the census MARKS', () => {
  // ⚠⚠ THE FAILURE THIS FORBIDS IS SILENT AND LOOKS LIKE ART. The rim census is taken over the
  // parcels' own rings; the wall loop walks the ring `decompose` produces. Those are the same loop
  // today only because the inset ring (PR #1780) inserts its points on INTERIOR edges — it is an
  // INSET ring, inside the coast rather than on it. A decomposition that inserted a point on a RIM
  // edge would split it into two sub-edges whose keys are in neither census, so both halves would
  // silently take the FLAT wall: a length of coast with no cliff, in the middle of a cliff, which
  // reads as a modelling choice rather than as a bug.
  //
  // Measured on the shipped fixture when this was written: 864 parcel-ring edges, 970 wall-ring
  // edges (106 inserted), and 260 rim edges by BOTH routes.
  const clipped = clipToCoast(crowdCells(crowdSize('one')), SHIPPED_COAST);
  const plan = shoreArmRingPlan(clipped, SHIPPED_SHORE);
  const fromCells = rimEdgeKeys(clipped);

  const uses = new Map<string, number>();
  for (const c of clipped) {
    const wall = plan.decompose(c).wall;
    if (wall.length < 3) continue;
    for (let i = 0; i < wall.length; i += 1) {
      const k = edgeKey(wall[i]!, wall[(i + 1) % wall.length]!);
      uses.set(k, (uses.get(k) ?? 0) + 1);
    }
  }
  const fromWalls = new Set([...uses].filter(([, n]) => n === 1).map(([k]) => k));

  assert.ok(fromCells.size > 0, 'the fixture has no rim at all — the check would be vacuous');
  assert.deepEqual(
    [...fromWalls].filter((k) => !fromCells.has(k)).sort(),
    [],
    'the decomposition produced boundary edges the rim census does not know about, so that stretch ' +
      'of coast will take the flat wall while its neighbours take the cliff. Build the census over ' +
      'the WALL rings rather than over the parcels’ own rings.',
  );
  assert.equal(fromWalls.size, fromCells.size);
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// ⚠⚠ AND THE COMPARISON PAGE'S OWN INTEGRITY — the half no `src/` test can reach.
//
// `check:mutation-diff` mutates a project's `src/` only, so every line of `shipped-skirt-scene.ts`
// comes back explicitly UNPROVEN and the arm tables there are guarded by nothing at all. A
// hand-seeded sweep run when the two-token cliff landed found exactly two faults that no test
// named, and both of them turn a comparison into a null result while the page still renders and
// still prints numbers. These are those two.

test('⚠⚠ THE TWO CANDIDATE ARMS MUST USE DIFFERENT RULES, or the page compares an arm with itself', () => {
  // ⚠⚠ THE FAILURE IS SILENT AND READS AS A RESULT. `two-token-lit` and `two-token-deep` exist to
  // put two SELECTION RULES beside each other — they carry the same two rocks and differ only in
  // which ledges wear which. Pointing both at one rule leaves a page that renders, moves pixels,
  // and prints two identical rows under a heading that says they are different, which is a stronger
  // claim than a blank page and is false. Seeded by hand: the mutant SURVIVED the whole suite.
  const cells = clipToCoast(crowdCells(crowdSize('one')), SHIPPED_COAST);
  const lit = armSkirt('two-token-lit', cells);
  const deep = armSkirt('two-token-deep', cells);
  assert.notEqual(lit.isShaded, deep.isShaded, 'both candidate arms wear the same shade rule');
  // they differ in the RULE and in nothing else, which is what makes the difference attributable
  assert.deepEqual(lit.lit, deep.lit);
  assert.deepEqual(lit.shaded, deep.shaded);
  assert.equal(lit.rows, deep.rows);
  assert.equal(lit.soilLedges, deep.soilLedges);
  // and the winning arm is the rule the shipped map actually wears
  assert.equal(deep.isShaded, shadeBelowHalfDepth);
  assert.equal(lit.isShaded, shadeBelowLadderFloor);
});

test('⚠⚠ A TWO-TOKEN ARM IS READ AGAINST A ONE-TOKEN CLIFF, never against the no-cliff map', () => {
  // ⚠⚠ THE OVER-CLAIM THIS FORBIDS IS THE ARC'S OWN RECURRING ONE. An arm's denominator must
  // differ from it in exactly the thing under test. A two-token arm read against `flat` — which
  // has no cliff at all — would be credited with everything the SINGLE token already delivered,
  // reporting a second increment's worth of movement for the first one's work. Seeded by hand
  // (`ARM_CONTROL['two-token-deep'] = 'flat'`): the mutant SURVIVED.
  //
  // It is asserted as a PROPERTY rather than as a transcription of the table, so an arm added
  // later is held to it without anyone remembering to extend a list.
  const cells = clipToCoast(crowdCells(crowdSize('one')), SHIPPED_COAST);
  const isPair = (arm: SkirtArm): boolean => {
    const s = armSkirt(arm, cells);
    return s.lit.row !== s.shaded.row;
  };
  const pairs = SKIRT_ARMS.filter(isPair);
  assert.ok(pairs.length > 0, 'no arm carries two rocks — this check would be vacuous');
  for (const arm of SKIRT_ARMS) {
    const control = ARM_CONTROL[arm];
    if (arm !== CONTROL_ARM) {
      assert.notEqual(control, arm, `${arm} is its own denominator, so it can only ever read zero`);
    }
    if (!isPair(arm)) continue;
    assert.ok(!isPair(control), `${arm}'s denominator ${control} already carries two rocks`);
    const a = armSkirt(arm, cells);
    const c = armSkirt(control, cells);
    assert.equal(
      c.rows,
      a.rows,
      `${arm} is read against ${control}, which cuts ${c.rows} ledges rather than ${a.rows} — the ` +
        'difference between them is the SHAPE as well as the second token, so neither is measured',
    );
    assert.equal(c.soilLedges, a.soilLedges, `${arm} and ${control} disagree about the soil band`);
  }
});

test('⚠ THE SEARCH REACHES ITS OWN CEILING, AND REFUSES PAST IT BY THE WHOLE MESSAGE', () => {
  // `maxAboveSea` is INCLUSIVE: a ceiling set exactly at the floor must still return the floor. The
  // mutation rung found `<=` → `<` survived every test above — none of them bounded the search.
  const floor = darkestShadedRock(SEA, VISIBLE_DELTA, EVERY_LEVEL);
  const atCeiling = darkestShadedRock(SEA, VISIBLE_DELTA, EVERY_LEVEL, floor.aboveSea);
  assert.deepEqual(atCeiling, floor, 'a ceiling equal to the floor excluded the floor — the bound is inclusive');
  // One luma under the floor there is no admissible rock, and the refusal names the sea, the bar
  // and the ceiling it searched to — pinned as the WHOLE message, because its arithmetic carries
  // mutants (`mutation-rung-scores-a-hang-as-unproven` §11).
  const ceiling = floor.aboveSea - 1;
  assert.throws(() => darkestShadedRock(SEA, VISIBLE_DELTA, EVERY_LEVEL, ceiling), {
    message:
      `stepped-skirt: no shaded rock within ${ceiling} luma of the sea ${toHex(SEA)} clears a ` +
      `${VISIBLE_DELTA}/255 bar on every rung — the sea leaves no headroom for a cliff base`,
  });
});
